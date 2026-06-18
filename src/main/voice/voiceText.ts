import type { VoiceLongReplyBehavior, VoiceSettings } from "../../shared/localRuntimeTypes";
import type { ChatMessage } from "../../shared/threadTypes";

export type VoiceTextSkipReason =
  | "voice-disabled"
  | "voice-off"
  | "not-assistant-message"
  | "tag-required"
  | "empty-message"
  | "empty-after-cleanup"
  | "long-reply-skip"
  | "long-reply-ask";

export type VoiceTextDecision =
  | {
      kind: "speak";
      source: "assistant-text";
      sourceMessageId: string;
      sourceText: string;
      spokenText: string;
      sourceTextChars: number;
      spokenTextChars: number;
    }
  | {
      kind: "summarize";
      source: "summary";
      sourceMessageId: string;
      sourceText: string;
      sourceTextChars: number;
      maxChars: number;
    }
  | {
      kind: "skip";
      reason: VoiceTextSkipReason;
      sourceMessageId: string;
      sourceTextChars: number;
      spokenTextChars: number;
      longReply?: VoiceLongReplyBehavior;
    };

const VOICE_TAG_PATTERN = /(?:<!--\s*ambient:voice\s*-->|^\s*\[voice\]\s*)/i;

export function prepareVoiceTextForMessage(message: ChatMessage, settings: VoiceSettings): VoiceTextDecision {
  if (!settings.enabled) return skip(message, "voice-disabled");
  if (settings.mode === "off") return skip(message, "voice-off");
  if (message.role !== "assistant") return skip(message, "not-assistant-message");
  if (settings.mode === "tagged" && !messageHasVoiceTag(message)) return skip(message, "tag-required");
  if (!message.content.trim()) return skip(message, "empty-message");

  const spokenText = cleanAssistantTextForVoice(message.content);
  if (!spokenText) return skip(message, "empty-after-cleanup");

  const sourceTextChars = countChars(message.content);
  const spokenTextChars = countChars(spokenText);
  if (spokenTextChars <= settings.maxChars) {
    return {
      kind: "speak",
      source: "assistant-text",
      sourceMessageId: message.id,
      sourceText: message.content,
      spokenText,
      sourceTextChars,
      spokenTextChars,
    };
  }

  if (settings.longReply === "summarize") {
    return {
      kind: "summarize",
      source: "summary",
      sourceMessageId: message.id,
      sourceText: message.content,
      sourceTextChars,
      maxChars: settings.maxChars,
    };
  }

  return skip(message, settings.longReply === "ask" ? "long-reply-ask" : "long-reply-skip", {
    spokenTextChars,
    longReply: settings.longReply,
  });
}

export function cleanAssistantTextForVoice(content: string): string {
  const withoutCodeBlocks = content
    .replace(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?>/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const lines = withoutCodeBlocks
    .split(/\r?\n/)
    .filter((line) => !isMarkdownTableSeparator(line))
    .map(cleanVoiceLine)
    .filter(Boolean);

  return normalizeVoiceWhitespace(lines.join(" "));
}

function cleanVoiceLine(line: string): string {
  return line
    .replace(/^\s{0,3}#{1,6}\s+/g, "")
    .replace(/^\s{0,3}>\s?/g, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/g, "")
    .replace(/^\s*[-*+]\s+/g, "")
    .replace(/^\s*\d+[.)]\s+/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMarkdownTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function normalizeVoiceWhitespace(text: string): string {
  return text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.!?]){3,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function messageHasVoiceTag(message: ChatMessage): boolean {
  if (message.metadata?.voice === true) return true;
  return VOICE_TAG_PATTERN.test(message.content);
}

function skip(
  message: ChatMessage,
  reason: VoiceTextSkipReason,
  extra: { spokenTextChars?: number; longReply?: VoiceLongReplyBehavior } = {},
): VoiceTextDecision {
  return {
    kind: "skip",
    reason,
    sourceMessageId: message.id,
    sourceTextChars: countChars(message.content),
    spokenTextChars: extra.spokenTextChars ?? 0,
    ...(extra.longReply ? { longReply: extra.longReply } : {}),
  };
}

function countChars(value: string): number {
  return [...value].length;
}
