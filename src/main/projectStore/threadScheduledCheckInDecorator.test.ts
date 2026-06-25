import { describe, expect, it } from "vitest";
import type { AutomationScheduleSummary } from "../../shared/automationTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { decorateThreadsWithScheduledCheckIns } from "./threadScheduledCheckInDecorator";

describe("decorateThreadsWithScheduledCheckIns", () => {
  it("decorates threads with the earliest automation schedule or pending wake", () => {
    const threads = [thread("thread-1"), thread("thread-2"), thread("thread-3")];

    const result = decorateThreadsWithScheduledCheckIns(threads, {
      automationSchedules: [
        schedule({
          id: "schedule-later",
          dedicatedThreadId: "thread-1",
          nextRunAt: "2026-06-04T13:00:00.000Z",
        }),
        schedule({
          id: "schedule-earliest",
          dedicatedThreadId: "thread-2",
          nextRunAt: "2026-06-04T11:00:00.000Z",
          targetKind: "workflow_playbook",
          targetLabel: "Morning playbook",
        }),
      ],
      pendingThreadWakeContinuations: [
        { id: "wake-earlier", threadId: "thread-1", dueAt: "2026-06-04T12:30:00.000Z" },
        { id: "wake-later", threadId: "thread-2", dueAt: "2026-06-04T12:00:00.000Z" },
      ],
    });

    expect(result.find((candidate) => candidate.id === "thread-1")?.scheduledCheckIn).toEqual({
      sourceKind: "thread_wake",
      wakeId: "wake-earlier",
      nextRunAt: "2026-06-04T12:30:00.000Z",
      targetKind: "thread_wake",
      targetLabel: "this thread",
    });
    expect(result.find((candidate) => candidate.id === "thread-2")?.scheduledCheckIn).toEqual({
      sourceKind: "automation_schedule",
      scheduleId: "schedule-earliest",
      nextRunAt: "2026-06-04T11:00:00.000Z",
      targetKind: "workflow_playbook",
      targetLabel: "Morning playbook",
    });
    expect(result.find((candidate) => candidate.id === "thread-3")?.scheduledCheckIn).toBeUndefined();
  });

  it("ignores disabled schedules and schedules without a next run or dedicated thread", () => {
    const threads = [thread("thread-1")];

    const result = decorateThreadsWithScheduledCheckIns(threads, {
      automationSchedules: [
        schedule({ enabled: false, dedicatedThreadId: "thread-1", nextRunAt: "2026-06-04T12:00:00.000Z" }),
        schedule({ id: "missing-next-run", dedicatedThreadId: "thread-1", nextRunAt: undefined }),
        schedule({ id: "missing-thread", dedicatedThreadId: undefined, nextRunAt: "2026-06-04T12:00:00.000Z" }),
      ],
      pendingThreadWakeContinuations: [],
    });

    expect(result).toBe(threads);
    expect(result[0]?.scheduledCheckIn).toBeUndefined();
  });

  it("keeps the first source when two check-ins have the same next run time", () => {
    const result = decorateThreadsWithScheduledCheckIns([thread("thread-1")], {
      automationSchedules: [
        schedule({
          id: "schedule",
          dedicatedThreadId: "thread-1",
          nextRunAt: "2026-06-04T12:00:00.000Z",
        }),
      ],
      pendingThreadWakeContinuations: [{ id: "wake", threadId: "thread-1", dueAt: "2026-06-04T12:00:00.000Z" }],
    });

    expect(result[0]?.scheduledCheckIn).toMatchObject({
      sourceKind: "automation_schedule",
      scheduleId: "schedule",
    });
  });
});

function thread(id: string): ThreadSummary {
  return {
    id,
    title: `Thread ${id}`,
    workspacePath: "/workspace",
    createdAt: "2026-06-04T10:00:00.000Z",
    updatedAt: "2026-06-04T10:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "model",
    thinkingLevel: "high",
  };
}

function schedule(overrides: Partial<AutomationScheduleSummary>): AutomationScheduleSummary {
  return {
    id: "schedule",
    targetKind: "local_task",
    targetId: "target",
    targetLabel: "Target",
    preset: "daily",
    timezone: "local",
    enabled: true,
    skipIfActive: true,
    concurrencyPolicy: "skip_if_active",
    nextRunAt: "2026-06-04T12:00:00.000Z",
    createdAt: "2026-06-04T10:00:00.000Z",
    updatedAt: "2026-06-04T10:00:00.000Z",
    ...overrides,
  };
}
