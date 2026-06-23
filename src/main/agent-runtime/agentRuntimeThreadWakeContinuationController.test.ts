import { describe, expect, it, vi } from "vitest";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import {
  AgentRuntimeThreadWakeContinuationController,
  type ThreadWakeContinuationSendInput,
} from "./agentRuntimeThreadWakeContinuationController";
import type { ThreadWakeContinuation } from "../projectStore/threadWakeRepository";

describe("AgentRuntimeThreadWakeContinuationController", () => {
  it("emits refreshed thread summaries when a wake is scheduled and delivered", async () => {
    const dueAt = "2026-06-04T12:30:00.000Z";
    const wake: ThreadWakeContinuation = {
      id: "wake-1",
      threadId: "thread-1",
      dueAt,
      status: "pending",
      reason: "Check progress.",
      createdAt: "2026-06-04T12:00:00.000Z",
      updatedAt: "2026-06-04T12:00:00.000Z",
    };
    let wakePending = false;
    const timerCallbacks: Array<() => void> = [];
    const events: DesktopEvent[] = [];
    const send = vi.fn(async () => undefined);
    const store = {
      getThread: vi.fn(() => thread(wakePending ? wake : undefined)),
      listPendingThreadWakeContinuations: vi.fn(() => []),
      scheduleThreadWakeContinuation: vi.fn(() => {
        wakePending = true;
        return wake;
      }),
      markThreadWakeContinuationDelivered: vi.fn(() => {
        wakePending = false;
        return { ...wake, status: "delivered" as const, deliveredAt: dueAt };
      }),
      markThreadWakeContinuationFailed: vi.fn(),
    };

    const controller = new AgentRuntimeThreadWakeContinuationController({
      store,
      hasActiveRun: () => false,
      send,
      emit: (event) => events.push(event),
      now: () => Date.parse(dueAt),
      setTimeout: (callback) => {
        timerCallbacks.push(callback);
        return callback;
      },
      clearTimeout: vi.fn(),
    });

    controller.schedule({
      threadId: wake.threadId,
      dueAt: wake.dueAt,
      reason: wake.reason,
    });

    expect(threadUpdateEvents(events).at(-1)?.thread.scheduledCheckIn).toMatchObject({
      sourceKind: "thread_wake",
      wakeId: wake.id,
      nextRunAt: wake.dueAt,
    });

    timerCallbacks.at(-1)?.();
    await vi.waitFor(() => expect(store.markThreadWakeContinuationDelivered).toHaveBeenCalledWith(wake.id));

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ threadId: wake.threadId, delivery: "follow-up" }));
    expect(threadUpdateEvents(events).at(-1)?.thread.scheduledCheckIn).toBeUndefined();
  });

  it("prompts long-context wake continuations to poll async long-context jobs", async () => {
    const dueAt = "2026-06-04T12:30:00.000Z";
    const wake: ThreadWakeContinuation = {
      id: "wake-1",
      threadId: "thread-1",
      dueAt,
      status: "pending",
      reason: "Check long-context progress.",
      jobId: "lc-job-1",
      payload: { job_kind: "long_context", next_since_seq: 3 },
      createdAt: "2026-06-04T12:00:00.000Z",
      updatedAt: "2026-06-04T12:00:00.000Z",
    };
    const timerCallbacks: Array<() => void> = [];
    const sentInputs: ThreadWakeContinuationSendInput[] = [];
    const send = vi.fn(async (input: ThreadWakeContinuationSendInput) => {
      sentInputs.push(input);
    });
    const store = {
      getThread: vi.fn(() => thread(wake)),
      listPendingThreadWakeContinuations: vi.fn(() => [wake]),
      scheduleThreadWakeContinuation: vi.fn(),
      markThreadWakeContinuationDelivered: vi.fn(() => ({
        ...wake,
        status: "delivered" as const,
        deliveredAt: dueAt,
      })),
      markThreadWakeContinuationFailed: vi.fn(),
    };

    new AgentRuntimeThreadWakeContinuationController({
      store,
      hasActiveRun: () => false,
      send,
      emit: vi.fn(),
      asyncBashSnapshotText: vi.fn(() => "bash snapshot should not be used"),
      asyncLongContextSnapshotText: vi.fn(() => "job_kind: long_context\nstatus: running"),
      now: () => Date.parse(dueAt),
      setTimeout: (callback) => {
        timerCallbacks.push(callback);
        return callback;
      },
      clearTimeout: vi.fn(),
    });

    timerCallbacks.at(-1)?.();
    await vi.waitFor(() => expect(send).toHaveBeenCalled());

    const input = sentInputs[0]!;
    expect(input.modelContentOverride).toContain("Latest async long-context snapshot:");
    expect(input.modelContentOverride).toContain("job_kind: long_context");
    expect(input.modelContentOverride).toContain("long_context_poll with wait_ms 0");
    expect(input.modelContentOverride).not.toContain("bash_poll with wait_ms 0");
    expect(store.markThreadWakeContinuationDelivered).toHaveBeenCalledWith(wake.id);
  });
});

function thread(wake?: ThreadWakeContinuation): ThreadSummary {
  return {
    id: "thread-1",
    title: "Wake thread",
    workspacePath: "/workspace",
    kind: "chat",
    createdAt: "2026-06-04T12:00:00.000Z",
    updatedAt: "2026-06-04T12:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient",
    thinkingLevel: "medium",
    ...(wake
      ? {
          scheduledCheckIn: {
            sourceKind: "thread_wake",
            wakeId: wake.id,
            nextRunAt: wake.dueAt,
            targetKind: "thread_wake",
            targetLabel: "this thread",
          },
        }
      : {}),
  };
}

function threadUpdateEvents(events: DesktopEvent[]): Array<Extract<DesktopEvent, { type: "thread-updated" }>> {
  return events.filter((event): event is Extract<DesktopEvent, { type: "thread-updated" }> => event.type === "thread-updated");
}
