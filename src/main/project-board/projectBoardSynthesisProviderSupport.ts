import type { ThinkingLevel } from "@mariozechner/pi-ai";
import { normalizeAmbientModelId } from "../../shared/ambientModels";
import type {
  ProjectBoardPlanningDepthAssessment,
  ProjectBoardPlanningDepthLevel,
  ProjectBoardPmReviewReport,
  ProjectBoardRenderedCardLedgerEntry,
  ProjectBoardScopeContract,
  ProjectBoardScopeFeature,
} from "../../shared/projectBoardTypes";
import { readAmbientEventStreamText } from "./projectBoardAmbientFacade";
import {
  projectBoardModelBudgetProfile,
  projectBoardModelBudgetProfileMetadata,
  projectBoardPromptBudgetAssessment,
  projectBoardPromptBudgetAssessmentMetadata,
  ProjectBoardModelBudgetProfile,
  ProjectBoardPromptBudgetAssessment,
} from "./projectBoardModelBudgetProfile";
import { stableBoardArtifactId, validateProposalJsonlRecordArtifact, ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";
import {
  extractProjectBoardProposalJsonlRecordsFromText,
  extractProjectBoardProposalJsonlRecordsWithDiagnostics,
  projectBoardSynthesisDraftFromProgressiveRecords,
  projectBoardProgressiveRecordsFromDraft,
} from "./projectBoardProgressivePlanning";
import { ProjectBoardPlanningSection } from "./projectBoardSectionedPlanning";
import {
  appendProjectBoardPlannerWorkspaceRecords,
  markProjectBoardPlannerWorkspaceTailRecords,
  ProjectBoardPlannerWorkspace,
  ProjectBoardPlannerWorkspaceTailState,
} from "./projectBoardPlannerWorkspace";
import {
  mergeProjectBoardScopeContracts,
  projectBoardPlanningDepthFromScopeContract,
  projectBoardScopeContractFromTexts,
  ProjectBoardPlanningOperation,
} from "./projectBoardPlanningContract";
import { buildProjectBoardRenderedCardLedger } from "./projectBoardRenderedCardLedger";
import { projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import { projectBoardSourceIncludedInSynthesis } from "./projectBoardSourceIdentity";
import {
  normalizeProjectBoardSynthesisDraft,
  assertProjectBoardCardTitleQuality,
  projectBoardDuplicateClarificationQuestionViolations,
  projectBoardSettledClarificationReopenViolations,
  projectBoardScopeContractTexts,
  ProjectBoardCardTitleQualityValidationError,
  isAdditiveProjectBoardRefinement,
  ProjectBoardDuplicateClarificationQuestionViolation,
  ProjectBoardClarificationQuestionCandidate,
  ProjectBoardSettledClarificationReopenViolation,
  ProjectBoardSynthesisDraft,
  ProjectBoardSynthesisRefinementContext,
  ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";
import { AmbientStreamFailureError, isRetryableAmbientProviderError, AmbientRetryPolicy } from "./projectBoardAmbientFacade";
import { callWorkflowPiText } from "./projectBoardWorkflowFacade";
import {
  DEFAULT_PROJECT_BOARD_PLANNER_BATCH_LIMIT,
  DEFAULT_PROJECT_BOARD_SECTION_BATCH_CARD_LIMIT,
  errorMessage,
  parseProjectBoardSynthesisJson,
  sectionIdForRecord,
  synthesisOperationFromRefinement,
  PlannerBatchStatus,
  ProjectBoardPlannerLedgerCompaction,
  ProjectBoardPlannerLedgerCompactionTelemetry,
  ProjectBoardSectionedContextCompactionReason,
} from "./projectBoardSynthesisPlannerPrompts";

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
export const PROJECT_BOARD_SECTION_SEMANTIC_IDLE_ERROR_CODE = "section_semantic_idle_timeout";
export const PROJECT_BOARD_SECTION_RETRY_LIMIT = 2;

export type ProjectBoardSynthesisReasoningEffort = "xhigh" | "high" | "medium" | "low" | "minimal" | "none";

export interface ProjectBoardSynthesisReasoningConfig {
  effort?: ProjectBoardSynthesisReasoningEffort;
  max_tokens?: number;
  exclude?: boolean;
  enabled?: boolean;
}

export type ProjectBoardSynthesisReasoning = false | ProjectBoardSynthesisReasoningConfig;

export interface PlannerLastValidRecord {
  recordType: ProposalJsonlRecordArtifact["type"];
  recordId: string;
  recordIndex: number;
}

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

export class ProjectBoardSectionNoRecordsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectBoardSectionNoRecordsError";
  }
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

export function buildProjectBoardSectionRetryPrompt(input: {
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

export class ProjectBoardSettledClarificationValidationError extends Error {
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

export class ProjectBoardDuplicateClarificationQuestionValidationError extends Error {
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

export function assertValidProjectBoardGeneratedDraftTitles(draft: ProjectBoardSynthesisDraft, context: Record<string, unknown>): void {
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

export function assertValidProjectBoardGeneratedRecordTitles(
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

export function assertValidClarificationQuestionDraft(
  draft: ProjectBoardSynthesisDraft,
  refinement: ProjectBoardSynthesisRefinementContext | undefined,
  context: Record<string, unknown>,
): void {
  assertValidClarificationQuestionCandidates(refinement, projectBoardClarificationQuestionCandidatesFromDraft(draft), context);
}

export function assertValidClarificationQuestionRecords(
  records: ProposalJsonlRecordArtifact[],
  refinement: ProjectBoardSynthesisRefinementContext | undefined,
  context: Record<string, unknown>,
): void {
  assertValidClarificationQuestionCandidates(refinement, projectBoardClarificationQuestionCandidatesFromRecords(records), context);
}

export function assertValidClarificationQuestionCandidates(
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

export function projectBoardClarificationQuestionCandidatesFromDraft(draft: ProjectBoardSynthesisDraft) {
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

export function projectBoardClarificationQuestionCandidatesFromRecords(records: ProposalJsonlRecordArtifact[]) {
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

export function dedupeClarificationQuestionCandidates(
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

export function dedupeMirroredClarificationQuestionCandidates(
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

export function settledClarificationValidationMetadata(error: unknown): Record<string, unknown> {
  if (!(error instanceof ProjectBoardSettledClarificationValidationError)) return {};
  return {
    failureKind: "settled_clarification_reopened",
    settledClarificationViolationCount: error.violations.length,
    settledClarificationViolations: error.violations.slice(0, 12),
    settledClarificationValidationContext: error.context,
  };
}

export function duplicateClarificationQuestionValidationMetadata(error: unknown): Record<string, unknown> {
  if (!(error instanceof ProjectBoardDuplicateClarificationQuestionValidationError)) return {};
  return {
    failureKind: "duplicate_canonical_questions",
    duplicateClarificationQuestionCount: error.violations.length,
    duplicateClarificationQuestionViolations: error.violations.slice(0, 12),
    duplicateClarificationValidationContext: error.context,
  };
}

export function cardTitleQualityValidationMetadata(error: unknown): Record<string, unknown> {
  if (!(error instanceof ProjectBoardCardTitleQualityValidationError)) return {};
  return {
    failureKind: "implementation_detail_card_titles",
    cardTitleQualityViolationCount: error.violations.length,
    cardTitleQualityViolations: error.violations.slice(0, 12),
    cardTitleQualityValidationContext: error.context,
  };
}

export function limitPlannerBatchCandidateCardRecords(
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
          status:
            record.status === "covered" && record.cardIds.some((cardId) => omittedCardIds.includes(cardId)) ? "partial" : record.status,
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

export function attachPlannerRecordSourceSnapshots(
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

export interface PlannerBatchRenderedDuplicateDiagnostic {
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

export function filterPlannerBatchRenderedCardDuplicates(
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
    if (
      record.type === "dependency_edge" &&
      (droppedCardIds.has(normalizeExactText(record.fromCardId)) || droppedCardIds.has(normalizeExactText(record.toCardId)))
    ) {
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

export function renderedCardDuplicateMatch(
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

export function plannerBatchStatusFromResponse(responseText: string, records: ProposalJsonlRecordArtifact[]): PlannerBatchStatus {
  const parsed = safeParsePlannerBatchObject(responseText);
  const status =
    typeof parsed?.plannerStatus === "string" ? parsed.plannerStatus : typeof parsed?.status === "string" ? parsed.status : undefined;
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
  if (records.some((record) => record.type === "question") && !records.some((record) => record.type === "candidate_card"))
    return "needs_user_decision";
  return "continue";
}

export function safeParsePlannerBatchObject(responseText: string): Record<string, unknown> | undefined {
  try {
    const parsed = parseProjectBoardSynthesisJson(responseText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function isPlannerBatchStatus(value: unknown): value is PlannerBatchStatus {
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

export function previewProjectBoardPlannerResponse(responseText: string): string {
  return responseText.replace(/\s+/g, " ").trim().slice(0, 500);
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

export function normalizeSectionProgressiveRecords(
  responseText: string,
  section: ProjectBoardPlanningSection,
): ProposalJsonlRecordArtifact[] {
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

export function limitSectionCandidateCardRecords(
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
          status:
            record.status === "covered" && record.cardIds.some((cardId) => omittedCardIds.includes(cardId)) ? "partial" : record.status,
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

export function retryableSectionResumeRecords(records: ProposalJsonlRecordArtifact[]): ProposalJsonlRecordArtifact[] {
  const deduped = dedupeProgressiveRecords(records);
  const retryableSections = retryableSectionKeysFromRecords(deduped);
  if (retryableSections.sectionIds.size === 0 && retryableSections.ranges.size === 0) return deduped;
  return deduped.filter((record) => !isRetryableSectionArtifact(record, retryableSections));
}

export function completedSectionIdsFromRecords(records: ProposalJsonlRecordArtifact[]): Set<string> {
  const retryableSections = retryableSectionKeysFromRecords(records);
  const completed = new Set<string>();
  for (const record of records) {
    if (record.type !== "progress" || record.stage !== "section_succeeded") continue;
    const sectionId = record.metadata.sectionId;
    if (typeof sectionId === "string" && sectionId.trim() && !retryableSections.sectionIds.has(sectionId.trim()))
      completed.add(sectionId.trim());
  }
  return completed;
}

export function retryableSectionKeysFromRecords(records: ProposalJsonlRecordArtifact[]): { sectionIds: Set<string>; ranges: Set<string> } {
  const sectionIds = new Set<string>();
  const ranges = new Set<string>();
  for (const record of records) {
    const sectionId = sectionIdForRecord(record);
    const rangeKey = sectionRangeKeyForRecord(record);
    const retryable =
      (record.type === "progress" && record.stage === "section_failed") ||
      (record.type === "error" &&
        ["section_planning_failed", "section_no_records", PROJECT_BOARD_SECTION_SEMANTIC_IDLE_ERROR_CODE].includes(record.code));
    if (!retryable) continue;
    if (sectionId) sectionIds.add(sectionId);
    if (rangeKey) ranges.add(rangeKey);
  }
  return { sectionIds, ranges };
}

export function isRetryableSectionArtifact(
  record: ProposalJsonlRecordArtifact,
  retryableSections: { sectionIds: Set<string>; ranges: Set<string> },
): boolean {
  const sectionId = sectionIdForRecord(record);
  if (sectionId && retryableSections.sectionIds.has(sectionId)) return true;
  const rangeKey = sectionRangeKeyForRecord(record);
  if (!rangeKey || !retryableSections.ranges.has(rangeKey)) return false;
  if (record.type === "source_coverage" && record.status === "unresolved") return true;
  if (
    record.type === "error" &&
    ["section_planning_failed", "section_no_records", PROJECT_BOARD_SECTION_SEMANTIC_IDLE_ERROR_CODE].includes(record.code)
  )
    return true;
  return record.type === "progress" && ["section_failed", "section_succeeded"].includes(record.stage);
}

export function sectionRangeKeyForRecord(record: ProposalJsonlRecordArtifact): string | undefined {
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

export function sectionStatusProgressRecord(
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

export function sectionRetryProgressRecord(
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

export function sectionFailureRecords(
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

export type ProjectBoardSectionFailureKind = "semantic_idle_timeout" | "stream_idle_timeout" | "no_records" | "request_or_validation_error";

export function projectBoardSectionFailureKind(error: unknown): ProjectBoardSectionFailureKind {
  if (error instanceof ProjectBoardSectionNoRecordsError) return "no_records";
  const message = errorMessage(error).toLowerCase();
  if (message.includes("without model content") || message.includes("without planner records")) return "semantic_idle_timeout";
  if (message.includes("without streaming events") || message.includes("stalled before streaming began")) return "stream_idle_timeout";
  if (message.includes("no valid planning records")) return "no_records";
  return "request_or_validation_error";
}

export function shouldRetryProjectBoardSectionFailure(error: unknown, input: { signal?: AbortSignal }): boolean {
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

export function semanticIdleTimeoutMsFromMessage(message: string): number | undefined {
  const match = message.match(/after\s+([\d,]+)ms\s+without model content/i);
  if (!match?.[1]) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

export function dedupeProgressiveRecords(records: ProposalJsonlRecordArtifact[]): ProposalJsonlRecordArtifact[] {
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

export function recordsNotAlreadySeen(
  records: ProposalJsonlRecordArtifact[],
  existing: ProposalJsonlRecordArtifact[],
): ProposalJsonlRecordArtifact[] {
  const existingKeys = new Set(existing.map((record) => JSON.stringify(record)));
  return records.filter((record) => !existingKeys.has(JSON.stringify(record)));
}

export function wholeBoardPlanningSection(sources: ProjectBoardSynthesisSource[], projectName?: string): ProjectBoardPlanningSection {
  const included = sources.filter(projectBoardSourceIncludedInSynthesis);
  return {
    id: stableBoardArtifactId("section", [
      "whole-board",
      projectName,
      included.map((source) => source.id || source.path || source.title).join("|"),
    ]),
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

export function lastCandidateTitle(records: ProposalJsonlRecordArtifact[]): string | undefined {
  return records.filter((record) => record.type === "candidate_card").at(-1)?.title;
}

export function lastQuestion(records: ProposalJsonlRecordArtifact[]): string | undefined {
  return records.filter((record) => record.type === "question").at(-1)?.question;
}

export async function deriveProjectBoardScopeContractWithPi(input: {
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
  const deterministicScopeContract = projectBoardScopeContractFromTexts(
    projectBoardScopeContractTexts({ sources: input.sources, refinement: input.refinement }),
  );
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
      summary:
        "Ambient/Pi returned an invalid scope contract response, so planning continued with deterministic scope extracted from sources.",
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

export function buildProjectBoardScopeContractPrompt(input: {
  projectName?: string;
  sources: ProjectBoardSynthesisSource[];
  refinement?: ProjectBoardSynthesisRefinementContext;
}): string {
  const sourceBlocks = input.sources
    .filter(
      (source) =>
        projectBoardSourceIncludedInSynthesis(source) && Boolean(source.title.trim() || source.summary.trim() || source.excerpt?.trim()),
    )
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
  const answers =
    input.refinement?.answers.map((answer, index) => `${index + 1}. Q: ${answer.question}\nA: ${answer.answer}`).join("\n\n") ?? "";
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
        included: [
          "auth|accounts|analytics|sync|collaboration|notifications|backend|payments|deployment|admin_reporting only when explicitly included",
        ],
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

export function normalizeProjectBoardLlmScopeContract(value: unknown): ProjectBoardScopeContract {
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

export const LLM_SCOPE_FEATURES = new Set<ProjectBoardScopeFeature>([
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

export function normalizeLlmScopeFeatures(value: unknown): ProjectBoardScopeFeature[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ProjectBoardScopeFeature>();
  for (const item of value) {
    if (typeof item === "string" && LLM_SCOPE_FEATURES.has(item as ProjectBoardScopeFeature)) seen.add(item as ProjectBoardScopeFeature);
  }
  return [...seen];
}

export function normalizeLlmScopeStrings(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, maxLength))
    .slice(0, limit);
}

export function normalizeLlmPlanningDepth(value: unknown): ProjectBoardPlanningDepthAssessment | undefined {
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

export function isProjectBoardPlanningDepthLevel(value: string): value is ProjectBoardPlanningDepthLevel {
  return value === "shallow" || value === "standard" || value === "deep" || value === "phased";
}

export interface AdditiveDuplicateDiagnostic {
  sourceId: string;
  title: string;
  matchedSourceId?: string;
  matchedTitle?: string;
  reason: "source_id" | "title" | "intent_source_basis";
  score?: number;
  sourceBasisOverlap?: string[];
}

export interface CandidateCardFilterDiagnostic {
  sourceId: string;
  title: string;
}

export interface CandidateCardFilterResult {
  draft: ProjectBoardSynthesisDraft;
  diagnostics: CandidateCardFilterDiagnostic[];
  warningRecords: ProposalJsonlRecordArtifact[];
}

export interface ProjectBoardWorkflowDraftLimitResult {
  draft: ProjectBoardSynthesisDraft;
  omittedCardIds: string[];
  warningRecords: ProposalJsonlRecordArtifact[];
}

export function filterAdditiveDuplicateCards(
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

export function limitProjectBoardWorkflowDraft(
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

export function removeOmittedCandidateRecords(
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

export function filterProjectBoardGeneratedCards(
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

export function scopeContractFilterCountFromRecords(records: ProposalJsonlRecordArtifact[]): number {
  return records.filter(
    (record) =>
      record.type === "warning" &&
      (record.code === "scope_contract_candidate_filtered" || record.code === "scope_contract_compact_board_card_limit"),
  ).length;
}

export function additiveDuplicateWarningRecords(
  diagnostics: AdditiveDuplicateDiagnostic[],
  message: string,
): ProposalJsonlRecordArtifact[] {
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

export function removeFilteredDuplicateCandidateRecords(
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

export function additiveDuplicateMatch(
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

export function duplicateDiagnostic(
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

export const INTENT_STOP_WORDS = new Set([
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

export function normalizeExactText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function sourceBasisTokens(card: ProjectBoardSynthesisDraft["cards"][number]): Set<string> {
  return tokenSet([card.sourceId, card.sourceRefs.join(" "), card.phase ?? "", card.labels.join(" ")].join(" "));
}

export function intentTextForCard(card: ProjectBoardSynthesisDraft["cards"][number]): string {
  return [
    card.title,
    card.phase ?? "",
    card.labels.join(" "),
    card.description.slice(0, 800),
    card.acceptanceCriteria.slice(0, 4).join(" "),
  ].join(" ");
}

export function intentTokens(value: string): Set<string> {
  return tokenSet(value, INTENT_STOP_WORDS);
}

export function tokenSet(value: string, stopWords: Set<string> = new Set()): Set<string> {
  const tokens = new Set<string>();
  for (const rawToken of value.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const token = stemIntentToken(rawToken);
    if (token.length <= 2 || stopWords.has(token)) continue;
    tokens.add(token);
  }
  return tokens;
}

export function stemIntentToken(token: string): string {
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const overlap = intersection(a, b).size;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : overlap / union;
}

export function containmentScore(a: Set<string>, b: Set<string>): number {
  const denominator = Math.min(a.size, b.size);
  if (denominator === 0) return 0;
  return intersection(a, b).size / denominator;
}

export function intersection(a: Set<string>, b: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const value of a) if (b.has(value)) result.add(value);
  return result;
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

export function isAdditiveRefinement(refinement: ProjectBoardSynthesisRefinementContext): boolean {
  return isAdditiveProjectBoardRefinement(refinement);
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
