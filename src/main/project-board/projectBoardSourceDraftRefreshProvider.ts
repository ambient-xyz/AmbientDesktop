import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type {
  ProjectBoardCard,
  ProjectBoardCardTestPlan,
  ProjectBoardCharter,
  ProjectBoardSource,
  ProjectBoardSourceDraftRefreshConfidence,
  ProjectBoardSourceDraftRefreshSuggestion,
} from "../../shared/types";
import { AmbientStreamFailureError, type AmbientRetryPolicy } from "../aggressiveRetries";
import { callAmbientChatCompletionTextWithRetries, isAmbientChatCompletionValidationError } from "../ambientChatCompletionRetry";
import { readAmbientApiKey } from "../credentialStore";

export interface AmbientProjectBoardSourceDraftRefreshTelemetry {
  promptCharCount: number;
  responseCharCount: number;
  requestDurationMs: number;
}

export interface AmbientProjectBoardSourceDraftRefreshResult {
  suggestions: ProjectBoardSourceDraftRefreshSuggestion[];
  telemetry: AmbientProjectBoardSourceDraftRefreshTelemetry;
}

export interface AmbientProjectBoardSourceDraftRefreshProgress {
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

export interface ProjectBoardSourceDraftRefreshContext {
  boardTitle?: string;
  charter?: ProjectBoardCharter;
  sources: ProjectBoardSource[];
  sourceChangeSummary: string;
  cards: ProjectBoardCard[];
  onProgress?: (progress: AmbientProjectBoardSourceDraftRefreshProgress) => void;
}

export class AmbientProjectBoardSourceDraftRefreshProvider {
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

  async refresh(input: ProjectBoardSourceDraftRefreshContext): Promise<AmbientProjectBoardSourceDraftRefreshResult> {
    const apiKey = (this.input.apiKey ?? readAmbientApiKey() ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const prompt = buildProjectBoardSourceDraftRefreshPrompt(input);
    const requestStartedAt = Date.now();
    const requestBody = {
      model: normalizeAmbientModelId(this.input.model),
      messages: [
        {
          role: "system",
          content:
            "You are Ambient/Pi acting as a senior product-minded architect. Rewrite only affected draft card spec fields after source authority changes. Return one JSON object only. Do not use markdown.",
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
        label: "Ambient project-board source draft refresh",
        requestBody,
        retryPolicy: this.input.retryPolicy,
        waitForRetry: this.input.waitForRetry,
        retryPartialStreamFailures: true,
        nonStreamFallback: { enabled: true, afterStreamFailureCount: 2 },
        preStreamResponseTimeoutMs: this.input.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: this.input.streamContentIdleTimeoutMs,
        validateResponseText: validateProjectBoardSourceDraftRefreshResponseText,
        onResponseChars: progress,
        onRetry: retryProgress,
      });
    } catch (error) {
      if (!shouldRetrySourceDraftRefreshWithoutStreaming(error)) throw error;
      responseText = await callAmbientChatCompletionTextWithRetries({
        apiKey,
        baseUrl: this.input.baseUrl,
        fetchImpl: this.input.fetchImpl,
        label: "Ambient project-board source draft refresh non-stream fallback",
        requestBody: { ...requestBody, stream: false },
        retryPolicy: this.input.retryPolicy,
        waitForRetry: this.input.waitForRetry,
        retryPartialStreamFailures: false,
        preStreamResponseTimeoutMs: this.input.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: this.input.streamContentIdleTimeoutMs,
        validateResponseText: validateProjectBoardSourceDraftRefreshResponseText,
        onResponseChars: progress,
        onRetry: retryProgress,
      });
    }
    const requestDurationMs = Date.now() - requestStartedAt;
    return {
      suggestions: normalizeProjectBoardSourceDraftRefreshSuggestions(parseProjectBoardSourceDraftRefreshJson(responseText), input),
      telemetry: {
        promptCharCount: prompt.length,
        responseCharCount: responseText.length,
        requestDurationMs,
      },
    };
  }
}

function shouldRetrySourceDraftRefreshWithoutStreaming(error: unknown): boolean {
  return (
    (error instanceof AmbientStreamFailureError && error.kind === "stream_closed_before_done" && !error.toolCallSeen) ||
    isAmbientChatCompletionValidationError(error)
  );
}

function validateProjectBoardSourceDraftRefreshResponseText(text: string): void {
  parseProjectBoardSourceDraftRefreshJson(text);
}

export function buildProjectBoardSourceDraftRefreshPrompt(input: ProjectBoardSourceDraftRefreshContext): string {
  const sources = input.sources.slice(0, 12).map((source) => ({
    sourceId: source.id,
    kind: source.kind,
    title: source.title,
    authorityRole: source.authorityRole,
    includeInSynthesis: source.includeInSynthesis,
    path: source.path,
    threadId: source.threadId,
    summary: truncate(source.summary ?? "", 1_000),
    excerpt: truncate(source.excerpt ?? "", 1_500),
  }));
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
    "Refresh affected Draft Inbox cards after source authority or inclusion changed.",
    input.boardTitle ? `Board: ${input.boardTitle}` : "",
    "",
    "Source change summary:",
    input.sourceChangeSummary.trim(),
    "",
    "Return exactly this JSON shape:",
    JSON.stringify(
      {
        cards: [
          {
            cardId: "card id from input",
            description: "Updated self-contained draft card description.",
            labels: ["existing", "or-new-small-label"],
            acceptanceCriteria: ["Concrete criterion grounded in the changed source authority."],
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
    "- Treat primary durable-plan sources as authoritative over ignored chat sources unless the source summary says a chat was deliberately included.",
    "- If newly included source context materially changes implementation behavior, integrate only that delta into affected draft cards.",
    "- If a source was excluded or downgraded, remove reliance on it from the draft description and proof expectations without deleting unrelated card scope.",
    "- Preserve existing acceptance criteria and proof expectations unless the source change affects behavior that must be proved.",
    "- Keep every card self-contained enough for an autonomous Local Task run.",
    "- Prefer small, targeted updates. This is a card-scoped refresh, not a full board resynthesis.",
    "- If the source change only needs audit traceability, preserve the spec and add a short source-impact note in the description.",
    "",
    "Charter and source policy:",
    truncate(JSON.stringify({
      qualityBar: input.charter?.qualityBar,
      decisionPolicy: input.charter?.decisionPolicy,
      testPolicy: input.charter?.testPolicy,
      sourcePolicy: input.charter?.sourcePolicy,
    }, null, 2), 1_500),
    "",
    "Changed sources:",
    JSON.stringify(sources, null, 2),
    "",
    "Cards:",
    JSON.stringify(cards, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseProjectBoardSourceDraftRefreshJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const json = fenced ? fenced[1] : trimmed;
  return JSON.parse(json);
}

export function normalizeProjectBoardSourceDraftRefreshSuggestions(
  value: unknown,
  input: Pick<ProjectBoardSourceDraftRefreshContext, "cards" | "sourceChangeSummary">,
): ProjectBoardSourceDraftRefreshSuggestion[] {
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
  return input.cards.map((card) => normalizeProjectBoardSourceDraftRefreshSuggestion(card, byId.get(card.id), input));
}

export function deterministicProjectBoardSourceDraftRefreshSuggestionForCard(
  card: ProjectBoardCard,
  input: Pick<ProjectBoardSourceDraftRefreshContext, "sourceChangeSummary">,
): ProjectBoardSourceDraftRefreshSuggestion {
  return {
    cardId: card.id,
    description: projectBoardDescriptionWithSourceImpactRefresh(card.description, input.sourceChangeSummary).slice(0, 4000),
    labels: card.labels,
    acceptanceCriteria: card.acceptanceCriteria,
    testPlan: card.testPlan,
    clarificationQuestions: card.clarificationQuestions ?? [],
    rationale: "The deterministic refresh records the source authority change without changing card scope.",
    confidence: "medium",
  };
}

function normalizeProjectBoardSourceDraftRefreshSuggestion(
  card: ProjectBoardCard,
  value: unknown,
  input: Pick<ProjectBoardSourceDraftRefreshContext, "sourceChangeSummary">,
): ProjectBoardSourceDraftRefreshSuggestion {
  const fallback = deterministicProjectBoardSourceDraftRefreshSuggestionForCard(card, input);
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  const description = typeof record.description === "string" && record.description.trim()
    ? record.description.trim().slice(0, 4000)
    : fallback.description;
  const labels = stringList(record.labels, 20, 60);
  const acceptanceCriteria = stringList(record.acceptanceCriteria, 30, 500);
  const testPlan = normalizeProjectBoardSourceDraftRefreshTestPlan(record.testPlan, card.testPlan);
  const clarificationQuestions = Array.isArray(record.clarificationQuestions)
    ? stringList(record.clarificationQuestions, 8, 500)
    : fallback.clarificationQuestions ?? [];
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
    confidence: normalizeProjectBoardSourceDraftRefreshConfidence(record.confidence),
  };
}

function normalizeProjectBoardSourceDraftRefreshTestPlan(value: unknown, fallback: ProjectBoardCardTestPlan): ProjectBoardCardTestPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  return {
    unit: Array.isArray(record.unit) ? stringList(record.unit, 20, 500) : fallback.unit,
    integration: Array.isArray(record.integration) ? stringList(record.integration, 20, 500) : fallback.integration,
    visual: Array.isArray(record.visual) ? stringList(record.visual, 20, 500) : fallback.visual,
    manual: Array.isArray(record.manual) ? stringList(record.manual, 20, 500) : fallback.manual,
  };
}

function normalizeProjectBoardSourceDraftRefreshConfidence(value: unknown): ProjectBoardSourceDraftRefreshConfidence {
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

function projectBoardDescriptionWithSourceImpactRefresh(description: string, note: string): string {
  const trimmed = description.trim();
  const block = `## Source impact refresh\n${note.trim()}`;
  if (!trimmed) return block;
  const sourceRefreshBlock = /\n*##\s+Source impact refresh\s*\n[\s\S]*?(?=\n##\s+|$)/i;
  if (sourceRefreshBlock.test(trimmed)) return trimmed.replace(sourceRefreshBlock, `\n\n${block}`).trim();
  return `${trimmed}\n\n${block}`;
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
}
