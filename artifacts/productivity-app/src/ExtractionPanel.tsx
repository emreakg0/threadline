import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
export function ExtractionPanel({
  sourceId,
  disabled,
}: {
  sourceId: string;
  disabled: boolean;
}) {
  const [runId, setRunId] = useState<string | null>(null),
    [version, setVersion] = useState(0);
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const [blocks, setBlocks] = useState<
    { kind: string; content: string; uncertainty_reason: string | null }[]
  >([]);
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
        if (run.status === "succeeded") {
          if (
            !result.blocks.every(
              (b: unknown) =>
                b &&
                typeof b === "object" &&
                "kind" in b &&
                typeof b.kind === "string" &&
                "content" in b &&
                typeof b.content === "string" &&
                "uncertainty_reason" in b &&
                (b.uncertainty_reason === null ||
                  typeof b.uncertainty_reason === "string"),
            )
          )
            throw Error("Invalid blocks");
          setBlocks(result.blocks);
        }
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
    <section className="tl-history" aria-label="AI organization">
      <h2>Find the structure in your notes</h2>
      <a href={runId?"#capture/run/"+runId:"#capture/runs"}>How It Works · inspect recorded execution ↗</a>
      <p>
        Gemini Free Tier may use inputs and outputs to improve Google products.
        Avoid sensitive notes. Live processing remains disabled; queued state
        does not mean a provider call occurred.
      </p>
      <button
        className="tl-primary"
        disabled={disabled || pending}
        onClick={() => void organize()}
      >
        {pending ? "Run pending…" : "Organize with AI"}
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
      <p role="status">{message}</p>
      {blocks.map((b, i) => (
        <article key={i}>
          <h3>{b.kind} · Needs review</h3>
          <p>{b.content}</p>
          {b.uncertainty_reason && <p>Uncertainty: {b.uncertainty_reason}</p>}
        </article>
      ))}
    </section>
  );
}
