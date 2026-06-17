import { describe, expect, it, vi } from "vitest";

import type { SendMessageInput, ToolIntentSnapshot } from "../../shared/types";
import { InterruptedToolCallRecoveryTracker } from "../interruptedToolCallRecovery";
import { ToolArgumentProgressTracker } from "../tool-runtime/toolArgumentProgress";
import type { RuntimeToolMessageController } from "./runtimeToolMessageController";
import { createRuntimeProviderContinuationContext } from "./runtimeProviderContinuationContext";

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

describe("createRuntimeProviderContinuationContext", () => {
  it("collects open provider-interruption tool snapshots", () => {
    const { context, persistedArguments } = setup();

    const snapshots = context.collectOpenProviderInterruptionToolSnapshots();

    expect(persistedArguments).toEqual([{
      workspacePath: "/workspace",
      runId: "run-1",
      toolCallId: "tool-call-1",
      inputText: "{\"path\":\"/workspace/report.md\",\"content\":\"hello\"}",
    }]);
    expect(snapshots).toEqual([expect.objectContaining({
      toolCallId: "tool-call-1",
      toolName: "write",
      phase: "arguments_prepared_not_executed",
      certainty: "prepared_only",
      executionStarted: false,
      argumentComplete: true,
      inputPreview: "{\"path\":\"/workspace/report.md\"}",
      workspaceRelativeRecoveryArgumentPath: ".ambient/recovery/tool-call-1.txt",
      intent,
    })]);
  });

  it("creates and persists provider continuation state from runtime snapshots", () => {
    const { context, diagnostics } = setup();
    const openToolCalls = context.collectOpenProviderInterruptionToolSnapshots();

    const state = context.createProviderContinuationState({
      message: "stream interrupted",
      kind: "stream_idle_timeout",
      retryScheduled: true,
      replaySafe: false,
      continuationSafe: true,
      retryAttempt: 2,
      maxRetries: 3,
      openToolCalls,
      completedToolMessageCount: 1,
      receivedAnyText: true,
      stateId: "state-1",
    });
    const persisted = context.persistProviderContinuationState(state);

    expect(persisted).toBe(state);
    expect(diagnostics).toEqual([{ providerContinuationState: state }]);
    expect(state).toMatchObject({
      stateId: "state-1",
      createdAt: "2026-06-15T00:01:00.000Z",
      runId: "run-1",
      threadId: "thread-1",
      assistantMessageId: "assistant-1",
      model: "moonshotai/kimi-k2.7-code",
      sessionFile: "sessions/thread-1.jsonl",
      failure: { kind: "stream_idle_timeout", message: "stream interrupted" },
      retry: { scheduled: true, replaySafe: false, continuationSafe: true, attempt: 2, maxRetries: 3 },
      stream: {
        eventCount: 4,
        approximatePayloadBytes: 2048,
        preStreamTimeoutMs: 10_000,
        streamIdleTimeoutMs: 30_000,
        firstEventAt: "2026-06-15T00:00:01.000Z",
        firstEventType: "message_start",
        lastEventAt: "2026-06-15T00:00:02.000Z",
        lastEventType: "toolcall_end",
        idleSource: "stream_idle",
        firstVisibleTextAt: "2026-06-15T00:00:01.500Z",
        firstToolArgumentAt: "2026-06-15T00:00:01.750Z",
        assistantOutputChars: 25,
        thinkingOutputChars: 5,
        currentAssistantFinalTextChars: 24,
        semanticOutputSeen: true,
        receivedAnyText: true,
      },
    });
    expect(state.tools.open.map((tool) => tool.toolCallId)).toEqual(["tool-call-1"]);
  });

  it("creates provider-interruption continuation send input", () => {
    const { context, sessionRecoveryForCurrentSession } = setup();
    const openToolCalls = context.collectOpenProviderInterruptionToolSnapshots();
    const continuationState = context.createProviderContinuationState({
      message: "stream interrupted",
      kind: "stream_idle_timeout",
      retryScheduled: true,
      replaySafe: false,
      openToolCalls,
      completedToolMessageCount: 1,
      stateId: "state-2",
    });

    const followUp = context.createProviderInterruptionContinuationInput({
      message: "stream interrupted",
      diagnostic: { message: "stream interrupted", name: "Error" },
      tools: openToolCalls,
      completedToolMessageCount: 1,
      continuationState,
    }) as SendMessageInput & {
      internal: true;
      retryOfMessageId: string;
      modelContentOverride: string;
      assistantFinalizationRetry: { attempt: number; recoveryStateId?: string };
    };

    expect(followUp).toMatchObject({
      threadId: "thread-1",
      internal: true,
      permissionMode: "workspace",
      model: "moonshotai/kimi-k2.7-code",
      retryOfMessageId: "user-1",
      delivery: "prompt",
      preserveActiveThread: true,
      assistantFinalizationRetry: {
        reason: "provider_interruption_continuation",
        attempt: 4,
        maxRetries: 5,
        recoveryStateId: "state-2",
      },
    });
    expect(sessionRecoveryForCurrentSession).toHaveBeenCalledWith(
      "provider_interruption_continuation",
      "Continuing after Ambient/Pi provider interruption using the existing Pi session file when available.",
      "state-2",
    );
    expect(followUp.modelContentOverride).toContain("Ambient/Pi provider stream was interrupted.");
    expect(followUp.modelContentOverride).toContain("Durable recovery state:");
  });
});

function setup() {
  const progress = new ToolArgumentProgressTracker();
  const inputText = "{\"path\":\"/workspace/report.md\"}";
  progress.recordArgumentEvent({
    toolCallId: "tool-call-1",
    toolName: "write",
    eventType: "toolcall_end",
    inputContent: inputText,
    nowMs: Date.parse("2026-06-15T00:00:01.750Z"),
  });
  const toolInputs = new Map([["tool-call-1", inputText]]);
  const toolRecoveryInputs = new Map([["tool-call-1", "{\"path\":\"/workspace/report.md\",\"content\":\"hello\"}"]]);
  const toolLabels = new Map([["tool-call-1", "write"]]);
  const toolMessages = {
    toolCallIds: () => toolInputs.keys(),
    inputs: () => toolInputs,
    recoveryInputs: () => toolRecoveryInputs,
    labels: () => toolLabels,
    metadataFor: () => ({ artifactPath: ".ambient/report.md" }),
  } as unknown as RuntimeToolMessageController;
  const persistedArguments: Array<{
    workspacePath: string;
    runId: string;
    toolCallId: string;
    inputText: string;
  }> = [];
  const diagnostics: unknown[] = [];
  const sessionRecoveryForCurrentSession = vi.fn((kind, reason, providerContinuationStateId) => ({
    kind,
    reason,
    providerContinuationStateId,
  }));
  const context = createRuntimeProviderContinuationContext({
    baseInput: {
      threadId: "thread-1",
      content: "Please write the report.",
      model: "zai-org/GLM-5.1-FP8",
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
    toolMessages,
    toolArgumentProgress: progress,
    interruptedToolCallRecovery: new InterruptedToolCallRecoveryTracker({
      workspacePath: "/workspace",
      runId: "run-1",
      thresholdChars: 1_000,
    }),
    startedToolCallIds: new Set(),
    toolIntents: new Map([["tool-call-1", intent]]),
    getPermissionMode: vi.fn(() => "workspace" as const),
    getModel: vi.fn(() => "moonshotai/kimi-k2.7-code"),
    getRetrySourceUserMessageId: vi.fn(() => "user-1"),
    getCurrentAssistantMessageId: vi.fn(() => "assistant-1"),
    getSessionFile: vi.fn(() => "sessions/thread-1.jsonl"),
    getPiStreamActivity: vi.fn(() => ({
      eventCount: 4,
      approximatePayloadBytes: 2048,
      firstEventAt: "2026-06-15T00:00:01.000Z",
      firstEventType: "message_start",
      lastEventAt: "2026-06-15T00:00:02.000Z",
      lastEventType: "toolcall_end",
      lastActivityAtMs: Date.parse("2026-06-15T00:00:02.000Z"),
    })),
    getPiStreamTraceReference: vi.fn(() => ({
      path: "/workspace/.ambient/trace.jsonl",
      eventCount: 4,
      recentEventCount: 4,
      reason: "stream interrupted",
      recordedAt: "2026-06-15T00:00:02.000Z",
    })),
    getFirstAssistantVisibleTextAt: vi.fn(() => "2026-06-15T00:00:01.500Z"),
    getFirstToolArgumentAt: vi.fn(() => "2026-06-15T00:00:01.750Z"),
    getFirstToolExecutionStartedAt: vi.fn(() => undefined),
    getAssistantOutputChars: vi.fn(() => 25),
    getThinkingOutputChars: vi.fn(() => 5),
    getCurrentAssistantFinalText: vi.fn(() => "I will write the report."),
    getReceivedAnyText: vi.fn(() => true),
    chatStreamSemanticOutputSeen: vi.fn(() => true),
    currentPiStreamIdleSource: vi.fn(() => "stream_idle"),
    assistantFinalizationRetryNextAttemptFor: vi.fn(() => 4),
    sessionRecoveryForCurrentSession,
    updateRunDiagnostics: vi.fn((patch) => diagnostics.push(patch)),
    persistPreparedArguments: vi.fn((input) => {
      persistedArguments.push(input);
      return {
        recoveryArgumentPath: "/workspace/.ambient/recovery/tool-call-1.txt",
        workspaceRelativeRecoveryArgumentPath: ".ambient/recovery/tool-call-1.txt",
        recoveryArgumentSha256: "abc123",
        recoveryArgumentParseStatus: "valid_json" as const,
      };
    }),
    nowMs: vi.fn(() => Date.parse("2026-06-15T00:01:00.000Z")),
  });
  return {
    context,
    persistedArguments,
    diagnostics,
    sessionRecoveryForCurrentSession,
  };
}
