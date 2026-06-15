import { parseProjectBoardLlmJson } from "./projectBoardLlmJson";
import { normalizeAmbientModelId } from "../shared/ambientModels";
import type { ProjectBoardCard, ProjectBoardCardTestPlan, ProjectBoardCharter } from "../shared/types";
import { AmbientStreamFailureError, type AmbientRetryPolicy } from "./aggressiveRetries";
import { callAmbientChatCompletionTextWithRetries, isAmbientChatCompletionValidationError } from "./ambientChatCompletionRetry";
import { readAmbientApiKey } from "./credentialStore";
import { projectBoardProofOwnershipForCard, projectBoardProofScopePromptRules, type ProjectBoardProofOwnership } from "./projectBoardProofScope";

export type ProjectBoardProofSuggestionConfidence = "high" | "medium" | "low";

export interface ProjectBoardProofSuggestion {
  cardId: string;
  testPlan: ProjectBoardCardTestPlan;
  rationale: string;
  confidence: ProjectBoardProofSuggestionConfidence;
  proofOwnership: ProjectBoardProofOwnership;
}

export interface AmbientProjectBoardProofSuggestionTelemetry {
  promptCharCount: number;
  responseCharCount: number;
  requestDurationMs: number;
}

export interface AmbientProjectBoardProofSuggestionResult {
  suggestions: ProjectBoardProofSuggestion[];
  telemetry: AmbientProjectBoardProofSuggestionTelemetry;
}

export interface AmbientProjectBoardProofSuggestionProgress {
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

export interface ProjectBoardProofSuggestionContext {
  boardTitle?: string;
  charter?: ProjectBoardCharter;
  cards: ProjectBoardCard[];
  onProgress?: (progress: AmbientProjectBoardProofSuggestionProgress) => void;
}

export class AmbientProjectBoardProofSuggestionProvider {
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

  async suggest(input: ProjectBoardProofSuggestionContext): Promise<AmbientProjectBoardProofSuggestionResult> {
    const apiKey = (this.input.apiKey ?? readAmbientApiKey() ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const prompt = buildProjectBoardProofSuggestionPrompt(input);
    const requestStartedAt = Date.now();
    const requestBody = {
      model: normalizeAmbientModelId(this.input.model),
      messages: [
        {
          role: "system",
          content:
            "You are Ambient/Pi acting as a senior engineering manager. Suggest concrete proof expectations for draft project-board cards. Return one JSON object only. Do not use markdown.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 3_000,
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
        label: "Ambient project-board proof suggestion",
        requestBody,
        retryPolicy: this.input.retryPolicy,
        waitForRetry: this.input.waitForRetry,
        retryPartialStreamFailures: true,
        nonStreamFallback: { enabled: true, afterStreamFailureCount: 2 },
        preStreamResponseTimeoutMs: this.input.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: this.input.streamContentIdleTimeoutMs,
        validateResponseText: validateProjectBoardProofSuggestionResponseText,
        onResponseChars: progress,
        onRetry: retryProgress,
      });
    } catch (error) {
      if (!shouldRetryProofSuggestionWithoutStreaming(error)) throw error;
      responseText = await callAmbientChatCompletionTextWithRetries({
        apiKey,
        baseUrl: this.input.baseUrl,
        fetchImpl: this.input.fetchImpl,
        label: "Ambient project-board proof suggestion non-stream fallback",
        requestBody: { ...requestBody, stream: false },
        retryPolicy: this.input.retryPolicy,
        waitForRetry: this.input.waitForRetry,
        retryPartialStreamFailures: false,
        preStreamResponseTimeoutMs: this.input.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: this.input.streamContentIdleTimeoutMs,
        validateResponseText: validateProjectBoardProofSuggestionResponseText,
        onResponseChars: progress,
        onRetry: retryProgress,
      });
    }
    const requestDurationMs = Date.now() - requestStartedAt;
    return {
      suggestions: normalizeProjectBoardProofSuggestions(parseProjectBoardProofSuggestionJson(responseText), input.cards),
      telemetry: {
        promptCharCount: prompt.length,
        responseCharCount: responseText.length,
        requestDurationMs,
      },
    };
  }
}

function shouldRetryProofSuggestionWithoutStreaming(error: unknown): boolean {
  return (
    (error instanceof AmbientStreamFailureError && error.kind === "stream_closed_before_done" && !error.toolCallSeen) ||
    isAmbientChatCompletionValidationError(error)
  );
}

function validateProjectBoardProofSuggestionResponseText(text: string): void {
  parseProjectBoardProofSuggestionJson(text);
}

export function buildProjectBoardProofSuggestionPrompt(input: ProjectBoardProofSuggestionContext): string {
  const cards = input.cards.map((card) => ({
    cardId: card.id,
    title: card.title,
    phase: card.phase ?? "",
    labels: card.labels,
    proofOwnership: projectBoardProofOwnershipForCard(card),
    description: truncate(card.description, 1_200),
    acceptanceCriteria: card.acceptanceCriteria.slice(0, 8),
  }));
  return [
    "Suggest missing proof expectations for draft project-board cards that currently have no unit, integration, visual, or manual proof plan.",
    input.boardTitle ? `Board: ${input.boardTitle}` : "",
    "",
    "Return exactly this JSON shape:",
    JSON.stringify(
      {
        suggestions: [
          {
            cardId: "card id from input",
            unit: ["Focused unit/API proof, only when appropriate."],
            integration: ["Command, browser smoke, trace, or workflow proof, only when appropriate."],
            visual: ["Screenshot or pixel/viewport evidence, only for visible-surface cards."],
            manual: ["Manual acceptance walkthrough, only when automation cannot prove it cheaply."],
            rationale: "One concise reason these proof expectations fit the card boundary.",
            confidence: "high | medium | low",
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Rules:",
    "- Return one suggestion for every input card id and no other card ids.",
    "- Each suggestion must contain at least one proof item total, but keep the plan small: usually one or two items total.",
    "- Do not rewrite card scope, title, description, dependencies, acceptance criteria, or status.",
    "- Keep each proof item concrete enough that an autonomous run can satisfy it and a PM can review it.",
    "- Prefer deterministic, cheap proof over broad manual inspection.",
    ...projectBoardProofScopePromptRules().map((rule) => `- ${rule}`),
    "- If proofOwnership is pure_module, do not add screenshot or browser-visual proof unless the card directly owns rendered pixels.",
    "- If proofOwnership is visible_surface, include visual evidence such as desktop/mobile screenshot, nonblank pixel check, viewport label, animation/canvas metric, or equivalent browser evidence.",
    "- If proofOwnership is integration, prefer command, browser smoke, trace, or workflow proof.",
    "",
    "Strict proof policy:",
    truncate(JSON.stringify(input.charter?.testPolicy ?? {}, null, 2), 1_500),
    "",
    "Cards:",
    JSON.stringify(cards, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseProjectBoardProofSuggestionJson(text: string): unknown {
  return parseProjectBoardLlmJson(text, "Ambient project-board proof suggestions");
}

export function normalizeProjectBoardProofSuggestions(value: unknown, cards: ProjectBoardCard[]): ProjectBoardProofSuggestion[] {
  const records =
    value && typeof value === "object" && Array.isArray((value as { suggestions?: unknown[] }).suggestions)
      ? (value as { suggestions: unknown[] }).suggestions
      : [];
  const byId = new Map<string, unknown>();
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const cardId = (record as { cardId?: unknown }).cardId;
    if (typeof cardId === "string" && cardId.trim()) byId.set(cardId.trim(), record);
  }
  return cards.map((card) => normalizeProjectBoardProofSuggestion(card, byId.get(card.id)));
}

export function deterministicProjectBoardProofSuggestionForCard(card: ProjectBoardCard): ProjectBoardProofSuggestion {
  const proofOwnership = projectBoardProofOwnershipForCard(card);
  const title = card.title.trim() || "this card";
  if (proofOwnership === "pure_module") {
    return {
      cardId: card.id,
      testPlan: {
        unit: [`Validate ${title} behavior with focused unit or API-level proof.`],
        integration: [],
        visual: [],
        manual: [],
      },
      rationale: "The card appears to own module-level behavior, so focused unit or API proof is the cheapest reliable evidence.",
      confidence: "medium",
      proofOwnership,
    };
  }
  if (proofOwnership === "visible_surface") {
    return {
      cardId: card.id,
      testPlan: {
        unit: [],
        integration: ["Run a browser smoke check that exercises the changed visible surface."],
        visual: [`Capture desktop and mobile visual proof showing ${title} rendered and nonblank.`],
        manual: [],
      },
      rationale: "The card changes a visible surface, so browser smoke plus screenshot/nonblank evidence is the reviewable proof.",
      confidence: "medium",
      proofOwnership,
    };
  }
  if (proofOwnership === "integration") {
    return {
      cardId: card.id,
      testPlan: {
        unit: [],
        integration: [`Run an integration smoke, trace, or command proving ${title} through the relevant workflow.`],
        visual: [],
        manual: [],
      },
      rationale: "The card appears to span behavior across boundaries, so integration proof is the primary evidence.",
      confidence: "medium",
      proofOwnership,
    };
  }
  return {
    cardId: card.id,
    testPlan: {
      unit: [],
      integration: [`Run a focused smoke check that demonstrates ${title} satisfies its acceptance criteria.`],
      visual: [],
      manual: ["Record a concise PM acceptance note for any criteria not covered by automated proof."],
    },
    rationale: "The card boundary is underspecified, so combine a focused smoke check with a narrow manual acceptance note.",
    confidence: "low",
    proofOwnership,
  };
}

function normalizeProjectBoardProofSuggestion(card: ProjectBoardCard, value: unknown): ProjectBoardProofSuggestion {
  const fallback = deterministicProjectBoardProofSuggestionForCard(card);
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  const proofOwnership = projectBoardProofOwnershipForCard(card);
  const testPlan = normalizeProjectBoardProofSuggestionTestPlan({
    unit: stringList(record.unit),
    integration: stringList(record.integration),
    visual: proofOwnership === "pure_module" ? [] : stringList(record.visual),
    manual: stringList(record.manual),
  });
  const suggestion = {
    cardId: card.id,
    testPlan,
    rationale: stringValue(record.rationale).slice(0, 500) || fallback.rationale,
    confidence: normalizeConfidence(record.confidence),
    proofOwnership,
  };
  return proofItemCount(suggestion.testPlan) > 0 ? suggestion : fallback;
}

function normalizeProjectBoardProofSuggestionTestPlan(testPlan: ProjectBoardCardTestPlan): ProjectBoardCardTestPlan {
  return {
    unit: normalizeProofItems(testPlan.unit),
    integration: normalizeProofItems(testPlan.integration),
    visual: normalizeProofItems(testPlan.visual),
    manual: normalizeProofItems(testPlan.manual),
  };
}

function normalizeProofItems(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim().replace(/\s+/g, " ")).filter(Boolean))].slice(0, 3);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeConfidence(value: unknown): ProjectBoardProofSuggestionConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function proofItemCount(testPlan: ProjectBoardCardTestPlan): number {
  return testPlan.unit.length + testPlan.integration.length + testPlan.visual.length + testPlan.manual.length;
}

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 3))}...`;
}
