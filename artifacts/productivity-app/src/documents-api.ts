import { api } from "./api";

export type DocumentSummary = {
  id: string;
  title: string;
  version: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};
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
  (v.archived_at === null || text(v.archived_at));
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
  list: async (archived: boolean, offset = 0) =>
    page(
      await api(`/documents?archived=${archived}&offset=${offset}`),
      "documents",
      summary,
    ),
  get: async (id: string) => document(await api(`/documents/${id}`)),
  create: async (id: string, title: string, source_text: string) =>
    document(await api("/documents", "POST", { id, title, source_text })),
  update: async (
    id: string,
    version: number,
    changes: { title?: string; source_text?: string; archived?: boolean },
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
