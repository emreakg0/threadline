import { useRef, useState, type FormEvent } from "react";
import { api } from "./api";
import type { Project, Task } from "./types";
import { WorkspaceIcon } from "./WorkspaceIcon";

export type Evidence = {
  id: string;
  quote: string;
  start: number;
  end: number;
};
export type PlanSource = {
  provider: string | null;
  revision: number;
  run_id: string | null;
  evidence: Evidence[];
  uncertainty_reason: string | null;
};
type Fields = {
  title: string;
  description: string;
  category: string;
  project_id: string;
  priority: string;
  schedule: string;
  due_date: string;
};
export type ActionDraft = { values: Fields; version: number };
export type Action = Omit<Fields, "priority" | "project_id" | "due_date"> &
  PlanSource & {
    id: string;
    version: number;
    state: "needs_review" | "confirmed" | "dismissed";
    priority: string | null;
    project_id: string | null;
    due_date: string | null;
    converted: boolean;
    task: Task | null;
    proposal: {
      title: string;
      description: string | null;
      category: string | null;
      suggested_priority: string | null;
      deadline_phrase: string | null;
    } | null;
  };
const taskStates = { todo: "To do", in_progress: "In progress", done: "Done" };

export function PlanEvidence({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return null;
  return (
    <details className="tl-plan-evidence">
      <summary>Original source evidence ({evidence.length})</summary>
      {evidence.map((entry) => (
        <figure key={entry.id}>
          <blockquote>{entry.quote}</blockquote>
          <figcaption>
            Code-point offsets {entry.start}–{entry.end}
          </figcaption>
        </figure>
      ))}
    </details>
  );
}

export function PlanAction({
  action,
  path,
  projects,
  expanded,
  onToggle,
  onRefresh,
  readOnly,
  draft,
  setDraft,
}: {
  action: Action;
  path: string;
  projects: Project[];
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  readOnly: boolean;
  draft?: ActionDraft;
  setDraft: (draft: ActionDraft | null) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const resource = path + "/" + action.id;
  const stored = {
    title: action.title,
    description: action.description,
    category: action.category,
    project_id: action.project_id ?? "",
    priority: action.priority ?? "",
    due_date: action.due_date ?? "",
    schedule: action.schedule,
  };
  const values = draft?.values ?? {
    ...stored,
    description:
      action.version === 1
        ? (action.proposal?.description ?? stored.description)
        : stored.description,
    category:
      action.version === 1
        ? (action.proposal?.category ?? stored.category)
        : stored.category,
  };
  const stale = !!draft && draft.version !== action.version;
  const approved = action.state === "confirmed";
  const dismissed = action.state === "dismissed";
  const task = action.task;
  const taskStatus = task && taskStates[task.status as keyof typeof taskStates];
  const provenance =
    action.provider === "mock"
      ? "Mock proposal"
      : action.proposal
        ? "AI proposal"
        : "Manual";
  const date =
    (action.due_date &&
      (approved ? action.due_date : "Draft date · " + action.due_date)) ||
    (action.schedule === "unresolved"
      ? "Needs date confirmation"
      : "Unscheduled");
  const hasApprovalFields = !!(
    values.title.trim() &&
    values.priority &&
    values.project_id &&
    values.schedule !== "unresolved" &&
    (values.schedule !== "scheduled" || values.due_date)
  );
  function change(field: keyof Fields, value: string) {
    setDraft({
      values: { ...values, [field]: value },
      version: draft?.version ?? action.version,
    });
  }
  async function mutate(work: () => Promise<unknown>, resetDraft = false) {
    if (running.current || readOnly) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
      if (resetDraft) setDraft(null);
      onRefresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function save(
    state: Action["state"],
    changes = values,
    version = draft?.version ?? action.version,
  ) {
    return mutate(
      () =>
        api(resource, "PATCH", {
          ...changes,
          version,
          state,
          project_id: changes.project_id || null,
          priority: changes.priority || null,
          due_date: changes.schedule === "scheduled" ? changes.due_date : null,
        }),
      true,
    );
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const button = (event.nativeEvent as SubmitEvent).submitter;
    if (!stale && !dismissed && (!approved || draft))
      void save(
        button?.getAttribute("value") === "approve"
          ? "confirmed"
          : "needs_review",
      );
  }

  return (
    <article className="tl-plan-action">
      <button
        className="tl-plan-row"
        id={"tl-plan-row-" + action.id}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="tl-plan-row-icon">
          <WorkspaceIcon name={action.converted ? "review" : "capture"} />
        </span>
        <span>
          <strong>{task?.title ?? action.title}</strong>
          <small>
            {[
              provenance,
              action.category ||
                (action.proposal?.category &&
                  action.proposal.category + " · suggested"),
              action.priority &&
                action.priority +
                  (approved ? " · approved priority" : " · selected priority"),
              projects.find(
                (project) =>
                  project.id === (task?.project_id ?? action.project_id),
              )?.name,
            ]
              .filter(Boolean)
              .join(" · ")}
          </small>
        </span>
        <span
          className="tl-plan-state"
          data-attention={!action.converted && action.schedule === "unresolved"}
        >
          {taskStatus ??
            (action.converted
              ? "Task removed"
              : dismissed
                ? "Dismissed"
                : date)}
        </span>
        <WorkspaceIcon name="arrow" />
      </button>
      {expanded && (
        <div className="tl-plan-detail">
          <div className="tl-plan-context">
            <p>
              {provenance} · source revision {action.revision}
              {action.run_id && (
                <>
                  {" "}
                  · <a href={"#capture/run/" + action.run_id}>Recorded run</a>
                </>
              )}
            </p>
            {action.proposal && (
              <dl>
                <div>
                  <dt>Suggested title</dt>
                  <dd>{action.proposal.title}</dd>
                </div>
                {action.proposal.description && (
                  <div>
                    <dt>Suggested context</dt>
                    <dd>{action.proposal.description}</dd>
                  </div>
                )}
                {action.proposal.category && (
                  <div>
                    <dt>Suggested category</dt>
                    <dd>{action.proposal.category}</dd>
                  </div>
                )}
                {action.proposal.suggested_priority && (
                  <div>
                    <dt>Suggested priority</dt>
                    <dd>{action.proposal.suggested_priority}</dd>
                  </div>
                )}
                {action.proposal.deadline_phrase && (
                  <div>
                    <dt>Source deadline</dt>
                    <dd>“{action.proposal.deadline_phrase}”</dd>
                  </div>
                )}
              </dl>
            )}
            {action.uncertainty_reason && (
              <p
                className={
                  action.schedule === "unresolved"
                    ? "tl-plan-notice"
                    : undefined
                }
              >
                <small>Original proposal uncertainty</small>
                {action.uncertainty_reason}
              </p>
            )}
            <PlanEvidence evidence={action.evidence} />
          </div>
          {action.converted ? (
            task ? (
              <div className="tl-plan-task">
                {task.description && <p>{task.description}</p>}
                <p>
                  {task.due_date ? "Due " + task.due_date : "Unscheduled"} ·{" "}
                  {task.priority} priority
                </p>
                <label>
                  Task status
                  <select
                    value={task.status}
                    disabled={busy || readOnly}
                    onChange={(event) => {
                      const status = event.target.value;
                      void mutate(() =>
                        api("/tasks/" + task.id, "PATCH", { ...task, status }),
                      );
                    }}
                  >
                    {Object.entries(taskStates).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <a className="tl-text-link" href={"#city/task/" + task.id}>
                  Open linked task in Focus City <WorkspaceIcon name="arrow" />
                </a>
              </div>
            ) : (
              <p>Task removed. The conversion record is retained.</p>
            )
          ) : (
            <form className="tl-plan-form" onSubmit={submit}>
              <fieldset disabled={busy || readOnly}>
                <label className="tl-plan-wide">
                  Action title
                  <input
                    required
                    maxLength={300}
                    name="title"
                    value={values.title}
                    onChange={(e) => change("title", e.target.value)}
                  />
                </label>
                <label className="tl-plan-wide">
                  Description
                  <textarea
                    rows={2}
                    maxLength={1200}
                    name="description"
                    value={values.description}
                    onChange={(e) => change("description", e.target.value)}
                  />
                </label>
                <label>
                  Category
                  <input
                    maxLength={100}
                    name="category"
                    value={values.category}
                    onChange={(e) => change("category", e.target.value)}
                  />
                </label>
                <label>
                  Project
                  <select
                    name="project_id"
                    value={values.project_id}
                    onChange={(e) => change("project_id", e.target.value)}
                  >
                    <option value="">Choose a project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    name="priority"
                    value={values.priority}
                    onChange={(e) => change("priority", e.target.value)}
                  >
                    <option value="">Choose a priority</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label>
                  Scheduling
                  <select
                    name="schedule"
                    value={values.schedule}
                    onChange={(e) => change("schedule", e.target.value)}
                  >
                    <option value="unresolved">Needs date confirmation</option>
                    <option value="unscheduled">Leave unscheduled</option>
                    <option value="scheduled">Choose a date</option>
                  </select>
                </label>
                {values.schedule === "scheduled" && (
                  <label>
                    Calendar date
                    <input
                      type="date"
                      required
                      min="0001-01-01"
                      max="9999-12-31"
                      name="due_date"
                      value={values.due_date}
                      onChange={(e) => change("due_date", e.target.value)}
                    />
                  </label>
                )}
                <div className="tl-plan-form-actions tl-plan-wide">
                  {dismissed ? (
                    <button
                      type="button"
                      onClick={() =>
                        void save("needs_review", stored, action.version)
                      }
                    >
                      Return to review
                    </button>
                  ) : (
                    <>
                      {(!approved || draft) && (
                        <>
                          <button
                            type="submit"
                            disabled={stale || !values.title.trim()}
                          >
                            Save draft
                          </button>
                          <button
                            type="submit"
                            value="approve"
                            className="tl-primary"
                            disabled={stale || !hasApprovalFields}
                          >
                            Save and approve
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        disabled={!!draft}
                        onClick={() =>
                          void save("dismissed", stored, action.version)
                        }
                      >
                        Dismiss
                      </button>
                      {approved && !draft && (
                        <button
                          type="button"
                          className="tl-primary"
                          disabled={!!draft}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Create the task “" +
                                  action.title +
                                  "” with the approved details?",
                              )
                            )
                              void mutate(() =>
                                api(resource + "/convert", "POST", {
                                  confirm: true,
                                  version: action.version,
                                }),
                              );
                          }}
                        >
                          Create task
                        </button>
                      )}
                    </>
                  )}
                </div>
                {!approved && !dismissed && !hasApprovalFields && (
                  <p className="tl-plan-hint tl-plan-wide">
                    Choose a project, priority, and scheduling decision to
                    approve.
                  </p>
                )}
              </fieldset>
            </form>
          )}
          {(error || stale) && (
            <div className="tl-error" role="alert">
              {error || "The saved action changed. Your edits are still here."}
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    draft &&
                    !window.confirm(
                      "Discard these unsaved action edits and reload?",
                    )
                  )
                    return;
                  setDraft(null);
                  setError("");
                  onRefresh();
                }}
              >
                Reload saved details
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
