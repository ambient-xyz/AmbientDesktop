import { describe, expect, it } from "vitest";
import type { ChatMessage, MessageVoiceState, VoiceSettings } from "../../shared/types";
import {
  recordVoiceDispatchForMessage,
  requestVoiceSummary,
  voiceSummaryRequestBody,
  type VoiceDispatchStore,
} from "./voiceDispatch";

const voiceSettings: VoiceSettings = {
  enabled: true,
  mode: "assistant-final",
  autoplay: false,
  providerCapabilityId: "tts:pure-c-voxtral",
  voiceId: "default",
  maxChars: 120,
  longReply: "summarize",
  format: "wav",
  artifactCacheMaxMb: 30,
};

function message(input: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: input.id ?? "message-1",
    threadId: input.threadId ?? "thread-1",
    role: input.role ?? "assistant",
    content: input.content ?? "Ready to speak.",
    createdAt: input.createdAt ?? "2026-05-07T00:00:00.000Z",
    metadata: input.metadata,
  };
}

function memoryStore(): VoiceDispatchStore & { states: MessageVoiceState[] } {
  const states: MessageVoiceState[] = [];
  return {
    states,
    setMessageVoiceState(input) {
      const now = "2026-05-07T00:00:00.000Z";
      const state = { ...input, createdAt: now, updatedAt: now };
      states.push(state);
      return state;
    },
  };
}

describe("voice dispatch", () => {
  it("persists queued assistant-text state for speakable final assistant messages", () => {
    const store = memoryStore();
    const result = recordVoiceDispatchForMessage({
      store,
      settings: voiceSettings,
      message: message({ content: "## Done\nGenerated [audio](https://example.com/file.wav)." }),
    });

    expect(result.decision).toMatchObject({ kind: "speak", spokenText: "Done Generated audio." });
    expect(result.state).toMatchObject({
      messageId: "message-1",
      threadId: "thread-1",
      status: "queued",
      source: "assistant-text",
      providerCapabilityId: "tts:pure-c-voxtral",
      voiceId: "default",
      spokenText: "Done Generated audio.",
      spokenTextChars: 21,
    });
  });

  it("persists queued summary state for long replies before provider work", () => {
    const store = memoryStore();
    const neuTtsInstallNotes = [
      "NeuTTS from Neuphonic looks promising for local cloning.",
      "Before install, read the README, inspect macOS support, check binary releases, and confirm dependency cost.",
      "Then preview commands and only activate after validation.",
    ].join(" ");

    const result = recordVoiceDispatchForMessage({
      store,
      settings: { ...voiceSettings, maxChars: 80 },
      message: message({ content: neuTtsInstallNotes }),
    });

    expect(result.decision).toMatchObject({ kind: "summarize", sourceText: neuTtsInstallNotes });
    expect(result.state).toMatchObject({
      status: "queued",
      source: "summary",
      spokenTextChars: 0,
      sourceTextChars: neuTtsInstallNotes.length,
    });
  });

  it("persists skipped state for ineligible messages", () => {
    const store = memoryStore();
    const result = recordVoiceDispatchForMessage({
      store,
      settings: voiceSettings,
      message: message({ role: "tool", content: "Raw command stdout should not be spoken." }),
    });

    expect(result.decision).toMatchObject({ kind: "skip", reason: "not-assistant-message" });
    expect(result.state).toMatchObject({
      status: "skipped",
      source: "assistant-text",
      error: "not-assistant-message",
    });
  });

  it("builds no-reasoning streaming summary requests", () => {
    expect(
      voiceSummaryRequestBody({
        model: "glm-5.1",
        sourceText: "Long assistant answer",
        maxChars: 180,
      }),
    ).toMatchObject({
      model: "zai-org/GLM-5.1-FP8",
      stream: true,
      reasoning: { effort: "none", enabled: false, exclude: true },
      temperature: 0.1,
    });
  });

  it("requests and sanitizes a voice summary response", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ choices: [{ message: { content: " Short spoken summary. " } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    await expect(
      requestVoiceSummary({
        apiKey: "ambient-test-key",
        model: "glm-5.1",
        baseUrl: "https://ambient.example/v1",
        sourceText: "Long assistant answer",
        maxChars: 180,
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toBe("Short spoken summary.");

    expect(calls[0].url).toBe("https://ambient.example/v1/chat/completions");
    expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer ambient-test-key" });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      stream: true,
      reasoning: { effort: "none", enabled: false, exclude: true },
    });
  });

  it("parses streaming voice summary deltas", async () => {
    const fetchImpl = async () =>
      new Response(
        [
          'data: {"choices":[{"delta":{"content":"Short "}}]}',
          'data: {"choices":[{"delta":{"content":"streamed summary."}}]}',
          "data: [DONE]",
          "",
        ].join("\n"),
        {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        },
      );

    await expect(
      requestVoiceSummary({
        apiKey: "ambient-test-key",
        model: "glm-5.1",
        sourceText: "Long assistant answer",
        maxChars: 180,
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toBe("Short streamed summary.");
  });

  it("clamps model summaries that exceed the spoken character limit", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "This summary is much too long for the configured cap." } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const summary = await requestVoiceSummary({
      apiKey: "ambient-test-key",
      model: "glm-5.1",
      sourceText: "Long assistant answer",
      maxChars: 24,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(summary).toBe("This summary is much");
    expect([...summary].length).toBeLessThanOrEqual(24);
  });
});
