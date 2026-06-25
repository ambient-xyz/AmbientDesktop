import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AmbientMcpContainerRuntimeStatus, ManagedDevServerSummary } from "../../shared/pluginTypes";
import { RightPanelPluginMcpRuntime } from "./RightPanelPluginMcpRuntime";

describe("RightPanelPluginMcpRuntime", () => {
  it("renders runtime, default capability, and managed dev-server sections through the public pane", () => {
    const html = renderToStaticMarkup(
      <RightPanelPluginMcpRuntime
        runtimeStatus={runtimeStatus()}
        runtimeToneClass="success"
        runtimeLabel="Ready"
        runtimeBusy={false}
        runtimeLaunchBusy={false}
        diagnosticsAction={{
          visible: true,
          disabled: false,
          label: "Export diagnostics",
          title: "Export runtime diagnostics.",
        }}
        diagnosticStatus={{ kind: "success", message: "Diagnostics exported." }}
        installProgressStatus={{ kind: "info", message: "Runtime checked." }}
        defaultCapabilityInstallProgressStatus={{ kind: "info", message: "Scrapling setup queued." }}
        setupResumeRows={["Opened at: 2026-06-23T12:00:00.000Z"]}
        mcpServerBusy={undefined}
        managedDevServers={[managedDevServer()]}
        installBusyLabel={(kind) => `Installing ${kind ?? "runtime"}`}
        onRefreshRuntime={vi.fn()}
        onOpenRuntimeReview={vi.fn()}
        onOpenRuntimeSettings={vi.fn()}
        onExportDiagnostics={vi.fn()}
        onLaunchInstaller={vi.fn()}
        onReviewInstallCommandPlan={vi.fn()}
        onInstallDefaultCapability={vi.fn()}
        onLoadManagedDevServers={vi.fn()}
        onStopManagedDevServer={vi.fn()}
      />,
    );

    expect(html).toContain("Isolated MCP Runtime");
    expect(html).toContain("Ready");
    expect(html).toContain("Review command plan");
    expect(html).toContain("Runtime checked.");
    expect(html).toContain("Scrapling setup queued.");
    expect(html).toContain("Scrapling: Not Configured. Install Scrapling for browser extraction.");
    expect(html).toContain("Set up Scrapling");
    expect(html).toContain("Managed Dev Servers");
    expect(html).toContain("pnpm run dev");
    expect(html).toContain("/tmp/app");
    expect(html).toContain("Stop");
  });
});

function runtimeStatus(): AmbientMcpContainerRuntimeStatus {
  return {
    schemaVersion: "ambient-container-runtime-probe-v1",
    status: "ready",
    runtime: "docker",
    platform: "darwin",
    arch: "arm64",
    checkedAt: "2026-06-23T12:00:00.000Z",
    durationMs: 42,
    message: "Runtime is ready.",
    nextAction: "none",
    toolHive: {
      status: "ready",
      message: "ToolHive ready.",
      preflightOk: true,
      versionLine: "toolhive 1.0.0",
    },
    hosts: [
      {
        kind: "docker",
        status: "ready",
        version: "27.0.0",
        message: "Docker is running.",
      },
    ],
    setup: {
      userDecision: "none",
      shouldPrompt: false,
      promptSuppressed: false,
      reason: "runtime-ready",
    },
    postInstallQueue: [],
    defaultCapabilities: [
      {
        schemaVersion: "ambient-mcp-default-capability-v1",
        capabilityId: "scrapling",
        title: "Scrapling",
        status: "not_configured",
        nextAction: "install-default-capability",
        message: "Install Scrapling for browser extraction.",
        workloadName: "ambient-default-scrapling",
        runtimeStatus: "ready",
        lastReconciledAt: "2026-06-23T12:00:00.000Z",
        appVersion: "0.1.87",
      },
    ],
    installPlan: {
      schemaVersion: "ambient-container-runtime-install-plan-v1",
      platform: "darwin",
      arch: "arm64",
      status: "ready",
      preferredRuntime: "docker",
      summary: "Runtime setup is available.",
      primaryAction: {
        id: "install-docker",
        label: "Install Docker",
        kind: "managed-install",
        runtime: "docker",
        url: "https://example.test/docker",
        reason: "Docker is the preferred runtime.",
        managedInstall: {
          schemaVersion: "ambient-container-runtime-managed-install-v1",
          execution: "user-command",
          strategy: "brew",
          packageName: "docker",
          platform: "darwin",
          requiresCredential: false,
          commands: [
            {
              exe: "brew",
              args: ["install", "--cask", "docker"],
              rationale: "Install Docker Desktop.",
            },
          ],
          fallbackActionIds: [],
        },
      },
      alternatives: [],
      prerequisites: [],
      warnings: [],
      postInstallSteps: [],
    },
  };
}

function managedDevServer(): ManagedDevServerSummary {
  return {
    id: "server-1",
    command: "pnpm run dev",
    cwd: "/tmp/app",
    pid: 12345,
    startedAt: "2026-06-23T12:01:00.000Z",
    readyAt: "2026-06-23T12:01:05.000Z",
    sandboxKind: "policy-only",
    sandboxReason: "Workspace policy sandbox.",
  };
}
