import { describe, expect, it, vi } from "vitest";

import { validateSubagentResultArtifactForSynthesis } from "../shared/subagentProtocol";
import type {
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../shared/types";
import {
  buildSubagentFailedSpawnWaitBarrierResolutionArtifact,
  resolveSubagentFailedSpawnWaitBarrier,
  SUBAGENT_FAILED_SPAWN_WAIT_BARRIER_SCHEMA_VERSION,
  type SubagentFailedSpawnWaitBarrierStore,
} from "./subagentFailedSpawnWaitBarrier";

describe("subagentFailedSpawnWaitBarrier", () => {
  it("marks waiting required barriers failed when a reserved child spawn fails", () => {
    const store = fakeStore();
    const run = failedRun();
    const resultValidation = validateSubagentResultArtifactForSynthesis(run.resultArtifact);
    const resolved = resolveSubagentFailedSpawnWaitBarrier({
      store,
      waitBarrier: waitBarrier({ status: "waiting_on_children" }),
      run,
      resultValidation,
    });

    expect(SUBAGENT_FAILED_SPAWN_WAIT_BARRIER_SCHEMA_VERSION)
      .toBe("ambient-subagent-failed-spawn-wait-barrier-v1");
    expect(store.updateSubagentWaitBarrierStatus).toHaveBeenCalledWith(
      "barrier-1",
      "failed",
      {
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: ["child-run"],
          childStatuses: [{ childRunId: "child-run", status: "failed" }],
          timedOut: false,
          synthesisAllowed: false,
          transitionEvidence: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "failed_spawn",
            source: "barrier_controller",
            childRunId: "child-run",
            childRunIds: ["child-run"],
            reason: "Sub-agent launch failed before model execution: capacity unavailable.",
            idempotencyKey: "failed-spawn:parent-run:barrier-1:child-run",
            details: expect.objectContaining({
              waitBarrierId: "barrier-1",
              parentThreadId: "parent-thread",
              parentRunId: "parent-run",
              dependencyMode: "required_all",
              failurePolicy: "ask_user",
              childStatuses: [{ childRunId: "child-run", status: "failed" }],
              resultValidation: expect.objectContaining({
                synthesisAllowed: false,
              }),
              resultArtifact: expect.objectContaining({
                runId: "child-run",
                status: "failed",
              }),
            }),
          }),
          resultValidation: expect.objectContaining({
            valid: true,
            synthesisAllowed: false,
            partial: false,
            status: "failed",
            reason: "Result artifact status is not safe for parent synthesis.",
          }),
          resultArtifact: expect.objectContaining({
            runId: "child-run",
            status: "failed",
            partial: false,
            childThreadId: "child-thread",
          }),
        },
      },
    );
    expect(resolved).toMatchObject({
      id: "barrier-1",
      status: "failed",
      resolutionArtifact: expect.objectContaining({
        childRunIds: ["child-run"],
        synthesisAllowed: false,
      }),
    });
  });

  it("leaves already resolved barriers unchanged and idempotent", () => {
    const store = fakeStore();
    const barrier = waitBarrier({ status: "failed" });
    const resolved = resolveSubagentFailedSpawnWaitBarrier({
      store,
      waitBarrier: barrier,
      run: failedRun(),
      resultValidation: { synthesisAllowed: false },
    });

    expect(resolved).toBe(barrier);
    expect(store.updateSubagentWaitBarrierStatus).not.toHaveBeenCalled();
  });

  it("builds a compact resolution artifact that never allows parent synthesis", () => {
    const run = failedRun({ omitResultArtifact: true });
    expect(buildSubagentFailedSpawnWaitBarrierResolutionArtifact({
      waitBarrier: waitBarrier({ status: "waiting_on_children" }),
      run,
      resultValidation: { valid: false, reason: "missing artifact" },
    })).toMatchObject({
      schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
      childRunIds: ["child-run"],
      childStatuses: [{ childRunId: "child-run", status: "failed" }],
      timedOut: false,
      synthesisAllowed: false,
      transitionEvidence: expect.objectContaining({
        kind: "failed_spawn",
        source: "barrier_controller",
        reason: "missing artifact",
        details: expect.objectContaining({
          resultArtifact: null,
          resultValidation: { valid: false, reason: "missing artifact" },
        }),
      }),
      resultValidation: { valid: false, reason: "missing artifact" },
      resultArtifact: null,
    });
  });
});

function fakeStore(): SubagentFailedSpawnWaitBarrierStore & {
  updateSubagentWaitBarrierStatus: ReturnType<typeof vi.fn>;
} {
  const updateSubagentWaitBarrierStatus = vi.fn((id, status, options): SubagentWaitBarrierSummary => ({
    ...waitBarrier({ status }),
    id,
    resolvedAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...(options?.resolutionArtifact ? { resolutionArtifact: options.resolutionArtifact } : {}),
  }));
  return { updateSubagentWaitBarrierStatus };
}

function failedRun(input: { omitResultArtifact?: boolean; resultArtifact?: unknown } = {}): Pick<SubagentRunSummary, "id" | "status" | "resultArtifact"> {
  const run: Pick<SubagentRunSummary, "id" | "status" | "resultArtifact"> = {
    id: "child-run",
    status: "failed",
  };
  if (input.omitResultArtifact) return run;
  return {
    ...run,
    resultArtifact: input.resultArtifact ?? {
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: "child-run",
      status: "failed",
      partial: false,
      summary: "Sub-agent launch failed before model execution: capacity unavailable.",
      childThreadId: "child-thread",
    },
  };
}

function waitBarrier(input: {
  status: SubagentWaitBarrierSummary["status"];
}): SubagentWaitBarrierSummary {
  return {
    id: "barrier-1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run"],
    dependencyMode: "required_all",
    status: input.status,
    failurePolicy: "ask_user",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
  };
}
