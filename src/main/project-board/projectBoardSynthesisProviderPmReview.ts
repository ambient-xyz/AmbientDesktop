import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type { ProjectBoardCharterProjectSummary } from "../../shared/projectBoardTypes";
import { readAmbientApiKey } from "./projectBoardSecurityFacade";
import {
  projectBoardModelBudgetProfile,
  projectBoardModelBudgetProfileMetadata,
  projectBoardPromptBudgetAssessment,
  projectBoardPromptBudgetAssessmentMetadata,
} from "./projectBoardModelBudgetProfile";
import { stableBoardArtifactId } from "./projectBoardArtifacts";
import type { ProjectBoardPlannerWorkspace } from "./projectBoardPlannerWorkspace";
import { buildProjectBoardPlanningContract, projectBoardScopeContractFromTexts } from "./projectBoardPlanningContract";
import {
  buildProjectBoardPmReviewReportPrompt,
  normalizeProjectBoardPmReviewReport,
  projectBoardScopeContractTexts,
  projectBoardSynthesisDraftFromPmReviewReport,
  synthesizeProjectBoardDraft,
  type ProjectBoardPmReviewGitContext,
  type ProjectBoardSynthesisRefinementContext,
  type ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";
import { callWorkflowPiText, type WorkflowPiCompletionMetadata, type WorkflowPiProgress } from "./projectBoardWorkflowFacade";
import { inferPlanningProfileName, parseProjectBoardSynthesisJson } from "./projectBoardSynthesisPlannerPrompts";
import {
  assertValidClarificationQuestionCandidates,
  normalizeAmbientStreamIdleTimeoutMs,
  projectBoardPiTextReasoning,
  projectBoardPromptBudgetRunMetadata,
  type AmbientProjectBoardPmReviewResult,
  type AmbientProjectBoardSynthesisProgress,
} from "./projectBoardSynthesisProviderSupport";
import type { ProjectBoardSynthesisProviderRuntimeInput } from "./projectBoardSynthesisProviderWholeBoard";

export interface ProjectBoardCharterReviewInput {
  sources: ProjectBoardSynthesisSource[];
  projectName?: string;
  refinement?: ProjectBoardSynthesisRefinementContext;
  charterProjectSummary?: ProjectBoardCharterProjectSummary;
  gitContext?: ProjectBoardPmReviewGitContext;
  onProgress?: (progress: AmbientProjectBoardSynthesisProgress) => void;
  plannerWorkspace?: ProjectBoardPlannerWorkspace;
  signal?: AbortSignal;
}

export async function reviewProjectBoardCharterWithTelemetry(input: {
  providerInput: ProjectBoardSynthesisProviderRuntimeInput;
  reviewInput: ProjectBoardCharterReviewInput;
}): Promise<AmbientProjectBoardPmReviewResult> {
  const { providerInput, reviewInput } = input;
  const apiKey = (providerInput.apiKey ?? readAmbientApiKey() ?? "").trim();
  if (!apiKey) throw new Error("Ambient API key is not configured.");
  const deterministicDraft = synthesizeProjectBoardDraft(reviewInput.sources);
  const scopeContract = projectBoardScopeContractFromTexts(
    projectBoardScopeContractTexts({ sources: reviewInput.sources, refinement: reviewInput.refinement }),
  );
  const prompt = buildProjectBoardPmReviewReportPrompt({
    sources: reviewInput.sources,
    projectName: reviewInput.projectName,
    deterministicDraft,
    refinement: reviewInput.refinement,
    ...(reviewInput.charterProjectSummary ? { charterProjectSummary: reviewInput.charterProjectSummary } : {}),
    ...(reviewInput.gitContext ? { gitContext: reviewInput.gitContext } : {}),
  });
  const contract = buildProjectBoardPlanningContract({
    operation: "charter_review",
    projectName: reviewInput.projectName,
    profileName: inferPlanningProfileName(reviewInput.sources),
    charter: {
      goal: reviewInput.refinement?.previousDraft.goal ?? deterministicDraft.goal,
      proofPolicy: reviewInput.refinement?.previousDraft.qualityBar ?? deterministicDraft.qualityBar,
      decisionPolicy: reviewInput.refinement
        ? "Treat supplied kickoff, charter, and PM Review answers as settled unless they are incomplete or contradictory."
        : "Review kickoff/charter readiness without generating proposal cards.",
      ...(reviewInput.charterProjectSummary ? { projectSummary: reviewInput.charterProjectSummary } : {}),
    },
    scopeContract,
  });
  const budgetProfile = projectBoardModelBudgetProfile({
    model: providerInput.model,
    operation: "charter_review",
  });
  const promptBudget = projectBoardPromptBudgetAssessment({ promptCharCount: prompt.length, profile: budgetProfile });
  reviewInput.onProgress?.({
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
      model: normalizeAmbientModelId(providerInput.model),
      planningOperation: contract.operation,
      planningProfile: contract.profile.name,
      plannerSessionId: reviewInput.plannerWorkspace?.sessionId,
      outputTokenBudget: budgetProfile.maxOutputTokens,
      modelBudgetProfile: projectBoardModelBudgetProfileMetadata(budgetProfile),
      promptBudgetAssessment: projectBoardPromptBudgetAssessmentMetadata(promptBudget),
      generatedCardPolicy: "zero_cards",
      gitState: reviewInput.gitContext?.mode ?? "unknown",
    },
    promptCharCount: prompt.length,
  });
  const requestStartedAt = Date.now();
  let completion: WorkflowPiCompletionMetadata | undefined;
  const text = await (providerInput.piTextCall ?? callWorkflowPiText)({
    apiKey,
    baseUrl: providerInput.baseUrl,
    model: providerInput.model,
    systemPrompt: contract.systemPrompt,
    prompt,
    sessionId: stableBoardArtifactId("project-board-charter-review-session", [
      reviewInput.plannerWorkspace?.sessionId ?? reviewInput.projectName ?? "project-board",
    ]),
    temperature: 0,
    maxTokens: budgetProfile.maxOutputTokens,
    reasoning: projectBoardPiTextReasoning(providerInput.reasoning ?? contract.reasoning),
    responseFormat: { type: "json_object" },
    retryPolicy: providerInput.retryPolicy,
    idleTimeoutMs: normalizeAmbientStreamIdleTimeoutMs(providerInput.streamIdleTimeoutMs),
    signal: reviewInput.signal,
    onProgress: (progress: WorkflowPiProgress) => {
      if (progress.stage !== "streaming" && progress.stage !== "thinking") return;
      reviewInput.onProgress?.({
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
          gitState: reviewInput.gitContext?.mode ?? "unknown",
        },
        responseCharCount: progress.outputChars,
      });
    },
    onCompleted: (metadata) => {
      completion = metadata;
    },
  });
  const requestDurationMs = Date.now() - requestStartedAt;
  reviewInput.onProgress?.({
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
      gitState: reviewInput.gitContext?.mode ?? "unknown",
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
    reviewInput.refinement,
    report.blockingQuestions.map((question, index) => ({
      question,
      location: `pm_review.blockingQuestions[${index}]`,
    })),
    {
      surface: "pm_review",
    },
  );
  const draft = projectBoardSynthesisDraftFromPmReviewReport({ report, baseline: deterministicDraft });
  reviewInput.onProgress?.({
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
