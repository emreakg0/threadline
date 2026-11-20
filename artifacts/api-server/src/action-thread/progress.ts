import { transaction, type Client } from "../extraction/lifecycle";
import { ExtractionError } from "../extraction/validation";
import type { ThreadEdge, ThreadNode } from "./contract";

export type ThreadOperation =
  | { operation: "approve" | "reject" }
  | { operation: "complete" | "retry"; node_id: string }
  | { operation: "decide"; node_id: string; to_node_id: string }
  | { operation: "block"; node_id: string; note: string };

type Command = ThreadOperation & { expected_version: number; idempotency_key: string };
type Scope = [id: string, user: string];
type Progress = {
  state: "pending" | "approved" | "rejected" | "completed";
  version: number;
  active_node_id: string | null;
  reviewed_at: Date | null;
  completed_at: Date | null;
  updated_at: Date;
};
type Lock = Progress & { entry_node_id: string | null };
type ActiveEdge = ThreadEdge & { used: number };
type ActiveNode = ThreadNode & { edges: ActiveEdge[] };

function conflict(code: string): never {
  throw new ExtractionError(code, 409);
}

async function lockProgress(c: Client, scope: Scope, write: boolean) {
  const { rows } = await c.query<Lock>(
    `SELECT p.state,p.version,p.active_node_id,p.reviewed_at,p.completed_at,p.updated_at,t.entry_node_id
     FROM threadline_action_thread_progress p
     JOIN threadline_action_threads t ON t.id=p.thread_id AND t.user_id=p.user_id
     WHERE p.thread_id=$1 AND p.user_id=$2 FOR ${write ? "UPDATE" : "SHARE"} OF p`,
    scope,
  );
  if (!rows[0]) throw new ExtractionError("THREAD_NOT_FOUND", 404);
  return rows[0];
}

async function activeNode(c: Client, scope: Scope, progress: Progress): Promise<ActiveNode | null> {
  if (!progress.active_node_id) return null;
  const { rows: [node] } = await c.query<ThreadNode>(
    `SELECT id,kind,title,description,completion_criterion,provenance
     FROM threadline_action_thread_nodes WHERE thread_id=$1 AND user_id=$2 AND id=$3`,
    [...scope, progress.active_node_id],
  );
  if (!node) throw new Error("Missing active Action Thread node");
  const { rows: edges } = await c.query<ActiveEdge>(
    `SELECT e.from_node_id AS "from",e.to_node_id AS "to",e.kind,e.outcome,e.max_traversals,
       CASE WHEN e.kind='retry' THEN (SELECT count(*)::int FROM threadline_action_thread_transitions h
         WHERE h.thread_id=e.thread_id AND h.user_id=e.user_id AND h.operation='retry'
         AND h.node_id=e.from_node_id AND h.to_node_id=e.to_node_id) ELSE 0 END AS used
     FROM threadline_action_thread_edges e
     WHERE e.thread_id=$1 AND e.user_id=$2 AND e.from_node_id=$3 ORDER BY e.position`,
    [...scope, node.id],
  );
  return { ...node, edges };
}

function retriesRemaining(edge: ActiveEdge | undefined) {
  return edge?.max_traversals == null ? 0 : edge.max_traversals - edge.used;
}

async function snapshot(c: Client, scope: Scope, progress: Progress) {
  const node = await activeNode(c, scope, progress);
  if (!node) return { progress, active_next_steps: [] };
  const { edges, ...details } = node;
  const retry = edges.find((edge) => edge.kind === "retry");
  const forward = edges.find((edge) => edge.kind === "next");
  const remaining = retriesRemaining(retry);
  const advance = node.kind === "decision" ? "decide" : remaining > 0 ? "retry" : "complete";
  return {
    progress,
    active_next_steps: [{
      ...details,
      allowed_operations: [advance, "block"],
      outcomes: edges.filter((edge) => edge.kind === "outcome").map(({ to, outcome }) => ({ to, outcome })),
      retry: retry ? { to: retry.to, used: retry.used, remaining, limit: retry.max_traversals } : null,
      forward_exit: forward?.to ?? null,
    }],
  };
}

export async function readProgress(user: string, id: string, afterVersion: number) {
  const scope: Scope = [id, user];
  return transaction(async (c) => {
    const { entry_node_id, ...progress } = await lockProgress(c, scope, false);
    const { rows } = await c.query(
      `SELECT version,operation,node_id,to_node_id,note,created_at
       FROM threadline_action_thread_transitions
       WHERE thread_id=$1 AND user_id=$2 AND version>$3 ORDER BY version LIMIT 51`,
      [...scope, afterVersion],
    );
    const events = rows.slice(0, 50);
    return {
      ...await snapshot(c, scope, progress),
      events,
      next_version: events.at(-1)?.version ?? afterVersion,
      has_more: rows.length > 50,
    };
  });
}

function advance(node: ActiveNode, command: ThreadOperation) {
  if (command.operation === "block") return null;
  if (command.operation === "decide") {
    if (node.kind !== "decision") conflict("THREAD_ACTION_REQUIRED");
    const edge = node.edges.find(({ kind, to }) => kind === "outcome" && to === command.to_node_id);
    if (!edge) conflict("THREAD_INVALID_OUTCOME");
    return edge.to;
  }
  if (node.kind !== "action") conflict("THREAD_DECISION_REQUIRED");
  const retry = node.edges.find((edge) => edge.kind === "retry");
  if (command.operation === "retry") {
    if (!retry) conflict("THREAD_RETRY_UNAVAILABLE");
    if (retriesRemaining(retry) <= 0) conflict("THREAD_RETRY_EXHAUSTED");
    return retry.to;
  }
  if (retriesRemaining(retry) > 0) conflict("THREAD_RETRY_REQUIRED");
  return node.edges.find((edge) => edge.kind === "next")?.to ?? null;
}

export async function transitionThread(user: string, id: string, command: Command) {
  const scope: Scope = [id, user];
  return transaction(async (c) => {
    const { entry_node_id, ...progress } = await lockProgress(c, scope, true);
    const { rows: [previous] } = await c.query(
      `SELECT version,operation,node_id,to_node_id,note FROM threadline_action_thread_transitions
       WHERE thread_id=$1 AND user_id=$2 AND idempotency_key=$3`,
      [...scope, command.idempotency_key],
    );
    const nodeId = "node_id" in command ? command.node_id : null;
    const note = command.operation === "block" ? command.note : null;
    if (previous) {
      if (
        previous.version !== command.expected_version + 1 || previous.operation !== command.operation ||
        previous.node_id !== nodeId || previous.note !== note ||
        (command.operation === "decide" && previous.to_node_id !== command.to_node_id)
      ) conflict("THREAD_IDEMPOTENCY_CONFLICT");
      return { ...await snapshot(c, scope, progress), replayed: true };
    }
    if (progress.version !== command.expected_version) conflict("THREAD_VERSION_CONFLICT");

    let state = progress.state;
    let active = progress.active_node_id;
    let target: string | null = null;
    const reviewing = command.operation === "approve" || command.operation === "reject";
    if (reviewing) {
      if (state !== "pending") conflict("THREAD_ALREADY_REVIEWED");
      if (command.operation === "approve") {
        if (!entry_node_id) conflict("THREAD_NEEDS_CLARIFICATION");
        state = "approved";
        active = entry_node_id;
      } else state = "rejected";
    } else {
      if (state !== "approved") conflict("THREAD_INACTIVE");
      const node = await activeNode(c, scope, progress);
      if (!node || node.id !== nodeId) conflict("THREAD_NODE_NOT_ACTIVE");
      target = advance(node, command);
      if (command.operation !== "block") {
        active = target;
        if (!active) state = "completed";
      }
    }

    const { rows: [updated] } = await c.query<Progress>(
      `UPDATE threadline_action_thread_progress
       SET state=$3,active_node_id=$4,version=version+1,updated_at=clock_timestamp(),
         reviewed_at=CASE WHEN $5 THEN clock_timestamp() ELSE reviewed_at END,
         completed_at=CASE WHEN $3='completed' THEN clock_timestamp() ELSE NULL END
       WHERE thread_id=$1 AND user_id=$2
       RETURNING state,version,active_node_id,reviewed_at,completed_at,updated_at`,
      [...scope, state, active, reviewing],
    );
    await c.query(
      `INSERT INTO threadline_action_thread_transitions
       (thread_id,user_id,version,idempotency_key,operation,node_id,to_node_id,note)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [...scope, updated.version, command.idempotency_key, command.operation, nodeId, target, note],
    );
    return { ...await snapshot(c, scope, updated), replayed: false };
  });
}
