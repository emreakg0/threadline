import { bounded, exact, ExtractionError, groundQuote } from "../extraction/validation";

export const actionThreadVersion = 3;
export const threadStatuses = ["planned", "simple", "needs_clarification"] as const;
export const nodeKinds = ["action", "decision"] as const;
export const edgeKinds = ["next", "outcome", "retry"] as const;

export const limits = {
  source: 20_000,
  output: 40_000,
  actions: 8,
  decisions: 3,
  edges: 24,
  retryEdges: 2,
  retryTraversals: 3,
  facts: 8,
  criteria: 4,
  assumptions: 4,
  questions: 4,
  id: 48,
  title: 120,
  text: 500,
  criterion: 240,
  outcome: 120,
  deadline: 160,
} as const;

export type ThreadNode = ReturnType<typeof parseNode>;
export type ThreadEdge = ReturnType<typeof parseEdge>;
export type ActionThread = ReturnType<typeof parseThread>;

function invalid(): never {
  throw new ExtractionError("INVALID_THREAD");
}

function text(value: unknown, max: number) {
  return bounded(value, max) ? value : invalid();
}

function id(value: unknown) {
  const result = text(value, limits.id);
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(result) ? result : invalid();
}

function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  const found = choices.find((option) => option === value);
  return found ?? invalid();
}

function list<T>(value: unknown, max: number, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > max) invalid();
  return value.map(parse);
}

export function validateSource(source: string) {
  if (!bounded(source, limits.source)) throw new ExtractionError("INVALID_THREAD_SOURCE");
}

function parseNode(value: unknown) {
  exact(value, ["id", "kind", "title", "description", "completion_criterion"]);
  return {
    id: id(value.id),
    kind: choice(value.kind, nodeKinds),
    title: text(value.title, limits.title),
    description: text(value.description, limits.text),
    completion_criterion: text(value.completion_criterion, limits.criterion),
    provenance: "ai_strategy" as const,
  };
}

function parseEdge(value: unknown) {
  exact(value, ["from", "to", "kind", "outcome", "max_traversals"]);
  const endpoints = { from: id(value.from), to: id(value.to) };
  const kind = choice(value.kind, edgeKinds);
  const max = value.max_traversals;
  if (kind === "retry") {
    if (
      typeof max !== "number" || !Number.isInteger(max) ||
      max < 1 || max > limits.retryTraversals || value.outcome !== null
    )
      invalid();
    return { ...endpoints, kind, outcome: null, max_traversals: max };
  }
  if (max !== null || (kind === "next" && value.outcome !== null)) invalid();
  return {
    ...endpoints,
    kind,
    outcome: kind === "outcome" ? text(value.outcome, limits.outcome) : null,
    max_traversals: null,
  } as const;
}

function parseDeadline(value: unknown, source: string) {
  if (value === null) return null;
  exact(value, ["phrase", "quote"]);
  const phrase = text(value.phrase, limits.deadline);
  const evidence = groundQuote(value.quote, source);
  if (!evidence.quote.includes(phrase))
    throw new ExtractionError("UNSUPPORTED_DEADLINE");
  return { phrase, evidence, provenance: "source" as const };
}

// The wire schema contains only exact excerpts for source claims. Provenance
// and code-point offsets are added locally, never supplied by the model.
export function parseThread(raw: string, source: string) {
  validateSource(source);
  if (typeof raw !== "string" || raw.length > limits.output) invalid();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ExtractionError("INVALID_JSON");
  }

  exact(value, [
    "schema_version", "status", "goal", "success_criteria", "entry_node_id",
    "nodes", "edges", "source_facts", "deadline", "assumptions", "missing_information",
  ]);
  if (value.schema_version !== actionThreadVersion) invalid();
  const sourceFacts = list(value.source_facts, limits.facts, (quote) => ({
    ...groundQuote(quote, source),
    provenance: "source" as const,
  }));
  if (new Set(sourceFacts.map(({ quote }) => quote)).size !== sourceFacts.length) invalid();

  return {
    schema_version: actionThreadVersion,
    status: choice(value.status, threadStatuses),
    goal: value.goal === null ? null : { text: text(value.goal, limits.criterion), provenance: "ai_strategy" as const },
    success_criteria: list(value.success_criteria, limits.criteria, (item) => text(item, limits.criterion)),
    entry_node_id: value.entry_node_id === null ? null : id(value.entry_node_id),
    nodes: list(value.nodes, limits.actions + limits.decisions, parseNode),
    edges: list(value.edges, limits.edges, parseEdge),
    source_facts: sourceFacts,
    deadline: parseDeadline(value.deadline, source),
    assumptions: list(value.assumptions, limits.assumptions, (item) => text(item, limits.criterion)),
    missing_information: list(value.missing_information, limits.questions, (item) => text(item, limits.criterion)),
  } as const;
}
