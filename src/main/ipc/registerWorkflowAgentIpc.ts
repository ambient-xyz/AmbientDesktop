import type { IpcMain } from "electron";
import { z } from "zod";

import type { AmbientPermissionGrant, PermissionMode } from "../../shared/permissionTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import type {
  AnswerWorkflowDiscoveryQuestionInput,
  CreateWorkflowAgentFolderInput,
  CreateWorkflowAgentThreadInput,
  CreateWorkflowRevisionInput,
  DescribeWorkflowDiscoveryCapabilityInput,
  InvokeWorkflowNativeToolInput,
  ListWorkflowAgentChatMessagesInput,
  ListWorkflowRevisionsInput,
  ListWorkflowVersionsInput,
  MoveWorkflowAgentThreadInput,
  ResolveWorkflowDiscoveryAccessRequestInput,
  ResolveWorkflowRevisionInput,
  RestoreWorkflowVersionInput,
  RunWorkflowThreadExplorationInput,
  SearchWorkflowDiscoveryCapabilitiesInput,
  StartWorkflowDiscoveryInput,
  StartWorkflowRevisionDiscoveryInput,
  UpdateWorkflowRevisionInput,
  WorkflowAgentDiscoveryResult,
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
  WorkflowDashboard,
  WorkflowDiscoveryCapabilityDescription,
  WorkflowDiscoveryCapabilitySearch,
  WorkflowExplorationTraceSummary,
  WorkflowGraphSnapshot,
  WorkflowNativeToolInvocationResult,
  WorkflowRevisionSummary,
  WorkflowThreadExplorationResult,
  WorkflowVersionSummary,
} from "../../shared/workflowTypes";
import type { WorkflowConnectorDescriptor, WorkflowDiscoveryPolicyContext } from "./ipcWorkflowFacade";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const workflowAgentThreadIpcChannels = [
  "workflow-agents:list-folders",
  "workflow-agents:create-folder",
  "workflow-agents:move-thread",
  "workflow-agents:create-thread",
  "workflow-agents:ensure-chat-thread",
  "workflow-agents:list-chat-messages",
] as const;

export const workflowAgentDiscoveryStartIpcChannels = ["workflow-agents:start-discovery"] as const;

export const workflowAgentRevisionDiscoveryStartIpcChannels = ["workflow-agents:start-revision-discovery"] as const;

export const workflowAgentDiscoveryAnswerIpcChannels = ["workflow-agents:answer-discovery-question"] as const;

export const workflowAgentTraceIpcChannels = ["workflow-agents:list-graph-snapshots", "workflow-agents:list-exploration-traces"] as const;

export const workflowAgentCapabilityIpcChannels = ["workflow-agents:search-capabilities", "workflow-agents:describe-capability"] as const;

export const workflowAgentNativeToolIpcChannels = ["workflow-agents:invoke-native-tool"] as const;

export const workflowAgentExplorationIpcChannels = ["workflow-agents:run-exploration"] as const;

export const workflowAgentDiscoveryAccessIpcChannels = ["workflow-agents:resolve-discovery-access-request"] as const;

export const workflowAgentRevisionIpcChannels = [
  "workflow-agents:list-revisions",
  "workflow-agents:list-versions",
  "workflow-agents:restore-version",
  "workflow-agents:create-revision",
  "workflow-agents:update-revision",
  "workflow-agents:resolve-revision",
] as const;

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

type WorkflowAgentExplorationContext<Store extends WorkflowAgentExplorationStore> = WorkflowProjectContext<Store>;

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
  startWorkflowRevisionDiscovery(context: Context, input: StartWorkflowRevisionDiscoveryInput): MaybePromise<WorkflowAgentDiscoveryResult>;
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
  invokeWorkflowNativeTool(context: Context, input: InvokeWorkflowNativeToolInput): MaybePromise<WorkflowNativeToolInvocationResult>;
}

export interface RegisterWorkflowAgentExplorationIpcDependencies<
  Store extends WorkflowAgentExplorationStore,
  Context extends WorkflowAgentExplorationContext<Store> = WorkflowAgentExplorationContext<Store>,
> {
  handleIpc: HandleIpc;
  workflowAgentIpcContextForWorkflowThread(workflowThreadId: string): Context;
  runWorkflowThreadExploration(context: Context, input: RunWorkflowThreadExplorationInput): MaybePromise<WorkflowAgentExplorationRunResult>;
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
  recordWorkflowRevisionDecisionInChat(
    revision: WorkflowRevisionSummary,
    decision: ResolveWorkflowRevisionInput["decision"],
    targetStore: Store,
  ): void;
}

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
  phase: z
    .enum([
      "request",
      "discovery",
      "planned",
      "compiling",
      "ready_for_review",
      "approved",
      "running",
      "paused",
      "failed",
      "succeeded",
      "revision",
    ])
    .optional(),
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

export function registerWorkflowAgentThreadIpc<Store extends WorkflowAgentThreadStore, Host extends WorkflowAgentThreadHost<Store>>({
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

export function registerWorkflowAgentTraceIpc<Store extends WorkflowAgentTraceStore, Host extends WorkflowAgentTraceHost<Store>>({
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

export function registerWorkflowAgentNativeToolIpc<Store, Context extends WorkflowProjectContext<Store> = WorkflowProjectContext<Store>>({
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
    const updatedThread =
      folders.flatMap((folder) => folder.threads).find((candidate) => candidate.id === input.workflowThreadId) ?? result.thread;
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

export function registerWorkflowAgentRevisionIpc<Store extends WorkflowAgentRevisionStore, Host extends WorkflowAgentRevisionHost<Store>>({
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
