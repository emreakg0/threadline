import { Router } from "express";
import { pool } from "@workspace/db";
import { kinds } from "../extraction/validation";

const router = Router({ mergeParams: true });
const states = ["needs_review", "confirmed", "dismissed"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get<"/", { id: string }>("/", async (req, res) => {
  const { kind = "", state = "", offset = "0", block = "" } = req.query;
  const start = Number(offset);
  if (
    typeof kind !== "string" ||
    (kind && !kinds.some((value) => value === kind)) ||
    typeof state !== "string" ||
    (state && !states.includes(state)) ||
    typeof block !== "string" ||
    (block && !uuid.test(block)) ||
    typeof offset !== "string" ||
    !Number.isSafeInteger(start) ||
    start < 0 ||
    start > 100000
  ) {
    res.status(400).json({ error: "Invalid review filter" });
    return;
  }
  const scope = [req.params.id, res.locals.userId];
  const owned = await pool.query(
    "SELECT 1 FROM threadline_documents WHERE id=$1 AND user_id=$2",
    scope,
  );
  if (!owned.rowCount) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const result = await pool.query(
    `SELECT b.id,b.kind,b.content,b.version,b.review_state,b.uncertainty_reason,b.edited_at,
      r.provider,r.id AS run_id,s.revision AS run_revision,
      COALESCE((SELECT json_agg(json_build_object(
        'id',e.id,'quote',e.quote,'revision',src.revision,
        'start_offset',e.start_offset,'end_offset',e.end_offset) ORDER BY src.revision,e.start_offset,e.id)
        FROM threadline_block_evidence e JOIN threadline_source_revisions src
          ON src.id=e.source_revision_id AND src.document_id=e.document_id AND src.user_id=e.user_id
        WHERE e.block_id=b.id AND e.document_id=b.document_id AND e.user_id=b.user_id),'[]') AS evidence
    FROM threadline_knowledge_blocks b
    LEFT JOIN threadline_runs r ON r.id=b.originating_run_id AND r.user_id=b.user_id AND r.document_id=b.document_id
    LEFT JOIN threadline_source_revisions s ON s.id=r.source_revision_id AND s.user_id=r.user_id AND s.document_id=r.document_id
    WHERE b.document_id=$1 AND b.user_id=$2 AND ($3='' OR b.kind=$3) AND ($4='' OR b.review_state=$4)
      AND ($6::uuid IS NULL OR b.id=$6)
    ORDER BY b.created_at DESC,b.originating_run_id,b.position,b.id LIMIT 51 OFFSET $5`,
    [...scope, kind, state, start, block || null],
  );
  res.json({
    blocks: result.rows.slice(0, 50),
    next_offset: result.rows.length > 50 ? start + 50 : null,
  });
});

router.patch<"/:block", { id: string; block: string }>(
  "/:block",
  async (req, res) => {
    const { block, id } = req.params;
    const body = req.body;
    if (
      !uuid.test(block) ||
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (key) => !["version", "content", "review_state"].includes(key),
      ) ||
      !Number.isInteger(body.version) ||
      body.version < 1 ||
      body.version > 2147483647 ||
      (!("content" in body) && !("review_state" in body)) ||
      ("review_state" in body && !states.includes(body.review_state)) ||
      ("content" in body &&
        (typeof body.content !== "string" ||
          !body.content.trim() ||
          body.content.length > 1200 ||
          /[\0\uD800-\uDFFF]/u.test(body.content)))
    ) {
      res
        .status(400)
        .json({ error: "Provide the block version and valid review changes." });
      return;
    }
    const scope = [block, id, res.locals.userId];
    const result = await pool.query(
      `UPDATE threadline_knowledge_blocks
    SET content=COALESCE($5,content),
      edited_at=CASE WHEN $5::text IS NOT NULL AND $5 IS DISTINCT FROM content THEN now() ELSE edited_at END,
      review_state=COALESCE($6,CASE WHEN $5 IS NOT NULL AND $5 IS DISTINCT FROM content
        THEN 'needs_review' ELSE review_state END),
      version=version+1,updated_at=now()
    WHERE id=$1 AND document_id=$2 AND user_id=$3 AND version=$4
    RETURNING version,content,review_state,edited_at`,
      [...scope, body.version, body.content ?? null, body.review_state ?? null],
    );
    if (result.rowCount) {
      res.json(result.rows[0]);
      return;
    }
    const owned = await pool.query(
      "SELECT 1 FROM threadline_knowledge_blocks WHERE id=$1 AND document_id=$2 AND user_id=$3",
      scope,
    );
    res.status(owned.rowCount ? 409 : 404).json({
      error: owned.rowCount
        ? "This block changed elsewhere. Reload the saved block before applying your changes."
        : "Block not found",
    });
  },
);
export default router;
