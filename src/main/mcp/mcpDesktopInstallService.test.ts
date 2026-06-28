import { describe, expect, it } from "vitest";
import type { ContainerRuntimeProbeResult } from "./mcpContainerRuntimeFacade";
import { ambientMcpContainerRuntimeStatus, containerRuntimeStartupAutoLaunchAction } from "./mcpDesktopInstallService";
import type { McpDefaultCapabilitySummary } from "./mcpDefaultCapabilityReconciler";

describe("MCP Desktop install service runtime status projection", () => {
  it("keeps Scrapling out of the renderer status until the container runtime is ready", () => {
    const status = ambientMcpContainerRuntimeStatus(
      runtimeProbe("missing"),
      {
        userDecision: "deferred",
        shouldPrompt: false,
        promptSuppressed: true,
        reason: "user-deferred",
      },
      [scraplingCapability("blocked_runtime", "install-runtime")],
    );

    expect(status.status).toBe("missing");
    expect(status.installPlan).toMatchObject({
      preferredRuntime: "podman",
      primaryAction: { runtime: "podman" },
    });
    expect(status.postInstallQueue).toEqual([]);
    expect(status.defaultCapabilities).toEqual([]);
  });

  it("exposes Scrapling handoff only after runtime readiness", () => {
    const capability = scraplingCapability("blocked_approval", "approve-default-capability");
    const status = ambientMcpContainerRuntimeStatus(
      runtimeProbe("ready"),
      {
        userDecision: "none",
        shouldPrompt: false,
        promptSuppressed: false,
        reason: "runtime-ready",
      },
      [capability],
    );

    expect(status.status).toBe("ready");
    expect(status.postInstallQueue).toEqual([{ kind: "default-capability", capabilityId: "scrapling", status: "queued" }]);
    expect(status.defaultCapabilities).toEqual([capability]);
    expect(status.installPlan).toBeUndefined();
  });

  it("does not show a queued Scrapling handoff once Scrapling is installed", () => {
    const capability = scraplingCapability("installed", "none");
    const status = ambientMcpContainerRuntimeStatus(
      runtimeProbe("ready"),
      {
        userDecision: "none",
        shouldPrompt: false,
        promptSuppressed: false,
        reason: "runtime-ready",
      },
      [capability],
    );

    expect(status.status).toBe("ready");
    expect(status.postInstallQueue).toEqual([]);
    expect(status.defaultCapabilities).toEqual([capability]);
  });

  it("selects only non-destructive runtime app opens for startup auto-launch", () => {
    const stoppedDocker = runtimeProbe("installed-not-running", {
      runtime: "docker",
      nextAction: "start-runtime",
      reason: "daemon-unreachable",
      hosts: [{ kind: "docker", status: "installed-not-running", message: "Docker daemon is not reachable.", commands: [] }],
    });

    expect(containerRuntimeStartupAutoLaunchAction(stoppedDocker)).toMatchObject({
      plan: { status: "installed-not-running", preferredRuntime: "docker" },
      action: {
        id: "docker-desktop-macos-start",
        kind: "open-runtime",
        runtime: "docker",
        applicationNames: ["Docker"],
      },
    });
    expect(containerRuntimeStartupAutoLaunchAction(runtimeProbe("missing"))).toBeUndefined();
    expect(containerRuntimeStartupAutoLaunchAction(runtimeProbe("blocked-by-permissions", {
      nextAction: "repair-permissions",
      hosts: [{ kind: "docker", status: "permission-blocked", message: "permission denied", commands: [] }],
    }))).toBeUndefined();
  });
});

function runtimeProbe(
  status: ContainerRuntimeProbeResult["status"],
  overrides: Partial<ContainerRuntimeProbeResult> = {},
): ContainerRuntimeProbeResult {
  return {
    schemaVersion: "ambient-container-runtime-probe-v1",
    status,
    ...(status === "ready" ? { runtime: "docker" as const } : {}),
    platform: "darwin",
    arch: "arm64",
    checkedAt: "2026-06-27T20:00:00.000Z",
    durationMs: 12,
    message: status === "ready"
      ? "ToolHive container runtime preflight passed."
      : "No ready Docker, Podman, or ToolHive-compatible container runtime was detected.",
    reason: status === "ready" ? "none" : "runtime-missing",
    nextAction: status === "ready" ? "none" : "install-runtime",
    toolHive: {
      status: "ready",
      message: "ToolHive ready",
      preflight: {
        ok: status === "ready",
        message: status === "ready" ? "runtime ready" : "no runtime",
        command: {
          command: "runtime-check",
          args: ["runtime", "check"],
          stdout: "",
          stderr: "",
          exitCode: status === "ready" ? 0 : 1,
          durationMs: 1,
        },
      },
    },
    hosts: [],
    postInstallQueue: [{ kind: "default-capability", capabilityId: "scrapling", status: status === "ready" ? "queued" : "blocked" }],
    ...overrides,
  };
}

function scraplingCapability(
  status: McpDefaultCapabilitySummary["status"],
  nextAction: McpDefaultCapabilitySummary["nextAction"],
): McpDefaultCapabilitySummary {
  return {
    schemaVersion: "ambient-mcp-default-capability-v1",
    capabilityId: "scrapling",
    title: "Scrapling",
    status,
    nextAction,
    message: "fixture",
    serverId: "io.github.d4vinci/scrapling",
    workloadName: "ambient-scrapling",
    runtimeStatus: "ready",
    lastReconciledAt: "2026-06-27T20:00:00.000Z",
    appVersion: "0.1.93",
  };
}
