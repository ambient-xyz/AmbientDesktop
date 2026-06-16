import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import { ambientCliSaveSecretIpcChannels } from "./registerAmbientCliIpc";
import {
  ambientCliSecretDomainIpcChannels,
  registerAmbientCliSecretDomainIpc,
  type AmbientCliPackageForSecret,
} from "./registerAmbientCliSecretDomainIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerAmbientCliSecretDomainIpc", () => {
  it("registers Ambient CLI secret channels in the previous main registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...ambientCliSecretDomainIpcChannels]);
    expect([...ambientCliSecretDomainIpcChannels]).toEqual([...ambientCliSaveSecretIpcChannels]);
  });

  it("routes MCP server secrets through the active workspace secret store", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(
      invoke("ambient-cli:save-secret", {
        packageName: "MCP Display",
        mcpServerId: "io.github.example/server",
        envName: "MCP_TOKEN",
        value: "dummy-secret-value",
      }),
    ).resolves.toEqual({
      packageName: "MCP Display",
      mcpServerId: "io.github.example/server",
      ownerId: "server:io.github.example/server",
      envName: "MCP_TOKEN",
      source: "managed-secret",
      secretRef: "ambient-secret-ref:v1:mcp",
      configured: true,
    });

    expect(deps.activeWorkspaceFileContextForProjectHost).toHaveBeenCalledOnce();
    expect(deps.saveMcpServerEnvSecret).toHaveBeenCalledWith("/workspace", {
      serverId: "io.github.example/server",
      envName: "MCP_TOKEN",
      value: "dummy-secret-value",
    });
    expect(JSON.stringify(vi.mocked(deps.saveMcpServerEnvSecret).mock.results)).not.toContain("dummy-secret-value");
  });

  it("routes capability builder secrets through builder package secret storage", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(
      invoke("ambient-cli:save-secret", {
        packageName: "voice-builder",
        builderSourcePath: "capabilities/voice-builder",
        envName: "VOICE_API_KEY",
        value: "dummy-secret-value",
      }),
    ).resolves.toEqual({
      packageName: "voice-builder",
      builderSourcePath: "capabilities/voice-builder",
      envName: "VOICE_API_KEY",
      source: "managed-secret",
      secretRef: "ambient-secret-ref:v1:builder",
      configured: true,
    });

    expect(deps.saveCapabilityBuilderEnvSecret).toHaveBeenCalledWith("/workspace", {
      path: "capabilities/voice-builder",
      packageName: "voice-builder",
      envName: "VOICE_API_KEY",
      value: "dummy-secret-value",
    });
    expect(deps.discoverAmbientCliPackages).not.toHaveBeenCalled();
  });

  it("selects a package, verifies the declared env requirement, and saves package env secrets", async () => {
    const { deps, invoke, selectedPackage } = registerWithFakes();

    await expect(
      invoke("ambient-cli:save-secret", {
        packageId: "pkg-1",
        envName: "PACKAGE_TOKEN",
        value: "dummy-secret-value",
      }),
    ).resolves.toEqual({
      packageId: "pkg-1",
      packageName: "package-one",
      envName: "PACKAGE_TOKEN",
      source: "managed-secret",
      secretRef: "ambient-secret-ref:v1:package",
      configured: true,
    });

    expect(deps.discoverAmbientCliPackages).toHaveBeenCalledWith("/workspace");
    expect(deps.selectAmbientCliPackageForSecret).toHaveBeenCalledWith([selectedPackage], {
      packageId: "pkg-1",
      packageName: undefined,
    });
    expect(deps.saveAmbientCliPackageEnvSecret).toHaveBeenCalledWith("/workspace", {
      packageName: "package-one",
      envName: "PACKAGE_TOKEN",
      value: "dummy-secret-value",
    });
  });

  it("rejects package secret saves when the selected package does not declare the env requirement", async () => {
    const { deps, invoke } = registerWithFakes({
      selectedPackage: {
        id: "pkg-1",
        name: "package-one",
        envRequirements: [{ name: "OTHER_ENV" }],
      },
    });

    await expect(
      invoke("ambient-cli:save-secret", {
        packageId: "pkg-1",
        envName: "PACKAGE_TOKEN",
        value: "dummy-secret-value",
      }),
    ).rejects.toThrow('Ambient CLI package "package-one" does not declare env requirement "PACKAGE_TOKEN".');

    expect(deps.saveAmbientCliPackageEnvSecret).not.toHaveBeenCalled();
  });
});

function registerWithFakes({
  selectedPackage = sampleAmbientCliPackage(),
}: {
  selectedPackage?: AmbientCliPackageForSecret;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    activeWorkspaceFileContextForProjectHost: vi.fn(() => ({ workspacePath: "/workspace" })),
    discoverAmbientCliPackages: vi.fn(async () => ({ packages: [selectedPackage] })),
    handleIpc: (channel: string, listener: IpcListener) => handlers.set(channel, listener),
    saveAmbientCliPackageEnvSecret: vi.fn(async () => ({
      name: "PACKAGE_TOKEN",
      source: "managed-secret",
      secretRef: "ambient-secret-ref:v1:package",
      configured: true,
    })),
    saveCapabilityBuilderEnvSecret: vi.fn(async () => ({
      packageName: "voice-builder",
      relativeRootPath: "capabilities/voice-builder",
      envName: "VOICE_API_KEY",
      source: "managed-secret" as const,
      secretRef: "ambient-secret-ref:v1:builder",
      configured: true,
    })),
    saveMcpServerEnvSecret: vi.fn(async () => ({
      ownerId: "server:io.github.example/server",
      serverId: "io.github.example/server",
      envName: "MCP_TOKEN",
      secretRef: "ambient-secret-ref:v1:mcp",
      configured: true,
    })),
    selectAmbientCliPackageForSecret: vi.fn(() => selectedPackage),
  };

  registerAmbientCliSecretDomainIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    selectedPackage,
  };
}

function sampleAmbientCliPackage(): AmbientCliPackageForSecret {
  return {
    id: "pkg-1",
    name: "package-one",
    envRequirements: [{ name: "PACKAGE_TOKEN" }],
  };
}
