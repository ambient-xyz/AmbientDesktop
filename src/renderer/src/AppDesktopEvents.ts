import type { DesktopEvent } from "../../shared/types";

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
  "subagent-tool-scope-snapshot-recorded",
  "subagent-wait-barrier-updated",
  "subagent-parent-mailbox-event-updated",
  "callable-workflow-task-updated",
]);
