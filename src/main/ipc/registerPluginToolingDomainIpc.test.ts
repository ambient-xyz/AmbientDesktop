import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import {
  pluginToolingDomainIpcChannels,
  registerPluginToolingDomainIpc,
  type RegisterPluginToolingDomainIpcDependencies,
} from "./registerPluginToolingDomainIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerPluginToolingDomainIpc", () => {
  it("registers the plugin/tooling domain channel table", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginToolingDomainIpcChannels]);
  });

  it("routes plugin discovery through the active project store", async () => {
    const { catalog, deps, host, invoke } = registerWithFakes();

    await expect(invoke("plugins:discover")).resolves.toBe(catalog);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.readCodexPluginCatalog).toHaveBeenCalledWith(host.store);
  });

  it("routes MCP registry search through the install catalog", async () => {
    const { deps, invoke, searchRegistryServers, searchResults } = registerWithFakes();

    await expect(invoke("mcp:registry-search", { query: "browser", limit: 5 })).resolves.toBe(searchResults);

    expect(deps.createMcpInstallCatalog).toHaveBeenCalledOnce();
    expect(searchRegistryServers).toHaveBeenCalledWith({ query: "browser", limit: 5 });
  });
});

function registerWithFakes(): {
  catalog: { plugins: unknown[] };
  deps: RegisterPluginToolingDomainIpcDependencies;
  handlers: Map<string, IpcListener>;
  host: { workspacePath: string; store: Record<string, unknown> };
  invoke(channel: string, raw?: unknown): Promise<unknown>;
  searchRegistryServers: ReturnType<typeof vi.fn>;
  searchResults: Array<{ id: string }>;
} {
  const handlers = new Map<string, IpcListener>();
  const catalog = { plugins: [] };
  const searchResults = [{ id: "server-1" }];
  const searchRegistryServers = vi.fn(() => searchResults);
  const host = {
    workspacePath: "/tmp/workspace",
    store: {
      getThread: vi.fn(() => ({ permissionMode: "workspace" })),
      setPluginEnabled: vi.fn(),
      setPluginTrusted: vi.fn(),
    },
  };
  const deps: RegisterPluginToolingDomainIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    acceptMcpToolDescriptorReviewForDesktop: vi.fn(),
    activeThreadId: "thread-1",
    activeThreadIdForHost: vi.fn(() => "thread-1"),
    allPluginMcpRuntimeSnapshots: vi.fn(() => []),
    ambientMcpInstallPreview: vi.fn((input) => input),
    app: { getPath: vi.fn(() => "/tmp/user-data") },
    buildContainerRuntimeInstallPlanFromProbe: vi.fn(),
    codexPluginTrustFingerprint: vi.fn(() => "fingerprint"),
    createMcpInstallCatalog: vi.fn(() => ({
      catalog: {
        searchRegistryServers,
        previewRegistryInstall: vi.fn(),
        listInstalledServers: vi.fn(() => []),
      },
      toolHive: {},
    })),
    createPrivilegedActionAdapter: vi.fn(),
    dialog: { showOpenDialog: vi.fn() },
    discoverCapabilityBuilderHistory: vi.fn(),
    emitMainWindowDesktopEvent: vi.fn(),
    executeContainerRuntimeManagedInstallAction: vi.fn(),
    googleWorkspaceCliInstaller: { install: vi.fn() },
    googleWorkspaceSetupService: {
      cancel: vi.fn(),
      forgetAccount: vi.fn(),
      importOAuthClientConfig: vi.fn(),
      start: vi.fn(),
      state: vi.fn(),
      validate: vi.fn(),
    },
    installMcpDefaultCapabilityForDesktop: vi.fn(),
    installMcpRegistryServerForDesktop: vi.fn(),
    launchContainerRuntimeInstallAction: vi.fn(),
    listManagedDevServers: vi.fn(() => []),
    mcpContainerRuntimeSetupStatePath: vi.fn(() => "/tmp/setup-state.json"),
    openAllowedExternalUrl: vi.fn(),
    openContainerRuntimeApplication: vi.fn(),
    packageJson: { version: "0.0.0-test" },
    permissions: { request: vi.fn() },
    pluginHost: {
      addCodexMarketplace: vi.fn(),
      completePluginAppAuth: vi.fn(),
      disconnectPluginAuthAccount: vi.fn(),
      getCapabilityDiagnostics: vi.fn(),
      importCodexPlugin: vi.fn(),
      inspectCodexPluginMcp: vi.fn(),
      installCodexPluginDependencies: vi.fn(),
      listRuntimeCapabilities: vi.fn(),
      readCodexPlugin: vi.fn(),
      removeCodexMarketplace: vi.fn(),
      restartPluginMcpRuntime: vi.fn(),
      revokePluginAuthAccount: vi.fn(),
      startPluginAppAuth: vi.fn(),
      stopPluginMcpRuntime: vi.fn(),
      testPluginAuthAccount: vi.fn(),
      uninstallCodexPlugin: vi.fn(),
    },
    pluginStateReaderForStore: vi.fn(() => ({ plugins: [] })),
    privilegedActionAdapterSelectionFromEnv: vi.fn(),
    privilegedCredentials: { request: vi.fn() },
    probeAmbientMcpContainerRuntimeStatus: vi.fn(),
    probeContainerRuntime: vi.fn(),
    readAmbientPluginRegistry: vi.fn(),
    readCodexHostedMarketplaceReport: vi.fn(),
    readCodexPluginCatalog: vi.fn(() => catalog),
    readFirstPartyGoogleIntegration: vi.fn(),
    recordContainerRuntimeDeferred: vi.fn(),
    recordContainerRuntimeInstallLaunched: vi.fn(),
    redactGoogleWorkspaceSetupState: vi.fn((state) => state),
    refreshGoogleWorkspaceConnectorMode: vi.fn(),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    resetProjectRuntimeAndPluginServers: vi.fn(),
    resetRuntimeAndPluginServers: vi.fn(),
    restartProjectRuntimeMcpRuntime: vi.fn(),
    stopManagedDevServer: vi.fn(),
    stopProjectRuntimeMcpRuntime: vi.fn(),
    uninstallMcpServerForDesktop: vi.fn(),
    writeContainerRuntimeManagedInstallRedactedLog: vi.fn(),
    writePrivilegedActionRedactedLog: vi.fn(),
  };

  registerPluginToolingDomainIpc(deps);

  return {
    catalog,
    deps,
    handlers,
    host,
    invoke: (channel, raw) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
    searchRegistryServers,
    searchResults,
  };
}
