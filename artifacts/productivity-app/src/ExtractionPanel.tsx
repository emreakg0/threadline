import { useState } from "react";
import { api, ApiError } from "./api";
export function ExtractionPanel({
  sourceId,
  disabled,
}: {
  sourceId: string;
  disabled: boolean;
}) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const [blocks, setBlocks] = useState<
    { kind: string; content: string; uncertainty_reason: string | null }[]
  >([]);
  async function organize() {
    setPending(true);
    setMessage("Requesting extraction of this saved revision…");
    try {
      const run = await api("/extractions", "POST", {
        source_revision_id: sourceId,
        idempotency_key: key,
      });
      const result = await api("/extractions/" + run.id);
      if (result.run.status !== "succeeded") {
        setMessage(
          `Extraction ${result.run.status}: ${result.run.error_code ?? "Check again before retrying"}. Your source is safe.`,
        );
        return;
      }
      if (
        !Array.isArray(result.blocks) ||
        !result.blocks.every(
          (b: unknown) =>
            b &&
            typeof b === "object" &&
            "content" in b &&
            typeof b.content === "string" &&
            "kind" in b &&
            typeof b.kind === "string",
        )
      )
        throw Error("Invalid result");
      setBlocks(result.blocks);
      setMessage(
        `${result.run.provider === "mock" ? "MOCK TEST — not a Gemini response. " : ""}Pinned revision results · Needs review`,
      );
    } catch (error) {
      setMessage(error instanceof ApiError && error.status===429 ? "Quota or concurrency limit reached. Try later; no automatic upgrade. Your source is unchanged." :
        "Extraction unavailable. Live Gemini is disabled pending free-tier confirmation and first-call approval. Your source and draft are unchanged.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="tl-history" aria-label="AI organization">
      <h2>Find the structure in your notes</h2>
      <p>
        Gemini Free Tier may use inputs and outputs to improve Google products.
        Avoid sensitive notes. Live processing is currently disabled; no content
        is sent.
      </p>
      <button
        className="tl-primary"
        disabled={disabled || pending}
        onClick={() => void organize()}
      >
        {pending ? "Waiting for server…" : "Organize with AI"}
      </button>
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
