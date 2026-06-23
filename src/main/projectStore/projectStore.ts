import Database from "better-sqlite3";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AutomationFolderSummary,
  AutomationScheduleExceptionSummary,
  AutomationScheduleOccurrenceActionInput,
  AutomationScheduleOccurrenceActionResult,
  AutomationScheduleTargetKind,
  AutomationScheduleSummary,
  CreateAutomationScheduleInput,
  UpdateAutomationScheduleInput,
  CreateAutomationFolderInput,
  MoveAutomationThreadInput,
} from "../../shared/automationTypes";
import type {
  AmbientCompactionSettings,
  ModelRuntimeSettings,
  ChatMessage,
  ContextUsageSnapshot,
  CollaborationMode,
  RunDiagnostics,
  ThreadKind,
  ThinkingLevel,
  ThreadGoal,
  ThreadGoalAccountInput,
  ThreadGoalCreateInput,
  ThreadGoalSetInput,
  ThreadGoalStatus,
  ThreadScheduledCheckInSummary,
  ThreadSummary,
  ThreadWorktreeSummary,
} from "../../shared/threadTypes";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type {
  CallableWorkflowTaskRestartReconciliationSummary,
  CallableWorkflowTaskStatus,
  CallableWorkflowTaskSummary,
  CreateOrchestrationTaskInput,
  CreateWorkflowAgentFolderInput,
  CreateWorkflowAgentThreadInput,
  CreateWorkflowArtifactInput,
  CreateWorkflowExplorationTraceInput,
  UpdateWorkflowExplorationTraceInput,
  AnswerWorkflowDiscoveryQuestionInput,
  CreateWorkflowGraphSnapshotInput,
  CreateWorkflowRevisionInput,
  CreateWorkflowVersionInput,
  OrchestrationBoard,
  OrchestrationRun,
  OrchestrationTask,
  RecordWorkflowModelCallInput,
  ResolveWorkflowRevisionInput,
  ResolveOrchestrationWorkflowImpactAction,
  SaveSymphonyWorkflowRecipeInput,
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
} from "../../shared/workflowTypes";
import type {
  AmbientPermissionGrant,
  CreateAmbientPermissionGrantInput,
  PermissionAuditDecision,
  PermissionAuditEntry,
  PermissionMode,
  PermissionRisk,
} from "../../shared/permissionTypes";
import type {
  CreateSubagentRunInput,
  SubagentMailboxDeliveryState,
  SubagentMailboxDirection,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentPersistedChildTreeRepairResult,
  SubagentPromptSnapshotSummary,
  SubagentRepairDiagnosticsReport,
  SubagentRestartReconciliationSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentSpawnEdgeSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import type { DesktopSettings } from "../../shared/desktopTypes";
import type {
  AddProjectBoardCardRunFeedbackInput,
  ApplyProjectBoardDecisionImpactFeedbackInput,
  ApplyProjectBoardSourceImpactFeedbackInput,
  CopyProjectBoardSessionToThreadInput,
  RecomputeProjectBoardProofCoverageInput,
  RefreshProjectBoardDecisionDraftsInput,
  RefreshProjectBoardSourceDraftsInput,
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardClarificationAnswer,
  ProjectBoardCardClarificationDecision,
  ProjectBoardCardClarificationSuggestion,
  ProjectBoardCardExecutionSessionPolicy,
  ProjectBoardCardProofReview,
  ProjectBoardCardStatus,
  ProjectBoardCardTestPlan,
  ProjectBoardCharter,
  ProjectBoardCharterProjectSummary,
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
} from "../../shared/projectBoardTypes";
import type { MessageVoiceState } from "../../shared/localRuntimeTypes";
import type {
  PlannerDurableArtifactValidationResult,
  PlannerPlanArtifact,
  PlannerPlanArtifactStatus,
  PlannerPlanFinalizationAttemptStatus,
  PlannerPlanWorkflowState,
} from "../../shared/plannerTypes";
import type {
  SubagentRunStatus,
  SubagentWaitBarrierFailurePolicy,
  SubagentWaitBarrierMode,
  SubagentWaitBarrierStatus,
} from "../../shared/subagentProtocol";
import type { SubagentPatternGraphSnapshot } from "../../shared/subagentPatternGraph";
import type { WorkspaceSearchScope, WorkspaceSearchResult, WorkspaceState } from "../../shared/workspaceTypes";
import type { AmbientModelRuntimeCatalog } from "../../shared/ambientModels";
import {
  callableWorkflowQueuedTaskDraftFromExecutionPlan,
  type CallableWorkflowPatternGraphChildBindingRequest,
  type CallableWorkflowTaskControlAction,
  type CallableWorkflowCompilerHandoffPlan,
  type CallableWorkflowExecutionPlan,
} from "./projectStoreCallableWorkflowFacade";
import { summarizeSubagentObservability, type SubagentObservabilitySummary } from "./projectStoreSubagentsFacade";
import type { SubagentMaturityInput } from "./projectStoreSubagentsFacade";
import {
  type SubagentMaturityEvidence,
  type SubagentMaturityEvidenceKind,
  type SubagentMaturityEvidenceStatus,
  type SubagentMaturitySnapshot,
  type SubagentDesktopDogfoodHistoryEntry,
  type SubagentReleaseGateLiveHistoryEntry,
  type SubagentWorkflowJitterReleaseProfileCheck,
  type SubagentWorkflowJitterReleaseProfileReport,
} from "../../shared/subagentMaturity";
import {
  createSubagentBatchProgressParentMailboxIdempotencyKey,
  createSubagentBatchProgressParentMailboxPayload,
  SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_TYPE,
  type SubagentBatchJobPlan,
  type SubagentBatchJobRecord,
  type SubagentBatchReportApplyResult,
  type SubagentBatchResultReport,
} from "./projectStoreSubagentsFacade";
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
} from "./projectStoreWorkflowFacade";
import type { SubagentRetentionCleanupResult, SubagentRetentionPlan } from "./projectStoreSubagentsFacade";
import { isAmbientSubagentsEnabled, type AmbientFeatureFlagSettings, type UpdateFeatureFlagSettingsInput } from "../../shared/featureFlags";
import type { AgentMemorySettings, UpdateAgentMemorySettingsInput } from "../../shared/agentMemorySettings";
import type { SymphonyWorkflowRecipePreset } from "../../shared/symphonyWorkflowRecipes";
import type { SubagentLifecycleInterruptionSource } from "./projectStoreSubagentsFacade";
import { cancelPendingParentToChildMailboxEvents } from "./projectStoreSubagentsFacade";
import {
  workflowRecordingLibraryVersions,
  workflowRecordingNextSavedPlaybook,
  workflowRecordingRequireLibraryVersion,
  workflowRecordingWritePlaybookPackageWithIndex,
} from "./projectStoreWorkflowRecordingFacade";
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
import type { ActivePersistedRunStatus, RunRecord, TerminalPersistedRunStatus } from "./runMappers";
import { ProjectStoreArtifactDraftRepository } from "./projectStoreArtifactDraftRepository";
import { ProjectStorePlannerArtifactRepository, type PlannerPlanArtifactInput } from "./plannerArtifactRepository";
import { ProjectStoreMessageRepository } from "./messageRepository";
import { ProjectStoreMessageVoiceRepository } from "./messageVoiceRepository";
import { ProjectStoreRunRepository } from "./runRepository";
import { ProjectStoreSubagentBatchRepository } from "./subagentBatchRepository";
import { ProjectStoreSubagentMailboxRepository } from "./subagentMailboxRepository";
import { ProjectStoreSubagentMaturityEvidenceRepository } from "./subagentMaturityEvidenceRepository";
import { ProjectStoreSubagentParentMailboxRepository } from "./subagentParentMailboxRepository";
import { ProjectStoreSubagentRunRepository } from "./subagentRunRepository";
import { ProjectStoreSubagentSnapshotRepository } from "./subagentSnapshotRepository";
import { ProjectStoreSubagentWaitBarrierRepository } from "./subagentWaitBarrierRepository";
import { ProjectStoreThreadRepository, type CreateProjectStoreThreadDefaults } from "./threadRepository";
import { ProjectStoreThreadGoalRepository } from "./threadGoalRepository";
import {
  ProjectStoreThreadWakeRepository,
  type ScheduleThreadWakeContinuationInput,
  type ThreadWakeContinuation,
} from "./threadWakeRepository";
import { ProjectStoreWorkspaceSearchRepository } from "./workspaceSearchRepository";
import { ProjectStoreWorkflowAgentThreadRepository } from "./workflowAgentThreadRepository";
import { ProjectStoreWorkflowArtifactRepository } from "./workflowArtifactRepository";
import { ProjectStoreWorkflowExplorationTraceRepository } from "./workflowExplorationTraceRepository";
import { ProjectStoreWorkflowGraphSnapshotRepository } from "./workflowGraphSnapshotRepository";
import { ProjectStoreWorkflowModelCallRepository } from "./workflowModelCallRepository";
import {
  ProjectStoreWorkflowDiscoveryQuestionRepository,
  type CreateWorkflowDiscoveryQuestionInput,
} from "./workflowDiscoveryQuestionRepository";
import { ProjectStoreWorkflowRevisionRepository } from "./workflowRevisionRepository";
import { ProjectStoreWorkflowRunRepository } from "./workflowRunRepository";
import { ProjectStoreWorkflowTraceRetentionRepository } from "./workflowTraceRetentionRepository";
import { ProjectStoreWorkflowVersionRepository } from "./workflowVersionRepository";
import type { ApplyProjectBoardClarificationDefaultSuggestionsInput } from "./projectBoardClarificationDefaultRepository";
import type { ApplyProjectBoardKickoffDefaultSuggestionsInput } from "./projectBoardQuestionRepository";
import {
  createProjectStoreProjectBoardRepositoryFactory,
  type ProjectStoreProjectBoardRepositoryFactoryHost,
} from "./projectBoardRepositoryFactory";
import { ProjectStoreOrchestrationRepository } from "./orchestrationRepository";
import { ProjectStoreProjectBoardDurablePlanSourceRepository } from "./projectBoardDurablePlanSourceRepository";
import { ProjectStoreProjectBoardLinkedTaskRepository } from "./projectBoardLinkedTaskRepository";
import { ProjectStoreAutomationRepository } from "./automationRepository";
import { ProjectStoreWorkflowRecordingRepository } from "./workflowRecordingRepository";
import { ProjectStorePlannerQuestionBlockRepairRepository } from "./plannerQuestionBlockRepairRepository";
import { ProjectStoreSubagentRunCreationRepository } from "./subagentRunCreationRepository";
import { ProjectStoreSubagentSpawnEdgeRepairRepository } from "./subagentSpawnEdgeRepairRepository";
import { ProjectStoreSubagentParentStopCascadeRepository } from "./subagentParentStopCascadeRepository";
import { ProjectStoreSubagentRestartReconciliationRepository } from "./subagentRestartReconciliationRepository";
import { ProjectStoreSubagentMaturitySnapshotRepository } from "./subagentMaturitySnapshotRepository";
import { ProjectStoreSubagentRetentionCleanupRepository } from "./subagentRetentionCleanupRepository";
import { ProjectStoreSubagentRunCompletionRepository } from "./subagentRunCompletionRepository";
import { ProjectStoreSubagentRepairDiagnosticsRepository } from "./subagentRepairDiagnosticsRepository";
import { ProjectStoreSymphonyWorkflowRecipeRepository } from "./symphonyWorkflowRecipeRepository";
import {
  callableWorkflowTaskProgressSnapshot,
  callableWorkflowTaskUsageSnapshot,
  type WorkflowAgentThreadRow,
} from "./projectStoreWorkflowMappers";
import { ProjectStoreCallableWorkflowTaskRepository } from "./callableWorkflowTaskRepository";
import { ProjectStoreCallableWorkflowTaskLifecycleRepository } from "./callableWorkflowTaskLifecycleRepository";
import { assertValidMutationWorkspaceLease } from "../../shared/symphonyFineGrainedContracts";
import { resolveSubagentParentStopWaitBarrier } from "./projectStoreSubagentsFacade";
import { resolveSubagentParentControlBarrierReconciliation } from "./projectStoreSubagentsFacade";
import { ProjectStoreContextUsageRepository } from "./contextUsageRepository";
import { ProjectStorePermissionRepository } from "./permissionRepository";
import { ProjectStoreWorkflowAgentReadModelRepository } from "./workflowAgentReadModelRepository";
import { ProjectStoreCallableWorkflowTaskRestartReconciliationRepository } from "./callableWorkflowTaskRestartReconciliationRepository";
import { ProjectStoreActiveRunRecoveryRepository } from "./activeRunRecoveryRepository";
import { ProjectStoreCallableWorkflowTaskPreparationRepository } from "./callableWorkflowTaskPreparationRepository";
import { projectBoardSourceIncludedInSynthesis, projectBoardSourceKey } from "./projectStoreProjectBoardFacade";
import { projectBoardPlanTitleIsGeneric } from "../../shared/projectBoardPlanIdentity";
import type { ProjectBoardArtifactProjection } from "./projectStoreProjectBoardFacade";
import {
  mapProjectBoardEventRow,
  normalizeProjectBoardCardRunFeedback,
  normalizeProjectBoardCardRunFeedbackSource,
  normalizeProjectBoardClarificationAnswers,
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
  normalizeProjectBoardProofFollowUpSuggestion,
  normalizeProjectBoardSynthesisClarificationFields,
  normalizeProjectBoardSynthesisRunEvent,
  normalizeRuntimeBudgetCriteria,
  normalizeProjectBoardUiMockRole,
  normalizeUnknownProjectBoardTestPlan,
  parseProjectBoardClarificationAnswers,
  parseProjectBoardClarificationDecisions,
  parseProjectBoardClarificationSuggestions,
  parseProjectBoardCardTestPlan,
  parseProjectBoardStringList,
  projectBoardCardProofCount,
  projectBoardCardMissingRequiredUxMockGate,
  projectBoardCandidateStatusForSynthesisUpdate,
  projectBoardChangedClarificationAnswer,
  projectBoardClarificationDecisionsEquivalent,
  projectBoardAfterRunHookSucceeded,
  projectBoardHasImplementationEvidence,
  projectBoardOpenUxMockGateBlocker,
  projectBoardProofObject,
  projectBoardMissingProofItems,
  projectBoardClaimSummaryFromEvents,
  projectBoardClosedParentForRunFollowUp,
  projectBoardTestPolicyRequiresProofSpec,
  projectBoardUnansweredClarificationQuestions,
  projectBoardUxMockGateSatisfied,
  projectBoardPlanningStableJson,
  type ProjectBoardCardStoreRow,
  type ProjectBoardEventStoreRow,
  type ProjectBoardExecutionArtifactStoreRow,
  type ProjectBoardStoreRow,
  type ProjectBoardSynthesisRunStoreRow,
  type ProjectBoardRunFollowUpCandidate,
  type ProjectBoardDependencyArtifactImportResult,
} from "./projectBoardMappers";
export { projectBoardDependencyArtifactPromptSection } from "./projectBoardMappers";
export type { ProjectBoardDependencyArtifactImport, ProjectBoardDependencyArtifactImportResult } from "./projectBoardMappers";
export type { RunRecord } from "./runMappers";
import { AMBIENT_LEGACY_MODEL_IDS } from "../../shared/ambientModels";
import { INTERRUPTED_RUN_MESSAGE } from "./runRecovery";
import { type SchedulerRuntimeState } from "./projectStoreOrchestrationFacade";
import { type ProjectBoardTaskToolAction, type ProjectBoardTaskToolActionTransport } from "./projectStoreProjectBoardFacade";
import { type ProjectBoardSynthesisCardInput, type ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import { dedupeProjectBoardQuestions } from "../../shared/projectBoardQuestionDedupe";
import { projectBoardOpenClarificationQuestions } from "../../shared/projectBoardClarificationDecisions";
import type {
  ArtifactDraftEvent,
  ArtifactDraftManifest,
  ArtifactDraftSummary,
  CreateArtifactDraftInput,
  ListArtifactDraftOptions,
  UpdateArtifactDraftStateInput,
} from "../../shared/artifactDrafts";
import type { ProjectBoardDeliverableIntegrationAction } from "../../shared/projectBoardDeliverables";
import type { ProjectBoardProofSuggestion } from "./projectStoreProjectBoardFacade";
import { LEGACY_PROJECT_STATE_DIR, prepareWorkspaceAuthorityState } from "./projectStoreWorkspaceFacade";
import { parseJsonArray, parseJsonObject, stringFromRecord } from "./projectStoreJson";
import { ProjectStoreSettingsRepository } from "./settingsRepository";

import {
  PROJECT_STATE_DIR,
  defaultOrchestrationProjectPath,
  defaultProjectArtifactWorkspacePath,
  emptyToNull,
  projectBoardSourceLikeArtifactId,
  projectBoardSourceLikeId,
  projectBoardSourceLikeMessageId,
  projectBoardSourceLikeSourceKey,
  projectBoardSourceLikeThreadId,
  repairProjectBoardSynthesisCardsWithExcludedSourceRefs,
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
export type { PlannerPlanArtifactInput } from "./plannerArtifactRepository";

export class ProjectStore {
  private db?: Database.Database;
  private workspace?: WorkspaceState;
  private readonly projectBoardRepos = createProjectStoreProjectBoardRepositoryFactory(
    this as unknown as ProjectStoreProjectBoardRepositoryFactoryHost,
  );

  openWorkspace(workspacePath: string, options: { recoverActiveRuns?: boolean; recoverOrchestrationRuns?: boolean } = {}): WorkspaceState {
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
    this.plannerQuestionBlockRepairs().repairPlannerPlanQuestionBlocks();
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

  getModelRuntimeCatalog(
    generatedAt?: string,
    runtimeProfiles: readonly AmbientModelRuntimeCatalog["profiles"][number][] = [],
  ): AmbientModelRuntimeCatalog {
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
    let row = this.projectBoardRepos.projectBoards().findActiveProjectBoardRow(projectPath, sourceThreadId);
    if (row && this.reconcileCompactPlannerPlanDraftBoard(row)) {
      row = this.projectBoardRepos.projectBoards().getProjectBoardRow(row.id);
    }
    return row ? this.projectBoardRepos.projectBoards().mapProjectBoard(row) : undefined;
  }

  getProjectBoard(boardId: string): ProjectBoardSummary | undefined {
    const row = this.projectBoardRepos.projectBoards().getProjectBoardRow(boardId);
    return row ? this.projectBoardRepos.projectBoards().mapProjectBoard(row) : undefined;
  }

  private reconcileCompactPlannerPlanDraftBoard(boardRow: ProjectBoardRow): boolean {
    return this.projectBoardRepos.projectBoardCompactPlannerPlans().reconcileCompactPlannerPlanDraftBoard(boardRow);
  }

  applyProjectBoardArtifactProjection(projectPath: string, projection: ProjectBoardArtifactProjection): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardArtifactProjections().applyProjectBoardArtifactProjection(projectPath, projection);
  }

  createProjectBoard(
    input: { title?: string; summary?: string; replaceActive?: boolean; sourceThreadId?: string } = {},
  ): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardLifecycle().createProjectBoard(input);
  }

  /** The compact durable-plan card covering this board's whole scope, if it is
   * already ticketized or executing. While such a card is in flight, an automatic
   * planning pass can only propose duplicate step cards for work already underway. */
  projectBoardExecutingPlannerPlanCard(boardId: string): ProjectBoardCard | undefined {
    return this.projectBoardRepos.projectBoardPlannerPlanPromotions().projectBoardExecutingPlannerPlanCard(boardId);
  }

  /** Records the park decision and returns the in-flight plan card, or undefined when
   * the automatic planning pass may proceed. */
  parkAutomaticPlanningForExecutingPlanCard(boardId: string): ProjectBoardCard | undefined {
    return this.projectBoardRepos.projectBoardPlannerPlanPromotions().parkAutomaticPlanningForExecutingPlanCard(boardId);
  }

  applyProjectBoardSynthesis(
    boardId: string,
    synthesis: ProjectBoardSynthesisDraft,
    options: ProjectBoardSynthesisApplyOptions = {},
  ): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardSynthesisApply().applyProjectBoardSynthesis(boardId, synthesis, options);
  }

  createProjectBoardSynthesisProposal(input: {
    boardId: string;
    synthesis: ProjectBoardSynthesisDraft;
    reviewReport?: ProjectBoardPmReviewReport;
    model?: string;
    durationMs?: number;
  }): ProjectBoardSynthesisProposal {
    return this.projectBoardRepos.projectBoardSynthesisProposals().createProjectBoardSynthesisProposal(input);
  }

  updateProjectBoardSynthesisProposal(input: {
    proposalId: string;
    synthesis: ProjectBoardSynthesisDraft;
    reviewReport?: ProjectBoardPmReviewReport;
    model?: string;
    durationMs?: number;
  }): ProjectBoardSynthesisProposal {
    return this.projectBoardRepos.projectBoardSynthesisProposals().updateProjectBoardSynthesisProposal(input);
  }

  getProjectBoardSynthesisProposal(proposalId: string): ProjectBoardSynthesisProposal | undefined {
    return this.projectBoardRepos.projectBoardSynthesisProposals().getProjectBoardSynthesisProposal(proposalId);
  }

  getLatestPendingProjectBoardSynthesisProposal(boardId: string): ProjectBoardSynthesisProposal | undefined {
    return this.projectBoardRepos.projectBoardSynthesisProposals().getLatestPendingProjectBoardSynthesisProposal(boardId);
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
    return this.projectBoardRepos.projectBoardSynthesisRuns().createProjectBoardSynthesisRun(input);
  }

  getProjectBoardSynthesisRun(runId: string): ProjectBoardSynthesisRun | undefined {
    return this.projectBoardRepos.projectBoardSynthesisRuns().getProjectBoardSynthesisRun(runId);
  }

  getRunningProjectBoardSynthesisRun(
    boardId: string,
    input: { excludeStages?: ProjectBoardSynthesisRunStage[] } = {},
  ): ProjectBoardSynthesisRun | undefined {
    return this.projectBoardRepos.projectBoardSynthesisRuns().getRunningProjectBoardSynthesisRun(boardId, input);
  }

  failStaleProjectBoardSynthesisRuns(input: { boardId: string; staleBefore: string; reason: string }): ProjectBoardSynthesisRun[] {
    return this.projectBoardRepos.projectBoardSynthesisRuns().failStaleProjectBoardSynthesisRuns(input);
  }

  markProjectBoardSynthesisRunStalled(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    return this.projectBoardRepos.projectBoardSynthesisRuns().markProjectBoardSynthesisRunStalled(input);
  }

  requestProjectBoardSynthesisRunPause(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    return this.projectBoardRepos.projectBoardSynthesisRuns().requestProjectBoardSynthesisRunPause(input);
  }

  markProjectBoardSynthesisRunPaused(input: {
    boardId: string;
    runId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): ProjectBoardSynthesisRun {
    return this.projectBoardRepos.projectBoardSynthesisRuns().markProjectBoardSynthesisRunPaused(input);
  }

  abandonProjectBoardSynthesisRunPause(input: { boardId: string; runId: string; reason?: string }): ProjectBoardSynthesisRun {
    return this.projectBoardRepos.projectBoardSynthesisRuns().abandonProjectBoardSynthesisRunPause(input);
  }

  supersedeProjectBoardSynthesisCardsForStartFresh(input: { boardId: string; runId: string; reason?: string }): {
    supersededDraftCardIds: string[];
    demotedPreservedCardIds: string[];
    preservedCardIds: string[];
  } {
    return this.projectBoardRepos.projectBoardSynthesisStartFresh().supersedeProjectBoardSynthesisCardsForStartFresh(input);
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
    return this.projectBoardRepos.projectBoardSynthesisRuns().recordProjectBoardSynthesisRunEvent(runId, input);
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
    return this.projectBoardRepos.projectBoardSynthesisRuns().updateProjectBoardSynthesisRunProgress(runId, input);
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
    return this.projectBoardRepos.projectBoardSynthesisRuns().tryUpdateProjectBoardSynthesisRunProgress(runId, input);
  }

  recordProjectBoardSynthesisRunProgressiveRecords(
    runId: string,
    records: ProjectBoardSynthesisRunProgressiveRecord[],
    input: { title?: string; summary?: string } = {},
  ): ProjectBoardSynthesisRun {
    return this.projectBoardRepos.projectBoardSynthesisRuns().recordProjectBoardSynthesisRunProgressiveRecords(runId, records, input);
  }

  recordProjectBoardPlanningSnapshotForRun(
    runId: string,
    kind: ProjectBoardPlanningSnapshotKind = "manual",
  ): ProjectBoardPlanningSnapshot | undefined {
    return this.projectBoardRepos.projectBoardPlanningSnapshots().recordProjectBoardPlanningSnapshotForRun(runId, kind);
  }

  private appendProjectBoardPlanningSnapshotForRun(
    runId: string,
    kind: ProjectBoardPlanningSnapshotKind,
  ): ProjectBoardPlanningSnapshot | undefined {
    return this.projectBoardRepos.projectBoardPlanningSnapshots().appendProjectBoardPlanningSnapshotForRun(runId, kind);
  }

  private latestStableProjectBoardPlanningSnapshot(boardId: string): { runId: string; snapshot: ProjectBoardPlanningSnapshot } | undefined {
    return this.projectBoardRepos.projectBoardPlanningSnapshots().latestStableProjectBoardPlanningSnapshot(boardId);
  }

  answerProjectBoardSynthesisProposalQuestion(input: {
    proposalId: string;
    questionIndex: number;
    answer: string;
  }): ProjectBoardSynthesisProposal {
    return this.projectBoardRepos.projectBoardSynthesisProposals().answerProjectBoardSynthesisProposalQuestion(input);
  }

  reviewProjectBoardSynthesisProposalCard(input: {
    proposalId: string;
    sourceId: string;
    reviewStatus: ProjectBoardSynthesisProposalCardReviewStatus;
    reason?: string;
    mergeTargetCardId?: string;
  }): ProjectBoardSynthesisProposal {
    return this.projectBoardRepos.projectBoardSynthesisProposals().reviewProjectBoardSynthesisProposalCard(input);
  }

  applyProjectBoardSynthesisProposal(input: { proposalId: string; replaceExistingDraft?: boolean }): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardSynthesisApply().applyProjectBoardSynthesisProposal(input);
  }

  updateProjectBoardStatus(boardId: string, status: ProjectBoardStatus): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardLifecycle().updateProjectBoardStatus(boardId, status);
  }

  resetProjectBoard(boardId: string): void {
    this.projectBoardRepos.projectBoardLifecycle().resetProjectBoard(boardId);
  }

  startProjectBoardRevision(input: { boardId: string; reason?: string }): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardLifecycle().startProjectBoardRevision(input);
  }

  cancelProjectBoardRevision(boardId: string): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardLifecycle().cancelProjectBoardRevision(boardId);
  }

  promotePlannerPlanToBoard(artifactId: string): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardPlannerPlanPromotions().promotePlannerPlanToBoard(artifactId);
  }

  getProjectBoardCard(cardId: string): ProjectBoardCard {
    return this.projectBoardRepos.projectBoards().getProjectBoardCard(cardId);
  }

  private tryGetProjectBoardCard(cardId: string): ProjectBoardCard | undefined {
    return this.projectBoardRepos.projectBoards().tryGetProjectBoardCard(cardId);
  }

  getProjectBoardCardForOrchestrationTask(taskId: string): ProjectBoardCard | undefined {
    return this.projectBoardRepos.projectBoards().getProjectBoardCardForOrchestrationTask(taskId);
  }

  refreshProjectBoardTaskDescriptionForTask(taskId: string): OrchestrationTask | undefined {
    return this.projectBoardLinkedTasks().refreshProjectBoardTaskDescriptionForTask(taskId);
  }

  getProjectBoardCardForExecutionThread(threadId: string): ProjectBoardCard | undefined {
    return this.projectBoardRepos.projectBoards().getProjectBoardCardForExecutionThread(threadId);
  }

  getProjectBoardDependencyWorkspacePathsForExecutionThread(threadId: string): string[] {
    const card = this.getProjectBoardCardForExecutionThread(threadId);
    if (!card) return [];
    return this.projectBoardRepos.projectBoardDependencyExecutionContexts().projectBoardDependencyWorkspacePathsForCard(card);
  }

  async importProjectBoardDependencyArtifactsForTask(input: {
    taskId: string;
    workspacePath: string;
    createdAt?: string;
  }): Promise<ProjectBoardDependencyArtifactImportResult> {
    return this.projectBoardRepos.projectBoardDependencyArtifacts().importProjectBoardDependencyArtifactsForTask(input);
  }

  getProjectBoardProofReviewContextForRun(runId: string): ProjectBoardProofReviewContext | undefined {
    return this.projectBoardRepos.projectBoardRunProgress().getProjectBoardProofReviewContextForRun(runId);
  }

  recordProjectBoardCardRunProgressEvent(input: {
    boardId: string;
    cardId: string;
    runId: string;
    title: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.projectBoardRepos.projectBoardRunProgress().recordProjectBoardCardRunProgressEvent(input);
  }

  recordProjectBoardTaskToolAction(input: {
    runId: string;
    cardId: string;
    taskId?: string;
    action: ProjectBoardTaskToolAction;
    toolName?: string;
    source?: ProjectBoardTaskToolActionTransport;
  }): OrchestrationRun | undefined {
    return this.projectBoardRepos.projectBoardRunProgress().recordProjectBoardTaskToolAction(input);
  }

  isProjectBoardProofReviewRunCurrent(runId: string, requireCurrentReview = false): boolean {
    return this.projectBoardRepos.projectBoardCardMutations().isProjectBoardProofReviewRunCurrent(runId, requireCurrentReview);
  }

  applyProjectBoardCardProofReview(input: {
    runId: string;
    review: ProjectBoardCardProofReview;
    requireCurrentReview?: boolean;
    allowStaleRun?: boolean;
  }): ProjectBoardCard | undefined {
    return this.projectBoardRepos.projectBoardCardMutations().applyProjectBoardCardProofReview(input);
  }

  beginProjectBoardCardRun(input: { runId: string }): ProjectBoardCard | undefined {
    return this.projectBoardRepos.projectBoardRunProgress().beginProjectBoardCardRun(input);
  }

  recomputeProjectBoardProofCoverage(input: RecomputeProjectBoardProofCoverageInput): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardProofSuggestions().recomputeProjectBoardProofCoverage(input);
  }

  applyProjectBoardClarificationDefaultSuggestions(input: ApplyProjectBoardClarificationDefaultSuggestionsInput): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardClarificationDefaults().applyProjectBoardClarificationDefaultSuggestions(input);
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
    return this.projectBoardRepos.projectBoardProofSuggestions().applyProjectBoardProofSuggestions(input);
  }

  resolveProjectBoardProofDecision(input: { cardId: string; action: ProjectBoardProofDecisionAction; reason?: string }): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().resolveProjectBoardProofDecision(input);
  }

  async resolveProjectBoardDeliverableIntegration(input: {
    boardId: string;
    runId: string;
    action: ProjectBoardDeliverableIntegrationAction;
    reason?: string;
  }): Promise<void> {
    return this.projectBoardRepos.projectBoardDeliverableIntegrations().resolveProjectBoardDeliverableIntegration(input);
  }

  resolveProjectBoardSplitDecision(input: { cardId: string; action: ProjectBoardSplitDecisionAction; reason?: string }): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().resolveProjectBoardSplitDecision(input);
  }

  ensureProjectBoardCardExecutionThreadForTask(input: { taskId: string; workspacePath: string }): ThreadSummary | undefined {
    return this.projectBoardRepos.projectBoardCardExecutionSessions().ensureProjectBoardCardExecutionThreadForTask(input);
  }

  copyProjectBoardSessionToThread(input: CopyProjectBoardSessionToThreadInput): ThreadSummary {
    return this.projectBoardRepos.projectBoardSessionCopies().copyProjectBoardSessionToThread(input);
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
    return this.projectBoardRepos.projectBoardExecutionReadiness().recordProjectBoardExecutionReadinessBlocker(input);
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
    return this.projectBoardRepos.projectBoardWorkflows().recordProjectBoardWorkflowCreated(input);
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
    return this.projectBoardRepos.projectBoardWorkflows().recordProjectBoardWorkflowRepair(input);
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
    return this.projectBoardRepos.projectBoardWorkflows().recordProjectBoardWorkflowSettingsUpdated(input);
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
    return this.projectBoardRepos.projectBoardWorkflows().recordProjectBoardWorkflowRawUpdated(input);
  }

  resolveProjectBoardWorkflowImpact(input: {
    boardId: string;
    action: ResolveOrchestrationWorkflowImpactAction;
    runIds: string[];
    workflowPath?: string;
    workflowHash?: string;
    createdAt?: string;
  }): { clearedRunIds: string[]; skippedRuns: { runId: string; reason: string }[] } {
    return this.projectBoardRepos.projectBoardWorkflows().resolveProjectBoardWorkflowImpact(input);
  }

  approveProjectBoardCard(cardId: string): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().approveProjectBoardCard(cardId);
  }

  createReadyProjectBoardTasks(boardId: string): ProjectBoardCard[] {
    return this.projectBoardRepos.projectBoardCardMutations().createReadyProjectBoardTasks(boardId);
  }

  private assertProjectBoardCardClaimAllowsLocalTicketization(card: ProjectBoardCard): void {
    const claims = projectBoardClaimSummaryFromEvents(this.projectBoardRepos.projectBoards().listProjectBoardEvents(card.boardId));
    const conflicts = claims.conflicts.filter((claim) => claim.cardId === card.id);
    if (conflicts.length > 0) {
      throw new Error(
        `Project board card ${card.title} has ${conflicts.length} claim conflict${conflicts.length === 1 ? "" : "s"}. Pull the board and resolve ownership before creating a Local Task.`,
      );
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
    return this.projectBoardRepos.projectBoardCardMutations().splitProjectBoardCard(cardId);
  }

  createProjectBoardManualCard(input: { boardId: string; title?: string; description?: string }): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().createManualCard(input);
  }

  attachLocalTaskToProjectBoard(input: { taskId: string; mode: "attach" | "evidence" }): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().attachLocalTaskToProjectBoard(input);
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
    return this.projectBoardRepos.projectBoardCardMutations().updateCard(input);
  }

  updateProjectBoardCardCandidateStatus(
    cardId: string,
    candidateStatus: ProjectBoardCardCandidateStatus,
    options: { actor?: "user" | "system"; reason?: string; relatedCardId?: string } = {},
  ): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().updateCardCandidateStatus(cardId, candidateStatus, options);
  }

  resolveProjectBoardCardPiUpdate(input: { cardId: string; action: "apply" | "ignore" }): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().resolvePiUpdate(input);
  }

  addProjectBoardCardRunFeedback(input: AddProjectBoardCardRunFeedbackInput): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().addRunFeedback(input);
  }

  applyProjectBoardDecisionImpactFeedback(input: ApplyProjectBoardDecisionImpactFeedbackInput): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().applyDecisionImpactFeedback(input);
  }

  refreshProjectBoardDecisionDrafts(input: RefreshProjectBoardDecisionDraftsInput): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().refreshDecisionDrafts(input);
  }

  stageProjectBoardSourceDraftPiUpdates(input: StageProjectBoardSourceDraftPiUpdatesInput): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardSources().stageProjectBoardSourceDraftPiUpdates(input);
  }

  stageProjectBoardDecisionDraftPiUpdates(input: StageProjectBoardDecisionDraftPiUpdatesInput): ProjectBoardCard {
    return this.projectBoardRepos.projectBoardCardMutations().stageDecisionDraftPiUpdates(input);
  }

  refreshProjectBoardSourceDrafts(input: RefreshProjectBoardSourceDraftsInput): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardSources().refreshProjectBoardSourceDrafts(input);
  }

  applyProjectBoardSourceImpactFeedback(input: ApplyProjectBoardSourceImpactFeedbackInput): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardSources().applyProjectBoardSourceImpactFeedback(input);
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
    const parent = projectBoardClosedParentForRunFollowUp(card, this.projectBoardRepos.projectBoards().listProjectBoardCards(card.boardId));
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
    return this.projectBoardRepos.projectBoardSources().replaceProjectBoardSources(boardId, sources);
  }

  getProjectBoardSource(sourceId: string): ProjectBoardSource {
    return this.projectBoardRepos.projectBoardSources().getProjectBoardSource(sourceId);
  }

  updateProjectBoardSource(input: { sourceId: string; kind: ProjectBoardSourceKind; includeInSynthesis?: boolean }): ProjectBoardSource {
    return this.projectBoardRepos.projectBoardSources().updateProjectBoardSource(input);
  }

  applyProjectBoardSourceClassifications(boardId: string, inputs: ProjectBoardSourceClassificationInput[]): ProjectBoardSource[] {
    return this.projectBoardRepos.projectBoardSources().applyProjectBoardSourceClassifications(boardId, inputs);
  }

  ensureProjectBoardQuestions(boardId: string): ProjectBoardQuestion[] {
    return this.projectBoardRepos.projectBoardQuestions().ensureProjectBoardQuestions(boardId);
  }

  getProjectBoardQuestion(questionId: string): ProjectBoardQuestion {
    return this.projectBoardRepos.projectBoardQuestions().getProjectBoardQuestion(questionId);
  }

  answerProjectBoardQuestion(questionId: string, answer: string): ProjectBoardQuestion {
    return this.projectBoardRepos.projectBoardQuestions().answerProjectBoardQuestion(questionId, answer);
  }

  applyProjectBoardKickoffDefaultSuggestions(input: ApplyProjectBoardKickoffDefaultSuggestionsInput): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardQuestions().applyProjectBoardKickoffDefaultSuggestions(input);
  }

  finalizeProjectBoardKickoff(boardId: string): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardLifecycle().finalizeProjectBoardKickoff(boardId);
  }

  buildActiveProjectBoardCharterProjectSummary(boardId: string, generatedAt = new Date().toISOString()): ProjectBoardCharterProjectSummary {
    return this.projectBoardRepos.projectBoardLifecycle().buildActiveProjectBoardCharterProjectSummary(boardId, generatedAt);
  }

  updateProjectBoardCharterProjectSummary(input: {
    boardId: string;
    summary: ProjectBoardCharterProjectSummary;
    title?: string;
    eventSummary?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): ProjectBoardSummary {
    return this.projectBoardRepos.projectBoardLifecycle().updateProjectBoardCharterProjectSummary(input);
  }

  getProjectBoardCharter(charterId: string): ProjectBoardCharter {
    return this.projectBoardRepos.projectBoards().getProjectBoardCharter(charterId);
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
    return this.withThreadScheduledCheckIns(this.threads().listThreads());
  }

  private listThreadsForSubagentStateInspection(): ThreadSummary[] {
    return this.threads().listThreadsForStateInspection();
  }

  private withThreadScheduledCheckIns(threads: ThreadSummary[]): ThreadSummary[] {
    const scheduledByThreadId = new Map<string, ThreadScheduledCheckInSummary>();
    const setScheduledCheckIn = (threadId: string, checkIn: ThreadScheduledCheckInSummary): void => {
      const existing = scheduledByThreadId.get(threadId);
      if (existing && existing.nextRunAt <= checkIn.nextRunAt) return;
      scheduledByThreadId.set(threadId, checkIn);
    };

    for (const schedule of this.automations().listAutomationSchedules()) {
      if (!schedule.enabled || !schedule.nextRunAt || !schedule.dedicatedThreadId) continue;
      setScheduledCheckIn(schedule.dedicatedThreadId, {
        sourceKind: "automation_schedule",
        scheduleId: schedule.id,
        nextRunAt: schedule.nextRunAt,
        targetKind: schedule.targetKind as AutomationScheduleTargetKind,
        targetLabel: schedule.targetLabel,
      });
    }

    for (const wake of this.threadWakeContinuations().listPendingThreadWakeContinuations()) {
      setScheduledCheckIn(wake.threadId, {
        sourceKind: "thread_wake",
        wakeId: wake.id,
        nextRunAt: wake.dueAt,
        targetKind: "thread_wake",
        targetLabel: "this thread",
      });
    }

    if (!scheduledByThreadId.size) return threads;
    return threads.map((thread) => {
      const scheduledCheckIn = scheduledByThreadId.get(thread.id);
      return scheduledCheckIn ? { ...thread, scheduledCheckIn } : thread;
    });
  }

  findReusableEmptyThread(): ThreadSummary | undefined {
    return this.threads().findReusableEmptyThread();
  }

  getThread(threadId: string): ThreadSummary {
    const thread = this.threads().getThread(threadId);
    return this.withThreadScheduledCheckIns([thread])[0] ?? thread;
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

  scheduleThreadWakeContinuation(input: ScheduleThreadWakeContinuationInput): ThreadWakeContinuation {
    return this.threadWakeContinuations().scheduleThreadWakeContinuation(input);
  }

  listPendingThreadWakeContinuations(): ThreadWakeContinuation[] {
    return this.threadWakeContinuations().listPendingThreadWakeContinuations();
  }

  listDueThreadWakeContinuations(nowIso: string, limit?: number): ThreadWakeContinuation[] {
    return this.threadWakeContinuations().listDueThreadWakeContinuations(nowIso, limit);
  }

  markThreadWakeContinuationDelivered(id: string): ThreadWakeContinuation | undefined {
    return this.threadWakeContinuations().markThreadWakeContinuationDelivered(id);
  }

  markThreadWakeContinuationFailed(id: string, error: string): ThreadWakeContinuation | undefined {
    return this.threadWakeContinuations().markThreadWakeContinuationFailed(id, error);
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
    return this.subagentRunCreations().createSubagentRun(input);
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
    const parentRunIds = input.parentRunId ? [input.parentRunId] : [...new Set(runs.map((run) => run.parentRunId))];
    return summarizeSubagentObservability({
      runs,
      runEvents: runs.flatMap((run) => this.listSubagentRunEvents(run.id)),
      waitBarriers: input.parentRunId ? this.listSubagentWaitBarriersForParentRun(input.parentRunId) : this.listSubagentWaitBarriers(),
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

  getSubagentMaturitySnapshot(
    input: Omit<SubagentMaturityInput, "observability" | "restartReconciliation"> = {},
  ): SubagentMaturitySnapshot {
    return this.subagentMaturitySnapshots().getSubagentMaturitySnapshot(input);
  }

  getSubagentRetentionPlan(
    input: { now?: string; cleanupWindowMs?: number; maxRetainedChildrenPerParent?: number } = {},
  ): SubagentRetentionPlan {
    return this.subagentRetentionCleanups().getSubagentRetentionPlan(input);
  }

  applySubagentRetentionCleanup(input: {
    featureFlagSnapshot: AmbientFeatureFlagSnapshot;
    now?: string;
    cleanupWindowMs?: number;
    maxRetainedChildrenPerParent?: number;
  }): SubagentRetentionCleanupResult {
    return this.subagentRetentionCleanups().applySubagentRetentionCleanup(input);
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
    return this.subagentParentStopCascades().cascadeSubagentParentRunStopped(input);
  }

  listSubagentRunEvents(runId: string): SubagentRunEventSummary[] {
    return this.subagentRuns().listSubagentRunEvents(runId);
  }

  listSubagentSpawnEdges(): SubagentSpawnEdgeSummary[] {
    return this.subagentRuns().listSubagentSpawnEdges();
  }

  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary {
    this.getSubagentRun(runId);
    return this.subagentRuns().appendSubagentRunEvent(runId, input);
  }

  appendSubagentMailboxEvent(
    runId: string,
    input: {
      direction: SubagentMailboxDirection;
      type: string;
      payload: unknown;
      deliveryState?: SubagentMailboxDeliveryState;
      createdAt?: string;
      deliveredAt?: string;
    },
  ): SubagentMailboxEventSummary {
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
    return this.subagentRunCompletions().appendSubagentLifecycleInterruptionParentMailboxEvent(input);
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
    return this.subagentRunCompletions().upsertSubagentGroupedCompletionNotification(input);
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

  recordSubagentPromptSnapshot(
    runId: string,
    input: { prompt: string; snapshot: unknown; createdAt?: string },
  ): SubagentPromptSnapshotSummary {
    this.getSubagentRun(runId);
    return this.subagentSnapshots().recordSubagentPromptSnapshot(runId, input);
  }

  listSubagentPromptSnapshots(runId: string): SubagentPromptSnapshotSummary[] {
    this.getSubagentRun(runId);
    return this.subagentSnapshots().listSubagentPromptSnapshots(runId);
  }

  recordSubagentToolScopeSnapshot(
    runId: string,
    input: { scope: SubagentToolScopeSnapshotSummary["scope"]; resolverInputs?: unknown; createdAt?: string },
  ): SubagentToolScopeSnapshotSummary {
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
    ownerKind?: SubagentWaitBarrierSummary["ownerKind"];
    ownerId?: string;
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
      ownerKind: input.ownerKind,
      ownerId: input.ownerId,
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

  getSubagentRepairDiagnostics(
    options: {
      now?: string;
      maxIssues?: number;
      maxMessageChars?: number;
      maxAffectedIds?: number;
    } = {},
  ): SubagentRepairDiagnosticsReport {
    return this.subagentRepairDiagnostics().getSubagentRepairDiagnostics(options);
  }

  repairSubagentSpawnEdges(
    options: { now?: string; dryRun: true } | { now?: string; dryRun?: false; featureFlagSnapshot: AmbientFeatureFlagSnapshot },
  ): SubagentPersistedChildTreeRepairResult {
    return this.subagentSpawnEdgeRepairs().repairSubagentSpawnEdges(options);
  }

  reconcileSubagentRestartState(options: { now?: string } = {}): SubagentRestartReconciliationSummary {
    return this.subagentRestartReconciliations().reconcileSubagentRestartState(options);
  }

  private recreateRequiredSubagentWaitBarrierIfMissing(input: {
    run: SubagentRunSummary;
    existingWaitBarrierIds: readonly string[];
    now: string;
  }): SubagentWaitBarrierSummary | undefined {
    if (input.run.dependencyMode !== "required") return undefined;
    if (input.existingWaitBarrierIds.length > 0) return undefined;
    const existing = this.listSubagentWaitBarriersForParentRun(input.run.parentRunId).find(
      (barrier) =>
        barrier.parentThreadId === input.run.parentThreadId &&
        barrier.status === "waiting_on_children" &&
        barrier.childRunIds.includes(input.run.id) &&
        ["required_all", "required_any", "quorum"].includes(barrier.dependencyMode),
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

  markSubagentRunStatus(
    runId: string,
    status: SubagentRunStatus,
    options: { resultArtifact?: unknown; now?: string } = {},
  ): SubagentRunSummary {
    return this.subagentRunCompletions().markSubagentRunStatus(runId, status, options);
  }

  closeSubagentRun(runId: string, now = new Date().toISOString()): SubagentRunSummary {
    return this.subagentRunCompletions().closeSubagentRun(runId, now);
  }

  updateSubagentRunMutationWorkspaceLease(runId: string, lease: unknown): SubagentRunSummary {
    const current = this.getSubagentRun(runId);
    const validated = assertValidMutationWorkspaceLease({
      ...(typeof lease === "object" && lease && !Array.isArray(lease) ? (lease as Record<string, unknown>) : {}),
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
    return this.symphonyWorkflowRecipes().saveSymphonyWorkflowRecipe(input, options);
  }

  archiveWorkflowRecording(id: string, input: { baseVersion: number; reason?: string }): WorkflowRecordingLibraryDescription {
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
    return this.saveWorkflowLabRun(workflowLabRecordEvaluation({ run, variantId, evaluation, status, evaluatedAt: now }));
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
    this.saveWorkflowLabRun(workflowLabApplyVariantAdoption({ run, variant, adoptedVersion: updated.version, adoptedAt: now }));
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

  addMessage(input: { threadId: string; role: ChatMessage["role"]; content: string; metadata?: Record<string, unknown> }): ChatMessage {
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
    input: {
      path: string;
      generatedAt: string;
      validation?: PlannerDurableArtifactValidationResult;
      workflowState?: PlannerPlanWorkflowState;
    },
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

  promotePlannerDurableArtifactToBoardSource(artifactId: string): ProjectBoardSource | undefined {
    return this.projectBoardDurablePlanSources().promotePlannerDurableArtifactToBoardSource(artifactId);
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
    return this.workflowAgentReadModels().listWorkflowAgentFolders();
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
    return this.workflowAgentReadModels().workflowAgentThreadSummaryFromCreatedRow(row);
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
    return this.workflowAgentReadModels().getWorkflowAgentThreadSummary(threadId);
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
    return this.projectBoardLinkedTasks().projectBoardClaimBlockedTaskIds();
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
    this.getThread(input.executionPlan.parent.threadId);
    const parentRun = this.getRunRecord(input.executionPlan.parent.runId);
    if (parentRun.threadId !== input.executionPlan.parent.threadId) {
      throw new Error("Cannot queue callable workflow task for a parent run on a different thread.");
    }
    const plannedParentMessageId = input.executionPlan.parent.assistantMessageId;
    if (plannedParentMessageId && parentRun.assistantMessageId !== plannedParentMessageId) {
      throw new Error("Cannot queue callable workflow task for a mismatched parent assistant message.");
    }
    const parentMessageId = plannedParentMessageId ?? parentRun.assistantMessageId;
    const draft = callableWorkflowQueuedTaskDraftFromExecutionPlan(input.executionPlan, { parentMessageId });
    const existing = this.findCallableWorkflowTaskByLaunchId(draft.launchId);
    if (existing) return existing;

    const now = input.createdAt ?? input.executionPlan.createdAt ?? new Date().toISOString();
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
    return this.callableWorkflowTaskPreparations().bindCallableWorkflowTaskPatternGraphChild(input);
  }

  reconcileCallableWorkflowTaskRestartState(options: { now?: string } = {}): CallableWorkflowTaskRestartReconciliationSummary {
    return this.callableWorkflowTaskRestartReconciliations().reconcileCallableWorkflowTaskRestartState(options);
  }

  beginCallableWorkflowTaskCompilerHandoff(
    id: string,
    options: { createdAt?: string } = {},
  ): { task: CallableWorkflowTaskSummary; handoffPlan: CallableWorkflowCompilerHandoffPlan } {
    return this.callableWorkflowTaskPreparations().beginCallableWorkflowTaskCompilerHandoff(id, options);
  }

  linkCallableWorkflowTaskArtifact(input: { id: string; workflowArtifactId: string; createdAt?: string }): CallableWorkflowTaskSummary {
    return this.callableWorkflowTaskPreparations().linkCallableWorkflowTaskArtifact(input);
  }

  markCallableWorkflowTaskRunStarted(input: { id: string; workflowRunId: string; createdAt?: string }): CallableWorkflowTaskSummary {
    return this.callableWorkflowTaskLifecycle().markCallableWorkflowTaskRunStarted(input);
  }

  markCallableWorkflowTaskRunFinished(input: {
    id: string;
    workflowRunId: string;
    runStatus: WorkflowRunStatus;
    errorMessage?: string;
    createdAt?: string;
  }): CallableWorkflowTaskSummary {
    return this.callableWorkflowTaskLifecycle().markCallableWorkflowTaskRunFinished(input);
  }

  recordCallableWorkflowTaskControl(input: {
    id: string;
    action: CallableWorkflowTaskControlAction;
    reason?: string;
    workflowRunId?: string;
    createdAt?: string;
  }): void {
    this.callableWorkflowTaskLifecycle().recordCallableWorkflowTaskControl(input);
  }

  failCallableWorkflowTask(input: { id: string; errorMessage: string; createdAt?: string }): CallableWorkflowTaskSummary {
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

  pauseCallableWorkflowTask(input: {
    id: string;
    statusLabel: string;
    runnerDeferredReason: string;
    errorMessage?: string;
    createdAt?: string;
  }): CallableWorkflowTaskSummary {
    return this.callableWorkflowTaskLifecycle().pauseCallableWorkflowTask(input);
  }

  cancelCallableWorkflowTask(input: { id: string; reason?: string; createdAt?: string }): CallableWorkflowTaskSummary {
    return this.callableWorkflowTaskLifecycle().cancelCallableWorkflowTask(input);
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

  compactExpiredWorkflowTraceData(
    input: {
      now?: string;
      debugRetentionDays?: number;
    } = {},
  ): { cutoff: string; eventsCompacted: number; modelCallsCompacted: number } {
    return this.workflowTraceRetention().compactExpiredWorkflowTraceData(input);
  }

  private createWorkflowAgentThreadRecord(input: CreateWorkflowAgentThreadInput): WorkflowAgentThreadRow {
    return this.workflowAgentThreads().createWorkflowAgentThreadRecord(input);
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

  private requireWorkflowGraphSnapshotForThread(
    snapshotId: string | undefined,
    workflowThreadId: string,
  ): WorkflowGraphSnapshot | undefined {
    if (!snapshotId) return undefined;
    const snapshot = this.tryGetWorkflowGraphSnapshot(snapshotId);
    if (!snapshot) throw new Error(`Workflow graph snapshot not found: ${snapshotId}`);
    if (snapshot.workflowThreadId !== workflowThreadId) {
      throw new Error(`Workflow graph snapshot ${snapshotId} does not belong to workflow thread ${workflowThreadId}.`);
    }
    return snapshot;
  }

  interruptActiveRuns(reason = INTERRUPTED_RUN_MESSAGE): number {
    return this.activeRunRecoveries().interruptActiveRuns(reason);
  }

  stallActiveOrchestrationRuns(): number {
    return this.activeRunRecoveries().stallActiveOrchestrationRuns();
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
      ignoreBarrier: (barrier) => this.subagentWaitBarrierBelongsToNonblockingCallableWorkflowTask(barrier),
    });
  }

  private subagentWaitBarrierBelongsToNonblockingCallableWorkflowTask(barrier: SubagentWaitBarrierSummary): boolean {
    if (barrier.ownerKind !== "callable_workflow_symphony_launch_bridge" || !barrier.ownerId) return false;
    let task: CallableWorkflowTaskSummary;
    try {
      task = this.getCallableWorkflowTask(barrier.ownerId);
    } catch {
      return false;
    }
    return task.parentRunId === barrier.parentRunId && task.blocking === false;
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
    errorMessage?: string | null;
    updatedAt: string;
    startedAt?: string;
    completedAt?: string;
  }): CallableWorkflowTaskSummary {
    return this.callableWorkflowTasks().updateCallableWorkflowTaskRow(input);
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

  private threadWakeContinuations(): ProjectStoreThreadWakeRepository {
    return new ProjectStoreThreadWakeRepository(this.requireDb());
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
      upsertProgressNotification: (record, createdAt) => this.upsertSubagentBatchProgressNotificationForRecord(record, createdAt),
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

  private plannerQuestionBlockRepairs(): ProjectStorePlannerQuestionBlockRepairRepository {
    return new ProjectStorePlannerQuestionBlockRepairRepository(this.requireDb());
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

  private workflowAgentReadModels(): ProjectStoreWorkflowAgentReadModelRepository {
    return new ProjectStoreWorkflowAgentReadModelRepository({
      ensureWorkflowAgentThreadLinks: () => this.workflowArtifacts().ensureWorkflowAgentThreadLinks(),
      getWorkspace: () => this.getWorkspace(),
      latestWorkflowVersionForThread: (workflowThreadId) => this.workflowVersions().latestWorkflowVersionForThread(workflowThreadId),
      listWorkflowAgentFolderRows: () => this.workflowAgentThreads().listWorkflowAgentFolderRows(),
      listWorkflowAgentThreadRows: () => this.workflowAgentThreads().listWorkflowAgentThreadRows(),
      listWorkflowDiscoveryQuestions: (workflowThreadId) => this.listWorkflowDiscoveryQuestions(workflowThreadId),
      listWorkflowGraphSnapshots: (workflowThreadId) => this.listWorkflowGraphSnapshots(workflowThreadId),
      listWorkflowRunEvents: (runId) => this.listWorkflowRunEvents(runId),
      listWorkflowRuns: (artifactId, limit) => this.listWorkflowRuns(artifactId, limit),
      requireWorkflowAgentThread: (threadId) => this.requireWorkflowAgentThread(threadId),
      tryGetWorkflowArtifact: (artifactId) => this.tryGetWorkflowArtifact(artifactId),
      tryGetWorkflowGraphSnapshot: (snapshotId) => this.tryGetWorkflowGraphSnapshot(snapshotId),
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
      requireWorkflowGraphSnapshotForThread: (snapshotId, workflowThreadId) =>
        this.requireWorkflowGraphSnapshotForThread(snapshotId, workflowThreadId),
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

  private symphonyWorkflowRecipes(): ProjectStoreSymphonyWorkflowRecipeRepository {
    return new ProjectStoreSymphonyWorkflowRecipeRepository({
      describeWorkflowRecording: (id, input) => this.describeWorkflowRecording(id, input),
      getThread: (threadId) => this.getThread(threadId),
      workflowRecordingLibraryIndexes: () => this.workflowRecordings().libraryIndexes(),
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

  private callableWorkflowTaskLifecycle(): ProjectStoreCallableWorkflowTaskLifecycleRepository {
    return new ProjectStoreCallableWorkflowTaskLifecycleRepository({
      appendWorkflowRunEvent: (input) => this.appendWorkflowRunEvent(input),
      getCallableWorkflowTask: (id) => this.getCallableWorkflowTask(id),
      getWorkflowRun: (runId) => this.getWorkflowRun(runId),
      listWorkflowRunEvents: (runId) => this.listWorkflowRunEvents(runId),
      updateCallableWorkflowTaskRow: (input) => this.updateCallableWorkflowTaskRow(input),
      updateWorkflowRun: (input) => this.updateWorkflowRun(input),
    });
  }

  private callableWorkflowTaskPreparations(): ProjectStoreCallableWorkflowTaskPreparationRepository {
    return new ProjectStoreCallableWorkflowTaskPreparationRepository({
      bindPatternGraphSnapshot: (input) => this.callableWorkflowTasks().bindPatternGraphSnapshot(input),
      getCallableWorkflowTask: (id) => this.getCallableWorkflowTask(id),
      getSubagentRun: (runId) => this.getSubagentRun(runId),
      getThread: (threadId) => this.getThread(threadId),
      getWorkflowArtifact: (artifactId) => this.getWorkflowArtifact(artifactId),
      updateCallableWorkflowTaskRow: (input) => this.updateCallableWorkflowTaskRow(input),
    });
  }

  private callableWorkflowTaskRestartReconciliations(): ProjectStoreCallableWorkflowTaskRestartReconciliationRepository {
    return new ProjectStoreCallableWorkflowTaskRestartReconciliationRepository(this.requireDb(), {
      getCallableWorkflowTask: (id) => this.getCallableWorkflowTask(id),
      listCallableWorkflowTasks: () => this.listCallableWorkflowTasks(),
      listThreads: () => this.listThreads(),
      listWorkflowArtifacts: () => this.listWorkflowArtifacts(),
      listWorkflowRunsForRestart: () => this.workflowRuns().listWorkflowRunsForRestart(),
      markCallableWorkflowTaskRunFinished: (input) => this.markCallableWorkflowTaskRunFinished(input),
      tryGetWorkflowRun: (runId) => this.tryGetWorkflowRun(runId),
    });
  }

  private activeRunRecoveries(): ProjectStoreActiveRunRecoveryRepository {
    return new ProjectStoreActiveRunRecoveryRepository(this.requireDb(), {
      finishRun: (runId, status, errorMessage) => this.finishRun(runId, status, errorMessage),
      listActiveRuns: () => this.listActiveRuns(),
      replaceMessage: (messageId, content, metadata) => this.replaceMessage(messageId, content, metadata),
      updateOrchestrationRun: (input) => this.updateOrchestrationRun(input),
      updateOrchestrationTask: (input) => this.updateOrchestrationTask(input),
    });
  }

  private subagentRunCreations(): ProjectStoreSubagentRunCreationRepository {
    return new ProjectStoreSubagentRunCreationRepository(this.requireDb(), {
      appendSubagentRunEventInternal: (runId, input) => this.appendSubagentRunEventInternal(runId, input),
      assertSubagentCanonicalTaskPathAvailableForSpawn: (input) => this.assertSubagentCanonicalTaskPathAvailableForSpawn(input),
      createReservedSubagentRun: (input) => this.subagentRuns().createReservedSubagentRun(input),
      createThread: (title, workspacePath, options) => this.createThread(title, workspacePath, options),
      getSubagentRun: (runId) => this.getSubagentRun(runId),
      getThread: (threadId) => this.getThread(threadId),
      nextSubagentChildOrder: (parentThreadId) => this.threads().nextSubagentChildOrder(parentThreadId),
    });
  }

  private subagentSpawnEdgeRepairs(): ProjectStoreSubagentSpawnEdgeRepairRepository {
    return new ProjectStoreSubagentSpawnEdgeRepairRepository(this.requireDb(), {
      appendSubagentRunEventInternal: (runId, input) => this.appendSubagentRunEventInternal(runId, input),
      deleteSubagentSpawnEdgesForChild: (childRunId) => this.subagentRuns().deleteSubagentSpawnEdgesForChild(childRunId),
      insertSubagentSpawnEdge: (edge) => this.subagentRuns().insertSubagentSpawnEdge(edge),
      listAllSubagentRuns: () => this.listAllSubagentRuns(),
      listSubagentRunEvents: (runId) => this.listSubagentRunEvents(runId),
      listSubagentSpawnEdges: () => this.listSubagentSpawnEdges(),
      listSubagentWaitBarriers: () => this.listSubagentWaitBarriers(),
      listThreadsForSubagentStateInspection: () => this.listThreadsForSubagentStateInspection(),
      replaceSubagentSpawnEdge: (edge) => this.subagentRuns().replaceSubagentSpawnEdge(edge),
    });
  }

  private subagentParentStopCascades(): ProjectStoreSubagentParentStopCascadeRepository {
    return new ProjectStoreSubagentParentStopCascadeRepository({
      appendSubagentParentMailboxEvent: (input) => this.appendSubagentParentMailboxEvent(input),
      appendSubagentRunEvent: (runId, input) => this.appendSubagentRunEvent(runId, input),
      cancelPendingParentToChildMailboxEvents: (input) => cancelPendingParentToChildMailboxEvents(this, input),
      getSubagentRun: (runId) => this.getSubagentRun(runId),
      listAllSubagentRuns: () => this.listAllSubagentRuns(),
      listSubagentWaitBarriersForParentRun: (parentRunId) => this.listSubagentWaitBarriersForParentRun(parentRunId),
      markSubagentRunStatus: (runId, status, options) => this.markSubagentRunStatus(runId, status, options),
      resolveSubagentParentStopWaitBarrier: (input) =>
        resolveSubagentParentStopWaitBarrier({
          store: this,
          ...input,
        }),
    });
  }

  private subagentRunCompletions(): ProjectStoreSubagentRunCompletionRepository {
    return new ProjectStoreSubagentRunCompletionRepository({
      appendSubagentParentMailboxEvent: (input) => this.appendSubagentParentMailboxEvent(input),
      appendSubagentRunEventInternal: (runId, input) => this.appendSubagentRunEventInternal(runId, input),
      closeSubagentRun: (input) => this.subagentRuns().closeSubagentRun(input),
      getSubagentRun: (runId) => this.getSubagentRun(runId),
      latestQueuedSubagentParentMailboxEvent: (parentRunId, type) => this.latestQueuedSubagentParentMailboxEvent(parentRunId, type),
      listSubagentRunEvents: (runId) => this.listSubagentRunEvents(runId),
      parentMessageIdForSubagentRun: (runId) => this.parentMessageIdForSubagentRun(runId),
      updateSubagentChildStatus: (childThreadId, status, now) => this.threads().updateSubagentChildStatus(childThreadId, status, now),
      updateSubagentParentMailboxPayload: (input) => this.subagentParentMailboxes().updateSubagentParentMailboxPayload(input),
      updateSubagentRunStatus: (input) => this.subagentRuns().updateSubagentRunStatus(input),
    });
  }

  private subagentRestartReconciliations(): ProjectStoreSubagentRestartReconciliationRepository {
    return new ProjectStoreSubagentRestartReconciliationRepository({
      appendSubagentLifecycleInterruptionParentMailboxEvent: (input) => this.appendSubagentLifecycleInterruptionParentMailboxEvent(input),
      appendSubagentParentMailboxEvent: (input) => this.appendSubagentParentMailboxEvent(input),
      appendSubagentRunEvent: (runId, input) => this.appendSubagentRunEvent(runId, input),
      getSubagentRun: (runId) => this.getSubagentRun(runId),
      getSubagentWaitBarrier: (barrierId) => this.getSubagentWaitBarrier(barrierId),
      listAllSubagentRuns: () => this.listAllSubagentRuns(),
      listSubagentRunEvents: (runId) => this.listSubagentRunEvents(runId),
      listSubagentSpawnEdges: () => this.listSubagentSpawnEdges(),
      listSubagentWaitBarriers: () => this.listSubagentWaitBarriers(),
      listThreadsForSubagentStateInspection: () => this.listThreadsForSubagentStateInspection(),
      markSubagentParentControlBarrierReconciled: (input) => this.markSubagentParentControlBarrierReconciled(input),
      markSubagentRunStatus: (runId, status, options) => this.markSubagentRunStatus(runId, status, options),
      parentMessageIdForSubagentWaitBarrier: (barrier) => this.parentMessageIdForSubagentWaitBarrier(barrier),
      recreateRequiredSubagentWaitBarrierIfMissing: (input) => this.recreateRequiredSubagentWaitBarrierIfMissing(input),
    });
  }

  private subagentMaturitySnapshots(): ProjectStoreSubagentMaturitySnapshotRepository {
    return new ProjectStoreSubagentMaturitySnapshotRepository({
      getFeatureFlagSettings: () => this.getFeatureFlagSettings(),
      getSubagentObservabilitySummary: (input) => this.getSubagentObservabilitySummary(input),
      listAllSubagentRuns: () => this.listAllSubagentRuns(),
      listSubagentMaturityEvidence: () => this.listSubagentMaturityEvidence(),
      listSubagentPromptSnapshots: (runId) => this.listSubagentPromptSnapshots(runId),
      listSubagentRunEvents: (runId) => this.listSubagentRunEvents(runId),
      listSubagentSpawnEdges: () => this.listSubagentSpawnEdges(),
      listSubagentToolScopeSnapshots: (runId) => this.listSubagentToolScopeSnapshots(runId),
      listSubagentWaitBarriers: () => this.listSubagentWaitBarriers(),
      listThreadsForSubagentStateInspection: () => this.listThreadsForSubagentStateInspection(),
    });
  }

  private subagentRepairDiagnostics(): ProjectStoreSubagentRepairDiagnosticsRepository {
    return new ProjectStoreSubagentRepairDiagnosticsRepository(this.requireDb(), {
      listAllSubagentRuns: () => this.listAllSubagentRuns(),
      listCallableWorkflowTasks: () => this.listCallableWorkflowTasks(),
      listSubagentPromptSnapshots: (runId) => this.listSubagentPromptSnapshots(runId),
      listSubagentRunEvents: (runId) => this.listSubagentRunEvents(runId),
      listSubagentSpawnEdges: () => this.listSubagentSpawnEdges(),
      listSubagentToolScopeSnapshots: (runId) => this.listSubagentToolScopeSnapshots(runId),
      listSubagentWaitBarriers: () => this.listSubagentWaitBarriers(),
      listThreads: () => this.listThreads(),
      listThreadsForSubagentStateInspection: () => this.listThreadsForSubagentStateInspection(),
      listWorkflowArtifacts: () => this.listWorkflowArtifacts(),
      listWorkflowRunsForRestart: () => this.workflowRuns().listWorkflowRunsForRestart(),
    });
  }

  private subagentRetentionCleanups(): ProjectStoreSubagentRetentionCleanupRepository {
    return new ProjectStoreSubagentRetentionCleanupRepository({
      appendSubagentRunEventInternal: (runId, input) => this.appendSubagentRunEventInternal(runId, input),
      archiveSubagentChildThread: (threadId, archivedAt) => this.threads().archiveSubagentChildThread(threadId, archivedAt),
      listAllSubagentRuns: () => this.listAllSubagentRuns(),
      listSubagentWaitBarriers: () => this.listSubagentWaitBarriers(),
      listThreadsForSubagentStateInspection: () => this.listThreadsForSubagentStateInspection(),
    });
  }

  private projectBoardDurablePlanSources(): ProjectStoreProjectBoardDurablePlanSourceRepository {
    return new ProjectStoreProjectBoardDurablePlanSourceRepository(this.requireDb(), {
      appendProjectBoardEvent: (input) => this.appendProjectBoardEvent(input),
      createProjectBoard: (input) => this.createProjectBoard(input),
      getPlannerPlanArtifact: (artifactId) => this.getPlannerPlanArtifact(artifactId),
      getProjectArtifactWorkspacePath: () => this.getProjectArtifactWorkspacePath(),
      getProjectBoard: (boardId) => this.getProjectBoard(boardId),
      getProjectBoardForPath: (projectPath, sourceThreadId) => this.getProjectBoardForPath(projectPath, sourceThreadId),
      getThreadTitle: (threadId) => this.getThread(threadId).title,
      replaceProjectBoardSources: (boardId, sources) => this.replaceProjectBoardSources(boardId, sources),
    });
  }

  private projectBoardLinkedTasks(): ProjectStoreProjectBoardLinkedTaskRepository {
    return new ProjectStoreProjectBoardLinkedTaskRepository(this.requireDb(), {
      getProjectBoard: (boardId) => this.getProjectBoard(boardId),
      getProjectBoardCardForOrchestrationTask: (taskId) => this.getProjectBoardCardForOrchestrationTask(taskId),
      getOrchestrationTask: (taskId) => this.getOrchestrationTask(taskId),
      listOrchestrationTasks: () => this.listOrchestrationTasks(),
      listProjectBoardCards: (boardId) => this.projectBoardRepos.projectBoards().listProjectBoardCards(boardId),
      listProjectBoardEvents: (boardId) => this.projectBoardRepos.projectBoards().listProjectBoardEvents(boardId),
      dependencyAwareProjectBoardCardTaskDescription: (input) =>
        this.projectBoardRepos.projectBoardDependencyExecutionContexts().projectBoardCardTaskDescription(input),
    });
  }

  private orchestration(): ProjectStoreOrchestrationRepository {
    return new ProjectStoreOrchestrationRepository(this.requireDb(), {
      defaultProjectPath: defaultOrchestrationProjectPath(this.getWorkspace().path),
      projectBoardTaskHasClosedDoneCard: (taskId) => this.projectBoardLinkedTasks().projectBoardTaskHasClosedDoneCard(taskId),
      projectBoardClaimBlockedTaskIds: () => this.projectBoardLinkedTasks().projectBoardClaimBlockedTaskIds(),
      syncProjectBoardCardsForLinkedTasks: () => this.projectBoardLinkedTasks().syncProjectBoardCardsForLinkedTasks(),
      reviewProjectBoardCardProofForRun: (run) => this.projectBoardRepos.projectBoardRunProgress().reviewProjectBoardCardProofForRun(run),
    });
  }

  private syncProjectBoardCardsForLinkedTasks(): void {
    this.projectBoardLinkedTasks().syncProjectBoardCardsForLinkedTasks();
  }

  private projectBoardTaskHasClosedDoneCard(taskId: string): boolean {
    return this.projectBoardLinkedTasks().projectBoardTaskHasClosedDoneCard(taskId);
  }

  private syncProjectBoardTaskBlockers(boardId: string): void {
    this.projectBoardLinkedTasks().syncProjectBoardTaskBlockers(boardId);
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
    return this.projectBoardLinkedTasks().projectBoardCardTaskDescription(card);
  }

  private latestOrchestrationRunForTask(taskId: string): OrchestrationRun | undefined {
    return this.orchestration().latestOrchestrationRunForTask(taskId);
  }

  private latestDependencyArtifactRunForTask(taskId: string): OrchestrationRun | undefined {
    return this.orchestration().latestDependencyArtifactRunForTask(taskId);
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
}
