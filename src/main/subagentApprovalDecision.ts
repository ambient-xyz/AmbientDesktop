import type {
  ResolveSubagentApprovalInput,
  SubagentApprovalResolutionResult,
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../shared/types";
import {
  recordSubagentApprovalResponseBridgeIfNeeded,
  resolveSubagentApprovalScope,
  SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION,
  SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE,
  SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE,
  SUBAGENT_PARENT_APPROVAL_REQUEST_MAILBOX_TYPE,
  type SubagentApprovalBridgeRecorderStore,
} from "./subagentApprovalBridge";

export const SUBAGENT_APPROVAL_RESOLUTION_SCHEMA_VERSION =
  "ambient-subagent-approval-resolution-v1" as const;

export interface SubagentApprovalDecisionStore extends SubagentApprovalBridgeRecorderStore {
  getSubagentRun(runId: string): SubagentRunSummary;
  listSubagentParentMailboxEventsForParentRun(parentRunId: string): SubagentParentMailboxEventSummary[];
  getSubagentParentMailboxEvent(id: string): SubagentParentMailboxEventSummary;
  updateSubagentParentMailboxEventDeliveryState?(
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: { now?: string; deliveredAt?: string | null },
  ): SubagentParentMailboxEventSummary;
  listSubagentWaitBarriersForParentRun(parentRunId: string): SubagentWaitBarrierSummary[];
}

export function resolveSubagentApprovalDecision(
  store: SubagentApprovalDecisionStore,
  input: ResolveSubagentApprovalInput,
  options: { now?: string } = {},
): SubagentApprovalResolutionResult {
  const now = options.now ?? new Date().toISOString();
  const run = store.getSubagentRun(input.childRunId);
  if (run.status === "cancelled" || run.status === "stopped") {
    throw new Error(`Sub-agent approval is stale because child run ${run.id} is ${run.status}.`);
  }

  const requestParentMailboxEvent = resolveApprovalRequestParentMailboxEvent(store, run, input);
  const requestPayload = recordValue(requestParentMailboxEvent?.payload);
  const requestedScope = normalizeString(input.requestedScope) ??
    normalizeString(requestPayload?.requestedScope) ??
    "this_action";
  const approvalScope = resolveSubagentApprovalScope({ requestedScope, decision: input.decision });
  const waitBarrier = resolveApprovalWaitBarrier(store, run, requestPayload);
  const approvalRequestChildMailboxEvent = resolveApprovalRequestChildMailboxEvent(store, run, input, requestPayload);
  if (!requestParentMailboxEvent && !approvalRequestChildMailboxEvent) {
    throw new Error(`Sub-agent approval request not found for child run ${run.id} and approval ${input.approvalId}.`);
  }
  const explicitIdempotencyKey = [
    "subagent",
    "approval-decision",
    run.id,
    input.approvalId,
    requestParentMailboxEvent?.id ?? approvalRequestChildMailboxEvent?.id ?? "unanchored-request",
    input.decision,
    approvalScope.effectiveScope,
  ].join(":");

  const bridge = recordSubagentApprovalResponseBridgeIfNeeded({
    store,
    run,
    approvalId: input.approvalId,
    ...(requestParentMailboxEvent?.id ?? approvalRequestChildMailboxEvent?.id
      ? { approvalRequestId: requestParentMailboxEvent?.id ?? approvalRequestChildMailboxEvent?.id }
      : {}),
    decision: input.decision,
    requestedScope,
    ...(input.userDecision ? { userDecision: input.userDecision } : {}),
    ...(waitBarrier ? { waitBarrier } : {}),
    createdAt: now,
    explicitIdempotencyKey,
  });
  const consumedRequestParentMailboxEvent = requestParentMailboxEvent &&
    requestParentMailboxEvent.deliveryState === "queued" &&
    store.updateSubagentParentMailboxEventDeliveryState
    ? store.updateSubagentParentMailboxEventDeliveryState(requestParentMailboxEvent.id, "consumed", {
      now,
      deliveredAt: requestParentMailboxEvent.deliveredAt ?? now,
    })
    : requestParentMailboxEvent;
  const approvalForwardedParentMailboxEvent = bridge.parentMailboxEvent ??
    resolveApprovalForwardedParentMailboxEvent(store, run, input.approvalId, bridge.runEvent, explicitIdempotencyKey);

  return {
    schemaVersion: SUBAGENT_APPROVAL_RESOLUTION_SCHEMA_VERSION,
    replay: bridge.replay,
    childRun: run,
    approvalId: input.approvalId,
    decision: input.decision,
    requestedScope: approvalScope.requestedScope,
    effectiveScope: approvalScope.effectiveScope,
    childAlwaysDefaulted: approvalScope.childAlwaysDefaulted,
    parentRemainsBlocked: waitBarrier?.status === "waiting_on_children",
    ...(consumedRequestParentMailboxEvent ? { approvalRequestParentMailboxEvent: consumedRequestParentMailboxEvent } : {}),
    ...(approvalRequestChildMailboxEvent ? { approvalRequestChildMailboxEvent } : {}),
    ...(bridge.childMailboxEvent ? { approvalResponseChildMailboxEvent: bridge.childMailboxEvent } : {}),
    ...(approvalForwardedParentMailboxEvent ? { approvalForwardedParentMailboxEvent } : {}),
    ...(bridge.runEvent ? { approvalRunEvent: bridge.runEvent } : {}),
    ...(waitBarrier ? { waitBarrier } : {}),
  };
}

function resolveApprovalRequestParentMailboxEvent(
  store: SubagentApprovalDecisionStore,
  run: SubagentRunSummary,
  input: ResolveSubagentApprovalInput,
): SubagentParentMailboxEventSummary | undefined {
  if (input.approvalRequestParentMailboxEventId) {
    const event = store.getSubagentParentMailboxEvent(input.approvalRequestParentMailboxEventId);
    assertApprovalRequestParentMailboxEventMatches(event, run, input.approvalId);
    return event;
  }
  return store
    .listSubagentParentMailboxEventsForParentRun(run.parentRunId)
    .filter((event) => event.type === SUBAGENT_PARENT_APPROVAL_REQUEST_MAILBOX_TYPE)
    .filter((event) => parentMailboxApprovalPayloadMatches(event, run, input.approvalId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
}

function assertApprovalRequestParentMailboxEventMatches(
  event: SubagentParentMailboxEventSummary,
  run: SubagentRunSummary,
  approvalId: string,
): void {
  if (event.type !== SUBAGENT_PARENT_APPROVAL_REQUEST_MAILBOX_TYPE) {
    throw new Error(`Sub-agent approval request ${event.id} has unexpected type ${event.type}.`);
  }
  if (!parentMailboxApprovalPayloadMatches(event, run, approvalId)) {
    throw new Error(`Sub-agent approval request ${event.id} does not belong to child run ${run.id} and approval ${approvalId}.`);
  }
}

function parentMailboxApprovalPayloadMatches(
  event: SubagentParentMailboxEventSummary,
  run: SubagentRunSummary,
  approvalId: string,
): boolean {
  if (event.parentRunId !== run.parentRunId || event.parentThreadId !== run.parentThreadId) return false;
  const payload = recordValue(event.payload);
  return payload?.schemaVersion === SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION &&
    normalizeString(payload.childRunId) === run.id &&
    normalizeString(payload.childThreadId) === run.childThreadId &&
    normalizeString(payload.approvalId) === approvalId;
}

function resolveApprovalRequestChildMailboxEvent(
  store: SubagentApprovalDecisionStore,
  run: SubagentRunSummary,
  input: ResolveSubagentApprovalInput,
  parentPayload: Record<string, unknown> | undefined,
): SubagentMailboxEventSummary | undefined {
  const requestedId = normalizeString(input.approvalRequestChildMailboxEventId) ??
    normalizeString(parentPayload?.childMailboxEventId);
  const events = store.listSubagentMailboxEvents(run.id);
  if (requestedId) {
    const event = events.find((candidate) => candidate.id === requestedId);
    if (!event) throw new Error(`Sub-agent child approval mailbox event not found: ${requestedId}`);
    assertChildApprovalRequestMailboxEventMatches(event, run, input.approvalId);
    return event;
  }
  return events
    .filter((event) => event.type === SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE)
    .filter((event) => childMailboxApprovalPayloadMatches(event, run, input.approvalId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
}

function assertChildApprovalRequestMailboxEventMatches(
  event: SubagentMailboxEventSummary,
  run: SubagentRunSummary,
  approvalId: string,
): void {
  if (!childMailboxApprovalPayloadMatches(event, run, approvalId)) {
    throw new Error(`Sub-agent child approval mailbox event ${event.id} does not belong to child run ${run.id} and approval ${approvalId}.`);
  }
}

function childMailboxApprovalPayloadMatches(
  event: SubagentMailboxEventSummary,
  run: SubagentRunSummary,
  approvalId: string,
): boolean {
  const payload = recordValue(event.payload);
  return event.runId === run.id &&
    event.type === SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE &&
    payload?.schemaVersion === SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION &&
    normalizeString(payload.childRunId) === run.id &&
    normalizeString(payload.childThreadId) === run.childThreadId &&
    normalizeString(payload.approvalId) === approvalId;
}

function resolveApprovalWaitBarrier(
  store: Pick<SubagentApprovalDecisionStore, "listSubagentWaitBarriersForParentRun">,
  run: SubagentRunSummary,
  requestPayload: Record<string, unknown> | undefined,
): SubagentWaitBarrierSummary | undefined {
  const waitBarrierId = normalizeString(requestPayload?.waitBarrierId);
  const barriers = store.listSubagentWaitBarriersForParentRun(run.parentRunId)
    .filter((barrier) => barrier.childRunIds.includes(run.id));
  if (waitBarrierId) return barriers.find((barrier) => barrier.id === waitBarrierId);
  return barriers.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
}

function resolveApprovalForwardedParentMailboxEvent(
  store: Pick<SubagentApprovalDecisionStore, "listSubagentParentMailboxEventsForParentRun">,
  run: SubagentRunSummary,
  approvalId: string,
  runEvent: SubagentRunEventSummary | undefined,
  idempotencyKey: string,
): SubagentParentMailboxEventSummary | undefined {
  const preview = recordValue(runEvent?.preview);
  const parentMailboxEventId = normalizeString(preview?.parentMailboxEventId);
  const forwardedEvents = store
    .listSubagentParentMailboxEventsForParentRun(run.parentRunId)
    .filter((event) => event.type === SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE)
    .filter((event) => forwardedParentMailboxPayloadMatches(event, run, approvalId));
  if (parentMailboxEventId) {
    const byId = forwardedEvents.find((event) => event.id === parentMailboxEventId);
    if (byId) return byId;
  }
  return forwardedEvents.find((event) => event.idempotencyKey === idempotencyKey);
}

function forwardedParentMailboxPayloadMatches(
  event: SubagentParentMailboxEventSummary,
  run: SubagentRunSummary,
  approvalId: string,
): boolean {
  if (event.parentRunId !== run.parentRunId || event.parentThreadId !== run.parentThreadId) return false;
  const payload = recordValue(event.payload);
  return payload?.schemaVersion === SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION &&
    normalizeString(payload.childRunId) === run.id &&
    normalizeString(payload.childThreadId) === run.childThreadId &&
    normalizeString(payload.approvalId) === approvalId;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
