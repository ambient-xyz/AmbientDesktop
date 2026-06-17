import type { DesktopEvent } from "../../shared/types";
import type { PiStreamTraceReference } from "./provider-continuation/agentRuntimeProviderDiagnostics";
import type { PromptCompletion } from "./post-tool/postToolFinalization";
import {
  createRuntimeStreamWatchdogController,
  type RuntimeStreamWatchdogController,
  type RuntimeStreamWatchdogState,
} from "./runtimeStreamWatchdogController";
import {
  runRuntimePromptCompletionLoop,
  type RuntimePromptCompletion,
  type RuntimePromptCompletionLoopResult,
} from "./runtimePromptCompletionLoop";
import type { RuntimePostToolContinuationController } from "./runtimePostToolContinuationController";

export interface RuntimePromptCompletionStagePostToolContinuation
  extends Pick<
    RuntimePostToolContinuationController,
    "wait" | "request" | "extendToFinalizationWindow" | "stop"
  > {}

export interface RuntimePromptCompletionStageInput {
  threadId: string;
  preStreamTimeoutMs: number;
  idleTimeoutMs: number;
  isRunStoreActive: () => boolean;
  isPermissionWaiting: () => boolean;
  isToolExecutionActive: () => boolean;
  markStreamTimedOut: () => void;
  setStreamTimeoutMessage: (message: string) => void;
  persistPiStreamTrace: (message: string) => PiStreamTraceReference | undefined;
  getStreamState: () => RuntimeStreamWatchdogState;
  abortSessionRun: () => Promise<void>;
  signalStreamWatchdogTimeout: () => void;
  emitRunEvent: (event: DesktopEvent) => void;
  setStreamWatchdog: (controller: RuntimeStreamWatchdogController) => void;
  markQueueReady: () => void;
  flushPendingQueuedMessages: () => Promise<void>;
  promptCompletion: Promise<PromptCompletion>;
  postToolContinuation: RuntimePromptCompletionStagePostToolContinuation;
  assistantTerminalCompletion: {
    completion: Promise<"assistant-terminal">;
    clear: () => void;
  };
  streamWatchdogCompletion: Promise<RuntimePromptCompletion>;
  hasLastCompletedTool: () => boolean;
  assistantTextObservedAfterLastToolEnd: () => boolean;
  isStreamTimedOut: () => boolean;
  streamTimeoutMessage: () => string;
  isToolExecutionTimedOut: () => boolean;
  toolExecutionTimeoutMessage: () => string | undefined;
  finalizeAssistantTerminalRun: () => Promise<void>;
  waitForPromptAfterAbort: () => Promise<unknown>;
  clearEmptyAssistantStallWatchdog: () => void;
  clearToolArgumentWatchdog: () => void;
  clearToolExecutionWatchdog: () => void;
  unsubscribePromptEvents: () => void;
  createStreamWatchdog?: typeof createRuntimeStreamWatchdogController;
  runPromptCompletionLoop?: typeof runRuntimePromptCompletionLoop;
}

export async function runRuntimePromptCompletionStage(
  input: RuntimePromptCompletionStageInput,
): Promise<RuntimePromptCompletionLoopResult> {
  const streamWatchdog = (input.createStreamWatchdog ?? createRuntimeStreamWatchdogController)({
    threadId: input.threadId,
    preStreamTimeoutMs: input.preStreamTimeoutMs,
    idleTimeoutMs: input.idleTimeoutMs,
    isRunStoreActive: input.isRunStoreActive,
    shouldPauseForExternalActivity: () => input.isPermissionWaiting() || input.isToolExecutionActive(),
    markStreamTimedOut: input.markStreamTimedOut,
    setStreamTimeoutMessage: input.setStreamTimeoutMessage,
    persistPiStreamTrace: input.persistPiStreamTrace,
    getState: input.getStreamState,
    abortSessionRun: () => {
      void input.abortSessionRun().catch(() => undefined);
    },
    signalStreamWatchdogTimeout: input.signalStreamWatchdogTimeout,
    emitRunEvent: input.emitRunEvent,
  });
  input.setStreamWatchdog(streamWatchdog);
  streamWatchdog.pauseIfNeeded();
  input.markQueueReady();
  await input.flushPendingQueuedMessages();

  return (input.runPromptCompletionLoop ?? runRuntimePromptCompletionLoop)({
    promptCompletion: input.promptCompletion,
    postToolContinuation: input.postToolContinuation,
    assistantTerminalCompletion: input.assistantTerminalCompletion.completion,
    streamWatchdogCompletion: input.streamWatchdogCompletion,
    hasLastCompletedTool: input.hasLastCompletedTool,
    assistantTextObservedAfterLastToolEnd: input.assistantTextObservedAfterLastToolEnd,
    isStreamTimedOut: input.isStreamTimedOut,
    streamTimeoutMessage: input.streamTimeoutMessage,
    isToolExecutionTimedOut: input.isToolExecutionTimedOut,
    toolExecutionTimeoutMessage: input.toolExecutionTimeoutMessage,
    finalizeAssistantTerminalRun: input.finalizeAssistantTerminalRun,
    abortSessionRun: input.abortSessionRun,
    waitForPromptAfterAbort: input.waitForPromptAfterAbort,
    cleanup: () => {
      input.assistantTerminalCompletion.clear();
      input.clearEmptyAssistantStallWatchdog();
      input.clearToolArgumentWatchdog();
      input.clearToolExecutionWatchdog();
      streamWatchdog.stop();
      input.postToolContinuation.stop();
      input.unsubscribePromptEvents();
    },
  });
}
