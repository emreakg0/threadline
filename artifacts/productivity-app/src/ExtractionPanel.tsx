import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { WorkspaceIcon } from "./WorkspaceIcon";

export const processingRoute = "#capture/processing/";

const messages: Record<string, string> = {
  BETA_UNAVAILABLE:
    "Personal beta access is unavailable. You can plan manually.",
  BETA_LIMIT:
    "Your approved beta request allowance has been used. You can still plan manually.",
  CONSENT_REQUIRED:
    "Confirm that you want to send this saved revision to Google.",
  LIVE_DISABLED: "AI Action Plan generation is disabled.",
  THREAD_LIVE_DISABLED: "Action Thread generation is disabled.",
  THREAD_EVALUATION_LIMIT:
    "All three Action Thread evaluation requests are used or queued.",
  THREAD_REQUEST_EXISTS:
    "This saved revision already has an Action Thread request. Reopen the brain dump to see its status.",
  FREE_TIER_UNVERIFIED: "The Free Tier authorization could not be verified.",
  SOURCE_NOT_AUTHORIZED: "This revision is outside the authorized test.",
  DAILY_QUOTA:
    "The daily planning limit has been reached. Limits reset at midnight Pacific time.",
  QUOTA_EXHAUSTED:
    "Google declined the request due to quota. AI requests are paused until at least midnight Pacific time.",
  QUEUE_FULL: "The planning queue is full. Try again after it has cleared.",
  MODEL_UNAVAILABLE: "Google did not make this model available to Threadline.",
  PROVIDER_AUTH: "Google declined access to the model.",
  PROVIDER_REJECTED: "Google rejected the structured planning request.",
  PROVIDER_SAFETY_OR_TRUNCATION:
    "Google returned a blocked or incomplete response.",
  PROVIDER_OUTPUT_LIMIT:
    "Google hit the Action Thread output limit before finishing.",
  PROVIDER_TIMEOUT: "The request timed out. Google may have received it.",
  PROVIDER_NETWORK: "The connection to Google ended before a response arrived.",
  PROVIDER_TRANSIENT: "Google returned a service error.",
  INVALID_JSON: "The response was not valid JSON.",
  INVALID_OUTPUT: "The response did not match the planning format.",
  INVALID_THREAD_SOURCE:
    "Save a brain dump with text within the planning input limit.",
  INVALID_THREAD: "The response did not match the Action Thread format.",
  INVALID_THREAD_STATUS:
    "The response did not contain the expected steps or clarification.",
  INVALID_THREAD_ENTRY: "The response did not have a valid starting step.",
  DUPLICATE_THREAD_NODE: "The response contained duplicate steps.",
  DANGLING_THREAD_EDGE: "A connection pointed to a missing step.",
  DUPLICATE_OR_SELF_THREAD_EDGE:
    "The response contained an invalid step connection.",
  INVALID_THREAD_BRANCH: "A decision or step had invalid exits.",
  UNBOUNDED_THREAD_CYCLE: "The response contained an unbounded cycle.",
  UNREACHABLE_THREAD_NODE:
    "A step could not be reached from the starting step.",
  INVALID_THREAD_RETRY: "The response contained an invalid retry path.",
  INVALID_PROPOSAL: "The response contained an invalid proposal.",
  QUOTE_NOT_FOUND: "A quote did not match the saved brain dump.",
  AMBIGUOUS_QUOTE: "A quote appears more than once in the saved brain dump.",
  EMPTY_EVIDENCE: "A proposal is missing source evidence.",
  INVALID_EVIDENCE: "The response contained invalid source evidence.",
  UNSUPPORTED_DEADLINE:
    "A proposed deadline was missing from the cited evidence.",
  EVIDENCE_MISMATCH: "A quote did not match the saved brain dump.",
  STORAGE_OR_PROCESSING_FAILURE: "Threadline could not save the result.",
  OUTCOME_UNCERTAIN: "The worker stopped before it could record the outcome.",
  DOCUMENT_ARCHIVED: "This brain dump was archived.",
  SOURCE_TOO_LARGE: "This brain dump exceeds the planning input limit.",
  MODEL_CONFIG_CHANGED: "This run used an older model or format.",
};
export function planningMessage(code: string) {
  return messages[code];
}

export function ExtractionPanel({
  sourceId,
  documentId,
  disabled,
  visible,
  version = 2,
}: {
  sourceId: string;
  documentId: string;
  disabled: boolean;
  visible: boolean;
  version?: 2 | 3;
}) {
  const thread = version === 3;
  const path = thread ? "/action-threads" : "/extractions";
  const availabilityId = thread
    ? "tl-thread-availability"
    : "tl-plan-availability";
  const [runId, setRunId] = useState<string>();
  const [availability, setAvailability] = useState<{
    enabled: boolean;
    reason?: string;
  }>();
  const [consented, setConsented] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const key = useRef<string>(undefined);
  const active = useRef(false);
  useEffect(() => {
    if (!visible) return;
    active.current = true;
    let current = true;
    setAvailability(undefined);
    const filter = "?source_revision_id=" + sourceId;
    void api(path + "/availability" + filter)
      .then((result) => {
        if (current) setAvailability(result);
      })
      .catch(() => {
        if (current) {
          setAvailability({ enabled: false });
          setMessage(
            "AI availability could not be checked. You can plan manually.",
          );
        }
      });
    void api("/extractions" + filter)
      .then(({ runs }) => {
        const plan = runs.find(
          (run: { schema_version?: number }) => run.schema_version === version,
        );
        if (current && plan) setRunId((previous) => previous ?? plan.id);
      })
      .catch(() => {});
    return () => {
      current = false;
      active.current = false;
    };
  }, [path, sourceId, version, visible]);

  async function develop() {
    if (!consented || disabled || !availability?.enabled || pending) return;
    const originRoute = location.hash;
    setPending(true);
    setMessage("");
    try {
      const run = await api(path, "POST", {
        ...(thread ? {} : { schema_version: version }),
        consent: true,
        source_revision_id: sourceId,
        idempotency_key: (key.current ??= crypto.randomUUID()),
      });
      if (active.current) {
        setRunId(run.id);
        // A slow acknowledgement should never pull the user out of another view.
        if (location.hash === originRoute)
          location.hash = processingRoute + run.id;
      }
    } catch (error) {
      if (active.current) {
        const code =
          error instanceof ApiError
            ? (error.message.split(": ").at(-1) ?? "")
            : "";
        if (thread && code === "THREAD_REQUEST_EXISTS") {
          const history = await api(
            "/extractions?source_revision_id=" + sourceId,
          ).catch(() => null);
          const existing = history?.runs.find(
            (run: { schema_version?: number }) =>
              run.schema_version === version,
          );
          if (!active.current) return;
          if (existing) {
            setRunId(existing.id);
            return;
          }
        }
        if (
          thread &&
          [
            "THREAD_LIVE_DISABLED",
            "FREE_TIER_UNVERIFIED",
            "BETA_UNAVAILABLE",
            "BETA_LIMIT",
            "THREAD_EVALUATION_LIMIT",
            "SOURCE_NOT_AUTHORIZED",
          ].includes(code)
        ) {
          setAvailability({ enabled: false, reason: code });
          return;
        }
        setMessage(
          planningMessage(code) ??
            "The request could not be confirmed. Trying again uses the same request key.",
        );
      }
    } finally {
      setPending(false);
    }
  }
  if (
    thread &&
    !runId &&
    !message &&
    (!availability ||
      ["THREAD_LIVE_DISABLED", "BETA_UNAVAILABLE", "LIVE_DISABLED"].includes(
        availability.reason ?? "",
      ))
  )
    return null;
  return (
    <section
      className="tl-next-action"
      aria-label={thread ? "Action Thread generation" : "Action planning"}
    >
      <h2>{thread ? "Action Thread" : "Turn your thoughts into actions"}</h2>
      {(!thread || !runId) && (
        <p id={availabilityId} className="tl-live-state">
          {availability?.enabled
            ? "AI sends this saved revision to Google. Google may use Free Tier inputs and outputs to improve its products. " +
              (thread
                ? "Use synthetic or approved non-sensitive notes only."
                : "Avoid sensitive notes.")
            : availability
              ? (planningMessage(availability.reason ?? "") ??
                "AI planning is unavailable.")
              : "Checking AI availability…"}
          {availability?.enabled && (
            <>
              {" "}
              <a
                href="https://ai.google.dev/gemini-api/terms"
                target="_blank"
                rel="noreferrer"
              >
                Free Tier terms
              </a>
            </>
          )}
        </p>
      )}
      {availability?.enabled && !runId && (
        <label className="tl-plan-consent">
          <input
            aria-describedby={availabilityId}
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
          />
          {thread
            ? "I agree to send this saved revision to Google to generate an Action Thread."
            : "I agree to send this saved revision to Google for action planning."}
        </label>
      )}
      {runId ? (
        <a className="tl-review-link" href={processingRoute + runId}>
          <WorkspaceIcon name="trace" />{" "}
          <span>
            {thread
              ? "Open Action Thread processing status"
              : "Open processing status"}
          </span>{" "}
          <WorkspaceIcon name="arrow" />
        </a>
      ) : (
        (!thread || availability?.enabled) && (
          <button
            className="tl-primary"
            disabled={
              disabled || pending || !consented || !availability?.enabled
            }
            aria-describedby={availabilityId}
            onClick={() => void develop()}
          >
            {pending
              ? "Saving request…"
              : thread
                ? "Generate Action Thread"
                : "Develop action plan"}
          </button>
        )
      )}
      {message && <p role="alert">{message}</p>}
      {!thread && (
        <>
          <a className="tl-review-link" href={"#capture/plan/" + documentId}>
            <WorkspaceIcon name="review" /> <span>Open action plan</span>{" "}
            <WorkspaceIcon name="arrow" />
          </a>
          <a className="tl-run-link" href={"#capture/review/" + documentId}>
            <WorkspaceIcon name="review" /> Review knowledge blocks
          </a>
        </>
      )}
    </section>
  );
}
