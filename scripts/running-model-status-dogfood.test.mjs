import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function readText(path) {
  return readFile(path, "utf8");
}

describe("running model status Desktop dogfood harness wiring", () => {
  it("exposes Kimi and GLM-5.2 live gates through package scripts and the Electron harness", async () => {
    const packageJson = JSON.parse(await readText("package.json"));
    const supervisor = await readText("scripts/run-electron-dogfood.mjs");

    expect(packageJson.scripts["test:running-model-status:desktop-dogfood"]).toContain("test:running-model-status:desktop-dogfood:kimi");
    expect(packageJson.scripts["test:running-model-status:desktop-dogfood"]).toContain("test:running-model-status:desktop-dogfood:glm52");
    expect(packageJson.scripts["test:running-model-status:desktop-dogfood:kimi"]).toContain("scripts/run-electron-dogfood.mjs");
    expect(packageJson.scripts["test:running-model-status:desktop-dogfood:kimi"]).toContain("--scenario=running-model-status");
    expect(packageJson.scripts["test:running-model-status:desktop-dogfood:kimi"]).toContain("<model>");
    expect(packageJson.scripts["test:running-model-status:desktop-dogfood:glm52"]).toContain("--scenario=running-model-status");
    expect(packageJson.scripts["test:running-model-status:desktop-dogfood:glm52"]).toContain("zai-org/GLM-5.2-FP8");
    expect(packageJson.scripts["test:running-model-status:desktop-dogfood:unit"]).toContain("scripts/running-model-status-dogfood.test.mjs");
    expect(supervisor).toContain("scripts/running-model-status-dogfood.mjs");
    expect(supervisor).toContain("test-results/running-model-status/latest.json");
  });

  it("anchors the scenario to headful Desktop, agent-browser Electron evidence, and transcript tool proof", async () => {
    const scenario = await readText("scripts/running-model-status-dogfood.mjs");

    expect(scenario).toContain("AMBIENT_HARNESS_CDP_PORT");
    expect(scenario).toContain("--remote-debugging-port");
    expect(scenario).toContain("agent-browser");
    expect(scenario).toContain("agentBrowserAvailable");
    expect(scenario).toContain("cdp fallback; agent-browser unavailable");
    expect(scenario).toContain("Page.captureScreenshot");
    expect(scenario).toContain("snapshot");
    expect(scenario).toContain("screenshot");
    expect(scenario).toContain("running-model-status-dogfood");
    expect(scenario).toContain("ambient-running-model-status-v1");
    expect(scenario).toContain("metadata?.toolName === toolName");
    expect(scenario).toContain("metadata?.status === \"done\"");
    expect(scenario).toContain("RUNNING_MODEL_STATUS_OK");
    expect(scenario).toContain("assertEqualStatusField(statusPayload.selected?.effectiveModelId");
    expect(scenario).toContain("assertEqualStatusField(statusPayload.reasoning?.control");
    expect(scenario).toContain("assertPayloadStrategyStatusField(statusPayload.reasoning?.payloadStrategy");
    expect(scenario).toContain("assertArrayIncludes(statusPayload.reasoning?.requestFields");
    expect(scenario).toContain("[REDACTED]");
    expect(scenario).toContain("fixed_on");
    expect(scenario).toContain("selectable_effort");
    expect(scenario).toContain("omit-reasoning-controls");
    expect(scenario).toContain("zai-reasoning-effort");
    expect(scenario).toContain("assertEqualStatusField(statusPayload.provider?.secretStatus");
  });
});
