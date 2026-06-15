import { describe, expect, it } from "vitest";

import { runtimeAssistantEndEventModel } from "./assistantEndEvents";

const baseContext = {
  cleanupAbort: false,
  receivedAnyText: false,
  currentAssistantReceivedText: false,
  currentAssistantFinalText: "",
  assistantOutputChars: 0,
  assistantTextObservedAfterLastToolEnd: false,
  hasLastCompletedTool: false,
  hasLastAssistantTerminalEvent: false,
};

describe("assistantEndEvents", () => {
  it("models terminal final text replacement and runtime error", () => {
    expect(runtimeAssistantEndEventModel({
      kind: "assistant-end",
      finalText: "Visible <think>private</think> answer",
      error: "provider failed",
    }, {
      ...baseContext,
      assistantOutputChars: 4,
      hasLastCompletedTool: true,
    })).toEqual({
      receivedAnyText: true,
      currentAssistantReceivedText: true,
      currentAssistantFinalText: "Visible  answer",
      assistantOutputChars: "Visible  answer".length,
      assistantTextObservedAfterLastToolEnd: true,
      runtimeError: { kind: "set", message: "provider failed" },
      shouldRecordTerminalDiagnostic: true,
      primaryMessageOperation: {
        kind: "replace",
        content: "Visible  answer",
        metadata: {
          status: "error",
          runtime: "pi",
          provider: "ambient",
        },
      },
      markFirstAssistantVisibleText: true,
      scheduleTerminalCompletion: true,
    });
  });

  it("preserves runtime error for cleanup aborts and records only missing terminal diagnostics", () => {
    expect(runtimeAssistantEndEventModel({
      kind: "assistant-end",
      error: "Request was aborted.",
    }, {
      ...baseContext,
      cleanupAbort: true,
      hasLastAssistantTerminalEvent: false,
    })).toMatchObject({
      runtimeError: { kind: "preserve" },
      shouldRecordTerminalDiagnostic: true,
      primaryMessageOperation: { kind: "finish", status: "done" },
    });

    expect(runtimeAssistantEndEventModel({
      kind: "assistant-end",
      error: "Request was aborted.",
    }, {
      ...baseContext,
      cleanupAbort: true,
      hasLastAssistantTerminalEvent: true,
    }).shouldRecordTerminalDiagnostic).toBe(false);
  });

  it("finishes the current assistant message when final text has already streamed", () => {
    expect(runtimeAssistantEndEventModel({
      kind: "assistant-end",
      finalText: "Replacement should not win.",
    }, {
      ...baseContext,
      receivedAnyText: true,
      currentAssistantReceivedText: true,
      currentAssistantFinalText: "Streamed text.",
      assistantOutputChars: 14,
      assistantTextObservedAfterLastToolEnd: true,
      hasLastAssistantTerminalEvent: true,
    })).toEqual({
      receivedAnyText: true,
      currentAssistantReceivedText: true,
      currentAssistantFinalText: "Streamed text.",
      assistantOutputChars: 14,
      assistantTextObservedAfterLastToolEnd: true,
      runtimeError: { kind: "preserve" },
      shouldRecordTerminalDiagnostic: true,
      primaryMessageOperation: { kind: "finish", status: "done" },
      markFirstAssistantVisibleText: false,
      scheduleTerminalCompletion: true,
    });
  });

  it("models trailing visible text after terminal finalization without setting first-visible marker", () => {
    expect(runtimeAssistantEndEventModel({
      kind: "assistant-end",
    }, {
      ...baseContext,
      receivedAnyText: true,
      currentAssistantReceivedText: true,
      currentAssistantFinalText: "Visible",
      assistantOutputChars: 7,
      hasLastCompletedTool: true,
      trailingVisibleText: " suffix",
    })).toEqual({
      receivedAnyText: true,
      currentAssistantReceivedText: true,
      currentAssistantFinalText: "Visible suffix",
      assistantOutputChars: 14,
      assistantTextObservedAfterLastToolEnd: true,
      runtimeError: { kind: "preserve" },
      shouldRecordTerminalDiagnostic: true,
      primaryMessageOperation: { kind: "finish", status: "done" },
      trailingMessageOperation: { kind: "append", delta: " suffix" },
      markFirstAssistantVisibleText: false,
      scheduleTerminalCompletion: true,
    });
  });
});
