import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type { ProjectBoardCharterProjectSummary } from "../../shared/projectBoardTypes";
import { readAmbientApiKey } from "./projectBoardSecurityFacade";
import { normalizeAmbientBaseUrl } from "./projectBoardProviderFacade";
import {
  projectBoardModelBudgetProfile,
  projectBoardModelBudgetProfileMetadata,
  projectBoardPromptBudgetAssessment,
  projectBoardPromptBudgetAssessmentMetadata,
  ProjectBoardPromptBudgetAssessment,
} from "./projectBoardModelBudgetProfile";
import { stableBoardArtifactId, validateProposalJsonlRecordArtifact, ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import {
  extractProjectBoardProposalJsonlRecordsFromText,
  projectBoardSynthesisDraftFromProgressiveRecords,
  projectBoardProgressiveRecordsFromDraft,
} from "./projectBoardProgressivePlanning";
import {
  projectBoardPlanningSectionPlanFromSources,
  ProjectBoardPlanningSection,
  ProjectBoardPlanningSectionOptions,
} from "./projectBoardSectionedPlanning";
import {
  appendProjectBoardPlannerWorkspaceRecords,
  createProjectBoardPlannerWorkspaceTailState,
  markProjectBoardPlannerWorkspaceTailRecords,
  pollProjectBoardPlannerWorkspaceRecords,
  projectBoardPlannerWorkspacePromptBlock,
  ProjectBoardPlannerWorkspace,
} from "./projectBoardPlannerWorkspace";
import {
  projectBoardPlannerToolProgressToRecord,
  projectBoardPlannerWorkspaceToolExecutor,
  projectBoardPlannerWorkspaceToolPromptBlock,
  ProjectBoardPlannerSourceQaAnswerer,
} from "./projectBoardPlannerWorkspaceTools";
import type { ProjectBoardPlannerBatchContinuation } from "./projectBoardPlannerContinuation";
import {
  buildProjectBoardPlanningContract,
  projectBoardPlanningDepthFromScopeContract,
  projectBoardScopeContractFromTexts,
} from "./projectBoardPlanningContract";
import { projectBoardProofScopeWarningRecords } from "./projectBoardProofScope";
import {
  buildProjectBoardPmReviewReportPrompt,
  buildProjectBoardSynthesisPrompt,
  normalizeProjectBoardPmReviewReport,
  projectBoardScopeContractTexts,
  projectBoardSynthesisDraftFromPmReviewReport,
  synthesizeProjectBoardDraft,
  ProjectBoardPmReviewGitContext,
  ProjectBoardSynthesisDraft,
  ProjectBoardSynthesisRefinementContext,
  ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";
import { retryDelayForAttempt, AmbientRetryPolicy } from "./projectBoardAmbientFacade";
import { callWorkflowPiText, WorkflowPiCompletionMetadata, WorkflowPiProgress } from "./projectBoardWorkflowFacade";
import {
  PROJECT_BOARD_PLANNER_LEDGER_COMPACTION_SYSTEM_PROMPT,
  PROJECT_BOARD_PLANNER_SOURCE_QA_SYSTEM_PROMPT,
  buildPlannerLedgerCompactionPrompt,
  buildPlannerSourceQaPrompt,
  buildProjectBoardPlannerBatchPrompt,
  buildProjectBoardSectionedPlanningPrompt,
  buildSectionedContextCompactionPrompt,
  deterministicPlannerLedgerCompaction,
  errorMessage,
  inferPlanningProfileName,
  normalizePlannerBatchCardLimit,
  normalizePlannerBatchLimit,
  normalizePlannerLedgerCompactionText,
  normalizeSectionBatchCardLimit,
  parsePlannerSourceQaAnswerText,
  parseProjectBoardSynthesisJson,
  plannerLedgerCompactionCacheKey,
  projectBoardSectionedContextCompactionDecision,
  readCachedPlannerLedgerCompaction,
  remainingPlannerCoverageSourceIds,
  synthesisOperationFromRefinement,
  PlannerBatchStatus,
  ProjectBoardPlannerLedgerCompaction,
  ProjectBoardSectionedContextCompactionReason,
} from "./projectBoardSynthesisPlannerPrompts";
import type {
  AmbientProjectBoardPmReviewResult,
  AmbientProjectBoardSynthesisCallResult,
  AmbientProjectBoardSynthesisProgress,
  AmbientProjectBoardSynthesisProgressiveBatch,
  AmbientProjectBoardSynthesisResult,
  PlannerLastValidRecord,
  ProjectBoardPlannerTransportMode,
  ProjectBoardSectionFailureKind,
  ProjectBoardSynthesisPauseCheckInput,
  ProjectBoardSynthesisReasoning,
  ProjectBoardSynthesisTransientRetryEvent,
} from "./projectBoardSynthesisProviderSupport";
import {
  PROJECT_BOARD_SECTION_RETRY_LIMIT,
  ProjectBoardSectionNoRecordsError,
  assertValidClarificationQuestionCandidates,
  assertValidClarificationQuestionRecords,
  assertValidProjectBoardGeneratedRecordTitles,
  attachPlannerRecordSourceSnapshots,
  buildProjectBoardSectionRetryPrompt,
  completedSectionIdsFromRecords,
  dedupeProgressiveRecords,
  delayProjectBoardSynthesisRetry,
  deriveProjectBoardScopeContractWithPi,
  fetchAmbientProjectBoardSynthesisResponse,
  filterPlannerBatchRenderedCardDuplicates,
  filterProjectBoardGeneratedCards,
  finalizeProjectBoardSynthesisDraft,
  guardedWorkspaceIoTask,
  isAdditiveRefinement,
  isRecoverablePlannerOutputStop,
  isTransientProjectBoardSynthesisError,
  lastCandidateTitle,
  lastQuestion,
  lastValidPlannerRecord,
  limitPlannerBatchCandidateCardRecords,
  limitProjectBoardWorkflowDraft,
  limitSectionCandidateCardRecords,
  normalizeAmbientStreamIdleTimeoutMs,
  normalizePlannerBatchRecords,
  normalizeProjectBoardSynthesisMaxToolRounds,
  normalizeProjectBoardSynthesisResponse,
  normalizeSectionProgressiveRecords,
  plannerBatchOperation,
  plannerBatchProgressRecord,
  plannerBatchStatusFromResponse,
  plannerBatchValidationFailureRecords,
  plannerLedgerCompactionProgressRecord,
  plannerLedgerCompactionTelemetryMetadata,
  plannerPauseProgressRecord,
  plannerPromptBudgetWarningRecord,
  pmReviewActivationTelemetryMetadata,
  previewProjectBoardPlannerResponse,
  projectBoardPiTextReasoning,
  projectBoardPromptBudgetRunMetadata,
  projectBoardSectionFailureKind,
  projectBoardSynthesisReasoningPayload,
  projectBoardSynthesisTransientAttemptCount,
  projectBoardSynthesisTransientRetryDelayMs,
  projectBoardWorkflowScopeLimits,
  projectBoardWorkspacePollIntervalMs,
  recordsNotAlreadySeen,
  readAmbientChatCompletionResult,
  retryableSectionResumeRecords,
  scopeContractFilterCountFromRecords,
  sectionFailureRecords,
  sectionRetryProgressRecord,
  sectionStatusProgressRecord,
  sectionedContextCompactionProgressRecord,
  shouldRetryProjectBoardSectionFailure,
  shouldRetryProjectBoardSynthesisTransient,
  wholeBoardPlanningSection,
} from "./projectBoardSynthesisProviderSupport";
export {
  buildProjectBoardSectionedPlanningPrompt,
  parseProjectBoardSynthesisJson,
  remainingPlannerCoverageSourceIds,
} from "./projectBoardSynthesisPlannerPrompts";
export type {
  AmbientProjectBoardPmReviewResult,
  AmbientProjectBoardSynthesisProgress,
  AmbientProjectBoardSynthesisProgressiveBatch,
  AmbientProjectBoardSynthesisResult,
  AmbientProjectBoardSynthesisTelemetry,
  ProjectBoardPlannerTransportMode,
  ProjectBoardSynthesisReasoning,
  ProjectBoardSynthesisReasoningConfig,
  ProjectBoardSynthesisReasoningEffort,
} from "./projectBoardSynthesisProviderSupport";
export { filterScopeContractCards } from "./projectBoardSynthesisProviderSupport";

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
    const scopeContract = projectBoardScopeContractFromTexts(
      projectBoardScopeContractTexts({ sources: input.sources, refinement: input.refinement }),
    );
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
          plannerLedgerCompactionSkipReason: promptBudget.summarizationRecommended
            ? "charter_review_not_compacted"
            : "latest_prompt_below_threshold",
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
          plannerLedgerCompactionSkipReason: promptBudget.summarizationRecommended
            ? "legacy_full_synthesis_not_compacted"
            : "latest_prompt_below_threshold",
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
      if (!done && responseCharCount > 0 && responseCharCount - lastResponseProgressChars < 1000 && now - lastResponseProgressAt < 1000) {
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
    } finally {
      if (workspacePollTimer) clearInterval(workspacePollTimer);
    }
    if (!responseResult) throw new Error("Ambient project-board synthesis returned no transport result.");
    const responseText = responseResult.text;
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
    const draftSourceRecords = workspaceRecords.some((record) => record.type === "candidate_card") ? workspaceRecords : [];
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
        : normalizeProjectBoardSynthesisResponse(
            responseText,
            {
              projectName: input.projectName,
              sources: input.sources,
            },
            {
              uxMockGate: input.refinement && isAdditiveRefinement(input.refinement) ? "preserve" : "auto",
            },
          );
    const {
      draft,
      finalRecords: progressiveRecords,
      scopeContractFilterCount,
    } = await finalizeProjectBoardSynthesisDraft({
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
          maxSectionChars: Math.max(
            input.sectioning?.maxSectionChars ?? workflowScopeLimits.maxSectionChars,
            workflowScopeLimits.maxSectionChars,
          ),
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
      if (
        !(await input.shouldPause?.({
          phase: "section",
          sectionIndex: sectionNumber,
          sectionCount: sections.length,
          recordCount: records.length,
          lastValidRecord: lastValidPlannerRecord(records),
        }))
      ) {
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
      const rawBasePromptBudget = projectBoardPromptBudgetAssessment({
        promptCharCount: rawBasePrompt.length,
        profile: sectionBudgetProfile,
      });
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
      let lastRetryFailure:
        | { failureKind: ProjectBoardSectionFailureKind; message: string; sectionResponseCharCount: number; sectionDurationMs: number }
        | undefined;
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
            plannerLedgerCompaction: sectionContextCompaction
              ? plannerLedgerCompactionTelemetryMetadata(sectionContextCompaction)
              : undefined,
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
            title: retrying
              ? `Received retry for section ${sectionNumber}/${sections.length}`
              : `Received section ${sectionNumber}/${sections.length}`,
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
          const failureResponseCharCount = sectionResponseCommitted
            ? totalResponseCharCount
            : totalResponseCharCount + sectionResponseChars;
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
          if (
            sectionResponseChars === 0 &&
            isTransientProjectBoardSynthesisError(error) &&
            !records.some((record) => record.type === "candidate_card")
          ) {
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
    const maxBatches = normalizePlannerBatchLimit(
      input.maxBatches ?? (workflowScopeLimits.compact ? workflowScopeLimits.maxBatches : undefined),
    );
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
            sourceQaAnswerer: this.createPlannerSourceQaAnswerer({
              apiKey,
              plannerWorkspace: input.plannerWorkspace,
              signal: input.signal,
            }),
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
              summary:
                progress.resultSummary ||
                progress.error ||
                progress.inputSummary ||
                `Planner tool ${progress.toolName} ${progress.status}.`,
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
      const renderedDuplicateFilter = filterPlannerBatchRenderedCardDuplicates(
        limitedBatchRecords,
        records,
        wholeBoardSection,
        input.sources,
      );
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
        plannerBatchCount: planningRecords.filter((record) => record.type === "progress" && record.stage === "planner_batch_succeeded")
          .length,
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
