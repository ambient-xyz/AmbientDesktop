import type { PromptCacheTelemetry } from "../../shared/threadTypes";

type AssistantMessageStatus = "streaming" | "done" | "error" | "aborted";
type ThinkingMessageStatus = "thinking" | "done" | "error" | "aborted";

export function piAssistantMessageMetadata(
  status: AssistantMessageStatus,
  promptCache?: PromptCacheTelemetry,
): Record<string, unknown> {
  return {
    status,
    runtime: "pi",
    provider: "ambient",
    ...(promptCache ? { promptCache } : {}),
  };
}

export function piThinkingMessageMetadata(
  status: ThinkingMessageStatus,
  promptCache?: PromptCacheTelemetry,
): Record<string, unknown> {
  return {
    status,
    runtime: "pi",
    provider: "ambient",
    kind: "thinking",
    ...(promptCache ? { promptCache } : {}),
  };
}
