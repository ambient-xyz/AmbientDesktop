import { normalizeAmbientModelId } from "../../shared/ambientModels";

export type ProjectBoardModelBudgetOperation =
  | "legacy_full_synthesis"
  | "charter_review"
  | "section_elaboration"
  | "planner_card_batch"
  | "planner_ledger_compaction"
  | "planner_source_qa";

export interface ProjectBoardModelBudgetProfile {
  operation: ProjectBoardModelBudgetOperation;
  modelId: string;
  contextWindowTokens: number;
  modelMaxOutputTokens: number;
  maxOutputTokens: number;
  softPromptBudgetTokens: number;
  outputReserveTokens: number;
  summarizationThresholdTokens: number;
  maxCardsPerBatch?: number;
  source: "default" | "env_override";
  overrideKey?: string;
}

export type ProjectBoardPromptBudgetStatus =
  | "within_budget"
  | "summarization_recommended"
  | "soft_prompt_budget_exceeded"
  | "context_budget_exceeded";

export type ProjectBoardPromptBudgetAction =
  | "continue"
  | "use_ledgers_and_retrieval"
  | "summarize_before_call"
  | "reduce_prompt_before_call";

export interface ProjectBoardPromptBudgetAssessment {
  operation: ProjectBoardModelBudgetOperation;
  modelId: string;
  promptCharCount: number;
  estimatedPromptTokens: number;
  tokenEstimateMethod: "chars_div_4";
  contextWindowTokens: number;
  outputReserveTokens: number;
  softPromptBudgetTokens: number;
  summarizationThresholdTokens: number;
  softPromptBudgetUtilization: number;
  contextWindowUtilization: number;
  status: ProjectBoardPromptBudgetStatus;
  recommendedAction: ProjectBoardPromptBudgetAction;
  summarizationRecommended: boolean;
  softPromptBudgetExceeded: boolean;
  contextWindowExceeded: boolean;
}

const GLM_5_FP8_CONTEXT_TOKENS = 202_752;
const GLM_5_FP8_MAX_OUTPUT_TOKENS = 202_752;
const GLM_5_FP8_PLANNER_BATCH_SOFT_PROMPT_TOKENS = 48_000;
const GLM_5_FP8_PLANNER_BATCH_SUMMARIZATION_THRESHOLD_TOKENS = 36_000;
const DEFAULT_CONTEXT_TOKENS = 64_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;

const OPERATION_OUTPUT_ENV: Record<ProjectBoardModelBudgetOperation, string> = {
  legacy_full_synthesis: "AMBIENT_PROJECT_BOARD_SYNTHESIS_MAX_OUTPUT_TOKENS",
  charter_review: "AMBIENT_PROJECT_BOARD_CHARTER_REVIEW_MAX_OUTPUT_TOKENS",
  section_elaboration: "AMBIENT_PROJECT_BOARD_SECTION_MAX_OUTPUT_TOKENS",
  planner_card_batch: "AMBIENT_PROJECT_BOARD_PLANNER_BATCH_MAX_OUTPUT_TOKENS",
  planner_ledger_compaction: "AMBIENT_PROJECT_BOARD_LEDGER_COMPACTION_MAX_OUTPUT_TOKENS",
  planner_source_qa: "AMBIENT_PROJECT_BOARD_SOURCE_QA_MAX_OUTPUT_TOKENS",
};

export function projectBoardModelBudgetProfile(input: {
  model: string;
  operation: ProjectBoardModelBudgetOperation;
  maxCardsPerBatch?: number;
  env?: Record<string, string | undefined>;
}): ProjectBoardModelBudgetProfile {
  const env = input.env ?? process.env;
  const modelId = normalizeAmbientModelId(input.model);
  const modelLimits = projectBoardModelLimits(modelId);
  const defaultMaxOutputTokens = defaultOperationOutputTokens(input.operation, input.maxCardsPerBatch);
  const override = modelBudgetOutputOverride(input.operation, env);
  const maxOutputTokens = clampTokenBudget(override?.value ?? defaultMaxOutputTokens, {
    min: 256,
    max: modelLimits.maxOutputTokens,
  });
  const outputReserveTokens = Math.max(maxOutputTokens, Math.min(modelLimits.maxOutputTokens, 4_000));
  const defaultSoftPromptBudgetTokens = Math.max(1_024, Math.floor(modelLimits.contextWindowTokens * 0.6) - outputReserveTokens);
  const softPromptBudgetTokens = calibratedSoftPromptBudgetTokens({
    operation: input.operation,
    modelId,
    defaultSoftPromptBudgetTokens,
  });
  const summarizationThresholdTokens = calibratedSummarizationThresholdTokens({
    operation: input.operation,
    modelId,
    softPromptBudgetTokens,
  });
  return {
    operation: input.operation,
    modelId,
    contextWindowTokens: modelLimits.contextWindowTokens,
    modelMaxOutputTokens: modelLimits.maxOutputTokens,
    maxOutputTokens,
    softPromptBudgetTokens,
    outputReserveTokens,
    summarizationThresholdTokens,
    ...(input.maxCardsPerBatch ? { maxCardsPerBatch: input.maxCardsPerBatch } : {}),
    source: override ? "env_override" : "default",
    ...(override ? { overrideKey: override.key } : {}),
  };
}

export function projectBoardModelBudgetProfileMetadata(profile: ProjectBoardModelBudgetProfile): Record<string, unknown> {
  return {
    operation: profile.operation,
    modelId: profile.modelId,
    contextWindowTokens: profile.contextWindowTokens,
    modelMaxOutputTokens: profile.modelMaxOutputTokens,
    maxOutputTokens: profile.maxOutputTokens,
    softPromptBudgetTokens: profile.softPromptBudgetTokens,
    outputReserveTokens: profile.outputReserveTokens,
    summarizationThresholdTokens: profile.summarizationThresholdTokens,
    maxCardsPerBatch: profile.maxCardsPerBatch,
    source: profile.source,
    overrideKey: profile.overrideKey,
  };
}

export function projectBoardPromptBudgetAssessment(input: {
  promptCharCount: number;
  profile: ProjectBoardModelBudgetProfile;
}): ProjectBoardPromptBudgetAssessment {
  const promptCharCount = Math.max(0, Math.floor(input.promptCharCount));
  const estimatedPromptTokens = Math.max(1, Math.ceil(promptCharCount / 4));
  const softPromptBudgetExceeded = estimatedPromptTokens > input.profile.softPromptBudgetTokens;
  const summarizationRecommended = estimatedPromptTokens >= input.profile.summarizationThresholdTokens;
  const contextWindowExceeded = estimatedPromptTokens + input.profile.outputReserveTokens > input.profile.contextWindowTokens;
  const status: ProjectBoardPromptBudgetStatus = contextWindowExceeded
    ? "context_budget_exceeded"
    : softPromptBudgetExceeded
      ? "soft_prompt_budget_exceeded"
      : summarizationRecommended
        ? "summarization_recommended"
        : "within_budget";
  const recommendedAction: ProjectBoardPromptBudgetAction =
    status === "context_budget_exceeded"
      ? "reduce_prompt_before_call"
      : status === "soft_prompt_budget_exceeded"
        ? "summarize_before_call"
        : status === "summarization_recommended"
          ? "use_ledgers_and_retrieval"
          : "continue";
  return {
    operation: input.profile.operation,
    modelId: input.profile.modelId,
    promptCharCount,
    estimatedPromptTokens,
    tokenEstimateMethod: "chars_div_4",
    contextWindowTokens: input.profile.contextWindowTokens,
    outputReserveTokens: input.profile.outputReserveTokens,
    softPromptBudgetTokens: input.profile.softPromptBudgetTokens,
    summarizationThresholdTokens: input.profile.summarizationThresholdTokens,
    softPromptBudgetUtilization: ratio(estimatedPromptTokens, input.profile.softPromptBudgetTokens),
    contextWindowUtilization: ratio(estimatedPromptTokens + input.profile.outputReserveTokens, input.profile.contextWindowTokens),
    status,
    recommendedAction,
    summarizationRecommended,
    softPromptBudgetExceeded,
    contextWindowExceeded,
  };
}

export function projectBoardPromptBudgetAssessmentMetadata(assessment: ProjectBoardPromptBudgetAssessment): Record<string, unknown> {
  return {
    operation: assessment.operation,
    modelId: assessment.modelId,
    promptCharCount: assessment.promptCharCount,
    estimatedPromptTokens: assessment.estimatedPromptTokens,
    tokenEstimateMethod: assessment.tokenEstimateMethod,
    contextWindowTokens: assessment.contextWindowTokens,
    outputReserveTokens: assessment.outputReserveTokens,
    softPromptBudgetTokens: assessment.softPromptBudgetTokens,
    summarizationThresholdTokens: assessment.summarizationThresholdTokens,
    softPromptBudgetUtilization: assessment.softPromptBudgetUtilization,
    contextWindowUtilization: assessment.contextWindowUtilization,
    status: assessment.status,
    recommendedAction: assessment.recommendedAction,
    summarizationRecommended: assessment.summarizationRecommended,
    softPromptBudgetExceeded: assessment.softPromptBudgetExceeded,
    contextWindowExceeded: assessment.contextWindowExceeded,
  };
}

function projectBoardModelLimits(modelId: string): { contextWindowTokens: number; maxOutputTokens: number } {
  if (isGlm5Fp8Model(modelId)) {
    return { contextWindowTokens: GLM_5_FP8_CONTEXT_TOKENS, maxOutputTokens: GLM_5_FP8_MAX_OUTPUT_TOKENS };
  }
  return { contextWindowTokens: DEFAULT_CONTEXT_TOKENS, maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS };
}

function defaultOperationOutputTokens(operation: ProjectBoardModelBudgetOperation, maxCardsPerBatch?: number): number {
  if (operation === "legacy_full_synthesis") return 12_000;
  if (operation === "charter_review") return 2_400;
  if (operation === "section_elaboration") return 6_000;
  if (operation === "planner_ledger_compaction") return 1_800;
  if (operation === "planner_source_qa") return 1_200;
  const cardCount = Math.max(1, Math.floor(maxCardsPerBatch ?? 3));
  return clampTokenBudget(cardCount * 2_400, { min: 4_800, max: 9_600 });
}

function calibratedSoftPromptBudgetTokens(input: {
  operation: ProjectBoardModelBudgetOperation;
  modelId: string;
  defaultSoftPromptBudgetTokens: number;
}): number {
  if (input.operation === "planner_card_batch" && isGlm5Fp8Model(input.modelId)) {
    return Math.min(input.defaultSoftPromptBudgetTokens, GLM_5_FP8_PLANNER_BATCH_SOFT_PROMPT_TOKENS);
  }
  return input.defaultSoftPromptBudgetTokens;
}

function calibratedSummarizationThresholdTokens(input: {
  operation: ProjectBoardModelBudgetOperation;
  modelId: string;
  softPromptBudgetTokens: number;
}): number {
  if (input.operation === "planner_card_batch" && isGlm5Fp8Model(input.modelId)) {
    return Math.min(input.softPromptBudgetTokens, GLM_5_FP8_PLANNER_BATCH_SUMMARIZATION_THRESHOLD_TOKENS);
  }
  return Math.max(1_024, Math.floor(input.softPromptBudgetTokens * 0.85));
}

function isGlm5Fp8Model(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return (
    normalized.includes("glm-5.1") ||
    normalized.includes("glm_5.1") ||
    normalized.includes("glm5.1") ||
    normalized.includes("glm-5.2") ||
    normalized.includes("glm_5.2") ||
    normalized.includes("glm5.2")
  );
}

function modelBudgetOutputOverride(
  operation: ProjectBoardModelBudgetOperation,
  env: Record<string, string | undefined>,
): { key: string; value: number } | undefined {
  const operationKey = OPERATION_OUTPUT_ENV[operation];
  const operationValue = positiveIntegerEnv(env[operationKey]);
  if (operationValue !== undefined) return { key: operationKey, value: operationValue };
  const globalKey = "AMBIENT_PROJECT_BOARD_MAX_OUTPUT_TOKENS";
  const globalValue = positiveIntegerEnv(env[globalKey]);
  return globalValue === undefined ? undefined : { key: globalKey, value: globalValue };
}

function positiveIntegerEnv(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function clampTokenBudget(value: number, bounds: { min: number; max: number }): number {
  return Math.min(bounds.max, Math.max(bounds.min, Math.floor(value)));
}

function ratio(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}
