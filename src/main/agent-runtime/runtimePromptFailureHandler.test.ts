import { describe, expect, it, vi } from "vitest";
import type { ChatMessage, DesktopEvent, ProviderContinuationState, SendMessageInput } from "../../shared/types";
import type { ChatStreamInterruptionDiagnostic } from "../agent-runtime/agentRuntimeSendStreamDiagnostics";
import { handleRuntimePromptFailure, type RuntimePromptFailureHandlerInput } from "./runtimePromptFailureHandler";
import type { RuntimeAssistantMessageController } from "./runtimeAssistantMessageController";
import type { RuntimeToolMessageController } from "./runtimeToolMessageController";

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

function streamDiagnostic(
  text: string,
  input: Partial<ChatStreamInterruptionDiagnostic> = {},
): ChatStreamInterruptionDiagnostic {
  return {
    kind: input.kind ?? "pre_stream_timeout",
    message: text,
    retryScheduled: input.retryScheduled ?? false,
    replaySafe: input.replaySafe ?? false,
    runStartedAt: "2026-06-15T00:00:00.000Z",
    semanticOutputSeen: false,
    toolCallSeen: false,
    assistantOutputChars: 0,
    thinkingOutputChars: 0,
    toolMessageCount: 0,
    currentAssistantFinalTextChars: 0,
    streamEventCount: 0,
    ...input,
  };
}

function setup(overrides: Partial<RuntimePromptFailureHandlerInput> = {}) {
  const events: DesktopEvent[] = [];
  const retryFollowUp = {
    threadId: "thread-1",
    content: "retry",
    permissionMode: "workspace",
    collaborationMode: "agent",
  } as SendMessageInput;
  const continuationState = { stateId: "state-1" } as ProviderContinuationState;
  let pendingEmptyResponseRetry: SendMessageInput | undefined;
  let pendingInterruptedToolCallRecoveryFollowUp: SendMessageInput | undefined;
  let pendingProviderInterruptionContinuation: SendMessageInput | undefined;
  let providerRetryAttemptCount = 0;
  let providerRetryLastError: string | undefined;
  const replacedAssistantMessages: ChatMessage[] = [];
  const finishedRuns: Array<{ status: string; errorMessage?: string }> = [];
  const runtimeMessages = {
    currentAssistantMessageId: vi.fn(() => "assistant-1"),
    assistantStartCount: vi.fn(() => 0),
    currentMessageContent: vi.fn((_, fallback) => fallback),
    currentAssistantContent: vi.fn((fallback) => fallback),
    startAssistantMessage: vi.fn(),
    ensureAssistantMessage: vi.fn(() => "assistant-1"),
    appendAssistantDelta: vi.fn(),
    replaceCurrentAssistant: vi.fn((content: string, metadata?: Record<string, unknown>) => {
      const updated = message({ id: "assistant-1", content, metadata });
      replacedAssistantMessages.push(updated);
      return updated;
    }),
    finishCurrentAssistantMessage: vi.fn(),
    ensureThinkingMessage: vi.fn(() => "thinking-1"),
    appendThinkingDelta: vi.fn(),
    replaceCurrentThinking: vi.fn(),
    finishCurrentThinkingMessage: vi.fn(),
  } satisfies RuntimeAssistantMessageController;
  const toolMessages = {
    size: vi.fn(() => 0),
    toolCallIds: vi.fn(() => [][Symbol.iterator]()),
    inputs: vi.fn(() => new Map()),
    recoveryInputs: vi.fn(() => new Map()),
    labels: vi.fn(() => new Map()),
    messageId: vi.fn(),
    inputContent: vi.fn(),
    recoveryInput: vi.fn(),
    recoveryInputSource: vi.fn(),
    longformInputPreview: vi.fn(),
    editInputPreview: vi.fn(),
    metadataFor: vi.fn(() => ({})),
    rememberRecoveryInput: vi.fn(),
    rememberLongformInputPreview: vi.fn(),
    rememberEditInputPreview: vi.fn(),
    upsertInputMessage: vi.fn(),
    emitRunningToolEvent: vi.fn(),
    applyResultUpdate: vi.fn(),
    markOpenToolMessagesFailed: vi.fn(() => 0),
    cleanupToolCall: vi.fn(),
  } as unknown as RuntimeToolMessageController;
  const input: RuntimePromptFailureHandlerInput = {
    error: new Error("provider exploded"),
    threadId: "thread-1",
    workspacePath: "/workspace",
    usesDedicatedReviewSession: false,
    assistantFinalizationRetryMaxRetries: 3,
    interruptedToolCallRecoveryAttemptsUsed: 0,
    interruptedToolCallRecoveryMaxRetries: 2,
    canScheduleInterruptedToolCallRecovery: false,
    pendingEmptyResponseRetryDelayMs: 0,
    retrySourceUserMessageId: undefined,
    runtimeMessages,
    toolMessages,
    toolArgumentProgress: {
      current: vi.fn(),
    },
    interruptedToolCallRecovery: {
      recoverable: vi.fn(() => []),
    },
    startedToolCallIds: new Set(),
    abortRequested: vi.fn(() => false),
    streamWatchdogTimedOut: vi.fn(() => false),
    currentPiStreamFailureKind: vi.fn(() => "pre_stream_timeout" as const),
    currentAssistantFinalText: vi.fn(() => ""),
    currentThinkingFinalText: vi.fn(() => "thinking"),
    receivedAnyText: vi.fn(() => false),
    subagentParentControlAbortIntent: vi.fn(() => undefined),
    isRunStoreActive: vi.fn(() => true),
    consumeSubagentParentControlAbort: vi.fn(async () => undefined),
    persistPiStreamTrace: vi.fn(),
    canScheduleAssistantFinalizationRetryFor: vi.fn(() => false),
    assistantFinalizationRetryAttemptsUsedFor: vi.fn(() => 0),
    assistantFinalizationRetryNextAttemptFor: vi.fn(() => 1),
    sessionRecoveryForCurrentSession: vi.fn((kind, reason, providerContinuationStateId) => ({
      kind,
      reason,
      ...(providerContinuationStateId ? { providerContinuationStateId } : {}),
    })),
    createAssistantFinalizationRetryInput: vi.fn(() => retryFollowUp),
    createInterruptedToolCallRecoveryInput: vi.fn(() => retryFollowUp),
    collectOpenProviderInterruptionToolSnapshots: vi.fn(() => []),
    createProviderContinuationState: vi.fn(() => continuationState),
    persistProviderContinuationState: vi.fn((state) => state),
    persistCurrentSessionPointerForRetry: vi.fn(async () => undefined),
    createProviderInterruptionContinuationInput: vi.fn(() => retryFollowUp),
    setPendingEmptyResponseRetry: vi.fn((value) => {
      pendingEmptyResponseRetry = value;
    }),
    setPendingInterruptedToolCallRecoveryFollowUp: vi.fn((value) => {
      pendingInterruptedToolCallRecoveryFollowUp = value;
    }),
    setPendingProviderInterruptionContinuation: vi.fn((value) => {
      pendingProviderInterruptionContinuation = value;
    }),
    providerRetryAttemptCount: vi.fn(() => providerRetryAttemptCount),
    setProviderRetryAttemptCount: vi.fn((value) => {
      providerRetryAttemptCount = value;
    }),
    setProviderRetryLastError: vi.fn((value) => {
      providerRetryLastError = value;
    }),
    cleanupCurrentSession: vi.fn(),
    markOpenToolMessagesFailed: vi.fn(),
    persistToolArgumentDiagnostics: vi.fn(),
    replaceToolMessage: vi.fn((messageId, content, metadata) => message({ id: messageId, role: "tool", content, metadata })),
    finishPlannerFinalizationSources: vi.fn(),
    finishParentRun: vi.fn((status, errorMessage) => {
      finishedRuns.push({ status, errorMessage });
    }),
    chatStreamInterruptionDiagnostic: vi.fn(streamDiagnostic),
    chatStreamInterruptionNotice: vi.fn((text) => `interrupted: ${text}`),
    emitRunEvent: vi.fn((event) => {
      events.push(event);
    }),
    ...overrides,
  };
  return {
    input,
    runtimeMessages,
    events,
    retryFollowUp,
    replacedAssistantMessages,
    finishedRuns,
    pending: () => ({
      pendingEmptyResponseRetry,
      pendingInterruptedToolCallRecoveryFollowUp,
      pendingProviderInterruptionContinuation,
      providerRetryAttemptCount,
      providerRetryLastError,
    }),
  };
}

describe("handleRuntimePromptFailure", () => {
  it("schedules a fresh-session retry for pre-output stream stalls", async () => {
    const { input, retryFollowUp, runtimeMessages, events, finishedRuns, pending } = setup({
      error: new Error("Ambient/Pi did not start streaming within 60000 ms"),
      retrySourceUserMessageId: "user-1",
      streamWatchdogTimedOut: vi.fn(() => true),
      canScheduleAssistantFinalizationRetryFor: vi.fn((reason) => reason === "pre_output_stream_stall"),
    });

    await handleRuntimePromptFailure(input);

    expect(pending().pendingEmptyResponseRetry).toBe(retryFollowUp);
    expect(input.cleanupCurrentSession).toHaveBeenCalledWith({ clearPersistedSessionFileIfCurrent: true });
    expect(input.persistPiStreamTrace).toHaveBeenCalledWith("Ambient/Pi did not start streaming within 60000 ms");
    expect(runtimeMessages.finishCurrentThinkingMessage).toHaveBeenCalledWith("done", "thinking");
    expect(runtimeMessages.replaceCurrentAssistant).toHaveBeenCalledWith(
      expect.stringContaining("Retrying assistant finalization attempt 1/3"),
      expect.objectContaining({ status: "done", retryingStreamStall: true }),
    );
    expect(finishedRuns).toEqual([{ status: "done", errorMessage: undefined }]);
    expect(events).toContainEqual({ type: "run-status", threadId: "thread-1", status: "idle" });
  });

  it("finalizes terminal provider failures when no retry path applies", async () => {
    const { input, runtimeMessages, events, finishedRuns, replacedAssistantMessages, pending } = setup({
      error: new Error("provider exploded"),
    });

    await handleRuntimePromptFailure(input);

    expect(pending().pendingEmptyResponseRetry).toBeUndefined();
    expect(input.markOpenToolMessagesFailed).toHaveBeenCalledWith("Ambient/Pi provider failed before this tool completed.");
    expect(input.finishPlannerFinalizationSources).toHaveBeenCalledWith("failed", {
      error: "provider exploded",
      workflowState: "failed",
    });
    expect(finishedRuns).toEqual([{ status: "error", errorMessage: "provider exploded" }]);
    expect(runtimeMessages.replaceCurrentAssistant).toHaveBeenCalledWith(
      expect.stringContaining("provider exploded"),
      expect.objectContaining({ status: "error", runtime: "pi", provider: "ambient" }),
    );
    expect(replacedAssistantMessages.at(-1)?.metadata).toEqual(expect.objectContaining({
      status: "error",
      providerErrorDiagnostic: expect.objectContaining({ message: "provider exploded" }),
    }));
    expect(events).toContainEqual({ type: "run-status", threadId: "thread-1", status: "error" });
    expect(events).toContainEqual({ type: "error", message: "provider exploded", threadId: "thread-1", workspacePath: "/workspace" });
  });
});
