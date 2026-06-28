import type { ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { ChatMessage, RunStatus } from "../../shared/threadTypes";
import { isHiddenTranscriptMessage } from "../../shared/threadPreview";
import type { WorkspaceContextReference } from "../../shared/workspaceTypes";
import type { RunActivityLine } from "./AppRunActivity";
import { isThinkingMessageForDisplay, visibleMessagesForThinkingDisplay } from "./thinkingDisplayUiModel";

const MESSAGE_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function messageStatus(message: ChatMessage): string | undefined {
  return typeof message.metadata?.status === "string" ? message.metadata.status : undefined;
}

export function visibleMessages(messages: ChatMessage[], _running: boolean, thinkingDisplayMode: ThinkingDisplayMode): ChatMessage[] {
  return visibleMessagesForThinkingDisplay(messages, thinkingDisplayMode);
}

export function retryableFailedPromptIds(messages: ChatMessage[]): Set<string> {
  const visible = messages.filter((message) => message.role !== "tool" && !isThinkingMessage(message));
  const latest = visible.at(-1);
  if (!latest || latest.role !== "assistant" || messageStatus(latest) !== "error") return new Set();
  if (assistantErrorBlocksWholePromptReplay(latest)) return new Set();
  const latestIndex = messages.findIndex((message) => message.id === latest.id);
  const user = messages
    .slice(0, latestIndex)
    .reverse()
    .find((message) => message.role === "user" && !isHiddenTranscriptMessage(message) && message.content.trim());
  return user ? new Set([user.id]) : new Set();
}

function assistantErrorBlocksWholePromptReplay(message: ChatMessage): boolean {
  const diagnostic = providerInterruptionDiagnosticMetadata(message);
  if (!diagnostic) return false;
  if (diagnostic.retryScheduled === true || diagnostic.replaySafe === true) return false;
  const interruptedToolCalls = Array.isArray(diagnostic.interruptedToolCalls) ? diagnostic.interruptedToolCalls.length : 0;
  return (
    diagnostic.toolCallSeen === true ||
    positiveNumber(diagnostic.toolMessageCount) ||
    positiveNumber(diagnostic.completedToolMessageCount) ||
    interruptedToolCalls > 0
  );
}

function providerInterruptionDiagnosticMetadata(message: ChatMessage): Record<string, unknown> | undefined {
  const metadata = message.metadata?.piStreamInterruption ?? message.metadata?.piStreamTimeout;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : undefined;
}

function positiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function countTextMatches(text: string, query: string): number {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;
  let count = 0;
  const haystack = text.toLowerCase();
  let cursor = haystack.indexOf(needle);
  while (cursor !== -1) {
    count += 1;
    cursor = haystack.indexOf(needle, cursor + needle.length);
  }
  return count;
}

export function messageIsStreaming(message: ChatMessage, messages: ChatMessage[], running: boolean): boolean {
  if (!running) return false;
  if (isThinkingMessage(message)) return messageStatus(message) === "thinking";
  if (message.role === "assistant" && messageStatus(message) === "streaming") return true;
  return message.id === streamingAssistantMessageId(messages, running);
}

export function messageIsStreamingForRender(message: ChatMessage, running: boolean, streamingAssistantId?: string): boolean {
  if (!running) return false;
  if (isThinkingMessage(message)) return messageStatus(message) === "thinking";
  if (message.role === "assistant" && messageStatus(message) === "streaming") return true;
  return message.id === streamingAssistantId;
}

export function streamingAssistantMessageId(messages: ChatMessage[], running: boolean): string | undefined {
  if (!running) return undefined;
  return [...messages].reverse().find((message) => message.role === "assistant" && !isThinkingMessage(message) && !message.content.trim())
    ?.id;
}

export function assistantVisibleTextIsStreaming(messages: ChatMessage[], running: boolean): boolean {
  if (!running) return false;
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      !isThinkingMessage(message) &&
      messageStatus(message) === "streaming" &&
      Boolean(renderableMessageContent(message)),
  );
}

export function isThinkingMessage(message: ChatMessage): boolean {
  return isThinkingMessageForDisplay(message);
}

export function messageKindForActivity(message: ChatMessage): "assistant" | "thinking" | "tool" | "user" {
  if (isThinkingMessage(message)) return "thinking";
  if (message.role === "tool") return "tool";
  if (message.role === "assistant") return "assistant";
  return "user";
}

export function renderableMessageContent(message: ChatMessage): string {
  return message.content.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

export function messageStreamingPlaceholder(message: ChatMessage, runActivityLines: RunActivityLine[], runStatus: RunStatus): string {
  if (isThinkingMessage(message)) return "Receiving Ambient reasoning";
  const latest = [...runActivityLines].reverse().find((line) => line.kind !== "heartbeat");
  if (latest) return conciseStreamingActivityText(latest.text);
  if (runStatus === "retrying") return "Retrying provider request";
  if (runStatus === "tool") return "Preparing tool call";
  if (runStatus === "streaming") return "Connected; waiting for visible text";
  if (runStatus === "starting") return "Waiting for Ambient response";
  return "Waiting for Ambient";
}

export function conciseStreamingActivityText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  if (!normalized) return "Waiting for Ambient";
  if (/^Streaming response: 0 output chars\b/i.test(normalized)) return "Connected; waiting for visible text";
  if (/^Streaming response:/i.test(normalized)) return "Streaming response text";
  if (/^Ambient response channel opened/i.test(normalized)) return "Ambient connected; waiting for visible text";
  return normalized.length > 120 ? `${normalized.slice(0, 117).trimEnd()}...` : normalized;
}

export function formatMessageWallClockTime(
  createdAt: string | undefined,
  formatter: Pick<Intl.DateTimeFormat, "format"> = MESSAGE_TIMESTAMP_FORMATTER,
): string | undefined {
  if (!createdAt) return undefined;
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return undefined;
  return formatter.format(date);
}

export function messageMetaLabel(message: ChatMessage): string | undefined {
  const status = message.metadata?.status;
  const delivery = message.metadata?.delivery;
  if (message.role === "user" && status === "queued") {
    return delivery === "follow-up" ? "Queued follow-up" : "Queued steer";
  }
  if (message.role === "user" && status === "sent" && delivery) {
    return delivery === "follow-up" ? "Follow-up sent" : "Steer sent";
  }
  if (message.role === "user" && status === "aborted" && delivery) return "Queue aborted";
  if (message.role === "user" && status === "error" && delivery) return "Queue failed";
  if (message.metadata?.awaitingInputAfterTools === true || status === "awaiting-input") return "Awaiting input";
  if (status === "interrupted") return "Interrupted";
  if (status === "aborted") return "Stopped";
  return undefined;
}

export function contextReferencesFromMetadata(value: unknown): WorkspaceContextReference[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): WorkspaceContextReference | undefined => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      if (typeof record.path !== "string" || typeof record.name !== "string") return undefined;
      if (record.kind !== "file" && record.kind !== "directory") return undefined;
      return {
        path: record.path,
        name: record.name,
        kind: record.kind,
        ...(typeof record.size === "number" ? { size: record.size } : {}),
        ...(record.absolute === true ? { absolute: true } : {}),
      };
    })
    .filter((item): item is WorkspaceContextReference => Boolean(item));
}

export function isSessionContextMissingError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    /model context is not available for this chat/i.test(message) &&
    /pi session file is (missing|unreadable|missing or unreadable)/i.test(message)
  );
}
