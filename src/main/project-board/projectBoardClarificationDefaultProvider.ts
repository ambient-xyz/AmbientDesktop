import { parseProjectBoardLlmJson } from "./projectBoardLlmJson";
import { normalizeAmbientModelId } from "../../shared/ambientModels";
import { projectBoardClarificationDecisions } from "../../shared/projectBoardClarificationDecisions";
import { projectBoardQuestionDedupeKey, projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import type {
  ProjectBoardCard,
  ProjectBoardCharter,
  ProjectBoardClarificationQuestionKind,
} from "../../shared/types";
import { AmbientStreamFailureError, type AmbientRetryPolicy } from "../aggressiveRetries";
import { callAmbientChatCompletionTextWithRetries, isAmbientChatCompletionValidationError } from "../ambientChatCompletionRetry";
import { readAmbientApiKey } from "../credentialStore";

export type ProjectBoardClarificationDefaultConfidence = "high" | "medium" | "low";

export interface ProjectBoardClarificationDefaultTarget {
  cardId: string;
  cardTitle: string;
  cardStatus: ProjectBoardCard["status"];
  candidateStatus: ProjectBoardCard["candidateStatus"];
  decisionId: string;
  canonicalKey: string;
  question: string;
  phase?: string;
  labels: string[];
  description: string;
  acceptanceCriteria: string[];
  sourceRefs: string[];
}

export interface ProjectBoardClarificationDefaultAnsweredDecision {
  cardId: string;
  cardTitle: string;
  decisionId: string;
  question: string;
  answer: string;
}

export interface ProjectBoardClarificationDefaultSuggestion {
  cardId: string;
  decisionId: string;
  canonicalKey?: string;
  question: string;
  suggestedAnswer: string;
  rationale: string;
  confidence: ProjectBoardClarificationDefaultConfidence;
  safeToAccept: boolean;
  questionKind: ProjectBoardClarificationQuestionKind;
}

export interface AmbientProjectBoardClarificationDefaultTelemetry {
  promptCharCount: number;
  responseCharCount: number;
  requestDurationMs: number;
}

export interface AmbientProjectBoardClarificationDefaultResult {
  suggestions: ProjectBoardClarificationDefaultSuggestion[];
  telemetry: AmbientProjectBoardClarificationDefaultTelemetry;
}

export interface AmbientProjectBoardClarificationDefaultProgress {
  responseCharCount: number;
  requestDurationMs: number;
  transientRetry?: boolean;
  retryAttempt?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  retryError?: string;
  aggressiveRetries?: boolean;
  fallbackToNonStream?: boolean;
}

export interface ProjectBoardClarificationDefaultContext {
  boardTitle?: string;
  charter?: ProjectBoardCharter;
  targets: ProjectBoardClarificationDefaultTarget[];
  onProgress?: (progress: AmbientProjectBoardClarificationDefaultProgress) => void;
}

export class AmbientProjectBoardClarificationDefaultProvider {
  constructor(
    private readonly input: {
      model: string;
      apiKey?: string;
      baseUrl?: string;
      fetchImpl?: typeof fetch;
      preStreamResponseTimeoutMs?: number;
      streamIdleTimeoutMs?: number;
      streamContentIdleTimeoutMs?: number;
      retryPolicy?: AmbientRetryPolicy;
      waitForRetry?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
    },
  ) {}

  async suggest(input: ProjectBoardClarificationDefaultContext): Promise<AmbientProjectBoardClarificationDefaultResult> {
    const apiKey = (this.input.apiKey ?? readAmbientApiKey() ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const prompt = buildProjectBoardClarificationDefaultPrompt(input);
    const requestStartedAt = Date.now();
    const requestBody = {
      model: normalizeAmbientModelId(this.input.model),
      messages: [
        {
          role: "system",
          content:
            "You are Ambient/Pi acting as an expert UX designer and senior software architect. Suggest PM-reviewable default answers for project-board clarification questions. Return one JSON object only. Do not use markdown.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 3_000,
      response_format: { type: "json_object" },
      stream: true,
    };
    let responseText: string;
    try {
      responseText = await callAmbientChatCompletionTextWithRetries({
        apiKey,
        baseUrl: this.input.baseUrl,
        fetchImpl: this.input.fetchImpl,
        label: "Ambient project-board clarification default suggestion",
        requestBody,
        retryPolicy: this.input.retryPolicy,
        waitForRetry: this.input.waitForRetry,
        retryPartialStreamFailures: true,
        nonStreamFallback: { enabled: true, afterStreamFailureCount: 2 },
        preStreamResponseTimeoutMs: this.input.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: this.input.streamContentIdleTimeoutMs,
        validateResponseText: validateProjectBoardClarificationDefaultResponseText,
        onResponseChars: (responseCharCount) =>
          input.onProgress?.({ responseCharCount, requestDurationMs: Date.now() - requestStartedAt }),
        onRetry: (event) =>
          input.onProgress?.({
            responseCharCount: event.responseCharCount,
            requestDurationMs: Date.now() - requestStartedAt,
            transientRetry: true,
            retryAttempt: event.retryAttempt,
            maxRetries: event.maxRetries,
            retryDelayMs: event.delayMs,
            retryError: event.error,
            aggressiveRetries: Boolean(this.input.retryPolicy?.enabled),
            fallbackToNonStream: event.fallbackToNonStream,
          }),
      });
    } catch (error) {
      if (!shouldRetryClarificationDefaultsWithoutStreaming(error)) throw error;
      responseText = await callAmbientChatCompletionTextWithRetries({
        apiKey,
        baseUrl: this.input.baseUrl,
        fetchImpl: this.input.fetchImpl,
        label: "Ambient project-board clarification default suggestion non-stream fallback",
        requestBody: { ...requestBody, stream: false },
        retryPolicy: this.input.retryPolicy,
        waitForRetry: this.input.waitForRetry,
        retryPartialStreamFailures: false,
        preStreamResponseTimeoutMs: this.input.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: this.input.streamContentIdleTimeoutMs,
        validateResponseText: validateProjectBoardClarificationDefaultResponseText,
        onResponseChars: (responseCharCount) =>
          input.onProgress?.({ responseCharCount, requestDurationMs: Date.now() - requestStartedAt }),
        onRetry: (event) =>
          input.onProgress?.({
            responseCharCount: event.responseCharCount,
            requestDurationMs: Date.now() - requestStartedAt,
            transientRetry: true,
            retryAttempt: event.retryAttempt,
            maxRetries: event.maxRetries,
            retryDelayMs: event.delayMs,
            retryError: event.error,
            aggressiveRetries: Boolean(this.input.retryPolicy?.enabled),
            fallbackToNonStream: event.fallbackToNonStream,
          }),
      });
    }
    const requestDurationMs = Date.now() - requestStartedAt;
    return {
      suggestions: normalizeProjectBoardClarificationDefaultSuggestions(parseProjectBoardClarificationDefaultJson(responseText), input.targets),
      telemetry: {
        promptCharCount: prompt.length,
        responseCharCount: responseText.length,
        requestDurationMs,
      },
    };
  }
}

function shouldRetryClarificationDefaultsWithoutStreaming(error: unknown): boolean {
  return (
    (error instanceof AmbientStreamFailureError && error.kind === "stream_closed_before_done") ||
    isAmbientChatCompletionValidationError(error)
  );
}

function validateProjectBoardClarificationDefaultResponseText(text: string): void {
  parseProjectBoardClarificationDefaultJson(text);
}

export function projectBoardClarificationDefaultSuggestionTargets(
  cards: ProjectBoardCard[],
  options: { cardIds?: string[]; limit?: number } = {},
): ProjectBoardClarificationDefaultTarget[] {
  const cardIdSet = options.cardIds?.length ? new Set(options.cardIds) : undefined;
  const limit = Math.max(1, Math.min(options.limit ?? 12, 50));
  const targets: ProjectBoardClarificationDefaultTarget[] = [];
  const answeredDecisions = projectBoardClarificationDefaultAnsweredDecisions(cards);
  for (const card of cards) {
    if (targets.length >= limit) break;
    if (card.status === "archived") continue;
    if (card.candidateStatus === "duplicate" || card.candidateStatus === "rejected" || card.candidateStatus === "evidence") continue;
    if (cardIdSet && !cardIdSet.has(card.id)) continue;
    const decisions = projectBoardClarificationDecisions({
      clarificationDecisions: card.clarificationDecisions,
      clarificationQuestions: card.clarificationQuestions,
      clarificationSuggestions: card.clarificationSuggestions,
      clarificationAnswers: card.clarificationAnswers,
      description: card.description,
      acceptanceCriteria: card.acceptanceCriteria,
      includeInlineQuestions: false,
    });
    for (const decision of decisions) {
      if (targets.length >= limit) break;
      if (decision.state !== "open") continue;
      if (decision.suggestedAnswer?.trim()) continue;
      const relatedAnsweredDecision = answeredDecisions.find(
        (answered) =>
          answered.cardId !== card.id &&
          projectBoardClarificationDefaultQuestionsShareDecisionTopic(answered.question, decision.question),
      );
      if (relatedAnsweredDecision) continue;
      targets.push({
        cardId: card.id,
        cardTitle: card.title,
        cardStatus: card.status,
        candidateStatus: card.candidateStatus,
        decisionId: decision.id,
        canonicalKey: decision.canonicalKey,
        question: decision.question,
        phase: card.phase,
        labels: card.labels,
        description: card.description,
        acceptanceCriteria: card.acceptanceCriteria,
        sourceRefs: card.sourceRefs ?? [],
      });
    }
  }
  return targets;
}

export function buildProjectBoardClarificationDefaultPrompt(input: ProjectBoardClarificationDefaultContext): string {
  const targets = input.targets.map((target) => ({
    cardId: target.cardId,
    decisionId: target.decisionId,
    canonicalKey: target.canonicalKey,
    cardTitle: target.cardTitle,
    cardStatus: target.cardStatus,
    candidateStatus: target.candidateStatus,
    question: target.question,
    phase: target.phase ?? "",
    labels: target.labels,
    description: truncate(target.description, 1_000),
    acceptanceCriteria: target.acceptanceCriteria.slice(0, 8),
    sourceRefs: target.sourceRefs.slice(0, 8),
  }));
  return [
    "Suggest default answers for existing project-board clarification questions that do not already have suggestions.",
    input.boardTitle ? `Board: ${input.boardTitle}` : "",
    "",
    "Role and policy:",
    "- Act as an expert UX designer and senior software architect across frontend, backend, systems, and product workflow design.",
    "- Suggest answers only from professional judgment and the card's local context.",
    "- Do not invent new product requirements or expand scope beyond the card.",
    "- Do not rewrite cards. This request only enriches decision metadata for PM review.",
    "- Mark safeToAccept true only when the answer is an expert implementation default that a PM can reasonably accept without personal preference.",
    "- If the question asks for user taste, business policy, external compliance, budget, or unknown stakeholder intent, set questionKind to user_preference or external_constraint and safeToAccept false.",
    "- Respect already-answered decisions. If a target overlaps an answered decision, reuse that answer; do not propose a conflicting default.",
    "- Prefer boring, cheap, testable defaults over decorative or speculative answers.",
    "",
    "Return exactly this JSON shape:",
    JSON.stringify(
      {
        suggestions: [
          {
            cardId: "card id from input",
            decisionId: "decision id from input",
            question: "same question text",
            suggestedAnswer: "Concise answer a PM can accept or edit.",
            rationale: "One short reason this default fits the card boundary.",
            confidence: "high | medium | low",
            safeToAccept: true,
            questionKind: "expert_default | user_preference | external_constraint",
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Board decision policy:",
    truncate(JSON.stringify(input.charter?.decisionPolicy ?? {}, null, 2), 1_200),
    "",
    "Targets:",
    JSON.stringify(targets, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}

export function projectBoardClarificationDefaultAnsweredDecisions(cards: ProjectBoardCard[]): ProjectBoardClarificationDefaultAnsweredDecision[] {
  const answered: ProjectBoardClarificationDefaultAnsweredDecision[] = [];
  for (const card of cards) {
    const decisions = projectBoardClarificationDecisions({
      clarificationDecisions: card.clarificationDecisions,
      clarificationQuestions: card.clarificationQuestions,
      clarificationSuggestions: card.clarificationSuggestions,
      clarificationAnswers: card.clarificationAnswers,
      description: card.description,
      acceptanceCriteria: card.acceptanceCriteria,
      includeInlineQuestions: false,
    });
    for (const decision of decisions) {
      const answer = decision.answer?.trim();
      if (decision.state !== "answered" || !answer) continue;
      answered.push({
        cardId: card.id,
        cardTitle: card.title,
        decisionId: decision.id,
        question: decision.question,
        answer,
      });
    }
  }
  return answered;
}

export function projectBoardClarificationDefaultQuestionsShareDecisionTopic(left: string, right: string): boolean {
  if (projectBoardQuestionsAreNearDuplicates(left, right)) return true;
  const leftTokens = new Set(projectBoardQuestionDedupeKey(left).split(" ").filter(projectBoardClarificationDefaultUsefulDecisionToken));
  const rightTokens = new Set(projectBoardQuestionDedupeKey(right).split(" ").filter(projectBoardClarificationDefaultUsefulDecisionToken));
  const shorter = Math.min(leftTokens.size, rightTokens.size);
  if (shorter < 4) return false;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  const dice = (2 * overlap) / (leftTokens.size + rightTokens.size);
  return overlap >= 5 && dice >= 0.36;
}

function projectBoardClarificationDefaultUsefulDecisionToken(token: string): boolean {
  return Boolean(token) && !PROJECT_BOARD_CLARIFICATION_DEFAULT_TOPIC_STOP_WORDS.has(token);
}

const PROJECT_BOARD_CLARIFICATION_DEFAULT_TOPIC_STOP_WORDS = new Set([
  "answer",
  "card",
  "charter",
  "decision",
  "default",
  "durable",
  "identified",
  "identifie",
  "plan",
  "project",
  "question",
  "scope",
  "specified",
  "unresolved",
]);

export function parseProjectBoardClarificationDefaultJson(text: string): unknown {
  return parseProjectBoardLlmJson(text, "Ambient project-board clarification defaults");
}

export function normalizeProjectBoardClarificationDefaultSuggestions(
  value: unknown,
  targets: ProjectBoardClarificationDefaultTarget[],
): ProjectBoardClarificationDefaultSuggestion[] {
  const records =
    value && typeof value === "object" && Array.isArray((value as { suggestions?: unknown[] }).suggestions)
      ? (value as { suggestions: unknown[] }).suggestions
      : [];
  const byTarget = new Map<string, unknown>();
  const byQuestion = new Map<string, unknown>();
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const cardId = stringValue((record as { cardId?: unknown }).cardId);
    const decisionId = stringValue((record as { decisionId?: unknown }).decisionId);
    const question = stringValue((record as { question?: unknown }).question);
    if (cardId && decisionId) byTarget.set(`${cardId}:${decisionId}`, record);
    if (cardId && question) byQuestion.set(`${cardId}:${question.toLowerCase()}`, record);
  }
  return targets.map((target) => {
    const direct = byTarget.get(`${target.cardId}:${target.decisionId}`);
    const nearQuestion = direct
      ? undefined
      : [...byQuestion.entries()].find(([key]) => key.startsWith(`${target.cardId}:`) && projectBoardQuestionsAreNearDuplicates(key.slice(target.cardId.length + 1), target.question))?.[1];
    return normalizeProjectBoardClarificationDefaultSuggestion(target, direct ?? nearQuestion);
  });
}

export function deterministicProjectBoardClarificationDefaultSuggestionForTarget(
  target: ProjectBoardClarificationDefaultTarget,
): ProjectBoardClarificationDefaultSuggestion {
  return {
    cardId: target.cardId,
    decisionId: target.decisionId,
    canonicalKey: target.canonicalKey,
    question: target.question,
    suggestedAnswer:
      "Use the simplest implementation default consistent with this card's acceptance criteria, and avoid expanding scope beyond this card.",
    rationale: "Ambient/Pi was unavailable, so this low-confidence fallback keeps the decision visible for PM review without rewriting the card.",
    confidence: "low",
    safeToAccept: false,
    questionKind: "user_preference",
  };
}

function normalizeProjectBoardClarificationDefaultSuggestion(
  target: ProjectBoardClarificationDefaultTarget,
  value: unknown,
): ProjectBoardClarificationDefaultSuggestion {
  const fallback = deterministicProjectBoardClarificationDefaultSuggestionForTarget(target);
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  const suggestedAnswer = stringValue(record.suggestedAnswer).slice(0, 1500);
  if (!suggestedAnswer) return fallback;
  const rationale = stringValue(record.rationale).slice(0, 1000) || "Expert suggested answer from Ambient planning.";
  const confidence =
    record.confidence === "high" || record.confidence === "medium" || record.confidence === "low"
      ? record.confidence
      : fallback.confidence;
  const questionKind =
    record.questionKind === "expert_default" || record.questionKind === "user_preference" || record.questionKind === "external_constraint"
      ? record.questionKind
      : fallback.questionKind;
  return {
    cardId: target.cardId,
    decisionId: target.decisionId,
    canonicalKey: target.canonicalKey,
    question: target.question,
    suggestedAnswer,
    rationale,
    confidence,
    safeToAccept: Boolean(record.safeToAccept) && questionKind === "expert_default",
    questionKind,
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(value: string, limit: number): string {
  const normalized = value.trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 3)}...` : normalized;
}
