import type { DesktopState } from "./desktopTypes";
import type { ThreadSummary } from "./threadTypes";

export interface ProjectSummary {
  id: string;
  path: string;
  name: string;
  statePath: string;
  sessionPath: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  board?: ProjectBoardSummary;
  threads: ThreadSummary[];
}

export type ProjectBoardStatus = "draft" | "active" | "paused" | "archived";

export type ProjectBoardCharterStatus = "draft" | "active" | "superseded";

export type ProjectBoardCardStatus = "draft" | "ready" | "in_progress" | "review" | "done" | "blocked" | "archived";

export type ProjectBoardCardCandidateStatus = "needs_clarification" | "ready_to_create" | "evidence" | "duplicate" | "rejected";

export type ProjectBoardCardSourceKind = "planner_plan" | "manual" | "run_follow_up" | "local_task_import" | "board_synthesis";

export type ProjectBoardCardExecutionSessionPolicy = "reuse_card_session" | "fresh_context";

export type ProjectBoardCardProofReviewStatus =
  | "ready_for_review"
  | "needs_follow_up"
  | "terminally_blocked"
  | "retry_recommended"
  | "done";

export type ProjectBoardCardProofReviewReviewer = "deterministic" | "ambient_pi";

export type ProjectBoardCardProofEvidenceQuality = "strong" | "mixed" | "weak";

export type ProjectBoardCardProofRecommendedAction = "close" | "retry" | "follow_up" | "ask_user" | "block";

export type ProjectBoardProofDecisionAction = "accept_done" | "retry" | "mark_blocked";

export type ProjectBoardCardSplitOutcomeStatus = "proposed" | "approved" | "rejected" | "replaced" | "done_via_split";

export type ProjectBoardCardSplitOutcomeSource = "runtime_budget" | "proof_review" | "manual";

export type ProjectBoardSplitDecisionAction =
  | "approve_split"
  | "reject_split"
  | "retry_original"
  | "merge_followups"
  | "mark_replaced"
  | "accept_done_via_split";

export type ProjectBoardSynthesisProposalStatus = "pending" | "applied" | "superseded" | "rejected";

export type ProjectBoardSynthesisProposalCardReviewStatus = "pending" | "accepted" | "deferred" | "rejected" | "merged";

export type ProjectBoardSynthesisRunStatus = "running" | "pause_requested" | "paused" | "abandoned" | "succeeded" | "failed";

export type ProjectBoardSynthesisRunStage =
  | "source_scan"
  | "sources_persisted"
  | "source_classification"
  | "kickoff_defaults"
  | "charter_summary"
  | "deterministic_baseline"
  | "model_request"
  | "model_response"
  | "schema_validation"
  | "board_applied"
  | "proposal_created"
  | "paused"
  | "failed";

export type ProjectBoardEventKind =
  | "board_created"
  | "board_revision_started"
  | "status_changed"
  | "sources_refreshed"
  | "board_synthesized"
  | "synthesis_proposal_created"
  | "synthesis_proposal_answered"
  | "synthesis_proposal_card_reviewed"
  | "synthesis_proposal_applied"
  | "source_updated"
  | "question_answered"
  | "kickoff_defaults_suggested"
  | "charter_finalized"
  | "charter_summary_refreshed"
  | "plan_promoted"
  | "card_updated"
  | "candidate_status_changed"
  | "card_split"
  | "card_ticketized"
  | "card_execution_session_assigned"
  | "card_run_prepared"
  | "card_run_started"
  | "card_run_progress"
  | "card_run_completed"
  | "card_run_failed"
  | "card_run_blocked"
  | "card_run_canceled"
  | "card_run_stalled"
  | "card_run_handoff_created"
  | "card_claimed"
  | "card_heartbeat"
  | "card_claim_released"
  | "card_claim_expired"
  | "execution_readiness_blocked"
  | "workflow_created"
  | "workflow_impact_resolved"
  | "workflow_repaired"
  | "workflow_settings_updated"
  | "workflow_raw_updated"
  | "ready_tasks_created"
  | "run_follow_up_created"
  | "card_proof_reviewed"
  | "card_proof_review_ignored"
  | "manual_card_created"
  | "local_task_attached"
  | "local_task_imported_as_evidence"
  | "deliverable_integration_resolved";

export type ProjectBoardSourceKind =
  | "thread"
  | "plan_artifact"
  | "architecture_artifact"
  | "functional_spec"
  | "implementation_plan"
  | "report_artifact"
  | "workflow_artifact"
  | "implementation_file"
  | "test_artifact"
  | "git_state"
  | "ignored"
  | "markdown";

export type ProjectBoardSourceChangeState = "new" | "changed" | "unchanged" | "removed";

export type ProjectBoardSourceClassifiedBy = "ambient_pi" | "fallback_heuristic" | "user";

export type ProjectBoardSourceAuthorityRole = "primary" | "supporting" | "context" | "proof" | "ignored";

export interface ProjectBoardSource {
  id: string;
  boardId: string;
  kind: ProjectBoardSourceKind;
  sourceKey?: string;
  contentHash?: string;
  changeState?: ProjectBoardSourceChangeState;
  title: string;
  summary: string;
  excerpt?: string;
  path?: string;
  threadId?: string;
  artifactId?: string;
  messageId?: string;
  byteSize?: number;
  mtime?: string;
  classificationReason?: string;
  classifiedBy?: ProjectBoardSourceClassifiedBy;
  classificationConfidence?: number;
  authorityRole?: ProjectBoardSourceAuthorityRole;
  includeInSynthesis?: boolean;
  relevance: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectBoardQuestion {
  id: string;
  boardId: string;
  question: string;
  required: boolean;
  answer?: string;
  answeredAt?: string;
  suggestedAnswer?: string;
  suggestedAnswerRationale?: string;
  suggestedAnswerConfidence?: "high" | "medium" | "low";
  suggestedAnswerSourceIds?: string[];
  suggestedAnswerContextFingerprint?: string;
  suggestedAnswerGeneratedAt?: string;
  suggestedAnswerModel?: string;
  suggestedAnswerProviderError?: string;
  suggestedAnswerStale?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectBoardCardTestPlan {
  unit: string[];
  integration: string[];
  visual: string[];
  manual: string[];
}

export interface ProjectBoardCardProofReview {
  status: ProjectBoardCardProofReviewStatus;
  summary: string;
  satisfied: string[];
  missing: string[];
  followUpSuggestion?: ProjectBoardProofFollowUpSuggestion;
  followUpCardIds: string[];
  runId: string;
  reviewedAt: string;
  reviewer?: ProjectBoardCardProofReviewReviewer;
  model?: string;
  confidence?: number;
  evidenceQuality?: ProjectBoardCardProofEvidenceQuality;
  recommendedAction?: ProjectBoardCardProofRecommendedAction;
  deterministicStatus?: ProjectBoardCardProofReviewStatus;
  deterministicSummary?: string;
  judgeDurationMs?: number;
}

export interface ProjectBoardProofFollowUpSuggestion {
  title?: string;
  description?: string;
  acceptanceCriteria?: string[];
  testPlan?: ProjectBoardCardTestPlan;
  clarificationQuestions?: string[];
  labels?: string[];
  rationale?: string;
}

export interface ProjectBoardCardSplitOutcome {
  status: ProjectBoardCardSplitOutcomeStatus;
  source: ProjectBoardCardSplitOutcomeSource;
  sourceRunId: string;
  reason: string;
  partialProofSummary: string;
  completedCriteria: string[];
  remainingCriteria: string[];
  childCardIds: string[];
  maxRuntimeMs?: number;
  elapsedMs?: number;
  createdAt: string;
  updatedAt: string;
}

export type ProjectBoardCardClaimStatus = "active" | "expired" | "conflict";

export interface ProjectBoardCardClaimSummary {
  status: ProjectBoardCardClaimStatus;
  cardId: string;
  runId: string;
  agentId: string;
  eventId: string;
  claimedAt: string;
  expiredAt?: string;
  leaseUntil?: string;
  lastHeartbeatAt?: string;
  appInstanceId?: string;
  displayName?: string;
  workspaceBranch?: string;
  baseCommit?: string;
  expirationRecorded?: boolean;
  blockedByRunId?: string;
  ownedByLocal?: boolean;
}

export type ProjectBoardCardTouchedField =
  | "title"
  | "description"
  | "candidateStatus"
  | "priority"
  | "phase"
  | "labels"
  | "dependencies"
  | "acceptanceCriteria"
  | "testPlan"
  | "sourceRefs"
  | "clarificationQuestions"
  | "clarificationSuggestions"
  | "clarificationAnswers"
  | "clarificationDecisions"
  | "uiMockMetadata";

export interface ProjectBoardCardClarificationAnswer {
  question: string;
  answer: string;
  answeredAt: string;
}

export type ProjectBoardClarificationQuestionKind = "expert_default" | "user_preference" | "external_constraint";

export interface ProjectBoardCardClarificationSuggestion {
  question: string;
  suggestedAnswer: string;
  rationale: string;
  confidence: "high" | "medium" | "low";
  safeToAccept: boolean;
  questionKind: ProjectBoardClarificationQuestionKind;
}

export type ProjectBoardCardClarificationDecisionSource =
  | "card"
  | "description"
  | "acceptance_criteria"
  | "answer_history";

export type ProjectBoardCardClarificationDecisionState = "open" | "answered" | "duplicate" | "dismissed";

export interface ProjectBoardCardClarificationDecision {
  id: string;
  question: string;
  canonicalKey: string;
  source: ProjectBoardCardClarificationDecisionSource;
  state: ProjectBoardCardClarificationDecisionState;
  duplicateOf?: string;
  answer?: string;
  answeredAt?: string;
  suggestedAnswer?: string;
  rationale?: string;
  confidence?: ProjectBoardCardClarificationSuggestion["confidence"];
  safeToAccept?: boolean;
  questionKind?: ProjectBoardClarificationQuestionKind;
  createdAt?: string;
  updatedAt?: string;
}

export type ProjectBoardCardRunFeedbackSource = "manual" | "decision_impact" | "proof_review" | "source_impact";

export interface ProjectBoardCardRunFeedback {
  id: string;
  feedback: string;
  source: ProjectBoardCardRunFeedbackSource;
  decisionQuestion?: string;
  decisionAnswer?: string;
  sourceImpactEventId?: string;
  sourceImpactEventIds?: string[];
  sourceIds?: string[];
  createdAt: string;
  createdBy?: string;
}

export type ProjectBoardRenderedCardClarificationState = "none" | "pending" | "resolved";

export type ProjectBoardRenderedCardDuplicateDecision = "unique" | "duplicate" | "rejected" | "evidence";

export type ProjectBoardRenderedCardInvalidationReason =
  | "source_checksum_changed"
  | "source_missing"
  | "card_schema_version_changed"
  | "render_fingerprint_changed"
  | "user_touched";

export type ProjectBoardRenderedCardInvalidationState = "valid" | "invalidated";

export type ProjectBoardRenderedCardRestartAction =
  | "reuse_rendered_card"
  | "wait_for_clarification"
  | "skip_duplicate"
  | "skip_rejected"
  | "keep_evidence"
  | "regenerate_card";

export interface ProjectBoardRenderedCardSourceRef {
  sourceId?: string;
  path?: string;
  range?: string;
  note?: string;
  contentHash?: string;
  label: string;
}

export interface ProjectBoardRenderedCardSourceSnapshot {
  sourceId?: string;
  path?: string;
  label: string;
  contentHash?: string;
  currentContentHash?: string;
  state: "matched" | "changed" | "missing" | "unknown";
}

export interface ProjectBoardRenderedCardSplitLineage {
  parentCardId: string;
  childIndex?: number;
  source: "candidate_split" | "runtime_budget" | "proof_review" | "manual";
}

export interface ProjectBoardRenderedCardLedgerEntry {
  schemaVersion: 1;
  cardId: string;
  title: string;
  candidateStatus: ProjectBoardCardCandidateStatus;
  phase?: string;
  blockedBy: string[];
  sourceRefs: ProjectBoardRenderedCardSourceRef[];
  sourceRefIds: string[];
  sourceSnapshots: ProjectBoardRenderedCardSourceSnapshot[];
  clarificationQuestionCount: number;
  pendingClarificationCount: number;
  clarificationState: ProjectBoardRenderedCardClarificationState;
  duplicateDecision: ProjectBoardRenderedCardDuplicateDecision;
  invalidationState: ProjectBoardRenderedCardInvalidationState;
  invalidationReasons: ProjectBoardRenderedCardInvalidationReason[];
  restartAction: ProjectBoardRenderedCardRestartAction;
  renderFingerprint: string;
  userTouchedFields?: ProjectBoardCardTouchedField[];
  userTouchedAt?: string;
  splitLineage?: ProjectBoardRenderedCardSplitLineage;
}

export interface ProjectBoardRenderedCardLedger {
  schemaVersion: 1;
  cardCount: number;
  blockedCardCount: number;
  duplicateCardCount: number;
  rejectedCardCount: number;
  evidenceCardCount: number;
  splitLineageCount: number;
  invalidatedCardCount: number;
  checksum: string;
  entries: ProjectBoardRenderedCardLedgerEntry[];
}

export interface ProjectBoardCardPendingPiUpdate {
  sourceId: string;
  createdAt: string;
  changedFields: ProjectBoardCardTouchedField[];
  title?: string;
  description?: string;
  candidateStatus?: ProjectBoardCardCandidateStatus;
  priority?: number;
  phase?: string;
  labels?: string[];
  blockedBy?: string[];
  acceptanceCriteria?: string[];
  testPlan?: ProjectBoardCardTestPlan;
  sourceRefs?: string[];
  clarificationQuestions?: string[];
  clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
  clarificationAnswers?: ProjectBoardCardClarificationAnswer[];
  clarificationDecisions?: ProjectBoardCardClarificationDecision[];
  objectiveProvenance?: ProjectBoardAddCardsObjectiveProvenance;
  uiMockRole?: ProjectBoardUiMockRole;
  requiresUiMockApproval?: boolean;
}

export type ProjectBoardUiMockRole = "mock_gate" | "gated_implementation";

export interface ProjectBoardCard {
  id: string;
  boardId: string;
  title: string;
  description: string;
  status: ProjectBoardCardStatus;
  candidateStatus: ProjectBoardCardCandidateStatus;
  priority?: number;
  phase?: string;
  labels: string[];
  blockedBy: string[];
  acceptanceCriteria: string[];
  testPlan: ProjectBoardCardTestPlan;
  sourceKind: ProjectBoardCardSourceKind;
  sourceId: string;
  sourceRefs?: string[];
  clarificationQuestions?: string[];
  clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
  clarificationAnswers?: ProjectBoardCardClarificationAnswer[];
  clarificationDecisions?: ProjectBoardCardClarificationDecision[];
  runFeedback?: ProjectBoardCardRunFeedback[];
  objectiveProvenance?: ProjectBoardAddCardsObjectiveProvenance;
  uiMockRole?: ProjectBoardUiMockRole;
  requiresUiMockApproval?: boolean;
  sourceThreadId?: string;
  sourceMessageId?: string;
  orchestrationTaskId?: string;
  executionThreadId?: string;
  executionSessionPolicy?: ProjectBoardCardExecutionSessionPolicy;
  proofReview?: ProjectBoardCardProofReview;
  splitOutcome?: ProjectBoardCardSplitOutcome;
  claim?: ProjectBoardCardClaimSummary;
  claimConflicts?: ProjectBoardCardClaimSummary[];
  userTouchedFields?: ProjectBoardCardTouchedField[];
  userTouchedAt?: string;
  pendingPiUpdate?: ProjectBoardCardPendingPiUpdate;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectBoardSynthesisProposalCard {
  sourceId: string;
  title: string;
  description: string;
  candidateStatus: ProjectBoardCardCandidateStatus;
  priority?: number;
  phase?: string;
  labels: string[];
  blockedBy: string[];
  acceptanceCriteria: string[];
  testPlan: ProjectBoardCardTestPlan;
  sourceRefs: string[];
  clarificationQuestions?: string[];
  clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
  clarificationDecisions?: ProjectBoardCardClarificationDecision[];
  objectiveProvenance?: ProjectBoardAddCardsObjectiveProvenance;
  uiMockRole?: ProjectBoardUiMockRole;
  requiresUiMockApproval?: boolean;
  reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus;
  reviewReason?: string;
  mergeTargetCardId?: string;
  reviewedAt?: string;
}

export type ProjectBoardAddCardsGroundingMode = "selected_sources" | "source_scan" | "objective_only";

export interface ProjectBoardAddCardsObjectiveProvenance {
  objective: string;
  groundingMode: ProjectBoardAddCardsGroundingMode;
  selectedSourceIds: string[];
  sourceRefCount: number;
  weakGrounding: boolean;
  sourceGap?: string;
}

export interface ProjectBoardSynthesisProposalAnswer {
  questionIndex: number;
  question: string;
  answer: string;
  answeredAt: string;
}

export type ProjectBoardPmReviewReadiness =
  | "ready_for_activation"
  | "ready_for_card_generation"
  | "needs_answers"
  | "needs_source_refresh"
  | "blocked";

export type ProjectBoardPmReviewSourceConfidence = "high" | "medium" | "low" | "unknown";

export type ProjectBoardPmReviewGitState = ProjectBoardGitSyncStatus["mode"] | "unknown";

export interface ProjectBoardPmReviewReport {
  readiness: ProjectBoardPmReviewReadiness;
  summary: string;
  sourceConfidence: ProjectBoardPmReviewSourceConfidence;
  sourceConfidenceNotes: string[];
  gitState: ProjectBoardPmReviewGitState;
  gitStateNotes: string[];
  blockingQuestions: string[];
  risks: string[];
  sourceConflicts: string[];
  sourceAuthorityNotes: string[];
  recommendedActivationScope: string;
  cardGenerationConstraints: string[];
}

export interface ProjectBoardSynthesisProposal {
  id: string;
  boardId: string;
  status: ProjectBoardSynthesisProposalStatus;
  sourceFingerprint?: string;
  sourceHashes?: ProjectBoardPlanningSnapshotSourceHash[];
  summary: string;
  goal: string;
  currentState: string;
  targetUser: string;
  qualityBar: string;
  assumptions: string[];
  questions: string[];
  answers: ProjectBoardSynthesisProposalAnswer[];
  sourceNotes: string[];
  cards: ProjectBoardSynthesisProposalCard[];
  reviewReport?: ProjectBoardPmReviewReport;
  model?: string;
  durationMs?: number;
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
}

export interface ProjectBoardSynthesisRunEvent {
  stage: ProjectBoardSynthesisRunStage;
  title: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type ProjectBoardSynthesisRunProgressiveRecord = Record<string, unknown> & {
  type?: string;
};

export interface ProjectBoardSynthesisRunProgressiveSummary {
  recordCount: number;
  candidateCardCount: number;
  questionCount: number;
  sourceCoverageCount: number;
  dependencyEdgeCount: number;
  warningCount: number;
  errorCount: number;
  proposalFinalCount?: number;
  sectionSucceededCount?: number;
  sectionFailedCount?: number;
  sectionSkippedCount?: number;
  semanticIdleSectionCount?: number;
  latestSectionHeading?: string;
  latestCandidateCardTitle?: string;
  latestQuestion?: string;
  latestWarning?: string;
  latestError?: string;
  renderedCardCount?: number;
  renderedCardBlockedCount?: number;
  renderedCardDuplicateCount?: number;
  renderedCardRejectedCount?: number;
  renderedCardEvidenceCount?: number;
  renderedCardSplitLineageCount?: number;
  renderedCardInvalidatedCount?: number;
  renderedCardLedgerChecksum?: string;
  renderedCardLedger?: ProjectBoardRenderedCardLedgerEntry[];
}

export type ProjectBoardPlanningSnapshotKind = "incremental" | "paused" | "final" | "manual";

export type ProjectBoardScopeFeature =
  | "auth"
  | "accounts"
  | "analytics"
  | "sync"
  | "collaboration"
  | "notifications"
  | "backend"
  | "payments"
  | "deployment"
  | "admin_reporting";

export interface ProjectBoardScopeContract {
  included: ProjectBoardScopeFeature[];
  excluded: ProjectBoardScopeFeature[];
  requiredCapabilities?: string[];
  supportingCapabilities?: string[];
  optionalCapabilities?: string[];
  excludedCapabilities?: string[];
  planningDepth?: ProjectBoardPlanningDepthAssessment;
  planningDepthHints: string[];
  openQuestions: string[];
  evidence: string[];
}

export type ProjectBoardPlanningDepthLevel = "shallow" | "standard" | "deep" | "phased";

export interface ProjectBoardPlanningDepthAssessment {
  score: number;
  level: ProjectBoardPlanningDepthLevel;
  signals: string[];
  guidance: string;
}

export interface ProjectBoardPlanningSnapshotSourceHash {
  sourceId: string;
  sourceKey?: string;
  path?: string;
  kind: ProjectBoardSourceKind;
  contentHash?: string;
  changeState?: ProjectBoardSourceChangeState;
  includeInSynthesis?: boolean;
}

export interface ProjectBoardPlanningSnapshotCard {
  cardId: string;
  sourceId: string;
  sourceKind: ProjectBoardCardSourceKind;
  title: string;
  status: ProjectBoardCardStatus;
  candidateStatus: ProjectBoardCardCandidateStatus;
  sourceRefs: string[];
  blockedBy: string[];
  renderFingerprint: string;
  orchestrationTaskId?: string;
}

export interface ProjectBoardPlanningSnapshot {
  id: string;
  boardId: string;
  runId: string;
  kind: ProjectBoardPlanningSnapshotKind;
  planningStatus: ProjectBoardSynthesisRunStatus;
  planningStage: ProjectBoardSynthesisRunStage;
  createdAt: string;
  cardCount: number;
  readyCandidateCount: number;
  ticketizedCount: number;
  sourceHashes: ProjectBoardPlanningSnapshotSourceHash[];
  scopeContract?: ProjectBoardScopeContract;
  planningDepth?: ProjectBoardPlanningDepthAssessment;
  cardIds: string[];
  cards: ProjectBoardPlanningSnapshotCard[];
  renderFingerprint: string;
}

export interface ProjectBoardSynthesisRun {
  id: string;
  boardId: string;
  proposalId?: string;
  retryOfRunId?: string;
  status: ProjectBoardSynthesisRunStatus;
  stage: ProjectBoardSynthesisRunStage;
  model?: string;
  sourceCount: number;
  includedSourceCount: number;
  sourceCharCount: number;
  promptCharCount?: number;
  responseCharCount?: number;
  cardCount?: number;
  questionCount?: number;
  warningCount: number;
  error?: string;
  progressiveRecordCount?: number;
  progressiveSummary?: ProjectBoardSynthesisRunProgressiveSummary;
  progressiveRecords?: ProjectBoardSynthesisRunProgressiveRecord[];
  planningSnapshots?: ProjectBoardPlanningSnapshot[];
  events: ProjectBoardSynthesisRunEvent[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type ProjectBoardExecutionArtifactSource = "git" | "local_export";

export interface ProjectBoardExecutionArtifactProof {
  summary: string;
  commands: string[];
  changedFiles: string[];
  screenshots: string[];
  browserTraces: string[];
  visualChecks: Record<string, unknown>[];
  manualChecks: string[];
  createdAt: string;
}

export interface ProjectBoardExecutionArtifactHandoffFollowUp {
  title: string;
  reason: string;
  blockedBy: string[];
}

export interface ProjectBoardExecutionArtifactHandoff {
  summary: string;
  completed: string[];
  remaining: string[];
  risks: string[];
  followUps: ProjectBoardExecutionArtifactHandoffFollowUp[];
  createdAt: string;
}

export interface ProjectBoardExecutionArtifact {
  id: string;
  boardId: string;
  cardId: string;
  status: string;
  source: ProjectBoardExecutionArtifactSource;
  agentId?: string;
  piSessionId?: string;
  workspaceBranch?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  proof?: ProjectBoardExecutionArtifactProof;
  handoff?: ProjectBoardExecutionArtifactHandoff;
  createdAt: string;
}

export interface ProjectBoardEvent {
  id: string;
  boardId: string;
  kind: ProjectBoardEventKind;
  title: string;
  summary: string;
  entityKind?: string;
  entityId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ProjectBoardSummary {
  id: string;
  projectPath: string;
  sourceThreadId?: string;
  status: ProjectBoardStatus;
  title: string;
  summary: string;
  charterId?: string;
  charter?: ProjectBoardCharter;
  activeDraftId?: string;
  cards: ProjectBoardCard[];
  sources: ProjectBoardSource[];
  questions: ProjectBoardQuestion[];
  proposals: ProjectBoardSynthesisProposal[];
  synthesisRuns?: ProjectBoardSynthesisRun[];
  executionArtifacts?: ProjectBoardExecutionArtifact[];
  events?: ProjectBoardEvent[];
  claims?: {
    active: ProjectBoardCardClaimSummary[];
    expired: ProjectBoardCardClaimSummary[];
    conflicts: ProjectBoardCardClaimSummary[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface ProjectBoardGitSyncProjectionSummary {
  ok: boolean;
  valid: boolean;
  differenceCount: number;
  differences: string[];
  conflictCount?: number;
  changes?: ProjectBoardGitProjectionChange[];
  fileCount: number;
  cardCount: number;
  sourceCount: number;
  eventCount: number;
  proposalRunCount: number;
  runArtifactCount?: number;
  activeClaimCount?: number;
  expiredClaimCount?: number;
  claimConflictCount?: number;
  claimedCardIds?: string[];
}

export type ProjectBoardGitProjectionChangeKind = "board" | "charter" | "source" | "card" | "event" | "proposal" | "runtime" | "other";

export type ProjectBoardGitProjectionChangeAction = "add" | "remove" | "update" | "invalid";

export type ProjectBoardGitProjectionResolution = "apply_pulled" | "keep_local" | "defer" | "manual_resolution_required";

export interface ProjectBoardGitProjectionResolutionDecision {
  changeId?: string;
  entityId?: string;
  resolution: Exclude<ProjectBoardGitProjectionResolution, "manual_resolution_required">;
}

export interface ProjectBoardGitProjectionChangeSide {
  title?: string;
  status?: string;
  candidateStatus?: string;
  updatedAt?: string;
}

export interface ProjectBoardGitProjectionChange {
  id: string;
  kind: ProjectBoardGitProjectionChangeKind;
  action: ProjectBoardGitProjectionChangeAction;
  entityId?: string;
  title: string;
  summary: string;
  local?: ProjectBoardGitProjectionChangeSide;
  pulled?: ProjectBoardGitProjectionChangeSide;
  changedFields?: string[];
  conflict: boolean;
  conflictReason?: string;
  recommendedResolution: ProjectBoardGitProjectionResolution;
  applyConsequence: string;
  keepLocalConsequence: string;
  deferConsequence: string;
}

export interface ProjectBoardGitSyncStatus {
  boardId: string;
  projectRoot: string;
  artifactRoot: string;
  isGitRepository: boolean;
  repoRoot?: string;
  branch?: string;
  hasCommit?: boolean;
  remote?: string;
  hasRemote: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
  dirtyBoardFileCount: number;
  dirtyBoardFiles: string[];
  mode: "local_only" | "git_no_remote" | "git_ready";
  message?: string;
  projection?: ProjectBoardGitSyncProjectionSummary;
  lastBoardCommit?: {
    hash: string;
    shortHash: string;
    subject: string;
    committedAt: string;
  };
  exportedAt?: string;
}

export interface ProjectBoardGitSyncInput {
  boardId: string;
  message?: string;
  resolutions?: ProjectBoardGitProjectionResolutionDecision[];
}

export interface ProjectBoardGitCardClaimInput {
  boardId: string;
  cardId: string;
}

export interface ProjectBoardGitCardClaimReleaseInput {
  boardId: string;
  cardId: string;
  force?: boolean;
  reason?: string;
}

export interface ProjectBoardCharter {
  id: string;
  boardId: string;
  version: number;
  status: ProjectBoardCharterStatus;
  goal: string;
  currentState: string;
  targetUser: string;
  nonGoals: string[];
  qualityBar: string;
  testPolicy: Record<string, unknown>;
  decisionPolicy: Record<string, unknown>;
  dependencyPolicy: Record<string, unknown>;
  budgetPolicy: Record<string, unknown>;
  sourcePolicy: Record<string, unknown>;
  markdown: string;
  projectSummary?: ProjectBoardCharterProjectSummary;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectBoardCharterProjectSummary {
  summary: string;
  majorSystems: string[];
  sourceCoverage: string[];
  risks: string[];
  dependencyHints: string[];
  unresolvedDecisions: string[];
  citations: string[];
  coverageGaps: string[];
  sourceChecksumSet: string[];
  charterAnswerChecksum: string;
  kickoffContextBrief?: ProjectBoardKickoffContextBrief;
  generatedAt: string;
  generator: "ambient_rlm" | "fallback_heuristic";
}

export interface ProjectBoardKickoffContextBriefSource {
  sourceId: string;
  sourceKey?: string;
  title: string;
  kind: ProjectBoardSourceKind;
  authorityRole?: ProjectBoardSourceAuthorityRole;
  includeInSynthesis: boolean;
  relevance: number;
  path?: string;
  threadId?: string;
  artifactId?: string;
  summary: string;
  keyFacts: string[];
  proofExpectations: string[];
  dependencyHints: string[];
  risks: string[];
}

export interface ProjectBoardKickoffContextBrief {
  summary: string;
  sourceIds: string[];
  durablePlanSourceIds: string[];
  includedSourceCount: number;
  ignoredSourceCount: number;
  sourceNotes: ProjectBoardKickoffContextBriefSource[];
  proofExpectations: string[];
  dependencyHints: string[];
  risks: string[];
  unresolvedSignals: string[];
  generatedAt: string;
  generator: "source_digest" | "ambient_rlm";
}

export interface CreateProjectBoardInput {
  projectId: string;
  title?: string;
  summary?: string;
}

export interface UpdateProjectBoardStatusInput {
  boardId: string;
  status: ProjectBoardStatus;
}

export interface ReviseProjectBoardInput {
  boardId: string;
  reason?: string;
}

export interface CancelProjectBoardRevisionInput {
  boardId: string;
}

export interface ResetProjectBoardInput {
  boardId: string;
}

export interface RetryProjectBoardSynthesisInput {
  boardId: string;
  retryOfRunId?: string;
  mode?: "full" | "failed_sections" | "stalled_run" | "continue_batch" | "paused_run" | "start_fresh";
}

export interface PauseProjectBoardSynthesisInput {
  boardId: string;
  runId: string;
  reason?: string;
}

export interface SeedProjectBoardSemanticIdleDogfoodInput {
  boardId: string;
}

export interface SeedProjectBoardProofJudgmentDogfoodInput {
  boardId: string;
}

export interface SeedProjectBoardCanonicalProjectionDogfoodInput {
  boardId: string;
}

export interface SeedProjectBoardDeliverableIntegrationDogfoodInput {
  boardId: string;
}

export interface ProjectBoardProofJudgmentDogfoodResult {
  state: DesktopState;
  boardId: string;
  cardId: string;
  runId: string;
  proofReview?: ProjectBoardCardProofReview;
}

export interface ProjectBoardCanonicalProjectionDogfoodScenario {
  name: "stopwatch_retry_cleanup" | "csv_stopped_after_proof";
  cardId: string;
  taskId: string;
  runIds: string[];
}

export interface ProjectBoardCanonicalProjectionDogfoodResult {
  state: DesktopState;
  boardId: string;
  scenarios: ProjectBoardCanonicalProjectionDogfoodScenario[];
}

export interface ProjectBoardDeliverableIntegrationDogfoodScenario {
  name: "pomodoro_root_apply" | "recipe_index_export" | "deferred_theme_review";
  cardId: string;
  taskId: string;
  runId: string;
  workspacePath: string;
  materialFiles: string[];
  excludedFiles: string[];
}

export interface ProjectBoardDeliverableIntegrationDogfoodResult {
  state: DesktopState;
  boardId: string;
  scenarios: ProjectBoardDeliverableIntegrationDogfoodScenario[];
}

export interface DeferProjectBoardSynthesisSectionsInput {
  boardId: string;
  runId: string;
  reason?: string;
}

export interface PromotePlannerPlanToBoardInput {
  artifactId: string;
}

export interface ApproveProjectBoardCardInput {
  cardId: string;
}

export interface ResolveProjectBoardProofDecisionInput {
  cardId: string;
  action: ProjectBoardProofDecisionAction;
  reason?: string;
}

export interface RerunProjectBoardProofInput {
  cardId: string;
  reason?: string;
}

export interface ResolveProjectBoardDeliverableIntegrationInput {
  boardId: string;
  runId: string;
  action: "apply_to_root" | "export_bundle" | "defer";
  reason?: string;
}

export interface RecomputeProjectBoardProofCoverageInput {
  boardId: string;
}

export interface SuggestProjectBoardProofInput {
  boardId: string;
  cardIds?: string[];
}

export interface ResolveProjectBoardSplitDecisionInput {
  cardId: string;
  action: ProjectBoardSplitDecisionAction;
  reason?: string;
}

export interface CreateReadyProjectBoardTasksInput {
  boardId: string;
}

export interface SplitProjectBoardCardInput {
  cardId: string;
}

export interface CreateProjectBoardCardInput {
  boardId: string;
  title?: string;
  description?: string;
}

export type AttachProjectBoardLocalTaskMode = "attach" | "evidence";

export interface AttachProjectBoardLocalTaskInput {
  taskId: string;
  mode: AttachProjectBoardLocalTaskMode;
}

export interface UpdateProjectBoardCardInput {
  cardId: string;
  title?: string;
  description?: string;
  candidateStatus?: ProjectBoardCardCandidateStatus;
  priority?: number | null;
  phase?: string | null;
  labels?: string[];
  blockedBy?: string[];
  acceptanceCriteria?: string[];
  testPlan?: ProjectBoardCardTestPlan;
  sourceRefs?: string[];
  clarificationQuestions?: string[];
  clarificationSuggestions?: ProjectBoardCardClarificationSuggestion[];
  clarificationAnswers?: ProjectBoardCardClarificationAnswer[];
  clarificationDecisions?: ProjectBoardCardClarificationDecision[];
}

export interface UpdateProjectBoardCardCandidateInput {
  cardId: string;
  candidateStatus: ProjectBoardCardCandidateStatus;
}

export interface ResolveProjectBoardCardPiUpdateInput {
  cardId: string;
  action: "apply" | "ignore";
}

export interface AddProjectBoardCardRunFeedbackInput {
  cardId: string;
  feedback: string;
  source?: ProjectBoardCardRunFeedbackSource;
  decisionQuestion?: string;
  decisionAnswer?: string;
  sourceImpactEventId?: string;
  sourceImpactEventIds?: string[];
  sourceIds?: string[];
}

export interface CopyProjectBoardSessionToThreadInput {
  cardId: string;
  runId: string;
}

export interface SuggestProjectBoardClarificationDefaultsInput {
  boardId: string;
  cardIds?: string[];
}

export interface SuggestProjectBoardKickoffDefaultsInput {
  boardId: string;
  questionIds?: string[];
}

export interface ApplyProjectBoardDecisionImpactFeedbackInput {
  cardId: string;
  question: string;
  answer: string;
}

export interface RefreshProjectBoardDecisionDraftsInput {
  cardId: string;
  question: string;
  answer: string;
}

export interface RegenerateProjectBoardDecisionDraftsInput {
  cardId: string;
  question: string;
  answer: string;
}

export type ProjectBoardDecisionDraftRefreshConfidence = "high" | "medium" | "low";

export interface ProjectBoardDecisionDraftRefreshSuggestion {
  cardId: string;
  description?: string;
  labels?: string[];
  acceptanceCriteria?: string[];
  testPlan?: ProjectBoardCardTestPlan;
  clarificationQuestions?: string[];
  rationale?: string;
  confidence?: ProjectBoardDecisionDraftRefreshConfidence;
}

export interface RefreshProjectBoardSourceDraftsInput {
  boardId: string;
  sourceId?: string;
  sourceIds?: string[];
  sourceImpactEventId?: string;
}

export interface RegenerateProjectBoardSourceDraftsInput {
  boardId: string;
  sourceId?: string;
  sourceIds?: string[];
  sourceImpactEventId?: string;
}

export type ProjectBoardSourceDraftRefreshConfidence = "high" | "medium" | "low";

export interface ProjectBoardSourceDraftRefreshSuggestion {
  cardId: string;
  description?: string;
  labels?: string[];
  acceptanceCriteria?: string[];
  testPlan?: ProjectBoardCardTestPlan;
  clarificationQuestions?: string[];
  rationale?: string;
  confidence?: ProjectBoardSourceDraftRefreshConfidence;
}

export interface ApplyProjectBoardSourceImpactFeedbackInput {
  boardId: string;
  sourceId?: string;
  sourceIds?: string[];
  sourceImpactEventId?: string;
}

export interface RefreshProjectBoardSourcesInput {
  boardId: string;
}

export interface RefineProjectBoardSynthesisInput {
  boardId: string;
  proposalId?: string;
  mode?: "charter_review" | "board_synthesis" | "source_elaboration";
  sourceIds?: string[];
  objective?: string;
}

export interface AnswerProjectBoardSynthesisProposalQuestionInput {
  proposalId: string;
  questionIndex: number;
  answer: string;
}

export interface ReviewProjectBoardSynthesisProposalCardInput {
  proposalId: string;
  sourceId: string;
  reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus;
  reason?: string;
  mergeTargetCardId?: string;
}

export interface ApplyProjectBoardSynthesisProposalInput {
  proposalId: string;
  replaceExistingDraft?: boolean;
}

export interface UpdateProjectBoardSourceInput {
  sourceId: string;
  kind: ProjectBoardSourceKind;
  includeInSynthesis?: boolean;
}

export interface AnswerProjectBoardQuestionInput {
  questionId: string;
  answer: string;
}

export interface FinalizeProjectBoardKickoffInput {
  boardId: string;
}
