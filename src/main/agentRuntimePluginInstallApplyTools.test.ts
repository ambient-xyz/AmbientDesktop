import { describe, expect, it, vi } from "vitest";

import { registerPluginInstallApplyTools } from "./agentRuntimePluginInstallApplyTools";

describe("agentRuntimePluginInstallApplyTools", () => {
  it("previews, approves, commits, and marks plugin tools stale", async () => {
    const plugin = pluginFixture();
    const workspace = workspaceFixture();
    const tools = registeredApplyTools({
      workspace,
      previewCodexPluginInstall: vi.fn(async () => ({
        source: "https://example.test/marketplace.json",
        marketplaceSources: [],
        candidates: [plugin],
        errors: [],
        installableCount: 1,
      })),
      commitCodexPluginInstall: vi.fn(async () => ({
        source: "https://example.test/marketplace.json",
        preview: {
          source: "https://example.test/marketplace.json",
          marketplaceSources: [],
          candidates: [plugin],
          errors: [],
          installableCount: 1,
        },
        plugin,
        installedAt: "2026-06-10T18:00:00.000Z",
      })),
    });

    const updates: any[] = [];
    const result = await tools.commit.execute(
      "install",
      {
        source: "https://example.test/marketplace.json",
        pluginName: "ambient-demo",
      },
      undefined,
      (update: any) => updates.push(update),
    );

    expect(tools.previewCodexPluginInstall).toHaveBeenCalledWith(workspace.path, {
      source: "https://example.test/marketplace.json",
    });
    expect(tools.resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "ambient_plugin_install_commit",
      title: "Install Codex plugin \"Ambient Demo\"?",
      grantTargetLabel: "Install Codex plugin Ambient Demo",
    }));
    expect(tools.commitCodexPluginInstall).toHaveBeenCalledWith(workspace.path, {
      source: "https://example.test/marketplace.json",
      pluginName: "ambient-demo",
    });
    expect(tools.shutdownPluginMcpServers).toHaveBeenCalledTimes(1);
    expect(tools.markPluginToolsStale).toHaveBeenCalledTimes(1);
    expect(updates.map((update) => update.details.status)).toEqual(["previewing", "installing"]);
    expect(result.content[0].text).toContain("Plugin install committed");
    expect(result.details).toMatchObject({
      runtime: "ambient-plugin-install",
      toolName: "ambient_plugin_install_commit",
      pluginId: "ambient-demo",
      pluginName: "ambient-demo",
      resetPluginMcpRuntimes: true,
    });
  });

  it("approves activation, installs missing dependencies, enables the plugin, and resets runtimes", async () => {
    const plugin = pluginFixture({
      dependencyStatus: {
        packageJsonPath: "/workspace/plugins/ambient-demo/package.json",
        manager: "pnpm",
        installCommand: ["pnpm", "install"],
        required: true,
        installed: false,
        missingPackages: ["zod"],
      },
    });
    const workspace = workspaceFixture();
    const tools = registeredApplyTools({
      workspace,
      readCodexPluginCatalog: vi.fn(async () => ({
        marketplaces: [],
        plugins: [plugin],
        importCandidates: [],
        errors: [],
      })),
    });

    const updates: any[] = [];
    const result = await tools.activate.execute(
      "activate",
      {
        pluginId: "ambient-demo",
        installDependencies: true,
      },
      undefined,
      (update: any) => updates.push(update),
    );

    expect(tools.resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "ambient_plugin_activate",
      title: "Activate Codex plugin \"Ambient Demo\"?",
      grantTargetIdentity: "ambient_plugin_activate\u0000ambient-demo\u0000install-dependencies",
    }));
    expect(tools.installCodexPluginDependencies).toHaveBeenCalledWith(workspace.path, {
      pluginId: "ambient-demo",
    });
    expect(tools.setPluginEnabled).toHaveBeenCalledWith("ambient-demo", true);
    expect(tools.shutdownPluginMcpServers).toHaveBeenCalledTimes(1);
    expect(tools.markPluginToolsStale).toHaveBeenCalledTimes(1);
    expect(updates.map((update) => update.details.status)).toEqual(["inspecting", "installing-dependencies"]);
    expect(result.content[0].text).toContain("Plugin activated");
    expect(result.details).toMatchObject({
      runtime: "ambient-plugin-install",
      toolName: "ambient_plugin_activate",
      pluginId: "ambient-demo",
      enabled: true,
      installedDependencies: true,
      resetPluginMcpRuntimes: true,
    });
  });

  it("blocks activation with missing dependencies before approval when dependency install is not requested", async () => {
    const plugin = pluginFixture({
      dependencyStatus: {
        packageJsonPath: "/workspace/plugins/ambient-demo/package.json",
        manager: "pnpm",
        installCommand: ["pnpm", "install"],
        required: true,
        installed: false,
        missingPackages: ["zod"],
      },
    });
    const tools = registeredApplyTools({
      readCodexPluginCatalog: vi.fn(async () => ({
        marketplaces: [],
        plugins: [plugin],
        importCandidates: [],
        errors: [],
      })),
    });

    await expect(tools.activate.execute("activate", { pluginId: "ambient-demo" })).rejects.toThrow(
      "has missing dependencies",
    );
    expect(tools.resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(tools.setPluginEnabled).not.toHaveBeenCalled();
    expect(tools.shutdownPluginMcpServers).not.toHaveBeenCalled();
  });
});

function registeredApplyTools(overrides: Record<string, any> = {}) {
  const workspace = overrides.workspace ?? workspaceFixture();
  const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
  const plugin = pluginFixture();
  const options = {
    workspace,
    getThread: vi.fn(() => ({
      id: "thread-1",
      collaborationMode: "chat",
      permissionMode: "default",
    })),
    previewCodexPluginInstall: vi.fn(async () => ({
      source: "https://example.test/marketplace.json",
      marketplaceSources: [],
      candidates: [plugin],
      errors: [],
      installableCount: 1,
    })),
    commitCodexPluginInstall: vi.fn(async () => ({
      source: "https://example.test/marketplace.json",
      preview: {
        source: "https://example.test/marketplace.json",
        marketplaceSources: [],
        candidates: [plugin],
        errors: [],
        installableCount: 1,
      },
      plugin,
      installedAt: "2026-06-10T18:00:00.000Z",
    })),
    readCodexPluginCatalog: vi.fn(async () => ({
      marketplaces: [],
      plugins: [plugin],
      importCandidates: [],
      errors: [],
    })),
    installCodexPluginDependencies: vi.fn(async () => ({
      pluginId: "ambient-demo",
      pluginName: "ambient-demo",
      manager: "pnpm",
      command: ["pnpm", "install"],
      cwd: "/workspace/plugins/ambient-demo",
      installedAt: "2026-06-10T18:01:00.000Z",
    })),
    shutdownPluginMcpServers: vi.fn(async () => undefined),
    setPluginEnabled: vi.fn(),
    markPluginToolsStale: vi.fn(),
    resolveFirstPartyPluginPermission: vi.fn(async () => true),
    ...overrides,
  };

  registerPluginInstallApplyTools({
    registerTool: (tool: any) => registeredTools.push(tool),
  }, options as any);

  const commit = registeredTools.find((tool) => tool.name === "ambient_plugin_install_commit");
  const activate = registeredTools.find((tool) => tool.name === "ambient_plugin_activate");
  if (!commit || !activate) throw new Error("Missing plugin install apply tools.");
  return {
    ...options,
    registeredTools,
    commit,
    activate,
  };
}

function workspaceFixture() {
  return {
    id: "workspace-1",
    path: "/workspace",
    name: "Workspace",
  };
}

function pluginFixture(overrides: Record<string, any> = {}) {
  return {
    id: "ambient-demo",
    name: "ambient-demo",
    version: "1.0.0",
    description: "Demo plugin.",
    marketplaceName: "local",
    marketplacePath: "/workspace/.codex/plugins/marketplace.json",
    rootPath: "/workspace/plugins/ambient-demo",
    sourceKind: "remote-marketplace",
    compatibilityTier: "supported",
    compatibilityNotes: [],
    supportLabels: [],
    displayName: "Ambient Demo",
    skills: [{ name: "demo-skill" }],
    mcpServers: [],
    apps: [],
    sourceUrl: "https://example.test/ambient-demo.git",
    sourceRef: "main",
    sourceSha: "abcdef123456",
    imported: true,
    enabled: false,
    trusted: false,
    errors: [],
    ...overrides,
  };
}
