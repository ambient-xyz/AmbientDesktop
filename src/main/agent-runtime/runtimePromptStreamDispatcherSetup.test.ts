import { describe, expect, it, vi } from "vitest";

import {
  createRuntimePromptStreamDispatcherSetup,
  type RuntimePromptStreamDispatcherSetupInput,
} from "./runtimePromptStreamDispatcherSetup";
import type { RuntimeStreamEventDispatcherInput } from "./runtimeStreamEventDispatcher";
import { createRuntimeTextOutputState } from "./runtimeTextOutputState";
import { createRuntimePromptRunState } from "./runtimePromptRunState";
import { createRuntimeProviderRetryState } from "./runtimeProviderRetryState";

function createInput(
  overrides: Partial<RuntimePromptStreamDispatcherSetupInput> = {},
): RuntimePromptStreamDispatcherSetupInput {
  const dispatcher = {
    handle: vi.fn(() => false),
  };
  return {
    threadId: "thread-1",
    assistantTerminalGraceMs: 250,
    outputState: createRuntimeTextOutputState(),
    promptRunState: createRuntimePromptRunState(),
    providerRetryState: createRuntimeProviderRetryState(),
    runtimeMessages: {} as RuntimeStreamEventDispatcherInput["runtimeMessages"],
    emptyAssistantStallWatchdog: {
      clear: vi.fn(),
      schedule: vi.fn(),
    },
    assistantTerminalCompletion: {
      schedule: vi.fn(),
    },
    postToolContinuation: {
      markAgentEnd: vi.fn(),
    },
    toolMessages: {
      size: vi.fn(() => 0),
    },
    markPiStreamActivity: vi.fn(),
    setActiveRunStatus: vi.fn(),
    reconcileQueueUpdate: vi.fn(),
    recordContextUsageSnapshot: vi.fn(),
    emitRunEvent: vi.fn(),
    createStreamEventDispatcher: vi.fn(() => dispatcher),
    ...overrides,
  };
}

describe("createRuntimePromptStreamDispatcherSetup", () => {
  it("creates a runtime stream dispatcher with explicit owner dependencies", () => {
    const input = createInput();

    const dispatcher = createRuntimePromptStreamDispatcherSetup(input);

    expect(dispatcher).toBe(vi.mocked(input.createStreamEventDispatcher!).mock.results[0].value);
    expect(input.createStreamEventDispatcher).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-1",
        assistantTerminalGraceMs: 250,
        runtimeMessages: input.runtimeMessages,
        emptyAssistantStallWatchdog: input.emptyAssistantStallWatchdog,
        assistantTerminalCompletion: input.assistantTerminalCompletion,
        postToolContinuation: input.postToolContinuation,
        toolMessages: input.toolMessages,
        pushAssistantVisibleDelta: input.outputState.pushAssistantVisibleDelta,
        flushAssistantVisibleText: input.outputState.flushAssistantVisibleText,
        markFirstAssistantVisibleText: input.outputState.markFirstAssistantVisibleText,
        markPiStreamActivity: input.markPiStreamActivity,
        setActiveRunStatus: input.setActiveRunStatus,
        reconcileQueueUpdate: input.reconcileQueueUpdate,
        recordContextUsageSnapshot: input.recordContextUsageSnapshot,
        emitRunEvent: input.emitRunEvent,
      }),
    );
  });

  it("wires stream dispatcher state accessors to output, prompt-run, and provider-retry owners", () => {
    const input = createInput();

    createRuntimePromptStreamDispatcherSetup(input);

    const state = vi.mocked(input.createStreamEventDispatcher!).mock.calls[0][0].state;
    state.setReceivedAnyText(true);
    state.setCurrentAssistantReceivedText(true);
    state.setCurrentAssistantFinalText("assistant text");
    state.setAssistantOutputChars(14);
    state.setCurrentThinkingReceivedText(true);
    state.setCurrentThinkingFinalText("thinking");
    state.setThinkingOutputChars(8);
    state.setAssistantTextObservedAfterLastToolEnd(true);
    state.setRuntimeError("runtime failed");
    state.setProviderRetryAttemptCount(2);
    state.setProviderRetryLastError("temporary provider failure");
    state.setProviderRetryBeforeVisibleOutput(true);
    state.setProviderRetryRecovered(true);

    expect(input.outputState.receivedAnyText()).toBe(true);
    expect(input.outputState.currentAssistantReceivedText()).toBe(true);
    expect(input.outputState.currentAssistantFinalText()).toBe("assistant text");
    expect(input.outputState.assistantOutputChars()).toBe(14);
    expect(input.outputState.currentThinkingReceivedText()).toBe(true);
    expect(input.outputState.currentThinkingFinalText()).toBe("thinking");
    expect(input.outputState.thinkingOutputChars()).toBe(8);
    expect(input.promptRunState.assistantTextObservedAfterLastToolEnd()).toBe(true);
    expect(input.promptRunState.runtimeError()).toBe("runtime failed");
    expect(input.providerRetryState.snapshot()).toEqual({
      providerRetryAttemptCount: 2,
      providerRetryLastError: "temporary provider failure",
      providerRetryBeforeVisibleOutput: true,
      providerRetryRecovered: true,
    });
  });

  it("checks assistant terminal cleanup aborts against current output state", () => {
    const input = createInput();
    createRuntimePromptStreamDispatcherSetup(input);

    const dispatcherInput = vi.mocked(input.createStreamEventDispatcher!).mock.calls[0][0];
    expect(dispatcherInput.shouldIgnoreAssistantTerminalCleanupError("request was aborted")).toBe(false);

    input.outputState.setReceivedAnyText(true);
    input.promptRunState.markAssistantTerminalCleanupInProgress();

    expect(dispatcherInput.shouldIgnoreAssistantTerminalCleanupError("request was aborted")).toBe(true);
  });
});
