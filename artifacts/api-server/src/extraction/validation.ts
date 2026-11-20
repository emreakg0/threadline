export const kinds = [
  "summary",
  "action",
  "fact",
  "decision",
  "question",
  "deadline",
  "note",
] as const;
export const formats = {
  1: { pipeline: "2c-1", prompt: "extractive-1" },
  2: { pipeline: "plan-2", prompt: "grounded-plan-4" },
} as const;
export type SchemaVersion = keyof typeof formats;
export type Proposal = {
  description: string | null;
  category: string | null;
  suggested_priority: "low" | "medium" | "high" | null;
  deadline_phrase: string | null;
};
export type Block = {
  kind: (typeof kinds)[number];
  content: string;
  uncertainty_reason: string | null;
  proposal?: Proposal;
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
// Array and string limits are enforced by validate() after generation. Nested
// array bounds multiply the size of Gemini's constrained-decoding grammar.
const nullableString = { type: ["string", "null"] };
export const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "blocks"],
  properties: {
    schema_version: { type: "integer", enum: [2] },
    blocks: {
      type: "array",
      description: "At most 24 blocks.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "content",
          "uncertainty_reason",
          "evidence",
          "proposal",
        ],
        properties: {
          kind: { type: "string", enum: ["summary", "action"] },
          content: string,
          uncertainty_reason: nullableString,
          evidence: {
            type: "array",
            description: "One to eight exact excerpts.",
            items: string,
          },
          proposal: {
            type: ["object", "null"],
            additionalProperties: false,
            required: [
              "description",
              "category",
              "suggested_priority",
              "deadline_phrase",
            ],
            properties: {
              description: nullableString,
              category: nullableString,
              suggested_priority: {
                ...nullableString,
                description: "low, medium, high, or null",
              },
              deadline_phrase: nullableString,
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
export function exact(
  v: unknown,
  keys: string[],
): asserts v is Record<string, unknown> {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(v, key))
  )
    throw new ExtractionError("INVALID_OUTPUT");
}
export const bounded = (v: unknown, limit = 1200): v is string =>
  typeof v === "string" &&
  v.trim().length > 0 &&
  v.length <= limit &&
  !v.includes("\0") &&
  !/[\uD800-\uDFFF]/u.test(v);
export function groundQuote(
  quote: unknown,
  source: string,
): Block["evidence"][number] {
  if (typeof quote === "string" && !quote.trim())
    throw new ExtractionError("EMPTY_EVIDENCE");
  if (!bounded(quote)) throw new ExtractionError("INVALID_EVIDENCE");
  const index = source.indexOf(quote);
  if (index < 0) throw new ExtractionError("QUOTE_NOT_FOUND");
  // Advance one code unit so overlapping occurrences also count.
  if (source.indexOf(quote, index + 1) !== -1)
    throw new ExtractionError("AMBIGUOUS_QUOTE");
  const start = Array.from(source.slice(0, index)).length;
  return { quote, start, end: start + Array.from(quote).length };
}
function proposal(value: unknown, evidence: Block["evidence"]): Proposal {
  exact(value, [
    "description",
    "category",
    "suggested_priority",
    "deadline_phrase",
  ]);
  const { description, category, suggested_priority, deadline_phrase } = value;
  if (
    !(description === null || bounded(description)) ||
    !(category === null || bounded(category, 100)) ||
    !(
      suggested_priority === null ||
      suggested_priority === "low" ||
      suggested_priority === "medium" ||
      suggested_priority === "high"
    ) ||
    !(deadline_phrase === null || bounded(deadline_phrase, 160))
  )
    throw new ExtractionError("INVALID_PROPOSAL");
  if (
    deadline_phrase !== null &&
    !evidence.some((entry) => entry.quote.includes(deadline_phrase))
  )
    throw new ExtractionError("UNSUPPORTED_DEADLINE");
  return { description, category, suggested_priority, deadline_phrase };
}
export function validate(
  raw: string,
  source: string,
  version: SchemaVersion = 1,
): Block[] {
  if (raw.length > 100000) throw new ExtractionError("INVALID_OUTPUT");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ExtractionError("INVALID_JSON");
  }
  exact(value, ["schema_version", "blocks"]);
  if (
    value.schema_version !== version ||
    !Array.isArray(value.blocks) ||
    value.blocks.length > 24
  )
    throw new ExtractionError("INVALID_OUTPUT");
  const points = version === 1 ? Array.from(source) : [];
  let summaries = 0;
  return value.blocks.map((v: unknown) => {
    const keys = ["kind", "content", "uncertainty_reason", "evidence"];
    exact(v, version === 1 ? keys : [...keys, "proposal"]);
    if (
      !kinds.includes(v.kind as Block["kind"]) ||
      !bounded(v.content) ||
      !(v.uncertainty_reason === null || bounded(v.uncertainty_reason))
    )
      throw new ExtractionError("INVALID_OUTPUT");
    if (!Array.isArray(v.evidence) || v.evidence.length > 8)
      throw new ExtractionError(
        version === 1 ? "INVALID_OUTPUT" : "INVALID_EVIDENCE",
      );
    if (!v.evidence.length)
      throw new ExtractionError(
        version === 1 ? "INVALID_OUTPUT" : "EMPTY_EVIDENCE",
      );
    const evidence = v.evidence.map((e: unknown) => {
      if (version === 2) return groundQuote(e, source);
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
    if (version === 1 && !evidence.some((e) => e.quote === v.content))
      throw new ExtractionError("UNSUPPORTED_CONTENT");
    if (v.kind === "deadline" && !v.uncertainty_reason)
      throw new ExtractionError("DEADLINE_REQUIRES_REVIEW");
    let action: Proposal | undefined;
    if (version === 2) {
      if (v.kind === "action" && v.content.length <= 300)
        action = proposal(v.proposal, evidence);
      else if (v.kind !== "summary" || v.proposal !== null || ++summaries > 1)
        throw new ExtractionError("INVALID_PROPOSAL");
    }
    return {
      ...(action && { proposal: action }),
      kind: v.kind as Block["kind"],
      content: v.content,
      uncertainty_reason: v.uncertainty_reason as string | null,
      evidence,
    };
  });
}
