import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { resolveOrExtractToolHiveExecutable } from "./toolHiveBundle";
import { ToolHiveRuntimeService } from "./toolHiveRuntimeService";

const runLive = process.env.AMBIENT_TOOLHIVE_RUNTIME_LIVE === "1";
const liveIt = runLive ? it : it.skip;

describe("ToolHiveRuntimeService live", () => {
  liveIt(
    "uses the bundled thv binary for version, registry metadata, runtime preflight, and ambient workload listing",
    async () => {
      const userDataPath = await mkdtemp(join(tmpdir(), "ambient-toolhive-live-user-data-"));
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

      await expect(service.version()).resolves.toMatchObject({
        command: "version",
        exitCode: 0,
      });
      const context7 = await service.registryInfo("io.github.stacklok/context7");
      expect(context7.name).toBe("io.github.stacklok/context7");
      expect(String(context7.repository_url ?? "")).toContain("upstash/context7");

      const preflight = await service.preflightRuntime(3);
      expect(typeof preflight.ok).toBe("boolean");
      expect(preflight.command.command).toBe("runtime-check");

      await expect(service.listAmbientWorkloadSummaries({ all: true })).resolves.toEqual(expect.any(Array));
    },
    120_000,
  );
});
