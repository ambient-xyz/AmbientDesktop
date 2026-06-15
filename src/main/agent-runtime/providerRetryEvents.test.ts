import { describe, expect, it } from "vitest";

import { runtimeProviderRetryEventModel } from "./providerRetryEvents";

describe("providerRetryEvents", () => {
  it("models retry start before visible output", () => {
    expect(runtimeProviderRetryEventModel({
      kind: "auto-retry-start",
      attempt: 2,
      maxAttempts: 4,
      delayMs: 1500,
      error: "429 upstream request failed",
    }, {
      threadId: "thread-1",
      providerRetryAttemptCount: 1,
      providerRetryLastError: "previous",
      providerRetryBeforeVisibleOutput: false,
      providerRetryRecovered: false,
      receivedAnyText: false,
      assistantOutputChars: 0,
      thinkingOutputChars: 0,
      activeToolMessageCount: 0,
    })).toEqual({
      kind: "start",
      providerRetryAttemptCount: 2,
      providerRetryLastError: "429 upstream request failed",
      providerRetryBeforeVisibleOutput: true,
      providerRetryRecovered: false,
      runtimeError: { kind: "clear" },
      activeRunStatus: "retrying",
      activity: {
        threadId: "thread-1",
        kind: "retry",
        status: "starting",
        attempt: 2,
        maxAttempts: 4,
        delayMs: 1500,
        message: "429 upstream request failed",
      },
    });
  });

  it("preserves retry-before-visible-output when retry starts after visible output", () => {
    const model = runtimeProviderRetryEventModel({
      kind: "auto-retry-start",
      attempt: 1,
      maxAttempts: 2,
      delayMs: 0,
      error: "socket closed",
    }, {
      threadId: "thread-1",
      providerRetryAttemptCount: 5,
      providerRetryBeforeVisibleOutput: false,
      providerRetryRecovered: true,
      receivedAnyText: true,
      assistantOutputChars: 10,
      thinkingOutputChars: 0,
      activeToolMessageCount: 0,
    });

    expect(model.providerRetryAttemptCount).toBe(5);
    expect(model.providerRetryBeforeVisibleOutput).toBe(false);
    expect(model.providerRetryRecovered).toBe(true);
  });

  it("models a successful retry finish", () => {
    expect(runtimeProviderRetryEventModel({
      kind: "auto-retry-end",
      success: true,
      attempt: 3,
    }, {
      threadId: "thread-1",
      providerRetryAttemptCount: 2,
      providerRetryLastError: "previous",
      providerRetryBeforeVisibleOutput: true,
      providerRetryRecovered: false,
      receivedAnyText: false,
      assistantOutputChars: 0,
      thinkingOutputChars: 0,
      activeToolMessageCount: 0,
    })).toEqual({
      kind: "end",
      providerRetryAttemptCount: 3,
      providerRetryLastError: "previous",
      providerRetryBeforeVisibleOutput: true,
      providerRetryRecovered: true,
      runtimeError: { kind: "clear" },
      activeRunStatus: "streaming",
      activity: {
        threadId: "thread-1",
        kind: "retry",
        status: "finished",
        success: true,
        attempt: 3,
        message: undefined,
      },
    });
  });

  it("models a failed retry finish with an error", () => {
    expect(runtimeProviderRetryEventModel({
      kind: "auto-retry-end",
      success: false,
      attempt: 3,
      error: "still rate limited",
    }, {
      threadId: "thread-1",
      providerRetryAttemptCount: 2,
      providerRetryBeforeVisibleOutput: false,
      providerRetryRecovered: false,
      receivedAnyText: false,
      assistantOutputChars: 0,
      thinkingOutputChars: 0,
      activeToolMessageCount: 0,
    })).toEqual(expect.objectContaining({
      kind: "end",
      providerRetryAttemptCount: 3,
      providerRetryLastError: "still rate limited",
      providerRetryRecovered: false,
      runtimeError: { kind: "set", message: "still rate limited" },
    }));
  });

  it("preserves runtime error when a failed retry finish has no error text", () => {
    const model = runtimeProviderRetryEventModel({
      kind: "auto-retry-end",
      success: false,
      attempt: 1,
    }, {
      threadId: "thread-1",
      providerRetryAttemptCount: 1,
      providerRetryLastError: "previous",
      providerRetryBeforeVisibleOutput: false,
      providerRetryRecovered: false,
      receivedAnyText: false,
      assistantOutputChars: 0,
      thinkingOutputChars: 0,
      activeToolMessageCount: 0,
    });

    expect(model.runtimeError).toEqual({ kind: "preserve" });
    expect(model.providerRetryLastError).toBe("previous");
  });
});
