import { describe, expect, it, vi } from "vitest";

import type { ThreadGoal } from "../../shared/threadTypes";
import {
  finalizeRuntimeGoalContinuationAfterRun,
  type AccountFinishedGoalRunInput,
} from "./runtimeGoalContinuationAfterRun";

const activeGoal: ThreadGoal = {
  goalId: "goal-1",
  threadId: "thread-1",
  objective: "Simplify the runtime",
  status: "active",
  tokensUsed: 10,
  timeUsedSeconds: 20,
  continuationTurns: 1,
  noProgressTurns: 0,
  createdAt: "2026-06-15T00:00:00.000Z",
  updatedAt: "2026-06-15T00:00:01.000Z",
};

function baseInput(overrides: Partial<Parameters<typeof finalizeRuntimeGoalContinuationAfterRun>[0]> = {}) {
  return {
    shouldEmitQueueClear: true,
    threadId: "thread-1",
    runGoalId: "goal-1",
    runGoalStartedAtMs: 1000,
    promptChars: 120,
    assistantChars: 240,
    thinkingChars: 80,
    toolMessageCount: 2,
    abortRequested: false,
    runStatus: "done" as const,
    runErrorMessage: undefined,
    hasPendingInternalFollowUp: false,
    hasQueuedUserInput: false,
    accountFinishedGoalRun: vi.fn(() => activeGoal),
    scheduleGoalContinuation: vi.fn(),
    ...overrides,
  };
}

describe("finalizeRuntimeGoalContinuationAfterRun", () => {
  it("accounts the finished goal run and schedules continuation for an active successful goal", () => {
    const input = baseInput();
    const result = finalizeRuntimeGoalContinuationAfterRun(input);

    expect(input.accountFinishedGoalRun).toHaveBeenCalledWith({
      threadId: "thread-1",
      goalId: "goal-1",
      startedAtMs: 1000,
      promptChars: 120,
      assistantChars: 240,
      thinkingChars: 80,
      toolMessageCount: 2,
      abortRequested: false,
      runStatus: "done",
      runErrorMessage: undefined,
      providerInterruptionContinuationScheduled: undefined,
      internalFollowUpScheduled: undefined,
    } satisfies AccountFinishedGoalRunInput);
    expect(input.scheduleGoalContinuation).toHaveBeenCalledWith("thread-1", "goal-1", 0);
    expect(result).toEqual({
      goalAfterRun: activeGoal,
      scheduledGoalContinuation: true,
    });
  });

  it("does not account or schedule when queue clearing is suppressed", () => {
    const input = baseInput({ shouldEmitQueueClear: false });
    const result = finalizeRuntimeGoalContinuationAfterRun(input);

    expect(input.accountFinishedGoalRun).not.toHaveBeenCalled();
    expect(input.scheduleGoalContinuation).not.toHaveBeenCalled();
    expect(result).toEqual({
      goalAfterRun: undefined,
      scheduledGoalContinuation: false,
    });
  });

  it("accounts but does not schedule when user input or internal follow-ups are pending", () => {
    for (const blockers of [
      { hasQueuedUserInput: true, hasPendingInternalFollowUp: false },
      { hasQueuedUserInput: false, hasPendingInternalFollowUp: true },
    ]) {
      const input = baseInput(blockers);
      const result = finalizeRuntimeGoalContinuationAfterRun(input);

      expect(input.accountFinishedGoalRun).toHaveBeenCalledTimes(1);
      expect(input.scheduleGoalContinuation).not.toHaveBeenCalled();
      expect(result).toEqual({
        goalAfterRun: activeGoal,
        scheduledGoalContinuation: false,
      });
    }
  });

  it("accounts but does not schedule after aborted or failed runs", () => {
    for (const terminal of [
      { abortRequested: true, runStatus: "aborted" as const },
      { abortRequested: false, runStatus: "error" as const, runErrorMessage: "Provider failed." },
    ]) {
      const input = baseInput(terminal);
      const result = finalizeRuntimeGoalContinuationAfterRun(input);

      expect(input.accountFinishedGoalRun).toHaveBeenCalledTimes(1);
      expect(input.scheduleGoalContinuation).not.toHaveBeenCalled();
      expect(result.scheduledGoalContinuation).toBe(false);
    }
  });

  it("does not schedule when accounting returns no active goal", () => {
    const input = baseInput({ accountFinishedGoalRun: vi.fn(() => undefined) });
    const result = finalizeRuntimeGoalContinuationAfterRun(input);

    expect(input.scheduleGoalContinuation).not.toHaveBeenCalled();
    expect(result).toEqual({
      goalAfterRun: undefined,
      scheduledGoalContinuation: false,
    });
  });
});
