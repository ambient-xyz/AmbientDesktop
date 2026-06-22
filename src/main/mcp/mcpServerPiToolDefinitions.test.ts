import { describe, expect, it } from "vitest";
import { createMcpServerPiToolDefinitions, type McpServerPiToolOptions } from "./mcpServerPiTools";

describe("MCP server Pi tool definitions", () => {
  it("keeps the MCP server Pi tool registration order stable", () => {
    const tools = createMcpServerPiToolDefinitions({
      catalog: {} as McpServerPiToolOptions["catalog"],
      toolHive: {} as McpServerPiToolOptions["toolHive"],
      getThread: () => ({ id: "thread-1", collaborationMode: "agent", permissionMode: "default" }),
      workspace: { path: "/tmp/ambient-workspace" },
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      "ambient_mcp_server_search",
      "ambient_mcp_server_describe",
      "ambient_mcp_server_list",
      "ambient_mcp_server_diagnostics",
      "ambient_mcp_server_default_update_describe",
      "ambient_mcp_standard_import_describe",
      "ambient_mcp_standard_import_install",
      "ambient_mcp_remote_proxy_describe",
      "ambient_mcp_remote_proxy_install",
      "ambient_mcp_guided_bridge_describe",
      "ambient_mcp_guided_bridge_preflight",
      "ambient_mcp_guided_bridge_register",
      "ambient_mcp_server_install",
      "ambient_mcp_runtime_repair_describe",
      "ambient_mcp_runtime_repair_apply",
      "ambient_mcp_secret_request",
      "ambient_mcp_server_uninstall",
    ]);
  });
});
