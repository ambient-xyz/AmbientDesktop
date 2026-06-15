import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  CancelOrchestrationRunInput,
  CreateOrchestrationTaskInput,
  OrchestrationAutoDispatchStatus,
  OrchestrationBoard,
  OrchestrationPrepareResult,
  OrchestrationWorkflowReadiness,
  PermissionMode,
  RepairOrchestrationWorkflowInput,
  RevealOrchestrationWorkspaceInput,
  ResolveOrchestrationWorkflowImpactInput,
  SetOrchestrationAutoDispatchInput,
  StartOrchestrationRunInput,
  UpdateOrchestrationTaskInput,
  UpdateOrchestrationWorkflowRawInput,
  UpdateOrchestrationWorkflowSettingsInput,
} from "../../shared/types";
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
  registerOrchestrationAutoDispatchIpc,
  registerOrchestrationBoardIpc,
  registerOrchestrationCancelRunIpc,
  registerOrchestrationPrepareIpc,
  registerOrchestrationRevealWorkspaceIpc,
  registerOrchestrationStartRunIpc,
  registerOrchestrationTaskIpc,
  registerOrchestrationWorkflowImpactIpc,
  registerOrchestrationWorkflowRawIpc,
  registerOrchestrationWorkflowRepairIpc,
  registerOrchestrationWorkflowSettingsIpc,
  type RegisterOrchestrationAutoDispatchIpcDependencies,
  type RegisterOrchestrationBoardIpcDependencies,
  type RegisterOrchestrationCancelRunIpcDependencies,
  type RegisterOrchestrationPrepareIpcDependencies,
  type RegisterOrchestrationRevealWorkspaceIpcDependencies,
  type RegisterOrchestrationStartRunIpcDependencies,
  type RegisterOrchestrationTaskIpcDependencies,
  type RegisterOrchestrationWorkflowImpactIpcDependencies,
  type RegisterOrchestrationWorkflowRawIpcDependencies,
  type RegisterOrchestrationWorkflowRepairIpcDependencies,
  type RegisterOrchestrationWorkflowSettingsIpcDependencies,
} from "./registerOrchestrationIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];
type FakeStore = {
  getWorkspace(): { path: string };
  createOrchestrationTask(input: CreateOrchestrationTaskInput): unknown;
  updateOrchestrationTask(input: UpdateOrchestrationTaskInput): unknown;
  getActiveProjectBoard(): { id: string } | undefined;
  resolveProjectBoardWorkflowImpact(input: {
    boardId: string;
    action: ResolveOrchestrationWorkflowImpactInput["action"];
    runIds: string[];
    workflowPath?: string;
    workflowHash?: string;
  }): { clearedRunIds: string[]; skippedRuns: { runId: string; reason: string }[] };
  recordProjectBoardWorkflowRepair(input: {
    boardId: string;
    action: RepairOrchestrationWorkflowInput["action"];
    workflowPath: string;
    workflowHash?: string;
    previousWorkflowHash?: string;
    backupPath?: string;
    status: "ready" | "missing" | "invalid";
    message?: string;
  }): unknown;
  recordProjectBoardWorkflowSettingsUpdated(input: {
    boardId: string;
    workflowPath: string;
    workflowHash?: string;
    previousWorkflowHash?: string;
    backupPath?: string;
    changedFields: string[];
    diff: string;
    status: "ready" | "missing" | "invalid";
    message?: string;
  }): unknown;
  recordProjectBoardWorkflowRawUpdated(input: {
    boardId: string;
    workflowPath: string;
    workflowHash?: string;
    previousWorkflowHash?: string;
    backupPath?: string;
    changed: boolean;
    diff: string;
    status: "ready" | "missing" | "invalid";
    message?: string;
  }): unknown;
};
type FakeHost = {
  store: FakeStore;
  workspacePath: string;
};
type FakeStartRunStore = {
  getWorkspace(): { path: string };
  getThread(threadId: string): { permissionMode: PermissionMode };
};
type FakeStartRunRuntime = {
  runtimeId: string;
};
type FakeStartRunHost = {
  store: FakeStartRunStore;
  workspacePath: string;
  runtime: FakeStartRunRuntime;
};
type FakeCancelRunStore = {
  getWorkspace(): { path: string };
  getOrchestrationRun(runId: string): { id: string; threadId?: string };
  updateOrchestrationRun(input: {
    id: string;
    status: "canceled";
    threadId: string;
    error: string;
    finish: true;
  }): unknown;
};
type FakeCancelRunHost = {
  store: FakeCancelRunStore;
  workspacePath: string;
};
type FakeAbortRuntimeHost = {
  runtime: {
    abort(threadId: string): Promise<void>;
  };
};

const orchestrationBoard = {
  tasks: [],
  runs: [],
} satisfies OrchestrationBoard;
const prepareResult = {
  warnings: [],
  prepared: [],
  skipped: [],
} satisfies OrchestrationPrepareResult;
const workflowReadiness = {
  status: "ready",
  path: "/workspace/project/WORKFLOW.md",
  checkedAt: "2026-06-04T00:00:00.000Z",
  workflowHash: "workflow-hash",
  warnings: [],
} satisfies OrchestrationWorkflowReadiness;
const autoDispatchStatus = {
  enabled: false,
  workflowAllows: true,
  inFlight: false,
  lastStartedRunIds: [],
  lastStartedRuns: [],
} satisfies OrchestrationAutoDispatchStatus;
const enabledAutoDispatchStatus = {
  enabled: true,
  workflowAllows: true,
  pollIntervalMs: 5_000,
  inFlight: false,
  lastStartedRunIds: ["run-1"],
  lastStartedRuns: [],
} satisfies OrchestrationAutoDispatchStatus;

describe("registerOrchestrationBoardIpc", () => {
  it("registers the orchestration board channels", () => {
    const { handlers } = registerBoardWithFakes();

    expect([...handlers.keys()]).toEqual([...orchestrationBoardIpcChannels]);
  });

  it("reads the current orchestration board", async () => {
    const { deps, invoke } = registerBoardWithFakes();

    await expect(invoke("orchestration:list-board")).resolves.toBe(orchestrationBoard);
    expect(deps.readCurrentOrchestrationBoard).toHaveBeenCalledOnce();
  });
});

describe("registerOrchestrationTaskIpc", () => {
  it("registers the orchestration task channels", () => {
    const { handlers } = registerTaskWithFakes();

    expect([...handlers.keys()]).toEqual([...orchestrationTaskIpcChannels]);
  });

  it("creates a task in the target project and returns the refreshed board", async () => {
    const { deps, host, invoke } = registerTaskWithFakes();

    await expect(
      invoke("orchestration:create-task", {
        title: "Draft task",
        projectPath: "/requested/project",
      }),
    ).resolves.toBe(orchestrationBoard);

    expect(deps.ensureProjectRuntimeHostForWorkspacePath).toHaveBeenCalledWith("/requested/project");
    expect(deps.requireActiveProjectRuntimeHost).not.toHaveBeenCalled();
    expect(host.store.createOrchestrationTask).toHaveBeenCalledWith({
      title: "Draft task",
      projectPath: "/workspace/project",
    });
    expect(deps.emitOrchestrationUpdated).toHaveBeenCalledWith("/workspace/project");
    expect(deps.readCurrentOrchestrationBoard).toHaveBeenCalledWith(host.store);
  });

  it("creates a task in the active project when no project path is provided", async () => {
    const { deps, host, invoke } = registerTaskWithFakes();

    await expect(invoke("orchestration:create-task", { title: "Active task" })).resolves.toBe(orchestrationBoard);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.ensureProjectRuntimeHostForWorkspacePath).not.toHaveBeenCalled();
    expect(host.store.createOrchestrationTask).toHaveBeenCalledWith({ title: "Active task" });
  });

  it("updates a task in its owning project and returns the refreshed board", async () => {
    const { deps, host, invoke } = registerTaskWithFakes();

    await expect(
      invoke("orchestration:update-task", {
        id: "task-1",
        state: "done",
        priority: null,
      }),
    ).resolves.toBe(orchestrationBoard);

    expect(deps.requireProjectRuntimeHostForOrchestrationTask).toHaveBeenCalledWith("task-1");
    expect(host.store.updateOrchestrationTask).toHaveBeenCalledWith({
      id: "task-1",
      state: "done",
      priority: null,
    });
    expect(deps.emitOrchestrationUpdated).toHaveBeenCalledWith("/workspace/project");
    expect(deps.readCurrentOrchestrationBoard).toHaveBeenCalledWith(host.store);
  });
});

describe("registerOrchestrationPrepareIpc", () => {
  it("registers the orchestration prepare channels", () => {
    const { handlers } = registerPrepareWithFakes();

    expect([...handlers.keys()]).toEqual([...orchestrationPrepareIpcChannels]);
  });

  it("prepares the next orchestration runs and returns the result", async () => {
    const { deps, host, invoke } = registerPrepareWithFakes();

    await expect(invoke("orchestration:prepare-next")).resolves.toBe(prepareResult);

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.prepareAndRecordNextOrchestrationRuns).toHaveBeenCalledWith(
      "/workspace/project",
      host.store,
      "manual_prepare",
    );
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
    expect(deps.recordActiveProjectBoardExecutionReadinessBlocker).not.toHaveBeenCalled();
  });

  it("records a readiness blocker and rethrows when preparation fails", async () => {
    const error = new Error("workflow missing");
    const { deps, host, invoke } = registerPrepareWithFakes({ prepareError: error });

    await expect(invoke("orchestration:prepare-next")).rejects.toBe(error);

    expect(deps.emitProjectStateIfActive).not.toHaveBeenCalled();
    expect(deps.recordActiveProjectBoardExecutionReadinessBlocker).toHaveBeenCalledWith({
      source: "manual_prepare",
      error,
    }, host.store);
  });
});

describe("registerOrchestrationWorkflowImpactIpc", () => {
  it("registers the orchestration workflow impact channels", () => {
    const { handlers } = registerImpactWithFakes();

    expect([...handlers.keys()]).toEqual([...orchestrationWorkflowImpactIpcChannels]);
  });

  it("resolves workflow impact without preparing again", async () => {
    const { deps, host, invoke } = registerImpactWithFakes();

    await expect(
      invoke("orchestration:resolve-workflow-impact", {
        action: "continue_old_prep",
        runIds: ["run-1"],
      }),
    ).resolves.toEqual({
      action: "continue_old_prep",
      clearedRunIds: ["run-1"],
      skippedRuns: [],
      prepared: {
        workflowPath: "/workspace/project/WORKFLOW.md",
        warnings: [],
        prepared: [],
        skipped: [],
      },
      board: orchestrationBoard,
    });

    expect(deps.readOrchestrationWorkflowReadiness).toHaveBeenCalledWith("/workspace/project");
    expect(host.store.resolveProjectBoardWorkflowImpact).toHaveBeenCalledWith({
      boardId: "board-1",
      action: "continue_old_prep",
      runIds: ["run-1"],
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflowHash: "workflow-hash",
    });
    expect(deps.prepareAndRecordNextOrchestrationRuns).not.toHaveBeenCalled();
    expect(deps.readCurrentOrchestrationBoard).toHaveBeenCalledWith(host.store);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
    expect(deps.emitOrchestrationUpdated).toHaveBeenCalledWith("/workspace/project");
  });

  it("prepares again when workflow impact resolution asks for it", async () => {
    const { deps, invoke } = registerImpactWithFakes();

    await expect(
      invoke("orchestration:resolve-workflow-impact", {
        action: "prepare_again",
        runIds: ["run-1"],
      }),
    ).resolves.toMatchObject({
      action: "prepare_again",
      prepared: prepareResult,
      board: orchestrationBoard,
    });

    expect(deps.prepareAndRecordNextOrchestrationRuns).toHaveBeenCalledWith(
      "/workspace/project",
      expect.any(Object),
      "manual_prepare",
    );
    expect(deps.recordActiveProjectBoardExecutionReadinessBlocker).not.toHaveBeenCalled();
  });

  it("records a readiness blocker and rethrows when prepare-again fails", async () => {
    const error = new Error("prepare failed");
    const { deps, host, invoke } = registerImpactWithFakes({ prepareError: error });

    await expect(
      invoke("orchestration:resolve-workflow-impact", {
        action: "prepare_again",
        runIds: ["run-1"],
      }),
    ).rejects.toBe(error);

    expect(deps.recordActiveProjectBoardExecutionReadinessBlocker).toHaveBeenCalledWith({
      source: "manual_prepare",
      error,
    }, host.store);
    expect(deps.readCurrentOrchestrationBoard).not.toHaveBeenCalled();
    expect(deps.emitProjectStateIfActive).not.toHaveBeenCalled();
    expect(deps.emitOrchestrationUpdated).not.toHaveBeenCalled();
  });
});

describe("registerOrchestrationWorkflowRepairIpc", () => {
  it("registers the orchestration workflow repair channels", () => {
    const { handlers } = registerRepairWithFakes();

    expect([...handlers.keys()]).toEqual([...orchestrationWorkflowRepairIpcChannels]);
  });

  it("repairs the workflow and returns the refreshed board", async () => {
    const { deps, host, invoke } = registerRepairWithFakes();

    await expect(
      invoke("orchestration:repair-workflow", {
        action: "restore_generated_default",
      }),
    ).resolves.toEqual({
      action: "restore_generated_default",
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflowHash: "new-workflow-hash",
      previousWorkflowHash: "old-workflow-hash",
      backupPath: "/workspace/project/WORKFLOW.md.bak",
      status: "ready",
      message: undefined,
      board: orchestrationBoard,
    });

    expect(deps.repairProjectBoardWorkflow).toHaveBeenCalledWith("/workspace/project", "restore_generated_default");
    expect(host.store.recordProjectBoardWorkflowRepair).toHaveBeenCalledWith({
      boardId: "board-1",
      action: "restore_generated_default",
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflowHash: "new-workflow-hash",
      previousWorkflowHash: "old-workflow-hash",
      backupPath: "/workspace/project/WORKFLOW.md.bak",
      status: "ready",
      message: undefined,
    });
    expect(deps.readCurrentOrchestrationBoard).toHaveBeenCalledWith(host.store);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
    expect(deps.emitOrchestrationUpdated).toHaveBeenCalledWith("/workspace/project");
  });

  it("records missing workflow repair status when repair reports a missing workflow file", async () => {
    const { deps, host, invoke } = registerRepairWithFakes({
      repairResult: {
        workflowPath: "/workspace/project/WORKFLOW.md",
        error: {
          code: "missing_workflow_file",
          message: "WORKFLOW.md is missing.",
        },
      },
    });

    await expect(
      invoke("orchestration:repair-workflow", {
        action: "use_existing_anyway",
      }),
    ).resolves.toMatchObject({
      action: "use_existing_anyway",
      workflowPath: "/workspace/project/WORKFLOW.md",
      status: "missing",
      message: "WORKFLOW.md is missing.",
      board: orchestrationBoard,
    });

    expect(host.store.recordProjectBoardWorkflowRepair).toHaveBeenCalledWith({
      boardId: "board-1",
      action: "use_existing_anyway",
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflowHash: undefined,
      previousWorkflowHash: undefined,
      backupPath: undefined,
      status: "missing",
      message: "WORKFLOW.md is missing.",
    });
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
    expect(deps.emitOrchestrationUpdated).toHaveBeenCalledWith("/workspace/project");
  });
});

describe("registerOrchestrationWorkflowSettingsIpc", () => {
  it("registers the orchestration workflow settings channels", () => {
    const { handlers } = registerWorkflowSettingsWithFakes();

    expect([...handlers.keys()]).toEqual([...orchestrationWorkflowSettingsIpcChannels]);
  });

  it("updates workflow settings and returns the refreshed board", async () => {
    const { deps, host, invoke } = registerWorkflowSettingsWithFakes();

    await expect(
      invoke("orchestration:update-workflow-settings", {
        autoDispatch: true,
        maxConcurrentAgents: 4,
        workspaceStrategy: "git-worktree",
      }),
    ).resolves.toEqual({
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflowHash: "settings-workflow-hash",
      previousWorkflowHash: "old-workflow-hash",
      backupPath: "/workspace/project/WORKFLOW.settings.bak",
      changedFields: ["autoDispatch", "maxConcurrentAgents", "workspaceStrategy"],
      diff: "--- a/WORKFLOW.md\n+++ b/WORKFLOW.md\n",
      status: "ready",
      message: undefined,
      board: orchestrationBoard,
    });

    expect(deps.updateProjectBoardWorkflowSettings).toHaveBeenCalledWith("/workspace/project", {
      autoDispatch: true,
      maxConcurrentAgents: 4,
      workspaceStrategy: "git-worktree",
    });
    expect(host.store.recordProjectBoardWorkflowSettingsUpdated).toHaveBeenCalledWith({
      boardId: "board-1",
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflowHash: "settings-workflow-hash",
      previousWorkflowHash: "old-workflow-hash",
      backupPath: "/workspace/project/WORKFLOW.settings.bak",
      changedFields: ["autoDispatch", "maxConcurrentAgents", "workspaceStrategy"],
      diff: "--- a/WORKFLOW.md\n+++ b/WORKFLOW.md\n",
      status: "ready",
      message: undefined,
    });
    expect(deps.readCurrentOrchestrationBoard).toHaveBeenCalledWith(host.store);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
    expect(deps.emitOrchestrationUpdated).toHaveBeenCalledWith("/workspace/project");
  });

  it("records missing workflow status when settings update reports a missing workflow file", async () => {
    const { deps, host, invoke } = registerWorkflowSettingsWithFakes({
      updateResult: {
        workflowPath: "/workspace/project/WORKFLOW.md",
        changedFields: [],
        diff: "",
        error: {
          code: "missing_workflow_file",
          message: "WORKFLOW.md is missing.",
        },
      },
    });

    await expect(
      invoke("orchestration:update-workflow-settings", {
        requireTests: true,
      }),
    ).resolves.toMatchObject({
      workflowPath: "/workspace/project/WORKFLOW.md",
      changedFields: [],
      diff: "",
      status: "missing",
      message: "WORKFLOW.md is missing.",
      board: orchestrationBoard,
    });

    expect(host.store.recordProjectBoardWorkflowSettingsUpdated).toHaveBeenCalledWith({
      boardId: "board-1",
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflowHash: undefined,
      previousWorkflowHash: undefined,
      backupPath: undefined,
      changedFields: [],
      diff: "",
      status: "missing",
      message: "WORKFLOW.md is missing.",
    });
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
    expect(deps.emitOrchestrationUpdated).toHaveBeenCalledWith("/workspace/project");
  });
});

describe("registerOrchestrationWorkflowRawIpc", () => {
  it("registers the orchestration workflow raw channels", () => {
    const { handlers } = registerWorkflowRawWithFakes();

    expect([...handlers.keys()]).toEqual([...orchestrationWorkflowRawIpcChannels]);
  });

  it("updates raw workflow text and returns the refreshed board", async () => {
    const { deps, host, invoke } = registerWorkflowRawWithFakes();

    await expect(
      invoke("orchestration:update-workflow-raw", { markdown: "# Workflow\n" }),
    ).resolves.toEqual({
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflowHash: "raw-workflow-hash",
      previousWorkflowHash: "old-workflow-hash",
      backupPath: "/workspace/project/WORKFLOW.raw.bak",
      changed: true,
      diff: "--- a/WORKFLOW.md\n+++ b/WORKFLOW.md\n",
      status: "ready",
      message: undefined,
      board: orchestrationBoard,
    });

    expect(deps.updateProjectBoardWorkflowRaw).toHaveBeenCalledWith("/workspace/project", { markdown: "# Workflow\n" });
    expect(host.store.recordProjectBoardWorkflowRawUpdated).toHaveBeenCalledWith({
      boardId: "board-1",
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflowHash: "raw-workflow-hash",
      previousWorkflowHash: "old-workflow-hash",
      backupPath: "/workspace/project/WORKFLOW.raw.bak",
      changed: true,
      diff: "--- a/WORKFLOW.md\n+++ b/WORKFLOW.md\n",
      status: "ready",
      message: undefined,
    });
    expect(deps.readCurrentOrchestrationBoard).toHaveBeenCalledWith(host.store);
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
    expect(deps.emitOrchestrationUpdated).toHaveBeenCalledWith("/workspace/project");
  });

  it("records invalid workflow status when raw update reports validation failure", async () => {
    const { deps, host, invoke } = registerWorkflowRawWithFakes({
      updateResult: {
        workflowPath: "/workspace/project/WORKFLOW.md",
        markdown: "# Broken\n",
        changed: false,
        diff: "",
        error: {
          code: "workflow_validation_error",
          message: "Invalid workflow.",
        },
      },
    });

    await expect(
      invoke("orchestration:update-workflow-raw", { markdown: "# Broken\n" }),
    ).resolves.toMatchObject({
      workflowPath: "/workspace/project/WORKFLOW.md",
      changed: false,
      diff: "",
      status: "invalid",
      message: "Invalid workflow.",
      board: orchestrationBoard,
    });

    expect(host.store.recordProjectBoardWorkflowRawUpdated).toHaveBeenCalledWith({
      boardId: "board-1",
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflowHash: undefined,
      previousWorkflowHash: undefined,
      backupPath: undefined,
      changed: false,
      diff: "",
      status: "invalid",
      message: "Invalid workflow.",
    });
    expect(deps.emitProjectStateIfActive).toHaveBeenCalledWith(host);
    expect(deps.emitOrchestrationUpdated).toHaveBeenCalledWith("/workspace/project");
  });
});

describe("registerOrchestrationStartRunIpc", () => {
  it("registers the orchestration start-run channels", () => {
    const { handlers } = registerStartRunWithFakes();

    expect([...handlers.keys()]).toEqual([...orchestrationStartRunIpcChannels]);
  });

  it("starts a prepared orchestration run and returns the refreshed board", async () => {
    const { deps, host, invoke } = registerStartRunWithFakes();

    await expect(invoke("orchestration:start-run", { runId: "run-1" })).resolves.toBe(orchestrationBoard);

    expect(deps.requireProjectRuntimeHostForOrchestrationRun).toHaveBeenCalledWith("run-1");
    expect(deps.activeThreadIdForHost).toHaveBeenCalledWith(host);
    expect(host.store.getThread).toHaveBeenCalledWith("active-thread");
    expect(deps.startPreparedOrchestrationRun).toHaveBeenCalledWith(
      "/workspace/project",
      host.store,
      host.runtime,
      "run-1",
      expect.any(Function),
      expect.any(Function),
      { permissionMode: "workspace" },
    );
    expect(deps.emitOrchestrationUpdated).toHaveBeenCalledWith("/workspace/project");
    expect(deps.reviewFinishedProjectBoardRun).toHaveBeenCalledWith("run-1", host.store, expect.any(Function));
    expect(deps.setProjectHostActiveThreadId).toHaveBeenCalledWith(host, "run-thread");
    expect(deps.emitProjectStateIfActive).toHaveBeenNthCalledWith(1, host);
    expect(deps.emitProjectStateIfActive).toHaveBeenNthCalledWith(2, host, "run-thread");
    expect(deps.readCurrentOrchestrationBoard).toHaveBeenCalledWith(host.store);
  });
});

describe("registerOrchestrationCancelRunIpc", () => {
  it("registers the orchestration cancel-run channels", () => {
    const { handlers } = registerCancelRunWithFakes();

    expect([...handlers.keys()]).toEqual([...orchestrationCancelRunIpcChannels]);
  });

  it("aborts the run thread, marks the run canceled, and returns the refreshed board", async () => {
    const { deps, host, threadHost, invoke } = registerCancelRunWithFakes();

    await expect(invoke("orchestration:cancel-run", { runId: "run-1" })).resolves.toBe(orchestrationBoard);

    expect(deps.requireProjectRuntimeHostForOrchestrationRun).toHaveBeenCalledWith("run-1");
    expect(host.store.getOrchestrationRun).toHaveBeenCalledWith("run-1");
    expect(deps.requireProjectRuntimeHostForThread).toHaveBeenCalledWith("thread-1");
    expect(threadHost.runtime.abort).toHaveBeenCalledWith("thread-1");
    expect(host.store.updateOrchestrationRun).toHaveBeenCalledWith({
      id: "run-1",
      status: "canceled",
      threadId: "thread-1",
      error: "Canceled by user.",
      finish: true,
    });
    expect(deps.emitOrchestrationUpdated).toHaveBeenCalledWith("/workspace/project");
    expect(deps.readCurrentOrchestrationBoard).toHaveBeenCalledWith(host.store);
  });

  it("rejects when the run has no active thread to cancel", async () => {
    const { deps, host, threadHost, invoke } = registerCancelRunWithFakes({
      run: { id: "run-1" },
    });

    await expect(invoke("orchestration:cancel-run", { runId: "run-1" })).rejects.toThrow(
      "This orchestration run has no active thread to cancel.",
    );

    expect(host.store.getOrchestrationRun).toHaveBeenCalledWith("run-1");
    expect(deps.requireProjectRuntimeHostForThread).not.toHaveBeenCalled();
    expect(threadHost.runtime.abort).not.toHaveBeenCalled();
    expect(host.store.updateOrchestrationRun).not.toHaveBeenCalled();
    expect(deps.emitOrchestrationUpdated).not.toHaveBeenCalled();
    expect(deps.readCurrentOrchestrationBoard).not.toHaveBeenCalled();
  });
});

describe("registerOrchestrationRevealWorkspaceIpc", () => {
  it("registers the orchestration reveal-workspace channels", () => {
    const { handlers } = registerRevealWorkspaceWithFakes();

    expect([...handlers.keys()]).toEqual([...orchestrationRevealWorkspaceIpcChannels]);
  });

  it("verifies the orchestration workspace before opening it", async () => {
    const { deps, invoke } = registerRevealWorkspaceWithFakes();

    await expect(
      invoke("orchestration:reveal-workspace", { workspacePath: "/workspace/project/.ambient/runs/run-1" }),
    ).resolves.toBeUndefined();

    expect(deps.requireProjectRuntimeHostForOrchestrationWorkspace).toHaveBeenCalledWith(
      "/workspace/project/.ambient/runs/run-1",
    );
    expect(deps.openPath).toHaveBeenCalledWith("/workspace/project/.ambient/runs/run-1");
  });

  it("rejects when opening the workspace path fails", async () => {
    const { deps, invoke } = registerRevealWorkspaceWithFakes({ openError: "Path does not exist." });

    await expect(
      invoke("orchestration:reveal-workspace", { workspacePath: "/workspace/project/.ambient/runs/missing" }),
    ).rejects.toThrow("Path does not exist.");

    expect(deps.requireProjectRuntimeHostForOrchestrationWorkspace).toHaveBeenCalledWith(
      "/workspace/project/.ambient/runs/missing",
    );
    expect(deps.openPath).toHaveBeenCalledWith("/workspace/project/.ambient/runs/missing");
  });
});

describe("registerOrchestrationAutoDispatchIpc", () => {
  it("registers the orchestration auto-dispatch channels", () => {
    const { handlers } = registerAutoDispatchWithFakes();

    expect([...handlers.keys()]).toEqual([...orchestrationAutoDispatchIpcChannels]);
  });

  it("reads the current auto-dispatch status", async () => {
    const { deps, invoke } = registerAutoDispatchWithFakes();

    await expect(invoke("orchestration:auto-status")).resolves.toBe(autoDispatchStatus);

    expect(deps.readAutoDispatchStatus).toHaveBeenCalledOnce();
    expect(deps.setAutoDispatchEnabled).not.toHaveBeenCalled();
  });

  it("updates auto-dispatch enabled state", async () => {
    const { deps, invoke } = registerAutoDispatchWithFakes();

    await expect(invoke("orchestration:set-auto-dispatch", { enabled: true })).resolves.toBe(enabledAutoDispatchStatus);

    expect(deps.setAutoDispatchEnabled).toHaveBeenCalledWith({ enabled: true });
    expect(deps.readAutoDispatchStatus).not.toHaveBeenCalled();
  });
});

function registerBoardWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterOrchestrationBoardIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    readCurrentOrchestrationBoard: vi.fn(() => Promise.resolve(orchestrationBoard)),
  };

  registerOrchestrationBoardIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) {
        throw new Error(`Missing handler for ${channel}`);
      }
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerTaskWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host: FakeHost = {
    store: {
      getWorkspace: vi.fn(() => ({ path: "/workspace/project" })),
      createOrchestrationTask: vi.fn(),
      updateOrchestrationTask: vi.fn(),
      getActiveProjectBoard: vi.fn(() => ({ id: "board-1" })),
      resolveProjectBoardWorkflowImpact: vi.fn(() => ({ clearedRunIds: ["run-1"], skippedRuns: [] })),
      recordProjectBoardWorkflowRepair: vi.fn(),
      recordProjectBoardWorkflowSettingsUpdated: vi.fn(),
      recordProjectBoardWorkflowRawUpdated: vi.fn(),
    },
    workspacePath: "/workspace/project",
  };
  const deps: RegisterOrchestrationTaskIpcDependencies<FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    ensureProjectRuntimeHostForWorkspacePath: vi.fn(() => host),
    requireProjectRuntimeHostForOrchestrationTask: vi.fn(() => host),
    emitOrchestrationUpdated: vi.fn(),
    readCurrentOrchestrationBoard: vi.fn(() => Promise.resolve(orchestrationBoard)),
  };

  registerOrchestrationTaskIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) {
        throw new Error(`Missing handler for ${channel}`);
      }
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerPrepareWithFakes(options: { prepareError?: Error } = {}) {
  const handlers = new Map<string, IpcListener>();
  const host: FakeHost = {
    store: {
      getWorkspace: vi.fn(() => ({ path: "/workspace/project" })),
      createOrchestrationTask: vi.fn(),
      updateOrchestrationTask: vi.fn(),
      getActiveProjectBoard: vi.fn(() => ({ id: "board-1" })),
      resolveProjectBoardWorkflowImpact: vi.fn(() => ({ clearedRunIds: ["run-1"], skippedRuns: [] })),
      recordProjectBoardWorkflowRepair: vi.fn(),
      recordProjectBoardWorkflowSettingsUpdated: vi.fn(),
      recordProjectBoardWorkflowRawUpdated: vi.fn(),
    },
    workspacePath: "/workspace/project",
  };
  const deps: RegisterOrchestrationPrepareIpcDependencies<FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    prepareAndRecordNextOrchestrationRuns: vi.fn(async () => {
      if (options.prepareError) {
        throw options.prepareError;
      }
      return { result: prepareResult };
    }),
    emitProjectStateIfActive: vi.fn(),
    recordActiveProjectBoardExecutionReadinessBlocker: vi.fn(),
  };

  registerOrchestrationPrepareIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) {
        throw new Error(`Missing handler for ${channel}`);
      }
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerImpactWithFakes(options: { prepareError?: Error } = {}) {
  const handlers = new Map<string, IpcListener>();
  const host: FakeHost = {
    store: {
      getWorkspace: vi.fn(() => ({ path: "/workspace/project" })),
      createOrchestrationTask: vi.fn(),
      updateOrchestrationTask: vi.fn(),
      getActiveProjectBoard: vi.fn(() => ({ id: "board-1" })),
      resolveProjectBoardWorkflowImpact: vi.fn(() => ({ clearedRunIds: ["run-1"], skippedRuns: [] })),
      recordProjectBoardWorkflowRepair: vi.fn(),
      recordProjectBoardWorkflowSettingsUpdated: vi.fn(),
      recordProjectBoardWorkflowRawUpdated: vi.fn(),
    },
    workspacePath: "/workspace/project",
  };
  const deps: RegisterOrchestrationWorkflowImpactIpcDependencies<FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    readOrchestrationWorkflowReadiness: vi.fn(() => Promise.resolve(workflowReadiness)),
    prepareAndRecordNextOrchestrationRuns: vi.fn(async () => {
      if (options.prepareError) {
        throw options.prepareError;
      }
      return { result: prepareResult };
    }),
    recordActiveProjectBoardExecutionReadinessBlocker: vi.fn(),
    readCurrentOrchestrationBoard: vi.fn(() => Promise.resolve(orchestrationBoard)),
    emitProjectStateIfActive: vi.fn(),
    emitOrchestrationUpdated: vi.fn(),
  };

  registerOrchestrationWorkflowImpactIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) {
        throw new Error(`Missing handler for ${channel}`);
      }
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerRepairWithFakes(options: {
  repairResult?: {
    workflowPath: string;
    workflow?: { contentHash?: string };
    previousWorkflowHash?: string;
    backupPath?: string;
    error?: { code?: string; message?: string };
  };
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host: FakeHost = {
    store: {
      getWorkspace: vi.fn(() => ({ path: "/workspace/project" })),
      createOrchestrationTask: vi.fn(),
      updateOrchestrationTask: vi.fn(),
      getActiveProjectBoard: vi.fn(() => ({ id: "board-1" })),
      resolveProjectBoardWorkflowImpact: vi.fn(() => ({ clearedRunIds: ["run-1"], skippedRuns: [] })),
      recordProjectBoardWorkflowRepair: vi.fn(),
      recordProjectBoardWorkflowSettingsUpdated: vi.fn(),
      recordProjectBoardWorkflowRawUpdated: vi.fn(),
    },
    workspacePath: "/workspace/project",
  };
  const deps: RegisterOrchestrationWorkflowRepairIpcDependencies<FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    repairProjectBoardWorkflow: vi.fn(() => Promise.resolve(options.repairResult ?? {
      workflowPath: "/workspace/project/WORKFLOW.md",
      workflow: { contentHash: "new-workflow-hash" },
      previousWorkflowHash: "old-workflow-hash",
      backupPath: "/workspace/project/WORKFLOW.md.bak",
    })),
    readCurrentOrchestrationBoard: vi.fn(() => Promise.resolve(orchestrationBoard)),
    emitProjectStateIfActive: vi.fn(),
    emitOrchestrationUpdated: vi.fn(),
  };

  registerOrchestrationWorkflowRepairIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) {
        throw new Error(`Missing handler for ${channel}`);
      }
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerWorkflowSettingsWithFakes(options: {
  updateResult?: {
    workflowPath: string;
    workflow?: { contentHash?: string };
    backupPath?: string;
    previousWorkflowHash?: string;
    changedFields: string[];
    diff: string;
    error?: { code?: string; message?: string };
  };
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host: FakeHost = {
    store: {
      getWorkspace: vi.fn(() => ({ path: "/workspace/project" })),
      createOrchestrationTask: vi.fn(),
      updateOrchestrationTask: vi.fn(),
      getActiveProjectBoard: vi.fn(() => ({ id: "board-1" })),
      resolveProjectBoardWorkflowImpact: vi.fn(() => ({ clearedRunIds: ["run-1"], skippedRuns: [] })),
      recordProjectBoardWorkflowRepair: vi.fn(),
      recordProjectBoardWorkflowSettingsUpdated: vi.fn(),
      recordProjectBoardWorkflowRawUpdated: vi.fn(),
    },
    workspacePath: "/workspace/project",
  };
  const deps: RegisterOrchestrationWorkflowSettingsIpcDependencies<FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    updateProjectBoardWorkflowSettings: vi.fn((_workspacePath: string, _input: UpdateOrchestrationWorkflowSettingsInput) =>
      Promise.resolve(options.updateResult ?? {
        workflowPath: "/workspace/project/WORKFLOW.md",
        workflow: { contentHash: "settings-workflow-hash" },
        backupPath: "/workspace/project/WORKFLOW.settings.bak",
        previousWorkflowHash: "old-workflow-hash",
        changedFields: ["autoDispatch", "maxConcurrentAgents", "workspaceStrategy"],
        diff: "--- a/WORKFLOW.md\n+++ b/WORKFLOW.md\n",
      }),
    ),
    readCurrentOrchestrationBoard: vi.fn(() => Promise.resolve(orchestrationBoard)),
    emitProjectStateIfActive: vi.fn(),
    emitOrchestrationUpdated: vi.fn(),
  };

  registerOrchestrationWorkflowSettingsIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) {
        throw new Error(`Missing handler for ${channel}`);
      }
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerWorkflowRawWithFakes(options: {
  updateResult?: {
    workflowPath: string;
    workflow?: { contentHash?: string };
    markdown: string;
    backupPath?: string;
    previousWorkflowHash?: string;
    changed: boolean;
    diff: string;
    error?: { code?: string; message?: string };
  };
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host: FakeHost = {
    store: {
      getWorkspace: vi.fn(() => ({ path: "/workspace/project" })),
      createOrchestrationTask: vi.fn(),
      updateOrchestrationTask: vi.fn(),
      getActiveProjectBoard: vi.fn(() => ({ id: "board-1" })),
      resolveProjectBoardWorkflowImpact: vi.fn(() => ({ clearedRunIds: ["run-1"], skippedRuns: [] })),
      recordProjectBoardWorkflowRepair: vi.fn(),
      recordProjectBoardWorkflowSettingsUpdated: vi.fn(),
      recordProjectBoardWorkflowRawUpdated: vi.fn(),
    },
    workspacePath: "/workspace/project",
  };
  const deps: RegisterOrchestrationWorkflowRawIpcDependencies<FakeStore, FakeHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    updateProjectBoardWorkflowRaw: vi.fn((_workspacePath: string, _input: UpdateOrchestrationWorkflowRawInput) =>
      Promise.resolve(options.updateResult ?? {
        workflowPath: "/workspace/project/WORKFLOW.md",
        workflow: { contentHash: "raw-workflow-hash" },
        markdown: "# Workflow\n",
        backupPath: "/workspace/project/WORKFLOW.raw.bak",
        previousWorkflowHash: "old-workflow-hash",
        changed: true,
        diff: "--- a/WORKFLOW.md\n+++ b/WORKFLOW.md\n",
      }),
    ),
    readCurrentOrchestrationBoard: vi.fn(() => Promise.resolve(orchestrationBoard)),
    emitProjectStateIfActive: vi.fn(),
    emitOrchestrationUpdated: vi.fn(),
  };

  registerOrchestrationWorkflowRawIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) {
        throw new Error(`Missing handler for ${channel}`);
      }
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerStartRunWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const host: FakeStartRunHost = {
    store: {
      getWorkspace: vi.fn(() => ({ path: "/workspace/project" })),
      getThread: vi.fn((_threadId: string): { permissionMode: PermissionMode } => ({ permissionMode: "workspace" })),
    },
    workspacePath: "/workspace/project",
    runtime: { runtimeId: "runtime-1" },
  };
  const deps: RegisterOrchestrationStartRunIpcDependencies<FakeStartRunStore, FakeStartRunHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForOrchestrationRun: vi.fn((_runId: string) => host),
    activeThreadIdForHost: vi.fn(() => "active-thread"),
    startPreparedOrchestrationRun: vi.fn((
      _workspacePath: string,
      _targetStore: FakeStartRunStore,
      _runtime: FakeStartRunRuntime,
      _runId: string,
      onUpdate: () => void,
      onFinishedRun: (runId: string) => Promise<void>,
      _options: { permissionMode: PermissionMode },
    ) => {
      onUpdate();
      return onFinishedRun("run-1").then(() => ({ threadId: "run-thread" }));
    }),
    reviewFinishedProjectBoardRun: vi.fn((_runId: string, _targetStore: FakeStartRunStore, onUpdate: () => void) => {
      onUpdate();
      return Promise.resolve();
    }),
    setProjectHostActiveThreadId: vi.fn((_host: FakeStartRunHost, threadId: string) => threadId),
    emitProjectStateIfActive: vi.fn(),
    emitOrchestrationUpdated: vi.fn(),
    readCurrentOrchestrationBoard: vi.fn(() => Promise.resolve(orchestrationBoard)),
  };

  registerOrchestrationStartRunIpc(deps);

  return {
    deps,
    handlers,
    host,
    invoke: (channel: string, raw?: StartOrchestrationRunInput) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) {
        throw new Error(`Missing handler for ${channel}`);
      }
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerCancelRunWithFakes(options: {
  run?: { id: string; threadId?: string };
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const host: FakeCancelRunHost = {
    store: {
      getWorkspace: vi.fn(() => ({ path: "/workspace/project" })),
      getOrchestrationRun: vi.fn((_runId: string) => options.run ?? { id: "run-1", threadId: "thread-1" }),
      updateOrchestrationRun: vi.fn(),
    },
    workspacePath: "/workspace/project",
  };
  const threadHost: FakeAbortRuntimeHost = {
    runtime: {
      abort: vi.fn(() => Promise.resolve()),
    },
  };
  const deps: RegisterOrchestrationCancelRunIpcDependencies<FakeCancelRunStore, FakeCancelRunHost> = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForOrchestrationRun: vi.fn((_runId: string) => host),
    requireProjectRuntimeHostForThread: vi.fn((_threadId: string) => threadHost),
    emitOrchestrationUpdated: vi.fn(),
    readCurrentOrchestrationBoard: vi.fn(() => Promise.resolve(orchestrationBoard)),
  };

  registerOrchestrationCancelRunIpc(deps);

  return {
    deps,
    handlers,
    host,
    threadHost,
    invoke: (channel: string, raw?: CancelOrchestrationRunInput) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) {
        throw new Error(`Missing handler for ${channel}`);
      }
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerRevealWorkspaceWithFakes(options: { openError?: string } = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterOrchestrationRevealWorkspaceIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    requireProjectRuntimeHostForOrchestrationWorkspace: vi.fn(),
    openPath: vi.fn(() => Promise.resolve(options.openError ?? "")),
  };

  registerOrchestrationRevealWorkspaceIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: RevealOrchestrationWorkspaceInput) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) {
        throw new Error(`Missing handler for ${channel}`);
      }
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function registerAutoDispatchWithFakes() {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterOrchestrationAutoDispatchIpcDependencies = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    readAutoDispatchStatus: vi.fn(() => Promise.resolve(autoDispatchStatus)),
    setAutoDispatchEnabled: vi.fn((_input: SetOrchestrationAutoDispatchInput) =>
      Promise.resolve(enabledAutoDispatchStatus),
    ),
  };

  registerOrchestrationAutoDispatchIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: SetOrchestrationAutoDispatchInput) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) {
        throw new Error(`Missing handler for ${channel}`);
      }
      return Promise.resolve().then(() => handler({} as IpcMainInvokeEvent, raw));
    },
  };
}
