import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Agent Memory repair Desktop dogfood harness wiring", () => {
  it("exposes the repair scenario through package scripts and the Electron harness", async () => {
    const packageJson = JSON.parse(await readText("package.json"));
    const supervisor = await readText("scripts/run-electron-dogfood.mjs");

    expect(packageJson.scripts["test:memory:repair:desktop-dogfood"]).toContain("scripts/run-electron-dogfood.mjs");
    expect(packageJson.scripts["test:memory:repair:desktop-dogfood"]).toContain("--scenario=agent-memory-repair-resident-conflict");
    expect(packageJson.scripts["test:memory:repair:desktop-dogfood"]).toContain("AMBIENT_PROVIDER=${AMBIENT_PROVIDER:-ambient}");
    expect(packageJson.scripts["test:memory:repair:desktop-dogfood"]).not.toContain("AMBIENT_LIVE_MODEL=");
    expect(packageJson.scripts["test:memory:repair:desktop-dogfood:unit"]).toContain("scripts/agent-memory-repair-resident-conflict-dogfood.test.mjs");
    expect(supervisor).toContain("agent-memory-repair-resident-conflict");
    expect(supervisor).toContain("scripts/agent-memory-repair-resident-conflict-dogfood.mjs");
    expect(supervisor).toContain("test-results/agent-memory-repair-resident-conflict/latest.json");
    expect(supervisor).toContain("dogfoodModelIdForProvider");
  });

  it("keeps the scenario anchored to headful Electron UI repair evidence", async () => {
    const scenario = await readText("scripts/agent-memory-repair-resident-conflict-dogfood.mjs");

    expect(scenario).toContain("AMBIENT_HARNESS_CDP_PORT");
    expect(scenario).toContain("port !== excludedPort");
    expect(scenario).toContain("AMBIENT_AGENT_MEMORY_REPAIR_SOURCE_MANAGED_ROOT");
    expect(scenario).toContain("AMBIENT_AGENT_MEMORY_REPAIR_SOURCE_USER_DATA");
    expect(scenario).toContain("AMBIENT_MANAGED_INSTALL_ROOT: input.managedRoot");
    expect(scenario).toContain("assertNoExistingLlamaResidents");
    expect(scenario).toContain("residentProcessSummary");
    expect(scenario).toContain("Harness environment preflight failed");
    expect(scenario).toContain("AMBIENT_AGENT_MEMORY_REPAIR_DOGFOOD_ALLOW_EXISTING_LLAMA");
    expect(scenario).not.toContain("tmpManagedRootCandidates");
    expect(scenario).not.toContain("ambient-desktop-managed-installs");
    expect(scenario).toContain("--remote-debugging-port");
    expect(scenario).toContain("Repair Agent Memory health");
    expect(scenario).toContain("setMemoryModeFromUi");
    expect(scenario).toContain("Agent Memory mode");
    expect(scenario).toContain("Ambient will not stop external or active llama.cpp runtimes automatically");
    expect(scenario).toContain("Ambient will not stop it automatically");
    expect(scenario).toContain("resident-cleanup");
    expect(scenario).toContain("safe-orphan-ready.png");
    expect(scenario).toContain("external-runtime-blocked.png");
    expect(scenario).toContain("test-results\", \"agent-memory-repair-resident-conflict");
  });
});
