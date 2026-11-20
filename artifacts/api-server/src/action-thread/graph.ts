import { ExtractionError } from "../extraction/validation";
import { limits, parseThread, type ActionThread, type ThreadEdge, type ThreadNode } from "./contract";

function checkStatus(thread: ActionThread) {
  const { status, nodes, edges, goal, success_criteria, source_facts, entry_node_id } = thread;
  if (status === "needs_clarification") {
    if (
      goal || entry_node_id || nodes.length || edges.length || success_criteria.length ||
      thread.assumptions.length || !thread.missing_information.length
    )
      throw new ExtractionError("INVALID_THREAD_STATUS");
    return;
  }

  const decisions = nodes.filter((node) => node.kind === "decision").length;
  const actions = nodes.length - decisions;
  const validCount = status === "simple"
    ? actions >= 1 && actions <= 2 && !decisions && edges.every(({ kind }) => kind === "next")
    : actions >= 3 && actions <= limits.actions && decisions <= limits.decisions;
  if (!goal || !entry_node_id || !source_facts.length || !success_criteria.length || !validCount)
    throw new ExtractionError("INVALID_THREAD_STATUS");
}

function indexGraph(nodes: ThreadNode[], edges: ThreadEdge[]) {
  const outgoing = new Map<string, ThreadEdge[]>();
  for (const node of nodes) {
    if (outgoing.has(node.id)) throw new ExtractionError("DUPLICATE_THREAD_NODE");
    outgoing.set(node.id, []);
  }

  for (const edge of edges) {
    const from = outgoing.get(edge.from);
    if (!from || !outgoing.has(edge.to)) throw new ExtractionError("DANGLING_THREAD_EDGE");
    if (edge.from === edge.to || from.some(({ to }) => to === edge.to))
      throw new ExtractionError("DUPLICATE_OR_SELF_THREAD_EDGE");
    from.push(edge);
  }
  return outgoing;
}

function checkBranches(nodes: ThreadNode[], outgoing: Map<string, ThreadEdge[]>) {
  for (const node of nodes) {
    const edges = outgoing.get(node.id)!;
    if (node.kind === "decision") {
      const labels = new Set(edges.map(({ outcome }) =>
        outcome?.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(),
      ));
      if (
        edges.length < 2 || edges.length > 3 ||
        edges.some(({ kind }) => kind !== "outcome") || labels.size !== edges.length
      )
        throw new ExtractionError("INVALID_THREAD_BRANCH");
    } else {
      const next = edges.filter(({ kind }) => kind === "next").length;
      const retry = edges.filter(({ kind }) => kind === "retry").length;
      if (edges.length > 2 || next > 1 || edges.length !== next + retry || (retry && next !== 1))
        throw new ExtractionError("INVALID_THREAD_BRANCH");
    }
  }
}

// Every non-retry walk terminates in this DAG. Retry traversal counters must
// be cumulative for the entire walk, so no sequence can revisit nodes forever.
function checkPaths(entry: string, outgoing: Map<string, ThreadEdge[]>) {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string) {
    if (visiting.has(id)) throw new ExtractionError("UNBOUNDED_THREAD_CYCLE");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const { to, kind } of outgoing.get(id)!) {
      if (kind !== "retry") visit(to);
    }
    visiting.delete(id);
    visited.add(id);
  }

  visit(entry);
  if (visited.size !== outgoing.size) throw new ExtractionError("UNREACHABLE_THREAD_NODE");

  // The retry target must already have run on every forward route to its origin.
  function canBypassTarget({ from, to }: ThreadEdge) {
    const seen = new Set([to]);
    const pending = [entry];
    while (pending.length) {
      const id = pending.pop()!;
      if (seen.has(id)) continue;
      if (id === from) return true;
      seen.add(id);
      for (const edge of outgoing.get(id)!) {
        if (edge.kind !== "retry") pending.push(edge.to);
      }
    }
    return false;
  }

  const retries = [...outgoing.values()].flat().filter(({ kind }) => kind === "retry");
  if (retries.length > limits.retryEdges || retries.some(canBypassTarget))
    throw new ExtractionError("INVALID_THREAD_RETRY");
}

export function validateActionThread(raw: string, source: string): ActionThread {
  const thread = parseThread(raw, source);
  checkStatus(thread);
  if (thread.entry_node_id === null) return thread;

  const outgoing = indexGraph(thread.nodes, thread.edges);
  if (!outgoing.has(thread.entry_node_id)) throw new ExtractionError("INVALID_THREAD_ENTRY");
  checkBranches(thread.nodes, outgoing);
  checkPaths(thread.entry_node_id, outgoing);
  return thread;
}
