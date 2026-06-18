import type { ChatMessage } from "../../shared/threadTypes";

export const INTERRUPTED_RUN_MESSAGE = "Run interrupted because the app closed before Ambient finished this turn.";
export const INTERRUPTED_TOOL_MESSAGE = "Tool execution was interrupted before it finished.";

export function isRecoverableMessageMetadata(metadata: Record<string, unknown>): boolean {
  return metadata.status === "streaming" || metadata.status === "running";
}

export function interruptedMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return { ...metadata, status: "interrupted" };
}

export function interruptedMessageContent(content: string, role: ChatMessage["role"], runMessage = INTERRUPTED_RUN_MESSAGE): string {
  const trimmed = content.trim();
  const note = role === "tool" ? INTERRUPTED_TOOL_MESSAGE : runMessage;
  if (!trimmed) return note;
  if (trimmed.includes(note)) return trimmed;
  return `${trimmed}\n\n${note}`;
}
