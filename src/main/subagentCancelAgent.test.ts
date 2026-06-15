import { describe, expect, it } from "vitest";
import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type { SubagentMailboxEventSummary, SubagentRunSummary, SubagentWaitBarrierSummary } from "../shared/types";
import {
  buildSubagentCancelAgentChildThreadMessage,
  buildSubagentCancelAgentParentMailboxDraft,
  buildSubagentCancelAgentResultArtifact,
  buildSubagentCancelRequestedRunEventPreview,
  createSubagentCancelAgentIdempotencyKey,
  DEFAULT_SUBAGENT_CANCEL_REASON,
  resolveSubagentCancelAgentRequest,
  shouldMarkSubagentCancelAgentRunCancelled,
  shouldPreserveInitialTerminalSubagentCancelRun,
  SUBAGENT_CANCEL_REQUEST_EVENT_TYPE,
  SUBAGENT_PARENT_CANCEL_REQUEST_SOURCE,
} from "./subagentCancelAgent";

describe("subagentCancelAgent", () => {
  it("resolves default reasons and stable cancel idempotency keys", () => {
    const child = run({ id: "child-a", canonicalTaskPath: "root/0:reviewer" });
    const first = resolveSubagentCancelAgentRequest({ run: child });
    const replay = resolveSubagentCancelAgentRequest({ run: child });
    const explicit = resolveSubagentCancelAgentRequest({
      run: child,
      reason: "Parent no longer needs this branch.",
      idempotencyKey: "cancel:branch",
    });

    expect(first).toEqual({
      reason: DEFAULT_SUBAGENT_CANCEL_REASON,
      idempotencyKey: replay.idempotencyKey,
    });
    expect(first.idempotencyKey).toContain("subagent:cancel:");
    expect(createSubagentCancelAgentIdempotencyKey({
      run: child,
      reason: "Parent no longer needs this branch.",
    })).toContain("subagent:cancel:");
    expect(explicit).toEqual({
      reason: "Parent no longer needs this branch.",
      idempotencyKey: "cancel:branch",
    });
  });

  it("marks only active child runs as cancelled and preserves original terminal runs", () => {
    expect(shouldMarkSubagentCancelAgentRunCancelled({
      initialStatus: "running",
      currentStatus: "running",
    })).toBe(true);
    expect(shouldMarkSubagentCancelAgentRunCancelled({
      initialStatus: "running",
      currentStatus: "cancelled",
    })).toBe(false);
    expect(shouldMarkSubagentCancelAgentRunCancelled({
      initialStatus: "running",
      currentStatus: "completed",
    })).toBe(false);
    expect(shouldMarkSubagentCancelAgentRunCancelled({
      initialStatus: "completed",
      currentStatus: "running",
    })).toBe(false);
    expect(shouldPreserveInitialTerminalSubagentCancelRun({
      initialStatus: "completed",
      currentStatus: "running",
    })).toBe(true);
    expect(shouldPreserveInitialTerminalSubagentCancelRun({
      initialStatus: "running",
      currentStatus: "running",
    })).toBe(false);
  });

  it("builds cancelled result artifacts and child thread messages", () => {
    const child = run({ id: "child-a", childThreadId: "thread-a" });

    expect(buildSubagentCancelAgentResultArtifact({
      run: child,
      reason: "Parent no longer needs this branch.",
    })).toEqual({
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: "child-a",
      status: "cancelled",
      partial: false,
      summary: "Parent no longer needs this branch.",
      childThreadId: "thread-a",
    });
    expect(buildSubagentCancelAgentChildThreadMessage({
      reason: "Parent no longer needs this branch.",
    })).toBe("Sub-agent cancelled by parent.\n\nReason: Parent no longer needs this branch.");
  });

  it("builds compact cancel-request run-event previews", () => {
    const child = run({ id: "child-a", childThreadId: "thread-a", canonicalTaskPath: "root/0:reviewer" });
    const preview = buildSubagentCancelRequestedRunEventPreview({
      run: child,
      idempotencyKey: "cancel:branch",
      reason: "Parent no longer needs this branch.",
      toolCallId: "tool-cancel",
      waitBarriers: [barrier({ id: "barrier-a", status: "cancelled" })],
      cancelledMailboxEvents: [
        mailbox({ id: "mailbox-a", type: "subagent.task", deliveryState: "cancelled" }),
        mailbox({ id: "mailbox-b", type: "subagent.followup", deliveryState: "cancelled" }),
      ],
    });

    expect(preview).toMatchObject({
      childRunId: "child-a",
      childThreadId: "thread-a",
      parentRunId: "parent-run",
      parentThreadId: "parent-thread",
      canonicalTaskPath: "root/0:reviewer",
      idempotencyKey: "cancel:branch",
      reason: "Parent no longer needs this branch.",
      toolCallId: "tool-cancel",
      waitBarriers: [expect.objectContaining({ id: "barrier-a", status: "cancelled" })],
      cancelledMailboxEvents: [
        {
          id: "mailbox-a",
          runId: "child-run",
          direction: "parent_to_child",
          type: "subagent.task",
          deliveryState: "cancelled",
          createdAt: "2026-06-06T12:00:00.000Z",
        },
        {
          id: "mailbox-b",
          runId: "child-run",
          direction: "parent_to_child",
          type: "subagent.followup",
          deliveryState: "cancelled",
          createdAt: "2026-06-06T12:00:00.000Z",
        },
      ],
    });
  });

  it("builds lifecycle parent mailbox drafts for parent cancel requests", () => {
    const child = run({
      id: "child-a",
      parentMessageId: "assistant-message",
      status: "cancelled",
      resultArtifact: {
        schemaVersion: "ambient-subagent-result-artifact-v1",
        runId: "child-a",
        status: "cancelled",
        partial: false,
        summary: "Parent no longer needs this branch.",
        childThreadId: "thread-a",
      },
    });
    const draft = buildSubagentCancelAgentParentMailboxDraft({
      run: child,
      previousStatus: "running",
      reason: "Parent no longer needs this branch.",
      resultArtifact: child.resultArtifact,
      toolCallId: "tool-cancel",
      waitBarriers: [barrier({ id: "barrier-a", status: "cancelled" })],
      cancelledMailboxEvents: [mailbox({ id: "mailbox-a", deliveryState: "cancelled" })],
      idempotencyKey: "cancel:branch",
    });

    expect(draft.parentMailboxInput).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "assistant-message",
      type: "subagent.lifecycle_interrupted",
      idempotencyKey: "subagent:lifecycle_interrupted:parent_cancel_request:cancel:branch",
      payload: {
        schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        parentMessageId: "assistant-message",
        childRunId: "child-a",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/child-a:reviewer",
        previousStatus: "running",
        status: "cancelled",
        source: SUBAGENT_PARENT_CANCEL_REQUEST_SOURCE,
        reason: "Parent no longer needs this branch.",
        toolCallId: "tool-cancel",
        waitBarrierIds: ["barrier-a"],
        cancelledWaitBarrierIds: ["barrier-a"],
        waitBarrierConsequences: [
          {
            schemaVersion: "ambient-subagent-wait-barrier-consequence-v1",
            waitBarrierId: "barrier-a",
            status: "cancelled",
            dependencyMode: "required_all",
            failurePolicy: "ask_user",
            childRunIds: ["child-run"],
            synthesisAllowed: false,
            partial: false,
            consequence: "barrier_cancelled",
          },
        ],
        cancelledMailboxEventIds: ["mailbox-a"],
        resultArtifact: {
          status: "cancelled",
          partial: false,
          summary: "Parent no longer needs this branch.",
          childThreadId: "thread-a",
        },
      },
    });
    expect(SUBAGENT_CANCEL_REQUEST_EVENT_TYPE).toBe("subagent.cancel_requested");
  });
});

function run(overrides: {
  id?: string;
  parentMessageId?: string;
  childThreadId?: string;
  canonicalTaskPath?: string;
  status?: SubagentRunStatus;
  resultArtifact?: unknown;
} = {}): SubagentRunSummary {
  const id = overrides.id ?? "child-run";
  return {
    id,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    ...(overrides.parentMessageId ? { parentMessageId: overrides.parentMessageId } : {}),
    childThreadId: overrides.childThreadId ?? "child-thread",
    canonicalTaskPath: overrides.canonicalTaskPath ?? `root/${id}:reviewer`,
    roleId: "reviewer",
    dependencyMode: "required",
    status: overrides.status ?? "running",
    ...(overrides.resultArtifact !== undefined ? { resultArtifact: overrides.resultArtifact } : {}),
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

function mailbox(overrides: Partial<SubagentMailboxEventSummary> = {}): SubagentMailboxEventSummary {
  return {
    id: "mailbox",
    runId: "child-run",
    direction: "parent_to_child",
    type: "subagent.task",
    payload: {},
    deliveryState: "queued",
    createdAt: "2026-06-06T12:00:00.000Z",
    ...overrides,
  };
}
