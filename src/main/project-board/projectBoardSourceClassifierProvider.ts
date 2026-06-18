import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type { ProjectBoardSource, ProjectBoardSourceAuthorityRole, ProjectBoardSourceKind } from "../../shared/projectBoardTypes";
import { type AmbientRetryPolicy } from "./projectBoardAmbientFacade";
import { callAmbientChatCompletionTextWithRetries } from "./projectBoardAmbientFacade";
import { readAmbientApiKey } from "./projectBoardSecurityFacade";
import { buildProjectBoardPlanningContract } from "./projectBoardPlanningContract";
import {
  projectBoardSourceAuthorityRole,
  projectBoardSourceClassificationDefaults,
  projectBoardSourceKey,
} from "./projectBoardSourceIdentity";

export interface ProjectBoardSourceClassificationDecision {
  sourceId: string;
  sourceKey: string;
  effectiveKind: ProjectBoardSourceKind;
  classificationReason: string;
  classificationConfidence: number;
  authorityRole: ProjectBoardSourceAuthorityRole;
  includeInSynthesis: boolean;
}

export interface AmbientProjectBoardSourceClassificationTelemetry {
  promptCharCount: number;
  responseCharCount: number;
  requestDurationMs: number;
  sourceCount: number;
  piDecisionCount: number;
  batchCount?: number;
  failedBatchCount?: number;
  retriedBatchCount?: number;
  fallbackSourceCount?: number;
}

export interface AmbientProjectBoardSourceClassificationResult {
  classifications: ProjectBoardSourceClassificationDecision[];
  telemetry: AmbientProjectBoardSourceClassificationTelemetry;
}

export interface AmbientProjectBoardSourceClassificationFailure {
  sourceIds: string[];
  sourceKeys: string[];
  sourceCount: number;
  error: string;
  terminal: boolean;
}

export interface AmbientProjectBoardSourceBatchedClassificationResult extends AmbientProjectBoardSourceClassificationResult {
  failures: AmbientProjectBoardSourceClassificationFailure[];
  fallbackSourceIds: string[];
}

export interface AmbientProjectBoardSourceClassificationProgress {
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

const SOURCE_KINDS = new Set<ProjectBoardSourceKind>([
  "thread",
  "plan_artifact",
  "architecture_artifact",
  "functional_spec",
  "implementation_plan",
  "report_artifact",
  "workflow_artifact",
  "implementation_file",
  "test_artifact",
  "git_state",
  "ignored",
  "markdown",
]);

const AUTHORITY_ROLES = new Set<ProjectBoardSourceAuthorityRole>(["primary", "supporting", "context", "proof", "ignored"]);
const DEFAULT_CLASSIFICATION_BATCH_SOURCE_COUNT = 10;
const DEFAULT_CLASSIFICATION_BATCH_PROMPT_CHAR_LIMIT = 70_000;

export class AmbientProjectBoardSourceClassifierProvider {
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

  async classifyBatched(input: {
    sources: ProjectBoardSource[];
    projectName?: string;
    onProgress?: (progress: AmbientProjectBoardSourceClassificationProgress) => void;
    maxSourcesPerBatch?: number;
    maxPromptCharCount?: number;
  }): Promise<AmbientProjectBoardSourceBatchedClassificationResult> {
    const requestStartedAt = Date.now();
    const batches = batchProjectBoardSourcesForClassification({
      sources: input.sources,
      projectName: input.projectName,
      maxSourcesPerBatch: input.maxSourcesPerBatch,
      maxPromptCharCount: input.maxPromptCharCount,
    });
    const classifications: ProjectBoardSourceClassificationDecision[] = [];
    const failures: AmbientProjectBoardSourceClassificationFailure[] = [];
    const sourceOrder = new Map(input.sources.map((source, index) => [source.id, index]));
    let promptCharCount = 0;
    let responseCharCount = 0;
    let batchCount = 0;
    let retriedBatchCount = 0;

    const classifyBatch = async (sources: ProjectBoardSource[]): Promise<void> => {
      if (sources.length === 0) return;
      batchCount += 1;
      try {
        const result = await this.classify({
          sources,
          projectName: input.projectName,
          onProgress: input.onProgress
            ? (progress) =>
                input.onProgress?.({
                  ...progress,
                  responseCharCount: responseCharCount + progress.responseCharCount,
                  requestDurationMs: Date.now() - requestStartedAt,
                })
            : undefined,
        });
        promptCharCount += result.telemetry.promptCharCount;
        responseCharCount += result.telemetry.responseCharCount;
        if (result.telemetry.piDecisionCount < sources.length) {
          throw new Error(
            `Ambient/Pi returned ${result.telemetry.piDecisionCount} classification record${result.telemetry.piDecisionCount === 1 ? "" : "s"} for ${sources.length} source${sources.length === 1 ? "" : "s"}.`,
          );
        }
        classifications.push(...result.classifications);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const shouldSplit = sources.length > 1 && shouldSplitProjectBoardSourceClassificationBatch(message);
        failures.push(projectBoardSourceClassificationFailure(sources, message, !shouldSplit));
        if (!shouldSplit) return;
        retriedBatchCount += 1;
        const midpoint = Math.max(1, Math.floor(sources.length / 2));
        await classifyBatch(sources.slice(0, midpoint));
        await classifyBatch(sources.slice(midpoint));
      }
    };

    for (const batch of batches) {
      await classifyBatch(batch);
    }

    const uniqueClassifications = new Map<string, ProjectBoardSourceClassificationDecision>();
    for (const classification of classifications) uniqueClassifications.set(classification.sourceId, classification);
    const orderedClassifications = Array.from(uniqueClassifications.values()).sort(
      (left, right) => (sourceOrder.get(left.sourceId) ?? Number.MAX_SAFE_INTEGER) - (sourceOrder.get(right.sourceId) ?? Number.MAX_SAFE_INTEGER),
    );
    const classifiedSourceIds = new Set(orderedClassifications.map((classification) => classification.sourceId));
    const fallbackSourceIds = input.sources.filter((source) => !classifiedSourceIds.has(source.id)).map((source) => source.id);

    return {
      classifications: orderedClassifications,
      failures,
      fallbackSourceIds,
      telemetry: {
        promptCharCount,
        responseCharCount,
        requestDurationMs: Date.now() - requestStartedAt,
        sourceCount: input.sources.length,
        piDecisionCount: orderedClassifications.length,
        batchCount,
        failedBatchCount: failures.length,
        retriedBatchCount,
        fallbackSourceCount: fallbackSourceIds.length,
      },
    };
  }

  async classify(input: {
    sources: ProjectBoardSource[];
    projectName?: string;
    onProgress?: (progress: AmbientProjectBoardSourceClassificationProgress) => void;
  }): Promise<AmbientProjectBoardSourceClassificationResult> {
    const apiKey = (this.input.apiKey ?? readAmbientApiKey() ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const prompt = buildProjectBoardSourceClassificationPrompt(input);
    const contract = buildProjectBoardPlanningContract({
      operation: "source_classification",
      projectName: input.projectName,
      charter: {
        sourceAuthority: "Classify source authority before board planning. Preserve user-classified sources outside this provider.",
        decisionPolicy: "Prefer semantic source role over filename heuristics and explain low-confidence classifications.",
      },
    });
    const requestStartedAt = Date.now();
    const responseText = await callAmbientChatCompletionTextWithRetries({
      apiKey,
      baseUrl: this.input.baseUrl,
      fetchImpl: this.input.fetchImpl,
      label: "Ambient project-board source classification",
      requestBody: {
        model: normalizeAmbientModelId(this.input.model),
        messages: [
          {
            role: "system",
            content: contract.systemPrompt,
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.05,
        max_tokens: 6_000,
        response_format: { type: "json_object" },
        stream: true,
        ...projectBoardSourceClassificationReasoningPayload(contract.reasoning),
      },
      retryPolicy: this.input.retryPolicy,
      waitForRetry: this.input.waitForRetry,
      retryPartialStreamFailures: true,
      nonStreamFallback: { enabled: true, afterStreamFailureCount: 2 },
      preStreamResponseTimeoutMs: this.input.preStreamResponseTimeoutMs,
      streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
      streamContentIdleTimeoutMs: this.input.streamContentIdleTimeoutMs,
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
    const requestDurationMs = Date.now() - requestStartedAt;
    const parsed = parseProjectBoardSourceClassificationJson(responseText);
    const classifications = normalizeProjectBoardSourceClassifications(parsed, input.sources);
    return {
      classifications,
      telemetry: {
        promptCharCount: prompt.length,
        responseCharCount: responseText.length,
        requestDurationMs,
        sourceCount: input.sources.length,
        piDecisionCount: Math.min(classificationRecordCount(parsed), input.sources.length),
      },
    };
  }
}

export function batchProjectBoardSourcesForClassification(input: {
  sources: ProjectBoardSource[];
  projectName?: string;
  maxSourcesPerBatch?: number;
  maxPromptCharCount?: number;
}): ProjectBoardSource[][] {
  const maxSourcesPerBatch = Math.max(1, Math.floor(input.maxSourcesPerBatch ?? DEFAULT_CLASSIFICATION_BATCH_SOURCE_COUNT));
  const maxPromptCharCount = Math.max(4_000, Math.floor(input.maxPromptCharCount ?? DEFAULT_CLASSIFICATION_BATCH_PROMPT_CHAR_LIMIT));
  const batches: ProjectBoardSource[][] = [];
  let current: ProjectBoardSource[] = [];

  for (const source of input.sources) {
    const candidate = [...current, source];
    const candidatePromptLength = buildProjectBoardSourceClassificationPrompt({ sources: candidate, projectName: input.projectName }).length;
    if (current.length > 0 && (current.length >= maxSourcesPerBatch || candidatePromptLength > maxPromptCharCount)) {
      batches.push(current);
      current = [source];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function projectBoardSourceClassificationFailure(
  sources: ProjectBoardSource[],
  error: string,
  terminal: boolean,
): AmbientProjectBoardSourceClassificationFailure {
  return {
    sourceIds: sources.map((source) => source.id),
    sourceKeys: sources.map((source) => source.sourceKey ?? projectBoardSourceKey(source)),
    sourceCount: sources.length,
    error: error.replace(/\s+/g, " ").trim().slice(0, 500),
    terminal,
  };
}

function shouldSplitProjectBoardSourceClassificationBatch(error: string): boolean {
  const normalized = error.toLowerCase();
  if (/\b(?:408|409|425|429|500|502|503|504)\b|rate limit|temporar|try again|timeout|timed out|upstream|econnreset|socket hang up/.test(normalized)) {
    return false;
  }
  if (normalized.includes("did not start streaming") || normalized.includes("stream stalled")) return false;
  return (
    normalized.includes("valid json") ||
    normalized.includes("empty response") ||
    normalized.includes("classification record") ||
    normalized.includes("invalid")
  );
}

export function buildProjectBoardSourceClassificationPrompt(input: { sources: ProjectBoardSource[]; projectName?: string }): string {
  const contract = buildProjectBoardPlanningContract({
    operation: "source_classification",
    projectName: input.projectName,
    charter: {
      sourceAuthority: "Classify source authority before board planning. Preserve user-classified sources outside this prompt.",
      decisionPolicy: "Prefer semantic source role over filename heuristics and explain low-confidence classifications.",
    },
  });
  return [
    contract.stablePromptHeader,
    "",
    "Classify these project-board sources for board synthesis.",
    input.projectName ? `Project: ${input.projectName}` : "",
    "",
    "Return JSON matching this exact shape:",
    JSON.stringify(
      {
        classifications: [
          {
            sourceId: "source id from input",
            sourceKey: "stable source key from input",
            effectiveKind:
              "thread | plan_artifact | architecture_artifact | functional_spec | implementation_plan | report_artifact | workflow_artifact | implementation_file | test_artifact | git_state | ignored | markdown",
            classificationReason: "short reason grounded in title/path/content",
            classificationConfidence: 0.86,
            authorityRole: "primary | supporting | context | proof | ignored",
            includeInSynthesis: true,
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Classification rules:",
    "- Prefer the semantic role of the document over filename heuristics.",
    "- Treat game design documents, product specs, PRDs, requirement docs, and detailed feature specs as functional_spec with primary authority unless they are clearly stale or generated proof output.",
    "- Treat architecture, system design, data model, technical decision, and ADR documents as architecture_artifact.",
    "- Treat phased implementation plans, roadmaps, milestone plans, and TODO plans as implementation_plan.",
    "- Treat generated health reports, audit reports, and analysis reports as report_artifact; use supporting authority only after explicit promotion.",
    "- Treat WORKFLOW, AGENTS, agent notes, runbooks, and execution policy documents as workflow_artifact.",
    "- Treat test plans, screenshots, traces, test output summaries, and proof logs as test_artifact/proof unless they describe desired product scope.",
    "- Treat source code/config files as implementation_file or test_artifact depending on whether they define app behavior or tests.",
    "- Treat conversational threads as thread/context unless the thread transcript contains the only authoritative product scope.",
    "- Mark generated duplicate snapshots, stale output, dependency folders, and irrelevant logs as ignored/includeInSynthesis false.",
    "- Use authorityRole primary only for sources that should win if sources disagree.",
    "- Use authorityRole proof for test/proof artifacts, context for threads/git/code state, supporting for useful but non-authoritative docs, and ignored for excluded sources.",
    "- Return one classification for every input source. Preserve sourceId and sourceKey exactly.",
    ...contract.operationRules.map((rule) => `- ${rule}`),
    "",
    "Sources:",
    ...input.sources.map((source, index) =>
      [
        "",
        `--- SOURCE ${index + 1} ---`,
        `sourceId: ${source.id}`,
        `sourceKey: ${source.sourceKey ?? projectBoardSourceKey(source)}`,
        `currentKind: ${source.kind}`,
        `changeState: ${source.changeState ?? "unknown"}`,
        source.path ? `path: ${source.path}` : "",
        source.threadId ? `threadId: ${source.threadId}` : "",
        source.artifactId ? `artifactId: ${source.artifactId}` : "",
        `title: ${source.title}`,
        `summary: ${source.summary}`,
        source.excerpt?.trim() ? `excerpt:\n${truncate(source.excerpt.trim(), 1_800)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

function projectBoardSourceClassificationReasoningPayload(
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

export function parseProjectBoardSourceClassificationJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Ambient project-board source classification returned an empty response.");
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return JSON.parse(fenced[1].trim());
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    throw new Error("Ambient project-board source classification did not return valid JSON.");
  }
}

export function normalizeProjectBoardSourceClassifications(
  value: unknown,
  sources: ProjectBoardSource[],
): ProjectBoardSourceClassificationDecision[] {
  const records =
    value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as Record<string, unknown>).classifications)
      ? ((value as Record<string, unknown>).classifications as unknown[])
      : Array.isArray(value)
        ? value
        : [];
  const usedRecords = new Set<number>();
  return sources.map((source, index) => {
    const recordIndex = findClassificationRecordIndex(records, source, index, usedRecords);
    if (recordIndex >= 0) usedRecords.add(recordIndex);
    const record =
      recordIndex >= 0 && records[recordIndex] && typeof records[recordIndex] === "object" && !Array.isArray(records[recordIndex])
        ? (records[recordIndex] as Record<string, unknown>)
        : {};
    return normalizeProjectBoardSourceClassification(source, record);
  });
}

function normalizeProjectBoardSourceClassification(
  source: ProjectBoardSource,
  record: Record<string, unknown>,
): ProjectBoardSourceClassificationDecision {
  const fallback = projectBoardSourceClassificationDefaults({
    kind: source.kind,
    relevance: source.relevance,
    summary: source.summary,
  });
  const effectiveKind = SOURCE_KINDS.has(record.effectiveKind as ProjectBoardSourceKind)
    ? (record.effectiveKind as ProjectBoardSourceKind)
    : SOURCE_KINDS.has(record.kind as ProjectBoardSourceKind)
      ? (record.kind as ProjectBoardSourceKind)
      : source.kind;
  const classificationConfidence =
    typeof record.classificationConfidence === "number" && Number.isFinite(record.classificationConfidence)
      ? clamp(record.classificationConfidence, 0, 1)
      : typeof record.confidence === "number" && Number.isFinite(record.confidence)
        ? clamp(record.confidence, 0, 1)
        : fallback.classificationConfidence;
  const authorityRole = AUTHORITY_ROLES.has(record.authorityRole as ProjectBoardSourceAuthorityRole)
    ? (record.authorityRole as ProjectBoardSourceAuthorityRole)
    : projectBoardSourceAuthorityRole(effectiveKind, source.relevance);
  const includeInSynthesis =
    effectiveKind === "ignored"
      ? false
      : typeof record.includeInSynthesis === "boolean"
        ? record.includeInSynthesis
        : authorityRole !== "ignored";
  const reason = typeof record.classificationReason === "string" ? record.classificationReason : typeof record.reason === "string" ? record.reason : "";
  return {
    sourceId: source.id,
    sourceKey: source.sourceKey ?? projectBoardSourceKey(source),
    effectiveKind,
    classificationReason:
      reason.trim().slice(0, 500) ||
      `Ambient/Pi selected ${effectiveKind} for this project source after reviewing title, path, summary, and excerpt.`,
    classificationConfidence,
    authorityRole: effectiveKind === "ignored" ? "ignored" : authorityRole,
    includeInSynthesis,
  };
}

function findClassificationRecordIndex(
  records: unknown[],
  source: ProjectBoardSource,
  index: number,
  usedRecords: Set<number>,
): number {
  const sourceKey = source.sourceKey ?? projectBoardSourceKey(source);
  const normalizedTitle = normalizeLoose(source.title);
  const normalizedPath = normalizeLoose(source.path ?? "");
  const matchers: Array<(record: Record<string, unknown>) => boolean> = [
    (record) => record.sourceId === source.id,
    (record) => record.id === source.id,
    (record) => record.sourceKey === sourceKey,
    (record) => typeof record.path === "string" && normalizedPath.length > 0 && normalizeLoose(record.path) === normalizedPath,
    (record) => typeof record.title === "string" && normalizedTitle.length > 0 && normalizeLoose(record.title) === normalizedTitle,
  ];
  for (const matcher of matchers) {
    const found = records.findIndex((candidate, candidateIndex) => {
      if (usedRecords.has(candidateIndex) || !candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
      return matcher(candidate as Record<string, unknown>);
    });
    if (found >= 0) return found;
  }
  return index < records.length && !usedRecords.has(index) ? index : -1;
}

function classificationRecordCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as Record<string, unknown>).classifications)) {
    return ((value as Record<string, unknown>).classifications as unknown[]).length;
  }
  return 0;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const headLength = Math.floor(maxLength * 0.62);
  const tailLength = Math.max(0, maxLength - headLength - 80);
  return `${value.slice(0, headLength)}\n\n[${value.length - headLength - tailLength} characters omitted]\n\n${value.slice(-tailLength)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeLoose(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
