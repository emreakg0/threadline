import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

// Mounted after Focus City's session and write-origin middleware.
const router = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const titleValid = (v: unknown): v is string =>
  typeof v === "string" &&
  v.trim().length > 0 &&
  v.trim().length <= 300 &&
  !v.includes("\0") &&
  !/[\uD800-\uDFFF]/u.test(v);
const sourceValid = (v: unknown): v is string =>
  typeof v === "string" &&
  v.trim().length > 0 &&
  v.length <= 20000 &&
  !v.includes("\0") &&
  !/[\uD800-\uDFFF]/u.test(v);
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const latest = `SELECT d.*, row_to_json(s) AS source FROM threadline_documents d
 JOIN LATERAL (SELECT id, revision, source_text, created_at FROM threadline_source_revisions
 WHERE document_id=d.id AND user_id=d.user_id ORDER BY revision DESC LIMIT 1) s ON true
 WHERE d.id=$1 AND d.user_id=$2`;

router.param("id", (req, res, next, id: string) => {
  if (!uuid.test(id)) {
    res.status(400).json({ error: "Invalid document identifier" });
    return;
  }
  next();
});
router.get("/", async (req, res) => {
  const archived = req.query.archived ?? "false";
  const offset = Number(req.query.offset ?? 0);
  if (
    typeof archived !== "string" ||
    !["true", "false"].includes(archived) ||
    (req.query.offset !== undefined && typeof req.query.offset !== "string") ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 100000
  ) {
    res.status(400).json({ error: "Invalid document list filter" });
    return;
  }
  const result = await pool.query(
    `SELECT id,title,version,created_at,updated_at,archived_at
 FROM threadline_documents WHERE user_id=$1 AND (archived_at IS NOT NULL)=$2
 ORDER BY updated_at DESC,id LIMIT 51 OFFSET $3`,
    [res.locals.userId, archived === "true", offset],
  );
  res.json({
    documents: result.rows.slice(0, 50),
    next_offset: result.rows.length > 50 ? offset + 50 : null,
  });
});
router.post("/", async (req, res) => {
  const b: unknown = req.body;
  if (
    !object(b) ||
    Object.keys(b).some((k) => !["id", "title", "source_text"].includes(k)) ||
    typeof b.id !== "string" ||
    !uuid.test(b.id) ||
    !titleValid(b.title) ||
    !sourceValid(b.source_text)
  ) {
    res.status(400).json({
      error:
        "Provide a document ID, title (1–300 characters) and source (1–20,000 characters).",
    });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO threadline_documents(id,user_id,title)
   VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [b.id, res.locals.userId, b.title.trim()],
    );
    if (inserted.rowCount) {
      await client.query(
        `INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text)
    VALUES ($1,$2,$3,1,$4)`,
        [randomUUID(), res.locals.userId, b.id, b.source_text],
      );
    } else {
      // Retrying an uncertain submission with the same ID cannot create duplicate captures.
      const prior = await client.query(
        `SELECT d.id FROM threadline_documents d JOIN threadline_source_revisions s
    ON s.document_id=d.id AND s.user_id=d.user_id AND s.revision=1
    WHERE d.id=$1 AND d.user_id=$2 AND d.title=$3 AND s.source_text=$4`,
        [b.id, res.locals.userId, b.title.trim(), b.source_text],
      );
      if (!prior.rowCount) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error:
            "Capture identifier already used. Open the saved document before retrying.",
        });
        return;
      }
    }
    const result = await client.query(latest, [b.id, res.locals.userId]);
    await client.query("COMMIT");
    res.status(inserted.rowCount ? 201 : 200).json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
router.get("/:id", async (req, res) => {
  const result = await pool.query(latest, [req.params.id, res.locals.userId]);
  if (!result.rowCount) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json(result.rows[0]);
});
router.get("/:id/revisions", async (req, res) => {
  const offset = Number(req.query.offset ?? 0);
  if (
    (req.query.offset !== undefined && typeof req.query.offset !== "string") ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 100000
  ) {
    res.status(400).json({ error: "Invalid revision offset" });
    return;
  }
  const owned = await pool.query(
    "SELECT id FROM threadline_documents WHERE id=$1 AND user_id=$2",
    [req.params.id, res.locals.userId],
  );
  if (!owned.rowCount) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const result = await pool.query(
    `SELECT id,revision,created_at FROM threadline_source_revisions
 WHERE document_id=$1 AND user_id=$2 ORDER BY revision DESC LIMIT 51 OFFSET $3`,
    [req.params.id, res.locals.userId, offset],
  );
  res.json({
    revisions: result.rows.slice(0, 50),
    next_offset: result.rows.length > 50 ? offset + 50 : null,
  });
});
router.get("/:id/revisions/:revision", async (req, res) => {
  const revision = Number(req.params.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    res.status(400).json({ error: "Invalid source revision" });
    return;
  }
  const result = await pool.query(
    `SELECT id,revision,source_text,created_at FROM threadline_source_revisions
 WHERE document_id=$1 AND user_id=$2 AND revision=$3`,
    [req.params.id, res.locals.userId, revision],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: "Source revision not found" });
    return;
  }
  res.json(result.rows[0]);
});
router.patch("/:id", async (req, res) => {
  const b: unknown = req.body;
  if (
    !object(b) ||
    Object.keys(b).some(
      (k) => !["version", "title", "source_text", "archived"].includes(k),
    ) ||
    !Number.isSafeInteger(b.version) ||
    Number(b.version) < 1 ||
    !["title", "source_text", "archived"].some((k) => k in b) ||
    ("title" in b && !titleValid(b.title)) ||
    ("source_text" in b && !sourceValid(b.source_text)) ||
    ("archived" in b && typeof b.archived !== "boolean")
  ) {
    res.status(400).json({
      error:
        "Provide the current version and a valid title, source, or archive state.",
    });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query(
      "SELECT version FROM threadline_documents WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [req.params.id, res.locals.userId],
    );
    if (!owned.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Document not found" });
      return;
    }
    if (owned.rows[0].version !== b.version) {
      await client.query("ROLLBACK");
      res.status(409).json({
        error:
          "A newer version is saved. Your draft is unchanged. Open the saved version to compare.",
      });
      return;
    }
    await client.query(
      `UPDATE threadline_documents SET title=COALESCE($3,title),
   archived_at=CASE WHEN $4::boolean IS NULL THEN archived_at WHEN $4 THEN COALESCE(archived_at,now()) ELSE NULL END,
   version=version+1,updated_at=now() WHERE id=$1 AND user_id=$2`,
      [
        req.params.id,
        res.locals.userId,
        typeof b.title === "string" ? b.title.trim() : null,
        b.archived ?? null,
      ],
    );
    if ("source_text" in b) {
      await client.query(
        `INSERT INTO threadline_source_revisions(id,user_id,document_id,revision,source_text)
    SELECT $1,$2,$3,revision+1,$4 FROM threadline_source_revisions
    WHERE document_id=$3 AND user_id=$2 AND source_text IS DISTINCT FROM $4
    AND revision=(SELECT max(revision) FROM threadline_source_revisions WHERE document_id=$3 AND user_id=$2)`,
        [randomUUID(), res.locals.userId, req.params.id, b.source_text],
      );
    }
    const result = await client.query(latest, [
      req.params.id,
      res.locals.userId,
    ]);
    await client.query("COMMIT");
    res.json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
export default router;
