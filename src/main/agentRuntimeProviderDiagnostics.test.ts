import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AmbientStreamFailureError } from "./aggressiveRetries";
import {
  approximateDiagnosticPayloadBytes,
  buildChatStreamInterruptionNotice,
  buildRuntimeProviderFailureDiagnostic,
  compactToolInputPreview,
  countJsonlEntries,
  isAmbientProviderAuthFailure,
  isContinuableAmbientProviderInterruption,
  normalizedPiEventType,
  piStreamTraceEventDetails,
  runtimeProviderErrorDiagnostic,
  runtimeProviderFailureIdleSource,
} from "./agentRuntimeProviderDiagnostics";

const provider = {
  providerId: "ambient",
  providerLabel: "Ambient API",
  debugOverride: false,
  baseUrl: "https://api.ambient.xyz/v1",
  model: "ambient-preview",
  hasApiKey: true,
  source: "saved",
  storage: "os-encrypted",
} as const;

describe("agentRuntimeProviderDiagnostics", () => {
  it("builds interruption notices from stream progress state", () => {
    expect(buildChatStreamInterruptionNotice({
      message: "stream stalled",
      toolMessageCount: 1,
      semanticOutputSeen: true,
    })).toBe([
      "Ambient/Pi stream interrupted after tool activity. Ambient did not replay the original request automatically because that could duplicate tool side effects.",
      "stream stalled",
    ].join("\n\n"));

    expect(buildChatStreamInterruptionNotice({
      message: "stream stalled",
      toolMessageCount: 0,
      semanticOutputSeen: true,
    })).toBe([
      "Ambient/Pi stream interrupted after visible output. The request was not replayed automatically.",
      "stream stalled",
    ].join("\n\n"));

    expect(buildChatStreamInterruptionNotice({
      message: "stream stalled",
      toolMessageCount: 0,
      semanticOutputSeen: false,
    })).toBe("Ambient/Pi stream interrupted.\n\nstream stalled");
  });

  it("classifies provider auth failures", () => {
    expect(isAmbientProviderAuthFailure({ message: "401 Unauthorized" }, provider)).toBe(true);
    expect(isAmbientProviderAuthFailure({ message: "upstream unavailable", statusCode: 502 }, provider)).toBe(false);
    expect(isAmbientProviderAuthFailure({ message: "local setup failed" }, { ...provider, hasApiKey: false, source: "missing" })).toBe(true);
  });

  it("captures redacted provider diagnostics and failure envelopes", () => {
    const error = Object.assign(new Error("Upstream error"), {
      status: 502,
      code: "bad_gateway",
      requestId: "req_123",
      body: "model overloaded Bearer abcdefghijklmnop",
      headers: {
        "cf-ray": "cf-ray-123",
        "retry-after": "3",
        authorization: "Bearer should-not-leak",
      },
    });

    const providerError = runtimeProviderErrorDiagnostic(error);
    const failure = buildRuntimeProviderFailureDiagnostic({
      providerStatus: provider,
      kind: "provider_error_event",
      message: "Upstream error",
      runStartedAt: new Date(Date.now() - 100).toISOString(),
      error: providerError,
      retryScheduled: true,
      replaySafe: false,
      continuationSafe: true,
      usesFreshSession: true,
      retryAttempt: 1,
      maxRetries: 10,
      retryReason: "provider_interruption_continuation",
      stream: {
        eventCount: 1,
        approximatePayloadBytes: 200,
        preStreamTimeoutMs: 15_000,
        streamIdleTimeoutMs: 30_000,
        firstEventAt: "2026-05-25T00:00:00.000Z",
        firstEventType: "message_update",
        lastEventAt: "2026-05-25T00:00:01.000Z",
        lastEventType: "message_update",
        idleSource: runtimeProviderFailureIdleSource("provider_error_event"),
        assistantOutputChars: 0,
        thinkingOutputChars: 0,
        currentAssistantFinalTextChars: 0,
        semanticOutputSeen: false,
        receivedAnyText: false,
      },
      transcript: {
        toolCallSeen: true,
        toolMessageCount: 1,
        openToolCallCount: 1,
        completedToolMessageCount: 0,
      },
    });

    expect(providerError).toMatchObject({
      status: 502,
      code: "bad_gateway",
      requestId: "req_123",
      traceId: "cf-ray-123",
      retryAfter: "3",
      bodyPreview: "model overloaded Bearer [REDACTED]",
      detailPreview: "model overloaded Bearer [REDACTED]",
      headers: expect.objectContaining({
        "cf-ray": "cf-ray-123",
        "retry-after": "3",
      }),
    });
    expect(JSON.stringify(providerError)).not.toContain("abcdefghijklmnop");
    expect(JSON.stringify(providerError)).not.toContain("should-not-leak");
    expect(failure).toMatchObject({
      providerErrorBodyPreview: "model overloaded Bearer [REDACTED]",
      retry: {
        scheduled: true,
        continuationSafe: true,
        usesFreshSession: true,
        attempt: 1,
        maxRetries: 10,
      },
      stream: {
        firstEventType: "message_update",
        lastEventType: "message_update",
        idleSource: "provider_error_event",
      },
    });
  });

  it("classifies continuable provider interruptions separately from replay-safe retries", () => {
    expect(isContinuableAmbientProviderInterruption(
      new AmbientStreamFailureError("stream_idle_timeout", "Ambient/Pi stream stalled.", { toolCallSeen: true }),
    )).toBe(true);
    expect(isContinuableAmbientProviderInterruption(
      new AmbientStreamFailureError("user_abort", "User stopped the run."),
    )).toBe(false);
    expect(isContinuableAmbientProviderInterruption(
      new AmbientStreamFailureError("provider_error_event", "invalid request schema"),
    )).toBe(false);
  });

  it("summarizes Pi stream trace event details and payload sizes", () => {
    const messageUpdate = {
      type: "message_update",
      assistantMessageEvent: {
        type: "delta",
        delta: "token Bearer abcdefghijklmnop",
        toolCallId: "tool-1",
        toolName: "write_file",
        partial: { role: "assistant" },
      },
    };
    const agentEnd = {
      type: "agent_end",
      messages: [
        { role: "assistant", content: [{ type: "text", text: "Done" }, { type: "toolCall" }] },
        { role: "user", content: "Build it" },
      ],
    };

    expect(normalizedPiEventType(messageUpdate)).toBe("message_update");
    expect(approximateDiagnosticPayloadBytes(messageUpdate)).toBeGreaterThan(0);
    expect(piStreamTraceEventDetails(messageUpdate)).toMatchObject({
      updateType: "delta",
      deltaChars: 29,
      textPreview: "token Bearer [REDACTED]",
      partialRole: "assistant",
      toolCallId: "tool-1",
      toolName: "write_file",
    });
    expect(piStreamTraceEventDetails(agentEnd)).toMatchObject({
      messageCount: 2,
      assistantCount: 1,
      assistantTextChars: 4,
      assistantToolCallCount: 1,
    });
  });

  it("counts jsonl entries and builds compact redacted tool input previews", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ambient-provider-diagnostics-"));
    try {
      const file = join(dir, "session.jsonl");
      await writeFile(file, "\n{\"a\":1}\n\n{\"b\":2}\n", "utf8");

      expect(countJsonlEntries(file)).toBe(2);
      expect(countJsonlEntries(join(dir, "missing.jsonl"))).toBeUndefined();
      expect(compactToolInputPreview("  token   Bearer abcdefghijklmnop   ")).toBe("token Bearer [REDACTED]");
      expect(compactToolInputPreview("x".repeat(300))).toHaveLength(240);
      expect(compactToolInputPreview("   ")).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
