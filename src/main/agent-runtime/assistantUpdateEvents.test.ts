import { describe, expect, it } from "vitest";

import { runtimeAssistantUpdateEventModel } from "./assistantUpdateEvents";

const baseContext = {
  cleanupAbort: false,
  receivedAnyText: false,
  currentAssistantReceivedText: false,
  currentAssistantFinalText: "",
  assistantOutputChars: 0,
  assistantTextObservedAfterLastToolEnd: false,
  hasLastCompletedTool: false,
};

describe("assistantUpdateEvents", () => {
  it("models runtime errors unless terminal cleanup should be ignored", () => {
    expect(runtimeAssistantUpdateEventModel({
      kind: "assistant-update",
      error: "provider failed",
    }, baseContext).runtimeError).toEqual({ kind: "set", message: "provider failed" });

    expect(runtimeAssistantUpdateEventModel({
      kind: "assistant-update",
      error: "request aborted",
    }, {
      ...baseContext,
      cleanupAbort: true,
    }).runtimeError).toEqual({ kind: "preserve" });
  });

  it("models visible assistant deltas", () => {
    expect(runtimeAssistantUpdateEventModel({
      kind: "assistant-update",
      delta: " raw chunk",
    }, {
      ...baseContext,
      visibleDelta: " visible chunk",
      currentAssistantFinalText: "Existing",
      assistantOutputChars: 8,
      hasLastCompletedTool: true,
    })).toEqual({
      receivedAnyText: true,
      currentAssistantReceivedText: true,
      currentAssistantFinalText: "Existing visible chunk",
      assistantOutputChars: 22,
      assistantTextObservedAfterLastToolEnd: true,
      runtimeError: { kind: "preserve" },
      messageOperation: { kind: "append", delta: " visible chunk" },
      markPiStreamActivity: true,
      activeRunStatus: "streaming",
      markFirstAssistantVisibleText: true,
    });
  });

  it("models hidden assistant deltas as stream activity without visible text", () => {
    expect(runtimeAssistantUpdateEventModel({
      kind: "assistant-update",
      delta: "<think>",
    }, {
      ...baseContext,
      visibleDelta: "",
      currentAssistantFinalText: "Existing",
      assistantOutputChars: 8,
    })).toEqual({
      receivedAnyText: false,
      currentAssistantReceivedText: false,
      currentAssistantFinalText: "Existing",
      assistantOutputChars: 8,
      assistantTextObservedAfterLastToolEnd: false,
      runtimeError: { kind: "preserve" },
      markPiStreamActivity: true,
      activeRunStatus: "streaming",
      markFirstAssistantVisibleText: false,
    });
  });

  it("captures final text before visible deltas have streamed", () => {
    expect(runtimeAssistantUpdateEventModel({
      kind: "assistant-update",
      finalText: "Visible <think>private</think> answer",
    }, {
      ...baseContext,
      assistantOutputChars: 4,
      hasLastCompletedTool: true,
    })).toEqual({
      receivedAnyText: false,
      currentAssistantReceivedText: false,
      currentAssistantFinalText: "Visible  answer",
      assistantOutputChars: "Visible  answer".length,
      assistantTextObservedAfterLastToolEnd: true,
      runtimeError: { kind: "preserve" },
      markPiStreamActivity: false,
      markFirstAssistantVisibleText: false,
    });
  });

  it("ignores final text after visible deltas have streamed", () => {
    expect(runtimeAssistantUpdateEventModel({
      kind: "assistant-update",
      finalText: "replacement",
    }, {
      ...baseContext,
      receivedAnyText: true,
      currentAssistantReceivedText: true,
      currentAssistantFinalText: "streamed",
      assistantOutputChars: 8,
      assistantTextObservedAfterLastToolEnd: true,
      hasLastCompletedTool: true,
    })).toEqual({
      receivedAnyText: true,
      currentAssistantReceivedText: true,
      currentAssistantFinalText: "streamed",
      assistantOutputChars: 8,
      assistantTextObservedAfterLastToolEnd: true,
      runtimeError: { kind: "preserve" },
      markPiStreamActivity: false,
      markFirstAssistantVisibleText: false,
    });
  });
});
