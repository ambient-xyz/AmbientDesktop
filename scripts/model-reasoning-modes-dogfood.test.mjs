import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function readText(path) {
  return readFile(path, "utf8");
}

describe("model reasoning modes Desktop dogfood harness wiring", () => {
  it("exposes the scenario through package scripts and the Electron harness", async () => {
    const packageJson = JSON.parse(await readText("package.json"));
    const supervisor = await readText("scripts/run-electron-dogfood.mjs");

    expect(packageJson.scripts["test:model-reasoning:desktop-dogfood"]).toContain("scripts/run-electron-dogfood.mjs");
    expect(packageJson.scripts["test:model-reasoning:desktop-dogfood"]).toContain("--scenario=model-reasoning-modes");
    expect(packageJson.scripts["test:model-reasoning:desktop-dogfood"]).toContain("AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient}");
    expect(packageJson.scripts["test:model-reasoning:desktop-dogfood"]).toContain("<model>");
    expect(packageJson.scripts["test:model-reasoning:desktop-dogfood:unit"]).toContain("scripts/model-reasoning-modes-dogfood.test.mjs");
    expect(supervisor).toContain("scripts/model-reasoning-modes-dogfood.mjs");
    expect(supervisor).toContain("test-results/model-reasoning-modes/latest.json");
  });

  it("anchors the scenario to headful Desktop UI and provider payload evidence", async () => {
    const scenario = await readText("scripts/model-reasoning-modes-dogfood.mjs");

    expect(scenario).toContain("AMBIENT_HARNESS_CDP_PORT");
    expect(scenario).toContain("--remote-debugging-port");
    expect(scenario).toContain("Reasoning mode: Reasoning on");
    expect(scenario).toContain("Reasoning mode: Standard");
    expect(scenario).toContain("Reasoning mode: Deep");
    expect(scenario).toContain("AMBIENT_MODEL_REASONING_EVIDENCE_PATH");
    expect(scenario).toContain("payload-shapes.jsonl");
    expect(scenario).toContain("omit-reasoning-controls");
    expect(scenario).toContain("reasoning_effort=high");
    expect(scenario).toContain("reasoning_effort=max");
    expect(scenario).toContain("KIMI_REASONING_MODE_OK");
    expect(scenario).toContain("GLM_STANDARD_REASONING_MODE_OK");
    expect(scenario).toContain("GLM_DEEP_REASONING_MODE_OK");
  });
});
