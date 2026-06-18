import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import type {
  SubagentMailboxEventSummary,
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import { createSubagentIdempotencyKey, createSubagentPayloadFingerprint } from "./subagentIdempotency";
import {
  SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_TYPE,
  subagentLifecycleInterruptionIdempotencyKey,
  subagentLifecycleInterruptionParentMailboxPayload,
} from "./subagentLifecycleParentMailbox";
import { SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES } from "./subagentWaitBarrierEvaluation";
import { compactSubagentWaitBarrier } from "./subagentWaitMailbox";

export const SUBAGENT_CANCEL_REQUEST_EVENT_TYPE = "subagent.cancel_requested" as const;
export const SUBAGENT_PARENT_CANCEL_REQUEST_SOURCE = "parent_cancel_request" as const;
export const DEFAULT_SUBAGENT_CANCEL_REASON = "Cancelled by parent thread." as const;

export interface SubagentCancelAgentRequest {
  reason: string;
  idempotencyKey: string;
}

export interface SubagentCancelAgentParentMailboxDraft {
  parentMailboxInput: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    type: typeof SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_TYPE;
    payload: Record<string, unknown>;
    idempotencyKey: string;
  };
}

export function resolveSubagentCancelAgentRequest(input: {
  run: SubagentRunSummary;
  reason?: string;
  idempotencyKey?: string;
}): SubagentCancelAgentRequest {
  const reason = input.reason ?? DEFAULT_SUBAGENT_CANCEL_REASON;
  return {
    reason,
    idempotencyKey: input.idempotencyKey ?? createSubagentCancelAgentIdempotencyKey({
      run: input.run,
      reason,
    }),
  };
}

export function createSubagentCancelAgentIdempotencyKey(input: {
  run: Pick<SubagentRunSummary, "id" | "canonicalTaskPath">;
  reason: string;
}): string {
  return createSubagentIdempotencyKey({
    operation: "cancel",
    childRunId: input.run.id,
    canonicalPath: input.run.canonicalTaskPath,
    payloadFingerprint: createSubagentPayloadFingerprint({ reason: input.reason }),
  });
}

export function shouldMarkSubagentCancelAgentRunCancelled(input: {
  initialStatus: SubagentRunStatus;
  currentStatus: SubagentRunStatus;
}): boolean {
  if (input.currentStatus === "cancelled") return false;
  if (SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(input.currentStatus)) return false;
  if (SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(input.initialStatus)) return false;
  return true;
}

export function shouldPreserveInitialTerminalSubagentCancelRun(input: {
  initialStatus: SubagentRunStatus;
  currentStatus: SubagentRunStatus;
}): boolean {
  return SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(input.initialStatus) &&
    !SUBAGENT_WAIT_BARRIER_TERMINAL_STATUSES.has(input.currentStatus);
}

export function buildSubagentCancelAgentResultArtifact(input: {
  run: Pick<SubagentRunSummary, "id" | "childThreadId">;
  reason: string;
}): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId: input.run.id,
    status: "cancelled",
    partial: false,
    summary: input.reason,
    childThreadId: input.run.childThreadId,
  };
}

export function buildSubagentCancelRequestedRunEventPreview(input: {
  run: Pick<SubagentRunSummary, "id" | "childThreadId" | "parentRunId" | "parentThreadId" | "canonicalTaskPath">;
  idempotencyKey: string;
  reason: string;
  toolCallId: string;
  waitBarriers: readonly SubagentWaitBarrierSummary[];
  cancelledMailboxEvents?: readonly SubagentMailboxEventSummary[];
}): Record<string, unknown> {
  return {
    childRunId: input.run.id,
    childThreadId: input.run.childThreadId,
    parentRunId: input.run.parentRunId,
    parentThreadId: input.run.parentThreadId,
    canonicalTaskPath: input.run.canonicalTaskPath,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
    toolCallId: input.toolCallId,
    waitBarriers: input.waitBarriers.map(compactSubagentWaitBarrier),
    ...(input.cancelledMailboxEvents ? {
      cancelledMailboxEvents: input.cancelledMailboxEvents.map(compactSubagentCancelMailboxEvent),
    } : {}),
  };
}

export function buildSubagentCancelAgentParentMailboxDraft(input: {
  run: SubagentRunSummary;
  previousStatus: SubagentRunStatus;
  reason: string;
  resultArtifact?: unknown;
  toolCallId: string;
  waitBarriers: readonly SubagentWaitBarrierSummary[];
  cancelledMailboxEvents: readonly SubagentMailboxEventSummary[];
  idempotencyKey: string;
}): SubagentCancelAgentParentMailboxDraft {
  const parentMailboxInput: SubagentCancelAgentParentMailboxDraft["parentMailboxInput"] = {
    parentThreadId: input.run.parentThreadId,
    parentRunId: input.run.parentRunId,
    ...(input.run.parentMessageId ? { parentMessageId: input.run.parentMessageId } : {}),
    type: SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_TYPE,
    payload: subagentLifecycleInterruptionParentMailboxPayload({
      run: input.run,
      previousStatus: input.previousStatus,
      source: SUBAGENT_PARENT_CANCEL_REQUEST_SOURCE,
      reason: input.reason,
      resultArtifact: input.resultArtifact,
      toolCallId: input.toolCallId,
      waitBarriers: input.waitBarriers,
      cancelledMailboxEventIds: input.cancelledMailboxEvents.map((event) => event.id),
    }),
    idempotencyKey: subagentLifecycleInterruptionIdempotencyKey({
      runId: input.run.id,
      source: SUBAGENT_PARENT_CANCEL_REQUEST_SOURCE,
      idempotencyKey: input.idempotencyKey,
    }),
  };
  return { parentMailboxInput };
}

export function buildSubagentCancelAgentChildThreadMessage(input: {
  reason: string;
}): string {
  return `Sub-agent cancelled by parent.\n\nReason: ${input.reason}`;
}

function compactSubagentCancelMailboxEvent(event: SubagentMailboxEventSummary): Record<string, unknown> {
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
