import type { AutomationScheduleSummary } from "../../shared/automationTypes";
import type { ThreadScheduledCheckInSummary, ThreadSummary } from "../../shared/threadTypes";
import type { ThreadWakeContinuation } from "./threadWakeRepository";

export interface ThreadScheduledCheckInDecorationSource {
  automationSchedules: readonly AutomationScheduleSummary[];
  pendingThreadWakeContinuations: readonly Pick<ThreadWakeContinuation, "dueAt" | "id" | "threadId">[];
}

export function decorateThreadsWithScheduledCheckIns(
  threads: ThreadSummary[],
  source: ThreadScheduledCheckInDecorationSource,
): ThreadSummary[] {
  const scheduledByThreadId = new Map<string, ThreadScheduledCheckInSummary>();
  const setScheduledCheckIn = (threadId: string, checkIn: ThreadScheduledCheckInSummary): void => {
    const existing = scheduledByThreadId.get(threadId);
    if (existing && existing.nextRunAt <= checkIn.nextRunAt) return;
    scheduledByThreadId.set(threadId, checkIn);
  };

  for (const schedule of source.automationSchedules) {
    if (!schedule.enabled || !schedule.nextRunAt || !schedule.dedicatedThreadId) continue;
    setScheduledCheckIn(schedule.dedicatedThreadId, {
      sourceKind: "automation_schedule",
      scheduleId: schedule.id,
      nextRunAt: schedule.nextRunAt,
      targetKind: schedule.targetKind,
      targetLabel: schedule.targetLabel,
    });
  }

  for (const wake of source.pendingThreadWakeContinuations) {
    setScheduledCheckIn(wake.threadId, {
      sourceKind: "thread_wake",
      wakeId: wake.id,
      nextRunAt: wake.dueAt,
      targetKind: "thread_wake",
      targetLabel: "this thread",
    });
  }

  if (!scheduledByThreadId.size) return threads;
  return threads.map((thread) => {
    const scheduledCheckIn = scheduledByThreadId.get(thread.id);
    return scheduledCheckIn ? { ...thread, scheduledCheckIn } : thread;
  });
}
