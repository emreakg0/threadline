import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "./api";
import {
  documents,
  type CaptureDocument,
  type DocumentSummary,
  type RevisionSummary,
  type SourceRevision,
} from "./documents-api";

export function useCapture() {
  const [saved, setSaved] = useState<CaptureDocument | null>(null);
  const [captureId, setCaptureId] = useState<string>(() => crypto.randomUUID());
  const [title, setTitle] = useState(""),
    [body, setBody] = useState("");
  const [items, setItems] = useState<DocumentSummary[]>([]),
    [archived, setArchived] = useState(false);
  const [next, setNext] = useState<number | null>(null),
    [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [listError, setListError] = useState("");
  const [notice, setNotice] = useState(""),
    [conflict, setConflict] = useState<CaptureDocument | null>(null);
  const [history, setHistory] = useState<RevisionSummary[]>([]),
    [historyNext, setHistoryNext] = useState<number | null>(null);
  const [evidence, setEvidence] = useState<SourceRevision | null>(null),
    [historyOpen, setHistoryOpen] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const operation = useRef(false);
  const dirty = saved
    ? title !== saved.title || body !== saved.source.source_text
    : !!(title || body);
  const valid =
    title.trim().length > 0 &&
    title.trim().length <= 300 &&
    body.trim().length > 0 &&
    body.length <= 20000;
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setListError("");
    documents
      .list(archived)
      .then((page) => {
        if (!cancelled) {
          setItems(page.items);
          setNext(page.next);
        }
      })
      .catch((e) => {
        if (!cancelled) setListError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [archived]);
  function allowLeave() {
    return (
      !dirty || window.confirm("Discard the unsaved changes in this draft?")
    );
  }
  function adopt(doc: CaptureDocument) {
    setSaved(doc);
    setCaptureId(doc.id);
    setTitle(doc.title);
    setBody(doc.source.source_text);
    setConflict(null);
    setHistory([]);
    setHistoryOpen(false);
    setEvidence(null);
    setError("");
  }
  async function refreshList() {
    try {
      const page = await documents.list(archived);
      setItems(page.items);
      setNext(page.next);
      setListError("");
    } catch (e) {
      setListError((e as Error).message);
    }
  }
  async function perform(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy || !dirty) return;
    await perform(async () => {
      try {
        const doc = saved
          ? await documents.update(saved.id, saved.version, {
              title,
              source_text: body,
            })
          : await documents.create(captureId, title, body);
        adopt(doc);
        setNotice("Saved to your library");
        await refreshList();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setError(e.message);
          try {
            setConflict(await documents.get(saved?.id ?? captureId));
            await refreshList();
          } catch {
            setError(
              "Your draft is intact. The saved version could not be loaded; retry when connected.",
            );
          }
        } else throw e;
      }
    });
  }
  function fresh() {
    if (busy || !allowLeave()) return;
    setSaved(null);
    setCaptureId(crypto.randomUUID());
    setTitle("");
    setBody("");
    setConflict(null);
    setHistory([]);
    setHistoryOpen(false);
    setEvidence(null);
    setError("");
    setNotice("");
    titleInput.current?.focus();
  }
  async function open(id: string) {
    if (busy || !allowLeave()) return;
    await perform(async () => adopt(await documents.get(id)));
  }
  async function archive() {
    if (!saved || dirty) return;
    await perform(async () => {
      const doc = await documents.update(saved.id, saved.version, {
        archived: !saved.archived_at,
      });
      adopt(doc);
      setNotice(doc.archived_at ? "Document archived" : "Document restored");
      await refreshList();
    });
  }
  async function showHistory() {
    if (!saved) return;
    await perform(async () => {
      const page = await documents.revisions(saved.id);
      setHistory(page.items);
      setHistoryNext(page.next);
      setEvidence(await documents.source(saved.id, 1));
      setHistoryOpen(true);
    });
  }
  return {
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
  };
}
