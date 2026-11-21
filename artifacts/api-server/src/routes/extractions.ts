import { productionMode } from "../extraction/production";
import { Router } from "express";
import { pool } from "@workspace/db";
import { appendEvent, cancel, transaction } from "../extraction/lifecycle";
import { activeBetaGrant } from "../extraction/beta";
import { liveAccess } from "../extraction/gemini";
import { extract } from "../extraction/service";
import { ExtractionError } from "../extraction/validation";
export const validId = (id: unknown): id is string =>
  typeof id === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export const validIdempotencyKey = (key: unknown): key is string =>
  typeof key === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(key);
// The run history is user-visible; dispatch credentials and grant accounting are server-only.
function publicRun({
  lease_token,
  consent_grant_id,
  beta_dispatched_at,
  production_consented_at,
  production_dispatched_at,
  ...run
}: Record<string, unknown>) {
  return run;
}
export function planningAdmission(
  providerCheck: (sourceId?: string, version?: 2, user?: string) => void,
  mode: "gemini" | "mock",
) {
  const router = Router();
  router.post("/", async (req, res) => {
    const b = req.body;
    if (
      !b ||
      typeof b !== "object" ||
      Array.isArray(b) ||
      Object.keys(b).some(
        (key) =>
          ![
            "idempotency_key",
            "source_revision_id",
            "schema_version",
            "consent",
          ].includes(key),
      ) ||
      (b.schema_version !== undefined &&
        b.schema_version !== 1 &&
        b.schema_version !== 2) ||
      !validId(b.source_revision_id) ||
      !validIdempotencyKey(b.idempotency_key)
    ) {
      res.status(400).json({ error: "Invalid extraction request" });
      return;
    }
    try {
      const production = mode === "gemini" && productionMode();
      providerCheck(b.source_revision_id, 2, res.locals.userId);
      if (b.consent !== true)
        throw new ExtractionError("CONSENT_REQUIRED", 400);
      const grant = production ? undefined : await activeBetaGrant(res.locals.userId);
      if (b.schema_version === 1)
        throw new ExtractionError("PLANNING_SCHEMA_REQUIRED", 400);
      const run = await extract(
        res.locals.userId,
        b.source_revision_id,
        b.idempotency_key,
        mode,
        2,
        grant,
        production,
      );
      res.status(202).json(publicRun(run));
    } catch (e) {
      if (e instanceof ExtractionError) {
        res.status(e.status).json({ error: e.code });
        return;
      }
      throw e;
    }
  });
  router.get("/availability", async (req, res) => {
    if (
      req.query.source_revision_id !== undefined &&
      !validId(req.query.source_revision_id)
    ) {
      res.status(400).json({ error: "Invalid source revision ID" });
      return;
    }
    try {
      providerCheck(req.query.source_revision_id as string | undefined, 2, res.locals.userId);
      if (mode === "mock" || !productionMode()) await activeBetaGrant(res.locals.userId);
      res.json({ enabled: true });
    } catch (e) {
      if (!(e instanceof ExtractionError)) throw e;
      res.json({ enabled: false, reason: e.code });
    }
  });
  return router;
}
const router = Router();
router.use(planningAdmission(liveAccess, "gemini"));
router.get("/:id/progress", async (req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).json({ error: "Invalid run ID" });
    return;
  }
  const result = await pool.query(
    `SELECT r.status,r.provider,r.error_code,r.document_id,r.schema_version,
      CASE WHEN r.status='running' AND e.event_type='step_started' THEN e.payload->>'key' END AS stage
     FROM threadline_runs r
     LEFT JOIN LATERAL (SELECT event_type,payload FROM threadline_execution_events
       WHERE run_id=r.id AND user_id=r.user_id ORDER BY sequence DESC LIMIT 1) e ON true
     WHERE r.id=$1 AND r.user_id=$2 AND r.schema_version IN (2,3)`,
    [req.params.id, res.locals.userId],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(result.rows[0]);
});
export function cursor(v: unknown) {
  if (v === undefined) return 0;
  if (
    typeof v !== "string" ||
    !/^\d+$/.test(v) ||
    !Number.isSafeInteger(Number(v))
  )
    return null;
  return Number(v);
}
router.get("/", async (req, res) => {
  const offset = cursor(req.query.offset);
  if (
    offset === null ||
    offset > 100000 ||
    (req.query.source_revision_id !== undefined &&
      !validId(req.query.source_revision_id))
  ) {
    res.status(400).json({ error: "Invalid history filter" });
    return;
  }
  const rows = (
    await pool.query(
      `SELECT * FROM threadline_runs WHERE user_id=$1 AND ($2::uuid IS NULL OR source_revision_id=$2) ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET $3`,
      [res.locals.userId, req.query.source_revision_id ?? null, offset],
    )
  ).rows;
  res.json({
    runs: rows.slice(0, 50).map(publicRun),
    next_offset: rows.length > 50 ? offset + 50 : null,
  });
});
router.post("/:id/cancel", async (req, res) => {
  if (!validId(req.params.id)) {
    res.status(400).json({ error: "Invalid run ID" });
    return;
  }
  const run = await cancel(res.locals.userId, String(req.params.id));
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(publicRun(run));
});
// This records the navigation choice only. Manual actions are saved separately.
router.post("/:id/recovery/manual", async (req, res) => {
  const id = req.params.id;
  if (!validId(id)) {
    res.status(400).json({ error: "Invalid run ID" });
    return;
  }
  const status = await transaction(async (c) => {
    const run = (await c.query(
      `SELECT r.status, d.archived_at FROM threadline_runs r
       JOIN threadline_documents d ON d.id=r.document_id AND d.user_id=r.user_id
       WHERE r.id=$1 AND r.user_id=$2 FOR UPDATE OF r`,
      [id, res.locals.userId],
    )).rows[0];
    if (!run) return 404;
    if (run.archived_at || !["failed", "interrupted", "cancelled"].includes(run.status)) return 409;
    const selected = await c.query(
      "SELECT 1 FROM threadline_execution_events WHERE run_id=$1 AND event_type='alternative_selected'",
      [id],
    );
    if (!selected.rowCount) await appendEvent(c, id, "alternative_selected", {
      outcome: "manual_selected",
      action: "The owner selected manual planning.",
    });
    return 204;
  });
  res.sendStatus(status);
});
router.get("/:id/events", async (req, res) => {
  const since = cursor(req.query.since_sequence);
  if (!validId(req.params.id) || since === null) {
    res.status(400).json({ error: "Invalid event cursor" });
    return;
  }
  if (
    !(
      await pool.query(
        "SELECT id FROM threadline_runs WHERE id=$1 AND user_id=$2",
        [req.params.id, res.locals.userId],
      )
    ).rowCount
  ) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  const rows = (
    await pool.query(
      "SELECT * FROM threadline_execution_events WHERE run_id=$1 AND user_id=$2 AND sequence>$3 ORDER BY sequence LIMIT 101",
      [req.params.id, res.locals.userId, since],
    )
  ).rows;
  const events = rows.slice(0, 100);
  res.json({
    events,
    next_sequence: events.length
      ? Number(events[events.length - 1].sequence)
      : since,
    has_more: rows.length > 100,
  });
});
router.get("/:id/steps", async (req, res) => {
  const offset = cursor(req.query.offset);
  if (!validId(req.params.id) || offset === null || offset > 100000) {
    res.status(400).json({ error: "Invalid step offset" });
    return;
  }
  if (
    !(
      await pool.query(
        "SELECT id FROM threadline_runs WHERE id=$1 AND user_id=$2",
        [req.params.id, res.locals.userId],
      )
    ).rowCount
  ) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  const rows = (
    await pool.query(
      "SELECT * FROM threadline_execution_steps WHERE run_id=$1 AND user_id=$2 ORDER BY started_at,id LIMIT 51 OFFSET $3",
      [req.params.id, res.locals.userId, offset],
    )
  ).rows;
  res.json({
    steps: rows.slice(0, 50),
    next_offset: rows.length > 50 ? offset + 50 : null,
  });
});
router.get("/:id", async (req, res) => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(req.params.id),
    )
  ) {
    res.status(400).json({ error: "Invalid run ID" });
    return;
  }
  const run = (
    await pool.query(
      `SELECT r.*, s.revision AS source_revision, d.archived_at IS NOT NULL AS source_archived
        FROM threadline_runs r JOIN threadline_source_revisions s
          ON s.id=r.source_revision_id AND s.user_id=r.user_id
        JOIN threadline_documents d ON d.id=r.document_id AND d.user_id=r.user_id
        WHERE r.id=$1 AND r.user_id=$2`,
      [req.params.id, res.locals.userId],
    )
  ).rows[0];
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  const blocks = (
    await pool.query(
      `SELECT b.*,COALESCE((SELECT json_agg(e) FROM threadline_block_evidence e WHERE e.block_id=b.id AND e.user_id=b.user_id),'[]') AS evidence FROM threadline_knowledge_blocks b WHERE originating_run_id=$1 AND user_id=$2 ORDER BY position`,
      [run.id, res.locals.userId],
    )
  ).rows;
  res.json({ run: publicRun(run), blocks });
});
export default router;
