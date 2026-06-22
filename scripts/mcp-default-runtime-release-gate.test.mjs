import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMcpDefaultRuntimeReleaseGateReport,
  mcpDefaultRuntimeReleaseGatePassed,
  renderMcpDefaultRuntimeReleaseGateMarkdown,
} from "./mcp-default-runtime-release-gate-lib.mjs";

describe("MCP default runtime release gate", () => {
  it("accepts the checked-in deterministic default runtime evidence while live evidence is skipped", () => {
    const report = buildMcpDefaultRuntimeReleaseGateReport(repoInput());

    expect(report.status).toBe("passed_with_live_skipped");
    expect(report.releaseDecision.ready).toBe(true);
    expect(report.releaseDecision.liveSkipped).toBe(true);
    expect(report.releaseDecision.blockingIssues).toEqual([]);
    expect(report.releaseDecision.advisoryIssues.join("\n")).toContain("Live MCP runtime validation was not selected");
    expect(report.defaults.serverIds).toEqual(expect.arrayContaining([
      "io.github.stacklok/context7",
      "io.github.d4vinci/scrapling",
    ]));
    expect(mcpDefaultRuntimeReleaseGatePassed(report)).toBe(true);
  });

  it("fails release-live mode unless live evidence was collected", () => {
    const report = buildMcpDefaultRuntimeReleaseGateReport({
      ...repoInput(),
      requireLive: true,
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.ready).toBe(false);
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("Live MCP runtime validation was not selected");
    expect(mcpDefaultRuntimeReleaseGatePassed(report, { requireLive: true })).toBe(false);
  });

  it("passes release mode when live evidence and required host preflight platforms passed", () => {
    const report = buildMcpDefaultRuntimeReleaseGateReport({
      ...repoInput(),
      runId: "2026-05-23T21-30-00-000Z",
      requireLive: true,
      requiredHostPreflightPlatforms: ["darwin", "linux", "win32"],
      hostPreflightMaxAgeHours: 72,
      artifacts: releaseArtifacts(),
      liveResults: passedLiveResults(),
      hostPreflightResults: [
        readyHost("mac-host", "darwin"),
        readyHost("linux-host", "linux"),
        readyHost("windows-host", "win32"),
      ],
    });

    expect(report.status).toBe("passed");
    expect(report.runId).toBe("2026-05-23T21-30-00-000Z");
    expect(report.artifacts).toMatchObject({
      latestJsonPath: "test-results/mcp-default-runtime-release-gate/latest.json",
      archiveJsonPath: "test-results/mcp-default-runtime-release-gate/runs/2026-05-23T21-30-00-000Z/report.json",
      archiveMarkdownPath: "test-results/mcp-default-runtime-release-gate/runs/2026-05-23T21-30-00-000Z/report.md",
      liveArtifactDir: "test-results/mcp-default-runtime-release-gate/runs/2026-05-23T21-30-00-000Z/live-artifacts",
    });
    expect(report.releaseDecision.ready).toBe(true);
    expect(report.releaseDecision.hostPreflightRequired).toBe(true);
    expect(report.releaseDecision.requiredHostPreflightPlatforms).toEqual(["darwin", "linux", "win32"]);
    expect(report.policy.hostPreflightMaxAgeHours).toBe(72);
    expect(report.live.results[0].outputArtifacts).toMatchObject({
      stdoutPath: "test-results/mcp-default-runtime-release-gate/live-artifacts/runtime.stdout.txt",
      stdoutBytes: 12,
      stderrPath: "test-results/mcp-default-runtime-release-gate/live-artifacts/runtime.stderr.txt",
      stderrBytes: 0,
    });
    expect(report.releaseDecision.advisoryIssues).toEqual([]);
    expect(mcpDefaultRuntimeReleaseGatePassed(report, { requireLive: true })).toBe(true);
  });

  it("renders a markdown summary with archive, live artifact, and host evidence paths", () => {
    const report = buildMcpDefaultRuntimeReleaseGateReport({
      ...repoInput(),
      runId: "2026-05-23T21-30-00-000Z",
      artifacts: releaseArtifacts(),
      liveResults: [liveResult("pi", "test:mcp-live-pi-smoke:live")],
      hostPreflightResults: [
        {
          ...readyHost("local", "darwin"),
          transport: "local",
          evidencePath: "test-results/mcp-runtime-host-preflight/local.json",
        },
      ],
    });

    const markdown = renderMcpDefaultRuntimeReleaseGateMarkdown(report);

    expect(markdown).toContain("# MCP Default Runtime Release Gate");
    expect(markdown).toContain("archiveJsonPath");
    expect(markdown).toContain("test-results/mcp-default-runtime-release-gate/runs/2026-05-23T21-30-00-000Z/report.json");
    expect(markdown).toContain("test-results/mcp-default-runtime-release-gate/live-artifacts/pi.stdout.txt");
    expect(markdown).toContain("test-results/mcp-runtime-host-preflight/local.json");
  });

  it("blocks strict host-preflight release mode until every required platform is present", () => {
    const report = buildMcpDefaultRuntimeReleaseGateReport({
      ...repoInput(),
      requireLive: true,
      requiredHostPreflightPlatforms: ["darwin", "linux", "win32"],
      liveResults: passedLiveResults(),
      hostPreflightResults: [
        readyHost("mac-host", "darwin"),
      ],
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.ready).toBe(false);
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("missing required platform(s): linux, win32");
    expect(mcpDefaultRuntimeReleaseGatePassed(report, { requireLive: true })).toBe(false);
  });

  it("blocks strict release mode when required host preflight evidence is stale", () => {
    const report = buildMcpDefaultRuntimeReleaseGateReport({
      ...repoInput(),
      requireLive: true,
      requiredHostPreflightPlatforms: ["darwin"],
      hostPreflightMaxAgeHours: 24,
      liveResults: passedLiveResults(),
      hostPreflightResults: [
        {
          ...readyHost("mac-host", "darwin"),
          generatedAt: "2026-05-20T21:30:00.000Z",
        },
      ],
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.ready).toBe(false);
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("is stale");
    expect(report.hostPreflight.results[0]).toMatchObject({
      platform: "darwin",
      generatedAt: "2026-05-20T21:30:00.000Z",
    });
  });

  it("fails release-live mode when only part of the live matrix ran", () => {
    const report = buildMcpDefaultRuntimeReleaseGateReport({
      ...repoInput(),
      requireLive: true,
      liveResults: [
        liveResult("pi", "test:mcp-live-pi-smoke:live"),
      ],
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("runtime, bridge, scrapling");
  });

  it("blocks release-live mode when live command output artifacts are missing", () => {
    const report = buildMcpDefaultRuntimeReleaseGateReport({
      ...repoInput(),
      requireLive: true,
      liveResults: [
        { name: "runtime", script: "test:mcp-toolhive-runtime:live", status: "passed", durationMs: 1, exitCode: 0 },
        liveResult("bridge", "test:mcp-tool-bridge:live"),
        liveResult("scrapling", "test:mcp-scrapling-default:live"),
        liveResult("pi", "test:mcp-live-pi-smoke:live"),
      ],
      hostPreflightResults: [
        readyHost("mac-host", "darwin"),
        readyHost("linux-host", "linux"),
        readyHost("windows-host", "win32"),
      ],
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.ready).toBe(false);
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("did not record stdout/stderr artifact paths");
  });

  it("records Linux host preflight permission blockers as release advisories", () => {
    const report = buildMcpDefaultRuntimeReleaseGateReport({
      ...repoInput(),
      liveResults: passedLiveResults(),
      hostPreflightResults: [
        {
          ...readyHost("drone", "linux"),
          status: "permission-blocked",
          message: "Docker is installed, but this OS user cannot access the runtime socket.",
          runtimes: {
            docker: {
              installed: true,
              ready: false,
              permissionBlocked: true,
              version: "Docker version 28.1.1",
            },
          },
        },
      ],
    });

    expect(report.status).toBe("passed_with_warnings");
    expect(report.releaseDecision.ready).toBe(true);
    expect(report.hostPreflight.results[0]).toMatchObject({
      target: "drone",
      platform: "linux",
      status: "permission-blocked",
      docker: {
        installed: true,
        permissionBlocked: true,
      },
    });
    expect(report.releaseDecision.advisoryIssues.join("\n")).toContain("runtime permission blocker");
  });

  it("records local host preflight evidence paths and warns only for remaining platforms", () => {
    const report = buildMcpDefaultRuntimeReleaseGateReport({
      ...repoInput(),
      hostPreflightResults: [
        {
          ...readyHost("local", "darwin"),
          transport: "local",
          evidencePath: "test-results/mcp-runtime-host-preflight/local.json",
        },
      ],
    });

    expect(report.hostPreflight.results[0]).toMatchObject({
      target: "local",
      transport: "local",
      platform: "darwin",
      status: "ready",
      evidencePath: "test-results/mcp-runtime-host-preflight/local.json",
    });
    expect(report.releaseDecision.advisoryIssues.join("\n")).toContain("missing platform(s): linux, win32");
  });

  it("fails invalid local host preflight statuses so broken collection cannot look advisory-only", () => {
    const report = buildMcpDefaultRuntimeReleaseGateReport({
      ...repoInput(),
      hostPreflightResults: [
        {
          target: "local",
          transport: "local",
          platform: "darwin",
          status: "error",
          message: "host preflight timed out",
          evidencePath: "test-results/mcp-runtime-host-preflight/local.json",
        },
      ],
    });

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.ready).toBe(false);
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("invalid status error");
  });

  it("blocks if Scrapling loses its digest-pinned default runtime image", () => {
    const input = repoInput();
    const scrapling = input.descriptors.find((descriptor) => descriptor.serverId === "io.github.d4vinci/scrapling");
    scrapling.registryInfo.image = "ghcr.io/d4vinci/scrapling:latest";

    const report = buildMcpDefaultRuntimeReleaseGateReport(input);

    expect(report.status).toBe("attention");
    expect(report.releaseDecision.blockingIssues.join("\n")).toContain("Scrapling image must be pinned by digest");
  });

  it("treats missing Context7 registry canary smoke as advisory instead of blocking bridge release", () => {
    const input = repoInput();
    const context7 = input.descriptors.find((descriptor) => descriptor.serverId === "io.github.stacklok/context7");
    context7.promotion.smokeTest.status = "not-run";

    const report = buildMcpDefaultRuntimeReleaseGateReport(input);

    expect(report.releaseDecision.ready).toBe(true);
    expect(report.releaseDecision.blockingIssues.join("\n")).not.toContain("Context7");
    expect(report.releaseDecision.advisoryIssues.join("\n")).toContain("Context7 registry/provenance canary");
  });
});

function repoInput() {
  return {
    packageJson: JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")),
    dockerInstallPlanHtml: readFileSync(join(process.cwd(), "dockerInstallPlan.html"), "utf8"),
    installerUpdatePlanHtml: readFileSync(join(process.cwd(), "installerUpdatePlan.html"), "utf8"),
    sourceFiles: {
      mcpInstallGateTs: readFileSync(join(process.cwd(), "src/main/mcp/mcpInstallGate.ts"), "utf8"),
      agentRuntimeTs: readFileSync(join(process.cwd(), "src/main/agent-runtime/agentRuntime.ts"), "utf8"),
      agentRuntimeMcpServerToolsTs: readFileSync(join(process.cwd(), "src/main/agent-runtime/mcp/agentRuntimeMcpServerTools.ts"), "utf8"),
      mcpServerPiToolsTs: readFileSync(join(process.cwd(), "src/main/mcp/mcpServerPiTools.ts"), "utf8"),
      mcpServerPiToolsTestTs: readFileSync(join(process.cwd(), "src/main/mcp/mcpServerPiTools.test.ts"), "utf8"),
      containerRuntimeProbeServiceTs: readFileSync(join(process.cwd(), "src/main/container-runtime/containerRuntimeProbeService.ts"), "utf8"),
      containerRuntimeInstallLauncherTs: readFileSync(join(process.cwd(), "src/main/container-runtime/containerRuntimeInstallLauncher.ts"), "utf8"),
      mcpDefaultCapabilityInstallerTs: readFileSync(join(process.cwd(), "src/main/mcp/mcpDefaultCapabilityInstaller.ts"), "utf8"),
      ociImageResolverTs: readFileSync(join(process.cwd(), "src/main/container-runtime/ociImageResolver.ts"), "utf8"),
      toolHiveRuntimeServiceTs: readFileSync(join(process.cwd(), "src/main/tool-runtime/toolHiveRuntimeService.ts"), "utf8"),
      rendererAppTsx: [
        "src/renderer/src/App.tsx",
        "src/renderer/src/AppModalHost.tsx",
        "src/renderer/src/AppDialogs.tsx",
        "src/renderer/src/AppModalHostProps.ts",
        "src/renderer/src/AppRightPanelHostProps.ts",
        "src/renderer/src/RightPanel.tsx",
        "src/renderer/src/RightPanelMcpController.ts",
      ].map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n"),
    },
    descriptors: readdirSync(join(process.cwd(), "resources", "mcp-catalog", "default"))
      .filter((entry) => entry.endsWith(".json"))
      .sort()
      .map((entry) => JSON.parse(readFileSync(join(process.cwd(), "resources", "mcp-catalog", "default", entry), "utf8"))),
    generatedAt: "2026-05-23T21:30:00.000Z",
  };
}

function passedLiveResults() {
  return [
    liveResult("runtime", "test:mcp-toolhive-runtime:live"),
    liveResult("bridge", "test:mcp-tool-bridge:live"),
    liveResult("scrapling", "test:mcp-scrapling-default:live"),
    liveResult("pi", "test:mcp-live-pi-smoke:live"),
  ];
}

function releaseArtifacts() {
  return {
    latestJsonPath: "test-results/mcp-default-runtime-release-gate/latest.json",
    latestMarkdownPath: "test-results/mcp-default-runtime-release-gate/latest.md",
    archiveJsonPath: "test-results/mcp-default-runtime-release-gate/runs/2026-05-23T21-30-00-000Z/report.json",
    archiveMarkdownPath: "test-results/mcp-default-runtime-release-gate/runs/2026-05-23T21-30-00-000Z/report.md",
    liveArtifactDir: "test-results/mcp-default-runtime-release-gate/runs/2026-05-23T21-30-00-000Z/live-artifacts",
  };
}

function liveResult(name, script) {
  return {
    name,
    script,
    status: "passed",
    durationMs: 1,
    exitCode: 0,
    outputArtifacts: {
      stdoutPath: `test-results/mcp-default-runtime-release-gate/live-artifacts/${name}.stdout.txt`,
      stdoutBytes: 12,
      stderrPath: `test-results/mcp-default-runtime-release-gate/live-artifacts/${name}.stderr.txt`,
      stderrBytes: 0,
    },
  };
}

function readyHost(target, platform) {
  return {
    target,
    transport: "ssh",
    platform,
    arch: "x64",
    generatedAt: "2026-05-23T21:00:00.000Z",
    status: "ready",
    message: "A container runtime is installed and reachable for this user.",
    runtimes: {
      docker: {
        installed: true,
        ready: true,
        permissionBlocked: false,
        version: "Docker version 28.1.1",
      },
      podman: {
        installed: false,
        ready: false,
        permissionBlocked: false,
      },
      toolhive: {
        installed: true,
        version: "thv 0.0.0",
      },
    },
  };
}
