import type { IpcMain } from "electron";

import {
  registerWorkflowLabIpc,
  registerWorkflowRecorderIpc,
  workflowLabIpcChannels,
  workflowRecorderIpcChannels,
} from "./registerWorkflowIpc";
import type {
  ModelRuntimeSettings,
  StartWorkflowLabRunInput,
  WorkflowLabJudgeResult,
  WorkflowLabRun,
} from "../../shared/types";
import type { AmbientRetryPolicy } from "../aggressiveRetries";
import type {
  RunWorkflowLabOptions,
  WorkflowLabJudgeInput,
} from "../workflowLab";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const workflowRecordingLabDomainIpcChannels = [
  ...workflowRecorderIpcChannels,
  ...workflowLabIpcChannels,
] as const;

export interface WorkflowRecordingLabProviderStatus {
  model?: string;
  baseUrl?: string;
}

export interface WorkflowRecordingLabStore {
  getDefaultSettings(): { model: string };
  getModelRuntimeSettings(): ModelRuntimeSettings;
}

export interface WorkflowRecordingLabHost<Store extends WorkflowRecordingLabStore = WorkflowRecordingLabStore> {
  activeThreadId: string;
  store: Store;
}

export interface WorkflowRecordingLabJudgeProvider {
  judge(input: WorkflowLabJudgeInput): MaybePromise<WorkflowLabJudgeResult>;
}

export type WorkflowRecordingLabJudgeProviderConstructor = new (input: {
  model?: string;
  baseUrl?: string;
  idleTimeoutMs?: number;
  retryPolicy?: AmbientRetryPolicy;
}) => WorkflowRecordingLabJudgeProvider;

export interface RegisterWorkflowRecordingLabDomainIpcDependencies extends Record<string, any> {
  AmbientWorkflowLabJudgeProvider: WorkflowRecordingLabJudgeProviderConstructor;
  ambientRetryPolicyFromSettings(input: { modelRuntime: ModelRuntimeSettings }): AmbientRetryPolicy;
  getAmbientProviderStatus(model: string): WorkflowRecordingLabProviderStatus;
  handleIpc: HandleIpc;
  runWorkflowLab(
    store: WorkflowRecordingLabStore,
    runId: string,
    options?: RunWorkflowLabOptions,
  ): MaybePromise<WorkflowLabRun>;
}

export function registerWorkflowRecordingLabDomainIpc({
  AmbientWorkflowLabJudgeProvider,
  ambientRetryPolicyFromSettings,
  getAmbientProviderStatus,
  handleIpc,
  runWorkflowLab,
  ...deps
}: RegisterWorkflowRecordingLabDomainIpcDependencies): void {
  registerWorkflowRecorderIpc<any, any, any>({
    ...deps,
    handleIpc,
  } as any);

  registerWorkflowLabIpc<any, any>({
    ...deps,
    handleIpc,
    startWorkflowLabRun: (host: WorkflowRecordingLabHost, input: StartWorkflowLabRunInput) => {
      const modelRuntime = host.store.getModelRuntimeSettings();
      const provider = getAmbientProviderStatus(host.store.getDefaultSettings().model);
      const judgeProvider = new AmbientWorkflowLabJudgeProvider({
        model: provider.model,
        baseUrl: provider.baseUrl,
        idleTimeoutMs: modelRuntime.providerStreamIdleTimeoutMs,
        retryPolicy: modelRuntime.aggressiveRetries ? ambientRetryPolicyFromSettings({ modelRuntime }) : undefined,
      });
      return runWorkflowLab(host.store, input.runId, {
        judge: (judgeInput) => judgeProvider.judge(judgeInput),
      });
    },
  } as any);
}
