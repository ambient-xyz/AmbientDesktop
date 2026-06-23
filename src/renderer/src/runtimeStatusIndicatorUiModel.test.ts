import { describe, expect, it } from "vitest";

import type { RuntimeActivity, ThreadGoal } from "../../shared/threadTypes";
import {
  GOAL_CONTINUATION_START_GRACE_MS,
  pruneExpiredRuntimeStatusIndicators,
  RUNTIME_STATUS_FINISHED_VISIBLE_MS,
  runtimeStatusIndicatorsAfterGoalUpdated,
  runtimeStatusIndicatorsAfterRunStatus,
  runtimeStatusIndicatorsAfterRuntimeActivity,
  visibleRuntimeStatusIndicatorsForThread,
} from "./runtimeStatusIndicatorUiModel";

describe("runtime status indicators", () => {
  it("shows compaction while compacting and briefly after finish", () => {
    const started = runtimeStatusIndicatorsAfterRunStatus({}, {
      threadId: "thread-1",
      status: "compacting",
      now: 1_000,
    });

    expect(visibleRuntimeStatusIndicatorsForThread(started, "thread-1", undefined, 1_100)).toMatchObject([{
      kind: "compaction",
      phase: "running",
      title: "Compacting context",
    }]);

    const finished = runtimeStatusIndicatorsAfterRuntimeActivity(started, {
      threadId: "thread-1",
      kind: "compaction",
      status: "finished",
      reason: "threshold",
      aborted: false,
      willRetry: false,
    }, 2_000);

    expect(visibleRuntimeStatusIndicatorsForThread(finished, "thread-1", undefined, 2_100)).toMatchObject([{
      kind: "compaction",
      phase: "finished",
      tone: "success",
      title: "Context compacted",
    }]);
    expect(pruneExpiredRuntimeStatusIndicators(finished, 2_000 + RUNTIME_STATUS_FINISHED_VISIBLE_MS + 1)).toEqual({});
  });

  it("keeps a continuation visible across the idle event that can precede the internal run", () => {
    const continuingActivity: RuntimeActivity = {
      threadId: "thread-1",
      kind: "goal",
      status: "continuing",
      message: "Continuing goal...",
      goalId: "goal-1",
    };
    const scheduled = runtimeStatusIndicatorsAfterRuntimeActivity({}, continuingActivity, 1_000);
    const afterStaleIdle = runtimeStatusIndicatorsAfterRunStatus(scheduled, {
      threadId: "thread-1",
      status: "idle",
      now: 1_100,
    });

    expect(visibleRuntimeStatusIndicatorsForThread(afterStaleIdle, "thread-1", activeGoal(), 1_100)).toMatchObject([{
      kind: "goal-continuation",
      phase: "scheduled",
      title: "Continuing goal",
    }]);

    const running = runtimeStatusIndicatorsAfterRunStatus(afterStaleIdle, {
      threadId: "thread-1",
      status: "starting",
      now: 1_200,
    });
    const withTurns = runtimeStatusIndicatorsAfterGoalUpdated(running, activeGoal({ continuationTurns: 3 }), 1_250);
    const finished = runtimeStatusIndicatorsAfterRunStatus(withTurns, {
      threadId: "thread-1",
      status: "idle",
      now: 2_000,
    });

    expect(visibleRuntimeStatusIndicatorsForThread(finished, "thread-1", activeGoal({ continuationTurns: 3 }), 2_100)).toMatchObject([{
      kind: "goal-continuation",
      phase: "finished",
      continuationTurns: 3,
      title: "Continuation turn finished",
    }]);
  });

  it("drops a scheduled continuation when no internal run starts within the grace window", () => {
    const scheduled = runtimeStatusIndicatorsAfterRuntimeActivity({}, {
      threadId: "thread-1",
      kind: "goal",
      status: "continuing",
      message: "Continuing goal...",
      goalId: "goal-1",
    }, 1_000);

    expect(pruneExpiredRuntimeStatusIndicators(
      scheduled,
      1_000 + GOAL_CONTINUATION_START_GRACE_MS + 1,
    )).toEqual({});
  });

  it("shows stopped goal continuations as warnings instead of successful finishes", () => {
    const scheduled = runtimeStatusIndicatorsAfterRuntimeActivity({}, {
      threadId: "thread-1",
      kind: "goal",
      status: "continuing",
      message: "Continuing goal...",
      goalId: "goal-1",
    }, 1_000);
    const blocked = runtimeStatusIndicatorsAfterGoalUpdated(scheduled, activeGoal({
      status: "blocked",
      statusReason: "Needs user input.",
    }), 1_100);

    expect(visibleRuntimeStatusIndicatorsForThread(blocked, "thread-1", activeGoal({
      status: "blocked",
      statusReason: "Needs user input.",
    }), 1_100)).toMatchObject([{
      kind: "goal-continuation",
      phase: "finished",
      tone: "warning",
      title: "Goal blocked",
      message: "Needs user input.",
    }]);
  });
});

function activeGoal(input: Partial<ThreadGoal> = {}): ThreadGoal {
  return {
    threadId: "thread-1",
    goalId: "goal-1",
    objective: "Test durable goal",
    status: "active",
    tokensUsed: 0,
    timeUsedSeconds: 0,
    continuationTurns: 1,
    noProgressTurns: 0,
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    ...input,
  };
}
