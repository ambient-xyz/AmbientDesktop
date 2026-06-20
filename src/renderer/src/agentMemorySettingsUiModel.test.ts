import { describe, expect, it } from "vitest";

import type { AgentMemoryStarterNextAction, AgentMemoryStarterOperationResult, AgentMemoryStarterStatus } from "../../shared/agentMemoryStarter";
import {
  agentMemoryStarterOperationLogPreview,
  agentMemoryStarterOperationForAction,
  agentMemoryStarterSetupAction,
  agentMemoryStarterSetupActionLabel,
} from "./RightPanelSettingsCore";

function starterStatus(input: {
  state: AgentMemoryStarterStatus["state"];
  nextActions: AgentMemoryStarterNextAction[];
}): AgentMemoryStarterStatus {
  return {
    schemaVersion: "ambient-agent-memory-starter-status-v1",
    checkedAt: "2026-06-18T00:00:00.000Z",
    state: input.state,
    settings: {
      featureFlags: { tencentDbMemory: true },
      memory: {
        mode: input.state === "off" ? "disabled" : "enabled_all",
        enabled: input.state !== "off",
        defaultThreadEnabled: true,
        adapter: "tencentdb",
        shortTermOffloadEnabled: false,
        embeddings: {
          enabled: input.state !== "off",
          providerMode: "ambient-managed",
          autoStartProvider: true,
          sendDimensions: false,
          maxInputChars: 512,
          timeoutMs: 10000,
          preflightEnabled: true,
        },
        storageScope: "workspace",
      },
    },
    threadScope: {
      activeThreadMemoryEnabled: input.state !== "off",
      defaultThreadEnabled: true,
    },
    assets: {
      model: { state: "present" },
      runtime: { state: "present" },
    },
    runtime: {
      state: input.state === "ready" ? "running" : "stopped",
    },
    embedding: {
      enabled: input.state !== "off",
      status: input.state === "ready" ? "ready" : input.state === "off" ? "disabled" : "keyword_fallback",
      message: "test",
    },
    nativePreflight: {
      schemaVersion: "ambient-agent-memory-native-preflight-v1",
      checkedAt: "2026-06-18T00:00:00.000Z",
      platform: "darwin",
      arch: "arm64",
      coreModuleConfigured: true,
      status: "healthy",
      message: "ok",
      dependencies: [],
      errors: [],
    },
    blockers: [],
    nextActions: input.nextActions,
  };
}

describe("Agent Memory settings action model", () => {
  it("surfaces disable as the ready-state setup action", () => {
    const action = agentMemoryStarterSetupAction(starterStatus({
      state: "ready",
      nextActions: ["disable", "clear_memory"],
    }));

    expect(action).toBe("disable");
    expect(agentMemoryStarterOperationForAction(action)).toBe("disable");
    expect(agentMemoryStarterSetupActionLabel(action)).toBe("Disable");
  });

  it("routes install, start, retry, and repair through the repair operation", () => {
    for (const action of ["install", "start", "retry_preflight", "repair"] satisfies AgentMemoryStarterNextAction[]) {
      expect(agentMemoryStarterOperationForAction(action)).toBe("repair");
    }
  });

  it("keeps setup-required start actions runnable", () => {
    const action = agentMemoryStarterSetupAction(starterStatus({
      state: "setup_required",
      nextActions: ["start", "disable"],
    }));

    expect(action).toBe("start");
    expect(agentMemoryStarterOperationForAction(action)).toBe("repair");
    expect(agentMemoryStarterSetupActionLabel(action)).toBe("Start");
  });

  it("keeps setup-required enable actions runnable", () => {
    const action = agentMemoryStarterSetupAction(starterStatus({
      state: "setup_required",
      nextActions: ["enable", "disable"],
    }));

    expect(action).toBe("enable");
    expect(agentMemoryStarterOperationForAction(action)).toBe("enable");
    expect(agentMemoryStarterSetupActionLabel(action)).toBe("Enable");
  });

  it("surfaces enable as the off-state action", () => {
    const action = agentMemoryStarterSetupAction(starterStatus({
      state: "off",
      nextActions: ["enable"],
    }));

    expect(action).toBe("enable");
    expect(agentMemoryStarterOperationForAction(action)).toBe("enable");
    expect(agentMemoryStarterSetupActionLabel(action)).toBe("Enable");
  });

  it("does not expose non-starter actions as a runnable setup action", () => {
    const action = agentMemoryStarterSetupAction(starterStatus({
      state: "ready",
      nextActions: ["clear_memory"],
    }));

    expect(action).toBeUndefined();
    expect(agentMemoryStarterOperationForAction(action)).toBeUndefined();
  });

  it("keeps resident cleanup entries visible in operation log previews", () => {
    const preview = agentMemoryStarterOperationLogPreview({
      log: [
        starterLog("repair", "started", "Repairing Agent Memory."),
        starterLog("feature-flag", "passed", "Feature enabled."),
        starterLog("settings", "passed", "Settings enabled."),
        starterLog("resident-cleanup", "started", "Inspecting resident llama.cpp runtimes."),
        starterLog("resident-cleanup", "passed", "Stopped 1 orphaned Ambient memory embedding runtime."),
        starterLog("start-embeddings", "passed", "Ambient-managed memory embeddings started."),
        starterLog("final-status", "passed", "Agent Memory starter status is ready."),
      ],
    });

    expect(preview.map((entry) => entry.step)).toEqual([
      "resident-cleanup",
      "resident-cleanup",
      "start-embeddings",
    ]);
  });
});

function starterLog(
  step: string,
  status: AgentMemoryStarterOperationResult["log"][number]["status"],
  message: string,
): AgentMemoryStarterOperationResult["log"][number] {
  return {
    at: "2026-06-18T00:00:00.000Z",
    step,
    status,
    message,
  };
}
