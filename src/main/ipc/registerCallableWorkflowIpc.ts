import type { IpcMain } from "electron";
import { z } from "zod";

import { isAmbientSubagentsEnabled, type AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const callableWorkflowIpcChannels = [
  "callable-workflow:cancel-task",
  "callable-workflow:pause-task",
  "callable-workflow:resume-task",
] as const;

export interface CallableWorkflowRuntime {
  cancelCallableWorkflowTask(input: { taskId: string; reason?: string }): MaybePromise<unknown>;
  pauseCallableWorkflowTask(input: { taskId: string; reason?: string }): MaybePromise<unknown>;
  resumeCallableWorkflowTask(input: { taskId: string }): MaybePromise<unknown>;
}

export interface CallableWorkflowHost<Store> {
  store: Store;
  runtime: CallableWorkflowRuntime;
}

export interface RegisterCallableWorkflowIpcDependencies<
  Store,
  Host extends CallableWorkflowHost<Store>,
> {
  handleIpc: HandleIpc;
  requireProjectRuntimeHostForCallableWorkflowTask(taskId: string): Host;
  getFeatureFlagSnapshot(store: Store): AmbientFeatureFlagSnapshot;
}

const cancelCallableWorkflowTaskSchema = z.object({
  taskId: z.string().min(1),
  reason: z.string().trim().max(1000).optional(),
});

const pauseCallableWorkflowTaskSchema = z.object({
  taskId: z.string().min(1),
  reason: z.string().trim().max(1000).optional(),
});

const resumeCallableWorkflowTaskSchema = z.object({
  taskId: z.string().min(1),
});

function assertCallableWorkflowControlsEnabled<Store>(
  host: CallableWorkflowHost<Store>,
  getFeatureFlagSnapshot: (store: Store) => AmbientFeatureFlagSnapshot,
): void {
  if (!isAmbientSubagentsEnabled(getFeatureFlagSnapshot(host.store))) {
    throw new Error("Callable workflow task controls are disabled while ambient.subagents is off.");
  }
}

export function registerCallableWorkflowIpc<
  Store,
  Host extends CallableWorkflowHost<Store>,
>({
  handleIpc,
  requireProjectRuntimeHostForCallableWorkflowTask,
  getFeatureFlagSnapshot,
}: RegisterCallableWorkflowIpcDependencies<Store, Host>): void {
  handleIpc("callable-workflow:cancel-task", (_event, raw: unknown) => {
    const input = cancelCallableWorkflowTaskSchema.parse(raw);
    const host = requireProjectRuntimeHostForCallableWorkflowTask(input.taskId);
    assertCallableWorkflowControlsEnabled(host, getFeatureFlagSnapshot);
    return host.runtime.cancelCallableWorkflowTask({
      taskId: input.taskId,
      reason: input.reason,
    });
  });

  handleIpc("callable-workflow:pause-task", (_event, raw: unknown) => {
    const input = pauseCallableWorkflowTaskSchema.parse(raw);
    const host = requireProjectRuntimeHostForCallableWorkflowTask(input.taskId);
    assertCallableWorkflowControlsEnabled(host, getFeatureFlagSnapshot);
    return host.runtime.pauseCallableWorkflowTask({
      taskId: input.taskId,
      reason: input.reason,
    });
  });

  handleIpc("callable-workflow:resume-task", async (_event, raw: unknown) => {
    const input = resumeCallableWorkflowTaskSchema.parse(raw);
    const host = requireProjectRuntimeHostForCallableWorkflowTask(input.taskId);
    assertCallableWorkflowControlsEnabled(host, getFeatureFlagSnapshot);
    return host.runtime.resumeCallableWorkflowTask({
      taskId: input.taskId,
    });
  });
}
