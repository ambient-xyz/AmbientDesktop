import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import {
  createSubagentIdempotencyKey,
  createSubagentPayloadFingerprint,
  findSubagentRunEventByIdempotencyKey,
} from "./subagentIdempotency";
import { compactSubagentWaitBarrier } from "./subagentWaitMailbox";

export const SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION = "ambient-subagent-approval-bridge-v1" as const;
export const SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE = "subagent.approval_requested" as const;
export const SUBAGENT_PARENT_APPROVAL_REQUEST_MAILBOX_TYPE = "subagent.child_approval_requested" as const;
export const SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE = "subagent.approval_response" as const;
export const SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE = "subagent.child_approval_forwarded" as const;

export const SUBAGENT_APPROVAL_SCOPES = [
  "this_action",
  "this_child_thread",
  "parent_thread_tree",
  "project",
  "global",
] as const;
export const SUBAGENT_APPROVAL_DECISIONS = ["approved", "denied"] as const;

export type SubagentApprovalScope = typeof SUBAGENT_APPROVAL_SCOPES[number];
export type SubagentApprovalDecision = typeof SUBAGENT_APPROVAL_DECISIONS[number];

export interface SubagentApprovalScopeResolution {
  requestedScope: string;
  effectiveScope: SubagentApprovalScope;
  childAlwaysDefaulted: boolean;
  label: string;
  reason: string;
}

export interface SubagentApprovalRequestInput {
  approvalId: string;
  title: string;
  prompt: string;
  requestedAction?: string;
  requestedToolId?: string;
  requestedToolCategory?: string;
  requestedScope?: string;
}

export interface SubagentApprovalRequestBridgeDraft {
  idempotencyKey: string;
  scope: SubagentApprovalScopeResolution;
  childMailboxInput: {
    direction: "child_to_parent";
    type: typeof SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE;
    deliveryState: "delivered";
    createdAt: string;
    deliveredAt: string;
    payload: Record<string, unknown>;
  };
  parentMailboxInput: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    type: typeof SUBAGENT_PARENT_APPROVAL_REQUEST_MAILBOX_TYPE;
    deliveryState: "queued";
    idempotencyKey: string;
    createdAt: string;
    payload: Record<string, unknown>;
  };
  runEventInput: {
    type: typeof SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE;
    createdAt: string;
    preview: Record<string, unknown>;
  };
}

export interface SubagentApprovalResponseBridgeDraft {
  idempotencyKey: string;
  scope: SubagentApprovalScopeResolution;
  childMailboxInput: {
    direction: "parent_to_child";
    type: typeof SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE;
    deliveryState: "queued";
    createdAt: string;
    payload: Record<string, unknown>;
  };
  parentMailboxInput: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    type: typeof SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE;
    deliveryState: "delivered";
    idempotencyKey: string;
    createdAt: string;
    deliveredAt: string;
    payload: Record<string, unknown>;
  };
  runEventInput: {
    type: typeof SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE;
    createdAt: string;
    preview: Record<string, unknown>;
  };
}

export interface SubagentApprovalBridgeRecorderStore {
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
  listSubagentMailboxEvents(runId: string): SubagentMailboxEventSummary[];
  appendSubagentMailboxEvent(runId: string, input: {
    direction: "parent_to_child" | "child_to_parent";
    type: string;
    payload: unknown;
    deliveryState?: SubagentMailboxDeliveryState;
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentMailboxEventSummary;
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
  }): SubagentParentMailboxEventSummary;
  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary;
}

export interface SubagentApprovalRequestBridgeRecord {
  schemaVersion: typeof SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION;
  replay: boolean;
  idempotencyKey: string;
  childMailboxEvent?: SubagentMailboxEventSummary;
  parentMailboxEvent?: SubagentParentMailboxEventSummary;
  runEvent?: SubagentRunEventSummary;
}

export interface SubagentApprovalResponseBridgeRecord {
  schemaVersion: typeof SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION;
  replay: boolean;
  idempotencyKey: string;
  childMailboxEvent?: SubagentMailboxEventSummary;
  parentMailboxEvent?: SubagentParentMailboxEventSummary;
  runEvent?: SubagentRunEventSummary;
}

export function resolveSubagentApprovalScope(input: {
  requestedScope?: string;
  decision?: SubagentApprovalDecision;
}): SubagentApprovalScopeResolution {
  const requestedScope = normalizeScopeToken(input.requestedScope) ?? "this_action";
  const effectiveScope = effectiveApprovalScope(requestedScope);
  const childAlwaysDefaulted = requestedScope === "always" && effectiveScope === "this_child_thread";
  return {
    requestedScope,
    effectiveScope,
    childAlwaysDefaulted,
    label: approvalScopeLabel(effectiveScope),
    reason: childAlwaysDefaulted
      ? "Child always grants default to this child thread so approval does not silently widen to the parent tree or project."
      : input.decision === "denied"
      ? "Denied approval grants apply only to the original child approval request."
      : `Approval grant applies to ${approvalScopeLabel(effectiveScope)}.`,
  };
}

export function recordSubagentApprovalRequestBridgeIfNeeded(input: {
  store: SubagentApprovalBridgeRecorderStore;
  run: SubagentRunSummary;
  approval: SubagentApprovalRequestInput;
  waitBarrier?: SubagentWaitBarrierSummary;
  createdAt?: string;
  explicitIdempotencyKey?: string;
}): SubagentApprovalRequestBridgeRecord {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const draft = buildSubagentApprovalRequestBridgeDraft({
    run: input.run,
    approval: input.approval,
    ...(input.waitBarrier ? { waitBarrier: input.waitBarrier } : {}),
    createdAt,
    ...(input.explicitIdempotencyKey ? { explicitIdempotencyKey: input.explicitIdempotencyKey } : {}),
  });
  const existing = findSubagentRunEventByIdempotencyKey(
    input.store.listSubagentRunEvents(input.run.id),
    SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE,
    draft.idempotencyKey,
  );
  if (existing) {
    const childMailboxEventId = optionalString(recordValue(existing.preview)?.childMailboxEventId);
    const childMailboxEvent = childMailboxEventId
      ? input.store.listSubagentMailboxEvents(input.run.id).find((event) => event.id === childMailboxEventId)
      : undefined;
    return {
      schemaVersion: SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION,
      replay: true,
      idempotencyKey: draft.idempotencyKey,
      ...(childMailboxEvent ? { childMailboxEvent } : {}),
      runEvent: existing,
    };
  }
  const childMailboxEvent = input.store.appendSubagentMailboxEvent(input.run.id, draft.childMailboxInput);
  const parentMailboxEvent = input.store.appendSubagentParentMailboxEvent(draft.parentMailboxInput);
  const runEvent = input.store.appendSubagentRunEvent(input.run.id, {
    ...draft.runEventInput,
    preview: {
      ...draft.runEventInput.preview,
      childMailboxEventId: childMailboxEvent.id,
      parentMailboxEventId: parentMailboxEvent.id,
    },
  });
  return {
    schemaVersion: SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION,
    replay: false,
    idempotencyKey: draft.idempotencyKey,
    childMailboxEvent,
    parentMailboxEvent,
    runEvent,
  };
}

export function recordSubagentApprovalResponseBridgeIfNeeded(input: {
  store: SubagentApprovalBridgeRecorderStore;
  run: SubagentRunSummary;
  approvalId: string;
  approvalRequestId?: string;
  decision: SubagentApprovalDecision;
  requestedScope?: string;
  userDecision?: string;
  waitBarrier?: SubagentWaitBarrierSummary;
  createdAt?: string;
  toolCallId?: string;
  explicitIdempotencyKey?: string;
}): SubagentApprovalResponseBridgeRecord {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const draft = buildSubagentApprovalResponseBridgeDraft({
    run: input.run,
    approvalId: input.approvalId,
    ...(input.approvalRequestId ? { approvalRequestId: input.approvalRequestId } : {}),
    decision: input.decision,
    ...(input.requestedScope ? { requestedScope: input.requestedScope } : {}),
    ...(input.userDecision ? { userDecision: input.userDecision } : {}),
    ...(input.waitBarrier ? { waitBarrier: input.waitBarrier } : {}),
    createdAt,
    ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    ...(input.explicitIdempotencyKey ? { explicitIdempotencyKey: input.explicitIdempotencyKey } : {}),
  });
  const existing = findSubagentRunEventByIdempotencyKey(
    input.store.listSubagentRunEvents(input.run.id),
    SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE,
    draft.idempotencyKey,
  );
  if (existing) {
    const childMailboxEventId = optionalString(recordValue(existing.preview)?.childMailboxEventId);
    const childMailboxEvent = childMailboxEventId
      ? input.store.listSubagentMailboxEvents(input.run.id).find((event) => event.id === childMailboxEventId)
      : undefined;
    return {
      schemaVersion: SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION,
      replay: true,
      idempotencyKey: draft.idempotencyKey,
      ...(childMailboxEvent ? { childMailboxEvent } : {}),
      runEvent: existing,
    };
  }
  const childMailboxEvent = input.store.appendSubagentMailboxEvent(input.run.id, draft.childMailboxInput);
  const parentMailboxEvent = input.store.appendSubagentParentMailboxEvent(draft.parentMailboxInput);
  const runEvent = input.store.appendSubagentRunEvent(input.run.id, {
    ...draft.runEventInput,
    preview: {
      ...draft.runEventInput.preview,
      childMailboxEventId: childMailboxEvent.id,
      parentMailboxEventId: parentMailboxEvent.id,
    },
  });
  return {
    schemaVersion: SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION,
    replay: false,
    idempotencyKey: draft.idempotencyKey,
    childMailboxEvent,
    parentMailboxEvent,
    runEvent,
  };
}

export function buildSubagentApprovalRequestBridgeDraft(input: {
  run: SubagentRunSummary;
  approval: SubagentApprovalRequestInput;
  waitBarrier?: SubagentWaitBarrierSummary;
  createdAt: string;
  explicitIdempotencyKey?: string;
}): SubagentApprovalRequestBridgeDraft {
  const approval = normalizeApprovalRequest(input.approval);
  const scope = resolveSubagentApprovalScope({ requestedScope: approval.requestedScope });
  const idempotencyKey = input.explicitIdempotencyKey ?? createSubagentApprovalRequestIdempotencyKey({
    run: input.run,
    approval,
    waitBarrier: input.waitBarrier,
    scope,
  });
  const basePayload = approvalBridgeBasePayload(input.run, input.waitBarrier);
  const approvalPayload = compactApprovalRequestPayload(approval, scope);
  const parentBlockingState = parentBlockingResumeState(input.run, input.waitBarrier);
  return {
    idempotencyKey,
    scope,
    childMailboxInput: {
      direction: "child_to_parent",
      type: SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE,
      deliveryState: "delivered",
      createdAt: input.createdAt,
      deliveredAt: input.createdAt,
      payload: {
        schemaVersion: SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION,
        idempotencyKey,
        ...basePayload,
        ...approvalPayload,
        parentBlockingState,
      },
    },
    parentMailboxInput: {
      parentThreadId: input.run.parentThreadId,
      parentRunId: input.run.parentRunId,
      ...(input.run.parentMessageId ? { parentMessageId: input.run.parentMessageId } : {}),
      type: SUBAGENT_PARENT_APPROVAL_REQUEST_MAILBOX_TYPE,
      deliveryState: "queued",
      idempotencyKey,
      createdAt: input.createdAt,
      payload: {
        schemaVersion: SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION,
        idempotencyKey,
        ...basePayload,
        ...approvalPayload,
        parentBlockingState,
        instruction: "Forward this child approval request with the child run and thread identifiers, then return the parent to waiting on this child.",
      },
    },
    runEventInput: {
      type: SUBAGENT_CHILD_APPROVAL_REQUEST_MAILBOX_TYPE,
      createdAt: input.createdAt,
      preview: {
        schemaVersion: SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION,
        idempotencyKey,
        childRunId: input.run.id,
        childThreadId: input.run.childThreadId,
        approvalId: approval.approvalId,
        effectiveScope: scope.effectiveScope,
        childAlwaysDefaulted: scope.childAlwaysDefaulted,
        resumeParentBlocking: true,
        ...(input.waitBarrier ? { waitBarrierId: input.waitBarrier.id } : {}),
      },
    },
  };
}

export function buildSubagentApprovalResponseBridgeDraft(input: {
  run: SubagentRunSummary;
  approvalId: string;
  approvalRequestId?: string;
  decision: SubagentApprovalDecision;
  requestedScope?: string;
  userDecision?: string;
  waitBarrier?: SubagentWaitBarrierSummary;
  createdAt: string;
  toolCallId?: string;
  explicitIdempotencyKey?: string;
}): SubagentApprovalResponseBridgeDraft {
  const approvalId = requiredString(input.approvalId, "approvalId");
  const scope = resolveSubagentApprovalScope({
    requestedScope: input.requestedScope,
    decision: input.decision,
  });
  const idempotencyKey = input.explicitIdempotencyKey ?? createSubagentApprovalResponseIdempotencyKey({
    run: input.run,
    approvalId,
    approvalRequestId: input.approvalRequestId,
    decision: input.decision,
    scope,
    waitBarrier: input.waitBarrier,
  });
  const basePayload = approvalBridgeBasePayload(input.run, input.waitBarrier);
  const parentBlockingState = parentBlockingResumeState(input.run, input.waitBarrier);
  const payload = {
    schemaVersion: SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION,
    idempotencyKey,
    ...basePayload,
    approvalId,
    approvalRequestId: input.approvalRequestId ?? null,
    decision: input.decision,
    scope,
    requestedScope: scope.requestedScope,
    effectiveScope: scope.effectiveScope,
    childAlwaysDefaulted: scope.childAlwaysDefaulted,
    userDecisionPreview: input.userDecision ? previewText(input.userDecision, 600) : null,
    ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    parentBlockingState,
    resumeParentBlocking: true,
  };
  return {
    idempotencyKey,
    scope,
    childMailboxInput: {
      direction: "parent_to_child",
      type: SUBAGENT_APPROVAL_RESPONSE_MAILBOX_TYPE,
      deliveryState: "queued",
      createdAt: input.createdAt,
      payload,
    },
    parentMailboxInput: {
      parentThreadId: input.run.parentThreadId,
      parentRunId: input.run.parentRunId,
      ...(input.run.parentMessageId ? { parentMessageId: input.run.parentMessageId } : {}),
      type: SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE,
      deliveryState: "delivered",
      idempotencyKey,
      createdAt: input.createdAt,
      deliveredAt: input.createdAt,
      payload,
    },
    runEventInput: {
      type: SUBAGENT_PARENT_APPROVAL_FORWARDED_MAILBOX_TYPE,
      createdAt: input.createdAt,
      preview: {
        schemaVersion: SUBAGENT_APPROVAL_BRIDGE_SCHEMA_VERSION,
        idempotencyKey,
        childRunId: input.run.id,
        childThreadId: input.run.childThreadId,
        approvalId,
        approvalRequestId: input.approvalRequestId ?? null,
        decision: input.decision,
        requestedScope: scope.requestedScope,
        effectiveScope: scope.effectiveScope,
        childAlwaysDefaulted: scope.childAlwaysDefaulted,
        parentBlockingState,
        resumeParentBlocking: true,
        ...(input.waitBarrier ? { waitBarrierId: input.waitBarrier.id } : {}),
      },
    },
  };
}

export function createSubagentApprovalRequestIdempotencyKey(input: {
  run: Pick<SubagentRunSummary, "id" | "canonicalTaskPath">;
  approval: SubagentApprovalRequestInput;
  waitBarrier?: Pick<SubagentWaitBarrierSummary, "id">;
  scope?: SubagentApprovalScopeResolution;
}): string {
  const approval = normalizeApprovalRequest(input.approval);
  const scope = input.scope ?? resolveSubagentApprovalScope({ requestedScope: approval.requestedScope });
  return createSubagentIdempotencyKey({
    operation: "approval-request",
    childRunId: input.run.id,
    canonicalPath: input.run.canonicalTaskPath,
    payloadFingerprint: createSubagentPayloadFingerprint({
      approvalId: approval.approvalId,
      title: approval.title,
      requestedAction: approval.requestedAction,
      requestedToolId: approval.requestedToolId,
      requestedToolCategory: approval.requestedToolCategory,
      effectiveScope: scope.effectiveScope,
      waitBarrierId: input.waitBarrier?.id,
    }),
  });
}

export function createSubagentApprovalResponseIdempotencyKey(input: {
  run: Pick<SubagentRunSummary, "id" | "canonicalTaskPath">;
  approvalId: string;
  approvalRequestId?: string;
  decision: SubagentApprovalDecision;
  scope: SubagentApprovalScopeResolution;
  waitBarrier?: Pick<SubagentWaitBarrierSummary, "id">;
}): string {
  return createSubagentIdempotencyKey({
    operation: "approval-response",
    childRunId: input.run.id,
    canonicalPath: input.run.canonicalTaskPath,
    payloadFingerprint: createSubagentPayloadFingerprint({
      approvalId: requiredString(input.approvalId, "approvalId"),
      approvalRequestId: input.approvalRequestId,
      decision: input.decision,
      effectiveScope: input.scope.effectiveScope,
      waitBarrierId: input.waitBarrier?.id,
    }),
  });
}

function approvalBridgeBasePayload(
  run: SubagentRunSummary,
  waitBarrier?: SubagentWaitBarrierSummary,
): Record<string, unknown> {
  return {
    parentThreadId: run.parentThreadId,
    parentRunId: run.parentRunId,
    parentMessageId: run.parentMessageId ?? null,
    childRunId: run.id,
    childThreadId: run.childThreadId,
    canonicalTaskPath: run.canonicalTaskPath,
    roleId: run.roleId,
    waitBarrierId: waitBarrier?.id ?? null,
    ...(waitBarrier ? { waitBarrier: compactSubagentWaitBarrier(waitBarrier) } : {}),
  };
}

function compactApprovalRequestPayload(
  approval: SubagentApprovalRequestInput,
  scope: SubagentApprovalScopeResolution,
): Record<string, unknown> {
  return {
    approvalId: approval.approvalId,
    title: previewText(approval.title, 160),
    prompt: previewText(approval.prompt, 1200),
    requestedScope: scope.requestedScope,
    effectiveScope: scope.effectiveScope,
    childAlwaysDefaulted: scope.childAlwaysDefaulted,
    scope,
    ...(approval.requestedAction ? { requestedAction: approval.requestedAction } : {}),
    ...(approval.requestedToolId ? { requestedToolId: approval.requestedToolId } : {}),
    ...(approval.requestedToolCategory ? { requestedToolCategory: approval.requestedToolCategory } : {}),
  };
}

function parentBlockingResumeState(
  run: Pick<SubagentRunSummary, "id" | "childThreadId">,
  waitBarrier?: Pick<SubagentWaitBarrierSummary, "id" | "status">,
): Record<string, unknown> {
  return {
    status: "blocked_on_child_approval",
    action: "forward_child_approval_then_wait",
    resumeAction: "wait_agent",
    resumeParentBlocking: true,
    childRunId: run.id,
    childThreadId: run.childThreadId,
    waitBarrierId: waitBarrier?.id ?? null,
    waitBarrierStatus: waitBarrier?.status ?? null,
  };
}

function normalizeApprovalRequest(input: SubagentApprovalRequestInput): SubagentApprovalRequestInput {
  return {
    approvalId: requiredString(input.approvalId, "approvalId"),
    title: requiredString(input.title, "title"),
    prompt: requiredString(input.prompt, "prompt"),
    ...(optionalString(input.requestedAction) ? { requestedAction: optionalString(input.requestedAction) } : {}),
    ...(optionalString(input.requestedToolId) ? { requestedToolId: optionalString(input.requestedToolId) } : {}),
    ...(optionalString(input.requestedToolCategory) ? { requestedToolCategory: optionalString(input.requestedToolCategory) } : {}),
    ...(optionalString(input.requestedScope) ? { requestedScope: optionalString(input.requestedScope) } : {}),
  };
}

function effectiveApprovalScope(requestedScope: string): SubagentApprovalScope {
  switch (requestedScope) {
    case "this_action":
    case "action":
    case "once":
      return "this_action";
    case "always":
    case "this_child_thread":
    case "child_thread":
    case "thread":
    case "for_thread":
      return "this_child_thread";
    case "parent_thread_tree":
    case "parent_tree":
    case "thread_tree":
      return "parent_thread_tree";
    case "project":
    case "workspace":
    case "for_project":
      return "project";
    case "global":
      return "global";
    default:
      return "this_action";
  }
}

function approvalScopeLabel(scope: SubagentApprovalScope): string {
  switch (scope) {
    case "this_action":
      return "this action";
    case "this_child_thread":
      return "this child thread";
    case "parent_thread_tree":
      return "the parent thread tree";
    case "project":
      return "the project/workspace";
    case "global":
      return "all future matching actions";
  }
}

function normalizeScopeToken(value: string | undefined): string | undefined {
  const normalized = optionalString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  return normalized;
}

function requiredString(value: unknown, field: string): string {
  const normalized = optionalString(value);
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function previewText(text: string, limit: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}
