import { useEffect, useState } from "react";

import type { GitReviewFile, GitReviewSummary, GitSimpleAction } from "../../shared/workspaceTypes";
import type { GitConfirmation } from "./RightPanelDetailPanels";
import {
  formatGitSimpleAction,
  gitSimpleActionSuccessMessage,
} from "./RightPanelGitPane";
import { formatTimelineTime } from "./RightPanelSettingsRuntime";
import { gitPullRequestActionState } from "./gitUiModel";

type GitReviewTab = "summary" | "review";

export function useRightPanelGitController({
  panel,
  activeWorkspacePath,
  workspacePath,
  workspaceRevision,
  gitPanelTabRequest,
  onGitReviewChanged,
  onWorkspaceChanged,
}: {
  panel: string;
  activeWorkspacePath: string;
  workspacePath: string;
  workspaceRevision: number;
  gitPanelTabRequest: { tab: GitReviewTab; nonce: number };
  onGitReviewChanged: (review: GitReviewSummary | undefined) => void;
  onWorkspaceChanged: () => void;
}) {
  const [review, setReview] = useState<GitReviewSummary | undefined>();
  const [reviewError, setReviewError] = useState<string | undefined>();
  const [actionNotice, setActionNotice] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<GitReviewTab>("summary");
  const [commitMessage, setCommitMessage] = useState("");
  const [branchName, setBranchName] = useState("");
  const [busy, setBusy] = useState<string | undefined>();
  const [confirmation, setConfirmation] = useState<GitConfirmation | undefined>();
  const [unversionedAcknowledged, setUnversionedAcknowledged] = useState(false);
  const [sharedWorkspaceAcknowledged, setSharedWorkspaceAcknowledged] = useState(false);

  async function loadReview() {
    setReviewError(undefined);
    try {
      const nextReview = await window.ambientDesktop.getGitReview();
      setReview(nextReview);
      onGitReviewChanged(nextReview);
    } catch (error) {
      setReview(undefined);
      onGitReviewChanged(undefined);
      setReviewError(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshAfterAction(nextReview?: GitReviewSummary) {
    if (nextReview) {
      setReview(nextReview);
      onGitReviewChanged(nextReview);
    } else {
      await loadReview();
    }
    onWorkspaceChanged();
  }

  async function runReviewAction(label: string, action: () => Promise<GitReviewSummary | void>, successMessage?: string) {
    setBusy(label);
    setReviewError(undefined);
    setActionNotice(undefined);
    try {
      const nextReview = await action();
      await refreshAfterAction(nextReview || undefined);
      if (successMessage) setActionNotice(successMessage);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(undefined);
    }
  }

  function confirmAndRunReviewAction(
    input: Omit<GitConfirmation, "onConfirm">,
    label: string,
    action: () => Promise<GitReviewSummary | void>,
    successMessage?: string,
  ) {
    setConfirmation({
      ...input,
      onConfirm: () => runReviewAction(label, action, successMessage),
    });
  }

  async function runSimpleAction(action: GitSimpleAction) {
    if (action === "pull") {
      confirmAndRunReviewAction(
        {
          title: "Pull remote changes?",
          message: "This will update the current worktree with remote commits using a fast-forward pull.",
          details: review?.latestCheckpoint
            ? [`Checkpoint available: ${formatTimelineTime(review.latestCheckpoint.createdAt)} (${review.latestCheckpoint.reason})`]
            : ["A checkpoint will be attempted before pulling if this is a Git repository."],
          confirmLabel: "Pull",
        },
        formatGitSimpleAction(action),
        () => window.ambientDesktop.gitRunAction(action),
        "Pulled remote changes.",
      );
      return;
    }
    if (action === "restore-latest-checkpoint") {
      confirmAndRunReviewAction(
        {
          title: "Restore latest checkpoint?",
          message: "This restores the latest Ambient checkpoint by reapplying its staged, unstaged, and untracked snapshot where possible.",
          details: review?.latestCheckpoint
            ? [
                `Checkpoint: ${formatTimelineTime(review.latestCheckpoint.createdAt)}`,
                `Reason: ${review.latestCheckpoint.reason}`,
                `Workspace: ${review.latestCheckpoint.workspacePath}`,
              ]
            : ["No checkpoint is available."],
          confirmLabel: "Restore checkpoint",
          danger: true,
        },
        formatGitSimpleAction(action),
        () => window.ambientDesktop.gitRunAction(action),
        "Restored the latest checkpoint.",
      );
      return;
    }
    await runReviewAction(formatGitSimpleAction(action), () => window.ambientDesktop.gitRunAction(action), gitSimpleActionSuccessMessage(action));
  }

  function initializeRepository() {
    confirmAndRunReviewAction(
      {
        title: "Initialize Git repository?",
        message: "This creates a .git directory in the current workspace so Ambient can track, review, checkpoint, and commit changes.",
        details: [`Workspace: ${activeWorkspacePath}`],
        confirmLabel: "Initialize repository",
      },
      "initialize-repository",
      () => window.ambientDesktop.gitInitializeRepository(),
      "Initialized Git for this workspace.",
    );
  }

  function createThreadWorktree() {
    confirmAndRunReviewAction(
      {
        title: "Create thread worktree?",
        message: "This creates an isolated branch and worktree for the current chat, then moves this thread's file, terminal, agent, and Git surfaces into that worktree.",
        details: [`Project root: ${workspacePath}`, `Current workspace: ${activeWorkspacePath}`],
        confirmLabel: "Create worktree",
      },
      "create-thread-worktree",
      () => window.ambientDesktop.gitCreateThreadWorktree(),
      "Created a thread worktree for this chat.",
    );
  }

  async function attachExistingWorktree() {
    setBusy("attach-existing-worktree");
    setReviewError(undefined);
    setActionNotice(undefined);
    try {
      const nextReview = await window.ambientDesktop.gitAttachExistingWorktree();
      if (nextReview) {
        await refreshAfterAction(nextReview);
        setActionNotice("Attached existing worktree to this chat.");
      }
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(undefined);
    }
  }

  function discardFile(file: GitReviewFile) {
    const fileLabel = file.originalPath ? `${file.originalPath} -> ${file.path}` : file.path;
    confirmAndRunReviewAction(
      {
        title: file.untracked ? "Delete untracked file?" : "Discard file changes?",
        message: file.untracked
          ? "This deletes the untracked file or directory from the current worktree."
          : "This restores the file from Git and removes its current staged and unstaged changes.",
        details: [
          `File: ${fileLabel}`,
          review?.latestCheckpoint
            ? `Checkpoint available: ${formatTimelineTime(review.latestCheckpoint.createdAt)} (${review.latestCheckpoint.reason})`
            : "A checkpoint will be attempted before discarding.",
        ],
        confirmLabel: file.untracked ? "Delete file" : "Discard changes",
        danger: true,
      },
      `discard-${file.path}`,
      () => window.ambientDesktop.gitDiscardFile({ path: file.path }),
      file.untracked ? "Deleted untracked file." : "Discarded file changes.",
    );
  }

  async function openPullRequestUrl() {
    if (review) {
      const prState = gitPullRequestActionState({ review, busy: false });
      if (prState.disabled) {
        setReviewError(prState.reason);
        return;
      }
    }
    setBusy("create-pr");
    setReviewError(undefined);
    setActionNotice(undefined);
    try {
      const url = await window.ambientDesktop.createPullRequestUrl();
      if (!url) {
        setReviewError("No GitHub or GitLab remote URL is available for this branch.");
        return;
      }
      setActionNotice("Opened pull request creation in your browser.");
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(undefined);
    }
  }

  async function commitReview() {
    const message = commitMessage.trim();
    if (!message) return;
    await runReviewAction("commit", async () => {
      const nextReview = await window.ambientDesktop.gitCommit({ message });
      setCommitMessage("");
      return nextReview;
    }, "Committed staged changes.");
  }

  async function createBranchFromReview() {
    const name = branchName.trim();
    if (!name) return;
    await runReviewAction("create-branch", async () => {
      const nextReview = await window.ambientDesktop.gitCreateBranch({ name, checkout: true });
      setBranchName("");
      return nextReview;
    }, `Created and switched to ${name}.`);
  }

  function cancelConfirmation() {
    setConfirmation(undefined);
  }

  async function confirmConfirmation() {
    if (!confirmation) return;
    const action = confirmation.onConfirm;
    setConfirmation(undefined);
    await action();
  }

  useEffect(() => {
    if (panel === "diff") void loadReview();
  }, [panel, activeWorkspacePath, workspaceRevision]);

  useEffect(() => {
    if (panel === "diff") setActiveTab(gitPanelTabRequest.tab);
  }, [panel, gitPanelTabRequest.nonce, gitPanelTabRequest.tab]);

  useEffect(() => {
    setUnversionedAcknowledged(false);
    setSharedWorkspaceAcknowledged(false);
  }, [activeWorkspacePath]);

  return {
    review,
    reviewError,
    actionNotice,
    busy,
    activeTab,
    commitMessage,
    branchName,
    unversionedAcknowledged,
    sharedWorkspaceAcknowledged,
    confirmation,
    setActiveTab,
    setCommitMessage,
    setBranchName,
    loadReview,
    commitReview,
    createBranchFromReview,
    runSimpleAction,
    openPullRequestUrl,
    initializeRepository,
    createThreadWorktree,
    attachExistingWorktree,
    continueWithoutGit: () => setUnversionedAcknowledged(true),
    keepSharedWorkspace: () => setSharedWorkspaceAcknowledged(true),
    stageAll: () => runReviewAction("stage-all", () => window.ambientDesktop.gitStageAllFiles(), "Staged all changes."),
    unstageAll: () => runReviewAction("unstage-all", () => window.ambientDesktop.gitUnstageAllFiles(), "Unstaged all changes."),
    stage: (file: GitReviewFile) =>
      runReviewAction(`stage-${file.path}`, () => window.ambientDesktop.gitStageFile({ path: file.path }), file.conflicted ? "Marked file resolved." : "Staged file."),
    unstage: (file: GitReviewFile) =>
      runReviewAction(`unstage-${file.path}`, () => window.ambientDesktop.gitUnstageFile({ path: file.path }), "Unstaged file."),
    discardFile,
    cancelConfirmation,
    confirmConfirmation,
  };
}
