import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
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
  finishCurrentThinkingMessage: (status: "done" | "aborted", text: string) => void;
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
  const sessionDisposition = finalizeRuntimeSessionDispositionAfterRun({
    abortRequested: input.abortRequested,
    finalizedAfterToolIdle: input.finalizedAfterToolIdle,
    currentAssistantVisibleContent: input.currentAssistantVisibleContent,
    receivedAnyText: input.receivedAnyText,
    currentAssistantFinalTextChars: input.currentAssistantFinalText.length,
    activeToolMessageCount: input.activeToolMessageCount,
    canScheduleEmptyAssistantRetry: input.canScheduleEmptyAssistantRetry,
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
    retryEmptyAssistantResponse: sessionDisposition.retryEmptyAssistantResponse,
    emptyResponseText: sessionDisposition.emptyResponseText,
    emptyAssistantResponseMetadata: sessionDisposition.emptyAssistantFinalization.metadata,
    assistantTerminalCleanupInterrupted,
    assistantTerminalCleanupDiagnostic: input.assistantTerminalCleanupDiagnostic,
    subagentParentControlAbortIntent: input.subagentParentControlAbortIntent,
    providerRetryBeforeVisibleOutput: input.providerRetryBeforeVisibleOutput,
    providerRetryRecovered: input.providerRetryRecovered,
    providerRetryAttemptCount: input.providerRetryAttemptCount,
    discardProviderRetrySession: sessionDisposition.discardProviderRetrySession,
    providerRetrySessionFile: input.sessionFile,
    providerRetryLastError: input.providerRetryLastError,
    hasPlannerFinalizationSources: input.hasPlannerFinalizationSources,
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

  return {
    pendingEmptyResponseRetry,
    pendingPlannerRepairFollowUp: successfulFinalization.plannerRepairPrompt
      ? input.createPlannerRepairFollowUp(successfulFinalization.plannerRepairPrompt)
      : undefined,
  };
}
