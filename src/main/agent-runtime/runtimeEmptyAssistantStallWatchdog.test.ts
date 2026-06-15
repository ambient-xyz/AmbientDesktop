import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/types";
import {
  createRuntimeEmptyAssistantStallWatchdog,
  type RuntimeEmptyAssistantStallWatchdogState,
} from "./runtimeEmptyAssistantStallWatchdog";

function baseInput(overrides: Record<string, unknown> = {}) {
  const emitted: DesktopEvent[] = [];
  let timeoutMessage: string | undefined;
  const state: RuntimeEmptyAssistantStallWatchdogState = {
    outputChars: 0,
    thinkingChars: 4,
    assistantStartCount: 1,
    receivedAnyText: false,
    currentAssistantReceivedText: false,
    currentAssistantFinalText: "",
    streamEventCount: 2,
    sessionFile: "/tmp/session.jsonl",
  };
  return {
    threadId: "thread-1",
    idleTimeoutMs: 30_000,
    isRunStoreActive: vi.fn(() => true),
    isStreamTimedOut: vi.fn(() => false),
    markStreamTimedOut: vi.fn(),
    setStreamTimeoutMessage: vi.fn((message: string) => {
      timeoutMessage = message;
    }),
    persistPiStreamTrace: vi.fn(() => ({
      path: "/tmp/pi-stream-trace.jsonl",
      eventCount: 2,
      recentEventCount: 2,
      reason: "empty assistant stall",
      recordedAt: "2026-06-15T00:00:30.000Z",
    })),
    getState: vi.fn(() => state),
    abortSessionRun: vi.fn(),
    signalStreamWatchdogTimeout: vi.fn(),
    emitRunEvent: vi.fn((event: DesktopEvent) => {
      emitted.push(event);
    }),
    emitted,
    state,
    get timeoutMessage() {
      return timeoutMessage;
    },
    ...overrides,
  };
}

describe("createRuntimeEmptyAssistantStallWatchdog", () => {
  it("emits an empty-assistant stream timeout, persists a trace, aborts, and signals completion", () => {
    vi.useFakeTimers();
    try {
      const input = baseInput();
      const watchdog = createRuntimeEmptyAssistantStallWatchdog(input);

      watchdog.schedule();
      vi.advanceTimersByTime(30_000);

      expect(input.markStreamTimedOut).toHaveBeenCalledTimes(1);
      expect(input.timeoutMessage).toBe("Ambient/Pi stream stalled after 30000ms without stream activity.");
      expect(input.persistPiStreamTrace).toHaveBeenCalledWith(input.timeoutMessage);
      expect(input.abortSessionRun).toHaveBeenCalledTimes(1);
      expect(input.signalStreamWatchdogTimeout).toHaveBeenCalledTimes(1);
      expect(input.emitted).toContainEqual(expect.objectContaining({
        type: "runtime-activity",
        activity: expect.objectContaining({
          kind: "stream",
          status: "timeout",
          outputChars: 0,
          thinkingChars: 4,
          idleElapsedMs: 30_000,
          idleTimeoutMs: 30_000,
          message: "Ambient/Pi stream stalled after 30000ms without stream activity.",
          diagnostic: expect.objectContaining({
            reason: "empty-assistant-stream-stall",
            assistantStartCount: 1,
            receivedAnyText: false,
            currentAssistantReceivedText: false,
            currentAssistantFinalTextChars: 0,
            streamEventCount: 2,
            sessionFile: "/tmp/session.jsonl",
            trace: expect.objectContaining({
              path: "/tmp/pi-stream-trace.jsonl",
            }),
          }),
        }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not schedule when assistant text is already present", () => {
    vi.useFakeTimers();
    try {
      const input = baseInput();
      input.state.currentAssistantReceivedText = true;
      const watchdog = createRuntimeEmptyAssistantStallWatchdog(input);

      watchdog.schedule();
      vi.advanceTimersByTime(30_000);

      expect(input.abortSessionRun).not.toHaveBeenCalled();
      expect(input.signalStreamWatchdogTimeout).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes an armed timer when stream activity arrives before assistant text", () => {
    vi.useFakeTimers();
    try {
      const input = baseInput();
      const watchdog = createRuntimeEmptyAssistantStallWatchdog(input);

      watchdog.schedule();
      vi.advanceTimersByTime(20_000);
      watchdog.refreshOnStreamActivity();
      vi.advanceTimersByTime(20_000);
      expect(input.abortSessionRun).not.toHaveBeenCalled();
      vi.advanceTimersByTime(10_000);

      expect(input.abortSessionRun).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not refresh an unarmed timer", () => {
    vi.useFakeTimers();
    try {
      const input = baseInput();
      const watchdog = createRuntimeEmptyAssistantStallWatchdog(input);

      watchdog.refreshOnStreamActivity();
      vi.advanceTimersByTime(30_000);

      expect(input.abortSessionRun).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears a scheduled stall timer", () => {
    vi.useFakeTimers();
    try {
      const input = baseInput();
      const watchdog = createRuntimeEmptyAssistantStallWatchdog(input);

      watchdog.schedule();
      watchdog.clear();
      vi.advanceTimersByTime(30_000);

      expect(input.abortSessionRun).not.toHaveBeenCalled();
      expect(input.signalStreamWatchdogTimeout).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
