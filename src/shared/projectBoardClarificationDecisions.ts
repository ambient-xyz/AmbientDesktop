import type { ProjectBoardCardClarificationAnswer, ProjectBoardCardClarificationDecision, ProjectBoardCardClarificationDecisionSource, ProjectBoardCardClarificationDecisionState, ProjectBoardCardClarificationSuggestion, ProjectBoardClarificationQuestionKind } from "./projectBoardTypes";
import {
  projectBoardQuestionDedupeKey,
  projectBoardQuestionsAreNearDuplicates,
} from "./projectBoardQuestionDedupe";

export type ProjectBoardClarificationDecisionSource =
  ProjectBoardCardClarificationDecisionSource;
export type ProjectBoardClarificationDecisionState = ProjectBoardCardClarificationDecisionState;
export type ProjectBoardClarificationDecision = ProjectBoardCardClarificationDecision;

export interface ProjectBoardClarificationDecisionInput {
  clarificationDecisions?: ProjectBoardCardClarificationDecision[];
  clarificationQuestions?: string[];
  clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
  clarificationAnswers?: ProjectBoardCardClarificationAnswer[];
  description?: string;
  acceptanceCriteria?: string[];
  includeInlineQuestions?: boolean;
  limit?: number;
}

export function projectBoardClarificationCanonicalKey(question: string): string {
  const key = projectBoardQuestionDedupeKey(question);
  if (key) return key;
  return question
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

export function projectBoardClarificationDecisionId(question: string): string {
  const key = projectBoardClarificationCanonicalKey(question);
  const fullSlug = key.replace(/[^a-z0-9+#]+/g, "-").replace(/^-+|-+$/g, "");
  const slug = fullSlug.slice(0, 80);
  // Non-Latin questions slug to nothing and long questions truncate at 80 chars, so
  // distinct questions would otherwise share one id (and cross-attach suggestions and
  // answers). Append a stable content hash whenever the slug alone cannot distinguish
  // the question; plain English-length slugs keep their existing ids.
  if (slug.length >= 8 && fullSlug.length <= 80) {
    return `clarification:${slug}`;
  }
  const hash = stableClarificationQuestionHash(question);
  return `clarification:${slug ? `${slug}-${hash}` : `question-${hash}`}`;
}

function stableClarificationQuestionHash(question: string): string {
  const text = question.trim().toLowerCase().replace(/\s+/g, " ");
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function projectBoardClarificationDecisions(
  input: ProjectBoardClarificationDecisionInput,
): ProjectBoardClarificationDecision[] {
  const limit = input.limit ?? 20;
  const decisions: ProjectBoardClarificationDecision[] = [];
  const persistedDecisions = normalizeClarificationDecisions(input.clarificationDecisions);
  for (const decision of persistedDecisions) {
    pushDecision(decisions, decision);
  }
  const hasPersistedDecisions = persistedDecisions.length > 0;
  const answers = normalizeClarificationAnswers(input.clarificationAnswers);
  const suggestions = normalizeClarificationSuggestions(input.clarificationSuggestions);

  for (const answer of answers) {
    upsertAnsweredDecision(decisions, {
      id: projectBoardClarificationDecisionId(answer.question),
      question: answer.question,
      canonicalKey: projectBoardClarificationCanonicalKey(answer.question),
      source: "answer_history",
      state: "answered",
      answer: answer.answer,
      answeredAt: answer.answeredAt,
    });
  }

  for (const question of normalizeStringList(input.clarificationQuestions ?? [], limit * 2)) {
    pushQuestionDecision(decisions, question, "card", limit, suggestions, { preservePersistedDuplicates: hasPersistedDecisions });
  }

  if (input.includeInlineQuestions !== false) {
    const descriptionQuestions = projectBoardExplicitClarificationQuestions([stripAppendedClarificationHistory(input.description ?? "")]);
    for (const question of normalizeStringList(descriptionQuestions, limit * 2)) {
      pushQuestionDecision(decisions, question, "description", limit, suggestions, { preservePersistedDuplicates: hasPersistedDecisions });
    }
    const criteriaQuestions = projectBoardExplicitClarificationQuestions(input.acceptanceCriteria ?? []);
    for (const question of normalizeStringList(criteriaQuestions, limit * 2)) {
      pushQuestionDecision(decisions, question, "acceptance_criteria", limit, suggestions, { preservePersistedDuplicates: hasPersistedDecisions });
    }
  }

  return decisions.slice(0, limit);
}

export function projectBoardStructuredClarificationDecisions(
  input: ProjectBoardClarificationDecisionInput & { createdAt?: string; updatedAt?: string },
): ProjectBoardCardClarificationDecision[] {
  const createdAt = input.createdAt?.trim() || undefined;
  const updatedAt = input.updatedAt?.trim() || createdAt;
  return projectBoardClarificationDecisions(input).map((decision) => ({
    ...decision,
    ...(createdAt && !decision.createdAt ? { createdAt } : {}),
    ...(updatedAt && !decision.updatedAt ? { updatedAt } : {}),
  }));
}

export function projectBoardOpenClarificationQuestions(input: ProjectBoardClarificationDecisionInput): string[] {
  return projectBoardClarificationDecisions(input)
    .filter((decision) => decision.state === "open")
    .map((decision) => decision.question);
}

export function stripAppendedClarificationHistory(text: string): string {
  if (!text.trim()) return text;
  const lines = text.split(/\r?\n/g);
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^##\s+Clarifications\s*$/i.test(line.trim())) {
      skipping = true;
      continue;
    }
    if (skipping && /^##\s+\S/.test(line.trim())) {
      skipping = false;
    }
    if (!skipping) kept.push(line);
  }
  return kept.join("\n").trim();
}

export function projectBoardExplicitClarificationQuestions(values: string[]): string[] {
  const questions: string[] = [];
  for (const value of values) {
    // The separator is a lookbehind so one question's closing "?" still counts as the
    // next question's separator; consuming it would drop consecutive questions. A "?"
    // only separates or terminates when followed by whitespace/end of text, so URL query
    // strings (GET /api/reviews?bookId=) and optional-field markers (color?) stay inert.
    for (const match of value.matchAll(/(?<=^|\n|[.!?]\s)\s*([^?\n]{8,220}\?)(?=\s|$)/g)) {
      const question = match[1]?.replace(/\s+/g, " ").trim();
      if (question) questions.push(question);
    }
  }
  return [...new Set(questions)];
}

function normalizeClarificationAnswers(
  answers: ProjectBoardCardClarificationAnswer[] | undefined,
): ProjectBoardCardClarificationAnswer[] {
  const normalized: ProjectBoardCardClarificationAnswer[] = [];
  for (const answer of answers ?? []) {
    const question = answer.question.trim();
    const text = answer.answer.trim();
    const answeredAt = answer.answeredAt.trim();
    if (!question || !text) continue;
    const existing = normalized.find((item) => projectBoardQuestionsAreNearDuplicates(item.question, question));
    if (existing) {
      existing.answer = text;
      existing.answeredAt = answeredAt;
      continue;
    }
    normalized.push({ question, answer: text, answeredAt });
  }
  return normalized;
}

function normalizeClarificationDecisions(
  decisions: ProjectBoardCardClarificationDecision[] | undefined,
): ProjectBoardCardClarificationDecision[] {
  const normalized: ProjectBoardCardClarificationDecision[] = [];
  const remappedDecisionIds = new Map<string, string>();
  for (const decision of decisions ?? []) {
    if (!decision) continue;
    const question = decision.question?.trim().slice(0, 500) ?? "";
    if (!question) continue;
    const state = normalizeDecisionState(decision.state);
    const source = normalizeDecisionSource(decision.source);
    const answer = decision.answer?.trim().slice(0, 1500) || undefined;
    const answeredAt = decision.answeredAt?.trim().slice(0, 80) || undefined;
    const suggestedAnswer = decision.suggestedAnswer?.trim().slice(0, 1500) || undefined;
    const rationale = decision.rationale?.trim().slice(0, 1000) || undefined;
    const questionKind = normalizeQuestionKind(decision.questionKind);
    const rawId = decision.id?.trim().slice(0, 140) || undefined;
    const id = normalizeClarificationDecisionId(rawId, question, {
      duplicateSuffix: state === "duplicate" ? stableClarificationQuestionHash(question) : undefined,
    });
    if (rawId && rawId !== id) remappedDecisionIds.set(rawId, id);
    const normalizedDecision: ProjectBoardCardClarificationDecision = {
      id,
      question,
      canonicalKey: decision.canonicalKey?.trim().slice(0, 180) || projectBoardClarificationCanonicalKey(question),
      source,
      state,
      duplicateOf: decision.duplicateOf?.trim().slice(0, 140) || undefined,
      ...(answer ? { answer } : {}),
      ...(answeredAt ? { answeredAt } : {}),
      ...(suggestedAnswer ? { suggestedAnswer } : {}),
      ...(rationale ? { rationale } : {}),
      ...(decision.confidence === "high" || decision.confidence === "medium" || decision.confidence === "low" ? { confidence: decision.confidence } : {}),
      safeToAccept: Boolean(decision.safeToAccept) && questionKind === "expert_default",
      ...(questionKind ? { questionKind } : {}),
      createdAt: decision.createdAt?.trim().slice(0, 80) || undefined,
      updatedAt: decision.updatedAt?.trim().slice(0, 80) || undefined,
    };
    if (normalizedDecision.state === "answered" && (!normalizedDecision.answer || !normalizedDecision.answeredAt)) {
      normalizedDecision.state = "open";
      delete normalizedDecision.answer;
      delete normalizedDecision.answeredAt;
    }
    const index = normalized.findIndex((item) => projectBoardQuestionsAreNearDuplicates(item.question, question));
    if (index >= 0 && normalizedDecision.state !== "duplicate") {
      const existing = normalized[index];
      const merged = mergeNearDuplicateClarificationDecisions(existing, normalizedDecision);
      normalized[index] = merged;
      if (existing.id !== merged.id) remappedDecisionIds.set(existing.id, merged.id);
      if (normalizedDecision.id !== merged.id) remappedDecisionIds.set(normalizedDecision.id, merged.id);
      if (rawId && rawId !== merged.id) remappedDecisionIds.set(rawId, merged.id);
    } else {
      normalized.push(normalizedDecision);
    }
  }
  for (const decision of normalized) {
    if (decision.duplicateOf) decision.duplicateOf = remappedDecisionIds.get(decision.duplicateOf) ?? decision.duplicateOf;
  }
  return normalized;
}

const CLARIFICATION_DECISION_STATE_STRENGTH: Record<ProjectBoardCardClarificationDecisionState, number> = {
  answered: 3,
  dismissed: 2,
  open: 1,
  duplicate: 0,
};

function mergeNearDuplicateClarificationDecisions(
  existing: ProjectBoardCardClarificationDecision,
  incoming: ProjectBoardCardClarificationDecision,
): ProjectBoardCardClarificationDecision {
  // Keep the record with the strongest state (answered > dismissed > open) so a
  // regenerated open variant can never erase a recorded answer; on equal strength the
  // later record wins, preserving the previous refresh semantics.
  const primary =
    CLARIFICATION_DECISION_STATE_STRENGTH[incoming.state] >= CLARIFICATION_DECISION_STATE_STRENGTH[existing.state]
      ? incoming
      : existing;
  const secondary = primary === incoming ? existing : incoming;
  const answerSource = primary.answer && primary.answeredAt ? primary : secondary;
  const suggestionSource = primary.suggestedAnswer ? primary : secondary;
  return {
    ...primary,
    ...(answerSource.answer ? { answer: answerSource.answer } : {}),
    ...(answerSource.answeredAt ? { answeredAt: answerSource.answeredAt } : {}),
    ...(suggestionSource.suggestedAnswer ? { suggestedAnswer: suggestionSource.suggestedAnswer } : {}),
    ...(suggestionSource.rationale ? { rationale: suggestionSource.rationale } : {}),
    ...(suggestionSource.confidence ? { confidence: suggestionSource.confidence } : {}),
    safeToAccept: suggestionSource.safeToAccept,
    ...(suggestionSource.questionKind ? { questionKind: suggestionSource.questionKind } : {}),
    createdAt: primary.createdAt ?? secondary.createdAt,
    updatedAt: primary.updatedAt ?? secondary.updatedAt,
  };
}

function normalizeClarificationDecisionId(
  id: string | undefined,
  question: string,
  options: { duplicateSuffix?: string } = {},
): string {
  if (!id || projectBoardClarificationDecisionIdLooksLegacyPositional(id)) {
    const canonicalId = projectBoardClarificationDecisionId(question);
    if (options.duplicateSuffix) return `${canonicalId}:duplicate:${options.duplicateSuffix}`;
    return canonicalId;
  }
  return id;
}

function projectBoardClarificationDecisionIdLooksLegacyPositional(id: string): boolean {
  const normalized = id.trim().toLowerCase();
  return (
    /^(?:q|question|decision|clarification)[-_:]?\d+$/.test(normalized) ||
    /^clarification[-_:](?:q|question|decision)[-_:]?\d+$/.test(normalized)
  );
}

function normalizeDecisionState(state: ProjectBoardCardClarificationDecisionState | undefined): ProjectBoardCardClarificationDecisionState {
  return state === "answered" || state === "duplicate" || state === "dismissed" || state === "open" ? state : "open";
}

function normalizeDecisionSource(source: ProjectBoardCardClarificationDecisionSource | undefined): ProjectBoardCardClarificationDecisionSource {
  return source === "description" || source === "acceptance_criteria" || source === "answer_history" || source === "card" ? source : "card";
}

function normalizeQuestionKind(kind: ProjectBoardClarificationQuestionKind | undefined): ProjectBoardClarificationQuestionKind | undefined {
  return kind === "expert_default" || kind === "user_preference" || kind === "external_constraint" ? kind : undefined;
}

function normalizeClarificationSuggestions(
  suggestions: ProjectBoardCardClarificationSuggestion[] | undefined,
): ProjectBoardCardClarificationSuggestion[] {
  const normalized: ProjectBoardCardClarificationSuggestion[] = [];
  for (const suggestion of suggestions ?? []) {
    const question = suggestion.question.trim();
    const suggestedAnswer = suggestion.suggestedAnswer.trim();
    const rationale = suggestion.rationale.trim();
    if (!question || !suggestedAnswer) continue;
    const replacement: ProjectBoardCardClarificationSuggestion = {
      question,
      suggestedAnswer,
      rationale,
      confidence: suggestion.confidence,
      safeToAccept: suggestion.safeToAccept,
      questionKind: suggestion.questionKind,
    };
    const index = normalized.findIndex((item) => projectBoardQuestionsAreNearDuplicates(item.question, question));
    if (index >= 0) normalized[index] = replacement;
    else normalized.push(replacement);
  }
  return normalized;
}

function normalizeStringList(values: string[], limit: number): string[] {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function pushQuestionDecision(
  decisions: ProjectBoardClarificationDecision[],
  question: string,
  source: ProjectBoardClarificationDecisionSource,
  limit: number,
  suggestions: ProjectBoardCardClarificationSuggestion[],
  options: { preservePersistedDuplicates?: boolean } = {},
): void {
  if (decisions.length >= limit) return;
  const normalized = question.trim();
  if (!normalized) return;
  const duplicate = decisions.find((decision) => decision.state !== "duplicate" && projectBoardQuestionsAreNearDuplicates(decision.question, normalized));
  if (duplicate) {
    if (options.preservePersistedDuplicates && sameClarificationQuestionText(duplicate.question, normalized)) return;
    pushDuplicateDecision(decisions, normalized, source, duplicate);
    return;
  }
  pushDecision(decisions, {
    id: projectBoardClarificationDecisionId(normalized),
    question: normalized,
    canonicalKey: projectBoardClarificationCanonicalKey(normalized),
    source,
    state: "open",
    ...suggestionFieldsForQuestion(normalized, suggestions),
  });
}

function pushDuplicateDecision(
  decisions: ProjectBoardClarificationDecision[],
  question: string,
  source: ProjectBoardClarificationDecisionSource,
  duplicate: ProjectBoardClarificationDecision,
): void {
  const existingDuplicate = decisions.find(
    (decision) =>
      decision.state === "duplicate" &&
      decision.duplicateOf === duplicate.id &&
      sameClarificationQuestionText(decision.question, question),
  );
  if (existingDuplicate) return;
  pushDecision(decisions, {
    // Content-hashed suffix: a positional ordinal shifts whenever the list
    // composition changes, leaving duplicateOf pointers dangling across recomputes.
    id: `${projectBoardClarificationDecisionId(question)}:duplicate:${stableClarificationQuestionHash(question)}`,
    question,
    canonicalKey: projectBoardClarificationCanonicalKey(question),
    source,
    state: "duplicate",
    duplicateOf: duplicate.id,
    answer: duplicate.answer,
    answeredAt: duplicate.answeredAt,
  });
}

function sameClarificationQuestionText(left: string, right: string): boolean {
  return normalizeClarificationQuestionText(left) === normalizeClarificationQuestionText(right);
}

function normalizeClarificationQuestionText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function suggestionFieldsForQuestion(
  question: string,
  suggestions: ProjectBoardCardClarificationSuggestion[],
): Pick<ProjectBoardClarificationDecision, "suggestedAnswer" | "rationale" | "confidence" | "safeToAccept" | "questionKind"> {
  const suggestion = suggestions.find((item) => projectBoardQuestionsAreNearDuplicates(item.question, question));
  if (!suggestion) return {};
  return {
    suggestedAnswer: suggestion.suggestedAnswer,
    rationale: suggestion.rationale,
    confidence: suggestion.confidence,
    safeToAccept: suggestion.safeToAccept,
    questionKind: suggestion.questionKind,
  };
}

function upsertAnsweredDecision(
  decisions: ProjectBoardClarificationDecision[],
  decision: ProjectBoardClarificationDecision,
): void {
  // Prefer the primary record: answering a duplicate-state row would leave the
  // primary open and the gate unanswered despite the recorded answer.
  const matches = decisions.filter((item) => projectBoardQuestionsAreNearDuplicates(item.question, decision.question));
  const existing = matches.find((item) => item.state !== "duplicate") ?? matches[0];
  if (!existing) {
    decisions.push(decision);
    return;
  }
  existing.state = "answered";
  existing.answer = decision.answer;
  existing.answeredAt = decision.answeredAt;
  existing.canonicalKey = decision.canonicalKey;
  existing.id = existing.id || decision.id;
  existing.updatedAt = decision.answeredAt ?? existing.updatedAt;
}

function pushDecision(
  decisions: ProjectBoardClarificationDecision[],
  decision: ProjectBoardClarificationDecision,
): void {
  if (decision.state === "duplicate") {
    decisions.push(decision);
    return;
  }
  const existing = decisions.find((item) => projectBoardQuestionsAreNearDuplicates(item.question, decision.question));
  if (!existing) decisions.push(decision);
}
