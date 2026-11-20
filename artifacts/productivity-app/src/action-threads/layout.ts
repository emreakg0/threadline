import type { ActionThread, ThreadProgress } from "./data";

export const cardWidth = 246;
export const cardHeight = 76;
const columnSpacing = 94;
const rowSpacing = 66;
const railMargin = 68;

export function layoutThread(graph: ActionThread) {
  const forward = graph.edges.filter((edge) => edge.kind !== "retry");
  const ranks = new Map<string, number>();
  const pending = new Set(graph.nodes.map(({ id }) => id));
  // Longest path layering keeps converging steps below every predecessor.
  while (pending.size) {
    const ready = [...pending].filter((id) => forward.every((edge) => edge.to !== id || ranks.has(edge.from)));
    if (!ready.length) break;
    for (const id of ready) {
      const parents = forward.filter((edge) => edge.to === id);
      ranks.set(id, Math.max(0, ...parents.map((edge) => ranks.get(edge.from)! + 1)));
      pending.delete(id);
    }
  }
  const rows = new Map<number, string[]>();
  for (const [id, rank] of ranks) {
    const row = rows.get(rank) ?? [];
    row.push(id);
    rows.set(rank, row);
  }
  const offsets = new Map<string, number>();
  for (const row of rows.values()) row.forEach((id, index) => offsets.set(id, index - (row.length - 1) / 2));
  // Order adjacent ranks by connected neighbors while preserving ties.
  const ordered = [...rows.keys()].sort((a, b) => a - b);
  for (const down of [true, false, true]) {
    for (const rank of down ? ordered : [...ordered].reverse()) {
      const row = rows.get(rank)!;
      const center = (id: string) => {
        const neighbors = forward.filter((edge) => (down ? edge.to : edge.from) === id);
        return neighbors.length
          ? neighbors.reduce((sum, edge) => sum + offsets.get(down ? edge.from : edge.to)!, 0) / neighbors.length
          : offsets.get(id)!;
      };
      row.sort((a, b) => center(a) - center(b));
      row.forEach((id, index) => offsets.set(id, index - (row.length - 1) / 2));
    }
  }
  const columns = Math.max(1, ...[...rows.values()].map((row) => row.length));
  const width = columns * cardWidth + (columns - 1) * columnSpacing + 2 * railMargin;
  const height = (ordered.at(-1) ?? 0) * (cardHeight + rowSpacing) + cardHeight + railMargin;
  const positions = new Map([...ranks].map(([id, rank]) => [id, {
    x: width / 2 - cardWidth / 2 + offsets.get(id)! * (cardWidth + columnSpacing),
    y: railMargin / 2 + rank * (cardHeight + rowSpacing),
  }]));
  return { width, height, positions, ordered: ordered.flatMap((rank) => rows.get(rank)!) };
}

export function projectRoute(graph: ActionThread, snapshot: ThreadProgress) {
  const { state, active_node_id } = snapshot.progress;
  const path: { from: string; to: string | null }[] = [];
  for (const event of snapshot.events) {
    if (!event.node_id) continue;
    if (event.operation === "retry") {
      // A new attempt reopens steps from its destination without erasing history.
      const index = path.findIndex(({ from }) => from === event.to_node_id);
      if (index >= 0) path.splice(index);
    } else if (event.operation === "complete" || event.operation === "decide") {
      path.push({ from: event.node_id, to: event.to_node_id });
    }
  }
  const completed = new Set(path.map(({ from }) => from));
  const reachable = new Set<string>();
  const queue = active_node_id ? [active_node_id] : [];
  while (queue.length) {
    const id = queue.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const edge of graph.edges)
      if (edge.from === id && edge.kind !== "retry") queue.push(edge.to);
  }
  return {
    nodeState(id: string) {
      if (id === active_node_id) return "active";
      if (completed.has(id)) return "complete";
      return (state === "approved" || state === "completed") && !reachable.has(id)
        ? "unavailable" : "upcoming";
    },
    followed(from: string, to: string) {
      return path.some((step) => step.from === from && step.to === to);
    },
  };
}

export type GraphLayout = ReturnType<typeof layoutThread>;
export type RouteProjection = ReturnType<typeof projectRoute>;
