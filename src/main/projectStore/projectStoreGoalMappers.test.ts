import { describe, expect, it } from "vitest";
import {
  mapThreadGoalRow,
  normalizeThreadGoalStatus,
  type ThreadGoalRow,
} from "./projectStoreGoalMappers";

describe("project store goal mappers", () => {
  it("maps thread goal rows without store state", () => {
    const row: ThreadGoalRow = {
      thread_id: "thread-1",
      goal_id: "goal-1",
      objective: "Finish the plan",
      status: "active",
      token_budget: null,
      tokens_used: 42,
      time_used_seconds: 7,
      continuation_turns: 2,
      no_progress_turns: 0,
      provider_infra_failures: 3,
      status_reason: null,
      created_at: "2026-06-06T19:00:00.000Z",
      updated_at: "2026-06-06T19:01:00.000Z",
      completed_at: null,
      last_continued_at: "2026-06-06T19:02:00.000Z",
    };

    expect(mapThreadGoalRow(row)).toEqual({
      threadId: "thread-1",
      goalId: "goal-1",
      objective: "Finish the plan",
      status: "active",
      tokenBudget: undefined,
      tokensUsed: 42,
      timeUsedSeconds: 7,
      continuationTurns: 2,
      noProgressTurns: 0,
      providerInfraFailures: 3,
      statusReason: undefined,
      createdAt: "2026-06-06T19:00:00.000Z",
      updatedAt: "2026-06-06T19:01:00.000Z",
      completedAt: undefined,
      lastContinuedAt: "2026-06-06T19:02:00.000Z",
    });
  });

  it("keeps legacy unknown thread goal statuses paused", () => {
    expect(normalizeThreadGoalStatus("legacy")).toBe("paused");
    expect(normalizeThreadGoalStatus("provider_unavailable")).toBe("provider_unavailable");
  });
});
