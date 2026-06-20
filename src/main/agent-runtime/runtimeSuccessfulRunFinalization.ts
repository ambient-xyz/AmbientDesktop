import type { DesktopEvent } from "../../shared/desktopTypes";
import type {
  PlannerPlanArtifact,
  PlannerPlanFinalizationAttemptStatus,
  PlannerPlanWorkflowState,
} from "../../shared/plannerTypes";
import type { SubagentParentMailboxEventSummary } from "../../shared/subagentTypes";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import type { CallableWorkflowParentBlockingBlock } from "./agentRuntimeCallableWorkflowFacade";
import type { AssistantTerminalCleanupDiagnostic } from "../agent-runtime/agentRuntimeAssistantTerminalDiagnostics";
import {
  callableWorkflowFinalizationBlockedActivity,
  type SubagentFinalizationBarrierBlock,
  subagentFinalizationBlockedActivity,
} from "../agent-runtime/agentRuntimeFinalizationBlocking";
import type { SubagentParentControlAbortIntent } from "./tools/agentRuntimeToolMessageMetadata";
import {
  finalAssistantMessageModel,
  type FinalAssistantMessageStatus,
} from "./finalAssistantMessage";
import type { EmptyAssistantResponseMetadata } from "./emptyAssistantFinalization";

export interface RuntimePlannerArtifactFinalizationResult {
  message: ChatMessage;
  artifact: PlannerPlanArtifact;
  relatedArtifacts?: PlannerPlanArtifact[];
  repairPrompt?: string;
  eventType: "created" | "updated";
}

export interface RuntimeSuccessfulRunFinalizationInput {
  threadId: string;
  runId: string;
  workspacePath: string;
  currentAssistantMessageId: string;
  currentAssistantVisibleContent: string;
  abortRequested: boolean;
  abortMessage: string;
  receivedAnyText: boolean;
  finalizedAfterToolIdle: boolean;
  awaitingInputAfterTools: boolean;
  emptyAssistantResponse: boolean;
  retryEmptyAssistantResponse: boolean;
  emptyResponseText: string;
  emptyAssistantResponseMetadata?: EmptyAssistantResponseMetadata | undefined;
  assistantTerminalCleanupInterrupted: boolean;
  assistantTerminalCleanupDiagnostic?: AssistantTerminalCleanupDiagnostic | undefined;
  subagentParentControlAbortIntent?: SubagentParentControlAbortIntent | undefined;
  providerRetryBeforeVisibleOutput: boolean;
  providerRetryRecovered: boolean;
  providerRetryAttemptCount: number;
  discardProviderRetrySession: boolean;
  providerRetrySessionFile?: string | undefined;
  providerRetryLastError?: string | undefined;
  hasPlannerFinalizationSources: boolean;
  preResolvedCallableWorkflowFinalizationBlock?: CallableWorkflowParentBlockingBlock | undefined;
  resolveSubagentFinalizationBlock: () => SubagentFinalizationBarrierBlock | undefined;
  resolveCallableWorkflowFinalizationBlock: () => CallableWorkflowParentBlockingBlock | undefined;
  recordSubagentFinalizationBlockedParentMailbox: (
    block: SubagentFinalizationBarrierBlock,
  ) => SubagentParentMailboxEventSummary[];
  recordCallableWorkflowFinalizationBlockedParentMailbox: (
    block: CallableWorkflowParentBlockingBlock,
  ) => SubagentParentMailboxEventSummary;
  replaceAssistantMessage: (
    messageId: string,
    content: string,
    metadata: Record<string, unknown>,
  ) => ChatMessage;
  createPlannerPlanArtifactFromMessage: (
    message: ChatMessage,
  ) => Promise<RuntimePlannerArtifactFinalizationResult | undefined>;
  finishPlannerFinalizationSources: (
    status: Exclude<PlannerPlanFinalizationAttemptStatus, "running">,
    options?: { error?: string; workflowState?: PlannerPlanWorkflowState },
  ) => void;
  finishParentRun: (status: "done" | "error" | "aborted" | "interrupted", errorMessage?: string) => void;
  recordVoiceDispatch: (message: ChatMessage) => void;
  getThread: () => ThreadSummary;
  emitRunEvent: (event: DesktopEvent) => void;
}

export interface RuntimeSuccessfulRunFinalizationResult {
  finalStatus: FinalAssistantMessageStatus;
  finalizationErrorText: string;
  parentFinalizationBlocked: boolean;
  suppressCurrentThinkingMessage: boolean;
  finalMessage: ChatMessage;
  visibleFinalMessage: ChatMessage;
  plannerArtifactResult?: RuntimePlannerArtifactFinalizationResult | undefined;
  plannerRepairPrompt?: string | undefined;
}

export async function finalizeSuccessfulRuntimeRun(
  input: RuntimeSuccessfulRunFinalizationInput,
): Promise<RuntimeSuccessfulRunFinalizationResult> {
  const canResolveParentFinalizationBlock =
    !input.abortRequested && !input.assistantTerminalCleanupInterrupted;
  const callableWorkflowFinalizationBlock = canResolveParentFinalizationBlock
    ? input.preResolvedCallableWorkflowFinalizationBlock ?? input.resolveCallableWorkflowFinalizationBlock()
    : undefined;
  const subagentFinalizationBlock =
    canResolveParentFinalizationBlock && (!input.emptyAssistantResponse || Boolean(callableWorkflowFinalizationBlock))
      ? input.resolveSubagentFinalizationBlock()
      : undefined;
  const subagentFinalizationParentMailboxEvents = subagentFinalizationBlock
    ? input.recordSubagentFinalizationBlockedParentMailbox(subagentFinalizationBlock)
    : [];
  const callableWorkflowFinalizationParentMailboxEvent = callableWorkflowFinalizationBlock
    ? input.recordCallableWorkflowFinalizationBlockedParentMailbox(callableWorkflowFinalizationBlock)
    : undefined;
  const parentFinalizationBlockMessage = [
    subagentFinalizationBlock?.message,
    callableWorkflowFinalizationBlock?.message,
  ].filter((message): message is string => Boolean(message)).join("\n\n");
  const finalAssistantMessage = finalAssistantMessageModel({
    currentAssistantVisibleContent: input.currentAssistantVisibleContent,
    abortRequested: input.abortRequested,
    abortMessage: input.abortMessage,
    receivedAnyText: input.receivedAnyText,
    finalizedAfterToolIdle: input.finalizedAfterToolIdle,
    awaitingInputAfterTools: input.awaitingInputAfterTools,
    emptyAssistantResponse: input.emptyAssistantResponse,
    retryEmptyAssistantResponse: input.retryEmptyAssistantResponse,
    emptyResponseText: input.emptyResponseText,
    emptyAssistantResponseMetadata: input.emptyAssistantResponseMetadata,
    assistantTerminalCleanupInterrupted: input.assistantTerminalCleanupInterrupted,
    assistantTerminalCleanupDiagnostic: input.assistantTerminalCleanupDiagnostic,
    subagentParentControlAbortIntent: input.subagentParentControlAbortIntent,
    parentFinalizationBlockMessage,
    subagentFinalizationBlock,
    subagentFinalizationParentMailboxEventIds: subagentFinalizationParentMailboxEvents.map((event) => event.id),
    callableWorkflowFinalizationBlock,
    callableWorkflowFinalizationParentMailboxEventId: callableWorkflowFinalizationParentMailboxEvent?.id,
    providerRetryBeforeVisibleOutput: input.providerRetryBeforeVisibleOutput,
    providerRetryRecovered: input.providerRetryRecovered,
    providerRetryAttemptCount: input.providerRetryAttemptCount,
    discardProviderRetrySession: input.discardProviderRetrySession,
    providerRetrySessionFile: input.providerRetrySessionFile,
    providerRetryLastError: input.providerRetryLastError,
  });
  const finalStatus = finalAssistantMessage.status;
  const finalizationErrorText = finalAssistantMessage.finalizationErrorText;
  const parentFinalizationBlocked = finalAssistantMessage.parentFinalizationBlocked;
  const finalMessage = input.replaceAssistantMessage(
    input.currentAssistantMessageId,
    finalAssistantMessage.content,
    finalAssistantMessage.metadata,
  );
  const plannerArtifactResult =
    !input.abortRequested && !input.awaitingInputAfterTools && !input.emptyAssistantResponse && !parentFinalizationBlocked
      ? await input.createPlannerPlanArtifactFromMessage(finalMessage)
      : undefined;
  if (finalStatus === "error") {
    input.finishPlannerFinalizationSources("failed", { error: finalizationErrorText, workflowState: "failed" });
  } else if (!plannerArtifactResult && input.hasPlannerFinalizationSources) {
    input.finishPlannerFinalizationSources("failed", {
      error: "Planner finalization response did not produce a durable plan artifact.",
      workflowState: "failed",
    });
  }
  input.finishParentRun(
    finalStatus === "aborted" ? "aborted" : finalStatus === "error" ? "error" : "done",
    finalStatus === "error" ? finalizationErrorText : undefined,
  );
  if (plannerArtifactResult) {
    for (const relatedArtifact of plannerArtifactResult.relatedArtifacts ?? []) {
      input.emitRunEvent({ type: "planner-plan-artifact-updated", artifact: relatedArtifact });
    }
    input.emitRunEvent({
      type: plannerArtifactResult.eventType === "updated" ? "planner-plan-artifact-updated" : "planner-plan-artifact-created",
      artifact: plannerArtifactResult.artifact,
    });
  }
  const visibleFinalMessage = plannerArtifactResult?.message ?? finalMessage;
  if (!input.abortRequested && !input.awaitingInputAfterTools && !input.emptyAssistantResponse && !parentFinalizationBlocked) {
    input.recordVoiceDispatch(visibleFinalMessage);
  }
  input.emitRunEvent({ type: "message-updated", message: visibleFinalMessage });
  input.emitRunEvent({ type: "thread-updated", thread: input.getThread() });
  input.emitRunEvent({ type: "run-status", threadId: input.threadId, status: finalStatus === "error" ? "error" : "idle" });
  if (subagentFinalizationBlock) {
    input.emitRunEvent({
      type: "runtime-activity",
      activity: subagentFinalizationBlockedActivity({
        threadId: input.threadId,
        outputChars: input.currentAssistantVisibleContent.length,
        block: subagentFinalizationBlock,
      }),
    });
  }
  if (callableWorkflowFinalizationBlock) {
    input.emitRunEvent({
      type: "runtime-activity",
      activity: callableWorkflowFinalizationBlockedActivity({
        threadId: input.threadId,
        outputChars: input.currentAssistantVisibleContent.length,
        block: callableWorkflowFinalizationBlock,
      }),
    });
  }
  if (finalStatus === "error") {
    input.emitRunEvent({
      type: "error",
      message: finalizationErrorText,
      threadId: input.threadId,
      workspacePath: input.workspacePath,
    });
  }
  return {
    finalStatus,
    finalizationErrorText,
    parentFinalizationBlocked,
    suppressCurrentThinkingMessage: Boolean(callableWorkflowFinalizationBlock),
    finalMessage,
    visibleFinalMessage,
    plannerArtifactResult,
    plannerRepairPrompt: plannerArtifactResult?.repairPrompt,
  };
}
