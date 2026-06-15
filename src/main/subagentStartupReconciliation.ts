import type {
  AmbientFeatureFlagSnapshot,
  CallableWorkflowTaskRestartReconciliationSummary,
  SubagentRestartReconciliationSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
  ThreadSummary,
} from "../shared/types";
import { isAmbientSubagentsEnabled } from "../shared/featureFlags";
import { subagentLifecycleEventType } from "./subagentLifecycleHooks";

export interface SubagentStartupReconciliationStore {
  reconcileSubagentRestartState(options?: { now?: string }): SubagentRestartReconciliationSummary;
  reconcileCallableWorkflowTaskRestartState?(options?: { now?: string }): CallableWorkflowTaskRestartReconciliationSummary;
  getSubagentRun(runId: string): SubagentRunSummary;
  getThread(threadId: string): ThreadSummary;
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
  listSubagentParentMailboxEventsForParentRun?(parentRunId: string): SubagentParentMailboxEventSummary[];
  getSubagentWaitBarrier(id: string): SubagentWaitBarrierSummary;
}

export interface SubagentStartupReconciliationEmitter {
  onRunUpdated?: (run: SubagentRunSummary) => void;
  onThreadUpdated?: (thread: ThreadSummary) => void;
  onRunEventCreated?: (run: SubagentRunSummary, event: SubagentRunEventSummary) => void;
  onParentMailboxEventUpdated?: (event: SubagentParentMailboxEventSummary) => void;
  onWaitBarrierUpdated?: (barrier: SubagentWaitBarrierSummary) => void;
}

export function reconcileSubagentsOnRuntimeStartup(input: {
  store: SubagentStartupReconciliationStore;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  emit?: SubagentStartupReconciliationEmitter;
  now?: string;
}): SubagentRestartReconciliationSummary {
  if (!isAmbientSubagentsEnabled(input.featureFlagSnapshot)) {
    return skippedStartupReconciliationSummary({
      createdAt: input.now ?? input.featureFlagSnapshot.generatedAt,
      featureFlagSnapshot: input.featureFlagSnapshot,
    });
  }
  const summary = input.store.reconcileSubagentRestartState({ now: input.now });
  const callableWorkflowTasks = input.store.reconcileCallableWorkflowTaskRestartState?.({ now: input.now });
  for (const runId of unique(summary.repairedRunIds)) {
    const run = input.store.getSubagentRun(runId);
    input.emit?.onRunUpdated?.(run);
    input.emit?.onThreadUpdated?.(input.store.getThread(run.childThreadId));
    for (const event of latestStartupRepairEvents(input.store.listSubagentRunEvents(runId))) {
      input.emit?.onRunEventCreated?.(run, event);
    }
    const parentMailboxEvent = latestStartupRepairParentMailboxEvent(input.store, run);
    if (parentMailboxEvent) input.emit?.onParentMailboxEventUpdated?.(parentMailboxEvent);
  }
  for (const runId of unique(summary.diagnosticRunIds)) {
    const run = input.store.getSubagentRun(runId);
    const event = input.store.listSubagentRunEvents(runId)
      .filter((item) => item.type === "subagent.restart_diagnostic")
      .at(-1);
    if (event) input.emit?.onRunEventCreated?.(run, event);
  }
  for (const barrierId of unique([...summary.repairedBarrierIds, ...summary.repairedParentControlBarrierIds])) {
    const barrier = input.store.getSubagentWaitBarrier(barrierId);
    input.emit?.onWaitBarrierUpdated?.(barrier);
    if (summary.repairedParentControlBarrierIds.includes(barrierId)) {
      const parentMailboxEvent = latestStartupParentControlMailboxEvent(input.store, barrier);
      if (parentMailboxEvent) input.emit?.onParentMailboxEventUpdated?.(parentMailboxEvent);
    }
  }
  return callableWorkflowTasks ? { ...summary, callableWorkflowTasks } : summary;
}

function skippedStartupReconciliationSummary(input: {
  createdAt: string;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
}): SubagentRestartReconciliationSummary {
  return {
    schemaVersion: "ambient-subagent-restart-reconciliation-v1",
    createdAt: input.createdAt,
    issueCount: 0,
    skipped: true,
    skipReason: "ambient_subagents_disabled",
    featureFlagSnapshot: input.featureFlagSnapshot,
    repairedRunIds: [],
    repairedBarrierIds: [],
    repairedParentControlBarrierIds: [],
    repairableSpawnEdgeRunIds: [],
    danglingSpawnEdgeRunIds: [],
    diagnosticRunIds: [],
    issues: [],
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function latestStartupRepairEvents(events: SubagentRunEventSummary[]): SubagentRunEventSummary[] {
  return [
    latestEventOfType(events, subagentLifecycleEventType("SubagentStop")),
    latestEventOfType(events, "subagent.restart_reconciled"),
  ]
    .filter((event): event is SubagentRunEventSummary => Boolean(event))
    .sort((left, right) => left.sequence - right.sequence);
}

function latestEventOfType(events: SubagentRunEventSummary[], type: string): SubagentRunEventSummary | undefined {
  return events.filter((event) => event.type === type).at(-1);
}

function latestStartupRepairParentMailboxEvent(
  store: SubagentStartupReconciliationStore,
  run: SubagentRunSummary,
): SubagentParentMailboxEventSummary | undefined {
  const events = store.listSubagentParentMailboxEventsForParentRun?.(run.parentRunId) ?? [];
  return events
    .filter((event) => {
      if (event.type !== "subagent.lifecycle_interrupted") return false;
      const payload = event.payload;
      return Boolean(
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        (payload as Record<string, unknown>).schemaVersion === "ambient-subagent-lifecycle-interruption-v1" &&
        (payload as Record<string, unknown>).childRunId === run.id &&
        (payload as Record<string, unknown>).source === "desktop_restart",
      );
    })
    .at(-1);
}

function latestStartupParentControlMailboxEvent(
  store: SubagentStartupReconciliationStore,
  barrier: SubagentWaitBarrierSummary,
): SubagentParentMailboxEventSummary | undefined {
  const events = store.listSubagentParentMailboxEventsForParentRun?.(barrier.parentRunId) ?? [];
  return events
    .filter((event) => {
      if (event.type !== "subagent.parent_control_reconciled") return false;
      const payload = event.payload;
      return Boolean(
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        (payload as Record<string, unknown>).schemaVersion === "ambient-subagent-parent-control-reconciled-v1" &&
        (payload as Record<string, unknown>).waitBarrierId === barrier.id &&
        (payload as Record<string, unknown>).source === "desktop_restart",
      );
    })
    .at(-1);
}
