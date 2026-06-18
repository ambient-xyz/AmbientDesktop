import { describe, expect, it } from "vitest";

import {
  STATE_REDUCER_DESKTOP_EVENT_TYPES,
  upsertSortedDesktopEventItem,
} from "./AppDesktopEvents";

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
      "subagent-mailbox-event-updated",
      "subagent-tool-scope-snapshot-recorded",
      "subagent-wait-barrier-updated",
      "subagent-parent-mailbox-event-updated",
      "callable-workflow-task-updated",
    ]);
  });

  it("does not refresh renderer state for local-only progress notifications", () => {
    expect(STATE_REDUCER_DESKTOP_EVENT_TYPES.has("workflow-compile-progress")).toBe(false);
    expect(STATE_REDUCER_DESKTOP_EVENT_TYPES.has("workflow-discovery-progress")).toBe(false);
    expect(STATE_REDUCER_DESKTOP_EVENT_TYPES.has("runtime-activity")).toBe(false);
  });

  it("keeps duplicate event payload upserts referentially stable", () => {
    const existing = [
      { id: "b", createdAt: "2026-06-18T00:00:02.000Z", status: "running" },
      { id: "c", createdAt: "2026-06-18T00:00:03.000Z", status: "running" },
    ];

    expect(upsertSortedDesktopEventItem(
      existing,
      { id: "b", createdAt: "2026-06-18T00:00:02.000Z", status: "running" },
      (item) => item.id,
      (left, right) => left.createdAt.localeCompare(right.createdAt),
    )).toBe(existing);

    expect(upsertSortedDesktopEventItem(
      existing,
      { id: "b", createdAt: "2026-06-18T00:00:02.000Z", status: "completed" },
      (item) => item.id,
      (left, right) => left.createdAt.localeCompare(right.createdAt),
    )).toEqual([
      { id: "b", createdAt: "2026-06-18T00:00:02.000Z", status: "completed" },
      { id: "c", createdAt: "2026-06-18T00:00:03.000Z", status: "running" },
    ]);

    expect(upsertSortedDesktopEventItem(
      existing,
      { id: "a", createdAt: "2026-06-18T00:00:01.000Z", status: "queued" },
      (item) => item.id,
      (left, right) => left.createdAt.localeCompare(right.createdAt),
    ).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
});
