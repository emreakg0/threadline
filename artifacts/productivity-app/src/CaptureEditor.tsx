import { useEffect, useRef, useState } from "react";
import type { Ref } from "react";
import { WorkspaceIcon } from "./WorkspaceIcon";
import { ExtractionPanel } from "./ExtractionPanel";
import { documents, type Collection } from "./documents-api";
import type { useCapture } from "./useCapture";
export function CaptureEditor({
  capture,
  collections,
  heading,
  backToCollections,
  visible,
}: {
  capture: ReturnType<typeof useCapture>;
  collections: Collection[];
  heading: Ref<HTMLHeadingElement>;
  backToCollections: boolean;
  visible: boolean;
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
  const historyHeading = useRef<HTMLHeadingElement>(null);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (historyOpen) historyHeading.current?.focus();
  }, [historyOpen]);

  return (
    <div className="tl-content tl-capture-layout" data-saved={!!saved}>
      <div className="tl-writing">
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
            <div className="tl-doc-context">
              {saved &&
                (backToCollections ? (
                  <a href="#capture/collections">← Collections</a>
                ) : (
                  <a href="#capture/library">← Knowledge</a>
                ))}
              <h1 ref={heading} tabIndex={-1}>
                {saved?.archived_at
                  ? "Archived brain dump"
                  : saved
                    ? "Document"
                    : "Brain dump"}
              </h1>
            </div>
            <div className="tl-save-controls">
              <span
                role="status"
                data-status={dirty ? "dirty" : saved ? "saved" : undefined}
              >
                {busy
                  ? "Working…"
                  : dirty
                    ? "Unsaved changes"
                    : notice || (saved ? "All changes saved" : "Draft")}
              </span>
              <button
                className="tl-primary"
                type="submit"
                disabled={busy || !dirty || !valid || !!saved?.archived_at}
              >
                {saved ? "Save changes" : "Save brain dump"}{" "}
                <kbd>⌘ / Ctrl ↵</kbd>
              </button>
            </div>
          </div>
          <div className="tl-manuscript">
            <label className="tl-sr-only" htmlFor="capture-title">
              Document title
            </label>
            <textarea
              ref={titleInput}
              rows={1}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.nativeEvent.isComposing
                )
                  event.preventDefault();
              }}
              id="capture-title"
              data-long={title.length > 80}
              value={title}
              onChange={(e) =>
                setTitle(e.target.value.replace(/[\r\n]+/g, " "))
              }
              placeholder="Untitled brain dump"
              maxLength={300}
              readOnly={busy || !!saved?.archived_at}
            />
            <label className="tl-sr-only" htmlFor="capture-source">
              Source text
            </label>
            <textarea
              id="capture-source"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What’s on your mind? Write down tasks, loose ideas, and deadlines as they come to you."
              maxLength={20000}
              required
              readOnly={busy || !!saved?.archived_at}
              aria-describedby="capture-limit"
            />
            <div className="tl-editor-bottom">
              <span id="capture-limit">
                {body.length.toLocaleString()} / 20,000 characters
              </span>
            </div>
          </div>
          {!saved && (
            <div className="tl-plan-availability">
              <button
                type="button"
                className="tl-primary"
                disabled
                aria-describedby="tl-plan-availability"
              >
                Develop action plan
              </button>
              <p id="tl-plan-availability">
                Save your brain dump first. Manual planning is available even
                when AI is disabled.
              </p>
            </div>
          )}
        </form>
        {error && (
          <div className="tl-error" role="alert">
            {error}
          </div>
        )}
        {conflict && (
          <section
            className="tl-conflict"
            aria-label="Saved version comparison"
          >
            <h2>A newer version is saved</h2>
            <p>
              Your draft above is unchanged. Copy anything you want to keep
              before replacing it.
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
        {historyOpen && (
          <section className="tl-history" aria-label="Source history">
            <div className="tl-history-header">
              <h2 ref={historyHeading} tabIndex={-1}>
                Source history
              </h2>
              <button
                onClick={() => {
                  setHistoryOpen(false);
                  historyTrigger.current?.focus();
                }}
                disabled={busy}
              >
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
      </div>
      {saved && (
        <section className="tl-doc-rail" aria-label="Document tools">
          <ExtractionPanel
            key={saved.source.id}
            sourceId={saved.source.id}
            visible={visible}
            documentId={saved.id}
            disabled={busy || dirty || !!saved.archived_at}
          />
          <div className="tl-doc-details">
            <h2>Document details</h2>
            <p>
              Revision {saved.source.revision} ·{" "}
              <time dateTime={saved.updated_at}>
                {new Date(saved.updated_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
            </p>
          </div>
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

          <div className="tl-document-tools">
            <button
              ref={historyTrigger}
              disabled={busy}
              onClick={() => {
                if (historyOpen) historyHeading.current?.focus();
                else void showHistory();
              }}
            >
              <WorkspaceIcon name="history" /> Source history
            </button>
            <button
              disabled={busy || dirty}
              title={dirty ? "Save your changes first" : undefined}
              onClick={() => void archive()}
            >
              <WorkspaceIcon name="archive" />{" "}
              {saved.archived_at ? "Restore document" : "Archive document"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
