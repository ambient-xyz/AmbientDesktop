import type { ThinkingLevel } from "@mariozechner/pi-ai";
import { normalizeAmbientModelId } from "../shared/ambientModels";
import type {
  ProjectBoardCharterProjectSummary,
  ProjectBoardPlanningDepthAssessment,
  ProjectBoardPlanningDepthLevel,
  ProjectBoardPmReviewReport,
  ProjectBoardRenderedCardLedgerEntry,
  ProjectBoardScopeContract,
  ProjectBoardScopeFeature,
} from "../shared/types";
import { readAmbientEventStreamText } from "./ambientStreamTransport";
import { readAmbientApiKey } from "./credentialStore";
import { normalizeAmbientBaseUrl } from "./providerStatus";
import {
  projectBoardModelBudgetProfile,
  projectBoardModelBudgetProfileMetadata,
  projectBoardPromptBudgetAssessment,
  projectBoardPromptBudgetAssessmentMetadata,
  type ProjectBoardModelBudgetProfile,
  type ProjectBoardPromptBudgetAssessment,
} from "./projectBoardModelBudgetProfile";
import { stableBoardArtifactId, validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import {
  extractProjectBoardProposalJsonlRecordsFromText,
  extractProjectBoardProposalJsonlRecordsWithDiagnostics,
  projectBoardSynthesisDraftFromProgressiveRecords,
  projectBoardProgressiveRecordsFromDraft,
} from "./projectBoardProgressivePlanning";
import {
  projectBoardPlanningSectionPlanFromSources,
  projectBoardPlanningSectionsFromSources,
  type ProjectBoardPlanningSection,
  type ProjectBoardPlanningSectionOptions,
} from "./projectBoardSectionedPlanning";
import {
  PROJECT_BOARD_PLANNER_CANDIDATE_STATUS_RULE,
  PROJECT_BOARD_PLANNER_JSON_ONLY_RULE,
  PROJECT_BOARD_PLANNER_LAMBDA_RLM_RULE,
  projectBoardPlannerCandidateCardPromptExample,
  projectBoardPlannerClarificationContractPromptRules,
  projectBoardPlannerPmReviewActivationPromptBlock,
  projectBoardPlannerProofExpectationPromptRules,
  projectBoardPlannerScopeCapabilityPromptRules,
} from "./projectBoardPlannerPromptContracts";
import {
  appendProjectBoardPlannerWorkspaceRecords,
  createProjectBoardPlannerWorkspaceTailState,
  markProjectBoardPlannerWorkspaceTailRecords,
  pollProjectBoardPlannerWorkspaceRecords,
  projectBoardPlannerWorkspacePromptBlock,
  type ProjectBoardPlannerWorkspace,
  type ProjectBoardPlannerWorkspaceTailState,
} from "./projectBoardPlannerWorkspace";
import {
  projectBoardPlannerToolProgressToRecord,
  projectBoardPlannerWorkspaceToolExecutor,
  projectBoardPlannerWorkspaceToolPromptBlock,
  type ProjectBoardPlannerSourceQaAnswerInput,
  type ProjectBoardPlannerSourceQaAnswerResult,
  type ProjectBoardPlannerSourceQaAnswerer,
} from "./projectBoardPlannerWorkspaceTools";
import type { ProjectBoardPlannerBatchContinuation } from "./projectBoardPlannerContinuation";
import {
  buildProjectBoardPlanningContract,
  mergeProjectBoardScopeContracts,
  projectBoardPlanningDepthFromScopeContract,
  projectBoardScopeContractFromTexts,
  type ProjectBoardPlanningOperation,
  type ProjectBoardPlanningProfileName,
} from "./projectBoardPlanningContract";
import { projectBoardProofScopeWarningRecords } from "./projectBoardProofScope";
import { buildProjectBoardRenderedCardLedger } from "./projectBoardRenderedCardLedger";
import { projectBoardQuestionsAreNearDuplicates } from "../shared/projectBoardQuestionDedupe";
import { projectBoardSourceIncludedInSynthesis } from "./projectBoardSourceIdentity";
import {
  buildProjectBoardPmReviewReportPrompt,
  buildProjectBoardSynthesisPrompt,
  normalizeProjectBoardPmReviewReport,
  normalizeProjectBoardSynthesisDraft,
  assertProjectBoardCardTitleQuality,
  projectBoardCardTitleQualityPromptRules,
  projectBoardDuplicateClarificationQuestionViolations,
  projectBoardSettledClarificationReopenViolations,
  projectBoardSettledClarificationDecisionLedgerPromptBlock,
  projectBoardScopeContractTexts,
  ProjectBoardCardTitleQualityValidationError,
  projectBoardSynthesisDraftFromPmReviewReport,
  synthesizeProjectBoardDraft,
  isAdditiveProjectBoardRefinement,
  type ProjectBoardSynthesisCardInput,
  type ProjectBoardDuplicateClarificationQuestionViolation,
  type ProjectBoardClarificationQuestionCandidate,
  type ProjectBoardPmReviewGitContext,
  type ProjectBoardSettledClarificationReopenViolation,
  type ProjectBoardSynthesisDraft,
  type ProjectBoardSynthesisRefinementContext,
  type ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";
import {
  AmbientStreamFailureError,
  isRetryableAmbientProviderError,
  retryDelayForAttempt,
  type AmbientRetryPolicy,
} from "./aggressiveRetries";
import { callWorkflowPiText, type WorkflowPiCompletionMetadata, type WorkflowPiProgress } from "./workflowPiTransport";

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

function guardedWorkspaceIoTask(
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

interface AmbientProjectBoardSynthesisCallResult {
  text: string;
  finishReason?: string;
  stopReason?: string;
  usage?: unknown;
  outputTokenBudget?: number;
  outputChars: number;
  thinkingChars?: number;
  toolRound?: number;
}

interface ProjectBoardSynthesisTransientRetryEvent {
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

const DEFAULT_PROJECT_BOARD_AMBIENT_STREAM_IDLE_TIMEOUT_MS = 120_000;
const DEFAULT_PROJECT_BOARD_SECTION_BATCH_CARD_LIMIT = 3;
const DEFAULT_PROJECT_BOARD_PLANNER_BATCH_LIMIT = 8;
const SHALLOW_PROJECT_BOARD_MAX_BATCHES = 1;
const SHALLOW_PROJECT_BOARD_MAX_CARDS = 2;
const PROJECT_BOARD_SECTION_SEMANTIC_IDLE_ERROR_CODE = "section_semantic_idle_timeout";
const PROJECT_BOARD_SECTION_RETRY_LIMIT = 2;

export type ProjectBoardSynthesisReasoningEffort = "xhigh" | "high" | "medium" | "low" | "minimal" | "none";

export interface ProjectBoardSynthesisReasoningConfig {
  effort?: ProjectBoardSynthesisReasoningEffort;
  max_tokens?: number;
  exclude?: boolean;
  enabled?: boolean;
}

export type ProjectBoardSynthesisReasoning = false | ProjectBoardSynthesisReasoningConfig;

interface PlannerLastValidRecord {
  recordType: ProposalJsonlRecordArtifact["type"];
  recordId: string;
  recordIndex: number;
}

interface ProjectBoardSynthesisPauseCheckInput {
  phase: "section" | "planner_batch";
  sectionIndex?: number;
  sectionCount?: number;
  batchNumber?: number;
  batchCount?: number;
  recordCount: number;
  lastValidRecord?: PlannerLastValidRecord;
}

interface ProjectBoardWorkflowScopeLimits {
  compact: boolean;
  maxBatches: number;
  maxCardsPerBatch: number;
  maxCardsPerSection: number;
  maxSections: number;
  maxSectionChars: number;
  maxTotalCards: number;
  reason?: string;
}

class ProjectBoardSectionNoRecordsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectBoardSectionNoRecordsError";
  }
}

function projectBoardWorkflowScopeLimits(input: {
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

export interface ProjectBoardPlannerLedgerCompactionTelemetry {
  source: "pi_rlm" | "deterministic_fallback";
  cacheKey: string;
  cacheHit: boolean;
  summary: string;
  renderedCardCount: number;
  omittedRenderedCardCount: number;
  sourceCount: number;
  openQuestionCount: number;
  promptCharCount: number;
  responseCharCount: number;
  rawPromptBudgetStatus: ProjectBoardPromptBudgetAssessment["status"];
  finalPromptCharCount?: number;
  error?: string;
}

interface ProjectBoardPlannerLedgerCompaction extends ProjectBoardPlannerLedgerCompactionTelemetry {
  renderedCardThemes: string[];
  duplicateAvoidanceNotes: string[];
  remainingCoverage: Array<{ sourceId: string; title?: string; status?: string; summary?: string }>;
  openQuestions: Array<{ questionId: string; cardId?: string; question: string }>;
  dependencyHints: string[];
  citations: string[];
  recentRenderedCards: Array<{ cardId: string; title: string; phase?: string; candidateStatus?: string }>;
}

type ProjectBoardSectionedContextCompactionReason =
  | "section_prompt_budget"
  | "cumulative_prompt_budget"
  | "section_count_threshold"
  | "repeated_stable_context"
  | "durable_plan_source_authority";

interface AmbientChatCompletionResponse {
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

export class AmbientProjectBoardSynthesisProvider {
  constructor(
    private readonly input: {
      model: string;
      apiKey?: string;
      baseUrl?: string;
      fetchImpl?: typeof fetch;
      piTextCall?: typeof callWorkflowPiText;
      streamIdleTimeoutMs?: number;
      maxToolRounds?: number;
      reasoning?: ProjectBoardSynthesisReasoning;
      retryPolicy?: AmbientRetryPolicy;
      waitForRetry?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
    },
  ) {}

  async synthesize(input: {
    sources: ProjectBoardSynthesisSource[];
    projectName?: string;
    refinement?: ProjectBoardSynthesisRefinementContext;
    charterProjectSummary?: ProjectBoardCharterProjectSummary;
    signal?: AbortSignal;
  }): Promise<ProjectBoardSynthesisDraft> {
    const result = await this.synthesizeWithTelemetry(input);
    return result.draft;
  }

  async reviewCharterWithTelemetry(input: {
    sources: ProjectBoardSynthesisSource[];
    projectName?: string;
    refinement?: ProjectBoardSynthesisRefinementContext;
    charterProjectSummary?: ProjectBoardCharterProjectSummary;
    gitContext?: ProjectBoardPmReviewGitContext;
    onProgress?: (progress: AmbientProjectBoardSynthesisProgress) => void;
    plannerWorkspace?: ProjectBoardPlannerWorkspace;
    signal?: AbortSignal;
  }): Promise<AmbientProjectBoardPmReviewResult> {
    const apiKey = (this.input.apiKey ?? readAmbientApiKey() ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const deterministicDraft = synthesizeProjectBoardDraft(input.sources);
    const scopeContract = projectBoardScopeContractFromTexts(projectBoardScopeContractTexts({ sources: input.sources, refinement: input.refinement }));
    const prompt = buildProjectBoardPmReviewReportPrompt({
      sources: input.sources,
      projectName: input.projectName,
      deterministicDraft,
      refinement: input.refinement,
      ...(input.charterProjectSummary ? { charterProjectSummary: input.charterProjectSummary } : {}),
      ...(input.gitContext ? { gitContext: input.gitContext } : {}),
    });
    const contract = buildProjectBoardPlanningContract({
      operation: "charter_review",
      projectName: input.projectName,
      profileName: inferPlanningProfileName(input.sources),
      charter: {
        goal: input.refinement?.previousDraft.goal ?? deterministicDraft.goal,
        proofPolicy: input.refinement?.previousDraft.qualityBar ?? deterministicDraft.qualityBar,
        decisionPolicy: input.refinement
          ? "Treat supplied kickoff, charter, and PM Review answers as settled unless they are incomplete or contradictory."
          : "Review kickoff/charter readiness without generating proposal cards.",
        ...(input.charterProjectSummary ? { projectSummary: input.charterProjectSummary } : {}),
      },
      scopeContract,
    });
    const budgetProfile = projectBoardModelBudgetProfile({
      model: this.input.model,
      operation: "charter_review",
    });
    const promptBudget = projectBoardPromptBudgetAssessment({ promptCharCount: prompt.length, profile: budgetProfile });
    input.onProgress?.({
      stage: "model_request",
      title: "Asked Ambient/Pi for charter review",
      summary: `Sent ${prompt.length.toLocaleString()} prompt characters to Ambient/Pi for a lightweight PM review report.`,
      metadata: {
        promptCharCount: prompt.length,
        ...projectBoardPromptBudgetRunMetadata({
          latestPromptCharCount: prompt.length,
          cumulativePromptCharCount: prompt.length,
          promptBudget,
          plannerLedgerCompactionStatus: "skipped",
          plannerLedgerCompactionSkipReason: promptBudget.summarizationRecommended ? "charter_review_not_compacted" : "latest_prompt_below_threshold",
        }),
        model: normalizeAmbientModelId(this.input.model),
        planningOperation: contract.operation,
        planningProfile: contract.profile.name,
        plannerSessionId: input.plannerWorkspace?.sessionId,
        outputTokenBudget: budgetProfile.maxOutputTokens,
        modelBudgetProfile: projectBoardModelBudgetProfileMetadata(budgetProfile),
        promptBudgetAssessment: projectBoardPromptBudgetAssessmentMetadata(promptBudget),
        generatedCardPolicy: "zero_cards",
        gitState: input.gitContext?.mode ?? "unknown",
      },
      promptCharCount: prompt.length,
    });
    const requestStartedAt = Date.now();
    let completion: WorkflowPiCompletionMetadata | undefined;
    const text = await (this.input.piTextCall ?? callWorkflowPiText)({
      apiKey,
      baseUrl: this.input.baseUrl,
      model: this.input.model,
      systemPrompt: contract.systemPrompt,
      prompt,
      sessionId: stableBoardArtifactId("project-board-charter-review-session", [
        input.plannerWorkspace?.sessionId ?? input.projectName ?? "project-board",
      ]),
      temperature: 0,
      maxTokens: budgetProfile.maxOutputTokens,
      reasoning: projectBoardPiTextReasoning(this.input.reasoning ?? contract.reasoning),
      responseFormat: { type: "json_object" },
      retryPolicy: this.input.retryPolicy,
      idleTimeoutMs: normalizeAmbientStreamIdleTimeoutMs(this.input.streamIdleTimeoutMs),
      signal: input.signal,
      onProgress: (progress: WorkflowPiProgress) => {
        if (progress.stage !== "streaming" && progress.stage !== "thinking") return;
        input.onProgress?.({
          stage: "model_response",
          title: progress.stage === "thinking" ? "Ambient/Pi is reviewing charter context" : "Receiving charter review",
          summary:
            progress.stage === "thinking"
              ? `Ambient/Pi has produced ${progress.thinkingChars.toLocaleString()} thinking characters while reviewing charter context.`
              : `Received ${progress.outputChars.toLocaleString()} charter-review response characters so far.`,
          metadata: {
            responseCharCount: progress.outputChars,
            thinkingCharCount: progress.thinkingChars,
            requestDurationMs: progress.elapsedMs,
            idleElapsedMs: progress.idleElapsedMs,
            streaming: true,
            generatedCardPolicy: "zero_cards",
            gitState: input.gitContext?.mode ?? "unknown",
          },
          responseCharCount: progress.outputChars,
        });
      },
      onCompleted: (metadata) => {
        completion = metadata;
      },
    });
    const requestDurationMs = Date.now() - requestStartedAt;
    input.onProgress?.({
      stage: "model_response",
      title: "Received charter review",
      summary: `Received ${text.length.toLocaleString()} response characters for the lightweight PM review report.`,
      metadata: {
        responseCharCount: text.length,
        requestDurationMs,
        finishReason: completion?.finishReason,
        stopReason: completion?.stopReason,
        usage: completion?.usage,
        generatedCardPolicy: "zero_cards",
        gitState: input.gitContext?.mode ?? "unknown",
      },
      responseCharCount: text.length,
    });
    const parsedReport = parseProjectBoardSynthesisJson(text);
    const reportEnvelope =
      parsedReport && typeof parsedReport === "object" && !Array.isArray(parsedReport) && "reviewReport" in parsedReport
        ? (parsedReport as { reviewReport?: unknown }).reviewReport
        : parsedReport;
    const report = normalizeProjectBoardPmReviewReport(reportEnvelope);
    assertValidClarificationQuestionCandidates(
      input.refinement,
      report.blockingQuestions.map((question, index) => ({
        question,
        location: `pm_review.blockingQuestions[${index}]`,
      })),
      {
        surface: "pm_review",
      },
    );
    const draft = projectBoardSynthesisDraftFromPmReviewReport({ report, baseline: deterministicDraft });
    input.onProgress?.({
      stage: "schema_validation",
      title: "Validated charter review report",
      summary: `Validated a ${report.readiness.replace(/_/g, " ")} PM review report with ${report.blockingQuestions.length} blocking question${
        report.blockingQuestions.length === 1 ? "" : "s"
      } and zero generated cards.`,
      metadata: {
        readiness: report.readiness,
        sourceConfidence: report.sourceConfidence,
        sourceConfidenceNoteCount: report.sourceConfidenceNotes.length,
        gitState: report.gitState,
        gitStateNoteCount: report.gitStateNotes.length,
        questionCount: report.blockingQuestions.length,
        riskCount: report.risks.length,
        sourceConflictCount: report.sourceConflicts.length,
        recommendedActivationScopePresent: Boolean(report.recommendedActivationScope.trim()),
        cardGenerationConstraintCount: report.cardGenerationConstraints.length,
        cardCount: 0,
        generatedCardPolicy: "zero_cards",
      },
      cardCount: 0,
      questionCount: report.blockingQuestions.length,
    });
    return {
      draft,
      reviewReport: report,
      telemetry: {
        promptCharCount: prompt.length,
        responseCharCount: text.length,
        requestDurationMs,
        cardCount: 0,
        questionCount: report.blockingQuestions.length,
        outputTokenBudget: budgetProfile.maxOutputTokens,
        modelBudgetProfile: budgetProfile,
        promptBudgetStatus: promptBudget.status,
        promptBudgetWarningCount: promptBudget.summarizationRecommended ? 1 : 0,
        maxPromptBudgetUtilization: promptBudget.softPromptBudgetUtilization,
        lastPromptBudgetAssessment: promptBudget,
        finishReason: completion?.finishReason,
      },
    };
  }

  // Note: this legacy whole-board path intentionally has no shouldPause parameter.
  // It makes a single model call with no mid-run checkpoint, so pause is handled by
  // the caller via the abort signal; accepting a callback here and ignoring it made
  // pause requests silently no-ops.
  async synthesizeWithTelemetry(input: {
    sources: ProjectBoardSynthesisSource[];
    projectName?: string;
    refinement?: ProjectBoardSynthesisRefinementContext;
    charterProjectSummary?: ProjectBoardCharterProjectSummary;
    onProgress?: (progress: AmbientProjectBoardSynthesisProgress) => void;
    onProgressiveRecords?: (batch: AmbientProjectBoardSynthesisProgressiveBatch) => void;
    plannerWorkspace?: ProjectBoardPlannerWorkspace;
    signal?: AbortSignal;
  }): Promise<AmbientProjectBoardSynthesisResult> {
    const apiKey = (this.input.apiKey ?? readAmbientApiKey() ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const deterministicDraft = synthesizeProjectBoardDraft(input.sources);
    const scopeContract = await deriveProjectBoardScopeContractWithPi({
      apiKey,
      baseUrl: this.input.baseUrl,
      model: this.input.model,
      projectName: input.projectName,
      sources: input.sources,
      refinement: input.refinement,
      skipLlmCall: Boolean(this.input.fetchImpl || this.input.piTextCall),
      retryPolicy: this.input.retryPolicy,
      streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
      signal: input.signal,
      onProgress: input.onProgress,
    });
    const planningDepth = projectBoardPlanningDepthFromScopeContract(scopeContract);
    const workflowScopeLimits = projectBoardWorkflowScopeLimits({ scopeContract, sources: input.sources });
    const prompt = buildProjectBoardSynthesisPrompt({
      sources: input.sources,
      projectName: input.projectName,
      deterministicDraft,
      refinement: input.refinement,
      ...(input.charterProjectSummary ? { charterProjectSummary: input.charterProjectSummary } : {}),
      plannerWorkspaceBlock: projectBoardPlannerWorkspacePromptBlock(input.plannerWorkspace),
    });
    const operation = synthesisOperationFromRefinement(input.refinement);
    const contract = buildProjectBoardPlanningContract({
      operation,
      projectName: input.projectName,
      profileName: inferPlanningProfileName(input.sources),
      charter: {
        goal: input.refinement?.previousDraft.goal ?? deterministicDraft.goal,
        proofPolicy: input.refinement?.previousDraft.qualityBar ?? deterministicDraft.qualityBar,
        decisionPolicy: input.refinement
          ? "Treat the supplied charter and PM Review answers as already settled unless they are incomplete or contradictory."
          : undefined,
        ...(input.charterProjectSummary ? { projectSummary: input.charterProjectSummary } : {}),
      },
      scopeContract,
    });
    const budgetProfile = projectBoardModelBudgetProfile({
      model: this.input.model,
      operation: "legacy_full_synthesis",
    });
    const promptBudget = projectBoardPromptBudgetAssessment({ promptCharCount: prompt.length, profile: budgetProfile });
    input.onProgress?.({
      stage: "model_request",
      title: "Asked Ambient/Pi",
      summary: `Sent ${prompt.length.toLocaleString()} prompt characters to Ambient/Pi for PM synthesis.`,
      metadata: {
        promptCharCount: prompt.length,
        ...projectBoardPromptBudgetRunMetadata({
          latestPromptCharCount: prompt.length,
          cumulativePromptCharCount: prompt.length,
          promptBudget,
          plannerLedgerCompactionStatus: "skipped",
          plannerLedgerCompactionSkipReason: promptBudget.summarizationRecommended ? "legacy_full_synthesis_not_compacted" : "latest_prompt_below_threshold",
        }),
        model: normalizeAmbientModelId(this.input.model),
        planningOperation: operation,
        planningProfile: contract.profile.name,
        ...pmReviewActivationTelemetryMetadata(input.refinement?.pmReviewReport),
        outputTokenBudget: budgetProfile.maxOutputTokens,
        modelBudgetProfile: projectBoardModelBudgetProfileMetadata(budgetProfile),
        promptBudgetAssessment: projectBoardPromptBudgetAssessmentMetadata(promptBudget),
      },
      promptCharCount: prompt.length,
    });
    const requestStartedAt = Date.now();
    const workspaceTailState = createProjectBoardPlannerWorkspaceTailState();
    const streamedWorkspaceRecords: ProposalJsonlRecordArtifact[] = [];
    const wholeBoardSection = wholeBoardPlanningSection(input.sources, input.projectName);
    let workspacePollQueue = Promise.resolve();
    let workspaceActivityToken = 0;
    const workspacePollErrorState = { warned: false };
    const scheduleWorkspacePoll = (includeIncompleteLastLine = false) => {
      if (!input.plannerWorkspace) return;
      workspacePollQueue = workspacePollQueue.then(
        guardedWorkspaceIoTask(
          async () => {
            const batchRecords = await pollProjectBoardPlannerWorkspaceRecords({
              workspace: input.plannerWorkspace,
              state: workspaceTailState,
              includeIncompleteLastLine,
            });
            if (batchRecords.length === 0) return;
            workspaceActivityToken += batchRecords.length;
            streamedWorkspaceRecords.push(...batchRecords);
            if (input.onProgressiveRecords) {
              input.onProgressiveRecords({
                records: batchRecords,
                section: wholeBoardSection,
                sectionIndex: 1,
                sectionCount: 1,
                promptCharCount: prompt.length,
                responseCharCount: lastResponseProgressChars,
                accumulatedRecordCount: streamedWorkspaceRecords.length,
              });
            }
          },
          workspacePollErrorState,
          input.onProgress,
        ),
      );
    };
    let lastResponseProgressAt = 0;
    let lastResponseProgressChars = 0;
    const emitResponseProgress = (responseCharCount: number, done = false) => {
      const now = Date.now();
      if (
        !done &&
        responseCharCount > 0 &&
        responseCharCount - lastResponseProgressChars < 1000 &&
        now - lastResponseProgressAt < 1000
      ) {
        return;
      }
      lastResponseProgressAt = now;
      lastResponseProgressChars = responseCharCount;
      const elapsedMs = Date.now() - requestStartedAt;
      input.onProgress?.({
        stage: "model_response",
        title: done ? "Received Ambient/Pi response" : "Receiving Ambient/Pi response",
        summary: `${done ? "Received" : "Received so far"} ${responseCharCount.toLocaleString()} response characters in ${elapsedMs.toLocaleString()} ms.`,
        metadata: { responseCharCount, requestDurationMs: elapsedMs, streaming: true },
        responseCharCount,
      });
      scheduleWorkspacePoll();
    };
    const workspacePollTimer = input.plannerWorkspace
      ? setInterval(() => scheduleWorkspacePoll(), projectBoardWorkspacePollIntervalMs(this.input.streamIdleTimeoutMs))
      : undefined;
    let responseText = "";
    let responseResult: AmbientProjectBoardSynthesisCallResult | undefined;
    try {
      responseResult = await this.callAmbientForSynthesisWithMetadata({
        apiKey,
        system: contract.systemPrompt,
        prompt,
        maxTokens: budgetProfile.maxOutputTokens,
        reasoning: contract.reasoning,
        onChunk: (responseCharCount) => emitResponseProgress(responseCharCount),
        contentActivityToken: () => workspaceActivityToken,
        committedRecordCount: () => streamedWorkspaceRecords.length,
        signal: input.signal,
        onTransientRetry: (retry) => {
          input.onProgress?.({
            stage: "model_response",
            title: "Retrying transient Ambient/Pi synthesis request",
            summary: `Ambient/Pi failed before replay-sensitive PM synthesis output; retrying provider attempt ${retry.retryAttempt}/${retry.maxRetries} after ${retry.delayMs.toLocaleString()} ms.`,
            metadata: {
              transientRetry: true,
              aggressiveRetries: retry.aggressive,
              retryAttempt: retry.retryAttempt,
              maxRetries: retry.maxRetries,
              retryDelayMs: retry.delayMs,
              error: retry.error,
              responseCharCount: lastResponseProgressChars,
              outputChars: retry.outputChars,
              committedRecordCount: retry.committedRecordCount,
            },
            responseCharCount: lastResponseProgressChars,
          });
        },
      });
      responseText = responseResult.text;
    } finally {
      if (workspacePollTimer) clearInterval(workspacePollTimer);
    }
    const requestDurationMs = Date.now() - requestStartedAt;
    input.onProgress?.({
      stage: "model_response",
      title: "Received Ambient/Pi response",
      summary: `Received ${responseText.length.toLocaleString()} response characters in ${requestDurationMs.toLocaleString()} ms.`,
      metadata: { responseCharCount: responseText.length, requestDurationMs, streaming: true },
      responseCharCount: responseText.length,
    });
    await workspacePollQueue;
    scheduleWorkspacePoll(true);
    await workspacePollQueue;
    const workspaceRecords = dedupeProgressiveRecords(streamedWorkspaceRecords);
    const draftSourceRecords = workspaceRecords.some((record) => record.type === "candidate_card")
      ? workspaceRecords
      : [];
    const sourceDraft =
      draftSourceRecords.length > 0
        ? projectBoardSynthesisDraftFromProgressiveRecords(draftSourceRecords, {
            projectName: input.projectName,
            summary: "Recovered a board proposal from planner workspace artifacts.",
            goal: deterministicDraft.goal,
            currentState: deterministicDraft.currentState,
            targetUser: deterministicDraft.targetUser,
            qualityBar: deterministicDraft.qualityBar,
          })
        : normalizeProjectBoardSynthesisResponse(responseText, {
            projectName: input.projectName,
            sources: input.sources,
          }, {
            uxMockGate: input.refinement && isAdditiveRefinement(input.refinement) ? "preserve" : "auto",
          });
    const { draft, finalRecords: progressiveRecords, scopeContractFilterCount } = await finalizeProjectBoardSynthesisDraft({
      sourceDraft,
      surface: "legacy_full_synthesis",
      sources: input.sources,
      refinement: input.refinement,
      scopeContract,
      workflowScopeLimits,
      retainRecords: workspaceRecords,
      priorRecords: workspaceRecords,
      plannerWorkspace: input.plannerWorkspace,
      workspaceTailState,
      workspacePollErrorState,
      onProgress: input.onProgress,
      assertDraftValidity: true,
    });
    input.onProgress?.({
      stage: "schema_validation",
      title: "Validated proposal JSON",
      summary: `Validated ${draft.cards.length} proposed card${draft.cards.length === 1 ? "" : "s"}, ${draft.questions.length} question${draft.questions.length === 1 ? "" : "s"}, and ${progressiveRecords.length} progressive planning record${progressiveRecords.length === 1 ? "" : "s"}.`,
      metadata: {
        cardCount: draft.cards.length,
        questionCount: draft.questions.length,
        progressiveRecordCount: progressiveRecords.length,
        sourceCoverageCount: progressiveRecords.filter((record) => record.type === "source_coverage").length,
        dependencyEdgeCount: progressiveRecords.filter((record) => record.type === "dependency_edge").length,
        scopeContractFilterCount,
      },
      cardCount: draft.cards.length,
      questionCount: draft.questions.length,
    });
    return {
      draft,
      telemetry: {
        promptCharCount: prompt.length,
        responseCharCount: responseText.length,
        requestDurationMs,
        cardCount: draft.cards.length,
        questionCount: draft.questions.length,
        progressiveRecordCount: progressiveRecords.length,
        scopeContractFilterCount,
        outputTokenBudget: budgetProfile.maxOutputTokens,
        modelBudgetProfile: budgetProfile,
        promptBudgetStatus: promptBudget.status,
        promptBudgetWarningCount: promptBudget.summarizationRecommended ? 1 : 0,
        maxPromptBudgetUtilization: promptBudget.softPromptBudgetUtilization,
        lastPromptBudgetAssessment: promptBudget,
        finishReason: responseResult?.finishReason,
      },
      progressiveRecords,
      scopeContract,
      planningDepth,
    };
  }

  async synthesizeSectionedWithTelemetry(input: {
    sources: ProjectBoardSynthesisSource[];
    projectName?: string;
    refinement?: ProjectBoardSynthesisRefinementContext;
    charterProjectSummary?: ProjectBoardCharterProjectSummary;
    sectioning?: ProjectBoardPlanningSectionOptions;
    resumeFromRecords?: ProposalJsonlRecordArtifact[];
    maxCardsPerSection?: number;
    onProgress?: (progress: AmbientProjectBoardSynthesisProgress) => void;
    onProgressiveRecords?: (batch: AmbientProjectBoardSynthesisProgressiveBatch) => void;
    plannerWorkspace?: ProjectBoardPlannerWorkspace;
    shouldPause?: (input: ProjectBoardSynthesisPauseCheckInput) => boolean | Promise<boolean>;
    signal?: AbortSignal;
  }): Promise<AmbientProjectBoardSynthesisResult> {
    const apiKey = (this.input.apiKey ?? readAmbientApiKey() ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const scopeContract = await deriveProjectBoardScopeContractWithPi({
      apiKey,
      baseUrl: this.input.baseUrl,
      model: this.input.model,
      projectName: input.projectName,
      sources: input.sources,
      refinement: input.refinement,
      skipLlmCall: Boolean(this.input.fetchImpl || this.input.piTextCall),
      retryPolicy: this.input.retryPolicy,
      streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
      signal: input.signal,
      onProgress: input.onProgress,
    });
    const planningDepth = projectBoardPlanningDepthFromScopeContract(scopeContract);
    const workflowScopeLimits = projectBoardWorkflowScopeLimits({ scopeContract, sources: input.sources });
    const sectioning = workflowScopeLimits.compact
      ? {
          ...input.sectioning,
          maxSections: Math.min(input.sectioning?.maxSections ?? workflowScopeLimits.maxSections, workflowScopeLimits.maxSections),
          maxSectionChars: Math.max(input.sectioning?.maxSectionChars ?? workflowScopeLimits.maxSectionChars, workflowScopeLimits.maxSectionChars),
        }
      : input.sectioning;
    const sectionPlan = projectBoardPlanningSectionPlanFromSources(input.sources, sectioning);
    const sections = sectionPlan.sections;
    if (sections.length === 0) throw new Error("Project board sectioned synthesis did not find any included source sections.");
    const deterministicDraft = synthesizeProjectBoardDraft(input.sources);
    const startedAt = Date.now();
    let totalPromptCharCount = 0;
    let totalResponseCharCount = 0;
    const records: ProposalJsonlRecordArtifact[] = retryableSectionResumeRecords(input.resumeFromRecords ?? []);
    // Sources dropped by the section cap used to vanish silently while coverage
    // reported the run complete; record them as unresolved with a warning.
    for (const truncated of sectionPlan.truncatedSources) {
      records.push(
        validateProposalJsonlRecordArtifact({
          type: "warning",
          code: "sectioned_planning_source_truncated",
          message: `Source "${truncated.path ?? truncated.title}" was excluded from sectioned planning because the ${sections.length}-section cap was reached.`,
          createdAt: new Date().toISOString(),
          metadata: { sourceId: truncated.sourceId, sectionCap: sections.length },
        }),
        validateProposalJsonlRecordArtifact({
          type: "source_coverage",
          sourceId: truncated.sourceId,
          range: "full",
          status: "unresolved",
          cardIds: [],
          updatedAt: new Date().toISOString(),
        }),
      );
    }
    const completedSectionIds = completedSectionIdsFromRecords(records);
    const maxCardsPerSection = normalizeSectionBatchCardLimit(
      input.maxCardsPerSection ?? (workflowScopeLimits.compact ? workflowScopeLimits.maxCardsPerSection : undefined),
    );
    const sectionBudgetProfile = projectBoardModelBudgetProfile({
      model: this.input.model,
      operation: "section_elaboration",
      maxCardsPerBatch: maxCardsPerSection,
    });
    const workspaceTailState = createProjectBoardPlannerWorkspaceTailState(records);
    let workspacePollQueue = Promise.resolve();
    let workspaceActivityToken = 0;
    const workspacePollErrorState = { warned: false };
    const scheduleSectionWorkspacePoll = (
      section: ProjectBoardPlanningSection,
      sectionNumber: number,
      currentSectionResponseChars = 0,
      includeIncompleteLastLine = false,
    ) => {
      if (!input.plannerWorkspace) return;
      workspacePollQueue = workspacePollQueue.then(
        guardedWorkspaceIoTask(
          async () => {
            const workspaceRecords = await pollProjectBoardPlannerWorkspaceRecords({
              workspace: input.plannerWorkspace,
              state: workspaceTailState,
              includeIncompleteLastLine,
            });
            const newRecords = recordsNotAlreadySeen(workspaceRecords, records);
            if (newRecords.length === 0) return;
            workspaceActivityToken += newRecords.length;
            records.push(...newRecords);
            if (input.onProgressiveRecords) {
              input.onProgressiveRecords({
                records: newRecords,
                section,
                sectionIndex: sectionNumber,
                sectionCount: sections.length,
                promptCharCount: totalPromptCharCount,
                responseCharCount: totalResponseCharCount + currentSectionResponseChars,
                accumulatedRecordCount: records.length,
              });
            }
          },
          workspacePollErrorState,
          input.onProgress,
        ),
      );
    };
    let skippedSectionCount = 0;
    let failedSectionCount = 0;
    let semanticIdleSectionCount = 0;
    let promptBudgetWarningCount = 0;
    let maxPromptBudgetUtilization = 0;
    let lastPromptBudgetAssessment: ProjectBoardPromptBudgetAssessment | undefined;
    let plannerLedgerCompactionCount = 0;
    let plannerLedgerCompactionCacheHitCount = 0;
    let lastPlannerLedgerCompaction: ProjectBoardPlannerLedgerCompaction | undefined;
    let paused = false;
    let stoppedAfterTransientZeroOutputError: string | undefined;
    const recordPauseCheckpoint = async (section: ProjectBoardPlanningSection, sectionNumber: number): Promise<boolean> => {
      if (!(await input.shouldPause?.({
        phase: "section",
        sectionIndex: sectionNumber,
        sectionCount: sections.length,
        recordCount: records.length,
        lastValidRecord: lastValidPlannerRecord(records),
      }))) {
        return false;
      }
      const lastValidRecord = lastValidPlannerRecord(records);
      const pauseRecord = plannerPauseProgressRecord({
        phase: "section",
        sectionIndex: sectionNumber,
        sectionCount: sections.length,
        recordCount: records.length,
        lastValidRecord,
        plannerSessionId: input.plannerWorkspace?.sessionId,
        summary: `Planning paused after section ${sectionNumber}/${sections.length}; validated records through this checkpoint are reusable on resume.`,
      });
      markProjectBoardPlannerWorkspaceTailRecords(workspaceTailState, [pauseRecord]);
      await appendProjectBoardPlannerWorkspaceRecords(input.plannerWorkspace, [pauseRecord]);
      records.push(pauseRecord);
      input.onProgressiveRecords?.({
        records: [pauseRecord],
        section,
        sectionIndex: sectionNumber,
        sectionCount: sections.length,
        promptCharCount: totalPromptCharCount,
        responseCharCount: totalResponseCharCount,
        accumulatedRecordCount: records.length,
      });
      input.onProgress?.({
        stage: "schema_validation",
        title: "Paused project-board planning",
        summary: `Paused after section ${sectionNumber}/${sections.length}. Resume will reuse validated planner records and continue with remaining source coverage.`,
        metadata: {
          pauseRequested: true,
          sectionIndex: sectionNumber,
          sectionCount: sections.length,
          plannerSessionId: input.plannerWorkspace?.sessionId,
          lastValidRecordId: lastValidRecord?.recordId,
          lastValidRecordType: lastValidRecord?.recordType,
          progressiveRecordCount: records.length,
        },
        promptCharCount: totalPromptCharCount,
        responseCharCount: totalResponseCharCount,
        cardCount: records.filter((record) => record.type === "candidate_card").length,
        questionCount: records.filter((record) => record.type === "question").length,
      });
      return true;
    };
    const emitSectionRecords = async (
      section: ProjectBoardPlanningSection,
      sectionNumber: number,
      sectionRecords: ProposalJsonlRecordArtifact[],
      responseCharCount: number,
    ) => {
      if (sectionRecords.length === 0) return;
      markProjectBoardPlannerWorkspaceTailRecords(workspaceTailState, sectionRecords);
      await appendProjectBoardPlannerWorkspaceRecords(input.plannerWorkspace, sectionRecords);
      records.push(...sectionRecords);
      input.onProgressiveRecords?.({
        records: sectionRecords,
        section,
        sectionIndex: sectionNumber,
        sectionCount: sections.length,
        promptCharCount: totalPromptCharCount,
        responseCharCount,
        accumulatedRecordCount: records.length,
      });
    };

    for (const [index, section] of sections.entries()) {
      const sectionNumber = index + 1;
      if (completedSectionIds.has(section.id)) {
        skippedSectionCount += 1;
        const skippedRecords = [
          sectionStatusProgressRecord(section, {
            status: "skipped",
            sectionNumber,
            sectionCount: sections.length,
            summary: "Skipping this section because a previous run already imported validated planning records for it.",
            metadata: { resumed: true, previousRecordCount: records.length },
          }),
        ];
        records.push(...skippedRecords);
        input.onProgressiveRecords?.({
          records: skippedRecords,
          section,
          sectionIndex: sectionNumber,
          sectionCount: sections.length,
          promptCharCount: totalPromptCharCount,
          responseCharCount: totalResponseCharCount,
          accumulatedRecordCount: records.length,
        });
        input.onProgress?.({
          stage: "schema_validation",
          title: `Skipped section ${sectionNumber}/${sections.length}`,
          summary: `Reused previous planning records for ${section.sourcePath || section.sourceTitle} (${section.heading}).`,
          metadata: {
            sectionId: section.id,
            sectionIndex: sectionNumber,
            sectionCount: sections.length,
            skippedSectionCount,
            progressiveRecordCount: records.length,
            resumed: true,
          },
          promptCharCount: totalPromptCharCount,
          responseCharCount: totalResponseCharCount,
          cardCount: records.filter((record) => record.type === "candidate_card").length,
          questionCount: records.filter((record) => record.type === "question").length,
        });
        if (await recordPauseCheckpoint(section, sectionNumber)) {
          paused = true;
          break;
        }
        continue;
      }
      const rawBasePrompt = buildProjectBoardSectionedPlanningPrompt({
        section,
        sectionIndex: index,
        sectionCount: sections.length,
        sources: input.sources,
        projectName: input.projectName,
        deterministicDraft,
        refinement: input.refinement,
        ...(input.charterProjectSummary ? { charterProjectSummary: input.charterProjectSummary } : {}),
        scopeContract,
        priorRecords: records,
        maxCardsPerSection,
        plannerWorkspaceBlock: projectBoardPlannerWorkspacePromptBlock(input.plannerWorkspace),
      });
      const rawBasePromptBudget = projectBoardPromptBudgetAssessment({ promptCharCount: rawBasePrompt.length, profile: sectionBudgetProfile });
      let sectionContextCompaction: ProjectBoardPlannerLedgerCompaction | undefined;
      let sectionContextCompactionReason: ProjectBoardSectionedContextCompactionReason | undefined;
      const compactionDecision = projectBoardSectionedContextCompactionDecision({
        section,
        sectionNumber,
        sectionCount: sections.length,
        rawPrompt: rawBasePrompt,
        rawPromptBudget: rawBasePromptBudget,
        cumulativePromptCharCount: totalPromptCharCount + rawBasePrompt.length,
        sources: input.sources,
      });
      if (compactionDecision.compact) {
        const compactionReason = compactionDecision.reason ?? "repeated_stable_context";
        sectionContextCompactionReason = compactionReason;
        const compactionCacheKey = plannerLedgerCompactionCacheKey({
          sources: input.sources,
          projectName: input.projectName,
          priorRecords: records,
          refinement: input.refinement,
          charterProjectSummary: input.charterProjectSummary,
          rawPromptBudget: rawBasePromptBudget,
          batchNumber: sectionNumber,
          maxBatches: sections.length,
          maxCardsPerBatch: maxCardsPerSection,
        });
        const cachedCompaction = readCachedPlannerLedgerCompaction(records, compactionCacheKey, rawBasePromptBudget);
        const compactionStartedAt = Date.now();
        if (cachedCompaction) {
          sectionContextCompaction = cachedCompaction;
          plannerLedgerCompactionCacheHitCount += 1;
        } else {
          const compactionPrompt = buildSectionedContextCompactionPrompt({
            section,
            sectionNumber,
            sectionCount: sections.length,
            sources: input.sources,
            projectName: input.projectName,
            priorRecords: records,
            rawPromptBudget: rawBasePromptBudget,
            reason: compactionReason,
            maxCardsPerSection,
          });
          input.onProgress?.({
            stage: "model_request",
            title: `Compacting section context ${sectionNumber}/${sections.length}`,
            summary: `The sectioned planner reached ${compactionReason.replace(/_/g, " ")}; compacting repeated source and rendered-card context before asking for ${section.heading}.`,
            metadata: {
              sectionId: section.id,
              sectionIndex: sectionNumber,
              sectionCount: sections.length,
              sectionHeading: section.heading,
              sourceId: section.sourceId,
              sourcePath: section.sourcePath,
              plannerSessionId: input.plannerWorkspace?.sessionId,
              promptCharCount: totalPromptCharCount + compactionPrompt.length,
              ...projectBoardPromptBudgetRunMetadata({
                latestPromptCharCount: compactionPrompt.length,
                cumulativePromptCharCount: totalPromptCharCount + compactionPrompt.length,
                promptBudget: rawBasePromptBudget,
                plannerLedgerCompactionStatus: "started",
              }),
              sectionContextCompactionReason: compactionReason,
              compactionPromptCharCount: compactionPrompt.length,
              compactionCacheKey,
              rawPromptCharCount: rawBasePrompt.length,
              rawPromptBudgetAssessment: projectBoardPromptBudgetAssessmentMetadata(rawBasePromptBudget),
            },
            promptCharCount: totalPromptCharCount + compactionPrompt.length,
            cardCount: records.filter((record) => record.type === "candidate_card").length,
            questionCount: records.filter((record) => record.type === "question").length,
          });
          sectionContextCompaction = await this.compactPlannerBatchLedger({
            apiKey,
            prompt: compactionPrompt,
            sources: input.sources,
            priorRecords: records,
            rawPromptBudget: rawBasePromptBudget,
            cacheKey: compactionCacheKey,
            batchNumber: sectionNumber,
            maxBatches: sections.length,
            maxCardsPerBatch: maxCardsPerSection,
            plannerSessionId: input.plannerWorkspace?.sessionId,
            signal: input.signal,
          });
        }
        plannerLedgerCompactionCount += 1;
        lastPlannerLedgerCompaction = sectionContextCompaction;
        totalPromptCharCount += sectionContextCompaction.promptCharCount;
        const compactionRecord = sectionedContextCompactionProgressRecord({
          compaction: sectionContextCompaction,
          section,
          sectionNumber,
          sectionCount: sections.length,
          maxCardsPerSection,
          reason: compactionReason,
          plannerSessionId: input.plannerWorkspace?.sessionId,
          durationMs: Date.now() - compactionStartedAt,
        });
        markProjectBoardPlannerWorkspaceTailRecords(workspaceTailState, [compactionRecord]);
        await appendProjectBoardPlannerWorkspaceRecords(input.plannerWorkspace, [compactionRecord]);
        records.push(compactionRecord);
        input.onProgressiveRecords?.({
          records: [compactionRecord],
          section,
          sectionIndex: sectionNumber,
          sectionCount: sections.length,
          promptCharCount: totalPromptCharCount,
          responseCharCount: totalResponseCharCount,
          accumulatedRecordCount: records.length,
        });
        input.onProgress?.({
          stage: "model_response",
          title: sectionContextCompaction.cacheHit
            ? `Reused cached section context compaction ${sectionNumber}/${sections.length}`
            : `Compacted section context ${sectionNumber}/${sections.length}`,
          summary: sectionContextCompaction.cacheHit
            ? `Reused cached section-context compaction for ${section.heading}.`
            : `Compacted repeated source and rendered-card context for ${section.heading} using ${sectionContextCompaction.source}.`,
          metadata: {
            sectionId: section.id,
            sectionIndex: sectionNumber,
            sectionCount: sections.length,
            plannerSessionId: input.plannerWorkspace?.sessionId,
            plannerLedgerCompactionStatus: sectionContextCompaction.cacheHit ? "cache_hit" : "used",
            plannerLedgerCompaction: plannerLedgerCompactionTelemetryMetadata(sectionContextCompaction),
            sectionContextCompactionReason: compactionReason,
            compactionDurationMs: Date.now() - compactionStartedAt,
          },
          promptCharCount: totalPromptCharCount,
          cardCount: records.filter((record) => record.type === "candidate_card").length,
          questionCount: records.filter((record) => record.type === "question").length,
        });
      }
      const basePrompt = sectionContextCompaction
        ? buildProjectBoardSectionedPlanningPrompt({
            section,
            sectionIndex: index,
            sectionCount: sections.length,
            sources: input.sources,
            projectName: input.projectName,
            deterministicDraft,
            refinement: input.refinement,
            ...(input.charterProjectSummary ? { charterProjectSummary: input.charterProjectSummary } : {}),
            scopeContract,
            priorRecords: records,
            maxCardsPerSection,
            plannerWorkspaceBlock: projectBoardPlannerWorkspacePromptBlock(input.plannerWorkspace),
            plannerLedgerCompaction: sectionContextCompaction,
          })
        : rawBasePrompt;
      if (sectionContextCompaction) sectionContextCompaction.finalPromptCharCount = basePrompt.length;
      const contract = buildProjectBoardPlanningContract({
        operation: "section_elaboration",
        projectName: input.projectName,
        profileName: inferPlanningProfileName(input.sources),
        charter: {
          goal: input.refinement?.previousDraft.goal ?? deterministicDraft.goal,
          proofPolicy: input.refinement?.previousDraft.qualityBar ?? deterministicDraft.qualityBar,
          decisionPolicy: input.refinement
            ? "Treat the supplied charter and PM Review answers as already settled unless they are incomplete or contradictory."
            : undefined,
          ...(input.charterProjectSummary ? { projectSummary: input.charterProjectSummary } : {}),
        },
        scopeContract,
      });
      let stopAfterCurrentSectionFailure = false;
      let sectionDone = false;
      let retryAttempt = 0;
      let lastRetryFailure: { failureKind: ProjectBoardSectionFailureKind; message: string; sectionResponseCharCount: number; sectionDurationMs: number } | undefined;
      while (!sectionDone && retryAttempt <= PROJECT_BOARD_SECTION_RETRY_LIMIT) {
        const retrying = retryAttempt > 0;
        const prompt = retrying
          ? buildProjectBoardSectionRetryPrompt({
              basePrompt,
              section,
              sectionNumber,
              sectionCount: sections.length,
              retryAttempt,
              maxRetries: PROJECT_BOARD_SECTION_RETRY_LIMIT,
              priorRecords: records,
              failureKind: lastRetryFailure?.failureKind,
              failureMessage: lastRetryFailure?.message,
            })
          : basePrompt;
        if (retrying) {
          const retryRecords = [
            sectionRetryProgressRecord(section, {
              status: "started",
              sectionNumber,
              sectionCount: sections.length,
              retryAttempt,
              maxRetries: PROJECT_BOARD_SECTION_RETRY_LIMIT,
              failureKind: lastRetryFailure?.failureKind,
              error: lastRetryFailure?.message,
              sectionResponseCharCount: lastRetryFailure?.sectionResponseCharCount,
              sectionDurationMs: lastRetryFailure?.sectionDurationMs,
            }),
          ];
          await emitSectionRecords(section, sectionNumber, retryRecords, totalResponseCharCount);
          input.onProgress?.({
            stage: "schema_validation",
            title: `Retrying section ${sectionNumber}/${sections.length}`,
            summary: `Retry ${retryAttempt}/${PROJECT_BOARD_SECTION_RETRY_LIMIT} is asking Ambient/Pi to recover ${section.heading} before moving on.`,
            metadata: {
              sectionId: section.id,
              sectionIndex: sectionNumber,
              sectionCount: sections.length,
              retryAttempt,
              maxRetries: PROJECT_BOARD_SECTION_RETRY_LIMIT,
              failureKind: lastRetryFailure?.failureKind,
              error: lastRetryFailure?.message,
              progressiveRecordCount: records.length,
            },
            promptCharCount: totalPromptCharCount,
            responseCharCount: totalResponseCharCount,
            cardCount: records.filter((record) => record.type === "candidate_card").length,
            questionCount: records.filter((record) => record.type === "question").length,
          });
        }
        totalPromptCharCount += prompt.length;
        const promptBudget = projectBoardPromptBudgetAssessment({ promptCharCount: prompt.length, profile: sectionBudgetProfile });
        lastPromptBudgetAssessment = promptBudget;
        maxPromptBudgetUtilization = Math.max(maxPromptBudgetUtilization, promptBudget.softPromptBudgetUtilization);
        if (promptBudget.summarizationRecommended) promptBudgetWarningCount += 1;
        input.onProgress?.({
          stage: "model_request",
          title: retrying
            ? `Asked Ambient/Pi to retry section ${sectionNumber}/${sections.length}`
            : `Asked Ambient/Pi for section ${sectionNumber}/${sections.length}`,
          summary: retrying
            ? `Sent ${prompt.length.toLocaleString()} prompt characters to retry ${section.sourcePath || section.sourceTitle} (${section.heading}).`
            : `Sent ${prompt.length.toLocaleString()} prompt characters for ${section.sourcePath || section.sourceTitle} (${section.heading}).`,
          metadata: {
            promptCharCount: totalPromptCharCount,
            ...projectBoardPromptBudgetRunMetadata({
              latestPromptCharCount: prompt.length,
              cumulativePromptCharCount: totalPromptCharCount,
              promptBudget,
              rawPromptBudget: rawBasePromptBudget,
              plannerLedgerCompactionStatus: sectionContextCompaction
                ? sectionContextCompaction.cacheHit
                  ? "cache_hit"
                  : "used"
                : "skipped",
              plannerLedgerCompactionSkipReason: sectionContextCompaction
                ? undefined
                : promptBudget.summarizationRecommended
                  ? "section_context_compaction_unavailable"
                  : "section_prompt_below_threshold",
            }),
            sectionId: section.id,
            sectionIndex: sectionNumber,
            sectionCount: sections.length,
            sectionHeading: section.heading,
            sourceId: section.sourceId,
            sourcePath: section.sourcePath,
            planningOperation: contract.operation,
            planningProfile: contract.profile.name,
            retryAttempt,
            retrying,
            maxRetries: PROJECT_BOARD_SECTION_RETRY_LIMIT,
            rawPromptBudgetAssessment: projectBoardPromptBudgetAssessmentMetadata(rawBasePromptBudget),
            plannerLedgerCompaction: sectionContextCompaction ? plannerLedgerCompactionTelemetryMetadata(sectionContextCompaction) : undefined,
            sectionContextCompactionReason,
            ...pmReviewActivationTelemetryMetadata(input.refinement?.pmReviewReport),
            outputTokenBudget: sectionBudgetProfile.maxOutputTokens,
            modelBudgetProfile: projectBoardModelBudgetProfileMetadata(sectionBudgetProfile),
            promptBudgetAssessment: projectBoardPromptBudgetAssessmentMetadata(promptBudget),
          },
          promptCharCount: totalPromptCharCount,
        });
        const sectionStartedAt = Date.now();
        let sectionResponseChars = 0;
        let sectionResponseCommitted = false;
        const sectionStartRecordCount = records.length;
        const workspacePollTimer = input.plannerWorkspace
          ? setInterval(
              () => scheduleSectionWorkspacePoll(section, sectionNumber, sectionResponseChars),
              projectBoardWorkspacePollIntervalMs(this.input.streamIdleTimeoutMs),
            )
          : undefined;
        try {
          const responseText = await this.callAmbientForSynthesis({
            apiKey,
            system: contract.systemPrompt,
            prompt,
            maxTokens: sectionBudgetProfile.maxOutputTokens,
            reasoning: contract.reasoning,
            onChunk: (responseCharCount) => {
              sectionResponseChars = responseCharCount;
              input.onProgress?.({
                stage: "model_response",
                title: retrying
                  ? `Receiving retry for section ${sectionNumber}/${sections.length}`
                  : `Receiving section ${sectionNumber}/${sections.length}`,
                summary: `Received ${responseCharCount.toLocaleString()} section response characters so far.`,
                metadata: {
                  responseCharCount: totalResponseCharCount + responseCharCount,
                  sectionResponseCharCount: responseCharCount,
                  sectionId: section.id,
                  sectionIndex: sectionNumber,
                  sectionCount: sections.length,
                  retryAttempt,
                  retrying,
                  streaming: true,
                },
                responseCharCount: totalResponseCharCount + responseCharCount,
              });
              scheduleSectionWorkspacePoll(section, sectionNumber, responseCharCount);
            },
            onTransientRetry: (retry) => {
              input.onProgress?.({
                stage: "model_response",
                title: `Retrying transient section request ${sectionNumber}/${sections.length}`,
                summary: `Ambient/Pi failed before replay-sensitive output for ${section.heading}; retrying provider attempt ${retry.retryAttempt}/${retry.maxRetries} after ${retry.delayMs.toLocaleString()} ms.`,
                metadata: {
                  transientRetry: true,
                  aggressiveRetries: retry.aggressive,
                  retryAttempt: retry.retryAttempt,
                  maxRetries: retry.maxRetries,
                  retryDelayMs: retry.delayMs,
                  error: retry.error,
                  sectionId: section.id,
                  sectionIndex: sectionNumber,
                  sectionCount: sections.length,
                  sectionHeading: section.heading,
                  outputChars: retry.outputChars,
                  committedRecordCount: retry.committedRecordCount,
                  retrying,
                },
                responseCharCount: totalResponseCharCount + sectionResponseChars,
              });
            },
            contentActivityToken: () => workspaceActivityToken,
            committedRecordCount: () => Math.max(0, records.length - sectionStartRecordCount),
            signal: input.signal,
          });
          if (workspacePollTimer) clearInterval(workspacePollTimer);
          await workspacePollQueue;
          sectionResponseChars = responseText.length;
          scheduleSectionWorkspacePoll(section, sectionNumber, sectionResponseChars, true);
          await workspacePollQueue;
          totalResponseCharCount += responseText.length;
          sectionResponseCommitted = true;
          const sectionDurationMs = Date.now() - sectionStartedAt;
          input.onProgress?.({
            stage: "model_response",
            title: retrying ? `Received retry for section ${sectionNumber}/${sections.length}` : `Received section ${sectionNumber}/${sections.length}`,
            summary: `Received ${sectionResponseChars.toLocaleString()} response characters for ${section.heading}.`,
            metadata: {
              responseCharCount: totalResponseCharCount,
              sectionResponseCharCount: sectionResponseChars,
              sectionDurationMs,
              sectionId: section.id,
              sectionIndex: sectionNumber,
              sectionCount: sections.length,
              retryAttempt,
              retrying,
              streaming: true,
            },
            responseCharCount: totalResponseCharCount,
          });
          const responseRecords = extractProjectBoardProposalJsonlRecordsFromText(responseText);
          const sectionWorkspaceRecordCount = records.length - sectionStartRecordCount;
          const normalizedSectionRecords = attachPlannerRecordSourceSnapshots(
            limitSectionCandidateCardRecords(
              responseRecords.length > 0
                ? responseRecords
                : sectionWorkspaceRecordCount > 0
                  ? []
                  : normalizeSectionProgressiveRecords(responseText, section),
              maxCardsPerSection,
              section,
            ),
            input.sources,
          );
          assertValidProjectBoardGeneratedRecordTitles(normalizedSectionRecords, {
            surface: "section_elaboration",
            sectionId: section.id,
            sectionHeading: section.heading,
            sectionIndex: sectionNumber,
            sectionCount: sections.length,
          });
          assertValidClarificationQuestionRecords(normalizedSectionRecords, input.refinement, {
            surface: "section_elaboration",
            sectionId: section.id,
            sectionHeading: section.heading,
            sectionIndex: sectionNumber,
            sectionCount: sections.length,
          });
          const sectionHasNoValidRecords = normalizedSectionRecords.some(
            (record) => record.type === "error" && record.code === "section_no_records",
          );
          if (sectionHasNoValidRecords) {
            throw new ProjectBoardSectionNoRecordsError(
              `No valid planning records were returned for ${section.sourcePath || section.sourceTitle} (${section.heading}).`,
            );
          }
          const proofScopeWarnings = projectBoardProofScopeWarningRecords(
            normalizedSectionRecords.flatMap((record) =>
              record.type === "candidate_card"
                ? [
                    {
                      sourceId: record.sourceId,
                      title: record.title,
                      description: record.description,
                      phase: record.phase,
                      labels: record.labels,
                      acceptanceCriteria: record.acceptanceCriteria,
                      testPlan: record.testPlan,
                    },
                  ]
                : [],
            ),
            new Date().toISOString(),
          );
          const sectionRecords = [
            ...normalizedSectionRecords,
            ...proofScopeWarnings,
            ...(retrying
              ? [
                  sectionRetryProgressRecord(section, {
                    status: "succeeded",
                    sectionNumber,
                    sectionCount: sections.length,
                    retryAttempt,
                    maxRetries: PROJECT_BOARD_SECTION_RETRY_LIMIT,
                    failureKind: lastRetryFailure?.failureKind,
                    sectionResponseCharCount: sectionResponseChars,
                    sectionDurationMs,
                  }),
                ]
              : []),
            sectionStatusProgressRecord(section, {
              status: "succeeded",
              sectionNumber,
              sectionCount: sections.length,
              summary: retrying
                ? `Imported validated planning records for ${section.heading} after retry ${retryAttempt}/${PROJECT_BOARD_SECTION_RETRY_LIMIT}.`
                : `Imported validated planning records for ${section.heading}.`,
              metadata: {
                recordCount: normalizedSectionRecords.length,
                sectionResponseCharCount: sectionResponseChars,
                sectionDurationMs,
                retryAttempt,
                retried: retrying,
              },
            }),
          ];
          await emitSectionRecords(section, sectionNumber, sectionRecords, totalResponseCharCount);
          input.onProgress?.({
            stage: "schema_validation",
            title: retrying
              ? `Retried and validated section ${sectionNumber}/${sections.length}`
              : `Validated section ${sectionNumber}/${sections.length}`,
            summary: `Imported ${sectionRecords.length} planning record${sectionRecords.length === 1 ? "" : "s"} from ${section.heading}.`,
            metadata: {
              progressiveRecordCount: records.length,
              sectionRecordCount: sectionRecords.length,
              candidateCardCount: records.filter((record) => record.type === "candidate_card").length,
              questionCount: records.filter((record) => record.type === "question").length,
              sourceCoverageCount: records.filter((record) => record.type === "source_coverage").length,
              dependencyEdgeCount: records.filter((record) => record.type === "dependency_edge").length,
              skippedSectionCount,
              failedSectionCount,
              semanticIdleSectionCount,
              recoverable: false,
              sectionId: section.id,
              sectionIndex: sectionNumber,
              sectionCount: sections.length,
              retryAttempt,
              retried: retrying,
              lastCandidateTitle: lastCandidateTitle(sectionRecords),
              lastQuestion: lastQuestion(sectionRecords),
            },
            promptCharCount: totalPromptCharCount,
            responseCharCount: totalResponseCharCount,
            cardCount: records.filter((record) => record.type === "candidate_card").length,
            questionCount: records.filter((record) => record.type === "question").length,
          });
          sectionDone = true;
        } catch (error) {
          if (workspacePollTimer) clearInterval(workspacePollTimer);
          await workspacePollQueue;
          scheduleSectionWorkspacePoll(section, sectionNumber, sectionResponseChars, true);
          await workspacePollQueue;
          const failureKind = projectBoardSectionFailureKind(error);
          const sectionDurationMs = Date.now() - sectionStartedAt;
          const failureResponseCharCount = sectionResponseCommitted ? totalResponseCharCount : totalResponseCharCount + sectionResponseChars;
          lastRetryFailure = {
            failureKind,
            message: errorMessage(error),
            sectionResponseCharCount: sectionResponseChars,
            sectionDurationMs,
          };
          const sectionCommittedRecordCount = Math.max(0, records.length - sectionStartRecordCount);
          if (
            sectionCommittedRecordCount === 0 &&
            retryAttempt < PROJECT_BOARD_SECTION_RETRY_LIMIT &&
            shouldRetryProjectBoardSectionFailure(error, { signal: input.signal })
          ) {
            retryAttempt += 1;
            continue;
          }
          failedSectionCount += 1;
          if (failureKind === "semantic_idle_timeout") semanticIdleSectionCount += 1;
          const retryExhaustedRecords =
            retryAttempt > 0
              ? [
                  sectionRetryProgressRecord(section, {
                    status: "exhausted",
                    sectionNumber,
                    sectionCount: sections.length,
                    retryAttempt,
                    maxRetries: PROJECT_BOARD_SECTION_RETRY_LIMIT,
                    failureKind,
                    error: errorMessage(error),
                    sectionResponseCharCount: sectionResponseChars,
                    sectionDurationMs,
                  }),
                ]
              : [];
          const sectionRecords = [
            ...retryExhaustedRecords,
            ...sectionFailureRecords(section, {
              sectionNumber,
              sectionCount: sections.length,
              error,
              sectionResponseCharCount: sectionResponseChars,
              sectionDurationMs,
              failureKind,
              completedSectionCount: records.filter(
                (record) => record.type === "progress" && ["section_succeeded", "section_skipped"].includes(record.stage),
              ).length,
              candidateCardCount: records.filter((record) => record.type === "candidate_card").length,
              questionCount: records.filter((record) => record.type === "question").length,
            }),
          ];
          await emitSectionRecords(section, sectionNumber, sectionRecords, failureResponseCharCount);
          input.onProgress?.({
            stage: "schema_validation",
            title:
              failureKind === "semantic_idle_timeout"
                ? `Retry exhausted for stalled section ${sectionNumber}/${sections.length}`
                : `Retry exhausted for failed section ${sectionNumber}/${sections.length}`,
            summary:
              failureKind === "semantic_idle_timeout"
                ? `Kept this run recoverable after ${section.heading} stopped producing model content or planner records: ${errorMessage(error)}`
                : `Kept this run recoverable after ${section.heading} failed: ${errorMessage(error)}`,
            metadata: {
              recoverable: true,
              failureKind,
              failedSectionCount,
              semanticIdleSectionCount,
              skippedSectionCount,
              progressiveRecordCount: records.length,
              sectionId: section.id,
              sectionIndex: sectionNumber,
              sectionCount: sections.length,
              sectionHeading: section.heading,
              retryAttempt,
              maxRetries: PROJECT_BOARD_SECTION_RETRY_LIMIT,
              retriesExhausted: retryAttempt > 0,
              error: errorMessage(error),
            },
            promptCharCount: totalPromptCharCount,
            responseCharCount: failureResponseCharCount,
            cardCount: records.filter((record) => record.type === "candidate_card").length,
            questionCount: records.filter((record) => record.type === "question").length,
          });
          if (sectionResponseChars === 0 && isTransientProjectBoardSynthesisError(error) && !records.some((record) => record.type === "candidate_card")) {
            stoppedAfterTransientZeroOutputError = errorMessage(error);
            stopAfterCurrentSectionFailure = true;
          }
          sectionDone = true;
        }
      }
      if (stopAfterCurrentSectionFailure) break;
      if (await recordPauseCheckpoint(section, sectionNumber)) {
        paused = true;
        break;
      }
    }

    if (!records.some((record) => record.type === "candidate_card")) {
      if (stoppedAfterTransientZeroOutputError) {
        throw new Error(
          `Sectioned Ambient/Pi planning stopped after a transient zero-output provider error before any candidate cards were produced. Retry this synthesis run after the provider recovers. Last error: ${stoppedAfterTransientZeroOutputError}`,
        );
      }
      throw new Error(
        `Sectioned Ambient/Pi planning did not produce any candidate cards. ${failedSectionCount} section${
          failedSectionCount === 1 ? "" : "s"
        } failed and ${skippedSectionCount} section${skippedSectionCount === 1 ? "" : "s"} were reused.`,
      );
    }
    const planningRecords = dedupeProgressiveRecords(records);
    const sourceDraft = projectBoardSynthesisDraftFromProgressiveRecords(planningRecords, {
      projectName: input.projectName,
      summary:
        failedSectionCount > 0
          ? `Recovered a partial board proposal from ${sections.length - failedSectionCount} completed Ambient/Pi section${
              sections.length - failedSectionCount === 1 ? "" : "s"
            }; ${failedSectionCount} section${failedSectionCount === 1 ? "" : "s"} can be retried.`
          : `Recovered a board proposal from ${sections.length} sectioned Ambient/Pi planning pass${sections.length === 1 ? "" : "es"}.`,
      goal: deterministicDraft.goal,
      currentState: deterministicDraft.currentState,
      targetUser: deterministicDraft.targetUser,
      qualityBar: deterministicDraft.qualityBar,
    });
    const { draft, finalRecords, scopeContractFilterCount } = await finalizeProjectBoardSynthesisDraft({
      sourceDraft,
      surface: "sectioned_synthesis",
      sources: input.sources,
      refinement: input.refinement,
      scopeContract,
      workflowScopeLimits,
      retainRecords: planningRecords,
      priorRecords: records,
      plannerWorkspace: input.plannerWorkspace,
      workspaceTailState,
      workspacePollErrorState,
      onProgress: input.onProgress,
    });
    return {
      draft,
      telemetry: {
        promptCharCount: totalPromptCharCount,
        responseCharCount: totalResponseCharCount,
        requestDurationMs: Date.now() - startedAt,
        cardCount: draft.cards.length,
        questionCount: draft.questions.length,
        progressiveRecordCount: finalRecords.length,
        scopeContractFilterCount,
        sectionCount: sections.length,
        batchCardLimit: maxCardsPerSection,
        skippedSectionCount,
        failedSectionCount,
        semanticIdleSectionCount,
        outputTokenBudget: sectionBudgetProfile.maxOutputTokens,
        modelBudgetProfile: sectionBudgetProfile,
        promptBudgetStatus: lastPromptBudgetAssessment?.status,
        promptBudgetWarningCount,
        maxPromptBudgetUtilization,
        lastPromptBudgetAssessment,
        plannerLedgerCompactionCount,
        plannerLedgerCompactionCacheHitCount,
        lastPlannerLedgerCompaction,
        paused,
        pauseReason: paused ? "user_cancelled" : undefined,
        partial: failedSectionCount > 0 || paused,
      },
      progressiveRecords: finalRecords,
      scopeContract,
      planningDepth,
    };
  }

  async synthesizePlannerBatchesWithTelemetry(input: {
    sources: ProjectBoardSynthesisSource[];
    projectName?: string;
    refinement?: ProjectBoardSynthesisRefinementContext;
    charterProjectSummary?: ProjectBoardCharterProjectSummary;
    resumeFromRecords?: ProposalJsonlRecordArtifact[];
    resumeContinuation?: ProjectBoardPlannerBatchContinuation;
    maxBatches?: number;
    maxCardsPerBatch?: number;
    onProgress?: (progress: AmbientProjectBoardSynthesisProgress) => void;
    onProgressiveRecords?: (batch: AmbientProjectBoardSynthesisProgressiveBatch) => void;
    plannerWorkspace?: ProjectBoardPlannerWorkspace;
    shouldPause?: (input: ProjectBoardSynthesisPauseCheckInput) => boolean | Promise<boolean>;
    signal?: AbortSignal;
  }): Promise<AmbientProjectBoardSynthesisResult> {
    const apiKey = (this.input.apiKey ?? readAmbientApiKey() ?? "").trim();
    if (!apiKey) throw new Error("Ambient API key is not configured.");
    const deterministicDraft = synthesizeProjectBoardDraft(input.sources);
    const operation = plannerBatchOperation(input);
    const llmScopeContract = await deriveProjectBoardScopeContractWithPi({
      apiKey,
      baseUrl: this.input.baseUrl,
      model: this.input.model,
      projectName: input.projectName,
      sources: input.sources,
      refinement: input.refinement,
      skipLlmCall: Boolean(this.input.fetchImpl || this.input.piTextCall),
      retryPolicy: this.input.retryPolicy,
      streamIdleTimeoutMs: this.input.streamIdleTimeoutMs,
      signal: input.signal,
      onProgress: input.onProgress,
    });
    const planningDepth = projectBoardPlanningDepthFromScopeContract(llmScopeContract);
    const workflowScopeLimits = projectBoardWorkflowScopeLimits({ scopeContract: llmScopeContract, sources: input.sources });
    const contract = buildProjectBoardPlanningContract({
      operation,
      projectName: input.projectName,
      profileName: inferPlanningProfileName(input.sources),
      charter: {
        goal: input.refinement?.previousDraft.goal ?? deterministicDraft.goal,
        proofPolicy: input.refinement?.previousDraft.qualityBar ?? deterministicDraft.qualityBar,
        decisionPolicy: input.refinement
          ? "Treat the supplied charter and PM Review answers as already settled unless they are incomplete or contradictory."
          : undefined,
        ...(input.charterProjectSummary ? { projectSummary: input.charterProjectSummary } : {}),
      },
      scopeContract: llmScopeContract,
    });
    const startedAt = Date.now();
    const wholeBoardSection = wholeBoardPlanningSection(input.sources, input.projectName);
    const records: ProposalJsonlRecordArtifact[] = dedupeProgressiveRecords(
      (input.resumeFromRecords ?? []).filter((record) => record.type !== "proposal_final"),
    );
    const workspaceTailState = createProjectBoardPlannerWorkspaceTailState(records);
    const maxBatches = normalizePlannerBatchLimit(input.maxBatches ?? (workflowScopeLimits.compact ? workflowScopeLimits.maxBatches : undefined));
    const maxCardsPerBatch = normalizePlannerBatchCardLimit(
      input.maxCardsPerBatch ?? (workflowScopeLimits.compact ? workflowScopeLimits.maxCardsPerBatch : undefined),
      input.plannerWorkspace,
    );
    const plannerBatchBudgetProfile = projectBoardModelBudgetProfile({
      model: this.input.model,
      operation: "planner_card_batch",
      maxCardsPerBatch,
    });
    let totalPromptCharCount = 0;
    let totalResponseCharCount = 0;
    let workspacePollQueue = Promise.resolve();
    let workspaceActivityToken = 0;
    let terminalStatus: PlannerBatchStatus | undefined;
    let lastBatchResponsePreview = "";
    let lastPlannerFinishReason: string | undefined;
    let lastPlannerOutputTokenBudget: number | undefined;
    let recoverableOutputStopCount = 0;
    let lastValidRecord: PlannerLastValidRecord | undefined;
    let promptBudgetWarningCount = 0;
    let maxPromptBudgetUtilization = 0;
    let lastPromptBudgetAssessment: ProjectBoardPromptBudgetAssessment | undefined;
    let plannerLedgerCompactionCount = 0;
    let plannerLedgerCompactionCacheHitCount = 0;
    let lastPlannerLedgerCompaction: ProjectBoardPlannerLedgerCompaction | undefined;
    let renderedCardDuplicateFilterCount = 0;
    const plannerBatchFinishReasons: string[] = [];
    const workspaceToolRuntime =
      input.plannerWorkspace && !this.input.fetchImpl
        ? projectBoardPlannerWorkspaceToolExecutor(input.plannerWorkspace, {
            sourceQaAnswerer: this.createPlannerSourceQaAnswerer({ apiKey, plannerWorkspace: input.plannerWorkspace, signal: input.signal }),
          })
        : undefined;

    const workspacePollErrorState = { warned: false };
    const scheduleWorkspacePoll = (batchNumber: number, currentBatchResponseChars = 0, includeIncompleteLastLine = false) => {
      if (!input.plannerWorkspace) return;
      workspacePollQueue = workspacePollQueue.then(
        guardedWorkspaceIoTask(
          async () => {
            const workspaceRecords = await pollProjectBoardPlannerWorkspaceRecords({
              workspace: input.plannerWorkspace,
              state: workspaceTailState,
              includeIncompleteLastLine,
            });
            const newRecords = recordsNotAlreadySeen(workspaceRecords, records);
            if (newRecords.length === 0) return;
            workspaceActivityToken += newRecords.length;
            records.push(...newRecords);
            input.onProgressiveRecords?.({
              records: newRecords,
              section: wholeBoardSection,
              sectionIndex: batchNumber,
              sectionCount: maxBatches,
              promptCharCount: totalPromptCharCount,
              responseCharCount: totalResponseCharCount + currentBatchResponseChars,
              accumulatedRecordCount: records.length,
            });
          },
          workspacePollErrorState,
          input.onProgress,
        ),
      );
    };

    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
      const batchNumber = batchIndex + 1;
      const rawPrompt = buildProjectBoardPlannerBatchPrompt({
        sources: input.sources,
        projectName: input.projectName,
        deterministicDraft,
        refinement: input.refinement,
        ...(input.charterProjectSummary ? { charterProjectSummary: input.charterProjectSummary } : {}),
        scopeContract: llmScopeContract,
        priorRecords: records,
        resumeContinuation: input.resumeContinuation,
        batchNumber,
        maxBatches,
        maxCardsPerBatch,
        plannerWorkspaceBlock: [
          projectBoardPlannerWorkspacePromptBlock(input.plannerWorkspace),
          projectBoardPlannerWorkspaceToolPromptBlock(workspaceToolRuntime ? input.plannerWorkspace : undefined),
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
      const rawPromptBudget = projectBoardPromptBudgetAssessment({ promptCharCount: rawPrompt.length, profile: plannerBatchBudgetProfile });
      let plannerLedgerCompaction: ProjectBoardPlannerLedgerCompaction | undefined;
      if (rawPromptBudget.summarizationRecommended) {
        const compactionCacheKey = plannerLedgerCompactionCacheKey({
          sources: input.sources,
          projectName: input.projectName,
          priorRecords: records,
          refinement: input.refinement,
          charterProjectSummary: input.charterProjectSummary,
          rawPromptBudget,
          batchNumber,
          maxBatches,
          maxCardsPerBatch,
        });
        const cachedCompaction = readCachedPlannerLedgerCompaction(records, compactionCacheKey, rawPromptBudget);
        const compactionStartedAt = Date.now();
        if (cachedCompaction) {
          plannerLedgerCompaction = cachedCompaction;
          plannerLedgerCompactionCacheHitCount += 1;
        } else {
          const compactionPrompt = buildPlannerLedgerCompactionPrompt({
            sources: input.sources,
            projectName: input.projectName,
            priorRecords: records,
            rawPromptBudget,
            batchNumber,
            maxBatches,
            maxCardsPerBatch,
          });
          input.onProgress?.({
            stage: "model_request",
            title: `Compacting planner ledger for batch ${batchNumber}`,
            summary: `The raw planner prompt reached ${rawPromptBudget.status}; compacting rendered-card and source ledgers before asking for the next cards.`,
            metadata: {
              plannerBatchIndex: batchNumber,
              plannerBatchCount: maxBatches,
              maxCardsPerBatch,
              plannerSessionId: input.plannerWorkspace?.sessionId,
              promptCharCount: totalPromptCharCount + compactionPrompt.length,
              ...projectBoardPromptBudgetRunMetadata({
                latestPromptCharCount: compactionPrompt.length,
                cumulativePromptCharCount: totalPromptCharCount + compactionPrompt.length,
                promptBudget: rawPromptBudget,
                plannerLedgerCompactionStatus: "started",
              }),
              compactionPromptCharCount: compactionPrompt.length,
              compactionCacheKey,
              rawPromptCharCount: rawPrompt.length,
              rawPromptBudgetAssessment: projectBoardPromptBudgetAssessmentMetadata(rawPromptBudget),
            },
            promptCharCount: totalPromptCharCount + compactionPrompt.length,
            cardCount: records.filter((record) => record.type === "candidate_card").length,
            questionCount: records.filter((record) => record.type === "question").length,
          });
          plannerLedgerCompaction = await this.compactPlannerBatchLedger({
            apiKey,
            prompt: compactionPrompt,
            sources: input.sources,
            priorRecords: records,
            rawPromptBudget,
            cacheKey: compactionCacheKey,
            batchNumber,
            maxBatches,
            maxCardsPerBatch,
            plannerSessionId: input.plannerWorkspace?.sessionId,
            signal: input.signal,
          });
        }
        plannerLedgerCompactionCount += 1;
        lastPlannerLedgerCompaction = plannerLedgerCompaction;
        totalPromptCharCount += plannerLedgerCompaction.promptCharCount;
        const compactionRecord = plannerLedgerCompactionProgressRecord({
          compaction: plannerLedgerCompaction,
          batchNumber,
          maxBatches,
          maxCardsPerBatch,
          plannerSessionId: input.plannerWorkspace?.sessionId,
          durationMs: Date.now() - compactionStartedAt,
        });
        markProjectBoardPlannerWorkspaceTailRecords(workspaceTailState, [compactionRecord]);
        await appendProjectBoardPlannerWorkspaceRecords(input.plannerWorkspace, [compactionRecord]);
        records.push(compactionRecord);
        input.onProgressiveRecords?.({
          records: [compactionRecord],
          section: wholeBoardSection,
          sectionIndex: batchNumber,
          sectionCount: maxBatches,
          promptCharCount: totalPromptCharCount,
          responseCharCount: totalResponseCharCount,
          accumulatedRecordCount: records.length,
        });
        input.onProgress?.({
          stage: "model_response",
          title: plannerLedgerCompaction.cacheHit
            ? `Reused cached planner ledger compaction for batch ${batchNumber}`
            : `Compacted planner ledger for batch ${batchNumber}`,
          summary: plannerLedgerCompaction.cacheHit
            ? `Reused cached planner-ledger compaction for ${plannerLedgerCompaction.renderedCardCount.toLocaleString()} rendered cards; ${plannerLedgerCompaction.omittedRenderedCardCount.toLocaleString()} omitted cards remain represented by the compacted summary.`
            : `Compacted ${plannerLedgerCompaction.renderedCardCount.toLocaleString()} rendered cards into reusable ledger context using ${plannerLedgerCompaction.source}; ${plannerLedgerCompaction.omittedRenderedCardCount.toLocaleString()} omitted cards remain represented by the compacted summary.`,
          metadata: {
            plannerBatchIndex: batchNumber,
            plannerBatchCount: maxBatches,
            plannerSessionId: input.plannerWorkspace?.sessionId,
            plannerLedgerCompactionStatus: plannerLedgerCompaction.cacheHit ? "cache_hit" : "used",
            plannerLedgerCompaction: plannerLedgerCompactionTelemetryMetadata(plannerLedgerCompaction),
            compactionDurationMs: Date.now() - compactionStartedAt,
          },
          promptCharCount: totalPromptCharCount,
          cardCount: records.filter((record) => record.type === "candidate_card").length,
          questionCount: records.filter((record) => record.type === "question").length,
        });
      }
      const prompt = plannerLedgerCompaction
        ? buildProjectBoardPlannerBatchPrompt({
            sources: input.sources,
            projectName: input.projectName,
            deterministicDraft,
            refinement: input.refinement,
            ...(input.charterProjectSummary ? { charterProjectSummary: input.charterProjectSummary } : {}),
            scopeContract: llmScopeContract,
            priorRecords: records,
            resumeContinuation: input.resumeContinuation,
            batchNumber,
            maxBatches,
            maxCardsPerBatch,
            plannerWorkspaceBlock: [
              projectBoardPlannerWorkspacePromptBlock(input.plannerWorkspace),
              projectBoardPlannerWorkspaceToolPromptBlock(workspaceToolRuntime ? input.plannerWorkspace : undefined),
            ]
              .filter(Boolean)
              .join("\n\n"),
            plannerLedgerCompaction,
          })
        : rawPrompt;
      if (plannerLedgerCompaction) plannerLedgerCompaction.finalPromptCharCount = prompt.length;
      totalPromptCharCount += prompt.length;
      const promptBudget = projectBoardPromptBudgetAssessment({ promptCharCount: prompt.length, profile: plannerBatchBudgetProfile });
      lastPromptBudgetAssessment = promptBudget;
      maxPromptBudgetUtilization = Math.max(maxPromptBudgetUtilization, promptBudget.softPromptBudgetUtilization);
      const promptBudgetMetadata = projectBoardPromptBudgetAssessmentMetadata(promptBudget);
      input.onProgress?.({
        stage: "model_request",
        title: `Asked Ambient/Pi for planner batch ${batchNumber}`,
        summary: `Requested the next ${maxCardsPerBatch} or fewer project-board cards using the current planner ledger.`,
        metadata: {
          promptCharCount: totalPromptCharCount,
          ...projectBoardPromptBudgetRunMetadata({
            latestPromptCharCount: prompt.length,
            cumulativePromptCharCount: totalPromptCharCount,
            promptBudget,
            rawPromptBudget,
            plannerLedgerCompactionStatus: plannerLedgerCompaction ? (plannerLedgerCompaction.cacheHit ? "cache_hit" : "used") : "skipped",
            plannerLedgerCompactionSkipReason: plannerLedgerCompaction
              ? undefined
              : rawPromptBudget.summarizationRecommended
                ? "planner_ledger_compaction_unavailable"
                : "raw_prompt_below_threshold",
          }),
          plannerBatchIndex: batchNumber,
          plannerBatchCount: maxBatches,
          maxCardsPerBatch,
          planningOperation: operation,
          planningProfile: contract.profile.name,
          ...pmReviewActivationTelemetryMetadata(input.refinement?.pmReviewReport),
          plannerSessionId: input.plannerWorkspace?.sessionId,
          plannerLedgerPath: input.plannerWorkspace?.ledgerPath,
          transportMode: this.plannerTransportMode(),
          plannerContinuation: input.resumeContinuation,
          outputTokenBudget: plannerBatchBudgetProfile.maxOutputTokens,
          modelBudgetProfile: projectBoardModelBudgetProfileMetadata(plannerBatchBudgetProfile),
          promptBudgetAssessment: promptBudgetMetadata,
          rawPromptBudgetAssessment: projectBoardPromptBudgetAssessmentMetadata(rawPromptBudget),
          plannerLedgerCompaction: plannerLedgerCompaction ? plannerLedgerCompactionTelemetryMetadata(plannerLedgerCompaction) : undefined,
        },
        promptCharCount: totalPromptCharCount,
        cardCount: records.filter((record) => record.type === "candidate_card").length,
        questionCount: records.filter((record) => record.type === "question").length,
      });
      const promptBudgetWarning = plannerPromptBudgetWarningRecord({
        assessment: promptBudget,
        batchNumber,
        maxBatches,
        maxCardsPerBatch,
        plannerSessionId: input.plannerWorkspace?.sessionId,
      });
      if (promptBudgetWarning) {
        promptBudgetWarningCount += 1;
        markProjectBoardPlannerWorkspaceTailRecords(workspaceTailState, [promptBudgetWarning]);
        await appendProjectBoardPlannerWorkspaceRecords(input.plannerWorkspace, [promptBudgetWarning]);
        records.push(promptBudgetWarning);
        input.onProgressiveRecords?.({
          records: [promptBudgetWarning],
          section: wholeBoardSection,
          sectionIndex: batchNumber,
          sectionCount: maxBatches,
          promptCharCount: totalPromptCharCount,
          responseCharCount: totalResponseCharCount,
          accumulatedRecordCount: records.length,
        });
      }
      const batchStartedAt = Date.now();
      let batchResponseChars = 0;
      const batchStartRecordCount = records.length;
      const workspacePollTimer = input.plannerWorkspace
        ? setInterval(
            () => scheduleWorkspacePoll(batchNumber, batchResponseChars),
            projectBoardWorkspacePollIntervalMs(this.input.streamIdleTimeoutMs),
          )
        : undefined;
      let responseResult: AmbientProjectBoardSynthesisCallResult | undefined;
      try {
        responseResult = await this.callAmbientForSynthesisWithMetadata({
          apiKey,
          system: contract.systemPrompt,
          prompt,
          maxTokens: plannerBatchBudgetProfile.maxOutputTokens,
          reasoning: contract.reasoning,
          sessionId: input.plannerWorkspace?.sessionId,
          tools: workspaceToolRuntime?.tools,
          executeTool: workspaceToolRuntime?.execute,
          onToolProgress: (progress) => {
            workspaceActivityToken += 1;
            if (progress.status === "error") {
              const toolRecord = projectBoardPlannerToolProgressToRecord(progress);
              void appendProjectBoardPlannerWorkspaceRecords(input.plannerWorkspace, [toolRecord]).catch(() => undefined);
            }
            input.onProgress?.({
              stage: "model_response",
              title: `Planner tool ${progress.toolName} ${progress.status}`,
              summary: progress.resultSummary || progress.error || progress.inputSummary || `Planner tool ${progress.toolName} ${progress.status}.`,
              metadata: {
                plannerBatchIndex: batchNumber,
                plannerBatchCount: maxBatches,
                plannerSessionId: input.plannerWorkspace?.sessionId,
                toolCallId: progress.toolCallId,
                toolName: progress.toolName,
                toolStatus: progress.status,
                toolElapsedMs: progress.elapsedMs,
                plannerWorkspaceRoot: input.plannerWorkspace?.rootPath,
              },
            });
            scheduleWorkspacePoll(batchNumber, batchResponseChars);
          },
          onChunk: (responseCharCount) => {
            batchResponseChars = responseCharCount;
            input.onProgress?.({
              stage: "model_response",
              title: `Receiving planner batch ${batchNumber}`,
              summary: `Received ${responseCharCount.toLocaleString()} planner-batch response characters so far.`,
              metadata: {
                responseCharCount: totalResponseCharCount + responseCharCount,
                batchResponseCharCount: responseCharCount,
                plannerBatchIndex: batchNumber,
                plannerBatchCount: maxBatches,
                streaming: true,
                transportMode: this.plannerTransportMode(),
              },
              responseCharCount: totalResponseCharCount + responseCharCount,
            });
            scheduleWorkspacePoll(batchNumber, responseCharCount);
          },
          onTransientRetry: (retry) => {
            input.onProgress?.({
              stage: "model_response",
              title: `Retrying transient planner batch ${batchNumber}`,
              summary: `Ambient/Pi failed before replay-sensitive planner-batch output; retrying provider attempt ${retry.retryAttempt}/${retry.maxRetries} after ${retry.delayMs.toLocaleString()} ms.`,
              metadata: {
                transientRetry: true,
                aggressiveRetries: retry.aggressive,
                retryAttempt: retry.retryAttempt,
                maxRetries: retry.maxRetries,
                retryDelayMs: retry.delayMs,
                error: retry.error,
                plannerBatchIndex: batchNumber,
                plannerBatchCount: maxBatches,
                outputChars: retry.outputChars,
                committedRecordCount: retry.committedRecordCount,
                transportMode: this.plannerTransportMode(),
              },
              responseCharCount: totalResponseCharCount + batchResponseChars,
            });
          },
          contentActivityToken: () => workspaceActivityToken,
          committedRecordCount: () => Math.max(0, records.length - batchStartRecordCount),
          signal: input.signal,
        });
      } finally {
        if (workspacePollTimer) clearInterval(workspacePollTimer);
      }
      if (!responseResult) throw new Error("Ambient project-board planner batch returned no transport result.");
      const responseText = responseResult.text;
      if (responseResult.finishReason) {
        lastPlannerFinishReason = responseResult.finishReason;
        plannerBatchFinishReasons.push(responseResult.finishReason);
      }
      if (responseResult.outputTokenBudget !== undefined) lastPlannerOutputTokenBudget = responseResult.outputTokenBudget;
      const recoverableOutputStop = isRecoverablePlannerOutputStop(responseResult.finishReason);
      if (recoverableOutputStop) recoverableOutputStopCount += 1;
      await workspacePollQueue;
      batchResponseChars = responseText.length;
      lastBatchResponsePreview = previewProjectBoardPlannerResponse(responseText);
      scheduleWorkspacePoll(batchNumber, batchResponseChars, true);
      await workspacePollQueue;
      totalResponseCharCount += responseText.length;
      input.onProgress?.({
        stage: "model_response",
        title: `Received planner batch ${batchNumber}`,
        summary: `Received ${batchResponseChars.toLocaleString()} response characters for planner batch ${batchNumber}.`,
        metadata: {
          responseCharCount: totalResponseCharCount,
          batchResponseCharCount: batchResponseChars,
          batchDurationMs: Date.now() - batchStartedAt,
          finishReason: responseResult.finishReason,
          stopReason: responseResult.stopReason,
          outputTokenBudget: responseResult.outputTokenBudget,
          modelBudgetProfile: projectBoardModelBudgetProfileMetadata(plannerBatchBudgetProfile),
          promptBudgetAssessment: promptBudgetMetadata,
          usage: responseResult.usage,
          recoverableOutputStop,
          plannerBatchIndex: batchNumber,
          plannerBatchCount: maxBatches,
          streaming: true,
          transportMode: this.plannerTransportMode(),
        },
        responseCharCount: totalResponseCharCount,
      });

      const batchWorkspaceRecordCount = records.length - batchStartRecordCount;
      let limitedBatchRecords: ProposalJsonlRecordArtifact[];
      try {
        limitedBatchRecords = attachPlannerRecordSourceSnapshots(
          limitPlannerBatchCandidateCardRecords(
            normalizePlannerBatchRecords(responseText, {
              projectName: input.projectName,
              sources: input.sources,
              batchWorkspaceRecordCount,
            }),
            maxCardsPerBatch,
            wholeBoardSection,
          ),
          input.sources,
        );
        assertValidProjectBoardGeneratedRecordTitles(limitedBatchRecords, {
          surface: "planner_batch",
          batchNumber,
          maxBatches,
        });
        assertValidClarificationQuestionRecords(limitedBatchRecords, input.refinement, {
          surface: "planner_batch",
          batchNumber,
          maxBatches,
        });
      } catch (error) {
        const validationLastValidRecord = lastValidPlannerRecord(records) ?? lastValidRecord;
        if (validationLastValidRecord) lastValidRecord = validationLastValidRecord;
        terminalStatus = "validation_failed";
        const failureRecords = plannerBatchValidationFailureRecords({
          batchNumber,
          maxBatches,
          maxCardsPerBatch,
          error,
          batchResponseCharCount: batchResponseChars,
          batchDurationMs: Date.now() - batchStartedAt,
          plannerSessionId: input.plannerWorkspace?.sessionId,
          finishReason: responseResult.finishReason,
          stopReason: responseResult.stopReason,
          outputTokenBudget: responseResult.outputTokenBudget,
          modelBudgetProfile: plannerBatchBudgetProfile,
          promptBudgetAssessment: promptBudget,
          usage: responseResult.usage,
          lastValidRecord: validationLastValidRecord,
          responsePreview: lastBatchResponsePreview,
        });
        const newFailureRecords = recordsNotAlreadySeen(failureRecords, records);
        markProjectBoardPlannerWorkspaceTailRecords(workspaceTailState, newFailureRecords);
        await appendProjectBoardPlannerWorkspaceRecords(input.plannerWorkspace, newFailureRecords);
        records.push(...newFailureRecords);
        input.onProgressiveRecords?.({
          records: newFailureRecords,
          section: wholeBoardSection,
          sectionIndex: batchNumber,
          sectionCount: maxBatches,
          promptCharCount: totalPromptCharCount,
          responseCharCount: totalResponseCharCount,
          accumulatedRecordCount: records.length,
        });
        input.onProgress?.({
          stage: "schema_validation",
          title: `Failed planner batch ${batchNumber}`,
          summary: `Planner batch ${batchNumber} returned invalid progressive planning records; validated prior records remain reusable on resume.`,
          metadata: {
            plannerBatchIndex: batchNumber,
            plannerBatchCount: maxBatches,
            plannerStatus: "validation_failed",
            maxCardsPerBatch,
            batchRecordCount: newFailureRecords.length,
            progressiveRecordCount: records.length,
            candidateCardCount: records.filter((record) => record.type === "candidate_card").length,
            questionCount: records.filter((record) => record.type === "question").length,
            plannerSessionId: input.plannerWorkspace?.sessionId,
            plannerLedgerPath: input.plannerWorkspace?.ledgerPath,
            finishReason: responseResult.finishReason,
            stopReason: responseResult.stopReason,
            outputTokenBudget: responseResult.outputTokenBudget,
            modelBudgetProfile: projectBoardModelBudgetProfileMetadata(plannerBatchBudgetProfile),
            promptBudgetAssessment: promptBudgetMetadata,
            lastValidRecordId: validationLastValidRecord?.recordId,
            lastValidRecordType: validationLastValidRecord?.recordType,
            validationError: errorMessage(error),
          },
          promptCharCount: totalPromptCharCount,
          responseCharCount: totalResponseCharCount,
          cardCount: records.filter((record) => record.type === "candidate_card").length,
          questionCount: records.filter((record) => record.type === "question").length,
        });
        break;
      }
      const renderedDuplicateFilter = filterPlannerBatchRenderedCardDuplicates(limitedBatchRecords, records, wholeBoardSection, input.sources);
      renderedCardDuplicateFilterCount += renderedDuplicateFilter.diagnostics.length;
      const normalizedBatchRecords = renderedDuplicateFilter.records;
      const proofScopeWarnings = projectBoardProofScopeWarningRecords(
        normalizedBatchRecords.flatMap((record) =>
          record.type === "candidate_card"
            ? [
                {
                  sourceId: record.sourceId,
                  title: record.title,
                  description: record.description,
                  phase: record.phase,
                  labels: record.labels,
                  acceptanceCriteria: record.acceptanceCriteria,
                  testPlan: record.testPlan,
                },
              ]
            : [],
        ),
        new Date().toISOString(),
      );
      const batchWindowRecords = records.slice(batchStartRecordCount);
      const batchLastValidRecord = lastValidPlannerRecord([...batchWindowRecords, ...normalizedBatchRecords]);
      if (batchLastValidRecord) lastValidRecord = batchLastValidRecord;
      const pauseRequested =
        (await input.shouldPause?.({
          phase: "planner_batch",
          batchNumber,
          batchCount: maxBatches,
          recordCount: records.length + normalizedBatchRecords.length,
          lastValidRecord: batchLastValidRecord ?? lastValidRecord,
        })) === true;
      const batchStatus = pauseRequested
        ? "user_cancelled"
        : recoverableOutputStop
          ? "budget_exhausted"
          : plannerBatchStatusFromResponse(responseText, normalizedBatchRecords);
      terminalStatus = batchStatus === "continue" ? undefined : batchStatus;
      const batchRecords = [
        ...normalizedBatchRecords,
        ...renderedDuplicateFilter.warningRecords,
        ...proofScopeWarnings,
        plannerBatchProgressRecord({
          batchNumber,
          maxBatches,
          status: batchStatus,
          maxCardsPerBatch,
          recordCount: normalizedBatchRecords.length,
          batchResponseCharCount: batchResponseChars,
          batchDurationMs: Date.now() - batchStartedAt,
          plannerSessionId: input.plannerWorkspace?.sessionId,
          finishReason: responseResult.finishReason,
          stopReason: pauseRequested ? "pause_requested" : responseResult.stopReason,
          outputTokenBudget: responseResult.outputTokenBudget,
          modelBudgetProfile: plannerBatchBudgetProfile,
          promptBudgetAssessment: promptBudget,
          usage: responseResult.usage,
          recoverableOutputStop: recoverableOutputStop || pauseRequested,
          lastValidRecord: batchLastValidRecord,
        }),
      ];
      const newBatchRecords = recordsNotAlreadySeen(batchRecords, records);
      markProjectBoardPlannerWorkspaceTailRecords(workspaceTailState, newBatchRecords);
      await appendProjectBoardPlannerWorkspaceRecords(input.plannerWorkspace, newBatchRecords);
      records.push(...newBatchRecords);
      input.onProgressiveRecords?.({
        records: newBatchRecords,
        section: wholeBoardSection,
        sectionIndex: batchNumber,
        sectionCount: maxBatches,
        promptCharCount: totalPromptCharCount,
        responseCharCount: totalResponseCharCount,
        accumulatedRecordCount: records.length,
      });
      input.onProgress?.({
        stage: "schema_validation",
        title: `Validated planner batch ${batchNumber}`,
        summary: `Imported ${newBatchRecords.length} planning record${
          newBatchRecords.length === 1 ? "" : "s"
        } from planner batch ${batchNumber}${
          renderedDuplicateFilter.diagnostics.length
            ? `; filtered ${renderedDuplicateFilter.diagnostics.length} already-rendered candidate card${
                renderedDuplicateFilter.diagnostics.length === 1 ? "" : "s"
              }`
            : ""
        }.`,
        metadata: {
          plannerBatchIndex: batchNumber,
          plannerBatchCount: maxBatches,
          plannerStatus: batchStatus,
          maxCardsPerBatch,
          batchRecordCount: newBatchRecords.length,
          progressiveRecordCount: records.length,
          candidateCardCount: records.filter((record) => record.type === "candidate_card").length,
          questionCount: records.filter((record) => record.type === "question").length,
          sourceCoverageCount: records.filter((record) => record.type === "source_coverage").length,
          dependencyEdgeCount: records.filter((record) => record.type === "dependency_edge").length,
          renderedCardDuplicateFilterCount: renderedDuplicateFilter.diagnostics.length,
          renderedCardDuplicateFilterTotal: renderedCardDuplicateFilterCount,
          renderedCardDuplicateCandidates: renderedDuplicateFilter.diagnostics.slice(0, 20),
          plannerSessionId: input.plannerWorkspace?.sessionId,
          plannerLedgerPath: input.plannerWorkspace?.ledgerPath,
          remainingCoverageCount: remainingPlannerCoverageSourceIds(input.sources, records).length,
          lastCandidateTitle: lastCandidateTitle(newBatchRecords),
          lastQuestion: lastQuestion(newBatchRecords),
          finishReason: responseResult.finishReason,
          outputTokenBudget: responseResult.outputTokenBudget,
          modelBudgetProfile: projectBoardModelBudgetProfileMetadata(plannerBatchBudgetProfile),
          promptBudgetAssessment: promptBudgetMetadata,
          recoverableOutputStop,
          lastValidRecordId: batchLastValidRecord?.recordId,
          lastValidRecordType: batchLastValidRecord?.recordType,
          pauseRequested,
        },
        promptCharCount: totalPromptCharCount,
        responseCharCount: totalResponseCharCount,
        cardCount: records.filter((record) => record.type === "candidate_card").length,
        questionCount: records.filter((record) => record.type === "question").length,
      });

      if (terminalStatus || remainingPlannerCoverageSourceIds(input.sources, records).length === 0) {
        if (!terminalStatus) terminalStatus = "planning_complete";
        break;
      }
    }

    if (!records.some((record) => record.type === "candidate_card")) {
      const fallbackFiltered = filterProjectBoardGeneratedCards(deterministicDraft, {
        sources: input.sources,
        refinement: input.refinement,
        scopeContract: llmScopeContract,
      });
      const fallbackScopedDraftLimit = limitProjectBoardWorkflowDraft(
        fallbackFiltered.draft,
        workflowScopeLimits,
        "planner_batch_empty_fallback",
      );
      const fallbackDraft = fallbackScopedDraftLimit.draft;
      if (fallbackDraft.cards.length > 0) {
        const fallbackWarning = validateProposalJsonlRecordArtifact({
          type: "warning",
          code: "planner_batch_empty_fallback",
          message: lastBatchResponsePreview
            ? `Ambient/Pi planner batch produced no candidate cards, so Ambient recovered the compact saved durable-plan card. Last response preview: ${lastBatchResponsePreview}`
            : "Ambient/Pi planner batch produced no candidate cards, so Ambient recovered the compact saved durable-plan card.",
          createdAt: new Date().toISOString(),
          metadata: {
            plannerStatus: terminalStatus ?? "empty",
            fallbackCardCount: fallbackDraft.cards.length,
            responsePreview: lastBatchResponsePreview,
            finishReason: lastPlannerFinishReason,
          },
        });
        const fallbackRecords = dedupeProgressiveRecords([
          ...records,
          fallbackWarning,
          ...fallbackFiltered.warningRecords,
          ...fallbackScopedDraftLimit.warningRecords,
          ...projectBoardProgressiveRecordsFromDraft({
            draft: fallbackDraft,
            sources: input.sources,
            includeProgress: false,
          }),
        ]);
        const finalWorkspaceRecords = recordsNotAlreadySeen(fallbackRecords, records);
        markProjectBoardPlannerWorkspaceTailRecords(workspaceTailState, finalWorkspaceRecords);
        await guardedWorkspaceIoTask(
          () => appendProjectBoardPlannerWorkspaceRecords(input.plannerWorkspace, finalWorkspaceRecords),
          workspacePollErrorState,
          input.onProgress,
        )();
        input.onProgressiveRecords?.({
          records: finalWorkspaceRecords,
          section: wholeBoardSection,
          sectionIndex: maxBatches,
          sectionCount: maxBatches,
          promptCharCount: totalPromptCharCount,
          responseCharCount: totalResponseCharCount,
          accumulatedRecordCount: fallbackRecords.length,
        });
        input.onProgress?.({
          stage: "schema_validation",
          title: "Recovered compact durable-plan card",
          summary: `Ambient/Pi did not return candidate cards, so Ambient recovered ${fallbackDraft.cards.length} compact durable-plan card${
            fallbackDraft.cards.length === 1 ? "" : "s"
          }.`,
          metadata: {
            plannerStatus: terminalStatus ?? "empty",
            deterministicFallback: true,
            fallbackCardCount: fallbackDraft.cards.length,
            responsePreview: lastBatchResponsePreview,
          },
          promptCharCount: totalPromptCharCount,
          responseCharCount: totalResponseCharCount,
          cardCount: fallbackDraft.cards.length,
          questionCount: fallbackDraft.questions.length,
        });
        return {
          draft: fallbackDraft,
          telemetry: {
            promptCharCount: totalPromptCharCount,
            responseCharCount: totalResponseCharCount,
            requestDurationMs: Date.now() - startedAt,
            cardCount: fallbackDraft.cards.length,
            questionCount: fallbackDraft.questions.length,
            progressiveRecordCount: fallbackRecords.length,
            plannerBatchCount: maxBatches,
            batchCardLimit: maxCardsPerBatch,
            outputTokenBudget: plannerBatchBudgetProfile.maxOutputTokens,
            modelBudgetProfile: plannerBatchBudgetProfile,
            promptBudgetStatus: lastPromptBudgetAssessment?.status,
            promptBudgetWarningCount,
            maxPromptBudgetUtilization,
            lastPromptBudgetAssessment,
            plannerLedgerCompactionCount,
            plannerLedgerCompactionCacheHitCount,
            lastPlannerLedgerCompaction,
            recoverableOutputStopCount,
            renderedCardDuplicateFilterCount: renderedCardDuplicateFilterCount + fallbackFiltered.diagnostics.length,
            scopeContractFilterCount:
              scopeContractFilterCountFromRecords(fallbackFiltered.warningRecords) +
              scopeContractFilterCountFromRecords(fallbackScopedDraftLimit.warningRecords),
            partial: true,
          },
          progressiveRecords: fallbackRecords,
        };
      }
      throw new Error(
        lastBatchResponsePreview
          ? `Planner-batch Ambient/Pi synthesis did not produce any candidate cards. Last response preview: ${lastBatchResponsePreview}`
          : "Planner-batch Ambient/Pi synthesis did not produce any candidate cards.",
      );
    }
    if (!terminalStatus) terminalStatus = "budget_exhausted";
    const planningRecords = dedupeProgressiveRecords(records);
    const sourceDraft = projectBoardSynthesisDraftFromProgressiveRecords(planningRecords, {
      projectName: input.projectName,
      summary: `Recovered a board proposal from ${planningRecords.filter((record) => record.type === "progress" && record.stage === "planner_batch_succeeded").length} planner batch${planningRecords.filter((record) => record.type === "progress" && record.stage === "planner_batch_succeeded").length === 1 ? "" : "es"}.`,
      goal: deterministicDraft.goal,
      currentState: deterministicDraft.currentState,
      targetUser: deterministicDraft.targetUser,
      qualityBar: deterministicDraft.qualityBar,
    });
    const { draft, finalRecords, scopeContractFilterCount } = await finalizeProjectBoardSynthesisDraft({
      sourceDraft,
      surface: "planner_batch_synthesis",
      sources: input.sources,
      refinement: input.refinement,
      scopeContract: llmScopeContract,
      workflowScopeLimits,
      retainRecords: planningRecords,
      priorRecords: records,
      plannerWorkspace: input.plannerWorkspace,
      workspaceTailState,
      workspacePollErrorState,
      onProgress: input.onProgress,
    });
    return {
      draft,
      telemetry: {
        promptCharCount: totalPromptCharCount,
        responseCharCount: totalResponseCharCount,
        requestDurationMs: Date.now() - startedAt,
        cardCount: draft.cards.length,
        questionCount: draft.questions.length,
        progressiveRecordCount: finalRecords.length,
        scopeContractFilterCount,
        plannerBatchCount: planningRecords.filter((record) => record.type === "progress" && record.stage === "planner_batch_succeeded").length,
        batchCardLimit: maxCardsPerBatch,
        finishReason: lastPlannerFinishReason,
        plannerBatchFinishReasons,
        recoverableOutputStopCount,
        outputTokenBudget: lastPlannerOutputTokenBudget,
        modelBudgetProfile: plannerBatchBudgetProfile,
        promptBudgetStatus: lastPromptBudgetAssessment?.status,
        promptBudgetWarningCount,
        maxPromptBudgetUtilization,
        lastPromptBudgetAssessment,
        plannerLedgerCompactionCount,
        plannerLedgerCompactionCacheHitCount,
        lastPlannerLedgerCompaction,
        lastValidRecordId: lastValidRecord?.recordId,
        lastValidRecordType: lastValidRecord?.recordType,
        paused: terminalStatus === "user_cancelled",
        pauseReason: terminalStatus === "user_cancelled" ? "user_cancelled" : undefined,
        renderedCardDuplicateFilterCount,
        partial:
          terminalStatus === "budget_exhausted" ||
          terminalStatus === "validation_failed" ||
          terminalStatus === "stale_source_snapshot" ||
          terminalStatus === "user_cancelled",
      },
      progressiveRecords: finalRecords,
      scopeContract: llmScopeContract,
      planningDepth,
    };
  }

  private async compactPlannerBatchLedger(input: {
    apiKey: string;
    prompt: string;
    sources: ProjectBoardSynthesisSource[];
    priorRecords: ProposalJsonlRecordArtifact[];
    rawPromptBudget: ProjectBoardPromptBudgetAssessment;
    cacheKey: string;
    batchNumber: number;
    maxBatches: number;
    maxCardsPerBatch: number;
    plannerSessionId?: string;
    signal?: AbortSignal;
  }): Promise<ProjectBoardPlannerLedgerCompaction> {
    const fallback = deterministicPlannerLedgerCompaction({
      sources: input.sources,
      priorRecords: input.priorRecords,
      rawPromptBudget: input.rawPromptBudget,
      cacheKey: input.cacheKey,
      promptCharCount: input.prompt.length,
      responseCharCount: 0,
    });
    if (this.input.fetchImpl && !this.input.piTextCall) return fallback;
    const textCall = this.input.piTextCall ?? callWorkflowPiText;
    const budgetProfile = projectBoardModelBudgetProfile({
      model: this.input.model,
      operation: "planner_ledger_compaction",
    });
    try {
      const text = await textCall({
        apiKey: input.apiKey,
        baseUrl: this.input.baseUrl,
        model: this.input.model,
        systemPrompt: PROJECT_BOARD_PLANNER_LEDGER_COMPACTION_SYSTEM_PROMPT,
        prompt: input.prompt,
        sessionId: stableBoardArtifactId("planner-ledger-compaction-session", [
          input.plannerSessionId ?? "no-workspace-session",
          String(input.batchNumber),
        ]),
        temperature: 0,
        maxTokens: budgetProfile.maxOutputTokens,
        reasoning: false,
        responseFormat: { type: "json_object" },
        retryPolicy: this.input.retryPolicy,
        idleTimeoutMs: normalizeAmbientStreamIdleTimeoutMs(this.input.streamIdleTimeoutMs),
        signal: input.signal,
      });
      return normalizePlannerLedgerCompactionText(text, fallback, {
        promptCharCount: input.prompt.length,
        responseCharCount: text.length,
        rawPromptBudget: input.rawPromptBudget,
      });
    } catch (error) {
      return {
        ...fallback,
        error: errorMessage(error),
      };
    }
  }

  private async callAmbientForSynthesis(input: {
    apiKey: string;
    system: string;
    prompt: string;
    maxTokens: number;
    reasoning?: ProjectBoardSynthesisReasoning;
    onChunk?: (responseCharCount: number) => void;
    contentActivityToken?: () => unknown;
    sessionId?: string;
    tools?: Parameters<typeof callWorkflowPiText>[0]["tools"];
    executeTool?: Parameters<typeof callWorkflowPiText>[0]["executeTool"];
    onToolProgress?: Parameters<typeof callWorkflowPiText>[0]["onToolProgress"];
    onTransientRetry?: (event: ProjectBoardSynthesisTransientRetryEvent) => void;
    committedRecordCount?: () => number;
    signal?: AbortSignal;
  }): Promise<string> {
    return (await this.callAmbientForSynthesisWithMetadata(input)).text;
  }

  private async callAmbientForSynthesisWithMetadata(input: {
    apiKey: string;
    system: string;
    prompt: string;
    maxTokens: number;
    reasoning?: ProjectBoardSynthesisReasoning;
    onChunk?: (responseCharCount: number) => void;
    contentActivityToken?: () => unknown;
    sessionId?: string;
    tools?: Parameters<typeof callWorkflowPiText>[0]["tools"];
    executeTool?: Parameters<typeof callWorkflowPiText>[0]["executeTool"];
    onToolProgress?: Parameters<typeof callWorkflowPiText>[0]["onToolProgress"];
    onTransientRetry?: (event: ProjectBoardSynthesisTransientRetryEvent) => void;
    committedRecordCount?: () => number;
    signal?: AbortSignal;
  }): Promise<AmbientProjectBoardSynthesisCallResult> {
    const retryPolicy = this.input.retryPolicy?.enabled ? this.input.retryPolicy : undefined;
    const maxAttempts = retryPolicy ? retryPolicy.maxRetries + 1 : projectBoardSynthesisTransientAttemptCount();
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let attemptOutputChars = 0;
      try {
        return await this.callAmbientForSynthesisWithMetadataAttempt({
          ...input,
          onChunk: (responseCharCount) => {
            attemptOutputChars = responseCharCount;
            input.onChunk?.(responseCharCount);
          },
        });
      } catch (error) {
        const committedRecordCount = Math.max(0, Math.floor(input.committedRecordCount?.() ?? 0));
        if (
          !shouldRetryProjectBoardSynthesisTransient(error, {
            attempt,
            maxAttempts,
            outputChars: attemptOutputChars,
            committedRecordCount,
            aggressive: Boolean(retryPolicy),
            signal: input.signal,
          })
        ) {
          throw error;
        }
        const retryAttempt = attempt;
        const delayMs = retryPolicy ? retryDelayForAttempt(retryPolicy, retryAttempt) : projectBoardSynthesisTransientRetryDelayMs(attempt);
        input.onTransientRetry?.({
          attempt,
          retryAttempt,
          maxAttempts,
          maxRetries: maxAttempts - 1,
          delayMs,
          error: errorMessage(error),
          outputChars: attemptOutputChars,
          committedRecordCount,
          aggressive: Boolean(retryPolicy),
        });
        await (this.input.waitForRetry ?? delayProjectBoardSynthesisRetry)(delayMs, input.signal);
      }
    }
    throw new Error("Ambient project-board synthesis retry loop exhausted unexpectedly.");
  }

  private async callAmbientForSynthesisWithMetadataAttempt(input: {
    apiKey: string;
    system: string;
    prompt: string;
    maxTokens: number;
    reasoning?: ProjectBoardSynthesisReasoning;
    onChunk?: (responseCharCount: number) => void;
    contentActivityToken?: () => unknown;
    sessionId?: string;
    tools?: Parameters<typeof callWorkflowPiText>[0]["tools"];
    executeTool?: Parameters<typeof callWorkflowPiText>[0]["executeTool"];
    onToolProgress?: Parameters<typeof callWorkflowPiText>[0]["onToolProgress"];
    onTransientRetry?: (event: ProjectBoardSynthesisTransientRetryEvent) => void;
    committedRecordCount?: () => number;
    signal?: AbortSignal;
  }): Promise<AmbientProjectBoardSynthesisCallResult> {
    if (!this.input.fetchImpl) {
      const textCall = this.input.piTextCall ?? callWorkflowPiText;
      let lastOutputChars = 0;
      let completion: WorkflowPiCompletionMetadata | undefined;
      const text = await textCall({
        apiKey: input.apiKey,
        baseUrl: this.input.baseUrl,
        model: this.input.model,
        systemPrompt: input.system,
        prompt: input.prompt,
        sessionId: input.sessionId,
        temperature: 0.1,
        maxTokens: input.maxTokens,
        reasoning: projectBoardPiTextReasoning(this.input.reasoning ?? input.reasoning),
        responseFormat: { type: "json_object" },
        tools: input.tools,
        executeTool: input.executeTool,
        onToolProgress: input.onToolProgress,
        onCompleted: (metadata) => {
          completion = metadata;
        },
        maxToolRounds: input.tools?.length ? normalizeProjectBoardSynthesisMaxToolRounds(this.input.maxToolRounds) : 0,
        idleTimeoutMs: normalizeAmbientStreamIdleTimeoutMs(this.input.streamIdleTimeoutMs),
        signal: input.signal,
        onProgress: (progress: WorkflowPiProgress) => {
          if (progress.outputChars === lastOutputChars && progress.stage !== "completed") return;
          lastOutputChars = progress.outputChars;
          input.onChunk?.(progress.outputChars);
        },
      });
      return {
        text,
        finishReason: completion?.finishReason,
        stopReason: completion?.stopReason,
        usage: completion?.usage,
        outputTokenBudget: input.maxTokens,
        outputChars: completion?.outputChars ?? text.length,
        thinkingChars: completion?.thinkingChars,
        toolRound: completion?.toolRound,
      };
    }
    const response = await fetchAmbientProjectBoardSynthesisResponse(
      this.input.fetchImpl ?? fetch,
      `${normalizeAmbientBaseUrl(this.input.baseUrl)}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: normalizeAmbientModelId(this.input.model),
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.prompt },
          ],
          temperature: 0.1,
          max_tokens: input.maxTokens,
          response_format: { type: "json_object" },
          stream: true,
          ...projectBoardSynthesisReasoningPayload(this.input.reasoning ?? input.reasoning),
        }),
      },
      normalizeAmbientStreamIdleTimeoutMs(this.input.streamIdleTimeoutMs),
      input.signal,
    );
    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, " ").trim();
      throw new Error(
        detail
          ? `Ambient project-board synthesis failed (${response.status}): ${detail.slice(0, 240)}`
          : `Ambient project-board synthesis failed (${response.status}).`,
      );
    }
    return readAmbientChatCompletionResult(response, input.onChunk, {
      streamIdleTimeoutMs: normalizeAmbientStreamIdleTimeoutMs(this.input.streamIdleTimeoutMs),
      contentActivityToken: input.contentActivityToken,
      outputTokenBudget: input.maxTokens,
      signal: input.signal,
    });
  }

  private plannerTransportMode(): ProjectBoardPlannerTransportMode {
    return this.input.fetchImpl ? "direct_chat_compat" : "pi_session_stream";
  }

  private createPlannerSourceQaAnswerer(input: {
    apiKey: string;
    plannerWorkspace: ProjectBoardPlannerWorkspace;
    signal?: AbortSignal;
  }): ProjectBoardPlannerSourceQaAnswerer {
    return async (qaInput) => {
      const textCall = this.input.piTextCall ?? callWorkflowPiText;
      const sourceQaBudgetProfile = projectBoardModelBudgetProfile({
        model: this.input.model,
        operation: "planner_source_qa",
      });
      const text = await textCall({
        apiKey: input.apiKey,
        baseUrl: this.input.baseUrl,
        model: this.input.model,
        systemPrompt: PROJECT_BOARD_PLANNER_SOURCE_QA_SYSTEM_PROMPT,
        prompt: buildPlannerSourceQaPrompt(qaInput),
        sessionId: stableBoardArtifactId("planner-source-qa-session", [input.plannerWorkspace.sessionId]),
        temperature: 0,
        maxTokens: sourceQaBudgetProfile.maxOutputTokens,
        reasoning: false,
        responseFormat: { type: "json_object" },
        retryPolicy: this.input.retryPolicy,
        idleTimeoutMs: normalizeAmbientStreamIdleTimeoutMs(this.input.streamIdleTimeoutMs),
        signal: input.signal,
      });
      return parsePlannerSourceQaAnswerText(text, qaInput);
    };
  }
}

const PROJECT_BOARD_PLANNER_LEDGER_COMPACTION_SYSTEM_PROMPT = [
  "You are the Ambient project-board planner ledger compaction helper.",
  "Summarize already-rendered cards, source coverage, open questions, dependency hints, and duplicate risks for a later planner batch.",
  "Do not invent project scope, source facts, card ids, dependencies, or user decisions.",
  "Preserve uncertainty and tell the planner when it must use retrieval tools for exact source or duplicate checks.",
  "Return JSON only.",
].join(" ");

const PROJECT_BOARD_PLANNER_SOURCE_QA_SYSTEM_PROMPT = [
  "You are the Ambient project-board planner source QA tool.",
  "Answer only from the supplied evidence snippets and current question.",
  "Do not invent requirements, priorities, product decisions, or source facts.",
  "If the question asks for a preference, scope choice, or decision not fully settled by evidence, set needs_user_decision true and summarize what the evidence says.",
  "Return JSON only with keys answer, confidence, needs_user_decision, and optional uncertaintyReason/failureKind.",
].join(" ");

function buildPlannerLedgerCompactionPrompt(input: {
  sources: ProjectBoardSynthesisSource[];
  projectName?: string;
  priorRecords: ProposalJsonlRecordArtifact[];
  rawPromptBudget: ProjectBoardPromptBudgetAssessment;
  batchNumber: number;
  maxBatches: number;
  maxCardsPerBatch: number;
}): string {
  const cards = input.priorRecords.filter((record) => record.type === "candidate_card");
  const questions = input.priorRecords.filter((record) => record.type === "question");
  const coverage = input.priorRecords.filter((record) => record.type === "source_coverage");
  const dependencies = input.priorRecords.filter((record) => record.type === "dependency_edge");
  return [
    "Compact project-board planner context before the next card-batch request.",
    input.projectName ? `Project: ${input.projectName}` : "",
    `Planner batch: ${input.batchNumber}/${input.maxBatches}`,
    `Requested card count: next ${Math.max(1, input.maxCardsPerBatch - 1)}-${input.maxCardsPerBatch} cards`,
    "",
    "Return JSON matching this exact shape:",
    JSON.stringify(
      {
        summary: "compact summary of already-rendered work and remaining planning shape",
        renderedCardThemes: ["theme/workstream already represented"],
        duplicateAvoidanceNotes: ["ids, titles, intents, or source bases the planner must not recreate"],
        remainingCoverage: [{ sourceId: "source-id", title: "source title", status: "uncovered", summary: "what still needs planning" }],
        openQuestions: [{ questionId: "question-id", cardId: "synthesis:card-id", question: "unresolved user decision" }],
        dependencyHints: ["dependency or ordering hint grounded in rendered cards"],
        citations: ["source id/title/path or card id/title used by this summary"],
      },
      null,
      2,
    ),
    "",
    "Rules:",
    "- Summarize only the supplied ledgers. Do not add new cards, product decisions, or source claims.",
    "- Preserve duplicate-avoidance details. The planner will use planner_card_search for exact checks, but your summary should still name high-risk duplicates.",
    "- Preserve open questions and remaining coverage. If a source looks only partially covered, say so.",
    "- Keep the output compact enough to fit as prompt-prefix context for one 2-3 card planner batch.",
    "- Return JSON only. Do not use markdown.",
    "",
    "Raw prompt-budget pressure:",
    JSON.stringify(projectBoardPromptBudgetAssessmentMetadata(input.rawPromptBudget), null, 2),
    "",
    "Source ledger:",
    JSON.stringify(plannerBatchSourceOverview(input.sources), null, 2),
    "",
    "Rendered cards:",
    JSON.stringify(
      cards.map((record) => ({
        cardId: record.sourceId,
        title: record.title,
        phase: record.phase,
        candidateStatus: record.candidateStatus,
        blockedBy: record.blockedBy,
        sourceRefs: record.sourceRefs,
        clarificationQuestionCount: record.clarificationQuestions.length,
      })),
      null,
      2,
    ),
    "",
    "Open questions:",
    JSON.stringify(
      questions.map((record) => ({
        questionId: record.questionId,
        cardId: record.cardId,
        question: record.question,
        required: record.required,
      })),
      null,
      2,
    ),
    "",
    "Source coverage:",
    JSON.stringify(
      coverage.map((record) => ({
        sourceId: record.sourceId,
        range: record.range,
        status: record.status,
        cardIds: record.cardIds,
        note: record.note,
      })),
      null,
      2,
    ),
    "",
    "Dependency edges:",
    JSON.stringify(dependencies, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSectionedContextCompactionPrompt(input: {
  section: ProjectBoardPlanningSection;
  sectionNumber: number;
  sectionCount: number;
  sources: ProjectBoardSynthesisSource[];
  projectName?: string;
  priorRecords: ProposalJsonlRecordArtifact[];
  rawPromptBudget: ProjectBoardPromptBudgetAssessment;
  reason: ProjectBoardSectionedContextCompactionReason;
  maxCardsPerSection: number;
}): string {
  const cards = input.priorRecords.filter((record) => record.type === "candidate_card");
  const questions = input.priorRecords.filter((record) => record.type === "question");
  const coverage = input.priorRecords.filter((record) => record.type === "source_coverage");
  const dependencies = input.priorRecords.filter((record) => record.type === "dependency_edge");
  return [
    "Compact project-board sectioned planning context before the next source-section request.",
    input.projectName ? `Project: ${input.projectName}` : "",
    `Section: ${input.sectionNumber}/${input.sectionCount}`,
    `Section id: ${input.section.id}`,
    `Source id: ${input.section.sourceId}`,
    `Source: ${input.section.sourcePath || input.section.sourceTitle}`,
    `Section heading: ${input.section.heading}`,
    `Section range: ${input.section.range}`,
    `Compaction reason: ${input.reason}`,
    `Requested card count: at most ${input.maxCardsPerSection} cards for this section`,
    "",
    "Return JSON matching this exact shape:",
    JSON.stringify(
      {
        summary: "compact summary of already-rendered work, source authority, and remaining planning shape",
        renderedCardThemes: ["theme/workstream already represented"],
        duplicateAvoidanceNotes: ["ids, titles, intents, or source bases the section planner must not recreate"],
        remainingCoverage: [{ sourceId: "source-id", title: "source title", status: "uncovered", summary: "what still needs section planning" }],
        openQuestions: [{ questionId: "question-id", cardId: "synthesis:card-id", question: "unresolved user decision" }],
        dependencyHints: ["dependency or ordering hint grounded in rendered cards"],
        citations: ["source id/title/path or card id/title used by this summary"],
      },
      null,
      2,
    ),
    "",
    "Rules:",
    "- Summarize only the supplied ledgers and source inventory. Do not add new cards, product decisions, or source claims.",
    "- Preserve duplicate-avoidance details because later section prompts will omit repeated rendered-card context.",
    "- Preserve source authority. If a durable plan is primary and chats are ignored, say so without reintroducing ignored chat facts as requirements.",
    "- Preserve open questions and remaining coverage. If a source or range is partially covered, keep that uncertainty visible.",
    "- Keep this compact enough to fit as repeated prompt-prefix context for later section calls.",
    "- Return JSON only. Do not use markdown.",
    "",
    "Raw prompt-budget pressure:",
    JSON.stringify(projectBoardPromptBudgetAssessmentMetadata(input.rawPromptBudget), null, 2),
    "",
    "Source ledger:",
    JSON.stringify(plannerBatchSourceOverview(input.sources), null, 2),
    "",
    "Current section identity:",
    JSON.stringify(
      {
        sectionId: input.section.id,
        sourceId: input.section.sourceId,
        sourceKind: input.section.sourceKind,
        sourceTitle: input.section.sourceTitle,
        sourcePath: input.section.sourcePath,
        sourceSummary: input.section.sourceSummary,
        heading: input.section.heading,
        range: input.section.range,
        charCount: input.section.charCount,
      },
      null,
      2,
    ),
    "",
    "Rendered cards:",
    JSON.stringify(
      cards.map((record) => ({
        cardId: record.sourceId,
        title: record.title,
        phase: record.phase,
        candidateStatus: record.candidateStatus,
        blockedBy: record.blockedBy,
        sourceRefs: record.sourceRefs,
        clarificationQuestionCount: record.clarificationQuestions.length,
      })),
      null,
      2,
    ),
    "",
    "Open questions:",
    JSON.stringify(
      questions.map((record) => ({
        questionId: record.questionId,
        cardId: record.cardId,
        question: record.question,
        required: record.required,
      })),
      null,
      2,
    ),
    "",
    "Source coverage:",
    JSON.stringify(
      coverage.map((record) => ({
        sourceId: record.sourceId,
        range: record.range,
        status: record.status,
        cardIds: record.cardIds,
        note: record.note,
      })),
      null,
      2,
    ),
    "",
    "Dependency edges:",
    JSON.stringify(dependencies, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizePlannerLedgerCompactionText(
  text: string,
  fallback: ProjectBoardPlannerLedgerCompaction,
  metadata: {
    promptCharCount: number;
    responseCharCount: number;
    rawPromptBudget: ProjectBoardPromptBudgetAssessment;
  },
): ProjectBoardPlannerLedgerCompaction {
  try {
    const parsed = parseProjectBoardSynthesisJson(text);
    const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    return {
      ...fallback,
      source: "pi_rlm",
      cacheHit: false,
      summary: compactStringField(record.summary, fallback.summary, 1_500),
      renderedCardThemes: compactStringListField(record.renderedCardThemes, fallback.renderedCardThemes, 12, 300),
      duplicateAvoidanceNotes: compactStringListField(record.duplicateAvoidanceNotes, fallback.duplicateAvoidanceNotes, 16, 360),
      remainingCoverage: compactCoverageListField(record.remainingCoverage, fallback.remainingCoverage),
      openQuestions: compactQuestionListField(record.openQuestions, fallback.openQuestions),
      dependencyHints: compactStringListField(record.dependencyHints, fallback.dependencyHints, 12, 300),
      citations: compactStringListField(record.citations, fallback.citations, 16, 220),
      promptCharCount: metadata.promptCharCount,
      responseCharCount: metadata.responseCharCount,
      rawPromptBudgetStatus: metadata.rawPromptBudget.status,
    };
  } catch (error) {
    return {
      ...fallback,
      promptCharCount: metadata.promptCharCount,
      responseCharCount: metadata.responseCharCount,
      rawPromptBudgetStatus: metadata.rawPromptBudget.status,
      error: errorMessage(error),
    };
  }
}

function buildPlannerSourceQaPrompt(input: ProjectBoardPlannerSourceQaAnswerInput): string {
  return [
    `Question: ${input.question}`,
    `Answer mode: ${input.answerMode}`,
    `Needs-user-decision hint: ${input.needsUserDecisionHint ? "yes" : "no"}`,
    `Cache key: ${input.cacheKey}`,
    "Evidence snippets:",
    JSON.stringify(
      input.citedSnippets.map((snippet, index) => ({
        index: index + 1,
        snippetId: snippet.snippetId,
        sourceId: snippet.sourceId,
        title: snippet.title,
        range: snippet.range,
        text: snippet.text,
      })),
      null,
      2,
    ),
    "Return JSON shape:",
    JSON.stringify({
      answer: "One concise answer grounded only in the evidence.",
      confidence: 0.74,
      needs_user_decision: false,
      uncertaintyReason: "Omit when not needed.",
    }),
  ].join("\n\n");
}

function projectBoardSectionedContextCompactionDecision(input: {
  section: ProjectBoardPlanningSection;
  sectionNumber: number;
  sectionCount: number;
  rawPrompt: string;
  rawPromptBudget: ProjectBoardPromptBudgetAssessment;
  cumulativePromptCharCount: number;
  sources: ProjectBoardSynthesisSource[];
}): { compact: boolean; reason?: ProjectBoardSectionedContextCompactionReason } {
  if (input.rawPromptBudget.summarizationRecommended) return { compact: true, reason: "section_prompt_budget" };
  const cumulativeBudget = projectBoardPromptBudgetAssessment({
    promptCharCount: input.cumulativePromptCharCount,
    profile: {
      operation: input.rawPromptBudget.operation,
      modelId: input.rawPromptBudget.modelId,
      contextWindowTokens: input.rawPromptBudget.contextWindowTokens,
      modelMaxOutputTokens: input.rawPromptBudget.contextWindowTokens,
      maxOutputTokens: Math.max(256, input.rawPromptBudget.outputReserveTokens),
      outputReserveTokens: input.rawPromptBudget.outputReserveTokens,
      softPromptBudgetTokens: input.rawPromptBudget.softPromptBudgetTokens,
      summarizationThresholdTokens: input.rawPromptBudget.summarizationThresholdTokens,
      source: "default",
    },
  });
  if (cumulativeBudget.summarizationRecommended && input.sectionNumber > 1) {
    return { compact: true, reason: "cumulative_prompt_budget" };
  }
  if (input.sectionCount > 8 && input.sectionNumber >= 8) return { compact: true, reason: "section_count_threshold" };
  const stableContextChars = Math.max(0, input.rawPrompt.length - input.section.content.length);
  if (input.sectionNumber > 3 && stableContextChars > Math.max(8_000, input.section.content.length * 2)) {
    return { compact: true, reason: "repeated_stable_context" };
  }
  if (input.sectionNumber > 2 && hasDurablePlanSource(input.sources) && hasExcludedChatSource(input.sources) && stableContextChars > 6_000) {
    return { compact: true, reason: "durable_plan_source_authority" };
  }
  return { compact: false };
}

function hasDurablePlanSource(sources: ProjectBoardSynthesisSource[]): boolean {
  return sources.some(
    (source) =>
      source.kind === "plan_artifact" &&
      projectBoardSourceIncludedInSynthesis(source) &&
      source.path?.replace(/\\/g, "/").startsWith(".ambient/board/plans/") === true,
  );
}

function hasExcludedChatSource(sources: ProjectBoardSynthesisSource[]): boolean {
  return sources.some((source) => source.kind === "thread" && source.includeInSynthesis === false);
}

function parsePlannerSourceQaAnswerText(
  text: string,
  input: ProjectBoardPlannerSourceQaAnswerInput,
): ProjectBoardPlannerSourceQaAnswerResult {
  const parsed = parseProjectBoardSynthesisJson(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Planner source QA answer was not a JSON object.");
  }
  const record = parsed as Record<string, unknown>;
  const answer = typeof record.answer === "string" ? record.answer.trim() : "";
  if (!answer) throw new Error("Planner source QA answer was missing answer text.");
  const confidence = typeof record.confidence === "number" && Number.isFinite(record.confidence) ? Math.max(0, Math.min(1, record.confidence)) : undefined;
  const needsUserDecision =
    record.needs_user_decision === true || record.needsUserDecision === true || (input.needsUserDecisionHint && record.needs_user_decision !== false);
  const failureKind = typeof record.failureKind === "string" ? record.failureKind : typeof record.failure_kind === "string" ? record.failure_kind : undefined;
  return {
    answer,
    ...(confidence === undefined ? {} : { confidence }),
    needs_user_decision: needsUserDecision,
    ...(typeof record.uncertaintyReason === "string" && record.uncertaintyReason.trim()
      ? { uncertaintyReason: record.uncertaintyReason.trim() }
      : typeof record.uncertainty_reason === "string" && record.uncertainty_reason.trim()
        ? { uncertaintyReason: record.uncertainty_reason.trim() }
        : {}),
    ...(failureKind ? { failureKind: failureKind as ProjectBoardPlannerSourceQaAnswerResult["failureKind"] } : {}),
  };
}

export function buildProjectBoardSectionedPlanningPrompt(input: {
  section: ProjectBoardPlanningSection;
  sectionIndex: number;
  sectionCount: number;
  sources: ProjectBoardSynthesisSource[];
  projectName?: string;
  deterministicDraft: ProjectBoardSynthesisDraft;
  refinement?: ProjectBoardSynthesisRefinementContext;
  charterProjectSummary?: ProjectBoardCharterProjectSummary;
  scopeContract?: ProjectBoardScopeContract;
  priorRecords?: ProposalJsonlRecordArtifact[];
  maxCardsPerSection?: number;
  plannerWorkspaceBlock?: string;
  plannerLedgerCompaction?: ProjectBoardPlannerLedgerCompaction;
}): string {
  const maxCardsPerSection = normalizeSectionBatchCardLimit(input.maxCardsPerSection);
  const priorCards = (input.priorRecords ?? [])
    .filter((record) => record.type === "candidate_card")
    .slice(-18)
    .map((record, index) => `${index + 1}. ${record.sourceId}: ${record.title}`)
    .join("\n");
  const answers = input.refinement?.answers.map((item, index) => `${index + 1}. Q: ${item.question}\n   A: ${item.answer}`).join("\n") ?? "";
  const sourceOverview = input.plannerLedgerCompaction
    ? input.plannerLedgerCompaction.remainingCoverage
        .slice(0, 18)
        .map(
          (source, index) =>
            `${index + 1}. ${source.sourceId}${source.title ? ` (${source.title})` : ""}${source.status ? ` - ${source.status}` : ""}: ${
              source.summary ?? "No compact summary available."
            }`,
        )
        .join("\n")
    : input.sources
        .filter(projectBoardSourceIncludedInSynthesis)
        .slice(0, 12)
        .map((source, index) => `${index + 1}. ${source.path || source.title} (${source.kind}, relevance ${source.relevance}): ${source.summary}`)
        .join("\n");
  const settledDecisionLedgerBlock = projectBoardSettledClarificationDecisionLedgerPromptBlock(input.refinement);
  const contract = buildProjectBoardPlanningContract({
    operation: "section_elaboration",
    projectName: input.projectName,
    profileName: inferPlanningProfileName(input.sources),
    charter: {
      goal: input.refinement?.previousDraft.goal ?? input.deterministicDraft.goal,
      proofPolicy: input.refinement?.previousDraft.qualityBar ?? input.deterministicDraft.qualityBar,
      decisionPolicy: input.refinement
        ? "Treat the supplied charter and PM Review answers as already settled unless they are incomplete or contradictory."
        : undefined,
      ...(input.charterProjectSummary ? { projectSummary: input.charterProjectSummary } : {}),
    },
    scopeContract: input.scopeContract ?? projectBoardScopeContractFromTexts(projectBoardScopeContractTexts({ sources: input.sources, refinement: input.refinement })),
  });
  return [
    contract.stablePromptHeader,
    "",
    "Plan one section of a project board source corpus.",
    input.projectName ? `Project: ${input.projectName}` : "",
    `Section: ${input.sectionIndex + 1} of ${input.sectionCount}`,
    `Source id: ${input.section.sourceId}`,
    `Source: ${input.section.sourcePath || input.section.sourceTitle}`,
    `Source kind: ${input.section.sourceKind}`,
    `Source summary: ${input.section.sourceSummary}`,
    `Section heading: ${input.section.heading}`,
    `Section range: ${input.section.range}`,
    "",
    "Return JSON matching this exact shape:",
    JSON.stringify(
      {
        records: [
          projectBoardPlannerCandidateCardPromptExample({
            sourceRefs: [{ sourceId: input.section.sourceId, range: input.section.range }],
            suggestedAnswer: "expert default when the answer is professionally defensible from source context",
            rationale: "why an experienced UX designer/software architect would choose this default",
          }),
          {
            type: "question",
            questionId: "question:stable-id",
            question: "specific unresolved ambiguity",
            cardId: "synthesis:stable-card-id",
            required: true,
            createdAt: "2026-05-04T00:00:00.000Z",
          },
          {
            type: "source_coverage",
            sourceId: input.section.sourceId,
            range: input.section.range,
            status: "covered",
            cardIds: ["synthesis:stable-card-id"],
            note: "how this section is covered",
            updatedAt: "2026-05-04T00:00:00.000Z",
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Rules:",
    "- Emit only records for this section. Do not summarize the whole project unless this section asks for it.",
    "- Respect the Scope contract in the stable planning header. Complexity may justify deeper planning for this section, but it must not add excluded platform scope.",
    ...projectBoardPlannerScopeCapabilityPromptRules({ optionalScopeTarget: "source_coverage or remainingCoverageSummary" }),
    "- Keep this section's cards inside the structured scope contract.",
    `- Emit at most ${maxCardsPerSection} candidate_card records in this response so Ambient can persist and dispatch useful work immediately.`,
    "- Choose the next highest-leverage, dependency-sensible cards for this section; do not wait for a perfect whole-project plan.",
    "- Prefer multiple self-contained candidate_card records when the section names multiple concrete systems or mechanics.",
    ...projectBoardCardTitleQualityPromptRules(),
    "- Use needs_clarification when a card still needs a user decision; use ready_to_create only when scope, dependencies, and proof are settled.",
    PROJECT_BOARD_PLANNER_CANDIDATE_STATUS_RULE,
    ...projectBoardPlannerClarificationContractPromptRules({
      needsClarificationRule:
        "- Every needs_clarification candidate_card must include at least one open clarificationDecisions entry with the exact unresolved user decision(s). If you emit a question record for a card, set cardId to that card's sourceId.",
      canonicalRule:
        "- Mirror open clarificationDecisions entries into clarificationQuestions and clarificationSuggestions for compatibility only; do not emit variant wording across the decision, question record, and legacy arrays.",
      includeVagueLaneRule: true,
      defaultRule:
        "- For each open clarification decision, include suggestedAnswer/rationale/confidence/safeToAccept/questionKind when a senior UX designer/software architect can propose a safe default. Use expert_default only for implementation/UX defaults that do not invent product intent; use user_preference or external_constraint otherwise and set safeToAccept false.",
    }),
    "- Use stable lowercase sourceId values prefixed with synthesis:.",
    "- Keep blockedBy values to stable synthesis ids that are already emitted in prior sections or clearly required foundation cards.",
    "- Add source_coverage for this source section, including partial or unresolved when appropriate.",
    "- Do not emit proposal_final for ordinary section batches. Ambient adds a final record after validated section records are assembled.",
    input.plannerLedgerCompaction
      ? "- Repeated planner context has been compacted for this section. Treat compacted context as duplicate-avoidance and coverage guidance; the current section content remains the authoritative source slice."
      : "",
    "- Add question records for unresolved section-level ambiguity instead of making silent product guesses.",
    ...projectBoardPlannerProofExpectationPromptRules(),
    PROJECT_BOARD_PLANNER_LAMBDA_RLM_RULE,
    PROJECT_BOARD_PLANNER_JSON_ONLY_RULE,
    ...contract.operationRules.map((rule) => `- ${rule}`),
    projectBoardPlannerPmReviewActivationPromptBlock(input.refinement?.pmReviewReport),
    settledDecisionLedgerBlock,
    input.plannerWorkspaceBlock ? ["", input.plannerWorkspaceBlock].join("\n") : "",
    input.plannerLedgerCompaction
      ? [
          "",
          "Compacted planner context:",
          JSON.stringify(
            {
              source: input.plannerLedgerCompaction.source,
              summary: input.plannerLedgerCompaction.summary,
              renderedCardThemes: input.plannerLedgerCompaction.renderedCardThemes,
              duplicateAvoidanceNotes: input.plannerLedgerCompaction.duplicateAvoidanceNotes,
              dependencyHints: input.plannerLedgerCompaction.dependencyHints,
              citations: input.plannerLedgerCompaction.citations,
              renderedCardCount: input.plannerLedgerCompaction.renderedCardCount,
              omittedRenderedCardCount: input.plannerLedgerCompaction.omittedRenderedCardCount,
              recentRenderedCards: input.plannerLedgerCompaction.recentRenderedCards.slice(-18),
            },
            null,
            2,
          ),
          "Do not recreate omitted rendered cards. Use this as lossy context only; do not invent new source facts from it.",
        ].join("\n")
      : "",
    "",
    input.plannerLedgerCompaction ? "Compacted remaining source overview:" : "Overall source overview:",
    sourceOverview || "No additional source overview available.",
    "",
    "Deterministic baseline summary:",
    JSON.stringify(
      input.plannerLedgerCompaction
        ? {
            goal: input.deterministicDraft.goal,
            qualityBar: input.deterministicDraft.qualityBar,
            cardCount: input.deterministicDraft.cards.length,
            recentCards: input.deterministicDraft.cards.slice(0, 8).map((card) => ({
              sourceId: card.sourceId,
              title: card.title,
              phase: card.phase,
              blockedBy: card.blockedBy,
            })),
            omittedCardCount: Math.max(0, input.deterministicDraft.cards.length - 8),
          }
        : {
            goal: input.deterministicDraft.goal,
            qualityBar: input.deterministicDraft.qualityBar,
            cards: input.deterministicDraft.cards.map((card) => ({
              sourceId: card.sourceId,
              title: card.title,
              phase: card.phase,
              blockedBy: card.blockedBy,
            })),
          },
      null,
      2,
    ),
    answers ? ["", "Settled answers to honor:", answers].join("\n") : "",
    priorCards ? ["", "Already emitted candidate cards to avoid duplicating:", priorCards].join("\n") : "",
    "",
    "Section content:",
    input.section.content,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildProjectBoardSectionRetryPrompt(input: {
  basePrompt: string;
  section: ProjectBoardPlanningSection;
  sectionNumber: number;
  sectionCount: number;
  retryAttempt: number;
  maxRetries: number;
  priorRecords: ProposalJsonlRecordArtifact[];
  failureKind?: ProjectBoardSectionFailureKind;
  failureMessage?: string;
}): string {
  const recentValidatedRecords = input.priorRecords
    .filter((record) => record.type === "candidate_card" || record.type === "question" || record.type === "source_coverage")
    .slice(-16)
    .map((record, index) => {
      if (record.type === "candidate_card") return `${index + 1}. candidate_card ${record.sourceId}: ${record.title}`;
      if (record.type === "question") return `${index + 1}. question ${record.questionId}: ${record.question}`;
      return `${index + 1}. source_coverage ${record.sourceId} ${record.range}: ${record.status}`;
    })
    .join("\n");
  const sectionRecords = input.priorRecords
    .filter((record) => sectionIdForRecord(record) === input.section.id)
    .slice(-8)
    .map((record, index) => `${index + 1}. ${record.type}${record.type === "progress" ? `:${record.stage}` : ""}`)
    .join("\n");
  return [
    input.basePrompt,
    "",
    "Section retry context:",
    `- Retry attempt: ${input.retryAttempt} of ${input.maxRetries}.`,
    `- Original section identity: section ${input.sectionNumber}/${input.sectionCount}, id ${input.section.id}, source ${input.section.sourceId}, range ${input.section.range}.`,
    `- Prior failure kind: ${input.failureKind ?? "unknown"}.`,
    `- Prior failure message: ${input.failureMessage ?? "No failure message was captured."}`,
    "- Recover this section during the active run. Do not defer unless the same concrete failure still applies.",
    "- Emit only missing records for this same section. Do not re-emit candidate_card, question, dependency_edge, or source_coverage records that already appear in the validated ledger.",
    "- If the prior failure was a validation error, correct the response shape and keep the product content faithful to the source.",
    "- If the prior failure was no_records, emit concrete candidate_card and source_coverage records or a specific question record explaining the blocking ambiguity.",
    "",
    "Recent validated ledger records to avoid duplicating:",
    recentValidatedRecords || "No validated candidate/question/coverage records have been emitted yet.",
    "",
    "Recent records already associated with this section:",
    sectionRecords || "No validated records are associated with this section yet.",
  ].join("\n");
}

type PlannerBatchStatus =
  | "continue"
  | "planning_complete"
  | "needs_user_decision"
  | "budget_exhausted"
  | "stale_source_snapshot"
  | "validation_failed"
  | "user_cancelled";

function buildProjectBoardPlannerBatchPrompt(input: {
  sources: ProjectBoardSynthesisSource[];
  projectName?: string;
  deterministicDraft: ProjectBoardSynthesisDraft;
  refinement?: ProjectBoardSynthesisRefinementContext;
  charterProjectSummary?: ProjectBoardCharterProjectSummary;
  scopeContract?: ProjectBoardScopeContract;
  priorRecords: ProposalJsonlRecordArtifact[];
  resumeContinuation?: ProjectBoardPlannerBatchContinuation;
  batchNumber: number;
  maxBatches: number;
  maxCardsPerBatch: number;
  plannerWorkspaceBlock?: string;
  plannerLedgerCompaction?: ProjectBoardPlannerLedgerCompaction;
}): string {
  const operation = synthesisOperationFromRefinement(input.refinement);
  const contract = buildProjectBoardPlanningContract({
    operation,
    projectName: input.projectName,
    profileName: inferPlanningProfileName(input.sources),
    charter: {
      goal: input.refinement?.previousDraft.goal ?? input.deterministicDraft.goal,
      proofPolicy: input.refinement?.previousDraft.qualityBar ?? input.deterministicDraft.qualityBar,
      decisionPolicy: input.refinement
        ? "Treat the supplied charter and PM Review answers as already settled unless they are incomplete or contradictory."
        : undefined,
      ...(input.charterProjectSummary ? { projectSummary: input.charterProjectSummary } : {}),
    },
    scopeContract: input.scopeContract ?? projectBoardScopeContractFromTexts(projectBoardScopeContractTexts({ sources: input.sources, refinement: input.refinement })),
  });
  const sourceOverview = input.plannerLedgerCompaction?.remainingCoverage ?? plannerBatchSourceOverview(input.sources);
  const ledger = input.plannerLedgerCompaction ? plannerBatchCompactedLedger(input.plannerLedgerCompaction) : plannerBatchLedger(input.sources, input.priorRecords);
  const continuationBlock = plannerBatchContinuationPromptBlock(input.resumeContinuation);
  const answers = input.refinement?.answers.map((item, index) => `${index + 1}. Q: ${item.question}\n   A: ${item.answer}`).join("\n") ?? "";
  const settledDecisionLedgerBlock = projectBoardSettledClarificationDecisionLedgerPromptBlock(input.refinement);
  return [
    contract.stablePromptHeader,
    "",
    "Plan the next small batch for a project board.",
    input.projectName ? `Project: ${input.projectName}` : "",
    `Planner batch: ${input.batchNumber} of at most ${input.maxBatches}`,
    "",
    "Return JSON matching this exact shape:",
    JSON.stringify(
      {
        plannerStatus: "continue",
        records: [
          projectBoardPlannerCandidateCardPromptExample({
            sourceRefs: [{ sourceId: "source-id-from-ledger", range: "source range or section" }],
            suggestedAnswer: "expert default when safe",
            rationale: "source-grounded rationale",
          }),
          {
            type: "source_coverage",
            sourceId: "source-id-from-ledger",
            range: "covered range or full",
            status: "covered",
            cardIds: ["synthesis:stable-card-id"],
            note: "how this batch covers or partially covers this source",
            updatedAt: "2026-05-04T00:00:00.000Z",
          },
        ],
        remainingCoverageSummary: "short note on what still needs planning",
        nextBatchHint: "what to ask for next, if plannerStatus is continue",
      },
      null,
      2,
    ),
    "",
    "Planner status values:",
    "- Use continue when more card batches are needed.",
    "- Use planning_complete when all source-backed work that should become cards is represented or intentionally ignored.",
    "- Use needs_user_decision when the next card cannot be responsibly planned without a user answer.",
    "- Use budget_exhausted, stale_source_snapshot, validation_failed, or user_cancelled only when that exact stop condition applies.",
    "",
    "Rules:",
    `- Emit the next ${Math.max(1, input.maxCardsPerBatch - 1)}-${input.maxCardsPerBatch} highest-leverage candidate_card records not already represented in the rendered-card ledger unless that ledger entry has restartAction regenerate_card.`,
    "- Respect the Scope contract in the stable planning header. Do not add excluded platform scope.",
    ...projectBoardPlannerScopeCapabilityPromptRules({ optionalScopeTarget: "source_coverage or remainingCoverageSummary" }),
    "- Keep generated cards inside the structured scope contract.",
    "- Do not emit a giant whole-board response. This is one small batch in a repeated loop.",
    "- Do not duplicate card ids or titles already shown in the rendered-card ledger when the entry is valid/reusable; invalidated regenerate_card entries are eligible for a replacement candidate.",
    input.plannerLedgerCompaction
      ? "- The rendered-card ledger is compacted due to prompt pressure. Use planner_card_search for exact duplicate checks before emitting cards whose title, intent, or source basis may overlap omitted rendered cards."
      : "",
    ...projectBoardCardTitleQualityPromptRules(),
    "- Prefer dependency-unblocking foundation cards first, then cards that cover the remaining-coverage ledger.",
    "- Add source_coverage records for sources touched by this batch. Use partial or unresolved when a source still needs later planning.",
    "- Add question records when a card or source needs a user decision. Set plannerStatus to needs_user_decision if planning cannot continue safely.",
    PROJECT_BOARD_PLANNER_CANDIDATE_STATUS_RULE,
    ...projectBoardPlannerClarificationContractPromptRules({
      canonicalRule:
        "- Use clarificationDecisions as the canonical unresolved clarification shape. Give each decision a stable id and canonicalKey, and mirror open decisions into clarificationQuestions and clarificationSuggestions only for compatibility.",
      defaultRule:
        "- For each unresolved clarification, include suggestedAnswer/rationale/confidence/safeToAccept/questionKind on the clarificationDecisions entry when a safe expert default exists. Classify unsafe questions as user_preference or external_constraint and keep safeToAccept false.",
    }),
    "- Do not emit proposal_final. Ambient assembles the final proposal from validated records.",
    "- Use stable lowercase sourceId values prefixed with synthesis: for candidate cards.",
    ...projectBoardPlannerProofExpectationPromptRules(),
    PROJECT_BOARD_PLANNER_LAMBDA_RLM_RULE,
    PROJECT_BOARD_PLANNER_JSON_ONLY_RULE,
    ...contract.operationRules.map((rule) => `- ${rule}`),
    projectBoardPlannerPmReviewActivationPromptBlock(input.refinement?.pmReviewReport),
    settledDecisionLedgerBlock,
    continuationBlock,
    input.plannerWorkspaceBlock ? ["", input.plannerWorkspaceBlock].join("\n") : "",
    input.plannerLedgerCompaction
      ? [
          "",
          "Compacted planner context:",
          JSON.stringify(
            {
              source: input.plannerLedgerCompaction.source,
              summary: input.plannerLedgerCompaction.summary,
              renderedCardThemes: input.plannerLedgerCompaction.renderedCardThemes,
              duplicateAvoidanceNotes: input.plannerLedgerCompaction.duplicateAvoidanceNotes,
              dependencyHints: input.plannerLedgerCompaction.dependencyHints,
              citations: input.plannerLedgerCompaction.citations,
              renderedCardCount: input.plannerLedgerCompaction.renderedCardCount,
              omittedRenderedCardCount: input.plannerLedgerCompaction.omittedRenderedCardCount,
              recentRenderedCards: input.plannerLedgerCompaction.recentRenderedCards,
            },
            null,
            2,
          ),
          "Treat this compacted context as a lossy summary of already-rendered work, not authority to change user decisions.",
        ].join("\n")
      : "",
    "",
    input.plannerLedgerCompaction ? "Remaining source ledger:" : "Source ledger:",
    JSON.stringify(sourceOverview, null, 2),
    "",
    input.plannerLedgerCompaction ? "Compacted rendered-card and coverage ledger:" : "Rendered-card and coverage ledger:",
    JSON.stringify(ledger, null, 2),
    "",
    "Deterministic baseline summary:",
    JSON.stringify(
      {
        goal: input.deterministicDraft.goal,
        qualityBar: input.deterministicDraft.qualityBar,
        cards: input.deterministicDraft.cards.map((card) => ({
          sourceId: card.sourceId,
          title: card.title,
          phase: card.phase,
          blockedBy: card.blockedBy,
        })),
      },
      null,
      2,
    ),
    answers ? ["", "Settled answers to honor:", answers].join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function plannerBatchContinuationPromptBlock(continuation?: ProjectBoardPlannerBatchContinuation): string {
  if (!continuation) return "";
  const batchText = continuation.plannerBatchIndex
    ? `planner batch ${continuation.plannerBatchIndex}${continuation.plannerBatchCount ? `/${continuation.plannerBatchCount}` : ""}`
    : "the active planner batch";
  const stopReason = continuation.stopReason === "pause_requested"
    ? continuation.stopReason
    : continuation.finishReason || continuation.stopReason || "an output budget/context-window limit";
  return [
    "",
    "Continuation checkpoint:",
    `- This is a continuation of ${batchText} from run ${continuation.retryOfRunId}.`,
    `- Ambient/Pi previously stopped because of ${stopReason}.`,
    `- The last valid persisted record was ${continuation.lastValidRecordType} ${continuation.lastValidRecordId}.`,
    `- The retry prompt contains ${continuation.retainedRecordCount} validated records through that checkpoint, from ${continuation.originalRecordCount} prior records.`,
    "- Do not restate or re-emit records already present in the rendered-card and coverage ledger.",
    "- Continue with the next missing records/cards only. Do not stitch partial JSON or assume text after the checkpoint was valid.",
  ].join("\n");
}

function plannerBatchSourceOverview(sources: ProjectBoardSynthesisSource[]) {
  return sources
    .filter(projectBoardSourceIncludedInSynthesis)
    .slice(0, 24)
    .map((source, index) => ({
      sourceId: plannerSourceId(source, index),
      title: source.title,
      path: source.path,
      kind: source.kind,
      relevance: source.relevance,
      summary: source.summary,
      excerptPreview: source.excerpt?.trim().slice(0, 1800),
    }));
}

function plannerBatchLedger(sources: ProjectBoardSynthesisSource[], records: ProposalJsonlRecordArtifact[]) {
  const renderedCardLedger = buildProjectBoardRenderedCardLedger(records, { sources });
  const questions = records.filter((record) => record.type === "question");
  const coverage = records.filter((record) => record.type === "source_coverage");
  const remainingSourceIds = new Set(remainingPlannerCoverageSourceIds(sources, records));
  return {
    renderedCards: renderedCardLedger.entries,
    renderedCardLedgerChecksum: renderedCardLedger.checksum,
    renderedCardLedgerSummary: {
      cardCount: renderedCardLedger.cardCount,
      blockedCardCount: renderedCardLedger.blockedCardCount,
      duplicateCardCount: renderedCardLedger.duplicateCardCount,
      rejectedCardCount: renderedCardLedger.rejectedCardCount,
      evidenceCardCount: renderedCardLedger.evidenceCardCount,
      splitLineageCount: renderedCardLedger.splitLineageCount,
      invalidatedCardCount: renderedCardLedger.invalidatedCardCount,
    },
    openQuestions: questions.map((record) => ({
      questionId: record.questionId,
      cardId: record.cardId,
      question: record.question,
      required: record.required,
    })),
    sourceCoverage: coverage.map((record) => ({
      sourceId: record.sourceId,
      range: record.range,
      status: record.status,
      cardIds: record.cardIds,
      note: record.note,
    })),
    remainingCoverage: plannerBatchSourceOverview(sources)
      .filter((source) => remainingSourceIds.has(source.sourceId))
      .map((source) => ({
        sourceId: source.sourceId,
        title: source.title,
        path: source.path,
        summary: source.summary,
      })),
  };
}

function plannerLedgerCompactionCacheKey(input: {
  sources: ProjectBoardSynthesisSource[];
  projectName?: string;
  priorRecords: ProposalJsonlRecordArtifact[];
  refinement?: ProjectBoardSynthesisRefinementContext;
  charterProjectSummary?: ProjectBoardCharterProjectSummary;
  rawPromptBudget: ProjectBoardPromptBudgetAssessment;
  batchNumber: number;
  maxBatches: number;
  maxCardsPerBatch: number;
}): string {
  return stableBoardArtifactId("planner-ledger-compaction", [
    stableJson({
      projectName: input.projectName,
      batchNumber: input.batchNumber,
      maxBatches: input.maxBatches,
      maxCardsPerBatch: input.maxCardsPerBatch,
      rawPromptBudgetStatus: input.rawPromptBudget.status,
      rawPromptBudgetOperation: input.rawPromptBudget.operation,
      rawPromptBudgetModelId: input.rawPromptBudget.modelId,
      sources: input.sources
        .filter(projectBoardSourceIncludedInSynthesis)
        .map((source, index) => ({
          sourceId: plannerSourceId(source, index),
          title: source.title,
          path: source.path,
          kind: source.kind,
          summary: source.summary,
          excerpt: source.excerpt,
          relevance: source.relevance,
        })),
      records: input.priorRecords.filter(isPlannerLedgerCompactionRelevantRecord),
      settledAnswers: input.refinement?.answers ?? [],
      settledClarificationDecisions: input.refinement?.settledClarificationDecisions ?? [],
      pmReviewReport: input.refinement?.pmReviewReport
        ? {
            readiness: input.refinement.pmReviewReport.readiness,
            summary: input.refinement.pmReviewReport.summary,
            recommendedActivationScope: input.refinement.pmReviewReport.recommendedActivationScope,
            cardGenerationConstraints: input.refinement.pmReviewReport.cardGenerationConstraints,
            blockingQuestions: input.refinement.pmReviewReport.blockingQuestions,
          }
        : undefined,
      charterProjectSummary: input.charterProjectSummary
        ? {
            summary: input.charterProjectSummary.summary,
            sourceChecksumSet: input.charterProjectSummary.sourceChecksumSet,
            charterAnswerChecksum: input.charterProjectSummary.charterAnswerChecksum,
            unresolvedDecisions: input.charterProjectSummary.unresolvedDecisions,
          }
        : undefined,
    }),
  ]);
}

function isPlannerLedgerCompactionRelevantRecord(record: ProposalJsonlRecordArtifact): boolean {
  return record.type === "candidate_card" || record.type === "question" || record.type === "source_coverage" || record.type === "dependency_edge";
}

function readCachedPlannerLedgerCompaction(
  records: ProposalJsonlRecordArtifact[],
  cacheKey: string,
  rawPromptBudget: ProjectBoardPromptBudgetAssessment,
): ProjectBoardPlannerLedgerCompaction | undefined {
  for (const record of records.slice().reverse()) {
    if (record.type !== "progress" || !["planner_ledger_compacted", "section_context_compacted"].includes(record.stage)) continue;
    const metadata = record.metadata;
    const cached = normalizeCachedPlannerLedgerCompaction(metadata.plannerLedgerCompactionCache, cacheKey, rawPromptBudget);
    if (cached) return cached;
  }
  return undefined;
}

function normalizeCachedPlannerLedgerCompaction(
  value: unknown,
  cacheKey: string,
  rawPromptBudget: ProjectBoardPromptBudgetAssessment,
): ProjectBoardPlannerLedgerCompaction | undefined {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  if (!record || record.cacheKey !== cacheKey) return undefined;
  const summary = typeof record.summary === "string" && record.summary.trim() ? record.summary.trim() : "";
  if (!summary) return undefined;
  const source = record.source === "pi_rlm" || record.source === "deterministic_fallback" ? record.source : "deterministic_fallback";
  return {
    source,
    cacheKey,
    cacheHit: true,
    summary,
    renderedCardThemes: compactStringListField(record.renderedCardThemes, [], 12, 300),
    duplicateAvoidanceNotes: compactStringListField(record.duplicateAvoidanceNotes, [], 16, 360),
    remainingCoverage: compactCoverageListField(record.remainingCoverage, []),
    openQuestions: compactQuestionListField(record.openQuestions, []),
    dependencyHints: compactStringListField(record.dependencyHints, [], 12, 300),
    citations: compactStringListField(record.citations, [], 16, 220),
    recentRenderedCards: compactRecentRenderedCardsField(record.recentRenderedCards),
    renderedCardCount: numericMetadataField(record.renderedCardCount),
    omittedRenderedCardCount: numericMetadataField(record.omittedRenderedCardCount),
    sourceCount: numericMetadataField(record.sourceCount),
    openQuestionCount: numericMetadataField(record.openQuestionCount),
    promptCharCount: 0,
    responseCharCount: 0,
    rawPromptBudgetStatus: rawPromptBudget.status,
    ...(typeof record.finalPromptCharCount === "number" && Number.isFinite(record.finalPromptCharCount)
      ? { finalPromptCharCount: record.finalPromptCharCount }
      : {}),
    ...(typeof record.error === "string" && record.error.trim() ? { error: record.error.trim() } : {}),
  };
}

function deterministicPlannerLedgerCompaction(input: {
  sources: ProjectBoardSynthesisSource[];
  priorRecords: ProposalJsonlRecordArtifact[];
  rawPromptBudget: ProjectBoardPromptBudgetAssessment;
  cacheKey: string;
  promptCharCount: number;
  responseCharCount: number;
}): ProjectBoardPlannerLedgerCompaction {
  const cards = input.priorRecords.filter((record) => record.type === "candidate_card");
  const questions = input.priorRecords.filter((record) => record.type === "question");
  const coverage = input.priorRecords.filter((record) => record.type === "source_coverage");
  const phaseCounts = countBy(cards.map((record) => record.phase || "Unspecified"));
  const statusCounts = countBy(cards.map((record) => record.candidateStatus));
  const sourceCoverage = latestCoverageBySource(coverage);
  const remainingCoverage = plannerBatchSourceOverview(input.sources)
    .filter((source) => sourceCoverage.get(source.sourceId) !== "covered")
    .slice(0, 36)
    .map((source) => ({
      sourceId: source.sourceId,
      title: source.title,
      status: sourceCoverage.get(source.sourceId) ?? "uncovered",
      summary: source.summary,
    }));
  const recentRenderedCards = cards.slice(-60).map((record) => ({
    cardId: record.sourceId,
    title: record.title,
    phase: record.phase,
    candidateStatus: record.candidateStatus,
  }));
  const duplicateAvoidanceNotes = cards
    .slice(-120)
    .map((record) => `${record.sourceId}: ${record.title}`)
    .slice(0, 40);
  return {
    source: "deterministic_fallback",
    cacheKey: input.cacheKey,
    cacheHit: false,
    summary: [
      `${cards.length.toLocaleString()} rendered candidate card${cards.length === 1 ? "" : "s"} are already in the planner ledger.`,
      `${remainingCoverage.length.toLocaleString()} included source${remainingCoverage.length === 1 ? "" : "s"} still need coverage or verification.`,
      `Phase counts: ${formatCounts(phaseCounts)}.`,
      `Status counts: ${formatCounts(statusCounts)}.`,
    ].join(" "),
    renderedCardThemes: Object.entries(phaseCounts)
      .slice(0, 12)
      .map(([phase, count]) => `${phase}: ${count} rendered card${count === 1 ? "" : "s"}`),
    duplicateAvoidanceNotes,
    remainingCoverage,
    openQuestions: questions.slice(-24).map((record) => ({
      questionId: record.questionId,
      cardId: record.cardId,
      question: record.question,
    })),
    dependencyHints: ["Use planner_card_search before emitting cards that resemble omitted rendered cards from the compacted ledger."],
    citations: [
      ...input.sources
        .filter(projectBoardSourceIncludedInSynthesis)
        .slice(0, 12)
        .map((source, index) => `${plannerSourceId(source, index)}: ${source.path || source.title}`),
      ...recentRenderedCards.slice(-12).map((card) => `${card.cardId}: ${card.title}`),
    ],
    recentRenderedCards,
    renderedCardCount: cards.length,
    omittedRenderedCardCount: Math.max(0, cards.length - recentRenderedCards.length),
    sourceCount: input.sources.filter(projectBoardSourceIncludedInSynthesis).length,
    openQuestionCount: questions.length,
    promptCharCount: input.promptCharCount,
    responseCharCount: input.responseCharCount,
    rawPromptBudgetStatus: input.rawPromptBudget.status,
  };
}

function plannerBatchCompactedLedger(compaction: ProjectBoardPlannerLedgerCompaction) {
  return {
    compacted: true,
    source: compaction.source,
    summary: compaction.summary,
    renderedCardCount: compaction.renderedCardCount,
    omittedRenderedCardCount: compaction.omittedRenderedCardCount,
    recentRenderedCards: compaction.recentRenderedCards,
    duplicateAvoidanceNotes: compaction.duplicateAvoidanceNotes,
    openQuestions: compaction.openQuestions,
    remainingCoverage: compaction.remainingCoverage,
    dependencyHints: compaction.dependencyHints,
  };
}

function latestCoverageBySource(records: Extract<ProposalJsonlRecordArtifact, { type: "source_coverage" }>[]): Map<string, string> {
  const statuses = new Map<string, string>();
  for (const record of records) {
    if (record.status === "ignored") continue;
    statuses.set(record.sourceId, record.status);
  }
  return statuses;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return "none";
  return entries
    .slice(0, 8)
    .map(([key, count]) => `${key}=${count}`)
    .join(", ");
}

function compactStringField(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim() ? truncateText(value.trim(), maxLength) : fallback;
}

function compactStringListField(value: unknown, fallback: string[], limit: number, maxItemLength: number): string[] {
  const items = Array.isArray(value) ? value : [];
  const strings = items
    .map((item) => (typeof item === "string" ? truncateText(item.trim(), maxItemLength) : ""))
    .filter(Boolean)
    .slice(0, limit);
  return strings.length > 0 ? strings : fallback;
}

function compactCoverageListField(
  value: unknown,
  fallback: ProjectBoardPlannerLedgerCompaction["remainingCoverage"],
): ProjectBoardPlannerLedgerCompaction["remainingCoverage"] {
  if (!Array.isArray(value)) return fallback;
  const coverage = value
    .map((item) => {
      const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
      const sourceId = typeof record.sourceId === "string" ? record.sourceId.trim() : "";
      if (!sourceId) return undefined;
      return {
        sourceId,
        ...(typeof record.title === "string" && record.title.trim() ? { title: truncateText(record.title.trim(), 240) } : {}),
        ...(typeof record.status === "string" && record.status.trim() ? { status: truncateText(record.status.trim(), 80) } : {}),
        ...(typeof record.summary === "string" && record.summary.trim() ? { summary: truncateText(record.summary.trim(), 500) } : {}),
      };
    })
    .filter((item): item is ProjectBoardPlannerLedgerCompaction["remainingCoverage"][number] => Boolean(item))
    .slice(0, 36);
  return coverage.length > 0 ? coverage : fallback;
}

function compactQuestionListField(
  value: unknown,
  fallback: ProjectBoardPlannerLedgerCompaction["openQuestions"],
): ProjectBoardPlannerLedgerCompaction["openQuestions"] {
  if (!Array.isArray(value)) return fallback;
  const questions = value
    .map((item) => {
      const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
      const questionId = typeof record.questionId === "string" ? record.questionId.trim() : "";
      const question = typeof record.question === "string" ? record.question.trim() : "";
      if (!questionId || !question) return undefined;
      return {
        questionId,
        ...(typeof record.cardId === "string" && record.cardId.trim() ? { cardId: record.cardId.trim() } : {}),
        question: truncateText(question, 500),
      };
    })
    .filter((item): item is ProjectBoardPlannerLedgerCompaction["openQuestions"][number] => Boolean(item))
    .slice(0, 24);
  return questions.length > 0 ? questions : fallback;
}

function compactRecentRenderedCardsField(value: unknown): ProjectBoardPlannerLedgerCompaction["recentRenderedCards"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
      const cardId = typeof record.cardId === "string" ? record.cardId.trim() : "";
      const title = typeof record.title === "string" ? record.title.trim() : "";
      if (!cardId || !title) return undefined;
      return {
        cardId,
        title: truncateText(title, 240),
        ...(typeof record.phase === "string" && record.phase.trim() ? { phase: truncateText(record.phase.trim(), 200) } : {}),
        ...(typeof record.candidateStatus === "string" && record.candidateStatus.trim()
          ? { candidateStatus: truncateText(record.candidateStatus.trim(), 80) }
          : {}),
      };
    })
    .filter((item): item is ProjectBoardPlannerLedgerCompaction["recentRenderedCards"][number] => Boolean(item))
    .slice(0, 60);
}

function numericMetadataField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJsonValue(item)]),
  );
}

function normalizePlannerBatchRecords(
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

class ProjectBoardSettledClarificationValidationError extends Error {
  readonly violations: ProjectBoardSettledClarificationReopenViolation[];
  readonly context: Record<string, unknown>;

  constructor(violations: ProjectBoardSettledClarificationReopenViolation[], context: Record<string, unknown>) {
    const first = violations[0];
    super(
      first
        ? `Ambient/Pi reopened ${violations.length} settled clarification decision${
            violations.length === 1 ? "" : "s"
          } in ${String(context.surface ?? "planner output")}: "${first.question}" matches answered decision ${first.matchedDecisionId}. It must reuse the settled answer or cite materially changed source evidence and ask only the missing delta.`
        : "Ambient/Pi reopened a settled clarification decision.",
    );
    this.name = "ProjectBoardSettledClarificationValidationError";
    this.violations = violations;
    this.context = context;
  }
}

class ProjectBoardDuplicateClarificationQuestionValidationError extends Error {
  readonly violations: ProjectBoardDuplicateClarificationQuestionViolation[];
  readonly context: Record<string, unknown>;

  constructor(violations: ProjectBoardDuplicateClarificationQuestionViolation[], context: Record<string, unknown>) {
    const first = violations[0];
    super(
      first
        ? `Ambient/Pi emitted ${violations.length} duplicate clarification question${
            violations.length === 1 ? "" : "s"
          } in ${String(context.surface ?? "planner output")}: "${first.duplicateQuestion}" duplicates "${first.firstQuestion}" by ${first.duplicateReason}. Reuse one stable canonical question id instead of emitting variants.`
        : "Ambient/Pi emitted duplicate clarification questions.",
    );
    this.name = "ProjectBoardDuplicateClarificationQuestionValidationError";
    this.violations = violations;
    this.context = context;
  }
}

function assertValidProjectBoardGeneratedDraftTitles(
  draft: ProjectBoardSynthesisDraft,
  context: Record<string, unknown>,
): void {
  assertProjectBoardCardTitleQuality(
    draft.cards.map((card, index) => ({
      title: card.title,
      sourceId: card.sourceId,
      cardId: card.sourceId,
      location: `draft.cards[${index}].title`,
    })),
    context,
  );
}

function assertValidProjectBoardGeneratedRecordTitles(
  records: ProposalJsonlRecordArtifact[],
  context: Record<string, unknown>,
): void {
  assertProjectBoardCardTitleQuality(
    records.flatMap((record, index) =>
      record.type === "candidate_card"
        ? [
            {
              title: record.title,
              sourceId: record.sourceId,
              cardId: record.sourceId,
              location: `records[${index}].title`,
            },
          ]
        : [],
    ),
    context,
  );
}

function assertValidClarificationQuestionDraft(
  draft: ProjectBoardSynthesisDraft,
  refinement: ProjectBoardSynthesisRefinementContext | undefined,
  context: Record<string, unknown>,
): void {
  assertValidClarificationQuestionCandidates(refinement, projectBoardClarificationQuestionCandidatesFromDraft(draft), context);
}

function assertValidClarificationQuestionRecords(
  records: ProposalJsonlRecordArtifact[],
  refinement: ProjectBoardSynthesisRefinementContext | undefined,
  context: Record<string, unknown>,
): void {
  assertValidClarificationQuestionCandidates(refinement, projectBoardClarificationQuestionCandidatesFromRecords(records), context);
}

function assertValidClarificationQuestionCandidates(
  refinement: ProjectBoardSynthesisRefinementContext | undefined,
  candidates: Parameters<typeof projectBoardSettledClarificationReopenViolations>[1],
  context: Record<string, unknown>,
): void {
  const violations = projectBoardSettledClarificationReopenViolations(refinement, candidates);
  if (violations.length > 0) throw new ProjectBoardSettledClarificationValidationError(violations, context);
  const duplicateViolations = projectBoardDuplicateClarificationQuestionViolations(candidates);
  if (duplicateViolations.length === 0) return;
  throw new ProjectBoardDuplicateClarificationQuestionValidationError(duplicateViolations, context);
}

function projectBoardClarificationQuestionCandidatesFromDraft(draft: ProjectBoardSynthesisDraft) {
  return [
    ...draft.questions.map((question, index) => ({
      question,
      location: `draft.questions[${index}]`,
    })),
    ...draft.cards.flatMap((card, cardIndex) =>
      (card.clarificationQuestions ?? []).map((question, questionIndex) => ({
        question,
        location: `draft.cards[${cardIndex}].clarificationQuestions[${questionIndex}]`,
        cardId: card.sourceId,
        cardTitle: card.title,
        sourceId: card.sourceId,
      })),
    ),
  ];
}

function projectBoardClarificationQuestionCandidatesFromRecords(records: ProposalJsonlRecordArtifact[]) {
  const candidates = records.flatMap((record, recordIndex) => {
    if (record.type === "question") {
      return [
        {
          question: record.question,
          questionId: record.questionId,
          location: `records[${recordIndex}].question`,
          cardId: record.cardId,
        },
      ];
    }
    if (record.type === "candidate_card") {
      return dedupeClarificationQuestionCandidates([
        ...(record.clarificationDecisions ?? [])
          .filter((decision) => decision.state === "open")
          .map((decision, decisionIndex) => ({
            question: decision.question,
            questionId: decision.id,
            location: `records[${recordIndex}].clarificationDecisions[${decisionIndex}]`,
            cardId: record.sourceId,
            cardTitle: record.title,
            sourceId: record.sourceId,
          })),
        ...record.clarificationQuestions.map((question, questionIndex) => ({
          question,
          location: `records[${recordIndex}].clarificationQuestions[${questionIndex}]`,
          cardId: record.sourceId,
          cardTitle: record.title,
          sourceId: record.sourceId,
        })),
      ]);
    }
    if (record.type === "proposal_final") {
      return record.questions.map((question, questionIndex) => ({
        question,
        location: `records[${recordIndex}].questions[${questionIndex}]`,
      }));
    }
    return [];
  });
  return dedupeMirroredClarificationQuestionCandidates(candidates);
}

function dedupeClarificationQuestionCandidates(
  candidates: ProjectBoardClarificationQuestionCandidate[],
): ProjectBoardClarificationQuestionCandidate[] {
  const deduped: ProjectBoardClarificationQuestionCandidate[] = [];
  for (const candidate of candidates) {
    const question = candidate.question.trim();
    if (!question) continue;
    const duplicate = deduped.some((existing) => {
      if (existing.questionId && candidate.questionId && existing.questionId === candidate.questionId) return true;
      return projectBoardQuestionsAreNearDuplicates(existing.question, question);
    });
    if (!duplicate) deduped.push({ ...candidate, question });
  }
  return deduped;
}

function dedupeMirroredClarificationQuestionCandidates(
  candidates: ProjectBoardClarificationQuestionCandidate[],
): ProjectBoardClarificationQuestionCandidate[] {
  const deduped: ProjectBoardClarificationQuestionCandidate[] = [];
  for (const candidate of candidates) {
    const question = candidate.question.trim();
    if (!question) continue;
    const duplicateIndex = deduped.findIndex((existing) => {
      if (existing.questionId && candidate.questionId && existing.questionId === candidate.questionId) {
        if (existing.cardId && candidate.cardId && existing.cardId !== candidate.cardId) return false;
        return true;
      }
      if (!projectBoardQuestionsAreNearDuplicates(existing.question, question)) return false;
      if (existing.cardId && candidate.cardId && existing.cardId !== candidate.cardId) return false;
      return true;
    });
    if (duplicateIndex < 0) {
      deduped.push({ ...candidate, question });
      continue;
    }
    const existing = deduped[duplicateIndex];
    if (!existing.cardId && candidate.cardId) deduped[duplicateIndex] = { ...candidate, question };
  }
  return deduped;
}

function settledClarificationValidationMetadata(error: unknown): Record<string, unknown> {
  if (!(error instanceof ProjectBoardSettledClarificationValidationError)) return {};
  return {
    failureKind: "settled_clarification_reopened",
    settledClarificationViolationCount: error.violations.length,
    settledClarificationViolations: error.violations.slice(0, 12),
    settledClarificationValidationContext: error.context,
  };
}

function duplicateClarificationQuestionValidationMetadata(error: unknown): Record<string, unknown> {
  if (!(error instanceof ProjectBoardDuplicateClarificationQuestionValidationError)) return {};
  return {
    failureKind: "duplicate_canonical_questions",
    duplicateClarificationQuestionCount: error.violations.length,
    duplicateClarificationQuestionViolations: error.violations.slice(0, 12),
    duplicateClarificationValidationContext: error.context,
  };
}

function cardTitleQualityValidationMetadata(error: unknown): Record<string, unknown> {
  if (!(error instanceof ProjectBoardCardTitleQualityValidationError)) return {};
  return {
    failureKind: "implementation_detail_card_titles",
    cardTitleQualityViolationCount: error.violations.length,
    cardTitleQualityViolations: error.violations.slice(0, 12),
    cardTitleQualityValidationContext: error.context,
  };
}

function limitPlannerBatchCandidateCardRecords(
  records: ProposalJsonlRecordArtifact[],
  maxCardsPerBatch: number,
  section: ProjectBoardPlanningSection,
): ProposalJsonlRecordArtifact[] {
  const kept: ProposalJsonlRecordArtifact[] = [];
  const keptCardIds = new Set<string>();
  const omittedCardIds: string[] = [];
  let candidateCount = 0;
  for (const record of records) {
    if (record.type !== "candidate_card") {
      kept.push(record);
      continue;
    }
    candidateCount += 1;
    if (candidateCount <= maxCardsPerBatch) {
      kept.push(record);
      keptCardIds.add(record.sourceId);
    } else {
      omittedCardIds.push(record.sourceId);
    }
  }
  if (omittedCardIds.length === 0) return kept;
  const sanitized = kept.flatMap((record): ProposalJsonlRecordArtifact[] => {
    if (record.type === "source_coverage") {
      return [
        validateProposalJsonlRecordArtifact({
          ...record,
          cardIds: record.cardIds.filter((cardId) => keptCardIds.has(cardId)),
          status: record.status === "covered" && record.cardIds.some((cardId) => omittedCardIds.includes(cardId)) ? "partial" : record.status,
        }),
      ];
    }
    if (record.type === "dependency_edge" && (omittedCardIds.includes(record.fromCardId) || omittedCardIds.includes(record.toCardId))) {
      return [];
    }
    return [record];
  });
  return [
    ...sanitized,
    validateProposalJsonlRecordArtifact({
      type: "warning",
      code: "planner_batch_card_limit",
      message: `Ambient/Pi returned ${candidateCount} candidate cards for planner batch ${section.heading}; kept the first ${maxCardsPerBatch} so cards can be persisted and dispatched incrementally.`,
      createdAt: new Date().toISOString(),
      metadata: {
        sectionId: section.id,
        sourceId: section.sourceId,
        omittedCardIds,
        candidateCount,
        maxCardsPerBatch,
      },
    }),
  ];
}

function attachPlannerRecordSourceSnapshots(
  records: ProposalJsonlRecordArtifact[],
  sources: ProjectBoardSynthesisSource[],
): ProposalJsonlRecordArtifact[] {
  const sourceById = new Map(sources.flatMap((source) => (source.id?.trim() ? [[source.id.trim(), source] as const] : [])));
  const sourceByPath = new Map(sources.flatMap((source) => (source.path?.trim() ? [[source.path.trim(), source] as const] : [])));
  return records.map((record) => {
    if (record.type !== "candidate_card") return record;
    const sourceRefs = record.sourceRefs.map((ref) => {
      if (ref.contentHash) return ref;
      const source = ref.sourceId ? sourceById.get(ref.sourceId) : ref.path ? sourceByPath.get(ref.path) : undefined;
      if (!source?.contentHash) return ref;
      return { ...ref, contentHash: source.contentHash };
    });
    if (JSON.stringify(sourceRefs) === JSON.stringify(record.sourceRefs)) return record;
    return validateProposalJsonlRecordArtifact({ ...record, sourceRefs });
  });
}

interface PlannerBatchRenderedDuplicateDiagnostic {
  sourceId: string;
  title: string;
  matchedCardId: string;
  matchedTitle: string;
  reason: "source_id" | "title";
  duplicateDecision: ProjectBoardRenderedCardLedgerEntry["duplicateDecision"];
  invalidationState: ProjectBoardRenderedCardLedgerEntry["invalidationState"];
  invalidationReasons: ProjectBoardRenderedCardLedgerEntry["invalidationReasons"];
  restartAction: ProjectBoardRenderedCardLedgerEntry["restartAction"];
  renderFingerprint: string;
}

function filterPlannerBatchRenderedCardDuplicates(
  records: ProposalJsonlRecordArtifact[],
  priorRecords: ProposalJsonlRecordArtifact[],
  section: ProjectBoardPlanningSection,
  sources: ProjectBoardSynthesisSource[],
): {
  records: ProposalJsonlRecordArtifact[];
  diagnostics: PlannerBatchRenderedDuplicateDiagnostic[];
  warningRecords: ProposalJsonlRecordArtifact[];
} {
  const renderedCards = [...buildProjectBoardRenderedCardLedger(priorRecords, { sources }).entries];
  if (renderedCards.length === 0) return { records, diagnostics: [], warningRecords: [] };

  const diagnostics: PlannerBatchRenderedDuplicateDiagnostic[] = [];
  const invalidatedMatches: PlannerBatchRenderedDuplicateDiagnostic[] = [];
  const retainedRecords: ProposalJsonlRecordArtifact[] = [];
  const droppedCardIds = new Set<string>();
  for (const record of records) {
    if (record.type !== "candidate_card") {
      retainedRecords.push(record);
      continue;
    }
    const match = renderedCardDuplicateMatch(record, renderedCards);
    if (match) {
      if (match.restartAction === "regenerate_card") {
        invalidatedMatches.push(match);
      } else {
        diagnostics.push(match);
        droppedCardIds.add(normalizeExactText(record.sourceId));
        continue;
      }
    }
    retainedRecords.push(record);
    const entry = buildProjectBoardRenderedCardLedger([record], { sources }).entries[0];
    if (entry) renderedCards.push(entry);
  }

  if (diagnostics.length === 0 && invalidatedMatches.length === 0) return { records, diagnostics: [], warningRecords: [] };
  const sanitizedRecords = retainedRecords.flatMap((record): ProposalJsonlRecordArtifact[] => {
    if (record.type === "question" && record.cardId && droppedCardIds.has(normalizeExactText(record.cardId))) return [];
    if (record.type === "dependency_edge" && (droppedCardIds.has(normalizeExactText(record.fromCardId)) || droppedCardIds.has(normalizeExactText(record.toCardId)))) {
      return [];
    }
    if (record.type === "source_coverage") {
      const cardIds = record.cardIds.filter((cardId) => !droppedCardIds.has(normalizeExactText(cardId)));
      if (record.cardIds.length > 0 && cardIds.length === 0) return [];
      if (cardIds.length === record.cardIds.length) return [record];
      return [
        validateProposalJsonlRecordArtifact({
          ...record,
          cardIds,
          status: record.status === "covered" ? "partial" : record.status,
        }),
      ];
    }
    return [record];
  });

  const warningRecords: ProposalJsonlRecordArtifact[] = [];
  if (diagnostics.length > 0) {
    const duplicateSummary = `Filtered ${diagnostics.length} planner-batch candidate card${
      diagnostics.length === 1 ? "" : "s"
    } already present in the rendered-card ledger.`;
    warningRecords.push(
      validateProposalJsonlRecordArtifact({
        type: "warning",
        code: "planner_batch_rendered_card_duplicate_filtered",
        message: duplicateSummary,
        createdAt: new Date().toISOString(),
        metadata: {
          enforcement: "rendered_card_ledger",
          sectionId: section.id,
          sourceId: section.sourceId,
          duplicateCount: diagnostics.length,
          duplicateCandidates: diagnostics.slice(0, 20),
        },
      }),
    );
  }
  if (invalidatedMatches.length > 0) {
    const invalidatedSummary = `Allowed ${invalidatedMatches.length} planner-batch candidate card${
      invalidatedMatches.length === 1 ? "" : "s"
    } to regenerate because the rendered-card ledger entry was invalidated.`;
    warningRecords.push(
      validateProposalJsonlRecordArtifact({
        type: "warning",
        code: "planner_batch_rendered_card_ledger_invalidated",
        message: invalidatedSummary,
        createdAt: new Date().toISOString(),
        metadata: {
          enforcement: "rendered_card_ledger",
          sectionId: section.id,
          sourceId: section.sourceId,
          invalidatedCount: invalidatedMatches.length,
          invalidatedCandidates: invalidatedMatches.slice(0, 20),
        },
      }),
    );
  }
  return {
    records: sanitizedRecords,
    diagnostics,
    warningRecords,
  };
}

function renderedCardDuplicateMatch(
  record: Extract<ProposalJsonlRecordArtifact, { type: "candidate_card" }>,
  renderedCards: ProjectBoardRenderedCardLedgerEntry[],
): PlannerBatchRenderedDuplicateDiagnostic | undefined {
  const sourceId = normalizeExactText(record.sourceId);
  const title = normalizeExactText(record.title);
  for (const rendered of renderedCards) {
    const renderedCardId = normalizeExactText(rendered.cardId);
    const renderedTitle = normalizeExactText(rendered.title);
    const reason = sourceId && sourceId === renderedCardId ? "source_id" : title && title === renderedTitle ? "title" : undefined;
    if (!reason) continue;
    return {
      sourceId: record.sourceId,
      title: record.title,
      matchedCardId: rendered.cardId,
      matchedTitle: rendered.title,
      reason,
      duplicateDecision: rendered.duplicateDecision,
      invalidationState: rendered.invalidationState,
      invalidationReasons: rendered.invalidationReasons,
      restartAction: rendered.restartAction,
      renderFingerprint: rendered.renderFingerprint,
    };
  }
  return undefined;
}

function plannerBatchStatusFromResponse(responseText: string, records: ProposalJsonlRecordArtifact[]): PlannerBatchStatus {
  const parsed = safeParsePlannerBatchObject(responseText);
  const status = typeof parsed?.plannerStatus === "string" ? parsed.plannerStatus : typeof parsed?.status === "string" ? parsed.status : undefined;
  if (isPlannerBatchStatus(status)) return status;
  // proposal_final is stripped from normalized batch records, so a model signaling
  // completion only via that record must be detected on the raw extraction or the
  // run would be billed for extra batches until coverage/maxBatches stops it.
  if (
    records.some((record) => record.type === "proposal_final") ||
    extractProjectBoardProposalJsonlRecordsWithDiagnostics(responseText).records.some((record) => record.type === "proposal_final")
  ) {
    return "planning_complete";
  }
  if (records.some((record) => record.type === "question") && !records.some((record) => record.type === "candidate_card")) return "needs_user_decision";
  return "continue";
}

function safeParsePlannerBatchObject(responseText: string): Record<string, unknown> | undefined {
  try {
    const parsed = parseProjectBoardSynthesisJson(responseText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function isPlannerBatchStatus(value: unknown): value is PlannerBatchStatus {
  return (
    value === "continue" ||
    value === "planning_complete" ||
    value === "needs_user_decision" ||
    value === "budget_exhausted" ||
    value === "stale_source_snapshot" ||
    value === "validation_failed" ||
    value === "user_cancelled"
  );
}

function previewProjectBoardPlannerResponse(responseText: string): string {
  return responseText.replace(/\s+/g, " ").trim().slice(0, 500);
}

function plannerLedgerCompactionTelemetryMetadata(compaction: ProjectBoardPlannerLedgerCompactionTelemetry): Record<string, unknown> {
  return {
    source: compaction.source,
    cacheKey: compaction.cacheKey,
    cacheHit: compaction.cacheHit,
    summary: compaction.summary,
    renderedCardCount: compaction.renderedCardCount,
    omittedRenderedCardCount: compaction.omittedRenderedCardCount,
    sourceCount: compaction.sourceCount,
    openQuestionCount: compaction.openQuestionCount,
    promptCharCount: compaction.promptCharCount,
    responseCharCount: compaction.responseCharCount,
    rawPromptBudgetStatus: compaction.rawPromptBudgetStatus,
    finalPromptCharCount: compaction.finalPromptCharCount,
    error: compaction.error,
  };
}

function plannerLedgerCompactionCachePayload(compaction: ProjectBoardPlannerLedgerCompaction): Record<string, unknown> {
  return {
    ...plannerLedgerCompactionTelemetryMetadata(compaction),
    renderedCardThemes: compaction.renderedCardThemes,
    duplicateAvoidanceNotes: compaction.duplicateAvoidanceNotes,
    remainingCoverage: compaction.remainingCoverage,
    openQuestions: compaction.openQuestions,
    dependencyHints: compaction.dependencyHints,
    citations: compaction.citations,
    recentRenderedCards: compaction.recentRenderedCards,
  };
}

function plannerLedgerCompactionProgressRecord(input: {
  compaction: ProjectBoardPlannerLedgerCompaction;
  batchNumber: number;
  maxBatches: number;
  maxCardsPerBatch: number;
  plannerSessionId?: string;
  durationMs: number;
}): ProposalJsonlRecordArtifact {
  return validateProposalJsonlRecordArtifact({
    type: "progress",
    stage: "planner_ledger_compacted",
    title: input.compaction.cacheHit
      ? `Reused cached planner ledger compaction for batch ${input.batchNumber}`
      : `Compacted planner ledger for batch ${input.batchNumber}`,
    summary: input.compaction.cacheHit
      ? `Reused cached planner-ledger compaction for ${input.compaction.renderedCardCount.toLocaleString()} rendered card${
          input.compaction.renderedCardCount === 1 ? "" : "s"
        }; ${input.compaction.omittedRenderedCardCount.toLocaleString()} omitted card${
          input.compaction.omittedRenderedCardCount === 1 ? "" : "s"
        } remain represented by the compacted summary.`
      : `Compacted ${input.compaction.renderedCardCount.toLocaleString()} rendered card${
          input.compaction.renderedCardCount === 1 ? "" : "s"
        }; ${input.compaction.omittedRenderedCardCount.toLocaleString()} omitted card${
          input.compaction.omittedRenderedCardCount === 1 ? "" : "s"
        } remain represented by the compacted summary.`,
    createdAt: new Date().toISOString(),
    metadata: {
      plannerBatchIndex: input.batchNumber,
      plannerBatchCount: input.maxBatches,
      maxCardsPerBatch: input.maxCardsPerBatch,
      plannerSessionId: input.plannerSessionId,
      compactionDurationMs: input.durationMs,
      plannerLedgerCompaction: plannerLedgerCompactionTelemetryMetadata(input.compaction),
      plannerLedgerCompactionCache: plannerLedgerCompactionCachePayload(input.compaction),
    },
  });
}

function sectionedContextCompactionProgressRecord(input: {
  compaction: ProjectBoardPlannerLedgerCompaction;
  section: ProjectBoardPlanningSection;
  sectionNumber: number;
  sectionCount: number;
  maxCardsPerSection: number;
  reason: ProjectBoardSectionedContextCompactionReason;
  plannerSessionId?: string;
  durationMs: number;
}): ProposalJsonlRecordArtifact {
  return validateProposalJsonlRecordArtifact({
    type: "progress",
    stage: "section_context_compacted",
    title: input.compaction.cacheHit
      ? `Reused cached section context compaction for section ${input.sectionNumber}/${input.sectionCount}`
      : `Compacted section context for section ${input.sectionNumber}/${input.sectionCount}`,
    summary: input.compaction.cacheHit
      ? `Reused cached section-context compaction for ${input.section.heading}; ${input.compaction.renderedCardCount.toLocaleString()} rendered card${
          input.compaction.renderedCardCount === 1 ? "" : "s"
        } remain represented by compact context.`
      : `Compacted repeated source and rendered-card context for ${input.section.heading}; ${input.compaction.renderedCardCount.toLocaleString()} rendered card${
          input.compaction.renderedCardCount === 1 ? "" : "s"
        } remain represented by compact context.`,
    createdAt: new Date().toISOString(),
    metadata: {
      sectionId: input.section.id,
      sectionIndex: input.sectionNumber,
      sectionCount: input.sectionCount,
      sectionHeading: input.section.heading,
      sectionRange: input.section.range,
      sourceId: input.section.sourceId,
      sourcePath: input.section.sourcePath,
      maxCardsPerSection: input.maxCardsPerSection,
      plannerSessionId: input.plannerSessionId,
      compactionDurationMs: input.durationMs,
      sectionContextCompactionReason: input.reason,
      plannerLedgerCompaction: plannerLedgerCompactionTelemetryMetadata(input.compaction),
      plannerLedgerCompactionCache: plannerLedgerCompactionCachePayload(input.compaction),
    },
  });
}

function plannerPromptBudgetWarningRecord(input: {
  assessment: ProjectBoardPromptBudgetAssessment;
  batchNumber: number;
  maxBatches: number;
  maxCardsPerBatch: number;
  plannerSessionId?: string;
}): ProposalJsonlRecordArtifact | undefined {
  if (!input.assessment.summarizationRecommended) return undefined;
  const action =
    input.assessment.recommendedAction === "reduce_prompt_before_call"
      ? "reduce the prompt before calling Pi"
      : input.assessment.recommendedAction === "summarize_before_call"
        ? "summarize ledgers before calling Pi"
        : "favor compact ledgers and retrieval tools";
  return validateProposalJsonlRecordArtifact({
    type: "warning",
    code: "planner_prompt_budget_pressure",
    message: `Planner batch ${input.batchNumber} prompt is estimated at ${input.assessment.estimatedPromptTokens.toLocaleString()} tokens (${input.assessment.status}); ${action}.`,
    createdAt: new Date().toISOString(),
    metadata: {
      plannerBatchIndex: input.batchNumber,
      plannerBatchCount: input.maxBatches,
      maxCardsPerBatch: input.maxCardsPerBatch,
      plannerSessionId: input.plannerSessionId,
      promptBudgetAssessment: projectBoardPromptBudgetAssessmentMetadata(input.assessment),
    },
  });
}

function plannerBatchProgressRecord(input: {
  batchNumber: number;
  maxBatches: number;
  status: PlannerBatchStatus;
  maxCardsPerBatch: number;
  recordCount: number;
  batchResponseCharCount: number;
  batchDurationMs: number;
  plannerSessionId?: string;
  finishReason?: string;
  stopReason?: string;
  outputTokenBudget?: number;
  modelBudgetProfile?: ProjectBoardModelBudgetProfile;
  promptBudgetAssessment?: ProjectBoardPromptBudgetAssessment;
  usage?: unknown;
  recoverableOutputStop?: boolean;
  lastValidRecord?: PlannerLastValidRecord;
}): ProposalJsonlRecordArtifact {
  return validateProposalJsonlRecordArtifact({
    type: "progress",
    stage: "planner_batch_succeeded",
    title: `Completed planner batch ${input.batchNumber}`,
    summary:
      input.status === "continue"
        ? `Planner batch ${input.batchNumber} completed and requested another batch.`
        : `Planner batch ${input.batchNumber} completed with stop state ${input.status}.`,
    createdAt: new Date().toISOString(),
    metadata: {
      plannerBatchIndex: input.batchNumber,
      plannerBatchCount: input.maxBatches,
      plannerStatus: input.status,
      maxCardsPerBatch: input.maxCardsPerBatch,
      recordCount: input.recordCount,
      batchResponseCharCount: input.batchResponseCharCount,
      batchDurationMs: input.batchDurationMs,
      plannerSessionId: input.plannerSessionId,
      finishReason: input.finishReason,
      stopReason: input.stopReason,
      outputTokenBudget: input.outputTokenBudget,
      modelBudgetProfile: input.modelBudgetProfile ? projectBoardModelBudgetProfileMetadata(input.modelBudgetProfile) : undefined,
      promptBudgetAssessment: input.promptBudgetAssessment ? projectBoardPromptBudgetAssessmentMetadata(input.promptBudgetAssessment) : undefined,
      usage: input.usage,
      recoverableOutputStop: input.recoverableOutputStop === true,
      lastValidRecordId: input.lastValidRecord?.recordId,
      lastValidRecordType: input.lastValidRecord?.recordType,
      lastValidRecordIndex: input.lastValidRecord?.recordIndex,
    },
  });
}

function plannerBatchValidationFailureRecords(input: {
  batchNumber: number;
  maxBatches: number;
  maxCardsPerBatch: number;
  error: unknown;
  batchResponseCharCount: number;
  batchDurationMs: number;
  plannerSessionId?: string;
  finishReason?: string;
  stopReason?: string;
  outputTokenBudget?: number;
  modelBudgetProfile?: ProjectBoardModelBudgetProfile;
  promptBudgetAssessment?: ProjectBoardPromptBudgetAssessment;
  usage?: unknown;
  lastValidRecord?: PlannerLastValidRecord;
  responsePreview?: string;
}): ProposalJsonlRecordArtifact[] {
  const message = errorMessage(input.error);
  const createdAt = new Date().toISOString();
  const metadata = {
    plannerBatchIndex: input.batchNumber,
    plannerBatchCount: input.maxBatches,
    plannerStatus: "validation_failed",
    maxCardsPerBatch: input.maxCardsPerBatch,
    batchResponseCharCount: input.batchResponseCharCount,
    batchDurationMs: input.batchDurationMs,
    plannerSessionId: input.plannerSessionId,
    finishReason: input.finishReason,
    stopReason: input.stopReason,
    outputTokenBudget: input.outputTokenBudget,
    modelBudgetProfile: input.modelBudgetProfile ? projectBoardModelBudgetProfileMetadata(input.modelBudgetProfile) : undefined,
    promptBudgetAssessment: input.promptBudgetAssessment ? projectBoardPromptBudgetAssessmentMetadata(input.promptBudgetAssessment) : undefined,
    usage: input.usage,
    recoverable: true,
    retryable: true,
    failureKind: "invalid_response",
    error: message,
    responsePreview: input.responsePreview,
    lastValidRecordId: input.lastValidRecord?.recordId,
    lastValidRecordType: input.lastValidRecord?.recordType,
    lastValidRecordIndex: input.lastValidRecord?.recordIndex,
    ...cardTitleQualityValidationMetadata(input.error),
    ...settledClarificationValidationMetadata(input.error),
    ...duplicateClarificationQuestionValidationMetadata(input.error),
  };
  return [
    validateProposalJsonlRecordArtifact({
      type: "progress",
      stage: "planner_batch_failed",
      title: `Failed planner batch ${input.batchNumber}`,
      summary: `Planner batch ${input.batchNumber} returned invalid progressive planning records and can be retried without discarding prior validated cards: ${message}`,
      createdAt,
      metadata,
    }),
    validateProposalJsonlRecordArtifact({
      type: "error",
      code: "planner_batch_invalid_response",
      message: `Ambient/Pi returned invalid progressive planning records for planner batch ${input.batchNumber}: ${message}`,
      recoverable: true,
      createdAt,
      metadata,
    }),
  ];
}

function plannerPauseProgressRecord(input: {
  phase: "section" | "planner_batch";
  sectionIndex?: number;
  sectionCount?: number;
  batchNumber?: number;
  batchCount?: number;
  recordCount: number;
  lastValidRecord?: PlannerLastValidRecord;
  plannerSessionId?: string;
  summary: string;
}): ProposalJsonlRecordArtifact {
  const index = input.phase === "section" ? input.sectionIndex : input.batchNumber;
  const count = input.phase === "section" ? input.sectionCount : input.batchCount;
  const label = input.phase === "section" ? "section" : "planner batch";
  return validateProposalJsonlRecordArtifact({
    type: "progress",
    stage: "planning_paused",
    title: `Paused after ${label}${index ? ` ${index}${count ? `/${count}` : ""}` : ""}`,
    summary: input.summary,
    createdAt: new Date().toISOString(),
    metadata: {
      pauseRequested: true,
      plannerStatus: "user_cancelled",
      recoverableOutputStop: input.phase === "planner_batch" && Boolean(input.lastValidRecord),
      finishReason: "user_cancelled",
      stopReason: "pause_requested",
      plannerSessionId: input.plannerSessionId,
      sectionIndex: input.sectionIndex,
      sectionCount: input.sectionCount,
      plannerBatchIndex: input.batchNumber,
      plannerBatchCount: input.batchCount,
      recordCount: input.recordCount,
      lastValidRecordId: input.lastValidRecord?.recordId,
      lastValidRecordType: input.lastValidRecord?.recordType,
      lastValidRecordIndex: input.lastValidRecord?.recordIndex,
    },
  });
}

function lastValidPlannerRecord(records: ProposalJsonlRecordArtifact[]): PlannerLastValidRecord | undefined {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || record.type === "progress") continue;
    const recordId = plannerRecordId(record);
    if (!recordId) continue;
    return { recordType: record.type, recordId, recordIndex: index };
  }
  return undefined;
}

function plannerRecordId(record: ProposalJsonlRecordArtifact): string | undefined {
  if (record.type === "candidate_card") return record.sourceId;
  if (record.type === "question") return record.questionId;
  if (record.type === "source_coverage") return record.sourceId;
  if (record.type === "dependency_edge") return `${record.fromCardId}->${record.toCardId}`;
  if (record.type === "warning") return record.code;
  if (record.type === "error") return record.code;
  if (record.type === "proposal_final") return "proposal_final";
  return undefined;
}

function isRecoverablePlannerOutputStop(finishReason: string | undefined): boolean {
  if (!finishReason) return false;
  const normalized = finishReason.toLowerCase().replace(/[\s-]+/g, "_");
  return (
    normalized === "length" ||
    normalized === "max_tokens" ||
    normalized === "max_output_tokens" ||
    normalized === "output_token_limit" ||
    normalized.includes("model_context_window_exceeded") ||
    (normalized.includes("context") && normalized.includes("exceed"))
  );
}

export function remainingPlannerCoverageSourceIds(sources: ProjectBoardSynthesisSource[], records: ProposalJsonlRecordArtifact[]): string[] {
  const sourceIds = sources
    .filter(projectBoardSourceIncludedInSynthesis)
    .map(plannerSourceId);
  // Last record wins, matching latestCoverageBySource: a source marked unresolved in
  // an early batch and covered in a later one is complete. Sticky-unresolved kept such
  // runs looping to maxBatches and reporting budget_exhausted for finished work.
  const statusBySource = new Map<string, "covered" | "unresolved">();
  for (const record of records) {
    if (record.type !== "source_coverage" || record.status === "ignored") continue;
    statusBySource.set(record.sourceId, record.status === "covered" ? "covered" : "unresolved");
  }
  return sourceIds.filter((sourceId) => statusBySource.get(sourceId) !== "covered");
}

function plannerSourceId(source: ProjectBoardSynthesisSource, index?: number): string {
  if (source.id?.trim()) return source.id.trim();
  return stableBoardArtifactId("source", [source.path, source.title, index]);
}

function plannerBatchOperation(input: {
  plannerWorkspace?: ProjectBoardPlannerWorkspace;
  refinement?: ProjectBoardSynthesisRefinementContext;
}): ProjectBoardPlanningOperation {
  if (input.plannerWorkspace?.operation === "source_elaboration") return "source_elaboration";
  return synthesisOperationFromRefinement(input.refinement);
}

function normalizePlannerBatchLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PROJECT_BOARD_PLANNER_BATCH_LIMIT;
  return Math.max(1, Math.min(24, Math.floor(value)));
}

function normalizePlannerBatchCardLimit(value: number | undefined, workspace?: ProjectBoardPlannerWorkspace): number {
  const configured = value ?? workspace?.batchPolicy.maxCandidateCardsPerBatch ?? DEFAULT_PROJECT_BOARD_SECTION_BATCH_CARD_LIMIT;
  return Math.max(1, Math.min(6, Math.floor(configured)));
}

export function parseProjectBoardSynthesisJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Ambient project-board synthesis returned an empty response.");
  let parseError: unknown;
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    parseError = error;
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch (fencedError) {
        parseError = fencedError;
      }
    }
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      } catch (sliceError) {
        parseError = sliceError;
      }
    }
    const detail = parseError instanceof Error && parseError.message ? ` Parser error: ${parseError.message.slice(0, 220)}` : "";
    throw new Error(`Ambient project-board synthesis did not return valid JSON.${detail} Response preview: ${projectBoardSynthesisInvalidJsonPreview(trimmed)}`);
  }
}

function projectBoardSynthesisInvalidJsonPreview(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const preview = normalized.slice(0, 500);
  const redacted = preview
    .replace(/\b(?:sk|gmi|ambient)_[A-Za-z0-9_-]{16,}\b/g, "[redacted-secret]")
    .replace(/\b[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, "[redacted-token]");
  return JSON.stringify(`${redacted}${normalized.length > preview.length ? "..." : ""}`);
}

function normalizeProjectBoardSynthesisResponse(
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

function extractProjectBoardProposalJsonlRecordsFromParsedValue(parsed: unknown) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const record = parsed as Record<string, unknown>;
  const source = Array.isArray(record.progressiveRecords) ? record.progressiveRecords : Array.isArray(record.records) ? record.records : [];
  return extractProjectBoardProposalJsonlRecordsFromText(source.map((item) => JSON.stringify(item)).join("\n"));
}

function normalizeSectionProgressiveRecords(responseText: string, section: ProjectBoardPlanningSection): ProposalJsonlRecordArtifact[] {
  const records = extractProjectBoardProposalJsonlRecordsFromText(responseText);
  if (records.length > 0) return dedupeProgressiveRecords(records);
  return [
    validateProposalJsonlRecordArtifact({
      type: "error",
      code: "section_no_records",
      message: `Ambient/Pi did not return any valid progressive planning records for ${section.sourcePath || section.sourceTitle} (${section.heading}).`,
      recoverable: true,
      createdAt: new Date().toISOString(),
      metadata: { sectionId: section.id, sourceId: section.sourceId, range: section.range },
    }),
    validateProposalJsonlRecordArtifact({
      type: "source_coverage",
      sourceId: section.sourceId,
      range: section.range,
      status: "unresolved",
      cardIds: [],
      note: "No valid candidate card records were returned for this section.",
      updatedAt: new Date().toISOString(),
    }),
  ];
}

function limitSectionCandidateCardRecords(
  records: ProposalJsonlRecordArtifact[],
  maxCardsPerSection: number,
  section: ProjectBoardPlanningSection,
): ProposalJsonlRecordArtifact[] {
  const kept: ProposalJsonlRecordArtifact[] = [];
  const keptCardIds = new Set<string>();
  const omittedCardIds: string[] = [];
  let candidateCount = 0;
  for (const record of records) {
    if (record.type !== "candidate_card") {
      kept.push(record);
      continue;
    }
    candidateCount += 1;
    if (candidateCount <= maxCardsPerSection) {
      kept.push(record);
      keptCardIds.add(record.sourceId);
    } else {
      omittedCardIds.push(record.sourceId);
    }
  }
  if (omittedCardIds.length === 0) return kept;
  const sanitized = kept.flatMap((record): ProposalJsonlRecordArtifact[] => {
    if (record.type === "source_coverage") {
      return [
        validateProposalJsonlRecordArtifact({
          ...record,
          cardIds: record.cardIds.filter((cardId) => keptCardIds.has(cardId)),
          status: record.status === "covered" && record.cardIds.some((cardId) => omittedCardIds.includes(cardId)) ? "partial" : record.status,
        }),
      ];
    }
    if (record.type === "dependency_edge" && (omittedCardIds.includes(record.fromCardId) || omittedCardIds.includes(record.toCardId))) {
      return [];
    }
    return [record];
  });
  return [
    ...sanitized,
    validateProposalJsonlRecordArtifact({
      type: "warning",
      code: "section_batch_card_limit",
      message: `Ambient/Pi returned ${candidateCount} candidate cards for ${section.sourcePath || section.sourceTitle} (${section.heading}); kept the first ${maxCardsPerSection} so cards can be persisted and dispatched incrementally.`,
      createdAt: new Date().toISOString(),
      metadata: {
        sectionId: section.id,
        sourceId: section.sourceId,
        omittedCardIds,
        candidateCount,
        maxCardsPerSection,
      },
    }),
  ];
}

function normalizeSectionBatchCardLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PROJECT_BOARD_SECTION_BATCH_CARD_LIMIT;
  return Math.max(1, Math.min(10, Math.floor(value)));
}

function projectBoardSynthesisReasoningPayload(reasoning: ProjectBoardSynthesisReasoning | undefined): Record<string, unknown> {
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

function projectBoardPiTextReasoning(reasoning: ProjectBoardSynthesisReasoning | undefined): ThinkingLevel | false | undefined {
  if (reasoning === undefined) return undefined;
  if (reasoning === false) return false;
  if (reasoning.enabled === false || reasoning.effort === "none") return false;
  if (reasoning.effort) return reasoning.effort;
  return undefined;
}

function retryableSectionResumeRecords(records: ProposalJsonlRecordArtifact[]): ProposalJsonlRecordArtifact[] {
  const deduped = dedupeProgressiveRecords(records);
  const retryableSections = retryableSectionKeysFromRecords(deduped);
  if (retryableSections.sectionIds.size === 0 && retryableSections.ranges.size === 0) return deduped;
  return deduped.filter((record) => !isRetryableSectionArtifact(record, retryableSections));
}

function completedSectionIdsFromRecords(records: ProposalJsonlRecordArtifact[]): Set<string> {
  const retryableSections = retryableSectionKeysFromRecords(records);
  const completed = new Set<string>();
  for (const record of records) {
    if (record.type !== "progress" || record.stage !== "section_succeeded") continue;
    const sectionId = record.metadata.sectionId;
    if (typeof sectionId === "string" && sectionId.trim() && !retryableSections.sectionIds.has(sectionId.trim())) completed.add(sectionId.trim());
  }
  return completed;
}

function retryableSectionKeysFromRecords(records: ProposalJsonlRecordArtifact[]): { sectionIds: Set<string>; ranges: Set<string> } {
  const sectionIds = new Set<string>();
  const ranges = new Set<string>();
  for (const record of records) {
    const sectionId = sectionIdForRecord(record);
    const rangeKey = sectionRangeKeyForRecord(record);
    const retryable =
      (record.type === "progress" && record.stage === "section_failed") ||
      (record.type === "error" && ["section_planning_failed", "section_no_records", PROJECT_BOARD_SECTION_SEMANTIC_IDLE_ERROR_CODE].includes(record.code));
    if (!retryable) continue;
    if (sectionId) sectionIds.add(sectionId);
    if (rangeKey) ranges.add(rangeKey);
  }
  return { sectionIds, ranges };
}

function isRetryableSectionArtifact(
  record: ProposalJsonlRecordArtifact,
  retryableSections: { sectionIds: Set<string>; ranges: Set<string> },
): boolean {
  const sectionId = sectionIdForRecord(record);
  if (sectionId && retryableSections.sectionIds.has(sectionId)) return true;
  const rangeKey = sectionRangeKeyForRecord(record);
  if (!rangeKey || !retryableSections.ranges.has(rangeKey)) return false;
  if (record.type === "source_coverage" && record.status === "unresolved") return true;
  if (record.type === "error" && ["section_planning_failed", "section_no_records", PROJECT_BOARD_SECTION_SEMANTIC_IDLE_ERROR_CODE].includes(record.code)) return true;
  return record.type === "progress" && ["section_failed", "section_succeeded"].includes(record.stage);
}

function sectionIdForRecord(record: ProposalJsonlRecordArtifact): string | undefined {
  const sectionId = "metadata" in record ? record.metadata?.sectionId : undefined;
  return typeof sectionId === "string" && sectionId.trim() ? sectionId.trim() : undefined;
}

function sectionRangeKeyForRecord(record: ProposalJsonlRecordArtifact): string | undefined {
  const sourceId =
    record.type === "source_coverage" || record.type === "dependency_edge"
      ? undefined
      : "metadata" in record && typeof record.metadata.sourceId === "string"
        ? record.metadata.sourceId
        : undefined;
  const sourceCoverageSourceId = record.type === "source_coverage" ? record.sourceId : sourceId;
  const range =
    record.type === "source_coverage"
      ? record.range
      : "metadata" in record && typeof record.metadata.range === "string"
        ? record.metadata.range
        : "metadata" in record && typeof record.metadata.sectionRange === "string"
          ? record.metadata.sectionRange
          : undefined;
  if (!sourceCoverageSourceId?.trim() || !range?.trim()) return undefined;
  return `${sourceCoverageSourceId.trim()}::${range.trim()}`;
}

function sectionStatusProgressRecord(
  section: ProjectBoardPlanningSection,
  input: {
    status: "succeeded" | "failed" | "skipped";
    sectionNumber: number;
    sectionCount: number;
    summary: string;
    statusLabel?: string;
    metadata?: Record<string, unknown>;
  },
): ProposalJsonlRecordArtifact {
  const label = input.statusLabel ?? (input.status === "succeeded" ? "Completed" : input.status === "failed" ? "Failed" : "Skipped");
  return validateProposalJsonlRecordArtifact({
    type: "progress",
    stage: `section_${input.status}`,
    title: `${label} section ${input.sectionNumber}/${input.sectionCount}`,
    summary: input.summary,
    createdAt: new Date().toISOString(),
    metadata: {
      ...(input.metadata ?? {}),
      sectionStatus: input.status,
      sectionId: section.id,
      sectionIndex: input.sectionNumber,
      sectionCount: input.sectionCount,
      sourceId: section.sourceId,
      sourcePath: section.sourcePath,
      sectionHeading: section.heading,
      sectionRange: section.range,
    },
  });
}

function sectionRetryProgressRecord(
  section: ProjectBoardPlanningSection,
  input: {
    status: "started" | "succeeded" | "exhausted";
    sectionNumber: number;
    sectionCount: number;
    retryAttempt: number;
    maxRetries: number;
    failureKind?: ProjectBoardSectionFailureKind;
    error?: string;
    sectionResponseCharCount?: number;
    sectionDurationMs?: number;
  },
): ProposalJsonlRecordArtifact {
  const statusText = input.status === "started" ? "Started" : input.status === "succeeded" ? "Recovered" : "Exhausted";
  const stage = `section_retry_${input.status}`;
  const summary =
    input.status === "started"
      ? `Retry ${input.retryAttempt}/${input.maxRetries} started for ${section.heading} before the active run moved to another section.`
      : input.status === "succeeded"
        ? `Retry ${input.retryAttempt}/${input.maxRetries} recovered ${section.heading}.`
        : `Retry budget exhausted for ${section.heading}; manual recovery is now required.`;
  return validateProposalJsonlRecordArtifact({
    type: "progress",
    stage,
    title: `${statusText} section retry ${input.retryAttempt}/${input.maxRetries}`,
    summary,
    createdAt: new Date().toISOString(),
    metadata: {
      sectionStatus: input.status === "succeeded" ? "succeeded" : "failed",
      retryStatus: input.status,
      retryAttempt: input.retryAttempt,
      maxRetries: input.maxRetries,
      retriesExhausted: input.status === "exhausted",
      failureKind: input.failureKind,
      error: input.error,
      sectionResponseCharCount: input.sectionResponseCharCount,
      sectionDurationMs: input.sectionDurationMs,
      sectionId: section.id,
      sectionIndex: input.sectionNumber,
      sectionCount: input.sectionCount,
      sourceId: section.sourceId,
      sourcePath: section.sourcePath,
      sectionHeading: section.heading,
      sectionRange: section.range,
    },
  });
}

function sectionFailureRecords(
  section: ProjectBoardPlanningSection,
  input: {
    sectionNumber: number;
    sectionCount: number;
    error: unknown;
    sectionResponseCharCount: number;
    sectionDurationMs: number;
    failureKind?: ProjectBoardSectionFailureKind;
    completedSectionCount?: number;
    candidateCardCount?: number;
    questionCount?: number;
  },
): ProposalJsonlRecordArtifact[] {
  const message = errorMessage(input.error);
  const createdAt = new Date().toISOString();
  const failureKind = input.failureKind ?? projectBoardSectionFailureKind(input.error);
  const semanticIdle = failureKind === "semantic_idle_timeout";
  const noRecords = failureKind === "no_records";
  const completedSectionCount = Math.max(0, Math.floor(input.completedSectionCount ?? 0));
  const candidateCardCount = Math.max(0, Math.floor(input.candidateCardCount ?? 0));
  const questionCount = Math.max(0, Math.floor(input.questionCount ?? 0));
  return [
    sectionStatusProgressRecord(section, {
      status: "failed",
      sectionNumber: input.sectionNumber,
      sectionCount: input.sectionCount,
      statusLabel: semanticIdle ? "Stalled" : noRecords ? "No records" : undefined,
      summary: semanticIdle
        ? `Section planning stalled without model content or planner records and can be retried from the last completed section: ${message}`
        : noRecords
          ? `Section planning returned no valid records after inline retry budget was exhausted: ${message}`
        : `Section planning failed and can be retried without discarding earlier section records: ${message}`,
      metadata: {
        recoverable: true,
        retryable: true,
        failureKind,
        error: message,
        sectionResponseCharCount: input.sectionResponseCharCount,
        sectionDurationMs: input.sectionDurationMs,
        completedSectionCount,
        candidateCardCount,
        questionCount,
        semanticIdleTimeoutMs: semanticIdleTimeoutMsFromMessage(message),
        ...settledClarificationValidationMetadata(input.error),
        ...duplicateClarificationQuestionValidationMetadata(input.error),
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "error",
      code: semanticIdle ? PROJECT_BOARD_SECTION_SEMANTIC_IDLE_ERROR_CODE : noRecords ? "section_no_records" : "section_planning_failed",
      message: semanticIdle
        ? `Ambient/Pi planning stalled for ${section.sourcePath || section.sourceTitle} (${section.heading}) because no model content or planner records arrived: ${message}`
        : noRecords
          ? `Ambient/Pi planning returned no valid records for ${section.sourcePath || section.sourceTitle} (${section.heading}) after inline retry: ${message}`
        : `Ambient/Pi planning failed for ${section.sourcePath || section.sourceTitle} (${section.heading}): ${message}`,
      recoverable: true,
      createdAt,
      metadata: {
        sectionId: section.id,
        sourceId: section.sourceId,
        range: section.range,
        sectionIndex: input.sectionNumber,
        sectionCount: input.sectionCount,
        failureKind,
        retryable: true,
        completedSectionCount,
        candidateCardCount,
        questionCount,
        semanticIdleTimeoutMs: semanticIdleTimeoutMsFromMessage(message),
        ...settledClarificationValidationMetadata(input.error),
        ...duplicateClarificationQuestionValidationMetadata(input.error),
      },
    }),
    validateProposalJsonlRecordArtifact({
      type: "source_coverage",
      sourceId: section.sourceId,
      range: section.range,
      status: "unresolved",
      cardIds: [],
      note: semanticIdle
        ? `Section planning stalled before source coverage could be resolved; retry this section to ask Pi for this source slice again. ${message}`
        : noRecords
          ? `Section planning returned no valid records after inline retry; retry this section manually or defer it. ${message}`
        : `Section planning failed before source coverage could be resolved: ${message}`,
      updatedAt: createdAt,
    }),
  ];
}

type ProjectBoardSectionFailureKind = "semantic_idle_timeout" | "stream_idle_timeout" | "no_records" | "request_or_validation_error";

function projectBoardSectionFailureKind(error: unknown): ProjectBoardSectionFailureKind {
  if (error instanceof ProjectBoardSectionNoRecordsError) return "no_records";
  const message = errorMessage(error).toLowerCase();
  if (message.includes("without model content") || message.includes("without planner records")) return "semantic_idle_timeout";
  if (message.includes("without streaming events") || message.includes("stalled before streaming began")) return "stream_idle_timeout";
  if (message.includes("no valid planning records")) return "no_records";
  return "request_or_validation_error";
}

function shouldRetryProjectBoardSectionFailure(error: unknown, input: { signal?: AbortSignal }): boolean {
  if (input.signal?.aborted) return false;
  if (error instanceof AmbientStreamFailureError && !isRetryableAmbientProviderError(error)) return false;
  const failureKind = projectBoardSectionFailureKind(error);
  return (
    failureKind === "no_records" ||
    failureKind === "semantic_idle_timeout" ||
    failureKind === "stream_idle_timeout" ||
    failureKind === "request_or_validation_error"
  );
}

function semanticIdleTimeoutMsFromMessage(message: string): number | undefined {
  const match = message.match(/after\s+([\d,]+)ms\s+without model content/i);
  if (!match?.[1]) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dedupeProgressiveRecords(records: ProposalJsonlRecordArtifact[]): ProposalJsonlRecordArtifact[] {
  const seen = new Set<string>();
  const result: ProposalJsonlRecordArtifact[] = [];
  for (const record of records) {
    const key = JSON.stringify(record);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(record);
  }
  return result;
}

function recordsNotAlreadySeen(
  records: ProposalJsonlRecordArtifact[],
  existing: ProposalJsonlRecordArtifact[],
): ProposalJsonlRecordArtifact[] {
  const existingKeys = new Set(existing.map((record) => JSON.stringify(record)));
  return records.filter((record) => !existingKeys.has(JSON.stringify(record)));
}

function wholeBoardPlanningSection(sources: ProjectBoardSynthesisSource[], projectName?: string): ProjectBoardPlanningSection {
  const included = sources.filter(projectBoardSourceIncludedInSynthesis);
  return {
    id: stableBoardArtifactId("section", ["whole-board", projectName, included.map((source) => source.id || source.path || source.title).join("|")]),
    sourceId: "workspace:all-sources",
    sourceKind: "implementation_plan",
    sourceTitle: projectName ? `${projectName} project corpus` : "Project corpus",
    sourceSummary: `${included.length} included source${included.length === 1 ? "" : "s"} prepared for whole-board synthesis.`,
    heading: "Whole board",
    range: "all",
    content: "",
    charCount: included.reduce((sum, source) => sum + [source.title, source.summary, source.excerpt, source.path].join("\n").length, 0),
    sourceIndex: 0,
    sectionIndex: 0,
    sourceSectionIndex: 0,
    sourceSectionCount: 1,
  };
}

function lastCandidateTitle(records: ProposalJsonlRecordArtifact[]): string | undefined {
  return records.filter((record) => record.type === "candidate_card").at(-1)?.title;
}

function lastQuestion(records: ProposalJsonlRecordArtifact[]): string | undefined {
  return records.filter((record) => record.type === "question").at(-1)?.question;
}

async function deriveProjectBoardScopeContractWithPi(input: {
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
  onProgress?: (progress: AmbientProjectBoardSynthesisProgress) => void;
}): Promise<ProjectBoardScopeContract> {
  const deterministicScopeContract = projectBoardScopeContractFromTexts(projectBoardScopeContractTexts({ sources: input.sources, refinement: input.refinement }));
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
      ...projectBoardPromptBudgetRunMetadata({
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
      reasoning: projectBoardPiTextReasoning(false),
      responseFormat: { type: "json_object" },
      retryPolicy: input.retryPolicy,
      idleTimeoutMs: normalizeAmbientStreamIdleTimeoutMs(input.streamIdleTimeoutMs),
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
      summary: "Ambient/Pi returned an invalid scope contract response, so planning continued with deterministic scope extracted from sources.",
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

function buildProjectBoardScopeContractPrompt(input: {
  projectName?: string;
  sources: ProjectBoardSynthesisSource[];
  refinement?: ProjectBoardSynthesisRefinementContext;
}): string {
  const sourceBlocks = input.sources
    .filter((source) => projectBoardSourceIncludedInSynthesis(source) && Boolean(source.title.trim() || source.summary.trim() || source.excerpt?.trim()))
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
  const answers = input.refinement?.answers.map((answer, index) => `${index + 1}. Q: ${answer.question}\nA: ${answer.answer}`).join("\n\n") ?? "";
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
        included: ["auth|accounts|analytics|sync|collaboration|notifications|backend|payments|deployment|admin_reporting only when explicitly included"],
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

function normalizeProjectBoardLlmScopeContract(value: unknown): ProjectBoardScopeContract {
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

const LLM_SCOPE_FEATURES = new Set<ProjectBoardScopeFeature>([
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

function normalizeLlmScopeFeatures(value: unknown): ProjectBoardScopeFeature[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ProjectBoardScopeFeature>();
  for (const item of value) {
    if (typeof item === "string" && LLM_SCOPE_FEATURES.has(item as ProjectBoardScopeFeature)) seen.add(item as ProjectBoardScopeFeature);
  }
  return [...seen];
}

function normalizeLlmScopeStrings(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, maxLength))
    .slice(0, limit);
}

function normalizeLlmPlanningDepth(value: unknown): ProjectBoardPlanningDepthAssessment | undefined {
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

function isProjectBoardPlanningDepthLevel(value: string): value is ProjectBoardPlanningDepthLevel {
  return value === "shallow" || value === "standard" || value === "deep" || value === "phased";
}

interface AdditiveDuplicateDiagnostic {
  sourceId: string;
  title: string;
  matchedSourceId?: string;
  matchedTitle?: string;
  reason: "source_id" | "title" | "intent_source_basis";
  score?: number;
  sourceBasisOverlap?: string[];
}

interface CandidateCardFilterDiagnostic {
  sourceId: string;
  title: string;
}

interface CandidateCardFilterResult {
  draft: ProjectBoardSynthesisDraft;
  diagnostics: CandidateCardFilterDiagnostic[];
  warningRecords: ProposalJsonlRecordArtifact[];
}

interface ProjectBoardWorkflowDraftLimitResult {
  draft: ProjectBoardSynthesisDraft;
  omittedCardIds: string[];
  warningRecords: ProposalJsonlRecordArtifact[];
}

function filterAdditiveDuplicateCards(
  draft: ProjectBoardSynthesisDraft,
  refinement?: ProjectBoardSynthesisRefinementContext,
): CandidateCardFilterResult {
  if (!refinement || !isAdditiveRefinement(refinement)) return { draft, diagnostics: [], warningRecords: [] };
  const cards: ProjectBoardSynthesisDraft["cards"] = [];
  const diagnostics: AdditiveDuplicateDiagnostic[] = [];
  const acceptedCards = [...refinement.previousDraft.cards];

  for (const card of draft.cards) {
    const match = additiveDuplicateMatch(card, acceptedCards);
    if (match) {
      diagnostics.push(match);
      continue;
    }
    cards.push(card);
    acceptedCards.push(card);
  }

  if (diagnostics.length === 0) return { draft, diagnostics: [], warningRecords: [] };
  const duplicateSummary = `Filtered ${diagnostics.length} duplicate candidate${diagnostics.length === 1 ? "" : "s"} already present in the board or this Add Cards pass.`;
  const filteredSummary = cards.length === 0 ? `${duplicateSummary} No net-new cards remain for this Add Cards pass.` : duplicateSummary;
  const filteredDraft = {
    ...draft,
    cards,
    sourceNotes: [...draft.sourceNotes, filteredSummary],
  };
  return {
    draft: filteredDraft,
    diagnostics,
    warningRecords: additiveDuplicateWarningRecords(diagnostics, filteredSummary),
  };
}

function limitProjectBoardWorkflowDraft(
  draft: ProjectBoardSynthesisDraft,
  limits: ProjectBoardWorkflowScopeLimits,
  surface: string,
): ProjectBoardWorkflowDraftLimitResult {
  if (!limits.compact || !Number.isFinite(limits.maxTotalCards) || draft.cards.length <= limits.maxTotalCards) {
    return { draft, omittedCardIds: [], warningRecords: [] };
  }
  const maxTotalCards = Math.max(1, Math.floor(limits.maxTotalCards));
  const keptCards = draft.cards.slice(0, maxTotalCards);
  const omittedCards = draft.cards.slice(maxTotalCards);
  const omittedCardIds = omittedCards.map((card) => card.sourceId);
  const message = `Kept ${keptCards.length} candidate card${keptCards.length === 1 ? "" : "s"} because the extracted scope is shallow; ${omittedCards.length} extra candidate card${omittedCards.length === 1 ? "" : "s"} were dropped from the compact board workflow.`;
  return {
    draft: {
      ...draft,
      cards: keptCards,
      sourceNotes: [...draft.sourceNotes, message],
    },
    omittedCardIds,
    warningRecords: [
      validateProposalJsonlRecordArtifact({
        type: "warning",
        code: "scope_contract_compact_board_card_limit",
        message,
        createdAt: new Date().toISOString(),
        metadata: {
          surface,
          maxTotalCards,
          omittedCardIds,
          compactReason: limits.reason,
        },
      }),
    ],
  };
}

function removeOmittedCandidateRecords(
  records: ProposalJsonlRecordArtifact[],
  omittedCardIds: string[],
): ProposalJsonlRecordArtifact[] {
  if (omittedCardIds.length === 0) return records;
  const omitted = new Set(omittedCardIds);
  return records.flatMap((record): ProposalJsonlRecordArtifact[] => {
    if (record.type === "candidate_card" && omitted.has(record.sourceId)) return [];
    if (record.type === "question" && record.cardId && omitted.has(record.cardId)) return [];
    if (record.type === "dependency_edge" && (omitted.has(record.fromCardId) || omitted.has(record.toCardId))) return [];
    if (record.type === "source_coverage") {
      const cardIds = record.cardIds.filter((cardId) => !omitted.has(cardId));
      if (record.cardIds.length > 0 && cardIds.length === 0) return [];
      if (cardIds.length === record.cardIds.length) return [record];
      return [
        validateProposalJsonlRecordArtifact({
          ...record,
          cardIds,
          status: record.status === "covered" ? "partial" : record.status,
        }),
      ];
    }
    return [record];
  });
}


// Shared final-assembly stage for all three planning pipelines (legacy whole-board,
// sectioned, planner-batch). Filter -> scope-limit -> record retention -> durable
// append used to be copy-pasted per pipeline, and the copies drifted (pause support,
// coverage semantics, poll-queue handling were all divergence bugs).
async function finalizeProjectBoardSynthesisDraft(input: {
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

export function filterScopeContractCards(
  draft: ProjectBoardSynthesisDraft,
  input: {
    sources: ProjectBoardSynthesisSource[];
    refinement?: ProjectBoardSynthesisRefinementContext;
    pmReviewReport?: ProjectBoardPmReviewReport;
    scopeContract?: ProjectBoardScopeContract;
  },
): CandidateCardFilterResult {
  const scopeContract = input.scopeContract ?? projectBoardScopeContractFromTexts(projectBoardScopeContractTexts(input));
  const hasCapabilityContract = Boolean(
    scopeContract.requiredCapabilities?.length ||
      scopeContract.supportingCapabilities?.length ||
      scopeContract.optionalCapabilities?.length ||
      scopeContract.excludedCapabilities?.length,
  );
  const cards: ProjectBoardSynthesisDraft["cards"] = [];
  const diagnostics: CandidateCardFilterDiagnostic[] = [];
  const defaultedCards: CandidateCardFilterDiagnostic[] = [];
  for (const card of draft.cards) {
    const scopeLabels = card.labels.map((label) => label.trim().toLowerCase()).filter((label) => label.startsWith("scope:"));
    if (scopeLabels.includes("scope:optional") || scopeLabels.includes("scope:excluded")) {
      diagnostics.push({ sourceId: card.sourceId, title: card.title });
      continue;
    }
    // A missing scope: label is a model formatting drift, not a scope violation.
    // Failing here would throw away a fully assembled run after every section was
    // paid for, so default the card to scope:supporting and surface a warning.
    if (scopeLabels.length === 0 && hasCapabilityContract) {
      defaultedCards.push({ sourceId: card.sourceId, title: card.title });
      cards.push({ ...card, labels: [...card.labels, "scope:supporting"] });
      continue;
    }
    cards.push(card);
  }
  if (diagnostics.length === 0 && defaultedCards.length === 0) return { draft, diagnostics: [], warningRecords: [] };
  if (cards.length === 0) {
    throw new Error(
      `Ambient project-board synthesis returned only cards outside explicit scope constraints. Filtered ${diagnostics.length} scope-expanding candidate${diagnostics.length === 1 ? "" : "s"}.`,
    );
  }
  const warningRecords: ProposalJsonlRecordArtifact[] = [];
  const sourceNotes = [...draft.sourceNotes];
  if (diagnostics.length > 0) {
    const message = `Filtered ${diagnostics.length} candidate${diagnostics.length === 1 ? "" : "s"} that expanded beyond explicit scope constraints; extra features should be offered as optional next steps.`;
    sourceNotes.push(message);
    warningRecords.push(
      validateProposalJsonlRecordArtifact({
        type: "warning",
        code: "scope_contract_candidate_filtered",
        message,
        createdAt: new Date().toISOString(),
        metadata: {
          filteredCount: diagnostics.length,
          filteredCandidates: diagnostics.slice(0, 20),
          exclusions: scopeContract.excluded,
          requiredCapabilities: scopeContract.requiredCapabilities ?? [],
          supportingCapabilities: scopeContract.supportingCapabilities ?? [],
          optionalCapabilities: scopeContract.optionalCapabilities ?? [],
        },
      }),
    );
  }
  if (defaultedCards.length > 0) {
    warningRecords.push(
      validateProposalJsonlRecordArtifact({
        type: "warning",
        code: "scope_contract_unlabeled_candidate_defaulted",
        message: `Defaulted ${defaultedCards.length} candidate${defaultedCards.length === 1 ? "" : "s"} without a scope: label to scope:supporting instead of failing the run.`,
        createdAt: new Date().toISOString(),
        metadata: {
          defaultedCount: defaultedCards.length,
          defaultedCandidates: defaultedCards.slice(0, 20),
        },
      }),
    );
  }
  return {
    draft: {
      ...draft,
      cards,
      sourceNotes,
    },
    diagnostics,
    warningRecords,
  };
}

function filterProjectBoardGeneratedCards(
  draft: ProjectBoardSynthesisDraft,
  input: {
    sources: ProjectBoardSynthesisSource[];
    refinement?: ProjectBoardSynthesisRefinementContext;
    pmReviewReport?: ProjectBoardPmReviewReport;
    scopeContract?: ProjectBoardScopeContract;
  },
): CandidateCardFilterResult {
  const duplicateFiltered = filterAdditiveDuplicateCards(draft, input.refinement);
  const scopeFiltered = filterScopeContractCards(duplicateFiltered.draft, input);
  return {
    draft: scopeFiltered.draft,
    diagnostics: [...duplicateFiltered.diagnostics, ...scopeFiltered.diagnostics],
    warningRecords: [...duplicateFiltered.warningRecords, ...scopeFiltered.warningRecords],
  };
}

function scopeContractFilterCountFromRecords(records: ProposalJsonlRecordArtifact[]): number {
  return records.filter(
    (record) => record.type === "warning" && (record.code === "scope_contract_candidate_filtered" || record.code === "scope_contract_compact_board_card_limit"),
  ).length;
}

function additiveDuplicateWarningRecords(diagnostics: AdditiveDuplicateDiagnostic[], message: string): ProposalJsonlRecordArtifact[] {
  if (diagnostics.length === 0) return [];
  return [
    validateProposalJsonlRecordArtifact({
      type: "warning",
      code: "add_cards_duplicate_candidate_filtered",
      message,
      createdAt: new Date().toISOString(),
      metadata: {
        duplicateCount: diagnostics.length,
        duplicateCandidates: diagnostics.slice(0, 20),
      },
    }),
  ];
}

function removeFilteredDuplicateCandidateRecords(
  records: ProposalJsonlRecordArtifact[],
  diagnostics: CandidateCardFilterDiagnostic[],
): ProposalJsonlRecordArtifact[] {
  if (diagnostics.length === 0) return records;
  const duplicateSourceIds = new Set(diagnostics.map((diagnostic) => normalizeExactText(diagnostic.sourceId)).filter(Boolean));
  const duplicateTitles = new Set(diagnostics.map((diagnostic) => normalizeExactText(diagnostic.title)).filter(Boolean));
  const droppedSourceIds = new Set<string>();
  const retainedRecords = records.filter((record) => {
    if (record.type !== "candidate_card") return true;
    const sourceId = normalizeExactText(record.sourceId);
    const title = normalizeExactText(record.title);
    if (sourceId && duplicateSourceIds.has(sourceId)) {
      droppedSourceIds.add(sourceId);
      return false;
    }
    if (title && duplicateTitles.has(title)) {
      droppedSourceIds.add(sourceId);
      return false;
    }
    return true;
  });
  return retainedRecords.flatMap((record): ProposalJsonlRecordArtifact[] => {
    if (record.type === "dependency_edge") {
      return !droppedSourceIds.has(normalizeExactText(record.fromCardId)) && !droppedSourceIds.has(normalizeExactText(record.toCardId))
        ? [record]
        : [];
    }
    if (record.type === "source_coverage") {
      const cardIds = record.cardIds.filter((cardId) => !droppedSourceIds.has(normalizeExactText(cardId)));
      if (cardIds.length === 0) return [];
      if (cardIds.length === record.cardIds.length) return [record];
      return [
        validateProposalJsonlRecordArtifact({
          ...record,
          cardIds,
          status: record.status === "covered" ? "partial" : record.status,
        }),
      ];
    }
    return [record];
  });
}

function additiveDuplicateMatch(
  card: ProjectBoardSynthesisDraft["cards"][number],
  existingCards: ProjectBoardSynthesisDraft["cards"],
): AdditiveDuplicateDiagnostic | undefined {
  const sourceId = normalizeExactText(card.sourceId);
  const title = normalizeExactText(card.title);
  const sourceBasis = sourceBasisTokens(card);
  const titleTokens = intentTokens(card.title);
  const intent = intentTokens(intentTextForCard(card));

  for (const existing of existingCards) {
    const existingSourceId = normalizeExactText(existing.sourceId);
    const existingTitle = normalizeExactText(existing.title);
    if (sourceId && sourceId === existingSourceId) {
      return duplicateDiagnostic(card, existing, "source_id");
    }
    if (title && title === existingTitle) {
      return duplicateDiagnostic(card, existing, "title");
    }

    const sourceOverlap = intersection(sourceBasis, sourceBasisTokens(existing));
    if (sourceOverlap.size === 0) continue;
    const titleScore = overlapScore(titleTokens, intentTokens(existing.title));
    const titleOverlap = intersection(titleTokens, intentTokens(existing.title)).size;
    const intentScore = overlapScore(intent, intentTokens(intentTextForCard(existing)));
    const intentOverlap = intersection(intent, intentTokens(intentTextForCard(existing))).size;
    if (
      (titleOverlap >= 3 && titleScore >= 0.58) ||
      (titleOverlap >= 3 && containmentScore(titleTokens, intentTokens(existing.title)) >= 0.75) ||
      (intentOverlap >= 5 && intentScore >= 0.68)
    ) {
      return duplicateDiagnostic(card, existing, "intent_source_basis", Math.max(titleScore, intentScore), [...sourceOverlap]);
    }
  }
  return undefined;
}

function duplicateDiagnostic(
  card: ProjectBoardSynthesisDraft["cards"][number],
  matchedCard: ProjectBoardSynthesisDraft["cards"][number],
  reason: AdditiveDuplicateDiagnostic["reason"],
  score?: number,
  sourceBasisOverlap?: string[],
): AdditiveDuplicateDiagnostic {
  return {
    sourceId: card.sourceId,
    title: card.title,
    matchedSourceId: matchedCard.sourceId,
    matchedTitle: matchedCard.title,
    reason,
    ...(score === undefined ? {} : { score: Number(score.toFixed(3)) }),
    ...(sourceBasisOverlap?.length ? { sourceBasisOverlap } : {}),
  };
}

const INTENT_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "be",
  "by",
  "card",
  "cards",
  "create",
  "build",
  "add",
  "implement",
  "make",
  "setup",
  "set",
  "up",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "proof",
  "test",
  "tests",
  "the",
  "this",
  "to",
  "with",
]);

function normalizeExactText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function sourceBasisTokens(card: ProjectBoardSynthesisDraft["cards"][number]): Set<string> {
  return tokenSet([card.sourceId, card.sourceRefs.join(" "), card.phase ?? "", card.labels.join(" ")].join(" "));
}

function intentTextForCard(card: ProjectBoardSynthesisDraft["cards"][number]): string {
  return [
    card.title,
    card.phase ?? "",
    card.labels.join(" "),
    card.description.slice(0, 800),
    card.acceptanceCriteria.slice(0, 4).join(" "),
  ].join(" ");
}

function intentTokens(value: string): Set<string> {
  return tokenSet(value, INTENT_STOP_WORDS);
}

function tokenSet(value: string, stopWords: Set<string> = new Set()): Set<string> {
  const tokens = new Set<string>();
  for (const rawToken of value.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const token = stemIntentToken(rawToken);
    if (token.length <= 2 || stopWords.has(token)) continue;
    tokens.add(token);
  }
  return tokens;
}

function stemIntentToken(token: string): string {
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const overlap = intersection(a, b).size;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : overlap / union;
}

function containmentScore(a: Set<string>, b: Set<string>): number {
  const denominator = Math.min(a.size, b.size);
  if (denominator === 0) return 0;
  return intersection(a, b).size / denominator;
}

function intersection(a: Set<string>, b: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const value of a) if (b.has(value)) result.add(value);
  return result;
}

function synthesisOperationFromRefinement(refinement?: ProjectBoardSynthesisRefinementContext): ProjectBoardPlanningOperation {
  return refinement && isAdditiveRefinement(refinement) ? "source_elaboration" : "board_synthesis";
}

function pmReviewActivationTelemetryMetadata(report?: ProjectBoardPmReviewReport): Record<string, unknown> {
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

function projectBoardPromptBudgetRunMetadata(input: {
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

function projectBoardEstimatedInputTokensFromPromptChars(charCount: number): number {
  return Math.max(1, Math.ceil(Math.max(0, charCount) / 4));
}

function inferPlanningProfileName(sources: ProjectBoardSynthesisSource[]): ProjectBoardPlanningProfileName | undefined {
  const includedSources = sources.filter(projectBoardSourceIncludedInSynthesis);
  const text = includedSources
    .map((source) => `${source.kind}\n${source.title}\n${source.summary}\n${source.excerpt ?? ""}\n${source.path ?? ""}`)
    .join("\n")
    .toLowerCase();
  if (/\b(game|gameplay|webgl|three\.js|pixijs|matter\.js|howler|canvas|player|enemy|combat|hud|boss|mission)\b/.test(text)) {
    return "gameplay-design";
  }
  if (/\b(refactor|migration|cleanup|debt|maintenance)\b/.test(text)) return "maintenance-refactor";
  if (/\b(security|reliability|quality|regression|test plan|proof|audit)\b/.test(text)) return "quality-gate";
  return undefined;
}

function isAdditiveRefinement(refinement: ProjectBoardSynthesisRefinementContext): boolean {
  return isAdditiveProjectBoardRefinement(refinement);
}

async function readAmbientChatCompletionResult(
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

function ambientChatCompletionPayloadMetadata(payload: unknown): { finishReason?: string; usage?: unknown } {
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function projectBoardSynthesisTransientAttemptCount(): number {
  const configured = Number(process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS || 3);
  if (!Number.isFinite(configured)) return 3;
  return Math.max(1, Math.min(5, Math.floor(configured)));
}

function projectBoardSynthesisTransientRetryDelayMs(attempt: number): number {
  const baseDelayMs = Number(process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_RETRY_DELAY_MS || 5_000);
  const normalizedBaseDelayMs = Number.isFinite(baseDelayMs) ? Math.max(0, Math.floor(baseDelayMs)) : 5_000;
  return normalizedBaseDelayMs * attempt;
}

function shouldRetryProjectBoardSynthesisTransient(
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

function isTransientProjectBoardSynthesisError(error: unknown): boolean {
  const message = errorMessage(error);
  return /\b(?:408|409|425|429|500|502|503|504)\b|rate limit|temporar|try again|timeout|timed out|upstream|econnreset|socket hang up/i.test(
    message,
  );
}

function delayProjectBoardSynthesisRetry(ms: number, signal?: AbortSignal): Promise<void> {
  const delayMs = Math.max(0, Math.floor(ms));
  if (delayMs === 0) {
    if (signal?.aborted) return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error("Project-board synthesis retry canceled."));
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (timeout) clearTimeout(timeout);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("Project-board synthesis retry canceled."));
    };
    timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchAmbientProjectBoardSynthesisResponse(
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
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const abortWithSignal = () => {
    const reason = signal?.reason;
    controller.abort(reason instanceof Error ? reason : new Error("Ambient project-board synthesis request canceled."));
  };
  try {
    if (signal?.aborted) abortWithSignal();
    else signal?.addEventListener("abort", abortWithSignal, { once: true });
    const request = fetchImpl(url, { ...init, signal: controller.signal });
    return await Promise.race([
      request,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort(timeoutError);
          reject(timeoutError);
        }, streamIdleTimeoutMs);
      }),
    ]);
  } catch (error) {
    if (error === timeoutError || controller.signal.reason === timeoutError) throw timeoutError;
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    signal?.removeEventListener("abort", abortWithSignal);
  }
}

function normalizeAmbientStreamIdleTimeoutMs(value: number | undefined): number {
  return Math.max(1, Math.floor(value ?? DEFAULT_PROJECT_BOARD_AMBIENT_STREAM_IDLE_TIMEOUT_MS));
}

function normalizeProjectBoardSynthesisMaxToolRounds(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 3;
  return Math.max(0, Math.min(8, Math.floor(value)));
}

function projectBoardWorkspacePollIntervalMs(streamIdleTimeoutMs: number | undefined): number {
  const idleTimeoutMs = normalizeAmbientStreamIdleTimeoutMs(streamIdleTimeoutMs);
  return Math.max(25, Math.min(5_000, Math.floor(idleTimeoutMs / 3)));
}
