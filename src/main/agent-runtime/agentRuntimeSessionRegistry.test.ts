import { describe, expect, it, vi } from "vitest";

import { AgentRuntimeSessionRegistry } from "./agentRuntimeSessionRegistry";
import type { SymphonyParentModePolicy } from "./agentRuntimeSymphonyParentMode";

function session() {
  return {
    dispose: vi.fn(),
  };
}

function policy(toolName = "call_workflow_alpha"): SymphonyParentModePolicy {
  return {
    enabled: true,
    reason: "symphony-composer-run-once",
    launchRequirement: "required_this_turn",
    directExecutionPolicy: "deny_substantive_tools",
    expectedWorkflowToolName: toolName,
    expectedWorkflowSourceKind: "symphony_recipe",
    expectedPatternId: "alpha",
  };
}

describe("AgentRuntimeSessionRegistry", () => {
  it("returns reusable sessions until a stale marker is consumed", () => {
    const registry = new AgentRuntimeSessionRegistry<ReturnType<typeof session>>();
    const cached = session();
    registry.set({ threadId: "thread-a", session: cached });

    expect(registry.reusableSessionPlan({ threadId: "thread-a" })).toEqual({
      kind: "reusable",
      session: cached,
    });

    registry.markPluginToolsStale("thread-a");

    expect(registry.reusableSessionPlan({ threadId: "thread-a" })).toEqual({
      kind: "stale",
      session: cached,
      pluginToolsStale: true,
      runtimeSettingsStale: false,
      symphonyParentModeStale: false,
    });
    expect(cached.dispose).not.toHaveBeenCalled();
  });

  it("applies settings resets by disposing idle sessions and deferring active sessions", () => {
    const registry = new AgentRuntimeSessionRegistry<ReturnType<typeof session>>();
    const idle = session();
    const active = session();
    const callbacks = {
      onDeferred: vi.fn(),
      onDisposed: vi.fn(),
    };
    registry.set({ threadId: "idle", session: idle });
    registry.set({ threadId: "active", session: active });

    const result = registry.resetForRuntimeSettings(new Set(["active"]), callbacks);

    expect(result).toEqual({
      disposedSessions: 1,
      deferredSessions: 1,
      disposedThreadIds: ["idle"],
      deferredThreadIds: ["active"],
    });
    expect(idle.dispose).toHaveBeenCalledTimes(1);
    expect(active.dispose).not.toHaveBeenCalled();
    expect(registry.get("idle")).toBeUndefined();
    expect(registry.get("active")).toBe(active);
    expect(callbacks.onDisposed).toHaveBeenCalledWith("idle", idle);
    expect(callbacks.onDeferred).toHaveBeenCalledWith("active", active);
    expect(registry.reusableSessionPlan({ threadId: "active" })).toEqual({
      kind: "stale",
      session: active,
      pluginToolsStale: false,
      runtimeSettingsStale: true,
      symphonyParentModeStale: false,
    });
  });

  it("invalidates cached sessions when Symphony parent-mode metadata changes", () => {
    const registry = new AgentRuntimeSessionRegistry<ReturnType<typeof session>>();
    const cached = session();
    registry.set({
      threadId: "thread-symphony",
      session: cached,
      symphonyParentModePolicy: policy("call_workflow_alpha"),
      symphonyParentModeVerifiedLaunch: {
        parentThreadId: "thread-symphony",
        parentRunId: "run-a",
        taskId: "task-a",
        toolName: "call_workflow_alpha",
        sourceKind: "symphony_recipe",
      },
    });

    expect(registry.reusableSessionPlan({
      threadId: "thread-symphony",
      symphonyParentModePolicy: policy("call_workflow_alpha"),
      symphonyParentModeVerifiedLaunch: {
        parentThreadId: "thread-symphony",
        parentRunId: "run-b",
        taskId: "task-b",
        toolName: "call_workflow_alpha",
        sourceKind: "symphony_recipe",
      },
    })).toEqual({
      kind: "reusable",
      session: cached,
    });

    expect(registry.reusableSessionPlan({
      threadId: "thread-symphony",
      symphonyParentModePolicy: policy("call_workflow_beta"),
      symphonyParentModeVerifiedLaunch: {
        parentThreadId: "thread-symphony",
        parentRunId: "run-c",
        taskId: "task-c",
        toolName: "call_workflow_beta",
        sourceKind: "symphony_recipe",
      },
    })).toEqual({
      kind: "stale",
      session: cached,
      pluginToolsStale: false,
      runtimeSettingsStale: false,
      symphonyParentModeStale: true,
    });
  });
});
