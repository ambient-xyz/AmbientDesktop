import { describe, expect, it } from "vitest";

import { emptyAssistantStallRuntimeActivity } from "./agentRuntimeEmptyAssistantStallActivity";

describe("agentRuntimeEmptyAssistantStallActivity", () => {
  it("builds the empty assistant stream stall timeout activity", () => {
    expect(emptyAssistantStallRuntimeActivity({
      threadId: "thread-1",
      outputChars: 12,
      thinkingChars: 4,
      idleTimeoutMs: 5000,
      message: "Ambient/Pi stream stalled after 5000 ms without stream activity.",
      assistantStartCount: 2,
      receivedAnyText: false,
      currentAssistantReceivedText: false,
      currentAssistantFinalTextChars: 0,
      streamEventCount: 3,
    })).toEqual({
      threadId: "thread-1",
      kind: "stream",
      status: "timeout",
      outputChars: 12,
      thinkingChars: 4,
      idleElapsedMs: 5000,
      idleTimeoutMs: 5000,
      message: "Ambient/Pi stream stalled after 5000 ms without stream activity.",
      diagnostic: {
        reason: "empty-assistant-stream-stall",
        assistantStartCount: 2,
        receivedAnyText: false,
        currentAssistantReceivedText: false,
        currentAssistantFinalTextChars: 0,
        streamEventCount: 3,
      },
    });
  });

  it("includes optional session and trace diagnostics", () => {
    const trace = {
      path: "/tmp/pi-stream-trace.json",
      eventCount: 3,
      recentEventCount: 2,
      reason: "stream stalled",
      recordedAt: "2026-06-12T19:00:00.000Z",
      promptStartLine: 10,
    };

    expect(emptyAssistantStallRuntimeActivity({
      threadId: "thread-1",
      outputChars: 0,
      thinkingChars: 0,
      idleTimeoutMs: 30000,
      message: "stream stalled",
      assistantStartCount: 1,
      receivedAnyText: false,
      currentAssistantReceivedText: false,
      currentAssistantFinalTextChars: 0,
      streamEventCount: 0,
      sessionFile: "/tmp/session.jsonl",
      trace,
    })).toMatchObject({
      diagnostic: {
        sessionFile: "/tmp/session.jsonl",
        trace,
      },
    });
  });
});
