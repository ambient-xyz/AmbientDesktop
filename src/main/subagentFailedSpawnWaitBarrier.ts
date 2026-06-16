import type {
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../shared/types";
import {
  SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION,
  SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
  type SubagentWaitBarrierTransitionEvidence,
} from "./subagentWaitBarrierResolution";

export const SUBAGENT_FAILED_SPAWN_WAIT_BARRIER_SCHEMA_VERSION =
  "ambient-subagent-failed-spawn-wait-barrier-v1" as const;

export interface SubagentFailedSpawnWaitBarrierStore {
  updateSubagentWaitBarrierStatus(
    id: string,
    status: "failed",
    options?: { resolutionArtifact?: unknown; now?: string },
  ): SubagentWaitBarrierSummary;
}

export interface SubagentFailedSpawnWaitBarrierResolutionArtifact {
  schemaVersion: "ambient-subagent-wait-barrier-resolution-v1";
  childRunIds: string[];
  childStatuses: Array<{
    childRunId: string;
    status: SubagentRunSummary["status"];
  }>;
  timedOut: false;
  synthesisAllowed: false;
  transitionEvidence: SubagentWaitBarrierTransitionEvidence;
  resultValidation: unknown;
  resultArtifact: unknown;
}

export function buildSubagentFailedSpawnWaitBarrierResolutionArtifact(input: {
  waitBarrier: SubagentWaitBarrierSummary;
  run: Pick<SubagentRunSummary, "id" | "status" | "resultArtifact">;
  resultValidation: unknown;
}): SubagentFailedSpawnWaitBarrierResolutionArtifact {
  const childStatuses = [{ childRunId: input.run.id, status: input.run.status }];
  return {
    schemaVersion: SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION,
    childRunIds: [input.run.id],
    childStatuses,
    timedOut: false,
    synthesisAllowed: false,
    transitionEvidence: buildSubagentFailedSpawnWaitBarrierTransitionEvidence({
      waitBarrier: input.waitBarrier,
      run: input.run,
      childStatuses,
      resultValidation: input.resultValidation,
    }),
    resultValidation: input.resultValidation,
    resultArtifact: input.run.resultArtifact ?? null,
  };
}

export function buildSubagentFailedSpawnWaitBarrierTransitionEvidence(input: {
  waitBarrier: SubagentWaitBarrierSummary;
  run: Pick<SubagentRunSummary, "id" | "status" | "resultArtifact">;
  childStatuses: Array<{ childRunId: string; status: SubagentRunSummary["status"] }>;
  resultValidation: unknown;
}): SubagentWaitBarrierTransitionEvidence {
  return {
    schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
    kind: "failed_spawn",
    source: "barrier_controller",
    childRunId: input.run.id,
    childRunIds: [input.run.id],
    reason: failedSpawnTransitionReason(input.run.resultArtifact, input.resultValidation),
    idempotencyKey: `failed-spawn:${input.waitBarrier.parentRunId}:${input.waitBarrier.id}:${input.run.id}`,
    details: {
      waitBarrierId: input.waitBarrier.id,
      parentThreadId: input.waitBarrier.parentThreadId,
      parentRunId: input.waitBarrier.parentRunId,
      dependencyMode: input.waitBarrier.dependencyMode,
      failurePolicy: input.waitBarrier.failurePolicy,
      childStatuses: input.childStatuses,
      resultValidation: input.resultValidation,
      resultArtifact: input.run.resultArtifact ?? null,
    },
  };
}

export function resolveSubagentFailedSpawnWaitBarrier(input: {
  store: SubagentFailedSpawnWaitBarrierStore;
  waitBarrier: SubagentWaitBarrierSummary;
  run: Pick<SubagentRunSummary, "id" | "status" | "resultArtifact">;
  resultValidation: unknown;
}): SubagentWaitBarrierSummary {
  if (input.waitBarrier.status !== "waiting_on_children") return input.waitBarrier;
  return input.store.updateSubagentWaitBarrierStatus(input.waitBarrier.id, "failed", {
    resolutionArtifact: buildSubagentFailedSpawnWaitBarrierResolutionArtifact({
      waitBarrier: input.waitBarrier,
      run: input.run,
      resultValidation: input.resultValidation,
    }),
  });
}

function failedSpawnTransitionReason(resultArtifact: unknown, resultValidation: unknown): string {
  const artifactSummary = recordValue(resultArtifact)?.summary;
  if (typeof artifactSummary === "string" && artifactSummary.trim()) return artifactSummary;
  const validationReason = recordValue(resultValidation)?.reason;
  if (typeof validationReason === "string" && validationReason.trim()) return validationReason;
  return "Sub-agent spawn failed before a synthesis-safe child result was available.";
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
