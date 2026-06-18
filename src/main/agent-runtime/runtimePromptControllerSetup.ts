import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ChatMessage, ToolArgumentProgressSnapshot } from "../../shared/threadTypes";
import type { PiStreamTraceReference } from "./provider-continuation/agentRuntimeProviderDiagnostics";
import type { RuntimeStreamWatchdogController } from "./runtimeStreamWatchdogController";
import {
  createRuntimeToolExecutionWatchdog,
  type RuntimeToolExecutionWatchdog,
  type RuntimeToolExecutionWatchdogInput,
} from "./runtimeToolExecutionWatchdog";
import {
  createRuntimeToolArgumentWatchdog,
  type RuntimeToolArgumentProgressSource,
  type RuntimeToolArgumentWatchdog,
  type RuntimeToolArgumentWatchdogInput,
  type RuntimeToolArgumentWatchdogState,
} from "./runtimeToolArgumentWatchdog";
import {
  createRuntimeEmptyAssistantStallWatchdog,
  type RuntimeEmptyAssistantStallWatchdog,
  type RuntimeEmptyAssistantStallWatchdogInput,
  type RuntimeEmptyAssistantStallWatchdogState,
} from "./runtimeEmptyAssistantStallWatchdog";
import {
  createRuntimeAssistantTerminalCompletion,
  type RuntimeAssistantTerminalCompletion,
  type RuntimeAssistantTerminalCompletionInput,
} from "./runtimeAssistantTerminalCompletion";
import {
  createRuntimePostToolContinuationController,
  type RuntimePostToolContinuationController,
  type RuntimePostToolContinuationControllerInput,
} from "./runtimePostToolContinuationController";
import {
  createRuntimePromptRunState,
  type RuntimePromptRunState,
} from "./runtimePromptRunState";

export interface RuntimePromptControllerSetupInput {
  threadId: string;
  runId: string;
  defaultToolExecutionIdleTimeoutMs: number;
  toolArgumentIdleTimeoutMs: number;
  emptyAssistantStallTimeoutMs: number;
  assistantTerminalGraceMs: number;
  postToolContinuationIdleMs: number;
  postToolFinalizationIdleMs: number;
  postToolFinalizationTickMs: number;
  assistantFinalizationRetryMaxRetries: number;
  isRunStoreActive: () => boolean;
  isPermissionWaiting: () => boolean;
  pauseStreamWatchdog: () => void;
  resumeStreamWatchdog: () => void;
  resetStreamWatchdog: () => void;
  abortSessionRun: () => void;
  signalToolExecutionTimeout: () => void;
  signalStreamWatchdogTimeout: () => void;
  streamWatchdogCompletion: RuntimePostToolContinuationControllerInput["streamWatchdogCompletion"];
  isStreamTimedOut: () => boolean;
  markStreamTimedOut: () => void;
  setStreamTimeoutMessage: (message: string | undefined) => void;
  streamTimeoutMessage: () => string;
  persistPiStreamTrace: (message: string) => PiStreamTraceReference | undefined;
  toolArgumentProgress: RuntimeToolArgumentProgressSource;
  forceInterruptedToolCallRecovery: (snapshot: ToolArgumentProgressSnapshot) => ToolArgumentProgressSnapshot;
  getOutputChars: () => number;
  getThinkingChars: () => number;
  hasAssistantText: () => boolean;
  getAssistantStartCount: () => number;
  getReceivedAnyText: () => boolean;
  getCurrentAssistantReceivedText: () => boolean;
  getCurrentAssistantFinalText: () => string;
  getStreamEventCount: () => number;
  getSessionFile: () => string | undefined;
  getMessages: () => ChatMessage[];
  getRunEventSeq: () => number;
  steerContinuation: (prompt: string) => Promise<unknown>;
  finalizeAssistantTerminalRun: (pendingCompletion?: Promise<unknown>) => Promise<void>;
  emitRunEvent: (event: DesktopEvent) => void;
  createToolExecutionWatchdog?: typeof createRuntimeToolExecutionWatchdog;
  createToolArgumentWatchdog?: typeof createRuntimeToolArgumentWatchdog;
  createEmptyAssistantStallWatchdog?: typeof createRuntimeEmptyAssistantStallWatchdog;
  createAssistantTerminalCompletion?: typeof createRuntimeAssistantTerminalCompletion;
  createPostToolContinuationController?: typeof createRuntimePostToolContinuationController;
  createPromptRunState?: typeof createRuntimePromptRunState;
}

export interface RuntimePromptControllerSetup {
  toolExecutionWatchdog: RuntimeToolExecutionWatchdog;
  toolArgumentWatchdog: RuntimeToolArgumentWatchdog;
  emptyAssistantStallWatchdog: RuntimeEmptyAssistantStallWatchdog;
  assistantTerminalCompletion: RuntimeAssistantTerminalCompletion;
  promptRunState: RuntimePromptRunState;
  postToolContinuation: RuntimePostToolContinuationController;
}

export function createRuntimePromptControllerSetup(
  input: RuntimePromptControllerSetupInput,
): RuntimePromptControllerSetup {
  const toolExecutionWatchdog = (input.createToolExecutionWatchdog ?? createRuntimeToolExecutionWatchdog)({
    threadId: input.threadId,
    defaultIdleTimeoutMs: input.defaultToolExecutionIdleTimeoutMs,
    isRunStoreActive: input.isRunStoreActive,
    isPermissionWaiting: input.isPermissionWaiting,
    pauseStreamWatchdog: input.pauseStreamWatchdog,
    resumeStreamWatchdog: input.resumeStreamWatchdog,
    abortSessionRun: input.abortSessionRun,
    signalToolExecutionTimeout: input.signalToolExecutionTimeout,
    emitRunEvent: input.emitRunEvent,
  } satisfies RuntimeToolExecutionWatchdogInput);

  const sharedStreamState = (): RuntimeToolArgumentWatchdogState => ({
    outputChars: input.getOutputChars(),
    thinkingChars: input.getThinkingChars(),
    streamEventCount: input.getStreamEventCount(),
  });

  const toolArgumentWatchdog = (input.createToolArgumentWatchdog ?? createRuntimeToolArgumentWatchdog)({
    threadId: input.threadId,
    idleTimeoutMs: input.toolArgumentIdleTimeoutMs,
    progress: input.toolArgumentProgress,
    isRunStoreActive: input.isRunStoreActive,
    isPermissionWaiting: input.isPermissionWaiting,
    isToolExecutionActive: toolExecutionWatchdog.isActive,
    isStreamTimedOut: input.isStreamTimedOut,
    isToolExecutionTimedOut: toolExecutionWatchdog.isTimedOut,
    markStreamTimedOut: input.markStreamTimedOut,
    setStreamTimeoutMessage: input.setStreamTimeoutMessage,
    forceInterruptedToolCallRecovery: input.forceInterruptedToolCallRecovery,
    persistPiStreamTrace: input.persistPiStreamTrace,
    getState: sharedStreamState,
    abortSessionRun: input.abortSessionRun,
    signalStreamWatchdogTimeout: input.signalStreamWatchdogTimeout,
    emitRunEvent: input.emitRunEvent,
  } satisfies RuntimeToolArgumentWatchdogInput);

  const emptyAssistantStallWatchdog = (
    input.createEmptyAssistantStallWatchdog ?? createRuntimeEmptyAssistantStallWatchdog
  )({
    threadId: input.threadId,
    idleTimeoutMs: input.emptyAssistantStallTimeoutMs,
    isRunStoreActive: input.isRunStoreActive,
    isStreamTimedOut: input.isStreamTimedOut,
    markStreamTimedOut: input.markStreamTimedOut,
    setStreamTimeoutMessage: input.setStreamTimeoutMessage,
    persistPiStreamTrace: input.persistPiStreamTrace,
    getState: (): RuntimeEmptyAssistantStallWatchdogState => ({
      outputChars: input.getOutputChars(),
      thinkingChars: input.getThinkingChars(),
      assistantStartCount: input.getAssistantStartCount(),
      receivedAnyText: input.getReceivedAnyText(),
      currentAssistantReceivedText: input.getCurrentAssistantReceivedText(),
      currentAssistantFinalText: input.getCurrentAssistantFinalText(),
      streamEventCount: input.getStreamEventCount(),
      ...(input.getSessionFile() ? { sessionFile: input.getSessionFile() } : {}),
    }),
    abortSessionRun: input.abortSessionRun,
    signalStreamWatchdogTimeout: input.signalStreamWatchdogTimeout,
    emitRunEvent: input.emitRunEvent,
  } satisfies RuntimeEmptyAssistantStallWatchdogInput);

  const assistantTerminalCompletion = (
    input.createAssistantTerminalCompletion ?? createRuntimeAssistantTerminalCompletion
  )({
    defaultGraceMs: input.assistantTerminalGraceMs,
    hasAssistantText: input.hasAssistantText,
  } satisfies RuntimeAssistantTerminalCompletionInput);

  const promptRunState = (input.createPromptRunState ?? createRuntimePromptRunState)();

  const postToolContinuation = (
    input.createPostToolContinuationController ?? createRuntimePostToolContinuationController
  )({
    threadId: input.threadId,
    runId: input.runId,
    continuationIdleMs: input.postToolContinuationIdleMs,
    finalizationIdleMs: input.postToolFinalizationIdleMs,
    tickMs: input.postToolFinalizationTickMs,
    streamIdleTimeoutMs: input.toolArgumentIdleTimeoutMs,
    maxAttempts: input.assistantFinalizationRetryMaxRetries,
    getOutputChars: input.getOutputChars,
    getThinkingChars: input.getThinkingChars,
    getMessages: input.getMessages,
    getLastCompletedTool: promptRunState.lastCompletedTool,
    getRunEventSeq: input.getRunEventSeq,
    resetStreamWatchdog: input.resetStreamWatchdog,
    assistantTerminalCompletion: assistantTerminalCompletion.completion,
    streamWatchdogCompletion: input.streamWatchdogCompletion,
    isStreamTimedOut: input.isStreamTimedOut,
    streamTimeoutMessage: input.streamTimeoutMessage,
    isToolExecutionTimedOut: toolExecutionWatchdog.isTimedOut,
    toolExecutionTimeoutMessage: toolExecutionWatchdog.timeoutMessage,
    steerContinuation: input.steerContinuation,
    finalizeAssistantTerminalRun: input.finalizeAssistantTerminalRun,
    emitRunEvent: input.emitRunEvent,
  } satisfies RuntimePostToolContinuationControllerInput);

  return {
    toolExecutionWatchdog,
    toolArgumentWatchdog,
    emptyAssistantStallWatchdog,
    assistantTerminalCompletion,
    promptRunState,
    postToolContinuation,
  };
}
