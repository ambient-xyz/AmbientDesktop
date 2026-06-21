import { describe, expect, it } from "vitest";

import type { RuntimeActivity, ThreadGoal } from "../../shared/threadTypes";
import {
  GOAL_COMPLETION_CELEBRATION_MS,
  runtimeActivityVisibleForThreadGoal,
  threadGoalBudgetLabel,
  threadGoalStatusLabel,
  threadGoalTitle,
} from "./AppGoalControls";

describe("goal controls helpers", () => {
  it("keeps goal completion celebrations visible long enough to be noticed", () => {
    expect(GOAL_COMPLETION_CELEBRATION_MS).toBe(2200);
  });

  it("formats goal status, budget, and title labels", () => {
    const goal = threadGoal({
      objective: "Finish the simplification plan",
      status: "active",
      tokenBudget: 10000,
      tokensUsed: 2500,
      timeUsedSeconds: 61,
      statusReason: "Running.",
    });

    expect(threadGoalStatusLabel(goal)).toBe("Pursuing goal");
    expect(threadGoalBudgetLabel(goal)).toBe("7,500 left");
    expect(threadGoalTitle(goal)).toBe([
      "Finish the simplification plan",
      "Status: active",
      "Usage: 2,500 tokens, 61 seconds",
      "Budget: 10,000 tokens",
      "Running.",
    ].join("\n"));
    expect(threadGoalStatusLabel(threadGoal({ status: "provider_unavailable" }))).toBe("Provider unavailable");
  });

  it("keeps only active matching goal continuation activity visible", () => {
    const goal = threadGoal({ goalId: "goal-1", status: "active" });
    const pausedGoal = threadGoal({ goalId: "goal-1", status: "paused" });
    const continuing = goalActivity({ status: "continuing", goalId: "goal-1" });
    const otherGoal = goalActivity({ status: "continuing", goalId: "goal-2" });

    expect(runtimeActivityVisibleForThreadGoal(continuing, goal)).toBe(true);
    expect(runtimeActivityVisibleForThreadGoal(otherGoal, goal)).toBe(false);
    expect(runtimeActivityVisibleForThreadGoal(continuing, pausedGoal)).toBe(false);
    expect(runtimeActivityVisibleForThreadGoal(goalActivity({ status: "paused" }), pausedGoal)).toBe(true);
    expect(runtimeActivityVisibleForThreadGoal({ threadId: "thread-id", kind: "browser", status: "finished", message: "Ready" }, goal)).toBe(true);
  });
});

function threadGoal(input: Partial<ThreadGoal>): ThreadGoal {
  return {
    threadId: "thread-id",
    goalId: "goal-id",
    objective: "Keep going",
    status: "active",
    tokensUsed: 0,
    timeUsedSeconds: 0,
    continuationTurns: 0,
    noProgressTurns: 0,
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
    ...input,
  };
}

function goalActivity(input: Partial<Extract<RuntimeActivity, { kind: "goal" }>>): RuntimeActivity {
  return {
    threadId: "thread-id",
    kind: "goal",
    status: "continuing",
    message: "Continuing goal",
    ...input,
  };
}
