import type { IpcMain } from "electron";
import { z } from "zod";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { CompileWorkflowDebugRewriteInput, CompileWorkflowPreviewInput, WorkflowDashboard } from "../../shared/workflowTypes";
import type { CompileWorkflowArtifactInput } from "./ipcWorkflowFacade";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const workflowCompilePreviewIpcChannels = ["workflow:compile-preview"] as const;

export const workflowDebugRewriteIpcChannels = ["workflow:debug-rewrite"] as const;

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

type WorkflowCompilePreviewArtifactInput<Store extends WorkflowCompileStore> = Omit<CompileWorkflowArtifactInput, "store"> & {
  store: Store;
};
type WorkflowDebugRewriteArtifactInput<Store extends WorkflowCompileStore> = Omit<CompileWorkflowArtifactInput, "store"> & {
  store: Store;
};
type WorkflowCompileProgressEvent = Extract<DesktopEvent, { type: "workflow-compile-progress" }>;

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
  workflowDebugRewriteIpcContext(
    input: CompileWorkflowDebugRewriteInput,
  ): WorkflowDebugRewriteRuntimeContext<Store, Thread, WorkflowThread, DebugContext>;
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
}: RegisterWorkflowDebugRewriteIpcDependencies<Store, Thread, WorkflowThread, DebugContext, PluginRegistry, PluginRegistrations>): void {
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
