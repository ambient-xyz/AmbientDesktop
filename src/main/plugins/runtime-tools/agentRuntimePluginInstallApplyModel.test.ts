import { describe, expect, it } from "vitest";

import type { CodexPluginSummary, ThreadSummary, WorkspaceState } from "../../../shared/types";
import type { CodexPluginInstallPreview } from "../codex/codexPlugins";
import {
  pluginActivationApprovalDetail,
  pluginActivationDetails,
  pluginActivationDependencyInstallInput,
  pluginActivationDependencyInstallUpdate,
  pluginActivationDependencyState,
  pluginActivationGrantIdentity,
  pluginActivationInspectUpdate,
  pluginActivationMissingDependenciesMessage,
  pluginActivationParams,
  pluginActivationPermissionRequest,
  pluginActivationText,
  pluginActivationToolResult,
  pluginInstallApprovalDetail,
  pluginInstallCommitDetails,
  pluginInstallCommitInput,
  pluginInstallCommitParams,
  pluginInstallCommitText,
  pluginInstallCommitToolResult,
  pluginInstallGrantIdentity,
  pluginInstallInstallingUpdate,
  pluginInstallPermissionRequest,
  pluginInstallPreviewInput,
  pluginInstallPreviewUpdate,
  selectInstalledPluginForRuntime,
  selectPluginInstallCandidateForRuntime,
} from "./agentRuntimePluginInstallApplyModel";

describe("agentRuntimePluginInstallApplyModel", () => {
  it("parses plugin install and activation tool params", () => {
    expect(pluginInstallCommitParams({
      source: " https://example.test/marketplace.json ",
      name: "ambient-demo-source",
      pluginId: "ambient-demo",
      pluginName: "Ambient Demo",
    })).toEqual({
      source: " https://example.test/marketplace.json ",
      name: "ambient-demo-source",
      pluginId: "ambient-demo",
      pluginName: "Ambient Demo",
    });
    expect(pluginInstallCommitParams({
      source: "https://example.test/marketplace.json",
      name: " ",
      pluginId: 42,
    })).toEqual({
      source: "https://example.test/marketplace.json",
      name: undefined,
      pluginId: undefined,
      pluginName: undefined,
    });
    expect(() => pluginInstallCommitParams({ source: " " })).toThrow("source is required.");

    expect(pluginActivationParams({
      pluginId: "ambient-demo",
      pluginName: "Ambient Demo",
      installDependencies: true,
    })).toEqual({
      pluginId: "ambient-demo",
      pluginName: "Ambient Demo",
      installDependencies: true,
    });
    expect(pluginActivationParams({
      pluginName: "Ambient Demo",
      installDependencies: "true",
    })).toEqual({
      pluginId: undefined,
      pluginName: "Ambient Demo",
      installDependencies: false,
    });
    expect(() => pluginActivationParams({
      pluginId: " ",
      pluginName: 42,
      installDependencies: true,
    })).toThrow("pluginId or pluginName is required.");
  });

  it("builds plugin install preview and commit inputs", () => {
    expect(pluginInstallPreviewInput({
      source: "https://example.test/marketplace.json",
      name: "ambient-demo-source",
    })).toEqual({
      source: "https://example.test/marketplace.json",
      name: "ambient-demo-source",
    });

    expect(pluginInstallPreviewInput({
      source: "https://example.test/marketplace.json",
    })).toEqual({
      source: "https://example.test/marketplace.json",
    });

    expect(pluginInstallCommitInput({
      source: "https://example.test/marketplace.json",
      name: "ambient-demo-source",
      pluginId: "ambient-demo",
      pluginName: "Ambient Demo",
    })).toEqual({
      source: "https://example.test/marketplace.json",
      name: "ambient-demo-source",
      pluginId: "ambient-demo",
      pluginName: "Ambient Demo",
    });

    expect(pluginInstallCommitInput({
      source: "https://example.test/marketplace.json",
    })).toEqual({
      source: "https://example.test/marketplace.json",
    });
  });

  it("builds plugin install and activation progress updates", () => {
    const plugin = pluginFixture();

    expect(pluginInstallPreviewUpdate({
      source: "https://example.test/marketplace.json",
      pluginId: "ambient-demo",
      pluginName: "Ambient Demo",
    })).toEqual({
      content: [{ type: "text", text: "Previewing plugin install source https://example.test/marketplace.json before requesting approval." }],
      details: {
        runtime: "ambient-plugin-install",
        toolName: "ambient_plugin_install_commit",
        status: "previewing",
        source: "https://example.test/marketplace.json",
        pluginId: "ambient-demo",
        pluginName: "Ambient Demo",
      },
    });

    expect(pluginInstallInstallingUpdate({
      source: "https://example.test/marketplace.json",
      selected: plugin,
    })).toEqual({
      content: [{ type: "text", text: "Installing Codex plugin \"Ambient Demo\"." }],
      details: {
        runtime: "ambient-plugin-install",
        toolName: "ambient_plugin_install_commit",
        status: "installing",
        source: "https://example.test/marketplace.json",
        pluginId: "ambient-demo",
        pluginName: "ambient-demo",
      },
    });

    expect(pluginActivationInspectUpdate({
      pluginName: "Ambient Demo",
      installDependencies: true,
    })).toEqual({
      content: [{ type: "text", text: "Inspecting installed Codex plugin Ambient Demo." }],
      details: {
        runtime: "ambient-plugin-install",
        toolName: "ambient_plugin_activate",
        status: "inspecting",
        pluginId: undefined,
        pluginName: "Ambient Demo",
        installDependencies: true,
      },
    });

    expect(pluginActivationDependencyInstallUpdate(plugin)).toEqual({
      content: [{ type: "text", text: "Installing dependencies for Codex plugin \"Ambient Demo\"." }],
      details: {
        runtime: "ambient-plugin-install",
        toolName: "ambient_plugin_activate",
        status: "installing-dependencies",
        pluginId: "ambient-demo",
        pluginName: "ambient-demo",
      },
    });
  });

  it("selects plugin install candidates by id, display name, or default", () => {
    const first = pluginFixture({ id: "first-plugin", name: "first-plugin", displayName: "First Plugin" });
    const second = pluginFixture({ id: "second-plugin", name: "second-plugin", displayName: "Second Plugin" });
    const preview = previewFixture({ candidates: [first, second] });

    expect(selectPluginInstallCandidateForRuntime(preview, { pluginId: "first-plugin" })).toBe(first);
    expect(selectPluginInstallCandidateForRuntime(preview, { pluginName: "Second Plugin" })).toBe(second);
    expect(selectPluginInstallCandidateForRuntime(previewFixture({ candidates: [first] }), {})).toBe(first);
    expect(() => selectPluginInstallCandidateForRuntime(preview, {})).toThrow("multiple candidates");
  });

  it("formats install approval detail and commit text", () => {
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
    const preview = previewFixture({ candidates: [plugin] });

    expect(pluginInstallApprovalDetail(workspaceFixture(), preview, plugin)).toBe([
      "Workspace: /workspace",
      "Source: https://example.test/marketplace.json",
      "Plugin: Ambient Demo",
      "Plugin id: ambient-demo",
      "Version: 1.0.0",
      "Compatibility: supported",
      "Git URL: https://example.test/ambient-demo.git",
      "Ref: main",
      "SHA: abcdef123456",
      "Capabilities: 1 skills, 1 MCP servers, 1 apps",
      "Dependencies: missing",
    ].join("\n"));

    expect(pluginInstallGrantIdentity({
      source: "https://example.test/marketplace.json",
      name: "ambient-demo-source",
      pluginId: "ambient-demo",
      pluginName: "Ambient Demo",
      selected: plugin,
    })).toBe([
      "ambient_plugin_install_commit",
      "https://example.test/marketplace.json",
      "ambient-demo-source",
      "ambient-demo",
      "Ambient Demo",
      "ambient-demo",
      "/workspace/plugins/ambient-demo",
    ].join("\0"));

    expect(pluginInstallPermissionRequest({
      thread: threadFixture(),
      workspace: workspaceFixture(),
      source: "https://example.test/marketplace.json",
      name: "ambient-demo-source",
      pluginId: "ambient-demo",
      pluginName: "Ambient Demo",
      preview,
      selected: plugin,
    })).toEqual({
      thread: threadFixture(),
      workspace: workspaceFixture(),
      toolName: "ambient_plugin_install_commit",
      title: "Install Codex plugin \"Ambient Demo\"?",
      message: "Ambient wants to clone and import this pinned Git-backed Codex plugin into the workspace. This does not enable, trust, install dependencies, or run plugin code.",
      detail: [
        "Workspace: /workspace",
        "Source: https://example.test/marketplace.json",
        "Plugin: Ambient Demo",
        "Plugin id: ambient-demo",
        "Version: 1.0.0",
        "Compatibility: supported",
        "Git URL: https://example.test/ambient-demo.git",
        "Ref: main",
        "SHA: abcdef123456",
        "Capabilities: 1 skills, 1 MCP servers, 1 apps",
        "Dependencies: missing",
      ].join("\n"),
      grantTargetLabel: "Install Codex plugin Ambient Demo",
      grantTargetIdentity: [
        "ambient_plugin_install_commit",
        "https://example.test/marketplace.json",
        "ambient-demo-source",
        "ambient-demo",
        "Ambient Demo",
        "ambient-demo",
        "/workspace/plugins/ambient-demo",
      ].join("\0"),
      allowedReason: "Plugin install approved by Ambient permission grant policy.",
      deniedReason: "Plugin install prompt denied or timed out.",
    });

    expect(pluginInstallCommitText({
      source: "https://example.test/marketplace.json",
      preview,
      plugin,
      installedAt: "2026-06-10T18:00:00.000Z",
    })).toBe([
      "Plugin install committed",
      "Source: https://example.test/marketplace.json",
      "Plugin: Ambient Demo",
      "Plugin id: ambient-demo",
      "Version: 1.0.0",
      "Compatibility: supported",
      "Capabilities: 1 skills, 1 MCP servers, 1 apps",
      "Dependencies: missing; install dependencies before enabling dependent tools.",
      "Plugin MCP runtimes were reset. Enable and trust the plugin separately before running plugin tools.",
    ].join("\n"));

    expect(pluginInstallCommitDetails({
      source: "https://example.test/marketplace.json",
      result: {
        source: "https://example.test/marketplace.json",
        preview,
        plugin,
        installedAt: "2026-06-10T18:00:00.000Z",
      },
    })).toEqual({
      runtime: "ambient-plugin-install",
      toolName: "ambient_plugin_install_commit",
      source: "https://example.test/marketplace.json",
      pluginId: "ambient-demo",
      pluginName: "ambient-demo",
      compatibilityTier: "supported",
      installedAt: "2026-06-10T18:00:00.000Z",
      resetPluginMcpRuntimes: true,
    });

    expect(pluginInstallCommitToolResult({
      source: "https://example.test/marketplace.json",
      result: {
        source: "https://example.test/marketplace.json",
        preview,
        plugin,
        installedAt: "2026-06-10T18:00:00.000Z",
      },
    })).toEqual({
      content: [{
        type: "text",
        text: [
          "Plugin install committed",
          "Source: https://example.test/marketplace.json",
          "Plugin: Ambient Demo",
          "Plugin id: ambient-demo",
          "Version: 1.0.0",
          "Compatibility: supported",
          "Capabilities: 1 skills, 1 MCP servers, 1 apps",
          "Dependencies: missing; install dependencies before enabling dependent tools.",
          "Plugin MCP runtimes were reset. Enable and trust the plugin separately before running plugin tools.",
        ].join("\n"),
      }],
      details: {
        runtime: "ambient-plugin-install",
        toolName: "ambient_plugin_install_commit",
        source: "https://example.test/marketplace.json",
        pluginId: "ambient-demo",
        pluginName: "ambient-demo",
        compatibilityTier: "supported",
        installedAt: "2026-06-10T18:00:00.000Z",
        resetPluginMcpRuntimes: true,
      },
    });
  });

  it("selects installed plugins and formats activation approval and result text", () => {
    const plugin = pluginFixture({
      enabled: false,
      trusted: false,
      dependencyStatus: {
        packageJsonPath: "/workspace/plugins/ambient-demo/package.json",
        manager: "pnpm",
        installCommand: ["pnpm", "install"],
        required: true,
        installed: false,
        missingPackages: ["zod", "yaml"],
      },
    });

    expect(selectInstalledPluginForRuntime({
      marketplaces: [],
      plugins: [plugin],
      importCandidates: [],
      errors: [],
    }, { pluginName: "Ambient Demo" })).toBe(plugin);
    expect(() => selectInstalledPluginForRuntime({
      marketplaces: [],
      plugins: [],
      importCandidates: [],
      errors: [],
    }, {})).toThrow("pluginId or pluginName is required");

    expect(pluginActivationApprovalDetail(workspaceFixture(), plugin, true)).toBe([
      "Workspace: /workspace",
      "Plugin: Ambient Demo",
      "Plugin id: ambient-demo",
      "Directory: /workspace/plugins/ambient-demo",
      "Compatibility: supported",
      "Capabilities: 1 skills, 1 MCP servers, 1 apps",
      "Currently enabled: no",
      "Currently trusted: no",
      "Dependencies: missing via pnpm",
      "Dependency command: pnpm install",
      "Missing packages: zod, yaml",
      "Trust: not granted by this activation; MCP tools still prompt on first use.",
    ].join("\n"));

    expect(pluginActivationGrantIdentity(plugin, true)).toBe("ambient_plugin_activate\0ambient-demo\0install-dependencies");
    expect(pluginActivationGrantIdentity(plugin, false)).toBe("ambient_plugin_activate\0ambient-demo\0enable-only");
    expect(pluginActivationDependencyState(plugin)).toEqual({
      dependenciesRequired: true,
      dependenciesMissing: true,
    });
    expect(pluginActivationDependencyState(pluginFixture({
      dependencyStatus: {
        packageJsonPath: "/workspace/plugins/ambient-demo/package.json",
        manager: "pnpm",
        installCommand: ["pnpm", "install"],
        required: true,
        installed: true,
        missingPackages: [],
      },
    }))).toEqual({
      dependenciesRequired: true,
      dependenciesMissing: false,
    });
    expect(pluginActivationDependencyState(pluginFixture())).toEqual({
      dependenciesRequired: false,
      dependenciesMissing: false,
    });
    expect(pluginActivationMissingDependenciesMessage(plugin)).toBe(
      "Codex plugin \"Ambient Demo\" has missing dependencies. Re-run ambient_plugin_activate with installDependencies=true after the user approves dependency installation.",
    );
    expect(pluginActivationDependencyInstallInput(plugin)).toEqual({
      pluginId: "ambient-demo",
    });
    expect(pluginActivationPermissionRequest({
      thread: threadFixture(),
      workspace: workspaceFixture(),
      plugin,
      installDependencies: true,
    })).toEqual({
      thread: threadFixture(),
      workspace: workspaceFixture(),
      toolName: "ambient_plugin_activate",
      title: "Activate Codex plugin \"Ambient Demo\"?",
      message: "Ambient wants to install this plugin's declared dependencies and enable it. Plugin MCP tools will still require first-use trust.",
      detail: [
        "Workspace: /workspace",
        "Plugin: Ambient Demo",
        "Plugin id: ambient-demo",
        "Directory: /workspace/plugins/ambient-demo",
        "Compatibility: supported",
        "Capabilities: 1 skills, 1 MCP servers, 1 apps",
        "Currently enabled: no",
        "Currently trusted: no",
        "Dependencies: missing via pnpm",
        "Dependency command: pnpm install",
        "Missing packages: zod, yaml",
        "Trust: not granted by this activation; MCP tools still prompt on first use.",
      ].join("\n"),
      grantTargetLabel: "Activate Codex plugin Ambient Demo",
      grantTargetIdentity: "ambient_plugin_activate\0ambient-demo\0install-dependencies",
      allowedReason: "Plugin activation approved by Ambient permission grant policy.",
      deniedReason: "Plugin activation prompt denied or timed out.",
    });

    expect(pluginActivationText({
      plugin,
      dependenciesRequired: true,
      installedDependencies: true,
    })).toBe([
      "Plugin activated",
      "Plugin: Ambient Demo",
      "Plugin id: ambient-demo",
      "Dependencies: installed",
      "Plugin MCP runtimes were reset.",
      "Plugin MCP tools still require first-use trust and will be available after the Pi session refreshes or on the next turn.",
    ].join("\n"));

    expect(pluginActivationDetails({
      plugin,
      installedDependencies: true,
    })).toEqual({
      runtime: "ambient-plugin-install",
      toolName: "ambient_plugin_activate",
      pluginId: "ambient-demo",
      pluginName: "ambient-demo",
      enabled: true,
      installedDependencies: true,
      resetPluginMcpRuntimes: true,
      availability: "next-session-refresh",
    });

    expect(pluginActivationToolResult({
      plugin,
      dependenciesRequired: true,
      installedDependencies: true,
    })).toEqual({
      content: [{
        type: "text",
        text: [
          "Plugin activated",
          "Plugin: Ambient Demo",
          "Plugin id: ambient-demo",
          "Dependencies: installed",
          "Plugin MCP runtimes were reset.",
          "Plugin MCP tools still require first-use trust and will be available after the Pi session refreshes or on the next turn.",
        ].join("\n"),
      }],
      details: {
        runtime: "ambient-plugin-install",
        toolName: "ambient_plugin_activate",
        pluginId: "ambient-demo",
        pluginName: "ambient-demo",
        enabled: true,
        installedDependencies: true,
        resetPluginMcpRuntimes: true,
        availability: "next-session-refresh",
      },
    });
  });
});

function workspaceFixture(): WorkspaceState {
  return {
    path: "/workspace",
    name: "Workspace",
    statePath: "/workspace/.ambient",
    sessionPath: "/workspace/.ambient/sessions",
  };
}

function threadFixture(): ThreadSummary {
  return {
    id: "thread-1",
    title: "Thread",
    workspacePath: "/workspace",
    createdAt: "2026-06-10T18:00:00.000Z",
    updatedAt: "2026-06-10T18:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient",
    thinkingLevel: "medium",
  };
}

function previewFixture(overrides: Partial<CodexPluginInstallPreview> = {}): CodexPluginInstallPreview {
  return {
    source: "https://example.test/marketplace.json",
    marketplaceSources: [],
    candidates: [pluginFixture()],
    errors: [],
    installableCount: 1,
    ...overrides,
  } as CodexPluginInstallPreview;
}

function pluginFixture(overrides: Partial<CodexPluginSummary> = {}): CodexPluginSummary {
  return {
    id: "ambient-demo",
    name: "ambient-demo",
    version: "1.0.0",
    description: "Demo plugin.",
    marketplaceName: "local",
    marketplacePath: "/workspace/.codex/plugins/marketplace.json",
    rootPath: "/workspace/plugins/ambient-demo",
    sourceKind: "remote-marketplace" as const,
    compatibilityTier: "supported" as const,
    compatibilityNotes: [],
    supportLabels: [],
    displayName: "Ambient Demo",
    skills: [{ name: "demo-skill" }],
    mcpServers: [{ name: "demo-server" }],
    apps: [{ name: "demo-app" }],
    sourceUrl: "https://example.test/ambient-demo.git",
    sourceRef: "main",
    sourceSha: "abcdef123456",
    imported: true,
    enabled: false,
    trusted: false,
    errors: [],
    ...overrides,
  } as CodexPluginSummary;
}
