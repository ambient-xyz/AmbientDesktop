import type { DesktopEvent } from "../../shared/desktopTypes";
import type {
  PlannerPlanFinalizationAttemptStatus,
  PlannerPlanWorkflowState,
} from "../../shared/plannerTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import { piAssistantMessageMetadata } from "../agent-runtime/agentRuntimeAssistantMessageMetadata";

export interface RuntimeSubagentPreflightBlockInput {
  threadId: string;
  workspacePath: string;
  message: string;
  reason: string;
  addAssistantMessage: (input: {
    threadId: string;
    role: "assistant";
    content: string;
    metadata: Record<string, unknown>;
  }) => ChatMessage;
  startRun: (input: { threadId: string; assistantMessageId: string }) => { id: string };
  setActiveRunId: (threadId: string, runId: string) => void;
  deleteActiveRunId: (threadId: string) => void;
  finishPlannerFinalizationSources: (
    status: Exclude<PlannerPlanFinalizationAttemptStatus, "running">,
    options?: { error?: string; workflowState?: PlannerPlanWorkflowState },
  ) => void;
  finishRun: (runId: string, status: "error", errorMessage: string) => void;
  emitRunEvent: (event: DesktopEvent) => void;
  onActivity?: (() => void) | undefined;
}

export interface RuntimeSubagentPreflightBlockResult {
  assistantMessage: ChatMessage;
  runId: string;
}

export function finalizeRuntimeSubagentPreflightBlock(
  input: RuntimeSubagentPreflightBlockInput,
): RuntimeSubagentPreflightBlockResult {
  const assistantMessage = input.addAssistantMessage({
    threadId: input.threadId,
    role: "assistant",
    content: input.message,
    metadata: {
      ...piAssistantMessageMetadata("error"),
      preflightBlock: "subagent_unavailable",
    },
  });
  const run = input.startRun({ threadId: input.threadId, assistantMessageId: assistantMessage.id });
  input.setActiveRunId(input.threadId, run.id);
  input.finishPlannerFinalizationSources("failed", { error: input.reason, workflowState: "failed" });
  input.finishRun(run.id, "error", input.reason);
  input.deleteActiveRunId(input.threadId);
  input.emitRunEvent({ type: "message-created", message: assistantMessage });
  input.emitRunEvent({ type: "run-status", threadId: input.threadId, status: "error" });
  input.emitRunEvent({
    type: "error",
    message: input.reason,
    threadId: input.threadId,
    workspacePath: input.workspacePath,
  });
  input.onActivity?.();

  return {
    assistantMessage,
    runId: run.id,
  };
}
