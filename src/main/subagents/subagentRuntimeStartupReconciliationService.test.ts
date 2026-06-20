import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type {
  SubagentParentMailboxEventSummary,
  SubagentRestartReconciliationSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import {
  createSubagentRuntimeStartupReconciliationService,
  type ReconcileSubagentsOnRuntimeStartup,
} from "./subagentRuntimeStartupReconciliationService";
import type { SubagentStartupReconciliationStore } from "./subagentStartupReconciliation";

type FakeStore = SubagentStartupReconciliationStore & { id: string };
type FakeHost = { id: string; store: FakeStore };

function createStore(): FakeStore {
  return {
    id: "store-1",
    reconcileSubagentRestartState: vi.fn(() => emptySummary()),
    getSubagentRun: vi.fn(),
    getThread: vi.fn(),
    listSubagentRunEvents: vi.fn(),
    getSubagentWaitBarrier: vi.fn(),
  };
}

function emptySummary(): SubagentRestartReconciliationSummary {
  return {
    schemaVersion: "ambient-subagent-restart-reconciliation-v1",
    createdAt: "2026-06-20T00:00:00.000Z",
    issueCount: 0,
    repairedRunIds: [],
    repairedBarrierIds: [],
    repairedParentControlBarrierIds: [],
    repairableSpawnEdgeRunIds: [],
    danglingSpawnEdgeRunIds: [],
    diagnosticRunIds: [],
    issues: [],
  };
}

describe("sub-agent runtime startup reconciliation service", () => {
  it("passes host store and feature flags into startup reconciliation", () => {
    const store = createStore();
    const host: FakeHost = { id: "host-1", store };
    const featureFlagSnapshot = resolveAmbientFeatureFlags({
      settings: { subagents: true },
      generatedAt: "2026-06-20T00:00:00.000Z",
    });
    const currentFeatureFlagSnapshot = vi.fn(() => featureFlagSnapshot);
    const reconcileSubagentsOnRuntimeStartup = vi.fn<ReconcileSubagentsOnRuntimeStartup>(() => emptySummary());
    const service = createSubagentRuntimeStartupReconciliationService({
      currentFeatureFlagSnapshot,
      emitProjectScopedEvent: vi.fn(),
      reconcileSubagentsOnRuntimeStartup,
      warn: vi.fn(),
    });

    service.runSubagentRuntimeStartupReconciliation("project-runtime-created", host);

    expect(currentFeatureFlagSnapshot).toHaveBeenCalledWith(store);
    expect(reconcileSubagentsOnRuntimeStartup).toHaveBeenCalledWith({
      store,
      featureFlagSnapshot,
      emit: expect.objectContaining({
        onRunUpdated: expect.any(Function),
        onThreadUpdated: expect.any(Function),
        onRunEventCreated: expect.any(Function),
        onParentMailboxEventUpdated: expect.any(Function),
        onWaitBarrierUpdated: expect.any(Function),
      }),
    });
  });

  it("forwards reconciliation callbacks as project-scoped desktop events", () => {
    const store = createStore();
    const host: FakeHost = { id: "host-1", store };
    const run = { id: "run-1" } as SubagentRunSummary;
    const thread = { id: "thread-1" } as ThreadSummary;
    const event = {
      id: "event-1",
      runId: "run-1",
      sequence: 1,
      type: "subagent.restart_reconciled",
      createdAt: "2026-06-20T00:00:00.000Z",
    } as SubagentRunEventSummary;
    const mailboxEvent = { id: "mailbox-1" } as SubagentParentMailboxEventSummary;
    const barrier = { id: "barrier-1" } as SubagentWaitBarrierSummary;
    const emitted: DesktopEvent[] = [];
    const reconcileSubagentsOnRuntimeStartup: ReconcileSubagentsOnRuntimeStartup = (input) => {
      input.emit?.onRunUpdated?.(run);
      input.emit?.onThreadUpdated?.(thread);
      input.emit?.onRunEventCreated?.(run, event);
      input.emit?.onParentMailboxEventUpdated?.(mailboxEvent);
      input.emit?.onWaitBarrierUpdated?.(barrier);
      return emptySummary();
    };
    const service = createSubagentRuntimeStartupReconciliationService({
      currentFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      emitProjectScopedEvent: (_host, event) => emitted.push(event),
      reconcileSubagentsOnRuntimeStartup,
      warn: vi.fn(),
    });

    service.runSubagentRuntimeStartupReconciliation("project-runtime-created", host);

    expect(emitted).toEqual([
      { type: "subagent-run-updated", run },
      { type: "thread-updated", thread },
      { type: "subagent-run-event-created", run, event },
      { type: "subagent-parent-mailbox-event-updated", mailboxEvent },
      { type: "subagent-wait-barrier-updated", barrier },
    ]);
  });

  it("warns when reconciliation reports restart issues or repairs", () => {
    const store = createStore();
    const warn = vi.fn();
    const service = createSubagentRuntimeStartupReconciliationService({
      currentFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      emitProjectScopedEvent: vi.fn(),
      reconcileSubagentsOnRuntimeStartup: () => ({
        ...emptySummary(),
        issueCount: 2,
        repairedRunIds: ["run-1", "run-2"],
        repairedBarrierIds: ["barrier-1"],
        diagnosticRunIds: ["run-3"],
      }),
      warn,
    });

    service.runSubagentRuntimeStartupReconciliation("project-runtime-created", { id: "host-1", store });

    expect(warn).toHaveBeenCalledWith(
      "[subagents] project-runtime-created restart reconciliation issues=2 repairedRuns=2 repairedBarriers=1 diagnosticRuns=1",
    );
  });

  it("stays quiet when reconciliation has no issues or repairs", () => {
    const store = createStore();
    const warn = vi.fn();
    const service = createSubagentRuntimeStartupReconciliationService({
      currentFeatureFlagSnapshot: () => resolveAmbientFeatureFlags({ settings: { subagents: true } }),
      emitProjectScopedEvent: vi.fn(),
      reconcileSubagentsOnRuntimeStartup: () => emptySummary(),
      warn,
    });

    service.runSubagentRuntimeStartupReconciliation("project-runtime-created", { id: "host-1", store });

    expect(warn).not.toHaveBeenCalled();
  });
});
