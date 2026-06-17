import { describe, expect, it } from "vitest";
import {
  AMBIENT_MODEL_RUNTIME_PROFILES,
  createAmbientModelRuntimeSnapshotFromProfile,
} from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { resolveSubagentCapacityLease } from "../../shared/subagentCapacity";
import { AMBIENT_SUBAGENT_PROTOCOL_VERSION, type SubagentRunStatus } from "../../shared/subagentProtocol";
import { getDefaultSubagentRoleProfile, type SubagentRoleId } from "../../shared/subagentRoles";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/types";
import {
  SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_SCHEMA_VERSION,
  SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_TYPE,
  subagentLifecycleInterruptionIdempotencyKey,
  subagentLifecycleInterruptionParentMailboxPayload,
} from "./subagentLifecycleParentMailbox";

describe("subagentLifecycleParentMailbox", () => {
  it("builds child-attributed lifecycle interruption payloads for direct stops and runtime budgets", () => {
    const run = subagentRun({
      status: "aborted_partial",
      resultArtifact: resultArtifact({
        status: "aborted_partial",
        partial: true,
        summary: "Child produced a partial result before the runtime budget expired.",
      }),
    });

    expect(SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_TYPE).toBe("subagent.lifecycle_interrupted");
    expect(subagentLifecycleInterruptionParentMailboxPayload({
      run,
      previousStatus: "running",
      source: "runtime_budget_exceeded",
      reason: "Runtime budget expired before the child finished.",
      toolCallId: "tool-wait",
      waitBarrierIds: ["barrier-required"],
      cancelledMailboxEventIds: ["mailbox-followup"],
    })).toEqual({
      schemaVersion: SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_SCHEMA_VERSION,
      parentThreadId: "parent-thread-1",
      parentRunId: "parent-run-1",
      parentMessageId: "assistant-message-1",
      childRunId: "child-run-1",
      childThreadId: "child-thread-1",
      canonicalTaskPath: "root/1:worker",
      roleId: "worker",
      previousStatus: "running",
      status: "aborted_partial",
      source: "runtime_budget_exceeded",
      reason: "Runtime budget expired before the child finished.",
      toolCallId: "tool-wait",
      waitBarrierIds: ["barrier-required"],
      cancelledMailboxEventIds: ["mailbox-followup"],
      resultArtifact: {
        status: "aborted_partial",
        partial: true,
        summary: "Child produced a partial result before the runtime budget expired.",
        childThreadId: "child-thread-1",
        artifactPath: "test-results/subagents/child-run-1/result.json",
        fullOutputPath: "test-results/subagents/child-run-1/full.txt",
        structuredOutputPath: "test-results/subagents/child-run-1/structured.json",
        provenanceHash: "sha256:child-result",
      },
    });

    expect(subagentLifecycleInterruptionParentMailboxPayload({
      run: subagentRun({ status: "stopped" }),
      previousStatus: "needs_attention",
      source: "direct_child_stop",
      reason: "The user stopped only this child branch.",
    })).toMatchObject({
      childRunId: "child-run-1",
      childThreadId: "child-thread-1",
      previousStatus: "needs_attention",
      status: "stopped",
      source: "direct_child_stop",
      reason: "The user stopped only this child branch.",
    });
  });

  it("bounds lifecycle result artifacts before parent mailbox delivery", () => {
    const payload = subagentLifecycleInterruptionParentMailboxPayload({
      run: subagentRun({
        status: "failed",
        resultArtifact: resultArtifact({
          status: "failed",
          partial: false,
          summary: `First line\n${"verbose failure detail ".repeat(60)}`,
          extraDiagnosticBlob: "do not copy unbounded child-only diagnostics",
        }),
      }),
      previousStatus: "running",
      source: "desktop_restart",
      reason: "Desktop restarted while the child run was active.",
    });

    const artifact = payload.resultArtifact as Record<string, unknown>;
    expect(artifact.summary).toEqual(expect.stringMatching(/^First line verbose failure detail/));
    expect(String(artifact.summary).length).toBeLessThanOrEqual(500);
    expect(artifact.summary).toEqual(expect.stringMatching(/\.\.\.$/));
    expect(artifact).not.toHaveProperty("extraDiagnosticBlob");
  });

  it("summarizes resolved wait-barrier consequences for parent-visible cancel events", () => {
    const payload = subagentLifecycleInterruptionParentMailboxPayload({
      run: subagentRun({ status: "cancelled" }),
      previousStatus: "running",
      source: "parent_cancel_request",
      reason: "The user cancelled one required child branch.",
      waitBarriers: [
        waitBarrier({
          status: "cancelled",
          resolutionArtifact: {
            schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
            synthesisAllowed: false,
            waitBarrierEvaluation: {
              synthesisAllowed: false,
              partial: false,
              reason: "required_all barrier cannot reach a synthesis-safe result after the child was cancelled.",
            },
          },
        }),
        waitBarrier({
          id: "barrier-partial",
          status: "satisfied",
          resolutionArtifact: {
            schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
            synthesisAllowed: true,
            waitBarrierEvaluation: {
              synthesisAllowed: true,
              partial: true,
              reason: "required_any barrier can continue with an explicit partial result.",
            },
          },
        }),
      ],
    });

    expect(payload).toMatchObject({
      waitBarrierIds: ["barrier-required", "barrier-partial"],
      cancelledWaitBarrierIds: ["barrier-required"],
      partialWaitBarrierIds: ["barrier-partial"],
      waitBarrierConsequences: [
        {
          schemaVersion: "ambient-subagent-wait-barrier-consequence-v1",
          waitBarrierId: "barrier-required",
          status: "cancelled",
          dependencyMode: "required_all",
          failurePolicy: "ask_user",
          synthesisAllowed: false,
          partial: false,
          consequence: "barrier_cancelled",
          reason: "required_all barrier cannot reach a synthesis-safe result after the child was cancelled.",
        },
        {
          waitBarrierId: "barrier-partial",
          status: "satisfied",
          synthesisAllowed: true,
          partial: true,
          consequence: "partial_result_available",
        },
      ],
    });
  });

  it("uses source and explicit idempotency keys for lifecycle parent mailbox dedupe", () => {
    expect(subagentLifecycleInterruptionIdempotencyKey({
      runId: "child-run-1",
      source: "parent_cancel_request",
    })).toBe("subagent:lifecycle_interrupted:parent_cancel_request:child-run-1");
    expect(subagentLifecycleInterruptionIdempotencyKey({
      runId: "child-run-1",
      source: "parent_cancel_request",
      idempotencyKey: "cancel-tool-call",
    })).toBe("subagent:lifecycle_interrupted:parent_cancel_request:cancel-tool-call");
    expect(subagentLifecycleInterruptionIdempotencyKey({
      runId: "child-run-1",
      source: "direct_child_stop",
      idempotencyKey: "cancel-tool-call",
    })).toBe("subagent:lifecycle_interrupted:direct_child_stop:cancel-tool-call");
  });
});

function subagentRun(overrides: Partial<SubagentRunSummary> = {}): SubagentRunSummary {
  const model = AMBIENT_MODEL_RUNTIME_PROFILES[0];
  const roleId: SubagentRoleId = "worker";
  const canonicalTaskPath = "root/1:worker";
  return {
    id: "child-run-1",
    protocolVersion: AMBIENT_SUBAGENT_PROTOCOL_VERSION,
    parentThreadId: "parent-thread-1",
    parentRunId: "parent-run-1",
    parentMessageId: "assistant-message-1",
    childThreadId: "child-thread-1",
    canonicalTaskPath,
    roleId,
    roleProfileSnapshot: getDefaultSubagentRoleProfile(roleId),
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: "running" as SubagentRunStatus,
    featureFlagSnapshot: resolveAmbientFeatureFlags({
      settings: { subagents: true },
      generatedAt: "2026-06-06T00:00:00.000Z",
    }),
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshotFromProfile(
      model.modelId,
      model,
      "2026-06-06T00:00:00.000Z",
    ),
    capacityLeaseSnapshot: resolveSubagentCapacityLease({
      parentThreadId: "parent-thread-1",
      parentRunId: "parent-run-1",
      canonicalTaskPath,
      roleId,
      model,
      now: "2026-06-06T00:00:00.000Z",
    }),
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...overrides,
  };
}

function waitBarrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier-required",
    parentThreadId: "parent-thread-1",
    parentRunId: "parent-run-1",
    childRunIds: ["child-run-1"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...overrides,
  };
}

function resultArtifact(input: {
  status: Extract<SubagentRunStatus, "completed" | "failed" | "stopped" | "cancelled" | "timed_out" | "detached" | "aborted_partial">;
  partial: boolean;
  summary: string;
  extraDiagnosticBlob?: string;
}): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId: "child-run-1",
    status: input.status,
    partial: input.partial,
    summary: input.summary,
    childThreadId: "child-thread-1",
    artifactPath: "test-results/subagents/child-run-1/result.json",
    fullOutputPath: "test-results/subagents/child-run-1/full.txt",
    structuredOutputPath: "test-results/subagents/child-run-1/structured.json",
    provenanceHash: "sha256:child-result",
    ...(input.extraDiagnosticBlob ? { extraDiagnosticBlob: input.extraDiagnosticBlob } : {}),
  };
}
