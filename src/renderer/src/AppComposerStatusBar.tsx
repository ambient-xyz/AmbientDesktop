import { Bot, ClipboardPaste, Shield, Zap } from "lucide-react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { CollaborationMode } from "../../shared/threadTypes";
import type { GitReviewSummary, WorkspaceGitStatus } from "../../shared/workspaceTypes";
import { GoalStatusControl } from "./AppGoalControls";
import { GitStatusControl, GitWorkModeControl } from "./AppGitControls";

export type AppComposerStatusBarProps = {
  activeGitReview?: GitReviewSummary;
  activeGitReviewError?: string;
  gitStatus?: WorkspaceGitStatus;
  gitStatusError?: string;
  activeThreadGoal?: DesktopState["activeThreadGoal"];
  collaborationMode: CollaborationMode;
  permissionMode: PermissionMode;
  goalMenuOpen: boolean;
  goalBusy: boolean;
  onCreateThreadWorktree: () => void;
  onAttachExistingWorktree: () => void;
  onOpenGitSummary: () => void;
  onSwitchBranch: (branch: string) => void;
  onCreateBranch: (branch: string) => Promise<void>;
  onToggleGoalMenu: () => void;
  onPauseResumeGoal: () => void;
  onEditGoalObjective: () => void;
  onSetGoalBudget: () => void;
  onClearGoal: () => void;
};

export function AppComposerStatusBar({
  activeGitReview,
  activeGitReviewError,
  gitStatus,
  gitStatusError,
  activeThreadGoal,
  collaborationMode,
  permissionMode,
  goalMenuOpen,
  goalBusy,
  onCreateThreadWorktree,
  onAttachExistingWorktree,
  onOpenGitSummary,
  onSwitchBranch,
  onCreateBranch,
  onToggleGoalMenu,
  onPauseResumeGoal,
  onEditGoalObjective,
  onSetGoalBudget,
  onClearGoal,
}: AppComposerStatusBarProps) {
  const plannerMode = collaborationMode === "planner";
  const fullAccessMode = permissionMode === "full-access";

  return (
    <footer className="statusbar">
      <GitWorkModeControl
        review={activeGitReview}
        error={activeGitReviewError}
        onCreateThreadWorktree={onCreateThreadWorktree}
        onAttachExistingWorktree={onAttachExistingWorktree}
        onOpenGitSummary={onOpenGitSummary}
      />
      <GitStatusControl gitStatus={gitStatus} error={gitStatusError} onSwitchBranch={onSwitchBranch} onCreateBranch={onCreateBranch} />
      {activeThreadGoal && (
        <GoalStatusControl
          goal={activeThreadGoal}
          menuOpen={goalMenuOpen}
          busy={goalBusy}
          onToggleMenu={onToggleGoalMenu}
          onPauseResume={onPauseResumeGoal}
          onEditObjective={onEditGoalObjective}
          onSetBudget={onSetGoalBudget}
          onClear={onClearGoal}
        />
      )}
      <span
        className="statusbar-chip"
        data-tooltip={
          plannerMode
            ? "Planner mode: Ambient drafts and revises a plan before applying changes."
            : "Agent mode: Ambient can work directly in this project."
        }
        aria-label={plannerMode ? "Planner mode" : "Agent mode"}
      >
        {plannerMode ? <ClipboardPaste size={13} aria-hidden="true" /> : <Bot size={13} aria-hidden="true" />}
        {plannerMode ? "Planner mode" : "Agent mode"}
      </span>
      <span
        className="statusbar-chip"
        data-tooltip={
          fullAccessMode
            ? "Full access: Ambient may request broader tool and filesystem access when needed."
            : "Workspace scope: file and shell work stays inside this project workspace."
        }
        aria-label={fullAccessMode ? "Full access" : "Workspace scope"}
      >
        {fullAccessMode ? <Zap size={13} aria-hidden="true" /> : <Shield size={13} aria-hidden="true" />}
        {fullAccessMode ? "Full access" : "Workspace scope"}
      </span>
    </footer>
  );
}
