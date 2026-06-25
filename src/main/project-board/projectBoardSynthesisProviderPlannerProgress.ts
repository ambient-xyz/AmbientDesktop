import {
  projectBoardModelBudgetProfileMetadata,
  projectBoardPromptBudgetAssessmentMetadata,
  type ProjectBoardModelBudgetProfile,
  type ProjectBoardPromptBudgetAssessment,
} from "./projectBoardModelBudgetProfile";
import { validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import type { ProjectBoardPlanningSection } from "./projectBoardSectionedPlanning";
import type { ProjectBoardPlannerWorkspace } from "./projectBoardPlannerWorkspace";
import type { ProjectBoardPlanningOperation } from "./projectBoardPlanningContract";
import type { ProjectBoardSynthesisRefinementContext } from "./projectBoardSynthesis";
import {
  errorMessage,
  synthesisOperationFromRefinement,
  type PlannerBatchStatus,
  type ProjectBoardPlannerLedgerCompaction,
  type ProjectBoardPlannerLedgerCompactionTelemetry,
  type ProjectBoardSectionedContextCompactionReason,
} from "./projectBoardSynthesisPlannerPrompts";
import {
  cardTitleQualityValidationMetadata,
  duplicateClarificationQuestionValidationMetadata,
  settledClarificationValidationMetadata,
} from "./projectBoardSynthesisProviderValidation";

export interface PlannerLastValidRecord {
  recordType: ProposalJsonlRecordArtifact["type"];
  recordId: string;
  recordIndex: number;
}

export function plannerLedgerCompactionTelemetryMetadata(
  compaction: ProjectBoardPlannerLedgerCompactionTelemetry,
): Record<string, unknown> {
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

export function plannerLedgerCompactionCachePayload(compaction: ProjectBoardPlannerLedgerCompaction): Record<string, unknown> {
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

export function plannerLedgerCompactionProgressRecord(input: {
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

export function sectionedContextCompactionProgressRecord(input: {
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

export function plannerPromptBudgetWarningRecord(input: {
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

export function plannerBatchProgressRecord(input: {
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
      promptBudgetAssessment: input.promptBudgetAssessment
        ? projectBoardPromptBudgetAssessmentMetadata(input.promptBudgetAssessment)
        : undefined,
      usage: input.usage,
      recoverableOutputStop: input.recoverableOutputStop === true,
      lastValidRecordId: input.lastValidRecord?.recordId,
      lastValidRecordType: input.lastValidRecord?.recordType,
      lastValidRecordIndex: input.lastValidRecord?.recordIndex,
    },
  });
}

export function plannerBatchValidationFailureRecords(input: {
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
    promptBudgetAssessment: input.promptBudgetAssessment
      ? projectBoardPromptBudgetAssessmentMetadata(input.promptBudgetAssessment)
      : undefined,
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

export function plannerPauseProgressRecord(input: {
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

export function lastValidPlannerRecord(records: ProposalJsonlRecordArtifact[]): PlannerLastValidRecord | undefined {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record || record.type === "progress") continue;
    const recordId = plannerRecordId(record);
    if (!recordId) continue;
    return { recordType: record.type, recordId, recordIndex: index };
  }
  return undefined;
}

export function plannerRecordId(record: ProposalJsonlRecordArtifact): string | undefined {
  if (record.type === "candidate_card") return record.sourceId;
  if (record.type === "question") return record.questionId;
  if (record.type === "source_coverage") return record.sourceId;
  if (record.type === "dependency_edge") return `${record.fromCardId}->${record.toCardId}`;
  if (record.type === "warning") return record.code;
  if (record.type === "error") return record.code;
  if (record.type === "proposal_final") return "proposal_final";
  return undefined;
}

export function isRecoverablePlannerOutputStop(finishReason: string | undefined): boolean {
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

export function plannerBatchOperation(input: {
  plannerWorkspace?: ProjectBoardPlannerWorkspace;
  refinement?: ProjectBoardSynthesisRefinementContext;
}): ProjectBoardPlanningOperation {
  if (input.plannerWorkspace?.operation === "source_elaboration") return "source_elaboration";
  return synthesisOperationFromRefinement(input.refinement);
}
