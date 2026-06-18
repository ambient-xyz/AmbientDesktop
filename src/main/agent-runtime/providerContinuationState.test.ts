import { describe, expect, it } from "vitest";

import type { InterruptedToolCallRecoverySnapshot, ToolArgumentProgressSnapshot, ToolIntentSnapshot } from "../../shared/threadTypes";
import type { ProviderInterruptionToolSnapshot } from "./provider-continuation/agentRuntimeProviderContinuationHelpers";
import {
  createRuntimeProviderContinuationState,
  runtimeProviderContinuationToolStateFromOpenSnapshot,
  runtimeProviderContinuationToolStateFromProgress,
} from "./providerContinuationState";

const intent: ToolIntentSnapshot = {
  version: 1,
  toolCallId: "tool-call-1",
  toolName: "web_research_fetch",
  operationKind: "verify_specific_source",
  targetSummary: "https://example.com/source",
  declaredPurpose: "Verify this source.",
  materiality: "required_before_final_answer",
  substituteAllowed: true,
  createdAt: "2026-06-15T00:00:00.000Z",
};

describe("providerContinuationState", () => {
  it("converts active progress into provider continuation tool state", () => {
    const state = runtimeProviderContinuationToolStateFromProgress({
      progress: progressSnapshot({ argumentComplete: true, inputChars: 12, observedArgumentChars: 12 }),
      interruptedToolCallIds: new Set(["tool-call-1"]),
      failureReason: "stream interrupted",
      recoverySnapshots: new Map([["tool-call-1", recoverySnapshot()]]),
      ...toolMaps(),
    });

    expect(state).toMatchObject({
      toolCallId: "tool-call-1",
      toolName: "web_research_fetch",
      status: "interrupted",
      certainty: "prepared_only",
      phase: "argument_stream",
      executionStarted: false,
      mayHaveSideEffects: false,
      argumentComplete: true,
      inputChars: 36,
      observedArgumentChars: 12,
      inputPreview: "{\"url\":\"https://example.com/source\"}",
      artifactPath: ".ambient/artifact.json",
      failureReason: "stream interrupted",
      recoveryArgumentPath: "/workspace/.ambient/recovery/tool-call-1.args.json",
      workspaceRelativeRecoveryArgumentPath: ".ambient/recovery/tool-call-1.args.json",
      intent,
    });
  });

  it("converts open snapshots without progress into interrupted tool state", () => {
    const state = runtimeProviderContinuationToolStateFromOpenSnapshot({
      snapshot: openSnapshot(),
      failureReason: "stream interrupted",
      ...toolMaps(),
    });

    expect(state).toMatchObject({
      toolCallId: "tool-call-1",
      status: "interrupted",
      certainty: "prepared_only",
      phase: "argument_stream",
      recoveryArgumentPath: "/workspace/.ambient/recovery/tool-call-1.args.json",
      workspaceRelativeRecoveryArgumentPath: ".ambient/recovery/tool-call-1.args.json",
      failureReason: "stream interrupted",
      intent,
    });
  });

  it("assembles durable provider continuation state from explicit runtime snapshots", () => {
    const completed = progressSnapshot({
      toolCallId: "tool-call-completed",
      toolName: "file_read",
      phase: "completed",
      eventType: "tool_execution_end",
      argumentComplete: true,
      executionStartedAt: "2026-06-15T00:00:01.000Z",
      executionCompletedAt: "2026-06-15T00:00:02.000Z",
    });
    const state = createRuntimeProviderContinuationState({
      message: "stream interrupted",
      kind: "stream_idle",
      retryScheduled: true,
      replaySafe: false,
      continuationSafe: true,
      retryAttempt: 1,
      maxRetries: 2,
      openToolCalls: [openSnapshot()],
      completedToolMessageCount: 1,
      receivedAnyText: false,
      stateId: "state-1",
      nowMs: Date.parse("2026-06-15T00:01:00.000Z"),
      run: {
        runId: "run-1",
        threadId: "thread-1",
        assistantMessageId: "assistant-1",
        model: "ambient-model",
        sessionFile: "sessions/thread-1.json",
      },
      stream: {
        eventCount: 4,
        approximatePayloadBytes: 1024,
        preStreamTimeoutMs: 10_000,
        streamIdleTimeoutMs: 30_000,
        idleSource: "stream_idle",
        assistantOutputChars: 10,
        thinkingOutputChars: 5,
        currentAssistantFinalTextChars: 10,
        semanticOutputSeen: true,
        receivedAnyText: true,
      },
      toolDiagnostics: {
        active: [progressSnapshot({ argumentComplete: true })],
        completed: [completed],
      },
      interruptedToolCallRecoveryDiagnostics: {
        active: [recoverySnapshot()],
        completed: [],
      },
      ...toolMaps(),
    });

    expect(state).toMatchObject({
      stateId: "state-1",
      createdAt: "2026-06-15T00:01:00.000Z",
      runId: "run-1",
      threadId: "thread-1",
      assistantMessageId: "assistant-1",
      provider: "ambient",
      model: "ambient-model",
      failure: { kind: "stream_idle", message: "stream interrupted" },
      retry: { scheduled: true, replaySafe: false, continuationSafe: true, attempt: 1, maxRetries: 2 },
      assistant: { messageId: "assistant-1", hasVisibleOutput: true, outputChars: 10, thinkingChars: 5 },
      sessionFile: "sessions/thread-1.json",
    });
    expect(state.stream).toMatchObject({
      eventCount: 4,
      approximatePayloadBytes: 1024,
      idleSource: "stream_idle",
      semanticOutputSeen: true,
      receivedAnyText: false,
    });
    expect(state.tools.open.map((tool) => tool.toolCallId)).toEqual(["tool-call-1"]);
    expect(state.tools.interrupted.map((tool) => tool.toolCallId)).toEqual(["tool-call-1"]);
    expect(state.tools.completed.map((tool) => tool.toolCallId)).toEqual(["tool-call-completed"]);
    expect(state.tools.mayHaveSideEffects.map((tool) => tool.toolCallId)).toEqual(["tool-call-completed"]);
    expect(state.tools.completedToolMessageCount).toBe(1);
    expect(state.tools.open[0]).toMatchObject({
      failureReason: "stream interrupted",
      recoveryArgumentPath: "/workspace/.ambient/recovery/tool-call-1.args.json",
      workspaceRelativeRecoveryArgumentPath: ".ambient/recovery/tool-call-1.args.json",
    });
  });
});

function toolMaps() {
  return {
    toolInputs: new Map([["tool-call-1", "{\"url\":\"https://example.com/source\"}"]]),
    toolIntents: new Map([["tool-call-1", intent]]),
    toolMetadataFor: (toolCallId: string) => toolCallId === "tool-call-1" ? { artifactPath: ".ambient/artifact.json" } : {},
  };
}

function openSnapshot(): ProviderInterruptionToolSnapshot {
  return {
    toolCallId: "tool-call-1",
    toolName: "web_research_fetch",
    phase: "arguments_prepared_not_executed",
    certainty: "prepared_only",
    executionStarted: false,
    argumentComplete: true,
    inputChars: 36,
    inputPreview: "{\"url\":\"https://example.com/source\"}",
    recoveryArgumentPath: "/workspace/.ambient/recovery/tool-call-1.args.json",
    workspaceRelativeRecoveryArgumentPath: ".ambient/recovery/tool-call-1.args.json",
    intent,
  };
}

function recoverySnapshot(): InterruptedToolCallRecoverySnapshot {
  return {
    version: 1,
    status: "recoverable",
    runId: "run-1",
    toolCallId: "tool-call-1",
    toolName: "web_research_fetch",
    source: "visible_tool_input",
    thresholdChars: 10,
    capturedChars: 36,
    observedArgumentChars: 36,
    updatedAt: "2026-06-15T00:00:00.000Z",
    argumentPath: "/workspace/.ambient/recovery/tool-call-1.args.json",
    workspaceRelativeArgumentPath: ".ambient/recovery/tool-call-1.args.json",
    argumentSha256: "abc123",
    parseStatus: "valid_json",
    suffixPreview: "{\"url\":\"https://example.com/source\"}",
    resumeInstruction: "Use recovery_read_interrupted_tool_call.",
    intent,
  };
}

function progressSnapshot(overrides: Partial<ToolArgumentProgressSnapshot> = {}): ToolArgumentProgressSnapshot {
  return {
    version: 1,
    phase: "argument_stream",
    eventType: "toolcall_delta",
    toolCallId: "tool-call-1",
    toolName: "web_research_fetch",
    uiStatus: "preparing",
    argumentStartedAt: "2026-06-15T00:00:00.000Z",
    argumentUpdatedAt: "2026-06-15T00:00:00.500Z",
    argumentElapsedMs: 500,
    argumentComplete: false,
    inputChars: 0,
    deltaChars: 0,
    totalDeltaChars: 0,
    maxDeltaChars: 0,
    observedArgumentChars: 0,
    argumentEventCount: 1,
    toolcallDeltaCount: 1,
    meaningfulGrowthCount: 1,
    charsPerSecond: 0,
    ...overrides,
  };
}
