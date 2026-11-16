import { randomUUID } from "node:crypto";
import { MODEL, type Adapter } from "./gemini";
import { ExtractionError } from "./validation";
import { transaction, appendEvent } from "./lifecycle";
// Creation acknowledges only durable queued state. No provider work in the request.
export async function extract(
  user: string,
  sourceId: string,
  key: string,
  mode: Adapter["mode"] = "gemini",
) {
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(72810382)");
    const source = (
      await c.query(
        "SELECT * FROM threadline_source_revisions WHERE id=$1 AND user_id=$2",
        [sourceId, user],
      )
    ).rows[0];
    if (!source) throw new ExtractionError("SOURCE_NOT_FOUND", 404);
    if (source.source_text.length > 20000)
      throw new ExtractionError("SOURCE_TOO_LARGE");
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
    const counts = (
      await c.query(
        `SELECT count(*)::int total,count(*) FILTER(WHERE user_id=$1)::int own FROM threadline_runs WHERE created_at >= (date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`,
        [user],
      )
    ).rows[0];
    if (counts.total >= 10 || counts.own >= 3)
      throw new ExtractionError("DAILY_QUOTA", 429);
    if (
      (
        await c.query(
          "SELECT 1 FROM threadline_runs WHERE error_code='QUOTA_EXHAUSTED' AND completed_at>now()-interval '24 hours' LIMIT 1",
        )
      ).rowCount
    )
      throw new ExtractionError("QUOTA_EXHAUSTED", 429);
    const run = (
      await c.query(
        `INSERT INTO threadline_runs(id,user_id,source_revision_id,document_id,idempotency_key,pipeline_version,schema_version,provider,model,prompt_version) VALUES($1,$2,$3,$4,$5,'2c-1',1,$6,$7,'extractive-1') RETURNING *`,
        [randomUUID(), user, sourceId, source.document_id, key, mode, MODEL],
      )
    ).rows[0];
    await appendEvent(c, run.id, "queued", {
      source_revision_id: sourceId,
      provider: mode,
    });
    return run;
  });
}
