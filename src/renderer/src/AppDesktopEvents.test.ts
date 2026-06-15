import { describe, expect, it } from "vitest";

import { STATE_REDUCER_DESKTOP_EVENT_TYPES } from "./AppDesktopEvents";

describe("desktop event state reducer filter", () => {
  it("tracks the desktop events that should refresh renderer state", () => {
    expect(Array.from(STATE_REDUCER_DESKTOP_EVENT_TYPES)).toEqual([
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
    ]);
  });

  it("does not refresh renderer state for local-only progress notifications", () => {
    expect(STATE_REDUCER_DESKTOP_EVENT_TYPES.has("workflow-compile-progress")).toBe(false);
    expect(STATE_REDUCER_DESKTOP_EVENT_TYPES.has("workflow-discovery-progress")).toBe(false);
    expect(STATE_REDUCER_DESKTOP_EVENT_TYPES.has("runtime-activity")).toBe(false);
  });
});
