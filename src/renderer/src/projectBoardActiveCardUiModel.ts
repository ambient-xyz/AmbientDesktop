import type {
  ProjectBoardCard,
  ProjectBoardCardSplitOutcomeStatus,
  ProjectBoardEvent,
  ProjectBoardExecutionArtifact,
  ProjectBoardProofDecisionAction,
  ProjectBoardSplitDecisionAction,
  ProjectBoardSummary,
} from "../../shared/projectBoardTypes";
import type { OrchestrationRun, OrchestrationTask, OrchestrationWorkflowReadiness } from "../../shared/workflowTypes";
import { projectBoardClarificationDecisions } from "../../shared/projectBoardClarificationDecisions";
import { projectBoardProofPolicyRequiresProofSpec } from "../../shared/projectBoardProofImpact";
import { projectBoardCanonicalCardProjection, projectBoardCardStatusText } from "./projectBoardActiveCardProjectionUiModel";
import type { ProjectBoardVisualTone } from "./projectBoardActiveCardProjectionUiModel";
import { projectBoardProgressLedgerForCard } from "./projectBoardActiveCardProgressLedgerUiModel";
import type { ProjectBoardProgressLedgerEntry } from "./projectBoardActiveCardProgressLedgerUiModel";
import { projectBoardTaskPauseLedgerState } from "./projectBoardActiveCardTaskPauseUiModel";
import { projectBoardCardSourceBasis } from "./projectBoardSourceUiModel";
import type { ProjectBoardCardSourceBasisItem } from "./projectBoardSourceUiModel";
import {
  projectBoardCardMatchesRef,
  projectBoardCardProofCount,
  projectBoardDependencySatisfied,
  projectBoardExecutionArtifactTime,
  projectBoardLatestExecutionArtifactByCard,
  projectBoardTaskDependencySatisfied,
  projectBoardTaskMatchesRef,
} from "./projectBoardDependencyUiModel";
import { compareProjectBoardRunsLatestFirst } from "./projectBoardExecutionUiModel";
import {
  projectBoardProofEvidenceModel,
  projectBoardProofPolicySummary,
  projectBoardProofRecommendedActionText,
  projectBoardProofReviewStatusText,
  projectBoardReadableState,
  projectBoardRunHasReviewableEvidence,
  projectBoardRunIsActive,
  projectBoardRunNeedsIntervention,
  projectBoardTaskActionDiagnosticsDetail,
  truncateProjectBoardLedgerText,
} from "./projectBoardProofEvidenceUiModel";
import type { ProjectBoardProofEvidenceTone } from "./projectBoardProofEvidenceUiModel";

export { projectBoardCanonicalCardProjection, projectBoardCardVisualTone } from "./projectBoardActiveCardProjectionUiModel";
export type {
  ProjectBoardCanonicalCardProjection,
  ProjectBoardCanonicalCardProjectionKind,
  ProjectBoardVisualTone,
} from "./projectBoardActiveCardProjectionUiModel";
export {
  projectBoardExecutionPmReview,
  projectBoardPmReviewGitStateText,
  projectBoardPmReviewReadinessText,
  projectBoardPmReviewReportUiModel,
  projectBoardPmReviewSourceConfidenceText,
} from "./projectBoardActiveCardPmReviewUiModel";
export type {
  ProjectBoardExecutionPmImpact,
  ProjectBoardExecutionPmImpactTone,
  ProjectBoardExecutionPmReview,
  ProjectBoardPmReviewReportCoverage,
  ProjectBoardPmReviewReportSectionModel,
  ProjectBoardPmReviewReportUiModel,
  ProjectBoardPulledHandoffFollowUp,
} from "./projectBoardActiveCardPmReviewUiModel";
export { projectBoardLiveSessionPreviewModel } from "./projectBoardActiveCardLiveSessionUiModel";
export type {
  ProjectBoardLiveSessionActivityKind,
  ProjectBoardLiveSessionActivityLine,
  ProjectBoardLiveSessionPreviewAction,
  ProjectBoardLiveSessionPreviewActivity,
  ProjectBoardLiveSessionPreviewMetric,
  ProjectBoardLiveSessionPreviewModel,
  ProjectBoardLiveSessionTone,
} from "./projectBoardActiveCardLiveSessionUiModel";
export { projectBoardProgressLedgerForCard } from "./projectBoardActiveCardProgressLedgerUiModel";
export type { ProjectBoardProgressLedgerEntry, ProjectBoardProgressLedgerState } from "./projectBoardActiveCardProgressLedgerUiModel";

function projectBoardProofEligibleCards(cards: ProjectBoardCard[]): ProjectBoardCard[] {
  return cards.filter(
    (card) =>
      card.status !== "archived" &&
      card.candidateStatus !== "evidence" &&
      card.candidateStatus !== "rejected" &&
      card.candidateStatus !== "duplicate",
  );
}

export interface ProjectBoardPhaseGroup {
  phase: string;
  cards: ProjectBoardCard[];
  blockedCount: number;
  readyCount: number;
  reviewCount: number;
  criticalPathCount: number;
  tone: ProjectBoardVisualTone;
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

function projectBoardProofFollowUpCardPreview(parent: ProjectBoardCard, card: ProjectBoardCard): ProjectBoardProofFollowUpCardPreview {
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
    unblocks: cards.filter(
      (candidate) => candidate.id !== card.id && candidate.blockedBy.some((blocker) => projectBoardCardMatchesRef(card, blocker)),
    ),
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
    sourceLabel:
      outcome.source === "runtime_budget" ? "Runtime budget" : outcome.source === "proof_review" ? "Proof review" : "Manual split",
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
  const manualDecisionWithoutReview = Boolean(
    !review && latestRun && projectBoardRunNeedsIntervention(latestRun) && projectBoardRunHasReviewableEvidence(latestRun),
  );
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
  const manualAcceptTitle =
    "No PM proof review is recorded. Close only after manual inspection confirms the run evidence satisfies the card.";
  const manualRetryTitle =
    "No PM proof review is recorded. Return the card to Ready with reviewer feedback after inspecting the run evidence.";
  const manualBlockedTitle = "No PM proof review is recorded. Mark blocked only after inspecting the run evidence and terminal error.";
  const actions: ProjectBoardProofDecisionActionModel[] = done
    ? []
    : [
        {
          action: "accept_done",
          label: "Accept as done",
          title:
            acceptUnavailableReason ??
            (manualDecisionWithoutReview ? manualAcceptTitle : "Close the card and mark the linked Local Task done."),
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
          title:
            reviewUnavailableReason ??
            (manualDecisionWithoutReview
              ? manualBlockedTitle
              : "Record this proof decision as terminally blocked until the card is edited or unblocked."),
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
      projection.terminalDone && projection.summary
        ? projection.summary
        : review?.summary ||
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
  const previewPath =
    evidence?.files.find((file) => /\.html?$/i.test(file.path) && file.meaningful)?.path ??
    evidence?.files.find((file) => /\.html?$/i.test(file.path))?.path;
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
    previewTitle: previewPath
      ? `Preview generated UX mock artifact: ${previewPath}`
      : "No generated HTML mock artifact has been recorded in proof yet.",
    actions: satisfied
      ? [mappedAction("retry", "Request revision", "Send the UX mock card back for revision with reviewer feedback.", "secondary")]
      : [
          mappedAction("accept_done", "Approve mock", "Approve this UX mock and release gated implementation cards.", "primary"),
          mappedAction("retry", "Request revision", "Send the UX mock card back for revision with reviewer feedback.", "secondary"),
          mappedAction("mark_blocked", "Reject mock", "Reject this UX mock and keep downstream implementation blocked.", "danger"),
        ],
  };
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

function projectBoardActiveCardWorkflowExecutionError(
  error?: string,
): { kind: "missing_workflow" | "invalid_workflow"; message: string } | undefined {
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
  board: {
    charter?: { budgetPolicy?: Record<string, unknown> };
    events?: ProjectBoardEvent[];
    workflowReadiness?: OrchestrationWorkflowReadiness;
  },
  detail: ProjectBoardActiveCardDetailModel,
  options: { runBusy?: string; claimBlocksPrepare?: boolean } = {},
): ProjectBoardExecutionControlModel {
  const task = detail.task;
  const latestRun = detail.latestRun;
  const projection = projectBoardCanonicalCardProjection(card, { task, latestRun });
  const activeRun = Boolean(latestRun && projectBoardRunIsActive(latestRun));
  const runNeedsIntervention = Boolean(!projection.suppressStaleRunState && latestRun && projectBoardRunNeedsIntervention(latestRun));
  const done = projection.terminalDone;
  const blockerCount = projection.suppressBlockers
    ? 0
    : detail.blockedByCards.length + detail.blockedByTasks.length + detail.unresolvedBlockers.length;
  const completedRunNeedsReview = latestRun?.status === "completed" && !done;
  const taskPauseState = completedRunNeedsReview ? "review" : projectBoardTaskPauseLedgerState(task?.state);
  const readyTaskWithoutRun = !projection.suppressRetryActions && task?.state === "ready" && !latestRun;
  const revealWorkspacePath = latestRun?.workspacePath || task?.workspacePath;
  const proofDecision = projectBoardProofDecisionModel(card, board, task, latestRun);
  const nextAction = detail.progressLedger.find((entry) => entry.id === "next_action");
  const workflowReadinessBlocker = readyTaskWithoutRun
    ? projectBoardActiveCardWorkflowReadinessBlocker(board.workflowReadiness)
    : undefined;
  const currentWorkflowBlocker = workflowReadinessBlocker?.kind === "auto_dispatch_disabled" ? undefined : workflowReadinessBlocker;
  const latestExecutionReadinessEvent = currentWorkflowBlocker ? projectBoardLatestExecutionReadinessBlockerEvent(board.events) : undefined;
  const primaryState: ProjectBoardExecutionControlState = done
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
    detail: projection.terminalDone
      ? projection.summary
      : (latestExecutionReadinessEvent?.summary ??
        currentWorkflowBlocker?.message ??
        nextAction?.detail ??
        projectBoardProofNextAction(card, task, latestRun)),
    taskLabel: task ? projectBoardExecutionControlTaskLabel(task, completedRunNeedsReview) : "No Local Task",
    runLabel:
      projection.runLabel ??
      (latestRun ? `Run ${projectBoardReadableState(latestRun.status)} · attempt ${latestRun.attemptNumber + 1}` : "No run yet"),
    proofLabel: projection.proofLabel ?? proofDecision.statusLabel,
    blockerLabel:
      projection.blockerLabel ??
      (currentWorkflowBlocker
        ? projectBoardReadableState(currentWorkflowBlocker.kind)
        : blockerCount > 0
          ? `${blockerCount} blocker${blockerCount === 1 ? "" : "s"}`
          : "No blockers"),
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
  const blockerCount = projection.suppressBlockers
    ? 0
    : detail.blockedByCards.length + detail.blockedByTasks.length + detail.unresolvedBlockers.length;
  const proofExpectationCount = detail.proofExpectationCount;
  const sourceBasis = projectBoardCardSourceBasis(card, board.sources ?? []);
  const feedbackCount = card.runFeedback?.length ?? 0;
  const runCount = detail.runs.length;
  const ticketized = Boolean(card.orchestrationTaskId) || card.status !== "draft";
  const piUpdateFieldCount = card.pendingPiUpdate?.changedFields.length ?? 0;
  const proofDetail =
    card.proofReview?.summary ??
    (proofExpectationCount > 0
      ? "Proof expectations are ready for PM review after the run."
      : "Add proof expectations before this can be safely closed.");
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
      countLabel:
        openDecisions.length > 0
          ? String(openDecisions.length)
          : answeredDecisions.length > 0
            ? `${answeredDecisions.length} answered`
            : undefined,
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
      detail: projection.terminalDone
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
      detail:
        projection.terminalDone && projection.runLabel
          ? `${projection.runLabel}; retained for audit.`
          : detail.latestRun
            ? `Latest run is ${projectBoardReadableState(detail.latestRun.status)} attempt ${detail.latestRun.attemptNumber + 1}.`
            : detail.latestExecutionArtifact
              ? "Imported Git board artifact is available for review."
              : "Run history will appear after preparation starts.",
      tone: projection.terminalDone
        ? "done"
        : detail.latestRun?.status === "failed" || detail.latestRun?.status === "stalled"
          ? "blocked"
          : "neutral",
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
    {
      label: "Card",
      value: projection.statusLabel,
      tone: projectBoardExecutionOverviewTone(projection.terminalDone ? "done" : execution.state),
    },
    ...uiMockBadges,
    {
      label: "Task",
      value: detail.task ? projectBoardExecutionControlTaskLabel(detail.task, completedRunNeedsReview) : "No Local Task",
      tone: detail.task ? "neutral" : "warning",
    },
    {
      label: "Run",
      value: projection.runLabel ?? (detail.latestRun ? projectBoardReadableState(detail.latestRun.status) : "No run"),
      tone: projection.terminalDone ? "done" : detail.latestRun ? projectBoardRunOverviewTone(detail.latestRun.status) : "neutral",
    },
    {
      label: "Proof",
      value:
        projection.proofLabel ??
        (card.proofReview
          ? projectBoardProofReviewStatusText(card.proofReview.status)
          : proofExpectationCount > 0
            ? "Expected"
            : "Missing"),
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

function projectBoardRunOverviewTone(status: OrchestrationRun["status"]): ProjectBoardActiveCardOverviewTone {
  if (status === "running") return "running";
  if (status === "completed") return "review";
  if (status === "prepared") return "ready";
  if (status === "failed" || status === "stalled" || status === "canceled") return "blocked";
  return "neutral";
}

function projectBoardActiveCardProofTone(card: ProjectBoardCard, proofExpectationCount: number): ProjectBoardActiveCardOverviewTone {
  if (!card.proofReview) return proofExpectationCount > 0 ? "ready" : "warning";
  if (card.proofReview.status === "ready_for_review" || card.proofReview.status === "needs_follow_up") return "review";
  if (card.proofReview.status === "done") return "done";
  if (card.proofReview.status === "terminally_blocked" || card.proofReview.status === "retry_recommended") return "blocked";
  return "neutral";
}

function projectBoardLatestExecutionReadinessBlockerEvent(events: ProjectBoardEvent[] = []): ProjectBoardEvent | undefined {
  return events.find((event) => event.kind === "execution_readiness_blocked");
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

function projectBoardCardIsUxMockGate(
  card: Pick<ProjectBoardCard, "sourceId" | "title" | "labels" | "description" | "uiMockRole">,
): boolean {
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

export function projectBoardUiMockReviewBadges(
  card: ProjectBoardCard,
  boardCards: ProjectBoardCard[] = [],
): ProjectBoardActiveCardOverviewBadge[] {
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
