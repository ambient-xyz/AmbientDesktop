import { projectBoardKickoffDefaultContextFingerprint } from "../../shared/projectBoardKickoffDefaults";
import type {
  ProjectBoardCard,
  ProjectBoardCardExecutionSessionPolicy,
  ProjectBoardCardPendingPiUpdate,
  ProjectBoardCardProofReview,
  ProjectBoardCardProofReviewStatus,
  ProjectBoardCardSourceKind,
  ProjectBoardCardSplitOutcome,
  ProjectBoardCardSplitOutcomeStatus,
  ProjectBoardCardStatus,
  ProjectBoardCharter,
  ProjectBoardCharterProjectSummary,
  ProjectBoardCharterStatus,
  ProjectBoardEvent,
  ProjectBoardExecutionArtifact,
  ProjectBoardPlanningSnapshot,
  ProjectBoardProofFollowUpSuggestion,
  ProjectBoardQuestion,
  ProjectBoardSource,
  ProjectBoardStatus,
  ProjectBoardSummary,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisProposalCard,
  ProjectBoardSynthesisProposalStatus,
  ProjectBoardSynthesisRun,
  ProjectBoardSynthesisRunEvent,
  ProjectBoardSynthesisRunProgressiveRecord,
  ProjectBoardSynthesisRunStage,
  ProjectBoardSynthesisRunStatus,
} from "../../shared/projectBoardTypes";
import type { OrchestrationTask } from "../../shared/workflowTypes";
import { normalizeCardTextList, normalizeUnknownProjectBoardTestPlan } from "./projectBoardCardNormalizationMappers";
import { parseProjectBoardCardRunFeedback } from "./projectBoardCardRunFeedbackMappers";
import {
  normalizeProjectBoardCardExecutionSessionPolicy,
  normalizeProjectBoardUiMockRole,
  normalizeTaskLabels,
} from "./projectBoardCardReferenceMappers";
import {
  normalizeProjectBoardClarificationQuestions,
  parseProjectBoardClarificationAnswers,
  parseProjectBoardClarificationDecisions,
  parseProjectBoardClarificationSuggestions,
} from "./projectBoardClarificationMappers";
import {
  parseProjectBoardCardTestPlan,
  parseProjectBoardCardTouchedFields,
  parseProjectBoardJsonArray,
  parseProjectBoardJsonObject,
  parseProjectBoardStringList,
} from "./projectBoardJsonMappers";
import {
  normalizeProjectBoardPlanningSnapshot,
  normalizeProjectBoardSynthesisRunEvent,
  normalizeProjectBoardSynthesisRunProgressiveRecord,
  summarizeProjectBoardSynthesisRunProgressiveRecords,
} from "./projectBoardPlanningSnapshotMappers";
import type { ProjectBoardSourceStoreRow } from "./projectBoardSourceMappers";
import {
  normalizeProjectBoardObjectiveProvenance,
  normalizeProjectBoardSynthesisProposalAnswer,
  normalizeProjectBoardSynthesisProposalCard,
  projectBoardMaterialPendingPiUpdateForRow,
  type ProjectBoardCardPendingPiUpdateStoreRow,
} from "./projectBoardSynthesisCardMappers";
import { projectBoardCardStatusWithProofReview, projectBoardStatusForTask } from "./projectBoardTaskPlanningMappers";
import { normalizeProjectBoardPmReviewReport, projectBoardSourceKey } from "./projectStoreProjectBoardFacade";

export interface ProjectBoardStoreRow {
  id: string;
  project_path: string;
  source_thread_id: string | null;
  status: ProjectBoardStatus;
  title: string;
  summary: string;
  charter_id: string | null;
  active_draft_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectBoardCardStoreRow extends ProjectBoardCardPendingPiUpdateStoreRow {
  id: string;
  board_id: string;
  status: ProjectBoardCardStatus;
  source_kind: ProjectBoardCardSourceKind;
  source_id: string;
  source_thread_id: string | null;
  source_message_id: string | null;
  orchestration_task_id: string | null;
  execution_thread_id: string | null;
  execution_session_policy: ProjectBoardCardExecutionSessionPolicy | null;
  proof_review_json: string | null;
  split_outcome_json: string | null;
  objective_provenance_json: string | null;
  run_feedback_json: string | null;
  user_touched_fields_json: string | null;
  user_touched_at: string | null;
  pending_pi_update_json: string | null;
}

export interface ProjectBoardCharterStoreRow {
  id: string;
  board_id: string;
  version: number;
  status: ProjectBoardCharterStatus;
  goal: string;
  current_state: string;
  target_user: string;
  non_goals_json: string;
  quality_bar: string;
  test_policy_json: string;
  decision_policy_json: string;
  dependency_policy_json: string;
  budget_policy_json: string;
  source_policy_json: string;
  markdown: string;
  project_summary_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectBoardQuestionStoreRow {
  id: string;
  board_id: string;
  question_order: number;
  question: string;
  required: number;
  answer: string | null;
  answered_at: string | null;
  suggested_answer: string | null;
  suggestion_rationale: string | null;
  suggestion_confidence: string | null;
  suggestion_source_ids_json: string | null;
  suggestion_context_fingerprint: string | null;
  suggestion_generated_at: string | null;
  suggestion_model: string | null;
  suggestion_provider_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectBoardSynthesisProposalStoreRow {
  id: string;
  board_id: string;
  status: ProjectBoardSynthesisProposalStatus;
  summary: string;
  goal: string;
  current_state: string;
  target_user: string;
  quality_bar: string;
  assumptions_json: string;
  questions_json: string;
  answers_json: string;
  source_notes_json: string;
  cards_json: string;
  review_report_json: string | null;
  model: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
}

export interface ProjectBoardSynthesisRunStoreRow {
  id: string;
  board_id: string;
  proposal_id: string | null;
  retry_of_run_id: string | null;
  status: ProjectBoardSynthesisRunStatus;
  stage: ProjectBoardSynthesisRunStage;
  model: string | null;
  source_count: number;
  included_source_count: number;
  source_char_count: number;
  prompt_char_count: number | null;
  response_char_count: number | null;
  card_count: number | null;
  question_count: number | null;
  warning_count: number;
  error: string | null;
  events_json: string;
  progressive_records_json: string | null;
  planning_snapshots_json: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

export type ProjectBoardProofFollowUpSuggestionNormalizer = (value: unknown) => ProjectBoardProofFollowUpSuggestion | undefined;

export function normalizeProjectBoardProofFollowUpSuggestion(value: unknown): ProjectBoardProofFollowUpSuggestion | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const title = typeof record.title === "string" && record.title.trim() ? record.title.trim().slice(0, 180) : undefined;
  const description =
    typeof record.description === "string" && record.description.trim() ? record.description.trim().slice(0, 4_000) : undefined;
  const acceptanceCriteria = Array.isArray(record.acceptanceCriteria)
    ? normalizeCardTextList(
        record.acceptanceCriteria.map((entry) => String(entry)),
        30,
      )
    : [];
  const testPlan =
    record.testPlan && typeof record.testPlan === "object" && !Array.isArray(record.testPlan)
      ? normalizeUnknownProjectBoardTestPlan(record.testPlan as Record<string, unknown>)
      : undefined;
  const hasTestPlan = Boolean(
    testPlan && (testPlan.unit.length || testPlan.integration.length || testPlan.visual.length || testPlan.manual.length),
  );
  const clarificationQuestions = Array.isArray(record.clarificationQuestions)
    ? normalizeProjectBoardClarificationQuestions(
        record.clarificationQuestions.map((entry) => String(entry)),
        8,
      )
    : [];
  const labels = Array.isArray(record.labels) ? normalizeTaskLabels(record.labels.map((entry) => String(entry))).slice(0, 12) : [];
  const rationale = typeof record.rationale === "string" && record.rationale.trim() ? record.rationale.trim().slice(0, 1_000) : undefined;
  const hasScope = Boolean(title || description || acceptanceCriteria.length || hasTestPlan || clarificationQuestions.length);
  if (!hasScope) return undefined;
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(acceptanceCriteria.length ? { acceptanceCriteria } : {}),
    ...(hasTestPlan ? { testPlan } : {}),
    ...(clarificationQuestions.length ? { clarificationQuestions } : {}),
    ...(labels.length ? { labels } : {}),
    ...(rationale ? { rationale } : {}),
  };
}

export function mapProjectBoardSourceRow(row: ProjectBoardSourceStoreRow): ProjectBoardSource {
  return {
    id: row.id,
    boardId: row.board_id,
    kind: row.source_kind,
    sourceKey:
      row.source_key ??
      projectBoardSourceKey({
        kind: row.source_kind,
        title: row.title,
        summary: row.summary,
        excerpt: row.excerpt ?? undefined,
        path: row.path ?? undefined,
        threadId: row.thread_id ?? undefined,
        artifactId: row.artifact_id ?? undefined,
        messageId: row.message_id ?? undefined,
      }),
    contentHash: row.content_hash ?? undefined,
    changeState: row.change_state ?? undefined,
    title: row.title,
    summary: row.summary,
    excerpt: row.excerpt ?? undefined,
    path: row.path ?? undefined,
    threadId: row.thread_id ?? undefined,
    artifactId: row.artifact_id ?? undefined,
    messageId: row.message_id ?? undefined,
    byteSize: row.byte_size ?? undefined,
    mtime: row.mtime ?? undefined,
    classificationReason: row.classification_reason ?? undefined,
    classifiedBy: row.classified_by ?? undefined,
    classificationConfidence: row.classification_confidence ?? undefined,
    authorityRole: row.authority_role ?? undefined,
    includeInSynthesis: row.include_in_synthesis === null ? undefined : row.include_in_synthesis === 1,
    relevance: row.relevance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProjectBoardCharterRow(row: ProjectBoardCharterStoreRow): ProjectBoardCharter {
  const projectSummary = row.project_summary_json
    ? parseProjectBoardJsonObject<ProjectBoardCharterProjectSummary | undefined>(row.project_summary_json, undefined)
    : undefined;
  return {
    id: row.id,
    boardId: row.board_id,
    version: row.version,
    status: row.status,
    goal: row.goal,
    currentState: row.current_state,
    targetUser: row.target_user,
    nonGoals: parseProjectBoardStringList(row.non_goals_json),
    qualityBar: row.quality_bar,
    testPolicy: parseProjectBoardJsonObject<Record<string, unknown>>(row.test_policy_json, {}),
    decisionPolicy: parseProjectBoardJsonObject<Record<string, unknown>>(row.decision_policy_json, {}),
    dependencyPolicy: parseProjectBoardJsonObject<Record<string, unknown>>(row.dependency_policy_json, {}),
    budgetPolicy: parseProjectBoardJsonObject<Record<string, unknown>>(row.budget_policy_json, {}),
    sourcePolicy: parseProjectBoardJsonObject<Record<string, unknown>>(row.source_policy_json, {}),
    markdown: row.markdown,
    ...(projectSummary ? { projectSummary } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProjectBoardQuestionRow(row: ProjectBoardQuestionStoreRow, sources?: ProjectBoardSource[]): ProjectBoardQuestion {
  const contextFingerprint = row.suggestion_context_fingerprint ?? undefined;
  const currentFingerprint =
    contextFingerprint && sources ? projectBoardKickoffDefaultContextFingerprint({ question: row.question, sources }) : undefined;
  const confidence =
    row.suggestion_confidence === "high" || row.suggestion_confidence === "medium" || row.suggestion_confidence === "low"
      ? row.suggestion_confidence
      : undefined;
  return {
    id: row.id,
    boardId: row.board_id,
    question: row.question,
    required: row.required === 1,
    answer: row.answer ?? undefined,
    answeredAt: row.answered_at ?? undefined,
    suggestedAnswer: row.suggested_answer ?? undefined,
    suggestedAnswerRationale: row.suggestion_rationale ?? undefined,
    suggestedAnswerConfidence: confidence,
    suggestedAnswerSourceIds: parseProjectBoardStringList(row.suggestion_source_ids_json ?? "[]"),
    suggestedAnswerContextFingerprint: contextFingerprint,
    suggestedAnswerGeneratedAt: row.suggestion_generated_at ?? undefined,
    suggestedAnswerModel: row.suggestion_model ?? undefined,
    suggestedAnswerProviderError: row.suggestion_provider_error ?? undefined,
    suggestedAnswerStale: Boolean(contextFingerprint && currentFingerprint && contextFingerprint !== currentFingerprint),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProjectBoardSynthesisProposalRow(row: ProjectBoardSynthesisProposalStoreRow): ProjectBoardSynthesisProposal {
  return {
    id: row.id,
    boardId: row.board_id,
    status: row.status,
    summary: row.summary,
    goal: row.goal,
    currentState: row.current_state,
    targetUser: row.target_user,
    qualityBar: row.quality_bar,
    assumptions: parseProjectBoardStringList(row.assumptions_json),
    questions: parseProjectBoardStringList(row.questions_json),
    answers: parseProjectBoardJsonArray(row.answers_json).flatMap((answer) =>
      normalizeProjectBoardSynthesisProposalAnswer(answer, row.updated_at),
    ),
    sourceNotes: parseProjectBoardStringList(row.source_notes_json),
    cards: parseProjectBoardJsonArray<ProjectBoardSynthesisProposalCard>(row.cards_json).map(normalizeProjectBoardSynthesisProposalCard),
    reviewReport: row.review_report_json
      ? normalizeProjectBoardPmReviewReportForStore(parseProjectBoardJsonObject<unknown>(row.review_report_json, undefined))
      : undefined,
    model: row.model ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    appliedAt: row.applied_at ?? undefined,
  };
}

export function mapProjectBoardSynthesisRunRow(row: ProjectBoardSynthesisRunStoreRow): ProjectBoardSynthesisRun {
  const progressiveRecords = parseProjectBoardJsonArray<ProjectBoardSynthesisRunProgressiveRecord>(
    row.progressive_records_json ?? "[]",
  ).flatMap(normalizeProjectBoardSynthesisRunProgressiveRecord);
  const progressiveSummary = summarizeProjectBoardSynthesisRunProgressiveRecords(progressiveRecords);
  const planningSnapshots = parseProjectBoardJsonArray<ProjectBoardPlanningSnapshot>(row.planning_snapshots_json ?? "[]").flatMap(
    (snapshot) => normalizeProjectBoardPlanningSnapshot(snapshot, row.updated_at),
  );
  return {
    id: row.id,
    boardId: row.board_id,
    proposalId: row.proposal_id ?? undefined,
    retryOfRunId: row.retry_of_run_id ?? undefined,
    status: row.status,
    stage: row.stage,
    model: row.model ?? undefined,
    sourceCount: row.source_count,
    includedSourceCount: row.included_source_count,
    sourceCharCount: row.source_char_count,
    promptCharCount: row.prompt_char_count ?? undefined,
    responseCharCount: row.response_char_count ?? undefined,
    cardCount: row.card_count ?? undefined,
    questionCount: row.question_count ?? undefined,
    warningCount: row.warning_count,
    error: row.error ?? undefined,
    ...(progressiveRecords.length
      ? {
          progressiveRecordCount: progressiveRecords.length,
          progressiveSummary,
          progressiveRecords,
        }
      : {}),
    ...(planningSnapshots.length ? { planningSnapshots } : {}),
    events: parseProjectBoardJsonArray<ProjectBoardSynthesisRunEvent>(row.events_json).flatMap((event) =>
      normalizeProjectBoardSynthesisRunEvent(event, row.updated_at),
    ),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export function mapProjectBoardRow(input: {
  row: ProjectBoardStoreRow;
  charter?: ProjectBoardCharter;
  cards: ProjectBoardCard[];
  sources: ProjectBoardSource[];
  questions: ProjectBoardQuestion[];
  proposals: ProjectBoardSynthesisProposal[];
  synthesisRuns: ProjectBoardSynthesisRun[];
  executionArtifacts: ProjectBoardExecutionArtifact[];
  events: ProjectBoardEvent[];
  claims: NonNullable<ProjectBoardSummary["claims"]>;
}): ProjectBoardSummary {
  const { row } = input;
  return {
    id: row.id,
    projectPath: row.project_path,
    sourceThreadId: row.source_thread_id ?? undefined,
    status: row.status,
    title: row.title,
    summary: row.summary,
    charterId: row.charter_id ?? undefined,
    charter: input.charter,
    activeDraftId: row.active_draft_id ?? undefined,
    cards: input.cards,
    sources: input.sources,
    questions: input.questions,
    proposals: input.proposals,
    synthesisRuns: input.synthesisRuns,
    executionArtifacts: input.executionArtifacts,
    events: input.events,
    claims: input.claims,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProjectBoardCardRow(row: ProjectBoardCardStoreRow, tasks: OrchestrationTask[] = []): ProjectBoardCard {
  const linkedTask = row.orchestration_task_id ? tasks.find((task) => task.id === row.orchestration_task_id) : undefined;
  const proofReview = row.proof_review_json
    ? mapProjectBoardCardProofReview(row.proof_review_json, normalizeProjectBoardProofFollowUpSuggestion)
    : undefined;
  const splitOutcome = row.split_outcome_json ? mapProjectBoardCardSplitOutcome(row.split_outcome_json) : undefined;
  const projectedStatus = linkedTask ? projectBoardStatusForTask(linkedTask, tasks) : row.status;
  const userTouchedFields = parseProjectBoardCardTouchedFields(row.user_touched_fields_json);
  const rawPendingPiUpdate = row.pending_pi_update_json
    ? parseProjectBoardJsonObject<ProjectBoardCardPendingPiUpdate | undefined>(row.pending_pi_update_json, undefined)
    : undefined;
  const pendingPiUpdate = rawPendingPiUpdate ? projectBoardMaterialPendingPiUpdateForRow(row, rawPendingPiUpdate) : undefined;
  return {
    id: row.id,
    boardId: row.board_id,
    title: row.title,
    description: row.description,
    status: projectBoardCardStatusWithProofReview(projectedStatus, proofReview),
    candidateStatus: row.candidate_status ?? "ready_to_create",
    priority: row.priority ?? undefined,
    phase: row.phase ?? undefined,
    labels: parseProjectBoardStringList(row.labels_json),
    blockedBy: parseProjectBoardStringList(row.blocked_by_json),
    acceptanceCriteria: parseProjectBoardStringList(row.acceptance_criteria_json),
    testPlan: parseProjectBoardCardTestPlan(row.test_plan_json),
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    sourceRefs: parseProjectBoardStringList(row.source_refs_json),
    clarificationQuestions: parseProjectBoardStringList(row.clarification_questions_json),
    clarificationSuggestions: parseProjectBoardClarificationSuggestions(row.clarification_suggestions_json),
    clarificationAnswers: parseProjectBoardClarificationAnswers(row.clarification_answers_json),
    clarificationDecisions: parseProjectBoardClarificationDecisions(row.clarification_decisions_json, {
      clarificationQuestions: parseProjectBoardStringList(row.clarification_questions_json),
      clarificationSuggestions: parseProjectBoardClarificationSuggestions(row.clarification_suggestions_json),
      clarificationAnswers: parseProjectBoardClarificationAnswers(row.clarification_answers_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
    runFeedback: parseProjectBoardCardRunFeedback(row.run_feedback_json),
    objectiveProvenance: normalizeProjectBoardObjectiveProvenance(
      row.objective_provenance_json ? parseProjectBoardJsonObject<unknown>(row.objective_provenance_json, undefined) : undefined,
    ),
    uiMockRole: normalizeProjectBoardUiMockRole(row.ui_mock_role),
    requiresUiMockApproval: Boolean(row.requires_ui_mock_approval),
    sourceThreadId: row.source_thread_id ?? undefined,
    sourceMessageId: row.source_message_id ?? undefined,
    orchestrationTaskId: row.orchestration_task_id ?? undefined,
    executionThreadId: row.execution_thread_id ?? undefined,
    executionSessionPolicy: normalizeProjectBoardCardExecutionSessionPolicy(row.execution_session_policy),
    proofReview,
    splitOutcome,
    userTouchedFields: userTouchedFields.length > 0 ? userTouchedFields : undefined,
    userTouchedAt: row.user_touched_at ?? undefined,
    pendingPiUpdate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProjectBoardCardSplitOutcome(value: string): ProjectBoardCardSplitOutcome | undefined {
  const outcome = parseProjectBoardJsonObject<ProjectBoardCardSplitOutcome | undefined>(value, undefined);
  if (!outcome || typeof outcome !== "object") return undefined;
  const statuses = new Set<ProjectBoardCardSplitOutcomeStatus>(["proposed", "approved", "rejected", "replaced", "done_via_split"]);
  if (!statuses.has(outcome.status)) return undefined;
  const source =
    outcome.source === "runtime_budget" || outcome.source === "proof_review" || outcome.source === "manual" ? outcome.source : "manual";
  return {
    status: outcome.status,
    source,
    sourceRunId: typeof outcome.sourceRunId === "string" ? outcome.sourceRunId : "",
    reason: typeof outcome.reason === "string" ? outcome.reason : "",
    partialProofSummary: typeof outcome.partialProofSummary === "string" ? outcome.partialProofSummary : "",
    completedCriteria: Array.isArray(outcome.completedCriteria)
      ? outcome.completedCriteria.filter((item): item is string => typeof item === "string")
      : [],
    remainingCriteria: Array.isArray(outcome.remainingCriteria)
      ? outcome.remainingCriteria.filter((item): item is string => typeof item === "string")
      : [],
    childCardIds: Array.isArray(outcome.childCardIds)
      ? outcome.childCardIds.filter((item): item is string => typeof item === "string")
      : [],
    maxRuntimeMs: typeof outcome.maxRuntimeMs === "number" && Number.isFinite(outcome.maxRuntimeMs) ? outcome.maxRuntimeMs : undefined,
    elapsedMs: typeof outcome.elapsedMs === "number" && Number.isFinite(outcome.elapsedMs) ? outcome.elapsedMs : undefined,
    createdAt: typeof outcome.createdAt === "string" ? outcome.createdAt : "",
    updatedAt: typeof outcome.updatedAt === "string" ? outcome.updatedAt : "",
  };
}

export function mapProjectBoardCardProofReview(
  value: string,
  normalizeFollowUpSuggestion: ProjectBoardProofFollowUpSuggestionNormalizer = () => undefined,
): ProjectBoardCardProofReview | undefined {
  const review = parseProjectBoardJsonObject<ProjectBoardCardProofReview | undefined>(value, undefined);
  if (!review || typeof review !== "object") return undefined;
  const statuses = new Set<ProjectBoardCardProofReviewStatus>([
    "ready_for_review",
    "needs_follow_up",
    "terminally_blocked",
    "retry_recommended",
    "done",
  ]);
  if (!statuses.has(review.status)) return undefined;
  const followUpSuggestion = normalizeFollowUpSuggestion(review.followUpSuggestion);
  return {
    status: review.status,
    summary: typeof review.summary === "string" ? review.summary : "",
    satisfied: Array.isArray(review.satisfied) ? review.satisfied.filter((item): item is string => typeof item === "string") : [],
    missing: Array.isArray(review.missing) ? review.missing.filter((item): item is string => typeof item === "string") : [],
    followUpCardIds: Array.isArray(review.followUpCardIds)
      ? review.followUpCardIds.filter((item): item is string => typeof item === "string")
      : [],
    runId: typeof review.runId === "string" ? review.runId : "",
    reviewedAt: typeof review.reviewedAt === "string" ? review.reviewedAt : "",
    reviewer: review.reviewer === "ambient_pi" || review.reviewer === "deterministic" ? review.reviewer : undefined,
    model: typeof review.model === "string" ? review.model : undefined,
    confidence: typeof review.confidence === "number" && Number.isFinite(review.confidence) ? review.confidence : undefined,
    evidenceQuality:
      review.evidenceQuality === "strong" || review.evidenceQuality === "mixed" || review.evidenceQuality === "weak"
        ? review.evidenceQuality
        : undefined,
    recommendedAction:
      review.recommendedAction === "close" ||
      review.recommendedAction === "retry" ||
      review.recommendedAction === "follow_up" ||
      review.recommendedAction === "ask_user" ||
      review.recommendedAction === "block"
        ? review.recommendedAction
        : undefined,
    deterministicStatus: statuses.has(review.deterministicStatus as ProjectBoardCardProofReviewStatus)
      ? (review.deterministicStatus as ProjectBoardCardProofReviewStatus)
      : undefined,
    deterministicSummary: typeof review.deterministicSummary === "string" ? review.deterministicSummary : undefined,
    judgeDurationMs:
      typeof review.judgeDurationMs === "number" && Number.isFinite(review.judgeDurationMs) ? review.judgeDurationMs : undefined,
    ...(followUpSuggestion ? { followUpSuggestion } : {}),
  };
}

function normalizeProjectBoardPmReviewReportForStore(value: unknown): ProjectBoardSynthesisProposal["reviewReport"] {
  try {
    return normalizeProjectBoardPmReviewReport(value);
  } catch {
    return undefined;
  }
}
