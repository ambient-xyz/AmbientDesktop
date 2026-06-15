import { describe, expect, it } from "vitest";
import type { ChatMessage, VoiceSettings } from "../shared/types";
import { cleanAssistantTextForVoice, prepareVoiceTextForMessage } from "./voiceText";

const voiceSettings: VoiceSettings = {
  enabled: true,
  mode: "assistant-final",
  autoplay: false,
  maxChars: 120,
  longReply: "summarize",
  format: "mp3",
  artifactCacheMaxMb: 30,
};

function message(input: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: input.id ?? "message-1",
    threadId: input.threadId ?? "thread-1",
    role: input.role ?? "assistant",
    content: input.content ?? "Hello from Ambient.",
    createdAt: input.createdAt ?? "2026-05-07T00:00:00.000Z",
    metadata: input.metadata,
  };
}

describe("voice text preparation", () => {
  it("only allows final assistant text through the default voice mode", () => {
    expect(prepareVoiceTextForMessage(message({ role: "user" }), voiceSettings)).toMatchObject({
      kind: "skip",
      reason: "not-assistant-message",
    });
    expect(prepareVoiceTextForMessage(message({ role: "tool" }), voiceSettings)).toMatchObject({
      kind: "skip",
      reason: "not-assistant-message",
    });
    expect(prepareVoiceTextForMessage(message(), voiceSettings)).toMatchObject({
      kind: "speak",
      spokenText: "Hello from Ambient.",
    });
  });

  it("cleans markdown, links, hidden thinking, and code blocks without summarizing", () => {
    const content = [
      "<thinking>private chain of thought</thinking>",
      "## Result",
      "",
      "Here is **the answer** with [a link](https://example.com/path).",
      "",
      "```ts",
      "const secret = 'do not read code blocks';",
      "```",
      "",
      "- First item",
      "- [x] Completed task",
      "",
      "| Name | Value |",
      "| --- | --- |",
      "| voice | ok |",
    ].join("\n");

    expect(cleanAssistantTextForVoice(content)).toBe(
      "Result Here is the answer with a link. First item Completed task Name Value voice ok",
    );
    expect(prepareVoiceTextForMessage(message({ content }), { ...voiceSettings, maxChars: 200 })).toMatchObject({
      kind: "speak",
      spokenText: "Result Here is the answer with a link. First item Completed task Name Value voice ok",
    });
  });

  it("requests a no-reasoning summary boundary for long replies when configured", () => {
    const content = "Long reply. ".repeat(40);
    expect(prepareVoiceTextForMessage(message({ content }), voiceSettings)).toMatchObject({
      kind: "summarize",
      source: "summary",
      sourceText: content,
      maxChars: 120,
    });
  });

  it("can skip or ask before speaking long replies", () => {
    const content = "Long reply. ".repeat(40);
    expect(prepareVoiceTextForMessage(message({ content }), { ...voiceSettings, longReply: "skip" })).toMatchObject({
      kind: "skip",
      reason: "long-reply-skip",
      longReply: "skip",
    });
    expect(prepareVoiceTextForMessage(message({ content }), { ...voiceSettings, longReply: "ask" })).toMatchObject({
      kind: "skip",
      reason: "long-reply-ask",
      longReply: "ask",
    });
  });

  it("supports tagged mode without reading every assistant message", () => {
    expect(prepareVoiceTextForMessage(message(), { ...voiceSettings, mode: "tagged" })).toMatchObject({
      kind: "skip",
      reason: "tag-required",
    });
    expect(
      prepareVoiceTextForMessage(message({ content: "<!-- ambient:voice --> Read this one." }), {
        ...voiceSettings,
        mode: "tagged",
      }),
    ).toMatchObject({
      kind: "speak",
      spokenText: "Read this one.",
    });
    expect(prepareVoiceTextForMessage(message({ metadata: { voice: true } }), { ...voiceSettings, mode: "tagged" })).toMatchObject({
      kind: "speak",
    });
  });

  it("handles real TTS bookmark excerpts as dogfood inputs", () => {
    const neuTtsBookmark = [
      "A FEW SECONDS of audio = your voice cloned perfectly.",
      "",
      "And everything running 100% on your phone without internet, without cloud, and without anyone spying on you.",
      "",
      "NeuTTS from Neuphonic is the on-device open-source TTS that:",
      "- Instant voice cloning",
      "- Ultra realistic",
      "- Runs locally",
    ].join("\n");
    const voxtralBookmark = [
      "so I just got pure C inference working for Mistral's Voxtral TTS model",
      "",
      "no pytorch, no python, no dependencies.",
      "",
      "~4400 lines of C that go from text -> speech at 24kHz. 20 voices across 9 languages.",
      "Quote Mistral AI: [Introducing Voxtral TTS](https://x.com/MistralAI/status/example)",
    ].join("\n");

    expect(prepareVoiceTextForMessage(message({ content: neuTtsBookmark }), { ...voiceSettings, maxChars: 500 })).toMatchObject({
      kind: "speak",
      spokenText:
        "A FEW SECONDS of audio = your voice cloned perfectly. And everything running 100% on your phone without internet, without cloud, and without anyone spying on you. NeuTTS from Neuphonic is the on-device open-source TTS that: Instant voice cloning Ultra realistic Runs locally",
    });
    expect(prepareVoiceTextForMessage(message({ content: voxtralBookmark }), { ...voiceSettings, maxChars: 80 })).toMatchObject({
      kind: "summarize",
      sourceText: voxtralBookmark,
    });
  });
});
