import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api";
import { WorkspaceIcon } from "../WorkspaceIcon";
import {
  getProgress, getThread, listThreads, submitProgress, threadsRoute, threadStatus,
  type ThreadCommand, type ThreadDetail, type ThreadOperation, type ThreadProgress, type ThreadSummary,
} from "./data";
import { layoutThread, projectRoute } from "./layout";
import { ThreadGraph, ThreadList } from "./ThreadGraph";
import { ThreadContext, ThreadHistory, ThreadInspector } from "./ThreadInspector";
import "./action-threads.css";

function errorText(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 404) return "This Action Thread could not be found.";
    if (error.status === 401) return "Your session has expired. Sign in to continue.";
  }
  return "Action Threads could not be loaded. Try again.";
}

function ThreadIndex() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [offset, setOffset] = useState<number | null>(0);
  const [paging, setPaging] = useState(true);
  const [error, setError] = useState("");
  const [request, requestPage] = useState({ offset: 0 });
  useEffect(() => {
    let current = true;
    void listThreads(request.offset).then((page) => {
      if (!current) return;
      setThreads((previous) => request.offset ? [...previous, ...page.threads] : page.threads);
      setOffset(page.next_offset);
      setPaging(false);
    }, (cause) => {
      if (!current) return;
      setPaging(false);
      setError(errorText(cause));
    });
    return () => { current = false; };
  }, [request]);

  function load(next: number) {
    setPaging(true);
    setError("");
    requestPage({ offset: next });
  }
  return <div className="tl-content tl-threads">
    <header className="tl-page-heading">
      <div><h1>Action Threads</h1><p>Review a branching plan and follow one step at a time.</p></div>
    </header>
    <p className="tl-thread-availability">
      <WorkspaceIcon name="branch" />
      <span>When generation is available, you can start an Action Thread from a saved Brain Dump.</span>
    </p>
    {error && <div className="tl-error" role="alert">{error}<button onClick={() => load(request.offset)}>Try again</button></div>}
    {paging && threads.length === 0 && <p role="status">Loading Action Threads…</p>}
    {!paging && !error && threads.length === 0 && <section className="tl-thread-empty">
      <span className="tl-thread-empty-icon"><WorkspaceIcon name="branch" /></span>
      <h2>No saved threads yet</h2>
      <a className="tl-text-link" href="#capture">Go to Brain Dump</a>
    </section>}
    {threads.length > 0 && <ul className="tl-thread-index">
      {threads.map((thread) => <li key={thread.id}>
        <a href={threadsRoute + "/" + thread.id}>
          <span className="tl-thread-index-icon"><WorkspaceIcon name="branch" /></span>
          <span><strong>{thread.goal?.text ?? "Clarify this plan"}</strong><small>{new Date(thread.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</small></span>
          <span className="tl-thread-status" data-state={thread.state}>{threadStatus(thread.state, thread.plan_status === "needs_clarification")}</span>
          <WorkspaceIcon name="arrow" />
        </a>
      </li>)}
    </ul>}
    {threads.length > 0 && offset !== null && !error && <button disabled={paging} onClick={() => load(offset)}>
      {paging ? "Loading…" : "Load more threads"}
    </button>}
  </div>;
}

function ThreadWorkspace({ id }: { id: string }) {
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [snapshot, setSnapshot] = useState<ThreadProgress | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [retryCommand, setRetryCommand] = useState<ThreadCommand | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [view, setView] = useState<"graph" | "list" | null>(null);
  const [depth, setDepth] = useState(false);
  const [narrow, setNarrow] = useState(() => matchMedia("(max-width: 760px)").matches);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const inspector = useRef<HTMLHeadingElement>(null);
  const conflictNotice = useRef<HTMLDivElement>(null);
  const focusInspector = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const query = matchMedia("(max-width: 760px)");
    const change = () => setNarrow(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    let current = true;
    void Promise.all([getThread(id), getProgress(id)]).then(([thread, progress]) => {
      if (!current) return;
      setDetail(thread);
      setSnapshot(progress);
    }, (cause) => { if (current) setError(errorText(cause)); });
    return () => { current = false; };
  }, [id, attempt]);

  const active = snapshot?.active_next_steps[0];
  const selected = selection ?? active?.id ?? detail?.graph.entry_node_id ?? null;
  const version = snapshot?.progress.version;
  useEffect(() => {
    if (focusInspector.current) {
      focusInspector.current = false;
      (inspector.current ?? conflictNotice.current)?.focus();
    }
  }, [selected, version, notice]);

  async function update(command: ThreadCommand) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    let saved = false;
    try {
      await submitProgress(id, command);
      saved = true;
      const progress = await getProgress(id);
      if (!mounted.current) return;
      focusInspector.current = true;
      setRetryCommand(null);
      setSelection(progress.progress.active_node_id ?? selected);
      setSnapshot(progress);
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof ApiError && cause.status === 409) {
        setRetryCommand(null);
        try {
          const progress = await getProgress(id);
          if (!mounted.current) return;
          setSnapshot(progress);
          setSelection(null);
          setNotice("This thread changed elsewhere. The latest progress is shown. Review the active step before trying again.");
        } catch {
          if (!mounted.current) return;
          setError("This thread changed elsewhere. Reload progress to continue.");
        }
      } else {
        setRetryCommand(command);
        setNotice(saved
          ? "The update was saved. Retry to load the latest progress."
          : "The update could not be confirmed. Retry the same update safely.");
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function operate(operation: ThreadOperation) {
    if (snapshot && !retryCommand) void update({
      ...operation, expected_version: snapshot.progress.version, idempotency_key: crypto.randomUUID(),
    });
  }

  function select(id: string) {
    setSelection(id);
    requestAnimationFrame(() => inspector.current?.focus({ preventScroll: !narrow }));
  }

  if (error || !detail || !snapshot) return <div className="tl-content tl-threads">
    <a className="tl-text-link tl-thread-back" href={threadsRoute}>← All Action Threads</a>
    {error ? <div className="tl-error" role="alert">{error}
      <button onClick={() => { setError(""); setDetail(null); setSnapshot(null); setAttempt((value) => value + 1); }}>Reload thread</button>
    </div> : <p role="status">Loading Action Thread…</p>}
  </div>;

  const { graph } = detail;
  const { state } = snapshot.progress;
  const clarification = graph.status === "needs_clarification";
  const layout = layoutThread(graph);
  const route = projectRoute(graph, snapshot);
  const node = graph.nodes.find((item) => item.id === selected);
  const shown = view ?? (narrow ? "list" : "graph");
  const locked = busy || !!retryCommand;
  const graphProps = { graph, layout, route, selected, select };
  return <article className="tl-content tl-threads tl-thread-detail" aria-busy={busy}>
    <div className="tl-thread-topline">
      <a className="tl-text-link tl-thread-back" href={threadsRoute}>← All Action Threads</a>
      {detail.provider === "mock" && <span className="tl-thread-fixture">Mock data</span>}
    </div>
    <header className="tl-thread-heading">
      <div>
        <span className="tl-thread-status" data-state={state}>{threadStatus(state, clarification)}</span>
        <h1>{graph.goal?.text ?? "Clarify this plan"}</h1>
      </div>
      {state === "pending" && <div className="tl-thread-buttons tl-thread-review">
        <button className="tl-thread-secondary" disabled={locked} onClick={() => operate({ operation: "reject" })}>Reject thread</button>
        {!clarification && <button className="tl-primary" disabled={locked} onClick={() => operate({ operation: "approve" })}>Approve thread</button>}
      </div>}
    </header>
    {notice && <div className="tl-thread-notice" role="alert" ref={conflictNotice} tabIndex={-1}>{notice}
      {retryCommand && <button className="tl-thread-secondary" disabled={busy} onClick={() => void update(retryCommand)}>Retry update</button>}
    </div>}
    {active && <div className="tl-thread-next" aria-live="polite">
      <WorkspaceIcon name="step" /><span><small>Next step</small><strong>{active.title}</strong></span>
      <button className="tl-thread-secondary" onClick={() => select(active.id)}>View active step</button>
    </div>}
    {graph.success_criteria.length > 0 && <details className="tl-thread-success">
      <summary>Success criteria</summary>
      <ul>{graph.success_criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul>
    </details>}
    {clarification ? <section className="tl-thread-clarification">
      <h2>Questions to resolve</h2>
      <ul>{graph.missing_information.map((item, index) => <li key={index}>{item}</li>)}</ul>
      <ThreadContext graph={graph} />
    </section> : <>
      <div className="tl-thread-view" aria-label="Thread view">
        <button type="button" aria-pressed={shown === "graph"} onClick={() => setView("graph")}><WorkspaceIcon name="branch" /> Graph</button>
        <button type="button" aria-pressed={shown === "list"} onClick={() => setView("list")}><WorkspaceIcon name="tasks" /> List</button>
        <button type="button" className="tl-thread-depth-toggle" aria-pressed={shown === "graph" && depth}
          onClick={() => { setDepth(shown === "list" || !depth); setView("graph"); }}>Depth Mode</button>
      </div>
      <div className="tl-thread-columns">
        <div className="tl-thread-route">
          {shown === "graph" ? <ThreadGraph {...graphProps} depth={depth} /> : <ThreadList {...graphProps} />}
        </div>
        {node && <div className="tl-thread-side"><ThreadInspector
          key={node.id + "/" + snapshot.progress.version} graph={graph} node={node}
          state={route.nodeState(node.id)} active={active} pending={locked}
          heading={inspector} onOperation={operate}
        /></div>}
      </div>
    </>}
    <ThreadHistory graph={graph} events={snapshot.events} />
  </article>;
}

export function ActionThreads({ id }: { id: string | null }) {
  return id ? <ThreadWorkspace key={id} id={id} /> : <ThreadIndex />;
}
