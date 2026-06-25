import type { ProjectBoardCharterProjectSummary } from "../../shared/projectBoardTypes";
import { readAmbientApiKey } from "./projectBoardSecurityFacade";
import {
  projectBoardModelBudgetProfile,
  projectBoardModelBudgetProfileMetadata,
  projectBoardPromptBudgetAssessment,
  projectBoardPromptBudgetAssessmentMetadata,
  type ProjectBoardPromptBudgetAssessment,
} from "./projectBoardModelBudgetProfile";
import { validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import {
  projectBoardProgressiveRecordsFromDraft,
  projectBoardSynthesisDraftFromProgressiveRecords,
} from "./projectBoardProgressivePlanning";
import {
  appendProjectBoardPlannerWorkspaceRecords,
  createProjectBoardPlannerWorkspaceTailState,
  markProjectBoardPlannerWorkspaceTailRecords,
  pollProjectBoardPlannerWorkspaceRecords,
  projectBoardPlannerWorkspacePromptBlock,
  type ProjectBoardPlannerWorkspace,
} from "./projectBoardPlannerWorkspace";
import {
  projectBoardPlannerToolProgressToRecord,
  projectBoardPlannerWorkspaceToolExecutor,
  projectBoardPlannerWorkspaceToolPromptBlock,
  type ProjectBoardPlannerSourceQaAnswerer,
} from "./projectBoardPlannerWorkspaceTools";
import type { ProjectBoardPlannerBatchContinuation } from "./projectBoardPlannerContinuation";
import { buildProjectBoardPlanningContract, projectBoardPlanningDepthFromScopeContract } from "./projectBoardPlanningContract";
import { projectBoardProofScopeWarningRecords } from "./projectBoardProofScope";
import {
  synthesizeProjectBoardDraft,
  type ProjectBoardSynthesisRefinementContext,
  type ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";
import type { ProjectBoardSynthesisTransportInput } from "./projectBoardSynthesisProviderTransport";
import {
  buildPlannerLedgerCompactionPrompt,
  buildProjectBoardPlannerBatchPrompt,
  errorMessage,
  inferPlanningProfileName,
  normalizePlannerBatchCardLimit,
  normalizePlannerBatchLimit,
  plannerLedgerCompactionCacheKey,
  readCachedPlannerLedgerCompaction,
  remainingPlannerCoverageSourceIds,
  type PlannerBatchStatus,
  type ProjectBoardPlannerLedgerCompaction,
} from "./projectBoardSynthesisPlannerPrompts";
import type {
  AmbientProjectBoardSynthesisCallResult,
  AmbientProjectBoardSynthesisProgress,
  AmbientProjectBoardSynthesisProgressiveBatch,
  AmbientProjectBoardSynthesisResult,
  PlannerLastValidRecord,
  ProjectBoardPlannerTransportMode,
  ProjectBoardSynthesisPauseCheckInput,
} from "./projectBoardSynthesisProviderSupport";
import {
  assertValidClarificationQuestionRecords,
  assertValidProjectBoardGeneratedRecordTitles,
  attachPlannerRecordSourceSnapshots,
  dedupeProgressiveRecords,
  deriveProjectBoardScopeContractWithPi,
  filterPlannerBatchRenderedCardDuplicates,
  filterProjectBoardGeneratedCards,
  finalizeProjectBoardSynthesisDraft,
  guardedWorkspaceIoTask,
  isRecoverablePlannerOutputStop,
  lastCandidateTitle,
  lastQuestion,
  lastValidPlannerRecord,
  limitPlannerBatchCandidateCardRecords,
  limitProjectBoardWorkflowDraft,
  normalizePlannerBatchRecords,
  plannerBatchOperation,
  plannerBatchProgressRecord,
  plannerBatchStatusFromResponse,
  plannerBatchValidationFailureRecords,
  plannerLedgerCompactionProgressRecord,
  plannerLedgerCompactionTelemetryMetadata,
  plannerPromptBudgetWarningRecord,
  pmReviewActivationTelemetryMetadata,
  previewProjectBoardPlannerResponse,
  projectBoardPromptBudgetRunMetadata,
  projectBoardWorkflowScopeLimits,
  projectBoardWorkspacePollIntervalMs,
  recordsNotAlreadySeen,
  scopeContractFilterCountFromRecords,
  wholeBoardPlanningSection,
} from "./projectBoardSynthesisProviderSupport";
import type { ProjectBoardSynthesisProviderRuntimeInput } from "./projectBoardSynthesisProviderWholeBoard";

export interface ProjectBoardPlannerBatchSynthesisInput {
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
}

export interface ProjectBoardPlannerBatchLedgerCompactionInput {
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
}

export async function synthesizeProjectBoardPlannerBatchesWithTelemetry(input: {
  providerInput: ProjectBoardSynthesisProviderRuntimeInput;
  synthesisInput: ProjectBoardPlannerBatchSynthesisInput;
  callAmbientForSynthesisWithMetadata: (input: ProjectBoardSynthesisTransportInput) => Promise<AmbientProjectBoardSynthesisCallResult>;
  compactPlannerBatchLedger: (input: ProjectBoardPlannerBatchLedgerCompactionInput) => Promise<ProjectBoardPlannerLedgerCompaction>;
  createPlannerSourceQaAnswerer: (input: {
    apiKey: string;
    plannerWorkspace: ProjectBoardPlannerWorkspace;
    signal?: AbortSignal;
  }) => ProjectBoardPlannerSourceQaAnswerer;
}): Promise<AmbientProjectBoardSynthesisResult> {
  const { providerInput, synthesisInput, callAmbientForSynthesisWithMetadata, compactPlannerBatchLedger, createPlannerSourceQaAnswerer } =
    input;
  const plannerTransportMode: ProjectBoardPlannerTransportMode = providerInput.fetchImpl ? "direct_chat_compat" : "pi_session_stream";
  const apiKey = (providerInput.apiKey ?? readAmbientApiKey() ?? "").trim();
  if (!apiKey) throw new Error("Ambient API key is not configured.");
  const deterministicDraft = synthesizeProjectBoardDraft(synthesisInput.sources);
  const operation = plannerBatchOperation(synthesisInput);
  const llmScopeContract = await deriveProjectBoardScopeContractWithPi({
    apiKey,
    baseUrl: providerInput.baseUrl,
    model: providerInput.model,
    projectName: synthesisInput.projectName,
    sources: synthesisInput.sources,
    refinement: synthesisInput.refinement,
    skipLlmCall: Boolean(providerInput.fetchImpl || providerInput.piTextCall),
    retryPolicy: providerInput.retryPolicy,
    streamIdleTimeoutMs: providerInput.streamIdleTimeoutMs,
    signal: synthesisInput.signal,
    onProgress: synthesisInput.onProgress,
  });
  const planningDepth = projectBoardPlanningDepthFromScopeContract(llmScopeContract);
  const workflowScopeLimits = projectBoardWorkflowScopeLimits({ scopeContract: llmScopeContract, sources: synthesisInput.sources });
  const contract = buildProjectBoardPlanningContract({
    operation,
    projectName: synthesisInput.projectName,
    profileName: inferPlanningProfileName(synthesisInput.sources),
    charter: {
      goal: synthesisInput.refinement?.previousDraft.goal ?? deterministicDraft.goal,
      proofPolicy: synthesisInput.refinement?.previousDraft.qualityBar ?? deterministicDraft.qualityBar,
      decisionPolicy: synthesisInput.refinement
        ? "Treat the supplied charter and PM Review answers as already settled unless they are incomplete or contradictory."
        : undefined,
      ...(synthesisInput.charterProjectSummary ? { projectSummary: synthesisInput.charterProjectSummary } : {}),
    },
    scopeContract: llmScopeContract,
  });
  const startedAt = Date.now();
  const wholeBoardSection = wholeBoardPlanningSection(synthesisInput.sources, synthesisInput.projectName);
  const records: ProposalJsonlRecordArtifact[] = dedupeProgressiveRecords(
    (synthesisInput.resumeFromRecords ?? []).filter((record) => record.type !== "proposal_final"),
  );
  const workspaceTailState = createProjectBoardPlannerWorkspaceTailState(records);
  const maxBatches = normalizePlannerBatchLimit(
    synthesisInput.maxBatches ?? (workflowScopeLimits.compact ? workflowScopeLimits.maxBatches : undefined),
  );
  const maxCardsPerBatch = normalizePlannerBatchCardLimit(
    synthesisInput.maxCardsPerBatch ?? (workflowScopeLimits.compact ? workflowScopeLimits.maxCardsPerBatch : undefined),
    synthesisInput.plannerWorkspace,
  );
  const plannerBatchBudgetProfile = projectBoardModelBudgetProfile({
    model: providerInput.model,
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
    synthesisInput.plannerWorkspace && !providerInput.fetchImpl
      ? projectBoardPlannerWorkspaceToolExecutor(synthesisInput.plannerWorkspace, {
          sourceQaAnswerer: createPlannerSourceQaAnswerer({
            apiKey,
            plannerWorkspace: synthesisInput.plannerWorkspace,
            signal: synthesisInput.signal,
          }),
        })
      : undefined;

  const workspacePollErrorState = { warned: false };
  const scheduleWorkspacePoll = (batchNumber: number, currentBatchResponseChars = 0, includeIncompleteLastLine = false) => {
    if (!synthesisInput.plannerWorkspace) return;
    workspacePollQueue = workspacePollQueue.then(
      guardedWorkspaceIoTask(
        async () => {
          const workspaceRecords = await pollProjectBoardPlannerWorkspaceRecords({
            workspace: synthesisInput.plannerWorkspace,
            state: workspaceTailState,
            includeIncompleteLastLine,
          });
          const newRecords = recordsNotAlreadySeen(workspaceRecords, records);
          if (newRecords.length === 0) return;
          workspaceActivityToken += newRecords.length;
          records.push(...newRecords);
          synthesisInput.onProgressiveRecords?.({
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
        synthesisInput.onProgress,
      ),
    );
  };

  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    const batchNumber = batchIndex + 1;
    const rawPrompt = buildProjectBoardPlannerBatchPrompt({
      sources: synthesisInput.sources,
      projectName: synthesisInput.projectName,
      deterministicDraft,
      refinement: synthesisInput.refinement,
      ...(synthesisInput.charterProjectSummary ? { charterProjectSummary: synthesisInput.charterProjectSummary } : {}),
      scopeContract: llmScopeContract,
      priorRecords: records,
      resumeContinuation: synthesisInput.resumeContinuation,
      batchNumber,
      maxBatches,
      maxCardsPerBatch,
      plannerWorkspaceBlock: [
        projectBoardPlannerWorkspacePromptBlock(synthesisInput.plannerWorkspace),
        projectBoardPlannerWorkspaceToolPromptBlock(workspaceToolRuntime ? synthesisInput.plannerWorkspace : undefined),
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    const rawPromptBudget = projectBoardPromptBudgetAssessment({ promptCharCount: rawPrompt.length, profile: plannerBatchBudgetProfile });
    let plannerLedgerCompaction: ProjectBoardPlannerLedgerCompaction | undefined;
    if (rawPromptBudget.summarizationRecommended) {
      const compactionCacheKey = plannerLedgerCompactionCacheKey({
        sources: synthesisInput.sources,
        projectName: synthesisInput.projectName,
        priorRecords: records,
        refinement: synthesisInput.refinement,
        charterProjectSummary: synthesisInput.charterProjectSummary,
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
          sources: synthesisInput.sources,
          projectName: synthesisInput.projectName,
          priorRecords: records,
          rawPromptBudget,
          batchNumber,
          maxBatches,
          maxCardsPerBatch,
        });
        synthesisInput.onProgress?.({
          stage: "model_request",
          title: `Compacting planner ledger for batch ${batchNumber}`,
          summary: `The raw planner prompt reached ${rawPromptBudget.status}; compacting rendered-card and source ledgers before asking for the next cards.`,
          metadata: {
            plannerBatchIndex: batchNumber,
            plannerBatchCount: maxBatches,
            maxCardsPerBatch,
            plannerSessionId: synthesisInput.plannerWorkspace?.sessionId,
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
        plannerLedgerCompaction = await compactPlannerBatchLedger({
          apiKey,
          prompt: compactionPrompt,
          sources: synthesisInput.sources,
          priorRecords: records,
          rawPromptBudget,
          cacheKey: compactionCacheKey,
          batchNumber,
          maxBatches,
          maxCardsPerBatch,
          plannerSessionId: synthesisInput.plannerWorkspace?.sessionId,
          signal: synthesisInput.signal,
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
        plannerSessionId: synthesisInput.plannerWorkspace?.sessionId,
        durationMs: Date.now() - compactionStartedAt,
      });
      markProjectBoardPlannerWorkspaceTailRecords(workspaceTailState, [compactionRecord]);
      await appendProjectBoardPlannerWorkspaceRecords(synthesisInput.plannerWorkspace, [compactionRecord]);
      records.push(compactionRecord);
      synthesisInput.onProgressiveRecords?.({
        records: [compactionRecord],
        section: wholeBoardSection,
        sectionIndex: batchNumber,
        sectionCount: maxBatches,
        promptCharCount: totalPromptCharCount,
        responseCharCount: totalResponseCharCount,
        accumulatedRecordCount: records.length,
      });
      synthesisInput.onProgress?.({
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
          plannerSessionId: synthesisInput.plannerWorkspace?.sessionId,
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
          sources: synthesisInput.sources,
          projectName: synthesisInput.projectName,
          deterministicDraft,
          refinement: synthesisInput.refinement,
          ...(synthesisInput.charterProjectSummary ? { charterProjectSummary: synthesisInput.charterProjectSummary } : {}),
          scopeContract: llmScopeContract,
          priorRecords: records,
          resumeContinuation: synthesisInput.resumeContinuation,
          batchNumber,
          maxBatches,
          maxCardsPerBatch,
          plannerWorkspaceBlock: [
            projectBoardPlannerWorkspacePromptBlock(synthesisInput.plannerWorkspace),
            projectBoardPlannerWorkspaceToolPromptBlock(workspaceToolRuntime ? synthesisInput.plannerWorkspace : undefined),
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
    synthesisInput.onProgress?.({
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
        ...pmReviewActivationTelemetryMetadata(synthesisInput.refinement?.pmReviewReport),
        plannerSessionId: synthesisInput.plannerWorkspace?.sessionId,
        plannerLedgerPath: synthesisInput.plannerWorkspace?.ledgerPath,
        transportMode: plannerTransportMode,
        plannerContinuation: synthesisInput.resumeContinuation,
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
      plannerSessionId: synthesisInput.plannerWorkspace?.sessionId,
    });
    if (promptBudgetWarning) {
      promptBudgetWarningCount += 1;
      markProjectBoardPlannerWorkspaceTailRecords(workspaceTailState, [promptBudgetWarning]);
      await appendProjectBoardPlannerWorkspaceRecords(synthesisInput.plannerWorkspace, [promptBudgetWarning]);
      records.push(promptBudgetWarning);
      synthesisInput.onProgressiveRecords?.({
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
    const workspacePollTimer = synthesisInput.plannerWorkspace
      ? setInterval(
          () => scheduleWorkspacePoll(batchNumber, batchResponseChars),
          projectBoardWorkspacePollIntervalMs(providerInput.streamIdleTimeoutMs),
        )
      : undefined;
    let responseResult: AmbientProjectBoardSynthesisCallResult | undefined;
    try {
      responseResult = await callAmbientForSynthesisWithMetadata({
        apiKey,
        system: contract.systemPrompt,
        prompt,
        maxTokens: plannerBatchBudgetProfile.maxOutputTokens,
        reasoning: contract.reasoning,
        sessionId: synthesisInput.plannerWorkspace?.sessionId,
        tools: workspaceToolRuntime?.tools,
        executeTool: workspaceToolRuntime?.execute,
        onToolProgress: (progress) => {
          workspaceActivityToken += 1;
          if (progress.status === "error") {
            const toolRecord = projectBoardPlannerToolProgressToRecord(progress);
            void appendProjectBoardPlannerWorkspaceRecords(synthesisInput.plannerWorkspace, [toolRecord]).catch(() => undefined);
          }
          synthesisInput.onProgress?.({
            stage: "model_response",
            title: `Planner tool ${progress.toolName} ${progress.status}`,
            summary:
              progress.resultSummary || progress.error || progress.inputSummary || `Planner tool ${progress.toolName} ${progress.status}.`,
            metadata: {
              plannerBatchIndex: batchNumber,
              plannerBatchCount: maxBatches,
              plannerSessionId: synthesisInput.plannerWorkspace?.sessionId,
              toolCallId: progress.toolCallId,
              toolName: progress.toolName,
              toolStatus: progress.status,
              toolElapsedMs: progress.elapsedMs,
              plannerWorkspaceRoot: synthesisInput.plannerWorkspace?.rootPath,
            },
          });
          scheduleWorkspacePoll(batchNumber, batchResponseChars);
        },
        onChunk: (responseCharCount) => {
          batchResponseChars = responseCharCount;
          synthesisInput.onProgress?.({
            stage: "model_response",
            title: `Receiving planner batch ${batchNumber}`,
            summary: `Received ${responseCharCount.toLocaleString()} planner-batch response characters so far.`,
            metadata: {
              responseCharCount: totalResponseCharCount + responseCharCount,
              batchResponseCharCount: responseCharCount,
              plannerBatchIndex: batchNumber,
              plannerBatchCount: maxBatches,
              streaming: true,
              transportMode: plannerTransportMode,
            },
            responseCharCount: totalResponseCharCount + responseCharCount,
          });
          scheduleWorkspacePoll(batchNumber, responseCharCount);
        },
        onTransientRetry: (retry) => {
          synthesisInput.onProgress?.({
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
              transportMode: plannerTransportMode,
            },
            responseCharCount: totalResponseCharCount + batchResponseChars,
          });
        },
        contentActivityToken: () => workspaceActivityToken,
        committedRecordCount: () => Math.max(0, records.length - batchStartRecordCount),
        signal: synthesisInput.signal,
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
    synthesisInput.onProgress?.({
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
        transportMode: plannerTransportMode,
      },
      responseCharCount: totalResponseCharCount,
    });

    const batchWorkspaceRecordCount = records.length - batchStartRecordCount;
    let limitedBatchRecords: ProposalJsonlRecordArtifact[];
    try {
      limitedBatchRecords = attachPlannerRecordSourceSnapshots(
        limitPlannerBatchCandidateCardRecords(
          normalizePlannerBatchRecords(responseText, {
            projectName: synthesisInput.projectName,
            sources: synthesisInput.sources,
            batchWorkspaceRecordCount,
          }),
          maxCardsPerBatch,
          wholeBoardSection,
        ),
        synthesisInput.sources,
      );
      assertValidProjectBoardGeneratedRecordTitles(limitedBatchRecords, {
        surface: "planner_batch",
        batchNumber,
        maxBatches,
      });
      assertValidClarificationQuestionRecords(limitedBatchRecords, synthesisInput.refinement, {
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
        plannerSessionId: synthesisInput.plannerWorkspace?.sessionId,
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
      await appendProjectBoardPlannerWorkspaceRecords(synthesisInput.plannerWorkspace, newFailureRecords);
      records.push(...newFailureRecords);
      synthesisInput.onProgressiveRecords?.({
        records: newFailureRecords,
        section: wholeBoardSection,
        sectionIndex: batchNumber,
        sectionCount: maxBatches,
        promptCharCount: totalPromptCharCount,
        responseCharCount: totalResponseCharCount,
        accumulatedRecordCount: records.length,
      });
      synthesisInput.onProgress?.({
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
          plannerSessionId: synthesisInput.plannerWorkspace?.sessionId,
          plannerLedgerPath: synthesisInput.plannerWorkspace?.ledgerPath,
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
      synthesisInput.sources,
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
      (await synthesisInput.shouldPause?.({
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
        plannerSessionId: synthesisInput.plannerWorkspace?.sessionId,
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
    await appendProjectBoardPlannerWorkspaceRecords(synthesisInput.plannerWorkspace, newBatchRecords);
    records.push(...newBatchRecords);
    synthesisInput.onProgressiveRecords?.({
      records: newBatchRecords,
      section: wholeBoardSection,
      sectionIndex: batchNumber,
      sectionCount: maxBatches,
      promptCharCount: totalPromptCharCount,
      responseCharCount: totalResponseCharCount,
      accumulatedRecordCount: records.length,
    });
    synthesisInput.onProgress?.({
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
        plannerSessionId: synthesisInput.plannerWorkspace?.sessionId,
        plannerLedgerPath: synthesisInput.plannerWorkspace?.ledgerPath,
        remainingCoverageCount: remainingPlannerCoverageSourceIds(synthesisInput.sources, records).length,
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

    if (terminalStatus || remainingPlannerCoverageSourceIds(synthesisInput.sources, records).length === 0) {
      if (!terminalStatus) terminalStatus = "planning_complete";
      break;
    }
  }

  if (!records.some((record) => record.type === "candidate_card")) {
    const fallbackFiltered = filterProjectBoardGeneratedCards(deterministicDraft, {
      sources: synthesisInput.sources,
      refinement: synthesisInput.refinement,
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
          sources: synthesisInput.sources,
          includeProgress: false,
        }),
      ]);
      const finalWorkspaceRecords = recordsNotAlreadySeen(fallbackRecords, records);
      markProjectBoardPlannerWorkspaceTailRecords(workspaceTailState, finalWorkspaceRecords);
      await guardedWorkspaceIoTask(
        () => appendProjectBoardPlannerWorkspaceRecords(synthesisInput.plannerWorkspace, finalWorkspaceRecords),
        workspacePollErrorState,
        synthesisInput.onProgress,
      )();
      synthesisInput.onProgressiveRecords?.({
        records: finalWorkspaceRecords,
        section: wholeBoardSection,
        sectionIndex: maxBatches,
        sectionCount: maxBatches,
        promptCharCount: totalPromptCharCount,
        responseCharCount: totalResponseCharCount,
        accumulatedRecordCount: fallbackRecords.length,
      });
      synthesisInput.onProgress?.({
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
    projectName: synthesisInput.projectName,
    summary: `Recovered a board proposal from ${planningRecords.filter((record) => record.type === "progress" && record.stage === "planner_batch_succeeded").length} planner batch${planningRecords.filter((record) => record.type === "progress" && record.stage === "planner_batch_succeeded").length === 1 ? "" : "es"}.`,
    goal: deterministicDraft.goal,
    currentState: deterministicDraft.currentState,
    targetUser: deterministicDraft.targetUser,
    qualityBar: deterministicDraft.qualityBar,
  });
  const { draft, finalRecords, scopeContractFilterCount } = await finalizeProjectBoardSynthesisDraft({
    sourceDraft,
    surface: "planner_batch_synthesis",
    sources: synthesisInput.sources,
    refinement: synthesisInput.refinement,
    scopeContract: llmScopeContract,
    workflowScopeLimits,
    retainRecords: planningRecords,
    priorRecords: records,
    plannerWorkspace: synthesisInput.plannerWorkspace,
    workspaceTailState,
    workspacePollErrorState,
    onProgress: synthesisInput.onProgress,
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
