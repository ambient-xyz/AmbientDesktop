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
} from "./registerAmbientIpc";
import { clipboardIpcChannels } from "./registerClipboardIpc";
import { linksOpenExternalIpcChannels } from "./registerLinksIpc";
import {
  registerShellIntegrationDomainIpc,
  shellIntegrationDomainIpcChannels,
  type RegisterShellIntegrationDomainIpcDependencies,
} from "./registerShellIntegrationDomainIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerShellIntegrationDomainIpc", () => {
  it("registers shell integration channels in the previous main registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...shellIntegrationDomainIpcChannels]);
    expect([...shellIntegrationDomainIpcChannels]).toEqual([
      ...ambientOpenKeysIpcChannels,
      ...linksOpenExternalIpcChannels,
      ...clipboardIpcChannels,
      ...ambientApiKeyIpcChannels,
      ...ambientSecureStorageIpcChannels,
    ]);
  });

  it("routes external links, ambient keys, and clipboard actions through existing adapters", async () => {
    const { deps, invoke } = registerWithFakes({
      loopback: true,
      clipboardText: "copied text",
      ambientKeysUrl: "https://example.com/keys",
    });

    await expect(invoke("ambient:open-keys")).resolves.toBeUndefined();
    await expect(invoke("links:open-external", " http://localhost:5173/app ")).resolves.toBeUndefined();
    await expect(invoke("clipboard:read-text")).resolves.toBe("copied text");
    await expect(invoke("clipboard:write-text", "write me")).resolves.toBeUndefined();

    expect(deps.openAllowedExternalUrl).toHaveBeenCalledWith("https://example.com/keys", "ambient-keys");
    expect(deps.parseExternalOpenUrl).toHaveBeenCalledWith(" http://localhost:5173/app ");
    expect(deps.openRendererLocalUrlInAmbientBrowser).toHaveBeenCalledWith("http://localhost:5173/app");
    expect(deps.readClipboardText).toHaveBeenCalledOnce();
    expect(deps.writeClipboardText).toHaveBeenCalledWith("write me");
  });

  it("routes Ambient API key mutations through provider refresh dependencies", async () => {
    const provider = sampleProviderStatus();
    const { deps, invoke } = registerWithFakes({ provider });

    await expect(invoke("ambient:save-api-key", "dummy-key")).resolves.toEqual(provider);
    await expect(invoke("ambient:clear-api-key")).resolves.toEqual(provider);
    await expect(invoke("ambient:test-api-key", "dummy-key")).resolves.toEqual({ ok: true, message: "connected" });

    expect(deps.saveAmbientApiKey).toHaveBeenCalledWith("dummy-key");
    expect(deps.clearSavedAmbientApiKey).toHaveBeenCalledOnce();
    expect(deps.resetRuntimeAndPluginServers).toHaveBeenCalledTimes(2);
    expect(deps.readCurrentSettingsModel).toHaveBeenCalledTimes(2);
    expect(deps.getAmbientProviderStatus).toHaveBeenCalledWith("ambient-model");
    expect(deps.emitProviderUpdated).toHaveBeenCalledTimes(2);
    expect(deps.testAmbientApiKey).toHaveBeenCalledWith("dummy-key");
  });

  it("routes secure storage and named secret channels through storage dependencies", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("secure-storage:refresh")).resolves.toEqual({
      status: expect.objectContaining({ status: "ready" }),
      guidance: expect.objectContaining({ retryLabel: "Retry" }),
    });
    await expect(invoke("named-secrets:save", { label: "Fixture", value: "secret-value" })).resolves.toEqual([]);
    await expect(invoke("named-secrets:broker-local-fixture", { id: "secret-id", purpose: "test", target: "local-fixture" })).resolves.toMatchObject({
      delivered: true,
    });

    expect(deps.saveNamedSecret).toHaveBeenCalledWith({ label: "Fixture", value: "secret-value" });
    expect(deps.brokerNamedSecretToLocalFixture).toHaveBeenCalledWith({ id: "secret-id", purpose: "test", target: "local-fixture" });
  });
});

function registerWithFakes({
  ambientKeysUrl = "https://example.com/ambient-keys",
  clipboardText = "clipboard text",
  googleWorkspaceSetup = false,
  loopback = false,
  provider = sampleProviderStatus(),
  testResult = { ok: true, message: "connected" },
}: {
  ambientKeysUrl?: string;
  clipboardText?: string;
  googleWorkspaceSetup?: boolean;
  loopback?: boolean;
  provider?: ProviderStatus;
  testResult?: AmbientApiKeyTestResult;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterShellIntegrationDomainIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    ambientKeysUrl,
    openAllowedExternalUrl: vi.fn(async () => undefined),
    parseExternalOpenUrl: vi.fn((raw: string) => raw.trim()),
    isGoogleWorkspaceSetupUrl: vi.fn(() => googleWorkspaceSetup),
    openGoogleWorkspaceUrl: vi.fn(async () => undefined),
    isLoopbackWebUrl: vi.fn(() => loopback),
    openRendererLocalUrlInAmbientBrowser: vi.fn(async () => undefined),
    readClipboardText: vi.fn(() => clipboardText),
    writeClipboardText: vi.fn(),
    saveAmbientApiKey: vi.fn(),
    clearSavedAmbientApiKey: vi.fn(),
    testAmbientApiKey: vi.fn(async () => testResult),
    resetRuntimeAndPluginServers: vi.fn(),
    readCurrentSettingsModel: vi.fn(() => "ambient-model"),
    getAmbientProviderStatus: vi.fn(() => provider),
    emitProviderUpdated: vi.fn(),
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
  registerShellIntegrationDomainIpc(deps);

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
