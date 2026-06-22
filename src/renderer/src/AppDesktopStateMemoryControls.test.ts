import { describe, expect, it } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ThreadGoal } from "../../shared/threadTypes";
import { createAppDesktopStateMemoryControls } from "./AppDesktopStateMemoryControls";
import type { AppDesktopStateMemoryControlsOptions } from "./AppDesktopStateMemoryControls";

describe("AppDesktopStateMemoryControls", () => {
  it("records locally cleared goals and remembers fresh desktop state refs", () => {
    const refs = refsStub();
    const controls = createAppDesktopStateMemoryControls(refs);

    controls.rememberClearedGoal("thread-1", "goal-1");
    controls.rememberClearedGoal("thread-2", undefined);
    const state = desktopState({
      activeThreadId: "thread-1",
      activeWorkspacePath: "/workspace/.ambient/tasks/task-1",
      stateRevision: 2,
      goal: threadGoal({ threadId: "thread-1", goalId: "goal-1" }),
      threadWorkspacePath: "/workspace/.ambient/tasks/task-1",
    });

    const remembered = controls.rememberDesktopState(state);

    expect(refs.clearedGoalKeysRef.current).toEqual(new Set(["thread-1:goal-1"]));
    expect(remembered).toMatchObject({
      activeThreadGoal: undefined,
      stateRevision: 2,
    });
    expect(refs.latestDesktopStateRevisionRef.current).toBe(2);
    expect(refs.activeThreadIdRef.current).toBe("thread-1");
    expect(refs.activeProjectRootRef.current).toBe("/workspace");
    expect(refs.workspaceProjectAliasesRef.current).toMatchObject({
      "/workspace": "/workspace",
      "/workspace/.ambient/tasks/task-1": "/workspace",
    });
  });

  it("rejects stale remembered desktop state without changing active refs", () => {
    const refs = refsStub({ latestRevision: 5 });
    refs.activeThreadIdRef.current = "thread-current";
    refs.activeProjectRootRef.current = "/current";
    const controls = createAppDesktopStateMemoryControls(refs);

    const remembered = controls.rememberDesktopState(
      desktopState({
        activeThreadId: "thread-stale",
        activeWorkspacePath: "/stale",
        stateRevision: 4,
      }),
    );

    expect(remembered).toBe(false);
    expect(refs.latestDesktopStateRevisionRef.current).toBe(5);
    expect(refs.activeThreadIdRef.current).toBe("thread-current");
    expect(refs.activeProjectRootRef.current).toBe("/current");
  });

  it("preserves committed-state ref updates even when the committed snapshot is stale", () => {
    const refs = refsStub({ latestRevision: 5 });
    const controls = createAppDesktopStateMemoryControls(refs);

    controls.rememberCommittedDesktopState(
      desktopState({
        activeThreadId: "thread-stale",
        activeWorkspacePath: "/stale",
        stateRevision: 4,
      }),
    );

    expect(refs.latestDesktopStateRevisionRef.current).toBe(5);
    expect(refs.activeThreadIdRef.current).toBe("thread-stale");
    expect(refs.activeProjectRootRef.current).toBe("/workspace");
  });
});

function refsStub({ latestRevision }: { latestRevision?: number } = {}): AppDesktopStateMemoryControlsOptions {
  return {
    activeProjectRootRef: { current: undefined },
    activeThreadIdRef: { current: undefined },
    clearedGoalKeysRef: { current: new Set<string>() },
    latestDesktopStateRevisionRef: { current: latestRevision },
    workspaceProjectAliasesRef: { current: {} },
  };
}

function desktopState({
  activeThreadId,
  activeWorkspacePath,
  goal,
  stateRevision,
  threadWorkspacePath = activeWorkspacePath,
}: {
  activeThreadId: string;
  activeWorkspacePath: string;
  goal?: ThreadGoal;
  stateRevision: number;
  threadWorkspacePath?: string;
}): DesktopState {
  return {
    activeThreadGoal: goal,
    activeThreadId,
    activeWorkspace: {
      path: activeWorkspacePath,
    },
    projects: [],
    stateRevision,
    threads: [
      {
        id: activeThreadId,
        workspacePath: threadWorkspacePath,
      },
    ],
    workspace: {
      path: "/workspace",
    },
  } as unknown as DesktopState;
}

function threadGoal(input: Pick<ThreadGoal, "threadId" | "goalId">): ThreadGoal {
  return {
    ...input,
    objective: "Ship",
    status: "active",
    tokensUsed: 0,
    timeUsedSeconds: 0,
    continuationTurns: 0,
    noProgressTurns: 0,
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
  };
}
