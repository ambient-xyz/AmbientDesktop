import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AmbientMcpContainerRuntimeStatus } from "../../shared/pluginTypes";
import { McpContainerRuntimeDialog } from "./RightPanelDialogs";

describe("RightPanelDialogs", () => {
  it("renders a visible close affordance for MCP runtime setup", () => {
    const html = renderToStaticMarkup(
      <McpContainerRuntimeDialog
        status={runtimeStatus()}
        busy={false}
        launchBusy={false}
        diagnosticBusy={false}
        lifecycleProgress={[]}
        onRefresh={vi.fn()}
        onLaunchInstall={vi.fn()}
        onPreviewLifecycle={vi.fn()}
        onRunLifecycle={vi.fn()}
        onExportDiagnostics={vi.fn()}
        onInstallDefaultCapability={vi.fn()}
        onOpenPlugins={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain("Close MCP runtime setup");
    expect(html).toContain("dialog-close-button");
  });
});

function runtimeStatus(): AmbientMcpContainerRuntimeStatus {
  return {
    schemaVersion: "ambient-container-runtime-probe-v1",
    status: "ready",
    runtime: "docker",
    platform: "darwin",
    arch: "arm64",
    checkedAt: "2026-06-27T20:00:00.000Z",
    durationMs: 12,
    message: "ToolHive container runtime preflight passed.",
    nextAction: "none",
    toolHive: {
      status: "ready",
      message: "ToolHive ready",
      preflightOk: true,
    },
    hosts: [{ kind: "docker", status: "ready", message: "docker CLI and daemon are reachable." }],
    setup: {
      userDecision: "none",
      shouldPrompt: false,
      promptSuppressed: false,
      reason: "runtime-ready",
    },
    postInstallQueue: [],
    defaultCapabilities: [],
  };
}
