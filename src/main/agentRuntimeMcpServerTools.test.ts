import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import {
  createAgentRuntimeMcpServerToolDefinitions,
  registerAgentRuntimeMcpServerTools,
  type AgentRuntimeMcpServerToolsOptions,
} from "./agentRuntimeMcpServerTools";

describe("agentRuntimeMcpServerTools", () => {
  it("registers autowire tools when the MCP runtime is unavailable", async () => {
    const statePath = await mkdtemp(join(tmpdir(), "ambient-mcp-server-tools-"));
    const registeredTools: ToolDefinition<any, any, any>[] = [];
    const createMcpRuntime = vi.fn(() => undefined);
    try {
      registerAgentRuntimeMcpServerTools({ registerTool: (tool: any) => registeredTools.push(tool) }, options({
        statePath,
        createMcpRuntime,
      }));

      const names = registeredTools.map((tool) => tool.name);
      expect(names).toContain("ambient_mcp_autowire_plan");
      expect(names).toContain("ambient_mcp_autowire_review");
      expect(names).not.toContain("ambient_mcp_server_search");
      expect(names).not.toContain("ambient_mcp_tool_search");
      expect(registeredTools.every((tool) => tool.executionMode === "sequential")).toBe(true);
      expect(createMcpRuntime).toHaveBeenCalledWith(expect.objectContaining({ statePath }));
    } finally {
      await rm(statePath, { recursive: true, force: true });
    }
  });

  it("adds server and bridge tools when the MCP runtime is available", async () => {
    const statePath = await mkdtemp(join(tmpdir(), "ambient-mcp-server-tools-runtime-"));
    try {
      const tools = createAgentRuntimeMcpServerToolDefinitions(options({
        statePath,
        createMcpRuntime: () => ({
          mcpUserDataPath: join(statePath, "mcp-user-data"),
          toolHive: {} as any,
          catalog: {} as any,
          bridge: {} as any,
        }),
      }));

      const names = tools.map((tool) => tool.name);
      expect(names).toContain("ambient_mcp_autowire_plan");
      expect(names).toContain("ambient_mcp_server_search");
      expect(names).toContain("ambient_mcp_tool_search");
      expect(names).toContain("ambient_mcp_tool_call");
    } finally {
      await rm(statePath, { recursive: true, force: true });
    }
  });
});

function options(overrides: {
  statePath: string;
  createMcpRuntime: AgentRuntimeMcpServerToolsOptions["createMcpRuntime"];
}): AgentRuntimeMcpServerToolsOptions {
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
    createMcpRuntime: overrides.createMcpRuntime,
    listPermissionGrants: () => [],
    recordMcpAutowirePlan: vi.fn(),
    resolveFirstPartyPluginPermission: vi.fn(async () => true),
    emit: vi.fn(),
  };
}
