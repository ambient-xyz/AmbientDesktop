import type { ProjectBoardCard, ProjectBoardCardCandidateStatus, ProjectBoardEvent, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import { projectBoardDecisionImpactPreview } from "../../shared/projectBoardDecisionImpact";
import {
  projectBoardCardBlockedByOpenUxMockGate,
  projectBoardCardHasProofSpec,
  projectBoardRequiresProofSpec,
} from "./projectBoardActiveCardUiModel";
import {
  projectBoardCardCanMarkReady,
  projectBoardPendingClarificationDecisions,
} from "./projectBoardCardEditUiModel";
import { projectBoardCardClaimBlocksLocalTicketization } from "./projectBoardCollaborationUiModel";
import {
  projectBoardDependencyHealth,
  projectBoardDisplayOrderedCards,
} from "./projectBoardDependencyUiModel";
import {
  projectBoardUniqueProofItems,
  truncateProjectBoardLedgerText,
} from "./projectBoardProofEvidenceUiModel";
import {
  projectBoardCardBlockedByStrictProofScopeWarning,
  projectBoardPlanningWarningActionTitle,
  projectBoardPlanningWarningsForCard,
} from "./projectBoardPlanningWarningUiModel";

export interface ProjectBoardDraftColumnModel {
  id: "evidence" | "needs_clarification" | "ready_to_create" | "rejected";
  title: string;
  cards: ProjectBoardCard[];
}

export type ProjectBoardDraftInboxFilterId =
  | "all"
  | "blocking_or_critical"
  | "ready"
  | "needs_decision"
  | "missing_proof"
  | "blocked_by_dependency"
  | "stale_impact"
  | "duplicate"
  | "evidence"
  | "rejected";

export interface ProjectBoardDraftInboxFilterOption {
  id: ProjectBoardDraftInboxFilterId;
  label: string;
  count: number;
  title: string;
}

interface ProjectBoardDraftInboxFilterContext {
  blockingOrCriticalCardIds: Set<string>;
  dependencyBlockedCardIds: Set<string>;
}

export interface ProjectBoardDraftColumnOptions {
  board?: ProjectBoardSummary;
  query?: string;
  filterId?: ProjectBoardDraftInboxFilterId;
  includeSkipped?: boolean;
}

export interface ProjectBoardDraftInboxSkippedCard {
  card: ProjectBoardCard;
  reasons: string[];
}

export interface ProjectBoardDraftInboxCreateReadyPreview {
  totalCandidateCount: number;
  ticketizableCards: ProjectBoardCard[];
  markReadyCards: ProjectBoardCard[];
  skippedCards: ProjectBoardDraftInboxSkippedCard[];
  decisionBlockedCount: number;
  proofGapCount: number;
  dependencyBlockerCount: number;
  staleImpactCount: number;
  strictProofWarningCount: number;
  claimBlockedCount: number;
  skippedTerminalCount: number;
}

export type ProjectBoardPiUpdateReviewSourceKind = "decision" | "source" | "proof" | "planning";

export interface ProjectBoardPiUpdateReviewItem {
  card: ProjectBoardCard;
  sourceKind: ProjectBoardPiUpdateReviewSourceKind;
  sourceLabel: string;
  changedFieldLabels: string[];
  previewLines: string[];
  actionable: boolean;
  blocker?: string;
}

export interface ProjectBoardPiUpdateReviewQueue {
  visible: boolean;
  headline: string;
  detail: string;
  items: ProjectBoardPiUpdateReviewItem[];
  actionableItems: ProjectBoardPiUpdateReviewItem[];
  decisionCount: number;
  sourceCount: number;
  proofCount: number;
  planningCount: number;
  blockedCount: number;
}

export type ProjectBoardDraftColumnMoveTone = "neutral" | "ready" | "warning" | "danger";

export interface ProjectBoardDraftColumnMoveState {
  targetStatus: ProjectBoardCardCandidateStatus;
  disabled: boolean;
  tone: ProjectBoardDraftColumnMoveTone;
  label: string;
  title: string;
}

export function projectBoardDraftColumns(cards: ProjectBoardCard[], options: ProjectBoardDraftColumnOptions = {}): ProjectBoardDraftColumnModel[] {
  const filterId = options.filterId ?? "all";
  const filterContext = projectBoardDraftInboxFilterContext(options.board);
  const candidates = projectBoardDraftCandidatesAvailable(options.board)
    ? projectBoardDisplayOrderedCards(cards)
        .filter((card) => projectBoardCardIsDraftInboxCandidate(card))
        .filter((card) => options.includeSkipped !== false || !projectBoardDraftInboxCardIsTerminalSkipped(card))
        .filter((card) => projectBoardDraftInboxCardMatchesSearch(card, options.query))
        .filter((card) => projectBoardDraftInboxCardMatchesFilter(card, filterId, options.board, filterContext))
    : [];
  return [
    { id: "evidence", title: "Covered / Done", cards: cardsForCandidateStatuses(candidates, ["evidence"]) },
    { id: "needs_clarification", title: "Needs Clarification", cards: cardsForCandidateStatuses(candidates, ["needs_clarification"]) },
    { id: "ready_to_create", title: "Ready To Create", cards: cardsForCandidateStatuses(candidates, ["ready_to_create"]) },
    { id: "rejected", title: "Rejected / Duplicate", cards: cardsForCandidateStatuses(candidates, ["rejected", "duplicate"]) },
  ];
}

export function projectBoardDraftInboxFilterOptions(cards: ProjectBoardCard[], board?: ProjectBoardSummary): ProjectBoardDraftInboxFilterOption[] {
  const candidates = projectBoardDraftCandidatesAvailable(board) ? cards.filter(projectBoardCardIsDraftInboxCandidate) : [];
  const filterContext = projectBoardDraftInboxFilterContext(board);
  const option = (id: ProjectBoardDraftInboxFilterId, label: string, title: string): ProjectBoardDraftInboxFilterOption => ({
    id,
    label,
    title,
    count: id === "all" ? candidates.length : candidates.filter((card) => projectBoardDraftInboxCardMatchesFilter(card, id, board, filterContext)).length,
  });
  return [
    option("all", "All", "Show every Draft Inbox candidate."),
    option("blocking_or_critical", "Blocking", "Show draft cards that are currently blocking downstream work or are on the dependency critical path."),
    option("ready", "Ready", "Show cards that can become Local Tasks now."),
    option("needs_decision", "Needs decision", "Show cards with open PM clarification decisions."),
    option("missing_proof", "Missing proof", "Show cards blocked by missing proof expectations under the board proof policy."),
    option("blocked_by_dependency", "Dependencies", "Show cards with dependency blockers that will map to Local Task blockers."),
    option("stale_impact", "Impact", "Show cards with pending Pi updates or linked decision impact that should be resolved before ticketization."),
    option("duplicate", "Duplicate", "Show cards marked duplicate."),
    option("evidence", "Covered", "Show cards marked covered or already represented."),
    option("rejected", "Rejected", "Show cards rejected from execution."),
  ];
}

export function projectBoardDraftInboxCreateReadyPreview(board: ProjectBoardSummary): ProjectBoardDraftInboxCreateReadyPreview {
  const candidates = projectBoardDraftCandidatesAvailable(board) ? board.cards.filter(projectBoardCardIsDraftInboxCandidate) : [];
  const filterContext = projectBoardDraftInboxFilterContext(board);
  const ticketizableIds = new Set(projectBoardReadyTicketizationCards(board).map((card) => card.id));
  const ticketizableCards = candidates.filter((card) => ticketizableIds.has(card.id));
  const markReadyCards = candidates.filter((card) => projectBoardDraftInboxCardCanBulkMarkReady(card, board));
  const skippedCards = candidates
    .filter((card) => !ticketizableIds.has(card.id))
    .map((card) => ({ card, reasons: projectBoardDraftInboxSkippedReasons(card, board) }))
    .filter((item) => item.reasons.length > 0);
  return {
    totalCandidateCount: candidates.length,
    ticketizableCards,
    markReadyCards,
    skippedCards,
    decisionBlockedCount: candidates.filter((card) => projectBoardDraftInboxCardMatchesFilter(card, "needs_decision", board, filterContext)).length,
    proofGapCount: candidates.filter((card) => projectBoardDraftInboxCardMatchesFilter(card, "missing_proof", board, filterContext)).length,
    dependencyBlockerCount: candidates.filter((card) => projectBoardDraftInboxCardMatchesFilter(card, "blocked_by_dependency", board, filterContext)).length,
    staleImpactCount: candidates.filter((card) => projectBoardDraftInboxCardMatchesFilter(card, "stale_impact", board, filterContext)).length,
    strictProofWarningCount: candidates.filter((card) => projectBoardCardBlockedByStrictProofScopeWarning(card, board)).length,
    claimBlockedCount: candidates.filter(projectBoardCardClaimBlocksLocalTicketization).length,
    skippedTerminalCount: candidates.filter(projectBoardDraftInboxCardIsTerminalSkipped).length,
  };
}

export function projectBoardPiUpdateReviewQueue(board: ProjectBoardSummary): ProjectBoardPiUpdateReviewQueue {
  const items = board.cards
    .filter((card) => Boolean(card.pendingPiUpdate))
    .map(projectBoardPiUpdateReviewItem)
    .sort((left, right) => projectBoardPiUpdateSourceSort(left.sourceKind) - projectBoardPiUpdateSourceSort(right.sourceKind) || (left.card.priority ?? 999) - (right.card.priority ?? 999) || left.card.title.localeCompare(right.card.title));
  const actionableItems = items.filter((item) => item.actionable);
  const decisionCount = items.filter((item) => item.sourceKind === "decision").length;
  const sourceCount = items.filter((item) => item.sourceKind === "source").length;
  const proofCount = items.filter((item) => item.sourceKind === "proof").length;
  const planningCount = items.filter((item) => item.sourceKind === "planning").length;
  const blockedCount = items.length - actionableItems.length;
  return {
    visible: items.length > 0,
    headline:
      items.length === 0
        ? "No staged Pi updates"
        : `${items.length} staged Pi update${items.length === 1 ? "" : "s"} need review`,
    detail:
      items.length === 0
        ? "Targeted Pi refreshes will appear here before any protected draft fields are changed."
        : `${actionableItems.length} can be applied or ignored now${blockedCount > 0 ? `; ${blockedCount} need manual review because they are no longer draft candidates` : ""}.`,
    items,
    actionableItems,
    decisionCount,
    sourceCount,
    proofCount,
    planningCount,
    blockedCount,
  };
}

export function projectBoardCandidateStatusForDraftColumn(columnId: ProjectBoardDraftColumnModel["id"]): ProjectBoardCardCandidateStatus {
  if (columnId === "evidence") return "evidence";
  if (columnId === "ready_to_create") return "ready_to_create";
  if (columnId === "rejected") return "rejected";
  return "needs_clarification";
}

export function projectBoardDraftColumnMoveState(
  column: ProjectBoardDraftColumnModel,
  card?: ProjectBoardCard,
  board?: ProjectBoardSummary,
): ProjectBoardDraftColumnMoveState {
  const targetStatus = projectBoardCandidateStatusForDraftColumn(column.id);
  const baseTitle = projectBoardDraftColumnMoveBaseTitle(column.title);
  if (!card) {
    return {
      targetStatus,
      disabled: false,
      tone: "neutral",
      label: baseTitle,
      title: `Drag a candidate here to ${projectBoardDraftColumnMoveVerb(targetStatus)}.`,
    };
  }
  if (card.candidateStatus === targetStatus || (column.id === "rejected" && (card.candidateStatus === "rejected" || card.candidateStatus === "duplicate"))) {
    return {
      targetStatus,
      disabled: true,
      tone: "neutral",
      label: "Already here",
      title: `${card.title} is already in ${column.title}.`,
    };
  }
  if (targetStatus === "ready_to_create" && !projectBoardCardCanMarkReady(card, board)) {
    return {
      targetStatus,
      disabled: true,
      tone: "warning",
      label: "Proof required before Ready",
      title: `${card.title} needs at least one proof expectation before it can move to Ready To Create.`,
    };
  }
  const proofScopeWarnings = targetStatus === "ready_to_create" ? projectBoardPlanningWarningsForCard(card, board) : [];
  if (proofScopeWarnings.length > 0) {
    return {
      targetStatus,
      disabled: false,
      tone: "warning",
      label: "Review proof warning before Ready",
      title: `${card.title} can move to Ready To Create, but ${projectBoardPlanningWarningActionTitle(proofScopeWarnings)}`,
    };
  }
  return {
    targetStatus,
    disabled: false,
    tone: targetStatus === "ready_to_create" ? "ready" : targetStatus === "rejected" ? "danger" : targetStatus === "needs_clarification" ? "warning" : "neutral",
    label: `Drop to move to ${column.title}`,
    title: `Move ${card.title} to ${column.title}.`,
  };
}

export function projectBoardReadyTicketizationCards(board: ProjectBoardSummary): ProjectBoardCard[] {
  if (!projectBoardDraftCandidatesAvailable(board)) return [];
  return board.cards.filter(
    (card) =>
      card.status === "draft" &&
      !card.orchestrationTaskId &&
      card.candidateStatus === "ready_to_create" &&
      !projectBoardCardClaimBlocksLocalTicketization(card) &&
      projectBoardCardCanMarkReady(card, board) &&
      !projectBoardCardBlockedByOpenUxMockGate(card, board.cards) &&
      !projectBoardCardBlockedByStrictProofScopeWarning(card, board),
  );
}

export function projectBoardDraftCandidatesAvailable(board?: Pick<ProjectBoardSummary, "status">): boolean {
  return !board || board.status === "active";
}

export function projectBoardStrictProofScopeBlockedReadyCards(board: ProjectBoardSummary): ProjectBoardCard[] {
  if (!projectBoardDraftCandidatesAvailable(board)) return [];
  return board.cards.filter(
    (card) =>
      card.status === "draft" &&
      !card.orchestrationTaskId &&
      card.candidateStatus === "ready_to_create" &&
      !projectBoardCardClaimBlocksLocalTicketization(card) &&
      projectBoardCardCanMarkReady(card, board) &&
      !projectBoardCardBlockedByOpenUxMockGate(card, board.cards) &&
      projectBoardCardBlockedByStrictProofScopeWarning(card, board),
  );
}

export function projectBoardCardIsDraftInboxCandidate(card: ProjectBoardCard): boolean {
  return !card.orchestrationTaskId && (card.status === "draft" || card.status === "blocked");
}

function projectBoardPiUpdateReviewItem(card: ProjectBoardCard): ProjectBoardPiUpdateReviewItem {
  const update = card.pendingPiUpdate;
  const sourceKind = projectBoardPiUpdateSourceKind(update?.sourceId ?? "");
  const actionable = card.status === "draft" && !card.orchestrationTaskId;
  return {
    card,
    sourceKind,
    sourceLabel: projectBoardPiUpdateSourceLabel(sourceKind),
    changedFieldLabels: update?.changedFields.map(projectBoardPiUpdateTouchedFieldLabel) ?? [],
    previewLines: update ? projectBoardPiUpdatePreviewLines(card, update) : [],
    actionable,
    blocker: actionable ? undefined : "This card is already ticketized or no longer a draft. Create run feedback or a follow-up instead of rewriting the approved card.",
  };
}

function projectBoardPiUpdateSourceKind(sourceId: string): ProjectBoardPiUpdateReviewSourceKind {
  if (sourceId.startsWith("decision:")) return "decision";
  if (sourceId.startsWith("source:")) return "source";
  if (sourceId.startsWith("proof:")) return "proof";
  return "planning";
}

function projectBoardPiUpdateSourceLabel(kind: ProjectBoardPiUpdateReviewSourceKind): string {
  if (kind === "decision") return "PM decision refresh";
  if (kind === "source") return "Source refresh";
  if (kind === "proof") return "Proof suggestion";
  return "Planning refresh";
}

function projectBoardPiUpdateSourceSort(kind: ProjectBoardPiUpdateReviewSourceKind): number {
  if (kind === "decision") return 0;
  if (kind === "source") return 1;
  if (kind === "proof") return 2;
  return 3;
}

function projectBoardPiUpdatePreviewLines(card: ProjectBoardCard, update: NonNullable<ProjectBoardCard["pendingPiUpdate"]>): string[] {
  const lines: string[] = [];
  if (update.title && update.title !== card.title) lines.push(`Title: ${truncateProjectBoardLedgerText(update.title, 120)}`);
  if (update.description && update.description !== card.description) lines.push(`Description: ${truncateProjectBoardLedgerText(update.description, 150)}`);
  if (update.candidateStatus && update.candidateStatus !== card.candidateStatus) lines.push(`Status: ${update.candidateStatus.replace(/_/g, " ")}`);
  if (update.priority !== undefined && update.priority !== card.priority) lines.push(`Priority: ${update.priority}`);
  if (update.phase && update.phase !== card.phase) lines.push(`Phase: ${truncateProjectBoardLedgerText(update.phase, 80)}`);
  if (update.labels && JSON.stringify(update.labels) !== JSON.stringify(card.labels)) lines.push(`Labels: ${update.labels.length}`);
  if (update.blockedBy && JSON.stringify(update.blockedBy) !== JSON.stringify(card.blockedBy)) lines.push(`Dependencies: ${update.blockedBy.length}`);
  if (update.acceptanceCriteria && JSON.stringify(update.acceptanceCriteria) !== JSON.stringify(card.acceptanceCriteria)) lines.push(`Acceptance: ${update.acceptanceCriteria.length} item${update.acceptanceCriteria.length === 1 ? "" : "s"}`);
  if (update.testPlan) {
    const proofCount = update.testPlan.unit.length + update.testPlan.integration.length + update.testPlan.visual.length + update.testPlan.manual.length;
    lines.push(`Proof plan: ${proofCount} expectation${proofCount === 1 ? "" : "s"}`);
  }
  if (update.sourceRefs && JSON.stringify(update.sourceRefs) !== JSON.stringify(card.sourceRefs ?? [])) lines.push(`Source refs: ${update.sourceRefs.length}`);
  if (update.clarificationQuestions && JSON.stringify(update.clarificationQuestions) !== JSON.stringify(card.clarificationQuestions ?? [])) {
    lines.push(`Open questions: ${update.clarificationQuestions.length}`);
  }
  if (update.clarificationAnswers && JSON.stringify(update.clarificationAnswers) !== JSON.stringify(card.clarificationAnswers ?? [])) {
    lines.push(`Answers: ${update.clarificationAnswers.length}`);
  }
  if (update.clarificationDecisions && JSON.stringify(update.clarificationDecisions) !== JSON.stringify(card.clarificationDecisions ?? [])) {
    lines.push(`Decision gates: ${update.clarificationDecisions.filter((decision) => decision.state !== "answered").length} open`);
  }
  return lines.length > 0 ? lines.slice(0, 5) : [`Fields: ${update.changedFields.map(projectBoardPiUpdateTouchedFieldLabel).join(", ")}`];
}

function projectBoardPiUpdateTouchedFieldLabel(field: NonNullable<ProjectBoardCard["userTouchedFields"]>[number]): string {
  if (field === "candidateStatus") return "status";
  if (field === "dependencies") return "dependencies";
  if (field === "acceptanceCriteria") return "acceptance";
  if (field === "testPlan") return "proof plan";
  if (field === "sourceRefs") return "source refs";
  if (field === "clarificationQuestions") return "questions";
  if (field === "clarificationSuggestions") return "suggestions";
  if (field === "clarificationAnswers") return "answers";
  if (field === "clarificationDecisions") return "decision gates";
  return field;
}

function projectBoardDraftInboxFilterContext(board?: ProjectBoardSummary): ProjectBoardDraftInboxFilterContext | undefined {
  if (!board) return undefined;
  const health = projectBoardDependencyHealth(board);
  return {
    blockingOrCriticalCardIds: projectBoardDraftInboxBlockingOrCriticalCardIds(health),
    dependencyBlockedCardIds: new Set(health.rows.filter((row) => row.blockedBy.length > 0).map((row) => row.card.id)),
  };
}

function projectBoardDraftInboxBlockingOrCriticalCardIds(health: ReturnType<typeof projectBoardDependencyHealth>): Set<string> {
  const cardIds = new Set<string>();
  for (const item of health.readiness) {
    for (const blocker of item.waitingOn) cardIds.add(blocker.id);
  }
  if (health.criticalPath.cards.length > 1) {
    for (const card of health.criticalPath.cards) cardIds.add(card.id);
  }
  return cardIds;
}

function projectBoardDraftInboxCardMatchesFilter(
  card: ProjectBoardCard,
  filterId: ProjectBoardDraftInboxFilterId,
  board?: ProjectBoardSummary,
  context?: ProjectBoardDraftInboxFilterContext,
): boolean {
  if (filterId === "all") return true;
  if (filterId === "blocking_or_critical") return Boolean(context?.blockingOrCriticalCardIds.has(card.id));
  if (filterId === "ready") {
    if (board) return projectBoardReadyTicketizationCards(board).some((candidate) => candidate.id === card.id);
    return card.status === "draft" && !card.orchestrationTaskId && card.candidateStatus === "ready_to_create" && projectBoardCardCanMarkReady(card);
  }
  if (filterId === "needs_decision") return projectBoardPendingClarificationDecisions(card).length > 0;
  if (filterId === "missing_proof") return Boolean(board && projectBoardRequiresProofSpec(board) && !projectBoardCardHasProofSpec(card));
  if (filterId === "blocked_by_dependency") return projectBoardDraftInboxCardHasActiveDependencyBlocker(card, board, context);
  if (filterId === "stale_impact") {
    return Boolean(card.pendingPiUpdate) || projectBoardDraftInboxCardHasDecisionImpactOpportunity(card, board) || projectBoardDraftInboxCardHasSourceImpactOpportunity(card, board);
  }
  if (filterId === "duplicate") return card.candidateStatus === "duplicate";
  if (filterId === "evidence") return card.candidateStatus === "evidence";
  if (filterId === "rejected") return card.candidateStatus === "rejected";
  return true;
}

function projectBoardDraftInboxCardCanBulkMarkReady(card: ProjectBoardCard, board: ProjectBoardSummary): boolean {
  return (
    card.status === "draft" &&
    !card.orchestrationTaskId &&
    card.candidateStatus !== "ready_to_create" &&
    !projectBoardDraftInboxCardIsTerminalSkipped(card) &&
    !projectBoardCardClaimBlocksLocalTicketization(card) &&
    projectBoardCardCanMarkReady(card, board) &&
    !projectBoardCardBlockedByStrictProofScopeWarning(card, board)
  );
}

export function projectBoardDraftInboxCardIsTerminalSkipped(card: ProjectBoardCard): boolean {
  return card.candidateStatus === "evidence" || card.candidateStatus === "duplicate" || card.candidateStatus === "rejected";
}

function projectBoardDraftInboxCardHasDecisionImpactOpportunity(card: ProjectBoardCard, board?: ProjectBoardSummary): boolean {
  if (!board) return false;
  const decisions = projectBoardPendingClarificationDecisions(card);
  return decisions.some((decision) => {
    const impact = projectBoardDecisionImpactPreview(board, { question: decision.question, answeredCardId: card.id });
    if (!impact.visible) return false;
    if (impact.affectedCardIds.some((cardId) => cardId !== card.id)) return true;
    return impact.duplicateHiddenCount > 0;
  });
}

function projectBoardDraftInboxCardHasSourceImpactOpportunity(card: ProjectBoardCard, board?: ProjectBoardSummary): boolean {
  if (!board || card.status !== "draft" || card.orchestrationTaskId) return false;
  const latestEventByGroup = new Map<string, ProjectBoardEvent>();
  for (const event of board.events ?? []) {
    const impact = projectBoardSourceImpactEventMetadata(event);
    if (!impact?.targetedRefreshOptional || !impact.affectedDraftCardIds.includes(card.id)) continue;
    const key = projectBoardSourceImpactEventGroupKey(impact);
    if (latestEventByGroup.has(key)) continue;
    latestEventByGroup.set(key, event);
  }
  for (const event of latestEventByGroup.values()) {
    if (!projectBoardSourceImpactRefreshAppliedToCard(board.events ?? [], event.id, card.id)) return true;
  }
  return false;
}

export function projectBoardSourceImpactEventMetadata(event: ProjectBoardEvent): {
  sourceId: string;
  groupSourceIds: string[];
  affectedCardIds: string[];
  affectedDraftCardIds: string[];
  affectedExecutableCardIds: string[];
  targetedRefreshOptional: boolean;
  nextRunFeedbackRecommended: boolean;
  selectedObservationCount: number;
  estimatedPromptChars: number;
  recommendedAction?: string;
  detail?: string;
} | undefined {
  if (event.kind !== "source_updated") return undefined;
  const sourceImpact = (event.metadata as {
    sourceImpact?: {
      schemaVersion?: unknown;
      sourceId?: unknown;
      groupSourceIds?: unknown;
      affectedCardIds?: unknown;
      affectedDraftCardIds?: unknown;
      affectedExecutableCardIds?: unknown;
      targetedRefreshOptional?: unknown;
      nextRunFeedbackRecommended?: unknown;
      selectedObservationCount?: unknown;
      estimatedPromptChars?: unknown;
      recommendedAction?: unknown;
      detail?: unknown;
    };
  }).sourceImpact;
  if (sourceImpact?.schemaVersion !== undefined && sourceImpact.schemaVersion !== 1) return undefined;
  if (!sourceImpact || typeof sourceImpact.sourceId !== "string" || !Array.isArray(sourceImpact.groupSourceIds) || !Array.isArray(sourceImpact.affectedDraftCardIds)) return undefined;
  const affectedCardIds = projectBoardStringArray(sourceImpact.affectedCardIds);
  const affectedDraftCardIds = projectBoardStringArray(sourceImpact.affectedDraftCardIds);
  const affectedExecutableCardIds = projectBoardStringArray(sourceImpact.affectedExecutableCardIds);
  return {
    sourceId: sourceImpact.sourceId,
    groupSourceIds: projectBoardStringArray(sourceImpact.groupSourceIds),
    affectedCardIds: affectedCardIds.length > 0 ? affectedCardIds : [...new Set([...affectedDraftCardIds, ...affectedExecutableCardIds])],
    affectedDraftCardIds,
    affectedExecutableCardIds,
    targetedRefreshOptional: sourceImpact.targetedRefreshOptional === true,
    nextRunFeedbackRecommended: sourceImpact.nextRunFeedbackRecommended === true,
    selectedObservationCount: typeof sourceImpact.selectedObservationCount === "number" ? sourceImpact.selectedObservationCount : 0,
    estimatedPromptChars: typeof sourceImpact.estimatedPromptChars === "number" ? sourceImpact.estimatedPromptChars : 0,
    recommendedAction: typeof sourceImpact.recommendedAction === "string" ? sourceImpact.recommendedAction : undefined,
    detail: typeof sourceImpact.detail === "string" ? sourceImpact.detail : undefined,
  };
}

export function projectBoardSourceImpactEventGroupKey(impact: { sourceId: string; groupSourceIds: string[] }): string {
  const ids = impact.groupSourceIds.length > 0 ? impact.groupSourceIds : [impact.sourceId];
  return ids.slice().sort().join("|");
}

export function projectBoardSourceImpactRefreshAppliedToCard(events: ProjectBoardEvent[], sourceImpactEventId: string, cardId: string): boolean {
  return events.some((event) => {
    if (event.kind !== "card_updated") return false;
    const impact = (event.metadata as {
      sourceImpact?: {
        appliedAction?: unknown;
        sourceImpactEventIds?: unknown;
        appliedCardIds?: unknown;
        pendingPiUpdateCardIds?: unknown;
      };
    }).sourceImpact;
    if (impact?.appliedAction !== "refresh_affected_drafts" && impact?.appliedAction !== "propose_targeted_draft_refresh") return false;
    if (!Array.isArray(impact.sourceImpactEventIds) || !Array.isArray(impact.appliedCardIds)) return false;
    const appliedCardIds = projectBoardStringArray(impact.appliedCardIds);
    const pendingPiUpdateCardIds = projectBoardStringArray(impact.pendingPiUpdateCardIds);
    return projectBoardStringArray(impact.sourceImpactEventIds).includes(sourceImpactEventId) && [...appliedCardIds, ...pendingPiUpdateCardIds].includes(cardId);
  });
}

function projectBoardDraftInboxSkippedReasons(card: ProjectBoardCard, board: ProjectBoardSummary): string[] {
  const reasons: string[] = [];
  const openDecisions = projectBoardPendingClarificationDecisions(card);
  if (card.pendingPiUpdate) reasons.push("Pi proposed newer protected-field values; review or ignore the update before ticketization.");
  if (projectBoardDraftInboxCardHasDecisionImpactOpportunity(card, board)) {
    reasons.push("Linked PM decision impact is available; answer once and refresh affected drafts before ticketization.");
  }
  if (projectBoardDraftInboxCardHasSourceImpactOpportunity(card, board)) {
    reasons.push("Source authority changed for a cited source; refresh affected drafts before ticketization or use Add Cards for targeted elaboration.");
  }
  if (card.orchestrationTaskId) reasons.push("Already linked to a Local Task.");
  if (card.status === "blocked") reasons.push("Blocked candidate status is not included in bulk Create Ready Tasks.");
  if (card.candidateStatus === "evidence") reasons.push("Marked covered or done, so it is intentionally skipped.");
  if (card.candidateStatus === "duplicate") reasons.push("Marked duplicate, so it is intentionally skipped.");
  if (card.candidateStatus === "rejected") reasons.push("Rejected from execution.");
  if (openDecisions.length > 0) {
    reasons.push(`${openDecisions.length} open PM decision${openDecisions.length === 1 ? "" : "s"} must be answered.`);
  }
  if (projectBoardRequiresProofSpec(board) && !projectBoardCardHasProofSpec(card)) {
    reasons.push("Missing proof expectations under this board's proof policy.");
  }
  if (projectBoardCardBlockedByStrictProofScopeWarning(card, board)) {
    reasons.push("Proof ownership warning needs PM acknowledgement under strict policy.");
  }
  if (projectBoardCardClaimBlocksLocalTicketization(card)) {
    reasons.push("Collaboration claim or conflict blocks local ticketization.");
  }
  if (projectBoardCardBlockedByOpenUxMockGate(card, board.cards)) {
    reasons.push("Approve UX mock before creating UI implementation tasks.");
  }
  if (card.candidateStatus !== "ready_to_create" && !projectBoardDraftInboxCardIsTerminalSkipped(card)) {
    reasons.push(projectBoardDraftInboxCardCanBulkMarkReady(card, board) ? "Can be marked Ready To Create in bulk." : "Not marked Ready To Create.");
  }
  if (projectBoardDraftInboxCardHasActiveDependencyBlocker(card, board)) {
    reasons.push("Dependency blockers will become Local Task blockers once the card is ticketized.");
  }
  return projectBoardUniqueProofItems(reasons, (reason) => reason);
}

function projectBoardDraftInboxCardHasActiveDependencyBlocker(
  card: ProjectBoardCard,
  board?: ProjectBoardSummary,
  context?: ProjectBoardDraftInboxFilterContext,
): boolean {
  if (context) return context.dependencyBlockedCardIds.has(card.id);
  if (!board) return card.blockedBy.filter((item) => item.trim()).length > 0;
  return Boolean(projectBoardDraftInboxFilterContext(board)?.dependencyBlockedCardIds.has(card.id));
}

function projectBoardDraftInboxCardMatchesSearch(card: ProjectBoardCard, query?: string): boolean {
  const tokens = projectBoardDraftInboxSearchTokens(query);
  if (tokens.length === 0) return true;
  const text = projectBoardDraftInboxSearchText(card);
  return tokens.every((token) => text.includes(token));
}

function projectBoardDraftInboxSearchTokens(query?: string): string[] {
  return (query ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function projectBoardDraftInboxSearchText(card: ProjectBoardCard): string {
  const decisions = projectBoardPendingClarificationDecisions(card);
  const values = [
    card.id,
    card.title,
    card.description,
    card.status,
    card.candidateStatus,
    card.phase ?? "",
    String(card.priority ?? ""),
    card.sourceKind,
    card.sourceId,
    ...(card.sourceRefs ?? []),
    ...(card.labels ?? []),
    ...(card.blockedBy ?? []),
    ...(card.acceptanceCriteria ?? []),
    ...card.testPlan.unit,
    ...card.testPlan.integration,
    ...card.testPlan.visual,
    ...card.testPlan.manual,
    ...(card.clarificationQuestions ?? []),
    ...(card.clarificationSuggestions ?? []).flatMap((suggestion) => [
      suggestion.question,
      suggestion.suggestedAnswer,
      suggestion.rationale,
      suggestion.questionKind ?? "",
      suggestion.confidence ?? "",
    ]),
    ...(card.clarificationAnswers ?? []).flatMap((answer) => [answer.question, answer.answer]),
    ...decisions.flatMap((decision) => [
      decision.id,
      decision.question,
      decision.canonicalKey,
      decision.suggestedAnswer ?? "",
      decision.rationale ?? "",
      decision.questionKind ?? "",
    ]),
    ...(card.pendingPiUpdate?.changedFields ?? []),
    card.objectiveProvenance?.objective ?? "",
  ];
  return values.join(" ").toLowerCase();
}

function cardsForCandidateStatuses(cards: ProjectBoardCard[], statuses: ProjectBoardCardCandidateStatus[]): ProjectBoardCard[] {
  return cards.filter((card) => statuses.includes(card.candidateStatus));
}

function projectBoardDraftColumnMoveBaseTitle(title: string): string {
  if (title === "Covered / Done") return "Already covered work";
  if (title === "Needs Clarification") return "Needs PM clarification";
  if (title === "Ready To Create") return "Proof-ready candidates";
  return "Rejected or duplicate work";
}

function projectBoardDraftColumnMoveVerb(status: ProjectBoardCardCandidateStatus): string {
  if (status === "evidence") return "mark it covered";
  if (status === "ready_to_create") return "mark it ready for ticketization";
  if (status === "rejected") return "reject it or mark it duplicate";
  return "request clarification";
}

function projectBoardStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}
