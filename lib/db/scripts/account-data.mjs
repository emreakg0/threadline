// Operator-only account export and erasure. Run from a trusted maintenance shell.
import { writeFile } from "node:fs/promises";
import pg from "pg";

// Delete dependent rows first. Runs cascade to graphs and nodes after clearing
// progress, transitions and edges that reference those nodes.
const ownedTables = [
  "threadline_action_task_links",
  "threadline_plan_actions",
  "threadline_block_evidence",
  "threadline_knowledge_blocks",
  "threadline_relationships",
  "threadline_execution_events",
  "threadline_execution_steps",
  "threadline_action_thread_transitions",
  "threadline_action_thread_progress",
  "threadline_action_thread_edges",
  "threadline_runs",
  "threadline_source_revisions",
  "threadline_document_tags",
  "threadline_documents",
  "threadline_tags",
  "threadline_collections",
  "threadline_beta_grant",
  "focus_tasks",
  "focus_projects",
  "focus_sessions",
];
const cascadingTables = ["threadline_action_threads", "threadline_action_thread_nodes"];
const counterScope = `scope = 'user:' || $1 OR scope IN
  (SELECT 'project:' || id FROM focus_projects WHERE user_id=$1)`;

async function exportAccount(client, subject, account, file) {
  const data = { focus_users: [account] };
  for (const table of [...ownedTables, ...cascadingTables]) {
    if (table === "focus_sessions") continue;
    const { rows } = await client.query(
      `SELECT to_jsonb(t) - ARRAY['lease_token','idempotency_key'] AS record
         FROM ${table} t WHERE user_id=$1`, [subject]);
    data[table] = rows.map(row => row.record);
  }
  data.focus_city_counters = (await client.query(
    "SELECT * FROM focus_city_counters WHERE " + counterScope, [subject])).rows;
  await client.query("COMMIT");
  await writeFile(file, JSON.stringify(data, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}

async function deleteAccount(client, subject) {
  const running = await client.query(
    "SELECT 1 FROM threadline_runs WHERE user_id=$1 AND status='running' LIMIT 1", [subject]);
  if (running.rowCount) throw new Error("Reconcile the account’s running work before erasure.");
  await client.query("DELETE FROM focus_city_counters WHERE " + counterScope, [subject]);
  for (const table of ownedTables) {
    await client.query(`DELETE FROM ${table} WHERE user_id=$1`, [subject]);
  }
  await client.query("DELETE FROM focus_users WHERE id=$1", [subject]);
  await client.query("COMMIT");
}

const [operation, argument, ...extra] = process.argv.slice(2);
const subject = process.env.THREADLINE_ACCOUNT_SUBJECT;
const connectionString = process.env.DATABASE_URL;
const exportRequested = operation === "export" && Boolean(argument);
const deleteRequested = operation === "delete" && argument === "--confirm-delete";
if (!subject?.trim() || subject.length > 255 || !connectionString || extra.length ||
    (!exportRequested && !deleteRequested)) {
  console.error("Set DATABASE_URL and THREADLINE_ACCOUNT_SUBJECT. Use export <new-private-file> or delete --confirm-delete.");
  process.exitCode = 2;
} else {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
  try {
    await client.connect();
    await client.query(exportRequested ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
    await client.query("SET LOCAL lock_timeout = '3s'");
    const { rows } = await client.query(
      "SELECT * FROM focus_users WHERE id=$1" + (deleteRequested ? " FOR UPDATE" : ""), [subject]);
    if (!rows.length) {
      console.error("No matching account in the selected database.");
      process.exitCode = 1;
    } else if (exportRequested) {
      await exportAccount(client, subject, rows[0], argument);
      console.log("Account export written.");
    } else {
      await deleteAccount(client, subject);
      console.log("Account erased from the active database.");
    }
  } catch {
    console.error("Account operation failed. Verify database, migration level, file path and maintenance state.");
    process.exitCode = 1;
  } finally {
    // Closing the connection rolls back on any pre-commit error.
    await client.end();
  }
}
