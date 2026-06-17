import { createHash } from "node:crypto";

export type SubagentIdempotentOperation =
  | "spawn"
  | "spawn-failed"
  | "followup"
  | "wait"
  | "wait-barrier-attention"
  | "approval-request"
  | "approval-response"
  | "supervisor-request"
  | "turn-budget-wrap-up"
  | "turn-budget-exhaustion"
  | "close"
  | "cancel"
  | "retry"
  | "barrier-decision"
  | "grouped_completion_notification"
  | "artifact_write";

export interface SubagentIdempotencyKeyInput {
  operation: SubagentIdempotentOperation;
  parentRunId?: string;
  childRunId?: string;
  canonicalPath?: string;
  payloadFingerprint?: string;
}

export interface SubagentIdempotentRunEvent {
  type: string;
  preview?: unknown;
}

export function createSubagentIdempotencyKey(input: SubagentIdempotencyKeyInput): string {
  const stable = [
    input.operation,
    input.parentRunId ?? "",
    input.childRunId ?? "",
    input.canonicalPath ?? "",
    input.payloadFingerprint ?? "",
  ].join("\0");
  const hash = createHash("sha256").update(stable).digest("hex").slice(0, 24);
  return `subagent:${input.operation}:${hash}`;
}

export function createSubagentPayloadFingerprint(payload: unknown): string {
  return createHash("sha256").update(stableSerialize(payload)).digest("hex");
}

export function findSubagentRunEventByIdempotencyKey<Event extends SubagentIdempotentRunEvent>(
  events: readonly Event[],
  type: string,
  idempotencyKey: string,
): Event | undefined {
  const normalizedKey = optionalString(idempotencyKey);
  if (!normalizedKey) return undefined;
  return events.find((event) =>
    event.type === type && subagentRunEventPreviewIdempotencyKey(event) === normalizedKey
  );
}

export function subagentRunEventPreviewIdempotencyKey(
  event: Pick<SubagentIdempotentRunEvent, "preview">,
): string | undefined {
  return optionalString(objectInput(event.preview).idempotencyKey);
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

function objectInput(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}
