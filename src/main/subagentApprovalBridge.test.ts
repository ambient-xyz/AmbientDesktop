import { describe, expect, it } from "vitest";
import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../shared/types";
import {
  buildSubagentApprovalRequestBridgeDraft,
  buildSubagentApprovalResponseBridgeDraft,
  createSubagentApprovalRequestIdempotencyKey,
  recordSubagentApprovalResponseBridgeIfNeeded,
  resolveSubagentApprovalScope,
  SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION,
  SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE,
  SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE,
  SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE,
  SUBAGENT_PARENT_APPROVAL_REQUEST_MAILBOX_TYPE,
} from "./subagentApprovalBridge";

describe("subagentApprovalBridge", () => {
  it("narrows child always grants to the child thread by default", () => {
    expect(resolveSubagentApprovalScope({ requestedScope: "always" })).toEqual({
      requestedScope: "always",
      effectiveScope: "this_child_thread",
      childAlwaysDefaulted: true,
      label: "this child thread",
      reason: "Child always grants default to this child thread so approval does not silently widen to the parent tree or project.",
    });
    expect(resolveSubagentApprovalScope({ requestedScope: "for project" })).toMatchObject({
      requestedScope: "for_project",
      effectiveScope: "project",
      childAlwaysDefaulted: false,
    });
    expect(resolveSubagentApprovalScope({ requestedScope: "parent-tree" })).toMatchObject({
      requestedScope: "parent_tree",
      effectiveScope: "parent_thread_tree",
    });
  });

  it("builds child-attributed approval requests that return the parent to a wait barrier", () => {
    const run = childRun({ status: "needs_attention", parentMessageId: "assistant-message" });
    const waitBarrier = barrier({ status: "waiting_on_children" });
    const draft = buildSubagentApprovalRequestBridgeDraft({
      run,
      waitBarrier,
      createdAt: "2026-06-06T16:00:00.000Z",
      approval: {
        approvalId: "approval-worker-write",
        title: "Allow workspace write",
        prompt: `Child wants to edit the workspace.\n${"details ".repeat(300)}`,
        requestedAction: "workspace.write",
        requestedToolId: "builtin:write_file",
        requestedToolCategory: "workspace.write",
        requestedScope: "always",
      },
    });
    const childPayload = draft.childMailboxInput.payload as Record<string, any>;
    const parentPayload = draft.parentMailboxInput.payload as Record<string, any>;

    expect(draft.idempotencyKey).toBe(createSubagentApprovalRequestIdempotencyKey({
      run,
      waitBarrier,
      approval: {
        approvalId: "approval-worker-write",
        title: "Allow workspace write",
        prompt: `Child wants to edit the workspace.\n${"details ".repeat(300)}`,
        requestedAction: "workspace.write",
        requestedToolId: "builtin:write_file",
        requestedToolCategory: "workspace.write",
        requestedScope: "always",
      },
      scope: draft.scope,
    }));
    expect(draft.childMailboxInput).toMatchObject({
      direction: "child_to_parent",
      type: SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE,
      deliveryState: "delivered",
      createdAt: "2026-06-06T16:00:00.000Z",
      deliveredAt: "2026-06-06T16:00:00.000Z",
    });
    expect(draft.parentMailboxInput).toMatchObject({
      parentThreadId: run.parentThreadId,
      parentRunId: run.parentRunId,
      parentMessageId: "assistant-message",
      type: SUBAGENT_PARENT_APPROVAL_REQUEST_MAILBOX_TYPE,
      deliveryState: "queued",
      idempotencyKey: draft.idempotencyKey,
      createdAt: "2026-06-06T16:00:00.000Z",
    });
    expect(parentPayload).toMatchObject({
      schemaVersion: SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION,
      childRunId: run.id,
      childThreadId: run.childThreadId,
      canonicalTaskPath: run.canonicalTaskPath,
      approvalId: "approval-worker-write",
      requestedScope: "always",
      effectiveScope: "this_child_thread",
      childAlwaysDefaulted: true,
      requestedToolId: "builtin:write_file",
      requestedToolCategory: "workspace.write",
      waitBarrierId: waitBarrier.id,
      parentBlockingState: {
        status: "blocked_on_child_approval",
        action: "forward_child_approval_then_wait",
        resumeAction: "wait_agent",
        resumeParentBlocking: true,
        childRunId: run.id,
        childThreadId: run.childThreadId,
        waitBarrierId: waitBarrier.id,
        waitBarrierStatus: "waiting_on_children",
      },
      waitBarrier: expect.objectContaining({ id: waitBarrier.id, status: "waiting_on_children" }),
    });
    expect(parentPayload.instruction).toContain("then return the parent to waiting on this child");
    expect(parentPayload.prompt.length).toBeLessThanOrEqual(1200);
    expect(childPayload).toMatchObject({
      childRunId: run.id,
      childThreadId: run.childThreadId,
      approvalId: "approval-worker-write",
      effectiveScope: "this_child_thread",
      parentBlockingState: expect.objectContaining({ resumeParentBlocking: true }),
    });
    expect(draft.runEventInput.preview).toMatchObject({
      schemaVersion: SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION,
      idempotencyKey: draft.idempotencyKey,
      childRunId: run.id,
      childThreadId: run.childThreadId,
      approvalId: "approval-worker-write",
      effectiveScope: "this_child_thread",
      childAlwaysDefaulted: true,
      resumeParentBlocking: true,
      waitBarrierId: waitBarrier.id,
    });
  });

  it("builds scoped approval responses that are sent to the child while preserving parent blocking", () => {
    const run = childRun({ status: "needs_attention" });
    const waitBarrier = barrier({ status: "waiting_on_children" });
    const draft = buildSubagentApprovalResponseBridgeDraft({
      run,
      waitBarrier,
      createdAt: "2026-06-06T16:05:00.000Z",
      approvalId: "approval-worker-write",
      approvalRequestId: "request-1",
      decision: "approved",
      requestedScope: "always",
      userDecision: `Approve this child write for the rest of the child run. ${"audit ".repeat(200)}`,
      toolCallId: "tool-approval",
    });
    const childPayload = draft.childMailboxInput.payload as Record<string, any>;
    const parentPayload = draft.parentMailboxInput.payload as Record<string, any>;

    expect(draft.childMailboxInput).toMatchObject({
      direction: "parent_to_child",
      type: SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE,
      deliveryState: "queued",
      createdAt: "2026-06-06T16:05:00.000Z",
    });
    expect(draft.parentMailboxInput).toMatchObject({
      type: SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE,
      deliveryState: "delivered",
      idempotencyKey: draft.idempotencyKey,
      createdAt: "2026-06-06T16:05:00.000Z",
      deliveredAt: "2026-06-06T16:05:00.000Z",
    });
    expect(childPayload).toMatchObject({
      schemaVersion: SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION,
      childRunId: run.id,
      childThreadId: run.childThreadId,
      approvalId: "approval-worker-write",
      approvalRequestId: "request-1",
      decision: "approved",
      effectiveScope: "this_child_thread",
      childAlwaysDefaulted: true,
      toolCallId: "tool-approval",
      resumeParentBlocking: true,
      parentBlockingState: {
        action: "forward_child_approval_then_wait",
        resumeAction: "wait_agent",
        resumeParentBlocking: true,
        childRunId: run.id,
        childThreadId: run.childThreadId,
        waitBarrierId: waitBarrier.id,
      },
    });
    expect(childPayload.userDecisionPreview.length).toBeLessThanOrEqual(600);
    expect(parentPayload).toEqual(childPayload);
    expect(draft.runEventInput.preview).toMatchObject({
      approvalId: "approval-worker-write",
      approvalRequestId: "request-1",
      decision: "approved",
      requestedScope: "always",
      effectiveScope: "this_child_thread",
      childAlwaysDefaulted: true,
      parentBlockingState: expect.objectContaining({
        action: "forward_child_approval_then_wait",
        resumeParentBlocking: true,
        waitBarrierId: waitBarrier.id,
      }),
      resumeParentBlocking: true,
      waitBarrierId: waitBarrier.id,
    });
  });

  it("records approval responses into the child mailbox and parent audit event idempotently", () => {
    const run = childRun({ status: "needs_attention", parentMessageId: "assistant-message" });
    const waitBarrier = barrier({ status: "waiting_on_children" });
    const store = new FakeApprovalBridgeStore();

    const first = recordSubagentApprovalResponseBridgeIfNeeded({
      store,
      run,
      waitBarrier,
      approvalId: "approval-worker-write",
      approvalRequestId: "request-1",
      decision: "approved",
      requestedScope: "always",
      userDecision: "Approve this child write for the rest of the child run.",
      toolCallId: "tool-approval",
      createdAt: "2026-06-06T16:10:00.000Z",
    });
    const replay = recordSubagentApprovalResponseBridgeIfNeeded({
      store,
      run,
      waitBarrier,
      approvalId: "approval-worker-write",
      approvalRequestId: "request-1",
      decision: "approved",
      requestedScope: "always",
      userDecision: "Approve this child write for the rest of the child run.",
      toolCallId: "tool-approval",
      createdAt: "2026-06-06T16:11:00.000Z",
    });

    expect(first).toMatchObject({
      schemaVersion: SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION,
      replay: false,
      childMailboxEvent: {
        id: "mailbox-1",
        runId: run.id,
        direction: "parent_to_child",
        type: SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE,
        deliveryState: "queued",
        payload: expect.objectContaining({
          approvalId: "approval-worker-write",
          approvalRequestId: "request-1",
          decision: "approved",
          effectiveScope: "this_child_thread",
          childAlwaysDefaulted: true,
          resumeParentBlocking: true,
          parentBlockingState: expect.objectContaining({
            action: "forward_child_approval_then_wait",
            resumeParentBlocking: true,
            waitBarrierId: waitBarrier.id,
          }),
        }),
      },
      parentMailboxEvent: {
        id: "parent-mailbox-1",
        parentThreadId: run.parentThreadId,
        parentRunId: run.parentRunId,
        parentMessageId: "assistant-message",
        type: SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE,
        deliveryState: "delivered",
      },
      runEvent: {
        type: SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE,
        preview: expect.objectContaining({
          approvalId: "approval-worker-write",
          decision: "approved",
          requestedScope: "always",
          effectiveScope: "this_child_thread",
          childAlwaysDefaulted: true,
          parentBlockingState: expect.objectContaining({
            action: "forward_child_approval_then_wait",
            resumeParentBlocking: true,
            waitBarrierId: waitBarrier.id,
          }),
          resumeParentBlocking: true,
          childMailboxEventId: "mailbox-1",
          parentMailboxEventId: "parent-mailbox-1",
        }),
      },
    });
    expect(replay).toMatchObject({
      replay: true,
      idempotencyKey: first.idempotencyKey,
      childMailboxEvent: expect.objectContaining({ id: "mailbox-1" }),
      runEvent: expect.objectContaining({ sequence: 1 }),
    });
    expect(store.mailboxEvents.get(run.id)).toHaveLength(1);
    expect(store.parentMailboxEvents).toHaveLength(1);
    expect(store.runEvents.get(run.id)).toHaveLength(1);
  });
});

class FakeApprovalBridgeStore {
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
      createdAt: input.createdAt ?? "2026-06-06T16:10:00.000Z",
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
      createdAt: input.createdAt ?? "2026-06-06T16:10:00.000Z",
      updatedAt: input.createdAt ?? "2026-06-06T16:10:00.000Z",
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
      createdAt: input.createdAt ?? "2026-06-06T16:10:00.000Z",
      ...(input.preview !== undefined ? { preview: input.preview } : {}),
      ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
    };
    events.push(event);
    this.runEvents.set(runId, events);
    return event;
  }
}

function childRun(overrides: {
  status?: SubagentRunStatus;
  parentMessageId?: string;
} = {}): SubagentRunSummary {
  return {
    id: "child-run",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    ...(overrides.parentMessageId ? { parentMessageId: overrides.parentMessageId } : {}),
    childThreadId: "child-thread",
    canonicalTaskPath: "root/1:worker",
    roleId: "worker",
    dependencyMode: "required",
    status: overrides.status ?? "running",
  } as SubagentRunSummary;
}

function barrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier-required",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    createdAt: "2026-06-06T15:59:00.000Z",
    updatedAt: "2026-06-06T15:59:00.000Z",
    ...overrides,
  };
}
