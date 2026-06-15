import { describe, expect, it } from "vitest";

import { runtimeAgentEndEventModel } from "./agentEndEvents";

const baseContext = {
  rawEvent: { type: "agent_end" },
  shouldIgnoreError: (_error: string) => false,
  receivedAnyText: false,
  currentAssistantFinalText: "",
  assistantTextObservedAfterLastToolEnd: false,
  hasLastCompletedTool: false,
};

describe("agentEndEvents", () => {
  it("models terminal diagnostics, final text, and last runtime error", () => {
    expect(runtimeAgentEndEventModel({
      kind: "agent-end",
      finalTexts: [
        "First answer",
        "Visible <think>private</think> answer",
      ],
      errors: ["ignored abort", "provider failed"],
    }, {
      ...baseContext,
      rawEvent: { type: "agent_end", messages: [{}, {}, {}] },
      shouldIgnoreError: (error: string) => error === "ignored abort",
      hasLastCompletedTool: true,
    })).toEqual({
      terminalDiagnostic: {
        eventType: "agent_end",
        contentBlockCount: 3,
        finalTextChars: "First answerVisible <think>private</think> answer".length,
        error: "ignored abort; provider failed",
      },
      runtimeError: { kind: "set", message: "provider failed" },
      currentAssistantFinalText: "Visible  answer",
      assistantTextObservedAfterLastToolEnd: true,
      scheduleTerminalCompletion: true,
    });
  });

  it("preserves existing visible assistant text while still recording diagnostics", () => {
    expect(runtimeAgentEndEventModel({
      kind: "agent-end",
      finalTexts: ["Replacement should not win."],
      errors: [],
    }, {
      ...baseContext,
      receivedAnyText: true,
      currentAssistantFinalText: "Already streamed.",
      assistantTextObservedAfterLastToolEnd: true,
    })).toEqual({
      terminalDiagnostic: {
        eventType: "agent_end",
        finalTextChars: "Replacement should not win.".length,
      },
      runtimeError: { kind: "preserve" },
      currentAssistantFinalText: "Already streamed.",
      assistantTextObservedAfterLastToolEnd: true,
      scheduleTerminalCompletion: true,
    });
  });

  it("keeps ignored terminal errors out of runtime error while preserving diagnostic evidence", () => {
    expect(runtimeAgentEndEventModel({
      kind: "agent-end",
      finalTexts: [],
      errors: ["Request was aborted."],
    }, {
      ...baseContext,
      shouldIgnoreError: (_error: string) => true,
    })).toEqual({
      terminalDiagnostic: {
        eventType: "agent_end",
        finalTextChars: 0,
        error: "Request was aborted.",
      },
      runtimeError: { kind: "preserve" },
      currentAssistantFinalText: "",
      assistantTextObservedAfterLastToolEnd: false,
      scheduleTerminalCompletion: true,
    });
  });

  it("truncates diagnostic errors to the runtime diagnostic preview limit", () => {
    const longError = "x".repeat(300);
    const modeled = runtimeAgentEndEventModel({
      kind: "agent-end",
      finalTexts: [],
      errors: [longError],
    }, {
      ...baseContext,
    });

    expect(modeled.terminalDiagnostic.error).toHaveLength(240);
    expect(modeled.runtimeError).toEqual({ kind: "set", message: longError });
  });
});
