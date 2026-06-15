import type { AssistantFinalizationRetryReason } from "../agentRuntimeAssistantRetryInput";
import type { AssistantTerminalEventDiagnostic } from "../agentRuntimeAssistantTerminalDiagnostics";

export interface EmptyAssistantFinalizationInput {
  abortRequested: boolean;
  finalizedAfterToolIdle: boolean;
  currentAssistantVisibleContent: string;
  receivedAnyText: boolean;
  currentAssistantFinalTextChars: number;
  activeToolMessageCount: number;
  canScheduleRetry: boolean;
  retryAttemptsUsed: number;
  retryNextAttempt: number;
  maxRetries: number;
  retryDelayMs: number;
  activeRetryReason?: AssistantFinalizationRetryReason | undefined;
  sessionFile?: string | undefined;
  lastAssistantTerminalEvent?: AssistantTerminalEventDiagnostic | undefined;
}

export interface EmptyAssistantResponseMetadata {
  retryScheduled: boolean;
  retryUsesFreshSession: boolean;
  retryAttempt: number;
  maxRetries: number;
  retryReason: AssistantFinalizationRetryReason;
  retryDelayMs: number;
  receivedAnyText: boolean;
  currentAssistantFinalTextChars: number;
  sessionFile?: string;
  lastAssistantTerminalEvent?: AssistantTerminalEventDiagnostic;
}

export interface EmptyAssistantFinalizationModel {
  currentAssistantHasVisibleText: boolean;
  awaitingInputAfterTools: boolean;
  emptyAssistantResponse: boolean;
  retryEmptyAssistantResponse: boolean;
  emptyResponseRetryUsesFreshSession: boolean;
  emptyResponseText: string;
  metadata?: EmptyAssistantResponseMetadata;
}

export function emptyAssistantFinalizationModel(
  input: EmptyAssistantFinalizationInput,
): EmptyAssistantFinalizationModel {
  const currentAssistantHasVisibleText = Boolean(input.currentAssistantVisibleContent.trim());
  const awaitingInputAfterTools = input.finalizedAfterToolIdle && !currentAssistantHasVisibleText;
  const emptyAssistantResponse = !input.abortRequested && !awaitingInputAfterTools && !currentAssistantHasVisibleText;
  const retryEmptyAssistantResponse = emptyAssistantResponse && input.canScheduleRetry;
  const emptyResponseRetryUsesFreshSession =
    retryEmptyAssistantResponse &&
    !input.receivedAnyText &&
    input.activeToolMessageCount === 0 &&
    input.currentAssistantFinalTextChars === 0;
  const emptyResponseText = retryEmptyAssistantResponse
    ? emptyResponseRetryUsesFreshSession
      ? `Ambient/Pi returned no assistant text. Retrying assistant finalization attempt ${input.retryNextAttempt}/${input.maxRetries} with a fresh session.`
      : `Ambient/Pi returned no assistant text. Retrying assistant finalization attempt ${input.retryNextAttempt}/${input.maxRetries} after resetting the live session.`
    : `Ambient/Pi returned no assistant text after ${input.retryAttemptsUsed}/${input.maxRetries} assistant finalization retries.`;

  return {
    currentAssistantHasVisibleText,
    awaitingInputAfterTools,
    emptyAssistantResponse,
    retryEmptyAssistantResponse,
    emptyResponseRetryUsesFreshSession,
    emptyResponseText,
    ...(emptyAssistantResponse
      ? {
          metadata: {
            retryScheduled: retryEmptyAssistantResponse,
            retryUsesFreshSession: retryEmptyAssistantResponse ? emptyResponseRetryUsesFreshSession : false,
            retryAttempt: retryEmptyAssistantResponse ? input.retryNextAttempt : input.retryAttemptsUsed,
            maxRetries: input.maxRetries,
            retryReason: input.activeRetryReason ?? "empty_assistant_response",
            retryDelayMs: retryEmptyAssistantResponse ? input.retryDelayMs : 0,
            receivedAnyText: input.receivedAnyText,
            currentAssistantFinalTextChars: input.currentAssistantFinalTextChars,
            ...(input.sessionFile ? { sessionFile: input.sessionFile } : {}),
            ...(input.lastAssistantTerminalEvent ? { lastAssistantTerminalEvent: input.lastAssistantTerminalEvent } : {}),
          },
        }
      : {}),
  };
}
