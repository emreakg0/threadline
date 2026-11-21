import { logger } from "../lib/logger";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import {
  gemini,
  liveAccess,
  ProviderRequestError,
  ProviderQuotaError,
  type Adapter,
} from "./gemini";
import { validate, ExtractionError, type Block } from "./validation";
import type { ActionThread } from "../action-thread/contract";
import { validateActionThread } from "../action-thread/graph";
import { persistActionThread } from "../action-thread/store";
import {
  transaction,
  appendEvent,
  recoverExpired,
  type Client,
} from "./lifecycle";
import { claim, heartbeat, owned, type Claim } from "./claims";
import { nextPacificMidnight } from "./quota";
export { claim, heartbeat } from "./claims";
async function requireActivePlanSource(c: Client, r: Claim) {
  if (r.schema_version < 2) return;
  const document = (
    await c.query(
      "SELECT archived_at FROM threadline_documents WHERE id=$1 AND user_id=$2 FOR SHARE",
      [r.document_id, r.user_id],
    )
  ).rows[0];
  if (!document || document.archived_at)
    throw new ExtractionError("DOCUMENT_ARCHIVED", 409);
}
async function endStep(c: Client, r: Claim, status: string, code?: string) {
  const updated = await c.query(
    `UPDATE threadline_execution_steps SET status=$2,completed_at=clock_timestamp(),duration_ms=GREATEST(0,extract(epoch FROM(clock_timestamp()-started_at))*1000)::bigint,error_code=$3 WHERE id=$1 AND status='running' RETURNING step_key`,
    [r.step, status, code ?? null],
  );
  const key = updated.rows[0]?.step_key as string | undefined;
  if (key)
    await appendEvent(
      c,
      r.id,
      status === "succeeded" ? "step_completed" : "step_failed",
      { key, code: code ?? null },
      r.step,
    );
  return key;
}
async function startStep(r: Claim, key: string) {
  await transaction(async (c) => {
    if (!(await owned(c, r))) throw new ExtractionError("STALE_LEASE");
    r.step = randomUUID();
    await c.query(
      "INSERT INTO threadline_execution_steps(id,user_id,run_id,step_key,attempt,status,started_at) VALUES($1,$2,$3,$4,$5,'running',clock_timestamp())",
      [r.step, r.user_id, r.id, key, r.attempt],
    );
    await appendEvent(c, r.id, "step_started", { key }, r.step);
  });
}
export async function finish(r: Claim, result: Block[] | ActionThread, onRollback?: () => void) {
  return transaction(async (c) => {
    if (!(await owned(c, r))) return false;
    await requireActivePlanSource(c, r);
    const step = r.step;
    const blocks = Array.isArray(result) ? result : null;
    if (Array.isArray(result)) {
      if (r.schema_version === 3) throw new ExtractionError("MODEL_CONFIG_CHANGED");
    } else {
      if (r.schema_version !== 3) throw new ExtractionError("MODEL_CONFIG_CHANGED");
      await persistActionThread(c, r, result);
    }
    for (const [position, b] of (blocks ?? []).entries()) {
      const id = randomUUID();
      await c.query(
        `INSERT INTO threadline_knowledge_blocks(id,user_id,document_id,originating_run_id,kind,position,content,uncertainty_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          r.user_id,
          r.document_id,
          r.id,
          b.kind,
          position,
          b.content,
          b.uncertainty_reason,
        ],
      );
      if (b.proposal)
        await c.query(
          `INSERT INTO threadline_plan_actions(block_id,document_id,user_id,source_revision_id,proposal,schedule)
           VALUES($1,$2,$3,$4,$5,$6)`,
          [
            id,
            r.document_id,
            r.user_id,
            r.source_revision_id,
            { title: b.content, ...b.proposal },
            b.proposal.deadline_phrase ? "unresolved" : "unscheduled",
          ],
        );
      for (const e of b.evidence)
        await c.query(
          `INSERT INTO threadline_block_evidence(id,user_id,block_id,document_id,source_revision_id,quote,start_offset,end_offset) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            randomUUID(),
            r.user_id,
            id,
            r.document_id,
            r.source_revision_id,
            e.quote,
            e.start,
            e.end,
          ],
        );
    }
    await c.query(
      "UPDATE threadline_execution_steps SET status='succeeded',completed_at=clock_timestamp(),duration_ms=GREATEST(0,extract(epoch FROM(clock_timestamp()-started_at))*1000)::bigint,output_summary=$2 WHERE id=$1",
      [step, blocks ? `${blocks.length} review blocks` : "Validated Action Thread"],
    );
    await appendEvent(
      c,
      r.id,
      "step_completed",
      blocks ? { key: "persist", blocks: blocks.length } : { key: "persist", schema_version: 3 },
      step,
    );
    await c.query(
      "UPDATE threadline_runs SET status='succeeded',completed_at=now(),lease_token=NULL,lease_expires_at=NULL WHERE id=$1",
      [r.id],
    );
    await appendEvent(c, r.id, "completed");
    return true;
  }, onRollback);
}
export async function fail(r: Claim, error: unknown, rolledBack = false) {
  return transaction(async (c) => {
    let blockedUntil: Date | undefined;
    if (r.provider === "gemini" && error instanceof ProviderQuotaError) {
      // A provider refusal applies to the project even if this run was cancelled.
      await c.query("SELECT pg_advisory_xact_lock(72810382)");
      const cooldown = await c.query(
        `UPDATE threadline_runs SET provider_blocked_until=GREATEST(
          provider_blocked_until, ${nextPacificMidnight},
          clock_timestamp()+$2::int * interval '1 second') WHERE id=$1 RETURNING provider_blocked_until`,
        [r.id, error.retryAfterSeconds],
      );
      blockedUntil = cooldown.rows[0]?.provider_blocked_until;
    }
    if (!(await owned(c, r))) return false;
    const code =
      error instanceof ExtractionError
        ? error.code
        : "STORAGE_OR_PROCESSING_FAILURE";
    const stage = await endStep(c, r, "failed", code);
    const retry =
      r.provider === "mock" && code === "PROVIDER_TRANSIENT" && r.attempt < 2;
    await c.query(
      `UPDATE threadline_runs SET status=$2,error_code=$3,completed_at=CASE WHEN $2='queued' THEN NULL ELSE now() END,lease_token=NULL,lease_expires_at=CASE WHEN $2='queued' THEN now()+interval '1 second' ELSE NULL END WHERE id=$1`,
      [r.id, retry ? "queued" : "failed", code],
    );
    await appendEvent(c, r.id, retry ? "retry_scheduled" : "failed", {
      code,
      attempt: r.attempt,
      action: retry ? "One bounded mock retry scheduled after 1 second."
        : stage === "validate_output" ? "Rejected the output and stopped before saving it."
        : "Stopped this run.",
      outcome: retry ? "scheduled" : "stopped",
      ...(blockedUntil ? { retry_at: blockedUntil.toISOString() } : {}),
    }, r.step);
    if (rolledBack) await appendEvent(c, r.id, "recovered", {
      outcome: "rolled_back",
      action: "PostgreSQL rolled back the output transaction.",
    }, r.step);
    else if (!retry && ["PROVIDER_TIMEOUT", "PROVIDER_NETWORK"].includes(code))
      await appendEvent(c, r.id, "recovered", {
        outcome: "uncertain",
        action: "Stopped without automatically resending. The external outcome is uncertain.",
      }, r.step);
    return true;
  });
}
export async function processOne(adapter: Adapter = gemini, id?: string) {
  const r = await claim(
    adapter.mode,
    id,
    adapter.mode === "gemini" ? liveAccess : undefined,
  );
  if (!r) return false;
  const controller = new AbortController();
  const timer = setInterval(() => {
    void heartbeat(r)
      .then((ok) => {
        if (!ok) controller.abort();
      })
      .catch(() => controller.abort());
  }, 5000);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortListener: () => void = () => {};
  let rolledBack = false;
  try {
    if (adapter.mode === "gemini") liveAccess(r.source_revision_id, r.schema_version);
    await transaction(async (c) => {
      if (!(await owned(c, r))) throw new ExtractionError("STALE_LEASE");
      await requireActivePlanSource(c, r);
    });
    controller.signal.throwIfAborted();
    const aborted = new Promise<never>((_, reject) => {
      abortListener = () =>
        reject(new ExtractionError("PROVIDER_TIMEOUT", 504));
      controller.signal.addEventListener("abort", abortListener, {
        once: true,
      });
    });
    timeout = setTimeout(() => controller.abort(), 12000);
    const raw = await Promise.race([
      adapter.generate(
        r.source,
        controller.signal,
        r.schema_version,
        r.source_revision_id,
        r,
      ),
      aborted,
    ]);
    clearTimeout(timeout);
    controller.signal.removeEventListener("abort", abortListener);
    await transaction(async (c) => {
      if (!(await owned(c, r))) throw new ExtractionError("STALE_LEASE");
      await endStep(c, r, "succeeded");
    });
    await startStep(r, "validate_output");
    const result = r.schema_version === 3
      ? validateActionThread(raw, r.source)
      : validate(raw, r.source, r.schema_version);
    await transaction(async (c) => {
      if (!(await owned(c, r))) throw new ExtractionError("STALE_LEASE");
      await endStep(c, r, "succeeded");
    });
    await startStep(r, "persist");
    await finish(r, result, () => { rolledBack = true; });
  } catch (e) {
    if (e instanceof ProviderRequestError)
      logger.warn(
        { runId: r.id, diagnostic: e.diagnostic },
        "Gemini request rejected",
      );
    await fail(r, e, rolledBack);
  } finally {
    clearInterval(timer);
    clearTimeout(timeout);
    controller.signal.removeEventListener("abort", abortListener);
    await pool.query(
      "UPDATE threadline_runs SET lease_token=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_token=$2 AND status='cancelled'",
      [r.id, r.lease_token],
    );
  }
  return true;
}
export function startWorker() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> = Promise.resolve();
  const tick = async () => {
    try {
      await recoverExpired();
      if (!stopped) await processOne();
    } catch {
      /* Leave durable state for the next reconciliation; never log content. */
    } finally {
      if (!stopped)
        timer = setTimeout(() => {
          active = tick();
        }, 1000);
    }
  };
  active = tick();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await active;
  };
}
