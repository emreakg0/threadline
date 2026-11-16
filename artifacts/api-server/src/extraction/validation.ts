export const kinds = [
  "summary",
  "action",
  "fact",
  "decision",
  "question",
  "deadline",
  "note",
] as const;
export type Block = {
  kind: (typeof kinds)[number];
  content: string;
  uncertainty_reason: string | null;
  evidence: { quote: string; start: number; end: number }[];
};
const string = { type: "string" };
export const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "blocks"],
  properties: {
    schema_version: { type: "integer", enum: [1] },
    blocks: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "content", "uncertainty_reason", "evidence"],
        properties: {
          kind: { type: "string", enum: kinds },
          content: { ...string, maxLength: 1200 },
          uncertainty_reason: { type: ["string", "null"], maxLength: 1200 },
          evidence: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["quote", "start", "end"],
              properties: {
                quote: string,
                start: { type: "integer" },
                end: { type: "integer" },
              },
            },
          },
        },
      },
    },
  },
};
export class ExtractionError extends Error {
  constructor(
    public code: string,
    public status = 422,
  ) {
    super(code);
  }
}
function exact(
  v: unknown,
  keys: string[],
): asserts v is Record<string, unknown> {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).sort().join() !== [...keys].sort().join()
  )
    throw new ExtractionError("INVALID_OUTPUT");
}
const bounded = (v: unknown): v is string =>
  typeof v === "string" &&
  v.trim().length > 0 &&
  v.length <= 1200 &&
  !v.includes("\0") &&
  !/[\uD800-\uDFFF]/u.test(v);
export function validate(raw: string, source: string): Block[] {
  if (raw.length > 100000) throw new ExtractionError("INVALID_OUTPUT");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ExtractionError("INVALID_JSON");
  }
  exact(value, ["schema_version", "blocks"]);
  if (
    value.schema_version !== 1 ||
    !Array.isArray(value.blocks) ||
    value.blocks.length > 24
  )
    throw new ExtractionError("INVALID_OUTPUT");
  const points = Array.from(source);
  return value.blocks.map((v: unknown) => {
    exact(v, ["kind", "content", "uncertainty_reason", "evidence"]);
    if (
      !kinds.includes(v.kind as Block["kind"]) ||
      !bounded(v.content) ||
      !(v.uncertainty_reason === null || bounded(v.uncertainty_reason)) ||
      !Array.isArray(v.evidence) ||
      v.evidence.length < 1 ||
      v.evidence.length > 8
    )
      throw new ExtractionError("INVALID_OUTPUT");
    const evidence = v.evidence.map((e: unknown) => {
      exact(e, ["quote", "start", "end"]);
      if (
        !bounded(e.quote) ||
        !Number.isSafeInteger(e.start) ||
        !Number.isSafeInteger(e.end) ||
        Number(e.start) < 0 ||
        Number(e.end) <= Number(e.start) ||
        Number(e.end) > points.length ||
        points.slice(Number(e.start), Number(e.end)).join("") !== e.quote
      )
        throw new ExtractionError("EVIDENCE_MISMATCH");
      return { quote: e.quote, start: Number(e.start), end: Number(e.end) };
    });
    // Conservative MVP: content must itself be an exact supported quote. No semantic
    // verifier can prove a paraphrase factual. Summaries are extractive in Phase 2B.
    if (!evidence.some((e) => e.quote === v.content))
      throw new ExtractionError("UNSUPPORTED_CONTENT");
    if (v.kind === "deadline" && !v.uncertainty_reason)
      throw new ExtractionError("DEADLINE_REQUIRES_REVIEW");
    return {
      kind: v.kind as Block["kind"],
      content: v.content,
      uncertainty_reason: v.uncertainty_reason as string | null,
      evidence,
    };
  });
}
