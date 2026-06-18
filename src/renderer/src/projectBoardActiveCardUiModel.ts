import type { ProjectBoardCard, ProjectBoardCardCandidateStatus, ProjectBoardCardSplitOutcomeStatus, ProjectBoardCardStatus, ProjectBoardEvent, ProjectBoardExecutionArtifact, ProjectBoardPmReviewReport, ProjectBoardProofDecisionAction, ProjectBoardSplitDecisionAction, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import type { RunStatus } from "../../shared/threadTypes";
import type { OrchestrationRun, OrchestrationTask, OrchestrationWorkflowReadiness } from "../../shared/workflowTypes";
import { projectBoardClarificationDecisions } from "../../shared/projectBoardClarificationDecisions";
import { projectBoardProofPolicyRequiresProofSpec } from "../../shared/projectBoardProofImpact";
import { projectBoardCardSourceBasis } from "./projectBoardSourceUiModel";
import type { ProjectBoardCardSourceBasisItem } from "./projectBoardSourceUiModel";
import {
  projectBoardCardMatchesRef,
  projectBoardCardProofCount,
  projectBoardCardRefs,
  projectBoardDependentsByBlocker,
  projectBoardDependencySatisfied,
  projectBoardExecutionArtifactFailed,
  projectBoardExecutionArtifactNeedsAttention,
  projectBoardExecutionArtifactSatisfiesDependency,
  projectBoardExecutionArtifactStatus,
  projectBoardExecutionArtifactTime,
  projectBoardLatestExecutionArtifactByCard,
  projectBoardTaskDependencySatisfied,
  projectBoardTaskMatchesRef,
  projectBoardWouldBeReadyIfDependencySatisfied,
  sortProjectBoardCards,
} from "./projectBoardDependencyUiModel";
import type { ProjectBoardDependencyReadinessState } from "./projectBoardDependencyUiModel";
import {
  compareProjectBoardRunsLatestFirst,
  projectBoardMetadataNumber,
  projectBoardMetadataObject,
} from "./projectBoardExecutionUiModel";
import {
  projectBoardDurationLabel,
  projectBoardProofArray,
  projectBoardProofEvidenceModel,
  projectBoardProofFileLabel,
  projectBoardProofObject,
  projectBoardProofPolicySummary,
  projectBoardProofRecommendedActionText,
  projectBoardProofReviewStatusText,
  projectBoardProofText,
  projectBoardReadableState,
  projectBoardRunHasReviewableEvidence,
  projectBoardRunIsActive,
  projectBoardRunNeedsIntervention,
  projectBoardTaskActionArray,
  projectBoardTaskActionDiagnosticsDetail,
  projectBoardTaskActionEvidenceFromProof,
  projectBoardTaskActionObjectsFromProof,
  projectBoardUniqueProofItems,
  truncateProjectBoardLedgerText,
} from "./projectBoardProofEvidenceUiModel";
import type { ProjectBoardProofEvidenceTone } from "./projectBoardProofEvidenceUiModel";

function projectBoardJoinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function projectBoardProofEligibleCards(cards: ProjectBoardCard[]): ProjectBoardCard[] {
  return cards.filter((card) => card.status !== "archived" && card.candidateStatus !== "evidence" && card.candidateStatus !== "rejected" && card.candidateStatus !== "duplicate");
}

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

export interface ProjectBoardPhaseGroup {
  phase: string;
  cards: ProjectBoardCard[];
  blockedCount: number;
  readyCount: number;
  reviewCount: number;
  criticalPathCount: number;
  tone: ProjectBoardVisualTone;
}

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

export interface ProjectBoardTestSummary {
  unit: number;
  integration: number;
  visual: number;
  manual: number;
  missing: ProjectBoardCard[];
  strict: boolean;
}

export interface ProjectBoardProofCoverage {
  unit: ProjectBoardCard[];
  integration: ProjectBoardCard[];
  visual: ProjectBoardCard[];
  integrationOrBrowser: ProjectBoardCard[];
  manual: ProjectBoardCard[];
  missing: ProjectBoardCard[];
  strict: boolean;
  relaxedWarning: boolean;
}

export type ProjectBoardProgressLedgerState = "done" | "active" | "review" | "blocked" | "missing";

export interface ProjectBoardProgressLedgerEntry {
  id: "completed_work" | "remaining_work" | "files_touched" | "verification" | "proof_collected" | "task_actions" | "blockers_questions" | "next_action";
  label: string;
  state: ProjectBoardProgressLedgerState;
  detail: string;
}


export interface ProjectBoardSplitOutcomeChild {
  card: ProjectBoardCard;
  statusLabel: string;
  blockedByParent: boolean;
}

export interface ProjectBoardSplitOutcomeModel {
  statusLabel: string;
  sourceLabel: string;
  reason: string;
  partialProofSummary: string;
  completedCriteria: string[];
  remainingCriteria: string[];
  children: ProjectBoardSplitOutcomeChild[];
  unresolvedChildIds: string[];
  canCloseViaSplit: boolean;
  actions: ProjectBoardSplitDecisionActionModel[];
}

export interface ProjectBoardSplitDecisionActionModel {
  action: ProjectBoardSplitDecisionAction;
  label: string;
  title: string;
  disabled: boolean;
  tone: "primary" | "secondary" | "danger";
}

export interface ProjectBoardActiveCardDetailModel {
  task?: OrchestrationTask;
  runs: OrchestrationRun[];
  latestRun?: OrchestrationRun;
  executionArtifacts: ProjectBoardExecutionArtifact[];
  latestExecutionArtifact?: ProjectBoardExecutionArtifact;
  blockedByCards: ProjectBoardCard[];
  blockedByTasks: OrchestrationTask[];
  unresolvedBlockers: string[];
  unblocks: ProjectBoardCard[];
  proofExpectationCount: number;
  progressLedger: ProjectBoardProgressLedgerEntry[];
  splitOutcome?: ProjectBoardSplitOutcomeModel;
}

export type ProjectBoardLiveSessionActivityKind = "state" | "thinking" | "tool" | "heartbeat" | "error";

export interface ProjectBoardLiveSessionActivityLine {
  id: string;
  text: string;
  kind: ProjectBoardLiveSessionActivityKind;
  timestamp: number;
}

export interface ProjectBoardLiveSessionPreviewMetric {
  label: string;
  value: string;
  tone: ProjectBoardActiveCardOverviewTone;
  title?: string;
}

export interface ProjectBoardLiveSessionPreviewActivity {
  id: string;
  label: string;
  text: string;
  kind: ProjectBoardLiveSessionActivityKind;
  timestamp?: number;
}

export interface ProjectBoardLiveSessionPreviewAction {
  label: string;
  busyLabel: string;
  title: string;
  disabled: boolean;
  busyKey: string;
  runId?: string;
  threadId?: string;
  workspacePath?: string;
}

export interface ProjectBoardLiveSessionPreviewModel {
  visible: boolean;
  tone: ProjectBoardActiveCardOverviewTone;
  statusLabel: string;
  headline: string;
  detail: string;
  sessionLabel: string;
  latestAssistantText?: string;
  metrics: ProjectBoardLiveSessionPreviewMetric[];
  activity: ProjectBoardLiveSessionPreviewActivity[];
  threadId?: string;
  runId?: string;
  workspacePath?: string;
  active: boolean;
  terminal: boolean;
  copyAction: ProjectBoardLiveSessionPreviewAction;
  openThreadAction?: ProjectBoardLiveSessionPreviewAction;
  workspaceAction?: ProjectBoardLiveSessionPreviewAction;
}

export interface ProjectBoardProofDecisionActionModel {
  action: ProjectBoardProofDecisionAction;
  label: string;
  title: string;
  disabled: boolean;
  tone: "primary" | "secondary" | "danger";
}

export interface ProjectBoardProofDecisionModel {
  statusLabel: string;
  recommendationLabel: string;
  rationale: string;
  policySummary: string;
  nextAction: string;
  readyForDecision: boolean;
  readinessLabel: string;
  readinessReason: string;
  awaitingRun: boolean;
  actions: ProjectBoardProofDecisionActionModel[];
}

export interface ProjectBoardUiMockReviewActionModel {
  action: ProjectBoardProofDecisionAction;
  label: string;
  title: string;
  disabled: boolean;
  tone: "primary" | "secondary" | "danger";
}

export interface ProjectBoardUiMockReviewPanelModel {
  visible: boolean;
  statusLabel: string;
  headline: string;
  detail: string;
  previewPath?: string;
  previewTitle: string;
  actions: ProjectBoardUiMockReviewActionModel[];
}

export interface ProjectBoardProofFollowUpImpactMetric {
  label: string;
  value: string;
  tone: ProjectBoardProofEvidenceTone;
}

export interface ProjectBoardProofFollowUpCardPreview {
  cardId: string;
  title: string;
  sourceLabel: string;
  statusLabel: string;
  blockerLabel: string;
  blockedByParent: boolean;
  summary: string;
  acceptanceCriteria: string[];
  proofExpectations: string[];
  proofExpectationCount: number;
}

export interface ProjectBoardProofFollowUpImpactModel {
  visible: boolean;
  headline: string;
  detail: string;
  parentOutcome: string;
  modelCallRequired: false;
  existingCardsRewritten: false;
  followUpCardCount: number;
  missingProofCount: number;
  unresolvedFollowUpCardIds: string[];
  metrics: ProjectBoardProofFollowUpImpactMetric[];
  cards: ProjectBoardProofFollowUpCardPreview[];
}

export type ProjectBoardExecutionControlState = "ready" | "active" | "review" | "blocked" | "done" | "missing";

export type ProjectBoardExecutionControlAction =
  | "prepare_run"
  | "start_run"
  | "cancel_run"
  | "open_run_chat"
  | "reveal_workspace"
  | "accept_done"
  | "retry_card"
  | "mark_blocked";

export interface ProjectBoardExecutionControlActionModel {
  action: ProjectBoardExecutionControlAction;
  label: string;
  busyLabel: string;
  title: string;
  disabled: boolean;
  tone: "primary" | "secondary" | "danger";
  busyKey?: string;
  runId?: string;
  threadId?: string;
  workspacePath?: string;
  proofDecisionAction?: ProjectBoardProofDecisionAction;
}

export interface ProjectBoardExecutionControlModel {
  state: ProjectBoardExecutionControlState;
  statusLabel: string;
  headline: string;
  detail: string;
  taskLabel: string;
  runLabel: string;
  proofLabel: string;
  blockerLabel: string;
  policySummary: string;
  actions: ProjectBoardExecutionControlActionModel[];
}

export type ProjectBoardActiveCardOverviewTone = "neutral" | "ready" | "running" | "review" | "blocked" | "done" | "warning";

export interface ProjectBoardActiveCardOverviewBadge {
  label: string;
  value: string;
  tone: ProjectBoardActiveCardOverviewTone;
}

export type ProjectBoardActiveCardOverviewSectionId =
  | "decision"
  | "pi_update"
  | "execution"
  | "proof"
  | "dependencies"
  | "source"
  | "feedback"
  | "history";

export interface ProjectBoardActiveCardOverviewSection {
  id: ProjectBoardActiveCardOverviewSectionId;
  label: string;
  headline: string;
  detail: string;
  tone: ProjectBoardActiveCardOverviewTone;
  countLabel?: string;
}

export interface ProjectBoardActiveCardDecisionAudit {
  open: number;
  answered: number;
  duplicate: number;
  dismissed: number;
}

export interface ProjectBoardActiveCardOverviewModel {
  headline: string;
  detail: string;
  badges: ProjectBoardActiveCardOverviewBadge[];
  sections: ProjectBoardActiveCardOverviewSection[];
  decisionAudit: ProjectBoardActiveCardDecisionAudit;
  sourceBasis: ProjectBoardCardSourceBasisItem[];
}


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
  const pmReviewPending = !cardDone && (completedRunNeedsReview || taskState === "needs_review" || card.status === "review" || Boolean(card.proofReview));

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
      runLabel: context.latestRun
        ? stoppedAccepted
          ? "Historical stopped run accepted"
          : "Historical run accepted"
        : "No active run",
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

export function projectBoardCardVisualTone(card: ProjectBoardCard, readinessState?: ProjectBoardDependencyReadinessState): ProjectBoardVisualTone {
  const projection = projectBoardCanonicalCardProjection(card, { readinessState });
  if (projection.terminalDone || projection.kind === "covered_without_task") return projection.tone;
  return projectBoardCardStatusTone(card, readinessState);
}

function projectBoardCardStatusTone(card: ProjectBoardCard, readinessState?: ProjectBoardDependencyReadinessState): ProjectBoardVisualTone {
  if (readinessState === "cycle" || readinessState === "blocked_issue" || readinessState === "waiting_on_dependencies" || readinessState === "needs_clarification") {
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


export function projectBoardExecutionPmReview(board: Pick<ProjectBoardSummary, "cards" | "executionArtifacts">): ProjectBoardExecutionPmReview {
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
  const latestArtifacts = [...latestArtifactByCardId.values()].sort((left, right) => projectBoardExecutionArtifactTime(right).localeCompare(projectBoardExecutionArtifactTime(left)));
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
        ? unblocks.filter((dependent) => projectBoardWouldBeReadyIfDependencySatisfied(dependent, card.id, blockersByCardId, cardsById, latestArtifactByCardId))
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

export function projectBoardTestSummary(cards: ProjectBoardCard[]): ProjectBoardTestSummary {
  return projectBoardTestSummaryForBoard({ cards } as ProjectBoardSummary);
}

export function projectBoardTestSummaryForBoard(board: ProjectBoardSummary): ProjectBoardTestSummary {
  const executableCards = projectBoardProofEligibleCards(board.cards);
  return {
    unit: executableCards.reduce((total, card) => total + card.testPlan.unit.length, 0),
    integration: executableCards.reduce((total, card) => total + card.testPlan.integration.length, 0),
    visual: executableCards.reduce((total, card) => total + card.testPlan.visual.length, 0),
    manual: executableCards.reduce((total, card) => total + card.testPlan.manual.length, 0),
    missing: executableCards.filter((card) => projectBoardCardProofCount(card) === 0),
    strict: projectBoardRequiresProofSpec(board),
  };
}

export function projectBoardProofCoverageForBoard(board: ProjectBoardSummary): ProjectBoardProofCoverage {
  const cards = projectBoardProofEligibleCards(board.cards);
  const unit = cards.filter((card) => card.testPlan.unit.length > 0);
  const integration = cards.filter((card) => card.testPlan.integration.length > 0);
  const visual = cards.filter((card) => card.testPlan.visual.length > 0);
  const integrationOrBrowser = cards.filter((card) => card.testPlan.integration.length > 0 || card.testPlan.visual.length > 0);
  const manual = cards.filter((card) => card.testPlan.manual.length > 0);
  const missing = cards.filter((card) => projectBoardCardProofCount(card) === 0);
  const strict = projectBoardRequiresProofSpec(board);
  return {
    unit,
    integration,
    visual,
    integrationOrBrowser,
    manual,
    missing,
    strict,
    relaxedWarning: !strict && missing.length > 0,
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
      summary: artifact.handoff?.summary ?? artifact.proof?.summary ?? "Pulled execution stopped before a complete proof artifact was recorded.",
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

function projectBoardPulledHandoffFollowUps(cards: ProjectBoardCard[], cardByRef: Map<string, ProjectBoardCard>): ProjectBoardPulledHandoffFollowUp[] {
  return sortProjectBoardCards(cards.filter((card) => card.sourceKind === "run_follow_up")).map((card) => {
    const parentCard = card.blockedBy.map((blocker) => cardByRef.get(blocker.trim())).find((candidate): candidate is ProjectBoardCard => Boolean(candidate));
    const runId = card.sourceId.includes("#follow-up:") ? card.sourceId.slice(0, card.sourceId.indexOf("#follow-up:")) : card.sourceId;
    const explicitSummary = card.description.split("\n\n").slice(1).join("\n\n").trim();
    const summary = explicitSummary || card.description || "Pulled handoff follow-up needs PM triage.";
    return {
      card,
      parentCard,
      runId,
      statusLabel: projectBoardHandoffFollowUpStatusLabel(card),
      blockerLabel: parentCard ? `Blocked by ${parentCard.title}` : card.blockedBy.length > 0 ? `Blocked by ${card.blockedBy.join(", ")}` : "No blocker recorded",
      summary: truncateProjectBoardLedgerText(summary, 220),
    };
  });
}

function projectBoardHandoffFollowUpStatusLabel(card: ProjectBoardCard): string {
  if (card.candidateStatus === "ready_to_create") return "Ready to create";
  if (card.candidateStatus === "needs_clarification") return "Needs clarification";
  if (card.candidateStatus === "evidence") return "Covered / Done";
  if (card.candidateStatus === "duplicate") return "Duplicate";
  if (card.candidateStatus === "rejected") return "Rejected";
  return card.candidateStatus;
}

function projectBoardCardStatusText(status: ProjectBoardCardStatus, candidateStatus: ProjectBoardCardCandidateStatus): string {
  if (status === "draft") return projectBoardHandoffFollowUpStatusLabel({ candidateStatus } as ProjectBoardCard);
  return projectBoardReadableState(status);
}

function projectBoardProofFollowUpCardPreview(
  parent: ProjectBoardCard,
  card: ProjectBoardCard,
): ProjectBoardProofFollowUpCardPreview {
  const proofExpectations = projectBoardCardProofExpectationRows(card);
  const blockedByParent = card.blockedBy.some((ref) => projectBoardCardReferenceMatches(parent, ref));
  return {
    cardId: card.id,
    title: card.title,
    sourceLabel: card.sourceKind === "run_follow_up" ? "Proof follow-up draft" : projectBoardReadableState(card.sourceKind),
    statusLabel: projectBoardCardStatusText(card.status, card.candidateStatus),
    blockerLabel: blockedByParent
      ? `Blocked by parent: ${parent.title}`
      : card.blockedBy.length > 0
        ? `Blocked by ${card.blockedBy.slice(0, 3).join(", ")}`
        : "No blocker recorded",
    blockedByParent,
    summary: truncateProjectBoardLedgerText(card.description || "No follow-up description recorded.", 220),
    acceptanceCriteria: card.acceptanceCriteria.slice(0, 5),
    proofExpectations: proofExpectations.slice(0, 5),
    proofExpectationCount: projectBoardCardProofCount(card),
  };
}

function projectBoardCardReferenceMatches(card: ProjectBoardCard, ref: string): boolean {
  const normalized = ref.trim();
  return [card.id, card.sourceId, card.orchestrationTaskId ?? "", `card:${card.id}`, `project-board-card:${card.id}`]
    .filter(Boolean)
    .includes(normalized);
}

function projectBoardCardProofExpectationRows(card: ProjectBoardCard): string[] {
  const rows: string[] = [];
  for (const item of card.testPlan.unit) rows.push(`Unit: ${item}`);
  for (const item of card.testPlan.integration) rows.push(`Integration: ${item}`);
  for (const item of card.testPlan.visual) rows.push(`Visual: ${item}`);
  for (const item of card.testPlan.manual) rows.push(`Manual: ${item}`);
  return rows;
}

function projectBoardSplitOutcomeStatusText(status: ProjectBoardCardSplitOutcomeStatus): string {
  if (status === "done_via_split") return "Done via split";
  return projectBoardReadableState(status);
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

function projectBoardRunFromExecutionArtifact(artifact: ProjectBoardExecutionArtifact): OrchestrationRun {
  const proofOfWork: Record<string, unknown> = {
    kind: "git-board-run-artifact",
    summary: artifact.proof?.summary ?? artifact.handoff?.summary,
    lastAssistantText: artifact.handoff?.summary ?? artifact.proof?.summary,
    commands: artifact.proof?.commands ?? [],
    changedFiles: artifact.proof?.changedFiles ?? [],
    screenshots: artifact.proof?.screenshots ?? [],
    browserTraces: artifact.proof?.browserTraces ?? [],
    visualChecks: artifact.proof?.visualChecks ?? [],
    manualChecks: artifact.proof?.manualChecks ?? [],
    handoff: artifact.handoff,
    source: artifact.source,
  };
  return {
    id: artifact.id,
    taskId: `project-board-card:${artifact.cardId}`,
    attemptNumber: 0,
    status: artifact.status,
    workspacePath: artifact.workspaceBranch ? `Git board artifact: ${artifact.workspaceBranch}` : "Git board artifact",
    piSessionFile: artifact.piSessionId,
    startedAt: artifact.startedAt,
    finishedAt: artifact.completedAt,
    lastEventAt: artifact.updatedAt,
    proofOfWork,
  };
}


export function projectBoardActiveCardDetail(
  card: ProjectBoardCard,
  cards: ProjectBoardCard[],
  tasks: OrchestrationTask[],
  runs: OrchestrationRun[],
  executionArtifacts: ProjectBoardExecutionArtifact[] = [],
): ProjectBoardActiveCardDetailModel {
  const task = card.orchestrationTaskId ? tasks.find((candidate) => candidate.id === card.orchestrationTaskId) : undefined;
  const localRuns = card.orchestrationTaskId
    ? [...runs.filter((run) => run.taskId === card.orchestrationTaskId)].sort(compareProjectBoardRunsLatestFirst)
    : [];
  const cardExecutionArtifacts = executionArtifacts
    .filter((artifact) => artifact.cardId === card.id)
    .sort((left, right) => projectBoardExecutionArtifactTime(right).localeCompare(projectBoardExecutionArtifactTime(left)));
  const importedRuns = cardExecutionArtifacts.map(projectBoardRunFromExecutionArtifact);
  const cardRuns = [...localRuns, ...importedRuns].sort(compareProjectBoardRunsLatestFirst);
  const blockedByCards: ProjectBoardCard[] = [];
  const blockedByTasks: OrchestrationTask[] = [];
  const unresolvedBlockers: string[] = [];
  const latestArtifactByCardId = projectBoardLatestExecutionArtifactByCard(executionArtifacts);

  for (const blockerRef of card.blockedBy) {
    const blockerCard = cards.find((candidate) => candidate.id !== card.id && projectBoardCardMatchesRef(candidate, blockerRef));
    if (blockerCard) {
      if (!projectBoardDependencySatisfied(blockerCard, latestArtifactByCardId)) blockedByCards.push(blockerCard);
      continue;
    }
    const blockerTask = tasks.find((candidate) => projectBoardTaskMatchesRef(candidate, blockerRef));
    if (blockerTask) {
      if (!projectBoardTaskDependencySatisfied(blockerTask)) blockedByTasks.push(blockerTask);
      continue;
    }
    unresolvedBlockers.push(blockerRef);
  }

  const latestRun = cardRuns[0];
  const proofExpectationCount = projectBoardCardProofCount(card);
  return {
    task,
    runs: cardRuns,
    latestRun,
    executionArtifacts: cardExecutionArtifacts,
    latestExecutionArtifact: cardExecutionArtifacts[0],
    blockedByCards,
    blockedByTasks,
    unresolvedBlockers,
    unblocks: cards.filter((candidate) => candidate.id !== card.id && candidate.blockedBy.some((blocker) => projectBoardCardMatchesRef(card, blocker))),
    proofExpectationCount,
    progressLedger: projectBoardProgressLedgerForCard({
      card,
      task,
      latestRun,
      blockedByCards,
      blockedByTasks,
      unresolvedBlockers,
      proofExpectationCount,
      latestArtifactByCardId,
    }),
    splitOutcome: projectBoardSplitOutcomeModel(card, cards, task, latestRun),
  };
}

export function projectBoardLiveSessionPreviewModel(input: {
  card: ProjectBoardCard;
  task?: OrchestrationTask;
  latestRun?: OrchestrationRun;
  threadStatus?: RunStatus;
  activityLines?: ProjectBoardLiveSessionActivityLine[];
  now?: number;
}): ProjectBoardLiveSessionPreviewModel {
  const latestRun = input.latestRun;
  const threadId = latestRun?.threadId ?? input.card.executionThreadId;
  const runId = latestRun?.id;
  const workspacePath = latestRun?.workspacePath ?? input.task?.workspacePath;
  const activityLines = input.activityLines ?? [];
  const visible = Boolean(threadId || latestRun || activityLines.length > 0);
  const runActive = Boolean(latestRun && projectBoardRunIsActive(latestRun));
  const threadActive = projectBoardThreadRunStatusIsActive(input.threadStatus);
  const terminal = Boolean(latestRun && projectBoardRunCanCopySessionToThread(latestRun));
  const active = !terminal && (runActive || threadActive || input.card.status === "in_progress" || input.task?.state === "in_progress");
  const statusLabel = projectBoardLiveSessionStatusLabel({ run: latestRun, threadStatus: input.threadStatus, task: input.task, active, terminal });
  const tone: ProjectBoardActiveCardOverviewTone = active
    ? "running"
    : terminal && latestRun?.status === "completed"
      ? "done"
      : terminal
        ? "blocked"
        : latestRun?.status === "prepared"
          ? "ready"
          : "neutral";
  const sessionLabel = threadId ? `Session ${projectBoardShortId(threadId)}` : "No session thread";
  const proof = latestRun?.proofOfWork;
  const progress = projectBoardMetadataObject(proof, "progress");
  const latestAssistantText =
    projectBoardProofText(proof?.lastAssistantText) ??
    projectBoardProofText(proof?.summary) ??
    projectBoardProofText(progress?.lastAssistantText);
  const elapsedMs =
    projectBoardMetadataNumber(proof, "elapsedMs") ??
    projectBoardMetadataNumber(progress, "elapsedMs") ??
    projectBoardRunElapsedMs(latestRun, input.now);
  const toolCount =
    projectBoardMetadataNumber(proof, "toolMessageCount") ??
    projectBoardMetadataNumber(progress, "toolMessageCount") ??
    projectBoardMetadataNumber(proof, "completedToolMessageCount") ??
    projectBoardMetadataNumber(proof, "runningToolMessageCount");
  const messageCount =
    projectBoardMetadataNumber(proof, "messageCount") ??
    projectBoardMetadataNumber(progress, "messageCount") ??
    projectBoardMetadataNumber(proof, "assistantMessageCount");
  const eventCount = activityLines.length || projectBoardMetadataNumber(progress, "eventCount") || projectBoardMetadataNumber(proof, "eventCount") || 0;
  const activity = projectBoardLiveSessionActivity(activityLines, latestRun);
  const copyDisabledReason = !runId
    ? "A recorded run is required before copying this Pi session into a local thread."
    : !threadId
      ? "This run does not have a Pi session thread to copy."
      : !terminal
        ? "Copy is available after the Pi session is paused, stopped, failed, stalled, canceled, or completed."
        : undefined;
  const openThreadDisabledReason = threadId ? undefined : "This card does not have a session thread yet.";
  const workspaceDisabledReason = workspacePath ? undefined : "This card does not have a run workspace yet.";

  return {
    visible,
    tone,
    statusLabel,
    headline: active
      ? "Pi is working on this card"
      : terminal
        ? "Pi session can be copied into a local thread"
        : latestRun?.status === "prepared"
          ? "Pi session is ready to start"
          : "Pi session context",
    detail: projectBoardLiveSessionDetail(input.card, latestRun, input.task, active, terminal),
    sessionLabel,
    latestAssistantText: latestAssistantText ? truncateProjectBoardLedgerText(latestAssistantText, 420) : undefined,
    metrics: [
      { label: "Events", value: String(eventCount), tone: eventCount > 0 ? "running" : "neutral", title: "Renderer-observed activity events for this session." },
      { label: "Tool calls", value: toolCount === undefined ? "0" : String(toolCount), tone: toolCount && toolCount > 0 ? "ready" : "neutral" },
      { label: "Messages", value: messageCount === undefined ? "0" : String(messageCount), tone: messageCount && messageCount > 0 ? "ready" : "neutral" },
      ...(elapsedMs !== undefined ? [{ label: "Elapsed", value: projectBoardDurationLabel(elapsedMs), tone: "neutral" as const }] : []),
    ],
    activity,
    threadId,
    runId,
    workspacePath,
    active,
    terminal,
    copyAction: {
      label: "Copy Session to Thread",
      busyLabel: "Copying",
      title:
        copyDisabledReason ??
        "Copy this completed or stopped Pi session transcript into a new local project thread for follow-up discussion.",
      disabled: Boolean(copyDisabledReason),
      busyKey: runId ? `copy-session:${runId}` : "copy-session",
      runId,
      threadId,
    },
    openThreadAction: threadId
      ? {
          label: active ? "Open live thread" : "Open source thread",
          busyLabel: "Opening",
          title: openThreadDisabledReason ?? "Open the underlying Pi session thread.",
          disabled: Boolean(openThreadDisabledReason),
          busyKey: `thread:${threadId}`,
          threadId,
        }
      : undefined,
    workspaceAction: workspacePath
      ? {
          label: "Reveal workspace",
          busyLabel: "Revealing",
          title: workspaceDisabledReason ?? "Reveal the worktree or workspace used by this Local Task run.",
          disabled: Boolean(workspaceDisabledReason),
          busyKey: `reveal:${workspacePath}`,
          workspacePath,
        }
      : undefined,
  };
}

function projectBoardThreadRunStatusIsActive(status?: RunStatus): boolean {
  return status === "starting" || status === "streaming" || status === "tool" || status === "retrying" || status === "compacting";
}

function projectBoardRunCanCopySessionToThread(run: OrchestrationRun): boolean {
  return ["completed", "failed", "canceled", "stalled"].includes(run.status);
}

function projectBoardLiveSessionStatusLabel(input: {
  run?: OrchestrationRun;
  threadStatus?: RunStatus;
  task?: OrchestrationTask;
  active: boolean;
  terminal: boolean;
}): string {
  if (input.threadStatus === "tool") return "Tool call running";
  if (input.threadStatus === "streaming") return "Streaming";
  if (input.threadStatus === "starting") return "Starting";
  if (input.threadStatus === "retrying") return "Retrying";
  if (input.threadStatus === "compacting") return "Compacting";
  if (input.run?.status === "completed") return "Completed";
  if (input.run?.status === "failed") return "Stopped";
  if (input.run?.status === "canceled") return "Canceled";
  if (input.run?.status === "stalled") return "Stalled";
  if (input.run?.status === "prepared") return "Prepared";
  if (input.active) return "Running";
  if (input.terminal) return "Stopped";
  if (input.task?.state === "needs_review") return "Needs review";
  return input.run ? projectBoardReadableState(input.run.status) : "Session";
}

function projectBoardLiveSessionDetail(
  card: ProjectBoardCard,
  run: OrchestrationRun | undefined,
  task: OrchestrationTask | undefined,
  active: boolean,
  terminal: boolean,
): string {
  if (active) return "Live Pi events are scoped to the selected board card and update without leaving the board.";
  if (terminal) return "This session is no longer mutating board state; copy it into a local thread when you want a durable follow-up surface.";
  if (run?.status === "prepared") return "The Local Task run is prepared. Start it to watch Pi activity here.";
  if (task) return `${task.identifier} is linked to this card; Pi activity appears here once a run starts.`;
  return `${card.title} is not linked to an active Pi run yet.`;
}

function projectBoardLiveSessionActivity(
  activityLines: ProjectBoardLiveSessionActivityLine[],
  run: OrchestrationRun | undefined,
): ProjectBoardLiveSessionPreviewActivity[] {
  const live = activityLines.slice(-4).map((line) => ({
    id: line.id,
    label: projectBoardLiveSessionActivityLabel(line.kind),
    text: truncateProjectBoardLedgerText(line.text, 220),
    kind: line.kind,
    timestamp: line.timestamp,
  }));
  if (live.length > 0) return live;
  if (run?.error) {
    return [
      {
        id: `${run.id}:error`,
        label: "Run error",
        text: truncateProjectBoardLedgerText(run.error, 220),
        kind: "error",
      },
    ];
  }
  if (run) {
    return [
      {
        id: `${run.id}:status`,
        label: "Run status",
        text: `Run is ${projectBoardReadableState(run.status)}.`,
        kind: "state",
      },
    ];
  }
  return [];
}

function projectBoardLiveSessionActivityLabel(kind: ProjectBoardLiveSessionActivityKind): string {
  if (kind === "tool") return "Tool call";
  if (kind === "thinking") return "Thinking";
  if (kind === "heartbeat") return "Heartbeat";
  if (kind === "error") return "Error";
  return "Session event";
}

function projectBoardRunElapsedMs(run: OrchestrationRun | undefined, now = Date.now()): number | undefined {
  if (!run) return undefined;
  const started = Date.parse(run.startedAt);
  if (!Number.isFinite(started)) return undefined;
  const ended = run.finishedAt ? Date.parse(run.finishedAt) : now;
  if (!Number.isFinite(ended)) return undefined;
  return Math.max(0, ended - started);
}

function projectBoardShortId(id: string): string {
  return id.length > 10 ? id.slice(-10) : id;
}

function projectBoardSplitOutcomeModel(
  card: ProjectBoardCard,
  cards: ProjectBoardCard[],
  task?: OrchestrationTask,
  latestRun?: OrchestrationRun,
): ProjectBoardSplitOutcomeModel | undefined {
  const outcome = card.splitOutcome;
  if (!outcome) return undefined;
  const children: ProjectBoardSplitOutcomeChild[] = [];
  const unresolvedChildIds: string[] = [];
  for (const childId of outcome.childCardIds) {
    const child = cards.find((candidate) => candidate.id === childId);
    if (!child) {
      unresolvedChildIds.push(childId);
      continue;
    }
    children.push({
      card: child,
      statusLabel: projectBoardCardStatusText(child.status, child.candidateStatus),
      blockedByParent: child.blockedBy.some((blocker) => projectBoardCardMatchesRef(card, blocker)),
    });
  }
  const activeRun = Boolean(latestRun && projectBoardRunIsActive(latestRun));
  const done = card.status === "done" || task?.state === "done";
  const childTerminal = (child: ProjectBoardCard): boolean =>
    child.status === "done" || child.candidateStatus === "evidence" || child.candidateStatus === "duplicate";
  const canCloseViaSplit = children.length > 0 && unresolvedChildIds.length === 0 && children.every((child) => childTerminal(child.card));
  const activeRunReason = activeRun ? "Wait for the current run to finish before resolving this split." : undefined;
  const taskReason = !task ? "Ticketize the parent card before changing its execution state." : undefined;
  const doneReason = done ? "The parent card is already closed." : undefined;
  const actions: ProjectBoardSplitDecisionActionModel[] = [
    {
      action: "approve_split",
      label: "Approve split",
      title:
        activeRunReason ??
        doneReason ??
        (outcome.status !== "proposed"
          ? "Only proposed splits can be approved."
          : "Accept the follow-up cards as the remaining scope while leaving the parent as the audit record."),
      disabled: Boolean(activeRunReason || doneReason || outcome.status !== "proposed"),
      tone: "primary",
    },
    {
      action: "retry_original",
      label: "Retry original",
      title:
        activeRunReason ??
        taskReason ??
        doneReason ??
        "Reject unticketized follow-ups and return the original parent card to Ready for another Pi pass.",
      disabled: Boolean(activeRunReason || taskReason || doneReason),
      tone: "secondary",
    },
    {
      action: "merge_followups",
      label: "Merge back",
      title:
        activeRunReason ??
        taskReason ??
        doneReason ??
        (children.length === 0
          ? "No follow-up cards are available to merge into the parent."
          : "Move remaining follow-up criteria back onto the original card and retry it."),
      disabled: Boolean(activeRunReason || taskReason || doneReason || children.length === 0),
      tone: "secondary",
    },
    {
      action: "mark_replaced",
      label: "Close as replaced",
      title:
        activeRunReason ??
        taskReason ??
        doneReason ??
        (children.length === 0
          ? "No follow-up cards are available to replace the parent."
          : "Close the parent because the follow-up cards now own the remaining work."),
      disabled: Boolean(activeRunReason || taskReason || doneReason || children.length === 0),
      tone: "secondary",
    },
    {
      action: "accept_done_via_split",
      label: "Done via split",
      title:
        activeRunReason ??
        taskReason ??
        doneReason ??
        (!canCloseViaSplit
          ? "All split follow-up cards must be done or marked represented before closing the parent via split."
          : "Close the parent because every split follow-up card is done or already represented."),
      disabled: Boolean(activeRunReason || taskReason || doneReason || !canCloseViaSplit),
      tone: "primary",
    },
    {
      action: "reject_split",
      label: "Reject split",
      title:
        activeRunReason ??
        doneReason ??
        (outcome.status !== "proposed" && outcome.status !== "approved"
          ? "Only proposed or approved splits can be rejected."
          : "Reject unticketized split follow-ups while keeping the parent review decision visible."),
      disabled: Boolean(activeRunReason || doneReason || (outcome.status !== "proposed" && outcome.status !== "approved")),
      tone: "danger",
    },
  ];
  return {
    statusLabel: projectBoardSplitOutcomeStatusText(outcome.status),
    sourceLabel: outcome.source === "runtime_budget" ? "Runtime budget" : outcome.source === "proof_review" ? "Proof review" : "Manual split",
    reason: outcome.reason,
    partialProofSummary: outcome.partialProofSummary,
    completedCriteria: outcome.completedCriteria,
    remainingCriteria: outcome.remainingCriteria,
    children,
    unresolvedChildIds,
    canCloseViaSplit,
    actions,
  };
}

export function projectBoardProofDecisionModel(
  card: ProjectBoardCard,
  board: { charter?: { budgetPolicy?: Record<string, unknown> } },
  task?: OrchestrationTask,
  latestRun?: OrchestrationRun,
): ProjectBoardProofDecisionModel {
  const review = card.proofReview;
  const activeRun = Boolean(latestRun && projectBoardRunIsActive(latestRun));
  const projection = projectBoardCanonicalCardProjection(card, { task, latestRun });
  const done = projection.terminalDone;
  const manualDecisionWithoutReview = Boolean(!review && latestRun && projectBoardRunNeedsIntervention(latestRun) && projectBoardRunHasReviewableEvidence(latestRun));
  const baseUnavailableReason = !task
    ? "Ticketize the card before resolving proof."
    : activeRun
      ? "Wait for the current run to finish before resolving proof."
      : undefined;
  const reviewUnavailableReason =
    baseUnavailableReason ??
    (!review && !manualDecisionWithoutReview ? "Wait for the PM proof review before applying a close decision." : undefined);
  const acceptUnavailableReason = reviewUnavailableReason ?? (done ? "Card is already marked done." : undefined);
  const readyForDecision = Boolean(!baseUnavailableReason && (done || review || manualDecisionWithoutReview));
  const readinessLabel = activeRun ? "Proof not ready" : readyForDecision ? "Ready for decision" : "Awaiting proof review";
  const readinessReason = activeRun
    ? "Wait for the current run to finish before accepting, rejecting, or blocking this proof card."
    : !task
      ? "Ticketize the card before resolving proof."
      : readyForDecision
        ? "The proof card has a finished run or recorded PM review and can receive a PM decision."
        : "Run the card until a proof packet and PM proof review are recorded before applying a close decision.";
  const manualAcceptTitle = "No PM proof review is recorded. Close only after manual inspection confirms the run evidence satisfies the card.";
  const manualRetryTitle = "No PM proof review is recorded. Return the card to Ready with reviewer feedback after inspecting the run evidence.";
  const manualBlockedTitle = "No PM proof review is recorded. Mark blocked only after inspecting the run evidence and terminal error.";
  const actions: ProjectBoardProofDecisionActionModel[] = done
    ? []
    : [
        {
          action: "accept_done",
          label: "Accept as done",
          title: acceptUnavailableReason ?? (manualDecisionWithoutReview ? manualAcceptTitle : "Close the card and mark the linked Local Task done."),
          disabled: Boolean(acceptUnavailableReason),
          tone: "primary",
        },
        {
          action: "retry",
          label: "Send back for revision",
          title:
            reviewUnavailableReason ??
            (manualDecisionWithoutReview
              ? manualRetryTitle
              : "Return the card to Ready, clear the current proof review, record a history event, and include the reviewer note in the next run prompt."),
          disabled: Boolean(reviewUnavailableReason),
          tone: "secondary",
        },
        {
          action: "mark_blocked",
          label: "Mark blocked",
          title: reviewUnavailableReason ?? (manualDecisionWithoutReview ? manualBlockedTitle : "Record this proof decision as terminally blocked until the card is edited or unblocked."),
          disabled: Boolean(reviewUnavailableReason),
          tone: "danger",
        },
      ];
  return {
    statusLabel: activeRun ? readinessLabel : review ? projectBoardProofReviewStatusText(review.status) : "No PM review",
    recommendationLabel: review?.recommendedAction
      ? `Recommended: ${projectBoardProofRecommendedActionText(review.recommendedAction)}`
      : "No recommendation yet",
    rationale:
      projection.terminalDone && projection.summary ? projection.summary : review?.summary ||
      (manualDecisionWithoutReview
        ? "The PM loop has not judged this stopped run, but the run has evidence available for manual PM review."
        : "The PM loop has not judged this card's proof packet yet."),
    policySummary: projectBoardProofPolicySummary(board.charter?.budgetPolicy),
    nextAction: projectBoardProofNextAction(card, task, latestRun),
    readyForDecision,
    readinessLabel,
    readinessReason,
    awaitingRun: activeRun,
    actions,
  };
}

export function projectBoardProofFollowUpImpactModel(
  card: ProjectBoardCard,
  cards: ProjectBoardCard[],
): ProjectBoardProofFollowUpImpactModel {
  const review = card.proofReview;
  const followUpIds = [...new Set(review?.followUpCardIds ?? [])].filter(Boolean);
  const followUpCards = followUpIds
    .map((id) => cards.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is ProjectBoardCard => Boolean(candidate));
  const unresolvedFollowUpCardIds = followUpIds.filter((id) => !followUpCards.some((candidate) => candidate.id === id));
  const proofSuggestsFollowUp = Boolean(
    review &&
      (review.status === "needs_follow_up" ||
        review.recommendedAction === "follow_up" ||
        (review.missing.length > 0 && review.recommendedAction !== "retry" && review.recommendedAction !== "block")),
  );
  const visible = proofSuggestsFollowUp || followUpIds.length > 0;
  const missingProofCount = review?.missing.length ?? 0;
  const followUpCardCount = followUpCards.length;
  const cardsPreview = followUpCards.map((candidate) => projectBoardProofFollowUpCardPreview(card, candidate));
  const headline = !visible
    ? "No proof follow-up needed"
    : followUpCardCount > 0
      ? `${followUpCardCount} proof follow-up card${followUpCardCount === 1 ? "" : "s"} proposed`
      : "Proof follow-up recommended";
  const detail = !visible
    ? "This proof review does not currently recommend a follow-up card."
    : followUpCardCount > 0
      ? "The remaining proof gap is represented as draft follow-up work. Review or ticketize those draft cards instead of rewriting the approved parent card."
      : "The PM proof review recommends follow-up work, but no draft follow-up card is linked yet. Send the card back for revision or create a follow-up before closing.";
  const parentOutcome = !visible
    ? "Parent card can continue through the normal proof decision path."
    : followUpCardCount > 0
      ? "Parent stays blocked or in proof review until the follow-up card is resolved; existing approved fields are not rewritten."
      : "Parent should stay blocked or return to revision until the missing proof scope is materialized.";

  return {
    visible,
    headline,
    detail,
    parentOutcome,
    modelCallRequired: false,
    existingCardsRewritten: false,
    followUpCardCount,
    missingProofCount,
    unresolvedFollowUpCardIds,
    metrics: [
      {
        label: "Follow-ups",
        value: String(followUpCardCount),
        tone: followUpCardCount > 0 ? "success" : visible ? "warning" : "neutral",
      },
      {
        label: "Missing proof",
        value: String(missingProofCount),
        tone: missingProofCount > 0 ? "danger" : "success",
      },
      {
        label: "Model calls",
        value: "0",
        tone: "neutral",
      },
      {
        label: "Rewritten fields",
        value: "0",
        tone: "success",
      },
    ],
    cards: cardsPreview,
  };
}

export function projectBoardUiMockReviewPanelModel(
  card: ProjectBoardCard,
  latestRun: OrchestrationRun | undefined,
  proofDecision: ProjectBoardProofDecisionModel,
): ProjectBoardUiMockReviewPanelModel {
  if (!projectBoardCardIsUxMockGate(card)) {
    return {
      visible: false,
      statusLabel: "Not a UX mock",
      headline: "No UX mock review",
      detail: "This card is not the UX mock approval gate.",
      previewTitle: "No UX mock preview is available.",
      actions: [],
    };
  }
  const evidence = latestRun ? projectBoardProofEvidenceModel(latestRun, card) : undefined;
  const previewPath = evidence?.files.find((file) => /\.html?$/i.test(file.path) && file.meaningful)?.path ?? evidence?.files.find((file) => /\.html?$/i.test(file.path))?.path;
  const satisfied = projectBoardUxMockGateSatisfied(card);
  const actionByKind = new Map(proofDecision.actions.map((action) => [action.action, action]));
  const mappedAction = (
    action: ProjectBoardProofDecisionAction,
    label: string,
    fallbackTitle: string,
    tone: "primary" | "secondary" | "danger",
  ): ProjectBoardUiMockReviewActionModel => {
    const source = actionByKind.get(action);
    return {
      action,
      label,
      title: source?.title ?? fallbackTitle,
      disabled: source?.disabled ?? true,
      tone,
    };
  };
  return {
    visible: true,
    statusLabel: satisfied ? "Mock approved" : previewPath ? "Ready for review" : "Awaiting mock artifact",
    headline: satisfied ? "UX mock approved" : previewPath ? "Review UX mock artifact" : "UX mock artifact pending",
    detail: satisfied
      ? "This mock gate is satisfied; downstream UI implementation cards can become eligible for ticketization."
      : previewPath
        ? "Preview the generated HTML mock, then approve it, request revision, or reject it before downstream UI implementation proceeds."
        : "Run the mock-gate Local Task until it produces a self-contained HTML mock/spec artifact for review.",
    previewPath,
    previewTitle: previewPath ? `Preview generated UX mock artifact: ${previewPath}` : "No generated HTML mock artifact has been recorded in proof yet.",
    actions: satisfied
      ? [mappedAction("retry", "Request revision", "Send the UX mock card back for revision with reviewer feedback.", "secondary")]
      : [
          mappedAction("accept_done", "Approve mock", "Approve this UX mock and release gated implementation cards.", "primary"),
          mappedAction("retry", "Request revision", "Send the UX mock card back for revision with reviewer feedback.", "secondary"),
          mappedAction("mark_blocked", "Reject mock", "Reject this UX mock and keep downstream implementation blocked.", "danger"),
        ],
  };
}

function projectBoardRemainingWorkDetail(card: ProjectBoardCard, proofExpectationCount: number, blockerLabels: string[], latestRun?: OrchestrationRun, task?: OrchestrationTask): string {
  if (card.status === "done") return "Card is marked Done; no remaining work is recorded on the board.";
  if (card.status === "review") return "Review the latest proof packet against acceptance criteria before closing the card.";
  const taskPause = projectBoardTaskPauseDetail(task?.state);
  if (taskPause) return taskPause;
  if (blockerLabels.length > 0) return `Clear ${projectBoardJoinList(blockerLabels.slice(0, 3))} before continuing.`;
  if (latestRun && projectBoardRunNeedsIntervention(latestRun)) return `Inspect attempt ${latestRun.attemptNumber + 1} and resolve ${projectBoardReadableState(latestRun.status)} before retrying.`;

  const criteria = card.acceptanceCriteria.length;
  if (card.status === "in_progress" || (latestRun && projectBoardRunIsActive(latestRun))) {
    return `Continue until ${criteria || "all"} acceptance ${criteria === 1 ? "criterion is" : "criteria are"} satisfied and ${proofExpectationCount || "runtime"} proof is recorded.`;
  }
  if (criteria > 0 || proofExpectationCount > 0) {
    return `${criteria} acceptance ${criteria === 1 ? "criterion" : "criteria"} and ${proofExpectationCount} proof ${proofExpectationCount === 1 ? "expectation" : "expectations"} are waiting for execution.`;
  }
  return "Define acceptance criteria and proof expectations before relying on low-intervention execution.";
}

function projectBoardVerificationDetail(
  proofExpectationCount: number,
  afterRunHook: Record<string, unknown> | undefined,
  hasRunEvidence: boolean,
  taskActionVerificationCount = 0,
): string {
  if (afterRunHook) {
    const ok = afterRunHook.ok === false ? "failed" : "passed";
    const duration = typeof afterRunHook.durationMs === "number" ? ` in ${afterRunHook.durationMs}ms` : "";
    return `afterRun hook ${ok}${duration}.`;
  }
  if (taskActionVerificationCount > 0) return `${taskActionVerificationCount} verification ${taskActionVerificationCount === 1 ? "item was" : "items were"} reported through task actions.`;
  if (hasRunEvidence) return "Run evidence was recorded; no afterRun hook result was attached.";
  if (proofExpectationCount > 0) return `${proofExpectationCount} proof ${proofExpectationCount === 1 ? "expectation is" : "expectations are"} defined; command output is not recorded yet.`;
  return "No command, browser, or manual verification expectation is recorded yet.";
}

function projectBoardProofCollectedDetail(
  proofKind: string | undefined,
  messageCount: number | undefined,
  lastAssistantStatus: string | undefined,
  changedFileCount: number,
  gitStatusCount: number,
  taskActionCount: number,
  diffTruncated: boolean,
  focusLoop: Record<string, unknown> | undefined,
  elapsedMs?: number,
  outputCharCount?: number,
  toolMessageCount?: number,
): string {
  const parts: string[] = [];
  if (proofKind) parts.push(proofKind);
  if (elapsedMs !== undefined) parts.push(`${projectBoardDurationLabel(elapsedMs)} elapsed`);
  if (outputCharCount !== undefined) parts.push(`${outputCharCount.toLocaleString()} output chars`);
  if (messageCount !== undefined) parts.push(`${messageCount} ${messageCount === 1 ? "message" : "messages"}`);
  if (toolMessageCount !== undefined) parts.push(`${toolMessageCount} tool ${toolMessageCount === 1 ? "card" : "cards"}`);
  if (lastAssistantStatus) parts.push(`assistant ${projectBoardReadableState(lastAssistantStatus)}`);
  if (changedFileCount > 0) parts.push(`${changedFileCount} changed ${changedFileCount === 1 ? "file" : "files"}`);
  if (gitStatusCount > 0) parts.push(`${gitStatusCount} git status ${gitStatusCount === 1 ? "entry" : "entries"}`);
  if (taskActionCount > 0) parts.push(`${taskActionCount} task ${taskActionCount === 1 ? "action" : "actions"}`);
  if (diffTruncated) parts.push("diff truncated");
  if (typeof focusLoop?.passNumber === "number") {
    parts.push(`focus pass ${focusLoop.passNumber}${typeof focusLoop.reason === "string" ? ` ${focusLoop.reason}` : ""}`);
  }
  return parts.length > 0 ? `Proof packet: ${parts.join(", ")}.` : "No proof packet recorded yet.";
}

function projectBoardBlockerDetail(blockerLabels: string[], latestRun?: OrchestrationRun, task?: OrchestrationTask): string {
  if (blockerLabels.length > 0) return `Waiting on ${projectBoardJoinList(blockerLabels.slice(0, 4))}.`;
  const taskPause = projectBoardTaskPauseDetail(task?.state);
  if (taskPause) return taskPause;
  if (latestRun?.error) return `${projectBoardReadableState(latestRun.status)}: ${truncateProjectBoardLedgerText(latestRun.error, 180)}`;
  if (latestRun && projectBoardRunNeedsIntervention(latestRun)) return `Attempt ${latestRun.attemptNumber + 1} is ${projectBoardReadableState(latestRun.status)} and needs inspection.`;
  return "No blockers or review questions are recorded.";
}

function projectBoardNextActionState(
  card: ProjectBoardCard,
  task: OrchestrationTask | undefined,
  latestRun: OrchestrationRun | undefined,
  blockerLabels: string[],
  proofExpectationCount: number,
): ProjectBoardProgressLedgerState {
  if (projectBoardCanonicalCardProjection(card, { task, latestRun }).terminalDone) return "done";
  if (latestRun?.status === "completed" || card.status === "review") return "review";
  if (blockerLabels.length > 0 || (latestRun && projectBoardRunNeedsIntervention(latestRun))) return "blocked";
  const taskPause = projectBoardTaskPauseLedgerState(task?.state);
  if (taskPause) return taskPause;
  if (latestRun && projectBoardRunIsActive(latestRun)) return "active";
  if (card.status === "done") return "done";
  if (!task || proofExpectationCount === 0) return "missing";
  return "active";
}

function projectBoardNextActionDetail(
  card: ProjectBoardCard,
  task: OrchestrationTask | undefined,
  latestRun: OrchestrationRun | undefined,
  blockerLabels: string[],
  proofExpectationCount: number,
): string {
  if (blockerLabels.length > 0) return `Resolve ${projectBoardJoinList(blockerLabels.slice(0, 3))} before dispatch.`;
  if (latestRun?.status === "completed") return "Review the proof packet against the card's acceptance criteria and proof expectations.";
  if (task && latestRun && projectBoardRunNeedsIntervention(latestRun) && projectBoardRunHasReviewableEvidence(latestRun)) {
    return "Inspect the stopped run evidence; if it satisfies the card, accept manually, otherwise retry or mark it blocked.";
  }
  const taskPause = projectBoardTaskPauseDetail(task?.state);
  if (taskPause) return taskPause;
  if (latestRun && projectBoardRunIsActive(latestRun)) return "Let the current Pi attempt continue until it records proof or a terminal blocker.";
  if (card.status === "in_progress" || task?.state === "in_progress") return "Let the linked Local Task continue until it records proof or a terminal blocker.";
  if (latestRun?.status === "prepared" || latestRun?.status === "retry_queued") return "Start the prepared run when the card is still the next eligible task.";
  if (latestRun && projectBoardRunNeedsIntervention(latestRun)) return "Retry only after inspecting the run error and proof packet.";
  if (card.status === "done") return "No next action is required.";
  if (!task) return "Approve the draft into a Local Task before running.";
  if (proofExpectationCount === 0) return "Add proof expectations before relying on low-intervention execution.";
  return "Prepare or dispatch the next eligible run for this card.";
}

function projectBoardProofNextAction(card: ProjectBoardCard, task?: OrchestrationTask, latestRun?: OrchestrationRun): string {
  if (!task) return "Ticketize the card before the PM loop can resolve proof.";
  if (latestRun && projectBoardRunIsActive(latestRun)) return "Let the current Pi pass finish before making a close decision.";
  const review = card.proofReview;
  if ((card.status === "done" || task.state === "done") && review) {
    return "The card is done; no proof close decision is needed.";
  }
  if (card.status === "done" || task.state === "done") return "No close decision is needed; the card is done.";
  if (!review && latestRun?.status === "completed") {
    return "Inspect the completed run evidence; if it satisfies the card, accept manually, otherwise retry or mark it blocked.";
  }
  if (!review && latestRun && projectBoardRunNeedsIntervention(latestRun) && projectBoardRunHasReviewableEvidence(latestRun)) {
    return "Inspect the stopped run evidence; if it satisfies the card, accept manually, otherwise retry or mark it blocked.";
  }
  if (!review) return "Run the card until a proof packet and PM proof review are recorded.";
  if (review.recommendedAction === "close" || review.status === "ready_for_review" || review.status === "done") {
    return "Accept as done if the proof matches the card's acceptance criteria; otherwise retry or mark it blocked.";
  }
  if (review.recommendedAction === "retry" || review.status === "retry_recommended") {
    return "Retry the card after checking the missing proof and current run transcript.";
  }
  if (review.recommendedAction === "follow_up" || review.status === "needs_follow_up") {
    return "Review the proposed follow-up work, then retry the parent or leave it blocked.";
  }
  if (review.recommendedAction === "ask_user") return "Collect the missing user decision before another execution pass.";
  if (review.recommendedAction === "block" || review.status === "terminally_blocked") {
    return "Mark blocked unless the project manager wants to override and accept the proof.";
  }
  return "Use the recommendation, evidence quality, and missing proof list to close, retry, or block the card.";
}

function projectBoardRunStartControlLabel(status: string): string {
  if (status === "failed" || status === "stalled") return "Retry run";
  if (status === "canceled") return "Restart run";
  return "Start run";
}

function projectBoardExecutionActionFromProofDecision(action: ProjectBoardProofDecisionAction): ProjectBoardExecutionControlAction {
  if (action === "accept_done") return "accept_done";
  if (action === "mark_blocked") return "mark_blocked";
  return "retry_card";
}

function projectBoardExecutionControlStatusLabel(state: ProjectBoardExecutionControlState): string {
  if (state === "active") return "Worker active";
  if (state === "review") return "PM decision";
  if (state === "blocked") return "Needs intervention";
  if (state === "done") return "Closed";
  if (state === "ready") return "Ready to run";
  return "Not ready";
}

function projectBoardExecutionControlTaskLabel(task: OrchestrationTask, completedRunNeedsReview: boolean): string {
  return `${task.identifier} · ${projectBoardReadableState(completedRunNeedsReview ? "needs_review" : task.state)}`;
}

function projectBoardExecutionControlHeadline(
  state: ProjectBoardExecutionControlState,
  card: ProjectBoardCard,
  task?: OrchestrationTask,
  latestRun?: OrchestrationRun,
): string {
  if (state === "active") return "Worker is making progress";
  if (state === "review") return "Review proof and choose a PM close action";
  if (state === "blocked") {
    if (latestRun && projectBoardRunNeedsIntervention(latestRun)) return "Run needs retry or blocker triage";
    return "Resolve blockers before another worker pass";
  }
  if (state === "done") return "Card has been closed";
  if (state === "ready") return latestRun?.status === "prepared" ? "Prepared run is ready to start" : "Ready Local Task needs a run";
  if (!task) return card.status === "draft" ? "Ticketize this draft before execution" : "Linked Local Task is missing";
  return "Prepare or dispatch this card when it is next in order";
}

function projectBoardTaskPauseLedgerState(state?: string): ProjectBoardProgressLedgerState | undefined {
  if (state === "needs_review") return "review";
  if (state === "needs_info" || state === "budget_exhausted" || state === "terminal_blocker") return "blocked";
  return undefined;
}

function projectBoardTaskPauseDetail(state?: string): string | undefined {
  if (state === "needs_info") return "Collect the missing information or credentials before retrying this task.";
  if (state === "needs_review") return "Review the latest proof packet and decide whether the card can close or needs another pass.";
  if (state === "budget_exhausted") return "Increase budget, reduce scope, or split the card before retrying.";
  if (state === "terminal_blocker") return "Inspect the terminal blocker and update the card before another attempt.";
  return undefined;
}


function projectBoardActiveCardWorkflowExecutionError(error?: string): { kind: "missing_workflow" | "invalid_workflow"; message: string } | undefined {
  if (!error) return undefined;
  const normalized = error.toLowerCase();
  if (!normalized.includes("workflow")) return undefined;
  const kind =
    normalized.includes("missing_workflow_file") ||
    normalized.includes("workflow file not found") ||
    normalized.includes("not found") ||
    normalized.includes("missing workflow")
      ? "missing_workflow"
      : "invalid_workflow";
  const message = error.length > 220 ? `${error.slice(0, 217)}...` : error;
  return { kind, message };
}

function projectBoardActiveCardWorkflowReadinessBlocker(
  workflowReadiness?: OrchestrationWorkflowReadiness,
  orchestrationError?: string,
): { kind: "missing_workflow" | "invalid_workflow" | "auto_dispatch_disabled"; message: string } | undefined {
  if (workflowReadiness?.status === "missing") {
    return {
      kind: "missing_workflow",
      message: workflowReadiness.message ?? `Workflow file not found: ${workflowReadiness.path}`,
    };
  }
  if (workflowReadiness?.status === "invalid") {
    return {
      kind: "invalid_workflow",
      message: workflowReadiness.message ?? `Workflow file is invalid: ${workflowReadiness.path}`,
    };
  }
  if (workflowReadiness?.status === "ready" && workflowReadiness.autoDispatch === false) {
    return {
      kind: "auto_dispatch_disabled",
      message: `${workflowReadiness.path} has orchestration.auto_dispatch set to false.`,
    };
  }
  return projectBoardActiveCardWorkflowExecutionError(orchestrationError);
}

export function projectBoardExecutionControlModel(
  card: ProjectBoardCard,
  board: { charter?: { budgetPolicy?: Record<string, unknown> }; events?: ProjectBoardEvent[]; workflowReadiness?: OrchestrationWorkflowReadiness },
  detail: ProjectBoardActiveCardDetailModel,
  options: { runBusy?: string; claimBlocksPrepare?: boolean } = {},
): ProjectBoardExecutionControlModel {
  const task = detail.task;
  const latestRun = detail.latestRun;
  const projection = projectBoardCanonicalCardProjection(card, { task, latestRun });
  const activeRun = Boolean(latestRun && projectBoardRunIsActive(latestRun));
  const runNeedsIntervention = Boolean(!projection.suppressStaleRunState && latestRun && projectBoardRunNeedsIntervention(latestRun));
  const done = projection.terminalDone;
  const blockerCount = projection.suppressBlockers ? 0 : detail.blockedByCards.length + detail.blockedByTasks.length + detail.unresolvedBlockers.length;
  const completedRunNeedsReview = latestRun?.status === "completed" && !done;
  const taskPauseState = completedRunNeedsReview ? "review" : projectBoardTaskPauseLedgerState(task?.state);
  const readyTaskWithoutRun = !projection.suppressRetryActions && task?.state === "ready" && !latestRun;
  const revealWorkspacePath = latestRun?.workspacePath || task?.workspacePath;
  const proofDecision = projectBoardProofDecisionModel(card, board, task, latestRun);
  const nextAction = detail.progressLedger.find((entry) => entry.id === "next_action");
  const workflowReadinessBlocker = readyTaskWithoutRun ? projectBoardActiveCardWorkflowReadinessBlocker(board.workflowReadiness) : undefined;
  const currentWorkflowBlocker = workflowReadinessBlocker?.kind === "auto_dispatch_disabled" ? undefined : workflowReadinessBlocker;
  const latestExecutionReadinessEvent = currentWorkflowBlocker ? projectBoardLatestExecutionReadinessBlockerEvent(board.events) : undefined;
  const primaryState: ProjectBoardExecutionControlState =
    done
      ? "done"
      : blockerCount > 0 || runNeedsIntervention || taskPauseState === "blocked" || currentWorkflowBlocker
        ? "blocked"
        : activeRun || task?.state === "in_progress" || card.status === "in_progress"
          ? "active"
          : card.proofReview || card.status === "review" || latestRun?.status === "completed" || taskPauseState === "review"
            ? "review"
            : readyTaskWithoutRun || latestRun?.status === "prepared"
              ? "ready"
              : "missing";
  const actions: ProjectBoardExecutionControlActionModel[] = [];

  if (readyTaskWithoutRun) {
    const busyKey = "prepare:next";
    actions.push({
      action: "prepare_run",
      label: "Prepare run",
      busyLabel: "Preparing",
      title: options.claimBlocksPrepare
        ? "This card is claimed by another desktop or has a claim conflict. Resolve the claim before preparing a Local Task run."
        : currentWorkflowBlocker
          ? currentWorkflowBlocker.message
        : "Prepare the next eligible ready Local Task run so it can be started from this board.",
      disabled: options.claimBlocksPrepare === true || Boolean(currentWorkflowBlocker) || options.runBusy === busyKey,
      tone: "primary",
      busyKey,
    });
  }

  if (!projection.suppressRetryActions && latestRun && ["prepared", "failed", "canceled", "stalled"].includes(latestRun.status)) {
    const busyKey = `start:${latestRun.id}`;
    actions.push({
      action: "start_run",
      label: projectBoardRunStartControlLabel(latestRun.status),
      busyLabel: "Starting",
      title:
        latestRun.status === "failed" || latestRun.status === "stalled"
          ? "Retry this Local Task run after inspecting the error and proof ledger."
          : "Start this prepared Local Task run.",
      disabled: options.runBusy === busyKey,
      tone: latestRun.status === "failed" || latestRun.status === "stalled" ? "secondary" : "primary",
      busyKey,
      runId: latestRun.id,
    });
  }

  if (latestRun?.status === "running") {
    const busyKey = `cancel:${latestRun.id}`;
    actions.push({
      action: "cancel_run",
      label: "Cancel run",
      busyLabel: "Canceling",
      title: "Cancel the currently running Local Task attempt.",
      disabled: options.runBusy === busyKey,
      tone: "danger",
      busyKey,
      runId: latestRun.id,
    });
  }

  for (const action of proofDecision.actions) {
    const busyKey = `proof:${card.id}:${action.action}`;
    actions.push({
      action: projectBoardExecutionActionFromProofDecision(action.action),
      label: action.label,
      busyLabel: "Saving",
      title: action.title,
      disabled: action.disabled || options.runBusy === busyKey,
      tone: action.tone,
      busyKey,
      proofDecisionAction: action.action,
    });
  }

  if (latestRun?.threadId) {
    const busyKey = `thread:${latestRun.threadId}`;
    actions.push({
      action: "open_run_chat",
      label: "Open run chat",
      busyLabel: "Opening",
      title: "Open the Ambient chat that executed this Local Task run.",
      disabled: options.runBusy === busyKey,
      tone: "secondary",
      busyKey,
      threadId: latestRun.threadId,
    });
  }

  if (revealWorkspacePath) {
    const busyKey = `reveal:${revealWorkspacePath}`;
    actions.push({
      action: "reveal_workspace",
      label: "Reveal workspace",
      busyLabel: "Revealing",
      title: "Reveal the worktree or workspace used by this Local Task.",
      disabled: options.runBusy === busyKey,
      tone: "secondary",
      busyKey,
      workspacePath: revealWorkspacePath,
    });
  }

  return {
    state: primaryState,
    statusLabel: projectBoardExecutionControlStatusLabel(primaryState),
    headline: projection.terminalDone ? projection.statusLabel : projectBoardExecutionControlHeadline(primaryState, card, task, latestRun),
    detail: projection.terminalDone ? projection.summary : latestExecutionReadinessEvent?.summary ?? currentWorkflowBlocker?.message ?? nextAction?.detail ?? projectBoardProofNextAction(card, task, latestRun),
    taskLabel: task ? projectBoardExecutionControlTaskLabel(task, completedRunNeedsReview) : "No Local Task",
    runLabel: projection.runLabel ?? (latestRun ? `Run ${projectBoardReadableState(latestRun.status)} · attempt ${latestRun.attemptNumber + 1}` : "No run yet"),
    proofLabel: projection.proofLabel ?? proofDecision.statusLabel,
    blockerLabel: projection.blockerLabel ?? (currentWorkflowBlocker ? projectBoardReadableState(currentWorkflowBlocker.kind) : blockerCount > 0 ? `${blockerCount} blocker${blockerCount === 1 ? "" : "s"}` : "No blockers"),
    policySummary: proofDecision.policySummary,
    actions,
  };
}

export function projectBoardActiveCardOverviewModel(
  card: ProjectBoardCard,
  board: Pick<ProjectBoardSummary, "sources">,
  detail: ProjectBoardActiveCardDetailModel,
  execution: ProjectBoardExecutionControlModel,
): ProjectBoardActiveCardOverviewModel {
  const projection = projectBoardCanonicalCardProjection(card, { task: detail.task, latestRun: detail.latestRun });
  const decisions = projectBoardClarificationDecisions({
    clarificationDecisions: card.clarificationDecisions,
    clarificationQuestions: card.clarificationQuestions,
    clarificationSuggestions: card.clarificationSuggestions,
    clarificationAnswers: card.clarificationAnswers,
    includeInlineQuestions: false,
    limit: 50,
  });
  const openDecisions = decisions.filter((decision) => decision.state === "open");
  const answeredDecisions = decisions.filter((decision) => decision.state === "answered");
  const duplicateDecisions = decisions.filter((decision) => decision.state === "duplicate");
  const dismissedDecisions = decisions.filter((decision) => decision.state === "dismissed");
  const blockerCount = projection.suppressBlockers ? 0 : detail.blockedByCards.length + detail.blockedByTasks.length + detail.unresolvedBlockers.length;
  const proofExpectationCount = detail.proofExpectationCount;
  const sourceBasis = projectBoardCardSourceBasis(card, board.sources ?? []);
  const feedbackCount = card.runFeedback?.length ?? 0;
  const runCount = detail.runs.length;
  const ticketized = Boolean(card.orchestrationTaskId) || card.status !== "draft";
  const piUpdateFieldCount = card.pendingPiUpdate?.changedFields.length ?? 0;
  const proofDetail = card.proofReview?.summary ?? (proofExpectationCount > 0 ? "Proof expectations are ready for PM review after the run." : "Add proof expectations before this can be safely closed.");
  const taskActionDiagnosticsDetail = projectBoardTaskActionDiagnosticsDetail(detail.latestRun?.proofOfWork);
  const completedRunNeedsReview = detail.latestRun?.status === "completed" && !projection.terminalDone;
  const sections: ProjectBoardActiveCardOverviewSection[] = [
    {
      id: "decision",
      label: "Decision state",
      headline:
        openDecisions.length > 0
          ? `${openDecisions.length} open decision${openDecisions.length === 1 ? "" : "s"}`
          : answeredDecisions.length > 0 || duplicateDecisions.length > 0
            ? "Decisions resolved"
            : "No PM decisions",
      detail:
        openDecisions.length > 0
          ? ticketized
            ? "Resolve from the Decisions tab or add next-run feedback. Approved card fields are not rewritten silently."
            : "Answer before approving this draft card."
          : duplicateDecisions.length > 0
            ? `${duplicateDecisions.length} duplicate decision${duplicateDecisions.length === 1 ? "" : "s"} collapsed into the audit trail.`
            : "No decision gate is blocking this card.",
      tone: openDecisions.length > 0 ? "warning" : "done",
      countLabel: openDecisions.length > 0 ? String(openDecisions.length) : answeredDecisions.length > 0 ? `${answeredDecisions.length} answered` : undefined,
    },
    {
      id: "execution",
      label: "Execution",
      headline: execution.headline,
      detail: execution.detail,
      tone: projectBoardExecutionOverviewTone(execution.state),
      countLabel: execution.statusLabel,
    },
    {
      id: "proof",
      label: "Proof",
      headline: card.proofReview
        ? projectBoardProofReviewStatusText(card.proofReview.status)
        : proofExpectationCount > 0
          ? `${proofExpectationCount} proof expectation${proofExpectationCount === 1 ? "" : "s"}`
          : "Proof missing",
      detail: taskActionDiagnosticsDetail ? `${proofDetail} Task actions: ${taskActionDiagnosticsDetail}.` : proofDetail,
      tone: projectBoardActiveCardProofTone(card, proofExpectationCount),
      countLabel: proofExpectationCount > 0 ? String(proofExpectationCount) : undefined,
    },
    {
      id: "dependencies",
      label: "Dependencies",
      headline: projection.blockerLabel ?? (blockerCount > 0 ? `${blockerCount} blocker${blockerCount === 1 ? "" : "s"}` : "No blockers"),
      detail:
        projection.terminalDone
          ? "Closed cards no longer expose historical blockers as active board blockers."
          : blockerCount > 0
          ? "Resolve listed card, Local Task, or unresolved references before this work is unblocked."
          : detail.unblocks.length > 0
            ? `Completing this card can unblock ${detail.unblocks.length} downstream card${detail.unblocks.length === 1 ? "" : "s"}.`
            : "This card is independent in the current dependency map.",
      tone: blockerCount > 0 ? "blocked" : "done",
      countLabel: detail.unblocks.length > 0 ? `${detail.unblocks.length} unblocks` : undefined,
    },
    {
      id: "source",
      label: "Source basis",
      headline: sourceBasis.length > 0 ? `${sourceBasis.length} source reference${sourceBasis.length === 1 ? "" : "s"}` : "No source link",
      detail: sourceBasis[0]?.label ?? "This card does not have a source basis reference.",
      tone: sourceBasis.length > 0 ? "neutral" : "warning",
      countLabel: sourceBasis.length > 0 ? String(sourceBasis.length) : undefined,
    },
    {
      id: "feedback",
      label: "Next-run feedback",
      headline: feedbackCount > 0 ? `${feedbackCount} additive note${feedbackCount === 1 ? "" : "s"}` : "No next-run notes",
      detail:
        feedbackCount > 0
          ? "Feedback is appended to the next Local Task prompt without rewriting approved fields."
          : ticketized
            ? "Use feedback for small retry instructions; split or follow-up for material scope changes."
            : "Draft edits belong in the Draft Inbox before ticketization.",
      tone: feedbackCount > 0 ? "ready" : "neutral",
      countLabel: feedbackCount > 0 ? String(feedbackCount) : undefined,
    },
    {
      id: "history",
      label: "History",
      headline: runCount > 0 ? `${runCount} run attempt${runCount === 1 ? "" : "s"}` : "No runs yet",
      detail: projection.terminalDone && projection.runLabel
        ? `${projection.runLabel}; retained for audit.`
        : detail.latestRun
        ? `Latest run is ${projectBoardReadableState(detail.latestRun.status)} attempt ${detail.latestRun.attemptNumber + 1}.`
        : detail.latestExecutionArtifact
          ? "Imported Git board artifact is available for review."
          : "Run history will appear after preparation starts.",
      tone: projection.terminalDone ? "done" : detail.latestRun?.status === "failed" || detail.latestRun?.status === "stalled" ? "blocked" : "neutral",
      countLabel: runCount > 0 ? String(runCount) : undefined,
    },
  ];

  if (card.pendingPiUpdate) {
    sections.splice(1, 0, {
      id: "pi_update",
      label: ticketized ? "Protected Pi proposal" : "Pi update",
      headline: `${piUpdateFieldCount} proposed field${piUpdateFieldCount === 1 ? "" : "s"}`,
      detail: ticketized
        ? "Review as follow-up or next-run feedback. Approved card fields stay protected."
        : "Review and apply or ignore this draft update before ticketization.",
      tone: ticketized ? "warning" : "ready",
      countLabel: card.pendingPiUpdate.changedFields.map(projectBoardReadableState).slice(0, 2).join(", "),
    });
  }

  const uiMockBadges = projectBoardUiMockReviewBadges(card, [card, ...detail.blockedByCards, ...detail.unblocks]);
  const badges: ProjectBoardActiveCardOverviewBadge[] = [
    { label: "Card", value: projection.statusLabel, tone: projectBoardExecutionOverviewTone(projection.terminalDone ? "done" : execution.state) },
    ...uiMockBadges,
    { label: "Task", value: detail.task ? projectBoardExecutionControlTaskLabel(detail.task, completedRunNeedsReview) : "No Local Task", tone: detail.task ? "neutral" : "warning" },
    {
      label: "Run",
      value: projection.runLabel ?? (detail.latestRun ? projectBoardReadableState(detail.latestRun.status) : "No run"),
      tone: projection.terminalDone ? "done" : detail.latestRun ? projectBoardRunOverviewTone(detail.latestRun.status) : "neutral",
    },
    {
      label: "Proof",
      value: projection.proofLabel ?? (card.proofReview ? projectBoardProofReviewStatusText(card.proofReview.status) : proofExpectationCount > 0 ? "Expected" : "Missing"),
      tone: projectBoardActiveCardProofTone(card, proofExpectationCount),
    },
  ];

  return {
    headline: execution.headline,
    detail: execution.detail,
    badges,
    sections,
    decisionAudit: {
      open: openDecisions.length,
      answered: answeredDecisions.length,
      duplicate: duplicateDecisions.length,
      dismissed: dismissedDecisions.length,
    },
    sourceBasis,
  };
}

function projectBoardExecutionOverviewTone(state: ProjectBoardExecutionControlState): ProjectBoardActiveCardOverviewTone {
  if (state === "ready") return "ready";
  if (state === "active") return "running";
  if (state === "review") return "review";
  if (state === "blocked" || state === "missing") return "blocked";
  if (state === "done") return "done";
  return "neutral";
}

function projectBoardCardStatusOverviewTone(status: ProjectBoardCardStatus): ProjectBoardActiveCardOverviewTone {
  if (status === "ready") return "ready";
  if (status === "in_progress") return "running";
  if (status === "review") return "review";
  if (status === "blocked") return "blocked";
  if (status === "done" || status === "archived") return "done";
  return "neutral";
}

function projectBoardRunOverviewTone(status: OrchestrationRun["status"]): ProjectBoardActiveCardOverviewTone {
  if (status === "running") return "running";
  if (status === "completed") return "review";
  if (status === "prepared") return "ready";
  if (status === "failed" || status === "stalled" || status === "canceled") return "blocked";
  return "neutral";
}

function projectBoardActiveCardProofTone(
  card: ProjectBoardCard,
  proofExpectationCount: number,
): ProjectBoardActiveCardOverviewTone {
  if (!card.proofReview) return proofExpectationCount > 0 ? "ready" : "warning";
  if (card.proofReview.status === "ready_for_review" || card.proofReview.status === "needs_follow_up") return "review";
  if (card.proofReview.status === "done") return "done";
  if (card.proofReview.status === "terminally_blocked" || card.proofReview.status === "retry_recommended") return "blocked";
  return "neutral";
}

function projectBoardLatestExecutionReadinessBlockerEvent(events: ProjectBoardEvent[] = []): ProjectBoardEvent | undefined {
  return events.find((event) => event.kind === "execution_readiness_blocked");
}


export function projectBoardProgressLedgerForCard(input: {
  card: ProjectBoardCard;
  task?: OrchestrationTask;
  latestRun?: OrchestrationRun;
  blockedByCards: ProjectBoardCard[];
  blockedByTasks: OrchestrationTask[];
  unresolvedBlockers: string[];
  proofExpectationCount: number;
  latestArtifactByCardId?: Map<string, ProjectBoardExecutionArtifact>;
}): ProjectBoardProgressLedgerEntry[] {
  const proof = input.latestRun?.proofOfWork;
  const proofKind = projectBoardProofText(proof?.kind);
  const isPreparationProof = proofKind === "preparation" || proofKind === "scheduled-preparation";
  const isRunningProgressProof = proofKind === "agent-run-progress";
  const progress = projectBoardProofObject(proof?.progress);
  const taskActions = projectBoardTaskActionEvidenceFromProof(proof);
  const taskActionRecords = projectBoardTaskActionObjectsFromProof(proof);
  const taskActionDiagnosticsDetail = projectBoardTaskActionDiagnosticsDetail(proof);
  const changedFiles = projectBoardUniqueProofItems(
    [...projectBoardProofArray(proof?.changedFiles), ...projectBoardTaskActionArray(taskActionRecords, "changedFiles")],
    projectBoardProofFileLabel,
  );
  const gitStatus = projectBoardProofArray(proof?.gitStatus).map((item) => String(item));
  const lastAssistantText = projectBoardProofText(proof?.lastAssistantText);
  const lastAssistantStatus = projectBoardProofText(proof?.lastAssistantStatus);
  const messageCount = typeof proof?.messageCount === "number" ? proof.messageCount : undefined;
  const elapsedMs = typeof proof?.elapsedMs === "number" ? proof.elapsedMs : typeof progress?.elapsedMs === "number" ? progress.elapsedMs : undefined;
  const outputCharCount =
    typeof proof?.outputCharCount === "number" ? proof.outputCharCount : typeof progress?.outputCharCount === "number" ? progress.outputCharCount : undefined;
  const toolMessageCount =
    typeof proof?.toolMessageCount === "number" ? proof.toolMessageCount : typeof progress?.toolMessageCount === "number" ? progress.toolMessageCount : undefined;
  const afterRunHook = projectBoardProofObject(proof?.afterRunHook);
  const focusLoop = projectBoardProofObject(proof?.focusLoop);
  const afterRunHookOk = typeof afterRunHook?.ok === "boolean" ? afterRunHook.ok : undefined;
  const taskActionVerificationCount =
    projectBoardTaskActionArray(taskActionRecords, "commands").length +
    projectBoardTaskActionArray(taskActionRecords, "screenshots").length +
    projectBoardTaskActionArray(taskActionRecords, "visualChecks").length +
    projectBoardTaskActionArray(taskActionRecords, "browserTraces").length +
    projectBoardTaskActionArray(taskActionRecords, "manualChecks").length;
  const latestTaskAction = [...taskActions].reverse().find((action) => action.action !== "task_show");
  const latestTaskActionIsBlocked = latestTaskAction?.tone === "danger";
  const hasFinalTaskAction = taskActions.some((action) => action.action === "task_complete" || action.action === "task_report_proof" || action.action === "task_report_handoff");
  const hasRunEvidence = Boolean(
    proof &&
      !isPreparationProof &&
      !isRunningProgressProof &&
      (lastAssistantText || messageCount !== undefined || changedFiles.length > 0 || gitStatus.length > 0 || taskActions.length > 0),
  );
  const hasRunningProgressEvidence = Boolean(
    proof && isRunningProgressProof && (messageCount !== undefined || outputCharCount !== undefined || toolMessageCount !== undefined || taskActions.length > 0),
  );
  const projection = projectBoardCanonicalCardProjection(input.card, { task: input.task, latestRun: input.latestRun });
  const taskPauseState = projectBoardTaskPauseLedgerState(input.task?.state);
  const blockerLabels = projection.suppressBlockers
    ? []
    : [
        ...input.blockedByCards.filter((card) => !projectBoardDependencySatisfied(card, input.latestArtifactByCardId)).map((card) => card.title),
        ...input.blockedByTasks.filter((task) => !projectBoardTaskDependencySatisfied(task)).map((task) => task.identifier),
        ...input.unresolvedBlockers.map((blocker) => `unresolved ${blocker}`),
      ];
  const latestRunBlocked = Boolean(!projection.suppressStaleRunState && input.latestRun && projectBoardRunNeedsIntervention(input.latestRun));
  const active = Boolean(!taskPauseState && ((input.latestRun && projectBoardRunIsActive(input.latestRun)) || input.task?.state === "in_progress" || input.card.status === "in_progress"));
  const completed = projection.terminalDone || input.latestRun?.status === "completed";

  return [
    {
      id: "completed_work",
      label: "Completed work",
      state:
        completed || (!isRunningProgressProof && lastAssistantText) || latestTaskAction?.action === "task_complete"
          ? "done"
          : latestTaskActionIsBlocked
            ? "blocked"
            : taskPauseState ?? (active || hasRunningProgressEvidence ? "active" : latestRunBlocked ? "blocked" : "missing"),
      detail: latestTaskAction
          ? `${latestTaskAction.label}: ${truncateProjectBoardLedgerText(latestTaskAction.summary, 180)}`
        : lastAssistantText
          ? truncateProjectBoardLedgerText(lastAssistantText, 220)
        : input.latestRun
          ? `Attempt ${input.latestRun.attemptNumber + 1} is ${projectBoardReadableState(input.latestRun.status)}.`
          : input.task
            ? `Linked Local Task ${input.task.identifier} is ${projectBoardReadableState(input.task.state)}.`
            : "No Local Task run has started for this card yet.",
    },
    {
      id: "remaining_work",
      label: "Remaining work",
      state: completed ? "done" : input.card.status === "review" ? "review" : taskPauseState ?? (blockerLabels.length > 0 || latestRunBlocked ? "blocked" : active ? "active" : "missing"),
      detail: projection.terminalDone ? projection.summary : projectBoardRemainingWorkDetail(input.card, input.proofExpectationCount, blockerLabels, input.latestRun, input.task),
    },
    {
      id: "files_touched",
      label: "Files touched",
      state: changedFiles.length > 0 || gitStatus.length > 0 ? "done" : active ? "active" : "missing",
      detail:
        changedFiles.length > 0
          ? changedFiles.slice(0, 6).map(projectBoardProofFileLabel).join(", ")
          : gitStatus.length > 0
            ? gitStatus.slice(0, 6).join("; ")
            : "No changed files recorded yet.",
    },
    {
      id: "verification",
      label: "Verification",
      state:
        afterRunHookOk === false
          ? "blocked"
          : afterRunHook || taskActionVerificationCount > 0 || hasRunEvidence || hasFinalTaskAction
            ? "done"
            : active || hasRunningProgressEvidence
              ? "active"
              : input.proofExpectationCount > 0
                ? "review"
                : "missing",
      detail: projectBoardVerificationDetail(input.proofExpectationCount, afterRunHook, hasRunEvidence || hasFinalTaskAction, taskActionVerificationCount),
    },
    {
      id: "proof_collected",
      label: "Proof collected",
      state: hasRunEvidence ? "done" : hasRunningProgressEvidence ? "active" : proof ? "review" : "missing",
      detail: projectBoardProofCollectedDetail(
        proofKind,
        messageCount,
        lastAssistantStatus,
        changedFiles.length,
        gitStatus.length,
        taskActions.length,
        Boolean(proof?.diffTruncated),
        focusLoop,
        elapsedMs,
        outputCharCount,
        toolMessageCount,
      ),
    },
    {
      id: "task_actions",
      label: "Task actions",
      state:
        taskActions.some((action) => action.tone === "danger")
          ? "blocked"
          : taskActions.length > 0
            ? isRunningProgressProof && !hasFinalTaskAction
              ? "active"
              : "done"
            : active
              ? "active"
              : "missing",
      detail:
        taskActions.length > 0
          ? [
              taskActionDiagnosticsDetail,
              ...taskActions
                .slice(-4)
                .map((action) => `${action.label}: ${truncateProjectBoardLedgerText(action.summary, 120)}`),
            ]
              .filter(Boolean)
              .join(" | ")
          : "No structured task actions reported by Pi yet.",
    },
    {
      id: "blockers_questions",
      label: "Blockers / questions",
      state: blockerLabels.length > 0 || latestRunBlocked || taskPauseState === "blocked" ? "blocked" : taskPauseState === "review" ? "review" : "done",
      detail: projection.terminalDone ? "No active blockers remain after the PM done decision." : projectBoardBlockerDetail(blockerLabels, input.latestRun, input.task),
    },
    {
      id: "next_action",
      label: "Next action",
      state: projectBoardNextActionState(input.card, input.task, input.latestRun, blockerLabels, input.proofExpectationCount),
      detail: projection.terminalDone ? "No next action is required; historical run issues are audit-only." : projectBoardNextActionDetail(input.card, input.task, input.latestRun, blockerLabels, input.proofExpectationCount),
    },
  ];
}


export function projectBoardRequiresProofSpec(board: ProjectBoardSummary): boolean {
  return projectBoardProofPolicyRequiresProofSpec(board.charter?.testPolicy);
}

export function projectBoardCardHasProofSpec(card: ProjectBoardCard): boolean {
  return projectBoardCardProofCount(card) > 0;
}


export function projectBoardCardBlockedByOpenUxMockGate(card: ProjectBoardCard, boardCards: ProjectBoardCard[]): boolean {
  return Boolean(projectBoardOpenUxMockGateBlocker(card, boardCards) || projectBoardCardMissingRequiredUxMockGate(card, boardCards));
}

function projectBoardOpenUxMockGateBlocker(card: ProjectBoardCard, boardCards: ProjectBoardCard[]): ProjectBoardCard | undefined {
  if (projectBoardCardIsUxMockGate(card)) return undefined;
  const blockers = card.blockedBy
    .map((ref) => boardCards.find((candidate) => projectBoardCardMatchesRef(candidate, ref)))
    .filter((candidate): candidate is ProjectBoardCard => Boolean(candidate));
  return blockers.find((candidate) => projectBoardCardIsUxMockGate(candidate) && !projectBoardUxMockGateSatisfied(candidate));
}

function projectBoardCardMissingRequiredUxMockGate(card: ProjectBoardCard, boardCards: ProjectBoardCard[]): boolean {
  if (projectBoardCardIsUxMockGate(card)) return false;
  if (card.uiMockRole !== "gated_implementation" && !card.requiresUiMockApproval) return false;
  const blockers = card.blockedBy
    .map((ref) => boardCards.find((candidate) => projectBoardCardMatchesRef(candidate, ref)))
    .filter((candidate): candidate is ProjectBoardCard => Boolean(candidate));
  return !blockers.some((candidate) => projectBoardCardIsUxMockGate(candidate) && projectBoardUxMockGateSatisfied(candidate));
}

function projectBoardCardIsUxMockGate(card: Pick<ProjectBoardCard, "sourceId" | "title" | "labels" | "description" | "uiMockRole">): boolean {
  if (card.uiMockRole === "mock_gate") return true;
  const haystack = `${card.sourceId}\n${card.title}\n${card.description}`.toLowerCase();
  return (
    card.sourceId === "synthesis:ux-mock-approval" ||
    card.labels.some((label) => label.toLowerCase() === "ux-mock-approval") ||
    /\b(ux|ui|user interface)\b.{0,40}\b(mock|prototype|wireframe|approval|review)\b/.test(haystack) ||
    /\b(mock|prototype|wireframe)\b.{0,40}\b(ux|ui|user interface|approval|review)\b/.test(haystack)
  );
}

function projectBoardUxMockGateSatisfied(card: ProjectBoardCard): boolean {
  return card.status === "done" || card.candidateStatus === "evidence";
}

export function projectBoardUiMockReviewBadges(card: ProjectBoardCard, boardCards: ProjectBoardCard[] = []): ProjectBoardActiveCardOverviewBadge[] {
  if (projectBoardCardIsUxMockGate(card)) {
    return [
      {
        label: "UX Mock",
        value: projectBoardUxMockGateSatisfied(card) ? "Approved" : "Approval gate",
        tone: projectBoardUxMockGateSatisfied(card) ? "done" : "warning",
      },
    ];
  }
  if (card.uiMockRole !== "gated_implementation" && !card.requiresUiMockApproval) return [];
  return [
    {
      label: "UX Mock",
      value: projectBoardCardBlockedByOpenUxMockGate(card, boardCards) ? "Waiting approval" : "Approved",
      tone: projectBoardCardBlockedByOpenUxMockGate(card, boardCards) ? "blocked" : "done",
    },
  ];
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
      tone: report.sourceConfidence === "high" ? "ready" : report.sourceConfidence === "low" || report.sourceConfidence === "unknown" ? "warning" : "neutral",
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
