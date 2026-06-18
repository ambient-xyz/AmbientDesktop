import type { DesktopEvent } from "../../shared/desktopTypes";

export function desktopEventPayloadsEqual<T>(left: T, right: T): boolean {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function upsertSortedDesktopEventItem<T>(
  items: T[],
  item: T,
  keyForItem: (item: T) => string,
  compareItems: (left: T, right: T) => number,
): T[] {
  const itemKey = keyForItem(item);
  const existingIndex = items.findIndex((candidate) => keyForItem(candidate) === itemKey);
  if (existingIndex >= 0) {
    if (desktopEventPayloadsEqual(items[existingIndex], item)) return items;
    return items.map((candidate, index) => (index === existingIndex ? item : candidate));
  }
  return [...items, item].sort(compareItems);
}

export const STATE_REDUCER_DESKTOP_EVENT_TYPES = new Set<DesktopEvent["type"]>([
  "provider-updated",
  "update-status",
  "queue-updated",
  "stt-queue-updated",
  "stt-diagnostic-recorded",
  "message-created",
  "message-delta",
  "message-updated",
  "planner-plan-artifact-created",
  "planner-plan-artifact-updated",
  "thread-goal-updated",
  "thread-goal-cleared",
  "thread-updated",
  "subagent-run-updated",
  "subagent-run-event-created",
  "subagent-mailbox-event-updated",
  "subagent-tool-scope-snapshot-recorded",
  "subagent-wait-barrier-updated",
  "subagent-parent-mailbox-event-updated",
  "callable-workflow-task-updated",
]);
