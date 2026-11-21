import { productionMode } from "../extraction/production";
import { Router, type ErrorRequestHandler } from "express";
import { pool } from "@workspace/db";
import { validThreadNodeId } from "../action-thread/contract";
import { getActionThread, listActionThreads } from "../action-thread/store";
import { readProgress, transitionThread, type ThreadOperation } from "../action-thread/progress";
import { activeBetaGrant, requireThreadEvaluationCapacity } from "../extraction/beta";
import { liveAccess } from "../extraction/gemini";
import { extract } from "../extraction/service";
import { bounded, exact, ExtractionError } from "../extraction/validation";
import { cursor, validId, validIdempotencyKey } from "./extractions";

function invalid(): never {
  throw new ExtractionError("INVALID_THREAD_REQUEST", 400);
}

function fields(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  try {
    exact(value, keys);
  } catch {
    invalid();
  }
}

async function requireOwnedRevision(user: string, sourceId: string) {
  const owned = await pool.query(
    "SELECT 1 FROM threadline_source_revisions WHERE id=$1 AND user_id=$2",
    [sourceId, user],
  );
  if (!owned.rowCount) throw new ExtractionError("SOURCE_NOT_FOUND", 404);
}

function mutation(body: unknown, review: boolean) {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid();
  const operation = (body as Record<string, unknown>).operation;
  const shared = ["operation", "expected_version", "idempotency_key"];
  let change: ThreadOperation;
  if (review) {
    fields(body, shared);
    if (operation !== "approve" && operation !== "reject") invalid();
    change = { operation };
  } else if (operation === "complete" || operation === "retry") {
    fields(body, [...shared, "node_id"]);
    if (!validThreadNodeId(body.node_id)) invalid();
    change = { operation, node_id: body.node_id };
  } else if (operation === "decide") {
    fields(body, [...shared, "node_id", "to_node_id"]);
    if (!validThreadNodeId(body.node_id) || !validThreadNodeId(body.to_node_id)) invalid();
    change = { operation, node_id: body.node_id, to_node_id: body.to_node_id };
  } else if (operation === "block") {
    fields(body, [...shared, "node_id", "note"]);
    if (!validThreadNodeId(body.node_id) || !bounded(body.note, 500)) invalid();
    change = { operation, node_id: body.node_id, note: body.note };
  } else invalid();

  const { expected_version, idempotency_key } = body;
  if (
    typeof expected_version !== "number" || !Number.isInteger(expected_version) ||
    expected_version < 0 || expected_version > 2147483647 || !validIdempotencyKey(idempotency_key)
  ) invalid();
  return { ...change, expected_version, idempotency_key };
}

// Production wiring uses Gemini exclusively. The mock mode is injected by the
// offline integration harness and cannot be requested by a client.
export function actionThreadRouter(mode: "gemini" | "mock" = "gemini") {
  const router = Router();
  router.post("/", async (req, res) => {
    const body: unknown = req.body;
    fields(body, ["source_revision_id", "idempotency_key", "consent"]);
    const { source_revision_id, idempotency_key, consent } = body;
    if (!validId(source_revision_id) || !validIdempotencyKey(idempotency_key)) invalid();
    if (consent !== true) throw new ExtractionError("CONSENT_REQUIRED", 400);
    const user = res.locals.userId;
    await requireOwnedRevision(user, source_revision_id);
    const production = mode === "gemini" && productionMode();
    if (mode === "gemini") liveAccess(source_revision_id, 3, user);
    // A replay of an admitted key can return its existing run at quota.
    const grant = production ? undefined : await activeBetaGrant(user, { allowExhausted: mode === "gemini" });
    const run = await extract(user, source_revision_id, idempotency_key, mode, 3, grant, production);
    res.status(202).json({
      id: run.id,
      status: run.status,
      source_revision_id: run.source_revision_id,
      schema_version: run.schema_version,
    });
  });
  router.get("/availability", async (req, res) => {
    const sourceId = req.query.source_revision_id;
    if (!validId(sourceId)) invalid();
    const user = res.locals.userId;
    await requireOwnedRevision(user, sourceId);
    try {
      if (mode === "gemini") liveAccess(sourceId, 3, user);
      if (mode === "mock" || !productionMode()) {
        await activeBetaGrant(user);
        if (mode === "gemini") await requireThreadEvaluationCapacity();
      }
      res.json({ enabled: true });
    } catch (error) {
      if (!(error instanceof ExtractionError)) throw error;
      res.json({ enabled: false, reason: error.code });
    }
  });
  router.get("/", async (req, res) => {
    const offset = cursor(req.query.offset);
    if (offset === null || offset > 100000) invalid();
    res.json(await listActionThreads(res.locals.userId, offset));
  });
  router.param("id", (_req, _res, next, id) => {
    if (!validId(id)) invalid();
    next();
  });
  router.get("/:id", async (req, res) => {
    const thread = await getActionThread(res.locals.userId, req.params.id);
    if (!thread) throw new ExtractionError("THREAD_NOT_FOUND", 404);
    res.json(thread);
  });
  router.get("/:id/progress", async (req, res) => {
    const after = cursor(req.query.after_version);
    if (after === null || after > 2147483647) invalid();
    res.json(await readProgress(res.locals.userId, req.params.id, after));
  });
  router.post("/:id/review", async (req, res) => {
    res.json(await transitionThread(res.locals.userId, req.params.id, mutation(req.body, true)));
  });
  router.post("/:id/progress", async (req, res) => {
    res.json(await transitionThread(res.locals.userId, req.params.id, mutation(req.body, false)));
  });
  const threadErrors: ErrorRequestHandler = (error, _req, res, next) => {
    if (error instanceof ExtractionError) res.status(error.status).json({ error: error.code });
    else next(error);
  };
  router.use(threadErrors);
  return router;
}
