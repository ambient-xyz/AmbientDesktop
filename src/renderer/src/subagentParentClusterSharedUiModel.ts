import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { SubagentParentClusterTone } from "./subagentParentClusterWorkflowTaskUiModel";

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function stringArrayValue(value: unknown): string[] {
  return arrayValue(value).filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function childSourceLabel(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) return undefined;
  const path = stringValue(payload.canonicalTaskPath);
  const childRunId = stringValue(payload.childRunId);
  const childThreadId = stringValue(payload.childThreadId);
  const childRunIds = stringArrayValue(payload.childRunIds);
  const detachedRunIds = stringArrayValue(payload.detachedRunIds);
  const cancelledRunIds = stringArrayValue(payload.cancelledRunIds);
  const affectedRunIds = uniqueStrings([...(childRunId ? [childRunId] : []), ...childRunIds, ...detachedRunIds, ...cancelledRunIds]);
  const pieces = [
    path,
    affectedRunIds.length === 1
      ? `run ${affectedRunIds[0]}`
      : affectedRunIds.length > 1
        ? `runs ${affectedRunIds.slice(0, 3).join(", ")}${affectedRunIds.length > 3 ? ` +${affectedRunIds.length - 3}` : ""}`
        : undefined,
    childThreadId ? `thread ${childThreadId}` : undefined,
  ].filter(Boolean);
  return pieces.length ? `Child source: ${pieces.join(" / ")}` : undefined;
}

export function truncate(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

export function elapsedLabel(startIso: string, endIso: string): string {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "unknown";
  const elapsedMs = end - start;
  if (elapsedMs < 1000) return "<1s";
  const seconds = Math.round(elapsedMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function statusLabelFromString(status: string): string {
  if (status === "needs_attention") return "Needs attention";
  return status.split("_").map(titleCase).join(" ");
}

export function statusLabel(status: SubagentRunSummary["status"]): string {
  if (status === "needs_attention") return "Needs attention";
  return status.split("_").map(titleCase).join(" ");
}

export function statusTone(status: SubagentRunSummary["status"]): SubagentParentClusterTone {
  switch (status) {
    case "running":
    case "starting":
      return "active";
    case "completed":
      return "success";
    case "reserved":
    case "detached":
    case "aborted_partial":
    case "timed_out":
    case "needs_attention":
      return "warning";
    case "failed":
    case "stopped":
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

export function titleCase(value: string): string {
  const normalized = value.replace(/[-_]+/g, " ").trim();
  if (!normalized) return value;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
