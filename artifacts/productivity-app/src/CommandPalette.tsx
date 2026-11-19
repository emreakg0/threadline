import { useEffect, useRef, useState } from "react";
import { documents, type LibraryDocument } from "./documents-api";

import { WorkspaceIcon, type WorkspaceIconName } from "./WorkspaceIcon";

const groups = ["Quick actions", "Navigation", "Documents"] as const;

type Command = {
  id: string;
  label: string;
  group: (typeof groups)[number];
  icon: WorkspaceIconName;
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
  const q = query.trim();
  const matches: Command[] = [
    ...commands.filter((command) =>
      command.label.toLowerCase().includes(q.toLowerCase()),
    ),
    ...found.map((item): Command => ({
      id: item.id,
      group: "Documents",
      icon: "capture",
      label: item.title,
      detail:
        [item.archived_at ? "Archived" : null, item.collection_name]
          .filter(Boolean)
          .join(" · ") || undefined,
      action: () => onOpen(item),
    })),
  ];
  const sections = groups.map((group) => ({
    group,
    options: matches.filter((option) => option.group === group),
  }));
  const options = sections.flatMap((section) => section.options);
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
    setPending(true);
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
        <WorkspaceIcon name="search" />
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
          <div className="tl-command-query">
            <WorkspaceIcon name="search" />
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
              placeholder="Search notes or commands…"
              onChange={(event) => {
                setQuery(event.target.value);
                if (event.target.value.trim() !== q) {
                  setFound([]);
                  setPending(true);
                  setIndex(0);
                  setError("");
                }
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
          </div>
          <div className="tl-command-scroll">
            <div
              id="tl-command-results"
              role="listbox"
              aria-label="Results"
              aria-busy={pending}
            >
              {sections.map(
                ({ group, options: entries }, groupIndex) =>
                  entries.length > 0 && (
                    <div
                      key={group}
                      role="group"
                      aria-labelledby={"tl-command-group-" + groupIndex}
                    >
                      <div
                        className="tl-command-group"
                        id={"tl-command-group-" + groupIndex}
                      >
                        {group}
                      </div>
                      {entries.map((option) => {
                        const i = options.indexOf(option);
                        return (
                          <div
                            id={"tl-command-" + i}
                            role="option"
                            aria-selected={i === selected}
                            key={option.id}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => run(option)}
                          >
                            <span className="tl-command-glyph">
                              <WorkspaceIcon name={option.icon} />
                            </span>
                            <span className="tl-command-name">
                              {option.label}
                            </span>
                            {option.detail && <small>{option.detail}</small>}
                            <span
                              aria-hidden="true"
                              className="tl-command-enter"
                            >
                              ↵
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ),
              )}
            </div>
            {pending && (
              <p className="tl-command-status" role="status">
                Finding documents…
              </p>
            )}
            {!pending && !error && !options.length && (
              <div className="tl-command-empty" role="status">
                <WorkspaceIcon name="search" />
                <p>
                  <strong>No matching commands or documents</strong>
                </p>
                <p>Try a shorter phrase from the title or source.</p>
              </div>
            )}
          </div>
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
