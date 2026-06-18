import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import {
  createRuntimePostToolContinuationController,
  type RuntimePostToolContinuationCompletion,
} from "./runtimePostToolContinuationController";

function toolMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-tool-1",
    threadId: "thread-1",
    role: "tool",
    content: "bash completed\nContinuation:\n- summarize the tool result",
    metadata: {
      status: "done",
      toolName: "bash",
      toolCallId: "tool-call-1",
    },
    createdAt: "2026-06-15T00:00:00.000Z",
    ...overrides,
  };
}

function pendingPromise<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function baseInput(overrides: Record<string, unknown> = {}) {
  const emitted: DesktopEvent[] = [];
  const messages = [toolMessage()];
  return {
    threadId: "thread-1",
    runId: "run-1",
    continuationIdleMs: 15_000,
    finalizationIdleMs: 30_000,
    tickMs: 1_000,
    streamIdleTimeoutMs: 30_000,
    maxAttempts: 3,
    getOutputChars: vi.fn(() => 12),
    getThinkingChars: vi.fn(() => 4),
    getMessages: vi.fn(() => messages),
    getLastCompletedTool: vi.fn(() => ({
      runId: "run-1",
      toolCallId: "tool-call-1",
      messageId: "message-tool-1",
      eventSeqAtEnd: 8,
      label: "bash",
      status: "done" as const,
    })),
    getRunEventSeq: vi.fn(() => 8),
    resetStreamWatchdog: vi.fn(),
    assistantTerminalCompletion: pendingPromise<"assistant-terminal">(),
    streamWatchdogCompletion: pendingPromise<RuntimePostToolContinuationCompletion>(),
    isStreamTimedOut: vi.fn(() => false),
    streamTimeoutMessage: vi.fn(() => "Ambient/Pi stream stalled after 30000ms without stream activity."),
    isToolExecutionTimedOut: vi.fn(() => false),
    toolExecutionTimeoutMessage: vi.fn(() => undefined),
    steerContinuation: vi.fn(async () => undefined),
    finalizeAssistantTerminalRun: vi.fn(async () => undefined),
    emitRunEvent: vi.fn((event: DesktopEvent) => {
      emitted.push(event);
    }),
    emitted,
    messages,
    ...overrides,
  };
}

describe("createRuntimePostToolContinuationController", () => {
  it("emits continuation activity, validates the latest tool, steers Pi, and resets the stream watchdog", async () => {
    const input = baseInput();
    const controller = createRuntimePostToolContinuationController(input);

    await expect(controller.request("post-tool-idle")).resolves.toBe("continued");

    expect(controller.attempts()).toBe(1);
    expect(controller.idleMs()).toBe(15_000);
    expect(input.steerContinuation).toHaveBeenCalledWith(expect.stringContaining("Tool call id: tool-call-1"));
    expect(input.steerContinuation).toHaveBeenCalledWith(expect.stringContaining("- summarize the tool result"));
    expect(input.resetStreamWatchdog).toHaveBeenCalledTimes(1);
    expect(input.emitted).toContainEqual(expect.objectContaining({
      type: "runtime-activity",
      activity: expect.objectContaining({
        kind: "stream",
        status: "running",
        message: "Ambient is asking Pi to continue from the completed tool result (attempt 1/3).",
      }),
    }));
  });

  it("emits a stale-continuation activity and skips steering when freshness validation fails", async () => {
    const input = baseInput({
      getMessages: vi.fn(() => [
        toolMessage({
          id: "message-new-tool",
          content: "read_file completed",
          metadata: {
            status: "done",
            toolName: "read_file",
            toolCallId: "tool-new",
          },
        }),
      ]),
    });
    const controller = createRuntimePostToolContinuationController(input);

    await expect(controller.request("prompt-resolved-after-tool")).resolves.toBe("continued");

    expect(input.steerContinuation).not.toHaveBeenCalled();
    expect(input.resetStreamWatchdog).toHaveBeenCalledTimes(1);
    expect(input.emitted).toContainEqual(expect.objectContaining({
      type: "runtime-activity",
      activity: expect.objectContaining({
        kind: "stream",
        status: "running",
        message: "Ambient skipped a stale post-tool continuation because newer run activity arrived before delivery.",
        diagnostic: expect.objectContaining({
          reason: "tool-mismatch",
          latestToolCallId: "tool-new",
        }),
      }),
    }));
  });

  it("finalizes assistant-terminal completion when terminal output wins the steer race", async () => {
    const input = baseInput({
      assistantTerminalCompletion: Promise.resolve("assistant-terminal"),
      steerContinuation: vi.fn(() => pendingPromise()),
    });
    const controller = createRuntimePostToolContinuationController(input);

    await expect(controller.request("post-tool-idle")).resolves.toBe("assistant-terminal");

    expect(input.finalizeAssistantTerminalRun).toHaveBeenCalledTimes(1);
    expect(input.finalizeAssistantTerminalRun).toHaveBeenCalledWith(expect.any(Promise));
  });

  it("reports exhausted attempts and can extend the idle tracker to the finalization window once", async () => {
    const input = baseInput({ maxAttempts: 0 });
    const controller = createRuntimePostToolContinuationController(input);

    await expect(controller.request("post-tool-idle")).resolves.toBe("exhausted");
    expect(input.steerContinuation).not.toHaveBeenCalled();
    expect(controller.idleMs()).toBe(15_000);
    expect(controller.extendToFinalizationWindow()).toBe(true);
    expect(controller.idleMs()).toBe(30_000);
    expect(controller.extendToFinalizationWindow()).toBe(false);
  });
});
