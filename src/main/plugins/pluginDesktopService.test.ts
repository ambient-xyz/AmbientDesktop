import { describe, expect, it, vi } from "vitest";
import type { PluginMcpRuntimeSnapshot } from "../../shared/pluginTypes";
import type { AmbientPluginStateReader } from "./pluginHost";
import { createPluginDesktopService, type PluginDesktopHost, type PluginDesktopStore } from "./pluginDesktopService";

class FakeStore implements PluginDesktopStore {
  private readonly revokedGrantIds: string[] = [];

  constructor(
    private readonly input: {
      workspacePath?: string;
      grants?: Array<{ id: string; actionKind: string; targetLabel: string }>;
    } = {},
  ) {}

  get revoked(): string[] {
    return this.revokedGrantIds;
  }

  getWorkspace() {
    return { path: this.input.workspacePath ?? "/workspace/project" };
  }

  listThreads(): unknown[] {
    return [];
  }

  listMessages(): unknown[] {
    return [];
  }

  listPermissionAudit(): unknown[] {
    return [];
  }

  listPermissionGrants(): Array<{ id: string; actionKind: string; targetLabel: string }> {
    return this.input.grants ?? [];
  }

  listContextUsageSnapshots(): unknown[] {
    return [];
  }

  listOrchestrationBoard(): unknown {
    return { cards: [] };
  }

  getSubagentRepairDiagnostics(): unknown {
    return { issues: [] };
  }

  isPluginEnabled(pluginId: string): boolean {
    return pluginId === "enabled-plugin";
  }

  isPluginTrusted(pluginId: string, pluginFingerprint?: string): boolean {
    return pluginId === "trusted-plugin" && pluginFingerprint === "fingerprint";
  }

  isPiPackageEnabled(packageId: string): boolean {
    return packageId === "enabled-package";
  }

  revokePermissionGrant(grantId: string): void {
    this.revokedGrantIds.push(grantId);
  }
}

function createHost(store = new FakeStore()): PluginDesktopHost<FakeStore> {
  return {
    store,
    runtime: {
      tokenizerStatus: vi.fn(() => ({ ok: true })),
      readLocalModelRuntimeStatus: vi.fn((workspacePath: string) => ({ workspacePath })),
    },
  };
}

function createHarness(input: {
  store?: FakeStore;
  host?: PluginDesktopHost<FakeStore>;
  catalogError?: Error;
  registryError?: Error;
  searchError?: Error;
} = {}) {
  const store = input.store ?? new FakeStore();
  const host = input.host ?? createHost(store);
  const codexCatalog = { plugins: [{ id: "plugin-1" }] };
  const hostedMarketplace = { marketplaces: [] };
  const registry = { capabilities: [] };
  const piPackages = { packages: [] };
  const ambientCliPackages = { packages: [] };
  const appAuth = [{ accountId: "account-1" }];
  const enabledPlugins = [{ id: "plugin-1", name: "Plugin" }];
  const registrations = [{ name: "plugin__tool" }];
  const pluginHost = {
    buildCodexPluginMcpToolRegistrations: vi.fn(() => registrations),
    enabledCodexPlugins: vi.fn(async () => enabledPlugins),
    inspectAmbientCliPackages: vi.fn(async () => ambientCliPackages),
    inspectHostedCodexMarketplace: vi.fn(async () => hostedMarketplace),
    inspectPiPackages: vi.fn(async () => piPackages),
    listPluginAppAuth: vi.fn(async () => appAuth),
    listRegistry: vi.fn(async () => {
      if (input.registryError) throw input.registryError;
      return registry;
    }),
    readCodexPluginCatalog: vi.fn(async () => {
      if (input.catalogError) throw input.catalogError;
      return codexCatalog;
    }),
  };
  const searchAmbientCliCapabilities = vi.fn(async () => {
    if (input.searchError) throw input.searchError;
    return {
      results: [
        {
          registryPluginId: "registry-plugin",
          packageId: "package-1",
          packageName: "Package One",
          commands: [
            { capabilityId: "capability-1", name: "run" },
            { capabilityId: "capability-2", name: "inspect" },
          ],
        },
      ],
    };
  });
  const service = createPluginDesktopService({
    defaultStore: () => store,
    defaultHost: () => host,
    pluginHost: () => pluginHost as never,
    allPluginMcpRuntimeSnapshots: vi.fn(() => [pluginRuntimeSnapshot()]),
    currentFeatureFlagSnapshot: vi.fn(() => ({ flags: [] })),
    getAgentMemoryDiagnostics: vi.fn(() => ({ memory: "ok" })),
    getAgentMemoryStarterStatus: vi.fn(() => ({ starter: "ok" })),
    searchAmbientCliCapabilities,
  });

  return {
    ambientCliPackages,
    appAuth,
    codexCatalog,
    enabledPlugins,
    hostedMarketplace,
    host,
    piPackages,
    pluginHost,
    registrations,
    registry,
    searchAmbientCliCapabilities,
    service,
    store,
  };
}

function pluginRuntimeSnapshot(): PluginMcpRuntimeSnapshot {
  return {
    key: "runtime-1",
    pluginId: "plugin-1",
    pluginName: "Plugin",
    pluginVersion: "1.0.0",
    pluginFingerprint: "fingerprint",
    serverName: "server",
    status: "ready",
    permissionMode: "workspace",
    workspacePath: "/workspace/project",
    cwd: "/workspace/project",
    args: [],
    envKeys: [],
    requestCount: 0,
  };
}

describe("pluginDesktopService", () => {
  it("reads plugin catalog, marketplace, and registry through the workspace state reader", async () => {
    const { codexCatalog, hostedMarketplace, pluginHost, registry, service, store } = createHarness();

    await expect(service.readCodexPluginCatalog()).resolves.toBe(codexCatalog);
    await expect(service.readCodexHostedMarketplaceReport()).resolves.toBe(hostedMarketplace);
    await expect(service.readAmbientPluginRegistry()).resolves.toBe(registry);

    expect(pluginHost.readCodexPluginCatalog).toHaveBeenCalledWith("/workspace/project", expect.any(Object));
    expect(pluginHost.inspectHostedCodexMarketplace).toHaveBeenCalledWith("/workspace/project", expect.any(Object));
    expect(pluginHost.listRegistry).toHaveBeenCalledWith("/workspace/project", expect.any(Object));
    const stateReaders = [
      pluginHost.readCodexPluginCatalog.mock.calls[0],
      pluginHost.inspectHostedCodexMarketplace.mock.calls[0],
      pluginHost.listRegistry.mock.calls[0],
    ].map((call) => (call as unknown as [string, AmbientPluginStateReader])[1]);
    for (const stateReader of stateReaders) {
      expect(stateReader.isPluginEnabled("enabled-plugin")).toBe(true);
      expect(stateReader.isPluginTrusted("trusted-plugin", "fingerprint")).toBe(true);
      expect(stateReader.isPiPackageEnabled?.("enabled-package")).toBe(true);
    }
    expect(store.revoked).toEqual([]);
  });

  it("revokes matching plugin grant labels and leaves other grants intact", () => {
    const store = new FakeStore({
      grants: [
        { id: "grant-1", actionKind: "plugin_tool_execute", targetLabel: "Plugin: GitHub" },
        { id: "grant-2", actionKind: "plugin_tool_execute", targetLabel: "Plugin: GitHub / issue" },
        { id: "grant-3", actionKind: "plugin_tool_execute", targetLabel: "Plugin: Slack" },
        { id: "grant-4", actionKind: "shell_command_execute", targetLabel: "Plugin: GitHub" },
      ],
    });
    const { service } = createHarness({ store });

    expect(service.revokePluginGrantsForLabels(["Plugin: GitHub"])).toBe(2);
    expect(store.revoked).toEqual(["grant-1", "grant-2"]);
  });

  it("builds plugin MCP registrations from enabled plugins for the target thread", async () => {
    const { enabledPlugins, pluginHost, registrations, service } = createHarness();
    const thread = {
      id: "thread-1",
      workspacePath: "/workspace/thread",
      permissionMode: "workspace" as const,
    };

    await expect(service.pluginMcpRegistrationsForThread(thread as never)).resolves.toBe(registrations);

    expect(pluginHost.enabledCodexPlugins).toHaveBeenCalledWith("/workspace/thread", expect.any(Object));
    expect(pluginHost.buildCodexPluginMcpToolRegistrations).toHaveBeenCalledWith(enabledPlugins, {
      permissionMode: "workspace",
      workspacePath: "/workspace/thread",
    });
  });

  it("projects Ambient CLI command search results into workflow capability grants and swallows lookup failures", async () => {
    const { searchAmbientCliCapabilities, service } = createHarness();

    await expect(service.ambientCliCapabilityGrantsForWorkflowRequest("/workspace", "github")).resolves.toEqual([
      {
        capabilityId: "capability-1",
        registryPluginId: "registry-plugin",
        packageId: "package-1",
        packageName: "Package One",
        command: "run",
      },
      {
        capabilityId: "capability-2",
        registryPluginId: "registry-plugin",
        packageId: "package-1",
        packageName: "Package One",
        command: "inspect",
      },
    ]);
    expect(searchAmbientCliCapabilities).toHaveBeenCalledWith("/workspace", {
      query: "github",
      kind: "command",
      limit: 6,
      includeHealth: false,
    });

    const failing = createHarness({ searchError: new Error("offline") });
    await expect(failing.service.ambientCliCapabilityGrantsForWorkflowRequest("/workspace", "github")).resolves.toEqual([]);
  });

  it("assembles diagnostic data and captures plugin section failures without throwing", async () => {
    const { service } = createHarness({
      catalogError: new Error("catalog unavailable"),
      registryError: new Error("registry unavailable"),
    });

    const source = service.createMainDiagnosticSource();

    expect(source.getWorkspace()).toEqual({ path: "/workspace/project" });
    expect(source.getContextDiagnostics()).toEqual({ tokenizer: { ok: true } });
    expect(source.getLocalModelRuntimeStatus()).toEqual({ workspacePath: "/workspace/project" });

    await expect(source.getPluginDiagnostics()).resolves.toEqual({
      registry: undefined,
      codexCatalog: undefined,
      hostedMarketplace: { marketplaces: [] },
      piPackages: { packages: [] },
      ambientCliPackages: { packages: [] },
      appAuth: [{ accountId: "account-1" }],
      mcpRuntimes: [pluginRuntimeSnapshot()],
      errors: [
        "ambient plugin registry: registry unavailable",
        "Codex plugin catalog: catalog unavailable",
      ],
    });
  });
});
