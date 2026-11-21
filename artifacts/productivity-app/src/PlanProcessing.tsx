import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { threadsRoute } from "./action-threads/data";
import { planningMessage } from "./ExtractionPanel";
import { WorkspaceIcon } from "./WorkspaceIcon";
import "./plan-processing.css";

type Progress = {
  status: string;
  stage: string | null;
  error_code: string | null;
  provider: string;
  document_id: string;
  schema_version: number;
};

const stages = [
  {
    key: "queued",
    title: "Waiting in queue",
    detail:
      "Your saved brain dump is waiting for processing capacity. You can leave and reopen this run.",
  },
  {
    key: "extract",
    title: "Analyzing your thoughts",
    detail:
      "The extractor is processing the saved revision to draft suggested actions.",
  },
  {
    key: "validate_output",
    title: "Validating the result",
    detail:
      "Threadline is checking the response format and matching quotes and offsets to your source.",
  },
  {
    key: "persist",
    title: "Building your action plan",
    detail: "Threadline is saving the validated draft and its source evidence.",
  },
  {
    key: "succeeded",
    title: "Ready for review",
    detail:
      "Your draft is saved. Review the suggestions and source evidence before creating any tasks.",
  },
] as const;

export function PlanProcessing({ id }: { id: string }) {
  const [progress, setProgress] = useState<Progress>();
  const [unavailable, setUnavailable] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const path = "/extractions/" + id;
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next: Progress = await api(path + "/progress");
        if (!current) return;
        setProgress(next);
        setUnavailable("");
        if (next.status === "queued" || next.status === "running")
          timer = setTimeout(() => void poll(), 1000);
      } catch (error) {
        if (!current) return;
        if (error instanceof ApiError && error.status === 404) {
          setProgress(undefined);
          setUnavailable("This processing run could not be found.");
        } else {
          setUnavailable(
            "Threadline could not check status. The run may still be active.",
          );
          timer = setTimeout(() => void poll(), 3000);
        }
      }
    }
    void poll();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [path, refresh]);

  async function cancel() {
    setCancelling(true);
    setCancelError("");
    try {
      await api(path + "/cancel", "POST", {});
      setRefresh((value) => value + 1);
    } catch {
      setCancelError(
        "Cancellation could not be confirmed. Check the status before leaving.",
      );
    } finally {
      setCancelling(false);
    }
  }

  const currentStage =
    !unavailable && progress
      ? stages.find(
          ({ key }) =>
            key ===
            (progress.status === "running" ? progress.stage : progress.status),
        )
      : undefined;
  const active =
    progress?.status === "running" || progress?.status === "queued";
  const thread = progress?.schema_version === 3;
  const reviewingThread = thread && progress.status === "succeeded";
  const stageTitle = (stage: (typeof stages)[number]) =>
    thread && stage.key === "persist"
      ? "Saving your Action Thread"
      : stage.title;
  const title = unavailable
    ? "Status unavailable"
    : currentStage
      ? stageTitle(currentStage)
      : active
        ? "Preparing the next step"
        : progress?.status === "cancelled"
          ? "Processing cancelled"
          : progress
            ? "Processing failed"
            : "Checking processing status";
  const detail =
    unavailable ||
    (reviewingThread
      ? "Your Action Thread is saved. Review its steps and source evidence before approving or rejecting it."
      : currentStage?.detail) ||
    (active
      ? "Threadline is moving between recorded stages."
      : progress?.status === "cancelled"
        ? "Cancelled results are discarded. You can continue with manual planning."
        : progress
          ? (planningMessage(progress.error_code ?? "") ??
              (thread
                ? "This run did not save an Action Thread."
                : "This run did not save an action plan.")) +
            " You can continue with manual planning."
          : "Reading the saved execution record.");
  return (
    <section className="tl-content tl-processing-view">
      <a
        className="tl-text-link"
        href={
          progress ? "#capture/document/" + progress.document_id : "#capture"
        }
      >
        ← Brain dump
      </a>
      <div
        className="tl-processing-card"
        data-motion={
          !unavailable &&
          progress?.status === "running" &&
          currentStage?.key === "extract"
        }
      >
        <div className="tl-processing-mark" aria-hidden="true">
          <WorkspaceIcon name="mark" />
        </div>
        <div role="status">
          <p className="tl-processing-label">
            {progress?.provider === "mock" && "Mock test · "}
            {thread ? "Action Thread" : "Action planning"}
          </p>
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
          <p>{detail}</p>
        </div>
        {currentStage && (
          <ol className="tl-processing-stages" aria-label="Planning workflow">
            {stages.map((stage) => (
              <li
                key={stage.key}
                aria-current={stage === currentStage ? "step" : undefined}
              >
                {stageTitle(stage)}
              </li>
            ))}
          </ol>
        )}
        <div className="tl-processing-links">
          {progress && (
            <a
              className="tl-review-link"
              href={
                reviewingThread
                  ? threadsRoute + "/" + id
                  : "#capture/plan/" + progress.document_id
              }
            >
              <WorkspaceIcon name="review" />
              {reviewingThread
                ? "Review Action Thread"
                : progress.status === "succeeded"
                  ? "Review action plan"
                  : "Open manual plan"}
              <WorkspaceIcon name="arrow" />
            </a>
          )}
          <a className="tl-run-link" href={"#capture/run/" + id}>
            <WorkspaceIcon name="trace" /> Recorded execution
          </a>
          {unavailable && (
            <button onClick={() => setRefresh((value) => value + 1)}>
              Check status
            </button>
          )}
          {active && (
            <button disabled={cancelling} onClick={() => void cancel()}>
              {cancelling ? "Cancelling…" : "Cancel processing"}
            </button>
          )}
        </div>
        {cancelError && <p role="alert">{cancelError}</p>}
      </div>
    </section>
  );
}
