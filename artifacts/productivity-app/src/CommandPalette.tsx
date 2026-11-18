import { useEffect, useRef, useState } from "react";
import { documents, type LibraryDocument } from "./documents-api";

type Command = {
  id: string;
  label: string;
  detail?: string;
  action: () => void;
};

export function CommandPalette({
  commands,
  onOpen,
}: {
  commands: Command[];
  onOpen: (item: LibraryDocument) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [found, setFound] = useState<LibraryDocument[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const q = query.trim().toLowerCase();
  const options = [
    ...commands.filter((command) => command.label.toLowerCase().includes(q)),
    ...found.map((item) => ({
      id: item.id,
      label: item.title,
      detail: item.archived_at
        ? "Archived document"
        : (item.collection_name ?? "Document"),
      action: () => onOpen(item),
    })),
  ];
  const selected = Math.min(index, options.length - 1);

  function show() {
    const node = dialog.current;
    if (!node || node.open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setQuery("");
    setIndex(0);
    setFound([]);
    setError("");
    setOpen(true);
    node.showModal();
  }
  function close() {
    if (!dialog.current?.open) return;
    dialog.current.close();
    setOpen(false);
    previousFocus.current?.focus();
  }
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "k"
      )
        return;
      event.preventDefault();
      if (event.repeat) return;
      if (dialog.current?.open) close();
      else show();
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setPending(true);
    const timer = window.setTimeout(
      () => {
        Promise.all([
          documents.list({ q }),
          ...(q ? [documents.list({ q, archived: true })] : []),
        ])
          .then((pages) => {
            if (current)
              setFound(pages.flatMap((page) => page.items.slice(0, 8)));
          })
          .catch((cause: Error) => {
            if (current) setError(cause.message);
          })
          .finally(() => {
            if (current) setPending(false);
          });
      },
      q ? 160 : 0,
    );
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [open, q, retry]);
  useEffect(() => {
    if (open && selected >= 0)
      document
        .getElementById("tl-command-" + selected)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, selected]);

  function run(command: Command) {
    close();
    command.action();
  }
  return (
    <>
      <button
        className="tl-command-trigger"
        onClick={show}
        aria-haspopup="dialog"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="4.5" />
          <path d="m12 12 4 4" />
        </svg>
        <span>Search or jump to…</span>
        <kbd>⌘ / Ctrl K</kbd>
      </button>
      <dialog
        className="tl-command"
        ref={dialog}
        aria-label="Workspace commands"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="tl-command-inner">
          <input
            type="search"
            role="combobox"
            aria-label="Search documents and commands"
            aria-expanded={open}
            aria-controls="tl-command-results"
            aria-autocomplete="list"
            aria-activedescendant={
              selected >= 0 ? "tl-command-" + selected : undefined
            }
            autoFocus
            value={query}
            maxLength={300}
            placeholder="Search documents or type a command…"
            onChange={(event) => {
              setQuery(event.target.value);
              setFound([]);
              setIndex(0);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter" && selected >= 0) {
                event.preventDefault();
                run(options[selected]);
              } else if (
                options.length &&
                (event.key === "ArrowDown" || event.key === "ArrowUp")
              ) {
                event.preventDefault();
                setIndex(
                  (selected +
                    options.length +
                    (event.key === "ArrowDown" ? 1 : -1)) %
                    options.length,
                );
              }
            }}
          />
          <div id="tl-command-results" role="listbox" aria-label="Results">
            {options.map((option, i) => (
              <div
                id={"tl-command-" + i}
                role="option"
                aria-selected={i === selected}
                key={option.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => run(option)}
              >
                <span>{option.label}</span>
                {option.detail && <small>{option.detail}</small>}
              </div>
            ))}
          </div>
          {pending && <p role="status">Searching documents…</p>}
          {!pending && !error && !options.length && (
            <p role="status">No matching commands or documents.</p>
          )}
          {error && (
            <p role="alert">
              {error}{" "}
              <button
                onClick={() => {
                  setError("");
                  setRetry((value) => value + 1);
                }}
              >
                Retry
              </button>
            </p>
          )}
          <footer>
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> Navigate
            </span>
            <span>
              <kbd>↵</kbd> Open
            </span>
            <button onClick={close}>
              <kbd>Esc</kbd> Close
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
