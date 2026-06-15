import { normalizeAmbientModelId } from "../shared/ambientModels";
import type { ProjectBoardCharter, ProjectBoardCharterProjectSummary, ProjectBoardSource } from "../shared/types";
import { type AmbientRetryPolicy } from "./aggressiveRetries";
import { callAmbientChatCompletionTextWithRetries } from "./ambientChatCompletionRetry";
import { readAmbientApiKey } from "./credentialStore";
import { buildProjectBoardPlanningContract } from "./projectBoardPlanningContract";
import { projectBoardSourceIncludedInSynthesis, projectBoardSourceKey } from "./projectBoardSourceIdentity";

export interface AmbientProjectBoardCharterSummaryProgress {
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

export interface AmbientProjectBoardCharterSummaryTelemetry {
  promptCharCount: number;
  responseCharCount: number;
  requestDurationMs: number;
  sourceCount: number;
}

export interface AmbientProjectBoardCharterSummaryResult {
  summary: ProjectBoardCharterProjectSummary;
  telemetry: AmbientProjectBoardCharterSummaryTelemetry;
}

export class AmbientProjectBoardCharterSummaryProvider {
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

  async summarize(input: {
    charter: ProjectBoardCharter;
    sources: ProjectBoardSource[];
    projectName?: string;
    fallbackSummary: ProjectBoardCharterProjectSummary;
    generatedAt?: string;
    onProgress?: (progress: AmbientProjectBoardCharterSummaryProgress) => void;
    signal?: AbortSignal;
  }): Promise<AmbientProjectBoardCharterSummaryResult> {
    const apiKey = (this.input.apiKey ?? readAmbientApiKey() ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const prompt = buildProjectBoardCharterSummaryPrompt(input);
    const contract = buildProjectBoardPlanningContract({
      operation: "charter_summary",
      projectName: input.projectName,
      charter: {
        goal: input.charter.goal,
        sourceAuthority:
          typeof input.charter.sourcePolicy.policy === "string"
            ? input.charter.sourcePolicy.policy
            : "Summarize from current board sources and preserve explicit source authority.",
        decisionPolicy:
          typeof input.charter.decisionPolicy.defaultPolicy === "string" || typeof input.charter.decisionPolicy.default === "string"
            ? String(input.charter.decisionPolicy.defaultPolicy ?? input.charter.decisionPolicy.default)
            : "List unresolved decisions instead of choosing preferences for the user.",
        proofPolicy: input.charter.qualityBar,
      },
    });
    const requestStartedAt = Date.now();
    const responseText = await callAmbientChatCompletionTextWithRetries({
      apiKey,
      baseUrl: this.input.baseUrl,
      fetchImpl: this.input.fetchImpl,
      label: "Ambient project-board charter summary",
      requestBody: {
        model: normalizeAmbientModelId(this.input.model),
        messages: [
          { role: "system", content: contract.systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.05,
        max_tokens: 4_000,
        response_format: { type: "json_object" },
        stream: true,
        ...projectBoardCharterSummaryReasoningPayload(contract.reasoning),
      },
      retryPolicy: this.input.retryPolicy,
      waitForRetry: this.input.waitForRetry,
      retryPartialStreamFailures: true,
      nonStreamFallback: { enabled: true, afterStreamFailureCount: 2 },
      preStreamResponseTimeoutMs: this.input.preStreamResponseTimeoutMs,
      streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
      streamContentIdleTimeoutMs: this.input.streamContentIdleTimeoutMs,
      signal: input.signal,
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
    const parsed = parseProjectBoardCharterSummaryJson(responseText);
    const summary = normalizeProjectBoardCharterSummary(parsed, input.fallbackSummary, input.generatedAt ?? new Date().toISOString());
    return {
      summary,
      telemetry: {
        promptCharCount: prompt.length,
        responseCharCount: responseText.length,
        requestDurationMs,
        sourceCount: input.sources.length,
      },
    };
  }
}

export function buildProjectBoardCharterSummaryPrompt(input: {
  charter: ProjectBoardCharter;
  sources: ProjectBoardSource[];
  projectName?: string;
  fallbackSummary: ProjectBoardCharterProjectSummary;
}): string {
  const contract = buildProjectBoardPlanningContract({
    operation: "charter_summary",
    projectName: input.projectName,
    charter: {
      goal: input.charter.goal,
      proofPolicy: input.charter.qualityBar,
      projectSummary: input.fallbackSummary,
    },
  });
  const sources = input.sources
    .filter(projectBoardSourceIncludedInSynthesis)
    .sort((left, right) => right.relevance - left.relevance || sourceTitle(left).localeCompare(sourceTitle(right)))
    .slice(0, 24);
  return [
    contract.stablePromptHeader,
    "",
    "Create a compact active-charter project summary for future planner and card sessions.",
    input.projectName ? `Project: ${input.projectName}` : "",
    "",
    "Return JSON matching this exact shape:",
    JSON.stringify(
      {
        summary: "short project-shape summary grounded in charter and sources",
        majorSystems: ["system or workstream"],
        sourceCoverage: ["source coverage note"],
        risks: ["risk or ambiguity"],
        dependencyHints: ["dependency or sequencing hint"],
        unresolvedDecisions: ["decision still needing user input"],
        citations: ["source title/path/id"],
        coverageGaps: ["missing source or proof coverage gap"],
      },
      null,
      2,
    ),
    "",
    "Rules:",
    "- Use the active charter and current source scan as evidence; do not invent new product scope.",
    "- Keep the summary useful as stable prompt-prefix context, not a long report.",
    "- Separate what sources say from unresolved decisions and coverage gaps.",
    "- If a decision requires user preference, list it in unresolvedDecisions instead of deciding it.",
    "- Include citations that identify the sources supporting the summary.",
    "- Preserve important source coverage, risk, and dependency details from the deterministic fallback if the sources support them.",
    "- Do not return checksums, timestamps, generator names, markdown, or explanatory prose outside JSON.",
    ...contract.operationRules.map((rule) => `- ${rule}`),
    "",
    "Active charter:",
    JSON.stringify(
      {
        goal: input.charter.goal,
        currentState: input.charter.currentState,
        targetUser: input.charter.targetUser,
        nonGoals: input.charter.nonGoals,
        qualityBar: input.charter.qualityBar,
        decisionPolicy: input.charter.decisionPolicy,
        dependencyPolicy: input.charter.dependencyPolicy,
        sourcePolicy: input.charter.sourcePolicy,
      },
      null,
      2,
    ),
    "",
    "Deterministic fallback summary to improve, cite, and compact:",
    JSON.stringify(input.fallbackSummary, null, 2),
    "",
    "Current included sources:",
    ...sources.map((source, index) =>
      [
        "",
        `--- SOURCE ${index + 1} ---`,
        `sourceId: ${source.id}`,
        `sourceKey: ${source.sourceKey ?? projectBoardSourceKey(source)}`,
        `kind: ${source.kind}`,
        `authorityRole: ${source.authorityRole ?? "unknown"}`,
        `includeInSynthesis: ${projectBoardSourceIncludedInSynthesis(source)}`,
        `relevance: ${source.relevance}`,
        source.path ? `path: ${source.path}` : "",
        source.threadId ? `threadId: ${source.threadId}` : "",
        source.artifactId ? `artifactId: ${source.artifactId}` : "",
        `title: ${source.title}`,
        `summary: ${source.summary}`,
        source.excerpt?.trim() ? `excerpt:\n${truncate(source.excerpt.trim(), 1_400)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseProjectBoardCharterSummaryJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Ambient project-board charter summary returned an empty response.");
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return JSON.parse(fenced[1].trim());
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    throw new Error("Ambient project-board charter summary did not return valid JSON.");
  }
}

export function normalizeProjectBoardCharterSummary(
  value: unknown,
  fallback: ProjectBoardCharterProjectSummary,
  generatedAt: string,
): ProjectBoardCharterProjectSummary {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    summary: stringField(record.summary, fallback.summary, 1500),
    majorSystems: stringListField(record.majorSystems, fallback.majorSystems, 8),
    sourceCoverage: stringListField(record.sourceCoverage, fallback.sourceCoverage, 12),
    risks: stringListField(record.risks, fallback.risks, 8),
    dependencyHints: stringListField(record.dependencyHints, fallback.dependencyHints, 8),
    unresolvedDecisions: stringListField(record.unresolvedDecisions, fallback.unresolvedDecisions, 10),
    citations: stringListField(record.citations, fallback.citations, 12),
    coverageGaps: stringListField(record.coverageGaps, fallback.coverageGaps, 8),
    sourceChecksumSet: fallback.sourceChecksumSet,
    charterAnswerChecksum: fallback.charterAnswerChecksum,
    kickoffContextBrief: fallback.kickoffContextBrief,
    generatedAt,
    generator: "ambient_rlm",
  };
}

function projectBoardCharterSummaryReasoningPayload(
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

function sourceTitle(source: ProjectBoardSource): string {
  return source.path?.trim() || source.title.trim() || source.id;
}

function stringField(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return truncate(text || fallback, maxLength);
}

function stringListField(value: unknown, fallback: string[], limit: number): string[] {
  const raw = Array.isArray(value) ? value : [];
  const strings = raw.filter((item): item is string => typeof item === "string");
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of strings.length ? strings : fallback) {
    const normalized = item.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(truncate(normalized, 300));
    if (result.length >= limit) break;
  }
  return result;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const headLength = Math.floor(maxLength * 0.62);
  const tailLength = Math.max(0, maxLength - headLength - 80);
  return `${value.slice(0, headLength)}\n\n[${value.length - headLength - tailLength} characters omitted]\n\n${value.slice(-tailLength)}`;
}
