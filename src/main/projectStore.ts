import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type {
  AutomationFolderSummary,
  AutomationRunSummary,
  AutomationScheduleExceptionKind,
  AutomationScheduleExceptionStatus,
  AutomationScheduleExceptionSummary,
  AutomationScheduleOccurrenceActionInput,
  AutomationScheduleOccurrenceActionResult,
  AutomationScheduleSummary,
  AutomationScheduleTargetKind,
  AutomationThreadKind,
  AmbientCompactionSettings,
  AmbientFeatureFlagSnapshot,
  CallableWorkflowTaskRestartReconciliationSummary,
  CallableWorkflowTaskStatus,
  CallableWorkflowTaskSummary,
  ModelRuntimeSettings,
  CreateAutomationScheduleInput,
  UpdateAutomationScheduleInput,
  ChatMessage,
  ContextUsageSnapshot,
  CreateAutomationFolderInput,
  CreateAmbientPermissionGrantInput,
  CreateOrchestrationTaskInput,
  CreateWorkflowAgentFolderInput,
  CreateWorkflowAgentThreadInput,
  CreateSubagentRunInput,
  CreateWorkflowArtifactInput,
  CreateWorkflowExplorationTraceInput,
  UpdateWorkflowExplorationTraceInput,
  AnswerWorkflowDiscoveryQuestionInput,
  CreateWorkflowGraphSnapshotInput,
  CreateWorkflowRevisionInput,
  CreateWorkflowVersionInput,
  DesktopSettings,
  CollaborationMode,
  AddProjectBoardCardRunFeedbackInput,
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ApplyProjectBoardSourceImpactFeedbackInput,
  CopyProjectBoardSessionToThreadInput,
  RecomputeProjectBoardProofCoverageInput,
  RefreshProjectBoardDecisionDraftsInput,
  RefreshProjectBoardSourceDraftsInput,
  MessageVoiceState,
  OrchestrationBoard,
  OrchestrationRun,
  OrchestrationTask,
  PermissionAuditDecision,
  PermissionAuditEntry,
  AmbientPermissionGrant,
  PermissionMode,
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardClarificationAnswer,
  ProjectBoardCardClarificationDecision,
  ProjectBoardCardClarificationSuggestion,
  ProjectBoardCardExecutionSessionPolicy,
  ProjectBoardCardProofRecommendedAction,
  ProjectBoardCardProofReview,
  ProjectBoardCardProofReviewStatus,
  ProjectBoardCardSplitOutcome,
  ProjectBoardCardSplitOutcomeStatus,
  ProjectBoardCardPendingPiUpdate,
  ProjectBoardCardRunFeedback,
  ProjectBoardCardStatus,
  ProjectBoardCardTestPlan,
  ProjectBoardCardTouchedField,
  ProjectBoardCharter,
  ProjectBoardCharterProjectSummary,
  ProjectBoardDecisionDraftRefreshSuggestion,
  ProjectBoardEvent,
  ProjectBoardExecutionArtifact,
  ProjectBoardProofDecisionAction,
  ProjectBoardPmReviewReport,
  ProjectBoardPlanningDepthAssessment,
  ProjectBoardPlanningSnapshot,
  ProjectBoardPlanningSnapshotCard,
  ProjectBoardPlanningSnapshotKind,
  ProjectBoardPlanningSnapshotSourceHash,
  ProjectBoardSplitDecisionAction,
  ProjectBoardQuestion,
  ProjectBoardSource,
  ProjectBoardSourceDraftRefreshSuggestion,
  ProjectBoardSourceKind,
  ProjectBoardStatus,
  ProjectBoardScopeContract,
  ProjectBoardScopeFeature,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisProposalCardReviewStatus,
  ProjectBoardSynthesisRun,
  ProjectBoardSynthesisRunEvent,
  ProjectBoardSynthesisRunProgressiveRecord,
  ProjectBoardSynthesisRunStage,
  ProjectBoardSynthesisRunStatus,
  ProjectBoardSummary,
  PlannerDecisionQuestion,
  PlannerDurableArtifactValidationResult,
  PlannerPlanArtifact,
  PlannerPlanArtifactStatus,
  PlannerPlanFinalizationAttempt,
  PlannerPlanFinalizationAttemptStatus,
  PlannerPlanWorkflowState,
  PermissionRisk,
  RecordWorkflowModelCallInput,
  ResolveWorkflowRevisionInput,
  ResolveOrchestrationWorkflowImpactAction,
  RunDiagnostics,
  SaveSymphonyWorkflowRecipeInput,
  SubagentMailboxDeliveryState,
  SubagentMailboxDirection,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentPersistedChildTreeRepairAction,
  SubagentPersistedChildTreeRepairResult,
  SubagentPromptSnapshotSummary,
  SubagentRepairDiagnosticsReport,
  SubagentRestartReconciliationSummary,
  SubagentRunEventSummary,
  SubagentRunStatus,
  SubagentRunSummary,
  SubagentSpawnEdgeSummary,
  SubagentPatternGraphSnapshot,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierFailurePolicy,
  SubagentWaitBarrierMode,
  SubagentWaitBarrierStatus,
  SubagentWaitBarrierSummary,
  ThreadKind,
  ThinkingLevel,
  ThreadGoal,
  ThreadGoalAccountInput,
  ThreadGoalCreateInput,
  ThreadGoalSetInput,
  ThreadGoalStatus,
  ThreadSummary,
  ThreadWorktreeSummary,
  WorkflowRecordingLibraryDescription,
  WorkflowRecordingLibraryEntry,
  WorkflowRecordingPlaybookDraft,
  WorkflowRecordingReviewDraftUpdate,
  WorkflowRecordingSavedPlaybook,
  WorkflowRecordingState,
  WorkflowLabCandidatePatch,
  WorkflowLabEvaluationResult,
  WorkflowLabRun,
  WorkflowLabRunStatus,
  WorkflowLabVariant,
  WorkflowLabVariantStatus,
  CreateWorkflowLabRunInput,
  ListWorkflowLabRunsInput,
  SearchWorkflowRecordingsInput,
  MoveAutomationThreadInput,
  MoveWorkflowAgentThreadInput,
  UpdateWorkflowArtifactInput,
  UpdateWorkflowRevisionInput,
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadPhase,
  WorkflowAgentThreadSummary,
  WorkflowArtifactStatus,
  WorkflowArtifactSummary,
  WorkflowDiscoveryQuestion,
  WorkflowDiscoveryQuestionCategory,
  WorkflowGraphSnapshot,
  WorkflowExplorationTraceSummary,
  WorkflowModelCallRecord,
  WorkflowRecoveryContext,
  WorkflowRunEvent,
  WorkflowRunLimitOverrides,
  WorkflowRunProviderHealth,
  WorkflowRunRetryMetadata,
  WorkflowRunScheduleSummary,
  WorkflowRunStatus,
  WorkflowRunSummary,
  WorkflowRevisionSummary,
  WorkflowVersionStatus,
  WorkflowVersionSummary,
  WorkspaceSearchScope,
  WorkspaceSearchResult,
  WorkspaceState,
} from "../shared/types";
import type { AmbientModelRuntimeCatalog } from "../shared/ambientModels";
import type { CallableWorkflowExecutionPlan } from "./callableWorkflowExecutionPlan";
import {
  analyzeCallableWorkflowTaskRestartState,
  CALLABLE_WORKFLOW_TASK_CONTROL_EVENT_TYPE,
  CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE,
  CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE,
  buildCallableWorkflowCompilerHandoffPlan,
  callableWorkflowPatternGraphSnapshotWithChildBinding,
  callableWorkflowQueuedTaskDraftFromExecutionPlan,
  type CallableWorkflowPatternGraphChildBindingRequest,
  type CallableWorkflowTaskControlAction,
  type CallableWorkflowCompilerHandoffPlan,
} from "./callableWorkflowTaskQueue";
import {
  analyzeSubagentRestartState,
  createSubagentRepairDiagnosticsReport,
  interruptedSubagentResultArtifact,
  uniqueSubagentRepairIds,
} from "./subagentRepair";
import {
  summarizeSubagentObservability,
  type SubagentObservabilitySummary,
} from "./subagentObservability";
import {
  evaluateSubagentMaturity,
  type SubagentMaturityInput,
} from "./subagentMaturity";
import {
  type SubagentMaturityEvidence,
  type SubagentMaturityEvidenceKind,
  type SubagentMaturityEvidenceStatus,
  type SubagentMaturitySnapshot,
  type SubagentDesktopDogfoodHistoryEntry,
  type SubagentReleaseGateLiveHistoryEntry,
  type SubagentWorkflowJitterReleaseProfileCheck,
  type SubagentWorkflowJitterReleaseProfileReport,
} from "../shared/subagentMaturity";
import {
  applySubagentBatchResultReport as applySubagentBatchResultReportToLedger,
  createSubagentBatchProgressParentMailboxIdempotencyKey,
  createSubagentBatchProgressParentMailboxPayload,
  createSubagentBatchResultLedger,
  SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_TYPE,
  type SubagentBatchJobPlan,
  type SubagentBatchJobRecord,
  type SubagentBatchReportApplyResult,
  type SubagentBatchResultReport,
} from "./subagentBatchJobs";
import {
  workflowLabApplyRunStatus,
  workflowLabApplyVariantAdoption,
  workflowLabAppendVariant,
  workflowLabCreateRun,
  workflowLabListRuns,
  workflowLabReadRun,
  workflowLabRecordEvaluation,
  workflowLabRequireAcceptedVariant,
  workflowLabRequireBaseVersion,
  workflowLabRunArtifactPath,
  workflowLabWriteRun,
} from "./workflowLab";
import {
  planSubagentRetention,
  type SubagentRetentionCleanupResult,
  type SubagentRetentionPlan,
} from "./subagentRetention";
import {
  getDefaultSubagentRoleProfile,
  type SubagentRoleId,
} from "../shared/subagentRoles";
import { isSubagentEffectiveRoleSnapshot } from "../shared/subagentPatternGraph";
import {
  isAmbientSubagentsEnabled,
  resolveAmbientFeatureFlags,
  type AmbientFeatureFlagSettings,
  type UpdateFeatureFlagSettingsInput,
} from "../shared/featureFlags";
import type {
  AgentMemorySettings,
  UpdateAgentMemorySettingsInput,
} from "../shared/agentMemorySettings";
import {
  getSymphonyWorkflowRecipePreset,
  missingRequiredSymphonyMetricTemplateLabels,
  requiredSymphonyMetricTemplateErrorMessage,
  type SymphonyWorkflowRecipePreset,
} from "../shared/symphonyWorkflowRecipes";
import {
  fallbackSubagentCapacityLease,
  materializeSubagentCapacityLeaseForRun,
  releaseSubagentCapacityLease,
} from "../shared/subagentCapacity";
import { AMBIENT_SUBAGENT_PROTOCOL_VERSION } from "../shared/subagentProtocol";
import {
  assertSubagentParentMailboxEventAttribution,
  assertSubagentRunEventAttribution,
  assertSubagentRunLinkage,
} from "./subagentInvariants";
import { subagentLifecycleEventType, subagentLifecycleHookPreview } from "./subagentLifecycleHooks";
import {
  SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_TYPE,
  subagentLifecycleInterruptionIdempotencyKey,
  subagentLifecycleInterruptionParentMailboxPayload,
  type SubagentLifecycleInterruptionSource,
} from "./subagentLifecycleParentMailbox";
import {
  buildSubagentGroupedCompletionNotificationDraft,
  SUBAGENT_GROUPED_COMPLETION_PARENT_MAILBOX_TYPE,
} from "./subagentGroupJoin";
import { cancelPendingParentToChildMailboxEvents } from "./subagentMailbox";
import {
  applyWorkflowRecordingSummaryState,
  assertWorkflowRecordingReviewDraftReusable,
  confirmWorkflowRecordingReviewState,
  startWorkflowRecordingState,
  stopWorkflowRecordingState,
  updateWorkflowRecordingReviewDraftState,
  workflowRecordingApplyReviewValidationIssues,
  WorkflowRecordingReviewValidationError,
  workflowRecordingTitle,
} from "../shared/workflowRecorder";
import {
  workflowRecordingArchiveLifecyclePatch,
  workflowRecordingAssertBaseVersion,
  workflowRecordingApplyLibraryLifecycleUpdate,
  workflowRecordingApplyRestoredPlaybookState,
  workflowRecordingApplySavedPlaybookLifecycle,
  workflowRecordingApplySavedPlaybookReviewState,
  workflowRecordingFindLibraryRecord,
  workflowRecordingFindSummaryMessage,
  workflowRecordingIndexWithEntry,
  workflowRecordingLibraryDescription,
  workflowRecordingLibraryIndexPaths,
  workflowRecordingLibraryVersions,
  workflowRecordingListLibraryEntries,
  workflowRecordingNextSavedPlaybook,
  workflowRecordingPlaybookId,
  workflowRecordingPreparePlaybookEdit,
  workflowRecordingReadLibraryIndexes,
  workflowRecordingReadRestorableVersionSource,
  workflowRecordingRequireLibraryEntry,
  workflowRecordingRequireLibraryRecord,
  workflowRecordingRequireLibraryVersion,
  workflowRecordingRequireStoppedReviewDraft,
  workflowRecordingSaveConfirmedPlaybook,
  workflowRecordingSavedPlaybookForWorkspace,
  workflowRecordingThreadReference,
  workflowRecordingUnarchiveLifecyclePatch,
  workflowRecordingWriteEditedPlaybookPackageWithIndex,
  workflowRecordingWritePlaybookPackageWithIndex,
  workflowRecordingWriteRestoredPlaybookPackageWithIndex,
  type WorkflowRecordingLifecyclePatch,
  type WorkflowRecordingLibraryIndex,
} from "./workflowRecordingLibrary";
import {
  applyProjectStoreBootstrapSchema,
  applyProjectStoreSchemaMigrationSteps,
  backfillProjectStoreOrchestrationTaskProjectPath,
  backfillProjectStoreThreadLastReadAt,
  PROJECT_STORE_SCHEMA_MIGRATION_STEPS_AFTER_ORCHESTRATION_BACKFILL_BEFORE_PLANNER_REPAIR,
  PROJECT_STORE_SCHEMA_MIGRATION_STEPS_AFTER_PLANNER_REPAIR,
  PROJECT_STORE_SCHEMA_MIGRATION_STEPS_BEFORE_ORCHESTRATION_BACKFILL,
  migrateProjectStoreProjectBoardThreadScope,
  repairProjectStorePlannerPlanWorkflowStates,
  replaceProjectStoreLegacyModelId,
} from "./projectStoreSchema";
import {
  mapMessageRow,
  mapMessageVoiceStateRow,
  mapThreadRow,
  mapThreadWorktreeRow,
  mapWorkspaceSearchMessageRow,
  mapWorkspaceSearchThreadRow,
  type MessageRow,
  type MessageVoiceStateRow,
  type SearchMessageRow,
  type ThreadRow,
  type ThreadWorktreeRow,
} from "./projectStoreThreadMappers";
import {
  mapRunRow,
  type ActivePersistedRunStatus,
  type RunRecord,
  type RunRow,
  type TerminalPersistedRunStatus,
} from "./projectStoreRunMappers";
import {
  mapOrchestrationRunRow,
  mapOrchestrationTaskRow,
  type OrchestrationRunRow,
  type OrchestrationTaskRow,
} from "./projectStoreOrchestrationMappers";
import {
  automationThreadId,
  compareAutomationFolders,
  compareAutomationThreads,
  latestOrchestrationRunForTask,
  latestWorkflowRunForArtifact,
  mapAutomationFolderRow,
  mapAutomationOrchestrationTaskThread,
  mapAutomationScheduleExceptionRow,
  mapAutomationScheduleRow,
  mapAutomationWorkflowArtifactThread,
  parseAutomationThreadId,
  type AutomationFolderRow,
  type AutomationScheduleExceptionRow,
  type AutomationScheduleRow,
} from "./projectStoreAutomationMappers";
import {
  mapPlannerDecisionQuestionRow,
  mapPlannerPlanArtifactRow,
  parsePlannerDecisionOptions,
  plannerPlanWorkflowStateForQuestions,
  type PlannerDecisionQuestionRow,
  type PlannerPlanArtifactRow,
} from "./projectStorePlannerMappers";
import { ProjectStoreArtifactDraftRepository } from "./projectStoreArtifactDraftRepository";
import {
  callableWorkflowTaskFinishState,
  callableWorkflowTaskProgressSnapshot,
  callableWorkflowTaskUsageSnapshot,
  compareWorkflowAgentFolders,
  compareWorkflowAgentThreads,
  mapCallableWorkflowTaskRow,
  mapWorkflowAgentFolderRow,
  mapWorkflowAgentThreadRow,
  mapWorkflowArtifactRow,
  mapWorkflowDiscoveryQuestionRow,
  mapWorkflowExplorationTraceRow,
  mapWorkflowGraphSnapshotRow,
  mapWorkflowModelCallRow,
  mapWorkflowRevisionRow,
  mapWorkflowRunRow,
  mapWorkflowRunEventRow,
  mapWorkflowRunScheduleSummaryRow,
  mapWorkflowVersionRow,
  workflowAgentPhaseForArtifactStatus,
  type CallableWorkflowTaskRow,
  type WorkflowAgentFolderRow,
  type WorkflowAgentThreadRow,
  type WorkflowArtifactRow,
  type WorkflowDiscoveryQuestionRow,
  type WorkflowExplorationTraceRow,
  type WorkflowGraphSnapshotRow,
  type WorkflowModelCallRow,
  type WorkflowRevisionRow,
  type WorkflowRunRow,
  type WorkflowRunEventRow,
  type WorkflowRunScheduleEventRow,
  type WorkflowVersionRow,
} from "./projectStoreWorkflowMappers";
import {
  compactSubagentCapacityLeasePreview,
  compactSubagentMailboxEventForPreview,
  mapSubagentBatchJobRow,
  mapSubagentBatchResultReportRow,
  mapSubagentMailboxEventRow,
  mapSubagentMaturityEvidenceRow,
  mapSubagentParentMailboxEventRow,
  mapSubagentPromptSnapshotRow,
  mapSubagentRunRow,
  mapSubagentRunEventRow,
  mapSubagentSpawnEdgeRow,
  mapSubagentToolScopeSnapshotRow,
  mapSubagentWaitBarrierRow,
  latestSubagentMaturityEvidence,
  normalizeSubagentMaturityEvidenceKind,
  normalizeSubagentMaturityEvidenceStatus,
  normalizeOptionalString,
  passedSubagentMaturityEvidenceCount,
  resolveSubagentWaitBarrierQuorumThreshold,
  subagentApprovalRoutingVisibilityFromEvidence,
  subagentBugEvidenceFromAudit,
  subagentCompletionGuardVisibilityFromEvidence,
  subagentEventAttributionIntegrityFromEvidence,
  subagentLifecycleArtifactPath,
  subagentLifecycleControlIntegrityFromEvidence,
  subagentMaturityEvidencePassed,
  subagentProductionUiVisibilityFromEvidence,
  subagentRetentionPolicyIntegrityFromEvidence,
  subagentSecurityReviewFromEvidence,
  subagentToolScopeIntegrityFromEvidence,
  subagentSpawnEdgeRecordForRun,
  subagentRunStatusIsTerminal,
  type SubagentBatchJobRow,
  type SubagentBatchResultReportRow,
  type SubagentMailboxEventRow,
  type SubagentMaturityEvidenceRow,
  type SubagentParentMailboxEventRow,
  type SubagentPromptSnapshotRow,
  type SubagentRunRow,
  type SubagentRunEventRow,
  type SubagentSpawnEdgeRow,
  type SubagentToolScopeSnapshotRow,
  type SubagentWaitBarrierRow,
} from "./projectStoreSubagentMappers";
import {
  mapPermissionGrantRow,
  mapPermissionAuditRow,
  type AmbientPermissionGrantRow,
  type PermissionAuditRow,
} from "./projectStorePermissionMappers";
import {
  mapThreadGoalRow,
  type ThreadGoalRow,
} from "./projectStoreGoalMappers";
import {
  mapContextUsageSnapshotRow,
  type ContextUsageSnapshotRow,
} from "./projectStoreContextMappers";
import {
  DURABLE_PLAN_SOURCE_AUTHORITY_REASON,
  hashProjectBoardSourceContent,
  projectBoardSourceIncludedInSynthesis,
  projectBoardSourceKey,
} from "./projectBoardSourceIdentity";
import {
  projectBoardPlanDisplayTitle,
  projectBoardPlanTitleIsGeneric,
} from "../shared/projectBoardPlanIdentity";
import { stableBoardArtifactId } from "./projectBoardArtifacts";
import type { ProjectBoardArtifactProjection, ProjectBoardRunArtifactProjection } from "./projectBoardArtifactImport";
import {
  dedupeProjectBoardSynthesisRunProgressiveRecords,
  evaluateProjectBoardCardProof,
  mapProjectBoardCardRow,
  mapProjectBoardCharterRow,
  mapProjectBoardEventRow,
  mapProjectBoardExecutionArtifactRow,
  mapProjectBoardQuestionRow,
  mapProjectBoardRow,
  mapProjectBoardSourceRow,
  mapProjectBoardSynthesisProposalRow,
  mapProjectBoardSynthesisRunRow,
  normalizeCardTextList,
  objectiveProvenanceJson,
  normalizeProjectBoardSourceInputs,
  normalizeProjectBoardCardRunFeedback,
  normalizeProjectBoardCardRunFeedbackSource,
  normalizeProjectBoardCardExecutionSessionPolicy,
  normalizeProjectBoardCardTestPlan,
  normalizeProjectBoardClarificationAnswers,
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
  normalizeProjectBoardClarificationSuggestions,
  normalizeProjectBoardPlanningSnapshot,
  normalizeProjectBoardProofFollowUpSuggestion,
  normalizeProjectBoardSynthesisClarificationFields,
  normalizeProjectBoardSynthesisRunEvent,
  normalizeProjectBoardSynthesisRunProgressiveRecord,
  normalizeRunFollowUps,
  normalizeRuntimeBudgetCriteria,
  normalizeProjectBoardUiMockRole,
  normalizeTaskState,
  normalizeTaskLabels,
  normalizeTaskReferences,
  normalizeUnknownProjectBoardTestPlan,
  plannerPlanCandidateStatus,
  plannerPlanClarificationDecisions,
  plannerPlanClarificationQuestions,
  plannerPlanDraftCards,
  plannerPlanShouldStayCompact,
  parseProjectBoardClarificationAnswers,
  parseProjectBoardClarificationDecisions,
  parseProjectBoardClarificationSuggestions,
  parseProjectBoardCardTestPlan,
  parseProjectBoardStringList,
  mergeProjectBoardTaskToolActionsForProof,
  projectBoardCardProofCount,
  projectBoardCardBlockedByOpenUxMockGate,
  projectBoardCardIsUxMockGate,
  projectBoardCardMatchesRef,
  projectBoardCardMissingRequiredUxMockGate,
  projectBoardCardRowIsClosedDone,
  projectBoardCardIsTerminalAuditCandidate,
  projectBoardCandidateStatusForSynthesisUpdate,
  projectBoardChangedClarificationAnswer,
  projectBoardClarificationDecisionImpactEventSummary,
  projectBoardClarificationDecisionsEquivalent,
  projectBoardDescriptionWithClarificationAnswer,
  projectBoardDecisionImpactEventMetadata,
  projectBoardDecisionImpactFeedbackText,
  projectBoardEventKindFromArtifact,
  projectBoardEventMetadataFromArtifact,
  projectBoardEventSummaryFromArtifact,
  projectBoardEventTitleFromArtifact,
  projectBoardExecutionArtifactCardId,
  projectBoardExecutionArtifactHandoffFromArtifact,
  projectBoardExecutionArtifactProofFromArtifact,
  projectBoardExecutionArtifactStartedAt,
  projectBoardExecutionArtifactStatus,
  projectBoardExecutionArtifactUpdatedAt,
  projectBoardAfterRunHookSucceeded,
  projectBoardCardTaskDescription,
  projectBoardCardPendingPiUpdateFromSynthesisCard,
  projectBoardHasDecisionImpactFeedback,
  projectBoardHasImplementationEvidence,
  projectBoardHasSourceImpactFeedback,
  projectBoardClaimBlockedTaskIdsForRows,
  projectBoardOpenUxMockGateBlocker,
  projectBoardQuestionMatchesAnyVariant,
  projectBoardProofFollowUpOptionsFromSuggestion,
  projectBoardProofEvidenceText,
  projectBoardProofOfWorkForRun,
  projectBoardProofObject,
  projectBoardProofReviewApplicationBlocker,
  projectBoardPromptList,
  projectBoardPromptSummary,
  projectBoardProofRevisionRunFeedback,
  projectBoardProofReviewClosureModelForApplication,
  projectBoardProofReviewFromDraft,
  projectBoardRequiresUiMockApprovalForSynthesisCard,
  projectBoardRuntimeBudgetCompletedCriteria,
  projectBoardRuntimeBudgetExceeded,
  projectBoardRuntimeBudgetFollowUpClarificationQuestion,
  projectBoardRuntimeBudgetFollowUpDescription,
  projectBoardRuntimeBudgetHasMeaningfulProgress,
  projectBoardRuntimeBudgetRemainingCriteria,
  projectBoardRuntimeBudgetReviewForApplication,
  projectBoardRuntimeBudgetSplitOutcomeForReview,
  projectBoardRuntimeBudgetTrustworthyTaskActions,
  projectBoardRunStatusCanCopySession,
  projectBoardRunHasReviewableProof,
  projectBoardRunStageFromArtifactProgress,
  projectBoardRunStageFromManifest,
  projectBoardRunStatusFromProposalManifest,
  projectBoardMissingProofItems,
  buildProjectBoardCharterProjectSummary,
  compileProjectBoardCharter,
  projectBoardCardsWithClaimSummaries,
  projectBoardClaimSummaryFromEvents,
  projectBoardClosedParentForRunFollowUp,
  projectBoardDependencyArtifactKey,
  splitProjectBoardCardDescription,
  projectBoardDescriptionWithSourceImpactRefresh,
  projectBoardStatusForTask,
  projectBoardSourceInputFromExisting,
  projectBoardSourceRefreshEventMetadata,
  projectBoardSourceKindCounts,
  projectBoardSourceClassificationUpdates,
  projectBoardSourceRefreshSummary,
  projectBoardSourceRefreshStats,
  projectBoardSourceRefreshSources,
  projectBoardSourceRefreshStoreRow,
  projectBoardSynthesisDraftWithSourceIdNamespace,
  projectBoardSynthesisMarkdown,
  projectBoardSynthesisProposalCardsFromDraft,
  projectBoardTaskStateForProofReview,
  projectBoardTestPolicyRequiresProofSpec,
  projectBoardUiMockRoleForSynthesisCard,
  projectBoardUnansweredClarificationQuestions,
  projectBoardUxMockRejectionRunFeedback,
  projectBoardUxMockGateSatisfied,
  projectBoardPlanningStableHash,
  projectBoardPlanningStableJson,
  projectBoardSourceDraftRefreshEventMetadata,
  projectBoardSourceDraftRefreshNote,
  projectBoardSourceDraftRefreshRecordKey,
  projectBoardSourceImpactFeedbackText,
  projectBoardSourceImpactDurablePlanPrimary,
  projectBoardSourceImpactIncluded,
  projectBoardSourceImpactMetadataFromEvent,
  projectBoardSourceUpdateImpactMetadata,
  projectBoardSourceUserClassificationUpdate,
  projectBoardSynthesisCardRowProtectedFromDraftReplacement,
  projectBoardSynthesisStartFreshCardSnapshot,
  projectBoardSynthesisProposalCardReviewStatus,
  projectBoardResolveInside,
  resolveProjectBoardTaskBlockers,
  sourceRefArtifactStrings,
  stringsFromProjectBoardUnknownArray,
  summarizeProjectBoardSynthesisRunProgressiveRecords,
  type ProjectBoardCardStoreRow,
  type ProjectBoardCharterStoreRow,
  type ProjectBoardEventStoreRow,
  type ProjectBoardExecutionArtifactStoreRow,
  type ProjectBoardProofReviewDraft,
  type ProjectBoardQuestionStoreRow,
  type ProjectBoardStoreRow,
  type ProjectBoardSourceClassificationInput as ProjectBoardSourceClassificationMapperInput,
  type ProjectBoardSourceDraftRefreshRecord,
  type ProjectBoardSourceStoreRow,
  type ProjectBoardSynthesisProposalStoreRow,
  type ProjectBoardSynthesisRunStoreRow,
  type ProjectBoardSourceUpdateImpactMetadata,
  type ProjectBoardRunFollowUpCandidate,
  type ProjectBoardRunFollowUpInsertOptions,
  type ProjectBoardCardDependencyExecutionContext,
  type ProjectBoardCardDependencyExecutionEntry,
  type ProjectBoardDependencyArtifactImport,
  type ProjectBoardDependencyArtifactImportResult,
} from "./projectBoardStoreMappers";
export { projectBoardDependencyArtifactPromptSection } from "./projectBoardStoreMappers";
export type { ProjectBoardDependencyArtifactImport, ProjectBoardDependencyArtifactImportResult } from "./projectBoardStoreMappers";
export type { RunRecord } from "./projectStoreRunMappers";
import {
  AMBIENT_LEGACY_MODEL_IDS,
  normalizeAmbientModelId,
} from "../shared/ambientModels";
import { workflowGraphFromSpec } from "../shared/workflowAgentGraph";
import { computeAutomationScheduleNextRunAt, normalizeAutomationScheduleCronExpression } from "./automationSchedules";
import type { SchedulerRuntimeState } from "./orchestrationScheduler";
import { formatThreadPreview } from "./threadPreview";
import {
  INTERRUPTED_RUN_MESSAGE,
  interruptedMessageContent,
  interruptedMetadata,
  isRecoverableMessageMetadata,
} from "./runRecovery";
import {
  isRestartInterruptedOrchestrationRun,
  RESTART_INTERRUPTED_LOCAL_TASK_ERROR,
  restartInterruptedAutoContinueProofOfWork,
  restartInterruptedRunProofOfWork,
} from "./orchestrationRecovery";
import {
  type ProjectBoardTaskToolAction,
  type ProjectBoardTaskToolActionTransport,
  projectBoardTaskToolActionDiagnostics,
  projectBoardTaskToolActionsFromProofOfWork,
  projectBoardTaskToolActionSummary,
  projectBoardTaskToolActionTitle,
  projectBoardTaskToolChangedFiles,
  projectBoardTaskToolCommands,
  projectBoardTaskToolCompleted,
  projectBoardTaskToolManualChecks,
  projectBoardTaskToolProofSummary,
} from "./projectBoardTaskTools";
import { normalizeProjectBoardPmReviewReport, type ProjectBoardSynthesisCardInput, type ProjectBoardSynthesisDraft } from "./projectBoardSynthesis";
import { projectBoardSynthesisPartialStatus } from "../shared/projectBoardSynthesisRecovery";
import { dedupeProjectBoardQuestions, projectBoardQuestionsAreNearDuplicates } from "../shared/projectBoardQuestionDedupe";
import { projectBoardOpenClarificationQuestions } from "../shared/projectBoardClarificationDecisions";
import type {
  ArtifactDraftEvent,
  ArtifactDraftManifest,
  ArtifactDraftSummary,
  CreateArtifactDraftInput,
  ListArtifactDraftOptions,
  UpdateArtifactDraftStateInput,
} from "../shared/artifactDrafts";
import {
  projectBoardDecisionImpactPreview,
  type ProjectBoardDecisionImpactPreview,
} from "../shared/projectBoardDecisionImpact";
import { projectBoardKickoffDefaultContextFingerprint } from "../shared/projectBoardKickoffDefaults";
import {
  projectBoardDeliverableManifestFromRun,
  type ProjectBoardDeliverableIntegrationAction,
} from "../shared/projectBoardDeliverables";
import {
  projectBoardLatestProofCoverageRecheckEvent,
  projectBoardProofCoverageDrift,
  projectBoardProofCoverageRecheck,
  type ProjectBoardProofSuggestionAppliedMetadata,
} from "../shared/projectBoardProofImpact";
import {
  projectBoardClarificationDefaultAnsweredDecisions,
  projectBoardClarificationDefaultQuestionsShareDecisionTopic,
  type ProjectBoardClarificationDefaultSuggestion,
} from "./projectBoardClarificationDefaultProvider";
import type { ProjectBoardKickoffDefaultSuggestion } from "./projectBoardKickoffDefaultProvider";
import type { ProjectBoardProofSuggestion } from "./projectBoardProofSuggestionProvider";
import { extractPlannerPlanArtifactFields } from "./plannerMode";
import { LEGACY_PROJECT_STATE_DIR, prepareWorkspaceAuthorityState } from "./workspaceAuthorityState";
import { parseJsonArray, parseJsonObject, parseMetadata, parseStringList, stringFromRecord } from "./projectStoreJson";
import { ProjectStoreSettingsRepository } from "./projectStoreSettingsRepository";
import { stringifyWorkflowRunLimitOverrides } from "./workflowRunLimitOverrides";

import {
  AUTOMATION_HOME_FOLDER_ID,
  DEFAULT_PROJECT_BOARD_QUESTIONS,
  MAX_PROJECT_BOARD_SYNTHESIS_CARDS,
  PROJECT_STATE_DIR,
  WORKFLOW_AGENT_HOME_FOLDER_ID,
  WORKFLOW_DEBUG_TRACE_RETENTION_DAYS,
  compactPlannerPlanKickoffAnswer,
  defaultOrchestrationProjectPath,
  defaultProjectArtifactWorkspacePath,
  durablePlanSourceExcerptForBoardSource,
  emptyToNull,
  normalizedOptionalText,
  piPackageSettingId,
  plannerPlanArtifactSourceContent,
  positiveIntegerOrNull,
  projectBoardCanAdoptPlannerBoardTitle,
  projectBoardPlanningScopeFromRunEvents,
  projectBoardSourceInputExcludedByDurablePlan,
  projectBoardSourceLikeArtifactId,
  projectBoardSourceLikeId,
  projectBoardSourceLikeMessageId,
  projectBoardSourceLikeSourceKey,
  projectBoardSourceLikeThreadId,
  projectBoardSynthesisCardAllowedForBoardSources,
  projectBoardSynthesisCardThreadId,
  readManagedBoardPlanContent,
  repairProjectBoardSynthesisCardsWithExcludedSourceRefs,
  symphonyWorkflowRecipePlaybook,
  symphonyWorkflowRecipeTitle,
  symphonyWorkflowRecipeTranscript,
  terminalThreadGoalStatuses,
} from "./projectStoreFacadeHelpers";
import type {
  AutomationThreadFolderRow,
  ContextUsageSnapshotInput,
  CreateThreadOptions,
  OrchestrationTaskUpdateInput,
  PermissionAuditInput,
  PlannerPlanArtifactInput,
  ProjectBoardCharterRow,
  ProjectBoardCardRow,
  ProjectBoardEventInput,
  ProjectBoardEventRow,
  ProjectBoardExecutionArtifactRow,
  ProjectBoardProofReviewContext,
  ProjectBoardQuestionRow,
  ProjectBoardRow,
  ProjectBoardSourceClassificationInput,
  ProjectBoardSourceInput,
  ProjectBoardSourceRow,
  ProjectBoardSynthesisApplyOptions,
  ProjectBoardSynthesisProposalRow,
  ProjectBoardSynthesisRunRow,
  StageProjectBoardDecisionDraftPiUpdatesInput,
  StageProjectBoardSourceDraftPiUpdatesInput,
  ThreadWorktreeInput,
} from "./projectStoreFacadeHelpers";
import {
  callableWorkflowTaskControlActionLabel,
  subagentDesktopDogfoodHistoryFromMaturityEvidence,
  subagentReleaseGateLiveHistoryFromMaturityEvidence,
  subagentWorkflowJitterReleaseProfileFromEvidence,
} from "./projectStoreSubagentMaturityHistory";

export { defaultOrchestrationProjectPath, defaultProjectArtifactWorkspacePath } from "./projectStoreFacadeHelpers";
export type {
  ContextUsageSnapshotInput,
  CreateThreadOptions,
  OrchestrationTaskUpdateInput,
  PermissionAuditInput,
  PlannerPlanArtifactInput,
  ProjectBoardProofReviewContext,
  ProjectBoardSourceClassificationInput,
  ProjectBoardSourceInput,
  ThreadWorktreeInput,
} from "./projectStoreFacadeHelpers";

export class ProjectStore {
  private db?: Database.Database;
  private workspace?: WorkspaceState;

  openWorkspace(
    workspacePath: string,
    options: { recoverActiveRuns?: boolean; recoverOrchestrationRuns?: boolean } = {},
  ): WorkspaceState {
    const { workspacePath: normalizedWorkspacePath, statePath, sessionPath, dbPath } = prepareWorkspaceAuthorityState(workspacePath);

    this.db?.close();
    this.db = new Database(dbPath);
    this.workspace = {
      path: normalizedWorkspacePath,
      name: basename(normalizedWorkspacePath) || normalizedWorkspacePath,
      statePath,
      sessionPath,
    };
    this.migrate();
    this.backfillProjectBoardClarificationDecisions();
    this.ensureDefaultSettings();
    this.ensureDefaultAutomationFolder();
    this.ensureDefaultThread();
    if (options.recoverActiveRuns ?? false) this.interruptActiveRuns();
    if (options.recoverOrchestrationRuns ?? false) this.stallActiveOrchestrationRuns();
    this.repairPlannerPlanQuestionBlocks();
    this.repairThreadPreviews();
    this.pruneRedundantEmptyThreads();
    return this.workspace;
  }

  close(): void {
    this.db?.close();
    this.db = undefined;
    this.workspace = undefined;
  }

  private backfillProjectBoardClarificationDecisions(): void {
    const rows = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE clarification_decisions_json IS NULL
            OR clarification_decisions_json = ''
            OR clarification_decisions_json = '[]'`,
      )
      .all() as ProjectBoardCardRow[];
    if (rows.length === 0) return;
    const update = this.requireDb().prepare("UPDATE project_board_cards SET clarification_decisions_json = ? WHERE id = ?");
    const transaction = this.requireDb().transaction(() => {
      for (const row of rows) {
        const decisions = normalizeProjectBoardClarificationDecisions(undefined, {
          clarificationQuestions: parseProjectBoardStringList(row.clarification_questions_json),
          clarificationSuggestions: parseProjectBoardClarificationSuggestions(row.clarification_suggestions_json),
          clarificationAnswers: parseProjectBoardClarificationAnswers(row.clarification_answers_json),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
        if (decisions.length === 0) continue;
        update.run(JSON.stringify(decisions), row.id);
      }
    });
    transaction();
  }

  getWorkspace(): WorkspaceState {
    if (!this.workspace) {
      throw new Error("No workspace is open");
    }
    return this.workspace;
  }

  getWorkspaceIfOpen(): WorkspaceState | undefined {
    return this.workspace;
  }

  getProjectArtifactWorkspacePath(): string {
    return defaultProjectArtifactWorkspacePath(this.getWorkspace().path);
  }

  async createArtifactDraft(input: CreateArtifactDraftInput): Promise<ArtifactDraftSummary> {
    return this.artifactDrafts().createArtifactDraft(input);
  }

  getArtifactDraft(draftId: string): ArtifactDraftSummary | undefined {
    return this.artifactDrafts().getArtifactDraft(draftId);
  }

  requireArtifactDraft(draftId: string): ArtifactDraftSummary {
    return this.artifactDrafts().requireArtifactDraft(draftId);
  }

  listArtifactDrafts(options: ListArtifactDraftOptions = {}): ArtifactDraftSummary[] {
    return this.artifactDrafts().listArtifactDrafts(options);
  }

  async updateArtifactDraftState(input: UpdateArtifactDraftStateInput): Promise<ArtifactDraftSummary> {
    return this.artifactDrafts().updateArtifactDraftState(input);
  }

  async appendArtifactDraftEvent(input: {
    draftId: string;
    eventType: string;
    summary?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): Promise<ArtifactDraftEvent> {
    return this.artifactDrafts().appendArtifactDraftEvent(input);
  }

  listArtifactDraftEvents(draftId: string): ArtifactDraftEvent[] {
    return this.artifactDrafts().listArtifactDraftEvents(draftId);
  }

  readArtifactDraftManifest(draftId: string): Promise<ArtifactDraftManifest> {
    return this.artifactDrafts().readArtifactDraftManifest(draftId);
  }

  async pruneExpiredArtifactDrafts(nowIso = new Date().toISOString()): Promise<{ removedDraftIds: string[] }> {
    return this.artifactDrafts().pruneExpiredArtifactDrafts(nowIso);
  }

  getDefaultSettings(): DesktopSettings {
    return this.settings().getDefaultSettings();
  }

  getCompactionSettings(): AmbientCompactionSettings {
    return this.settings().getCompactionSettings();
  }

  setCompactionSettings(input: Partial<AmbientCompactionSettings>): AmbientCompactionSettings {
    return this.settings().setCompactionSettings(input);
  }

  getModelRuntimeSettings(): ModelRuntimeSettings {
    return this.settings().getModelRuntimeSettings();
  }

  setModelRuntimeSettings(input: Partial<ModelRuntimeSettings>): ModelRuntimeSettings {
    return this.settings().setModelRuntimeSettings(input);
  }

  getModelRuntimeCatalog(generatedAt?: string, runtimeProfiles: readonly AmbientModelRuntimeCatalog["profiles"][number][] = []): AmbientModelRuntimeCatalog {
    return this.settings().getModelRuntimeCatalog(generatedAt, runtimeProfiles);
  }

  getFeatureFlagSettings(): AmbientFeatureFlagSettings {
    return this.settings().getFeatureFlagSettings();
  }

  setFeatureFlagSettings(input: UpdateFeatureFlagSettingsInput): AmbientFeatureFlagSettings {
    return this.settings().setFeatureFlagSettings(input);
  }

  getMemorySettings(): AgentMemorySettings {
    return this.settings().getMemorySettings();
  }

  setMemorySettings(input: UpdateAgentMemorySettingsInput): AgentMemorySettings {
    return this.settings().setMemorySettings(input);
  }

  getActiveProjectBoard(sourceThreadId?: string): ProjectBoardSummary | undefined {
    return this.getProjectBoardForPath(this.getWorkspace().path, sourceThreadId);
  }

  getProjectBoardForPath(projectPath: string, sourceThreadId?: string): ProjectBoardSummary | undefined {
    const trimmedThreadId = sourceThreadId?.trim();
    let row = trimmedThreadId
      ? (this.requireDb()
          .prepare(
            `SELECT * FROM project_boards
             WHERE project_path = ?
               AND source_thread_id = ?
               AND status IN ('draft', 'active', 'paused')
             ORDER BY updated_at DESC, rowid DESC
             LIMIT 1`,
          )
          .get(projectPath, trimmedThreadId) as ProjectBoardRow | undefined)
      : undefined;
    row ??= this.requireDb()
      .prepare(
        `SELECT * FROM project_boards
         WHERE project_path = ?
           AND status IN ('draft', 'active', 'paused')
           AND (? IS NULL OR source_thread_id IS NULL)
         ORDER BY updated_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(projectPath, trimmedThreadId ?? null) as ProjectBoardRow | undefined;
    if (row && this.reconcileCompactPlannerPlanDraftBoard(row)) {
      row = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(row.id) as ProjectBoardRow | undefined;
    }
    return row ? this.mapProjectBoard(row) : undefined;
  }

  getProjectBoard(boardId: string): ProjectBoardSummary | undefined {
    const row = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardRow | undefined;
    return row ? this.mapProjectBoard(row) : undefined;
  }

  private reconcileCompactPlannerPlanDraftBoard(boardRow: ProjectBoardRow): boolean {
    if (boardRow.status !== "draft") return false;
    const existing = this.requireDb()
      .prepare("SELECT * FROM project_board_cards WHERE board_id = ? ORDER BY created_at ASC, rowid ASC")
      .all(boardRow.id) as ProjectBoardCardRow[];
    const artifactId = this.compactPlannerPlanArtifactIdForRows(existing);
    if (!artifactId) return false;

    let artifact: PlannerPlanArtifact;
    try {
      artifact = this.getPlannerPlanArtifact(artifactId);
    } catch {
      return false;
    }
    const draftCards = plannerPlanDraftCards(artifact);
    if (artifact.status !== "ready" || draftCards.length !== 1 || !plannerPlanShouldStayCompact(artifact)) return false;

    const alreadyCompact = existing.length === 1 && existing[0]?.source_id === artifact.id;
    const shouldReplaceCards = !alreadyCompact;
    const questions = this.ensureProjectBoardQuestions(boardRow.id);
    const unansweredQuestions = questions.filter((question) => question.required && !question.answer?.trim());

    const now = new Date().toISOString();
    const candidateStatus = plannerPlanCandidateStatus(artifact);
    const clarificationQuestions = plannerPlanClarificationQuestions(artifact);
    const clarificationDecisions = plannerPlanClarificationDecisions(artifact, now);
    const compactCard = draftCards[0];
    const compactLabelsJson = JSON.stringify(normalizeTaskLabels(compactCard.labels));
    const compactBlockedByJson = JSON.stringify(compactCard.blockedBy);
    const compactAcceptanceCriteriaJson = JSON.stringify(normalizeCardTextList(compactCard.acceptanceCriteria, 30));
    const compactTestPlanJson = JSON.stringify(normalizeProjectBoardCardTestPlan(compactCard.testPlan));
    const compactClarificationQuestionsJson = JSON.stringify(clarificationQuestions);
    const compactClarificationDecisionsJson = JSON.stringify(clarificationDecisions);
    const compactRow = alreadyCompact ? existing[0] : undefined;
    const shouldUpdateCompactCard = Boolean(
      compactRow &&
        (compactRow.title !== compactCard.title ||
          compactRow.description !== compactCard.description ||
          compactRow.candidate_status !== candidateStatus ||
          compactRow.labels_json !== compactLabelsJson ||
          compactRow.blocked_by_json !== compactBlockedByJson ||
          compactRow.acceptance_criteria_json !== compactAcceptanceCriteriaJson ||
          compactRow.test_plan_json !== compactTestPlanJson ||
          compactRow.clarification_questions_json !== compactClarificationQuestionsJson ||
          compactRow.clarification_decisions_json !== compactClarificationDecisionsJson),
    );
    if (!shouldReplaceCards && unansweredQuestions.length === 0 && !shouldUpdateCompactCard) return false;

    const createdIds: string[] = [];
    const replacedCardIds = shouldReplaceCards ? existing.map((row) => row.id) : [];
    const transaction = this.requireDb().transaction(() => {
      if (shouldReplaceCards) {
        const deleteCard = this.requireDb().prepare("DELETE FROM project_board_cards WHERE id = ? AND board_id = ?");
        for (const cardId of replacedCardIds) deleteCard.run(cardId, boardRow.id);
        const compactCardId = randomUUID();
        createdIds.push(compactCardId);
        this.requireDb()
          .prepare(
            `INSERT INTO project_board_cards
            (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
             acceptance_criteria_json, test_plan_json, clarification_questions_json, clarification_decisions_json, source_kind, source_id, source_thread_id,
             source_message_id, orchestration_task_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            compactCardId,
            boardRow.id,
            compactCard.title,
            compactCard.description,
            "draft",
            candidateStatus,
            null,
            null,
            compactLabelsJson,
            compactBlockedByJson,
            compactAcceptanceCriteriaJson,
            compactTestPlanJson,
            compactClarificationQuestionsJson,
            compactClarificationDecisionsJson,
            "planner_plan",
            compactCard.sourceId,
            artifact.threadId,
            artifact.sourceMessageId,
            null,
            now,
            now,
          );
      } else if (compactRow && shouldUpdateCompactCard) {
        this.requireDb()
          .prepare(
            `UPDATE project_board_cards
             SET title = ?,
                 description = ?,
                 candidate_status = ?,
                 labels_json = ?,
                 blocked_by_json = ?,
                 acceptance_criteria_json = ?,
                 test_plan_json = ?,
                 clarification_questions_json = ?,
                 clarification_decisions_json = ?,
                 source_thread_id = ?,
                 source_message_id = ?,
                 updated_at = ?
             WHERE id = ?
               AND board_id = ?
               AND status = 'draft'
               AND source_kind = 'planner_plan'
               AND orchestration_task_id IS NULL`,
          )
          .run(
            compactCard.title,
            compactCard.description,
            candidateStatus,
            compactLabelsJson,
            compactBlockedByJson,
            compactAcceptanceCriteriaJson,
            compactTestPlanJson,
            compactClarificationQuestionsJson,
            compactClarificationDecisionsJson,
            artifact.threadId,
            artifact.sourceMessageId,
            now,
            compactRow.id,
            boardRow.id,
          );
      }

      const answerQuestion = this.requireDb().prepare("UPDATE project_board_questions SET answer = ?, answered_at = ?, updated_at = ? WHERE id = ? AND board_id = ?");
      unansweredQuestions.forEach((question, index) => {
        answerQuestion.run(compactPlannerPlanKickoffAnswer(artifact, question.question, index), now, now, question.id, boardRow.id);
      });

      this.appendProjectBoardEvent({
        boardId: boardRow.id,
        kind: "plan_promoted",
        title: shouldReplaceCards ? "Compact plan recovered" : shouldUpdateCompactCard ? "Compact plan draft normalized" : "Compact plan charter completed",
        summary: shouldReplaceCards
          ? `${artifact.title.trim() || "Planner plan"} replaced ${replacedCardIds.length} untouched step candidate${replacedCardIds.length === 1 ? "" : "s"} with one compact candidate and completed kickoff from the durable plan.`
          : shouldUpdateCompactCard
            ? `${artifact.title.trim() || "Planner plan"} refreshed the compact candidate and completed kickoff from the durable plan.`
          : `${artifact.title.trim() || "Planner plan"} completed kickoff from the compact durable plan.`,
        entityKind: "project_board",
        entityId: boardRow.id,
        metadata: {
          artifactId: artifact.id,
          cardIds: createdIds,
          updatedCardIds: compactRow && shouldUpdateCompactCard ? [compactRow.id] : [],
          replacedCardIds,
          answeredQuestionIds: unansweredQuestions.map((question) => question.id),
          decomposition: "single_card",
          autoFinalizedCompactPlan: true,
        },
        createdAt: now,
      });
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, boardRow.id);
    });
    transaction();
    this.finalizeProjectBoardKickoff(boardRow.id);
    return true;
  }

  private compactPlannerPlanArtifactIdForRows(rows: ProjectBoardCardRow[]): string | undefined {
    if (rows.length === 0) return undefined;
    const artifactIds = new Set<string>();
    for (const row of rows) {
      if (
        row.status !== "draft" ||
        row.source_kind !== "planner_plan" ||
        row.orchestration_task_id ||
        ["evidence", "duplicate", "rejected"].includes(row.candidate_status) ||
        row.user_touched_at ||
        (row.user_touched_fields_json && row.user_touched_fields_json !== "[]")
      ) {
        return undefined;
      }
      const artifactId = row.source_id.includes("#step:") ? row.source_id.slice(0, row.source_id.indexOf("#step:")) : row.source_id;
      if (!artifactId.trim()) return undefined;
      artifactIds.add(artifactId);
    }
    return artifactIds.size === 1 ? [...artifactIds][0] : undefined;
  }

  applyProjectBoardArtifactProjection(projectPath: string, projection: ProjectBoardArtifactProjection): ProjectBoardSummary {
    const config = projection.config;
    const boardId = config.boardId;
    const existingBoard = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardRow | undefined;
    const latestSnapshot = projection.sourceSnapshots.at(-1);
    const classificationsBySourceId = new Map(projection.sourceClassifications.map((classification) => [classification.sourceId, classification]));
    const sourcesById = new Map(latestSnapshot?.sources.map((source) => [source.sourceId, source]) ?? []);
    const now = new Date().toISOString();
    const boardCreatedAt = config.createdAt || existingBoard?.created_at || now;
    const boardUpdatedAt = config.updatedAt || now;
    const charterId = projection.charter?.charterId ?? config.activeCharterId ?? existingBoard?.charter_id ?? null;
    const insertedSourceIds = new Set(latestSnapshot?.sources.map((source) => source.sourceId) ?? []);
    const sourceThreadId =
      latestSnapshot?.sources.find((source) => source.kind === "plan_artifact" && source.threadId)?.threadId ??
      latestSnapshot?.sources.find((source) => source.threadId)?.threadId ??
      existingBoard?.source_thread_id ??
      null;
    // Board artifacts do not carry local-only edit protection, so preserve it from the
    // existing rows; otherwise an export/apply round trip would let the next synthesis
    // run silently overwrite user-edited cards.
    // Run metadata and source relevance are also local-only (not carried by board
    // artifacts), so preserve them from existing rows like the protected card fields:
    // otherwise every export->apply cycle nulls planning snapshots / retry lineage and
    // drifts relevance through the confidence round trip.
    const preservedRunFieldsById = new Map(
      (
        this.requireDb()
          .prepare("SELECT id, planning_snapshots_json, retry_of_run_id FROM project_board_synthesis_runs WHERE board_id = ?")
          .all(boardId) as Array<{ id: string; planning_snapshots_json: string | null; retry_of_run_id: string | null }>
      ).map((row) => [row.id, row]),
    );
    const preservedSourceRelevanceById = new Map(
      (
        this.requireDb().prepare("SELECT id, relevance FROM project_board_sources WHERE board_id = ?").all(boardId) as Array<{
          id: string;
          relevance: number | null;
        }>
      ).map((row) => [row.id, row.relevance]),
    );
    const protectedCardFieldsById = new Map(
      (
        this.requireDb()
          .prepare("SELECT id, user_touched_fields_json, user_touched_at, pending_pi_update_json FROM project_board_cards WHERE board_id = ?")
          .all(boardId) as Array<{
          id: string;
          user_touched_fields_json: string | null;
          user_touched_at: string | null;
          pending_pi_update_json: string | null;
        }>
      )
        .filter(
          (row) =>
            row.user_touched_at ||
            (row.user_touched_fields_json && row.user_touched_fields_json !== "[]") ||
            row.pending_pi_update_json,
        )
        .map((row) => [row.id, row]),
    );

    const transaction = this.requireDb().transaction(() => {
      this.requireDb().prepare("DELETE FROM project_board_synthesis_runs WHERE board_id = ?").run(boardId);
      this.requireDb().prepare("DELETE FROM project_board_synthesis_proposals WHERE board_id = ?").run(boardId);
      this.requireDb().prepare("DELETE FROM project_board_execution_artifacts WHERE board_id = ?").run(boardId);
      this.requireDb().prepare("DELETE FROM project_board_events WHERE board_id = ?").run(boardId);
      this.requireDb().prepare("DELETE FROM project_board_sources WHERE board_id = ?").run(boardId);
      this.requireDb().prepare("DELETE FROM project_board_cards WHERE board_id = ?").run(boardId);
      this.requireDb().prepare("DELETE FROM project_board_charters WHERE board_id = ?").run(boardId);

      if (existingBoard) {
        this.requireDb()
          .prepare(
            `UPDATE project_boards
             SET project_path = ?, source_thread_id = ?, status = ?, title = ?, summary = ?, charter_id = ?, active_draft_id = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(projectPath, sourceThreadId, config.status, config.title, config.summary, charterId, null, boardUpdatedAt, boardId);
      } else {
        this.requireDb()
          .prepare(
            `INSERT INTO project_boards
             (id, project_path, source_thread_id, status, title, summary, charter_id, active_draft_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(boardId, projectPath, sourceThreadId, config.status, config.title, config.summary, charterId, null, boardCreatedAt, boardUpdatedAt);
      }

      if (projection.charter) {
        const charter = projection.charter;
        this.requireDb()
          .prepare(
            `INSERT INTO project_board_charters
             (id, board_id, version, status, goal, current_state, target_user, non_goals_json, quality_bar,
              test_policy_json, decision_policy_json, dependency_policy_json, budget_policy_json, source_policy_json,
              markdown, project_summary_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            charter.charterId,
            boardId,
            charter.version,
            charter.status,
            charter.goal,
            charter.currentState,
            charter.targetUser,
            JSON.stringify(charter.nonGoals),
            charter.qualityBar,
            JSON.stringify(charter.testPolicy),
            JSON.stringify(charter.decisionPolicy),
            JSON.stringify(charter.dependencyPolicy),
            JSON.stringify(charter.budgetPolicy),
            JSON.stringify(charter.sourcePolicy),
            charter.markdown,
            charter.projectSummary ? JSON.stringify(charter.projectSummary) : null,
            charter.createdAt,
            charter.updatedAt,
          );
      }

      const insertSource = this.requireDb().prepare(
        `INSERT INTO project_board_sources
         (id, board_id, source_kind, source_key, content_hash, change_state, title, summary, excerpt, path, thread_id, artifact_id, message_id,
          byte_size, mtime, classification_reason, classified_by, classification_confidence, authority_role, include_in_synthesis, relevance, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      if (latestSnapshot) {
        for (const source of latestSnapshot.sources) {
          const classification = classificationsBySourceId.get(source.sourceId);
          const kind = classification?.effectiveKind ?? source.kind;
          const includeInSynthesis = classification ? classification.includeInSynthesis : kind !== "ignored";
          const preservedRelevance = preservedSourceRelevanceById.get(source.sourceId);
          const relevance =
            kind === "ignored"
              ? 0
              : typeof preservedRelevance === "number"
                ? preservedRelevance
                : Math.max(0, Math.min(100, Math.round((classification?.confidence ?? 0.75) * 100)));
          insertSource.run(
            source.sourceId,
            boardId,
            kind,
            source.sourceKey,
            classification?.contentHash ?? source.contentHash ?? null,
            source.changeState,
            source.title,
            source.summary,
            source.excerpt ?? null,
            source.path ?? null,
            source.threadId ?? null,
            source.artifactId ?? null,
            source.messageId ?? null,
            source.byteSize ?? null,
            source.mtime ?? null,
            classification?.classificationReason ?? null,
            classification?.classifiedBy ?? null,
            classification?.confidence ?? null,
            classification?.authorityRole ?? null,
            includeInSynthesis ? 1 : 0,
            relevance,
            latestSnapshot.createdAt,
            classification?.classifiedAt ?? latestSnapshot.createdAt,
          );
        }
      }

      const insertCard = this.requireDb().prepare(
        `INSERT INTO project_board_cards
         (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
          acceptance_criteria_json, test_plan_json, source_refs_json, clarification_questions_json, clarification_suggestions_json, clarification_answers_json,
          clarification_decisions_json, run_feedback_json,
          source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id, execution_thread_id, execution_session_policy,
          proof_review_json, split_outcome_json, objective_provenance_json, ui_mock_role, requires_ui_mock_approval,
          user_touched_fields_json, user_touched_at, pending_pi_update_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const card of projection.cards) {
        const primaryRef = card.sourceRefs.find((ref) => ref.sourceId && insertedSourceIds.has(ref.sourceId));
        const primarySource = primaryRef?.sourceId ? sourcesById.get(primaryRef.sourceId) : undefined;
        const clarificationQuestions = normalizeProjectBoardClarificationQuestions(card.clarificationQuestions ?? [], 8);
        const clarificationSuggestions = normalizeProjectBoardClarificationSuggestions(card.clarificationSuggestions ?? [], []);
        const clarificationAnswers = normalizeProjectBoardClarificationAnswers(card.clarificationAnswers ?? []);
        const clarificationDecisions = normalizeProjectBoardClarificationDecisions(card.clarificationDecisions, {
          clarificationQuestions,
          clarificationSuggestions,
          clarificationAnswers,
          createdAt: card.createdAt,
          updatedAt: card.updatedAt,
        });
        insertCard.run(
          card.cardId,
          boardId,
          card.title,
          card.description,
          card.status,
          card.candidateStatus,
          card.priority ?? null,
          card.phase ?? null,
          JSON.stringify(card.labels),
          JSON.stringify([...card.blockedBy, ...card.unresolvedBlockers]),
          JSON.stringify(card.acceptanceCriteria),
          JSON.stringify(card.testPlan),
          JSON.stringify(sourceRefArtifactStrings(card.sourceRefs)),
          JSON.stringify(clarificationQuestions),
          JSON.stringify(clarificationSuggestions),
          JSON.stringify(clarificationAnswers),
          JSON.stringify(clarificationDecisions),
          JSON.stringify(normalizeProjectBoardCardRunFeedback(card.runFeedback)),
          card.sourceKind,
          card.sourceId,
          primarySource?.threadId ?? null,
          primarySource?.messageId ?? null,
          card.orchestrationTaskId ?? null,
          card.executionThreadId ?? null,
          card.executionSessionPolicy ?? "reuse_card_session",
          card.proofReview ? JSON.stringify(card.proofReview) : null,
          card.splitOutcome ? JSON.stringify(card.splitOutcome) : null,
          objectiveProvenanceJson(card.objectiveProvenance),
          card.uiMockRole ?? null,
          card.requiresUiMockApproval ? 1 : 0,
          protectedCardFieldsById.get(card.cardId)?.user_touched_fields_json ?? "[]",
          protectedCardFieldsById.get(card.cardId)?.user_touched_at ?? null,
          protectedCardFieldsById.get(card.cardId)?.pending_pi_update_json ?? null,
          card.createdAt,
          card.updatedAt,
        );
      }

      const insertProposal = this.requireDb().prepare(
        `INSERT INTO project_board_synthesis_proposals
         (id, board_id, status, summary, goal, current_state, target_user, quality_bar,
          assumptions_json, questions_json, answers_json, source_notes_json, cards_json, review_report_json, model, duration_ms, created_at, updated_at, applied_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const proposalRun of projection.proposalRuns) {
        const final = proposalRun.final;
        if (!final) continue;
        insertProposal.run(
          final.proposalId,
          boardId,
          final.status,
          final.summary,
          final.goal,
          final.currentState,
          final.targetUser,
          final.qualityBar,
          JSON.stringify(final.assumptions),
          JSON.stringify(final.questions),
          JSON.stringify(final.answers),
          JSON.stringify(final.sourceNotes),
          JSON.stringify(final.cards),
          final.reviewReport ? JSON.stringify(final.reviewReport) : null,
          final.model ?? null,
          final.durationMs ?? null,
          final.createdAt,
          final.updatedAt,
          final.appliedAt ?? null,
        );
      }

      const insertRun = this.requireDb().prepare(
        `INSERT INTO project_board_synthesis_runs
         (id, board_id, proposal_id, retry_of_run_id, status, stage, model, source_count, included_source_count,
          source_char_count, prompt_char_count, response_char_count, card_count, question_count, warning_count, error,
          events_json, progressive_records_json, planning_snapshots_json, started_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const proposalRun of projection.proposalRuns) {
        const manifest = proposalRun.manifest;
        if (!manifest) continue;
        const progressiveRecords = [
          ...proposalRun.progress,
          ...proposalRun.candidateCards,
          ...proposalRun.questions,
          ...proposalRun.sourceCoverage,
          ...proposalRun.dependencyEdges,
          ...proposalRun.warnings,
          ...proposalRun.errors,
        ];
        const runEvents =
          proposalRun.progress.length > 0
            ? proposalRun.progress.map((record) => ({
                stage: projectBoardRunStageFromArtifactProgress(record.stage),
                title: record.title,
                summary: record.summary,
                metadata: record.metadata,
                createdAt: record.createdAt,
              }))
            : [
                {
                  stage: projectBoardRunStageFromManifest(manifest),
                  title: "Imported Git board proposal run",
                  summary: manifest.error ?? `Imported ${manifest.cardCount ?? 0} card${manifest.cardCount === 1 ? "" : "s"} from board artifacts.`,
                  metadata: { proposalRunId: manifest.proposalRunId },
                  createdAt: manifest.updatedAt,
                },
              ];
        insertRun.run(
          manifest.proposalRunId,
          boardId,
          proposalRun.final?.proposalId ?? null,
          preservedRunFieldsById.get(manifest.proposalRunId)?.retry_of_run_id ?? null,
          projectBoardRunStatusFromProposalManifest(manifest),
          projectBoardRunStageFromManifest(manifest),
          manifest.model ?? null,
          manifest.sourceCount,
          latestSnapshot?.sources.filter((source) => classificationsBySourceId.get(source.sourceId)?.includeInSynthesis ?? source.kind !== "ignored").length ??
            manifest.sourceCount,
          manifest.sourceCharCount,
          manifest.promptCharCount ?? null,
          manifest.responseCharCount ?? null,
          manifest.cardCount ?? proposalRun.candidateCards.length,
          manifest.questionCount ?? proposalRun.questions.length,
          manifest.warningCount ?? proposalRun.warnings.length,
          manifest.error ?? proposalRun.errors.at(-1)?.message ?? null,
          JSON.stringify(runEvents),
          JSON.stringify(progressiveRecords),
          preservedRunFieldsById.get(manifest.proposalRunId)?.planning_snapshots_json ?? "[]",
          manifest.startedAt,
          manifest.updatedAt,
          manifest.completedAt ?? null,
        );
      }

      const insertExecutionArtifact = this.requireDb().prepare(
        `INSERT INTO project_board_execution_artifacts
         (id, board_id, card_id, status, source, agent_id, pi_session_id, workspace_branch,
          started_at, updated_at, completed_at, proof_json, handoff_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const runArtifact of projection.runArtifacts) {
        const manifest = runArtifact.manifest;
        const proof = runArtifact.proof;
        const handoff = runArtifact.handoff;
        const runId = manifest?.runId ?? proof?.runId ?? handoff?.runId ?? runArtifact.runPathId;
        const cardId = projectBoardExecutionArtifactCardId(manifest, proof, handoff);
        if (!cardId) continue;
        const startedAt = projectBoardExecutionArtifactStartedAt(manifest, proof, handoff);
        const updatedAt = projectBoardExecutionArtifactUpdatedAt(manifest, proof, handoff);
        insertExecutionArtifact.run(
          runId,
          boardId,
          cardId,
          projectBoardExecutionArtifactStatus(manifest, proof, handoff),
          "git",
          manifest?.agentId ?? null,
          manifest?.piSessionId ?? null,
          manifest?.workspaceBranch ?? null,
          startedAt,
          updatedAt,
          manifest?.completedAt ?? handoff?.createdAt ?? null,
          proof ? JSON.stringify(projectBoardExecutionArtifactProofFromArtifact(proof)) : null,
          handoff ? JSON.stringify(projectBoardExecutionArtifactHandoffFromArtifact(handoff)) : null,
          updatedAt,
        );
      }

      const insertEvent = this.requireDb().prepare(
        `INSERT INTO project_board_events
         (id, board_id, event_kind, title, summary, entity_kind, entity_id, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const event of projection.events) {
        insertEvent.run(
          event.eventId,
          boardId,
          projectBoardEventKindFromArtifact(event),
          projectBoardEventTitleFromArtifact(event),
          projectBoardEventSummaryFromArtifact(event),
          event.entityKind ?? null,
          event.entityId ?? null,
          JSON.stringify(projectBoardEventMetadataFromArtifact(event)),
          event.createdAt,
        );
      }
      this.materializeProjectBoardPulledHandoffFollowUps(boardId, projection.runArtifacts);
    });

    transaction();
    const row = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardRow | undefined;
    if (!row) throw new Error(`Project board not found after applying artifact projection: ${boardId}`);
    return this.mapProjectBoard(row);
  }

  createProjectBoard(input: { title?: string; summary?: string; replaceActive?: boolean; sourceThreadId?: string } = {}): ProjectBoardSummary {
    const project = this.getWorkspace();
    const sourceThreadId = input.sourceThreadId?.trim() || undefined;
    const existing = this.getActiveProjectBoard(sourceThreadId);
    if (existing && !input.replaceActive) return existing;

    const now = new Date().toISOString();
    const boardId = randomUUID();
    const charterId = randomUUID();
    const title = input.title?.trim() || `${project.name} board`;
    const summary = input.summary?.trim() || "Project board kickoff draft.";
    const markdown = [
      `# ${title}`,
      "",
      "## Vision",
      "",
      "Draft charter created by Build Board. The kickoff interview will fill this in before cards are executed.",
      "",
      "## Scope",
      "",
      "- Confirm project goal",
      "- Identify background artifacts and plans",
      "- Ticketize validated work with dependencies and test expectations",
    ].join("\n");

    try {
      const transaction = this.requireDb().transaction(() => {
        if (existing && input.replaceActive) {
          this.requireDb().prepare("UPDATE project_boards SET status = 'archived', updated_at = ? WHERE id = ?").run(now, existing.id);
        }
        this.requireDb()
          .prepare(
            `INSERT INTO project_boards
            (id, project_path, source_thread_id, status, title, summary, charter_id, active_draft_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(boardId, project.path, sourceThreadId ?? null, "draft", title, summary, charterId, null, now, now);
        this.requireDb()
          .prepare(
            `INSERT INTO project_board_charters
            (id, board_id, version, status, goal, current_state, target_user, non_goals_json, quality_bar,
             test_policy_json, decision_policy_json, dependency_policy_json, budget_policy_json, source_policy_json,
             markdown, project_summary_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            charterId,
            boardId,
            1,
            "draft",
            "",
            "",
            "",
            JSON.stringify([]),
            "",
            JSON.stringify({ unit: true, integration: true, visual: true, liveSmoke: "recommended" }),
            JSON.stringify({ default: "ask_when_ambiguous", fallback: "document_assumption" }),
            JSON.stringify({ ordering: "blockers_first", parallelism: "safe_independent_cards" }),
            JSON.stringify({ maxPassesPerCard: 6, maxRuntimeMsPerCard: 1_200_000, pauseOnTerminalBlocker: true }),
            JSON.stringify({ includeThreads: true, includeMarkdown: true, requireUserApproval: true }),
            markdown,
            null,
            now,
            now,
          );
        this.appendProjectBoardEvent({
          boardId,
          kind: "board_created",
          title: "Board created",
          summary: `Created kickoff draft for ${title}.`,
          entityKind: "project_board",
          entityId: boardId,
          metadata: { status: "draft", charterId },
          createdAt: now,
        });
      });
      transaction();
      this.ensureProjectBoardQuestions(boardId);
    } catch (error) {
      const raced = this.getActiveProjectBoard(sourceThreadId);
      if (raced && !input.replaceActive) return raced;
      throw error;
    }

    const created = this.getProjectBoardForPath(project.path, sourceThreadId);
    if (!created) throw new Error("Project board was not created.");
    return created;
  }

  /** The compact durable-plan card covering this board's whole scope, if it is
   * already ticketized or executing. While such a card is in flight, an automatic
   * planning pass can only propose duplicate step cards for work already underway. */
  projectBoardExecutingPlannerPlanCard(boardId: string): ProjectBoardCard | undefined {
    const row = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE board_id = ?
           AND source_kind = 'planner_plan'
           AND (orchestration_task_id IS NOT NULL OR status IN ('ready', 'in_progress', 'review'))
           AND candidate_status NOT IN ('evidence', 'duplicate', 'rejected')
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(boardId) as ProjectBoardCardRow | undefined;
    return row ? this.mapProjectBoardCard(row) : undefined;
  }

  /** Records the park decision and returns the in-flight plan card, or undefined when
   * the automatic planning pass may proceed. */
  parkAutomaticPlanningForExecutingPlanCard(boardId: string): ProjectBoardCard | undefined {
    const card = this.projectBoardExecutingPlannerPlanCard(boardId);
    if (!card) return undefined;
    this.appendProjectBoardEvent({
      boardId,
      kind: "board_synthesized",
      title: "Automatic planning parked",
      summary: `Skipped the automatic planning pass because "${card.title}" is already ${card.orchestrationTaskId ? "ticketized" : "executing"}; planning now would propose duplicate cards for in-flight work. Use Revise Board if you still want step cards.`,
      entityKind: "project_board",
      entityId: boardId,
      metadata: { planningParked: true, executingPlannerPlanCardId: card.id },
      createdAt: new Date().toISOString(),
    });
    return card;
  }

  applyProjectBoardSynthesis(
    boardId: string,
    synthesis: ProjectBoardSynthesisDraft,
    options: ProjectBoardSynthesisApplyOptions = {},
  ): ProjectBoardSummary {
    synthesis = projectBoardSynthesisDraftWithSourceIdNamespace(synthesis, options.sourceIdNamespace);
    const board = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardRow | undefined;
    if (!board) throw new Error(`Project board not found: ${boardId}`);
    if (board.status === "archived") throw new Error("Archived project boards cannot be synthesized.");
    this.ensureProjectBoardQuestions(boardId);

    const now = new Date().toISOString();
    const existingSynthesisRows = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE board_id = ? AND source_kind = 'board_synthesis'`,
      )
      .all(boardId) as ProjectBoardCardRow[];
    const claimSummary = options.replaceExistingDraft ? projectBoardClaimSummaryFromEvents(this.listProjectBoardEvents(boardId)) : undefined;
    const protectedClaimCardIds = new Set([
      ...(claimSummary?.active.map((claim) => claim.cardId) ?? []),
      ...(claimSummary?.conflicts.map((claim) => claim.cardId) ?? []),
    ]);
    const existingSynthesisRowsBySourceId = new Map(existingSynthesisRows.map((row) => [row.source_id, row]));
    const isProtectedExistingSynthesisCard = (row: ProjectBoardCardRow) =>
      projectBoardSynthesisCardRowProtectedFromDraftReplacement(row, protectedClaimCardIds);
    const protectedExistingCardRows = options.replaceExistingDraft
      ? existingSynthesisRows.filter(isProtectedExistingSynthesisCard)
      : existingSynthesisRows;
    const protectedExistingCardSourceIds = new Set(protectedExistingCardRows.map((row) => row.source_id));
    const replaceableExistingCardRows = options.replaceExistingDraft
      ? existingSynthesisRows.filter((row) => !isProtectedExistingSynthesisCard(row))
      : [];
    const replaceableExistingRowsBySourceId = new Map(replaceableExistingCardRows.map((row) => [row.source_id, row]));
    const boardSourceThreadId = board.source_thread_id?.trim() || undefined;
    const boardSources = this.listProjectBoardSources(boardId);
    const pendingPiUpdates = options.replaceExistingDraft
      ? synthesis.cards
          .filter((card) => projectBoardSynthesisCardAllowedForBoardSources({ card, sources: boardSources, boardSourceThreadId }))
          .map((card) => {
            const existing = existingSynthesisRowsBySourceId.get(card.sourceId.trim());
            if (!existing || !isProtectedExistingSynthesisCard(existing)) return undefined;
            const update = projectBoardCardPendingPiUpdateFromSynthesisCard(existing, card, now);
            return update ? { cardId: existing.id, update } : undefined;
          })
          .filter((entry): entry is { cardId: string; update: ProjectBoardCardPendingPiUpdate } => Boolean(entry))
      : [];
    const candidateCards = synthesis.cards
      .filter((card) =>
        card.title.trim() &&
        card.sourceId.trim() &&
        !protectedExistingCardSourceIds.has(card.sourceId.trim()) &&
        projectBoardSynthesisCardAllowedForBoardSources({ card, sources: boardSources, boardSourceThreadId })
      )
      .slice(0, MAX_PROJECT_BOARD_SYNTHESIS_CARDS);
    const candidateCardSourceIds = new Set(candidateCards.map((card) => card.sourceId.trim()));
    const cardsToUpdate = options.replaceExistingDraft
      ? candidateCards
          .flatMap((card): { existing: ProjectBoardCardRow; update: ProjectBoardCardPendingPiUpdate | undefined }[] => {
            const existing = replaceableExistingRowsBySourceId.get(card.sourceId.trim());
            if (!existing) return [];
            return [{
              existing,
              update: projectBoardCardPendingPiUpdateFromSynthesisCard(existing, card, now),
            }];
          })
      : [];
    const cardsToInsert = candidateCards.filter((card) => !replaceableExistingRowsBySourceId.has(card.sourceId.trim()));
    const deleteStaleDraftCards = options.replaceExistingDraft ? (options.deleteStaleDraftCards ?? true) : false;
    const staleReplaceableDraftCardIds = deleteStaleDraftCards
      ? replaceableExistingCardRows.filter((row) => !candidateCardSourceIds.has(row.source_id)).map((row) => row.id)
      : [];
    const existingQuestions = this.listProjectBoardQuestions(boardId);
    const existingQuestionTexts = existingQuestions.map((question) => question.question.trim());
    const questionsToInsert =
      options.insertQuestions === false
        ? []
        : dedupeProjectBoardQuestions(synthesis.questions, 8)
            .filter((question) => !existingQuestionTexts.some((existing) => projectBoardQuestionsAreNearDuplicates(existing, question)))
            .slice(0, 8);
    const summaryQuestions: ProjectBoardQuestion[] = [
      ...existingQuestions,
      ...questionsToInsert.map((question, index) => ({
        id: `pending-synthesis-question-${index + 1}`,
        boardId,
        question,
        required: true,
        createdAt: now,
        updatedAt: now,
      })),
    ];
    const maxOrder = this.requireDb()
      .prepare("SELECT COALESCE(MAX(question_order), -1) AS question_order FROM project_board_questions WHERE board_id = ?")
      .get(boardId) as { question_order: number };
    const insertedCardIds: string[] = [];
    const updatedCardIds: string[] = [];
    const preservedDraftCardIds = new Set<string>();
    const coveredPlannerPlanCardIds: string[] = [];
    const insertedQuestionIds: string[] = [];
    const protectedPiUpdateCardIds: string[] = [];
    const protectedPiUpdateSourceIds: string[] = [];
    const markdown = projectBoardSynthesisMarkdown(board, synthesis);
    const activeCharterRow = board.charter_id
      ? (this.requireDb().prepare("SELECT * FROM project_board_charters WHERE id = ?").get(board.charter_id) as ProjectBoardCharterRow | undefined)
      : undefined;
    const existingBudgetPolicy = activeCharterRow ? parseJsonObject<Record<string, unknown>>(activeCharterRow.budget_policy_json, {}) : {};
    const synthesizedBudgetPolicy = {
      maxPassesPerCard: 6,
      maxRuntimeMsPerCard: 1_200_000,
      pauseOnTerminalBlocker: true,
    };
    const mergedBudgetPolicy = {
      ...synthesizedBudgetPolicy,
      ...existingBudgetPolicy,
    };
    const synthesizedSourcePolicy = {
      includeThreads: true,
      includeMarkdown: true,
      requireUserApproval: true,
      synthesizedAt: now,
      sourceNotes: synthesis.sourceNotes,
    };
    const synthesizedCharterSummary = buildProjectBoardCharterProjectSummary({
      board,
      questions: summaryQuestions,
      sources: boardSources,
      compiled: {
        goal: synthesis.goal.trim().slice(0, 2000),
        currentState: synthesis.currentState.trim().slice(0, 2000),
        targetUser: synthesis.targetUser.trim().slice(0, 1000),
        nonGoals: [],
        qualityBar: synthesis.qualityBar.trim().slice(0, 2000),
        testPolicy: {
          defaultProof: synthesis.qualityBar,
          requireProofSpec: true,
          unit: true,
          integration: true,
          visual: true,
          manual: true,
          proofScopeWarningPolicy: "advisory",
          synthesizedAt: now,
        },
        decisionPolicy: { default: "ask_when_ambiguous", assumptions: synthesis.assumptions },
        dependencyPolicy: { ordering: "blockers_first", source: "board_synthesis", explicitBlockers: true },
        budgetPolicy: mergedBudgetPolicy,
        sourcePolicy: synthesizedSourcePolicy,
        summary: synthesis.summary.trim().slice(0, 500),
        markdown,
      },
      generatedAt: now,
    });
    const transaction = this.requireDb().transaction(() => {
      if (pendingPiUpdates.length > 0) {
        const updatePendingPi = this.requireDb().prepare(
          `UPDATE project_board_cards
           SET pending_pi_update_json = ?,
               updated_at = ?
           WHERE id = ?`,
        );
        for (const entry of pendingPiUpdates) {
          const result = updatePendingPi.run(JSON.stringify(entry.update), now, entry.cardId);
          if (result.changes <= 0) continue;
          protectedPiUpdateCardIds.push(entry.cardId);
          protectedPiUpdateSourceIds.push(entry.update.sourceId);
          this.appendProjectBoardEvent({
            boardId,
            kind: "card_updated",
            title: "Pi update available",
            summary: `Pi proposed updates to a protected card (${entry.update.changedFields.join(", ")}).`,
            entityKind: "project_board_card",
            entityId: entry.cardId,
            metadata: { cardId: entry.cardId, sourceId: entry.update.sourceId, changedFields: entry.update.changedFields, protectedPiUpdate: true },
            createdAt: now,
          });
        }
      }
      if (staleReplaceableDraftCardIds.length > 0) {
        const placeholders = staleReplaceableDraftCardIds.map(() => "?").join(", ");
        this.requireDb()
          .prepare(`DELETE FROM project_board_cards WHERE id IN (${placeholders})`)
          .run(...staleReplaceableDraftCardIds);
      }
      if (board.charter_id) {
        this.requireDb()
          .prepare(
            `UPDATE project_board_charters
             SET goal = ?,
                 current_state = ?,
                 target_user = ?,
                 non_goals_json = ?,
                 quality_bar = ?,
                 test_policy_json = ?,
                 decision_policy_json = ?,
                 dependency_policy_json = ?,
                 budget_policy_json = ?,
                 source_policy_json = ?,
                 markdown = ?,
                 project_summary_json = ?,
                 updated_at = ?
             WHERE id = ?`,
          )
          .run(
            synthesis.goal.trim().slice(0, 2000),
            synthesis.currentState.trim().slice(0, 2000),
            synthesis.targetUser.trim().slice(0, 1000),
            JSON.stringify([]),
            synthesis.qualityBar.trim().slice(0, 2000),
            JSON.stringify({
              defaultProof: synthesis.qualityBar,
              requireProofSpec: true,
              unit: true,
              integration: true,
              visual: true,
              manual: true,
              proofScopeWarningPolicy: "advisory",
              synthesizedAt: now,
            }),
            JSON.stringify({ default: "ask_when_ambiguous", assumptions: synthesis.assumptions }),
            JSON.stringify({ ordering: "blockers_first", source: "board_synthesis", explicitBlockers: true }),
            JSON.stringify(mergedBudgetPolicy),
            JSON.stringify(synthesizedSourcePolicy),
            markdown,
            JSON.stringify(synthesizedCharterSummary),
            now,
            board.charter_id,
          );
      }

      const insertQuestion = this.requireDb().prepare(
        `INSERT INTO project_board_questions
         (id, board_id, question_order, question, required, answer, answered_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      questionsToInsert.forEach((question, index) => {
        const questionId = randomUUID();
        insertedQuestionIds.push(questionId);
        insertQuestion.run(questionId, boardId, maxOrder.question_order + index + 1, question, 1, null, null, now, now);
      });

      const insertCard = this.requireDb().prepare(
        `INSERT OR IGNORE INTO project_board_cards
        (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
         acceptance_criteria_json, test_plan_json, source_refs_json, clarification_questions_json, clarification_suggestions_json, clarification_decisions_json,
         source_kind, source_id, source_thread_id,
         source_message_id, orchestration_task_id, objective_provenance_json, ui_mock_role, requires_ui_mock_approval, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const updateReplaceableCard = this.requireDb().prepare(
        `UPDATE project_board_cards
         SET title = ?,
             description = ?,
             candidate_status = ?,
             priority = ?,
             phase = ?,
             labels_json = ?,
             blocked_by_json = ?,
             acceptance_criteria_json = ?,
             test_plan_json = ?,
             source_refs_json = ?,
             clarification_questions_json = ?,
             clarification_suggestions_json = ?,
             clarification_decisions_json = ?,
             objective_provenance_json = ?,
             ui_mock_role = ?,
             requires_ui_mock_approval = ?,
             pending_pi_update_json = NULL,
             updated_at = ?
         WHERE id = ?
           AND board_id = ?
           AND status = 'draft'
           AND source_kind = 'board_synthesis'
           AND orchestration_task_id IS NULL`,
      );
      for (const entry of cardsToUpdate) {
        preservedDraftCardIds.add(entry.existing.id);
        if (!entry.update) continue;
        const result = updateReplaceableCard.run(
          entry.update.title,
          entry.update.description,
          entry.update.candidateStatus,
          entry.update.priority ?? null,
          entry.update.phase ?? null,
          JSON.stringify(entry.update.labels),
          JSON.stringify(entry.update.blockedBy),
          JSON.stringify(entry.update.acceptanceCriteria),
          JSON.stringify(entry.update.testPlan),
          JSON.stringify(entry.update.sourceRefs),
          JSON.stringify(entry.update.clarificationQuestions),
          JSON.stringify(normalizeProjectBoardClarificationSuggestions(entry.update.clarificationSuggestions ?? [], [])),
          JSON.stringify(entry.update.clarificationDecisions ?? []),
          objectiveProvenanceJson(entry.update.objectiveProvenance),
          normalizeProjectBoardUiMockRole(entry.update.uiMockRole) ?? null,
          entry.update.requiresUiMockApproval ? 1 : 0,
          now,
          entry.existing.id,
          boardId,
        );
        if (result.changes > 0) updatedCardIds.push(entry.existing.id);
      }
      for (const card of cardsToInsert) {
        const cardId = randomUUID();
        const clarification = normalizeProjectBoardSynthesisClarificationFields({
          clarificationQuestions: card.clarificationQuestions,
          clarificationSuggestions: card.clarificationSuggestions,
          clarificationDecisions: card.clarificationDecisions,
          createdAt: now,
          updatedAt: now,
        });
        const result = insertCard.run(
          cardId,
          boardId,
          card.title.trim().slice(0, 180),
          card.description.trim().slice(0, 4000),
          "draft",
          card.candidateStatus,
          typeof card.priority === "number" ? Math.max(1, Math.round(card.priority)) : null,
          card.phase?.trim().slice(0, 120) || null,
          JSON.stringify(normalizeTaskLabels(card.labels)),
          JSON.stringify(normalizeTaskReferences(card.blockedBy)),
          JSON.stringify(normalizeCardTextList(card.acceptanceCriteria, 30)),
          JSON.stringify(normalizeProjectBoardCardTestPlan(card.testPlan)),
          JSON.stringify(normalizeCardTextList(card.sourceRefs, 20)),
          JSON.stringify(clarification.clarificationQuestions),
          JSON.stringify(clarification.clarificationSuggestions),
          JSON.stringify(clarification.clarificationDecisions),
          "board_synthesis",
          card.sourceId.trim(),
          projectBoardSynthesisCardThreadId({ card, sources: boardSources, boardSourceThreadId }),
          null,
          null,
          objectiveProvenanceJson(card.objectiveProvenance),
          projectBoardUiMockRoleForSynthesisCard(card) ?? null,
          projectBoardRequiresUiMockApprovalForSynthesisCard(card) ? 1 : 0,
          now,
          now,
        );
        if (result.changes > 0) insertedCardIds.push(cardId);
      }
      if (
        options.coverPlannerPlanDrafts &&
        (insertedCardIds.length + updatedCardIds.length > 0 || existingSynthesisRows.length > 0)
      ) {
        const plannerPlanRows = this.requireDb()
          .prepare(
            `SELECT id, title FROM project_board_cards
             WHERE board_id = ?
               AND status = 'draft'
               AND source_kind = 'planner_plan'
               AND orchestration_task_id IS NULL
               AND candidate_status NOT IN ('evidence', 'duplicate', 'rejected')
               AND user_touched_at IS NULL
               AND (user_touched_fields_json IS NULL OR user_touched_fields_json = '[]')`,
          )
          .all(boardId) as Array<{ id: string; title: string }>;
        const markCovered = this.requireDb().prepare("UPDATE project_board_cards SET candidate_status = 'evidence', updated_at = ? WHERE id = ?");
        for (const row of plannerPlanRows) {
          const result = markCovered.run(now, row.id);
          if (result.changes <= 0) continue;
          coveredPlannerPlanCardIds.push(row.id);
          this.appendProjectBoardEvent({
            boardId,
            kind: "card_updated",
            title: "Planner plan covered by synthesis",
            summary: `${row.title} was marked covered because Ambient/Pi created actionable board-synthesis candidate cards from the plan source.`,
            entityKind: "project_board_card",
            entityId: row.id,
            metadata: { cardId: row.id, candidateStatus: "evidence", coveredBySynthesisCardIds: [...updatedCardIds, ...insertedCardIds] },
            createdAt: now,
          });
        }
      }

      this.requireDb()
        .prepare("UPDATE project_boards SET summary = ?, updated_at = ? WHERE id = ?")
        .run((synthesis.summary || board.summary).trim().slice(0, 500), now, boardId);
      this.appendProjectBoardEvent({
        boardId,
        kind: "board_synthesized",
        title: "Board synthesis applied",
        summary: `${insertedCardIds.length + updatedCardIds.length} candidate card${insertedCardIds.length + updatedCardIds.length === 1 ? "" : "s"} and ${insertedQuestionIds.length} kickoff question${insertedQuestionIds.length === 1 ? "" : "s"} applied from project sources.`,
        entityKind: "project_board",
        entityId: boardId,
        metadata: {
          cardIds: insertedCardIds,
          updatedCardIds,
          appliedCardIds: [...updatedCardIds, ...insertedCardIds],
          questionIds: insertedQuestionIds,
          skippedDuplicateCards: cardsToInsert.length - insertedCardIds.length,
          replacedDraftCardCount: staleReplaceableDraftCardIds.length,
          staleDraftDeletionSkipped: options.replaceExistingDraft === true && !deleteStaleDraftCards,
          updatedDraftCardCount: updatedCardIds.length,
          coveredPlannerPlanCardIds,
          coveredPlannerPlanCardCount: coveredPlannerPlanCardIds.length,
          preservedDraftCardIds: Array.from(preservedDraftCardIds),
          preservedDraftCardCount: preservedDraftCardIds.size,
          protectedPiUpdateCardIds,
          protectedPiUpdateSourceIds,
          protectedPiUpdateCount: protectedPiUpdateCardIds.length,
          sourceNotes: synthesis.sourceNotes,
          assumptions: synthesis.assumptions,
          cardSources: synthesis.cards.map((card) => ({ sourceId: card.sourceId, sourceRefs: card.sourceRefs })),
          cardClarificationQuestions: synthesis.cards.map((card) => ({ sourceId: card.sourceId, clarificationQuestions: card.clarificationQuestions ?? [] })),
        },
        createdAt: now,
      });
    });
    transaction();
    const updated = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardRow | undefined;
    if (!updated) throw new Error(`Project board not found after synthesis: ${boardId}`);
    let summary = this.mapProjectBoard(updated);
    if (options.snapshotRunId) {
      this.appendProjectBoardPlanningSnapshotForRun(options.snapshotRunId, options.snapshotKind ?? "manual");
      summary = this.getProjectBoard(boardId) ?? summary;
    }
    return summary;
  }

  private appendProjectBoardPlanningSnapshotForProposal(
    boardId: string,
    proposalId: string,
  ): { runId: string; snapshot: ProjectBoardPlanningSnapshot } | undefined {
    const row = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_synthesis_runs
         WHERE board_id = ?
           AND proposal_id = ?
           AND status IN ('paused', 'succeeded')
         ORDER BY updated_at DESC, started_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(boardId, proposalId) as ProjectBoardSynthesisRunRow | undefined;
    if (!row) return undefined;
    const snapshot = this.appendProjectBoardPlanningSnapshotForRun(row.id, row.status === "paused" ? "paused" : "final");
    return snapshot ? { runId: row.id, snapshot } : undefined;
  }

  createProjectBoardSynthesisProposal(input: {
    boardId: string;
    synthesis: ProjectBoardSynthesisDraft;
    reviewReport?: ProjectBoardPmReviewReport;
    model?: string;
    durationMs?: number;
  }): ProjectBoardSynthesisProposal {
    const board = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(input.boardId) as ProjectBoardRow | undefined;
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    if (board.status === "archived") throw new Error("Archived project boards cannot be refined.");
    const now = new Date().toISOString();
    const proposalId = randomUUID();
    const cards = projectBoardSynthesisProposalCardsFromDraft(input.synthesis);
    const reviewReport = input.reviewReport ? normalizeProjectBoardPmReviewReport(input.reviewReport) : undefined;
    if (cards.length === 0 && !reviewReport) throw new Error("Project board synthesis proposal must include at least one card or a PM review report.");

    const transaction = this.requireDb().transaction(() => {
      this.requireDb()
        .prepare(
          `UPDATE project_board_synthesis_proposals
           SET status = 'superseded', updated_at = ?
           WHERE board_id = ? AND status = 'pending'`,
        )
        .run(now, input.boardId);
      this.requireDb()
        .prepare(
          `INSERT INTO project_board_synthesis_proposals
           (id, board_id, status, summary, goal, current_state, target_user, quality_bar,
            assumptions_json, questions_json, answers_json, source_notes_json, cards_json, review_report_json, model, duration_ms, created_at, updated_at, applied_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          proposalId,
          input.boardId,
          "pending",
          input.synthesis.summary.trim().slice(0, 500),
          input.synthesis.goal.trim().slice(0, 2000),
          input.synthesis.currentState.trim().slice(0, 2000),
          input.synthesis.targetUser.trim().slice(0, 1000),
          input.synthesis.qualityBar.trim().slice(0, 2000),
          JSON.stringify(normalizeCardTextList(input.synthesis.assumptions, 20)),
          JSON.stringify(normalizeCardTextList(input.synthesis.questions, 12)),
          JSON.stringify([]),
          JSON.stringify(normalizeCardTextList(input.synthesis.sourceNotes, 20)),
          JSON.stringify(cards),
          reviewReport ? JSON.stringify(reviewReport) : null,
          input.model?.trim() || null,
          typeof input.durationMs === "number" && Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : null,
          now,
          now,
          null,
        );
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "synthesis_proposal_created",
        title: reviewReport ? "Pi charter review ready" : "Pi synthesis proposal ready",
        summary: reviewReport
          ? `A lightweight PM review report is ready with ${input.synthesis.questions.length} blocking question${input.synthesis.questions.length === 1 ? "" : "s"} and zero generated cards.`
          : `${cards.length} candidate card${cards.length === 1 ? "" : "s"} and ${input.synthesis.questions.length} question${input.synthesis.questions.length === 1 ? "" : "s"} are ready for PM review.`,
        entityKind: "project_board_synthesis_proposal",
        entityId: proposalId,
        metadata: {
          proposalId,
          model: input.model,
          durationMs: input.durationMs,
          cardCount: cards.length,
          questionCount: input.synthesis.questions.length,
          reviewReport: Boolean(reviewReport),
          readiness: reviewReport?.readiness,
          supersededPending: true,
        },
        createdAt: now,
      });
    });
    transaction();
    const row = this.requireDb()
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(proposalId) as ProjectBoardSynthesisProposalRow | undefined;
    if (!row) throw new Error(`Project board synthesis proposal not found after create: ${proposalId}`);
    return this.mapProjectBoardSynthesisProposal(row);
  }

  updateProjectBoardSynthesisProposal(input: {
    proposalId: string;
    synthesis: ProjectBoardSynthesisDraft;
    reviewReport?: ProjectBoardPmReviewReport;
    model?: string;
    durationMs?: number;
  }): ProjectBoardSynthesisProposal {
    const row = this.requireDb()
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(input.proposalId) as ProjectBoardSynthesisProposalRow | undefined;
    if (!row) throw new Error(`Project board synthesis proposal not found: ${input.proposalId}`);
    if (row.status !== "pending") throw new Error(`Project board synthesis proposal is ${row.status}, not pending.`);
    const board = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(row.board_id) as ProjectBoardRow | undefined;
    if (!board) throw new Error(`Project board not found: ${row.board_id}`);
    if (board.status === "archived") throw new Error("Archived project boards cannot be refined.");
    const existingProposal = this.mapProjectBoardSynthesisProposal(row);
    const cards = projectBoardSynthesisProposalCardsFromDraft(input.synthesis, existingProposal.cards);
    const reviewReport = input.reviewReport ? normalizeProjectBoardPmReviewReport(input.reviewReport) : undefined;
    if (cards.length === 0 && !reviewReport) throw new Error("Project board synthesis proposal must include at least one card or a PM review report.");
    const now = new Date().toISOString();

    const transaction = this.requireDb().transaction(() => {
      this.requireDb()
        .prepare(
          `UPDATE project_board_synthesis_proposals
           SET summary = ?,
               goal = ?,
               current_state = ?,
               target_user = ?,
               quality_bar = ?,
               assumptions_json = ?,
               questions_json = ?,
               source_notes_json = ?,
               cards_json = ?,
               review_report_json = ?,
               model = COALESCE(?, model),
               duration_ms = COALESCE(?, duration_ms),
               updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.synthesis.summary.trim().slice(0, 500),
          input.synthesis.goal.trim().slice(0, 2000),
          input.synthesis.currentState.trim().slice(0, 2000),
          input.synthesis.targetUser.trim().slice(0, 1000),
          input.synthesis.qualityBar.trim().slice(0, 2000),
          JSON.stringify(normalizeCardTextList(input.synthesis.assumptions, 20)),
          JSON.stringify(normalizeCardTextList(input.synthesis.questions, 12)),
          JSON.stringify(normalizeCardTextList(input.synthesis.sourceNotes, 20)),
          JSON.stringify(cards),
          reviewReport ? JSON.stringify(reviewReport) : null,
          input.model?.trim() || null,
          typeof input.durationMs === "number" && Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : null,
          now,
          input.proposalId,
        );
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, row.board_id);
      this.appendProjectBoardEvent({
        boardId: row.board_id,
        kind: "synthesis_proposal_created",
        title: reviewReport ? "Pi charter review updated" : "Pi synthesis proposal updated",
        summary: reviewReport
          ? `A lightweight PM review report is ready with ${input.synthesis.questions.length} blocking question${input.synthesis.questions.length === 1 ? "" : "s"} and zero generated cards.`
          : `${cards.length} candidate card${cards.length === 1 ? "" : "s"} and ${input.synthesis.questions.length} question${
              input.synthesis.questions.length === 1 ? "" : "s"
            } are available for PM review.`,
        entityKind: "project_board_synthesis_proposal",
        entityId: input.proposalId,
        metadata: {
          proposalId: input.proposalId,
          model: input.model,
          durationMs: input.durationMs,
          cardCount: cards.length,
          questionCount: input.synthesis.questions.length,
          reviewReport: Boolean(reviewReport),
          readiness: reviewReport?.readiness,
          progressiveUpdate: true,
        },
        createdAt: now,
      });
    });
    transaction();
    const updated = this.requireDb()
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(input.proposalId) as ProjectBoardSynthesisProposalRow | undefined;
    if (!updated) throw new Error(`Project board synthesis proposal not found after update: ${input.proposalId}`);
    return this.mapProjectBoardSynthesisProposal(updated);
  }

  getProjectBoardSynthesisProposal(proposalId: string): ProjectBoardSynthesisProposal | undefined {
    const row = this.requireDb()
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(proposalId) as ProjectBoardSynthesisProposalRow | undefined;
    return row ? this.mapProjectBoardSynthesisProposal(row) : undefined;
  }

  getLatestPendingProjectBoardSynthesisProposal(boardId: string): ProjectBoardSynthesisProposal | undefined {
    const row = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_synthesis_proposals
         WHERE board_id = ? AND status = 'pending'
         ORDER BY created_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(boardId) as ProjectBoardSynthesisProposalRow | undefined;
    return row ? this.mapProjectBoardSynthesisProposal(row) : undefined;
  }

  createProjectBoardSynthesisRun(input: {
    boardId: string;
    model?: string;
    retryOfRunId?: string;
    initialStage?: ProjectBoardSynthesisRunStage;
    initialTitle?: string;
    initialSummary?: string;
    initialMetadata?: Record<string, unknown>;
    sourceCount?: number;
    includedSourceCount?: number;
    sourceCharCount?: number;
  }): ProjectBoardSynthesisRun {
    const board = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(input.boardId) as ProjectBoardRow | undefined;
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = new Date().toISOString();
    const runId = randomUUID();
    const initialStage = input.initialStage ?? "source_scan";
    const events: ProjectBoardSynthesisRunEvent[] = [
      {
        stage: initialStage,
        title: (input.initialTitle ?? "Synthesis run started").trim().slice(0, 180),
        summary: (input.initialSummary ?? "Preparing to scan project sources for a Pi PM review proposal.").trim().slice(0, 1000),
        metadata: input.initialMetadata ?? { model: input.model, retryOfRunId: input.retryOfRunId },
        createdAt: now,
      },
    ];
    this.requireDb()
      .prepare(
        `INSERT INTO project_board_synthesis_runs
         (id, board_id, proposal_id, retry_of_run_id, status, stage, model, source_count, included_source_count,
          source_char_count, prompt_char_count, response_char_count, card_count, question_count, warning_count, error,
          events_json, progressive_records_json, planning_snapshots_json, started_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        runId,
        input.boardId,
        null,
        input.retryOfRunId?.trim() || null,
        "running",
        initialStage,
        input.model?.trim() || null,
        typeof input.sourceCount === "number" && Number.isFinite(input.sourceCount) ? Math.max(0, Math.round(input.sourceCount)) : 0,
        typeof input.includedSourceCount === "number" && Number.isFinite(input.includedSourceCount) ? Math.max(0, Math.round(input.includedSourceCount)) : 0,
        typeof input.sourceCharCount === "number" && Number.isFinite(input.sourceCharCount) ? Math.max(0, Math.round(input.sourceCharCount)) : 0,
        null,
        null,
        null,
        null,
        0,
        null,
        JSON.stringify(events),
        "[]",
        "[]",
        now,
        now,
        null,
      );
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
    const row = this.requireDb().prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as ProjectBoardSynthesisRunRow | undefined;
    if (!row) throw new Error(`Project board synthesis run not found after create: ${runId}`);
    return this.mapProjectBoardSynthesisRun(row);
  }

  getProjectBoardSynthesisRun(runId: string): ProjectBoardSynthesisRun | undefined {
    const row = this.requireDb().prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunRow
      | undefined;
    return row ? this.mapProjectBoardSynthesisRun(row) : undefined;
  }

  getRunningProjectBoardSynthesisRun(
    boardId: string,
    input: { excludeStages?: ProjectBoardSynthesisRunStage[] } = {},
  ): ProjectBoardSynthesisRun | undefined {
    const rows = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_synthesis_runs
         WHERE board_id = ? AND status IN ('running', 'pause_requested')
         ORDER BY updated_at DESC, started_at DESC, rowid DESC
         LIMIT 20`,
      )
      .all(boardId) as ProjectBoardSynthesisRunRow[];
    const excluded = new Set(input.excludeStages ?? []);
    for (const row of rows) {
      const run = this.mapProjectBoardSynthesisRun(row);
      if (!excluded.has(run.stage)) return run;
    }
    return undefined;
  }

  failStaleProjectBoardSynthesisRuns(input: { boardId: string; staleBefore: string; reason: string }): ProjectBoardSynthesisRun[] {
    const board = this.requireDb().prepare("SELECT id FROM project_boards WHERE id = ?").get(input.boardId) as { id: string } | undefined;
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    if (!Number.isFinite(Date.parse(input.staleBefore))) throw new Error(`Invalid project board synthesis stale cutoff: ${input.staleBefore}`);
    const rows = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_synthesis_runs
         WHERE board_id = ? AND status IN ('running', 'pause_requested') AND updated_at < ?
         ORDER BY updated_at ASC, started_at ASC, rowid ASC`,
      )
      .all(input.boardId, input.staleBefore) as ProjectBoardSynthesisRunRow[];
    return rows.map((row) =>
      this.recordProjectBoardSynthesisRunEvent(row.id, {
        stage: "failed",
        title: "Synthesis run marked stale",
        summary: input.reason,
        metadata: { staleBefore: input.staleBefore, previousStage: row.stage, previousUpdatedAt: row.updated_at },
        status: "failed",
        error: input.reason,
        completedAt: new Date().toISOString(),
      }),
    );
  }

  markProjectBoardSynthesisRunStalled(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    const row = this.requireDb().prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(input.runId) as
      | ProjectBoardSynthesisRunRow
      | undefined;
    if (!row) throw new Error(`Project board synthesis run not found: ${input.runId}`);
    if (row.board_id !== input.boardId) throw new Error(`Project board synthesis run ${input.runId} does not belong to board ${input.boardId}`);
    const run = this.mapProjectBoardSynthesisRun(row);
    if (run.status !== "running") throw new Error(`Only a running project-board synthesis run can be marked stalled: ${input.runId}`);
    const partial = projectBoardSynthesisPartialStatus(run);
    const reason = input.reason?.trim() || "No visible project-board synthesis progress is being received.";
    const reusableCount = partial.completedCount;
    return this.recordProjectBoardSynthesisRunEvent(input.runId, {
      stage: "failed",
      title: "Synthesis run marked stalled",
      summary: `${reason} Retry will reuse ${reusableCount} completed or reused section record${reusableCount === 1 ? "" : "s"} where possible and resume uncovered work.`,
      metadata: {
        decision: "retry_stalled_run",
        retryable: true,
        previousStage: row.stage,
        previousUpdatedAt: row.updated_at,
        completedSectionCount: partial.completedCount,
        reusedSectionCount: partial.reusedCount,
        failedSectionCount: partial.failedCount,
        sectionCount: partial.sectionCount,
      },
      status: "failed",
      error: reason,
      completedAt: new Date().toISOString(),
    });
  }

  requestProjectBoardSynthesisRunPause(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    const row = this.requireDb().prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(input.runId) as
      | ProjectBoardSynthesisRunRow
      | undefined;
    if (!row) throw new Error(`Project board synthesis run not found: ${input.runId}`);
    if (row.board_id !== input.boardId) throw new Error(`Project board synthesis run ${input.runId} does not belong to board ${input.boardId}`);
    const run = this.mapProjectBoardSynthesisRun(row);
    if (run.status === "paused") return run;
    if (run.status === "pause_requested") return run;
    if (run.status !== "running") throw new Error(`Only a running project-board synthesis run can be paused: ${input.runId}`);
    const reason = input.reason?.trim() || "Pause requested from the project-board progress panel.";
    return this.recordProjectBoardSynthesisRunEvent(input.runId, {
      stage: run.stage,
      title: "Pause requested",
      summary: "Ambient will stop at the next safe planner checkpoint, flush validated records, and leave the run resumable.",
      metadata: {
        decision: "pause_planning",
        reason,
        previousStatus: run.status,
        previousStage: run.stage,
        previousUpdatedAt: run.updatedAt,
        checkpointPolicy: "safe_planner_boundary",
      },
      status: "pause_requested",
    });
  }

  markProjectBoardSynthesisRunPaused(input: {
    boardId: string;
    runId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): ProjectBoardSynthesisRun {
    const row = this.requireDb().prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(input.runId) as
      | ProjectBoardSynthesisRunRow
      | undefined;
    if (!row) throw new Error(`Project board synthesis run not found: ${input.runId}`);
    if (row.board_id !== input.boardId) throw new Error(`Project board synthesis run ${input.runId} does not belong to board ${input.boardId}`);
    const run = this.mapProjectBoardSynthesisRun(row);
    if (run.status === "paused") return run;
    if (run.status !== "running" && run.status !== "pause_requested") {
      throw new Error(`Only an active project-board synthesis run can be marked paused: ${input.runId}`);
    }
    const reason = input.reason?.trim() || "Planning paused at a safe checkpoint.";
    return this.recordProjectBoardSynthesisRunEvent(input.runId, {
      stage: "paused",
      title: "Planning paused",
      summary: `${reason} Resume will reuse validated planner records and ask Ambient/Pi only for remaining cards.`,
      metadata: {
        decision: "planning_paused",
        previousStatus: run.status,
        previousStage: run.stage,
        previousUpdatedAt: run.updatedAt,
        retryable: true,
        checkpointPolicy: "validated_progressive_records",
        ...(input.metadata ?? {}),
      },
      status: "paused",
      completedAt: new Date().toISOString(),
    });
  }

  abandonProjectBoardSynthesisRunPause(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    const row = this.requireDb().prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(input.runId) as
      | ProjectBoardSynthesisRunRow
      | undefined;
    if (!row) throw new Error(`Project board synthesis run not found: ${input.runId}`);
    if (row.board_id !== input.boardId) throw new Error(`Project board synthesis run ${input.runId} does not belong to board ${input.boardId}`);
    const run = this.mapProjectBoardSynthesisRun(row);
    if (run.status === "abandoned") return run;
    if (run.status !== "paused") throw new Error(`Only a paused project-board synthesis run can be abandoned: ${input.runId}`);
    const reason = input.reason?.trim() || "Start Fresh requested from the paused project-board synthesis run.";
    return this.recordProjectBoardSynthesisRunEvent(input.runId, {
      stage: "paused",
      title: "Paused planning abandoned",
      summary: `${reason} A fresh synthesis run will start from the current board and source context without reusing this paused checkpoint.`,
      metadata: {
        decision: "abandon_paused_planning",
        previousStatus: run.status,
        previousStage: run.stage,
        previousUpdatedAt: run.updatedAt,
        retryable: false,
        checkpointPolicy: "start_fresh",
      },
      status: "abandoned",
      completedAt: new Date().toISOString(),
    });
  }

  supersedeProjectBoardSynthesisCardsForStartFresh(input: { boardId: string; runId: string; reason?: string }): {
    supersededDraftCardIds: string[];
    demotedPreservedCardIds: string[];
    preservedCardIds: string[];
  } {
    const board = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(input.boardId) as ProjectBoardRow | undefined;
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const rows = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE board_id = ?
           AND source_kind = 'board_synthesis'
           AND status != 'archived'`,
      )
      .all(input.boardId) as ProjectBoardCardRow[];
    if (rows.length === 0) return { supersededDraftCardIds: [], demotedPreservedCardIds: [], preservedCardIds: [] };

    const claimSummary = projectBoardClaimSummaryFromEvents(this.listProjectBoardEvents(input.boardId));
    const protectedClaimCardIds = new Set([
      ...claimSummary.active.map((claim) => claim.cardId),
      ...claimSummary.conflicts.map((claim) => claim.cardId),
    ]);
    const artifactRows = this.requireDb()
      .prepare("SELECT DISTINCT card_id FROM project_board_execution_artifacts WHERE board_id = ?")
      .all(input.boardId) as Array<{ card_id: string }>;
    const executionArtifactCardIds = new Set(artifactRows.map((row) => row.card_id));
    const isReplaceable = (row: ProjectBoardCardRow): boolean =>
      !projectBoardSynthesisCardRowProtectedFromDraftReplacement(row, protectedClaimCardIds) &&
      !row.execution_thread_id &&
      !row.proof_review_json &&
      !row.split_outcome_json &&
      !executionArtifactCardIds.has(row.id);
    const replaceableRows = rows.filter(isReplaceable);
    const preservedRows = rows.filter((row) => !isReplaceable(row));
    const demotableRows = preservedRows.filter(
      (row) =>
        row.status === "ready" ||
        row.status === "in_progress" ||
        row.status === "blocked" ||
        Boolean(row.orchestration_task_id) ||
        Boolean(row.execution_thread_id) ||
        row.candidate_status === "ready_to_create",
    );
    const supersededDraftCardIds = replaceableRows.map((row) => row.id);
    const preservedCardIds = preservedRows.map((row) => row.id);
    const demotedPreservedCardIds = demotableRows.map((row) => row.id);
    const detachedTaskIds = demotableRows.map((row) => row.orchestration_task_id).filter((value): value is string => Boolean(value));
    const now = new Date().toISOString();
    const reason = input.reason?.trim() || "Start Fresh requested from a paused project-board synthesis run.";
    const archiveReplaceable = this.requireDb().prepare(
      `UPDATE project_board_cards
       SET status = 'archived',
           candidate_status = 'duplicate',
           clarification_questions_json = '[]',
           clarification_answers_json = '[]',
           clarification_decisions_json = '[]',
           pending_pi_update_json = NULL,
           updated_at = ?
       WHERE id = ?`,
    );
    const demotePreserved = this.requireDb().prepare(
      `UPDATE project_board_cards
       SET status = 'draft',
           candidate_status = CASE WHEN candidate_status = 'ready_to_create' THEN 'needs_clarification' ELSE candidate_status END,
           orchestration_task_id = NULL,
           execution_thread_id = NULL,
           pending_pi_update_json = NULL,
           updated_at = ?
       WHERE id = ?`,
    );
    const transaction = this.requireDb().transaction(() => {
      for (const row of replaceableRows) archiveReplaceable.run(now, row.id);
      for (const row of demotableRows) demotePreserved.run(now, row.id);
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "card_updated",
        title: "Start Fresh cleared draft synthesis cards",
        summary: [
          supersededDraftCardIds.length
            ? `Superseded ${supersededDraftCardIds.length} untouched draft synthesis card${supersededDraftCardIds.length === 1 ? "" : "s"}.`
            : "No untouched draft synthesis cards needed superseding.",
          demotedPreservedCardIds.length
            ? `Moved ${demotedPreservedCardIds.length} preserved card${demotedPreservedCardIds.length === 1 ? "" : "s"} back to non-active review.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        entityKind: "project_board_synthesis_run",
        entityId: input.runId,
        metadata: {
          decision: "start_fresh_supersede_drafts",
          abandonedRunId: input.runId,
          reason,
          supersededDraftCardIds,
          supersededDraftCardCount: supersededDraftCardIds.length,
          supersededDraftCards: replaceableRows.slice(0, 80).map(projectBoardSynthesisStartFreshCardSnapshot),
          preservedCardIds,
          preservedCardCount: preservedCardIds.length,
          preservedCards: preservedRows.slice(0, 80).map(projectBoardSynthesisStartFreshCardSnapshot),
          demotedPreservedCardIds,
          demotedPreservedCardCount: demotedPreservedCardIds.length,
          detachedTaskIds,
        },
        createdAt: now,
      });
    });
    transaction();
    return { supersededDraftCardIds, demotedPreservedCardIds, preservedCardIds };
  }

  recordProjectBoardSynthesisRunEvent(
    runId: string,
    input: {
      stage: ProjectBoardSynthesisRunStage;
      title: string;
      summary: string;
      metadata?: Record<string, unknown>;
      status?: ProjectBoardSynthesisRunStatus;
      proposalId?: string;
      model?: string;
      sourceCount?: number;
      includedSourceCount?: number;
      sourceCharCount?: number;
      promptCharCount?: number;
      responseCharCount?: number;
      cardCount?: number;
      questionCount?: number;
      warningCount?: number;
      error?: string;
      completedAt?: string;
      skipPlanningSnapshot?: boolean;
    },
  ): ProjectBoardSynthesisRun {
    const row = this.requireDb().prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunRow
      | undefined;
    if (!row) throw new Error(`Project board synthesis run not found: ${runId}`);
    const now = new Date().toISOString();
    const events = [
      ...parseJsonArray<ProjectBoardSynthesisRunEvent>(row.events_json),
      {
        stage: input.stage,
        title: input.title.trim().slice(0, 180),
        summary: input.summary.trim().slice(0, 1000),
        metadata: input.metadata ?? {},
        createdAt: now,
      },
    ];
    this.requireDb()
      .prepare(
        `UPDATE project_board_synthesis_runs
         SET proposal_id = COALESCE(?, proposal_id),
             status = COALESCE(?, status),
             stage = ?,
             model = COALESCE(?, model),
             source_count = COALESCE(?, source_count),
             included_source_count = COALESCE(?, included_source_count),
             source_char_count = COALESCE(?, source_char_count),
             prompt_char_count = COALESCE(?, prompt_char_count),
             response_char_count = COALESCE(?, response_char_count),
             card_count = COALESCE(?, card_count),
             question_count = COALESCE(?, question_count),
             warning_count = COALESCE(?, warning_count),
             error = COALESCE(?, error),
             events_json = ?,
             updated_at = ?,
             completed_at = COALESCE(?, completed_at)
         WHERE id = ?`,
      )
      .run(
        input.proposalId?.trim() || null,
        input.status ?? null,
        input.stage,
        input.model?.trim() || null,
        typeof input.sourceCount === "number" && Number.isFinite(input.sourceCount) ? Math.max(0, Math.round(input.sourceCount)) : null,
        typeof input.includedSourceCount === "number" && Number.isFinite(input.includedSourceCount)
          ? Math.max(0, Math.round(input.includedSourceCount))
          : null,
        typeof input.sourceCharCount === "number" && Number.isFinite(input.sourceCharCount) ? Math.max(0, Math.round(input.sourceCharCount)) : null,
        typeof input.promptCharCount === "number" && Number.isFinite(input.promptCharCount) ? Math.max(0, Math.round(input.promptCharCount)) : null,
        typeof input.responseCharCount === "number" && Number.isFinite(input.responseCharCount) ? Math.max(0, Math.round(input.responseCharCount)) : null,
        typeof input.cardCount === "number" && Number.isFinite(input.cardCount) ? Math.max(0, Math.round(input.cardCount)) : null,
        typeof input.questionCount === "number" && Number.isFinite(input.questionCount) ? Math.max(0, Math.round(input.questionCount)) : null,
        typeof input.warningCount === "number" && Number.isFinite(input.warningCount) ? Math.max(0, Math.round(input.warningCount)) : null,
        input.error?.trim().slice(0, 1000) || null,
        JSON.stringify(events),
        now,
        input.completedAt ?? null,
        runId,
      );
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, row.board_id);
    let updated = this.requireDb().prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunRow
      | undefined;
    if (!updated) throw new Error(`Project board synthesis run not found after update: ${runId}`);
    if ((input.status === "paused" || input.status === "succeeded") && input.skipPlanningSnapshot !== true) {
      this.appendProjectBoardPlanningSnapshotForRun(runId, input.status === "paused" ? "paused" : "final");
      updated = this.requireDb().prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
        | ProjectBoardSynthesisRunRow
        | undefined;
      if (!updated) throw new Error(`Project board synthesis run not found after snapshot: ${runId}`);
    }
    return this.mapProjectBoardSynthesisRun(updated);
  }

  updateProjectBoardSynthesisRunProgress(
    runId: string,
    input: {
      stage?: ProjectBoardSynthesisRunStage;
      model?: string;
      sourceCount?: number;
      includedSourceCount?: number;
      sourceCharCount?: number;
      promptCharCount?: number;
      responseCharCount?: number;
      cardCount?: number;
      questionCount?: number;
      warningCount?: number;
    },
  ): ProjectBoardSynthesisRun {
    const updated = this.tryUpdateProjectBoardSynthesisRunProgress(runId, input);
    if (!updated) throw new Error(`Project board synthesis run not found: ${runId}`);
    return updated;
  }

  tryUpdateProjectBoardSynthesisRunProgress(
    runId: string,
    input: {
      stage?: ProjectBoardSynthesisRunStage;
      model?: string;
      sourceCount?: number;
      includedSourceCount?: number;
      sourceCharCount?: number;
      promptCharCount?: number;
      responseCharCount?: number;
      cardCount?: number;
      questionCount?: number;
      warningCount?: number;
    },
  ): ProjectBoardSynthesisRun | undefined {
    const row = this.requireDb().prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunRow
      | undefined;
    if (!row) return undefined;
    if (row.status !== "running" && row.status !== "pause_requested") return this.mapProjectBoardSynthesisRun(row);
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `UPDATE project_board_synthesis_runs
         SET stage = COALESCE(?, stage),
             model = COALESCE(?, model),
             source_count = COALESCE(?, source_count),
             included_source_count = COALESCE(?, included_source_count),
             source_char_count = COALESCE(?, source_char_count),
             prompt_char_count = COALESCE(?, prompt_char_count),
             response_char_count = COALESCE(?, response_char_count),
             card_count = COALESCE(?, card_count),
             question_count = COALESCE(?, question_count),
             warning_count = COALESCE(?, warning_count),
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.stage ?? null,
        input.model?.trim() || null,
        typeof input.sourceCount === "number" && Number.isFinite(input.sourceCount) ? Math.max(0, Math.round(input.sourceCount)) : null,
        typeof input.includedSourceCount === "number" && Number.isFinite(input.includedSourceCount)
          ? Math.max(0, Math.round(input.includedSourceCount))
          : null,
        typeof input.sourceCharCount === "number" && Number.isFinite(input.sourceCharCount) ? Math.max(0, Math.round(input.sourceCharCount)) : null,
        typeof input.promptCharCount === "number" && Number.isFinite(input.promptCharCount) ? Math.max(0, Math.round(input.promptCharCount)) : null,
        typeof input.responseCharCount === "number" && Number.isFinite(input.responseCharCount) ? Math.max(0, Math.round(input.responseCharCount)) : null,
        typeof input.cardCount === "number" && Number.isFinite(input.cardCount) ? Math.max(0, Math.round(input.cardCount)) : null,
        typeof input.questionCount === "number" && Number.isFinite(input.questionCount) ? Math.max(0, Math.round(input.questionCount)) : null,
        typeof input.warningCount === "number" && Number.isFinite(input.warningCount) ? Math.max(0, Math.round(input.warningCount)) : null,
        now,
        runId,
      );
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, row.board_id);
    const updated = this.requireDb().prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunRow
      | undefined;
    return updated ? this.mapProjectBoardSynthesisRun(updated) : undefined;
  }

  recordProjectBoardSynthesisRunProgressiveRecords(
    runId: string,
    records: ProjectBoardSynthesisRunProgressiveRecord[],
    input: { title?: string; summary?: string } = {},
  ): ProjectBoardSynthesisRun {
    const row = this.requireDb().prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunRow
      | undefined;
    if (!row) throw new Error(`Project board synthesis run not found: ${runId}`);
    const sanitizedRecords = records.flatMap(normalizeProjectBoardSynthesisRunProgressiveRecord);
    if (sanitizedRecords.length === 0) return this.mapProjectBoardSynthesisRun(row);
    const existingRecords = parseJsonArray<ProjectBoardSynthesisRunProgressiveRecord>(row.progressive_records_json ?? "[]").flatMap(
      normalizeProjectBoardSynthesisRunProgressiveRecord,
    );
    const nextRecords = dedupeProjectBoardSynthesisRunProgressiveRecords([...existingRecords, ...sanitizedRecords]);
    const summary = summarizeProjectBoardSynthesisRunProgressiveRecords(nextRecords);
    const now = new Date().toISOString();
    const eventSummary =
      input.summary?.trim() ||
      [
        summary.candidateCardCount
          ? `${summary.candidateCardCount} candidate card${summary.candidateCardCount === 1 ? "" : "s"}`
          : "",
        summary.questionCount ? `${summary.questionCount} question${summary.questionCount === 1 ? "" : "s"}` : "",
        summary.sourceCoverageCount
          ? `${summary.sourceCoverageCount} source coverage record${summary.sourceCoverageCount === 1 ? "" : "s"}`
          : "",
        summary.dependencyEdgeCount ? `${summary.dependencyEdgeCount} dependency edge${summary.dependencyEdgeCount === 1 ? "" : "s"}` : "",
        summary.warningCount ? `${summary.warningCount} warning${summary.warningCount === 1 ? "" : "s"}` : "",
      ]
        .filter(Boolean)
        .join(", ");
    const events = [
      ...parseJsonArray<ProjectBoardSynthesisRunEvent>(row.events_json),
      {
        stage: "schema_validation" as const,
        title: (input.title?.trim() || "Persisted progressive planning records").slice(0, 180),
        summary: (eventSummary || `Persisted ${summary.recordCount} progressive planning record${summary.recordCount === 1 ? "" : "s"}.`).slice(
          0,
          1000,
        ),
        metadata: { progressiveSummary: summary },
        createdAt: now,
      },
    ];
    this.requireDb()
      .prepare(
        `UPDATE project_board_synthesis_runs
         SET stage = ?,
             card_count = COALESCE(?, card_count),
             question_count = COALESCE(?, question_count),
             warning_count = COALESCE(?, warning_count),
             events_json = ?,
             progressive_records_json = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        "schema_validation",
        summary.candidateCardCount > 0 ? summary.candidateCardCount : null,
        summary.questionCount > 0 ? summary.questionCount : null,
        summary.warningCount > 0 ? summary.warningCount : null,
        JSON.stringify(events),
        JSON.stringify(nextRecords),
        now,
        runId,
      );
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, row.board_id);
    const updated = this.requireDb().prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunRow
      | undefined;
    if (!updated) throw new Error(`Project board synthesis run not found after progressive update: ${runId}`);
    return this.mapProjectBoardSynthesisRun(updated);
  }

  recordProjectBoardPlanningSnapshotForRun(runId: string, kind: ProjectBoardPlanningSnapshotKind = "manual"): ProjectBoardPlanningSnapshot | undefined {
    return this.appendProjectBoardPlanningSnapshotForRun(runId, kind);
  }

  private appendProjectBoardPlanningSnapshotForRun(runId: string, kind: ProjectBoardPlanningSnapshotKind): ProjectBoardPlanningSnapshot | undefined {
    const row = this.requireDb().prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunRow
      | undefined;
    if (!row) throw new Error(`Project board synthesis run not found: ${runId}`);
    const board = this.getProjectBoard(row.board_id);
    if (!board) throw new Error(`Project board not found for synthesis run: ${row.board_id}`);
    const cards = board.cards
      .filter((card) => card.sourceKind === "board_synthesis" && card.status !== "archived")
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.id.localeCompare(right.id));
    if (cards.length === 0) return undefined;
    const sourceHashes: ProjectBoardPlanningSnapshotSourceHash[] = board.sources
      .map((source) => ({
        sourceId: source.id,
        kind: source.kind,
        ...(source.sourceKey ? { sourceKey: source.sourceKey } : {}),
        ...(source.path ? { path: source.path } : {}),
        ...(source.contentHash ? { contentHash: source.contentHash } : {}),
        ...(source.changeState ? { changeState: source.changeState } : {}),
        ...(typeof source.includeInSynthesis === "boolean" ? { includeInSynthesis: source.includeInSynthesis } : {}),
      }))
      .sort(
        (left, right) =>
          (left.path ?? "").localeCompare(right.path ?? "") ||
          (left.sourceKey ?? "").localeCompare(right.sourceKey ?? "") ||
          left.sourceId.localeCompare(right.sourceId),
      );
    const snapshotCards: ProjectBoardPlanningSnapshotCard[] = cards.map((card) => {
      const basis = {
        cardId: card.id,
        sourceId: card.sourceId,
        sourceKind: card.sourceKind,
        title: card.title,
        description: card.description,
        status: card.status,
        candidateStatus: card.candidateStatus,
        labels: card.labels,
        blockedBy: card.blockedBy,
        acceptanceCriteria: card.acceptanceCriteria,
        testPlan: card.testPlan,
        sourceRefs: card.sourceRefs ?? [],
        clarificationQuestionCount: card.clarificationQuestions?.length ?? 0,
        orchestrationTaskId: card.orchestrationTaskId ?? null,
      };
      return {
        cardId: card.id,
        sourceId: card.sourceId,
        sourceKind: card.sourceKind,
        title: card.title,
        status: card.status,
        candidateStatus: card.candidateStatus,
        sourceRefs: card.sourceRefs ?? [],
        blockedBy: card.blockedBy,
        renderFingerprint: projectBoardPlanningStableHash("planning-card", basis),
        ...(card.orchestrationTaskId ? { orchestrationTaskId: card.orchestrationTaskId } : {}),
      };
    });
    const now = new Date().toISOString();
    const runEvents = parseJsonArray<ProjectBoardSynthesisRunEvent>(row.events_json);
    const planningScope = projectBoardPlanningScopeFromRunEvents(runEvents);
    const snapshotBasis = {
      boardId: row.board_id,
      runId,
      planningStatus: row.status,
      planningStage: row.stage,
      sourceHashes,
      cards: snapshotCards,
      scopeContract: planningScope.scopeContract,
      planningDepth: planningScope.planningDepth,
    };
    const snapshot: ProjectBoardPlanningSnapshot = {
      id: randomUUID(),
      boardId: row.board_id,
      runId,
      kind,
      planningStatus: row.status,
      planningStage: row.stage,
      createdAt: now,
      cardCount: snapshotCards.length,
      readyCandidateCount: cards.filter((card) => card.status === "draft" && !card.orchestrationTaskId && card.candidateStatus === "ready_to_create").length,
      ticketizedCount: cards.filter((card) => Boolean(card.orchestrationTaskId)).length,
      sourceHashes,
      ...(planningScope.scopeContract ? { scopeContract: planningScope.scopeContract } : {}),
      ...(planningScope.planningDepth ? { planningDepth: planningScope.planningDepth } : {}),
      cardIds: snapshotCards.map((card) => card.cardId),
      cards: snapshotCards,
      renderFingerprint: projectBoardPlanningStableHash("planning-snapshot", snapshotBasis),
    };
    const existing = parseJsonArray<ProjectBoardPlanningSnapshot>(row.planning_snapshots_json ?? "[]").flatMap((entry) =>
      normalizeProjectBoardPlanningSnapshot(entry, row.updated_at),
    );
    const latest = existing.at(-1);
    if (
      latest &&
      latest.kind === snapshot.kind &&
      latest.planningStatus === snapshot.planningStatus &&
      latest.renderFingerprint === snapshot.renderFingerprint
    ) {
      return latest;
    }
    const next = [...existing, snapshot].slice(-50);
    this.requireDb()
      .prepare("UPDATE project_board_synthesis_runs SET planning_snapshots_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(next), now, runId);
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, row.board_id);
    return snapshot;
  }

  private latestStableProjectBoardPlanningSnapshot(boardId: string): { runId: string; snapshot: ProjectBoardPlanningSnapshot } | undefined {
    const rows = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_synthesis_runs
         WHERE board_id = ? AND status IN ('paused', 'succeeded')
         ORDER BY updated_at DESC, started_at DESC, rowid DESC
         LIMIT 20`,
      )
      .all(boardId) as ProjectBoardSynthesisRunRow[];
    for (const row of rows) {
      const snapshots = parseJsonArray<ProjectBoardPlanningSnapshot>(row.planning_snapshots_json ?? "[]").flatMap((entry) =>
        normalizeProjectBoardPlanningSnapshot(entry, row.updated_at),
      );
      const stable = [...snapshots]
        .reverse()
        .find((snapshot) => snapshot.planningStatus === "paused" || snapshot.planningStatus === "succeeded");
      if (stable) return { runId: row.id, snapshot: stable };
    }
    return undefined;
  }

  answerProjectBoardSynthesisProposalQuestion(input: {
    proposalId: string;
    questionIndex: number;
    answer: string;
  }): ProjectBoardSynthesisProposal {
    const row = this.requireDb()
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(input.proposalId) as ProjectBoardSynthesisProposalRow | undefined;
    if (!row) throw new Error(`Project board synthesis proposal not found: ${input.proposalId}`);
    if (row.status !== "pending") throw new Error(`Project board synthesis proposal is ${row.status}, not pending.`);
    const proposal = this.mapProjectBoardSynthesisProposal(row);
    if (!Number.isInteger(input.questionIndex) || input.questionIndex < 0 || input.questionIndex >= proposal.questions.length) {
      throw new Error(`Project board synthesis proposal question not found: ${input.questionIndex}`);
    }
    const answer = input.answer.trim();
    if (!answer) throw new Error("Project board synthesis proposal answer cannot be empty.");
    const now = new Date().toISOString();
    const question = proposal.questions[input.questionIndex];
    const answers = [
      ...proposal.answers.filter((candidate) => candidate.questionIndex !== input.questionIndex),
      { questionIndex: input.questionIndex, question, answer: answer.slice(0, 4000), answeredAt: now },
    ].sort((left, right) => left.questionIndex - right.questionIndex);

    this.requireDb()
      .prepare("UPDATE project_board_synthesis_proposals SET answers_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(answers), now, input.proposalId);
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, proposal.boardId);
    this.appendProjectBoardEvent({
      boardId: proposal.boardId,
      kind: "synthesis_proposal_answered",
      title: "Pi proposal question answered",
      summary: question.slice(0, 1000),
      entityKind: "project_board_synthesis_proposal",
      entityId: proposal.id,
      metadata: { proposalId: proposal.id, questionIndex: input.questionIndex, question, answer: answer.slice(0, 1000) },
      createdAt: now,
    });
    const updated = this.requireDb()
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(input.proposalId) as ProjectBoardSynthesisProposalRow | undefined;
    if (!updated) throw new Error(`Project board synthesis proposal not found after answer: ${input.proposalId}`);
    return this.mapProjectBoardSynthesisProposal(updated);
  }

  reviewProjectBoardSynthesisProposalCard(input: {
    proposalId: string;
    sourceId: string;
    reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus;
    reason?: string;
    mergeTargetCardId?: string;
  }): ProjectBoardSynthesisProposal {
    const row = this.requireDb()
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(input.proposalId) as ProjectBoardSynthesisProposalRow | undefined;
    if (!row) throw new Error(`Project board synthesis proposal not found: ${input.proposalId}`);
    if (row.status !== "pending") throw new Error(`Project board synthesis proposal is ${row.status}, not pending.`);
    if (!projectBoardSynthesisProposalCardReviewStatus(input.reviewStatus)) {
      throw new Error(`Unsupported proposal card review status: ${input.reviewStatus}`);
    }
    const proposal = this.mapProjectBoardSynthesisProposal(row);
    const index = proposal.cards.findIndex((card) => card.sourceId === input.sourceId);
    if (index < 0) throw new Error(`Project board synthesis proposal card not found: ${input.sourceId}`);

    const mergeTargetCardId = input.reviewStatus === "merged" ? input.mergeTargetCardId?.trim() : undefined;
    if (input.reviewStatus === "merged") {
      if (!mergeTargetCardId) throw new Error("Merged proposal cards require a target draft card.");
      const target = this.requireDb()
        .prepare("SELECT * FROM project_board_cards WHERE id = ?")
        .get(mergeTargetCardId) as ProjectBoardCardRow | undefined;
      if (!target || target.board_id !== proposal.boardId || target.status !== "draft" || target.orchestration_task_id) {
        throw new Error("Merged proposal cards require an unlinked draft card on the same board.");
      }
    }

    const now = new Date().toISOString();
    const reason = input.reason?.trim().slice(0, 1000) || undefined;
    const cards = proposal.cards.map((card, cardIndex) =>
      cardIndex === index
        ? {
            ...card,
            reviewStatus: input.reviewStatus,
            reviewReason: reason,
            mergeTargetCardId,
            reviewedAt: now,
          }
        : card,
    );
    this.requireDb()
      .prepare("UPDATE project_board_synthesis_proposals SET cards_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(cards), now, input.proposalId);
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, proposal.boardId);
    this.appendProjectBoardEvent({
      boardId: proposal.boardId,
      kind: "synthesis_proposal_card_reviewed",
      title: "Pi proposal card reviewed",
      summary: `${proposal.cards[index].title} marked ${input.reviewStatus}.`,
      entityKind: "project_board_synthesis_proposal",
      entityId: proposal.id,
      metadata: { proposalId: proposal.id, sourceId: input.sourceId, reviewStatus: input.reviewStatus, reason, mergeTargetCardId },
      createdAt: now,
    });
    const updated = this.requireDb()
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(input.proposalId) as ProjectBoardSynthesisProposalRow | undefined;
    if (!updated) throw new Error(`Project board synthesis proposal not found after card review: ${input.proposalId}`);
    return this.mapProjectBoardSynthesisProposal(updated);
  }

  applyProjectBoardSynthesisProposal(input: { proposalId: string; replaceExistingDraft?: boolean }): ProjectBoardSummary {
    const row = this.requireDb()
      .prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?")
      .get(input.proposalId) as ProjectBoardSynthesisProposalRow | undefined;
    if (!row) throw new Error(`Project board synthesis proposal not found: ${input.proposalId}`);
    if (row.status !== "pending") throw new Error(`Project board synthesis proposal is ${row.status}, not pending.`);
    const proposal = this.mapProjectBoardSynthesisProposal(row);
    if (proposal.reviewReport && proposal.cards.length === 0) {
      throw new Error("Lightweight PM review reports do not apply cards. Generate a draft board from the recommendation first.");
    }
    const pendingCards = proposal.cards.filter((card) => card.reviewStatus === "pending");
    if (pendingCards.length > 0) {
      throw new Error("Review every proposal card before applying accepted cards.");
    }
    const acceptedCards = proposal.cards.filter((card) => card.reviewStatus === "accepted");
    const mergedCards = proposal.cards.filter((card) => card.reviewStatus === "merged" && card.mergeTargetCardId);
    if (acceptedCards.length + mergedCards.length === 0) {
      throw new Error("Accept or merge at least one proposal card before applying.");
    }
    for (const card of mergedCards) {
      const target = this.requireDb()
        .prepare("SELECT id FROM project_board_cards WHERE id = ? AND board_id = ? AND status = 'draft' AND orchestration_task_id IS NULL")
        .get(card.mergeTargetCardId, proposal.boardId) as { id: string } | undefined;
      if (!target) throw new Error(`Merge target card is no longer an unlinked draft card: ${card.mergeTargetCardId}`);
    }
    const synthesis: ProjectBoardSynthesisDraft = {
      summary: proposal.summary,
      goal: proposal.goal,
      currentState: proposal.currentState,
      targetUser: proposal.targetUser,
      qualityBar: proposal.qualityBar,
      assumptions: proposal.assumptions,
      questions: proposal.questions,
      sourceNotes: proposal.sourceNotes,
      cards: acceptedCards.map((card) => ({
        sourceId: card.sourceId,
        title: card.title,
        description: card.description,
        candidateStatus: card.candidateStatus,
        priority: card.priority,
        phase: card.phase,
        labels: card.labels,
        blockedBy: card.blockedBy,
        acceptanceCriteria: card.acceptanceCriteria,
        testPlan: card.testPlan,
        sourceRefs: card.sourceRefs,
        clarificationQuestions: card.clarificationQuestions ?? [],
        clarificationSuggestions: card.clarificationSuggestions ?? [],
        clarificationDecisions: card.clarificationDecisions ?? [],
        objectiveProvenance: card.objectiveProvenance,
        uiMockRole: card.uiMockRole,
        requiresUiMockApproval: card.requiresUiMockApproval,
      })),
    };

    // Cover planner-plan drafts here too: the board-build path already demotes the
    // originating durable-plan card to evidence once synthesis cards exist, but this
    // PM-review apply path forgot to, leaving a whole-app plan card sitting
    // ready_to_create next to the step cards, where bulk ticketization would happily
    // dispatch it as duplicate work.
    this.applyProjectBoardSynthesis(proposal.boardId, synthesis, {
      replaceExistingDraft: false,
      coverPlannerPlanDrafts: true,
    });
    const now = new Date().toISOString();
    const updateMergedCard = this.requireDb().prepare(
      `UPDATE project_board_cards
       SET title = ?,
           description = ?,
           candidate_status = ?,
           priority = ?,
           phase = ?,
           labels_json = ?,
           blocked_by_json = ?,
           acceptance_criteria_json = ?,
           test_plan_json = ?,
           source_refs_json = ?,
           clarification_questions_json = ?,
           clarification_suggestions_json = ?,
           clarification_decisions_json = ?,
           objective_provenance_json = COALESCE(?, objective_provenance_json),
           ui_mock_role = ?,
           requires_ui_mock_approval = ?,
           updated_at = ?
       WHERE id = ? AND board_id = ? AND status = 'draft' AND orchestration_task_id IS NULL`,
    );
    const mergedCardIds: string[] = [];
    for (const card of mergedCards) {
      const clarification = normalizeProjectBoardSynthesisClarificationFields({
        clarificationQuestions: card.clarificationQuestions,
        clarificationSuggestions: card.clarificationSuggestions,
        clarificationDecisions: card.clarificationDecisions,
        createdAt: now,
        updatedAt: now,
      });
      const result = updateMergedCard.run(
        card.title.trim().slice(0, 180),
        card.description.trim().slice(0, 4000),
        card.candidateStatus,
        typeof card.priority === "number" ? Math.max(1, Math.round(card.priority)) : null,
        card.phase?.trim().slice(0, 120) || null,
        JSON.stringify(normalizeTaskLabels(card.labels)),
        JSON.stringify(normalizeTaskReferences(card.blockedBy)),
        JSON.stringify(normalizeCardTextList(card.acceptanceCriteria, 30)),
        JSON.stringify(normalizeProjectBoardCardTestPlan(card.testPlan)),
        JSON.stringify(normalizeCardTextList(card.sourceRefs, 20)),
        JSON.stringify(clarification.clarificationQuestions),
        JSON.stringify(clarification.clarificationSuggestions),
        JSON.stringify(clarification.clarificationDecisions),
        objectiveProvenanceJson(card.objectiveProvenance),
        normalizeProjectBoardUiMockRole(card.uiMockRole) ?? null,
        card.requiresUiMockApproval ? 1 : 0,
        now,
        card.mergeTargetCardId,
        proposal.boardId,
      );
      if (result.changes > 0 && card.mergeTargetCardId) mergedCardIds.push(card.mergeTargetCardId);
    }
    this.requireDb()
      .prepare("UPDATE project_board_synthesis_proposals SET status = 'applied', updated_at = ?, applied_at = ? WHERE id = ?")
      .run(now, now, input.proposalId);
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, proposal.boardId);
    const appliedPlanningSnapshot = this.appendProjectBoardPlanningSnapshotForProposal(proposal.boardId, proposal.id);
    this.appendProjectBoardEvent({
      boardId: proposal.boardId,
      kind: "synthesis_proposal_applied",
      title: "Pi proposal accepted cards applied",
      summary: `${acceptedCards.length} accepted card${acceptedCards.length === 1 ? "" : "s"} applied and ${mergedCardIds.length} proposal card${mergedCardIds.length === 1 ? "" : "s"} merged.`,
      entityKind: "project_board_synthesis_proposal",
      entityId: proposal.id,
      metadata: {
        proposalId: proposal.id,
        acceptedSourceIds: acceptedCards.map((card) => card.sourceId),
        mergedSourceIds: mergedCards.map((card) => card.sourceId),
        mergedCardIds,
        deferredSourceIds: proposal.cards.filter((card) => card.reviewStatus === "deferred").map((card) => card.sourceId),
        rejectedSourceIds: proposal.cards.filter((card) => card.reviewStatus === "rejected").map((card) => card.sourceId),
        ...(appliedPlanningSnapshot
          ? {
              planningSnapshotId: appliedPlanningSnapshot.snapshot.id,
              planningSnapshotRunId: appliedPlanningSnapshot.runId,
              planningSnapshotKind: appliedPlanningSnapshot.snapshot.kind,
              planningSnapshotFingerprint: appliedPlanningSnapshot.snapshot.renderFingerprint,
              planningSnapshotCardIds: appliedPlanningSnapshot.snapshot.cardIds,
            }
          : {}),
      },
      createdAt: now,
    });
    const boardRow = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(proposal.boardId) as ProjectBoardRow | undefined;
    if (!boardRow) throw new Error(`Project board not found after proposal apply: ${proposal.boardId}`);
    return this.mapProjectBoard(boardRow);
  }

  updateProjectBoardStatus(boardId: string, status: ProjectBoardStatus): ProjectBoardSummary {
    const current = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardRow | undefined;
    if (!current) throw new Error(`Project board not found: ${boardId}`);
    const now = new Date().toISOString();
    const result = this.requireDb()
      .prepare("UPDATE project_boards SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, now, boardId);
    if (result.changes === 0) throw new Error(`Project board not found: ${boardId}`);
    if (current.status !== status) {
      this.appendProjectBoardEvent({
        boardId,
        kind: "status_changed",
        title: "Board status changed",
        summary: `Board moved from ${current.status} to ${status}.`,
        entityKind: "project_board",
        entityId: boardId,
        metadata: { from: current.status, to: status },
        createdAt: now,
      });
    }
    const row = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardRow | undefined;
    if (!row) throw new Error(`Project board not found: ${boardId}`);
    return this.mapProjectBoard(row);
  }

  resetProjectBoard(boardId: string): void {
    const board = this.requireDb().prepare("SELECT id FROM project_boards WHERE id = ?").get(boardId) as { id: string } | undefined;
    if (!board) throw new Error(`Project board not found: ${boardId}`);

    const transaction = this.requireDb().transaction(() => {
      for (const table of [
        "project_board_synthesis_runs",
        "project_board_synthesis_proposals",
        "project_board_execution_artifacts",
        "project_board_events",
        "project_board_questions",
        "project_board_sources",
        "project_board_cards",
        "project_board_charters",
      ]) {
        this.requireDb().prepare(`DELETE FROM ${table} WHERE board_id = ?`).run(boardId);
      }
      const result = this.requireDb().prepare("DELETE FROM project_boards WHERE id = ?").run(boardId);
      if (result.changes === 0) throw new Error(`Project board not found: ${boardId}`);
    });
    transaction();
  }

  startProjectBoardRevision(input: { boardId: string; reason?: string }): ProjectBoardSummary {
    const board = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(input.boardId) as ProjectBoardRow | undefined;
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    if (board.status === "archived") throw new Error("Archived project boards cannot be revised.");
    const currentCharter = board.charter_id
      ? (this.requireDb().prepare("SELECT * FROM project_board_charters WHERE id = ?").get(board.charter_id) as ProjectBoardCharterRow | undefined)
      : undefined;
    if (board.status === "draft" && currentCharter?.status === "draft") {
      return this.mapProjectBoard(board);
    }
    this.ensureProjectBoardQuestions(board.id);
    const latest = this.requireDb()
      .prepare("SELECT MAX(version) AS version FROM project_board_charters WHERE board_id = ?")
      .get(board.id) as { version: number | null } | undefined;
    const version = (latest?.version ?? 0) + 1;
    const now = new Date().toISOString();
    const charterId = randomUUID();
    const reason = input.reason?.trim() || "Board revision started for major project changes.";
    const markdown = [
      `# ${board.title}`,
      "",
      `## Revision ${version}`,
      "",
      reason,
      "",
      currentCharter?.markdown || "Answer the kickoff interview to update the project charter.",
    ].join("\n");
    const transaction = this.requireDb().transaction(() => {
      this.requireDb()
        .prepare("UPDATE project_board_charters SET status = 'superseded', updated_at = ? WHERE board_id = ? AND status IN ('active', 'draft')")
        .run(now, board.id);
      this.requireDb()
        .prepare(
          `INSERT INTO project_board_charters
          (id, board_id, version, status, goal, current_state, target_user, non_goals_json, quality_bar,
           test_policy_json, decision_policy_json, dependency_policy_json, budget_policy_json, source_policy_json,
           markdown, project_summary_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          charterId,
          board.id,
          version,
          "draft",
          currentCharter?.goal ?? "",
          currentCharter?.current_state ?? "",
          currentCharter?.target_user ?? "",
          currentCharter?.non_goals_json ?? JSON.stringify([]),
          currentCharter?.quality_bar ?? "",
          currentCharter?.test_policy_json ??
            JSON.stringify({ unit: true, integration: true, visual: true, liveSmoke: "recommended", proofScopeWarningPolicy: "advisory" }),
          currentCharter?.decision_policy_json ?? JSON.stringify({ default: "ask_when_ambiguous", fallback: "document_assumption" }),
          currentCharter?.dependency_policy_json ?? JSON.stringify({ ordering: "blockers_first", parallelism: "safe_independent_cards" }),
          currentCharter?.budget_policy_json ?? JSON.stringify({ maxPassesPerCard: 6, maxRuntimeMsPerCard: 1_200_000, pauseOnTerminalBlocker: true }),
          currentCharter?.source_policy_json ?? JSON.stringify({ includeThreads: true, includeMarkdown: true, requireUserApproval: true }),
          markdown,
          null,
          now,
          now,
        );
      this.requireDb()
        .prepare("UPDATE project_boards SET status = 'draft', charter_id = ?, summary = ?, updated_at = ? WHERE id = ?")
        .run(charterId, reason.slice(0, 500), now, board.id);
      this.appendProjectBoardEvent({
        boardId: board.id,
        kind: "board_revision_started",
        title: "Board revision started",
        summary: reason.slice(0, 500),
        entityKind: "project_board_charter",
        entityId: charterId,
        metadata: { charterId, previousCharterId: currentCharter?.id, version },
        createdAt: now,
      });
    });
    transaction();
    const row = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(board.id) as ProjectBoardRow | undefined;
    if (!row) throw new Error(`Project board not found after revision: ${board.id}`);
    return this.mapProjectBoard(row);
  }

  cancelProjectBoardRevision(boardId: string): ProjectBoardSummary {
    const board = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardRow | undefined;
    if (!board) throw new Error(`Project board not found: ${boardId}`);
    if (board.status !== "draft") return this.mapProjectBoard(board);
    const draftCharter = board.charter_id
      ? (this.requireDb().prepare("SELECT * FROM project_board_charters WHERE id = ?").get(board.charter_id) as ProjectBoardCharterRow | undefined)
      : undefined;
    if (!draftCharter || draftCharter.version <= 1) return this.mapProjectBoard(board);
    const revisionEvent = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_events
         WHERE board_id = ? AND event_kind = 'board_revision_started' AND entity_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(board.id, draftCharter.id) as ProjectBoardEventRow | undefined;
    const previousCharterId = revisionEvent
      ? parseJsonObject<{ previousCharterId?: string }>(revisionEvent.metadata_json, {}).previousCharterId
      : undefined;
    const previousCharter = previousCharterId
      ? (this.requireDb().prepare("SELECT * FROM project_board_charters WHERE id = ?").get(previousCharterId) as ProjectBoardCharterRow | undefined)
      : (this.requireDb()
          .prepare("SELECT * FROM project_board_charters WHERE board_id = ? AND id != ? ORDER BY version DESC, updated_at DESC")
          .get(board.id, draftCharter.id) as ProjectBoardCharterRow | undefined);
    if (!previousCharter) return this.mapProjectBoard(board);
    const now = new Date().toISOString();
    const transaction = this.requireDb().transaction(() => {
      this.requireDb().prepare("UPDATE project_board_charters SET status = 'superseded', updated_at = ? WHERE id = ?").run(now, draftCharter.id);
      this.requireDb().prepare("UPDATE project_board_charters SET status = 'active', updated_at = ? WHERE id = ?").run(now, previousCharter.id);
      this.requireDb()
        .prepare("UPDATE project_boards SET status = 'active', charter_id = ?, summary = ?, updated_at = ? WHERE id = ?")
        .run(previousCharter.id, previousCharter.goal || board.summary, now, board.id);
      this.appendProjectBoardEvent({
        boardId: board.id,
        kind: "board_revision_started",
        title: "Board revision canceled",
        summary: "Restored the previous active project charter.",
        entityKind: "project_board_charter",
        entityId: previousCharter.id,
        metadata: { restoredCharterId: previousCharter.id, canceledCharterId: draftCharter.id },
        createdAt: now,
      });
    });
    transaction();
    const row = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(board.id) as ProjectBoardRow | undefined;
    if (!row) throw new Error(`Project board not found after canceling revision: ${board.id}`);
    return this.mapProjectBoard(row);
  }

  promotePlannerPlanToBoard(artifactId: string): ProjectBoardCard {
    const artifact = this.getPlannerPlanArtifact(artifactId);
    if (artifact.status !== "ready") throw new Error("Only ready planner plans can be added to the project board.");
    let board = this.getActiveProjectBoard(artifact.threadId);
    if (artifact.durableArtifactPath) {
      const linkedSource = this.promotePlannerDurableArtifactToBoardSource(artifact.id);
      if (linkedSource) board = this.getProjectBoard(linkedSource.boardId) ?? board;
    }
    board ??= this.createProjectBoard({
      title: `${artifact.title.trim() || "Planner plan"} board`,
      summary: artifact.summary.trim() || "Project board created from a durable planner plan.",
      sourceThreadId: artifact.threadId,
    });
    const draftCards = plannerPlanDraftCards(artifact);

    const existing = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE board_id = ?
           AND source_kind = 'planner_plan'
           AND (source_id = ? OR source_id LIKE ?)
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all(board.id, artifact.id, `${artifact.id}#step:%`) as ProjectBoardCardRow[];
    const replaceExistingPromotion =
      existing.length > 0 &&
      draftCards.length === 1 &&
      existing.some((row) => row.source_id.includes("#step:")) &&
      existing.every(
        (row) =>
          row.status === "draft" &&
          row.source_kind === "planner_plan" &&
          !row.orchestration_task_id &&
          !["evidence", "duplicate", "rejected"].includes(row.candidate_status) &&
          !row.user_touched_at &&
          (!row.user_touched_fields_json || row.user_touched_fields_json === "[]"),
      );
    if (existing.length > 0 && !replaceExistingPromotion) return this.mapProjectBoardCard(existing[0], this.listOrchestrationTasks());

    const now = new Date().toISOString();
    const durablePlanContent = artifact.durableArtifactPath
      ? readManagedBoardPlanContent(this.getProjectArtifactWorkspacePath(), artifact.durableArtifactPath) ?? plannerPlanArtifactSourceContent(artifact)
      : plannerPlanArtifactSourceContent(artifact);
    const durablePlanContentHash = hashProjectBoardSourceContent(durablePlanContent);
    const candidateStatus = plannerPlanCandidateStatus(artifact);
    const clarificationQuestions = plannerPlanClarificationQuestions(artifact);
    const clarificationDecisions = plannerPlanClarificationDecisions(artifact, now);
    const replacedCardIds = replaceExistingPromotion ? existing.map((row) => row.id) : [];
    const promotedPlanTitle = artifact.title.trim() || "Planner plan";
    const promotionTitle = replacedCardIds.length > 0 ? "Plan draft refreshed" : "Plan added to board";
    const promotionSummary =
      replacedCardIds.length > 0
        ? `${promotedPlanTitle} replaced ${replacedCardIds.length} untouched step candidate${replacedCardIds.length === 1 ? "" : "s"} with a compact draft inbox card.`
        : draftCards.length === 1
          ? `${promotedPlanTitle} entered the draft inbox as a candidate card.`
          : `${promotedPlanTitle} entered the draft inbox as ${draftCards.length} linked candidate cards.`;
    const createdIds: string[] = [];
    const transaction = this.requireDb().transaction(() => {
      if (replacedCardIds.length > 0) {
        const deleteCard = this.requireDb().prepare("DELETE FROM project_board_cards WHERE id = ? AND board_id = ?");
        for (const cardId of replacedCardIds) deleteCard.run(cardId, board.id);
      }
      const insert = this.requireDb().prepare(
        `INSERT INTO project_board_cards
        (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
         acceptance_criteria_json, test_plan_json, clarification_questions_json, clarification_decisions_json, source_kind, source_id, source_thread_id,
         source_message_id, orchestration_task_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      for (const draft of draftCards) {
        const id = randomUUID();
        createdIds.push(id);
        insert.run(
          id,
          board.id,
          draft.title,
          draft.description,
          "draft",
          candidateStatus,
          null,
          null,
          JSON.stringify(normalizeTaskLabels(draft.labels)),
          JSON.stringify(draft.blockedBy),
          JSON.stringify(normalizeCardTextList(draft.acceptanceCriteria, 30)),
          JSON.stringify(normalizeProjectBoardCardTestPlan(draft.testPlan)),
          JSON.stringify(clarificationQuestions),
          JSON.stringify(clarificationDecisions),
          "planner_plan",
          draft.sourceId,
          artifact.threadId,
          artifact.sourceMessageId,
          null,
          now,
          now,
        );
      }

      this.appendProjectBoardEvent({
        boardId: board.id,
        kind: "plan_promoted",
        title: promotionTitle,
        summary: promotionSummary,
        entityKind: "project_board_card",
        entityId: createdIds[0],
        metadata: {
          artifactId: artifact.id,
          threadId: artifact.threadId,
          sourceMessageId: artifact.sourceMessageId,
          durablePlanPath: artifact.durableArtifactPath,
          durablePlanContentHash,
          durablePlanGeneratedAt: artifact.durableArtifactGeneratedAt,
          candidateStatus,
          cardIds: createdIds,
          replacedCardIds,
          cardCount: createdIds.length,
          decomposition: draftCards.length === 1 ? "single_card" : "plan_steps",
        },
        createdAt: now,
      });
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, board.id);
    });
    transaction();
    return this.getProjectBoardCard(createdIds[0]);
  }

  getProjectBoardCard(cardId: string): ProjectBoardCard {
    const row = this.requireDb().prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as
      | ProjectBoardCardRow
      | undefined;
    if (!row) throw new Error(`Project board card not found: ${cardId}`);
    return this.mapProjectBoardCard(row, this.listOrchestrationTasks());
  }

  private tryGetProjectBoardCard(cardId: string): ProjectBoardCard | undefined {
    const row = this.requireDb().prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as
      | ProjectBoardCardRow
      | undefined;
    return row ? this.mapProjectBoardCard(row, this.listOrchestrationTasks()) : undefined;
  }

  getProjectBoardCardForOrchestrationTask(taskId: string): ProjectBoardCard | undefined {
    const row = this.requireDb()
      .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1")
      .get(taskId) as ProjectBoardCardRow | undefined;
    return row ? this.mapProjectBoardCard(row, this.listOrchestrationTasks()) : undefined;
  }

  refreshProjectBoardTaskDescriptionForTask(taskId: string): OrchestrationTask | undefined {
    const card = this.getProjectBoardCardForOrchestrationTask(taskId);
    if (!card) return undefined;
    const task = this.getOrchestrationTask(taskId);
    const description = this.projectBoardCardTaskDescription(card);
    if (task.description === description) return task;
    this.requireDb()
      .prepare("UPDATE orchestration_tasks SET description = ?, updated_at = ? WHERE id = ?")
      .run(description, new Date().toISOString(), task.id);
    return this.getOrchestrationTask(task.id);
  }

  getProjectBoardCardForExecutionThread(threadId: string): ProjectBoardCard | undefined {
    const row = this.requireDb()
      .prepare("SELECT * FROM project_board_cards WHERE execution_thread_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1")
      .get(threadId) as ProjectBoardCardRow | undefined;
    return row ? this.mapProjectBoardCard(row, this.listOrchestrationTasks()) : undefined;
  }

  getProjectBoardDependencyWorkspacePathsForExecutionThread(threadId: string): string[] {
    const card = this.getProjectBoardCardForExecutionThread(threadId);
    if (!card) return [];
    const context = this.projectBoardCardDependencyExecutionContext(card);
    if (!context?.available.length) return [];
    return projectBoardPromptList(
      context.available.flatMap((item) => (item.workspacePath ? [item.workspacePath] : [])),
      12,
    );
  }

  async importProjectBoardDependencyArtifactsForTask(input: {
    taskId: string;
    workspacePath: string;
    createdAt?: string;
  }): Promise<ProjectBoardDependencyArtifactImportResult> {
    const card = this.getProjectBoardCardForOrchestrationTask(input.taskId);
    const importedAt = input.createdAt ?? new Date().toISOString();
    const artifactRoot = join(input.workspacePath, ".ambient", "dependency-artifacts");
    const manifestPath = join(artifactRoot, "manifest.json");
    const emptyResult: ProjectBoardDependencyArtifactImportResult = {
      kind: "project_board_dependency_artifact_import_result",
      version: 1,
      dependentTaskId: input.taskId,
      workspacePath: input.workspacePath,
      artifactRoot,
      manifestPath,
      imports: [],
      pending: [],
      importedAt,
    };
    if (!card) return emptyResult;

    const context = this.projectBoardCardDependencyExecutionContext(card);
    if (!context || (context.available.length === 0 && context.pending.length === 0)) return { ...emptyResult, boardId: card.boardId, dependentCardId: card.id };

    const result: ProjectBoardDependencyArtifactImportResult = {
      ...emptyResult,
      boardId: card.boardId,
      dependentCardId: card.id,
      pending: [...context.pending],
    };
    await mkdir(artifactRoot, { recursive: true });

    for (const entry of context.available) {
      if (!entry.latestRunId) {
        result.pending.push(`${entry.ref} (${entry.title}; no completed run artifact is available to import)`);
        continue;
      }
      const run = this.getOrchestrationRun(entry.latestRunId);
      const sourceWorkspacePath = entry.workspacePath ?? run.workspacePath;
      if (!sourceWorkspacePath) {
        result.pending.push(`${entry.ref} (${entry.title}; source workspace is unavailable)`);
        continue;
      }
      const manifest = projectBoardDeliverableManifestFromRun(run, { cardId: entry.cardId, cardTitle: entry.title });
      const key = projectBoardDependencyArtifactKey(entry, run.id);
      const importPath = join(artifactRoot, key);
      const filesRoot = join(importPath, "files");
      const dependencyManifestPath = join(importPath, "manifest.json");
      const materialFiles: string[] = [];
      const skippedFiles: string[] = [];
      await mkdir(filesRoot, { recursive: true });

      for (const file of manifest.materialFiles) {
        const source = projectBoardResolveInside(sourceWorkspacePath, file.path);
        const destination = projectBoardResolveInside(filesRoot, file.path);
        try {
          const sourceStats = await stat(source);
          if (!sourceStats.isFile()) {
            skippedFiles.push(file.path);
            continue;
          }
          await mkdir(dirname(destination), { recursive: true });
          await copyFile(source, destination);
          materialFiles.push(file.path);
        } catch {
          skippedFiles.push(file.path);
        }
      }

      const imported: ProjectBoardDependencyArtifactImport = {
        kind: "project_board_dependency_artifact_import",
        version: 1,
        key,
        boardId: card.boardId,
        dependentCardId: card.id,
        dependentTaskId: input.taskId,
        dependencyRef: entry.ref,
        dependencyTitle: entry.title,
        dependencyCardId: entry.cardId,
        dependencyTaskId: entry.taskId ?? run.taskId,
        dependencyTaskIdentifier: entry.taskIdentifier,
        dependencyRunId: run.id,
        sourceWorkspacePath,
        importPath,
        filesRoot,
        manifestPath: dependencyManifestPath,
        declaredMaterialFiles: manifest.materialFiles.map((file) => file.path),
        materialFiles,
        skippedFiles,
        excludedFiles: manifest.excludedFiles.map((file) => file.path),
        changedFiles: entry.changedFiles,
        commands: entry.commands,
        manualChecks: entry.manualChecks,
        completed: entry.completed,
        proofSummary: entry.proofSummary,
        importedAt,
      };

      await writeFile(
        dependencyManifestPath,
        `${JSON.stringify(
          {
            ...imported,
            sourceDeliverableManifest: manifest,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      result.imports.push(imported);
    }

    await writeFile(manifestPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return result;
  }

  getProjectBoardProofReviewContextForRun(runId: string): ProjectBoardProofReviewContext | undefined {
    const run = this.getOrchestrationRun(runId);
    const parent = this.requireDb()
      .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1")
      .get(run.taskId) as ProjectBoardCardRow | undefined;
    if (!parent) return undefined;
    const card = this.mapProjectBoardCard(parent, this.listOrchestrationTasks());
    const boardRow = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(parent.board_id) as ProjectBoardRow | undefined;
    const draft = evaluateProjectBoardCardProof(card, run);
    const scopedRun = {
      ...run,
      proofOfWork: projectBoardProofOfWorkForRun(run.proofOfWork, run, card),
    };
    return {
      card,
      board: boardRow ? this.mapProjectBoard(boardRow) : undefined,
      run: scopedRun,
      deterministicReview: projectBoardProofReviewFromDraft({ ...draft, reviewer: "deterministic" }, scopedRun, new Date().toISOString()),
    };
  }

  recordProjectBoardCardRunProgressEvent(input: {
    boardId: string;
    cardId: string;
    runId: string;
    title: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.appendProjectBoardEvent({
      boardId: input.boardId,
      kind: "card_run_progress",
      title: input.title,
      summary: input.summary,
      entityKind: "project_board_card",
      entityId: input.cardId,
      metadata: {
        ...(input.metadata ?? {}),
        cardId: input.cardId,
        runId: input.runId,
      },
    });
  }

  recordProjectBoardTaskToolAction(input: {
    runId: string;
    cardId: string;
    taskId?: string;
    action: ProjectBoardTaskToolAction;
    toolName?: string;
    source?: ProjectBoardTaskToolActionTransport;
  }): OrchestrationRun | undefined {
    const run = this.getOrchestrationRun(input.runId);
    const card = this.tryGetProjectBoardCard(input.cardId);
    if (!card) return undefined;
    const action = {
      ...input.action,
      runId: input.action.runId ?? run.id,
      cardId: input.action.cardId ?? card.id,
      taskId: input.action.taskId ?? input.taskId ?? run.taskId,
      metadata: {
        ...input.action.metadata,
        ...(input.source ? { transport: input.source } : {}),
        ...(input.toolName ? { toolName: input.toolName } : {}),
      },
    } as ProjectBoardTaskToolAction;
    const taskToolActions = mergeProjectBoardTaskToolActionsForProof([
      ...projectBoardTaskToolActionsFromProofOfWork(run.proofOfWork),
      action,
    ]);
    const taskActionDiagnostics = projectBoardTaskToolActionDiagnostics(taskToolActions);
    const updated = this.updateOrchestrationRun({
      id: run.id,
      status: run.status,
      threadId: run.threadId,
      piSessionFile: run.piSessionFile ?? null,
      proofOfWork: {
        ...(run.proofOfWork ?? {}),
        taskToolActions,
        taskActionDiagnostics,
      },
      reviewProjectBoardProof: false,
    });
    this.recordProjectBoardCardRunProgressEvent({
      boardId: card.boardId,
      cardId: card.id,
      runId: run.id,
      title: projectBoardTaskToolActionTitle(action),
      summary: projectBoardTaskToolActionSummary(action),
      metadata: {
        source: input.source ?? "unknown",
        toolName: input.toolName ?? "",
        taskId: action.taskId ?? input.taskId ?? run.taskId,
        taskAction: {
          action: action.action,
          actionId: action.actionId,
          createdAt: action.createdAt,
          source: input.source ?? "unknown",
          toolName: input.toolName ?? "",
          terminal: action.action === "task_block" ||
            action.action === "task_complete" ||
            action.action === "task_create_followup" ||
            action.action === "task_report_proof" ||
            action.action === "task_report_handoff",
        },
        taskActionDiagnostics,
      },
    });
    return updated;
  }

  private projectBoardProofReviewApplicationBlocker(
    parent: ProjectBoardCardRow,
    run: Pick<OrchestrationRun, "id" | "taskId">,
    requireCurrentReview: boolean,
  ): string | undefined {
    const latestRun = this.requireDb()
      .prepare("SELECT id FROM orchestration_runs WHERE task_id = ? ORDER BY started_at DESC, attempt_number DESC LIMIT 1")
      .get(run.taskId) as { id: string } | undefined;
    return projectBoardProofReviewApplicationBlocker({
      latestRunId: latestRun?.id,
      runId: run.id,
      proofReviewJson: parent.proof_review_json,
      requireCurrentReview,
    });
  }

  isProjectBoardProofReviewRunCurrent(runId: string, requireCurrentReview = false): boolean {
    const run = this.getOrchestrationRun(runId);
    const parent = this.requireDb()
      .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1")
      .get(run.taskId) as ProjectBoardCardRow | undefined;
    if (!parent) return false;
    return !this.projectBoardProofReviewApplicationBlocker(parent, run, requireCurrentReview);
  }

  applyProjectBoardCardProofReview(input: {
    runId: string;
    review: ProjectBoardCardProofReview;
    requireCurrentReview?: boolean;
    allowStaleRun?: boolean;
  }): ProjectBoardCard | undefined {
    const run = this.getOrchestrationRun(input.runId);
    const parent = this.requireDb()
      .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1")
      .get(run.taskId) as ProjectBoardCardRow | undefined;
    if (!parent) return undefined;
    const parentCard = this.mapProjectBoardCard(parent, this.listOrchestrationTasks());
    const staleReason = input.allowStaleRun ? undefined : this.projectBoardProofReviewApplicationBlocker(parent, run, input.requireCurrentReview === true);
    if (staleReason) {
      this.appendProjectBoardEvent({
        boardId: parent.board_id,
        kind: "card_proof_review_ignored",
        title: "Stale proof review ignored",
        summary: `${parent.title} received a proof judgment for an old or superseded run; the current card state was left unchanged.`,
        entityKind: "project_board_card",
        entityId: parent.id,
        metadata: {
          cardId: parent.id,
          runId: run.id,
          status: input.review.status,
          recommendedAction: input.review.recommendedAction,
          reviewer: input.review.reviewer ?? "deterministic",
          staleReason,
        },
        createdAt: new Date().toISOString(),
      });
      return this.getProjectBoardCard(parent.id);
    }
    const proof = projectBoardProofOfWorkForRun(run.proofOfWork, run, parentCard);
    const proofText = projectBoardProofEvidenceText(run.error, proof);
    const inputReview = projectBoardProofReviewClosureModelForApplication(
      projectBoardRuntimeBudgetReviewForApplication(input.review, proof, proofText, run.workspacePath),
      projectBoardMissingProofItems(parentCard, proofText, proof, run.workspacePath),
    );
    const runtimeBudgetSplit =
      projectBoardRuntimeBudgetExceeded(proof) &&
      inputReview.status === "needs_follow_up" &&
      projectBoardRuntimeBudgetHasMeaningfulProgress(proof, proofText, inputReview.satisfied, run.workspacePath);
    const runtimeBudgetRemaining = runtimeBudgetSplit
      ? projectBoardRuntimeBudgetRemainingCriteria(parentCard, proof, input.review)
      : [];
    const runtimeBudgetCompleted = runtimeBudgetSplit
      ? projectBoardRuntimeBudgetCompletedCriteria(proof, input.review.satisfied, run.workspacePath)
      : [];
    const hasExplicitFollowUps = normalizeRunFollowUps(run.proofOfWork?.followUps).length > 0;
    const runtimeBudgetFollowUpOptions: ProjectBoardRunFollowUpInsertOptions | undefined = runtimeBudgetSplit
      ? {
          blockByParent: false,
          labels: ["runtime-split-follow-up", "derived-from-parent"],
          clarificationQuestions: [projectBoardRuntimeBudgetFollowUpClarificationQuestion(parent.title)],
        }
      : undefined;
    const proofFollowUpSuggestionOptions = runtimeBudgetSplit
      ? undefined
      : projectBoardProofFollowUpOptionsFromSuggestion(inputReview.followUpSuggestion);
    const explicitFollowUpIds = this.createProjectBoardFollowUpCandidatesForRun(run, parent, runtimeBudgetFollowUpOptions);
    const proofFollowUpIds = inputReview.status === "needs_follow_up" && !hasExplicitFollowUps
      ? this.createProjectBoardProofFollowUpForRun(
          run,
          parent,
          {
            status: inputReview.status,
            summary: inputReview.summary,
            satisfied: inputReview.satisfied,
            missing: inputReview.missing,
          },
          runtimeBudgetSplit
            ? {
                blockByParent: false,
                labels: ["runtime-split-follow-up", "derived-from-parent"],
                title: `Continue ${parent.title}`.slice(0, 180),
                description: projectBoardRuntimeBudgetFollowUpDescription(parent.title, input.review, runtimeBudgetCompleted, runtimeBudgetRemaining),
                acceptanceCriteria: runtimeBudgetRemaining,
                clarificationQuestions: [projectBoardRuntimeBudgetFollowUpClarificationQuestion(parent.title)],
                sourceIdSuffix: "runtime-split",
              }
            : proofFollowUpSuggestionOptions,
        )
      : [];
    const now = new Date().toISOString();
    const review: ProjectBoardCardProofReview = {
      ...inputReview,
      followUpCardIds: [...new Set([...inputReview.followUpCardIds, ...explicitFollowUpIds, ...proofFollowUpIds])],
      runId: run.id,
      reviewedAt: now,
    };
    const splitOutcome = runtimeBudgetSplit
      ? projectBoardRuntimeBudgetSplitOutcomeForReview(parentCard, run, review, review.followUpCardIds, now)
      : undefined;
    const nextCardStatus: ProjectBoardCardStatus =
      review.status === "done" ? "done" : review.status === "ready_for_review" ? "review" : "blocked";
    this.requireDb()
      .prepare("UPDATE project_board_cards SET status = ?, proof_review_json = ?, split_outcome_json = ?, updated_at = ? WHERE id = ?")
      .run(nextCardStatus, JSON.stringify(review), splitOutcome ? JSON.stringify(splitOutcome) : parent.split_outcome_json, now, parent.id);
    this.requireDb()
      .prepare("UPDATE orchestration_tasks SET state = ?, updated_at = ? WHERE id = ?")
      .run(projectBoardTaskStateForProofReview(review.status), now, run.taskId);
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, parent.board_id);
    this.appendProjectBoardEvent({
      boardId: parent.board_id,
      kind: "card_proof_reviewed",
      title: review.reviewer === "ambient_pi" ? "Card proof reviewed by Pi" : "Card proof reviewed",
      summary: review.summary,
      entityKind: "project_board_card",
      entityId: parent.id,
      metadata: {
        cardId: parent.id,
        runId: run.id,
        status: review.status,
        missing: review.missing,
        satisfied: review.satisfied,
        followUpCardIds: review.followUpCardIds,
        reviewer: review.reviewer ?? "deterministic",
        model: review.model,
        confidence: review.confidence,
        evidenceQuality: review.evidenceQuality,
        recommendedAction: review.recommendedAction,
        deterministicStatus: review.deterministicStatus,
        followUpSuggestionUsed: proofFollowUpIds.length > 0 && Boolean(proofFollowUpSuggestionOptions),
        followUpSuggestionTitle: proofFollowUpSuggestionOptions?.title,
        splitOutcome: splitOutcome
          ? {
              source: splitOutcome.source,
              status: splitOutcome.status,
              childCardIds: splitOutcome.childCardIds,
              completedCriteria: splitOutcome.completedCriteria.length,
              remainingCriteria: splitOutcome.remainingCriteria.length,
            }
          : undefined,
      },
      createdAt: now,
    });
    if (splitOutcome) {
      this.appendProjectBoardEvent({
        boardId: parent.board_id,
        kind: "card_split",
        title: "Runtime-budget split proposed",
        summary: `${parent.title} timed out after meaningful progress; ${splitOutcome.childCardIds.length} follow-up card${splitOutcome.childCardIds.length === 1 ? "" : "s"} now represent the remaining scope.`,
        entityKind: "project_board_card",
        entityId: parent.id,
        metadata: {
          cardId: parent.id,
          runId: run.id,
          reason: splitOutcome.reason,
          completedCriteria: splitOutcome.completedCriteria,
          remainingCriteria: splitOutcome.remainingCriteria,
          childCardIds: splitOutcome.childCardIds,
        },
        createdAt: now,
      });
    }
    return this.getProjectBoardCard(parent.id);
  }

  beginProjectBoardCardRun(input: { runId: string }): ProjectBoardCard | undefined {
    const run = this.getOrchestrationRun(input.runId);
    const parent = this.requireDb()
      .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1")
      .get(run.taskId) as ProjectBoardCardRow | undefined;
    if (!parent) return undefined;
    if (projectBoardCardRowIsClosedDone(parent)) return this.getProjectBoardCard(parent.id);
    if (parent.status === "in_progress" && !parent.proof_review_json) return this.getProjectBoardCard(parent.id);

    const now = new Date().toISOString();
    this.requireDb()
      .prepare("UPDATE project_board_cards SET status = ?, proof_review_json = NULL, updated_at = ? WHERE id = ?")
      .run("in_progress", now, parent.id);
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, parent.board_id);
    return this.getProjectBoardCard(parent.id);
  }

  recomputeProjectBoardProofCoverage(input: RecomputeProjectBoardProofCoverageInput): ProjectBoardSummary {
    const board = this.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const previousRecheck = projectBoardLatestProofCoverageRecheckEvent(board.events);
    const proofImpact = projectBoardProofCoverageRecheck(board);
    const proofDrift = projectBoardProofCoverageDrift(proofImpact, previousRecheck?.proofImpact);
    const proofImpactEventMetadata = {
      ...proofImpact,
      driftSchemaVersion: 1,
      driftBaselineEventId: previousRecheck?.event.id,
      staleSinceLastRecheck: proofDrift.stale,
      driftReasons: proofDrift.reasons,
      affectedCardIds: proofDrift.affectedCardIds,
      policyAffectedCardIds: proofDrift.policyAffectedCardIds,
      addedEligibleCardIds: proofDrift.addedEligibleCardIds,
      removedEligibleCardIds: proofDrift.removedEligibleCardIds,
      addedMissingProofCardIds: proofDrift.addedMissingProofCardIds,
      resolvedMissingProofCardIds: proofDrift.resolvedMissingProofCardIds,
      proofKindChangedCardIds: proofDrift.proofKindChangedCardIds,
      proofItemCountChangedCardIds: proofDrift.proofItemCountChangedCardIds,
    };
    const now = new Date().toISOString();
    const totalProofItems =
      proofImpact.unitProofItemCount + proofImpact.integrationProofItemCount + proofImpact.visualProofItemCount + proofImpact.manualProofItemCount;
    const driftSummary = previousRecheck
      ? proofDrift.stale
        ? ` ${proofDrift.affectedCardIds.length} affected card${proofDrift.affectedCardIds.length === 1 ? "" : "s"} since last recheck.`
        : " No proof drift since last recheck."
      : " First recorded proof baseline.";

    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, board.id);
    this.appendProjectBoardEvent({
      boardId: board.id,
      kind: "card_updated",
      title: "Proof coverage rechecked",
      summary: `${proofImpact.eligibleCardCount} proof-eligible card${proofImpact.eligibleCardCount === 1 ? "" : "s"} rechecked; ${
        proofImpact.missingProofCount
      } missing proof; ${totalProofItems} proof item${totalProofItems === 1 ? "" : "s"}. 0 model calls.${driftSummary}`,
      entityKind: "project_board",
      entityId: board.id,
      metadata: {
        proofImpact: proofImpactEventMetadata,
      },
      createdAt: now,
    });
    return this.getProjectBoard(board.id) ?? board;
  }

  applyProjectBoardClarificationDefaultSuggestions(input: {
    boardId: string;
    suggestions: ProjectBoardClarificationDefaultSuggestion[];
    targetCardIds?: string[];
    model?: string;
    telemetry?: { promptCharCount?: number; responseCharCount?: number; requestDurationMs?: number };
    fallbackUsed?: boolean;
    providerError?: string;
  }): ProjectBoardSummary {
    const board = this.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = new Date().toISOString();
    const targetCardIds = [...new Set((input.targetCardIds?.length ? input.targetCardIds : input.suggestions.map((item) => item.cardId)).filter(Boolean))];
    const suggestionsByCardId = new Map<string, ProjectBoardClarificationDefaultSuggestion[]>();
    for (const suggestion of input.suggestions) {
      if (!suggestion.cardId) continue;
      const list = suggestionsByCardId.get(suggestion.cardId) ?? [];
      list.push(suggestion);
      suggestionsByCardId.set(suggestion.cardId, list);
    }

    const appliedCardIds: string[] = [];
    const skippedReasons: Record<string, string> = {};
    let suggestedDecisionCount = 0;
    let safeSuggestionCount = 0;
    const answeredDecisions = projectBoardClarificationDefaultAnsweredDecisions(board.cards);
    const updateClarificationSuggestions = this.requireDb().prepare(
      `UPDATE project_board_cards
       SET clarification_suggestions_json = ?,
           clarification_decisions_json = ?,
           updated_at = ?
       WHERE id = ?
         AND board_id = ?`,
    );

    for (const cardId of targetCardIds) {
      const current = board.cards.find((card) => card.id === cardId);
      if (!current || current.boardId !== board.id) {
        skippedReasons[cardId] = "Card was not found on this board.";
        continue;
      }
      if (current.status === "archived") {
        skippedReasons[cardId] = "Archived cards cannot receive clarification suggestions.";
        continue;
      }
      if (current.candidateStatus === "duplicate" || current.candidateStatus === "rejected" || current.candidateStatus === "evidence") {
        skippedReasons[cardId] = `Card candidate status is ${current.candidateStatus}.`;
        continue;
      }
      const suggestions = suggestionsByCardId.get(cardId) ?? [];
      if (suggestions.length === 0) {
        skippedReasons[cardId] = "Ambient/Pi did not return a clarification suggestion for this card.";
        continue;
      }

      const currentSuggestions = normalizeProjectBoardClarificationSuggestions(current.clarificationSuggestions ?? [], []);
      const currentDecisions = normalizeProjectBoardClarificationDecisions(current.clarificationDecisions, {
        clarificationQuestions: current.clarificationQuestions,
        clarificationSuggestions: currentSuggestions,
        clarificationAnswers: current.clarificationAnswers,
        description: current.description,
        acceptanceCriteria: current.acceptanceCriteria,
        createdAt: current.createdAt,
        updatedAt: current.updatedAt,
      });
      const nextSuggestions: ProjectBoardCardClarificationSuggestion[] = [...currentSuggestions];
      const nextDecisions: ProjectBoardCardClarificationDecision[] = currentDecisions.map((decision) => ({ ...decision }));
      let appliedForCard = 0;

      for (const suggestion of suggestions) {
        const decisionIndex = nextDecisions.findIndex(
          (decision) =>
            decision.state === "open" &&
            !decision.suggestedAnswer?.trim() &&
            (decision.id === suggestion.decisionId || projectBoardQuestionsAreNearDuplicates(decision.question, suggestion.question)),
        );
        if (decisionIndex < 0) continue;
        const decision = nextDecisions[decisionIndex];
        const relatedAnsweredDecision = answeredDecisions.find(
          (answered) =>
            answered.cardId !== current.id &&
            projectBoardClarificationDefaultQuestionsShareDecisionTopic(answered.question, decision.question),
        );
        if (relatedAnsweredDecision) {
          skippedReasons[cardId] = `Skipped conflicting default because "${relatedAnsweredDecision.cardTitle}" already answers an overlapping decision.`;
          continue;
        }
        const normalizedSuggestion = normalizeProjectBoardClarificationSuggestions(
          [
            {
              question: decision.question,
              suggestedAnswer: suggestion.suggestedAnswer,
              rationale: suggestion.rationale,
              confidence: suggestion.confidence,
              safeToAccept: suggestion.safeToAccept,
              questionKind: suggestion.questionKind,
            },
          ],
          [],
        )[0];
        if (!normalizedSuggestion) continue;
        const existingSuggestionIndex = nextSuggestions.findIndex((item) => projectBoardQuestionsAreNearDuplicates(item.question, decision.question));
        if (existingSuggestionIndex >= 0) nextSuggestions[existingSuggestionIndex] = normalizedSuggestion;
        else nextSuggestions.push(normalizedSuggestion);
        nextDecisions[decisionIndex] = {
          ...decision,
          suggestedAnswer: normalizedSuggestion.suggestedAnswer,
          rationale: normalizedSuggestion.rationale,
          confidence: normalizedSuggestion.confidence,
          safeToAccept: normalizedSuggestion.safeToAccept,
          questionKind: normalizedSuggestion.questionKind,
          updatedAt: now,
        };
        appliedForCard += 1;
        suggestedDecisionCount += 1;
        if (normalizedSuggestion.safeToAccept) safeSuggestionCount += 1;
      }

      if (appliedForCard === 0) {
        skippedReasons[cardId] = "No open clarification decision without a suggestion matched the returned suggestion.";
        continue;
      }
      const result = updateClarificationSuggestions.run(
        JSON.stringify(normalizeProjectBoardClarificationSuggestions(nextSuggestions, [])),
        JSON.stringify(normalizeProjectBoardClarificationDecisions(nextDecisions, {
          clarificationQuestions: current.clarificationQuestions,
          clarificationSuggestions: nextSuggestions,
          clarificationAnswers: current.clarificationAnswers,
          description: current.description,
          acceptanceCriteria: current.acceptanceCriteria,
          createdAt: current.createdAt,
          updatedAt: now,
        })),
        now,
        current.id,
        board.id,
      );
      if (result.changes <= 0) {
        skippedReasons[cardId] = "Card clarification suggestion metadata could not be updated.";
        continue;
      }
      appliedCardIds.push(cardId);
      this.appendProjectBoardEvent({
        boardId: board.id,
        kind: "card_updated",
        title: "Clarification default suggested",
        summary: `${current.title} received ${appliedForCard} reviewable expert default${appliedForCard === 1 ? "" : "s"} without rewriting card specs.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: {
          cardId: current.id,
          suggestedDecisionCount: appliedForCard,
          changedFields: ["clarificationSuggestions", "clarificationDecisions"],
          protectedPiUpdate: false,
          existingCardsRewritten: false,
          modelCallRequired: true,
        },
        createdAt: now,
      });
    }

    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, board.id);
    const skippedCardIds = targetCardIds.filter((cardId) => !appliedCardIds.includes(cardId));
    this.appendProjectBoardEvent({
      boardId: board.id,
      kind: "card_updated",
      title: "Clarification defaults suggested",
      summary:
        suggestedDecisionCount > 0
          ? `${input.fallbackUsed ? "Fallback rules" : "Ambient/Pi"} proposed ${suggestedDecisionCount} clarification default${
              suggestedDecisionCount === 1 ? "" : "s"
            } on ${appliedCardIds.length} card${appliedCardIds.length === 1 ? "" : "s"}; ${safeSuggestionCount} marked safe to accept. Card specs were not rewritten.`
          : `No clarification defaults were applied; ${skippedCardIds.length} card${skippedCardIds.length === 1 ? "" : "s"} skipped without rewriting card specs.`,
      entityKind: "project_board",
      entityId: board.id,
      metadata: {
        clarificationDefaults: {
          schemaVersion: 1,
          appliedAction: "suggest_expert_defaults",
          targetCardIds,
          appliedCardIds,
          skippedCardIds,
          skippedReasons,
          suggestedDecisionCount,
          safeSuggestionCount,
          existingCardsRewritten: false,
          modelCallRequired: true,
          ...(input.model ? { model: input.model } : {}),
          ...(typeof input.telemetry?.promptCharCount === "number" ? { promptCharCount: input.telemetry.promptCharCount } : {}),
          ...(typeof input.telemetry?.responseCharCount === "number" ? { responseCharCount: input.telemetry.responseCharCount } : {}),
          ...(typeof input.telemetry?.requestDurationMs === "number" ? { requestDurationMs: input.telemetry.requestDurationMs } : {}),
          ...(input.fallbackUsed ? { fallbackUsed: true } : {}),
          ...(input.providerError ? { providerError: input.providerError.slice(0, 500) } : {}),
        },
        suggestions: input.suggestions.map((suggestion) => ({
          cardId: suggestion.cardId,
          decisionId: suggestion.decisionId,
          question: suggestion.question,
          confidence: suggestion.confidence,
          safeToAccept: suggestion.safeToAccept,
          questionKind: suggestion.questionKind,
          rationale: suggestion.rationale,
        })),
      },
      createdAt: now,
    });
    return this.getProjectBoard(board.id) ?? board;
  }

  applyProjectBoardProofSuggestions(input: {
    boardId: string;
    suggestions: ProjectBoardProofSuggestion[];
    targetCardIds?: string[];
    model?: string;
    telemetry?: { promptCharCount?: number; responseCharCount?: number; requestDurationMs?: number };
    fallbackUsed?: boolean;
    providerError?: string;
  }): ProjectBoardSummary {
    const board = this.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const beforeImpact = projectBoardProofCoverageRecheck(board);
    const now = new Date().toISOString();
    const targetCardIds = [...new Set((input.targetCardIds?.length ? input.targetCardIds : input.suggestions.map((item) => item.cardId)).filter(Boolean))];
    const suggestionsByCardId = new Map(input.suggestions.map((suggestion) => [suggestion.cardId, suggestion]));
    const appliedCardIds: string[] = [];
    const skippedReasons: Record<string, string> = {};
    let appliedProofItemCount = 0;
    const updatePendingPi = this.requireDb().prepare(
      `UPDATE project_board_cards
       SET pending_pi_update_json = ?,
           updated_at = ?
       WHERE id = ?`,
    );

    for (const cardId of targetCardIds) {
      const suggestion = suggestionsByCardId.get(cardId);
      const current = board.cards.find((card) => card.id === cardId);
      if (!current || current.boardId !== board.id) {
        skippedReasons[cardId] = "Card was not found on this board.";
        continue;
      }
      if (current.status !== "draft" || current.orchestrationTaskId) {
        skippedReasons[cardId] = "Card is already ticketized or no longer a draft; approved card specs were not rewritten.";
        continue;
      }
      if (current.candidateStatus === "duplicate" || current.candidateStatus === "rejected" || current.candidateStatus === "evidence") {
        skippedReasons[cardId] = `Card candidate status is ${current.candidateStatus}.`;
        continue;
      }
      if (projectBoardCardProofCount(current) > 0) {
        skippedReasons[cardId] = "Card already has proof expectations.";
        continue;
      }
      if (current.pendingPiUpdate) {
        skippedReasons[cardId] = "Card already has a pending Pi update; review or ignore it before asking for proof suggestions again.";
        continue;
      }
      if (!suggestion) {
        skippedReasons[cardId] = "Ambient/Pi did not return a proof suggestion for this card.";
        continue;
      }
      const testPlan = normalizeProjectBoardCardTestPlan(suggestion.testPlan);
      const proofItemCount = projectBoardCardProofCount({ testPlan });
      if (proofItemCount === 0) {
        skippedReasons[cardId] = "Proof suggestion did not contain a valid proof expectation.";
        continue;
      }
      const pendingUpdate: ProjectBoardCardPendingPiUpdate = {
        sourceId: `proof:${input.model?.trim() || "suggestion"}`,
        createdAt: now,
        changedFields: ["testPlan"],
        testPlan,
      };
      const result = updatePendingPi.run(JSON.stringify(pendingUpdate), now, cardId);
      if (result.changes <= 0) {
        skippedReasons[cardId] = "Card could not be updated.";
        continue;
      }
      appliedCardIds.push(cardId);
      appliedProofItemCount += proofItemCount;
      this.appendProjectBoardEvent({
        boardId: board.id,
        kind: "card_updated",
        title: "Proof Pi update available",
        summary: `${current.title} received reviewable proof expectations from Pi. Apply the update before ticketization.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: {
          cardId: current.id,
          sourceId: pendingUpdate.sourceId,
          changedFields: pendingUpdate.changedFields,
          proofOwnership: suggestion.proofOwnership,
          confidence: suggestion.confidence,
          protectedPiUpdate: true,
          modelCallRequired: true,
        },
        createdAt: now,
      });
    }

    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, board.id);
    const afterBoard = this.getProjectBoard(board.id) ?? board;
    const afterImpact = projectBoardProofCoverageRecheck(afterBoard);
    const skippedCardIds = targetCardIds.filter((cardId) => !appliedCardIds.includes(cardId));
    const proofImpact: ProjectBoardProofSuggestionAppliedMetadata = {
      schemaVersion: 1,
      appliedAction: "suggest_missing_proof",
      strict: beforeImpact.strict,
      targetCardIds,
      appliedCardIds,
      pendingPiUpdateCardIds: appliedCardIds,
      skippedCardIds,
      skippedReasons,
      appliedProofItemCount,
      suggestedProofItemCount: appliedProofItemCount,
      missingProofCountBefore: beforeImpact.missingProofCount,
      missingProofCountAfter: afterImpact.missingProofCount,
      existingCardsRewritten: false,
      modelCallRequired: true,
      ...(input.model ? { model: input.model } : {}),
      ...(typeof input.telemetry?.promptCharCount === "number" ? { promptCharCount: input.telemetry.promptCharCount } : {}),
      ...(typeof input.telemetry?.responseCharCount === "number" ? { responseCharCount: input.telemetry.responseCharCount } : {}),
      ...(typeof input.telemetry?.requestDurationMs === "number" ? { requestDurationMs: input.telemetry.requestDurationMs } : {}),
      ...(input.fallbackUsed ? { fallbackUsed: true } : {}),
      ...(input.providerError ? { providerError: input.providerError.slice(0, 500) } : {}),
    };
    this.appendProjectBoardEvent({
      boardId: board.id,
      kind: "card_updated",
      title: "Proof expectations suggested",
      summary:
        appliedCardIds.length > 0
          ? `${input.fallbackUsed ? "Fallback proof rules staged" : "Ambient/Pi suggested"} ${appliedProofItemCount} proof expectation${
              appliedProofItemCount === 1 ? "" : "s"
            } for review on ${
              appliedCardIds.length
            } draft card${appliedCardIds.length === 1 ? "" : "s"}; ${skippedCardIds.length} card${
              skippedCardIds.length === 1 ? "" : "s"
            } skipped without rewriting card specs.`
          : `No proof expectations were staged; ${skippedCardIds.length} card${skippedCardIds.length === 1 ? "" : "s"} skipped without rewriting approved specs.`,
      entityKind: "project_board",
      entityId: board.id,
      metadata: {
        proofImpact,
        suggestions: input.suggestions.map((suggestion) => ({
          cardId: suggestion.cardId,
          proofOwnership: suggestion.proofOwnership,
          confidence: suggestion.confidence,
          testPlan: suggestion.testPlan,
          rationale: suggestion.rationale,
        })),
      },
      createdAt: now,
    });
    return this.getProjectBoard(board.id) ?? afterBoard;
  }

  resolveProjectBoardProofDecision(input: { cardId: string; action: ProjectBoardProofDecisionAction; reason?: string }): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    if (!current.orchestrationTaskId) {
      throw new Error("Proof decisions require a ticketized project board card.");
    }
    const task = this.getOrchestrationTask(current.orchestrationTaskId);
    const taskRuns = this.listOrchestrationRuns(200).filter((run) => run.taskId === task.id);
    const activeRun = taskRuns.find((run) => ["claimed", "prepared", "preparing", "running", "retry_queued"].includes(run.status));
    if (activeRun) {
      throw new Error("Wait for the active card run to finish before resolving proof.");
    }
    const latestRun = taskRuns[0];
    const previousReview = current.proofReview;
    const alreadyDone = current.status === "done" || task.state.trim().toLowerCase().replace(/\s+/g, "_") === "done";
    if (alreadyDone && input.action === "retry") {
      throw new Error("Done project board cards cannot be sent back to Ready.");
    }
    const reviewableFinishedRun = Boolean(latestRun && projectBoardRunHasReviewableProof(latestRun, current));
    if (!previousReview && current.status !== "done" && !reviewableFinishedRun) {
      throw new Error("Run the card until a proof packet or PM proof review is ready before resolving proof.");
    }

    const now = new Date().toISOString();
    const reason = input.reason?.trim().slice(0, 1000);
    const previousSummary = previousReview?.summary ? ` Previous review: ${previousReview.summary}` : "";
    const proofRevisionFeedback = input.action === "retry" ? projectBoardProofRevisionRunFeedback(previousReview, reason, now) : undefined;
    const uxMockRejectionFeedback =
      input.action === "mark_blocked" && projectBoardCardIsUxMockGate(current)
        ? projectBoardUxMockRejectionRunFeedback(previousReview, reason, now)
        : undefined;
    const decisionFeedback = [proofRevisionFeedback, uxMockRejectionFeedback].filter(
      (feedback): feedback is ProjectBoardCardRunFeedback => Boolean(feedback),
    );
    const runFeedback =
      decisionFeedback.length > 0
        ? normalizeProjectBoardCardRunFeedback([...(current.runFeedback ?? []), ...decisionFeedback])
        : normalizeProjectBoardCardRunFeedback(current.runFeedback ?? []);
    const makeReview = (
      status: ProjectBoardCardProofReviewStatus,
      summary: string,
      recommendedAction: ProjectBoardCardProofRecommendedAction,
    ): ProjectBoardCardProofReview => ({
      status,
      summary,
      satisfied:
        status === "done"
          ? [...new Set([...(previousReview?.satisfied ?? []), "Accepted by user PM decision."])]
          : (previousReview?.satisfied ?? []),
      missing:
        status === "terminally_blocked"
          ? [...new Set([...(previousReview?.missing ?? []), reason || "Manual PM decision marked this card blocked."])]
          : [],
      followUpCardIds: previousReview?.followUpCardIds ?? [],
      runId: previousReview?.runId ?? "",
      reviewedAt: now,
      reviewer: previousReview?.reviewer,
      model: previousReview?.model,
      confidence: previousReview?.confidence,
      evidenceQuality: previousReview?.evidenceQuality,
      recommendedAction,
      deterministicStatus: previousReview?.deterministicStatus,
      deterministicSummary: previousReview?.deterministicSummary,
      judgeDurationMs: previousReview?.judgeDurationMs,
    });

    const next =
      input.action === "accept_done"
        ? {
            cardStatus: "done" as ProjectBoardCardStatus,
            taskState: "done",
            proofReviewJson: JSON.stringify(
              makeReview(
                "done",
                `Accepted as done by user PM decision.${reason ? ` Reason: ${reason}` : ""}${previousSummary}`,
                "close",
              ),
            ),
            eventTitle: "Proof accepted as done",
            eventSummary: `${current.title} was manually accepted as done.`,
          }
        : input.action === "retry"
          ? {
              cardStatus: "ready" as ProjectBoardCardStatus,
              taskState: "ready",
              proofReviewJson: null,
              eventTitle: "Proof sent back for revision",
              eventSummary: `${current.title} was returned to Ready with next-run proof feedback.`,
            }
          : {
              cardStatus: "blocked" as ProjectBoardCardStatus,
              taskState: "terminal_blocker",
              proofReviewJson: JSON.stringify(
                makeReview(
                  "terminally_blocked",
                  `Marked blocked by user PM decision.${reason ? ` Reason: ${reason}` : ""}${previousSummary}`,
                  "block",
                ),
              ),
              eventTitle: "Proof marked blocked",
              eventSummary: `${current.title} was manually marked blocked.`,
            };

    this.requireDb()
      .prepare("UPDATE project_board_cards SET status = ?, proof_review_json = ?, run_feedback_json = ?, updated_at = ? WHERE id = ?")
      .run(next.cardStatus, next.proofReviewJson, JSON.stringify(runFeedback), now, current.id);
    this.requireDb()
      .prepare("UPDATE orchestration_tasks SET state = ?, updated_at = ? WHERE id = ?")
      .run(next.taskState, now, task.id);
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, current.boardId);
    if (decisionFeedback.length > 0) {
      const updated = this.getProjectBoardCard(current.id);
      this.updateOrchestrationTask({
        id: task.id,
        description: this.projectBoardCardTaskDescription(updated),
      });
    }
    this.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: next.eventTitle,
      summary: next.eventSummary,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        taskId: task.id,
        action: input.action,
        reason,
        previousProofReviewStatus: previousReview?.status,
        previousRecommendedAction: previousReview?.recommendedAction,
        previousRunId: previousReview?.runId,
        runFeedback:
          decisionFeedback[0]
            ? {
                id: decisionFeedback[0].id,
                source: decisionFeedback[0].source,
                decisionQuestion: decisionFeedback[0].decisionQuestion,
                modelCallRequired: false,
              }
            : undefined,
        runFeedbackItems:
          decisionFeedback.length > 1
            ? decisionFeedback.map((feedback) => ({
                id: feedback.id,
                source: feedback.source,
                decisionQuestion: feedback.decisionQuestion,
                modelCallRequired: false,
              }))
            : undefined,
      },
      createdAt: now,
    });
    this.syncProjectBoardCardsForLinkedTasks();
    return this.getProjectBoardCard(current.id);
  }

  async resolveProjectBoardDeliverableIntegration(input: {
    boardId: string;
    runId: string;
    action: ProjectBoardDeliverableIntegrationAction;
    reason?: string;
  }): Promise<void> {
    const board = this.getProjectBoard(input.boardId);
    if (!board) throw new Error("Project board not found.");
    const run = this.getOrchestrationRun(input.runId);
    const card = board.cards.find((candidate) => candidate.orchestrationTaskId === run.taskId);
    if (!card) throw new Error("Deliverable integration requires a project board card linked to the Local Task run.");
    const manifest = projectBoardDeliverableManifestFromRun(run, { cardId: card.id, cardTitle: card.title });
    const materialFiles = manifest.materialFiles.map((file) => file.path);
    if (input.action !== "defer" && materialFiles.length === 0) {
      throw new Error("No material deliverable files are available to integrate for this run.");
    }

    const now = new Date().toISOString();
    const reason = input.reason?.trim().slice(0, 1000);
    let exportPath: string | undefined;
    let appliedFiles: string[] = [];
    const skippedFiles: string[] = [];

    const copyMaterialFiles = async (destinationRoot: string): Promise<string[]> => {
      const copied: string[] = [];
      for (const file of manifest.materialFiles) {
        const source = projectBoardResolveInside(run.workspacePath, file.path);
        const destination = projectBoardResolveInside(destinationRoot, file.path);
        try {
          const sourceStats = await stat(source);
          if (!sourceStats.isFile()) {
            skippedFiles.push(file.path);
            continue;
          }
          await mkdir(dirname(destination), { recursive: true });
          await copyFile(source, destination);
          copied.push(file.path);
        } catch {
          skippedFiles.push(file.path);
        }
      }
      return copied;
    };

    if (input.action === "apply_to_root") {
      appliedFiles = await copyMaterialFiles(board.projectPath);
      if (appliedFiles.length === 0) throw new Error("No material deliverable files could be copied from the task workspace.");
    } else if (input.action === "export_bundle") {
      exportPath = join(board.projectPath, ".ambient", "project-board", "deliverable-bundles", run.id);
      await mkdir(exportPath, { recursive: true });
      appliedFiles = await copyMaterialFiles(join(exportPath, "files"));
      if (appliedFiles.length === 0) throw new Error("No material deliverable files could be exported from the task workspace.");
      await writeFile(
        join(exportPath, "manifest.json"),
        `${JSON.stringify({ ...manifest, integration: { action: input.action, exportedAt: now, filesRoot: join(exportPath, "files") } }, null, 2)}\n`,
        "utf8",
      );
    }

    const status =
      input.action === "apply_to_root" ? "integrated" : input.action === "export_bundle" ? "exported" : "deferred";
    this.appendProjectBoardEvent({
      boardId: board.id,
      kind: "deliverable_integration_resolved",
      title:
        input.action === "apply_to_root"
          ? "Deliverables applied to project root"
          : input.action === "export_bundle"
            ? "Deliverables exported as artifact bundle"
            : "Deliverable integration deferred",
      summary:
        input.action === "defer"
          ? `${card.title} deliverables were deferred${reason ? `: ${reason}` : "."}`
          : `${appliedFiles.length} material deliverable file${appliedFiles.length === 1 ? "" : "s"} ${
              input.action === "apply_to_root" ? "applied to the project root" : "exported to an artifact bundle"
            }.`,
      entityKind: "orchestration_run",
      entityId: run.id,
      metadata: {
        action: input.action,
        status,
        boardId: board.id,
        cardId: card.id,
        taskId: run.taskId,
        runId: run.id,
        workspacePath: run.workspacePath,
        projectPath: board.projectPath,
        exportPath,
        reason,
        materialFiles,
        excludedFiles: manifest.excludedFiles.map((file) => file.path),
        appliedFiles,
        skippedFiles,
        commands: manifest.commands,
        commits: manifest.commits,
        dependencyImports: manifest.dependencyImports,
      },
      createdAt: now,
    });
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, board.id);
  }

  resolveProjectBoardSplitDecision(input: { cardId: string; action: ProjectBoardSplitDecisionAction; reason?: string }): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    const splitOutcome = current.splitOutcome;
    if (!splitOutcome) throw new Error("This project board card does not have a split outcome to resolve.");
    const task = current.orchestrationTaskId ? this.getOrchestrationTask(current.orchestrationTaskId) : undefined;
    const activeRun = task
      ? this.listOrchestrationRuns(200).find((run) => run.taskId === task.id && ["claimed", "prepared", "preparing", "running", "retry_queued"].includes(run.status))
      : undefined;
    if (activeRun) throw new Error("Wait for the active card run to finish before resolving this split.");
    if (current.status === "done" || task?.state === "done") throw new Error("This split has already been closed.");

    const now = new Date().toISOString();
    const reason = input.reason?.trim().slice(0, 1000);
    const childCards = splitOutcome.childCardIds.map((id) => this.tryGetProjectBoardCard(id)).filter((card): card is ProjectBoardCard => Boolean(card));
    const childIds = childCards.map((card) => card.id);
    const rejectDraftChildren = () => {
      if (childIds.length === 0) return;
      const placeholders = childIds.map(() => "?").join(", ");
      this.requireDb()
        .prepare(
          `UPDATE project_board_cards
           SET candidate_status = 'rejected', updated_at = ?
           WHERE id IN (${placeholders}) AND orchestration_task_id IS NULL AND status = 'draft'`,
        )
        .run(now, ...childIds);
    };
    const updateTaskState = (state: string) => {
      if (!task) throw new Error("This split decision requires a ticketized project board card.");
      this.requireDb().prepare("UPDATE orchestration_tasks SET state = ?, updated_at = ? WHERE id = ?").run(state, now, task.id);
    };
    const updatedOutcome = (status: ProjectBoardCardSplitOutcomeStatus): ProjectBoardCardSplitOutcome => ({
      ...splitOutcome,
      status,
      updatedAt: now,
    });
    const closureReview = (
      status: ProjectBoardCardSplitOutcomeStatus,
      summary: string,
      recommendedAction: ProjectBoardCardProofRecommendedAction = "close",
    ): ProjectBoardCardProofReview => ({
      status: "done",
      summary,
      satisfied: [
        ...new Set([
          ...(current.proofReview?.satisfied ?? []),
          status === "done_via_split" ? "Split follow-ups were completed before the parent was closed." : "Parent was replaced by split follow-up cards.",
        ]),
      ],
      missing: [],
      followUpCardIds: splitOutcome.childCardIds,
      runId: current.proofReview?.runId ?? splitOutcome.sourceRunId,
      reviewedAt: now,
      reviewer: current.proofReview?.reviewer,
      model: current.proofReview?.model,
      confidence: current.proofReview?.confidence,
      evidenceQuality: current.proofReview?.evidenceQuality,
      recommendedAction,
      deterministicStatus: current.proofReview?.deterministicStatus,
      deterministicSummary: current.proofReview?.deterministicSummary,
      judgeDurationMs: current.proofReview?.judgeDurationMs,
    });
    const childIsTerminal = (child: ProjectBoardCard): boolean =>
      child.status === "done" || child.candidateStatus === "evidence" || child.candidateStatus === "duplicate";

    let nextCardStatus: ProjectBoardCardStatus = current.status;
    let nextProofReviewJson: string | null = current.proofReview ? JSON.stringify(current.proofReview) : null;
    let nextSplitOutcome = splitOutcome;
    let eventTitle = "Split decision recorded";
    let eventSummary = `${current.title} split decision was updated.`;

    if (input.action === "approve_split") {
      nextSplitOutcome = updatedOutcome("approved");
      eventTitle = "Split follow-ups approved";
      eventSummary = `${current.title} follow-up split was approved for separate execution.`;
    } else if (input.action === "reject_split") {
      rejectDraftChildren();
      nextSplitOutcome = updatedOutcome("rejected");
      eventTitle = "Split follow-ups rejected";
      eventSummary = `${current.title} follow-up split was rejected; unticketized split children were moved out of execution.`;
    } else if (input.action === "retry_original") {
      updateTaskState("ready");
      rejectDraftChildren();
      nextCardStatus = "ready";
      nextProofReviewJson = null;
      nextSplitOutcome = updatedOutcome("rejected");
      eventTitle = "Original card queued for retry";
      eventSummary = `${current.title} returned to Ready and split follow-ups were rejected.`;
    } else if (input.action === "merge_followups") {
      updateTaskState("ready");
      rejectDraftChildren();
      const mergedCriteria = normalizeCardTextList(
        [
          ...current.acceptanceCriteria,
          ...splitOutcome.remainingCriteria,
          ...childCards.flatMap((child) => child.acceptanceCriteria),
        ],
        30,
      );
      const mergedLabels = normalizeTaskLabels([...current.labels, ...childCards.flatMap((child) => child.labels), "merged-follow-up"]);
      this.requireDb()
        .prepare("UPDATE project_board_cards SET acceptance_criteria_json = ?, labels_json = ? WHERE id = ?")
        .run(JSON.stringify(mergedCriteria), JSON.stringify(mergedLabels), current.id);
      nextCardStatus = "ready";
      nextProofReviewJson = null;
      nextSplitOutcome = updatedOutcome("rejected");
      eventTitle = "Split follow-ups merged into parent";
      eventSummary = `${current.title} returned to Ready with follow-up criteria merged back into the original card.`;
    } else if (input.action === "mark_replaced") {
      updateTaskState("done");
      nextCardStatus = "done";
      nextSplitOutcome = updatedOutcome("replaced");
      nextProofReviewJson = JSON.stringify(
        closureReview(
          "replaced",
          `${current.title} was closed as replaced by split follow-up cards.${reason ? ` Reason: ${reason}` : ""}`,
        ),
      );
      eventTitle = "Parent closed as replaced";
      eventSummary = `${current.title} was marked replaced by split follow-up cards.`;
    } else {
      if (childCards.length === 0 || childCards.length !== splitOutcome.childCardIds.length) {
        throw new Error("All split follow-up cards must be present before closing the parent as done via split.");
      }
      const openChildren = childCards.filter((child) => !childIsTerminal(child));
      if (openChildren.length > 0) {
        throw new Error(`Finish or mark represented split follow-up cards before closing the parent: ${openChildren.map((child) => child.title).join(", ")}`);
      }
      updateTaskState("done");
      nextCardStatus = "done";
      nextSplitOutcome = updatedOutcome("done_via_split");
      nextProofReviewJson = JSON.stringify(
        closureReview(
          "done_via_split",
          `${current.title} was closed after its split follow-up cards reached terminal states.${reason ? ` Reason: ${reason}` : ""}`,
        ),
      );
      eventTitle = "Parent closed via split";
      eventSummary = `${current.title} was closed because its split follow-up cards are complete or represented.`;
    }

    this.requireDb()
      .prepare("UPDATE project_board_cards SET status = ?, proof_review_json = ?, split_outcome_json = ?, updated_at = ? WHERE id = ?")
      .run(nextCardStatus, nextProofReviewJson, JSON.stringify(nextSplitOutcome), now, current.id);
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, current.boardId);
    this.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_split",
      title: eventTitle,
      summary: eventSummary,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        taskId: task?.id,
        action: input.action,
        reason,
        splitOutcomeStatus: nextSplitOutcome.status,
        sourceRunId: splitOutcome.sourceRunId,
        childCardIds: splitOutcome.childCardIds,
      },
      createdAt: now,
    });
    this.syncProjectBoardTaskBlockers(current.boardId);
    this.syncProjectBoardCardsForLinkedTasks();
    return this.getProjectBoardCard(current.id);
  }

  ensureProjectBoardCardExecutionThreadForTask(input: { taskId: string; workspacePath: string }): ThreadSummary | undefined {
    const row = this.requireDb()
      .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1")
      .get(input.taskId) as ProjectBoardCardRow | undefined;
    if (!row) return undefined;

    const policy = normalizeProjectBoardCardExecutionSessionPolicy(row.execution_session_policy);
    if (policy === "reuse_card_session" && row.execution_thread_id) {
      const existing = this.tryGetThread(row.execution_thread_id);
      if (existing) return existing;
    }

    const task = this.getOrchestrationTask(input.taskId);
    const previousThreadId = row.execution_thread_id ?? undefined;
    const thread = this.createThread(`${task.identifier}: ${row.title}`, input.workspacePath);
    const now = new Date().toISOString();
    this.requireDb()
      .prepare("UPDATE project_board_cards SET execution_thread_id = ?, execution_session_policy = ?, updated_at = ? WHERE id = ?")
      .run(thread.id, policy, now, row.id);
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, row.board_id);
    this.appendProjectBoardEvent({
      boardId: row.board_id,
      kind: "card_execution_session_assigned",
      title: "Card execution session assigned",
      summary:
        policy === "reuse_card_session"
          ? `${row.title} will reuse one Pi session across retries and focus passes.`
          : `${row.title} will start fresh Pi context for each prepared run.`,
      entityKind: "project_board_card",
      entityId: row.id,
      metadata: { cardId: row.id, taskId: input.taskId, executionThreadId: thread.id, previousThreadId, executionSessionPolicy: policy },
      createdAt: now,
    });
    return thread;
  }

  copyProjectBoardSessionToThread(input: CopyProjectBoardSessionToThreadInput): ThreadSummary {
    const card = this.getProjectBoardCard(input.cardId);
    if (!card.orchestrationTaskId) {
      throw new Error("Only ticketized project-board cards can copy Pi sessions into local threads.");
    }
    const run = this.getOrchestrationRun(input.runId);
    if (run.taskId !== card.orchestrationTaskId) {
      throw new Error("This Pi session run does not belong to the selected board card.");
    }
    if (!run.threadId) {
      throw new Error("This Pi session run has no transcript thread to copy.");
    }
    if (!projectBoardRunStatusCanCopySession(run.status)) {
      throw new Error("Copy Session to Thread is available only after a Pi session is paused, stopped, failed, stalled, canceled, or completed.");
    }

    const sourceThread = this.getThread(run.threadId);
    const fork = this.forkThread(sourceThread.id, this.getWorkspace().path);
    const title = `Session copy: ${card.title}`;
    this.updateThreadTitle(fork.id, title);
    const now = new Date().toISOString();
    this.addMessage({
      threadId: fork.id,
      role: "system",
      content:
        `Copied from project-board card "${card.title}" after run ${run.id} reached ${run.status}. ` +
        "This is a local project thread; the original Pi session remains attached to the board run.",
      metadata: {
        kind: "project_board_session_copy",
        cardId: card.id,
        boardId: card.boardId,
        runId: run.id,
        taskId: run.taskId,
        sourceThreadId: sourceThread.id,
        copiedAt: now,
      },
    });
    const copied = this.getThread(fork.id);
    this.appendProjectBoardEvent({
      boardId: card.boardId,
      kind: "card_run_handoff_created",
      title: "Pi session copied to local thread",
      summary: `${card.title} now has a local follow-up thread copied from its ${run.status} Pi session.`,
      entityKind: "orchestration_run",
      entityId: run.id,
      metadata: {
        cardId: card.id,
        taskId: run.taskId,
        runId: run.id,
        sourceThreadId: sourceThread.id,
        copiedThreadId: copied.id,
        copiedAt: now,
      },
      createdAt: now,
    });
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, card.boardId);
    return copied;
  }

  recordProjectBoardExecutionReadinessBlocker(input: {
    boardId: string;
    source: "auto_dispatch" | "manual_prepare";
    blocker: "missing_workflow" | "invalid_workflow" | "auto_dispatch_disabled" | "auto_dispatch_error" | "prepare_error";
    title: string;
    summary: string;
    workflowPath?: string;
    error?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): { board: ProjectBoardSummary; recorded: boolean } {
    const board = this.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = input.createdAt ?? new Date().toISOString();
    const error = input.error?.trim().slice(0, 1_000) || undefined;
    const dedupeKey = [
      input.source,
      input.blocker,
      input.workflowPath?.trim() || "",
      error ?? input.summary.trim().slice(0, 500),
    ].join(":");
    const latest = this.listProjectBoardEvents(input.boardId, 1)[0];
    if (latest?.kind === "execution_readiness_blocked" && latest.metadata?.dedupeKey === dedupeKey) {
      return { board, recorded: false };
    }

    const transaction = this.requireDb().transaction(() => {
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "execution_readiness_blocked",
        title: input.title,
        summary: input.summary,
        entityKind: "project_board",
        entityId: input.boardId,
        metadata: {
          ...input.metadata,
          source: input.source,
          blocker: input.blocker,
          workflowPath: input.workflowPath,
          error,
          dedupeKey,
        },
        createdAt: now,
      });
    });
    transaction();
    return { board: this.getProjectBoard(input.boardId) ?? board, recorded: true };
  }

  recordProjectBoardWorkflowCreated(input: {
    boardId: string;
    workflowPath: string;
    workflowHash?: string;
    source: "auto_dispatch" | "manual_prepare" | "preparation" | "scheduled_preparation";
    workspaceStrategy?: "git-worktree" | "directory";
    autoDispatch?: boolean;
    maxConcurrentAgents?: number;
    createdAt?: string;
  }): { board: ProjectBoardSummary; recorded: boolean } {
    const board = this.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = input.createdAt ?? new Date().toISOString();
    const workflowPath = input.workflowPath.trim();
    const dedupeKey = [input.source, workflowPath].join(":");
    const latest = this.listProjectBoardEvents(input.boardId, 1)[0];
    if (latest?.kind === "workflow_created" && latest.metadata?.dedupeKey === dedupeKey) {
      return { board, recorded: false };
    }

    const transaction = this.requireDb().transaction(() => {
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "workflow_created",
        title: "Default WORKFLOW.md created",
        summary: `Ambient created ${workflowPath} with ${input.workspaceStrategy ?? "default"} workspace strategy for Local Task dispatch.`,
        entityKind: "project_board",
        entityId: input.boardId,
        metadata: {
          source: input.source,
          workflowPath,
          workflowHash: input.workflowHash,
          workspaceStrategy: input.workspaceStrategy,
          autoDispatch: input.autoDispatch,
          maxConcurrentAgents: input.maxConcurrentAgents,
          dedupeKey,
        },
        createdAt: now,
      });
    });
    transaction();
    return { board: this.getProjectBoard(input.boardId) ?? board, recorded: true };
  }

  recordProjectBoardWorkflowRepair(input: {
    boardId: string;
    action: "restore_generated_default" | "use_existing_anyway";
    workflowPath: string;
    workflowHash?: string;
    previousWorkflowHash?: string;
    backupPath?: string;
    status: "ready" | "missing" | "invalid";
    message?: string;
    createdAt?: string;
  }): { board: ProjectBoardSummary; recorded: boolean } {
    const board = this.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = input.createdAt ?? new Date().toISOString();
    const workflowPath = input.workflowPath.trim();
    const restored = input.action === "restore_generated_default";
    const title = restored ? "WORKFLOW.md restored to generated default" : "Invalid WORKFLOW.md kept after review";
    const summary = restored
      ? `Ambient backed up the existing workflow and restored a generated default at ${workflowPath}.`
      : `The existing workflow at ${workflowPath} was kept. Local Task preparation remains blocked until validation passes.`;

    const transaction = this.requireDb().transaction(() => {
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "workflow_repaired",
        title,
        summary,
        entityKind: "project_board",
        entityId: input.boardId,
        metadata: {
          action: input.action,
          workflowPath,
          workflowHash: input.workflowHash,
          previousWorkflowHash: input.previousWorkflowHash,
          backupPath: input.backupPath,
          status: input.status,
          message: input.message,
          modelCallRequired: false,
        },
        createdAt: now,
      });
    });
    transaction();
    return { board: this.getProjectBoard(input.boardId) ?? board, recorded: true };
  }

  recordProjectBoardWorkflowSettingsUpdated(input: {
    boardId: string;
    workflowPath: string;
    workflowHash?: string;
    previousWorkflowHash?: string;
    backupPath?: string;
    changedFields: string[];
    diff?: string;
    status: "ready" | "missing" | "invalid";
    message?: string;
    createdAt?: string;
  }): { board: ProjectBoardSummary; recorded: boolean } {
    const board = this.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = input.createdAt ?? new Date().toISOString();
    const workflowPath = input.workflowPath.trim();
    const changedFields = [...new Set(input.changedFields.map((field) => field.trim()).filter(Boolean))].sort();
    const transaction = this.requireDb().transaction(() => {
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "workflow_settings_updated",
        title: "WORKFLOW.md settings updated",
        summary:
          changedFields.length > 0
            ? `Updated ${changedFields.join(", ")} in ${workflowPath}.`
            : `Reviewed ${workflowPath}; no guided workflow settings changed.`,
        entityKind: "project_board",
        entityId: input.boardId,
        metadata: {
          workflowPath,
          workflowHash: input.workflowHash,
          previousWorkflowHash: input.previousWorkflowHash,
          backupPath: input.backupPath,
          changedFields,
          diff: input.diff,
          status: input.status,
          message: input.message,
          modelCallRequired: false,
        },
        createdAt: now,
      });
    });
    transaction();
    return { board: this.getProjectBoard(input.boardId) ?? board, recorded: true };
  }

  recordProjectBoardWorkflowRawUpdated(input: {
    boardId: string;
    workflowPath: string;
    workflowHash?: string;
    previousWorkflowHash?: string;
    backupPath?: string;
    changed: boolean;
    diff?: string;
    status: "ready" | "missing" | "invalid";
    message?: string;
    createdAt?: string;
  }): { board: ProjectBoardSummary; recorded: boolean } {
    const board = this.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = input.createdAt ?? new Date().toISOString();
    const workflowPath = input.workflowPath.trim();
    const transaction = this.requireDb().transaction(() => {
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "workflow_raw_updated",
        title:
          input.status === "ready"
            ? input.changed
              ? "WORKFLOW.md raw edit saved"
              : "WORKFLOW.md raw edit reviewed"
            : "WORKFLOW.md raw edit rejected",
        summary:
          input.status === "ready"
            ? input.changed
              ? `Saved validated raw WORKFLOW.md changes to ${workflowPath}.`
              : `Reviewed ${workflowPath}; no raw workflow changes were saved.`
            : `Raw WORKFLOW.md edit was not saved because validation failed: ${input.message ?? "validation failed"}.`,
        entityKind: "project_board",
        entityId: input.boardId,
        metadata: {
          workflowPath,
          workflowHash: input.workflowHash,
          previousWorkflowHash: input.previousWorkflowHash,
          backupPath: input.backupPath,
          changed: input.changed,
          diff: input.diff,
          status: input.status,
          message: input.message,
          modelCallRequired: false,
          existingCardsRewritten: false,
        },
        createdAt: now,
      });
    });
    transaction();
    return { board: this.getProjectBoard(input.boardId) ?? board, recorded: true };
  }

  resolveProjectBoardWorkflowImpact(input: {
    boardId: string;
    action: ResolveOrchestrationWorkflowImpactAction;
    runIds: string[];
    workflowPath?: string;
    workflowHash?: string;
    createdAt?: string;
  }): { clearedRunIds: string[]; skippedRuns: { runId: string; reason: string }[] } {
    const board = this.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = input.createdAt ?? new Date().toISOString();
    const runIds = [...new Set(input.runIds.map((runId) => runId.trim()).filter(Boolean))].slice(0, 100);
    if (runIds.length === 0) throw new Error("Workflow impact resolution requires at least one run id.");

    const clearedRunIds: string[] = [];
    const skippedRuns: { runId: string; reason: string }[] = [];
    const affectedRunIds: string[] = [];
    const affectedTaskIds: string[] = [];
    const affectedCardIds: string[] = [];
    const skippedReasons: Record<string, string> = {};

    for (const runId of runIds) {
      let run: OrchestrationRun;
      try {
        run = this.getOrchestrationRun(runId);
      } catch {
        skippedRuns.push({ runId, reason: "run_not_found" });
        skippedReasons[runId] = "run_not_found";
        continue;
      }
      const card = this.getProjectBoardCardForOrchestrationTask(run.taskId);
      if (!card || card.boardId !== input.boardId) {
        skippedRuns.push({ runId, reason: "run_not_linked_to_board" });
        skippedReasons[runId] = "run_not_linked_to_board";
        continue;
      }
      affectedRunIds.push(run.id);
      affectedTaskIds.push(run.taskId);
      affectedCardIds.push(card.id);

      if (input.action === "prepare_again") {
        if (run.status === "prepared" || run.status === "retry_queued") {
          this.updateOrchestrationRun({
            id: run.id,
            status: "canceled",
            error: "Cleared so this Local Task can be prepared again under the current WORKFLOW.md.",
            proofOfWork: {
              ...(run.proofOfWork ?? {}),
              workflowImpact: {
                action: input.action,
                clearedAt: now,
                workflowPath: input.workflowPath,
                workflowHash: input.workflowHash,
                previousStatus: run.status,
              },
            },
            finish: true,
            reviewProjectBoardProof: false,
          });
          clearedRunIds.push(run.id);
          continue;
        }
        const reason = ["claimed", "preparing", "running"].includes(run.status) ? "run_active" : "run_not_blocking_preparation";
        skippedRuns.push({ runId: run.id, reason });
        skippedReasons[run.id] = reason;
      }
    }

    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
    this.appendProjectBoardEvent({
      boardId: input.boardId,
      kind: "workflow_impact_resolved",
      title: input.action === "prepare_again" ? "Workflow impact prepare-again selected" : "Workflow impact old preparation kept",
      summary:
        input.action === "prepare_again"
          ? `${clearedRunIds.length} stale prepared run${clearedRunIds.length === 1 ? "" : "s"} cleared; ${skippedRuns.length} skipped. Fresh preparation can now use the current WORKFLOW.md.`
          : `${affectedRunIds.length} prepared run${affectedRunIds.length === 1 ? "" : "s"} kept under existing preparation. Future preparation will use the current WORKFLOW.md.`,
      entityKind: "project_board",
      entityId: input.boardId,
      metadata: {
        action: input.action,
        workflowPath: input.workflowPath,
        workflowHash: input.workflowHash,
        affectedRunIds: [...new Set(affectedRunIds)],
        affectedTaskIds: [...new Set(affectedTaskIds)],
        affectedCardIds: [...new Set(affectedCardIds)],
        clearedRunIds,
        skippedRunIds: skippedRuns.map((skipped) => skipped.runId),
        skippedRuns,
        skippedReasons,
        modelCallRequired: false,
      },
      createdAt: now,
    });

    return { clearedRunIds, skippedRuns };
  }

  approveProjectBoardCard(cardId: string): ProjectBoardCard {
    const current = this.getProjectBoardCard(cardId);
    if (current.status !== "draft" && current.status !== "blocked") return current;
    if (current.candidateStatus !== "ready_to_create") {
      throw new Error("Only ready-to-create board candidates can be approved.");
    }
    this.assertProjectBoardCardProofReady(current);
    this.assertProjectBoardCardClarificationsResolved(current);
    this.assertProjectBoardCardClaimAllowsLocalTicketization(current);
    this.assertProjectBoardRunFollowUpStillActionable(current);
    this.assertProjectBoardUxMockGateOpen(current, this.listProjectBoardCards(current.boardId));
    const now = new Date().toISOString();
    const taskId = current.orchestrationTaskId ?? this.createTaskForProjectBoardCard(current).id;
    this.requireDb()
      .prepare("UPDATE project_board_cards SET status = 'ready', orchestration_task_id = ?, updated_at = ? WHERE id = ?")
      .run(taskId, now, cardId);
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, current.boardId);
    this.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_ticketized",
      title: "Card ticketized",
      summary: `${current.title} was approved into a ready Local Task.`,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: { cardId: current.id, taskId, sourceKind: current.sourceKind, sourceId: current.sourceId },
      createdAt: now,
    });
    this.syncProjectBoardTaskBlockers(current.boardId);
    this.syncProjectBoardCardsForLinkedTasks();
    return this.getProjectBoardCard(cardId);
  }

  createReadyProjectBoardTasks(boardId: string): ProjectBoardCard[] {
    const board = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardRow | undefined;
    if (!board) throw new Error(`Project board not found: ${boardId}`);
    if (board.status === "archived") throw new Error("Archived project boards cannot create ready tasks.");
    if (board.status !== "active") throw new Error("Project board charter must be active before creating ready tasks.");
    const runningSynthesis = this.getRunningProjectBoardSynthesisRun(boardId);
    if (runningSynthesis) {
      throw new Error("Project board planning is still running; wait for it to finish or pause before creating ready tasks.");
    }
    const boardCards = this.listProjectBoardCards(boardId);
    const eligible = boardCards.filter(
      (card) => card.status === "draft" && !card.orchestrationTaskId && card.candidateStatus === "ready_to_create",
    ).filter(
      (card) => !projectBoardCardBlockedByOpenUxMockGate(card, boardCards),
    ).filter(
      (card) => !projectBoardClosedParentForRunFollowUp(card, boardCards),
    );
    if (eligible.length === 0) return [];
    eligible.forEach((card) => {
      this.assertProjectBoardCardProofReady(card);
      this.assertProjectBoardCardClarificationsResolved(card);
      // Asserted up front with the other gates: claim checks used to run per card
      // inside the (non-transactional) approve loop, so a claimed card mid-list threw
      // after earlier cards were already ticketized — partial work plus an error.
      this.assertProjectBoardCardClaimAllowsLocalTicketization(card);
    });
    const planningSnapshot = this.latestStableProjectBoardPlanningSnapshot(boardId);
    const synthesisEligible = eligible.filter((card) => card.sourceKind === "board_synthesis");
    if (synthesisEligible.length > 0) {
      if (!planningSnapshot) {
        throw new Error("Board synthesis cards require a completed or paused planning snapshot before creating ready tasks.");
      }
      const snapshotCardIds = new Set(planningSnapshot.snapshot.cardIds);
      const missingSnapshotCards = synthesisEligible.filter((card) => !snapshotCardIds.has(card.id));
      if (missingSnapshotCards.length > 0) {
        throw new Error(
          `${missingSnapshotCards.length} ready synthesis card${missingSnapshotCards.length === 1 ? " is" : "s are"} not part of the latest stable planning snapshot; pause or complete planning before creating ready tasks.`,
        );
      }
    }
    const ticketized = eligible.map((card) => this.approveProjectBoardCard(card.id));
    this.syncProjectBoardTaskBlockers(boardId);
    this.syncProjectBoardCardsForLinkedTasks();
    const now = new Date().toISOString();
    this.appendProjectBoardEvent({
      boardId,
      kind: "ready_tasks_created",
      title: "Ready tasks created",
      summary: `${ticketized.length} ready candidate card${ticketized.length === 1 ? "" : "s"} became Local Tasks.`,
      entityKind: "project_board",
      entityId: boardId,
      metadata: {
        cardIds: ticketized.map((card) => card.id),
        taskIds: ticketized.map((card) => card.orchestrationTaskId).filter(Boolean),
        ...(planningSnapshot
          ? {
              planningSnapshotId: planningSnapshot.snapshot.id,
              planningSnapshotRunId: planningSnapshot.runId,
              planningSnapshotKind: planningSnapshot.snapshot.kind,
              planningSnapshotFingerprint: planningSnapshot.snapshot.renderFingerprint,
              planningSnapshotCardIds: planningSnapshot.snapshot.cardIds,
            }
          : {}),
      },
      createdAt: now,
    });
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, boardId);
    return ticketized.map((card) => this.getProjectBoardCard(card.id));
  }

  private assertProjectBoardCardClaimAllowsLocalTicketization(card: ProjectBoardCard): void {
    const claims = projectBoardClaimSummaryFromEvents(this.listProjectBoardEvents(card.boardId));
    const conflicts = claims.conflicts.filter((claim) => claim.cardId === card.id);
    if (conflicts.length > 0) {
      throw new Error(`Project board card ${card.title} has ${conflicts.length} claim conflict${conflicts.length === 1 ? "" : "s"}. Pull the board and resolve ownership before creating a Local Task.`);
    }
    const activeClaim = claims.active.find((claim) => claim.cardId === card.id);
    if (!activeClaim || activeClaim.ownedByLocal) return;
    throw new Error(
      `Project board card ${card.title} is claimed by ${activeClaim.displayName || activeClaim.agentId} until ${
        activeClaim.leaseUntil ?? "the lease expires"
      }. Pull the board, wait for expiry, or release the claim before creating a Local Task.`,
    );
  }

  splitProjectBoardCard(cardId: string): ProjectBoardCard[] {
    const current = this.getProjectBoardCard(cardId);
    if (current.orchestrationTaskId || current.status !== "draft") {
      throw new Error("Only unticketized draft board candidates can be split.");
    }
    const criteria = normalizeCardTextList(current.acceptanceCriteria, 12);
    if (criteria.length < 2) throw new Error("A candidate needs at least two acceptance criteria before it can be split.");
    const existing = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE board_id = ? AND source_kind = ? AND source_id LIKE ?
         ORDER BY created_at ASC`,
      )
      .all(current.boardId, current.sourceKind, `${current.sourceId}#split:%`) as ProjectBoardCardRow[];
    if (existing.length > 0) return existing.map((row) => this.mapProjectBoardCard(row));

    const now = new Date().toISOString();
    const createdIds: string[] = [];
    const transaction = this.requireDb().transaction(() => {
      this.requireDb()
        .prepare("UPDATE project_board_cards SET candidate_status = 'duplicate', updated_at = ? WHERE id = ?")
        .run(now, current.id);
      const insert = this.requireDb().prepare(
        `INSERT INTO project_board_cards
          (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
           acceptance_criteria_json, test_plan_json, source_refs_json, clarification_questions_json, clarification_decisions_json, source_kind, source_id, source_thread_id,
           source_message_id, orchestration_task_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      criteria.forEach((criterion, index) => {
        const id = randomUUID();
        createdIds.push(id);
        const clarificationQuestions = normalizeProjectBoardClarificationQuestions(current.clarificationQuestions ?? [], 8);
        const clarificationDecisions = normalizeProjectBoardClarificationDecisions(current.clarificationDecisions, {
          clarificationQuestions,
          clarificationSuggestions: current.clarificationSuggestions,
          clarificationAnswers: current.clarificationAnswers,
          createdAt: now,
          updatedAt: now,
        });
        insert.run(
          id,
          current.boardId,
          criterion.slice(0, 180),
          splitProjectBoardCardDescription(current, criterion),
          "draft",
          current.candidateStatus === "ready_to_create" ? "ready_to_create" : "needs_clarification",
          current.priority ?? null,
          current.phase ?? null,
          JSON.stringify(normalizeTaskLabels([...current.labels, "split"])),
          JSON.stringify(current.blockedBy),
          JSON.stringify([criterion]),
          JSON.stringify(current.testPlan),
          JSON.stringify(normalizeCardTextList(current.sourceRefs ?? [], 20)),
          JSON.stringify(clarificationQuestions),
          JSON.stringify(clarificationDecisions),
          current.sourceKind,
          `${current.sourceId}#split:${index + 1}`,
          current.sourceThreadId ?? null,
          current.sourceMessageId ?? null,
          null,
          now,
          now,
        );
      });
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, current.boardId);
      this.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "card_split",
        title: "Candidate split",
        summary: `${current.title} was split into ${createdIds.length} draft cards.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: { parentCardId: current.id, childCardIds: createdIds },
        createdAt: now,
      });
    });
    transaction();
    return createdIds.map((id) => this.getProjectBoardCard(id));
  }

  createProjectBoardManualCard(input: { boardId: string; title?: string; description?: string }): ProjectBoardCard {
    const board = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(input.boardId) as ProjectBoardRow | undefined;
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    if (board.status === "archived") throw new Error("Archived project boards cannot accept new cards.");
    const now = new Date().toISOString();
    const id = randomUUID();
    const title = input.title?.trim() || "New draft card";
    const description =
      input.description?.trim() ||
      "Manual draft card. Fill in scope, dependencies, acceptance criteria, and proof before ticketization.";
    const transaction = this.requireDb().transaction(() => {
      this.requireDb()
        .prepare(
          `INSERT INTO project_board_cards
          (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
           acceptance_criteria_json, test_plan_json, source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id,
           created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          board.id,
          title.slice(0, 180),
          description.slice(0, 4000),
          "draft",
          "needs_clarification",
          null,
          null,
          JSON.stringify(["manual"]),
          JSON.stringify([]),
          JSON.stringify(["Define the intended outcome before ticketization."]),
          JSON.stringify({ unit: [], integration: [], visual: [], manual: [] }),
          "manual",
          `manual:${id}`,
          null,
          null,
          null,
          now,
          now,
        );
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, board.id);
      this.appendProjectBoardEvent({
        boardId: board.id,
        kind: "manual_card_created",
        title: "Manual draft card created",
        summary: title.slice(0, 180),
        entityKind: "project_board_card",
        entityId: id,
        metadata: { cardId: id, sourceKind: "manual" },
        createdAt: now,
      });
    });
    transaction();
    return this.getProjectBoardCard(id);
  }

  attachLocalTaskToProjectBoard(input: { taskId: string; mode: "attach" | "evidence" }): ProjectBoardCard {
    const board = this.getActiveProjectBoard();
    if (!board) throw new Error("Build a project board before attaching Local Tasks.");
    const task = this.getOrchestrationTask(input.taskId);
    const existing = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE board_id = ?
           AND (
             orchestration_task_id = ?
             OR (source_kind = 'local_task_import' AND source_id = ?)
           )
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(board.id, task.id, task.id) as ProjectBoardCardRow | undefined;
    if (existing) return this.mapProjectBoardCard(existing, this.listOrchestrationTasks());

    const now = new Date().toISOString();
    const id = randomUUID();
    const attachMode = input.mode === "attach";
    const allTasks = this.listOrchestrationTasks();
    const status: ProjectBoardCardStatus = attachMode ? projectBoardStatusForTask(task, allTasks) : "draft";
    const candidateStatus: ProjectBoardCardCandidateStatus = attachMode ? "ready_to_create" : "evidence";
    const description =
      task.description?.trim() ||
      (attachMode ? "Existing Local Task attached to this project board." : "Existing Local Task imported as completed board evidence.");
    const acceptanceCriteria = attachMode
      ? [`Complete Local Task ${task.identifier}: ${task.title}`]
      : [`Record Local Task ${task.identifier} as evidence for already-scoped work.`];
    const testPlan: ProjectBoardCardTestPlan = attachMode
      ? { unit: [], integration: [], visual: [], manual: ["Review the existing Local Task proof before closing the board card."] }
      : { unit: [], integration: [], visual: [], manual: ["Review imported Local Task history as completed evidence."] };
    this.requireDb()
      .prepare(
        `INSERT INTO project_board_cards
        (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
         acceptance_criteria_json, test_plan_json, source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id,
         created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        board.id,
        task.title,
        description,
        status,
        candidateStatus,
        task.priority ?? null,
        null,
        JSON.stringify(normalizeTaskLabels(["local-task", ...task.labels])),
        JSON.stringify(task.blockedBy),
        JSON.stringify(acceptanceCriteria),
        JSON.stringify(testPlan),
        "local_task_import",
        task.id,
        null,
        null,
        attachMode ? task.id : null,
        now,
        now,
      );
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, board.id);
    this.appendProjectBoardEvent({
      boardId: board.id,
      kind: attachMode ? "local_task_attached" : "local_task_imported_as_evidence",
      title: attachMode ? "Local Task attached" : "Local Task imported as evidence",
      summary: `${task.identifier}: ${task.title}`,
      entityKind: "orchestration_task",
      entityId: task.id,
      metadata: { taskId: task.id, identifier: task.identifier, mode: input.mode, cardId: id },
      createdAt: now,
    });
    this.syncProjectBoardCardsForLinkedTasks();
    return this.getProjectBoardCard(id);
  }

  updateProjectBoardCard(input: {
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
  }): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    if (current.orchestrationTaskId || current.status !== "draft") {
      throw new Error("Project board candidates can only be edited before ticketization.");
    }
    const title = input.title === undefined ? current.title : input.title.trim();
    if (!title) throw new Error("Project board card title cannot be empty.");
    const now = new Date().toISOString();
    const description = input.description === undefined ? current.description : input.description.trim().slice(0, 4000);
    let candidateStatus = input.candidateStatus ?? current.candidateStatus;
    const priority = input.priority === undefined ? (current.priority ?? null) : input.priority === null ? null : Math.max(0, Math.min(100, Math.round(input.priority)));
    const phase = input.phase === undefined ? (current.phase ?? null) : input.phase?.trim() ? input.phase.trim().slice(0, 80) : null;
    const labels = input.labels === undefined ? current.labels : normalizeTaskLabels(input.labels);
    const blockedBy = input.blockedBy === undefined ? current.blockedBy : normalizeTaskReferences(input.blockedBy);
    const acceptanceCriteria =
      input.acceptanceCriteria === undefined ? current.acceptanceCriteria : normalizeCardTextList(input.acceptanceCriteria, 30);
    const testPlan = input.testPlan === undefined ? current.testPlan : normalizeProjectBoardCardTestPlan(input.testPlan);
    const sourceRefs = input.sourceRefs === undefined ? (current.sourceRefs ?? []) : normalizeCardTextList(input.sourceRefs, 20);
    const clarificationQuestions =
      input.clarificationQuestions === undefined
        ? normalizeProjectBoardClarificationQuestions(current.clarificationQuestions ?? [], 8)
        : normalizeProjectBoardClarificationQuestions(input.clarificationQuestions, 8);
    const clarificationSuggestions =
      input.clarificationSuggestions === undefined
        ? current.clarificationSuggestions ?? []
        : normalizeProjectBoardClarificationSuggestions(input.clarificationSuggestions, []);
    const clarificationAnswers =
      input.clarificationAnswers === undefined
        ? current.clarificationAnswers ?? []
        : normalizeProjectBoardClarificationAnswers(input.clarificationAnswers);
    const clarificationInputsChanged =
      input.clarificationQuestions !== undefined ||
      input.clarificationSuggestions !== undefined ||
      input.clarificationAnswers !== undefined ||
      input.clarificationDecisions !== undefined ||
      input.description !== undefined ||
      input.acceptanceCriteria !== undefined;
    const clarificationDecisions =
      input.clarificationDecisions !== undefined
        ? normalizeProjectBoardClarificationDecisions(input.clarificationDecisions, {
            clarificationQuestions,
            clarificationSuggestions,
            clarificationAnswers,
            createdAt: current.createdAt,
            updatedAt: now,
          })
        : clarificationInputsChanged
          ? normalizeProjectBoardClarificationDecisions(current.clarificationDecisions, {
              clarificationQuestions,
              clarificationSuggestions,
              clarificationAnswers,
              createdAt: current.createdAt,
              updatedAt: now,
            })
          : current.clarificationDecisions ?? [];
    if (
      input.candidateStatus === undefined &&
      candidateStatus === "needs_clarification" &&
      (!this.projectBoardRequiresProofSpec(current.boardId) || projectBoardCardProofCount({ ...current, testPlan }) > 0) &&
      projectBoardOpenClarificationQuestions({
        clarificationDecisions,
        clarificationQuestions,
        clarificationSuggestions,
        clarificationAnswers,
        includeInlineQuestions: false,
        limit: 8,
      }).length === 0
    ) {
      candidateStatus = "ready_to_create";
    }
    if (candidateStatus === "ready_to_create") {
      const nextForGates = { ...current, blockedBy, testPlan, clarificationQuestions, clarificationSuggestions, clarificationAnswers, clarificationDecisions };
      this.assertProjectBoardCardProofReady(nextForGates);
      this.assertProjectBoardCardClarificationsResolved(nextForGates);
      this.assertProjectBoardRunFollowUpStillActionable(nextForGates);
    }
    const changedFields = [
      title !== current.title ? "title" : undefined,
      description !== current.description ? "description" : undefined,
      candidateStatus !== current.candidateStatus ? "candidateStatus" : undefined,
      priority !== (current.priority ?? null) ? "priority" : undefined,
      phase !== (current.phase ?? null) ? "phase" : undefined,
      JSON.stringify(labels) !== JSON.stringify(current.labels) ? "labels" : undefined,
      JSON.stringify(blockedBy) !== JSON.stringify(current.blockedBy) ? "dependencies" : undefined,
      JSON.stringify(acceptanceCriteria) !== JSON.stringify(current.acceptanceCriteria) ? "acceptanceCriteria" : undefined,
      JSON.stringify(testPlan) !== JSON.stringify(current.testPlan) ? "testPlan" : undefined,
      JSON.stringify(sourceRefs) !== JSON.stringify(current.sourceRefs ?? []) ? "sourceRefs" : undefined,
      JSON.stringify(clarificationQuestions) !== JSON.stringify(current.clarificationQuestions ?? []) ? "clarificationQuestions" : undefined,
      JSON.stringify(clarificationSuggestions) !== JSON.stringify(current.clarificationSuggestions ?? []) ? "clarificationSuggestions" : undefined,
      JSON.stringify(clarificationAnswers) !== JSON.stringify(current.clarificationAnswers ?? []) ? "clarificationAnswers" : undefined,
      JSON.stringify(clarificationDecisions) !== JSON.stringify(current.clarificationDecisions ?? []) ? "clarificationDecisions" : undefined,
    ].filter((field): field is ProjectBoardCardTouchedField => Boolean(field));
    const touchedFields =
      changedFields.length > 0 ? [...new Set([...(current.userTouchedFields ?? []), ...changedFields])] : current.userTouchedFields ?? [];
    const touchedAt = changedFields.length > 0 ? now : current.userTouchedAt ?? null;
    const changedClarificationAnswer = changedFields.includes("clarificationAnswers")
      ? projectBoardChangedClarificationAnswer(current.clarificationAnswers ?? [], clarificationAnswers)
      : undefined;
    const decisionImpact = changedClarificationAnswer
      ? projectBoardDecisionImpactPreview(this.getProjectBoard(current.boardId), {
          question: changedClarificationAnswer.question,
          answer: changedClarificationAnswer.answer,
          answeredCardId: current.id,
        })
      : undefined;
    this.requireDb()
      .prepare(
        `UPDATE project_board_cards
         SET title = ?,
             description = ?,
             candidate_status = ?,
             priority = ?,
             phase = ?,
             labels_json = ?,
             blocked_by_json = ?,
             acceptance_criteria_json = ?,
             test_plan_json = ?,
             source_refs_json = ?,
             clarification_questions_json = ?,
             clarification_suggestions_json = ?,
             clarification_answers_json = ?,
             clarification_decisions_json = ?,
             user_touched_fields_json = ?,
             user_touched_at = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        title.slice(0, 180),
        description,
        candidateStatus,
        priority,
        phase,
        JSON.stringify(labels),
        JSON.stringify(blockedBy),
        JSON.stringify(acceptanceCriteria),
        JSON.stringify(testPlan),
        JSON.stringify(sourceRefs),
        JSON.stringify(clarificationQuestions),
        JSON.stringify(clarificationSuggestions),
        JSON.stringify(clarificationAnswers),
        JSON.stringify(clarificationDecisions),
        JSON.stringify(touchedFields),
        touchedAt,
        now,
        input.cardId,
      );
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, current.boardId);
    if (changedFields.length > 0) {
      this.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "card_updated",
        title: decisionImpact ? "Clarification decision answered" : "Candidate card updated",
        summary: decisionImpact
          ? projectBoardClarificationDecisionImpactEventSummary(current.title, decisionImpact)
          : `${current.title} updated ${changedFields.join(", ")}.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: {
          cardId: current.id,
          changedFields,
          ...(decisionImpact ? { decisionImpact: projectBoardDecisionImpactEventMetadata(decisionImpact) } : {}),
        },
        createdAt: now,
      });
    }
    if (changedFields.includes("candidateStatus") || changedFields.includes("dependencies")) {
      this.syncProjectBoardTaskBlockers(current.boardId);
      this.syncProjectBoardCardsForLinkedTasks();
    }
    return this.getProjectBoardCard(input.cardId);
  }

  updateProjectBoardCardCandidateStatus(
    cardId: string,
    candidateStatus: ProjectBoardCardCandidateStatus,
    options: { actor?: "user" | "system"; reason?: string; relatedCardId?: string } = {},
  ): ProjectBoardCard {
    const current = this.getProjectBoardCard(cardId);
    if (current.orchestrationTaskId || current.status !== "draft") {
      throw new Error("Candidate status can only be changed before a board card is ticketized.");
    }
    if (candidateStatus === "ready_to_create") {
      this.assertProjectBoardCardProofReady(current);
      this.assertProjectBoardCardClarificationsResolved(current);
      this.assertProjectBoardRunFollowUpStillActionable(current);
    }
    const now = new Date().toISOString();
    const changed = current.candidateStatus !== candidateStatus;
    // System-driven changes (e.g. the post-planning consolidation pass) must not claim
    // the user-touched protection that shields fields from later automated updates.
    const touchedByUser = changed && options.actor !== "system";
    const touchedFields = touchedByUser ? [...new Set([...(current.userTouchedFields ?? []), "candidateStatus" satisfies ProjectBoardCardTouchedField])] : current.userTouchedFields ?? [];
    const touchedAt = touchedByUser ? now : current.userTouchedAt ?? null;
    this.requireDb()
      .prepare(
        `UPDATE project_board_cards
         SET candidate_status = ?,
             user_touched_fields_json = ?,
             user_touched_at = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(candidateStatus, JSON.stringify(touchedFields), touchedAt, now, cardId);
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, current.boardId);
    if (changed) {
      this.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "candidate_status_changed",
        title: "Candidate status changed",
        summary: `${current.title} moved from ${current.candidateStatus} to ${candidateStatus}.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: {
          cardId: current.id,
          from: current.candidateStatus,
          to: candidateStatus,
          ...(options.actor ? { actor: options.actor } : {}),
          ...(options.reason ? { reason: options.reason } : {}),
          ...(options.relatedCardId ? { relatedCardId: options.relatedCardId } : {}),
        },
        createdAt: now,
      });
      this.syncProjectBoardTaskBlockers(current.boardId);
      this.syncProjectBoardCardsForLinkedTasks();
    }
    return this.getProjectBoardCard(cardId);
  }

  resolveProjectBoardCardPiUpdate(input: { cardId: string; action: "apply" | "ignore" }): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    if (!current.pendingPiUpdate) return current;
    if (current.orchestrationTaskId || current.status !== "draft") {
      throw new Error("Pi update suggestions can only be resolved before ticketization.");
    }
    const now = new Date().toISOString();
    if (input.action === "ignore") {
      this.requireDb()
        .prepare("UPDATE project_board_cards SET pending_pi_update_json = NULL, updated_at = ? WHERE id = ?")
        .run(now, input.cardId);
      this.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "card_updated",
        title: "Pi update ignored",
        summary: `${current.title} kept the user-owned card fields.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: { cardId: current.id, sourceId: current.pendingPiUpdate.sourceId, action: "ignore" },
        createdAt: now,
      });
      return this.getProjectBoardCard(input.cardId);
    }

    const update = current.pendingPiUpdate;
    const title = update.title ?? current.title;
    const description = update.description ?? current.description;
    const priority = update.priority ?? current.priority ?? null;
    const phase = update.phase ?? current.phase ?? null;
    const labels = update.labels ?? current.labels;
    const blockedBy = update.blockedBy ?? current.blockedBy;
    const acceptanceCriteria = update.acceptanceCriteria ?? current.acceptanceCriteria;
    const testPlan = update.testPlan ?? current.testPlan;
    const sourceRefs = update.sourceRefs ?? current.sourceRefs ?? [];
    const clarificationAnswers = normalizeProjectBoardClarificationAnswers(update.clarificationAnswers ?? current.clarificationAnswers ?? []);
    const normalizedClarification = normalizeProjectBoardSynthesisClarificationFields({
      clarificationQuestions: update.clarificationQuestions ?? current.clarificationQuestions ?? [],
      clarificationSuggestions: update.clarificationSuggestions ?? current.clarificationSuggestions ?? [],
      clarificationAnswers,
      clarificationDecisions: update.clarificationDecisions ?? current.clarificationDecisions,
      createdAt: current.createdAt,
      updatedAt: now,
    });
    const clarificationQuestions = normalizedClarification.clarificationQuestions;
    const clarificationSuggestions = normalizedClarification.clarificationSuggestions;
    const clarificationDecisions = normalizedClarification.clarificationDecisions;
    const candidateStatus = update.candidateStatus
      ? projectBoardCandidateStatusForSynthesisUpdate(update.candidateStatus, current.candidateStatus, clarificationDecisions)
      : current.candidateStatus;
    const objectiveProvenance = update.objectiveProvenance ?? current.objectiveProvenance;
    const uiMockRole = update.uiMockRole ?? current.uiMockRole;
    const requiresUiMockApproval = update.requiresUiMockApproval ?? current.requiresUiMockApproval ?? false;
    if (candidateStatus === "ready_to_create") {
      this.assertProjectBoardCardProofReady({ ...current, testPlan });
      this.assertProjectBoardCardClarificationsResolved({
        ...current,
        clarificationQuestions,
        clarificationSuggestions,
        clarificationAnswers,
        clarificationDecisions,
        candidateStatus,
      });
    }
    const touchedFields = [...new Set([...(current.userTouchedFields ?? []), ...update.changedFields])];
    this.requireDb()
      .prepare(
        `UPDATE project_board_cards
         SET title = ?,
             description = ?,
             candidate_status = ?,
             priority = ?,
             phase = ?,
             labels_json = ?,
             blocked_by_json = ?,
             acceptance_criteria_json = ?,
             test_plan_json = ?,
             source_refs_json = ?,
             clarification_questions_json = ?,
             clarification_suggestions_json = ?,
             clarification_answers_json = ?,
             clarification_decisions_json = ?,
             objective_provenance_json = ?,
             ui_mock_role = ?,
             requires_ui_mock_approval = ?,
             user_touched_fields_json = ?,
             user_touched_at = ?,
             pending_pi_update_json = NULL,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        title.trim().slice(0, 180),
        description.trim().slice(0, 4000),
        candidateStatus,
        priority,
        phase?.trim() ? phase.trim().slice(0, 80) : null,
        JSON.stringify(normalizeTaskLabels(labels)),
        JSON.stringify(normalizeTaskReferences(blockedBy)),
        JSON.stringify(normalizeCardTextList(acceptanceCriteria, 30)),
        JSON.stringify(normalizeProjectBoardCardTestPlan(testPlan)),
        JSON.stringify(normalizeCardTextList(sourceRefs, 20)),
        JSON.stringify(normalizeProjectBoardClarificationQuestions(clarificationQuestions, 8)),
        JSON.stringify(normalizeProjectBoardClarificationSuggestions(clarificationSuggestions, [])),
        JSON.stringify(normalizeProjectBoardClarificationAnswers(clarificationAnswers)),
        JSON.stringify(clarificationDecisions),
        objectiveProvenanceJson(objectiveProvenance),
        normalizeProjectBoardUiMockRole(uiMockRole) ?? null,
        requiresUiMockApproval ? 1 : 0,
        JSON.stringify(touchedFields),
        now,
        now,
        input.cardId,
      );
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, current.boardId);
    this.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: "Pi update applied",
      summary: `${current.title} accepted Pi updates for ${update.changedFields.join(", ")}.`,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: { cardId: current.id, sourceId: update.sourceId, action: "apply", changedFields: update.changedFields },
      createdAt: now,
    });
    return this.getProjectBoardCard(input.cardId);
  }

  addProjectBoardCardRunFeedback(input: AddProjectBoardCardRunFeedbackInput): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    if (!current.orchestrationTaskId || current.status === "draft") {
      throw new Error("Run feedback can only be added after a card has been approved into a Local Task.");
    }
    if (current.status === "done" || current.status === "archived") {
      throw new Error("Completed or archived cards cannot receive next-run feedback.");
    }
    if (current.status === "in_progress") {
      throw new Error("Wait for the active Local Task run to finish before adding next-run feedback.");
    }
    const feedbackText = input.feedback.trim();
    if (!feedbackText) throw new Error("Run feedback cannot be empty.");
    const now = new Date().toISOString();
    const feedback: ProjectBoardCardRunFeedback = {
      id: randomUUID(),
      feedback: feedbackText.slice(0, 1500),
      source: normalizeProjectBoardCardRunFeedbackSource(input.source),
      decisionQuestion: input.decisionQuestion?.trim() ? input.decisionQuestion.trim().slice(0, 500) : undefined,
      decisionAnswer: input.decisionAnswer?.trim() ? input.decisionAnswer.trim().slice(0, 1500) : undefined,
      sourceImpactEventId: input.sourceImpactEventId?.trim() ? input.sourceImpactEventId.trim().slice(0, 120) : undefined,
      sourceImpactEventIds: normalizeTaskReferences(input.sourceImpactEventIds ?? []),
      sourceIds: normalizeTaskReferences(input.sourceIds ?? []),
      createdAt: now,
      createdBy: "ambient-desktop",
    };
    const runFeedback = normalizeProjectBoardCardRunFeedback([...(current.runFeedback ?? []), feedback]);
    this.requireDb()
      .prepare("UPDATE project_board_cards SET run_feedback_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(runFeedback), now, current.id);
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, current.boardId);
    const updated = this.getProjectBoardCard(current.id);
    this.updateOrchestrationTask({
      id: current.orchestrationTaskId,
      description: this.projectBoardCardTaskDescription(updated),
    });
    this.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: "Run feedback added",
      summary: `${current.title} received additive next-run feedback. The approved card fields were not rewritten.`,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        taskId: current.orchestrationTaskId,
        runFeedback: {
          id: feedback.id,
          source: feedback.source,
          decisionQuestion: feedback.decisionQuestion,
          decisionAnswer: feedback.decisionAnswer,
          sourceImpactEventId: feedback.sourceImpactEventId,
          sourceImpactEventIds: feedback.sourceImpactEventIds,
          sourceIds: feedback.sourceIds,
          modelCallRequired: false,
        },
      },
      createdAt: now,
    });
    return this.getProjectBoardCard(current.id);
  }

  private recordProjectBoardClarificationAnswerMetadata(
    current: ProjectBoardCard,
    question: string,
    answer: string,
    now: string,
    decisionImpact: ProjectBoardDecisionImpactPreview,
  ): ProjectBoardCard {
    const nextAnswers = normalizeProjectBoardClarificationAnswers([
      ...(current.clarificationAnswers ?? []),
      { question, answer, answeredAt: now },
    ]);
    if (JSON.stringify(nextAnswers) === JSON.stringify(current.clarificationAnswers ?? [])) {
      return this.getProjectBoardCard(current.id);
    }
    const nextDecisions = normalizeProjectBoardClarificationDecisions(current.clarificationDecisions, {
      clarificationQuestions: current.clarificationQuestions,
      clarificationSuggestions: current.clarificationSuggestions,
      clarificationAnswers: nextAnswers,
      createdAt: current.createdAt,
      updatedAt: now,
    });
    const touchedFields = [
      ...new Set([
        ...(current.userTouchedFields ?? []),
        "clarificationAnswers" satisfies ProjectBoardCardTouchedField,
        "clarificationDecisions" satisfies ProjectBoardCardTouchedField,
      ]),
    ];
    this.requireDb()
      .prepare(
        `UPDATE project_board_cards
         SET clarification_answers_json = ?,
             clarification_decisions_json = ?,
             user_touched_fields_json = ?,
             user_touched_at = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify(nextAnswers), JSON.stringify(nextDecisions), JSON.stringify(touchedFields), now, now, current.id);
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, current.boardId);
    this.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: "Clarification decision answered",
      summary: projectBoardClarificationDecisionImpactEventSummary(current.title, decisionImpact),
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        changedFields: ["clarificationAnswers", "clarificationDecisions"],
        decisionImpact: projectBoardDecisionImpactEventMetadata(decisionImpact),
      },
      createdAt: now,
    });
    return this.getProjectBoardCard(current.id);
  }

  applyProjectBoardDecisionImpactFeedback(input: ApplyProjectBoardDecisionImpactFeedbackInput): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    const question = input.question.trim().slice(0, 500);
    const answer = input.answer.trim().slice(0, 1500);
    if (!question || !answer) throw new Error("Decision impact feedback requires a question and answer.");

    const now = new Date().toISOString();
    const board = this.getProjectBoard(current.boardId);
    const impact = projectBoardDecisionImpactPreview(board, { question, answer, answeredCardId: current.id });
    if (current.status === "draft" && !current.orchestrationTaskId) {
      const nextAnswers = normalizeProjectBoardClarificationAnswers([
        ...(current.clarificationAnswers ?? []),
        { question, answer, answeredAt: now },
      ]);
      this.updateProjectBoardCard({ cardId: current.id, clarificationAnswers: nextAnswers });
    } else {
      if (!current.orchestrationTaskId || current.status === "done" || current.status === "archived") {
        throw new Error("Decision impact feedback can only be applied to draft cards or active Local Task cards.");
      }
      if (current.status === "in_progress") {
        throw new Error("Wait for the active Local Task run to finish before applying decision feedback.");
      }
      this.recordProjectBoardClarificationAnswerMetadata(current, question, answer, now, impact);
    }
    const targets = impact.cards.filter((card) => card.state === "ready_needs_next_run_feedback");
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];

    for (const target of targets) {
      const targetCard = this.getProjectBoardCard(target.cardId);
      if (
        !targetCard.orchestrationTaskId ||
        targetCard.status === "draft" ||
        targetCard.status === "done" ||
        targetCard.status === "archived" ||
        targetCard.status === "in_progress" ||
        projectBoardHasDecisionImpactFeedback(targetCard, question, answer)
      ) {
        skippedCardIds.push(target.cardId);
        continue;
      }
      this.addProjectBoardCardRunFeedback({
        cardId: targetCard.id,
        feedback: projectBoardDecisionImpactFeedbackText(question, answer),
        source: "decision_impact",
        decisionQuestion: question,
        decisionAnswer: answer,
      });
      appliedCardIds.push(targetCard.id);
    }

    if (appliedCardIds.length > 0) {
      this.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "card_updated",
        title: "Decision impact applied",
        summary: `Clarification answer created next-run feedback for ${appliedCardIds.length} ticketized card${
          appliedCardIds.length === 1 ? "" : "s"
        }; ${skippedCardIds.length} skipped. 0 model calls.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: {
          cardId: current.id,
          decisionImpact: {
            ...projectBoardDecisionImpactEventMetadata(impact),
            appliedAction: "create_next_run_feedback",
            appliedCardIds,
            skippedCardIds,
          },
        },
        createdAt: now,
      });
    }

    return this.getProjectBoardCard(current.id);
  }

  refreshProjectBoardDecisionDrafts(input: RefreshProjectBoardDecisionDraftsInput): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    if (current.status !== "draft" || current.orchestrationTaskId) {
      throw new Error("Decision draft refresh must start from a draft clarification card before ticketization.");
    }
    const question = input.question.trim().slice(0, 500);
    const answer = input.answer.trim().slice(0, 1500);
    if (!question || !answer) throw new Error("Decision draft refresh requires a question and answer.");

    const board = this.getProjectBoard(current.boardId);
    const impact = projectBoardDecisionImpactPreview(board, { question, answer, answeredCardId: current.id });
    const targetById = new Map(
      impact.cards
        .filter((card) => card.state === "draft_unblocked" || card.state === "draft_still_blocked" || card.state === "duplicate_hidden")
        .map((card) => [card.cardId, card]),
    );
    if (!targetById.has(current.id)) {
      targetById.set(current.id, {
        cardId: current.id,
        title: current.title,
        status: current.status,
        candidateStatus: current.candidateStatus,
        state: "draft_still_blocked",
        openBefore: 1,
        openAfter: 0,
        matchedQuestions: [question],
        duplicateQuestions: [],
        recommendedAction: "Save answer on the source draft.",
      });
    }

    const now = new Date().toISOString();
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];

    for (const target of targetById.values()) {
      const targetCard = this.getProjectBoardCard(target.cardId);
      if (targetCard.status !== "draft" || targetCard.orchestrationTaskId) {
        skippedCardIds.push(target.cardId);
        continue;
      }
      const variants = [...new Set([question, ...target.matchedQuestions, ...target.duplicateQuestions].map((value) => value.trim()).filter(Boolean))];
      const existingAnswer = (targetCard.clarificationAnswers ?? []).find((item) => projectBoardQuestionMatchesAnyVariant(item.question, variants));
      const answerQuestion = existingAnswer?.question ?? target.matchedQuestions[0] ?? target.duplicateQuestions[0] ?? question;
      const answeredAt = existingAnswer?.answer.trim() === answer ? existingAnswer.answeredAt : now;
      const nextAnswers = normalizeProjectBoardClarificationAnswers([
        ...(targetCard.clarificationAnswers ?? []),
        { question: answerQuestion, answer, answeredAt },
      ]);
      const nextQuestions = normalizeProjectBoardClarificationQuestions(
        (targetCard.clarificationQuestions ?? []).filter((candidate) => !projectBoardQuestionMatchesAnyVariant(candidate, variants)),
        8,
      );
      this.updateProjectBoardCard({
        cardId: targetCard.id,
        description: projectBoardDescriptionWithClarificationAnswer(targetCard.description, answerQuestion, answer).slice(0, 4000),
        clarificationQuestions: nextQuestions,
        clarificationAnswers: nextAnswers,
      });
      appliedCardIds.push(targetCard.id);
    }

    this.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: "Decision drafts refreshed",
      summary: `Clarification answer was applied to ${appliedCardIds.length} affected draft card${
        appliedCardIds.length === 1 ? "" : "s"
      }; ${skippedCardIds.length} skipped. 0 model calls.`,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        decisionImpact: {
          ...projectBoardDecisionImpactEventMetadata(impact),
          appliedAction: "refresh_affected_drafts",
          appliedCardIds,
          skippedCardIds,
        },
      },
      createdAt: now,
    });

    return this.getProjectBoardCard(current.id);
  }

  stageProjectBoardSourceDraftPiUpdates(input: StageProjectBoardSourceDraftPiUpdatesInput): ProjectBoardSummary {
    const board = this.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const selectedSourceIds = new Set([input.sourceId, ...(input.sourceIds ?? [])].filter((id): id is string => Boolean(id?.trim())));
    const events = this.listProjectBoardEvents(input.boardId, 200);
    const records: ProjectBoardSourceDraftRefreshRecord[] = [];
    const seenRecordKeys = new Set<string>();

    for (const event of events) {
      const impact = projectBoardSourceImpactMetadataFromEvent(event);
      if (!impact || !impact.targetedRefreshOptional) continue;
      if (input.sourceImpactEventId && event.id !== input.sourceImpactEventId) continue;
      if (selectedSourceIds.size > 0 && ![impact.sourceId, ...impact.groupSourceIds].some((id) => selectedSourceIds.has(id))) continue;
      const record: ProjectBoardSourceDraftRefreshRecord = { eventId: event.id, createdAt: event.createdAt, impact };
      const key = projectBoardSourceDraftRefreshRecordKey(record);
      if (!input.sourceImpactEventId && seenRecordKeys.has(key)) continue;
      seenRecordKeys.add(key);
      records.push(record);
    }

    if (records.length === 0 && selectedSourceIds.size > 0) {
      const sources = this.listProjectBoardSources(input.boardId).filter((source) => selectedSourceIds.has(source.id));
      for (const source of sources) {
        const impact = this.projectBoardSourceUpdateImpact(source, source);
        if (!impact.targetedRefreshOptional) continue;
        const record: ProjectBoardSourceDraftRefreshRecord = { impact };
        const key = projectBoardSourceDraftRefreshRecordKey(record);
        if (seenRecordKeys.has(key)) continue;
        seenRecordKeys.add(key);
        records.push(record);
      }
    }

    if (records.length === 0) {
      throw new Error("No source impact records matched affected draft cards.");
    }

    const sources = this.listProjectBoardSources(input.boardId);
    const sourceIds = [...new Set(records.flatMap((record) => record.impact.groupSourceIds.length > 0 ? record.impact.groupSourceIds : [record.impact.sourceId]))];
    const affectedDraftCardIds = [
      ...new Set(records.flatMap((record) => record.impact.affectedDraftCardIds)),
    ];
    const affectedExecutableCardIds = [
      ...new Set(records.flatMap((record) => record.impact.affectedExecutableCardIds)),
    ];
    const sourceImpactEventIds = records.map((record) => record.eventId).filter((id): id is string => Boolean(id));
    const note = projectBoardSourceDraftRefreshNote({
      sources: sources.filter((source) => sourceIds.includes(source.id)),
      impactRecordCount: records.length,
      selectedObservationCount: records.reduce((total, record) => total + record.impact.selectedObservationCount, 0),
    });
    const suggestionsByCardId = new Map(input.suggestions.map((suggestion) => [suggestion.cardId, suggestion]));
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];
    const now = new Date().toISOString();
    const updatePendingPi = this.requireDb().prepare(
      `UPDATE project_board_cards
       SET pending_pi_update_json = ?,
           updated_at = ?
       WHERE id = ?`,
    );

    for (const cardId of affectedDraftCardIds) {
      let card: ProjectBoardCard;
      try {
        card = this.getProjectBoardCard(cardId);
      } catch {
        skippedCardIds.push(cardId);
        continue;
      }
      if (card.boardId !== input.boardId || card.status !== "draft" || card.orchestrationTaskId || card.pendingPiUpdate) {
        skippedCardIds.push(cardId);
        continue;
      }
      const suggestion = suggestionsByCardId.get(card.id);
      const nextDescription = (suggestion?.description?.trim()
        ? suggestion.description.trim()
        : projectBoardDescriptionWithSourceImpactRefresh(card.description, note)
      ).slice(0, 4000);
      const nextLabels = suggestion?.labels ? normalizeTaskLabels(suggestion.labels) : card.labels;
      const nextAcceptanceCriteria = suggestion?.acceptanceCriteria
        ? normalizeCardTextList(suggestion.acceptanceCriteria, 30)
        : card.acceptanceCriteria;
      const nextTestPlan = suggestion?.testPlan ? normalizeProjectBoardCardTestPlan(suggestion.testPlan) : card.testPlan;
      const nextQuestions = suggestion?.clarificationQuestions
        ? normalizeProjectBoardClarificationQuestions(suggestion.clarificationQuestions, 8)
        : card.clarificationQuestions ?? [];
      const nextDecisions = normalizeProjectBoardClarificationDecisions(card.clarificationDecisions, {
        clarificationQuestions: nextQuestions,
        clarificationSuggestions: card.clarificationSuggestions,
        clarificationAnswers: card.clarificationAnswers,
        createdAt: card.createdAt,
        updatedAt: now,
      });
      const changedFields: ProjectBoardCardTouchedField[] = [
        nextDescription !== card.description ? "description" : undefined,
        JSON.stringify(nextLabels) !== JSON.stringify(card.labels) ? "labels" : undefined,
        JSON.stringify(nextAcceptanceCriteria) !== JSON.stringify(card.acceptanceCriteria) ? "acceptanceCriteria" : undefined,
        JSON.stringify(nextTestPlan) !== JSON.stringify(card.testPlan) ? "testPlan" : undefined,
        JSON.stringify(nextQuestions) !== JSON.stringify(card.clarificationQuestions ?? []) ? "clarificationQuestions" : undefined,
        JSON.stringify(nextDecisions) !== JSON.stringify(card.clarificationDecisions ?? []) ? "clarificationDecisions" : undefined,
      ].filter((field): field is ProjectBoardCardTouchedField => Boolean(field));

      if (changedFields.length === 0) {
        skippedCardIds.push(card.id);
        continue;
      }

      const pendingUpdate: ProjectBoardCardPendingPiUpdate = {
        sourceId: `source:${sourceIds.slice().sort().join("|") || "impact"}`,
        createdAt: now,
        changedFields,
        description: nextDescription,
        labels: nextLabels,
        acceptanceCriteria: nextAcceptanceCriteria,
        testPlan: nextTestPlan,
        clarificationQuestions: nextQuestions,
        clarificationDecisions: nextDecisions,
      };
      const result = updatePendingPi.run(JSON.stringify(pendingUpdate), now, card.id);
      if (result.changes <= 0) {
        skippedCardIds.push(card.id);
        continue;
      }
      appliedCardIds.push(card.id);
      this.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "card_updated",
        title: "Source draft Pi update available",
        summary: `${card.title} received a reviewable Pi update from source impact (${changedFields.join(", ")}).`,
        entityKind: "project_board_card",
        entityId: card.id,
        metadata: {
          cardId: card.id,
          sourceId: pendingUpdate.sourceId,
          sourceImpactEventIds,
          sourceIds,
          changedFields,
          protectedPiUpdate: true,
          modelCallRequired: true,
        },
        createdAt: now,
      });
    }

    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
    this.appendProjectBoardEvent({
      boardId: input.boardId,
      kind: "card_updated",
      title: "Source draft Pi refresh proposed",
      summary: `Pi proposed reviewable source-impact updates for ${appliedCardIds.length} affected draft card${
        appliedCardIds.length === 1 ? "" : "s"
      }; ${skippedCardIds.length} skipped. Approved cards were not rewritten.`,
      entityKind: "project_board",
      entityId: input.boardId,
      metadata: {
        sourceImpact: {
          schemaVersion: 1,
          appliedAction: "propose_targeted_draft_refresh",
          sourceImpactEventIds,
          sourceIds,
          affectedDraftCardIds,
          affectedExecutableCardIds,
          appliedCardIds,
          skippedCardIds,
          pendingPiUpdateCardIds: appliedCardIds,
          existingCardsRewritten: false,
          modelCallRequired: true,
          fallbackUsed: Boolean(input.fallbackUsed),
          providerError: input.providerError,
          model: input.model,
          telemetry: input.telemetry,
        },
      },
      createdAt: now,
    });

    return this.getProjectBoard(input.boardId) ?? board;
  }

  stageProjectBoardDecisionDraftPiUpdates(input: StageProjectBoardDecisionDraftPiUpdatesInput): ProjectBoardCard {
    const current = this.getProjectBoardCard(input.cardId);
    if (current.status !== "draft" || current.orchestrationTaskId) {
      throw new Error("Decision draft Pi refresh must start from a draft clarification card before ticketization.");
    }
    const question = input.question.trim().slice(0, 500);
    const answer = input.answer.trim().slice(0, 1500);
    if (!question || !answer) throw new Error("Decision draft Pi refresh requires a question and answer.");

    const board = this.getProjectBoard(current.boardId);
    const impact = projectBoardDecisionImpactPreview(board, { question, answer, answeredCardId: current.id });
    const targetById = new Map(
      impact.cards
        .filter((card) => card.state === "draft_unblocked" || card.state === "draft_still_blocked" || card.state === "duplicate_hidden")
        .map((card) => [card.cardId, card]),
    );
    if (!targetById.has(current.id)) {
      targetById.set(current.id, {
        cardId: current.id,
        title: current.title,
        status: current.status,
        candidateStatus: current.candidateStatus,
        state: "draft_still_blocked",
        openBefore: 1,
        openAfter: 0,
        matchedQuestions: [question],
        duplicateQuestions: [],
        recommendedAction: "Save answer on the source draft.",
      });
    }

    const suggestionsByCardId = new Map(input.suggestions.map((suggestion) => [suggestion.cardId, suggestion]));
    const now = new Date().toISOString();
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];
    const updatePendingPi = this.requireDb().prepare(
      `UPDATE project_board_cards
       SET pending_pi_update_json = ?,
           updated_at = ?
       WHERE id = ?`,
    );

    for (const target of targetById.values()) {
      const targetCard = this.getProjectBoardCard(target.cardId);
      if (targetCard.status !== "draft" || targetCard.orchestrationTaskId) {
        skippedCardIds.push(target.cardId);
        continue;
      }

      const variants = [...new Set([question, ...target.matchedQuestions, ...target.duplicateQuestions].map((value) => value.trim()).filter(Boolean))];
      const existingAnswer = (targetCard.clarificationAnswers ?? []).find((item) => projectBoardQuestionMatchesAnyVariant(item.question, variants));
      const answerQuestion = existingAnswer?.question ?? target.matchedQuestions[0] ?? target.duplicateQuestions[0] ?? question;
      const answeredAt = existingAnswer?.answer.trim() === answer ? existingAnswer.answeredAt : now;
      const nextAnswers = normalizeProjectBoardClarificationAnswers([
        ...(targetCard.clarificationAnswers ?? []),
        { question: answerQuestion, answer, answeredAt },
      ]);
      const suggestion = suggestionsByCardId.get(targetCard.id);
      const suggestedQuestions = suggestion?.clarificationQuestions ?? targetCard.clarificationQuestions ?? [];
      const nextQuestions = normalizeProjectBoardClarificationQuestions(
        suggestedQuestions.filter((candidate) => !projectBoardQuestionMatchesAnyVariant(candidate, variants)),
        8,
      );
      const nextDescription = (suggestion?.description?.trim()
        ? suggestion.description.trim()
        : projectBoardDescriptionWithClarificationAnswer(targetCard.description, answerQuestion, answer)
      ).slice(0, 4000);
      const nextLabels = suggestion?.labels ? normalizeTaskLabels(suggestion.labels) : targetCard.labels;
      const nextAcceptanceCriteria = suggestion?.acceptanceCriteria
        ? normalizeCardTextList(suggestion.acceptanceCriteria, 30)
        : targetCard.acceptanceCriteria;
      const nextTestPlan = suggestion?.testPlan ? normalizeProjectBoardCardTestPlan(suggestion.testPlan) : targetCard.testPlan;
      const nextDecisions = normalizeProjectBoardClarificationDecisions(targetCard.clarificationDecisions, {
        clarificationQuestions: nextQuestions,
        clarificationSuggestions: targetCard.clarificationSuggestions,
        clarificationAnswers: nextAnswers,
        createdAt: targetCard.createdAt,
        updatedAt: now,
      });
      const changedFields: ProjectBoardCardTouchedField[] = [
        nextDescription !== targetCard.description ? "description" : undefined,
        JSON.stringify(nextLabels) !== JSON.stringify(targetCard.labels) ? "labels" : undefined,
        JSON.stringify(nextAcceptanceCriteria) !== JSON.stringify(targetCard.acceptanceCriteria) ? "acceptanceCriteria" : undefined,
        JSON.stringify(nextTestPlan) !== JSON.stringify(targetCard.testPlan) ? "testPlan" : undefined,
        JSON.stringify(nextQuestions) !== JSON.stringify(targetCard.clarificationQuestions ?? []) ? "clarificationQuestions" : undefined,
        JSON.stringify(nextAnswers) !== JSON.stringify(targetCard.clarificationAnswers ?? []) ? "clarificationAnswers" : undefined,
        JSON.stringify(nextDecisions) !== JSON.stringify(targetCard.clarificationDecisions ?? []) ? "clarificationDecisions" : undefined,
      ].filter((field): field is ProjectBoardCardTouchedField => Boolean(field));

      if (changedFields.length === 0) {
        skippedCardIds.push(targetCard.id);
        continue;
      }

      const pendingUpdate: ProjectBoardCardPendingPiUpdate = {
        sourceId: `decision:${impact.canonicalKey}`,
        createdAt: now,
        changedFields,
        description: nextDescription,
        labels: nextLabels,
        acceptanceCriteria: nextAcceptanceCriteria,
        testPlan: nextTestPlan,
        clarificationQuestions: nextQuestions,
        clarificationAnswers: nextAnswers,
        clarificationDecisions: nextDecisions,
      };
      const result = updatePendingPi.run(JSON.stringify(pendingUpdate), now, targetCard.id);
      if (result.changes <= 0) {
        skippedCardIds.push(targetCard.id);
        continue;
      }
      appliedCardIds.push(targetCard.id);
      this.appendProjectBoardEvent({
        boardId: current.boardId,
        kind: "card_updated",
        title: "Decision draft Pi update available",
        summary: `${targetCard.title} received a reviewable Pi update from a PM decision (${changedFields.join(", ")}).`,
        entityKind: "project_board_card",
        entityId: targetCard.id,
        metadata: {
          cardId: targetCard.id,
          sourceId: pendingUpdate.sourceId,
          changedFields,
          decisionQuestion: question,
          decisionAnswer: answer,
          protectedPiUpdate: true,
          modelCallRequired: true,
        },
        createdAt: now,
      });
    }

    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, current.boardId);
    this.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_updated",
      title: "Decision draft Pi refresh proposed",
      summary: `Pi proposed reviewable updates for ${appliedCardIds.length} affected draft card${
        appliedCardIds.length === 1 ? "" : "s"
      }; ${skippedCardIds.length} skipped. Approved cards were not rewritten.`,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: {
        cardId: current.id,
        decisionImpact: {
          ...projectBoardDecisionImpactEventMetadata(impact),
          appliedAction: "propose_targeted_draft_refresh",
          modelCallRequired: true,
          appliedCardIds,
          skippedCardIds,
          pendingPiUpdateCardIds: appliedCardIds,
          existingCardsRewritten: false,
          fallbackUsed: Boolean(input.fallbackUsed),
          providerError: input.providerError,
          model: input.model,
          telemetry: input.telemetry,
        },
      },
      createdAt: now,
    });

    return this.getProjectBoardCard(current.id);
  }

  refreshProjectBoardSourceDrafts(input: RefreshProjectBoardSourceDraftsInput): ProjectBoardSummary {
    const board = this.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const selectedSourceIds = new Set([input.sourceId, ...(input.sourceIds ?? [])].filter((id): id is string => Boolean(id?.trim())));
    const events = this.listProjectBoardEvents(input.boardId, 200);
    const refreshedByEventAndCard = new Set<string>();
    for (const event of events) {
      const refresh = projectBoardSourceDraftRefreshEventMetadata(event);
      if (!refresh) continue;
      for (const eventId of refresh.sourceImpactEventIds) {
        for (const cardId of refresh.appliedCardIds) refreshedByEventAndCard.add(`${eventId}:${cardId}`);
      }
    }

    const records: ProjectBoardSourceDraftRefreshRecord[] = [];
    const seenRecordKeys = new Set<string>();
    for (const event of events) {
      const impact = projectBoardSourceImpactMetadataFromEvent(event);
      if (!impact || !impact.targetedRefreshOptional) continue;
      if (input.sourceImpactEventId && event.id !== input.sourceImpactEventId) continue;
      if (selectedSourceIds.size > 0 && ![impact.sourceId, ...impact.groupSourceIds].some((id) => selectedSourceIds.has(id))) continue;
      const record: ProjectBoardSourceDraftRefreshRecord = { eventId: event.id, createdAt: event.createdAt, impact };
      const key = projectBoardSourceDraftRefreshRecordKey(record);
      if (!input.sourceImpactEventId && seenRecordKeys.has(key)) continue;
      seenRecordKeys.add(key);
      records.push(record);
    }

    if (records.length === 0 && selectedSourceIds.size > 0) {
      const sources = this.listProjectBoardSources(input.boardId).filter((source) => selectedSourceIds.has(source.id));
      for (const source of sources) {
        const impact = this.projectBoardSourceUpdateImpact(source, source);
        if (!impact.targetedRefreshOptional) continue;
        const record: ProjectBoardSourceDraftRefreshRecord = { impact };
        const key = projectBoardSourceDraftRefreshRecordKey(record);
        if (seenRecordKeys.has(key)) continue;
        seenRecordKeys.add(key);
        records.push(record);
      }
    }

    if (records.length === 0) {
      throw new Error("No source impact records matched affected draft cards.");
    }

    const sources = this.listProjectBoardSources(input.boardId);
    const sourceIds = [...new Set(records.flatMap((record) => record.impact.groupSourceIds.length > 0 ? record.impact.groupSourceIds : [record.impact.sourceId]))];
    const affectedDraftCardIds = [
      ...new Set(records.flatMap((record) => record.impact.affectedDraftCardIds)),
    ];
    const affectedExecutableCardIds = [
      ...new Set(records.flatMap((record) => record.impact.affectedExecutableCardIds)),
    ];
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];
    const sourceImpactEventIds = records.map((record) => record.eventId).filter((id): id is string => Boolean(id));
    const note = projectBoardSourceDraftRefreshNote({
      sources: sources.filter((source) => sourceIds.includes(source.id)),
      impactRecordCount: records.length,
      selectedObservationCount: records.reduce((total, record) => total + record.impact.selectedObservationCount, 0),
    });
    const now = new Date().toISOString();

    for (const cardId of affectedDraftCardIds) {
      let card: ProjectBoardCard;
      try {
        card = this.getProjectBoardCard(cardId);
      } catch {
        skippedCardIds.push(cardId);
        continue;
      }
      if (card.boardId !== input.boardId || card.status !== "draft" || card.orchestrationTaskId) {
        skippedCardIds.push(cardId);
        continue;
      }
      if (sourceImpactEventIds.length > 0 && sourceImpactEventIds.every((eventId) => refreshedByEventAndCard.has(`${eventId}:${card.id}`))) {
        skippedCardIds.push(cardId);
        continue;
      }
      const description = projectBoardDescriptionWithSourceImpactRefresh(card.description, note).slice(0, 4000);
      if (description === card.description) {
        skippedCardIds.push(cardId);
        continue;
      }
      this.requireDb()
        .prepare(
          `UPDATE project_board_cards
           SET description = ?,
               updated_at = ?
           WHERE id = ?`,
        )
        .run(description, now, card.id);
      appliedCardIds.push(card.id);
    }

    if (appliedCardIds.length > 0) {
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "card_updated",
        title: "Source drafts refreshed",
        summary: `Source impact notes refreshed on ${appliedCardIds.length} affected draft card${
          appliedCardIds.length === 1 ? "" : "s"
        }; ${skippedCardIds.length} skipped. 0 model calls.`,
        entityKind: "project_board",
        entityId: input.boardId,
        metadata: {
          sourceImpact: {
            schemaVersion: 1,
            appliedAction: "refresh_affected_drafts",
            sourceImpactEventIds,
            sourceIds,
            affectedDraftCardIds,
            affectedExecutableCardIds,
            appliedCardIds,
            skippedCardIds,
            existingCardsRewritten: false,
            modelCallRequired: false,
          },
        },
        createdAt: now,
      });
    }

    return this.getProjectBoard(input.boardId) ?? board;
  }

  applyProjectBoardSourceImpactFeedback(input: ApplyProjectBoardSourceImpactFeedbackInput): ProjectBoardSummary {
    const board = this.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const selectedSourceIds = new Set([input.sourceId, ...(input.sourceIds ?? [])].filter((id): id is string => Boolean(id?.trim())));
    const events = this.listProjectBoardEvents(input.boardId, 200);
    const records: ProjectBoardSourceDraftRefreshRecord[] = [];
    const seenRecordKeys = new Set<string>();

    for (const event of events) {
      const impact = projectBoardSourceImpactMetadataFromEvent(event);
      if (!impact || !impact.nextRunFeedbackRecommended) continue;
      if (input.sourceImpactEventId && event.id !== input.sourceImpactEventId) continue;
      if (selectedSourceIds.size > 0 && ![impact.sourceId, ...impact.groupSourceIds].some((id) => selectedSourceIds.has(id))) continue;
      const record: ProjectBoardSourceDraftRefreshRecord = { eventId: event.id, createdAt: event.createdAt, impact };
      const key = projectBoardSourceDraftRefreshRecordKey(record);
      if (!input.sourceImpactEventId && seenRecordKeys.has(key)) continue;
      seenRecordKeys.add(key);
      records.push(record);
    }

    if (records.length === 0 && selectedSourceIds.size > 0) {
      const sources = this.listProjectBoardSources(input.boardId).filter((source) => selectedSourceIds.has(source.id));
      for (const source of sources) {
        const impact = this.projectBoardSourceUpdateImpact(source, source);
        if (!impact.nextRunFeedbackRecommended) continue;
        const record: ProjectBoardSourceDraftRefreshRecord = { impact };
        const key = projectBoardSourceDraftRefreshRecordKey(record);
        if (seenRecordKeys.has(key)) continue;
        seenRecordKeys.add(key);
        records.push(record);
      }
    }

    if (records.length === 0) {
      throw new Error("No source impact records matched ticketized cards.");
    }

    const sources = this.listProjectBoardSources(input.boardId);
    const sourceIds = [...new Set(records.flatMap((record) => record.impact.groupSourceIds.length > 0 ? record.impact.groupSourceIds : [record.impact.sourceId]))];
    const affectedDraftCardIds = [...new Set(records.flatMap((record) => record.impact.affectedDraftCardIds))];
    const affectedExecutableCardIds = [...new Set(records.flatMap((record) => record.impact.affectedExecutableCardIds))];
    const sourceImpactEventIds = records.map((record) => record.eventId).filter((id): id is string => Boolean(id));
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];
    const feedback = projectBoardSourceImpactFeedbackText({
      sources: sources.filter((source) => sourceIds.includes(source.id)),
      impactRecordCount: records.length,
      selectedObservationCount: records.reduce((total, record) => total + record.impact.selectedObservationCount, 0),
    });
    const now = new Date().toISOString();

    for (const cardId of affectedExecutableCardIds) {
      let card: ProjectBoardCard;
      try {
        card = this.getProjectBoardCard(cardId);
      } catch {
        skippedCardIds.push(cardId);
        continue;
      }
      if (
        card.boardId !== input.boardId ||
        !card.orchestrationTaskId ||
        card.status === "draft" ||
        card.status === "done" ||
        card.status === "archived" ||
        card.status === "in_progress" ||
        projectBoardHasSourceImpactFeedback(card, sourceImpactEventIds, sourceIds)
      ) {
        skippedCardIds.push(cardId);
        continue;
      }
      this.addProjectBoardCardRunFeedback({
        cardId: card.id,
        feedback,
        source: "source_impact",
        sourceImpactEventId: sourceImpactEventIds.length === 1 ? sourceImpactEventIds[0] : undefined,
        sourceImpactEventIds,
        sourceIds,
      });
      appliedCardIds.push(card.id);
    }

    if (appliedCardIds.length > 0) {
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "card_updated",
        title: "Source impact feedback added",
        summary: `Source impact created next-run feedback for ${appliedCardIds.length} ticketized card${
          appliedCardIds.length === 1 ? "" : "s"
        }; ${skippedCardIds.length} skipped. 0 model calls.`,
        entityKind: "project_board",
        entityId: input.boardId,
        metadata: {
          sourceImpact: {
            schemaVersion: 1,
            appliedAction: "create_next_run_feedback",
            sourceImpactEventIds,
            sourceIds,
            affectedDraftCardIds,
            affectedExecutableCardIds,
            appliedCardIds,
            skippedCardIds,
            existingCardsRewritten: false,
            modelCallRequired: false,
          },
        },
        createdAt: now,
      });
    }

    return this.getProjectBoard(input.boardId) ?? board;
  }

  private assertProjectBoardCardProofReady(card: ProjectBoardCard): void {
    if (!this.projectBoardRequiresProofSpec(card.boardId) || projectBoardCardProofCount(card) > 0) return;
    throw new Error("Strict project board proof policy requires at least one proof expectation before a card can be marked ready.");
  }

  private assertProjectBoardCardClarificationsResolved(card: ProjectBoardCard): void {
    const pending = projectBoardOpenClarificationQuestions({
      clarificationDecisions: card.clarificationDecisions,
      clarificationQuestions: normalizeProjectBoardClarificationQuestions(card.clarificationQuestions ?? [], 8),
      clarificationSuggestions: card.clarificationSuggestions,
      clarificationAnswers: card.clarificationAnswers,
      includeInlineQuestions: false,
      limit: 8,
    });
    if (pending.length === 0) return;
    throw new Error("Clarification questions must be answered before a card can be marked ready.");
  }

  private assertProjectBoardUxMockGateOpen(card: ProjectBoardCard, boardCards: ProjectBoardCard[]): void {
    const blocker = projectBoardOpenUxMockGateBlocker(card, boardCards);
    if (blocker) throw new Error(`Approve the UX mock before creating UI implementation tasks: ${blocker.title}.`);
    if (projectBoardCardMissingRequiredUxMockGate(card, boardCards)) {
      throw new Error("Approve the UX mock before creating UI implementation tasks.");
    }
  }

  private assertProjectBoardRunFollowUpStillActionable(card: ProjectBoardCard): void {
    const parent = projectBoardClosedParentForRunFollowUp(card, this.listProjectBoardCards(card.boardId));
    if (!parent) return;
    throw new Error(`Run follow-up cannot be marked ready because parent card "${parent.title}" is already done.`);
  }

  private projectBoardRequiresProofSpec(boardId: string): boolean {
    const row = this.requireDb()
      .prepare(
        `SELECT project_board_charters.test_policy_json AS test_policy_json
         FROM project_boards
         JOIN project_board_charters ON project_board_charters.id = project_boards.charter_id
         WHERE project_boards.id = ? AND project_board_charters.status = 'active'
         LIMIT 1`,
      )
      .get(boardId) as { test_policy_json: string } | undefined;
    if (!row) return false;
    const policy = parseJsonObject<Record<string, unknown>>(row.test_policy_json, {});
    return projectBoardTestPolicyRequiresProofSpec(policy);
  }

  replaceProjectBoardSources(boardId: string, sources: ProjectBoardSourceInput[]): ProjectBoardSource[] {
    const board = this.requireDb().prepare("SELECT id, source_thread_id FROM project_boards WHERE id = ?").get(boardId) as
      | { id: string; source_thread_id: string | null }
      | undefined;
    if (!board) throw new Error(`Project board not found: ${boardId}`);
    const now = new Date().toISOString();
    const bounded = normalizeProjectBoardSourceInputs(sources);
    const inferredSourceThreadId =
      bounded.find((source) => source.kind === "plan_artifact" && source.threadId?.trim())?.threadId?.trim() ??
      bounded.find((source) => source.kind === "implementation_plan" && source.threadId?.trim())?.threadId?.trim() ??
      bounded.find((source) => source.threadId?.trim())?.threadId?.trim();
    const previousSources = this.listProjectBoardSources(boardId);
    const nextSources = projectBoardSourceRefreshSources({
      previousSources,
      sources: bounded,
      now,
      createId: randomUUID,
    });
    const refreshStats = projectBoardSourceRefreshStats({ previousSources, nextSources });
    const {
      preservedClassificationCount,
      newCount,
      changedCount,
      unchangedCount,
      removedCount,
    } = refreshStats;
    const transaction = this.requireDb().transaction(() => {
      this.requireDb().prepare("DELETE FROM project_board_sources WHERE board_id = ?").run(boardId);
      const insert = this.requireDb().prepare(
        `INSERT INTO project_board_sources
        (id, board_id, source_kind, source_key, content_hash, change_state, title, summary, excerpt, path, thread_id, artifact_id, message_id,
         byte_size, mtime, classification_reason, classified_by, classification_confidence, authority_role, include_in_synthesis, relevance, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const source of nextSources) {
        const row = projectBoardSourceRefreshStoreRow({ source, boardId, updatedAt: now });
        insert.run(
          row.id,
          row.board_id,
          row.source_kind,
          row.source_key,
          row.content_hash,
          row.change_state,
          row.title,
          row.summary,
          row.excerpt,
          row.path,
          row.thread_id,
          row.artifact_id,
          row.message_id,
          row.byte_size,
          row.mtime,
          row.classification_reason,
          row.classified_by,
          row.classification_confidence,
          row.authority_role,
          row.include_in_synthesis,
          row.relevance,
          row.created_at,
          row.updated_at,
        );
      }
      if (!board.source_thread_id && inferredSourceThreadId) {
        this.requireDb().prepare("UPDATE project_boards SET source_thread_id = ?, updated_at = ? WHERE id = ?").run(inferredSourceThreadId, now, boardId);
      } else {
        this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, boardId);
      }
      this.appendProjectBoardEvent({
        boardId,
        kind: "sources_refreshed",
        title: "Sources refreshed",
        summary: projectBoardSourceRefreshSummary({
          nextCount: nextSources.length,
          newCount,
          changedCount,
          unchangedCount,
          removedCount,
          preservedClassificationCount,
        }),
        entityKind: "project_board",
        entityId: boardId,
        metadata: projectBoardSourceRefreshEventMetadata({ previousSources, nextSources, stats: refreshStats }),
        createdAt: now,
      });
    });
    transaction();
    return this.listProjectBoardSources(boardId);
  }

  getProjectBoardSource(sourceId: string): ProjectBoardSource {
    const row = this.requireDb()
      .prepare("SELECT * FROM project_board_sources WHERE id = ?")
      .get(sourceId) as ProjectBoardSourceRow | undefined;
    if (!row) throw new Error(`Project board source not found: ${sourceId}`);
    return mapProjectBoardSourceRow(row);
  }

  updateProjectBoardSource(input: { sourceId: string; kind: ProjectBoardSourceKind; includeInSynthesis?: boolean }): ProjectBoardSource {
    const current = this.requireDb()
      .prepare("SELECT * FROM project_board_sources WHERE id = ?")
      .get(input.sourceId) as ProjectBoardSourceRow | undefined;
    if (!current) throw new Error(`Project board source not found: ${input.sourceId}`);
    const previousSource = mapProjectBoardSourceRow(current);
    const now = new Date().toISOString();
    const update = projectBoardSourceUserClassificationUpdate({
      previousKind: current.source_kind,
      previousRelevance: current.relevance,
      kind: input.kind,
      includeInSynthesis: input.includeInSynthesis,
    });
    this.requireDb()
      .prepare(
        `UPDATE project_board_sources
         SET source_kind = ?, relevance = ?, classified_by = ?, classification_confidence = ?, classification_reason = ?,
             authority_role = ?, include_in_synthesis = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        update.kind,
        update.relevance,
        update.classifiedBy,
        update.classificationConfidence,
        update.classificationReason,
        update.authorityRole,
        update.includeInSynthesis ? 1 : 0,
        now,
        input.sourceId,
      );
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, current.board_id);
    const row = this.requireDb().prepare("SELECT * FROM project_board_sources WHERE id = ?").get(input.sourceId) as ProjectBoardSourceRow | undefined;
    if (!row) throw new Error(`Project board source not found after update: ${input.sourceId}`);
    const nextSource = mapProjectBoardSourceRow(row);
    if (current.source_kind !== update.kind || current.include_in_synthesis !== (update.includeInSynthesis ? 1 : 0)) {
      const sourceImpact = this.projectBoardSourceUpdateImpact(previousSource, nextSource);
      this.appendProjectBoardEvent({
        boardId: current.board_id,
        kind: "source_updated",
        title: current.source_kind !== update.kind ? "Source reclassified" : "Source inclusion updated",
        summary:
          current.source_kind !== update.kind
            ? `${current.title} moved from ${current.source_kind} to ${update.kind}.`
            : `${current.title} ${update.includeInSynthesis ? "included in" : "excluded from"} project-board synthesis.`,
        entityKind: "project_board_source",
        entityId: current.id,
        metadata: {
          sourceId: current.id,
          from: current.source_kind,
          to: update.kind,
          includeInSynthesis: update.includeInSynthesis,
          sourceImpact,
        },
        createdAt: now,
      });
    }
    return nextSource;
  }

  private projectBoardSourceUpdateImpact(
    previousSource: ProjectBoardSource,
    nextSource: ProjectBoardSource,
  ): ProjectBoardSourceUpdateImpactMetadata {
    return projectBoardSourceUpdateImpactMetadata({
      previousSource,
      nextSource,
      sources: this.listProjectBoardSources(nextSource.boardId),
      cards: this.listProjectBoardCards(nextSource.boardId),
    });
  }

  applyProjectBoardSourceClassifications(boardId: string, inputs: ProjectBoardSourceClassificationInput[]): ProjectBoardSource[] {
    const board = this.requireDb().prepare("SELECT id FROM project_boards WHERE id = ?").get(boardId) as { id: string } | undefined;
    if (!board) throw new Error(`Project board not found: ${boardId}`);
    if (inputs.length === 0) return this.listProjectBoardSources(boardId);

    const currentSources = this.listProjectBoardSources(boardId);
    const updates = projectBoardSourceClassificationUpdates(currentSources, inputs);
    if (updates.length === 0) return this.listProjectBoardSources(boardId);

    const now = new Date().toISOString();
    const transaction = this.requireDb().transaction(() => {
      const update = this.requireDb().prepare(
        `UPDATE project_board_sources
         SET source_kind = ?, relevance = ?, classified_by = ?, classification_confidence = ?, classification_reason = ?,
             authority_role = ?, include_in_synthesis = ?, updated_at = ?
         WHERE id = ? AND board_id = ?`,
      );
      for (const item of updates) {
        update.run(
          item.kind,
          item.relevance,
          "ambient_pi",
          item.confidence,
          item.reason,
          item.authorityRole,
          item.includeInSynthesis ? 1 : 0,
          now,
          item.source.id,
          boardId,
        );
      }
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, boardId);
      const sourceKinds = projectBoardSourceKindCounts(updates);
      this.appendProjectBoardEvent({
        boardId,
        kind: "source_updated",
        title: "Sources classified by Pi",
        summary: `Ambient/Pi classified ${updates.length} project source${updates.length === 1 ? "" : "s"} for board synthesis.`,
        entityKind: "project_board",
        entityId: boardId,
        metadata: {
          classifiedBy: "ambient_pi",
          classificationCount: updates.length,
          sourceIds: updates.map((item) => item.source.id),
          sourceKeys: updates.map((item) => item.source.sourceKey ?? projectBoardSourceKey(item.source)),
          sourceKinds,
          model: updates.map((item) => item.model).find(Boolean),
        },
        createdAt: now,
      });
    });
    transaction();
    return this.listProjectBoardSources(boardId);
  }

  ensureProjectBoardQuestions(boardId: string): ProjectBoardQuestion[] {
    const existing = this.listProjectBoardQuestions(boardId);
    const existingTexts = new Set(existing.map((question) => question.question.trim().toLowerCase()));
    const missingQuestions = DEFAULT_PROJECT_BOARD_QUESTIONS.filter((question) => !existingTexts.has(question.trim().toLowerCase()));
    if (missingQuestions.length === 0) return existing;
    const now = new Date().toISOString();
    const maxOrder = this.requireDb()
      .prepare("SELECT COALESCE(MAX(question_order), -1) AS question_order FROM project_board_questions WHERE board_id = ?")
      .get(boardId) as { question_order: number };
    const insert = this.requireDb().prepare(
      `INSERT INTO project_board_questions
      (id, board_id, question_order, question, required, answer, answered_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const transaction = this.requireDb().transaction(() => {
      missingQuestions.forEach((question, index) => {
        insert.run(randomUUID(), boardId, maxOrder.question_order + index + 1, question, 1, null, null, now, now);
      });
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, boardId);
    });
    transaction();
    return this.listProjectBoardQuestions(boardId);
  }

  getProjectBoardQuestion(questionId: string): ProjectBoardQuestion {
    const row = this.requireDb()
      .prepare("SELECT * FROM project_board_questions WHERE id = ?")
      .get(questionId) as ProjectBoardQuestionRow | undefined;
    if (!row) throw new Error(`Project board question not found: ${questionId}`);
    const sources = row.suggestion_context_fingerprint ? this.listProjectBoardSources(row.board_id) : undefined;
    return mapProjectBoardQuestionRow(row, sources);
  }

  answerProjectBoardQuestion(questionId: string, answer: string): ProjectBoardQuestion {
    const trimmed = answer.trim();
    if (!trimmed) throw new Error("Project board question answer cannot be empty.");
    const current = this.requireDb()
      .prepare("SELECT * FROM project_board_questions WHERE id = ?")
      .get(questionId) as ProjectBoardQuestionRow | undefined;
    if (!current) throw new Error(`Project board question not found: ${questionId}`);
    const now = new Date().toISOString();
    this.requireDb()
      .prepare("UPDATE project_board_questions SET answer = ?, answered_at = ?, updated_at = ? WHERE id = ?")
      .run(trimmed, now, now, questionId);
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, current.board_id);
    this.appendProjectBoardEvent({
      boardId: current.board_id,
      kind: "question_answered",
      title: "Kickoff answer saved",
      summary: current.question,
      entityKind: "project_board_question",
      entityId: questionId,
      metadata: { questionId, answerLength: trimmed.length },
      createdAt: now,
    });
    const row = this.requireDb().prepare("SELECT * FROM project_board_questions WHERE id = ?").get(questionId) as ProjectBoardQuestionRow;
    return mapProjectBoardQuestionRow(row, this.listProjectBoardSources(current.board_id));
  }

  applyProjectBoardKickoffDefaultSuggestions(input: {
    boardId: string;
    suggestions: ProjectBoardKickoffDefaultSuggestion[];
    targetQuestionIds?: string[];
    model?: string;
    telemetry?: { promptCharCount?: number; responseCharCount?: number; requestDurationMs?: number };
    providerError?: string;
  }): ProjectBoardSummary {
    const board = this.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = new Date().toISOString();
    const targetQuestionIds = [
      ...new Set((input.targetQuestionIds?.length ? input.targetQuestionIds : input.suggestions.map((item) => item.questionId)).filter(Boolean)),
    ];
    const suggestionsByQuestionId = new Map(input.suggestions.map((suggestion) => [suggestion.questionId, suggestion]));
    const appliedQuestionIds: string[] = [];
    const skippedReasons: Record<string, string> = {};
    const updateSuggestion = this.requireDb().prepare(
      `UPDATE project_board_questions
       SET suggested_answer = ?,
           suggestion_rationale = ?,
           suggestion_confidence = ?,
           suggestion_source_ids_json = ?,
           suggestion_context_fingerprint = ?,
           suggestion_generated_at = ?,
           suggestion_model = ?,
           suggestion_provider_error = NULL,
           updated_at = ?
       WHERE id = ?
         AND board_id = ?
         AND (answer IS NULL OR trim(answer) = '')`,
    );
    const updateProviderError = this.requireDb().prepare(
      `UPDATE project_board_questions
       SET suggestion_provider_error = ?,
           suggestion_generated_at = ?,
           suggestion_model = ?,
           updated_at = ?
       WHERE id = ?
         AND board_id = ?
         AND (answer IS NULL OR trim(answer) = '')`,
    );

    for (const questionId of targetQuestionIds) {
      const current = board.questions.find((question) => question.id === questionId);
      if (!current) {
        skippedReasons[questionId] = "Question was not found on this board.";
        continue;
      }
      if (current.answer?.trim()) {
        skippedReasons[questionId] = "Question already has a saved answer.";
        continue;
      }
      const suggestion =
        suggestionsByQuestionId.get(questionId) ??
        input.suggestions.find((candidate) => projectBoardQuestionsAreNearDuplicates(candidate.question, current.question));
      if (!suggestion) {
        skippedReasons[questionId] = input.providerError
          ? "Ambient/Pi did not provide a default because the request failed."
          : "Ambient/Pi did not return a default for this question.";
        if (input.providerError) {
          updateProviderError.run(input.providerError.slice(0, 500), now, input.model ?? null, now, current.id, board.id);
        }
        continue;
      }
      const contextFingerprint =
        suggestion.contextFingerprint ||
        projectBoardKickoffDefaultContextFingerprint({ question: current.question, sources: board.sources });
      const result = updateSuggestion.run(
        suggestion.suggestedAnswer.trim().slice(0, 4000),
        suggestion.rationale.trim().slice(0, 1000),
        suggestion.confidence,
        JSON.stringify([...new Set(suggestion.sourceIds.filter((sourceId) => board.sources.some((source) => source.id === sourceId)))].slice(0, 20)),
        contextFingerprint,
        now,
        input.model ?? null,
        now,
        current.id,
        board.id,
      );
      if (result.changes <= 0) {
        skippedReasons[questionId] = "Question default metadata could not be updated.";
        continue;
      }
      appliedQuestionIds.push(questionId);
    }

    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, board.id);
    const skippedQuestionIds = targetQuestionIds.filter((questionId) => !appliedQuestionIds.includes(questionId));
    this.appendProjectBoardEvent({
      boardId: board.id,
      kind: "kickoff_defaults_suggested",
      title: input.providerError && appliedQuestionIds.length === 0 ? "Pi kickoff defaults unavailable" : "Kickoff defaults suggested",
      summary:
        appliedQuestionIds.length > 0
          ? `Ambient/Pi proposed ${appliedQuestionIds.length} editable kickoff default${appliedQuestionIds.length === 1 ? "" : "s"} from the current source scan.`
          : `No kickoff defaults were applied; ${skippedQuestionIds.length} question${skippedQuestionIds.length === 1 ? "" : "s"} skipped.`,
      entityKind: "project_board",
      entityId: board.id,
      metadata: {
        kickoffDefaults: {
          schemaVersion: 1,
          appliedAction: "suggest_source_derived_defaults",
          targetQuestionIds,
          appliedQuestionIds,
          skippedQuestionIds,
          skippedReasons,
          suggestedQuestionCount: appliedQuestionIds.length,
          modelCallRequired: true,
          ...(input.model ? { model: input.model } : {}),
          ...(typeof input.telemetry?.promptCharCount === "number" ? { promptCharCount: input.telemetry.promptCharCount } : {}),
          ...(typeof input.telemetry?.responseCharCount === "number" ? { responseCharCount: input.telemetry.responseCharCount } : {}),
          ...(typeof input.telemetry?.requestDurationMs === "number" ? { requestDurationMs: input.telemetry.requestDurationMs } : {}),
          ...(input.providerError ? { providerError: input.providerError.slice(0, 500) } : {}),
        },
        suggestions: input.suggestions.map((suggestion) => ({
          questionId: suggestion.questionId,
          question: suggestion.question,
          confidence: suggestion.confidence,
          sourceIds: suggestion.sourceIds,
          rationale: suggestion.rationale,
        })),
      },
      createdAt: now,
    });
    return this.getProjectBoard(board.id) ?? board;
  }

  finalizeProjectBoardKickoff(boardId: string): ProjectBoardSummary {
    const boardRow = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardRow | undefined;
    if (!boardRow) throw new Error(`Project board not found: ${boardId}`);
    const questions = this.listProjectBoardQuestions(boardId);
    const unanswered = questions.filter((question) => question.required && !question.answer?.trim());
    if (unanswered.length > 0) throw new Error("Answer required kickoff questions before finalizing the project board.");
    const charterId = boardRow.charter_id;
    if (!charterId) throw new Error("Project board has no charter to finalize.");
    const charterRow = this.requireDb().prepare("SELECT * FROM project_board_charters WHERE id = ?").get(charterId) as
      | ProjectBoardCharterRow
      | undefined;
    if (!charterRow) throw new Error(`Project board charter not found: ${charterId}`);
    const sources = this.listProjectBoardSources(boardId);
    const now = new Date().toISOString();
    const compiled = compileProjectBoardCharter(boardRow, questions, sources);
    const projectSummary = buildProjectBoardCharterProjectSummary({
      board: boardRow,
      questions,
      sources,
      compiled,
      generatedAt: now,
    });
    const transaction = this.requireDb().transaction(() => {
      this.requireDb()
        .prepare("UPDATE project_board_charters SET status = 'superseded', updated_at = ? WHERE board_id = ? AND id != ? AND status IN ('active', 'draft')")
        .run(now, boardId, charterId);
      this.requireDb()
        .prepare(
          `UPDATE project_board_charters
           SET status = 'active',
               goal = ?,
               current_state = ?,
               target_user = ?,
               non_goals_json = ?,
               quality_bar = ?,
               test_policy_json = ?,
               decision_policy_json = ?,
               dependency_policy_json = ?,
               budget_policy_json = ?,
               source_policy_json = ?,
               markdown = ?,
               project_summary_json = ?,
               updated_at = ?
           WHERE id = ?`,
        )
        .run(
          compiled.goal,
          compiled.currentState,
          compiled.targetUser,
          JSON.stringify(compiled.nonGoals),
          compiled.qualityBar,
          JSON.stringify(compiled.testPolicy),
          JSON.stringify(compiled.decisionPolicy),
          JSON.stringify(compiled.dependencyPolicy),
          JSON.stringify(compiled.budgetPolicy),
          JSON.stringify(compiled.sourcePolicy),
          compiled.markdown,
          JSON.stringify(projectSummary),
          now,
          charterId,
        );
      this.requireDb()
        .prepare("UPDATE project_boards SET status = 'active', summary = ?, updated_at = ? WHERE id = ?")
        .run(compiled.summary, now, boardId);
      this.appendProjectBoardEvent({
        boardId,
        kind: "charter_finalized",
        title: "Charter finalized",
        summary: compiled.goal,
        entityKind: "project_board_charter",
        entityId: charterId,
        metadata: { charterId, version: charterRow.version, sourceCount: sources.length, projectSummaryGenerator: projectSummary.generator },
        createdAt: now,
      });
    });
    transaction();
    const updated = this.getProjectBoard(boardId);
    if (!updated) throw new Error(`Project board not found after finalization: ${boardId}`);
    return updated;
  }

  buildActiveProjectBoardCharterProjectSummary(
    boardId: string,
    generatedAt = new Date().toISOString(),
  ): ProjectBoardCharterProjectSummary {
    const boardRow = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardRow | undefined;
    if (!boardRow) throw new Error(`Project board not found: ${boardId}`);
    const charterId = boardRow.charter_id;
    if (!charterId) throw new Error("Project board has no active charter.");
    const charterRow = this.requireDb().prepare("SELECT * FROM project_board_charters WHERE id = ?").get(charterId) as
      | ProjectBoardCharterRow
      | undefined;
    if (!charterRow) throw new Error(`Project board charter not found: ${charterId}`);
    const questions = this.listProjectBoardQuestions(boardId);
    const sources = this.listProjectBoardSources(boardId);
    return buildProjectBoardCharterProjectSummary({
      board: boardRow,
      questions,
      sources,
      compiled: {
        goal: charterRow.goal,
        currentState: charterRow.current_state,
        targetUser: charterRow.target_user,
        nonGoals: parseStringList(charterRow.non_goals_json),
        qualityBar: charterRow.quality_bar,
        testPolicy: parseJsonObject<Record<string, unknown>>(charterRow.test_policy_json, {}),
        decisionPolicy: parseJsonObject<Record<string, unknown>>(charterRow.decision_policy_json, {}),
        dependencyPolicy: parseJsonObject<Record<string, unknown>>(charterRow.dependency_policy_json, {}),
        budgetPolicy: parseJsonObject<Record<string, unknown>>(charterRow.budget_policy_json, {}),
        sourcePolicy: parseJsonObject<Record<string, unknown>>(charterRow.source_policy_json, {}),
        summary: charterRow.goal.slice(0, 500),
        markdown: charterRow.markdown,
      },
      generatedAt,
    });
  }

  updateProjectBoardCharterProjectSummary(input: {
    boardId: string;
    summary: ProjectBoardCharterProjectSummary;
    title?: string;
    eventSummary?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): ProjectBoardSummary {
    const boardRow = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(input.boardId) as ProjectBoardRow | undefined;
    if (!boardRow) throw new Error(`Project board not found: ${input.boardId}`);
    const charterId = boardRow.charter_id;
    if (!charterId) throw new Error("Project board has no active charter.");
    const now = input.createdAt ?? new Date().toISOString();
    const transaction = this.requireDb().transaction(() => {
      const result = this.requireDb()
        .prepare("UPDATE project_board_charters SET project_summary_json = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(input.summary), now, charterId);
      if (result.changes <= 0) throw new Error(`Project board charter not found: ${charterId}`);
      this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "charter_summary_refreshed",
        title: input.title?.trim() || "Charter project summary refreshed",
        summary: input.eventSummary?.trim() || `Updated active charter project summary using ${input.summary.generator}.`,
        entityKind: "project_board_charter",
        entityId: charterId,
        metadata: {
          generator: input.summary.generator,
          sourceChecksumCount: input.summary.sourceChecksumSet.length,
          charterAnswerChecksum: input.summary.charterAnswerChecksum,
          ...(input.metadata ?? {}),
        },
        createdAt: now,
      });
    });
    transaction();
    const updated = this.getProjectBoard(input.boardId);
    if (!updated) throw new Error(`Project board not found after charter summary update: ${input.boardId}`);
    return updated;
  }

  getProjectBoardCharter(charterId: string): ProjectBoardCharter {
    const row = this.requireDb().prepare("SELECT * FROM project_board_charters WHERE id = ?").get(charterId) as
      | ProjectBoardCharterRow
      | undefined;
    if (!row) throw new Error(`Project board charter not found: ${charterId}`);
    return mapProjectBoardCharterRow(row);
  }

  getAutomationAutoDispatchEnabled(): boolean {
    return this.settings().getAutomationAutoDispatchEnabled();
  }

  setAutomationAutoDispatchEnabled(enabled: boolean): void {
    this.settings().setAutomationAutoDispatchEnabled(enabled);
  }

  getLastActiveThreadId(): string | undefined {
    const value = this.settings().getSetting("lastActiveThreadId", "");
    if (typeof value !== "string" || !value.trim()) return undefined;
    const row = this.requireDb()
      .prepare("SELECT id FROM threads WHERE id = ? AND (archived_at IS NULL OR archived_at = '')")
      .get(value) as { id: string } | undefined;
    return row?.id;
  }

  setLastActiveThreadId(threadId: string): void {
    const row = this.requireDb().prepare("SELECT id FROM threads WHERE id = ?").get(threadId) as { id: string } | undefined;
    if (!row) return;
    this.settings().setSetting("lastActiveThreadId", threadId);
  }

  listThreads(): ThreadSummary[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM threads WHERE archived_at IS NULL OR archived_at = '' ORDER BY pinned DESC, updated_at DESC")
      .all() as ThreadRow[];
    return rows.map(this.mapThread);
  }

  private listThreadsForSubagentStateInspection(): ThreadSummary[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM threads ORDER BY pinned DESC, updated_at DESC")
      .all() as ThreadRow[];
    return rows.map(this.mapThread);
  }

  findReusableEmptyThread(): ThreadSummary | undefined {
    const row = this.requireDb()
      .prepare(
        `SELECT * FROM threads
         WHERE title = 'New chat'
           AND (archived_at IS NULL OR archived_at = '')
           AND (
             workspace_path = ?
             OR EXISTS (
               SELECT 1 FROM thread_worktrees
               WHERE thread_worktrees.thread_id = threads.id
                 AND thread_worktrees.project_root = ?
             )
           )
           AND last_message_preview = ''
           AND (pi_session_file IS NULL OR pi_session_file = '')
           AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.thread_id = threads.id)
           AND NOT EXISTS (SELECT 1 FROM runs WHERE runs.thread_id = threads.id)
           AND NOT EXISTS (SELECT 1 FROM orchestration_runs WHERE orchestration_runs.thread_id = threads.id)
           AND NOT EXISTS (SELECT 1 FROM context_usage_snapshots WHERE context_usage_snapshots.thread_id = threads.id)
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`,
      )
      .get(this.getWorkspace().path, this.getWorkspace().path) as ThreadRow | undefined;
    return row ? this.mapThread(row) : undefined;
  }

  getThread(threadId: string): ThreadSummary {
    const row = this.requireDb().prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as ThreadRow | undefined;
    if (!row) throw new Error(`Thread not found: ${threadId}`);
    return this.mapThread(row);
  }

  getThreadGoal(threadId: string): ThreadGoal | undefined {
    this.getThread(threadId);
    const row = this.requireDb().prepare("SELECT * FROM thread_goals WHERE thread_id = ?").get(threadId) as ThreadGoalRow | undefined;
    return row ? this.mapThreadGoal(row) : undefined;
  }

  setThreadGoal(input: ThreadGoalSetInput): ThreadGoal {
    const thread = this.getThread(input.threadId);
    const current = this.getThreadGoal(input.threadId);
    if (input.expectedGoalId && current?.goalId !== input.expectedGoalId) {
      throw new Error("Thread goal changed before this update could be applied.");
    }
    const objective = input.objective?.trim() ?? current?.objective;
    if (!objective) throw new Error("Goal objective is required.");
    const status = input.status ?? current?.status ?? "active";
    const resumedFromInactive = Boolean(current && current.status !== "active" && status === "active");
    const now = new Date().toISOString();
    const tokenBudget = Object.hasOwn(input, "tokenBudget")
      ? positiveIntegerOrNull(input.tokenBudget ?? null)
      : (current?.tokenBudget ?? null);
    const statusReason = Object.hasOwn(input, "statusReason")
      ? normalizedOptionalText(input.statusReason ?? null)
      : resumedFromInactive
        ? null
        : (current?.statusReason ?? null);
    const completedAt = status === "complete"
      ? (current?.completedAt ?? now)
      : terminalThreadGoalStatuses.has(status)
        ? current?.completedAt ?? null
        : null;

    if (current) {
      this.requireDb()
        .prepare(
          `UPDATE thread_goals
           SET objective = ?, status = ?, token_budget = ?, no_progress_turns = ?,
               status_reason = ?, updated_at = ?, completed_at = ?
           WHERE thread_id = ?`,
        )
        .run(
          objective,
          status,
          tokenBudget,
          resumedFromInactive ? 0 : current.noProgressTurns,
          statusReason,
          now,
          completedAt,
          input.threadId,
        );
    } else {
      this.requireDb()
        .prepare(
          `INSERT INTO thread_goals
          (thread_id, goal_id, objective, status, token_budget, tokens_used, time_used_seconds,
           continuation_turns, no_progress_turns, status_reason, created_at, updated_at, completed_at, last_continued_at)
           VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?, NULL)`,
        )
        .run(thread.id, randomUUID(), objective, status, tokenBudget, statusReason, now, now, completedAt);
    }
    return this.getThreadGoal(input.threadId)!;
  }

  createThreadGoalIfAbsent(input: ThreadGoalCreateInput): ThreadGoal {
    if (this.getThreadGoal(input.threadId)) throw new Error("Thread already has a goal.");
    return this.setThreadGoal({
      threadId: input.threadId,
      objective: input.objective,
      status: "active",
      tokenBudget: input.tokenBudget ?? null,
    });
  }

  clearThreadGoal(threadId: string, expectedGoalId?: string): ThreadGoal | undefined {
    const current = this.getThreadGoal(threadId);
    if (!current) return undefined;
    if (expectedGoalId && current.goalId !== expectedGoalId) {
      throw new Error("Thread goal changed before it could be cleared.");
    }
    this.requireDb().prepare("DELETE FROM thread_goals WHERE thread_id = ?").run(threadId);
    return current;
  }

  accountThreadGoalUsage(input: ThreadGoalAccountInput): ThreadGoal | undefined {
    const current = this.getThreadGoal(input.threadId);
    if (!current || current.goalId !== input.goalId) return current;
    const tokensUsedDelta = Math.max(0, Math.floor(input.tokensUsedDelta ?? 0));
    const timeUsedSecondsDelta = Math.max(0, Math.floor(input.timeUsedSecondsDelta ?? 0));
    const continuationTurnDelta = Math.max(0, Math.floor(input.continuationTurnDelta ?? 0));
    const noProgressTurnDelta = Math.max(0, Math.floor(input.noProgressTurnDelta ?? 0));
    const tokensUsed = current.tokensUsed + tokensUsedDelta;
    const nextStatus = current.tokenBudget !== undefined && tokensUsed >= current.tokenBudget && current.status === "active"
      ? "budget_limited"
      : current.status;
    const statusReason = nextStatus === "budget_limited"
      ? "Goal token budget reached."
      : Object.hasOwn(input, "statusReason")
        ? normalizedOptionalText(input.statusReason ?? null)
        : (current.statusReason ?? null);
    const now = new Date().toISOString();
    const lastContinuedAt = continuationTurnDelta > 0 ? now : (current.lastContinuedAt ?? null);
    this.requireDb()
      .prepare(
        `UPDATE thread_goals
         SET tokens_used = ?, time_used_seconds = ?, continuation_turns = ?, no_progress_turns = ?,
             status = ?, status_reason = ?, updated_at = ?, last_continued_at = ?
         WHERE thread_id = ? AND goal_id = ?`,
      )
      .run(
        tokensUsed,
        current.timeUsedSeconds + timeUsedSecondsDelta,
        current.continuationTurns + continuationTurnDelta,
        current.noProgressTurns + noProgressTurnDelta,
        nextStatus,
        statusReason,
        now,
        lastContinuedAt,
        input.threadId,
        input.goalId,
      );
    return this.getThreadGoal(input.threadId);
  }

  markThreadGoalStatus(
    threadId: string,
    status: ThreadGoalStatus,
    options: { expectedGoalId?: string; statusReason?: string | null } = {},
  ): ThreadGoal {
    return this.setThreadGoal({
      threadId,
      status,
      expectedGoalId: options.expectedGoalId,
      statusReason: options.statusReason ?? null,
    });
  }

  private tryGetThread(threadId: string): ThreadSummary | undefined {
    const row = this.requireDb().prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as ThreadRow | undefined;
    return row ? this.mapThread(row) : undefined;
  }

  createThread(title = "New chat", workspacePath = this.getWorkspace().path, options: CreateThreadOptions = {}): ThreadSummary {
    const now = new Date().toISOString();
    const settings = this.getDefaultSettings();
    const permissionMode = options.permissionMode ?? settings.permissionMode;
    const collaborationMode = options.collaborationMode ?? settings.collaborationMode;
    const model = options.model ?? settings.model;
    const thinkingLevel = options.thinkingLevel ?? settings.thinkingLevel;
    const memoryEnabled = settings.memory.defaultThreadEnabled;
    const kind = options.kind ?? "chat";
    const id = randomUUID();
    this.requireDb()
      .prepare(
        `INSERT INTO threads
        (id, title, workspace_path, kind, parent_thread_id, parent_message_id, parent_run_id, subagent_run_id,
         canonical_task_path, child_order, collapsed_by_default, child_status,
         created_at, updated_at, last_read_at, last_message_preview, permission_mode, collaboration_mode, model, thinking_level, memory_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        title,
        workspacePath,
        kind,
        options.parentThreadId ?? null,
        options.parentMessageId ?? null,
        options.parentRunId ?? null,
        options.subagentRunId ?? null,
        options.canonicalTaskPath ?? null,
        options.childOrder ?? null,
        options.collapsedByDefault ? 1 : 0,
        options.childStatus ?? null,
        now,
        now,
        now,
        "",
        permissionMode,
        collaborationMode,
        model,
        thinkingLevel,
        memoryEnabled ? 1 : 0,
      );
    return this.getThread(id);
  }

  createSubagentRun(input: CreateSubagentRunInput): SubagentRunSummary {
    if (!isAmbientSubagentsEnabled(input.featureFlagSnapshot)) {
      throw new Error("ambient.subagents is disabled; refusing to create sub-agent child thread.");
    }
    const parent = this.getThread(input.parentThreadId);
    if (parent.kind === "subagent_child") {
      throw new Error("Nested sub-agent runs require an explicit later-phase fanout policy.");
    }
    const now = new Date().toISOString();
    const childRunId = randomUUID();
    const childOrder = input.childOrder ?? this.nextSubagentChildOrder(input.parentThreadId);
    const roleProfileSnapshot = input.roleProfileSnapshot ?? getDefaultSubagentRoleProfile(input.roleId as SubagentRoleId);
    if (roleProfileSnapshot.id !== input.roleId) {
      throw new Error(`Sub-agent role profile snapshot ${roleProfileSnapshot.id} does not match requested role ${input.roleId}.`);
    }
    if (input.effectiveRoleSnapshot && !isSubagentEffectiveRoleSnapshot(input.effectiveRoleSnapshot, input.roleId)) {
      throw new Error(`Sub-agent effective role snapshot does not match requested role ${input.roleId}.`);
    }
    let childThread: ThreadSummary | undefined;
    const insertRun = this.requireDb().transaction(() => {
      childThread = this.createThread(input.title, parent.workspacePath, {
        kind: "subagent_child",
        parentThreadId: input.parentThreadId,
        parentMessageId: input.parentMessageId,
        parentRunId: input.parentRunId,
        subagentRunId: childRunId,
        canonicalTaskPath: input.canonicalTaskPath,
        childOrder,
        collapsedByDefault: true,
        childStatus: "reserved",
        collaborationMode: parent.collaborationMode,
        permissionMode: parent.permissionMode,
        model: input.modelRuntimeSnapshot.profile.modelId,
        thinkingLevel: parent.thinkingLevel,
      });
      const capacityLeaseSnapshot = materializeSubagentCapacityLeaseForRun(
        input.capacityLeaseSnapshot ?? fallbackSubagentCapacityLease({
          parentThreadId: input.parentThreadId,
          parentRunId: input.parentRunId,
          canonicalTaskPath: input.canonicalTaskPath,
          roleId: input.roleId,
          model: input.modelRuntimeSnapshot.profile,
          now,
        }),
        {
          childRunId,
          childThreadId: childThread.id,
          canonicalTaskPath: input.canonicalTaskPath,
          parentThreadId: input.parentThreadId,
          parentRunId: input.parentRunId,
          roleId: input.roleId,
        },
      );

      assertSubagentRunLinkage({
        runId: childRunId,
        parentRunId: input.parentRunId,
        parentThreadId: input.parentThreadId,
        childThreadId: childThread.id,
        canonicalPath: input.canonicalTaskPath,
        roleId: input.roleId,
        featureFlags: input.featureFlagSnapshot,
        capacityLeaseSnapshot,
      });

      this.requireDb()
        .prepare(
          `INSERT INTO subagent_runs
          (id, protocol_version, parent_thread_id, parent_run_id, parent_message_id, child_thread_id,
           canonical_task_path, role_id, role_profile_snapshot_json, effective_role_snapshot_json, dependency_mode, status, feature_flag_snapshot_json,
           model_runtime_snapshot_json, capacity_lease_snapshot_json, result_artifact_json, created_at, updated_at,
           started_at, completed_at, closed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL)`,
        )
        .run(
          childRunId,
          AMBIENT_SUBAGENT_PROTOCOL_VERSION,
          input.parentThreadId,
          input.parentRunId,
          input.parentMessageId ?? null,
          childThread.id,
          input.canonicalTaskPath,
          input.roleId,
          JSON.stringify(roleProfileSnapshot),
          input.effectiveRoleSnapshot ? JSON.stringify(input.effectiveRoleSnapshot) : null,
          input.dependencyMode ?? "optional_background",
          "reserved",
          JSON.stringify(input.featureFlagSnapshot),
          JSON.stringify(input.modelRuntimeSnapshot),
          JSON.stringify(capacityLeaseSnapshot),
          now,
          now,
        );
      this.requireDb()
        .prepare(
          `INSERT INTO subagent_spawn_edges
          (parent_run_id, child_run_id, parent_thread_id, child_thread_id, canonical_task_path, depth, status, capacity_released_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, NULL, ?, ?)`,
        )
        .run(input.parentRunId, childRunId, input.parentThreadId, childThread.id, input.canonicalTaskPath, "reserved", now, now);
      this.appendSubagentRunEventInternal(childRunId, {
        type: "subagent.reserved",
          preview: {
            childThreadId: childThread.id,
            canonicalTaskPath: input.canonicalTaskPath,
            roleId: input.roleId,
            effectiveRole: input.effectiveRoleSnapshot
              ? {
                displayLabel: input.effectiveRoleSnapshot.displayLabel,
                patternRole: input.effectiveRoleSnapshot.patternRole,
                roleOverlayIds: input.effectiveRoleSnapshot.roleOverlayIds,
              }
              : undefined,
            capacityLease: compactSubagentCapacityLeasePreview(capacityLeaseSnapshot),
          },
        createdAt: now,
      });
      const run = this.getSubagentRun(childRunId);
      this.appendSubagentRunEventInternal(run.id, {
        type: subagentLifecycleEventType("SubagentStart"),
        preview: subagentLifecycleHookPreview({
          hook: "SubagentStart",
          run,
          createdAt: run.createdAt,
        }),
        createdAt: run.createdAt,
      });
    });
    insertRun();
    return this.getSubagentRun(childRunId);
  }

  getSubagentRun(runId: string): SubagentRunSummary {
    const row = this.requireDb().prepare("SELECT * FROM subagent_runs WHERE id = ?").get(runId) as SubagentRunRow | undefined;
    if (!row) throw new Error(`Sub-agent run not found: ${runId}`);
    return this.mapSubagentRun(row);
  }

  listSubagentRunsForParentThread(parentThreadId: string): SubagentRunSummary[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM subagent_runs WHERE parent_thread_id = ? ORDER BY created_at ASC")
      .all(parentThreadId) as SubagentRunRow[];
    return rows.map(this.mapSubagentRun);
  }

  listAllSubagentRuns(): SubagentRunSummary[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM subagent_runs ORDER BY created_at ASC")
      .all() as SubagentRunRow[];
    return rows.map(this.mapSubagentRun);
  }

  upsertSubagentBatchJobPlan(
    plan: SubagentBatchJobPlan,
    options: { featureFlagSnapshot: AmbientFeatureFlagSnapshot },
  ): SubagentBatchJobRecord {
    if (!isAmbientSubagentsEnabled(options.featureFlagSnapshot)) {
      throw new Error("Sub-agent batch jobs are disabled while ambient.subagents is off.");
    }
    this.getThread(plan.parentThreadId);
    const existing = this.getSubagentBatchJob(plan.jobId);
    if (existing) {
      if (JSON.stringify(existing.plan) !== JSON.stringify(plan)) {
        throw new Error(`Sub-agent batch job ${plan.jobId} already exists with a different plan.`);
      }
      this.upsertSubagentBatchProgressNotificationForRecord(existing, existing.updatedAt);
      return existing;
    }
    const ledger = createSubagentBatchResultLedger(plan);
    this.requireDb()
      .prepare(
        `INSERT INTO subagent_batch_jobs
        (id, parent_thread_id, parent_run_id, canonical_task_path, plan_json, ledger_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        plan.jobId,
        plan.parentThreadId,
        plan.parentRunId,
        plan.canonicalTaskPath,
        JSON.stringify(plan),
        JSON.stringify(ledger),
        plan.createdAt,
        plan.createdAt,
      );
    const record = this.getSubagentBatchJob(plan.jobId)!;
    this.upsertSubagentBatchProgressNotificationForRecord(record, plan.createdAt);
    return record;
  }

  getSubagentBatchJob(jobId: string): SubagentBatchJobRecord | undefined {
    const row = this.requireDb()
      .prepare("SELECT * FROM subagent_batch_jobs WHERE id = ?")
      .get(jobId) as SubagentBatchJobRow | undefined;
    return row ? this.mapSubagentBatchJob(row) : undefined;
  }

  listSubagentBatchJobsForParentRun(parentRunId: string): SubagentBatchJobRecord[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM subagent_batch_jobs WHERE parent_run_id = ? ORDER BY created_at ASC, id ASC")
      .all(parentRunId) as SubagentBatchJobRow[];
    return rows.map(this.mapSubagentBatchJob);
  }

  listSubagentBatchResultReports(jobId: string): SubagentBatchResultReport[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM subagent_batch_result_reports WHERE job_id = ? ORDER BY created_at ASC, report_id ASC")
      .all(jobId) as SubagentBatchResultReportRow[];
    return rows.map(this.mapSubagentBatchResultReport);
  }

  applySubagentBatchResultReport(report: SubagentBatchResultReport): SubagentBatchReportApplyResult {
    const db = this.requireDb();
    const apply = db.transaction(() => {
      const row = db.prepare("SELECT * FROM subagent_batch_jobs WHERE id = ?").get(report.jobId) as SubagentBatchJobRow | undefined;
      if (!row) throw new Error(`Sub-agent batch job not found: ${report.jobId}`);
      const record = this.mapSubagentBatchJob(row);
      const result = applySubagentBatchResultReportToLedger({
        plan: record.plan,
        ledger: record.ledger,
        report,
      });
      if (result.outcome !== "accepted") return result;
      db.prepare("UPDATE subagent_batch_jobs SET ledger_json = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(result.ledger), report.createdAt, report.jobId);
      db.prepare(
        `INSERT INTO subagent_batch_result_reports
        (job_id, report_id, item_id, child_run_id, report_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        report.jobId,
        report.reportId,
        report.itemId,
        report.childRunId,
        JSON.stringify(report),
        report.createdAt,
      );
      this.upsertSubagentBatchProgressNotificationForRecord({
        ...record,
        ledger: result.ledger,
        updatedAt: report.createdAt,
      }, report.createdAt);
      return result;
    });
    return apply();
  }

  upsertSubagentBatchProgressNotification(jobId: string, input: { createdAt?: string } = {}): SubagentParentMailboxEventSummary {
    const record = this.getSubagentBatchJob(jobId);
    if (!record) throw new Error(`Sub-agent batch job not found: ${jobId}`);
    return this.upsertSubagentBatchProgressNotificationForRecord(record, input.createdAt ?? record.updatedAt);
  }

  getSubagentObservabilitySummary(input: { parentRunId?: string; createdAt?: string } = {}): SubagentObservabilitySummary {
    const runs = input.parentRunId
      ? this.listAllSubagentRuns().filter((run) => run.parentRunId === input.parentRunId)
      : this.listAllSubagentRuns();
    const parentRunIds = input.parentRunId
      ? [input.parentRunId]
      : [...new Set(runs.map((run) => run.parentRunId))];
    return summarizeSubagentObservability({
      runs,
      runEvents: runs.flatMap((run) => this.listSubagentRunEvents(run.id)),
      waitBarriers: input.parentRunId
        ? this.listSubagentWaitBarriersForParentRun(input.parentRunId)
        : this.listSubagentWaitBarriers(),
      parentMailboxEvents: parentRunIds.flatMap((parentRunId) => this.listSubagentParentMailboxEventsForParentRun(parentRunId)),
      toolScopeSnapshots: runs.flatMap((run) => this.listSubagentToolScopeSnapshots(run.id)),
      createdAt: input.createdAt,
    });
  }

  recordSubagentMaturityEvidence(input: {
    kind: SubagentMaturityEvidenceKind;
    status: SubagentMaturityEvidenceStatus;
    evidenceKey?: string;
    runId?: string;
    parentRunId?: string;
    artifactPath?: string;
    reviewer?: string;
    notes?: string;
    details?: Record<string, unknown>;
    createdAt?: string;
  }): SubagentMaturityEvidence {
    const kind = normalizeSubagentMaturityEvidenceKind(input.kind);
    const status = normalizeSubagentMaturityEvidenceStatus(input.status);
    const now = input.createdAt ?? new Date().toISOString();
    const run = input.runId ? this.getSubagentRun(input.runId) : undefined;
    const evidenceKey = normalizeOptionalString(input.evidenceKey) ?? (run ? `${kind}:${run.id}` : undefined);
    const parentRunId = normalizeOptionalString(input.parentRunId) ?? run?.parentRunId;
    const existing = evidenceKey ? this.findSubagentMaturityEvidenceByKey(kind, evidenceKey) : undefined;
    const detailsJson = input.details === undefined ? null : JSON.stringify(input.details);
    if (existing) {
      this.requireDb()
        .prepare(
          `UPDATE subagent_maturity_evidence
           SET status = ?, run_id = ?, parent_run_id = ?, artifact_path = ?, reviewer = ?, notes = ?, details_json = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          status,
          run?.id ?? null,
          parentRunId ?? null,
          normalizeOptionalString(input.artifactPath) ?? null,
          normalizeOptionalString(input.reviewer) ?? null,
          normalizeOptionalString(input.notes) ?? null,
          detailsJson,
          now,
          existing.id,
        );
      return this.getSubagentMaturityEvidence(existing.id);
    }
    const id = randomUUID();
    this.requireDb()
      .prepare(
        `INSERT INTO subagent_maturity_evidence
         (id, kind, evidence_key, status, run_id, parent_run_id, artifact_path, reviewer, notes, details_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        kind,
        evidenceKey ?? null,
        status,
        run?.id ?? null,
        parentRunId ?? null,
        normalizeOptionalString(input.artifactPath) ?? null,
        normalizeOptionalString(input.reviewer) ?? null,
        normalizeOptionalString(input.notes) ?? null,
        detailsJson,
        now,
        now,
      );
    return this.getSubagentMaturityEvidence(id);
  }

  getSubagentMaturityEvidence(id: string): SubagentMaturityEvidence {
    const row = this.requireDb()
      .prepare("SELECT * FROM subagent_maturity_evidence WHERE id = ?")
      .get(id) as SubagentMaturityEvidenceRow | undefined;
    if (!row) throw new Error(`Sub-agent maturity evidence not found: ${id}`);
    return this.mapSubagentMaturityEvidence(row);
  }

  listSubagentMaturityEvidence(kind?: SubagentMaturityEvidenceKind): SubagentMaturityEvidence[] {
    if (kind) {
      const normalizedKind = normalizeSubagentMaturityEvidenceKind(kind);
      const rows = this.requireDb()
        .prepare("SELECT * FROM subagent_maturity_evidence WHERE kind = ? ORDER BY created_at ASC, id ASC")
        .all(normalizedKind) as SubagentMaturityEvidenceRow[];
      return rows.map(this.mapSubagentMaturityEvidence);
    }
    const rows = this.requireDb()
      .prepare("SELECT * FROM subagent_maturity_evidence ORDER BY created_at ASC, id ASC")
      .all() as SubagentMaturityEvidenceRow[];
    return rows.map(this.mapSubagentMaturityEvidence);
  }

  getSubagentMaturitySnapshot(input: Omit<SubagentMaturityInput, "observability" | "restartReconciliation"> = {}): SubagentMaturitySnapshot {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const evidence = this.listSubagentMaturityEvidence();
    const latestLiveSmoke = latestSubagentMaturityEvidence(evidence, "live_pi_smoke");
    const latestRestartRecovery = latestSubagentMaturityEvidence(evidence, "restart_recovery");
    const latestCompletionGuardVisibility = latestSubagentMaturityEvidence(evidence, "completion_guard_visibility");
    const latestApprovalRoutingVisibility = latestSubagentMaturityEvidence(evidence, "approval_routing_visibility");
    const latestProductionUiVisibility = latestSubagentMaturityEvidence(evidence, "production_ui_visibility");
    const latestEventAttributionIntegrity = latestSubagentMaturityEvidence(evidence, "event_attribution_integrity");
    const latestLifecycleControlIntegrity = latestSubagentMaturityEvidence(evidence, "lifecycle_control_integrity");
    const latestRetentionPolicyIntegrity = latestSubagentMaturityEvidence(evidence, "retention_policy_integrity");
    const latestToolScopeIntegrity = latestSubagentMaturityEvidence(evidence, "tool_scope_integrity");
    const latestLifecycleBugAudit = latestSubagentMaturityEvidence(evidence, "lifecycle_bug_audit");
    const latestPermissionBugAudit = latestSubagentMaturityEvidence(evidence, "permission_bug_audit");
    const latestSecurityReview = latestSubagentMaturityEvidence(evidence, "security_review");
    const latestWorkflowJitterReleaseProfile = latestSubagentMaturityEvidence(evidence, "workflow_jitter_release_profile");
    const liveReleaseGateHistory = input.liveReleaseGateHistory ?? subagentReleaseGateLiveHistoryFromMaturityEvidence(evidence);
    const desktopDogfoodHistory = input.desktopDogfoodHistory ?? subagentDesktopDogfoodHistoryFromMaturityEvidence(evidence);
    const subagentRuns = this.listAllSubagentRuns();
    const subagentRunEvents = subagentRuns.flatMap((run) => this.listSubagentRunEvents(run.id));
    return evaluateSubagentMaturity({
      ...input,
      createdAt,
      featureFlags: input.featureFlags ?? resolveAmbientFeatureFlags({
        settings: this.getFeatureFlagSettings(),
        generatedAt: createdAt,
      }),
      liveReleaseGateHistory,
      desktopDogfoodHistory,
      workflowJitterReleaseProfile: input.workflowJitterReleaseProfile ?? subagentWorkflowJitterReleaseProfileFromEvidence(latestWorkflowJitterReleaseProfile),
      liveDogfoodRunCount: input.liveDogfoodRunCount ?? (liveReleaseGateHistory ? undefined : passedSubagentMaturityEvidenceCount(evidence, "live_dogfood_run")),
      desktopDogfoodRunCount: input.desktopDogfoodRunCount ?? (desktopDogfoodHistory ? undefined : passedSubagentMaturityEvidenceCount(evidence, "desktop_dogfood_run")),
      livePiSmokePassed: input.livePiSmokePassed ?? subagentMaturityEvidencePassed(latestLiveSmoke),
      restartRecoveryValidated: input.restartRecoveryValidated ?? subagentMaturityEvidencePassed(latestRestartRecovery),
      completionGuardVisibilityValidated: input.completionGuardVisibilityValidated ?? subagentMaturityEvidencePassed(latestCompletionGuardVisibility),
      completionGuardVisibility: input.completionGuardVisibility ?? subagentCompletionGuardVisibilityFromEvidence(latestCompletionGuardVisibility),
      approvalRoutingVisibilityValidated: input.approvalRoutingVisibilityValidated ?? subagentMaturityEvidencePassed(latestApprovalRoutingVisibility),
      approvalRoutingVisibility: input.approvalRoutingVisibility ?? subagentApprovalRoutingVisibilityFromEvidence(latestApprovalRoutingVisibility),
      productionUiVisibilityValidated: input.productionUiVisibilityValidated ?? subagentMaturityEvidencePassed(latestProductionUiVisibility),
      productionUiVisibility: input.productionUiVisibility ?? subagentProductionUiVisibilityFromEvidence(latestProductionUiVisibility),
      eventAttributionIntegrityValidated: input.eventAttributionIntegrityValidated ?? subagentMaturityEvidencePassed(latestEventAttributionIntegrity),
      eventAttributionIntegrity: input.eventAttributionIntegrity ?? subagentEventAttributionIntegrityFromEvidence(latestEventAttributionIntegrity),
      lifecycleControlIntegrityValidated: input.lifecycleControlIntegrityValidated ?? subagentMaturityEvidencePassed(latestLifecycleControlIntegrity),
      lifecycleControlIntegrity: input.lifecycleControlIntegrity ?? subagentLifecycleControlIntegrityFromEvidence(latestLifecycleControlIntegrity),
      retentionPolicyIntegrityValidated: input.retentionPolicyIntegrityValidated ?? subagentMaturityEvidencePassed(latestRetentionPolicyIntegrity),
      retentionPolicyIntegrity: input.retentionPolicyIntegrity ?? subagentRetentionPolicyIntegrityFromEvidence(latestRetentionPolicyIntegrity),
      toolScopeIntegrityValidated: input.toolScopeIntegrityValidated ?? subagentMaturityEvidencePassed(latestToolScopeIntegrity),
      toolScopeIntegrity: input.toolScopeIntegrity ?? subagentToolScopeIntegrityFromEvidence(latestToolScopeIntegrity),
      lifecycleBugs: input.lifecycleBugs ?? subagentBugEvidenceFromAudit(latestLifecycleBugAudit),
      permissionBugs: input.permissionBugs ?? subagentBugEvidenceFromAudit(latestPermissionBugAudit),
      securityReview: input.securityReview ?? subagentSecurityReviewFromEvidence(latestSecurityReview),
      observability: this.getSubagentObservabilitySummary({ createdAt }),
      restartReconciliation: analyzeSubagentRestartState({
        threads: this.listThreadsForSubagentStateInspection(),
        runs: subagentRuns,
        runEvents: subagentRunEvents,
        spawnEdges: this.listSubagentSpawnEdges(),
        promptSnapshots: subagentRuns.flatMap((run) => this.listSubagentPromptSnapshots(run.id)),
        toolScopeSnapshots: subagentRuns.flatMap((run) => this.listSubagentToolScopeSnapshots(run.id)),
        waitBarriers: this.listSubagentWaitBarriers(),
        createdAt,
      }),
    });
  }

  getSubagentRetentionPlan(input: { now?: string; cleanupWindowMs?: number; maxRetainedChildrenPerParent?: number } = {}): SubagentRetentionPlan {
    return planSubagentRetention({
      runs: this.listAllSubagentRuns(),
      threads: this.listThreadsForSubagentStateInspection(),
      now: input.now,
      cleanupWindowMs: input.cleanupWindowMs,
      maxRetainedChildrenPerParent: input.maxRetainedChildrenPerParent,
      waitBarriers: this.listSubagentWaitBarriers(),
    });
  }

  applySubagentRetentionCleanup(input: {
    featureFlagSnapshot: AmbientFeatureFlagSnapshot;
    now?: string;
    cleanupWindowMs?: number;
    maxRetainedChildrenPerParent?: number;
  }): SubagentRetentionCleanupResult {
    const now = input.now ?? new Date().toISOString();
    const plan = this.getSubagentRetentionPlan({
      now,
      cleanupWindowMs: input.cleanupWindowMs,
      maxRetainedChildrenPerParent: input.maxRetainedChildrenPerParent,
    });
    if (!isAmbientSubagentsEnabled(input.featureFlagSnapshot)) {
      return {
        schemaVersion: "ambient-subagent-retention-cleanup-v1",
        createdAt: now,
        mode: "archive_child_threads",
        skipped: true,
        skipReason: "ambient_subagents_disabled",
        featureFlagSnapshot: input.featureFlagSnapshot,
        plan,
        archivedRunIds: [],
        archivedThreadIds: [],
        skippedRunIds: plan.eligibleRunIds,
      };
    }
    const archivedRunIds: string[] = [];
    const archivedThreadIds: string[] = [];
    const skippedRunIds: string[] = [];
    const db = this.requireDb();
    const archiveThread = db.prepare(
      `UPDATE threads
       SET archived_at = ?, updated_at = ?
       WHERE id = ?
         AND kind = 'subagent_child'
         AND (archived_at IS NULL OR archived_at = '')`,
    );
    for (const decision of plan.decisions) {
      if (decision.action !== "eligible_for_cleanup") continue;
      const result = archiveThread.run(now, now, decision.childThreadId);
      if (Number(result.changes || 0) === 0) {
        skippedRunIds.push(decision.runId);
        continue;
      }
      archivedRunIds.push(decision.runId);
      archivedThreadIds.push(decision.childThreadId);
      this.appendSubagentRunEventInternal(decision.runId, {
        type: "subagent.retention_archived",
        preview: {
          childThreadId: decision.childThreadId,
          parentThreadId: decision.parentThreadId,
          reason: decision.reason,
          retentionDefault: decision.retentionDefault,
          parentArchived: decision.parentArchived,
          ...(decision.parentArchivedAt ? { parentArchivedAt: decision.parentArchivedAt } : {}),
          retentionPlanCreatedAt: plan.createdAt,
          cleanupWindowMs: plan.cleanupWindowMs,
          maxRetainedChildrenPerParent: plan.maxRetainedChildrenPerParent,
          transcriptRetained: true,
          artifactsRetained: true,
        },
        createdAt: now,
      });
    }
    return {
      schemaVersion: "ambient-subagent-retention-cleanup-v1",
      createdAt: now,
      mode: "archive_child_threads",
      plan,
      archivedRunIds,
      archivedThreadIds,
      skippedRunIds,
    };
  }

  cascadeSubagentParentRunStopped(input: {
    parentThreadId: string;
    parentRunId: string;
    reason: string;
    featureFlagSnapshot: AmbientFeatureFlagSnapshot;
    now?: string;
  }): {
    parentThreadId: string;
    parentRunId: string;
    featureFlagSnapshot: AmbientFeatureFlagSnapshot;
    subagentsDisabledSafetyCascade: boolean;
    parentCancellationRequested: boolean;
    cancelledRunIds: string[];
    detachedRunIds: string[];
    unchangedRunIds: string[];
    cancelledWaitBarrierIds: string[];
    cancelledMailboxEventIds: string[];
    parentMailboxEventId?: string;
  } {
    const now = input.now ?? new Date().toISOString();
    const subagentsDisabledSafetyCascade = !isAmbientSubagentsEnabled(input.featureFlagSnapshot);
    const runs = this.listAllSubagentRuns().filter((run) =>
      run.parentThreadId === input.parentThreadId && run.parentRunId === input.parentRunId
    );
    const cancelledRunIds: string[] = [];
    const detachedRunIds: string[] = [];
    const unchangedRunIds: string[] = [];
    const cancelledMailboxEventIds: string[] = [];

    for (const run of runs) {
      if (subagentRunStatusIsTerminal(run.status)) {
        unchangedRunIds.push(run.id);
        continue;
      }
      const status: Extract<SubagentRunStatus, "cancelled" | "detached"> =
        run.dependencyMode === "optional_background" ? "detached" : "cancelled";
      const summary = status === "detached"
        ? `Parent run stopped; optional background child was detached. ${input.reason}`
        : `Parent run stopped; child was cancelled. ${input.reason}`;
      const updated = this.markSubagentRunStatus(run.id, status, {
        now,
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: run.id,
          status,
          partial: false,
          summary,
          childThreadId: run.childThreadId,
        },
      });
      const cancelledMailboxEvents = status === "cancelled"
        ? cancelPendingParentToChildMailboxEvents(this, { runId: updated.id, now }).events
        : [];
      cancelledMailboxEventIds.push(...cancelledMailboxEvents.map((event) => event.id));
      this.appendSubagentRunEvent(updated.id, {
        type: "subagent.parent_stopped",
        preview: {
          previousStatus: run.status,
          status,
          reason: input.reason,
          parentThreadId: input.parentThreadId,
          parentRunId: input.parentRunId,
          featureFlagSnapshot: input.featureFlagSnapshot,
          ...(subagentsDisabledSafetyCascade ? { subagentsDisabledSafetyCascade } : {}),
          ...(cancelledMailboxEvents.length ? {
            cancelledMailboxEvents: cancelledMailboxEvents.map(compactSubagentMailboxEventForPreview),
          } : {}),
        },
        createdAt: now,
      });
      if (status === "detached") detachedRunIds.push(run.id);
      else cancelledRunIds.push(run.id);
    }

    const childStatuses = runs.map((run) => ({
      childRunId: run.id,
      status: this.getSubagentRun(run.id).status,
    }));
    const cancelledWaitBarrierIds = this.listSubagentWaitBarriersForParentRun(input.parentRunId)
      .filter((barrier) => barrier.parentThreadId === input.parentThreadId && barrier.status === "waiting_on_children")
      .map((barrier) => this.updateSubagentWaitBarrierStatus(barrier.id, "cancelled", {
        now,
        resolutionArtifact: {
          ...(barrier.resolutionArtifact && typeof barrier.resolutionArtifact === "object" && !Array.isArray(barrier.resolutionArtifact)
            ? barrier.resolutionArtifact as Record<string, unknown>
            : {}),
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: barrier.childRunIds,
          parentStopped: true,
          parentCancellationRequested: true,
          reason: input.reason,
          synthesisAllowed: false,
          featureFlagSnapshot: input.featureFlagSnapshot,
          ...(subagentsDisabledSafetyCascade ? { subagentsDisabledSafetyCascade } : {}),
          childStatuses: childStatuses.filter((child) => barrier.childRunIds.includes(child.childRunId)),
        },
      }).id);

    let parentMailboxEventId: string | undefined;
    if (cancelledRunIds.length || detachedRunIds.length || cancelledWaitBarrierIds.length) {
      const parentMessageId = runs.find((run) => run.parentMessageId)?.parentMessageId;
      const event = this.appendSubagentParentMailboxEvent({
        parentThreadId: input.parentThreadId,
        parentRunId: input.parentRunId,
        parentMessageId,
        type: "subagent.cancellation_cascade",
        payload: {
          schemaVersion: "ambient-subagent-cancellation-cascade-v1",
          parentThreadId: input.parentThreadId,
          parentRunId: input.parentRunId,
          ...(parentMessageId ? { parentMessageId } : {}),
          parentStopped: true,
          parentCancellationRequested: true,
          reason: input.reason,
          featureFlagSnapshot: input.featureFlagSnapshot,
          ...(subagentsDisabledSafetyCascade ? { subagentsDisabledSafetyCascade } : {}),
          cancelledRunIds,
          detachedRunIds,
          unchangedRunIds,
          cancelledWaitBarrierIds,
          cancelledMailboxEventIds,
        },
        idempotencyKey: `subagent:parent_stopped:${input.parentRunId}`,
        createdAt: now,
      });
      parentMailboxEventId = event.id;
    }

    return {
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      featureFlagSnapshot: input.featureFlagSnapshot,
      subagentsDisabledSafetyCascade,
      parentCancellationRequested: true,
      cancelledRunIds,
      detachedRunIds,
      unchangedRunIds,
      cancelledWaitBarrierIds,
      cancelledMailboxEventIds,
      ...(parentMailboxEventId ? { parentMailboxEventId } : {}),
    };
  }

  listSubagentRunEvents(runId: string): SubagentRunEventSummary[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM subagent_run_events WHERE run_id = ? ORDER BY sequence ASC")
      .all(runId) as SubagentRunEventRow[];
    return rows.map(this.mapSubagentRunEvent);
  }

  listSubagentSpawnEdges(): SubagentSpawnEdgeSummary[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM subagent_spawn_edges ORDER BY created_at ASC, parent_run_id ASC, child_run_id ASC")
      .all() as SubagentSpawnEdgeRow[];
    return rows.map(this.mapSubagentSpawnEdge);
  }

  appendSubagentRunEvent(runId: string, input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string }): SubagentRunEventSummary {
    this.getSubagentRun(runId);
    this.appendSubagentRunEventInternal(runId, input);
    return this.listSubagentRunEvents(runId).at(-1)!;
  }

  appendSubagentMailboxEvent(runId: string, input: {
    direction: SubagentMailboxDirection;
    type: string;
    payload: unknown;
    deliveryState?: SubagentMailboxDeliveryState;
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentMailboxEventSummary {
    this.getSubagentRun(runId);
    const id = randomUUID();
    const now = input.createdAt ?? new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT INTO subagent_mailbox_events
         (id, run_id, direction, type, payload_json, delivery_state, created_at, delivered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        runId,
        input.direction,
        input.type,
        JSON.stringify(input.payload ?? null),
        input.deliveryState ?? "queued",
        now,
        input.deliveredAt ?? null,
      );
    return this.getSubagentMailboxEvent(id);
  }

  listSubagentMailboxEvents(runId: string): SubagentMailboxEventSummary[] {
    this.getSubagentRun(runId);
    const rows = this.requireDb()
      .prepare("SELECT * FROM subagent_mailbox_events WHERE run_id = ? ORDER BY created_at ASC, id ASC")
      .all(runId) as SubagentMailboxEventRow[];
    return rows.map(this.mapSubagentMailboxEvent);
  }

  getSubagentMailboxEvent(id: string): SubagentMailboxEventSummary {
    const row = this.requireDb().prepare("SELECT * FROM subagent_mailbox_events WHERE id = ?").get(id) as SubagentMailboxEventRow | undefined;
    if (!row) throw new Error(`Sub-agent mailbox event not found: ${id}`);
    return this.mapSubagentMailboxEvent(row);
  }

  updateSubagentMailboxEventDeliveryState(
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentMailboxEventSummary {
    const existing = this.getSubagentMailboxEvent(id);
    const now = options?.now ?? new Date().toISOString();
    let deliveredAt = existing.deliveredAt ?? null;
    if (deliveryState === "queued") {
      deliveredAt = options?.deliveredAt === undefined ? null : options.deliveredAt;
    } else if (deliveryState === "delivered" || deliveryState === "consumed") {
      deliveredAt = options?.deliveredAt === undefined ? deliveredAt ?? now : options.deliveredAt;
    } else if (options?.deliveredAt !== undefined) {
      deliveredAt = options.deliveredAt;
    }
    if (existing.deliveryState === deliveryState && (existing.deliveredAt ?? null) === deliveredAt) {
      return existing;
    }
    this.requireDb()
      .prepare(
        `UPDATE subagent_mailbox_events
         SET delivery_state = ?, delivered_at = ?
         WHERE id = ?`,
      )
      .run(deliveryState, deliveredAt, id);
    return this.getSubagentMailboxEvent(id);
  }

  appendSubagentParentMailboxEvent(input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    type: string;
    payload: unknown;
    deliveryState?: SubagentMailboxDeliveryState;
    idempotencyKey?: string;
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentParentMailboxEventSummary {
    assertSubagentParentMailboxEventAttribution({
      parentRunId: input.parentRunId,
      type: input.type,
      payload: input.payload,
    });
    const existing = input.idempotencyKey
      ? this.findSubagentParentMailboxEventByIdempotencyKey(input.parentRunId, input.type, input.idempotencyKey)
      : undefined;
    if (existing) {
      if (input.parentMessageId && !existing.parentMessageId) {
        this.requireDb()
          .prepare("UPDATE subagent_parent_mailbox_events SET parent_message_id = ?, updated_at = ? WHERE id = ?")
          .run(input.parentMessageId, input.createdAt ?? new Date().toISOString(), existing.id);
        return this.getSubagentParentMailboxEvent(existing.id);
      }
      return existing;
    }
    const id = randomUUID();
    const now = input.createdAt ?? new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT INTO subagent_parent_mailbox_events
         (id, parent_thread_id, parent_run_id, parent_message_id, type, payload_json, delivery_state, idempotency_key, created_at, updated_at, delivered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.parentThreadId,
        input.parentRunId,
        input.parentMessageId ?? null,
        input.type,
        JSON.stringify(input.payload ?? null),
        input.deliveryState ?? "queued",
        input.idempotencyKey ?? null,
        now,
        now,
        input.deliveredAt ?? null,
      );
    return this.getSubagentParentMailboxEvent(id);
  }

  appendSubagentLifecycleInterruptionParentMailboxEvent(input: {
    run: SubagentRunSummary;
    previousStatus?: SubagentRunStatus;
    source: SubagentLifecycleInterruptionSource;
    reason: string;
    resultArtifact?: unknown;
    toolCallId?: string;
    waitBarrierIds?: readonly string[];
    cancelledMailboxEventIds?: readonly string[];
    idempotencyKey?: string;
    createdAt?: string;
  }): SubagentParentMailboxEventSummary {
    return this.appendSubagentParentMailboxEvent({
      parentThreadId: input.run.parentThreadId,
      parentRunId: input.run.parentRunId,
      parentMessageId: input.run.parentMessageId,
      type: SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_TYPE,
      payload: subagentLifecycleInterruptionParentMailboxPayload(input),
      idempotencyKey: subagentLifecycleInterruptionIdempotencyKey({
        runId: input.run.id,
        source: input.source,
        idempotencyKey: input.idempotencyKey,
      }),
      createdAt: input.createdAt,
    });
  }

  upsertSubagentGroupedCompletionNotification(input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    child: {
      runId: string;
      childThreadId: string;
      canonicalTaskPath: string;
      roleId: string;
      status: SubagentRunStatus;
      summary: string;
      completedAt?: string;
    };
    createdAt?: string;
  }): SubagentParentMailboxEventSummary {
    const now = input.createdAt ?? new Date().toISOString();
    const parentMessageId = input.parentMessageId ?? this.parentMessageIdForSubagentRun(input.child.runId);
    const latest = this.latestQueuedSubagentParentMailboxEvent(input.parentRunId, SUBAGENT_GROUPED_COMPLETION_PARENT_MAILBOX_TYPE);
    const draft = buildSubagentGroupedCompletionNotificationDraft({
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      ...(parentMessageId ? { parentMessageId } : {}),
      existingPayload: latest?.payload,
      child: input.child,
    });
    if (!latest) {
      return this.appendSubagentParentMailboxEvent({
        parentThreadId: input.parentThreadId,
        parentRunId: input.parentRunId,
        parentMessageId,
        type: SUBAGENT_GROUPED_COMPLETION_PARENT_MAILBOX_TYPE,
        payload: draft.payload,
        idempotencyKey: draft.idempotencyKey,
        createdAt: now,
      });
    }
    this.requireDb()
      .prepare(
        `UPDATE subagent_parent_mailbox_events
         SET parent_message_id = COALESCE(parent_message_id, ?), payload_json = ?, idempotency_key = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(parentMessageId ?? null, JSON.stringify(draft.payload), draft.idempotencyKey, now, latest.id);
    return this.getSubagentParentMailboxEvent(latest.id);
  }

  listSubagentParentMailboxEventsForParentRun(parentRunId: string): SubagentParentMailboxEventSummary[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM subagent_parent_mailbox_events WHERE parent_run_id = ? ORDER BY created_at ASC, id ASC")
      .all(parentRunId) as SubagentParentMailboxEventRow[];
    return rows.map(this.mapSubagentParentMailboxEvent);
  }

  listSubagentParentMailboxEventsForParentThread(parentThreadId: string): SubagentParentMailboxEventSummary[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM subagent_parent_mailbox_events WHERE parent_thread_id = ? ORDER BY created_at ASC, id ASC")
      .all(parentThreadId) as SubagentParentMailboxEventRow[];
    return rows.map(this.mapSubagentParentMailboxEvent);
  }

  getSubagentParentMailboxEvent(id: string): SubagentParentMailboxEventSummary {
    const row = this.requireDb().prepare("SELECT * FROM subagent_parent_mailbox_events WHERE id = ?").get(id) as SubagentParentMailboxEventRow | undefined;
    if (!row) throw new Error(`Sub-agent parent mailbox event not found: ${id}`);
    return this.mapSubagentParentMailboxEvent(row);
  }

  updateSubagentParentMailboxEventDeliveryState(
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentParentMailboxEventSummary {
    const existing = this.getSubagentParentMailboxEvent(id);
    const now = options?.now ?? new Date().toISOString();
    let deliveredAt = existing.deliveredAt ?? null;
    if (deliveryState === "queued") {
      deliveredAt = options?.deliveredAt === undefined ? null : options.deliveredAt;
    } else if (deliveryState === "delivered" || deliveryState === "consumed") {
      deliveredAt = options?.deliveredAt === undefined ? deliveredAt ?? now : options.deliveredAt;
    } else if (options?.deliveredAt !== undefined) {
      deliveredAt = options.deliveredAt;
    }
    if (existing.deliveryState === deliveryState && (existing.deliveredAt ?? null) === deliveredAt) {
      return existing;
    }
    this.requireDb()
      .prepare(
        `UPDATE subagent_parent_mailbox_events
         SET delivery_state = ?, updated_at = ?, delivered_at = ?
         WHERE id = ?`,
      )
      .run(deliveryState, now, deliveredAt, id);
    return this.getSubagentParentMailboxEvent(id);
  }

  recordSubagentPromptSnapshot(runId: string, input: { prompt: string; snapshot: unknown; createdAt?: string }): SubagentPromptSnapshotSummary {
    this.getSubagentRun(runId);
    const row = this.requireDb()
      .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM subagent_prompt_snapshots WHERE run_id = ?")
      .get(runId) as { next_sequence?: number } | undefined;
    const sequence = row?.next_sequence ?? 1;
    const createdAt = input.createdAt ?? new Date().toISOString();
    const promptSha256 = createHash("sha256").update(input.prompt).digest("hex");
    this.requireDb()
      .prepare(
        `INSERT INTO subagent_prompt_snapshots
         (run_id, sequence, created_at, prompt_sha256, prompt_preview, snapshot_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        runId,
        sequence,
        createdAt,
        promptSha256,
        input.prompt.slice(0, 1200),
        JSON.stringify(input.snapshot ?? null),
      );
    return this.listSubagentPromptSnapshots(runId).at(-1)!;
  }

  listSubagentPromptSnapshots(runId: string): SubagentPromptSnapshotSummary[] {
    this.getSubagentRun(runId);
    const rows = this.requireDb()
      .prepare("SELECT * FROM subagent_prompt_snapshots WHERE run_id = ? ORDER BY sequence ASC")
      .all(runId) as SubagentPromptSnapshotRow[];
    return rows.map(this.mapSubagentPromptSnapshot);
  }

  recordSubagentToolScopeSnapshot(runId: string, input: { scope: SubagentToolScopeSnapshotSummary["scope"]; resolverInputs?: unknown; createdAt?: string }): SubagentToolScopeSnapshotSummary {
    this.getSubagentRun(runId);
    const row = this.requireDb()
      .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM subagent_tool_scope_snapshots WHERE run_id = ?")
      .get(runId) as { next_sequence?: number } | undefined;
    const sequence = row?.next_sequence ?? 1;
    const createdAt = input.createdAt ?? new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT INTO subagent_tool_scope_snapshots
         (run_id, sequence, created_at, scope_json, resolver_inputs_json)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        runId,
        sequence,
        createdAt,
        JSON.stringify(input.scope),
        JSON.stringify(input.resolverInputs ?? null),
      );
    return this.listSubagentToolScopeSnapshots(runId).at(-1)!;
  }

  listSubagentToolScopeSnapshots(runId: string): SubagentToolScopeSnapshotSummary[] {
    this.getSubagentRun(runId);
    const rows = this.requireDb()
      .prepare("SELECT * FROM subagent_tool_scope_snapshots WHERE run_id = ? ORDER BY sequence ASC")
      .all(runId) as SubagentToolScopeSnapshotRow[];
    return rows.map(this.mapSubagentToolScopeSnapshot);
  }

  createSubagentWaitBarrier(input: {
    parentThreadId: string;
    parentRunId: string;
    childRunIds: string[];
    dependencyMode: SubagentWaitBarrierMode;
    failurePolicy: SubagentWaitBarrierFailurePolicy;
    quorumThreshold?: number;
    timeoutMs?: number;
    createdAt?: string;
  }): SubagentWaitBarrierSummary {
    const childRunIds = [...new Set(input.childRunIds.filter(Boolean))];
    if (childRunIds.length === 0) throw new Error("Sub-agent wait barrier requires at least one child run.");
    const quorumThreshold = resolveSubagentWaitBarrierQuorumThreshold({
      dependencyMode: input.dependencyMode,
      childCount: childRunIds.length,
      quorumThreshold: input.quorumThreshold,
    });
    for (const childRunId of childRunIds) {
      const child = this.getSubagentRun(childRunId);
      if (child.parentThreadId !== input.parentThreadId) {
        throw new Error(`Sub-agent wait barrier child ${childRunId} does not belong to parent thread ${input.parentThreadId}.`);
      }
      if (child.parentRunId !== input.parentRunId) {
        throw new Error(`Sub-agent wait barrier child ${childRunId} does not belong to parent run ${input.parentRunId}.`);
      }
    }
    const id = randomUUID();
    const now = input.createdAt ?? new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT INTO subagent_wait_barriers
         (id, parent_thread_id, parent_run_id, child_run_ids_json, dependency_mode, status, failure_policy,
          quorum_threshold, timeout_ms, created_at, updated_at, resolved_at, resolution_artifact_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.parentThreadId,
        input.parentRunId,
        JSON.stringify(childRunIds),
        input.dependencyMode,
        "waiting_on_children",
        input.failurePolicy,
        quorumThreshold,
        input.timeoutMs ?? null,
        now,
        now,
        null,
        null,
      );
    return this.getSubagentWaitBarrier(id);
  }

  getSubagentWaitBarrier(id: string): SubagentWaitBarrierSummary {
    const row = this.requireDb().prepare("SELECT * FROM subagent_wait_barriers WHERE id = ?").get(id) as SubagentWaitBarrierRow | undefined;
    if (!row) throw new Error(`Sub-agent wait barrier not found: ${id}`);
    return this.mapSubagentWaitBarrier(row);
  }

  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM subagent_wait_barriers WHERE parent_run_id = ? ORDER BY created_at ASC, id ASC")
      .all(parentRunId) as SubagentWaitBarrierRow[];
    return rows.map(this.mapSubagentWaitBarrier);
  }

  listSubagentWaitBarriers(): SubagentWaitBarrierSummary[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM subagent_wait_barriers ORDER BY created_at ASC, id ASC")
      .all() as SubagentWaitBarrierRow[];
    return rows.map(this.mapSubagentWaitBarrier);
  }

  getSubagentRepairDiagnostics(options: {
    now?: string;
    maxIssues?: number;
    maxMessageChars?: number;
    maxAffectedIds?: number;
  } = {}): SubagentRepairDiagnosticsReport {
    const now = options.now ?? new Date().toISOString();
    const subagentRuns = this.listAllSubagentRuns();
    const subagentRunEvents = subagentRuns.flatMap((run) => this.listSubagentRunEvents(run.id));
    const workflowRunRows = this.requireDb()
      .prepare("SELECT * FROM workflow_runs ORDER BY started_at ASC, id ASC")
      .all() as WorkflowRunRow[];
    const parentRunRows = this.requireDb()
      .prepare("SELECT id, thread_id AS threadId FROM runs ORDER BY started_at ASC, id ASC")
      .all() as Array<{ id: string; threadId: string }>;
    const summary = analyzeSubagentRestartState({
      threads: this.listThreadsForSubagentStateInspection(),
      runs: subagentRuns,
      runEvents: subagentRunEvents,
      spawnEdges: this.listSubagentSpawnEdges(),
      promptSnapshots: subagentRuns.flatMap((run) => this.listSubagentPromptSnapshots(run.id)),
      toolScopeSnapshots: subagentRuns.flatMap((run) => this.listSubagentToolScopeSnapshots(run.id)),
      waitBarriers: this.listSubagentWaitBarriers(),
      createdAt: now,
    });
    return createSubagentRepairDiagnosticsReport({
      summary: {
        ...summary,
        callableWorkflowTasks: analyzeCallableWorkflowTaskRestartState({
          tasks: this.listCallableWorkflowTasks(),
          threads: this.listThreads(),
          parentRuns: parentRunRows,
          workflowArtifacts: this.listWorkflowArtifacts(),
          workflowRuns: workflowRunRows.map(this.mapWorkflowRun),
          createdAt: now,
        }),
      },
      maxIssues: options.maxIssues,
      maxMessageChars: options.maxMessageChars,
      maxAffectedIds: options.maxAffectedIds,
    });
  }

  repairSubagentSpawnEdges(options:
    | { now?: string; dryRun: true }
    | { now?: string; dryRun?: false; featureFlagSnapshot: AmbientFeatureFlagSnapshot }
  ): SubagentPersistedChildTreeRepairResult {
    const now = options.now ?? new Date().toISOString();
    const dryRun = options.dryRun === true;
    const beforeRuns = this.listAllSubagentRuns();
    const beforeRunEvents = beforeRuns.flatMap((run) => this.listSubagentRunEvents(run.id));
    const beforeSpawnEdges = this.listSubagentSpawnEdges();
    const beforeSummary = analyzeSubagentRestartState({
      threads: this.listThreadsForSubagentStateInspection(),
      runs: beforeRuns,
      runEvents: beforeRunEvents,
      spawnEdges: beforeSpawnEdges,
      waitBarriers: this.listSubagentWaitBarriers(),
      createdAt: now,
    });
    const runsById = new Map(beforeRuns.map((run) => [run.id, run]));
    const edgesByChildRunId = new Map(beforeSpawnEdges.map((edge) => [edge.childRunId, edge]));
    const missingRunIds = uniqueSubagentRepairIds(beforeSummary.issues
      .filter((issue) => issue.kind === "missing_spawn_edge" && issue.runId && runsById.has(issue.runId))
      .map((issue) => issue.runId!));
    const mismatchedRunIds = uniqueSubagentRepairIds(beforeSummary.issues
      .filter((issue) => issue.kind === "spawn_edge_mismatch" && issue.runId && runsById.has(issue.runId))
      .map((issue) => issue.runId!));
    const danglingRunIds = uniqueSubagentRepairIds(beforeSummary.issues
      .filter((issue) => issue.kind === "dangling_spawn_edge" && issue.runId && !runsById.has(issue.runId))
      .map((issue) => issue.runId!));
    const skippedIssueIds = beforeSummary.issues
      .filter((issue) =>
        ["missing_spawn_edge", "spawn_edge_mismatch", "dangling_spawn_edge"].includes(issue.kind) &&
        (!issue.runId || (issue.kind !== "dangling_spawn_edge" && !runsById.has(issue.runId)))
      )
      .map((issue) => issue.id);
    const requestedActions: SubagentPersistedChildTreeRepairAction[] = [
      missingRunIds.length ? "reconstruct_missing_spawn_edge" : undefined,
      mismatchedRunIds.length ? "realign_spawn_edge" : undefined,
      danglingRunIds.length ? "prune_dangling_spawn_edge" : undefined,
    ].filter((action): action is SubagentPersistedChildTreeRepairAction => Boolean(action));

    if (!dryRun && !isAmbientSubagentsEnabled(options.featureFlagSnapshot)) {
      return {
        schemaVersion: "ambient-subagent-persisted-child-tree-repair-v1",
        createdAt: now,
        dryRun,
        skipped: true,
        skipReason: "ambient_subagents_disabled",
        featureFlagSnapshot: options.featureFlagSnapshot,
        requestedActions,
        beforeIssueCount: beforeSummary.issueCount,
        reconstructedMissingSpawnEdgeRunIds: missingRunIds,
        realignedSpawnEdgeRunIds: mismatchedRunIds,
        prunedDanglingSpawnEdgeRunIds: danglingRunIds,
        skippedIssueIds,
      };
    }

    if (!dryRun && requestedActions.length > 0) {
      const db = this.requireDb();
      const apply = db.transaction(() => {
        const deleteEdgesForChild = db.prepare("DELETE FROM subagent_spawn_edges WHERE child_run_id = ?");
        const insertEdge = db.prepare(
          `INSERT INTO subagent_spawn_edges
           (parent_run_id, child_run_id, parent_thread_id, child_thread_id, canonical_task_path, depth, status, capacity_released_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const runId of missingRunIds) {
          const run = runsById.get(runId);
          if (!run) continue;
          const edge = subagentSpawnEdgeRecordForRun(run, { now, createdAt: run.createdAt, depth: 1 });
          insertEdge.run(
            edge.parentRunId,
            edge.childRunId,
            edge.parentThreadId,
            edge.childThreadId,
            edge.canonicalTaskPath,
            edge.depth,
            edge.status,
            edge.capacityReleasedAt ?? null,
            edge.createdAt,
            edge.updatedAt,
          );
          this.appendSubagentRunEventInternal(run.id, {
            type: "subagent.spawn_edge_repaired",
            preview: {
              schemaVersion: "ambient-subagent-spawn-edge-repair-v1",
              action: "reconstruct_missing_spawn_edge",
              childRunId: run.id,
              parentRunId: run.parentRunId,
              childThreadId: run.childThreadId,
              canonicalTaskPath: run.canonicalTaskPath,
              status: run.status,
            },
            createdAt: now,
          });
        }
        for (const runId of mismatchedRunIds) {
          const run = runsById.get(runId);
          if (!run) continue;
          const previousEdge = edgesByChildRunId.get(run.id);
          deleteEdgesForChild.run(run.id);
          const edge = subagentSpawnEdgeRecordForRun(run, {
            now,
            createdAt: previousEdge?.createdAt ?? run.createdAt,
            depth: previousEdge?.depth ?? 1,
          });
          insertEdge.run(
            edge.parentRunId,
            edge.childRunId,
            edge.parentThreadId,
            edge.childThreadId,
            edge.canonicalTaskPath,
            edge.depth,
            edge.status,
            edge.capacityReleasedAt ?? null,
            edge.createdAt,
            edge.updatedAt,
          );
          this.appendSubagentRunEventInternal(run.id, {
            type: "subagent.spawn_edge_repaired",
            preview: {
              schemaVersion: "ambient-subagent-spawn-edge-repair-v1",
              action: "realign_spawn_edge",
              childRunId: run.id,
              parentRunId: run.parentRunId,
              childThreadId: run.childThreadId,
              canonicalTaskPath: run.canonicalTaskPath,
              status: run.status,
              previousEdge,
            },
            createdAt: now,
          });
        }
        for (const runId of danglingRunIds) {
          deleteEdgesForChild.run(runId);
        }
      });
      apply();
    }

    const afterSummary = (() => {
      if (dryRun) return undefined;
      const afterRuns = this.listAllSubagentRuns();
      const afterRunEvents = afterRuns.flatMap((run) => this.listSubagentRunEvents(run.id));
      return analyzeSubagentRestartState({
        threads: this.listThreadsForSubagentStateInspection(),
        runs: afterRuns,
        runEvents: afterRunEvents,
        spawnEdges: this.listSubagentSpawnEdges(),
        waitBarriers: this.listSubagentWaitBarriers(),
        createdAt: now,
      });
    })();

    return {
      schemaVersion: "ambient-subagent-persisted-child-tree-repair-v1",
      createdAt: now,
      dryRun,
      requestedActions,
      beforeIssueCount: beforeSummary.issueCount,
      ...(afterSummary ? { afterIssueCount: afterSummary.issueCount } : {}),
      reconstructedMissingSpawnEdgeRunIds: missingRunIds,
      realignedSpawnEdgeRunIds: mismatchedRunIds,
      prunedDanglingSpawnEdgeRunIds: danglingRunIds,
      skippedIssueIds,
      ...(afterSummary ? { remainingIssues: afterSummary.issues } : {}),
    };
  }

  reconcileSubagentRestartState(options: { now?: string } = {}): SubagentRestartReconciliationSummary {
    const now = options.now ?? new Date().toISOString();
    const subagentRuns = this.listAllSubagentRuns();
    const subagentRunEvents = subagentRuns.flatMap((run) => this.listSubagentRunEvents(run.id));
    const summary = analyzeSubagentRestartState({
      threads: this.listThreadsForSubagentStateInspection(),
      runs: subagentRuns,
      runEvents: subagentRunEvents,
      spawnEdges: this.listSubagentSpawnEdges(),
      waitBarriers: this.listSubagentWaitBarriers(),
      createdAt: now,
    });
    for (const runId of summary.repairedRunIds) {
      const run = this.getSubagentRun(runId);
      const stopped = this.markSubagentRunStatus(runId, "stopped", {
        now,
        resultArtifact: interruptedSubagentResultArtifact({ run }),
      });
      this.appendSubagentRunEvent(stopped.id, {
        type: "subagent.restart_reconciled",
        preview: {
          previousStatus: run.status,
          status: stopped.status,
          reason: "desktop_restart",
        },
        createdAt: now,
      });
      this.appendSubagentLifecycleInterruptionParentMailboxEvent({
        run: stopped,
        previousStatus: run.status,
        source: "desktop_restart",
        reason: "Ambient restarted before this child run finished.",
        resultArtifact: stopped.resultArtifact,
        idempotencyKey: "desktop_restart",
        createdAt: now,
      });
    }
    for (const barrierId of summary.repairedBarrierIds) {
      const barrier = this.getSubagentWaitBarrier(barrierId);
      this.updateSubagentWaitBarrierStatus(barrier.id, "failed", {
        now,
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: barrier.childRunIds,
          stoppedChildRunIds: barrier.childRunIds.filter((childRunId) => summary.repairedRunIds.includes(childRunId)),
          timedOut: false,
          synthesisAllowed: false,
          restartReconciled: true,
        },
      });
    }
    for (const barrierId of summary.repairedParentControlBarrierIds) {
      const barrier = this.markSubagentParentControlBarrierReconciled({
        waitBarrierId: barrierId,
        source: "desktop_restart",
        now,
      });
      this.appendSubagentParentMailboxEvent({
        parentThreadId: barrier.parentThreadId,
        parentRunId: barrier.parentRunId,
        parentMessageId: this.parentMessageIdForSubagentWaitBarrier(barrier),
        type: "subagent.parent_control_reconciled",
        payload: {
          schemaVersion: "ambient-subagent-parent-control-reconciled-v1",
          parentThreadId: barrier.parentThreadId,
          parentRunId: barrier.parentRunId,
          waitBarrierId: barrier.id,
          action: "cancel_parent",
          source: "desktop_restart",
          barrierStatus: barrier.status,
          childRunIds: barrier.childRunIds,
          synthesisAllowed: false,
          reason: "Ambient restarted after a cancel-parent wait-barrier decision; parent-control cancellation was reconciled from the persisted barrier.",
        },
        idempotencyKey: `desktop_restart_parent_control:${barrier.id}`,
        createdAt: now,
      });
    }
    for (const runId of summary.diagnosticRunIds) {
      const runIssues = summary.issues.filter((item) => item.runId === runId);
      if (runIssues.length === 0) continue;
      this.appendSubagentRunEvent(runId, {
        type: "subagent.restart_diagnostic",
        preview: {
          schemaVersion: "ambient-subagent-restart-diagnostic-v1",
          reason: "desktop_restart",
          issueCount: runIssues.length,
          issues: runIssues.map((item) => ({
            id: item.id,
            kind: item.kind,
            severity: item.severity,
            message: item.message,
          })),
        },
        createdAt: now,
      });
    }
    return {
      ...summary,
      repairedRunIds: summary.repairedRunIds,
      repairedBarrierIds: summary.repairedBarrierIds,
      repairedParentControlBarrierIds: summary.repairedParentControlBarrierIds,
      diagnosticRunIds: summary.diagnosticRunIds,
    };
  }

  markSubagentParentControlBarrierReconciled(input: {
    waitBarrierId: string;
    source: "runtime_parent_abort" | "desktop_restart";
    now?: string;
  }): SubagentWaitBarrierSummary {
    const barrier = this.getSubagentWaitBarrier(input.waitBarrierId);
    const artifact = barrier.resolutionArtifact && typeof barrier.resolutionArtifact === "object" && !Array.isArray(barrier.resolutionArtifact)
      ? { ...(barrier.resolutionArtifact as Record<string, unknown>) }
      : {};
    if (artifact.parentCancellationRequested !== true && input.source !== "runtime_parent_abort") return barrier;
    const now = input.now ?? new Date().toISOString();
    return this.updateSubagentWaitBarrierStatus(barrier.id, barrier.status, {
      now,
      resolutionArtifact: {
        ...artifact,
        synthesisAllowed: false,
        parentCancellationRequested: true,
        parentControlReconciledAt: now,
        parentControlReconciledSource: input.source,
        parentControlReconciliation: {
          schemaVersion: "ambient-subagent-parent-control-reconciliation-v1",
          action: "cancel_parent",
          source: input.source,
          reconciledAt: now,
        },
      },
    });
  }

  private parentMessageIdForSubagentWaitBarrier(barrier: SubagentWaitBarrierSummary): string | undefined {
    for (const childRunId of barrier.childRunIds) {
      try {
        const run = this.getSubagentRun(childRunId);
        if (run.parentMessageId) return run.parentMessageId;
      } catch {
        continue;
      }
    }
    return undefined;
  }

  updateSubagentWaitBarrierStatus(
    id: string,
    status: SubagentWaitBarrierStatus,
    options: { resolutionArtifact?: unknown; now?: string } = {},
  ): SubagentWaitBarrierSummary {
    const current = this.getSubagentWaitBarrier(id);
    const now = options.now ?? new Date().toISOString();
    const resolvedAt = status === "waiting_on_children" ? null : (current.resolvedAt ?? now);
    this.requireDb()
      .prepare(
        `UPDATE subagent_wait_barriers
         SET status = ?, updated_at = ?, resolved_at = ?, resolution_artifact_json = ?
         WHERE id = ?`,
      )
      .run(
        status,
        now,
        resolvedAt,
        options.resolutionArtifact === undefined
          ? (current.resolutionArtifact === undefined ? null : JSON.stringify(current.resolutionArtifact))
          : JSON.stringify(options.resolutionArtifact),
        id,
      );
    return this.getSubagentWaitBarrier(id);
  }

  markSubagentRunStatus(runId: string, status: SubagentRunStatus, options: { resultArtifact?: unknown; now?: string } = {}): SubagentRunSummary {
    const current = this.getSubagentRun(runId);
    const now = options.now ?? new Date().toISOString();
    const terminalLifecycleAlreadyRecorded = this.listSubagentRunEvents(runId)
      .some((event) => event.type === subagentLifecycleEventType("SubagentStop"));
    const startedAt = ["starting", "running", "waiting"].includes(status)
      ? (current.startedAt ?? now)
      : (current.startedAt ?? null);
    const completedAt = ["completed", "failed", "stopped", "cancelled", "timed_out", "detached", "aborted_partial"].includes(status)
      ? now
      : (current.completedAt ?? null);
    this.requireDb()
      .prepare(
        `UPDATE subagent_runs
         SET status = ?, updated_at = ?, started_at = ?, completed_at = ?, result_artifact_json = ?
         WHERE id = ?`,
      )
      .run(
        status,
        now,
        startedAt,
        completedAt,
        options.resultArtifact === undefined ? JSON.stringify(current.resultArtifact ?? null) : JSON.stringify(options.resultArtifact),
        runId,
      );
    this.requireDb()
      .prepare("UPDATE threads SET child_status = ?, updated_at = ? WHERE id = ?")
      .run(status, now, current.childThreadId);
    this.requireDb()
      .prepare("UPDATE subagent_spawn_edges SET status = ?, updated_at = ? WHERE child_run_id = ?")
      .run(status, now, runId);
    this.appendSubagentRunEventInternal(runId, { type: "subagent.status_changed", preview: { status }, createdAt: now });
    const updated = this.getSubagentRun(runId);
    if (subagentRunStatusIsTerminal(status) && !terminalLifecycleAlreadyRecorded) {
      const artifactPath = subagentLifecycleArtifactPath(options.resultArtifact ?? updated.resultArtifact);
      this.appendSubagentRunEventInternal(runId, {
        type: subagentLifecycleEventType("SubagentStop"),
        preview: subagentLifecycleHookPreview({
          hook: "SubagentStop",
          run: updated,
          resultArtifact: options.resultArtifact,
          createdAt: now,
        }),
        artifactPath,
        createdAt: now,
      });
    }
    return updated;
  }

  closeSubagentRun(runId: string, now = new Date().toISOString()): SubagentRunSummary {
    const current = this.getSubagentRun(runId);
    if (current.closedAt) return current;
    const releasedCapacityLease = releaseSubagentCapacityLease(current.capacityLeaseSnapshot, {
      releasedAt: now,
      reason: "close_agent released live sub-agent capacity while preserving transcript history.",
    });
    this.requireDb()
      .prepare("UPDATE subagent_runs SET closed_at = ?, updated_at = ?, capacity_lease_snapshot_json = ? WHERE id = ?")
      .run(now, now, JSON.stringify(releasedCapacityLease), runId);
    this.requireDb()
      .prepare("UPDATE subagent_spawn_edges SET capacity_released_at = ?, updated_at = ? WHERE child_run_id = ?")
      .run(now, now, runId);
    this.appendSubagentRunEventInternal(runId, {
      type: "subagent.closed",
      preview: {
        childThreadId: current.childThreadId,
        capacityLease: compactSubagentCapacityLeasePreview(releasedCapacityLease),
      },
      createdAt: now,
    });
    const closed = this.getSubagentRun(runId);
    const artifactPath = subagentLifecycleArtifactPath(closed.resultArtifact);
    this.appendSubagentRunEventInternal(runId, {
      type: subagentLifecycleEventType("SubagentClose"),
      preview: subagentLifecycleHookPreview({
        hook: "SubagentClose",
        run: closed,
        createdAt: now,
      }),
      artifactPath,
      createdAt: now,
    });
    return closed;
  }

  createWorkflowRecordingThread(input: { goal?: string; workspacePath?: string } = {}): ThreadSummary {
    const thread = this.createThread(workflowRecordingTitle(input.goal), input.workspacePath ?? this.getWorkspace().path);
    return this.startWorkflowRecording(thread.id, { goal: input.goal });
  }

  startWorkflowRecording(threadId: string, input: { goal?: string } = {}): ThreadSummary {
    this.getThread(threadId);
    const recording = startWorkflowRecordingState(input);
    this.requireDb()
      .prepare("UPDATE threads SET workflow_recording_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(recording), recording.startedAt, threadId);
    return this.getThread(threadId);
  }

  stopWorkflowRecording(threadId: string): WorkflowRecordingState {
    const thread = this.getThread(threadId);
    const messages = this.listMessages(threadId);
    const recording = stopWorkflowRecordingState({
      current: thread.workflowRecording,
      messages,
    });
    this.requireDb()
      .prepare("UPDATE threads SET workflow_recording_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(recording), recording.stoppedAt ?? new Date().toISOString(), threadId);
    return recording;
  }

  confirmWorkflowRecordingReview(threadId: string): WorkflowRecordingState {
    const thread = this.getThread(threadId);
    const current = workflowRecordingRequireStoppedReviewDraft(
      thread.workflowRecording,
      "Stop the workflow recording before confirming its playbook review.",
    );
    this.assertWorkflowRecordingDraftReusable(threadId, current, current.review.draft);
    const now = new Date().toISOString();
    const recording = confirmWorkflowRecordingReviewState({ current, now });
    const savedPlaybook = workflowRecordingSaveConfirmedPlaybook({ thread, recording, savedAt: now });
    const savedRecording = workflowRecordingApplySavedPlaybookReviewState(recording, savedPlaybook);
    this.requireDb()
      .prepare("UPDATE threads SET workflow_recording_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(savedRecording), now, threadId);
    return savedRecording;
  }

  updateWorkflowRecordingReviewDraft(
    threadId: string,
    draft: WorkflowRecordingReviewDraftUpdate,
    options: { source?: WorkflowRecordingPlaybookDraft["source"] } = {},
  ): WorkflowRecordingState {
    const thread = this.getThread(threadId);
    const current = workflowRecordingRequireStoppedReviewDraft(
      thread.workflowRecording,
      "Stop the workflow recording before editing its playbook review.",
    );
    const now = new Date().toISOString();
    const recording = updateWorkflowRecordingReviewDraftState({ current, draft, now, source: options.source });
    this.assertWorkflowRecordingDraftReusable(threadId, current, recording.review!.draft);
    this.requireDb()
      .prepare("UPDATE threads SET workflow_recording_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(recording), now, threadId);
    return recording;
  }

  private assertWorkflowRecordingDraftReusable(
    threadId: string,
    current: WorkflowRecordingState,
    draft: WorkflowRecordingReviewDraftUpdate | WorkflowRecordingPlaybookDraft,
  ): void {
    try {
      assertWorkflowRecordingReviewDraftReusable({ current, draft });
    } catch (error) {
      if (error instanceof WorkflowRecordingReviewValidationError) {
        this.updateWorkflowRecordingReviewValidationIssues(threadId, current, error.issues);
      }
      throw error;
    }
  }

  private updateWorkflowRecordingReviewValidationIssues(
    threadId: string,
    current: WorkflowRecordingState,
    issues: WorkflowRecordingReviewValidationError["issues"],
  ): void {
    const now = new Date().toISOString();
    const next = workflowRecordingApplyReviewValidationIssues({ current, issues, now });
    if (!next) return;
    this.requireDb()
      .prepare("UPDATE threads SET workflow_recording_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(next), now, threadId);
  }

  listWorkflowRecordingLibrary(input: SearchWorkflowRecordingsInput = {}): WorkflowRecordingLibraryEntry[] {
    return workflowRecordingListLibraryEntries(this.workflowRecordingLibraryIndexes(), input);
  }

  describeWorkflowRecording(
    id: string,
    input: Pick<SearchWorkflowRecordingsInput, "includeArchived"> = {},
  ): WorkflowRecordingLibraryDescription {
    const entry = workflowRecordingRequireLibraryEntry(this.workflowRecordingLibraryIndexes(), id, { includeDisabled: true, ...input });
    return workflowRecordingLibraryDescription(entry);
  }

  setWorkflowRecordingEnabled(id: string, enabled: boolean): WorkflowRecordingLibraryDescription {
    const found = workflowRecordingRequireLibraryRecord(this.workflowRecordingLibraryIndexes(), id, { includeDisabled: true, includeArchived: true });
    const { record } = found;
    const updatedAt = new Date().toISOString();
    const entry = workflowRecordingApplyLibraryLifecycleUpdate(found, { enabled, updatedAt });
    if (record.threadId) this.updateWorkflowRecordingThreadSavedPlaybookLifecycle(record.threadId, id, { enabled, updatedAt });
    return workflowRecordingLibraryDescription(entry);
  }

  updateWorkflowRecordingPlaybook(
    id: string,
    input: {
      baseVersion: number;
      draft: WorkflowRecordingReviewDraftUpdate;
      title?: string;
    },
  ): WorkflowRecordingLibraryDescription {
    const found = workflowRecordingRequireLibraryRecord(this.workflowRecordingLibraryIndexes(), id, { includeDisabled: true, includeArchived: true });
    const { indexPath, record } = found;
    workflowRecordingAssertBaseVersion({ record, baseVersion: input.baseVersion, action: "edit" });
    const currentDescription = workflowRecordingLibraryDescription(found.entry);
    const updatedAt = new Date().toISOString();
    const { confirmed, title } = workflowRecordingPreparePlaybookEdit({
      id,
      record,
      currentPlaybook: currentDescription.playbook,
      draft: input.draft,
      updatedAt,
      title: input.title,
    });
    const versions = workflowRecordingLibraryVersions(indexPath, record);
    const savedPlaybook = workflowRecordingNextSavedPlaybook({
      id,
      title,
      savedAt: updatedAt,
      indexPath,
      record,
      versions,
    });
    const thread = workflowRecordingThreadReference(record, title, (threadId) => this.getThread(threadId));
    workflowRecordingWriteEditedPlaybookPackageWithIndex({
      savedPlaybook,
      confirmed,
      sourceTranscriptPath: currentDescription.transcriptPath,
      thread,
    });
    if (record.threadId) this.updateWorkflowRecordingThreadRestoredPlaybook(record.threadId, savedPlaybook, confirmed, updatedAt);
    return this.describeWorkflowRecording(id, { includeArchived: true });
  }

  saveSymphonyWorkflowRecipe(
    input: SaveSymphonyWorkflowRecipeInput,
    options: { featureFlagSnapshot: AmbientFeatureFlagSnapshot },
  ): WorkflowRecordingLibraryDescription {
    if (!isAmbientSubagentsEnabled(options.featureFlagSnapshot)) {
      throw new Error("Symphony workflow recipes are disabled while ambient.subagents is off.");
    }
    const thread = this.getThread(input.threadId);
    const goal = input.goal.trim();
    if (!goal) throw new Error("Enter a Symphony workflow goal before saving the recipe.");
    const recipe = getSymphonyWorkflowRecipePreset(input.patternId);
    const missingMetricLabels = missingRequiredSymphonyMetricTemplateLabels({
      patternId: input.patternId,
      metricCustomizations: input.metricCustomizations,
    });
    const metricError = requiredSymphonyMetricTemplateErrorMessage({
      missingLabels: missingMetricLabels,
      actionLabel: "saving the Symphony recipe",
    });
    if (metricError) throw new Error(metricError);
    const now = new Date().toISOString();
    const title = symphonyWorkflowRecipeTitle(recipe, goal);
    const confirmed = symphonyWorkflowRecipePlaybook({
      recipe,
      goal,
      ...(input.blocking !== undefined ? { blocking: input.blocking } : {}),
      ...(input.stepAnswers ? { stepAnswers: input.stepAnswers } : {}),
      ...(input.metricCustomizations ? { metricCustomizations: input.metricCustomizations } : {}),
      now,
    });
    const id = workflowRecordingPlaybookId(thread.id, confirmed.intent);
    const existing = workflowRecordingFindLibraryRecord(this.workflowRecordingLibraryIndexes(), id, {
      includeDisabled: true,
      includeArchived: true,
    });
    const savedPlaybook = existing
      ? workflowRecordingNextSavedPlaybook({
          id,
          title,
          savedAt: now,
          indexPath: existing.indexPath,
          record: existing.record,
          versions: workflowRecordingLibraryVersions(existing.indexPath, existing.record),
        })
      : workflowRecordingSavedPlaybookForWorkspace({
          workspacePath: thread.workspacePath,
          id,
          title,
          version: 1,
          enabled: true,
          savedAt: now,
          updatedAt: now,
        });

    workflowRecordingWritePlaybookPackageWithIndex({
      savedPlaybook,
      confirmed,
      capture: undefined,
      thread,
      transcriptOverride: symphonyWorkflowRecipeTranscript({
        threadId: thread.id,
        recipe,
        goal,
        ...(input.blocking !== undefined ? { blocking: input.blocking } : {}),
        ...(input.stepAnswers ? { stepAnswers: input.stepAnswers } : {}),
        ...(input.metricCustomizations ? { metricCustomizations: input.metricCustomizations } : {}),
        savedAt: now,
      }),
    });
    return this.describeWorkflowRecording(id, { includeArchived: true });
  }

  archiveWorkflowRecording(id: string, input: { baseVersion: number; reason?: string }):
    WorkflowRecordingLibraryDescription {
    const found = workflowRecordingRequireLibraryRecord(this.workflowRecordingLibraryIndexes(), id, { includeDisabled: true, includeArchived: true });
    const { record } = found;
    workflowRecordingAssertBaseVersion({ record, baseVersion: input.baseVersion, action: "archive" });
    const updatedAt = new Date().toISOString();
    const patch = workflowRecordingArchiveLifecyclePatch(record, { updatedAt, reason: input.reason });
    const entry = workflowRecordingApplyLibraryLifecycleUpdate(found, patch);
    if (record.threadId) this.updateWorkflowRecordingThreadSavedPlaybookLifecycle(record.threadId, id, patch);
    return workflowRecordingLibraryDescription(entry);
  }

  unarchiveWorkflowRecording(id: string, input: { baseVersion: number }): WorkflowRecordingLibraryDescription {
    const found = workflowRecordingRequireLibraryRecord(this.workflowRecordingLibraryIndexes(), id, { includeDisabled: true, includeArchived: true });
    const { record } = found;
    workflowRecordingAssertBaseVersion({ record, baseVersion: input.baseVersion, action: "unarchive" });
    const updatedAt = new Date().toISOString();
    const patch = workflowRecordingUnarchiveLifecyclePatch(updatedAt);
    const entry = workflowRecordingApplyLibraryLifecycleUpdate(found, patch);
    if (record.threadId) this.updateWorkflowRecordingThreadSavedPlaybookLifecycle(record.threadId, id, patch);
    return workflowRecordingLibraryDescription(entry);
  }

  restoreWorkflowRecordingVersion(id: string, version: number): WorkflowRecordingLibraryDescription {
    const found = workflowRecordingRequireLibraryRecord(this.workflowRecordingLibraryIndexes(), id, { includeDisabled: true, includeArchived: true });
    const { indexPath, record } = found;
    const versions = workflowRecordingLibraryVersions(indexPath, record);
    const sourceVersion = workflowRecordingRequireLibraryVersion(id, versions, version);
    const source = workflowRecordingReadRestorableVersionSource(id, sourceVersion);
    const restoredAt = new Date().toISOString();
    const title = sourceVersion.title || record.title;
    const savedPlaybook = workflowRecordingNextSavedPlaybook({
      id,
      title,
      savedAt: restoredAt,
      indexPath,
      record,
      versions,
    });
    const thread = workflowRecordingThreadReference(record, title, (threadId) => this.getThread(threadId));
    workflowRecordingWriteRestoredPlaybookPackageWithIndex({
      savedPlaybook,
      playbook: source.playbook,
      sourceSidecarRecord: source.sourceSidecarRecord,
      sourceMarkdown: source.sourceMarkdown,
      transcript: source.transcript,
      thread,
      restoredFromVersion: version,
    });
    if (record.threadId) this.updateWorkflowRecordingThreadRestoredPlaybook(record.threadId, savedPlaybook, source.playbook, restoredAt);
    return this.describeWorkflowRecording(id);
  }

  private workflowRecordingLibraryIndexes(): WorkflowRecordingLibraryIndex[] {
    return workflowRecordingReadLibraryIndexes(this.workflowRecordingLibraryIndexPaths());
  }

  private workflowRecordingLibraryIndexPaths(): string[] {
    const workspacePaths: string[] = [this.getWorkspace().path];
    try {
      const rows = this.requireDb()
        .prepare("SELECT DISTINCT workspace_path FROM threads WHERE workspace_path IS NOT NULL AND workspace_path != ''")
        .all() as Array<{ workspace_path?: string }>;
      for (const row of rows) {
        if (typeof row.workspace_path === "string" && row.workspace_path.trim()) workspacePaths.push(row.workspace_path);
      }
    } catch {
      // If the thread table is unavailable, the active workspace catalog remains the fallback.
    }
    try {
      const rows = this.requireDb()
        .prepare("SELECT workflow_recording_json FROM threads WHERE workflow_recording_json IS NOT NULL AND workflow_recording_json != ''")
        .all() as Array<{ workflow_recording_json?: string }>;
      return workflowRecordingLibraryIndexPaths({
        workspacePaths,
        workflowRecordingJsonValues: rows.map((row) => row.workflow_recording_json),
      });
    } catch {
      return workflowRecordingLibraryIndexPaths({ workspacePaths });
    }
  }

  private updateWorkflowRecordingThreadSavedPlaybookLifecycle(
    threadId: string,
    workflowId: string,
    patch: WorkflowRecordingLifecyclePatch,
  ): void {
    try {
      const thread = this.getThread(threadId);
      const next = workflowRecordingApplySavedPlaybookLifecycle(thread.workflowRecording, workflowId, patch);
      if (!next) return;
      this.requireDb()
        .prepare("UPDATE threads SET workflow_recording_json = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(next), patch.updatedAt ?? new Date().toISOString(), threadId);
    } catch {
      return;
    }
  }

  private updateWorkflowRecordingThreadRestoredPlaybook(
    threadId: string,
    savedPlaybook: WorkflowRecordingSavedPlaybook,
    playbook: WorkflowRecordingPlaybookDraft,
    updatedAt: string,
  ): void {
    try {
      const thread = this.getThread(threadId);
      const next = workflowRecordingApplyRestoredPlaybookState(thread.workflowRecording, savedPlaybook, playbook);
      if (!next) return;
      this.requireDb()
        .prepare("UPDATE threads SET workflow_recording_json = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(next), updatedAt, threadId);
    } catch {
      return;
    }
  }

  applyWorkflowRecordingSummary(threadId: string, messageId?: string): WorkflowRecordingState {
    const thread = this.getThread(threadId);
    const current = workflowRecordingRequireStoppedReviewDraft(
      thread.workflowRecording,
      "Stop the workflow recording before applying a Pi summary.",
    );
    const messages = this.listMessages(threadId);
    const summaryMessage = workflowRecordingFindSummaryMessage(messages, messageId);
    if (!summaryMessage) {
      throw new Error("No structured Pi workflow summary was found in this thread.");
    }
    const now = new Date().toISOString();
    const recording = applyWorkflowRecordingSummaryState({
      current,
      markdown: summaryMessage.content,
      now,
    });
    this.assertWorkflowRecordingDraftReusable(threadId, current, recording.review!.draft);
    this.requireDb()
      .prepare("UPDATE threads SET workflow_recording_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(recording), now, threadId);
    return recording;
  }

  updateThreadSettings(
    threadId: string,
    input: Partial<Pick<ThreadSummary, "permissionMode" | "collaborationMode" | "model" | "thinkingLevel" | "memoryEnabled">> & {
      piSessionFile?: string | null;
    },
  ): ThreadSummary {
    const current = this.getThread(threadId);
    const now = new Date().toISOString();
    const nextPiSessionFile = Object.hasOwn(input, "piSessionFile")
      ? (input.piSessionFile ?? null)
      : (current.piSessionFile ?? null);
    this.requireDb()
      .prepare(
        `UPDATE threads
         SET permission_mode = ?, collaboration_mode = ?, model = ?, thinking_level = ?, memory_enabled = ?, pi_session_file = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.permissionMode ?? current.permissionMode,
        input.collaborationMode ?? current.collaborationMode,
        normalizeAmbientModelId(input.model ?? current.model),
        input.thinkingLevel ?? current.thinkingLevel,
        (input.memoryEnabled ?? current.memoryEnabled) ? 1 : 0,
        nextPiSessionFile,
        now,
        threadId,
      );
    return this.getThread(threadId);
  }

  updateThreadTitle(threadId: string, title: string): ThreadSummary {
    const trimmed = title.trim();
    if (!trimmed) return this.getThread(threadId);
    this.requireDb()
      .prepare("UPDATE threads SET title = ? WHERE id = ?")
      .run(trimmed, threadId);
    return this.getThread(threadId);
  }

  setThreadPinned(threadId: string, pinned: boolean): ThreadSummary {
    this.requireDb().prepare("UPDATE threads SET pinned = ? WHERE id = ?").run(pinned ? 1 : 0, threadId);
    return this.getThread(threadId);
  }

  markThreadRead(threadId: string, readAt = new Date().toISOString()): ThreadSummary {
    this.requireDb().prepare("UPDATE threads SET last_read_at = ? WHERE id = ?").run(readAt, threadId);
    return this.getThread(threadId);
  }

  markThreadUnread(threadId: string): ThreadSummary {
    const thread = this.getThread(threadId);
    const updatedMs = Date.parse(thread.updatedAt);
    const readAt = Number.isFinite(updatedMs) && updatedMs > 0
      ? new Date(updatedMs - 1).toISOString()
      : "1970-01-01T00:00:00.000Z";
    return this.markThreadRead(threadId, readAt);
  }

  updateThreadWorkspacePath(threadId: string, workspacePath: string): ThreadSummary {
    const now = new Date().toISOString();
    this.requireDb()
      .prepare("UPDATE threads SET workspace_path = ?, updated_at = ? WHERE id = ?")
      .run(workspacePath, now, threadId);
    return this.getThread(threadId);
  }

  listWorkflowLabRuns(input: ListWorkflowLabRunsInput = {}): WorkflowLabRun[] {
    return workflowLabListRuns(this.getWorkspace().path, input);
  }

  getWorkflowLabRun(runId: string): WorkflowLabRun {
    const run = workflowLabReadRun(workflowLabRunArtifactPath(this.getWorkspace().path, runId));
    if (!run) throw new Error(`Workflow Lab run not found: ${runId}`);
    return run;
  }

  createWorkflowLabRun(input: CreateWorkflowLabRunInput): WorkflowLabRun {
    const workflow = this.describeWorkflowRecording(input.workflowId);
    const run = workflowLabCreateRun({
      workspacePath: this.getWorkspace().path,
      workflow,
      request: input,
      runId: `workflow_lab_${randomUUID()}`,
      createdAt: new Date().toISOString(),
    });
    return this.saveWorkflowLabRun(run);
  }

  saveWorkflowLabRun(run: WorkflowLabRun): WorkflowLabRun {
    return workflowLabWriteRun(this.getWorkspace().path, run);
  }

  updateWorkflowLabRunStatus(runId: string, status: WorkflowLabRunStatus, error?: string): WorkflowLabRun {
    const run = this.getWorkflowLabRun(runId);
    const now = new Date().toISOString();
    return this.saveWorkflowLabRun(workflowLabApplyRunStatus(run, status, { updatedAt: now, error }));
  }

  appendWorkflowLabVariant(
    runId: string,
    input: {
      parentVariantId?: string;
      hypothesis: string;
      patch: WorkflowLabCandidatePatch;
      status?: WorkflowLabVariantStatus;
    },
  ): WorkflowLabVariant {
    const run = this.getWorkflowLabRun(runId);
    const now = new Date().toISOString();
    const appended = workflowLabAppendVariant({
      run,
      variantId: `workflow_lab_variant_${randomUUID()}`,
      createdAt: now,
      ...input,
    });
    this.saveWorkflowLabRun(appended.run);
    return appended.variant;
  }

  recordWorkflowLabEvaluation(
    runId: string,
    variantId: string,
    evaluation: WorkflowLabEvaluationResult,
    status: WorkflowLabVariantStatus,
  ): WorkflowLabRun {
    const run = this.getWorkflowLabRun(runId);
    const now = new Date().toISOString();
    return this.saveWorkflowLabRun(
      workflowLabRecordEvaluation({ run, variantId, evaluation, status, evaluatedAt: now }),
    );
  }

  adoptWorkflowLabVariant(runId: string, variantId: string): WorkflowRecordingLibraryDescription {
    const run = this.getWorkflowLabRun(runId);
    const variant = workflowLabRequireAcceptedVariant(run, variantId);
    const current = this.describeWorkflowRecording(run.workflowId);
    workflowLabRequireBaseVersion(run, current.version);
    const updated = this.updateWorkflowRecordingPlaybook(run.workflowId, {
      baseVersion: run.baseVersion,
      ...(variant.patch.title ? { title: variant.patch.title } : {}),
      draft: variant.patch.draft,
    });
    const now = new Date().toISOString();
    this.saveWorkflowLabRun(
      workflowLabApplyVariantAdoption({ run, variant, adoptedVersion: updated.version, adoptedAt: now }),
    );
    return updated;
  }

  setThreadWorktree(input: ThreadWorktreeInput): ThreadWorktreeSummary {
    const now = new Date().toISOString();
    const createdAt = input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? now;
    this.requireDb()
      .prepare(
        `INSERT INTO thread_worktrees
          (thread_id, project_root, worktree_path, branch_name, base_ref, upstream, worktree_status, created_at, updated_at, last_checkpoint_id, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET
          project_root = excluded.project_root,
          worktree_path = excluded.worktree_path,
          branch_name = excluded.branch_name,
          base_ref = excluded.base_ref,
          upstream = excluded.upstream,
          worktree_status = excluded.worktree_status,
          updated_at = excluded.updated_at,
          last_checkpoint_id = excluded.last_checkpoint_id,
          error = excluded.error`,
      )
      .run(
        input.threadId,
        input.projectRoot,
        input.worktreePath,
        input.branchName,
        input.baseRef ?? null,
        input.upstream ?? null,
        input.status,
        createdAt,
        updatedAt,
        input.lastCheckpointId ?? null,
        input.error ?? null,
      );
    return this.getThreadWorktree(input.threadId)!;
  }

  archiveChats(): number {
    const db = this.requireDb();
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `UPDATE threads
         SET archived_at = ?, updated_at = ?
         WHERE (archived_at IS NULL OR archived_at = '')
           AND NOT EXISTS (
             SELECT 1 FROM orchestration_runs
             WHERE orchestration_runs.thread_id = threads.id
           )`,
      )
      .run(now, now);
    if (this.listThreads().length === 0) this.createThread();
    const activeThreadId = this.getLastActiveThreadId();
    if (activeThreadId && !this.listThreads().some((thread) => thread.id === activeThreadId)) {
      this.setLastActiveThreadId(this.listThreads()[0]?.id ?? "");
    }
    return Number(result.changes || 0);
  }

  archiveThread(threadId: string): number {
    const db = this.requireDb();
    const now = new Date().toISOString();
    const result = db
      .prepare("UPDATE threads SET archived_at = ?, updated_at = ? WHERE id = ? AND (archived_at IS NULL OR archived_at = '')")
      .run(now, now, threadId);
    if (this.listThreads().length === 0) this.createThread();
    const activeThreadId = this.getLastActiveThreadId();
    if (activeThreadId && !this.listThreads().some((thread) => thread.id === activeThreadId)) {
      this.setLastActiveThreadId(this.listThreads()[0]?.id ?? "");
    }
    return Number(result.changes || 0);
  }

  forkThread(threadId: string, workspacePath = this.getWorkspace().path): ThreadSummary {
    const db = this.requireDb();
    const source = this.getThread(threadId);
    const now = new Date().toISOString();
    const fork = this.createThread(source.title, workspacePath);
    db.prepare(
      `UPDATE threads
       SET permission_mode = ?, collaboration_mode = ?, model = ?, thinking_level = ?, last_message_preview = ?, updated_at = ?, last_read_at = ?
       WHERE id = ?`,
    ).run(
      source.permissionMode,
      source.collaborationMode,
      source.model,
      source.thinkingLevel,
      source.lastMessagePreview,
      now,
      now,
      fork.id,
    );
    const messages = db
      .prepare("SELECT role, content, created_at, metadata_json FROM messages WHERE thread_id = ? ORDER BY created_at ASC")
      .all(threadId) as Pick<MessageRow, "role" | "content" | "created_at" | "metadata_json">[];
    const insertMessage = db.prepare("INSERT INTO messages (id, thread_id, role, content, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)");
    const insertMany = db.transaction((rows: typeof messages) => {
      for (const row of rows) {
        insertMessage.run(randomUUID(), fork.id, row.role, row.content, row.created_at, row.metadata_json);
      }
    });
    insertMany(messages);
    return this.getThread(fork.id);
  }

  getThreadWorktree(threadId: string): ThreadWorktreeSummary | undefined {
    const row = this.requireDb().prepare("SELECT * FROM thread_worktrees WHERE thread_id = ?").get(threadId) as
      | ThreadWorktreeRow
      | undefined;
    return row ? this.mapThreadWorktree(row) : undefined;
  }

  updateThreadWorktreeCheckpoint(threadId: string, checkpointId: string): void {
    this.requireDb()
      .prepare("UPDATE thread_worktrees SET last_checkpoint_id = ?, updated_at = ? WHERE thread_id = ?")
      .run(checkpointId, new Date().toISOString(), threadId);
  }

  listMessages(threadId: string): ChatMessage[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC")
      .all(threadId) as MessageRow[];
    return rows.map(this.mapMessage);
  }

  listMessageVoiceStates(threadId: string): MessageVoiceState[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM message_voice_states WHERE thread_id = ? ORDER BY updated_at ASC")
      .all(threadId) as MessageVoiceStateRow[];
    return rows.map(this.mapMessageVoiceState);
  }

  getMessageVoiceState(messageId: string): MessageVoiceState | undefined {
    const row = this.requireDb().prepare("SELECT * FROM message_voice_states WHERE message_id = ?").get(messageId) as
      | MessageVoiceStateRow
      | undefined;
    return row ? this.mapMessageVoiceState(row) : undefined;
  }

  clearMessageVoiceArtifact(messageId: string, error = "Voice artifact cleared."): MessageVoiceState {
    const current = this.getMessageVoiceState(messageId);
    if (!current) throw new Error(`Voice state not found for message: ${messageId}`);
    return this.setMessageVoiceState({
      messageId: current.messageId,
      threadId: current.threadId,
      status: "canceled",
      source: current.source,
      sourceMessageId: current.sourceMessageId,
      providerCapabilityId: current.providerCapabilityId,
      providerId: current.providerId,
      voiceId: current.voiceId,
      spokenText: current.spokenText,
      spokenTextChars: current.spokenTextChars,
      sourceTextChars: current.sourceTextChars,
      lastAudioPath: current.audioPath ?? current.lastAudioPath,
      error,
    });
  }

  setMessageVoiceState(input: Omit<MessageVoiceState, "createdAt" | "updatedAt">): MessageVoiceState {
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT INTO message_voice_states
          (message_id, thread_id, status, source, source_message_id, provider_capability_id, provider_id, voice_id, spoken_text,
           spoken_text_chars, source_text_chars, audio_path, last_audio_path, media_url, mime_type, duration_ms, error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET
           thread_id = excluded.thread_id,
           status = excluded.status,
           source = excluded.source,
           source_message_id = excluded.source_message_id,
           provider_capability_id = excluded.provider_capability_id,
           provider_id = excluded.provider_id,
           voice_id = excluded.voice_id,
           spoken_text = excluded.spoken_text,
           spoken_text_chars = excluded.spoken_text_chars,
           source_text_chars = excluded.source_text_chars,
           audio_path = excluded.audio_path,
           last_audio_path = excluded.last_audio_path,
           media_url = excluded.media_url,
           mime_type = excluded.mime_type,
           duration_ms = excluded.duration_ms,
           error = excluded.error,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.messageId,
        input.threadId,
        input.status,
        input.source,
        input.sourceMessageId,
        input.providerCapabilityId ?? null,
        input.providerId ?? null,
        input.voiceId ?? null,
        input.spokenText ?? null,
        input.spokenTextChars,
        input.sourceTextChars,
        input.audioPath ?? null,
        input.lastAudioPath ?? input.audioPath ?? null,
        input.mediaUrl ?? null,
        input.mimeType ?? null,
        input.durationMs ?? null,
        input.error ?? null,
        now,
        now,
      );
    return this.getMessageVoiceState(input.messageId)!;
  }

  deleteMessagesAfter(threadId: string, messageId: string): ChatMessage[] {
    const messages = this.listMessages(threadId);
    const index = messages.findIndex((message) => message.id === messageId);
    if (index < 0) throw new Error(`Message not found in thread: ${messageId}`);
    const removeIds = messages.slice(index + 1).map((message) => message.id);
    if (removeIds.length > 0) {
      const placeholders = removeIds.map(() => "?").join(", ");
      this.requireDb().prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...removeIds);
    }
    const remaining = messages.slice(0, index + 1);
    const preview = [...remaining].reverse().find((message) => message.role !== "tool" && message.content.trim())?.content ?? "";
    this.touchThread(threadId, preview);
    return remaining;
  }

  searchWorkspace(
    query: string,
    options: {
      scope?: Exclude<WorkspaceSearchScope, "all-projects">;
      threadId?: string;
      limit?: number;
      projectName?: string;
      workspacePath?: string;
    } = {},
  ): WorkspaceSearchResult[] {
    const needle = query.trim();
    if (!needle) return [];
    const boundedLimit = Math.max(1, Math.min(options.limit ?? 50, 100));
    const perKindLimit = Math.ceil(boundedLimit / 2);
    const like = `%${needle}%`;
    const scope = options.scope ?? "project";
    const threadId = scope === "chat" ? options.threadId : undefined;
    const threadRows = threadId
      ? (this.requireDb()
          .prepare(
            `SELECT * FROM threads
             WHERE id = ?
               AND (archived_at IS NULL OR archived_at = '')
               AND (title LIKE ? OR last_message_preview LIKE ?)
             ORDER BY updated_at DESC
             LIMIT ?`,
          )
          .all(threadId, like, like, perKindLimit) as ThreadRow[])
      : (this.requireDb()
          .prepare(
            `SELECT * FROM threads
             WHERE (archived_at IS NULL OR archived_at = '')
               AND (title LIKE ? OR last_message_preview LIKE ?)
             ORDER BY updated_at DESC
             LIMIT ?`,
          )
          .all(like, like, perKindLimit) as ThreadRow[]);
    const messageRows = threadId
      ? (this.requireDb()
          .prepare(
            `SELECT messages.id, messages.thread_id, messages.role, messages.content, messages.created_at, threads.title AS thread_title
             FROM messages
             JOIN threads ON threads.id = messages.thread_id
             WHERE messages.thread_id = ?
               AND (threads.archived_at IS NULL OR threads.archived_at = '')
               AND messages.content LIKE ?
             ORDER BY messages.created_at DESC
             LIMIT ?`,
          )
          .all(threadId, like, perKindLimit) as SearchMessageRow[])
      : (this.requireDb()
          .prepare(
            `SELECT messages.id, messages.thread_id, messages.role, messages.content, messages.created_at, threads.title AS thread_title
             FROM messages
             JOIN threads ON threads.id = messages.thread_id
             WHERE (threads.archived_at IS NULL OR threads.archived_at = '')
               AND messages.content LIKE ?
             ORDER BY messages.created_at DESC
             LIMIT ?`,
          )
          .all(like, perKindLimit) as SearchMessageRow[]);
    const workspace = this.getWorkspace();
    const workspacePath = options.workspacePath ?? workspace.path;
    const projectName = options.projectName ?? workspace.name;

    return [
      ...threadRows.map((row) => mapWorkspaceSearchThreadRow(row, { workspacePath, projectName, scope })),
      ...messageRows.map((row) => mapWorkspaceSearchMessageRow(row, { workspacePath, projectName, scope })),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, boundedLimit);
  }

  addMessage(input: {
    threadId: string;
    role: ChatMessage["role"];
    content: string;
    metadata?: Record<string, unknown>;
  }): ChatMessage {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.requireDb()
      .prepare(
        "INSERT INTO messages (id, thread_id, role, content, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.threadId,
        input.role,
        input.content,
        now,
        input.metadata ? JSON.stringify(input.metadata) : null,
      );
    this.touchThread(input.threadId, input.content);
    return this.getMessage(id);
  }

  appendToMessage(messageId: string, delta: string): ChatMessage {
    this.requireDb().prepare("UPDATE messages SET content = content || ? WHERE id = ?").run(delta, messageId);
    return this.getMessage(messageId);
  }

  replaceMessage(messageId: string, content: string, metadata?: Record<string, unknown>): ChatMessage {
    this.requireDb()
      .prepare("UPDATE messages SET content = ?, metadata_json = ? WHERE id = ?")
      .run(content, metadata ? JSON.stringify(metadata) : null, messageId);
    const message = this.getMessage(messageId);
    this.touchThread(message.threadId, content);
    return message;
  }

  startRun(input: { threadId: string; assistantMessageId: string }): RunRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT INTO runs
        (id, thread_id, assistant_message_id, status, started_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.threadId, input.assistantMessageId, "starting", now, now);
    return this.getRun(id);
  }

  updateRunStatus(runId: string, status: ActivePersistedRunStatus): RunRecord {
    this.requireDb()
      .prepare("UPDATE runs SET status = ?, updated_at = ? WHERE id = ? AND completed_at IS NULL")
      .run(status, new Date().toISOString(), runId);
    return this.getRun(runId);
  }

  updateRunDiagnostics(runId: string, diagnostics: RunDiagnostics): RunRecord {
    const current = this.getRun(runId);
    const nextDiagnostics: RunDiagnostics = { ...(current.diagnostics ?? {}), ...diagnostics };
    this.requireDb()
      .prepare("UPDATE runs SET diagnostics_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(nextDiagnostics), new Date().toISOString(), runId);
    return this.getRun(runId);
  }

  getRunRecord(runId: string): RunRecord {
    return this.getRun(runId);
  }

  finishRun(runId: string, status: TerminalPersistedRunStatus, errorMessage?: string): RunRecord {
    const now = new Date().toISOString();
    this.requireDb()
      .prepare("UPDATE runs SET status = ?, updated_at = ?, completed_at = ?, error_message = ? WHERE id = ?")
      .run(status, now, now, errorMessage ?? null, runId);
    return this.getRun(runId);
  }

  listActiveRuns(): RunRecord[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM runs WHERE completed_at IS NULL AND status IN ('starting', 'streaming', 'tool') ORDER BY updated_at DESC")
      .all() as RunRow[];
    return rows.map(this.mapRun);
  }

  recordContextUsageSnapshot(input: ContextUsageSnapshotInput): ContextUsageSnapshot {
    this.getThread(input.threadId);
    const now = input.updatedAt ?? new Date().toISOString();
    const id = randomUUID();
    this.requireDb()
      .prepare(
        `INSERT INTO context_usage_snapshots
        (id, thread_id, source, tokens, context_window, percent, latest_compaction_at, compaction_count, updated_at, diagnostics_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.threadId,
        input.source,
        input.tokens ?? null,
        input.contextWindow ?? null,
        input.percent ?? null,
        input.latestCompactionAt ?? null,
        input.compactionCount,
        now,
        input.diagnostics ? JSON.stringify(input.diagnostics) : null,
      );
    const snapshot = this.mapContextUsageSnapshot(
      this.requireDb().prepare("SELECT * FROM context_usage_snapshots WHERE id = ?").get(id) as ContextUsageSnapshotRow,
    );
    return snapshot;
  }

  getLatestContextUsageSnapshot(threadId: string): ContextUsageSnapshot | undefined {
    const row = this.requireDb()
      .prepare("SELECT * FROM context_usage_snapshots WHERE thread_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1")
      .get(threadId) as ContextUsageSnapshotRow | undefined;
    return row ? this.mapContextUsageSnapshot(row) : undefined;
  }

  listContextUsageSnapshots(limit = 100): ContextUsageSnapshot[] {
    const boundedLimit = Math.max(1, Math.min(limit, 500));
    const rows = this.requireDb()
      .prepare("SELECT * FROM context_usage_snapshots ORDER BY updated_at DESC, rowid DESC LIMIT ?")
      .all(boundedLimit) as ContextUsageSnapshotRow[];
    return rows.map(this.mapContextUsageSnapshot);
  }

  addPermissionAudit(input: PermissionAuditInput): PermissionAuditEntry {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT INTO permission_audit
        (id, run_id, thread_id, created_at, permission_mode, tool_name, risk, decision, detail, reason, decision_source, grant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.runId ?? null,
        input.threadId,
        now,
        input.permissionMode,
        input.toolName,
        input.risk,
        input.decision,
        input.detail ?? null,
        input.reason,
        input.decisionSource ?? null,
        input.grantId ?? null,
      );
    return this.mapPermissionAudit(
      this.requireDb().prepare("SELECT * FROM permission_audit WHERE id = ?").get(id) as PermissionAuditRow,
    );
  }

  listPermissionAudit(limit = 50): PermissionAuditEntry[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM permission_audit ORDER BY created_at DESC LIMIT ?")
      .all(limit) as PermissionAuditRow[];
    return rows.map(this.mapPermissionAudit);
  }

  createPermissionGrant(input: CreateAmbientPermissionGrantInput): AmbientPermissionGrant {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT INTO permission_grants
        (id, created_at, updated_at, expires_at, revoked_at, created_by, permission_mode_at_creation, scope_kind, thread_id, workflow_thread_id, project_path, workspace_path, action_kind, target_kind, target_hash, target_label, conditions_json, source, reason)
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        now,
        now,
        input.expiresAt ?? null,
        input.createdBy ?? "user",
        input.permissionModeAtCreation,
        input.scopeKind,
        input.threadId ?? null,
        input.workflowThreadId ?? null,
        input.projectPath ?? null,
        input.workspacePath ?? null,
        input.actionKind,
        input.targetKind,
        input.targetHash,
        input.targetLabel,
        input.conditions ? JSON.stringify(input.conditions) : null,
        input.source ?? "permission_prompt",
        input.reason,
      );
    return this.getPermissionGrant(id);
  }

  getPermissionGrant(id: string): AmbientPermissionGrant {
    const row = this.requireDb().prepare("SELECT * FROM permission_grants WHERE id = ?").get(id) as AmbientPermissionGrantRow | undefined;
    if (!row) throw new Error(`Permission grant not found: ${id}`);
    return this.mapPermissionGrant(row);
  }

  listPermissionGrants(input: { includeRevoked?: boolean } = {}): AmbientPermissionGrant[] {
    const rows = this.requireDb()
      .prepare(
        input.includeRevoked
          ? "SELECT * FROM permission_grants ORDER BY updated_at DESC, created_at DESC"
          : "SELECT * FROM permission_grants WHERE revoked_at IS NULL ORDER BY updated_at DESC, created_at DESC",
      )
      .all() as AmbientPermissionGrantRow[];
    return rows.map(this.mapPermissionGrant);
  }

  revokePermissionGrant(id: string): AmbientPermissionGrant {
    const now = new Date().toISOString();
    this.requireDb().prepare("UPDATE permission_grants SET revoked_at = COALESCE(revoked_at, ?), updated_at = ? WHERE id = ?").run(now, now, id);
    return this.getPermissionGrant(id);
  }

  createPlannerPlanArtifact(input: PlannerPlanArtifactInput): PlannerPlanArtifact {
    const id = randomUUID();
    const now = new Date().toISOString();
    const status = input.status ?? "ready";
    const decisionQuestions = input.decisionQuestions ?? [];
    const workflowState = input.workflowState ?? plannerPlanWorkflowStateForQuestions(decisionQuestions);
    const db = this.requireDb();
    const insert = db.transaction(() => {
      if (status === "ready") {
        db.prepare(
          "UPDATE planner_plan_artifacts SET status = 'superseded', updated_at = ? WHERE thread_id = ? AND status = 'ready'",
        ).run(now, input.threadId);
      }
      db.prepare(
        `INSERT INTO planner_plan_artifacts
          (id, thread_id, source_message_id, status, workflow_state, finalization_attempt_json, durable_artifact_path, durable_artifact_generated_at, durable_artifact_validation_json, title, summary, content, steps_json, open_questions_json, risks_json, verification_json, diagrams_json, warnings_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.threadId,
        input.sourceMessageId,
        status,
        workflowState,
        null,
        null,
        null,
        null,
        input.title,
        input.summary,
        input.content,
        JSON.stringify(input.steps),
        JSON.stringify(input.openQuestions),
        JSON.stringify(input.risks),
        JSON.stringify(input.verification),
        JSON.stringify(input.diagrams ?? []),
        JSON.stringify(input.warnings ?? []),
        now,
        now,
      );
      const insertQuestion = db.prepare(
        `INSERT INTO planner_decision_questions
          (id, artifact_id, question_order, question, recommended_option_id, required, options_json, answer_kind, answer_option_id, answer_custom_text, answered_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      decisionQuestions.forEach((question, index) => {
        insertQuestion.run(
          question.id,
          id,
          index,
          question.question,
          question.recommendedOptionId,
          question.required ? 1 : 0,
          JSON.stringify(question.options),
          question.answer?.kind ?? null,
          question.answer?.kind === "option" ? question.answer.optionId : null,
          question.answer?.kind === "custom" ? question.answer.customText : null,
          question.answer?.answeredAt ?? null,
          now,
          now,
        );
      });
    });
    insert();
    return this.getPlannerPlanArtifact(id);
  }

  getPlannerPlanArtifact(artifactId: string): PlannerPlanArtifact {
    const row = this.requireDb()
      .prepare("SELECT * FROM planner_plan_artifacts WHERE id = ?")
      .get(artifactId) as PlannerPlanArtifactRow | undefined;
    if (!row) throw new Error(`Planner plan artifact not found: ${artifactId}`);
    return this.mapPlannerPlanArtifact(row);
  }

  listPlannerPlanArtifacts(threadId: string): PlannerPlanArtifact[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM planner_plan_artifacts WHERE thread_id = ? ORDER BY created_at DESC, rowid DESC")
      .all(threadId) as PlannerPlanArtifactRow[];
    return rows.map(this.mapPlannerPlanArtifact);
  }

  updatePlannerPlanArtifact(
    artifactId: string,
    input: { status?: PlannerPlanArtifactStatus; workflowState?: PlannerPlanWorkflowState },
  ): PlannerPlanArtifact {
    if (!input.status && !input.workflowState) return this.getPlannerPlanArtifact(artifactId);
    const current = this.getPlannerPlanArtifact(artifactId);
    const now = new Date().toISOString();
    let finalizationAttempt = current.finalizationAttempt;
    if (input.workflowState === "finalizing" && finalizationAttempt?.status !== "running") {
      finalizationAttempt = {
        id: randomUUID(),
        status: "running",
        startedAt: now,
      };
    } else if (input.workflowState === "failed" && finalizationAttempt?.status === "running") {
      finalizationAttempt = {
        ...finalizationAttempt,
        status: "failed",
        completedAt: now,
      };
    }
    this.requireDb()
      .prepare("UPDATE planner_plan_artifacts SET status = ?, workflow_state = ?, finalization_attempt_json = ?, updated_at = ? WHERE id = ?")
      .run(
        input.status ?? current.status,
        input.workflowState ?? current.workflowState,
        finalizationAttempt ? JSON.stringify(finalizationAttempt) : null,
        now,
        artifactId,
      );
    return this.getPlannerPlanArtifact(artifactId);
  }

  updatePlannerPlanArtifactStatus(artifactId: string, status: PlannerPlanArtifactStatus): PlannerPlanArtifact {
    return this.updatePlannerPlanArtifact(artifactId, { status });
  }

  finishPlannerPlanFinalizationAttempt(
    artifactId: string,
    input: { status: Exclude<PlannerPlanFinalizationAttemptStatus, "running">; workflowState?: PlannerPlanWorkflowState; error?: string },
  ): PlannerPlanArtifact {
    const current = this.getPlannerPlanArtifact(artifactId);
    if (current.finalizationAttempt?.status !== "running") return current;
    const now = new Date().toISOString();
    const workflowState =
      input.workflowState ??
      (input.status === "failed" ? "failed" : current.workflowState === "finalizing" ? "answers_complete" : current.workflowState);
    const finalizationAttempt: PlannerPlanFinalizationAttempt = {
      ...current.finalizationAttempt,
      status: input.status,
      completedAt: now,
      ...(input.error ? { error: input.error } : {}),
    };
    this.requireDb()
      .prepare("UPDATE planner_plan_artifacts SET workflow_state = ?, finalization_attempt_json = ?, updated_at = ? WHERE id = ?")
      .run(workflowState, JSON.stringify(finalizationAttempt), now, artifactId);
    return this.getPlannerPlanArtifact(artifactId);
  }

  updatePlannerPlanArtifactContent(
    artifactId: string,
    input: Pick<
      PlannerPlanArtifact,
      "sourceMessageId" | "title" | "summary" | "content" | "steps" | "openQuestions" | "risks" | "verification" | "warnings" | "diagrams"
    > & { workflowState?: PlannerPlanWorkflowState },
  ): PlannerPlanArtifact {
    const current = this.getPlannerPlanArtifact(artifactId);
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `UPDATE planner_plan_artifacts
         SET source_message_id = ?, title = ?, summary = ?, content = ?, steps_json = ?, open_questions_json = ?,
             risks_json = ?, verification_json = ?, diagrams_json = ?, warnings_json = ?, workflow_state = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.sourceMessageId,
        input.title,
        input.summary,
        input.content,
        JSON.stringify(input.steps),
        JSON.stringify(input.openQuestions),
        JSON.stringify(input.risks),
        JSON.stringify(input.verification),
        JSON.stringify(input.diagrams ?? []),
        JSON.stringify(input.warnings ?? []),
        input.workflowState ?? current.workflowState,
        now,
        artifactId,
      );
    return this.getPlannerPlanArtifact(artifactId);
  }

  setPlannerPlanDurableArtifact(
    artifactId: string,
    input: { path: string; generatedAt: string; validation?: PlannerDurableArtifactValidationResult; workflowState?: PlannerPlanWorkflowState },
  ): PlannerPlanArtifact {
    const current = this.getPlannerPlanArtifact(artifactId);
    const now = new Date().toISOString();
    const finalizationAttempt =
      current.finalizationAttempt?.status === "running"
        ? JSON.stringify({
            ...current.finalizationAttempt,
            status: "completed",
            completedAt: now,
          })
        : current.finalizationAttempt
          ? JSON.stringify(current.finalizationAttempt)
          : null;
    this.requireDb()
      .prepare(
        `UPDATE planner_plan_artifacts
         SET durable_artifact_path = ?, durable_artifact_generated_at = ?, durable_artifact_validation_json = ?, workflow_state = ?, finalization_attempt_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.path,
        input.generatedAt,
        input.validation ? JSON.stringify(input.validation) : null,
        input.workflowState ?? "durable_ready",
        finalizationAttempt,
        now,
        artifactId,
      );
    return this.getPlannerPlanArtifact(artifactId);
  }

  setPlannerPlanDurableArtifactValidation(
    artifactId: string,
    validation: PlannerDurableArtifactValidationResult,
    workflowState?: PlannerPlanWorkflowState,
  ): PlannerPlanArtifact {
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `UPDATE planner_plan_artifacts
         SET durable_artifact_validation_json = ?, workflow_state = COALESCE(?, workflow_state), updated_at = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify(validation), workflowState ?? null, now, artifactId);
    return this.getPlannerPlanArtifact(artifactId);
  }

  private projectBoardHasProtectedWorkFromDifferentThread(board: ProjectBoardSummary, threadId: string): boolean {
    const hasIncludedSourceFromDifferentThread = board.sources
      .filter(projectBoardSourceImpactIncluded)
      .some((source) => Boolean(source.threadId && source.threadId !== threadId));
    if (hasIncludedSourceFromDifferentThread) return true;
    return board.cards.some((card) => {
      if (card.status === "archived") return false;
      return Boolean(card.sourceThreadId && card.sourceThreadId !== threadId);
    });
  }

  promotePlannerDurableArtifactToBoardSource(artifactId: string): ProjectBoardSource | undefined {
    const artifact = this.getPlannerPlanArtifact(artifactId);
    if (!artifact.durableArtifactPath) return undefined;
    const thread = this.getThread(artifact.threadId);
    const projectPath = this.getProjectArtifactWorkspacePath();
    const durablePlanContent = readManagedBoardPlanContent(projectPath, artifact.durableArtifactPath) ?? plannerPlanArtifactSourceContent(artifact);
    const planDisplayTitle = projectBoardPlanDisplayTitle({
      artifactTitle: artifact.title,
      threadTitle: thread.title,
      summary: artifact.summary,
      content: durablePlanContent,
      fallback: "Planner plan",
    });
    const boardTitle = `${planDisplayTitle} board`.slice(0, 180);
    let board =
      this.getProjectBoardForPath(projectPath, artifact.threadId) ??
      this.createProjectBoard({
        title: boardTitle,
        summary: artifact.summary.trim() || "Project board created from a durable planner plan.",
        sourceThreadId: artifact.threadId,
      });
    const durablePlanSources = board.sources.filter(projectBoardSourceImpactDurablePlanPrimary);
    const alreadyLinked = durablePlanSources.some(
      (source) => source.artifactId === artifact.id && source.path === artifact.durableArtifactPath,
    );
    const replacingDifferentPrimaryDurablePlan = durablePlanSources.some(
      (source) => source.artifactId !== artifact.id || source.path !== artifact.durableArtifactPath,
    );
    if (
      (!alreadyLinked && this.projectBoardHasProtectedWorkFromDifferentThread(board, artifact.threadId)) ||
      replacingDifferentPrimaryDurablePlan
    ) {
      board = this.createProjectBoard({
        title: boardTitle,
        summary: artifact.summary.trim() || "Project board created from a durable planner plan.",
        replaceActive: true,
        sourceThreadId: artifact.threadId,
      });
    } else if (board.title !== boardTitle && projectBoardCanAdoptPlannerBoardTitle(board.title)) {
      const now = new Date().toISOString();
      this.requireDb().prepare("UPDATE project_boards SET title = ?, updated_at = ? WHERE id = ?").run(boardTitle, now, board.id);
      board = this.getProjectBoard(board.id) ?? board;
    }
    const existingSources = board.sources
      .filter((source) => {
        if (source.artifactId === artifact.id && source.path === artifact.durableArtifactPath) return false;
        if (projectBoardSourceImpactDurablePlanPrimary(source)) return false;
        return true;
      })
      .map((source) =>
        source.classifiedBy === "user" || !projectBoardSourceImpactIncluded(source)
          ? projectBoardSourceInputFromExisting(source)
          : projectBoardSourceInputExcludedByDurablePlan(source),
      );
    const contentHash = hashProjectBoardSourceContent(durablePlanContent);
    const source: ProjectBoardSourceInput = {
      kind: "plan_artifact",
      title: `${planDisplayTitle} Durable Plan`.slice(0, 180),
      summary: artifact.summary || "Durable planner artifact generated by Ambient.",
      excerpt: durablePlanSourceExcerptForBoardSource(durablePlanContent, artifact.content),
      path: artifact.durableArtifactPath,
      threadId: artifact.threadId,
      artifactId: artifact.id,
      messageId: artifact.sourceMessageId,
      contentHash,
      byteSize: Buffer.byteLength(durablePlanContent, "utf8"),
      classificationReason: `${DURABLE_PLAN_SOURCE_AUTHORITY_REASON}; Ambient generated this durable planner artifact from Planning Mode.`,
      classifiedBy: "fallback_heuristic",
      classificationConfidence: 1,
      authorityRole: "primary",
      includeInSynthesis: true,
      relevance: 100,
    };
    const sources = this.replaceProjectBoardSources(board.id, [
      ...existingSources,
      source,
    ]);
    const linked = sources.find((candidate) => candidate.artifactId === artifact.id && candidate.path === artifact.durableArtifactPath);
    if (linked) {
      this.appendProjectBoardEvent({
        boardId: board.id,
        kind: "source_updated",
        title: "Durable plan linked to board",
        summary: `${linked.title} is available as an explicit board plan artifact.`,
        entityKind: "project_board_source",
        entityId: linked.id,
        metadata: {
          sourceId: linked.id,
          artifactId: artifact.id,
          threadId: artifact.threadId,
          sourceMessageId: artifact.sourceMessageId,
          durablePlanPath: artifact.durableArtifactPath,
          durablePlanContentHash: contentHash,
          durablePlanGeneratedAt: artifact.durableArtifactGeneratedAt,
          durablePlanValidationOk: artifact.durableArtifactValidation?.ok,
        },
      });
    }
    return linked;
  }

  answerPlannerDecisionQuestion(
    artifactId: string,
    questionId: string,
    answer: { kind: "option"; optionId: string } | { kind: "custom"; customText: string },
  ): PlannerPlanArtifact {
    const db = this.requireDb();
    const row = db
      .prepare("SELECT * FROM planner_decision_questions WHERE artifact_id = ? AND id = ?")
      .get(artifactId, questionId) as PlannerDecisionQuestionRow | undefined;
    if (!row) throw new Error(`Planner decision question not found: ${artifactId}/${questionId}`);
    const options = parsePlannerDecisionOptions(row.options_json);
    if (answer.kind === "option" && !options.some((option) => option.id === answer.optionId)) {
      throw new Error(`Planner decision option not found: ${questionId}/${answer.optionId}`);
    }
    if (answer.kind === "custom" && !answer.customText.trim()) {
      throw new Error("Planner decision custom answer cannot be empty.");
    }
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(
        `UPDATE planner_decision_questions
           SET answer_kind = ?, answer_option_id = ?, answer_custom_text = ?, answered_at = ?, updated_at = ?
         WHERE artifact_id = ? AND id = ?`,
      ).run(
        answer.kind,
        answer.kind === "option" ? answer.optionId : null,
        answer.kind === "custom" ? answer.customText.trim() : null,
        now,
        now,
        artifactId,
        questionId,
      );
      db.prepare("UPDATE planner_plan_artifacts SET updated_at = ? WHERE id = ?").run(now, artifactId);
    })();
    const artifact = this.getPlannerPlanArtifact(artifactId);
    const workflowState = plannerPlanWorkflowStateForQuestions(artifact.decisionQuestions);
    if (artifact.workflowState !== workflowState) {
      db.prepare("UPDATE planner_plan_artifacts SET workflow_state = ?, updated_at = ? WHERE id = ?").run(workflowState, now, artifactId);
      return this.getPlannerPlanArtifact(artifactId);
    }
    return artifact;
  }

  isPluginEnabled(pluginId: string): boolean {
    const row = this.requireDb().prepare("SELECT enabled FROM plugin_settings WHERE plugin_id = ?").get(pluginId) as
      | { enabled: number }
      | undefined;
    return row ? row.enabled === 1 : true;
  }

  setPluginEnabled(pluginId: string, enabled: boolean): void {
    this.requireDb()
      .prepare(
        `INSERT INTO plugin_settings (plugin_id, enabled, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(plugin_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
      )
      .run(pluginId, enabled ? 1 : 0, new Date().toISOString());
  }

  isPluginTrusted(pluginId: string, pluginFingerprint?: string): boolean {
    const row = this.requireDb().prepare("SELECT plugin_id, fingerprint FROM plugin_trust WHERE plugin_id = ?").get(pluginId) as
      | { plugin_id: string; fingerprint: string | null }
      | undefined;
    if (!row) return false;
    if (pluginFingerprint === undefined) return true;
    return row.fingerprint === pluginFingerprint;
  }

  setPluginTrusted(pluginId: string, trusted: boolean, pluginFingerprint?: string): void {
    if (!trusted) {
      this.requireDb().prepare("DELETE FROM plugin_trust WHERE plugin_id = ?").run(pluginId);
      return;
    }
    this.requireDb()
      .prepare(
        `INSERT INTO plugin_trust (plugin_id, fingerprint, trusted_at)
         VALUES (?, ?, ?)
         ON CONFLICT(plugin_id) DO UPDATE SET fingerprint = excluded.fingerprint, trusted_at = excluded.trusted_at`,
      )
      .run(pluginId, pluginFingerprint ?? null, new Date().toISOString());
  }

  isPiPackageEnabled(packageId: string): boolean {
    const row = this.requireDb().prepare("SELECT enabled FROM plugin_settings WHERE plugin_id = ?").get(piPackageSettingId(packageId)) as
      | { enabled: number }
      | undefined;
    return row ? row.enabled === 1 : false;
  }

  setPiPackageEnabled(packageId: string, enabled: boolean): void {
    this.requireDb()
      .prepare(
        `INSERT INTO plugin_settings (plugin_id, enabled, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(plugin_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
      )
      .run(piPackageSettingId(packageId), enabled ? 1 : 0, new Date().toISOString());
  }

  clearPiPackageEnabled(packageId: string): void {
    this.requireDb().prepare("DELETE FROM plugin_settings WHERE plugin_id = ?").run(piPackageSettingId(packageId));
  }

  listWorkflowAgentFolders(): WorkflowAgentFolderSummary[] {
    this.ensureWorkflowAgentThreadLinks();
    const project = this.getWorkspace();
    const folders = this.listWorkflowAgentFolderRows();
    const folderSummaries = new Map<string, WorkflowAgentFolderSummary>();
    for (const folder of folders) {
      folderSummaries.set(folder.id, mapWorkflowAgentFolderRow(folder));
    }
    const home = folderSummaries.get(WORKFLOW_AGENT_HOME_FOLDER_ID) ?? {
      id: WORKFLOW_AGENT_HOME_FOLDER_ID,
      name: "Home",
      kind: "home" as const,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      threads: [],
    };
    folderSummaries.set(home.id, home);

    const workflowRuns = this.listWorkflowRuns(undefined, 200);
    for (const thread of this.listWorkflowAgentThreadRows()) {
      const artifact = thread.active_artifact_id ? this.tryGetWorkflowArtifact(thread.active_artifact_id) : undefined;
      const latestRun = artifact ? latestWorkflowRunForArtifact(workflowRuns, artifact.id) : undefined;
      const summary = this.workflowAgentThreadFromRow(thread, artifact, latestRun, project.name, project.path);
      const folder = folderSummaries.get(summary.folderId) ?? home;
      folder.threads.push({ ...summary, folderId: folder.id });
    }

    return [...folderSummaries.values()]
      .map((folder) => ({
        ...folder,
        threads: folder.threads.sort(compareWorkflowAgentThreads),
      }))
      .sort(compareWorkflowAgentFolders);
  }

  createWorkflowAgentFolder(input: CreateWorkflowAgentFolderInput): WorkflowAgentFolderSummary[] {
    const name = input.name.trim();
    if (!name) throw new Error("Workflow Agent folder name is required.");
    const now = new Date().toISOString();
    this.ensureDefaultWorkflowAgentFolder();
    this.requireDb()
      .prepare("INSERT INTO workflow_agent_folders (id, name, folder_kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), name, "custom", now, now);
    return this.listWorkflowAgentFolders();
  }

  moveWorkflowAgentThread(input: MoveWorkflowAgentThreadInput): WorkflowAgentFolderSummary[] {
    const folder = this.requireWorkflowAgentFolder(input.folderId);
    const thread = this.requireWorkflowAgentThread(input.threadId);
    const now = new Date().toISOString();
    this.requireDb()
      .prepare("UPDATE workflow_agent_threads SET folder_id = ?, updated_at = ? WHERE id = ?")
      .run(folder.id, now, thread.id);
    this.requireDb().prepare("UPDATE workflow_agent_folders SET updated_at = ? WHERE id = ?").run(now, folder.id);
    return this.listWorkflowAgentFolders();
  }

  createWorkflowAgentThread(input: CreateWorkflowAgentThreadInput): WorkflowAgentFolderSummary[] {
    this.createWorkflowAgentThreadRecord(input);
    return this.listWorkflowAgentFolders();
  }

  createWorkflowAgentThreadSummary(input: CreateWorkflowAgentThreadInput): WorkflowAgentThreadSummary {
    const row = this.createWorkflowAgentThreadRecord(input);
    return this.workflowAgentThreadFromRow(row, undefined, undefined, basename(row.project_path), this.getWorkspace().path);
  }

  ensureWorkflowAgentChatThread(threadId: string): WorkflowAgentThreadSummary {
    const row = this.requireWorkflowAgentThread(threadId);
    const existing = row.chat_thread_id ? this.tryGetThread(row.chat_thread_id) : undefined;
    if (existing) return this.getWorkflowAgentThreadSummary(threadId);
    const now = new Date().toISOString();
    const chatThread = this.createThread(`Workflow: ${row.title}`, row.project_path || this.getWorkspace().path);
    this.requireDb()
      .prepare("UPDATE workflow_agent_threads SET chat_thread_id = ?, updated_at = ? WHERE id = ?")
      .run(chatThread.id, now, row.id);
    return this.getWorkflowAgentThreadSummary(threadId);
  }

  getWorkflowAgentThreadSummary(threadId: string): WorkflowAgentThreadSummary {
    const row = this.requireWorkflowAgentThread(threadId);
    const project = this.getWorkspace();
    const artifact = row.active_artifact_id ? this.tryGetWorkflowArtifact(row.active_artifact_id) : undefined;
    const latestRun = artifact ? latestWorkflowRunForArtifact(this.listWorkflowRuns(undefined, 200), artifact.id) : undefined;
    return this.workflowAgentThreadFromRow(row, artifact, latestRun, project.name, project.path);
  }

  listWorkflowGraphSnapshots(workflowThreadId: string): WorkflowGraphSnapshot[] {
    this.requireWorkflowAgentThread(workflowThreadId);
    const rows = this.requireDb()
      .prepare("SELECT * FROM workflow_graph_snapshots WHERE workflow_thread_id = ? ORDER BY snapshot_version DESC")
      .all(workflowThreadId) as WorkflowGraphSnapshotRow[];
    return rows.map(this.mapWorkflowGraphSnapshot);
  }

  createWorkflowGraphSnapshot(input: CreateWorkflowGraphSnapshotInput): WorkflowGraphSnapshot {
    this.requireWorkflowAgentThread(input.workflowThreadId);
    const row = this.requireDb()
      .prepare("SELECT COALESCE(MAX(snapshot_version), 0) + 1 AS next_version FROM workflow_graph_snapshots WHERE workflow_thread_id = ?")
      .get(input.workflowThreadId) as { next_version: number };
    const id = randomUUID();
    const now = new Date().toISOString();
    const graphJson = JSON.stringify({ nodes: input.nodes, edges: input.edges });
    this.requireDb()
      .prepare(
        `INSERT INTO workflow_graph_snapshots
          (id, workflow_thread_id, snapshot_version, snapshot_source, summary, graph_json, artifact_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.workflowThreadId, row.next_version, input.source, input.summary, graphJson, input.artifactPath ?? null, now);
    if (input.activate !== false) {
      this.requireDb()
        .prepare("UPDATE workflow_agent_threads SET active_graph_snapshot_id = ?, updated_at = ? WHERE id = ?")
        .run(id, now, input.workflowThreadId);
    } else {
      this.requireDb().prepare("UPDATE workflow_agent_threads SET updated_at = ? WHERE id = ?").run(now, input.workflowThreadId);
    }
    return this.mapWorkflowGraphSnapshot(
      this.requireDb().prepare("SELECT * FROM workflow_graph_snapshots WHERE id = ?").get(id) as WorkflowGraphSnapshotRow,
    );
  }

  createWorkflowExplorationTrace(input: CreateWorkflowExplorationTraceInput): WorkflowExplorationTraceSummary {
    this.requireWorkflowAgentThread(input.workflowThreadId);
    const id = input.id ?? randomUUID();
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT INTO workflow_exploration_traces
          (id, workflow_thread_id, exploration_id, exploration_node_id, request_text, model, capability_manifest_json, observations_json, events_json, distillation_json, run_status, graph_snapshot_id, latest_progress_json, provider_health_json, retry_metadata_json, error_message, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.workflowThreadId,
        input.explorationId,
        input.explorationNodeId,
        input.request,
        input.model ?? null,
        JSON.stringify(input.capabilityManifest),
        JSON.stringify(input.observations),
        JSON.stringify(input.events ?? []),
        JSON.stringify(input.distillation),
        input.status ?? "succeeded",
        input.graphSnapshotId ?? null,
        input.latestProgress ? JSON.stringify(input.latestProgress) : null,
        input.providerHealth !== undefined ? JSON.stringify(input.providerHealth) : null,
        input.retryMetadata !== undefined ? JSON.stringify(input.retryMetadata) : null,
        input.error ?? null,
        now,
        now,
        input.completedAt ?? (input.status === "succeeded" || input.status === "failed" || input.status === "canceled" || input.status === "fallback" ? now : null),
      );
    return this.mapWorkflowExplorationTrace(
      this.requireDb().prepare("SELECT * FROM workflow_exploration_traces WHERE id = ?").get(id) as WorkflowExplorationTraceRow,
    );
  }

  updateWorkflowExplorationTrace(input: UpdateWorkflowExplorationTraceInput): WorkflowExplorationTraceSummary {
    const row = this.requireDb().prepare("SELECT * FROM workflow_exploration_traces WHERE id = ?").get(input.id) as WorkflowExplorationTraceRow | undefined;
    if (!row) throw new Error(`Workflow exploration trace not found: ${input.id}`);
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `UPDATE workflow_exploration_traces
         SET run_status = COALESCE(?, run_status),
             observations_json = COALESCE(?, observations_json),
             events_json = COALESCE(?, events_json),
             distillation_json = COALESCE(?, distillation_json),
             latest_progress_json = COALESCE(?, latest_progress_json),
             provider_health_json = COALESCE(?, provider_health_json),
             retry_metadata_json = COALESCE(?, retry_metadata_json),
             error_message = CASE WHEN ? THEN ? ELSE error_message END,
             completed_at = CASE WHEN ? THEN ? ELSE completed_at END,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.status ?? null,
        input.observations !== undefined ? JSON.stringify(input.observations) : null,
        input.events !== undefined ? JSON.stringify(input.events) : null,
        input.distillation !== undefined ? JSON.stringify(input.distillation) : null,
        input.latestProgress !== undefined ? JSON.stringify(input.latestProgress) : null,
        input.providerHealth !== undefined ? JSON.stringify(input.providerHealth) : null,
        input.retryMetadata !== undefined ? JSON.stringify(input.retryMetadata) : null,
        input.error !== undefined ? 1 : 0,
        input.error ?? null,
        input.completedAt !== undefined ? 1 : 0,
        input.completedAt ?? null,
        now,
        input.id,
      );
    return this.mapWorkflowExplorationTrace(
      this.requireDb().prepare("SELECT * FROM workflow_exploration_traces WHERE id = ?").get(input.id) as WorkflowExplorationTraceRow,
    );
  }

  listWorkflowExplorationTraces(workflowThreadId: string): WorkflowExplorationTraceSummary[] {
    this.requireWorkflowAgentThread(workflowThreadId);
    const rows = this.requireDb()
      .prepare("SELECT * FROM workflow_exploration_traces WHERE workflow_thread_id = ? ORDER BY created_at DESC, id DESC")
      .all(workflowThreadId) as WorkflowExplorationTraceRow[];
    return rows.map(this.mapWorkflowExplorationTrace);
  }

  listWorkflowVersions(workflowThreadId: string): WorkflowVersionSummary[] {
    this.requireWorkflowAgentThread(workflowThreadId);
    const rows = this.requireDb()
      .prepare("SELECT * FROM workflow_versions WHERE workflow_thread_id = ? ORDER BY version_number DESC, created_at DESC")
      .all(workflowThreadId) as WorkflowVersionRow[];
    return rows.map(this.mapWorkflowVersion);
  }

  getWorkflowVersion(versionId: string): WorkflowVersionSummary {
    const row = this.requireDb().prepare("SELECT * FROM workflow_versions WHERE id = ?").get(versionId) as WorkflowVersionRow | undefined;
    if (!row) throw new Error(`Workflow version not found: ${versionId}`);
    return this.mapWorkflowVersion(row);
  }

  getLatestApprovedWorkflowVersion(workflowThreadId: string): WorkflowVersionSummary | undefined {
    this.requireWorkflowAgentThread(workflowThreadId);
    const row = this.requireDb()
      .prepare(
        `SELECT * FROM workflow_versions
         WHERE workflow_thread_id = ? AND version_status = 'approved'
         ORDER BY version_number DESC, created_at DESC LIMIT 1`,
      )
      .get(workflowThreadId) as WorkflowVersionRow | undefined;
    return row ? this.mapWorkflowVersion(row) : undefined;
  }

  createWorkflowVersion(input: CreateWorkflowVersionInput): WorkflowVersionSummary {
    this.requireWorkflowAgentThread(input.workflowThreadId);
    this.getWorkflowArtifact(input.artifactId);
    if (input.graphSnapshotId && !this.tryGetWorkflowGraphSnapshot(input.graphSnapshotId)) {
      throw new Error(`Workflow graph snapshot not found: ${input.graphSnapshotId}`);
    }
    const row = this.requireDb()
      .prepare("SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM workflow_versions WHERE workflow_thread_id = ?")
      .get(input.workflowThreadId) as { next_version: number };
    const id = randomUUID();
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT INTO workflow_versions
          (id, workflow_thread_id, artifact_id, version_number, graph_snapshot_id, source_path, repo_path, git_commit_hash, version_status, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.workflowThreadId,
        input.artifactId,
        row.next_version,
        input.graphSnapshotId ?? null,
        input.sourcePath,
        input.repoPath,
        input.gitCommitHash ?? null,
        input.status,
        input.createdBy,
        now,
      );
    this.requireDb().prepare("UPDATE workflow_agent_threads SET updated_at = ? WHERE id = ?").run(now, input.workflowThreadId);
    return this.mapWorkflowVersion(this.requireDb().prepare("SELECT * FROM workflow_versions WHERE id = ?").get(id) as WorkflowVersionRow);
  }

  updateWorkflowVersionStatusForArtifact(artifactId: string, status: WorkflowVersionStatus): WorkflowVersionSummary | undefined {
    this.getWorkflowArtifact(artifactId);
    const row = this.requireDb()
      .prepare("SELECT * FROM workflow_versions WHERE artifact_id = ? ORDER BY version_number DESC, created_at DESC LIMIT 1")
      .get(artifactId) as WorkflowVersionRow | undefined;
    if (!row) return undefined;
    this.requireDb().prepare("UPDATE workflow_versions SET version_status = ? WHERE id = ?").run(status, row.id);
    const updated = this.requireDb().prepare("SELECT * FROM workflow_versions WHERE id = ?").get(row.id) as WorkflowVersionRow;
    return this.mapWorkflowVersion(updated);
  }

  listWorkflowRevisions(workflowThreadId: string): WorkflowRevisionSummary[] {
    this.requireWorkflowAgentThread(workflowThreadId);
    const rows = this.requireDb()
      .prepare("SELECT * FROM workflow_revisions WHERE workflow_thread_id = ? ORDER BY updated_at DESC, created_at DESC, rowid DESC")
      .all(workflowThreadId) as WorkflowRevisionRow[];
    return rows.map(this.mapWorkflowRevision);
  }

  getWorkflowRevision(revisionId: string): WorkflowRevisionSummary {
    const row = this.requireDb().prepare("SELECT * FROM workflow_revisions WHERE id = ?").get(revisionId) as WorkflowRevisionRow | undefined;
    if (!row) throw new Error(`Workflow revision not found: ${revisionId}`);
    return this.mapWorkflowRevision(row);
  }

  createWorkflowRevision(input: CreateWorkflowRevisionInput): WorkflowRevisionSummary {
    const requestedChange = input.requestedChange.trim();
    if (!requestedChange) throw new Error("Workflow revision requested change is required.");
    this.requireWorkflowAgentThread(input.workflowThreadId);
    const baseVersion = input.baseVersionId ? this.getWorkflowVersion(input.baseVersionId) : undefined;
    if (baseVersion && baseVersion.workflowThreadId !== input.workflowThreadId) {
      throw new Error(`Workflow version ${baseVersion.id} does not belong to workflow thread ${input.workflowThreadId}.`);
    }
    const baseArtifact = input.baseArtifactId ? this.getWorkflowArtifact(input.baseArtifactId) : undefined;
    if (baseArtifact?.workflowThreadId && baseArtifact.workflowThreadId !== input.workflowThreadId) {
      throw new Error(`Workflow artifact ${baseArtifact.id} does not belong to workflow thread ${input.workflowThreadId}.`);
    }
    this.requireWorkflowGraphSnapshotForThread(input.proposedGraphSnapshotId, input.workflowThreadId);
    const id = randomUUID();
    const now = new Date().toISOString();
    const status = input.status ?? "draft";
    this.requireDb()
      .prepare(
        `INSERT INTO workflow_revisions
          (id, workflow_thread_id, base_version_id, base_artifact_id, requested_change, proposed_graph_snapshot_id, graph_diff_json, source_diff, revision_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.workflowThreadId,
        baseVersion?.id ?? null,
        baseArtifact?.id ?? null,
        requestedChange,
        input.proposedGraphSnapshotId ?? null,
        input.graphDiff === undefined ? null : JSON.stringify(input.graphDiff),
        input.sourceDiff ?? null,
        status,
        now,
        now,
      );
    this.requireDb()
      .prepare("UPDATE workflow_agent_threads SET phase = ?, updated_at = ? WHERE id = ?")
      .run(status === "applied" ? "planned" : "revision", now, input.workflowThreadId);
    return this.getWorkflowRevision(id);
  }

  updateWorkflowRevision(input: UpdateWorkflowRevisionInput): WorkflowRevisionSummary {
    const current = this.getWorkflowRevision(input.id);
    const requestedChange = input.requestedChange === undefined ? current.requestedChange : input.requestedChange.trim();
    if (!requestedChange) throw new Error("Workflow revision requested change is required.");
    this.requireWorkflowGraphSnapshotForThread(input.proposedGraphSnapshotId === null ? undefined : input.proposedGraphSnapshotId, current.workflowThreadId);
    const now = new Date().toISOString();
    const status = input.status ?? current.status;
    this.requireDb()
      .prepare(
        `UPDATE workflow_revisions
         SET requested_change = ?,
             proposed_graph_snapshot_id = ?,
             graph_diff_json = ?,
             source_diff = ?,
             revision_status = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        requestedChange,
        input.proposedGraphSnapshotId === undefined ? (current.proposedGraphSnapshotId ?? null) : input.proposedGraphSnapshotId,
        input.graphDiff === undefined ? (current.graphDiff === undefined ? null : JSON.stringify(current.graphDiff)) : JSON.stringify(input.graphDiff),
        input.sourceDiff === undefined ? (current.sourceDiff ?? null) : input.sourceDiff,
        status,
        now,
        input.id,
      );
    this.requireDb()
      .prepare("UPDATE workflow_agent_threads SET phase = ?, updated_at = ? WHERE id = ?")
      .run(status === "applied" ? "planned" : "revision", now, current.workflowThreadId);
    return this.getWorkflowRevision(input.id);
  }

  resolveWorkflowRevision(input: ResolveWorkflowRevisionInput): WorkflowRevisionSummary {
    const current = this.getWorkflowRevision(input.id);
    if (current.status === input.decision) return current;
    if (current.status === "applied" || current.status === "rejected") {
      throw new Error(`Workflow revision is already ${current.status}.`);
    }

    const thread = this.requireWorkflowAgentThread(current.workflowThreadId);
    let activeArtifactId: string | null | undefined;
    let activeGraphSnapshotId: string | null | undefined;
    let phase: WorkflowAgentThreadPhase = "planned";

    if (input.decision === "applied") {
      const proposedVersion = this.workflowVersionForGraphSnapshot(current.proposedGraphSnapshotId);
      if (!proposedVersion || proposedVersion.workflowThreadId !== current.workflowThreadId) {
        throw new Error("Cannot apply workflow revision without a proposed workflow version.");
      }
      const proposedArtifact = this.getWorkflowArtifact(proposedVersion.artifactId);
      activeArtifactId = proposedArtifact.id;
      activeGraphSnapshotId = proposedVersion.graphSnapshotId ?? current.proposedGraphSnapshotId ?? null;
      phase = workflowAgentPhaseForArtifactStatus(proposedArtifact.status);
    } else {
      const baseVersion = current.baseVersionId ? this.getWorkflowVersion(current.baseVersionId) : undefined;
      const baseArtifactId = baseVersion?.artifactId ?? current.baseArtifactId;
      const baseArtifact = baseArtifactId ? this.getWorkflowArtifact(baseArtifactId) : undefined;
      activeArtifactId = baseArtifact?.id;
      activeGraphSnapshotId = baseVersion?.graphSnapshotId ?? null;
      phase = baseArtifact ? workflowAgentPhaseForArtifactStatus(baseArtifact.status) : "planned";
    }

    const now = new Date().toISOString();
    const nextActiveArtifactId = activeArtifactId === undefined ? thread.active_artifact_id : activeArtifactId;
    const nextActiveGraphSnapshotId = activeGraphSnapshotId === undefined ? thread.active_graph_snapshot_id : activeGraphSnapshotId;
    const db = this.requireDb();
    const transaction = db.transaction(() => {
      db.prepare("UPDATE workflow_revisions SET revision_status = ?, updated_at = ? WHERE id = ?").run(input.decision, now, current.id);
      db.prepare("UPDATE workflow_agent_threads SET active_artifact_id = ?, active_graph_snapshot_id = ?, phase = ?, updated_at = ? WHERE id = ?").run(
        nextActiveArtifactId,
        nextActiveGraphSnapshotId,
        phase,
        now,
        current.workflowThreadId,
      );
    });
    transaction();
    return this.getWorkflowRevision(current.id);
  }

  listWorkflowDiscoveryQuestions(workflowThreadId: string, options: { revisionId?: string } = {}): WorkflowDiscoveryQuestion[] {
    this.requireWorkflowAgentThread(workflowThreadId);
    const where = options.revisionId ? "workflow_thread_id = ? AND revision_id = ?" : "workflow_thread_id = ?";
    const params = options.revisionId ? [workflowThreadId, options.revisionId] : [workflowThreadId];
    const rows = this.requireDb()
      .prepare(`SELECT * FROM workflow_discovery_questions WHERE ${where} ORDER BY question_order ASC, created_at ASC`)
      .all(...params) as WorkflowDiscoveryQuestionRow[];
    return rows.map(this.mapWorkflowDiscoveryQuestion);
  }

  createWorkflowDiscoveryQuestion(input: {
    workflowThreadId: string;
    revisionId?: string;
    category: WorkflowDiscoveryQuestionCategory;
    context: string;
    question: string;
    choices: WorkflowDiscoveryQuestion["choices"];
    allowFreeform: boolean;
    graphImpact?: string;
    provider?: WorkflowDiscoveryQuestion["provider"];
    providerModel?: string;
    policyContextSummary?: string;
    capabilitySearch?: WorkflowDiscoveryQuestion["capabilitySearch"];
    capabilityDescriptions?: WorkflowDiscoveryQuestion["capabilityDescriptions"];
    blockedReasons?: string[];
    accessRequests?: WorkflowDiscoveryQuestion["accessRequests"];
    activityEvents?: WorkflowDiscoveryQuestion["activityEvents"];
    cacheCheckpoint?: WorkflowDiscoveryQuestion["cacheCheckpoint"];
    graphPatch?: WorkflowDiscoveryQuestion["graphPatch"];
  }): WorkflowDiscoveryQuestion {
    this.requireWorkflowAgentThread(input.workflowThreadId);
    if (input.revisionId) {
      const revision = this.getWorkflowRevision(input.revisionId);
      if (revision.workflowThreadId !== input.workflowThreadId) {
        throw new Error(`Workflow revision ${revision.id} does not belong to workflow thread ${input.workflowThreadId}.`);
      }
    }
    const row = this.requireDb()
      .prepare("SELECT COALESCE(MAX(question_order), 0) + 1 AS next_order FROM workflow_discovery_questions WHERE workflow_thread_id = ?")
      .get(input.workflowThreadId) as { next_order: number };
    const id = randomUUID();
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT INTO workflow_discovery_questions
          (id, workflow_thread_id, revision_id, question_order, category, context, question, choices_json, allow_freeform, answer_json, graph_impact, provider, provider_model, policy_context_summary, capability_search_json, capability_descriptions_json, blocked_reasons_json, access_requests_json, activity_events_json, cache_checkpoint_json, graph_patch_json, created_at, answered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.workflowThreadId,
        input.revisionId ?? null,
        row.next_order,
        input.category,
        input.context,
        input.question,
        JSON.stringify(input.choices),
        input.allowFreeform ? 1 : 0,
        null,
        input.graphImpact ?? null,
        input.provider ?? null,
        input.providerModel ?? null,
        input.policyContextSummary ?? null,
        input.capabilitySearch ? JSON.stringify(input.capabilitySearch) : null,
        input.capabilityDescriptions?.length ? JSON.stringify(input.capabilityDescriptions) : null,
        input.blockedReasons?.length ? JSON.stringify(input.blockedReasons) : null,
        input.accessRequests?.length ? JSON.stringify(input.accessRequests) : null,
        input.activityEvents?.length ? JSON.stringify(input.activityEvents) : null,
        input.cacheCheckpoint ? JSON.stringify(input.cacheCheckpoint) : null,
        input.graphPatch ? JSON.stringify(input.graphPatch) : null,
        now,
        null,
      );
    this.requireDb()
      .prepare("UPDATE workflow_agent_threads SET phase = ?, updated_at = ? WHERE id = ?")
      .run(input.revisionId ? "revision" : "discovery", now, input.workflowThreadId);
    return this.mapWorkflowDiscoveryQuestion(
      this.requireDb().prepare("SELECT * FROM workflow_discovery_questions WHERE id = ?").get(id) as WorkflowDiscoveryQuestionRow,
    );
  }

  answerWorkflowDiscoveryQuestion(input: AnswerWorkflowDiscoveryQuestionInput): WorkflowDiscoveryQuestion {
    const row = this.requireDb().prepare("SELECT * FROM workflow_discovery_questions WHERE id = ?").get(input.questionId) as
      | WorkflowDiscoveryQuestionRow
      | undefined;
    if (!row) throw new Error(`Workflow discovery question not found: ${input.questionId}`);
    const question = this.mapWorkflowDiscoveryQuestion(row);
    const choiceId = input.choiceId?.trim();
    const freeform = input.freeform?.trim();
    if (choiceId && !question.choices.some((choice) => choice.id === choiceId)) throw new Error(`Workflow discovery choice not found: ${choiceId}`);
    if (!choiceId && !freeform) throw new Error("Workflow discovery answer requires a choice or freeform text.");
    if (freeform && !question.allowFreeform) throw new Error("This workflow discovery question does not allow freeform answers.");
    const now = new Date().toISOString();
    this.requireDb()
      .prepare("UPDATE workflow_discovery_questions SET answer_json = ?, answered_at = ? WHERE id = ?")
      .run(JSON.stringify({ choiceId: choiceId || undefined, freeform: freeform || undefined, answeredAt: now }), now, question.id);
    this.requireDb().prepare("UPDATE workflow_agent_threads SET updated_at = ? WHERE id = ?").run(now, question.workflowThreadId);
    return this.mapWorkflowDiscoveryQuestion(
      this.requireDb().prepare("SELECT * FROM workflow_discovery_questions WHERE id = ?").get(question.id) as WorkflowDiscoveryQuestionRow,
    );
  }

  clearWorkflowDiscoveryQuestionAnswer(questionId: string): WorkflowDiscoveryQuestion {
    const question = this.getWorkflowDiscoveryQuestion(questionId);
    const now = new Date().toISOString();
    this.requireDb()
      .prepare("UPDATE workflow_discovery_questions SET answer_json = NULL, answered_at = NULL WHERE id = ?")
      .run(questionId);
    this.requireDb().prepare("UPDATE workflow_agent_threads SET updated_at = ? WHERE id = ?").run(now, question.workflowThreadId);
    return this.getWorkflowDiscoveryQuestion(questionId);
  }

  getWorkflowDiscoveryQuestion(questionId: string): WorkflowDiscoveryQuestion {
    const row = this.requireDb().prepare("SELECT * FROM workflow_discovery_questions WHERE id = ?").get(questionId) as
      | WorkflowDiscoveryQuestionRow
      | undefined;
    if (!row) throw new Error(`Workflow discovery question not found: ${questionId}`);
    return this.mapWorkflowDiscoveryQuestion(row);
  }

  updateWorkflowDiscoveryAccessRequests(input: {
    questionId: string;
    accessRequests?: WorkflowDiscoveryQuestion["accessRequests"];
  }): WorkflowDiscoveryQuestion {
    const question = this.getWorkflowDiscoveryQuestion(input.questionId);
    const now = new Date().toISOString();
    this.requireDb()
      .prepare("UPDATE workflow_discovery_questions SET access_requests_json = ? WHERE id = ?")
      .run(input.accessRequests?.length ? JSON.stringify(input.accessRequests) : null, input.questionId);
    this.requireDb().prepare("UPDATE workflow_agent_threads SET updated_at = ? WHERE id = ?").run(now, question.workflowThreadId);
    return this.getWorkflowDiscoveryQuestion(input.questionId);
  }

  updateWorkflowDiscoveryActivityEvents(input: {
    questionId: string;
    activityEvents?: WorkflowDiscoveryQuestion["activityEvents"];
  }): WorkflowDiscoveryQuestion {
    this.getWorkflowDiscoveryQuestion(input.questionId);
    this.requireDb()
      .prepare("UPDATE workflow_discovery_questions SET activity_events_json = ? WHERE id = ?")
      .run(input.activityEvents?.length ? JSON.stringify(input.activityEvents) : null, input.questionId);
    return this.getWorkflowDiscoveryQuestion(input.questionId);
  }

  updateWorkflowAgentThreadPhase(threadId: string, phase: WorkflowAgentThreadPhase): WorkflowAgentThreadSummary {
    this.requireWorkflowAgentThread(threadId);
    const now = new Date().toISOString();
    this.requireDb().prepare("UPDATE workflow_agent_threads SET phase = ?, updated_at = ? WHERE id = ?").run(phase, now, threadId);
    return this.getWorkflowAgentThreadSummary(threadId);
  }

  listAutomationFolders(): AutomationFolderSummary[] {
    this.ensureAutomationThreadLinks();
    const project = this.getWorkspace();
    const folders = this.listAutomationFolderRows();
    const folderSummaries = new Map<string, AutomationFolderSummary>();
    for (const folder of folders) {
      folderSummaries.set(folder.id, mapAutomationFolderRow(folder));
    }
    const home = folderSummaries.get(AUTOMATION_HOME_FOLDER_ID) ?? {
      id: AUTOMATION_HOME_FOLDER_ID,
      name: "Home",
      kind: "home" as const,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      threads: [],
    };
    folderSummaries.set(home.id, home);

    const folderForSource = new Map(
      this.requireDb()
        .prepare("SELECT * FROM automation_thread_folders")
        .all()
        .map((row) => {
          const item = row as AutomationThreadFolderRow;
          return [automationThreadId(item.source_kind, item.source_id), item.folder_id] as const;
        }),
    );
    const orchestrationRuns = this.listOrchestrationRuns(200);
    const workflowRuns = this.listWorkflowRuns(undefined, 200);

    for (const task of this.listOrchestrationTasks()) {
      const latestRun = latestOrchestrationRunForTask(orchestrationRuns, task.id);
      const thread = mapAutomationOrchestrationTaskThread(task, {
        folderId: AUTOMATION_HOME_FOLDER_ID,
        latestRun,
        projectName: project.name,
        projectPath: project.path,
      });
      const folder = folderSummaries.get(folderForSource.get(thread.id) ?? "") ?? home;
      folder.threads.push({ ...thread, folderId: folder.id });
    }
    for (const artifact of this.listWorkflowArtifacts()) {
      const latestRun = latestWorkflowRunForArtifact(workflowRuns, artifact.id);
      const latestRunEvents = latestRun ? this.listWorkflowRunEvents(latestRun.id) : [];
      const thread = mapAutomationWorkflowArtifactThread(artifact, {
        folderId: AUTOMATION_HOME_FOLDER_ID,
        latestRun,
        latestRunEvents,
        projectName: project.name,
        projectPath: project.path,
      });
      const folder = folderSummaries.get(folderForSource.get(thread.id) ?? "") ?? home;
      folder.threads.push({ ...thread, folderId: folder.id });
    }

    return [...folderSummaries.values()]
      .map((folder) => ({
        ...folder,
        threads: folder.threads.sort(compareAutomationThreads),
      }))
      .sort(compareAutomationFolders);
  }

  createAutomationFolder(input: CreateAutomationFolderInput): AutomationFolderSummary[] {
    const name = input.name.trim();
    if (!name) throw new Error("Automation folder name is required.");
    const now = new Date().toISOString();
    this.requireDb()
      .prepare("INSERT INTO automation_folders (id, name, folder_kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), name, "custom", now, now);
    return this.listAutomationFolders();
  }

  moveAutomationThread(input: MoveAutomationThreadInput): AutomationFolderSummary[] {
    const folder = this.requireAutomationFolder(input.folderId);
    const source = parseAutomationThreadId(input.threadId);
    this.requireAutomationSource(source.kind, source.id);
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT INTO automation_thread_folders (source_kind, source_id, folder_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(source_kind, source_id) DO UPDATE SET folder_id = excluded.folder_id, updated_at = excluded.updated_at`,
      )
      .run(source.kind, source.id, folder.id, now, now);
    this.requireDb().prepare("UPDATE automation_folders SET updated_at = ? WHERE id = ?").run(now, folder.id);
    return this.listAutomationFolders();
  }

  listAutomationSchedules(): AutomationScheduleSummary[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM automation_schedules ORDER BY updated_at DESC, created_at DESC, rowid DESC")
      .all() as AutomationScheduleRow[];
    return rows.map(this.mapAutomationSchedule);
  }

  listAutomationScheduleExceptions(input: { scheduleId?: string } = {}): AutomationScheduleExceptionSummary[] {
    const db = this.requireDb();
    const rows = input.scheduleId
      ? (db
          .prepare(
            `SELECT * FROM automation_schedule_exceptions
             WHERE schedule_id = ?
             ORDER BY occurrence_at DESC, created_at DESC, rowid DESC`,
          )
          .all(input.scheduleId) as AutomationScheduleExceptionRow[])
      : (db
          .prepare(
            `SELECT * FROM automation_schedule_exceptions
             ORDER BY updated_at DESC, occurrence_at DESC, rowid DESC`,
          )
          .all() as AutomationScheduleExceptionRow[]);
    return rows.map(this.mapAutomationScheduleException);
  }

  createAutomationSchedule(input: CreateAutomationScheduleInput, nowDate = new Date()): AutomationScheduleSummary[] {
    const targetVersion = this.automationScheduleTargetVersion(input.targetKind, input.targetId, input.targetVersion);
    this.requireAutomationScheduleTarget(input.targetKind, input.targetId, targetVersion ?? undefined);
    const blocker = this.automationScheduleCreationBlockReason(input.targetKind, input.targetId, targetVersion ?? undefined);
    if (blocker) throw new Error(blocker);
    const now = nowDate.toISOString();
    const preset = input.preset;
    const cronExpression = normalizeAutomationScheduleCronExpression(preset, input.cronExpression);
    const enabled = input.enabled ?? true;
    const nextRunAt = computeAutomationScheduleNextRunAt({ preset, cronExpression, enabled, now: nowDate });
    const createdTargetVersionId = this.automationScheduleCreatedTargetVersionId(input.targetKind, input.targetId, targetVersion ?? undefined);
    const dedicatedThreadId = this.automationScheduleDedicatedThreadId(input.targetKind, input.targetId, targetVersion ?? undefined);
    const runLimitsJson = stringifyWorkflowRunLimitOverrides(input.runLimits);
    this.requireDb()
      .prepare(
        `INSERT INTO automation_schedules
        (id, target_kind, target_id, target_version, created_target_version_id, dedicated_thread_id, preset, cron_expression, timezone, enabled, skip_if_active, concurrency_policy, next_run_at, last_run_at, run_limits_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.targetKind,
        input.targetId,
        targetVersion,
        createdTargetVersionId,
        dedicatedThreadId,
        preset,
        cronExpression ?? null,
        input.timezone?.trim() || "local",
        enabled ? 1 : 0,
        input.skipIfActive === false ? 0 : 1,
        "skip_if_active",
        nextRunAt ?? null,
        null,
        runLimitsJson,
        now,
        now,
      );
    return this.listAutomationSchedules();
  }

  updateAutomationSchedule(input: UpdateAutomationScheduleInput, nowDate = new Date()): AutomationScheduleSummary[] {
    const current = this.requireDb().prepare("SELECT * FROM automation_schedules WHERE id = ?").get(input.id) as
      | AutomationScheduleRow
      | undefined;
    if (!current) throw new Error(`Automation schedule not found: ${input.id}`);
    const editScope = input.editScope ?? "all_occurrences";
    if (editScope === "this_occurrence") {
      throw new Error("Use Skip next occurrence or Reschedule next occurrence for one-off schedule changes.");
    }
    const scopedOccurrenceAt =
      editScope === "this_and_following"
        ? this.normalizeAutomationScheduleOccurrenceAt(input.occurrenceAt ?? current.next_run_at ?? nowDate.toISOString(), "schedule occurrence")
        : undefined;
    const targetKind = input.targetKind ?? current.target_kind;
    const targetId = input.targetId ?? current.target_id;
    const requestedTargetVersion =
      input.targetVersion ?? (targetKind === current.target_kind && targetKind === "workflow_playbook" ? current.target_version ?? undefined : undefined);
    const targetVersion = this.automationScheduleTargetVersion(targetKind, targetId, requestedTargetVersion);
    this.requireAutomationScheduleTarget(targetKind, targetId, targetVersion ?? undefined);
    const blocker = this.automationScheduleCreationBlockReason(targetKind, targetId, targetVersion ?? undefined);
    if (blocker) throw new Error(blocker);
    const preset = input.preset ?? current.preset;
    const cronExpression = normalizeAutomationScheduleCronExpression(preset, input.cronExpression ?? current.cron_expression ?? undefined);
    const enabled = input.enabled ?? (current.enabled === 1);
    const nextRunAt = computeAutomationScheduleNextRunAt({ preset, cronExpression, enabled, now: nowDate });
    const createdTargetVersionId = this.automationScheduleCreatedTargetVersionId(targetKind, targetId, targetVersion ?? undefined);
    const dedicatedThreadId = this.automationScheduleDedicatedThreadId(targetKind, targetId, targetVersion ?? undefined, current.dedicated_thread_id ?? undefined);
    const runLimitsJson = input.runLimits === undefined ? current.run_limits_json : stringifyWorkflowRunLimitOverrides(input.runLimits);
    const now = nowDate.toISOString();
    this.requireDb()
      .prepare(
        `UPDATE automation_schedules
         SET target_kind = ?, target_id = ?, target_version = ?, created_target_version_id = ?, dedicated_thread_id = ?, preset = ?, cron_expression = ?, timezone = ?, enabled = ?,
             skip_if_active = ?, concurrency_policy = ?, next_run_at = ?, run_limits_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        targetKind,
        targetId,
        targetVersion,
        createdTargetVersionId,
        dedicatedThreadId,
        preset,
        cronExpression ?? null,
        input.timezone?.trim() || current.timezone || "local",
        enabled ? 1 : 0,
        input.skipIfActive === undefined ? current.skip_if_active : input.skipIfActive ? 1 : 0,
        "skip_if_active",
        nextRunAt ?? null,
        runLimitsJson,
        now,
        input.id,
      );
    if (scopedOccurrenceAt) {
      this.insertAutomationScheduleException({
        scheduleId: input.id,
        occurrenceAt: scopedOccurrenceAt,
        exceptionKind: "series_update",
        status: "consumed",
        replacementRunAt: nextRunAt ?? undefined,
        reason: "Schedule series updated from this occurrence forward.",
        consumedAt: now,
        now,
      });
    }
    return this.listAutomationSchedules();
  }

  skipAutomationScheduleOccurrence(
    input: AutomationScheduleOccurrenceActionInput,
    nowDate = new Date(),
  ): AutomationScheduleOccurrenceActionResult {
    const schedule = this.requireAutomationScheduleRow(input.scheduleId);
    const occurrenceAt = this.normalizeAutomationScheduleOccurrenceAt(input.occurrenceAt ?? schedule.next_run_at, "schedule occurrence");
    const now = nowDate.toISOString();
    const isCurrentNext = schedule.next_run_at === occurrenceAt;
    this.insertAutomationScheduleException({
      scheduleId: schedule.id,
      occurrenceAt,
      exceptionKind: "skip",
      status: isCurrentNext ? "consumed" : "pending",
      reason: input.reason,
      consumedAt: isCurrentNext ? now : undefined,
      now,
    });
    if (isCurrentNext) {
      this.advanceAutomationScheduleNextRun(schedule, new Date(occurrenceAt), now, { markLastRun: false });
    }
    return {
      schedules: this.listAutomationSchedules(),
      exceptions: this.listAutomationScheduleExceptions({ scheduleId: schedule.id }),
    };
  }

  rescheduleAutomationScheduleOccurrence(
    input: AutomationScheduleOccurrenceActionInput,
    nowDate = new Date(),
  ): AutomationScheduleOccurrenceActionResult {
    const schedule = this.requireAutomationScheduleRow(input.scheduleId);
    const occurrenceAt = this.normalizeAutomationScheduleOccurrenceAt(input.occurrenceAt ?? schedule.next_run_at, "schedule occurrence");
    const replacementRunAt = this.normalizeAutomationScheduleOccurrenceAt(input.replacementRunAt, "replacement occurrence");
    const replacementTime = new Date(replacementRunAt).getTime();
    if (Number.isFinite(replacementTime) && replacementTime <= nowDate.getTime()) {
      throw new Error("Replacement occurrence must be in the future.");
    }
    const now = nowDate.toISOString();
    const isCurrentNext = schedule.next_run_at === occurrenceAt;
    this.insertAutomationScheduleException({
      scheduleId: schedule.id,
      occurrenceAt,
      exceptionKind: "reschedule",
      status: isCurrentNext ? "consumed" : "pending",
      replacementRunAt,
      reason: input.reason,
      consumedAt: isCurrentNext ? now : undefined,
      now,
    });
    if (isCurrentNext) {
      this.requireDb()
        .prepare("UPDATE automation_schedules SET next_run_at = ?, updated_at = ? WHERE id = ?")
        .run(replacementRunAt, now, schedule.id);
    }
    return {
      schedules: this.listAutomationSchedules(),
      exceptions: this.listAutomationScheduleExceptions({ scheduleId: schedule.id }),
    };
  }

  updateAutomationScheduleOccurrenceRunLimits(
    input: AutomationScheduleOccurrenceActionInput,
    nowDate = new Date(),
  ): AutomationScheduleOccurrenceActionResult {
    if (!input.runLimits) throw new Error("Run limits are required for a schedule occurrence run-limit edit.");
    const schedule = this.requireAutomationScheduleRow(input.scheduleId);
    const occurrenceAt = this.normalizeAutomationScheduleOccurrenceAt(input.occurrenceAt ?? schedule.next_run_at, "schedule occurrence");
    const now = nowDate.toISOString();
    this.insertAutomationScheduleException({
      scheduleId: schedule.id,
      occurrenceAt,
      exceptionKind: "run_limits",
      status: "pending",
      runLimits: input.runLimits,
      reason: input.reason,
      now,
    });
    return {
      schedules: this.listAutomationSchedules(),
      exceptions: this.listAutomationScheduleExceptions({ scheduleId: schedule.id }),
    };
  }

  consumePendingAutomationScheduleOccurrenceException(
    scheduleId: string,
    occurrenceAt: string | undefined,
    nowDate = new Date(),
  ): AutomationScheduleExceptionSummary | undefined {
    if (!occurrenceAt) return undefined;
    const row = this.requireDb()
      .prepare(
        `SELECT * FROM automation_schedule_exceptions
         WHERE schedule_id = ? AND occurrence_at = ? AND status = 'pending' AND exception_kind IN ('skip', 'reschedule', 'run_limits')
         ORDER BY created_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(scheduleId, occurrenceAt) as AutomationScheduleExceptionRow | undefined;
    if (!row) return undefined;
    const now = nowDate.toISOString();
    this.requireDb()
      .prepare("UPDATE automation_schedule_exceptions SET status = 'consumed', consumed_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, row.id);
    if (row.exception_kind === "reschedule" && row.replacement_run_at) {
      this.requireDb()
        .prepare("UPDATE automation_schedules SET next_run_at = ?, updated_at = ? WHERE id = ?")
        .run(row.replacement_run_at, now, scheduleId);
    }
    return this.mapAutomationScheduleException({
      ...row,
      status: "consumed",
      consumed_at: now,
      updated_at: now,
    });
  }

  listDueAutomationSchedules(nowDate = new Date()): AutomationScheduleSummary[] {
    const rows = this.requireDb()
      .prepare(
        `SELECT * FROM automation_schedules
         WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
         ORDER BY next_run_at ASC, created_at ASC`,
      )
      .all(nowDate.toISOString()) as AutomationScheduleRow[];
    return rows.map(this.mapAutomationSchedule);
  }

  advanceAutomationSchedule(scheduleId: string, nowDate = new Date()): AutomationScheduleSummary {
    const now = nowDate.toISOString();
    const row = this.requireAutomationScheduleRow(scheduleId);
    this.advanceAutomationScheduleNextRun(row, nowDate, now, { markLastRun: true });
    return this.mapAutomationSchedule(this.requireDb().prepare("SELECT * FROM automation_schedules WHERE id = ?").get(scheduleId) as AutomationScheduleRow);
  }

  listAutomationThreadChatIds(): string[] {
    const rows = this.requireDb()
      .prepare("SELECT DISTINCT thread_id FROM orchestration_runs WHERE thread_id IS NOT NULL")
      .all() as Array<{ thread_id: string }>;
    return rows.map((row) => row.thread_id);
  }

  listWorkflowAgentThreadChatIds(): string[] {
    const rows = this.requireDb()
      .prepare("SELECT DISTINCT chat_thread_id FROM workflow_agent_threads WHERE chat_thread_id IS NOT NULL AND chat_thread_id != ''")
      .all() as Array<{ chat_thread_id: string }>;
    return rows.map((row) => row.chat_thread_id);
  }

  listOrchestrationBoard(): OrchestrationBoard {
    return {
      tasks: this.listOrchestrationTasks(),
      runs: this.listOrchestrationRuns(),
    };
  }

  listOrchestrationTasks(): OrchestrationTask[] {
    const rows = this.requireDb()
      .prepare(
        `SELECT * FROM orchestration_tasks
         ORDER BY priority IS NULL, priority ASC, created_at ASC, identifier ASC`,
      )
      .all() as OrchestrationTaskRow[];
    return rows.map(this.mapOrchestrationTask);
  }

  listOrchestrationRuns(limit = 50): OrchestrationRun[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM orchestration_runs ORDER BY started_at DESC LIMIT ?")
      .all(limit) as OrchestrationRunRow[];
    return rows.map(this.mapOrchestrationRun);
  }

  getOrchestrationRun(runId: string): OrchestrationRun {
    const row = this.requireDb().prepare("SELECT * FROM orchestration_runs WHERE id = ?").get(runId) as
      | OrchestrationRunRow
      | undefined;
    if (!row) throw new Error(`Orchestration run not found: ${runId}`);
    return this.mapOrchestrationRun(row);
  }

  getOrchestrationTask(taskId: string): OrchestrationTask {
    const row = this.requireDb().prepare("SELECT * FROM orchestration_tasks WHERE id = ?").get(taskId) as
      | OrchestrationTaskRow
      | undefined;
    if (!row) throw new Error(`Orchestration task not found: ${taskId}`);
    return this.mapOrchestrationTask(row);
  }

  createOrchestrationTask(input: CreateOrchestrationTaskInput): OrchestrationTask {
    const now = new Date().toISOString();
    const id = randomUUID();
    const identifier = this.nextLocalTaskIdentifier();
    this.requireDb()
      .prepare(
        `INSERT INTO orchestration_tasks
        (id, identifier, title, description, state, priority, labels_json, blocked_by_json, project_path, source_kind, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        identifier,
        input.title.trim(),
        emptyToNull(input.description),
        normalizeTaskState(input.state ?? "todo"),
        input.priority ?? null,
        JSON.stringify(normalizeTaskLabels(input.labels ?? [])),
        JSON.stringify(normalizeTaskReferences(input.blockedBy ?? [])),
        emptyToNull(input.projectPath) ?? defaultOrchestrationProjectPath(this.getWorkspace().path),
        "local",
        now,
        now,
      );
    return this.getOrchestrationTask(id);
  }

  updateOrchestrationTask(input: OrchestrationTaskUpdateInput): OrchestrationTask {
    const current = this.getOrchestrationTask(input.id);
    const requestedState = input.state ? normalizeTaskState(input.state) : current.state;
    const next = {
      title: input.title?.trim() || current.title,
      description: Object.hasOwn(input, "description") ? emptyToNull(input.description) : (current.description ?? null),
      state: requestedState !== "done" && this.projectBoardTaskHasClosedDoneCard(current.id) ? "done" : requestedState,
      priority: Object.hasOwn(input, "priority") ? (input.priority ?? null) : (current.priority ?? null),
      labels: input.labels ? normalizeTaskLabels(input.labels) : current.labels,
      blockedBy: Object.hasOwn(input, "blockedBy") ? normalizeTaskReferences(input.blockedBy ?? []) : current.blockedBy,
    };
    this.requireDb()
      .prepare(
        `UPDATE orchestration_tasks
         SET title = ?, description = ?, state = ?, priority = ?, labels_json = ?, blocked_by_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.title,
        next.description,
        next.state,
        next.priority,
        JSON.stringify(next.labels),
        JSON.stringify(next.blockedBy),
        new Date().toISOString(),
        input.id,
      );
    this.syncProjectBoardCardsForLinkedTasks();
    return this.getOrchestrationTask(input.id);
  }

  setOrchestrationTaskWorkspace(input: { id: string; workspacePath: string; branchName?: string }): OrchestrationTask {
    this.requireDb()
      .prepare("UPDATE orchestration_tasks SET workspace_path = ?, branch_name = ?, updated_at = ? WHERE id = ?")
      .run(input.workspacePath, input.branchName ?? null, new Date().toISOString(), input.id);
    return this.getOrchestrationTask(input.id);
  }

  recordPreparedOrchestrationRun(input: {
    taskId: string;
    workspacePath: string;
    proofOfWork?: Record<string, unknown>;
  }): OrchestrationRun {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT INTO orchestration_runs
        (id, task_id, attempt_number, status, workspace_path, started_at, last_event_at, proof_of_work_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.taskId,
        this.nextOrchestrationAttemptNumber(input.taskId),
        "prepared",
        input.workspacePath,
        now,
        now,
        input.proofOfWork ? JSON.stringify(input.proofOfWork) : null,
      );
    return this.getOrchestrationRun(id);
  }

  updateOrchestrationRun(input: {
    id: string;
    status: string;
    threadId?: string;
    piSessionFile?: string | null;
    error?: string | null;
    proofOfWork?: Record<string, unknown>;
    finish?: boolean;
    reviewProjectBoardProof?: boolean;
  }): OrchestrationRun {
    const current = this.getOrchestrationRun(input.id);
    if (this.projectBoardTaskHasClosedDoneCard(current.taskId)) {
      return current;
    }
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `UPDATE orchestration_runs
         SET status = ?, thread_id = ?, pi_session_file = ?, last_event_at = ?, finished_at = ?, error = ?, proof_of_work_json = ?
         WHERE id = ?`,
      )
      .run(
        input.status,
        input.threadId ?? current.threadId ?? null,
        Object.hasOwn(input, "piSessionFile") ? (input.piSessionFile ?? null) : (current.piSessionFile ?? null),
        now,
        input.finish ? now : ["claimed", "prepared", "preparing", "running"].includes(input.status) ? null : (current.finishedAt ?? null),
        Object.hasOwn(input, "error") ? (input.error ?? null) : (current.error ?? null),
        input.proofOfWork ? JSON.stringify(input.proofOfWork) : current.proofOfWork ? JSON.stringify(current.proofOfWork) : null,
        input.id,
      );
    const updated = this.getOrchestrationRun(input.id);
    if (input.finish && input.reviewProjectBoardProof !== false) this.reviewProjectBoardCardProofForRun(updated);
    return updated;
  }

  recordRestartInterruptedAutoContinueAttempt(runId: string, now = new Date()): OrchestrationRun {
    const run = this.getOrchestrationRun(runId);
    if (!isRestartInterruptedOrchestrationRun(run)) {
      throw new Error(`Orchestration run is not restart-interrupted: ${runId}`);
    }
    return this.updateOrchestrationRun({
      id: run.id,
      status: run.status,
      proofOfWork: restartInterruptedAutoContinueProofOfWork(run.proofOfWork, now.toISOString()),
      reviewProjectBoardProof: false,
    });
  }

  getOrchestrationSchedulerRuntimeState(): SchedulerRuntimeState {
    const rows = this.requireDb()
      .prepare("SELECT task_id, status FROM orchestration_runs WHERE status IN ('claimed', 'prepared', 'preparing', 'running', 'retry_queued')")
      .all() as Array<{ task_id: string; status: string }>;
    const claimBlockedTaskIds = this.projectBoardClaimBlockedTaskIds();
    return {
      claimedTaskIds: [
        ...new Set([
          ...rows
            .filter((row) => row.status === "claimed" || row.status === "prepared" || row.status === "preparing")
            .map((row) => row.task_id),
          ...claimBlockedTaskIds,
        ]),
      ],
      runningTaskIds: rows.filter((row) => row.status === "running").map((row) => row.task_id),
      retryQueuedTaskIds: rows.filter((row) => row.status === "retry_queued").map((row) => row.task_id),
    };
  }

  private projectBoardClaimBlockedTaskIds(): string[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id IS NOT NULL AND status != 'archived'")
      .all() as ProjectBoardCardRow[];
    const rowsByBoard = new Map<string, ProjectBoardCardRow[]>();
    for (const row of rows) rowsByBoard.set(row.board_id, [...(rowsByBoard.get(row.board_id) ?? []), row]);
    const result: string[] = [];
    for (const [boardId, boardCards] of rowsByBoard) {
      const claims = projectBoardClaimSummaryFromEvents(this.listProjectBoardEvents(boardId));
      result.push(...projectBoardClaimBlockedTaskIdsForRows(boardCards, claims));
    }
    return result;
  }

  createWorkflowArtifact(input: CreateWorkflowArtifactInput): WorkflowArtifactSummary {
    const now = new Date().toISOString();
    const id = input.id ?? randomUUID();
    const workflowThreadId = input.workflowThreadId ?? this.createWorkflowAgentThreadRecord({
      title: input.title,
      initialRequest: input.spec.goal,
      phase: workflowAgentPhaseForArtifactStatus(input.status ?? "draft"),
    }).id;
    this.requireDb()
      .prepare(
        `INSERT INTO workflow_artifacts
        (id, workflow_thread_id, title, status, manifest_json, spec_json, source_path, state_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        workflowThreadId,
        input.title.trim(),
        input.status ?? "draft",
        JSON.stringify(input.manifest),
        JSON.stringify(input.spec),
        input.sourcePath,
        input.statePath,
        now,
        now,
      );
    if (input.activate !== false) {
      this.requireDb()
        .prepare("UPDATE workflow_agent_threads SET active_artifact_id = ?, phase = ?, updated_at = ? WHERE id = ?")
        .run(id, workflowAgentPhaseForArtifactStatus(input.status ?? "draft"), now, workflowThreadId);
    } else {
      this.requireDb().prepare("UPDATE workflow_agent_threads SET updated_at = ? WHERE id = ?").run(now, workflowThreadId);
    }
    return this.getWorkflowArtifact(id);
  }

  listWorkflowArtifacts(): WorkflowArtifactSummary[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM workflow_artifacts ORDER BY updated_at DESC, created_at DESC")
      .all() as WorkflowArtifactRow[];
    return rows.map(this.mapWorkflowArtifact);
  }

  getWorkflowArtifact(artifactId: string): WorkflowArtifactSummary {
    const row = this.requireDb().prepare("SELECT * FROM workflow_artifacts WHERE id = ?").get(artifactId) as
      | WorkflowArtifactRow
      | undefined;
    if (!row) throw new Error(`Workflow artifact not found: ${artifactId}`);
    return this.mapWorkflowArtifact(row);
  }

  updateWorkflowArtifact(input: UpdateWorkflowArtifactInput): WorkflowArtifactSummary {
    const current = this.getWorkflowArtifact(input.id);
    this.requireDb()
      .prepare(
        `UPDATE workflow_artifacts
         SET workflow_thread_id = ?, title = ?, status = ?, manifest_json = ?, spec_json = ?, source_path = ?, state_path = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.workflowThreadId ?? current.workflowThreadId ?? null,
        input.title?.trim() || current.title,
        input.status ?? current.status,
        JSON.stringify(input.manifest ?? current.manifest),
        JSON.stringify(input.spec ?? current.spec),
        input.sourcePath ?? current.sourcePath,
        input.statePath ?? current.statePath,
        new Date().toISOString(),
        input.id,
      );
    const threadId = input.workflowThreadId ?? current.workflowThreadId;
    if (threadId) {
      this.requireDb()
        .prepare("UPDATE workflow_agent_threads SET active_artifact_id = ?, phase = ?, updated_at = ? WHERE id = ?")
        .run(input.id, workflowAgentPhaseForArtifactStatus(input.status ?? current.status), new Date().toISOString(), threadId);
    }
    return this.getWorkflowArtifact(input.id);
  }

  startWorkflowRun(input: {
    artifactId: string;
    status?: WorkflowRunStatus;
    graphSnapshotId?: string;
    recoveryContext?: WorkflowRecoveryContext;
    providerHealth?: WorkflowRunProviderHealth;
    retryMetadata?: WorkflowRunRetryMetadata;
  }): WorkflowRunSummary {
    this.getWorkflowArtifact(input.artifactId);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT INTO workflow_runs
        (id, artifact_id, status, started_at, updated_at, graph_snapshot_id, provider_health_json, retry_metadata_json, recovery_context_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.artifactId,
        input.status ?? "created",
        now,
        now,
        input.graphSnapshotId ?? null,
        input.providerHealth ? JSON.stringify(input.providerHealth) : null,
        input.retryMetadata ? JSON.stringify(input.retryMetadata) : null,
        input.recoveryContext ? JSON.stringify(input.recoveryContext) : null,
      );
    return this.getWorkflowRun(id);
  }

  updateWorkflowRun(input: {
    id: string;
    status: WorkflowRunStatus;
    error?: string | null;
    reportPath?: string | null;
    finish?: boolean;
    graphSnapshotId?: string | null;
    providerHealth?: WorkflowRunProviderHealth;
    retryMetadata?: WorkflowRunRetryMetadata;
    recoveryContext?: WorkflowRecoveryContext | null;
  }): WorkflowRunSummary {
    const current = this.getWorkflowRun(input.id);
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `UPDATE workflow_runs
         SET status = ?, updated_at = ?, completed_at = ?, error = ?, report_path = ?,
             graph_snapshot_id = CASE WHEN ? THEN ? ELSE graph_snapshot_id END,
             provider_health_json = COALESCE(?, provider_health_json),
             retry_metadata_json = COALESCE(?, retry_metadata_json),
             recovery_context_json = CASE WHEN ? THEN ? ELSE recovery_context_json END
         WHERE id = ?`,
      )
      .run(
        input.status,
        now,
        input.finish || ["succeeded", "failed", "canceled"].includes(input.status) ? now : (current.completedAt ?? null),
        Object.hasOwn(input, "error") ? (input.error ?? null) : (current.error ?? null),
        Object.hasOwn(input, "reportPath") ? (input.reportPath ?? null) : (current.reportPath ?? null),
        Object.hasOwn(input, "graphSnapshotId") ? 1 : 0,
        input.graphSnapshotId ?? null,
        input.providerHealth ? JSON.stringify(input.providerHealth) : null,
        input.retryMetadata ? JSON.stringify(input.retryMetadata) : null,
        Object.hasOwn(input, "recoveryContext") ? 1 : 0,
        input.recoveryContext ? JSON.stringify(input.recoveryContext) : null,
        input.id,
      );
    return this.getWorkflowRun(input.id);
  }

  updateWorkflowRunDurability(input: {
    id: string;
    graphSnapshotId?: string | null;
    providerHealth?: WorkflowRunProviderHealth;
    retryMetadata?: WorkflowRunRetryMetadata;
    recoveryContext?: WorkflowRecoveryContext | null;
  }): WorkflowRunSummary {
    this.getWorkflowRun(input.id);
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `UPDATE workflow_runs
         SET updated_at = ?,
             graph_snapshot_id = CASE WHEN ? THEN ? ELSE graph_snapshot_id END,
             provider_health_json = COALESCE(?, provider_health_json),
             retry_metadata_json = COALESCE(?, retry_metadata_json),
             recovery_context_json = CASE WHEN ? THEN ? ELSE recovery_context_json END
         WHERE id = ?`,
      )
      .run(
        now,
        Object.hasOwn(input, "graphSnapshotId") ? 1 : 0,
        input.graphSnapshotId ?? null,
        input.providerHealth ? JSON.stringify(input.providerHealth) : null,
        input.retryMetadata ? JSON.stringify(input.retryMetadata) : null,
        Object.hasOwn(input, "recoveryContext") ? 1 : 0,
        input.recoveryContext ? JSON.stringify(input.recoveryContext) : null,
        input.id,
      );
    return this.getWorkflowRun(input.id);
  }

  getWorkflowRun(runId: string): WorkflowRunSummary {
    const row = this.requireDb().prepare("SELECT * FROM workflow_runs WHERE id = ?").get(runId) as WorkflowRunRow | undefined;
    if (!row) throw new Error(`Workflow run not found: ${runId}`);
    return this.mapWorkflowRun(row);
  }

  private tryGetWorkflowRun(runId: string): WorkflowRunSummary | undefined {
    const row = this.requireDb().prepare("SELECT * FROM workflow_runs WHERE id = ?").get(runId) as WorkflowRunRow | undefined;
    return row ? this.mapWorkflowRun(row) : undefined;
  }

  listWorkflowRuns(artifactId?: string, limit = 50): WorkflowRunSummary[] {
    const boundedLimit = Math.max(1, Math.min(limit, 200));
    const rows = artifactId
      ? (this.requireDb()
          .prepare("SELECT * FROM workflow_runs WHERE artifact_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?")
          .all(artifactId, boundedLimit) as WorkflowRunRow[])
      : (this.requireDb()
          .prepare("SELECT * FROM workflow_runs ORDER BY started_at DESC, rowid DESC LIMIT ?")
          .all(boundedLimit) as WorkflowRunRow[]);
    return rows.map(this.mapWorkflowRun);
  }

  appendWorkflowRunEvent(input: {
    runId: string;
    type: string;
    message?: string;
    graphNodeId?: string;
    graphEdgeId?: string;
    itemKey?: string;
    createdAt?: string;
    data?: Record<string, unknown>;
  }): WorkflowRunEvent {
    const run = this.getWorkflowRun(input.runId);
    const id = randomUUID();
    const now = input.createdAt ?? new Date().toISOString();
    const seqRow = this.requireDb()
      .prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM workflow_run_events WHERE run_id = ?")
      .get(input.runId) as { next_seq: number };
    this.requireDb()
      .prepare(
        `INSERT INTO workflow_run_events
        (id, run_id, artifact_id, seq, event_type, created_at, message, graph_node_id, graph_edge_id, item_key, data_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.runId,
        run.artifactId,
        seqRow.next_seq,
        input.type,
        now,
        input.message ?? null,
        input.graphNodeId ?? stringFromRecord(input.data, "graphNodeId") ?? null,
        input.graphEdgeId ?? stringFromRecord(input.data, "graphEdgeId") ?? null,
        input.itemKey ?? stringFromRecord(input.data, "itemKey") ?? null,
        input.data ? JSON.stringify(input.data) : null,
      );
    this.requireDb().prepare("UPDATE workflow_runs SET updated_at = ? WHERE id = ?").run(now, input.runId);
    return this.mapWorkflowRunEvent(
      this.requireDb().prepare("SELECT * FROM workflow_run_events WHERE id = ?").get(id) as WorkflowRunEventRow,
    );
  }

  listWorkflowRunEvents(runId: string): WorkflowRunEvent[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM workflow_run_events WHERE run_id = ? ORDER BY seq ASC")
      .all(runId) as WorkflowRunEventRow[];
    return rows.map(this.mapWorkflowRunEvent);
  }

  enqueueCallableWorkflowTask(input: {
    executionPlan: CallableWorkflowExecutionPlan;
    featureFlagSnapshot: AmbientFeatureFlagSnapshot;
    patternGraphSnapshot?: SubagentPatternGraphSnapshot;
    createdAt?: string;
  }): CallableWorkflowTaskSummary {
    if (!isAmbientSubagentsEnabled(input.featureFlagSnapshot)) {
      throw new Error("Callable workflow task queueing is disabled while ambient.subagents is off.");
    }
    const draft = callableWorkflowQueuedTaskDraftFromExecutionPlan(input.executionPlan);
    this.getThread(draft.parentThreadId);
    const parentRun = this.getRunRecord(draft.parentRunId);
    if (parentRun.threadId !== draft.parentThreadId) {
      throw new Error("Cannot queue callable workflow task for a parent run on a different thread.");
    }
    if (draft.parentMessageId && parentRun.assistantMessageId !== draft.parentMessageId) {
      throw new Error("Cannot queue callable workflow task for a mismatched parent assistant message.");
    }
    const existing = this.findCallableWorkflowTaskByLaunchId(draft.launchId);
    if (existing) return existing;

    const now = input.createdAt ?? input.executionPlan.createdAt ?? new Date().toISOString();
    const parentMessageId = draft.parentMessageId ?? parentRun.assistantMessageId;
    const patternGraphSnapshot = input.patternGraphSnapshot ?? draft.patternGraphSnapshot;
    this.requireDb()
      .prepare(
        `INSERT INTO callable_workflow_tasks
         (id, launch_id, parent_thread_id, parent_run_id, parent_message_id, tool_call_id, tool_id, tool_name, source_kind,
          title, status, status_label, blocking, default_collapsed, progress_visible, token_cost_tracking, pause_resume_cancel,
          cancel_handle, runner_target, runner_deferred_reason, workflow_artifact_id, workflow_run_id, error_message,
          pattern_graph_snapshot_json, execution_plan_json, created_at, updated_at, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        draft.id,
        draft.launchId,
        draft.parentThreadId,
        draft.parentRunId,
        parentMessageId,
        draft.toolCallId,
        draft.toolId,
        draft.toolName,
        draft.sourceKind,
        draft.title,
        draft.status,
        draft.statusLabel,
        draft.blocking ? 1 : 0,
        draft.defaultCollapsed ? 1 : 0,
        draft.progressVisible ? 1 : 0,
        draft.tokenCostTracking ? 1 : 0,
        draft.pauseResumeCancel ? 1 : 0,
        draft.cancelHandle,
        draft.runnerTarget,
        draft.runnerDeferredReason,
        null,
        null,
        null,
        patternGraphSnapshot ? JSON.stringify(patternGraphSnapshot) : null,
        JSON.stringify(draft.executionPlan),
        now,
        now,
        null,
        null,
      );
    return this.getCallableWorkflowTask(draft.id);
  }

  getCallableWorkflowTask(id: string): CallableWorkflowTaskSummary {
    const row = this.requireDb().prepare("SELECT * FROM callable_workflow_tasks WHERE id = ?").get(id) as CallableWorkflowTaskRow | undefined;
    if (!row) throw new Error(`Callable workflow task not found: ${id}`);
    return this.mapCallableWorkflowTask(row);
  }

  listCallableWorkflowTasksForParentRun(parentRunId: string): CallableWorkflowTaskSummary[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM callable_workflow_tasks WHERE parent_run_id = ? ORDER BY created_at ASC, id ASC")
      .all(parentRunId) as CallableWorkflowTaskRow[];
    return rows.map(this.mapCallableWorkflowTask);
  }

  listCallableWorkflowTasksForParentThread(parentThreadId: string): CallableWorkflowTaskSummary[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM callable_workflow_tasks WHERE parent_thread_id = ? ORDER BY created_at ASC, id ASC")
      .all(parentThreadId) as CallableWorkflowTaskRow[];
    return rows.map(this.mapCallableWorkflowTask);
  }

  listCallableWorkflowTasks(): CallableWorkflowTaskSummary[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM callable_workflow_tasks ORDER BY created_at ASC, id ASC")
      .all() as CallableWorkflowTaskRow[];
    return rows.map(this.mapCallableWorkflowTask);
  }

  bindCallableWorkflowTaskPatternGraphChild(input: CallableWorkflowPatternGraphChildBindingRequest): CallableWorkflowTaskSummary {
    const task = this.getCallableWorkflowTask(input.workflowTaskId);
    const run = this.getSubagentRun(input.childRunId);
    const childThread = this.getThread(run.childThreadId);
    const now = input.updatedAt ?? new Date().toISOString();
    const patternGraphSnapshot = callableWorkflowPatternGraphSnapshotWithChildBinding({
      task,
      run,
      childThread,
      roleNodeId: input.roleNodeId,
      ...(input.label ? { label: input.label } : {}),
      ...(input.approvalState ? { approvalState: input.approvalState } : {}),
      ...(input.blockingParent !== undefined ? { blockingParent: input.blockingParent } : {}),
      updatedAt: now,
    });
    this.requireDb()
      .prepare(
        `UPDATE callable_workflow_tasks
         SET pattern_graph_snapshot_json = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify(patternGraphSnapshot), now, task.id);
    return this.getCallableWorkflowTask(task.id);
  }

  reconcileCallableWorkflowTaskRestartState(options: { now?: string } = {}): CallableWorkflowTaskRestartReconciliationSummary {
    const now = options.now ?? new Date().toISOString();
    const workflowRunRows = this.requireDb()
      .prepare("SELECT * FROM workflow_runs ORDER BY started_at ASC, id ASC")
      .all() as WorkflowRunRow[];
    const parentRunRows = this.requireDb()
      .prepare("SELECT id, thread_id AS threadId FROM runs ORDER BY started_at ASC, id ASC")
      .all() as Array<{ id: string; threadId: string }>;
    const summary = analyzeCallableWorkflowTaskRestartState({
      tasks: this.listCallableWorkflowTasks(),
      threads: this.listThreads(),
      parentRuns: parentRunRows,
      workflowArtifacts: this.listWorkflowArtifacts(),
      workflowRuns: workflowRunRows.map(this.mapWorkflowRun),
      createdAt: now,
    });

    for (const taskId of summary.repairedTaskIds) {
      const task = this.getCallableWorkflowTask(taskId);
      if (!task.workflowRunId) continue;
      const run = this.tryGetWorkflowRun(task.workflowRunId);
      if (!run) continue;
      if (task.workflowArtifactId && run.artifactId !== task.workflowArtifactId) continue;
      this.markCallableWorkflowTaskRunFinished({
        id: task.id,
        workflowRunId: run.id,
        runStatus: run.status,
        errorMessage: run.error,
        createdAt: now,
      });
    }

    return summary;
  }

  beginCallableWorkflowTaskCompilerHandoff(
    id: string,
    options: { createdAt?: string } = {},
  ): { task: CallableWorkflowTaskSummary; handoffPlan: CallableWorkflowCompilerHandoffPlan } {
    const current = this.getCallableWorkflowTask(id);
    if (!["queued", "compiling"].includes(current.status)) {
      throw new Error(`Cannot begin compiler handoff for callable workflow task ${id} while status is ${current.status}.`);
    }
    const now = options.createdAt ?? new Date().toISOString();
    const shouldUpdate = current.status !== "compiling" || !current.startedAt || current.runnerDeferredReason !== "workflow_artifact_not_compiled";
    const task = shouldUpdate
      ? this.updateCallableWorkflowTaskRow({
          id,
          status: "compiling",
          statusLabel: "Compiling",
          runnerDeferredReason: "workflow_artifact_not_compiled",
          updatedAt: now,
          startedAt: current.startedAt ?? now,
        })
      : current;
    return {
      task,
      handoffPlan: buildCallableWorkflowCompilerHandoffPlan({ task, createdAt: now }),
    };
  }

  linkCallableWorkflowTaskArtifact(input: {
    id: string;
    workflowArtifactId: string;
    createdAt?: string;
  }): CallableWorkflowTaskSummary {
    const current = this.getCallableWorkflowTask(input.id);
    if (current.status !== "compiling") {
      throw new Error(`Cannot link a workflow artifact for callable workflow task ${input.id} while status is ${current.status}.`);
    }
    if (current.workflowArtifactId && current.workflowArtifactId !== input.workflowArtifactId) {
      throw new Error(`Callable workflow task ${input.id} is already linked to a different workflow artifact.`);
    }
    this.getWorkflowArtifact(input.workflowArtifactId);
    if (current.workflowArtifactId === input.workflowArtifactId && current.runnerDeferredReason === "workflow_run_not_started") {
      return current;
    }
    return this.updateCallableWorkflowTaskRow({
      id: input.id,
      status: "compiling",
      statusLabel: "Artifact ready",
      runnerDeferredReason: "workflow_run_not_started",
      workflowArtifactId: input.workflowArtifactId,
      updatedAt: input.createdAt ?? new Date().toISOString(),
    });
  }

  markCallableWorkflowTaskRunStarted(input: {
    id: string;
    workflowRunId: string;
    createdAt?: string;
  }): CallableWorkflowTaskSummary {
    const current = this.getCallableWorkflowTask(input.id);
    if (!["compiling", "running", "paused"].includes(current.status)) {
      throw new Error(`Cannot start workflow run for callable workflow task ${input.id} while status is ${current.status}.`);
    }
    const run = this.getWorkflowRun(input.workflowRunId);
    if (!current.workflowArtifactId) {
      throw new Error(`Cannot start workflow run for callable workflow task ${input.id} before a workflow artifact is linked.`);
    }
    if (run.artifactId !== current.workflowArtifactId) {
      throw new Error(`Callable workflow task ${input.id} cannot link a run from a different workflow artifact.`);
    }
    const resumedFromPausedRun = current.status === "paused" && current.workflowRunId && current.workflowRunId !== input.workflowRunId;
    if (current.workflowRunId && current.workflowRunId !== input.workflowRunId && !resumedFromPausedRun) {
      throw new Error(`Callable workflow task ${input.id} is already linked to a different workflow run.`);
    }
    const now = input.createdAt ?? new Date().toISOString();
    const task = current.status === "running" && current.workflowRunId === input.workflowRunId
      ? current
      : this.updateCallableWorkflowTaskRow({
          id: input.id,
          status: "running",
          statusLabel: "Running",
          runnerDeferredReason: "workflow_run_started",
          workflowRunId: input.workflowRunId,
          updatedAt: now,
          startedAt: current.startedAt ?? now,
        });
    this.appendCallableWorkflowTaskStartedEventIfNeeded(task, run.id, now);
    return this.getCallableWorkflowTask(input.id);
  }

  markCallableWorkflowTaskRunFinished(input: {
    id: string;
    workflowRunId: string;
    runStatus: WorkflowRunStatus;
    errorMessage?: string;
    createdAt?: string;
  }): CallableWorkflowTaskSummary {
    const current = this.getCallableWorkflowTask(input.id);
    const run = this.getWorkflowRun(input.workflowRunId);
    if (current.workflowRunId && current.workflowRunId !== input.workflowRunId) {
      throw new Error(`Callable workflow task ${input.id} is already linked to a different workflow run.`);
    }
    if (current.workflowArtifactId && run.artifactId !== current.workflowArtifactId) {
      throw new Error(`Callable workflow task ${input.id} cannot finish with a run from a different workflow artifact.`);
    }
    if (["succeeded", "failed", "canceled"].includes(current.status)) {
      return current;
    }
    const finish = callableWorkflowTaskFinishState(input.runStatus);
    const now = input.createdAt ?? new Date().toISOString();
    const task = this.updateCallableWorkflowTaskRow({
      id: input.id,
      status: finish.status,
      statusLabel: finish.statusLabel,
      runnerDeferredReason: finish.runnerDeferredReason,
      workflowArtifactId: current.workflowArtifactId ?? run.artifactId,
      workflowRunId: input.workflowRunId,
      errorMessage: input.errorMessage,
      updatedAt: now,
      startedAt: current.startedAt ?? now,
      completedAt: finish.completed ? now : current.completedAt,
    });
    this.appendCallableWorkflowTaskFinishedEventIfNeeded(task, run.id, input.runStatus, now);
    return this.getCallableWorkflowTask(input.id);
  }

  recordCallableWorkflowTaskControl(input: {
    id: string;
    action: CallableWorkflowTaskControlAction;
    reason?: string;
    workflowRunId?: string;
    createdAt?: string;
  }): void {
    const task = this.getCallableWorkflowTask(input.id);
    const workflowRunId = input.workflowRunId ?? task.workflowRunId;
    if (!workflowRunId) return;
    this.getWorkflowRun(workflowRunId);
    this.appendCallableWorkflowTaskControlEventIfNeeded(
      task,
      workflowRunId,
      input.action,
      input.reason,
      input.createdAt ?? new Date().toISOString(),
    );
  }

  failCallableWorkflowTask(input: {
    id: string;
    errorMessage: string;
    createdAt?: string;
  }): CallableWorkflowTaskSummary {
    const current = this.getCallableWorkflowTask(input.id);
    if (["succeeded", "canceled"].includes(current.status)) {
      throw new Error(`Cannot fail callable workflow task ${input.id} after terminal status ${current.status}.`);
    }
    const now = input.createdAt ?? new Date().toISOString();
    return this.updateCallableWorkflowTaskRow({
      id: input.id,
      status: "failed",
      statusLabel: "Failed",
      runnerDeferredReason: "failed",
      errorMessage: input.errorMessage,
      updatedAt: now,
      completedAt: now,
    });
  }

  cancelCallableWorkflowTask(input: {
    id: string;
    reason?: string;
    createdAt?: string;
  }): CallableWorkflowTaskSummary {
    const current = this.getCallableWorkflowTask(input.id);
    if (["succeeded", "failed", "canceled"].includes(current.status)) {
      return current;
    }
    const now = input.createdAt ?? new Date().toISOString();
    const reason = input.reason?.trim() || "Canceled by user.";
    const task = this.updateCallableWorkflowTaskRow({
      id: input.id,
      status: "canceled",
      statusLabel: "Canceled",
      runnerDeferredReason: "callable_workflow_task_canceled",
      errorMessage: reason,
      updatedAt: now,
      startedAt: current.startedAt ?? now,
      completedAt: now,
    });
    if (task.workflowRunId) {
      const run = this.getWorkflowRun(task.workflowRunId);
      this.appendCallableWorkflowTaskControlEventIfNeeded(task, run.id, "cancel_requested", reason, now);
      if (!["succeeded", "failed", "canceled", "skipped"].includes(run.status)) {
        this.updateWorkflowRun({
          id: run.id,
          status: "canceled",
          error: reason,
          finish: true,
        });
      }
      this.appendCallableWorkflowTaskFinishedEventIfNeeded(task, run.id, "canceled", now);
    }
    return this.getCallableWorkflowTask(input.id);
  }

  recordWorkflowModelCall(input: RecordWorkflowModelCallInput): WorkflowModelCallRecord {
    const run = input.runId ? this.getWorkflowRun(input.runId) : undefined;
    const artifactId = input.artifactId ?? run?.artifactId;
    if (artifactId) this.getWorkflowArtifact(artifactId);
    const id = randomUUID();
    const startedAt = input.startedAt ?? new Date().toISOString();
    const completedAt = input.completedAt ?? new Date().toISOString();
    const latencyMs = input.latencyMs ?? Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
    this.requireDb()
      .prepare(
        `INSERT INTO workflow_model_calls
        (id, run_id, artifact_id, task, status, input_json, output_json, cache_key, cache_checkpoint_json, model, graph_node_id, graph_edge_id, item_key, validation_error, started_at, completed_at, latency_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.runId ?? null,
        artifactId ?? null,
        input.task,
        input.status,
        JSON.stringify(input.input),
        input.output === undefined ? null : JSON.stringify(input.output),
        input.cacheKey ?? null,
        input.cacheCheckpoint ? JSON.stringify(input.cacheCheckpoint) : null,
        input.model ?? null,
        input.graphNodeId ?? null,
        input.graphEdgeId ?? null,
        input.itemKey ?? null,
        input.validationError ?? null,
        startedAt,
        completedAt,
        latencyMs,
      );
    return {
      id,
      runId: input.runId,
      artifactId,
      task: input.task,
      status: input.status,
      input: input.input,
      output: input.output,
      cacheKey: input.cacheKey,
      cacheCheckpoint: input.cacheCheckpoint,
      model: input.model,
      graphNodeId: input.graphNodeId,
      graphEdgeId: input.graphEdgeId,
      itemKey: input.itemKey,
      validationError: input.validationError,
      startedAt,
      completedAt,
      latencyMs,
    };
  }

  getWorkflowModelCall(callId: string): WorkflowModelCallRecord {
    const row = this.requireDb().prepare("SELECT * FROM workflow_model_calls WHERE id = ?").get(callId) as
      | WorkflowModelCallRow
      | undefined;
    if (!row) throw new Error(`Workflow model call not found: ${callId}`);
    return this.mapWorkflowModelCall(row);
  }

  listWorkflowModelCalls(input: { runId?: string; artifactId?: string } = {}): WorkflowModelCallRecord[] {
    const rows = input.runId
      ? (this.requireDb()
          .prepare("SELECT * FROM workflow_model_calls WHERE run_id = ? ORDER BY started_at ASC")
          .all(input.runId) as WorkflowModelCallRow[])
      : input.artifactId
        ? (this.requireDb()
            .prepare("SELECT * FROM workflow_model_calls WHERE artifact_id = ? ORDER BY started_at ASC")
            .all(input.artifactId) as WorkflowModelCallRow[])
        : (this.requireDb()
            .prepare("SELECT * FROM workflow_model_calls ORDER BY started_at ASC")
            .all() as WorkflowModelCallRow[]);
    return rows.map(this.mapWorkflowModelCall);
  }

  compactExpiredWorkflowTraceData(input: {
    now?: string;
    debugRetentionDays?: number;
  } = {}): { cutoff: string; eventsCompacted: number; modelCallsCompacted: number } {
    const now = input.now ?? new Date().toISOString();
    const retentionDays = Math.max(1, Math.floor(input.debugRetentionDays ?? WORKFLOW_DEBUG_TRACE_RETENTION_DAYS));
    const cutoffDate = new Date(Date.parse(now) - retentionDays * 24 * 60 * 60 * 1000);
    const cutoff = Number.isFinite(cutoffDate.getTime()) ? cutoffDate.toISOString() : new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const marker = JSON.stringify({
      retention: "compacted",
      compactedAt: now,
      reason: "workflow_trace_retention_expired",
    });

    const eventResult = this.requireDb()
      .prepare(
        `UPDATE workflow_run_events
         SET data_json = ?
         WHERE data_json IS NOT NULL
           AND created_at < ?
           AND id IN (
             SELECT event.id
             FROM workflow_run_events event
             JOIN workflow_runs run ON run.id = event.run_id
             JOIN workflow_artifacts artifact ON artifact.id = run.artifact_id
             LEFT JOIN workflow_agent_threads thread ON thread.id = artifact.workflow_thread_id
             WHERE thread.trace_mode = 'debug' OR event.item_key IS NOT NULL
           )`,
      )
      .run(marker, cutoff);

    const modelCallResult = this.requireDb()
      .prepare(
        `UPDATE workflow_model_calls
         SET input_json = ?,
             output_json = CASE WHEN output_json IS NULL THEN NULL ELSE ? END
         WHERE started_at < ?
           AND id IN (
             SELECT model_call.id
             FROM workflow_model_calls model_call
             JOIN workflow_artifacts artifact ON artifact.id = model_call.artifact_id
             LEFT JOIN workflow_agent_threads thread ON thread.id = artifact.workflow_thread_id
             WHERE thread.trace_mode = 'debug'
           )`,
      )
      .run(marker, marker, cutoff);

    return {
      cutoff,
      eventsCompacted: eventResult.changes,
      modelCallsCompacted: modelCallResult.changes,
    };
  }

  private createWorkflowAgentThreadRecord(input: CreateWorkflowAgentThreadInput): WorkflowAgentThreadRow {
    this.ensureDefaultWorkflowAgentFolder();
    const now = new Date().toISOString();
    const workspace = this.getWorkspace();
    const folderId = input.folderId && this.tryGetWorkflowAgentFolder(input.folderId) ? input.folderId : WORKFLOW_AGENT_HOME_FOLDER_ID;
    const title = (input.title?.trim() || input.initialRequest.trim().split(/\r?\n/)[0] || "Untitled workflow").slice(0, 160);
    const projectPath = input.projectPath?.trim() || workspace.path;
    const chatThread = this.createThread(`Workflow: ${title}`, projectPath);
    const id = randomUUID();
    this.requireDb()
      .prepare(
        `INSERT INTO workflow_agent_threads
          (id, folder_id, chat_thread_id, project_path, title, phase, initial_request, active_artifact_id, active_graph_snapshot_id, trace_mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        folderId,
        chatThread.id,
        projectPath,
        title,
        input.phase ?? "discovery",
        input.initialRequest.trim(),
        null,
        null,
        input.traceMode ?? "production",
        now,
        now,
      );
    return this.requireWorkflowAgentThread(id);
  }

  private ensureDefaultWorkflowAgentFolder(): void {
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT INTO workflow_agent_folders (id, name, folder_kind, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      )
      .run(WORKFLOW_AGENT_HOME_FOLDER_ID, "Home", "home", now, now);
  }

  private ensureWorkflowAgentThreadLinks(): void {
    this.ensureDefaultWorkflowAgentFolder();
    const now = new Date().toISOString();
    const artifacts = this.listWorkflowArtifacts();
    for (const artifact of artifacts) {
      if (artifact.workflowThreadId && this.tryGetWorkflowAgentThread(artifact.workflowThreadId)) continue;
      const thread = this.createWorkflowAgentThreadRecord({
        title: artifact.title,
        initialRequest: artifact.spec.goal || artifact.spec.summary || artifact.title,
        phase: workflowAgentPhaseForArtifactStatus(artifact.status),
      });
      this.requireDb()
        .prepare("UPDATE workflow_artifacts SET workflow_thread_id = ?, updated_at = ? WHERE id = ?")
        .run(thread.id, now, artifact.id);
      this.requireDb()
        .prepare("UPDATE workflow_agent_threads SET active_artifact_id = ?, phase = ?, updated_at = ? WHERE id = ?")
        .run(artifact.id, workflowAgentPhaseForArtifactStatus(artifact.status), now, thread.id);
    }
  }

  private listWorkflowAgentFolderRows(): WorkflowAgentFolderRow[] {
    this.ensureDefaultWorkflowAgentFolder();
    return this.requireDb().prepare("SELECT * FROM workflow_agent_folders").all() as WorkflowAgentFolderRow[];
  }

  private listWorkflowAgentThreadRows(): WorkflowAgentThreadRow[] {
    this.ensureDefaultWorkflowAgentFolder();
    return this.requireDb()
      .prepare("SELECT * FROM workflow_agent_threads ORDER BY updated_at DESC, created_at DESC")
      .all() as WorkflowAgentThreadRow[];
  }

  private requireWorkflowAgentFolder(folderId: string): WorkflowAgentFolderRow {
    const row = this.requireDb().prepare("SELECT * FROM workflow_agent_folders WHERE id = ?").get(folderId) as
      | WorkflowAgentFolderRow
      | undefined;
    if (!row) throw new Error(`Workflow Agent folder not found: ${folderId}`);
    return row;
  }

  private tryGetWorkflowAgentFolder(folderId: string): WorkflowAgentFolderRow | undefined {
    return this.requireDb().prepare("SELECT * FROM workflow_agent_folders WHERE id = ?").get(folderId) as
      | WorkflowAgentFolderRow
      | undefined;
  }

  private requireWorkflowAgentThread(threadId: string): WorkflowAgentThreadRow {
    const row = this.tryGetWorkflowAgentThread(threadId);
    if (!row) throw new Error(`Workflow Agent thread not found: ${threadId}`);
    return row;
  }

  private tryGetWorkflowAgentThread(threadId: string): WorkflowAgentThreadRow | undefined {
    return this.requireDb().prepare("SELECT * FROM workflow_agent_threads WHERE id = ?").get(threadId) as
      | WorkflowAgentThreadRow
      | undefined;
  }

  private tryGetWorkflowArtifact(artifactId: string): WorkflowArtifactSummary | undefined {
    const row = this.requireDb().prepare("SELECT * FROM workflow_artifacts WHERE id = ?").get(artifactId) as
      | WorkflowArtifactRow
      | undefined;
    return row ? this.mapWorkflowArtifact(row) : undefined;
  }

  private tryGetWorkflowGraphSnapshot(snapshotId: string): WorkflowGraphSnapshot | undefined {
    const row = this.requireDb().prepare("SELECT * FROM workflow_graph_snapshots WHERE id = ?").get(snapshotId) as
      | WorkflowGraphSnapshotRow
      | undefined;
    return row ? this.mapWorkflowGraphSnapshot(row) : undefined;
  }

  private requireWorkflowGraphSnapshotForThread(snapshotId: string | undefined, workflowThreadId: string): WorkflowGraphSnapshot | undefined {
    if (!snapshotId) return undefined;
    const snapshot = this.tryGetWorkflowGraphSnapshot(snapshotId);
    if (!snapshot) throw new Error(`Workflow graph snapshot not found: ${snapshotId}`);
    if (snapshot.workflowThreadId !== workflowThreadId) {
      throw new Error(`Workflow graph snapshot ${snapshotId} does not belong to workflow thread ${workflowThreadId}.`);
    }
    return snapshot;
  }

  interruptActiveRuns(reason = INTERRUPTED_RUN_MESSAGE): number {
    const db = this.requireDb();
    const activeRuns = this.listActiveRuns();
    const interruptedMessageIds = new Set<string>();
    let interrupted = 0;

    for (const run of activeRuns) {
      this.finishRun(run.id, "interrupted", reason);
      const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(run.assistantMessageId) as
        | MessageRow
        | undefined;
      if (row) {
        this.markMessageInterrupted(row, reason);
        interruptedMessageIds.add(row.id);
      }
      interrupted += 1;
    }

    const candidateMessages = db
      .prepare("SELECT * FROM messages WHERE role IN ('assistant', 'tool') AND metadata_json IS NOT NULL")
      .all() as MessageRow[];

    for (const message of candidateMessages) {
      if (interruptedMessageIds.has(message.id)) continue;
      const metadata = parseMetadata(message.metadata_json);
      if (isRecoverableMessageMetadata(metadata)) {
        this.markMessageInterrupted(message, reason);
        interrupted += 1;
      }
    }

    return interrupted;
  }

  stallActiveOrchestrationRuns(): number {
    const rows = this.requireDb()
      .prepare("SELECT * FROM orchestration_runs WHERE status IN ('claimed', 'preparing', 'running')")
      .all() as OrchestrationRunRow[];
    let stalled = 0;
    for (const row of rows) {
      const run = this.mapOrchestrationRun(row);
      const interruptedAt = new Date().toISOString();
      this.updateOrchestrationRun({
        id: run.id,
        status: "stalled",
        error: RESTART_INTERRUPTED_LOCAL_TASK_ERROR,
        proofOfWork: restartInterruptedRunProofOfWork(run.proofOfWork, interruptedAt),
        finish: true,
        reviewProjectBoardProof: false,
      });
      try {
        this.updateOrchestrationTask({ id: run.taskId, state: "needs_info" });
      } catch {
        // A dangling run should not block workspace startup.
      }
      stalled += 1;
    }
    return stalled;
  }

  private getMessage(messageId: string): ChatMessage {
    const row = this.requireDb().prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as MessageRow | undefined;
    if (!row) throw new Error(`Message not found: ${messageId}`);
    return this.mapMessage(row);
  }

  private getRun(runId: string): RunRecord {
    const row = this.requireDb().prepare("SELECT * FROM runs WHERE id = ?").get(runId) as RunRow | undefined;
    if (!row) throw new Error(`Run not found: ${runId}`);
    return this.mapRun(row);
  }

  private touchThread(threadId: string, preview: string): void {
    this.requireDb()
      .prepare("UPDATE threads SET updated_at = ?, last_message_preview = ? WHERE id = ?")
      .run(new Date().toISOString(), formatThreadPreview(preview), threadId);
  }

  private repairThreadPreviews(): void {
    const db = this.requireDb();
    const threads = db.prepare("SELECT id FROM threads").all() as Array<{ id: string }>;
    const latestNonTool = db.prepare(
      "SELECT content FROM messages WHERE thread_id = ? AND role != 'tool' AND trim(content) != '' ORDER BY created_at DESC LIMIT 1",
    );
    const latestMessage = db.prepare(
      "SELECT content FROM messages WHERE thread_id = ? AND trim(content) != '' ORDER BY created_at DESC LIMIT 1",
    );
    const update = db.prepare("UPDATE threads SET last_message_preview = ? WHERE id = ?");

    for (const thread of threads) {
      const nonTool = latestNonTool.get(thread.id) as { content: string } | undefined;
      const fallback = latestMessage.get(thread.id) as { content: string } | undefined;
      update.run(formatThreadPreview(nonTool?.content ?? fallback?.content ?? ""), thread.id);
    }
  }

  private repairPlannerPlanQuestionBlocks(): void {
    const db = this.requireDb();
    const rows = db
      .prepare(
        `SELECT a.*, m.content AS message_content
         FROM planner_plan_artifacts a
         JOIN messages m ON m.id = a.source_message_id
         WHERE a.content LIKE '%ambient-planner-questions%'
           AND NOT EXISTS (
             SELECT 1 FROM planner_decision_questions q
             WHERE q.artifact_id = a.id
           )`,
      )
      .all() as Array<PlannerPlanArtifactRow & { message_content: string }>;
    if (!rows.length) return;

    const updateArtifact = db.prepare(
      `UPDATE planner_plan_artifacts
       SET title = ?, summary = ?, content = ?, steps_json = ?, open_questions_json = ?, risks_json = ?, verification_json = ?, warnings_json = ?, workflow_state = ?, updated_at = ?
       WHERE id = ?`,
    );
    const updateMessageContent = db.prepare("UPDATE messages SET content = ? WHERE id = ?");
    const insertQuestion = db.prepare(
      `INSERT INTO planner_decision_questions
        (id, artifact_id, question_order, question, recommended_option_id, required, options_json, answer_kind, answer_option_id, answer_custom_text, answered_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
    );

    db.transaction((repairRows: typeof rows) => {
      for (const row of repairRows) {
        const fields = extractPlannerPlanArtifactFields(row.content);
        if (!fields.decisionQuestions.length || fields.content === row.content) continue;
        const now = new Date().toISOString();
        updateArtifact.run(
          fields.title,
          fields.summary,
          fields.content,
          JSON.stringify(fields.steps),
          JSON.stringify(fields.openQuestions),
          JSON.stringify(fields.risks),
          JSON.stringify(fields.verification),
          JSON.stringify(fields.warnings ?? []),
          plannerPlanWorkflowStateForQuestions(fields.decisionQuestions),
          now,
          row.id,
        );
        fields.decisionQuestions.forEach((question, index) => {
          insertQuestion.run(
            question.id,
            row.id,
            index,
            question.question,
            question.recommendedOptionId,
            question.required ? 1 : 0,
            JSON.stringify(question.options),
            now,
            now,
          );
        });
        if (row.message_content.includes("ambient-planner-questions")) {
          updateMessageContent.run(fields.content, row.source_message_id);
        }
      }
    })(rows);
  }

  pruneRedundantEmptyThreads(): number {
    const db = this.requireDb();
    const candidates = db
      .prepare(
        `SELECT id FROM threads
         WHERE title = 'New chat'
           AND last_message_preview = ''
           AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.thread_id = threads.id)
           AND NOT EXISTS (SELECT 1 FROM runs WHERE runs.thread_id = threads.id)
           AND NOT EXISTS (SELECT 1 FROM orchestration_runs WHERE orchestration_runs.thread_id = threads.id)
         ORDER BY updated_at DESC, created_at DESC`,
      )
      .all() as Array<{ id: string }>;
    if (candidates.length === 0) return 0;

    const nonEmptyThread = db
      .prepare(
        `SELECT id FROM threads
         WHERE NOT (
           title = 'New chat'
           AND last_message_preview = ''
           AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.thread_id = threads.id)
           AND NOT EXISTS (SELECT 1 FROM runs WHERE runs.thread_id = threads.id)
           AND NOT EXISTS (SELECT 1 FROM orchestration_runs WHERE orchestration_runs.thread_id = threads.id)
         )
         LIMIT 1`,
      )
      .get() as { id: string } | undefined;
    const keepId = nonEmptyThread ? undefined : candidates[0]?.id;
    const deleteIds = candidates.map((candidate) => candidate.id).filter((id) => id !== keepId);
    if (deleteIds.length === 0) return 0;

    const activeThreadId = this.getLastActiveThreadId();
    const deleteThread = db.prepare("DELETE FROM threads WHERE id = ?");
    const transaction = db.transaction((ids: string[]) => {
      for (const id of ids) deleteThread.run(id);
    });
    transaction(deleteIds);
    if (activeThreadId && deleteIds.includes(activeThreadId)) {
      this.settings().setSetting("lastActiveThreadId", keepId ?? "");
    }
    return deleteIds.length;
  }

  private ensureDefaultSettings(): void {
    this.settings().ensureDefaultSettings();
  }

  private ensureDefaultAutomationFolder(): void {
    const now = new Date().toISOString();
    this.requireDb()
      .prepare(
        `INSERT OR IGNORE INTO automation_folders (id, name, folder_kind, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(AUTOMATION_HOME_FOLDER_ID, "Home", "home", now, now);
  }

  private ensureAutomationThreadLinks(): void {
    this.ensureDefaultAutomationFolder();
    const now = new Date().toISOString();
    const insert = this.requireDb().prepare(
      `INSERT OR IGNORE INTO automation_thread_folders (source_kind, source_id, folder_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const task of this.listOrchestrationTasks()) {
      insert.run("orchestration_task", task.id, AUTOMATION_HOME_FOLDER_ID, now, now);
    }
    for (const artifact of this.listWorkflowArtifacts()) {
      insert.run("workflow_artifact", artifact.id, AUTOMATION_HOME_FOLDER_ID, now, now);
    }
  }

  private listAutomationFolderRows(): AutomationFolderRow[] {
    this.ensureDefaultAutomationFolder();
    return this.requireDb().prepare("SELECT * FROM automation_folders").all() as AutomationFolderRow[];
  }

  private requireAutomationFolder(folderId: string): AutomationFolderRow {
    const row = this.requireDb().prepare("SELECT * FROM automation_folders WHERE id = ?").get(folderId) as
      | AutomationFolderRow
      | undefined;
    if (!row) throw new Error(`Automation folder not found: ${folderId}`);
    return row;
  }

  private requireAutomationSource(kind: AutomationThreadKind, id: string): void {
    if (kind === "orchestration_task") {
      this.getOrchestrationTask(id);
      return;
    }
    this.getWorkflowArtifact(id);
  }

  private requireAutomationScheduleTarget(kind: AutomationScheduleTargetKind, id: string, targetVersion?: number): void {
    if (!id.trim()) throw new Error("Automation schedule target is required.");
    if (kind === "local_task") {
      this.getOrchestrationTask(id);
      return;
    }
    if (kind === "workflow_playbook") {
      this.requireWorkflowRecordingScheduleTarget(id, targetVersion);
      return;
    }
    if (kind === "workflow_artifact") {
      this.getWorkflowArtifact(id);
      return;
    }
    if (kind === "workflow_thread") {
      this.requireWorkflowAgentThread(id);
      return;
    }
    if (kind === "workflow_version") {
      this.getWorkflowVersion(id);
      return;
    }
    this.requireAutomationFolder(id);
  }

  private requireAutomationScheduleRow(scheduleId: string): AutomationScheduleRow {
    const row = this.requireDb().prepare("SELECT * FROM automation_schedules WHERE id = ?").get(scheduleId) as AutomationScheduleRow | undefined;
    if (!row) throw new Error(`Automation schedule not found: ${scheduleId}`);
    return row;
  }

  private normalizeAutomationScheduleOccurrenceAt(value: string | null | undefined, label: string): string {
    const trimmed = value?.trim();
    if (!trimmed) throw new Error(`${label} is required.`);
    const date = new Date(trimmed);
    if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid date/time.`);
    return date.toISOString();
  }

  private insertAutomationScheduleException(input: {
    scheduleId: string;
    occurrenceAt: string;
    exceptionKind: AutomationScheduleExceptionKind;
    status: AutomationScheduleExceptionStatus;
    replacementRunAt?: string;
    runLimits?: WorkflowRunLimitOverrides;
    reason?: string;
    consumedAt?: string;
    now: string;
  }): void {
    this.requireDb()
      .prepare(
        `INSERT INTO automation_schedule_exceptions
         (id, schedule_id, occurrence_at, exception_kind, status, replacement_run_at, run_limits_json, reason, consumed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.scheduleId,
        input.occurrenceAt,
        input.exceptionKind,
        input.status,
        input.replacementRunAt ?? null,
        stringifyWorkflowRunLimitOverrides(input.runLimits),
        input.reason?.trim() || null,
        input.consumedAt ?? null,
        input.now,
        input.now,
      );
  }

  private advanceAutomationScheduleNextRun(
    schedule: AutomationScheduleRow,
    occurrenceDate: Date,
    updatedAt: string,
    options: { markLastRun: boolean },
  ): void {
    const nextRunAt = computeAutomationScheduleNextRunAt({
      preset: schedule.preset,
      cronExpression: schedule.cron_expression ?? undefined,
      enabled: schedule.enabled === 1,
      now: occurrenceDate,
    });
    this.requireDb()
      .prepare(`UPDATE automation_schedules SET next_run_at = ?, last_run_at = COALESCE(?, last_run_at), updated_at = ? WHERE id = ?`)
      .run(nextRunAt ?? null, options.markLastRun ? occurrenceDate.toISOString() : null, updatedAt, schedule.id);
  }

  private automationScheduleTargetVersion(kind: AutomationScheduleTargetKind, id: string, targetVersion?: number): number | null {
    if (targetVersion !== undefined && kind !== "workflow_playbook") {
      throw new Error("Pinned schedule target versions are only supported for workflow playbook schedules.");
    }
    if (kind !== "workflow_playbook" || targetVersion === undefined) return null;
    if (!Number.isInteger(targetVersion) || targetVersion < 1) throw new Error("Workflow playbook schedule target version must be a positive integer.");
    this.requireWorkflowRecordingScheduleTarget(id, targetVersion);
    return targetVersion;
  }

  private requireWorkflowRecordingScheduleTarget(id: string, targetVersion?: number): WorkflowRecordingLibraryDescription {
    const playbook = this.describeWorkflowRecording(id);
    if (targetVersion !== undefined) workflowRecordingRequireLibraryVersion(id, playbook.versions, targetVersion);
    return playbook;
  }

  ensureAutomationScheduleDedicatedThread(scheduleId: string): ThreadSummary {
    const row = this.requireAutomationScheduleRow(scheduleId);
    if (row.target_kind !== "workflow_playbook") throw new Error("Only workflow playbook schedules have dedicated chat threads.");
    if (row.dedicated_thread_id) {
      try {
        return this.getThread(row.dedicated_thread_id);
      } catch {
        // Fall through and create a replacement thread for schedules restored from older state.
      }
    }
    const threadId = this.automationScheduleDedicatedThreadId(row.target_kind, row.target_id, row.target_version ?? undefined);
    if (!threadId) throw new Error(`Could not create a dedicated thread for schedule ${scheduleId}.`);
    this.requireDb()
      .prepare("UPDATE automation_schedules SET dedicated_thread_id = ?, updated_at = ? WHERE id = ?")
      .run(threadId, new Date().toISOString(), scheduleId);
    return this.getThread(threadId);
  }

  private automationScheduleCreationBlockReason(kind: AutomationScheduleTargetKind, id: string, targetVersion?: number): string | undefined {
    if (kind === "workflow_playbook") {
      const playbook = this.requireWorkflowRecordingScheduleTarget(id, targetVersion);
      return playbook.enabled ? undefined : "Workflow playbook is disabled and cannot be scheduled.";
    }
    if (kind === "workflow_artifact") {
      const artifact = this.getWorkflowArtifact(id);
      return artifact.status === "approved" ? undefined : `Workflow artifact is ${artifact.status} and cannot be scheduled until approved.`;
    }
    if (kind === "workflow_thread") {
      return this.getLatestApprovedWorkflowVersion(id) ? undefined : "Workflow Agent has no approved version to schedule.";
    }
    if (kind === "workflow_version") {
      const version = this.getWorkflowVersion(id);
      if (version.status !== "approved") return `Pinned workflow version is ${version.status} and cannot be scheduled until approved.`;
      const artifact = this.getWorkflowArtifact(version.artifactId);
      return artifact.status === "approved" ? undefined : `Workflow artifact is ${artifact.status} and cannot be scheduled until approved.`;
    }
    return undefined;
  }

  private automationScheduleCreatedTargetVersionId(kind: AutomationScheduleTargetKind, id: string, targetVersion?: number): string | null {
    if (kind === "workflow_playbook") return String(targetVersion ?? this.describeWorkflowRecording(id).version);
    if (kind === "workflow_thread") return this.getLatestApprovedWorkflowVersion(id)?.id ?? null;
    if (kind === "workflow_version") return this.getWorkflowVersion(id).id;
    return null;
  }

  private automationScheduleDedicatedThreadId(
    kind: AutomationScheduleTargetKind,
    id: string,
    targetVersion?: number,
    existingThreadId?: string,
  ): string | null {
    if (kind !== "workflow_playbook") return null;
    if (existingThreadId) {
      try {
        this.getThread(existingThreadId);
        return existingThreadId;
      } catch {
        // The schedule is valid, but the old dedicated thread was removed.
      }
    }
    const playbook = this.requireWorkflowRecordingScheduleTarget(id, targetVersion);
    const suffix = targetVersion ? ` v${targetVersion}` : " (current)";
    return this.createThread(`Scheduled: ${playbook.title}${suffix}`, this.getWorkspace().path).id;
  }

  private automationScheduleTargetLabel(kind: AutomationScheduleTargetKind, id: string, targetVersion?: number): string {
    try {
      if (kind === "local_task") {
        const task = this.getOrchestrationTask(id);
        return `${task.identifier}: ${task.title}`;
      }
      if (kind === "workflow_playbook") {
        const playbook = this.describeWorkflowRecording(id);
        const versionLabel = targetVersion ? `v${targetVersion} (pinned)` : `current v${playbook.version}`;
        return `${playbook.title} (${versionLabel})`;
      }
      if (kind === "workflow_thread") {
        return `${this.getWorkflowAgentThreadSummary(id).title} (latest approved)`;
      }
      if (kind === "workflow_version") {
        const version = this.getWorkflowVersion(id);
        const thread = this.getWorkflowAgentThreadSummary(version.workflowThreadId);
        return `${thread.title} v${version.version} (pinned)`;
      }
      if (kind === "workflow_artifact") return this.getWorkflowArtifact(id).title;
      return this.requireAutomationFolder(id).name;
    } catch {
      return `Missing ${kind} ${id}`;
    }
  }

  private ensureDefaultThread(): void {
    const row = this.requireDb().prepare("SELECT id FROM threads WHERE archived_at IS NULL OR archived_at = '' LIMIT 1").get();
    if (!row) this.createThread();
  }

  private migrate(): void {
    const db = this.requireDb();
    applyProjectStoreBootstrapSchema(db);
    applyProjectStoreSchemaMigrationSteps(db, PROJECT_STORE_SCHEMA_MIGRATION_STEPS_BEFORE_ORCHESTRATION_BACKFILL);
    migrateProjectStoreProjectBoardThreadScope(db);
    repairProjectBoardSynthesisCardsWithExcludedSourceRefs(db);
    backfillProjectStoreOrchestrationTaskProjectPath(db, defaultOrchestrationProjectPath(this.getWorkspace().path));
    applyProjectStoreSchemaMigrationSteps(db, PROJECT_STORE_SCHEMA_MIGRATION_STEPS_AFTER_ORCHESTRATION_BACKFILL_BEFORE_PLANNER_REPAIR);
    repairProjectStorePlannerPlanWorkflowStates(db);
    applyProjectStoreSchemaMigrationSteps(db, PROJECT_STORE_SCHEMA_MIGRATION_STEPS_AFTER_PLANNER_REPAIR);
    backfillProjectStoreThreadLastReadAt(db);
    for (const [legacyModelId, replacementModelId] of AMBIENT_LEGACY_MODEL_IDS) {
      replaceProjectStoreLegacyModelId(db, legacyModelId, replacementModelId);
    }
  }

  private requireDb(): Database.Database {
    if (!this.db) throw new Error("Project database is not open");
    return this.db;
  }

  private mapThread = (row: ThreadRow): ThreadSummary => mapThreadRow(row, { gitWorktree: this.getThreadWorktree(row.id) });

  private nextSubagentChildOrder(parentThreadId: string): number {
    const row = this.requireDb()
      .prepare("SELECT COALESCE(MAX(child_order), -1) + 1 AS next_order FROM threads WHERE parent_thread_id = ?")
      .get(parentThreadId) as { next_order?: number } | undefined;
    return Math.max(0, Math.floor(row?.next_order ?? 0));
  }

  private appendSubagentRunEventInternal(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): void {
    assertSubagentRunEventAttribution({
      runId,
      eventType: input.type,
      preview: input.preview,
    });
    const row = this.requireDb()
      .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM subagent_run_events WHERE run_id = ?")
      .get(runId) as { next_sequence?: number } | undefined;
    this.requireDb()
      .prepare(
        `INSERT INTO subagent_run_events (run_id, sequence, type, preview_json, artifact_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        runId,
        row?.next_sequence ?? 1,
        input.type,
        input.preview === undefined ? null : JSON.stringify(input.preview),
        input.artifactPath ?? null,
        input.createdAt ?? new Date().toISOString(),
      );
  }

  private findSubagentParentMailboxEventByIdempotencyKey(
    parentRunId: string,
    type: string,
    idempotencyKey: string,
  ): SubagentParentMailboxEventSummary | undefined {
    const row = this.requireDb()
      .prepare("SELECT * FROM subagent_parent_mailbox_events WHERE parent_run_id = ? AND type = ? AND idempotency_key = ?")
      .get(parentRunId, type, idempotencyKey) as SubagentParentMailboxEventRow | undefined;
    return row ? this.mapSubagentParentMailboxEvent(row) : undefined;
  }

  private parentMessageIdForSubagentRun(runId: string): string | undefined {
    const row = this.requireDb()
      .prepare("SELECT parent_message_id FROM subagent_runs WHERE id = ?")
      .get(runId) as { parent_message_id?: string | null } | undefined;
    return row?.parent_message_id ?? undefined;
  }

  private upsertSubagentBatchProgressNotificationForRecord(
    record: SubagentBatchJobRecord,
    createdAt: string,
  ): SubagentParentMailboxEventSummary {
    const payload = createSubagentBatchProgressParentMailboxPayload(record);
    const idempotencyKey = createSubagentBatchProgressParentMailboxIdempotencyKey(record.plan.jobId);
    const existing = this.findSubagentParentMailboxEventByIdempotencyKey(
      record.plan.parentRunId,
      SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_TYPE,
      idempotencyKey,
    );
    if (!existing) {
      return this.appendSubagentParentMailboxEvent({
        parentThreadId: record.plan.parentThreadId,
        parentRunId: record.plan.parentRunId,
        parentMessageId: record.plan.parentMessageId,
        type: SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_TYPE,
        payload,
        idempotencyKey,
        createdAt,
      });
    }
    this.requireDb()
      .prepare(
        `UPDATE subagent_parent_mailbox_events
         SET parent_message_id = COALESCE(parent_message_id, ?), payload_json = ?, delivery_state = 'queued', updated_at = ?, delivered_at = NULL
         WHERE id = ?`,
      )
      .run(record.plan.parentMessageId ?? null, JSON.stringify(payload), createdAt, existing.id);
    return this.getSubagentParentMailboxEvent(existing.id);
  }

  private latestQueuedSubagentParentMailboxEvent(parentRunId: string, type: string): SubagentParentMailboxEventSummary | undefined {
    const row = this.requireDb()
      .prepare(
        `SELECT * FROM subagent_parent_mailbox_events
         WHERE parent_run_id = ? AND type = ? AND delivery_state = 'queued'
         ORDER BY updated_at DESC, created_at DESC, id DESC
         LIMIT 1`,
      )
      .get(parentRunId, type) as SubagentParentMailboxEventRow | undefined;
    return row ? this.mapSubagentParentMailboxEvent(row) : undefined;
  }

  private updateCallableWorkflowTaskRow(input: {
    id: string;
    status?: CallableWorkflowTaskStatus;
    statusLabel?: string;
    runnerDeferredReason?: string;
    workflowArtifactId?: string;
    workflowRunId?: string;
    errorMessage?: string;
    updatedAt: string;
    startedAt?: string;
    completedAt?: string;
  }): CallableWorkflowTaskSummary {
    const current = this.getCallableWorkflowTask(input.id);
    this.requireDb()
      .prepare(
        `UPDATE callable_workflow_tasks
         SET status = ?,
             status_label = ?,
             runner_deferred_reason = ?,
             workflow_artifact_id = ?,
             workflow_run_id = ?,
             error_message = ?,
             updated_at = ?,
             started_at = ?,
             completed_at = ?
         WHERE id = ?`,
      )
      .run(
        input.status ?? current.status,
        input.statusLabel ?? current.statusLabel,
        input.runnerDeferredReason ?? current.runnerDeferredReason,
        input.workflowArtifactId ?? current.workflowArtifactId ?? null,
        input.workflowRunId ?? current.workflowRunId ?? null,
        input.errorMessage ?? current.errorMessage ?? null,
        input.updatedAt,
        input.startedAt ?? current.startedAt ?? null,
        input.completedAt ?? current.completedAt ?? null,
        input.id,
      );
    return this.getCallableWorkflowTask(input.id);
  }

  private appendCallableWorkflowTaskStartedEventIfNeeded(
    task: CallableWorkflowTaskSummary,
    workflowRunId: string,
    createdAt: string,
  ): void {
    const existing = this.listWorkflowRunEvents(workflowRunId).find((event) =>
      event.type === CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE &&
      event.data?.taskId === task.id &&
      event.data?.launchId === task.launchId
    );
    if (existing) return;
    this.appendWorkflowRunEvent({
      runId: workflowRunId,
      type: CALLABLE_WORKFLOW_TASK_STARTED_EVENT_TYPE,
      message: `Callable workflow task started: ${task.title}.`,
      createdAt,
      data: {
        taskId: task.id,
        launchId: task.launchId,
        parentThreadId: task.parentThreadId,
        parentRunId: task.parentRunId,
        parentMessageId: task.parentMessageId,
        toolCallId: task.toolCallId,
        toolId: task.toolId,
        toolName: task.toolName,
        sourceKind: task.sourceKind,
        blocking: task.blocking,
        ...this.callableWorkflowTaskCallerProvenanceEventData(task),
      },
    });
  }

  private appendCallableWorkflowTaskControlEventIfNeeded(
    task: CallableWorkflowTaskSummary,
    workflowRunId: string,
    action: CallableWorkflowTaskControlAction,
    reason: string | undefined,
    createdAt: string,
  ): void {
    const existing = this.listWorkflowRunEvents(workflowRunId).find((event) =>
      event.type === CALLABLE_WORKFLOW_TASK_CONTROL_EVENT_TYPE &&
      event.data?.taskId === task.id &&
      event.data?.launchId === task.launchId &&
      event.data?.action === action
    );
    if (existing) return;
    const trimmedReason = reason?.trim();
    const actionLabel = callableWorkflowTaskControlActionLabel(action);
    this.appendWorkflowRunEvent({
      runId: workflowRunId,
      type: CALLABLE_WORKFLOW_TASK_CONTROL_EVENT_TYPE,
      message: `Callable workflow task ${actionLabel}: ${task.title}.`,
      createdAt,
      data: {
        taskId: task.id,
        launchId: task.launchId,
        parentThreadId: task.parentThreadId,
        parentRunId: task.parentRunId,
        parentMessageId: task.parentMessageId,
        toolCallId: task.toolCallId,
        toolId: task.toolId,
        toolName: task.toolName,
        sourceKind: task.sourceKind,
        blocking: task.blocking,
        taskStatus: task.status,
        action,
        reason: trimmedReason || undefined,
        ...this.callableWorkflowTaskCallerProvenanceEventData(task),
      },
    });
  }

  private appendCallableWorkflowTaskFinishedEventIfNeeded(
    task: CallableWorkflowTaskSummary,
    workflowRunId: string,
    runStatus: WorkflowRunStatus,
    createdAt: string,
  ): void {
    const existing = this.listWorkflowRunEvents(workflowRunId).find((event) =>
      event.type === CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE &&
      event.data?.taskId === task.id &&
      event.data?.launchId === task.launchId &&
      event.data?.runStatus === runStatus
    );
    if (existing) return;
    this.appendWorkflowRunEvent({
      runId: workflowRunId,
      type: CALLABLE_WORKFLOW_TASK_FINISHED_EVENT_TYPE,
      message: `Callable workflow task ${task.status}: ${task.title}.`,
      createdAt,
      data: {
        taskId: task.id,
        launchId: task.launchId,
        parentThreadId: task.parentThreadId,
        parentRunId: task.parentRunId,
        parentMessageId: task.parentMessageId,
        toolCallId: task.toolCallId,
        toolId: task.toolId,
        toolName: task.toolName,
        sourceKind: task.sourceKind,
        blocking: task.blocking,
        taskStatus: task.status,
        runStatus,
        errorMessage: task.errorMessage,
        ...this.callableWorkflowTaskCallerProvenanceEventData(task),
      },
    });
  }

  private callableWorkflowTaskCallerProvenanceEventData(task: CallableWorkflowTaskSummary): Record<string, unknown> {
    const provenance = buildCallableWorkflowCompilerHandoffPlan({ task }).callerProvenance;
    const base = {
      callerKind: provenance.kind,
      callerThreadId: provenance.threadId,
      callerRunId: provenance.runId,
      callerMessageId: provenance.messageId,
    };
    if (provenance.kind !== "subagent_child_thread") return base;
    return {
      ...base,
      childThreadId: provenance.threadId,
      childRunId: provenance.subagentRunId ?? provenance.runId,
      childThreadRunId: provenance.runId,
      subagentRunId: provenance.subagentRunId,
      canonicalTaskPath: provenance.canonicalTaskPath,
      childParentThreadId: provenance.parentThreadId,
      childParentRunId: provenance.parentRunId,
      approvalRequired: provenance.approval.required,
      approvalSource: provenance.approval.source,
      approvalScope: provenance.approval.scopeHint,
      worktreeRequired: provenance.worktree.required,
      worktreeIsolated: provenance.worktree.isolated,
      worktreePath: provenance.worktree.worktreePath,
      nestedFanoutRequired: provenance.nestedFanout.required,
      nestedFanoutSource: provenance.nestedFanout.source,
    };
  }

  private findCallableWorkflowTaskByLaunchId(launchId: string): CallableWorkflowTaskSummary | undefined {
    const row = this.requireDb()
      .prepare("SELECT * FROM callable_workflow_tasks WHERE launch_id = ?")
      .get(launchId) as CallableWorkflowTaskRow | undefined;
    return row ? this.mapCallableWorkflowTask(row) : undefined;
  }

  private findSubagentMaturityEvidenceByKey(kind: SubagentMaturityEvidenceKind, evidenceKey: string): SubagentMaturityEvidence | undefined {
    const row = this.requireDb()
      .prepare("SELECT * FROM subagent_maturity_evidence WHERE kind = ? AND evidence_key = ?")
      .get(kind, evidenceKey) as SubagentMaturityEvidenceRow | undefined;
    return row ? this.mapSubagentMaturityEvidence(row) : undefined;
  }

  private mapSubagentRun = mapSubagentRunRow;

  private mapSubagentRunEvent = mapSubagentRunEventRow;

  private mapSubagentSpawnEdge = mapSubagentSpawnEdgeRow;

  private mapSubagentMailboxEvent = mapSubagentMailboxEventRow;

  private mapSubagentParentMailboxEvent = mapSubagentParentMailboxEventRow;

  private mapSubagentMaturityEvidence = mapSubagentMaturityEvidenceRow;

  private mapSubagentPromptSnapshot = mapSubagentPromptSnapshotRow;

  private mapSubagentToolScopeSnapshot = mapSubagentToolScopeSnapshotRow;

  private mapSubagentWaitBarrier = mapSubagentWaitBarrierRow;

  private mapSubagentBatchJob = mapSubagentBatchJobRow;

  private mapSubagentBatchResultReport = mapSubagentBatchResultReportRow;

  private mapThreadWorktree = mapThreadWorktreeRow;

  private mapMessage = mapMessageRow;

  private mapMessageVoiceState = mapMessageVoiceStateRow;

  private mapRun = mapRunRow;

  private artifactDrafts(): ProjectStoreArtifactDraftRepository {
    return new ProjectStoreArtifactDraftRepository(this.requireDb(), this.getWorkspace().path);
  }

  private settings(): ProjectStoreSettingsRepository {
    return new ProjectStoreSettingsRepository(this.requireDb());
  }

  private mapContextUsageSnapshot = mapContextUsageSnapshotRow;

  private mapThreadGoal = mapThreadGoalRow;

  private mapPermissionAudit = mapPermissionAuditRow;

  private mapPermissionGrant = mapPermissionGrantRow;

  private mapPlannerPlanArtifact = (row: PlannerPlanArtifactRow): PlannerPlanArtifact => {
    return mapPlannerPlanArtifactRow(row, this.listPlannerDecisionQuestions(row.id));
  };

  private listPlannerDecisionQuestions(artifactId: string): PlannerDecisionQuestion[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM planner_decision_questions WHERE artifact_id = ? ORDER BY question_order ASC, rowid ASC")
      .all(artifactId) as PlannerDecisionQuestionRow[];
    return rows.map((row, index) => mapPlannerDecisionQuestionRow(row, index));
  }

  private mapProjectBoard = (row: ProjectBoardRow): ProjectBoardSummary => {
    const events = this.listProjectBoardEvents(row.id);
    const claims = projectBoardClaimSummaryFromEvents(events);
    const cards = projectBoardCardsWithClaimSummaries(this.listProjectBoardCards(row.id), claims);
    return mapProjectBoardRow({
      row,
      charter: row.charter_id ? this.getProjectBoardCharter(row.charter_id) : undefined,
      cards,
      sources: this.listProjectBoardSources(row.id),
      questions: this.listProjectBoardQuestions(row.id),
      proposals: this.listProjectBoardSynthesisProposals(row.id),
      synthesisRuns: this.listProjectBoardSynthesisRuns(row.id),
      executionArtifacts: this.listProjectBoardExecutionArtifacts(row.id),
      events,
      claims,
    });
  };

  private listProjectBoardCards(boardId: string): ProjectBoardCard[] {
    const rows = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE board_id = ? AND status != 'archived'
         ORDER BY
           CASE status
             WHEN 'blocked' THEN 0
             WHEN 'draft' THEN 1
             WHEN 'ready' THEN 2
             WHEN 'in_progress' THEN 3
             WHEN 'review' THEN 4
             WHEN 'done' THEN 5
             ELSE 6
           END,
           priority IS NULL,
           priority ASC,
           updated_at DESC`,
      )
      .all(boardId) as ProjectBoardCardRow[];
    const tasks = rows.some((row) => row.orchestration_task_id) ? this.listOrchestrationTasks() : [];
    return rows.map((row) => this.mapProjectBoardCard(row, tasks));
  }

  private listProjectBoardSources(boardId: string): ProjectBoardSource[] {
    const rows = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_sources
         WHERE board_id = ?
         ORDER BY relevance DESC, updated_at DESC, title ASC`,
      )
      .all(boardId) as ProjectBoardSourceRow[];
    return rows.map(mapProjectBoardSourceRow);
  }

  private listProjectBoardQuestions(boardId: string): ProjectBoardQuestion[] {
    const rows = this.requireDb()
      .prepare("SELECT * FROM project_board_questions WHERE board_id = ? ORDER BY question_order ASC, rowid ASC")
      .all(boardId) as ProjectBoardQuestionRow[];
    const sources = rows.some((row) => row.suggestion_context_fingerprint) ? this.listProjectBoardSources(boardId) : undefined;
    return rows.map((row) => mapProjectBoardQuestionRow(row, sources));
  }

  private listProjectBoardEvents(boardId: string, limit = 80): ProjectBoardEvent[] {
    const boundedLimit = Math.max(1, Math.min(limit, 200));
    const rows = this.requireDb()
      .prepare("SELECT * FROM project_board_events WHERE board_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(boardId, boundedLimit) as ProjectBoardEventRow[];
    return rows.map(mapProjectBoardEventRow);
  }

  private listProjectBoardSynthesisProposals(boardId: string, limit = 20): ProjectBoardSynthesisProposal[] {
    const boundedLimit = Math.max(1, Math.min(limit, 50));
    const rows = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_synthesis_proposals
         WHERE board_id = ?
         ORDER BY
           CASE status
             WHEN 'pending' THEN 0
             WHEN 'applied' THEN 1
             WHEN 'superseded' THEN 2
             ELSE 3
           END,
           created_at DESC,
           rowid DESC
         LIMIT ?`,
      )
      .all(boardId, boundedLimit) as ProjectBoardSynthesisProposalRow[];
    return rows.map(this.mapProjectBoardSynthesisProposal);
  }

  private listProjectBoardSynthesisRuns(boardId: string, limit = 10): ProjectBoardSynthesisRun[] {
    const boundedLimit = Math.max(1, Math.min(limit, 30));
    const rows = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_synthesis_runs
         WHERE board_id = ?
         ORDER BY started_at DESC, rowid DESC
         LIMIT ?`,
      )
      .all(boardId, boundedLimit) as ProjectBoardSynthesisRunRow[];
    return rows.map(this.mapProjectBoardSynthesisRun);
  }

  private listProjectBoardExecutionArtifacts(boardId: string, limit = 40): ProjectBoardExecutionArtifact[] {
    const boundedLimit = Math.max(1, Math.min(limit, 200));
    const rows = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_execution_artifacts
         WHERE board_id = ?
         ORDER BY updated_at DESC, rowid DESC
         LIMIT ?`,
      )
      .all(boardId, boundedLimit) as ProjectBoardExecutionArtifactRow[];
    return rows.map(mapProjectBoardExecutionArtifactRow);
  }

  private mapProjectBoardSynthesisRun = mapProjectBoardSynthesisRunRow;

  private mapProjectBoardSynthesisProposal = mapProjectBoardSynthesisProposalRow;

  private mapProjectBoardCard = mapProjectBoardCardRow;

  private syncProjectBoardCardsForLinkedTasks(): void {
    const rows = this.requireDb()
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE orchestration_task_id IS NOT NULL AND status != 'archived'`,
      )
      .all() as ProjectBoardCardRow[];
    if (rows.length === 0) return;

    const tasks = this.listOrchestrationTasks();
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const now = new Date().toISOString();
    const touchedBoardIds = new Set<string>();
    const updateCard = this.requireDb().prepare("UPDATE project_board_cards SET status = ?, updated_at = ? WHERE id = ?");
    const updateBoard = this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?");
    const transaction = this.requireDb().transaction(() => {
      for (const row of rows) {
        const task = tasksById.get(row.orchestration_task_id ?? "");
        if (!task) continue;
        if (projectBoardCardRowIsClosedDone(row)) continue;
        const status = projectBoardStatusForTask(task, tasks);
        if (status === row.status) continue;
        updateCard.run(status, now, row.id);
        touchedBoardIds.add(row.board_id);
      }
      for (const boardId of touchedBoardIds) {
        updateBoard.run(now, boardId);
      }
    });
    transaction();
  }

  private projectBoardTaskHasClosedDoneCard(taskId: string): boolean {
    const rows = this.requireDb()
      .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived'")
      .all(taskId) as ProjectBoardCardRow[];
    return rows.some(projectBoardCardRowIsClosedDone);
  }

  private syncProjectBoardTaskBlockers(boardId: string): void {
    const cards = this.listProjectBoardCards(boardId);
    const linkedCards = cards.filter((card) => card.orchestrationTaskId);
    if (linkedCards.length === 0) return;
    const tasks = this.listOrchestrationTasks();
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const now = new Date().toISOString();
    const updateTask = this.requireDb().prepare("UPDATE orchestration_tasks SET blocked_by_json = ?, updated_at = ? WHERE id = ?");
    const transaction = this.requireDb().transaction(() => {
      for (const card of linkedCards) {
        const task = tasksById.get(card.orchestrationTaskId ?? "");
        if (!task) continue;
        const resolvedBlockers = resolveProjectBoardTaskBlockers(card, cards, tasks);
        if (JSON.stringify(resolvedBlockers) === JSON.stringify(task.blockedBy)) continue;
        updateTask.run(JSON.stringify(resolvedBlockers), now, task.id);
      }
    });
    transaction();
  }

  private reviewProjectBoardCardProofForRun(run: OrchestrationRun): void {
    const context = this.getProjectBoardProofReviewContextForRun(run.id);
    if (!context) return;
    this.applyProjectBoardCardProofReview({ runId: run.id, review: context.deterministicReview });
  }

  private materializeProjectBoardPulledHandoffFollowUps(boardId: string, runArtifacts: ProjectBoardRunArtifactProjection[]): string[] {
    const artifactsWithFollowUps = runArtifacts.filter((artifact) => artifact.handoff?.followUps.length);
    if (artifactsWithFollowUps.length === 0) return [];

    const parentById = new Map(
      (this.requireDb()
        .prepare("SELECT * FROM project_board_cards WHERE board_id = ? AND status != 'archived'")
        .all(boardId) as ProjectBoardCardRow[]).map((row) => [row.id, row]),
    );
    const existing = this.requireDb().prepare("SELECT id FROM project_board_cards WHERE board_id = ? AND source_kind = 'run_follow_up' AND source_id = ?");
    const insert = this.requireDb().prepare(
      `INSERT OR IGNORE INTO project_board_cards
       (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
        acceptance_criteria_json, test_plan_json, source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertEvent = this.requireDb().prepare(
      `INSERT OR IGNORE INTO project_board_events
       (id, board_id, event_kind, title, summary, entity_kind, entity_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const updateBoard = this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?");
    const insertedIds: string[] = [];
    let latestCreatedAt: string | undefined;

    for (const runArtifact of artifactsWithFollowUps) {
      const handoff = runArtifact.handoff;
      if (!handoff) continue;
      const runId = runArtifact.manifest?.runId ?? runArtifact.proof?.runId ?? handoff.runId ?? runArtifact.runPathId;
      const parentCardId = projectBoardExecutionArtifactCardId(runArtifact.manifest, runArtifact.proof, handoff);
      if (!parentCardId) continue;
      const parent = parentById.get(parentCardId);
      if (!parent) continue;

      const parentLabels = parseStringList(parent.labels_json);
      const labels = [...new Set(["run-follow-up", "pulled-handoff", ...parentLabels])];
      const runInsertedIds: string[] = [];
      handoff.followUps.forEach((followUp, index) => {
        const sourceId = `${runId}#follow-up:${index + 1}`;
        const existingCard = existing.get(boardId, sourceId) as { id: string } | undefined;
        if (existingCard) return;
        const cardId = stableBoardArtifactId("card", [boardId, "run_follow_up", sourceId]);
        const blockers = [...new Set([parent.id, ...followUp.blockedBy.filter((ref) => ref !== parent.id)])];
        const reason = followUp.reason.trim();
        const description = reason
          ? `Pulled handoff follow-up from ${parent.title}.\n\n${reason}`.slice(0, 4000)
          : `Pulled handoff follow-up from ${parent.title}.`;
        const acceptanceCriteria = reason
          ? [`Resolve follow-up: ${followUp.title}`, `Address handoff reason: ${reason}`]
          : [`Resolve follow-up: ${followUp.title}`];
        const testPlan: ProjectBoardCardTestPlan = {
          unit: [],
          integration: [],
          visual: [],
          manual: ["Review the pulled run handoff, confirm the follow-up scope, and attach proof before closing."],
        };
        const createdAt = handoff.createdAt;
        insert.run(
          cardId,
          boardId,
          followUp.title,
          description,
          "draft",
          "needs_clarification",
          parent.priority === null ? null : parent.priority + index + 1,
          parent.phase,
          JSON.stringify(labels),
          JSON.stringify(blockers),
          JSON.stringify(acceptanceCriteria),
          JSON.stringify(testPlan),
          "run_follow_up",
          sourceId,
          parent.source_thread_id,
          null,
          null,
          createdAt,
          createdAt,
        );
        insertedIds.push(cardId);
        runInsertedIds.push(cardId);
        latestCreatedAt = !latestCreatedAt || createdAt.localeCompare(latestCreatedAt) > 0 ? createdAt : latestCreatedAt;
      });

      if (runInsertedIds.length > 0) {
        insertEvent.run(
          stableBoardArtifactId("event", [boardId, "run_follow_up_created", runId]),
          boardId,
          "run_follow_up_created",
          "Pulled handoff follow-ups proposed",
          `${runInsertedIds.length} pulled handoff follow-up card${runInsertedIds.length === 1 ? "" : "s"} entered the draft inbox.`,
          "run",
          runId,
          JSON.stringify({ runId, parentCardId: parent.id, followUpCardIds: runInsertedIds, source: "pulled_handoff" }),
          handoff.createdAt,
        );
      }
    }

    if (insertedIds.length > 0) updateBoard.run(latestCreatedAt ?? new Date().toISOString(), boardId);
    return insertedIds;
  }

  private createProjectBoardFollowUpCandidatesForRun(
    run: OrchestrationRun,
    parentRow?: ProjectBoardCardRow,
    options: ProjectBoardRunFollowUpInsertOptions = {},
  ): string[] {
    const followUps = normalizeRunFollowUps(run.proofOfWork?.followUps);
    if (followUps.length === 0) return [];
    const parent =
      parentRow ??
      (this.requireDb()
        .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1")
        .get(run.taskId) as ProjectBoardCardRow | undefined);
    if (!parent) return [];

    const now = new Date().toISOString();
    const insert = this.requireDb().prepare(
      `INSERT INTO project_board_cards
       (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
        acceptance_criteria_json, test_plan_json, clarification_questions_json, clarification_decisions_json, source_kind, source_id, source_thread_id, source_message_id,
        orchestration_task_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const existing = this.requireDb().prepare("SELECT id FROM project_board_cards WHERE board_id = ? AND source_kind = 'run_follow_up' AND source_id = ?");
    const updateBoard = this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?");
    const labels = [...new Set(["run-follow-up", ...(options.labels ?? []), ...parseStringList(parent.labels_json)])];
    const blockByParent = options.blockByParent !== false;
    const clarificationQuestions = options.clarificationQuestions?.length
      ? normalizeProjectBoardClarificationQuestions(options.clarificationQuestions, 8)
      : [];
    const clarificationDecisions = normalizeProjectBoardClarificationDecisions(undefined, {
      clarificationQuestions,
      createdAt: now,
      updatedAt: now,
    });
    let insertedIds: string[] = [];
    const transaction = this.requireDb().transaction(() => {
      insertedIds = [];
      followUps.forEach((followUp, index) => {
        const sourceId = `${run.id}#follow-up:${index + 1}`;
        if (existing.get(parent.board_id, sourceId)) return;
        const cardId = randomUUID();
        insert.run(
          cardId,
          parent.board_id,
          followUp.title,
          followUp.description,
          "draft",
          "needs_clarification",
          parent.priority === null ? null : parent.priority + index + 1,
          parent.phase,
          JSON.stringify(labels),
          JSON.stringify(blockByParent ? [parent.id] : []),
          JSON.stringify(followUp.acceptanceCriteria),
          JSON.stringify(followUp.testPlan),
          JSON.stringify(clarificationQuestions),
          JSON.stringify(clarificationDecisions),
          "run_follow_up",
          sourceId,
          run.threadId ?? parent.source_thread_id,
          null,
          null,
          now,
          now,
        );
        insertedIds.push(cardId);
      });
      if (insertedIds.length > 0) {
        updateBoard.run(now, parent.board_id);
        this.appendProjectBoardEvent({
          boardId: parent.board_id,
          kind: "run_follow_up_created",
          title: "Run follow-ups proposed",
          summary: `${insertedIds.length} follow-up card${insertedIds.length === 1 ? "" : "s"} entered the draft inbox.`,
          entityKind: "orchestration_run",
          entityId: run.id,
          metadata: {
            runId: run.id,
            parentCardId: parent.id,
            followUpCardIds: insertedIds,
            derivedFromParent: !blockByParent,
            labels: options.labels ?? [],
          },
          createdAt: now,
        });
      }
    });
    transaction();
    return insertedIds;
  }

  private createProjectBoardProofFollowUpForRun(
    run: OrchestrationRun,
    parent: ProjectBoardCardRow,
    review: ProjectBoardProofReviewDraft,
    options: ProjectBoardRunFollowUpInsertOptions = {},
  ): string[] {
    const now = new Date().toISOString();
    const sourceId = `${run.id}#${options.sourceIdSuffix ?? "proof-review"}`;
    const existing = this.requireDb()
      .prepare("SELECT id FROM project_board_cards WHERE board_id = ? AND source_kind = 'run_follow_up' AND source_id = ?")
      .get(parent.board_id, sourceId) as { id: string } | undefined;
    if (existing) return [existing.id];
    const cardId = randomUUID();
    const labels = [...new Set(["proof-follow-up", ...(options.labels ?? []), ...parseStringList(parent.labels_json)])];
    const title = options.title ?? `Complete proof for ${parent.title}`.slice(0, 180);
    const description = options.description ?? review.missing.join("\n").slice(0, 4000);
    const acceptanceCriteria = options.acceptanceCriteria?.length
      ? normalizeCardTextList(options.acceptanceCriteria, 30)
      : review.missing.length ? review.missing : ["Resolve missing proof before closing the parent card."];
    const clarificationQuestions = options.clarificationQuestions?.length
      ? normalizeProjectBoardClarificationQuestions(options.clarificationQuestions, 8)
      : [];
    const testPlan =
      options.testPlan ?? { unit: [], integration: [], visual: [], manual: ["Review the parent run proof packet and add the missing evidence."] };
    this.requireDb()
      .prepare(
        `INSERT INTO project_board_cards
         (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
          acceptance_criteria_json, test_plan_json, clarification_questions_json, clarification_decisions_json, source_kind, source_id, source_thread_id, source_message_id,
          orchestration_task_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        cardId,
        parent.board_id,
        title,
        description,
        "draft",
        "needs_clarification",
        parent.priority === null ? null : parent.priority + 1,
        parent.phase,
        JSON.stringify(labels),
        JSON.stringify(options.blockByParent === false ? [] : [parent.id]),
        JSON.stringify(acceptanceCriteria),
        JSON.stringify(testPlan),
        JSON.stringify(clarificationQuestions),
        JSON.stringify(normalizeProjectBoardClarificationDecisions(undefined, { clarificationQuestions, createdAt: now, updatedAt: now })),
        "run_follow_up",
        sourceId,
        run.threadId ?? parent.source_thread_id,
        null,
        null,
        now,
        now,
      );
    this.requireDb().prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, parent.board_id);
    this.appendProjectBoardEvent({
      boardId: parent.board_id,
      kind: "run_follow_up_created",
      title: "Proof follow-up proposed",
      summary: "Missing proof created a follow-up card in the draft inbox.",
      entityKind: "orchestration_run",
      entityId: run.id,
      metadata: {
        runId: run.id,
        parentCardId: parent.id,
        followUpCardIds: [cardId],
        proofReviewStatus: review.status,
        derivedFromParent: options.blockByParent === false,
        labels: options.labels ?? [],
        piSuggestedFollowUp: Boolean(options.labels?.includes("pi-suggested-follow-up")),
        suggestedTitle: options.title,
      },
      createdAt: now,
    });
    return [cardId];
  }

  private appendProjectBoardEvent(input: ProjectBoardEventInput): void {
    this.requireDb()
      .prepare(
        `INSERT INTO project_board_events
         (id, board_id, event_kind, title, summary, entity_kind, entity_id, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.boardId,
        input.kind,
        input.title.trim().slice(0, 180),
        input.summary.trim().slice(0, 1000),
        input.entityKind?.trim() || null,
        input.entityId?.trim() || null,
        JSON.stringify(input.metadata ?? {}),
        input.createdAt ?? new Date().toISOString(),
      );
  }

  private projectBoardCardTaskDescription(card: ProjectBoardCard): string {
    const board = this.getProjectBoard(card.boardId);
    return projectBoardCardTaskDescription(card, board?.charter?.budgetPolicy, this.projectBoardCardDependencyExecutionContext(card));
  }

  private projectBoardCardDependencyExecutionContext(card: ProjectBoardCard): ProjectBoardCardDependencyExecutionContext | undefined {
    const blockerRefs = normalizeTaskReferences(card.blockedBy);
    if (blockerRefs.length === 0) return undefined;

    const cards = this.listProjectBoardCards(card.boardId);
    const tasks = this.listOrchestrationTasks();
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const tasksByIdentifier = new Map(tasks.map((task) => [task.identifier, task]));
    const available: ProjectBoardCardDependencyExecutionEntry[] = [];
    const pending: string[] = [];

    for (const blockerRef of blockerRefs) {
      const blockerCard = cards.find((candidate) => candidate.id !== card.id && projectBoardCardMatchesRef(candidate, blockerRef));
      if (blockerCard && projectBoardCardIsTerminalAuditCandidate(blockerCard)) continue;
      const task = blockerCard?.orchestrationTaskId
        ? tasksById.get(blockerCard.orchestrationTaskId)
        : (tasksById.get(blockerRef) ?? tasksByIdentifier.get(blockerRef));
      const linkedCard = blockerCard ?? (task ? cards.find((candidate) => candidate.orchestrationTaskId === task.id) : undefined);
      const taskState = task ? normalizeTaskState(task.state) : undefined;
      const cardStatus = linkedCard?.status;
      const dependencyAvailable =
        cardStatus === "done" ||
        cardStatus === "review" ||
        taskState === "done" ||
        taskState === "review" ||
        taskState === "needs_review";

      if (!dependencyAvailable) {
        const status = [
          linkedCard?.title,
          cardStatus ? `card ${cardStatus}` : "",
          task?.identifier,
          taskState ? `task ${taskState}` : "",
        ]
          .filter(Boolean)
          .join("; ");
        pending.push(`${blockerRef}${status ? ` (${status})` : ""}`);
        continue;
      }

      const artifactRun = task ? this.latestDependencyArtifactRunForTask(task.id) : undefined;
      const latestRun = artifactRun ?? (task ? this.latestOrchestrationRunForTask(task.id) : undefined);
      const proof = artifactRun?.proofOfWork;
      const taskActions = projectBoardRuntimeBudgetTrustworthyTaskActions(proof);
      available.push({
        ref: blockerRef,
        title: linkedCard?.title ?? task?.title ?? blockerRef,
        cardId: linkedCard?.id,
        taskId: task?.id,
        cardStatus,
        taskIdentifier: task?.identifier,
        taskState,
        workspacePath: artifactRun?.workspacePath ?? task?.workspacePath ?? latestRun?.workspacePath,
        branchName: task?.branchName,
        latestRunId: artifactRun?.id,
        latestRunStatus: latestRun?.status,
        proofSummary: projectBoardPromptSummary(
          projectBoardTaskToolProofSummary(taskActions),
          typeof proof?.summary === "string" ? proof.summary : undefined,
          typeof proof?.lastAssistantText === "string" ? proof.lastAssistantText : undefined,
          linkedCard?.proofReview?.summary,
        ),
        changedFiles: projectBoardPromptList(
          [...stringsFromProjectBoardUnknownArray(proof?.changedFiles), ...projectBoardTaskToolChangedFiles(taskActions)],
          12,
        ),
        commands: projectBoardPromptList([...stringsFromProjectBoardUnknownArray(proof?.commands), ...projectBoardTaskToolCommands(taskActions)], 8),
        manualChecks: projectBoardPromptList(
          [...stringsFromProjectBoardUnknownArray(proof?.manualChecks), ...projectBoardTaskToolManualChecks(taskActions)],
          8,
        ),
        completed: projectBoardPromptList([...stringsFromProjectBoardUnknownArray(proof?.completed), ...projectBoardTaskToolCompleted(taskActions)], 8),
      });
    }

    return available.length || pending.length ? { available, pending } : undefined;
  }

  private latestOrchestrationRunForTask(taskId: string): OrchestrationRun | undefined {
    const row = this.requireDb()
      .prepare(
        `SELECT * FROM orchestration_runs
         WHERE task_id = ?
         ORDER BY proof_of_work_json IS NULL,
                  COALESCE(last_event_at, finished_at, started_at) DESC,
                  attempt_number DESC,
                  started_at DESC,
                  id DESC
         LIMIT 1`,
      )
      .get(taskId) as OrchestrationRunRow | undefined;
    return row ? this.mapOrchestrationRun(row) : undefined;
  }

  private latestDependencyArtifactRunForTask(taskId: string): OrchestrationRun | undefined {
    const row = this.requireDb()
      .prepare(
        `SELECT * FROM orchestration_runs
         WHERE task_id = ?
           AND status = 'completed'
           AND proof_of_work_json IS NOT NULL
         ORDER BY COALESCE(finished_at, last_event_at, started_at) DESC,
                  attempt_number DESC,
                  started_at DESC,
                  id DESC
         LIMIT 1`,
      )
      .get(taskId) as OrchestrationRunRow | undefined;
    return row ? this.mapOrchestrationRun(row) : undefined;
  }

  private createTaskForProjectBoardCard(card: ProjectBoardCard): OrchestrationTask {
    const sourceUrl = `project-board-card:${card.id}`;
    const existing = this.requireDb()
      .prepare("SELECT * FROM orchestration_tasks WHERE source_kind = 'project_board_card' AND source_url = ? ORDER BY updated_at DESC LIMIT 1")
      .get(sourceUrl) as OrchestrationTaskRow | undefined;
    if (existing) return this.mapOrchestrationTask(existing);
    const description = this.projectBoardCardTaskDescription(card);
    const boardCards = this.listProjectBoardCards(card.boardId);
    const blockedBy = resolveProjectBoardTaskBlockers(card, boardCards, this.listOrchestrationTasks());
    const task = this.createOrchestrationTask({
      title: card.title,
      description,
      state: "ready",
      priority: card.priority,
      labels: normalizeTaskLabels(["project-board", ...card.labels]),
      blockedBy,
    });
    this.requireDb()
      .prepare("UPDATE orchestration_tasks SET source_kind = ?, source_url = ?, updated_at = ? WHERE id = ?")
      .run("project_board_card", sourceUrl, new Date().toISOString(), task.id);
    return this.getOrchestrationTask(task.id);
  }

  private nextOrchestrationAttemptNumber(taskId: string): number {
    const row = this.requireDb()
      .prepare("SELECT MAX(attempt_number) AS max_attempt FROM orchestration_runs WHERE task_id = ?")
      .get(taskId) as { max_attempt: number | null };
    return (row.max_attempt ?? -1) + 1;
  }

  private nextLocalTaskIdentifier(): string {
    const row = this.requireDb()
      .prepare(
        "SELECT MAX(CAST(SUBSTR(identifier, 7) AS INTEGER)) AS max_number FROM orchestration_tasks WHERE identifier LIKE 'LOCAL-%'",
      )
      .get() as { max_number: number | null };
    return `LOCAL-${(row.max_number ?? 0) + 1}`;
  }

  private mapOrchestrationTask = mapOrchestrationTaskRow;

  private mapOrchestrationRun = mapOrchestrationRunRow;

  private workflowAgentThreadFromRow(
    row: WorkflowAgentThreadRow,
    artifact: WorkflowArtifactSummary | undefined,
    latestRun: WorkflowRunSummary | undefined,
    projectName: string,
    fallbackProjectPath: string,
  ): WorkflowAgentThreadSummary {
    const latestVersion = this.latestWorkflowVersionForThread(row.id);
    const graph = this.workflowGraphSnapshotForThread(row, latestVersion, artifact);
    const latestRunEvents = latestRun ? this.listWorkflowRunEvents(latestRun.id) : [];
    return mapWorkflowAgentThreadRow(row, {
      artifact,
      latestRun,
      latestRunEvents,
      latestVersion,
      graph,
      discoveryQuestions: this.listWorkflowDiscoveryQuestions(row.id),
      projectName,
      fallbackProjectPath,
    });
  }

  private workflowGraphSnapshotForThread(
    row: WorkflowAgentThreadRow,
    latestVersion: WorkflowVersionSummary | undefined,
    artifact: WorkflowArtifactSummary | undefined,
  ): WorkflowGraphSnapshot | undefined {
    if (row.active_graph_snapshot_id) {
      const activeGraph = this.tryGetWorkflowGraphSnapshot(row.active_graph_snapshot_id);
      if (activeGraph) return activeGraph;
    }
    if (latestVersion?.graphSnapshotId) {
      const versionGraph = this.tryGetWorkflowGraphSnapshot(latestVersion.graphSnapshotId);
      if (versionGraph) return versionGraph;
    }
    const latestGraph = this.listWorkflowGraphSnapshots(row.id)[0];
    if (latestGraph) return latestGraph;
    if (!artifact) return undefined;
    const fallback = workflowGraphFromSpec({ title: artifact.title, spec: artifact.spec, manifest: artifact.manifest });
    return {
      id: `artifact-derived:${artifact.id}`,
      workflowThreadId: row.id,
      version: 0,
      source: "compile",
      nodes: fallback.nodes,
      edges: fallback.edges,
      summary: fallback.summary,
      createdAt: artifact.updatedAt,
    };
  }

  private latestWorkflowVersionForThread(workflowThreadId: string): WorkflowVersionSummary | undefined {
    const row = this.requireDb()
      .prepare("SELECT * FROM workflow_versions WHERE workflow_thread_id = ? ORDER BY version_number DESC, created_at DESC LIMIT 1")
      .get(workflowThreadId) as WorkflowVersionRow | undefined;
    return row ? this.mapWorkflowVersion(row) : undefined;
  }

  private workflowVersionForGraphSnapshot(graphSnapshotId: string | undefined): WorkflowVersionSummary | undefined {
    if (!graphSnapshotId) return undefined;
    const row = this.requireDb()
      .prepare("SELECT * FROM workflow_versions WHERE graph_snapshot_id = ? ORDER BY version_number DESC, created_at DESC LIMIT 1")
      .get(graphSnapshotId) as WorkflowVersionRow | undefined;
    return row ? this.mapWorkflowVersion(row) : undefined;
  }

  private mapWorkflowGraphSnapshot = mapWorkflowGraphSnapshotRow;

  private mapWorkflowExplorationTrace = mapWorkflowExplorationTraceRow;

  private mapWorkflowVersion = mapWorkflowVersionRow;

  private mapWorkflowRevision = (row: WorkflowRevisionRow): WorkflowRevisionSummary => {
    const proposedVersion = this.workflowVersionForGraphSnapshot(row.proposed_graph_snapshot_id ?? undefined);
    return mapWorkflowRevisionRow(row, { proposedVersion });
  };

  private mapWorkflowDiscoveryQuestion = mapWorkflowDiscoveryQuestionRow;

  private mapAutomationSchedule = (row: AutomationScheduleRow): AutomationScheduleSummary =>
    mapAutomationScheduleRow(row, this.automationScheduleTargetLabel(row.target_kind, row.target_id, row.target_version ?? undefined));

  private mapAutomationScheduleException = mapAutomationScheduleExceptionRow;

  private mapWorkflowArtifact = mapWorkflowArtifactRow;

  private mapWorkflowRun = (row: WorkflowRunRow): WorkflowRunSummary =>
    mapWorkflowRunRow(row, { scheduledBy: this.workflowRunScheduleSummary(row.id) });

  private workflowRunScheduleSummary(runId: string): WorkflowRunScheduleSummary | undefined {
    const row = this.requireDb()
      .prepare("SELECT event_type, data_json FROM workflow_run_events WHERE run_id = ? AND event_type IN ('workflow.schedule.started', 'workflow.schedule.skipped') ORDER BY seq ASC LIMIT 1")
      .get(runId) as WorkflowRunScheduleEventRow | undefined;
    return mapWorkflowRunScheduleSummaryRow(row);
  }

  private mapWorkflowRunEvent = mapWorkflowRunEventRow;

  private mapCallableWorkflowTask = (row: CallableWorkflowTaskRow): CallableWorkflowTaskSummary => {
    const task = mapCallableWorkflowTaskRow(row, {
      workflowThreadId: row.workflow_artifact_id ? this.tryGetWorkflowArtifact(row.workflow_artifact_id)?.workflowThreadId : undefined,
    });
    return this.hydrateCallableWorkflowTaskRunTelemetry(task);
  };

  private hydrateCallableWorkflowTaskRunTelemetry(task: CallableWorkflowTaskSummary): CallableWorkflowTaskSummary {
    if (!task.workflowRunId) return task;
    const run = this.tryGetWorkflowRun(task.workflowRunId);
    if (!run) return task;
    const events = this.listWorkflowRunEvents(run.id);
    const modelCalls = this.listWorkflowModelCalls({ runId: run.id });
    return {
      ...task,
      progressSnapshot: callableWorkflowTaskProgressSnapshot(run, events, modelCalls),
      usageSnapshot: callableWorkflowTaskUsageSnapshot(events, modelCalls),
    };
  }

  private mapWorkflowModelCall = mapWorkflowModelCallRow;

  private markMessageInterrupted(row: MessageRow, runMessage = INTERRUPTED_RUN_MESSAGE): void {
    const metadata = interruptedMetadata(parseMetadata(row.metadata_json));
    const content = interruptedMessageContent(row.content, row.role, runMessage);
    this.replaceMessage(row.id, content, metadata);
  }
}
