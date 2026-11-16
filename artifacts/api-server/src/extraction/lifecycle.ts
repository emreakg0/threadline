import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import type { PoolClient } from "@workspace/db";
export type Client = PoolClient;
export async function transaction<T>(
  work: (c: Client) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      "SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='5s'",
    );
    const result = await work(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
// Every writer holds the parent run lock until its state/event transaction commits.
export async function appendEvent(
  c: Client,
  id: string,
  type: string,
  payload: object = {},
  step?: string,
) {
  const run = (
    await c.query(
      "SELECT user_id FROM threadline_runs WHERE id=$1 FOR UPDATE",
      [id],
    )
  ).rows[0];
  if (!run) throw Error("Missing run");
  await c.query(
    `INSERT INTO threadline_execution_events(id,user_id,run_id,step_id,sequence,event_type,payload,observed_at)
 SELECT $1,$2,$3,$4,COALESCE(max(sequence),0)+1,$5,$6,clock_timestamp() FROM threadline_execution_events WHERE run_id=$3`,
    [randomUUID(), run.user_id, id, step ?? null, type, payload],
  );
}
export async function reconcile(c: Client) {
  const expired = (
    await c.query(
      `SELECT id FROM threadline_runs WHERE status='running' AND (lease_expires_at IS NULL OR lease_expires_at<=now()) ORDER BY created_at,id LIMIT 50 FOR UPDATE SKIP LOCKED`,
    )
  ).rows;
  for (const r of expired) {
    await c.query(
      `UPDATE threadline_execution_steps SET status='interrupted',completed_at=clock_timestamp(),duration_ms=GREATEST(0,extract(epoch FROM(clock_timestamp()-started_at))*1000)::bigint,error_code='LEASE_EXPIRED',recovery_action='Stop; provider outcome uncertain, no automatic resend' WHERE run_id=$1 AND status='running'`,
      [r.id],
    );
    await c.query(
      `UPDATE threadline_runs SET status='interrupted',completed_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL,error_code='OUTCOME_UNCERTAIN' WHERE id=$1`,
      [r.id],
    );
    await appendEvent(c, r.id, "interrupted", { code: "LEASE_EXPIRED" });
    await appendEvent(c, r.id, "recovered", {
      action: "Stopped without resending uncertain provider request",
    });
  }
  return expired.length;
}
export async function recoverExpired() {
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(72810382)");
    return reconcile(c);
  });
}
export async function cancel(user: string, id: string) {
  return transaction(async (c) => {
    const run = (
      await c.query(
        "SELECT * FROM threadline_runs WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [id, user],
      )
    ).rows[0];
    if (!run) return null;
    if (["queued", "running"].includes(run.status)) {
      await c.query(
        `UPDATE threadline_execution_steps SET status='cancelled',completed_at=clock_timestamp(),duration_ms=GREATEST(0,extract(epoch FROM(clock_timestamp()-started_at))*1000)::bigint WHERE run_id=$1 AND status='running'`,
        [id],
      );
      await c.query(
        `UPDATE threadline_runs SET status='cancelled',completed_at=clock_timestamp() WHERE id=$1`,
        [id],
      );
      await appendEvent(c, id, "cancelled", {
        action: "Discard late output; cancellation cannot undo provider work",
      });
    }
    return (await c.query("SELECT * FROM threadline_runs WHERE id=$1", [id]))
      .rows[0];
  });
}
