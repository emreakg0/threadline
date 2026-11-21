import { randomUUID } from "node:crypto";
import { activeBetaGrant, requireThreadEvaluationCapacity } from "./beta";
import { productionMode, productionPolicy } from "./production";
import { MODEL, type Adapter } from "./gemini";
import { ExtractionError, formats, type SchemaVersion } from "./validation";
import { transaction, appendEvent } from "./lifecycle";
import { validateSource as validateThreadSource } from "../action-thread/contract";
import {
  geminiUsage,
  projectDaily,
  userDaily,
  projectQueue,
  userQueue,
} from "./quota";
// Creation acknowledges only durable queued state. No provider work in the request.
export async function extract(
  user: string,
  sourceId: string,
  key: string,
  mode: Adapter["mode"] = "gemini",
  version: SchemaVersion = 1,
  consentGrantId?: string,
  productionConsent = false,
) {
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(72810382)");
    const production = mode === "gemini" && productionMode();
    const policy = production ? productionPolicy(user) : { projectDaily, userDaily, projectQueue, userQueue };
    if (production && (!productionConsent || consentGrantId || version === 1))
      throw new ExtractionError("PRODUCTION_AI_CONSENT", 403);
    const source = (
      await c.query(
        "SELECT * FROM threadline_source_revisions WHERE id=$1 AND user_id=$2",
        [sourceId, user],
      )
    ).rows[0];
    if (!source) throw new ExtractionError("SOURCE_NOT_FOUND", 404);
    if (version >= 2) {
      const doc = (
        await c.query(
          "SELECT archived_at FROM threadline_documents WHERE id=$1 AND user_id=$2 FOR SHARE",
          [source.document_id, user],
        )
      ).rows[0];
      if (doc.archived_at) throw new ExtractionError("DOCUMENT_ARCHIVED", 409);
    }
    if (source.source_text.length > 20000)
      throw new ExtractionError("SOURCE_TOO_LARGE");
    if (version === 3) validateThreadSource(source.source_text);
    const prior = (
      await c.query(
        "SELECT * FROM threadline_runs WHERE user_id=$1 AND idempotency_key=$2",
        [user, key],
      )
    ).rows[0];
    if (prior) {
      if (
        prior.source_revision_id !== sourceId ||
        prior.schema_version !== version ||
        prior.provider !== mode ||
        (mode === "gemini" && !!prior.production_consented_at !== production)
      )
        throw new ExtractionError("IDEMPOTENCY_CONFLICT", 409);
      return prior;
    }
    if (mode === "gemini" || version === 3) {
      // A revision is submitted once, including failed or interrupted outcomes.
      const existing = (
        await c.query(
          `SELECT * FROM threadline_runs WHERE user_id=$1 AND source_revision_id=$2
            AND provider=$3 AND model=$4 AND pipeline_version=$5 AND schema_version=$6
            ORDER BY created_at,id LIMIT 1`,
          [user, sourceId, mode, MODEL, formats[version].pipeline, version],
        )
      ).rows[0];
      if (existing) {
        if (version === 3 || !!existing.production_consented_at !== production) throw new ExtractionError("THREAD_REQUEST_EXISTS", 409);
        return existing;
      }
    }

    if (mode === "gemini") {
      if (version === 3 && !production) {
        if (await activeBetaGrant(user, { client: c }) !== consentGrantId)
          throw new ExtractionError("BETA_UNAVAILABLE", 403);
        await requireThreadEvaluationCapacity(c);
      }
      const usage = await geminiUsage(c, user);
      if (usage.blocked) throw new ExtractionError("QUOTA_EXHAUSTED", 429);
      const queued = (
        await c.query(
          `SELECT count(*)::int total,count(*) FILTER(WHERE user_id=$1)::int own
            FROM threadline_runs WHERE provider='gemini' AND model=$2 AND status='queued'`,
          [user, MODEL],
        )
      ).rows[0];
      if (
        usage.daily + queued.total >= policy.projectDaily ||
        usage.user_daily + queued.own >= policy.userDaily
      )
        throw new ExtractionError("DAILY_QUOTA", 429);
      if (queued.total >= policy.projectQueue || queued.own >= policy.userQueue)
        throw new ExtractionError("QUEUE_FULL", 429);
    }
    const run = (
      await c.query(
        `INSERT INTO threadline_runs(id,user_id,source_revision_id,document_id,idempotency_key,pipeline_version,schema_version,provider,model,prompt_version,consent_grant_id,production_consented_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CASE WHEN $12 THEN clock_timestamp() END) RETURNING *`,
        [
          randomUUID(),
          user,
          sourceId,
          source.document_id,
          key,
          formats[version].pipeline,
          version,
          mode,
          MODEL,
          formats[version].prompt,
          consentGrantId ?? null,
          production,
        ],
      )
    ).rows[0];
    await appendEvent(c, run.id, "queued", {
      source_revision_id: sourceId,
      provider: mode,
    });
    return run;
  });
}
