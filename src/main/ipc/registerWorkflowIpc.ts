import type { IpcMain } from "electron";
import { z } from "zod";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PermissionMode, PermissionRequest } from "../../shared/permissionTypes";
import type {
  CancelWorkflowRunInput,
  RecoverWorkflowRunInput,
  ResolveWorkflowApprovalInput,
  RevalidateWorkflowArtifactInput,
  ReviewWorkflowArtifactInput,
  RunWorkflowArtifactInput,
  UpdateWorkflowArtifactSourceInput,
  UpdateWorkflowConnectorGrantInput,
  WorkflowDashboard,
  WorkflowRunDetail,
} from "../../shared/workflowTypes";
import type {
  RunWorkflowArtifactInput as WorkflowRunArtifactServiceInput,
  WorkflowConnectorDescriptor,
  WorkflowRecoveryPlan,
} from "./ipcWorkflowFacade";

export {
  registerWorkflowCompilePreviewIpc,
  registerWorkflowDebugRewriteIpc,
  workflowCompilePreviewIpcChannels,
  workflowDebugRewriteIpcChannels,
} from "./registerWorkflowCompileIpc";
export type {
  RegisterWorkflowCompilePreviewIpcDependencies,
  RegisterWorkflowDebugRewriteIpcDependencies,
} from "./registerWorkflowCompileIpc";

export {
  registerWorkflowDashboardIpc,
  registerWorkflowLabIpc,
  registerWorkflowRecorderIpc,
  workflowDashboardIpcChannels,
  workflowLabIpcChannels,
  workflowRecorderIpcChannels,
} from "./registerWorkflowRecordingIpc";
export type {
  RegisterWorkflowDashboardIpcDependencies,
  RegisterWorkflowLabIpcDependencies,
  RegisterWorkflowRecorderIpcDependencies,
} from "./registerWorkflowRecordingIpc";

export {
  registerWorkflowAgentCapabilityIpc,
  registerWorkflowAgentDiscoveryAccessIpc,
  registerWorkflowAgentDiscoveryAnswerIpc,
  registerWorkflowAgentDiscoveryStartIpc,
  registerWorkflowAgentExplorationIpc,
  registerWorkflowAgentNativeToolIpc,
  registerWorkflowAgentRevisionDiscoveryStartIpc,
  registerWorkflowAgentRevisionIpc,
  registerWorkflowAgentThreadIpc,
  registerWorkflowAgentTraceIpc,
  workflowAgentCapabilityIpcChannels,
  workflowAgentDiscoveryAccessIpcChannels,
  workflowAgentDiscoveryAnswerIpcChannels,
  workflowAgentDiscoveryStartIpcChannels,
  workflowAgentExplorationIpcChannels,
  workflowAgentNativeToolIpcChannels,
  workflowAgentRevisionDiscoveryStartIpcChannels,
  workflowAgentRevisionIpcChannels,
  workflowAgentThreadIpcChannels,
  workflowAgentTraceIpcChannels,
} from "./registerWorkflowAgentIpc";
export type {
  RegisterWorkflowAgentCapabilityIpcDependencies,
  RegisterWorkflowAgentDiscoveryAccessIpcDependencies,
  RegisterWorkflowAgentDiscoveryAnswerIpcDependencies,
  RegisterWorkflowAgentDiscoveryStartIpcDependencies,
  RegisterWorkflowAgentExplorationIpcDependencies,
  RegisterWorkflowAgentNativeToolIpcDependencies,
  RegisterWorkflowAgentRevisionDiscoveryStartIpcDependencies,
  RegisterWorkflowAgentRevisionIpcDependencies,
  RegisterWorkflowAgentThreadIpcDependencies,
  RegisterWorkflowAgentTraceIpcDependencies,
} from "./registerWorkflowAgentIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const workflowApprovalIpcChannels = ["workflow:resolve-approval"] as const;

export const workflowCancelRunIpcChannels = ["workflow:cancel-run"] as const;

export const workflowArtifactReviewIpcChannels = ["workflow:review-artifact"] as const;

export const workflowConnectorGrantIpcChannels = ["workflow:update-connector-grant"] as const;

export const workflowArtifactRevalidationIpcChannels = ["workflow:revalidate-artifact"] as const;

export const workflowArtifactSourceIpcChannels = ["workflow:update-artifact-source"] as const;

export const workflowRunArtifactIpcChannels = ["workflow:run-artifact"] as const;

export const workflowRecoverRunIpcChannels = ["workflow:recover-run"] as const;

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

type WorkflowRunArtifactServiceInputForStore<
  Store extends WorkflowCompileStore,
  Browser extends WorkflowRunArtifactServiceInput["browser"],
> = Omit<WorkflowRunArtifactServiceInput, "store" | "browser"> & {
  store: Store;
  browser: Browser;
};
type WorkflowRunStartedEvent = Extract<DesktopEvent, { type: "workflow-run-started" }>;
type WorkflowRunArtifactPermissionRequest = Omit<PermissionRequest, "id">;
type WorkflowRunArtifactPluginRegistration = NonNullable<WorkflowRunArtifactServiceInput["pluginRegistrations"]>[number];

export interface RegisterWorkflowApprovalIpcDependencies<Store, Host extends WorkflowApprovalHost<Store>> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForWorkflowRun(runId: string): Host;
  resolveWorkflowApproval(store: Store, input: ResolveWorkflowApprovalInput): WorkflowRunDetail;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowCancelRunIpcDependencies<Store, Host extends WorkflowCancelRunHost<Store>> {
  handleIpc: HandleIpc;
  projectRuntimeHostForWorkflowRun(runId: string): Host | undefined;
  activeWorkflowRunHost(runId: string): Host | undefined;
  activeWorkflowRunController(runId: string): WorkflowRunAbortController | undefined;
  readWorkflowDashboard(store: Store): WorkflowDashboard;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowArtifactReviewIpcDependencies<Store, Host extends WorkflowArtifactReviewHost<Store>> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForWorkflowArtifact(artifactId: string): Host;
  reviewWorkflowArtifact(store: Store, input: ReviewWorkflowArtifactInput): WorkflowDashboard;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowConnectorGrantIpcDependencies<Store, Host extends WorkflowConnectorGrantHost<Store>> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForWorkflowArtifact(artifactId: string): Host;
  updateWorkflowConnectorGrant(store: Store, input: UpdateWorkflowConnectorGrantInput): WorkflowDashboard;
  emitWorkflowUpdated(workspacePath: string): void;
}

export interface RegisterWorkflowArtifactRevalidationIpcDependencies<Store, Host extends WorkflowArtifactRevalidationHost<Store>> {
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

export interface RegisterWorkflowArtifactSourceIpcDependencies<Store, Host extends WorkflowArtifactSourceHost<Store>> {
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
const workflowConnectorGrantUpdateSchema = z
  .object({
    artifactId: z.string().min(1),
    connectorId: z.string().min(1),
    accountId: z.string().min(1).optional(),
    nextAccountId: z.string().min(1).optional(),
    dataRetention: z.enum(["none", "redacted_audit", "run_artifact"]).optional(),
    decision: z.enum(["rejected"]).optional(),
    removeScope: z.string().min(1).optional(),
  })
  .refine((input) => [input.dataRetention, input.decision, input.removeScope, input.nextAccountId].filter(Boolean).length === 1, {
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
export function registerWorkflowApprovalIpc<Store, Host extends WorkflowApprovalHost<Store>>({
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

export function registerWorkflowCancelRunIpc<Store, Host extends WorkflowCancelRunHost<Store>>({
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

export function registerWorkflowArtifactReviewIpc<Store, Host extends WorkflowArtifactReviewHost<Store>>({
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

export function registerWorkflowConnectorGrantIpc<Store, Host extends WorkflowConnectorGrantHost<Store>>({
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

export function registerWorkflowArtifactRevalidationIpc<Store, Host extends WorkflowArtifactRevalidationHost<Store>>({
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

export function registerWorkflowArtifactSourceIpc<Store, Host extends WorkflowArtifactSourceHost<Store>>({
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
