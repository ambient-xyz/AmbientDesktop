import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  containerRuntimeSetupPromptState,
  readContainerRuntimeSetupState,
  recordContainerRuntimeDeferred,
  recordContainerRuntimeInstallLaunched,
  recordContainerRuntimeProbeState,
} from "./containerRuntimeSetupState";
import type { ContainerRuntimeProbeResult } from "./containerRuntimeProbeService";

describe("container runtime setup state", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("records upgrade reconciliation and prompts on first missing runtime check", async () => {
    const statePath = await setupStatePath();
    const state = await recordContainerRuntimeProbeState(statePath, probeResult("missing"), {
      appVersion: "1.2.3",
      now: fixedNow,
    });

    expect(state).toMatchObject({
      appVersion: "1.2.3",
      upgradeReconciledAppVersion: "1.2.3",
      lastStatus: "missing",
      userDecision: "none",
    });
    expect(containerRuntimeSetupPromptState(probeResult("missing"), state)).toMatchObject({
      shouldPrompt: true,
      promptSuppressed: false,
      reason: "runtime-missing",
    });
  });

  it("treats malformed persisted state as empty state", async () => {
    const statePath = await setupStatePath();
    await mkdir(dirname(statePath), { recursive: true });
    await writeFile(statePath, "{", "utf8");

    await expect(readContainerRuntimeSetupState(statePath)).resolves.toMatchObject({
      userDecision: "none",
    });
  });

  it("persists a deliberate defer and suppresses repeated prompts", async () => {
    const statePath = await setupStatePath();
    await recordContainerRuntimeProbeState(statePath, probeResult("missing"), { appVersion: "1.2.3", now: fixedNow });
    const deferred = await recordContainerRuntimeDeferred(statePath, {
      appVersion: "1.2.3",
      now: () => new Date("2026-05-23T21:00:00.000Z"),
    });
    const checkedAgain = await recordContainerRuntimeProbeState(statePath, probeResult("missing"), {
      appVersion: "1.2.3",
      now: () => new Date("2026-05-23T21:05:00.000Z"),
    });

    expect(deferred).toMatchObject({
      userDecision: "deferred",
      decisionAppVersion: "1.2.3",
      decisionAt: "2026-05-23T21:00:00.000Z",
    });
    expect(containerRuntimeSetupPromptState(probeResult("missing"), checkedAgain)).toMatchObject({
      userDecision: "deferred",
      shouldPrompt: false,
      promptSuppressed: true,
      reason: "user-deferred",
      lastDecisionAt: "2026-05-23T21:00:00.000Z",
    });
  });

  it("reconciles after an app upgrade without clearing a prior defer", async () => {
    const statePath = await setupStatePath();
    await recordContainerRuntimeProbeState(statePath, probeResult("missing"), { appVersion: "1.2.3", now: fixedNow });
    await recordContainerRuntimeDeferred(statePath, { appVersion: "1.2.3", now: fixedNow });
    const upgraded = await recordContainerRuntimeProbeState(statePath, probeResult("missing"), {
      appVersion: "1.3.0",
      now: () => new Date("2026-05-24T00:00:00.000Z"),
    });

    expect(upgraded).toMatchObject({
      appVersion: "1.3.0",
      upgradeReconciledAppVersion: "1.3.0",
      upgradeReconciledAt: "2026-05-24T00:00:00.000Z",
      userDecision: "deferred",
    });
    expect(containerRuntimeSetupPromptState(probeResult("missing"), upgraded)).toMatchObject({
      shouldPrompt: false,
      promptSuppressed: true,
      reason: "user-deferred",
      upgradeReconciledAppVersion: "1.3.0",
    });
  });

  it("records installer launches and resets the decision once runtime becomes ready", async () => {
    const statePath = await setupStatePath();
    await recordContainerRuntimeProbeState(statePath, probeResult("missing"), { appVersion: "1.2.3", now: fixedNow });
    const launched = await recordContainerRuntimeInstallLaunched(statePath, {
      id: "podman-desktop-macos",
      label: "Open Podman Desktop download",
      kind: "open-installer",
      runtime: "podman",
      url: "https://podman-desktop.io/downloads",
      reason: "fixture",
    }, {
      appVersion: "1.2.3",
      now: () => new Date("2026-05-23T22:00:00.000Z"),
    });

    expect(containerRuntimeSetupPromptState(probeResult("missing"), launched)).toMatchObject({
      shouldPrompt: false,
      promptSuppressed: true,
      reason: "install-launched",
      lastDecisionAt: "2026-05-23T22:00:00.000Z",
      installActionId: "podman-desktop-macos",
      installRuntime: "podman",
      installUrl: "https://podman-desktop.io/downloads",
    });

    const ready = await recordContainerRuntimeProbeState(statePath, probeResult("ready"), {
      appVersion: "1.2.3",
      now: () => new Date("2026-05-23T23:00:00.000Z"),
    });

    expect(ready.userDecision).toBe("none");
    expect(ready).not.toHaveProperty("installActionId");
    expect(ready).not.toHaveProperty("installRuntime");
    expect(ready).not.toHaveProperty("installUrl");
    expect(containerRuntimeSetupPromptState(probeResult("ready"), ready)).toMatchObject({
      shouldPrompt: false,
      reason: "runtime-ready",
    });
    expect(await readContainerRuntimeSetupState(statePath)).toMatchObject({ userDecision: "none", lastStatus: "ready" });
    expect(await readContainerRuntimeSetupState(statePath)).not.toHaveProperty("installActionId");
  });

  it("does not show the install-runtime prompt when a host runtime is detected but ToolHive needs repair", async () => {
    const statePath = await setupStatePath();
    const result = probeResult("blocked-by-policy", {
      runtime: "podman",
      reason: "toolhive-runtime-unavailable",
      nextAction: "open-settings",
      message: "Podman is installed and reachable, but ToolHive could not use it.",
    });
    const state = await recordContainerRuntimeProbeState(statePath, result, {
      appVersion: "1.2.3",
      now: fixedNow,
    });

    expect(containerRuntimeSetupPromptState(result, state)).toMatchObject({
      shouldPrompt: false,
      promptSuppressed: false,
      reason: "runtime-not-missing",
    });
  });

  async function setupStatePath(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "ambient-container-runtime-setup-state-test-"));
    roots.push(root);
    return join(root, "mcp-container-runtime", "setup-state.json");
  }
});

function fixedNow(): Date {
  return new Date("2026-05-23T20:00:00.000Z");
}

function probeResult(
  status: ContainerRuntimeProbeResult["status"],
  overrides: Partial<ContainerRuntimeProbeResult> = {},
): ContainerRuntimeProbeResult {
  return {
    schemaVersion: "ambient-container-runtime-probe-v1",
    status,
    ...(status === "ready" ? { runtime: "docker" as const } : {}),
    platform: "darwin",
    arch: "arm64",
    checkedAt: "2026-05-23T20:00:00.000Z",
    durationMs: 1,
    message: "fixture",
    nextAction: status === "ready" ? "none" : "install-runtime",
    toolHive: {
      status: "ready",
      message: "fixture",
    },
    hosts: [],
    postInstallQueue: [{ kind: "default-capability", capabilityId: "scrapling", status: status === "ready" ? "queued" : "blocked" }],
    ...overrides,
  };
}
