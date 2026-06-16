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
  SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION,
  SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
  type SubagentWaitBarrierTransitionEvidence,
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
    });
    const resolved = resolveSubagentWaitBarrierForRun({
      store,
      waitBarrier: waitingBarrier,
      run: store.getSubagentRun("child-complete"),
      evidence: childTerminalEvidence("child-complete", "completed"),
    });

    expect(SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION)
      .toBe("ambient-subagent-wait-barrier-resolution-v1");
    expect(SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION)
      .toBe("ambient-subagent-wait-barrier-transition-evidence-v1");
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

  it("rejects progress-return evidence as terminal barrier evidence", () => {
    const waitingBarrier = barrier({
      id: "barrier-progress",
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
      evidence: progressReturnEvidence("child-running"),
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
      evidence: childTerminalEvidence("child-failed", "failed"),
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
          transitionEvidence: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "child_terminal",
            source: "wait_agent",
            childRunId: "child-failed",
            reason: "failed",
          }),
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
        run({ id: "child-running", roleId: "explorer", status: "timed_out" }),
      ],
      waitBarriers: [waitingBarrier],
    });

    const resolved = resolveSubagentWaitBarrierForRun({
      store,
      waitBarrier: waitingBarrier,
      run: store.getSubagentRun("child-running"),
      evidence: childRuntimeTimeoutEvidence("child-running", "runtime_idle_timeout"),
    });

    expect(resolved).toMatchObject({
      id: "barrier-timeout",
      status: "timed_out",
      resolutionArtifact: expect.objectContaining({
        timedOut: true,
        transitionEvidence: expect.objectContaining({
          schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
          kind: "child_runtime_timeout",
          source: "child_runtime",
          childRunId: "child-running",
          reason: "runtime_idle_timeout",
          timeoutKind: "idle",
        }),
        synthesisAllowed: false,
        resultArtifact: null,
        waitBarrierEvaluation: expect.objectContaining({
          timedOut: true,
          runtimeTimeoutKind: "idle",
          terminalEvidence: {
            kind: "child_runtime_timeout",
            childRunId: "child-running",
            reason: "runtime_idle_timeout",
            timeoutKind: "idle",
          },
          activeChildRunIds: [],
          reason: "required_all barrier timed out with 0/1 synthesis-safe child results.",
        }),
      }),
    });
  });

  it("records hard-cap timeout kind and liveness details in durable barrier evidence", () => {
    const waitingBarrier = barrier({
      id: "barrier-hard-cap",
      childRunIds: ["child-hard-cap"],
      dependencyMode: "required_all",
      status: "waiting_on_children",
    });
    const store = fakeStore({
      runs: [
        run({ id: "child-hard-cap", roleId: "explorer", status: "failed" }),
      ],
      waitBarriers: [waitingBarrier],
    });

    const resolved = resolveSubagentWaitBarrierForRun({
      store,
      waitBarrier: waitingBarrier,
      run: store.getSubagentRun("child-hard-cap"),
      evidence: childRuntimeTimeoutEvidence("child-hard-cap", "runtime_hard_cap_exceeded", {
        childHardElapsedMs: 600_000,
        childHardTimeoutMs: 600_000,
        childIdleElapsedMs: 1_000,
        lastChildActivityAt: "2026-06-06T00:09:59.000Z",
        lastChildActivitySource: "message:assistant",
      }),
    });

    expect(resolved).toMatchObject({
      id: "barrier-hard-cap",
      status: "timed_out",
      resolutionArtifact: expect.objectContaining({
        timedOut: true,
        transitionEvidence: expect.objectContaining({
          kind: "child_runtime_timeout",
          source: "child_runtime",
          childRunId: "child-hard-cap",
          reason: "runtime_hard_cap_exceeded",
          timeoutKind: "hard_cap",
          details: {
            childHardElapsedMs: 600_000,
            childHardTimeoutMs: 600_000,
            childIdleElapsedMs: 1_000,
            lastChildActivityAt: "2026-06-06T00:09:59.000Z",
            lastChildActivitySource: "message:assistant",
          },
        }),
        waitBarrierEvaluation: expect.objectContaining({
          timedOut: true,
          runtimeTimeoutKind: "hard_cap",
          terminalEvidence: {
            kind: "child_runtime_timeout",
            childRunId: "child-hard-cap",
            reason: "runtime_hard_cap_exceeded",
            timeoutKind: "hard_cap",
            details: {
              childHardElapsedMs: 600_000,
              childHardTimeoutMs: 600_000,
              childIdleElapsedMs: 1_000,
              lastChildActivityAt: "2026-06-06T00:09:59.000Z",
              lastChildActivitySource: "message:assistant",
            },
          },
          activeChildRunIds: [],
          reason: "required_all barrier timed out with 0/1 synthesis-safe child results.",
        }),
      }),
    });
  });

  it("keeps aggregate barriers waiting when one child timeout still leaves enough active potential", () => {
    const waitingBarrier = barrier({
      id: "barrier-any-timeout",
      childRunIds: ["child-timeout", "child-running"],
      dependencyMode: "required_any",
      status: "waiting_on_children",
    });
    const store = fakeStore({
      runs: [
        run({ id: "child-timeout", roleId: "explorer", status: "timed_out" }),
        run({ id: "child-running", roleId: "explorer", status: "running" }),
      ],
      waitBarriers: [waitingBarrier],
    });

    const resolved = resolveSubagentWaitBarrierForRun({
      store,
      waitBarrier: waitingBarrier,
      run: store.getSubagentRun("child-timeout"),
      evidence: childRuntimeTimeoutEvidence("child-timeout", "runtime_idle_timeout"),
    });

    expect(resolved).toBe(waitingBarrier);
    expect(store.updateSubagentWaitBarrierStatus).not.toHaveBeenCalled();
    expect(evaluateSubagentWaitBarrierForStore({
      store,
      waitBarrier: waitingBarrier,
      terminalEvidence: {
        kind: "child_runtime_timeout",
        childRunId: "child-timeout",
        reason: "runtime_idle_timeout",
        timeoutKind: "idle",
      },
    })).toMatchObject({
      timedOut: true,
      runtimeTimeoutKind: "idle",
      terminalEvidence: {
        kind: "child_runtime_timeout",
        childRunId: "child-timeout",
        reason: "runtime_idle_timeout",
        timeoutKind: "idle",
      },
      requiredSynthesisCount: 1,
      potentialSynthesisCount: 1,
      impossible: false,
      activeChildRunIds: ["child-running"],
      terminalUnsafeChildRunIds: ["child-timeout"],
      reason: "required_any barrier recorded child timeout evidence but is still waiting for child work; 0/1 synthesis-safe results are available and 1 child run may still finish.",
    });
  });

  it("does not reopen timed-out barriers when late child results become synthesis-safe", () => {
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

    const resolved = resolveSubagentWaitBarrierForRun({
      store,
      waitBarrier: timedOutBarrier,
      run: store.getSubagentRun("child-complete"),
      evidence: childTerminalEvidence("child-complete", "completed"),
    });

    expect(resolved).toBe(timedOutBarrier);
    expect(store.updateSubagentWaitBarrierStatus).not.toHaveBeenCalled();
  });

  it("does not satisfy aggregate barriers by inheriting a sibling partial decision", () => {
    const waitingAggregate = barrier({
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
      waitBarriers: [waitingAggregate, explicitPartial],
    });

    const resolved = resolveSubagentWaitBarrierForRun({
      store,
      waitBarrier: waitingAggregate,
      run: store.getSubagentRun("judge-complete"),
      evidence: childTerminalEvidence("judge-complete", "completed"),
    });

    expect(store.updateSubagentWaitBarrierStatus).toHaveBeenCalledWith(
      "barrier-aggregate",
      "failed",
      {
        resolutionArtifact: expect.objectContaining({
          synthesisAllowed: false,
          transitionEvidence: expect.objectContaining({
            kind: "child_terminal",
            source: "wait_agent",
            childRunId: "judge-complete",
          }),
          waitBarrierEvaluation: expect.objectContaining({
            synthesisAllowed: false,
            impossible: true,
            terminalUnsafeChildRunIds: ["feedback-failed"],
          }),
        }),
      },
    );
    expect(resolved).toMatchObject({
      id: "barrier-aggregate",
      status: "failed",
      resolutionArtifact: expect.not.objectContaining({
        explicitPartial: true,
        partialInheritedFromWaitBarrierIds: expect.any(Array),
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
      evidence: childTerminalEvidence("child-failed", "failed"),
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

function progressReturnEvidence(childRunId: string): SubagentWaitBarrierTransitionEvidence {
  return {
    schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
    kind: "progress_return",
    source: "parent_wait_session",
    childRunId,
    reason: "parent_wait_window_elapsed",
  };
}

function childTerminalEvidence(
  childRunId: string,
  reason: SubagentRunSummary["status"],
): SubagentWaitBarrierTransitionEvidence {
  return {
    schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
    kind: "child_terminal",
    source: "wait_agent",
    childRunId,
    reason,
  };
}

function childRuntimeTimeoutEvidence(
  childRunId: string,
  reason: string,
  details?: Record<string, unknown>,
): SubagentWaitBarrierTransitionEvidence {
  return {
    schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
    kind: "child_runtime_timeout",
    source: "child_runtime",
    childRunId,
    reason,
    timeoutKind: reason === "runtime_hard_cap_exceeded"
      ? "hard_cap"
      : reason === "runtime_idle_timeout"
        ? "idle"
        : "unknown",
    ...(details ? { details } : {}),
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
