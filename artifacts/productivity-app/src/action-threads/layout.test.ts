import assert from "node:assert/strict";
import { calcPlan, calcSource, portfolioPlan, portfolioSource } from "../../../api-server/src/action-thread/fixtures";
import { validateActionThread } from "../../../api-server/src/action-thread/graph";
import type { ThreadEvent, ThreadProgress } from "./data";
import { cardHeight, cardWidth, layoutThread, projectRoute } from "./layout";

const calc = validateActionThread(JSON.stringify(calcPlan()), calcSource);
const portfolio = validateActionThread(JSON.stringify(portfolioPlan()), portfolioSource);
for (const graph of [calc, portfolio]) {
  const layout = layoutThread(graph);
  assert.equal(layout.ordered.length, graph.nodes.length);
  assert.equal(layout.ordered[0], graph.entry_node_id);
  for (const edge of graph.edges) {
    const from = layout.positions.get(edge.from)!;
    const to = layout.positions.get(edge.to)!;
    if (edge.kind === "retry") assert.ok(to.y < from.y);
    else assert.ok(to.y > from.y + cardHeight);
  }
  const positions = [...layout.positions.values()];
  for (const [i, point] of positions.entries())
    assert.ok(positions.slice(i + 1).every((other) => point.y !== other.y || Math.abs(other.x - point.x) >= cardWidth));
}

function event(operation: ThreadEvent["operation"], node_id: string, to_node_id: string | null): ThreadEvent {
  return { version: 0, operation, node_id, to_node_id, note: null, created_at: "" };
}
function progress(active_node_id: string | null, events: ThreadEvent[]): ThreadProgress {
  return { progress: { state: active_node_id ? "approved" : "completed", active_node_id, version: events.length }, events, active_next_steps: [] };
}

const path = [
  event("complete", "derive-basics", "manipulate-series"),
  event("complete", "manipulate-series", "independent-set"),
  event("complete", "independent-set", "check-mastery"),
  event("decide", "check-mastery", "diagnose-errors"),
];
const remedial = projectRoute(calc, progress("diagnose-errors", path));
assert.equal(remedial.nodeState("diagnose-errors"), "active");
assert.equal(remedial.nodeState("cover-remaining"), "unavailable");
assert.equal(remedial.followed("check-mastery", "diagnose-errors"), true);
const reopened = projectRoute(calc, progress("independent-set", [...path, event("retry", "diagnose-errors", "independent-set")]));
assert.equal(reopened.nodeState("derive-basics"), "complete");
assert.equal(reopened.nodeState("independent-set"), "active");
assert.equal(reopened.nodeState("cover-remaining"), "upcoming");
assert.equal(reopened.followed("check-mastery", "diagnose-errors"), false);

const converged = projectRoute(portfolio, progress(null, [
  event("complete", "inventory", "check-rights"),
  event("decide", "check-rights", "use-text"),
  event("complete", "use-text", "review"),
  event("complete", "review", null),
]));
assert.equal(converged.nodeState("review"), "complete");
assert.equal(converged.nodeState("use-images"), "unavailable");
assert.equal(converged.followed("check-rights", "use-images"), false);
console.log("PASS: threaded DAG placement, alternate-path convergence and retry-aware route projection");
