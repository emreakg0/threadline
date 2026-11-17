import type { Trace, TraceEvent, Step } from "./trace";
export const stages = [
  ["source", "Saved source"],
  ["validate_source", "Validate source"],
  ["extract", "Extract structure"],
  ["validate_output", "Verify evidence"],
  ["persist", "Save for review"],
] as const;
export function schedule(events: TraceEvent[]) {
  let t = 0;
  return events.map((e, i) => {
    if (i)
      t += Math.min(
        1800,
        Math.max(
          300,
          Date.parse(e.observed_at) - Date.parse(events[i - 1].observed_at),
        ),
      );
    return t;
  });
}
export function indexAt(times: number[], time: number) {
  let i = -1;
  while (i + 1 < times.length && times[i + 1] <= time) i++;
  return i;
}
export function stageState(trace: Trace, key: string, index: number) {
  const seen = trace.events.slice(0, index + 1);
  if (key === "source")
    return seen.some((e) => e.event_type === "queued")
      ? "recorded"
      : "not observed";
  let state = "not observed";
  const steps = new Map(trace.steps.map((s) => [s.id, s]));
  for (const e of seen) {
    const s = e.step_id ? steps.get(e.step_id) : undefined;
    const k = s?.step_key ?? e.payload.key;
    if (k === key) {
      if (e.event_type === "step_started") state = "started";
      if (e.event_type === "step_completed") state = "succeeded";
      if (e.event_type === "step_failed") state = "failed";
    }
    if (
      ["interrupted", "cancelled"].includes(e.event_type) &&
      state === "started"
    )
      state = e.event_type;
  }
  return state;
}
// Final step metadata is inspectable separately; never leak its terminal state into
// an earlier replay position or turn an unobserved stage into a success.
export function observedStep(
  trace: Trace,
  key: string,
  index: number,
): Step | undefined {
  const seen = trace.events.slice(0, index + 1);
  let result: Step | undefined;
  for (const e of seen) {
    const s = trace.steps.find((s) => s.id === e.step_id);
    if (s?.step_key === key) result = s;
  }
  return result;
}
export function rate(v: number) {
  return Math.min(2, Math.max(0.5, Number.isFinite(v) ? v : 1));
}
