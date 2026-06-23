import { describe, expect, it, vi } from "vitest";
import type { AgentMemoryRuntimeSnapshot } from "../../shared/agentMemoryDiagnostics";
import type { ModelRuntimeSettings, ThreadSummary } from "../../shared/threadTypes";
import { AgentRuntimeSessionRegistry } from "./agentRuntimeSessionRegistry";
import type { AgentRuntimePiSession } from "./agentRuntimeSessionFactoryController";
import { AgentRuntimeSettingsSessionController } from "./agentRuntimeSettingsSessionController";

const modelRuntimeSettings: ModelRuntimeSettings = {
  aggressiveRetries: true,
  showPromptCacheStatus: false,
  providerPreStreamTimeoutMs: 45_000,
  providerStreamIdleTimeoutMs: 30_000,
  installedProviders: [],
};

describe("AgentRuntimeSettingsSessionController", () => {
  it("applies runtime settings by disposing idle sessions, deferring active sessions, and clearing runtime caches", () => {
    const idle = session("kimi");
    const active = session("kimi");
    const harness = controllerHarness({
      activeThreadIds: ["active"],
      sessions: {
        idle,
        active,
      },
    });

    const result = harness.controller.applyRuntimeSettings(modelRuntimeSettings);

    expect(result).toEqual({
      disposedSessions: 1,
      deferredSessions: 1,
      disposedThreadIds: ["idle"],
      deferredThreadIds: ["active"],
    });
    expect(idle.dispose).toHaveBeenCalledTimes(1);
    expect(active.dispose).not.toHaveBeenCalled();
    expect(harness.ambientCliSkillMountDiagnostics.has("idle")).toBe(false);
    expect(harness.tencentMemoryRuntimeSnapshots.has("idle")).toBe(false);
    expect(harness.ambientCliSkillMountDiagnostics.has("active")).toBe(true);
    expect(harness.tencentMemoryRuntimeSnapshots.has("active")).toBe(true);
    expect(harness.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "runtime-activity",
      activity: expect.objectContaining({ threadId: "idle", status: "applied" }),
    }));
    expect(harness.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "runtime-activity",
      activity: expect.objectContaining({ threadId: "active", status: "deferred" }),
    }));
  });

  it("applies thread model settings by switching idle mismatched sessions and deferring active mismatches", async () => {
    const idle = session("old-model");
    const active = session("old-model");
    const sameModel = session("kimi");
    const harness = controllerHarness({
      activeThreadIds: ["active"],
      sessions: {
        idle,
        active,
        same: sameModel,
      },
      threads: {
        idle: thread("idle", "new-model"),
        active: thread("active", "new-model"),
        same: thread("same", "kimi", "high"),
        missing: thread("missing", "new-model"),
      },
    });

    await expect(harness.controller.applyThreadModelSettings("missing")).resolves.toEqual({
      switchedSessions: 0,
      deferredSessions: 0,
      switchedThreadIds: [],
      deferredThreadIds: [],
    });
    await expect(harness.controller.applyThreadModelSettings("same")).resolves.toEqual({
      switchedSessions: 0,
      deferredSessions: 0,
      switchedThreadIds: [],
      deferredThreadIds: [],
    });
    expect(sameModel.setThinkingLevel).toHaveBeenCalledWith("high");

    await expect(harness.controller.applyThreadModelSettings("active")).resolves.toEqual({
      switchedSessions: 0,
      deferredSessions: 1,
      switchedThreadIds: [],
      deferredThreadIds: ["active"],
    });
    expect(harness.switchSessionToThreadModel).not.toHaveBeenCalledWith(harness.threads.active, active);

    await expect(harness.controller.applyThreadModelSettings("idle")).resolves.toEqual({
      switchedSessions: 1,
      deferredSessions: 0,
      switchedThreadIds: ["idle"],
      deferredThreadIds: [],
    });
    expect(harness.switchSessionToThreadModel).toHaveBeenCalledWith(harness.threads.idle, idle);
  });

  it("applies thread memory settings to only the requested cached session", () => {
    const idle = session("kimi");
    const other = session("kimi");
    const harness = controllerHarness({
      sessions: {
        idle,
        other,
      },
    });

    expect(harness.controller.applyThreadMemorySettings("idle")).toEqual({
      disposedSessions: 1,
      deferredSessions: 0,
      disposedThreadIds: ["idle"],
      deferredThreadIds: [],
    });
    expect(idle.dispose).toHaveBeenCalledTimes(1);
    expect(other.dispose).not.toHaveBeenCalled();
    expect(harness.ambientCliSkillMountDiagnostics.has("idle")).toBe(false);
    expect(harness.tencentMemoryRuntimeSnapshots.has("idle")).toBe(false);
    expect(harness.ambientCliSkillMountDiagnostics.has("other")).toBe(true);
    expect(harness.tencentMemoryRuntimeSnapshots.has("other")).toBe(true);
    expect(harness.controller.listAgentMemoryRuntimeSnapshots()).toEqual([harness.memorySnapshot("other")]);
  });
});

function controllerHarness(input: {
  activeThreadIds?: string[];
  sessions?: Record<string, AgentRuntimePiSession>;
  threads?: Record<string, ThreadSummary>;
} = {}) {
  const sessions = new AgentRuntimeSessionRegistry<AgentRuntimePiSession>();
  for (const [threadId, cachedSession] of Object.entries(input.sessions ?? {})) {
    sessions.set({ threadId, session: cachedSession });
  }
  const activeRuns = new Set(input.activeThreadIds ?? []);
  const ambientCliSkillMountDiagnostics = new Map<string, unknown>();
  const tencentMemoryRuntimeSnapshots = new Map<string, AgentMemoryRuntimeSnapshot>();
  for (const threadId of Object.keys(input.sessions ?? {})) {
    ambientCliSkillMountDiagnostics.set(threadId, {});
    tencentMemoryRuntimeSnapshots.set(threadId, memorySnapshot(threadId));
  }
  const threads = input.threads ?? {};
  const emit = vi.fn();
  const switchSessionToThreadModel = vi.fn(async () => undefined);
  const controller = new AgentRuntimeSettingsSessionController({
    sessions,
    activeRuns,
    ambientCliSkillMountDiagnostics,
    tencentMemoryRuntimeSnapshots,
    getThread: (threadId) => threads[threadId] ?? thread(threadId, "kimi"),
    switchSessionToThreadModel,
    emit,
  });
  return {
    controller,
    emit,
    switchSessionToThreadModel,
    ambientCliSkillMountDiagnostics,
    tencentMemoryRuntimeSnapshots,
    threads,
    memorySnapshot,
  };
}

function session(modelId: string): AgentRuntimePiSession {
  return {
    model: { id: modelId },
    dispose: vi.fn(),
    setThinkingLevel: vi.fn(),
  } as unknown as AgentRuntimePiSession;
}

function thread(id: string, model: string, thinkingLevel: ThreadSummary["thinkingLevel"] = "medium"): ThreadSummary {
  return {
    id,
    model,
    thinkingLevel,
  } as ThreadSummary;
}

function memorySnapshot(threadId: string): AgentMemoryRuntimeSnapshot {
  return {
    threadId,
    active: false,
    dataDir: `/workspace/${threadId}/memory`,
    sessionKey: `session-${threadId}`,
  };
}
