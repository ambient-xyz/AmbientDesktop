import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Provider restart behavior Desktop dogfood harness wiring", () => {
  it("exposes the provider restart scenario through package scripts and the Electron harness", async () => {
    const packageJson = JSON.parse(await readText("package.json"));
    const supervisor = await readText("scripts/run-electron-dogfood.mjs");
    const liveGates = await readText("scripts/run-provider-restart-behavior-live-gates.mjs");

    expect(packageJson.scripts["test:provider-restart:desktop-dogfood"]).toContain("scripts/run-provider-restart-behavior-live-gates.mjs");
    expect(packageJson.scripts["test:provider-restart:desktop-dogfood"]).toContain("AMBIENT_PROVIDER=ambient");
    expect(packageJson.scripts["test:provider-restart:desktop-dogfood"]).toContain("example/model-id");
    expect(packageJson.scripts["test:provider-restart:desktop-dogfood:unit"]).toContain("scripts/provider-restart-behavior-dogfood.test.mjs");
    expect(supervisor).toContain("provider-restart-behavior");
    expect(supervisor).toContain("scripts/provider-restart-behavior-dogfood.mjs");
    expect(supervisor).toContain("test-results/provider-restart-behavior/latest.json");
    expect(liveGates).toContain("scripts/run-electron-dogfood.mjs");
    expect(liveGates).toContain("--scenario=provider-restart-behavior");
    expect(liveGates).toContain("gate-a-hidden-goal-continuation-provider-stall");
    expect(liveGates).toContain("gate-b-post-tool-provider-stall");
    expect(liveGates).toContain("gate-c-provider-retry-cap");
    expect(liveGates).toContain("gate-d-no-stall-live-smoke");
    expect(liveGates).toContain("test-results/provider-restart-behavior/live-gates.json");
    expect(liveGates).toContain("manifest?.result?.status");
  });

  it("anchors the scenario to headful Electron, real Ambient Kimi, and hidden goal continuation recovery", async () => {
    const scenario = await readText("scripts/provider-restart-behavior-dogfood.mjs");

    expect(scenario).toContain("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT");
    expect(scenario).toContain("--remote-debugging-port");
    expect(scenario).toContain("AMBIENT_PROVIDER: DEFAULT_DOGFOOD_PROVIDER");
    expect(scenario).toContain("example/model-id");
    expect(scenario).toContain("startAmbientFailpointProxy");
    expect(scenario).toContain("AMBIENT_BASE_URL");
    expect(scenario).toContain("window.ambientDesktop.testAmbientApiKey()");
    expect(scenario).toContain("window.ambientDesktop.setThreadGoal");
    expect(scenario).toContain('status: "paused"');
    expect(scenario).toContain('status: "active"');
    expect(scenario).toContain("hiddenFromTranscript");
    expect(scenario).toContain("provider_interruption_continuation");
    expect(scenario).toContain("providerContinuationRetryScheduledCount");
    expect(scenario).toContain("goalProviderInfraFailures");
    expect(scenario).toContain("goalProviderInfraFailures > checks.goalNoProgressTurns");
    expect(scenario).toContain("failpointClientCloseCount");
    expect(scenario).toContain("failpointProxyEndCount");
    expect(scenario).toContain("gateId !== GATE_C && checks.failpointClientCloseCount");
    expect(scenario).toContain("gateId !== GATE_C && checks.failpointProxyEndCount");
    expect(scenario).toContain("endedByProxy");
    expect(scenario).toContain("provider-restart-${selectedGateId}-final.png");
  });

  it("defines live gates for post-tool stalls, retry cap exhaustion, and no-stall smoke", async () => {
    const scenario = await readText("scripts/provider-restart-behavior-dogfood.mjs");

    expect(scenario).toContain("gate-b-post-tool-provider-stall");
    expect(scenario).toContain("after_tool_result");
    expect(scenario).toContain("requestHasToolResult");
    expect(scenario).toContain("sideEffectMarkerLineCount === 1");
    expect(scenario).toContain("toolMessageCount >= 1");
    expect(scenario).toContain("providerContinuationCompletedToolMessageCountMax >= 1");
    expect(scenario).toContain("gateBGoalStateIsAcceptable");
    expect(scenario).toContain('goalStatus === "provider_unavailable" && providerAvailabilityStatusReason');
    expect(scenario).toContain("gate-c-provider-retry-cap");
    expect(scenario).toContain("provider_retry_cap");
    expect(scenario).toContain("failpointCount(providerInfrastructureFailureLimit)");
    expect(scenario).toContain('goalStatus === "provider_unavailable"');
    expect(scenario).toContain("providerContinuationRetryExhaustedCount");
    expect(scenario).toContain("providerContinuationRetryScheduledCount >= 1");
    expect(scenario).toContain("providerAvailabilityStatusReason");
    expect(scenario).toContain("gate-d-no-stall-live-smoke");
    expect(scenario).toContain("Reply with exactly this text and nothing else");
    expect(scenario).toContain("noStallResponseMessageCount >= 1");
    expect(scenario).toContain("no-stall live response message was not persisted");
    expect(scenario).toContain("terminalProviderErrorRunCount === 0");
  });
});
