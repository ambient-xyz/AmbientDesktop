import { describe, expect, it } from "vitest";

import {
  runtimeToolExecutionRunningActivity,
  runtimeToolExecutionTimeoutActivity,
  runtimeToolExecutionTimeoutMessage,
} from "./agentRuntimeToolExecutionActivity";

describe("agentRuntimeToolExecutionActivity", () => {
  it("builds the local tool execution timeout message", () => {
    expect(runtimeToolExecutionTimeoutMessage("ambient_search", 30000)).toBe(
      "Local tool ambient_search stalled after 30000ms without progress. Ambient stopped this turn so the tool can be retried or inspected.",
    );
  });

  it("builds the local tool running activity", () => {
    expect(runtimeToolExecutionRunningActivity({
      threadId: "thread-1",
      toolName: "ambient_search",
      idleTimeoutMs: 30000,
    })).toEqual({
      threadId: "thread-1",
      kind: "tool",
      status: "running",
      toolName: "ambient_search",
      message: "Running local tool ambient_search.",
      idleElapsedMs: 0,
      idleTimeoutMs: 30000,
    });
  });

  it("builds the local tool timeout activity", () => {
    expect(runtimeToolExecutionTimeoutActivity({
      threadId: "thread-1",
      toolCallId: "call-1",
      toolName: "ambient_search",
      idleElapsedMs: 31000,
      idleTimeoutMs: 30000,
      startedAtMs: 1000,
      lastActivityAtMs: 2000,
    })).toEqual({
      threadId: "thread-1",
      kind: "tool",
      status: "timeout",
      toolName: "ambient_search",
      message: "Local tool ambient_search stalled after 30000ms without progress. Ambient stopped this turn so the tool can be retried or inspected.",
      idleElapsedMs: 31000,
      idleTimeoutMs: 30000,
      diagnostic: {
        toolCallId: "call-1",
        startedAtMs: 1000,
        lastActivityAtMs: 2000,
      },
    });
  });
});
