import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Container runtime lifecycle Desktop dogfood harness wiring", () => {
  it("exposes the scenario through package scripts and the Electron harness", async () => {
    const packageJson = JSON.parse(await readText("package.json"));
    const supervisor = await readText("scripts/run-electron-dogfood.mjs");

    expect(packageJson.scripts["test:mcp-container-runtime-lifecycle:desktop-dogfood"]).toContain("scripts/run-electron-dogfood.mjs");
    expect(packageJson.scripts["test:mcp-container-runtime-lifecycle:desktop-dogfood"]).toContain("--scenario=container-runtime-lifecycle");
    expect(packageJson.scripts["test:mcp-container-runtime-lifecycle:desktop-dogfood"]).toContain("moonshotai/kimi-k2.7-code");
    expect(packageJson.scripts["test:mcp-container-runtime-lifecycle:desktop-dogfood:unit"]).toContain("scripts/container-runtime-lifecycle-dogfood.test.mjs");
    expect(supervisor).toContain("scripts/container-runtime-lifecycle-dogfood.mjs");
    expect(supervisor).toContain("test-results/container-runtime-lifecycle-dogfood/latest.json");
  });

  it("anchors the scenario to headful Settings automation and bounded lifecycle APIs", async () => {
    const scenario = await readText("scripts/container-runtime-lifecycle-dogfood.mjs");

    expect(scenario).toContain("AMBIENT_HARNESS_CDP_PORT");
    expect(scenario).toContain("--remote-debugging-port");
    expect(scenario).toContain("agent-browser");
    expect(scenario).toContain("cdp fallback; agent-browser unavailable");
    expect(scenario).toContain("isAbsolute(nameOrPath)");
    expect(scenario).toContain("mcp-container-runtime-setup-needed");
    expect(scenario).toContain("MCP Runtime & Web Research");
    expect(scenario).toContain("getMcpContainerRuntimeStatus");
    expect(scenario).toContain("previewMcpContainerRuntimeLifecycle");
    expect(scenario).toContain("runMcpContainerRuntimeLifecycle");
    expect(scenario).toContain("force-quit-and-restart");
    expect(scenario).toContain("blocked-ready-no-mutation");
    expect(scenario).toContain("exportDiagnosticBundle");
    expect(scenario).toContain("ambient-container-runtime-lifecycle-dogfood-v1");
    expect(scenario).toContain("moonshotai/kimi-k2.7-code");
    expect(scenario).toContain("Force quit and restart can interrupt every container on this runtime");
  });
});
