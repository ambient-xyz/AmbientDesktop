import type { ThinkingDisplayMode, ThinkingDisplaySettings } from "../../shared/desktopTypes";
import type { ChatMessage, ThinkingLevel } from "../../shared/threadTypes";
import { isHiddenTranscriptMessage } from "../../shared/threadPreview";

export type ThinkingDisplayRunActivityLine = {
  id: string;
  text: string;
  kind: "state" | "thinking" | "tool" | "heartbeat" | "error";
  timestamp: number;
};

export const thinkingOptions: ThinkingLevel[] = ["minimal", "low", "medium", "high", "xhigh"];

export function thinkingLevelLabel(option: ThinkingLevel): string {
  return option === "xhigh" ? "Extra High" : option[0].toUpperCase() + option.slice(1);
}

export function thinkingDisplayModeLabel(mode: ThinkingDisplayMode): string {
  if (mode === "off") return "Off";
  if (mode === "full") return "Full";
  return "Transient";
}

export function isThinkingMessageForDisplay(message: Pick<ChatMessage, "role" | "metadata">): boolean {
  return message.role === "assistant" && message.metadata?.kind === "thinking";
}

export function visibleMessagesForThinkingDisplay<T extends ChatMessage>(
  messages: readonly T[],
  mode: ThinkingDisplayMode,
): T[] {
  return messages.filter((message) => {
    const content = renderableMessageContentForDisplay(message);
    if (isHiddenTranscriptMessage(message)) return false;
    if (isThinkingMessageForDisplay(message)) return mode === "full" && (Boolean(content) || messageStatus(message) === "thinking");
    if (message.role === "assistant" && !content) return false;
    return true;
  });
}

export function visibleRunActivityLinesForThinkingDisplay<T extends ThinkingDisplayRunActivityLine>(
  lines: readonly T[],
  mode: ThinkingDisplayMode,
): T[] {
  if (mode === "full") return [...lines];
  return lines.filter((line) => line.kind !== "thinking");
}

export function transientThinkingActivityLinesForDisplay<T extends ThinkingDisplayRunActivityLine>(input: {
  lines: readonly T[];
  messages: readonly ChatMessage[];
  mode: ThinkingDisplayMode;
  running: boolean;
}): T[] {
  if (input.mode !== "transient" || !input.running || !hasActiveThinkingMessage(input.messages)) return [];
  return input.lines.filter((line) => line.kind === "thinking");
}

export function shouldShowRunStatusCard(
  settings: Pick<ThinkingDisplaySettings, "showRunStatusCard"> | undefined,
  running: boolean,
): boolean {
  return Boolean(running && settings?.showRunStatusCard);
}

export function visibleTextMatchCountForThinkingDisplay(input: {
  messages: readonly ChatMessage[];
  mode: ThinkingDisplayMode;
  query: string;
}): number {
  const needle = input.query.trim().toLowerCase();
  if (!needle) return 0;
  return visibleMessagesForThinkingDisplay(input.messages, input.mode).reduce((count, message) => {
    const haystack = message.content.toLowerCase();
    let cursor = haystack.indexOf(needle);
    let matches = 0;
    while (cursor !== -1) {
      matches += 1;
      cursor = haystack.indexOf(needle, cursor + needle.length);
    }
    return count + matches;
  }, 0);
}

function hasActiveThinkingMessage(messages: readonly ChatMessage[]): boolean {
  return [...messages].reverse().some((message) => isThinkingMessageForDisplay(message) && messageStatus(message) === "thinking");
}

function renderableMessageContentForDisplay(message: Pick<ChatMessage, "content">): string {
  return message.content.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

function messageStatus(message: Pick<ChatMessage, "metadata">): string | undefined {
  return typeof message.metadata?.status === "string" ? message.metadata.status : undefined;
}
