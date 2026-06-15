import type {
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../shared/types";

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
  resultValidation: unknown;
  resultArtifact: unknown;
}

export function buildSubagentFailedSpawnWaitBarrierResolutionArtifact(input: {
  run: Pick<SubagentRunSummary, "id" | "status" | "resultArtifact">;
  resultValidation: unknown;
}): SubagentFailedSpawnWaitBarrierResolutionArtifact {
  return {
    schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
    childRunIds: [input.run.id],
    childStatuses: [{ childRunId: input.run.id, status: input.run.status }],
    timedOut: false,
    synthesisAllowed: false,
    resultValidation: input.resultValidation,
    resultArtifact: input.run.resultArtifact ?? null,
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
      run: input.run,
      resultValidation: input.resultValidation,
    }),
  });
}
