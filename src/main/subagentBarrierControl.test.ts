import { describe, expect, it } from "vitest";
import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type { SubagentRunSummary } from "../shared/types";
import {
  buildSubagentBarrierCancelledMailboxPayload,
  buildSubagentBarrierControlPlan,
  buildSubagentBarrierControlResultArtifact,
  buildSubagentBarrierControlRunPlan,
  buildSubagentBarrierRetryMailboxPayload,
  shouldMarkSubagentBarrierControlRunStatus,
  subagentBarrierControlResultSummary,
  SUBAGENT_BARRIER_CANCEL_PARENT_SOURCE,
  SUBAGENT_BARRIER_RETRY_CHILD_SOURCE,
} from "./subagentBarrierControl";

describe("subagentBarrierControl", () => {
  it("does not apply control plans for fail or explicit partial decisions", () => {
    for (const decision of ["fail_parent", "continue_with_partial"] as const) {
      const plan = buildSubagentBarrierControlPlan({
        childRuns: [run({ id: "child-a", status: "running" })],
        decision,
        idempotencyKey: `barrier:${decision}`,
      });

      expect(plan).toMatchObject({
        applies: false,
        decision,
        unchangedRunIds: [],
        retryCandidateRunIds: [],
        detachCandidateRunIds: [],
        cancelCandidateRunIds: [],
        runPlans: [expect.objectContaining({ runId: "child-a", action: "unchanged" })],
      });
    }
  });

  it("plans retry only for unsafe terminal child runs and preserves completed siblings", () => {
    const failedRun = run({ id: "failed-child", canonicalTaskPath: "root/0:reader", status: "failed" });
    const runPlan = buildSubagentBarrierControlRunPlan({
      run: failedRun,
      decision: "retry_child",
      userDecision: "Try the reader again.",
      idempotencyKey: "barrier:retry",
    });
    const replayPlan = buildSubagentBarrierControlRunPlan({
      run: failedRun,
      decision: "retry_child",
      userDecision: "Try the reader again.",
      idempotencyKey: "barrier:retry",
    });
    const plan = buildSubagentBarrierControlPlan({
      childRuns: [
        failedRun,
        run({ id: "done-child", status: "completed" }),
        run({ id: "attention-child", status: "needs_attention" }),
      ],
      decision: "retry_child",
      userDecision: "Try the reader again.",
      idempotencyKey: "barrier:retry",
    });

    expect(plan).toMatchObject({
      applies: true,
      unchangedRunIds: ["done-child", "attention-child"],
      retryCandidateRunIds: ["failed-child"],
      detachCandidateRunIds: [],
      cancelCandidateRunIds: [],
      runPlans: [
        expect.objectContaining({
          runId: "failed-child",
          action: "retry",
          resultSummary: expect.stringContaining("Try the reader again."),
          runtimeRetrySource: SUBAGENT_BARRIER_RETRY_CHILD_SOURCE,
        }),
        expect.objectContaining({ runId: "done-child", action: "unchanged" }),
        expect.objectContaining({ runId: "attention-child", action: "unchanged" }),
      ],
    });
    expect(runPlan.runtimeRetryIdempotencyKey).toBe(replayPlan.runtimeRetryIdempotencyKey);
    expect(runPlan.runtimeRetryIdempotencyKey).toContain("subagent:retry:");
    expect(buildSubagentBarrierRetryMailboxPayload({
      plan: runPlan,
      now: "2026-06-06T00:00:00.000Z",
    })).toMatchObject({
      schemaVersion: "ambient-subagent-barrier-retry-request-v1",
      status: "retry_requested",
      source: SUBAGENT_BARRIER_RETRY_CHILD_SOURCE,
      childThreadId: "failed-child-thread",
      childRunId: "failed-child",
      previousStatus: "failed",
      idempotencyKey: runPlan.runtimeRetryIdempotencyKey,
      message: expect.stringContaining("Preserve the failed attempt above"),
      requestedAt: "2026-06-06T00:00:00.000Z",
    });
  });

  it("plans detach only for non-terminal child runs and preserves terminal children", () => {
    const plan = buildSubagentBarrierControlPlan({
      childRuns: [
        run({ id: "active-child", status: "running" }),
        run({ id: "done-child", status: "completed" }),
      ],
      decision: "detach_child",
      userDecision: "Inspect this separately.",
      idempotencyKey: "barrier:detach",
    });

    expect(plan).toMatchObject({
      applies: true,
      unchangedRunIds: ["done-child"],
      retryCandidateRunIds: [],
      detachCandidateRunIds: ["active-child"],
      cancelCandidateRunIds: [],
      runPlans: [
        expect.objectContaining({
          runId: "active-child",
          action: "detach",
          targetStatus: "detached",
          resultSummary: "User detached this required child from the parent wait barrier. Inspect this separately.",
        }),
        expect.objectContaining({
          runId: "done-child",
          action: "unchanged",
          currentStatus: "completed",
        }),
      ],
    });
    expect(subagentBarrierControlResultSummary({
      decision: "detach_child",
      userDecision: "Inspect this separately.",
    })).toBe("User detached this required child from the parent wait barrier. Inspect this separately.");
  });

  it("plans cancel-parent runtime cancellation with stable idempotency and source metadata", () => {
    const runPlan = buildSubagentBarrierControlRunPlan({
      run: run({ id: "active-child", canonicalTaskPath: "root/0:reviewer", status: "waiting" }),
      decision: "cancel_parent",
      userDecision: "Stop waiting.",
      idempotencyKey: "barrier:cancel-parent",
    });
    const replayPlan = buildSubagentBarrierControlRunPlan({
      run: run({ id: "active-child", canonicalTaskPath: "root/0:reviewer", status: "waiting" }),
      decision: "cancel_parent",
      userDecision: "Stop waiting.",
      idempotencyKey: "barrier:cancel-parent",
    });

    expect(runPlan).toMatchObject({
      runId: "active-child",
      action: "cancel",
      targetStatus: "cancelled",
      resultSummary: "User cancelled the parent path while resolving this wait barrier. Stop waiting.",
      runtimeCancelSource: SUBAGENT_BARRIER_CANCEL_PARENT_SOURCE,
    });
    expect(runPlan.runtimeCancelIdempotencyKey).toBe(replayPlan.runtimeCancelIdempotencyKey);
    expect(runPlan.runtimeCancelIdempotencyKey).toContain("subagent:cancel:");
    expect(buildSubagentBarrierCancelledMailboxPayload({
      plan: runPlan,
      childThreadId: "child-thread",
    })).toEqual({
      status: "cancelled",
      reason: "User cancelled the parent path while resolving this wait barrier. Stop waiting.",
      source: SUBAGENT_BARRIER_CANCEL_PARENT_SOURCE,
      childThreadId: "child-thread",
    });
  });

  it("marks only active mismatched statuses after runtime cancellation returns", () => {
    const cancelPlan = buildSubagentBarrierControlRunPlan({
      run: run({ status: "running" }),
      decision: "cancel_parent",
      idempotencyKey: "barrier:cancel-parent",
    });
    const detachPlan = buildSubagentBarrierControlRunPlan({
      run: run({ status: "running" }),
      decision: "detach_child",
      idempotencyKey: "barrier:detach",
    });

    expect(shouldMarkSubagentBarrierControlRunStatus({ plan: cancelPlan, currentStatus: "running" })).toBe(true);
    expect(shouldMarkSubagentBarrierControlRunStatus({ plan: cancelPlan, currentStatus: "cancelled" })).toBe(false);
    expect(shouldMarkSubagentBarrierControlRunStatus({ plan: cancelPlan, currentStatus: "completed" })).toBe(false);
    expect(shouldMarkSubagentBarrierControlRunStatus({ plan: detachPlan, currentStatus: "running" })).toBe(true);
    expect(shouldMarkSubagentBarrierControlRunStatus({ plan: detachPlan, currentStatus: "detached" })).toBe(false);
  });

  it("builds result artifacts for detached and cancelled control outcomes", () => {
    const detachPlan = buildSubagentBarrierControlRunPlan({
      run: run({ id: "child-a", childThreadId: "thread-a" }),
      decision: "detach_child",
      userDecision: "Let it continue separately.",
      idempotencyKey: "barrier:detach",
    });
    const cancelPlan = buildSubagentBarrierControlRunPlan({
      run: run({ id: "child-b", childThreadId: "thread-b" }),
      decision: "cancel_parent",
      userDecision: "Stop this path.",
      idempotencyKey: "barrier:cancel",
    });

    expect(buildSubagentBarrierControlResultArtifact({ plan: detachPlan, status: "detached" })).toEqual({
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: "child-a",
      status: "detached",
      partial: false,
      summary: "User detached this required child from the parent wait barrier. Let it continue separately.",
      childThreadId: "thread-a",
    });
    expect(buildSubagentBarrierControlResultArtifact({ plan: cancelPlan, status: "cancelled" })).toEqual({
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: "child-b",
      status: "cancelled",
      partial: false,
      summary: "User cancelled the parent path while resolving this wait barrier. Stop this path.",
      childThreadId: "thread-b",
    });
  });
});

function run(overrides: {
  id?: string;
  childThreadId?: string;
  canonicalTaskPath?: string;
  status?: SubagentRunStatus;
} = {}): SubagentRunSummary {
  const id = overrides.id ?? "child-run";
  return {
    id,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: overrides.childThreadId ?? `${id}-thread`,
    canonicalTaskPath: overrides.canonicalTaskPath ?? `root/${id}:reviewer`,
    roleId: "reviewer",
    dependencyMode: "required",
    status: overrides.status ?? "running",
  } as SubagentRunSummary;
}
