import type { ThinkingLevel } from "@mariozechner/pi-ai";
import type {
  ProjectBoardPlanningDepthAssessment,
  ProjectBoardPmReviewReport,
  ProjectBoardScopeContract,
} from "../../shared/projectBoardTypes";
import { readAmbientEventStreamText } from "./projectBoardAmbientFacade";
import {
  projectBoardPromptBudgetAssessmentMetadata,
  type ProjectBoardModelBudgetProfile,
  type ProjectBoardPromptBudgetAssessment,
} from "./projectBoardModelBudgetProfile";
import type { ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import {
  extractProjectBoardProposalJsonlRecordsFromText,
  projectBoardSynthesisDraftFromProgressiveRecords,
  projectBoardProgressiveRecordsFromDraft,
} from "./projectBoardProgressivePlanning";
import type { ProjectBoardPlanningSection } from "./projectBoardSectionedPlanning";
import {
  appendProjectBoardPlannerWorkspaceRecords,
  markProjectBoardPlannerWorkspaceTailRecords,
  ProjectBoardPlannerWorkspace,
  ProjectBoardPlannerWorkspaceTailState,
} from "./projectBoardPlannerWorkspace";
import { projectBoardPlanningDepthFromScopeContract } from "./projectBoardPlanningContract";
import {
  normalizeProjectBoardSynthesisDraft,
  ProjectBoardSynthesisDraft,
  ProjectBoardSynthesisRefinementContext,
  ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";
import { isRetryableAmbientProviderError } from "./projectBoardAmbientFacade";
import {
  DEFAULT_PROJECT_BOARD_PLANNER_BATCH_LIMIT,
  DEFAULT_PROJECT_BOARD_SECTION_BATCH_CARD_LIMIT,
  errorMessage,
  parseProjectBoardSynthesisJson,
  type ProjectBoardPlannerLedgerCompactionTelemetry,
} from "./projectBoardSynthesisPlannerPrompts";
import {
  filterProjectBoardGeneratedCards,
  limitProjectBoardWorkflowDraft,
  removeFilteredDuplicateCandidateRecords,
  removeOmittedCandidateRecords,
  scopeContractFilterCountFromRecords,
} from "./projectBoardSynthesisProviderCandidateFilters";
import {
  assertValidClarificationQuestionDraft,
  assertValidProjectBoardGeneratedDraftTitles,
} from "./projectBoardSynthesisProviderValidation";
import type { PlannerLastValidRecord } from "./projectBoardSynthesisProviderPlannerProgress";
import { dedupeProgressiveRecords, recordsNotAlreadySeen } from "./projectBoardSynthesisProviderSectionRecords";

export {
  attachPlannerRecordSourceSnapshots,
  filterPlannerBatchRenderedCardDuplicates,
  isPlannerBatchStatus,
  limitPlannerBatchCandidateCardRecords,
  plannerBatchStatusFromResponse,
  previewProjectBoardPlannerResponse,
  renderedCardDuplicateMatch,
  safeParsePlannerBatchObject,
  type PlannerBatchRenderedDuplicateDiagnostic,
} from "./projectBoardSynthesisProviderPlannerRecords";

export {
  isRecoverablePlannerOutputStop,
  lastValidPlannerRecord,
  plannerBatchOperation,
  plannerBatchProgressRecord,
  plannerBatchValidationFailureRecords,
  plannerLedgerCompactionCachePayload,
  plannerLedgerCompactionProgressRecord,
  plannerLedgerCompactionTelemetryMetadata,
  plannerPauseProgressRecord,
  plannerPromptBudgetWarningRecord,
  plannerRecordId,
  sectionedContextCompactionProgressRecord,
  type PlannerLastValidRecord,
} from "./projectBoardSynthesisProviderPlannerProgress";

export {
  PROJECT_BOARD_SECTION_RETRY_LIMIT,
  PROJECT_BOARD_SECTION_SEMANTIC_IDLE_ERROR_CODE,
  ProjectBoardSectionNoRecordsError,
  buildProjectBoardSectionRetryPrompt,
  completedSectionIdsFromRecords,
  dedupeProgressiveRecords,
  isRetryableSectionArtifact,
  limitSectionCandidateCardRecords,
  normalizeSectionProgressiveRecords,
  projectBoardSectionFailureKind,
  recordsNotAlreadySeen,
  retryableSectionKeysFromRecords,
  retryableSectionResumeRecords,
  sectionFailureRecords,
  sectionRangeKeyForRecord,
  sectionRetryProgressRecord,
  sectionStatusProgressRecord,
  semanticIdleTimeoutMsFromMessage,
  shouldRetryProjectBoardSectionFailure,
  wholeBoardPlanningSection,
  type ProjectBoardSectionFailureKind,
} from "./projectBoardSynthesisProviderSectionRecords";

export {
  ProjectBoardDuplicateClarificationQuestionValidationError,
  ProjectBoardSettledClarificationValidationError,
  assertValidClarificationQuestionCandidates,
  assertValidClarificationQuestionDraft,
  assertValidClarificationQuestionRecords,
  assertValidProjectBoardGeneratedDraftTitles,
  assertValidProjectBoardGeneratedRecordTitles,
  cardTitleQualityValidationMetadata,
  dedupeClarificationQuestionCandidates,
  dedupeMirroredClarificationQuestionCandidates,
  duplicateClarificationQuestionValidationMetadata,
  projectBoardClarificationQuestionCandidatesFromDraft,
  projectBoardClarificationQuestionCandidatesFromRecords,
  settledClarificationValidationMetadata,
} from "./projectBoardSynthesisProviderValidation";

export {
  buildProjectBoardScopeContractPrompt,
  deriveProjectBoardScopeContractWithPi,
  isProjectBoardPlanningDepthLevel,
  LLM_SCOPE_FEATURES,
  normalizeLlmPlanningDepth,
  normalizeLlmScopeFeatures,
  normalizeLlmScopeStrings,
  normalizeProjectBoardLlmScopeContract,
} from "./projectBoardSynthesisProviderScopeContract";

export {
  additiveDuplicateMatch,
  additiveDuplicateWarningRecords,
  containmentScore,
  duplicateDiagnostic,
  filterAdditiveDuplicateCards,
  filterProjectBoardGeneratedCards,
  filterScopeContractCards,
  INTENT_STOP_WORDS,
  intentTextForCard,
  intentTokens,
  intersection,
  isAdditiveRefinement,
  limitProjectBoardWorkflowDraft,
  normalizeExactText,
  overlapScore,
  removeFilteredDuplicateCandidateRecords,
  removeOmittedCandidateRecords,
  scopeContractFilterCountFromRecords,
  sourceBasisTokens,
  stemIntentToken,
  tokenSet,
} from "./projectBoardSynthesisProviderCandidateFilters";
export type {
  AdditiveDuplicateDiagnostic,
  CandidateCardFilterDiagnostic,
  CandidateCardFilterResult,
  ProjectBoardWorkflowDraftLimitResult,
} from "./projectBoardSynthesisProviderCandidateFilters";

export interface AmbientProjectBoardSynthesisProgress {
  stage: "model_request" | "model_response" | "schema_validation";
  title: string;
  summary: string;
  metadata: Record<string, unknown>;
  promptCharCount?: number;
  responseCharCount?: number;
  cardCount?: number;
  questionCount?: number;
}

export function guardedWorkspaceIoTask(
  task: () => Promise<void>,
  state: { warned: boolean },
  onProgress?: (progress: AmbientProjectBoardSynthesisProgress) => void,
): () => Promise<void> {
  return async () => {
    try {
      await task();
    } catch (error) {
      // Workspace I/O failures must never abort the run: a rejected poll chain
      // silently stops every later import, surfaces as an unhandled rejection when the
      // model call throws first, and can abort a sectioned run from outside the
      // section retry machinery; a failed final-assembly append would discard an
      // already-complete draft. Mid-run appends that resume depends on (pause and
      // batch records) intentionally stay unguarded.
      const message = error instanceof Error ? error.message : String(error);
      if (state.warned) return;
      state.warned = true;
      onProgress?.({
        stage: "model_response",
        title: "Planner workspace unavailable",
        summary: `Reading or writing planner workspace records failed; planning continues from the model stream alone. (${message})`,
        metadata: { workspacePollError: true, error: message },
      });
    }
  };
}

export interface AmbientProjectBoardSynthesisTelemetry {
  promptCharCount: number;
  responseCharCount: number;
  requestDurationMs: number;
  cardCount: number;
  questionCount: number;
  progressiveRecordCount?: number;
  sectionCount?: number;
  plannerBatchCount?: number;
  batchCardLimit?: number;
  skippedSectionCount?: number;
  failedSectionCount?: number;
  semanticIdleSectionCount?: number;
  finishReason?: string;
  plannerBatchFinishReasons?: string[];
  recoverableOutputStopCount?: number;
  outputTokenBudget?: number;
  modelBudgetProfile?: ProjectBoardModelBudgetProfile;
  promptBudgetStatus?: ProjectBoardPromptBudgetAssessment["status"];
  promptBudgetWarningCount?: number;
  maxPromptBudgetUtilization?: number;
  lastPromptBudgetAssessment?: ProjectBoardPromptBudgetAssessment;
  plannerLedgerCompactionCount?: number;
  plannerLedgerCompactionCacheHitCount?: number;
  lastPlannerLedgerCompaction?: ProjectBoardPlannerLedgerCompactionTelemetry;
  lastValidRecordId?: string;
  lastValidRecordType?: string;
  paused?: boolean;
  pauseReason?: string;
  renderedCardDuplicateFilterCount?: number;
  scopeContractFilterCount?: number;
  partial?: boolean;
}

export interface AmbientProjectBoardSynthesisResult {
  draft: ProjectBoardSynthesisDraft;
  telemetry: AmbientProjectBoardSynthesisTelemetry;
  progressiveRecords?: ProposalJsonlRecordArtifact[];
  scopeContract?: ProjectBoardScopeContract;
  planningDepth?: ProjectBoardPlanningDepthAssessment;
}

export interface AmbientProjectBoardPmReviewResult {
  draft: ProjectBoardSynthesisDraft;
  reviewReport: ProjectBoardPmReviewReport;
  telemetry: AmbientProjectBoardSynthesisTelemetry;
}

export interface AmbientProjectBoardSynthesisProgressiveBatch {
  records: ProposalJsonlRecordArtifact[];
  section: ProjectBoardPlanningSection;
  sectionIndex: number;
  sectionCount: number;
  promptCharCount: number;
  responseCharCount: number;
  accumulatedRecordCount: number;
}

export type ProjectBoardPlannerTransportMode = "pi_session_stream" | "direct_chat_compat";

export interface AmbientProjectBoardSynthesisCallResult {
  text: string;
  finishReason?: string;
  stopReason?: string;
  usage?: unknown;
  outputTokenBudget?: number;
  outputChars: number;
  thinkingChars?: number;
  toolRound?: number;
}

export interface ProjectBoardSynthesisTransientRetryEvent {
  attempt: number;
  retryAttempt: number;
  maxAttempts: number;
  maxRetries: number;
  delayMs: number;
  error: string;
  outputChars: number;
  committedRecordCount: number;
  aggressive: boolean;
}

export const DEFAULT_PROJECT_BOARD_AMBIENT_STREAM_IDLE_TIMEOUT_MS = 120_000;
export const SHALLOW_PROJECT_BOARD_MAX_BATCHES = 1;
export const SHALLOW_PROJECT_BOARD_MAX_CARDS = 2;

export type ProjectBoardSynthesisReasoningEffort = "xhigh" | "high" | "medium" | "low" | "minimal" | "none";

export interface ProjectBoardSynthesisReasoningConfig {
  effort?: ProjectBoardSynthesisReasoningEffort;
  max_tokens?: number;
  exclude?: boolean;
  enabled?: boolean;
}

export type ProjectBoardSynthesisReasoning = false | ProjectBoardSynthesisReasoningConfig;

export interface ProjectBoardSynthesisPauseCheckInput {
  phase: "section" | "planner_batch";
  sectionIndex?: number;
  sectionCount?: number;
  batchNumber?: number;
  batchCount?: number;
  recordCount: number;
  lastValidRecord?: PlannerLastValidRecord;
}

export interface ProjectBoardWorkflowScopeLimits {
  compact: boolean;
  maxBatches: number;
  maxCardsPerBatch: number;
  maxCardsPerSection: number;
  maxSections: number;
  maxSectionChars: number;
  maxTotalCards: number;
  reason?: string;
}

export function projectBoardWorkflowScopeLimits(input: {
  scopeContract: ProjectBoardScopeContract;
  sources?: ProjectBoardSynthesisSource[];
}): ProjectBoardWorkflowScopeLimits {
  const planningDepth = projectBoardPlanningDepthFromScopeContract(input.scopeContract);
  const hints = input.scopeContract.planningDepthHints.join(" ");
  const compact =
    planningDepth.level === "shallow" &&
    input.scopeContract.included.length === 0 &&
    input.scopeContract.openQuestions.length === 0 &&
    /\b(small|simple|single[-\s]?action|single[-\s]?file|local|client[-\s]?side|utility|compact|lightweight)\b/i.test(hints);
  if (!compact) {
    return {
      compact: false,
      maxBatches: DEFAULT_PROJECT_BOARD_PLANNER_BATCH_LIMIT,
      maxCardsPerBatch: DEFAULT_PROJECT_BOARD_SECTION_BATCH_CARD_LIMIT,
      maxCardsPerSection: DEFAULT_PROJECT_BOARD_SECTION_BATCH_CARD_LIMIT,
      maxSections: 80,
      maxSectionChars: 8_000,
      maxTotalCards: Number.POSITIVE_INFINITY,
    };
  }
  return {
    compact: true,
    maxBatches: SHALLOW_PROJECT_BOARD_MAX_BATCHES,
    maxCardsPerBatch: SHALLOW_PROJECT_BOARD_MAX_CARDS,
    maxCardsPerSection: SHALLOW_PROJECT_BOARD_MAX_CARDS,
    maxSections: 1,
    maxSectionChars: 24_000,
    maxTotalCards: SHALLOW_PROJECT_BOARD_MAX_CARDS,
    reason: planningDepth.guidance,
  };
}

export interface AmbientChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string;
    finishReason?: string;
    delta?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: unknown[];
    };
    message?: {
      content?: string;
    };
    text?: string;
  }>;
  usage?: unknown;
}

export function normalizePlannerBatchRecords(
  responseText: string,
  fallback: { projectName?: string; sources: ProjectBoardSynthesisSource[]; batchWorkspaceRecordCount: number },
): ProposalJsonlRecordArtifact[] {
  const records = extractProjectBoardProposalJsonlRecordsFromText(responseText);
  if (records.length > 0) return dedupeProgressiveRecords(records.filter((record) => record.type !== "proposal_final"));
  if (fallback.batchWorkspaceRecordCount > 0) return [];
  return projectBoardProgressiveRecordsFromDraft({
    draft: normalizeProjectBoardSynthesisResponse(responseText, {
      projectName: fallback.projectName,
      sources: fallback.sources,
    }),
    sources: fallback.sources,
    includeProgress: false,
  }).filter((record) => record.type !== "proposal_final");
}

export function normalizeProjectBoardSynthesisResponse(
  responseText: string,
  fallback: { projectName?: string; sources: ProjectBoardSynthesisSource[] },
  options: { uxMockGate?: "auto" | "preserve" | "off" } = {},
): ProjectBoardSynthesisDraft {
  let parsed: unknown;
  try {
    parsed = parseProjectBoardSynthesisJson(responseText);
    return normalizeProjectBoardSynthesisDraft(parsed, options);
  } catch (error) {
    const records = extractProjectBoardProposalJsonlRecordsFromParsedValue(parsed);
    if (records.length > 0) {
      return projectBoardSynthesisDraftFromProgressiveRecords(records, {
        projectName: fallback.projectName,
        summary: "Recovered a board proposal from progressive planning records in the Ambient/Pi response.",
      });
    }
    const textRecords = extractProjectBoardProposalJsonlRecordsFromText(responseText);
    if (textRecords.length > 0) {
      return projectBoardSynthesisDraftFromProgressiveRecords(textRecords, {
        projectName: fallback.projectName,
        summary: "Recovered a board proposal from progressive planning JSONL in the Ambient/Pi response.",
      });
    }
    throw error;
  }
}

export function extractProjectBoardProposalJsonlRecordsFromParsedValue(parsed: unknown) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const record = parsed as Record<string, unknown>;
  const source = Array.isArray(record.progressiveRecords) ? record.progressiveRecords : Array.isArray(record.records) ? record.records : [];
  return extractProjectBoardProposalJsonlRecordsFromText(source.map((item) => JSON.stringify(item)).join("\n"));
}

export function projectBoardSynthesisReasoningPayload(reasoning: ProjectBoardSynthesisReasoning | undefined): Record<string, unknown> {
  if (reasoning === undefined) return {};
  if (reasoning === false) return { reasoning: { effort: "none", enabled: false, exclude: true } };
  const payload: ProjectBoardSynthesisReasoningConfig = {};
  if (reasoning.effort) payload.effort = reasoning.effort;
  if (Number.isFinite(reasoning.max_tokens)) payload.max_tokens = Math.max(0, Math.floor(Number(reasoning.max_tokens)));
  if (typeof reasoning.exclude === "boolean") payload.exclude = reasoning.exclude;
  if (typeof reasoning.enabled === "boolean") payload.enabled = reasoning.enabled;
  if (Object.keys(payload).length === 0) return {};
  return { reasoning: payload };
}

export function projectBoardPiTextReasoning(reasoning: ProjectBoardSynthesisReasoning | undefined): ThinkingLevel | false | undefined {
  if (reasoning === undefined) return undefined;
  if (reasoning === false) return false;
  if (reasoning.enabled === false || reasoning.effort === "none") return false;
  if (reasoning.effort) return reasoning.effort;
  return undefined;
}

export function lastCandidateTitle(records: ProposalJsonlRecordArtifact[]): string | undefined {
  return records.filter((record) => record.type === "candidate_card").at(-1)?.title;
}

export function lastQuestion(records: ProposalJsonlRecordArtifact[]): string | undefined {
  return records.filter((record) => record.type === "question").at(-1)?.question;
}

// Shared final-assembly stage for all three planning pipelines (legacy whole-board,
// sectioned, planner-batch). Filter -> scope-limit -> record retention -> durable
// append used to be copy-pasted per pipeline, and the copies drifted (pause support,
// coverage semantics, poll-queue handling were all divergence bugs).
export async function finalizeProjectBoardSynthesisDraft(input: {
  sourceDraft: ProjectBoardSynthesisDraft;
  surface: "legacy_full_synthesis" | "sectioned_synthesis" | "planner_batch_synthesis";
  sources: ProjectBoardSynthesisSource[];
  refinement?: ProjectBoardSynthesisRefinementContext;
  scopeContract: ProjectBoardScopeContract;
  workflowScopeLimits: ReturnType<typeof projectBoardWorkflowScopeLimits>;
  retainRecords: ProposalJsonlRecordArtifact[];
  priorRecords: ProposalJsonlRecordArtifact[];
  plannerWorkspace?: ProjectBoardPlannerWorkspace;
  workspaceTailState: ProjectBoardPlannerWorkspaceTailState;
  workspacePollErrorState: { warned: boolean };
  onProgress?: (progress: AmbientProjectBoardSynthesisProgress) => void;
  assertDraftValidity?: boolean;
}): Promise<{
  draft: ProjectBoardSynthesisDraft;
  finalRecords: ProposalJsonlRecordArtifact[];
  finalWorkspaceRecords: ProposalJsonlRecordArtifact[];
  scopeContractFilterCount: number;
}> {
  const filtered = filterProjectBoardGeneratedCards(input.sourceDraft, {
    sources: input.sources,
    refinement: input.refinement,
    scopeContract: input.scopeContract,
  });
  const scopedDraftLimit = limitProjectBoardWorkflowDraft(filtered.draft, input.workflowScopeLimits, input.surface);
  const draft = scopedDraftLimit.draft;
  const scopeContractFilterCount =
    scopeContractFilterCountFromRecords(filtered.warningRecords) + scopeContractFilterCountFromRecords(scopedDraftLimit.warningRecords);
  if (input.assertDraftValidity) {
    assertValidProjectBoardGeneratedDraftTitles(draft, { surface: input.surface });
    assertValidClarificationQuestionDraft(draft, input.refinement, { surface: input.surface });
  }
  const retainedRecords = removeOmittedCandidateRecords(
    removeFilteredDuplicateCandidateRecords(input.retainRecords, filtered.diagnostics),
    scopedDraftLimit.omittedCardIds,
  );
  const finalRecords = dedupeProgressiveRecords([
    ...retainedRecords,
    ...filtered.warningRecords,
    ...scopedDraftLimit.warningRecords,
    ...projectBoardProgressiveRecordsFromDraft({
      draft,
      sources: input.sources,
      includeProgress: false,
    }),
  ]);
  const finalWorkspaceRecords = recordsNotAlreadySeen(finalRecords, input.priorRecords);
  markProjectBoardPlannerWorkspaceTailRecords(input.workspaceTailState, finalWorkspaceRecords);
  await guardedWorkspaceIoTask(
    () => appendProjectBoardPlannerWorkspaceRecords(input.plannerWorkspace, finalWorkspaceRecords),
    input.workspacePollErrorState,
    input.onProgress,
  )();
  return { draft, finalRecords, finalWorkspaceRecords, scopeContractFilterCount };
}

export function pmReviewActivationTelemetryMetadata(report?: ProjectBoardPmReviewReport): Record<string, unknown> {
  if (!report) return {};
  return {
    pmReviewActivation: true,
    pmReviewReadiness: report.readiness,
    pmReviewSourceConfidence: report.sourceConfidence,
    pmReviewGitState: report.gitState,
    pmReviewBlockingQuestionCount: report.blockingQuestions.length,
    pmReviewRiskCount: report.risks.length,
    pmReviewSourceConflictCount: report.sourceConflicts.length,
    pmReviewConstraintCount: report.cardGenerationConstraints.length,
  };
}

export function projectBoardPromptBudgetRunMetadata(input: {
  latestPromptCharCount: number;
  cumulativePromptCharCount: number;
  promptBudget: ProjectBoardPromptBudgetAssessment;
  rawPromptBudget?: ProjectBoardPromptBudgetAssessment;
  plannerLedgerCompactionStatus?: "started" | "used" | "cache_hit" | "skipped";
  plannerLedgerCompactionSkipReason?: string;
}): Record<string, unknown> {
  const latestPromptCharCount = Math.max(0, Math.round(input.latestPromptCharCount));
  const cumulativePromptCharCount = Math.max(latestPromptCharCount, Math.round(input.cumulativePromptCharCount));
  return {
    latestPromptCharCount,
    cumulativePromptCharCount,
    latestEstimatedInputTokens: projectBoardEstimatedInputTokensFromPromptChars(latestPromptCharCount),
    cumulativeEstimatedInputTokens: projectBoardEstimatedInputTokensFromPromptChars(cumulativePromptCharCount),
    promptBudgetMetricMode: latestPromptCharCount === cumulativePromptCharCount ? "single_request" : "cumulative_run",
    promptBudgetAssessment: projectBoardPromptBudgetAssessmentMetadata(input.promptBudget),
    rawPromptBudgetAssessment: input.rawPromptBudget ? projectBoardPromptBudgetAssessmentMetadata(input.rawPromptBudget) : undefined,
    plannerLedgerCompactionStatus: input.plannerLedgerCompactionStatus,
    plannerLedgerCompactionSkipReason: input.plannerLedgerCompactionSkipReason,
  };
}

export function projectBoardEstimatedInputTokensFromPromptChars(charCount: number): number {
  return Math.max(1, Math.ceil(Math.max(0, charCount) / 4));
}

export async function readAmbientChatCompletionResult(
  response: Response,
  onChunk?: (responseCharCount: number) => void,
  options: {
    streamIdleTimeoutMs?: number;
    contentIdleTimeoutMs?: number;
    contentActivityToken?: () => unknown;
    outputTokenBudget?: number;
    signal?: AbortSignal;
  } = {},
): Promise<AmbientProjectBoardSynthesisCallResult> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const payload = (await response.json()) as AmbientChatCompletionResponse;
    const text = payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text ?? "";
    const metadata = ambientChatCompletionPayloadMetadata(payload);
    return {
      text,
      finishReason: metadata.finishReason,
      usage: metadata.usage,
      outputTokenBudget: options.outputTokenBudget,
      outputChars: text.length,
    };
  }

  if (!response.body) return { text: "", outputTokenBudget: options.outputTokenBudget, outputChars: 0 };
  const streamIdleTimeoutMs = normalizeAmbientStreamIdleTimeoutMs(options.streamIdleTimeoutMs);
  const contentIdleTimeoutMs = normalizeAmbientStreamIdleTimeoutMs(options.contentIdleTimeoutMs ?? options.streamIdleTimeoutMs);
  let finishReason: string | undefined;
  let usage: unknown;
  const text = await readAmbientEventStreamText(response.body, {
    idleTimeoutMs: streamIdleTimeoutMs,
    contentIdleTimeoutMs,
    signal: options.signal,
    contentActivityToken: options.contentActivityToken,
    onPayload: (payload) => {
      const metadata = ambientChatCompletionPayloadMetadata(payload);
      if (metadata.finishReason) finishReason = metadata.finishReason;
      if (metadata.usage !== undefined) usage = metadata.usage;
    },
    onText: (_text, responseCharCount) => onChunk?.(responseCharCount),
    stalledMessage: ({ idleTimeoutMs, responseCharCount }) =>
      `Ambient project-board synthesis stream stalled after ${idleTimeoutMs.toLocaleString()}ms without streaming events ` +
      `(${responseCharCount.toLocaleString()} response characters received).`,
    contentStalledMessage: ({ contentIdleTimeoutMs, responseCharCount }) =>
      `Ambient project-board synthesis stream stalled after ${contentIdleTimeoutMs.toLocaleString()}ms without model content ` +
      `or planner records (${responseCharCount.toLocaleString()} response characters received).`,
  });
  return {
    text,
    finishReason,
    usage,
    outputTokenBudget: options.outputTokenBudget,
    outputChars: text.length,
  };
}

export function ambientChatCompletionPayloadMetadata(payload: unknown): { finishReason?: string; usage?: unknown } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const record = payload as { choices?: unknown; usage?: unknown };
  const choices = Array.isArray(record.choices) ? record.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) continue;
    const choiceRecord = choice as { finish_reason?: unknown; finishReason?: unknown; stop_reason?: unknown; stopReason?: unknown };
    const finishReason =
      stringValue(choiceRecord.finish_reason) ??
      stringValue(choiceRecord.finishReason) ??
      stringValue(choiceRecord.stop_reason) ??
      stringValue(choiceRecord.stopReason);
    if (finishReason) return { finishReason, ...(record.usage === undefined ? {} : { usage: record.usage }) };
  }
  return record.usage === undefined ? {} : { usage: record.usage };
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function projectBoardSynthesisTransientAttemptCount(): number {
  const configured = Number(process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS || 3);
  if (!Number.isFinite(configured)) return 3;
  return Math.max(1, Math.min(5, Math.floor(configured)));
}

export function projectBoardSynthesisTransientRetryDelayMs(attempt: number): number {
  const baseDelayMs = Number(process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_RETRY_DELAY_MS || 5_000);
  const normalizedBaseDelayMs = Number.isFinite(baseDelayMs) ? Math.max(0, Math.floor(baseDelayMs)) : 5_000;
  return normalizedBaseDelayMs * attempt;
}

export function shouldRetryProjectBoardSynthesisTransient(
  error: unknown,
  input: {
    attempt: number;
    maxAttempts: number;
    outputChars: number;
    committedRecordCount?: number;
    aggressive?: boolean;
    signal?: AbortSignal;
  },
): boolean {
  if (input.signal?.aborted) return false;
  if (input.attempt >= input.maxAttempts) return false;
  if (input.outputChars > 0) return false;
  if ((input.committedRecordCount ?? 0) > 0) return false;
  return input.aggressive ? isRetryableAmbientProviderError(error) : isTransientProjectBoardSynthesisError(error);
}

export function isTransientProjectBoardSynthesisError(error: unknown): boolean {
  const message = errorMessage(error);
  return /\b(?:408|409|425|429|500|502|503|504)\b|rate limit|temporar|try again|timeout|timed out|upstream|econnreset|socket hang up/i.test(
    message,
  );
}

export function delayProjectBoardSynthesisRetry(ms: number, signal?: AbortSignal): Promise<void> {
  const delayMs = Math.max(0, Math.floor(ms));
  if (delayMs === 0) {
    if (signal?.aborted)
      return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error("Project-board synthesis retry canceled."));
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("Project-board synthesis retry canceled."));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function fetchAmbientProjectBoardSynthesisResponse(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  streamIdleTimeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutError = new Error(
    `Ambient project-board synthesis request stalled before streaming began after ${streamIdleTimeoutMs.toLocaleString()}ms.`,
  );
  const abortWithSignal = () => {
    const reason = signal?.reason;
    controller.abort(reason instanceof Error ? reason : new Error("Ambient project-board synthesis request canceled."));
  };
  let rejectTimeout: ((reason?: unknown) => void) | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    rejectTimeout = reject;
  });
  const timeout = setTimeout(() => {
    controller.abort(timeoutError);
    rejectTimeout?.(timeoutError);
  }, streamIdleTimeoutMs);
  try {
    if (signal?.aborted) abortWithSignal();
    else signal?.addEventListener("abort", abortWithSignal, { once: true });
    const request = fetchImpl(url, { ...init, signal: controller.signal });
    return await Promise.race([request, timeoutPromise]);
  } catch (error) {
    if (error === timeoutError || controller.signal.reason === timeoutError) throw timeoutError;
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    signal?.removeEventListener("abort", abortWithSignal);
  }
}

export function normalizeAmbientStreamIdleTimeoutMs(value: number | undefined): number {
  return Math.max(1, Math.floor(value ?? DEFAULT_PROJECT_BOARD_AMBIENT_STREAM_IDLE_TIMEOUT_MS));
}

export function normalizeProjectBoardSynthesisMaxToolRounds(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 3;
  return Math.max(0, Math.min(8, Math.floor(value)));
}

export function projectBoardWorkspacePollIntervalMs(streamIdleTimeoutMs: number | undefined): number {
  const idleTimeoutMs = normalizeAmbientStreamIdleTimeoutMs(streamIdleTimeoutMs);
  return Math.max(25, Math.min(5_000, Math.floor(idleTimeoutMs / 3)));
}
