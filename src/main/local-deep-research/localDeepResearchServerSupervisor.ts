import { resolve } from "node:path";
import type { LocalDeepResearchManagedAssetDetection } from "./localDeepResearchManagedAssets";
import type { LocalDeepResearchSetupContract } from "./localDeepResearchSetup";
import type { LocalLlamaServerAcquireInput } from "../local-llama/localLlamaServerSupervisor";

const localDeepResearchServerStateRoot = ".ambient/local-deep-research/server";

export interface LocalDeepResearchLlamaServerAcquireInput {
  workspacePath: string;
  setup: LocalDeepResearchSetupContract;
  managedAssets: LocalDeepResearchManagedAssetDetection;
  stateRootPath?: string;
  ownerThreadId?: string;
  host?: string;
  port?: number;
  gpuLayers?: number;
  startupTimeoutMs?: number;
  idleTimeoutMs?: number;
  offline?: boolean;
  extraArgs?: string[];
  env?: NodeJS.ProcessEnv;
  allowBlockedSetup?: boolean;
}

export function buildLocalDeepResearchLlamaServerAcquireInput(
  input: LocalDeepResearchLlamaServerAcquireInput,
): LocalLlamaServerAcquireInput {
  if (input.setup.status !== "ready" && !input.allowBlockedSetup) {
    throw new Error(`Local Deep Research setup must be ready before starting llama-server; current status is ${input.setup.status}.`);
  }
  if (input.managedAssets.model.status !== "present") {
    throw new Error(input.managedAssets.model.reason ?? "Selected LiteResearcher model is not present in the Ambient-managed model cache.");
  }
  if (input.managedAssets.model.profileId !== input.setup.modelInstall.selectedProfileId) {
    throw new Error(`Managed model cache profile ${input.managedAssets.model.profileId} does not match selected setup profile ${input.setup.modelInstall.selectedProfileId}.`);
  }
  if (input.managedAssets.runtime.status !== "present" || !input.managedAssets.runtime.binaryPath) {
    throw new Error(input.managedAssets.runtime.reason ?? "Shared Ambient-managed llama.cpp runtime is not present.");
  }
  return {
    profileId: input.setup.modelInstall.selectedProfileId,
    runtimeBinaryPath: input.managedAssets.runtime.binaryPath,
    modelPath: input.managedAssets.model.cachePath,
    stateRootPath: input.stateRootPath ?? localDeepResearchServerStateRootPath(input.workspacePath),
    contextTokens: input.setup.modelInstall.contextTokens,
    ...(input.ownerThreadId ? { ownerThreadId: input.ownerThreadId } : {}),
    ...(input.host ? { host: input.host } : {}),
    ...(input.port !== undefined ? { port: input.port } : {}),
    ...(input.gpuLayers !== undefined ? { gpuLayers: input.gpuLayers } : {}),
    ...(input.startupTimeoutMs !== undefined ? { startupTimeoutMs: input.startupTimeoutMs } : {}),
    ...(input.idleTimeoutMs !== undefined ? { idleTimeoutMs: input.idleTimeoutMs } : {}),
    ...(input.offline !== undefined ? { offline: input.offline } : {}),
    ...(input.extraArgs ? { extraArgs: input.extraArgs } : {}),
    ...(input.env ? { env: input.env } : {}),
  };
}

export function localDeepResearchServerStateRootPath(workspacePath: string): string {
  return resolve(workspacePath, localDeepResearchServerStateRoot);
}
