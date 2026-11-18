import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "./api";
import {
  documents,
  type CaptureDocument,
  type RevisionSummary,
  type SourceRevision,
} from "./documents-api";

type Draft = {
  saved: CaptureDocument | null;
  captureId: string;
  title: string;
  body: string;
  collection: string;
  tags: string[];
  conflict: CaptureDocument | null;
};

export function useCapture(unsavedReview: boolean) {
  const [saved, setSaved] = useState<CaptureDocument | null>(null);
  const [captureId, setCaptureId] = useState<string>(() => crypto.randomUUID());
  const [title, setTitle] = useState(""),
    [body, setBody] = useState("");
  const [collection, setCollection] = useState(""),
    [tags, setTags] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const drafts = useRef(new Map<string, Draft>());
  const [notice, setNotice] = useState(""),
    [conflict, setConflict] = useState<CaptureDocument | null>(null);
  const [history, setHistory] = useState<RevisionSummary[]>([]),
    [historyNext, setHistoryNext] = useState<number | null>(null);
  const [evidence, setEvidence] = useState<SourceRevision | null>(null),
    [historyOpen, setHistoryOpen] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const operation = useRef(false);
  const tagsChanged =
    !!saved && JSON.stringify(tags) !== JSON.stringify(saved.tags);
  const collectionChanged =
    !!saved && collection !== (saved.collection_id ?? "");
  const dirty = saved
    ? title !== saved.title ||
      body !== saved.source.source_text ||
      collectionChanged ||
      tagsChanged
    : !!(title || body);
  const valid =
    title.trim().length > 0 &&
    title.trim().length <= 300 &&
    body.trim().length > 0 &&
    body.length <= 20000;
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty || drafts.current.size || unsavedReview) event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, unsavedReview]);
  function allowLeave() {
    return (
      !(dirty || drafts.current.size || unsavedReview) ||
      window.confirm("Discard your unsaved workspace drafts?")
    );
  }
  function resetPanels() {
    setConflict(null);
    setHistory([]);
    setHistoryOpen(false);
    setEvidence(null);
    setError("");
    setNotice("");
  }
  function stash() {
    if (dirty)
      drafts.current.set(saved?.id ?? "new", {
        saved,
        captureId,
        title,
        body,
        collection,
        tags,
        conflict,
      });
  }
  function restore(key: string) {
    const draft = drafts.current.get(key);
    if (!draft) return false;
    drafts.current.delete(key);
    resetPanels();
    setSaved(draft.saved);
    setCaptureId(draft.captureId);
    setTitle(draft.title);
    setBody(draft.body);
    setCollection(draft.collection);
    setTags(draft.tags);
    setConflict(draft.conflict);
    return true;
  }
  function adopt(doc: CaptureDocument) {
    setSaved(doc);
    setCaptureId(doc.id);
    setTitle(doc.title);
    setBody(doc.source.source_text);
    setCollection(doc.collection_id ?? "");
    setTags(doc.tags);
    resetPanels();
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
              collection_id: collectionChanged ? collection || null : undefined,
              tags: tagsChanged ? tags : undefined,
            })
          : await documents.create(captureId, title, body);
        adopt(doc);
        setNotice("Saved to your library");
        setRevision((value) => value + 1);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setError(e.message);
          try {
            setConflict(await documents.get(saved?.id ?? captureId));
            setRevision((value) => value + 1);
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
    if (busy || operation.current || !saved) return;
    stash();
    if (restore("new")) return;
    resetPanels();
    setSaved(null);
    setCaptureId(crypto.randomUUID());
    setTitle("");
    setBody("");
    setCollection("");
    setTags([]);
  }
  async function open(id: string) {
    if (busy || operation.current) return;
    if (saved?.id === id) return;
    if (drafts.current.has(id)) {
      stash();
      restore(id);
      return;
    }
    await perform(async () => {
      const doc = await documents.get(id);
      stash();
      adopt(doc);
    });
  }
  async function archive() {
    if (!saved || dirty) return;
    await perform(async () => {
      const doc = await documents.update(saved.id, saved.version, {
        archived: !saved.archived_at,
      });
      adopt(doc);
      setNotice(doc.archived_at ? "Document archived" : "Document restored");
      setRevision((value) => value + 1);
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
    collection,
    setCollection,
    tags,
    setTags,
    revision,
    allowLeave,
    fresh,
    open,
    hasNewDraft: drafts.current.has("new"),
  };
}
