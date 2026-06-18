import { describe, expect, it } from "vitest";
import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import {
  buildSubagentSupervisorRequestDraft,
  createSubagentSupervisorRequestIdempotencyKey,
  recordSubagentSupervisorRequestIfNeeded,
  SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE,
  SUBAGENT_PARENT_SUPERVISOR_REQUEST_MAILBOX_TYPE,
  SUBAGENT_SUPERVISOR_REQUEST_SCHEMA_VERSION,
  type SubagentSupervisorRequestRecorderStore,
} from "./subagentSupervisorRequest";

describe("subagentSupervisorRequest", () => {
  it("builds child-attributed supervisor requests without marking the child complete", () => {
    const run = childRun({ status: "needs_attention", parentMessageId: "assistant-message" });
    const waitBarrier = barrier({ status: "waiting_on_children" });
    const request = {
      kind: "need_decision" as const,
      title: "Choose a source strategy",
      message: `The child found two credible source paths and needs the parent to choose.\n${"context ".repeat(200)}`,
      requestedChoices: [
        { id: "use-docs", label: "Use docs", description: "Continue with official docs only." },
        { id: "use-code", label: "Use code", description: "Inspect source files before summarizing." },
      ],
      createdAt: "2026-06-06T17:00:00.000Z",
    };
    const draft = buildSubagentSupervisorRequestDraft({
      run,
      waitBarrier,
      request,
      createdAt: "2026-06-06T17:00:00.000Z",
    });

    expect(SUBAGENT_SUPERVISOR_REQUEST_SCHEMA_VERSION).toBe("ambient-subagent-supervisor-request-v1");
    expect(draft.idempotencyKey).toBe(createSubagentSupervisorRequestIdempotencyKey({
      run,
      waitBarrier,
      request,
    }));
    expect(draft.parentRequiresAttention).toBe(true);
    expect(draft.childMailboxInput).toMatchObject({
      direction: "child_to_parent",
      type: SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE,
      deliveryState: "delivered",
      payload: {
        schemaVersion: SUBAGENT_SUPERVISOR_REQUEST_SCHEMA_VERSION,
        childRunId: run.id,
        childThreadId: run.childThreadId,
        canonicalTaskPath: run.canonicalTaskPath,
        kind: "need_decision",
        title: "Choose a source strategy",
        severity: "warning",
        parentRequiresAttention: true,
        requestedChoices: [
          { id: "use-docs", label: "Use docs", description: "Continue with official docs only." },
          { id: "use-code", label: "Use code", description: "Inspect source files before summarizing." },
        ],
        parentBlockingState: {
          status: "needs_supervisor_attention",
          action: "answer_child_request_then_wait",
          resumeAction: "wait_agent",
          resumeParentBlocking: true,
          completionStatus: "not_complete",
        },
        marksChildComplete: false,
        waitBarrierId: waitBarrier.id,
      },
    });
    expect(String(draft.childMailboxInput.payload.messagePreview)).toHaveLength(1200);
    expect(draft.parentMailboxInput).toMatchObject({
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      parentMessageId: run.parentMessageId,
      type: SUBAGENT_PARENT_SUPERVISOR_REQUEST_MAILBOX_TYPE,
      deliveryState: "queued",
      payload: expect.objectContaining({
        instruction: expect.stringContaining("return the parent to waiting on this child"),
      }),
    });
    expect(draft.runEventInput).toMatchObject({
      type: SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE,
      preview: {
        schemaVersion: SUBAGENT_SUPERVISOR_REQUEST_SCHEMA_VERSION,
        childRunId: run.id,
        childThreadId: run.childThreadId,
        kind: "need_decision",
        title: "Choose a source strategy",
        parentRequiresAttention: true,
        resumeParentBlocking: true,
        completionStatus: "not_complete",
        waitBarrierId: waitBarrier.id,
      },
    });
  });

  it("records supervisor requests idempotently across child and parent mailbox events", () => {
    const store = new FakeSupervisorRequestStore();
    const run = childRun({ status: "running" });
    const first = recordSubagentSupervisorRequestIfNeeded({
      store,
      run,
      request: {
        kind: "progress_update",
        title: "Indexing complete",
        message: "The child has indexed the repository and is moving to synthesis.",
        progressLabel: "2/3 stages",
        createdAt: "2026-06-06T17:10:00.000Z",
      },
    });
    const replay = recordSubagentSupervisorRequestIfNeeded({
      store,
      run,
      request: {
        kind: "progress_update",
        title: "Indexing complete",
        message: "The child has indexed the repository and is moving to synthesis.",
        progressLabel: "2/3 stages",
        createdAt: "2026-06-06T17:10:00.000Z",
      },
    });

    expect(first).toMatchObject({
      replay: false,
      parentRequiresAttention: false,
      childMailboxEvent: {
        type: SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE,
        deliveryState: "delivered",
      },
      parentMailboxEvent: {
        type: SUBAGENT_PARENT_SUPERVISOR_REQUEST_MAILBOX_TYPE,
        deliveryState: "delivered",
        deliveredAt: "2026-06-06T17:10:00.000Z",
        payload: expect.objectContaining({
          kind: "progress_update",
          parentRequiresAttention: false,
          progressLabel: "2/3 stages",
          marksChildComplete: false,
        }),
      },
      runEvent: {
        type: SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE,
        preview: expect.objectContaining({
          childMailboxEventId: "mailbox-1",
          parentMailboxEventId: "parent-mailbox-1",
          completionStatus: "not_complete",
        }),
      },
    });
    expect(replay).toMatchObject({
      replay: true,
      idempotencyKey: first.idempotencyKey,
      childMailboxEvent: first.childMailboxEvent,
    });
    expect(store.mailboxEvents.get(run.id)).toHaveLength(1);
    expect(store.parentMailboxEvents).toHaveLength(1);
    expect(store.runEvents.get(run.id)).toHaveLength(1);
  });
});

class FakeSupervisorRequestStore implements SubagentSupervisorRequestRecorderStore {
  readonly runEvents = new Map<string, SubagentRunEventSummary[]>();
  readonly mailboxEvents = new Map<string, SubagentMailboxEventSummary[]>();
  readonly parentMailboxEvents: SubagentParentMailboxEventSummary[] = [];

  listSubagentRunEvents(runId: string): SubagentRunEventSummary[] {
    return [...(this.runEvents.get(runId) ?? [])];
  }

  listSubagentMailboxEvents(runId: string): SubagentMailboxEventSummary[] {
    return [...(this.mailboxEvents.get(runId) ?? [])];
  }

  appendSubagentMailboxEvent(
    runId: string,
    input: {
      direction: "parent_to_child" | "child_to_parent";
      type: string;
      payload: unknown;
      deliveryState?: SubagentMailboxDeliveryState;
      createdAt?: string;
      deliveredAt?: string;
    },
  ): SubagentMailboxEventSummary {
    const events = this.mailboxEvents.get(runId) ?? [];
    const event: SubagentMailboxEventSummary = {
      id: `mailbox-${events.length + 1}`,
      runId,
      direction: input.direction,
      type: input.type,
      payload: input.payload,
      deliveryState: input.deliveryState ?? "queued",
      createdAt: input.createdAt ?? "2026-06-06T17:10:00.000Z",
      ...(input.deliveredAt ? { deliveredAt: input.deliveredAt } : {}),
    };
    events.push(event);
    this.mailboxEvents.set(runId, events);
    return event;
  }

  appendSubagentParentMailboxEvent(input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    type: string;
    payload: unknown;
    deliveryState?: SubagentMailboxDeliveryState;
    idempotencyKey?: string;
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentParentMailboxEventSummary {
    const event: SubagentParentMailboxEventSummary = {
      id: `parent-mailbox-${this.parentMailboxEvents.length + 1}`,
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
      type: input.type,
      payload: input.payload,
      deliveryState: input.deliveryState ?? "queued",
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      createdAt: input.createdAt ?? "2026-06-06T17:10:00.000Z",
      updatedAt: input.createdAt ?? "2026-06-06T17:10:00.000Z",
      ...(input.deliveredAt ? { deliveredAt: input.deliveredAt } : {}),
    };
    this.parentMailboxEvents.push(event);
    return event;
  }

  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary {
    const events = this.runEvents.get(runId) ?? [];
    const event: SubagentRunEventSummary = {
      runId,
      sequence: events.length + 1,
      type: input.type,
      preview: input.preview,
      createdAt: input.createdAt ?? "2026-06-06T17:10:00.000Z",
      ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
    };
    events.push(event);
    this.runEvents.set(runId, events);
    return event;
  }
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

function barrier(input: Partial<SubagentWaitBarrierSummary>): SubagentWaitBarrierSummary {
  return {
    id: "barrier",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    createdAt: "2026-06-06T17:00:00.000Z",
    updatedAt: "2026-06-06T17:00:00.000Z",
    ...input,
  };
}
