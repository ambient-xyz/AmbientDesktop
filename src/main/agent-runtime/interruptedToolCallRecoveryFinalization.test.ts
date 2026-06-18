import { describe, expect, it } from "vitest";

import type { ChatStreamInterruptionDiagnostic } from "../agent-runtime/agentRuntimeSendStreamDiagnostics";
import type { InterruptedToolCallRecoverySnapshot, ProviderContinuationState } from "../../shared/threadTypes";
import { interruptedToolCallRecoveryFinalizationMessage } from "./interruptedToolCallRecoveryFinalization";

const snapshot: InterruptedToolCallRecoverySnapshot = {
  version: 1,
  status: "recoverable",
  runId: "run-1",
  toolCallId: "call-write",
  toolName: "write",
  source: "raw_tool_input",
  thresholdChars: 16_000,
  capturedChars: 20_000,
  observedArgumentChars: 20_000,
  updatedAt: "2026-06-15T00:00:00.000Z",
  argumentPath: "/workspace/.ambient-codex/interrupted-tool-calls/run-1/call-write.partial-args.txt",
  workspaceRelativeArgumentPath: ".ambient-codex/interrupted-tool-calls/run-1/call-write.partial-args.txt",
  argumentSha256: "abc123",
  parseStatus: "valid_json",
  suffixPreview: "{\"path\":\"long.md\"",
  writeTargetPath: "long.md",
  writeContentPrefixChars: 12_000,
  writeContentPrefixPreview: "section\nsection\n",
  resumeInstruction: "Continue the interrupted write argument.",
};

const streamInterruptionDiagnostic: ChatStreamInterruptionDiagnostic = {
  kind: "stream_idle_timeout",
  message: "Ambient/Pi stream stalled after 30000ms without stream activity.",
  retryScheduled: true,
  replaySafe: true,
  runStartedAt: "2026-06-15T00:00:00.000Z",
  semanticOutputSeen: false,
  toolCallSeen: true,
  assistantOutputChars: 0,
  thinkingOutputChars: 0,
  toolMessageCount: 1,
  currentAssistantFinalTextChars: 0,
  streamEventCount: 4,
};

const continuationState: ProviderContinuationState = {
  version: 1,
  stateId: "provider-continuation-1",
  createdAt: "2026-06-15T00:00:01.000Z",
  runId: "run-1",
  threadId: "thread-1",
  assistantMessageId: "message-assistant-1",
  provider: "ambient",
  model: "ambient-preview",
  failure: {
    kind: "stream_idle_timeout",
    message: "Ambient/Pi stream stalled after 30000ms without stream activity.",
  },
  retry: {
    scheduled: true,
    replaySafe: true,
    attempt: 1,
    maxRetries: 2,
    reason: "interrupted_tool_call_recovery",
  },
  stream: {
    eventCount: 4,
    approximatePayloadBytes: 512,
    preStreamTimeoutMs: 15_000,
    streamIdleTimeoutMs: 30_000,
    assistantOutputChars: 0,
    thinkingOutputChars: 0,
    currentAssistantFinalTextChars: 0,
    semanticOutputSeen: false,
    receivedAnyText: false,
  },
  assistant: {
    messageId: "message-assistant-1",
    hasVisibleOutput: false,
    outputChars: 0,
    thinkingChars: 0,
  },
  tools: {
    all: [],
    open: [],
    completed: [],
    interrupted: [],
    mayHaveSideEffects: [],
    completedToolMessageCount: 0,
  },
  sessionFile: "/tmp/pi-session.jsonl",
};

describe("interruptedToolCallRecoveryFinalization", () => {
  it("models scheduled recovery assistant fallback content and metadata", () => {
    const result = interruptedToolCallRecoveryFinalizationMessage({
      message: "Ambient/Pi stream stalled after 30000ms without stream activity.",
      snapshots: [snapshot],
      willContinue: true,
      continuationState,
      streamInterruptionDiagnostic,
      retryAttempt: 1,
      maxRetries: 2,
    });

    expect(result.content).toContain("Ambient/Pi stream interrupted while preparing a large tool call.");
    expect(result.content).toContain("Partial args: .ambient-codex/interrupted-tool-calls/run-1/call-write.partial-args.txt");
    expect(result.content).toContain("Ambient is starting a continuation turn with the saved partial arguments.");
    expect(result.metadata).toMatchObject({
      status: "done",
      runtime: "pi",
      provider: "ambient",
      recoveringInterruptedToolCall: true,
      providerContinuationState: continuationState,
      piStreamInterruption: {
        kind: "stream_idle_timeout",
        retryScheduled: true,
        replaySafe: true,
        retryReason: "interrupted_tool_call_recovery",
        retryAttempt: 1,
        maxRetries: 2,
        interruptedToolCallRecovery: {
          scheduled: true,
          snapshots: [snapshot],
        },
      },
    });
  });

  it("models exhausted recovery fallback content and error metadata", () => {
    const result = interruptedToolCallRecoveryFinalizationMessage({
      message: "Ambient/Pi stream stalled after 30000ms without stream activity.",
      snapshots: [snapshot],
      willContinue: false,
      continuationState: {
        ...continuationState,
        retry: { ...continuationState.retry, scheduled: false, attempt: 2 },
      },
      streamInterruptionDiagnostic: {
        ...streamInterruptionDiagnostic,
        retryScheduled: false,
      },
      retryAttempt: 2,
      maxRetries: 2,
    });

    expect(result.content).toContain("Ambient did not auto-continue because the continuation retry budget was already used.");
    expect(result.metadata).toMatchObject({
      status: "error",
      recoveringInterruptedToolCall: false,
      piStreamInterruption: {
        retryScheduled: false,
        retryReason: "interrupted_tool_call_recovery",
        retryAttempt: 2,
        maxRetries: 2,
        interruptedToolCallRecovery: {
          scheduled: false,
          snapshots: [snapshot],
        },
      },
    });
  });
});
