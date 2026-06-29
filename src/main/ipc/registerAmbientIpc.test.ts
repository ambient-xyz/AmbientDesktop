import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  AmbientApiKeyTestResult,
  ProviderStatus,
} from "../../shared/desktopTypes";
import type { BrokerNamedSecretUseResult, NamedSecretMetadataExport } from "../../shared/namedSecretTypes";
import type { SecureStorageRepairGuidance, SecureStorageStatus } from "../../shared/secureStorageTypes";
import {
  ambientApiKeyIpcChannels,
  ambientOpenKeysIpcChannels,
  ambientSecureStorageIpcChannels,
  registerAmbientApiKeyIpc,
  registerAmbientOpenKeysIpc,
  registerAmbientSecureStorageIpc,
  type RegisterAmbientApiKeyIpcDependencies,
  type RegisterAmbientOpenKeysIpcDependencies,
  type RegisterAmbientSecureStorageIpcDependencies,
} from "./registerAmbientIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerAmbientOpenKeysIpc", () => {
  it("registers the ambient open keys channel", () => {
    const { handlers } = registerOpenKeysWithFakes();

    expect([...handlers.keys()]).toEqual([...ambientOpenKeysIpcChannels]);
  });

  it("opens the ambient keys URL through the external URL policy", async () => {
    const { deps, invoke } = registerOpenKeysWithFakes({
      ambientKeysUrl: "https://example.com/keys",
    });

    await expect(invoke("ambient:open-keys")).resolves.toBeUndefined();

    expect(deps.openAllowedExternalUrl).toHaveBeenCalledWith("https://example.com/keys", "ambient-keys");
  });
});

describe("registerAmbientApiKeyIpc", () => {
  it("registers the ambient API key channels", () => {
    const { handlers } = registerApiKeyWithFakes();

    expect([...handlers.keys()]).toEqual([...ambientApiKeyIpcChannels]);
  });

  it("saves a parsed API key, resets runtimes, emits provider status, and returns it", async () => {
    const { deps, invoke, provider } = registerApiKeyWithFakes();

    await expect(invoke("ambient:save-api-key", "dummy-key")).resolves.toEqual(provider);

    expect(deps.saveAmbientApiKey).toHaveBeenCalledWith("dummy-key");
    expect(deps.resetRuntimeAndPluginServers).toHaveBeenCalledOnce();
    expect(deps.readCurrentSettingsModel).toHaveBeenCalledOnce();
    expect(deps.getAmbientProviderStatus).toHaveBeenCalledWith("ambient-model");
    expect(deps.emitProviderUpdated).toHaveBeenCalledWith(provider);
    expect(deps.refreshAmbientModelDiscovery).toHaveBeenCalledOnce();
  });

  it("rejects non-string API key saves before mutating provider state", () => {
    const { deps, invoke } = registerApiKeyWithFakes();

    expect(() => invoke("ambient:save-api-key", 42)).toThrow();

    expect(deps.saveAmbientApiKey).not.toHaveBeenCalled();
    expect(deps.resetRuntimeAndPluginServers).not.toHaveBeenCalled();
    expect(deps.emitProviderUpdated).not.toHaveBeenCalled();
    expect(deps.refreshAmbientModelDiscovery).not.toHaveBeenCalled();
  });

  it("clears the saved API key, resets runtimes, emits provider status, and returns it", async () => {
    const { deps, invoke, provider } = registerApiKeyWithFakes();

    await expect(invoke("ambient:clear-api-key")).resolves.toEqual(provider);

    expect(deps.clearSavedAmbientApiKey).toHaveBeenCalledOnce();
    expect(deps.resetRuntimeAndPluginServers).toHaveBeenCalledOnce();
    expect(deps.emitProviderUpdated).toHaveBeenCalledWith(provider);
    expect(deps.refreshAmbientModelDiscovery).toHaveBeenCalledOnce();
  });

  it("delegates API key tests without mutating provider state", async () => {
    const { deps, invoke } = registerApiKeyWithFakes();

    await expect(invoke("ambient:test-api-key", "dummy-key")).resolves.toEqual({
      ok: true,
      message: "connected",
    });
    await expect(invoke("ambient:test-api-key")).resolves.toEqual({
      ok: true,
      message: "connected",
    });

    expect(deps.testAmbientApiKey).toHaveBeenNthCalledWith(1, "dummy-key");
    expect(deps.testAmbientApiKey).toHaveBeenNthCalledWith(2, undefined);
    expect(deps.resetRuntimeAndPluginServers).not.toHaveBeenCalled();
    expect(deps.emitProviderUpdated).not.toHaveBeenCalled();
  });
});

describe("registerAmbientSecureStorageIpc", () => {
  it("registers secure storage and named secret channels", () => {
    const { handlers } = registerSecureStorageWithFakes();

    expect([...handlers.keys()]).toEqual([...ambientSecureStorageIpcChannels]);
  });

  it("parses named secret operations before delegating", async () => {
    const { deps, invoke } = registerSecureStorageWithFakes();

    await expect(invoke("secure-storage:refresh")).resolves.toMatchObject({
      status: { status: "ready" },
    });
    await expect(invoke("named-secrets:save", { label: "Fixture", value: "secret", kind: "login", scope: "workspace" })).resolves.toEqual([]);
    await expect(invoke("named-secrets:update", { id: "secret-id", label: "Updated" })).resolves.toEqual([]);
    await expect(invoke("named-secrets:delete", { id: "secret-id" })).resolves.toEqual([]);
    await expect(invoke("named-secrets:export-metadata")).resolves.toMatchObject({ secrets: [] });

    expect(deps.saveNamedSecret).toHaveBeenCalledWith({ label: "Fixture", value: "secret", kind: "login", scope: "workspace" });
    expect(deps.updateNamedSecret).toHaveBeenCalledWith({ id: "secret-id", label: "Updated" });
    expect(deps.deleteNamedSecret).toHaveBeenCalledWith({ id: "secret-id" });
  });

  it("rejects invalid named secret IPC inputs before delegating", () => {
    const { deps, invoke } = registerSecureStorageWithFakes();

    expect(() => invoke("named-secrets:save", { label: "", value: "secret" })).toThrow();
    expect(() => invoke("named-secrets:broker-local-fixture", { id: "secret-id", purpose: "test", target: "chat" })).toThrow();

    expect(deps.saveNamedSecret).not.toHaveBeenCalled();
    expect(deps.brokerNamedSecretToLocalFixture).not.toHaveBeenCalled();
  });
});

function registerOpenKeysWithFakes({
  ambientKeysUrl = "https://example.com/ambient-keys",
}: {
  ambientKeysUrl?: string;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterAmbientOpenKeysIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    ambientKeysUrl,
    openAllowedExternalUrl: vi.fn(async () => undefined),
  };
  registerAmbientOpenKeysIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerSecureStorageWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterAmbientSecureStorageIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    refreshSecureStorageStatus: vi.fn((): { status: SecureStorageStatus; guidance: SecureStorageRepairGuidance } => ({
      status: {
        status: "ready",
        platform: "darwin",
        backend: "keychain",
        security: "os-encrypted",
        message: "ready",
      },
      guidance: {
        platform: "darwin",
        summary: "ready",
        commands: [],
        retryLabel: "Retry",
      },
    })),
    saveNamedSecret: vi.fn(async () => []),
    updateNamedSecret: vi.fn(async () => []),
    deleteNamedSecret: vi.fn(async () => []),
    brokerNamedSecretToLocalFixture: vi.fn(async (): Promise<BrokerNamedSecretUseResult> => ({
      schemaVersion: "ambient-named-secret-broker-result-v1",
      id: "secret-id",
      label: "Fixture",
      scope: "workspace",
      target: "local-fixture",
      purpose: "test",
      approved: true,
      delivered: true,
      redactedEvidence: "redacted",
      usedAt: "2026-06-20T00:00:00.000Z",
    })),
    exportNamedSecretMetadata: vi.fn(async (): Promise<NamedSecretMetadataExport> => ({
      schemaVersion: "ambient-named-secret-metadata-export-v1",
      exportedAt: "2026-06-20T00:00:00.000Z",
      secrets: [],
    })),
  };
  registerAmbientSecureStorageIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerApiKeyWithFakes({
  provider = sampleProviderStatus(),
  testResult = { ok: true, message: "connected" },
}: {
  provider?: ProviderStatus;
  testResult?: AmbientApiKeyTestResult;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterAmbientApiKeyIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    saveAmbientApiKey: vi.fn(),
    clearSavedAmbientApiKey: vi.fn(),
    testAmbientApiKey: vi.fn(async () => testResult),
    resetRuntimeAndPluginServers: vi.fn(),
    readCurrentSettingsModel: vi.fn(() => "ambient-model"),
    getAmbientProviderStatus: vi.fn(() => provider),
    emitProviderUpdated: vi.fn(),
    refreshAmbientModelDiscovery: vi.fn(),
  };
  registerAmbientApiKeyIpc(deps);

  return {
    deps,
    handlers,
    provider,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function sampleProviderStatus(): ProviderStatus {
  return {
    providerId: "ambient",
    providerLabel: "Ambient",
    debugOverride: false,
    baseUrl: "https://api.ambient.xyz/v1",
    model: "ambient-model",
    hasApiKey: true,
    source: "saved",
    storage: "os-encrypted",
  };
}
