// Runs only the built server on loopback with synthetic configuration and an isolated database schema.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { once } from "node:events";
import pg from "pg";
import { checkReleaseHttp } from "./release-http-check.mjs";

const schema = "release_test_" + randomUUID().replaceAll("-", "");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: "-c search_path=" + schema });
const before = new URL("../migrations/", import.meta.url);
const migrator = new URL("./migrate.mjs", import.meta.url);
const entry = new URL("../../../artifacts/api-server/dist/index.mjs", import.meta.url);
const env = {
  ...process.env, PGOPTIONS: "-c search_path=" + schema, NODE_ENV: "production",
  APP_ORIGIN: "https://threadline.example.invalid",
  GOOGLE_CLIENT_ID: "offline-oauth-client", GOOGLE_CLIENT_SECRET: "offline-oauth-fixture",
  THREADLINE_GEMINI_LIVE_AUTHORIZED: "false",
};
for (const name of Object.keys(env)) {
  if (name === "GEMINI_API_KEY" || name.startsWith("THREADLINE_PRODUCTION_")) delete env[name];
}
const origin = env.APP_ORIGIN;
let child;
try {
  await pool.query(`CREATE SCHEMA ${schema}`);
  const client = await pool.connect();
  const legacyRun = randomUUID();
  const source = randomUUID();
  const token = randomBytes(32).toString("hex");
  try {
    await client.query("BEGIN");
    await client.query("CREATE TABLE focus_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const file of (await readdir(before)).sort().filter((name) => /^00(?:0[1-9]|10)_.*\.sql$/.test(name))) {
      await client.query(await readFile(new URL(file, before), "utf8"));
      await client.query("INSERT INTO focus_migrations(name) VALUES($1)", [file.slice(0,-4)]);
    }
    const doc = randomUUID();
    await client.query("INSERT INTO focus_users VALUES('offline','Offline','offline@example.invalid')");
    await client.query("INSERT INTO threadline_documents(id,user_id,title) VALUES($1,'offline','Synthetic draft')", [doc]);
    await client.query("INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text) VALUES($1,'offline',$2,1,'Synthetic source')", [source, doc]);
    await client.query(`INSERT INTO threadline_runs
      (id,user_id,source_revision_id,document_id,idempotency_key,pipeline_version,schema_version,provider,model,prompt_version,status)
      VALUES($1,'offline',$2,$3,'stage4b_fixture','fixture',1,'mock','fixture','fixture','cancelled')`, [legacyRun, source, doc]);
    await client.query(`INSERT INTO threadline_execution_events(id,user_id,run_id,sequence,event_type)
      VALUES($1,'offline',$2,1,'cancelled')`, [randomUUID(), legacyRun]);
    await client.query("INSERT INTO focus_sessions VALUES($1,'offline',now()+interval '1 hour')",
      [createHash("sha256").update(token).digest("hex")]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
  const events = () => pool.query("SELECT * FROM threadline_execution_events WHERE run_id=$1 ORDER BY sequence", [legacyRun]);
  const originalEvents = (await events()).rows;
  assert.equal(originalEvents.length, 1);
  for (let attempt = 0; attempt < 2; attempt++) {
    const migration = spawnSync(process.execPath, [migrator.pathname], { env, encoding: "utf8", timeout: 30000 });
    assert.equal(migration.status, 0, migration.stderr);
  }
  assert.deepEqual((await events()).rows, originalEvents);
  const migrations = (await readdir(before)).filter(name => name.endsWith(".sql")).sort().map(name => name.slice(0, -4));
  const applied = (await pool.query("SELECT name FROM focus_migrations ORDER BY name")).rows.map(row => row.name);
  assert.deepEqual(applied, migrations);

  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  env.PORT = String(probe.address().port);
  await new Promise(resolve => probe.close(resolve));
  child = spawn(process.execPath, [entry.pathname], { env, stdio: "ignore" });
  const base = "http://127.0.0.1:" + env.PORT;
  const probeReady = async () => (await fetch(base + "/api/readyz", { signal: AbortSignal.timeout(750) })).ok;
  let ready = false;
  for (let index = 0; index < 40 && !ready; index++) {
    ready = await probeReady().catch(() => false);
    if (!ready) await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(ready, true);
  await checkReleaseHttp(base, origin);
  const availability = await fetch(base + "/api/action-threads/availability?source_revision_id=" + source,
    { headers: { cookie: "focus_session=" + token } });
  assert.equal(availability.status, 200);
  assert.equal((await availability.json()).enabled, false);
  const admission = await fetch(base + "/api/action-threads", {
    method: "POST",
    headers: { origin, cookie: "focus_session=" + token, "content-type": "application/json" },
    body: JSON.stringify({ source_revision_id: source, idempotency_key: randomUUID(), consent: true }),
  });
  assert.equal(admission.status, 503);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM threadline_runs")).rows[0].count, 1);
  const latest = migrations.at(-1);
  await pool.query("DELETE FROM focus_migrations WHERE name=$1", [latest]);
  assert.equal((await fetch(base + "/api/healthz")).status, 200);
  assert.equal((await fetch(base + "/api/readyz")).status, 503);
  console.log("PASS: all migrations, pre-0011 trace preservation, release HTTP checks, readiness downgrade and AI closed by default");
} finally {
  if (child?.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    const stop = setTimeout(() => child.kill("SIGKILL"), 25000);
    await once(child, "exit");
    clearTimeout(stop);
  }
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.end();
}
