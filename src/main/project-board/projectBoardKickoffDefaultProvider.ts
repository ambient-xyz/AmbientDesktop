import { parseProjectBoardLlmJson } from "./projectBoardLlmJson";
import { normalizeAmbientModelId } from "../../shared/ambientModels";
import {
  projectBoardKickoffDefaultContextFingerprint,
  type ProjectBoardKickoffDefaultConfidence,
} from "../../shared/projectBoardKickoffDefaults";
import { projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import type { ProjectBoardKickoffContextBrief, ProjectBoardQuestion, ProjectBoardSource } from "../../shared/projectBoardTypes";
import { AmbientStreamFailureError, type AmbientRetryPolicy } from "./projectBoardAmbientFacade";
import { callAmbientChatCompletionTextWithRetries, isAmbientChatCompletionValidationError } from "./projectBoardAmbientFacade";
import { readAmbientApiKey } from "../security/credentialStore";
import { buildProjectBoardPlanningContract } from "./projectBoardPlanningContract";
import { projectBoardSourceIncludedInSynthesis, projectBoardSourceKey } from "./projectBoardSourceIdentity";

export interface ProjectBoardKickoffDefaultTarget {
  questionId: string;
  question: string;
  required: boolean;
  sectionLabel: string;
  contextFingerprint: string;
}

export interface ProjectBoardKickoffDefaultSuggestion {
  questionId: string;
  question: string;
  suggestedAnswer: string;
  rationale: string;
  confidence: ProjectBoardKickoffDefaultConfidence;
  sourceIds: string[];
  contextFingerprint: string;
}

export interface AmbientProjectBoardKickoffDefaultTelemetry {
  promptCharCount: number;
  responseCharCount: number;
  requestDurationMs: number;
  contextBriefCharCount?: number;
}

export interface AmbientProjectBoardKickoffDefaultResult {
  suggestions: ProjectBoardKickoffDefaultSuggestion[];
  telemetry: AmbientProjectBoardKickoffDefaultTelemetry;
}

export interface AmbientProjectBoardKickoffDefaultProgress {
  promptCharCount?: number;
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

export interface ProjectBoardKickoffDefaultContext {
  boardTitle?: string;
  boardSummary?: string;
  questions: ProjectBoardQuestion[];
  sources: ProjectBoardSource[];
  contextBrief?: ProjectBoardKickoffContextBrief;
  questionIds?: string[];
  onProgress?: (progress: AmbientProjectBoardKickoffDefaultProgress) => void;
}

export class AmbientProjectBoardKickoffDefaultProvider {
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

  async suggest(input: ProjectBoardKickoffDefaultContext): Promise<AmbientProjectBoardKickoffDefaultResult> {
    const apiKey = (this.input.apiKey ?? readAmbientApiKey() ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const targets = projectBoardKickoffDefaultSuggestionTargets(input.questions, input.sources, { questionIds: input.questionIds });
    const contextBrief = input.contextBrief ?? buildProjectBoardKickoffContextBrief(input);
    const prompt = buildProjectBoardKickoffDefaultPrompt({ ...input, targets, contextBrief });
    const contract = buildProjectBoardPlanningContract({
      operation: "kickoff_defaults",
      projectName: input.boardTitle,
      charter: {
        goal: input.boardSummary,
        sourceAuthority: "Use the current project-board source scan and source inclusion choices as the authority boundary.",
        decisionPolicy: "Suggest editable defaults, but keep user-owned preferences visible and easy to override.",
        proofPolicy: "Default to concrete, reviewable proof expectations before execution can close cards.",
      },
    });
    const requestStartedAt = Date.now();
    const requestBody = {
      model: normalizeAmbientModelId(this.input.model),
      messages: [
        { role: "system", content: contract.systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: projectBoardKickoffDefaultMaxTokens(targets.length),
      response_format: { type: "json_object" },
      stream: true,
      ...projectBoardKickoffDefaultReasoningPayload(contract.reasoning),
    };
    input.onProgress?.({
      promptCharCount: prompt.length,
      responseCharCount: 0,
      requestDurationMs: Date.now() - requestStartedAt,
    });
    const reportProgress = (responseCharCount: number) =>
      input.onProgress?.({ promptCharCount: prompt.length, responseCharCount, requestDurationMs: Date.now() - requestStartedAt });
    const reportRetry = (event: {
      responseCharCount: number;
      retryAttempt: number;
      maxRetries: number;
      delayMs: number;
      error: string;
      fallbackToNonStream?: boolean;
    }) =>
      input.onProgress?.({
        promptCharCount: prompt.length,
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
        label: "Ambient project-board kickoff default suggestion",
        requestBody,
        retryPolicy: this.input.retryPolicy,
        waitForRetry: this.input.waitForRetry,
        retryPartialStreamFailures: true,
        nonStreamFallback: { enabled: true, afterStreamFailureCount: 2 },
        preStreamResponseTimeoutMs: this.input.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: this.input.streamContentIdleTimeoutMs,
        validateResponseText: validateProjectBoardKickoffDefaultResponseText,
        onResponseChars: reportProgress,
        onRetry: reportRetry,
      });
    } catch (error) {
      if (!shouldRetryKickoffDefaultsWithoutStreaming(error)) throw error;
      responseText = await callAmbientChatCompletionTextWithRetries({
        apiKey,
        baseUrl: this.input.baseUrl,
        fetchImpl: this.input.fetchImpl,
        label: "Ambient project-board kickoff default suggestion non-stream fallback",
        requestBody: { ...requestBody, stream: false },
        retryPolicy: this.input.retryPolicy,
        waitForRetry: this.input.waitForRetry,
        retryPartialStreamFailures: false,
        preStreamResponseTimeoutMs: this.input.preStreamResponseTimeoutMs,
        streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
        streamContentIdleTimeoutMs: this.input.streamContentIdleTimeoutMs,
        validateResponseText: validateProjectBoardKickoffDefaultResponseText,
        onResponseChars: reportProgress,
        onRetry: reportRetry,
      });
    }
    const requestDurationMs = Date.now() - requestStartedAt;
    return {
      suggestions: normalizeProjectBoardKickoffDefaultSuggestions(parseProjectBoardKickoffDefaultJson(responseText), targets),
      telemetry: {
        promptCharCount: prompt.length,
        responseCharCount: responseText.length,
        requestDurationMs,
        contextBriefCharCount: JSON.stringify(contextBrief).length,
      },
    };
  }
}

function validateProjectBoardKickoffDefaultResponseText(text: string): void {
  parseProjectBoardKickoffDefaultJson(text);
}

function shouldRetryKickoffDefaultsWithoutStreaming(error: unknown): boolean {
  if (isAmbientChatCompletionValidationError(error)) return true;
  return (
    error instanceof AmbientStreamFailureError &&
    !error.toolCallSeen &&
    (error.kind === "pre_stream_timeout" || error.kind === "stream_idle_timeout" || error.kind === "stream_closed_before_done")
  );
}

export function projectBoardKickoffDefaultSuggestionTargets(
  questions: ProjectBoardQuestion[],
  sources: ProjectBoardSource[],
  options: { questionIds?: string[]; limit?: number } = {},
): ProjectBoardKickoffDefaultTarget[] {
  const questionIdSet = options.questionIds?.length ? new Set(options.questionIds) : undefined;
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20));
  const targets: ProjectBoardKickoffDefaultTarget[] = [];
  questions.forEach((question, index) => {
    if (targets.length >= limit) return;
    if (questionIdSet && !questionIdSet.has(question.id)) return;
    if (question.answer?.trim()) return;
    targets.push({
      questionId: question.id,
      question: question.question,
      required: question.required,
      sectionLabel: projectBoardQuestionSectionLabel(index),
      contextFingerprint: projectBoardKickoffDefaultContextFingerprint({ question: question.question, sources }),
    });
  });
  return targets;
}

export function buildProjectBoardKickoffDefaultPrompt(
  input: ProjectBoardKickoffDefaultContext & { targets?: ProjectBoardKickoffDefaultTarget[]; contextBrief?: ProjectBoardKickoffContextBrief },
): string {
  const contract = buildProjectBoardPlanningContract({
    operation: "kickoff_defaults",
    projectName: input.boardTitle,
    charter: {
      goal: input.boardSummary,
      sourceAuthority: "Included primary/spec sources outrank ignored threads and scratch notes.",
      decisionPolicy: "Create editable kickoff defaults for PM review; do not silently decide user-owned preferences.",
      proofPolicy: "Executable cards need concrete proof expectations before completion.",
    },
  });
  const targets = input.targets ?? projectBoardKickoffDefaultSuggestionTargets(input.questions, input.sources, { questionIds: input.questionIds });
  const contextBrief = input.contextBrief ?? buildProjectBoardKickoffContextBrief(input);
  const answeredQuestions = input.questions
    .filter((question) => question.answer?.trim())
    .map((question) => ({ questionId: question.id, question: question.question, answer: question.answer!.trim() }));
  return [
    contract.stablePromptHeader,
    "",
    "Suggest editable default answers for the unanswered kickoff questions below.",
    "These defaults will prefill textareas before the board is activated; the user can edit each answer before saving.",
    "",
    "Rules:",
    "- Ground each default in the current source scan, source inclusion choices, and the question being answered.",
    "- Use the kickoff context brief as the compact authority digest. Cite its sourceIds instead of asking for hidden source text.",
    "- Respect ignored sources: mention that ignored threads or notes can be included before activation when that matters, but do not use ignored material as authoritative scope.",
    "- Prefer concise charter-ready prose that can be saved directly after review.",
    "- Keep each suggestedAnswer compact: aim for 35-90 words, avoid enumerating implementation detail unless the question explicitly asks for it, and put supporting nuance in rationale.",
    "- If the sources do not settle a user-owned preference, provide a conservative low-confidence default and explain the editable assumption in rationale.",
    "- Do not generate cards, rewrite sources, finalize the charter, or ask follow-up questions in this response.",
    "- Return one JSON object only. Do not use markdown.",
    ...contract.operationRules.map((rule) => `- ${rule}`),
    "",
    "Return exactly this JSON shape:",
    JSON.stringify(
      {
        suggestions: [
          {
            questionId: "question id from input",
            question: "same question text",
            suggestedAnswer: "Concise editable answer for the project charter.",
            rationale: "One short source-grounded reason for this default.",
            confidence: "high | medium | low",
            sourceIds: ["source ids used for the answer"],
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Target questions:",
    JSON.stringify(targets, null, 2),
    "",
    answeredQuestions.length ? "Already saved kickoff answers:" : "",
    answeredQuestions.length ? JSON.stringify(answeredQuestions, null, 2) : "",
    "",
    "Kickoff context brief:",
    JSON.stringify(contextBrief, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildProjectBoardKickoffContextBrief(input: {
  sources: ProjectBoardSource[];
  questions?: ProjectBoardQuestion[];
  generatedAt?: string;
}): ProjectBoardKickoffContextBrief {
  const includedSources = input.sources
    .filter(projectBoardSourceIncludedInSynthesis)
    .sort((left, right) => right.relevance - left.relevance || sourceLabel(left).localeCompare(sourceLabel(right)));
  const ignoredSources = input.sources.filter((source) => !projectBoardSourceIncludedInSynthesis(source));
  const selectedSources = [...includedSources.slice(0, 12), ...ignoredSources.sort((left, right) => right.relevance - left.relevance).slice(0, 4)];
  const sourceNotes = selectedSources.map(projectBoardKickoffContextBriefSource);
  const durablePlanSourceIds = selectedSources.filter(projectBoardKickoffSourceIsDurablePlan).map((source) => source.id);
  const proofExpectations = uniqueLimitedStrings(sourceNotes.flatMap((source) => source.proofExpectations), 8);
  const dependencyHints = uniqueLimitedStrings(sourceNotes.flatMap((source) => source.dependencyHints), 8);
  const risks = uniqueLimitedStrings(sourceNotes.flatMap((source) => source.risks), 8);
  const unresolvedSignals = uniqueLimitedStrings(
    [
      ...sourceNotes.flatMap((source) => source.keyFacts.filter((fact) => /\b(?:todo|tbd|unknown|decide|question|ambiguous|unspecified|missing)\b/i.test(fact))),
      ...(input.questions ?? []).filter((question) => question.required && !question.answer?.trim()).map((question) => question.question),
    ],
    8,
  );
  const primary = sourceNotes.filter((source) => source.includeInSynthesis).slice(0, 4);
  const summary = truncate(
    [
      primary.length
        ? `Primary context: ${primary.map((source) => `${source.title} (${source.kind})`).join("; ")}.`
        : "No included project sources are currently available.",
      durablePlanSourceIds.length ? `${durablePlanSourceIds.length} durable plan source${durablePlanSourceIds.length === 1 ? "" : "s"} included.` : "",
      proofExpectations.length ? `Proof cues: ${proofExpectations.slice(0, 3).join("; ")}.` : "",
      dependencyHints.length ? `Sequencing cues: ${dependencyHints.slice(0, 3).join("; ")}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    900,
  );
  return {
    summary,
    sourceIds: sourceNotes.map((source) => source.sourceId),
    durablePlanSourceIds,
    includedSourceCount: includedSources.length,
    ignoredSourceCount: ignoredSources.length,
    sourceNotes,
    proofExpectations,
    dependencyHints,
    risks,
    unresolvedSignals,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    generator: "source_digest",
  };
}

function projectBoardKickoffContextBriefSource(source: ProjectBoardSource): ProjectBoardKickoffContextBrief["sourceNotes"][number] {
  const corpus = [source.title, source.summary, source.excerpt ?? ""].filter(Boolean).join("\n");
  return {
    sourceId: source.id,
    sourceKey: source.sourceKey ?? projectBoardSourceKey(source),
    title: source.title,
    kind: source.kind,
    authorityRole: source.authorityRole,
    includeInSynthesis: projectBoardSourceIncludedInSynthesis(source),
    relevance: source.relevance,
    path: source.path,
    threadId: source.threadId,
    artifactId: source.artifactId,
    summary: truncate(source.summary || firstUsefulSentence(corpus) || sourceLabel(source), 480),
    keyFacts: sourceSentences(corpus, /./, 5, 180),
    proofExpectations: sourceSentences(corpus, /\b(?:test|proof|verify|validation|screenshot|unit|integration|manual|pass|acceptance|QA)\b/i, 4, 180),
    dependencyHints: sourceSentences(corpus, /\b(?:depend|blocked|before|after|phase|stage|sequence|first|then|prereq|foundation)\b/i, 4, 180),
    risks: sourceSentences(corpus, /\b(?:risk|blocker|unknown|gap|conflict|ambiguous|defer|todo|tbd|missing)\b/i, 4, 180),
  };
}

export function parseProjectBoardKickoffDefaultJson(text: string): unknown {
  return parseProjectBoardLlmJson(text, "Ambient project-board kickoff defaults");
}

export function normalizeProjectBoardKickoffDefaultSuggestions(
  value: unknown,
  targets: ProjectBoardKickoffDefaultTarget[],
): ProjectBoardKickoffDefaultSuggestion[] {
  const records =
    value && typeof value === "object" && Array.isArray((value as { suggestions?: unknown[] }).suggestions)
      ? (value as { suggestions: unknown[] }).suggestions
      : [];
  const byQuestionId = new Map<string, unknown>();
  const byQuestion = new Map<string, unknown>();
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const questionId = stringValue((record as { questionId?: unknown }).questionId);
    const question = stringValue((record as { question?: unknown }).question);
    if (questionId) byQuestionId.set(questionId, record);
    if (question) byQuestion.set(question.toLowerCase(), record);
  }
  return targets.flatMap((target) => {
    const direct = byQuestionId.get(target.questionId);
    const nearQuestion = direct
      ? undefined
      : [...byQuestion.entries()].find(([question]) => projectBoardQuestionsAreNearDuplicates(question, target.question))?.[1];
    const suggestion = normalizeProjectBoardKickoffDefaultSuggestion(target, direct ?? nearQuestion);
    return suggestion ? [suggestion] : [];
  });
}

function normalizeProjectBoardKickoffDefaultSuggestion(
  target: ProjectBoardKickoffDefaultTarget,
  value: unknown,
): ProjectBoardKickoffDefaultSuggestion | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const suggestedAnswer = stringValue(record.suggestedAnswer).slice(0, 4000);
  if (!suggestedAnswer) return undefined;
  const rationale = stringValue(record.rationale).slice(0, 1000) || "Ambient/Pi suggested this editable kickoff default from the current source scan.";
  const confidence =
    record.confidence === "high" || record.confidence === "medium" || record.confidence === "low"
      ? record.confidence
      : "medium";
  const sourceIds = Array.isArray(record.sourceIds)
    ? [...new Set(record.sourceIds.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 20)
    : [];
  return {
    questionId: target.questionId,
    question: target.question,
    suggestedAnswer,
    rationale,
    confidence,
    sourceIds,
    contextFingerprint: target.contextFingerprint,
  };
}

function projectBoardKickoffDefaultReasoningPayload(
  reasoning: ReturnType<typeof buildProjectBoardPlanningContract>["reasoning"],
): Record<string, unknown> {
  if (reasoning === undefined) return {};
  if (reasoning === false) return { reasoning: { effort: "none", enabled: false, exclude: true } };
  const payload: Record<string, unknown> = {};
  if (reasoning.effort) payload.effort = reasoning.effort;
  if (Number.isFinite(reasoning.max_tokens)) payload.max_tokens = Math.max(0, Math.floor(Number(reasoning.max_tokens)));
  if (typeof reasoning.exclude === "boolean") payload.exclude = reasoning.exclude;
  if (typeof reasoning.enabled === "boolean") payload.enabled = reasoning.enabled;
  return Object.keys(payload).length > 0 ? { reasoning: payload } : {};
}

function projectBoardQuestionSectionLabel(index: number): string {
  return ["Primary outcome", "Source authority", "Judgment policy", "Proof expectations", "Execution sequencing"][index] ?? `Question ${index + 1}`;
}

function projectBoardKickoffDefaultMaxTokens(targetCount: number): number {
  return Math.min(3_000, Math.max(900, Math.ceil(targetCount) * 650 + 350));
}

function projectBoardKickoffSourceIsDurablePlan(source: ProjectBoardSource): boolean {
  return source.kind === "plan_artifact" || source.path?.replace(/\\/g, "/").startsWith(".ambient/board/plans/") === true;
}

function sourceLabel(source: ProjectBoardSource): string {
  return source.path?.trim() || source.title.trim() || source.id;
}

function firstUsefulSentence(value: string): string {
  return sourceSentences(value, /./, 1, 240)[0] ?? "";
}

function sourceSentences(value: string, pattern: RegExp, limit: number, maxLength: number): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  return uniqueLimitedStrings(
    normalized
      .split(/(?<=[.!?])\s+|(?:\s+-\s+)|(?:\s+[0-9]+\.\s+)/)
      .map((sentence) => truncate(sentence, maxLength))
      .filter((sentence) => sentence.length >= 12 && pattern.test(sentence)),
    limit,
  );
}

function uniqueLimitedStrings(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(normalized);
    if (results.length >= limit) break;
  }
  return results;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(value: string, limit: number): string {
  const normalized = value.trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 3)}...` : normalized;
}
