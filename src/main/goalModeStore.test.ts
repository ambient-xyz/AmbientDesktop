import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore";

async function withStore<T>(callback: (store: ProjectStore, threadId: string) => Promise<T> | T): Promise<T> {
  const workspacePath = await mkdtemp(join(tmpdir(), "ambient-goal-store-"));
  const store = new ProjectStore();
  try {
    store.openWorkspace(workspacePath);
    const thread = store.createThread("goal mode");
    return await callback(store, thread.id);
  } finally {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  }
}

describe("ProjectStore thread goals", () => {
  it("creates, updates, clears, and protects per-thread goal state", async () => {
    await withStore((store, threadId) => {
      const created = store.createThreadGoalIfAbsent({
        threadId,
        objective: "Ship goal mode",
        tokenBudget: 1000,
      });

      expect(created).toMatchObject({
        threadId,
        objective: "Ship goal mode",
        status: "active",
        tokenBudget: 1000,
        tokensUsed: 0,
        continuationTurns: 0,
        noProgressTurns: 0,
      });

      expect(() => store.createThreadGoalIfAbsent({ threadId, objective: "Duplicate goal" })).toThrow(
        "Thread already has a goal.",
      );

      const paused = store.markThreadGoalStatus(threadId, "paused", {
        expectedGoalId: created.goalId,
        statusReason: "User paused.",
      });
      expect(paused).toMatchObject({
        goalId: created.goalId,
        status: "paused",
        statusReason: "User paused.",
      });
      store.accountThreadGoalUsage({
        threadId,
        goalId: created.goalId,
        noProgressTurnDelta: 4,
      });

      expect(() => {
        store.setThreadGoal({
          threadId,
          expectedGoalId: "stale-goal-id",
          status: "active",
        });
      }).toThrow("Thread goal changed before this update could be applied.");

      const resumed = store.setThreadGoal({
        threadId,
        expectedGoalId: created.goalId,
        status: "active",
      });
      expect(resumed.status).toBe("active");
      expect(resumed.statusReason).toBeUndefined();
      expect(resumed.noProgressTurns).toBe(0);

      const cleared = store.clearThreadGoal(threadId, created.goalId);
      expect(cleared?.goalId).toBe(created.goalId);
      expect(store.getThreadGoal(threadId)).toBeUndefined();
    });
  });

  it("accounts usage and budget-limits active goals without losing the objective", async () => {
    await withStore((store, threadId) => {
      const created = store.createThreadGoalIfAbsent({
        threadId,
        objective: "Finish within budget",
        tokenBudget: 12,
      });

      const partial = store.accountThreadGoalUsage({
        threadId,
        goalId: created.goalId,
        tokensUsedDelta: 7,
        timeUsedSecondsDelta: 3,
        continuationTurnDelta: 1,
      });
      expect(partial).toMatchObject({
        status: "active",
        tokensUsed: 7,
        timeUsedSeconds: 3,
        continuationTurns: 1,
      });
      expect(partial?.lastContinuedAt).toBeDefined();

      const limited = store.accountThreadGoalUsage({
        threadId,
        goalId: created.goalId,
        tokensUsedDelta: 5,
        noProgressTurnDelta: 1,
      });
      expect(limited).toMatchObject({
        objective: "Finish within budget",
        status: "budget_limited",
        tokensUsed: 12,
        noProgressTurns: 1,
        statusReason: "Goal token budget reached.",
      });
    });
  });
});
