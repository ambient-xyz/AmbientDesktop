import Database from "better-sqlite3";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
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
  ThreadSummary,
  ThreadWorktreeSummary,
} from "../../shared/threadTypes";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type {
  OrchestrationRun,
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
} from "../../shared/workflowTypes";
import type {
  AmbientPermissionGrant,
  CreateAmbientPermissionGrantInput,
  PermissionAuditDecision,
  PermissionAuditEntry,
  PermissionMode,
  PermissionRisk,
} from "../../shared/permissionTypes";
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
import type { WorkspaceSearchScope, WorkspaceSearchResult, WorkspaceState } from "../../shared/workspaceTypes";
import type { AmbientModelRuntimeCatalog } from "../../shared/ambientModels";
import type { AmbientFeatureFlagSettings, UpdateFeatureFlagSettingsInput } from "../../shared/featureFlags";
import type { AgentMemorySettings, UpdateAgentMemorySettingsInput } from "../../shared/agentMemorySettings";
import type { SymphonyWorkflowRecipePreset } from "../../shared/symphonyWorkflowRecipes";
import {
  workflowRecordingLibraryVersions,
  workflowRecordingNextSavedPlaybook,
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
import type { PlannerPlanArtifactInput } from "./plannerArtifactRepository";
import type { CreateProjectStoreThreadDefaults } from "./threadRepository";
import type { ScheduleThreadWakeContinuationInput, ThreadWakeContinuation } from "./threadWakeRepository";
import type { ApplyProjectBoardClarificationDefaultSuggestionsInput } from "./projectBoardClarificationDefaultRepository";
import type { ApplyProjectBoardKickoffDefaultSuggestionsInput } from "./projectBoardQuestionRepository";
import {
  createProjectStoreProjectBoardRepositoryFactory,
  type ProjectStoreProjectBoardRepositoryFactoryHost,
} from "./projectBoardRepositoryFactory";
import { createProjectStoreRepositoryFactory, type ProjectStoreRepositoryFactoryHost } from "./projectStoreRepositoryFactory";
import { ProjectStoreCoreFacadeMethods } from "./projectStoreCoreFacadeMethods";
import { projectBoardSourceIncludedInSynthesis, projectBoardSourceKey } from "./projectStoreProjectBoardFacade";
import { projectBoardPlanTitleIsGeneric } from "../../shared/projectBoardPlanIdentity";
import type { ProjectBoardArtifactProjection } from "./projectStoreProjectBoardFacade";
import {
  mapProjectBoardEventRow,
  normalizeProjectBoardCardRunFeedback,
  normalizeProjectBoardCardRunFeedbackSource,
  normalizeProjectBoardClarificationAnswers,
  normalizeProjectBoardClarificationDecisions,
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
  projectBoardCandidateStatusForSynthesisUpdate,
  projectBoardChangedClarificationAnswer,
  projectBoardClarificationDecisionsEquivalent,
  projectBoardAfterRunHookSucceeded,
  projectBoardHasImplementationEvidence,
  projectBoardProofObject,
  projectBoardMissingProofItems,
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
import { type ProjectBoardTaskToolAction, type ProjectBoardTaskToolActionTransport } from "./projectStoreProjectBoardFacade";
import { type ProjectBoardSynthesisCardInput, type ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import { dedupeProjectBoardQuestions } from "../../shared/projectBoardQuestionDedupe";
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
import { parseJsonArray, stringFromRecord } from "./projectStoreJson";

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

export class ProjectStore extends ProjectStoreCoreFacadeMethods {
  private db?: Database.Database;
  private workspace?: WorkspaceState;
  protected readonly projectBoardRepos = createProjectStoreProjectBoardRepositoryFactory(
    this as unknown as ProjectStoreProjectBoardRepositoryFactoryHost,
  );
  protected readonly repos = createProjectStoreRepositoryFactory(this as unknown as ProjectStoreRepositoryFactoryHost);

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
    this.repos.automations().ensureDefaultAutomationFolder();
    this.repos.threads().ensureDefaultThread(this.threadCreationDefaults());
    if (options.recoverActiveRuns ?? false) this.interruptActiveRuns();
    if (options.recoverOrchestrationRuns ?? false) this.stallActiveOrchestrationRuns();
    this.repos.plannerQuestionBlockRepairs().repairPlannerPlanQuestionBlocks();
    this.repos.messages().repairThreadPreviews();
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

  listWorkflowAgentThreadChatIds(): string[] {
    const rows = this.requireDb()
      .prepare("SELECT DISTINCT chat_thread_id FROM workflow_agent_threads WHERE chat_thread_id IS NOT NULL AND chat_thread_id != ''")
      .all() as Array<{ chat_thread_id: string }>;
    return rows.map((row) => row.chat_thread_id);
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

  private syncProjectBoardCardsForLinkedTasks(): void {
    this.repos.projectBoardLinkedTasks().syncProjectBoardCardsForLinkedTasks();
  }

  private projectBoardTaskHasClosedDoneCard(taskId: string): boolean {
    return this.repos.projectBoardLinkedTasks().projectBoardTaskHasClosedDoneCard(taskId);
  }

  private syncProjectBoardTaskBlockers(boardId: string): void {
    this.repos.projectBoardLinkedTasks().syncProjectBoardTaskBlockers(boardId);
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
    return this.repos.projectBoardLinkedTasks().projectBoardCardTaskDescription(card);
  }

  private latestOrchestrationRunForTask(taskId: string): OrchestrationRun | undefined {
    return this.repos.orchestration().latestOrchestrationRunForTask(taskId);
  }

  private latestDependencyArtifactRunForTask(taskId: string): OrchestrationRun | undefined {
    return this.repos.orchestration().latestDependencyArtifactRunForTask(taskId);
  }
}
