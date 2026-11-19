import { useCallback, useEffect, useRef, useState } from "react";
import { HowItWorks } from "./HowItWorks";
import { api } from "./api";
import { documents } from "./documents-api";
import { useCapture } from "./useCapture";
import { ActionPlan } from "./ActionPlan";
import type { Project } from "./types";
import { CaptureEditor } from "./CaptureEditor";
import { Library } from "./Library";
import { ReviewPanel } from "./ReviewPanel";
import { CommandPalette } from "./CommandPalette";
import { WorkspaceIcon } from "./WorkspaceIcon";
import "./capture.css";

const navigation = [
  { route: "#capture", label: "Brain dump", icon: "capture" },
  { route: "#capture/plan", label: "Action Plan", icon: "review" },
  {
    route: "#capture/library",
    label: "Knowledge",
    icon: "knowledge",
  },
  {
    route: "#capture/review",
    label: "Review",
    icon: "review",
  },
  {
    route: "#capture/collections",
    label: "Collections",
    icon: "folder",
  },
  {
    route: "#capture/runs",
    label: "How It Works",
    icon: "trace",
  },
] as const;

export function CaptureWorkspace({
  name,
  onExit,
  active,
  projects,
}: {
  name: string;
  onExit: () => void;
  active: boolean;
  projects: Project[];
}) {
  const [unsavedReviews, setUnsavedReviews] = useState<string[]>([]);
  const [unsavedPlans, setUnsavedPlans] = useState<string[]>([]);
  const capture = useCapture(
    unsavedReviews.length > 0 || unsavedPlans.length > 0,
  );
  const [route, setRoute] = useState(location.hash);
  const [lastPlan, setLastPlan] = useState<string | null>(null);
  const [lastBrowse, setLastBrowse] = useState<string | null>(null);
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
  const planId = route.startsWith("#capture/plan/")
    ? route.slice("#capture/plan/".length)
    : null;
  const mountedPlan = planId || lastPlan;
  useEffect(() => {
    if (planId) setLastPlan(planId);
  }, [planId]);
  const { open, fresh, busy } = capture;
  const documentReady = !documentId || documentId === capture.saved?.id;
  const browsing =
    section === "#capture/library" ||
    section === "#capture/collections" ||
    (section === "#capture/review" && !routedReviewId) ||
    (section === "#capture/plan" && !planId);
  const browseSection = browsing ? section : lastBrowse;

  useEffect(() => {
    if (active && browsing) setLastBrowse(section);
  }, [active, browsing, section]);

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
  const trackPlanDraft = useCallback((id: string, dirty: boolean) => {
    setUnsavedPlans((ids) => {
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
              <WorkspaceIcon name="mark" />
            </span>
            Threadline
          </a>
          <button className="tl-new" disabled={busy} onClick={newCapture}>
            <WorkspaceIcon name="plus" />
            <span className="tl-new-label">
              {capture.hasNewDraft ? "Resume dump" : "New brain dump"}
            </span>
          </button>
          <nav aria-label="Workspace">
            <span className="tl-nav-label">Workspace</span>
            {navigation.map((item) => (
              <a
                key={item.route}
                href={item.route}
                aria-current={section === item.route ? "page" : undefined}
              >
                <WorkspaceIcon name={item.icon} />
                {item.label}
              </a>
            ))}
          </nav>
          <div className="tl-sidebar-end">
            <button onClick={exit} disabled={busy}>
              <WorkspaceIcon name="city" /> <span>Focus City</span>
            </button>
            <details className="tl-profile">
              <summary aria-label={name + " account"}>
                <span className="tl-avatar" aria-hidden="true">
                  {name.slice(0, 1).toUpperCase()}
                </span>
                <span>{name}</span>
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
              <WorkspaceIcon name={current.icon} />
              <strong>{current.label}</strong>
            </span>
            {active && (
              <CommandPalette
                commands={[
                  {
                    id: "new",
                    label: capture.hasNewDraft
                      ? "Resume brain dump"
                      : "Write a brain dump",
                    detail: "Put what’s on your mind into words",
                    group: "Quick actions",
                    icon: "plus",
                    action: newCapture,
                  },
                  ...navigation.map((item) => ({
                    id: item.route,
                    label: "Open " + item.label,
                    group: "Navigation" as const,
                    icon: item.icon,
                    action: () => {
                      location.hash = item.route;
                    },
                  })),
                  {
                    id: "city",
                    label: "Open Focus City",
                    group: "Navigation",
                    icon: "city",
                    action: exit,
                  },
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
                backToCollections={lastBrowse === "#capture/collections"}
              />
            </div>
          </div>
          {browseSection && (
            <div
              className="tl-content tl-browse-view"
              key={browseSection}
              hidden={!browsing}
            >
              <header className="tl-page-heading">
                <div>
                  <h1 ref={heading} tabIndex={-1}>
                    {
                      navigation.find((item) => item.route === browseSection)
                        ?.label
                    }
                  </h1>
                  <p>
                    {browseSection === "#capture/plan"
                      ? "Choose a brain dump to open its plan."
                      : browseSection === "#capture/review"
                        ? "Check extracted knowledge against its source and decide what to keep."
                        : browseSection === "#capture/collections"
                          ? "Keep related documents together."
                          : "Find your saved notes by title, source text, collection or tag."}
                  </p>
                </div>
                {browseSection === "#capture/library" && (
                  <button
                    className="tl-primary"
                    onClick={newCapture}
                    disabled={busy}
                  >
                    New capture
                  </button>
                )}
              </header>
              <Library
                collections={organization.collections}
                tags={organization.tags}
                revision={capture.revision + reviewVersion}
                visible={active && browsing}
                reviewing={browseSection === "#capture/review"}
                collectionCreate={
                  browseSection === "#capture/collections" ? (
                    <form
                      className="tl-collection-create"
                      onSubmit={(event) => void addCollection(event)}
                    >
                      <input
                        ref={collectionInput}
                        aria-label="Collection name"
                        placeholder="Collection name"
                        value={collectionName}
                        readOnly={creating}
                        required
                        maxLength={100}
                        onChange={(event) =>
                          setCollectionName(event.target.value)
                        }
                      />
                      <button disabled={creating || !collectionName.trim()}>
                        {creating ? "Creating…" : "Create collection"}
                      </button>
                    </form>
                  ) : undefined
                }
                selected={capture.saved?.id}
                onCreate={newCapture}
                onOpen={(item) => {
                  if (browseSection === "#capture/plan")
                    location.hash = "#capture/plan/" + item.id;
                  else if (browseSection === "#capture/review")
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
          {[
            ...new Set(
              mountedPlan ? [...unsavedPlans, mountedPlan] : unsavedPlans,
            ),
          ].map((id) => (
            <div key={id} hidden={id !== planId}>
              <ActionPlan
                id={id}
                visible={active && id === planId}
                projects={projects}
                onDraftChange={trackPlanDraft}
              />
            </div>
          ))}
          {section === "#capture/runs" && <HowItWorks runId={traceId} />}
        </main>
      </div>
    </div>
  );
}
