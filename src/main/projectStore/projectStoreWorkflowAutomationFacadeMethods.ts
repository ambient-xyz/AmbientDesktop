import type {
  AutomationFolderSummary,
  AutomationScheduleExceptionSummary,
  AutomationScheduleOccurrenceActionInput,
  AutomationScheduleOccurrenceActionResult,
  AutomationScheduleSummary,
  CreateAutomationFolderInput,
  CreateAutomationScheduleInput,
  MoveAutomationThreadInput,
  UpdateAutomationScheduleInput,
} from "../../shared/automationTypes";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import { isAmbientSubagentsEnabled } from "../../shared/featureFlags";
import type { SubagentPatternGraphSnapshot } from "../../shared/subagentPatternGraph";
import type { ThreadSummary } from "../../shared/threadTypes";
import type {
  AnswerWorkflowDiscoveryQuestionInput,
  CallableWorkflowTaskRestartReconciliationSummary,
  CallableWorkflowTaskStatus,
  CallableWorkflowTaskSummary,
  CreateOrchestrationTaskInput,
  CreateWorkflowAgentFolderInput,
  CreateWorkflowAgentThreadInput,
  CreateWorkflowArtifactInput,
  CreateWorkflowExplorationTraceInput,
  CreateWorkflowGraphSnapshotInput,
  CreateWorkflowRevisionInput,
  CreateWorkflowVersionInput,
  MoveWorkflowAgentThreadInput,
  OrchestrationBoard,
  OrchestrationRun,
  OrchestrationTask,
  RecordWorkflowModelCallInput,
  ResolveWorkflowRevisionInput,
  UpdateWorkflowArtifactInput,
  UpdateWorkflowExplorationTraceInput,
  UpdateWorkflowRevisionInput,
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadPhase,
  WorkflowAgentThreadSummary,
  WorkflowArtifactSummary,
  WorkflowDiscoveryQuestion,
  WorkflowExplorationTraceSummary,
  WorkflowGraphSnapshot,
  WorkflowModelCallRecord,
  WorkflowRecoveryContext,
  WorkflowRevisionSummary,
  WorkflowRunEvent,
  WorkflowRunProviderHealth,
  WorkflowRunRetryMetadata,
  WorkflowRunStatus,
  WorkflowRunSummary,
  WorkflowVersionStatus,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import {
  callableWorkflowQueuedTaskDraftFromExecutionPlan,
  type CallableWorkflowCompilerHandoffPlan,
  type CallableWorkflowExecutionPlan,
  type CallableWorkflowPatternGraphChildBindingRequest,
  type CallableWorkflowTaskControlAction,
} from "./projectStoreCallableWorkflowFacade";
import type { CreateThreadOptions, OrchestrationTaskUpdateInput } from "./projectStoreFacadeHelpers";
import type { SchedulerRuntimeState } from "./projectStoreOrchestrationFacade";
import { ProjectStoreSubagentFacadeMethods } from "./projectStoreSubagentFacadeMethods";
import {
  callableWorkflowTaskProgressSnapshot,
  callableWorkflowTaskUsageSnapshot,
  type WorkflowAgentThreadRow,
} from "./projectStoreWorkflowMappers";
import type { RunRecord } from "./runMappers";
import type { CreateWorkflowDiscoveryQuestionInput } from "./workflowDiscoveryQuestionRepository";

export abstract class ProjectStoreWorkflowAutomationFacadeMethods extends ProjectStoreSubagentFacadeMethods {
  abstract createThread(title?: string, workspacePath?: string, options?: CreateThreadOptions): ThreadSummary;
  abstract getRunRecord(runId: string): RunRecord;

  listWorkflowAgentFolders(): WorkflowAgentFolderSummary[] {
    return this.repos.workflowAgentReadModels().listWorkflowAgentFolders();
  }

  createWorkflowAgentFolder(input: CreateWorkflowAgentFolderInput): WorkflowAgentFolderSummary[] {
    this.repos.workflowAgentThreads().createWorkflowAgentFolder(input);
    return this.listWorkflowAgentFolders();
  }

  moveWorkflowAgentThread(input: MoveWorkflowAgentThreadInput): WorkflowAgentFolderSummary[] {
    this.repos.workflowAgentThreads().moveWorkflowAgentThread(input);
    return this.listWorkflowAgentFolders();
  }

  createWorkflowAgentThread(input: CreateWorkflowAgentThreadInput): WorkflowAgentFolderSummary[] {
    this.createWorkflowAgentThreadRecord(input);
    return this.listWorkflowAgentFolders();
  }

  createWorkflowAgentThreadSummary(input: CreateWorkflowAgentThreadInput): WorkflowAgentThreadSummary {
    const row = this.createWorkflowAgentThreadRecord(input);
    return this.repos.workflowAgentReadModels().workflowAgentThreadSummaryFromCreatedRow(row);
  }

  ensureWorkflowAgentChatThread(threadId: string): WorkflowAgentThreadSummary {
    const row = this.requireWorkflowAgentThread(threadId);
    const existing = row.chat_thread_id ? this.repos.threads().tryGetThread(row.chat_thread_id) : undefined;
    if (existing) return this.getWorkflowAgentThreadSummary(threadId);
    const now = new Date().toISOString();
    const chatThread = this.createThread(`Workflow: ${row.title}`, row.project_path || this.getWorkspace().path);
    this.repos.workflowAgentThreads().updateWorkflowAgentThreadChatThread(row.id, chatThread.id, now);
    return this.getWorkflowAgentThreadSummary(threadId);
  }

  getWorkflowAgentThreadSummary(threadId: string): WorkflowAgentThreadSummary {
    return this.repos.workflowAgentReadModels().getWorkflowAgentThreadSummary(threadId);
  }

  listWorkflowGraphSnapshots(workflowThreadId: string): WorkflowGraphSnapshot[] {
    return this.repos.workflowGraphSnapshots().listWorkflowGraphSnapshots(workflowThreadId);
  }

  createWorkflowGraphSnapshot(input: CreateWorkflowGraphSnapshotInput): WorkflowGraphSnapshot {
    return this.repos.workflowGraphSnapshots().createWorkflowGraphSnapshot(input);
  }

  createWorkflowExplorationTrace(input: CreateWorkflowExplorationTraceInput): WorkflowExplorationTraceSummary {
    return this.repos.workflowExplorationTraces().createWorkflowExplorationTrace(input);
  }

  updateWorkflowExplorationTrace(input: UpdateWorkflowExplorationTraceInput): WorkflowExplorationTraceSummary {
    return this.repos.workflowExplorationTraces().updateWorkflowExplorationTrace(input);
  }

  listWorkflowExplorationTraces(workflowThreadId: string): WorkflowExplorationTraceSummary[] {
    return this.repos.workflowExplorationTraces().listWorkflowExplorationTraces(workflowThreadId);
  }

  listWorkflowVersions(workflowThreadId: string): WorkflowVersionSummary[] {
    return this.repos.workflowVersions().listWorkflowVersions(workflowThreadId);
  }

  getWorkflowVersion(versionId: string): WorkflowVersionSummary {
    return this.repos.workflowVersions().getWorkflowVersion(versionId);
  }

  getLatestApprovedWorkflowVersion(workflowThreadId: string): WorkflowVersionSummary | undefined {
    return this.repos.workflowVersions().getLatestApprovedWorkflowVersion(workflowThreadId);
  }

  createWorkflowVersion(input: CreateWorkflowVersionInput): WorkflowVersionSummary {
    return this.repos.workflowVersions().createWorkflowVersion(input);
  }

  updateWorkflowVersionStatusForArtifact(artifactId: string, status: WorkflowVersionStatus): WorkflowVersionSummary | undefined {
    return this.repos.workflowVersions().updateWorkflowVersionStatusForArtifact(artifactId, status);
  }

  listWorkflowRevisions(workflowThreadId: string): WorkflowRevisionSummary[] {
    return this.repos.workflowRevisions().listWorkflowRevisions(workflowThreadId);
  }

  getWorkflowRevision(revisionId: string): WorkflowRevisionSummary {
    return this.repos.workflowRevisions().getWorkflowRevision(revisionId);
  }

  createWorkflowRevision(input: CreateWorkflowRevisionInput): WorkflowRevisionSummary {
    return this.repos.workflowRevisions().createWorkflowRevision(input);
  }

  updateWorkflowRevision(input: UpdateWorkflowRevisionInput): WorkflowRevisionSummary {
    return this.repos.workflowRevisions().updateWorkflowRevision(input);
  }

  resolveWorkflowRevision(input: ResolveWorkflowRevisionInput): WorkflowRevisionSummary {
    return this.repos.workflowRevisions().resolveWorkflowRevision(input);
  }

  listWorkflowDiscoveryQuestions(workflowThreadId: string, options: { revisionId?: string } = {}): WorkflowDiscoveryQuestion[] {
    return this.repos.workflowDiscoveryQuestions().listWorkflowDiscoveryQuestions(workflowThreadId, options);
  }

  createWorkflowDiscoveryQuestion(input: CreateWorkflowDiscoveryQuestionInput): WorkflowDiscoveryQuestion {
    return this.repos.workflowDiscoveryQuestions().createWorkflowDiscoveryQuestion(input);
  }

  answerWorkflowDiscoveryQuestion(input: AnswerWorkflowDiscoveryQuestionInput): WorkflowDiscoveryQuestion {
    return this.repos.workflowDiscoveryQuestions().answerWorkflowDiscoveryQuestion(input);
  }

  clearWorkflowDiscoveryQuestionAnswer(questionId: string): WorkflowDiscoveryQuestion {
    return this.repos.workflowDiscoveryQuestions().clearWorkflowDiscoveryQuestionAnswer(questionId);
  }

  getWorkflowDiscoveryQuestion(questionId: string): WorkflowDiscoveryQuestion {
    return this.repos.workflowDiscoveryQuestions().getWorkflowDiscoveryQuestion(questionId);
  }

  updateWorkflowDiscoveryAccessRequests(input: {
    questionId: string;
    accessRequests?: WorkflowDiscoveryQuestion["accessRequests"];
  }): WorkflowDiscoveryQuestion {
    return this.repos.workflowDiscoveryQuestions().updateWorkflowDiscoveryAccessRequests(input);
  }

  updateWorkflowDiscoveryActivityEvents(input: {
    questionId: string;
    activityEvents?: WorkflowDiscoveryQuestion["activityEvents"];
  }): WorkflowDiscoveryQuestion {
    return this.repos.workflowDiscoveryQuestions().updateWorkflowDiscoveryActivityEvents(input);
  }

  updateWorkflowAgentThreadPhase(threadId: string, phase: WorkflowAgentThreadPhase): WorkflowAgentThreadSummary {
    this.repos.workflowAgentThreads().updateWorkflowAgentThreadPhase(threadId, phase);
    return this.getWorkflowAgentThreadSummary(threadId);
  }

  listAutomationFolders(): AutomationFolderSummary[] {
    return this.repos.automations().listAutomationFolders();
  }

  createAutomationFolder(input: CreateAutomationFolderInput): AutomationFolderSummary[] {
    return this.repos.automations().createAutomationFolder(input);
  }

  moveAutomationThread(input: MoveAutomationThreadInput): AutomationFolderSummary[] {
    return this.repos.automations().moveAutomationThread(input);
  }

  listAutomationSchedules(): AutomationScheduleSummary[] {
    return this.repos.automations().listAutomationSchedules();
  }

  listAutomationScheduleExceptions(input: { scheduleId?: string } = {}): AutomationScheduleExceptionSummary[] {
    return this.repos.automations().listAutomationScheduleExceptions(input);
  }

  createAutomationSchedule(input: CreateAutomationScheduleInput, nowDate = new Date()): AutomationScheduleSummary[] {
    return this.repos.automations().createAutomationSchedule(input, nowDate);
  }

  updateAutomationSchedule(input: UpdateAutomationScheduleInput, nowDate = new Date()): AutomationScheduleSummary[] {
    return this.repos.automations().updateAutomationSchedule(input, nowDate);
  }

  skipAutomationScheduleOccurrence(
    input: AutomationScheduleOccurrenceActionInput,
    nowDate = new Date(),
  ): AutomationScheduleOccurrenceActionResult {
    return this.repos.automations().skipAutomationScheduleOccurrence(input, nowDate);
  }

  rescheduleAutomationScheduleOccurrence(
    input: AutomationScheduleOccurrenceActionInput,
    nowDate = new Date(),
  ): AutomationScheduleOccurrenceActionResult {
    return this.repos.automations().rescheduleAutomationScheduleOccurrence(input, nowDate);
  }

  updateAutomationScheduleOccurrenceRunLimits(
    input: AutomationScheduleOccurrenceActionInput,
    nowDate = new Date(),
  ): AutomationScheduleOccurrenceActionResult {
    return this.repos.automations().updateAutomationScheduleOccurrenceRunLimits(input, nowDate);
  }

  consumePendingAutomationScheduleOccurrenceException(
    scheduleId: string,
    occurrenceAt: string | undefined,
    nowDate = new Date(),
  ): AutomationScheduleExceptionSummary | undefined {
    return this.repos.automations().consumePendingAutomationScheduleOccurrenceException(scheduleId, occurrenceAt, nowDate);
  }

  listDueAutomationSchedules(nowDate = new Date()): AutomationScheduleSummary[] {
    return this.repos.automations().listDueAutomationSchedules(nowDate);
  }

  advanceAutomationSchedule(scheduleId: string, nowDate = new Date()): AutomationScheduleSummary {
    return this.repos.automations().advanceAutomationSchedule(scheduleId, nowDate);
  }

  listAutomationThreadChatIds(): string[] {
    return this.repos.automations().listAutomationThreadChatIds();
  }

  listOrchestrationBoard(): OrchestrationBoard {
    return this.repos.orchestration().listOrchestrationBoard();
  }

  listOrchestrationTasks(): OrchestrationTask[] {
    return this.repos.orchestration().listOrchestrationTasks();
  }

  listOrchestrationRuns(limit = 50): OrchestrationRun[] {
    return this.repos.orchestration().listOrchestrationRuns(limit);
  }

  getOrchestrationRun(runId: string): OrchestrationRun {
    return this.repos.orchestration().getOrchestrationRun(runId);
  }

  getOrchestrationTask(taskId: string): OrchestrationTask {
    return this.repos.orchestration().getOrchestrationTask(taskId);
  }

  createOrchestrationTask(input: CreateOrchestrationTaskInput): OrchestrationTask {
    return this.repos.orchestration().createOrchestrationTask(input);
  }

  updateOrchestrationTask(input: OrchestrationTaskUpdateInput): OrchestrationTask {
    return this.repos.orchestration().updateOrchestrationTask(input);
  }

  setOrchestrationTaskWorkspace(input: { id: string; workspacePath: string; branchName?: string }): OrchestrationTask {
    return this.repos.orchestration().setOrchestrationTaskWorkspace(input);
  }

  recordPreparedOrchestrationRun(input: {
    taskId: string;
    workspacePath: string;
    proofOfWork?: Record<string, unknown>;
  }): OrchestrationRun {
    return this.repos.orchestration().recordPreparedOrchestrationRun(input);
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
    return this.repos.orchestration().updateOrchestrationRun(input);
  }

  recordRestartInterruptedAutoContinueAttempt(runId: string, now = new Date()): OrchestrationRun {
    return this.repos.orchestration().recordRestartInterruptedAutoContinueAttempt(runId, now);
  }

  getOrchestrationSchedulerRuntimeState(): SchedulerRuntimeState {
    return this.repos.orchestration().getOrchestrationSchedulerRuntimeState();
  }

  createWorkflowArtifact(input: CreateWorkflowArtifactInput): WorkflowArtifactSummary {
    return this.repos.workflowArtifacts().createWorkflowArtifact(input);
  }

  listWorkflowArtifacts(): WorkflowArtifactSummary[] {
    return this.repos.workflowArtifacts().listWorkflowArtifacts();
  }

  getWorkflowArtifact(artifactId: string): WorkflowArtifactSummary {
    return this.repos.workflowArtifacts().getWorkflowArtifact(artifactId);
  }

  updateWorkflowArtifact(input: UpdateWorkflowArtifactInput): WorkflowArtifactSummary {
    return this.repos.workflowArtifacts().updateWorkflowArtifact(input);
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
    return this.repos.workflowRuns().startWorkflowRun(input);
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
    return this.repos.workflowRuns().updateWorkflowRun(input);
  }

  updateWorkflowRunDurability(input: {
    id: string;
    graphSnapshotId?: string | null;
    providerHealth?: WorkflowRunProviderHealth;
    retryMetadata?: WorkflowRunRetryMetadata;
    recoveryContext?: WorkflowRecoveryContext | null;
  }): WorkflowRunSummary {
    return this.repos.workflowRuns().updateWorkflowRunDurability(input);
  }

  getWorkflowRun(runId: string): WorkflowRunSummary {
    return this.repos.workflowRuns().getWorkflowRun(runId);
  }

  private tryGetWorkflowRun(runId: string): WorkflowRunSummary | undefined {
    return this.repos.workflowRuns().tryGetWorkflowRun(runId);
  }

  listWorkflowRuns(artifactId?: string, limit = 50): WorkflowRunSummary[] {
    return this.repos.workflowRuns().listWorkflowRuns(artifactId, limit);
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
    return this.repos.workflowRuns().appendWorkflowRunEvent(input);
  }

  listWorkflowRunEvents(runId: string): WorkflowRunEvent[] {
    return this.repos.workflowRuns().listWorkflowRunEvents(runId);
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
    return this.repos.callableWorkflowTasks().createQueuedTask({ draft, parentMessageId, patternGraphSnapshot, now });
  }

  getCallableWorkflowTask(id: string): CallableWorkflowTaskSummary {
    return this.repos.callableWorkflowTasks().getCallableWorkflowTask(id);
  }

  listCallableWorkflowTasksForParentRun(parentRunId: string): CallableWorkflowTaskSummary[] {
    return this.repos.callableWorkflowTasks().listCallableWorkflowTasksForParentRun(parentRunId);
  }

  listCallableWorkflowTasksForParentThread(parentThreadId: string): CallableWorkflowTaskSummary[] {
    return this.repos.callableWorkflowTasks().listCallableWorkflowTasksForParentThread(parentThreadId);
  }

  listCallableWorkflowTasks(): CallableWorkflowTaskSummary[] {
    return this.repos.callableWorkflowTasks().listCallableWorkflowTasks();
  }

  bindCallableWorkflowTaskPatternGraphChild(input: CallableWorkflowPatternGraphChildBindingRequest): CallableWorkflowTaskSummary {
    return this.repos.callableWorkflowTaskPreparations().bindCallableWorkflowTaskPatternGraphChild(input);
  }

  reconcileCallableWorkflowTaskRestartState(options: { now?: string } = {}): CallableWorkflowTaskRestartReconciliationSummary {
    return this.repos.callableWorkflowTaskRestartReconciliations().reconcileCallableWorkflowTaskRestartState(options);
  }

  beginCallableWorkflowTaskCompilerHandoff(
    id: string,
    options: { createdAt?: string } = {},
  ): { task: CallableWorkflowTaskSummary; handoffPlan: CallableWorkflowCompilerHandoffPlan } {
    return this.repos.callableWorkflowTaskPreparations().beginCallableWorkflowTaskCompilerHandoff(id, options);
  }

  linkCallableWorkflowTaskArtifact(input: { id: string; workflowArtifactId: string; createdAt?: string }): CallableWorkflowTaskSummary {
    return this.repos.callableWorkflowTaskPreparations().linkCallableWorkflowTaskArtifact(input);
  }

  markCallableWorkflowTaskRunStarted(input: { id: string; workflowRunId: string; createdAt?: string }): CallableWorkflowTaskSummary {
    return this.repos.callableWorkflowTaskLifecycle().markCallableWorkflowTaskRunStarted(input);
  }

  markCallableWorkflowTaskRunFinished(input: {
    id: string;
    workflowRunId: string;
    runStatus: WorkflowRunStatus;
    errorMessage?: string;
    createdAt?: string;
  }): CallableWorkflowTaskSummary {
    return this.repos.callableWorkflowTaskLifecycle().markCallableWorkflowTaskRunFinished(input);
  }

  recordCallableWorkflowTaskControl(input: {
    id: string;
    action: CallableWorkflowTaskControlAction;
    reason?: string;
    workflowRunId?: string;
    createdAt?: string;
  }): void {
    this.repos.callableWorkflowTaskLifecycle().recordCallableWorkflowTaskControl(input);
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
    return this.repos.callableWorkflowTaskLifecycle().pauseCallableWorkflowTask(input);
  }

  cancelCallableWorkflowTask(input: { id: string; reason?: string; createdAt?: string }): CallableWorkflowTaskSummary {
    return this.repos.callableWorkflowTaskLifecycle().cancelCallableWorkflowTask(input);
  }

  recordWorkflowModelCall(input: RecordWorkflowModelCallInput): WorkflowModelCallRecord {
    return this.repos.workflowModelCalls().recordWorkflowModelCall(input);
  }

  getWorkflowModelCall(callId: string): WorkflowModelCallRecord {
    return this.repos.workflowModelCalls().getWorkflowModelCall(callId);
  }

  listWorkflowModelCalls(input: { runId?: string; artifactId?: string } = {}): WorkflowModelCallRecord[] {
    return this.repos.workflowModelCalls().listWorkflowModelCalls(input);
  }

  compactExpiredWorkflowTraceData(
    input: {
      now?: string;
      debugRetentionDays?: number;
    } = {},
  ): { cutoff: string; eventsCompacted: number; modelCallsCompacted: number } {
    return this.repos.workflowTraceRetention().compactExpiredWorkflowTraceData(input);
  }

  private createWorkflowAgentThreadRecord(input: CreateWorkflowAgentThreadInput): WorkflowAgentThreadRow {
    return this.repos.workflowAgentThreads().createWorkflowAgentThreadRecord(input);
  }

  private requireWorkflowAgentThread(threadId: string): WorkflowAgentThreadRow {
    return this.repos.workflowAgentThreads().requireWorkflowAgentThread(threadId);
  }

  private tryGetWorkflowArtifact(artifactId: string): WorkflowArtifactSummary | undefined {
    return this.repos.workflowArtifacts().tryGetWorkflowArtifact(artifactId);
  }

  private tryGetWorkflowGraphSnapshot(snapshotId: string): WorkflowGraphSnapshot | undefined {
    return this.repos.workflowGraphSnapshots().tryGetWorkflowGraphSnapshot(snapshotId);
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
    return this.repos.callableWorkflowTasks().updateCallableWorkflowTaskRow(input);
  }

  private findCallableWorkflowTaskByLaunchId(launchId: string): CallableWorkflowTaskSummary | undefined {
    return this.repos.callableWorkflowTasks().findCallableWorkflowTaskByLaunchId(launchId);
  }

  private workflowVersionForGraphSnapshot(graphSnapshotId: string | undefined): WorkflowVersionSummary | undefined {
    return this.repos.workflowVersions().workflowVersionForGraphSnapshot(graphSnapshotId);
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
