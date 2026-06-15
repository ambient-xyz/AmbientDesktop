import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { McpInstallCatalog, mcpRegistryInstallPreviewText, mcpServerSearchResultsText } from "./mcpInstallCatalog";
import { resolveOrExtractToolHiveExecutable } from "./toolHiveBundle";
import { ToolHiveRuntimeService } from "./toolHiveRuntimeService";

const runLive = process.env.AMBIENT_MCP_INSTALL_CATALOG_LIVE === "1";
const liveIt = runLive ? it : it.skip;

describe("McpInstallCatalog live", () => {
  liveIt(
    "searches and previews Context7 from the live ToolHive registry without installing it",
    async () => {
      const userDataPath = await mkdtemp(join(tmpdir(), "ambient-mcp-install-catalog-live-"));
      const toolHiveBinary = process.env.AMBIENT_TOOLHIVE_BINARY || (await resolveOrExtractToolHiveExecutable({
        resourcesPath: join(process.cwd(), "resources"),
        extractionRoot: join(userDataPath, "toolhive-extracted"),
      })).executablePath;
      const service = new ToolHiveRuntimeService({
        userDataPath,
        env: {
          ...process.env,
          AMBIENT_TOOLHIVE_BINARY: toolHiveBinary,
        },
      });
      const catalog = new McpInstallCatalog(service);

      const search = await catalog.searchRegistryServers({ query: "context7", limit: 5 });
      expect(search.some((result) => result.serverId === "io.github.stacklok/context7")).toBe(true);
      expect(mcpServerSearchResultsText(search)).toContain("built-in default + ToolHive registry");

      const preview = await catalog.previewRegistryInstall({ serverId: "io.github.stacklok/context7" });
      expect(preview.validation.status).toBe("ready-for-review");
      expect(preview.review.blockers).toEqual([]);
      expect(preview.runPlan).toMatchObject({
        serverId: "io.github.stacklok/context7",
        group: "ambient",
        isolateNetwork: true,
      });
      await expect(access(preview.permissionProfile.path)).resolves.toBeUndefined();
      expect(await readFile(preview.permissionProfile.path, "utf8")).toContain("context7");
      expect(mcpRegistryInstallPreviewText(preview)).toContain("Blockers: none.");
    },
    120_000,
  );
});
