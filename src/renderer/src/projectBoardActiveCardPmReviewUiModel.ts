import type {
  ProjectBoardCard,
  ProjectBoardExecutionArtifact,
  ProjectBoardPmReviewReport,
  ProjectBoardSummary,
} from "../../shared/projectBoardTypes";
import {
  projectBoardCardRefs,
  projectBoardDependentsByBlocker,
  projectBoardExecutionArtifactFailed,
  projectBoardExecutionArtifactNeedsAttention,
  projectBoardExecutionArtifactSatisfiesDependency,
  projectBoardExecutionArtifactStatus,
  projectBoardExecutionArtifactTime,
  projectBoardLatestExecutionArtifactByCard,
  projectBoardWouldBeReadyIfDependencySatisfied,
  sortProjectBoardCards,
} from "./projectBoardDependencyUiModel";
import { projectBoardHandoffFollowUpStatusLabel } from "./projectBoardActiveCardProjectionUiModel";
import { truncateProjectBoardLedgerText } from "./projectBoardProofEvidenceUiModel";

export type ProjectBoardExecutionPmImpactTone = "success" | "warning" | "danger" | "neutral";

export interface ProjectBoardExecutionPmImpact {
  artifact: ProjectBoardExecutionArtifact;
  card?: ProjectBoardCard;
  tone: ProjectBoardExecutionPmImpactTone;
  title: string;
  summary: string;
  action: string;
  unblocks: ProjectBoardCard[];
  newlyReadyUnblocks: ProjectBoardCard[];
}

export interface ProjectBoardPulledHandoffFollowUp {
  card: ProjectBoardCard;
  parentCard?: ProjectBoardCard;
  runId: string;
  statusLabel: string;
  blockerLabel: string;
  summary: string;
}

export interface ProjectBoardExecutionPmReview {
  total: number;
  completed: number;
  failed: number;
  blocked: number;
  stalled: number;
  handoffCount: number;
  followUpCount: number;
  riskCount: number;
  impacts: ProjectBoardExecutionPmImpact[];
  materializedFollowUps: ProjectBoardPulledHandoffFollowUp[];
  summary: string;
}

export interface ProjectBoardPmReviewReportSectionModel {
  key:
    | "source_confidence"
    | "git_state"
    | "blocking_questions"
    | "risks"
    | "source_conflicts"
    | "source_authority"
    | "card_generation_constraints";
  title: string;
  items: string[];
  tone: "neutral" | "ready" | "warning" | "danger";
}

export interface ProjectBoardPmReviewReportCoverage {
  recommendationScope: boolean;
  sourceConfidence: boolean;
  gitState: boolean;
  blockingQuestions: boolean;
  sourceConflicts: boolean;
  cardGenerationConstraints: boolean;
  sourceAuthority: boolean;
}

export interface ProjectBoardPmReviewReportUiModel {
  readinessLabel: string;
  summary: string;
  recommendedActivationScope: string;
  sections: ProjectBoardPmReviewReportSectionModel[];
  coverage: ProjectBoardPmReviewReportCoverage;
}

export function projectBoardExecutionPmReview(
  board: Pick<ProjectBoardSummary, "cards" | "executionArtifacts">,
): ProjectBoardExecutionPmReview {
  const executionArtifacts = board.executionArtifacts ?? [];
  const activeCards = sortProjectBoardCards(board.cards.filter((card) => card.status !== "archived"));
  const latestArtifactByCardId = projectBoardLatestExecutionArtifactByCard(executionArtifacts);
  const cardsById = new Map(activeCards.map((card) => [card.id, card]));
  const cardByRef = new Map<string, ProjectBoardCard>();
  for (const card of activeCards) {
    for (const ref of projectBoardCardRefs(card)) {
      if (ref) cardByRef.set(ref, card);
    }
  }
  const blockersByCardId = new Map<string, string[]>();
  for (const card of activeCards) {
    const blockerIds: string[] = [];
    for (const blockerRef of card.blockedBy) {
      const blocker = cardByRef.get(blockerRef.trim());
      if (blocker && blocker.id !== card.id && !blockerIds.includes(blocker.id)) blockerIds.push(blocker.id);
    }
    blockersByCardId.set(card.id, blockerIds);
  }
  const dependentsByBlocker = projectBoardDependentsByBlocker(activeCards, blockersByCardId);
  const latestArtifacts = [...latestArtifactByCardId.values()].sort((left, right) =>
    projectBoardExecutionArtifactTime(right).localeCompare(projectBoardExecutionArtifactTime(left)),
  );
  const completed = latestArtifacts.filter(projectBoardExecutionArtifactSatisfiesDependency).length;
  const failed = latestArtifacts.filter(projectBoardExecutionArtifactFailed).length;
  const blocked = latestArtifacts.filter((artifact) => projectBoardExecutionArtifactStatus(artifact) === "blocked").length;
  const stalled = latestArtifacts.filter((artifact) => projectBoardExecutionArtifactStatus(artifact) === "stalled").length;
  const handoffCount = latestArtifacts.filter((artifact) => Boolean(artifact.handoff)).length;
  const followUpCount = latestArtifacts.reduce((total, artifact) => total + (artifact.handoff?.followUps.length ?? 0), 0);
  const riskCount = latestArtifacts.reduce((total, artifact) => total + (artifact.handoff?.risks.length ?? 0), 0);
  const impacts = latestArtifacts
    .map((artifact) => {
      const card = cardsById.get(artifact.cardId);
      const unblocks = card ? (dependentsByBlocker.get(card.id) ?? []) : [];
      const newlyReadyUnblocks = card
        ? unblocks.filter((dependent) =>
            projectBoardWouldBeReadyIfDependencySatisfied(dependent, card.id, blockersByCardId, cardsById, latestArtifactByCardId),
          )
        : [];
      return projectBoardExecutionPmImpact(artifact, card, unblocks, newlyReadyUnblocks);
    })
    .filter((impact): impact is ProjectBoardExecutionPmImpact => Boolean(impact));
  const materializedFollowUps = projectBoardPulledHandoffFollowUps(activeCards, cardByRef);

  return {
    total: latestArtifacts.length,
    completed,
    failed,
    blocked,
    stalled,
    handoffCount,
    followUpCount,
    riskCount,
    impacts,
    materializedFollowUps,
    summary: projectBoardExecutionPmReviewSummary(latestArtifacts.length, completed, failed, blocked, stalled, followUpCount, riskCount),
  };
}

function projectBoardExecutionPmImpact(
  artifact: ProjectBoardExecutionArtifact,
  card: ProjectBoardCard | undefined,
  unblocks: ProjectBoardCard[],
  newlyReadyUnblocks: ProjectBoardCard[],
): ProjectBoardExecutionPmImpact | undefined {
  const title = card?.title ?? `Unknown card ${artifact.cardId}`;
  const status = projectBoardExecutionArtifactStatus(artifact);
  const riskCount = artifact.handoff?.risks.length ?? 0;
  const followUpCount = artifact.handoff?.followUps.length ?? 0;
  if (projectBoardExecutionArtifactSatisfiesDependency(artifact)) {
    return {
      artifact,
      card,
      tone: riskCount > 0 || followUpCount > 0 ? "warning" : "success",
      title,
      summary: artifact.handoff?.summary ?? artifact.proof?.summary ?? "Pulled proof is available for this card.",
      action:
        newlyReadyUnblocks.length > 0
          ? `Review proof, then release ${newlyReadyUnblocks.length} newly ready downstream card${newlyReadyUnblocks.length === 1 ? "" : "s"}.`
          : unblocks.length > 0
            ? "Review proof; downstream cards still have other blockers."
            : "Review proof and close or archive the card.",
      unblocks,
      newlyReadyUnblocks,
    };
  }
  if (projectBoardExecutionArtifactNeedsAttention(artifact)) {
    return {
      artifact,
      card,
      tone: projectBoardExecutionArtifactFailed(artifact) || status === "blocked" ? "danger" : "warning",
      title,
      summary:
        artifact.handoff?.summary ?? artifact.proof?.summary ?? "Pulled execution stopped before a complete proof artifact was recorded.",
      action: "Inspect the handoff, decide whether to retry, split, or ask the user, and keep dependents blocked until resolved.",
      unblocks,
      newlyReadyUnblocks: [],
    };
  }
  if (artifact.handoff || artifact.proof) {
    return {
      artifact,
      card,
      tone: "neutral",
      title,
      summary: artifact.handoff?.summary ?? artifact.proof?.summary ?? "Pulled execution artifact recorded.",
      action: "Review the artifact before using it to change board status.",
      unblocks,
      newlyReadyUnblocks: [],
    };
  }
  return undefined;
}

function projectBoardPulledHandoffFollowUps(
  cards: ProjectBoardCard[],
  cardByRef: Map<string, ProjectBoardCard>,
): ProjectBoardPulledHandoffFollowUp[] {
  return sortProjectBoardCards(cards.filter((card) => card.sourceKind === "run_follow_up")).map((card) => {
    const parentCard = card.blockedBy
      .map((blocker) => cardByRef.get(blocker.trim()))
      .find((candidate): candidate is ProjectBoardCard => Boolean(candidate));
    const runId = card.sourceId.includes("#follow-up:") ? card.sourceId.slice(0, card.sourceId.indexOf("#follow-up:")) : card.sourceId;
    const explicitSummary = card.description.split("\n\n").slice(1).join("\n\n").trim();
    const summary = explicitSummary || card.description || "Pulled handoff follow-up needs PM triage.";
    return {
      card,
      parentCard,
      runId,
      statusLabel: projectBoardHandoffFollowUpStatusLabel(card),
      blockerLabel: parentCard
        ? `Blocked by ${parentCard.title}`
        : card.blockedBy.length > 0
          ? `Blocked by ${card.blockedBy.join(", ")}`
          : "No blocker recorded",
      summary: truncateProjectBoardLedgerText(summary, 220),
    };
  });
}

function projectBoardExecutionPmReviewSummary(
  total: number,
  completed: number,
  failed: number,
  blocked: number,
  stalled: number,
  followUpCount: number,
  riskCount: number,
): string {
  if (total === 0) return "No pulled execution artifacts have been imported yet.";
  const attention = failed + blocked + stalled;
  if (attention > 0) {
    return `${attention} pulled execution artifact${attention === 1 ? "" : "s"} need PM attention before dependency order should move.`;
  }
  if (followUpCount > 0 || riskCount > 0) {
    return `${completed} pulled completion${completed === 1 ? "" : "s"} include ${followUpCount} follow-up${followUpCount === 1 ? "" : "s"} and ${riskCount} risk note${riskCount === 1 ? "" : "s"}.`;
  }
  if (completed > 0) return `${completed} pulled completion${completed === 1 ? "" : "s"} can be reviewed against downstream dependencies.`;
  return `${total} pulled execution artifact${total === 1 ? "" : "s"} are available for PM review.`;
}

export function projectBoardPmReviewReportUiModel(report: ProjectBoardPmReviewReport): ProjectBoardPmReviewReportUiModel {
  const sourceConfidenceNotes =
    report.sourceConfidenceNotes.length > 0 ? report.sourceConfidenceNotes : ["Pi did not provide additional source-confidence detail."];
  const gitStateNotes = report.gitStateNotes.length > 0 ? report.gitStateNotes : ["Pi did not provide additional Git coordination detail."];
  const rawSections: ProjectBoardPmReviewReportSectionModel[] = [
    {
      key: "source_confidence",
      title: `Source confidence: ${projectBoardPmReviewSourceConfidenceText(report.sourceConfidence)}`,
      items: sourceConfidenceNotes,
      tone:
        report.sourceConfidence === "high"
          ? "ready"
          : report.sourceConfidence === "low" || report.sourceConfidence === "unknown"
            ? "warning"
            : "neutral",
    },
    {
      key: "git_state",
      title: `Git state: ${projectBoardPmReviewGitStateText(report.gitState)}`,
      items: gitStateNotes,
      tone: report.gitState === "git_ready" ? "ready" : report.gitState === "unknown" ? "warning" : "neutral",
    },
    { key: "blocking_questions", title: "Blocking questions", items: report.blockingQuestions, tone: "danger" },
    { key: "risks", title: "Risks", items: report.risks, tone: report.risks.length > 0 ? "warning" : "neutral" },
    { key: "source_conflicts", title: "Source conflicts", items: report.sourceConflicts, tone: "danger" },
    { key: "source_authority", title: "Source authority", items: report.sourceAuthorityNotes, tone: "neutral" },
    { key: "card_generation_constraints", title: "Card generation constraints", items: report.cardGenerationConstraints, tone: "warning" },
  ];
  const sections = rawSections.filter((section) => section.items.length > 0);

  return {
    readinessLabel: projectBoardPmReviewReadinessText(report.readiness),
    summary: report.summary,
    recommendedActivationScope: report.recommendedActivationScope,
    sections,
    coverage: {
      recommendationScope: report.recommendedActivationScope.trim().length > 0,
      sourceConfidence: report.sourceConfidence !== "unknown" || report.sourceConfidenceNotes.length > 0,
      gitState: report.gitState !== "unknown" || report.gitStateNotes.length > 0,
      blockingQuestions: report.blockingQuestions.length > 0,
      sourceConflicts: report.sourceConflicts.length > 0,
      cardGenerationConstraints: report.cardGenerationConstraints.length > 0,
      sourceAuthority: report.sourceAuthorityNotes.length > 0,
    },
  };
}

export function projectBoardPmReviewReadinessText(readiness: ProjectBoardPmReviewReport["readiness"]): string {
  if (readiness === "ready_for_activation") return "Ready for activation";
  if (readiness === "ready_for_card_generation") return "Ready for card generation";
  if (readiness === "needs_source_refresh") return "Needs source refresh";
  if (readiness === "blocked") return "Blocked";
  return "Needs answers";
}

export function projectBoardPmReviewSourceConfidenceText(confidence: ProjectBoardPmReviewReport["sourceConfidence"]): string {
  if (confidence === "high") return "High";
  if (confidence === "medium") return "Medium";
  if (confidence === "low") return "Low";
  return "Unknown";
}

export function projectBoardPmReviewGitStateText(state: ProjectBoardPmReviewReport["gitState"]): string {
  if (state === "git_ready") return "Git ready";
  if (state === "git_no_remote") return "Git repo, no remote";
  if (state === "local_only") return "Local only";
  return "Unknown";
}
