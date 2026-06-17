import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { installMcpDefaultCapability } from "./mcpDefaultCapabilityInstaller";
import { McpInstallCatalog } from "./mcpInstallCatalog";
import { McpToolBridge } from "./mcpToolBridge";
import { createMcpToolBridgePiToolDefinitions } from "./mcpToolBridgePiTools";
import { resolveOrExtractToolHiveExecutable } from "../tool-runtime/toolHiveBundle";
import { ToolHiveRuntimeService } from "../tool-runtime/toolHiveRuntimeService";

const execFileAsync = promisify(execFile);
const runLive = process.env.AMBIENT_MCP_TOOL_BRIDGE_LIVE === "1";
const liveIt = runLive ? it : it.skip;
const scraplingServerId = "io.github.d4vinci/scrapling";
const scraplingWorkloadName = "ambient-scrapling";

describe("MCP tool bridge live", () => {
  liveIt(
    "installs the default Scrapling workload, discovers tools, validates args, calls a tool, and removes the workload",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "ambient-mcp-tool-bridge-live-"));
      const userDataPath = join(root, "userData");
      const workspacePath = join(root, "workspace");
      await mkdir(userDataPath, { recursive: true });
      await mkdir(workspacePath, { recursive: true });
      const thv = process.env.AMBIENT_TOOLHIVE_BINARY || (await resolveOrExtractToolHiveExecutable({
        resourcesPath: join(process.cwd(), "resources"),
        extractionRoot: join(root, "toolhive-extracted"),
      })).executablePath;
      const toolHive = new ToolHiveRuntimeService({
        userDataPath,
        env: {
          ...process.env,
          AMBIENT_TOOLHIVE_BINARY: thv,
        },
        timeoutMs: 180_000,
      });
      const catalog = new McpInstallCatalog(toolHive);
      const bridge = new McpToolBridge({
        catalog,
        toolHive,
        workspacePath,
        timeoutMs: 60_000,
      });
      const thread = {
        id: "live-mcp-thread",
        collaborationMode: "agent" as const,
        permissionMode: "workspace",
      };
      const workspace = { path: workspacePath, name: "live-workspace" };
      const mcpTools = createMcpToolBridgePiToolDefinitions({
        bridge,
        getThread: () => thread,
        workspace,
        authorizeCall: () => true,
      });

      await cleanupToolHiveDockerFragments(scraplingWorkloadName);
      try {
        const preflight = await toolHive.preflightRuntime(10);
        expect(preflight.ok, preflight.message).toBe(true);

        const installResult = await installMcpDefaultCapability({
          capabilityId: "scrapling",
          catalog,
          toolHive,
          waitForEndpointTimeoutMs: 180_000,
        });
        expect(installResult.preview.toolHiveRunSource).toContain("@sha256:");
        expect(installResult.workload).toMatchObject({
          name: scraplingWorkloadName,
          status: "running",
        });
        expect(installResult.workload.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

        const workload = await toolHive.waitForAmbientWorkload(scraplingWorkloadName, { timeoutMs: 120_000 });
        expect(workload).toMatchObject({
          name: scraplingWorkloadName,
          status: "running",
        });
        expect(workload.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

        const searchResult = await executePiTool(toolByName(mcpTools, "ambient_mcp_tool_search"), "live-search-tools", {
          serverId: scraplingServerId,
          query: "web",
          refresh: true,
        });
        expect(toolText(searchResult)).toContain("get");
        expect(searchResult.details).toMatchObject({
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_tool_search",
          status: "complete",
          resultCount: expect.any(Number),
        });

        const describeResult = await executePiTool(toolByName(mcpTools, "ambient_mcp_tool_describe"), "live-describe-tool", {
          serverId: scraplingServerId,
          toolName: "get",
        });
        expect(toolText(describeResult)).toContain("Input schema:");
        expect(toolText(describeResult)).toContain("url");

        const descriptor = await bridge.describeTool({
          serverId: scraplingServerId,
          toolName: "get",
        });
        expect(descriptor.inputSchema).toMatchObject({
          type: "object",
          required: expect.arrayContaining(["url"]),
        });
        expect(descriptor.reviewStatus).toBe("trusted");
        expect(descriptor.descriptorHash).toBeTruthy();

        await expect(executePiTool(toolByName(mcpTools, "ambient_mcp_tool_call"), "live-invalid-call", {
          serverId: scraplingServerId,
          toolName: "get",
          arguments: {},
        })).rejects.toThrow("$.url is required");

        const result = await executePiTool(toolByName(mcpTools, "ambient_mcp_tool_call"), "live-call", {
          serverId: scraplingServerId,
          toolName: "get",
          arguments: {
            url: "https://example.com",
          },
        });
        expect(toolText(result).length).toBeGreaterThan(50);
        expect(toolText(result).toLowerCase()).toContain("example");
        expect(result.details).toMatchObject({
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_tool_call",
          status: "complete",
          serverId: scraplingServerId,
          workloadName: scraplingWorkloadName,
          targetToolName: "get",
        });

        const installed = await catalog.listInstalledServers();
        expect(installed).toEqual([
          expect.objectContaining({
            serverId: scraplingServerId,
            workloadName: scraplingWorkloadName,
            workloadStatus: "running",
            endpoint: workload.endpoint,
            runtimeLane: "ambient-default-oci",
            defaultCatalogUpdateStatus: "current",
            lastKnownToolCount: expect.any(Number),
            toolDescriptorReviewStatus: "trusted",
          }),
        ]);
      } finally {
        await toolHive.stopWorkload(scraplingWorkloadName, 20).catch(() => undefined);
        await toolHive.removeWorkload(scraplingWorkloadName).catch(() => undefined);
        await cleanupToolHiveDockerFragments(scraplingWorkloadName);
        await rm(root, { recursive: true, force: true });
      }
    },
    8 * 60_000,
  );
});

function toolByName(tools: Array<{ name: string }>, name: string): any {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing live MCP tool ${name}`);
  return tool;
}

async function executePiTool(tool: { execute?: (...args: any[]) => Promise<any> }, toolCallId: string, input: Record<string, unknown>): Promise<any> {
  if (!tool.execute) throw new Error("Pi tool has no execute handler.");
  return tool.execute(toolCallId, input, undefined, undefined, undefined);
}

function toolText(result: { content?: Array<{ text?: string }> }): string {
  return (result.content ?? []).map((item) => item.text ?? "").join("\n");
}

async function cleanupToolHiveDockerFragments(workloadName: string): Promise<void> {
  await execFileAsync("docker", ["rm", "-f", workloadName, `${workloadName}-dns`, `${workloadName}-egress`], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  }).catch(() => undefined);
  await execFileAsync("docker", ["network", "rm", `toolhive-${workloadName}-internal`], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  }).catch(() => undefined);
  await rm(join(tmpdir(), workloadName), { recursive: true, force: true }).catch(() => undefined);
}
