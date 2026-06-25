import { projectBoardOpenClarificationQuestions } from "../../shared/projectBoardClarificationDecisions";
import type {
  ProjectBoardAddCardsObjectiveProvenance,
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardClarificationAnswer,
  ProjectBoardCardClarificationDecision,
  ProjectBoardCardClarificationSuggestion,
  ProjectBoardCardPendingPiUpdate,
  ProjectBoardCardTestPlan,
  ProjectBoardCardTouchedField,
  ProjectBoardUiMockRole,
} from "../../shared/projectBoardTypes";
import {
  normalizeCardTextList,
  normalizeProjectBoardCardTestPlan,
  normalizeProjectBoardClarificationAnswers,
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
  normalizeProjectBoardClarificationSuggestions,
  normalizeProjectBoardSynthesisClarificationFields,
  normalizeProjectBoardUiMockRole,
  normalizeTaskLabels,
  normalizeTaskReferences,
  projectBoardCandidateStatusForSynthesisUpdate,
  projectBoardCardProofCount,
  projectBoardChangedClarificationAnswer,
} from "./projectBoardMappers";

export interface UpdateProjectBoardCardMutationInput {
  cardId: string;
  title?: string;
  description?: string;
  candidateStatus?: ProjectBoardCardCandidateStatus;
  priority?: number | null;
  phase?: string | null;
  labels?: string[];
  blockedBy?: string[];
  acceptanceCriteria?: string[];
  testPlan?: ProjectBoardCardTestPlan;
  sourceRefs?: string[];
  clarificationQuestions?: string[];
  clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
  clarificationAnswers?: ProjectBoardCardClarificationAnswer[];
  clarificationDecisions?: ProjectBoardCardClarificationDecision[];
}

export interface ProjectBoardCardDraftUpdateState {
  title: string;
  description: string;
  candidateStatus: ProjectBoardCardCandidateStatus;
  priority: number | null;
  phase: string | null;
  labels: string[];
  blockedBy: string[];
  acceptanceCriteria: string[];
  testPlan: ProjectBoardCardTestPlan;
  sourceRefs: string[];
  clarificationQuestions: string[];
  clarificationSuggestions: ProjectBoardCardClarificationSuggestion[];
  clarificationAnswers: ProjectBoardCardClarificationAnswer[];
  clarificationDecisions: ProjectBoardCardClarificationDecision[];
  changedFields: ProjectBoardCardTouchedField[];
  touchedFields: ProjectBoardCardTouchedField[];
  touchedAt: string | null;
  changedClarificationAnswer?: ProjectBoardCardClarificationAnswer;
}

export interface ProjectBoardCardPendingPiUpdateState {
  sourceId: string;
  changedFields: ProjectBoardCardTouchedField[];
  title: string;
  description: string;
  candidateStatus: ProjectBoardCardCandidateStatus;
  priority: number | null;
  phase: string | null;
  labels: string[];
  blockedBy: string[];
  acceptanceCriteria: string[];
  testPlan: ProjectBoardCardTestPlan;
  sourceRefs: string[];
  clarificationQuestions: string[];
  clarificationSuggestions: ProjectBoardCardClarificationSuggestion[];
  clarificationAnswers: ProjectBoardCardClarificationAnswer[];
  clarificationDecisions: ProjectBoardCardClarificationDecision[];
  objectiveProvenance?: ProjectBoardAddCardsObjectiveProvenance;
  uiMockRole?: ProjectBoardUiMockRole;
  requiresUiMockApproval: boolean;
  touchedFields: ProjectBoardCardTouchedField[];
}

export function buildProjectBoardCardDraftUpdateState(input: {
  current: ProjectBoardCard;
  update: UpdateProjectBoardCardMutationInput;
  now: string;
  requiresProofSpec: boolean;
}): ProjectBoardCardDraftUpdateState {
  const { current, now, update } = input;
  const title = update.title === undefined ? current.title : update.title.trim();
  if (!title) throw new Error("Project board card title cannot be empty.");
  const description = update.description === undefined ? current.description : update.description.trim().slice(0, 4000);
  let candidateStatus = update.candidateStatus ?? current.candidateStatus;
  const priority =
    update.priority === undefined
      ? (current.priority ?? null)
      : update.priority === null
        ? null
        : Math.max(0, Math.min(100, Math.round(update.priority)));
  const phase = update.phase === undefined ? (current.phase ?? null) : update.phase?.trim() ? update.phase.trim().slice(0, 80) : null;
  const labels = update.labels === undefined ? current.labels : normalizeTaskLabels(update.labels);
  const blockedBy = update.blockedBy === undefined ? current.blockedBy : normalizeTaskReferences(update.blockedBy);
  const acceptanceCriteria =
    update.acceptanceCriteria === undefined ? current.acceptanceCriteria : normalizeCardTextList(update.acceptanceCriteria, 30);
  const testPlan = update.testPlan === undefined ? current.testPlan : normalizeProjectBoardCardTestPlan(update.testPlan);
  const sourceRefs = update.sourceRefs === undefined ? (current.sourceRefs ?? []) : normalizeCardTextList(update.sourceRefs, 20);
  const clarificationQuestions =
    update.clarificationQuestions === undefined
      ? normalizeProjectBoardClarificationQuestions(current.clarificationQuestions ?? [], 8)
      : normalizeProjectBoardClarificationQuestions(update.clarificationQuestions, 8);
  const clarificationSuggestions =
    update.clarificationSuggestions === undefined
      ? (current.clarificationSuggestions ?? [])
      : normalizeProjectBoardClarificationSuggestions(update.clarificationSuggestions, []);
  const clarificationAnswers =
    update.clarificationAnswers === undefined
      ? (current.clarificationAnswers ?? [])
      : normalizeProjectBoardClarificationAnswers(update.clarificationAnswers);
  const clarificationInputsChanged =
    update.clarificationQuestions !== undefined ||
    update.clarificationSuggestions !== undefined ||
    update.clarificationAnswers !== undefined ||
    update.clarificationDecisions !== undefined ||
    update.description !== undefined ||
    update.acceptanceCriteria !== undefined;
  const clarificationDecisions =
    update.clarificationDecisions !== undefined
      ? normalizeProjectBoardClarificationDecisions(update.clarificationDecisions, {
          clarificationQuestions,
          clarificationSuggestions,
          clarificationAnswers,
          createdAt: current.createdAt,
          updatedAt: now,
        })
      : clarificationInputsChanged
        ? normalizeProjectBoardClarificationDecisions(current.clarificationDecisions, {
            clarificationQuestions,
            clarificationSuggestions,
            clarificationAnswers,
            createdAt: current.createdAt,
            updatedAt: now,
          })
        : (current.clarificationDecisions ?? []);

  if (
    update.candidateStatus === undefined &&
    candidateStatus === "needs_clarification" &&
    (!input.requiresProofSpec || projectBoardCardProofCount({ ...current, testPlan }) > 0) &&
    projectBoardOpenClarificationQuestions({
      clarificationDecisions,
      clarificationQuestions,
      clarificationSuggestions,
      clarificationAnswers,
      includeInlineQuestions: false,
      limit: 8,
    }).length === 0
  ) {
    candidateStatus = "ready_to_create";
  }

  const changedFields = projectBoardCardDraftChangedFields(current, {
    title,
    description,
    candidateStatus,
    priority,
    phase,
    labels,
    blockedBy,
    acceptanceCriteria,
    testPlan,
    sourceRefs,
    clarificationQuestions,
    clarificationSuggestions,
    clarificationAnswers,
    clarificationDecisions,
  });
  const touchedFields =
    changedFields.length > 0 ? [...new Set([...(current.userTouchedFields ?? []), ...changedFields])] : (current.userTouchedFields ?? []);
  const touchedAt = changedFields.length > 0 ? now : (current.userTouchedAt ?? null);
  const changedClarificationAnswer = changedFields.includes("clarificationAnswers")
    ? projectBoardChangedClarificationAnswer(current.clarificationAnswers ?? [], clarificationAnswers)
    : undefined;

  return {
    title,
    description,
    candidateStatus,
    priority,
    phase,
    labels,
    blockedBy,
    acceptanceCriteria,
    testPlan,
    sourceRefs,
    clarificationQuestions,
    clarificationSuggestions,
    clarificationAnswers,
    clarificationDecisions,
    changedFields,
    touchedFields,
    touchedAt,
    changedClarificationAnswer,
  };
}

export function buildProjectBoardCardPendingPiUpdateState(input: {
  current: ProjectBoardCard;
  pendingUpdate: ProjectBoardCardPendingPiUpdate;
  now: string;
}): ProjectBoardCardPendingPiUpdateState {
  const { current, pendingUpdate, now } = input;
  const title = pendingUpdate.title ?? current.title;
  const description = pendingUpdate.description ?? current.description;
  const priority = pendingUpdate.priority ?? current.priority ?? null;
  const phase = pendingUpdate.phase ?? current.phase ?? null;
  const labels = pendingUpdate.labels ?? current.labels;
  const blockedBy = pendingUpdate.blockedBy ?? current.blockedBy;
  const acceptanceCriteria = pendingUpdate.acceptanceCriteria ?? current.acceptanceCriteria;
  const testPlan = pendingUpdate.testPlan ?? current.testPlan;
  const sourceRefs = pendingUpdate.sourceRefs ?? current.sourceRefs ?? [];
  const clarificationAnswers = normalizeProjectBoardClarificationAnswers(
    pendingUpdate.clarificationAnswers ?? current.clarificationAnswers ?? [],
  );
  const normalizedClarification = normalizeProjectBoardSynthesisClarificationFields({
    clarificationQuestions: pendingUpdate.clarificationQuestions ?? current.clarificationQuestions ?? [],
    clarificationSuggestions: pendingUpdate.clarificationSuggestions ?? current.clarificationSuggestions ?? [],
    clarificationAnswers,
    clarificationDecisions: pendingUpdate.clarificationDecisions ?? current.clarificationDecisions,
    createdAt: current.createdAt,
    updatedAt: now,
  });
  const clarificationQuestions = normalizedClarification.clarificationQuestions;
  const clarificationSuggestions = normalizedClarification.clarificationSuggestions;
  const clarificationDecisions = normalizedClarification.clarificationDecisions;
  const candidateStatus = pendingUpdate.candidateStatus
    ? projectBoardCandidateStatusForSynthesisUpdate(pendingUpdate.candidateStatus, current.candidateStatus, clarificationDecisions)
    : current.candidateStatus;
  const touchedFields = [...new Set([...(current.userTouchedFields ?? []), ...pendingUpdate.changedFields])];

  return {
    sourceId: pendingUpdate.sourceId,
    changedFields: pendingUpdate.changedFields,
    title,
    description,
    candidateStatus,
    priority,
    phase,
    labels: normalizeTaskLabels(labels),
    blockedBy: normalizeTaskReferences(blockedBy),
    acceptanceCriteria: normalizeCardTextList(acceptanceCriteria, 30),
    testPlan: normalizeProjectBoardCardTestPlan(testPlan),
    sourceRefs: normalizeCardTextList(sourceRefs, 20),
    clarificationQuestions: normalizeProjectBoardClarificationQuestions(clarificationQuestions, 8),
    clarificationSuggestions: normalizeProjectBoardClarificationSuggestions(clarificationSuggestions, []),
    clarificationAnswers: normalizeProjectBoardClarificationAnswers(clarificationAnswers),
    clarificationDecisions,
    objectiveProvenance: pendingUpdate.objectiveProvenance ?? current.objectiveProvenance,
    uiMockRole: normalizeProjectBoardUiMockRole(pendingUpdate.uiMockRole ?? current.uiMockRole) ?? undefined,
    requiresUiMockApproval: pendingUpdate.requiresUiMockApproval ?? current.requiresUiMockApproval ?? false,
    touchedFields,
  };
}

function projectBoardCardDraftChangedFields(
  current: ProjectBoardCard,
  next: {
    title: string;
    description: string;
    candidateStatus: ProjectBoardCardCandidateStatus;
    priority: number | null;
    phase: string | null;
    labels: string[];
    blockedBy: string[];
    acceptanceCriteria: string[];
    testPlan: ProjectBoardCardTestPlan;
    sourceRefs: string[];
    clarificationQuestions: string[];
    clarificationSuggestions: ProjectBoardCardClarificationSuggestion[];
    clarificationAnswers: ProjectBoardCardClarificationAnswer[];
    clarificationDecisions: ProjectBoardCardClarificationDecision[];
  },
): ProjectBoardCardTouchedField[] {
  return [
    next.title !== current.title ? "title" : undefined,
    next.description !== current.description ? "description" : undefined,
    next.candidateStatus !== current.candidateStatus ? "candidateStatus" : undefined,
    next.priority !== (current.priority ?? null) ? "priority" : undefined,
    next.phase !== (current.phase ?? null) ? "phase" : undefined,
    JSON.stringify(next.labels) !== JSON.stringify(current.labels) ? "labels" : undefined,
    JSON.stringify(next.blockedBy) !== JSON.stringify(current.blockedBy) ? "dependencies" : undefined,
    JSON.stringify(next.acceptanceCriteria) !== JSON.stringify(current.acceptanceCriteria) ? "acceptanceCriteria" : undefined,
    JSON.stringify(next.testPlan) !== JSON.stringify(current.testPlan) ? "testPlan" : undefined,
    JSON.stringify(next.sourceRefs) !== JSON.stringify(current.sourceRefs ?? []) ? "sourceRefs" : undefined,
    JSON.stringify(next.clarificationQuestions) !== JSON.stringify(current.clarificationQuestions ?? [])
      ? "clarificationQuestions"
      : undefined,
    JSON.stringify(next.clarificationSuggestions) !== JSON.stringify(current.clarificationSuggestions ?? [])
      ? "clarificationSuggestions"
      : undefined,
    JSON.stringify(next.clarificationAnswers) !== JSON.stringify(current.clarificationAnswers ?? []) ? "clarificationAnswers" : undefined,
    JSON.stringify(next.clarificationDecisions) !== JSON.stringify(current.clarificationDecisions ?? [])
      ? "clarificationDecisions"
      : undefined,
  ].filter((field): field is ProjectBoardCardTouchedField => Boolean(field));
}
