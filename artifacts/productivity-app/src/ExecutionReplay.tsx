import { useEffect, useMemo, useState } from "react";
import type { Trace, Step, TraceEvent } from "./trace";
import {
  stages,
  schedule,
  indexAt,
  stageState,
  observedStep,
  rate,
  recoveryAt,
  failureReason,
} from "./replay";
import { api } from "./api";
import { TraceInspector } from "./TraceInspector";
export function ExecutionReplay({ trace }: { trace: Trace }) {
  const times = useMemo(() => schedule(trace.events), [trace.events]);
  const end = times.at(-1) ?? 0;
  const [position, setPosition] = useState(end),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [node, setNode] = useState(() => recoveryAt(trace, trace.events.length - 1)?.key ?? "extract");
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      setReduced(m.matches);
      if (m.matches) setPlaying(false);
    };
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!playing || reduced) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(),
        delta = now - last;
      last = now;
      setPosition((p) => Math.min(end, p + delta * rate(speed)));
    }, 32);
    return () => clearInterval(timer);
  }, [playing, reduced, speed, end]);
  useEffect(() => {
    if (position >= end) setPlaying(false);
  }, [position, end]);
  const index = indexAt(times, position),
    current = trace.events[index];
  const [inspected, setInspected] = useState<TraceEvent | undefined>();
  const [metadataStep, setMetadataStep] = useState<Step | undefined>();
  const [nodeSelected, setNodeSelected] = useState(true);
  const nodeEvent = trace.events
    .slice(0, index + 1)
    .reverse()
    .find((e) =>
      node === "source"
        ? e.event_type === "queued"
        : e.payload.key === node ||
          trace.steps.find((s) => s.id === e.step_id)?.step_key === node,
    );
  const branch = recoveryAt(trace, index);
  const [choosing, setChoosing] = useState(false);
  const [choiceError, setChoiceError] = useState(false);
  const document = trace.run.document_id;
  async function chooseManual() {
    const originalRoute = location.hash;
    setChoosing(true);
    setChoiceError(false);
    try {
      await api("/extractions/" + trace.run.id + "/recovery/manual", "POST");
      if (location.hash === originalRoute) location.hash = "#capture/plan/" + document;
    } catch {
      setChoiceError(true);
    } finally {
      setChoosing(false);
    }
  }
  const activeEvent = inspected ?? (nodeSelected ? nodeEvent : current);
  const step =
    metadataStep ??
    (activeEvent?.step_id
      ? trace.steps.find((s) => s.id === activeEvent.step_id)
      : nodeSelected
        ? observedStep(trace, node, index)
        : undefined);
  function seek(p: number) {
    setPlaying(false);
    setPosition(Math.max(0, Math.min(end, p)));
    setInspected(undefined);
    setMetadataStep(undefined);
    setNodeSelected(false);
  }
  function stepBy(delta: number) {
    seek(times[Math.max(0, Math.min(times.length - 1, index + delta))] ?? 0);
  }
  function play() {
    setNodeSelected(false);
    setMetadataStep(undefined);
    setInspected(undefined);
    if (position >= end) setPosition(0);
    setPlaying((p) => !p);
  }
  const actualSpan =
    trace.events.length > 1
      ? Math.max(
          0,
          Date.parse(trace.events.at(-1)!.observed_at) -
            Date.parse(trace.events[0].observed_at),
        )
      : 0;
  return (
    <section
      className="execution-replay"
      aria-label="Recorded execution replay"
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("input,select,button,a")) return;
        if (e.key === "ArrowRight") {
          e.preventDefault();
          stepBy(1);
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          stepBy(-1);
        }
        if (e.code === "Space" && !reduced) {
          e.preventDefault();
          play();
        }
      }}
      tabIndex={0}
    >
      <div className="execution-summary">
        <span className="execution-provenance">
          {trace.run.provider === "mock"
            ? "MOCK ADAPTER · NOT GEMINI"
            : trace.run.provider.toUpperCase() + " · RECORDED RUN"}
        </span>
        <strong>
          {trace.run.status}
          {trace.run.error_code ? " · " + trace.run.error_code : ""}
        </strong>
        <span>
          {trace.run.schema_version === 2 && "Action planning · schema v2 · "}
          {trace.run.model}
        </span>
      </div>
      {trace.warnings.map((w) => (
        <p className="tl-error" role="status" key={w}>
          {w}
        </p>
      ))}
      {!trace.events.length && (
        <p role="status">
          No recorded events. Step metadata may exist, but no execution is
          inferred.
        </p>
      )}
      <div className="execution-diagram" aria-label="Execution stages">
        {[
          ...stages,
          ...[...new Set(trace.steps.map((s) => s.step_key))]
            .filter((k) => !stages.some(([key]) => key === k))
            .map((k) => [k, k] as const),
        ].map(([key, label], i) => {
          const status = stageState(trace, key, index);
          const s = observedStep(trace, key, index);
          return (
            <div className="execution-node-wrap" key={key}>
              {i > 0 && (
                <span className="execution-edge" aria-hidden="true">
                  →
                </span>
              )}
              <button
                className="execution-node"
                data-state={status}
                aria-pressed={nodeSelected && node === key && !inspected}
                onClick={() => {
                  setMetadataStep(undefined);
                  setNodeSelected(true);
                  setNode(key);
                  setInspected(undefined);
                }}
              >
                <span className="execution-node-index">0{i + 1}</span>
                <strong>{label}</strong>
                <span>{status}</span>
                <small>{key === "source" ? "Browser → API → PostgreSQL"
                  : key === "extract" ? (trace.run.provider === "mock" ? "API → mock provider" : "API → Gemini")
                  : key === "persist" ? "API → PostgreSQL" : "API server"}</small>
                <small>
                  {key === "source"
                    ? "Pinned immutable revision"
                    : s
                      ? `Attempt ${s.attempt}`
                      : "No observation at cursor"}
                </small>
              </button>
            </div>
          );
        })}
      </div>
      {branch && (
        <section className="execution-recovery" aria-label="Failure and recovery">
          <h3>↳ {stages.find(([key]) => key === branch.key)?.[1] ?? "Run"} · {
            branch.terminal?.event_type === "cancelled" ? "Cancelled" :
              branch.terminal?.event_type === "interrupted" ? "Interrupted" : "Failed"
          }</h3>
          <p>{branch.terminal?.event_type === "cancelled" ? "The run was cancelled."
            : failureReason(branch.event.payload.code, branch.key)}</p>
          {branch.terminal && <p><strong>Recorded outcome</strong><br />{
            (branch.terminal.payload.action === "Stop" ? "The run stopped." : branch.terminal.payload.action) ?? (branch.terminal.event_type === "failed"
              ? "The run ended in failure. No further recovery was recorded at this point."
              : "The run ended before processing finished.")
          }</p>}
          {branch.recovery && <p><strong>{branch.recovery.event_type === "retry_scheduled"
            ? "Retry scheduled" : "Recovery performed"}</strong><br />{branch.recovery.payload.action}</p>}
          {branch.terminal?.payload.retry_at && <p>Provider cooldown until{" "}
            <time dateTime={branch.terminal.payload.retry_at}>{new Date(branch.terminal.payload.retry_at).toLocaleString()}</time>.
            Eligibility also depends on current quota and access.</p>}
          {trace.run.source_revision !== undefined &&
            <p><strong>Input preserved</strong><br />Revision {trace.run.source_revision} is still in the saved brain dump’s history.</p>}
          {branch.selected && <p><strong>Alternative selected</strong><br />{branch.selected.payload.action}</p>}
          {branch.terminal && document && (
            <div className="execution-recovery-options">
              <strong>Available now</strong>
              <a href={"#capture/document/" + document}>Open saved brain dump</a>
              {trace.run.source_archived
                ? <p>Manual planning is unavailable while this brain dump is archived. Restore it to continue.</p>
                : <button type="button" disabled={choosing} onClick={() => void chooseManual()}>Open manual plan</button>}
              {choiceError && <p role="alert">Could not confirm the choice. Try again or{" "}
                <a href={"#capture/plan/" + document}>open the manual plan directly</a>.</p>}
              <p>Save corrections as a new revision to keep the original. Repeating the same AI operation after a provider attempt requires a new eligible revision, consent, and a separate provider request.</p>
            </div>
          )}
        </section>
      )}
      <div
        className="execution-controls"
        role="group"
        aria-label="Replay controls"
      >
        <button disabled={reduced || trace.events.length < 2} onClick={play}>
          {playing ? "Pause" : "Play"}
        </button>
        <button disabled={!trace.events.length} onClick={() => seek(0)}>
          Restart
        </button>
        <button
          disabled={index <= 0}
          onClick={() => stepBy(-1)}
          aria-label="Previous recorded event"
        >
          ← Step
        </button>
        <button
          disabled={index >= trace.events.length - 1}
          onClick={() => stepBy(1)}
          aria-label="Next recorded event"
        >
          Step →
        </button>
        <label>
          Speed{" "}
          <select
            value={speed}
            onChange={(e) => setSpeed(rate(Number(e.target.value)))}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
          </select>
        </label>
      </div>
      <label className="execution-seek">
        Recorded playback timeline
        <input
          aria-label="Seek recorded execution"
          type="range"
          min={0}
          max={end || 1}
          step={1}
          value={position}
          disabled={!end}
          onChange={(e) => seek(Number(e.target.value))}
        />
      </label>
      <p className="execution-timing">
        Replay {(position / 1000).toFixed(1)} / {(end / 1000).toFixed(1)} s ·
        Scaled intervals 0.3–1.8 s at 1×. Actual observed span: {actualSpan} ms.
        Sequence order is authoritative.
      </p>
      {reduced && (
        <p>
          Reduced motion: use step controls, event log or timeline. Automatic
          playback is off.
        </p>
      )}
      <p className="execution-announcement" role="status" aria-live="polite">
        {current
          ? `Event ${index + 1} of ${trace.events.length} · sequence ${current.sequence} · ${current.event_type}`
          : "No event observed at cursor"}
      </p>
      <div className="execution-detail-grid">
        <div className="execution-log" aria-label="Recorded event log">
          {trace.events.map((e, i) => (
            <button
              className="execution-event"
              key={e.id}
              data-event-id={e.id}
              data-sequence={e.sequence}
              aria-current={i === index ? "step" : undefined}
              onClick={() => {
                seek(times[i]);
                setInspected(e);
              }}
            >
              <span>#{e.sequence}</span>
              <strong>{e.event_type}</strong>
              <small>
                {e.payload.key ??
                  trace.steps.find((s) => s.id === e.step_id)?.step_key ??
                  "Run"}
                {e.payload.code ? " · " + e.payload.code : ""}
              </small>
              <time>{new Date(e.observed_at).toISOString().slice(11, 23)}</time>
            </button>
          ))}
        </div>
        <TraceInspector
          trace={trace}
          event={activeEvent}
          stage={nodeSelected ? node : undefined}
          step={step}
          finalStep={!!metadataStep || (!!step && trace.events.slice(0, index + 1).some((e) =>
            e.step_id === step.id && ["step_completed", "step_failed", "interrupted", "cancelled"].includes(e.event_type)))}
        />
      </div>
      <details>
        <summary>
          Final stored step records ({trace.steps.length}) · separate from
          replay observations
        </summary>
        {trace.steps.map((s: Step) => (
          <button
            key={s.id}
            onClick={() => {
              setMetadataStep(s);
              setNode(s.step_key);
              setInspected(trace.events.find((e) => e.step_id === s.id));
            }}
          >
            {s.step_key} · attempt {s.attempt} · {s.status} ·{" "}
            {s.duration_ms ?? "unknown"} ms
          </button>
        ))}
      </details>
    </section>
  );
}
