import type { SubagentRunStatus } from "../shared/subagentProtocol";
import type { SubagentRunSummary } from "../shared/types";
import { createSubagentIdempotencyKey, createSubagentPayloadFingerprint } from "./subagentIdempotency";

export const SUBAGENT_CLOSE_REQUEST_EVENT_TYPE = "subagent.close_requested" as const;
export const DEFAULT_SUBAGENT_CLOSE_REASON = "Closed by parent thread." as const;
export const SUBAGENT_CLOSE_RETAINED_HISTORY_MESSAGE =
  "Capacity is released; transcript and artifacts are retained." as const;

export const CLOSE_BLOCKED_ACTIVE_STATUSES = new Set<SubagentRunStatus>([
  "reserved",
  "starting",
  "running",
  "waiting",
]);

export interface SubagentCloseAgentRequest {
  reason: string;
  idempotencyKey: string;
}

export function resolveSubagentCloseAgentRequest(input: {
  run: SubagentRunSummary;
  reason?: string;
  idempotencyKey?: string;
}): SubagentCloseAgentRequest {
  const reason = input.reason ?? DEFAULT_SUBAGENT_CLOSE_REASON;
  return {
    reason,
    idempotencyKey: input.idempotencyKey ?? createSubagentCloseAgentIdempotencyKey({
      run: input.run,
      reason,
    }),
  };
}

export function createSubagentCloseAgentIdempotencyKey(input: {
  run: Pick<SubagentRunSummary, "id" | "canonicalTaskPath">;
  reason: string;
}): string {
  return createSubagentIdempotencyKey({
    operation: "close",
    childRunId: input.run.id,
    canonicalPath: input.run.canonicalTaskPath,
    payloadFingerprint: createSubagentPayloadFingerprint({ reason: input.reason }),
  });
}

export function assertCanCloseSubagentRun(run: Pick<SubagentRunSummary, "id" | "status" | "closedAt">): void {
  if (run.closedAt) return;
  if (!CLOSE_BLOCKED_ACTIVE_STATUSES.has(run.status)) return;
  throw new Error(
    `Cannot close active sub-agent ${run.id} (${run.status}); wait for completion, cancel it, or detach it before releasing capacity.`,
  );
}

export function buildSubagentCloseRequestedRunEventPreview(input: {
  run: Pick<SubagentRunSummary, "id" | "childThreadId" | "parentRunId" | "parentThreadId" | "canonicalTaskPath">;
  idempotencyKey: string;
  reason: string;
  toolCallId: string;
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
  };
}

export function buildSubagentCloseAgentChildThreadMessage(input: {
  reason: string;
}): string {
  return `Sub-agent closed by parent. ${SUBAGENT_CLOSE_RETAINED_HISTORY_MESSAGE}\n\nReason: ${input.reason}`;
}

export function buildSubagentCloseAgentReplayText(input: {
  canonicalTaskPath: string;
}): string {
  return `Sub-agent ${input.canonicalTaskPath} is already closed; transcript and artifacts remain inspectable.`;
}

export function buildSubagentCloseAgentResultText(input: {
  canonicalTaskPath: string;
}): string {
  return `Closed sub-agent ${input.canonicalTaskPath}. ${SUBAGENT_CLOSE_RETAINED_HISTORY_MESSAGE}`;
}
