import type { AssistantFinalizationRetryReason } from "../agent-runtime/agentRuntimeAssistantRetryInput";
import type { AssistantTerminalEventDiagnostic } from "../agent-runtime/agentRuntimeAssistantTerminalDiagnostics";
import {
  emptyAssistantFinalizationModel,
  type EmptyAssistantFinalizationModel,
} from "./emptyAssistantFinalization";

export type RuntimeSessionFileDisposition =
  | { kind: "clear"; sessionFile: string }
  | { kind: "commit"; sessionFile: string; currentPiSessionFile?: string | null | undefined; reason: "run-finished" };

export interface RuntimeSessionDispositionAfterRunInput {
  abortRequested: boolean;
  finalizedAfterToolIdle: boolean;
  currentAssistantVisibleContent: string;
  receivedAnyText: boolean;
  currentAssistantFinalTextChars: number;
  activeToolMessageCount: number;
  canScheduleEmptyAssistantRetry: boolean;
  emptyAssistantRetryAttemptsUsed: number;
  emptyAssistantRetryNextAttempt: number;
  maxRetries: number;
  retryDelayMs: number;
  activeRetryReason?: AssistantFinalizationRetryReason | undefined;
  retrySourceUserMessageId?: string | undefined;
  sessionFile?: string | undefined;
  lastAssistantTerminalEvent?: AssistantTerminalEventDiagnostic | undefined;
  providerRetryBeforeVisibleOutput: boolean;
  providerRetryRecovered: boolean;
  usesDedicatedReviewSession: boolean;
  currentThreadPiSessionFile?: string | null | undefined;
}

export interface RuntimeSessionDispositionAfterRunResult {
  emptyAssistantFinalization: EmptyAssistantFinalizationModel;
  awaitingInputAfterTools: boolean;
  emptyAssistantResponse: boolean;
  retryEmptyAssistantResponse: boolean;
  emptyResponseText: string;
  shouldCreateEmptyResponseRetry: boolean;
  shouldDisposeSessionForEmptyResponseRetry: boolean;
  emptyResponseRetryUsesFreshSession: boolean;
  discardProviderRetrySession: boolean;
  shouldDisposeSessionForProviderRetry: boolean;
  discardSessionFileAfterRun?: string | undefined;
  sessionFileDisposition?: RuntimeSessionFileDisposition | undefined;
}

const EMPTY_ASSISTANT_RETRY_REASON: AssistantFinalizationRetryReason = "empty_assistant_response";

export function finalizeRuntimeSessionDispositionAfterRun(
  input: RuntimeSessionDispositionAfterRunInput,
): RuntimeSessionDispositionAfterRunResult {
  const emptyAssistantFinalization = emptyAssistantFinalizationModel({
    abortRequested: input.abortRequested,
    finalizedAfterToolIdle: input.finalizedAfterToolIdle,
    currentAssistantVisibleContent: input.currentAssistantVisibleContent,
    receivedAnyText: input.receivedAnyText,
    currentAssistantFinalTextChars: input.currentAssistantFinalTextChars,
    activeToolMessageCount: input.activeToolMessageCount,
    canScheduleRetry: input.canScheduleEmptyAssistantRetry,
    retryAttemptsUsed: input.emptyAssistantRetryAttemptsUsed,
    retryNextAttempt: input.emptyAssistantRetryNextAttempt,
    maxRetries: input.maxRetries,
    retryDelayMs: input.retryDelayMs,
    activeRetryReason: input.activeRetryReason,
    sessionFile: input.sessionFile,
    lastAssistantTerminalEvent: input.lastAssistantTerminalEvent,
  });
  const retryEmptyAssistantResponse = emptyAssistantFinalization.retryEmptyAssistantResponse;
  const shouldCreateEmptyResponseRetry = retryEmptyAssistantResponse && Boolean(input.retrySourceUserMessageId);
  const emptyResponseRetryUsesFreshSession =
    shouldCreateEmptyResponseRetry && emptyAssistantFinalization.emptyResponseRetryUsesFreshSession;
  const emptyAssistantResponse = emptyAssistantFinalization.emptyAssistantResponse;
  const discardProviderRetrySession =
    input.providerRetryBeforeVisibleOutput &&
    input.providerRetryRecovered &&
    !input.abortRequested &&
    !emptyAssistantResponse &&
    Boolean(input.sessionFile);
  const discardSessionFileAfterRun =
    input.sessionFile && (emptyResponseRetryUsesFreshSession || discardProviderRetrySession)
      ? input.sessionFile
      : undefined;
  const sessionFileDisposition = runtimeSessionFileDisposition({
    usesDedicatedReviewSession: input.usesDedicatedReviewSession,
    sessionFile: input.sessionFile,
    currentThreadPiSessionFile: input.currentThreadPiSessionFile,
    discardSessionFileAfterRun,
  });

  return {
    emptyAssistantFinalization,
    awaitingInputAfterTools: emptyAssistantFinalization.awaitingInputAfterTools,
    emptyAssistantResponse,
    retryEmptyAssistantResponse,
    emptyResponseText: emptyAssistantFinalization.emptyResponseText,
    shouldCreateEmptyResponseRetry,
    shouldDisposeSessionForEmptyResponseRetry: shouldCreateEmptyResponseRetry,
    emptyResponseRetryUsesFreshSession,
    discardProviderRetrySession,
    shouldDisposeSessionForProviderRetry: discardProviderRetrySession,
    discardSessionFileAfterRun,
    sessionFileDisposition,
  };
}

function runtimeSessionFileDisposition(input: {
  usesDedicatedReviewSession: boolean;
  sessionFile?: string | undefined;
  currentThreadPiSessionFile?: string | null | undefined;
  discardSessionFileAfterRun?: string | undefined;
}): RuntimeSessionFileDisposition | undefined {
  if (input.usesDedicatedReviewSession) return undefined;
  if (input.discardSessionFileAfterRun && input.currentThreadPiSessionFile === input.discardSessionFileAfterRun) {
    return { kind: "clear", sessionFile: input.discardSessionFileAfterRun };
  }
  if (!input.discardSessionFileAfterRun && input.sessionFile && input.sessionFile !== input.currentThreadPiSessionFile) {
    return {
      kind: "commit",
      sessionFile: input.sessionFile,
      currentPiSessionFile: input.currentThreadPiSessionFile,
      reason: "run-finished",
    };
  }
  return undefined;
}
