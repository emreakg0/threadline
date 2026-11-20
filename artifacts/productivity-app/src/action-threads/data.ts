import type { ActionThread, ThreadNode } from "../../../api-server/src/action-thread/contract";
import type { ThreadOperation } from "../../../api-server/src/action-thread/progress";
import { api } from "../api";

export type { ActionThread, ThreadNode, ThreadOperation };
export const threadsRoute = "#capture/threads";
const path = "/action-threads";

type State = "pending" | "approved" | "rejected" | "completed";
export type ThreadSummary = {
  id: string;
  created_at: string;
  state: State;
  plan_status: ActionThread["status"];
  goal: ActionThread["goal"];
};
export type ThreadDetail = {
  id: string;
  graph: ActionThread;
  provider: "gemini" | "mock";
};
export type ThreadEvent = {
  version: number;
  operation: ThreadOperation["operation"];
  node_id: string | null;
  to_node_id: string | null;
  note: string | null;
  created_at: string;
};
export type ActiveStep = ThreadNode & {
  allowed_operations: ThreadOperation["operation"][];
  outcomes: { to: string; outcome: string }[];
  retry: { to: string; used: number; remaining: number; limit: number } | null;
  forward_exit: string | null;
};
type ProgressPage = {
  progress: { state: State; version: number; active_node_id: string | null };
  active_next_steps: ActiveStep[];
  events: ThreadEvent[];
  next_version: number;
  has_more: boolean;
};
export type ThreadProgress = Pick<ProgressPage, "progress" | "active_next_steps" | "events">;
export type ThreadCommand = ThreadOperation & { expected_version: number; idempotency_key: string };

export function listThreads(offset: number): Promise<{ threads: ThreadSummary[]; next_offset: number | null }> {
  return api(path + "?offset=" + offset);
}

export function getThread(id: string): Promise<ThreadDetail> {
  return api(path + "/" + encodeURIComponent(id));
}

export async function getProgress(id: string): Promise<ThreadProgress> {
  const resource = path + "/" + encodeURIComponent(id) + "/progress?after_version=";
  const first: ProgressPage = await api(resource + 0);
  const events = [...first.events];
  let page = first;
  const version = first.progress.version;
  while (page.has_more && page.next_version < version) {
    const cursor = page.next_version;
    page = await api(resource + cursor);
    if (page.next_version <= cursor) throw new Error("Progress history could not be read.");
    events.push(...page.events.filter((event) => event.version <= version));
  }
  if (events.length !== version || events.some((event, i) => event.version !== i + 1))
    throw new Error("Progress history is incomplete.");
  return { progress: first.progress, active_next_steps: first.active_next_steps, events };
}

export function submitProgress(id: string, command: ThreadCommand) {
  const review = command.operation === "approve" || command.operation === "reject";
  return api(path + "/" + encodeURIComponent(id) + (review ? "/review" : "/progress"), "POST", command);
}

export function threadStatus(state: State, clarification: boolean) {
  if (state === "pending") return clarification ? "Clarification needed" : "Pending review";
  if (state === "approved") return "In progress";
  return state === "completed" ? "Completed" : "Rejected";
}
