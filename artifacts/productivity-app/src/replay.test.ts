import assert from "node:assert/strict";
import { loadTrace, type TraceEvent } from "./trace";
import { schedule, indexAt, stageState, rate } from "./replay";
const id = "11111111-1111-1111-1111-111111111111",
  t = "2026-11-17T00:00:00.000Z";
const run = {
  id,
  status: "interrupted",
  provider: "mock",
  model: "test",
  source_revision_id: id,
  created_at: t,
  started_at: t,
  completed_at: t,
  error_code: "OUTCOME_UNCERTAIN",
};
const step = {
  id: "step",
  run_id: id,
  step_key: "extract",
  attempt: 1,
  status: "interrupted",
  started_at: t,
  completed_at: t,
  duration_ms: 7,
  input_summary: "Pinned source",
  output_summary: null,
  error_code: "LEASE_EXPIRED",
  recovery_action: "No resend",
};
const event = (
  sequence: number,
  event_type: string,
  step_id: string | null = null,
  observed_at = t,
): TraceEvent => ({
  id: "event-" + sequence,
  run_id: id,
  step_id,
  sequence,
  event_type,
  observed_at,
  payload: {},
});
const events = [
  event(1, "queued"),
  event(2, "step_started", "step"),
  event(3, "interrupted"),
  event(4, "recovered"),
];
let calls: string[] = [];
const read = async (path: string): Promise<unknown> => {
  calls.push(path);
  if (path.endsWith(id)) return { run };
  if (path.includes("/steps"))
    return path.endsWith("=0")
      ? { steps: [step], next_offset: 1 }
      : { steps: [step], next_offset: null };
  return path.endsWith("=0")
    ? { events: [events[1], events[0]], has_more: true, next_sequence: 2 }
    : {
        events: [events[1], events[2], events[3]],
        has_more: false,
        next_sequence: 4,
      };
};
const trace = await loadTrace(id, read);
assert.deepEqual(trace.events, events);
assert.equal(trace.steps.length, 1);
assert.equal(calls.length, 5);
const serialized = JSON.stringify(trace);
calls = [];
assert.equal(JSON.stringify(await loadTrace(id, read)), serialized);
assert.ok(calls.every((c) => c.startsWith("/extractions")));
assert.equal(stageState(trace, "extract", 0), "not observed");
assert.equal(stageState(trace, "extract", 1), "started");
assert.equal(stageState(trace, "extract", 2), "interrupted");
assert.equal(stageState(trace, "extract", 3), "interrupted");
assert.equal(stageState(trace, "persist", 3), "not observed");
const times = schedule(events);
assert.deepEqual(times, [0, 300, 600, 900]);
assert.equal(indexAt(times, 599), 1);
assert.equal(indexAt(times, 600), 2);
assert.equal(indexAt(times, 0), 0);
assert.equal(rate(100), 2);
assert.equal(rate(-1), 0.5);
assert.deepEqual(
  schedule([events[0], event(2, "started", null, "2026-11-17T01:00:00Z")]),
  [0, 1800],
);
const retryTrace = {
  ...trace,
  steps: [step, { ...step, id: "second", attempt: 2, status: "succeeded" }],
  events: [
    ...events.slice(0, 2),
    event(3, "step_failed", "step"),
    event(4, "retry_scheduled"),
    event(5, "step_started", "second"),
    event(6, "step_completed", "second"),
  ],
};
assert.equal(stageState(retryTrace, "extract", 2), "failed");
assert.equal(stageState(retryTrace, "extract", 4), "started");
assert.equal(stageState(retryTrace, "extract", 5), "succeeded");
assert.equal(
  stageState(
    { ...trace, events: [events[0], events[1], event(3, "cancelled")] },
    "extract",
    2,
  ),
  "cancelled",
);
const empty = await loadTrace(id, async (p) =>
  p.endsWith(id)
    ? { run }
    : p.includes("steps")
      ? { steps: [], next_offset: null }
      : { events: [], has_more: false, next_sequence: 0 },
);
assert.equal(empty.events.length, 0);
await assert.rejects(
  loadTrace(id, async (p) =>
    p.includes("/events")
      ? { events: [], has_more: true, next_sequence: 0 }
      : read(p),
  ),
);
await assert.rejects(
  loadTrace(id, async (p) =>
    p.includes("/events")
      ? {
          events: [events[0], { ...events[0], id: "conflict" }],
          has_more: false,
          next_sequence: 1,
        }
      : read(p),
  ),
);
const gap = await loadTrace(id, async (p) =>
  p.includes("/events")
    ? { events: [events[0], events[3]], has_more: false, next_sequence: 4 }
    : read(p),
);
assert.ok(gap.warnings.some((w) => w.includes("gaps")));
await assert.rejects(
  loadTrace(id, async (p) =>
    p.includes("/steps")
      ? { steps: [{ ...step, run_id: "foreign" }], next_offset: null }
      : read(p),
  ),
);
console.log(
  "PASS: deterministic reload identity, paginated/deduplicated traces, sequence/timing schedule, seek/rate, retry/interruption/recovery/cancellation, missing events and invalid cursors",
);
