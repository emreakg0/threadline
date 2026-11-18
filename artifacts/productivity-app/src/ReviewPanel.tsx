import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "./api";
import {
  blockKinds,
  reviewStates,
  review,
  documents,
  type KnowledgeBlock,
  type ReviewState,
} from "./documents-api";

const labels: Record<ReviewState, string> = {
  needs_review: "Needs review",
  confirmed: "Confirmed by you",
  dismissed: "Dismissed",
};

export function ReviewPanel({
  id,
  visible,
  onChange,
  onBack,
  onDraftChange,
}: {
  id: string;
  visible: boolean;
  onChange: () => void;
  onBack: () => void;
  onDraftChange: (id: string, dirty: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("");
  const [state, setState] = useState("");
  const [blocks, setBlocks] = useState<KnowledgeBlock[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, refresh] = useState(0);
  const [editing, setEditing] = useState<KnowledgeBlock | null>(null);
  const [draft, setDraft] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const editInput = useRef<HTMLTextAreaElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const draftId = useId();
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    review
      .list(id, kind, state, offset)
      .then((page) => {
        if (!current) return;
        setBlocks((previous) =>
          offset === 0
            ? page.items
            : [
                ...previous,
                ...page.items.filter(
                  (block) => !previous.some((old) => old.id === block.id),
                ),
              ],
        );
        setNext(page.next);
      })
      .catch((cause: Error) => {
        if (current) setError(cause.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [id, kind, state, revision, offset]);
  useEffect(() => {
    let current = true;
    documents
      .get(id)
      .then((doc) => {
        if (current) setTitle(doc.title);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [id, revision]);
  useEffect(() => {
    if (visible) heading.current?.focus();
  }, [visible]);
  useEffect(() => {
    if (editing) editInput.current?.focus();
  }, [editing]);
  const dirty = !!editing && draft !== editing.content;
  useEffect(() => onDraftChange(id, dirty), [id, dirty, onDraftChange]);

  function endEdit() {
    setEditing(null);
    setConflict(false);
    requestAnimationFrame(() =>
      (returnFocus.current?.isConnected
        ? returnFocus.current
        : heading.current
      )?.focus(),
    );
  }
  async function change(
    block: KnowledgeBlock,
    changes: { content?: string; review_state?: ReviewState },
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const saved = await review.update(id, block.id, block.version, changes);
      setBlocks((items) =>
        items.map((entry) =>
          entry.id === block.id ? { ...entry, ...saved } : entry,
        ),
      );
      if (state && saved.review_state !== state) {
        setOffset(0);
        refresh((value) => value + 1);
      }
      if (editing) endEdit();
      setNotice(
        changes.content !== undefined
          ? "Edit saved"
          : labels[saved.review_state],
      );
      onChange();
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof ApiError && cause.status === 409) setConflict(true);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function reload() {
    if (!editing) {
      setOffset(0);
      setConflict(false);
      refresh((value) => value + 1);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const page = await review.list(id, "", "", 0, editing.id);
      const saved = page.items[0];
      if (!saved)
        throw Error(
          "The saved block is unavailable. Your draft is still here.",
        );
      setBlocks((items) =>
        items.map((entry) => (entry.id === saved.id ? saved : entry)),
      );
      setConflict(false);
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  const current = editing && blocks.find((block) => block.id === editing.id);
  const newer = current && editing && current.version !== editing.version;
  const editor = editing && (
    <form
      className="tl-block tl-block-edit"
      onSubmit={(event) => {
        event.preventDefault();
        if (
          !loading &&
          !busy &&
          !conflict &&
          !newer &&
          current &&
          draft.trim() &&
          draft !== editing.content
        )
          void change(editing, { content: draft });
      }}
    >
      <label htmlFor={draftId}>Edit {editing.kind}</label>
      <textarea
        id={draftId}
        data-testid="block-draft"
        ref={editInput}
        value={draft}
        maxLength={1200}
        required
        disabled={busy}
        onChange={(event) => setDraft(event.target.value)}
      />
      <small>Source evidence stays attached to the original extraction.</small>
      {newer && (
        <div className="tl-conflict">
          <p>Current saved text</p>
          <pre>{current.content}</pre>
          <button type="button" onClick={() => setEditing(current)}>
            Keep my draft against this version
          </button>
        </div>
      )}
      {!current && !loading && !error && (
        <p role="status">
          This block is outside the current page or filters. Copy your draft
          before closing the editor.
        </p>
      )}
      <div className="tl-block-actions">
        <button type="button" disabled={busy} onClick={endEdit}>
          Cancel edit
        </button>
        <button
          className="tl-primary"
          disabled={
            busy ||
            loading ||
            conflict ||
            !!newer ||
            !current ||
            !draft.trim() ||
            draft === editing.content
          }
        >
          Save block
        </button>
      </div>
    </form>
  );
  return (
    <section className="tl-review">
      <button onClick={onBack} disabled={busy}>
        ← Review documents
      </button>
      <h1 ref={heading} tabIndex={-1}>
        {title || "Review knowledge"}
      </h1>
      <div className="tl-filters">
        <select
          aria-label="Filter by block kind"
          value={kind}
          disabled={!!editing || busy}
          onChange={(event) => {
            setOffset(0);
            setConflict(false);
            setKind(event.target.value);
          }}
        >
          <option value="">All kinds</option>
          {blockKinds.map((value) => (
            <option key={value} value={value}>
              {value[0].toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by review state"
          value={state}
          disabled={!!editing || busy}
          onChange={(event) => {
            setOffset(0);
            setConflict(false);
            setState(event.target.value);
          }}
        >
          <option value="">All review states</option>
          {reviewStates.map((value) => (
            <option key={value} value={value}>
              {labels[value]}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <div className="tl-error" role="alert">
          {error}{" "}
          <button disabled={busy} onClick={() => void reload()}>
            Reload blocks
          </button>
        </div>
      )}
      <div className="tl-feedback" role="status">
        {notice}
      </div>
      {loading && <p role="status">Loading knowledge blocks…</p>}
      {!loading && !error && !blocks.length && (
        <div className="tl-empty">
          <h2>No matching blocks</h2>
          <p>Change the filters or review another document.</p>
        </div>
      )}
      {blocks
        .filter(
          (block) =>
            editing?.id === block.id ||
            ((!loading || offset > 0) &&
              (!error || conflict || offset > 0) &&
              (!state || block.review_state === state)),
        )
        .map((block, index) => (
          <article
            key={block.id}
            className="tl-block"
            style={{ animationDelay: Math.min(index, 5) * 24 + "ms" }}
          >
            <div className="tl-block-meta">
              <h2>{block.kind}</h2>
              <span data-review={block.review_state}>
                {labels[block.review_state]}
              </span>
            </div>
            <div className="tl-provenance">
              {block.run_id ? (
                <a href={"#capture/run/" + block.run_id}>
                  {block.provider === "mock"
                    ? "Mock extraction"
                    : "AI extracted"}{" "}
                  · Revision {block.run_revision} ↗
                </a>
              ) : (
                "No extraction run recorded"
              )}
              {block.edited_at && <span>Edited by you</span>}
            </div>
            <p className="tl-block-content">{block.content}</p>
            {block.uncertainty_reason && (
              <p className="tl-uncertainty">
                Original extraction uncertainty · {block.uncertainty_reason}
              </p>
            )}
            <details>
              <summary>Source evidence ({block.evidence.length})</summary>
              {block.evidence.map((entry) => (
                <figure key={entry.id}>
                  <blockquote>{entry.quote}</blockquote>
                  <figcaption>
                    Revision {entry.revision} · Offsets {entry.start_offset}–
                    {entry.end_offset}
                  </figcaption>
                </figure>
              ))}
              {!block.evidence.length && (
                <p>No source excerpts were recorded.</p>
              )}
            </details>
            <div className="tl-block-actions">
              <button
                disabled={busy || loading || !!editing}
                onClick={(event) => {
                  returnFocus.current = event.currentTarget;
                  setConflict(false);
                  setEditing(block);
                  setDraft(block.content);
                }}
              >
                Edit block
              </button>
              {block.review_state !== "confirmed" && (
                <button
                  disabled={busy || loading || !!editing || conflict}
                  onClick={() =>
                    void change(block, { review_state: "confirmed" })
                  }
                >
                  Confirm
                </button>
              )}
              {block.review_state !== "dismissed" && (
                <button
                  disabled={busy || loading || !!editing || conflict}
                  onClick={() =>
                    void change(block, { review_state: "dismissed" })
                  }
                >
                  Dismiss
                </button>
              )}
              {block.review_state !== "needs_review" && (
                <button
                  disabled={busy || loading || !!editing || conflict}
                  onClick={() =>
                    void change(block, { review_state: "needs_review" })
                  }
                >
                  Return to review
                </button>
              )}
            </div>
            {editing?.id === block.id && editor}
          </article>
        ))}
      {!current && editor}
      {next !== null && !error && (
        <button
          className="tl-more"
          disabled={loading || busy || !!editing}
          onClick={() => setOffset(next)}
        >
          Load more blocks
        </button>
      )}
    </section>
  );
}
