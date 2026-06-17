import { describe, expect, it, vi } from "vitest";

import type { ToolIntentSnapshot } from "../../shared/types";
import { InterruptedToolCallRecoveryTracker } from "../interruptedToolCallRecovery";
import { ToolArgumentProgressTracker } from "../tool-runtime/toolArgumentProgress";
import type { RuntimeAssistantMessageController } from "./runtimeAssistantMessageController";
import type {
  RuntimeProviderContinuationContext,
  RuntimeProviderContinuationContextInput,
} from "./runtimeProviderContinuationContext";
import {
  createRuntimeProviderContinuationSetup,
  type RuntimeProviderContinuationSetupInput,
} from "./runtimeProviderContinuationSetup";
import type { RuntimeStreamActivityTracker } from "./runtimeStreamActivityTracker";
import { createRuntimeStreamTraceState } from "./runtimeStreamTraceState";
import { createRuntimeTextOutputState } from "./runtimeTextOutputState";
import type { RuntimeToolMessageController } from "./runtimeToolMessageController";

const intent: ToolIntentSnapshot = {
  version: 1,
  toolCallId: "tool-call-1",
  toolName: "write",
  operationKind: "write_or_mutate",
  targetSummary: "/workspace/report.md",
  declaredPurpose: "Write the report.",
  materiality: "required_before_final_answer",
  substituteAllowed: false,
  createdAt: "2026-06-15T00:00:00.000Z",
};

function createContext(): RuntimeProviderContinuationContext {
  return {
    collectOpenProviderInterruptionToolSnapshots: vi.fn(() => []),
    createProviderContinuationState: vi.fn(),
    persistProviderContinuationState: vi.fn(),
    createProviderInterruptionContinuationInput: vi.fn(),
  } as unknown as RuntimeProviderContinuationContext;
}

function createInput(
  overrides: Partial<RuntimeProviderContinuationSetupInput> = {},
): RuntimeProviderContinuationSetupInput {
  const context = createContext();
  return {
    baseInput: {
      threadId: "thread-1",
      content: "Please write the report.",
      model: "moonshotai/kimi-k2.7-code",
      thinkingLevel: "minimal",
      permissionMode: "workspace",
      collaborationMode: "agent",
    },
    workspacePath: "/workspace",
    runId: "run-1",
    threadId: "thread-1",
    runtimeModel: "moonshotai/kimi-k2.7-code",
    piPreStreamTimeoutMs: 10_000,
    piStreamIdleTimeoutMs: 30_000,
    assistantFinalizationRetryMaxRetries: 5,
    toolMessages: {} as RuntimeToolMessageController,
    toolArgumentProgress: new ToolArgumentProgressTracker(),
    interruptedToolCallRecovery: new InterruptedToolCallRecoveryTracker({
      workspacePath: "/workspace",
      runId: "run-1",
      thresholdChars: 1_000,
    }),
    startedToolCallIds: new Set(["tool-call-1"]),
    toolIntents: new Map([["tool-call-1", intent]]),
    runtimeMessages: {
      currentAssistantMessageId: vi.fn(() => "assistant-1"),
    } as unknown as RuntimeAssistantMessageController,
    outputState: createRuntimeTextOutputState(),
    streamActivity: {
      snapshot: vi.fn(() => ({
        eventCount: 4,
        approximatePayloadBytes: 2048,
        firstEventAt: "2026-06-15T00:00:01.000Z",
        firstEventType: "message_start",
        lastEventAt: "2026-06-15T00:00:02.000Z",
        lastEventType: "toolcall_end",
        lastActivityAtMs: Date.parse("2026-06-15T00:00:02.000Z"),
      })),
      markActivity: vi.fn(),
    } as RuntimeStreamActivityTracker,
    streamTraceState: createRuntimeStreamTraceState(),
    getPermissionMode: vi.fn(() => "workspace" as const),
    getModel: vi.fn(() => "moonshotai/kimi-k2.7-code"),
    getRetrySourceUserMessageId: vi.fn(() => "user-1"),
    getSessionFile: vi.fn(() => "sessions/thread-1.jsonl"),
    chatStreamSemanticOutputSeen: vi.fn(() => true),
    currentPiStreamIdleSource: vi.fn(() => "stream_idle"),
    assistantFinalizationRetryNextAttemptFor: vi.fn(() => 4),
    sessionRecoveryForCurrentSession: vi.fn((kind, reason, providerContinuationStateId) => ({
      kind,
      reason,
      providerContinuationStateId,
    })),
    updateRunDiagnostics: vi.fn(),
    createProviderContinuationContext: vi.fn(() => context),
    ...overrides,
  };
}

describe("createRuntimeProviderContinuationSetup", () => {
  it("creates a provider continuation context with explicit runtime owners", () => {
    const input = createInput();

    const context = createRuntimeProviderContinuationSetup(input);

    expect(context).toBe(vi.mocked(input.createProviderContinuationContext!).mock.results[0].value);
    expect(input.createProviderContinuationContext).toHaveBeenCalledWith(
      expect.objectContaining({
        baseInput: input.baseInput,
        workspacePath: "/workspace",
        runId: "run-1",
        threadId: "thread-1",
        runtimeModel: "moonshotai/kimi-k2.7-code",
        piPreStreamTimeoutMs: 10_000,
        piStreamIdleTimeoutMs: 30_000,
        assistantFinalizationRetryMaxRetries: 5,
        toolMessages: input.toolMessages,
        toolArgumentProgress: input.toolArgumentProgress,
        interruptedToolCallRecovery: input.interruptedToolCallRecovery,
        startedToolCallIds: input.startedToolCallIds,
        toolIntents: input.toolIntents,
        getPermissionMode: input.getPermissionMode,
        getModel: input.getModel,
        getRetrySourceUserMessageId: input.getRetrySourceUserMessageId,
        getSessionFile: input.getSessionFile,
        chatStreamSemanticOutputSeen: input.chatStreamSemanticOutputSeen,
        currentPiStreamIdleSource: input.currentPiStreamIdleSource,
        assistantFinalizationRetryNextAttemptFor: input.assistantFinalizationRetryNextAttemptFor,
        sessionRecoveryForCurrentSession: input.sessionRecoveryForCurrentSession,
        updateRunDiagnostics: input.updateRunDiagnostics,
      }),
    );
  });

  it("maps live runtime state getters to provider continuation input", () => {
    const input = createInput();
    input.outputState.setAssistantOutputChars(25);
    input.outputState.setThinkingOutputChars(5);
    input.outputState.setCurrentAssistantFinalText("I will write the report.");
    input.outputState.setReceivedAnyText(true);
    input.outputState.markFirstAssistantVisibleText(() => "2026-06-15T00:00:01.500Z");
    input.streamTraceState.markFirstToolArgumentObserved("2026-06-15T00:00:01.750Z");
    input.streamTraceState.markFirstToolExecutionObserved("2026-06-15T00:00:01.900Z");
    input.streamTraceState.setTraceReference({
      path: "/workspace/.ambient/trace.jsonl",
      eventCount: 4,
      recentEventCount: 4,
      reason: "stream interrupted",
      recordedAt: "2026-06-15T00:00:02.000Z",
    });

    createRuntimeProviderContinuationSetup(input);

    const providerInput = vi.mocked(input.createProviderContinuationContext!).mock
      .calls[0][0] as RuntimeProviderContinuationContextInput;
    expect(providerInput.getCurrentAssistantMessageId()).toBe("assistant-1");
    expect(providerInput.getPiStreamActivity()).toMatchObject({ eventCount: 4 });
    expect(providerInput.getPiStreamTraceReference()).toMatchObject({ recentEventCount: 4 });
    expect(providerInput.getFirstAssistantVisibleTextAt()).toBe("2026-06-15T00:00:01.500Z");
    expect(providerInput.getFirstToolArgumentAt()).toBe("2026-06-15T00:00:01.750Z");
    expect(providerInput.getFirstToolExecutionStartedAt()).toBe("2026-06-15T00:00:01.900Z");
    expect(providerInput.getAssistantOutputChars()).toBe(25);
    expect(providerInput.getThinkingOutputChars()).toBe(5);
    expect(providerInput.getCurrentAssistantFinalText()).toBe("I will write the report.");
    expect(providerInput.getReceivedAnyText()).toBe(true);
  });
});
