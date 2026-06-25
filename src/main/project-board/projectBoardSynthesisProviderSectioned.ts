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
  extractProjectBoardProposalJsonlRecordsFromText,
  projectBoardSynthesisDraftFromProgressiveRecords,
} from "./projectBoardProgressivePlanning";
import { projectBoardPlanningSectionPlanFromSources, type ProjectBoardPlanningSectionOptions } from "./projectBoardSectionedPlanning";
import { projectBoardPlannerWorkspacePromptBlock, type ProjectBoardPlannerWorkspace } from "./projectBoardPlannerWorkspace";
import { buildProjectBoardPlanningContract, projectBoardPlanningDepthFromScopeContract } from "./projectBoardPlanningContract";
import { projectBoardProofScopeWarningRecords } from "./projectBoardProofScope";
import {
  synthesizeProjectBoardDraft,
  type ProjectBoardSynthesisRefinementContext,
  type ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";
import type { ProjectBoardSynthesisTransportInput } from "./projectBoardSynthesisProviderTransport";
import {
  buildProjectBoardSectionedPlanningPrompt,
  errorMessage,
  inferPlanningProfileName,
  normalizeSectionBatchCardLimit,
  type ProjectBoardPlannerLedgerCompaction,
} from "./projectBoardSynthesisPlannerPrompts";
import type {
  AmbientProjectBoardSynthesisProgress,
  AmbientProjectBoardSynthesisProgressiveBatch,
  AmbientProjectBoardSynthesisResult,
  ProjectBoardSectionFailureKind,
  ProjectBoardSynthesisPauseCheckInput,
} from "./projectBoardSynthesisProviderSupport";
import {
  PROJECT_BOARD_SECTION_RETRY_LIMIT,
  ProjectBoardSectionNoRecordsError,
  assertValidClarificationQuestionRecords,
  assertValidProjectBoardGeneratedRecordTitles,
  attachPlannerRecordSourceSnapshots,
  buildProjectBoardSectionRetryPrompt,
  completedSectionIdsFromRecords,
  dedupeProgressiveRecords,
  deriveProjectBoardScopeContractWithPi,
  finalizeProjectBoardSynthesisDraft,
  isTransientProjectBoardSynthesisError,
  lastCandidateTitle,
  lastQuestion,
  limitSectionCandidateCardRecords,
  normalizeSectionProgressiveRecords,
  plannerLedgerCompactionTelemetryMetadata,
  pmReviewActivationTelemetryMetadata,
  projectBoardPromptBudgetRunMetadata,
  projectBoardSectionFailureKind,
  projectBoardWorkflowScopeLimits,
  projectBoardWorkspacePollIntervalMs,
  retryableSectionResumeRecords,
  sectionFailureRecords,
  sectionRetryProgressRecord,
  sectionStatusProgressRecord,
  shouldRetryProjectBoardSectionFailure,
} from "./projectBoardSynthesisProviderSupport";
import {
  maybeCompactProjectBoardSectionedContext,
  type ProjectBoardSectionedPlannerLedgerCompactionInput,
} from "./projectBoardSynthesisProviderSectionedCompaction";
import { createProjectBoardSectionedProgressController } from "./projectBoardSynthesisProviderSectionedProgress";
import type { ProjectBoardSynthesisProviderRuntimeInput } from "./projectBoardSynthesisProviderWholeBoard";

export type { ProjectBoardSectionedPlannerLedgerCompactionInput } from "./projectBoardSynthesisProviderSectionedCompaction";

export interface ProjectBoardSectionedSynthesisInput {
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
}

export async function synthesizeProjectBoardSectionedWithTelemetry(input: {
  providerInput: ProjectBoardSynthesisProviderRuntimeInput;
  synthesisInput: ProjectBoardSectionedSynthesisInput;
  callAmbientForSynthesis: (input: ProjectBoardSynthesisTransportInput) => Promise<string>;
  compactPlannerBatchLedger: (input: ProjectBoardSectionedPlannerLedgerCompactionInput) => Promise<ProjectBoardPlannerLedgerCompaction>;
}): Promise<AmbientProjectBoardSynthesisResult> {
  const { providerInput, synthesisInput, callAmbientForSynthesis, compactPlannerBatchLedger } = input;
  const apiKey = (providerInput.apiKey ?? readAmbientApiKey() ?? "").trim();
  if (!apiKey) throw new Error("Ambient API key is not configured.");
  const scopeContract = await deriveProjectBoardScopeContractWithPi({
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
  const planningDepth = projectBoardPlanningDepthFromScopeContract(scopeContract);
  const workflowScopeLimits = projectBoardWorkflowScopeLimits({ scopeContract, sources: synthesisInput.sources });
  const sectioning = workflowScopeLimits.compact
    ? {
        ...synthesisInput.sectioning,
        maxSections: Math.min(synthesisInput.sectioning?.maxSections ?? workflowScopeLimits.maxSections, workflowScopeLimits.maxSections),
        maxSectionChars: Math.max(
          synthesisInput.sectioning?.maxSectionChars ?? workflowScopeLimits.maxSectionChars,
          workflowScopeLimits.maxSectionChars,
        ),
      }
    : synthesisInput.sectioning;
  const sectionPlan = projectBoardPlanningSectionPlanFromSources(synthesisInput.sources, sectioning);
  const sections = sectionPlan.sections;
  if (sections.length === 0) throw new Error("Project board sectioned synthesis did not find any included source sections.");
  const deterministicDraft = synthesizeProjectBoardDraft(synthesisInput.sources);
  const startedAt = Date.now();
  let totalPromptCharCount = 0;
  let totalResponseCharCount = 0;
  const records: ProposalJsonlRecordArtifact[] = retryableSectionResumeRecords(synthesisInput.resumeFromRecords ?? []);
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
    synthesisInput.maxCardsPerSection ?? (workflowScopeLimits.compact ? workflowScopeLimits.maxCardsPerSection : undefined),
  );
  const sectionBudgetProfile = projectBoardModelBudgetProfile({
    model: providerInput.model,
    operation: "section_elaboration",
    maxCardsPerBatch: maxCardsPerSection,
  });
  const sectionProgress = createProjectBoardSectionedProgressController({
    records,
    sectionCount: sections.length,
    plannerWorkspace: synthesisInput.plannerWorkspace,
    shouldPause: synthesisInput.shouldPause,
    onProgress: synthesisInput.onProgress,
    onProgressiveRecords: synthesisInput.onProgressiveRecords,
    getTotalPromptCharCount: () => totalPromptCharCount,
    getTotalResponseCharCount: () => totalResponseCharCount,
  });
  const { workspaceTailState, workspacePollErrorState } = sectionProgress;
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
      synthesisInput.onProgressiveRecords?.({
        records: skippedRecords,
        section,
        sectionIndex: sectionNumber,
        sectionCount: sections.length,
        promptCharCount: totalPromptCharCount,
        responseCharCount: totalResponseCharCount,
        accumulatedRecordCount: records.length,
      });
      synthesisInput.onProgress?.({
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
      if (await sectionProgress.recordPauseCheckpoint(section, sectionNumber)) {
        paused = true;
        break;
      }
      continue;
    }
    const rawBasePrompt = buildProjectBoardSectionedPlanningPrompt({
      section,
      sectionIndex: index,
      sectionCount: sections.length,
      sources: synthesisInput.sources,
      projectName: synthesisInput.projectName,
      deterministicDraft,
      refinement: synthesisInput.refinement,
      ...(synthesisInput.charterProjectSummary ? { charterProjectSummary: synthesisInput.charterProjectSummary } : {}),
      scopeContract,
      priorRecords: records,
      maxCardsPerSection,
      plannerWorkspaceBlock: projectBoardPlannerWorkspacePromptBlock(synthesisInput.plannerWorkspace),
    });
    const rawBasePromptBudget = projectBoardPromptBudgetAssessment({
      promptCharCount: rawBasePrompt.length,
      profile: sectionBudgetProfile,
    });
    const compactionResult = await maybeCompactProjectBoardSectionedContext({
      apiKey,
      section,
      sectionNumber,
      sectionCount: sections.length,
      sources: synthesisInput.sources,
      projectName: synthesisInput.projectName,
      refinement: synthesisInput.refinement,
      charterProjectSummary: synthesisInput.charterProjectSummary,
      rawBasePrompt,
      rawBasePromptBudget,
      currentPromptCharCount: totalPromptCharCount,
      totalResponseCharCount,
      maxCardsPerSection,
      records,
      plannerWorkspace: synthesisInput.plannerWorkspace,
      workspaceTailState,
      onProgress: synthesisInput.onProgress,
      onProgressiveRecords: synthesisInput.onProgressiveRecords,
      compactPlannerBatchLedger,
      signal: synthesisInput.signal,
    });
    const sectionContextCompaction = compactionResult.compaction;
    const sectionContextCompactionReason = compactionResult.reason;
    if (sectionContextCompaction) {
      plannerLedgerCompactionCount += 1;
      if (compactionResult.cacheHit) plannerLedgerCompactionCacheHitCount += 1;
      lastPlannerLedgerCompaction = sectionContextCompaction;
      totalPromptCharCount += compactionResult.promptCharCount;
    }
    const basePrompt = sectionContextCompaction
      ? buildProjectBoardSectionedPlanningPrompt({
          section,
          sectionIndex: index,
          sectionCount: sections.length,
          sources: synthesisInput.sources,
          projectName: synthesisInput.projectName,
          deterministicDraft,
          refinement: synthesisInput.refinement,
          ...(synthesisInput.charterProjectSummary ? { charterProjectSummary: synthesisInput.charterProjectSummary } : {}),
          scopeContract,
          priorRecords: records,
          maxCardsPerSection,
          plannerWorkspaceBlock: projectBoardPlannerWorkspacePromptBlock(synthesisInput.plannerWorkspace),
          plannerLedgerCompaction: sectionContextCompaction,
        })
      : rawBasePrompt;
    if (sectionContextCompaction) sectionContextCompaction.finalPromptCharCount = basePrompt.length;
    const contract = buildProjectBoardPlanningContract({
      operation: "section_elaboration",
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
        await sectionProgress.emitSectionRecords(section, sectionNumber, retryRecords, totalResponseCharCount);
        synthesisInput.onProgress?.({
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
      synthesisInput.onProgress?.({
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
          ...pmReviewActivationTelemetryMetadata(synthesisInput.refinement?.pmReviewReport),
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
      const workspacePollTimer = synthesisInput.plannerWorkspace
        ? setInterval(
            () => sectionProgress.scheduleWorkspacePoll(section, sectionNumber, sectionResponseChars),
            projectBoardWorkspacePollIntervalMs(providerInput.streamIdleTimeoutMs),
          )
        : undefined;
      try {
        const responseText = await callAmbientForSynthesis({
          apiKey,
          system: contract.systemPrompt,
          prompt,
          maxTokens: sectionBudgetProfile.maxOutputTokens,
          reasoning: contract.reasoning,
          onChunk: (responseCharCount) => {
            sectionResponseChars = responseCharCount;
            synthesisInput.onProgress?.({
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
            sectionProgress.scheduleWorkspacePoll(section, sectionNumber, responseCharCount);
          },
          onTransientRetry: (retry) => {
            synthesisInput.onProgress?.({
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
          contentActivityToken: () => sectionProgress.contentActivityToken(),
          committedRecordCount: () => Math.max(0, records.length - sectionStartRecordCount),
          signal: synthesisInput.signal,
        });
        if (workspacePollTimer) clearInterval(workspacePollTimer);
        await sectionProgress.flushWorkspacePollQueue();
        sectionResponseChars = responseText.length;
        sectionProgress.scheduleWorkspacePoll(section, sectionNumber, sectionResponseChars, true);
        await sectionProgress.flushWorkspacePollQueue();
        totalResponseCharCount += responseText.length;
        sectionResponseCommitted = true;
        const sectionDurationMs = Date.now() - sectionStartedAt;
        synthesisInput.onProgress?.({
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
          synthesisInput.sources,
        );
        assertValidProjectBoardGeneratedRecordTitles(normalizedSectionRecords, {
          surface: "section_elaboration",
          sectionId: section.id,
          sectionHeading: section.heading,
          sectionIndex: sectionNumber,
          sectionCount: sections.length,
        });
        assertValidClarificationQuestionRecords(normalizedSectionRecords, synthesisInput.refinement, {
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
        await sectionProgress.emitSectionRecords(section, sectionNumber, sectionRecords, totalResponseCharCount);
        synthesisInput.onProgress?.({
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
        await sectionProgress.flushWorkspacePollQueue();
        sectionProgress.scheduleWorkspacePoll(section, sectionNumber, sectionResponseChars, true);
        await sectionProgress.flushWorkspacePollQueue();
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
          shouldRetryProjectBoardSectionFailure(error, { signal: synthesisInput.signal })
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
        await sectionProgress.emitSectionRecords(section, sectionNumber, sectionRecords, failureResponseCharCount);
        synthesisInput.onProgress?.({
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
    if (await sectionProgress.recordPauseCheckpoint(section, sectionNumber)) {
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
    projectName: synthesisInput.projectName,
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
    sources: synthesisInput.sources,
    refinement: synthesisInput.refinement,
    scopeContract,
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
