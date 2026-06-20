import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent } from "../../shared/desktopTypes";
import { AgentRuntimeGoalContinuationController, type GoalContinuationSendInput } from "./agentRuntimeGoalContinuationController";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

async function withController<T>(
  callback: (input: {
    store: ProjectStore;
    controller: AgentRuntimeGoalContinuationController;
    threadId: string;
    send: ReturnType<typeof vi.fn<(input: GoalContinuationSendInput) => Promise<void>>>;
    events: DesktopEvent[];
  }) => Promise<T> | T,
): Promise<T> {
  const workspacePath = await mkdtemp(join(tmpdir(), "ambient-goal-continuation-"));
  const store = new ProjectStore();
  const events: DesktopEvent[] = [];
  const send = vi.fn<(input: GoalContinuationSendInput) => Promise<void>>();
  send.mockResolvedValue(undefined);
  try {
    store.openWorkspace(workspacePath);
    const thread = store.createThread("goal continuation");
    const controller = new AgentRuntimeGoalContinuationController({
      store,
      hasActiveRun: () => false,
      send,
      emit: (event) => events.push(event),
    });
    return await callback({ store, controller, threadId: thread.id, send, events });
  } finally {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  }
}

describe("AgentRuntimeGoalContinuationController", () => {
  it("continues active agent-mode goals with a hidden internal follow-up", async () => {
    await withController(async ({ store, controller, threadId, send, events }) => {
      const goal = store.createThreadGoalIfAbsent({ threadId, objective: "Keep working" });

      await controller.maybeContinueGoalIfIdle(threadId, goal.goalId);

      const updated = store.getThreadGoal(threadId);
      expect(updated).toMatchObject({
        goalId: goal.goalId,
        status: "active",
        continuationTurns: 1,
      });
      expect(updated?.lastContinuedAt).toBeDefined();
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "thread-goal-updated", goal: expect.objectContaining({ goalId: goal.goalId }) }),
        expect.objectContaining({
          type: "runtime-activity",
          activity: expect.objectContaining({ kind: "goal", status: "continuing", goalId: goal.goalId }),
        }),
      ]));
      expect(send).toHaveBeenCalledWith(expect.objectContaining({
        threadId,
        hiddenUserMessage: true,
        internal: true,
        delivery: "follow-up",
        preserveActiveThread: true,
        collaborationMode: "agent",
        goalContinuation: { goalId: goal.goalId },
      }));
    });
  });

  it("schedules a continuation after a manual resume clears stale no-progress turns", async () => {
    vi.useFakeTimers();
    try {
      await withController(async ({ store, controller, threadId, send }) => {
        const goal = store.createThreadGoalIfAbsent({ threadId, objective: "Keep working after resume" });
        store.accountThreadGoalUsage({ threadId, goalId: goal.goalId, noProgressTurnDelta: 3 });
        store.markThreadGoalStatus(threadId, "paused", {
          expectedGoalId: goal.goalId,
          statusReason: "Paused after 3 no-progress turns.",
        });
        const resumed = store.setThreadGoal({
          threadId,
          expectedGoalId: goal.goalId,
          status: "active",
        });
        expect(resumed).toMatchObject({
          status: "active",
          noProgressTurns: 0,
        });

        controller.continueGoalIfIdle(threadId, goal.goalId);
        await vi.runAllTimersAsync();

        expect(store.getThreadGoal(threadId)).toMatchObject({
          status: "active",
          continuationTurns: 1,
        });
        expect(send).toHaveBeenCalledWith(expect.objectContaining({
          threadId,
          hiddenUserMessage: true,
          internal: true,
          delivery: "follow-up",
          preserveActiveThread: true,
          collaborationMode: "agent",
          goalContinuation: { goalId: goal.goalId },
        }));
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses active goals when the goal run ends in an error", async () => {
    await withController(async ({ store, controller, threadId }) => {
      const goal = store.createThreadGoalIfAbsent({ threadId, objective: "Keep working through failures" });

      const updated = controller.accountFinishedGoalRun({
        threadId,
        goalId: goal.goalId,
        startedAtMs: Date.now() - 1_000,
        promptChars: 80,
        assistantChars: 0,
        thinkingChars: 0,
        toolMessageCount: 0,
        abortRequested: false,
        runStatus: "error",
        runErrorMessage: "Ambient/Pi stream stalled after 30000ms without stream activity.",
      });

      expect(updated).toMatchObject({
        goalId: goal.goalId,
        status: "paused",
        statusReason: "Paused because the goal run failed: Ambient/Pi stream stalled after 30000ms without stream activity.",
      });
      expect(store.getThreadGoal(threadId)).toMatchObject({
        status: "paused",
      });
    });
  });

  it("clears completed goals only after adding final run accounting", async () => {
    await withController(async ({ store, controller, threadId }) => {
      const goal = store.createThreadGoalIfAbsent({ threadId, objective: "Finish with accounting" });
      store.markThreadGoalStatus(threadId, "complete", {
        expectedGoalId: goal.goalId,
        statusReason: "Marked complete by Ambient/Pi after completion audit.",
      });
      const now = vi.spyOn(Date, "now").mockReturnValue(2_000);

      const finalized = (() => {
        try {
          return controller.accountFinishedGoalRun({
            threadId,
            goalId: goal.goalId,
            startedAtMs: 1_000,
            promptChars: 120,
            assistantChars: 280,
            thinkingChars: 0,
            toolMessageCount: 1,
            abortRequested: false,
            runStatus: "done",
          });
        } finally {
          now.mockRestore();
        }
      })();

      expect(finalized).toMatchObject({
        goalId: goal.goalId,
        status: "complete",
        tokensUsed: 100,
        timeUsedSeconds: 1,
      });
      expect(store.getThreadGoal(threadId)).toBeUndefined();
      expect(store.listMessages(threadId).at(-1)).toMatchObject({
        role: "assistant",
        content: "Goal completed and cleared.\n\nFinal usage estimate: 100 tokens, 1 second.",
        metadata: expect.objectContaining({
          kind: "goal-completion",
          goalId: goal.goalId,
          tokensUsed: 100,
          timeUsedSeconds: 1,
        }),
      });
    });
  });

  it("does not continue goals in planner mode", async () => {
    await withController(async ({ store, controller, threadId, send }) => {
      const goal = store.createThreadGoalIfAbsent({ threadId, objective: "Planner should not continue" });
      store.updateThreadSettings(threadId, { collaborationMode: "planner" });

      await controller.maybeContinueGoalIfIdle(threadId, goal.goalId);

      expect(store.getThreadGoal(threadId)).toMatchObject({
        status: "active",
        continuationTurns: 0,
      });
      expect(send).not.toHaveBeenCalled();
    });
  });

  it("stops continuation at budget, usage, and no-progress limits", async () => {
    await withController(async ({ store, controller, threadId, send }) => {
      const budgetGoal = store.createThreadGoalIfAbsent({
        threadId,
        objective: "Budget guard",
        tokenBudget: 10,
      });
      store.accountThreadGoalUsage({ threadId, goalId: budgetGoal.goalId, tokensUsedDelta: 10 });

      await controller.maybeContinueGoalIfIdle(threadId, budgetGoal.goalId);
      expect(store.getThreadGoal(threadId)).toMatchObject({
        status: "budget_limited",
        statusReason: "Goal token budget reached.",
      });

      const clearedBudgetGoal = store.clearThreadGoal(threadId, budgetGoal.goalId);
      expect(clearedBudgetGoal).toBeDefined();
      const usageGoal = store.createThreadGoalIfAbsent({ threadId, objective: "Usage guard" });
      store.accountThreadGoalUsage({ threadId, goalId: usageGoal.goalId, continuationTurnDelta: 8 });

      await controller.maybeContinueGoalIfIdle(threadId, usageGoal.goalId);
      expect(store.getThreadGoal(threadId)).toMatchObject({
        status: "usage_limited",
        statusReason: "Paused after 8 automatic continuation turns.",
      });

      const clearedUsageGoal = store.clearThreadGoal(threadId, usageGoal.goalId);
      expect(clearedUsageGoal).toBeDefined();
      const noProgressGoal = store.createThreadGoalIfAbsent({ threadId, objective: "No-progress guard" });
      store.accountThreadGoalUsage({ threadId, goalId: noProgressGoal.goalId, noProgressTurnDelta: 3 });

      await controller.maybeContinueGoalIfIdle(threadId, noProgressGoal.goalId);
      expect(store.getThreadGoal(threadId)).toMatchObject({
        status: "paused",
        statusReason: "Paused after 3 no-progress turns.",
      });
      expect(send).not.toHaveBeenCalled();
    });
  });
});
