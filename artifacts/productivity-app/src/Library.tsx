import { useEffect, useState } from "react";
import {
  documents,
  type Collection,
  type LibraryDocument,
} from "./documents-api";

export function Library({
  collections,
  tags,
  revision,
  reviewing,
  organizing,
  selected,
  onOpen,
  onCreate,
}: {
  collections: Collection[];
  tags: string[];
  revision: number;
  reviewing: boolean;
  organizing: boolean;
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
  }, [archived, q, collection, tag, reviewing, offset, revision, retry]);

  return (
    <div className="tl-browser">
      {organizing && (
        <div className="tl-collections" aria-label="Collections">
          <button
            aria-pressed={!collection}
            onClick={() => {
              setOffset(0);
              setCollection("");
            }}
          >
            All collections
          </button>
          {collections.map((item) => (
            <button
              key={item.id}
              aria-pressed={collection === item.id}
              onClick={() => {
                setOffset(0);
                setCollection(item.id);
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
      <div className="tl-filters">
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
        {!organizing && (
          <select
            aria-label="Filter by collection"
            value={collection}
            onChange={(event) => {
              setOffset(0);
              setCollection(event.target.value);
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
        className="tl-library"
        aria-label={
          reviewing ? "Documents with extracted blocks" : "Saved documents"
        }
        aria-busy={loading}
      >
        <div className="tl-list-heading">
          <span>Document</span>
          <span>Last updated</span>
        </div>
        {loading && !offset ? (
          <p className="tl-list-message" role="status">
            Loading your library…
          </p>
        ) : !error && !items.length ? (
          <div className="tl-empty">
            <h2>
              {q.trim() || tag || collection
                ? "No matching documents"
                : reviewing
                  ? "No extracted knowledge yet"
                  : archived
                    ? "No archived documents"
                    : "No saved documents yet"}
            </h2>
            <p>
              {q.trim() || tag || collection
                ? "Try a different search or clear your filters."
                : reviewing
                  ? "Saved extraction results appear here for review."
                  : archived
                    ? "Archived documents stay available to restore."
                    : "Save a capture to start building your library."}
            </p>
            {!reviewing && !archived && !(q.trim() || tag || collection) && (
              <button className="tl-primary" onClick={onCreate}>
                New capture
              </button>
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
              <span className="tl-row-text">
                <strong>{item.title}</strong>
                <small>
                  {[
                    item.collection_name,
                    item.pending_review
                      ? item.pending_review + " to review"
                      : null,
                    ...item.tags.map((name) => "#" + name),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Unfiled"}
                </small>
              </span>
              <time dateTime={item.updated_at}>
                {new Date(item.updated_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
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
  );
}
