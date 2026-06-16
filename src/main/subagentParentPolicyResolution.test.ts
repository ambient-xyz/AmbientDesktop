import { describe, expect, it } from "vitest";
import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../shared/types";
import {
  allowedUserChoicesForSubagentWaitBarrier,
  explicitSubagentBarrierUserDecision,
  resolveSubagentParentPolicyForBarrierDecision,
  resolveSubagentParentPolicyForWait,
  SUBAGENT_PARENT_POLICY_RESOLUTION_SCHEMA_VERSION,
} from "./subagentParentPolicyResolution";

describe("subagentParentPolicyResolution", () => {
  it("blocks parent synthesis while a required child barrier is still waiting", () => {
    const resolution = resolveSubagentParentPolicyForWait({
      run: run({ status: "running" }),
      waitBarrier: barrier({ status: "waiting_on_children", failurePolicy: "ask_user" }),
      waitTimedOut: false,
      synthesisAllowed: false,
      partial: false,
      validationReason: "No synthesis-safe child result yet.",
    });

    expect(resolution).toMatchObject({
      schemaVersion: SUBAGENT_PARENT_POLICY_RESOLUTION_SCHEMA_VERSION,
      status: "blocked",
      action: "wait_for_child",
      canSynthesize: false,
      requiresUserInput: false,
      requiresExplicitPartial: false,
      reason: "No synthesis-safe child result yet.",
      instruction: expect.stringContaining("Do not synthesize child work"),
    });
    expect(allowedUserChoicesForSubagentWaitBarrier(resolution)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "wait_again", toolAction: "wait_agent" }),
      expect.objectContaining({ id: "cancel_parent", decision: "cancel_parent" }),
    ]));
  });

  it("allows synthesis from a completed synthesis-safe child result", () => {
    const resolution = resolveSubagentParentPolicyForWait({
      run: run({ status: "completed" }),
      waitBarrier: barrier({ status: "satisfied" }),
      waitTimedOut: false,
      synthesisAllowed: true,
      partial: false,
    });

    expect(resolution).toMatchObject({
      status: "ready",
      action: "synthesize",
      canSynthesize: true,
      requiresExplicitPartial: false,
      reason: "Child produced a schema-valid completed result artifact.",
      instruction: expect.stringContaining("structuredEvidence"),
    });
  });

  it("requires explicit recovery decisions for terminal timed-out barriers", () => {
    const resolution = resolveSubagentParentPolicyForWait({
      run: run({ status: "running" }),
      waitBarrier: barrier({ status: "timed_out", failurePolicy: "ask_user" }),
      waitTimedOut: true,
      synthesisAllowed: false,
      partial: false,
      validationReason: "Child is still running.",
    });

    expect(resolution).toMatchObject({
      status: "blocked",
      action: "ask_user",
      canSynthesize: false,
      requiresUserInput: true,
      reason: "Child wait timed out before producing a synthesis-safe result.",
    });
    expect(allowedUserChoicesForSubagentWaitBarrier(resolution)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "retry_child", toolAction: "resolve_barrier", decision: "retry_child" }),
      expect.objectContaining({ id: "fail_parent", toolAction: "resolve_barrier", decision: "fail_parent" }),
    ]));
  });

  it("marks schema-valid partial child results as explicit partial synthesis only", () => {
    const resolution = resolveSubagentParentPolicyForWait({
      run: run({ status: "aborted_partial" }),
      waitBarrier: barrier({ status: "satisfied", failurePolicy: "degrade_partial" }),
      waitTimedOut: false,
      synthesisAllowed: true,
      partial: true,
    });

    expect(resolution).toMatchObject({
      status: "ready",
      action: "continue_with_explicit_partial",
      canSynthesize: true,
      requiresExplicitPartial: true,
      instruction: expect.stringContaining("label the child result as partial"),
    });
    expect(resolution.instruction).toContain("structuredRisks");
  });

  it("requires user input before degrading a failed required barrier to partial", () => {
    const resolution = resolveSubagentParentPolicyForWait({
      run: run({ status: "failed" }),
      waitBarrier: barrier({ status: "failed", failurePolicy: "degrade_partial" }),
      waitTimedOut: false,
      synthesisAllowed: false,
      partial: false,
      validationReason: "Failed child has no explicit partial artifact.",
    });

    expect(resolution).toMatchObject({
      status: "blocked",
      action: "ask_user",
      canSynthesize: false,
      requiresUserInput: true,
      requiresExplicitPartial: true,
      reason: "Failed child has no explicit partial artifact.",
    });
    expect(allowedUserChoicesForSubagentWaitBarrier(resolution)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "continue_with_partial",
        requiresUserDecision: true,
        requiresPartialSummary: true,
      }),
      expect.objectContaining({ id: "retry_child", decision: "retry_child" }),
      expect.objectContaining({ id: "detach_child", decision: "detach_child" }),
    ]));
  });

  it("honors persisted explicit partial decisions on satisfied barriers", () => {
    const waitBarrier = barrier({
      status: "satisfied",
      failurePolicy: "degrade_partial",
      resolutionArtifact: {
        schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
        synthesisAllowed: true,
        explicitPartial: true,
        userDecision: {
          schemaVersion: "ambient-subagent-user-decision-v1",
          decision: "continue_with_partial",
        },
      },
    });

    expect(explicitSubagentBarrierUserDecision(waitBarrier)).toEqual({
      decision: "continue_with_partial",
      synthesisAllowed: true,
      explicitPartial: true,
    });
    expect(resolveSubagentParentPolicyForWait({
      run: run({ status: "failed" }),
      waitBarrier,
      waitTimedOut: false,
      synthesisAllowed: false,
      partial: false,
    })).toMatchObject({
      status: "ready",
      action: "continue_with_explicit_partial",
      canSynthesize: true,
      requiresExplicitPartial: true,
      reason: "User explicitly approved continuing with a partial parent answer for this barrier.",
    });
  });

  it("keeps detach and cancel barrier decisions blocked and non-synthesizing", () => {
    const childRuns = [run({ id: "child-a", status: "detached" })];
    const waitBarrier = barrier({ status: "failed", failurePolicy: "ask_user" });

    expect(resolveSubagentParentPolicyForBarrierDecision(waitBarrier, childRuns, "detach_child")).toMatchObject({
      status: "blocked",
      action: "detach_child",
      canSynthesize: false,
      instruction: expect.stringContaining("Do not synthesize child work"),
    });
    expect(resolveSubagentParentPolicyForBarrierDecision(waitBarrier, childRuns, "cancel_parent")).toMatchObject({
      status: "blocked",
      action: "cancel_parent",
      canSynthesize: false,
      reason: "User chose to cancel the parent path while resolving this required child barrier.",
    });
  });
});

function run(overrides: {
  id?: string;
  status?: SubagentRunStatus;
} = {}): SubagentRunSummary {
  return {
    id: overrides.id ?? "child-run",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: "child-thread",
    canonicalTaskPath: "root/child:reviewer",
    roleId: "reviewer",
    dependencyMode: "required",
    status: overrides.status ?? "running",
  } as SubagentRunSummary;
}

function barrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    createdAt: "2026-06-05T12:00:00.000Z",
    updatedAt: "2026-06-05T12:00:00.000Z",
    ...overrides,
  };
}
