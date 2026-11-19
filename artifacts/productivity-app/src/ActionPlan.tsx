import { useEffect, useRef, useState, useId, type FormEvent } from "react";
import { api } from "./api";
import type { Project } from "./types";
import {
  PlanAction,
  PlanEvidence,
  type Action,
  type ActionDraft,
  type PlanSource,
} from "./PlanAction";
import { WorkspaceIcon } from "./WorkspaceIcon";
import "./action-plan.css";

type Plan = {
  document: { id: string; title: string; archived_at: string | null };
  actions: Action[];
  summary: (PlanSource & { content: string; review_state: string }) | null;
};

export function ActionPlan({
  id,
  visible,
  projects,
  onDraftChange,
}: {
  id: string;
  visible: boolean;
  projects: Project[];
  onDraftChange: (id: string, dirty: boolean) => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [revision, setRevision] = useState(0);
  const [title, setTitle] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ActionDraft>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const actionId = useRef<string | null>(null);
  const addInFlight = useRef(false);
  const focusAction = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const manualInput = useId();
  const progressId = useId();
  const path = "/plans/" + encodeURIComponent(id);
  useEffect(() => {
    if (!visible) return;
    let current = true;
    setLoading(true);
    setRefreshError("");
    api(path)
      .then((data: Plan) => {
        if (current) setPlan(data);
      })
      .catch((cause: Error) => {
        if (current) setRefreshError(cause.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [path, visible, revision]);
  useEffect(() => {
    if (visible) heading.current?.focus();
  }, [visible]);

  const dirty = !!title || Object.keys(drafts).length > 0;
  useEffect(() => onDraftChange(id, dirty), [id, dirty, onDraftChange]);
  useEffect(() => {
    if (!visible || loading || !focusAction.current) return;
    document.getElementById("tl-plan-row-" + focusAction.current)?.focus();
    focusAction.current = null;
  }, [visible, loading]);

  function setActionDraft(actionId: string, draft: ActionDraft | null) {
    setDrafts((previous) => {
      if (draft) return { ...previous, [actionId]: draft };
      if (!previous[actionId]) return previous;
      const next = { ...previous };
      delete next[actionId];
      return next;
    });
  }
  function refresh() {
    setLoading(true);
    setRevision((value) => value + 1);
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    if (addInFlight.current || !title.trim() || plan?.document.archived_at)
      return;
    addInFlight.current = true;
    setAdding(true);
    setError("");
    const id = (actionId.current ??= crypto.randomUUID());
    try {
      await api(path, "POST", { id, title });
      setTitle("");
      actionId.current = null;
      setSelected(id);
      focusAction.current = id;
      refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      addInFlight.current = false;
      setAdding(false);
    }
  }

  const actions = plan?.actions ?? [];
  const tracked = actions.filter((action) => action.task);
  const completed = tracked.filter(
    (action) => action.task?.status === "done",
  ).length;
  const groups = [
    {
      title: "Needs attention",
      kind: "attention",
      items: actions.filter(
        (action) => !action.converted && action.state === "needs_review",
      ),
    },
    {
      title: "Ready to act",
      kind: "ready",
      items: actions.filter(
        (action) =>
          !action.converted &&
          action.state === "confirmed" &&
          action.schedule !== "scheduled",
      ),
    },
    {
      title: "Scheduled",
      kind: "scheduled",
      items: actions.filter(
        (action) =>
          !action.converted &&
          action.state === "confirmed" &&
          action.schedule === "scheduled",
      ),
    },
    {
      title: "Linked tasks",
      kind: "tracked",
      items: actions.filter((action) => action.converted),
    },
    {
      title: "Dismissed",
      kind: "dismissed",
      items: actions.filter(
        (action) => !action.converted && action.state === "dismissed",
      ),
    },
  ];
  return (
    <div className="tl-content tl-action-plan">
      <header className="tl-page-heading tl-plan-heading">
        <div>
          <a className="tl-text-link" href="#capture/plan">
            ← All brain dumps
          </a>
          <h1 ref={heading} tabIndex={-1}>
            Action Plan
          </h1>
          {plan && (
            <a
              className="tl-plan-source"
              href={"#capture/document/" + plan.document.id}
            >
              <WorkspaceIcon name="capture" /> {plan.document.title}
            </a>
          )}
        </div>
        {tracked.length > 0 && (
          <div className="tl-plan-progress">
            <label htmlFor={progressId}>
              {completed} of {tracked.length} linked tasks done
            </label>
            <progress id={progressId} value={completed} max={tracked.length} />
          </div>
        )}
      </header>
      {loading && <p role="status">Refreshing plan…</p>}
      {refreshError && (
        <div className="tl-error" role="alert">
          {refreshError} <button onClick={refresh}>Retry plan</button>
        </div>
      )}
      {plan && (
        <>
          {plan.document.archived_at && (
            <p className="tl-plan-notice">
              This brain dump is archived. Restore it before changing the plan.
            </p>
          )}
          {plan.summary && plan.summary.review_state !== "dismissed" && (
            <details className="tl-plan-summary">
              <summary>
                {plan.summary.provider === "mock" ? "Mock " : ""}
                {plan.summary.review_state === "confirmed"
                  ? "reviewed summary"
                  : "draft summary"}{" "}
                · revision {plan.summary.revision}
              </summary>
              <p>{plan.summary.content}</p>
              {plan.summary.uncertainty_reason && (
                <p className="tl-plan-notice">
                  {plan.summary.uncertainty_reason}
                </p>
              )}
              <PlanEvidence evidence={plan.summary.evidence} />
            </details>
          )}
          {!plan.document.archived_at && (
            <form className="tl-plan-add" onSubmit={(event) => void add(event)}>
              <label htmlFor={manualInput}>Add a manual action</label>
              <div>
                <input
                  id={manualInput}
                  name="manual-action-title"
                  placeholder="What do you want to do?"
                  value={title}
                  readOnly={adding}
                  required
                  maxLength={300}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <button
                  className="tl-primary"
                  disabled={adding || loading || !title.trim()}
                >
                  <WorkspaceIcon name="plus" />{" "}
                  {adding ? "Adding…" : "Add action"}
                </button>
              </div>
            </form>
          )}
          {error && (
            <div className="tl-error" role="alert">
              {error}
            </div>
          )}
          {!actions.length && (
            <div className="tl-plan-empty">
              <h2>No actions yet</h2>
              <p>
                Start with one thing you can do. Add the details, approve the
                action, then create a task when you’re ready.
              </p>
              <p>Add actions manually, or return to the brain dump to check AI availability.</p>
            </div>
          )}
          {groups
            .filter((group) => group.items.length)
            .map((group) => (
              <section
                key={group.kind}
                className="tl-plan-group"
                data-group={group.kind}
              >
                <h2>
                  {group.title} <small>{group.items.length}</small>
                </h2>
                {group.items.map((action) => (
                  <PlanAction
                    key={action.id}
                    action={action}
                    path={path}
                    projects={projects}
                    expanded={selected === action.id}
                    onToggle={() =>
                      setSelected((current) =>
                        current === action.id ? null : action.id,
                      )
                    }
                    onRefresh={() => {
                      focusAction.current = action.id;
                      refresh();
                    }}
                    draft={drafts[action.id]}
                    setDraft={(draft) => setActionDraft(action.id, draft)}
                    readOnly={
                      !!plan.document.archived_at || loading || !!refreshError
                    }
                  />
                ))}
              </section>
            ))}
        </>
      )}
    </div>
  );
}
