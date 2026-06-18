import type { ThreadGoal } from "../../shared/threadTypes";
import type { PersistedRunStatus } from "./agentRuntimeProjectStoreFacade";

export type RuntimeGoalRunStatus = PersistedRunStatus;

export interface AccountFinishedGoalRunInput {
  threadId: string;
  goalId: string;
  startedAtMs: number;
  promptChars: number;
  assistantChars: number;
  thinkingChars: number;
  toolMessageCount: number;
  abortRequested: boolean;
  runStatus?: RuntimeGoalRunStatus | undefined;
  runErrorMessage?: string | undefined;
}

export interface RuntimeGoalContinuationAfterRunInput {
  shouldEmitQueueClear: boolean;
  threadId: string;
  runGoalId?: string | undefined;
  runGoalStartedAtMs: number;
  promptChars: number;
  assistantChars: number;
  thinkingChars: number;
  toolMessageCount: number;
  abortRequested: boolean;
  runStatus?: RuntimeGoalRunStatus | undefined;
  runErrorMessage?: string | undefined;
  hasPendingInternalFollowUp: boolean;
  hasQueuedUserInput: boolean;
  accountFinishedGoalRun: (input: AccountFinishedGoalRunInput) => ThreadGoal | undefined;
  scheduleGoalContinuation: (threadId: string, goalId: string, delayMs: number) => void;
}

export interface RuntimeGoalContinuationAfterRunResult {
  goalAfterRun?: ThreadGoal | undefined;
  scheduledGoalContinuation: boolean;
}

export function finalizeRuntimeGoalContinuationAfterRun(
  input: RuntimeGoalContinuationAfterRunInput,
): RuntimeGoalContinuationAfterRunResult {
  let goalAfterRun: ThreadGoal | undefined;
  if (input.shouldEmitQueueClear && input.runGoalId) {
    goalAfterRun = input.accountFinishedGoalRun({
      threadId: input.threadId,
      goalId: input.runGoalId,
      startedAtMs: input.runGoalStartedAtMs,
      promptChars: input.promptChars,
      assistantChars: input.assistantChars,
      thinkingChars: input.thinkingChars,
      toolMessageCount: input.toolMessageCount,
      abortRequested: input.abortRequested,
      runStatus: input.runStatus,
      runErrorMessage: input.runErrorMessage,
    });
  }

  const continuationGoal =
    input.shouldEmitQueueClear &&
    goalAfterRun?.status === "active" &&
    input.runStatus === "done" &&
    !input.abortRequested &&
    !input.hasQueuedUserInput &&
    !input.hasPendingInternalFollowUp
      ? goalAfterRun
      : undefined;

  if (continuationGoal) {
    input.scheduleGoalContinuation(input.threadId, continuationGoal.goalId, 0);
  }

  return {
    goalAfterRun,
    scheduledGoalContinuation: Boolean(continuationGoal),
  };
}
