import type { DesktopEvent } from "../../shared/types";
import type { RuntimeAssistantTerminalCompletion } from "./runtimeAssistantTerminalCompletion";
import type { RuntimeEmptyAssistantStallWatchdog } from "./runtimeEmptyAssistantStallWatchdog";
import type { RuntimePermissionWaitController } from "./runtimePermissionWaitController";
import type { RuntimePostToolContinuationController } from "./runtimePostToolContinuationController";
import type { RuntimePromptControlState } from "./runtimePromptControlState";
import {
  runRuntimePromptCompletionStage,
  type RuntimePromptCompletionStageInput,
} from "./runtimePromptCompletionStage";
import type { RuntimePromptExecutionController } from "./runtimePromptExecutionController";
import type { RuntimePromptLifecycleControls } from "./runtimePromptLifecycleControls";
import type { RuntimePromptRunState } from "./runtimePromptRunState";
import type { RuntimeQueuedMessageController } from "./runtimeQueuedMessageController";
import type { RuntimeStreamActivityTracker } from "./runtimeStreamActivityTracker";
import type { RuntimeStreamWatchdogController } from "./runtimeStreamWatchdogController";
import type { RuntimeTextOutputState } from "./runtimeTextOutputState";
import type { RuntimeToolArgumentWatchdog } from "./runtimeToolArgumentWatchdog";
import type { RuntimeToolExecutionWatchdog } from "./runtimeToolExecutionWatchdog";

export interface RuntimePromptCompletionSetupInput<Session> {
  threadId: string;
  preStreamTimeoutMs: number;
  idleTimeoutMs: number;
  session: Session;
  isRunStoreActive: () => boolean;
  permissionWaits: Pick<RuntimePermissionWaitController, "isWaiting">;
  toolExecutionWatchdog: Pick<RuntimeToolExecutionWatchdog, "isActive" | "isTimedOut" | "timeoutMessage" | "clear">;
  toolArgumentWatchdog: Pick<RuntimeToolArgumentWatchdog, "clear">;
  emptyAssistantStallWatchdog: Pick<RuntimeEmptyAssistantStallWatchdog, "clear">;
  promptControlState: Pick<
    RuntimePromptControlState,
    | "markStreamTimedOut"
    | "setStreamWatchdogTimeoutMessage"
    | "markQueueReady"
    | "isStreamTimedOut"
  >;
  persistPiStreamTrace: RuntimePromptCompletionStageInput["persistPiStreamTrace"];
  outputState: Pick<RuntimeTextOutputState, "assistantOutputChars" | "thinkingOutputChars">;
  streamActivity: Pick<RuntimeStreamActivityTracker, "snapshot">;
  abortSessionRun: (session: Session, threadId: string) => Promise<void>;
  promptLifecycleControls: Pick<
    RuntimePromptLifecycleControls,
    "signalStreamWatchdogTimeout" | "streamWatchdogCompletion"
  >;
  emitRunEvent: (event: DesktopEvent) => void;
  setStreamWatchdog: (controller: RuntimeStreamWatchdogController) => void;
  queuedMessages: Pick<RuntimeQueuedMessageController, "flushPending">;
  promptExecution: Pick<RuntimePromptExecutionController, "promptCompletion" | "waitForPromptAfterAbort">;
  postToolContinuation: RuntimePromptCompletionStageInput["postToolContinuation"];
  assistantTerminalCompletion: Pick<RuntimeAssistantTerminalCompletion, "completion" | "clear">;
  promptRunState: Pick<
    RuntimePromptRunState,
    "hasLastCompletedTool" | "assistantTextObservedAfterLastToolEnd"
  >;
  streamTimeoutMessage: () => string;
  finalizeAssistantTerminalRun: () => Promise<void>;
  unsubscribePromptEvents: () => void;
  runPromptCompletionStage?: typeof runRuntimePromptCompletionStage;
}

export function runRuntimePromptCompletionSetup<Session>(
  input: RuntimePromptCompletionSetupInput<Session>,
): Promise<Awaited<ReturnType<typeof runRuntimePromptCompletionStage>>> {
  const runPromptCompletionStage = input.runPromptCompletionStage ?? runRuntimePromptCompletionStage;
  return runPromptCompletionStage({
    threadId: input.threadId,
    preStreamTimeoutMs: input.preStreamTimeoutMs,
    idleTimeoutMs: input.idleTimeoutMs,
    isRunStoreActive: input.isRunStoreActive,
    isPermissionWaiting: () => input.permissionWaits.isWaiting(),
    isToolExecutionActive: () => input.toolExecutionWatchdog.isActive(),
    markStreamTimedOut: input.promptControlState.markStreamTimedOut,
    setStreamTimeoutMessage: input.promptControlState.setStreamWatchdogTimeoutMessage,
    persistPiStreamTrace: input.persistPiStreamTrace,
    getStreamState: () => ({
      outputChars: input.outputState.assistantOutputChars(),
      thinkingChars: input.outputState.thinkingOutputChars(),
      streamEventCount: input.streamActivity.snapshot().eventCount,
    }),
    abortSessionRun: () => input.abortSessionRun(input.session, input.threadId),
    signalStreamWatchdogTimeout: input.promptLifecycleControls.signalStreamWatchdogTimeout,
    emitRunEvent: input.emitRunEvent,
    setStreamWatchdog: input.setStreamWatchdog,
    markQueueReady: input.promptControlState.markQueueReady,
    flushPendingQueuedMessages: () => input.queuedMessages.flushPending(),
    promptCompletion: input.promptExecution.promptCompletion,
    postToolContinuation: input.postToolContinuation,
    assistantTerminalCompletion: input.assistantTerminalCompletion,
    streamWatchdogCompletion: input.promptLifecycleControls.streamWatchdogCompletion,
    hasLastCompletedTool: input.promptRunState.hasLastCompletedTool,
    assistantTextObservedAfterLastToolEnd: input.promptRunState.assistantTextObservedAfterLastToolEnd,
    isStreamTimedOut: input.promptControlState.isStreamTimedOut,
    streamTimeoutMessage: input.streamTimeoutMessage,
    isToolExecutionTimedOut: () => input.toolExecutionWatchdog.isTimedOut(),
    toolExecutionTimeoutMessage: () => input.toolExecutionWatchdog.timeoutMessage(),
    finalizeAssistantTerminalRun: input.finalizeAssistantTerminalRun,
    waitForPromptAfterAbort: input.promptExecution.waitForPromptAfterAbort,
    clearEmptyAssistantStallWatchdog: input.emptyAssistantStallWatchdog.clear,
    clearToolArgumentWatchdog: input.toolArgumentWatchdog.clear,
    clearToolExecutionWatchdog: input.toolExecutionWatchdog.clear,
    unsubscribePromptEvents: input.unsubscribePromptEvents,
  });
}
