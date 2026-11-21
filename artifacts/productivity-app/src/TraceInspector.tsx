import type { Trace, TraceEvent, Step } from "./trace";
function safe(v: string | null | undefined) {
  return v?.slice(0, 500) ?? "Not recorded";
}
export function TraceInspector({
  trace,
  event,
  step,
  stage,
  finalStep,
  demo,
}: {
  trace: Trace;
  event?: TraceEvent;
  step?: Step;
  stage?: string;
  finalStep: boolean;
  demo?: boolean;
}) {
  return (
    <aside className="execution-inspector" aria-label="Execution inspector">
      <div className="execution-label">RECORDED DETAIL</div>
      <h3>
        {event
          ? event.event_type
          : (step?.step_key ??
            (stage ? stage + " · not observed" : "Select a node or event"))}
      </h3>
      <p>Stored metadata · read only</p>
      <dl>
        {!demo && <>
          <dt>Source revision</dt>
          <dd>{trace.run.source_revision_id}</dd>
        </>}
        {event && (
          <>
            <dt>{demo ? "Event sequence" : "Event ID / sequence"}</dt>
            <dd>
              {!demo && event.id + " / "}{event.sequence}
            </dd>
            <dt>Observed time</dt>
            <dd>
              <time>{event.observed_at}</time>
            </dd>
            <dt>Recorded action</dt>
            <dd>{safe(event.payload.action)}</dd>
            <dt>Recovery outcome</dt>
            <dd>{safe(event.payload.outcome)}</dd>
            <dt>Recorded event attempt</dt>
            <dd>{event.payload.attempt ?? "Not recorded"}</dd>
            <dt>Event error</dt>
            <dd>{safe(event.payload.code)}</dd>
          </>
        )}
        {step && (
          <>
            <dt>Step / attempt</dt>
            <dd>
              {step.step_key} / {step.attempt}
            </dd>
            <dt>Actual start</dt>
            <dd>{step.started_at}</dd>
            {finalStep && <>
            <dt>Final stored step status</dt>
            <dd>{step.status}</dd>
            <dt>Actual completion</dt>
            <dd>{step.completed_at ?? "Not recorded"}</dd>
            <dt>Wall-clock duration</dt>
            <dd>
              {step.duration_ms === null
                ? "Not recorded"
                : `${step.duration_ms} ms`}
            </dd>
            <dt>Input summary</dt>
            <dd>{safe(step.input_summary)}</dd>
            <dt>Output summary</dt>
            <dd>{safe(step.output_summary)}</dd>
            <dt>Error / recovery</dt>
            <dd>
              {safe(step.error_code)} · {safe(step.recovery_action)}
            </dd>
            </>}
          </>
        )}
      </dl>
    </aside>
  );
}
