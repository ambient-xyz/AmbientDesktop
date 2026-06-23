import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type {
  AmbientMcpContainerRuntimeLifecyclePreview,
  AmbientMcpContainerRuntimeLifecycleProgress,
  AmbientMcpContainerRuntimeLifecycleResult,
  AmbientMcpContainerRuntimeStatus,
} from "../../shared/pluginTypes";
import {
  containerRuntimeLifecyclePreviewStatus,
  containerRuntimeLifecycleProgressStatus,
  containerRuntimeLifecycleResultStatus,
  containerRuntimeRuntimeOption,
} from "./RightPanelMcpContainerRuntimeLifecycleController";

const mcpControllerSource = readFileSync(new URL("./RightPanelMcpController.ts", import.meta.url), "utf8");
const lifecycleControllerSource = readFileSync(new URL("./RightPanelMcpContainerRuntimeLifecycleController.ts", import.meta.url), "utf8");

describe("RightPanelMcpContainerRuntimeLifecycleController", () => {
  it("keeps runtime selection constrained to supported container runtimes", () => {
    expect(containerRuntimeRuntimeOption(runtimeStatus("docker"))).toBe("docker");
    expect(containerRuntimeRuntimeOption(runtimeStatus("podman"))).toBe("podman");
    expect(containerRuntimeRuntimeOption(runtimeStatus("colima"))).toBe("colima");
    expect(containerRuntimeRuntimeOption(runtimeStatus("unknown"))).toBeUndefined();
    expect(containerRuntimeRuntimeOption(undefined)).toBeUndefined();
  });

  it("maps lifecycle preview, run, and progress status copy consistently", () => {
    expect(containerRuntimeLifecyclePreviewStatus(preview("available", "Ready to restart."))).toEqual({
      kind: "info",
      message: "Ready to restart.",
    });
    expect(containerRuntimeLifecyclePreviewStatus(preview("blocked", "Restart blocked."))).toEqual({
      kind: "error",
      message: "Restart blocked.",
    });
    expect(containerRuntimeLifecycleResultStatus(result("ready", "Runtime recovered."))).toEqual({
      kind: "success",
      message: "Runtime recovered.",
    });
    expect(containerRuntimeLifecycleResultStatus(result("running", "Recovery still running."))).toEqual({
      kind: "success",
      message: "Recovery still running.",
    });
    expect(containerRuntimeLifecycleResultStatus(result("failed", "Recovery failed."))).toEqual({
      kind: "error",
      message: "Recovery failed.",
    });
    expect(containerRuntimeLifecycleProgressStatus(progress("running", "Stopping daemon."))).toEqual({
      kind: "info",
      message: "Stopping daemon.",
    });
    expect(containerRuntimeLifecycleProgressStatus(progress("succeeded", "Daemon stopped."))).toEqual({
      kind: "success",
      message: "Daemon stopped.",
    });
    expect(containerRuntimeLifecycleProgressStatus(progress("failed", "Daemon still running."))).toEqual({
      kind: "error",
      message: "Daemon still running.",
    });
  });

  it("keeps lifecycle IPC and progress ownership out of the parent MCP controller", () => {
    expect(mcpControllerSource).toContain("useRightPanelMcpContainerRuntimeLifecycleController");
    expect(mcpControllerSource).not.toContain("window.ambientDesktop.previewMcpContainerRuntimeLifecycle");
    expect(mcpControllerSource).not.toContain("window.ambientDesktop.runMcpContainerRuntimeLifecycle");
    expect(mcpControllerSource).not.toContain('event.type === "mcp-container-runtime-lifecycle-progress"');
    expect(lifecycleControllerSource).toContain("window.ambientDesktop.previewMcpContainerRuntimeLifecycle");
    expect(lifecycleControllerSource).toContain("window.ambientDesktop.runMcpContainerRuntimeLifecycle");
    expect(lifecycleControllerSource).toContain('event.type !== "mcp-container-runtime-lifecycle-progress"');
  });
});

function runtimeStatus(runtime: AmbientMcpContainerRuntimeStatus["runtime"]): AmbientMcpContainerRuntimeStatus {
  return { runtime } as AmbientMcpContainerRuntimeStatus;
}

function preview(
  status: AmbientMcpContainerRuntimeLifecyclePreview["status"],
  summary: string,
): AmbientMcpContainerRuntimeLifecyclePreview {
  return { status, summary } as AmbientMcpContainerRuntimeLifecyclePreview;
}

function result(status: AmbientMcpContainerRuntimeLifecycleResult["status"], message: string): AmbientMcpContainerRuntimeLifecycleResult {
  return { status, message } as AmbientMcpContainerRuntimeLifecycleResult;
}

function progress(
  status: AmbientMcpContainerRuntimeLifecycleProgress["status"],
  message: string,
): AmbientMcpContainerRuntimeLifecycleProgress {
  return { status, message } as AmbientMcpContainerRuntimeLifecycleProgress;
}
