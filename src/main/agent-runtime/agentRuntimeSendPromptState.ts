import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type { AssistantFinalizationRetryState } from "./agentRuntimeAssistantRetryInput";
import {
  createAgentRuntimeSendStreamDiagnosticsAdapter,
  type AgentRuntimeSendStreamDiagnosticsAdapterInput,
} from "./agentRuntimeSendStreamDiagnosticsAdapter";
import {
  createRuntimeAssistantMessageController,
  type RuntimeAssistantMessageController,
  type RuntimeAssistantMessageControllerInput,
} from "./runtimeAssistantMessageController";
import {
  createRuntimeAssistantRetryPlanning,
  type RuntimeAssistantRetryPlanning,
  type RuntimeAssistantRetryPlanningInput,
} from "./runtimeAssistantRetryPlanning";
import { createRuntimePromptControlState, type RuntimePromptControlState } from "./runtimePromptControlState";
import {
  createRuntimePromptLifecycleControls,
  type RuntimePromptLifecycleControls,
  type RuntimePromptLifecycleControlsInput,
} from "./runtimePromptLifecycleControls";
import { createRuntimeProviderRetryState, type RuntimeProviderRetryState } from "./runtimeProviderRetryState";
import {
  createRuntimeQueuedMessageController,
  type RuntimeQueuedMessageController,
  type RuntimeQueuedMessageSession,
} from "./runtimeQueuedMessageController";
import { createRuntimeSendPendingFollowUps, type RuntimeSendPendingFollowUps } from "./runtimeSendPendingFollowUps";
import { createRuntimeStreamActivityTracker, type RuntimeStreamActivityTracker } from "./runtimeStreamActivityTracker";
import { createRuntimeStreamTraceState, type RuntimeStreamTraceState } from "./runtimeStreamTraceState";
import { createRuntimeTextOutputState, type RuntimeTextOutputState } from "./runtimeTextOutputState";
import type { RuntimeAssistantTerminalCompletion } from "./runtimeAssistantTerminalCompletion";
import type { RuntimeEmptyAssistantStallWatchdog } from "./runtimeEmptyAssistantStallWatchdog";
import type { RuntimeStreamWatchdogController } from "./runtimeStreamWatchdogController";

type RuntimeSendStreamDiagnosticsAdapter = ReturnType<typeof createAgentRuntimeSendStreamDiagnosticsAdapter>;

export interface AgentRuntimeSendPromptStateInput<Session extends RuntimeQueuedMessageSession> {
  threadId: string;
  runId: string;
  workspacePath: string;
  assistantMessage: ChatMessage;
  baseInput: SendMessageInput;
  usesDedicatedReviewSession: boolean;
  activeAssistantFinalizationRetry?: AssistantFinalizationRetryState | undefined;
  assistantFinalizationRetryMaxRetries: number;
  retrySourceUserMessageId?: string | undefined;
  interruptedToolCallRecoveryAttemptsUsed: number;
  interruptedToolCallRecoveryMaxRetries: number;
  piPreStreamTimeoutMs: number;
  piStreamIdleTimeoutMs: number;
  runStartedAt: string;
  runtimeModel?: string | undefined;
  getPermissionMode: () => PermissionMode;
  getCurrentSessionFile: () => string | undefined;
  getCurrentThreadPiSessionFile: () => string | null | undefined;
  getCurrentThreadModel: () => string | undefined;
  commitThreadPiSessionFile: RuntimeAssistantRetryPlanningInput["commitThreadPiSessionFile"];
  getSession: () => Session | undefined;
  getPromptContentLength: () => number;
  getWorkspaceStatePath: () => string;
  isRunStoreActive: () => boolean;
  markRunActivity: () => boolean;
  updateRunStatus: RuntimePromptLifecycleControlsInput["updateRunStatus"];
  listMessages: RuntimeAssistantMessageControllerInput["listMessages"];
  getMessage: RuntimeAssistantMessageControllerInput["getMessage"];
  addAssistantMessage: RuntimeAssistantMessageControllerInput["addAssistantMessage"];
  appendToMessage: RuntimeAssistantMessageControllerInput["appendToMessage"];
  replaceMessage: RuntimeAssistantMessageControllerInput["replaceMessage"];
  updateRunDiagnostics: AgentRuntimeSendStreamDiagnosticsAdapterInput["updateRunDiagnostics"];
  emitRunEvent: (event: DesktopEvent) => void;
  toolMessageCount: () => number;
  progressThrottleMs: number;
  progressCharDelta: number;
  recentEventLimit: number;
  emptyResponseRetryDelayMs: number;
}

export type AgentRuntimeSendPromptState = RuntimeSendStreamDiagnosticsAdapter & {
  promptLifecycleControls: RuntimePromptLifecycleControls;
  assistantRetryPlanning: RuntimeAssistantRetryPlanning;
  promptControlState: RuntimePromptControlState;
  outputState: RuntimeTextOutputState;
  streamTraceState: RuntimeStreamTraceState;
  providerRetryState: RuntimeProviderRetryState;
  pendingFollowUps: RuntimeSendPendingFollowUps;
  runtimeMessages: RuntimeAssistantMessageController;
  queuedMessages: RuntimeQueuedMessageController;
  piStreamActivity: RuntimeStreamActivityTracker;
  activeRunSettled: Promise<void>;
  resolveActiveRunSettled: () => void;
  getStreamWatchdog: () => RuntimeStreamWatchdogController | undefined;
  setStreamWatchdog: (controller: RuntimeStreamWatchdogController | undefined) => void;
  setEmptyAssistantStallWatchdog: (watchdog: RuntimeEmptyAssistantStallWatchdog | undefined) => void;
  setAssistantTerminalCompletion: (completion: RuntimeAssistantTerminalCompletion | undefined) => void;
};

export function createAgentRuntimeSendPromptState<Session extends RuntimeQueuedMessageSession>(
  input: AgentRuntimeSendPromptStateInput<Session>,
): AgentRuntimeSendPromptState {
  let streamWatchdog: RuntimeStreamWatchdogController | undefined;
  let emptyAssistantStallWatchdog: RuntimeEmptyAssistantStallWatchdog | undefined;
  let assistantTerminalCompletion: RuntimeAssistantTerminalCompletion | undefined;
  let resolveActiveRunSettledInternal: (() => void) | undefined;

  const promptLifecycleControls = createRuntimePromptLifecycleControls({
    threadId: input.threadId,
    runId: input.runId,
    initialStatus: "starting",
    isRunStoreActive: input.isRunStoreActive,
    updateRunStatus: input.updateRunStatus,
    emitRunEvent: input.emitRunEvent,
  });
  const assistantRetryPlanning = createRuntimeAssistantRetryPlanning({
    baseInput: input.baseInput,
    threadId: input.threadId,
    usesDedicatedReviewSession: input.usesDedicatedReviewSession,
    activeAssistantFinalizationRetry: input.activeAssistantFinalizationRetry,
    assistantFinalizationRetryMaxRetries: input.assistantFinalizationRetryMaxRetries,
    retrySourceUserMessageId: input.retrySourceUserMessageId,
    interruptedToolCallRecoveryAttemptsUsed: input.interruptedToolCallRecoveryAttemptsUsed,
    interruptedToolCallRecoveryMaxRetries: input.interruptedToolCallRecoveryMaxRetries,
    getPermissionMode: input.getPermissionMode,
    getCurrentSessionFile: input.getCurrentSessionFile,
    getCurrentThreadPiSessionFile: input.getCurrentThreadPiSessionFile,
    shouldUseCurrentSessionForRetry: () =>
      normalizeAmbientModelId(input.getCurrentThreadModel()) === normalizeAmbientModelId(input.runtimeModel),
    commitThreadPiSessionFile: input.commitThreadPiSessionFile,
    emit: input.emitRunEvent,
  });
  const promptControlState = createRuntimePromptControlState();
  const outputState = createRuntimeTextOutputState();
  const streamTraceState = createRuntimeStreamTraceState();
  const providerRetryState = createRuntimeProviderRetryState();
  const pendingFollowUps = createRuntimeSendPendingFollowUps({
    emptyResponseRetryDelayMs: input.emptyResponseRetryDelayMs,
  });
  const runtimeMessages = createRuntimeAssistantMessageController({
    threadId: input.threadId,
    initialAssistantMessage: input.assistantMessage,
    markRunActivity: input.markRunActivity,
    resetAssistantStreamState: outputState.resetAssistantStreamState,
    resetThinkingStreamState: outputState.resetThinkingStreamState,
    listMessages: input.listMessages,
    getMessage: input.getMessage,
    addAssistantMessage: input.addAssistantMessage,
    appendToMessage: input.appendToMessage,
    replaceMessage: input.replaceMessage,
    emitRunEvent: input.emitRunEvent,
  });
  const queuedMessages = createRuntimeQueuedMessageController({
    threadId: input.threadId,
    workspacePath: input.workspacePath,
    isRunStoreActive: input.isRunStoreActive,
    markRunActivity: input.markRunActivity,
    getSession: input.getSession,
    isQueueReady: promptControlState.isQueueReady,
    incrementRunEventSeq: promptControlState.incrementRunEventSeq,
    replaceMessage: input.replaceMessage,
    emitRunEvent: input.emitRunEvent,
  });
  const piStreamActivity = createRuntimeStreamActivityTracker({
    threadId: input.threadId,
    idleTimeoutMs: input.piStreamIdleTimeoutMs,
    progressThrottleMs: input.progressThrottleMs,
    progressCharDelta: input.progressCharDelta,
    getOutputChars: outputState.assistantOutputChars,
    getThinkingChars: outputState.thinkingOutputChars,
    resetStreamWatchdog: () => {
      streamWatchdog?.reset();
    },
    refreshEmptyAssistantStallWatchdog: () => {
      emptyAssistantStallWatchdog?.refreshOnStreamActivity();
    },
    resetAssistantTerminalCompletion: () => {
      assistantTerminalCompletion?.resetOnActivity();
    },
    emitRunEvent: input.emitRunEvent,
  });
  const activeRunSettled = new Promise<void>((resolve) => {
    resolveActiveRunSettledInternal = resolve;
  });
  const diagnostics = createAgentRuntimeSendStreamDiagnosticsAdapter({
    runId: input.runId,
    threadId: input.threadId,
    recentEventLimit: input.recentEventLimit,
    streamTraceState,
    getWorkspaceStatePath: input.getWorkspaceStatePath,
    updateRunDiagnostics: input.updateRunDiagnostics,
    streamActivity: piStreamActivity,
    outputState,
    providerRetryState,
    promptControlState,
    toolMessageCount: input.toolMessageCount,
    getSessionFile: input.getCurrentSessionFile,
    piPreStreamTimeoutMs: input.piPreStreamTimeoutMs,
    piStreamIdleTimeoutMs: input.piStreamIdleTimeoutMs,
    runStartedAt: input.runStartedAt,
    promptContentLength: input.getPromptContentLength,
    runtimeMessages,
    runtimeModel: input.runtimeModel,
  });

  return {
    ...diagnostics,
    promptLifecycleControls,
    assistantRetryPlanning,
    promptControlState,
    outputState,
    streamTraceState,
    providerRetryState,
    pendingFollowUps,
    runtimeMessages,
    queuedMessages,
    piStreamActivity,
    activeRunSettled,
    resolveActiveRunSettled: () => {
      resolveActiveRunSettledInternal?.();
    },
    getStreamWatchdog: () => streamWatchdog,
    setStreamWatchdog: (controller) => {
      streamWatchdog = controller;
    },
    setEmptyAssistantStallWatchdog: (watchdog) => {
      emptyAssistantStallWatchdog = watchdog;
    },
    setAssistantTerminalCompletion: (completion) => {
      assistantTerminalCompletion = completion;
    },
  };
}
