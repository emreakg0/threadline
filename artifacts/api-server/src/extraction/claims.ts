import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { liveAccess, MODEL, tokenReservation, type Adapter } from "./gemini";
import { validateSource as validateThreadSource } from "../action-thread/contract";
import { transaction, appendEvent, reconcile, type Client } from "./lifecycle";
import { productionMode, productionPolicy } from "./production";
import { ExtractionError, formats, type SchemaVersion } from "./validation";
import {
  geminiUsage,
  projectDaily,
  userDaily,
  requestsPerMinute,
  tokensPerMinute,
} from "./quota";
export const LEASE_MS = 30000;
export type Claim = {
  id: string;
  schema_version: SchemaVersion;
  provider: Adapter["mode"];
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
  authorize?: (sourceId: string, version: SchemaVersion, user?: string) => void,
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
        `SELECT * FROM threadline_runs WHERE status='queued' AND provider=$1 AND ($1<>'gemini' OR (production_consented_at IS NOT NULL)=$3) AND ($2::uuid IS NULL OR id=$2) AND (lease_expires_at IS NULL OR lease_expires_at<=now()) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`,
        [mode, id ?? null, productionMode()],
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
    const stop = async (code: string, sourceStarted?: Date) => {
      let step: string | undefined;
      if (sourceStarted) {
        step = randomUUID();
        await c.query(
          `INSERT INTO threadline_execution_steps(id,user_id,run_id,step_key,attempt,status,started_at,completed_at,duration_ms,error_code)
           VALUES($1,$2,$3,'validate_source',$4,'failed',$5,clock_timestamp(),
           GREATEST(0,extract(epoch FROM(clock_timestamp()-$5::timestamptz))*1000)::bigint,$6)`,
          [step, r.user_id, r.id, attempt, sourceStarted, code],
        );
        await appendEvent(c, r.id, "step_failed", { key: "validate_source", code, attempt }, step);
      }
      await c.query(
        "UPDATE threadline_runs SET status='failed',completed_at=clock_timestamp(),error_code=$2 WHERE id=$1",
        [r.id, code],
      );
      await appendEvent(c, r.id, "failed", { code, outcome: "stopped", action: "Stopped before sending a provider request." }, step);
      return null;
    };
    const format = formats[r.schema_version as SchemaVersion];
    if (
      r.model !== MODEL ||
      !format ||
      r.pipeline_version !== format.pipeline ||
      r.prompt_version !== format.prompt ||
      (mode === "gemini" && r.schema_version === 1)
    )
      return stop("MODEL_CONFIG_CHANGED");
    if (attempt > (mode === "gemini" ? 1 : 2))
      return stop("ATTEMPTS_EXHAUSTED");
    if (
      mode === "mock" &&
      (
        await c.query(
          "SELECT 1 FROM threadline_runs WHERE provider='mock' AND error_code='QUOTA_EXHAUSTED' AND completed_at>now()-interval '24 hours' LIMIT 1",
        )
      ).rowCount
    )
      return stop("QUOTA_EXHAUSTED");

    const sourceStarted = (await c.query("SELECT clock_timestamp() AS started"))
      .rows[0].started;
    if (r.schema_version >= 2) {
      const document = (
        await c.query(
          "SELECT archived_at FROM threadline_documents WHERE id=$1 AND user_id=$2 FOR SHARE",
          [r.document_id, r.user_id],
        )
      ).rows[0];
      if (!document || document.archived_at) return stop("DOCUMENT_ARCHIVED", sourceStarted);
    }
    const source = (
      await c.query(
        "SELECT source_text FROM threadline_source_revisions WHERE id=$1 AND user_id=$2",
        [r.source_revision_id, r.user_id],
      )
    ).rows[0];
    const checkAccess = mode === "gemini" && r.schema_version === 3 ? liveAccess : authorize;
    try {
      checkAccess?.(r.source_revision_id, r.schema_version, r.user_id);
      if (mode === "gemini" && productionMode()) productionPolicy(r.user_id);
    } catch (error) {
      if (error instanceof ExtractionError) return stop(error.code);
      throw error;
    }
    try {
      if (r.schema_version === 3) validateThreadSource(source.source_text);
    } catch (error) {
      if (error instanceof ExtractionError) return stop(error.code, sourceStarted);
      throw error;
    }
    let reservation: number | null = null;
    if (mode === "gemini") {
      const policy = productionMode() ? productionPolicy(r.user_id)
        : { projectDaily, userDaily, requestsPerMinute, tokensPerMinute, enforceSpacing: true };
      reservation = tokenReservation(source.source_text, r.schema_version);
      if (reservation > policy.tokensPerMinute) return stop("SOURCE_TOO_LARGE", sourceStarted);
      const usage = await geminiUsage(c, r.user_id);
      if (usage.blocked) return stop("QUOTA_EXHAUSTED");
      if (usage.daily >= policy.projectDaily || usage.user_daily >= policy.userDaily)
        return stop("DAILY_QUOTA");
      if (
        (policy.enforceSpacing && !usage.spaced) ||
        usage.rpm >= policy.requestsPerMinute ||
        usage.tpm + reservation > policy.tokensPerMinute
      )
        return null;
    }
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
      "INSERT INTO threadline_execution_steps(id,user_id,run_id,step_key,attempt,status,started_at,input_summary,reserved_tokens) VALUES($1,$2,$3,'extract',$4,'running',clock_timestamp(),'Pinned source only',$5)",
      [step, r.user_id, r.id, attempt, reservation],
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
