// Read-only trace contracts: deliberately discard blocks, source text and lease tokens.
import { api } from "./api";
export type Run = {
  id: string;
  status: string;
  provider: string;
  model: string;
  schema_version?: number;
  source_revision_id: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_code: string | null;
};
export type Step = {
  id: string;
  run_id: string;
  step_key: string;
  attempt: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  input_summary: string | null;
  output_summary: string | null;
  error_code: string | null;
  recovery_action: string | null;
};
export type TraceEvent = {
  id: string;
  run_id: string;
  step_id: string | null;
  sequence: number;
  event_type: string;
  observed_at: string;
  payload: { key?: string; code?: string; action?: string; attempt?: number };
};
export type Trace = {
  run: Run;
  steps: Step[];
  events: TraceEvent[];
  warnings: string[];
};
type Reader = (path: string) => Promise<unknown>;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function str(v: unknown) {
  if (typeof v !== "string") throw Error("Invalid trace text");
  return v;
}
function nullable(v: unknown) {
  return v === null ? null : str(v);
}
function time(v: unknown) {
  const s = str(v);
  if (!Number.isFinite(Date.parse(s))) throw Error("Invalid trace timestamp");
  return s;
}
function nt(v: unknown) {
  return v === null ? null : time(v);
}
function num(v: unknown, min = 0) {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < min)
    throw Error("Invalid trace number");
  return n;
}
export function run(v: unknown): Run {
  if (!object(v)) throw Error("Invalid run");
  return {
    id: str(v.id),
    status: str(v.status),
    provider: str(v.provider),
    model: str(v.model),
    ...(typeof v.schema_version === "number" &&
    Number.isSafeInteger(v.schema_version) &&
    v.schema_version > 0
      ? { schema_version: v.schema_version }
      : {}),
    source_revision_id: str(v.source_revision_id),
    created_at: time(v.created_at),
    started_at: nt(v.started_at),
    completed_at: nt(v.completed_at),
    error_code: nullable(v.error_code),
  };
}
function step(v: unknown): Step {
  if (!object(v)) throw Error("Invalid step");
  return {
    id: str(v.id),
    run_id: str(v.run_id),
    step_key: str(v.step_key),
    attempt: num(v.attempt, 1),
    status: str(v.status),
    started_at: time(v.started_at),
    completed_at: nt(v.completed_at),
    duration_ms: v.duration_ms === null ? null : num(v.duration_ms),
    input_summary: nullable(v.input_summary),
    output_summary: nullable(v.output_summary),
    error_code: nullable(v.error_code),
    recovery_action: nullable(v.recovery_action),
  };
}
function event(v: unknown): TraceEvent {
  if (!object(v) || !object(v.payload)) throw Error("Invalid event");
  const sequence = num(v.sequence, 1);
  if (!Number.isSafeInteger(sequence)) throw Error("Invalid event sequence");
  const payload: TraceEvent["payload"] = {};
  for (const k of ["key", "code", "action"] as const)
    if (typeof v.payload[k] === "string") payload[k] = v.payload[k];
  if (v.payload.attempt !== undefined) {
    const n = num(v.payload.attempt, 1);
    if (!Number.isSafeInteger(n)) throw Error("Invalid attempt");
    payload.attempt = n;
  }
  return {
    id: str(v.id),
    run_id: str(v.run_id),
    step_id: nullable(v.step_id),
    sequence,
    event_type: str(v.event_type),
    observed_at: time(v.observed_at),
    payload,
  };
}
export async function history(offset = 0, read: Reader = api) {
  const v = await read("/extractions?offset=" + offset);
  if (!object(v) || !Array.isArray(v.runs)) throw Error("Invalid history");
  const next = v.next_offset === null ? null : num(v.next_offset, offset + 1);
  return { runs: v.runs.map(run), next };
}
export async function loadTrace(
  id: string,
  read: Reader = api,
): Promise<Trace> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Error("Invalid run link");
  const root = await read("/extractions/" + id);
  if (!object(root)) throw Error("Invalid trace");
  const r = run(root.run);
  if (r.id !== id) throw Error("Run identifier mismatch");
  const steps: Step[] = [],
    events: TraceEvent[] = [];
  let offset = 0,
    since = 0;
  for (let pages = 0; ; pages++) {
    if (pages >= 2000)
      throw Error("Step history limit reached; trace not loaded completely");
    const v = await read(`/extractions/${id}/steps?offset=${offset}`);
    if (!object(v) || !Array.isArray(v.steps)) throw Error("Invalid step page");
    steps.push(...v.steps.map(step));
    if (v.next_offset === null) break;
    offset = num(v.next_offset, offset + 1);
  }
  for (let pages = 0; ; pages++) {
    if (pages >= 2000)
      throw Error("Event history limit reached; trace not loaded completely");
    const v = await read(`/extractions/${id}/events?since_sequence=${since}`);
    if (
      !object(v) ||
      !Array.isArray(v.events) ||
      typeof v.has_more !== "boolean"
    )
      throw Error("Invalid event page");
    const incoming = v.events.map(event);
    events.push(...incoming);
    const next = num(v.next_sequence, since);
    if (next !== Math.max(since, ...incoming.map((e) => e.sequence)))
      throw Error("Event cursor disagrees with page");
    if (!v.has_more) break;
    if (next <= since) throw Error("Event cursor did not advance");
    since = next;
  }
  const unique = new Map<string, TraceEvent>(),
    seq = new Map<number, string>();
  for (const e of events) {
    if (e.run_id !== id) throw Error("Foreign event in trace");
    const prior = unique.get(e.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(e))
      throw Error("Conflicting duplicate event");
    if (seq.has(e.sequence) && seq.get(e.sequence) !== e.id)
      throw Error("Conflicting sequence");
    unique.set(e.id, e);
    seq.set(e.sequence, e.id);
  }
  const sorted = [...unique.values()].sort((a, b) => a.sequence - b.sequence);
  const uniqueSteps = new Map<string, Step>();
  for (const s of steps) {
    if (s.run_id !== id) throw Error("Foreign step in trace");
    if (
      uniqueSteps.has(s.id) &&
      JSON.stringify(uniqueSteps.get(s.id)) !== JSON.stringify(s)
    )
      throw Error("Conflicting step page");
    uniqueSteps.set(s.id, s);
  }
  const warnings: string[] = [];
  if (
    ![
      "queued",
      "running",
      "succeeded",
      "failed",
      "interrupted",
      "cancelled",
    ].includes(r.status)
  )
    warnings.push("Unknown stored run status; no success is inferred.");
  const known = [
    "queued",
    "started",
    "step_started",
    "step_completed",
    "step_failed",
    "retry_scheduled",
    "interrupted",
    "recovered",
    "completed",
    "failed",
    "cancelled",
  ];
  if (sorted.some((e) => !known.includes(e.event_type)))
    warnings.push(
      "Unknown event types are shown in the log without inferred stage transitions.",
    );
  if (
    sorted.some((e, i) => e.sequence !== (i ? sorted[i - 1].sequence : 0) + 1)
  )
    warnings.push(
      "Event sequence gaps: missing observations are not reconstructed.",
    );
  if (
    sorted.some(
      (e, i) =>
        i && Date.parse(e.observed_at) < Date.parse(sorted[i - 1].observed_at),
    )
  )
    warnings.push(
      "Observed timestamps move backward; sequence order is authoritative.",
    );
  if (sorted.some((e) => e.step_id && !uniqueSteps.has(e.step_id)))
    warnings.push("Some events reference unavailable steps.");
  return { run: r, steps: [...uniqueSteps.values()], events: sorted, warnings };
}
