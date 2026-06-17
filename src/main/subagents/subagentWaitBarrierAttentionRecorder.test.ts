import { describe, expect, it, vi } from "vitest";

import type {
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/types";
import type {
  SubagentParentPolicyResolution,
} from "./subagentParentPolicyResolution";
import type {
  SubagentResultValidation,
} from "./subagentResultValidation";
import {
  recordSubagentWaitBarrierAttentionParentMailboxIfNeeded,
  SUBAGENT_WAIT_BARRIER_ATTENTION_RECORDER_SCHEMA_VERSION,
  type SubagentWaitBarrierAttentionRecorderStore,
} from "./subagentWaitBarrierAttentionRecorder";
import {
  SUBAGENT_WAIT_BARRIER_ATTENTION_PARENT_MAILBOX_TYPE,
  SUBAGENT_WAIT_BARRIER_ATTENTION_SCHEMA_VERSION,
} from "./subagentWaitMailbox";

describe("subagentWaitBarrierAttentionRecorder", () => {
  it("records queued parent attention for blocked required wait barriers", () => {
    const store = fakeStore();
    const event = recordSubagentWaitBarrierAttentionParentMailboxIfNeeded({
      store,
      run: childRun({ status: "failed", parentMessageId: "assistant-message" }),
      waitBarrier: waitBarrier({ status: "timed_out", failurePolicy: "degrade_partial" }),
      waitTimedOut: true,
      resultValidation: resultValidation({
        status: "failed",
        synthesisAllowed: false,
        reason: "Required child failed before producing a safe result.",
      }),
      parentResolution: parentResolution({
        status: "blocked",
        action: "ask_user",
        canSynthesize: false,
        requiresUserInput: true,
        requiresExplicitPartial: true,
      }),
    });

    expect(SUBAGENT_WAIT_BARRIER_ATTENTION_RECORDER_SCHEMA_VERSION)
      .toBe("ambient-subagent-wait-barrier-attention-recorder-v1");
    expect(store.appendSubagentParentMailboxEvent).toHaveBeenCalledTimes(1);
    expect(event).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: SUBAGENT_WAIT_BARRIER_ATTENTION_PARENT_MAILBOX_TYPE,
      deliveryState: "queued",
      payload: {
        schemaVersion: SUBAGENT_WAIT_BARRIER_ATTENTION_SCHEMA_VERSION,
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        parentMessageId: "assistant-message",
        childRunId: "child-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:explorer",
        waitBarrierId: "barrier",
        dependencyMode: "required_all",
        barrierStatus: "timed_out",
        failurePolicy: "degrade_partial",
        waitTimedOut: true,
        parentResolution: expect.objectContaining({
          action: "ask_user",
          requiresUserInput: true,
          requiresExplicitPartial: true,
        }),
        allowedUserChoices: expect.arrayContaining([
          expect.objectContaining({ id: "continue_with_partial" }),
          expect.objectContaining({ id: "retry_child" }),
          expect.objectContaining({ id: "detach_child" }),
        ]),
        resultValidation: expect.objectContaining({
          synthesisAllowed: false,
          status: "failed",
        }),
      },
    });
  });

  it("records timed-out wait-for-child barriers so the parent can ask the user", () => {
    const store = fakeStore();
    const event = recordSubagentWaitBarrierAttentionParentMailboxIfNeeded({
      store,
      run: childRun({ status: "running" }),
      waitBarrier: waitBarrier({ status: "timed_out" }),
      waitTimedOut: true,
      resultValidation: resultValidation({ synthesisAllowed: false }),
      parentResolution: parentResolution({
        status: "blocked",
        action: "wait_for_child",
        canSynthesize: false,
        requiresUserInput: true,
        requiresExplicitPartial: false,
      }),
    });

    expect(event).toMatchObject({
      type: SUBAGENT_WAIT_BARRIER_ATTENTION_PARENT_MAILBOX_TYPE,
      payload: expect.objectContaining({
        waitTimedOut: true,
        parentResolution: expect.objectContaining({ action: "wait_for_child" }),
      }),
    });
  });

  it("does not record optional background barriers", () => {
    const store = fakeStore();

    expect(recordSubagentWaitBarrierAttentionParentMailboxIfNeeded({
      store,
      run: childRun({ status: "failed" }),
      waitBarrier: waitBarrier({ dependencyMode: "optional_background", status: "timed_out" }),
      waitTimedOut: true,
      resultValidation: resultValidation({ synthesisAllowed: false }),
      parentResolution: parentResolution({
        status: "blocked",
        action: "ask_user",
        canSynthesize: false,
        requiresUserInput: true,
        requiresExplicitPartial: false,
      }),
    })).toBeUndefined();
    expect(store.appendSubagentParentMailboxEvent).not.toHaveBeenCalled();
  });

  it("does not record ordinary still-waiting barriers before timeout", () => {
    const store = fakeStore();

    expect(recordSubagentWaitBarrierAttentionParentMailboxIfNeeded({
      store,
      run: childRun({ status: "running" }),
      waitBarrier: waitBarrier({ status: "waiting_on_children" }),
      waitTimedOut: false,
      resultValidation: resultValidation({ synthesisAllowed: false }),
      parentResolution: parentResolution({
        status: "blocked",
        action: "wait_for_child",
        canSynthesize: false,
        requiresUserInput: false,
        requiresExplicitPartial: false,
      }),
    })).toBeUndefined();
    expect(store.appendSubagentParentMailboxEvent).not.toHaveBeenCalled();
  });
});

function fakeStore(): SubagentWaitBarrierAttentionRecorderStore & {
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
  status: SubagentRunSummary["status"];
  parentMessageId?: string;
}): SubagentRunSummary {
  return {
    id: "child-run",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    childThreadId: "child-thread",
    canonicalTaskPath: "root/0:explorer",
    roleId: "explorer",
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

function resultValidation(input: Partial<SubagentResultValidation>): SubagentResultValidation {
  return {
    valid: true,
    synthesisAllowed: input.synthesisAllowed ?? false,
    partial: false,
    ...(input.status ? { status: input.status } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    artifactValidation: {
      valid: true,
      synthesisAllowed: input.synthesisAllowed ?? false,
      partial: false,
      ...(input.status ? { status: input.status } : {}),
    },
    structuredOutputValidation: {
      valid: true,
      synthesisAllowed: true,
      required: false,
    },
    completionGuardValidation: {
      valid: true,
      synthesisAllowed: true,
      required: false,
      structuredEvidenceCount: 0,
      ambientEvidenceCount: 0,
      isolatedWorktreeEvidenceCount: 0,
      approvalEvidenceCount: 0,
    },
  } as SubagentResultValidation;
}

function parentResolution(input: {
  status: SubagentParentPolicyResolution["status"];
  action: SubagentParentPolicyResolution["action"];
  canSynthesize: boolean;
  requiresUserInput: boolean;
  requiresExplicitPartial: boolean;
}): SubagentParentPolicyResolution {
  return {
    schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
    childRunId: "child-run",
    childStatus: "failed",
    barrierStatus: "timed_out",
    failurePolicy: "ask_user",
    reason: "Required child work needs user attention.",
    instruction: "Ask the user how to proceed before synthesizing the parent answer.",
    ...input,
  };
}
