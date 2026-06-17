import { describe, expect, it } from "vitest";

import {
  runtimeProviderRetryFinishedActivity,
  runtimeProviderRetryStartingActivity,
} from "./agentRuntimeProviderRetryActivity";

describe("agentRuntimeProviderRetryActivity", () => {
  it("builds provider retry starting activity", () => {
    expect(runtimeProviderRetryStartingActivity({
      threadId: "thread-1",
      attempt: 2,
      maxAttempts: 4,
      delayMs: 1500,
      message: "429 upstream request failed",
    })).toEqual({
      threadId: "thread-1",
      kind: "retry",
      status: "starting",
      attempt: 2,
      maxAttempts: 4,
      delayMs: 1500,
      message: "429 upstream request failed",
    });
    expect(runtimeProviderRetryStartingActivity({
      threadId: "thread-1",
      attempt: 1,
      maxAttempts: 2,
      delayMs: 0,
      message: "Provider interrupted the stream; continuing from transcript: socket closed",
    })).toEqual({
      threadId: "thread-1",
      kind: "retry",
      status: "starting",
      attempt: 1,
      maxAttempts: 2,
      delayMs: 0,
      message: "Provider interrupted the stream; continuing from transcript: socket closed",
    });
  });

  it("builds provider retry finished activity", () => {
    expect(runtimeProviderRetryFinishedActivity({
      threadId: "thread-1",
      success: false,
      attempt: 2,
      message: "still rate limited",
    })).toEqual({
      threadId: "thread-1",
      kind: "retry",
      status: "finished",
      success: false,
      attempt: 2,
      message: "still rate limited",
    });
    expect(runtimeProviderRetryFinishedActivity({
      threadId: "thread-1",
      success: true,
      attempt: 3,
    })).toEqual({
      threadId: "thread-1",
      kind: "retry",
      status: "finished",
      success: true,
      attempt: 3,
      message: undefined,
    });
  });
});
