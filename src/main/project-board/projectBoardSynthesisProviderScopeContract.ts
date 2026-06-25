import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type {
  ProjectBoardPlanningDepthAssessment,
  ProjectBoardPlanningDepthLevel,
  ProjectBoardScopeContract,
  ProjectBoardScopeFeature,
} from "../../shared/projectBoardTypes";
import { stableBoardArtifactId } from "./projectBoardArtifacts";
import type { AmbientRetryPolicy } from "./projectBoardAmbientFacade";
import {
  ProjectBoardPromptBudgetAssessment,
  projectBoardModelBudgetProfile,
  projectBoardPromptBudgetAssessment,
  projectBoardPromptBudgetAssessmentMetadata,
} from "./projectBoardModelBudgetProfile";
import { mergeProjectBoardScopeContracts, projectBoardScopeContractFromTexts } from "./projectBoardPlanningContract";
import { projectBoardSourceIncludedInSynthesis } from "./projectBoardSourceIdentity";
import {
  projectBoardScopeContractTexts,
  type ProjectBoardSynthesisRefinementContext,
  type ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";
import { parseProjectBoardSynthesisJson } from "./projectBoardSynthesisPlannerPrompts";
import { callWorkflowPiText } from "./projectBoardWorkflowFacade";

const DEFAULT_SCOPE_CONTRACT_STREAM_IDLE_TIMEOUT_MS = 120_000;

interface ProjectBoardScopeContractProgress {
  stage: "model_request" | "model_response" | "schema_validation";
  title: string;
  summary: string;
  metadata: Record<string, unknown>;
  promptCharCount?: number;
  responseCharCount?: number;
  cardCount?: number;
  questionCount?: number;
}

export async function deriveProjectBoardScopeContractWithPi(input: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  projectName?: string;
  sources: ProjectBoardSynthesisSource[];
  refinement?: ProjectBoardSynthesisRefinementContext;
  piTextCall?: typeof callWorkflowPiText;
  skipLlmCall?: boolean;
  retryPolicy?: AmbientRetryPolicy;
  streamIdleTimeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: ProjectBoardScopeContractProgress) => void;
}): Promise<ProjectBoardScopeContract> {
  const deterministicScopeContract = projectBoardScopeContractFromTexts(
    projectBoardScopeContractTexts({ sources: input.sources, refinement: input.refinement }),
  );
  if (input.skipLlmCall) return deterministicScopeContract;
  const prompt = buildProjectBoardScopeContractPrompt(input);
  const budgetProfile = projectBoardModelBudgetProfile({ model: input.model, operation: "charter_review" });
  const promptBudget = projectBoardPromptBudgetAssessment({ promptCharCount: prompt.length, profile: budgetProfile });
  input.onProgress?.({
    stage: "model_request",
    title: "Asked Ambient/Pi for scope contract",
    summary: "Extracting requested, implied, optional, excluded, and uncertain product scope before board planning.",
    metadata: {
      promptCharCount: prompt.length,
      ...scopeContractPromptBudgetRunMetadata({
        latestPromptCharCount: prompt.length,
        cumulativePromptCharCount: prompt.length,
        promptBudget,
        plannerLedgerCompactionStatus: "skipped",
        plannerLedgerCompactionSkipReason: "scope_contract_short_prompt",
      }),
      model: normalizeAmbientModelId(input.model),
      planningOperation: "scope_contract",
      outputTokenBudget: Math.min(2400, budgetProfile.maxOutputTokens),
    },
    promptCharCount: prompt.length,
  });
  let text: string;
  try {
    text = await (input.piTextCall ?? callWorkflowPiText)({
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      model: input.model,
      systemPrompt:
        "You extract product scope contracts for project-board planning. Return strict JSON only. Do not design the app. Do not create implementation cards.",
      prompt,
      sessionId: stableBoardArtifactId("project-board-scope-contract-session", [
        input.projectName ?? "project-board",
        ...input.sources.map((source) => source.id ?? source.sourceKey ?? source.path ?? source.title).slice(0, 8),
      ]),
      temperature: 0,
      maxTokens: Math.min(2400, budgetProfile.maxOutputTokens),
      reasoning: false,
      responseFormat: { type: "json_object" },
      retryPolicy: input.retryPolicy,
      idleTimeoutMs: normalizeScopeContractStreamIdleTimeoutMs(input.streamIdleTimeoutMs),
      signal: input.signal,
    });
  } catch (error) {
    if (input.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    input.onProgress?.({
      stage: "model_response",
      title: "Scope contract fallback used",
      summary: "Ambient/Pi could not return a scope contract, so planning continued with deterministic scope extracted from sources.",
      metadata: {
        planningOperation: "scope_contract",
        fallback: "deterministic_scope_contract",
        responseCharCount: 0,
        error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      },
      responseCharCount: 0,
    });
    return deterministicScopeContract;
  }
  try {
    const parsed = parseProjectBoardSynthesisJson(text);
    return mergeProjectBoardScopeContracts(deterministicScopeContract, normalizeProjectBoardLlmScopeContract(parsed));
  } catch (error) {
    input.onProgress?.({
      stage: "model_response",
      title: "Scope contract fallback used",
      summary:
        "Ambient/Pi returned an invalid scope contract response, so planning continued with deterministic scope extracted from sources.",
      metadata: {
        planningOperation: "scope_contract",
        fallback: "deterministic_scope_contract",
        responseCharCount: text.length,
        error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      },
      responseCharCount: text.length,
    });
    return deterministicScopeContract;
  }
}

export function buildProjectBoardScopeContractPrompt(input: {
  projectName?: string;
  sources: ProjectBoardSynthesisSource[];
  refinement?: ProjectBoardSynthesisRefinementContext;
}): string {
  const sourceBlocks = input.sources
    .filter(
      (source) =>
        projectBoardSourceIncludedInSynthesis(source) && Boolean(source.title.trim() || source.summary.trim() || source.excerpt?.trim()),
    )
    .slice(0, 20)
    .map((source, index) =>
      [
        `SOURCE ${index + 1}`,
        `Title: ${source.title}`,
        `Kind: ${source.kind}`,
        `Authority: ${source.authorityRole ?? "unspecified"}`,
        `Summary: ${source.summary}`,
        source.excerpt?.trim() ? `Excerpt:\n${source.excerpt.trim().slice(0, 6000)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n---\n\n");
  const answers =
    input.refinement?.answers.map((answer, index) => `${index + 1}. Q: ${answer.question}\nA: ${answer.answer}`).join("\n\n") ?? "";
  return [
    "Analyze the user's request and extract the intended software scope.",
    "Do not design the app yet. Do not create implementation cards. Do not add features beyond what the user requested.",
    input.projectName ? `Project: ${input.projectName}` : "",
    "",
    "Your job is to determine:",
    "1. What the user explicitly wants.",
    "2. What the user explicitly rules out.",
    "3. What is reasonably implied.",
    "4. What is uncertain or needs clarification.",
    "5. What implementation complexity follows from that scope.",
    "",
    "Important rules:",
    "- Interpret the user's intent semantically, not by keyword matching.",
    "- Do not expand the product beyond the user's request.",
    "- If a feature is not requested and is not required for the requested app to function, do not include it.",
    "- If the request is ambiguous, record the ambiguity instead of silently choosing a larger scope.",
    "- If a generated feature would materially change the product, it must be treated as optional or out of scope unless the user requested it.",
    "- Every included, excluded, or assumed item must include evidence from the user's request.",
    "- Complexity should reflect the extracted scope, not imagined future product features.",
    "",
    "Return JSON only with this shape:",
    JSON.stringify(
      {
        included: [
          "auth|accounts|analytics|sync|collaboration|notifications|backend|payments|deployment|admin_reporting only when explicitly included",
        ],
        excluded: ["same enum values only when explicitly excluded"],
        requiredCapabilities: ["directly requested user-visible capability with evidence"],
        supportingCapabilities: ["capability required for requested behavior to work, with evidence"],
        optionalCapabilities: ["useful but not requested or materially product-changing capability, with evidence"],
        excludedCapabilities: ["explicitly ruled-out capability, with evidence"],
        planningDepth: {
          score: "0-100 implementation complexity score for the extracted scope only",
          level: "shallow|standard|deep|phased",
          signals: ["scope-based reasons for this complexity"],
          guidance: "how planning should adapt without expanding product scope",
        },
        planningDepthHints: ["how deep planning should be based on extracted scope"],
        openQuestions: ["material ambiguity only"],
        evidence: ["short source quotes or paraphrases supporting the contract"],
      },
      null,
      2,
    ),
    "",
    answers ? `Settled PM answers:\n${answers}` : "",
    "",
    "Sources:",
    sourceBlocks || "No substantive source text was provided.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function normalizeProjectBoardLlmScopeContract(value: unknown): ProjectBoardScopeContract {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    included: normalizeLlmScopeFeatures(record.included),
    excluded: normalizeLlmScopeFeatures(record.excluded),
    requiredCapabilities: normalizeLlmScopeStrings(record.requiredCapabilities, 20, 500),
    supportingCapabilities: normalizeLlmScopeStrings(record.supportingCapabilities, 20, 500),
    optionalCapabilities: normalizeLlmScopeStrings(record.optionalCapabilities, 20, 500),
    excludedCapabilities: normalizeLlmScopeStrings(record.excludedCapabilities, 20, 500),
    planningDepth: normalizeLlmPlanningDepth(record.planningDepth),
    planningDepthHints: normalizeLlmScopeStrings(record.planningDepthHints, 12, 500),
    openQuestions: normalizeLlmScopeStrings(record.openQuestions, 12, 500),
    evidence: normalizeLlmScopeStrings(record.evidence, 20, 500),
  };
}

export const LLM_SCOPE_FEATURES = new Set<ProjectBoardScopeFeature>([
  "auth",
  "accounts",
  "analytics",
  "sync",
  "collaboration",
  "notifications",
  "backend",
  "payments",
  "deployment",
  "admin_reporting",
]);

export function normalizeLlmScopeFeatures(value: unknown): ProjectBoardScopeFeature[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ProjectBoardScopeFeature>();
  for (const item of value) {
    if (typeof item === "string" && LLM_SCOPE_FEATURES.has(item as ProjectBoardScopeFeature)) seen.add(item as ProjectBoardScopeFeature);
  }
  return [...seen];
}

export function normalizeLlmScopeStrings(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, maxLength))
    .slice(0, limit);
}

export function normalizeLlmPlanningDepth(value: unknown): ProjectBoardPlanningDepthAssessment | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const level = typeof record.level === "string" ? record.level.trim() : "";
  if (!isProjectBoardPlanningDepthLevel(level)) return undefined;
  const numericScore = typeof record.score === "number" ? record.score : Number(record.score);
  const score = Number.isFinite(numericScore) ? Math.max(0, Math.min(100, Math.round(numericScore))) : 35;
  const signals = normalizeLlmScopeStrings(record.signals, 12, 240);
  const guidance = typeof record.guidance === "string" && record.guidance.trim() ? record.guidance.trim().slice(0, 500) : "";
  return {
    score,
    level,
    signals,
    guidance: guidance || "Use planning depth appropriate to the extracted scope without expanding product scope.",
  };
}

export function isProjectBoardPlanningDepthLevel(value: string): value is ProjectBoardPlanningDepthLevel {
  return value === "shallow" || value === "standard" || value === "deep" || value === "phased";
}

function scopeContractPromptBudgetRunMetadata(input: {
  latestPromptCharCount: number;
  cumulativePromptCharCount: number;
  promptBudget: ProjectBoardPromptBudgetAssessment;
  plannerLedgerCompactionStatus?: "started" | "used" | "cache_hit" | "skipped";
  plannerLedgerCompactionSkipReason?: string;
}): Record<string, unknown> {
  const latestPromptCharCount = Math.max(0, Math.round(input.latestPromptCharCount));
  const cumulativePromptCharCount = Math.max(latestPromptCharCount, Math.round(input.cumulativePromptCharCount));
  return {
    latestPromptCharCount,
    cumulativePromptCharCount,
    latestEstimatedInputTokens: estimatedScopeContractInputTokensFromPromptChars(latestPromptCharCount),
    cumulativeEstimatedInputTokens: estimatedScopeContractInputTokensFromPromptChars(cumulativePromptCharCount),
    promptBudgetMetricMode: latestPromptCharCount === cumulativePromptCharCount ? "single_request" : "cumulative_run",
    promptBudgetAssessment: projectBoardPromptBudgetAssessmentMetadata(input.promptBudget),
    rawPromptBudgetAssessment: undefined,
    plannerLedgerCompactionStatus: input.plannerLedgerCompactionStatus,
    plannerLedgerCompactionSkipReason: input.plannerLedgerCompactionSkipReason,
  };
}

function estimatedScopeContractInputTokensFromPromptChars(charCount: number): number {
  return Math.max(1, Math.ceil(Math.max(0, charCount) / 4));
}

function normalizeScopeContractStreamIdleTimeoutMs(value: number | undefined): number {
  return Math.max(1, Math.floor(value ?? DEFAULT_SCOPE_CONTRACT_STREAM_IDLE_TIMEOUT_MS));
}
