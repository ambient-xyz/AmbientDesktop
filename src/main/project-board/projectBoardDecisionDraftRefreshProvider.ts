import { parseProjectBoardLlmJson } from "./projectBoardLlmJson";
import { normalizeAmbientModelId } from "../../shared/ambientModels";
import { projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import type {
  ProjectBoardCard,
  ProjectBoardCardTestPlan,
  ProjectBoardCharter,
  ProjectBoardDecisionDraftRefreshConfidence,
  ProjectBoardDecisionDraftRefreshSuggestion,
} from "../../shared/types";
import { AmbientStreamFailureError, type AmbientRetryPolicy } from "../aggressiveRetries";
import { callAmbientChatCompletionTextWithRetries, isAmbientChatCompletionValidationError } from "../ambientChatCompletionRetry";
import { readAmbientApiKey } from "../credentialStore";

export interface AmbientProjectBoardDecisionDraftRefreshTelemetry {
  promptCharCount: number;
  responseCharCount: number;
  requestDurationMs: number;
}

export interface AmbientProjectBoardDecisionDraftRefreshResult {
  suggestions: ProjectBoardDecisionDraftRefreshSuggestion[];
  telemetry: AmbientProjectBoardDecisionDraftRefreshTelemetry;
}

export interface AmbientProjectBoardDecisionDraftRefreshProgress {
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

export interface ProjectBoardDecisionDraftRefreshContext {
  boardTitle?: string;
  charter?: ProjectBoardCharter;
  question: string;
  answer: string;
  cards: ProjectBoardCard[];
  onProgress?: (progress: AmbientProjectBoardDecisionDraftRefreshProgress) => void;
}

export class AmbientProjectBoardDecisionDraftRefreshProvider {
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

  async refresh(input: ProjectBoardDecisionDraftRefreshContext): Promise<AmbientProjectBoardDecisionDraftRefreshResult> {
    const apiKey = (this.input.apiKey ?? readAmbientApiKey() ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const prompt = buildProjectBoardDecisionDraftRefreshPrompt(input);
    const requestStartedAt = Date.now();
    const requestBody = {
      model: normalizeAmbientModelId(this.input.model),
      messages: [
        {
          role: "system",
          content:
            "You are Ambient/Pi acting as a senior product-minded architect. Rewrite only affected draft card spec fields after a PM clarification decision. Return one JSON object only. Do not use markdown.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 4_000,
      response_format: { type: "json_object" },
      stream: true,
    };
    const progress = (responseCharCount: number) =>
      input.onProgress?.({ responseCharCount, requestDurationMs: Date.now() - requestStartedAt });
    const retryProgress = (event: {
      responseCharCount: number;
      retryAttempt: number;
      maxRetries: number;
      delayMs: number;
      error: string;
      fallbackToNonStream?: boolean;
    }) =>
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
      });
    let responseText: string;
    try {
      responseText = await callAmbientChatCompletionTextWithRetries({
        apiKey,
        baseUrl: this.input.baseUrl,
        fetchImpl: this.input.fetchImpl,
        label: "Ambient project-board decision draft refresh",
        requestBody,
        retryPolicy: this.input.retryPolicy,
        waitForRetry: this.input.waitForRetry,
        retryPartialStreamFailures: true,
        nonStreamFallback: { enabled: true, afterStreamFailureCount: 2 },
        preStreamResponseTimeoutMs: this.input.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: this.input.streamContentIdleTimeoutMs,
        validateResponseText: validateProjectBoardDecisionDraftRefreshResponseText,
        onResponseChars: progress,
        onRetry: retryProgress,
      });
    } catch (error) {
      if (!shouldRetryDecisionDraftRefreshWithoutStreaming(error)) throw error;
      responseText = await callAmbientChatCompletionTextWithRetries({
        apiKey,
        baseUrl: this.input.baseUrl,
        fetchImpl: this.input.fetchImpl,
        label: "Ambient project-board decision draft refresh non-stream fallback",
        requestBody: { ...requestBody, stream: false },
        retryPolicy: this.input.retryPolicy,
        waitForRetry: this.input.waitForRetry,
        retryPartialStreamFailures: false,
        preStreamResponseTimeoutMs: this.input.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: this.input.streamContentIdleTimeoutMs,
        validateResponseText: validateProjectBoardDecisionDraftRefreshResponseText,
        onResponseChars: progress,
        onRetry: retryProgress,
      });
    }
    const requestDurationMs = Date.now() - requestStartedAt;
    return {
      suggestions: normalizeProjectBoardDecisionDraftRefreshSuggestions(parseProjectBoardDecisionDraftRefreshJson(responseText), input),
      telemetry: {
        promptCharCount: prompt.length,
        responseCharCount: responseText.length,
        requestDurationMs,
      },
    };
  }
}

function shouldRetryDecisionDraftRefreshWithoutStreaming(error: unknown): boolean {
  return (
    (error instanceof AmbientStreamFailureError && error.kind === "stream_closed_before_done" && !error.toolCallSeen) ||
    isAmbientChatCompletionValidationError(error)
  );
}

function validateProjectBoardDecisionDraftRefreshResponseText(text: string): void {
  parseProjectBoardDecisionDraftRefreshJson(text);
}

export function buildProjectBoardDecisionDraftRefreshPrompt(input: ProjectBoardDecisionDraftRefreshContext): string {
  const cards = input.cards.map((card) => ({
    cardId: card.id,
    title: card.title,
    status: card.status,
    candidateStatus: card.candidateStatus,
    phase: card.phase ?? "",
    labels: card.labels,
    blockedBy: card.blockedBy,
    sourceRefs: card.sourceRefs ?? [],
    description: truncate(card.description, 1_500),
    acceptanceCriteria: card.acceptanceCriteria.slice(0, 12),
    testPlan: card.testPlan,
    clarificationQuestions: card.clarificationQuestions ?? [],
    clarificationAnswers: card.clarificationAnswers ?? [],
  }));
  return [
    "Refresh affected Draft Inbox cards after a PM clarification decision.",
    input.boardTitle ? `Board: ${input.boardTitle}` : "",
    "",
    "PM decision:",
    `Question: ${input.question.trim()}`,
    `Answer: ${input.answer.trim()}`,
    "",
    "Return exactly this JSON shape:",
    JSON.stringify(
      {
        cards: [
          {
            cardId: "card id from input",
            description: "Updated self-contained draft card description.",
            labels: ["existing", "or-new-small-label"],
            acceptanceCriteria: ["Concrete criterion that reflects the decision."],
            testPlan: {
              unit: ["Unit proof if appropriate."],
              integration: ["Integration proof if appropriate."],
              visual: ["Visual proof if appropriate."],
              manual: ["Manual proof if appropriate."],
            },
            clarificationQuestions: ["Remaining open clarification questions only."],
            rationale: "One concise reason for the changed draft fields.",
            confidence: "high | medium | low",
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Rules:",
    "- Return one record for every input card id and no other card ids.",
    "- Rewrite only draft specification fields: description, labels, acceptanceCriteria, testPlan, and clarificationQuestions.",
    "- Do not change title, status, candidateStatus, priority, phase, dependencies, sourceRefs, or source authority.",
    "- Treat the PM answer as authoritative and integrate it into the draft card scope where it materially changes implementation behavior.",
    "- Remove the answered question and near-duplicate variants from clarificationQuestions. Keep unrelated open questions.",
    "- Do not add a new clarification question that asks the same thing in different words.",
    "- Preserve acceptance criteria and proof expectations unless the PM answer changes the behavior that must be proved.",
    "- Keep every card self-contained enough for an autonomous Local Task run.",
    "- Prefer small, targeted updates. This is a card-scoped refresh, not a full board resynthesis.",
    "- If the answer only clears a gate and does not change scope, preserve the spec and add a short clarification note in the description.",
    "",
    "Charter and proof policy:",
    truncate(JSON.stringify({
      qualityBar: input.charter?.qualityBar,
      decisionPolicy: input.charter?.decisionPolicy,
      testPolicy: input.charter?.testPolicy,
      sourcePolicy: input.charter?.sourcePolicy,
    }, null, 2), 1_500),
    "",
    "Cards:",
    JSON.stringify(cards, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseProjectBoardDecisionDraftRefreshJson(text: string): unknown {
  return parseProjectBoardLlmJson(text, "Ambient project-board decision draft refresh");
}

export function normalizeProjectBoardDecisionDraftRefreshSuggestions(
  value: unknown,
  input: Pick<ProjectBoardDecisionDraftRefreshContext, "cards" | "question" | "answer">,
): ProjectBoardDecisionDraftRefreshSuggestion[] {
  const records =
    value && typeof value === "object" && Array.isArray((value as { cards?: unknown[] }).cards)
      ? (value as { cards: unknown[] }).cards
      : [];
  const byId = new Map<string, unknown>();
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const cardId = (record as { cardId?: unknown }).cardId;
    if (typeof cardId === "string" && cardId.trim()) byId.set(cardId.trim(), record);
  }
  return input.cards.map((card) => normalizeProjectBoardDecisionDraftRefreshSuggestion(card, byId.get(card.id), input));
}

export function deterministicProjectBoardDecisionDraftRefreshSuggestionForCard(
  card: ProjectBoardCard,
  input: Pick<ProjectBoardDecisionDraftRefreshContext, "question" | "answer">,
): ProjectBoardDecisionDraftRefreshSuggestion {
  const question = input.question.trim();
  const answer = input.answer.trim();
  return {
    cardId: card.id,
    description: projectBoardDescriptionWithClarificationAnswer(card.description, question, answer).slice(0, 4000),
    labels: card.labels,
    acceptanceCriteria: card.acceptanceCriteria,
    testPlan: card.testPlan,
    clarificationQuestions: (card.clarificationQuestions ?? []).filter((candidate) => !projectBoardQuestionsAreNearDuplicates(candidate, question)),
    rationale: "The deterministic refresh records the PM answer and clears duplicate clarification gates without changing card scope.",
    confidence: "medium",
  };
}

function normalizeProjectBoardDecisionDraftRefreshSuggestion(
  card: ProjectBoardCard,
  value: unknown,
  input: Pick<ProjectBoardDecisionDraftRefreshContext, "question" | "answer">,
): ProjectBoardDecisionDraftRefreshSuggestion {
  const fallback = deterministicProjectBoardDecisionDraftRefreshSuggestionForCard(card, input);
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  const description = typeof record.description === "string" && record.description.trim()
    ? record.description.trim().slice(0, 4000)
    : fallback.description;
  const labels = stringList(record.labels, 20, 60);
  const acceptanceCriteria = stringList(record.acceptanceCriteria, 30, 500);
  const testPlan = normalizeProjectBoardDecisionDraftRefreshTestPlan(record.testPlan, card.testPlan);
  const clarificationQuestions = (
    Array.isArray(record.clarificationQuestions) ? stringList(record.clarificationQuestions, 8, 500) : fallback.clarificationQuestions ?? []
  ).filter((candidate) => !projectBoardQuestionsAreNearDuplicates(candidate, input.question));
  const confidence = normalizeProjectBoardDecisionDraftRefreshConfidence(record.confidence);
  return {
    cardId: card.id,
    description,
    labels: labels.length > 0 ? labels : card.labels,
    acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : card.acceptanceCriteria,
    testPlan,
    clarificationQuestions,
    rationale: typeof record.rationale === "string" && record.rationale.trim()
      ? record.rationale.trim().slice(0, 500)
      : fallback.rationale,
    confidence,
  };
}

function normalizeProjectBoardDecisionDraftRefreshTestPlan(value: unknown, fallback: ProjectBoardCardTestPlan): ProjectBoardCardTestPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  return {
    unit: Array.isArray(record.unit) ? stringList(record.unit, 20, 500) : fallback.unit,
    integration: Array.isArray(record.integration) ? stringList(record.integration, 20, 500) : fallback.integration,
    visual: Array.isArray(record.visual) ? stringList(record.visual, 20, 500) : fallback.visual,
    manual: Array.isArray(record.manual) ? stringList(record.manual, 20, 500) : fallback.manual,
  };
}

function normalizeProjectBoardDecisionDraftRefreshConfidence(value: unknown): ProjectBoardDecisionDraftRefreshConfidence {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "low";
}

function stringList(value: unknown, limit: number, itemLimit: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().replace(/\s+/g, " ").slice(0, itemLimit);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(trimmed);
    if (items.length >= limit) break;
  }
  return items;
}

function projectBoardClarificationAnswerSection(question: string, answer: string): string {
  return [`- Q: ${question.trim()}`, `  A: ${answer.trim()}`].join("\n");
}

function projectBoardDescriptionWithClarificationAnswer(description: string, question: string, answer: string): string {
  const trimmed = description.trim();
  const entry = projectBoardClarificationAnswerSection(question, answer);
  if (!trimmed) return `## Clarifications\n${entry}`;
  if (trimmed.includes(entry)) return trimmed;
  if (/^##\s+Clarifications\s*$/im.test(trimmed)) return `${trimmed}\n${entry}`;
  return `${trimmed}\n\n## Clarifications\n${entry}`;
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
}
