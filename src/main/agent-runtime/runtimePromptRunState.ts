import type {
  AssistantTerminalCleanupDiagnostic,
  AssistantTerminalEventDiagnostic,
} from "../agentRuntimeAssistantTerminalDiagnostics";
import type { CompletedToolSnapshot } from "../postToolContinuationScheduler";

const ASSISTANT_TERMINAL_CLEANUP_ABORT_ERROR_PATTERN =
  /\b(?:request was aborted|ambient request aborted|run aborted|aborted|abort|canceled|cancelled)\b/i;

export interface RuntimePromptRunStateSnapshot {
  runtimeError?: string | undefined;
  finalizedAfterToolIdle: boolean;
  lastCompletedTool?: CompletedToolSnapshot | undefined;
  assistantTextObservedAfterLastToolEnd: boolean;
  lastAssistantTerminalEvent?: AssistantTerminalEventDiagnostic | undefined;
  assistantTerminalCleanupDiagnostic?: AssistantTerminalCleanupDiagnostic | undefined;
  assistantTerminalCleanupInProgress: boolean;
}

export interface RuntimePromptRunState {
  runtimeError: () => string | undefined;
  setRuntimeError: (value: string | undefined) => void;
  finalizedAfterToolIdle: () => boolean;
  setFinalizedAfterToolIdle: (value: boolean) => void;
  lastCompletedTool: () => CompletedToolSnapshot | undefined;
  setLastCompletedTool: (tool: CompletedToolSnapshot) => void;
  hasLastCompletedTool: () => boolean;
  assistantTextObservedAfterLastToolEnd: () => boolean;
  setAssistantTextObservedAfterLastToolEnd: (value: boolean) => void;
  markAssistantTextNotObservedAfterLastToolEnd: () => void;
  lastAssistantTerminalEvent: () => AssistantTerminalEventDiagnostic | undefined;
  setLastAssistantTerminalEvent: (value: AssistantTerminalEventDiagnostic | undefined) => void;
  assistantTerminalCleanupDiagnostic: () => AssistantTerminalCleanupDiagnostic | undefined;
  setAssistantTerminalCleanupDiagnostic: (value: AssistantTerminalCleanupDiagnostic | undefined) => void;
  assistantTerminalCleanupInProgress: () => boolean;
  markAssistantTerminalCleanupInProgress: () => void;
  shouldIgnoreAssistantTerminalCleanupError: (error: string | undefined, receivedAnyText: boolean) => boolean;
  snapshot: () => RuntimePromptRunStateSnapshot;
}

export function createRuntimePromptRunState(): RuntimePromptRunState {
  let runtimeError: string | undefined;
  let finalizedAfterToolIdle = false;
  let lastCompletedTool: CompletedToolSnapshot | undefined;
  let assistantTextObservedAfterLastToolEnd = false;
  let lastAssistantTerminalEvent: AssistantTerminalEventDiagnostic | undefined;
  let assistantTerminalCleanupDiagnostic: AssistantTerminalCleanupDiagnostic | undefined;
  let assistantTerminalCleanupInProgress = false;

  return {
    runtimeError: () => runtimeError,
    setRuntimeError: (value) => {
      runtimeError = value;
    },
    finalizedAfterToolIdle: () => finalizedAfterToolIdle,
    setFinalizedAfterToolIdle: (value) => {
      finalizedAfterToolIdle = value;
    },
    lastCompletedTool: () => lastCompletedTool,
    setLastCompletedTool: (tool) => {
      lastCompletedTool = tool;
    },
    hasLastCompletedTool: () => Boolean(lastCompletedTool),
    assistantTextObservedAfterLastToolEnd: () => assistantTextObservedAfterLastToolEnd,
    setAssistantTextObservedAfterLastToolEnd: (value) => {
      assistantTextObservedAfterLastToolEnd = value;
    },
    markAssistantTextNotObservedAfterLastToolEnd: () => {
      assistantTextObservedAfterLastToolEnd = false;
    },
    lastAssistantTerminalEvent: () => lastAssistantTerminalEvent,
    setLastAssistantTerminalEvent: (value) => {
      lastAssistantTerminalEvent = value;
    },
    assistantTerminalCleanupDiagnostic: () => assistantTerminalCleanupDiagnostic,
    setAssistantTerminalCleanupDiagnostic: (value) => {
      assistantTerminalCleanupDiagnostic = value;
    },
    assistantTerminalCleanupInProgress: () => assistantTerminalCleanupInProgress,
    markAssistantTerminalCleanupInProgress: () => {
      assistantTerminalCleanupInProgress = true;
    },
    shouldIgnoreAssistantTerminalCleanupError: (error, receivedAnyText) => {
      if (!error || !assistantTerminalCleanupInProgress || !receivedAnyText) return false;
      return ASSISTANT_TERMINAL_CLEANUP_ABORT_ERROR_PATTERN.test(error);
    },
    snapshot: () => ({
      runtimeError,
      finalizedAfterToolIdle,
      lastCompletedTool,
      assistantTextObservedAfterLastToolEnd,
      lastAssistantTerminalEvent,
      assistantTerminalCleanupDiagnostic,
      assistantTerminalCleanupInProgress,
    }),
  };
}
