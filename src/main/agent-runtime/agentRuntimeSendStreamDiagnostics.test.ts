import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRuntimeSendStreamDiagnostics,
  type PiStreamTraceEvent,
} from "./agentRuntimeSendStreamDiagnostics";
import type { PiStreamTraceReference } from "./provider-continuation/agentRuntimeProviderDiagnostics";

describe("agentRuntimeSendStreamDiagnostics", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("records bounded Pi stream trace events and persists trace metadata", () => {
    const stateRoot = mkdtempSync(join(tmpdir(), "ambient-stream-trace-"));
    tempRoots.push(stateRoot);
    const recentEvents: PiStreamTraceEvent[] = [];
    let traceReference: PiStreamTraceReference | undefined;
    let recordedDiagnostics: { piStreamTrace: PiStreamTraceReference } | undefined;
    const state = baseState({
      piStreamEventCount: 2,
      sessionFile: "/tmp/session.jsonl",
      promptContentLength: 42,
    });
    const diagnostics = createRuntimeSendStreamDiagnostics({
      runId: "run-1",
      threadId: "thread-1",
      recentEventLimit: 1,
      recentEvents,
      getWorkspaceStatePath: () => stateRoot,
      getTraceReference: () => traceReference,
      setTraceReference: (reference) => {
        traceReference = reference;
      },
      updateRunDiagnostics: (diagnostics) => {
        recordedDiagnostics = diagnostics;
      },
      getState: () => state,
    });

    diagnostics.recordPiStreamTraceEvent({ type: "first" }, { kind: "assistant-text-delta" });
    diagnostics.recordPiStreamTraceEvent({ type: "second" }, { kind: "tool-call-start" });
    const reference = diagnostics.persistPiStreamTrace("stream stalled");

    expect(recentEvents).toHaveLength(1);
    expect(recentEvents[0]?.normalizedKind).toBe("tool-call-start");
    expect(reference?.eventCount).toBe(2);
    expect(reference?.recentEventCount).toBe(1);
    expect(recordedDiagnostics?.piStreamTrace).toEqual(reference);
    expect(reference?.path && existsSync(reference.path)).toBe(true);
    const trace = JSON.parse(readFileSync(reference!.path, "utf8"));
    expect(trace.prompt.contentChars).toBe(42);
    expect(trace.recentEvents).toHaveLength(1);
  });

  it("builds interruption diagnostics from the latest mutable stream state", () => {
    const recentEvents: PiStreamTraceEvent[] = [];
    const state = baseState({
      assistantOutputChars: 12,
      currentAssistantFinalText: "visible text",
      toolMessageCount: 2,
      providerRetryAttemptCount: 1,
      providerRetryLastError: "temporary outage",
    });
    const diagnostics = createRuntimeSendStreamDiagnostics({
      runId: "run-2",
      threadId: "thread-2",
      recentEventLimit: 5,
      recentEvents,
      getWorkspaceStatePath: () => tmpdir(),
      getTraceReference: () => undefined,
      setTraceReference: () => undefined,
      updateRunDiagnostics: () => undefined,
      getState: () => state,
    });

    const diagnostic = diagnostics.chatStreamInterruptionDiagnostic("provider interrupted", {
      retryScheduled: true,
      replaySafe: true,
    });

    expect(diagnostic.semanticOutputSeen).toBe(true);
    expect(diagnostic.toolCallSeen).toBe(true);
    expect(diagnostic.toolMessageCount).toBe(2);
    expect(diagnostic.providerRetryAttemptCount).toBe(1);
    expect(diagnostics.chatStreamInterruptionNotice("provider interrupted")).toContain("provider interrupted");
  });
});

function baseState(overrides = {}) {
  return {
    piStreamEventCount: 0,
    streamWatchdogTimeoutMessage: undefined,
    piPreStreamTimeoutMs: 1_000,
    piStreamIdleTimeoutMs: 2_000,
    runStartedAt: new Date().toISOString(),
    assistantOutputChars: 0,
    thinkingOutputChars: 0,
    currentAssistantFinalText: "",
    currentThinkingFinalText: "",
    receivedAnyText: false,
    currentAssistantReceivedText: false,
    currentThinkingReceivedText: false,
    toolMessageCount: 0,
    sessionFile: undefined,
    piPromptStartLine: undefined,
    piPromptUserLine: undefined,
    promptContentSha256: undefined,
    promptContentLength: 0,
    currentAssistantMessageId: "assistant-1",
    runtimeModel: undefined,
    piStreamApproximatePayloadBytes: 0,
    firstPiStreamEventAt: undefined,
    firstPiStreamEventType: undefined,
    lastPiStreamEventAt: undefined,
    lastPiStreamEventType: undefined,
    firstAssistantVisibleTextAt: undefined,
    firstToolArgumentAt: undefined,
    firstToolExecutionStartedAt: undefined,
    providerRetryAttemptCount: 0,
    providerRetryLastError: undefined,
    ...overrides,
  };
}
