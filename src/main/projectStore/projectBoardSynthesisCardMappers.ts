import type {
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardClarificationDecision,
  ProjectBoardCardPendingPiUpdate,
  ProjectBoardCardTouchedField,
  ProjectBoardSynthesisProposalAnswer,
  ProjectBoardSynthesisProposalCard,
  ProjectBoardSynthesisProposalCardReviewStatus,
} from "../../shared/projectBoardTypes";
import { normalizeCardTextList, normalizeProjectBoardCardTestPlan } from "./projectBoardCardNormalizationMappers";
import {
  normalizeProjectBoardUiMockRole,
  normalizeTaskLabels,
  normalizeTaskReferences,
  projectBoardRequiresUiMockApprovalForSynthesisCard,
  projectBoardUiMockRoleForSynthesisCard,
} from "./projectBoardCardReferenceMappers";
import {
  normalizeProjectBoardClarificationAnswers,
  normalizeProjectBoardClarificationQuestions,
  normalizeProjectBoardClarificationSuggestions,
  normalizeProjectBoardSynthesisClarificationFields,
  parseProjectBoardClarificationAnswers,
  parseProjectBoardClarificationDecisions,
  parseProjectBoardClarificationSuggestions,
  projectBoardCandidateStatusForSynthesisUpdate,
  projectBoardUnansweredClarificationQuestions,
} from "./projectBoardClarificationMappers";
import { parseProjectBoardCardTestPlan, parseProjectBoardStringList } from "./projectBoardJsonMappers";
import { projectBoardPlanningStableJson } from "./projectBoardPlanningSnapshotMappers";
import type { ProjectBoardSynthesisCardInput, ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";

export interface ProjectBoardCardPendingPiUpdateStoreRow {
  title: string;
  description: string;
  candidate_status: ProjectBoardCardCandidateStatus;
  priority: number | null;
  phase: string | null;
  labels_json: string;
  blocked_by_json: string;
  acceptance_criteria_json: string;
  test_plan_json: string;
  source_refs_json: string | null;
  clarification_questions_json: string | null;
  clarification_suggestions_json: string | null;
  clarification_answers_json: string | null;
  clarification_decisions_json: string | null;
  ui_mock_role: string | null;
  requires_ui_mock_approval: number | null;
  created_at: string;
  updated_at: string;
}

const PROJECT_BOARD_SYNTHESIS_PROPOSAL_CARD_REVIEW_STATUSES = new Set<ProjectBoardSynthesisProposalCardReviewStatus>([
  "pending",
  "accepted",
  "deferred",
  "rejected",
  "merged",
]);

export function projectBoardSynthesisProposalCardReviewStatus(value: unknown): ProjectBoardSynthesisProposalCardReviewStatus | undefined {
  return typeof value === "string" &&
    PROJECT_BOARD_SYNTHESIS_PROPOSAL_CARD_REVIEW_STATUSES.has(value as ProjectBoardSynthesisProposalCardReviewStatus)
    ? (value as ProjectBoardSynthesisProposalCardReviewStatus)
    : undefined;
}

const PROJECT_BOARD_COPYABLE_SESSION_RUN_STATUSES = new Set(["completed", "failed", "canceled", "stalled"]);

export function projectBoardRunStatusCanCopySession(status: string): boolean {
  return PROJECT_BOARD_COPYABLE_SESSION_RUN_STATUSES.has(status);
}

const MAX_PROJECT_BOARD_SYNTHESIS_PROPOSAL_CARDS = 120;

function projectBoardClarificationDecisionComparisonValue(decision: ProjectBoardCardClarificationDecision): Record<string, unknown> {
  if (decision.state === "answered") {
    return {
      question: decision.question,
      canonicalKey: decision.canonicalKey,
      state: decision.state,
      answer: decision.answer,
    };
  }
  return {
    question: decision.question,
    canonicalKey: decision.canonicalKey,
    source: decision.source,
    state: decision.state,
    duplicateOf: decision.duplicateOf,
    answer: decision.answer,
    suggestedAnswer: decision.suggestedAnswer,
    rationale: decision.rationale,
    confidence: decision.confidence,
    safeToAccept: Boolean(decision.safeToAccept),
    questionKind: decision.questionKind,
  };
}

export function projectBoardClarificationDecisionsEquivalent(
  left: ProjectBoardCardClarificationDecision[],
  right: ProjectBoardCardClarificationDecision[],
): boolean {
  return (
    projectBoardPlanningStableJson(left.map(projectBoardClarificationDecisionComparisonValue)) ===
    projectBoardPlanningStableJson(right.map(projectBoardClarificationDecisionComparisonValue))
  );
}

export function normalizeProjectBoardObjectiveProvenance(value: unknown): ProjectBoardSynthesisProposalCard["objectiveProvenance"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const objective = typeof candidate.objective === "string" ? candidate.objective.trim().slice(0, 2000) : "";
  if (!objective) return undefined;
  const groundingMode =
    candidate.groundingMode === "selected_sources" ||
    candidate.groundingMode === "source_scan" ||
    candidate.groundingMode === "objective_only"
      ? candidate.groundingMode
      : "objective_only";
  const selectedSourceIds = Array.isArray(candidate.selectedSourceIds)
    ? normalizeCardTextList(
        candidate.selectedSourceIds.filter((item): item is string => typeof item === "string"),
        50,
      )
    : [];
  const sourceRefCount =
    typeof candidate.sourceRefCount === "number" && Number.isFinite(candidate.sourceRefCount)
      ? Math.max(0, Math.round(candidate.sourceRefCount))
      : 0;
  const weakGrounding =
    typeof candidate.weakGrounding === "boolean" ? candidate.weakGrounding : sourceRefCount === 0 || groundingMode === "objective_only";
  const sourceGap =
    typeof candidate.sourceGap === "string" && candidate.sourceGap.trim() ? candidate.sourceGap.trim().slice(0, 2000) : undefined;
  return {
    objective,
    groundingMode,
    selectedSourceIds,
    sourceRefCount,
    weakGrounding,
    sourceGap,
  };
}

export function objectiveProvenanceJson(value: unknown): string | null {
  const normalized = normalizeProjectBoardObjectiveProvenance(value);
  return normalized ? JSON.stringify(normalized) : null;
}

export function sourceRefArtifactStrings(sourceRefs: Array<{ sourceId?: string; path?: string; range?: string }>): string[] {
  return normalizeCardTextList(
    sourceRefs
      .map((ref) => {
        const base = ref.path?.trim() || ref.sourceId?.trim() || "";
        return base ? (ref.range ? `${base}#${ref.range}` : base) : "";
      })
      .filter(Boolean),
    20,
  );
}

export function normalizeProjectBoardSynthesisProposalAnswer(
  value: unknown,
  fallbackAnsweredAt: string,
): ProjectBoardSynthesisProposalAnswer[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const answer = value as ProjectBoardSynthesisProposalAnswer;
  if (typeof answer.answer !== "string" || !answer.answer.trim()) return [];
  const questionIndex = typeof answer.questionIndex === "number" && Number.isInteger(answer.questionIndex) ? answer.questionIndex : -1;
  if (questionIndex < 0) return [];
  return [
    {
      questionIndex,
      question: typeof answer.question === "string" ? answer.question : "",
      answer: answer.answer,
      answeredAt: typeof answer.answeredAt === "string" ? answer.answeredAt : fallbackAnsweredAt,
    },
  ];
}

export function projectBoardSynthesisDraftWithSourceIdNamespace(
  synthesis: ProjectBoardSynthesisDraft,
  namespace: string | undefined,
): ProjectBoardSynthesisDraft {
  const prefix = namespace?.trim();
  if (!prefix) return synthesis;
  const sourceIdByOriginal = new Map<string, string>();
  for (const card of synthesis.cards) {
    const original = card.sourceId.trim();
    if (!original || original.startsWith(prefix)) continue;
    sourceIdByOriginal.set(original, `${prefix}${original}`);
  }
  if (sourceIdByOriginal.size === 0) return synthesis;
  const rewriteReference = (value: string): string => {
    const trimmed = value.trim();
    return sourceIdByOriginal.get(trimmed) ?? value;
  };
  return {
    ...synthesis,
    cards: synthesis.cards.map((card) => {
      const sourceId = card.sourceId.trim();
      return {
        ...card,
        sourceId: sourceIdByOriginal.get(sourceId) ?? sourceId,
        blockedBy: card.blockedBy.map(rewriteReference),
      };
    }),
  };
}

export function normalizeProjectBoardSynthesisProposalCard(card: ProjectBoardSynthesisProposalCard): ProjectBoardSynthesisProposalCard {
  return {
    sourceId: typeof card.sourceId === "string" ? card.sourceId : "",
    title: typeof card.title === "string" ? card.title : "",
    description: typeof card.description === "string" ? card.description : "",
    candidateStatus: card.candidateStatus ?? "needs_clarification",
    priority: typeof card.priority === "number" ? card.priority : undefined,
    phase: typeof card.phase === "string" ? card.phase : undefined,
    labels: Array.isArray(card.labels) ? card.labels.filter((label): label is string => typeof label === "string") : [],
    blockedBy: Array.isArray(card.blockedBy) ? card.blockedBy.filter((blocker): blocker is string => typeof blocker === "string") : [],
    acceptanceCriteria: Array.isArray(card.acceptanceCriteria)
      ? card.acceptanceCriteria.filter((criterion): criterion is string => typeof criterion === "string")
      : [],
    testPlan: normalizeProjectBoardCardTestPlan(card.testPlan ?? { unit: [], integration: [], visual: [], manual: [] }),
    sourceRefs: Array.isArray(card.sourceRefs) ? card.sourceRefs.filter((ref): ref is string => typeof ref === "string") : [],
    clarificationQuestions: Array.isArray(card.clarificationQuestions)
      ? card.clarificationQuestions.filter((question): question is string => typeof question === "string")
      : [],
    clarificationSuggestions: normalizeProjectBoardClarificationSuggestions(card.clarificationSuggestions ?? [], []),
    objectiveProvenance: normalizeProjectBoardObjectiveProvenance(card.objectiveProvenance),
    uiMockRole: normalizeProjectBoardUiMockRole(card.uiMockRole),
    requiresUiMockApproval: Boolean(card.requiresUiMockApproval),
    reviewStatus: projectBoardSynthesisProposalCardReviewStatus(card.reviewStatus) ?? "pending",
    reviewReason: typeof card.reviewReason === "string" && card.reviewReason.trim() ? card.reviewReason : undefined,
    mergeTargetCardId: typeof card.mergeTargetCardId === "string" && card.mergeTargetCardId.trim() ? card.mergeTargetCardId : undefined,
    reviewedAt: typeof card.reviewedAt === "string" && card.reviewedAt.trim() ? card.reviewedAt : undefined,
  };
}

export function projectBoardSynthesisProposalCardsFromDraft(
  synthesis: ProjectBoardSynthesisDraft,
  existingCards: ProjectBoardSynthesisProposalCard[] = [],
): ProjectBoardSynthesisProposalCard[] {
  const existingBySourceId = new Map(existingCards.map((card) => [card.sourceId, card]));
  return synthesis.cards
    .filter((card) => card.title.trim() && card.sourceId.trim())
    .slice(0, MAX_PROJECT_BOARD_SYNTHESIS_PROPOSAL_CARDS)
    .map((card) => {
      const normalized: ProjectBoardSynthesisProposalCard = {
        sourceId: card.sourceId.trim(),
        title: card.title.trim().slice(0, 180),
        description: card.description.trim().slice(0, 4000),
        candidateStatus: card.candidateStatus,
        priority: typeof card.priority === "number" ? Math.max(1, Math.round(card.priority)) : undefined,
        phase: card.phase?.trim().slice(0, 120) || undefined,
        labels: normalizeTaskLabels(card.labels),
        blockedBy: normalizeTaskReferences(card.blockedBy),
        acceptanceCriteria: normalizeCardTextList(card.acceptanceCriteria, 30),
        testPlan: normalizeProjectBoardCardTestPlan(card.testPlan),
        sourceRefs: normalizeCardTextList(card.sourceRefs, 20),
        clarificationQuestions: normalizeProjectBoardClarificationQuestions(card.clarificationQuestions ?? [], 8),
        clarificationSuggestions: normalizeProjectBoardClarificationSuggestions(card.clarificationSuggestions ?? [], []),
        objectiveProvenance: normalizeProjectBoardObjectiveProvenance(card.objectiveProvenance),
        uiMockRole: projectBoardUiMockRoleForSynthesisCard(card),
        requiresUiMockApproval: projectBoardRequiresUiMockApprovalForSynthesisCard(card),
        reviewStatus: "pending",
      };
      const existing = existingBySourceId.get(normalized.sourceId);
      if (!existing || !projectBoardSynthesisProposalCardReviewStillApplies(existing, normalized)) {
        return normalized;
      }
      return {
        ...normalized,
        reviewStatus: existing.reviewStatus,
        reviewReason: existing.reviewReason,
        mergeTargetCardId: existing.mergeTargetCardId,
        reviewedAt: existing.reviewedAt,
      };
    });
}

export function projectBoardCardPendingPiUpdateFromSynthesisCard(
  existing: ProjectBoardCardPendingPiUpdateStoreRow,
  incoming: ProjectBoardSynthesisCardInput,
  createdAt: string,
): ProjectBoardCardPendingPiUpdate | undefined {
  const existingClarificationAnswers = parseProjectBoardClarificationAnswers(existing.clarification_answers_json);
  const normalizedClarification = normalizeProjectBoardSynthesisClarificationFields({
    clarificationQuestions: incoming.clarificationQuestions,
    clarificationSuggestions: incoming.clarificationSuggestions,
    clarificationAnswers: existingClarificationAnswers,
    clarificationDecisions: incoming.clarificationDecisions,
    createdAt,
    updatedAt: createdAt,
  });
  const normalizedClarificationDecisions = normalizedClarification.clarificationDecisions;
  const normalizedCandidateStatus = projectBoardCandidateStatusForSynthesisUpdate(
    incoming.candidateStatus,
    existing.candidate_status,
    normalizedClarificationDecisions,
  );
  const normalized = {
    sourceId: incoming.sourceId.trim(),
    title: incoming.title.trim().slice(0, 180),
    description: incoming.description.trim().slice(0, 4000),
    candidateStatus: normalizedCandidateStatus,
    priority: typeof incoming.priority === "number" ? Math.max(1, Math.round(incoming.priority)) : undefined,
    phase: incoming.phase?.trim().slice(0, 120) || undefined,
    labels: normalizeTaskLabels(incoming.labels),
    blockedBy: normalizeTaskReferences(incoming.blockedBy),
    acceptanceCriteria: normalizeCardTextList(incoming.acceptanceCriteria, 30),
    testPlan: normalizeProjectBoardCardTestPlan(incoming.testPlan),
    sourceRefs: normalizeCardTextList(incoming.sourceRefs, 20),
    clarificationQuestions: normalizedClarification.clarificationQuestions,
    clarificationSuggestions: normalizedClarification.clarificationSuggestions,
    objectiveProvenance: normalizeProjectBoardObjectiveProvenance(incoming.objectiveProvenance),
    uiMockRole: projectBoardUiMockRoleForSynthesisCard(incoming),
    requiresUiMockApproval: projectBoardRequiresUiMockApprovalForSynthesisCard(incoming),
  };
  const existingPriority = existing.priority ?? undefined;
  const existingPhase = existing.phase ?? undefined;
  const existingLabels = parseProjectBoardStringList(existing.labels_json);
  const existingBlockedBy = parseProjectBoardStringList(existing.blocked_by_json);
  const existingAcceptanceCriteria = parseProjectBoardStringList(existing.acceptance_criteria_json);
  const existingTestPlan = parseProjectBoardCardTestPlan(existing.test_plan_json);
  const existingSourceRefs = parseProjectBoardStringList(existing.source_refs_json);
  const existingClarificationQuestions = parseProjectBoardStringList(existing.clarification_questions_json);
  const existingOpenClarificationQuestions = projectBoardUnansweredClarificationQuestions(
    existingClarificationQuestions,
    existingClarificationAnswers,
  );
  const existingClarificationSuggestions = parseProjectBoardClarificationSuggestions(existing.clarification_suggestions_json);
  const existingUiMockRole = normalizeProjectBoardUiMockRole(existing.ui_mock_role);
  const existingRequiresUiMockApproval = Boolean(existing.requires_ui_mock_approval);
  const existingClarificationDecisions = parseProjectBoardClarificationDecisions(existing.clarification_decisions_json, {
    clarificationQuestions: existingClarificationQuestions,
    clarificationSuggestions: existingClarificationSuggestions,
    clarificationAnswers: existingClarificationAnswers,
    createdAt: existing.created_at,
    updatedAt: existing.updated_at,
  });
  const changedFields: ProjectBoardCardTouchedField[] = [
    normalized.title !== existing.title ? "title" : undefined,
    normalized.description !== existing.description ? "description" : undefined,
    normalized.candidateStatus !== existing.candidate_status ? "candidateStatus" : undefined,
    normalized.priority !== existingPriority ? "priority" : undefined,
    normalized.phase !== existingPhase ? "phase" : undefined,
    JSON.stringify(normalized.labels) !== JSON.stringify(existingLabels) ? "labels" : undefined,
    JSON.stringify(normalized.blockedBy) !== JSON.stringify(existingBlockedBy) ? "dependencies" : undefined,
    JSON.stringify(normalized.acceptanceCriteria) !== JSON.stringify(existingAcceptanceCriteria) ? "acceptanceCriteria" : undefined,
    JSON.stringify(normalized.testPlan) !== JSON.stringify(existingTestPlan) ? "testPlan" : undefined,
    JSON.stringify(normalized.sourceRefs) !== JSON.stringify(existingSourceRefs) ? "sourceRefs" : undefined,
    JSON.stringify(normalized.clarificationQuestions) !== JSON.stringify(existingOpenClarificationQuestions)
      ? "clarificationQuestions"
      : undefined,
    JSON.stringify(normalized.clarificationSuggestions) !== JSON.stringify(existingClarificationSuggestions)
      ? "clarificationSuggestions"
      : undefined,
    projectBoardClarificationDecisionsEquivalent(normalizedClarificationDecisions, existingClarificationDecisions)
      ? undefined
      : "clarificationDecisions",
    normalized.uiMockRole !== existingUiMockRole || normalized.requiresUiMockApproval !== existingRequiresUiMockApproval
      ? "uiMockMetadata"
      : undefined,
  ].filter((field): field is ProjectBoardCardTouchedField => Boolean(field));
  if (changedFields.length === 0) return undefined;
  return {
    sourceId: normalized.sourceId,
    createdAt,
    changedFields,
    title: normalized.title,
    description: normalized.description,
    candidateStatus: normalized.candidateStatus,
    priority: normalized.priority,
    phase: normalized.phase,
    labels: normalized.labels,
    blockedBy: normalized.blockedBy,
    acceptanceCriteria: normalized.acceptanceCriteria,
    testPlan: normalized.testPlan,
    sourceRefs: normalized.sourceRefs,
    clarificationQuestions: normalized.clarificationQuestions,
    clarificationSuggestions: normalized.clarificationSuggestions,
    clarificationDecisions: normalizedClarificationDecisions,
    objectiveProvenance: normalized.objectiveProvenance,
    uiMockRole: normalized.uiMockRole,
    requiresUiMockApproval: normalized.requiresUiMockApproval,
  };
}

export function projectBoardMaterialPendingPiUpdateForRow(
  row: ProjectBoardCardPendingPiUpdateStoreRow,
  pending: ProjectBoardCardPendingPiUpdate,
): ProjectBoardCardPendingPiUpdate | undefined {
  const existingCandidateStatus = row.candidate_status ?? "ready_to_create";
  const existingPriority = row.priority ?? undefined;
  const existingPhase = row.phase ?? undefined;
  const existingLabels = parseProjectBoardStringList(row.labels_json);
  const existingBlockedBy = parseProjectBoardStringList(row.blocked_by_json);
  const existingAcceptanceCriteria = parseProjectBoardStringList(row.acceptance_criteria_json);
  const existingTestPlan = parseProjectBoardCardTestPlan(row.test_plan_json);
  const existingSourceRefs = parseProjectBoardStringList(row.source_refs_json);
  const existingClarificationQuestions = parseProjectBoardStringList(row.clarification_questions_json);
  const existingClarificationAnswers = parseProjectBoardClarificationAnswers(row.clarification_answers_json);
  const existingOpenClarificationQuestions = projectBoardUnansweredClarificationQuestions(
    existingClarificationQuestions,
    existingClarificationAnswers,
  );
  const existingClarificationSuggestions = parseProjectBoardClarificationSuggestions(row.clarification_suggestions_json);
  const existingUiMockRole = normalizeProjectBoardUiMockRole(row.ui_mock_role);
  const existingRequiresUiMockApproval = Boolean(row.requires_ui_mock_approval);
  const existingClarificationDecisions = parseProjectBoardClarificationDecisions(row.clarification_decisions_json, {
    clarificationQuestions: existingClarificationQuestions,
    clarificationSuggestions: existingClarificationSuggestions,
    clarificationAnswers: existingClarificationAnswers,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  const nextClarificationAnswers = normalizeProjectBoardClarificationAnswers(pending.clarificationAnswers ?? existingClarificationAnswers);
  const nextClarification = normalizeProjectBoardSynthesisClarificationFields({
    clarificationQuestions: pending.clarificationQuestions ?? existingClarificationQuestions,
    clarificationSuggestions: pending.clarificationSuggestions ?? existingClarificationSuggestions,
    clarificationAnswers: nextClarificationAnswers,
    clarificationDecisions: pending.clarificationDecisions ?? existingClarificationDecisions,
    createdAt: row.created_at,
    updatedAt: pending.createdAt || row.updated_at,
  });
  const nextCandidateStatus = pending.candidateStatus
    ? projectBoardCandidateStatusForSynthesisUpdate(
        pending.candidateStatus,
        existingCandidateStatus,
        nextClarification.clarificationDecisions,
      )
    : existingCandidateStatus;
  const changedFields: ProjectBoardCardTouchedField[] = [
    pending.title !== undefined && pending.title.trim().slice(0, 180) !== row.title ? "title" : undefined,
    pending.description !== undefined && pending.description.trim().slice(0, 4000) !== row.description ? "description" : undefined,
    pending.candidateStatus !== undefined && nextCandidateStatus !== existingCandidateStatus ? "candidateStatus" : undefined,
    pending.priority !== undefined && pending.priority !== existingPriority ? "priority" : undefined,
    pending.phase !== undefined && (pending.phase?.trim().slice(0, 80) || undefined) !== existingPhase ? "phase" : undefined,
    pending.labels !== undefined && JSON.stringify(normalizeTaskLabels(pending.labels)) !== JSON.stringify(existingLabels)
      ? "labels"
      : undefined,
    pending.blockedBy !== undefined && JSON.stringify(normalizeTaskReferences(pending.blockedBy)) !== JSON.stringify(existingBlockedBy)
      ? "dependencies"
      : undefined,
    pending.acceptanceCriteria !== undefined &&
    JSON.stringify(normalizeCardTextList(pending.acceptanceCriteria, 30)) !== JSON.stringify(existingAcceptanceCriteria)
      ? "acceptanceCriteria"
      : undefined,
    pending.testPlan !== undefined &&
    JSON.stringify(normalizeProjectBoardCardTestPlan(pending.testPlan)) !== JSON.stringify(existingTestPlan)
      ? "testPlan"
      : undefined,
    pending.sourceRefs !== undefined && JSON.stringify(normalizeCardTextList(pending.sourceRefs, 20)) !== JSON.stringify(existingSourceRefs)
      ? "sourceRefs"
      : undefined,
    pending.clarificationQuestions !== undefined &&
    JSON.stringify(nextClarification.clarificationQuestions) !== JSON.stringify(existingOpenClarificationQuestions)
      ? "clarificationQuestions"
      : undefined,
    pending.clarificationSuggestions !== undefined &&
    JSON.stringify(nextClarification.clarificationSuggestions) !== JSON.stringify(existingClarificationSuggestions)
      ? "clarificationSuggestions"
      : undefined,
    pending.clarificationAnswers !== undefined && JSON.stringify(nextClarificationAnswers) !== JSON.stringify(existingClarificationAnswers)
      ? "clarificationAnswers"
      : undefined,
    pending.clarificationDecisions !== undefined &&
    !projectBoardClarificationDecisionsEquivalent(nextClarification.clarificationDecisions, existingClarificationDecisions)
      ? "clarificationDecisions"
      : undefined,
    pending.uiMockRole !== undefined && normalizeProjectBoardUiMockRole(pending.uiMockRole) !== existingUiMockRole
      ? "uiMockMetadata"
      : undefined,
    pending.requiresUiMockApproval !== undefined && Boolean(pending.requiresUiMockApproval) !== existingRequiresUiMockApproval
      ? "uiMockMetadata"
      : undefined,
  ].filter((field): field is ProjectBoardCardTouchedField => Boolean(field));
  if (changedFields.length === 0) return undefined;
  return { ...pending, changedFields };
}

export function projectBoardSynthesisProposalCardReviewStillApplies(
  existing: ProjectBoardSynthesisProposalCard,
  next: ProjectBoardSynthesisProposalCard,
): boolean {
  if (existing.reviewStatus === "pending") return false;
  return (
    existing.title === next.title &&
    existing.description === next.description &&
    existing.candidateStatus === next.candidateStatus &&
    existing.priority === next.priority &&
    existing.phase === next.phase &&
    stringListsEqual(existing.labels, next.labels) &&
    stringListsEqual(existing.blockedBy, next.blockedBy) &&
    stringListsEqual(existing.acceptanceCriteria, next.acceptanceCriteria) &&
    stringListsEqual(existing.sourceRefs, next.sourceRefs) &&
    stringListsEqual(existing.clarificationQuestions ?? [], next.clarificationQuestions ?? []) &&
    JSON.stringify(existing.clarificationSuggestions ?? []) === JSON.stringify(next.clarificationSuggestions ?? []) &&
    stringListsEqual(existing.testPlan.unit, next.testPlan.unit) &&
    stringListsEqual(existing.testPlan.integration, next.testPlan.integration) &&
    stringListsEqual(existing.testPlan.visual, next.testPlan.visual) &&
    stringListsEqual(existing.testPlan.manual, next.testPlan.manual) &&
    JSON.stringify(existing.objectiveProvenance ?? null) === JSON.stringify(next.objectiveProvenance ?? null) &&
    existing.uiMockRole === next.uiMockRole &&
    Boolean(existing.requiresUiMockApproval) === Boolean(next.requiresUiMockApproval)
  );
}

function stringListsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
