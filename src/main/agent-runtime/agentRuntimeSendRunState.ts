import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { RunDiagnostics, ThreadGoal } from "../../shared/threadTypes";
import type { SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import type { AssistantFinalizationRetryState } from "./agentRuntimeAssistantRetryInput";
import { piAssistantMessageMetadata } from "./agentRuntimeAssistantMessageMetadata";
import {
  createAgentRuntimeSendExecutionState,
  type AgentRuntimeSendExecutionState,
  type AgentRuntimeSendExecutionStateInput,
  type AgentRuntimeSendExecutionStateSession,
} from "./agentRuntimeSendExecutionState";
import type { RuntimeSendMessageInput } from "./agentRuntimeSendPreparationController";
import {
  createAgentRuntimeSendPromptState,
  type AgentRuntimeSendPromptState,
  type AgentRuntimeSendPromptStateInput,
} from "./agentRuntimeSendPromptState";
import type { SymphonyParentModePolicy } from "./agentRuntimeSymphonyParentMode";
import type { RuntimePermissionWaitController } from "./runtimePermissionWaitController";
import type { RuntimeRunEventScope } from "./runtimeRunEventScope";

type RuntimeFinishableRunStatus = Parameters<AgentRuntimeSendExecutionStateInput<AgentRuntimeSendExecutionStateSession>["finishRun"]>[1];

export interface AgentRuntimeSendRunStateSessionRef<Session extends AgentRuntimeSendExecutionStateSession> {
  current: Session | undefined;
}

export interface AgentRuntimeSendRunStateInput<Session extends AgentRuntimeSendExecutionStateSession> {
  threadId: string;
  runWorkspacePath: string;
  threadWorkspacePath: string;
  permissionMode: PermissionMode;
  visibleUserContent: string;
  retrySourceUserMessageId?: string | undefined;
  baseInput: SendMessageInput;
  runtimeInput: Pick<RuntimeSendMessageInput, "dedicatedSessionKind" | "symphonyParentModeVerifiedLaunch">;
  usesDedicatedReviewSession: boolean;
  runtimeModel: string;
  activeAssistantFinalizationRetry?: AssistantFinalizationRetryState | undefined;
  assistantFinalizationRetryMaxRetries: number;
  interruptedToolCallRecoveryAttemptsUsed: number;
  interruptedToolCallRecoveryMaxRetries: number;
  piPreStreamTimeoutMs: number;
  piStreamIdleTimeoutMs: number;
  progressThrottleMs: number;
  progressCharDelta: number;
  recentEventLimit: number;
  emptyResponseRetryDelayMs: number;
  symphonyParentModePolicy?: SymphonyParentModePolicy | undefined;
  runEventScope: RuntimeRunEventScope;
  sessionRef: AgentRuntimeSendRunStateSessionRef<Session>;
  getPromptContentLength: () => number;
  startRun: (input: { threadId: string; assistantMessageId: string }) => { id: string };
  getThreadGoal: (threadId: string) => ThreadGoal | undefined;
  setActiveRunId: (threadId: string, runId: string) => void;
  setActiveRun: (threadId: string, run: AgentRuntimeSendExecutionState["activeRun"]) => void;
  addAssistantMessage: AgentRuntimeSendPromptStateInput<Session>["addAssistantMessage"];
  addToolMessage: AgentRuntimeSendExecutionStateInput<Session>["addToolMessage"];
  appendToMessage: AgentRuntimeSendPromptStateInput<Session>["appendToMessage"];
  replaceMessage: AgentRuntimeSendPromptStateInput<Session>["replaceMessage"];
  listMessages: AgentRuntimeSendExecutionStateInput<Session>["listMessages"];
  updateRunStatus: AgentRuntimeSendPromptStateInput<Session>["updateRunStatus"];
  updateRunDiagnostics: (runId: string, diagnostics: RunDiagnostics) => void;
  finishRun: (runId: string, status: RuntimeFinishableRunStatus, errorMessage?: string) => void;
  denyThread: (threadId: string) => void;
  getPermissionMode: () => PermissionMode;
  getCurrentThreadPiSessionFile: () => string | null | undefined;
  getCurrentThreadModel: () => string | undefined;
  commitThreadPiSessionFile: AgentRuntimeSendPromptStateInput<Session>["commitThreadPiSessionFile"];
  getWorkspaceStatePath: () => string;
  abortSessionRun: (session: Session, threadId: string) => Promise<void>;
  markSubagentParentControlBarrierReconciled: (input: {
    waitBarrierId: string;
    source: "runtime_parent_abort";
  }) => SubagentWaitBarrierSummary;
  cascadeSubagentsForStoppedParentRun: (threadId: string, runId: string, reason: string) => Promise<void>;
  setPermissionWaitControl: (threadId: string, control: RuntimePermissionWaitController) => void;
  getModel: () => string;
  clearThreadPiSessionFile: (sessionFile: string) => void;
  removeActiveSessionIfCurrent: (session: Session) => boolean | void;
  listCallableWorkflowTasksForParentRun: (runId: string) => readonly Pick<
    CallableWorkflowTaskSummary,
    "id" | "parentThreadId" | "parentRunId" | "toolName" | "sourceKind"
  >[];
  emit: (event: DesktopEvent) => void;
}

export interface AgentRuntimeSendRunState {
  runId: string;
  runGoalId?: string | undefined;
  runGoalStartedAtMs: number;
  sendPromptState: AgentRuntimeSendPromptState;
  sendExecutionState: AgentRuntimeSendExecutionState;
}

export function createAgentRuntimeSendRunState<Session extends AgentRuntimeSendExecutionStateSession>(
  input: AgentRuntimeSendRunStateInput<Session>,
): AgentRuntimeSendRunState {
  const assistantMessage = input.addAssistantMessage({
    threadId: input.threadId,
    content: "",
    metadata: piAssistantMessageMetadata("streaming"),
  });
  const run = input.startRun({ threadId: input.threadId, assistantMessageId: assistantMessage.id });
  input.setActiveRunId(input.threadId, run.id);
  input.emit({ type: "message-created", message: assistantMessage });
  input.emit({ type: "run-status", threadId: input.threadId, status: "starting" });

  const runStartedAt = new Date().toISOString();
  const runGoal = input.getThreadGoal(input.threadId);
  const runGoalId = runGoal?.status === "active" ? runGoal.goalId : undefined;
  const runGoalStartedAtMs = Date.now();
  let currentToolMessageCount = () => 0;
  const sendPromptState = createAgentRuntimeSendPromptState<Session>({
    threadId: input.threadId,
    runId: run.id,
    workspacePath: input.runWorkspacePath,
    assistantMessage,
    baseInput: input.baseInput,
    usesDedicatedReviewSession: input.usesDedicatedReviewSession,
    activeAssistantFinalizationRetry: input.activeAssistantFinalizationRetry,
    assistantFinalizationRetryMaxRetries: input.assistantFinalizationRetryMaxRetries,
    retrySourceUserMessageId: input.retrySourceUserMessageId,
    interruptedToolCallRecoveryAttemptsUsed: input.interruptedToolCallRecoveryAttemptsUsed,
    interruptedToolCallRecoveryMaxRetries: input.interruptedToolCallRecoveryMaxRetries,
    piPreStreamTimeoutMs: input.piPreStreamTimeoutMs,
    piStreamIdleTimeoutMs: input.piStreamIdleTimeoutMs,
    runStartedAt,
    runtimeModel: input.runtimeModel,
    getPermissionMode: input.getPermissionMode,
    getCurrentSessionFile: () => input.sessionRef.current?.sessionFile,
    getCurrentThreadPiSessionFile: input.getCurrentThreadPiSessionFile,
    getCurrentThreadModel: input.getCurrentThreadModel,
    commitThreadPiSessionFile: input.commitThreadPiSessionFile,
    getSession: () => input.sessionRef.current,
    getPromptContentLength: input.getPromptContentLength,
    getWorkspaceStatePath: input.getWorkspaceStatePath,
    isRunStoreActive: input.runEventScope.isRunStoreActive,
    markRunActivity: input.runEventScope.markRunActivity,
    updateRunStatus: input.updateRunStatus,
    listMessages: input.listMessages,
    addAssistantMessage: input.addAssistantMessage,
    appendToMessage: input.appendToMessage,
    replaceMessage: input.replaceMessage,
    updateRunDiagnostics: (diagnostics) => input.updateRunDiagnostics(run.id, diagnostics),
    emitRunEvent: input.runEventScope.emitRunEvent,
    toolMessageCount: () => currentToolMessageCount(),
    progressThrottleMs: input.progressThrottleMs,
    progressCharDelta: input.progressCharDelta,
    recentEventLimit: input.recentEventLimit,
    emptyResponseRetryDelayMs: input.emptyResponseRetryDelayMs,
  });
  const sendExecutionState = createAgentRuntimeSendExecutionState<Session>({
    threadId: input.threadId,
    runId: run.id,
    threadWorkspacePath: input.threadWorkspacePath,
    permissionMode: input.permissionMode,
    visibleUserContent: input.visibleUserContent,
    retrySourceUserMessageId: input.retrySourceUserMessageId,
    baseInput: input.baseInput,
    runtimeInput: input.runtimeInput,
    usesDedicatedReviewSession: input.usesDedicatedReviewSession,
    runtimeModel: input.runtimeModel,
    piPreStreamTimeoutMs: input.piPreStreamTimeoutMs,
    piStreamIdleTimeoutMs: input.piStreamIdleTimeoutMs,
    assistantFinalizationRetryMaxRetries: input.assistantFinalizationRetryMaxRetries,
    symphonyParentModePolicy: input.symphonyParentModePolicy,
    sendPromptState,
    runEventScope: input.runEventScope,
    isRunStoreActive: input.runEventScope.isRunStoreActive,
    markRunActivity: input.runEventScope.markRunActivity,
    listMessages: input.listMessages,
    addToolMessage: input.addToolMessage,
    replaceMessage: input.replaceMessage,
    updateRunDiagnostics: (diagnostics) => input.updateRunDiagnostics(run.id, diagnostics),
    finishRun: input.finishRun,
    denyThread: input.denyThread,
    getSession: () => input.sessionRef.current,
    abortSessionRun: input.abortSessionRun,
    markSubagentParentControlBarrierReconciled: input.markSubagentParentControlBarrierReconciled,
    cascadeSubagentsForStoppedParentRun: input.cascadeSubagentsForStoppedParentRun,
    setPermissionWaitControl: (control) => {
      input.setPermissionWaitControl(input.threadId, control);
    },
    getPermissionMode: input.getPermissionMode,
    getModel: input.getModel,
    currentThreadPiSessionFile: input.getCurrentThreadPiSessionFile,
    clearThreadPiSessionFile: input.clearThreadPiSessionFile,
    removeActiveSessionIfCurrent: input.removeActiveSessionIfCurrent,
    listCallableWorkflowTasksForParentRun: input.listCallableWorkflowTasksForParentRun,
    emitRunEvent: input.runEventScope.emitRunEvent,
  });
  currentToolMessageCount = () => sendExecutionState.toolMessages.size();
  input.setActiveRun(input.threadId, sendExecutionState.activeRun);

  return {
    runId: run.id,
    runGoalId,
    runGoalStartedAtMs,
    sendPromptState,
    sendExecutionState,
  };
}
