import { describe, expect, it } from "vitest";

import { runtimeThinkingEventModel } from "./thinkingEvents";

const baseContext = {
  currentThinkingReceivedText: false,
  currentThinkingFinalText: "",
  thinkingOutputChars: 0,
};

describe("thinkingEvents", () => {
  it("models thinking start as an ensure-message operation", () => {
    expect(runtimeThinkingEventModel({ kind: "thinking-start" }, baseContext)).toEqual({
      ...baseContext,
      messageOperation: { kind: "ensure" },
      markPiStreamActivity: false,
      activeRunStatus: "streaming",
      finish: false,
    });
  });

  it("models thinking delta updates", () => {
    expect(runtimeThinkingEventModel({
      kind: "thinking-update",
      delta: "Inspecting ",
    }, {
      currentThinkingReceivedText: false,
      currentThinkingFinalText: "Plan: ",
      thinkingOutputChars: 6,
    })).toEqual({
      currentThinkingReceivedText: true,
      currentThinkingFinalText: "Plan: Inspecting ",
      thinkingOutputChars: 17,
      messageOperation: { kind: "append", delta: "Inspecting " },
      markPiStreamActivity: true,
      activeRunStatus: "streaming",
      finish: false,
    });
  });

  it("models final-text replacement before any thinking delta", () => {
    expect(runtimeThinkingEventModel({
      kind: "thinking-update",
      finalText: "Full visible thinking.",
    }, baseContext)).toEqual({
      currentThinkingReceivedText: false,
      currentThinkingFinalText: "Full visible thinking.",
      thinkingOutputChars: 22,
      messageOperation: {
        kind: "replace",
        content: "Full visible thinking.",
        metadata: {
          status: "thinking",
          runtime: "pi",
          provider: "ambient",
          kind: "thinking",
        },
      },
      markPiStreamActivity: false,
      activeRunStatus: "streaming",
      finish: false,
    });
  });

  it("ignores final-text replacement after thinking deltas have streamed", () => {
    expect(runtimeThinkingEventModel({
      kind: "thinking-update",
      finalText: "Replacement should not win.",
    }, {
      currentThinkingReceivedText: true,
      currentThinkingFinalText: "Already streamed.",
      thinkingOutputChars: 17,
    })).toEqual({
      currentThinkingReceivedText: true,
      currentThinkingFinalText: "Already streamed.",
      thinkingOutputChars: 17,
      markPiStreamActivity: false,
      activeRunStatus: "streaming",
      finish: false,
    });
  });

  it("models thinking end with final text and finish", () => {
    expect(runtimeThinkingEventModel({
      kind: "thinking-end",
      finalText: "Finished thinking.",
    }, baseContext)).toEqual({
      currentThinkingReceivedText: false,
      currentThinkingFinalText: "Finished thinking.",
      thinkingOutputChars: 18,
      messageOperation: {
        kind: "replace",
        content: "Finished thinking.",
        metadata: {
          status: "thinking",
          runtime: "pi",
          provider: "ambient",
          kind: "thinking",
        },
      },
      markPiStreamActivity: false,
      finish: true,
    });
  });

  it("models thinking end after streamed deltas as finish-only", () => {
    expect(runtimeThinkingEventModel({
      kind: "thinking-end",
      finalText: "Ignored terminal copy.",
    }, {
      currentThinkingReceivedText: true,
      currentThinkingFinalText: "Streamed copy.",
      thinkingOutputChars: 14,
    })).toEqual({
      currentThinkingReceivedText: true,
      currentThinkingFinalText: "Streamed copy.",
      thinkingOutputChars: 14,
      markPiStreamActivity: false,
      finish: true,
    });
  });
});
