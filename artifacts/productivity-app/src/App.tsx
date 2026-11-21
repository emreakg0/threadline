import { CaptureWorkspace } from "./CaptureWorkspace";
import { api } from "./api";
import { lazy, Suspense, useEffect, useState, useMemo, type FormEvent } from "react";
import type { Project, Task } from "./types";
import { WorkspaceIcon } from "./WorkspaceIcon";
import { PublicLinks, PublicPage, publicPages } from "./PublicPages";
import { TaskSheet } from "./TaskSheet";
const tasksRoute = "#capture/tasks";
const cityRoute = tasksRoute + "/city";
const CityView = lazy(() => import("./city/CityView"));

function currentRoute() {
  // Keep task links shared before the standalone transition working.
  const publicRoute = "#" + location.pathname.replace(/^\/|\/$/g, "");
  if (publicPages.includes(publicRoute)) return publicRoute;
  return location.hash.replace(/^#city(?=\/|$)/, tasksRoute);
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);
  const inTasks = route === tasksRoute || route.startsWith(tasksRoute + "/");
  const inCity = route === cityRoute;
  const taskId = /^#capture\/tasks\/task\/([a-f0-9-]{36})$/i.exec(route)?.[1];
  const [selectedCityTaskId, setSelectedCityTaskId] = useState<string>();
  const [composerOpen, setComposerOpen] = useState(false),
    [notice, setNotice] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
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
  async function load(isCurrent = () => true) {
    const [p, t] = await Promise.all([api("/projects"), api("/tasks")]);
    if (!isCurrent()) return [];
    setProjects(p);
    setTasks((previous) => {
      const byId = new Map(previous.map((task) => [task.id, task]));
      return t.map((task: Task) =>
        byId.get(task.id)?.version === task.version ? byId.get(task.id)! : task,
      );
    });
    return t as Task[];
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
    const expired = () => setSessionExpired(true);
    window.addEventListener("threadline:session-expired", expired);
    return () => window.removeEventListener("threadline:session-expired", expired);
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
  function toggleTask(task: Task) {
    void act(() => api("/tasks/" + task.id, "PATCH", {
      ...task,
      status: task.status === "done" ? "todo" : "done",
    }));
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
      if (
        e.key.toLowerCase() === "n" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) &&
        inTasks &&
        !composerOpen &&
        !initializing &&
        !tasksLoading &&
        !document.querySelector("dialog[open]") &&
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
  }, [auth, composerOpen, inTasks, initializing, tasksLoading]);
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
  const selectedCityTask = visible.find((task) => task.id === selectedCityTaskId) ?? null;
  useEffect(() => {
    const change = () => setRoute(currentRoute());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);

  useEffect(() => {
    setComposerOpen(false);
    setSelectedCityTaskId(undefined);
  }, [route]);

  useEffect(() => {
    if (!auth?.user || initializing || !inTasks) return;
    let current = true;
    setError("");
    setTasksLoading(true);
    void load(() => current)
      .then((latest) => {
        if (!current || !taskId) return;
        const target = latest.find((task) => task.id === taskId);
        if (!target) {
          setError("Linked task not found.");
          return;
        }
        setEditing(target);
        setComposerOpen(true);
      })
      .catch((cause: Error) => {
        if (current) setError(cause.message);
      })
      .finally(() => {
        if (current) setTasksLoading(false);
      });
    return () => {
      current = false;
    };
  }, [auth?.user, initializing, inTasks, taskId]);

  const taskWorkspace = inTasks && (
    <section className="tl-content tl-tasks">
      <div className="tl-page-heading">
        <div>
          <h1>Tasks</h1>
          <p>
            {tasks.filter((task) => task.status === "done").length} of{" "}
            {tasks.length} complete
          </p>
        </div>
        <button
          className="tl-primary"
          disabled={initializing || tasksLoading || busy}
          onClick={() => {
            setEditing(null);
            setError("");
            setComposerOpen(true);
          }}
        >
          + New task <kbd>N</kbd>
        </button>
      </div>
      <div className="view-switch" role="group" aria-label="Task view">
        <button aria-pressed={inCity} onClick={() => { location.hash = cityRoute; }}>3D City</button>
        <button aria-pressed={!inCity} onClick={() => { location.hash = tasksRoute; }}>List</button>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <form
        className="tools"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const name = new FormData(form).get("name");
          void act(async () => {
            await api("/projects", "POST", { name });
            form.reset();
          });
        }}
      >
        <input
          name="name"
          aria-label="New project name"
          placeholder="New project name"
          required
          maxLength={100}
        />
        <button
          className="tl-task-secondary"
          disabled={initializing || tasksLoading || busy}
        >
          Create project
        </button>
      </form>
      <div
        className="tools workspace-filters"
        role="search"
        aria-label="Filter tasks"
      >
        <select
          aria-label="Filter project"
          value={project}
          onChange={(event) => setProject(event.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
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
      {inCity && (tasksLoading ? <p role="status">Loading tasks…</p> : (
        <Suspense fallback={<p role="status">Preparing your city…</p>}>
          <CityView
            filtered={Boolean(query || filter !== "all")}
            projects={project ? projects.filter((item) => item.id === project) : projects}
            tasks={visible}
            selected={selectedCityTask}
            onSelect={(task) => setSelectedCityTaskId(task?.id)}
            onList={() => { location.hash = tasksRoute; }}
            onComplete={toggleTask}
            onEdit={() => {
              setEditing(selectedCityTask);
              setComposerOpen(true);
            }}
            busy={busy}
          />
        </Suspense>
      ))}
      <div className="workspace">
        {!inCity && <section className="panel">
          <div className="panel-title">
            <h2>Tasks</h2>
            <span>
              {visible.length} of{" "}
              {tasks.filter((t) => !project || t.project_id === project).length}{" "}
              tasks
            </span>
          </div>
          {initializing || tasksLoading ? (
            <p className="empty" role="status">
              Loading tasks…
            </p>
          ) : visible.length === 0 ? (
            <div className="empty">
              <h3>No tasks to show</h3>
              <p>
                {query || filter !== "all"
                  ? "No tasks match these filters."
                  : "Create a task or convert an approved action from a plan."}
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
                  className={"check " + (t.status === "done" ? "checked" : "")}
                  onClick={() => toggleTask(t)}
                >
                  {t.status === "done" ? "✓" : ""}
                </button>
                <button
                  className="task-title"
                  onClick={() => {
                    setError("");
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
                <span className={"priority " + t.priority}>{t.priority}</span>
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
        </section>}
        <TaskSheet open={composerOpen} onClose={() => setComposerOpen(false)}>
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
                  Project
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
                className="tl-primary"
                disabled={busy || (!editing && projects.length === 0)}
              >
                {busy ? "Saving…" : editing ? "Save changes" : "Create task"}
              </button>
            </form>
          </section>
        </TaskSheet>
      </div>
      <div className="save-notice" role="status">
        {notice}
      </div>
    </section>
  );

  if (publicPages.includes(route)) return <PublicPage key={route} route={route} />;

  if (auth?.user) {
    return (
      <>
        {sessionExpired && <div className="tl-session-expired" role="alert">
          Your session expired. Copy any unsaved edits before signing in again.{" "}
          <a href="/api/auth/google">Sign in with Google</a>
        </div>}
        <CaptureWorkspace name={auth.user.name} projects={projects} route={route} tasks={taskWorkspace} />
      </>
    );
  }

  return (
    <div className="threadline tl-sign-in">
      <main className="tl-content">
        <div className="tl-brand">
          <span className="tl-mark" aria-hidden="true">
            <WorkspaceIcon name="mark" />
          </span>
          Threadline
        </div>
        <section className="welcome">
          <h1>From brain dump to action plan</h1>
          <p>
            Capture what’s on your mind, organize your notes, and track what
            comes next. Build a plan by hand or review suggested steps when AI is available.
          </p>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {new URLSearchParams(location.search).get("signin") === "retry" && (
            <p role="status">Google sign-in did not finish. You can start again.</p>
          )}
          {auth?.configured ? (
            <a className="tl-primary" href="/api/auth/google">
              Sign in with Google
            </a>
          ) : (
            <div className="setup">
              <p>
                {initializing
                  ? "Connecting to your workspace…"
                  : auth
                    ? "Google sign-in is unavailable."
                    : "Unable to connect to your workspace."}
              </p>
              {!initializing && (
                <button
                  className="tl-primary"
                  onClick={() => void initialize()}
                >
                  Retry connection
                </button>
              )}
            </div>
          )}
        </section>
        <PublicLinks />
      </main>
    </div>
  );
}
