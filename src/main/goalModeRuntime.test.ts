import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./projectStore";

async function withRuntime<T>(
  callback: (input: { store: ProjectStore; runtime: AgentRuntime; threadId: string }) => Promise<T> | T,
): Promise<T> {
  const workspacePath = await mkdtemp(join(tmpdir(), "ambient-goal-runtime-"));
  const store = new ProjectStore();
  try {
    store.openWorkspace(workspacePath);
    const thread = store.createThread("goal mode");
    const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: vi.fn(),
      denyThread: () => undefined,
    });
    return await callback({ store, runtime, threadId: thread.id });
  } finally {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  }
}

function registeredGoalTools(runtime: AgentRuntime, threadId: string): Map<string, any> {
  const tools = new Map<string, any>();
  (runtime as any).createGoalModeToolExtension(threadId)({
    registerTool: (tool: any) => tools.set(tool.name, tool),
    on: vi.fn(),
  });
  return tools;
}

describe("AgentRuntime goal mode tools", () => {
  it("registers get/create/update goal tools with validation", async () => {
    await withRuntime(async ({ store, runtime, threadId }) => {
      const tools = registeredGoalTools(runtime, threadId);

      expect([...tools.keys()]).toEqual(expect.arrayContaining(["get_goal", "create_goal", "update_goal"]));

      await expect(tools.get("get_goal").execute("get-goal", {})).resolves.toMatchObject({
        details: {
          runtime: "ambient-goal-mode",
          status: "complete",
          message: "No goal is currently active for this thread.",
        },
      });

      const created = await tools.get("create_goal").execute("create-goal", {
        objective: "Finish the implementation",
        token_budget: 250,
      });
      expect(created).toMatchObject({
        details: {
          runtime: "ambient-goal-mode",
          status: "complete",
          goal: {
            threadId,
            objective: "Finish the implementation",
            status: "active",
            tokenBudget: 250,
          },
          remainingTokenBudget: 250,
        },
      });

      await expect(tools.get("create_goal").execute("duplicate-goal", { objective: "Duplicate" })).resolves.toMatchObject({
        details: {
          status: "error",
        },
      });

      await expect(tools.get("update_goal").execute("bad-update", { status: "paused" })).resolves.toMatchObject({
        details: {
          status: "error",
          message: 'update_goal only accepts status "complete" or "blocked".',
        },
      });

      const completed = await tools.get("update_goal").execute("complete-goal", { status: "complete" });
      expect(completed).toMatchObject({
        details: {
          status: "complete",
          goal: {
            status: "complete",
            objective: "Finish the implementation",
          },
        },
      });
      expect(store.getThreadGoal(threadId)).toBeUndefined();
      expect(store.listMessages(threadId)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          content: "Goal completed and cleared.\n\nFinal usage estimate: 0 tokens, 0 seconds.",
          metadata: expect.objectContaining({
            runtime: "ambient-goal-mode",
            kind: "goal-completion",
            status: "done",
            objective: "Finish the implementation",
            tokensUsed: 0,
            timeUsedSeconds: 0,
          }),
        }),
      ]));
    });
  });

  it("omits create_goal from a run that already has an active thread goal", async () => {
    await withRuntime(async ({ store, runtime, threadId }) => {
      store.createThreadGoalIfAbsent({ threadId, objective: "Build the tic tac toe app" });
      const tools = registeredGoalTools(runtime, threadId);

      expect([...tools.keys()]).toEqual(["get_goal", "update_goal"]);
      await expect(tools.get("get_goal").execute("get-goal", {})).resolves.toMatchObject({
        details: {
          runtime: "ambient-goal-mode",
          status: "complete",
          goal: {
            threadId,
            objective: "Build the tic tac toe app",
            status: "active",
          },
        },
      });
    });
  });

  it("disables goal tools in planner mode", async () => {
    await withRuntime(async ({ store, runtime, threadId }) => {
      store.updateThreadSettings(threadId, { collaborationMode: "planner" });
      const tools = registeredGoalTools(runtime, threadId);

      await expect(tools.get("create_goal").execute("planner-create", { objective: "Plan first" })).resolves.toMatchObject({
        details: {
          status: "error",
          message: "Goal creation is disabled while Planner mode is active.",
        },
      });

      store.setThreadGoal({ threadId, objective: "Existing planner goal", status: "active" });
      await expect(tools.get("update_goal").execute("planner-update", { status: "complete" })).resolves.toMatchObject({
        details: {
          status: "error",
          message: "Goal updates are disabled while Planner mode is active.",
        },
      });
    });
  });
});

describe("AgentRuntime goal continuation guards", () => {
  it("continues active agent-mode goals with a hidden internal follow-up", async () => {
    await withRuntime(async ({ store, runtime, threadId }) => {
      const goal = store.createThreadGoalIfAbsent({ threadId, objective: "Keep working" });
      const send = vi.spyOn(runtime as any, "send").mockResolvedValue(undefined);

      await (runtime as any).maybeContinueGoalIfIdle(threadId, goal.goalId);

      const updated = store.getThreadGoal(threadId);
      expect(updated).toMatchObject({
        goalId: goal.goalId,
        status: "active",
        continuationTurns: 1,
      });
      expect(updated?.lastContinuedAt).toBeDefined();
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
      await withRuntime(async ({ store, runtime, threadId }) => {
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

        const send = vi.spyOn(runtime as any, "send").mockResolvedValue(undefined);
        runtime.continueGoalIfIdle(threadId, goal.goalId);
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
    await withRuntime(async ({ store, runtime, threadId }) => {
      const goal = store.createThreadGoalIfAbsent({ threadId, objective: "Keep working through failures" });

      const updated = (runtime as any).accountFinishedGoalRun({
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
    await withRuntime(async ({ store, runtime, threadId }) => {
      const goal = store.createThreadGoalIfAbsent({ threadId, objective: "Finish with accounting" });
      store.markThreadGoalStatus(threadId, "complete", {
        expectedGoalId: goal.goalId,
        statusReason: "Marked complete by Ambient/Pi after completion audit.",
      });
      const now = vi.spyOn(Date, "now").mockReturnValue(2_000);

      const finalized = (() => {
        try {
          return (runtime as any).accountFinishedGoalRun({
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
    await withRuntime(async ({ store, runtime, threadId }) => {
      const goal = store.createThreadGoalIfAbsent({ threadId, objective: "Planner should not continue" });
      store.updateThreadSettings(threadId, { collaborationMode: "planner" });
      const send = vi.spyOn(runtime as any, "send").mockResolvedValue(undefined);

      await (runtime as any).maybeContinueGoalIfIdle(threadId, goal.goalId);

      expect(store.getThreadGoal(threadId)).toMatchObject({
        status: "active",
        continuationTurns: 0,
      });
      expect(send).not.toHaveBeenCalled();
    });
  });

  it("stops continuation at budget, usage, and no-progress limits", async () => {
    await withRuntime(async ({ store, runtime, threadId }) => {
      const budgetGoal = store.createThreadGoalIfAbsent({
        threadId,
        objective: "Budget guard",
        tokenBudget: 10,
      });
      store.accountThreadGoalUsage({ threadId, goalId: budgetGoal.goalId, tokensUsedDelta: 10 });
      const send = vi.spyOn(runtime as any, "send").mockResolvedValue(undefined);

      await (runtime as any).maybeContinueGoalIfIdle(threadId, budgetGoal.goalId);
      expect(store.getThreadGoal(threadId)).toMatchObject({
        status: "budget_limited",
        statusReason: "Goal token budget reached.",
      });

      const clearedBudgetGoal = store.clearThreadGoal(threadId, budgetGoal.goalId);
      expect(clearedBudgetGoal).toBeDefined();
      const usageGoal = store.createThreadGoalIfAbsent({ threadId, objective: "Usage guard" });
      store.accountThreadGoalUsage({ threadId, goalId: usageGoal.goalId, continuationTurnDelta: 8 });

      await (runtime as any).maybeContinueGoalIfIdle(threadId, usageGoal.goalId);
      expect(store.getThreadGoal(threadId)).toMatchObject({
        status: "usage_limited",
        statusReason: "Paused after 8 automatic continuation turns.",
      });

      const clearedUsageGoal = store.clearThreadGoal(threadId, usageGoal.goalId);
      expect(clearedUsageGoal).toBeDefined();
      const noProgressGoal = store.createThreadGoalIfAbsent({ threadId, objective: "No-progress guard" });
      store.accountThreadGoalUsage({ threadId, goalId: noProgressGoal.goalId, noProgressTurnDelta: 3 });

      await (runtime as any).maybeContinueGoalIfIdle(threadId, noProgressGoal.goalId);
      expect(store.getThreadGoal(threadId)).toMatchObject({
        status: "paused",
        statusReason: "Paused after 3 no-progress turns.",
      });
      expect(send).not.toHaveBeenCalled();
    });
  });
});
