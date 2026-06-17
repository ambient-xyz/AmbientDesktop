type RuntimeMessageContentSnapshot = {
  id: string;
  content: string;
};

export function runtimeMessageContentOrFallback(
  messages: readonly RuntimeMessageContentSnapshot[],
  messageId: string | undefined,
  fallbackContent: string,
): string {
  const storedContent = messageId ? messages.find((message) => message.id === messageId)?.content : undefined;
  return storedContent || fallbackContent;
}
