import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { gemini, liveAccess, ProviderQuotaError, type Adapter } from "./gemini";
import { validate, ExtractionError, type Block } from "./validation";
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
  if (r.schema_version !== 2) return;
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
  if (updated.rowCount)
    await appendEvent(
      c,
      r.id,
      status === "succeeded" ? "step_completed" : "step_failed",
      { key: updated.rows[0].step_key, code: code ?? null },
      r.step,
    );
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
export async function finish(r: Claim, blocks: Block[]) {
  return transaction(async (c) => {
    if (!(await owned(c, r))) return false;
    await requireActivePlanSource(c, r);
    const step = r.step;
    for (const [position, b] of blocks.entries()) {
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
      [step, `${blocks.length} review blocks`],
    );
    await appendEvent(
      c,
      r.id,
      "step_completed",
      { key: "persist", blocks: blocks.length },
      step,
    );
    await c.query(
      "UPDATE threadline_runs SET status='succeeded',completed_at=now(),lease_token=NULL,lease_expires_at=NULL WHERE id=$1",
      [r.id],
    );
    await appendEvent(c, r.id, "completed");
    return true;
  });
}
export async function fail(r: Claim, error: unknown) {
  return transaction(async (c) => {
    if (r.provider === "gemini" && error instanceof ProviderQuotaError) {
      // A provider refusal applies to the project even if this run was cancelled.
      await c.query("SELECT pg_advisory_xact_lock(72810382)");
      await c.query(
        `UPDATE threadline_runs SET provider_blocked_until=GREATEST(
          provider_blocked_until, ${nextPacificMidnight},
          clock_timestamp()+$2::int * interval '1 second') WHERE id=$1`,
        [r.id, error.retryAfterSeconds],
      );
    }
    if (!(await owned(c, r))) return false;
    const code =
      error instanceof ExtractionError
        ? error.code
        : "STORAGE_OR_PROCESSING_FAILURE";
    await endStep(c, r, "failed", code);
    const retry =
      r.provider === "mock" && code === "PROVIDER_TRANSIENT" && r.attempt < 2;
    await c.query(
      `UPDATE threadline_runs SET status=$2,error_code=$3,completed_at=CASE WHEN $2='queued' THEN NULL ELSE now() END,lease_token=NULL,lease_expires_at=CASE WHEN $2='queued' THEN now()+interval '1 second' ELSE NULL END WHERE id=$1`,
      [r.id, retry ? "queued" : "failed", code],
    );
    await appendEvent(c, r.id, retry ? "retry_scheduled" : "failed", {
      code,
      attempt: r.attempt,
      action: retry ? "One bounded retry after 1 second" : "Stop",
    });
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
  try {
    if (adapter.mode === "gemini") liveAccess(r.source_revision_id);
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
    const blocks = validate(raw, r.source, r.schema_version);
    await transaction(async (c) => {
      if (!(await owned(c, r))) throw new ExtractionError("STALE_LEASE");
      await endStep(c, r, "succeeded");
    });
    await startStep(r, "persist");
    await finish(r, blocks);
  } catch (e) {
    await fail(r, e);
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
