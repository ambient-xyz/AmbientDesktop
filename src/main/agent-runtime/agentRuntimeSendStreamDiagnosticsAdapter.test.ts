import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentRuntimeSendStreamDiagnosticsAdapter } from "./agentRuntimeSendStreamDiagnosticsAdapter";
import { createRuntimePromptControlState } from "./runtimePromptControlState";
import { createRuntimeProviderRetryState } from "./runtimeProviderRetryState";
import { createRuntimeStreamActivityTracker } from "./runtimeStreamActivityTracker";
import { createRuntimeStreamTraceState } from "./runtimeStreamTraceState";
import { createRuntimeTextOutputState } from "./runtimeTextOutputState";

describe("createAgentRuntimeSendStreamDiagnosticsAdapter", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("packs runtime send state into persisted Pi stream traces", () => {
    const statePath = mkdtempSync(join(tmpdir(), "ambient-stream-diagnostics-"));
    tempRoots.push(statePath);

    const streamTraceState = createRuntimeStreamTraceState();
    streamTraceState.recordPromptStart({ sessionFile: undefined, promptContent: "hello from prompt" });
    streamTraceState.markFirstToolArgumentObserved("2026-06-22T00:00:01.000Z");
    streamTraceState.markFirstToolExecutionObserved("2026-06-22T00:00:02.000Z");

    const outputState = createRuntimeTextOutputState();
    outputState.setReceivedAnyText(true);
    outputState.setCurrentAssistantReceivedText(true);
    outputState.setCurrentAssistantFinalText("final answer");
    outputState.setCurrentThinkingReceivedText(true);
    outputState.setCurrentThinkingFinalText("thinking");
    outputState.setAssistantOutputChars(12);
    outputState.setThinkingOutputChars(8);

    const providerRetryState = createRuntimeProviderRetryState();
    providerRetryState.setProviderRetryAttemptCount(2);
    providerRetryState.setProviderRetryLastError("provider unavailable");

    const promptControlState = createRuntimePromptControlState();
    promptControlState.setStreamWatchdogTimeoutMessage("stream stalled");

    const streamActivity = createRuntimeStreamActivityTracker({
      threadId: "thread-1",
      idleTimeoutMs: 30_000,
      progressThrottleMs: 0,
      progressCharDelta: 0,
      getOutputChars: outputState.assistantOutputChars,
      getThinkingChars: outputState.thinkingOutputChars,
      resetStreamWatchdog: vi.fn(),
      refreshEmptyAssistantStallWatchdog: vi.fn(),
      resetAssistantTerminalCompletion: vi.fn(),
      emitRunEvent: vi.fn(),
      now: () => Date.parse("2026-06-22T00:00:03.000Z"),
    });
    streamActivity.markActivity(true, { type: "message_delta", value: "hello" });

    const updateRunDiagnostics = vi.fn();
    const diagnostics = createAgentRuntimeSendStreamDiagnosticsAdapter({
      runId: "run-1",
      threadId: "thread-1",
      recentEventLimit: 10,
      streamTraceState,
      getWorkspaceStatePath: () => statePath,
      updateRunDiagnostics,
      streamActivity,
      outputState,
      providerRetryState,
      promptControlState,
      toolMessageCount: () => 3,
      getSessionFile: () => "/tmp/pi-session.jsonl",
      piPreStreamTimeoutMs: 5_000,
      piStreamIdleTimeoutMs: 30_000,
      runStartedAt: "2026-06-22T00:00:00.000Z",
      promptContentLength: () => "hello from prompt".length,
      runtimeMessages: { currentAssistantMessageId: () => "assistant-1" },
      runtimeModel: "example/model-id",
    });

    diagnostics.recordPiStreamTraceEvent({ type: "message_delta", value: "hello" }, { kind: "assistant_delta" });
    expect(diagnostics.chatStreamSemanticOutputSeen()).toBe(true);

    const reference = diagnostics.persistPiStreamTrace("unit-test");
    expect(reference).toEqual(
      expect.objectContaining({
        eventCount: 1,
        recentEventCount: 1,
        reason: "unit-test",
      }),
    );
    expect(updateRunDiagnostics).toHaveBeenCalledWith({ piStreamTrace: reference });

    const trace = JSON.parse(readFileSync(reference!.path, "utf8")) as {
      assistantMessageId?: string;
      model?: string;
      sessionFile?: string;
      prompt?: { contentChars?: number };
      stream?: {
        assistantOutputChars?: number;
        thinkingOutputChars?: number;
        eventCount?: number;
        semanticOutputSeen?: boolean;
      };
      recentEvents?: Array<{ toolMessageCount?: number; assistantOutputChars?: number; thinkingOutputChars?: number }>;
    };
    expect(trace.assistantMessageId).toBe("assistant-1");
    expect(trace.model).toBe("example/model-id");
    expect(trace.sessionFile).toBe("/tmp/pi-session.jsonl");
    expect(trace.prompt?.contentChars).toBe("hello from prompt".length);
    expect(trace.stream).toEqual(
      expect.objectContaining({
        assistantOutputChars: 12,
        eventCount: 1,
        semanticOutputSeen: true,
        thinkingOutputChars: 8,
      }),
    );
    expect(trace.recentEvents?.[0]).toEqual(
      expect.objectContaining({
        assistantOutputChars: 12,
        thinkingOutputChars: 8,
        toolMessageCount: 3,
      }),
    );
  });
});
