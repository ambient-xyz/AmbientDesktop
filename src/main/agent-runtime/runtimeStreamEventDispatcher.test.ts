import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import { createRuntimeStreamEventDispatcher, type RuntimeStreamEventStateAccessors } from "./runtimeStreamEventDispatcher";
import type { RuntimeAssistantMessageController } from "./runtimeAssistantMessageController";

function message(input: Partial<ChatMessage> & { id: string; content?: string }): ChatMessage {
  return {
    ...input,
    id: input.id,
    threadId: input.threadId ?? "thread-1",
    role: input.role ?? "assistant",
    content: input.content ?? "",
    createdAt: input.createdAt ?? "2026-06-15T00:00:00.000Z",
    metadata: input.metadata,
  };
}

function setup() {
  const stateValues = {
    receivedAnyText: false,
    currentAssistantReceivedText: false,
    currentAssistantFinalText: "",
    assistantOutputChars: 0,
    assistantTextObservedAfterLastToolEnd: false,
    lastAssistantTerminalEvent: undefined as ReturnType<RuntimeStreamEventStateAccessors["lastAssistantTerminalEvent"]>,
    currentThinkingReceivedText: false,
    currentThinkingFinalText: "",
    thinkingOutputChars: 0,
    runtimeError: undefined as string | undefined,
    providerRetryAttemptCount: 0,
    providerRetryLastError: undefined as string | undefined,
    providerRetryBeforeVisibleOutput: false,
    providerRetryRecovered: false,
    hasLastCompletedTool: false,
  };
  const state: RuntimeStreamEventStateAccessors = {
    receivedAnyText: () => stateValues.receivedAnyText,
    setReceivedAnyText: (value) => {
      stateValues.receivedAnyText = value;
    },
    currentAssistantReceivedText: () => stateValues.currentAssistantReceivedText,
    setCurrentAssistantReceivedText: (value) => {
      stateValues.currentAssistantReceivedText = value;
    },
    currentAssistantFinalText: () => stateValues.currentAssistantFinalText,
    setCurrentAssistantFinalText: (value) => {
      stateValues.currentAssistantFinalText = value;
    },
    assistantOutputChars: () => stateValues.assistantOutputChars,
    setAssistantOutputChars: (value) => {
      stateValues.assistantOutputChars = value;
    },
    assistantTextObservedAfterLastToolEnd: () => stateValues.assistantTextObservedAfterLastToolEnd,
    setAssistantTextObservedAfterLastToolEnd: (value) => {
      stateValues.assistantTextObservedAfterLastToolEnd = value;
    },
    hasLastCompletedTool: () => stateValues.hasLastCompletedTool,
    lastAssistantTerminalEvent: () => stateValues.lastAssistantTerminalEvent,
    setLastAssistantTerminalEvent: (value) => {
      stateValues.lastAssistantTerminalEvent = value;
    },
    currentThinkingReceivedText: () => stateValues.currentThinkingReceivedText,
    setCurrentThinkingReceivedText: (value) => {
      stateValues.currentThinkingReceivedText = value;
    },
    currentThinkingFinalText: () => stateValues.currentThinkingFinalText,
    setCurrentThinkingFinalText: (value) => {
      stateValues.currentThinkingFinalText = value;
    },
    thinkingOutputChars: () => stateValues.thinkingOutputChars,
    setThinkingOutputChars: (value) => {
      stateValues.thinkingOutputChars = value;
    },
    setRuntimeError: (value) => {
      stateValues.runtimeError = value;
    },
    providerRetryAttemptCount: () => stateValues.providerRetryAttemptCount,
    setProviderRetryAttemptCount: (value) => {
      stateValues.providerRetryAttemptCount = value;
    },
    providerRetryLastError: () => stateValues.providerRetryLastError,
    setProviderRetryLastError: (value) => {
      stateValues.providerRetryLastError = value;
    },
    providerRetryBeforeVisibleOutput: () => stateValues.providerRetryBeforeVisibleOutput,
    setProviderRetryBeforeVisibleOutput: (value) => {
      stateValues.providerRetryBeforeVisibleOutput = value;
    },
    providerRetryRecovered: () => stateValues.providerRetryRecovered,
    setProviderRetryRecovered: (value) => {
      stateValues.providerRetryRecovered = value;
    },
  };
  const runtimeMessages: RuntimeAssistantMessageController = {
    currentAssistantMessageId: vi.fn(() => "assistant-1"),
    assistantStartCount: vi.fn(() => 0),
    currentMessageContent: vi.fn((_, fallback) => fallback),
    currentAssistantContent: vi.fn((fallback) => fallback),
    startAssistantMessage: vi.fn(),
    ensureAssistantMessage: vi.fn(() => "assistant-1"),
    appendAssistantDelta: vi.fn((delta) => message({ id: "assistant-1", content: delta })),
    replaceCurrentAssistant: vi.fn((content, metadata) => message({ id: "assistant-1", content, metadata })),
    finishCurrentAssistantMessage: vi.fn(),
    suppressAssistantMessagesExceptCurrent: vi.fn(),
    ensureThinkingMessage: vi.fn(() => "thinking-1"),
    appendThinkingDelta: vi.fn((delta) => message({ id: "thinking-1", content: delta })),
    replaceCurrentThinking: vi.fn((content, metadata) => message({ id: "thinking-1", content, metadata })),
    finishCurrentThinkingMessage: vi.fn(),
    suppressCurrentThinkingMessage: vi.fn(),
  };
  const emittedEvents: DesktopEvent[] = [];
  const activeRunStatuses: string[] = [];
  const emptyAssistantStallWatchdog = {
    clear: vi.fn(),
    schedule: vi.fn(),
  };
  const assistantTerminalCompletion = {
    schedule: vi.fn(),
  };
  const dispatcher = createRuntimeStreamEventDispatcher({
    threadId: "thread-1",
    assistantTerminalGraceMs: 25,
    state,
    runtimeMessages,
    emptyAssistantStallWatchdog,
    assistantTerminalCompletion,
    postToolContinuation: {
      markAgentEnd: vi.fn(),
    },
    toolMessages: {
      size: vi.fn(() => 0),
    },
    shouldIgnoreAssistantTerminalCleanupError: vi.fn(() => false),
    pushAssistantVisibleDelta: vi.fn((delta) => delta.replace("<think>hidden</think>", "")),
    flushAssistantVisibleText: vi.fn(() => undefined),
    markFirstAssistantVisibleText: vi.fn(),
    markPiStreamActivity: vi.fn(),
    setActiveRunStatus: vi.fn((status) => {
      activeRunStatuses.push(status);
    }),
    reconcileQueueUpdate: vi.fn(),
    recordContextUsageSnapshot: vi.fn(),
    emitRunEvent: vi.fn((event) => {
      emittedEvents.push(event);
    }),
  });
  return {
    dispatcher,
    stateValues,
    runtimeMessages,
    emptyAssistantStallWatchdog,
    assistantTerminalCompletion,
    activeRunStatuses,
    emittedEvents,
  };
}

describe("createRuntimeStreamEventDispatcher", () => {
  it("applies assistant updates through the visible-text filter and appends visible deltas", () => {
    const { dispatcher, stateValues, runtimeMessages, activeRunStatuses } = setup();

    expect(dispatcher.handle({
      kind: "assistant-update",
      delta: "hello",
    }, {})).toBe(true);

    expect(stateValues.receivedAnyText).toBe(true);
    expect(stateValues.currentAssistantReceivedText).toBe(true);
    expect(stateValues.currentAssistantFinalText).toBe("hello");
    expect(stateValues.assistantOutputChars).toBe(5);
    expect(runtimeMessages.appendAssistantDelta).toHaveBeenCalledWith("hello");
    expect(activeRunStatuses).toEqual(["streaming"]);
  });

  it("applies thinking events and finishes visible thinking messages", () => {
    const { dispatcher, stateValues, runtimeMessages, activeRunStatuses } = setup();

    expect(dispatcher.handle({ kind: "thinking-start" }, {})).toBe(true);
    expect(dispatcher.handle({
      kind: "thinking-update",
      delta: "step one",
    }, {})).toBe(true);
    expect(dispatcher.handle({ kind: "thinking-end" }, {})).toBe(true);

    expect(stateValues.currentThinkingReceivedText).toBe(true);
    expect(stateValues.currentThinkingFinalText).toBe("step one");
    expect(stateValues.thinkingOutputChars).toBe(8);
    expect(runtimeMessages.ensureThinkingMessage).toHaveBeenCalled();
    expect(runtimeMessages.appendThinkingDelta).toHaveBeenCalledWith("step one");
    expect(runtimeMessages.finishCurrentThinkingMessage).toHaveBeenCalledWith("done", "step one");
    expect(activeRunStatuses).toContain("streaming");
  });

  it("applies provider retry starts and successful finishes as runtime activity", () => {
    const { dispatcher, stateValues, activeRunStatuses, emittedEvents } = setup();
    stateValues.runtimeError = "old failure";

    expect(dispatcher.handle({
      kind: "auto-retry-start",
      attempt: 1,
      maxAttempts: 3,
      delayMs: 250,
      error: "rate limited",
    }, {})).toBe(true);
    expect(dispatcher.handle({
      kind: "auto-retry-end",
      attempt: 1,
      success: true,
    }, {})).toBe(true);

    expect(stateValues.runtimeError).toBeUndefined();
    expect(stateValues.providerRetryAttemptCount).toBe(1);
    expect(stateValues.providerRetryLastError).toBe("rate limited");
    expect(stateValues.providerRetryBeforeVisibleOutput).toBe(true);
    expect(stateValues.providerRetryRecovered).toBe(true);
    expect(activeRunStatuses).toEqual(["retrying", "streaming"]);
    expect(emittedEvents).toEqual([
      expect.objectContaining({ type: "runtime-activity" }),
      expect.objectContaining({ type: "runtime-activity" }),
    ]);
  });

  it("applies assistant terminal final text, records diagnostics, and schedules completion", () => {
    const { dispatcher, stateValues, runtimeMessages, assistantTerminalCompletion, emittedEvents } = setup();

    expect(dispatcher.handle({
      kind: "assistant-end",
      finalText: "Visible <think>hidden</think> answer",
      error: "provider failed",
    }, { type: "message_stop" })).toBe(true);

    expect(stateValues.runtimeError).toBe("provider failed");
    expect(stateValues.receivedAnyText).toBe(true);
    expect(stateValues.currentAssistantFinalText).toBe("Visible  answer");
    expect(stateValues.lastAssistantTerminalEvent).toEqual(expect.objectContaining({
      eventType: "message_stop",
      finalTextChars: "Visible <think>hidden</think> answer".length,
      error: "provider failed",
    }));
    expect(runtimeMessages.replaceCurrentAssistant).toHaveBeenCalledWith(
      "Visible  answer",
      expect.objectContaining({ status: "error", runtime: "pi", provider: "ambient" }),
    );
    expect(assistantTerminalCompletion.schedule).toHaveBeenCalledWith(25);
    expect(emittedEvents).toContainEqual(expect.objectContaining({ type: "message-updated" }));
  });
});
