import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { WorkspaceIcon } from "./WorkspaceIcon";

export const processingRoute = "#capture/processing/";

const messages: Record<string, string> = {
  BETA_UNAVAILABLE:
    "Personal beta access is unavailable. You can plan manually.",
  BETA_LIMIT:
    "Your approved beta request allowance has been used. You can still plan manually.",
  CONSENT_REQUIRED:
    "Confirm that you want to send this saved revision to Google.",
  LIVE_DISABLED: "Live Gemini is disabled.",
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
  PROVIDER_TIMEOUT: "The request timed out. Google may have received it.",
  PROVIDER_NETWORK: "The connection to Google ended before a response arrived.",
  PROVIDER_TRANSIENT: "Google returned a service error.",
  INVALID_JSON: "The response was not valid JSON.",
  INVALID_OUTPUT: "The response did not match the planning format.",
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
}: {
  sourceId: string;
  documentId: string;
  disabled: boolean;
  visible: boolean;
}) {
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
    const filter = "?source_revision_id=" + sourceId;
    void api("/extractions/availability" + filter)
      .then((result) => {
        if (active.current) setAvailability(result);
      })
      .catch(() => {
        if (active.current) {
          setAvailability({ enabled: false });
          setMessage(
            "AI availability could not be checked. You can plan manually.",
          );
        }
      });
    void api("/extractions" + filter)
      .then(({ runs }) => {
        const plan = runs.find(
          (run: { schema_version?: number }) => run.schema_version === 2,
        );
        if (active.current && plan) setRunId((current) => current ?? plan.id);
      })
      .catch(() => {});
    return () => {
      active.current = false;
    };
  }, [sourceId, visible]);

  async function develop() {
    if (!consented || disabled || !availability?.enabled || pending) return;
    const originRoute = location.hash;
    setPending(true);
    setMessage("");
    try {
      const run = await api("/extractions", "POST", {
        schema_version: 2,
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
          error instanceof Error
            ? (error.message.split(": ").at(-1) ?? "")
            : "";
        setMessage(
          planningMessage(code) ??
            "The request could not be confirmed. Trying again uses the same request key.",
        );
      }
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="tl-next-action" aria-label="Action planning">
      <h2>Turn your thoughts into actions</h2>
      <p id="tl-plan-availability" className="tl-live-state">
        {availability?.enabled
          ? "AI sends this saved revision to Google. Google may use Free Tier inputs and outputs to improve its products. Avoid sensitive notes."
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
      {availability?.enabled && !runId && (
        <label className="tl-plan-consent">
          <input
            aria-describedby="tl-plan-availability"
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
          />
          I agree to send this saved revision to Google for action planning.
        </label>
      )}
      {runId ? (
        <a className="tl-review-link" href={processingRoute + runId}>
          <WorkspaceIcon name="trace" /> <span>Open processing status</span>{" "}
          <WorkspaceIcon name="arrow" />
        </a>
      ) : (
        <button
          className="tl-primary"
          disabled={disabled || pending || !consented || !availability?.enabled}
          aria-describedby="tl-plan-availability"
          onClick={() => void develop()}
        >
          {pending ? "Saving request…" : "Develop action plan"}
        </button>
      )}
      {message && <p role="alert">{message}</p>}
      <a className="tl-review-link" href={"#capture/plan/" + documentId}>
        <WorkspaceIcon name="review" /> <span>Open action plan</span>{" "}
        <WorkspaceIcon name="arrow" />
      </a>
      <a className="tl-run-link" href={"#capture/review/" + documentId}>
        <WorkspaceIcon name="review" /> Review knowledge blocks
      </a>
    </section>
  );
}
