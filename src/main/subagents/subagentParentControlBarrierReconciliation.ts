import type { SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import {
  SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
  type SubagentWaitBarrierTransitionEvidence,
} from "./subagentWaitBarrierResolution";

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
    transitionEvidence: artifact?.transitionEvidence ?? buildSubagentParentControlReconciliationTransitionEvidence({
      waitBarrier: input.waitBarrier,
      source: input.source,
      now: input.now,
    }),
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

function buildSubagentParentControlReconciliationTransitionEvidence(input: {
  waitBarrier: SubagentWaitBarrierSummary;
  source: SubagentParentControlReconciliationSource;
  now: string;
}): SubagentWaitBarrierTransitionEvidence {
  return {
    schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
    kind: transitionKindForBarrierStatus(input.waitBarrier.status),
    source: "barrier_controller",
    childRunIds: input.waitBarrier.childRunIds,
    reason: `Parent control reconciliation (${input.source}) annotated a terminal barrier without prior transition evidence.`,
    idempotencyKey: `parent-control-reconcile:${input.source}:${input.waitBarrier.id}:transition-evidence`,
    details: {
      waitBarrierId: input.waitBarrier.id,
      parentThreadId: input.waitBarrier.parentThreadId,
      parentRunId: input.waitBarrier.parentRunId,
      barrierStatus: input.waitBarrier.status,
      reconciledAt: input.now,
    },
  };
}

function transitionKindForBarrierStatus(
  status: SubagentWaitBarrierSummary["status"],
): SubagentWaitBarrierTransitionEvidence["kind"] {
  if (status === "satisfied") return "explicit_partial";
  if (status === "timed_out") return "child_runtime_timeout";
  if (status === "cancelled") return "parent_stopped";
  return "explicit_failure";
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}
