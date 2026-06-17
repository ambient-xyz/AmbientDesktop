import { describe, expect, it, vi } from "vitest";

import type {
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/types";
import {
  recordSubagentBarrierDecisionParentMailbox,
  SUBAGENT_BARRIER_DECISION_RECORDER_SCHEMA_VERSION,
  type SubagentBarrierDecisionRecorderStore,
} from "./subagentBarrierDecisionRecorder";
import {
  SUBAGENT_WAIT_BARRIER_DECISION_PARENT_MAILBOX_TYPE,
  SUBAGENT_WAIT_BARRIER_DECISION_SCHEMA_VERSION,
} from "./subagentBarrierDecision";
import type { SubagentParentPolicyResolution } from "./subagentParentPolicyResolution";

describe("subagentBarrierDecisionRecorder", () => {
  it("records a delivered parent mailbox event for explicit barrier control state", () => {
    const store = fakeStore();
    const event = recordSubagentBarrierDecisionParentMailbox({
      store,
      barrier: waitBarrier({ status: "cancelled" }),
      childRuns: [childRun({ status: "cancelled", parentMessageId: "assistant-message" })],
      parentResolution: parentResolution({ action: "cancel_parent" }),
      decision: "cancel_parent",
      userDecision: "Stop waiting.",
      idempotencyKey: "barrier:cancel",
      toolCallId: "tool-call",
      createdAt: "2026-06-06T00:00:00.000Z",
      controlResult: {
        detachedRunIds: [],
        cancelledRunIds: ["child-run"],
        unchangedRunIds: [],
        cancelledMailboxEventIds: ["mailbox-queued"],
      },
    });

    expect(SUBAGENT_BARRIER_DECISION_RECORDER_SCHEMA_VERSION)
      .toBe("ambient-subagent-barrier-decision-recorder-v1");
    expect(store.appendSubagentParentMailboxEvent).toHaveBeenCalledTimes(1);
    expect(event).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: SUBAGENT_WAIT_BARRIER_DECISION_PARENT_MAILBOX_TYPE,
      deliveryState: "delivered",
      idempotencyKey: "barrier:cancel",
      createdAt: "2026-06-06T00:00:00.000Z",
      deliveredAt: "2026-06-06T00:00:00.000Z",
      payload: {
        schemaVersion: SUBAGENT_WAIT_BARRIER_DECISION_SCHEMA_VERSION,
        idempotencyKey: "barrier:cancel",
        toolCallId: "tool-call",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        parentMessageId: "assistant-message",
        waitBarrierId: "barrier",
        barrierStatus: "cancelled",
        childRunIds: ["child-run"],
        cancelledRunIds: ["child-run"],
        cancelledMailboxEventIds: ["mailbox-queued"],
        parentCancellationRequested: true,
        decision: "cancel_parent",
        userDecisionPreview: "Stop waiting.",
      },
    });
  });

  it("replays persisted control state from the barrier resolution artifact", () => {
    const store = fakeStore();
    const event = recordSubagentBarrierDecisionParentMailbox({
      store,
      barrier: waitBarrier({
        status: "failed",
        resolutionArtifact: {
          detachedRunIds: ["child-run"],
          unchangedRunIds: ["done-child"],
          cancelledMailboxEventIds: ["mailbox-a"],
        },
      }),
      childRuns: [
        childRun({ id: "child-run", status: "detached" }),
        childRun({ id: "done-child", status: "completed" }),
      ],
      parentResolution: parentResolution({ action: "detach_child" }),
      decision: "detach_child",
      userDecision: "Inspect this separately.",
      idempotencyKey: "barrier:detach",
      toolCallId: "tool-call",
      createdAt: "2026-06-06T00:00:00.000Z",
    });

    expect(event.payload).toMatchObject({
      detachedRunIds: ["child-run"],
      unchangedRunIds: ["done-child"],
      cancelledMailboxEventIds: ["mailbox-a"],
      decision: "detach_child",
      parentResolution: expect.objectContaining({ action: "detach_child" }),
    });
  });
});

function fakeStore(): SubagentBarrierDecisionRecorderStore & {
  appendSubagentParentMailboxEvent: ReturnType<typeof vi.fn>;
} {
  const appendSubagentParentMailboxEvent = vi.fn((input): SubagentParentMailboxEventSummary => ({
    id: `parent-mailbox-${appendSubagentParentMailboxEvent.mock.calls.length}`,
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    type: input.type,
    payload: input.payload,
    deliveryState: input.deliveryState ?? "queued",
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    createdAt: input.createdAt ?? "2026-06-06T00:00:00.000Z",
    updatedAt: input.createdAt ?? "2026-06-06T00:00:00.000Z",
    ...(input.deliveredAt ? { deliveredAt: input.deliveredAt } : {}),
  }));
  return { appendSubagentParentMailboxEvent };
}

function childRun(input: {
  id?: string;
  status: SubagentRunSummary["status"];
  parentMessageId?: string;
}): SubagentRunSummary {
  const id = input.id ?? "child-run";
  return {
    id,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    childThreadId: `${id}-thread`,
    canonicalTaskPath: `root/${id}:reviewer`,
    roleId: "reviewer",
    status: input.status,
  } as SubagentRunSummary;
}

function waitBarrier(input: Partial<SubagentWaitBarrierSummary>): SubagentWaitBarrierSummary {
  return {
    id: "barrier",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...input,
  };
}

function parentResolution(input: {
  action: SubagentParentPolicyResolution["action"];
}): SubagentParentPolicyResolution {
  return {
    schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
    childRunId: "child-run",
    childStatus: "failed",
    barrierStatus: "timed_out",
    failurePolicy: "ask_user",
    status: "blocked",
    action: input.action,
    canSynthesize: false,
    requiresUserInput: true,
    requiresExplicitPartial: false,
    reason: "Required child work needs user attention.",
    instruction: "Record the user's wait-barrier decision.",
  };
}
