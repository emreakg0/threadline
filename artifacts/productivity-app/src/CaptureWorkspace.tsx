import { useEffect, useState } from "react";
import { HowItWorks } from "./HowItWorks";
import { api } from "./api";
import { documents } from "./documents-api";
import { useCapture } from "./useCapture";
import { CaptureEditor } from "./CaptureEditor";
import "./capture.css";
export function CaptureWorkspace({
  name,
  onExit,
}: {
  name: string;
  onExit: () => void;
}) {
  const capture = useCapture();
  const [route, setRoute] = useState(location.hash);
  useEffect(() => {
    const change = () => setRoute(location.hash);
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const showingTrace = route.startsWith("#capture/run");
  const traceId = route.startsWith("#capture/run/")
    ? route.slice("#capture/run/".length)
    : null;
  const {
    saved,
    busy,
    items,
    archived,
    setArchived,
    next,
    loading,
    listError,
    allowLeave,
    fresh,
    open,
    refreshList,
    setItems,
    setNext,
    perform,
  } = capture;
  return (
    <div className="threadline" data-testid="capture-workspace">
      <aside className="tl-sidebar" aria-label="Threadline navigation">
        <a
          href="#capture"
          className="tl-brand"
          onClick={(e) => e.preventDefault()}
        >
          <span aria-hidden="true">⌁</span> Threadline
          <span className="tl-private">PRIVATE</span>
        </a>
        <div className="tl-nav-label">WORKSPACE</div>
        <button
          className="tl-nav-current"
          onClick={() => {
            if (showingTrace) location.hash = "#capture";
            else fresh();
          }}
          disabled={busy}
        >
          ＋ Capture <kbd>↵</kbd>
        </button>
        <button
          onClick={() => {
            if (!busy && allowLeave()) onExit();
          }}
          disabled={busy}
        >
          ▦ Focus City <span>Tasks & projects ↗</span>
        </button>
        <a
          href="#capture/runs"
          aria-current={showingTrace ? "page" : undefined}
        >
          How It Works ↗
        </a>
        <div className="tl-library-head">
          <h2>Knowledge library</h2>
          <button onClick={fresh} disabled={busy} aria-label="New capture">
            ＋
          </button>
        </div>
        <div className="tl-tabs" role="group" aria-label="Library filter">
          <button
            aria-pressed={!archived}
            onClick={() => setArchived(false)}
            disabled={busy}
          >
            Active
          </button>
          <button
            aria-pressed={archived}
            onClick={() => setArchived(true)}
            disabled={busy}
          >
            Archived
          </button>
        </div>
        <div className="tl-library" aria-busy={loading}>
          {loading ? (
            <p role="status">Loading your library…</p>
          ) : listError ? (
            <div role="alert">
              <p>{listError}</p>
              <button onClick={() => void perform(refreshList)} disabled={busy}>
                Retry library
              </button>
            </div>
          ) : (
            <>
              {!items.length && (
                <p>
                  {archived
                    ? "No archived documents."
                    : "A quiet place for your next idea. Saved captures will appear here."}
                </p>
              )}
              {items.map((item) => (
                <button
                  className="tl-document-row"
                  key={item.id}
                  aria-current={saved?.id === item.id ? "page" : undefined}
                  disabled={busy}
                  onClick={() => {
                    void open(item.id);
                    location.hash = "#capture";
                  }}
                >
                  <span>{item.title}</span>
                  <small>
                    {new Date(item.updated_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </small>
                </button>
              ))}
              {next !== null && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      const page = await documents.list(archived, next);
                      setItems((old) => [...old, ...page.items]);
                      setNext(page.next);
                    })
                  }
                >
                  Load more documents
                </button>
              )}
            </>
          )}
        </div>
        <div className="tl-profile">
          <span className="tl-avatar" aria-hidden="true">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            {name}
            <small>Personal workspace</small>
          </div>
        </div>
      </aside>
      <main className="tl-main">
        <header className="tl-toolbar">
          <span>
            Workspace <span aria-hidden="true">/</span> <strong>Capture</strong>
          </span>
          <button
            disabled={busy}
            onClick={() => {
              if (allowLeave())
                void perform(async () => {
                  await api("/auth/logout", "POST");
                  location.reload();
                });
            }}
          >
            Sign out
          </button>
        </header>
        <div hidden={showingTrace}>
          <CaptureEditor capture={capture} />
        </div>
        {showingTrace && <HowItWorks runId={traceId} />}
      </main>
    </div>
  );
}
