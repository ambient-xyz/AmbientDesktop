import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/types";
import { createRuntimeToolExecutionWatchdog } from "./runtimeToolExecutionWatchdog";

function baseInput(overrides: Record<string, unknown> = {}) {
  const emitted: DesktopEvent[] = [];
  const nowMs = { value: 1_000 };
  return {
    threadId: "thread-1",
    defaultIdleTimeoutMs: 5_000,
    isRunStoreActive: vi.fn(() => true),
    isPermissionWaiting: vi.fn(() => false),
    pauseStreamWatchdog: vi.fn(),
    resumeStreamWatchdog: vi.fn(),
    abortSessionRun: vi.fn(),
    signalToolExecutionTimeout: vi.fn(),
    emitRunEvent: vi.fn((event: DesktopEvent) => {
      emitted.push(event);
    }),
    now: vi.fn(() => nowMs.value),
    emitted,
    nowMs,
    ...overrides,
  };
}

describe("createRuntimeToolExecutionWatchdog", () => {
  it("pauses the stream watchdog, tracks active execution, and emits running activity", () => {
    const input = baseInput();
    const watchdog = createRuntimeToolExecutionWatchdog(input);

    watchdog.begin("tool-call-1", "ambient_shell");

    expect(watchdog.isActive()).toBe(true);
    expect(watchdog.count()).toBe(1);
    expect(watchdog.active()).toMatchObject({
      toolCallId: "tool-call-1",
      toolName: "ambient_shell",
      startedAt: 1_000,
      lastActivityAt: 1_000,
    });
    expect(input.pauseStreamWatchdog).toHaveBeenCalledTimes(1);
    expect(input.emitted).toContainEqual(expect.objectContaining({
      type: "runtime-activity",
      activity: expect.objectContaining({
        kind: "tool",
        status: "running",
        toolName: "ambient_shell",
      }),
    }));
  });

  it("refreshes last activity when a running tool reports progress", () => {
    const input = baseInput();
    const watchdog = createRuntimeToolExecutionWatchdog(input);

    watchdog.begin("tool-call-1", "ambient_shell");
    input.nowMs.value = 2_250;
    watchdog.mark("tool-call-1", "ambient_shell");

    expect(watchdog.active()).toMatchObject({
      toolCallId: "tool-call-1",
      startedAt: 1_000,
      lastActivityAt: 2_250,
    });
  });

  it("emits timeout activity and aborts the session when a tool stalls", () => {
    vi.useFakeTimers();
    try {
      const input = baseInput();
      const watchdog = createRuntimeToolExecutionWatchdog(input);

      watchdog.begin("tool-call-1", "ambient_shell");
      input.nowMs.value = 6_250;
      vi.advanceTimersByTime(5_000);

      expect(watchdog.isTimedOut()).toBe(true);
      expect(watchdog.timeoutMessage()).toContain("ambient_shell");
      expect(input.abortSessionRun).toHaveBeenCalledTimes(1);
      expect(input.signalToolExecutionTimeout).toHaveBeenCalledTimes(1);
      expect(input.emitted).toContainEqual(expect.objectContaining({
        type: "runtime-activity",
        activity: expect.objectContaining({
          kind: "tool",
          status: "timeout",
          idleElapsedMs: 5_250,
          diagnostic: expect.objectContaining({
            toolCallId: "tool-call-1",
          }),
        }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("defers timeout scheduling while a permission prompt is waiting", () => {
    vi.useFakeTimers();
    try {
      let permissionWaiting = true;
      const input = baseInput({
        isPermissionWaiting: vi.fn(() => permissionWaiting),
      });
      const watchdog = createRuntimeToolExecutionWatchdog(input);

      watchdog.begin("tool-call-1", "ambient_shell");
      vi.advanceTimersByTime(5_000);
      expect(input.abortSessionRun).not.toHaveBeenCalled();

      permissionWaiting = false;
      watchdog.schedule();
      input.nowMs.value = 8_000;
      vi.advanceTimersByTime(5_000);

      expect(input.abortSessionRun).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the execution timer and resumes stream watchdog after the last active tool finishes", () => {
    const input = baseInput();
    const watchdog = createRuntimeToolExecutionWatchdog(input);

    watchdog.begin("tool-call-1", "ambient_shell");
    watchdog.finish("tool-call-1");

    expect(watchdog.isActive()).toBe(false);
    expect(watchdog.active()).toBeUndefined();
    expect(input.resumeStreamWatchdog).toHaveBeenCalledTimes(1);
  });

  it("does not resume the stream when a permission wait remains active", () => {
    const input = baseInput({
      isPermissionWaiting: vi.fn(() => true),
    });
    const watchdog = createRuntimeToolExecutionWatchdog(input);

    watchdog.begin("tool-call-1", "ambient_shell");
    watchdog.finish("tool-call-1");

    expect(watchdog.isActive()).toBe(false);
    expect(input.resumeStreamWatchdog).not.toHaveBeenCalled();
  });
});
