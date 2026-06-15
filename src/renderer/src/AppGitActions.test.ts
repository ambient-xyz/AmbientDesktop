import { describe, expect, it } from "vitest";

import type { WorkspaceGitStatus } from "../../shared/types";
import {
  gitSwitchBranchConfirmation,
  gitSwitchBranchNeedsConfirmation,
  gitThreadWorktreeConfirmation,
} from "./AppGitActions";

describe("App Git actions", () => {
  it("requires branch switch confirmation only when a different branch has local changes", () => {
    expect(gitSwitchBranchNeedsConfirmation(undefined, "feature")).toBe(false);
    expect(gitSwitchBranchNeedsConfirmation(gitStatus({ isGitRepository: false }), "feature")).toBe(false);
    expect(gitSwitchBranchNeedsConfirmation(gitStatus({ branch: "main", dirtyCount: 0 }), "feature")).toBe(false);
    expect(gitSwitchBranchNeedsConfirmation(gitStatus({ branch: "main", dirtyCount: 3 }), "main")).toBe(false);
    expect(gitSwitchBranchNeedsConfirmation(gitStatus({ branch: "main", dirtyCount: 3 }), "feature")).toBe(true);
  });

  it("keeps branch switch confirmation copy and details stable", () => {
    const confirmation = gitSwitchBranchConfirmation({
      branch: "feature/git",
      gitStatus: { branch: "main", dirtyCount: 2 },
      onConfirm: async () => undefined,
    });

    expect(confirmation).toMatchObject({
      title: "Switch branches with local changes?",
      message: "This switches the active worktree to another branch. Git may refuse if local changes conflict with the target branch.",
      details: ["Current branch: main", "Target branch: feature/git", "Local changes: 2"],
      confirmLabel: "Switch branch",
    });
  });

  it("keeps thread worktree confirmation copy and details stable", () => {
    const confirmation = gitThreadWorktreeConfirmation({
      activeWorkspacePath: "/repo/.worktrees/thread-1",
      workspacePath: "/repo",
      onConfirm: async () => undefined,
    });

    expect(confirmation).toMatchObject({
      title: "Create thread worktree?",
      message: "This creates an isolated branch and worktree for the current chat, then moves this thread's file, terminal, agent, and Git surfaces into that worktree.",
      details: ["Project root: /repo", "Current workspace: /repo/.worktrees/thread-1"],
      confirmLabel: "Create worktree",
    });
  });
});

function gitStatus(overrides: Partial<WorkspaceGitStatus>): WorkspaceGitStatus {
  return {
    branch: "main",
    branches: ["main"],
    dirtyCount: 0,
    isGitRepository: true,
    ...overrides,
  } as WorkspaceGitStatus;
}
