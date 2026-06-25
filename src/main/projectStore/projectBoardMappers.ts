import { createHash, randomUUID } from "node:crypto";

import { projectBoardProofPolicyRequiresProofSpec } from "../../shared/projectBoardProofImpact";
import type { OrchestrationTask } from "../../shared/workflowTypes";
import type {
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardProofReview,
  ProjectBoardCardProofReviewStatus,
  ProjectBoardCardClarificationDecision,
  ProjectBoardCardPendingPiUpdate,
  ProjectBoardCardSourceKind,
  ProjectBoardCardSplitOutcome,
  ProjectBoardCardSplitOutcomeStatus,
  ProjectBoardCardExecutionSessionPolicy,
  ProjectBoardCardStatus,
  ProjectBoardCardRunFeedback,
  ProjectBoardCardTestPlan,
  ProjectBoardCardTouchedField,
  ProjectBoardCharter,
  ProjectBoardCharterProjectSummary,
  ProjectBoardCharterStatus,
  ProjectBoardEvent,
  ProjectBoardEventKind,
  ProjectBoardExecutionArtifact,
  ProjectBoardExecutionArtifactHandoff,
  ProjectBoardExecutionArtifactProof,
  ProjectBoardPlanningSnapshot,
  ProjectBoardPlanningSnapshotCard,
  ProjectBoardPlanningSnapshotKind,
  ProjectBoardPlanningSnapshotSourceHash,
  ProjectBoardPlanningDepthAssessment,
  ProjectBoardProofFollowUpSuggestion,
  ProjectBoardQuestion,
  ProjectBoardScopeContract,
  ProjectBoardScopeFeature,
  ProjectBoardSource,
  ProjectBoardSourceChangeState,
  ProjectBoardSourceKind,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisProposalAnswer,
  ProjectBoardSynthesisProposalCard,
  ProjectBoardSynthesisProposalCardReviewStatus,
  ProjectBoardSynthesisProposalStatus,
  ProjectBoardSummary,
  ProjectBoardSynthesisRun,
  ProjectBoardSynthesisRunEvent,
  ProjectBoardSynthesisRunProgressiveRecord,
  ProjectBoardSynthesisRunProgressiveSummary,
  ProjectBoardSynthesisRunStage,
  ProjectBoardSynthesisRunStatus,
  ProjectBoardStatus,
} from "../../shared/projectBoardTypes";

export type { OrchestrationTask } from "../../shared/workflowTypes";
export type {
  ProjectBoardCard,
  ProjectBoardCharter,
  ProjectBoardEvent,
  ProjectBoardExecutionArtifact,
  ProjectBoardQuestion,
  ProjectBoardSource,
  ProjectBoardSummary,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisRun,
} from "../../shared/projectBoardTypes";

import { projectBoardKickoffDefaultContextFingerprint } from "../../shared/projectBoardKickoffDefaults";
import { projectBoardQuestionsAreNearDuplicates } from "../../shared/projectBoardQuestionDedupe";
import {
  normalizeProjectBoardPmReviewReport,
  type ProjectBoardSynthesisCardInput,
  type ProjectBoardSynthesisDraft,
} from "./projectStoreProjectBoardFacade";
import { buildProjectBoardRenderedCardLedger } from "./projectStoreProjectBoardFacade";
import type {
  BoardEventArtifact,
  ProposalManifestArtifact,
  RunHandoffArtifact,
  RunManifestArtifact,
  RunProofArtifact,
} from "./projectStoreProjectBoardFacade";
import { projectBoardSourceKey } from "./projectStoreProjectBoardFacade";
import type { ProjectBoardSourceStoreRow } from "./projectBoardSourceMappers";
import {
  normalizeCardTextList,
  normalizeProjectBoardCardTestPlan,
  normalizeUnknownProjectBoardTestPlan,
} from "./projectBoardCardNormalizationMappers";
import { normalizeProjectBoardCardRunFeedback, parseProjectBoardCardRunFeedback } from "./projectBoardCardRunFeedbackMappers";
import {
  normalizeProjectBoardCardExecutionSessionPolicy,
  normalizeProjectBoardUiMockRole,
  normalizeTaskLabels,
  normalizeTaskReferences,
  projectBoardCardMatchesRef,
  projectBoardRequiresUiMockApprovalForSynthesisCard,
  projectBoardUiMockRoleForSynthesisCard,
} from "./projectBoardCardReferenceMappers";
import {
  normalizeProjectBoardClarificationAnswers,
  normalizeProjectBoardClarificationQuestions,
  normalizeProjectBoardClarificationSuggestions,
  normalizeProjectBoardSynthesisClarificationFields,
  parseProjectBoardClarificationAnswers,
  parseProjectBoardClarificationDecisions,
  parseProjectBoardClarificationSuggestions,
  projectBoardCandidateStatusForSynthesisUpdate,
  projectBoardUnansweredClarificationQuestions,
} from "./projectBoardClarificationMappers";
import type { ProjectBoardRunFollowUpInsertOptions } from "./projectBoardProofMappers";
import { projectBoardCardStatusWithProofReview, projectBoardStatusForTask } from "./projectBoardTaskPlanningMappers";
export * from "./projectBoardCardNormalizationMappers";
export * from "./projectBoardCardReferenceMappers";
export * from "./projectBoardCardRunFeedbackMappers";
export * from "./projectBoardClarificationMappers";
export * from "./projectBoardProofMappers";
export * from "./projectBoardSourceMappers";
export * from "./projectBoardTaskPlanningMappers";

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

export interface ProjectBoardExecutionArtifactStoreRow {
  id: string;
  board_id: string;
  card_id: string;
  status: string;
  source: string;
  agent_id: string | null;
  pi_session_id: string | null;
  workspace_branch: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  proof_json: string | null;
  handoff_json: string | null;
  created_at: string;
}

export interface ProjectBoardCardPendingPiUpdateStoreRow {
  title: string;
  description: string;
  candidate_status: ProjectBoardCardCandidateStatus;
  priority: number | null;
  phase: string | null;
  labels_json: string;
  blocked_by_json: string;
  acceptance_criteria_json: string;
  test_plan_json: string;
  source_refs_json: string | null;
  clarification_questions_json: string | null;
  clarification_suggestions_json: string | null;
  clarification_answers_json: string | null;
  clarification_decisions_json: string | null;
  ui_mock_role: string | null;
  requires_ui_mock_approval: number | null;
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

export function projectBoardClaimBlockedTaskIdsForRows(
  rows: ProjectBoardCardStoreRow[],
  claims: NonNullable<ProjectBoardSummary["claims"]>,
): string[] {
  const activeByCard = new Map(claims.active.map((claim) => [claim.cardId, claim]));
  const conflictCardIds = new Set(claims.conflicts.map((claim) => claim.cardId));
  return rows.flatMap((row) => {
    if (!row.orchestration_task_id) return [];
    const active = activeByCard.get(row.id);
    return conflictCardIds.has(row.id) || (active && !active.ownedByLocal) ? [row.orchestration_task_id] : [];
  });
}

const PROJECT_BOARD_PROTECTED_CANDIDATE_STATUSES = new Set<ProjectBoardCardCandidateStatus>(["evidence", "duplicate", "rejected"]);
export function projectBoardSynthesisCardRowProtectedFromDraftReplacement(
  row: ProjectBoardCardStoreRow,
  protectedClaimCardIds: ReadonlySet<string> = new Set(),
): boolean {
  return (
    row.status !== "draft" ||
    Boolean(row.orchestration_task_id) ||
    protectedClaimCardIds.has(row.id) ||
    parseProjectBoardCardTouchedFields(row.user_touched_fields_json).length > 0 ||
    PROJECT_BOARD_PROTECTED_CANDIDATE_STATUSES.has(row.candidate_status) ||
    Boolean(row.pending_pi_update_json)
  );
}

export interface ProjectBoardSynthesisStartFreshCardSnapshot {
  cardId: string;
  title: string;
  sourceId: string;
  status: ProjectBoardCardStatus;
  candidateStatus: ProjectBoardCardCandidateStatus;
  userTouchedFields: ProjectBoardCardTouchedField[];
  orchestrationTaskId?: string;
  executionThreadId?: string;
  clarificationQuestionCount: number;
}

export function projectBoardSynthesisStartFreshCardSnapshot(row: ProjectBoardCardStoreRow): ProjectBoardSynthesisStartFreshCardSnapshot {
  return {
    cardId: row.id,
    title: row.title,
    sourceId: row.source_id,
    status: row.status,
    candidateStatus: row.candidate_status,
    userTouchedFields: parseProjectBoardCardTouchedFields(row.user_touched_fields_json),
    orchestrationTaskId: row.orchestration_task_id ?? undefined,
    executionThreadId: row.execution_thread_id ?? undefined,
    clarificationQuestionCount: parseProjectBoardStringList(row.clarification_questions_json).length,
  };
}

export interface ProjectBoardCardClosedStateRow {
  status: ProjectBoardCardStatus | string;
  proof_review_json: string | null;
}

export function projectBoardCardRowIsClosedDone(row: ProjectBoardCardClosedStateRow): boolean {
  if (row.status === "done") return true;
  if (!row.proof_review_json) return false;
  try {
    return mapProjectBoardCardProofReview(row.proof_review_json, normalizeProjectBoardProofFollowUpSuggestion)?.status === "done";
  } catch {
    return false;
  }
}

export function resolveProjectBoardTaskBlockers(card: ProjectBoardCard, cards: ProjectBoardCard[], tasks: OrchestrationTask[]): string[] {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  return normalizeTaskReferences(
    card.blockedBy.flatMap((blockerRef) => {
      const blockerCard = cards.find((candidate) => candidate.id !== card.id && projectBoardCardMatchesRef(candidate, blockerRef));
      if (blockerCard && projectBoardCardIsTerminalAuditCandidate(blockerCard)) return [];
      if (!blockerCard?.orchestrationTaskId) return blockerRef;
      return tasksById.get(blockerCard.orchestrationTaskId)?.identifier ?? blockerCard.orchestrationTaskId;
    }),
  );
}

export function projectBoardCardIsTerminalAuditCandidate(card: Pick<ProjectBoardCard, "candidateStatus">): boolean {
  return card.candidateStatus === "evidence" || card.candidateStatus === "duplicate" || card.candidateStatus === "rejected";
}

export function projectBoardClosedParentForRunFollowUp(
  card: ProjectBoardCard,
  boardCards: ProjectBoardCard[],
): ProjectBoardCard | undefined {
  if (card.sourceKind !== "run_follow_up") return undefined;
  return boardCards.find(
    (candidate) =>
      candidate.id !== card.id &&
      card.blockedBy.some((ref) => projectBoardCardMatchesRef(candidate, ref)) &&
      (candidate.status === "done" || candidate.proofReview?.status === "done" || candidate.candidateStatus === "evidence"),
  );
}

export function projectBoardTestPolicyRequiresProofSpec(policy: Record<string, unknown>): boolean {
  // Delegate to the shared negation-aware helper so the main-process proof gate and
  // the renderer agree; a stale bare-regex copy here read "tests are not required" as
  // strict, making the UI enable Create Ready Tasks and main throw on the click.
  return projectBoardProofPolicyRequiresProofSpec(policy);
}

export type ProjectBoardProofReviewApplicationBlocker =
  | "newer_run_started"
  | "proof_review_cleared"
  | "proof_review_superseded"
  | "proof_review_unreadable";

export function projectBoardProofReviewApplicationBlocker(input: {
  latestRunId?: string;
  runId: string;
  proofReviewJson: string | null;
  requireCurrentReview: boolean;
}): ProjectBoardProofReviewApplicationBlocker | undefined {
  if (input.latestRunId && input.latestRunId !== input.runId) return "newer_run_started";
  if (!input.requireCurrentReview) return undefined;
  if (!input.proofReviewJson) return "proof_review_cleared";
  try {
    const currentReview = mapProjectBoardCardProofReview(input.proofReviewJson, normalizeProjectBoardProofFollowUpSuggestion);
    if (currentReview?.runId !== input.runId) return "proof_review_superseded";
  } catch {
    return "proof_review_unreadable";
  }
  return undefined;
}

const projectBoardEventKinds = new Set<ProjectBoardEventKind>([
  "board_created",
  "board_revision_started",
  "status_changed",
  "sources_refreshed",
  "board_synthesized",
  "synthesis_proposal_created",
  "synthesis_proposal_answered",
  "synthesis_proposal_card_reviewed",
  "synthesis_proposal_applied",
  "source_updated",
  "question_answered",
  "kickoff_defaults_suggested",
  "charter_finalized",
  "charter_summary_refreshed",
  "plan_promoted",
  "card_updated",
  "candidate_status_changed",
  "card_split",
  "card_ticketized",
  "card_execution_session_assigned",
  "card_run_prepared",
  "card_run_started",
  "card_run_progress",
  "card_run_completed",
  "card_run_failed",
  "card_run_blocked",
  "card_run_canceled",
  "card_run_stalled",
  "card_run_handoff_created",
  "card_claimed",
  "card_heartbeat",
  "card_claim_released",
  "card_claim_expired",
  "execution_readiness_blocked",
  "workflow_created",
  "workflow_impact_resolved",
  "workflow_repaired",
  "workflow_settings_updated",
  "workflow_raw_updated",
  "ready_tasks_created",
  "run_follow_up_created",
  "card_proof_reviewed",
  "card_proof_review_ignored",
  "manual_card_created",
  "local_task_attached",
  "local_task_imported_as_evidence",
  "deliverable_integration_resolved",
]);

const projectBoardEventKindByArtifactType: Partial<Record<BoardEventArtifact["type"], ProjectBoardEventKind>> = {
  "board.created": "board_created",
  "board.status_changed": "status_changed",
  "board.synthesized": "board_synthesized",
  "board.ready_tasks_created": "ready_tasks_created",
  "charter.revision_started": "board_revision_started",
  "charter.question_answered": "question_answered",
  "charter.kickoff_defaults_suggested": "kickoff_defaults_suggested",
  "charter.applied": "charter_finalized",
  "charter.summary_refreshed": "charter_summary_refreshed",
  "sources.refreshed": "sources_refreshed",
  "source.classified": "source_updated",
  "source.changed": "source_updated",
  "plan.promoted": "plan_promoted",
  "proposal.completed": "synthesis_proposal_created",
  "proposal.question_answered": "synthesis_proposal_answered",
  "proposal.card_reviewed": "synthesis_proposal_card_reviewed",
  "proposal.applied": "synthesis_proposal_applied",
  "proposal.failed": "synthesis_proposal_created",
  "card.created": "manual_card_created",
  "card.updated": "card_updated",
  "card.status_changed": "candidate_status_changed",
  "card.split": "card_split",
  "card.ticketized": "card_ticketized",
  "card.execution_session_assigned": "card_execution_session_assigned",
  "run.prepared": "card_run_prepared",
  "run.started": "card_run_started",
  "run.progress": "card_run_progress",
  "run.completed": "card_run_completed",
  "run.failed": "card_run_failed",
  "run.blocked": "card_run_blocked",
  "run.canceled": "card_run_canceled",
  "run.stalled": "card_run_stalled",
  "run.handoff_created": "card_run_handoff_created",
  "card.claimed": "card_claimed",
  "card.heartbeat": "card_heartbeat",
  "card.claim_released": "card_claim_released",
  "card.claim_expired": "card_claim_expired",
  "board.execution_readiness_blocked": "execution_readiness_blocked",
  "board.workflow_created": "workflow_created",
  "board.workflow_impact_resolved": "workflow_impact_resolved",
  "board.workflow_repaired": "workflow_repaired",
  "board.workflow_settings_updated": "workflow_settings_updated",
  "board.workflow_raw_updated": "workflow_raw_updated",
  "card.proof_reviewed": "card_proof_reviewed",
  "card.followup_created": "run_follow_up_created",
  "local_task.attached": "local_task_attached",
  "local_task.imported_as_evidence": "local_task_imported_as_evidence",
  "run.deliverable_integration_resolved": "deliverable_integration_resolved",
};

export interface ProjectBoardEventStoreRow {
  id: string;
  board_id: string;
  event_kind: ProjectBoardEventKind;
  title: string;
  summary: string;
  entity_kind: string | null;
  entity_id: string | null;
  metadata_json: string;
  created_at: string;
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

const PROJECT_BOARD_CARD_TOUCHED_FIELDS = new Set<ProjectBoardCardTouchedField>([
  "title",
  "description",
  "candidateStatus",
  "priority",
  "phase",
  "labels",
  "dependencies",
  "acceptanceCriteria",
  "testPlan",
  "sourceRefs",
  "clarificationQuestions",
  "clarificationSuggestions",
  "clarificationAnswers",
  "clarificationDecisions",
  "uiMockMetadata",
]);

const PROJECT_BOARD_SYNTHESIS_RUN_STAGES = new Set<ProjectBoardSynthesisRunStage>([
  "source_scan",
  "sources_persisted",
  "source_classification",
  "kickoff_defaults",
  "charter_summary",
  "deterministic_baseline",
  "model_request",
  "model_response",
  "schema_validation",
  "board_applied",
  "proposal_created",
  "paused",
  "failed",
]);
const PROJECT_BOARD_PLANNING_SNAPSHOT_KINDS = new Set<ProjectBoardPlanningSnapshotKind>(["incremental", "paused", "final", "manual"]);
const PROJECT_BOARD_SCOPE_FEATURE_VALUES = new Set<ProjectBoardScopeFeature>([
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
const PROJECT_BOARD_CARD_STATUS_VALUES = new Set<ProjectBoardCardStatus>([
  "draft",
  "ready",
  "in_progress",
  "review",
  "done",
  "blocked",
  "archived",
]);
const PROJECT_BOARD_CARD_CANDIDATE_STATUS_VALUES = new Set<ProjectBoardCardCandidateStatus>([
  "needs_clarification",
  "ready_to_create",
  "evidence",
  "duplicate",
  "rejected",
]);
const PROJECT_BOARD_SYNTHESIS_PROPOSAL_CARD_REVIEW_STATUSES = new Set<ProjectBoardSynthesisProposalCardReviewStatus>([
  "pending",
  "accepted",
  "deferred",
  "rejected",
  "merged",
]);

export function projectBoardSynthesisProposalCardReviewStatus(value: unknown): ProjectBoardSynthesisProposalCardReviewStatus | undefined {
  return typeof value === "string" &&
    PROJECT_BOARD_SYNTHESIS_PROPOSAL_CARD_REVIEW_STATUSES.has(value as ProjectBoardSynthesisProposalCardReviewStatus)
    ? (value as ProjectBoardSynthesisProposalCardReviewStatus)
    : undefined;
}

const PROJECT_BOARD_COPYABLE_SESSION_RUN_STATUSES = new Set(["completed", "failed", "canceled", "stalled"]);

export function projectBoardRunStatusCanCopySession(status: string): boolean {
  return PROJECT_BOARD_COPYABLE_SESSION_RUN_STATUSES.has(status);
}

const MAX_PROJECT_BOARD_SYNTHESIS_PROPOSAL_CARDS = 120;
const PROJECT_BOARD_CARD_SOURCE_KIND_VALUES = new Set<ProjectBoardCardSourceKind>([
  "planner_plan",
  "manual",
  "run_follow_up",
  "local_task_import",
  "board_synthesis",
]);
const PROJECT_BOARD_SOURCE_KIND_VALUES = new Set<ProjectBoardSourceKind>([
  "thread",
  "plan_artifact",
  "architecture_artifact",
  "functional_spec",
  "implementation_plan",
  "report_artifact",
  "workflow_artifact",
  "implementation_file",
  "test_artifact",
  "git_state",
  "ignored",
  "markdown",
]);

export function projectBoardHasDecisionImpactFeedback(card: ProjectBoardCard, question: string, answer: string): boolean {
  return normalizeProjectBoardCardRunFeedback(card.runFeedback ?? []).some(
    (item) =>
      item.source === "decision_impact" &&
      Boolean(item.decisionQuestion) &&
      projectBoardQuestionsAreNearDuplicates(item.decisionQuestion ?? "", question) &&
      (item.decisionAnswer?.trim() ?? "") === answer,
  );
}

export function projectBoardHasSourceImpactFeedback(card: ProjectBoardCard, sourceImpactEventIds: string[], sourceIds: string[]): boolean {
  const sourceImpactEventIdSet = new Set(sourceImpactEventIds);
  const sourceIdSet = new Set(sourceIds);
  return normalizeProjectBoardCardRunFeedback(card.runFeedback ?? []).some((item) => {
    if (item.source !== "source_impact") return false;
    if (item.sourceImpactEventId && sourceImpactEventIdSet.has(item.sourceImpactEventId)) return true;
    if ((item.sourceImpactEventIds ?? []).some((eventId) => sourceImpactEventIdSet.has(eventId))) return true;
    if (sourceImpactEventIdSet.size > 0) return false;
    return (item.sourceIds ?? []).some((sourceId) => sourceIdSet.has(sourceId));
  });
}

export function projectBoardProofRevisionRunFeedback(
  previousReview: ProjectBoardCard["proofReview"] | undefined,
  reason: string | undefined,
  now: string,
): ProjectBoardCardRunFeedback | undefined {
  const details = [
    reason ? `Reviewer note: ${reason}` : "",
    previousReview?.summary ? `Previous proof review: ${previousReview.summary}` : "",
    previousReview?.missing?.length ? `Missing evidence: ${previousReview.missing.slice(0, 5).join("; ")}` : "",
    previousReview?.recommendedAction ? `Previous recommendation: ${previousReview.recommendedAction.replace(/_/g, " ")}` : "",
  ].filter(Boolean);
  if (details.length === 0) return undefined;
  return {
    id: randomUUID(),
    feedback: `Proof revision requested. ${details.join(" ")}`.slice(0, 1500),
    source: "proof_review",
    decisionQuestion: "Why was this proof sent back for revision?",
    decisionAnswer: reason || previousReview?.summary,
    createdAt: now,
    createdBy: "ambient-desktop",
  };
}

export function projectBoardUxMockRejectionRunFeedback(
  previousReview: ProjectBoardCard["proofReview"] | undefined,
  reason: string | undefined,
  now: string,
): ProjectBoardCardRunFeedback {
  const details = [
    reason ? `Reviewer note: ${reason}` : "",
    previousReview?.summary ? `Previous mock review: ${previousReview.summary}` : "",
    previousReview?.missing?.length ? `Missing or rejected criteria: ${previousReview.missing.slice(0, 5).join("; ")}` : "",
  ].filter(Boolean);
  return {
    id: randomUUID(),
    feedback:
      `UX mock rejected. ${details.length > 0 ? details.join(" ") : "Keep downstream UI implementation blocked until a revised mock is approved."}`.slice(
        0,
        1500,
      ),
    source: "proof_review",
    decisionQuestion: "Why was this UX mock rejected?",
    decisionAnswer: reason || previousReview?.summary || "UX mock rejected by user PM decision.",
    createdAt: now,
    createdBy: "ambient-desktop",
  };
}

function projectBoardClarificationDecisionComparisonValue(decision: ProjectBoardCardClarificationDecision): Record<string, unknown> {
  if (decision.state === "answered") {
    return {
      question: decision.question,
      canonicalKey: decision.canonicalKey,
      state: decision.state,
      answer: decision.answer,
    };
  }
  return {
    question: decision.question,
    canonicalKey: decision.canonicalKey,
    source: decision.source,
    state: decision.state,
    duplicateOf: decision.duplicateOf,
    answer: decision.answer,
    suggestedAnswer: decision.suggestedAnswer,
    rationale: decision.rationale,
    confidence: decision.confidence,
    safeToAccept: Boolean(decision.safeToAccept),
    questionKind: decision.questionKind,
  };
}

export function projectBoardClarificationDecisionsEquivalent(
  left: ProjectBoardCardClarificationDecision[],
  right: ProjectBoardCardClarificationDecision[],
): boolean {
  return (
    projectBoardPlanningStableJson(left.map(projectBoardClarificationDecisionComparisonValue)) ===
    projectBoardPlanningStableJson(right.map(projectBoardClarificationDecisionComparisonValue))
  );
}

export function normalizeProjectBoardObjectiveProvenance(value: unknown): ProjectBoardSynthesisProposalCard["objectiveProvenance"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const objective = typeof candidate.objective === "string" ? candidate.objective.trim().slice(0, 2000) : "";
  if (!objective) return undefined;
  const groundingMode =
    candidate.groundingMode === "selected_sources" ||
    candidate.groundingMode === "source_scan" ||
    candidate.groundingMode === "objective_only"
      ? candidate.groundingMode
      : "objective_only";
  const selectedSourceIds = Array.isArray(candidate.selectedSourceIds)
    ? normalizeCardTextList(
        candidate.selectedSourceIds.filter((item): item is string => typeof item === "string"),
        50,
      )
    : [];
  const sourceRefCount =
    typeof candidate.sourceRefCount === "number" && Number.isFinite(candidate.sourceRefCount)
      ? Math.max(0, Math.round(candidate.sourceRefCount))
      : 0;
  const weakGrounding =
    typeof candidate.weakGrounding === "boolean" ? candidate.weakGrounding : sourceRefCount === 0 || groundingMode === "objective_only";
  const sourceGap =
    typeof candidate.sourceGap === "string" && candidate.sourceGap.trim() ? candidate.sourceGap.trim().slice(0, 2000) : undefined;
  return {
    objective,
    groundingMode,
    selectedSourceIds,
    sourceRefCount,
    weakGrounding,
    sourceGap,
  };
}

export function objectiveProvenanceJson(value: unknown): string | null {
  const normalized = normalizeProjectBoardObjectiveProvenance(value);
  return normalized ? JSON.stringify(normalized) : null;
}

export function sourceRefArtifactStrings(sourceRefs: Array<{ sourceId?: string; path?: string; range?: string }>): string[] {
  return normalizeCardTextList(
    sourceRefs
      .map((ref) => {
        const base = ref.path?.trim() || ref.sourceId?.trim() || "";
        return base ? (ref.range ? `${base}#${ref.range}` : base) : "";
      })
      .filter(Boolean),
    20,
  );
}

export function normalizeProjectBoardSynthesisRunProgressiveRecord(value: unknown): ProjectBoardSynthesisRunProgressiveRecord[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = { ...(value as Record<string, unknown>) };
  if (typeof record.type !== "string" || !record.type.trim()) return [];
  record.type = record.type.trim();
  return [record as ProjectBoardSynthesisRunProgressiveRecord];
}

export function normalizeProjectBoardSynthesisRunEvent(value: unknown, fallbackCreatedAt: string): ProjectBoardSynthesisRunEvent[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const event = value as ProjectBoardSynthesisRunEvent;
  if (
    typeof event.stage !== "string" ||
    !PROJECT_BOARD_SYNTHESIS_RUN_STAGES.has(event.stage as ProjectBoardSynthesisRunStage) ||
    typeof event.title !== "string"
  ) {
    return [];
  }
  return [
    {
      stage: event.stage as ProjectBoardSynthesisRunStage,
      title: event.title,
      summary: typeof event.summary === "string" ? event.summary : "",
      metadata: event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata : {},
      createdAt: typeof event.createdAt === "string" ? event.createdAt : fallbackCreatedAt,
    },
  ];
}

export function projectBoardEventKindFromArtifact(event: BoardEventArtifact): ProjectBoardEventKind {
  const currentKind = event.payload.currentKind;
  if (typeof currentKind === "string" && projectBoardEventKinds.has(currentKind as ProjectBoardEventKind)) {
    return currentKind as ProjectBoardEventKind;
  }
  return projectBoardEventKindByArtifactType[event.type] ?? "card_updated";
}

export function projectBoardEventTitleFromArtifact(event: BoardEventArtifact): string {
  const title = event.payload.title;
  if (typeof title === "string" && title.trim()) return title.trim().slice(0, 180);
  if (event.type === "run.prepared") return "Run prepared";
  if (event.type === "run.started") return "Run started";
  if (event.type === "run.progress") return "Run progress";
  if (event.type === "run.completed") return "Run completed";
  if (event.type === "run.failed") return "Run failed";
  if (event.type === "run.blocked") return "Run blocked";
  if (event.type === "run.canceled") return "Run canceled";
  if (event.type === "run.stalled") return "Run stalled";
  if (event.type === "run.handoff_created") return "Run handoff created";
  if (event.type === "card.claimed") return "Card claimed";
  if (event.type === "card.heartbeat") return "Card claim heartbeat";
  if (event.type === "card.claim_released") return "Card claim released";
  if (event.type === "card.claim_expired") return "Card claim expired";
  return event.type;
}

export function projectBoardEventSummaryFromArtifact(event: BoardEventArtifact): string {
  const summary = event.payload.summary;
  if (typeof summary !== "string" && event.type.startsWith("run.")) {
    const runId = typeof event.payload.runId === "string" ? event.payload.runId : event.entityId;
    const cardId = typeof event.payload.cardId === "string" ? event.payload.cardId : "unknown card";
    const status = typeof event.payload.normalizedStatus === "string" ? event.payload.normalizedStatus : event.type.replace("run.", "");
    return `Imported ${status.replace(/_/g, " ")} run ${runId} for ${cardId}.`;
  }
  if (typeof summary !== "string" && event.type === "card.claimed") {
    const agent = typeof event.payload.agentId === "string" ? event.payload.agentId : (event.actor?.agentId ?? "another desktop");
    const leaseUntil = typeof event.payload.leaseUntil === "string" ? ` until ${event.payload.leaseUntil}` : "";
    return `Card claim recorded for ${event.entityId} by ${agent}${leaseUntil}.`;
  }
  if (typeof summary !== "string" && event.type === "card.heartbeat") {
    return `Claim heartbeat recorded for ${event.entityId}.`;
  }
  if (typeof summary !== "string" && event.type === "card.claim_released") {
    return `Card claim released for ${event.entityId}.`;
  }
  if (typeof summary !== "string" && event.type === "card.claim_expired") {
    return `Card claim expired for ${event.entityId}.`;
  }
  return typeof summary === "string" ? summary.slice(0, 1000) : "";
}

export function projectBoardEventMetadataFromArtifact(event: BoardEventArtifact): Record<string, unknown> {
  const metadata = event.payload.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) return metadata as Record<string, unknown>;
  return { ...event.payload, artifactEventType: event.type, artifactPayload: event.payload, artifactActor: event.actor };
}

export function projectBoardExecutionArtifactStatus(
  manifest?: RunManifestArtifact,
  proof?: RunProofArtifact,
  handoff?: RunHandoffArtifact,
): string {
  if (manifest?.status) return manifest.status;
  if (handoff) return "completed";
  if (proof) return "review";
  return "prepared";
}

export function projectBoardExecutionArtifactCardId(
  manifest?: RunManifestArtifact,
  proof?: RunProofArtifact,
  handoff?: RunHandoffArtifact,
): string | undefined {
  return manifest?.cardId ?? proof?.cardId ?? handoff?.cardId;
}

export function projectBoardExecutionArtifactStartedAt(
  manifest?: RunManifestArtifact,
  proof?: RunProofArtifact,
  handoff?: RunHandoffArtifact,
): string {
  return manifest?.startedAt ?? proof?.createdAt ?? handoff?.createdAt ?? new Date().toISOString();
}

export function projectBoardExecutionArtifactUpdatedAt(
  manifest?: RunManifestArtifact,
  proof?: RunProofArtifact,
  handoff?: RunHandoffArtifact,
): string {
  return manifest?.updatedAt ?? handoff?.createdAt ?? proof?.createdAt ?? projectBoardExecutionArtifactStartedAt(manifest, proof, handoff);
}

export function projectBoardExecutionArtifactProofFromArtifact(proof: RunProofArtifact): ProjectBoardExecutionArtifactProof {
  return {
    summary: proof.summary,
    commands: proof.commands,
    changedFiles: proof.changedFiles,
    screenshots: proof.screenshots,
    browserTraces: proof.browserTraces,
    visualChecks: proof.visualChecks,
    manualChecks: proof.manualChecks,
    createdAt: proof.createdAt,
  };
}

export function projectBoardExecutionArtifactHandoffFromArtifact(handoff: RunHandoffArtifact): ProjectBoardExecutionArtifactHandoff {
  return {
    summary: handoff.summary,
    completed: handoff.completed,
    remaining: handoff.remaining,
    risks: handoff.risks,
    followUps: handoff.followUps,
    createdAt: handoff.createdAt,
  };
}

export function projectBoardRunStageFromManifest(manifest: ProposalManifestArtifact): ProjectBoardSynthesisRunStage {
  if (manifest.status === "failed" || manifest.stage === "failed") return "failed";
  if (manifest.status === "abandoned") return "paused";
  if (manifest.status === "paused" || manifest.stage === "paused") return "paused";
  if (manifest.stage === "source_scan") return "source_scan";
  if (manifest.stage === "source_classification") return "source_classification";
  if (manifest.stage === "importing") return "schema_validation";
  if (manifest.stage === "completed") return "proposal_created";
  return "model_request";
}

export function projectBoardRunStageFromArtifactProgress(stage: string): ProjectBoardSynthesisRunStage {
  const normalized = stage.trim().toLowerCase();
  if (normalized === "source_scan") return "source_scan";
  if (normalized === "sources_persisted") return "sources_persisted";
  if (normalized === "source_classification") return "source_classification";
  if (normalized === "deterministic_baseline") return "deterministic_baseline";
  if (normalized === "model_request") return "model_request";
  if (normalized === "model_response") return "model_response";
  if (normalized === "schema_validation" || normalized === "importing") return "schema_validation";
  if (normalized === "board_applied") return "board_applied";
  if (normalized === "proposal_created" || normalized === "completed") return "proposal_created";
  if (normalized === "paused" || normalized === "planning_paused") return "paused";
  if (normalized === "failed") return "failed";
  return "model_response";
}

export function projectBoardRunStatusFromProposalManifest(manifest: ProposalManifestArtifact): ProjectBoardSynthesisRunStatus {
  if (manifest.status === "abandoned") return "abandoned";
  if (manifest.status === "pause_requested" || manifest.status === "paused") return manifest.status;
  if (manifest.status === "failed") return "failed";
  if (manifest.status === "running") return "running";
  return "succeeded";
}

export function normalizeProjectBoardSynthesisProposalAnswer(
  value: unknown,
  fallbackAnsweredAt: string,
): ProjectBoardSynthesisProposalAnswer[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const answer = value as ProjectBoardSynthesisProposalAnswer;
  if (typeof answer.answer !== "string" || !answer.answer.trim()) return [];
  const questionIndex = typeof answer.questionIndex === "number" && Number.isInteger(answer.questionIndex) ? answer.questionIndex : -1;
  if (questionIndex < 0) return [];
  return [
    {
      questionIndex,
      question: typeof answer.question === "string" ? answer.question : "",
      answer: answer.answer,
      answeredAt: typeof answer.answeredAt === "string" ? answer.answeredAt : fallbackAnsweredAt,
    },
  ];
}

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

export function projectBoardProofFollowUpOptionsFromSuggestion(
  suggestion: ProjectBoardProofFollowUpSuggestion | undefined,
): ProjectBoardRunFollowUpInsertOptions | undefined {
  const normalized = normalizeProjectBoardProofFollowUpSuggestion(suggestion);
  if (!normalized) return undefined;
  return {
    ...(normalized.title ? { title: normalized.title } : {}),
    ...(normalized.description ? { description: normalized.description } : {}),
    ...(normalized.acceptanceCriteria?.length ? { acceptanceCriteria: normalized.acceptanceCriteria } : {}),
    ...(normalized.testPlan ? { testPlan: normalized.testPlan } : {}),
    ...(normalized.clarificationQuestions?.length ? { clarificationQuestions: normalized.clarificationQuestions } : {}),
    labels: ["pi-suggested-follow-up", ...(normalized.labels ?? [])],
  };
}

export function projectBoardSynthesisDraftWithSourceIdNamespace(
  synthesis: ProjectBoardSynthesisDraft,
  namespace: string | undefined,
): ProjectBoardSynthesisDraft {
  const prefix = namespace?.trim();
  if (!prefix) return synthesis;
  const sourceIdByOriginal = new Map<string, string>();
  for (const card of synthesis.cards) {
    const original = card.sourceId.trim();
    if (!original || original.startsWith(prefix)) continue;
    sourceIdByOriginal.set(original, `${prefix}${original}`);
  }
  if (sourceIdByOriginal.size === 0) return synthesis;
  const rewriteReference = (value: string): string => {
    const trimmed = value.trim();
    return sourceIdByOriginal.get(trimmed) ?? value;
  };
  return {
    ...synthesis,
    cards: synthesis.cards.map((card) => {
      const sourceId = card.sourceId.trim();
      return {
        ...card,
        sourceId: sourceIdByOriginal.get(sourceId) ?? sourceId,
        blockedBy: card.blockedBy.map(rewriteReference),
      };
    }),
  };
}

export function normalizeProjectBoardSynthesisProposalCard(card: ProjectBoardSynthesisProposalCard): ProjectBoardSynthesisProposalCard {
  return {
    sourceId: typeof card.sourceId === "string" ? card.sourceId : "",
    title: typeof card.title === "string" ? card.title : "",
    description: typeof card.description === "string" ? card.description : "",
    candidateStatus: card.candidateStatus ?? "needs_clarification",
    priority: typeof card.priority === "number" ? card.priority : undefined,
    phase: typeof card.phase === "string" ? card.phase : undefined,
    labels: Array.isArray(card.labels) ? card.labels.filter((label): label is string => typeof label === "string") : [],
    blockedBy: Array.isArray(card.blockedBy) ? card.blockedBy.filter((blocker): blocker is string => typeof blocker === "string") : [],
    acceptanceCriteria: Array.isArray(card.acceptanceCriteria)
      ? card.acceptanceCriteria.filter((criterion): criterion is string => typeof criterion === "string")
      : [],
    testPlan: normalizeProjectBoardCardTestPlan(card.testPlan ?? { unit: [], integration: [], visual: [], manual: [] }),
    sourceRefs: Array.isArray(card.sourceRefs) ? card.sourceRefs.filter((ref): ref is string => typeof ref === "string") : [],
    clarificationQuestions: Array.isArray(card.clarificationQuestions)
      ? card.clarificationQuestions.filter((question): question is string => typeof question === "string")
      : [],
    clarificationSuggestions: normalizeProjectBoardClarificationSuggestions(card.clarificationSuggestions ?? [], []),
    objectiveProvenance: normalizeProjectBoardObjectiveProvenance(card.objectiveProvenance),
    uiMockRole: normalizeProjectBoardUiMockRole(card.uiMockRole),
    requiresUiMockApproval: Boolean(card.requiresUiMockApproval),
    reviewStatus: projectBoardSynthesisProposalCardReviewStatus(card.reviewStatus) ?? "pending",
    reviewReason: typeof card.reviewReason === "string" && card.reviewReason.trim() ? card.reviewReason : undefined,
    mergeTargetCardId: typeof card.mergeTargetCardId === "string" && card.mergeTargetCardId.trim() ? card.mergeTargetCardId : undefined,
    reviewedAt: typeof card.reviewedAt === "string" && card.reviewedAt.trim() ? card.reviewedAt : undefined,
  };
}

export function projectBoardSynthesisProposalCardsFromDraft(
  synthesis: ProjectBoardSynthesisDraft,
  existingCards: ProjectBoardSynthesisProposalCard[] = [],
): ProjectBoardSynthesisProposalCard[] {
  const existingBySourceId = new Map(existingCards.map((card) => [card.sourceId, card]));
  return synthesis.cards
    .filter((card) => card.title.trim() && card.sourceId.trim())
    .slice(0, MAX_PROJECT_BOARD_SYNTHESIS_PROPOSAL_CARDS)
    .map((card) => {
      const normalized: ProjectBoardSynthesisProposalCard = {
        sourceId: card.sourceId.trim(),
        title: card.title.trim().slice(0, 180),
        description: card.description.trim().slice(0, 4000),
        candidateStatus: card.candidateStatus,
        priority: typeof card.priority === "number" ? Math.max(1, Math.round(card.priority)) : undefined,
        phase: card.phase?.trim().slice(0, 120) || undefined,
        labels: normalizeTaskLabels(card.labels),
        blockedBy: normalizeTaskReferences(card.blockedBy),
        acceptanceCriteria: normalizeCardTextList(card.acceptanceCriteria, 30),
        testPlan: normalizeProjectBoardCardTestPlan(card.testPlan),
        sourceRefs: normalizeCardTextList(card.sourceRefs, 20),
        clarificationQuestions: normalizeProjectBoardClarificationQuestions(card.clarificationQuestions ?? [], 8),
        clarificationSuggestions: normalizeProjectBoardClarificationSuggestions(card.clarificationSuggestions ?? [], []),
        objectiveProvenance: normalizeProjectBoardObjectiveProvenance(card.objectiveProvenance),
        uiMockRole: projectBoardUiMockRoleForSynthesisCard(card),
        requiresUiMockApproval: projectBoardRequiresUiMockApprovalForSynthesisCard(card),
        reviewStatus: "pending",
      };
      const existing = existingBySourceId.get(normalized.sourceId);
      if (!existing || !projectBoardSynthesisProposalCardReviewStillApplies(existing, normalized)) return normalized;
      return {
        ...normalized,
        reviewStatus: existing.reviewStatus,
        reviewReason: existing.reviewReason,
        mergeTargetCardId: existing.mergeTargetCardId,
        reviewedAt: existing.reviewedAt,
      };
    });
}

export function projectBoardCardPendingPiUpdateFromSynthesisCard(
  existing: ProjectBoardCardPendingPiUpdateStoreRow,
  incoming: ProjectBoardSynthesisCardInput,
  createdAt: string,
): ProjectBoardCardPendingPiUpdate | undefined {
  const existingClarificationAnswers = parseProjectBoardClarificationAnswers(existing.clarification_answers_json);
  const normalizedClarification = normalizeProjectBoardSynthesisClarificationFields({
    clarificationQuestions: incoming.clarificationQuestions,
    clarificationSuggestions: incoming.clarificationSuggestions,
    clarificationAnswers: existingClarificationAnswers,
    clarificationDecisions: incoming.clarificationDecisions,
    createdAt,
    updatedAt: createdAt,
  });
  const normalizedClarificationDecisions = normalizedClarification.clarificationDecisions;
  const normalizedCandidateStatus = projectBoardCandidateStatusForSynthesisUpdate(
    incoming.candidateStatus,
    existing.candidate_status,
    normalizedClarificationDecisions,
  );
  const normalized = {
    sourceId: incoming.sourceId.trim(),
    title: incoming.title.trim().slice(0, 180),
    description: incoming.description.trim().slice(0, 4000),
    candidateStatus: normalizedCandidateStatus,
    priority: typeof incoming.priority === "number" ? Math.max(1, Math.round(incoming.priority)) : undefined,
    phase: incoming.phase?.trim().slice(0, 120) || undefined,
    labels: normalizeTaskLabels(incoming.labels),
    blockedBy: normalizeTaskReferences(incoming.blockedBy),
    acceptanceCriteria: normalizeCardTextList(incoming.acceptanceCriteria, 30),
    testPlan: normalizeProjectBoardCardTestPlan(incoming.testPlan),
    sourceRefs: normalizeCardTextList(incoming.sourceRefs, 20),
    clarificationQuestions: normalizedClarification.clarificationQuestions,
    clarificationSuggestions: normalizedClarification.clarificationSuggestions,
    objectiveProvenance: normalizeProjectBoardObjectiveProvenance(incoming.objectiveProvenance),
    uiMockRole: projectBoardUiMockRoleForSynthesisCard(incoming),
    requiresUiMockApproval: projectBoardRequiresUiMockApprovalForSynthesisCard(incoming),
  };
  const existingPriority = existing.priority ?? undefined;
  const existingPhase = existing.phase ?? undefined;
  const existingLabels = parseProjectBoardStringList(existing.labels_json);
  const existingBlockedBy = parseProjectBoardStringList(existing.blocked_by_json);
  const existingAcceptanceCriteria = parseProjectBoardStringList(existing.acceptance_criteria_json);
  const existingTestPlan = parseProjectBoardCardTestPlan(existing.test_plan_json);
  const existingSourceRefs = parseProjectBoardStringList(existing.source_refs_json);
  const existingClarificationQuestions = parseProjectBoardStringList(existing.clarification_questions_json);
  const existingOpenClarificationQuestions = projectBoardUnansweredClarificationQuestions(
    existingClarificationQuestions,
    existingClarificationAnswers,
  );
  const existingClarificationSuggestions = parseProjectBoardClarificationSuggestions(existing.clarification_suggestions_json);
  const existingUiMockRole = normalizeProjectBoardUiMockRole(existing.ui_mock_role);
  const existingRequiresUiMockApproval = Boolean(existing.requires_ui_mock_approval);
  const existingClarificationDecisions = parseProjectBoardClarificationDecisions(existing.clarification_decisions_json, {
    clarificationQuestions: existingClarificationQuestions,
    clarificationSuggestions: existingClarificationSuggestions,
    clarificationAnswers: existingClarificationAnswers,
    createdAt: existing.created_at,
    updatedAt: existing.updated_at,
  });
  const changedFields: ProjectBoardCardTouchedField[] = [
    normalized.title !== existing.title ? "title" : undefined,
    normalized.description !== existing.description ? "description" : undefined,
    normalized.candidateStatus !== existing.candidate_status ? "candidateStatus" : undefined,
    normalized.priority !== existingPriority ? "priority" : undefined,
    normalized.phase !== existingPhase ? "phase" : undefined,
    JSON.stringify(normalized.labels) !== JSON.stringify(existingLabels) ? "labels" : undefined,
    JSON.stringify(normalized.blockedBy) !== JSON.stringify(existingBlockedBy) ? "dependencies" : undefined,
    JSON.stringify(normalized.acceptanceCriteria) !== JSON.stringify(existingAcceptanceCriteria) ? "acceptanceCriteria" : undefined,
    JSON.stringify(normalized.testPlan) !== JSON.stringify(existingTestPlan) ? "testPlan" : undefined,
    JSON.stringify(normalized.sourceRefs) !== JSON.stringify(existingSourceRefs) ? "sourceRefs" : undefined,
    JSON.stringify(normalized.clarificationQuestions) !== JSON.stringify(existingOpenClarificationQuestions)
      ? "clarificationQuestions"
      : undefined,
    JSON.stringify(normalized.clarificationSuggestions) !== JSON.stringify(existingClarificationSuggestions)
      ? "clarificationSuggestions"
      : undefined,
    projectBoardClarificationDecisionsEquivalent(normalizedClarificationDecisions, existingClarificationDecisions)
      ? undefined
      : "clarificationDecisions",
    normalized.uiMockRole !== existingUiMockRole || normalized.requiresUiMockApproval !== existingRequiresUiMockApproval
      ? "uiMockMetadata"
      : undefined,
  ].filter((field): field is ProjectBoardCardTouchedField => Boolean(field));
  if (changedFields.length === 0) return undefined;
  return {
    sourceId: normalized.sourceId,
    createdAt,
    changedFields,
    title: normalized.title,
    description: normalized.description,
    candidateStatus: normalized.candidateStatus,
    priority: normalized.priority,
    phase: normalized.phase,
    labels: normalized.labels,
    blockedBy: normalized.blockedBy,
    acceptanceCriteria: normalized.acceptanceCriteria,
    testPlan: normalized.testPlan,
    sourceRefs: normalized.sourceRefs,
    clarificationQuestions: normalized.clarificationQuestions,
    clarificationSuggestions: normalized.clarificationSuggestions,
    clarificationDecisions: normalizedClarificationDecisions,
    objectiveProvenance: normalized.objectiveProvenance,
    uiMockRole: normalized.uiMockRole,
    requiresUiMockApproval: normalized.requiresUiMockApproval,
  };
}

export function projectBoardMaterialPendingPiUpdateForRow(
  row: ProjectBoardCardPendingPiUpdateStoreRow,
  pending: ProjectBoardCardPendingPiUpdate,
): ProjectBoardCardPendingPiUpdate | undefined {
  const existingCandidateStatus = row.candidate_status ?? "ready_to_create";
  const existingPriority = row.priority ?? undefined;
  const existingPhase = row.phase ?? undefined;
  const existingLabels = parseProjectBoardStringList(row.labels_json);
  const existingBlockedBy = parseProjectBoardStringList(row.blocked_by_json);
  const existingAcceptanceCriteria = parseProjectBoardStringList(row.acceptance_criteria_json);
  const existingTestPlan = parseProjectBoardCardTestPlan(row.test_plan_json);
  const existingSourceRefs = parseProjectBoardStringList(row.source_refs_json);
  const existingClarificationQuestions = parseProjectBoardStringList(row.clarification_questions_json);
  const existingClarificationAnswers = parseProjectBoardClarificationAnswers(row.clarification_answers_json);
  const existingOpenClarificationQuestions = projectBoardUnansweredClarificationQuestions(
    existingClarificationQuestions,
    existingClarificationAnswers,
  );
  const existingClarificationSuggestions = parseProjectBoardClarificationSuggestions(row.clarification_suggestions_json);
  const existingUiMockRole = normalizeProjectBoardUiMockRole(row.ui_mock_role);
  const existingRequiresUiMockApproval = Boolean(row.requires_ui_mock_approval);
  const existingClarificationDecisions = parseProjectBoardClarificationDecisions(row.clarification_decisions_json, {
    clarificationQuestions: existingClarificationQuestions,
    clarificationSuggestions: existingClarificationSuggestions,
    clarificationAnswers: existingClarificationAnswers,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  const nextClarificationAnswers = normalizeProjectBoardClarificationAnswers(pending.clarificationAnswers ?? existingClarificationAnswers);
  const nextClarification = normalizeProjectBoardSynthesisClarificationFields({
    clarificationQuestions: pending.clarificationQuestions ?? existingClarificationQuestions,
    clarificationSuggestions: pending.clarificationSuggestions ?? existingClarificationSuggestions,
    clarificationAnswers: nextClarificationAnswers,
    clarificationDecisions: pending.clarificationDecisions ?? existingClarificationDecisions,
    createdAt: row.created_at,
    updatedAt: pending.createdAt || row.updated_at,
  });
  const nextCandidateStatus = pending.candidateStatus
    ? projectBoardCandidateStatusForSynthesisUpdate(
        pending.candidateStatus,
        existingCandidateStatus,
        nextClarification.clarificationDecisions,
      )
    : existingCandidateStatus;
  const changedFields: ProjectBoardCardTouchedField[] = [
    pending.title !== undefined && pending.title.trim().slice(0, 180) !== row.title ? "title" : undefined,
    pending.description !== undefined && pending.description.trim().slice(0, 4000) !== row.description ? "description" : undefined,
    pending.candidateStatus !== undefined && nextCandidateStatus !== existingCandidateStatus ? "candidateStatus" : undefined,
    pending.priority !== undefined && pending.priority !== existingPriority ? "priority" : undefined,
    pending.phase !== undefined && (pending.phase?.trim().slice(0, 80) || undefined) !== existingPhase ? "phase" : undefined,
    pending.labels !== undefined && JSON.stringify(normalizeTaskLabels(pending.labels)) !== JSON.stringify(existingLabels)
      ? "labels"
      : undefined,
    pending.blockedBy !== undefined && JSON.stringify(normalizeTaskReferences(pending.blockedBy)) !== JSON.stringify(existingBlockedBy)
      ? "dependencies"
      : undefined,
    pending.acceptanceCriteria !== undefined &&
    JSON.stringify(normalizeCardTextList(pending.acceptanceCriteria, 30)) !== JSON.stringify(existingAcceptanceCriteria)
      ? "acceptanceCriteria"
      : undefined,
    pending.testPlan !== undefined &&
    JSON.stringify(normalizeProjectBoardCardTestPlan(pending.testPlan)) !== JSON.stringify(existingTestPlan)
      ? "testPlan"
      : undefined,
    pending.sourceRefs !== undefined && JSON.stringify(normalizeCardTextList(pending.sourceRefs, 20)) !== JSON.stringify(existingSourceRefs)
      ? "sourceRefs"
      : undefined,
    pending.clarificationQuestions !== undefined &&
    JSON.stringify(nextClarification.clarificationQuestions) !== JSON.stringify(existingOpenClarificationQuestions)
      ? "clarificationQuestions"
      : undefined,
    pending.clarificationSuggestions !== undefined &&
    JSON.stringify(nextClarification.clarificationSuggestions) !== JSON.stringify(existingClarificationSuggestions)
      ? "clarificationSuggestions"
      : undefined,
    pending.clarificationAnswers !== undefined && JSON.stringify(nextClarificationAnswers) !== JSON.stringify(existingClarificationAnswers)
      ? "clarificationAnswers"
      : undefined,
    pending.clarificationDecisions !== undefined &&
    !projectBoardClarificationDecisionsEquivalent(nextClarification.clarificationDecisions, existingClarificationDecisions)
      ? "clarificationDecisions"
      : undefined,
    pending.uiMockRole !== undefined && normalizeProjectBoardUiMockRole(pending.uiMockRole) !== existingUiMockRole
      ? "uiMockMetadata"
      : undefined,
    pending.requiresUiMockApproval !== undefined && Boolean(pending.requiresUiMockApproval) !== existingRequiresUiMockApproval
      ? "uiMockMetadata"
      : undefined,
  ].filter((field): field is ProjectBoardCardTouchedField => Boolean(field));
  if (changedFields.length === 0) return undefined;
  return { ...pending, changedFields };
}

export function projectBoardSynthesisProposalCardReviewStillApplies(
  existing: ProjectBoardSynthesisProposalCard,
  next: ProjectBoardSynthesisProposalCard,
): boolean {
  if (existing.reviewStatus === "pending") return false;
  return (
    existing.title === next.title &&
    existing.description === next.description &&
    existing.candidateStatus === next.candidateStatus &&
    existing.priority === next.priority &&
    existing.phase === next.phase &&
    stringListsEqual(existing.labels, next.labels) &&
    stringListsEqual(existing.blockedBy, next.blockedBy) &&
    stringListsEqual(existing.acceptanceCriteria, next.acceptanceCriteria) &&
    stringListsEqual(existing.sourceRefs, next.sourceRefs) &&
    stringListsEqual(existing.clarificationQuestions ?? [], next.clarificationQuestions ?? []) &&
    JSON.stringify(existing.clarificationSuggestions ?? []) === JSON.stringify(next.clarificationSuggestions ?? []) &&
    stringListsEqual(existing.testPlan.unit, next.testPlan.unit) &&
    stringListsEqual(existing.testPlan.integration, next.testPlan.integration) &&
    stringListsEqual(existing.testPlan.visual, next.testPlan.visual) &&
    stringListsEqual(existing.testPlan.manual, next.testPlan.manual) &&
    JSON.stringify(existing.objectiveProvenance ?? null) === JSON.stringify(next.objectiveProvenance ?? null) &&
    existing.uiMockRole === next.uiMockRole &&
    Boolean(existing.requiresUiMockApproval) === Boolean(next.requiresUiMockApproval)
  );
}

function stringListsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function dedupeProjectBoardSynthesisRunProgressiveRecords(
  records: ProjectBoardSynthesisRunProgressiveRecord[],
): ProjectBoardSynthesisRunProgressiveRecord[] {
  const seen = new Set<string>();
  const result: ProjectBoardSynthesisRunProgressiveRecord[] = [];
  for (const record of records) {
    const key = JSON.stringify(record);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(record);
  }
  return result;
}

export function summarizeProjectBoardSynthesisRunProgressiveRecords(
  records: ProjectBoardSynthesisRunProgressiveRecord[],
): ProjectBoardSynthesisRunProgressiveSummary {
  const renderedCardLedger = buildProjectBoardRenderedCardLedger(records);
  const summary: ProjectBoardSynthesisRunProgressiveSummary = {
    recordCount: records.length,
    candidateCardCount: 0,
    questionCount: 0,
    sourceCoverageCount: 0,
    dependencyEdgeCount: 0,
    warningCount: 0,
    errorCount: 0,
  };
  for (const record of records) {
    if (record.type === "candidate_card") {
      summary.candidateCardCount += 1;
      if (typeof record.title === "string" && record.title.trim()) summary.latestCandidateCardTitle = record.title.trim();
    } else if (record.type === "question") {
      summary.questionCount += 1;
      if (typeof record.question === "string" && record.question.trim()) summary.latestQuestion = record.question.trim();
    } else if (record.type === "proposal_final") {
      summary.proposalFinalCount = (summary.proposalFinalCount ?? 0) + 1;
    } else if (record.type === "source_coverage") {
      summary.sourceCoverageCount += 1;
    } else if (record.type === "dependency_edge") {
      summary.dependencyEdgeCount += 1;
    } else if (record.type === "warning") {
      summary.warningCount += 1;
      if (typeof record.message === "string" && record.message.trim()) summary.latestWarning = record.message.trim();
    } else if (record.type === "error") {
      summary.errorCount += 1;
      if (typeof record.message === "string" && record.message.trim()) summary.latestError = record.message.trim();
      if (record.code === "section_semantic_idle_timeout") {
        summary.semanticIdleSectionCount = (summary.semanticIdleSectionCount ?? 0) + 1;
      }
    } else if (record.type === "progress") {
      const metadata =
        record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
          ? (record.metadata as Record<string, unknown>)
          : {};
      const sectionStatus = metadata.sectionStatus;
      if (sectionStatus === "succeeded") summary.sectionSucceededCount = (summary.sectionSucceededCount ?? 0) + 1;
      else if (sectionStatus === "failed") summary.sectionFailedCount = (summary.sectionFailedCount ?? 0) + 1;
      else if (sectionStatus === "skipped") summary.sectionSkippedCount = (summary.sectionSkippedCount ?? 0) + 1;
      const sectionHeading = metadata.sectionHeading;
      if (typeof sectionHeading === "string" && sectionHeading.trim()) summary.latestSectionHeading = sectionHeading.trim();
    }
  }
  if (renderedCardLedger.cardCount > 0) {
    summary.renderedCardCount = renderedCardLedger.cardCount;
    summary.renderedCardBlockedCount = renderedCardLedger.blockedCardCount;
    summary.renderedCardDuplicateCount = renderedCardLedger.duplicateCardCount;
    summary.renderedCardRejectedCount = renderedCardLedger.rejectedCardCount;
    summary.renderedCardEvidenceCount = renderedCardLedger.evidenceCardCount;
    summary.renderedCardSplitLineageCount = renderedCardLedger.splitLineageCount;
    summary.renderedCardInvalidatedCount = renderedCardLedger.invalidatedCardCount;
    summary.renderedCardLedgerChecksum = renderedCardLedger.checksum;
    summary.renderedCardLedger = renderedCardLedger.entries;
  }
  return summary;
}

export function normalizeProjectBoardPlanningSnapshot(
  value: ProjectBoardPlanningSnapshot,
  fallbackCreatedAt: string,
): ProjectBoardPlanningSnapshot[] {
  if (!value || typeof value !== "object") return [];
  if (typeof value.id !== "string" || !value.id.trim()) return [];
  if (typeof value.boardId !== "string" || !value.boardId.trim()) return [];
  if (typeof value.runId !== "string" || !value.runId.trim()) return [];
  if (!PROJECT_BOARD_PLANNING_SNAPSHOT_KINDS.has(value.kind)) return [];
  if (!PROJECT_BOARD_SYNTHESIS_RUN_STAGES.has(value.planningStage)) return [];
  const planningStatus: ProjectBoardSynthesisRunStatus = [
    "running",
    "pause_requested",
    "paused",
    "abandoned",
    "succeeded",
    "failed",
  ].includes(value.planningStatus)
    ? value.planningStatus
    : "running";
  const sourceHashes = Array.isArray(value.sourceHashes)
    ? value.sourceHashes.flatMap((source): ProjectBoardPlanningSnapshotSourceHash[] => {
        if (!source || typeof source !== "object") return [];
        const sourceId = typeof source.sourceId === "string" ? source.sourceId.trim() : "";
        const kind = typeof source.kind === "string" ? (source.kind as ProjectBoardSourceKind) : "markdown";
        if (!sourceId || !PROJECT_BOARD_SOURCE_KIND_VALUES.has(kind)) return [];
        return [
          {
            sourceId,
            kind,
            ...(typeof source.sourceKey === "string" && source.sourceKey.trim() ? { sourceKey: source.sourceKey.trim() } : {}),
            ...(typeof source.path === "string" && source.path.trim() ? { path: source.path.trim() } : {}),
            ...(typeof source.contentHash === "string" && source.contentHash.trim() ? { contentHash: source.contentHash.trim() } : {}),
            ...(typeof source.changeState === "string" && ["new", "changed", "unchanged", "removed"].includes(source.changeState)
              ? { changeState: source.changeState as ProjectBoardSourceChangeState }
              : {}),
            ...(typeof source.includeInSynthesis === "boolean" ? { includeInSynthesis: source.includeInSynthesis } : {}),
          },
        ];
      })
    : [];
  const cards = Array.isArray(value.cards)
    ? value.cards.flatMap((card): ProjectBoardPlanningSnapshotCard[] => {
        if (!card || typeof card !== "object") return [];
        const cardId = typeof card.cardId === "string" ? card.cardId.trim() : "";
        const sourceId = typeof card.sourceId === "string" ? card.sourceId.trim() : "";
        const sourceKind =
          typeof card.sourceKind === "string" && PROJECT_BOARD_CARD_SOURCE_KIND_VALUES.has(card.sourceKind as ProjectBoardCardSourceKind)
            ? (card.sourceKind as ProjectBoardCardSourceKind)
            : "board_synthesis";
        const status =
          typeof card.status === "string" && PROJECT_BOARD_CARD_STATUS_VALUES.has(card.status as ProjectBoardCardStatus)
            ? (card.status as ProjectBoardCardStatus)
            : "draft";
        const candidateStatus =
          typeof card.candidateStatus === "string" &&
          PROJECT_BOARD_CARD_CANDIDATE_STATUS_VALUES.has(card.candidateStatus as ProjectBoardCardCandidateStatus)
            ? (card.candidateStatus as ProjectBoardCardCandidateStatus)
            : "needs_clarification";
        const renderFingerprint = typeof card.renderFingerprint === "string" ? card.renderFingerprint.trim() : "";
        if (!cardId || !sourceId || !renderFingerprint) return [];
        return [
          {
            cardId,
            sourceId,
            sourceKind,
            title: typeof card.title === "string" ? card.title : "",
            status,
            candidateStatus,
            sourceRefs: Array.isArray(card.sourceRefs) ? card.sourceRefs.filter((item): item is string => typeof item === "string") : [],
            blockedBy: Array.isArray(card.blockedBy) ? card.blockedBy.filter((item): item is string => typeof item === "string") : [],
            renderFingerprint,
            ...(typeof card.orchestrationTaskId === "string" && card.orchestrationTaskId.trim()
              ? { orchestrationTaskId: card.orchestrationTaskId.trim() }
              : {}),
          },
        ];
      })
    : [];
  const cardIds = Array.isArray(value.cardIds)
    ? value.cardIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : cards.map((card) => card.cardId);
  const scopeContract = normalizeProjectBoardScopeContract(value.scopeContract);
  const planningDepth = normalizeProjectBoardPlanningDepthAssessment(value.planningDepth);
  return [
    {
      id: value.id.trim(),
      boardId: value.boardId.trim(),
      runId: value.runId.trim(),
      kind: value.kind,
      planningStatus,
      planningStage: value.planningStage,
      createdAt: typeof value.createdAt === "string" && value.createdAt.trim() ? value.createdAt.trim() : fallbackCreatedAt,
      cardCount: Math.max(
        0,
        Math.round(typeof value.cardCount === "number" && Number.isFinite(value.cardCount) ? value.cardCount : cards.length),
      ),
      readyCandidateCount: Math.max(
        0,
        Math.round(
          typeof value.readyCandidateCount === "number" && Number.isFinite(value.readyCandidateCount) ? value.readyCandidateCount : 0,
        ),
      ),
      ticketizedCount: Math.max(
        0,
        Math.round(typeof value.ticketizedCount === "number" && Number.isFinite(value.ticketizedCount) ? value.ticketizedCount : 0),
      ),
      sourceHashes,
      ...(scopeContract ? { scopeContract } : {}),
      ...(planningDepth ? { planningDepth } : {}),
      cardIds,
      cards,
      renderFingerprint:
        typeof value.renderFingerprint === "string" && value.renderFingerprint.trim()
          ? value.renderFingerprint.trim()
          : projectBoardPlanningStableHash("planning-snapshot", { sourceHashes, cards }),
    },
  ];
}

function normalizeProjectBoardScopeContract(value: unknown): ProjectBoardScopeContract | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return {
    included: normalizeProjectBoardScopeFeatures(record.included),
    excluded: normalizeProjectBoardScopeFeatures(record.excluded),
    requiredCapabilities: normalizePlanningSnapshotStringArray(record.requiredCapabilities, 20, 500),
    supportingCapabilities: normalizePlanningSnapshotStringArray(record.supportingCapabilities, 20, 500),
    optionalCapabilities: normalizePlanningSnapshotStringArray(record.optionalCapabilities, 20, 500),
    excludedCapabilities: normalizePlanningSnapshotStringArray(record.excludedCapabilities, 20, 500),
    planningDepth: normalizeProjectBoardPlanningDepthAssessment(record.planningDepth),
    planningDepthHints: normalizePlanningSnapshotStringArray(record.planningDepthHints, 12, 500),
    openQuestions: normalizePlanningSnapshotStringArray(record.openQuestions, 12, 500),
    evidence: normalizePlanningSnapshotStringArray(record.evidence, 20, 500),
  };
}

function normalizeProjectBoardPlanningDepthAssessment(value: unknown): ProjectBoardPlanningDepthAssessment | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const level =
    typeof record.level === "string" && ["shallow", "standard", "deep", "phased"].includes(record.level) ? record.level : undefined;
  if (!level) return undefined;
  const rawScore = typeof record.score === "number" && Number.isFinite(record.score) ? record.score : 0;
  return {
    score: Math.max(0, Math.min(100, Math.round(rawScore))),
    level: level as ProjectBoardPlanningDepthAssessment["level"],
    signals: normalizePlanningSnapshotStringArray(record.signals, 20, 500),
    guidance: typeof record.guidance === "string" ? record.guidance.trim().slice(0, 1000) : "",
  };
}

function normalizeProjectBoardScopeFeatures(value: unknown): ProjectBoardScopeFeature[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ProjectBoardScopeFeature>();
  for (const item of value) {
    if (typeof item !== "string" || !PROJECT_BOARD_SCOPE_FEATURE_VALUES.has(item as ProjectBoardScopeFeature)) continue;
    seen.add(item as ProjectBoardScopeFeature);
  }
  return [...seen];
}

function normalizePlanningSnapshotStringArray(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, maxLength))
    .slice(0, limit);
}

export function projectBoardPlanningStableHash(prefix: string, value: unknown): string {
  return `${prefix}-${createHash("sha256").update(projectBoardPlanningStableJson(value)).digest("hex").slice(0, 24)}`;
}

export function projectBoardPlanningStableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => projectBoardPlanningStableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${projectBoardPlanningStableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function mapProjectBoardExecutionArtifactRow(row: ProjectBoardExecutionArtifactStoreRow): ProjectBoardExecutionArtifact {
  return {
    id: row.id,
    boardId: row.board_id,
    cardId: row.card_id,
    status: row.status,
    source: row.source === "local_export" ? "local_export" : "git",
    agentId: row.agent_id ?? undefined,
    piSessionId: row.pi_session_id ?? undefined,
    workspaceBranch: row.workspace_branch ?? undefined,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    proof: row.proof_json
      ? normalizeProjectBoardExecutionProof(parseProjectBoardJsonObject<Record<string, unknown> | undefined>(row.proof_json, undefined))
      : undefined,
    handoff: row.handoff_json
      ? normalizeProjectBoardExecutionHandoff(parseProjectBoardJsonObject<Record<string, unknown> | undefined>(row.handoff_json, undefined))
      : undefined,
    createdAt: row.created_at,
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

export function mapProjectBoardEventRow(row: ProjectBoardEventStoreRow): ProjectBoardEvent {
  return {
    id: row.id,
    boardId: row.board_id,
    kind: row.event_kind,
    title: row.title,
    summary: row.summary,
    entityKind: row.entity_kind ?? undefined,
    entityId: row.entity_id ?? undefined,
    metadata: parseProjectBoardJsonObject<Record<string, unknown>>(row.metadata_json, {}),
    createdAt: row.created_at,
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

export function parseProjectBoardStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch (error) {
    warnCorruptProjectBoardJson("parseProjectBoardStringList", value, error);
    return [];
  }
}

export function parseProjectBoardCardTouchedFields(value: string | null | undefined): ProjectBoardCardTouchedField[] {
  return parseProjectBoardStringList(value).filter((field): field is ProjectBoardCardTouchedField =>
    PROJECT_BOARD_CARD_TOUCHED_FIELDS.has(field as ProjectBoardCardTouchedField),
  );
}

export function parseProjectBoardCardTestPlan(value: string | null | undefined): ProjectBoardCardTestPlan {
  if (!value) return { unit: [], integration: [], visual: [], manual: [] };
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { unit: [], integration: [], visual: [], manual: [] };
    const candidate = parsed as Partial<ProjectBoardCardTestPlan>;
    return normalizeProjectBoardCardTestPlan({
      unit: Array.isArray(candidate.unit) ? candidate.unit.filter((item): item is string => typeof item === "string") : [],
      integration: Array.isArray(candidate.integration)
        ? candidate.integration.filter((item): item is string => typeof item === "string")
        : [],
      visual: Array.isArray(candidate.visual) ? candidate.visual.filter((item): item is string => typeof item === "string") : [],
      manual: Array.isArray(candidate.manual) ? candidate.manual.filter((item): item is string => typeof item === "string") : [],
    });
  } catch {
    return { unit: [], integration: [], visual: [], manual: [] };
  }
}

// Corrupted persisted JSON falls back to an empty value, and the next
// read-modify-write persists that emptiness permanently; log loudly so the
// corruption is at least diagnosable from logs.
function warnCorruptProjectBoardJson(parser: string, json: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`[project-board] ${parser}: corrupted persisted JSON treated as empty (${reason}): ${json.slice(0, 200)}`);
}

function parseProjectBoardJsonObject<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch (error) {
    warnCorruptProjectBoardJson("parseProjectBoardJsonObject", json, error);
    return fallback;
  }
}

function parseProjectBoardJsonArray<T>(json: string | null | undefined): T[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (error) {
    warnCorruptProjectBoardJson("parseProjectBoardJsonArray", json, error);
    return [];
  }
}

function normalizeProjectBoardExecutionProof(value: Record<string, unknown> | undefined): ProjectBoardExecutionArtifactProof | undefined {
  if (!value || typeof value.summary !== "string") return undefined;
  return {
    ...value,
    summary: value.summary,
    commands: toStringArray(value.commands),
    changedFiles: toStringArray(value.changedFiles),
  } as ProjectBoardExecutionArtifactProof;
}

function normalizeProjectBoardExecutionHandoff(
  value: Record<string, unknown> | undefined,
): ProjectBoardExecutionArtifactHandoff | undefined {
  if (!value || typeof value.summary !== "string") return undefined;
  return {
    ...value,
    summary: value.summary,
    completed: toStringArray(value.completed),
    remaining: toStringArray(value.remaining),
  } as ProjectBoardExecutionArtifactHandoff;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeProjectBoardPmReviewReportForStore(value: unknown): ProjectBoardSynthesisProposal["reviewReport"] {
  try {
    return normalizeProjectBoardPmReviewReport(value);
  } catch {
    return undefined;
  }
}
