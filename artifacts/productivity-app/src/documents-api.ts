import { api } from "./api";

export type DocumentSummary = {
  id: string;
  title: string;
  version: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  collection_id: string | null;
  tags: string[];
};
export type LibraryDocument = DocumentSummary & {
  collection_name: string | null;
  pending_review: number;
};
export type Collection = { id: string; name: string };
export type SourceRevision = {
  id: string;
  revision: number;
  source_text: string;
  created_at: string;
};
export type CaptureDocument = DocumentSummary & { source: SourceRevision };
export type RevisionSummary = Omit<SourceRevision, "source_text">;
type Page<T> = { items: T[]; next: number | null };
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const texts = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
const nullableText = (v: unknown): v is string | null => v === null || text(v);
const collection = (v: unknown): v is Collection =>
  record(v) && text(v.id) && text(v.name);
const integer = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) > 0;
const revisionSummary = (v: unknown): v is RevisionSummary =>
  record(v) && text(v.id) && integer(v.revision) && text(v.created_at);
const source = (v: unknown): v is SourceRevision =>
  record(v) && text(v.source_text) && revisionSummary(v);
const summary = (v: unknown): v is DocumentSummary =>
  record(v) &&
  text(v.id) &&
  text(v.title) &&
  integer(v.version) &&
  text(v.created_at) &&
  text(v.updated_at) &&
  nullableText(v.archived_at) &&
  nullableText(v.collection_id) &&
  texts(v.tags);
const libraryDocument = (v: unknown): v is LibraryDocument =>
  record(v) &&
  nullableText(v.collection_name) &&
  Number.isSafeInteger(v.pending_review) &&
  Number(v.pending_review) >= 0 &&
  summary(v);
function document(v: unknown): CaptureDocument {
  const revision = record(v) ? v.source : undefined;
  if (!summary(v) || !source(revision))
    throw Error("The document response was invalid. Your draft is unchanged.");
  return { ...v, source: revision };
}
function page<T>(
  v: unknown,
  key: string,
  valid: (v: unknown) => v is T,
): Page<T> {
  if (
    !record(v) ||
    !Array.isArray(v[key]) ||
    !(v[key] as unknown[]).every(valid) ||
    !(v.next_offset === null || integer(v.next_offset))
  )
    throw Error("The library response was invalid. Please retry.");
  return { items: v[key] as T[], next: v.next_offset as number | null };
}
export const documents = {
  list: async (
    {
      archived = false,
      q = "",
      collection = "",
      tag = "",
      review = false,
    } = {},
    offset = 0,
  ) =>
    page(
      await api(
        "/documents?" +
          new URLSearchParams({
            archived: String(archived),
            offset: String(offset),
            q: q.trim(),
            collection,
            tag,
            review: String(review),
          }),
      ),
      "documents",
      libraryDocument,
    ),
  organization: async () => {
    const v: unknown = await api("/documents/organization");
    if (
      !record(v) ||
      !Array.isArray(v.collections) ||
      !v.collections.every(collection) ||
      !texts(v.tags)
    )
      throw Error("Organization could not be loaded.");
    return { collections: v.collections as Collection[], tags: v.tags };
  },
  createCollection: async (name: string) => {
    const v: unknown = await api("/documents/organization", "POST", { name });
    if (!collection(v)) throw Error("The collection response was invalid.");
    return v;
  },
  get: async (id: string) => document(await api(`/documents/${id}`)),
  create: async (id: string, title: string, source_text: string) =>
    document(await api("/documents", "POST", { id, title, source_text })),
  update: async (
    id: string,
    version: number,
    changes: {
      title?: string;
      source_text?: string;
      archived?: boolean;
      collection_id?: string | null;
      tags?: string[];
    },
  ) =>
    document(await api(`/documents/${id}`, "PATCH", { version, ...changes })),
  revisions: async (id: string, offset = 0) =>
    page(
      await api(`/documents/${id}/revisions?offset=${offset}`),
      "revisions",
      revisionSummary,
    ),
  source: async (id: string, revision: number): Promise<SourceRevision> => {
    const v: unknown = await api(`/documents/${id}/revisions/${revision}`);
    if (!source(v))
      throw Error("The source response was invalid. Please retry.");
    return v;
  },
};

export const blockKinds = [
  "summary",
  "action",
  "fact",
  "decision",
  "question",
  "deadline",
  "note",
];
export const reviewStates = ["needs_review", "confirmed", "dismissed"] as const;
export type ReviewState = (typeof reviewStates)[number];
type Evidence = {
  id: string;
  quote: string;
  revision: number;
  start_offset: number;
  end_offset: number;
};
type BlockFields = {
  version: number;
  content: string;
  review_state: ReviewState;
  edited_at: string | null;
};
export type KnowledgeBlock = BlockFields & {
  id: string;
  kind: string;
  uncertainty_reason: string | null;
  provider: string | null;
  run_id: string | null;
  run_revision: number | null;
  evidence: Evidence[];
};
const blockFields = (v: unknown): v is BlockFields =>
  record(v) &&
  integer(v.version) &&
  text(v.content) &&
  nullableText(v.edited_at) &&
  reviewStates.some((state) => state === v.review_state);
const evidence = (v: unknown): v is Evidence =>
  record(v) &&
  text(v.id) &&
  text(v.quote) &&
  integer(v.revision) &&
  (v.start_offset === 0 || integer(v.start_offset)) &&
  integer(v.end_offset) &&
  v.end_offset > v.start_offset;
const block = (v: unknown): v is KnowledgeBlock =>
  record(v) &&
  text(v.id) &&
  blockKinds.some((kind) => kind === v.kind) &&
  nullableText(v.uncertainty_reason) &&
  nullableText(v.provider) &&
  nullableText(v.run_id) &&
  (v.run_revision === null || integer(v.run_revision)) &&
  Array.isArray(v.evidence) &&
  v.evidence.every(evidence) &&
  blockFields(v);

export const review = {
  list: async (
    id: string,
    kind: string,
    state: string,
    offset = 0,
    blockId = "",
  ) =>
    page(
      await api(
        "/documents/" +
          id +
          "/blocks?" +
          new URLSearchParams({
            kind,
            state,
            offset: String(offset),
            block: blockId,
          }),
      ),
      "blocks",
      block,
    ),
  update: async (
    id: string,
    blockId: string,
    version: number,
    changes: { content?: string; review_state?: ReviewState },
  ) => {
    const v: unknown = await api(
      "/documents/" + id + "/blocks/" + blockId,
      "PATCH",
      { version, ...changes },
    );
    if (!blockFields(v)) throw Error("The saved block response was invalid.");
    return v;
  },
};
