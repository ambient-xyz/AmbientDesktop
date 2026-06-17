import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import {
  registerAgentRuntimePluginInstallCoreTools,
  type AgentRuntimePluginInstallCoreToolOptions,
} from "./agentRuntimePluginInstallCoreTools";

describe("agentRuntimePluginInstallCoreTools", () => {
  it("registers plugin install core tools in the existing order", async () => {
    const statePath = await mkdtemp(join(tmpdir(), "ambient-plugin-install-core-tools-"));
    const registeredTools: ToolDefinition<any, any, any>[] = [];
    const createMcpRuntime = vi.fn(() => undefined);
    try {
      registerAgentRuntimePluginInstallCoreTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, options({
        statePath,
        createMcpRuntime,
      }));

      const names = registeredTools.map((tool) => tool.name);
      expect(names[0]).toBe("ambient_mcp_autowire_plan");
      expect(names).toContain("ambient_mcp_autowire_review");
      expect(names).toContain("ambient_mcp_autowire_evidence_read");
      expect(names).not.toContain("ambient_mcp_server_search");
      expect(names).not.toContain("ambient_mcp_tool_search");
      expect(names.slice(-8)).toEqual([
        "ambient_install_route_plan",
        "ambient_setup_runtime_preflight",
        "ambient_setup_recipe_describe",
        "ambient_setup_final_report",
        "ambient_plugin_install_preview",
        "ambient_plugin_install_commit",
        "ambient_plugin_activate",
        "ambient_json_repair",
      ]);
      expect(registeredTools.every((tool) => tool.executionMode === "sequential")).toBe(true);
      expect(createMcpRuntime).toHaveBeenCalledWith(expect.objectContaining({ statePath }));
    } finally {
      await rm(statePath, { recursive: true, force: true });
    }
  });
});

function options(overrides: {
  statePath: string;
  createMcpRuntime: AgentRuntimePluginInstallCoreToolOptions["createMcpRuntime"];
}): AgentRuntimePluginInstallCoreToolOptions {
  const workspace = {
    path: "/workspace",
    name: "Workspace",
    statePath: overrides.statePath,
    sessionPath: join(overrides.statePath, "sessions"),
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
  return {
    threadId: thread.id,
    workspace,
    model: { id: "model", baseUrl: "https://example.invalid" } as any,
    apiKey: undefined,
    mcpAppVersion: "test-version",
    getCurrentThread: () => thread,
    getThread: () => thread,
    getThreadById: () => thread,
    createMcpRuntime: overrides.createMcpRuntime,
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
    markPluginToolsStale: vi.fn(),
    getModelRuntimeSettings: vi.fn(() => ({})),
    resolveFirstPartyPluginPermission: vi.fn(async () => true),
    emit: vi.fn(),
  };
}
