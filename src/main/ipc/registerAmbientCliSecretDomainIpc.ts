import type { IpcMain } from "electron";

import {
  ambientCliSaveSecretIpcChannels,
  registerAmbientCliSaveSecretIpc,
} from "./registerAmbientCliIpc";
import type {
  AmbientCliSecretSaveResult,
  SaveAmbientCliSecretInput,
} from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const ambientCliSecretDomainIpcChannels = [
  ...ambientCliSaveSecretIpcChannels,
] as const;

export interface AmbientCliSecretWorkspaceContext {
  workspacePath: string;
}

export interface AmbientCliPackageEnvRequirement {
  name: string;
}

export interface AmbientCliPackageForSecret {
  id: string;
  name: string;
  envRequirements: AmbientCliPackageEnvRequirement[];
}

export interface AmbientCliPackageCatalogForSecret {
  packages: AmbientCliPackageForSecret[];
}

export interface AmbientCliPackageEnvSecretStatus {
  name: string;
  source: "file" | string;
  secretRef?: string;
  filePath?: string;
  configured: boolean;
}

export interface CapabilityBuilderEnvSecretStatus {
  packageName: string;
  relativeRootPath: string;
  envName: string;
  source: "file" | "managed-secret";
  secretRef?: string;
  filePath?: string;
  configured: boolean;
}

export interface McpServerEnvSecretStatus {
  ownerId: string;
  serverId?: string;
  candidateId?: string;
  candidateRef?: string;
  envName: string;
  secretRef: string;
  configured: boolean;
}

export interface RegisterAmbientCliSecretDomainIpcDependencies {
  activeWorkspaceFileContextForProjectHost(): AmbientCliSecretWorkspaceContext;
  discoverAmbientCliPackages(workspacePath: string): MaybePromise<AmbientCliPackageCatalogForSecret>;
  handleIpc: HandleIpc;
  saveAmbientCliPackageEnvSecret(
    workspacePath: string,
    input: { packageName: string; envName: string; value: string },
  ): MaybePromise<AmbientCliPackageEnvSecretStatus>;
  saveCapabilityBuilderEnvSecret(
    workspacePath: string,
    input: { path: string; packageName?: string; envName: string; value: string },
  ): MaybePromise<CapabilityBuilderEnvSecretStatus>;
  saveMcpServerEnvSecret(
    workspacePath: string,
    input: { serverId?: string; candidateId?: string; candidateRef?: string; envName: string; value: string },
  ): MaybePromise<McpServerEnvSecretStatus>;
  selectAmbientCliPackageForSecret(
    packages: AmbientCliPackageForSecret[],
    selector: { packageId?: string; packageName?: string },
  ): AmbientCliPackageForSecret;
}

export function registerAmbientCliSecretDomainIpc({
  activeWorkspaceFileContextForProjectHost,
  discoverAmbientCliPackages,
  handleIpc,
  saveAmbientCliPackageEnvSecret,
  saveCapabilityBuilderEnvSecret,
  saveMcpServerEnvSecret,
  selectAmbientCliPackageForSecret,
}: RegisterAmbientCliSecretDomainIpcDependencies): void {
  registerAmbientCliSaveSecretIpc({
    handleIpc,
    saveAmbientCliSecret: async (input) => {
      const workspacePath = activeWorkspaceFileContextForProjectHost().workspacePath;
      if (input.mcpServerId || input.mcpCandidateId || input.mcpCandidateRef) {
        return saveMcpSecret(input, workspacePath, saveMcpServerEnvSecret);
      }
      if (input.builderSourcePath) {
        return saveBuilderSecret(input, workspacePath, saveCapabilityBuilderEnvSecret);
      }
      return savePackageSecret(input, workspacePath, {
        discoverAmbientCliPackages,
        saveAmbientCliPackageEnvSecret,
        selectAmbientCliPackageForSecret,
      });
    },
  });
}

async function saveMcpSecret(
  input: SaveAmbientCliSecretInput,
  workspacePath: string,
  saveMcpServerEnvSecret: RegisterAmbientCliSecretDomainIpcDependencies["saveMcpServerEnvSecret"],
): Promise<AmbientCliSecretSaveResult> {
  const status = await saveMcpServerEnvSecret(workspacePath, {
    ...(input.mcpServerId ? { serverId: input.mcpServerId } : {}),
    ...(input.mcpCandidateId ? { candidateId: input.mcpCandidateId } : {}),
    ...(input.mcpCandidateRef ? { candidateRef: input.mcpCandidateRef } : {}),
    envName: input.envName,
    value: input.value,
  });
  return {
    packageName: input.packageName ?? status.serverId ?? status.candidateId ?? status.candidateRef ?? "MCP server",
    ...(status.serverId ? { mcpServerId: status.serverId } : {}),
    ...(status.candidateId ? { mcpCandidateId: status.candidateId } : {}),
    ...(status.candidateRef ? { mcpCandidateRef: status.candidateRef } : {}),
    ownerId: status.ownerId,
    envName: status.envName,
    source: "managed-secret",
    secretRef: status.secretRef,
    configured: status.configured,
  };
}

async function saveBuilderSecret(
  input: SaveAmbientCliSecretInput,
  workspacePath: string,
  saveCapabilityBuilderEnvSecret: RegisterAmbientCliSecretDomainIpcDependencies["saveCapabilityBuilderEnvSecret"],
): Promise<AmbientCliSecretSaveResult> {
  const status = await saveCapabilityBuilderEnvSecret(workspacePath, {
    path: input.builderSourcePath!,
    ...(input.packageName ? { packageName: input.packageName } : {}),
    envName: input.envName,
    value: input.value,
  });
  return {
    packageName: status.packageName,
    builderSourcePath: status.relativeRootPath,
    envName: status.envName,
    source: status.source,
    secretRef: status.secretRef,
    ...(status.filePath ? { filePath: status.filePath } : {}),
    configured: status.configured,
  };
}

async function savePackageSecret(
  input: SaveAmbientCliSecretInput,
  workspacePath: string,
  deps: Pick<
    RegisterAmbientCliSecretDomainIpcDependencies,
    "discoverAmbientCliPackages" | "saveAmbientCliPackageEnvSecret" | "selectAmbientCliPackageForSecret"
  >,
): Promise<AmbientCliSecretSaveResult> {
  const catalog = await deps.discoverAmbientCliPackages(workspacePath);
  const pkg = deps.selectAmbientCliPackageForSecret(catalog.packages, {
    packageId: input.packageId,
    packageName: input.packageName,
  });
  const requirement = pkg.envRequirements.find((item) => item.name === input.envName);
  if (!requirement) throw new Error(`Ambient CLI package "${pkg.name}" does not declare env requirement "${input.envName}".`);
  const status = await deps.saveAmbientCliPackageEnvSecret(workspacePath, {
    packageName: pkg.name,
    envName: requirement.name,
    value: input.value,
  });
  return {
    packageId: pkg.id,
    packageName: pkg.name,
    envName: status.name,
    source: status.source === "file" ? "file" : "managed-secret",
    ...(status.secretRef ? { secretRef: status.secretRef } : {}),
    ...(status.filePath ? { filePath: status.filePath } : {}),
    configured: status.configured,
  };
}
