import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
import { promptCacheTelemetryFromUsage } from "../../shared/promptCacheTelemetry";
import type { PromptCacheTelemetry } from "../../shared/threadTypes";
import type { AssistantFinalizationRetryReason } from "../agent-runtime/agentRuntimeAssistantRetryInput";
import type {
  AssistantTerminalCleanupDiagnostic,
  AssistantTerminalEventDiagnostic,
} from "../agent-runtime/agentRuntimeAssistantTerminalDiagnostics";
import type { SubagentParentControlAbortIntent } from "./tools/agentRuntimeToolMessageMetadata";
import {
  finalizeRuntimeSessionDispositionAfterRun,
} from "./runtimeSessionDispositionAfterRun";
import {
  finalizeSuccessfulRuntimeRun,
  type RuntimeSuccessfulRunFinalizationInput,
} from "./runtimeSuccessfulRunFinalization";

export interface RuntimePromptSuccessHandlerInput {
  threadId: string;
  runId: string;
  workspacePath: string;
  currentAssistantMessageId: string;
  runtimeError?: string | undefined;
  abortRequested: boolean;
  finalizedAfterToolIdle: boolean;
  currentThinkingFinalText: string;
  currentAssistantFinalText: string;
  currentAssistantVisibleContent: string;
  receivedAnyText: boolean;
  activeToolMessageCount: number;
  pendingEmptyResponseRetryDelayMs: number;
  activeRetryReason?: AssistantFinalizationRetryReason | undefined;
  retrySourceUserMessageId?: string | undefined;
  sessionFile?: string | undefined;
  lastAssistantTerminalEvent?: AssistantTerminalEventDiagnostic | undefined;
  assistantTerminalCleanupDiagnostic?: AssistantTerminalCleanupDiagnostic | undefined;
  subagentParentControlAbortIntent?: SubagentParentControlAbortIntent | undefined;
  providerRetryBeforeVisibleOutput: boolean;
  providerRetryRecovered: boolean;
  providerRetryAttemptCount: number;
  providerRetryLastError?: string | undefined;
  usesDedicatedReviewSession: boolean;
  currentThreadPiSessionFile?: string | null | undefined;
  hasPlannerFinalizationSources: boolean;
  assistantFinalizationRetryMaxRetries: number;
  canScheduleEmptyAssistantRetry: boolean;
  emptyAssistantRetryAttemptsUsed: number;
  emptyAssistantRetryNextAttempt: number;
  consumeSubagentParentControlAbort: () => Promise<void>;
  currentPromptCacheTelemetry: () => PromptCacheTelemetry;
  completePromptCacheTelemetryIfPending: (telemetry: PromptCacheTelemetry) => void;
  finishCurrentThinkingMessage: (status: "done" | "aborted", text: string) => void;
  suppressAssistantMessagesExceptCurrent: (status: "done" | "error" | "aborted") => void;
  suppressCurrentThinkingMessage: (status: "done" | "aborted") => void;
  suppressCallableWorkflowParentAssistantMessages: (
    block: NonNullable<RuntimeSuccessfulRunFinalizationInput["preResolvedCallableWorkflowFinalizationBlock"]>,
    options: { preserveMessageId?: string | undefined },
  ) => void;
  recordContextUsageSnapshot: () => void;
  cleanupCurrentSession: () => void;
  createEmptyAssistantRetry: () => SendMessageInput;
  clearThreadPiSessionFile: () => void;
  commitThreadPiSessionFile: (input: {
    sessionFile: string;
    currentPiSessionFile?: string | null | undefined;
    reason: "run-finished";
  }) => Promise<void> | void;
  createPlannerRepairFollowUp: (prompt: string) => SendMessageInput;
  resolveSubagentFinalizationBlock: RuntimeSuccessfulRunFinalizationInput["resolveSubagentFinalizationBlock"];
  resolveCallableWorkflowFinalizationBlock: RuntimeSuccessfulRunFinalizationInput["resolveCallableWorkflowFinalizationBlock"];
  recordSubagentFinalizationBlockedParentMailbox: RuntimeSuccessfulRunFinalizationInput["recordSubagentFinalizationBlockedParentMailbox"];
  recordCallableWorkflowFinalizationBlockedParentMailbox: RuntimeSuccessfulRunFinalizationInput["recordCallableWorkflowFinalizationBlockedParentMailbox"];
  replaceAssistantMessage: RuntimeSuccessfulRunFinalizationInput["replaceAssistantMessage"];
  createPlannerPlanArtifactFromMessage: RuntimeSuccessfulRunFinalizationInput["createPlannerPlanArtifactFromMessage"];
  finishPlannerFinalizationSources: RuntimeSuccessfulRunFinalizationInput["finishPlannerFinalizationSources"];
  finishParentRun: RuntimeSuccessfulRunFinalizationInput["finishParentRun"];
  recordVoiceDispatch: RuntimeSuccessfulRunFinalizationInput["recordVoiceDispatch"];
  getThread: RuntimeSuccessfulRunFinalizationInput["getThread"];
  emitRunEvent: (event: DesktopEvent) => void;
}

export interface RuntimePromptSuccessHandlerResult {
  pendingEmptyResponseRetry?: SendMessageInput | undefined;
  pendingPlannerRepairFollowUp?: SendMessageInput | undefined;
}

export async function handleRuntimePromptSuccess(
  input: RuntimePromptSuccessHandlerInput,
): Promise<RuntimePromptSuccessHandlerResult> {
  await input.consumeSubagentParentControlAbort();
  if (input.runtimeError && !input.finalizedAfterToolIdle) {
    throw new Error(input.runtimeError);
  }

  input.completePromptCacheTelemetryIfPending(promptCacheTelemetryFromUsage(input.lastAssistantTerminalEvent?.usage));
  const promptCacheTelemetry = input.currentPromptCacheTelemetry();
  input.finishCurrentThinkingMessage(input.abortRequested ? "aborted" : "done", input.currentThinkingFinalText);
  input.recordContextUsageSnapshot();

  const assistantTerminalCleanupInterrupted = Boolean(
    input.assistantTerminalCleanupDiagnostic &&
    (
      input.lastAssistantTerminalEvent?.stopReason === "aborted" ||
      input.lastAssistantTerminalEvent?.stopReason === "error" ||
      input.lastAssistantTerminalEvent?.error
    ),
  );
  const preResolvedCallableWorkflowFinalizationBlock =
    !input.abortRequested && !assistantTerminalCleanupInterrupted
      ? input.resolveCallableWorkflowFinalizationBlock()
      : undefined;
  const suppressEmptyAssistantRetryForCallableWorkflow = Boolean(preResolvedCallableWorkflowFinalizationBlock);
  const sessionDisposition = finalizeRuntimeSessionDispositionAfterRun({
    abortRequested: input.abortRequested,
    finalizedAfterToolIdle: input.finalizedAfterToolIdle,
    currentAssistantVisibleContent: input.currentAssistantVisibleContent,
    receivedAnyText: input.receivedAnyText,
    currentAssistantFinalTextChars: input.currentAssistantFinalText.length,
    activeToolMessageCount: input.activeToolMessageCount,
    canScheduleEmptyAssistantRetry: !suppressEmptyAssistantRetryForCallableWorkflow && input.canScheduleEmptyAssistantRetry,
    emptyAssistantRetryAttemptsUsed: input.emptyAssistantRetryAttemptsUsed,
    emptyAssistantRetryNextAttempt: input.emptyAssistantRetryNextAttempt,
    maxRetries: input.assistantFinalizationRetryMaxRetries,
    retryDelayMs: input.pendingEmptyResponseRetryDelayMs,
    activeRetryReason: input.activeRetryReason,
    retrySourceUserMessageId: input.retrySourceUserMessageId,
    sessionFile: input.sessionFile,
    lastAssistantTerminalEvent: input.lastAssistantTerminalEvent,
    providerRetryBeforeVisibleOutput: input.providerRetryBeforeVisibleOutput,
    providerRetryRecovered: input.providerRetryRecovered,
    usesDedicatedReviewSession: input.usesDedicatedReviewSession,
    currentThreadPiSessionFile: input.currentThreadPiSessionFile,
  });

  let pendingEmptyResponseRetry: SendMessageInput | undefined;
  if (sessionDisposition.shouldDisposeSessionForEmptyResponseRetry || sessionDisposition.shouldDisposeSessionForProviderRetry) {
    input.cleanupCurrentSession();
  }
  if (sessionDisposition.shouldCreateEmptyResponseRetry) {
    pendingEmptyResponseRetry = input.createEmptyAssistantRetry();
  }
  if (sessionDisposition.sessionFileDisposition?.kind === "clear") {
    input.clearThreadPiSessionFile();
  } else if (sessionDisposition.sessionFileDisposition?.kind === "commit") {
    await input.commitThreadPiSessionFile({
      sessionFile: sessionDisposition.sessionFileDisposition.sessionFile,
      currentPiSessionFile: sessionDisposition.sessionFileDisposition.currentPiSessionFile,
      reason: sessionDisposition.sessionFileDisposition.reason,
    });
  }

  const successfulFinalization = await finalizeSuccessfulRuntimeRun({
    threadId: input.threadId,
    runId: input.runId,
    workspacePath: input.workspacePath,
    currentAssistantMessageId: input.currentAssistantMessageId,
    currentAssistantVisibleContent: input.currentAssistantVisibleContent,
    abortRequested: input.abortRequested,
    abortMessage: input.subagentParentControlAbortIntent?.message ?? "Run stopped.",
    receivedAnyText: input.receivedAnyText,
    finalizedAfterToolIdle: input.finalizedAfterToolIdle,
    awaitingInputAfterTools: sessionDisposition.awaitingInputAfterTools,
    emptyAssistantResponse: sessionDisposition.emptyAssistantResponse,
    retryEmptyAssistantResponse: suppressEmptyAssistantRetryForCallableWorkflow
      ? false
      : sessionDisposition.retryEmptyAssistantResponse,
    emptyResponseText: sessionDisposition.emptyResponseText,
    emptyAssistantResponseMetadata: suppressEmptyAssistantRetryForCallableWorkflow
      ? undefined
      : sessionDisposition.emptyAssistantFinalization.metadata,
    assistantTerminalCleanupInterrupted,
    assistantTerminalCleanupDiagnostic: input.assistantTerminalCleanupDiagnostic,
    subagentParentControlAbortIntent: input.subagentParentControlAbortIntent,
    providerRetryBeforeVisibleOutput: input.providerRetryBeforeVisibleOutput,
    providerRetryRecovered: input.providerRetryRecovered,
    providerRetryAttemptCount: input.providerRetryAttemptCount,
    discardProviderRetrySession: sessionDisposition.discardProviderRetrySession,
    providerRetrySessionFile: input.sessionFile,
    providerRetryLastError: input.providerRetryLastError,
    promptCacheTelemetry,
    hasPlannerFinalizationSources: input.hasPlannerFinalizationSources,
    preResolvedCallableWorkflowFinalizationBlock,
    resolveSubagentFinalizationBlock: input.resolveSubagentFinalizationBlock,
    resolveCallableWorkflowFinalizationBlock: input.resolveCallableWorkflowFinalizationBlock,
    recordSubagentFinalizationBlockedParentMailbox: input.recordSubagentFinalizationBlockedParentMailbox,
    recordCallableWorkflowFinalizationBlockedParentMailbox: input.recordCallableWorkflowFinalizationBlockedParentMailbox,
    replaceAssistantMessage: input.replaceAssistantMessage,
    createPlannerPlanArtifactFromMessage: input.createPlannerPlanArtifactFromMessage,
    finishPlannerFinalizationSources: input.finishPlannerFinalizationSources,
    finishParentRun: input.finishParentRun,
    recordVoiceDispatch: input.recordVoiceDispatch,
    getThread: input.getThread,
    emitRunEvent: input.emitRunEvent,
  });
  if (successfulFinalization.suppressCurrentThinkingMessage) {
    if (preResolvedCallableWorkflowFinalizationBlock) {
      input.suppressCallableWorkflowParentAssistantMessages(preResolvedCallableWorkflowFinalizationBlock, {
        preserveMessageId: successfulFinalization.finalMessage.id,
      });
    }
    input.suppressAssistantMessagesExceptCurrent(finalAssistantSuppressionStatus(successfulFinalization.finalStatus));
    input.suppressCurrentThinkingMessage(input.abortRequested ? "aborted" : "done");
    input.emitRunEvent({ type: "thread-updated", thread: input.getThread() });
  }
  if (successfulFinalization.parentFinalizationBlocked) {
    pendingEmptyResponseRetry = undefined;
  }

  return {
    pendingEmptyResponseRetry,
    pendingPlannerRepairFollowUp: successfulFinalization.plannerRepairPrompt
      ? input.createPlannerRepairFollowUp(successfulFinalization.plannerRepairPrompt)
      : undefined,
  };
}

function finalAssistantSuppressionStatus(status: "done" | "error" | "aborted" | "awaiting-input"): "done" | "error" | "aborted" {
  if (status === "aborted") return "aborted";
  if (status === "done") return "done";
  return "error";
}
