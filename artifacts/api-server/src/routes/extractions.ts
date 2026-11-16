import { Router } from "express";
import { pool } from "@workspace/db";
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
    res.json(
      await extract(res.locals.userId, b.source_revision_id, b.idempotency_key),
    );
  } catch (e) {
    if (e instanceof ExtractionError) {
      res.status(e.status).json({ error: e.code });
      return;
    }
    throw e;
  }
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
