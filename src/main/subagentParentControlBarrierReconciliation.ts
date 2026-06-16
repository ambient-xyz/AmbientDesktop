import type { SubagentWaitBarrierSummary } from "../shared/types";

export const SUBAGENT_PARENT_CONTROL_RECONCILIATION_SCHEMA_VERSION =
  "ambient-subagent-parent-control-reconciliation-v1" as const;

export type SubagentParentControlReconciliationSource =
  | "runtime_parent_abort"
  | "desktop_restart";

export interface SubagentParentControlBarrierReconciliationStore {
  updateSubagentWaitBarrierStatus(
    id: string,
    status: SubagentWaitBarrierSummary["status"],
    options?: { resolutionArtifact?: unknown; now?: string },
  ): SubagentWaitBarrierSummary;
}

export function resolveSubagentParentControlBarrierReconciliation(input: {
  store: SubagentParentControlBarrierReconciliationStore;
  waitBarrier: SubagentWaitBarrierSummary;
  source: SubagentParentControlReconciliationSource;
  now: string;
}): SubagentWaitBarrierSummary {
  const artifact = recordValue(input.waitBarrier.resolutionArtifact);
  if (artifact.parentCancellationRequested !== true && input.source !== "runtime_parent_abort") {
    return input.waitBarrier;
  }
  return input.store.updateSubagentWaitBarrierStatus(input.waitBarrier.id, input.waitBarrier.status, {
    now: input.now,
    resolutionArtifact: buildSubagentParentControlBarrierReconciliationArtifact({
      waitBarrier: input.waitBarrier,
      source: input.source,
      now: input.now,
      artifact,
    }),
  });
}

export function buildSubagentParentControlBarrierReconciliationArtifact(input: {
  waitBarrier: SubagentWaitBarrierSummary;
  source: SubagentParentControlReconciliationSource;
  now: string;
  artifact?: Record<string, unknown>;
}): Record<string, unknown> {
  const artifact = input.artifact ?? recordValue(input.waitBarrier.resolutionArtifact);
  return {
    ...artifact,
    synthesisAllowed: false,
    parentCancellationRequested: true,
    parentControlReconciledAt: input.now,
    parentControlReconciledSource: input.source,
    parentControlReconciliation: {
      schemaVersion: SUBAGENT_PARENT_CONTROL_RECONCILIATION_SCHEMA_VERSION,
      action: "cancel_parent",
      source: input.source,
      reconciledAt: input.now,
      waitBarrierId: input.waitBarrier.id,
      parentThreadId: input.waitBarrier.parentThreadId,
      parentRunId: input.waitBarrier.parentRunId,
      barrierStatus: input.waitBarrier.status,
      childRunIds: input.waitBarrier.childRunIds,
      parentCancellationRequested: true,
      idempotencyKey: `parent-control-reconcile:${input.source}:${input.waitBarrier.id}`,
      ...(artifact?.transitionEvidence ? { terminalTransitionEvidence: artifact.transitionEvidence } : {}),
    },
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}
