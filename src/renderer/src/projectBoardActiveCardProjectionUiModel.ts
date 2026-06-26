import type { ProjectBoardCard, ProjectBoardCardCandidateStatus, ProjectBoardCardStatus } from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import type { ProjectBoardDependencyReadinessState } from "./projectBoardDependencyUiModel";
import { projectBoardProofReviewStatusText, projectBoardReadableState } from "./projectBoardProofEvidenceUiModel";

type ProjectBoardExecutionColumnId = "blocked" | "ready" | "in_progress" | "review" | "done";

export type ProjectBoardCanonicalCardProjectionKind =
  | "draft"
  | "ready"
  | "in_progress"
  | "review"
  | "blocked"
  | "done"
  | "done_with_manual_evidence"
  | "done_after_stopped_run"
  | "covered_without_task"
  | "archived";

export interface ProjectBoardCanonicalCardProjection {
  kind: ProjectBoardCanonicalCardProjectionKind;
  visualStatus: ProjectBoardExecutionColumnId | "draft" | "archived";
  tone: ProjectBoardVisualTone;
  statusLabel: string;
  summary: string;
  runLabel?: string;
  proofLabel?: string;
  blockerLabel?: string;
  suppressRetryActions: boolean;
  suppressStaleRunState: boolean;
  suppressBlockers: boolean;
  terminalDone: boolean;
}

export type ProjectBoardVisualTone = "neutral" | "ready" | "running" | "review" | "blocked" | "done" | "draft" | "critical";

export function projectBoardCanonicalCardProjection(
  card: ProjectBoardCard,
  context: { task?: OrchestrationTask; latestRun?: OrchestrationRun; readinessState?: ProjectBoardDependencyReadinessState } = {},
): ProjectBoardCanonicalCardProjection {
  const latestRunStopped = Boolean(context.latestRun && ["failed", "canceled", "stalled"].includes(context.latestRun.status));
  const taskState = context.task?.state.trim().toLowerCase().replace(/\s+/g, "_");
  const proofDone = card.proofReview?.status === "done";
  const taskDone = taskState === "done";
  const cardDone = card.status === "done" || proofDone || taskDone;
  const coveredWithoutTask = !card.orchestrationTaskId && card.status === "draft" && card.candidateStatus === "evidence";
  const completedRunNeedsReview = context.latestRun?.status === "completed" && !cardDone;
  const pmReviewPending =
    !cardDone && (completedRunNeedsReview || taskState === "needs_review" || card.status === "review" || Boolean(card.proofReview));

  if (cardDone) {
    const acceptedWithEvidence = proofDone || card.proofReview?.recommendedAction === "close";
    const stoppedAccepted = acceptedWithEvidence && latestRunStopped;
    const statusLabel = stoppedAccepted ? "Done: accepted with evidence" : acceptedWithEvidence ? "Done with evidence" : "Done";
    return {
      kind: stoppedAccepted ? "done_after_stopped_run" : acceptedWithEvidence ? "done_with_manual_evidence" : "done",
      visualStatus: "done",
      tone: "done",
      statusLabel,
      summary: stoppedAccepted
        ? "Accepted with evidence after a stopped run. The historical run remains available for audit, but it no longer makes this card look failed, blocked, or retryable."
        : acceptedWithEvidence
          ? "Accepted with evidence by PM decision. Historical run state is audit-only for this card."
          : "Card is marked Done; no active card work remains.",
      runLabel: context.latestRun ? (stoppedAccepted ? "Historical stopped run accepted" : "Historical run accepted") : "No active run",
      proofLabel: acceptedWithEvidence ? "Accepted with evidence" : "Done",
      blockerLabel: "No active blockers",
      suppressRetryActions: true,
      suppressStaleRunState: true,
      suppressBlockers: true,
      terminalDone: true,
    };
  }

  if (pmReviewPending) {
    const proofLabel = card.proofReview ? projectBoardProofReviewStatusText(card.proofReview.status) : "Needs PM review";
    return {
      kind: "review",
      visualStatus: "review",
      tone: "review",
      statusLabel: "Review",
      summary: completedRunNeedsReview
        ? "The latest run completed with reviewable proof. PM must accept, retry, or block the card before it can close."
        : "Card is waiting for PM review before it can close or retry.",
      runLabel: context.latestRun ? `Run ${projectBoardReadableState(context.latestRun.status)}` : undefined,
      proofLabel,
      suppressRetryActions: false,
      suppressStaleRunState: completedRunNeedsReview,
      suppressBlockers: false,
      terminalDone: false,
    };
  }

  if (coveredWithoutTask) {
    return {
      kind: "covered_without_task",
      visualStatus: "draft",
      tone: "done",
      statusLabel: "Covered / Done",
      summary: "Marked covered in the Draft Inbox without creating a Local Task.",
      proofLabel: "Covered",
      suppressRetryActions: true,
      suppressStaleRunState: true,
      suppressBlockers: true,
      terminalDone: false,
    };
  }

  const visualStatus = card.status === "archived" ? "archived" : card.status;
  return {
    kind: visualStatus,
    visualStatus,
    tone: projectBoardCardStatusTone(card, context.readinessState),
    statusLabel: projectBoardCardStatusText(card.status, card.candidateStatus),
    summary: "Card follows its current board status.",
    suppressRetryActions: false,
    suppressStaleRunState: false,
    suppressBlockers: false,
    terminalDone: false,
  };
}

export function projectBoardCardVisualTone(
  card: ProjectBoardCard,
  readinessState?: ProjectBoardDependencyReadinessState,
): ProjectBoardVisualTone {
  const projection = projectBoardCanonicalCardProjection(card, { readinessState });
  if (projection.terminalDone || projection.kind === "covered_without_task") return projection.tone;
  return projectBoardCardStatusTone(card, readinessState);
}

function projectBoardCardStatusTone(card: ProjectBoardCard, readinessState?: ProjectBoardDependencyReadinessState): ProjectBoardVisualTone {
  if (
    readinessState === "cycle" ||
    readinessState === "blocked_issue" ||
    readinessState === "waiting_on_dependencies" ||
    readinessState === "needs_clarification"
  ) {
    return "blocked";
  }
  if (readinessState === "ready_now") return "ready";
  if (readinessState === "waiting_on_review" || card.status === "review") return "review";
  if (readinessState === "running" || card.status === "in_progress") return "running";
  if (readinessState === "done" || card.status === "done" || card.candidateStatus === "evidence") return "done";
  if (card.status === "blocked" || card.blockedBy.length > 0 || card.candidateStatus === "needs_clarification") return "blocked";
  if (card.status === "ready" || card.candidateStatus === "ready_to_create") return "ready";
  if (card.status === "draft") return "draft";
  return "neutral";
}

export function projectBoardHandoffFollowUpStatusLabel(card: ProjectBoardCard): string {
  if (card.candidateStatus === "ready_to_create") return "Ready to create";
  if (card.candidateStatus === "needs_clarification") return "Needs clarification";
  if (card.candidateStatus === "evidence") return "Covered / Done";
  if (card.candidateStatus === "duplicate") return "Duplicate";
  if (card.candidateStatus === "rejected") return "Rejected";
  return card.candidateStatus;
}

export function projectBoardCardStatusText(status: ProjectBoardCardStatus, candidateStatus: ProjectBoardCardCandidateStatus): string {
  if (status === "draft") return projectBoardHandoffFollowUpStatusLabel({ candidateStatus } as ProjectBoardCard);
  return projectBoardReadableState(status);
}
