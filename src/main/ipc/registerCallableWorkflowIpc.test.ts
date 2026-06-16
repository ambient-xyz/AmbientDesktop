import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import {
  callableWorkflowIpcChannels,
  registerCallableWorkflowIpc,
  type CallableWorkflowHost,
  type RegisterCallableWorkflowIpcDependencies,
} from "./registerCallableWorkflowIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];
type TestStore = { flagsEnabled: boolean };
type TestHost = CallableWorkflowHost<TestStore>;

describe("registerCallableWorkflowIpc", () => {
  it("registers callable workflow control channels", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...callableWorkflowIpcChannels]);
  });

  it("cancels a callable workflow task after parsing and feature-flag gating", async () => {
    const { deps, host, invoke } = registerWithFakes();

    await expect(invoke("callable-workflow:cancel-task", {
      taskId: "task-1",
      reason: "No longer needed",
      extra: true,
    })).resolves.toEqual({ status: "cancelled" });

    expect(deps.requireProjectRuntimeHostForCallableWorkflowTask).toHaveBeenCalledWith("task-1");
    expect(deps.getFeatureFlagSnapshot).toHaveBeenCalledWith(host.store);
    expect(host.runtime.cancelCallableWorkflowTask).toHaveBeenCalledWith({
      taskId: "task-1",
      reason: "No longer needed",
    });
  });

  it("pauses a callable workflow task", async () => {
    const { host, invoke } = registerWithFakes();

    await expect(invoke("callable-workflow:pause-task", {
      taskId: "task-2",
      reason: "Wait for review",
    })).resolves.toEqual({ status: "paused" });

    expect(host.runtime.pauseCallableWorkflowTask).toHaveBeenCalledWith({
      taskId: "task-2",
      reason: "Wait for review",
    });
  });

  it("resumes a callable workflow task", async () => {
    const { host, invoke } = registerWithFakes();

    await expect(invoke("callable-workflow:resume-task", { taskId: "task-3" })).resolves.toEqual({
      status: "resumed",
    });

    expect(host.runtime.resumeCallableWorkflowTask).toHaveBeenCalledWith({ taskId: "task-3" });
  });

  it("rejects invalid input before resolving a host", () => {
    const { deps, invoke } = registerWithFakes();

    expect(() => invoke("callable-workflow:cancel-task", { taskId: "" })).toThrow();

    expect(deps.requireProjectRuntimeHostForCallableWorkflowTask).not.toHaveBeenCalled();
  });

  it("blocks controls when ambient subagents are disabled", async () => {
    const { host, invoke } = registerWithFakes({ flagsEnabled: false });

    expect(() => invoke("callable-workflow:pause-task", { taskId: "task-4" })).toThrow(
      "Callable workflow task controls are disabled while ambient.subagents is off.",
    );

    expect(host.runtime.pauseCallableWorkflowTask).not.toHaveBeenCalled();
  });
});

function registerWithFakes({
  flagsEnabled = true,
}: {
  flagsEnabled?: boolean;
} = {}): {
  deps: RegisterCallableWorkflowIpcDependencies<TestStore, TestHost>;
  handlers: Map<string, IpcListener>;
  host: TestHost;
  invoke(channel: string, raw?: unknown): Promise<unknown>;
} {
  const handlers = new Map<string, IpcListener>();
  const host: TestHost = {
    store: { flagsEnabled },
    runtime: {
      cancelCallableWorkflowTask: vi.fn(async () => ({ status: "cancelled" })),
      pauseCallableWorkflowTask: vi.fn(async () => ({ status: "paused" })),
      resumeCallableWorkflowTask: vi.fn(async () => ({ status: "resumed" })),
    },
  };
  const deps: RegisterCallableWorkflowIpcDependencies<TestStore, TestHost> = {
    handleIpc: vi.fn((channel, listener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForCallableWorkflowTask: vi.fn(() => host),
    getFeatureFlagSnapshot: vi.fn((store) => featureFlagSnapshot(store.flagsEnabled)),
  };

  registerCallableWorkflowIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel, raw) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function featureFlagSnapshot(enabled: boolean): AmbientFeatureFlagSnapshot {
  return {
    schemaVersion: "ambient-feature-flags-v1",
    generatedAt: "2026-06-15T00:00:00.000Z",
    flags: {
      "ambient.subagents": {
        id: "ambient.subagents",
        enabled,
        source: "settings",
        defaultEnabled: false,
      },
      "ambient.memory.tencentdb": {
        id: "ambient.memory.tencentdb",
        enabled: false,
        source: "default",
        defaultEnabled: false,
      },
    },
  };
}
