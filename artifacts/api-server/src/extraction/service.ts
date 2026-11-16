import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { gemini, MODEL, type Adapter } from "./gemini";
import { validate, ExtractionError } from "./validation";
export async function extract(
  user: string,
  sourceId: string,
  key: string,
  adapter: Adapter = gemini,
) {
  const c = await pool.connect();
  let locked = false,
    run: string | undefined,
    step: string | undefined;
  let sequence = 0;
  let started = 0;
  const event = async (type: string, payload: object = {}) =>
    c.query(
      `INSERT INTO threadline_execution_events(id,user_id,run_id,sequence,event_type,payload) VALUES($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), user, run, ++sequence, type, payload],
    );
  try {
    const source = (
      await c.query(
        "SELECT * FROM threadline_source_revisions WHERE id=$1 AND user_id=$2",
        [sourceId, user],
      )
    ).rows[0];
    if (!source) throw new ExtractionError("SOURCE_NOT_FOUND", 404);
    if(source.source_text.length>20000)throw new ExtractionError('SOURCE_TOO_LARGE');
    const prior = (
      await c.query(
        "SELECT * FROM threadline_runs WHERE user_id=$1 AND idempotency_key=$2",
        [user, key],
      )
    ).rows[0];
    if (prior) {
      if (prior.source_revision_id !== sourceId)
        throw new ExtractionError("IDEMPOTENCY_CONFLICT", 409);
      return prior;
    }
    locked = (await c.query("SELECT pg_try_advisory_lock(72810382) AS locked"))
      .rows[0].locked;
    if (!locked) throw new ExtractionError("BUSY", 429);
    const again = (
      await c.query(
        "SELECT * FROM threadline_runs WHERE user_id=$1 AND idempotency_key=$2",
        [user, key],
      )
    ).rows[0];
    if (again) {
      if (again.source_revision_id !== sourceId)
        throw new ExtractionError("IDEMPOTENCY_CONFLICT", 409);
      return again;
    }
    const counts = (
      await c.query(
        `SELECT count(*)::int AS total,count(*) FILTER(WHERE user_id=$1)::int AS own FROM threadline_runs WHERE created_at>=(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`,
        [user],
      )
    ).rows[0];
    // Reserve two attempts per run: <=20 project / <=6 owner requests per UTC day.
    if (counts.total >= 10 || counts.own >= 3)
      throw new ExtractionError("DAILY_QUOTA", 429);
    const paused = (
      await c.query(
        "SELECT 1 FROM threadline_runs WHERE error_code='QUOTA_EXHAUSTED' AND completed_at>now()-interval '24 hours' LIMIT 1",
      )
    ).rowCount;
    if (paused) throw new ExtractionError("QUOTA_EXHAUSTED", 429);
    run = randomUUID();
    await c.query("BEGIN");
    await c.query(
      `INSERT INTO threadline_runs(id,user_id,source_revision_id,document_id,idempotency_key,status,pipeline_version,schema_version,provider,model,prompt_version,started_at) VALUES($1,$2,$3,$4,$5,'running','2b-1',1,$6,$7,'extractive-1',now())`,
      [run, user, sourceId, source.document_id, key, adapter.mode, MODEL],
    );
    await event("started", { mode: adapter.mode });
    await c.query("COMMIT");
    try {
      let raw = "";
      for (let attempt = 1; attempt <= 2; attempt++) {
        step = randomUUID();
        started = Date.now();
        await c.query("BEGIN");
        await c.query(
          `INSERT INTO threadline_execution_steps(id,user_id,run_id,step_key,attempt,status,started_at,input_summary) VALUES($1,$2,$3,'extract_validate',$4,'running',now(),'Pinned source revision')`,
          [step, user, run, attempt],
        );
        await event("step_started", { attempt });
        await c.query("COMMIT");
        try {
          raw = await adapter.generate(source.source_text);
          break;
        } catch (e) {
          const err =
            e instanceof ExtractionError
              ? e
              : new ExtractionError("PROVIDER_FAILURE", 502);
          await c.query("BEGIN");
          await c.query(
            "UPDATE threadline_execution_steps SET status='failed',completed_at=now(),duration_ms=$2,error_code=$3 WHERE id=$1",
            [step, Date.now() - started, err.code],
          );
          await event("step_failed", { code: err.code });
          if (attempt === 1 && err.code === "PROVIDER_TRANSIENT") {
            await event("retry_scheduled", { attempt: 2 });
            await c.query("COMMIT");
            await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
            continue;
          }
          await c.query("COMMIT");
          throw err;
        }
      }
      const blocks = validate(raw, source.source_text);
      await c.query("BEGIN");
      for (const [position, b] of blocks.entries()) {
        const id = randomUUID();
        await c.query(
          `INSERT INTO threadline_knowledge_blocks(id,user_id,document_id,originating_run_id,kind,position,content,uncertainty_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            id,
            user,
            source.document_id,
            run,
            b.kind,
            position,
            b.content,
            b.uncertainty_reason,
          ],
        );
        for (const e of b.evidence)
          await c.query(
            `INSERT INTO threadline_block_evidence(id,user_id,block_id,document_id,source_revision_id,quote,start_offset,end_offset) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              randomUUID(),
              user,
              id,
              source.document_id,
              sourceId,
              e.quote,
              e.start,
              e.end,
            ],
          );
      }
      await c.query(
        "UPDATE threadline_execution_steps SET status='succeeded',completed_at=now(),duration_ms=$2,output_summary=$3 WHERE id=$1",
        [step, Date.now() - started, `${blocks.length} validated blocks`],
      );
      await event("step_completed", { blocks: blocks.length });
      await c.query(
        "UPDATE threadline_runs SET status='succeeded',completed_at=now() WHERE id=$1",
        [run],
      );
      await event("completed");
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      const err =
        e instanceof ExtractionError
          ? e
          : new ExtractionError("STORAGE_OR_PROCESSING_FAILURE", 503);
      await c.query("BEGIN");
      if (step)
        await c.query(
          "UPDATE threadline_execution_steps SET status='failed',completed_at=now(),duration_ms=$2,error_code=$3 WHERE id=$1 AND status='running'",
          [step, Date.now() - started, err.code],
        );
      await c.query(
        "UPDATE threadline_runs SET status='failed',completed_at=now(),error_code=$2 WHERE id=$1",
        [run, err.code],
      );
      await event("failed", { code: err.code });
      await c.query("COMMIT");
    }
    return (
      await c.query(
        "SELECT * FROM threadline_runs WHERE id=$1 AND user_id=$2",
        [run, user],
      )
    ).rows[0];
  } finally {
    try {
      await c.query("ROLLBACK");
      if (locked) await c.query("SELECT pg_advisory_unlock(72810382)");
      c.release();
    } catch {
      c.release(true);
    }
  }
}
