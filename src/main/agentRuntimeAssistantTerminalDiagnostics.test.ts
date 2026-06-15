import { describe, expect, it } from "vitest";
import {
  assistantTerminalCleanupActivity,
  assistantTerminalEventDiagnostic,
} from "./agentRuntimeAssistantTerminalDiagnostics";

describe("agentRuntimeAssistantTerminalDiagnostics", () => {
  it("summarizes assistant terminal event metadata", () => {
    const diagnostic = assistantTerminalEventDiagnostic(
      {
        type: "assistant_terminal",
        message: {
          stopReason: "end_turn",
          responseId: "response-1",
          content: [{ type: "text", text: "Done" }, { type: "toolCall" }],
          usage: {
            input: 10,
            output: 20,
            cacheRead: 3,
            cacheWrite: 4,
            totalTokens: 37,
          },
        },
      },
      "final text",
    );

    expect(diagnostic).toEqual({
      eventType: "assistant_terminal",
      stopReason: "end_turn",
      responseId: "response-1",
      contentBlockCount: 2,
      finalTextChars: 10,
      usage: {
        input: 10,
        output: 20,
        cacheRead: 3,
        cacheWrite: 4,
        totalTokens: 37,
      },
    });
  });

  it("truncates error text and ignores non-finite usage fields", () => {
    const diagnostic = assistantTerminalEventDiagnostic(
      {
        type: undefined,
        message: {
          usage: {
            input: Number.POSITIVE_INFINITY,
            output: "20",
            cacheRead: 0,
          },
        },
      },
      "",
      "x".repeat(300),
    );

    expect(diagnostic).toEqual({
      eventType: "unknown",
      finalTextChars: 0,
      error: "x".repeat(240),
      usage: {
        cacheRead: 0,
      },
    });
  });

  it("builds assistant terminal cleanup activity", () => {
    const diagnostic = {
      reason: "assistant-terminal-before-prompt-resolved" as const,
      cleanupAction: "abort-and-dispose-session" as const,
      promptPendingMs: 1200,
      assistantTerminalGraceMs: 500,
      outputChars: 42,
      thinkingChars: 9,
      receivedAnyText: true,
      currentAssistantReceivedText: true,
      currentAssistantFinalTextChars: 42,
      sessionFile: "/tmp/session.jsonl",
      lastAssistantTerminalEvent: {
        eventType: "assistant_terminal",
        stopReason: "end_turn",
      },
    };

    expect(assistantTerminalCleanupActivity({
      threadId: "thread-1",
      outputChars: 42,
      thinkingChars: 9,
      idleElapsedMs: 500,
      idleTimeoutMs: 30000,
      diagnostic,
    })).toEqual({
      threadId: "thread-1",
      kind: "stream",
      status: "running",
      outputChars: 42,
      thinkingChars: 9,
      idleElapsedMs: 500,
      idleTimeoutMs: 30000,
      message: "Ambient observed final assistant output before the Pi prompt promise resolved; finalizing the visible turn.",
      diagnostic,
    });
  });
});
