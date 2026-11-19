import { useEffect, useState, type ReactNode } from "react";
import {
  documents,
  type Collection,
  type LibraryDocument,
} from "./documents-api";
import { WorkspaceIcon } from "./WorkspaceIcon";

export function Library({
  collections,
  tags,
  revision,
  visible,
  reviewing,
  collectionCreate,
  selected,
  onOpen,
  onCreate,
}: {
  collections: Collection[];
  tags: string[];
  revision: number;
  visible: boolean;
  reviewing: boolean;
  collectionCreate?: ReactNode;
  selected?: string;
  onOpen: (item: LibraryDocument) => void;
  onCreate: () => void;
}) {
  const [archived, setArchived] = useState(false);
  const [q, setQuery] = useState("");
  const [collection, setCollection] = useState("");
  const [tag, setTag] = useState("");
  const [items, setItems] = useState<LibraryDocument[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState({ offset: 0, revision });
  const offset = page.revision === revision ? page.offset : 0;
  const setOffset = (offset: number) => setPage({ offset, revision });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let current = true;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(
      () => {
        documents
          .list({ archived, q, collection, tag, review: reviewing }, offset)
          .then((page) => {
            if (!current) return;
            setItems((previous) =>
              offset === 0
                ? page.items
                : [
                    ...previous,
                    ...page.items.filter(
                      (item) => !previous.some((old) => old.id === item.id),
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
      },
      q && !offset ? 180 : 0,
    );
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [
    visible,
    archived,
    q,
    collection,
    tag,
    reviewing,
    offset,
    revision,
    retry,
  ]);

  const organizing = !!collectionCreate;
  const filtered = !!(q.trim() || tag || (!organizing && collection));
  const reviewEmpty =
    reviewing && !filtered && !loading && !error && !items.length;
  const collectionName = collections.find(
    (item) => item.id === collection,
  )?.name;
  function chooseCollection(id: string) {
    setOffset(0);
    setCollection(id);
  }

  return (
    <div
      className={organizing ? "tl-browser tl-collection-browser" : "tl-browser"}
    >
      {organizing && (
        <section
          className="tl-collection-nav"
          aria-label="Collection navigator"
        >
          <h2>Browse collections</h2>
          <div className="tl-collections">
            <button
              aria-pressed={!collection}
              onClick={() => chooseCollection("")}
            >
              <WorkspaceIcon name="knowledge" /> <span>All collections</span>
            </button>
            {collections.map((item) => (
              <button
                key={item.id}
                aria-pressed={collection === item.id}
                onClick={() => chooseCollection(item.id)}
              >
                <WorkspaceIcon name="folder" /> <span>{item.name}</span>
              </button>
            ))}
          </div>
          {!collections.length && (
            <p>
              Create a collection, then assign documents from their details.
            </p>
          )}
          {collectionCreate}
        </section>
      )}
      <div className="tl-library-pane">
        {organizing && (
          <div className="tl-collection-heading">
            <WorkspaceIcon name="folder" />
            <h2>{collectionName ?? "All collections"}</h2>
          </div>
        )}
        <div className="tl-filters" hidden={reviewEmpty}>
          <div className="tl-search-field">
            <WorkspaceIcon name="search" />
            <input
              type="search"
              aria-label="Search saved documents"
              placeholder="Search titles and source text…"
              maxLength={300}
              value={q}
              onChange={(event) => {
                setOffset(0);
                setQuery(event.target.value);
              }}
            />
          </div>
          {!organizing && (
            <select
              aria-label="Filter by collection"
              value={collection}
              onChange={(event) => {
                chooseCollection(event.target.value);
              }}
            >
              <option value="">All collections</option>
              {collections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Filter by tag"
            value={tag}
            onChange={(event) => {
              setOffset(0);
              setTag(event.target.value);
            }}
          >
            <option value="">All tags</option>
            {tag && !tags.includes(tag) && <option>{tag}</option>}
            {tags.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="tl-tabs" role="group" aria-label="Document status">
          <button
            aria-pressed={!archived}
            onClick={() => {
              setOffset(0);
              setArchived(false);
            }}
          >
            Active
          </button>
          <button
            aria-pressed={archived}
            onClick={() => {
              setOffset(0);
              setArchived(true);
            }}
          >
            Archived
          </button>
        </div>
        <section
          className={reviewEmpty ? "tl-library tl-review-intro" : "tl-library"}
          aria-label={
            reviewing ? "Documents with extracted blocks" : "Saved documents"
          }
          aria-busy={loading}
        >
          {!!items.length &&
            !(loading && !offset) &&
            (!error || offset > 0) && (
              <div className="tl-list-heading">
                <span>{reviewing ? "Documents to review" : "Document"}</span>
                <span>Last updated</span>
              </div>
            )}
          {loading && !offset ? (
            <p className="tl-list-message" role="status">
              {reviewing
                ? "Looking for extracted blocks…"
                : "Loading documents…"}
            </p>
          ) : reviewEmpty ? (
            <div className="tl-empty tl-review-empty">
              <div className="tl-empty-glyph">
                <WorkspaceIcon name="review" />
              </div>
              <div>
                <h2>
                  {archived
                    ? "No review blocks in archived documents"
                    : "No extracted knowledge yet"}
                </h2>
                <p>
                  Blocks appear after a saved document is processed. Live Gemini
                  is disabled, so live extraction cannot populate this queue.
                </p>
                <ol aria-label="Review workflow">
                  <li>
                    <WorkspaceIcon name="capture" /> Inspect a block
                  </li>
                  <li>
                    <WorkspaceIcon name="evidence" /> Verify its source
                  </li>
                  <li>
                    <WorkspaceIcon name="review" /> Confirm or dismiss
                  </li>
                </ol>
                <a className="tl-text-link" href="#capture/runs">
                  See how extraction works <WorkspaceIcon name="arrow" />
                </a>
              </div>
            </div>
          ) : !error && !items.length ? (
            <div className="tl-empty">
              <div className="tl-empty-glyph">
                <WorkspaceIcon
                  name={filtered ? "search" : organizing ? "folder" : "capture"}
                />
              </div>
              <h2>
                {filtered
                  ? "No matching documents"
                  : collectionName
                    ? "No documents in this collection"
                    : archived
                      ? "No archived documents"
                      : "No saved documents yet"}
              </h2>
              <p>
                {filtered
                  ? "Try a different search or clear your filters."
                  : collectionName
                    ? "Assign a saved document from its collection and tags."
                    : archived
                      ? "Archived documents stay available to restore."
                      : "Save a capture to start building your library."}
              </p>
              {filtered ? (
                <button
                  onClick={() => {
                    setOffset(0);
                    setQuery("");
                    setTag("");
                    if (!organizing) setCollection("");
                  }}
                >
                  Clear filters
                </button>
              ) : (
                !reviewing &&
                !archived &&
                !collection && (
                  <button className="tl-primary" onClick={onCreate}>
                    New capture
                  </button>
                )
              )}
            </div>
          ) : (
            (!error || offset > 0) &&
            items.map((item) => (
              <button
                className="tl-document-row"
                key={item.id}
                aria-current={selected === item.id ? "true" : undefined}
                onClick={() => onOpen(item)}
              >
                <span className="tl-row-glyph">
                  <WorkspaceIcon name={reviewing ? "review" : "capture"} />
                </span>
                <span className="tl-row-text">
                  <strong>{item.title}</strong>
                  <small className="tl-row-meta">
                    {item.pending_review > 0 && (
                      <span className="tl-pending">
                        {item.pending_review} to review
                      </span>
                    )}
                    {(!organizing || !collection) && (
                      <span className="tl-row-folder">
                        {item.collection_name && (
                          <WorkspaceIcon name="folder" />
                        )}
                        {item.collection_name ?? "Unfiled"}
                      </span>
                    )}
                    {item.tags.slice(0, 3).map((name) => (
                      <span className="tl-row-tag" key={name}>
                        #{name}
                      </span>
                    ))}
                    {item.tags.length > 3 && (
                      <span className="tl-row-tag">
                        +{item.tags.length - 3} tags
                      </span>
                    )}
                  </small>
                </span>
                <time dateTime={item.updated_at}>
                  {new Date(item.updated_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </time>
                <span className="tl-row-arrow">
                  <WorkspaceIcon name="arrow" />
                </span>
              </button>
            ))
          )}
          {error && (
            <div className="tl-list-message" role="alert">
              {error}{" "}
              <button onClick={() => setRetry((value) => value + 1)}>
                Retry
              </button>
            </div>
          )}
          {!error && next !== null && !(loading && !offset) && (
            <button
              className="tl-more"
              disabled={loading}
              onClick={() => setOffset(next)}
            >
              {loading ? "Loading…" : "Load more documents"}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
