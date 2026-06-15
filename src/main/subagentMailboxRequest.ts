import type { SubagentChildRuntimeFollowupResult } from "./piChildSessionAdapter";
import type { SubagentMailboxEventSummary, SubagentRunSummary } from "../shared/types";
import { createSubagentIdempotencyKey, createSubagentPayloadFingerprint } from "./subagentIdempotency";

export const SUBAGENT_CHILD_MAILBOX_REQUEST_SCHEMA_VERSION = "ambient-subagent-child-mailbox-request-v1" as const;
export const SUBAGENT_CHILD_MESSAGE_MAILBOX_TYPE = "subagent.message" as const;
export const SUBAGENT_CHILD_FOLLOWUP_MAILBOX_TYPE = "subagent.followup" as const;
export const SUBAGENT_CHILD_MAILBOX_ACTIONS = ["send_agent", "followup_agent"] as const;

export type SubagentChildMailboxAction = typeof SUBAGENT_CHILD_MAILBOX_ACTIONS[number];
export type SubagentChildMailboxType =
  | typeof SUBAGENT_CHILD_MESSAGE_MAILBOX_TYPE
  | typeof SUBAGENT_CHILD_FOLLOWUP_MAILBOX_TYPE;

export interface SubagentChildMailboxRequest {
  schemaVersion: typeof SUBAGENT_CHILD_MAILBOX_REQUEST_SCHEMA_VERSION;
  action: SubagentChildMailboxAction;
  message: string;
  idempotencyKey: string;
  eventType: `subagent.${SubagentChildMailboxAction}.queued`;
  mailboxType: SubagentChildMailboxType;
  toolCallId: string;
  supervisorRequestParentMailboxEventId?: string;
  supervisorChoiceId?: string;
}

export interface SubagentChildMailboxRequestInput {
  run: Pick<SubagentRunSummary, "id" | "canonicalTaskPath">;
  action: SubagentChildMailboxAction;
  message: string;
  explicitIdempotencyKey?: string;
  toolCallId: string;
  supervisorRequestParentMailboxEventId?: string;
  supervisorChoiceId?: string;
}

export function resolveSubagentChildMailboxRequest(input: SubagentChildMailboxRequestInput): SubagentChildMailboxRequest {
  const message = input.message.trim();
  if (!message) throw new Error("message is required.");
  const supervisorRequestParentMailboxEventId = optionalString(input.supervisorRequestParentMailboxEventId);
  const supervisorChoiceId = optionalString(input.supervisorChoiceId);
  return {
    schemaVersion: SUBAGENT_CHILD_MAILBOX_REQUEST_SCHEMA_VERSION,
    action: input.action,
    message,
    idempotencyKey: input.explicitIdempotencyKey ??
      createSubagentChildMailboxRequestIdempotencyKey({
        run: input.run,
        action: input.action,
        message,
        supervisorRequestParentMailboxEventId,
        supervisorChoiceId,
      }),
    eventType: subagentChildMailboxRunEventType(input.action),
    mailboxType: subagentChildMailboxTypeForAction(input.action),
    toolCallId: input.toolCallId,
    ...(supervisorRequestParentMailboxEventId ? { supervisorRequestParentMailboxEventId } : {}),
    ...(supervisorChoiceId ? { supervisorChoiceId } : {}),
  };
}

export function createSubagentChildMailboxRequestIdempotencyKey(input: {
  run: Pick<SubagentRunSummary, "id" | "canonicalTaskPath">;
  action: SubagentChildMailboxAction;
  message: string;
  supervisorRequestParentMailboxEventId?: string;
  supervisorChoiceId?: string;
}): string {
  const message = input.message.trim();
  const payloadFingerprint = createSubagentPayloadFingerprint({
    runId: input.run.id,
    action: input.action,
    message,
    supervisorRequestParentMailboxEventId: optionalString(input.supervisorRequestParentMailboxEventId),
    supervisorChoiceId: optionalString(input.supervisorChoiceId),
  });
  return createSubagentIdempotencyKey({
    operation: "followup",
    childRunId: input.run.id,
    canonicalPath: input.run.canonicalTaskPath,
    payloadFingerprint,
  });
}

export function subagentChildMailboxTypeForAction(action: SubagentChildMailboxAction): SubagentChildMailboxType {
  return action === "send_agent" ? SUBAGENT_CHILD_MESSAGE_MAILBOX_TYPE : SUBAGENT_CHILD_FOLLOWUP_MAILBOX_TYPE;
}

export function subagentChildMailboxRunEventType(action: SubagentChildMailboxAction): SubagentChildMailboxRequest["eventType"] {
  return `subagent.${action}.queued`;
}

export function subagentChildMailboxActionLabel(action: SubagentChildMailboxAction): "send" | "followup" {
  return action === "send_agent" ? "send" : "followup";
}

export function buildSubagentChildMailboxEventInput(request: SubagentChildMailboxRequest): {
  direction: "parent_to_child";
  type: SubagentChildMailboxType;
  payload: {
    schemaVersion: typeof SUBAGENT_CHILD_MAILBOX_REQUEST_SCHEMA_VERSION;
    message: string;
    action: SubagentChildMailboxAction;
    idempotencyKey: string;
    toolCallId: string;
    supervisorRequestParentMailboxEventId?: string;
    supervisorChoiceId?: string;
  };
} {
  return {
    direction: "parent_to_child",
    type: request.mailboxType,
    payload: {
      schemaVersion: SUBAGENT_CHILD_MAILBOX_REQUEST_SCHEMA_VERSION,
      message: request.message,
      action: request.action,
      idempotencyKey: request.idempotencyKey,
      toolCallId: request.toolCallId,
      ...(request.supervisorRequestParentMailboxEventId ? {
        supervisorRequestParentMailboxEventId: request.supervisorRequestParentMailboxEventId,
      } : {}),
      ...(request.supervisorChoiceId ? { supervisorChoiceId: request.supervisorChoiceId } : {}),
    },
  };
}

export function buildSubagentChildMailboxRunEventInput(
  request: SubagentChildMailboxRequest,
  mailboxEvent: Pick<SubagentMailboxEventSummary, "id">,
  run: Pick<SubagentRunSummary, "id" | "childThreadId" | "parentRunId" | "parentThreadId" | "canonicalTaskPath">,
): {
  type: SubagentChildMailboxRequest["eventType"];
  preview: {
    schemaVersion: typeof SUBAGENT_CHILD_MAILBOX_REQUEST_SCHEMA_VERSION;
    childRunId: string;
    childThreadId: string;
    parentRunId: string;
    parentThreadId: string;
    canonicalTaskPath: string;
    idempotencyKey: string;
    mailboxEventId: string;
    messagePreview: string;
    supervisorRequestParentMailboxEventId?: string;
    supervisorChoiceId?: string;
  };
} {
  return {
    type: request.eventType,
    preview: {
      schemaVersion: SUBAGENT_CHILD_MAILBOX_REQUEST_SCHEMA_VERSION,
      childRunId: run.id,
      childThreadId: run.childThreadId,
      parentRunId: run.parentRunId,
      parentThreadId: run.parentThreadId,
      canonicalTaskPath: run.canonicalTaskPath,
      idempotencyKey: request.idempotencyKey,
      mailboxEventId: mailboxEvent.id,
      messagePreview: previewSubagentChildMailboxText(request.message),
      ...(request.supervisorRequestParentMailboxEventId ? {
        supervisorRequestParentMailboxEventId: request.supervisorRequestParentMailboxEventId,
      } : {}),
      ...(request.supervisorChoiceId ? { supervisorChoiceId: request.supervisorChoiceId } : {}),
    },
  };
}

export function buildSubagentChildMailboxThreadMessage(input: {
  request: SubagentChildMailboxRequest;
  run: Pick<SubagentRunSummary, "id" | "childThreadId">;
  mailboxEvent: Pick<SubagentMailboxEventSummary, "id">;
  runtime: string;
  phase: string;
}): {
  threadId: string;
  role: "system";
  content: string;
  metadata: Record<string, unknown>;
} {
  return {
    threadId: input.run.childThreadId,
    role: "system",
    content: `Parent queued ${input.request.action === "send_agent" ? "a message" : "a follow-up"} for this sub-agent.\n\n${previewSubagentChildMailboxText(input.request.message, 1200)}`,
    metadata: {
      runtime: input.runtime,
      phase: input.phase,
      status: "queued",
      subagentRunId: input.run.id,
      mailboxEventId: input.mailboxEvent.id,
      ...(input.request.supervisorRequestParentMailboxEventId ? {
        supervisorRequestParentMailboxEventId: input.request.supervisorRequestParentMailboxEventId,
      } : {}),
      ...(input.request.supervisorChoiceId ? { supervisorChoiceId: input.request.supervisorChoiceId } : {}),
    },
  };
}

export function buildSubagentChildMailboxReplayText(input: {
  request: Pick<SubagentChildMailboxRequest, "action">;
  canonicalTaskPath: string;
}): string {
  return `Sub-agent ${input.canonicalTaskPath} already has this ${subagentChildMailboxActionLabel(input.request.action)} queued.`;
}

export function buildSubagentChildMailboxQueuedText(input: {
  request: Pick<SubagentChildMailboxRequest, "action">;
  canonicalTaskPath: string;
  runtimeFollowup?: Pick<SubagentChildRuntimeFollowupResult, "accepted" | "message">;
}): string {
  const followupText = input.runtimeFollowup?.accepted
    ? ` Runtime accepted the follow-up for child execution.`
    : input.runtimeFollowup?.message
    ? ` ${input.runtimeFollowup.message}`
    : "";
  return `Queued ${subagentChildMailboxActionLabel(input.request.action)} for ${input.canonicalTaskPath}.${followupText}`;
}

export function compactSubagentChildMailboxEvent(event: SubagentMailboxEventSummary): Record<string, unknown> {
  return {
    id: event.id,
    runId: event.runId,
    direction: event.direction,
    type: event.type,
    deliveryState: event.deliveryState,
    createdAt: event.createdAt,
    ...(event.deliveredAt ? { deliveredAt: event.deliveredAt } : {}),
  };
}

export function compactSubagentChildRuntimeFollowup(
  result: SubagentChildRuntimeFollowupResult,
  mailboxEvent: SubagentMailboxEventSummary,
  compactRun: (run: SubagentRunSummary) => Record<string, unknown>,
): Record<string, unknown> {
  return {
    accepted: result.accepted,
    run: compactRun(result.run),
    mailboxEvent: compactSubagentChildMailboxEvent(result.mailboxEvent ?? mailboxEvent),
    ...(result.message ? { message: previewSubagentChildMailboxText(result.message, 600) } : {}),
  };
}

export function previewSubagentChildMailboxText(text: string, limit = 240): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
