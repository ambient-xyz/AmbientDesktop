import { useMemo } from "react";
import { Kanban, Pencil, RefreshCw, Trash2, X } from "lucide-react";

import type { ProjectBoardSummary, ProjectSummary } from "../../shared/projectBoardTypes";
import { ProjectBoardGitSyncControls } from "./ProjectBoardCollaborationViews";
import type { ProjectBoardWorkspaceGitControls } from "./ProjectBoardWorkspaceGitControls";
import {
  projectBoardEmptyMessage,
  projectBoardSourceChangeSummary,
  projectBoardSourceGroups,
  projectBoardStatusLabel,
} from "./projectBoardUiModel";
import { ProjectBoardSynthesisActivity } from "./ProjectBoardSynthesisViews";

export type ProjectBoardWorkspaceBusyState = {
  sourceBusy: boolean;
  sourceImpactBusy: boolean;
  kickoffDefaultsBusy: boolean;
  refineBusy: boolean;
  finalizeBusy: boolean;
  synthesisRetryBusy: boolean;
  synthesisDeferBusy: boolean;
  synthesisPauseBusy: boolean;
  revisionBusy: boolean;
  proposalApplyBusy: boolean;
};

export function projectBoardWorkspaceBuildBoardTitle(busy: boolean): string {
  return busy
    ? "Project board creation is already running. Watch the progress feed for source scan and card generation activity."
    : "Create a project board, start the charter workflow, scan project sources, and ask Ambient/Pi to propose draft cards.";
}

export function projectBoardWorkspaceResetBlockReason({
  sourceBusy,
  sourceImpactBusy,
  kickoffDefaultsBusy,
  refineBusy,
  finalizeBusy,
  synthesisRetryBusy,
  synthesisDeferBusy,
  synthesisPauseBusy,
  revisionBusy,
  proposalApplyBusy,
}: ProjectBoardWorkspaceBusyState): string | undefined {
  return sourceBusy
    ? "Wait for source refresh to finish before resetting the board."
    : sourceImpactBusy
      ? "Wait for source draft refresh to finish before resetting the board."
      : kickoffDefaultsBusy
        ? "Wait for Ambient/Pi kickoff defaults to finish before resetting the board."
        : refineBusy
          ? "Wait for the active Ambient/Pi board review or source elaboration to finish before resetting."
          : finalizeBusy
            ? "Wait for charter activation or revision apply to finish before resetting."
            : synthesisRetryBusy
              ? "Wait for the synthesis retry to finish before resetting."
              : synthesisDeferBusy
                ? "Wait for section deferral to finish before resetting."
                : synthesisPauseBusy
                  ? "Wait for the planning pause request to finish before resetting."
                  : revisionBusy
                    ? "Wait for the revision draft to finish starting before resetting."
                    : proposalApplyBusy
                      ? "Wait for proposal apply to finish before resetting."
                      : undefined;
}

export function projectBoardWorkspaceResetTitle({
  board,
  resetBoardDisabled,
  resetBoardBlockReason,
}: {
  board?: ProjectBoardSummary;
  resetBoardDisabled: boolean;
  resetBoardBlockReason?: string;
}): string {
  if (!board) return "No project board exists yet.";
  if (resetBoardDisabled) return resetBoardBlockReason ?? "Wait for the active board operation to finish before resetting.";
  return "Reset this project board after confirmation. Project files, threads, and Local Task history are preserved.";
}

export type ProjectBoardWorkspaceHeaderProps = ProjectBoardWorkspaceBusyState & {
  project: Pick<ProjectSummary, "name">;
  board?: ProjectBoardSummary;
  busy: boolean;
  gitControls?: ProjectBoardWorkspaceGitControls;
  onBuild: () => void;
  onReviseBoard: (boardId: string) => void;
  onRefreshSources: (boardId: string) => void;
  onResetBoard: () => void;
  onClose: () => void;
};

export function ProjectBoardWorkspaceHeader({
  project,
  board,
  busy,
  sourceBusy,
  sourceImpactBusy,
  kickoffDefaultsBusy,
  refineBusy,
  finalizeBusy,
  synthesisRetryBusy,
  synthesisDeferBusy,
  synthesisPauseBusy,
  revisionBusy,
  proposalApplyBusy,
  gitControls,
  onBuild,
  onReviseBoard,
  onRefreshSources,
  onResetBoard,
  onClose,
}: ProjectBoardWorkspaceHeaderProps) {
  const buildBoardTitle = projectBoardWorkspaceBuildBoardTitle(busy);
  const boardSourceGroups = useMemo(() => projectBoardSourceGroups(board?.sources ?? []), [board?.sources]);
  const boardSourceChangeSummary = useMemo(
    () => projectBoardSourceChangeSummary(boardSourceGroups, board?.events ?? []),
    [board?.events, boardSourceGroups],
  );
  const resetBoardBlockReason = projectBoardWorkspaceResetBlockReason({
    sourceBusy,
    sourceImpactBusy,
    kickoffDefaultsBusy,
    refineBusy,
    finalizeBusy,
    synthesisRetryBusy,
    synthesisDeferBusy,
    synthesisPauseBusy,
    revisionBusy,
    proposalApplyBusy,
  });
  const resetBoardDisabled = Boolean(board && resetBoardBlockReason);
  const resetBoardTitle = projectBoardWorkspaceResetTitle({
    board,
    resetBoardDisabled,
    resetBoardBlockReason,
  });

  return (
    <header className="project-board-header">
      <div className="project-board-title-block">
        <span className="project-board-kicker">Project board</span>
        <h2>{board?.title || `${project.name} board`}</h2>
        <p>{projectBoardEmptyMessage(board)}</p>
      </div>
      <div className="project-board-header-actions">
        <span className="project-board-status">{board ? projectBoardStatusLabel(board) : "No board"}</span>
        {board && (
          <>
            {gitControls && (
              <ProjectBoardGitSyncControls
                status={gitControls.projectBoardGitStatus}
                error={gitControls.projectBoardGitError}
                busy={gitControls.projectBoardGitBusy}
                projectionResolutionState={gitControls.projectionResolutionState}
                onAction={gitControls.runProjectBoardGitAction}
              />
            )}
            {board.status !== "draft" && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => onReviseBoard(board.id)}
                disabled={revisionBusy}
                title={revisionBusy ? "A draft charter revision is already starting." : "Start a draft charter revision using the current charter answers as the starting point."}
              >
                <Pencil size={14} className={revisionBusy ? "spin" : ""} />
                <span>{revisionBusy ? "Starting Revision" : "Revise Board"}</span>
              </button>
            )}
            <button
              type="button"
              className="secondary-button"
              onClick={() => onRefreshSources(board.id)}
              disabled={sourceBusy}
              title={sourceBusy ? "A source refresh is already scanning project material." : boardSourceChangeSummary.refreshTitle}
            >
              <RefreshCw size={14} className={sourceBusy ? "spin" : ""} />
              <span>{sourceBusy ? "Scanning" : "Refresh Sources"}</span>
            </button>
            <button
              type="button"
              className="secondary-button danger"
              onClick={onResetBoard}
              disabled={resetBoardDisabled}
              title={resetBoardTitle}
            >
              <Trash2 size={14} />
              <span>Reset Board</span>
            </button>
          </>
        )}
        {!board && (
          <button type="button" className="primary-button" onClick={onBuild} disabled={busy} title={buildBoardTitle}>
            <Kanban size={15} />
            <span>{busy ? "Building" : "Build Board"}</span>
          </button>
        )}
        <button type="button" className="icon-button" onClick={onClose} title="Close project board" aria-label="Close project board">
          <X size={16} />
        </button>
      </div>
    </header>
  );
}

export function ProjectBoardWorkspaceEmptyPanel({
  busy,
  onBuild,
}: {
  busy: boolean;
  onBuild: () => void;
}) {
  const buildBoardTitle = projectBoardWorkspaceBuildBoardTitle(busy);

  return (
    <div className="project-board-empty-panel">
      {busy && <ProjectBoardSynthesisActivity action="Creating project board and scanning sources" />}
      <Kanban size={28} />
      <h3>Build a board when the project is ready for formal execution.</h3>
      <p>
        The board starts with a kickoff charter. Later phases will scan threads and project markdown, ask targeted questions,
        and create executable cards only after the plan is clear.
      </p>
      <button type="button" className="primary-button" onClick={onBuild} disabled={busy} title={buildBoardTitle}>
        <Kanban size={15} />
        <span>{busy ? "Building" : "Build Board"}</span>
      </button>
    </div>
  );
}
