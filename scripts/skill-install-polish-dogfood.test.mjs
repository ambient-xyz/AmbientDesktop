import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("skill install polish dogfood wiring", () => {
  it("is routed through the shared Electron dogfood supervisor", async () => {
    const supervisor = await readFile("scripts/run-electron-dogfood.mjs", "utf8");
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));

    expect(supervisor).toContain('scenario === "skill-install-polish"');
    expect(supervisor).toContain("scripts/skill-install-polish-dogfood.mjs");
    expect(supervisor).toContain("test-results/skill-install-polish/latest.json");
    expect(packageJson.scripts["test:skill-install-polish:desktop-dogfood"]).toContain("scripts/run-electron-dogfood.mjs");
  });

  it("records live slash, route, wake, and continuation-label evidence", async () => {
    const source = await readFile("scripts/skill-install-polish-dogfood.mjs", "utf8");
    const contracts = await readFile("scripts/skill-install-polish-contract-scenarios.test.ts", "utf8");

    expect(source).toContain("searchSlashCommands");
    expect(source).toContain(".slash-command-popover");
    expect(source).toContain("ambient_model_status");
    expect(source).toContain("contractScenarios");
    expect(source).toContain("skill-install-polish-contract-scenarios.test.ts");
    expect(source).toContain("post-tool-continuation");
    expect(source).toContain("goal-continuation");
    expect(source).toContain("Compacting context");
    expect(source).toContain("emitE2eEvent");
    expect(source).toContain("AMBIENT_HARNESS_CDP_PORT");
    expect(contracts).toContain("planAmbientInstallRoute");
    expect(contracts).toContain("AgentRuntimeInstallRouteGuard");
    expect(contracts).toContain("ProjectStoreThreadWakeRepository");
    expect(contracts).toContain("ambient_capability_builder_plan");
    expect(contracts).toContain("ambient_cli_package_install_pi_catalog");
    expect(contracts).toContain("Ambient raw Pi install root guard blocked");
    expect(contracts).toContain("noDurableWriteExecuted");
    expect(contracts).toContain("supersedesWakeIds");
    expect(contracts).toContain("wake-dropped");
    expect(contracts).toContain("thread-wake");
    expect(source).toContain("prepare:node-native");
  });
});
