import type { IpcMain } from "electron";
import { z } from "zod";

import type { PermissionMode } from "../../shared/permissionTypes";
import type {
  CancelOrchestrationRunInput,
  CreateOrchestrationTaskInput,
  OrchestrationAutoDispatchStatus,
  OrchestrationBoard,
  OrchestrationPrepareResult,
  OrchestrationWorkflowReadiness,
  RepairOrchestrationWorkflowInput,
  ResolveOrchestrationWorkflowImpactInput,
  RevealOrchestrationWorkspaceInput,
  SetOrchestrationAutoDispatchInput,
  StartOrchestrationRunInput,
  UpdateOrchestrationTaskInput,
  UpdateOrchestrationWorkflowRawInput,
  UpdateOrchestrationWorkflowSettingsInput,
} from "../../shared/workflowTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const orchestrationBoardIpcChannels = ["orchestration:list-board"] as const;
export const orchestrationTaskIpcChannels = [
  "orchestration:create-task",
  "orchestration:update-task",
] as const;
export const orchestrationPrepareIpcChannels = ["orchestration:prepare-next"] as const;
export const orchestrationWorkflowImpactIpcChannels = ["orchestration:resolve-workflow-impact"] as const;
export const orchestrationWorkflowRepairIpcChannels = ["orchestration:repair-workflow"] as const;
export const orchestrationWorkflowSettingsIpcChannels = ["orchestration:update-workflow-settings"] as const;
export const orchestrationWorkflowRawIpcChannels = ["orchestration:update-workflow-raw"] as const;
export const orchestrationStartRunIpcChannels = ["orchestration:start-run"] as const;
export const orchestrationCancelRunIpcChannels = ["orchestration:cancel-run"] as const;
export const orchestrationRevealWorkspaceIpcChannels = ["orchestration:reveal-workspace"] as const;
export const orchestrationAutoDispatchIpcChannels = [
  "orchestration:auto-status",
  "orchestration:set-auto-dispatch",
] as const;

interface OrchestrationWorkspaceStore {
  getWorkspace(): { path: string };
}

interface OrchestrationTaskStore extends OrchestrationWorkspaceStore {
  createOrchestrationTask(input: CreateOrchestrationTaskInput): unknown;
  updateOrchestrationTask(input: UpdateOrchestrationTaskInput): unknown;
}

interface OrchestrationWorkflowImpactStore extends OrchestrationWorkspaceStore {
  getActiveProjectBoard(): { id: string } | undefined;
  resolveProjectBoardWorkflowImpact(input: {
    boardId: string;
    action: ResolveOrchestrationWorkflowImpactInput["action"];
    runIds: string[];
    workflowPath?: string;
    workflowHash?: string;
  }): { clearedRunIds: string[]; skippedRuns: { runId: string; reason: string }[] };
}

interface OrchestrationWorkflowRepairStore extends OrchestrationWorkspaceStore {
  getActiveProjectBoard(): { id: string } | undefined;
  recordProjectBoardWorkflowRepair(input: {
    boardId: string;
    action: RepairOrchestrationWorkflowInput["action"];
    workflowPath: string;
    workflowHash?: string;
    previousWorkflowHash?: string;
    backupPath?: string;
    status: "ready" | "missing" | "invalid";
    message?: string;
  }): unknown;
}

interface OrchestrationWorkflowRepairOperationResult {
  workflowPath: string;
  workflow?: { contentHash?: string };
  previousWorkflowHash?: string;
  backupPath?: string;
  error?: { code?: string; message?: string };
}

interface OrchestrationWorkflowSettingsStore extends OrchestrationWorkspaceStore {
  getActiveProjectBoard(): { id: string } | undefined;
  recordProjectBoardWorkflowSettingsUpdated(input: {
    boardId: string;
    workflowPath: string;
    workflowHash?: string;
    previousWorkflowHash?: string;
    backupPath?: string;
    changedFields: string[];
    diff: string;
    status: "ready" | "missing" | "invalid";
    message?: string;
  }): unknown;
}

interface OrchestrationWorkflowSettingsOperationResult {
  workflowPath: string;
  workflow?: { contentHash?: string };
  backupPath?: string;
  previousWorkflowHash?: string;
  changedFields: string[];
  diff: string;
  error?: { code?: string; message?: string };
}

interface OrchestrationWorkflowRawStore extends OrchestrationWorkspaceStore {
  getActiveProjectBoard(): { id: string } | undefined;
  recordProjectBoardWorkflowRawUpdated(input: {
    boardId: string;
    workflowPath: string;
    workflowHash?: string;
    previousWorkflowHash?: string;
    backupPath?: string;
    changed: boolean;
    diff: string;
    status: "ready" | "missing" | "invalid";
    message?: string;
  }): unknown;
}

interface OrchestrationWorkflowRawOperationResult {
  workflowPath: string;
  workflow?: { contentHash?: string };
  markdown: string;
  backupPath?: string;
  previousWorkflowHash?: string;
  changed: boolean;
  diff: string;
  error?: { code?: string; message?: string };
}

interface OrchestrationStartRunStore extends OrchestrationWorkspaceStore {
  getThread(threadId: string): { permissionMode: PermissionMode };
}

interface OrchestrationCancelRunStore extends OrchestrationWorkspaceStore {
  getOrchestrationRun(runId: string): { id: string; threadId?: string };
  updateOrchestrationRun(input: {
    id: string;
    status: "canceled";
    threadId: string;
    error: string;
    finish: true;
  }): unknown;
}

interface OrchestrationRuntimeHost<Store extends OrchestrationWorkspaceStore> {
  store: Store;
  workspacePath: string;
}

interface OrchestrationAbortRuntimeHost {
  runtime: {
    abort(threadId: string): MaybePromise<void>;
  };
}

interface OrchestrationStartRunRuntimeHost<Store extends OrchestrationStartRunStore>
  extends OrchestrationRuntimeHost<Store> {
  runtime: unknown;
}

export interface RegisterOrchestrationBoardIpcDependencies {
  handleIpc: HandleIpc;
  readCurrentOrchestrationBoard(): MaybePromise<OrchestrationBoard>;
}

export interface RegisterOrchestrationTaskIpcDependencies<
  Store extends OrchestrationTaskStore,
  Host extends OrchestrationRuntimeHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  ensureProjectRuntimeHostForWorkspacePath(workspacePath: string): Host;
  requireProjectRuntimeHostForOrchestrationTask(taskId: string): Host;
  emitOrchestrationUpdated(workspacePath?: string): void;
  readCurrentOrchestrationBoard(targetStore: Store): MaybePromise<OrchestrationBoard>;
}

export interface RegisterOrchestrationPrepareIpcDependencies<
  Store extends OrchestrationWorkspaceStore,
  Host extends OrchestrationRuntimeHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  prepareAndRecordNextOrchestrationRuns(
    workspacePath: string,
    targetStore: Store,
    source: "manual_prepare",
  ): MaybePromise<{ result: OrchestrationPrepareResult }>;
  emitProjectStateIfActive(host: Host): void;
  recordActiveProjectBoardExecutionReadinessBlocker(
    input: { source: "manual_prepare"; error: unknown },
    targetStore: Store,
  ): MaybePromise<void>;
}

export interface RegisterOrchestrationWorkflowImpactIpcDependencies<
  Store extends OrchestrationWorkflowImpactStore,
  Host extends OrchestrationRuntimeHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  readOrchestrationWorkflowReadiness(workspacePath: string): MaybePromise<OrchestrationWorkflowReadiness>;
  prepareAndRecordNextOrchestrationRuns(
    workspacePath: string,
    targetStore: Store,
    source: "manual_prepare",
  ): MaybePromise<{ result: OrchestrationPrepareResult }>;
  recordActiveProjectBoardExecutionReadinessBlocker(
    input: { source: "manual_prepare"; error: unknown },
    targetStore: Store,
  ): MaybePromise<void>;
  readCurrentOrchestrationBoard(targetStore: Store): MaybePromise<OrchestrationBoard>;
  emitProjectStateIfActive(host: Host): void;
  emitOrchestrationUpdated(workspacePath?: string): void;
}

export interface RegisterOrchestrationWorkflowRepairIpcDependencies<
  Store extends OrchestrationWorkflowRepairStore,
  Host extends OrchestrationRuntimeHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  repairProjectBoardWorkflow(
    workspacePath: string,
    action: RepairOrchestrationWorkflowInput["action"],
  ): MaybePromise<OrchestrationWorkflowRepairOperationResult>;
  readCurrentOrchestrationBoard(targetStore: Store): MaybePromise<OrchestrationBoard>;
  emitProjectStateIfActive(host: Host): void;
  emitOrchestrationUpdated(workspacePath?: string): void;
}

export interface RegisterOrchestrationWorkflowSettingsIpcDependencies<
  Store extends OrchestrationWorkflowSettingsStore,
  Host extends OrchestrationRuntimeHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  updateProjectBoardWorkflowSettings(
    workspacePath: string,
    input: UpdateOrchestrationWorkflowSettingsInput,
  ): MaybePromise<OrchestrationWorkflowSettingsOperationResult>;
  readCurrentOrchestrationBoard(targetStore: Store): MaybePromise<OrchestrationBoard>;
  emitProjectStateIfActive(host: Host): void;
  emitOrchestrationUpdated(workspacePath?: string): void;
}

export interface RegisterOrchestrationWorkflowRawIpcDependencies<
  Store extends OrchestrationWorkflowRawStore,
  Host extends OrchestrationRuntimeHost<Store>,
> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  updateProjectBoardWorkflowRaw(
    workspacePath: string,
    input: UpdateOrchestrationWorkflowRawInput,
  ): MaybePromise<OrchestrationWorkflowRawOperationResult>;
  readCurrentOrchestrationBoard(targetStore: Store): MaybePromise<OrchestrationBoard>;
  emitProjectStateIfActive(host: Host): void;
  emitOrchestrationUpdated(workspacePath?: string): void;
}

export interface RegisterOrchestrationStartRunIpcDependencies<
  Store extends OrchestrationStartRunStore,
  Host extends OrchestrationStartRunRuntimeHost<Store>,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForOrchestrationRun(runId: string): Host;
  activeThreadIdForHost(host: Host): string;
  startPreparedOrchestrationRun(
    workspacePath: string,
    targetStore: Store,
    runtime: Host["runtime"],
    runId: string,
    onUpdate: () => void,
    onFinishedRun: (runId: string) => Promise<void>,
    options: { permissionMode: PermissionMode },
  ): MaybePromise<{ threadId: string }>;
  reviewFinishedProjectBoardRun(
    runId: string,
    targetStore: Store,
    onUpdate: () => void,
  ): Promise<void>;
  setProjectHostActiveThreadId(host: Host, threadId: string): string;
  emitProjectStateIfActive(host: Host, threadId?: string): void;
  emitOrchestrationUpdated(workspacePath?: string): void;
  readCurrentOrchestrationBoard(targetStore: Store): MaybePromise<OrchestrationBoard>;
}

export interface RegisterOrchestrationCancelRunIpcDependencies<
  Store extends OrchestrationCancelRunStore,
  Host extends OrchestrationRuntimeHost<Store>,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForOrchestrationRun(runId: string): Host;
  requireProjectRuntimeHostForThread(threadId: string): OrchestrationAbortRuntimeHost;
  emitOrchestrationUpdated(workspacePath?: string): void;
  readCurrentOrchestrationBoard(targetStore: Store): MaybePromise<OrchestrationBoard>;
}

export interface RegisterOrchestrationRevealWorkspaceIpcDependencies {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForOrchestrationWorkspace(workspacePath: string): unknown;
  openPath(workspacePath: string): MaybePromise<string>;
}

export interface RegisterOrchestrationAutoDispatchIpcDependencies {
  handleIpc: HandleIpc;
  readAutoDispatchStatus(): MaybePromise<OrchestrationAutoDispatchStatus>;
  setAutoDispatchEnabled(input: SetOrchestrationAutoDispatchInput): MaybePromise<OrchestrationAutoDispatchStatus>;
}

const orchestrationTaskCreateSchema = z.object({
  title: z.string().min(1).max(240),
  description: z.string().max(20_000).optional(),
  state: z.string().min(1).max(80).optional(),
  priority: z.number().int().min(0).max(999).optional(),
  labels: z.array(z.string().min(1).max(80)).max(20).optional(),
  blockedBy: z.array(z.string().min(1).max(120)).max(50).optional(),
  projectPath: z.string().min(1).max(4096).optional(),
});
const orchestrationTaskUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(240).optional(),
  description: z.string().max(20_000).optional(),
  state: z.string().min(1).max(80).optional(),
  priority: z.number().int().min(0).max(999).nullable().optional(),
  labels: z.array(z.string().min(1).max(80)).max(20).optional(),
  blockedBy: z.array(z.string().min(1).max(120)).max(50).optional(),
});
const orchestrationWorkflowImpactResolveSchema = z.object({
  action: z.enum(["continue_old_prep", "prepare_again"]),
  runIds: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
});
const orchestrationWorkflowRepairSchema = z.object({
  action: z.enum(["restore_generated_default", "use_existing_anyway"]),
});
const orchestrationWorkflowSettingsUpdateSchema = z.object({
  autoDispatch: z.boolean().optional(),
  maxConcurrentAgents: z.number().int().min(1).max(20).optional(),
  maxTurns: z.number().int().min(1).max(200).optional(),
  workspaceStrategy: z.enum(["git-worktree", "directory"]).optional(),
  requireTests: z.boolean().optional(),
  requireDiffSummary: z.boolean().optional(),
  requireScreenshots: z.boolean().optional(),
});
const orchestrationWorkflowRawUpdateSchema = z.object({
  markdown: z.string().min(1).max(200_000),
});
const orchestrationRunStartSchema = z.object({
  runId: z.string().min(1),
});
const orchestrationRunCancelSchema = z.object({
  runId: z.string().min(1),
});
const orchestrationWorkspaceRevealSchema = z.object({
  workspacePath: z.string().min(1).max(4096),
});
const orchestrationAutoDispatchSchema = z.object({
  enabled: z.boolean(),
});

export function registerOrchestrationBoardIpc({
  handleIpc,
  readCurrentOrchestrationBoard,
}: RegisterOrchestrationBoardIpcDependencies): void {
  handleIpc("orchestration:list-board", () => readCurrentOrchestrationBoard());
}

export function registerOrchestrationTaskIpc<
  Store extends OrchestrationTaskStore,
  Host extends OrchestrationRuntimeHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  ensureProjectRuntimeHostForWorkspacePath,
  requireProjectRuntimeHostForOrchestrationTask,
  emitOrchestrationUpdated,
  readCurrentOrchestrationBoard,
}: RegisterOrchestrationTaskIpcDependencies<Store, Host>): void {
  handleIpc("orchestration:create-task", async (_event, raw: CreateOrchestrationTaskInput) => {
    const input = orchestrationTaskCreateSchema.parse(raw);
    const host = input.projectPath ? ensureProjectRuntimeHostForWorkspacePath(input.projectPath) : requireActiveProjectRuntimeHost();
    const targetStore = host.store;
    targetStore.createOrchestrationTask(input.projectPath ? { ...input, projectPath: targetStore.getWorkspace().path } : input);
    emitOrchestrationUpdated(host.workspacePath);
    return readCurrentOrchestrationBoard(targetStore);
  });

  handleIpc("orchestration:update-task", async (_event, raw: UpdateOrchestrationTaskInput) => {
    const input = orchestrationTaskUpdateSchema.parse(raw);
    const host = requireProjectRuntimeHostForOrchestrationTask(input.id);
    host.store.updateOrchestrationTask(input);
    emitOrchestrationUpdated(host.workspacePath);
    return readCurrentOrchestrationBoard(host.store);
  });
}

export function registerOrchestrationPrepareIpc<
  Store extends OrchestrationWorkspaceStore,
  Host extends OrchestrationRuntimeHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  prepareAndRecordNextOrchestrationRuns,
  emitProjectStateIfActive,
  recordActiveProjectBoardExecutionReadinessBlocker,
}: RegisterOrchestrationPrepareIpcDependencies<Store, Host>): void {
  handleIpc("orchestration:prepare-next", async () => {
    const host = requireActiveProjectRuntimeHost();
    const targetStore = host.store;
    const workspacePath = targetStore.getWorkspace().path;
    try {
      const { result } = await prepareAndRecordNextOrchestrationRuns(workspacePath, targetStore, "manual_prepare");
      emitProjectStateIfActive(host);
      return result;
    } catch (error) {
      await recordActiveProjectBoardExecutionReadinessBlocker({
        source: "manual_prepare",
        error,
      }, targetStore);
      throw error;
    }
  });
}

export function registerOrchestrationWorkflowImpactIpc<
  Store extends OrchestrationWorkflowImpactStore,
  Host extends OrchestrationRuntimeHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  readOrchestrationWorkflowReadiness,
  prepareAndRecordNextOrchestrationRuns,
  recordActiveProjectBoardExecutionReadinessBlocker,
  readCurrentOrchestrationBoard,
  emitProjectStateIfActive,
  emitOrchestrationUpdated,
}: RegisterOrchestrationWorkflowImpactIpcDependencies<Store, Host>): void {
  handleIpc("orchestration:resolve-workflow-impact", async (_event, raw: ResolveOrchestrationWorkflowImpactInput) => {
    const input = orchestrationWorkflowImpactResolveSchema.parse(raw);
    const host = requireActiveProjectRuntimeHost();
    const targetStore = host.store;
    const workspacePath = targetStore.getWorkspace().path;
    const board = targetStore.getActiveProjectBoard();
    if (!board) throw new Error("No active project board is available for workflow impact resolution.");
    const workflowReadiness = await readOrchestrationWorkflowReadiness(workspacePath);
    const resolution = targetStore.resolveProjectBoardWorkflowImpact({
      boardId: board.id,
      action: input.action,
      runIds: input.runIds,
      workflowPath: workflowReadiness.path,
      workflowHash: workflowReadiness.status === "ready" ? workflowReadiness.workflowHash : undefined,
    });
    let prepared: OrchestrationPrepareResult = {
      workflowPath: workflowReadiness.path,
      warnings: [],
      prepared: [],
      skipped: [],
    };
    if (input.action === "prepare_again") {
      try {
        const next = await prepareAndRecordNextOrchestrationRuns(workspacePath, targetStore, "manual_prepare");
        prepared = next.result;
      } catch (error) {
        await recordActiveProjectBoardExecutionReadinessBlocker({
          source: "manual_prepare",
          error,
        }, targetStore);
        throw error;
      }
    }
    const nextBoard = await readCurrentOrchestrationBoard(targetStore);
    emitProjectStateIfActive(host);
    emitOrchestrationUpdated(workspacePath);
    return {
      action: input.action,
      clearedRunIds: resolution.clearedRunIds,
      skippedRuns: resolution.skippedRuns,
      prepared,
      board: nextBoard,
    };
  });
}

export function registerOrchestrationWorkflowRepairIpc<
  Store extends OrchestrationWorkflowRepairStore,
  Host extends OrchestrationRuntimeHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  repairProjectBoardWorkflow,
  readCurrentOrchestrationBoard,
  emitProjectStateIfActive,
  emitOrchestrationUpdated,
}: RegisterOrchestrationWorkflowRepairIpcDependencies<Store, Host>): void {
  handleIpc("orchestration:repair-workflow", async (_event, raw: RepairOrchestrationWorkflowInput) => {
    const input = orchestrationWorkflowRepairSchema.parse(raw);
    const host = requireActiveProjectRuntimeHost();
    const targetStore = host.store;
    const workspacePath = targetStore.getWorkspace().path;
    const board = targetStore.getActiveProjectBoard();
    if (!board) throw new Error("No active project board is available for workflow repair.");
    const result = await repairProjectBoardWorkflow(workspacePath, input.action);
    const status = result.workflow ? "ready" : result.error?.code === "missing_workflow_file" ? "missing" : "invalid";
    targetStore.recordProjectBoardWorkflowRepair({
      boardId: board.id,
      action: input.action,
      workflowPath: result.workflowPath,
      workflowHash: result.workflow?.contentHash,
      previousWorkflowHash: result.previousWorkflowHash,
      backupPath: result.backupPath,
      status,
      message: result.error?.message,
    });
    const nextBoard = await readCurrentOrchestrationBoard(targetStore);
    emitProjectStateIfActive(host);
    emitOrchestrationUpdated(workspacePath);
    return {
      action: input.action,
      workflowPath: result.workflowPath,
      workflowHash: result.workflow?.contentHash,
      previousWorkflowHash: result.previousWorkflowHash,
      backupPath: result.backupPath,
      status,
      message: result.error?.message,
      board: nextBoard,
    };
  });
}

export function registerOrchestrationWorkflowSettingsIpc<
  Store extends OrchestrationWorkflowSettingsStore,
  Host extends OrchestrationRuntimeHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  updateProjectBoardWorkflowSettings,
  readCurrentOrchestrationBoard,
  emitProjectStateIfActive,
  emitOrchestrationUpdated,
}: RegisterOrchestrationWorkflowSettingsIpcDependencies<Store, Host>): void {
  handleIpc("orchestration:update-workflow-settings", async (_event, raw: UpdateOrchestrationWorkflowSettingsInput) => {
    const input = orchestrationWorkflowSettingsUpdateSchema.parse(raw);
    const host = requireActiveProjectRuntimeHost();
    const targetStore = host.store;
    const workspacePath = targetStore.getWorkspace().path;
    const board = targetStore.getActiveProjectBoard();
    if (!board) throw new Error("No active project board is available for workflow settings updates.");
    const result = await updateProjectBoardWorkflowSettings(workspacePath, input);
    const status = result.workflow ? "ready" : result.error?.code === "missing_workflow_file" ? "missing" : "invalid";
    targetStore.recordProjectBoardWorkflowSettingsUpdated({
      boardId: board.id,
      workflowPath: result.workflowPath,
      workflowHash: result.workflow?.contentHash,
      previousWorkflowHash: result.previousWorkflowHash,
      backupPath: result.backupPath,
      changedFields: result.changedFields,
      diff: result.diff,
      status,
      message: result.error?.message,
    });
    const nextBoard = await readCurrentOrchestrationBoard(targetStore);
    emitProjectStateIfActive(host);
    emitOrchestrationUpdated(workspacePath);
    return {
      workflowPath: result.workflowPath,
      workflowHash: result.workflow?.contentHash,
      previousWorkflowHash: result.previousWorkflowHash,
      backupPath: result.backupPath,
      changedFields: result.changedFields,
      diff: result.diff,
      status,
      message: result.error?.message,
      board: nextBoard,
    };
  });
}

export function registerOrchestrationWorkflowRawIpc<
  Store extends OrchestrationWorkflowRawStore,
  Host extends OrchestrationRuntimeHost<Store>,
>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  updateProjectBoardWorkflowRaw,
  readCurrentOrchestrationBoard,
  emitProjectStateIfActive,
  emitOrchestrationUpdated,
}: RegisterOrchestrationWorkflowRawIpcDependencies<Store, Host>): void {
  handleIpc("orchestration:update-workflow-raw", async (_event, raw: UpdateOrchestrationWorkflowRawInput) => {
    const input = orchestrationWorkflowRawUpdateSchema.parse(raw);
    const host = requireActiveProjectRuntimeHost();
    const targetStore = host.store;
    const workspacePath = targetStore.getWorkspace().path;
    const board = targetStore.getActiveProjectBoard();
    if (!board) throw new Error("No active project board is available for raw workflow updates.");
    const result = await updateProjectBoardWorkflowRaw(workspacePath, input);
    const status = result.workflow ? "ready" : result.error?.code === "missing_workflow_file" ? "missing" : "invalid";
    targetStore.recordProjectBoardWorkflowRawUpdated({
      boardId: board.id,
      workflowPath: result.workflowPath,
      workflowHash: result.workflow?.contentHash,
      previousWorkflowHash: result.previousWorkflowHash,
      backupPath: result.backupPath,
      changed: result.changed,
      diff: result.diff,
      status,
      message: result.error?.message,
    });
    const nextBoard = await readCurrentOrchestrationBoard(targetStore);
    emitProjectStateIfActive(host);
    emitOrchestrationUpdated(workspacePath);
    return {
      workflowPath: result.workflowPath,
      workflowHash: result.workflow?.contentHash,
      previousWorkflowHash: result.previousWorkflowHash,
      backupPath: result.backupPath,
      changed: result.changed,
      diff: result.diff,
      status,
      message: result.error?.message,
      board: nextBoard,
    };
  });
}

export function registerOrchestrationStartRunIpc<
  Store extends OrchestrationStartRunStore,
  Host extends OrchestrationStartRunRuntimeHost<Store>,
>({
  handleIpc,
  requireProjectRuntimeHostForOrchestrationRun,
  activeThreadIdForHost,
  startPreparedOrchestrationRun,
  reviewFinishedProjectBoardRun,
  setProjectHostActiveThreadId,
  emitProjectStateIfActive,
  emitOrchestrationUpdated,
  readCurrentOrchestrationBoard,
}: RegisterOrchestrationStartRunIpcDependencies<Store, Host>): void {
  handleIpc("orchestration:start-run", async (_event, raw: StartOrchestrationRunInput) => {
    const input = orchestrationRunStartSchema.parse(raw);
    const host = requireProjectRuntimeHostForOrchestrationRun(input.runId);
    const targetStore = host.store;
    const workspacePath = targetStore.getWorkspace().path;
    const activePermissionMode = targetStore.getThread(activeThreadIdForHost(host)).permissionMode;
    const { threadId } = await startPreparedOrchestrationRun(
      workspacePath,
      targetStore,
      host.runtime,
      input.runId,
      () => {
        emitOrchestrationUpdated(workspacePath);
      },
      (runId) => reviewFinishedProjectBoardRun(runId, targetStore, () => emitProjectStateIfActive(host)),
      { permissionMode: activePermissionMode },
    );
    setProjectHostActiveThreadId(host, threadId);
    emitProjectStateIfActive(host, threadId);
    return readCurrentOrchestrationBoard(targetStore);
  });
}

export function registerOrchestrationCancelRunIpc<
  Store extends OrchestrationCancelRunStore,
  Host extends OrchestrationRuntimeHost<Store>,
>({
  handleIpc,
  requireProjectRuntimeHostForOrchestrationRun,
  requireProjectRuntimeHostForThread,
  emitOrchestrationUpdated,
  readCurrentOrchestrationBoard,
}: RegisterOrchestrationCancelRunIpcDependencies<Store, Host>): void {
  handleIpc("orchestration:cancel-run", async (_event, raw: CancelOrchestrationRunInput) => {
    const input = orchestrationRunCancelSchema.parse(raw);
    const host = requireProjectRuntimeHostForOrchestrationRun(input.runId);
    const targetStore = host.store;
    const run = targetStore.getOrchestrationRun(input.runId);
    if (!run.threadId) throw new Error("This orchestration run has no active thread to cancel.");
    await requireProjectRuntimeHostForThread(run.threadId).runtime.abort(run.threadId);
    targetStore.updateOrchestrationRun({
      id: run.id,
      status: "canceled",
      threadId: run.threadId,
      error: "Canceled by user.",
      finish: true,
    });
    emitOrchestrationUpdated(host.workspacePath);
    return readCurrentOrchestrationBoard(targetStore);
  });
}

export function registerOrchestrationRevealWorkspaceIpc({
  handleIpc,
  requireProjectRuntimeHostForOrchestrationWorkspace,
  openPath,
}: RegisterOrchestrationRevealWorkspaceIpcDependencies): void {
  handleIpc("orchestration:reveal-workspace", async (_event, raw: RevealOrchestrationWorkspaceInput) => {
    const input = orchestrationWorkspaceRevealSchema.parse(raw);
    requireProjectRuntimeHostForOrchestrationWorkspace(input.workspacePath);
    const error = await openPath(input.workspacePath);
    if (error) throw new Error(error);
  });
}

export function registerOrchestrationAutoDispatchIpc({
  handleIpc,
  readAutoDispatchStatus,
  setAutoDispatchEnabled,
}: RegisterOrchestrationAutoDispatchIpcDependencies): void {
  handleIpc("orchestration:auto-status", () => readAutoDispatchStatus());

  handleIpc("orchestration:set-auto-dispatch", async (_event, raw: SetOrchestrationAutoDispatchInput) =>
    setAutoDispatchEnabled(orchestrationAutoDispatchSchema.parse(raw)),
  );
}
