import { useState } from "react";
import type { Ref } from "react";
import { ExtractionPanel } from "./ExtractionPanel";
import { documents, type Collection } from "./documents-api";
import type { useCapture } from "./useCapture";
export function CaptureEditor({
  capture,
  collections,
  heading,
}: {
  capture: ReturnType<typeof useCapture>;
  collections: Collection[];
  heading: Ref<HTMLHeadingElement>;
}) {
  const [tagDraft, setTagDraft] = useState({ id: "", text: "" });
  const {
    saved,
    title,
    body,
    setTitle,
    setBody,
    titleInput,
    busy,
    dirty,
    valid,
    save,
    error,
    notice,
    conflict,
    adopt,
    showHistory,
    archive,
    historyOpen,
    setHistoryOpen,
    history,
    historyNext,
    evidence,
    perform,
    setEvidence,
    setHistory,
    setHistoryNext,
    collection,
    setCollection,
    tags,
    setTags,
  } = capture;
  const tag = tagDraft.id === saved?.id ? tagDraft.text : "";
  const setTag = (text: string) => setTagDraft({ id: saved?.id ?? "", text });
  return (
    <div className="tl-content">
      <header className="tl-page-heading">
        <div>
          <h1 ref={heading} tabIndex={-1}>
            {saved ? "Document" : "New capture"}
          </h1>
          {!saved && (
            <p>
              Write a thought or paste your notes. Each saved version keeps the
              original text.
            </p>
          )}
        </div>
        {saved && (
          <a className="tl-text-link" href="#capture/library">
            Back to knowledge
          </a>
        )}
      </header>
      <form
        className="tl-editor"
        onSubmit={(e) => void save(e)}
        onKeyDown={(e) => {
          if (
            !e.nativeEvent.isComposing &&
            (e.metaKey || e.ctrlKey) &&
            e.key === "Enter"
          ) {
            e.preventDefault();
            e.currentTarget.requestSubmit();
          }
        }}
      >
        <div className="tl-editor-top">
          <span>
            {saved?.archived_at ? "Archived document" : "Source text"}
          </span>
          <span
            role="status"
            aria-live="polite"
            data-status={dirty ? "dirty" : saved ? "saved" : undefined}
          >
            {busy
              ? "Working…"
              : dirty
                ? "Unsaved changes"
                : saved
                  ? "All changes saved"
                  : "Not saved yet"}
          </span>
        </div>
        <label className="tl-sr-only" htmlFor="capture-title">
          Document title
        </label>
        <input
          ref={titleInput}
          id="capture-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          maxLength={300}
          required
          readOnly={busy || !!saved?.archived_at}
        />
        <label className="tl-sr-only" htmlFor="capture-source">
          Source text
        </label>
        <textarea
          id="capture-source"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Start writing or paste your notes…"
          maxLength={20000}
          required
          readOnly={busy || !!saved?.archived_at}
          aria-describedby="capture-limit"
        />
        <div className="tl-editor-bottom">
          <span id="capture-limit">
            {body.length.toLocaleString()} / 20,000 characters
          </span>
          <button
            className="tl-primary"
            type="submit"
            disabled={busy || !dirty || !valid || !!saved?.archived_at}
          >
            {busy ? "Saving…" : saved ? "Save changes" : "Save capture"}{" "}
            <kbd>⌘ / Ctrl ↵</kbd>
          </button>
        </div>
      </form>
      {error && (
        <div className="tl-error" role="alert">
          {error}
        </div>
      )}
      <div className="tl-feedback" role="status">
        {notice}
      </div>
      {conflict && (
        <section className="tl-conflict" aria-label="Saved version comparison">
          <h2>A newer version is saved</h2>
          <p>
            Your draft above is unchanged. Copy anything you want to keep before
            replacing it.
          </p>
          <h3>{conflict.title}</h3>
          <pre tabIndex={0}>{conflict.source.source_text}</pre>
          <button
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Replace your unsaved draft with the saved version?",
                )
              )
                adopt(conflict);
            }}
          >
            Use saved version
          </button>
        </section>
      )}
      <div className="tl-document-tools">
        {saved ? (
          <>
            <span>
              Revision {saved.source.revision} ·{" "}
              {new Date(saved.updated_at).toLocaleString()}
            </span>
            <div>
              <a className="tl-text-link" href={"#capture/review/" + saved.id}>
                Review blocks
              </a>
              <button disabled={busy} onClick={() => void showHistory()}>
                Source history
              </button>
              <button
                disabled={busy || dirty}
                title={dirty ? "Save your changes first" : undefined}
                onClick={() => void archive()}
              >
                {saved.archived_at ? "Restore document" : "Archive document"}
              </button>
            </div>
          </>
        ) : null}
      </div>
      {saved && (
        <details key={saved.id} className="tl-document-organization">
          <summary>
            Collection and tags
            {tags.length
              ? " · " + tags.length + (tags.length === 1 ? " tag" : " tags")
              : ""}
          </summary>
          <div>
            <label>
              Collection
              <select
                value={collection}
                disabled={busy || !!saved.archived_at}
                onChange={(event) => setCollection(event.target.value)}
              >
                <option value="">Unfiled</option>
                {collection &&
                  !collections.some((item) => item.id === collection) && (
                    <option value={collection}>Current collection</option>
                  )}
                {collections.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {!!tags.length && (
              <ul className="tl-tag-list">
                {tags.map((name) => (
                  <li key={name}>
                    <button
                      aria-label={"Remove tag " + name}
                      disabled={busy || !!saved.archived_at}
                      onClick={() =>
                        setTags(tags.filter((entry) => entry !== name))
                      }
                    >
                      {name} ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const name = tag.trim();
                if (
                  !busy &&
                  !saved.archived_at &&
                  name &&
                  !tags.includes(name) &&
                  tags.length < 20
                ) {
                  setTags([...tags, name].sort());
                  setTag("");
                }
              }}
            >
              <input
                key={saved.id}
                aria-label="New tag"
                value={tag}
                maxLength={100}
                onChange={(event) => setTag(event.target.value)}
                placeholder="Tag name"
                disabled={busy || !!saved.archived_at || tags.length >= 20}
              />
              <button
                disabled={
                  busy ||
                  !!saved.archived_at ||
                  !tag.trim() ||
                  tags.includes(tag.trim()) ||
                  tags.length >= 20
                }
              >
                Add tag
              </button>
            </form>
            <small>Save changes to apply collection and tag edits.</small>
          </div>
        </details>
      )}
      {historyOpen && (
        <section className="tl-history" aria-label="Source history">
          <div className="tl-history-header">
            <h2>Source history</h2>
            <button onClick={() => setHistoryOpen(false)} disabled={busy}>
              Close history
            </button>
          </div>
          <p>
            Saved source versions are immutable. Viewing one does not change
            your draft.
          </p>
          <div className="tl-revisions">
            {history.map((revision) => (
              <button
                disabled={busy}
                aria-pressed={evidence?.revision === revision.revision}
                key={revision.id}
                onClick={() =>
                  void perform(async () => {
                    if (saved)
                      setEvidence(
                        await documents.source(saved.id, revision.revision),
                      );
                  })
                }
              >
                Revision {revision.revision}
                {revision.revision === 1 ? " · Original" : ""}
              </button>
            ))}
            {historyNext !== null && (
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    if (saved) {
                      const page = await documents.revisions(
                        saved.id,
                        historyNext,
                      );
                      setHistory((old) => [...old, ...page.items]);
                      setHistoryNext(page.next);
                    }
                  })
                }
              >
                More revisions
              </button>
            )}
          </div>
          {evidence && (
            <>
              <h3>
                Revision {evidence.revision}
                {evidence.revision === 1 ? " · Original source" : ""}
              </h3>
              <pre tabIndex={0}>{evidence.source_text}</pre>
            </>
          )}
        </section>
      )}
      {saved && (
        <ExtractionPanel
          key={saved.source.id}
          sourceId={saved.source.id}
          documentId={saved.id}
          disabled={busy || dirty || !!saved.archived_at}
        />
      )}
    </div>
  );
}
