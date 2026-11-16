import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { MODEL, type Adapter } from "./gemini";
import { transaction, appendEvent, reconcile, type Client } from "./lifecycle";
export const LEASE_MS = 30000;
export type Claim = {
  id: string;
  user_id: string;
  source_revision_id: string;
  document_id: string;
  lease_token: string;
  attempt: number;
  step: string;
  source: string;
};
export async function owned(c: Client, r: Claim) {
  return (
    await c.query(
      "SELECT id FROM threadline_runs WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>clock_timestamp() FOR UPDATE",
      [r.id, r.lease_token],
    )
  ).rowCount;
}
export async function claim(
  mode: Adapter["mode"],
  id?: string,
): Promise<Claim | null> {
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(72810382)");
    await reconcile(c);
    if (
      (
        await c.query(
          "SELECT 1 FROM threadline_runs WHERE status='running' OR (status='cancelled' AND lease_expires_at>now()) LIMIT 1",
        )
      ).rowCount
    )
      return null;
    const r = (
      await c.query(
        `SELECT * FROM threadline_runs WHERE status='queued' AND provider=$1 AND ($2::uuid IS NULL OR id=$2) AND (lease_expires_at IS NULL OR lease_expires_at<=now()) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`,
        [mode, id ?? null],
      )
    ).rows[0];
    if (!r) return null;
    const attempt =
      Number(
        (
          await c.query(
            "SELECT count(*) n FROM threadline_execution_steps WHERE run_id=$1 AND step_key='extract'",
            [r.id],
          )
        ).rows[0].n,
      ) + 1;
    if (
      attempt > 2 ||
      (
        await c.query(
          "SELECT 1 FROM threadline_runs WHERE error_code='QUOTA_EXHAUSTED' AND completed_at>now()-interval '24 hours' LIMIT 1",
        )
      ).rowCount
    ) {
      await c.query(
        "UPDATE threadline_runs SET status='failed',completed_at=clock_timestamp(),error_code=$2 WHERE id=$1",
        [r.id, attempt > 2 ? "ATTEMPTS_EXHAUSTED" : "QUOTA_EXHAUSTED"],
      );
      await appendEvent(c, r.id, "failed", {
        code: attempt > 2 ? "ATTEMPTS_EXHAUSTED" : "QUOTA_EXHAUSTED",
      });
      return null;
    }
    const dispatch = (
      await c.query(
        `SELECT count(*)::int total,count(*) FILTER(WHERE user_id=$1)::int own FROM threadline_execution_steps WHERE step_key='extract' AND started_at >= (date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`,
        [r.user_id],
      )
    ).rows[0];
    const blocked =
      dispatch.total >= 20 || dispatch.own >= 6
        ? "DAILY_QUOTA"
        : r.model !== MODEL ||
            r.schema_version !== 1 ||
            r.pipeline_version !== "2c-1" ||
            r.prompt_version !== "extractive-1"
          ? "MODEL_CONFIG_CHANGED"
          : null;
    if (blocked) {
      await c.query(
        "UPDATE threadline_runs SET status='failed',completed_at=clock_timestamp(),error_code=$2 WHERE id=$1",
        [r.id, blocked],
      );
      await appendEvent(c, r.id, "failed", { code: blocked });
      return null;
    }
    const sourceStarted = (await c.query("SELECT clock_timestamp() AS started"))
      .rows[0].started;
    const source = (
      await c.query(
        "SELECT source_text FROM threadline_source_revisions WHERE id=$1 AND user_id=$2",
        [r.source_revision_id, r.user_id],
      )
    ).rows[0];
    const token = randomUUID(),
      step = randomUUID();
    await c.query(
      "UPDATE threadline_runs SET status='running',started_at=COALESCE(started_at,now()),lease_token=$2,lease_expires_at=now()+interval '30 seconds',heartbeat_at=now(),error_code=NULL WHERE id=$1",
      [r.id, token],
    );
    await appendEvent(c, r.id, "started", { attempt });
    const validationStep = randomUUID();
    await c.query(
      "INSERT INTO threadline_execution_steps(id,user_id,run_id,step_key,attempt,status,started_at,completed_at,duration_ms,input_summary,output_summary) VALUES($1,$2,$3,'validate_source',$4,'succeeded',$5,clock_timestamp(),GREATEST(0,extract(epoch FROM(clock_timestamp()-$5::timestamptz))*1000)::bigint,'Pinned owner source','Source exists and immutable')",
      [validationStep, r.user_id, r.id, attempt, sourceStarted],
    );
    await appendEvent(
      c,
      r.id,
      "step_started",
      { key: "validate_source" },
      validationStep,
    );
    await appendEvent(
      c,
      r.id,
      "step_completed",
      { key: "validate_source" },
      validationStep,
    );
    await c.query(
      "INSERT INTO threadline_execution_steps(id,user_id,run_id,step_key,attempt,status,started_at,input_summary) VALUES($1,$2,$3,'extract',$4,'running',clock_timestamp(),'Pinned source only')",
      [step, r.user_id, r.id, attempt],
    );
    await appendEvent(
      c,
      r.id,
      "step_started",
      { key: "extract", attempt },
      step,
    );
    return {
      ...r,
      lease_token: token,
      attempt,
      step,
      source: source.source_text,
    };
  });
}
export async function heartbeat(r: Claim) {
  return (
    (
      await pool.query(
        "UPDATE threadline_runs SET heartbeat_at=now(),lease_expires_at=now()+interval '30 seconds' WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>now() RETURNING id",
        [r.id, r.lease_token],
      )
    ).rowCount === 1
  );
}
