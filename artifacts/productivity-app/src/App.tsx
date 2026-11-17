import { CaptureWorkspace } from "./CaptureWorkspace";
import { api } from "./api";
import { useEffect, useState, useMemo, type FormEvent } from "react";
import type { Project, Task } from "./types";
import CityView from "./city/CityView";
import { ViewSwitch } from "./ViewSwitch";
import { TaskSheet } from "./TaskSheet";
export default function App() {
  const [workspace, setWorkspace] = useState<"focus" | "capture">(location.hash.startsWith("#capture") ? "capture" : "focus");
  const [composerOpen, setComposerOpen] = useState(false),
    [notice, setNotice] = useState("");
  const [view, setView] = useState<"city" | "list">("city");
  const [initializing, setInitializing] = useState(true);
  const [auth, setAuth] = useState<{
      user: { name: string } | null;
      configured: boolean;
    } | null>(null),
    [projects, setProjects] = useState<Project[]>([]),
    [tasks, setTasks] = useState<Task[]>([]),
    [project, setProject] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Task | null>(null);
  async function load() {
    const [p, t] = await Promise.all([api("/projects"), api("/tasks")]);
    setProjects(p);
    setTasks((previous) => {
      const byId = new Map(previous.map((task) => [task.id, task]));
      return t.map((task: Task) =>
        byId.get(task.id)?.version === task.version ? byId.get(task.id)! : task,
      );
    });
    setEditing((previous) =>
      previous
        ? (t.find((task: Task) => task.id === previous.id) ?? null)
        : null,
    );
  }
  async function initialize() {
    setInitializing(true);
    setError("");
    try {
      const a = await api("/auth/me");
      if (typeof a.configured !== "boolean" || !("user" in a))
        throw new Error(
          "The authentication API returned an invalid response. Check API routing.",
        );
      setAuth(a);
      if (a.user) await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInitializing(false);
    }
  }
  useEffect(() => {
    void initialize();
  }, []);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      setNotice("Workspace saved");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const b = Object.fromEntries(new FormData(form));
    await act(async () => {
      if (editing) {
        await api("/tasks/" + editing.id, "PATCH", { ...editing, ...b });
        setEditing(null);
      } else await api("/tasks", "POST", b);
      form.reset();
      setComposerOpen(false);
    });
  }
  useEffect(() => {
    function shortcut(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (e.key === "Escape" && !composerOpen) {
        setComposerOpen(false);
        setEditing(null);
      }
      if (
        e.key.toLowerCase() === "n" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) &&
        workspace === "focus" &&
        auth?.user &&
        !target.isContentEditable &&
        !e.altKey &&
        !e.repeat
      ) {
        e.preventDefault();
        setEditing(null);
        setComposerOpen(true);
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [auth, composerOpen, workspace]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  const visible = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (!project || t.project_id === project) &&
          (filter === "all" || t.status === filter) &&
          t.title.toLowerCase().includes(query.toLowerCase()),
      ),
    [tasks, project, filter, query],
  );
  const cityProjects = useMemo(
    () => (project ? projects.filter((p) => p.id === project) : projects),
    [projects, project],
  );
  if (auth?.user && workspace === "capture") return <CaptureWorkspace name={auth.user.name} onExit={() => { setWorkspace("focus"); history.replaceState(null,"",location.pathname+location.search); }} />;
  return (
    <div className="shell">
      <aside aria-label="Workspace navigation">
        <a className="brand" href="/">
          ◈{" "}
          <span>
            FOCUS CITY<small>YOUR PERSONAL WORKSPACE</small>
          </span>
        </a>
        {auth?.user && <button className="threadline-entry" onClick={() => {setWorkspace("capture");history.replaceState(null,"","#capture");}}>⌁ Threadline Capture ↗</button>}
        <div className="side-label">YOUR WORKSPACE</div>
        <button
          aria-current={!project ? "page" : undefined}
          className={!project ? "active" : ""}
          onClick={() => setProject("")}
        >
          ▦ &nbsp; All neighborhoods <span>{tasks.length}</span>
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            aria-current={project === p.id ? "page" : undefined}
            className={project === p.id ? "active" : ""}
            onClick={() => setProject(p.id)}
          >
            ◇ &nbsp; {p.name}
            <span>{tasks.filter((t) => t.project_id === p.id).length}</span>
          </button>
        ))}
        {auth?.user && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget;
              const name = new FormData(f).get("name");
              void act(async () => {
                await api("/projects", "POST", { name });
                f.reset();
              });
            }}
          >
            <input
              name="name"
              aria-label="New neighborhood name"
              placeholder="+ New neighborhood"
              required
              maxLength={100}
            />
            <button disabled={busy}>Create neighborhood</button>
          </form>
        )}
        <div className="side-footer">
          <i /> PRIVATE WORKSPACE<small>Built around your focus.</small>
        </div>
      </aside>
      <main>
        <header>
          <span>
            WORKSPACE /{" "}
            <b>{projects.find((p) => p.id === project)?.name ?? "OVERVIEW"}</b>
          </span>
          {auth?.user ? (
            <button
              onClick={() =>
                void api("/auth/logout", "POST")
                  .then(() => location.reload())
                  .catch((e) => setError(e.message))
              }
            >
              Sign out · {auth.user.name}
            </button>
          ) : (
            <span>YOUR NEXT CHAPTER STARTS HERE</span>
          )}
        </header>
        <section className="intro">
          <div>
            <div className="eyebrow">YOUR WORK, TAKING SHAPE</div>
            <h1>
              {projects.find((p) => p.id === project)?.name ??
                "Your focus, in perspective"}
              <span>.</span>
            </h1>
            <p>A little progress. A city of possibilities.</p>
          </div>
          {auth?.user && (
            <button
              className="primary"
              onClick={() => {
                setEditing(null);
                setComposerOpen(true);
              }}
            >
              ＋ New task <kbd>N</kbd>
            </button>
          )}
        </section>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {!auth?.user ? (
          <section className="welcome">
            <div className="emblem">◈</div>
            <h2>Your city starts with a single task.</h2>
            <p>
              A private workspace for your projects, priorities, and everything
              you want to move forward.
            </p>
            {auth?.configured ? (
              <a className="primary" href="/api/auth/google">
                Sign in with Google ↗
              </a>
            ) : (
              <div className="setup">
                {initializing
                  ? "Connecting to your workspace…"
                  : auth
                    ? "Google sign-in is not configured in the API process. Check Replit Secrets and restart the API Server workflow."
                    : "Unable to connect to your workspace."}
                {!initializing && (
                  <button className="primary" onClick={() => void initialize()}>
                    Retry connection
                  </button>
                )}
              </div>
            )}
            <div className="preview-grid">
              <span>
                01 / ORGANIZE
                <br />
                <b>A place for every project</b>
              </span>
              <span>
                02 / PRIORITIZE
                <br />
                <b>Clarity on what comes next</b>
              </span>
              <span>
                03 / PROGRESS
                <br />
                <b>Small steps. Real momentum.</b>
              </span>
            </div>
          </section>
        ) : (
          <>
            <div className="stats" aria-label="Workspace progress">
              {[
                ["OPEN TASKS", tasks.filter((t) => t.status !== "done").length],
                ["COMPLETED", tasks.filter((t) => t.status === "done").length],
                ["NEIGHBORHOODS", projects.length],
              ].map(([l, n]) => (
                <div key={l}>
                  <small>{l}</small>
                  <strong>{n}</strong>
                </div>
              ))}
            </div>
            <ViewSwitch view={view} onChange={setView}>
              {tasks.filter((t) => t.status === "done").length} of{" "}
              {tasks.length} tasks complete
            </ViewSwitch>
            <div
              className="tools workspace-filters"
              role="search"
              aria-label="Filter workspace tasks"
            >
              <input
                aria-label="Search tasks"
                placeholder="Search your tasks…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="Filter status"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
              {(query || filter !== "all") && (
                <button
                  className="clear-filters"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
            {view === "city" && (
              <CityView
                filtered={Boolean(query || filter !== "all")}
                projects={cityProjects}
                tasks={visible}
                selected={visible.find((t) => t.id === editing?.id) ?? null}
                onSelect={setEditing}
                onList={() => setView("list")}
                busy={busy}
                onEdit={() => setComposerOpen(true)}
                onComplete={(task) =>
                  void act(() =>
                    api("/tasks/" + task.id, "PATCH", {
                      ...task,
                      status: task.status === "done" ? "todo" : "done",
                    }),
                  )
                }
              />
            )}
            <div
              className={
                "workspace " + (view === "city" ? "city-workspace" : "")
              }
            >
              <section className="panel">
                <div className="panel-title">
                  <h2>Tasks</h2>
                  <span>
                    {visible.length} of{" "}
                    {
                      tasks.filter((t) => !project || t.project_id === project)
                        .length
                    }{" "}
                    tasks
                  </span>
                </div>
                {visible.length === 0 ? (
                  <div className="empty">
                    ◇<h3>Room for your next idea.</h3>
                    <p>
                      {query || filter !== "all"
                        ? "No tasks match these filters."
                        : "Create a task to give your next step a place."}
                    </p>
                    {(query || filter !== "all") && (
                      <button
                        className="clear-filters"
                        onClick={() => {
                          setQuery("");
                          setFilter("all");
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                ) : (
                  visible.map((t) => (
                    <article className="task" key={t.id}>
                      <button
                        disabled={busy}
                        aria-label={
                          t.status === "done" ? "Reopen task" : "Complete task"
                        }
                        className={
                          "check " + (t.status === "done" ? "checked" : "")
                        }
                        onClick={() =>
                          void act(() =>
                            api("/tasks/" + t.id, "PATCH", {
                              ...t,
                              status: t.status === "done" ? "todo" : "done",
                            }),
                          )
                        }
                      >
                        {t.status === "done" ? "✓" : ""}
                      </button>
                      <button
                        className="task-title"
                        onClick={() => {
                          setEditing(t);
                          setComposerOpen(true);
                        }}
                      >
                        <b>{t.title}</b>
                        <small>
                          {projects.find((p) => p.id === t.project_id)?.name}{" "}
                          <span className="task-status">
                            {" "}
                            · {t.status.replace("_", " ")}
                          </span>
                          {t.due_date && (
                            <time dateTime={t.due_date}>
                              {" "}
                              ·{" "}
                              {new Intl.DateTimeFormat(undefined, {
                                month: "short",
                                day: "numeric",
                              }).format(
                                new Date(t.due_date.slice(0, 10) + "T12:00:00"),
                              )}
                            </time>
                          )}
                        </small>
                      </button>
                      <span className={"priority " + t.priority}>
                        {t.priority}
                      </span>
                      <button
                        disabled={busy}
                        aria-label={"Delete " + t.title}
                        onClick={() => {
                          if (confirm("Delete this task?"))
                            void act(() => api("/tasks/" + t.id, "DELETE"));
                        }}
                      >
                        ×
                      </button>
                    </article>
                  ))
                )}
              </section>
              <TaskSheet
                open={composerOpen}
                onClose={() => setComposerOpen(false)}
              >
                <section
                  className="panel composer"
                  id="task-details"
                  aria-label={
                    editing ? `Task details: ${editing.title}` : "Create task"
                  }
                >
                  <div className="panel-title">
                    <h2>{editing ? "Edit task" : "New task"}</h2>
                    <button
                      type="button"
                      aria-label="Close task editor"
                      onClick={() => setComposerOpen(false)}
                    >
                      ✕
                    </button>
                  </div>
                  {error && (
                    <div className="editor-error" role="alert">
                      {error}
                    </div>
                  )}
                  <form key={editing?.id ?? "new"} onSubmit={save}>
                    <label>
                      Task name
                      <input
                        autoComplete="off"
                        name="title"
                        placeholder="What needs your focus?"
                        required
                        maxLength={300}
                        defaultValue={editing?.title}
                      />
                    </label>
                    <label>
                      Details
                      <textarea
                        name="description"
                        placeholder="Notes, links, or a next step…"
                        defaultValue={editing?.description}
                      />
                    </label>
                    {!editing && (
                      <label>
                        Neighborhood
                        <select
                          name="project_id"
                          defaultValue={project || projects[0]?.id}
                        >
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="form-row">
                      <label>
                        Priority
                        <select
                          name="priority"
                          defaultValue={editing?.priority ?? "medium"}
                        >
                          <option>low</option>
                          <option>medium</option>
                          <option>high</option>
                        </select>
                      </label>
                      <label>
                        Deadline
                        <input
                          type="date"
                          name="due_date"
                          defaultValue={editing?.due_date?.slice(0, 10) ?? ""}
                        />
                      </label>
                    </div>
                    {editing && (
                      <label>
                        Status
                        <select name="status" defaultValue={editing.status}>
                          <option value="todo">To do</option>
                          <option value="in_progress">In progress</option>
                          <option value="done">Done</option>
                        </select>
                      </label>
                    )}
                    <button
                      className="primary"
                      disabled={busy || (!editing && projects.length === 0)}
                    >
                      {busy
                        ? "Saving…"
                        : editing
                          ? "Save changes"
                          : "Create task"}
                    </button>
                  </form>
                </section>
              </TaskSheet>
            </div>
          </>
        )}
        <div className="save-notice" role="status">
          {notice}
        </div>
        <footer>
          FOCUS CITY <span>A quieter place to do meaningful work.</span>
        </footer>
      </main>
    </div>
  );
}
