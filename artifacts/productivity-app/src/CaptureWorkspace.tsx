import { useCallback, useEffect, useRef, useState } from "react";
import { HowItWorks } from "./HowItWorks";
import { api } from "./api";
import { documents } from "./documents-api";
import { useCapture } from "./useCapture";
import { CaptureEditor } from "./CaptureEditor";
import { Library } from "./Library";
import { ReviewPanel } from "./ReviewPanel";
import { CommandPalette } from "./CommandPalette";
import "./capture.css";

const navigation = [
  { route: "#capture", label: "Capture", icon: "M4 3h12v14H4z M7 8h6m-6 4h6" },
  {
    route: "#capture/library",
    label: "Knowledge",
    icon: "M3 4h3v12H3z m6 0h3v12H9z m5 1 2-1 3 11-2 1z",
  },
  {
    route: "#capture/review",
    label: "Review",
    icon: "M4 4h12v12H4z m3 6 2 2 4-4",
  },
  {
    route: "#capture/collections",
    label: "Collections",
    icon: "M2 6h6l2 2h8v8H2z",
  },
  {
    route: "#capture/runs",
    label: "How It Works",
    icon: "M4 4h4v4H4z m8 8h4v4h-4z M6 8v6h6",
  },
] as const;

export function CaptureWorkspace({
  name,
  onExit,
  active,
}: {
  name: string;
  onExit: () => void;
  active: boolean;
}) {
  const [unsavedReviews, setUnsavedReviews] = useState<string[]>([]);
  const capture = useCapture(unsavedReviews.length > 0);
  const [route, setRoute] = useState(location.hash);
  const [organization, setOrganization] = useState<
    Awaited<ReturnType<typeof documents.organization>>
  >({ collections: [], tags: [] });
  const [orgError, setOrgError] = useState("");
  const [orgRefresh, refreshOrganization] = useState(0);
  const [reviewVersion, refreshReview] = useState(0);
  const [collectionName, setCollectionName] = useState("");
  const [creating, setCreating] = useState(false);
  const collectionInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const captureHeading = useRef<HTMLHeadingElement>(null);
  const attemptedDocument = useRef<string | null>(null);
  const section = route.startsWith("#capture/run")
    ? "#capture/runs"
    : (navigation.find(
        (item) =>
          item.route !== "#capture" &&
          (route === item.route || route.startsWith(item.route + "/")),
      )?.route ?? "#capture");
  const traceId = route.startsWith("#capture/run/")
    ? route.slice("#capture/run/".length)
    : null;
  const documentId = route.startsWith("#capture/document/")
    ? route.slice("#capture/document/".length)
    : null;
  const routedReviewId = route.startsWith("#capture/review/")
    ? route.slice("#capture/review/".length)
    : null;
  const { open, fresh, busy } = capture;
  const documentReady = !documentId || documentId === capture.saved?.id;

  useEffect(() => {
    const change = () => setRoute(location.hash);
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!active || !documentId) {
      attemptedDocument.current = null;
      return;
    }
    if (busy || attemptedDocument.current === documentId) return;
    attemptedDocument.current = documentId;
    void open(documentId);
  }, [active, documentId, busy, open]);
  const trackReviewDraft = useCallback((id: string, dirty: boolean) => {
    setUnsavedReviews((ids) => {
      if (dirty) return ids.includes(id) ? ids : [...ids, id];
      return ids.includes(id) ? ids.filter((entry) => entry !== id) : ids;
    });
  }, []);
  useEffect(() => {
    if (!active) return;
    let current = true;
    documents
      .organization()
      .then((data) => {
        if (current) {
          setOrganization(data);
          setOrgError("");
        }
      })
      .catch((cause: Error) => {
        if (current) setOrgError(cause.message);
      });
    return () => {
      current = false;
    };
  }, [active, capture.revision, orgRefresh]);
  useEffect(() => {
    if (!active) return;
    if (section === "#capture") {
      if (documentReady) captureHeading.current?.focus();
    } else heading.current?.focus();
  }, [active, section, documentId, documentReady]);

  function newCapture() {
    if (busy) return;
    fresh();
    location.hash = "#capture";
    requestAnimationFrame(() => capture.titleInput.current?.focus());
  }
  function exit() {
    if (!busy) onExit();
  }
  async function addCollection(event: React.FormEvent) {
    event.preventDefault();
    if (!collectionName.trim() || creating) return;
    setCreating(true);
    setOrgError("");
    try {
      await documents.createCollection(collectionName);
      refreshOrganization((value) => value + 1);
      setCollectionName("");
      collectionInput.current?.focus();
    } catch (cause) {
      setOrgError((cause as Error).message);
    } finally {
      setCreating(false);
    }
  }
  function openDocument(id: string) {
    if (busy) return;
    const hash = "#capture/document/" + id;
    if (location.hash === hash) void open(id);
    else location.hash = hash;
  }

  const current = navigation.find((item) => item.route === section)!;
  return (
    <div hidden={!active}>
      <div className="threadline" data-testid="capture-workspace">
        <aside className="tl-sidebar" aria-label="Threadline navigation">
          <a href="#capture" className="tl-brand">
            <span aria-hidden="true" className="tl-mark">
              <svg viewBox="0 0 24 24">
                <path d="M4 8h16M8 12h12M4 16h12" />
              </svg>
            </span>
            Threadline
          </a>
          <button className="tl-new" disabled={busy} onClick={newCapture}>
            <span aria-hidden="true">+</span>
            {capture.hasNewDraft ? "Resume capture" : "New capture"}
          </button>
          <nav aria-label="Workspace">
            <span className="tl-nav-label">Workspace</span>
            {navigation.map((item) => (
              <a
                key={item.route}
                href={item.route}
                aria-current={section === item.route ? "page" : undefined}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d={item.icon} />
                </svg>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="tl-sidebar-end">
            <button onClick={exit} disabled={busy}>
              Focus City <span aria-hidden="true">↗</span>
            </button>
            <details className="tl-profile">
              <summary>
                <span className="tl-avatar" aria-hidden="true">
                  {name.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  {name}
                  <small>Personal workspace</small>
                </span>
              </summary>
              <button
                disabled={busy}
                onClick={() => {
                  if (capture.allowLeave())
                    void capture.perform(async () => {
                      await api("/auth/logout", "POST");
                      location.reload();
                    });
                }}
              >
                Sign out
              </button>
            </details>
          </div>
        </aside>
        <main className="tl-main">
          <header className="tl-toolbar">
            <span>
              Workspace <span aria-hidden="true">/</span>{" "}
              <strong>{current.label}</strong>
            </span>
            {active && (
              <CommandPalette
                commands={[
                  {
                    id: "new",
                    label: "Create or resume capture",
                    action: newCapture,
                  },
                  ...navigation.map((item) => ({
                    id: item.route,
                    label: "Open " + item.label,
                    action: () => {
                      location.hash = item.route;
                    },
                  })),
                  { id: "city", label: "Open Focus City", action: exit },
                ]}
                onOpen={(item) => openDocument(item.id)}
              />
            )}
          </header>
          {(orgError || (capture.error && section !== "#capture")) && (
            <div className="tl-global-error" role="alert">
              {orgError || capture.error}
              {orgError && (
                <button
                  onClick={() => refreshOrganization((value) => value + 1)}
                >
                  Retry organization
                </button>
              )}
            </div>
          )}
          <div hidden={section !== "#capture"}>
            {documentId && documentId !== capture.saved?.id && (
              <div className="tl-content">
                <p role="status">
                  {busy
                    ? "Opening document…"
                    : capture.error || "Opening document…"}
                </p>
                {capture.error && !busy && (
                  <button onClick={() => void open(documentId)}>
                    Retry document
                  </button>
                )}
                <a href="#capture">Return to your draft</a>
              </div>
            )}
            <div hidden={!!documentId && documentId !== capture.saved?.id}>
              <CaptureEditor
                capture={capture}
                collections={organization.collections}
                heading={captureHeading}
              />
            </div>
          </div>
          {(section === "#capture/library" ||
            section === "#capture/collections" ||
            (section === "#capture/review" && !routedReviewId)) && (
            <div className="tl-content tl-browse-view" key={section}>
              <header className="tl-page-heading">
                <div>
                  <h1 ref={heading} tabIndex={-1}>
                    {current.label}
                  </h1>
                  <p>
                    {section === "#capture/review"
                      ? "Inspect extracted knowledge and check its source."
                      : section === "#capture/collections"
                        ? "Group related documents in flat collections."
                        : "Search and organize your saved documents."}
                  </p>
                </div>
                {section === "#capture/library" && (
                  <button
                    className="tl-primary"
                    onClick={newCapture}
                    disabled={busy}
                  >
                    New capture
                  </button>
                )}
              </header>
              {section === "#capture/collections" && (
                <form
                  className="tl-collection-create"
                  onSubmit={(event) => void addCollection(event)}
                >
                  <input
                    ref={collectionInput}
                    aria-label="Collection name"
                    placeholder="Collection name"
                    value={collectionName}
                    required
                    maxLength={100}
                    onChange={(event) => setCollectionName(event.target.value)}
                  />
                  <button disabled={creating || !collectionName.trim()}>
                    {creating ? "Creating…" : "Create collection"}
                  </button>
                </form>
              )}
              <Library
                collections={organization.collections}
                tags={organization.tags}
                revision={capture.revision + reviewVersion}
                reviewing={section === "#capture/review"}
                organizing={section === "#capture/collections"}
                selected={capture.saved?.id}
                onCreate={newCapture}
                onOpen={(item) => {
                  if (section === "#capture/review")
                    location.hash = "#capture/review/" + item.id;
                  else openDocument(item.id);
                }}
              />
            </div>
          )}
          {[
            ...new Set(
              routedReviewId
                ? [...unsavedReviews, routedReviewId]
                : unsavedReviews,
            ),
          ].map((id) => (
            <div key={id} hidden={id !== routedReviewId}>
              <ReviewPanel
                id={id}
                visible={active && id === routedReviewId}
                onBack={() => {
                  location.hash = "#capture/review";
                }}
                onChange={() => refreshReview((value) => value + 1)}
                onDraftChange={trackReviewDraft}
              />
            </div>
          ))}
          {section === "#capture/runs" && <HowItWorks runId={traceId} />}
        </main>
      </div>
    </div>
  );
}
