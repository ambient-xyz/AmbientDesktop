import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  AddCodexMarketplaceInput,
  AmbientPluginCapabilityDiagnostics,
  AmbientPluginCapabilitySummary,
  AmbientPluginAuthAccountSummary,
  AmbientPluginAuthStartResult,
  AmbientPluginRegistry,
  CodexHostedMarketplaceReport,
  CodexPluginCatalog,
  CodexPluginDependencyInstallResult,
  CodexPluginMcpInspectionCatalog,
  CodexPluginSummary,
  CompletePluginAppAuthInput,
  GetAmbientPluginCapabilityDiagnosticsInput,
  ImportCodexPluginInput,
  InstallCodexPluginDependenciesInput,
  ListAmbientPluginRuntimeCapabilitiesInput,
  PluginAuthAccountActionInput,
  PluginMcpRuntimeSnapshot,
  ReadCodexPluginInput,
  RemoveCodexMarketplaceInput,
  SetCodexPluginEnabledInput,
  SetCodexPluginTrustedInput,
  StartPluginAppAuthInput,
  UninstallCodexPluginInput,
} from "../../shared/types";
import {
  pluginAddCodexMarketplaceIpcChannels,
  pluginAuthIpcChannels,
  pluginCapabilityDiagnosticsIpcChannels,
  pluginDiscoveryIpcChannels,
  pluginHostedMarketplaceIpcChannels,
  pluginImportCodexCacheIpcChannels,
  pluginInstallDependenciesIpcChannels,
  pluginMcpInspectionIpcChannels,
  pluginMcpRuntimeActionIpcChannels,
  pluginMcpRuntimeListIpcChannels,
  pluginRegistryIpcChannels,
  pluginReadIpcChannels,
  pluginRemoveCodexMarketplaceIpcChannels,
  pluginRuntimeCapabilitiesIpcChannels,
  pluginSetEnabledIpcChannels,
  pluginSetTrustedIpcChannels,
  pluginUninstallCodexIpcChannels,
  registerPluginAddCodexMarketplaceIpc,
  registerPluginAuthIpc,
  registerPluginCapabilityDiagnosticsIpc,
  registerPluginDiscoveryIpc,
  registerPluginHostedMarketplaceIpc,
  registerPluginImportCodexCacheIpc,
  registerPluginInstallDependenciesIpc,
  registerPluginMcpInspectionIpc,
  registerPluginMcpRuntimeActionIpc,
  registerPluginMcpRuntimeListIpc,
  registerPluginRegistryIpc,
  registerPluginReadIpc,
  registerPluginRemoveCodexMarketplaceIpc,
  registerPluginRuntimeCapabilitiesIpc,
  registerPluginSetEnabledIpc,
  registerPluginSetTrustedIpc,
  registerPluginUninstallCodexIpc,
  type RegisterPluginAddCodexMarketplaceIpcDependencies,
  type RegisterPluginAuthIpcDependencies,
  type RegisterPluginCapabilityDiagnosticsIpcDependencies,
  type RegisterPluginDiscoveryIpcDependencies,
  type RegisterPluginHostedMarketplaceIpcDependencies,
  type RegisterPluginImportCodexCacheIpcDependencies,
  type RegisterPluginInstallDependenciesIpcDependencies,
  type RegisterPluginMcpInspectionIpcDependencies,
  type RegisterPluginMcpRuntimeActionIpcDependencies,
  type RegisterPluginMcpRuntimeListIpcDependencies,
  type RegisterPluginRegistryIpcDependencies,
  type RegisterPluginReadIpcDependencies,
  type RegisterPluginRemoveCodexMarketplaceIpcDependencies,
  type RegisterPluginRuntimeCapabilitiesIpcDependencies,
  type RegisterPluginSetEnabledIpcDependencies,
  type RegisterPluginSetTrustedIpcDependencies,
  type RegisterPluginUninstallCodexIpcDependencies,
} from "./registerPluginIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerPluginDiscoveryIpc", () => {
  it("registers the plugin discovery channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginDiscoveryIpcChannels]);
  });

  it("reads the Codex plugin catalog", async () => {
    const { catalog, deps, invoke } = registerWithFakes();

    await expect(invoke("plugins:discover")).resolves.toEqual(catalog);

    expect(deps.readCodexPluginCatalog).toHaveBeenCalledOnce();
  });

  it("propagates catalog read errors", async () => {
    const error = new Error("catalog unavailable");
    const { deps, invoke } = registerWithFakes({ error });

    await expect(invoke("plugins:discover")).rejects.toThrow("catalog unavailable");

    expect(deps.readCodexPluginCatalog).toHaveBeenCalledOnce();
  });
});

describe("registerPluginRegistryIpc", () => {
  it("registers the plugin registry channel", () => {
    const { handlers } = registerRegistryWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginRegistryIpcChannels]);
  });

  it("reads the Ambient plugin registry", async () => {
    const { deps, invoke, registry } = registerRegistryWithFakes();

    await expect(invoke("plugins:registry")).resolves.toEqual(registry);

    expect(deps.readAmbientPluginRegistry).toHaveBeenCalledOnce();
  });

  it("propagates registry read errors", async () => {
    const error = new Error("registry unavailable");
    const { deps, invoke } = registerRegistryWithFakes({ error });

    await expect(invoke("plugins:registry")).rejects.toThrow("registry unavailable");

    expect(deps.readAmbientPluginRegistry).toHaveBeenCalledOnce();
  });
});

describe("registerPluginRuntimeCapabilitiesIpc", () => {
  it("registers the plugin runtime capabilities channel", () => {
    const { handlers } = registerRuntimeCapabilitiesWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginRuntimeCapabilitiesIpcChannels]);
  });

  it("parses runtime input before listing capabilities", async () => {
    const { capabilities, deps, invoke } = registerRuntimeCapabilitiesWithFakes();

    await expect(invoke("plugins:runtime-capabilities", { runtime: "workflow", extra: true })).resolves.toEqual(
      capabilities,
    );

    expect(deps.listRuntimeCapabilities).toHaveBeenCalledWith({ runtime: "workflow" });
  });

  it("rejects invalid runtime input before calling the dependency", () => {
    const { deps, invoke } = registerRuntimeCapabilitiesWithFakes();

    expect(() => invoke("plugins:runtime-capabilities", { runtime: "desktop" })).toThrow();

    expect(deps.listRuntimeCapabilities).not.toHaveBeenCalled();
  });

  it("propagates runtime capability list errors", async () => {
    const error = new Error("runtime capabilities unavailable");
    const { deps, invoke } = registerRuntimeCapabilitiesWithFakes({ error });

    await expect(invoke("plugins:runtime-capabilities", { runtime: "chat" })).rejects.toThrow(
      "runtime capabilities unavailable",
    );

    expect(deps.listRuntimeCapabilities).toHaveBeenCalledWith({ runtime: "chat" });
  });
});

describe("registerPluginCapabilityDiagnosticsIpc", () => {
  it("registers the plugin capability diagnostics channel", () => {
    const { handlers } = registerCapabilityDiagnosticsWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginCapabilityDiagnosticsIpcChannels]);
  });

  it("parses capability diagnostics input before reading diagnostics", async () => {
    const { deps, diagnostics, invoke } = registerCapabilityDiagnosticsWithFakes();

    await expect(invoke("plugins:capability-diagnostics", { capabilityId: "plugin-1:tool:sample", extra: true })).resolves.toEqual(
      diagnostics,
    );

    expect(deps.getCapabilityDiagnostics).toHaveBeenCalledWith({ capabilityId: "plugin-1:tool:sample" });
  });

  it("rejects invalid capability diagnostics input before calling the dependency", () => {
    const { deps, invoke } = registerCapabilityDiagnosticsWithFakes();

    expect(() => invoke("plugins:capability-diagnostics", { capabilityId: "" })).toThrow();

    expect(deps.getCapabilityDiagnostics).not.toHaveBeenCalled();
  });

  it("propagates capability diagnostics errors", async () => {
    const error = new Error("capability diagnostics unavailable");
    const { deps, invoke } = registerCapabilityDiagnosticsWithFakes({ error });

    await expect(invoke("plugins:capability-diagnostics", { capabilityId: "plugin-1:tool:sample" })).rejects.toThrow(
      "capability diagnostics unavailable",
    );

    expect(deps.getCapabilityDiagnostics).toHaveBeenCalledWith({ capabilityId: "plugin-1:tool:sample" });
  });
});

describe("registerPluginReadIpc", () => {
  it("registers the plugin read channel", () => {
    const { handlers } = registerReadWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginReadIpcChannels]);
  });

  it("parses plugin read input before reading the plugin", async () => {
    const { deps, invoke, plugin } = registerReadWithFakes();

    await expect(invoke("plugins:read", { pluginId: "plugin-1", extra: true })).resolves.toEqual(plugin);

    expect(deps.readCodexPlugin).toHaveBeenCalledWith({ pluginId: "plugin-1" });
  });

  it("rejects invalid plugin read input before calling the dependency", () => {
    const { deps, invoke } = registerReadWithFakes();

    expect(() => invoke("plugins:read", { pluginId: "" })).toThrow();

    expect(deps.readCodexPlugin).not.toHaveBeenCalled();
  });

  it("propagates plugin read errors", async () => {
    const error = new Error("plugin unavailable");
    const { deps, invoke } = registerReadWithFakes({ error });

    await expect(invoke("plugins:read", { pluginId: "plugin-1" })).rejects.toThrow("plugin unavailable");

    expect(deps.readCodexPlugin).toHaveBeenCalledWith({ pluginId: "plugin-1" });
  });
});

describe("registerPluginHostedMarketplaceIpc", () => {
  it("registers the hosted marketplace channel", () => {
    const { handlers } = registerHostedMarketplaceWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginHostedMarketplaceIpcChannels]);
  });

  it("reads the hosted marketplace report", async () => {
    const { deps, invoke, report } = registerHostedMarketplaceWithFakes();

    await expect(invoke("plugins:hosted-marketplace")).resolves.toEqual(report);

    expect(deps.readCodexHostedMarketplaceReport).toHaveBeenCalledOnce();
  });

  it("propagates hosted marketplace read errors", async () => {
    const error = new Error("hosted marketplace unavailable");
    const { deps, invoke } = registerHostedMarketplaceWithFakes({ error });

    await expect(invoke("plugins:hosted-marketplace")).rejects.toThrow("hosted marketplace unavailable");

    expect(deps.readCodexHostedMarketplaceReport).toHaveBeenCalledOnce();
  });
});

describe("registerPluginMcpInspectionIpc", () => {
  it("registers the plugin MCP inspection channel", () => {
    const { handlers } = registerMcpInspectionWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginMcpInspectionIpcChannels]);
  });

  it("inspects plugin MCP servers", async () => {
    const { catalog, deps, invoke } = registerMcpInspectionWithFakes();

    await expect(invoke("plugins:inspect-mcp")).resolves.toEqual(catalog);

    expect(deps.inspectCodexPluginMcp).toHaveBeenCalledOnce();
  });

  it("propagates plugin MCP inspection errors", async () => {
    const error = new Error("MCP inspection unavailable");
    const { deps, invoke } = registerMcpInspectionWithFakes({ error });

    await expect(invoke("plugins:inspect-mcp")).rejects.toThrow("MCP inspection unavailable");

    expect(deps.inspectCodexPluginMcp).toHaveBeenCalledOnce();
  });
});

describe("registerPluginMcpRuntimeListIpc", () => {
  it("registers the plugin MCP runtime list channel", () => {
    const { handlers } = registerMcpRuntimeListWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginMcpRuntimeListIpcChannels]);
  });

  it("lists plugin MCP runtime snapshots", async () => {
    const { deps, invoke, snapshots } = registerMcpRuntimeListWithFakes();

    await expect(invoke("plugins:mcp-runtimes")).resolves.toEqual(snapshots);

    expect(deps.listPluginMcpRuntimeSnapshots).toHaveBeenCalledOnce();
  });

  it("propagates plugin MCP runtime list errors", async () => {
    const error = new Error("runtime snapshots unavailable");
    const { deps, invoke } = registerMcpRuntimeListWithFakes({ error });

    await expect(invoke("plugins:mcp-runtimes")).rejects.toThrow("runtime snapshots unavailable");

    expect(deps.listPluginMcpRuntimeSnapshots).toHaveBeenCalledOnce();
  });
});

describe("registerPluginMcpRuntimeActionIpc", () => {
  it("registers the plugin MCP runtime action channels", () => {
    const { handlers } = registerMcpRuntimeActionWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginMcpRuntimeActionIpcChannels]);
  });

  it("parses and restarts plugin MCP runtimes", async () => {
    const { deps, invoke, restartSnapshots } = registerMcpRuntimeActionWithFakes();

    await expect(invoke("plugins:mcp-runtime-restart", { key: "plugin-1:sample-server", extra: true })).resolves.toEqual(restartSnapshots);

    expect(deps.restartPluginMcpRuntime).toHaveBeenCalledWith("plugin-1:sample-server");
    expect(deps.stopPluginMcpRuntime).not.toHaveBeenCalled();
  });

  it("parses and stops plugin MCP runtimes", async () => {
    const { deps, invoke, stopSnapshots } = registerMcpRuntimeActionWithFakes();

    await expect(invoke("plugins:mcp-runtime-stop", { key: "plugin-1:sample-server" })).resolves.toEqual(stopSnapshots);

    expect(deps.stopPluginMcpRuntime).toHaveBeenCalledWith("plugin-1:sample-server");
    expect(deps.restartPluginMcpRuntime).not.toHaveBeenCalled();
  });

  it("rejects invalid runtime action input before calling dependencies", async () => {
    const { deps, invoke } = registerMcpRuntimeActionWithFakes();

    await expect(invoke("plugins:mcp-runtime-restart", { key: "" })).rejects.toThrow();

    expect(deps.restartPluginMcpRuntime).not.toHaveBeenCalled();
    expect(deps.stopPluginMcpRuntime).not.toHaveBeenCalled();
  });

  it("throws when a runtime action does not find a matching runtime", async () => {
    const { deps, invoke } = registerMcpRuntimeActionWithFakes({ restartSnapshots: undefined });

    await expect(invoke("plugins:mcp-runtime-restart", { key: "missing-runtime" })).rejects.toThrow("Plugin MCP runtime was not found.");

    expect(deps.restartPluginMcpRuntime).toHaveBeenCalledWith("missing-runtime");
  });
});

describe("registerPluginAuthIpc", () => {
  it("registers the plugin auth channels", () => {
    const { handlers } = registerAuthWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginAuthIpcChannels]);
  });

  it("starts plugin auth, opens the authorization URL, and returns the pending auth state", async () => {
    const { deps, invoke, pending } = registerAuthWithFakes();

    await expect(
      invoke("plugins:auth-start", {
        connectorId: "fake.oauth.records",
        scopes: ["fake.records.read"],
        extra: true,
      }),
    ).resolves.toEqual(pending);

    expect(deps.startPluginAppAuth).toHaveBeenCalledWith({
      connectorId: "fake.oauth.records",
      scopes: ["fake.records.read"],
    });
    expect(deps.openPluginAuthUrl).toHaveBeenCalledWith(pending.authorizationUrl);
    expect(deps.reportPluginAuthOpenUrlError).not.toHaveBeenCalled();
  });

  it("reports plugin auth URL open errors without rejecting auth start", async () => {
    const openError = new Error("browser unavailable");
    const { deps, invoke, pending } = registerAuthWithFakes({ openError });

    await expect(invoke("plugins:auth-start", { connectorId: "fake.oauth.records" })).resolves.toEqual(pending);

    expect(deps.openPluginAuthUrl).toHaveBeenCalledWith(pending.authorizationUrl);
    expect(deps.reportPluginAuthOpenUrlError).toHaveBeenCalledWith(openError);
  });

  it("rejects invalid plugin auth start input before calling dependencies", async () => {
    const { deps, invoke } = registerAuthWithFakes();

    await expect(invoke("plugins:auth-start", { connectorId: "" })).rejects.toThrow();

    expect(deps.startPluginAppAuth).not.toHaveBeenCalled();
    expect(deps.openPluginAuthUrl).not.toHaveBeenCalled();
  });

  it("propagates plugin auth start errors before opening the authorization URL", async () => {
    const error = new Error("auth start failed");
    const { deps, invoke } = registerAuthWithFakes({ startError: error });

    await expect(invoke("plugins:auth-start", { connectorId: "fake.oauth.records" })).rejects.toThrow(
      "auth start failed",
    );

    expect(deps.startPluginAppAuth).toHaveBeenCalledWith({ connectorId: "fake.oauth.records" });
    expect(deps.openPluginAuthUrl).not.toHaveBeenCalled();
  });

  it("completes plugin auth with parsed input", async () => {
    const { account, deps, invoke } = registerAuthWithFakes();

    await expect(
      invoke("plugins:auth-complete", {
        state: "state-1",
        code: "code-1",
        extra: true,
      }),
    ).resolves.toEqual(account);

    expect(deps.completePluginAppAuth).toHaveBeenCalledWith({ state: "state-1", code: "code-1" });
  });

  it("rejects invalid plugin auth completion input before calling dependencies", async () => {
    const { deps, invoke } = registerAuthWithFakes();

    await expect(invoke("plugins:auth-complete", { state: "", code: "code-1" })).rejects.toThrow();

    expect(deps.completePluginAppAuth).not.toHaveBeenCalled();
  });

  it("routes plugin auth account actions to the matching dependency", async () => {
    const { account, deps, invoke } = registerAuthWithFakes();

    await expect(invoke("plugins:auth-revoke", { accountId: "acct-1", extra: true })).resolves.toEqual(account);
    await expect(invoke("plugins:auth-disconnect", { accountId: "acct-1" })).resolves.toEqual(account);
    await expect(invoke("plugins:auth-test", { accountId: "acct-1" })).resolves.toEqual(account);

    expect(deps.revokePluginAuthAccount).toHaveBeenCalledWith({ accountId: "acct-1" });
    expect(deps.disconnectPluginAuthAccount).toHaveBeenCalledWith({ accountId: "acct-1" });
    expect(deps.testPluginAuthAccount).toHaveBeenCalledWith({ accountId: "acct-1" });
  });

  it("rejects invalid plugin auth account action input before calling dependencies", async () => {
    const { deps, invoke } = registerAuthWithFakes();

    await expect(invoke("plugins:auth-revoke", { accountId: "" })).rejects.toThrow();

    expect(deps.revokePluginAuthAccount).not.toHaveBeenCalled();
    expect(deps.disconnectPluginAuthAccount).not.toHaveBeenCalled();
    expect(deps.testPluginAuthAccount).not.toHaveBeenCalled();
  });

  it("propagates plugin auth account action errors", async () => {
    const error = new Error("revoke failed");
    const { deps, invoke } = registerAuthWithFakes({ revokeError: error });

    await expect(invoke("plugins:auth-revoke", { accountId: "acct-1" })).rejects.toThrow("revoke failed");

    expect(deps.revokePluginAuthAccount).toHaveBeenCalledWith({ accountId: "acct-1" });
  });
});

describe("registerPluginSetEnabledIpc", () => {
  it("registers the plugin set-enabled channel", () => {
    const { handlers } = registerSetEnabledWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginSetEnabledIpcChannels]);
  });

  it("parses set-enabled input before updating plugin state", async () => {
    const { catalog, deps, invoke } = registerSetEnabledWithFakes();

    await expect(
      invoke("plugins:set-enabled", {
        pluginId: "plugin-1",
        enabled: true,
        extra: "ignored",
      }),
    ).resolves.toEqual(catalog);

    expect(deps.setCodexPluginEnabled).toHaveBeenCalledWith({ pluginId: "plugin-1", enabled: true });
  });

  it("rejects invalid set-enabled input before calling the dependency", async () => {
    const { deps, invoke } = registerSetEnabledWithFakes();

    await expect(invoke("plugins:set-enabled", { pluginId: "", enabled: true })).rejects.toThrow();

    expect(deps.setCodexPluginEnabled).not.toHaveBeenCalled();
  });

  it("propagates set-enabled errors", async () => {
    const error = new Error("set enabled failed");
    const { deps, invoke } = registerSetEnabledWithFakes({ error });

    await expect(invoke("plugins:set-enabled", { pluginId: "plugin-1", enabled: false })).rejects.toThrow(
      "set enabled failed",
    );

    expect(deps.setCodexPluginEnabled).toHaveBeenCalledWith({ pluginId: "plugin-1", enabled: false });
  });
});

describe("registerPluginSetTrustedIpc", () => {
  it("registers the plugin set-trusted channel", () => {
    const { handlers } = registerSetTrustedWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginSetTrustedIpcChannels]);
  });

  it("parses set-trusted input before updating plugin trust", async () => {
    const { catalog, deps, invoke } = registerSetTrustedWithFakes();

    await expect(
      invoke("plugins:set-trusted", {
        pluginId: "plugin-1",
        trusted: true,
        extra: "ignored",
      }),
    ).resolves.toEqual(catalog);

    expect(deps.setCodexPluginTrusted).toHaveBeenCalledWith({ pluginId: "plugin-1", trusted: true });
  });

  it("rejects invalid set-trusted input before calling the dependency", async () => {
    const { deps, invoke } = registerSetTrustedWithFakes();

    await expect(invoke("plugins:set-trusted", { pluginId: "", trusted: true })).rejects.toThrow();

    expect(deps.setCodexPluginTrusted).not.toHaveBeenCalled();
  });

  it("propagates set-trusted errors", async () => {
    const error = new Error("set trusted failed");
    const { deps, invoke } = registerSetTrustedWithFakes({ error });

    await expect(invoke("plugins:set-trusted", { pluginId: "plugin-1", trusted: false })).rejects.toThrow(
      "set trusted failed",
    );

    expect(deps.setCodexPluginTrusted).toHaveBeenCalledWith({ pluginId: "plugin-1", trusted: false });
  });
});

describe("registerPluginImportCodexCacheIpc", () => {
  it("registers the plugin import Codex cache channel", () => {
    const { handlers } = registerImportCodexCacheWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginImportCodexCacheIpcChannels]);
  });

  it("parses import input before importing the plugin cache", async () => {
    const { catalog, deps, invoke } = registerImportCodexCacheWithFakes();

    await expect(
      invoke("plugins:import-codex-cache", {
        pluginId: "plugin-1",
        extra: "ignored",
      }),
    ).resolves.toEqual(catalog);

    expect(deps.importCodexPlugin).toHaveBeenCalledWith({ pluginId: "plugin-1" });
  });

  it("rejects invalid import input before calling the dependency", async () => {
    const { deps, invoke } = registerImportCodexCacheWithFakes();

    await expect(invoke("plugins:import-codex-cache", { pluginId: "" })).rejects.toThrow();

    expect(deps.importCodexPlugin).not.toHaveBeenCalled();
  });

  it("propagates import errors", async () => {
    const error = new Error("import failed");
    const { deps, invoke } = registerImportCodexCacheWithFakes({ error });

    await expect(invoke("plugins:import-codex-cache", { pluginId: "plugin-1" })).rejects.toThrow(
      "import failed",
    );

    expect(deps.importCodexPlugin).toHaveBeenCalledWith({ pluginId: "plugin-1" });
  });
});

describe("registerPluginAddCodexMarketplaceIpc", () => {
  it("registers the plugin add Codex marketplace channel", () => {
    const { handlers } = registerAddCodexMarketplaceWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginAddCodexMarketplaceIpcChannels]);
  });

  it("parses marketplace input before adding the marketplace", async () => {
    const { catalog, deps, invoke } = registerAddCodexMarketplaceWithFakes();

    await expect(
      invoke("plugins:add-codex-marketplace", {
        source: "https://plugins.example.test/marketplace.json",
        name: "Example",
        allowExperimental: true,
        extra: "ignored",
      }),
    ).resolves.toEqual(catalog);

    expect(deps.addCodexMarketplace).toHaveBeenCalledWith({
      source: "https://plugins.example.test/marketplace.json",
      name: "Example",
      allowExperimental: true,
    });
  });

  it("rejects invalid marketplace input before calling the dependency", async () => {
    const { deps, invoke } = registerAddCodexMarketplaceWithFakes();

    await expect(invoke("plugins:add-codex-marketplace", { source: "" })).rejects.toThrow();

    expect(deps.addCodexMarketplace).not.toHaveBeenCalled();
  });

  it("propagates marketplace add errors", async () => {
    const error = new Error("marketplace add failed");
    const { deps, invoke } = registerAddCodexMarketplaceWithFakes({ error });

    await expect(
      invoke("plugins:add-codex-marketplace", { source: "https://plugins.example.test/marketplace.json" }),
    ).rejects.toThrow("marketplace add failed");

    expect(deps.addCodexMarketplace).toHaveBeenCalledWith({
      source: "https://plugins.example.test/marketplace.json",
    });
  });
});

describe("registerPluginRemoveCodexMarketplaceIpc", () => {
  it("registers the plugin remove Codex marketplace channel", () => {
    const { handlers } = registerRemoveCodexMarketplaceWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginRemoveCodexMarketplaceIpcChannels]);
  });

  it("parses marketplace input before removing the marketplace", async () => {
    const { catalog, deps, invoke } = registerRemoveCodexMarketplaceWithFakes();

    await expect(
      invoke("plugins:remove-codex-marketplace", {
        source: "https://plugins.example.test/marketplace.json",
        extra: "ignored",
      }),
    ).resolves.toEqual(catalog);

    expect(deps.removeCodexMarketplace).toHaveBeenCalledWith({
      source: "https://plugins.example.test/marketplace.json",
    });
  });

  it("rejects invalid marketplace input before calling the dependency", async () => {
    const { deps, invoke } = registerRemoveCodexMarketplaceWithFakes();

    await expect(invoke("plugins:remove-codex-marketplace", { source: "" })).rejects.toThrow();

    expect(deps.removeCodexMarketplace).not.toHaveBeenCalled();
  });

  it("propagates marketplace remove errors", async () => {
    const error = new Error("marketplace remove failed");
    const { deps, invoke } = registerRemoveCodexMarketplaceWithFakes({ error });

    await expect(
      invoke("plugins:remove-codex-marketplace", { source: "https://plugins.example.test/marketplace.json" }),
    ).rejects.toThrow("marketplace remove failed");

    expect(deps.removeCodexMarketplace).toHaveBeenCalledWith({
      source: "https://plugins.example.test/marketplace.json",
    });
  });
});

describe("registerPluginUninstallCodexIpc", () => {
  it("registers the plugin uninstall Codex channel", () => {
    const { handlers } = registerUninstallCodexWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginUninstallCodexIpcChannels]);
  });

  it("parses uninstall input before uninstalling the plugin", async () => {
    const { catalog, deps, invoke } = registerUninstallCodexWithFakes();

    await expect(
      invoke("plugins:uninstall-codex", {
        pluginId: "plugin-1",
        extra: "ignored",
      }),
    ).resolves.toEqual(catalog);

    expect(deps.uninstallCodexPlugin).toHaveBeenCalledWith({ pluginId: "plugin-1" });
  });

  it("rejects invalid uninstall input before calling the dependency", async () => {
    const { deps, invoke } = registerUninstallCodexWithFakes();

    await expect(invoke("plugins:uninstall-codex", { pluginId: "" })).rejects.toThrow();

    expect(deps.uninstallCodexPlugin).not.toHaveBeenCalled();
  });

  it("propagates uninstall errors", async () => {
    const error = new Error("uninstall failed");
    const { deps, invoke } = registerUninstallCodexWithFakes({ error });

    await expect(invoke("plugins:uninstall-codex", { pluginId: "plugin-1" })).rejects.toThrow(
      "uninstall failed",
    );

    expect(deps.uninstallCodexPlugin).toHaveBeenCalledWith({ pluginId: "plugin-1" });
  });
});

describe("registerPluginInstallDependenciesIpc", () => {
  it("registers the plugin install dependencies channel", () => {
    const { handlers } = registerInstallDependenciesWithFakes();

    expect([...handlers.keys()]).toEqual([...pluginInstallDependenciesIpcChannels]);
  });

  it("parses dependency install input before installing dependencies", async () => {
    const { deps, invoke, result } = registerInstallDependenciesWithFakes();

    await expect(
      invoke("plugins:install-dependencies", {
        pluginId: "plugin-1",
        extra: "ignored",
      }),
    ).resolves.toEqual(result);

    expect(deps.installCodexPluginDependencies).toHaveBeenCalledWith({ pluginId: "plugin-1" });
  });

  it("rejects invalid dependency install input before calling the dependency", async () => {
    const { deps, invoke } = registerInstallDependenciesWithFakes();

    await expect(invoke("plugins:install-dependencies", { pluginId: "" })).rejects.toThrow();

    expect(deps.installCodexPluginDependencies).not.toHaveBeenCalled();
  });

  it("propagates dependency install errors", async () => {
    const error = new Error("dependency install failed");
    const { deps, invoke } = registerInstallDependenciesWithFakes({ error });

    await expect(invoke("plugins:install-dependencies", { pluginId: "plugin-1" })).rejects.toThrow(
      "dependency install failed",
    );

    expect(deps.installCodexPluginDependencies).toHaveBeenCalledWith({ pluginId: "plugin-1" });
  });
});

function registerWithFakes({
  catalog = sampleCodexPluginCatalog(),
  error,
}: {
  catalog?: CodexPluginCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    readCodexPluginCatalog: vi.fn(async () => {
      if (error) throw error;
      return catalog;
    }),
  } satisfies RegisterPluginDiscoveryIpcDependencies;
  registerPluginDiscoveryIpc(deps);

  return {
    catalog,
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function registerRegistryWithFakes({
  registry = sampleAmbientPluginRegistry(),
  error,
}: {
  registry?: AmbientPluginRegistry;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    readAmbientPluginRegistry: vi.fn(async () => {
      if (error) throw error;
      return registry;
    }),
  } satisfies RegisterPluginRegistryIpcDependencies;
  registerPluginRegistryIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
    registry,
  };
}

function registerRuntimeCapabilitiesWithFakes({
  capabilities = sampleAmbientPluginCapabilitySummaries(),
  error,
}: {
  capabilities?: AmbientPluginCapabilitySummary[];
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    listRuntimeCapabilities: vi.fn(async (_input: ListAmbientPluginRuntimeCapabilitiesInput) => {
      if (error) throw error;
      return capabilities;
    }),
  } satisfies RegisterPluginRuntimeCapabilitiesIpcDependencies;
  registerPluginRuntimeCapabilitiesIpc(deps);

  return {
    capabilities,
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

function registerCapabilityDiagnosticsWithFakes({
  diagnostics = sampleAmbientPluginCapabilityDiagnostics(),
  error,
}: {
  diagnostics?: AmbientPluginCapabilityDiagnostics;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    getCapabilityDiagnostics: vi.fn(async (_input: GetAmbientPluginCapabilityDiagnosticsInput) => {
      if (error) throw error;
      return diagnostics;
    }),
  } satisfies RegisterPluginCapabilityDiagnosticsIpcDependencies;
  registerPluginCapabilityDiagnosticsIpc(deps);

  return {
    deps,
    diagnostics,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerReadWithFakes({
  plugin = sampleCodexPluginSummary(),
  error,
}: {
  plugin?: CodexPluginSummary;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    readCodexPlugin: vi.fn(async (_input: ReadCodexPluginInput) => {
      if (error) throw error;
      return plugin;
    }),
  } satisfies RegisterPluginReadIpcDependencies;
  registerPluginReadIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    plugin,
  };
}

function registerHostedMarketplaceWithFakes({
  report = sampleCodexHostedMarketplaceReport(),
  error,
}: {
  report?: CodexHostedMarketplaceReport;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    readCodexHostedMarketplaceReport: vi.fn(async () => {
      if (error) throw error;
      return report;
    }),
  } satisfies RegisterPluginHostedMarketplaceIpcDependencies;
  registerPluginHostedMarketplaceIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
    report,
  };
}

function registerMcpInspectionWithFakes({
  catalog = sampleCodexPluginMcpInspectionCatalog(),
  error,
}: {
  catalog?: CodexPluginMcpInspectionCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    inspectCodexPluginMcp: vi.fn(async () => {
      if (error) throw error;
      return catalog;
    }),
  } satisfies RegisterPluginMcpInspectionIpcDependencies;
  registerPluginMcpInspectionIpc(deps);

  return {
    catalog,
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function registerMcpRuntimeListWithFakes({
  snapshots = samplePluginMcpRuntimeSnapshots(),
  error,
}: {
  snapshots?: PluginMcpRuntimeSnapshot[];
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    listPluginMcpRuntimeSnapshots: vi.fn(async () => {
      if (error) throw error;
      return snapshots;
    }),
  } satisfies RegisterPluginMcpRuntimeListIpcDependencies;
  registerPluginMcpRuntimeListIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
    snapshots,
  };
}

function registerMcpRuntimeActionWithFakes(options: {
  restartSnapshots?: PluginMcpRuntimeSnapshot[];
  stopSnapshots?: PluginMcpRuntimeSnapshot[];
} = {}) {
  const restartSnapshots = Object.hasOwn(options, "restartSnapshots")
    ? options.restartSnapshots
    : samplePluginMcpRuntimeSnapshots("ready");
  const stopSnapshots = Object.hasOwn(options, "stopSnapshots") ? options.stopSnapshots : samplePluginMcpRuntimeSnapshots("stopped");
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    restartPluginMcpRuntime: vi.fn(async () => restartSnapshots),
    stopPluginMcpRuntime: vi.fn(async () => stopSnapshots),
  } satisfies RegisterPluginMcpRuntimeActionIpcDependencies;
  registerPluginMcpRuntimeActionIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    restartSnapshots,
    stopSnapshots,
  };
}

function registerAuthWithFakes({
  pending = samplePluginAuthStartResult(),
  account = samplePluginAuthAccountSummary(),
  startError,
  openError,
  completeError,
  revokeError,
  disconnectError,
  testError,
}: {
  pending?: AmbientPluginAuthStartResult;
  account?: AmbientPluginAuthAccountSummary;
  startError?: Error;
  openError?: Error;
  completeError?: Error;
  revokeError?: Error;
  disconnectError?: Error;
  testError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    startPluginAppAuth: vi.fn((_input: StartPluginAppAuthInput) => {
      if (startError) throw startError;
      return pending;
    }),
    completePluginAppAuth: vi.fn(async (_input: CompletePluginAppAuthInput) => {
      if (completeError) throw completeError;
      return account;
    }),
    revokePluginAuthAccount: vi.fn(async (_input: PluginAuthAccountActionInput) => {
      if (revokeError) throw revokeError;
      return account;
    }),
    disconnectPluginAuthAccount: vi.fn(async (_input: PluginAuthAccountActionInput) => {
      if (disconnectError) throw disconnectError;
      return account;
    }),
    testPluginAuthAccount: vi.fn(async (_input: PluginAuthAccountActionInput) => {
      if (testError) throw testError;
      return account;
    }),
    openPluginAuthUrl: vi.fn(async () => {
      if (openError) throw openError;
    }),
    reportPluginAuthOpenUrlError: vi.fn(),
  } satisfies RegisterPluginAuthIpcDependencies;
  registerPluginAuthIpc(deps);

  return {
    account,
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    pending,
  };
}

function registerSetEnabledWithFakes({
  catalog = sampleCodexPluginCatalog(),
  error,
}: {
  catalog?: CodexPluginCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    setCodexPluginEnabled: vi.fn(async (_input: SetCodexPluginEnabledInput) => {
      if (error) throw error;
      return catalog;
    }),
  } satisfies RegisterPluginSetEnabledIpcDependencies;
  registerPluginSetEnabledIpc(deps);

  return {
    catalog,
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

function registerSetTrustedWithFakes({
  catalog = sampleCodexPluginCatalog(),
  error,
}: {
  catalog?: CodexPluginCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    setCodexPluginTrusted: vi.fn(async (_input: SetCodexPluginTrustedInput) => {
      if (error) throw error;
      return catalog;
    }),
  } satisfies RegisterPluginSetTrustedIpcDependencies;
  registerPluginSetTrustedIpc(deps);

  return {
    catalog,
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

function registerImportCodexCacheWithFakes({
  catalog = sampleCodexPluginCatalog(),
  error,
}: {
  catalog?: CodexPluginCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    importCodexPlugin: vi.fn(async (_input: ImportCodexPluginInput) => {
      if (error) throw error;
      return catalog;
    }),
  } satisfies RegisterPluginImportCodexCacheIpcDependencies;
  registerPluginImportCodexCacheIpc(deps);

  return {
    catalog,
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

function registerAddCodexMarketplaceWithFakes({
  catalog = sampleCodexPluginCatalog(),
  error,
}: {
  catalog?: CodexPluginCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    addCodexMarketplace: vi.fn(async (_input: AddCodexMarketplaceInput) => {
      if (error) throw error;
      return catalog;
    }),
  } satisfies RegisterPluginAddCodexMarketplaceIpcDependencies;
  registerPluginAddCodexMarketplaceIpc(deps);

  return {
    catalog,
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

function registerRemoveCodexMarketplaceWithFakes({
  catalog = sampleCodexPluginCatalog(),
  error,
}: {
  catalog?: CodexPluginCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    removeCodexMarketplace: vi.fn(async (_input: RemoveCodexMarketplaceInput) => {
      if (error) throw error;
      return catalog;
    }),
  } satisfies RegisterPluginRemoveCodexMarketplaceIpcDependencies;
  registerPluginRemoveCodexMarketplaceIpc(deps);

  return {
    catalog,
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

function registerUninstallCodexWithFakes({
  catalog = sampleCodexPluginCatalog(),
  error,
}: {
  catalog?: CodexPluginCatalog;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    uninstallCodexPlugin: vi.fn(async (_input: UninstallCodexPluginInput) => {
      if (error) throw error;
      return catalog;
    }),
  } satisfies RegisterPluginUninstallCodexIpcDependencies;
  registerPluginUninstallCodexIpc(deps);

  return {
    catalog,
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

function registerInstallDependenciesWithFakes({
  result = sampleCodexPluginDependencyInstallResult(),
  error,
}: {
  result?: CodexPluginDependencyInstallResult;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    installCodexPluginDependencies: vi.fn(async (_input: InstallCodexPluginDependenciesInput) => {
      if (error) throw error;
      return result;
    }),
  } satisfies RegisterPluginInstallDependenciesIpcDependencies;
  registerPluginInstallDependenciesIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    result,
  };
}

function sampleCodexPluginCatalog(): CodexPluginCatalog {
  return {
    marketplaces: ["/tmp/plugins"],
    marketplaceSources: [],
    plugins: [],
    importCandidates: [],
    errors: [],
  };
}

function sampleCodexPluginDependencyInstallResult(): CodexPluginDependencyInstallResult {
  return {
    pluginId: "plugin-1",
    pluginName: "sample-plugin",
    manager: "pnpm",
    command: ["pnpm", "install", "--ignore-scripts"],
    cwd: "/tmp/plugins/sample-plugin",
    installedAt: "2026-06-04T12:00:00.000Z",
  };
}

function samplePluginAuthStartResult(): AmbientPluginAuthStartResult {
  return {
    connectorId: "fake.oauth.records",
    providerId: "fake-oauth",
    requestedScopes: ["fake.records.read"],
    authorizationUrl: "https://auth.example.test/oauth/authorize?state=state-1",
    state: "state-1",
    expiresAt: "2026-06-04T12:05:00.000Z",
  };
}

function samplePluginAuthAccountSummary(): AmbientPluginAuthAccountSummary {
  return {
    id: "acct-1",
    accountId: "acct-1",
    label: "Account 1",
    email: "account@example.test",
    status: "available",
    grantedScopes: ["fake.records.read"],
    connectedAt: "2026-06-04T12:00:00.000Z",
    updatedAt: "2026-06-04T12:00:00.000Z",
  };
}

function sampleAmbientPluginRegistry(): AmbientPluginRegistry {
  return {
    plugins: [],
    capabilities: [],
    sources: ["/tmp/ambient-plugins"],
    errors: [],
    sourceNotes: [],
  };
}

function sampleAmbientPluginCapabilitySummaries(): AmbientPluginCapabilitySummary[] {
  return [
    {
      id: "plugin-1:tool:sample",
      pluginId: "plugin-1",
      pluginName: "sample-plugin",
      kind: "tool",
      name: "sample_tool",
      description: "Sample tool",
      sourceKind: "codex-workspace",
      runtimeSupport: ["chat", "workflow"],
      enabled: true,
      trusted: true,
      availability: "available",
      supportLabels: [],
      diagnostics: [],
    },
  ];
}

function sampleAmbientPluginCapabilityDiagnostics(): AmbientPluginCapabilityDiagnostics {
  const [capability] = sampleAmbientPluginCapabilitySummaries();
  return {
    capabilityId: capability.id,
    capability,
    diagnostics: ["available"],
  };
}

function samplePluginMcpRuntimeSnapshots(status: PluginMcpRuntimeSnapshot["status"] = "ready"): PluginMcpRuntimeSnapshot[] {
  return [
    {
      key: "plugin-1:sample-server",
      pluginId: "plugin-1",
      pluginName: "Sample Plugin",
      pluginVersion: "1.0.0",
      pluginFingerprint: "fingerprint-1",
      serverName: "sample-server",
      status,
      permissionMode: "workspace",
      workspacePath: "/tmp/workspace",
      cwd: "/tmp/workspace",
      args: ["serve"],
      envKeys: ["PATH"],
      requestCount: 2,
    },
  ];
}

function sampleCodexPluginMcpInspectionCatalog(): CodexPluginMcpInspectionCatalog {
  return {
    servers: [
      {
        pluginId: "plugin-1",
        pluginName: "Sample Plugin",
        serverName: "sample-server",
        status: "ready",
        tools: [
          {
            pluginId: "plugin-1",
            pluginName: "Sample Plugin",
            serverName: "sample-server",
            name: "sample_tool",
            description: "Sample MCP tool",
          },
        ],
      },
    ],
  };
}

function sampleCodexHostedMarketplaceReport(): CodexHostedMarketplaceReport {
  return {
    status: "available",
    checkedAt: "2026-06-04T12:00:00.000Z",
    message: "Hosted marketplace available",
    source: "ambient",
    protocolMethods: ["marketplace.list"],
    marketplaceCount: 1,
    pluginCount: 0,
    featuredPluginIds: [],
    marketplaceLoadErrors: [],
    marketplaces: [],
    ambientCandidateCount: 0,
    matchedPluginCount: 0,
    missingInAmbient: [],
    extraInAmbient: [],
    readComparisonCount: 0,
    readComparisons: [],
    notes: [],
  };
}

function sampleCodexPluginSummary(): CodexPluginSummary {
  return {
    id: "plugin-1",
    name: "sample-plugin",
    version: "1.0.0",
    description: "Sample plugin",
    marketplaceName: "Local",
    marketplacePath: "/tmp/plugins",
    rootPath: "/tmp/plugins/plugin-1",
    sourceKind: "workspace",
    compatibilityTier: "supported",
    compatibilityNotes: [],
    supportLabels: [],
    skills: [],
    mcpServers: [],
    enabled: true,
    trusted: true,
    errors: [],
  };
}
