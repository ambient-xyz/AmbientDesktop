import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import type { SubagentMailboxEventSummary, SubagentRunEventSummary } from "../../shared/subagentTypes";

export type SubagentChildTranscriptTone = "neutral" | "active" | "success" | "warning" | "danger";

export interface SubagentChildTranscriptState {
  statusLabel: string;
  statusTone: SubagentChildTranscriptTone;
  isTerminal: boolean;
  isSynthesisSafe: boolean;
  liveMarker?: {
    label: string;
    detail: string;
    tone: SubagentChildTranscriptTone;
  };
  terminalSummary?: {
    label: string;
    status: string;
    detail: string;
    tone: SubagentChildTranscriptTone;
  };
}

export interface SubagentChildTranscriptRuntimeEventRow {
  key: string;
  label: string;
  detail?: string;
  createdAt: string;
  artifactPath?: string;
  tone: SubagentChildTranscriptTone;
}

export interface SubagentChildTranscriptMailboxEventRow {
  key: string;
  label: string;
  detail: string;
  createdAt: string;
  tone: SubagentChildTranscriptTone;
}

export function subagentChildTranscriptState(input: {
  status: SubagentRunStatus;
  statusLabel: string;
  statusTone: SubagentChildTranscriptTone;
  preview: string;
}): SubagentChildTranscriptState {
  const isTerminal = terminalStatuses.has(input.status);
  const isSynthesisSafe = input.status === "completed";
  if (isTerminal) {
    return {
      statusLabel: input.statusLabel,
      statusTone: input.statusTone,
      isTerminal,
      isSynthesisSafe,
      terminalSummary: {
        label: isSynthesisSafe ? "Completion summary" : "Final child status",
        status: input.statusLabel,
        detail: terminalSummaryDetail(input.preview || terminalFallback(input.status)),
        tone: input.statusTone,
      },
    };
  }

  const liveMarker = liveTranscriptMarker(input.status);
  return {
    statusLabel: liveMarker.statusLabel,
    statusTone: liveMarker.tone,
    isTerminal,
    isSynthesisSafe,
    liveMarker: {
      label: liveMarker.label,
      detail: liveMarker.detail,
      tone: liveMarker.tone,
    },
  };
}

export function subagentChildTranscriptRuntimeEventRows(
  events: readonly SubagentRunEventSummary[],
  options: { limit?: number } = {},
): SubagentChildTranscriptRuntimeEventRow[] {
  const limit = Math.max(1, options.limit ?? 6);
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt));
  return sorted.slice(-limit).map((event) => ({
    key: `${event.runId}:${event.sequence}:${event.type}`,
    label: eventLabel(event.type),
    ...(eventDetail(event) ? { detail: eventDetail(event) } : {}),
    createdAt: event.createdAt,
    ...(event.artifactPath ? { artifactPath: event.artifactPath } : {}),
    tone: eventTone(event.type),
  }));
}

export function subagentChildTranscriptMailboxEventRows(
  events: readonly SubagentMailboxEventSummary[],
  options: { limit?: number } = {},
): SubagentChildTranscriptMailboxEventRow[] {
  const limit = Math.max(1, options.limit ?? 4);
  const sorted = [...events]
    .filter((event) => childTranscriptMailboxEventVisible(event))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return sorted.slice(-limit).map((event) => ({
    key: `${event.runId}:${event.id}`,
    label: mailboxEventLabel(event.type),
    detail: mailboxEventDetail(event),
    createdAt: event.createdAt,
    tone: mailboxEventTone(event),
  }));
}

function eventLabel(type: string): string {
  const friendly = friendlyEventLabels[type];
  if (friendly) return friendly;
  return type
    .split(/[._:-]+/g)
    .filter(Boolean)
    .slice(-3)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Runtime event";
}

function childTranscriptMailboxEventVisible(event: SubagentMailboxEventSummary): boolean {
  if (event.direction !== "parent_to_child") return false;
  return event.type === "subagent.retry" ||
    event.type === "subagent.followup" ||
    event.type === "subagent.approval_response";
}

function mailboxEventLabel(type: string): string {
  const friendly = friendlyMailboxEventLabels[type];
  if (friendly) return friendly;
  return type
    .split(/[._:-]+/g)
    .filter(Boolean)
    .slice(-3)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Child mailbox event";
}

function mailboxEventDetail(event: SubagentMailboxEventSummary): string {
  return [
    `Delivery: ${event.deliveryState}`,
    mailboxPayloadPreview(event.payload),
  ].filter(Boolean).join(" / ");
}

function mailboxPayloadPreview(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["message", "messagePreview", "reason", "summary"]) {
    const next = record[key];
    if (typeof next === "string" && next.trim()) return clip(next);
  }
  const pairs: string[] = [];
  for (const key of ["decision", "effectiveScope", "previousStatus", "status", "approvalId", "childRunId"]) {
    const next = record[key];
    if (typeof next === "string" && next.trim()) pairs.push(`${labelFromKey(key)}: ${next.trim()}`);
  }
  return pairs.length ? clip(pairs.join(" / ")) : undefined;
}

function mailboxEventTone(event: SubagentMailboxEventSummary): SubagentChildTranscriptTone {
  if (event.deliveryState === "failed" || event.deliveryState === "cancelled") return "danger";
  if (event.type === "subagent.approval_response") return event.deliveryState === "consumed" ? "success" : "warning";
  if (event.deliveryState === "consumed") return "success";
  return "active";
}

function eventDetail(event: SubagentRunEventSummary): string | undefined {
  const preview = previewText(event.preview);
  if (preview && event.artifactPath) return `${preview} / Artifact: ${event.artifactPath}`;
  return preview ?? (event.artifactPath ? `Artifact: ${event.artifactPath}` : undefined);
}

function previewText(value: unknown): string | undefined {
  if (typeof value === "string") return clip(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["summary", "message", "messagePreview", "error", "reason", "status", "label"]) {
    const next = record[key];
    if (typeof next === "string" && next.trim()) return clip(next);
  }
  return structuredPreviewText(record);
}

function clip(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) return normalized;
  return `${normalized.slice(0, 177)}...`;
}

const terminalStatuses = new Set<SubagentRunStatus>([
  "completed",
  "failed",
  "stopped",
  "cancelled",
  "timed_out",
  "detached",
  "aborted_partial",
]);

function liveTranscriptMarker(status: SubagentRunStatus): {
  statusLabel: string;
  label: string;
  detail: string;
  tone: SubagentChildTranscriptTone;
} {
  switch (status) {
    case "reserved":
      return {
        statusLabel: "Preparing",
        label: "Child launch reserved",
        detail: "The child transcript will stream here as soon as the child session starts.",
        tone: "active",
      };
    case "starting":
      return {
        statusLabel: "Starting",
        label: "Child session starting",
        detail: "Ambient is preparing the child run; assistant text, tool calls, and events will stay attached here.",
        tone: "active",
      };
    case "running":
      return {
        statusLabel: "Live",
        label: "Child is running",
        detail: "New assistant text, tool calls, approvals, errors, and runtime events appear above as they arrive.",
        tone: "active",
      };
    case "waiting":
      return {
        statusLabel: "Waiting",
        label: "Parent is blocked on this child",
        detail: "The parent remains blocked until this child completes, fails under policy, or produces an explicit partial result.",
        tone: "active",
      };
    case "needs_attention":
      return {
        statusLabel: "Needs action",
        label: "Child is paused for parent action",
        detail: "Resolve the child request in the parent context; after the decision is forwarded, the parent returns to waiting on this child.",
        tone: "warning",
      };
    default:
      return {
        statusLabel: "Live",
        label: "Child transcript is live",
        detail: "The child has not reached a final result; this panel stays focused on the running transcript.",
        tone: "neutral",
      };
  }
}

function terminalFallback(status: SubagentRunStatus): string {
  switch (status) {
    case "completed":
      return "Child completed and produced a synthesis-safe result.";
    case "aborted_partial":
      return "Child stopped with an explicit partial result; parent synthesis requires partial policy permission.";
    case "detached":
      return "Child detached from the parent wait path; inspect the child transcript for retained work.";
    case "timed_out":
      return "Child timed out before producing a normal completion.";
    case "cancelled":
      return "Child was cancelled before completion.";
    case "stopped":
      return "Child was stopped before completion.";
    case "failed":
      return "Child failed before completion.";
    default:
      return "Child reached a final status.";
  }
}

const TERMINAL_SUMMARY_DETAIL_LIMIT = 280;

function terminalSummaryDetail(detail: string): string {
  const normalized = detail.replace(/\s+/g, " ").trim();
  if (normalized.length <= TERMINAL_SUMMARY_DETAIL_LIMIT) return normalized;
  return `${normalized.slice(0, TERMINAL_SUMMARY_DETAIL_LIMIT - 58).trimEnd()}... Full child output remains in the transcript above.`;
}

function eventTone(type: string): SubagentChildTranscriptTone {
  const normalized = type.toLowerCase().replace(/[._:-]+/g, " ");
  if (/\bretry\b/.test(normalized)) return "active";
  if (/\b(fail|failed|error|crash|cancel|denied|timeout|interrupted|exhausted)\b/.test(normalized)) return "danger";
  if (/\b(approval|blocked|wait|attention|reconcile|missing)\b/.test(normalized)) return "warning";
  if (/\b(complete|completed|satisfied|released|success)\b/.test(normalized)) return "success";
  if (/\b(start|starting|running|progress|delta|stream|queued)\b/.test(normalized)) return "active";
  return "neutral";
}

function structuredPreviewText(record: Record<string, unknown>): string | undefined {
  const pairs: string[] = [];
  for (const key of ["previousStatus", "status", "deliveryState", "approvalId", "toolName", "mailboxEventId"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) pairs.push(`${labelFromKey(key)}: ${value.trim()}`);
  }
  if (pairs.length) return clip(pairs.join(" / "));
  try {
    return clip(JSON.stringify(record));
  } catch {
    return undefined;
  }
}

function labelFromKey(key: string): string {
  const explicit: Record<string, string> = {
    approvalId: "Approval ID",
    mailboxEventId: "Mailbox event ID",
    previousStatus: "Previous status",
    deliveryState: "Delivery state",
    effectiveScope: "Effective scope",
    toolName: "Tool name",
  };
  if (explicit[key]) return explicit[key];
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (value) => value.toUpperCase());
}

const friendlyEventLabels: Record<string, string> = {
  "subagent.retry_child_session_starting": "Retry child session starting",
  "subagent.retry_child_session_started": "Retry child session started",
  "subagent.retry_consumed": "Retry request consumed",
  "subagent.retry_refused": "Retry request refused",
  "subagent.followup_child_session_starting": "Follow-up child session starting",
  "subagent.followup_child_session_started": "Follow-up child session started",
  "subagent.followup_consumed": "Follow-up request consumed",
  "subagent.approval_response.consumed": "Approval response delivered",
  "subagent.approval_response.refused": "Approval response refused",
  "subagent.child_approval_requested": "Child approval requested",
  "subagent.child_supervisor_request": "Child supervisor request",
  "subagent.child_session_started": "Child session started",
  "subagent.child_session_completed": "Child session completed",
  "subagent.child_session_failed": "Child session failed",
  "subagent.child_runtime_refused": "Child runtime refused",
  "subagent.result_contract_repair_exhausted": "Result repair exhausted",
  "subagent.post_tool_followup_exhausted": "Post-tool follow-up exhausted",
};

const friendlyMailboxEventLabels: Record<string, string> = {
  "subagent.retry": "Parent retry request",
  "subagent.followup": "Parent follow-up queued",
  "subagent.approval_response": "Parent approval response",
};
