import type { Dispatch, SetStateAction } from "react";

import type { GitReviewSummary, WorkspaceGitStatus } from "../../shared/workspaceTypes";
import type { GitConfirmation } from "./RightPanel";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function gitSwitchBranchNeedsConfirmation(
  gitStatus: WorkspaceGitStatus | undefined,
  branch: string,
): boolean {
  return Boolean(gitStatus?.isGitRepository && branch !== gitStatus.branch && gitStatus.dirtyCount > 0);
}

export function gitSwitchBranchConfirmation({
  branch,
  gitStatus,
  onConfirm,
}: {
  branch: string;
  gitStatus: Pick<WorkspaceGitStatus, "branch" | "dirtyCount">;
  onConfirm: () => Promise<void>;
}): GitConfirmation {
  return {
    title: "Switch branches with local changes?",
    message: "This switches the active worktree to another branch. Git may refuse if local changes conflict with the target branch.",
    details: [`Current branch: ${gitStatus.branch}`, `Target branch: ${branch}`, `Local changes: ${gitStatus.dirtyCount}`],
    confirmLabel: "Switch branch",
    onConfirm,
  };
}

export function gitThreadWorktreeConfirmation({
  activeWorkspacePath,
  onConfirm,
  workspacePath,
}: {
  activeWorkspacePath: string;
  onConfirm: () => Promise<void>;
  workspacePath: string;
}): GitConfirmation {
  return {
    title: "Create thread worktree?",
    message: "This creates an isolated branch and worktree for the current chat, then moves this thread's file, terminal, agent, and Git surfaces into that worktree.",
    details: [`Project root: ${workspacePath}`, `Current workspace: ${activeWorkspacePath}`],
    confirmLabel: "Create worktree",
    onConfirm,
  };
}

export function createAppGitActions({
  activeWorkspacePath,
  gitStatus,
  setActiveGitReview,
  setActiveGitReviewError,
  setGitConfirmation,
  setGitStatus,
  setGitStatusError,
  setWorkspaceRevision,
  workspacePath,
}: {
  activeWorkspacePath: string | undefined;
  gitStatus: WorkspaceGitStatus | undefined;
  setActiveGitReview: Dispatch<SetStateAction<GitReviewSummary | undefined>>;
  setActiveGitReviewError: Dispatch<SetStateAction<string | undefined>>;
  setGitConfirmation: Dispatch<SetStateAction<GitConfirmation | undefined>>;
  setGitStatus: Dispatch<SetStateAction<WorkspaceGitStatus | undefined>>;
  setGitStatusError: Dispatch<SetStateAction<string | undefined>>;
  setWorkspaceRevision: Dispatch<SetStateAction<number>>;
  workspacePath: string | undefined;
}): {
  attachExistingWorktreeFromFooter: () => Promise<void>;
  createBranchFromFooter: (name: string) => Promise<void>;
  createThreadWorktreeFromFooter: () => void;
  switchBranch: (branch: string) => void;
} {
  async function performSwitchBranch(branch: string): Promise<void> {
    setGitStatusError(undefined);
    try {
      const next = await window.ambientDesktop.switchWorkspaceBranch(branch);
      setGitStatus(next);
      setWorkspaceRevision((revision) => revision + 1);
    } catch (error) {
      setGitStatusError(errorMessage(error));
    }
  }

  async function refreshGitSurfaces(nextReview?: GitReviewSummary): Promise<void> {
    if (nextReview) {
      setActiveGitReview(nextReview);
      setActiveGitReviewError(undefined);
    }
    setWorkspaceRevision((revision) => revision + 1);
    try {
      const nextStatus = await window.ambientDesktop.getWorkspaceGitStatus();
      setGitStatus(nextStatus);
      setGitStatusError(undefined);
    } catch (error) {
      setGitStatusError(errorMessage(error));
    }
  }

  function switchBranch(branch: string): void {
    const currentGitStatus = gitStatus;
    if (
      !currentGitStatus?.isGitRepository ||
      branch === currentGitStatus.branch ||
      currentGitStatus.dirtyCount === 0
    ) {
      void performSwitchBranch(branch);
      return;
    }

    setGitConfirmation(gitSwitchBranchConfirmation({
      branch,
      gitStatus: currentGitStatus,
      onConfirm: () => performSwitchBranch(branch),
    }));
  }

  async function createBranchFromFooter(name: string): Promise<void> {
    setGitStatusError(undefined);
    setActiveGitReviewError(undefined);
    try {
      const review = await window.ambientDesktop.gitCreateBranch({ name, checkout: true });
      await refreshGitSurfaces(review);
    } catch (error) {
      const message = errorMessage(error);
      setGitStatusError(message);
      throw error;
    }
  }

  function createThreadWorktreeFromFooter(): void {
    if (!workspacePath || !activeWorkspacePath) return;
    setGitConfirmation(gitThreadWorktreeConfirmation({
      activeWorkspacePath,
      workspacePath,
      onConfirm: async () => {
        try {
          const review = await window.ambientDesktop.gitCreateThreadWorktree();
          await refreshGitSurfaces(review);
        } catch (error) {
          setActiveGitReviewError(errorMessage(error));
        }
      },
    }));
  }

  async function attachExistingWorktreeFromFooter(): Promise<void> {
    setActiveGitReviewError(undefined);
    try {
      const review = await window.ambientDesktop.gitAttachExistingWorktree();
      if (review) await refreshGitSurfaces(review);
    } catch (error) {
      setActiveGitReviewError(errorMessage(error));
    }
  }

  return {
    attachExistingWorktreeFromFooter,
    createBranchFromFooter,
    createThreadWorktreeFromFooter,
    switchBranch,
  };
}
