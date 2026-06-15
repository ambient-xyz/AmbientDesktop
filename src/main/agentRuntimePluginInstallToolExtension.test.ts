import { describe, expect, it, vi } from "vitest";

import { createAgentRuntimePluginInstallApplyCallbacks } from "./agentRuntimePluginInstallToolExtension";

describe("agentRuntimePluginInstallToolExtension", () => {
  it("forwards plugin install apply callbacks through plugin host and store dependencies", async () => {
    const pluginStateProbe: { enabled?: boolean; trusted?: boolean } = {};
    const pluginHost = {
      previewCodexPluginInstall: vi.fn(async (workspacePath: string, input: unknown) => ({
        kind: "preview",
        workspacePath,
        input,
      })),
      commitCodexPluginInstall: vi.fn(async (workspacePath: string, input: unknown) => ({
        kind: "commit",
        workspacePath,
        input,
      })),
      readCodexPluginCatalog: vi.fn(async (_workspacePath: string, state: any) => {
        pluginStateProbe.enabled = state.isPluginEnabled("plugin-1");
        pluginStateProbe.trusted = state.isPluginTrusted("plugin-1", "fingerprint-1");
        return { plugins: [], importCandidates: [] };
      }),
      installCodexPluginDependencies: vi.fn(async (workspacePath: string, input: unknown) => ({
        kind: "deps",
        workspacePath,
        input,
      })),
      shutdownPluginMcpServers: vi.fn(async () => undefined),
    };
    const permissionGrants = [{ id: "grant-1" }];
    const modelRuntimeSettings = { provider: "ambient" };
    const store = {
      listPermissionGrants: vi.fn(() => permissionGrants),
      setPluginEnabled: vi.fn(),
      getModelRuntimeSettings: vi.fn(() => modelRuntimeSettings),
      isPluginEnabled: vi.fn(() => true),
      isPluginTrusted: vi.fn(() => false),
      isPiPackageEnabled: vi.fn(() => true),
    };
    const markPluginToolsStale = vi.fn();

    const callbacks = createAgentRuntimePluginInstallApplyCallbacks({
      pluginHost: pluginHost as any,
      store: store as any,
      markPluginToolsStale,
    });

    expect(callbacks.listPermissionGrants()).toBe(permissionGrants);
    await expect(callbacks.previewCodexPluginInstall("/workspace", { source: "marketplace.json" } as any))
      .resolves.toMatchObject({ kind: "preview", workspacePath: "/workspace" });
    await expect(callbacks.commitCodexPluginInstall("/workspace", { source: "marketplace.json" } as any))
      .resolves.toMatchObject({ kind: "commit", workspacePath: "/workspace" });
    await expect(callbacks.installCodexPluginDependencies("/workspace", { pluginId: "plugin-1" } as any))
      .resolves.toMatchObject({ kind: "deps", workspacePath: "/workspace" });

    await callbacks.readCodexPluginCatalog("/workspace");
    callbacks.setPluginEnabled("plugin-1", true);
    callbacks.markPluginToolsStale();
    expect(callbacks.getModelRuntimeSettings()).toBe(modelRuntimeSettings);
    await callbacks.shutdownPluginMcpServers();

    expect(pluginHost.readCodexPluginCatalog).toHaveBeenCalledWith("/workspace", expect.any(Object));
    expect(store.isPluginEnabled).toHaveBeenCalledWith("plugin-1");
    expect(store.isPluginTrusted).toHaveBeenCalledWith("plugin-1", "fingerprint-1");
    expect(pluginStateProbe).toEqual({ enabled: true, trusted: false });
    expect(store.setPluginEnabled).toHaveBeenCalledWith("plugin-1", true);
    expect(markPluginToolsStale).toHaveBeenCalledOnce();
    expect(pluginHost.shutdownPluginMcpServers).toHaveBeenCalledOnce();
  });
});
