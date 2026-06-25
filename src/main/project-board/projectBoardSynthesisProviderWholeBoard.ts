import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type { ProjectBoardCharterProjectSummary } from "../../shared/projectBoardTypes";
import { readAmbientApiKey } from "./projectBoardSecurityFacade";
import {
  projectBoardModelBudgetProfile,
  projectBoardModelBudgetProfileMetadata,
  projectBoardPromptBudgetAssessment,
  projectBoardPromptBudgetAssessmentMetadata,
} from "./projectBoardModelBudgetProfile";
import { type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { projectBoardSynthesisDraftFromProgressiveRecords } from "./projectBoardProgressivePlanning";
import {
  createProjectBoardPlannerWorkspaceTailState,
  pollProjectBoardPlannerWorkspaceRecords,
  projectBoardPlannerWorkspacePromptBlock,
} from "./projectBoardPlannerWorkspace";
import type { ProjectBoardPlannerWorkspace } from "./projectBoardPlannerWorkspace";
import { buildProjectBoardPlanningContract, projectBoardPlanningDepthFromScopeContract } from "./projectBoardPlanningContract";
import {
  buildProjectBoardSynthesisPrompt,
  synthesizeProjectBoardDraft,
  type ProjectBoardSynthesisRefinementContext,
  type ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";
import {
  type ProjectBoardSynthesisTransportInput,
  type ProjectBoardSynthesisTransportOptions,
} from "./projectBoardSynthesisProviderTransport";
import {
  dedupeProgressiveRecords,
  deriveProjectBoardScopeContractWithPi,
  finalizeProjectBoardSynthesisDraft,
  guardedWorkspaceIoTask,
  isAdditiveRefinement,
  normalizeProjectBoardSynthesisResponse,
  pmReviewActivationTelemetryMetadata,
  projectBoardPromptBudgetRunMetadata,
  projectBoardWorkflowScopeLimits,
  projectBoardWorkspacePollIntervalMs,
  wholeBoardPlanningSection,
  type AmbientProjectBoardSynthesisCallResult,
  type AmbientProjectBoardSynthesisProgress,
  type AmbientProjectBoardSynthesisProgressiveBatch,
  type AmbientProjectBoardSynthesisResult,
} from "./projectBoardSynthesisProviderSupport";
import { inferPlanningProfileName, synthesisOperationFromRefinement } from "./projectBoardSynthesisPlannerPrompts";

export type ProjectBoardSynthesisProviderRuntimeInput = ProjectBoardSynthesisTransportOptions & {
  apiKey?: string;
};

export interface ProjectBoardWholeBoardSynthesisInput {
  sources: ProjectBoardSynthesisSource[];
  projectName?: string;
  refinement?: ProjectBoardSynthesisRefinementContext;
  charterProjectSummary?: ProjectBoardCharterProjectSummary;
  onProgress?: (progress: AmbientProjectBoardSynthesisProgress) => void;
  onProgressiveRecords?: (batch: AmbientProjectBoardSynthesisProgressiveBatch) => void;
  plannerWorkspace?: ProjectBoardPlannerWorkspace;
  signal?: AbortSignal;
}

export async function synthesizeProjectBoardWholeBoardWithTelemetry(input: {
  providerInput: ProjectBoardSynthesisProviderRuntimeInput;
  synthesisInput: ProjectBoardWholeBoardSynthesisInput;
  callAmbientForSynthesisWithMetadata: (input: ProjectBoardSynthesisTransportInput) => Promise<AmbientProjectBoardSynthesisCallResult>;
}): Promise<AmbientProjectBoardSynthesisResult> {
  const { providerInput, synthesisInput, callAmbientForSynthesisWithMetadata } = input;
  const apiKey = (providerInput.apiKey ?? readAmbientApiKey() ?? "").trim();
  if (!apiKey) throw new Error("Ambient API key is not configured.");
  const deterministicDraft = synthesizeProjectBoardDraft(synthesisInput.sources);
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
  const prompt = buildProjectBoardSynthesisPrompt({
    sources: synthesisInput.sources,
    projectName: synthesisInput.projectName,
    deterministicDraft,
    refinement: synthesisInput.refinement,
    ...(synthesisInput.charterProjectSummary ? { charterProjectSummary: synthesisInput.charterProjectSummary } : {}),
    plannerWorkspaceBlock: projectBoardPlannerWorkspacePromptBlock(synthesisInput.plannerWorkspace),
  });
  const operation = synthesisOperationFromRefinement(synthesisInput.refinement);
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
    scopeContract,
  });
  const budgetProfile = projectBoardModelBudgetProfile({
    model: providerInput.model,
    operation: "legacy_full_synthesis",
  });
  const promptBudget = projectBoardPromptBudgetAssessment({ promptCharCount: prompt.length, profile: budgetProfile });
  synthesisInput.onProgress?.({
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
      model: normalizeAmbientModelId(providerInput.model),
      planningOperation: operation,
      planningProfile: contract.profile.name,
      ...pmReviewActivationTelemetryMetadata(synthesisInput.refinement?.pmReviewReport),
      outputTokenBudget: budgetProfile.maxOutputTokens,
      modelBudgetProfile: projectBoardModelBudgetProfileMetadata(budgetProfile),
      promptBudgetAssessment: projectBoardPromptBudgetAssessmentMetadata(promptBudget),
    },
    promptCharCount: prompt.length,
  });
  const requestStartedAt = Date.now();
  const workspaceTailState = createProjectBoardPlannerWorkspaceTailState();
  const streamedWorkspaceRecords: ProposalJsonlRecordArtifact[] = [];
  const wholeBoardSection = wholeBoardPlanningSection(synthesisInput.sources, synthesisInput.projectName);
  let workspacePollQueue = Promise.resolve();
  let workspaceActivityToken = 0;
  const workspacePollErrorState = { warned: false };
  const scheduleWorkspacePoll = (includeIncompleteLastLine = false) => {
    if (!synthesisInput.plannerWorkspace) return;
    workspacePollQueue = workspacePollQueue.then(
      guardedWorkspaceIoTask(
        async () => {
          const batchRecords = await pollProjectBoardPlannerWorkspaceRecords({
            workspace: synthesisInput.plannerWorkspace,
            state: workspaceTailState,
            includeIncompleteLastLine,
          });
          if (batchRecords.length === 0) return;
          workspaceActivityToken += batchRecords.length;
          streamedWorkspaceRecords.push(...batchRecords);
          if (synthesisInput.onProgressiveRecords) {
            synthesisInput.onProgressiveRecords({
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
        synthesisInput.onProgress,
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
    synthesisInput.onProgress?.({
      stage: "model_response",
      title: done ? "Received Ambient/Pi response" : "Receiving Ambient/Pi response",
      summary: `${done ? "Received" : "Received so far"} ${responseCharCount.toLocaleString()} response characters in ${elapsedMs.toLocaleString()} ms.`,
      metadata: { responseCharCount, requestDurationMs: elapsedMs, streaming: true },
      responseCharCount,
    });
    scheduleWorkspacePoll();
  };
  const workspacePollTimer = synthesisInput.plannerWorkspace
    ? setInterval(() => scheduleWorkspacePoll(), projectBoardWorkspacePollIntervalMs(providerInput.streamIdleTimeoutMs))
    : undefined;
  let responseResult: AmbientProjectBoardSynthesisCallResult | undefined;
  try {
    responseResult = await callAmbientForSynthesisWithMetadata({
      apiKey,
      system: contract.systemPrompt,
      prompt,
      maxTokens: budgetProfile.maxOutputTokens,
      reasoning: contract.reasoning,
      onChunk: (responseCharCount) => emitResponseProgress(responseCharCount),
      contentActivityToken: () => workspaceActivityToken,
      committedRecordCount: () => streamedWorkspaceRecords.length,
      signal: synthesisInput.signal,
      onTransientRetry: (retry) => {
        synthesisInput.onProgress?.({
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
  synthesisInput.onProgress?.({
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
          projectName: synthesisInput.projectName,
          summary: "Recovered a board proposal from planner workspace artifacts.",
          goal: deterministicDraft.goal,
          currentState: deterministicDraft.currentState,
          targetUser: deterministicDraft.targetUser,
          qualityBar: deterministicDraft.qualityBar,
        })
      : normalizeProjectBoardSynthesisResponse(
          responseText,
          {
            projectName: synthesisInput.projectName,
            sources: synthesisInput.sources,
          },
          {
            uxMockGate: synthesisInput.refinement && isAdditiveRefinement(synthesisInput.refinement) ? "preserve" : "auto",
          },
        );
  const {
    draft,
    finalRecords: progressiveRecords,
    scopeContractFilterCount,
  } = await finalizeProjectBoardSynthesisDraft({
    sourceDraft,
    surface: "legacy_full_synthesis",
    sources: synthesisInput.sources,
    refinement: synthesisInput.refinement,
    scopeContract,
    workflowScopeLimits,
    retainRecords: workspaceRecords,
    priorRecords: workspaceRecords,
    plannerWorkspace: synthesisInput.plannerWorkspace,
    workspaceTailState,
    workspacePollErrorState,
    onProgress: synthesisInput.onProgress,
    assertDraftValidity: true,
  });
  synthesisInput.onProgress?.({
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
