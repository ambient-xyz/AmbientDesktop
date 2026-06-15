import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/types";
import { createRuntimeStreamActivityTracker } from "./runtimeStreamActivityTracker";

function baseInput(overrides: Record<string, unknown> = {}) {
  const emitted: DesktopEvent[] = [];
  const state = {
    nowMs: Date.parse("2026-06-15T00:00:00.000Z"),
    outputChars: 0,
    thinkingChars: 0,
  };
  return {
    threadId: "thread-1",
    idleTimeoutMs: 30_000,
    progressThrottleMs: 1_000,
    progressCharDelta: 10,
    getOutputChars: vi.fn(() => state.outputChars),
    getThinkingChars: vi.fn(() => state.thinkingChars),
    resetStreamWatchdog: vi.fn(),
    refreshEmptyAssistantStallWatchdog: vi.fn(),
    resetAssistantTerminalCompletion: vi.fn(),
    emitRunEvent: vi.fn((event: DesktopEvent) => {
      emitted.push(event);
    }),
    now: vi.fn(() => state.nowMs),
    emitted,
    state,
    ...overrides,
  };
}

describe("createRuntimeStreamActivityTracker", () => {
  it("records stream event count, first/last event metadata, payload bytes, and reset hooks", () => {
    const input = baseInput();
    const tracker = createRuntimeStreamActivityTracker(input);

    input.state.outputChars = 12;
    input.state.thinkingChars = 3;
    tracker.markActivity(true, { type: "message_start", message: { role: "assistant" } });
    input.state.nowMs += 250;
    tracker.markActivity(false, {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "hello" },
    });

    expect(tracker.snapshot()).toMatchObject({
      eventCount: 2,
      approximatePayloadBytes: expect.any(Number),
      firstEventAt: "2026-06-15T00:00:00.000Z",
      firstEventType: "message_start",
      lastEventAt: "2026-06-15T00:00:00.250Z",
      lastEventType: "message_update",
      lastActivityAtMs: Date.parse("2026-06-15T00:00:00.250Z"),
    });
    expect(tracker.snapshot().approximatePayloadBytes).toBeGreaterThan(0);
    expect(input.resetStreamWatchdog).toHaveBeenCalledTimes(2);
    expect(input.refreshEmptyAssistantStallWatchdog).toHaveBeenCalledTimes(2);
    expect(input.resetAssistantTerminalCompletion).toHaveBeenCalledTimes(2);
  });

  it("emits forced progress with the latest output and thinking counters", () => {
    const input = baseInput();
    const tracker = createRuntimeStreamActivityTracker(input);

    input.state.outputChars = 24;
    input.state.thinkingChars = 7;
    tracker.markActivity(true, { type: "message_update" });

    expect(input.emitted).toContainEqual(expect.objectContaining({
      type: "runtime-activity",
      activity: expect.objectContaining({
        kind: "stream",
        status: "running",
        outputChars: 24,
        thinkingChars: 7,
        idleElapsedMs: 0,
        idleTimeoutMs: 30_000,
      }),
    }));
  });

  it("throttles unforced progress until enough time or text growth accumulates", () => {
    const input = baseInput();
    const tracker = createRuntimeStreamActivityTracker(input);

    tracker.markActivity(false, { type: "message_update" });
    expect(input.emitted).toHaveLength(1);

    input.state.nowMs += 500;
    input.state.outputChars = 9;
    tracker.markActivity(false, { type: "message_update" });
    expect(input.emitted).toHaveLength(1);

    input.state.outputChars = 10;
    tracker.markActivity(false, { type: "message_update" });
    expect(input.emitted).toHaveLength(2);

    input.state.nowMs += 1_000;
    tracker.markActivity(false, { type: "message_update" });
    expect(input.emitted).toHaveLength(3);
  });
});
