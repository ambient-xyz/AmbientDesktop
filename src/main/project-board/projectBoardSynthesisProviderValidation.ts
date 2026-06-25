import { projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import type { ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import {
  assertProjectBoardCardTitleQuality,
  projectBoardDuplicateClarificationQuestionViolations,
  projectBoardSettledClarificationReopenViolations,
  ProjectBoardCardTitleQualityValidationError,
  type ProjectBoardClarificationQuestionCandidate,
  type ProjectBoardDuplicateClarificationQuestionViolation,
  type ProjectBoardSettledClarificationReopenViolation,
  type ProjectBoardSynthesisDraft,
  type ProjectBoardSynthesisRefinementContext,
} from "./projectBoardSynthesis";

export class ProjectBoardSettledClarificationValidationError extends Error {
  readonly violations: ProjectBoardSettledClarificationReopenViolation[];
  readonly context: Record<string, unknown>;

  constructor(violations: ProjectBoardSettledClarificationReopenViolation[], context: Record<string, unknown>) {
    const first = violations[0];
    super(
      first
        ? `Ambient/Pi reopened ${violations.length} settled clarification decision${
            violations.length === 1 ? "" : "s"
          } in ${String(context.surface ?? "planner output")}: "${first.question}" matches answered decision ${first.matchedDecisionId}. It must reuse the settled answer or cite materially changed source evidence and ask only the missing delta.`
        : "Ambient/Pi reopened a settled clarification decision.",
    );
    this.name = "ProjectBoardSettledClarificationValidationError";
    this.violations = violations;
    this.context = context;
  }
}

export class ProjectBoardDuplicateClarificationQuestionValidationError extends Error {
  readonly violations: ProjectBoardDuplicateClarificationQuestionViolation[];
  readonly context: Record<string, unknown>;

  constructor(violations: ProjectBoardDuplicateClarificationQuestionViolation[], context: Record<string, unknown>) {
    const first = violations[0];
    super(
      first
        ? `Ambient/Pi emitted ${violations.length} duplicate clarification question${
            violations.length === 1 ? "" : "s"
          } in ${String(context.surface ?? "planner output")}: "${first.duplicateQuestion}" duplicates "${first.firstQuestion}" by ${first.duplicateReason}. Reuse one stable canonical question id instead of emitting variants.`
        : "Ambient/Pi emitted duplicate clarification questions.",
    );
    this.name = "ProjectBoardDuplicateClarificationQuestionValidationError";
    this.violations = violations;
    this.context = context;
  }
}

export function assertValidProjectBoardGeneratedDraftTitles(draft: ProjectBoardSynthesisDraft, context: Record<string, unknown>): void {
  assertProjectBoardCardTitleQuality(
    draft.cards.map((card, index) => ({
      title: card.title,
      sourceId: card.sourceId,
      cardId: card.sourceId,
      location: `draft.cards[${index}].title`,
    })),
    context,
  );
}

export function assertValidProjectBoardGeneratedRecordTitles(
  records: ProposalJsonlRecordArtifact[],
  context: Record<string, unknown>,
): void {
  assertProjectBoardCardTitleQuality(
    records.flatMap((record, index) =>
      record.type === "candidate_card"
        ? [
            {
              title: record.title,
              sourceId: record.sourceId,
              cardId: record.sourceId,
              location: `records[${index}].title`,
            },
          ]
        : [],
    ),
    context,
  );
}

export function assertValidClarificationQuestionDraft(
  draft: ProjectBoardSynthesisDraft,
  refinement: ProjectBoardSynthesisRefinementContext | undefined,
  context: Record<string, unknown>,
): void {
  assertValidClarificationQuestionCandidates(refinement, projectBoardClarificationQuestionCandidatesFromDraft(draft), context);
}

export function assertValidClarificationQuestionRecords(
  records: ProposalJsonlRecordArtifact[],
  refinement: ProjectBoardSynthesisRefinementContext | undefined,
  context: Record<string, unknown>,
): void {
  assertValidClarificationQuestionCandidates(refinement, projectBoardClarificationQuestionCandidatesFromRecords(records), context);
}

export function assertValidClarificationQuestionCandidates(
  refinement: ProjectBoardSynthesisRefinementContext | undefined,
  candidates: Parameters<typeof projectBoardSettledClarificationReopenViolations>[1],
  context: Record<string, unknown>,
): void {
  const violations = projectBoardSettledClarificationReopenViolations(refinement, candidates);
  if (violations.length > 0) throw new ProjectBoardSettledClarificationValidationError(violations, context);
  const duplicateViolations = projectBoardDuplicateClarificationQuestionViolations(candidates);
  if (duplicateViolations.length === 0) return;
  throw new ProjectBoardDuplicateClarificationQuestionValidationError(duplicateViolations, context);
}

export function projectBoardClarificationQuestionCandidatesFromDraft(draft: ProjectBoardSynthesisDraft) {
  return [
    ...draft.questions.map((question, index) => ({
      question,
      location: `draft.questions[${index}]`,
    })),
    ...draft.cards.flatMap((card, cardIndex) =>
      (card.clarificationQuestions ?? []).map((question, questionIndex) => ({
        question,
        location: `draft.cards[${cardIndex}].clarificationQuestions[${questionIndex}]`,
        cardId: card.sourceId,
        cardTitle: card.title,
        sourceId: card.sourceId,
      })),
    ),
  ];
}

export function projectBoardClarificationQuestionCandidatesFromRecords(records: ProposalJsonlRecordArtifact[]) {
  const candidates = records.flatMap((record, recordIndex) => {
    if (record.type === "question") {
      return [
        {
          question: record.question,
          questionId: record.questionId,
          location: `records[${recordIndex}].question`,
          cardId: record.cardId,
        },
      ];
    }
    if (record.type === "candidate_card") {
      return dedupeClarificationQuestionCandidates([
        ...(record.clarificationDecisions ?? [])
          .filter((decision) => decision.state === "open")
          .map((decision, decisionIndex) => ({
            question: decision.question,
            questionId: decision.id,
            location: `records[${recordIndex}].clarificationDecisions[${decisionIndex}]`,
            cardId: record.sourceId,
            cardTitle: record.title,
            sourceId: record.sourceId,
          })),
        ...record.clarificationQuestions.map((question, questionIndex) => ({
          question,
          location: `records[${recordIndex}].clarificationQuestions[${questionIndex}]`,
          cardId: record.sourceId,
          cardTitle: record.title,
          sourceId: record.sourceId,
        })),
      ]);
    }
    if (record.type === "proposal_final") {
      return record.questions.map((question, questionIndex) => ({
        question,
        location: `records[${recordIndex}].questions[${questionIndex}]`,
      }));
    }
    return [];
  });
  return dedupeMirroredClarificationQuestionCandidates(candidates);
}

export function dedupeClarificationQuestionCandidates(
  candidates: ProjectBoardClarificationQuestionCandidate[],
): ProjectBoardClarificationQuestionCandidate[] {
  const deduped: ProjectBoardClarificationQuestionCandidate[] = [];
  for (const candidate of candidates) {
    const question = candidate.question.trim();
    if (!question) continue;
    const duplicate = deduped.some((existing) => {
      if (existing.questionId && candidate.questionId && existing.questionId === candidate.questionId) return true;
      return projectBoardQuestionsAreNearDuplicates(existing.question, question);
    });
    if (!duplicate) deduped.push({ ...candidate, question });
  }
  return deduped;
}

export function dedupeMirroredClarificationQuestionCandidates(
  candidates: ProjectBoardClarificationQuestionCandidate[],
): ProjectBoardClarificationQuestionCandidate[] {
  const deduped: ProjectBoardClarificationQuestionCandidate[] = [];
  for (const candidate of candidates) {
    const question = candidate.question.trim();
    if (!question) continue;
    const duplicateIndex = deduped.findIndex((existing) => {
      if (existing.questionId && candidate.questionId && existing.questionId === candidate.questionId) {
        if (existing.cardId && candidate.cardId && existing.cardId !== candidate.cardId) return false;
        return true;
      }
      if (!projectBoardQuestionsAreNearDuplicates(existing.question, question)) return false;
      if (existing.cardId && candidate.cardId && existing.cardId !== candidate.cardId) return false;
      return true;
    });
    if (duplicateIndex < 0) {
      deduped.push({ ...candidate, question });
      continue;
    }
    const existing = deduped[duplicateIndex];
    if (!existing.cardId && candidate.cardId) deduped[duplicateIndex] = { ...candidate, question };
  }
  return deduped;
}

export function settledClarificationValidationMetadata(error: unknown): Record<string, unknown> {
  if (!(error instanceof ProjectBoardSettledClarificationValidationError)) return {};
  return {
    failureKind: "settled_clarification_reopened",
    settledClarificationViolationCount: error.violations.length,
    settledClarificationViolations: error.violations.slice(0, 12),
    settledClarificationValidationContext: error.context,
  };
}

export function duplicateClarificationQuestionValidationMetadata(error: unknown): Record<string, unknown> {
  if (!(error instanceof ProjectBoardDuplicateClarificationQuestionValidationError)) return {};
  return {
    failureKind: "duplicate_canonical_questions",
    duplicateClarificationQuestionCount: error.violations.length,
    duplicateClarificationQuestionViolations: error.violations.slice(0, 12),
    duplicateClarificationValidationContext: error.context,
  };
}

export function cardTitleQualityValidationMetadata(error: unknown): Record<string, unknown> {
  if (!(error instanceof ProjectBoardCardTitleQualityValidationError)) return {};
  return {
    failureKind: "implementation_detail_card_titles",
    cardTitleQualityViolationCount: error.violations.length,
    cardTitleQualityViolations: error.violations.slice(0, 12),
    cardTitleQualityValidationContext: error.context,
  };
}
