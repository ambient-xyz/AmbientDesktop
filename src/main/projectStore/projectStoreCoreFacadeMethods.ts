import type { AgentMemorySettings, UpdateAgentMemorySettingsInput } from "../../shared/agentMemorySettings";
import type { AmbientModelRuntimeCatalog } from "../../shared/ambientModels";
import type { DesktopSettings } from "../../shared/desktopTypes";
import type { AmbientFeatureFlagSnapshot, AmbientFeatureFlagSettings, UpdateFeatureFlagSettingsInput } from "../../shared/featureFlags";
import type { MessageVoiceState } from "../../shared/localRuntimeTypes";
import type { AmbientPermissionGrant, CreateAmbientPermissionGrantInput, PermissionAuditEntry } from "../../shared/permissionTypes";
import type { ProjectBoardSource } from "../../shared/projectBoardTypes";
import type {
  PlannerDurableArtifactValidationResult,
  PlannerPlanArtifact,
  PlannerPlanArtifactStatus,
  PlannerPlanFinalizationAttemptStatus,
  PlannerPlanWorkflowState,
} from "../../shared/plannerTypes";
import type {
  AmbientCompactionSettings,
  ChatMessage,
  ContextUsageSnapshot,
  ModelRuntimeSettings,
  RunDiagnostics,
  ThreadGoal,
  ThreadGoalAccountInput,
  ThreadGoalCreateInput,
  ThreadGoalSetInput,
  ThreadGoalStatus,
  ThreadSummary,
  ThreadWorktreeSummary,
} from "../../shared/threadTypes";
import type { WorkspaceSearchResult, WorkspaceSearchScope } from "../../shared/workspaceTypes";
import type {
  SaveSymphonyWorkflowRecipeInput,
  CreateWorkflowLabRunInput,
  ListWorkflowLabRunsInput,
  SearchWorkflowRecordingsInput,
  WorkflowLabCandidatePatch,
  WorkflowLabEvaluationResult,
  WorkflowLabRun,
  WorkflowLabRunStatus,
  WorkflowLabVariant,
  WorkflowLabVariantStatus,
  WorkflowRecordingLibraryDescription,
  WorkflowRecordingLibraryEntry,
  WorkflowRecordingPlaybookDraft,
  WorkflowRecordingReviewDraftUpdate,
  WorkflowRecordingState,
} from "../../shared/workflowTypes";
import type {
  ArtifactDraftEvent,
  ArtifactDraftManifest,
  ArtifactDraftSummary,
  CreateArtifactDraftInput,
  ListArtifactDraftOptions,
  UpdateArtifactDraftStateInput,
} from "../../shared/artifactDrafts";
import { INTERRUPTED_RUN_MESSAGE } from "./runRecovery";
import type { ActivePersistedRunStatus, RunRecord, TerminalPersistedRunStatus } from "./runMappers";
import type { PlannerPlanArtifactInput } from "./plannerArtifactRepository";
import type { CreateProjectStoreThreadDefaults } from "./threadRepository";
import type { ScheduleThreadWakeContinuationInput, ThreadWakeContinuation } from "./threadWakeRepository";
import type {
  ContextUsageSnapshotInput,
  CreateThreadOptions,
  PermissionAuditInput,
  ThreadWorktreeInput,
} from "./projectStoreFacadeHelpers";
import { defaultProjectArtifactWorkspacePath } from "./projectStoreFacadeHelpers";
import { ProjectStoreWorkflowAutomationFacadeMethods } from "./projectStoreWorkflowAutomationFacadeMethods";
import { decorateThreadsWithScheduledCheckIns } from "./threadScheduledCheckInDecorator";

export abstract class ProjectStoreCoreFacadeMethods extends ProjectStoreWorkflowAutomationFacadeMethods {
  getProjectArtifactWorkspacePath(): string {
    return defaultProjectArtifactWorkspacePath(this.getWorkspace().path);
  }

  async createArtifactDraft(input: CreateArtifactDraftInput): Promise<ArtifactDraftSummary> {
    return this.repos.artifactDrafts().createArtifactDraft(input);
  }

  getArtifactDraft(draftId: string): ArtifactDraftSummary | undefined {
    return this.repos.artifactDrafts().getArtifactDraft(draftId);
  }

  requireArtifactDraft(draftId: string): ArtifactDraftSummary {
    return this.repos.artifactDrafts().requireArtifactDraft(draftId);
  }

  listArtifactDrafts(options: ListArtifactDraftOptions = {}): ArtifactDraftSummary[] {
    return this.repos.artifactDrafts().listArtifactDrafts(options);
  }

  async updateArtifactDraftState(input: UpdateArtifactDraftStateInput): Promise<ArtifactDraftSummary> {
    return this.repos.artifactDrafts().updateArtifactDraftState(input);
  }

  async appendArtifactDraftEvent(input: {
    draftId: string;
    eventType: string;
    summary?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): Promise<ArtifactDraftEvent> {
    return this.repos.artifactDrafts().appendArtifactDraftEvent(input);
  }

  listArtifactDraftEvents(draftId: string): ArtifactDraftEvent[] {
    return this.repos.artifactDrafts().listArtifactDraftEvents(draftId);
  }

  readArtifactDraftManifest(draftId: string): Promise<ArtifactDraftManifest> {
    return this.repos.artifactDrafts().readArtifactDraftManifest(draftId);
  }

  async pruneExpiredArtifactDrafts(nowIso = new Date().toISOString()): Promise<{ removedDraftIds: string[] }> {
    return this.repos.artifactDrafts().pruneExpiredArtifactDrafts(nowIso);
  }

  getDefaultSettings(): DesktopSettings {
    return this.repos.settings().getDefaultSettings();
  }

  getCompactionSettings(): AmbientCompactionSettings {
    return this.repos.settings().getCompactionSettings();
  }

  setCompactionSettings(input: Partial<AmbientCompactionSettings>): AmbientCompactionSettings {
    return this.repos.settings().setCompactionSettings(input);
  }

  getModelRuntimeSettings(): ModelRuntimeSettings {
    return this.repos.settings().getModelRuntimeSettings();
  }

  setModelRuntimeSettings(input: Partial<ModelRuntimeSettings>): ModelRuntimeSettings {
    return this.repos.settings().setModelRuntimeSettings(input);
  }

  getModelRuntimeCatalog(
    generatedAt?: string,
    runtimeProfiles: readonly AmbientModelRuntimeCatalog["profiles"][number][] = [],
  ): AmbientModelRuntimeCatalog {
    return this.repos.settings().getModelRuntimeCatalog(generatedAt, runtimeProfiles);
  }

  getFeatureFlagSettings(): AmbientFeatureFlagSettings {
    return this.repos.settings().getFeatureFlagSettings();
  }

  setFeatureFlagSettings(input: UpdateFeatureFlagSettingsInput): AmbientFeatureFlagSettings {
    return this.repos.settings().setFeatureFlagSettings(input);
  }

  getMemorySettings(): AgentMemorySettings {
    return this.repos.settings().getMemorySettings();
  }

  setMemorySettings(input: UpdateAgentMemorySettingsInput): AgentMemorySettings {
    return this.repos.settings().setMemorySettings(input);
  }

  getAutomationAutoDispatchEnabled(): boolean {
    return this.repos.settings().getAutomationAutoDispatchEnabled();
  }

  setAutomationAutoDispatchEnabled(enabled: boolean): void {
    this.repos.settings().setAutomationAutoDispatchEnabled(enabled);
  }

  getLastActiveThreadId(): string | undefined {
    return this.repos.threads().getLastActiveThreadId(this.repos.settings());
  }

  setLastActiveThreadId(threadId: string): void {
    this.repos.threads().setLastActiveThreadId(this.repos.settings(), threadId);
  }

  listThreads(): ThreadSummary[] {
    return decorateThreadsWithScheduledCheckIns(this.repos.threads().listThreads(), {
      automationSchedules: this.repos.automations().listAutomationSchedules(),
      pendingThreadWakeContinuations: this.repos.threadWakeContinuations().listPendingThreadWakeContinuations(),
    });
  }

  protected listThreadsForSubagentStateInspection(): ThreadSummary[] {
    return this.repos.threads().listThreadsForStateInspection();
  }

  findReusableEmptyThread(): ThreadSummary | undefined {
    return this.repos.threads().findReusableEmptyThread();
  }

  getThread(threadId: string): ThreadSummary {
    const thread = this.repos.threads().getThread(threadId);
    return (
      decorateThreadsWithScheduledCheckIns([thread], {
        automationSchedules: this.repos.automations().listAutomationSchedules(),
        pendingThreadWakeContinuations: this.repos.threadWakeContinuations().listPendingThreadWakeContinuations(),
      })[0] ?? thread
    );
  }

  getThreadGoal(threadId: string): ThreadGoal | undefined {
    return this.repos.threadGoals().getThreadGoal(threadId);
  }

  setThreadGoal(input: ThreadGoalSetInput): ThreadGoal {
    return this.repos.threadGoals().setThreadGoal(input);
  }

  createThreadGoalIfAbsent(input: ThreadGoalCreateInput): ThreadGoal {
    return this.repos.threadGoals().createThreadGoalIfAbsent(input);
  }

  clearThreadGoal(threadId: string, expectedGoalId?: string): ThreadGoal | undefined {
    return this.repos.threadGoals().clearThreadGoal(threadId, expectedGoalId);
  }

  accountThreadGoalUsage(input: ThreadGoalAccountInput): ThreadGoal | undefined {
    return this.repos.threadGoals().accountThreadGoalUsage(input);
  }

  markThreadGoalStatus(
    threadId: string,
    status: ThreadGoalStatus,
    options: { expectedGoalId?: string; statusReason?: string | null } = {},
  ): ThreadGoal {
    return this.repos.threadGoals().markThreadGoalStatus(threadId, status, options);
  }

  scheduleThreadWakeContinuation(input: ScheduleThreadWakeContinuationInput): ThreadWakeContinuation {
    return this.repos.threadWakeContinuations().scheduleThreadWakeContinuation(input);
  }

  listPendingThreadWakeContinuations(): ThreadWakeContinuation[] {
    return this.repos.threadWakeContinuations().listPendingThreadWakeContinuations();
  }

  listDueThreadWakeContinuations(nowIso: string, limit?: number): ThreadWakeContinuation[] {
    return this.repos.threadWakeContinuations().listDueThreadWakeContinuations(nowIso, limit);
  }

  markThreadWakeContinuationDelivered(id: string): ThreadWakeContinuation | undefined {
    return this.repos.threadWakeContinuations().markThreadWakeContinuationDelivered(id);
  }

  markThreadWakeContinuationFailed(id: string, error: string): ThreadWakeContinuation | undefined {
    return this.repos.threadWakeContinuations().markThreadWakeContinuationFailed(id, error);
  }

  cancelThreadWakeContinuation(id: string): ThreadWakeContinuation | undefined {
    return this.repos.threadWakeContinuations().cancelThreadWakeContinuation(id);
  }

  resolveThreadWakeContinuation(id: string, reason?: string): ThreadWakeContinuation | undefined {
    return this.repos.threadWakeContinuations().resolveThreadWakeContinuation(id, reason);
  }

  getThreadWakeContinuation(id: string): ThreadWakeContinuation | undefined {
    return this.repos.threadWakeContinuations().getThreadWakeContinuation(id);
  }

  protected tryGetThread(threadId: string): ThreadSummary | undefined {
    return this.repos.threads().tryGetThread(threadId);
  }

  createThread(title = "New chat", workspacePath = this.getWorkspace().path, options: CreateThreadOptions = {}): ThreadSummary {
    return this.repos.threads().createThread(title, workspacePath, options, this.threadCreationDefaults());
  }

  protected threadCreationDefaults(): CreateProjectStoreThreadDefaults {
    const settings = this.getDefaultSettings();
    return {
      permissionMode: settings.permissionMode,
      collaborationMode: settings.collaborationMode,
      model: settings.model,
      thinkingLevel: settings.thinkingLevel,
      memoryDefaultThreadEnabled: settings.memory.defaultThreadEnabled,
    };
  }

  createWorkflowRecordingThread(input: { goal?: string; workspacePath?: string } = {}): ThreadSummary {
    return this.repos.workflowRecordings().createWorkflowRecordingThread(input);
  }

  startWorkflowRecording(threadId: string, input: { goal?: string } = {}): ThreadSummary {
    return this.repos.workflowRecordings().startWorkflowRecording(threadId, input);
  }

  stopWorkflowRecording(threadId: string): WorkflowRecordingState {
    return this.repos.workflowRecordings().stopWorkflowRecording(threadId);
  }

  confirmWorkflowRecordingReview(threadId: string): WorkflowRecordingState {
    return this.repos.workflowRecordings().confirmWorkflowRecordingReview(threadId);
  }

  updateWorkflowRecordingReviewDraft(
    threadId: string,
    draft: WorkflowRecordingReviewDraftUpdate,
    options: { source?: WorkflowRecordingPlaybookDraft["source"] } = {},
  ): WorkflowRecordingState {
    return this.repos.workflowRecordings().updateWorkflowRecordingReviewDraft(threadId, draft, options);
  }

  listWorkflowRecordingLibrary(input: SearchWorkflowRecordingsInput = {}): WorkflowRecordingLibraryEntry[] {
    return this.repos.workflowRecordings().listWorkflowRecordingLibrary(input);
  }

  describeWorkflowRecording(
    id: string,
    input: Pick<SearchWorkflowRecordingsInput, "includeArchived"> = {},
  ): WorkflowRecordingLibraryDescription {
    return this.repos.workflowRecordings().describeWorkflowRecording(id, input);
  }

  setWorkflowRecordingEnabled(id: string, enabled: boolean): WorkflowRecordingLibraryDescription {
    return this.repos.workflowRecordings().setWorkflowRecordingEnabled(id, enabled);
  }

  updateWorkflowRecordingPlaybook(
    id: string,
    input: {
      baseVersion: number;
      draft: WorkflowRecordingReviewDraftUpdate;
      title?: string;
    },
  ): WorkflowRecordingLibraryDescription {
    return this.repos.workflowRecordings().updateWorkflowRecordingPlaybook(id, input);
  }

  saveSymphonyWorkflowRecipe(
    input: SaveSymphonyWorkflowRecipeInput,
    options: { featureFlagSnapshot: AmbientFeatureFlagSnapshot },
  ): WorkflowRecordingLibraryDescription {
    return this.repos.symphonyWorkflowRecipes().saveSymphonyWorkflowRecipe(input, options);
  }

  archiveWorkflowRecording(id: string, input: { baseVersion: number; reason?: string }): WorkflowRecordingLibraryDescription {
    return this.repos.workflowRecordings().archiveWorkflowRecording(id, input);
  }

  unarchiveWorkflowRecording(id: string, input: { baseVersion: number }): WorkflowRecordingLibraryDescription {
    return this.repos.workflowRecordings().unarchiveWorkflowRecording(id, input);
  }

  restoreWorkflowRecordingVersion(id: string, version: number): WorkflowRecordingLibraryDescription {
    return this.repos.workflowRecordings().restoreWorkflowRecordingVersion(id, version);
  }

  applyWorkflowRecordingSummary(threadId: string, messageId?: string): WorkflowRecordingState {
    return this.repos.workflowRecordings().applyWorkflowRecordingSummary(threadId, messageId);
  }

  updateThreadSettings(
    threadId: string,
    input: Partial<Pick<ThreadSummary, "permissionMode" | "collaborationMode" | "model" | "thinkingLevel" | "memoryEnabled">> & {
      piSessionFile?: string | null;
    },
  ): ThreadSummary {
    return this.repos.threads().updateThreadSettings(threadId, input);
  }

  updateThreadTitle(threadId: string, title: string): ThreadSummary {
    return this.repos.threads().updateThreadTitle(threadId, title);
  }

  setThreadPinned(threadId: string, pinned: boolean): ThreadSummary {
    return this.repos.threads().setThreadPinned(threadId, pinned);
  }

  markThreadRead(threadId: string, readAt = new Date().toISOString()): ThreadSummary {
    return this.repos.threads().markThreadRead(threadId, readAt);
  }

  markThreadUnread(threadId: string): ThreadSummary {
    return this.repos.threads().markThreadUnread(threadId);
  }

  updateThreadWorkspacePath(threadId: string, workspacePath: string): ThreadSummary {
    return this.repos.threads().updateThreadWorkspacePath(threadId, workspacePath);
  }

  listWorkflowLabRuns(input: ListWorkflowLabRunsInput = {}): WorkflowLabRun[] {
    return this.repos.workflowLabs().listWorkflowLabRuns(input);
  }

  getWorkflowLabRun(runId: string): WorkflowLabRun {
    return this.repos.workflowLabs().getWorkflowLabRun(runId);
  }

  createWorkflowLabRun(input: CreateWorkflowLabRunInput): WorkflowLabRun {
    return this.repos.workflowLabs().createWorkflowLabRun(input);
  }

  saveWorkflowLabRun(run: WorkflowLabRun): WorkflowLabRun {
    return this.repos.workflowLabs().saveWorkflowLabRun(run);
  }

  updateWorkflowLabRunStatus(runId: string, status: WorkflowLabRunStatus, error?: string): WorkflowLabRun {
    return this.repos.workflowLabs().updateWorkflowLabRunStatus(runId, status, error);
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
    return this.repos.workflowLabs().appendWorkflowLabVariant(runId, input);
  }

  recordWorkflowLabEvaluation(
    runId: string,
    variantId: string,
    evaluation: WorkflowLabEvaluationResult,
    status: WorkflowLabVariantStatus,
  ): WorkflowLabRun {
    return this.repos.workflowLabs().recordWorkflowLabEvaluation(runId, variantId, evaluation, status);
  }

  adoptWorkflowLabVariant(runId: string, variantId: string): WorkflowRecordingLibraryDescription {
    return this.repos.workflowLabs().adoptWorkflowLabVariant(runId, variantId);
  }

  setThreadWorktree(input: ThreadWorktreeInput): ThreadWorktreeSummary {
    return this.repos.threads().setThreadWorktree(input);
  }

  archiveChats(): number {
    return this.repos.threads().archiveChats({
      settings: this.repos.settings(),
      defaults: this.threadCreationDefaults(),
    });
  }

  archiveThread(threadId: string): number {
    return this.repos.threads().archiveThread({
      threadId,
      settings: this.repos.settings(),
      defaults: this.threadCreationDefaults(),
    });
  }

  forkThread(threadId: string, workspacePath = this.getWorkspace().path): ThreadSummary {
    return this.repos.threads().forkThread({
      threadId,
      workspacePath,
      defaults: this.threadCreationDefaults(),
    });
  }

  getThreadWorktree(threadId: string): ThreadWorktreeSummary | undefined {
    return this.repos.threads().getThreadWorktree(threadId);
  }

  updateThreadWorktreeCheckpoint(threadId: string, checkpointId: string): void {
    this.repos.threads().updateThreadWorktreeCheckpoint(threadId, checkpointId);
  }

  listMessages(threadId: string): ChatMessage[] {
    return this.repos.messages().listMessages(threadId);
  }

  listMessageVoiceStates(threadId: string): MessageVoiceState[] {
    return this.repos.messageVoices().listMessageVoiceStates(threadId);
  }

  getMessageVoiceState(messageId: string): MessageVoiceState | undefined {
    return this.repos.messageVoices().getMessageVoiceState(messageId);
  }

  clearMessageVoiceArtifact(messageId: string, error = "Voice artifact cleared."): MessageVoiceState {
    return this.repos.messageVoices().clearMessageVoiceArtifact(messageId, error);
  }

  setMessageVoiceState(input: Omit<MessageVoiceState, "createdAt" | "updatedAt">): MessageVoiceState {
    return this.repos.messageVoices().setMessageVoiceState(input);
  }

  deleteMessagesAfter(threadId: string, messageId: string): ChatMessage[] {
    return this.repos.messages().deleteMessagesAfter(threadId, messageId);
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
    return this.repos.workspaceSearch().searchWorkspace({
      query,
      scope: options.scope,
      threadId: options.threadId,
      limit: options.limit,
      workspacePath: options.workspacePath ?? workspace.path,
      projectName: options.projectName ?? workspace.name,
    });
  }

  addMessage(input: { threadId: string; role: ChatMessage["role"]; content: string; metadata?: Record<string, unknown> }): ChatMessage {
    return this.repos.messages().addMessage(input);
  }

  appendToMessage(messageId: string, delta: string): ChatMessage {
    return this.repos.messages().appendToMessage(messageId, delta);
  }

  replaceMessage(messageId: string, content: string, metadata?: Record<string, unknown>): ChatMessage {
    return this.repos.messages().replaceMessage(messageId, content, metadata);
  }

  startRun(input: { threadId: string; assistantMessageId: string }): RunRecord {
    return this.repos.runs().startRun(input);
  }

  updateRunStatus(runId: string, status: ActivePersistedRunStatus): RunRecord {
    return this.repos.runs().updateRunStatus(runId, status);
  }

  updateRunDiagnostics(runId: string, diagnostics: RunDiagnostics): RunRecord {
    return this.repos.runs().updateRunDiagnostics(runId, diagnostics);
  }

  getRunRecord(runId: string): RunRecord {
    return this.repos.runs().getRun(runId);
  }

  finishRun(runId: string, status: TerminalPersistedRunStatus, errorMessage?: string): RunRecord {
    return this.repos.runs().finishRun(runId, status, errorMessage);
  }

  listActiveRuns(): RunRecord[] {
    return this.repos.runs().listActiveRuns();
  }

  recordContextUsageSnapshot(input: ContextUsageSnapshotInput): ContextUsageSnapshot {
    this.getThread(input.threadId);
    return this.repos.contextUsage().recordContextUsageSnapshot(input);
  }

  getLatestContextUsageSnapshot(threadId: string): ContextUsageSnapshot | undefined {
    return this.repos.contextUsage().getLatestContextUsageSnapshot(threadId);
  }

  listContextUsageSnapshots(limit = 100): ContextUsageSnapshot[] {
    return this.repos.contextUsage().listContextUsageSnapshots(limit);
  }

  addPermissionAudit(input: PermissionAuditInput): PermissionAuditEntry {
    return this.repos.permissions().addPermissionAudit(input);
  }

  listPermissionAudit(limit = 50): PermissionAuditEntry[] {
    return this.repos.permissions().listPermissionAudit(limit);
  }

  createPermissionGrant(input: CreateAmbientPermissionGrantInput): AmbientPermissionGrant {
    return this.repos.permissions().createPermissionGrant(input);
  }

  getPermissionGrant(id: string): AmbientPermissionGrant {
    return this.repos.permissions().getPermissionGrant(id);
  }

  listPermissionGrants(input: { includeRevoked?: boolean } = {}): AmbientPermissionGrant[] {
    return this.repos.permissions().listPermissionGrants(input);
  }

  revokePermissionGrant(id: string): AmbientPermissionGrant {
    return this.repos.permissions().revokePermissionGrant(id);
  }

  createPlannerPlanArtifact(input: PlannerPlanArtifactInput): PlannerPlanArtifact {
    return this.repos.plannerArtifacts().createPlannerPlanArtifact(input);
  }

  getPlannerPlanArtifact(artifactId: string): PlannerPlanArtifact {
    return this.repos.plannerArtifacts().getPlannerPlanArtifact(artifactId);
  }

  listPlannerPlanArtifacts(threadId: string): PlannerPlanArtifact[] {
    return this.repos.plannerArtifacts().listPlannerPlanArtifacts(threadId);
  }

  updatePlannerPlanArtifact(
    artifactId: string,
    input: { status?: PlannerPlanArtifactStatus; workflowState?: PlannerPlanWorkflowState },
  ): PlannerPlanArtifact {
    return this.repos.plannerArtifacts().updatePlannerPlanArtifact(artifactId, input);
  }

  updatePlannerPlanArtifactStatus(artifactId: string, status: PlannerPlanArtifactStatus): PlannerPlanArtifact {
    return this.repos.plannerArtifacts().updatePlannerPlanArtifactStatus(artifactId, status);
  }

  finishPlannerPlanFinalizationAttempt(
    artifactId: string,
    input: { status: Exclude<PlannerPlanFinalizationAttemptStatus, "running">; workflowState?: PlannerPlanWorkflowState; error?: string },
  ): PlannerPlanArtifact {
    return this.repos.plannerArtifacts().finishPlannerPlanFinalizationAttempt(artifactId, input);
  }

  updatePlannerPlanArtifactContent(
    artifactId: string,
    input: Pick<
      PlannerPlanArtifact,
      "sourceMessageId" | "title" | "summary" | "content" | "steps" | "openQuestions" | "risks" | "verification" | "warnings" | "diagrams"
    > & { workflowState?: PlannerPlanWorkflowState },
  ): PlannerPlanArtifact {
    return this.repos.plannerArtifacts().updatePlannerPlanArtifactContent(artifactId, input);
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
    return this.repos.plannerArtifacts().setPlannerPlanDurableArtifact(artifactId, input);
  }

  setPlannerPlanDurableArtifactValidation(
    artifactId: string,
    validation: PlannerDurableArtifactValidationResult,
    workflowState?: PlannerPlanWorkflowState,
  ): PlannerPlanArtifact {
    return this.repos.plannerArtifacts().setPlannerPlanDurableArtifactValidation(artifactId, validation, workflowState);
  }

  promotePlannerDurableArtifactToBoardSource(artifactId: string): ProjectBoardSource | undefined {
    return this.repos.projectBoardDurablePlanSources().promotePlannerDurableArtifactToBoardSource(artifactId);
  }

  answerPlannerDecisionQuestion(
    artifactId: string,
    questionId: string,
    answer: { kind: "option"; optionId: string } | { kind: "custom"; customText: string },
  ): PlannerPlanArtifact {
    return this.repos.plannerArtifacts().answerPlannerDecisionQuestion(artifactId, questionId, answer);
  }

  isPluginEnabled(pluginId: string): boolean {
    return this.repos.settings().isPluginEnabled(pluginId);
  }

  setPluginEnabled(pluginId: string, enabled: boolean): void {
    this.repos.settings().setPluginEnabled(pluginId, enabled);
  }

  isPluginTrusted(pluginId: string, pluginFingerprint?: string): boolean {
    return this.repos.settings().isPluginTrusted(pluginId, pluginFingerprint);
  }

  setPluginTrusted(pluginId: string, trusted: boolean, pluginFingerprint?: string): void {
    this.repos.settings().setPluginTrusted(pluginId, trusted, pluginFingerprint);
  }

  isPiPackageEnabled(packageId: string): boolean {
    return this.repos.settings().isPiPackageEnabled(packageId);
  }

  setPiPackageEnabled(packageId: string, enabled: boolean): void {
    this.repos.settings().setPiPackageEnabled(packageId, enabled);
  }

  clearPiPackageEnabled(packageId: string): void {
    this.repos.settings().clearPiPackageEnabled(packageId);
  }

  interruptActiveRuns(reason = INTERRUPTED_RUN_MESSAGE): number {
    return this.repos.activeRunRecoveries().interruptActiveRuns(reason);
  }

  stallActiveOrchestrationRuns(): number {
    return this.repos.activeRunRecoveries().stallActiveOrchestrationRuns();
  }

  pruneRedundantEmptyThreads(): number {
    return this.repos.threads().pruneRedundantEmptyThreads(this.repos.settings());
  }

  protected ensureDefaultSettings(): void {
    this.repos.settings().ensureDefaultSettings();
  }

  ensureAutomationScheduleDedicatedThread(scheduleId: string): ThreadSummary {
    return this.repos.automations().ensureAutomationScheduleDedicatedThread(scheduleId);
  }
}
