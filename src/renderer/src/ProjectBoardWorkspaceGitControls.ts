import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type {
  ProjectBoardCard,
  ProjectBoardGitProjectionResolution,
  ProjectBoardGitSyncStatus,
  ProjectBoardSummary,
} from "../../shared/projectBoardTypes";
import type { OrchestrationBoard } from "../../shared/workflowTypes";
import {
  type ProjectBoardCardClaimAction,
  type ProjectBoardProjectionReview,
  type ProjectBoardProjectionReviewResolutionMap,
  type ProjectBoardProjectionReviewResolutionState,
  projectBoardProjectionReview,
  projectBoardProjectionReviewResolutionState,
} from "./projectBoardCollaborationUiModel";
import {
  projectBoardProjectionResolutionLabel,
  projectBoardProjectionReviewActionLabel,
} from "./ProjectBoardCollaborationViews";

export type ProjectBoardGitBusyAction = "export" | "commit" | "push" | "pull" | "apply";

export interface ProjectBoardWorkspaceGitControlsInput {
  board?: ProjectBoardSummary;
  applyProjectBoardOrchestration: (board: OrchestrationBoard) => void;
  setProjectBoardOrchestrationError: (message: string | undefined) => void;
}

export interface ProjectBoardWorkspaceGitControls {
  projectBoardClaimBusy: string | undefined;
  projectBoardGitBusy: ProjectBoardGitBusyAction | undefined;
  projectBoardGitError: string | undefined;
  projectBoardGitStatus: ProjectBoardGitSyncStatus | undefined;
  projectBoardProjectionResolutions: ProjectBoardProjectionReviewResolutionMap;
  projectionResolutionState: ProjectBoardProjectionReviewResolutionState;
  runProjectBoardGitAction: (action: ProjectBoardGitBusyAction) => Promise<void>;
  setProjectBoardProjectionResolutions: Dispatch<SetStateAction<ProjectBoardProjectionReviewResolutionMap>>;
  updateProjectBoardGitClaim: (card: ProjectBoardCard, action: ProjectBoardCardClaimAction) => Promise<void>;
}

export interface ProjectBoardGitProjectionApplyInput {
  boardId: string;
  resolutions?: Array<{
    changeId: string;
    entityId?: string;
    resolution: Exclude<ProjectBoardGitProjectionResolution, "manual_resolution_required">;
  }>;
}

export function useProjectBoardWorkspaceGitControls({
  applyProjectBoardOrchestration,
  board,
  setProjectBoardOrchestrationError,
}: ProjectBoardWorkspaceGitControlsInput): ProjectBoardWorkspaceGitControls {
  const [projectBoardGitStatus, setProjectBoardGitStatus] = useState<ProjectBoardGitSyncStatus | undefined>();
  const [projectBoardGitBusy, setProjectBoardGitBusy] = useState<ProjectBoardGitBusyAction | undefined>();
  const [projectBoardGitError, setProjectBoardGitError] = useState<string | undefined>();
  const [projectBoardProjectionResolutions, setProjectBoardProjectionResolutions] =
    useState<ProjectBoardProjectionReviewResolutionMap>({});
  const [projectBoardClaimBusy, setProjectBoardClaimBusy] = useState<string | undefined>();
  const projectionReview = projectBoardProjectionReview(projectBoardGitStatus, projectBoardGitError);
  const projectionResolutionState = projectBoardProjectionReviewResolutionState(projectionReview, projectBoardProjectionResolutions);

  useEffect(() => {
    setProjectBoardProjectionResolutions({});
  }, [
    projectBoardGitStatus?.projection?.valid,
    projectBoardGitStatus?.projection?.ok,
    projectBoardGitStatus?.projection?.differenceCount,
    projectBoardGitStatus?.projection?.changes?.map((change) => change.id).join("|"),
  ]);

  useEffect(() => {
    if (!board) {
      setProjectBoardGitStatus(undefined);
      setProjectBoardGitError(undefined);
      return;
    }
    const visualGitStatus = import.meta.env.DEV
      ? (window as Window & { __ambientVisualProjectBoardGitStatus?: ProjectBoardGitSyncStatus }).__ambientVisualProjectBoardGitStatus
      : undefined;
    if (visualGitStatus?.boardId === board.id) {
      setProjectBoardGitError(undefined);
      setProjectBoardGitStatus(visualGitStatus);
      return;
    }
    let disposed = false;
    setProjectBoardGitError(undefined);
    void window.ambientDesktop
      .getProjectBoardGitSyncStatus({ boardId: board.id })
      .then((next) => {
        if (!disposed) setProjectBoardGitStatus(next);
      })
      .catch((error) => {
        if (!disposed) setProjectBoardGitError(errorMessage(error));
      });
    return () => {
      disposed = true;
    };
  }, [board?.id, board?.updatedAt]);

  async function runProjectBoardGitAction(action: ProjectBoardGitBusyAction) {
    if (!board) return;
    if (action === "apply") {
      const resolutionState = projectBoardProjectionReviewResolutionState(projectionReview, projectBoardProjectionResolutions);
      if (!resolutionState.canApply) {
        setProjectBoardGitError(resolutionState.applyTitle);
        return;
      }
      const confirmed = window.confirm(projectBoardGitApplyConfirmationText(board, projectionReview, resolutionState, projectBoardProjectionResolutions));
      if (!confirmed) return;
    }
    setProjectBoardGitBusy(action);
    setProjectBoardGitError(undefined);
    try {
      const input = projectBoardGitProjectionApplyInput(board.id, projectionReview, projectBoardProjectionResolutions);
      if (action === "apply") {
        await window.ambientDesktop.applyPulledProjectBoardGitProjection(input);
        setProjectBoardGitStatus(await window.ambientDesktop.getProjectBoardGitSyncStatus(input));
        setProjectBoardProjectionResolutions({});
      } else {
        const next =
          action === "export"
            ? await window.ambientDesktop.exportProjectBoardGitArtifacts(input)
            : action === "commit"
              ? await window.ambientDesktop.commitProjectBoardGitArtifacts(input)
              : action === "push"
                ? await window.ambientDesktop.pushProjectBoardGitArtifacts(input)
                : await window.ambientDesktop.pullProjectBoardGitArtifacts(input);
        setProjectBoardGitStatus(next);
      }
    } catch (error) {
      setProjectBoardGitError(errorMessage(error));
    } finally {
      setProjectBoardGitBusy(undefined);
    }
  }

  async function updateProjectBoardGitClaim(card: ProjectBoardCard, action: ProjectBoardCardClaimAction) {
    if (!board) return;
    const confirmation = projectBoardGitClaimConfirmationText(card, action);
    if (confirmation && !window.confirm(confirmation)) return;
    setProjectBoardClaimBusy(`${action}:${card.id}`);
    setProjectBoardGitError(undefined);
    setProjectBoardOrchestrationError(undefined);
    const input = { boardId: board.id, cardId: card.id };
    try {
      if (action === "claim") {
        await window.ambientDesktop.claimProjectBoardGitCard(input);
      } else if (action === "expire") {
        await window.ambientDesktop.expireProjectBoardGitCardClaim({
          ...input,
          reason: "Expired claim recorded from Ambient Desktop before reclaim.",
        });
      } else if (action === "resolve_conflict") {
        await window.ambientDesktop.resolveProjectBoardGitCardClaimConflicts({
          ...input,
          reason: "Resolved competing claim events from Ambient Desktop.",
        });
      } else {
        await window.ambientDesktop.releaseProjectBoardGitCardClaim({
          ...input,
          force: action === "force_release",
          reason: action === "force_release" ? "Force release requested from Ambient Desktop." : "Released from Ambient Desktop.",
        });
      }
      setProjectBoardGitStatus(await window.ambientDesktop.getProjectBoardGitSyncStatus({ boardId: board.id }));
      applyProjectBoardOrchestration(await window.ambientDesktop.listOrchestrationBoard());
    } catch (error) {
      setProjectBoardGitError(errorMessage(error));
    } finally {
      setProjectBoardClaimBusy(undefined);
    }
  }

  return {
    projectBoardClaimBusy,
    projectBoardGitBusy,
    projectBoardGitError,
    projectBoardGitStatus,
    projectBoardProjectionResolutions,
    projectionResolutionState,
    runProjectBoardGitAction,
    setProjectBoardProjectionResolutions,
    updateProjectBoardGitClaim,
  };
}

export function projectBoardGitProjectionApplyInput(
  boardId: string,
  review: ProjectBoardProjectionReview,
  resolutions: ProjectBoardProjectionReviewResolutionMap,
): ProjectBoardGitProjectionApplyInput {
  const resolutionInput = Object.entries(resolutions)
    .filter((entry): entry is [string, Exclude<ProjectBoardGitProjectionResolution, "manual_resolution_required">] =>
      entry[1] === "apply_pulled" || entry[1] === "keep_local" || entry[1] === "defer",
    )
    .map(([changeId, resolution]) => {
      const row = review.rows.find((candidate) => candidate.id === changeId);
      return { changeId, entityId: row?.entityId, resolution };
    });
  return { boardId, ...(resolutionInput.length ? { resolutions: resolutionInput } : {}) };
}

export function projectBoardGitApplyConfirmationText(
  board: Pick<ProjectBoardSummary, "title">,
  review: ProjectBoardProjectionReview,
  resolutionState: ProjectBoardProjectionReviewResolutionState,
  resolutions: ProjectBoardProjectionReviewResolutionMap,
): string {
  const resolutionLines = review.rows
    .filter((row) => row.conflict)
    .map((row) => {
      const resolution = resolutions[row.id];
      return `- ${row.label}: ${projectBoardProjectionResolutionLabel(resolution)}`;
    });
  return [
    "Apply the pulled .ambient/board projection to this local board?",
    "",
    resolutionLines.length > 0
      ? `This will apply non-conflicting pulled changes for ${board.title} and use your card decisions below for conflicts.`
      : `This will replace local board cards, sources, charter, events, and synthesis records with the validated Git projection for ${board.title}.`,
    review.summary,
    resolutionState.applyImpact,
    resolutionLines.length > 0 ? "Conflict resolutions:" : "",
    ...resolutionLines,
    review.rows.length > 0 ? "" : "",
    ...review.rows.slice(0, 8).map((row) => `- ${projectBoardProjectionReviewActionLabel(row.action)} ${row.label}: ${row.detail}`),
    review.overflowCount > 0 ? `- Plus ${review.overflowCount} more projection difference${review.overflowCount === 1 ? "" : "s"}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function projectBoardGitClaimConfirmationText(card: Pick<ProjectBoardCard, "title">, action: ProjectBoardCardClaimAction): string | undefined {
  if (action === "force_release") {
    return [
      `Force-release the Git claim for "${card.title}"?`,
      "",
      "This records an audit event and makes the card available to this desktop. Use it only when the current owner is stale, blocked, or has explicitly handed off the card.",
    ].join("\n");
  }
  if (action === "resolve_conflict") {
    return [
      `Resolve competing Git claims for "${card.title}"?`,
      "",
      "This records expiry audit events for later conflicting claim attempts. The earliest still-active claim remains the owner, and normal claim/release controls decide who proceeds after the conflict is cleared.",
    ].join("\n");
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
