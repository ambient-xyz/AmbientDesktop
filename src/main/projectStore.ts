import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AutomationFolderSummary,
  AutomationScheduleExceptionSummary,
  AutomationScheduleOccurrenceActionInput,
  AutomationScheduleOccurrenceActionResult,
  AutomationScheduleSummary,
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
  ProjectBoardCardProofReview,
  ProjectBoardCardPendingPiUpdate,
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
  ProjectBoardPlanningSnapshotKind,
  ProjectBoardSplitDecisionAction,
  ProjectBoardQuestion,
  ProjectBoardSource,
  ProjectBoardSourceKind,
  ProjectBoardStatus,
  ProjectBoardScopeContract,
  ProjectBoardScopeFeature,
  ProjectBoardSynthesisProposal,
  ProjectBoardSynthesisProposalCardReviewStatus,
  ProjectBoardSynthesisRun,
  ProjectBoardSynthesisRunProgressiveRecord,
  ProjectBoardSynthesisRunStage,
  ProjectBoardSynthesisRunStatus,
  ProjectBoardSummary,
  PlannerDurableArtifactValidationResult,
  PlannerPlanArtifact,
  PlannerPlanArtifactStatus,
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
  WorkflowGraphSnapshot,
  WorkflowExplorationTraceSummary,
  WorkflowModelCallRecord,
  WorkflowRecoveryContext,
  WorkflowRunEvent,
  WorkflowRunProviderHealth,
  WorkflowRunRetryMetadata,
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
import type { CallableWorkflowExecutionPlan } from "./callable-workflow/callableWorkflowExecutionPlan";
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
} from "./callable-workflow/callableWorkflowTaskQueue";
import {
  analyzeSubagentRestartState,
  createSubagentRepairDiagnosticsReport,
  uniqueSubagentRepairIds,
} from "./subagents/subagentRepair";
import {
  summarizeSubagentObservability,
  type SubagentObservabilitySummary,
} from "./subagents/subagentObservability";
import {
  evaluateSubagentMaturity,
  type SubagentMaturityInput,
} from "./subagents/subagentMaturity";
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
  createSubagentBatchProgressParentMailboxIdempotencyKey,
  createSubagentBatchProgressParentMailboxPayload,
  SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_TYPE,
  type SubagentBatchJobPlan,
  type SubagentBatchJobRecord,
  type SubagentBatchReportApplyResult,
  type SubagentBatchResultReport,
} from "./subagents/subagentBatchJobs";
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
} from "./subagents/subagentRetention";
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
import {
  assertSubagentRunLinkage,
} from "./subagents/subagentInvariants";
import { subagentLifecycleEventType, subagentLifecycleHookPreview } from "./subagents/subagentLifecycleHooks";
import {
  SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_TYPE,
  subagentLifecycleInterruptionIdempotencyKey,
  subagentLifecycleInterruptionParentMailboxPayload,
  type SubagentLifecycleInterruptionSource,
} from "./subagents/subagentLifecycleParentMailbox";
import {
  buildSubagentGroupedCompletionNotificationDraft,
  SUBAGENT_GROUPED_COMPLETION_PARENT_MAILBOX_TYPE,
} from "./subagents/subagentGroupJoin";
import { cancelPendingParentToChildMailboxEvents } from "./subagents/subagentMailbox";
import {
  workflowRecordingFindLibraryRecord,
  workflowRecordingLibraryVersions,
  workflowRecordingNextSavedPlaybook,
  workflowRecordingPlaybookId,
  workflowRecordingRequireLibraryVersion,
  workflowRecordingSavedPlaybookForWorkspace,
  workflowRecordingWritePlaybookPackageWithIndex,
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
import type { MessageRow } from "./projectStoreThreadMappers";
import type {
  ActivePersistedRunStatus,
  RunRecord,
  TerminalPersistedRunStatus,
} from "./projectStore/runMappers";
import {
  type OrchestrationRunRow,
} from "./projectStore/orchestrationMappers";
import { latestWorkflowRunForArtifact } from "./projectStore/automationMappers";
import {
  plannerPlanWorkflowStateForQuestions,
  type PlannerPlanArtifactRow,
} from "./projectStore/plannerMappers";
import { ProjectStoreArtifactDraftRepository } from "./projectStoreArtifactDraftRepository";
import { ProjectStorePlannerArtifactRepository, type PlannerPlanArtifactInput } from "./projectStore/plannerArtifactRepository";
import { ProjectStoreMessageRepository } from "./projectStore/messageRepository";
import { ProjectStoreMessageVoiceRepository } from "./projectStore/messageVoiceRepository";
import { ProjectStoreRunRepository } from "./projectStore/runRepository";
import { ProjectStoreSubagentBatchRepository } from "./projectStore/subagentBatchRepository";
import { ProjectStoreSubagentMailboxRepository } from "./projectStore/subagentMailboxRepository";
import { ProjectStoreSubagentMaturityEvidenceRepository } from "./projectStore/subagentMaturityEvidenceRepository";
import { ProjectStoreSubagentParentMailboxRepository } from "./projectStore/subagentParentMailboxRepository";
import { ProjectStoreSubagentRunRepository } from "./projectStore/subagentRunRepository";
import { ProjectStoreSubagentSnapshotRepository } from "./projectStore/subagentSnapshotRepository";
import { ProjectStoreSubagentWaitBarrierRepository } from "./projectStore/subagentWaitBarrierRepository";
import { ProjectStoreThreadRepository, type CreateProjectStoreThreadDefaults } from "./projectStore/threadRepository";
import { ProjectStoreThreadGoalRepository } from "./projectStore/threadGoalRepository";
import { ProjectStoreWorkspaceSearchRepository } from "./projectStore/workspaceSearchRepository";
import { ProjectStoreWorkflowAgentThreadRepository, WORKFLOW_AGENT_HOME_FOLDER_ID } from "./projectStore/workflowAgentThreadRepository";
import { ProjectStoreWorkflowArtifactRepository } from "./projectStore/workflowArtifactRepository";
import { ProjectStoreWorkflowExplorationTraceRepository } from "./projectStore/workflowExplorationTraceRepository";
import { ProjectStoreWorkflowGraphSnapshotRepository } from "./projectStore/workflowGraphSnapshotRepository";
import { ProjectStoreWorkflowModelCallRepository } from "./projectStore/workflowModelCallRepository";
import {
  ProjectStoreWorkflowDiscoveryQuestionRepository,
  type CreateWorkflowDiscoveryQuestionInput,
} from "./projectStore/workflowDiscoveryQuestionRepository";
import { ProjectStoreWorkflowRevisionRepository } from "./projectStore/workflowRevisionRepository";
import { ProjectStoreWorkflowRunRepository } from "./projectStore/workflowRunRepository";
import { ProjectStoreWorkflowTraceRetentionRepository } from "./projectStore/workflowTraceRetentionRepository";
import { ProjectStoreWorkflowVersionRepository } from "./projectStore/workflowVersionRepository";
import { ProjectStoreProjectBoardReadRepository } from "./projectStore/projectBoardReadRepository";
import { ProjectStoreProjectBoardCardMutationRepository } from "./projectStore/projectBoardCardMutationRepository";
import { ProjectStoreProjectBoardLifecycleRepository } from "./projectStore/projectBoardLifecycleRepository";
import { ProjectStoreProjectBoardQuestionRepository, type ApplyProjectBoardKickoffDefaultSuggestionsInput } from "./projectStore/projectBoardQuestionRepository";
import { ProjectStoreProjectBoardSourceRepository } from "./projectStore/projectBoardSourceRepository";
import { ProjectStoreProjectBoardPlanningSnapshotRepository } from "./projectStore/projectBoardPlanningSnapshotRepository";
import { ProjectStoreProjectBoardDeliverableIntegrationRepository } from "./projectStore/projectBoardDeliverableIntegrationRepository";
import { ProjectStoreProjectBoardCardExecutionSessionRepository } from "./projectStore/projectBoardCardExecutionSessionRepository";
import { ProjectStoreProjectBoardSessionCopyRepository } from "./projectStore/projectBoardSessionCopyRepository";
import { ProjectStoreProjectBoardExecutionReadinessRepository } from "./projectStore/projectBoardExecutionReadinessRepository";
import { ProjectStoreProjectBoardWorkflowRepository } from "./projectStore/projectBoardWorkflowRepository";
import { ProjectStoreProjectBoardSynthesisApplyRepository } from "./projectStore/projectBoardSynthesisApplyRepository";
import { ProjectStoreProjectBoardSynthesisProposalRepository } from "./projectStore/projectBoardSynthesisProposalRepository";
import { ProjectStoreProjectBoardSynthesisRunRepository } from "./projectStore/projectBoardSynthesisRunRepository";
import { ProjectStoreOrchestrationRepository } from "./projectStore/orchestrationRepository";
import { ProjectStoreAutomationRepository } from "./projectStore/automationRepository";
import { ProjectStoreWorkflowRecordingRepository } from "./projectStore/workflowRecordingRepository";
import {
  callableWorkflowTaskFinishState,
  callableWorkflowTaskProgressSnapshot,
  callableWorkflowTaskUsageSnapshot,
  compareWorkflowAgentFolders,
  compareWorkflowAgentThreads,
  mapWorkflowAgentFolderRow,
  mapWorkflowAgentThreadRow,
  type WorkflowAgentFolderRow,
  type WorkflowAgentThreadRow,
} from "./projectStoreWorkflowMappers";
import { ProjectStoreCallableWorkflowTaskRepository } from "./projectStore/callableWorkflowTaskRepository";
import {
  assertValidMutationWorkspaceLease,
  materializeSymphonyChildLaunchContractBundleForRun,
} from "../shared/symphonyFineGrainedContracts";
import {
  releaseSymphonyMutationWorkspaceLease,
} from "./symphonyMutationWorkspaceLeaseService";
import {
  compactSubagentCapacityLeasePreview,
  compactSubagentMailboxEventForPreview,
  latestSubagentMaturityEvidence,
  passedSubagentMaturityEvidenceCount,
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
} from "./projectStoreSubagentMappers";
import { resolveSubagentParentStopWaitBarrier } from "./subagents/subagentParentStopWaitBarrier";
import { resolveSubagentParentControlBarrierReconciliation } from "./subagents/subagentParentControlBarrierReconciliation";
import { ProjectStoreContextUsageRepository } from "./projectStore/contextUsageRepository";
import { ProjectStorePermissionRepository } from "./projectStore/permissionRepository";
import {
  DURABLE_PLAN_SOURCE_AUTHORITY_REASON,
  hashProjectBoardSourceContent,
  projectBoardSourceIncludedInSynthesis,
  projectBoardSourceKey,
} from "./project-board/projectBoardSourceIdentity";
import {
  projectBoardPlanDisplayTitle,
  projectBoardPlanTitleIsGeneric,
} from "../shared/projectBoardPlanIdentity";
import type { ProjectBoardArtifactProjection } from "./project-board/projectBoardArtifactImport";
import {
  evaluateProjectBoardCardProof,
  mapProjectBoardEventRow,
  normalizeCardTextList,
  objectiveProvenanceJson,
  normalizeProjectBoardCardRunFeedback,
  normalizeProjectBoardCardRunFeedbackSource,
  normalizeProjectBoardCardTestPlan,
  normalizeProjectBoardClarificationAnswers,
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
  normalizeProjectBoardClarificationSuggestions,
  normalizeProjectBoardProofFollowUpSuggestion,
  normalizeProjectBoardSynthesisClarificationFields,
  normalizeProjectBoardSynthesisRunEvent,
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
  projectBoardCardMatchesRef,
  projectBoardCardMissingRequiredUxMockGate,
  projectBoardCardRowIsClosedDone,
  projectBoardCardIsTerminalAuditCandidate,
  projectBoardCandidateStatusForSynthesisUpdate,
  projectBoardChangedClarificationAnswer,
  projectBoardClarificationDecisionsEquivalent,
  projectBoardDescriptionWithClarificationAnswer,
  projectBoardDecisionImpactEventMetadata,
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
  projectBoardHasImplementationEvidence,
  projectBoardClaimBlockedTaskIdsForRows,
  projectBoardOpenUxMockGateBlocker,
  projectBoardQuestionMatchesAnyVariant,
  projectBoardProofOfWorkForRun,
  projectBoardProofObject,
  projectBoardPromptList,
  projectBoardPromptSummary,
  projectBoardProofReviewFromDraft,
  projectBoardRuntimeBudgetTrustworthyTaskActions,
  projectBoardRunStageFromArtifactProgress,
  projectBoardRunStageFromManifest,
  projectBoardRunStatusFromProposalManifest,
  projectBoardMissingProofItems,
  projectBoardClaimSummaryFromEvents,
  projectBoardClosedParentForRunFollowUp,
  projectBoardDependencyArtifactKey,
  projectBoardStatusForTask,
  projectBoardSourceInputFromExisting,
  projectBoardTestPolicyRequiresProofSpec,
  projectBoardUnansweredClarificationQuestions,
  projectBoardUxMockGateSatisfied,
  projectBoardPlanningStableJson,
  projectBoardSourceImpactDurablePlanPrimary,
  projectBoardSourceImpactIncluded,
  projectBoardResolveInside,
  resolveProjectBoardTaskBlockers,
  sourceRefArtifactStrings,
  stringsFromProjectBoardUnknownArray,
  type ProjectBoardCardStoreRow,
  type ProjectBoardEventStoreRow,
  type ProjectBoardExecutionArtifactStoreRow,
  type ProjectBoardStoreRow,
  type ProjectBoardSynthesisRunStoreRow,
  type ProjectBoardRunFollowUpCandidate,
  type ProjectBoardCardDependencyExecutionContext,
  type ProjectBoardCardDependencyExecutionEntry,
  type ProjectBoardDependencyArtifactImport,
  type ProjectBoardDependencyArtifactImportResult,
} from "./projectStore/projectBoardMappers";
export { projectBoardDependencyArtifactPromptSection } from "./projectStore/projectBoardMappers";
export type { ProjectBoardDependencyArtifactImport, ProjectBoardDependencyArtifactImportResult } from "./projectStore/projectBoardMappers";
export type { RunRecord } from "./projectStore/runMappers";
import {
  AMBIENT_LEGACY_MODEL_IDS,
} from "../shared/ambientModels";
import { workflowGraphFromSpec } from "../shared/workflowAgentGraph";
import type { SchedulerRuntimeState } from "./orchestrationScheduler";
import {
  INTERRUPTED_RUN_MESSAGE,
  interruptedMessageContent,
  interruptedMetadata,
  isRecoverableMessageMetadata,
} from "./runRecovery";
import {
  RESTART_INTERRUPTED_LOCAL_TASK_ERROR,
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
} from "./project-board/projectBoardTaskTools";
import { type ProjectBoardSynthesisCardInput, type ProjectBoardSynthesisDraft } from "./project-board/projectBoardSynthesis";
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
} from "../shared/projectBoardDecisionImpact";
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
} from "./project-board/projectBoardClarificationDefaultProvider";
import type { ProjectBoardProofSuggestion } from "./project-board/projectBoardProofSuggestionProvider";
import { extractPlannerPlanArtifactFields } from "./plannerMode";
import { LEGACY_PROJECT_STATE_DIR, prepareWorkspaceAuthorityState } from "./workspaceAuthorityState";
import { parseJsonArray, parseJsonObject, parseMetadata, stringFromRecord } from "./projectStoreJson";
import { ProjectStoreSettingsRepository } from "./projectStore/settingsRepository";

import {
  PROJECT_STATE_DIR,
  compactPlannerPlanKickoffAnswer,
  defaultOrchestrationProjectPath,
  defaultProjectArtifactWorkspacePath,
  durablePlanSourceExcerptForBoardSource,
  emptyToNull,
  plannerPlanArtifactSourceContent,
  projectBoardCanAdoptPlannerBoardTitle,
  projectBoardSourceInputExcludedByDurablePlan,
  projectBoardSourceLikeArtifactId,
  projectBoardSourceLikeId,
  projectBoardSourceLikeMessageId,
  projectBoardSourceLikeSourceKey,
  projectBoardSourceLikeThreadId,
  readManagedBoardPlanContent,
  repairProjectBoardSynthesisCardsWithExcludedSourceRefs,
  symphonyWorkflowRecipePlaybook,
  symphonyWorkflowRecipeTitle,
  symphonyWorkflowRecipeTranscript,
} from "./projectStoreFacadeHelpers";
import type {
  ContextUsageSnapshotInput,
  CreateThreadOptions,
  OrchestrationTaskUpdateInput,
  PermissionAuditInput,
  ProjectBoardCardRow,
  ProjectBoardEventInput,
  ProjectBoardEventRow,
  ProjectBoardExecutionArtifactRow,
  ProjectBoardProofReviewContext,
  ProjectBoardRow,
  ProjectBoardSourceClassificationInput,
  ProjectBoardSourceInput,
  ProjectBoardSynthesisApplyOptions,
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
  ProjectBoardProofReviewContext,
  ProjectBoardSourceClassificationInput,
  ProjectBoardSourceInput,
  ThreadWorktreeInput,
} from "./projectStoreFacadeHelpers";
export type { PlannerPlanArtifactInput } from "./projectStore/plannerArtifactRepository";

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
    this.automations().ensureDefaultAutomationFolder();
    this.threads().ensureDefaultThread(this.threadCreationDefaults());
    if (options.recoverActiveRuns ?? false) this.interruptActiveRuns();
    if (options.recoverOrchestrationRuns ?? false) this.stallActiveOrchestrationRuns();
    this.repairPlannerPlanQuestionBlocks();
    this.messages().repairThreadPreviews();
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
    let row = this.projectBoards().findActiveProjectBoardRow(projectPath, sourceThreadId);
    if (row && this.reconcileCompactPlannerPlanDraftBoard(row)) {
      row = this.projectBoards().getProjectBoardRow(row.id);
    }
    return row ? this.mapProjectBoard(row) : undefined;
  }

  getProjectBoard(boardId: string): ProjectBoardSummary | undefined {
    const row = this.projectBoards().getProjectBoardRow(boardId);
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
      this.projectBoardCardMutations().materializeProjectBoardPulledHandoffFollowUps(boardId, projection.runArtifacts);
    });

    transaction();
    const row = this.requireDb().prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardRow | undefined;
    if (!row) throw new Error(`Project board not found after applying artifact projection: ${boardId}`);
    return this.mapProjectBoard(row);
  }

  createProjectBoard(input: { title?: string; summary?: string; replaceActive?: boolean; sourceThreadId?: string } = {}): ProjectBoardSummary {
    return this.projectBoardLifecycle().createProjectBoard(input);
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
    return this.projectBoardSynthesisApply().applyProjectBoardSynthesis(boardId, synthesis, options);
  }

  createProjectBoardSynthesisProposal(input: {
    boardId: string;
    synthesis: ProjectBoardSynthesisDraft;
    reviewReport?: ProjectBoardPmReviewReport;
    model?: string;
    durationMs?: number;
  }): ProjectBoardSynthesisProposal {
    return this.projectBoardSynthesisProposals().createProjectBoardSynthesisProposal(input);
  }

  updateProjectBoardSynthesisProposal(input: {
    proposalId: string;
    synthesis: ProjectBoardSynthesisDraft;
    reviewReport?: ProjectBoardPmReviewReport;
    model?: string;
    durationMs?: number;
  }): ProjectBoardSynthesisProposal {
    return this.projectBoardSynthesisProposals().updateProjectBoardSynthesisProposal(input);
  }

  getProjectBoardSynthesisProposal(proposalId: string): ProjectBoardSynthesisProposal | undefined {
    return this.projectBoardSynthesisProposals().getProjectBoardSynthesisProposal(proposalId);
  }

  getLatestPendingProjectBoardSynthesisProposal(boardId: string): ProjectBoardSynthesisProposal | undefined {
    return this.projectBoardSynthesisProposals().getLatestPendingProjectBoardSynthesisProposal(boardId);
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
    return this.projectBoardSynthesisRuns().createProjectBoardSynthesisRun(input);
  }

  getProjectBoardSynthesisRun(runId: string): ProjectBoardSynthesisRun | undefined {
    return this.projectBoardSynthesisRuns().getProjectBoardSynthesisRun(runId);
  }

  getRunningProjectBoardSynthesisRun(
    boardId: string,
    input: { excludeStages?: ProjectBoardSynthesisRunStage[] } = {},
  ): ProjectBoardSynthesisRun | undefined {
    return this.projectBoardSynthesisRuns().getRunningProjectBoardSynthesisRun(boardId, input);
  }

  failStaleProjectBoardSynthesisRuns(input: { boardId: string; staleBefore: string; reason: string }): ProjectBoardSynthesisRun[] {
    return this.projectBoardSynthesisRuns().failStaleProjectBoardSynthesisRuns(input);
  }

  markProjectBoardSynthesisRunStalled(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    return this.projectBoardSynthesisRuns().markProjectBoardSynthesisRunStalled(input);
  }

  requestProjectBoardSynthesisRunPause(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    return this.projectBoardSynthesisRuns().requestProjectBoardSynthesisRunPause(input);
  }

  markProjectBoardSynthesisRunPaused(input: {
    boardId: string;
    runId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): ProjectBoardSynthesisRun {
    return this.projectBoardSynthesisRuns().markProjectBoardSynthesisRunPaused(input);
  }

  abandonProjectBoardSynthesisRunPause(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    return this.projectBoardSynthesisRuns().abandonProjectBoardSynthesisRunPause(input);
  }

  supersedeProjectBoardSynthesisCardsForStartFresh(input: { boardId: string; runId: string; reason?: string }): {
    supersededDraftCardIds: string[];
    demotedPreservedCardIds: string[];
    preservedCardIds: string[];
  } {
    return this.projectBoardSynthesisApply().supersedeProjectBoardSynthesisCardsForStartFresh(input);
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
    return this.projectBoardSynthesisRuns().recordProjectBoardSynthesisRunEvent(runId, input);
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
    return this.projectBoardSynthesisRuns().updateProjectBoardSynthesisRunProgress(runId, input);
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
    return this.projectBoardSynthesisRuns().tryUpdateProjectBoardSynthesisRunProgress(runId, input);
  }

  recordProjectBoardSynthesisRunProgressiveRecords(
    runId: string,
    records: ProjectBoardSynthesisRunProgressiveRecord[],
    input: { title?: string; summary?: string } = {},
  ): ProjectBoardSynthesisRun {
    return this.projectBoardSynthesisRuns().recordProjectBoardSynthesisRunProgressiveRecords(runId, records, input);
  }

  recordProjectBoardPlanningSnapshotForRun(runId: string, kind: ProjectBoardPlanningSnapshotKind = "manual"): ProjectBoardPlanningSnapshot | undefined {
    return this.projectBoardPlanningSnapshots().recordProjectBoardPlanningSnapshotForRun(runId, kind);
  }

  private appendProjectBoardPlanningSnapshotForRun(runId: string, kind: ProjectBoardPlanningSnapshotKind): ProjectBoardPlanningSnapshot | undefined {
    return this.projectBoardPlanningSnapshots().appendProjectBoardPlanningSnapshotForRun(runId, kind);
  }

  private latestStableProjectBoardPlanningSnapshot(boardId: string): { runId: string; snapshot: ProjectBoardPlanningSnapshot } | undefined {
    return this.projectBoardPlanningSnapshots().latestStableProjectBoardPlanningSnapshot(boardId);
  }

  answerProjectBoardSynthesisProposalQuestion(input: {
    proposalId: string;
    questionIndex: number;
    answer: string;
  }): ProjectBoardSynthesisProposal {
    return this.projectBoardSynthesisProposals().answerProjectBoardSynthesisProposalQuestion(input);
  }

  reviewProjectBoardSynthesisProposalCard(input: {
    proposalId: string;
    sourceId: string;
    reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus;
    reason?: string;
    mergeTargetCardId?: string;
  }): ProjectBoardSynthesisProposal {
    return this.projectBoardSynthesisProposals().reviewProjectBoardSynthesisProposalCard(input);
  }

  applyProjectBoardSynthesisProposal(input: { proposalId: string; replaceExistingDraft?: boolean }): ProjectBoardSummary {
    return this.projectBoardSynthesisApply().applyProjectBoardSynthesisProposal(input);
  }

  updateProjectBoardStatus(boardId: string, status: ProjectBoardStatus): ProjectBoardSummary {
    return this.projectBoardLifecycle().updateProjectBoardStatus(boardId, status);
  }

  resetProjectBoard(boardId: string): void {
    this.projectBoardLifecycle().resetProjectBoard(boardId);
  }

  startProjectBoardRevision(input: { boardId: string; reason?: string }): ProjectBoardSummary {
    return this.projectBoardLifecycle().startProjectBoardRevision(input);
  }

  cancelProjectBoardRevision(boardId: string): ProjectBoardSummary {
    return this.projectBoardLifecycle().cancelProjectBoardRevision(boardId);
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
    return this.projectBoards().getProjectBoardCard(cardId);
  }

  private tryGetProjectBoardCard(cardId: string): ProjectBoardCard | undefined {
    return this.projectBoards().tryGetProjectBoardCard(cardId);
  }

  getProjectBoardCardForOrchestrationTask(taskId: string): ProjectBoardCard | undefined {
    return this.projectBoards().getProjectBoardCardForOrchestrationTask(taskId);
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
    return this.projectBoards().getProjectBoardCardForExecutionThread(threadId);
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
    const card = this.getProjectBoardCardForOrchestrationTask(run.taskId);
    if (!card) return undefined;
    const draft = evaluateProjectBoardCardProof(card, run);
    const scopedRun = {
      ...run,
      proofOfWork: projectBoardProofOfWorkForRun(run.proofOfWork, run, card),
    };
    return {
      card,
      board: this.getProjectBoard(card.boardId),
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

  isProjectBoardProofReviewRunCurrent(runId: string, requireCurrentReview = false): boolean {
    return this.projectBoardCardMutations().isProjectBoardProofReviewRunCurrent(runId, requireCurrentReview);
  }

  applyProjectBoardCardProofReview(input: {
    runId: string;
    review: ProjectBoardCardProofReview;
    requireCurrentReview?: boolean;
    allowStaleRun?: boolean;
  }): ProjectBoardCard | undefined {
    return this.projectBoardCardMutations().applyProjectBoardCardProofReview(input);
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
    return this.projectBoardCardMutations().resolveProjectBoardProofDecision(input);
  }

  async resolveProjectBoardDeliverableIntegration(input: {
    boardId: string;
    runId: string;
    action: ProjectBoardDeliverableIntegrationAction;
    reason?: string;
  }): Promise<void> {
    return this.projectBoardDeliverableIntegrations().resolveProjectBoardDeliverableIntegration(input);
  }

  resolveProjectBoardSplitDecision(input: { cardId: string; action: ProjectBoardSplitDecisionAction; reason?: string }): ProjectBoardCard {
    return this.projectBoardCardMutations().resolveProjectBoardSplitDecision(input);
  }

  ensureProjectBoardCardExecutionThreadForTask(input: { taskId: string; workspacePath: string }): ThreadSummary | undefined {
    return this.projectBoardCardExecutionSessions().ensureProjectBoardCardExecutionThreadForTask(input);
  }

  copyProjectBoardSessionToThread(input: CopyProjectBoardSessionToThreadInput): ThreadSummary {
    return this.projectBoardSessionCopies().copyProjectBoardSessionToThread(input);
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
    return this.projectBoardExecutionReadiness().recordProjectBoardExecutionReadinessBlocker(input);
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
    return this.projectBoardWorkflows().recordProjectBoardWorkflowCreated(input);
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
    return this.projectBoardWorkflows().recordProjectBoardWorkflowRepair(input);
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
    return this.projectBoardWorkflows().recordProjectBoardWorkflowSettingsUpdated(input);
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
    return this.projectBoardWorkflows().recordProjectBoardWorkflowRawUpdated(input);
  }

  resolveProjectBoardWorkflowImpact(input: {
    boardId: string;
    action: ResolveOrchestrationWorkflowImpactAction;
    runIds: string[];
    workflowPath?: string;
    workflowHash?: string;
    createdAt?: string;
  }): { clearedRunIds: string[]; skippedRuns: { runId: string; reason: string }[] } {
    return this.projectBoardWorkflows().resolveProjectBoardWorkflowImpact(input);
  }

  approveProjectBoardCard(cardId: string): ProjectBoardCard {
    return this.projectBoardCardMutations().approveProjectBoardCard(cardId);
  }

  createReadyProjectBoardTasks(boardId: string): ProjectBoardCard[] {
    return this.projectBoardCardMutations().createReadyProjectBoardTasks(boardId);
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
    return this.projectBoardCardMutations().splitProjectBoardCard(cardId);
  }

  createProjectBoardManualCard(input: { boardId: string; title?: string; description?: string }): ProjectBoardCard {
    return this.projectBoardCardMutations().createManualCard(input);
  }

  attachLocalTaskToProjectBoard(input: { taskId: string; mode: "attach" | "evidence" }): ProjectBoardCard {
    return this.projectBoardCardMutations().attachLocalTaskToProjectBoard(input);
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
    return this.projectBoardCardMutations().updateCard(input);
  }

  updateProjectBoardCardCandidateStatus(
    cardId: string,
    candidateStatus: ProjectBoardCardCandidateStatus,
    options: { actor?: "user" | "system"; reason?: string; relatedCardId?: string } = {},
  ): ProjectBoardCard {
    return this.projectBoardCardMutations().updateCardCandidateStatus(cardId, candidateStatus, options);
  }

  resolveProjectBoardCardPiUpdate(input: { cardId: string; action: "apply" | "ignore" }): ProjectBoardCard {
    return this.projectBoardCardMutations().resolvePiUpdate(input);
  }

  addProjectBoardCardRunFeedback(input: AddProjectBoardCardRunFeedbackInput): ProjectBoardCard {
    return this.projectBoardCardMutations().addRunFeedback(input);
  }

  applyProjectBoardDecisionImpactFeedback(input: ApplyProjectBoardDecisionImpactFeedbackInput): ProjectBoardCard {
    return this.projectBoardCardMutations().applyDecisionImpactFeedback(input);
  }

  refreshProjectBoardDecisionDrafts(input: RefreshProjectBoardDecisionDraftsInput): ProjectBoardCard {
    return this.projectBoardCardMutations().refreshDecisionDrafts(input);
  }

  stageProjectBoardSourceDraftPiUpdates(input: StageProjectBoardSourceDraftPiUpdatesInput): ProjectBoardSummary {
    return this.projectBoardSources().stageProjectBoardSourceDraftPiUpdates(input);
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
    return this.projectBoardSources().refreshProjectBoardSourceDrafts(input);
  }

  applyProjectBoardSourceImpactFeedback(input: ApplyProjectBoardSourceImpactFeedbackInput): ProjectBoardSummary {
    return this.projectBoardSources().applyProjectBoardSourceImpactFeedback(input);
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
    return this.projectBoardSources().replaceProjectBoardSources(boardId, sources);
  }

  getProjectBoardSource(sourceId: string): ProjectBoardSource {
    return this.projectBoardSources().getProjectBoardSource(sourceId);
  }

  updateProjectBoardSource(input: { sourceId: string; kind: ProjectBoardSourceKind; includeInSynthesis?: boolean }): ProjectBoardSource {
    return this.projectBoardSources().updateProjectBoardSource(input);
  }

  applyProjectBoardSourceClassifications(boardId: string, inputs: ProjectBoardSourceClassificationInput[]): ProjectBoardSource[] {
    return this.projectBoardSources().applyProjectBoardSourceClassifications(boardId, inputs);
  }

  ensureProjectBoardQuestions(boardId: string): ProjectBoardQuestion[] {
    return this.projectBoardQuestions().ensureProjectBoardQuestions(boardId);
  }

  getProjectBoardQuestion(questionId: string): ProjectBoardQuestion {
    return this.projectBoardQuestions().getProjectBoardQuestion(questionId);
  }

  answerProjectBoardQuestion(questionId: string, answer: string): ProjectBoardQuestion {
    return this.projectBoardQuestions().answerProjectBoardQuestion(questionId, answer);
  }

  applyProjectBoardKickoffDefaultSuggestions(input: ApplyProjectBoardKickoffDefaultSuggestionsInput): ProjectBoardSummary {
    return this.projectBoardQuestions().applyProjectBoardKickoffDefaultSuggestions(input);
  }

  finalizeProjectBoardKickoff(boardId: string): ProjectBoardSummary {
    return this.projectBoardLifecycle().finalizeProjectBoardKickoff(boardId);
  }

  buildActiveProjectBoardCharterProjectSummary(
    boardId: string,
    generatedAt = new Date().toISOString(),
  ): ProjectBoardCharterProjectSummary {
    return this.projectBoardLifecycle().buildActiveProjectBoardCharterProjectSummary(boardId, generatedAt);
  }

  updateProjectBoardCharterProjectSummary(input: {
    boardId: string;
    summary: ProjectBoardCharterProjectSummary;
    title?: string;
    eventSummary?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): ProjectBoardSummary {
    return this.projectBoardLifecycle().updateProjectBoardCharterProjectSummary(input);
  }

  getProjectBoardCharter(charterId: string): ProjectBoardCharter {
    return this.projectBoards().getProjectBoardCharter(charterId);
  }

  getAutomationAutoDispatchEnabled(): boolean {
    return this.settings().getAutomationAutoDispatchEnabled();
  }

  setAutomationAutoDispatchEnabled(enabled: boolean): void {
    this.settings().setAutomationAutoDispatchEnabled(enabled);
  }

  getLastActiveThreadId(): string | undefined {
    return this.threads().getLastActiveThreadId(this.settings());
  }

  setLastActiveThreadId(threadId: string): void {
    this.threads().setLastActiveThreadId(this.settings(), threadId);
  }

  listThreads(): ThreadSummary[] {
    return this.threads().listThreads();
  }

  private listThreadsForSubagentStateInspection(): ThreadSummary[] {
    return this.threads().listThreadsForStateInspection();
  }

  findReusableEmptyThread(): ThreadSummary | undefined {
    return this.threads().findReusableEmptyThread();
  }

  getThread(threadId: string): ThreadSummary {
    return this.threads().getThread(threadId);
  }

  getThreadGoal(threadId: string): ThreadGoal | undefined {
    return this.threadGoals().getThreadGoal(threadId);
  }

  setThreadGoal(input: ThreadGoalSetInput): ThreadGoal {
    return this.threadGoals().setThreadGoal(input);
  }

  createThreadGoalIfAbsent(input: ThreadGoalCreateInput): ThreadGoal {
    return this.threadGoals().createThreadGoalIfAbsent(input);
  }

  clearThreadGoal(threadId: string, expectedGoalId?: string): ThreadGoal | undefined {
    return this.threadGoals().clearThreadGoal(threadId, expectedGoalId);
  }

  accountThreadGoalUsage(input: ThreadGoalAccountInput): ThreadGoal | undefined {
    return this.threadGoals().accountThreadGoalUsage(input);
  }

  markThreadGoalStatus(
    threadId: string,
    status: ThreadGoalStatus,
    options: { expectedGoalId?: string; statusReason?: string | null } = {},
  ): ThreadGoal {
    return this.threadGoals().markThreadGoalStatus(threadId, status, options);
  }

  private tryGetThread(threadId: string): ThreadSummary | undefined {
    return this.threads().tryGetThread(threadId);
  }

  createThread(title = "New chat", workspacePath = this.getWorkspace().path, options: CreateThreadOptions = {}): ThreadSummary {
    return this.threads().createThread(title, workspacePath, options, this.threadCreationDefaults());
  }

  private threadCreationDefaults(): CreateProjectStoreThreadDefaults {
    const settings = this.getDefaultSettings();
    return {
      permissionMode: settings.permissionMode,
      collaborationMode: settings.collaborationMode,
      model: settings.model,
      thinkingLevel: settings.thinkingLevel,
      memoryDefaultThreadEnabled: settings.memory.defaultThreadEnabled,
    };
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
    const childOrder = input.childOrder ?? this.threads().nextSubagentChildOrder(input.parentThreadId);
    const roleProfileSnapshot = input.roleProfileSnapshot ?? getDefaultSubagentRoleProfile(input.roleId as SubagentRoleId);
    if (roleProfileSnapshot.id !== input.roleId) {
      throw new Error(`Sub-agent role profile snapshot ${roleProfileSnapshot.id} does not match requested role ${input.roleId}.`);
    }
    if (input.effectiveRoleSnapshot && !isSubagentEffectiveRoleSnapshot(input.effectiveRoleSnapshot, input.roleId)) {
      throw new Error(`Sub-agent effective role snapshot does not match requested role ${input.roleId}.`);
    }
    let childThread: ThreadSummary | undefined;
    const insertRun = this.requireDb().transaction(() => {
      this.assertSubagentCanonicalTaskPathAvailableForSpawn({
        parentThreadId: input.parentThreadId,
        parentRunId: input.parentRunId,
        canonicalTaskPath: input.canonicalTaskPath,
      });
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
      const symphonyLaunchContracts = input.symphonyLaunchContracts
        ? materializeSymphonyChildLaunchContractBundleForRun(input.symphonyLaunchContracts, {
          parentThreadId: input.parentThreadId,
          parentRunId: input.parentRunId,
          roleId: input.roleId,
          childRunId,
        })
        : undefined;
      const symphonyMutationWorkspaceLease = input.symphonyMutationWorkspaceLease
        ? assertValidMutationWorkspaceLease({
          ...input.symphonyMutationWorkspaceLease,
          parentThreadId: input.parentThreadId,
          childThreadId: childThread.id,
          childRunId,
        })
        : undefined;

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

      const run = this.subagentRuns().createReservedSubagentRun({
        runId: childRunId,
        parentThreadId: input.parentThreadId,
        parentRunId: input.parentRunId,
        parentMessageId: input.parentMessageId,
        childThreadId: childThread.id,
        canonicalTaskPath: input.canonicalTaskPath,
        roleId: input.roleId,
        roleProfileSnapshot,
        effectiveRoleSnapshot: input.effectiveRoleSnapshot,
        dependencyMode: input.dependencyMode,
        featureFlagSnapshot: input.featureFlagSnapshot,
        modelRuntimeSnapshot: input.modelRuntimeSnapshot,
        capacityLeaseSnapshot,
        symphonyLaunchContracts,
        symphonyMutationWorkspaceLease,
        createdAt: now,
      });
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
          symphonyLaunch: symphonyLaunchContracts
            ? {
              pattern: symphonyLaunchContracts.patternSelection.pattern,
              selectionId: symphonyLaunchContracts.patternSelection.selectionId,
              policyId: symphonyLaunchContracts.childLaunchPolicySnapshot.policyId,
            }
            : undefined,
        },
        createdAt: now,
      });
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
    return this.subagentRuns().getSubagentRun(runId);
  }

  listSubagentRunsForParentThread(parentThreadId: string): SubagentRunSummary[] {
    return this.subagentRuns().listSubagentRunsForParentThread(parentThreadId);
  }

  listAllSubagentRuns(): SubagentRunSummary[] {
    return this.subagentRuns().listAllSubagentRuns();
  }

  assertSubagentCanonicalTaskPathAvailableForSpawn(input: {
    parentThreadId: string;
    parentRunId: string;
    canonicalTaskPath: string;
  }): void {
    const blocker = this.findUnresolvedRequiredSubagentCanonicalPathBlocker(input);
    if (!blocker) return;
    throw new Error(
      [
        `Sub-agent canonical task path ${input.canonicalTaskPath} is already owned by child run ${blocker.run.id}.`,
        `Unresolved required wait barrier ${blocker.barrier.id} still references that child.`,
        "Use the existing child run, wait for the barrier, or resolve the barrier before spawning replacement child work.",
      ].join(" "),
    );
  }

  upsertSubagentBatchJobPlan(
    plan: SubagentBatchJobPlan,
    options: { featureFlagSnapshot: AmbientFeatureFlagSnapshot },
  ): SubagentBatchJobRecord {
    if (!isAmbientSubagentsEnabled(options.featureFlagSnapshot)) {
      throw new Error("Sub-agent batch jobs are disabled while ambient.subagents is off.");
    }
    this.getThread(plan.parentThreadId);
    return this.subagentBatches().upsertSubagentBatchJobPlan(plan);
  }

  getSubagentBatchJob(jobId: string): SubagentBatchJobRecord | undefined {
    return this.subagentBatches().getSubagentBatchJob(jobId);
  }

  listSubagentBatchJobsForParentRun(parentRunId: string): SubagentBatchJobRecord[] {
    return this.subagentBatches().listSubagentBatchJobsForParentRun(parentRunId);
  }

  listSubagentBatchResultReports(jobId: string): SubagentBatchResultReport[] {
    return this.subagentBatches().listSubagentBatchResultReports(jobId);
  }

  applySubagentBatchResultReport(report: SubagentBatchResultReport): SubagentBatchReportApplyResult {
    return this.subagentBatches().applySubagentBatchResultReport(report);
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
    const run = input.runId ? this.getSubagentRun(input.runId) : undefined;
    return this.subagentMaturityEvidence().recordSubagentMaturityEvidence({
      kind: input.kind,
      status: input.status,
      evidenceKey: input.evidenceKey,
      run: run ? { id: run.id, parentRunId: run.parentRunId } : undefined,
      parentRunId: input.parentRunId,
      artifactPath: input.artifactPath,
      reviewer: input.reviewer,
      notes: input.notes,
      details: input.details,
      createdAt: input.createdAt,
    });
  }

  getSubagentMaturityEvidence(id: string): SubagentMaturityEvidence {
    return this.subagentMaturityEvidence().getSubagentMaturityEvidence(id);
  }

  listSubagentMaturityEvidence(kind?: SubagentMaturityEvidenceKind): SubagentMaturityEvidence[] {
    return this.subagentMaturityEvidence().listSubagentMaturityEvidence(kind);
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
    for (const decision of plan.decisions) {
      if (decision.action !== "eligible_for_cleanup") continue;
      if (!this.threads().archiveSubagentChildThread(decision.childThreadId, now)) {
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
      .map((barrier) => resolveSubagentParentStopWaitBarrier({
        store: this,
        waitBarrier: barrier,
        parentThreadId: input.parentThreadId,
        parentRunId: input.parentRunId,
        reason: input.reason,
        featureFlagSnapshot: input.featureFlagSnapshot,
        subagentsDisabledSafetyCascade,
        childStatuses: childStatuses.filter((child) => barrier.childRunIds.includes(child.childRunId)),
        now,
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
    return this.subagentRuns().listSubagentRunEvents(runId);
  }

  listSubagentSpawnEdges(): SubagentSpawnEdgeSummary[] {
    return this.subagentRuns().listSubagentSpawnEdges();
  }

  appendSubagentRunEvent(runId: string, input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string }): SubagentRunEventSummary {
    this.getSubagentRun(runId);
    return this.subagentRuns().appendSubagentRunEvent(runId, input);
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
    return this.subagentMailboxes().appendSubagentMailboxEvent(runId, input);
  }

  listSubagentMailboxEvents(runId: string): SubagentMailboxEventSummary[] {
    this.getSubagentRun(runId);
    return this.subagentMailboxes().listSubagentMailboxEvents(runId);
  }

  getSubagentMailboxEvent(id: string): SubagentMailboxEventSummary {
    return this.subagentMailboxes().getSubagentMailboxEvent(id);
  }

  updateSubagentMailboxEventDeliveryState(
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentMailboxEventSummary {
    return this.subagentMailboxes().updateSubagentMailboxEventDeliveryState(id, deliveryState, options);
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
    return this.subagentParentMailboxes().appendSubagentParentMailboxEvent(input);
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
    return this.subagentParentMailboxes().updateSubagentParentMailboxPayload({
      id: latest.id,
      parentMessageId,
      payload: draft.payload,
      idempotencyKey: draft.idempotencyKey,
      updatedAt: now,
    });
  }

  listSubagentParentMailboxEventsForParentRun(parentRunId: string): SubagentParentMailboxEventSummary[] {
    return this.subagentParentMailboxes().listSubagentParentMailboxEventsForParentRun(parentRunId);
  }

  listSubagentParentMailboxEventsForParentThread(parentThreadId: string): SubagentParentMailboxEventSummary[] {
    return this.subagentParentMailboxes().listSubagentParentMailboxEventsForParentThread(parentThreadId);
  }

  getSubagentParentMailboxEvent(id: string): SubagentParentMailboxEventSummary {
    return this.subagentParentMailboxes().getSubagentParentMailboxEvent(id);
  }

  updateSubagentParentMailboxEventDeliveryState(
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentParentMailboxEventSummary {
    return this.subagentParentMailboxes().updateSubagentParentMailboxEventDeliveryState(id, deliveryState, options);
  }

  recordSubagentPromptSnapshot(runId: string, input: { prompt: string; snapshot: unknown; createdAt?: string }): SubagentPromptSnapshotSummary {
    this.getSubagentRun(runId);
    return this.subagentSnapshots().recordSubagentPromptSnapshot(runId, input);
  }

  listSubagentPromptSnapshots(runId: string): SubagentPromptSnapshotSummary[] {
    this.getSubagentRun(runId);
    return this.subagentSnapshots().listSubagentPromptSnapshots(runId);
  }

  recordSubagentToolScopeSnapshot(runId: string, input: { scope: SubagentToolScopeSnapshotSummary["scope"]; resolverInputs?: unknown; createdAt?: string }): SubagentToolScopeSnapshotSummary {
    this.getSubagentRun(runId);
    return this.subagentSnapshots().recordSubagentToolScopeSnapshot(runId, input);
  }

  listSubagentToolScopeSnapshots(runId: string): SubagentToolScopeSnapshotSummary[] {
    this.getSubagentRun(runId);
    return this.subagentSnapshots().listSubagentToolScopeSnapshots(runId);
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
    return this.subagentWaitBarriers().createSubagentWaitBarrier({
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      childRunIds,
      dependencyMode: input.dependencyMode,
      failurePolicy: input.failurePolicy,
      quorumThreshold: input.quorumThreshold,
      timeoutMs: input.timeoutMs,
      createdAt: input.createdAt,
    });
  }

  getSubagentWaitBarrier(id: string): SubagentWaitBarrierSummary {
    return this.subagentWaitBarriers().getSubagentWaitBarrier(id);
  }

  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[] {
    return this.subagentWaitBarriers().listSubagentWaitBarriersForParentRun(parentRunId);
  }

  listSubagentWaitBarriers(): SubagentWaitBarrierSummary[] {
    return this.subagentWaitBarriers().listSubagentWaitBarriers();
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
    const workflowRuns = this.workflowRuns().listWorkflowRunsForRestart();
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
          workflowRuns,
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
        const subagentRuns = this.subagentRuns();
        for (const runId of missingRunIds) {
          const run = runsById.get(runId);
          if (!run) continue;
          const edge = subagentSpawnEdgeRecordForRun(run, { now, createdAt: run.createdAt, depth: 1 });
          subagentRuns.insertSubagentSpawnEdge(edge);
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
          const edge = subagentSpawnEdgeRecordForRun(run, {
            now,
            createdAt: previousEdge?.createdAt ?? run.createdAt,
            depth: previousEdge?.depth ?? 1,
          });
          subagentRuns.replaceSubagentSpawnEdge(edge);
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
          subagentRuns.deleteSubagentSpawnEdgesForChild(runId);
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
    const recreatedBarrierIds: string[] = [];
    for (const runId of summary.repairedRunIds) {
      const run = this.getSubagentRun(runId);
      const needsReconciliation = this.markSubagentRunStatus(runId, "needs_attention", {
        now,
      });
      const existingWaitBarrierIds = summary.repairedBarrierIds.filter((barrierId) => {
        const barrier = this.getSubagentWaitBarrier(barrierId);
        return barrier.childRunIds.includes(runId);
      });
      const recreatedBarrier = this.recreateRequiredSubagentWaitBarrierIfMissing({
        run: needsReconciliation,
        existingWaitBarrierIds,
        now,
      });
      if (recreatedBarrier) recreatedBarrierIds.push(recreatedBarrier.id);
      const affectedWaitBarrierIds = [
        ...existingWaitBarrierIds,
        ...(recreatedBarrier ? [recreatedBarrier.id] : []),
      ];
      this.appendSubagentRunEvent(needsReconciliation.id, {
        type: "subagent.restart_reconciled",
        preview: {
          previousStatus: run.status,
          status: needsReconciliation.status,
          reason: "desktop_restart",
          parentBlockingState: "needs_reconciliation",
          waitBarrierIds: affectedWaitBarrierIds,
          ...(recreatedBarrier ? {
            recreatedWaitBarrier: {
              id: recreatedBarrier.id,
              dependencyMode: recreatedBarrier.dependencyMode,
              failurePolicy: recreatedBarrier.failurePolicy,
              timeoutMs: recreatedBarrier.timeoutMs,
            },
          } : {}),
        },
        createdAt: now,
      });
      this.appendSubagentLifecycleInterruptionParentMailboxEvent({
        run: needsReconciliation,
        previousStatus: run.status,
        source: "desktop_restart",
        reason: "Ambient restarted before this child run finished. The child needs explicit retry, cancellation, detachment, or user steering before the parent can continue.",
        waitBarrierIds: affectedWaitBarrierIds,
        idempotencyKey: "desktop_restart",
        createdAt: now,
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
      repairedBarrierIds: uniqueSubagentRepairIds([...summary.repairedBarrierIds, ...recreatedBarrierIds]),
      repairedParentControlBarrierIds: summary.repairedParentControlBarrierIds,
      diagnosticRunIds: summary.diagnosticRunIds,
    };
  }

  private recreateRequiredSubagentWaitBarrierIfMissing(input: {
    run: SubagentRunSummary;
    existingWaitBarrierIds: readonly string[];
    now: string;
  }): SubagentWaitBarrierSummary | undefined {
    if (input.run.dependencyMode !== "required") return undefined;
    if (input.existingWaitBarrierIds.length > 0) return undefined;
    const existing = this.listSubagentWaitBarriersForParentRun(input.run.parentRunId).find((barrier) =>
      barrier.parentThreadId === input.run.parentThreadId &&
      barrier.status === "waiting_on_children" &&
      barrier.childRunIds.includes(input.run.id) &&
      ["required_all", "required_any", "quorum"].includes(barrier.dependencyMode)
    );
    if (existing) return undefined;
    return this.createSubagentWaitBarrier({
      parentThreadId: input.run.parentThreadId,
      parentRunId: input.run.parentRunId,
      childRunIds: [input.run.id],
      dependencyMode: "required_all",
      failurePolicy: input.run.roleProfileSnapshot.guardPolicy.allowPartialResult ? "degrade_partial" : "ask_user",
      timeoutMs: input.run.roleProfileSnapshot.guardPolicy.maxRuntimeMs,
      createdAt: input.now,
    });
  }

  markSubagentParentControlBarrierReconciled(input: {
    waitBarrierId: string;
    source: "runtime_parent_abort" | "desktop_restart";
    now?: string;
  }): SubagentWaitBarrierSummary {
    const barrier = this.getSubagentWaitBarrier(input.waitBarrierId);
    const now = input.now ?? new Date().toISOString();
    return resolveSubagentParentControlBarrierReconciliation({
      store: this,
      waitBarrier: barrier,
      source: input.source,
      now,
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
    return this.subagentWaitBarriers().updateSubagentWaitBarrierStatus(id, status, options);
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
    const updated = this.subagentRuns().updateSubagentRunStatus({
      runId,
      status,
      startedAt,
      completedAt,
      updatedAt: now,
      ...(options.resultArtifact !== undefined ? { resultArtifact: options.resultArtifact } : {}),
    });
    this.threads().updateSubagentChildStatus(current.childThreadId, status, now);
    this.appendSubagentRunEventInternal(runId, { type: "subagent.status_changed", preview: { status }, createdAt: now });
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
    const releasedMutationLease = releaseSymphonyMutationWorkspaceLease(current.symphonyMutationWorkspaceLease, { now });
    const closed = this.subagentRuns().closeSubagentRun({
      runId,
      closedAt: now,
      capacityLeaseSnapshot: releasedCapacityLease,
      ...(releasedMutationLease ? { symphonyMutationWorkspaceLease: releasedMutationLease } : {}),
    });
    this.appendSubagentRunEventInternal(runId, {
      type: "subagent.closed",
      preview: {
        childThreadId: current.childThreadId,
        capacityLease: compactSubagentCapacityLeasePreview(releasedCapacityLease),
        ...(releasedMutationLease ? {
          mutationWorkspaceLease: {
            leaseId: releasedMutationLease.leaseId,
            kind: releasedMutationLease.kind,
            status: releasedMutationLease.status,
            rootPath: releasedMutationLease.rootPath,
          },
        } : {}),
      },
      createdAt: now,
    });
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

  updateSubagentRunMutationWorkspaceLease(runId: string, lease: unknown): SubagentRunSummary {
    const current = this.getSubagentRun(runId);
    const validated = assertValidMutationWorkspaceLease({
      ...(typeof lease === "object" && lease && !Array.isArray(lease) ? lease as Record<string, unknown> : {}),
      parentThreadId: current.parentThreadId,
      childThreadId: current.childThreadId,
      childRunId: current.id,
    });
    return this.subagentRuns().updateSubagentRunMutationWorkspaceLease(runId, validated);
  }

  createWorkflowRecordingThread(input: { goal?: string; workspacePath?: string } = {}): ThreadSummary {
    return this.workflowRecordings().createWorkflowRecordingThread(input);
  }

  startWorkflowRecording(threadId: string, input: { goal?: string } = {}): ThreadSummary {
    return this.workflowRecordings().startWorkflowRecording(threadId, input);
  }

  stopWorkflowRecording(threadId: string): WorkflowRecordingState {
    return this.workflowRecordings().stopWorkflowRecording(threadId);
  }

  confirmWorkflowRecordingReview(threadId: string): WorkflowRecordingState {
    return this.workflowRecordings().confirmWorkflowRecordingReview(threadId);
  }

  updateWorkflowRecordingReviewDraft(
    threadId: string,
    draft: WorkflowRecordingReviewDraftUpdate,
    options: { source?: WorkflowRecordingPlaybookDraft["source"] } = {},
  ): WorkflowRecordingState {
    return this.workflowRecordings().updateWorkflowRecordingReviewDraft(threadId, draft, options);
  }

  listWorkflowRecordingLibrary(input: SearchWorkflowRecordingsInput = {}): WorkflowRecordingLibraryEntry[] {
    return this.workflowRecordings().listWorkflowRecordingLibrary(input);
  }

  describeWorkflowRecording(
    id: string,
    input: Pick<SearchWorkflowRecordingsInput, "includeArchived"> = {},
  ): WorkflowRecordingLibraryDescription {
    return this.workflowRecordings().describeWorkflowRecording(id, input);
  }

  setWorkflowRecordingEnabled(id: string, enabled: boolean): WorkflowRecordingLibraryDescription {
    return this.workflowRecordings().setWorkflowRecordingEnabled(id, enabled);
  }

  updateWorkflowRecordingPlaybook(
    id: string,
    input: {
      baseVersion: number;
      draft: WorkflowRecordingReviewDraftUpdate;
      title?: string;
    },
  ): WorkflowRecordingLibraryDescription {
    return this.workflowRecordings().updateWorkflowRecordingPlaybook(id, input);
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
    const existing = workflowRecordingFindLibraryRecord(this.workflowRecordings().libraryIndexes(), id, {
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
    return this.workflowRecordings().archiveWorkflowRecording(id, input);
  }

  unarchiveWorkflowRecording(id: string, input: { baseVersion: number }): WorkflowRecordingLibraryDescription {
    return this.workflowRecordings().unarchiveWorkflowRecording(id, input);
  }

  restoreWorkflowRecordingVersion(id: string, version: number): WorkflowRecordingLibraryDescription {
    return this.workflowRecordings().restoreWorkflowRecordingVersion(id, version);
  }

  applyWorkflowRecordingSummary(threadId: string, messageId?: string): WorkflowRecordingState {
    return this.workflowRecordings().applyWorkflowRecordingSummary(threadId, messageId);
  }

  updateThreadSettings(
    threadId: string,
    input: Partial<Pick<ThreadSummary, "permissionMode" | "collaborationMode" | "model" | "thinkingLevel" | "memoryEnabled">> & {
      piSessionFile?: string | null;
    },
  ): ThreadSummary {
    return this.threads().updateThreadSettings(threadId, input);
  }

  updateThreadTitle(threadId: string, title: string): ThreadSummary {
    return this.threads().updateThreadTitle(threadId, title);
  }

  setThreadPinned(threadId: string, pinned: boolean): ThreadSummary {
    return this.threads().setThreadPinned(threadId, pinned);
  }

  markThreadRead(threadId: string, readAt = new Date().toISOString()): ThreadSummary {
    return this.threads().markThreadRead(threadId, readAt);
  }

  markThreadUnread(threadId: string): ThreadSummary {
    return this.threads().markThreadUnread(threadId);
  }

  updateThreadWorkspacePath(threadId: string, workspacePath: string): ThreadSummary {
    return this.threads().updateThreadWorkspacePath(threadId, workspacePath);
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
    return this.threads().setThreadWorktree(input);
  }

  archiveChats(): number {
    return this.threads().archiveChats({
      settings: this.settings(),
      defaults: this.threadCreationDefaults(),
    });
  }

  archiveThread(threadId: string): number {
    return this.threads().archiveThread({
      threadId,
      settings: this.settings(),
      defaults: this.threadCreationDefaults(),
    });
  }

  forkThread(threadId: string, workspacePath = this.getWorkspace().path): ThreadSummary {
    return this.threads().forkThread({
      threadId,
      workspacePath,
      defaults: this.threadCreationDefaults(),
    });
  }

  getThreadWorktree(threadId: string): ThreadWorktreeSummary | undefined {
    return this.threads().getThreadWorktree(threadId);
  }

  updateThreadWorktreeCheckpoint(threadId: string, checkpointId: string): void {
    this.threads().updateThreadWorktreeCheckpoint(threadId, checkpointId);
  }

  listMessages(threadId: string): ChatMessage[] {
    return this.messages().listMessages(threadId);
  }

  listMessageVoiceStates(threadId: string): MessageVoiceState[] {
    return this.messageVoices().listMessageVoiceStates(threadId);
  }

  getMessageVoiceState(messageId: string): MessageVoiceState | undefined {
    return this.messageVoices().getMessageVoiceState(messageId);
  }

  clearMessageVoiceArtifact(messageId: string, error = "Voice artifact cleared."): MessageVoiceState {
    return this.messageVoices().clearMessageVoiceArtifact(messageId, error);
  }

  setMessageVoiceState(input: Omit<MessageVoiceState, "createdAt" | "updatedAt">): MessageVoiceState {
    return this.messageVoices().setMessageVoiceState(input);
  }

  deleteMessagesAfter(threadId: string, messageId: string): ChatMessage[] {
    return this.messages().deleteMessagesAfter(threadId, messageId);
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
    const workspace = this.getWorkspace();
    return this.workspaceSearch().searchWorkspace({
      query,
      scope: options.scope,
      threadId: options.threadId,
      limit: options.limit,
      workspacePath: options.workspacePath ?? workspace.path,
      projectName: options.projectName ?? workspace.name,
    });
  }

  addMessage(input: {
    threadId: string;
    role: ChatMessage["role"];
    content: string;
    metadata?: Record<string, unknown>;
  }): ChatMessage {
    return this.messages().addMessage(input);
  }

  appendToMessage(messageId: string, delta: string): ChatMessage {
    return this.messages().appendToMessage(messageId, delta);
  }

  replaceMessage(messageId: string, content: string, metadata?: Record<string, unknown>): ChatMessage {
    return this.messages().replaceMessage(messageId, content, metadata);
  }

  startRun(input: { threadId: string; assistantMessageId: string }): RunRecord {
    return this.runs().startRun(input);
  }

  updateRunStatus(runId: string, status: ActivePersistedRunStatus): RunRecord {
    return this.runs().updateRunStatus(runId, status);
  }

  updateRunDiagnostics(runId: string, diagnostics: RunDiagnostics): RunRecord {
    return this.runs().updateRunDiagnostics(runId, diagnostics);
  }

  getRunRecord(runId: string): RunRecord {
    return this.runs().getRun(runId);
  }

  finishRun(runId: string, status: TerminalPersistedRunStatus, errorMessage?: string): RunRecord {
    return this.runs().finishRun(runId, status, errorMessage);
  }

  listActiveRuns(): RunRecord[] {
    return this.runs().listActiveRuns();
  }

  recordContextUsageSnapshot(input: ContextUsageSnapshotInput): ContextUsageSnapshot {
    this.getThread(input.threadId);
    return this.contextUsage().recordContextUsageSnapshot(input);
  }

  getLatestContextUsageSnapshot(threadId: string): ContextUsageSnapshot | undefined {
    return this.contextUsage().getLatestContextUsageSnapshot(threadId);
  }

  listContextUsageSnapshots(limit = 100): ContextUsageSnapshot[] {
    return this.contextUsage().listContextUsageSnapshots(limit);
  }

  addPermissionAudit(input: PermissionAuditInput): PermissionAuditEntry {
    return this.permissions().addPermissionAudit(input);
  }

  listPermissionAudit(limit = 50): PermissionAuditEntry[] {
    return this.permissions().listPermissionAudit(limit);
  }

  createPermissionGrant(input: CreateAmbientPermissionGrantInput): AmbientPermissionGrant {
    return this.permissions().createPermissionGrant(input);
  }

  getPermissionGrant(id: string): AmbientPermissionGrant {
    return this.permissions().getPermissionGrant(id);
  }

  listPermissionGrants(input: { includeRevoked?: boolean } = {}): AmbientPermissionGrant[] {
    return this.permissions().listPermissionGrants(input);
  }

  revokePermissionGrant(id: string): AmbientPermissionGrant {
    return this.permissions().revokePermissionGrant(id);
  }

  createPlannerPlanArtifact(input: PlannerPlanArtifactInput): PlannerPlanArtifact {
    return this.plannerArtifacts().createPlannerPlanArtifact(input);
  }

  getPlannerPlanArtifact(artifactId: string): PlannerPlanArtifact {
    return this.plannerArtifacts().getPlannerPlanArtifact(artifactId);
  }

  listPlannerPlanArtifacts(threadId: string): PlannerPlanArtifact[] {
    return this.plannerArtifacts().listPlannerPlanArtifacts(threadId);
  }

  updatePlannerPlanArtifact(
    artifactId: string,
    input: { status?: PlannerPlanArtifactStatus; workflowState?: PlannerPlanWorkflowState },
  ): PlannerPlanArtifact {
    return this.plannerArtifacts().updatePlannerPlanArtifact(artifactId, input);
  }

  updatePlannerPlanArtifactStatus(artifactId: string, status: PlannerPlanArtifactStatus): PlannerPlanArtifact {
    return this.plannerArtifacts().updatePlannerPlanArtifactStatus(artifactId, status);
  }

  finishPlannerPlanFinalizationAttempt(
    artifactId: string,
    input: { status: Exclude<PlannerPlanFinalizationAttemptStatus, "running">; workflowState?: PlannerPlanWorkflowState; error?: string },
  ): PlannerPlanArtifact {
    return this.plannerArtifacts().finishPlannerPlanFinalizationAttempt(artifactId, input);
  }

  updatePlannerPlanArtifactContent(
    artifactId: string,
    input: Pick<
      PlannerPlanArtifact,
      "sourceMessageId" | "title" | "summary" | "content" | "steps" | "openQuestions" | "risks" | "verification" | "warnings" | "diagrams"
    > & { workflowState?: PlannerPlanWorkflowState },
  ): PlannerPlanArtifact {
    return this.plannerArtifacts().updatePlannerPlanArtifactContent(artifactId, input);
  }

  setPlannerPlanDurableArtifact(
    artifactId: string,
    input: { path: string; generatedAt: string; validation?: PlannerDurableArtifactValidationResult; workflowState?: PlannerPlanWorkflowState },
  ): PlannerPlanArtifact {
    return this.plannerArtifacts().setPlannerPlanDurableArtifact(artifactId, input);
  }

  setPlannerPlanDurableArtifactValidation(
    artifactId: string,
    validation: PlannerDurableArtifactValidationResult,
    workflowState?: PlannerPlanWorkflowState,
  ): PlannerPlanArtifact {
    return this.plannerArtifacts().setPlannerPlanDurableArtifactValidation(artifactId, validation, workflowState);
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
    return this.plannerArtifacts().answerPlannerDecisionQuestion(artifactId, questionId, answer);
  }

  isPluginEnabled(pluginId: string): boolean {
    return this.settings().isPluginEnabled(pluginId);
  }

  setPluginEnabled(pluginId: string, enabled: boolean): void {
    this.settings().setPluginEnabled(pluginId, enabled);
  }

  isPluginTrusted(pluginId: string, pluginFingerprint?: string): boolean {
    return this.settings().isPluginTrusted(pluginId, pluginFingerprint);
  }

  setPluginTrusted(pluginId: string, trusted: boolean, pluginFingerprint?: string): void {
    this.settings().setPluginTrusted(pluginId, trusted, pluginFingerprint);
  }

  isPiPackageEnabled(packageId: string): boolean {
    return this.settings().isPiPackageEnabled(packageId);
  }

  setPiPackageEnabled(packageId: string, enabled: boolean): void {
    this.settings().setPiPackageEnabled(packageId, enabled);
  }

  clearPiPackageEnabled(packageId: string): void {
    this.settings().clearPiPackageEnabled(packageId);
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
    this.workflowAgentThreads().createWorkflowAgentFolder(input);
    return this.listWorkflowAgentFolders();
  }

  moveWorkflowAgentThread(input: MoveWorkflowAgentThreadInput): WorkflowAgentFolderSummary[] {
    this.workflowAgentThreads().moveWorkflowAgentThread(input);
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
    this.workflowAgentThreads().updateWorkflowAgentThreadChatThread(row.id, chatThread.id, now);
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
    return this.workflowGraphSnapshots().listWorkflowGraphSnapshots(workflowThreadId);
  }

  createWorkflowGraphSnapshot(input: CreateWorkflowGraphSnapshotInput): WorkflowGraphSnapshot {
    return this.workflowGraphSnapshots().createWorkflowGraphSnapshot(input);
  }

  createWorkflowExplorationTrace(input: CreateWorkflowExplorationTraceInput): WorkflowExplorationTraceSummary {
    return this.workflowExplorationTraces().createWorkflowExplorationTrace(input);
  }

  updateWorkflowExplorationTrace(input: UpdateWorkflowExplorationTraceInput): WorkflowExplorationTraceSummary {
    return this.workflowExplorationTraces().updateWorkflowExplorationTrace(input);
  }

  listWorkflowExplorationTraces(workflowThreadId: string): WorkflowExplorationTraceSummary[] {
    return this.workflowExplorationTraces().listWorkflowExplorationTraces(workflowThreadId);
  }

  listWorkflowVersions(workflowThreadId: string): WorkflowVersionSummary[] {
    return this.workflowVersions().listWorkflowVersions(workflowThreadId);
  }

  getWorkflowVersion(versionId: string): WorkflowVersionSummary {
    return this.workflowVersions().getWorkflowVersion(versionId);
  }

  getLatestApprovedWorkflowVersion(workflowThreadId: string): WorkflowVersionSummary | undefined {
    return this.workflowVersions().getLatestApprovedWorkflowVersion(workflowThreadId);
  }

  createWorkflowVersion(input: CreateWorkflowVersionInput): WorkflowVersionSummary {
    return this.workflowVersions().createWorkflowVersion(input);
  }

  updateWorkflowVersionStatusForArtifact(artifactId: string, status: WorkflowVersionStatus): WorkflowVersionSummary | undefined {
    return this.workflowVersions().updateWorkflowVersionStatusForArtifact(artifactId, status);
  }

  listWorkflowRevisions(workflowThreadId: string): WorkflowRevisionSummary[] {
    return this.workflowRevisions().listWorkflowRevisions(workflowThreadId);
  }

  getWorkflowRevision(revisionId: string): WorkflowRevisionSummary {
    return this.workflowRevisions().getWorkflowRevision(revisionId);
  }

  createWorkflowRevision(input: CreateWorkflowRevisionInput): WorkflowRevisionSummary {
    return this.workflowRevisions().createWorkflowRevision(input);
  }

  updateWorkflowRevision(input: UpdateWorkflowRevisionInput): WorkflowRevisionSummary {
    return this.workflowRevisions().updateWorkflowRevision(input);
  }

  resolveWorkflowRevision(input: ResolveWorkflowRevisionInput): WorkflowRevisionSummary {
    return this.workflowRevisions().resolveWorkflowRevision(input);
  }

  listWorkflowDiscoveryQuestions(workflowThreadId: string, options: { revisionId?: string } = {}): WorkflowDiscoveryQuestion[] {
    return this.workflowDiscoveryQuestions().listWorkflowDiscoveryQuestions(workflowThreadId, options);
  }

  createWorkflowDiscoveryQuestion(input: CreateWorkflowDiscoveryQuestionInput): WorkflowDiscoveryQuestion {
    return this.workflowDiscoveryQuestions().createWorkflowDiscoveryQuestion(input);
  }

  answerWorkflowDiscoveryQuestion(input: AnswerWorkflowDiscoveryQuestionInput): WorkflowDiscoveryQuestion {
    return this.workflowDiscoveryQuestions().answerWorkflowDiscoveryQuestion(input);
  }

  clearWorkflowDiscoveryQuestionAnswer(questionId: string): WorkflowDiscoveryQuestion {
    return this.workflowDiscoveryQuestions().clearWorkflowDiscoveryQuestionAnswer(questionId);
  }

  getWorkflowDiscoveryQuestion(questionId: string): WorkflowDiscoveryQuestion {
    return this.workflowDiscoveryQuestions().getWorkflowDiscoveryQuestion(questionId);
  }

  updateWorkflowDiscoveryAccessRequests(input: {
    questionId: string;
    accessRequests?: WorkflowDiscoveryQuestion["accessRequests"];
  }): WorkflowDiscoveryQuestion {
    return this.workflowDiscoveryQuestions().updateWorkflowDiscoveryAccessRequests(input);
  }

  updateWorkflowDiscoveryActivityEvents(input: {
    questionId: string;
    activityEvents?: WorkflowDiscoveryQuestion["activityEvents"];
  }): WorkflowDiscoveryQuestion {
    return this.workflowDiscoveryQuestions().updateWorkflowDiscoveryActivityEvents(input);
  }

  updateWorkflowAgentThreadPhase(threadId: string, phase: WorkflowAgentThreadPhase): WorkflowAgentThreadSummary {
    this.workflowAgentThreads().updateWorkflowAgentThreadPhase(threadId, phase);
    return this.getWorkflowAgentThreadSummary(threadId);
  }

  listAutomationFolders(): AutomationFolderSummary[] {
    return this.automations().listAutomationFolders();
  }

  createAutomationFolder(input: CreateAutomationFolderInput): AutomationFolderSummary[] {
    return this.automations().createAutomationFolder(input);
  }

  moveAutomationThread(input: MoveAutomationThreadInput): AutomationFolderSummary[] {
    return this.automations().moveAutomationThread(input);
  }

  listAutomationSchedules(): AutomationScheduleSummary[] {
    return this.automations().listAutomationSchedules();
  }

  listAutomationScheduleExceptions(input: { scheduleId?: string } = {}): AutomationScheduleExceptionSummary[] {
    return this.automations().listAutomationScheduleExceptions(input);
  }

  createAutomationSchedule(input: CreateAutomationScheduleInput, nowDate = new Date()): AutomationScheduleSummary[] {
    return this.automations().createAutomationSchedule(input, nowDate);
  }

  updateAutomationSchedule(input: UpdateAutomationScheduleInput, nowDate = new Date()): AutomationScheduleSummary[] {
    return this.automations().updateAutomationSchedule(input, nowDate);
  }

  skipAutomationScheduleOccurrence(
    input: AutomationScheduleOccurrenceActionInput,
    nowDate = new Date(),
  ): AutomationScheduleOccurrenceActionResult {
    return this.automations().skipAutomationScheduleOccurrence(input, nowDate);
  }

  rescheduleAutomationScheduleOccurrence(
    input: AutomationScheduleOccurrenceActionInput,
    nowDate = new Date(),
  ): AutomationScheduleOccurrenceActionResult {
    return this.automations().rescheduleAutomationScheduleOccurrence(input, nowDate);
  }

  updateAutomationScheduleOccurrenceRunLimits(
    input: AutomationScheduleOccurrenceActionInput,
    nowDate = new Date(),
  ): AutomationScheduleOccurrenceActionResult {
    return this.automations().updateAutomationScheduleOccurrenceRunLimits(input, nowDate);
  }

  consumePendingAutomationScheduleOccurrenceException(
    scheduleId: string,
    occurrenceAt: string | undefined,
    nowDate = new Date(),
  ): AutomationScheduleExceptionSummary | undefined {
    return this.automations().consumePendingAutomationScheduleOccurrenceException(scheduleId, occurrenceAt, nowDate);
  }

  listDueAutomationSchedules(nowDate = new Date()): AutomationScheduleSummary[] {
    return this.automations().listDueAutomationSchedules(nowDate);
  }

  advanceAutomationSchedule(scheduleId: string, nowDate = new Date()): AutomationScheduleSummary {
    return this.automations().advanceAutomationSchedule(scheduleId, nowDate);
  }

  listAutomationThreadChatIds(): string[] {
    return this.automations().listAutomationThreadChatIds();
  }

  listWorkflowAgentThreadChatIds(): string[] {
    const rows = this.requireDb()
      .prepare("SELECT DISTINCT chat_thread_id FROM workflow_agent_threads WHERE chat_thread_id IS NOT NULL AND chat_thread_id != ''")
      .all() as Array<{ chat_thread_id: string }>;
    return rows.map((row) => row.chat_thread_id);
  }

  listOrchestrationBoard(): OrchestrationBoard {
    return this.orchestration().listOrchestrationBoard();
  }

  listOrchestrationTasks(): OrchestrationTask[] {
    return this.orchestration().listOrchestrationTasks();
  }

  listOrchestrationRuns(limit = 50): OrchestrationRun[] {
    return this.orchestration().listOrchestrationRuns(limit);
  }

  getOrchestrationRun(runId: string): OrchestrationRun {
    return this.orchestration().getOrchestrationRun(runId);
  }

  getOrchestrationTask(taskId: string): OrchestrationTask {
    return this.orchestration().getOrchestrationTask(taskId);
  }

  createOrchestrationTask(input: CreateOrchestrationTaskInput): OrchestrationTask {
    return this.orchestration().createOrchestrationTask(input);
  }

  updateOrchestrationTask(input: OrchestrationTaskUpdateInput): OrchestrationTask {
    return this.orchestration().updateOrchestrationTask(input);
  }

  setOrchestrationTaskWorkspace(input: { id: string; workspacePath: string; branchName?: string }): OrchestrationTask {
    return this.orchestration().setOrchestrationTaskWorkspace(input);
  }

  recordPreparedOrchestrationRun(input: {
    taskId: string;
    workspacePath: string;
    proofOfWork?: Record<string, unknown>;
  }): OrchestrationRun {
    return this.orchestration().recordPreparedOrchestrationRun(input);
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
    return this.orchestration().updateOrchestrationRun(input);
  }

  recordRestartInterruptedAutoContinueAttempt(runId: string, now = new Date()): OrchestrationRun {
    return this.orchestration().recordRestartInterruptedAutoContinueAttempt(runId, now);
  }

  getOrchestrationSchedulerRuntimeState(): SchedulerRuntimeState {
    return this.orchestration().getOrchestrationSchedulerRuntimeState();
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
    return this.workflowArtifacts().createWorkflowArtifact(input);
  }

  listWorkflowArtifacts(): WorkflowArtifactSummary[] {
    return this.workflowArtifacts().listWorkflowArtifacts();
  }

  getWorkflowArtifact(artifactId: string): WorkflowArtifactSummary {
    return this.workflowArtifacts().getWorkflowArtifact(artifactId);
  }

  updateWorkflowArtifact(input: UpdateWorkflowArtifactInput): WorkflowArtifactSummary {
    return this.workflowArtifacts().updateWorkflowArtifact(input);
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
    return this.workflowRuns().startWorkflowRun(input);
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
    return this.workflowRuns().updateWorkflowRun(input);
  }

  updateWorkflowRunDurability(input: {
    id: string;
    graphSnapshotId?: string | null;
    providerHealth?: WorkflowRunProviderHealth;
    retryMetadata?: WorkflowRunRetryMetadata;
    recoveryContext?: WorkflowRecoveryContext | null;
  }): WorkflowRunSummary {
    return this.workflowRuns().updateWorkflowRunDurability(input);
  }

  getWorkflowRun(runId: string): WorkflowRunSummary {
    return this.workflowRuns().getWorkflowRun(runId);
  }

  private tryGetWorkflowRun(runId: string): WorkflowRunSummary | undefined {
    return this.workflowRuns().tryGetWorkflowRun(runId);
  }

  listWorkflowRuns(artifactId?: string, limit = 50): WorkflowRunSummary[] {
    return this.workflowRuns().listWorkflowRuns(artifactId, limit);
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
    return this.workflowRuns().appendWorkflowRunEvent(input);
  }

  listWorkflowRunEvents(runId: string): WorkflowRunEvent[] {
    return this.workflowRuns().listWorkflowRunEvents(runId);
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
    return this.callableWorkflowTasks().createQueuedTask({ draft, parentMessageId, patternGraphSnapshot, now });
  }

  getCallableWorkflowTask(id: string): CallableWorkflowTaskSummary {
    return this.callableWorkflowTasks().getCallableWorkflowTask(id);
  }

  listCallableWorkflowTasksForParentRun(parentRunId: string): CallableWorkflowTaskSummary[] {
    return this.callableWorkflowTasks().listCallableWorkflowTasksForParentRun(parentRunId);
  }

  listCallableWorkflowTasksForParentThread(parentThreadId: string): CallableWorkflowTaskSummary[] {
    return this.callableWorkflowTasks().listCallableWorkflowTasksForParentThread(parentThreadId);
  }

  listCallableWorkflowTasks(): CallableWorkflowTaskSummary[] {
    return this.callableWorkflowTasks().listCallableWorkflowTasks();
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
    return this.callableWorkflowTasks().bindPatternGraphSnapshot({
      id: task.id,
      patternGraphSnapshot,
      updatedAt: now,
    });
  }

  reconcileCallableWorkflowTaskRestartState(options: { now?: string } = {}): CallableWorkflowTaskRestartReconciliationSummary {
    const now = options.now ?? new Date().toISOString();
    const workflowRuns = this.workflowRuns().listWorkflowRunsForRestart();
    const parentRunRows = this.requireDb()
      .prepare("SELECT id, thread_id AS threadId FROM runs ORDER BY started_at ASC, id ASC")
      .all() as Array<{ id: string; threadId: string }>;
    const summary = analyzeCallableWorkflowTaskRestartState({
      tasks: this.listCallableWorkflowTasks(),
      threads: this.listThreads(),
      parentRuns: parentRunRows,
      workflowArtifacts: this.listWorkflowArtifacts(),
      workflowRuns,
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
    return this.workflowModelCalls().recordWorkflowModelCall(input);
  }

  getWorkflowModelCall(callId: string): WorkflowModelCallRecord {
    return this.workflowModelCalls().getWorkflowModelCall(callId);
  }

  listWorkflowModelCalls(input: { runId?: string; artifactId?: string } = {}): WorkflowModelCallRecord[] {
    return this.workflowModelCalls().listWorkflowModelCalls(input);
  }

  compactExpiredWorkflowTraceData(input: {
    now?: string;
    debugRetentionDays?: number;
  } = {}): { cutoff: string; eventsCompacted: number; modelCallsCompacted: number } {
    return this.workflowTraceRetention().compactExpiredWorkflowTraceData(input);
  }

  private createWorkflowAgentThreadRecord(input: CreateWorkflowAgentThreadInput): WorkflowAgentThreadRow {
    return this.workflowAgentThreads().createWorkflowAgentThreadRecord(input);
  }

  private ensureWorkflowAgentThreadLinks(): void {
    this.workflowArtifacts().ensureWorkflowAgentThreadLinks();
  }

  private listWorkflowAgentFolderRows(): WorkflowAgentFolderRow[] {
    return this.workflowAgentThreads().listWorkflowAgentFolderRows();
  }

  private listWorkflowAgentThreadRows(): WorkflowAgentThreadRow[] {
    return this.workflowAgentThreads().listWorkflowAgentThreadRows();
  }

  private requireWorkflowAgentThread(threadId: string): WorkflowAgentThreadRow {
    return this.workflowAgentThreads().requireWorkflowAgentThread(threadId);
  }

  private tryGetWorkflowArtifact(artifactId: string): WorkflowArtifactSummary | undefined {
    return this.workflowArtifacts().tryGetWorkflowArtifact(artifactId);
  }

  private tryGetWorkflowGraphSnapshot(snapshotId: string): WorkflowGraphSnapshot | undefined {
    return this.workflowGraphSnapshots().tryGetWorkflowGraphSnapshot(snapshotId);
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
    return this.threads().pruneRedundantEmptyThreads(this.settings());
  }

  private ensureDefaultSettings(): void {
    this.settings().ensureDefaultSettings();
  }

  ensureAutomationScheduleDedicatedThread(scheduleId: string): ThreadSummary {
    return this.automations().ensureAutomationScheduleDedicatedThread(scheduleId);
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

  private findUnresolvedRequiredSubagentCanonicalPathBlocker(input: {
    parentThreadId: string;
    parentRunId: string;
    canonicalTaskPath: string;
  }): { run: SubagentRunSummary; barrier: SubagentWaitBarrierSummary } | undefined {
    const matchingRuns = this.subagentRuns().listSubagentRunsForCanonicalTask(input);
    return this.subagentWaitBarriers().findUnresolvedRequiredSubagentRunBlocker({
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      matchingRuns,
    });
  }

  private appendSubagentRunEventInternal(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): void {
    this.subagentRuns().appendSubagentRunEvent(runId, input);
  }

  private findSubagentParentMailboxEventByIdempotencyKey(
    parentRunId: string,
    type: string,
    idempotencyKey: string,
  ): SubagentParentMailboxEventSummary | undefined {
    return this.subagentParentMailboxes().findSubagentParentMailboxEventByIdempotencyKey(parentRunId, type, idempotencyKey);
  }

  private parentMessageIdForSubagentRun(runId: string): string | undefined {
    return this.subagentRuns().parentMessageIdForSubagentRun(runId);
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
    return this.subagentParentMailboxes().requeueSubagentParentMailboxPayload({
      id: existing.id,
      parentMessageId: record.plan.parentMessageId,
      payload,
      updatedAt: createdAt,
    });
  }

  private latestQueuedSubagentParentMailboxEvent(parentRunId: string, type: string): SubagentParentMailboxEventSummary | undefined {
    return this.subagentParentMailboxes().latestQueuedSubagentParentMailboxEvent(parentRunId, type);
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
    return this.callableWorkflowTasks().updateCallableWorkflowTaskRow(input);
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
    return this.callableWorkflowTasks().findCallableWorkflowTaskByLaunchId(launchId);
  }

  private threads(): ProjectStoreThreadRepository {
    return new ProjectStoreThreadRepository(this.requireDb(), this.getWorkspace().path);
  }

  private threadGoals(): ProjectStoreThreadGoalRepository {
    return new ProjectStoreThreadGoalRepository(this.requireDb());
  }

  private messages(): ProjectStoreMessageRepository {
    return new ProjectStoreMessageRepository(this.requireDb());
  }

  private messageVoices(): ProjectStoreMessageVoiceRepository {
    return new ProjectStoreMessageVoiceRepository(this.requireDb());
  }

  private workspaceSearch(): ProjectStoreWorkspaceSearchRepository {
    return new ProjectStoreWorkspaceSearchRepository(this.requireDb());
  }

  private runs(): ProjectStoreRunRepository {
    return new ProjectStoreRunRepository(this.requireDb());
  }

  private subagentRuns(): ProjectStoreSubagentRunRepository {
    return new ProjectStoreSubagentRunRepository(this.requireDb());
  }

  private subagentMailboxes(): ProjectStoreSubagentMailboxRepository {
    return new ProjectStoreSubagentMailboxRepository(this.requireDb());
  }

  private subagentParentMailboxes(): ProjectStoreSubagentParentMailboxRepository {
    return new ProjectStoreSubagentParentMailboxRepository(this.requireDb());
  }

  private subagentSnapshots(): ProjectStoreSubagentSnapshotRepository {
    return new ProjectStoreSubagentSnapshotRepository(this.requireDb());
  }

  private subagentWaitBarriers(): ProjectStoreSubagentWaitBarrierRepository {
    return new ProjectStoreSubagentWaitBarrierRepository(this.requireDb());
  }

  private subagentBatches(): ProjectStoreSubagentBatchRepository {
    return new ProjectStoreSubagentBatchRepository(this.requireDb(), {
      upsertProgressNotification: (record, createdAt) =>
        this.upsertSubagentBatchProgressNotificationForRecord(record, createdAt),
    });
  }

  private subagentMaturityEvidence(): ProjectStoreSubagentMaturityEvidenceRepository {
    return new ProjectStoreSubagentMaturityEvidenceRepository(this.requireDb());
  }

  private artifactDrafts(): ProjectStoreArtifactDraftRepository {
    return new ProjectStoreArtifactDraftRepository(this.requireDb(), this.getWorkspace().path);
  }

  private plannerArtifacts(): ProjectStorePlannerArtifactRepository {
    return new ProjectStorePlannerArtifactRepository(this.requireDb());
  }

  private workflowArtifacts(): ProjectStoreWorkflowArtifactRepository {
    return new ProjectStoreWorkflowArtifactRepository(this.requireDb(), {
      createWorkflowAgentThreadRecord: (input) => this.createWorkflowAgentThreadRecord(input),
    });
  }

  private workflowExplorationTraces(): ProjectStoreWorkflowExplorationTraceRepository {
    return new ProjectStoreWorkflowExplorationTraceRepository(this.requireDb());
  }

  private workflowGraphSnapshots(): ProjectStoreWorkflowGraphSnapshotRepository {
    return new ProjectStoreWorkflowGraphSnapshotRepository(this.requireDb());
  }

  private workflowModelCalls(): ProjectStoreWorkflowModelCallRepository {
    return new ProjectStoreWorkflowModelCallRepository(this.requireDb(), {
      getWorkflowRun: (runId) => this.getWorkflowRun(runId),
      getWorkflowArtifact: (artifactId) => this.getWorkflowArtifact(artifactId),
    });
  }

  private workflowAgentThreads(): ProjectStoreWorkflowAgentThreadRepository {
    return new ProjectStoreWorkflowAgentThreadRepository(this.requireDb(), {
      workspacePath: () => this.getWorkspace().path,
      createThread: (title, workspacePath) => this.createThread(title, workspacePath),
    });
  }

  private workflowDiscoveryQuestions(): ProjectStoreWorkflowDiscoveryQuestionRepository {
    return new ProjectStoreWorkflowDiscoveryQuestionRepository(this.requireDb(), {
      getWorkflowRevision: (revisionId) => this.getWorkflowRevision(revisionId),
    });
  }

  private workflowRevisions(): ProjectStoreWorkflowRevisionRepository {
    return new ProjectStoreWorkflowRevisionRepository(this.requireDb(), {
      getWorkflowVersion: (versionId) => this.getWorkflowVersion(versionId),
      getWorkflowArtifact: (artifactId) => this.getWorkflowArtifact(artifactId),
      requireWorkflowGraphSnapshotForThread: (snapshotId, workflowThreadId) => this.requireWorkflowGraphSnapshotForThread(snapshotId, workflowThreadId),
      workflowVersionForGraphSnapshot: (graphSnapshotId) => this.workflowVersionForGraphSnapshot(graphSnapshotId),
    });
  }

  private workflowVersions(): ProjectStoreWorkflowVersionRepository {
    return new ProjectStoreWorkflowVersionRepository(this.requireDb(), {
      getWorkflowArtifact: (artifactId) => this.getWorkflowArtifact(artifactId),
      tryGetWorkflowGraphSnapshot: (snapshotId) => this.tryGetWorkflowGraphSnapshot(snapshotId),
    });
  }

  private workflowRuns(): ProjectStoreWorkflowRunRepository {
    return new ProjectStoreWorkflowRunRepository(this.requireDb());
  }

  private workflowTraceRetention(): ProjectStoreWorkflowTraceRetentionRepository {
    return new ProjectStoreWorkflowTraceRetentionRepository(this.requireDb());
  }

  private workflowRecordings(): ProjectStoreWorkflowRecordingRepository {
    return new ProjectStoreWorkflowRecordingRepository(this.requireDb(), {
      workspacePath: () => this.getWorkspace().path,
      createThread: (title, workspacePath) => this.createThread(title, workspacePath),
      getThread: (threadId) => this.getThread(threadId),
      listMessages: (threadId) => this.listMessages(threadId),
    });
  }

  private settings(): ProjectStoreSettingsRepository {
    return new ProjectStoreSettingsRepository(this.requireDb());
  }

  private contextUsage(): ProjectStoreContextUsageRepository {
    return new ProjectStoreContextUsageRepository(this.requireDb());
  }

  private permissions(): ProjectStorePermissionRepository {
    return new ProjectStorePermissionRepository(this.requireDb());
  }

  private automations(): ProjectStoreAutomationRepository {
    return new ProjectStoreAutomationRepository(this.requireDb(), {
      getWorkspace: () => this.getWorkspace(),
      listOrchestrationTasks: () => this.listOrchestrationTasks(),
      listOrchestrationRuns: (limit) => this.listOrchestrationRuns(limit),
      getOrchestrationTask: (taskId) => this.getOrchestrationTask(taskId),
      listWorkflowArtifacts: () => this.listWorkflowArtifacts(),
      getWorkflowArtifact: (artifactId) => this.getWorkflowArtifact(artifactId),
      listWorkflowRuns: (artifactId, limit) => this.listWorkflowRuns(artifactId, limit),
      listWorkflowRunEvents: (runId) => this.listWorkflowRunEvents(runId),
      requireWorkflowRecordingScheduleTarget: (id, targetVersion) => {
        const playbook = this.describeWorkflowRecording(id);
        if (targetVersion !== undefined) workflowRecordingRequireLibraryVersion(id, playbook.versions, targetVersion);
        return playbook;
      },
      getLatestApprovedWorkflowVersion: (workflowThreadId) => this.getLatestApprovedWorkflowVersion(workflowThreadId),
      getWorkflowVersion: (versionId) => this.getWorkflowVersion(versionId),
      getWorkflowAgentThreadSummary: (threadId) => this.getWorkflowAgentThreadSummary(threadId),
      createThread: (title, workspacePath) => this.createThread(title, workspacePath),
      getThread: (threadId) => this.getThread(threadId),
    });
  }

  private callableWorkflowTasks(): ProjectStoreCallableWorkflowTaskRepository {
    return new ProjectStoreCallableWorkflowTaskRepository(this.requireDb(), {
      workflowThreadIdForArtifact: (artifactId) => this.tryGetWorkflowArtifact(artifactId)?.workflowThreadId,
      hydrateRunTelemetry: (task) => this.hydrateCallableWorkflowTaskRunTelemetry(task),
    });
  }

  private orchestration(): ProjectStoreOrchestrationRepository {
    return new ProjectStoreOrchestrationRepository(this.requireDb(), {
      defaultProjectPath: defaultOrchestrationProjectPath(this.getWorkspace().path),
      projectBoardTaskHasClosedDoneCard: (taskId) => this.projectBoardTaskHasClosedDoneCard(taskId),
      projectBoardClaimBlockedTaskIds: () => this.projectBoardClaimBlockedTaskIds(),
      syncProjectBoardCardsForLinkedTasks: () => this.syncProjectBoardCardsForLinkedTasks(),
      reviewProjectBoardCardProofForRun: (run) => this.reviewProjectBoardCardProofForRun(run),
    });
  }

  private projectBoards(): ProjectStoreProjectBoardReadRepository {
    return new ProjectStoreProjectBoardReadRepository(this.requireDb(), {
      listOrchestrationTasks: () => this.listOrchestrationTasks(),
    });
  }

  private projectBoardLifecycle(): ProjectStoreProjectBoardLifecycleRepository {
    return new ProjectStoreProjectBoardLifecycleRepository(this.requireDb(), {
      getWorkspace: () => this.getWorkspace(),
      getActiveProjectBoard: (sourceThreadId) => this.getActiveProjectBoard(sourceThreadId),
      getProjectBoardForPath: (projectPath, sourceThreadId) => this.getProjectBoardForPath(projectPath, sourceThreadId),
      mapProjectBoard: (row) => this.mapProjectBoard(row),
      ensureProjectBoardQuestions: (boardId) => this.ensureProjectBoardQuestions(boardId),
      listProjectBoardQuestions: (boardId) => this.listProjectBoardQuestions(boardId),
      listProjectBoardSources: (boardId) => this.listProjectBoardSources(boardId),
      appendProjectBoardEvent: (input) => this.appendProjectBoardEvent(input),
    });
  }

  private projectBoardQuestions(): ProjectStoreProjectBoardQuestionRepository {
    return new ProjectStoreProjectBoardQuestionRepository(this.requireDb(), {
      getProjectBoard: (boardId) => this.getProjectBoard(boardId),
      listProjectBoardQuestions: (boardId) => this.listProjectBoardQuestions(boardId),
      listProjectBoardSources: (boardId) => this.listProjectBoardSources(boardId),
      appendProjectBoardEvent: (input) => this.appendProjectBoardEvent(input),
    });
  }

  private projectBoardSources(): ProjectStoreProjectBoardSourceRepository {
    return new ProjectStoreProjectBoardSourceRepository(this.requireDb(), {
      getProjectBoard: (boardId) => this.getProjectBoard(boardId),
      getProjectBoardCard: (cardId) => this.getProjectBoardCard(cardId),
      listProjectBoardEvents: (boardId, limit) => this.listProjectBoardEvents(boardId, limit),
      listProjectBoardSources: (boardId) => this.listProjectBoardSources(boardId),
      listProjectBoardCards: (boardId) => this.listProjectBoardCards(boardId),
      addProjectBoardCardRunFeedback: (input) => this.addProjectBoardCardRunFeedback(input),
      appendProjectBoardEvent: (input) => this.appendProjectBoardEvent(input),
    });
  }

  private projectBoardPlanningSnapshots(): ProjectStoreProjectBoardPlanningSnapshotRepository {
    return new ProjectStoreProjectBoardPlanningSnapshotRepository(this.requireDb(), {
      getProjectBoard: (boardId) => this.getProjectBoard(boardId),
    });
  }

  private projectBoardDeliverableIntegrations(): ProjectStoreProjectBoardDeliverableIntegrationRepository {
    return new ProjectStoreProjectBoardDeliverableIntegrationRepository(this.requireDb(), {
      getProjectBoard: (boardId) => this.getProjectBoard(boardId),
      getOrchestrationRun: (runId) => this.getOrchestrationRun(runId),
      appendProjectBoardEvent: (input) => this.appendProjectBoardEvent(input),
    });
  }

  private projectBoardCardExecutionSessions(): ProjectStoreProjectBoardCardExecutionSessionRepository {
    return new ProjectStoreProjectBoardCardExecutionSessionRepository(this.requireDb(), {
      tryGetThread: (threadId) => this.tryGetThread(threadId),
      createThread: (title, workspacePath) => this.createThread(title, workspacePath),
      getOrchestrationTask: (taskId) => this.getOrchestrationTask(taskId),
      appendProjectBoardEvent: (input) => this.appendProjectBoardEvent(input),
    });
  }

  private projectBoardSessionCopies(): ProjectStoreProjectBoardSessionCopyRepository {
    return new ProjectStoreProjectBoardSessionCopyRepository(this.requireDb(), {
      getProjectBoardCard: (cardId) => this.getProjectBoardCard(cardId),
      getOrchestrationRun: (runId) => this.getOrchestrationRun(runId),
      getWorkspacePath: () => this.getWorkspace().path,
      getThread: (threadId) => this.getThread(threadId),
      forkThread: (threadId, workspacePath) => this.forkThread(threadId, workspacePath),
      updateThreadTitle: (threadId, title) => this.updateThreadTitle(threadId, title),
      addMessage: (input) => this.addMessage(input),
      appendProjectBoardEvent: (input) => this.appendProjectBoardEvent(input),
    });
  }

  private projectBoardExecutionReadiness(): ProjectStoreProjectBoardExecutionReadinessRepository {
    return new ProjectStoreProjectBoardExecutionReadinessRepository(this.requireDb(), {
      getProjectBoard: (boardId) => this.getProjectBoard(boardId),
      listProjectBoardEvents: (boardId, limit) => this.listProjectBoardEvents(boardId, limit),
      appendProjectBoardEvent: (input) => this.appendProjectBoardEvent(input),
    });
  }

  private projectBoardWorkflows(): ProjectStoreProjectBoardWorkflowRepository {
    return new ProjectStoreProjectBoardWorkflowRepository(this.requireDb(), {
      getProjectBoard: (boardId) => this.getProjectBoard(boardId),
      listProjectBoardEvents: (boardId, limit) => this.listProjectBoardEvents(boardId, limit),
      getOrchestrationRun: (runId) => this.getOrchestrationRun(runId),
      getProjectBoardCardForOrchestrationTask: (taskId) => this.getProjectBoardCardForOrchestrationTask(taskId),
      updateOrchestrationRun: (input) => this.updateOrchestrationRun(input),
      appendProjectBoardEvent: (input) => this.appendProjectBoardEvent(input),
    });
  }

  private projectBoardSynthesisProposals(): ProjectStoreProjectBoardSynthesisProposalRepository {
    return new ProjectStoreProjectBoardSynthesisProposalRepository(this.requireDb(), {
      appendProjectBoardEvent: (input) => this.appendProjectBoardEvent(input),
    });
  }

  private projectBoardSynthesisApply(): ProjectStoreProjectBoardSynthesisApplyRepository {
    return new ProjectStoreProjectBoardSynthesisApplyRepository(this.requireDb(), {
      ensureProjectBoardQuestions: (boardId) => this.ensureProjectBoardQuestions(boardId),
      listProjectBoardEvents: (boardId) => this.listProjectBoardEvents(boardId),
      listProjectBoardSources: (boardId) => this.listProjectBoardSources(boardId),
      listProjectBoardQuestions: (boardId) => this.listProjectBoardQuestions(boardId),
      mapProjectBoard: (row) => this.mapProjectBoard(row),
      getProjectBoard: (boardId) => this.getProjectBoard(boardId),
      appendProjectBoardPlanningSnapshotForRun: (runId, kind) => this.appendProjectBoardPlanningSnapshotForRun(runId, kind ?? "manual"),
      appendProjectBoardEvent: (input) => this.appendProjectBoardEvent(input),
    });
  }

  private projectBoardSynthesisRuns(): ProjectStoreProjectBoardSynthesisRunRepository {
    return new ProjectStoreProjectBoardSynthesisRunRepository(this.requireDb(), {
      appendProjectBoardPlanningSnapshotForRun: (runId, kind) => this.appendProjectBoardPlanningSnapshotForRun(runId, kind),
    });
  }

  private projectBoardCardMutations(): ProjectStoreProjectBoardCardMutationRepository {
    return new ProjectStoreProjectBoardCardMutationRepository(this.requireDb(), {
      listOrchestrationTasks: () => this.listOrchestrationTasks(),
      getActiveProjectBoard: () => this.getActiveProjectBoard(),
      getProjectBoard: (boardId) => this.getProjectBoard(boardId),
      getRunningProjectBoardSynthesisRun: (boardId) => this.getRunningProjectBoardSynthesisRun(boardId),
      listProjectBoardCards: (boardId) => this.listProjectBoardCards(boardId),
      latestStableProjectBoardPlanningSnapshot: (boardId) => this.latestStableProjectBoardPlanningSnapshot(boardId),
      projectBoardRequiresProofSpec: (boardId) => this.projectBoardRequiresProofSpec(boardId),
      assertProjectBoardCardProofReady: (card) => this.assertProjectBoardCardProofReady(card),
      assertProjectBoardCardClarificationsResolved: (card) => this.assertProjectBoardCardClarificationsResolved(card),
      assertProjectBoardCardClaimAllowsLocalTicketization: (card) => this.assertProjectBoardCardClaimAllowsLocalTicketization(card),
      assertProjectBoardRunFollowUpStillActionable: (card) => this.assertProjectBoardRunFollowUpStillActionable(card),
      appendProjectBoardEvent: (input) => this.appendProjectBoardEvent(input),
      syncProjectBoardTaskBlockers: (boardId) => this.syncProjectBoardTaskBlockers(boardId),
      syncProjectBoardCardsForLinkedTasks: () => this.syncProjectBoardCardsForLinkedTasks(),
      listOrchestrationRuns: (limit) => this.listOrchestrationRuns(limit),
      createOrchestrationTask: (input) => this.createOrchestrationTask(input),
      getOrchestrationTask: (taskId) => this.getOrchestrationTask(taskId),
      getOrchestrationRun: (runId) => this.getOrchestrationRun(runId),
      mapOrchestrationTask: (row) => this.orchestration().mapOrchestrationTask(row),
      updateOrchestrationTaskDescription: (taskId, description) => {
        this.updateOrchestrationTask({ id: taskId, description });
      },
      projectBoardCardTaskDescription: (card) => this.projectBoardCardTaskDescription(card),
      assertProjectBoardUxMockGateOpen: (card, boardCards) => this.assertProjectBoardUxMockGateOpen(card, boardCards),
    });
  }

  private mapProjectBoard = (row: ProjectBoardRow): ProjectBoardSummary => this.projectBoards().mapProjectBoard(row);

  private listProjectBoardCards(boardId: string): ProjectBoardCard[] {
    return this.projectBoards().listProjectBoardCards(boardId);
  }

  private listProjectBoardSources(boardId: string): ProjectBoardSource[] {
    return this.projectBoards().listProjectBoardSources(boardId);
  }

  private listProjectBoardQuestions(boardId: string): ProjectBoardQuestion[] {
    return this.projectBoards().listProjectBoardQuestions(boardId);
  }

  private listProjectBoardEvents(boardId: string, limit = 80): ProjectBoardEvent[] {
    return this.projectBoards().listProjectBoardEvents(boardId, limit);
  }

  private listProjectBoardSynthesisProposals(boardId: string, limit = 20): ProjectBoardSynthesisProposal[] {
    return this.projectBoards().listProjectBoardSynthesisProposals(boardId, limit);
  }

  private listProjectBoardSynthesisRuns(boardId: string, limit = 10): ProjectBoardSynthesisRun[] {
    return this.projectBoards().listProjectBoardSynthesisRuns(boardId, limit);
  }

  private listProjectBoardExecutionArtifacts(boardId: string, limit = 40): ProjectBoardExecutionArtifact[] {
    return this.projectBoards().listProjectBoardExecutionArtifacts(boardId, limit);
  }

  private mapProjectBoardCard = (row: ProjectBoardCardRow, tasks: OrchestrationTask[] = []): ProjectBoardCard =>
    this.projectBoards().mapProjectBoardCard(row, tasks);

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
    return this.orchestration().latestOrchestrationRunForTask(taskId);
  }

  private latestDependencyArtifactRunForTask(taskId: string): OrchestrationRun | undefined {
    return this.orchestration().latestDependencyArtifactRunForTask(taskId);
  }

  private mapOrchestrationRun = (row: OrchestrationRunRow): OrchestrationRun => this.orchestration().mapOrchestrationRun(row);

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
    return this.workflowVersions().latestWorkflowVersionForThread(workflowThreadId);
  }

  private workflowVersionForGraphSnapshot(graphSnapshotId: string | undefined): WorkflowVersionSummary | undefined {
    return this.workflowVersions().workflowVersionForGraphSnapshot(graphSnapshotId);
  }

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

  private markMessageInterrupted(row: MessageRow, runMessage = INTERRUPTED_RUN_MESSAGE): void {
    const metadata = interruptedMetadata(parseMetadata(row.metadata_json));
    const content = interruptedMessageContent(row.content, row.role, runMessage);
    this.replaceMessage(row.id, content, metadata);
  }
}
