import type { DesktopEvent } from "../../shared/desktopTypes";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import { reconcileSubagentsOnRuntimeStartup as defaultReconcileSubagentsOnRuntimeStartup } from "./subagentStartupReconciliation";
import type { SubagentStartupReconciliationStore } from "./subagentStartupReconciliation";

export type SubagentRuntimeStartupReconciliationReason = "project-runtime-created";

export interface SubagentRuntimeStartupReconciliationHost<
  Store extends SubagentStartupReconciliationStore = SubagentStartupReconciliationStore,
> {
  store: Store;
}

export type ReconcileSubagentsOnRuntimeStartup = typeof defaultReconcileSubagentsOnRuntimeStartup;

export interface SubagentRuntimeStartupReconciliationServiceDependencies<
  Store extends SubagentStartupReconciliationStore,
  Host extends SubagentRuntimeStartupReconciliationHost<Store>,
> {
  currentFeatureFlagSnapshot(store: Store): AmbientFeatureFlagSnapshot;
  emitProjectScopedEvent(host: Host, event: DesktopEvent): void;
  reconcileSubagentsOnRuntimeStartup?: ReconcileSubagentsOnRuntimeStartup;
  warn(message: string): void;
}

export interface SubagentRuntimeStartupReconciliationService<
  Host extends SubagentRuntimeStartupReconciliationHost,
> {
  runSubagentRuntimeStartupReconciliation(
    reason: SubagentRuntimeStartupReconciliationReason,
    host: Host,
  ): void;
}

export function createSubagentRuntimeStartupReconciliationService<
  Store extends SubagentStartupReconciliationStore,
  Host extends SubagentRuntimeStartupReconciliationHost<Store>,
>({
  currentFeatureFlagSnapshot,
  emitProjectScopedEvent,
  reconcileSubagentsOnRuntimeStartup = defaultReconcileSubagentsOnRuntimeStartup,
  warn,
}: SubagentRuntimeStartupReconciliationServiceDependencies<Store, Host>): SubagentRuntimeStartupReconciliationService<Host> {
  function runSubagentRuntimeStartupReconciliation(
    reason: SubagentRuntimeStartupReconciliationReason,
    host: Host,
  ): void {
    const featureFlagSnapshot = currentFeatureFlagSnapshot(host.store);
    const summary = reconcileSubagentsOnRuntimeStartup({
      store: host.store,
      featureFlagSnapshot,
      emit: {
        onRunUpdated: (run) => emitProjectScopedEvent(host, { type: "subagent-run-updated", run }),
        onThreadUpdated: (thread) => emitProjectScopedEvent(host, { type: "thread-updated", thread }),
        onRunEventCreated: (run, event) => emitProjectScopedEvent(host, { type: "subagent-run-event-created", run, event }),
        onParentMailboxEventUpdated: (mailboxEvent) =>
          emitProjectScopedEvent(host, { type: "subagent-parent-mailbox-event-updated", mailboxEvent }),
        onWaitBarrierUpdated: (barrier) => emitProjectScopedEvent(host, { type: "subagent-wait-barrier-updated", barrier }),
      },
    });
    if (
      summary.issueCount ||
      summary.repairedRunIds.length ||
      summary.repairedBarrierIds.length ||
      summary.diagnosticRunIds.length
    ) {
      warn(
        `[subagents] ${reason} restart reconciliation issues=${summary.issueCount} repairedRuns=${summary.repairedRunIds.length} repairedBarriers=${summary.repairedBarrierIds.length} diagnosticRuns=${summary.diagnosticRunIds.length}`,
      );
    }
  }

  return {
    runSubagentRuntimeStartupReconciliation,
  };
}
