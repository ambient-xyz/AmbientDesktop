import type { DesktopEvent } from "../../shared/types";
import {
  createRuntimeStreamEventDispatcher,
  type RuntimeStreamEventDispatcher,
  type RuntimeStreamEventDispatcherInput,
} from "./runtimeStreamEventDispatcher";
import type { RuntimeTextOutputState } from "./runtimeTextOutputState";
import type { RuntimePromptRunState } from "./runtimePromptRunState";
import type { RuntimeProviderRetryState } from "./runtimeProviderRetryState";

export interface RuntimePromptStreamDispatcherSetupInput {
  threadId: string;
  assistantTerminalGraceMs: number;
  outputState: RuntimeTextOutputState;
  promptRunState: RuntimePromptRunState;
  providerRetryState: RuntimeProviderRetryState;
  runtimeMessages: RuntimeStreamEventDispatcherInput["runtimeMessages"];
  emptyAssistantStallWatchdog: RuntimeStreamEventDispatcherInput["emptyAssistantStallWatchdog"];
  assistantTerminalCompletion: RuntimeStreamEventDispatcherInput["assistantTerminalCompletion"];
  postToolContinuation: RuntimeStreamEventDispatcherInput["postToolContinuation"];
  toolMessages: RuntimeStreamEventDispatcherInput["toolMessages"];
  markPiStreamActivity: () => void;
  setActiveRunStatus: RuntimeStreamEventDispatcherInput["setActiveRunStatus"];
  reconcileQueueUpdate: RuntimeStreamEventDispatcherInput["reconcileQueueUpdate"];
  recordContextUsageSnapshot: RuntimeStreamEventDispatcherInput["recordContextUsageSnapshot"];
  emitRunEvent: (event: DesktopEvent) => void;
  createStreamEventDispatcher?: typeof createRuntimeStreamEventDispatcher;
}

export function createRuntimePromptStreamDispatcherSetup(
  input: RuntimePromptStreamDispatcherSetupInput,
): RuntimeStreamEventDispatcher {
  return (input.createStreamEventDispatcher ?? createRuntimeStreamEventDispatcher)({
    threadId: input.threadId,
    assistantTerminalGraceMs: input.assistantTerminalGraceMs,
    state: {
      receivedAnyText: input.outputState.receivedAnyText,
      setReceivedAnyText: input.outputState.setReceivedAnyText,
      currentAssistantReceivedText: input.outputState.currentAssistantReceivedText,
      setCurrentAssistantReceivedText: input.outputState.setCurrentAssistantReceivedText,
      currentAssistantFinalText: input.outputState.currentAssistantFinalText,
      setCurrentAssistantFinalText: input.outputState.setCurrentAssistantFinalText,
      assistantOutputChars: input.outputState.assistantOutputChars,
      setAssistantOutputChars: input.outputState.setAssistantOutputChars,
      assistantTextObservedAfterLastToolEnd: input.promptRunState.assistantTextObservedAfterLastToolEnd,
      setAssistantTextObservedAfterLastToolEnd: input.promptRunState.setAssistantTextObservedAfterLastToolEnd,
      hasLastCompletedTool: input.promptRunState.hasLastCompletedTool,
      lastAssistantTerminalEvent: input.promptRunState.lastAssistantTerminalEvent,
      setLastAssistantTerminalEvent: input.promptRunState.setLastAssistantTerminalEvent,
      currentThinkingReceivedText: input.outputState.currentThinkingReceivedText,
      setCurrentThinkingReceivedText: input.outputState.setCurrentThinkingReceivedText,
      currentThinkingFinalText: input.outputState.currentThinkingFinalText,
      setCurrentThinkingFinalText: input.outputState.setCurrentThinkingFinalText,
      thinkingOutputChars: input.outputState.thinkingOutputChars,
      setThinkingOutputChars: input.outputState.setThinkingOutputChars,
      setRuntimeError: input.promptRunState.setRuntimeError,
      providerRetryAttemptCount: input.providerRetryState.providerRetryAttemptCount,
      setProviderRetryAttemptCount: input.providerRetryState.setProviderRetryAttemptCount,
      providerRetryLastError: input.providerRetryState.providerRetryLastError,
      setProviderRetryLastError: input.providerRetryState.setProviderRetryLastError,
      providerRetryBeforeVisibleOutput: input.providerRetryState.providerRetryBeforeVisibleOutput,
      setProviderRetryBeforeVisibleOutput: input.providerRetryState.setProviderRetryBeforeVisibleOutput,
      providerRetryRecovered: input.providerRetryState.providerRetryRecovered,
      setProviderRetryRecovered: input.providerRetryState.setProviderRetryRecovered,
    },
    runtimeMessages: input.runtimeMessages,
    emptyAssistantStallWatchdog: input.emptyAssistantStallWatchdog,
    assistantTerminalCompletion: input.assistantTerminalCompletion,
    postToolContinuation: input.postToolContinuation,
    toolMessages: input.toolMessages,
    shouldIgnoreAssistantTerminalCleanupError: (error) =>
      input.promptRunState.shouldIgnoreAssistantTerminalCleanupError(error, input.outputState.receivedAnyText()),
    pushAssistantVisibleDelta: input.outputState.pushAssistantVisibleDelta,
    flushAssistantVisibleText: input.outputState.flushAssistantVisibleText,
    markFirstAssistantVisibleText: input.outputState.markFirstAssistantVisibleText,
    markPiStreamActivity: input.markPiStreamActivity,
    setActiveRunStatus: input.setActiveRunStatus,
    reconcileQueueUpdate: input.reconcileQueueUpdate,
    recordContextUsageSnapshot: input.recordContextUsageSnapshot,
    emitRunEvent: input.emitRunEvent,
  });
}
