import { describe, expect, it, vi } from "vitest";
import {
  createProjectRuntimeWorkspaceSwitchService,
  type ProjectRuntimeWorkspaceSwitchHost,
  type ProjectRuntimeWorkspaceSwitchStore,
} from "./projectRuntimeWorkspaceSwitchService";

interface FakeState {
  activeThreadId: string;
  workspacePath: string;
}

interface FakeStore extends ProjectRuntimeWorkspaceSwitchStore {
  workspacePath: string;
  threads: Array<{ id: string }>;
  autoDispatchEnabled: boolean;
}

interface FakeHost extends ProjectRuntimeWorkspaceSwitchHost<FakeStore> {
  workspacePath: string;
}

function createHost(input: {
  workspacePath?: string;
  threadIds?: string[];
  autoDispatchEnabled?: boolean;
} = {}): FakeHost {
  const workspacePath = input.workspacePath ?? "/workspace/project";
  return {
    workspacePath,
    autoDispatch: {
      enabled: false,
      lastError: "previous error",
    },
    store: {
      workspacePath,
      threads: (input.threadIds ?? ["thread-1"]).map((id) => ({ id })),
      autoDispatchEnabled: input.autoDispatchEnabled ?? true,
      getAutomationAutoDispatchEnabled() {
        return this.autoDispatchEnabled;
      },
      getWorkspace() {
        return { path: this.workspacePath };
      },
      listThreads() {
        return this.threads;
      },
    },
  };
}

function createHarness(host = createHost()) {
  const activateProjectRuntimeHost = vi.fn(() => host);
  const clearImportedWorkspaceContextCacheSync = vi.fn();
  const runWorkflowTraceRetentionSweep = vi.fn();
  const scheduleWorkflowTraceRetentionSweep = vi.fn();
  const scheduleAutoDispatch = vi.fn();
  const registerProjectWorkspacePath = vi.fn();
  const initialActiveThreadId = vi.fn(() => "fallback-thread");
  const setActiveThreadId = vi.fn((threadId: string) => threadId);
  const readState = vi.fn((activeThreadId: string): FakeState => ({
    activeThreadId,
    workspacePath: host.workspacePath,
  }));
  const service = createProjectRuntimeWorkspaceSwitchService<FakeHost, FakeState>({
    activateProjectRuntimeHost,
    clearImportedWorkspaceContextCacheSync,
    runWorkflowTraceRetentionSweep,
    scheduleWorkflowTraceRetentionSweep,
    scheduleAutoDispatch,
    registerProjectWorkspacePath,
    initialActiveThreadId,
    setActiveThreadId,
    readState,
  });

  return {
    activateProjectRuntimeHost,
    clearImportedWorkspaceContextCacheSync,
    host,
    initialActiveThreadId,
    readState,
    registerProjectWorkspacePath,
    runWorkflowTraceRetentionSweep,
    scheduleAutoDispatch,
    scheduleWorkflowTraceRetentionSweep,
    service,
    setActiveThreadId,
  };
}

describe("createProjectRuntimeWorkspaceSwitchService", () => {
  it("switches to the requested existing thread and runs workspace-switch side effects", () => {
    const host = createHost({ threadIds: ["thread-1", "thread-2"] });
    const {
      activateProjectRuntimeHost,
      clearImportedWorkspaceContextCacheSync,
      host: switchedHost,
      initialActiveThreadId,
      readState,
      registerProjectWorkspacePath,
      runWorkflowTraceRetentionSweep,
      scheduleAutoDispatch,
      scheduleWorkflowTraceRetentionSweep,
      service,
      setActiveThreadId,
    } = createHarness(host);

    const state = service.switchWorkspace("/workspace/project", "thread-2");

    expect(state).toEqual({ activeThreadId: "thread-2", workspacePath: "/workspace/project" });
    expect(activateProjectRuntimeHost).toHaveBeenCalledWith("/workspace/project");
    expect(clearImportedWorkspaceContextCacheSync).toHaveBeenCalledTimes(2);
    expect(clearImportedWorkspaceContextCacheSync).toHaveBeenNthCalledWith(1, "workspace-switch");
    expect(clearImportedWorkspaceContextCacheSync).toHaveBeenNthCalledWith(2, "workspace-switch");
    expect(runWorkflowTraceRetentionSweep).toHaveBeenCalledWith("workspace-switch", switchedHost);
    expect(scheduleWorkflowTraceRetentionSweep).toHaveBeenCalledTimes(1);
    expect(switchedHost.autoDispatch).toMatchObject({ enabled: true });
    expect(switchedHost.autoDispatch.lastError).toBeUndefined();
    expect(scheduleAutoDispatch).toHaveBeenCalledWith(1_000, switchedHost);
    expect(registerProjectWorkspacePath).toHaveBeenCalledWith("/workspace/project");
    expect(initialActiveThreadId).not.toHaveBeenCalled();
    expect(setActiveThreadId).toHaveBeenCalledWith("thread-2");
    expect(readState).toHaveBeenCalledWith("thread-2");
  });

  it("falls back to the store initial thread when the requested thread is absent", () => {
    const { initialActiveThreadId, readState, service, setActiveThreadId } = createHarness(
      createHost({ threadIds: ["thread-1"] }),
    );

    const state = service.switchWorkspace("/workspace/project", "missing-thread");

    expect(initialActiveThreadId).toHaveBeenCalledTimes(1);
    expect(setActiveThreadId).toHaveBeenCalledWith("fallback-thread");
    expect(readState).toHaveBeenCalledWith("fallback-thread");
    expect(state.activeThreadId).toBe("fallback-thread");
  });

  it("does not schedule auto-dispatch when the destination workspace disables it", () => {
    const { host, scheduleAutoDispatch, service } = createHarness(
      createHost({ autoDispatchEnabled: false }),
    );

    service.switchWorkspace("/workspace/project");

    expect(host.autoDispatch.enabled).toBe(false);
    expect(host.autoDispatch.lastError).toBeUndefined();
    expect(scheduleAutoDispatch).not.toHaveBeenCalled();
  });
});
