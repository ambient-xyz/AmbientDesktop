import { describe, expect, it } from "vitest";

import type { AssistantTerminalCleanupDiagnostic } from "../agentRuntimeAssistantTerminalDiagnostics";
import type { CompletedToolSnapshot } from "../postToolContinuationScheduler";
import { createRuntimePromptRunState } from "./runtimePromptRunState";

describe("createRuntimePromptRunState", () => {
  it("starts with no prompt-run evidence", () => {
    const state = createRuntimePromptRunState();

    expect(state.snapshot()).toEqual({
      runtimeError: undefined,
      finalizedAfterToolIdle: false,
      lastCompletedTool: undefined,
      assistantTextObservedAfterLastToolEnd: false,
      lastAssistantTerminalEvent: undefined,
      assistantTerminalCleanupDiagnostic: undefined,
      assistantTerminalCleanupInProgress: false,
    });
  });

  it("tracks runtime errors, prompt idle finalization, and completed tool snapshots", () => {
    const state = createRuntimePromptRunState();
    const completedTool: CompletedToolSnapshot = {
      label: "shell",
      status: "done",
      runId: "run-1",
      toolCallId: "tool-1",
      messageId: "message-1",
      eventSeqAtEnd: 42,
    };

    state.setRuntimeError("provider failed");
    state.setFinalizedAfterToolIdle(true);
    state.setLastCompletedTool(completedTool);

    expect(state.runtimeError()).toBe("provider failed");
    expect(state.finalizedAfterToolIdle()).toBe(true);
    expect(state.lastCompletedTool()).toBe(completedTool);
    expect(state.hasLastCompletedTool()).toBe(true);
    expect(state.snapshot()).toMatchObject({
      runtimeError: "provider failed",
      finalizedAfterToolIdle: true,
      lastCompletedTool: completedTool,
    });
  });

  it("tracks assistant text observed after the last tool and can reset it", () => {
    const state = createRuntimePromptRunState();

    state.setAssistantTextObservedAfterLastToolEnd(true);
    expect(state.assistantTextObservedAfterLastToolEnd()).toBe(true);

    state.markAssistantTextNotObservedAfterLastToolEnd();
    expect(state.assistantTextObservedAfterLastToolEnd()).toBe(false);
  });

  it("tracks assistant terminal event and cleanup diagnostics", () => {
    const state = createRuntimePromptRunState();
    const terminalEvent = {
      eventType: "message_stop",
      stopReason: "end_turn",
      finalTextChars: 12,
    };
    const cleanupDiagnostic: AssistantTerminalCleanupDiagnostic = {
      reason: "assistant-terminal-before-prompt-resolved",
      cleanupAction: "abort-and-dispose-session",
      promptPendingMs: 100,
      assistantTerminalGraceMs: 250,
      outputChars: 12,
      thinkingChars: 0,
      receivedAnyText: true,
      currentAssistantReceivedText: true,
      currentAssistantFinalTextChars: 12,
      lastAssistantTerminalEvent: terminalEvent,
    };

    state.setLastAssistantTerminalEvent(terminalEvent);
    state.setAssistantTerminalCleanupDiagnostic(cleanupDiagnostic);

    expect(state.lastAssistantTerminalEvent()).toBe(terminalEvent);
    expect(state.assistantTerminalCleanupDiagnostic()).toBe(cleanupDiagnostic);
    expect(state.snapshot()).toMatchObject({
      lastAssistantTerminalEvent: terminalEvent,
      assistantTerminalCleanupDiagnostic: cleanupDiagnostic,
    });
  });

  it("ignores cleanup abort errors only after cleanup starts and text was received", () => {
    const state = createRuntimePromptRunState();

    expect(state.shouldIgnoreAssistantTerminalCleanupError("request was aborted", true)).toBe(false);

    state.markAssistantTerminalCleanupInProgress();

    expect(state.assistantTerminalCleanupInProgress()).toBe(true);
    expect(state.shouldIgnoreAssistantTerminalCleanupError("request was aborted", false)).toBe(false);
    expect(state.shouldIgnoreAssistantTerminalCleanupError("unrelated provider failure", true)).toBe(false);
    expect(state.shouldIgnoreAssistantTerminalCleanupError("Ambient request aborted by cleanup", true)).toBe(true);
  });
});
