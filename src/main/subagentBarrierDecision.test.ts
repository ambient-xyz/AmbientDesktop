import { describe, expect, it } from "vitest";
import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../shared/types";
import type { SubagentParentPolicyResolution } from "./subagentParentPolicyResolution";
import {
  barrierControlStateFromResolutionArtifact,
  buildSubagentBarrierDecisionChildThreadMessage,
  buildSubagentBarrierDecisionParentMailboxDraft,
  buildSubagentBarrierDecisionResolutionArtifact,
  buildSubagentBarrierDecisionRunEventPreview,
  buildSubagentBarrierDecisionText,
  subagentBarrierDecisionNextStatus,
  SUBAGENT_USER_DECISION_SCHEMA_VERSION,
  SUBAGENT_WAIT_BARRIER_DECISION_PARENT_MAILBOX_TYPE,
  SUBAGENT_WAIT_BARRIER_DECISION_SCHEMA_VERSION,
  SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION,
} from "./subagentBarrierDecision";

describe("subagentBarrierDecision", () => {
  it("maps barrier decisions to persisted barrier statuses and parent-facing text", () => {
    expect(subagentBarrierDecisionNextStatus("continue_with_partial")).toBe("satisfied");
    expect(subagentBarrierDecisionNextStatus("retry_child")).toBe("waiting_on_children");
    expect(subagentBarrierDecisionNextStatus("fail_parent")).toBe("failed");
    expect(subagentBarrierDecisionNextStatus("detach_child")).toBe("failed");
    expect(subagentBarrierDecisionNextStatus("cancel_parent")).toBe("cancelled");

    expect(buildSubagentBarrierDecisionText({
      barrier: barrier({ status: "satisfied" }),
      decision: "continue_with_partial",
      replay: false,
    })).toContain("Recorded wait-barrier decision: continue_with_partial.");
    expect(buildSubagentBarrierDecisionText({
      barrier: barrier({ status: "failed" }),
      decision: "fail_parent",
      replay: true,
    })).toContain("Reused existing wait-barrier decision: fail_parent.");
  });

  it("builds explicit partial resolution artifacts with user decision provenance", () => {
    const artifact = buildSubagentBarrierDecisionResolutionArtifact({
      barrier: barrier({ childRunIds: ["child-a", "child-b"] }),
      childRuns: [run({ id: "child-a", status: "failed" }), run({ id: "child-b", status: "completed" })],
      decision: "continue_with_partial",
      userDecision: "Use only the completed child evidence.",
      partialSummary: "Reviewer failed; summarizer completed.",
      now: "2026-06-06T12:00:00.000Z",
      toolCallId: "tool-1",
      idempotencyKey: "barrier:partial",
    });

    expect(artifact).toMatchObject({
      schemaVersion: SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION,
      childRunIds: ["child-a", "child-b"],
      childStatuses: [
        { childRunId: "child-a", status: "failed" },
        { childRunId: "child-b", status: "completed" },
      ],
      synthesisAllowed: true,
      explicitPartial: true,
      resultArtifact: null,
      userDecision: {
        schemaVersion: SUBAGENT_USER_DECISION_SCHEMA_VERSION,
        decision: "continue_with_partial",
        userDecision: "Use only the completed child evidence.",
        partialSummary: "Reviewer failed; summarizer completed.",
        decidedAt: "2026-06-06T12:00:00.000Z",
        toolCallId: "tool-1",
        idempotencyKey: "barrier:partial",
      },
    });
  });

  it("builds cancel-parent resolution artifacts with control-state provenance", () => {
    const artifact = buildSubagentBarrierDecisionResolutionArtifact({
      barrier: barrier({ childRunIds: ["child-a", "child-b"] }),
      childRuns: [run({ id: "child-a", status: "cancelled" }), run({ id: "child-b", status: "completed" })],
      decision: "cancel_parent",
      userDecision: "Stop the parent path.",
      now: "2026-06-06T12:00:00.000Z",
      toolCallId: "tool-2",
      idempotencyKey: "barrier:cancel",
      controlState: {
        detachedRunIds: [],
        cancelledRunIds: ["child-a"],
        unchangedRunIds: ["child-b"],
        cancelledMailboxEventIds: ["mailbox-1"],
      },
    });

    expect(artifact).toMatchObject({
      synthesisAllowed: false,
      explicitPartial: false,
      cancelledRunIds: ["child-a"],
      unchangedRunIds: ["child-b"],
      cancelledMailboxEventIds: ["mailbox-1"],
      parentCancellationRequested: true,
      userDecision: expect.objectContaining({ decision: "cancel_parent" }),
    });
  });

  it("builds retry resolution artifacts with explicit retry-request provenance", () => {
    const artifact = buildSubagentBarrierDecisionResolutionArtifact({
      barrier: barrier({ id: "barrier-retry", childRunIds: ["child-failed"] }),
      childRuns: [run({ id: "child-failed", status: "failed" })],
      decision: "retry_child",
      userDecision: "Retry this child instead of letting the parent continue.",
      now: "2026-06-06T12:00:00.000Z",
      toolCallId: "tool-retry",
      idempotencyKey: "barrier:retry",
    });
    const preview = buildSubagentBarrierDecisionRunEventPreview({
      waitBarrier: barrier({ id: "barrier-retry", childRunIds: ["child-failed"] }),
      decision: "retry_child",
      userDecision: "Retry this child.",
      idempotencyKey: "barrier:retry",
      toolCallId: "tool-retry",
    });

    expect(artifact).toMatchObject({
      schemaVersion: SUBAGENT_WAIT_BARRIER_RESOLUTION_SCHEMA_VERSION,
      childRunIds: ["child-failed"],
      childStatuses: [{ childRunId: "child-failed", status: "failed" }],
      synthesisAllowed: false,
      explicitPartial: false,
      retryRequestedRunIds: ["child-failed"],
      userDecision: expect.objectContaining({
        decision: "retry_child",
        userDecision: "Retry this child instead of letting the parent continue.",
      }),
    });
    expect(preview).toMatchObject({
      waitBarrierId: "barrier-retry",
      decision: "retry_child",
      retryRequestedRunIds: ["child-failed"],
    });
  });

  it("builds bounded run-event previews and child thread messages", () => {
    const longUserDecision = `user ${"x".repeat(500)}`;
    const longPartialSummary = `partial ${"y".repeat(800)}`;
    const preview = buildSubagentBarrierDecisionRunEventPreview({
      waitBarrier: barrier({ id: "barrier-a" }),
      decision: "continue_with_partial",
      userDecision: longUserDecision,
      partialSummary: longPartialSummary,
      idempotencyKey: "barrier:partial",
      toolCallId: "tool-3",
      controlState: {
        detachedRunIds: ["child-detached"],
        cancelledRunIds: ["child-cancelled"],
        unchangedRunIds: [],
        cancelledMailboxEventIds: ["mailbox-2"],
      },
    });

    expect(preview).toMatchObject({
      idempotencyKey: "barrier:partial",
      toolCallId: "tool-3",
      waitBarrierId: "barrier-a",
      decision: "continue_with_partial",
      detachedRunIds: ["child-detached"],
      cancelledRunIds: ["child-cancelled"],
      cancelledMailboxEventIds: ["mailbox-2"],
    });
    expect((preview.userDecisionPreview as string).length).toBeLessThanOrEqual(240);
    expect((preview.partialSummaryPreview as string).length).toBeLessThanOrEqual(480);

    expect(buildSubagentBarrierDecisionChildThreadMessage({
      waitBarrierId: "barrier-a",
      decision: "continue_with_partial",
      userDecision: "Continue explicitly.",
      partialSummary: "Only one child is usable.",
    })).toContain("Parent recorded a wait-barrier decision: continue_with_partial.");
  });

  it("builds parent mailbox drafts and replays control state from existing artifacts", () => {
    const waitBarrier = barrier({
      status: "failed",
      resolutionArtifact: {
        retryRequestedRunIds: ["child-retry"],
        retryAcceptedRunIds: ["child-retry"],
        retryMailboxEventIds: ["mailbox-retry"],
        detachedRunIds: ["child-detached", 42],
        cancelledRunIds: ["child-cancelled"],
        unchangedRunIds: ["child-unchanged"],
        cancelledMailboxEventIds: ["mailbox-1"],
      },
    });
    const parentResolution = resolution({ action: "detach_child", canSynthesize: false });
    const draft = buildSubagentBarrierDecisionParentMailboxDraft({
      barrier: waitBarrier,
      childRuns: [
        run({ id: "child-detached", status: "detached", parentMessageId: "assistant-message" }),
        run({ id: "child-cancelled", status: "cancelled" }),
      ],
      parentResolution,
      decision: "detach_child",
      userDecision: `Detach because ${"z".repeat(700)}`,
      idempotencyKey: "barrier:detach",
      toolCallId: "tool-4",
      createdAt: "2026-06-06T12:00:00.000Z",
    });
    const payload = draft.parentMailboxInput.payload as Record<string, any>;

    expect(barrierControlStateFromResolutionArtifact(waitBarrier)).toEqual({
      retryRequestedRunIds: ["child-retry"],
      retryAcceptedRunIds: ["child-retry"],
      retryMailboxEventIds: ["mailbox-retry"],
      detachedRunIds: ["child-detached"],
      cancelledRunIds: ["child-cancelled"],
      unchangedRunIds: ["child-unchanged"],
      cancelledMailboxEventIds: ["mailbox-1"],
    });
    expect(draft.parentMailboxInput).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: SUBAGENT_WAIT_BARRIER_DECISION_PARENT_MAILBOX_TYPE,
      deliveryState: "delivered",
      idempotencyKey: "barrier:detach",
      createdAt: "2026-06-06T12:00:00.000Z",
      deliveredAt: "2026-06-06T12:00:00.000Z",
    });
    expect(payload).toMatchObject({
      schemaVersion: SUBAGENT_WAIT_BARRIER_DECISION_SCHEMA_VERSION,
      waitBarrierId: "barrier",
      barrierStatus: "failed",
      decision: "detach_child",
      parentResolution,
      retryRequestedRunIds: ["child-retry"],
      retryAcceptedRunIds: ["child-retry"],
      retryMailboxEventIds: ["mailbox-retry"],
      detachedRunIds: ["child-detached"],
      cancelledRunIds: ["child-cancelled"],
      unchangedRunIds: ["child-unchanged"],
      cancelledMailboxEventIds: ["mailbox-1"],
      waitBarrier: expect.objectContaining({ id: "barrier", status: "failed" }),
    });
    expect(payload.userDecisionPreview.length).toBeLessThanOrEqual(600);
  });
});

function run(overrides: {
  id?: string;
  status?: SubagentRunStatus;
  parentMessageId?: string;
} = {}): SubagentRunSummary {
  return {
    id: overrides.id ?? "child-run",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    ...(overrides.parentMessageId ? { parentMessageId: overrides.parentMessageId } : {}),
    childThreadId: `${overrides.id ?? "child-run"}-thread`,
    canonicalTaskPath: `root/${overrides.id ?? "child-run"}:reviewer`,
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
    createdAt: "2026-06-06T12:00:00.000Z",
    updatedAt: "2026-06-06T12:00:00.000Z",
    ...overrides,
  };
}

function resolution(overrides: Partial<SubagentParentPolicyResolution> = {}): SubagentParentPolicyResolution {
  return {
    schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
    status: "blocked",
    action: "fail_parent",
    canSynthesize: false,
    requiresUserInput: false,
    requiresExplicitPartial: false,
    ...overrides,
  } as SubagentParentPolicyResolution;
}
