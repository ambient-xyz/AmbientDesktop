import { AlertCircle, Clock, LoaderCircle } from "lucide-react";
import { isRunStatusRunning } from "../../shared/runStatus";
import type { RunStatus, ThreadSummary } from "../../shared/threadTypes";
import type { ThreadIndicatorKind } from "./AutomationsWorkspace";
import { formatTimelineTime } from "./RightPanel";

export function threadIndicator(
  thread: ThreadSummary,
  status?: RunStatus,
  active = false,
  now = Date.now(),
): { kind: ThreadIndicatorKind; label: string } {
  if (status && isRunStatusRunning(status)) return { kind: "running", label: "Running" };
  const unread = !active && threadHasUnreadWork(thread);
  if (status === "error" || (unread && /runtime returned an error|failed|upstream request failed/i.test(thread.lastMessagePreview))) {
    return { kind: "error", label: "Error" };
  }
  if (unread) {
    return { kind: "awaiting", label: "New work" };
  }
  if (thread.scheduledCheckIn?.nextRunAt) {
    return { kind: "scheduled", label: scheduledCheckInIndicatorLabel(thread.scheduledCheckIn, now) };
  }
  return { kind: "idle", label: "Idle" };
}

function scheduledCheckInIndicatorLabel(checkIn: NonNullable<ThreadSummary["scheduledCheckIn"]>, now: number): string {
  const nextRunAt = formatTimelineTime(checkIn.nextRunAt);
  const remaining = scheduledCheckInTimeRemainingLabel(checkIn.nextRunAt, now);
  const remainingDetail = remaining ? ` ${remaining}` : "";
  return nextRunAt
    ? `Scheduled check-in for ${checkIn.targetLabel}${remainingDetail} (at ${nextRunAt})`
    : `Scheduled check-in for ${checkIn.targetLabel}${remainingDetail}`;
}

function scheduledCheckInTimeRemainingLabel(nextRunAt: string, now: number): string | undefined {
  const timestamp = Date.parse(nextRunAt);
  if (!Number.isFinite(timestamp)) return undefined;
  const remainingMs = timestamp - now;
  if (remainingMs <= 0) return "due now";
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  if (totalMinutes < 60) return `in ${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) return `in ${durationParts(totalHours, "h", minutes, "m")}`;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `in ${durationParts(days, "d", hours, "h")}`;
}

function durationParts(primary: number, primaryUnit: string, secondary: number, secondaryUnit: string): string {
  return secondary > 0 ? `${primary}${primaryUnit} ${secondary}${secondaryUnit}` : `${primary}${primaryUnit}`;
}

export function threadHasUnreadWork(thread: ThreadSummary): boolean {
  if (!thread.lastMessagePreview || /run stopped|interrupted/i.test(thread.lastMessagePreview)) return false;
  if (!thread.lastReadAt) return false;
  return thread.updatedAt > thread.lastReadAt;
}

export function sidebarThreadAgeLabel(updatedAt: string, now = Date.now()): string | undefined {
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return undefined;
  const elapsedMs = Math.max(0, now - timestamp);
  const hourMs = 60 * 60 * 1000;
  if (elapsedMs < hourMs) return undefined;
  const dayMs = 24 * hourMs;
  const days = Math.floor(elapsedMs / dayMs);
  if (days < 1) return `${Math.max(1, Math.floor(elapsedMs / hourMs))}h`;
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.max(1, Math.floor(days / 7))}w`;
  if (days < 365) return `${Math.max(1, Math.floor(days / 30))}mo`;
  return `${Math.max(1, Math.floor(days / 365))}y`;
}

export function ThreadIndicatorIcon({ kind }: { kind: ThreadIndicatorKind }) {
  if (kind === "running") return <LoaderCircle size={12} className="spin" />;
  if (kind === "error") return <AlertCircle size={12} />;
  if (kind === "scheduled") return <Clock size={12} />;
  if (kind === "awaiting") return <span aria-hidden="true" />;
  return <span aria-hidden="true" />;
}
