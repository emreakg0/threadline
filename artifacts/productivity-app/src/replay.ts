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


// Read the active failure branch at the cursor. A later attempt starts its own branch.
export function recoveryAt(trace: Trace, index: number) {
  let failure: TraceEvent | undefined;
  let terminal: TraceEvent | undefined;
  let recovery: TraceEvent | undefined;
  let selected: TraceEvent | undefined;
  for (const event of trace.events.slice(0, index + 1)) {
    switch (event.event_type) {
      case "started": failure = terminal = recovery = selected = undefined; break;
      case "step_failed": failure = event; break;
      case "failed":
      case "interrupted":
      case "cancelled": terminal = event; break;
      case "retry_scheduled":
      case "recovered": recovery = event; break;
      case "alternative_selected": selected = event; break;
    }
  }
  const event = failure ?? terminal;
  if (!event) return;
  // Older interruption and cancellation events may omit the active step ID.
  const openStage = ["interrupted", "cancelled"].includes(event.event_type)
    ? stages.find(([key]) => stageState(trace, key, index) === event.event_type)?.[0]
    : undefined;
  const step = trace.steps.find((step) => step.id === event.step_id);
  return { event, key: step?.step_key ?? event.payload.key ?? openStage, terminal, recovery, selected };
}

export function failureReason(code?: string, stage?: string) {
  switch (code) {
    case "PROVIDER_TRANSIENT": return "The external service was temporarily unavailable.";
    case "PROVIDER_TIMEOUT": return "The provider did not respond before the deadline. Its outcome is uncertain.";
    case "PROVIDER_NETWORK": return "The provider connection failed. Its outcome is uncertain.";
    case "LEASE_EXPIRED": return "The worker stopped reporting progress and its lease expired.";
    case "INVALID_JSON": return "The response could not be read as valid JSON.";
    case "INVALID_THREAD_SOURCE":
    case "SOURCE_TOO_LARGE": return "The saved input exceeds the planning format’s limits or contains unsupported text.";
    case "DOCUMENT_ARCHIVED": return "The brain dump was archived before this operation could finish.";
    case "QUOTA_EXHAUSTED":
    case "DAILY_QUOTA": return "The daily provider limit was reached. The daily window resets at midnight Pacific time.";
    case "PROVIDER_AUTH": return "The provider declined access to the model.";
    case "MODEL_UNAVAILABLE": return "The configured model was unavailable.";
    case "PROVIDER_REJECTED": return "The provider rejected the request.";
    case "PROVIDER_SAFETY_OR_TRUNCATION": return "The provider returned a blocked or incomplete response.";
    case "PROVIDER_OUTPUT_LIMIT": return "The provider reached the output limit before finishing.";
    case "STORAGE_OR_PROCESSING_FAILURE":
      return stage === "persist" ? "The application could not confirm that the output was saved." : "The application could not finish processing.";
    default:
      return stage === "validate_output" ? "The output failed Threadline’s structure or evidence checks."
        : "Threadline could not continue this run.";
  }
}
