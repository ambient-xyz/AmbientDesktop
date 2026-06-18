import type { WorkflowAgentThreadSummary } from "../../shared/workflowTypes";

export type WorkflowThreadSessionState = "missing" | "preparing" | "active";

export interface WorkflowThreadSessionUiModel {
  state: WorkflowThreadSessionState;
  label: string;
  detail: string;
  badge: string;
  shortId?: string;
  canPrepare: boolean;
  actionLabel: string;
  actionTitle: string;
}

export function workflowThreadSessionUiModel(
  thread: Pick<WorkflowAgentThreadSummary, "chatThreadId">,
  options: { preparing?: boolean } = {},
): WorkflowThreadSessionUiModel {
  if (options.preparing) {
    return {
      state: "preparing",
      label: "Preparing Pi session",
      detail: "Creating or loading the durable Workflow Chat session before Pi continues.",
      badge: "Preparing",
      canPrepare: false,
      actionLabel: "Preparing",
      actionTitle: "Ambient is preparing the durable Workflow Chat session.",
    };
  }

  if (thread.chatThreadId) {
    const shortId = shortenWorkflowSessionId(thread.chatThreadId);
    return {
      state: "active",
      label: "Pi session active",
      detail: "Workflow Chat, revision requests, discovery follow-ups, and compile planning reuse this durable design session.",
      badge: "Session ready",
      shortId,
      canPrepare: false,
      actionLabel: "Session ready",
      actionTitle: `Workflow Chat is attached to session ${thread.chatThreadId}.`,
    };
  }

  return {
    state: "missing",
    label: "Pi session not prepared",
    detail: "Prepare one durable design session so Workflow Chat has stable context and can reuse Pi prefix cache for this workflow.",
    badge: "Not prepared",
    canPrepare: true,
    actionLabel: "Prepare Pi session",
    actionTitle: "Create or load the durable Pi session for this workflow before sending Workflow Chat messages.",
  };
}

export function shortenWorkflowSessionId(id: string): string {
  if (id.length <= 22) return id;
  return `${id.slice(0, 10)}...${id.slice(-7)}`;
}
