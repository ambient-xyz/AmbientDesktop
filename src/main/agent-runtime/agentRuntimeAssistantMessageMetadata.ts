type AssistantMessageStatus = "streaming" | "done" | "error" | "aborted";
type ThinkingMessageStatus = "thinking" | "done" | "error" | "aborted";

export function piAssistantMessageMetadata(status: AssistantMessageStatus): Record<string, unknown> {
  return {
    status,
    runtime: "pi",
    provider: "ambient",
  };
}

export function piThinkingMessageMetadata(status: ThinkingMessageStatus): Record<string, unknown> {
  return {
    status,
    runtime: "pi",
    provider: "ambient",
    kind: "thinking",
  };
}
