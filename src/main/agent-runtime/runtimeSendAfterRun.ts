import { emptyQueueState } from "../../shared/messageDelivery";
import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
import {
  finalizeMessagingRemoteSurfaceCommandPendingProjectSwitchAfterRun,
  type MessagingRemoteSurfaceCommandPendingProjectSwitch,
} from "./messaging/agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import {
  finalizeRuntimeGoalContinuationAfterRun,
  type AccountFinishedGoalRunInput,
  type RuntimeGoalRunStatus,
} from "./runtimeGoalContinuationAfterRun";
import {
  runtimeSendFollowUpSleep,
  scheduleRuntimeSendFollowUps,
} from "./runtimeSendFollowUps";

type RuntimePendingProjectSwitchAfterRunOptions = Parameters<
  typeof finalizeMessagingRemoteSurfaceCommandPendingProjectSwitchAfterRun
>[0];

export interface RuntimeSendAfterRunRecord {
  status?: RuntimeGoalRunStatus | undefined;
  errorMessage?: string | undefined;
}

export interface RuntimeSendAfterRunInput {
  threadId: string;
  workspacePath: string;
  runGoalId?: string | undefined;
  runGoalStartedAtMs: number;
  promptChars: number;
  assistantChars: number;
  thinkingChars: number;
  toolMessageCount: number;
  abortRequested: boolean;
  pendingPlannerRepairFollowUp?: SendMessageInput | undefined;
  pendingInterruptedToolCallRecoveryFollowUp?: SendMessageInput | undefined;
  pendingProviderInterruptionContinuation?: SendMessageInput | undefined;
  pendingEmptyResponseRetry?: SendMessageInput | undefined;
  pendingEmptyResponseRetryDelayMs: number;
  awaitInternalRetryCompletion: boolean;
  hasWorkflowPlanEditIntent: boolean;
  hasDedicatedReviewSession: boolean;
  isRunStoreActive: () => boolean;
  clearActiveRun: () => void;
  clearActiveRunId: () => void;
  clearPermissionWaitControl: () => void;
  clearToolArgumentWatchdog: () => void;
  clearToolExecutionWatchdog: () => void;
  cleanupDedicatedReviewSession: () => void;
  clearWorkflowPlanEditIntent: () => void;
  takePendingProjectSwitch: () => MessagingRemoteSurfaceCommandPendingProjectSwitch | undefined;
  updateRuntimeEvent: RuntimePendingProjectSwitchAfterRunOptions["updateRuntimeEvent"];
  scheduleProjectSwitchCompletion: RuntimePendingProjectSwitchAfterRunOptions["scheduleCompletion"];
  getRunRecord: () => RuntimeSendAfterRunRecord | undefined;
  hasQueuedUserInput: () => boolean;
  accountFinishedGoalRun: (input: AccountFinishedGoalRunInput) => ReturnType<typeof finalizeRuntimeGoalContinuationAfterRun>["goalAfterRun"];
  scheduleGoalContinuation: (threadId: string, goalId: string, delayMs: number) => void;
  schedulePlannerDurableRepairFollowUp: (followUp: SendMessageInput, workspacePath: string) => void;
  send: (followUp: SendMessageInput, hooks?: { awaitInternalRetryCompletion?: boolean }) => Promise<void>;
  emitError: (message: string, threadId: string, workspacePath: string) => void;
  emitRunEvent: (event: DesktopEvent) => void;
  resolveActiveRunSettled: () => void;
  setTimeout?: (callback: () => void, delayMs: number) => unknown;
  sleep?: (delayMs: number) => Promise<void>;
}

export interface RuntimeSendAfterRunResult {
  shouldEmitQueueClear: boolean;
  scheduledFollowUpCount: number;
  hasPendingInternalFollowUp: boolean;
  hasQueuedUserInput: boolean;
  projectSwitchPending: boolean;
  scheduledGoalContinuation: boolean;
}

export async function finalizeRuntimeSendAfterRun(input: RuntimeSendAfterRunInput): Promise<RuntimeSendAfterRunResult> {
  const shouldEmitQueueClear = input.isRunStoreActive();
  input.clearActiveRun();
  input.clearActiveRunId();
  input.clearPermissionWaitControl();
  input.clearToolArgumentWatchdog();
  input.clearToolExecutionWatchdog();
  if (input.hasDedicatedReviewSession) {
    input.cleanupDedicatedReviewSession();
  }
  if (input.hasWorkflowPlanEditIntent) {
    input.clearWorkflowPlanEditIntent();
  }
  if (shouldEmitQueueClear) {
    input.emitRunEvent({ type: "queue-updated", queue: emptyQueueState(input.threadId) });
  }

  const scheduledFollowUps = await scheduleRuntimeSendFollowUps({
    shouldEmitQueueClear,
    threadId: input.threadId,
    workspacePath: input.workspacePath,
    plannerRepairFollowUp: input.pendingPlannerRepairFollowUp,
    interruptedToolCallRecoveryFollowUp: input.pendingInterruptedToolCallRecoveryFollowUp,
    providerInterruptionContinuation: input.pendingProviderInterruptionContinuation,
    emptyResponseRetry: input.pendingEmptyResponseRetry,
    emptyResponseRetryDelayMs: input.pendingEmptyResponseRetryDelayMs,
    awaitInternalRetryCompletion: input.awaitInternalRetryCompletion,
    schedulePlannerDurableRepairFollowUp: input.schedulePlannerDurableRepairFollowUp,
    send: input.send,
    emitError: input.emitError,
    setTimeout: input.setTimeout ?? setTimeout,
    sleep: input.sleep ?? runtimeSendFollowUpSleep,
  });
  const pendingProjectSwitch = input.takePendingProjectSwitch();
  finalizeMessagingRemoteSurfaceCommandPendingProjectSwitchAfterRun({
    ...(pendingProjectSwitch ? { projectSwitch: pendingProjectSwitch } : {}),
    shouldEmitQueueClear,
    updateRuntimeEvent: input.updateRuntimeEvent,
    scheduleCompletion: input.scheduleProjectSwitchCompletion,
  });
  const runRecord = input.getRunRecord();
  const hasPendingInternalFollowUp = scheduledFollowUps.hasPendingInternalFollowUp || Boolean(pendingProjectSwitch);
  const hasQueuedUserInput = input.hasQueuedUserInput();
  const goalContinuation = finalizeRuntimeGoalContinuationAfterRun({
    shouldEmitQueueClear,
    threadId: input.threadId,
    runGoalId: input.runGoalId,
    runGoalStartedAtMs: input.runGoalStartedAtMs,
    promptChars: input.promptChars,
    assistantChars: input.assistantChars,
    thinkingChars: input.thinkingChars,
    toolMessageCount: input.toolMessageCount,
    abortRequested: input.abortRequested,
    runStatus: runRecord?.status,
    runErrorMessage: runRecord?.errorMessage,
    hasPendingInternalFollowUp,
    hasQueuedUserInput,
    accountFinishedGoalRun: input.accountFinishedGoalRun,
    scheduleGoalContinuation: input.scheduleGoalContinuation,
  });
  input.resolveActiveRunSettled();

  return {
    shouldEmitQueueClear,
    scheduledFollowUpCount: scheduledFollowUps.scheduledFollowUpCount,
    hasPendingInternalFollowUp,
    hasQueuedUserInput,
    projectSwitchPending: Boolean(pendingProjectSwitch),
    scheduledGoalContinuation: goalContinuation.scheduledGoalContinuation,
  };
}
