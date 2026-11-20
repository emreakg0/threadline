import { useState, type RefObject } from "react";
import type { ActionThread, ActiveStep, ThreadEvent, ThreadNode, ThreadOperation } from "./data";
import { nodeStatus, StepMark } from "./ThreadGraph";

type Props = {
  graph: ActionThread;
  node: ThreadNode;
  state: string;
  active: ActiveStep | undefined;
  pending: boolean;
  heading: RefObject<HTMLHeadingElement | null>;
  onOperation: (operation: ThreadOperation) => void;
};

export function ThreadContext({ graph }: { graph: ActionThread }) {
  return <div className="tl-thread-context">
    {(graph.source_facts.length > 0 || graph.deadline) && <details>
      <summary><span>Source evidence</span><small>From saved revision</small></summary>
      {graph.source_facts.map((item) => <blockquote key={item.start}>{item.quote}</blockquote>)}
      {graph.deadline && <blockquote>{graph.deadline.evidence.quote}<small>Deadline wording · {graph.deadline.phrase}</small></blockquote>}
    </details>}
    {graph.status !== "needs_clarification" && (graph.assumptions.length > 0 || graph.missing_information.length > 0) && <details>
      <summary>Assumptions and open questions</summary>
      <ul>{[...graph.assumptions, ...graph.missing_information].map((item, index) => <li key={index}>{item}</li>)}</ul>
    </details>}
  </div>;
}

export function ThreadInspector({ graph, node, state, active, pending, heading, onOperation }: Props) {
  const [blocker, setBlocker] = useState(false);
  const [note, setNote] = useState("");
  const outgoing = graph.edges.filter((edge) => edge.from === node.id);
  const terminal = outgoing.length === 0;
  const title = (id: string | null) => graph.nodes.find((item) => item.id === id)?.title;
  const ownsCurrent = active?.id === node.id;
  return <section className="tl-thread-inspector" aria-labelledby="thread-step-heading">
    <div className="tl-thread-inspector-status" data-state={state}>
      <StepMark kind={node.kind} state={state} terminal={terminal} />
      <span>{nodeStatus(node, state, terminal)}</span>
    </div>
    <h2 id="thread-step-heading" ref={heading} tabIndex={-1}>{node.title}</h2>
    <p className="tl-thread-description">{node.description}</p>
    <div className="tl-thread-criterion">
      <strong>{node.kind === "decision" ? "How to decide" : "Done when"}</strong>
      <p>{node.completion_criterion}</p>
    </div>

    {ownsCurrent ? <div className="tl-thread-operations">
      {active.outcomes.map(({ to, outcome }) => <button key={to} type="button"
        className="tl-thread-outcome" disabled={pending}
        onClick={() => onOperation({ operation: "decide", node_id: node.id, to_node_id: to })}>
        <strong>{outcome}</strong><small>Continue to {title(to)}</small>
      </button>)}
      {active.retry && <p className="tl-thread-retry-info">
        {active.retry.remaining} of {active.retry.limit} retries remaining
        {active.retry.remaining > 0 && <small>Retry returns to {title(active.retry.to)}.</small>}
      </p>}
      {active.allowed_operations.includes("complete") && <button type="button" className="tl-primary" disabled={pending}
        onClick={() => onOperation({ operation: "complete", node_id: node.id })}>
        {active.retry ? "Complete and continue" : terminal ? "Complete thread" : "Mark complete"}
      </button>}
      {active.allowed_operations.includes("retry") && <button type="button" className="tl-thread-secondary" disabled={pending}
        onClick={() => onOperation({ operation: "retry", node_id: node.id })}>Complete and retry</button>}
      {blocker ? <form onSubmit={(event) => {
        event.preventDefault();
        if (note.trim()) onOperation({ operation: "block", node_id: node.id, note: note.trim() });
      }}>
        <label htmlFor="thread-blocker-note">What’s blocking this step?</label>
        <textarea id="thread-blocker-note" required maxLength={500} rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        <div className="tl-thread-buttons">
          <button type="submit" className="tl-thread-secondary" disabled={pending || !note.trim()}>Save blocker</button>
          <button type="button" onClick={() => setBlocker(false)} disabled={pending}>Cancel</button>
        </div>
      </form> : <button type="button" className="tl-thread-quiet" disabled={pending} onClick={() => setBlocker(true)}>Report a blocker</button>}
    </div> : outgoing.length > 0 && <ul className="tl-thread-inspector-links">
      {outgoing.map((edge) => <li key={edge.to}>
        <strong>{edge.outcome ?? (edge.kind === "retry" ? `Retry · up to ${edge.max_traversals}` : "Then")}</strong>
        <span>{title(edge.to)}</span>
      </li>)}
    </ul>}

    <ThreadContext graph={graph} />
  </section>;
}

export function ThreadHistory({ graph, events }: { graph: ActionThread; events: ThreadEvent[] }) {
  const [limit, setLimit] = useState(12);
  function eventText(event: ThreadEvent) {
    const name = (id: string | null) => graph.nodes.find((node) => node.id === id)?.title;
    const step = name(event.node_id);
    switch (event.operation) {
      case "approve": return "Thread approved";
      case "reject": return "Thread rejected";
      case "complete": return `Completed ${step}`;
      case "decide": {
        const chosen = graph.edges.find((edge) => edge.from === event.node_id && edge.to === event.to_node_id);
        return chosen?.outcome ?? `Continued to ${name(event.to_node_id)}`;
      }
      case "block": return `Blocker reported on ${step}`;
      case "retry": return `Retried from ${name(event.to_node_id)}`;
    }
  }
  return <details className="tl-thread-history">
    <summary>Progress history <span>{events.length} {events.length === 1 ? "update" : "updates"}</span></summary>
    {events.length === 0 ? <p>No progress recorded yet.</p> : <ol>
      {events.slice(-limit).reverse().map((event) => <li key={event.version}>
        <div><strong>{eventText(event)}</strong>{event.note && <p>{event.note}</p>}</div>
        <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
      </li>)}
    </ol>}
    {events.length > limit && <button onClick={() => setLimit((count) => count + 12)}>Show earlier updates</button>}
  </details>;
}
