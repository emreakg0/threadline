import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import review from "./review";

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
const tagsForDocument = `ARRAY(SELECT t.name FROM threadline_document_tags dt
 JOIN threadline_tags t ON t.id=dt.tag_id AND t.user_id=dt.user_id
 WHERE dt.document_id=d.id AND dt.user_id=d.user_id ORDER BY t.name)`;
const latest = `SELECT d.*, ${tagsForDocument} AS tags, row_to_json(s) AS source FROM threadline_documents d
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
  const { q = "", collection = "", tag = "", review = "false" } = req.query;
  const offset = Number(req.query.offset ?? 0);
  if (
    typeof q !== "string" ||
    (q !== "" && !titleValid(q)) ||
    typeof collection !== "string" ||
    (collection !== "" && !uuid.test(collection)) ||
    typeof tag !== "string" ||
    (tag !== "" && (!titleValid(tag) || tag.length > 100)) ||
    (review !== "false" && review !== "true") ||
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
    `SELECT d.id,d.title,d.version,d.created_at,d.updated_at,d.archived_at,
      d.collection_id,c.name AS collection_name,${tagsForDocument} AS tags,
      (SELECT count(*)::int FROM threadline_knowledge_blocks b
       WHERE b.document_id=d.id AND b.user_id=d.user_id AND b.review_state='needs_review') AS pending_review
    FROM threadline_documents d
    LEFT JOIN threadline_collections c ON c.id=d.collection_id AND c.user_id=d.user_id
    WHERE d.user_id=$1 AND (d.archived_at IS NOT NULL)=$2
      AND ($4='' OR strpos(lower(d.title),lower($4))>0 OR strpos(lower(
        (SELECT source_text FROM threadline_source_revisions
         WHERE document_id=d.id AND user_id=d.user_id ORDER BY revision DESC LIMIT 1)
      ),lower($4))>0)
      AND ($5::uuid IS NULL OR d.collection_id=$5)
      AND ($6='' OR $6=ANY(${tagsForDocument}))
      AND (NOT $7::boolean OR EXISTS(SELECT 1 FROM threadline_knowledge_blocks b
        WHERE b.document_id=d.id AND b.user_id=d.user_id))
    ORDER BY d.updated_at DESC,d.id LIMIT 51 OFFSET $3`,
    [
      res.locals.userId,
      archived === "true",
      offset,
      q.trim(),
      collection || null,
      tag,
      review === "true",
    ],
  );
  res.json({
    documents: result.rows.slice(0, 50),
    next_offset: result.rows.length > 50 ? offset + 50 : null,
  });
});
router.get("/organization", async (_req, res) => {
  const [collections, tags] = await Promise.all([
    pool.query(
      "SELECT id,name FROM threadline_collections WHERE user_id=$1 ORDER BY name,id",
      [res.locals.userId],
    ),
    pool.query(
      `SELECT name FROM threadline_tags t WHERE user_id=$1
      AND EXISTS (SELECT 1 FROM threadline_document_tags dt WHERE dt.tag_id=t.id AND dt.user_id=t.user_id)
      ORDER BY name`,
      [res.locals.userId],
    ),
  ]);
  res.json({
    collections: collections.rows,
    tags: tags.rows.map((row) => row.name),
  });
});
router.post("/organization", async (req, res) => {
  const body: unknown = req.body;
  if (
    !object(body) ||
    Object.keys(body).length !== 1 ||
    !titleValid(body.name) ||
    body.name.trim().length > 100
  ) {
    res
      .status(400)
      .json({ error: "Provide a collection name of 1–100 characters." });
    return;
  }
  const result = await pool.query(
    "INSERT INTO threadline_collections(id,user_id,name) VALUES ($1,$2,$3) RETURNING id,name",
    [randomUUID(), res.locals.userId, body.name.trim()],
  );
  res.status(201).json(result.rows[0]);
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
      (k) =>
        ![
          "version",
          "title",
          "source_text",
          "archived",
          "collection_id",
          "tags",
        ].includes(k),
    ) ||
    !Number.isSafeInteger(b.version) ||
    Number(b.version) < 1 ||
    !["title", "source_text", "archived", "collection_id", "tags"].some(
      (k) => k in b,
    ) ||
    ("title" in b && !titleValid(b.title)) ||
    ("source_text" in b && !sourceValid(b.source_text)) ||
    ("collection_id" in b &&
      b.collection_id !== null &&
      (typeof b.collection_id !== "string" || !uuid.test(b.collection_id))) ||
    ("tags" in b &&
      (!Array.isArray(b.tags) ||
        b.tags.length > 20 ||
        b.tags.some((tag) => !titleValid(tag) || tag.trim().length > 100))) ||
    ("archived" in b && typeof b.archived !== "boolean")
  ) {
    res.status(400).json({
      error: "Provide the current version and valid document changes.",
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
    if (typeof b.collection_id === "string") {
      const collection = await client.query(
        "SELECT 1 FROM threadline_collections WHERE id=$1 AND user_id=$2",
        [b.collection_id, res.locals.userId],
      );
      if (!collection.rowCount) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Collection not found" });
        return;
      }
    }
    if (Array.isArray(b.tags)) {
      const names = [...new Set(b.tags.map((tag: string) => tag.trim()))];
      await client.query(
        `INSERT INTO threadline_tags(id,user_id,name)
         SELECT gen_random_uuid(),$1,name FROM unnest($2::text[]) AS names(name) ORDER BY name
         ON CONFLICT(user_id,name) DO NOTHING`,
        [res.locals.userId, names],
      );
      await client.query(
        "DELETE FROM threadline_document_tags WHERE document_id=$1 AND user_id=$2",
        [req.params.id, res.locals.userId],
      );
      await client.query(
        `INSERT INTO threadline_document_tags(id,user_id,document_id,tag_id)
         SELECT gen_random_uuid(),user_id,$1,id FROM threadline_tags WHERE user_id=$2 AND name=ANY($3::text[])`,
        [req.params.id, res.locals.userId, names],
      );
    }
    await client.query(
      `UPDATE threadline_documents SET title=COALESCE($3,title),
   archived_at=CASE WHEN $4::boolean IS NULL THEN archived_at WHEN $4 THEN COALESCE(archived_at,now()) ELSE NULL END,
   collection_id=CASE WHEN $5::boolean THEN $6::uuid ELSE collection_id END,
   version=version+1,updated_at=now() WHERE id=$1 AND user_id=$2`,
      [
        req.params.id,
        res.locals.userId,
        typeof b.title === "string" ? b.title.trim() : null,
        b.archived ?? null,
        "collection_id" in b,
        b.collection_id ?? null,
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
router.use("/:id/blocks", review);
export default router;
