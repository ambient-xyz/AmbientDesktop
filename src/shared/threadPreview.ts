import type { ChatMessage } from "./threadTypes";

export function formatThreadPreview(preview: string): string {
  return preview.replace(/\s+/g, " ").trim().slice(0, 180);
}

export function chooseThreadPreview(
  messages: Array<Pick<ChatMessage, "role" | "content" | "createdAt"> & Partial<Pick<ChatMessage, "metadata">>>,
): string {
  const nonEmptyMessages = messages
    .filter((message) => message.content.trim())
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const previewCandidates = nonEmptyMessages.filter((message) => !isAssistantThinkingMessage(message));
  const latestNonTool = [...previewCandidates].reverse().find((message) => message.role !== "tool");
  const latestMessage = previewCandidates.at(-1);

  return formatThreadPreview((latestNonTool ?? latestMessage)?.content ?? "");
}

export function isAssistantThinkingMessage(message: Pick<ChatMessage, "role"> & Partial<Pick<ChatMessage, "metadata">>): boolean {
  return message.role === "assistant" && message.metadata?.kind === "thinking";
}
