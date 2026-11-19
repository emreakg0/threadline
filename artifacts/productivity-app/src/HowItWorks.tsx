import { useEffect, useRef, useState } from "react";
import { history, loadTrace, type Run, type Trace } from "./trace";
import { ExecutionReplay } from "./ExecutionReplay";
import "./execution.css";
export function HowItWorks({ runId }: { runId: string | null }) {
  const [runs, setRuns] = useState<Run[]>([]),
    [next, setNext] = useState<number | null>(null),
    [trace, setTrace] = useState<Trace | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [historyError, setHistoryError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    history()
      .then((p) => {
        if (!cancelled) {
          setRuns(p.runs);
          setNext(p.next);
          setHistoryError("");
        }
      })
      .catch(() => {
        if (!cancelled)
          setHistoryError(
            "Run history unavailable. Retry without creating a run.",
          );
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  useEffect(() => {
    let cancelled = false,
      timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    setTrace(null);
    setError("");
    heading.current?.focus();
    if (!runId) {
      setLoading(false);
      return;
    }
    async function load() {
      setLoading(true);
      try {
        const t = await loadTrace(runId!);
        if (cancelled) return;
        setTrace(t);
        if (["queued", "running"].includes(t.run.status) && ++polls < 30)
          timer = setTimeout(() => void load(), 3000);
      } catch {
        if (!cancelled) {
          setTrace(null);
          setError(
            "Trace unavailable or access denied. No partial playback is shown. Retry to read saved records.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId, refresh]);
  return (
    <div className="tl-content execution-workspace">
      <h1 ref={heading} tabIndex={-1}>
        How It Works
      </h1>
      <p>
        Actual recorded execution. Inspect every observation, then replay it at
        your pace.
      </p>
      <a href="#capture">← Back to capture</a>
      <div className="execution-layout">
        <nav className="execution-history" aria-label="Run history">
          <h2>Saved runs</h2>
          <button onClick={() => setRefresh((v) => v + 1)}>
            Refresh records
          </button>
          {historyError && <p role="alert">{historyError}</p>}
          {historyLoading && <p role="status">Reading saved run history…</p>}
          {!historyLoading && !historyError && !runs.length && (
            <p>
              No saved runs. Processing a saved brain dump creates a record here.
            </p>
          )}
          <div className="execution-run-list">
            {runs.map((r) => (
              <a
                key={r.id}
                href={"#capture/run/" + r.id}
                aria-current={r.id === runId ? "page" : undefined}
              >
                <strong>{r.status}</strong>
                <span>
                  {r.provider === "mock"
                    ? "Mock adapter"
                    : "Gemini disabled / unverified"}
                </span>
                <small>{new Date(r.created_at).toLocaleString()}</small>
                <code>{r.id.slice(0, 8)}</code>
              </a>
            ))}
          </div>
          {next !== null && (
            <button
              onClick={() =>
                void history(next)
                  .then((p) => {
                    setRuns((old) => [
                      ...new Map(
                        [...old, ...p.runs].map((r) => [r.id, r]),
                      ).values(),
                    ]);
                    setNext(p.next);
                  })
                  .catch(() =>
                    setHistoryError("More history could not be loaded. Retry."),
                  )
              }
            >
              Load older runs
            </button>
          )}
        </nav>
        <div className="execution-main" aria-busy={loading}>
          {error && (
            <p className="tl-error" role="alert">
              {error}
            </p>
          )}
          {loading && !trace && (
            <p role="status">Reading persisted events and steps…</p>
          )}
          {!runId && (
            <p>
              Select a saved run to inspect its source revision, attempts and
              event history.
            </p>
          )}
          {trace && (
            <>
              <div className="execution-run-link">
                <span>Run {trace.run.id}</span>
                <a href={"#capture/run/" + trace.run.id}>Link to this run</a>
              </div>
              <ExecutionReplay
                key={trace.events.map((e) => e.id).join(",") + trace.run.status}
                trace={trace}
              />
              {["queued", "running"].includes(trace.run.status) && (
                <p>
                  Stored status: {trace.run.status}. Refresh is bounded to 30
                  reads; use Refresh records afterward. This is not evidence of
                  a live Gemini call.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
