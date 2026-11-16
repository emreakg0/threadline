import { ExtractionPanel } from "./ExtractionPanel";
import { documents } from "./documents-api";
import type { useCapture } from "./useCapture";
export function CaptureEditor({
  capture,
}: {
  capture: ReturnType<typeof useCapture>;
}) {
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
  } = capture;
  return (
    <div className="tl-content">
      <div className="tl-page-heading">
        <div>
          <div className="tl-eyebrow">MAKE ROOM FOR YOUR THOUGHTS</div>
          <h1>
            {saved
              ? "Your words, kept together."
              : "Start with what’s on your mind."}
          </h1>
          <p>
            Meeting notes, loose ideas, a plan taking shape. Keep the original.
            Find your thread.
          </p>
        </div>
        <span className="tl-phase">Capture</span>
      </div>
      <form
        className="tl-editor"
        onSubmit={(e) => void save(e)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.requestSubmit();
          }
        }}
      >
        <div className="tl-editor-top">
          <span>
            {saved?.archived_at
              ? "Archived document"
              : saved
                ? "Saved document"
                : "New capture"}
          </span>
          <span role="status" aria-live="polite">
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
          placeholder="Give this thought a title"
          maxLength={300}
          required
          disabled={busy || !!saved?.archived_at}
        />
        <label className="tl-sr-only" htmlFor="capture-source">
          Source text
        </label>
        <textarea
          id="capture-source"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            "Begin anywhere.\n\nPaste your notes or write freely. Every saved version stays accessible."
          }
          maxLength={20000}
          required
          disabled={busy || !!saved?.archived_at}
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
        ) : (
          <span>
            Your source stays yours. Nothing is sent to an AI service.
          </span>
        )}
      </div>
      {historyOpen && (
        <section className="tl-history" aria-label="Source history">
          <div className="tl-history-header">
            <h2>Originals, always within reach.</h2>
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
      {saved && <ExtractionPanel key={saved.source.id} sourceId={saved.source.id} disabled={busy || dirty || !!saved.archived_at} />}
      <div className="tl-bottom-note">
        <span aria-hidden="true">⌁</span>
        <span>From scattered thoughts to something worth keeping.</span>
      </div>
    </div>
  );
}
