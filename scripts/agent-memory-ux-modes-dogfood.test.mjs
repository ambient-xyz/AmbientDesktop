import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Agent Memory UX modes Desktop dogfood harness wiring", () => {
  it("exposes the UX mode scenario through package scripts and the Electron harness", async () => {
    const packageJson = JSON.parse(await readText("package.json"));
    const supervisor = await readText("scripts/run-electron-dogfood.mjs");

    expect(packageJson.scripts["test:memory:ux-modes:desktop-dogfood"]).toContain("scripts/run-electron-dogfood.mjs");
    expect(packageJson.scripts["test:memory:ux-modes:desktop-dogfood"]).toContain("--scenario=agent-memory-ux-modes");
    expect(packageJson.scripts["test:memory:ux-modes:desktop-dogfood"]).toContain("AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient}");
    expect(packageJson.scripts["test:memory:ux-modes:desktop-dogfood"]).toContain("moonshotai/kimi-k2.7-code");
    expect(packageJson.scripts["test:memory:ux-modes:desktop-dogfood:unit"]).toContain("scripts/agent-memory-ux-modes-dogfood.test.mjs");
    expect(supervisor).toContain("agent-memory-ux-modes");
    expect(supervisor).toContain("scripts/agent-memory-ux-modes-dogfood.mjs");
    expect(supervisor).toContain("test-results/agent-memory-ux-modes/latest.json");
  });

  it("anchors the scenario to headful Electron UX and live memory behavior", async () => {
    const scenario = await readText("scripts/agent-memory-ux-modes-dogfood.mjs");

    expect(scenario).toContain("AMBIENT_HARNESS_CDP_PORT");
    expect(scenario).toContain("--remote-debugging-port");
    expect(scenario).toContain("Agent Memory mode");
    expect(scenario).toContain("Memory for this thread");
    expect(scenario).toContain("global_enabled_cross_thread_recall");
    expect(scenario).toContain("global_enabled_existing_thread_inherits_tools");
    expect(scenario).toContain("per_thread_enabled_and_disabled_controls");
    expect(scenario).toContain("per_thread_disabled_thread_cannot_capture");
    expect(scenario).toContain("global_disabled_no_memory_tools");
    expect(scenario).toContain("ambient_memory_create");
    expect(scenario).toContain("tdai_memory_search");
    expect(scenario).toContain("assertNoMemoryTools");
    expect(scenario).toContain("global-enabled-settings.png");
    expect(scenario).toContain("per-thread-topbar-toggle.png");
    expect(scenario).toContain("disabled-settings.png");
    expect(scenario).toContain("AMBIENT_AGENT_MEMORY_UX_SOURCE_MANAGED_ROOT");
    expect(scenario).toContain("AMBIENT_AGENT_MEMORY_UX_DOGFOOD_ALLOW_EXISTING_LLAMA");
  });
});
