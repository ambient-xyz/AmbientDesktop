import { describe, expect, it } from "vitest";

import type { ChatStreamInterruptionDiagnostic } from "../agentRuntimeSendStreamDiagnostics";
import {
  preOutputStreamStallRetryFinalizationMessage,
  providerErrorBeforeToolRetryFinalizationMessage,
} from "./providerRetryFinalization";

const baseDiagnostic: ChatStreamInterruptionDiagnostic = {
  kind: "pre_stream_timeout",
  message: "Ambient/Pi did not start streaming within 30000 ms.",
  retryScheduled: true,
  replaySafe: true,
  runStartedAt: "2026-06-15T00:00:00.000Z",
  semanticOutputSeen: false,
  toolCallSeen: false,
  assistantOutputChars: 0,
  thinkingOutputChars: 0,
  toolMessageCount: 0,
  currentAssistantFinalTextChars: 0,
  streamEventCount: 0,
  providerErrorDiagnostic: {
    message: "Ambient/Pi did not start streaming within 30000 ms.",
  },
};

describe("providerRetryFinalization", () => {
  it("models pre-output stream stall retry fallback content and metadata", () => {
    expect(preOutputStreamStallRetryFinalizationMessage({
      retryAttempt: 2,
      maxRetries: 10,
      retryDelayMs: 25,
      receivedAnyText: false,
      streamInterruptionDiagnostic: baseDiagnostic,
    })).toEqual({
      content: "Ambient/Pi stream stalled before assistant output. Retrying assistant finalization attempt 2/10 with a fresh session.",
      metadata: {
        status: "done",
        runtime: "pi",
        provider: "ambient",
        retryingStreamStall: true,
        piStreamTimeout: {
          ...baseDiagnostic,
          retryScheduled: true,
          retryUsesFreshSession: true,
          retryAttempt: 2,
          maxRetries: 10,
          retryReason: "pre_output_stream_stall",
          retryDelayMs: 25,
          receivedAnyText: false,
        },
      },
    });
  });

  it("models provider error before tool execution retry fallback content and metadata", () => {
    const diagnostic: ChatStreamInterruptionDiagnostic = {
      ...baseDiagnostic,
      kind: "provider_error_event",
      message: "Provider overloaded.",
      retryUsesFreshSession: true,
      retryAttempt: 3,
      maxRetries: 10,
      retryReason: "provider_error_before_tool_execution",
      retryDelayMs: 50,
      receivedAnyText: false,
    };

    expect(providerErrorBeforeToolRetryFinalizationMessage({
      retryAttempt: 3,
      maxRetries: 10,
      retryDelayMs: 50,
      streamInterruptionDiagnostic: diagnostic,
    })).toEqual({
      content: "Ambient/Pi provider failed before any tool executed. Retrying attempt 3/10 with a fresh session.",
      metadata: {
        status: "done",
        runtime: "pi",
        provider: "ambient",
        retryingProviderError: true,
        piStreamInterruption: diagnostic,
      },
    });
  });
});
