import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { InspectorSurface } from "./InspectorSurface";
import type { Project, Task } from "../types";
import { neighborhood } from "./layout";
const Scene = lazy(() => import("./CityScene"));
class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
export default function CityView({
  filtered,
  projects,
  tasks,
  selected,
  onSelect,
  onList,
  onComplete,
  onEdit,
  busy,
}: {
  filtered: boolean;
  projects: Project[];
  tasks: Task[];
  selected: Task | null;
  onSelect: (task: Task | null) => void;
  onList: () => void;
  onComplete: (t: Task) => void;
  busy: boolean;
  onEdit: () => void;
}) {
  const [focusedProjectId, setFocusedProjectId] = useState(
    projects[0]?.id ?? "",
  );
  const activeProjectId =
    selected?.project_id ??
    (projects.some((p) => p.id === focusedProjectId)
      ? focusedProjectId
      : (projects[0]?.id ?? ""));
  const focusedTasks = tasks.filter((t) => t.project_id === activeProjectId);
  const selectedIndex = focusedTasks.findIndex(
    (task) => task.id === selected?.id,
  );
  function inspectAdjacent(direction: number) {
    const next = focusedTasks[selectedIndex + direction];
    if (next) onSelect(next);
  }
  const [available, setAvailable] = useState(supportsWebGL),
    [reset, setReset] = useState(0),
    [pulse, setPulse] = useState<Task | null>(null);
  const previous = useRef(new Map<string, string>());
  const reduced = useMemo(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  useEffect(() => {
    const completed = tasks.find(
      (t) =>
        t.status === "done" &&
        previous.current.has(t.id) &&
        previous.current.get(t.id) !== "done",
    );
    previous.current = new Map(tasks.map((t) => [t.id, t.status]));
    if (completed && !reduced) setPulse(completed);
  }, [tasks, reduced]);
  useEffect(() => {
    if (!selected) return;
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.querySelector("dialog[open]"))
        onSelect(null);
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [selected, onSelect]);
  const fallback = (
    <div className="city-fallback">
      <span>◇</span>
      <h3>Your tasks are still right here.</h3>
      <p>
        3D rendering is unavailable in this browser. Use List View to manage
        your saved tasks.
      </p>
      <button className="primary" onClick={onList}>
        Open List View
      </button>
    </div>
  );
  return (
    <section className="city-panel" aria-label="Interactive task city">
      <div className="city-toolbar">
        <div>
          <span className="city-live" /> Your city{" "}
          <small>
            {tasks.length} buildings · {projects.length} neighborhoods
          </small>
        </div>
        <button
          onClick={() => {
            onSelect(null);
            setReset((n) => n + 1);
          }}
          aria-label="Reset city camera"
        >
          ↺ Reset view
        </button>
      </div>
      <div className="district-badges" aria-label="Neighborhood colors">
        {projects.map((p) => (
          <button
            key={p.id}
            aria-pressed={activeProjectId === p.id}
            onClick={() => {
              onSelect(null);
              setFocusedProjectId(p.id);
            }}
          >
            <i style={{ backgroundColor: neighborhood(p).color }} />
            {p.name}
          </button>
        ))}
      </div>
      <div className="city-canvas">
        {available ? (
          <SceneBoundary fallback={fallback}>
            <Suspense
              fallback={
                <div className="city-fallback" role="status">
                  Preparing your city…
                </div>
              }
            >
              <Scene
                focusedProjectId={activeProjectId}
                projects={projects}
                tasks={tasks}
                selected={selected}
                onSelect={onSelect}
                reset={reset}
                pulse={pulse}
                reducedMotion={reduced}
                onContextLost={() => setAvailable(false)}
              />
            </Suspense>
          </SceneBoundary>
        ) : (
          fallback
        )}
        {available && focusedTasks.length === 0 && (
          <div className="city-empty">
            <span>
              {filtered ? "FILTERED VIEW" : "YOUR CITY IS A BLANK CANVAS"}
            </span>
            <h3>
              {filtered
                ? "No matching buildings."
                : "Great things start small."}
            </h3>
            <p>
              {filtered
                ? "Adjust your search or status to see more saved tasks."
                : "Create your first task to raise your first building."}
            </p>
          </div>
        )}
        <div className="city-compass" aria-hidden="true">
          N<br />⌖
        </div>
      </div>
      <div className="city-help">
        <span>
          Drag to orbit · Scroll / pinch to zoom · Right-drag / two fingers to
          pan · Click a building to inspect
        </span>
        <span>
          <i className="legend-done" /> Finished <i className="legend-open" />{" "}
          Under construction
        </span>
      </div>
      <InspectorSurface open={!!selected}>
        {selected && (
          <>
            <div className="inspector-content">
              <div className="inspector-heading">
                <span>Task details</span>
                <button
                  aria-label="Close task inspector"
                  onClick={() => onSelect(null)}
                >
                  ✕
                </button>
              </div>
              <div className="inspector-context">
                {projects.find((p) => p.id === selected.project_id)?.name}
              </div>
              <span>
                {selected.status.replace("_", " ")} · {selected.priority}{" "}
                priority
              </span>
              <h3>{selected.title}</h3>
              <p>{selected.description || "No description added."}</p>
              <small>
                {selected.due_date
                  ? "Deadline: " + selected.due_date.slice(0, 10)
                  : "No deadline"}{" "}
              </small>
              <div
                className="inspector-navigation"
                role="group"
                aria-label="Browse neighborhood tasks"
              >
                <button
                  aria-label="Inspect previous task"
                  disabled={selectedIndex <= 0}
                  onClick={() => inspectAdjacent(-1)}
                >
                  ←
                </button>
                <span>
                  {selectedIndex + 1} of {focusedTasks.length} tasks
                </span>
                <button
                  aria-label="Inspect next task"
                  disabled={selectedIndex >= focusedTasks.length - 1}
                  onClick={() => inspectAdjacent(1)}
                >
                  →
                </button>
              </div>
            </div>
            <div className="inspector-actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() => onComplete(selected)}
              >
                {selected.status === "done" ? "Reopen task" : "Complete task"}
              </button>
              <button
                onClick={() => {
                  onEdit();
                  requestAnimationFrame(() =>
                    document
                      .querySelector<HTMLInputElement>(
                        '#task-details input[name="title"]',
                      )
                      ?.focus(),
                  );
                }}
              >
                Edit details ↗
              </button>
            </div>
          </>
        )}{" "}
      </InspectorSurface>
      <div className="city-task-picker">
        <label>
          Find a building
          <select
            value={selected?.id ?? ""}
            onChange={(e) =>
              onSelect(tasks.find((t) => t.id === e.target.value) ?? null)
            }
          >
            <option value="">Select a saved task…</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} · {t.status.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <span role="status" aria-live="polite">
          {selected
            ? `Inspecting ${selected.title}. Use Edit details to make changes.`
            : "Saved tasks become buildings. Select one to explore."}
        </span>
      </div>
    </section>
  );
}
