import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { containerRuntimeProbeSummary, probeContainerRuntime } from "./containerRuntimeProbeService";
import { ToolHiveRuntimeService } from "../tool-runtime/toolHiveRuntimeService";

const describeLive = process.env.AMBIENT_CONTAINER_RUNTIME_PROBE_LIVE === "1" ? describe : describe.skip;

describeLive("container runtime probe live", () => {
  it("reports the local ToolHive/container runtime status without throwing", async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), "ambient-runtime-probe-live-"));
    const toolHive = new ToolHiveRuntimeService({
      userDataPath,
      env: process.env,
    });
    const result = await probeContainerRuntime({
      toolHive,
      timeoutMs: 5_000,
    });

    console.info(containerRuntimeProbeSummary(result));
    expect(result.schemaVersion).toBe("ambient-container-runtime-probe-v1");
    expect(["ready", "installed-not-running", "missing", "unsupported", "blocked-by-permissions", "blocked-by-policy"]).toContain(result.status);
    expect(result.postInstallQueue).toEqual([
      {
        kind: "default-capability",
        capabilityId: "scrapling",
        status: result.status === "ready" ? "queued" : "blocked",
      },
    ]);
  });
});
