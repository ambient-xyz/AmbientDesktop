import type { IpcMain } from "electron";
import { z } from "zod";

import { isAmbientSubagentsEnabled, type AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import {
  missingRequiredSymphonyMetricTemplateLabels,
  requiredSymphonyMetricTemplateErrorMessage,
  SYMPHONY_WORKFLOW_PATTERN_IDS,
} from "../../shared/symphonyWorkflowRecipes";
import type {
  ApplyWorkflowRecordingSummaryInput,
  DesktopEvent,
  DesktopState,
} from "../../shared/desktopTypes";
import type {
  AmbientPermissionGrant,
  PermissionMode,
  PermissionRequest,
} from "../../shared/permissionTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import type {
  AdoptWorkflowLabVariantInput,
  AnswerWorkflowDiscoveryQuestionInput,
  ArchiveWorkflowRecordingInput,
  CancelWorkflowRunInput,
  CompileWorkflowDebugRewriteInput,
  CompileWorkflowPreviewInput,
  ConfirmWorkflowRecordingInput,
  CreateWorkflowAgentFolderInput,
  CreateWorkflowAgentThreadInput,
  CreateWorkflowLabRunInput,
  CreateWorkflowRevisionInput,
  DescribeWorkflowDiscoveryCapabilityInput,
  DescribeWorkflowRecordingInput,
  GetWorkflowLabRunInput,
  InvokeWorkflowNativeToolInput,
  ListWorkflowAgentChatMessagesInput,
  ListWorkflowLabRunsInput,
  ListWorkflowRevisionsInput,
  ListWorkflowVersionsInput,
  MoveWorkflowAgentThreadInput,
  RecoverWorkflowRunInput,
  RequestWorkflowRecordingReviewInput,
  ResolveWorkflowApprovalInput,
  ResolveWorkflowDiscoveryAccessRequestInput,
  ResolveWorkflowRevisionInput,
  RestoreWorkflowRecordingVersionInput,
  RestoreWorkflowVersionInput,
  RevalidateWorkflowArtifactInput,
  ReviewWorkflowArtifactInput,
  RunWorkflowArtifactInput,
  RunWorkflowThreadExplorationInput,
  SaveSymphonyWorkflowRecipeInput,
  SearchWorkflowDiscoveryCapabilitiesInput,
  SearchWorkflowRecordingsInput,
  SetWorkflowRecordingEnabledInput,
  StartWorkflowDiscoveryInput,
  StartWorkflowLabRunInput,
  StartWorkflowRecordingInput,
  StartWorkflowRevisionDiscoveryInput,
  StopWorkflowLabRunInput,
  StopWorkflowRecordingInput,
  UnarchiveWorkflowRecordingInput,
  UpdateWorkflowArtifactSourceInput,
  UpdateWorkflowConnectorGrantInput,
  UpdateWorkflowRecordingPlaybookInput,
  UpdateWorkflowRecordingReviewInput,
  UpdateWorkflowRevisionInput,
  WorkflowAgentDiscoveryResult,
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowDashboard,
  WorkflowDiscoveryCapabilityDescription,
  WorkflowDiscoveryCapabilitySearch,
  WorkflowExplorationTraceSummary,
  WorkflowGraphSnapshot,
  WorkflowLabRun,
  WorkflowNativeToolInvocationResult,
  WorkflowRecordingLibraryDescription,
  WorkflowRecordingLibraryEntry,
  WorkflowRecordingReviewDraftUpdate,
  WorkflowRevisionSummary,
  WorkflowRunDetail,
  WorkflowRunDetailInput,
  WorkflowThreadExplorationResult,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import type { CompileWorkflowArtifactInput } from "../workflow-compiler/workflowCompilerService";
import type { WorkflowRecoveryPlan } from "../workflow/workflowRecovery";
import type { RunWorkflowArtifactInput as WorkflowRunArtifactServiceInput } from "../workflow/workflowRunService";
import type { WorkflowConnectorDescriptor } from "../workflow/workflowConnectors";
import type { WorkflowDiscoveryPolicyContext } from "../workflow-discovery/workflowDiscoveryPolicy";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const workflowRecorderIpcChannels = [
  "workflow-recorder:start",
  "workflow-recorder:stop",
  "workflow-recorder:request-review",
  "workflow-recorder:update-review",
  "workflow-recorder:confirm",
  "workflow-recorder:apply-summary",
  "workflow-recorder:search",
  "workflow-recorder:describe",
  "workflow-recorder:set-enabled",
  "workflow-recorder:update-playbook",
  "workflow-recorder:save-symphony-recipe",
  "workflow-recorder:archive",
  "workflow-recorder:unarchive",
  "workflow-recorder:restore-version",
] as const;

export const workflowLabIpcChannels = [
  "workflow-lab:create-run",
  "workflow-lab:list-runs",
  "workflow-lab:get-run",
  "workflow-lab:start-run",
  "workflow-lab:stop-run",
  "workflow-lab:adopt-variant",
] as const;

export const workflowDashboardIpcChannels = [
  "workflow:list-dashboard",
  "workflow:run-detail",
  "workflow:create-sample",
] as const;

export const workflowCompilePreviewIpcChannels = [
  "workflow:compile-preview",
] as const;

export const workflowDebugRewriteIpcChannels = [
  "workflow:debug-rewrite",
] as const;

export const workflowApprovalIpcChannels = [
  "workflow:resolve-approval",
] as const;

export const workflowCancelRunIpcChannels = [
  "workflow:cancel-run",
] as const;

export const workflowArtifactReviewIpcChannels = [
  "workflow:review-artifact",
] as const;

export const workflowConnectorGrantIpcChannels = [
  "workflow:update-connector-grant",
] as const;

export const workflowArtifactRevalidationIpcChannels = [
  "workflow:revalidate-artifact",
] as const;

export const workflowArtifactSourceIpcChannels = [
  "workflow:update-artifact-source",
] as const;

export const workflowRunArtifactIpcChannels = [
  "workflow:run-artifact",
] as const;

export const workflowRecoverRunIpcChannels = [
  "workflow:recover-run",
] as const;

export const workflowAgentThreadIpcChannels = [
  "workflow-agents:list-folders",
  "workflow-agents:create-folder",
  "workflow-agents:move-thread",
  "workflow-agents:create-thread",
  "workflow-agents:ensure-chat-thread",
  "workflow-agents:list-chat-messages",
] as const;

export const workflowAgentDiscoveryStartIpcChannels = [
  "workflow-agents:start-discovery",
] as const;

export const workflowAgentRevisionDiscoveryStartIpcChannels = [
  "workflow-agents:start-revision-discovery",
] as const;

export const workflowAgentDiscoveryAnswerIpcChannels = [
  "workflow-agents:answer-discovery-question",
] as const;

export const workflowAgentTraceIpcChannels = [
  "workflow-agents:list-graph-snapshots",
  "workflow-agents:list-exploration-traces",
] as const;

export const workflowAgentCapabilityIpcChannels = [
  "workflow-agents:search-capabilities",
  "workflow-agents:describe-capability",
] as const;

export const workflowAgentNativeToolIpcChannels = [
  "workflow-agents:invoke-native-tool",
] as const;

export const workflowAgentExplorationIpcChannels = [
  "workflow-agents:run-exploration",
] as const;

export const workflowAgentDiscoveryAccessIpcChannels = [
  "workflow-agents:resolve-discovery-access-request",
] as const;

export const workflowAgentRevisionIpcChannels = [
  "workflow-agents:list-revisions",
  "workflow-agents:list-versions",
  "workflow-agents:restore-version",
  "workflow-agents:create-revision",
  "workflow-agents:update-revision",
  "workflow-agents:resolve-revision",
] as const;

interface WorkflowRecorderThread {
  id: string;
  workspacePath: string;
  gitWorktree?: unknown;
}

interface WorkflowRecorderWorkspace {
  path: string;
}

interface WorkflowRecorderStore<Thread extends WorkflowRecorderThread> {
  getWorkspace(): WorkflowRecorderWorkspace;
  createWorkflowRecordingThread(input: { goal?: string; workspacePath: string }): Thread;
  stopWorkflowRecording(threadId: string): void;
  updateWorkflowRecordingReviewDraft(threadId: string, draft: WorkflowRecordingReviewDraftUpdate): void;
  confirmWorkflowRecordingReview(threadId: string): void;
  applyWorkflowRecordingSummary(threadId: string, messageId?: string): void;
  describeWorkflowRecording(id: string, options: { includeArchived?: boolean }): WorkflowRecordingLibraryDescription;
  setWorkflowRecordingEnabled(id: string, enabled: boolean): void;
  updateWorkflowRecordingPlaybook(
    id: string,
    input: {
      baseVersion: number;
      draft: WorkflowRecordingReviewDraftUpdate;
      title?: string;
    },
  ): void;
  saveSymphonyWorkflowRecipe(
    input: SaveSymphonyWorkflowRecipeInput,
    options: { featureFlagSnapshot: AmbientFeatureFlagSnapshot },
  ): WorkflowRecordingLibraryDescription;
  archiveWorkflowRecording(
    id: string,
    input: {
      baseVersion: number;
      reason?: string;
    },
  ): void;
  unarchiveWorkflowRecording(id: string, input: { baseVersion: number }): void;
  restoreWorkflowRecordingVersion(id: string, version: number): void;
}

interface WorkflowRecorderRuntime {
  requestWorkflowRecordingReview(input: RequestWorkflowRecordingReviewInput): MaybePromise<void>;
}

interface WorkflowRecorderHost<Thread extends WorkflowRecorderThread, Store extends WorkflowRecorderStore<Thread>> {
  activeThreadId: string;
  runtime: WorkflowRecorderRuntime;
  store: Store;
}

interface WorkflowLabStore {
  createWorkflowLabRun(input: CreateWorkflowLabRunInput): WorkflowLabRun;
  listWorkflowLabRuns(input: ListWorkflowLabRunsInput): WorkflowLabRun[];
  getWorkflowLabRun(runId: string): WorkflowLabRun;
  updateWorkflowLabRunStatus(runId: string, status: "stopped"): WorkflowLabRun;
  adoptWorkflowLabVariant(runId: string, variantId: string): WorkflowRecordingLibraryDescription;
}

interface WorkflowLabHost<Store extends WorkflowLabStore> {
  activeThreadId: string;
  store: Store;
}

interface WorkflowDashboardWorkspace {
  path: string;
}

interface WorkflowDashboardStore {
  getWorkspace(): WorkflowDashboardWorkspace;
}

interface WorkflowDashboardHost<Store extends WorkflowDashboardStore> {
  store: Store;
  workspacePath: string;
}

interface WorkflowCompileWorkspace {
  name: string;
  path: string;
}

interface WorkflowCompileStore {
  getWorkspace(): {
    statePath: string;
  };
}

interface WorkflowCompileThread {
  model: string;
  permissionMode?: PermissionMode;
}

interface WorkflowRunArtifactThread extends WorkflowCompileThread {
  permissionMode: PermissionMode;
}

interface WorkflowCompileContext<Store extends WorkflowCompileStore, Thread extends WorkflowCompileThread> {
  targetStore: Store;
  thread: Thread;
  projectPath: string;
}

interface WorkflowDebugRewriteWorkflowThread {
  latestVersion?: {
    id?: string;
  };
}

interface WorkflowDebugRewriteRuntimeContext<
  Store extends WorkflowCompileStore,
  Thread extends WorkflowCompileThread,
  WorkflowThread extends WorkflowDebugRewriteWorkflowThread,
  DebugContext extends { runId: string; workflowThreadId?: string },
> {
  targetStore: Store;
  thread: Thread;
  workflowThread: WorkflowThread;
  debugContext: DebugContext;
  projectPath: string;
}

interface WorkflowApprovalHost<Store> {
  store: Store;
  workspacePath: string;
}

interface WorkflowCancelRunHost<Store> {
  store: Store;
  workspacePath: string;
}

interface WorkflowArtifactReviewHost<Store> {
  store: Store;
  workspacePath: string;
}

interface WorkflowConnectorGrantHost<Store> {
  store: Store;
  workspacePath: string;
}

interface WorkflowArtifactRevalidationHost<Store> {
  store: Store;
  workspacePath: string;
}

interface WorkflowArtifactSourceHost<Store> {
  store: Store;
  workspacePath: string;
}

interface WorkflowRunArtifactSummary {
  id: string;
  status: string;
  workflowThreadId?: string;
}

interface WorkflowRunArtifactContext<
  Store extends WorkflowCompileStore,
  Thread extends WorkflowRunArtifactThread,
  Browser extends WorkflowRunArtifactServiceInput["browser"],
  Artifact extends WorkflowRunArtifactSummary,
> {
  targetStore: Store;
  targetBrowserService: Browser;
  thread: Thread;
  artifact: Artifact;
  projectPath: string;
}

interface WorkflowRecoverRunHost<Store extends WorkflowCompileStore> {
  store: Store;
}

interface WorkflowRunAbortController {
  abort(): void;
}

interface WorkflowAgentThreadStore {
  createWorkflowAgentFolder(input: CreateWorkflowAgentFolderInput): WorkflowAgentFolderSummary[];
  moveWorkflowAgentThread(input: MoveWorkflowAgentThreadInput): WorkflowAgentFolderSummary[];
  createWorkflowAgentThread(input: CreateWorkflowAgentThreadInput): WorkflowAgentFolderSummary[];
  ensureWorkflowAgentChatThread(workflowThreadId: string): WorkflowAgentThreadSummary;
  getWorkflowAgentThreadSummary(workflowThreadId: string): WorkflowAgentThreadSummary;
  getThread(threadId: string): unknown;
  listMessages(threadId: string): ChatMessage[];
}

interface WorkflowProjectContext<Store> {
  targetStore: Store;
  projectPath: string;
}

interface WorkflowAgentThreadHost<Store extends WorkflowAgentThreadStore> {
  store: Store;
}

interface WorkflowAgentTraceStore {
  listWorkflowGraphSnapshots(workflowThreadId: string): WorkflowGraphSnapshot[];
  listWorkflowExplorationTraces(workflowThreadId: string): WorkflowExplorationTraceSummary[];
}

interface WorkflowAgentTraceHost<Store extends WorkflowAgentTraceStore> {
  store: Store;
}

interface WorkflowAgentExplorationStore {
  listWorkflowAgentFolders(): WorkflowAgentFolderSummary[];
}

interface WorkflowAgentExplorationContext<Store extends WorkflowAgentExplorationStore> extends WorkflowProjectContext<Store> {}

interface WorkflowAgentExplorationRunResult {
  thread: WorkflowAgentThreadSummary;
  trace: WorkflowExplorationTraceSummary;
  graphSnapshot: WorkflowGraphSnapshot;
}

interface WorkflowAgentRevisionStore {
  listWorkflowRevisions(workflowThreadId: string): WorkflowRevisionSummary[];
  listWorkflowVersions(workflowThreadId: string): WorkflowVersionSummary[];
  createWorkflowRevision(input: CreateWorkflowRevisionInput): WorkflowRevisionSummary;
  getWorkflowRevision(revisionId: string): WorkflowRevisionSummary;
  updateWorkflowRevision(input: UpdateWorkflowRevisionInput): WorkflowRevisionSummary;
  resolveWorkflowRevision(input: ResolveWorkflowRevisionInput): WorkflowRevisionSummary;
}

interface WorkflowAgentRevisionHost<Store extends WorkflowAgentRevisionStore> {
  store: Store;
  workspacePath: string;
}

interface WorkflowAgentDiscoveryAccessStore {
  listPermissionGrants(): AmbientPermissionGrant[];
}

interface WorkflowAgentDiscoveryAccessThread {
  id: string;
  permissionMode: PermissionMode;
}

interface WorkflowAgentDiscoveryAccessWorkflowThread {
  chatThreadId?: string;
}

interface WorkflowAgentDiscoveryAccessContext<Store extends WorkflowAgentDiscoveryAccessStore> {
  targetStore: Store;
  thread: WorkflowAgentDiscoveryAccessThread;
  workflowThread: WorkflowAgentDiscoveryAccessWorkflowThread;
  projectPath: string;
}

interface WorkflowAgentDiscoveryAccessOptions {
  connectorDescriptors: WorkflowConnectorDescriptor[];
  permissionMode: PermissionMode;
  permissionAuditThreadId: string;
  workspacePath: string;
}

type WorkflowCompilePreviewArtifactInput<Store extends WorkflowCompileStore> = Omit<CompileWorkflowArtifactInput, "store"> & {
  store: Store;
};
type WorkflowDebugRewriteArtifactInput<Store extends WorkflowCompileStore> = Omit<CompileWorkflowArtifactInput, "store"> & {
  store: Store;
};
type WorkflowRunArtifactServiceInputForStore<
  Store extends WorkflowCompileStore,
  Browser extends WorkflowRunArtifactServiceInput["browser"],
> = Omit<WorkflowRunArtifactServiceInput, "store" | "browser"> & {
  store: Store;
  browser: Browser;
};
type WorkflowCompileProgressEvent = Extract<DesktopEvent, { type: "workflow-compile-progress" }>;
type WorkflowRunStartedEvent = Extract<DesktopEvent, { type: "workflow-run-started" }>;
type WorkflowRunArtifactPermissionRequest = Omit<PermissionRequest, "id">;
type WorkflowRunArtifactPluginRegistration = NonNullable<WorkflowRunArtifactServiceInput["pluginRegistrations"]>[number];

export interface RegisterWorkflowRecorderIpcDependencies<
  Thread extends WorkflowRecorderThread,
  Store extends WorkflowRecorderStore<Thread>,
  Host extends WorkflowRecorderHost<Thread, Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  requireProjectRuntimeHostForThreadAction(input: { threadId: string; projectId?: string }, activeHostSnapshot: Host): Host;
  requireProjectRuntimeHostForWorkflowRecording(workflowRecordingId: string): Host;
  prepareWorktreeForThread(thread: Thread, targetStore: Store): MaybePromise<Thread>;
  setProjectHostActiveThreadId(host: Host, threadId: string): void;
  emitProjectStateIfActive(host: Host, threadId?: string): void;
  emitWorkflowRecordingLibraryStateChanged(host: Host, threadId?: string): void;
  readStateForProjectHostAction(host: Host, threadId?: string): DesktopState;
  listGlobalWorkflowRecordingLibrary(input?: SearchWorkflowRecordingsInput): WorkflowRecordingLibraryEntry[];
  getFeatureFlagSnapshot(store: Store): AmbientFeatureFlagSnapshot;
}

export interface RegisterWorkflowLabIpcDependencies<
  Store extends WorkflowLabStore,
  Host extends WorkflowLabHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  requireProjectRuntimeHostForWorkflowRecording(workflowRecordingId: string): Host;
  requireProjectRuntimeHostForWorkflowLabRun(runId: string): Host;
  emitProjectStateIfActive(host: Host, threadId?: string): void;
  emitWorkflowRecordingLibraryStateChanged(host: Host, threadId?: string): void;
  readStateForProjectHostAction(host: Host, threadId?: string): DesktopState;
  startWorkflowLabRun(host: Host, input: StartWorkflowLabRunInput): MaybePromise<WorkflowLabRun>;
}

export interface RegisterWorkflowDashboardIpcDependencies<
  Store extends WorkflowDashboardStore,
  Host extends WorkflowDashboardHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  requireProjectRuntimeHostForWorkflowRun(runId: string): Host;
  readWorkflowDashboard(store: Store): WorkflowDashboard;
  readWorkflowRunDetail(store: Store, runId: string): WorkflowRunDetail;
  createWorkflowSampleArtifact(store: Store, workspacePath: string): WorkflowDashboard;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowCompilePreviewIpcDependencies<
  Store extends WorkflowCompileStore,
  Thread extends WorkflowCompileThread,
  PluginRegistry,
  PluginRegistrations extends NonNullable<CompileWorkflowArtifactInput["pluginRegistrations"]>,
> {
  handleIpc: HandleIpc;
  workflowCompileIpcContext(input: CompileWorkflowPreviewInput): WorkflowCompileContext<Store, Thread>;
  workspaceStateForThread(thread: Thread, store: Store): WorkflowCompileWorkspace;
  getAmbientProviderStatus(model: Thread["model"]): {
    baseUrl: CompileWorkflowArtifactInput["baseUrl"];
  };
  pluginMcpRegistrationsForThread(thread: Thread, store: Store): MaybePromise<PluginRegistrations>;
  listPluginRegistry(projectPath: string, store: Store): MaybePromise<PluginRegistry>;
  workflowToolDescriptorsFromPluginRegistry(
    pluginRegistry: PluginRegistry,
    pluginRegistrations: PluginRegistrations,
  ): CompileWorkflowArtifactInput["toolDescriptors"];
  connectorDescriptors(): NonNullable<CompileWorkflowArtifactInput["connectorDescriptors"]>;
  readSearchRoutingSettings(): CompileWorkflowArtifactInput["searchRoutingSettings"];
  ambientRetryPolicyFromCurrentSettings(store: Store): CompileWorkflowArtifactInput["retryPolicy"];
  compileWorkflowArtifact(input: WorkflowCompilePreviewArtifactInput<Store>): MaybePromise<WorkflowDashboard>;
  emitWorkflowEvent(event: WorkflowCompileProgressEvent, projectPath: string): void;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowDebugRewriteIpcDependencies<
  Store extends WorkflowCompileStore,
  Thread extends WorkflowCompileThread,
  WorkflowThread extends WorkflowDebugRewriteWorkflowThread,
  DebugContext extends { runId: string; workflowThreadId?: string },
  PluginRegistry,
  PluginRegistrations extends NonNullable<CompileWorkflowArtifactInput["pluginRegistrations"]>,
> {
  handleIpc: HandleIpc;
  readE2eEnabled(): boolean;
  emitE2eWorkflowDebugRewriteInput(input: CompileWorkflowDebugRewriteInput): void;
  readE2eWorkflowDashboard(): MaybePromise<WorkflowDashboard>;
  workflowDebugRewriteIpcContext(input: CompileWorkflowDebugRewriteInput): WorkflowDebugRewriteRuntimeContext<
    Store,
    Thread,
    WorkflowThread,
    DebugContext
  >;
  workflowDebugRewriteUserRequest(debugContext: DebugContext): string;
  workspaceStateForThread(thread: Thread, store: Store): WorkflowCompileWorkspace;
  getAmbientProviderStatus(model: Thread["model"]): {
    baseUrl: CompileWorkflowArtifactInput["baseUrl"];
  };
  pluginMcpRegistrationsForThread(thread: Thread, store: Store): MaybePromise<PluginRegistrations>;
  listPluginRegistry(projectPath: string, store: Store): MaybePromise<PluginRegistry>;
  workflowToolDescriptorsFromPluginRegistry(
    pluginRegistry: PluginRegistry,
    pluginRegistrations: PluginRegistrations,
  ): CompileWorkflowArtifactInput["toolDescriptors"];
  connectorDescriptors(): NonNullable<CompileWorkflowArtifactInput["connectorDescriptors"]>;
  readSearchRoutingSettings(): CompileWorkflowArtifactInput["searchRoutingSettings"];
  ambientRetryPolicyFromCurrentSettings(store: Store): CompileWorkflowArtifactInput["retryPolicy"];
  buildWorkflowDebugRewritePromptSection(debugContext: DebugContext): string;
  compileWorkflowArtifact(input: WorkflowDebugRewriteArtifactInput<Store>): MaybePromise<WorkflowDashboard>;
  createWorkflowDebugRewriteRevision(
    store: Store,
    debugContext: DebugContext,
    input: { baseVersionId?: string; requestedChange?: string },
  ): unknown;
  emitWorkflowEvent(event: WorkflowCompileProgressEvent, projectPath: string): void;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowApprovalIpcDependencies<
  Store,
  Host extends WorkflowApprovalHost<Store>,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForWorkflowRun(runId: string): Host;
  resolveWorkflowApproval(store: Store, input: ResolveWorkflowApprovalInput): WorkflowRunDetail;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowCancelRunIpcDependencies<
  Store,
  Host extends WorkflowCancelRunHost<Store>,
> {
  handleIpc: HandleIpc;
  projectRuntimeHostForWorkflowRun(runId: string): Host | undefined;
  activeWorkflowRunHost(runId: string): Host | undefined;
  activeWorkflowRunController(runId: string): WorkflowRunAbortController | undefined;
  readWorkflowDashboard(store: Store): WorkflowDashboard;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowArtifactReviewIpcDependencies<
  Store,
  Host extends WorkflowArtifactReviewHost<Store>,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForWorkflowArtifact(artifactId: string): Host;
  reviewWorkflowArtifact(store: Store, input: ReviewWorkflowArtifactInput): WorkflowDashboard;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowConnectorGrantIpcDependencies<
  Store,
  Host extends WorkflowConnectorGrantHost<Store>,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForWorkflowArtifact(artifactId: string): Host;
  updateWorkflowConnectorGrant(store: Store, input: UpdateWorkflowConnectorGrantInput): WorkflowDashboard;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowArtifactRevalidationIpcDependencies<
  Store,
  Host extends WorkflowArtifactRevalidationHost<Store>,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForWorkflowArtifact(artifactId: string): Host;
  revalidateWorkflowArtifact(
    store: Store,
    input: RevalidateWorkflowArtifactInput,
    options: { connectorDescriptors: WorkflowConnectorDescriptor[] },
  ): WorkflowDashboard;
  connectorDescriptors(): WorkflowConnectorDescriptor[];
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowArtifactSourceIpcDependencies<
  Store,
  Host extends WorkflowArtifactSourceHost<Store>,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForWorkflowArtifact(artifactId: string): Host;
  updateWorkflowArtifactSource(
    store: Store,
    input: UpdateWorkflowArtifactSourceInput,
    options: { connectorDescriptors: WorkflowConnectorDescriptor[] },
  ): WorkflowDashboard;
  connectorDescriptors(): WorkflowConnectorDescriptor[];
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowRunArtifactIpcDependencies<
  Store extends WorkflowCompileStore,
  Thread extends WorkflowRunArtifactThread,
  Browser extends WorkflowRunArtifactServiceInput["browser"],
  Artifact extends WorkflowRunArtifactSummary,
> {
  handleIpc: HandleIpc;
  workflowArtifactIpcContext(artifactId: string): WorkflowRunArtifactContext<Store, Thread, Browser, Artifact>;
  getAmbientProviderStatus(model: Thread["model"]): {
    baseUrl: WorkflowRunArtifactServiceInput["baseUrl"];
  };
  pluginMcpRegistrationsForThread(
    thread: Thread,
    store: Store,
  ): MaybePromise<NonNullable<WorkflowRunArtifactServiceInput["pluginRegistrations"]>>;
  listPluginRegistry(projectPath: string, store: Store): MaybePromise<NonNullable<WorkflowRunArtifactServiceInput["pluginRegistry"]>>;
  requestPermissionWithGrantRegistry(
    request: WorkflowRunArtifactPermissionRequest,
    input: {
      thread: Thread;
      permissionMode?: PermissionMode;
      workspacePath: string;
      workflowThreadId?: string;
      store: Store;
    },
  ): MaybePromise<{ allowed: boolean }>;
  ensureWorkflowPluginTrusted(thread: Thread, registration: WorkflowRunArtifactPluginRegistration, store: Store): Promise<boolean>;
  pluginCaller: NonNullable<WorkflowRunArtifactServiceInput["pluginCaller"]>;
  connectorRegistrations(): NonNullable<WorkflowRunArtifactServiceInput["connectorRegistrations"]>;
  connectorAccountAuthorizer(): WorkflowRunArtifactServiceInput["connectorAccountAuthorizer"];
  runWorkflowArtifact(input: WorkflowRunArtifactServiceInputForStore<Store, Browser>): MaybePromise<WorkflowDashboard>;
  rememberActiveWorkflowRun(runId: string, controller: AbortController, workspacePath: string): void;
  forgetActiveWorkflowRunsForController(controller: AbortController): void;
  emitWorkflowEvent(event: WorkflowRunStartedEvent, workspacePath: string): void;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowRecoverRunIpcDependencies<
  Store extends WorkflowCompileStore,
  Host extends WorkflowRecoverRunHost<Store>,
  Thread extends WorkflowRunArtifactThread,
  Browser extends WorkflowRunArtifactServiceInput["browser"],
  Artifact extends WorkflowRunArtifactSummary,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForWorkflowRun(runId: string): Host;
  buildWorkflowRecoveryPlan(store: Store, input: RecoverWorkflowRunInput): WorkflowRecoveryPlan;
  workflowArtifactIpcContextForHost(host: Host, artifactId: string): WorkflowRunArtifactContext<Store, Thread, Browser, Artifact>;
  markStaleWorkflowRunForRecoveryIfNeeded(
    store: Store,
    runId: string,
    input: {
      recoveryAction: WorkflowRecoveryPlan["recovery"]["action"];
      sourceEventId: string;
      reason: string;
    },
  ): unknown;
  getAmbientProviderStatus(model: Thread["model"]): {
    baseUrl: WorkflowRunArtifactServiceInput["baseUrl"];
  };
  pluginMcpRegistrationsForThread(
    thread: Thread,
    store: Store,
  ): MaybePromise<NonNullable<WorkflowRunArtifactServiceInput["pluginRegistrations"]>>;
  listPluginRegistry(projectPath: string, store: Store): MaybePromise<NonNullable<WorkflowRunArtifactServiceInput["pluginRegistry"]>>;
  requestPermissionWithGrantRegistry(
    request: WorkflowRunArtifactPermissionRequest,
    input: {
      thread: Thread;
      permissionMode?: PermissionMode;
      workspacePath: string;
      workflowThreadId?: string;
      store: Store;
    },
  ): MaybePromise<{ allowed: boolean }>;
  ensureWorkflowPluginTrusted(thread: Thread, registration: WorkflowRunArtifactPluginRegistration, store: Store): Promise<boolean>;
  pluginCaller: NonNullable<WorkflowRunArtifactServiceInput["pluginCaller"]>;
  connectorRegistrations(): NonNullable<WorkflowRunArtifactServiceInput["connectorRegistrations"]>;
  connectorAccountAuthorizer(): WorkflowRunArtifactServiceInput["connectorAccountAuthorizer"];
  runWorkflowArtifact(input: WorkflowRunArtifactServiceInputForStore<Store, Browser>): MaybePromise<WorkflowDashboard>;
  rememberActiveWorkflowRun(runId: string, controller: AbortController, workspacePath: string): void;
  forgetActiveWorkflowRunsForController(controller: AbortController): void;
  emitWorkflowEvent(event: WorkflowRunStartedEvent, workspacePath: string): void;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowAgentThreadIpcDependencies<
  Store extends WorkflowAgentThreadStore,
  Host extends WorkflowAgentThreadHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  requireProjectRuntimeHostForWorkflowThread(workflowThreadId: string): Host;
  workflowProjectIpcContext(input: { projectPath?: string }): WorkflowProjectContext<Store>;
  listGlobalWorkflowAgentFolders(): WorkflowAgentFolderSummary[];
}

export interface RegisterWorkflowAgentDiscoveryStartIpcDependencies<
  Store,
  Context extends WorkflowProjectContext<Store> = WorkflowProjectContext<Store>,
> {
  handleIpc: HandleIpc;
  workflowProjectIpcContext(input: { projectPath?: string }): Context;
  startWorkflowDiscovery(
    context: Context,
    input: StartWorkflowDiscoveryInput & { projectPath: string },
  ): MaybePromise<WorkflowAgentDiscoveryResult>;
}

export interface RegisterWorkflowAgentRevisionDiscoveryStartIpcDependencies<
  Store,
  Context extends WorkflowProjectContext<Store> = WorkflowProjectContext<Store>,
> {
  handleIpc: HandleIpc;
  workflowAgentIpcContextForWorkflowThread(workflowThreadId: string): Context;
  startWorkflowRevisionDiscovery(
    context: Context,
    input: StartWorkflowRevisionDiscoveryInput,
  ): MaybePromise<WorkflowAgentDiscoveryResult>;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowAgentDiscoveryAnswerIpcDependencies<
  Store,
  Context extends WorkflowProjectContext<Store> = WorkflowProjectContext<Store>,
> {
  handleIpc: HandleIpc;
  workflowAgentIpcContextForDiscoveryQuestion(questionId: string): Context;
  answerWorkflowDiscoveryQuestion(
    context: Context,
    input: AnswerWorkflowDiscoveryQuestionInput,
  ): MaybePromise<WorkflowAgentDiscoveryResult>;
}

export interface RegisterWorkflowAgentTraceIpcDependencies<
  Store extends WorkflowAgentTraceStore,
  Host extends WorkflowAgentTraceHost<Store>,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForWorkflowThread(workflowThreadId: string): Host;
}

export interface RegisterWorkflowAgentCapabilityIpcDependencies<Context> {
  handleIpc: HandleIpc;
  workflowAgentIpcContextForWorkflowThread(workflowThreadId: string): Context;
  workflowProjectIpcContext(input: { projectPath?: string }): Context;
  workflowDiscoveryPolicyContextForCapabilityLookup(
    input: { workflowThreadId?: string; projectPath?: string },
    context: Context,
  ): MaybePromise<WorkflowDiscoveryPolicyContext>;
  searchWorkflowDiscoveryCapabilities(input: {
    query: string;
    context: WorkflowDiscoveryPolicyContext;
    limit?: number;
  }): WorkflowDiscoveryCapabilitySearch;
  describeWorkflowDiscoveryCapability(input: {
    capabilityId: string;
    context: WorkflowDiscoveryPolicyContext;
    query?: string;
  }): WorkflowDiscoveryCapabilityDescription | undefined;
}

export interface RegisterWorkflowAgentNativeToolIpcDependencies<
  Store,
  Context extends WorkflowProjectContext<Store> = WorkflowProjectContext<Store>,
> {
  handleIpc: HandleIpc;
  workflowAgentIpcContextForWorkflowThread(workflowThreadId: string): Context;
  workflowProjectIpcContext(input: { projectPath?: string }): Context;
  invokeWorkflowNativeTool(
    context: Context,
    input: InvokeWorkflowNativeToolInput,
  ): MaybePromise<WorkflowNativeToolInvocationResult>;
}

export interface RegisterWorkflowAgentExplorationIpcDependencies<
  Store extends WorkflowAgentExplorationStore,
  Context extends WorkflowAgentExplorationContext<Store> = WorkflowAgentExplorationContext<Store>,
> {
  handleIpc: HandleIpc;
  workflowAgentIpcContextForWorkflowThread(workflowThreadId: string): Context;
  runWorkflowThreadExploration(
    context: Context,
    input: RunWorkflowThreadExplorationInput,
  ): MaybePromise<WorkflowAgentExplorationRunResult>;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowAgentDiscoveryAccessIpcDependencies<
  Store extends WorkflowAgentDiscoveryAccessStore,
  Context extends WorkflowAgentDiscoveryAccessContext<Store>,
> {
  handleIpc: HandleIpc;
  workflowAgentIpcContextForDiscoveryQuestion(questionId: string): Context;
  connectorDescriptors(): WorkflowConnectorDescriptor[];
  resolveWorkflowDiscoveryAccessRequest(
    store: Store,
    input: ResolveWorkflowDiscoveryAccessRequestInput,
    options: WorkflowAgentDiscoveryAccessOptions,
  ): MaybePromise<WorkflowAgentDiscoveryResult>;
  emitPermissionGrantCreated(grant: AmbientPermissionGrant, workspacePath: string): void;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowAgentRevisionIpcDependencies<
  Store extends WorkflowAgentRevisionStore,
  Host extends WorkflowAgentRevisionHost<Store>,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForWorkflowThread(workflowThreadId: string): Host;
  requireProjectRuntimeHostForWorkflowVersion(versionId: string): Host;
  requireProjectRuntimeHostForWorkflowRevision(revisionId: string): Host;
  restoreWorkflowVersion(host: Host, input: RestoreWorkflowVersionInput): MaybePromise<WorkflowDashboard>;
  emitWorkflowUpdated(workspacePath: string): void;
  recordWorkflowRevisionDecisionInChat(revision: WorkflowRevisionSummary, decision: ResolveWorkflowRevisionInput["decision"], targetStore: Store): void;
}

const workflowRecorderThreadActionSchema = z.object({
  threadId: z.string().min(1),
  projectId: z.string().min(1).max(128).optional(),
});
const startWorkflowRecordingSchema = z.object({
  goal: z.string().trim().max(4000).optional(),
  workspacePath: z.string().min(1).max(4096).optional(),
});
const stopWorkflowRecordingSchema = workflowRecorderThreadActionSchema;
const requestWorkflowRecordingReviewSchema = workflowRecorderThreadActionSchema.extend({
  feedback: z.string().trim().max(4000).optional(),
});
const confirmWorkflowRecordingSchema = workflowRecorderThreadActionSchema;
const workflowRecordingToolExampleSchema = z.object({
  toolName: z.string().trim().min(1).max(120),
  inputPreview: z.string().trim().max(1000).optional(),
  resultPreview: z.string().trim().max(1000).optional(),
  artifactPath: z.string().trim().max(500).optional(),
});
const workflowRecordingAvoidPatternSchema = z.object({
  toolName: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["failed", "skipped", "permission_blocked"]),
  reason: z.string().trim().min(1).max(1000),
});
const updateWorkflowRecordingReviewSchema = workflowRecorderThreadActionSchema.extend({
  draft: z.object({
    intent: z.string().trim().min(1).max(1000),
    inputs: z.array(z.string().trim().min(1).max(1000)).max(12),
    successfulExamples: z.array(workflowRecordingToolExampleSchema).max(12),
    doNot: z.array(workflowRecordingAvoidPatternSchema).max(12),
    validation: z.array(z.string().trim().min(1).max(1000)).max(12),
    outputShape: z.array(z.string().trim().min(1).max(1000)).max(12),
  }),
});
const applyWorkflowRecordingSummarySchema = workflowRecorderThreadActionSchema.extend({
  messageId: z.string().min(1).optional(),
});
const searchWorkflowRecordingsSchema = z
  .object({
    query: z.string().trim().max(1000).optional(),
    includeDisabled: z.boolean().optional(),
    includeArchived: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .optional();
const describeWorkflowRecordingSchema = z.object({
  id: z.string().trim().min(1).max(200),
  includeArchived: z.boolean().optional(),
});
const setWorkflowRecordingEnabledSchema = z.object({
  id: z.string().trim().min(1).max(200),
  enabled: z.boolean(),
});
const updateWorkflowRecordingPlaybookSchema = z.object({
  id: z.string().trim().min(1).max(200),
  baseVersion: z.number().int().min(1),
  title: z.string().trim().min(1).max(1000).optional(),
  draft: updateWorkflowRecordingReviewSchema.shape.draft,
});
const saveSymphonyWorkflowRecipeSchema = workflowRecorderThreadActionSchema.extend({
  patternId: z.enum(SYMPHONY_WORKFLOW_PATTERN_IDS),
  goal: z.string().trim().min(1).max(4000),
  blocking: z.boolean().optional(),
  stepAnswers: z.record(
    z.string().trim().min(1).max(160),
    z.object({
      choiceId: z.string().trim().min(1).max(160).optional(),
      customText: z.string().trim().min(1).max(4000).optional(),
    }),
  ).optional(),
  metricCustomizations: z.record(
    z.string().trim().min(1).max(160),
    z.string().trim().min(1).max(4000),
  ).optional(),
}).superRefine((input, ctx) => {
  const missingLabels = missingRequiredSymphonyMetricTemplateLabels({
    patternId: input.patternId,
    metricCustomizations: input.metricCustomizations,
  });
  const message = requiredSymphonyMetricTemplateErrorMessage({
    missingLabels,
    actionLabel: "saving the Symphony recipe",
  });
  if (!message) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["metricCustomizations"],
    message,
  });
}) satisfies z.ZodType<SaveSymphonyWorkflowRecipeInput>;
const archiveWorkflowRecordingSchema = z.object({
  id: z.string().trim().min(1).max(200),
  baseVersion: z.number().int().min(1),
  reason: z.string().trim().max(1000).optional(),
});
const unarchiveWorkflowRecordingSchema = z.object({
  id: z.string().trim().min(1).max(200),
  baseVersion: z.number().int().min(1),
});
const restoreWorkflowRecordingVersionSchema = z.object({
  id: z.string().trim().min(1).max(200),
  version: z.number().int().min(1),
});
const workflowLabMetricEmphasisSchema = z.enum(["reliability", "speed", "recovery", "clarity", "balanced"]);
const createWorkflowLabRunSchema = z.object({
  workflowId: z.string().trim().min(1).max(200),
  goal: z.string().trim().min(1).max(1000),
  metricEmphasis: workflowLabMetricEmphasisSchema.optional(),
  attemptBudget: z.number().int().min(1).max(10).optional(),
  plateauThreshold: z.number().min(0).max(1).optional(),
  heldOutEnabled: z.boolean().optional(),
});
const listWorkflowLabRunsSchema = z
  .object({
    workflowId: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .optional();
const workflowLabRunIdSchema = z.object({
  runId: z.string().trim().min(1).max(200),
});
const adoptWorkflowLabVariantSchema = workflowLabRunIdSchema.extend({
  variantId: z.string().trim().min(1).max(240),
});
const workflowRunDetailSchema = z.object({
  runId: z.string().min(1),
});
const workflowCompileSchema = z.object({
  userRequest: z.string().min(1).max(20_000),
  workflowThreadId: z.string().min(1).max(512).optional(),
  revisionId: z.string().min(1).max(512).optional(),
});
const workflowDebugRewriteSchema = z.object({
  runId: z.string().min(1).max(512),
  eventId: z.string().min(1).max(512).optional(),
  userNotes: z.string().trim().max(4000).optional(),
});
const workflowResolveApprovalSchema = z.object({
  runId: z.string().min(1),
  approvalId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
});
const workflowCancelRunSchema = z.object({
  runId: z.string().min(1),
});
const workflowReviewArtifactSchema = z.object({
  artifactId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
});
const workflowConnectorGrantUpdateSchema = z.object({
  artifactId: z.string().min(1),
  connectorId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  nextAccountId: z.string().min(1).optional(),
  dataRetention: z.enum(["none", "redacted_audit", "run_artifact"]).optional(),
  decision: z.enum(["rejected"]).optional(),
  removeScope: z.string().min(1).optional(),
}).refine((input) => [input.dataRetention, input.decision, input.removeScope, input.nextAccountId].filter(Boolean).length === 1, {
  message: "Specify exactly one connector grant update action.",
});
const workflowRevalidateArtifactSchema = z.object({
  artifactId: z.string().min(1),
});
const workflowArtifactSourceUpdateSchema = z.object({
  artifactId: z.string().min(1),
  source: z.string().min(1).max(500_000),
});
const workflowRunLimitOverridesSchema = z.object({
  idleTimeoutMs: z.number().int().positive().optional(),
  maxRunMs: z.number().int().positive().nullable().optional(),
});
const workflowRunArtifactSchema = z.object({
  artifactId: z.string().min(1),
  mode: z.enum(["execute", "dry_run"]).optional(),
  runtime: z.enum(["workflow", "automation"]).optional(),
  resumeFromRunId: z.string().min(1).optional(),
  allowUnapproved: z.boolean().optional(),
  runLimits: workflowRunLimitOverridesSchema.optional(),
  userInputs: z
    .array(
      z.object({
        requestId: z.string().min(1).max(512),
        choiceId: z.string().min(1).max(512).optional(),
        text: z.string().max(20_000).optional(),
        data: z.unknown().optional(),
      }),
    )
    .max(10)
    .optional(),
});
const workflowRecoverRunSchema = z.object({
  runId: z.string().min(1),
  eventId: z.string().min(1),
  action: z.enum(["retry_step", "resume_checkpoint", "skip_item"]),
  graphNodeId: z.string().min(1).optional(),
  itemKey: z.string().min(1).optional(),
  allowUnapproved: z.boolean().optional(),
});
const workflowAgentFolderCreateSchema = z.object({
  name: z.string().min(1).max(120),
});
const workflowAgentThreadMoveSchema = z.object({
  threadId: z.string().min(1).max(512),
  folderId: z.string().min(1).max(256),
});
const workflowAgentThreadIdSchema = z.object({
  workflowThreadId: z.string().min(1).max(512),
});
const workflowDiscoveryStartSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  initialRequest: z.string().min(1).max(20_000),
  projectPath: z.string().min(1).max(4096).optional(),
  folderId: z.string().min(1).max(256).optional(),
  traceMode: z.enum(["production", "debug"]).optional(),
}) satisfies z.ZodType<StartWorkflowDiscoveryInput>;
const workflowRevisionDiscoveryStartSchema = z.object({
  workflowThreadId: z.string().min(1).max(512),
  artifactId: z.string().min(1).max(512),
  requestedChange: z.string().trim().max(20_000).optional(),
}) satisfies z.ZodType<StartWorkflowRevisionDiscoveryInput>;
const workflowDiscoveryAnswerSchema = z.object({
  questionId: z.string().min(1).max(512),
  choiceId: z.string().min(1).max(512).optional(),
  freeform: z.string().max(4000).optional(),
}) satisfies z.ZodType<AnswerWorkflowDiscoveryQuestionInput>;
const workflowGraphSnapshotListSchema = z.object({
  workflowThreadId: z.string().min(1).max(512),
});
const workflowExplorationTraceListSchema = z.object({
  workflowThreadId: z.string().min(1).max(512),
});
const workflowDiscoveryCapabilitySearchSchema = z.object({
  workflowThreadId: z.string().min(1).max(512).optional(),
  projectPath: z.string().min(1).max(4096).optional(),
  query: z.string().min(1).max(4000),
  limit: z.number().int().min(1).max(20).optional(),
});
const workflowDiscoveryCapabilityDescribeSchema = z.object({
  workflowThreadId: z.string().min(1).max(512).optional(),
  projectPath: z.string().min(1).max(4096).optional(),
  capabilityId: z.string().min(1).max(512),
  query: z.string().max(4000).optional(),
});
const workflowNativeToolInvokeSchema = z.object({
  toolName: z.enum([
    "workflow_current_context",
    "workflow_get_artifact",
    "workflow_get_source",
    "workflow_get_run_trace",
    "workflow_get_versions",
    "workflow_capability_search",
    "workflow_capability_describe",
    "workflow_propose_revision",
    "workflow_validate_revision",
    "workflow_explain_revision_diff",
  ]),
  arguments: z.record(z.string(), z.unknown()).optional(),
}) satisfies z.ZodType<InvokeWorkflowNativeToolInput>;
const workflowThreadExplorationRunSchema = z.object({
  workflowThreadId: z.string().min(1).max(512),
  maxModelTurns: z.number().int().positive().max(20).optional(),
  maxToolCalls: z.number().int().positive().max(50).optional(),
  maxConnectorCalls: z.number().int().positive().max(200).optional(),
  maxAmbientCalls: z.number().int().positive().max(20).optional(),
  maxElapsedMs: z.number().int().positive().max(900_000).optional(),
}) satisfies z.ZodType<RunWorkflowThreadExplorationInput>;
const workflowDiscoveryAccessRequestResolveSchema = z.object({
  questionId: z.string().min(1),
  accessRequestId: z.string().min(1),
  response: z.enum(["deny", "allow_once", "always_thread", "always_workflow", "always_project", "always_workspace"]),
});
const workflowAgentThreadCreateSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  initialRequest: z.string().min(1).max(20_000),
  projectPath: z.string().min(1).max(4096).optional(),
  folderId: z.string().min(1).max(256).optional(),
  traceMode: z.enum(["production", "debug"]).optional(),
  phase: z.enum(["request", "discovery", "planned", "compiling", "ready_for_review", "approved", "running", "paused", "failed", "succeeded", "revision"]).optional(),
});
const workflowRevisionListSchema = z.object({
  workflowThreadId: z.string().min(1).max(512),
});
const workflowVersionListSchema = z.object({
  workflowThreadId: z.string().min(1).max(512),
});
const workflowVersionRestoreSchema = z.object({
  versionId: z.string().min(1).max(512),
  approveRestored: z.boolean().optional(),
});
const workflowRevisionStatusSchema = z.enum(["draft", "proposed", "applied", "rejected"]);
const workflowRevisionCreateSchema = z.object({
  workflowThreadId: z.string().min(1).max(512),
  requestedChange: z.string().min(1).max(20_000),
  baseVersionId: z.string().min(1).max(512).optional(),
  baseArtifactId: z.string().min(1).max(512).optional(),
  proposedGraphSnapshotId: z.string().min(1).max(512).optional(),
  graphDiff: z.unknown().optional(),
  sourceDiff: z.string().max(2_000_000).optional(),
  status: workflowRevisionStatusSchema.optional(),
});
const workflowRevisionUpdateSchema = z.object({
  id: z.string().min(1).max(512),
  requestedChange: z.string().min(1).max(20_000).optional(),
  proposedGraphSnapshotId: z.string().min(1).max(512).nullable().optional(),
  graphDiff: z.unknown().optional(),
  sourceDiff: z.string().max(2_000_000).nullable().optional(),
  status: workflowRevisionStatusSchema.optional(),
});
const workflowRevisionResolveSchema = z.object({
  id: z.string().min(1).max(512),
  decision: z.enum(["applied", "rejected"]),
});

export function registerWorkflowRecorderIpc<
  Thread extends WorkflowRecorderThread,
  Store extends WorkflowRecorderStore<Thread>,
  Host extends WorkflowRecorderHost<Thread, Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForThreadAction,
  requireProjectRuntimeHostForWorkflowRecording,
  prepareWorktreeForThread,
  setProjectHostActiveThreadId,
  emitProjectStateIfActive,
  emitWorkflowRecordingLibraryStateChanged,
  readStateForProjectHostAction,
  listGlobalWorkflowRecordingLibrary,
  getFeatureFlagSnapshot,
}: RegisterWorkflowRecorderIpcDependencies<Thread, Store, Host>): void {
  handleIpc("workflow-recorder:start", async (_event, raw: StartWorkflowRecordingInput) => {
    const input = startWorkflowRecordingSchema.parse(raw);
    const host = requireActiveProjectRuntimeHost();
    const targetStore = host.store;
    let thread = targetStore.createWorkflowRecordingThread({
      goal: input.goal,
      workspacePath: input.workspacePath ?? targetStore.getWorkspace().path,
    });
    if (!thread.gitWorktree && thread.workspacePath === targetStore.getWorkspace().path) {
      thread = await prepareWorktreeForThread(thread, targetStore);
    }
    setProjectHostActiveThreadId(host, thread.id);
    emitProjectStateIfActive(host, thread.id);
    return readStateForProjectHostAction(host, thread.id);
  });

  handleIpc("workflow-recorder:stop", (_event, raw: StopWorkflowRecordingInput) => {
    const input = stopWorkflowRecordingSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    host.store.stopWorkflowRecording(input.threadId);
    emitProjectStateIfActive(host, input.threadId);
    return readStateForProjectHostAction(host, input.threadId);
  });

  handleIpc("workflow-recorder:request-review", async (_event, raw: RequestWorkflowRecordingReviewInput) => {
    const input = requestWorkflowRecordingReviewSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    await host.runtime.requestWorkflowRecordingReview({ threadId: input.threadId, feedback: input.feedback });
  });

  handleIpc("workflow-recorder:update-review", (_event, raw: UpdateWorkflowRecordingReviewInput) => {
    const input = updateWorkflowRecordingReviewSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    host.store.updateWorkflowRecordingReviewDraft(input.threadId, input.draft);
    emitProjectStateIfActive(host, input.threadId);
    return readStateForProjectHostAction(host, input.threadId);
  });

  handleIpc("workflow-recorder:confirm", (_event, raw: ConfirmWorkflowRecordingInput) => {
    const input = confirmWorkflowRecordingSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    host.store.confirmWorkflowRecordingReview(input.threadId);
    emitProjectStateIfActive(host, input.threadId);
    return readStateForProjectHostAction(host, input.threadId);
  });

  handleIpc("workflow-recorder:apply-summary", (_event, raw: ApplyWorkflowRecordingSummaryInput) => {
    const input = applyWorkflowRecordingSummarySchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    host.store.applyWorkflowRecordingSummary(input.threadId, input.messageId);
    emitProjectStateIfActive(host, input.threadId);
    return readStateForProjectHostAction(host, input.threadId);
  });

  handleIpc("workflow-recorder:search", (_event, raw?: SearchWorkflowRecordingsInput) => {
    const input = searchWorkflowRecordingsSchema.parse(raw) ?? {};
    return listGlobalWorkflowRecordingLibrary(input);
  });

  handleIpc("workflow-recorder:describe", (_event, raw: DescribeWorkflowRecordingInput) => {
    const input = describeWorkflowRecordingSchema.parse(raw);
    return requireProjectRuntimeHostForWorkflowRecording(input.id).store.describeWorkflowRecording(input.id, { includeArchived: input.includeArchived });
  });

  handleIpc("workflow-recorder:set-enabled", (_event, raw: SetWorkflowRecordingEnabledInput) => {
    const input = setWorkflowRecordingEnabledSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
    host.store.setWorkflowRecordingEnabled(input.id, input.enabled);
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return readStateForProjectHostAction(host, host.activeThreadId);
  });

  handleIpc("workflow-recorder:update-playbook", (_event, raw: UpdateWorkflowRecordingPlaybookInput) => {
    const input = updateWorkflowRecordingPlaybookSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
    host.store.updateWorkflowRecordingPlaybook(input.id, {
      baseVersion: input.baseVersion,
      draft: input.draft,
      ...(input.title ? { title: input.title } : {}),
    });
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return readStateForProjectHostAction(host, host.activeThreadId);
  });

  handleIpc("workflow-recorder:save-symphony-recipe", (_event, raw: SaveSymphonyWorkflowRecipeInput) => {
    const input = saveSymphonyWorkflowRecipeSchema.parse(raw);
    const activeHostSnapshot = requireActiveProjectRuntimeHost();
    const host = requireProjectRuntimeHostForThreadAction(input, activeHostSnapshot);
    const featureFlagSnapshot = getFeatureFlagSnapshot(host.store);
    if (!isAmbientSubagentsEnabled(featureFlagSnapshot)) {
      throw new Error("Symphony workflow recipes are disabled while ambient.subagents is off.");
    }
    host.store.saveSymphonyWorkflowRecipe(input, { featureFlagSnapshot });
    emitWorkflowRecordingLibraryStateChanged(host, input.threadId);
    return readStateForProjectHostAction(host, input.threadId);
  });

  handleIpc("workflow-recorder:archive", (_event, raw: ArchiveWorkflowRecordingInput) => {
    const input = archiveWorkflowRecordingSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
    host.store.archiveWorkflowRecording(input.id, {
      baseVersion: input.baseVersion,
      ...(input.reason ? { reason: input.reason } : {}),
    });
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return readStateForProjectHostAction(host, host.activeThreadId);
  });

  handleIpc("workflow-recorder:unarchive", (_event, raw: UnarchiveWorkflowRecordingInput) => {
    const input = unarchiveWorkflowRecordingSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
    host.store.unarchiveWorkflowRecording(input.id, { baseVersion: input.baseVersion });
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return readStateForProjectHostAction(host, host.activeThreadId);
  });

  handleIpc("workflow-recorder:restore-version", (_event, raw: RestoreWorkflowRecordingVersionInput) => {
    const input = restoreWorkflowRecordingVersionSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRecording(input.id);
    host.store.restoreWorkflowRecordingVersion(input.id, input.version);
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return readStateForProjectHostAction(host, host.activeThreadId);
  });
}

export function registerWorkflowLabIpc<
  Store extends WorkflowLabStore,
  Host extends WorkflowLabHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForWorkflowRecording,
  requireProjectRuntimeHostForWorkflowLabRun,
  emitProjectStateIfActive,
  emitWorkflowRecordingLibraryStateChanged,
  readStateForProjectHostAction,
  startWorkflowLabRun,
}: RegisterWorkflowLabIpcDependencies<Store, Host>): void {
  handleIpc("workflow-lab:create-run", (_event, raw: CreateWorkflowLabRunInput) => {
    const input = createWorkflowLabRunSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRecording(input.workflowId);
    return host.store.createWorkflowLabRun(input);
  });

  handleIpc("workflow-lab:list-runs", (_event, raw?: ListWorkflowLabRunsInput) => {
    const input = listWorkflowLabRunsSchema.parse(raw) ?? {};
    if (input.workflowId) {
      return requireProjectRuntimeHostForWorkflowRecording(input.workflowId).store.listWorkflowLabRuns(input);
    }
    return requireActiveProjectRuntimeHost().store.listWorkflowLabRuns(input);
  });

  handleIpc("workflow-lab:get-run", (_event, raw: GetWorkflowLabRunInput) => {
    const input = workflowLabRunIdSchema.parse(raw);
    return requireProjectRuntimeHostForWorkflowLabRun(input.runId).store.getWorkflowLabRun(input.runId);
  });

  handleIpc("workflow-lab:start-run", async (_event, raw: StartWorkflowLabRunInput) => {
    const input = workflowLabRunIdSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowLabRun(input.runId);
    const run = await startWorkflowLabRun(host, input);
    emitProjectStateIfActive(host, host.activeThreadId);
    return run;
  });

  handleIpc("workflow-lab:stop-run", (_event, raw: StopWorkflowLabRunInput) => {
    const input = workflowLabRunIdSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowLabRun(input.runId);
    return host.store.updateWorkflowLabRunStatus(input.runId, "stopped");
  });

  handleIpc("workflow-lab:adopt-variant", (_event, raw: AdoptWorkflowLabVariantInput) => {
    const input = adoptWorkflowLabVariantSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowLabRun(input.runId);
    host.store.adoptWorkflowLabVariant(input.runId, input.variantId);
    emitWorkflowRecordingLibraryStateChanged(host, host.activeThreadId);
    return readStateForProjectHostAction(host, host.activeThreadId);
  });
}

export function registerWorkflowDashboardIpc<
  Store extends WorkflowDashboardStore,
  Host extends WorkflowDashboardHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForWorkflowRun,
  readWorkflowDashboard,
  readWorkflowRunDetail,
  createWorkflowSampleArtifact,
  emitWorkflowUpdated,
}: RegisterWorkflowDashboardIpcDependencies<Store, Host>): void {
  handleIpc("workflow:list-dashboard", () => readWorkflowDashboard(requireActiveProjectRuntimeHost().store));

  handleIpc("workflow:run-detail", (_event, raw: WorkflowRunDetailInput) => {
    const input = workflowRunDetailSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRun(input.runId);
    return readWorkflowRunDetail(host.store, input.runId);
  });

  handleIpc("workflow:create-sample", () => {
    const host = requireActiveProjectRuntimeHost();
    const workspacePath = host.store.getWorkspace().path;
    const dashboard = createWorkflowSampleArtifact(host.store, workspacePath);
    emitWorkflowUpdated(host.workspacePath);
    return dashboard;
  });
}

export function registerWorkflowCompilePreviewIpc<
  Store extends WorkflowCompileStore,
  Thread extends WorkflowCompileThread,
  PluginRegistry,
  PluginRegistrations extends NonNullable<CompileWorkflowArtifactInput["pluginRegistrations"]>,
>({
  handleIpc,
  workflowCompileIpcContext,
  workspaceStateForThread,
  getAmbientProviderStatus,
  pluginMcpRegistrationsForThread,
  listPluginRegistry,
  workflowToolDescriptorsFromPluginRegistry,
  connectorDescriptors,
  readSearchRoutingSettings,
  ambientRetryPolicyFromCurrentSettings,
  compileWorkflowArtifact,
  emitWorkflowEvent,
  emitWorkflowUpdated,
}: RegisterWorkflowCompilePreviewIpcDependencies<Store, Thread, PluginRegistry, PluginRegistrations>): void {
  handleIpc("workflow:compile-preview", async (_event, raw: CompileWorkflowPreviewInput) => {
    const input = workflowCompileSchema.parse(raw);
    const { targetStore, thread, projectPath } = workflowCompileIpcContext(input);
    const activeWorkspace = workspaceStateForThread(thread, targetStore);
    const provider = getAmbientProviderStatus(thread.model);
    const pluginRegistrations = await pluginMcpRegistrationsForThread(thread, targetStore);
    const pluginRegistry = await listPluginRegistry(projectPath, targetStore);
    const dashboard = await compileWorkflowArtifact({
      store: targetStore,
      userRequest: input.userRequest,
      workflowThreadId: input.workflowThreadId,
      revisionId: input.revisionId,
      workspaceSummary: [
        `Workspace: ${activeWorkspace.name}`,
        `Path: ${activeWorkspace.path}`,
        `Permission mode: ${thread.permissionMode}`,
      ].join("\n"),
      toolDescriptors: workflowToolDescriptorsFromPluginRegistry(pluginRegistry, pluginRegistrations),
      pluginRegistrations,
      connectorDescriptors: connectorDescriptors(),
      stateRoot: targetStore.getWorkspace().statePath,
      model: thread.model,
      permissionMode: thread.permissionMode,
      searchRoutingSettings: readSearchRoutingSettings(),
      baseUrl: provider.baseUrl,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      onProgress: (progress) => emitWorkflowEvent({ type: "workflow-compile-progress", progress }, projectPath),
    });
    emitWorkflowUpdated(projectPath);
    return dashboard;
  });
}

export function registerWorkflowDebugRewriteIpc<
  Store extends WorkflowCompileStore,
  Thread extends WorkflowCompileThread,
  WorkflowThread extends WorkflowDebugRewriteWorkflowThread,
  DebugContext extends { runId: string; workflowThreadId?: string },
  PluginRegistry,
  PluginRegistrations extends NonNullable<CompileWorkflowArtifactInput["pluginRegistrations"]>,
>({
  handleIpc,
  readE2eEnabled,
  emitE2eWorkflowDebugRewriteInput,
  readE2eWorkflowDashboard,
  workflowDebugRewriteIpcContext,
  workflowDebugRewriteUserRequest,
  workspaceStateForThread,
  getAmbientProviderStatus,
  pluginMcpRegistrationsForThread,
  listPluginRegistry,
  workflowToolDescriptorsFromPluginRegistry,
  connectorDescriptors,
  readSearchRoutingSettings,
  ambientRetryPolicyFromCurrentSettings,
  buildWorkflowDebugRewritePromptSection,
  compileWorkflowArtifact,
  createWorkflowDebugRewriteRevision,
  emitWorkflowEvent,
  emitWorkflowUpdated,
}: RegisterWorkflowDebugRewriteIpcDependencies<
  Store,
  Thread,
  WorkflowThread,
  DebugContext,
  PluginRegistry,
  PluginRegistrations
>): void {
  handleIpc("workflow:debug-rewrite", async (_event, raw: CompileWorkflowDebugRewriteInput) => {
    const input = workflowDebugRewriteSchema.parse(raw);
    if (readE2eEnabled() && input.runId.startsWith("visual-")) {
      emitE2eWorkflowDebugRewriteInput(input);
      return readE2eWorkflowDashboard();
    }
    const { targetStore, thread, workflowThread, debugContext, projectPath } = workflowDebugRewriteIpcContext(input);
    const baseVersionId = workflowThread.latestVersion?.id;
    const requestedChange = workflowDebugRewriteUserRequest(debugContext);
    const activeWorkspace = workspaceStateForThread(thread, targetStore);
    const provider = getAmbientProviderStatus(thread.model);
    const pluginRegistrations = await pluginMcpRegistrationsForThread(thread, targetStore);
    const pluginRegistry = await listPluginRegistry(projectPath, targetStore);
    const dashboard = await compileWorkflowArtifact({
      store: targetStore,
      userRequest: requestedChange,
      workflowThreadId: debugContext.workflowThreadId,
      workspaceSummary: [
        `Workspace: ${activeWorkspace.name}`,
        `Path: ${activeWorkspace.path}`,
        `Permission mode: ${thread.permissionMode}`,
        `Debug rewrite failed run: ${debugContext.runId}`,
      ].join("\n"),
      toolDescriptors: workflowToolDescriptorsFromPluginRegistry(pluginRegistry, pluginRegistrations),
      pluginRegistrations,
      connectorDescriptors: connectorDescriptors(),
      stateRoot: targetStore.getWorkspace().statePath,
      model: thread.model,
      permissionMode: thread.permissionMode,
      searchRoutingSettings: readSearchRoutingSettings(),
      baseUrl: provider.baseUrl,
      retryPolicy: ambientRetryPolicyFromCurrentSettings(targetStore),
      debugRewriteContext: buildWorkflowDebugRewritePromptSection(debugContext),
      onProgress: (progress) => emitWorkflowEvent({ type: "workflow-compile-progress", progress }, projectPath),
    });
    createWorkflowDebugRewriteRevision(targetStore, debugContext, { baseVersionId, requestedChange });
    emitWorkflowUpdated(projectPath);
    return dashboard;
  });
}

export function registerWorkflowApprovalIpc<
  Store,
  Host extends WorkflowApprovalHost<Store>,
>({
  handleIpc,
  requireProjectRuntimeHostForWorkflowRun,
  resolveWorkflowApproval,
  emitWorkflowUpdated,
}: RegisterWorkflowApprovalIpcDependencies<Store, Host>): void {
  handleIpc("workflow:resolve-approval", (_event, raw: ResolveWorkflowApprovalInput) => {
    const input = workflowResolveApprovalSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRun(input.runId);
    const detail = resolveWorkflowApproval(host.store, input);
    emitWorkflowUpdated(host.workspacePath);
    return detail;
  });
}

export function registerWorkflowCancelRunIpc<
  Store,
  Host extends WorkflowCancelRunHost<Store>,
>({
  handleIpc,
  projectRuntimeHostForWorkflowRun,
  activeWorkflowRunHost,
  activeWorkflowRunController,
  readWorkflowDashboard,
  emitWorkflowUpdated,
}: RegisterWorkflowCancelRunIpcDependencies<Store, Host>): void {
  handleIpc("workflow:cancel-run", (_event, raw: CancelWorkflowRunInput) => {
    const input = workflowCancelRunSchema.parse(raw);
    const host = projectRuntimeHostForWorkflowRun(input.runId) ?? activeWorkflowRunHost(input.runId);
    if (!host) throw new Error("Workflow run is not available in a loaded project.");
    const controller = activeWorkflowRunController(input.runId);
    if (!controller) {
      return readWorkflowDashboard(host.store);
    }
    controller.abort();
    emitWorkflowUpdated(host.workspacePath);
    return readWorkflowDashboard(host.store);
  });
}

export function registerWorkflowArtifactReviewIpc<
  Store,
  Host extends WorkflowArtifactReviewHost<Store>,
>({
  handleIpc,
  requireProjectRuntimeHostForWorkflowArtifact,
  reviewWorkflowArtifact,
  emitWorkflowUpdated,
}: RegisterWorkflowArtifactReviewIpcDependencies<Store, Host>): void {
  handleIpc("workflow:review-artifact", (_event, raw: ReviewWorkflowArtifactInput) => {
    const input = workflowReviewArtifactSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowArtifact(input.artifactId);
    const dashboard = reviewWorkflowArtifact(host.store, input);
    emitWorkflowUpdated(host.workspacePath);
    return dashboard;
  });
}

export function registerWorkflowConnectorGrantIpc<
  Store,
  Host extends WorkflowConnectorGrantHost<Store>,
>({
  handleIpc,
  requireProjectRuntimeHostForWorkflowArtifact,
  updateWorkflowConnectorGrant,
  emitWorkflowUpdated,
}: RegisterWorkflowConnectorGrantIpcDependencies<Store, Host>): void {
  handleIpc("workflow:update-connector-grant", (_event, raw: UpdateWorkflowConnectorGrantInput) => {
    const input = workflowConnectorGrantUpdateSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowArtifact(input.artifactId);
    const dashboard = updateWorkflowConnectorGrant(host.store, input);
    emitWorkflowUpdated(host.workspacePath);
    return dashboard;
  });
}

export function registerWorkflowArtifactRevalidationIpc<
  Store,
  Host extends WorkflowArtifactRevalidationHost<Store>,
>({
  handleIpc,
  requireProjectRuntimeHostForWorkflowArtifact,
  revalidateWorkflowArtifact,
  connectorDescriptors,
  emitWorkflowUpdated,
}: RegisterWorkflowArtifactRevalidationIpcDependencies<Store, Host>): void {
  handleIpc("workflow:revalidate-artifact", (_event, raw: RevalidateWorkflowArtifactInput) => {
    const input = workflowRevalidateArtifactSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowArtifact(input.artifactId);
    const dashboard = revalidateWorkflowArtifact(host.store, input, {
      connectorDescriptors: connectorDescriptors(),
    });
    emitWorkflowUpdated(host.workspacePath);
    return dashboard;
  });
}

export function registerWorkflowArtifactSourceIpc<
  Store,
  Host extends WorkflowArtifactSourceHost<Store>,
>({
  handleIpc,
  requireProjectRuntimeHostForWorkflowArtifact,
  updateWorkflowArtifactSource,
  connectorDescriptors,
  emitWorkflowUpdated,
}: RegisterWorkflowArtifactSourceIpcDependencies<Store, Host>): void {
  handleIpc("workflow:update-artifact-source", async (_event, raw: UpdateWorkflowArtifactSourceInput) => {
    const input = workflowArtifactSourceUpdateSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowArtifact(input.artifactId);
    const dashboard = updateWorkflowArtifactSource(host.store, input, {
      connectorDescriptors: connectorDescriptors(),
    });
    emitWorkflowUpdated(host.workspacePath);
    return dashboard;
  });
}

export function registerWorkflowRunArtifactIpc<
  Store extends WorkflowCompileStore,
  Thread extends WorkflowRunArtifactThread,
  Browser extends WorkflowRunArtifactServiceInput["browser"],
  Artifact extends WorkflowRunArtifactSummary,
>({
  handleIpc,
  workflowArtifactIpcContext,
  getAmbientProviderStatus,
  pluginMcpRegistrationsForThread,
  listPluginRegistry,
  requestPermissionWithGrantRegistry,
  ensureWorkflowPluginTrusted,
  pluginCaller,
  connectorRegistrations,
  connectorAccountAuthorizer,
  runWorkflowArtifact,
  rememberActiveWorkflowRun,
  forgetActiveWorkflowRunsForController,
  emitWorkflowEvent,
  emitWorkflowUpdated,
}: RegisterWorkflowRunArtifactIpcDependencies<Store, Thread, Browser, Artifact>): void {
  handleIpc("workflow:run-artifact", async (_event, raw: RunWorkflowArtifactInput) => {
    const input = workflowRunArtifactSchema.parse(raw);
    const { targetStore, targetBrowserService, thread, artifact, projectPath } = workflowArtifactIpcContext(input.artifactId);
    if ((input.mode ?? "execute") === "execute" && !input.resumeFromRunId) {
      if (artifact.status === "rejected" || artifact.status === "archived") {
        throw new Error(`Workflow artifact is ${artifact.status} and cannot be run.`);
      }
      if (artifact.status !== "approved" && !input.allowUnapproved) {
        throw new Error("Approve this workflow preview before running it, or choose Run unapproved for this one run.");
      }
    }
    const provider = getAmbientProviderStatus(thread.model);
    const abortController = new AbortController();
    try {
      const pluginRegistrations = await pluginMcpRegistrationsForThread(thread, targetStore);
      const pluginRegistry = await listPluginRegistry(projectPath, targetStore);
      const dashboard = await runWorkflowArtifact({
        store: targetStore,
        artifactId: input.artifactId,
        workspacePath: projectPath,
        permissionMode: thread.permissionMode,
        browser: targetBrowserService,
        requestPermission: async (request) =>
          (
            await requestPermissionWithGrantRegistry(request, {
              thread,
              permissionMode: thread.permissionMode,
              workspacePath: projectPath,
              workflowThreadId: artifact.workflowThreadId,
              store: targetStore,
            })
          ).allowed,
        pluginRegistrations,
        pluginRegistry,
        ensurePluginTrusted: (registration) => ensureWorkflowPluginTrusted(thread, registration, targetStore),
        pluginCaller,
        connectorRegistrations: connectorRegistrations(),
        connectorAccountAuthorizer: connectorAccountAuthorizer(),
        model: thread.model,
        baseUrl: provider.baseUrl,
        mode: input.mode,
        runtime: input.runtime,
        resumeFromRunId: input.resumeFromRunId,
        runLimits: input.runLimits,
        userInputs: input.userInputs,
        abortSignal: abortController.signal,
        onRunStarted: (runId) => {
          rememberActiveWorkflowRun(runId, abortController, projectPath);
          emitWorkflowEvent(
            {
              type: "workflow-run-started",
              runId,
              artifactId: artifact.id,
              workflowThreadId: artifact.workflowThreadId,
            },
            projectPath,
          );
          emitWorkflowUpdated(projectPath);
        },
        onEvent: () => emitWorkflowUpdated(projectPath),
      });
      emitWorkflowUpdated(projectPath);
      return dashboard;
    } finally {
      forgetActiveWorkflowRunsForController(abortController);
    }
  });
}

export function registerWorkflowRecoverRunIpc<
  Store extends WorkflowCompileStore,
  Host extends WorkflowRecoverRunHost<Store>,
  Thread extends WorkflowRunArtifactThread,
  Browser extends WorkflowRunArtifactServiceInput["browser"],
  Artifact extends WorkflowRunArtifactSummary,
>({
  handleIpc,
  requireProjectRuntimeHostForWorkflowRun,
  buildWorkflowRecoveryPlan,
  workflowArtifactIpcContextForHost,
  markStaleWorkflowRunForRecoveryIfNeeded,
  getAmbientProviderStatus,
  pluginMcpRegistrationsForThread,
  listPluginRegistry,
  requestPermissionWithGrantRegistry,
  ensureWorkflowPluginTrusted,
  pluginCaller,
  connectorRegistrations,
  connectorAccountAuthorizer,
  runWorkflowArtifact,
  rememberActiveWorkflowRun,
  forgetActiveWorkflowRunsForController,
  emitWorkflowEvent,
  emitWorkflowUpdated,
}: RegisterWorkflowRecoverRunIpcDependencies<Store, Host, Thread, Browser, Artifact>): void {
  handleIpc("workflow:recover-run", async (_event, raw: RecoverWorkflowRunInput) => {
    const input = workflowRecoverRunSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRun(input.runId);
    const targetStore = host.store;
    const plan = buildWorkflowRecoveryPlan(targetStore, input);
    const { targetBrowserService, thread, artifact, projectPath } = workflowArtifactIpcContextForHost(host, plan.artifactId);
    if (artifact.status !== "approved" && !input.allowUnapproved) {
      throw new Error("Approve this workflow before recovering it, or allow an unapproved one-off recovery.");
    }
    markStaleWorkflowRunForRecoveryIfNeeded(targetStore, plan.resumeFromRunId, {
      recoveryAction: plan.recovery.action,
      sourceEventId: plan.recovery.sourceEventId,
      reason: "Desktop recovery run started.",
    });
    const provider = getAmbientProviderStatus(thread.model);
    const abortController = new AbortController();
    try {
      const pluginRegistrations = await pluginMcpRegistrationsForThread(thread, targetStore);
      const pluginRegistry = await listPluginRegistry(projectPath, targetStore);
      const dashboard = await runWorkflowArtifact({
        store: targetStore,
        artifactId: plan.artifactId,
        workspacePath: projectPath,
        permissionMode: thread.permissionMode,
        browser: targetBrowserService,
        requestPermission: async (request) =>
          (
            await requestPermissionWithGrantRegistry(request, {
              thread,
              permissionMode: thread.permissionMode,
              workspacePath: projectPath,
              workflowThreadId: artifact.workflowThreadId,
              store: targetStore,
            })
          ).allowed,
        pluginRegistrations,
        pluginRegistry,
        ensurePluginTrusted: (registration) => ensureWorkflowPluginTrusted(thread, registration, targetStore),
        pluginCaller,
        connectorRegistrations: connectorRegistrations(),
        connectorAccountAuthorizer: connectorAccountAuthorizer(),
        model: thread.model,
        baseUrl: provider.baseUrl,
        mode: "execute",
        runtime: "automation",
        resumeFromRunId: plan.resumeFromRunId,
        recovery: plan.recovery,
        abortSignal: abortController.signal,
        onRunStarted: (runId) => {
          rememberActiveWorkflowRun(runId, abortController, projectPath);
          emitWorkflowEvent(
            {
              type: "workflow-run-started",
              runId,
              artifactId: artifact.id,
              workflowThreadId: artifact.workflowThreadId,
            },
            projectPath,
          );
          emitWorkflowUpdated(projectPath);
        },
        onEvent: () => emitWorkflowUpdated(projectPath),
      });
      emitWorkflowUpdated(projectPath);
      return dashboard;
    } finally {
      forgetActiveWorkflowRunsForController(abortController);
    }
  });
}

export function registerWorkflowAgentThreadIpc<
  Store extends WorkflowAgentThreadStore,
  Host extends WorkflowAgentThreadHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  requireProjectRuntimeHostForWorkflowThread,
  workflowProjectIpcContext,
  listGlobalWorkflowAgentFolders,
}: RegisterWorkflowAgentThreadIpcDependencies<Store, Host>): void {
  handleIpc("workflow-agents:list-folders", () => listGlobalWorkflowAgentFolders());

  handleIpc("workflow-agents:create-folder", (_event, raw: CreateWorkflowAgentFolderInput) => {
    const host = requireActiveProjectRuntimeHost();
    host.store.createWorkflowAgentFolder(workflowAgentFolderCreateSchema.parse(raw));
    return listGlobalWorkflowAgentFolders();
  });

  handleIpc("workflow-agents:move-thread", (_event, raw: MoveWorkflowAgentThreadInput) => {
    const input = workflowAgentThreadMoveSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowThread(input.threadId);
    host.store.moveWorkflowAgentThread(input);
    return listGlobalWorkflowAgentFolders();
  });

  handleIpc("workflow-agents:create-thread", (_event, raw: CreateWorkflowAgentThreadInput) => {
    const input = workflowAgentThreadCreateSchema.parse(raw);
    const { targetStore, projectPath } = workflowProjectIpcContext(input);
    return targetStore.createWorkflowAgentThread({ ...input, projectPath });
  });

  handleIpc("workflow-agents:ensure-chat-thread", (_event, raw: ListWorkflowAgentChatMessagesInput) => {
    const input = workflowAgentThreadIdSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowThread(input.workflowThreadId);
    return host.store.ensureWorkflowAgentChatThread(input.workflowThreadId);
  });

  handleIpc("workflow-agents:list-chat-messages", (_event, raw: ListWorkflowAgentChatMessagesInput) => {
    const input = workflowAgentThreadIdSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowThread(input.workflowThreadId);
    const targetStore = host.store;
    const thread = targetStore.getWorkflowAgentThreadSummary(input.workflowThreadId);
    if (!thread.chatThreadId) return [];
    targetStore.getThread(thread.chatThreadId);
    return targetStore.listMessages(thread.chatThreadId);
  });
}

export function registerWorkflowAgentDiscoveryStartIpc<
  Store,
  Context extends WorkflowProjectContext<Store> = WorkflowProjectContext<Store>,
>({
  handleIpc,
  workflowProjectIpcContext,
  startWorkflowDiscovery,
}: RegisterWorkflowAgentDiscoveryStartIpcDependencies<Store, Context>): void {
  handleIpc("workflow-agents:start-discovery", (_event, raw: StartWorkflowDiscoveryInput) => {
    const input = workflowDiscoveryStartSchema.parse(raw);
    const context = workflowProjectIpcContext(input);
    return startWorkflowDiscovery(context, { ...input, projectPath: context.projectPath });
  });
}

export function registerWorkflowAgentRevisionDiscoveryStartIpc<
  Store,
  Context extends WorkflowProjectContext<Store> = WorkflowProjectContext<Store>,
>({
  handleIpc,
  workflowAgentIpcContextForWorkflowThread,
  startWorkflowRevisionDiscovery,
  emitWorkflowUpdated,
}: RegisterWorkflowAgentRevisionDiscoveryStartIpcDependencies<Store, Context>): void {
  handleIpc("workflow-agents:start-revision-discovery", async (_event, raw: StartWorkflowRevisionDiscoveryInput) => {
    const input = workflowRevisionDiscoveryStartSchema.parse(raw);
    const context = workflowAgentIpcContextForWorkflowThread(input.workflowThreadId);
    const result = await startWorkflowRevisionDiscovery(context, input);
    emitWorkflowUpdated(context.projectPath);
    return result;
  });
}

export function registerWorkflowAgentDiscoveryAnswerIpc<
  Store,
  Context extends WorkflowProjectContext<Store> = WorkflowProjectContext<Store>,
>({
  handleIpc,
  workflowAgentIpcContextForDiscoveryQuestion,
  answerWorkflowDiscoveryQuestion,
}: RegisterWorkflowAgentDiscoveryAnswerIpcDependencies<Store, Context>): void {
  handleIpc("workflow-agents:answer-discovery-question", (_event, raw: AnswerWorkflowDiscoveryQuestionInput) => {
    const input = workflowDiscoveryAnswerSchema.parse(raw);
    const context = workflowAgentIpcContextForDiscoveryQuestion(input.questionId);
    return answerWorkflowDiscoveryQuestion(context, input);
  });
}

export function registerWorkflowAgentTraceIpc<
  Store extends WorkflowAgentTraceStore,
  Host extends WorkflowAgentTraceHost<Store>,
>({
  handleIpc,
  requireProjectRuntimeHostForWorkflowThread,
}: RegisterWorkflowAgentTraceIpcDependencies<Store, Host>): void {
  handleIpc("workflow-agents:list-graph-snapshots", (_event, raw: { workflowThreadId: string }) => {
    const input = workflowGraphSnapshotListSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowThread(input.workflowThreadId);
    return host.store.listWorkflowGraphSnapshots(input.workflowThreadId);
  });

  handleIpc("workflow-agents:list-exploration-traces", (_event, raw: { workflowThreadId: string }) => {
    const input = workflowExplorationTraceListSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowThread(input.workflowThreadId);
    return host.store.listWorkflowExplorationTraces(input.workflowThreadId);
  });
}

export function registerWorkflowAgentCapabilityIpc<Context>({
  handleIpc,
  workflowAgentIpcContextForWorkflowThread,
  workflowProjectIpcContext,
  workflowDiscoveryPolicyContextForCapabilityLookup,
  searchWorkflowDiscoveryCapabilities,
  describeWorkflowDiscoveryCapability,
}: RegisterWorkflowAgentCapabilityIpcDependencies<Context>): void {
  handleIpc("workflow-agents:search-capabilities", async (_event, raw: SearchWorkflowDiscoveryCapabilitiesInput) => {
    const input = workflowDiscoveryCapabilitySearchSchema.parse(raw);
    const workflowContext = input.workflowThreadId
      ? workflowAgentIpcContextForWorkflowThread(input.workflowThreadId)
      : workflowProjectIpcContext(input);
    const context = await workflowDiscoveryPolicyContextForCapabilityLookup(input, workflowContext);
    return searchWorkflowDiscoveryCapabilities({
      query: input.query,
      context,
      limit: input.limit,
    });
  });

  handleIpc("workflow-agents:describe-capability", async (_event, raw: DescribeWorkflowDiscoveryCapabilityInput) => {
    const input = workflowDiscoveryCapabilityDescribeSchema.parse(raw);
    const workflowContext = input.workflowThreadId
      ? workflowAgentIpcContextForWorkflowThread(input.workflowThreadId)
      : workflowProjectIpcContext(input);
    const context = await workflowDiscoveryPolicyContextForCapabilityLookup(input, workflowContext);
    const description = describeWorkflowDiscoveryCapability({
      capabilityId: input.capabilityId,
      query: input.query,
      context,
    });
    if (!description) throw new Error(`Workflow capability was not found: ${input.capabilityId}`);
    return description;
  });
}

export function registerWorkflowAgentNativeToolIpc<
  Store,
  Context extends WorkflowProjectContext<Store> = WorkflowProjectContext<Store>,
>({
  handleIpc,
  workflowAgentIpcContextForWorkflowThread,
  workflowProjectIpcContext,
  invokeWorkflowNativeTool,
}: RegisterWorkflowAgentNativeToolIpcDependencies<Store, Context>): void {
  handleIpc("workflow-agents:invoke-native-tool", (_event, raw: InvokeWorkflowNativeToolInput) => {
    const input = workflowNativeToolInvokeSchema.parse(raw);
    const workflowThreadId = workflowThreadIdFromNativeToolInput(input);
    const context = workflowThreadId ? workflowAgentIpcContextForWorkflowThread(workflowThreadId) : workflowProjectIpcContext({});
    return invokeWorkflowNativeTool(context, input);
  });
}

function workflowThreadIdFromNativeToolInput(input: InvokeWorkflowNativeToolInput): string | undefined {
  const workflowThreadId = input.arguments?.workflowThreadId;
  return typeof workflowThreadId === "string" && workflowThreadId.trim() ? workflowThreadId.trim() : undefined;
}

export function registerWorkflowAgentExplorationIpc<
  Store extends WorkflowAgentExplorationStore,
  Context extends WorkflowAgentExplorationContext<Store> = WorkflowAgentExplorationContext<Store>,
>({
  handleIpc,
  workflowAgentIpcContextForWorkflowThread,
  runWorkflowThreadExploration,
  emitWorkflowUpdated,
}: RegisterWorkflowAgentExplorationIpcDependencies<Store, Context>): void {
  handleIpc("workflow-agents:run-exploration", async (_event, raw: RunWorkflowThreadExplorationInput) => {
    const input = workflowThreadExplorationRunSchema.parse(raw);
    const context = workflowAgentIpcContextForWorkflowThread(input.workflowThreadId);
    const result = await runWorkflowThreadExploration(context, input);
    const folders = context.targetStore.listWorkflowAgentFolders();
    const updatedThread = folders.flatMap((folder) => folder.threads).find((candidate) => candidate.id === input.workflowThreadId) ?? result.thread;
    emitWorkflowUpdated(context.projectPath);
    return {
      folders,
      thread: updatedThread,
      trace: result.trace,
      graphSnapshot: result.graphSnapshot,
    } satisfies WorkflowThreadExplorationResult;
  });
}

export function registerWorkflowAgentDiscoveryAccessIpc<
  Store extends WorkflowAgentDiscoveryAccessStore,
  Context extends WorkflowAgentDiscoveryAccessContext<Store>,
>({
  handleIpc,
  workflowAgentIpcContextForDiscoveryQuestion,
  connectorDescriptors,
  resolveWorkflowDiscoveryAccessRequest,
  emitPermissionGrantCreated,
  emitWorkflowUpdated,
}: RegisterWorkflowAgentDiscoveryAccessIpcDependencies<Store, Context>): void {
  handleIpc("workflow-agents:resolve-discovery-access-request", async (_event, raw: ResolveWorkflowDiscoveryAccessRequestInput) => {
    const input = workflowDiscoveryAccessRequestResolveSchema.parse(raw);
    const { targetStore, thread, workflowThread, projectPath } = workflowAgentIpcContextForDiscoveryQuestion(input.questionId);
    const existingGrantIds = new Set(targetStore.listPermissionGrants().map((grant) => grant.id));
    const result = await resolveWorkflowDiscoveryAccessRequest(targetStore, input, {
      connectorDescriptors: connectorDescriptors(),
      permissionMode: thread.permissionMode,
      permissionAuditThreadId: workflowThread.chatThreadId ?? thread.id,
      workspacePath: projectPath,
    });
    const grant = targetStore.listPermissionGrants().find((item) => !existingGrantIds.has(item.id));
    if (grant) emitPermissionGrantCreated(grant, projectPath);
    emitWorkflowUpdated(projectPath);
    return result;
  });
}

export function registerWorkflowAgentRevisionIpc<
  Store extends WorkflowAgentRevisionStore,
  Host extends WorkflowAgentRevisionHost<Store>,
>({
  handleIpc,
  requireProjectRuntimeHostForWorkflowThread,
  requireProjectRuntimeHostForWorkflowVersion,
  requireProjectRuntimeHostForWorkflowRevision,
  restoreWorkflowVersion,
  emitWorkflowUpdated,
  recordWorkflowRevisionDecisionInChat,
}: RegisterWorkflowAgentRevisionIpcDependencies<Store, Host>): void {
  handleIpc("workflow-agents:list-revisions", (_event, raw: ListWorkflowRevisionsInput) => {
    const input = workflowRevisionListSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowThread(input.workflowThreadId);
    return host.store.listWorkflowRevisions(input.workflowThreadId);
  });

  handleIpc("workflow-agents:list-versions", (_event, raw: ListWorkflowVersionsInput) => {
    const input = workflowVersionListSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowThread(input.workflowThreadId);
    return host.store.listWorkflowVersions(input.workflowThreadId);
  });

  handleIpc("workflow-agents:restore-version", async (_event, raw: RestoreWorkflowVersionInput) => {
    const input = workflowVersionRestoreSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowVersion(input.versionId);
    const dashboard = await restoreWorkflowVersion(host, input);
    emitWorkflowUpdated(host.workspacePath);
    return dashboard;
  });

  handleIpc("workflow-agents:create-revision", (_event, raw: CreateWorkflowRevisionInput) => {
    const input = workflowRevisionCreateSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowThread(input.workflowThreadId);
    return host.store.createWorkflowRevision(input);
  });

  handleIpc("workflow-agents:update-revision", (_event, raw: UpdateWorkflowRevisionInput) => {
    const input = workflowRevisionUpdateSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRevision(input.id);
    return host.store.updateWorkflowRevision(input);
  });

  handleIpc("workflow-agents:resolve-revision", (_event, raw: ResolveWorkflowRevisionInput) => {
    const input = workflowRevisionResolveSchema.parse(raw);
    const host = requireProjectRuntimeHostForWorkflowRevision(input.id);
    const targetStore = host.store;
    const before = targetStore.getWorkflowRevision(input.id);
    const revision = targetStore.resolveWorkflowRevision(input);
    if (before.status !== input.decision) recordWorkflowRevisionDecisionInChat(revision, input.decision, targetStore);
    return revision;
  });
}
