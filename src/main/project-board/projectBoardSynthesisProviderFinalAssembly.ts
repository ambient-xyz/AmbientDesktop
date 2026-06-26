import type { ProjectBoardPmReviewReport, ProjectBoardScopeContract } from "../../shared/projectBoardTypes";
import { projectBoardPromptBudgetAssessmentMetadata, type ProjectBoardPromptBudgetAssessment } from "./projectBoardModelBudgetProfile";
import type { ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import { projectBoardProgressiveRecordsFromDraft } from "./projectBoardProgressivePlanning";
import {
  appendProjectBoardPlannerWorkspaceRecords,
  markProjectBoardPlannerWorkspaceTailRecords,
  type ProjectBoardPlannerWorkspace,
  type ProjectBoardPlannerWorkspaceTailState,
} from "./projectBoardPlannerWorkspace";
import { projectBoardPlanningDepthFromScopeContract } from "./projectBoardPlanningContract";
import type {
  ProjectBoardSynthesisDraft,
  ProjectBoardSynthesisRefinementContext,
  ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";
import {
  DEFAULT_PROJECT_BOARD_PLANNER_BATCH_LIMIT,
  DEFAULT_PROJECT_BOARD_SECTION_BATCH_CARD_LIMIT,
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
import type { AmbientProjectBoardSynthesisProgress } from "./projectBoardSynthesisProviderContracts";
import { dedupeProgressiveRecords, recordsNotAlreadySeen } from "./projectBoardSynthesisProviderSectionRecords";

export const SHALLOW_PROJECT_BOARD_MAX_BATCHES = 1;
export const SHALLOW_PROJECT_BOARD_MAX_CARDS = 2;

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
