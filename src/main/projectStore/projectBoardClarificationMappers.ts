import { projectBoardStructuredClarificationDecisions } from "../../shared/projectBoardClarificationDecisions";
import type { ProjectBoardDecisionImpactPreview } from "../../shared/projectBoardDecisionImpact";
import { dedupeProjectBoardQuestions, projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import type {
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardClarificationAnswer,
  ProjectBoardCardClarificationDecision,
  ProjectBoardCardClarificationSuggestion,
} from "../../shared/projectBoardTypes";

export interface ProjectBoardClarificationDecisionFallback {
  clarificationQuestions?: string[];
  clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
  clarificationAnswers?: ProjectBoardCardClarificationAnswer[];
  description?: string;
  acceptanceCriteria?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export function normalizeProjectBoardClarificationQuestions(items: string[], limit = 8): string[] {
  return dedupeProjectBoardQuestions(items, limit).map((item) => item.slice(0, 500));
}

export function normalizeProjectBoardClarificationSuggestions(
  value: ProjectBoardCardClarificationSuggestion[] | undefined,
  fallback: ProjectBoardCardClarificationSuggestion[] = [],
): ProjectBoardCardClarificationSuggestion[] {
  const normalized: ProjectBoardCardClarificationSuggestion[] = [];
  for (const suggestion of value ?? fallback) {
    if (!suggestion) continue;
    const question = suggestion.question?.trim().slice(0, 500) ?? "";
    const suggestedAnswer = suggestion.suggestedAnswer?.trim().slice(0, 1500) ?? "";
    const rationale = suggestion.rationale?.trim().slice(0, 1000) ?? "";
    if (!question || !suggestedAnswer) continue;
    const questionKind =
      suggestion.questionKind === "expert_default" ||
      suggestion.questionKind === "user_preference" ||
      suggestion.questionKind === "external_constraint"
        ? suggestion.questionKind
        : "user_preference";
    const normalizedSuggestion: ProjectBoardCardClarificationSuggestion = {
      question,
      suggestedAnswer,
      rationale: rationale || "Expert suggested answer from Ambient planning.",
      confidence:
        suggestion.confidence === "high" || suggestion.confidence === "medium" || suggestion.confidence === "low"
          ? suggestion.confidence
          : "low",
      safeToAccept: Boolean(suggestion.safeToAccept) && questionKind === "expert_default",
      questionKind,
    };
    const index = normalized.findIndex((item) => projectBoardQuestionsAreNearDuplicates(item.question, question));
    if (index >= 0) normalized[index] = normalizedSuggestion;
    else normalized.push(normalizedSuggestion);
  }
  return normalized.slice(0, 20);
}

export function parseProjectBoardClarificationSuggestions(value: string | null | undefined): ProjectBoardCardClarificationSuggestion[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return normalizeProjectBoardClarificationSuggestions(
      parsed.filter(
        (item): item is ProjectBoardCardClarificationSuggestion =>
          Boolean(item) && typeof item === "object" && typeof item.question === "string" && typeof item.suggestedAnswer === "string",
      ),
    );
  } catch {
    return [];
  }
}

export function normalizeProjectBoardClarificationAnswers(
  value: ProjectBoardCardClarificationAnswer[] | undefined,
  fallback: ProjectBoardCardClarificationAnswer[] = [],
): ProjectBoardCardClarificationAnswer[] {
  const source = value ?? fallback;
  const seen = new Set<string>();
  const answers: ProjectBoardCardClarificationAnswer[] = [];
  for (const item of source) {
    const question = typeof item.question === "string" ? item.question.trim().slice(0, 500) : "";
    const answer = typeof item.answer === "string" ? item.answer.trim().slice(0, 1500) : "";
    const answeredAt =
      typeof item.answeredAt === "string" && item.answeredAt.trim() ? item.answeredAt.trim().slice(0, 80) : new Date().toISOString();
    if (!question || !answer) continue;
    const key = question.toLowerCase();
    const existing = answers.find((candidate) => projectBoardQuestionsAreNearDuplicates(candidate.question, question));
    if (seen.has(key) || existing) {
      if (existing) {
        existing.answer = answer;
        existing.answeredAt = answeredAt;
      }
      continue;
    }
    seen.add(key);
    answers.push({ question, answer, answeredAt });
  }
  // Keep the newest answers at the cap so a fresh answer is never the one dropped.
  return answers.slice(-20);
}

export function parseProjectBoardClarificationAnswers(value: string | null | undefined): ProjectBoardCardClarificationAnswer[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return normalizeProjectBoardClarificationAnswers(
      parsed.filter(
        (item): item is ProjectBoardCardClarificationAnswer =>
          Boolean(item) && typeof item === "object" && typeof item.question === "string" && typeof item.answer === "string",
      ),
    );
  } catch {
    return [];
  }
}

export function normalizeProjectBoardClarificationDecisions(
  value: ProjectBoardCardClarificationDecision[] | undefined,
  fallback: ProjectBoardClarificationDecisionFallback = {},
): ProjectBoardCardClarificationDecision[] {
  return projectBoardStructuredClarificationDecisions({
    clarificationDecisions: value,
    clarificationQuestions: normalizeProjectBoardClarificationQuestions(fallback.clarificationQuestions ?? [], 8),
    clarificationSuggestions: normalizeProjectBoardClarificationSuggestions(fallback.clarificationSuggestions ?? [], []),
    clarificationAnswers: normalizeProjectBoardClarificationAnswers(fallback.clarificationAnswers ?? []),
    description: fallback.description,
    acceptanceCriteria: fallback.acceptanceCriteria,
    createdAt: fallback.createdAt,
    updatedAt: fallback.updatedAt,
    includeInlineQuestions: false,
    limit: 20,
  });
}

export function parseProjectBoardClarificationDecisions(
  value: string | null | undefined,
  fallback: ProjectBoardClarificationDecisionFallback = {},
): ProjectBoardCardClarificationDecision[] {
  if (!value) return normalizeProjectBoardClarificationDecisions(undefined, fallback);
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return normalizeProjectBoardClarificationDecisions(undefined, fallback);
    const decisions = normalizeProjectBoardClarificationDecisions(
      parsed.filter(
        (item): item is ProjectBoardCardClarificationDecision =>
          Boolean(item) && typeof item === "object" && typeof item.question === "string",
      ),
      fallback,
    );
    return decisions.length > 0 ? decisions : normalizeProjectBoardClarificationDecisions(undefined, fallback);
  } catch {
    return normalizeProjectBoardClarificationDecisions(undefined, fallback);
  }
}

export function normalizeProjectBoardSynthesisClarificationFields(input: {
  clarificationQuestions?: string[];
  clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
  clarificationAnswers?: ProjectBoardCardClarificationAnswer[];
  clarificationDecisions?: ProjectBoardCardClarificationDecision[];
  createdAt?: string;
  updatedAt?: string;
}): {
  clarificationQuestions: string[];
  clarificationSuggestions: ProjectBoardCardClarificationSuggestion[];
  clarificationDecisions: ProjectBoardCardClarificationDecision[];
} {
  const answers = normalizeProjectBoardClarificationAnswers(input.clarificationAnswers ?? []);
  const baseQuestions = normalizeProjectBoardClarificationQuestions(input.clarificationQuestions ?? [], 8).filter(
    (question) => !projectBoardClarificationQuestionHasAnswer(question, answers),
  );
  const baseSuggestions = normalizeProjectBoardClarificationSuggestions(input.clarificationSuggestions ?? [], []);
  const seedDecisions = normalizeProjectBoardClarificationDecisions(input.clarificationDecisions, {
    clarificationQuestions: baseQuestions,
    clarificationSuggestions: baseSuggestions,
    clarificationAnswers: answers,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
  const decisionQuestions = seedDecisions.filter((decision) => decision.state === "open").map((decision) => decision.question);
  const decisionSuggestions = seedDecisions.flatMap((decision): ProjectBoardCardClarificationSuggestion[] => {
    if (decision.state !== "open" || !decision.suggestedAnswer?.trim()) return [];
    const questionKind = decision.questionKind ?? "user_preference";
    return [
      {
        question: decision.question,
        suggestedAnswer: decision.suggestedAnswer.trim(),
        rationale: decision.rationale?.trim() || "Suggested default from the structured clarification decision.",
        confidence: decision.confidence ?? "low",
        safeToAccept: Boolean(decision.safeToAccept) && questionKind === "expert_default",
        questionKind,
      },
    ];
  });
  const clarificationQuestions =
    baseQuestions.length > 0 ? baseQuestions : normalizeProjectBoardClarificationQuestions(decisionQuestions, 8);
  const clarificationSuggestions =
    baseSuggestions.length > 0 ? baseSuggestions : normalizeProjectBoardClarificationSuggestions(decisionSuggestions, []);
  const clarificationDecisions = normalizeProjectBoardClarificationDecisions(input.clarificationDecisions, {
    clarificationQuestions,
    clarificationSuggestions,
    clarificationAnswers: answers,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
  return { clarificationQuestions, clarificationSuggestions, clarificationDecisions };
}

export function projectBoardClarificationQuestionHasAnswer(question: string, answers: ProjectBoardCardClarificationAnswer[]): boolean {
  return answers.some((answer) => answer.answer.trim() && projectBoardQuestionsAreNearDuplicates(answer.question, question));
}

export function projectBoardUnansweredClarificationQuestions(
  questions: string[],
  answers: ProjectBoardCardClarificationAnswer[],
): string[] {
  return normalizeProjectBoardClarificationQuestions(questions, 8).filter(
    (question) => !projectBoardClarificationQuestionHasAnswer(question, answers),
  );
}

export function projectBoardClarificationDecisionsHaveOpenQuestion(decisions: ProjectBoardCardClarificationDecision[]): boolean {
  return decisions.some((decision) => decision.state === "open");
}

export function projectBoardCandidateStatusForSynthesisUpdate(
  incoming: ProjectBoardCardCandidateStatus,
  existing: ProjectBoardCardCandidateStatus,
  clarificationDecisions: ProjectBoardCardClarificationDecision[],
): ProjectBoardCardCandidateStatus {
  if (
    incoming === "needs_clarification" &&
    existing !== "needs_clarification" &&
    !projectBoardClarificationDecisionsHaveOpenQuestion(clarificationDecisions)
  ) {
    return existing;
  }
  return incoming;
}

export function projectBoardChangedClarificationAnswer(
  previousAnswers: ProjectBoardCardClarificationAnswer[],
  nextAnswers: ProjectBoardCardClarificationAnswer[],
): ProjectBoardCardClarificationAnswer | undefined {
  for (const answer of nextAnswers) {
    const previous = previousAnswers.find((candidate) => projectBoardQuestionsAreNearDuplicates(candidate.question, answer.question));
    if (!previous || previous.answer.trim() !== answer.answer.trim() || previous.answeredAt.trim() !== answer.answeredAt.trim())
      return answer;
  }
  return undefined;
}

export function projectBoardClarificationAnswerSection(question: string, answer: string): string {
  return [`- Q: ${question.trim()}`, `  A: ${answer.trim()}`].join("\n");
}

export function projectBoardDescriptionWithClarificationAnswer(description: string, question: string, answer: string): string {
  const trimmed = description.trim();
  const entry = projectBoardClarificationAnswerSection(question, answer);
  if (!trimmed) return `## Clarifications\n${entry}`;
  if (trimmed.includes(entry)) return trimmed;
  if (/^##\s+Clarifications\s*$/im.test(trimmed)) return `${trimmed}\n${entry}`;
  return `${trimmed}\n\n## Clarifications\n${entry}`;
}

export function projectBoardQuestionMatchesAnyVariant(question: string, variants: string[]): boolean {
  return variants.some((variant) => projectBoardQuestionsAreNearDuplicates(question, variant));
}

export function projectBoardClarificationDecisionImpactEventSummary(cardTitle: string, impact: ProjectBoardDecisionImpactPreview): string {
  if (!impact.visible) return `${cardTitle} answered a clarification. No linked card impact; 0 model calls.`;
  return `${cardTitle} answered a clarification. ${impact.detail} 0 model calls.`;
}

export function projectBoardDecisionImpactEventMetadata(impact: ProjectBoardDecisionImpactPreview): Record<string, unknown> {
  return {
    triggerType: "clarification_answer",
    question: impact.question,
    canonicalKey: impact.canonicalKey,
    answeredCardId: impact.answeredCardId,
    affectedCardCount: impact.affectedCardIds.length,
    affectedCardIds: impact.affectedCardIds.slice(0, 40),
    affectedCounts: {
      unblockedDrafts: impact.unblockedDraftCount,
      stillBlockedDrafts: impact.stillBlockedDraftCount,
      duplicateVariantsHidden: impact.duplicateHiddenCount,
      readyFeedback: impact.readyFeedbackCount,
      auditOnly: impact.auditOnlyCount,
    },
    targetedRefreshOptional: impact.targetedRefreshOptional,
    modelCallRequired: impact.modelCallRequired,
    recommendedActions: impact.recommendedActions,
  };
}

export function projectBoardDecisionImpactFeedbackText(question: string, answer: string): string {
  return [
    `Clarification decision impact: ${question}`,
    `Decision answer: ${answer}.`,
    "Apply this PM decision in the next run without rewriting the approved card silently.",
  ]
    .join(" ")
    .slice(0, 1500);
}
