import { describe, expect, it } from "vitest";
import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import {
  buildSubagentChildDecisionRequest,
  subagentChildDecisionOptionLabel,
  subagentChildDecisionReason,
  subagentChildDecisionRequestId,
  shouldBuildSubagentChildDecisionRequest,
} from "../../shared/subagentChildDecisionRequests";
import {
  buildSubagentBarrierDecisionResolutionArtifact,
  resolveSubagentBarrierDecisionWaitBarrier,
} from "./subagentBarrierDecision";
import {
  buildSubagentParentControlBarrierReconciliationArtifact,
} from "./subagentParentControlBarrierReconciliation";

describe("subagentChildDecisionRequest", () => {
  it("sym-barrier-decision-replay maps previous wait failures to durable Symphony decisions", () => {
    const cases = [
      {
        name: "failed child",
        barrier: barrier({ status: "failed", failurePolicy: "ask_user" }),
        runs: [run({ status: "failed" })],
        reason: "failed",
        recommendedOption: "retry_child",
        options: ["retry_child", "cancel_group", "exit_symphony_mode"],
      },
      {
        name: "timed-out child",
        barrier: barrier({ status: "timed_out", failurePolicy: "degrade_partial" }),
        runs: [run({ status: "timed_out" })],
        reason: "timed_out",
        recommendedOption: "retry_child",
        options: ["retry_child", "accept_partial", "cancel_group", "exit_symphony_mode"],
      },
      {
        name: "cancelled child",
        barrier: barrier({ status: "cancelled", failurePolicy: "ask_user" }),
        runs: [run({ status: "cancelled" })],
        reason: "cancelled",
        recommendedOption: "cancel_group",
        options: ["retry_child", "cancel_group", "exit_symphony_mode"],
      },
      {
        name: "needs attention",
        barrier: barrier({ status: "waiting_on_children", failurePolicy: "ask_user" }),
        runs: [run({ status: "needs_attention" })],
        reason: "needs_approval",
        recommendedOption: "exit_symphony_mode",
        options: ["cancel_group", "exit_symphony_mode"],
      },
      {
        name: "tool scope denial",
        barrier: barrier({
          status: "failed",
          resolutionArtifact: {
            toolScopeSnapshot: {
              failureStage: "tool_scope",
              deniedTools: [{ source: "browser", id: "interactive_browser" }],
            },
          },
        }),
        runs: [run({ status: "failed" })],
        reason: "tool_scope_denied",
        recommendedOption: "retry_child",
        options: ["retry_child", "cancel_group", "exit_symphony_mode"],
      },
      {
        name: "captcha attention",
        barrier: barrier({
          status: "failed",
          resolutionArtifact: {
            transitionEvidence: {
              reason: "Google requested a CAPTCHA / unusual-traffic verification.",
            },
          },
        }),
        runs: [run({ status: "failed" })],
        reason: "captcha_blocked",
        recommendedOption: "retry_child",
        options: ["retry_child", "cancel_group", "exit_symphony_mode"],
      },
    ] as const;

    for (const replayCase of cases) {
      const request = buildSubagentChildDecisionRequest({
        barrier: replayCase.barrier,
        childRuns: replayCase.runs,
        parentResolution: {
          action: replayCase.name === "timed-out child" ? "ask_user" : "retry_child",
          requiresExplicitPartial: replayCase.name === "timed-out child",
        },
      });
      expect(request, replayCase.name).toMatchObject({
        schemaVersion: "ambient-symphony-child-decision-request-v1",
        requestId: subagentChildDecisionRequestId(replayCase.barrier),
        barrierId: "barrier-1",
        parentRunId: "parent-run",
        childRunIds: ["child-run"],
        reason: replayCase.reason,
        options: replayCase.options,
        recommendedOption: replayCase.recommendedOption,
        evidenceRefs: ["wait-barrier:barrier-1", "subagent-run:child-run"],
      });
    }
  });

  it("does not build a Symphony decision request for active wait/steer barriers", () => {
    expect(shouldBuildSubagentChildDecisionRequest({ action: "wait_for_child" })).toBe(false);
    expect(shouldBuildSubagentChildDecisionRequest({ action: "ask_user" })).toBe(true);
    expect(shouldBuildSubagentChildDecisionRequest({ action: "ask_user" }, { childRuns: [run({ status: "failed" })] })).toBe(false);
    expect(shouldBuildSubagentChildDecisionRequest({ action: "ask_user" }, {
      childRuns: [run({ status: "failed", symphonyLaunchContracts: symphonyLaunchContracts() })],
    })).toBe(true);
  });

  it("does not infer grant-scope recommendations from child-authored denial text", () => {
    const request = buildSubagentChildDecisionRequest({
      barrier: barrier({
        status: "failed",
        resolutionArtifact: {
          transitionEvidence: {
            reason: "Child wrote permission denied and approval required in its own prose.",
          },
        },
      }),
      childRuns: [run({
        status: "failed",
        resultArtifact: {
          summary: "The child says tool scope denied, permission denied, approval required.",
        },
      })],
      parentResolution: { action: "ask_user" },
    });

    expect(request.reason).toBe("failed");
    expect(request.options).not.toContain("grant_scope");
    expect(request.recommendedOption).toBe("retry_child");
  });

  it("does not infer grant-scope recommendations from nested child-authored denial fields", () => {
    const request = buildSubagentChildDecisionRequest({
      barrier: barrier({
        status: "failed",
        resolutionArtifact: {
          resultArtifact: {
            structuredOutput: {
              roleOutput: {
                deniedTools: [{ source: "browser", id: "interactive_browser" }],
                failureStage: "tool_scope",
              },
            },
          },
          resultValidation: {
            structuredOutputValidation: {
              parsed: {
                deniedCategories: [{ id: "browser.interactive" }],
              },
            },
          },
        },
      }),
      childRuns: [run({ status: "failed" })],
      parentResolution: { action: "ask_user" },
    });

    expect(request.reason).toBe("failed");
    expect(request.options).not.toContain("grant_scope");
    expect(request.recommendedOption).toBe("retry_child");
  });

  it("does not classify child-authored result artifact text as trusted captcha evidence", () => {
    const request = buildSubagentChildDecisionRequest({
      barrier: barrier({
        status: "failed",
        resolutionArtifact: {
          resultArtifact: {
            summary: "The child mentioned a captcha while describing a source, but no browser warning was recorded.",
          },
        },
      }),
      childRuns: [run({ status: "failed" })],
      parentResolution: { action: "ask_user" },
    });

    expect(request.reason).toBe("failed");
    expect(request.options).toContain("retry_child");
  });

  it("recommends accepting partial when a barrier already has an explicit partial decision", () => {
    const request = buildSubagentChildDecisionRequest({
      barrier: barrier({
        status: "satisfied",
        resolutionArtifact: {
          explicitPartial: true,
          synthesisAllowed: true,
        },
      }),
      childRuns: [run({ status: "failed" })],
      parentResolution: {
        action: "continue_with_explicit_partial",
        requiresExplicitPartial: true,
      },
    });

    expect(request.options).toEqual(["accept_partial", "cancel_group", "exit_symphony_mode"]);
    expect(request.recommendedOption).toBe("accept_partial");
  });

  it("keeps retry/grant paths blocked while explicit partial is the only synthesis-safe decision", () => {
    const waitBarrier = barrier({ status: "failed", failurePolicy: "degrade_partial" });
    const retryStore = {
      updateSubagentWaitBarrierStatus: (
        id: string,
        status: SubagentWaitBarrierSummary["status"],
        options?: { resolutionArtifact?: unknown; now?: string },
      ) => ({
        ...waitBarrier,
        id,
        status,
        updatedAt: options?.now ?? waitBarrier.updatedAt,
        resolutionArtifact: options?.resolutionArtifact,
      }),
    };

    const retry = resolveSubagentBarrierDecisionWaitBarrier({
      store: retryStore,
      barrier: waitBarrier,
      childRuns: [run({ status: "failed" })],
      decision: "retry_child",
      userDecision: "Grant/re-scope then retry the child with the same barrier.",
      now: "2026-06-17T00:00:00.000Z",
      toolCallId: "tool-retry",
      idempotencyKey: "barrier:retry",
    });
    expect(retry.barrier.status).toBe("waiting_on_children");
    expect(retry.resolutionArtifact).toMatchObject({
      synthesisAllowed: false,
      explicitPartial: false,
      retryRequestedRunIds: ["child-run"],
      userDecision: expect.objectContaining({ decision: "retry_child" }),
    });

    const partialArtifact = buildSubagentBarrierDecisionResolutionArtifact({
      barrier: waitBarrier,
      childRuns: [run({ status: "failed" })],
      decision: "continue_with_partial",
      userDecision: "User chose accept partial after inspecting child evidence.",
      partialSummary: "The child failed before producing verified evidence.",
      now: "2026-06-17T00:01:00.000Z",
      toolCallId: "tool-partial",
      idempotencyKey: "barrier:partial",
    });
    expect(partialArtifact).toMatchObject({
      synthesisAllowed: true,
      explicitPartial: true,
      userDecision: expect.objectContaining({
        decision: "continue_with_partial",
        partialSummary: "The child failed before producing verified evidence.",
      }),
    });
  });

  it("does not advertise retry when the parent barrier policy requires fail-parent handling", () => {
    const request = buildSubagentChildDecisionRequest({
      barrier: barrier({ status: "failed", failurePolicy: "fail_parent" }),
      childRuns: [run({ status: "failed" })],
      parentResolution: {
        action: "fail_parent",
        requiresExplicitPartial: false,
      },
    });

    expect(request).toMatchObject({
      reason: "failed",
      options: ["cancel_group", "exit_symphony_mode"],
      recommendedOption: "exit_symphony_mode",
    });
    expect(request.options).not.toContain("retry_child");
    expect(request.options).not.toContain("retry_with_verifier");
    expect(request.options).not.toContain("grant_scope");
    expect(request.options).not.toContain("accept_partial");
  });

  it("preserves parent cancellation barriers through restart reconciliation", () => {
    const waitBarrier = barrier({
      status: "cancelled",
      resolutionArtifact: {
        schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
        parentCancellationRequested: true,
        transitionEvidence: {
          schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
          kind: "child_cancelled",
          source: "barrier_controller",
        },
      },
    });

    expect(buildSubagentParentControlBarrierReconciliationArtifact({
      waitBarrier,
      source: "desktop_restart",
      now: "2026-06-17T00:02:00.000Z",
    })).toMatchObject({
      synthesisAllowed: false,
      parentCancellationRequested: true,
      parentControlReconciliation: expect.objectContaining({
        action: "cancel_parent",
        source: "desktop_restart",
        waitBarrierId: "barrier-1",
        childRunIds: ["child-run"],
      }),
    });
  });

  it("labels Symphony decision options with user-facing text", () => {
    expect(subagentChildDecisionReason({
      barrier: barrier({ status: "timed_out" }),
      childRuns: [run({ status: "timed_out" })],
    })).toBe("timed_out");
    expect(subagentChildDecisionOptionLabel("grant_scope")).toBe("Grant or re-scope child authority");
    expect(subagentChildDecisionOptionLabel("exit_symphony_mode")).toBe("Exit Symphony");
  });
});

function run(overrides: {
  id?: string;
  status?: SubagentRunStatus;
  resultArtifact?: unknown;
  symphonyLaunchContracts?: SubagentRunSummary["symphonyLaunchContracts"];
} = {}): SubagentRunSummary {
  const id = overrides.id ?? "child-run";
  return {
    id,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: "child-thread",
    canonicalTaskPath: "root/0:explorer",
    roleId: "explorer",
    dependencyMode: "required",
    status: overrides.status ?? "running",
    resultArtifact: overrides.resultArtifact,
    ...(overrides.symphonyLaunchContracts ? { symphonyLaunchContracts: overrides.symphonyLaunchContracts } : {}),
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
  } as SubagentRunSummary;
}

function symphonyLaunchContracts(): NonNullable<SubagentRunSummary["symphonyLaunchContracts"]> {
  return { schemaVersion: "ambient-symphony-child-launch-contract-bundle-v1" } as NonNullable<SubagentRunSummary["symphonyLaunchContracts"]>;
}

function barrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier-1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run"],
    dependencyMode: "required_all",
    status: "failed",
    failurePolicy: "ask_user",
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:01.000Z",
    ...overrides,
  };
}
