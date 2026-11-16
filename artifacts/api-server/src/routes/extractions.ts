import { Router } from "express";
import { pool } from "@workspace/db";
import { cancel } from "../extraction/lifecycle";
import { extract } from "../extraction/service";
import { ExtractionError } from "../extraction/validation";
const router = Router();
router.post("/", async (req, res) => {
  const b = req.body;
  if (
    !b ||
    typeof b !== "object" ||
    Array.isArray(b) ||
    Object.keys(b).sort().join() !== "idempotency_key,source_revision_id" ||
    typeof b.source_revision_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      b.source_revision_id,
    ) ||
    typeof b.idempotency_key !== "string" ||
    !/^[a-zA-Z0-9_-]{8,100}$/.test(b.idempotency_key)
  ) {
    res.status(400).json({ error: "Invalid extraction request" });
    return;
  }
  try {
    res
      .status(202)
      .json(
        await extract(
          res.locals.userId,
          b.source_revision_id,
          b.idempotency_key,
        ),
      );
  } catch (e) {
    if (e instanceof ExtractionError) {
      res.status(e.status).json({ error: e.code });
      return;
    }
    throw e;
  }
});
const validId = (id: unknown) =>
  typeof id === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
function cursor(v: unknown) {
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
    runs: rows.slice(0, 50),
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
  res.json(run);
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
      "SELECT * FROM threadline_runs WHERE id::text=$1 AND user_id=$2",
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
  res.json({ run, blocks });
});
export default router;
