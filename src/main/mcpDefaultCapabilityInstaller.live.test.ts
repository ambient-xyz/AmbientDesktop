import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { installMcpDefaultCapability } from "./mcpDefaultCapabilityInstaller";
import { McpInstallCatalog } from "./mcpInstallCatalog";
import { McpToolBridge } from "./mcpToolBridge";
import { resolveOrExtractToolHiveExecutable } from "./toolHiveBundle";
import { ToolHiveRuntimeService } from "./toolHiveRuntimeService";

const execFileAsync = promisify(execFile);
const runLive = process.env.AMBIENT_MCP_SCRAPLING_DEFAULT_LIVE === "1";
const liveIt = runLive ? it : it.skip;
const scraplingServerId = "io.github.d4vinci/scrapling";
const scraplingWorkloadName = "ambient-scrapling";

describe("MCP default Scrapling capability live", () => {
  liveIt(
    "installs the pinned Scrapling default OCI workload, discovers tools, calls get, and removes the workload",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "ambient-mcp-scrapling-default-live-"));
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
        timeoutMs: 300_000,
      });
      const catalog = new McpInstallCatalog(toolHive);
      const bridge = new McpToolBridge({
        catalog,
        toolHive,
        workspacePath,
        timeoutMs: 120_000,
      });

      await cleanupScrapling(toolHive);
      try {
        const preflight = await toolHive.preflightRuntime(10);
        expect(preflight.ok, preflight.message).toBe(true);

        const install = await installMcpDefaultCapability({
          capabilityId: "scrapling",
          catalog,
          toolHive,
          waitForEndpointTimeoutMs: 180_000,
        });
        expect(install.preview.toolHiveRunSource).toContain("@sha256:");
        expect(install.preview.toolHiveServerArgs).toEqual(["mcp"]);
        expect(install.workload).toMatchObject({
          name: scraplingWorkloadName,
          status: "running",
        });
        expect(install.workload.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

        const tools = await bridge.searchTools({
          serverId: scraplingServerId,
          refresh: true,
          limit: 20,
        });
        expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["get", "fetch", "screenshot"]));

        const result = await bridge.callTool({
          serverId: scraplingServerId,
          toolName: "get",
          arguments: { url: "https://example.com" },
        });
        expect(result.descriptor.workloadName).toBe(scraplingWorkloadName);
        expect(result.text.toLowerCase()).toContain("example");
        expect(result.output.totalChars).toBeGreaterThan(0);

        const installed = await catalog.listInstalledServers();
        expect(installed).toEqual([
          expect.objectContaining({
            serverId: scraplingServerId,
            workloadName: scraplingWorkloadName,
            runtimeLane: "ambient-default-oci",
            defaultCatalogUpdateStatus: "current",
            toolDescriptorReviewStatus: "trusted",
            lastKnownToolCount: expect.any(Number),
          }),
        ]);
      } finally {
        await cleanupScrapling(toolHive);
        await rm(root, { recursive: true, force: true });
      }
    },
    8 * 60_000,
  );
});

async function cleanupScrapling(toolHive: ToolHiveRuntimeService): Promise<void> {
  await toolHive.stopWorkload(scraplingWorkloadName, 20).catch(() => undefined);
  await toolHive.removeWorkload(scraplingWorkloadName).catch(() => undefined);
  await execFileAsync("docker", ["rm", "-f", scraplingWorkloadName, `${scraplingWorkloadName}-dns`, `${scraplingWorkloadName}-egress`], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  }).catch(() => undefined);
  await execFileAsync("docker", ["network", "rm", `toolhive-${scraplingWorkloadName}-internal`], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  }).catch(() => undefined);
  await rm(join(tmpdir(), scraplingWorkloadName), { recursive: true, force: true }).catch(() => undefined);
}
