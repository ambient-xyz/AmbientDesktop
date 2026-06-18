import type { ChatMessage } from "./threadTypes";

export function formatThreadPreview(preview: string): string {
  return preview.replace(/\s+/g, " ").trim().slice(0, 180);
}

export function chooseThreadPreview(
  messages: Array<Pick<ChatMessage, "role" | "content" | "createdAt">>,
): string {
  const nonEmptyMessages = messages
    .filter((message) => message.content.trim())
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const latestNonTool = [...nonEmptyMessages].reverse().find((message) => message.role !== "tool");
  const latestMessage = nonEmptyMessages.at(-1);

  return formatThreadPreview((latestNonTool ?? latestMessage)?.content ?? "");
}
