import { describe, expect, it } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../shared/ambientModels";
import { resolveSubagentCapacityLease } from "../shared/subagentCapacity";
import { AMBIENT_SUBAGENT_PROTOCOL_VERSION, type SubagentRunStatus } from "../shared/subagentProtocol";
import { getDefaultSubagentRoleProfile } from "../shared/subagentRoles";
import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../shared/types";
import {
  recordSubagentApprovalRequestBridgeIfNeeded,
  SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE,
  SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE,
  SUBAGENT_PARENT_APPROVAL_REQUEST_MAILBOX_TYPE,
} from "./subagentApprovalBridge";
import {
  resolveSubagentApprovalDecision,
  SUBAGENT_APPROVAL_RESOLUTION_SCHEMA_VERSION,
} from "./subagentApprovalDecision";

describe("subagentApprovalDecision", () => {
  it("records a UI approval response, consumes the parent request, and keeps the parent blocked", () => {
    const run = childRun({ status: "needs_attention", parentMessageId: "assistant-message" });
    const waitBarrier = barrier({ status: "waiting_on_children" });
    const store = new FakeApprovalDecisionStore({ run, waitBarrier });
    const request = recordSubagentApprovalRequestBridgeIfNeeded({
      store,
      run,
      waitBarrier,
      createdAt: "2026-06-06T17:00:00.000Z",
      approval: {
        approvalId: "approval-worker-write",
        title: "Allow workspace write",
        prompt: "Child wants to write files.",
        requestedToolId: "file_write",
        requestedToolCategory: "workspace.write",
        requestedScope: "always",
      },
    });

    const result = resolveSubagentApprovalDecision(store, {
      childRunId: run.id,
      approvalId: "approval-worker-write",
      decision: "approved",
      approvalRequestParentMailboxEventId: request.parentMailboxEvent?.id,
      userDecision: "Approve workspace writes for this child run.",
    }, { now: "2026-06-06T17:05:00.000Z" });
    const replay = resolveSubagentApprovalDecision(store, {
      childRunId: run.id,
      approvalId: "approval-worker-write",
      decision: "approved",
      approvalRequestParentMailboxEventId: request.parentMailboxEvent?.id,
      userDecision: "Approve workspace writes for this child run.",
    }, { now: "2026-06-06T17:06:00.000Z" });

    expect(result).toMatchObject({
      schemaVersion: SUBAGENT_APPROVAL_RESOLUTION_SCHEMA_VERSION,
      replay: false,
      childRun: expect.objectContaining({ id: run.id }),
      approvalId: "approval-worker-write",
      decision: "approved",
      requestedScope: "always",
      effectiveScope: "this_child_thread",
      childAlwaysDefaulted: true,
      parentRemainsBlocked: true,
      approvalRequestParentMailboxEvent: {
        id: request.parentMailboxEvent?.id,
        type: SUBAGENT_PARENT_APPROVAL_REQUEST_MAILBOX_TYPE,
        deliveryState: "consumed",
        deliveredAt: "2026-06-06T17:05:00.000Z",
      },
      approvalResponseChildMailboxEvent: {
        direction: "parent_to_child",
        type: SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE,
        deliveryState: "queued",
        payload: expect.objectContaining({
          approvalId: "approval-worker-write",
          approvalRequestId: request.parentMailboxEvent?.id,
          decision: "approved",
          requestedScope: "always",
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
      approvalForwardedParentMailboxEvent: {
        type: SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE,
        deliveryState: "delivered",
      },
      approvalRunEvent: {
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
          childMailboxEventId: result.approvalResponseChildMailboxEvent?.id,
          parentMailboxEventId: result.approvalForwardedParentMailboxEvent?.id,
        }),
      },
      waitBarrier: expect.objectContaining({ id: waitBarrier.id, status: "waiting_on_children" }),
    });
    expect(replay).toMatchObject({
      replay: true,
      approvalResponseChildMailboxEvent: expect.objectContaining({ id: result.approvalResponseChildMailboxEvent?.id }),
      approvalForwardedParentMailboxEvent: expect.objectContaining({ id: result.approvalForwardedParentMailboxEvent?.id }),
      approvalRunEvent: expect.objectContaining({ sequence: result.approvalRunEvent?.sequence }),
    });
    expect(store.listSubagentMailboxEvents(run.id).filter((event) => event.type === SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE)).toHaveLength(1);
    expect(store.listSubagentParentMailboxEventsForParentRun(run.parentRunId).filter((event) => event.type === SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE)).toHaveLength(1);
  });

  it("rejects unanchored approval decisions before writing a child response", () => {
    const run = childRun({ status: "needs_attention" });
    const store = new FakeApprovalDecisionStore({ run, waitBarrier: barrier() });

    expect(() => resolveSubagentApprovalDecision(store, {
      childRunId: run.id,
      approvalId: "missing-approval",
      decision: "approved",
    })).toThrow(/approval request not found/i);
    expect(store.listSubagentMailboxEvents(run.id)).toEqual([]);
  });

  it("rejects stale approvals for cancelled child runs", () => {
    const run = childRun({ status: "cancelled" });
    const store = new FakeApprovalDecisionStore({ run, waitBarrier: barrier({ status: "cancelled" }) });

    expect(() => resolveSubagentApprovalDecision(store, {
      childRunId: run.id,
      approvalId: "approval-worker-write",
      decision: "denied",
    })).toThrow(/stale/i);
  });
});

class FakeApprovalDecisionStore {
  readonly runEvents = new Map<string, SubagentRunEventSummary[]>();
  readonly mailboxEvents = new Map<string, SubagentMailboxEventSummary[]>();
  readonly parentMailboxEvents: SubagentParentMailboxEventSummary[] = [];

  constructor(private readonly input: { run: SubagentRunSummary; waitBarrier: SubagentWaitBarrierSummary }) {}

  getSubagentRun(runId: string): SubagentRunSummary {
    if (runId !== this.input.run.id) throw new Error(`Unknown child run ${runId}`);
    return this.input.run;
  }

  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[] {
    return parentRunId === this.input.run.parentRunId ? [this.input.waitBarrier] : [];
  }

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
      createdAt: input.createdAt ?? "2026-06-06T17:00:00.000Z",
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
      createdAt: input.createdAt ?? "2026-06-06T17:00:00.000Z",
      updatedAt: input.createdAt ?? "2026-06-06T17:00:00.000Z",
      ...(input.deliveredAt ? { deliveredAt: input.deliveredAt } : {}),
    };
    this.parentMailboxEvents.push(event);
    return event;
  }

  listSubagentParentMailboxEventsForParentRun(parentRunId: string): SubagentParentMailboxEventSummary[] {
    return this.parentMailboxEvents.filter((event) => event.parentRunId === parentRunId);
  }

  getSubagentParentMailboxEvent(id: string): SubagentParentMailboxEventSummary {
    const event = this.parentMailboxEvents.find((candidate) => candidate.id === id);
    if (!event) throw new Error(`Missing parent mailbox event ${id}`);
    return event;
  }

  updateSubagentParentMailboxEventDeliveryState(
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentParentMailboxEventSummary {
    const index = this.parentMailboxEvents.findIndex((event) => event.id === id);
    if (index < 0) throw new Error(`Missing parent mailbox event ${id}`);
    const existing = this.parentMailboxEvents[index]!;
    const { deliveredAt: _deliveredAt, ...existingWithoutDeliveredAt } = existing;
    const nextDeliveredAt = options?.deliveredAt === null
      ? undefined
      : options?.deliveredAt ?? existing.deliveredAt ?? options?.now;
    const next: SubagentParentMailboxEventSummary = {
      ...existingWithoutDeliveredAt,
      deliveryState,
      updatedAt: options?.now ?? existing.updatedAt,
      ...(nextDeliveredAt ? { deliveredAt: nextDeliveredAt } : {}),
    };
    this.parentMailboxEvents[index] = next;
    return next;
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
      createdAt: input.createdAt ?? "2026-06-06T17:00:00.000Z",
      ...(input.preview !== undefined ? { preview: input.preview } : {}),
      ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
    };
    events.push(event);
    this.runEvents.set(runId, events);
    return event;
  }
}

function childRun(overrides: { status?: SubagentRunStatus; parentMessageId?: string } = {}): SubagentRunSummary {
  const modelRuntimeSnapshot = createAmbientModelRuntimeSnapshot("glm-5.1");
  return {
    id: "child-run",
    protocolVersion: AMBIENT_SUBAGENT_PROTOCOL_VERSION,
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    ...(overrides.parentMessageId ? { parentMessageId: overrides.parentMessageId } : {}),
    childThreadId: "child-thread",
    canonicalTaskPath: "root/0:worker",
    roleId: "worker",
    roleProfileSnapshot: getDefaultSubagentRoleProfile("worker"),
    roleProfileSnapshotSource: "resolved",
    modelRuntimeSnapshot,
    capacityLeaseSnapshot: resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: "root/0:worker",
      roleId: "worker",
      model: modelRuntimeSnapshot.profile,
      now: "2026-06-06T17:00:00.000Z",
    }),
    dependencyMode: "required",
    status: overrides.status ?? "needs_attention",
    featureFlagSnapshot: { schemaVersion: "ambient-feature-flags-v1", generatedAt: "2026-06-06T17:00:00.000Z", flags: {} as any },
    createdAt: "2026-06-06T17:00:00.000Z",
    updatedAt: "2026-06-06T17:00:00.000Z",
  };
}

function barrier(overrides: Partial<SubagentWaitBarrierSummary> = {}): SubagentWaitBarrierSummary {
  return {
    id: "barrier-1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    childRunIds: ["child-run"],
    dependencyMode: "required_all",
    status: "waiting_on_children",
    failurePolicy: "ask_user",
    timeoutMs: 30000,
    createdAt: "2026-06-06T17:00:00.000Z",
    updatedAt: "2026-06-06T17:00:00.000Z",
    ...overrides,
  };
}
