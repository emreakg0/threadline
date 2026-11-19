import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { WorkspaceIcon } from "./WorkspaceIcon";
export function ExtractionPanel({
  sourceId,
  documentId,
  disabled,
}: {
  sourceId: string;
  documentId: string;
  disabled: boolean;
}) {
  const [runId, setRunId] = useState<string | null>(null),
    [version, setVersion] = useState(0);
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    api("/extractions?source_revision_id=" + sourceId)
      .then((p) => {
        if (!cancelled && p.runs?.[0])
          setRunId((current) => current ?? p.runs[0].id);
      })
      .catch(() => {
        if (!cancelled)
          setMessage("Run history unavailable. Your source is unchanged.");
      });
    return () => {
      cancelled = true;
    };
  }, [sourceId]);
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    async function poll() {
      try {
        const result = await api("/extractions/" + runId);
        if (cancelled) return;
        const run = result.run;
        if (
          !run ||
          typeof run.status !== "string" ||
          !Array.isArray(result.blocks)
        )
          throw Error("Invalid run");
        setMessage(
          `${run.provider === "mock" ? "MOCK TEST — not Gemini. " : ""}Run ${run.status}${run.error_code ? " · " + run.error_code : ""}. Source revision is pinned. Live Gemini remains disabled.`,
        );
        const active = ["queued", "running"].includes(run.status);
        setPending(active);
        setCount(run.status === "succeeded" ? result.blocks.length : null);
        if (active && ++polls < 60) timer = setTimeout(() => void poll(), 2000);
        else if (active)
          setMessage(
            "Run still pending. Automatic polling paused; refresh status when ready. No provider success is claimed.",
          );
      } catch {
        if (!cancelled) {
          setPending(false);
          setMessage(
            "Cannot read run status. Work may still be queued or running. Refresh status; do not resubmit with a new key.",
          );
        }
      }
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId, version]);
  async function organize() {
    setPending(true);
    setMessage("Saving a queued request for this immutable revision…");
    try {
      const run = await api("/extractions", "POST", {
        source_revision_id: sourceId,
        idempotency_key: key,
      });
      setRunId(run.id);
      setVersion((v) => v + 1);
    } catch (error) {
      setPending(false);
      setMessage(
        error instanceof ApiError && error.status === 429
          ? "Quota reached; no automatic upgrade. Your source is unchanged."
          : "Request status uncertain or unavailable. Retry uses the same key and cannot duplicate the request.",
      );
    }
  }
  return (
    <section
      className="tl-next-action tl-extraction-tools"
      aria-label="Knowledge actions"
    >
      <h2>Knowledge review</h2>
      <a className="tl-review-link" href={"#capture/review/" + documentId}>
        <WorkspaceIcon name="review" />
        <span>Review blocks{count !== null ? " (" + count + ")" : ""}</span>
        <WorkspaceIcon name="arrow" />
      </a>
      <div className="tl-run-tools">
        <button
          className="tl-organize"
          disabled={disabled || pending}
          onClick={() => void organize()}
        >
          {pending ? "Run pending…" : "Request extraction"}
        </button>
        {runId && (
          <>
            <button onClick={() => setVersion((v) => v + 1)}>
              Refresh status
            </button>
            <button
              disabled={!pending}
              onClick={() =>
                void api("/extractions/" + runId + "/cancel", "POST", {})
                  .then(() => setVersion((v) => v + 1))
                  .catch(() =>
                    setMessage("Cancellation not confirmed. Refresh status."),
                  )
              }
            >
              Cancel run
            </button>
          </>
        )}
      </div>
      {message && (
        <p className="tl-run-message" role="status">
          {message}
        </p>
      )}
      <details className="tl-processing">
        <summary>Processing details</summary>
        <p>
          Gemini Free Tier may use inputs and outputs to improve Google
          products. Avoid sensitive notes. A queued request does not mean a
          provider call occurred.
        </p>
      </details>
      <a
        className="tl-run-link"
        href={runId ? "#capture/run/" + runId : "#capture/runs"}
      >
        <WorkspaceIcon name="trace" />{" "}
        {runId ? "Inspect recorded run" : "How It Works"}
      </a>
    </section>
  );
}
