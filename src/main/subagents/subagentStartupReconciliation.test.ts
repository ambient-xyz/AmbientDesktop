import { describe, expect, it, vi } from "vitest";
import type {
  AmbientFeatureFlagSnapshot,
  CallableWorkflowTaskRestartReconciliationSummary,
  SubagentParentMailboxEventSummary,
  SubagentRestartReconciliationSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
  ThreadSummary,
} from "../../shared/types";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { reconcileSubagentsOnRuntimeStartup, type SubagentStartupReconciliationStore } from "./subagentStartupReconciliation";

describe("sub-agent startup reconciliation bridge", () => {
  it("skips store reconciliation and mutation events when ambient.subagents is disabled", () => {
    const disabledFlags = resolveAmbientFeatureFlags({
      settings: { subagents: false },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });
    const store: SubagentStartupReconciliationStore = {
      reconcileSubagentRestartState: vi.fn(),
      getSubagentRun: vi.fn(),
      getThread: vi.fn(),
      listSubagentRunEvents: vi.fn(),
      getSubagentWaitBarrier: vi.fn(),
    };
    const emit = {
      onRunUpdated: vi.fn(),
      onThreadUpdated: vi.fn(),
      onRunEventCreated: vi.fn(),
      onParentMailboxEventUpdated: vi.fn(),
      onWaitBarrierUpdated: vi.fn(),
    };

    const result = reconcileSubagentsOnRuntimeStartup({
      store,
      featureFlagSnapshot: disabledFlags,
      emit,
    });

    expect(result).toMatchObject({
      schemaVersion: "ambient-subagent-restart-reconciliation-v1",
      createdAt: "2026-06-05T00:00:00.000Z",
      issueCount: 0,
      skipped: true,
      skipReason: "ambient_subagents_disabled",
      featureFlagSnapshot: {
        flags: {
          [AMBIENT_SUBAGENTS_FEATURE_FLAG]: {
            enabled: false,
          },
        },
      },
      repairedRunIds: [],
      repairedBarrierIds: [],
      repairedParentControlBarrierIds: [],
      repairableSpawnEdgeRunIds: [],
      danglingSpawnEdgeRunIds: [],
      diagnosticRunIds: [],
      issues: [],
    });
    expect(store.reconcileSubagentRestartState).not.toHaveBeenCalled();
    expect(store.getSubagentRun).not.toHaveBeenCalled();
    expect(store.getSubagentWaitBarrier).not.toHaveBeenCalled();
    expect(emit.onRunUpdated).not.toHaveBeenCalled();
    expect(emit.onThreadUpdated).not.toHaveBeenCalled();
    expect(emit.onRunEventCreated).not.toHaveBeenCalled();
    expect(emit.onParentMailboxEventUpdated).not.toHaveBeenCalled();
    expect(emit.onWaitBarrierUpdated).not.toHaveBeenCalled();
  });

  it("emits repaired child run, child thread, lifecycle stop, restart event, and wait barrier updates", () => {
    const run = { id: "run-1", childThreadId: "child-1" } as SubagentRunSummary;
    const thread = { id: "child-1" } as ThreadSummary;
    const barrier = { id: "barrier-1" } as SubagentWaitBarrierSummary;
    const lifecycleStopEvent = {
      runId: "run-1",
      sequence: 3,
      type: "subagent.lifecycle_stopped",
    } as SubagentRunEventSummary;
    const restartEvent = {
      runId: "run-1",
      sequence: 4,
      type: "subagent.restart_reconciled",
    } as SubagentRunEventSummary;
    const parentMailboxEvent = {
      id: "parent-mailbox-1",
      parentRunId: "parent-run-1",
      type: "subagent.lifecycle_interrupted",
      payload: {
        schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
        childRunId: "run-1",
        source: "desktop_restart",
      },
    } as SubagentParentMailboxEventSummary;
    const summary: SubagentRestartReconciliationSummary = {
      schemaVersion: "ambient-subagent-restart-reconciliation-v1",
      createdAt: "2026-06-05T00:00:00.000Z",
      issueCount: 2,
      repairedRunIds: ["run-1", "run-1"],
      repairedBarrierIds: ["barrier-1", "barrier-1"],
      repairedParentControlBarrierIds: [],
      repairableSpawnEdgeRunIds: [],
      danglingSpawnEdgeRunIds: [],
      diagnosticRunIds: [],
      issues: [],
    };
    const store: SubagentStartupReconciliationStore = {
      reconcileSubagentRestartState: vi.fn(() => summary),
      getSubagentRun: vi.fn(() => run),
      getThread: vi.fn(() => thread),
      listSubagentRunEvents: vi.fn(() => [
        { runId: "run-1", sequence: 2, type: "subagent.status_changed" } as SubagentRunEventSummary,
        lifecycleStopEvent,
        restartEvent,
      ]),
      listSubagentParentMailboxEventsForParentRun: vi.fn(() => [parentMailboxEvent]),
      getSubagentWaitBarrier: vi.fn(() => barrier),
    };
    const emitted: Array<{ type: string; id?: string; sequence?: number }> = [];

    const result = reconcileSubagentsOnRuntimeStartup({
      store,
      featureFlagSnapshot: enabledFeatureFlags(),
      now: "2026-06-05T00:00:00.000Z",
      emit: {
        onRunUpdated: (item) => emitted.push({ type: "run", id: item.id }),
        onThreadUpdated: (item) => emitted.push({ type: "thread", id: item.id }),
        onRunEventCreated: (_item, event) => emitted.push({ type: "event", sequence: event.sequence }),
        onParentMailboxEventUpdated: (event) => emitted.push({ type: "parent-mailbox", id: event.id }),
        onWaitBarrierUpdated: (item) => emitted.push({ type: "barrier", id: item.id }),
      },
    });

    expect(result).toBe(summary);
    expect(store.reconcileSubagentRestartState).toHaveBeenCalledWith({ now: "2026-06-05T00:00:00.000Z" });
    expect(emitted).toEqual([
      { type: "run", id: "run-1" },
      { type: "thread", id: "child-1" },
      { type: "event", sequence: 3 },
      { type: "event", sequence: 4 },
      { type: "parent-mailbox", id: "parent-mailbox-1" },
      { type: "barrier", id: "barrier-1" },
    ]);
  });

  it("stays quiet when startup reconciliation has nothing to repair", () => {
    const summary: SubagentRestartReconciliationSummary = {
      schemaVersion: "ambient-subagent-restart-reconciliation-v1",
      createdAt: "2026-06-05T00:00:00.000Z",
      issueCount: 0,
      repairedRunIds: [],
      repairedBarrierIds: [],
      repairedParentControlBarrierIds: [],
      repairableSpawnEdgeRunIds: [],
      danglingSpawnEdgeRunIds: [],
      diagnosticRunIds: [],
      issues: [],
    };
    const store: SubagentStartupReconciliationStore = {
      reconcileSubagentRestartState: vi.fn(() => summary),
      getSubagentRun: vi.fn(),
      getThread: vi.fn(),
      listSubagentRunEvents: vi.fn(),
      getSubagentWaitBarrier: vi.fn(),
    };
    const onRunUpdated = vi.fn();

    reconcileSubagentsOnRuntimeStartup({ store, featureFlagSnapshot: enabledFeatureFlags(), emit: { onRunUpdated } });

    expect(onRunUpdated).not.toHaveBeenCalled();
    expect(store.getSubagentRun).not.toHaveBeenCalled();
    expect(store.getSubagentWaitBarrier).not.toHaveBeenCalled();
  });

  it("runs callable workflow task restart reconciliation when the store supports it", () => {
    const childSummary: SubagentRestartReconciliationSummary = {
      schemaVersion: "ambient-subagent-restart-reconciliation-v1",
      createdAt: "2026-06-05T00:00:00.000Z",
      issueCount: 0,
      repairedRunIds: [],
      repairedBarrierIds: [],
      repairedParentControlBarrierIds: [],
      repairableSpawnEdgeRunIds: [],
      danglingSpawnEdgeRunIds: [],
      diagnosticRunIds: [],
      issues: [],
    };
    const workflowTaskSummary: CallableWorkflowTaskRestartReconciliationSummary = {
      schemaVersion: "ambient-callable-workflow-task-restart-v1",
      createdAt: "2026-06-05T00:00:00.000Z",
      issueCount: 1,
      repairedTaskIds: ["task-1"],
      diagnosticTaskIds: ["task-1"],
      staleWorkflowArtifactTaskIds: [],
      staleWorkflowRunTaskIds: [],
      issues: [{
        id: "workflow_run_terminal_task_unfinished:task-1:parent-run:artifact-1:run-1",
        kind: "workflow_run_terminal_task_unfinished",
        severity: "warning",
        message: "Callable workflow task task-1 is running but linked workflow run run-1 already finished as succeeded.",
        taskId: "task-1",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        workflowArtifactId: "artifact-1",
        workflowRunId: "run-1",
      }],
    };
    const store: SubagentStartupReconciliationStore = {
      reconcileSubagentRestartState: vi.fn(() => childSummary),
      reconcileCallableWorkflowTaskRestartState: vi.fn(() => workflowTaskSummary),
      getSubagentRun: vi.fn(),
      getThread: vi.fn(),
      listSubagentRunEvents: vi.fn(),
      getSubagentWaitBarrier: vi.fn(),
    };

    const result = reconcileSubagentsOnRuntimeStartup({
      store,
      featureFlagSnapshot: enabledFeatureFlags(),
      now: "2026-06-05T00:00:00.000Z",
    });

    expect(store.reconcileCallableWorkflowTaskRestartState).toHaveBeenCalledWith({
      now: "2026-06-05T00:00:00.000Z",
    });
    expect(result).toMatchObject({
      repairedRunIds: [],
      callableWorkflowTasks: workflowTaskSummary,
    });
  });

  it("emits only the latest startup repair lifecycle and restart events for repaired runs", () => {
    const run = { id: "run-1", childThreadId: "child-1" } as SubagentRunSummary;
    const summary: SubagentRestartReconciliationSummary = {
      schemaVersion: "ambient-subagent-restart-reconciliation-v1",
      createdAt: "2026-06-05T00:00:00.000Z",
      issueCount: 1,
      repairedRunIds: ["run-1"],
      repairedBarrierIds: [],
      repairedParentControlBarrierIds: [],
      repairableSpawnEdgeRunIds: [],
      danglingSpawnEdgeRunIds: [],
      diagnosticRunIds: [],
      issues: [],
    };
    const store: SubagentStartupReconciliationStore = {
      reconcileSubagentRestartState: vi.fn(() => summary),
      getSubagentRun: vi.fn(() => run),
      getThread: vi.fn(() => ({ id: "child-1" } as ThreadSummary)),
      listSubagentRunEvents: vi.fn(() => [
        { runId: "run-1", sequence: 2, type: "subagent.lifecycle_stopped" } as SubagentRunEventSummary,
        { runId: "run-1", sequence: 3, type: "subagent.restart_reconciled" } as SubagentRunEventSummary,
        { runId: "run-1", sequence: 7, type: "subagent.restart_reconciled" } as SubagentRunEventSummary,
        { runId: "run-1", sequence: 6, type: "subagent.lifecycle_stopped" } as SubagentRunEventSummary,
      ]),
      getSubagentWaitBarrier: vi.fn(),
    };
    const onRunEventCreated = vi.fn();

    reconcileSubagentsOnRuntimeStartup({ store, featureFlagSnapshot: enabledFeatureFlags(), emit: { onRunEventCreated } });

    expect(onRunEventCreated.mock.calls.map((call) => call[1].sequence)).toEqual([6, 7]);
  });

  it("emits diagnostic restart events without treating them as repaired runs", () => {
    const run = { id: "run-1", childThreadId: "child-1" } as SubagentRunSummary;
    const diagnosticEvent = {
      runId: "run-1",
      sequence: 4,
      type: "subagent.restart_diagnostic",
    } as SubagentRunEventSummary;
    const summary: SubagentRestartReconciliationSummary = {
      schemaVersion: "ambient-subagent-restart-reconciliation-v1",
      createdAt: "2026-06-05T00:00:00.000Z",
      issueCount: 1,
      repairedRunIds: [],
      repairedBarrierIds: [],
      repairedParentControlBarrierIds: [],
      repairableSpawnEdgeRunIds: ["run-1"],
      danglingSpawnEdgeRunIds: [],
      diagnosticRunIds: ["run-1", "run-1"],
      issues: [{
        id: "missing_spawn_edge:run-1:::",
        kind: "missing_spawn_edge",
        severity: "error",
        message: "Sub-agent run run-1 is missing its persisted spawn edge.",
        runId: "run-1",
      }],
    };
    const store: SubagentStartupReconciliationStore = {
      reconcileSubagentRestartState: vi.fn(() => summary),
      getSubagentRun: vi.fn(() => run),
      getThread: vi.fn(),
      listSubagentRunEvents: vi.fn(() => [
        { runId: "run-1", sequence: 3, type: "subagent.restart_reconciled" } as SubagentRunEventSummary,
        diagnosticEvent,
      ]),
      getSubagentWaitBarrier: vi.fn(),
    };
    const onRunUpdated = vi.fn();
    const onThreadUpdated = vi.fn();
    const onRunEventCreated = vi.fn();

    reconcileSubagentsOnRuntimeStartup({
      store,
      featureFlagSnapshot: enabledFeatureFlags(),
      emit: {
        onRunUpdated,
        onThreadUpdated,
        onRunEventCreated,
      },
    });

    expect(onRunUpdated).not.toHaveBeenCalled();
    expect(onThreadUpdated).not.toHaveBeenCalled();
    expect(onRunEventCreated).toHaveBeenCalledTimes(1);
    expect(onRunEventCreated).toHaveBeenCalledWith(run, diagnosticEvent);
  });

  it("emits repaired parent-control barrier and parent mailbox events after restart", () => {
    const barrier = {
      id: "barrier-cancel-parent",
      parentRunId: "parent-run-1",
    } as SubagentWaitBarrierSummary;
    const parentMailboxEvent = {
      id: "parent-mailbox-control",
      parentRunId: "parent-run-1",
      type: "subagent.parent_control_reconciled",
      payload: {
        schemaVersion: "ambient-subagent-parent-control-reconciled-v1",
        waitBarrierId: "barrier-cancel-parent",
        source: "desktop_restart",
      },
    } as SubagentParentMailboxEventSummary;
    const summary: SubagentRestartReconciliationSummary = {
      schemaVersion: "ambient-subagent-restart-reconciliation-v1",
      createdAt: "2026-06-05T00:00:00.000Z",
      issueCount: 1,
      repairedRunIds: [],
      repairedBarrierIds: [],
      repairedParentControlBarrierIds: ["barrier-cancel-parent", "barrier-cancel-parent"],
      repairableSpawnEdgeRunIds: [],
      danglingSpawnEdgeRunIds: [],
      diagnosticRunIds: [],
      issues: [{
        id: "parent_cancel_control_unreconciled:::parent-run-1:barrier-cancel-parent",
        kind: "parent_cancel_control_unreconciled",
        severity: "warning",
        message: "Sub-agent wait barrier barrier-cancel-parent requested parent cancellation before restart and needs parent-control reconciliation.",
        parentRunId: "parent-run-1",
        barrierId: "barrier-cancel-parent",
      }],
    };
    const store: SubagentStartupReconciliationStore = {
      reconcileSubagentRestartState: vi.fn(() => summary),
      getSubagentRun: vi.fn(),
      getThread: vi.fn(),
      listSubagentRunEvents: vi.fn(),
      listSubagentParentMailboxEventsForParentRun: vi.fn(() => [parentMailboxEvent]),
      getSubagentWaitBarrier: vi.fn(() => barrier),
    };
    const onWaitBarrierUpdated = vi.fn();
    const onParentMailboxEventUpdated = vi.fn();

    reconcileSubagentsOnRuntimeStartup({
      store,
      featureFlagSnapshot: enabledFeatureFlags(),
      emit: {
        onWaitBarrierUpdated,
        onParentMailboxEventUpdated,
      },
    });

    expect(onWaitBarrierUpdated).toHaveBeenCalledTimes(1);
    expect(onWaitBarrierUpdated).toHaveBeenCalledWith(barrier);
    expect(onParentMailboxEventUpdated).toHaveBeenCalledTimes(1);
    expect(onParentMailboxEventUpdated).toHaveBeenCalledWith(parentMailboxEvent);
  });
});

function enabledFeatureFlags(): AmbientFeatureFlagSnapshot {
  return resolveAmbientFeatureFlags({
    settings: { subagents: true },
    generatedAt: "2026-06-05T00:00:00.000Z",
  });
}
