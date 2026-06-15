import { describe, expect, it } from "vitest";

import type { RuntimeProviderErrorDiagnostic } from "../agentRuntimeProviderDiagnostics";
import type { ChatStreamInterruptionDiagnostic } from "../agentRuntimeSendStreamDiagnostics";
import type { SubagentParentControlAbortIntent } from "../agentRuntimeToolMessageMetadata";
import { terminalProviderFailureFinalizationMessage } from "./terminalProviderFailureFinalization";

const providerErrorDiagnostic: RuntimeProviderErrorDiagnostic = {
  name: "AmbientStreamFailureError",
  message: "Ambient provider returned 502",
  status: 502,
  code: "bad_gateway",
  requestId: "req_123",
  detailPreview: "model overloaded Bearer [REDACTED]",
};

const streamInterruptionDiagnostic: ChatStreamInterruptionDiagnostic = {
  kind: "provider_error_event",
  message: "Ambient provider returned 502",
  retryScheduled: false,
  replaySafe: false,
  runStartedAt: "2026-06-15T00:00:00.000Z",
  semanticOutputSeen: false,
  toolCallSeen: false,
  assistantOutputChars: 0,
  thinkingOutputChars: 0,
  toolMessageCount: 0,
  currentAssistantFinalTextChars: 0,
  streamEventCount: 1,
  providerErrorDiagnostic,
};

const subagentParentControlAbortIntent: SubagentParentControlAbortIntent = {
  reason: "Parent run cancelled by user while resolving a sub-agent wait barrier.",
  message: "Parent run cancelled by user while resolving a sub-agent wait barrier.",
  toolCallId: "call-resolve-barrier",
  parentRunId: "run-parent",
  waitBarrierId: "barrier-1",
  idempotencyKey: "barrier:cancel-parent",
  decision: "cancel_parent",
};

describe("terminalProviderFailureFinalizationMessage", () => {
  it("models plain abort fallback content and metadata", () => {
    const result = terminalProviderFailureFinalizationMessage({
      status: "aborted",
      abortRequested: true,
      abortMessage: "Run stopped.",
      providerErrorContent: "The Pi/Ambient runtime returned an error.",
    });

    expect(result.content).toBe("Run stopped.");
    expect(result.metadata).toEqual({
      status: "aborted",
      runtime: "pi",
      provider: "ambient",
    });
  });

  it("preserves subagent parent-control abort metadata", () => {
    const result = terminalProviderFailureFinalizationMessage({
      status: "aborted",
      abortRequested: true,
      abortMessage: subagentParentControlAbortIntent.message,
      providerErrorContent: "The Pi/Ambient runtime returned an error.",
      subagentParentControlAbortIntent,
    });

    expect(result.content).toBe(subagentParentControlAbortIntent.message);
    expect(result.metadata).toMatchObject({
      status: "aborted",
      runtime: "pi",
      provider: "ambient",
      subagentParentControlAbort: subagentParentControlAbortIntent,
    });
    expect(result.metadata).not.toHaveProperty("providerErrorDiagnostic");
    expect(result.metadata).not.toHaveProperty("piStreamInterruption");
  });

  it("models terminal provider failure content and diagnostics", () => {
    const result = terminalProviderFailureFinalizationMessage({
      status: "error",
      abortRequested: false,
      abortMessage: "Run stopped.",
      providerErrorContent: "The Pi/Ambient runtime returned an error:\n\nAmbient provider returned 502",
      providerErrorDiagnostic,
      streamInterruptionDiagnostic,
    });

    expect(result.content).toBe("The Pi/Ambient runtime returned an error:\n\nAmbient provider returned 502");
    expect(result.metadata).toMatchObject({
      status: "error",
      runtime: "pi",
      provider: "ambient",
      providerErrorDiagnostic,
      piStreamInterruption: streamInterruptionDiagnostic,
    });
  });
});
