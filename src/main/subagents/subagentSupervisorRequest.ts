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

export const SUBAGENT_SUPERVISOR_REQUEST_SCHEMA_VERSION = "ambient-subagent-supervisor-request-v1" as const;
export const SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE = "subagent.supervisor_request" as const;
export const SUBAGENT_PARENT_SUPERVISOR_REQUEST_MAILBOX_TYPE = "subagent.child_supervisor_request" as const;
export const SUBAGENT_SUPERVISOR_REQUEST_KINDS = ["need_decision", "blocked", "progress_update"] as const;

export type SubagentSupervisorRequestKind = typeof SUBAGENT_SUPERVISOR_REQUEST_KINDS[number];
export type SubagentSupervisorRequestSeverity = "info" | "warning" | "danger";

export interface SubagentSupervisorRequestChoice {
  id: string;
  label: string;
  description?: string;
}

export interface SubagentSupervisorRequestInput {
  kind: SubagentSupervisorRequestKind;
  title: string;
  message: string;
  severity?: SubagentSupervisorRequestSeverity;
  requestedChoices?: readonly SubagentSupervisorRequestChoice[];
  progressLabel?: string;
  blockedReason?: string;
  artifactPath?: string;
  createdAt?: string;
  idempotencyKey?: string;
}

export interface SubagentSupervisorRequestDraft {
  idempotencyKey: string;
  request: SubagentSupervisorRequestInput;
  parentRequiresAttention: boolean;
  childMailboxInput: {
    direction: "child_to_parent";
    type: typeof SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE;
    deliveryState: "delivered";
    createdAt: string;
    deliveredAt: string;
    payload: Record<string, unknown>;
  };
  parentMailboxInput: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    type: typeof SUBAGENT_PARENT_SUPERVISOR_REQUEST_MAILBOX_TYPE;
    deliveryState: "queued" | "delivered";
    idempotencyKey: string;
    createdAt: string;
    deliveredAt?: string;
    payload: Record<string, unknown>;
  };
  runEventInput: {
    type: typeof SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE;
    createdAt: string;
    preview: Record<string, unknown>;
  };
}

export interface SubagentSupervisorRequestRecorderStore {
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

export interface SubagentSupervisorRequestRecord {
  schemaVersion: typeof SUBAGENT_SUPERVISOR_REQUEST_SCHEMA_VERSION;
  replay: boolean;
  idempotencyKey: string;
  request: SubagentSupervisorRequestInput;
  parentRequiresAttention: boolean;
  childMailboxEvent?: SubagentMailboxEventSummary;
  parentMailboxEvent?: SubagentParentMailboxEventSummary;
  runEvent?: SubagentRunEventSummary;
}

export function recordSubagentSupervisorRequestIfNeeded(input: {
  store: SubagentSupervisorRequestRecorderStore;
  run: SubagentRunSummary;
  request: SubagentSupervisorRequestInput;
  waitBarrier?: SubagentWaitBarrierSummary;
  createdAt?: string;
  explicitIdempotencyKey?: string;
}): SubagentSupervisorRequestRecord {
  const createdAt = input.createdAt ?? input.request.createdAt ?? new Date().toISOString();
  const explicitIdempotencyKey = input.explicitIdempotencyKey ?? input.request.idempotencyKey;
  const draft = buildSubagentSupervisorRequestDraft({
    run: input.run,
    request: input.request,
    ...(input.waitBarrier ? { waitBarrier: input.waitBarrier } : {}),
    createdAt,
    ...(explicitIdempotencyKey ? { explicitIdempotencyKey } : {}),
  });
  const existing = findSubagentRunEventByIdempotencyKey(
    input.store.listSubagentRunEvents(input.run.id),
    SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE,
    draft.idempotencyKey,
  );
  if (existing) {
    const childMailboxEventId = optionalString(recordValue(existing.preview)?.childMailboxEventId);
    const childMailboxEvent = childMailboxEventId
      ? input.store.listSubagentMailboxEvents(input.run.id).find((event) => event.id === childMailboxEventId)
      : undefined;
    return {
      schemaVersion: SUBAGENT_SUPERVISOR_REQUEST_SCHEMA_VERSION,
      replay: true,
      idempotencyKey: draft.idempotencyKey,
      request: draft.request,
      parentRequiresAttention: draft.parentRequiresAttention,
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
    schemaVersion: SUBAGENT_SUPERVISOR_REQUEST_SCHEMA_VERSION,
    replay: false,
    idempotencyKey: draft.idempotencyKey,
    request: draft.request,
    parentRequiresAttention: draft.parentRequiresAttention,
    childMailboxEvent,
    parentMailboxEvent,
    runEvent,
  };
}

export function buildSubagentSupervisorRequestDraft(input: {
  run: SubagentRunSummary;
  request: SubagentSupervisorRequestInput;
  waitBarrier?: SubagentWaitBarrierSummary;
  createdAt: string;
  explicitIdempotencyKey?: string;
}): SubagentSupervisorRequestDraft {
  const request = normalizeSupervisorRequest(input.request);
  const parentRequiresAttention = request.kind === "need_decision" || request.kind === "blocked";
  const idempotencyKey = input.explicitIdempotencyKey ?? createSubagentSupervisorRequestIdempotencyKey({
    run: input.run,
    request,
    waitBarrier: input.waitBarrier,
  });
  const basePayload = supervisorRequestBasePayload(input.run, input.waitBarrier);
  const requestPayload = supervisorRequestPayload(request, parentRequiresAttention);
  const payload = {
    schemaVersion: SUBAGENT_SUPERVISOR_REQUEST_SCHEMA_VERSION,
    idempotencyKey,
    ...basePayload,
    ...requestPayload,
  };
  return {
    idempotencyKey,
    request,
    parentRequiresAttention,
    childMailboxInput: {
      direction: "child_to_parent",
      type: SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE,
      deliveryState: "delivered",
      createdAt: input.createdAt,
      deliveredAt: input.createdAt,
      payload,
    },
    parentMailboxInput: {
      parentThreadId: input.run.parentThreadId,
      parentRunId: input.run.parentRunId,
      ...(input.run.parentMessageId ? { parentMessageId: input.run.parentMessageId } : {}),
      type: SUBAGENT_PARENT_SUPERVISOR_REQUEST_MAILBOX_TYPE,
      deliveryState: parentRequiresAttention ? "queued" : "delivered",
      idempotencyKey,
      createdAt: input.createdAt,
      ...(parentRequiresAttention ? {} : { deliveredAt: input.createdAt }),
      payload: {
        ...payload,
        instruction: parentRequiresAttention
          ? "Surface this child supervisor request with the child run and thread identifiers, then return the parent to waiting on this child."
          : "Surface this child progress update without treating it as a completed result.",
      },
    },
    runEventInput: {
      type: SUBAGENT_CHILD_SUPERVISOR_REQUEST_MAILBOX_TYPE,
      createdAt: input.createdAt,
      preview: {
        schemaVersion: SUBAGENT_SUPERVISOR_REQUEST_SCHEMA_VERSION,
        idempotencyKey,
        childRunId: input.run.id,
        childThreadId: input.run.childThreadId,
        kind: request.kind,
        title: request.title,
        parentRequiresAttention,
        resumeParentBlocking: parentRequiresAttention,
        completionStatus: "not_complete",
        ...(input.waitBarrier ? { waitBarrierId: input.waitBarrier.id } : {}),
      },
    },
  };
}

export function createSubagentSupervisorRequestIdempotencyKey(input: {
  run: Pick<SubagentRunSummary, "id" | "canonicalTaskPath">;
  request: SubagentSupervisorRequestInput;
  waitBarrier?: Pick<SubagentWaitBarrierSummary, "id">;
}): string {
  const request = normalizeSupervisorRequest(input.request);
  return createSubagentIdempotencyKey({
    operation: "supervisor-request",
    childRunId: input.run.id,
    canonicalPath: input.run.canonicalTaskPath,
    payloadFingerprint: createSubagentPayloadFingerprint({
      kind: request.kind,
      title: request.title,
      message: request.message,
      requestedChoices: request.requestedChoices,
      progressLabel: request.progressLabel,
      blockedReason: request.blockedReason,
      waitBarrierId: input.waitBarrier?.id,
    }),
  });
}

function supervisorRequestBasePayload(
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
    childStatus: run.status,
    waitBarrierId: waitBarrier?.id ?? null,
    ...(waitBarrier ? { waitBarrier: compactSubagentWaitBarrier(waitBarrier) } : {}),
  };
}

function supervisorRequestPayload(
  request: SubagentSupervisorRequestInput,
  parentRequiresAttention: boolean,
): Record<string, unknown> {
  const parentBlockingState = {
    status: parentRequiresAttention ? "needs_supervisor_attention" : "child_progress_update",
    action: request.kind === "need_decision"
      ? "answer_child_request_then_wait"
      : request.kind === "blocked"
      ? "steer_or_retry_child_then_wait"
      : "continue_monitoring",
    resumeAction: "wait_agent",
    resumeParentBlocking: parentRequiresAttention,
    completionStatus: "not_complete",
  };
  return {
    kind: request.kind,
    title: previewText(request.title, 160),
    messagePreview: previewText(request.message, 1200),
    severity: request.severity ?? defaultSupervisorRequestSeverity(request.kind),
    parentRequiresAttention,
    requestedChoices: request.requestedChoices ?? [],
    parentBlockingState,
    marksChildComplete: false,
    ...(request.progressLabel ? { progressLabel: previewText(request.progressLabel, 120) } : {}),
    ...(request.blockedReason ? { blockedReason: previewText(request.blockedReason, 600) } : {}),
    ...(request.artifactPath ? { artifactPath: request.artifactPath } : {}),
  };
}

function normalizeSupervisorRequest(input: SubagentSupervisorRequestInput): SubagentSupervisorRequestInput {
  const kind = supervisorRequestKind(input.kind);
  const requestedChoices = (input.requestedChoices ?? [])
    .map(normalizeSupervisorChoice)
    .filter((choice): choice is SubagentSupervisorRequestChoice => Boolean(choice))
    .slice(0, 8);
  const progressLabel = optionalString(input.progressLabel);
  const blockedReason = optionalString(input.blockedReason);
  const artifactPath = optionalString(input.artifactPath);
  const createdAt = optionalString(input.createdAt);
  const idempotencyKey = optionalString(input.idempotencyKey);
  return {
    kind,
    title: requiredString(input.title, "title"),
    message: requiredString(input.message, "message"),
    severity: input.severity ?? defaultSupervisorRequestSeverity(kind),
    ...(requestedChoices.length ? { requestedChoices } : {}),
    ...(progressLabel ? { progressLabel } : {}),
    ...(blockedReason ? { blockedReason } : {}),
    ...(artifactPath ? { artifactPath } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
  };
}

function normalizeSupervisorChoice(value: SubagentSupervisorRequestChoice): SubagentSupervisorRequestChoice | undefined {
  const id = optionalString(value.id);
  const label = optionalString(value.label);
  if (!id || !label) return undefined;
  const description = optionalString(value.description);
  return {
    id,
    label: previewText(label, 80),
    ...(description ? { description: previewText(description, 200) } : {}),
  };
}

function supervisorRequestKind(kind: SubagentSupervisorRequestKind): SubagentSupervisorRequestKind {
  if ((SUBAGENT_SUPERVISOR_REQUEST_KINDS as readonly string[]).includes(kind)) return kind;
  throw new Error(`Unknown sub-agent supervisor request kind: ${kind}`);
}

function defaultSupervisorRequestSeverity(kind: SubagentSupervisorRequestKind): SubagentSupervisorRequestSeverity {
  if (kind === "progress_update") return "info";
  return "warning";
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
