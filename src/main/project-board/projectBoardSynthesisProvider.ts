import type { ProjectBoardCharterProjectSummary } from "../../shared/projectBoardTypes";
import { projectBoardModelBudgetProfile, type ProjectBoardPromptBudgetAssessment } from "./projectBoardModelBudgetProfile";
import { stableBoardArtifactId, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import type { ProjectBoardPlannerWorkspace } from "./projectBoardPlannerWorkspace";
import type { ProjectBoardPlannerSourceQaAnswerer } from "./projectBoardPlannerWorkspaceTools";
import type {
  ProjectBoardSynthesisDraft,
  ProjectBoardSynthesisRefinementContext,
  ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";
import type { AmbientRetryPolicy } from "./projectBoardAmbientFacade";
import { callWorkflowPiText } from "./projectBoardWorkflowFacade";
import { callProjectBoardSynthesis, callProjectBoardSynthesisWithMetadata } from "./projectBoardSynthesisProviderTransport";
import {
  PROJECT_BOARD_PLANNER_LEDGER_COMPACTION_SYSTEM_PROMPT,
  PROJECT_BOARD_PLANNER_SOURCE_QA_SYSTEM_PROMPT,
  buildPlannerSourceQaPrompt,
  deterministicPlannerLedgerCompaction,
  errorMessage,
  normalizePlannerLedgerCompactionText,
  parsePlannerSourceQaAnswerText,
  type ProjectBoardPlannerLedgerCompaction,
} from "./projectBoardSynthesisPlannerPrompts";
import type {
  AmbientProjectBoardPmReviewResult,
  AmbientProjectBoardSynthesisCallResult,
  AmbientProjectBoardSynthesisResult,
  ProjectBoardPlannerTransportMode,
  ProjectBoardSynthesisReasoning,
  ProjectBoardSynthesisTransientRetryEvent,
} from "./projectBoardSynthesisProviderSupport";
import { normalizeAmbientStreamIdleTimeoutMs } from "./projectBoardSynthesisProviderSupport";
import { reviewProjectBoardCharterWithTelemetry, type ProjectBoardCharterReviewInput } from "./projectBoardSynthesisProviderPmReview";
import {
  synthesizeProjectBoardPlannerBatchesWithTelemetry,
  type ProjectBoardPlannerBatchSynthesisInput,
} from "./projectBoardSynthesisProviderPlannerBatches";
import {
  synthesizeProjectBoardSectionedWithTelemetry,
  type ProjectBoardSectionedSynthesisInput,
} from "./projectBoardSynthesisProviderSectioned";
import {
  synthesizeProjectBoardWholeBoardWithTelemetry,
  type ProjectBoardWholeBoardSynthesisInput,
} from "./projectBoardSynthesisProviderWholeBoard";
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

  async reviewCharterWithTelemetry(input: ProjectBoardCharterReviewInput): Promise<AmbientProjectBoardPmReviewResult> {
    return reviewProjectBoardCharterWithTelemetry({
      providerInput: this.input,
      reviewInput: input,
    });
  }

  // Note: this legacy whole-board path intentionally has no shouldPause parameter.
  // It makes a single model call with no mid-run checkpoint, so pause is handled by
  // the caller via the abort signal; accepting a callback here and ignoring it made
  // pause requests silently no-ops.
  async synthesizeWithTelemetry(input: ProjectBoardWholeBoardSynthesisInput): Promise<AmbientProjectBoardSynthesisResult> {
    return synthesizeProjectBoardWholeBoardWithTelemetry({
      providerInput: this.input,
      synthesisInput: input,
      callAmbientForSynthesisWithMetadata: this.callAmbientForSynthesisWithMetadata.bind(this),
    });
  }

  async synthesizeSectionedWithTelemetry(input: ProjectBoardSectionedSynthesisInput): Promise<AmbientProjectBoardSynthesisResult> {
    return synthesizeProjectBoardSectionedWithTelemetry({
      providerInput: this.input,
      synthesisInput: input,
      callAmbientForSynthesis: this.callAmbientForSynthesis.bind(this),
      compactPlannerBatchLedger: this.compactPlannerBatchLedger.bind(this),
    });
  }

  async synthesizePlannerBatchesWithTelemetry(input: ProjectBoardPlannerBatchSynthesisInput): Promise<AmbientProjectBoardSynthesisResult> {
    return synthesizeProjectBoardPlannerBatchesWithTelemetry({
      providerInput: this.input,
      synthesisInput: input,
      callAmbientForSynthesisWithMetadata: this.callAmbientForSynthesisWithMetadata.bind(this),
      compactPlannerBatchLedger: this.compactPlannerBatchLedger.bind(this),
      createPlannerSourceQaAnswerer: this.createPlannerSourceQaAnswerer.bind(this),
    });
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
    return callProjectBoardSynthesis(this.input, input);
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
    return callProjectBoardSynthesisWithMetadata(this.input, input);
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
