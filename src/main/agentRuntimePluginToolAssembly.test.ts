import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import {
  createAgentRuntimePluginToolExtension,
  type AgentRuntimePluginToolAssemblyOptions,
} from "./agentRuntimePluginToolAssembly";

describe("agentRuntimePluginToolAssembly", () => {
  it("registers the plugin-adjacent tool groups in the existing order", () => {
    const registeredTools: ToolDefinition<any, any, any>[] = [];

    createAgentRuntimePluginToolExtension(options())({
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any);

    const names = registeredTools.map((tool) => tool.name);
    expectSubsequence(names, [
      "ambient_mcp_autowire_plan",
      "ambient_install_route_plan",
      "ambient_json_repair",
      "ambient_capability_builder_plan",
      "ambient_capability_builder_register",
      "ambient_cli_package_preview",
      "ambient_cli",
      "ambient_workflows_search",
      "ambient_workflows_restore_version",
      "ambient_pi_extension_install_sandboxed",
      "ambient_pi_extension_clear_history",
      "ambient_pi_privileged_scan",
      "ambient_pi_privileged_clear_history",
      "ambient_cli_package_uninstall",
    ]);
    expect(names).not.toContain("ambient_mcp_server_search");
    expect(names[names.length - 1]).toBe("ambient_cli_package_uninstall");
    expect(registeredTools.every((tool) => tool.executionMode === "sequential")).toBe(true);
  });
});

function options(): AgentRuntimePluginToolAssemblyOptions<any> {
  const workspace = {
    path: "/workspace",
    name: "Workspace",
    statePath: "/workspace/.ambient",
    sessionPath: "/workspace/.ambient/sessions",
  };
  const thread = {
    id: "thread-1",
    title: "Thread",
    workspacePath: workspace.path,
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "model",
    thinkingLevel: "medium",
  } as any;
  const resolveFirstPartyPluginPermission = vi.fn(async () => true);
  const markPluginToolsStale = vi.fn();

  return {
    pluginInstallCore: {
      threadId: thread.id,
      workspace,
      model: { id: "model", baseUrl: "https://example.invalid" } as any,
      apiKey: undefined,
      mcpAppVersion: "test-version",
      getCurrentThread: () => thread,
      getThread: () => thread,
      getThreadById: () => thread,
      createMcpRuntime: vi.fn(() => undefined),
      listPermissionGrants: () => [],
      recordMcpAutowirePlan: vi.fn(),
      recordInstallRoutePlan: vi.fn(),
      browserNavigate: vi.fn(),
      emitBrowserState: vi.fn(),
      recordSetupFinalReportBrowserAudit: vi.fn(),
      withBrowserToolHeartbeat: vi.fn(),
      previewCodexPluginInstall: vi.fn(() => ({} as any)),
      commitCodexPluginInstall: vi.fn(() => ({} as any)),
      readCodexPluginCatalog: vi.fn(() => ({} as any)),
      installCodexPluginDependencies: vi.fn(() => ({} as any)),
      shutdownPluginMcpServers: vi.fn(),
      setPluginEnabled: vi.fn(),
      markPluginToolsStale,
      getModelRuntimeSettings: vi.fn(() => ({})),
      resolveFirstPartyPluginPermission: resolveFirstPartyPluginPermission as any,
      emit: vi.fn(),
    },
    capabilityBuilder: {
      workspace,
      getThread: () => thread,
      parsePlanInput: () => ({ goal: "Build a provider" }),
      planText: () => "plan",
      routePreflight: () => undefined,
      latestInstallRouteLane: () => undefined,
      mcpAutowirePlanned: () => false,
      parseScaffoldInput: () => ({ goal: "Build a provider" }) as any,
      suggestedCapabilityPackageName: () => "ambient-provider",
      parsePreviewInput: () => ({ packageName: "ambient-provider" }) as any,
      parseListFilesInput: () => ({ packageName: "ambient-provider" }) as any,
      parseReadFileInput: () => ({ packageName: "ambient-provider", path: "README.md" }) as any,
      parseWriteFileInput: () => ({ packageName: "ambient-provider", path: "README.md", content: "hello" }) as any,
      parseSecretRequestInput: () => ({ packageName: "ambient-provider", envName: "API_KEY" }) as any,
      parseHistoryInput: () => ({ packageName: "ambient-provider" }) as any,
      parseUpdatePlanInput: () => ({ packageName: "ambient-provider" }) as any,
      parseRepairPlanInput: () => ({ packageName: "ambient-provider" }) as any,
      parseApplyRepairInput: () => ({ packageName: "ambient-provider" }) as any,
      parseRemovalPlanInput: () => ({ packageName: "ambient-provider" }) as any,
      parseUnregisterInput: () => ({ packageName: "ambient-provider" }) as any,
      parseInstallDepsInput: () => ({ packageName: "ambient-provider" }) as any,
      parseValidateInput: () => ({ packageName: "ambient-provider" }) as any,
      runCapabilityBuilderValidationWithPermission: vi.fn(),
      parseRegisterInput: () => ({ packageName: "ambient-provider" }) as any,
      completeRegisteredVoiceProviderSetup: vi.fn(),
      resolveFirstPartyPluginPermission: resolveFirstPartyPluginPermission as any,
      markPluginToolsStale,
      emitDesktopEvent: vi.fn(),
    },
    ambientCliPackages: {
      workspace,
      getThread: () => thread,
      hydrateFirstPartyAmbientCliPackageSummaries: vi.fn(),
      resolveFirstPartyPluginPermission: resolveFirstPartyPluginPermission as any,
      markPluginToolsStale,
      emitAmbientCliSecretRequested: vi.fn(),
      markAmbientCliPackageDescribed: vi.fn(),
      isAmbientCliPackageDescribed: vi.fn(() => true),
    },
    ambientWorkflows: {
      store: {
        getFeatureFlagSettings: () => ({}),
      } as any,
      workflowRecordings: {},
      markAmbientWorkflowPlaybookDescribed: vi.fn(),
      isAmbientWorkflowPlaybookDescribed: vi.fn(() => true),
      getFeatureFlagSnapshot: () => ({
        subagents: false,
        callableWorkflows: false,
      }) as any,
      getCallableWorkflowRecordedPlaybooks: () => [],
    },
    piPackages: {
      workspace,
      getThread: () => thread,
      resolveFirstPartyPluginPermission: resolveFirstPartyPluginPermission as any,
      revokePluginGrantsForLabels: vi.fn(() => 0),
      markPluginToolsStale,
      emit: vi.fn(),
    },
  };
}

function expectSubsequence(values: string[], expected: string[]): void {
  let searchFrom = 0;
  for (const value of expected) {
    const index = values.indexOf(value, searchFrom);
    expect(index, `${value} should appear after index ${searchFrom}`).toBeGreaterThanOrEqual(0);
    searchFrom = index + 1;
  }
}
