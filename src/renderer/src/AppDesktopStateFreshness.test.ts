import { describe, expect, it } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ThreadGoal } from "../../shared/threadTypes";
import {
  desktopStateCommitDecision,
  desktopStateForFullSnapshotCommit,
  desktopStateFreshnessDecision,
  desktopStateRevision,
  desktopStateWithoutClearedGoal,
  threadGoalKey,
} from "./AppDesktopStateFreshness";

describe("App desktop state freshness", () => {
  it("accepts unversioned and newer snapshots while rejecting older snapshots", () => {
    expect(desktopStateRevision({ stateRevision: 4 } as DesktopState)).toBe(4);
    expect(desktopStateFreshnessDecision(undefined, { stateRevision: 2 } as DesktopState)).toEqual({
      apply: true,
      latestRevision: 2,
    });
    expect(desktopStateFreshnessDecision(4, {} as DesktopState)).toEqual({
      apply: true,
      latestRevision: 4,
    });
    expect(desktopStateFreshnessDecision(4, { stateRevision: 3 } as DesktopState)).toEqual({
      apply: false,
      latestRevision: 4,
    });
    expect(desktopStateFreshnessDecision(4, { stateRevision: 5 } as DesktopState)).toEqual({
      apply: true,
      latestRevision: 5,
    });
  });

  it("removes locally cleared active goals from delayed full-state snapshots", () => {
    const goal = threadGoal({ threadId: "thread-1", goalId: "goal-1" });
    const state = { activeThreadGoal: goal } as DesktopState;
    const cleared = new Set([threadGoalKey(goal)]);

    expect(desktopStateWithoutClearedGoal(state, cleared)).toEqual({
      activeThreadGoal: undefined,
    });
    expect(desktopStateWithoutClearedGoal(state, new Set())).toBe(state);
  });

  it("rechecks delayed full-state snapshots at commit time", () => {
    const goal = threadGoal({ threadId: "thread-1", goalId: "goal-1" });
    const cleared = new Set([threadGoalKey(goal)]);

    expect(desktopStateCommitDecision(4, { stateRevision: 3 } as DesktopState, cleared)).toEqual({
      apply: false,
      state: { stateRevision: 3 },
    });
    expect(
      desktopStateCommitDecision(4, { stateRevision: 4, activeThreadGoal: goal } as DesktopState, cleared),
    ).toEqual({
      apply: true,
      state: { stateRevision: 4, activeThreadGoal: undefined },
    });
    expect(
      desktopStateCommitDecision(
        4,
        { stateRevision: 4, activeThreadGoal: goal } as DesktopState,
        new Set(),
      ).apply,
    ).toBe(true);
  });

  it("preserves live incremental thread fields when committing a full snapshot", () => {
    const snapshot = desktopState({
      activeThreadId: "thread-1",
      activeWorkspacePath: "/repo",
      messages: [{ id: "assistant-1", content: "old" }],
    });
    const current = desktopState({
      activeThreadId: "thread-1",
      activeWorkspacePath: "/repo",
      messages: [
        { id: "assistant-1", content: "live" },
        { id: "deleted-tail", content: "deleted" },
      ],
    });

    expect(desktopStateForFullSnapshotCommit(snapshot, current).messages).toEqual([
      { id: "assistant-1", content: "live" },
    ]);
    expect(desktopStateForFullSnapshotCommit(
      snapshot,
      desktopState({ activeThreadId: "other", activeWorkspacePath: "/repo", messages: [] }),
    )).toBe(snapshot);
  });
});

function desktopState({
  activeThreadId,
  activeWorkspacePath,
  messages,
}: {
  activeThreadId: string;
  activeWorkspacePath: string;
  messages: Array<{ id: string; content: string }>;
}): DesktopState {
  return {
    activeThreadId,
    activeWorkspace: { path: activeWorkspacePath },
    callableWorkflowTasks: [],
    messages,
    plannerPlanArtifacts: [],
    subagentMailboxEvents: [],
    subagentParentMailboxEvents: [],
    subagentRunEvents: [],
    subagentRuns: [],
    subagentToolScopeSnapshots: [],
    subagentWaitBarriers: [],
  } as unknown as DesktopState;
}

function threadGoal(input: Pick<ThreadGoal, "threadId" | "goalId">): ThreadGoal {
  return {
    ...input,
    objective: "Finish",
    status: "complete",
    tokensUsed: 0,
    timeUsedSeconds: 0,
    continuationTurns: 0,
    noProgressTurns: 0,
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z",
  };
}
