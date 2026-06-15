import { describe, expect, it, vi } from "vitest";

import {
  AMBIENT_DEFAULT_MODEL,
  createAmbientModelRuntimeSnapshot,
  resolveAmbientModelRuntimeProfile,
} from "../shared/ambientModels";
import { resolveSubagentCapacityLease } from "../shared/subagentCapacity";
import { resolveAmbientFeatureFlags } from "../shared/featureFlags";
import { getDefaultSubagentRoleProfile, type SubagentRoleId } from "../shared/subagentRoles";
import type {
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../shared/types";
import { subagentStructuredResultTemplate } from "./subagentStructuredOutput";
import {
  evaluateSubagentWaitBarrierForStore,
  resolveActiveSubagentWaitBarriersForRun,
  resolveSubagentWaitBarrierForRun,
  satisfySubagentWaitBarrierIfCurrentResultsAllowSynthesis,
  SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION,
  type SubagentWaitBarrierResolutionStore,
} from "./subagentWaitBarrierResolution";

describe("subagentWaitBarrierResolution", () => {
  it("keeps required barriers waiting while active children can still finish", () => {
    const waitingBarrier = barrier({
      id: "barrier-required",
      childRunIds: ["child-complete", "child-running"],
      dependencyMode: "required_all",
      status: "waiting_on_children",
    });
    const store = fakeStore({
      runs: [
        run({ id: "child-complete", roleId: "explorer", status: "completed", resultArtifact: completedArtifact("child-complete") }),
        run({ id: "child-running", roleId: "explorer", status: "running" }),
      ],
      waitBarriers: [waitingBarrier],
    });

    const evaluation = evaluateSubagentWaitBarrierForStore({
      store,
      waitBarrier: waitingBarrier,
      timedOut: false,
    });
    const resolved = resolveSubagentWaitBarrierForRun({
      store,
      waitBarrier: waitingBarrier,
      run: store.getSubagentRun("child-complete"),
      timedOut: false,
    });

    expect(SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION)
      .toBe("ambient-subagent-wait-barrier-resolution-v1");
    expect(evaluation).toMatchObject({
      waitBarrierId: "barrier-required",
      requiredSynthesisCount: 2,
      validSynthesisCount: 1,
      potentialSynthesisCount: 2,
      synthesisAllowed: false,
      activeChildRunIds: ["child-running"],
      reason: "required_all barrier is still waiting for child work; 1/2 synthesis-safe results are available and 1 child run may still finish.",
    });
    expect(resolved).toBe(waitingBarrier);
    expect(store.updateSubagentWaitBarrierStatus).not.toHaveBeenCalled();
  });

  it("fails required barriers when terminal unsafe children make synthesis impossible", () => {
    const waitingBarrier = barrier({
      id: "barrier-failed",
      childRunIds: ["child-failed"],
      dependencyMode: "required_all",
      status: "waiting_on_children",
    });
    const store = fakeStore({
      runs: [
        run({ id: "child-failed", roleId: "explorer", status: "failed", resultArtifact: failedArtifact("child-failed") }),
      ],
      waitBarriers: [waitingBarrier],
    });

    const resolved = resolveSubagentWaitBarrierForRun({
      store,
      waitBarrier: waitingBarrier,
      run: store.getSubagentRun("child-failed"),
      timedOut: false,
    });

    expect(store.updateSubagentWaitBarrierStatus).toHaveBeenCalledWith(
      "barrier-failed",
      "failed",
      {
        resolutionArtifact: expect.objectContaining({
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: ["child-failed"],
          childStatuses: [{ childRunId: "child-failed", status: "failed" }],
          timedOut: false,
          synthesisAllowed: false,
          waitBarrierEvaluation: expect.objectContaining({
            impossible: true,
            terminalUnsafeChildRunIds: ["child-failed"],
          }),
          resultValidation: expect.objectContaining({
            status: "failed",
            synthesisAllowed: false,
            reason: "Result artifact status is not safe for parent synthesis.",
          }),
          resultArtifact: expect.objectContaining({
            runId: "child-failed",
            status: "failed",
          }),
        }),
      },
    );
    expect(resolved).toMatchObject({
      id: "barrier-failed",
      status: "failed",
      resolutionArtifact: expect.objectContaining({
        synthesisAllowed: false,
      }),
    });
  });

  it("marks active barriers timed out without fabricating child output", () => {
    const waitingBarrier = barrier({
      id: "barrier-timeout",
      childRunIds: ["child-running"],
      dependencyMode: "required_all",
      status: "waiting_on_children",
    });
    const store = fakeStore({
      runs: [
        run({ id: "child-running", roleId: "explorer", status: "running" }),
      ],
      waitBarriers: [waitingBarrier],
    });

    const resolved = resolveSubagentWaitBarrierForRun({
      store,
      waitBarrier: waitingBarrier,
      run: store.getSubagentRun("child-running"),
      timedOut: true,
    });

    expect(resolved).toMatchObject({
      id: "barrier-timeout",
      status: "timed_out",
      resolutionArtifact: expect.objectContaining({
        timedOut: true,
        synthesisAllowed: false,
        resultArtifact: null,
        waitBarrierEvaluation: expect.objectContaining({
          timedOut: true,
          activeChildRunIds: ["child-running"],
          reason: "required_all barrier timed out with 0/1 synthesis-safe child results.",
        }),
      }),
    });
  });

  it("satisfies stale timed-out barriers once child results become synthesis-safe", () => {
    const timedOutBarrier = barrier({
      id: "barrier-late-result",
      childRunIds: ["child-complete"],
      dependencyMode: "required_all",
      status: "timed_out",
    });
    const store = fakeStore({
      runs: [
        run({ id: "child-complete", roleId: "explorer", status: "completed", resultArtifact: completedArtifact("child-complete") }),
      ],
      waitBarriers: [timedOutBarrier],
    });

    const resolved = satisfySubagentWaitBarrierIfCurrentResultsAllowSynthesis({
      store,
      waitBarrier: timedOutBarrier,
    });

    expect(store.updateSubagentWaitBarrierStatus).toHaveBeenCalledWith(
      "barrier-late-result",
      "satisfied",
      {
        resolutionArtifact: expect.objectContaining({
          timedOut: true,
          synthesisAllowed: true,
          waitBarrierEvaluation: expect.objectContaining({
            synthesisAllowed: true,
            validSynthesisCount: 1,
          }),
          resultArtifact: expect.objectContaining({
            runId: "child-complete",
            status: "completed",
          }),
        }),
      },
    );
    expect(resolved).toMatchObject({
      id: "barrier-late-result",
      status: "satisfied",
    });
  });

  it("satisfies stale aggregate barriers from explicit partial child decisions", () => {
    const aggregate = barrier({
      id: "barrier-aggregate",
      childRunIds: ["judge-complete", "feedback-failed"],
      dependencyMode: "required_all",
      status: "waiting_on_children",
    });
    const explicitPartial = barrier({
      id: "barrier-feedback-partial",
      childRunIds: ["feedback-failed"],
      dependencyMode: "required_all",
      status: "satisfied",
      resolutionArtifact: {
        schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
        childRunIds: ["feedback-failed"],
        childStatuses: [{ childRunId: "feedback-failed", status: "failed" }],
        synthesisAllowed: true,
        explicitPartial: true,
        resultArtifact: null,
        userDecision: {
          schemaVersion: "ambient-subagent-user-decision-v1",
          decision: "continue_with_partial",
          userDecision: "Continue with partial result after stop condition.",
          partialSummary: "Feedback child failed after the judge already triggered the plateau stop.",
          decidedAt: "2026-06-06T00:00:30.000Z",
          toolCallId: "tool-partial",
          idempotencyKey: "barrier:partial",
        },
      },
    });
    const store = fakeStore({
      runs: [
        run({ id: "judge-complete", roleId: "explorer", status: "completed", resultArtifact: completedArtifact("judge-complete") }),
        run({ id: "feedback-failed", roleId: "reviewer", status: "failed", resultArtifact: failedArtifact("feedback-failed") }),
      ],
      waitBarriers: [aggregate, explicitPartial],
    });

    const resolved = satisfySubagentWaitBarrierIfCurrentResultsAllowSynthesis({
      store,
      waitBarrier: aggregate,
    });

    expect(store.updateSubagentWaitBarrierStatus).toHaveBeenCalledWith(
      "barrier-aggregate",
      "satisfied",
      {
        resolutionArtifact: expect.objectContaining({
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          synthesisAllowed: true,
          explicitPartial: true,
          partialInheritedFromWaitBarrierIds: ["barrier-feedback-partial"],
          partialInheritedUnsafeChildRunIds: ["feedback-failed"],
          childStatuses: [
            { childRunId: "judge-complete", status: "completed" },
            { childRunId: "feedback-failed", status: "failed" },
          ],
          waitBarrierEvaluation: expect.objectContaining({
            synthesisAllowed: false,
            impossible: true,
            terminalUnsafeChildRunIds: ["feedback-failed"],
          }),
          userDecision: expect.objectContaining({
            decision: "continue_with_partial",
            partialSummary: "Feedback child failed after the judge already triggered the plateau stop.",
          }),
        }),
      },
    );
    expect(resolved).toMatchObject({
      id: "barrier-aggregate",
      status: "satisfied",
      resolutionArtifact: expect.objectContaining({
        explicitPartial: true,
      }),
    });
  });

  it("resolves only active wait barriers that include the child run", () => {
    const active = barrier({
      id: "barrier-active",
      childRunIds: ["child-failed"],
      dependencyMode: "required_all",
      status: "waiting_on_children",
    });
    const alreadyFailed = barrier({
      id: "barrier-existing-failed",
      childRunIds: ["child-failed"],
      dependencyMode: "required_all",
      status: "failed",
    });
    const unrelated = barrier({
      id: "barrier-unrelated",
      childRunIds: ["other-child"],
      dependencyMode: "required_all",
      status: "waiting_on_children",
    });
    const store = fakeStore({
      runs: [
        run({ id: "child-failed", roleId: "explorer", status: "failed", resultArtifact: failedArtifact("child-failed") }),
        run({ id: "other-child", roleId: "explorer", status: "running" }),
      ],
      waitBarriers: [active, alreadyFailed, unrelated],
    });

    expect(resolveActiveSubagentWaitBarriersForRun({
      store,
      run: store.getSubagentRun("child-failed"),
      timedOut: false,
    })).toEqual([
      expect.objectContaining({ id: "barrier-active", status: "failed" }),
    ]);
    expect(store.updateSubagentWaitBarrierStatus).toHaveBeenCalledTimes(1);
  });
});

function fakeStore(input: {
  runs: SubagentRunSummary[];
  waitBarriers: SubagentWaitBarrierSummary[];
}): SubagentWaitBarrierResolutionStore & {
  updateSubagentWaitBarrierStatus: ReturnType<typeof vi.fn>;
} {
  const runs = new Map(input.runs.map((candidate) => [candidate.id, candidate]));
  const waitBarriers = new Map(input.waitBarriers.map((candidate) => [candidate.id, candidate]));
  const updateSubagentWaitBarrierStatus = vi.fn((id, status, options): SubagentWaitBarrierSummary => {
    const current = waitBarriers.get(id);
    if (!current) throw new Error(`Unknown wait barrier: ${id}`);
    const updated: SubagentWaitBarrierSummary = {
      ...current,
      status,
      updatedAt: "2026-06-06T00:01:00.000Z",
      ...(status !== "waiting_on_children" ? { resolvedAt: "2026-06-06T00:01:00.000Z" } : {}),
      ...(options?.resolutionArtifact ? { resolutionArtifact: options.resolutionArtifact } : {}),
    };
    waitBarriers.set(id, updated);
    return updated;
  });
  return {
    getSubagentRun(runId) {
      const childRun = runs.get(runId);
      if (!childRun) throw new Error(`Unknown child run: ${runId}`);
      return childRun;
    },
    listSubagentRunEvents() {
      return [];
    },
    listSubagentWaitBarriersForParentRun(parentRunId) {
      return [...waitBarriers.values()].filter((candidate) => candidate.parentRunId === parentRunId);
    },
    updateSubagentWaitBarrierStatus,
  };
}

function run(input: {
  id: string;
  roleId: SubagentRoleId;
  status: SubagentRunSummary["status"];
  resultArtifact?: unknown;
}): SubagentRunSummary {
  const role = getDefaultSubagentRoleProfile(input.roleId);
  const model = resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL);
  return {
    id: input.id,
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "assistant-message",
    childThreadId: `${input.id}-thread`,
    canonicalTaskPath: `root/0:${input.roleId}`,
    roleId: input.roleId,
    roleProfileSnapshot: role,
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: input.status,
    featureFlagSnapshot: resolveAmbientFeatureFlags({ settings: { subagents: true } }),
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(AMBIENT_DEFAULT_MODEL, "2026-06-06T00:00:00.000Z"),
    capacityLeaseSnapshot: resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: `root/0:${input.roleId}`,
      roleId: input.roleId,
      model,
      now: "2026-06-06T00:00:00.000Z",
    }),
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...(input.resultArtifact ? { resultArtifact: input.resultArtifact } : {}),
  };
}

function completedArtifact(runId: string): Record<string, unknown> {
  const structuredOutput = {
    ...subagentStructuredResultTemplate(getDefaultSubagentRoleProfile("explorer")),
    roleId: "explorer",
    status: "complete",
    summary: "Mapped the requested context.",
    evidence: ["src/main/example.ts"],
    artifacts: [],
    risks: [],
    nextActions: [],
    roleOutput: {
      findings: [{ summary: "Found the relevant file.", provenance: ["src/main/example.ts"] }],
      openQuestions: [],
    },
  };
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId,
    status: "completed",
    partial: false,
    summary: "Mapped the requested context.",
    childThreadId: `${runId}-thread`,
    structuredOutput,
  };
}

function failedArtifact(runId: string): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId,
    status: "failed",
    partial: false,
    summary: "Sub-agent launch failed before model execution: capacity unavailable.",
    childThreadId: `${runId}-thread`,
  };
}

function barrier(input: {
  id: string;
  childRunIds: string[];
  dependencyMode: SubagentWaitBarrierSummary["dependencyMode"];
  status: SubagentWaitBarrierSummary["status"];
  resolutionArtifact?: unknown;
}): SubagentWaitBarrierSummary {
  return {
    id: input.id,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: input.childRunIds,
    dependencyMode: input.dependencyMode,
    status: input.status,
    failurePolicy: "ask_user",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...(input.resolutionArtifact ? { resolutionArtifact: input.resolutionArtifact } : {}),
  };
}
