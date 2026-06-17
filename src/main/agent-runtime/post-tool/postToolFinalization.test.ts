import { afterEach, describe, expect, it, vi } from "vitest";
import { createPostToolFinalizationTracker, type PromptCompletion } from "./postToolFinalization";

function captureCompletion(promise: Promise<PromptCompletion>): { get value(): PromptCompletion | undefined } {
  let value: PromptCompletion | undefined;
  promise.then((completion) => {
    value = completion;
  });
  return {
    get value() {
      return value;
    },
  };
}

describe("createPostToolFinalizationTracker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not resolve before any tool has completed", async () => {
    vi.useFakeTimers();
    const tracker = createPostToolFinalizationTracker({ idleMs: 50, tickMs: 10 });
    const completion = captureCompletion(tracker.wait());

    await vi.advanceTimersByTimeAsync(200);

    expect(completion.value).toBeUndefined();
    tracker.stop();
  });

  it("does not resolve while a tool call is still pending", async () => {
    vi.useFakeTimers();
    const tracker = createPostToolFinalizationTracker({ idleMs: 50, tickMs: 10 });
    const completion = captureCompletion(tracker.wait());

    tracker.markToolStart("tool-1");
    await vi.advanceTimersByTimeAsync(200);

    expect(completion.value).toBeUndefined();
    tracker.stop();
  });

  it("resolves after a completed tool has been idle for the configured window", async () => {
    vi.useFakeTimers();
    const tracker = createPostToolFinalizationTracker({ idleMs: 50, tickMs: 10 });
    const promise = tracker.wait();
    const completion = captureCompletion(promise);

    tracker.markToolStart("tool-1");
    tracker.markToolEnd("tool-1");
    await vi.advanceTimersByTimeAsync(49);
    expect(completion.value).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toBe("post-tool-idle");
  });

  it("does not resolve after the agent emits a terminal event", async () => {
    vi.useFakeTimers();
    const tracker = createPostToolFinalizationTracker({ idleMs: 50, tickMs: 10 });
    const completion = captureCompletion(tracker.wait());

    tracker.markToolEnd("tool-1");
    tracker.markAgentEnd();
    await vi.advanceTimersByTimeAsync(200);

    expect(completion.value).toBeUndefined();
    tracker.stop();
  });
});
