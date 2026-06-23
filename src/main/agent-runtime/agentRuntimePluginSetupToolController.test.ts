import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { pluginMcpToolDescriptor } from "../desktop-tools/desktopToolPluginsContract";
import type { DesktopEvent } from "../../shared/desktopTypes";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { PermissionPromptResolution } from "../../shared/permissionTypes";
import { ambientModel } from "./agentRuntimeAmbientFacade";
import { AmbientCliPackageDescriptionState } from "./ambient-cli-package/agentRuntimeAmbientCliPackageDescriptionState";
import type { AgentRuntimeGoogleWorkspaceTools } from "./agentRuntimeGoogleWorkspaceFacade";
import { AgentRuntimeInstallRouteGuard } from "./agentRuntimeInstallRouteGuard";
import type { AmbientPluginHost, PluginMcpToolRegistration } from "./agentRuntimePluginsFacade";
import {
  AgentRuntimePluginSetupToolController,
  type AgentRuntimePluginSetupToolControllerOptions,
} from "./agentRuntimePluginSetupToolController";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { AmbientWorkflowDescriptionState } from "./ambient-workflow/agentRuntimeAmbientWorkflowDescriptionState";
import { AgentRuntimeAsyncLongContextJobService } from "./tools/agentRuntimeAsyncLongContextJobs";

type RegisteredTool = {
  name: string;
  executionMode?: string;
};

describe("AgentRuntimePluginSetupToolController", () => {
  it("registers the moved plugin and setup tool groups through the new owner", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-plugin-setup-owner-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.createThread("plugin setup tools");
      const registeredTools: RegisteredTool[] = [];
      const controller = new AgentRuntimePluginSetupToolController(options(store));
      const pi = {
        registerTool: (tool: unknown) => registeredTools.push(tool as RegisteredTool),
      } as unknown as Parameters<ExtensionFactory>[0];
      const model = ambientModel("moonshotai/kimi-k2.7-code", "https://ambient.invalid/v1");

      controller.createLambdaRlmToolExtension(thread.id, workspace, model, undefined)(pi);
      controller.createPluginInstallToolExtension(thread.id, workspace, model, undefined)(pi);
      controller.createGoogleWorkspaceSetupToolExtension(workspace)(pi);
      controller.createWorkflowNativeToolExtension(thread.id, workspace)(pi);
      controller.createPluginMcpToolExtension(thread.id, workspace, [pluginMcpRegistration()])(pi);

      const names = registeredTools.map((tool) => tool.name);
      expect(names).toEqual(expect.arrayContaining([
        "long_context_process",
        "long_context_start",
        "long_context_poll",
        "long_context_cancel",
        "ambient_install_route_plan",
        "ambient_capability_builder_validate",
        "google_workspace_status",
        "workflow_current_context",
        "plugin_fixture_search",
      ]));
      expect(names.indexOf("long_context_process")).toBeLessThan(names.indexOf("ambient_install_route_plan"));
      expect(registeredTools.find((tool) => tool.name === "plugin_fixture_search")?.executionMode).toBe("sequential");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function options(store: ProjectStore): AgentRuntimePluginSetupToolControllerOptions {
  const pluginHost = {
    enabledCodexPlugins: vi.fn(async () => []),
    buildCodexPluginMcpToolRegistrations: vi.fn(async () => []),
    listRegistry: vi.fn(async () => ({ plugins: [], piPackages: [] })),
    callCodexPluginMcpTool: vi.fn(async () => ({
      content: [{ type: "text", text: "ok" }],
      details: {
        pluginId: "plugin.fixture",
        pluginName: "Fixture",
        serverName: "fixture",
        toolName: "search",
      },
    })),
    previewCodexPluginInstall: vi.fn(),
    commitCodexPluginInstall: vi.fn(),
    readCodexPluginCatalog: vi.fn(async () => ({ plugins: [], marketplaces: [] })),
    installCodexPluginDependencies: vi.fn(),
    shutdownPluginMcpServers: vi.fn(),
  } as unknown as AmbientPluginHost;
  return {
    store,
    browser: {
      navigate: vi.fn(),
    } as unknown as AgentRuntimePluginSetupToolControllerOptions["browser"],
    permissions: {
      request: vi.fn(async (): Promise<PermissionPromptResolution> => ({ allowed: true, mode: "allow_once" })),
    },
    asyncLongContextJobs: () => new AgentRuntimeAsyncLongContextJobService(),
    getRunId: () => undefined,
    pluginHost,
    mcpToolOrchestration: {
      createMcpRuntime: vi.fn(),
    } as unknown as AgentRuntimePluginSetupToolControllerOptions["mcpToolOrchestration"],
    installRouteGuard: new AgentRuntimeInstallRouteGuard(),
    ambientCliPackageDescriptionState: new AmbientCliPackageDescriptionState(),
    ambientWorkflowDescriptionState: new AmbientWorkflowDescriptionState(),
    providerRuntime: {
      completeRegisteredVoiceProviderSetup: vi.fn(async () => ({
        text: "ok",
        details: {},
      })),
    },
    workflowPlanEditIntentByThreadId: new Map(),
    workflowPlanEditWorkflowThreadByThreadId: new Map(),
    features: {
      mcp: { appVersion: "test-version" },
      googleWorkspace: {} as unknown as AgentRuntimeGoogleWorkspaceTools,
      workflowNativeTools: {},
      search: {},
      workflowRecordings: {},
    },
    fileAuthorityRootPathsForThread: () => [],
    includeWorkspaceRootAuthorityForThread: () => true,
    requestFileAuthority: vi.fn(async () => true),
    resolveFirstPartyPluginPermission: vi.fn(async () => true),
    ensurePluginMcpToolTrusted: vi.fn(async () => true),
    revokePluginGrantsForLabels: vi.fn(() => 0),
    markPluginToolsStale: vi.fn(),
    emitBrowserState: vi.fn(async () => undefined),
    recordBrowserAudit: vi.fn(),
    getFeatureFlagSnapshot: () => resolveAmbientFeatureFlags(),
    emit: vi.fn<(event: DesktopEvent) => void>(),
  };
}

function pluginMcpRegistration(): PluginMcpToolRegistration {
  const parameters = {
    type: "object",
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
    additionalProperties: false,
  };
  const descriptor = pluginMcpToolDescriptor({
    registeredName: "plugin_fixture_search",
    label: "Fixture Search",
    description: "Search a fixture plugin.",
    promptSnippet: "Use plugin_fixture_search for fixture plugin search.",
    promptGuidelines: [],
    parameters,
  });
  return {
    registeredName: "plugin_fixture_search",
    originalName: "search",
    label: "Fixture Search",
    description: "Search a fixture plugin.",
    promptSnippet: "Use plugin_fixture_search for fixture plugin search.",
    promptGuidelines: [],
    parameters,
    descriptor,
    launchPlan: {
      pluginId: "plugin.fixture",
      pluginName: "Fixture",
      pluginVersion: "1.0.0",
      pluginFingerprint: "fixture-fingerprint",
      serverName: "fixture",
      cwd: "/tmp",
      args: [],
      envKeys: [],
      enabled: true,
      startable: true,
    },
    tool: {
      pluginId: "plugin.fixture",
      pluginName: "Fixture",
      serverName: "fixture",
      name: "search",
      description: "Search a fixture plugin.",
      inputSchema: parameters,
    },
  };
}
