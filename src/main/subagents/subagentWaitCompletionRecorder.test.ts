import { describe, expect, it, vi } from "vitest";

import type {
  SubagentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/types";
import type {
  SubagentResultValidation,
} from "./subagentResultValidation";
import {
  nextSubagentWaitCompletionMailboxCreatedAt,
  recordSubagentWaitCompletionMailboxIfNeeded,
  SUBAGENT_WAIT_COMPLETION_RECORDER_SCHEMA_VERSION,
  type SubagentWaitCompletionRecorderStore,
} from "./subagentWaitCompletionRecorder";
import {
  SUBAGENT_WAIT_COMPLETION_MAILBOX_TYPE,
  SUBAGENT_WAIT_COMPLETION_SCHEMA_VERSION,
} from "./subagentWaitMailbox";

describe("subagentWaitCompletionRecorder", () => {
  it("records a delivered child-to-parent mailbox with matching run-event evidence", () => {
    const store = fakeStore({
      mailboxEvents: [
        mailboxEvent({ id: "mailbox-previous", createdAt: "2026-06-06T00:00:00.000Z" }),
      ],
    });
    const mailbox = recordSubagentWaitCompletionMailboxIfNeeded({
      store,
      run: childRun({ status: "completed", resultArtifact: completedArtifact() }),
      waitBarrier: waitBarrier({ status: "satisfied" }),
      waitTimedOut: false,
      resultValidation: resultValidation({ status: "completed", synthesisAllowed: true }),
      explicitIdempotencyKey: "wait:key",
      createdAt: "2026-06-06T00:00:00.000Z",
    });

    expect(SUBAGENT_WAIT_COMPLETION_RECORDER_SCHEMA_VERSION)
      .toBe("ambient-subagent-wait-completion-recorder-v1");
    expect(mailbox).toMatchObject({
      id: "mailbox-2",
      runId: "child-run",
      direction: "child_to_parent",
      type: SUBAGENT_WAIT_COMPLETION_MAILBOX_TYPE,
      deliveryState: "delivered",
      createdAt: "2026-06-06T00:00:00.001Z",
      deliveredAt: "2026-06-06T00:00:00.001Z",
      payload: {
        schemaVersion: SUBAGENT_WAIT_COMPLETION_SCHEMA_VERSION,
        idempotencyKey: "wait:key",
        runId: "child-run",
        status: "completed",
        waitTimedOut: false,
        synthesisAllowed: true,
        summary: "Child result is ready.",
        waitBarrier: expect.objectContaining({ id: "barrier", status: "satisfied" }),
      },
    });
    expect(store.appendSubagentMailboxEvent).toHaveBeenCalledTimes(1);
    expect(store.appendSubagentRunEvent).toHaveBeenCalledWith("child-run", {
      type: SUBAGENT_WAIT_COMPLETION_MAILBOX_TYPE,
      createdAt: "2026-06-06T00:00:00.001Z",
      preview: {
        idempotencyKey: "wait:key",
        status: "completed",
        waitTimedOut: false,
        synthesisAllowed: true,
        waitBarrierStatus: "satisfied",
        mailboxEventId: "mailbox-2",
      },
    });
  });

  it("returns existing mailbox evidence for idempotent replay", () => {
    const existingMailbox = mailboxEvent({
      id: "mailbox-existing",
      createdAt: "2026-06-06T00:00:01.000Z",
      payload: { idempotencyKey: "wait:key" },
    });
    const store = fakeStore({
      mailboxEvents: [existingMailbox],
      runEvents: [
        runEvent({
          type: SUBAGENT_WAIT_COMPLETION_MAILBOX_TYPE,
          preview: {
            idempotencyKey: "wait:key",
            mailboxEventId: "mailbox-existing",
          },
        }),
      ],
    });

    expect(recordSubagentWaitCompletionMailboxIfNeeded({
      store,
      run: childRun({ status: "completed", resultArtifact: completedArtifact() }),
      waitBarrier: waitBarrier({ status: "satisfied" }),
      waitTimedOut: false,
      resultValidation: resultValidation({ status: "completed", synthesisAllowed: true }),
      explicitIdempotencyKey: "wait:key",
      createdAt: "2026-06-06T00:00:02.000Z",
    })).toEqual(existingMailbox);
    expect(store.appendSubagentMailboxEvent).not.toHaveBeenCalled();
    expect(store.appendSubagentRunEvent).not.toHaveBeenCalled();
  });

  it("does not record while a child and required wait barrier are still active", () => {
    const store = fakeStore();

    expect(recordSubagentWaitCompletionMailboxIfNeeded({
      store,
      run: childRun({ status: "running" }),
      waitBarrier: waitBarrier({ status: "waiting_on_children" }),
      waitTimedOut: false,
      resultValidation: resultValidation({ synthesisAllowed: false }),
      explicitIdempotencyKey: "wait:key",
      createdAt: "2026-06-06T00:00:00.000Z",
    })).toBeUndefined();
    expect(store.appendSubagentMailboxEvent).not.toHaveBeenCalled();
    expect(store.appendSubagentRunEvent).not.toHaveBeenCalled();
  });

  it("keeps createdAt monotonic relative to existing mailbox events", () => {
    expect(nextSubagentWaitCompletionMailboxCreatedAt(
      undefined,
      "2026-06-06T00:00:00.000Z",
    )).toBe("2026-06-06T00:00:00.000Z");
    expect(nextSubagentWaitCompletionMailboxCreatedAt(
      "2026-06-06T00:00:00.000Z",
      "2026-06-06T00:00:00.100Z",
    )).toBe("2026-06-06T00:00:00.100Z");
    expect(nextSubagentWaitCompletionMailboxCreatedAt(
      "2026-06-06T00:00:00.000Z",
      "2026-06-06T00:00:00.000Z",
    )).toBe("2026-06-06T00:00:00.001Z");
    expect(nextSubagentWaitCompletionMailboxCreatedAt(
      "not-a-date",
      "2026-06-06T00:00:00.000Z",
    )).toBe("2026-06-06T00:00:00.000Z");
  });
});

function fakeStore(input: {
  runEvents?: SubagentRunEventSummary[];
  mailboxEvents?: SubagentMailboxEventSummary[];
} = {}): SubagentWaitCompletionRecorderStore & {
  appendSubagentMailboxEvent: ReturnType<typeof vi.fn>;
  appendSubagentRunEvent: ReturnType<typeof vi.fn>;
} {
  const runEvents = [...(input.runEvents ?? [])];
  const mailboxEvents = [...(input.mailboxEvents ?? [])];
  const appendSubagentMailboxEvent = vi.fn((runId, mailboxInput): SubagentMailboxEventSummary => {
    const mailbox = mailboxEvent({
      id: `mailbox-${mailboxEvents.length + 1}`,
      runId,
      direction: mailboxInput.direction,
      type: mailboxInput.type,
      payload: mailboxInput.payload,
      deliveryState: mailboxInput.deliveryState ?? "queued",
      createdAt: mailboxInput.createdAt ?? "2026-06-06T00:00:00.000Z",
      deliveredAt: mailboxInput.deliveredAt,
    });
    mailboxEvents.push(mailbox);
    return mailbox;
  });
  const appendSubagentRunEvent = vi.fn((runId, eventInput): SubagentRunEventSummary => {
    const event = runEvent({
      runId,
      type: eventInput.type,
      preview: eventInput.preview,
      createdAt: eventInput.createdAt,
    });
    runEvents.push(event);
    return event;
  });

  return {
    listSubagentRunEvents: () => [...runEvents],
    listSubagentMailboxEvents: () => [...mailboxEvents],
    appendSubagentMailboxEvent,
    appendSubagentRunEvent,
  };
}

function childRun(input: {
  status: SubagentRunSummary["status"];
  resultArtifact?: unknown;
}): SubagentRunSummary {
  return {
    id: "child-run",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childThreadId: "child-thread",
    canonicalTaskPath: "root/0:explorer",
    roleId: "explorer",
    status: input.status,
    ...(input.resultArtifact ? { resultArtifact: input.resultArtifact } : {}),
  } as SubagentRunSummary;
}

function completedArtifact(): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId: "child-run",
    status: "completed",
    partial: false,
    summary: "Child result is ready.",
    childThreadId: "child-thread",
  };
}

function waitBarrier(input: {
  status: SubagentWaitBarrierSummary["status"];
}): SubagentWaitBarrierSummary {
  return {
    id: "barrier",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run"],
    dependencyMode: "required_all",
    status: input.status,
    failurePolicy: "ask_user",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
  };
}

function resultValidation(input: Partial<SubagentResultValidation>): SubagentResultValidation {
  return {
    valid: true,
    synthesisAllowed: input.synthesisAllowed ?? false,
    partial: false,
    ...(input.status ? { status: input.status } : {}),
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

function mailboxEvent(input: {
  id: string;
  runId?: string;
  direction?: SubagentMailboxEventSummary["direction"];
  type?: string;
  payload?: unknown;
  deliveryState?: SubagentMailboxEventSummary["deliveryState"];
  createdAt: string;
  deliveredAt?: string;
}): SubagentMailboxEventSummary {
  return {
    id: input.id,
    runId: input.runId ?? "child-run",
    direction: input.direction ?? "child_to_parent",
    type: input.type ?? SUBAGENT_WAIT_COMPLETION_MAILBOX_TYPE,
    payload: input.payload ?? {},
    deliveryState: input.deliveryState ?? "delivered",
    createdAt: input.createdAt,
    ...(input.deliveredAt ? { deliveredAt: input.deliveredAt } : {}),
  };
}

function runEvent(input: {
  runId?: string;
  sequence?: number;
  type: string;
  preview?: unknown;
  createdAt?: string;
}): SubagentRunEventSummary {
  return {
    runId: input.runId ?? "child-run",
    sequence: input.sequence ?? 1,
    type: input.type,
    createdAt: input.createdAt ?? "2026-06-06T00:00:00.000Z",
    ...(input.preview !== undefined ? { preview: input.preview } : {}),
  };
}
