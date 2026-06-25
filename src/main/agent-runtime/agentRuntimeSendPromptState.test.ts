import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import { createAgentRuntimeSendPromptState, type AgentRuntimeSendPromptStateInput } from "./agentRuntimeSendPromptState";
import type { RuntimeAssistantTerminalCompletion } from "./runtimeAssistantTerminalCompletion";
import type { RuntimeEmptyAssistantStallWatchdog } from "./runtimeEmptyAssistantStallWatchdog";
import type { RuntimeQueuedMessageSession } from "./runtimeQueuedMessageController";
import type { RuntimeStreamWatchdogController } from "./runtimeStreamWatchdogController";

function sendInput(overrides: Partial<SendMessageInput> = {}): SendMessageInput {
  return {
    threadId: "thread-1",
    content: "Prompt",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "moonshotai/kimi-k2.7-code",
    thinkingLevel: "medium",
    delivery: "prompt",
    ...overrides,
  };
}

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "assistant-1",
    threadId: "thread-1",
    role: "assistant",
    content: "",
    createdAt: "2026-06-22T00:00:00.000Z",
    metadata: { status: "streaming" },
    ...overrides,
  };
}

function baseStateInput(overrides: Partial<AgentRuntimeSendPromptStateInput<RuntimeQueuedMessageSession>> = {}) {
  const emitted: DesktopEvent[] = [];
  const messages = [assistantMessage()];
  const session: RuntimeQueuedMessageSession = {
    steer: vi.fn(async () => undefined),
    followUp: vi.fn(async () => undefined),
  };

  const input: AgentRuntimeSendPromptStateInput<RuntimeQueuedMessageSession> = {
    threadId: "thread-1",
    runId: "run-1",
    workspacePath: "/workspace",
    assistantMessage: messages[0],
    baseInput: sendInput(),
    usesDedicatedReviewSession: false,
    activeAssistantFinalizationRetry: undefined,
    assistantFinalizationRetryMaxRetries: 3,
    retrySourceUserMessageId: "user-1",
    interruptedToolCallRecoveryAttemptsUsed: 0,
    interruptedToolCallRecoveryMaxRetries: 3,
    piPreStreamTimeoutMs: 5_000,
    piStreamIdleTimeoutMs: 30_000,
    runStartedAt: "2026-06-22T00:00:00.000Z",
    runtimeModel: "moonshotai/kimi-k2.7-code",
    getPermissionMode: () => "workspace",
    getCurrentSessionFile: () => "/tmp/pi-session.jsonl",
    getCurrentThreadPiSessionFile: () => null,
    getCurrentThreadModel: () => "moonshotai/kimi-k2.7-code",
    commitThreadPiSessionFile: vi.fn(async () => undefined),
    getSession: () => session,
    getPromptContentLength: () => "Prompt".length,
    getWorkspaceStatePath: () => "/workspace/.ambient",
    isRunStoreActive: () => true,
    markRunActivity: () => true,
    updateRunStatus: vi.fn(),
    listMessages: () => messages,
    getMessage: (messageId) => messages.find((message) => message.id === messageId),
    addAssistantMessage: (messageInput) => {
      const message = assistantMessage({
        id: `assistant-${messages.length + 1}`,
        threadId: messageInput.threadId,
        content: messageInput.content,
        metadata: messageInput.metadata,
      });
      messages.push(message);
      return message;
    },
    appendToMessage: (messageId, delta) => {
      const message = messages.find((item) => item.id === messageId);
      if (!message) throw new Error(`Missing message ${messageId}`);
      message.content += delta;
      return message;
    },
    replaceMessage: (messageId, content, metadata) => {
      const message = messages.find((item) => item.id === messageId);
      if (!message) throw new Error(`Missing message ${messageId}`);
      message.content = content;
      message.metadata = metadata;
      return message;
    },
    updateRunDiagnostics: vi.fn(),
    emitRunEvent: (event) => {
      emitted.push(event);
    },
    toolMessageCount: vi.fn(() => 2),
    progressThrottleMs: 0,
    progressCharDelta: 0,
    recentEventLimit: 10,
    emptyResponseRetryDelayMs: 0,
    ...overrides,
  };

  return { emitted, input, messages, session };
}

describe("createAgentRuntimeSendPromptState", () => {
  it("owns stream-bound watchdog references used by stream activity", () => {
    const { emitted, input } = baseStateInput();
    const state = createAgentRuntimeSendPromptState(input);
    const streamWatchdog = { reset: vi.fn() } as unknown as RuntimeStreamWatchdogController;
    const emptyAssistantStallWatchdog = {
      refreshOnStreamActivity: vi.fn(),
    } as unknown as RuntimeEmptyAssistantStallWatchdog;
    const assistantTerminalCompletion = {
      resetOnActivity: vi.fn(),
    } as unknown as RuntimeAssistantTerminalCompletion;

    state.setStreamWatchdog(streamWatchdog);
    state.setEmptyAssistantStallWatchdog(emptyAssistantStallWatchdog);
    state.setAssistantTerminalCompletion(assistantTerminalCompletion);
    state.outputState.setAssistantOutputChars(12);
    state.outputState.setThinkingOutputChars(4);

    state.piStreamActivity.markActivity(true, { type: "message_update" });

    expect(state.getStreamWatchdog()).toBe(streamWatchdog);
    expect(streamWatchdog.reset).toHaveBeenCalledTimes(1);
    expect(emptyAssistantStallWatchdog.refreshOnStreamActivity).toHaveBeenCalledTimes(1);
    expect(assistantTerminalCompletion.resetOnActivity).toHaveBeenCalledTimes(1);
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "runtime-activity",
        activity: expect.objectContaining({
          kind: "stream",
          outputChars: 12,
          thinkingChars: 4,
        }),
      }),
    );
  });

  it("defers diagnostics state reads until diagnostics are queried", () => {
    const toolMessageCount = vi.fn(() => 2);
    const { input } = baseStateInput({ toolMessageCount });
    const state = createAgentRuntimeSendPromptState(input);

    expect(toolMessageCount).not.toHaveBeenCalled();

    state.recordPiStreamTraceEvent({ type: "message_delta", value: "hello" }, { kind: "assistant_delta" });

    expect(toolMessageCount).toHaveBeenCalledTimes(1);
  });

  it("uses the current thread model to decide whether retry recovery can reuse the session", () => {
    const { input } = baseStateInput({
      getCurrentSessionFile: () => "/tmp/current-session.jsonl",
      getCurrentThreadModel: () => "zai-org/GLM-5.1-FP8",
      runtimeModel: "moonshotai/kimi-k2.7-code",
    });
    const state = createAgentRuntimeSendPromptState(input);

    expect(
      state.assistantRetryPlanning.sessionRecoveryForCurrentSession(
        "provider_interruption_continuation",
        "Continue after provider interruption.",
        "state-1",
      ),
    ).toEqual({
      kind: "provider_interruption_continuation",
      reason: "Continue after provider interruption.",
      providerContinuationStateId: "state-1",
    });
  });

  it("exposes the active-run settled promise and resolver", async () => {
    const { input } = baseStateInput();
    const state = createAgentRuntimeSendPromptState(input);

    state.resolveActiveRunSettled();

    await expect(state.activeRunSettled).resolves.toBeUndefined();
  });
});
