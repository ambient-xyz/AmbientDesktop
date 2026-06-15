import { describe, expect, it, vi } from "vitest";
import type { PromptCompletion } from "../postToolFinalization";
import {
  runRuntimePromptCompletionLoop,
  type RuntimePromptCompletion,
  type RuntimePromptCompletionLoopInput,
} from "./runtimePromptCompletionLoop";

function pendingPromise<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function baseInput(
  overrides: Partial<RuntimePromptCompletionLoopInput> = {},
): RuntimePromptCompletionLoopInput {
  return {
    promptCompletion: pendingPromise<PromptCompletion>(),
    postToolContinuation: {
      wait: vi.fn(() => pendingPromise<PromptCompletion>()),
      request: vi.fn(async () => "exhausted" as const),
      extendToFinalizationWindow: vi.fn(() => false),
    },
    assistantTerminalCompletion: pendingPromise<"assistant-terminal">(),
    streamWatchdogCompletion: pendingPromise<RuntimePromptCompletion>(),
    hasLastCompletedTool: vi.fn(() => false),
    assistantTextObservedAfterLastToolEnd: vi.fn(() => false),
    isStreamTimedOut: vi.fn(() => false),
    streamTimeoutMessage: vi.fn(() => "Ambient/Pi stream stalled after 30000ms without stream activity."),
    isToolExecutionTimedOut: vi.fn(() => false),
    toolExecutionTimeoutMessage: vi.fn(() => undefined),
    finalizeAssistantTerminalRun: vi.fn(async () => undefined),
    abortSessionRun: vi.fn(async () => undefined),
    waitForPromptAfterAbort: vi.fn(async () => undefined),
    cleanup: vi.fn(),
    ...overrides,
  };
}

describe("runRuntimePromptCompletionLoop", () => {
  it("requests a prompt-resolved continuation after a completed tool without assistant text", async () => {
    const input = baseInput({
      promptCompletion: Promise.resolve("prompt"),
      hasLastCompletedTool: vi.fn(() => true),
      assistantTextObservedAfterLastToolEnd: vi.fn(() => false),
    });

    await expect(runRuntimePromptCompletionLoop(input)).resolves.toEqual({
      finalizedAfterToolIdle: false,
    });

    expect(input.postToolContinuation.request).toHaveBeenCalledWith("prompt-resolved-after-tool");
    expect(input.abortSessionRun).not.toHaveBeenCalled();
    expect(input.cleanup).toHaveBeenCalledTimes(1);
  });

  it("aborts the session after exhausted post-tool idle continuation and waits for prompt cleanup", async () => {
    const input = baseInput({
      postToolContinuation: {
        wait: vi.fn(() => Promise.resolve("post-tool-idle" as const)),
        request: vi.fn(async () => "exhausted" as const),
        extendToFinalizationWindow: vi.fn(() => false),
      },
    });

    await expect(runRuntimePromptCompletionLoop(input)).resolves.toEqual({
      finalizedAfterToolIdle: true,
    });

    expect(input.postToolContinuation.request).toHaveBeenCalledWith("post-tool-idle");
    expect(input.abortSessionRun).toHaveBeenCalledTimes(1);
    expect(input.waitForPromptAfterAbort).toHaveBeenCalledTimes(1);
    expect(input.cleanup).toHaveBeenCalledTimes(1);
  });

  it("extends to the finalization window once before deciding the prompt is complete", async () => {
    const wait = vi.fn<() => Promise<PromptCompletion>>();
    wait
      .mockResolvedValueOnce("post-tool-idle")
      .mockResolvedValueOnce("prompt");
    const input = baseInput({
      postToolContinuation: {
        wait,
        request: vi.fn(async () => "exhausted" as const),
        extendToFinalizationWindow: vi.fn(() => true),
      },
    });

    await expect(runRuntimePromptCompletionLoop(input)).resolves.toEqual({
      finalizedAfterToolIdle: false,
    });

    expect(input.postToolContinuation.extendToFinalizationWindow).toHaveBeenCalledTimes(1);
    expect(input.abortSessionRun).not.toHaveBeenCalled();
    expect(input.cleanup).toHaveBeenCalledTimes(1);
  });

  it("finalizes assistant-terminal completion when assistant terminal wins the race", async () => {
    const input = baseInput({
      assistantTerminalCompletion: Promise.resolve("assistant-terminal"),
    });

    await expect(runRuntimePromptCompletionLoop(input)).resolves.toEqual({
      finalizedAfterToolIdle: false,
    });

    expect(input.finalizeAssistantTerminalRun).toHaveBeenCalledTimes(1);
    expect(input.abortSessionRun).not.toHaveBeenCalled();
    expect(input.cleanup).toHaveBeenCalledTimes(1);
  });

  it("waits for prompt cleanup when a parent-control abort signal wins the race", async () => {
    const input = baseInput({
      streamWatchdogCompletion: Promise.resolve("parent-control-abort"),
    });

    await expect(runRuntimePromptCompletionLoop(input)).resolves.toEqual({
      finalizedAfterToolIdle: false,
    });

    expect(input.waitForPromptAfterAbort).toHaveBeenCalledTimes(1);
    expect(input.abortSessionRun).not.toHaveBeenCalled();
    expect(input.cleanup).toHaveBeenCalledTimes(1);
  });

  it("surfaces stream timeout state and still cleans up the loop resources", async () => {
    const input = baseInput({
      streamWatchdogCompletion: Promise.resolve("stream-timeout"),
      isStreamTimedOut: vi.fn(() => true),
      streamTimeoutMessage: vi.fn(() => "Ambient/Pi did not start streaming within 5000ms."),
    });

    await expect(runRuntimePromptCompletionLoop(input)).rejects.toThrow(
      "Ambient/Pi did not start streaming within 5000ms.",
    );
    expect(input.cleanup).toHaveBeenCalledTimes(1);
  });

  it("surfaces the default tool execution timeout and still cleans up the loop resources", async () => {
    const input = baseInput({
      streamWatchdogCompletion: Promise.resolve("tool-timeout"),
      isToolExecutionTimedOut: vi.fn(() => true),
      toolExecutionTimeoutMessage: vi.fn(() => undefined),
    });

    await expect(runRuntimePromptCompletionLoop(input)).rejects.toThrow("Local tool execution timed out.");
    expect(input.cleanup).toHaveBeenCalledTimes(1);
  });
});
