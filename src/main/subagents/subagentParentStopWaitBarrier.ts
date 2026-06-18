import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import {
  SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION,
  SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
  type SubagentWaitBarrierTransitionEvidence,
} from "./subagentWaitBarrierResolution";

export interface SubagentParentStopWaitBarrierStore {
  updateSubagentWaitBarrierStatus(
    id: string,
    status: "cancelled",
    options?: { resolutionArtifact?: unknown; now?: string },
  ): SubagentWaitBarrierSummary;
}

export interface SubagentParentStopWaitBarrierChildStatus {
  childRunId: string;
  status: SubagentRunSummary["status"];
}

export function buildSubagentParentStopWaitBarrierTransitionEvidence(input: {
  waitBarrier: SubagentWaitBarrierSummary;
  parentThreadId: string;
  parentRunId: string;
  reason: string;
  subagentsDisabledSafetyCascade: boolean;
  childStatuses: SubagentParentStopWaitBarrierChildStatus[];
}): SubagentWaitBarrierTransitionEvidence {
  return {
    schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
    kind: "parent_stopped",
    source: "barrier_controller",
    childRunIds: input.waitBarrier.childRunIds,
    reason: input.reason,
    idempotencyKey: `parent-stop:${input.parentRunId}:${input.waitBarrier.id}`,
    details: {
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      parentCancellationRequested: true,
      subagentsDisabledSafetyCascade: input.subagentsDisabledSafetyCascade,
      childStatuses: input.childStatuses,
    },
  };
}

export function buildSubagentParentStopWaitBarrierResolutionArtifact(input: {
  waitBarrier: SubagentWaitBarrierSummary;
  parentThreadId: string;
  parentRunId: string;
  reason: string;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  subagentsDisabledSafetyCascade: boolean;
  childStatuses: SubagentParentStopWaitBarrierChildStatus[];
}): Record<string, unknown> {
  const baseArtifact = input.waitBarrier.resolutionArtifact &&
    typeof input.waitBarrier.resolutionArtifact === "object" &&
    !Array.isArray(input.waitBarrier.resolutionArtifact)
    ? input.waitBarrier.resolutionArtifact as Record<string, unknown>
    : {};
  return {
    ...baseArtifact,
    schemaVersion: SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION,
    childRunIds: input.waitBarrier.childRunIds,
    parentStopped: true,
    parentCancellationRequested: true,
    reason: input.reason,
    synthesisAllowed: false,
    timedOut: false,
    featureFlagSnapshot: input.featureFlagSnapshot,
    ...(input.subagentsDisabledSafetyCascade ? { subagentsDisabledSafetyCascade: true } : {}),
    childStatuses: input.childStatuses,
    transitionEvidence: buildSubagentParentStopWaitBarrierTransitionEvidence({
      waitBarrier: input.waitBarrier,
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      reason: input.reason,
      subagentsDisabledSafetyCascade: input.subagentsDisabledSafetyCascade,
      childStatuses: input.childStatuses,
    }),
  };
}

export function resolveSubagentParentStopWaitBarrier(input: {
  store: SubagentParentStopWaitBarrierStore;
  waitBarrier: SubagentWaitBarrierSummary;
  parentThreadId: string;
  parentRunId: string;
  reason: string;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  subagentsDisabledSafetyCascade: boolean;
  childStatuses: SubagentParentStopWaitBarrierChildStatus[];
  now?: string;
}): SubagentWaitBarrierSummary {
  if (input.waitBarrier.status !== "waiting_on_children") return input.waitBarrier;
  return input.store.updateSubagentWaitBarrierStatus(input.waitBarrier.id, "cancelled", {
    now: input.now,
    resolutionArtifact: buildSubagentParentStopWaitBarrierResolutionArtifact({
      waitBarrier: input.waitBarrier,
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      reason: input.reason,
      featureFlagSnapshot: input.featureFlagSnapshot,
      subagentsDisabledSafetyCascade: input.subagentsDisabledSafetyCascade,
      childStatuses: input.childStatuses,
    }),
  });
}
