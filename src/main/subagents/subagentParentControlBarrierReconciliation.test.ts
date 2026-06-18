import { describe, expect, it, vi } from "vitest";

import type { SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import {
  buildSubagentParentControlBarrierReconciliationArtifact,
  resolveSubagentParentControlBarrierReconciliation,
  SUBAGENT_PARENT_CONTROL_RECONCILIATION_SCHEMA_VERSION,
} from "./subagentParentControlBarrierReconciliation";

describe("subagentParentControlBarrierReconciliation", () => {
  it("preserves terminal transition evidence while recording restart reconciliation", () => {
    const waitBarrier = barrier({
      resolutionArtifact: {
        schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
        parentCancellationRequested: true,
        transitionEvidence: {
          schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
          kind: "child_cancelled",
          source: "barrier_controller",
          idempotencyKey: "barrier:cancel-parent",
        },
      },
    });

    expect(SUBAGENT_PARENT_CONTROL_RECONCILIATION_SCHEMA_VERSION)
      .toBe("ambient-subagent-parent-control-reconciliation-v1");
    expect(buildSubagentParentControlBarrierReconciliationArtifact({
      waitBarrier,
      source: "desktop_restart",
      now: "2026-06-05T00:00:30.000Z",
    })).toMatchObject({
      schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
      synthesisAllowed: false,
      parentCancellationRequested: true,
      parentControlReconciledAt: "2026-06-05T00:00:30.000Z",
      parentControlReconciledSource: "desktop_restart",
      transitionEvidence: expect.objectContaining({
        kind: "child_cancelled",
      }),
      parentControlReconciliation: expect.objectContaining({
        schemaVersion: "ambient-subagent-parent-control-reconciliation-v1",
        action: "cancel_parent",
        source: "desktop_restart",
        reconciledAt: "2026-06-05T00:00:30.000Z",
        waitBarrierId: "barrier-cancel-parent",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        barrierStatus: "cancelled",
        childRunIds: ["child-run"],
        idempotencyKey: "parent-control-reconcile:desktop_restart:barrier-cancel-parent",
        terminalTransitionEvidence: expect.objectContaining({
          kind: "child_cancelled",
        }),
      }),
    });
  });

  it("updates runtime abort reconciliation even when older artifacts lack parent cancellation", () => {
    const waitBarrier = barrier({ resolutionArtifact: { synthesisAllowed: false } });
    const updateSubagentWaitBarrierStatus = vi.fn((
      id: string,
      status: SubagentWaitBarrierSummary["status"],
      options?: { resolutionArtifact?: unknown; now?: string },
    ): SubagentWaitBarrierSummary => ({
      ...waitBarrier,
      id,
      status,
      updatedAt: options?.now ?? waitBarrier.updatedAt,
      ...(options?.resolutionArtifact !== undefined ? { resolutionArtifact: options.resolutionArtifact } : {}),
    }));

    const reconciled = resolveSubagentParentControlBarrierReconciliation({
      store: { updateSubagentWaitBarrierStatus },
      waitBarrier,
      source: "runtime_parent_abort",
      now: "2026-06-05T00:00:31.000Z",
    });

    expect(updateSubagentWaitBarrierStatus).toHaveBeenCalledWith("barrier-cancel-parent", "cancelled", {
      now: "2026-06-05T00:00:31.000Z",
      resolutionArtifact: expect.objectContaining({
        parentCancellationRequested: true,
        parentControlReconciliation: expect.objectContaining({
          source: "runtime_parent_abort",
        }),
      }),
    });
    expect(reconciled.resolutionArtifact).toMatchObject({
      parentCancellationRequested: true,
      parentControlReconciliation: expect.objectContaining({
        idempotencyKey: "parent-control-reconcile:runtime_parent_abort:barrier-cancel-parent",
      }),
    });
  });

  it("leaves unrelated restart barriers unchanged", () => {
    const waitBarrier = barrier({ resolutionArtifact: { synthesisAllowed: false } });
    const store = { updateSubagentWaitBarrierStatus: vi.fn() };

    expect(resolveSubagentParentControlBarrierReconciliation({
      store,
      waitBarrier,
      source: "desktop_restart",
      now: "2026-06-05T00:00:31.000Z",
    })).toBe(waitBarrier);
    expect(store.updateSubagentWaitBarrierStatus).not.toHaveBeenCalled();
  });
});

function barrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier-cancel-parent",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run"],
    dependencyMode: "required_all",
    status: "cancelled",
    failurePolicy: "ask_user",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    resolvedAt: "2026-06-05T00:00:12.000Z",
    ...overrides,
  };
}
