import type Database from "better-sqlite3";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { ProjectStoreActiveRunRecoveryRepository } from "./activeRunRecoveryRepository";
import { ProjectStoreAutomationRepository } from "./automationRepository";
import { ProjectStoreCallableWorkflowTaskLifecycleRepository } from "./callableWorkflowTaskLifecycleRepository";
import { ProjectStoreCallableWorkflowTaskPreparationRepository } from "./callableWorkflowTaskPreparationRepository";
import { ProjectStoreCallableWorkflowTaskRepository } from "./callableWorkflowTaskRepository";
import { ProjectStoreCallableWorkflowTaskRestartReconciliationRepository } from "./callableWorkflowTaskRestartReconciliationRepository";
import { ProjectStoreContextUsageRepository } from "./contextUsageRepository";
import { ProjectStoreMessageRepository } from "./messageRepository";
import { ProjectStoreMessageVoiceRepository } from "./messageVoiceRepository";
import { ProjectStoreOrchestrationRepository } from "./orchestrationRepository";
import { ProjectStorePermissionRepository } from "./permissionRepository";
import { ProjectStorePlannerArtifactRepository } from "./plannerArtifactRepository";
import { ProjectStorePlannerQuestionBlockRepairRepository } from "./plannerQuestionBlockRepairRepository";
import { ProjectStoreProjectBoardDurablePlanSourceRepository } from "./projectBoardDurablePlanSourceRepository";
import { ProjectStoreProjectBoardLinkedTaskRepository } from "./projectBoardLinkedTaskRepository";
import type { ProjectStoreProjectBoardRepositoryFactory } from "./projectBoardRepositoryFactory";
import { ProjectStoreArtifactDraftRepository } from "./projectStoreArtifactDraftRepository";
import { defaultOrchestrationProjectPath } from "./projectStoreFacadeHelpers";
import type { SubagentMailboxDeliveryStore, SubagentParentStopWaitBarrierStore } from "./projectStoreSubagentsFacade";
import { ProjectStoreSettingsRepository } from "./settingsRepository";
import { ProjectStoreSubagentRepositoryFactory } from "./projectStoreSubagentRepositoryFactory";
import { ProjectStoreThreadGoalRepository } from "./threadGoalRepository";
import { ProjectStoreThreadRepository } from "./threadRepository";
import { ProjectStoreThreadWakeRepository } from "./threadWakeRepository";
import { workflowRecordingRequireLibraryVersion } from "./projectStoreWorkflowRecordingFacade";
import { ProjectStoreWorkflowRepositoryFactory } from "./projectStoreWorkflowRepositoryFactory";
import { ProjectStoreRunRepository } from "./runRepository";
import { ProjectStoreWorkspaceSearchRepository } from "./workspaceSearchRepository";

export interface ProjectStoreRepositoryFactoryHost extends SubagentMailboxDeliveryStore, SubagentParentStopWaitBarrierStore {
  readonly projectBoardRepos: ProjectStoreProjectBoardRepositoryFactory;
  requireDb(): Database.Database;
  getWorkspace(): WorkspaceState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- existing ProjectStore callbacks will be typed down as their owners are extracted.
  [key: string]: any;
}

export function createProjectStoreRepositoryFactory(host: ProjectStoreRepositoryFactoryHost): ProjectStoreRepositoryFactory {
  return new ProjectStoreRepositoryFactory(host);
}

export class ProjectStoreRepositoryFactory {
  private readonly subagentRepos: ProjectStoreSubagentRepositoryFactory;
  private readonly workflowRepos: ProjectStoreWorkflowRepositoryFactory;

  constructor(private readonly host: ProjectStoreRepositoryFactoryHost) {
    this.subagentRepos = new ProjectStoreSubagentRepositoryFactory(host, {
      threads: () => this.threads(),
      workflowRuns: () => this.workflowRuns(),
    });
    this.workflowRepos = new ProjectStoreWorkflowRepositoryFactory(host);
  }

  threads(): ProjectStoreThreadRepository {
    return new ProjectStoreThreadRepository(this.host.requireDb(), this.host.getWorkspace().path);
  }

  threadGoals(): ProjectStoreThreadGoalRepository {
    return new ProjectStoreThreadGoalRepository(this.host.requireDb());
  }

  threadWakeContinuations(): ProjectStoreThreadWakeRepository {
    return new ProjectStoreThreadWakeRepository(this.host.requireDb());
  }

  messages(): ProjectStoreMessageRepository {
    return new ProjectStoreMessageRepository(this.host.requireDb());
  }

  messageVoices(): ProjectStoreMessageVoiceRepository {
    return new ProjectStoreMessageVoiceRepository(this.host.requireDb());
  }

  workspaceSearch(): ProjectStoreWorkspaceSearchRepository {
    return new ProjectStoreWorkspaceSearchRepository(this.host.requireDb());
  }

  runs(): ProjectStoreRunRepository {
    return new ProjectStoreRunRepository(this.host.requireDb());
  }

  subagentRuns() {
    return this.subagentRepos.subagentRuns();
  }

  subagentMailboxes() {
    return this.subagentRepos.subagentMailboxes();
  }

  subagentParentMailboxes() {
    return this.subagentRepos.subagentParentMailboxes();
  }

  subagentSnapshots() {
    return this.subagentRepos.subagentSnapshots();
  }

  subagentWaitBarriers() {
    return this.subagentRepos.subagentWaitBarriers();
  }

  subagentBatchProgress() {
    return this.subagentRepos.subagentBatchProgress();
  }

  subagentBatches() {
    return this.subagentRepos.subagentBatches();
  }

  subagentMaturityEvidence() {
    return this.subagentRepos.subagentMaturityEvidence();
  }

  artifactDrafts(): ProjectStoreArtifactDraftRepository {
    return new ProjectStoreArtifactDraftRepository(this.host.requireDb(), this.host.getWorkspace().path);
  }

  plannerArtifacts(): ProjectStorePlannerArtifactRepository {
    return new ProjectStorePlannerArtifactRepository(this.host.requireDb());
  }

  plannerQuestionBlockRepairs(): ProjectStorePlannerQuestionBlockRepairRepository {
    return new ProjectStorePlannerQuestionBlockRepairRepository(this.host.requireDb());
  }

  workflowArtifacts() {
    return this.workflowRepos.workflowArtifacts();
  }

  workflowExplorationTraces() {
    return this.workflowRepos.workflowExplorationTraces();
  }

  workflowGraphSnapshots() {
    return this.workflowRepos.workflowGraphSnapshots();
  }

  workflowModelCalls() {
    return this.workflowRepos.workflowModelCalls();
  }

  workflowAgentThreads() {
    return this.workflowRepos.workflowAgentThreads();
  }

  workflowAgentReadModels() {
    return this.workflowRepos.workflowAgentReadModels();
  }

  workflowDiscoveryQuestions() {
    return this.workflowRepos.workflowDiscoveryQuestions();
  }

  workflowRevisions() {
    return this.workflowRepos.workflowRevisions();
  }

  workflowVersions() {
    return this.workflowRepos.workflowVersions();
  }

  workflowRuns() {
    return this.workflowRepos.workflowRuns();
  }

  workflowTraceRetention() {
    return this.workflowRepos.workflowTraceRetention();
  }

  workflowRecordings() {
    return this.workflowRepos.workflowRecordings();
  }

  workflowLabs() {
    return this.workflowRepos.workflowLabs();
  }

  symphonyWorkflowRecipes() {
    return this.workflowRepos.symphonyWorkflowRecipes();
  }

  settings(): ProjectStoreSettingsRepository {
    return new ProjectStoreSettingsRepository(this.host.requireDb());
  }

  contextUsage(): ProjectStoreContextUsageRepository {
    return new ProjectStoreContextUsageRepository(this.host.requireDb());
  }

  permissions(): ProjectStorePermissionRepository {
    return new ProjectStorePermissionRepository(this.host.requireDb());
  }

  automations(): ProjectStoreAutomationRepository {
    return new ProjectStoreAutomationRepository(this.host.requireDb(), {
      getWorkspace: () => this.host.getWorkspace(),
      listOrchestrationTasks: () => this.host.listOrchestrationTasks(),
      listOrchestrationRuns: (limit) => this.host.listOrchestrationRuns(limit),
      getOrchestrationTask: (taskId) => this.host.getOrchestrationTask(taskId),
      listWorkflowArtifacts: () => this.host.listWorkflowArtifacts(),
      getWorkflowArtifact: (artifactId) => this.host.getWorkflowArtifact(artifactId),
      listWorkflowRuns: (artifactId, limit) => this.host.listWorkflowRuns(artifactId, limit),
      listWorkflowRunEvents: (runId) => this.host.listWorkflowRunEvents(runId),
      requireWorkflowRecordingScheduleTarget: (id, targetVersion) => {
        const playbook = this.host.describeWorkflowRecording(id);
        if (targetVersion !== undefined) workflowRecordingRequireLibraryVersion(id, playbook.versions, targetVersion);
        return playbook;
      },
      getLatestApprovedWorkflowVersion: (workflowThreadId) => this.host.getLatestApprovedWorkflowVersion(workflowThreadId),
      getWorkflowVersion: (versionId) => this.host.getWorkflowVersion(versionId),
      getWorkflowAgentThreadSummary: (threadId) => this.host.getWorkflowAgentThreadSummary(threadId),
      createThread: (title, workspacePath) => this.host.createThread(title, workspacePath),
      getThread: (threadId) => this.host.getThread(threadId),
    });
  }

  callableWorkflowTasks(): ProjectStoreCallableWorkflowTaskRepository {
    return new ProjectStoreCallableWorkflowTaskRepository(this.host.requireDb(), {
      workflowThreadIdForArtifact: (artifactId) => this.host.tryGetWorkflowArtifact(artifactId)?.workflowThreadId,
      hydrateRunTelemetry: (task) => this.host.hydrateCallableWorkflowTaskRunTelemetry(task),
    });
  }

  callableWorkflowTaskLifecycle(): ProjectStoreCallableWorkflowTaskLifecycleRepository {
    return new ProjectStoreCallableWorkflowTaskLifecycleRepository({
      appendWorkflowRunEvent: (input) => this.host.appendWorkflowRunEvent(input),
      getCallableWorkflowTask: (id) => this.host.getCallableWorkflowTask(id),
      getWorkflowRun: (runId) => this.host.getWorkflowRun(runId),
      listWorkflowRunEvents: (runId) => this.host.listWorkflowRunEvents(runId),
      updateCallableWorkflowTaskRow: (input) => this.host.updateCallableWorkflowTaskRow(input),
      updateWorkflowRun: (input) => this.host.updateWorkflowRun(input),
    });
  }

  callableWorkflowTaskPreparations(): ProjectStoreCallableWorkflowTaskPreparationRepository {
    return new ProjectStoreCallableWorkflowTaskPreparationRepository({
      bindPatternGraphSnapshot: (input) => this.callableWorkflowTasks().bindPatternGraphSnapshot(input),
      getCallableWorkflowTask: (id) => this.host.getCallableWorkflowTask(id),
      getSubagentRun: (runId) => this.host.getSubagentRun(runId),
      getThread: (threadId) => this.host.getThread(threadId),
      getWorkflowArtifact: (artifactId) => this.host.getWorkflowArtifact(artifactId),
      updateCallableWorkflowTaskRow: (input) => this.host.updateCallableWorkflowTaskRow(input),
    });
  }

  callableWorkflowTaskRestartReconciliations(): ProjectStoreCallableWorkflowTaskRestartReconciliationRepository {
    return new ProjectStoreCallableWorkflowTaskRestartReconciliationRepository(this.host.requireDb(), {
      getCallableWorkflowTask: (id) => this.host.getCallableWorkflowTask(id),
      listCallableWorkflowTasks: () => this.host.listCallableWorkflowTasks(),
      listThreads: () => this.host.listThreads(),
      listWorkflowArtifacts: () => this.host.listWorkflowArtifacts(),
      listWorkflowRunsForRestart: () => this.workflowRuns().listWorkflowRunsForRestart(),
      markCallableWorkflowTaskRunFinished: (input) => this.host.markCallableWorkflowTaskRunFinished(input),
      tryGetWorkflowRun: (runId) => this.host.tryGetWorkflowRun(runId),
    });
  }

  activeRunRecoveries(): ProjectStoreActiveRunRecoveryRepository {
    return new ProjectStoreActiveRunRecoveryRepository(this.host.requireDb(), {
      finishRun: (runId, status, errorMessage) => this.host.finishRun(runId, status, errorMessage),
      listActiveRuns: () => this.host.listActiveRuns(),
      replaceMessage: (messageId, content, metadata) => this.host.replaceMessage(messageId, content, metadata),
      updateOrchestrationRun: (input) => this.host.updateOrchestrationRun(input),
      updateOrchestrationTask: (input) => this.host.updateOrchestrationTask(input),
    });
  }

  subagentRunCreations() {
    return this.subagentRepos.subagentRunCreations();
  }

  subagentSpawnEdgeRepairs() {
    return this.subagentRepos.subagentSpawnEdgeRepairs();
  }

  subagentParentStopCascades() {
    return this.subagentRepos.subagentParentStopCascades();
  }

  subagentRunCompletions() {
    return this.subagentRepos.subagentRunCompletions();
  }

  subagentRestartReconciliations() {
    return this.subagentRepos.subagentRestartReconciliations();
  }

  subagentMaturitySnapshots() {
    return this.subagentRepos.subagentMaturitySnapshots();
  }

  subagentRepairDiagnostics() {
    return this.subagentRepos.subagentRepairDiagnostics();
  }

  subagentRetentionCleanups() {
    return this.subagentRepos.subagentRetentionCleanups();
  }

  projectBoardDurablePlanSources(): ProjectStoreProjectBoardDurablePlanSourceRepository {
    return new ProjectStoreProjectBoardDurablePlanSourceRepository(this.host.requireDb(), {
      appendProjectBoardEvent: (input) => this.host.appendProjectBoardEvent(input),
      createProjectBoard: (input) => this.host.createProjectBoard(input),
      getPlannerPlanArtifact: (artifactId) => this.host.getPlannerPlanArtifact(artifactId),
      getProjectArtifactWorkspacePath: () => this.host.getProjectArtifactWorkspacePath(),
      getProjectBoard: (boardId) => this.host.getProjectBoard(boardId),
      getProjectBoardForPath: (projectPath, sourceThreadId) => this.host.getProjectBoardForPath(projectPath, sourceThreadId),
      getThreadTitle: (threadId) => this.host.getThread(threadId).title,
      replaceProjectBoardSources: (boardId, sources) => this.host.replaceProjectBoardSources(boardId, sources),
    });
  }

  projectBoardLinkedTasks(): ProjectStoreProjectBoardLinkedTaskRepository {
    return new ProjectStoreProjectBoardLinkedTaskRepository(this.host.requireDb(), {
      getProjectBoard: (boardId) => this.host.getProjectBoard(boardId),
      getProjectBoardCardForOrchestrationTask: (taskId) => this.host.getProjectBoardCardForOrchestrationTask(taskId),
      getOrchestrationTask: (taskId) => this.host.getOrchestrationTask(taskId),
      listOrchestrationTasks: () => this.host.listOrchestrationTasks(),
      listProjectBoardCards: (boardId) => this.host.projectBoardRepos.projectBoards().listProjectBoardCards(boardId),
      listProjectBoardEvents: (boardId) => this.host.projectBoardRepos.projectBoards().listProjectBoardEvents(boardId),
      dependencyAwareProjectBoardCardTaskDescription: (input) =>
        this.host.projectBoardRepos.projectBoardDependencyExecutionContexts().projectBoardCardTaskDescription(input),
    });
  }

  orchestration(): ProjectStoreOrchestrationRepository {
    return new ProjectStoreOrchestrationRepository(this.host.requireDb(), {
      defaultProjectPath: defaultOrchestrationProjectPath(this.host.getWorkspace().path),
      projectBoardTaskHasClosedDoneCard: (taskId) => this.projectBoardLinkedTasks().projectBoardTaskHasClosedDoneCard(taskId),
      projectBoardClaimBlockedTaskIds: () => this.projectBoardLinkedTasks().projectBoardClaimBlockedTaskIds(),
      syncProjectBoardCardsForLinkedTasks: () => this.projectBoardLinkedTasks().syncProjectBoardCardsForLinkedTasks(),
      reviewProjectBoardCardProofForRun: (run) =>
        this.host.projectBoardRepos.projectBoardRunProgress().reviewProjectBoardCardProofForRun(run),
    });
  }
}
