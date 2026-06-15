import { describe, expect, it } from "vitest";

import type { ProviderContinuationState } from "../../shared/types";
import type {
  ProviderInterruptionDiagnostic,
  ProviderInterruptionToolSnapshot,
} from "../agentRuntimeProviderContinuationHelpers";
import type { ChatStreamInterruptionDiagnostic } from "../agentRuntimeSendStreamDiagnostics";
import {
  providerInterruptionFinalizationMessage,
  providerInterruptionRecoveryFailureFinalizationMessage,
} from "./providerInterruptionFinalization";

const diagnostic: ProviderInterruptionDiagnostic = {
  message: "Upstream error",
  status: 502,
  code: "bad_gateway",
  requestId: "req_123",
  traceId: "cf-ray-123",
  retryAfter: "3",
  detailPreview: "model overloaded Bearer [REDACTED]",
};

const tool: ProviderInterruptionToolSnapshot = {
  toolCallId: "call-fetch",
  toolName: "web_research_fetch",
  phase: "arguments_prepared_not_executed",
  certainty: "prepared_only",
  executionStarted: false,
  argumentComplete: true,
  inputChars: 128,
  inputPreview: "{\"url\":\"https://example.com\"}",
  workspaceRelativeRecoveryArgumentPath: ".ambient-codex/interrupted-tool-calls/run-1/call-fetch.prepared-args.txt",
  intent: {
    version: 1,
    toolCallId: "call-fetch",
    toolName: "web_research_fetch",
    operationKind: "verify_specific_source",
    materiality: "required_before_final_answer",
    substituteAllowed: true,
    targetSummary: "https://example.com",
    declaredPurpose: "verify current source",
    createdAt: "2026-06-15T00:00:00.000Z",
  },
};

const continuationState: ProviderContinuationState = {
  version: 1,
  stateId: "provider-continuation-1",
  createdAt: "2026-06-15T00:00:01.000Z",
  runId: "run-1",
  threadId: "thread-1",
  assistantMessageId: "assistant-1",
  provider: "ambient",
  model: "ambient-preview",
  failure: {
    kind: "provider_error_event",
    message: "Upstream error",
  },
  retry: {
    scheduled: true,
    replaySafe: true,
    continuationSafe: true,
    usesFreshSession: false,
    attempt: 1,
    maxRetries: 10,
    reason: "provider_interruption_continuation",
    delayMs: 0,
  },
  stream: {
    eventCount: 2,
    approximatePayloadBytes: 256,
    preStreamTimeoutMs: 15_000,
    streamIdleTimeoutMs: 30_000,
    firstEventType: "message_update",
    idleSource: "provider_error_event",
    firstToolArgumentAt: "2026-06-15T00:00:00.500Z",
    assistantOutputChars: 0,
    thinkingOutputChars: 0,
    currentAssistantFinalTextChars: 0,
    semanticOutputSeen: false,
    receivedAnyText: false,
  },
  assistant: {
    messageId: "assistant-1",
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

const streamDiagnostic: ChatStreamInterruptionDiagnostic = {
  kind: "provider_error_event",
  message: "Upstream error",
  retryScheduled: true,
  replaySafe: true,
  continuationSafe: true,
  retryUsesFreshSession: false,
  retryAttempt: 1,
  maxRetries: 10,
  retryReason: "provider_interruption_continuation",
  retryDelayMs: 0,
  runStartedAt: "2026-06-15T00:00:00.000Z",
  firstStreamEventAt: "2026-06-15T00:00:00.250Z",
  firstToolArgumentAt: "2026-06-15T00:00:00.500Z",
  semanticOutputSeen: false,
  toolCallSeen: true,
  assistantOutputChars: 0,
  thinkingOutputChars: 0,
  toolMessageCount: 1,
  currentAssistantFinalTextChars: 0,
  streamEventCount: 2,
  providerErrorDiagnostic: diagnostic,
};

describe("providerInterruptionFinalization", () => {
  it("models scheduled provider continuation fallback content and metadata", () => {
    const result = providerInterruptionFinalizationMessage({
      currentAssistantVisibleContent: "Partial answer.",
      message: "Upstream error",
      diagnostic,
      tools: [tool],
      completedToolMessageCount: 0,
      attempt: 1,
      maxRetries: 10,
      willContinue: true,
      continuationState,
      streamInterruptionDiagnostic: streamDiagnostic,
    });

    expect(result.content).toContain("Partial answer.\n\nAmbient/Pi provider stream was interrupted.");
    expect(result.content).toContain("Ambient is starting a continuation turn from the durable recovery state");
    expect(result.content).toContain("Continuation attempt: 1/10");
    expect(result.content).toContain("web_research_fetch");
    expect(result.content).toContain("certainty=prepared_only");
    expect(result.content).toContain("intent: verify_specific_source; required_before_final_answer");
    expect(result.metadata).toMatchObject({
      status: "done",
      runtime: "pi",
      provider: "ambient",
      retryingProviderError: true,
      providerInterruptionContinuation: true,
      providerContinuationState: continuationState,
      piStreamInterruption: streamDiagnostic,
    });
  });

  it("models continuation setup failure fallback content and metadata", () => {
    const result = providerInterruptionFinalizationMessage({
      currentAssistantVisibleContent: "",
      message: "Upstream error",
      diagnostic,
      tools: [tool],
      completedToolMessageCount: 0,
      attempt: 0,
      maxRetries: 10,
      willContinue: false,
      continuationSetupError: "Could not write session pointer.",
      continuationState: {
        ...continuationState,
        retry: {
          ...continuationState.retry,
          scheduled: false,
          continuationSafe: false,
          attempt: 0,
        },
      },
      streamInterruptionDiagnostic: {
        ...streamDiagnostic,
        retryScheduled: false,
        continuationSafe: false,
        retryAttempt: 0,
      },
    });

    expect(result.content).toContain("Ambient stopped before replaying the original request");
    expect(result.content).toContain("Continuation setup failed: Could not write session pointer.");
    expect(result.content).toContain("Ambient could not schedule the provider continuation: Could not write session pointer.");
    expect(result.metadata).toMatchObject({
      status: "error",
      retryingProviderError: false,
      providerInterruptionContinuation: true,
      piStreamInterruption: {
        retryScheduled: false,
        continuationSafe: false,
        continuationSetupError: "Could not write session pointer.",
      },
    });
  });

  it("models exhausted incomplete-argument retry budget fallback content", () => {
    const result = providerInterruptionFinalizationMessage({
      currentAssistantVisibleContent: "",
      message: "Upstream error",
      diagnostic,
      tools: [{
        ...tool,
        phase: "argument_stream_not_executed",
        certainty: "preparing",
        argumentComplete: false,
      }],
      completedToolMessageCount: 0,
      attempt: 2,
      maxRetries: 2,
      willContinue: false,
      retryBudgetReason: "incomplete_tool_argument_stream",
      continuationState: {
        ...continuationState,
        retry: {
          ...continuationState.retry,
          scheduled: false,
          continuationSafe: true,
          attempt: 2,
          maxRetries: 2,
        },
      },
      streamInterruptionDiagnostic: {
        ...streamDiagnostic,
        retryScheduled: false,
        continuationSafe: false,
        retryAttempt: 2,
        maxRetries: 2,
      },
    });

    expect(result.content).toContain("Ambient stopped instead of retrying again because the provider repeatedly stalled before completing tool arguments.");
    expect(result.content).toContain("The interrupted tool calls only reached incomplete argument streams, so replaying the same continuation is unlikely to make forward progress.");
    expect(result.metadata).toMatchObject({
      status: "error",
      retryingProviderError: false,
      piStreamInterruption: {
        retryScheduled: false,
        retryAttempt: 2,
        maxRetries: 2,
      },
    });
  });

  it("models recovery failure fallback after partial visible assistant content", () => {
    const result = providerInterruptionRecoveryFailureFinalizationMessage({
      currentAssistantVisibleContent: "Partial answer.",
      interruptionNotice: "Ambient/Pi stream interrupted.\n\nUpstream error\nProvider interruption recovery failed: disk full",
      streamInterruptionDiagnostic: {
        ...streamDiagnostic,
        message: "Upstream error\nProvider interruption recovery failed: disk full",
        retryScheduled: false,
      },
    });

    expect(result.content).toBe(
      "Partial answer.\n\nAmbient/Pi stream interrupted.\n\nUpstream error\nProvider interruption recovery failed: disk full",
    );
    expect(result.metadata).toMatchObject({
      status: "error",
      runtime: "pi",
      provider: "ambient",
      providerInterruptionContinuation: true,
      piStreamInterruption: {
        message: "Upstream error\nProvider interruption recovery failed: disk full",
        retryScheduled: false,
      },
    });
  });

  it("models recovery failure fallback without duplicating empty assistant content", () => {
    const result = providerInterruptionRecoveryFailureFinalizationMessage({
      currentAssistantVisibleContent: "   ",
      interruptionNotice: "Ambient/Pi stream interrupted after tool activity.\n\nUpstream error",
      streamInterruptionDiagnostic: streamDiagnostic,
    });

    expect(result.content).toBe("Ambient/Pi stream interrupted after tool activity.\n\nUpstream error");
    expect(result.metadata).toMatchObject({
      status: "error",
      runtime: "pi",
      provider: "ambient",
      providerInterruptionContinuation: true,
      piStreamInterruption: streamDiagnostic,
    });
  });
});
