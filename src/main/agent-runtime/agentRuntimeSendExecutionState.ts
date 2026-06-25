import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { ChatMessage, RunDiagnostics } from "../../shared/threadTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import type { RuntimeSendMessageInput } from "./agentRuntimeSendPreparationController";
import type { AgentRuntimeSendPromptState } from "./agentRuntimeSendPromptState";
import type { SymphonyParentModePolicy } from "./agentRuntimeSymphonyParentMode";
import type { RuntimeOpenToolFailureReason } from "./openToolFailureUpdates";
import { createRuntimeAbortContextSetup } from "./runtimeAbortContextSetup";
import type { RuntimeAbortContextActiveRun } from "./runtimeAbortContext";
import type { RuntimePermissionWaitController } from "./runtimePermissionWaitController";
import { createRuntimePermissionWaitSetup } from "./runtimePermissionWaitSetup";
import { createRuntimeProviderContinuationSetup } from "./runtimeProviderContinuationSetup";
import type { RuntimeProviderContinuationContext } from "./runtimeProviderContinuationContext";
import type { RuntimeQueuedMessageSession } from "./runtimeQueuedMessageController";
import type { RuntimeRunEventScope } from "./runtimeRunEventScope";
import { createRuntimeSendSessionLifecycle, type RuntimeSendSessionLifecycle } from "./runtimeSendSessionLifecycle";
import type { RuntimeSessionCleanupSession } from "./runtimeSessionCleanup";
import { createRuntimeToolContextSetup, type RuntimeToolContextSetup } from "./runtimeToolContextSetup";
import type { RuntimeToolArgumentWatchdog } from "./runtimeToolArgumentWatchdog";
import type { RuntimeToolExecutionWatchdog } from "./runtimeToolExecutionWatchdog";

type RuntimeFinishableRunStatus = "done" | "error" | "aborted" | "interrupted";

type CallableWorkflowTaskForSymphonyLaunch = Pick<
  CallableWorkflowTaskSummary,
  "id" | "parentThreadId" | "parentRunId" | "toolName" | "sourceKind"
>;

export interface AgentRuntimeSendExecutionStateSession extends RuntimeQueuedMessageSession, RuntimeSessionCleanupSession {}

export interface AgentRuntimeSendExecutionStateInput<Session extends AgentRuntimeSendExecutionStateSession> {
  threadId: string;
  runId: string;
  threadWorkspacePath: string;
  permissionMode: PermissionMode;
  visibleUserContent: string;
  retrySourceUserMessageId?: string | undefined;
  baseInput: SendMessageInput;
  runtimeInput: Pick<RuntimeSendMessageInput, "dedicatedSessionKind" | "symphonyParentModeVerifiedLaunch">;
  usesDedicatedReviewSession: boolean;
  runtimeModel: string;
  piPreStreamTimeoutMs: number;
  piStreamIdleTimeoutMs: number;
  assistantFinalizationRetryMaxRetries: number;
  symphonyParentModePolicy?: SymphonyParentModePolicy | undefined;
  sendPromptState: AgentRuntimeSendPromptState;
  runEventScope: Pick<RuntimeRunEventScope, "addActivityListener" | "detachFromWorkspace">;
  isRunStoreActive: () => boolean;
  markRunActivity: () => boolean;
  listMessages: () => readonly ChatMessage[];
  getMessage: (messageId: string) => ChatMessage | undefined;
  addToolMessage: (messageInput: { threadId: string; content: string; metadata: Record<string, unknown> }) => ChatMessage;
  replaceMessage: (messageId: string, content: string, metadata?: Record<string, unknown>) => ChatMessage;
  updateRunDiagnostics: (diagnostics: RunDiagnostics) => void;
  finishRun: (runId: string, status: RuntimeFinishableRunStatus, errorMessage?: string) => void;
  denyThread: (threadId: string) => void;
  getSession: () => Session | undefined;
  abortSessionRun: (session: Session, threadId: string) => Promise<void>;
  markSubagentParentControlBarrierReconciled: (input: {
    waitBarrierId: string;
    source: "runtime_parent_abort";
  }) => SubagentWaitBarrierSummary;
  cascadeSubagentsForStoppedParentRun: (threadId: string, runId: string, reason: string) => Promise<void>;
  setPermissionWaitControl: (control: RuntimePermissionWaitController) => void;
  getPermissionMode: () => PermissionMode;
  getModel: () => string;
  currentThreadPiSessionFile: () => string | null | undefined;
  clearThreadPiSessionFile: (sessionFile: string) => void;
  removeActiveSessionIfCurrent: (session: Session) => boolean | void;
  listCallableWorkflowTasksForParentRun: (runId: string) => readonly CallableWorkflowTaskForSymphonyLaunch[];
  emitRunEvent: (event: DesktopEvent) => void;
}

export interface AgentRuntimeSendExecutionState {
  toolArgumentProgress: RuntimeToolContextSetup["toolArgumentProgress"];
  startedToolCallIds: RuntimeToolContextSetup["startedToolCallIds"];
  toolMessages: RuntimeToolContextSetup["toolMessages"];
  toolRecovery: RuntimeToolContextSetup["toolRecovery"];
  interruptedToolCallRecovery: RuntimeToolContextSetup["toolRecovery"]["interruptedToolCallRecovery"];
  toolIntentSnapshots: RuntimeToolContextSetup["toolRecovery"]["toolIntentSnapshots"];
  persistToolArgumentDiagnostics: RuntimeToolContextSetup["toolRecovery"]["persistToolArgumentDiagnostics"];
  forceInterruptedToolCallRecovery: RuntimeToolContextSetup["toolRecovery"]["forceInterruptedToolCallRecovery"];
  permissionWaits: RuntimePermissionWaitController;
  collectOpenProviderInterruptionToolSnapshots: RuntimeProviderContinuationContext["collectOpenProviderInterruptionToolSnapshots"];
  createProviderContinuationState: RuntimeProviderContinuationContext["createProviderContinuationState"];
  persistProviderContinuationState: RuntimeProviderContinuationContext["persistProviderContinuationState"];
  createProviderInterruptionContinuationInput: RuntimeProviderContinuationContext["createProviderInterruptionContinuationInput"];
  sendSessionLifecycle: RuntimeSendSessionLifecycle;
  cleanupCurrentSession: RuntimeSendSessionLifecycle["cleanupCurrentSession"];
  activeRun: RuntimeAbortContextActiveRun;
  isAbortRequested: () => boolean;
  currentSubagentParentControlAbortIntent: ReturnType<typeof createRuntimeAbortContextSetup>["subagentParentControlAbortIntent"];
  finishParentRun: ReturnType<typeof createRuntimeAbortContextSetup>["finishParentRun"];
  consumeSubagentParentControlAbort: ReturnType<typeof createRuntimeAbortContextSetup>["consumeSubagentParentControlAbort"];
  requestSubagentParentControlAbort: ReturnType<typeof createRuntimeAbortContextSetup>["requestSubagentParentControlAbort"];
  toolArgumentWatchdog: () => RuntimeToolArgumentWatchdog | undefined;
  toolExecutionWatchdog: () => RuntimeToolExecutionWatchdog | undefined;
  setToolArgumentWatchdog: (watchdog: RuntimeToolArgumentWatchdog) => void;
  setToolExecutionWatchdog: (watchdog: RuntimeToolExecutionWatchdog) => void;
  markOpenToolMessagesFailed: (reason: RuntimeOpenToolFailureReason) => void;
  setMarkOpenToolMessagesFailed: (handler: (reason: RuntimeOpenToolFailureReason) => void) => void;
}

export function createAgentRuntimeSendExecutionState<Session extends AgentRuntimeSendExecutionStateSession>(
  input: AgentRuntimeSendExecutionStateInput<Session>,
): AgentRuntimeSendExecutionState {
  let toolArgumentWatchdog: RuntimeToolArgumentWatchdog | undefined;
  let toolExecutionWatchdog: RuntimeToolExecutionWatchdog | undefined;
  let markOpenToolMessagesFailed: (reason: RuntimeOpenToolFailureReason) => void = () => undefined;
  const { assistantFinalizationRetryNextAttemptFor, sessionRecoveryForCurrentSession } = input.sendPromptState.assistantRetryPlanning;

  const toolContext = createRuntimeToolContextSetup({
    threadId: input.threadId,
    workspacePath: input.threadWorkspacePath,
    permissionMode: input.permissionMode,
    runId: input.runId,
    outputState: input.sendPromptState.outputState,
    visibleUserContent: input.visibleUserContent,
    isRunStoreActive: input.isRunStoreActive,
    retrySourceUserMessageId: () => input.retrySourceUserMessageId,
    listMessages: input.listMessages,
    getMessage: input.getMessage,
    addToolMessage: input.addToolMessage,
    replaceMessage: input.replaceMessage,
    updateRunDiagnostics: input.updateRunDiagnostics,
    emitRunEvent: input.emitRunEvent,
  });
  const { toolArgumentProgress, startedToolCallIds, toolMessages, toolRecovery } = toolContext;
  const { interruptedToolCallRecovery, toolIntentSnapshots, persistToolArgumentDiagnostics, forceInterruptedToolCallRecovery } =
    toolRecovery;

  const abortContext = createRuntimeAbortContextSetup<Session>({
    threadId: input.threadId,
    runId: input.runId,
    dedicatedSessionKind: input.runtimeInput.dedicatedSessionKind,
    activeRunSettled: input.sendPromptState.activeRunSettled,
    runEventScope: input.runEventScope,
    queuedMessages: input.sendPromptState.queuedMessages,
    outputState: input.sendPromptState.outputState,
    promptLifecycleControls: input.sendPromptState.promptLifecycleControls,
    isRunStoreActive: input.isRunStoreActive,
    finishRun: input.finishRun,
    denyThread: input.denyThread,
    getSession: input.getSession,
    abortSessionRun: input.abortSessionRun,
    markSubagentParentControlBarrierReconciled: input.markSubagentParentControlBarrierReconciled,
    cascadeSubagentsForStoppedParentRun: input.cascadeSubagentsForStoppedParentRun,
    emitRunEvent: input.emitRunEvent,
  });

  const permissionWaits = createRuntimePermissionWaitSetup({
    threadId: input.threadId,
    toolMessages,
    toolArgumentProgress,
    getToolExecutionWatchdog: () => toolExecutionWatchdog,
    getToolArgumentWatchdog: () => toolArgumentWatchdog,
    getStreamWatchdog: input.sendPromptState.getStreamWatchdog,
    markRunActivity: input.markRunActivity,
    replaceMessage: input.replaceMessage,
    emitRunEvent: input.emitRunEvent,
  });
  input.setPermissionWaitControl(permissionWaits);

  const providerContinuation = createRuntimeProviderContinuationSetup({
    baseInput: input.baseInput,
    workspacePath: input.threadWorkspacePath,
    runId: input.runId,
    threadId: input.threadId,
    runtimeModel: input.runtimeModel,
    piPreStreamTimeoutMs: input.piPreStreamTimeoutMs,
    piStreamIdleTimeoutMs: input.piStreamIdleTimeoutMs,
    assistantFinalizationRetryMaxRetries: input.assistantFinalizationRetryMaxRetries,
    toolMessages,
    toolArgumentProgress,
    interruptedToolCallRecovery,
    startedToolCallIds,
    toolIntents: toolIntentSnapshots,
    runtimeMessages: input.sendPromptState.runtimeMessages,
    outputState: input.sendPromptState.outputState,
    streamActivity: input.sendPromptState.piStreamActivity,
    streamTraceState: input.sendPromptState.streamTraceState,
    getPermissionMode: input.getPermissionMode,
    getModel: input.getModel,
    getRetrySourceUserMessageId: () => input.retrySourceUserMessageId,
    getSessionFile: () => input.getSession()?.sessionFile,
    chatStreamSemanticOutputSeen: input.sendPromptState.chatStreamSemanticOutputSeen,
    currentPiStreamIdleSource: input.sendPromptState.currentPiStreamIdleSource,
    assistantFinalizationRetryNextAttemptFor,
    sessionRecoveryForCurrentSession,
    updateRunDiagnostics: input.updateRunDiagnostics,
  });

  const sendSessionLifecycle = createRuntimeSendSessionLifecycle<Session>({
    threadId: input.threadId,
    runId: input.runId,
    getSession: input.getSession,
    removeActiveSessionIfCurrent: input.removeActiveSessionIfCurrent,
    usesDedicatedReviewSession: input.usesDedicatedReviewSession,
    currentThreadPiSessionFile: input.currentThreadPiSessionFile,
    clearThreadPiSessionFile: input.clearThreadPiSessionFile,
    symphonyParentModePolicy: input.symphonyParentModePolicy,
    initialSymphonyParentModeVerifiedLaunch: input.runtimeInput.symphonyParentModeVerifiedLaunch,
    listCallableWorkflowTasksForParentRun: input.listCallableWorkflowTasksForParentRun,
  });

  return {
    toolArgumentProgress,
    startedToolCallIds,
    toolMessages,
    toolRecovery,
    interruptedToolCallRecovery,
    toolIntentSnapshots,
    persistToolArgumentDiagnostics,
    forceInterruptedToolCallRecovery,
    permissionWaits,
    collectOpenProviderInterruptionToolSnapshots: providerContinuation.collectOpenProviderInterruptionToolSnapshots,
    createProviderContinuationState: providerContinuation.createProviderContinuationState,
    persistProviderContinuationState: providerContinuation.persistProviderContinuationState,
    createProviderInterruptionContinuationInput: providerContinuation.createProviderInterruptionContinuationInput,
    sendSessionLifecycle,
    cleanupCurrentSession: sendSessionLifecycle.cleanupCurrentSession,
    activeRun: abortContext.activeRun,
    isAbortRequested: abortContext.abortRequested,
    currentSubagentParentControlAbortIntent: abortContext.subagentParentControlAbortIntent,
    finishParentRun: abortContext.finishParentRun,
    consumeSubagentParentControlAbort: abortContext.consumeSubagentParentControlAbort,
    requestSubagentParentControlAbort: abortContext.requestSubagentParentControlAbort,
    toolArgumentWatchdog: () => toolArgumentWatchdog,
    toolExecutionWatchdog: () => toolExecutionWatchdog,
    setToolArgumentWatchdog: (watchdog) => {
      toolArgumentWatchdog = watchdog;
    },
    setToolExecutionWatchdog: (watchdog) => {
      toolExecutionWatchdog = watchdog;
    },
    markOpenToolMessagesFailed: (reason) => markOpenToolMessagesFailed(reason),
    setMarkOpenToolMessagesFailed: (handler) => {
      markOpenToolMessagesFailed = handler;
    },
  };
}
