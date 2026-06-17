import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { McpInstallCatalog } from "./mcpInstallCatalog";
import { createMcpServerPiToolDefinitions } from "./mcpServerPiTools";
import { ToolHiveRuntimeService } from "../tool-runtime/toolHiveRuntimeService";

const runLive = process.env.AMBIENT_MCP_SERVER_TOOLS_LIVE === "1";
const liveIt = runLive ? it : it.skip;

describe("MCP server Pi tools live", () => {
  liveIt(
    "searches and describes Context7 from the live ToolHive registry without installing it",
    async () => {
      const userDataPath = await mkdtemp(join(tmpdir(), "ambient-mcp-server-tools-live-"));
      const toolHive = new ToolHiveRuntimeService({
        userDataPath,
        env: {
          ...process.env,
          AMBIENT_TOOLHIVE_BINARY: process.env.AMBIENT_TOOLHIVE_BINARY || join(process.cwd(), "resources", "toolhive", "darwin-arm64", "thv"),
        },
      });
      const catalog = new McpInstallCatalog(toolHive);
      const tools = createMcpServerPiToolDefinitions({
        catalog,
        toolHive,
        getThread: () => ({
          id: "live-thread",
          collaborationMode: "agent",
          permissionMode: "workspace",
        }),
        workspace: {
          path: process.cwd(),
          name: "ambient",
        },
      });

      const search = tools.find((tool) => tool.name === "ambient_mcp_server_search");
      const describe = tools.find((tool) => tool.name === "ambient_mcp_server_describe");
      const list = tools.find((tool) => tool.name === "ambient_mcp_server_list");
      if (!search?.execute || !describe?.execute || !list?.execute) throw new Error("MCP server tools were not registered.");

      const listResult = await list.execute("live-list", {}, undefined, undefined, undefined as any);
      expect(toolText(listResult)).toContain("No Ambient-managed ToolHive MCP servers are installed.");
      expect(listResult.details).toMatchObject({ toolName: "ambient_mcp_server_list", status: "complete", serverCount: 0 });

      const searchResult = await search.execute("live-search", { query: "context7", limit: 5 }, undefined, undefined, undefined as any);
      expect(toolText(searchResult)).toContain("io.github.stacklok/context7");
      expect(searchResult.details).toMatchObject({ toolName: "ambient_mcp_server_search", status: "complete" });

      const describeResult = await describe.execute("live-describe", { serverId: "io.github.stacklok/context7" }, undefined, undefined, undefined as any);
      expect(toolText(describeResult)).toContain("Install Context7");
      expect(toolText(describeResult)).toContain("Blockers: none.");
      expect(describeResult.details).toMatchObject({
        toolName: "ambient_mcp_server_describe",
        status: "ready-for-review",
        serverId: "io.github.stacklok/context7",
      });
    },
    120_000,
  );
});

function toolText(result: { content?: Array<{ type: string; text?: string }> }): string {
  return (result.content ?? []).map((item) => item.text ?? "").join("\n");
}
