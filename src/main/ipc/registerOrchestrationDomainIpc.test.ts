import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import {
  orchestrationAutoDispatchIpcChannels,
  orchestrationBoardIpcChannels,
  orchestrationCancelRunIpcChannels,
  orchestrationPrepareIpcChannels,
  orchestrationRevealWorkspaceIpcChannels,
  orchestrationStartRunIpcChannels,
  orchestrationTaskIpcChannels,
  orchestrationWorkflowImpactIpcChannels,
  orchestrationWorkflowRawIpcChannels,
  orchestrationWorkflowRepairIpcChannels,
  orchestrationWorkflowSettingsIpcChannels,
} from "./registerOrchestrationIpc";
import {
  orchestrationDomainIpcChannels,
  registerOrchestrationDomainIpc,
} from "./registerOrchestrationDomainIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerOrchestrationDomainIpc", () => {
  it("registers orchestration channels in the previous main registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...orchestrationDomainIpcChannels]);
    expect([...orchestrationDomainIpcChannels]).toEqual([
      ...orchestrationBoardIpcChannels,
      ...orchestrationTaskIpcChannels,
      ...orchestrationPrepareIpcChannels,
      ...orchestrationWorkflowImpactIpcChannels,
      ...orchestrationWorkflowRepairIpcChannels,
      ...orchestrationWorkflowSettingsIpcChannels,
      ...orchestrationWorkflowRawIpcChannels,
      ...orchestrationStartRunIpcChannels,
      ...orchestrationCancelRunIpcChannels,
      ...orchestrationRevealWorkspaceIpcChannels,
      ...orchestrationAutoDispatchIpcChannels,
    ]);
  });

  it("routes task creation through the workspace host resolver and refreshes the board", async () => {
    const { deps, host, invoke, orchestrationBoard } = registerWithFakes();

    await expect(
      invoke("orchestration:create-task", {
        title: "Implement owner boundary",
        projectPath: "/requested/project",
      }),
    ).resolves.toBe(orchestrationBoard);

    expect(deps.ensureProjectRuntimeHostForWorkspacePath).toHaveBeenCalledWith("/requested/project");
    expect(host.store.createOrchestrationTask).toHaveBeenCalledWith({
      title: "Implement owner boundary",
      projectPath: "/workspace/project",
    });
    expect(deps.emitOrchestrationUpdated).toHaveBeenCalledWith("/workspace/project");
    expect(deps.readCurrentOrchestrationBoard).toHaveBeenCalledWith(host.store);
  });

  it("wires start-run through runtime launch, review, active-thread, and board refresh dependencies", async () => {
    const { deps, host, invoke, orchestrationBoard } = registerWithFakes();

    await expect(invoke("orchestration:start-run", { runId: "run-1" })).resolves.toBe(orchestrationBoard);

    expect(deps.requireProjectRuntimeHostForOrchestrationRun).toHaveBeenCalledWith("run-1");
    expect(deps.activeThreadIdForHost).toHaveBeenCalledWith(host);
    expect(deps.startPreparedOrchestrationRun).toHaveBeenCalledWith(
      "/workspace/project",
      host.store,
      host.runtime,
      "run-1",
      expect.any(Function),
      expect.any(Function),
      { permissionMode: "workspace" },
    );
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(host, "run-thread-1");
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host, "run-thread-1");
    expect(deps.readCurrentOrchestrationBoard).toHaveBeenCalledWith(host.store);
  });

  it("preserves reveal workspace ownership checks before opening the path", async () => {
    const { deps, invoke } = registerWithFakes();

    await expect(invoke("orchestration:reveal-workspace", { workspacePath: "/workspace/project" })).resolves.toBeUndefined();

    expect(deps.requireProjectRuntimeHostForOrchestrationWorkspace).toHaveBeenCalledWith("/workspace/project");
    expect(deps.openPath).toHaveBeenCalledWith("/workspace/project");
  });

  it("delegates auto-dispatch status and updates through the orchestration bundle", async () => {
    const { deps, invoke, autoDispatchStatus, enabledAutoDispatchStatus } = registerWithFakes();

    await expect(invoke("orchestration:auto-status")).resolves.toBe(autoDispatchStatus);
    await expect(invoke("orchestration:set-auto-dispatch", { enabled: true })).resolves.toBe(enabledAutoDispatchStatus);

    expect(deps.readAutoDispatchStatus).toHaveBeenCalledOnce();
    expect(deps.setAutoDispatchEnabled).toHaveBeenCalledWith({ enabled: true });
  });
});

function registerWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const orchestrationBoard = { tasks: [], runs: [] };
  const autoDispatchStatus = {
    enabled: false,
    workflowAllows: true,
    inFlight: false,
    lastStartedRunIds: [],
    lastStartedRuns: [],
  };
  const enabledAutoDispatchStatus = {
    enabled: true,
    workflowAllows: true,
    inFlight: false,
    lastStartedRunIds: ["run-1"],
    lastStartedRuns: [],
  };
  const host = {
    workspacePath: "/workspace/project",
    runtime: { runtimeId: "runtime-1" },
    store: {
      getWorkspace: vi.fn(() => ({ path: "/workspace/project" })),
      createOrchestrationTask: vi.fn(),
      updateOrchestrationTask: vi.fn(),
      getActiveProjectBoard: vi.fn(() => ({ id: "board-1" })),
      getThread: vi.fn(() => ({ permissionMode: "workspace" })),
      getOrchestrationRun: vi.fn(() => ({ id: "run-1", threadId: "run-thread-1" })),
      updateOrchestrationRun: vi.fn(),
      resolveProjectBoardWorkflowImpact: vi.fn(() => ({ clearedRunIds: ["run-1"], skippedRuns: [] })),
      recordProjectBoardWorkflowRepair: vi.fn(),
      recordProjectBoardWorkflowSettingsUpdated: vi.fn(),
      recordProjectBoardWorkflowRawUpdated: vi.fn(),
    },
  };
  const deps = {
    handleIpc: (channel: string, listener: IpcListener) => handlers.set(channel, listener),
    activeThreadIdForHost: vi.fn(() => "active-thread-1"),
    emitOrchestrationUpdated: vi.fn(),
    emitProjectStateIfActive: vi.fn(),
    ensureProjectRuntimeHostForWorkspacePath: vi.fn(() => host),
    openPath: vi.fn(async () => ""),
    prepareAndRecordNextOrchestrationRuns: vi.fn(async () => ({
      result: { warnings: [], prepared: [], skipped: [] },
    })),
    readAutoDispatchStatus: vi.fn(async () => autoDispatchStatus),
    readCurrentOrchestrationBoard: vi.fn(async () => orchestrationBoard),
    readOrchestrationWorkflowReadiness: vi.fn(async () => ({
      status: "ready",
      path: "/workspace/project/WORKFLOW.md",
      workflowHash: "workflow-hash",
      warnings: [],
    })),
    recordActiveProjectBoardExecutionReadinessBlocker: vi.fn(),
    repairProjectBoardWorkflow: vi.fn(async () => ({
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflow: { contentHash: "workflow-hash" },
    })),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    requireProjectRuntimeHostForOrchestrationRun: vi.fn(() => host),
    requireProjectRuntimeHostForOrchestrationTask: vi.fn(() => host),
    requireProjectRuntimeHostForOrchestrationWorkspace: vi.fn(() => host),
    requireProjectRuntimeHostForThread: vi.fn(() => ({
      runtime: {
        abort: vi.fn(async () => undefined),
      },
    })),
    reviewFinishedProjectBoardRun: vi.fn(async () => undefined),
    setAutoDispatchEnabled: vi.fn(async () => enabledAutoDispatchStatus),
    setProjectHostActiveThreadId: vi.fn(),
    startPreparedOrchestrationRun: vi.fn(async () => ({ threadId: "run-thread-1" })),
    updateProjectBoardWorkflowRaw: vi.fn(async () => ({
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflow: { contentHash: "workflow-hash" },
      markdown: "# Workflow",
      changed: true,
      diff: "diff",
    })),
    updateProjectBoardWorkflowSettings: vi.fn(async () => ({
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflow: { contentHash: "workflow-hash" },
      changedFields: ["autoDispatch"],
      diff: "diff",
    })),
  };

  registerOrchestrationDomainIpc(deps);

  return {
    autoDispatchStatus,
    deps,
    enabledAutoDispatchStatus,
    handlers,
    host,
    invoke: (channel: string, ...args: unknown[]) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return handler({} as IpcMainInvokeEvent, ...args);
    },
    orchestrationBoard,
  };
}
