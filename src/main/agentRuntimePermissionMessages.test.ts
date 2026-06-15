import { describe, expect, it } from "vitest";

import type { PermissionRequest } from "../shared/types";
import {
  formatPermissionBlockedMessage,
  formatPermissionDeniedToolResultReason,
  fullAccessAllowedToolAudit,
  runtimePermissionWaitActivity,
  runtimePermissionWaitActivityMessage,
  runtimePermissionWaitToolResult,
} from "./agentRuntimePermissionMessages";

function request(grantConditions?: Record<string, unknown>): Omit<PermissionRequest, "id"> {
  return {
    threadId: "thread-1",
    toolName: "tool",
    risk: "plugin-tool",
    title: "Allow tool?",
    message: "Allow tool?",
    grantConditions,
  };
}

describe("agentRuntimePermissionMessages", () => {
  it("builds permission wait activity messages", () => {
    expect(runtimePermissionWaitActivityMessage({
      wait: {
        toolName: "bash",
        title: "Run command?",
      },
    })).toBe("Waiting for permission approval: Run command?.");
    expect(runtimePermissionWaitActivityMessage({
      wait: { toolName: "bash" },
    })).toBe("Waiting for permission approval for bash.");
    expect(runtimePermissionWaitActivityMessage({
      wait: { toolName: "bash" },
      finish: { error: "window closed" },
    })).toBe("Permission prompt failed for bash: window closed");
    expect(runtimePermissionWaitActivityMessage({
      wait: { toolName: "bash" },
      finish: { allowed: false },
    })).toBe("Permission denied for bash.");
    expect(runtimePermissionWaitActivityMessage({
      wait: { toolName: "bash" },
      finish: { allowed: true },
    })).toBe("Permission resolved for bash.");
  });

  it("builds permission wait runtime activities", () => {
    const wait = {
      toolName: "bash",
      requestId: "permission-1",
      title: "Run command?",
      risk: "workspace-command" as const,
    };

    expect(runtimePermissionWaitActivity({
      threadId: "thread-1",
      wait,
    })).toEqual({
      threadId: "thread-1",
      kind: "permission",
      status: "waiting",
      toolName: "bash",
      requestId: "permission-1",
      title: "Run command?",
      risk: "workspace-command",
      message: "Waiting for permission approval: Run command?.",
    });
    expect(runtimePermissionWaitActivity({
      threadId: "thread-1",
      wait,
      finish: { allowed: false, mode: "deny" },
    })).toEqual({
      threadId: "thread-1",
      kind: "permission",
      status: "finished",
      toolName: "bash",
      requestId: "permission-1",
      title: "Run command?",
      risk: "workspace-command",
      allowed: false,
      mode: "deny",
      message: "Permission denied for bash.",
    });
  });

  it("builds permission wait tool card text and details", () => {
    expect(runtimePermissionWaitToolResult({
      wait: {
        toolName: "bash",
        requestId: "permission-1",
        title: "Run command?",
      },
      toolName: "shell",
      elapsedMs: 10_500,
    })).toEqual({
      resultText: "Waiting for Ambient Desktop approval: Run command?.\nApproval request: permission-1",
      details: {
        runtime: "ambient-permission",
        toolName: "shell",
        status: "awaiting-approval",
        stage: "approval",
        waitingOn: "desktop-approval",
        elapsedMs: 10_500,
        heartbeatCount: 3,
        approvalRequestId: "permission-1",
        approvalTitle: "Run command?",
      },
    });
  });

  it("builds permission wait completion variants", () => {
    expect(runtimePermissionWaitToolResult({
      wait: { toolName: "bash" },
      toolName: "bash",
      elapsedMs: 0,
      finish: { error: "window closed" },
    })).toMatchObject({
      resultText: "Ambient Desktop approval failed for bash: window closed",
      details: { status: "approval-error", heartbeatCount: 1 },
    });
    expect(runtimePermissionWaitToolResult({
      wait: { toolName: "bash" },
      toolName: "bash",
      elapsedMs: 4_999,
      finish: { allowed: false },
    })).toMatchObject({
      resultText: "Ambient Desktop approval denied for bash.",
      details: { status: "approval-denied", heartbeatCount: 1 },
    });
    expect(runtimePermissionWaitToolResult({
      wait: { toolName: "bash" },
      toolName: "bash",
      elapsedMs: 5_000,
      finish: { allowed: true },
    })).toMatchObject({
      resultText: "Ambient Desktop approval resolved for bash.",
      details: { status: "approval-resolved", heartbeatCount: 2 },
    });
  });

  it("formats blocked permission messages with optional detail", () => {
    expect(formatPermissionBlockedMessage("bash", undefined)).toBe("Permission policy blocked bash.");
    expect(formatPermissionBlockedMessage("bash", "Command touches /tmp")).toBe([
      "Permission policy blocked bash.",
      "",
      "Command touches /tmp",
    ].join("\n"));
  });

  it("formats MiniCPM denial reasons from tool or operation/action conditions", () => {
    expect(formatPermissionDeniedToolResultReason("ambient_visual_minicpm_setup", request())).toBe(
      "User denied MiniCPM-V setup. No MiniCPM-V provider changes were made.",
    );
    expect(formatPermissionDeniedToolResultReason("other_tool", request({
      operation: "minicpm_visual_setup",
      action: "uninstall",
    }))).toBe(
      "User denied MiniCPM-V uninstall. No MiniCPM-V package, runtime, or cache files were removed.",
    );
    expect(formatPermissionDeniedToolResultReason("ambient_visual_minicpm_setup", request({ action: "repair" }))).toBe(
      "User denied MiniCPM-V Repair. No provider package, runtime, or model binding changes were made.",
    );
  });

  it("formats local model runtime denial reasons with runtime ids and force flags", () => {
    expect(formatPermissionDeniedToolResultReason("ambient_local_model_runtime_start", request({
      runtimeId: "llama",
    }))).toBe("User denied local model runtime Start for llama. The runtime was not started.");
    expect(formatPermissionDeniedToolResultReason("ambient_local_model_runtime_stop", request({
      runtimeId: "llama",
      force: true,
    }))).toBe("User denied local model runtime forced Stop for llama. The runtime was not stopped.");
    expect(formatPermissionDeniedToolResultReason("other_tool", request({
      operation: "local_model_runtime_restart",
    }))).toBe("User denied local model runtime Restart. The runtime was not restarted.");
  });

  it("falls back to the generic permission denial reason", () => {
    expect(formatPermissionDeniedToolResultReason("browser_nav", request())).toBe("Blocked by Ambient Desktop permission policy.");
  });

  it("builds full-access audit summaries for shell and file mutations", () => {
    expect(fullAccessAllowedToolAudit("bash", { command: "pnpm test" })).toEqual({
      risk: "workspace-command",
      detail: "pnpm test",
      reason: "Allowed by Power User full-access mode after invariant safety checks.",
    });
    expect(fullAccessAllowedToolAudit("edit", { path: "/tmp/workspace/file.ts" })).toEqual({
      risk: "outside-workspace",
      detail: "/tmp/workspace/file.ts",
      reason: "Allowed file mutation by Power User full-access mode after invariant safety checks.",
    });
    expect(fullAccessAllowedToolAudit("browser_nav", { url: "https://example.com" })).toBeUndefined();
  });
});
