import { createHash } from "node:crypto";
import type { SubagentRunStatus } from "../../shared/types";

export const SUBAGENT_GROUPED_COMPLETION_PARENT_MAILBOX_TYPE = "subagent.grouped_completion" as const;
export const SUBAGENT_GROUPED_COMPLETION_SCHEMA_VERSION = "ambient-subagent-grouped-completion-v1" as const;

export interface SubagentGroupedCompletionChild {
  runId: string;
  childThreadId: string;
  canonicalTaskPath: string;
  roleId: string;
  status: SubagentRunStatus;
  summary: string;
  completedAt?: string;
}

export interface SubagentGroupedCompletionPayload {
  schemaVersion: typeof SUBAGENT_GROUPED_COMPLETION_SCHEMA_VERSION;
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  status: "queued";
  notificationCount: number;
  childRuns: SubagentGroupedCompletionChild[];
}

export interface SubagentGroupedCompletionNotificationDraft {
  payload: SubagentGroupedCompletionPayload;
  payloadFingerprint: string;
  idempotencyKey: string;
}

export function buildSubagentGroupedCompletionNotificationDraft(input: {
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  existingPayload?: unknown;
  child: SubagentGroupedCompletionChild;
}): SubagentGroupedCompletionNotificationDraft {
  const childRuns = mergeGroupedCompletionChildren(
    groupedCompletionChildrenFromPayload(input.existingPayload),
    normalizeGroupedCompletionChild(input.child),
  );
  const payload: SubagentGroupedCompletionPayload = {
    schemaVersion: SUBAGENT_GROUPED_COMPLETION_SCHEMA_VERSION,
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    status: "queued",
    notificationCount: childRuns.length,
    childRuns,
  };
  const payloadFingerprint = createSubagentGroupedCompletionPayloadFingerprint(childRuns);
  return {
    payload,
    payloadFingerprint,
    idempotencyKey: createSubagentGroupedCompletionIdempotencyKey(payloadFingerprint),
  };
}

export function createSubagentGroupedCompletionPayloadFingerprint(
  childRuns: readonly Pick<SubagentGroupedCompletionChild, "runId">[],
): string {
  return createHash("sha256")
    .update(JSON.stringify(childRuns.map((child) => child.runId).sort()))
    .digest("hex");
}

export function createSubagentGroupedCompletionIdempotencyKey(payloadFingerprint: string): string {
  return `subagent:grouped_completion_notification:${payloadFingerprint.slice(0, 24)}`;
}

function mergeGroupedCompletionChildren(
  existingChildren: readonly SubagentGroupedCompletionChild[],
  nextChild: SubagentGroupedCompletionChild,
): SubagentGroupedCompletionChild[] {
  const replaced = existingChildren.some((child) => child.runId === nextChild.runId);
  if (replaced) {
    return existingChildren.map((child) => child.runId === nextChild.runId ? nextChild : child);
  }
  return [...existingChildren, nextChild];
}

function groupedCompletionChildrenFromPayload(payload: unknown): SubagentGroupedCompletionChild[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const record = payload as Record<string, unknown>;
  if (record.schemaVersion !== SUBAGENT_GROUPED_COMPLETION_SCHEMA_VERSION) return [];
  if (!Array.isArray(record.childRuns)) return [];
  return record.childRuns.flatMap((item) => {
    const child = groupedCompletionChildFromUnknown(item);
    return child ? [child] : [];
  });
}

function groupedCompletionChildFromUnknown(value: unknown): SubagentGroupedCompletionChild | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const runId = nonEmptyString(record.runId);
  const childThreadId = nonEmptyString(record.childThreadId);
  const canonicalTaskPath = nonEmptyString(record.canonicalTaskPath);
  const roleId = nonEmptyString(record.roleId);
  const status = nonEmptyString(record.status) as SubagentRunStatus | undefined;
  const summary = nonEmptyString(record.summary);
  if (!runId || !childThreadId || !canonicalTaskPath || !roleId || !status || !summary) return undefined;
  return normalizeGroupedCompletionChild({
    runId,
    childThreadId,
    canonicalTaskPath,
    roleId,
    status,
    summary,
    ...(typeof record.completedAt === "string" && record.completedAt.trim()
      ? { completedAt: record.completedAt.trim() }
      : {}),
  });
}

function normalizeGroupedCompletionChild(child: SubagentGroupedCompletionChild): SubagentGroupedCompletionChild {
  return {
    runId: child.runId,
    childThreadId: child.childThreadId,
    canonicalTaskPath: child.canonicalTaskPath,
    roleId: child.roleId,
    status: child.status,
    summary: child.summary,
    ...(child.completedAt ? { completedAt: child.completedAt } : {}),
  };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
