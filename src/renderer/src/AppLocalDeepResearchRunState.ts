import type { ChatMessage } from "../../shared/types";

const LOCAL_DEEP_RESEARCH_RUN_TOOL_NAME = "ambient_local_deep_research_run";

export function activeThreadHasRunningLocalDeepResearch(messages: readonly ChatMessage[] | undefined): boolean {
  return Boolean(messages?.some(isRunningLocalDeepResearchToolMessage));
}

export function isRunningLocalDeepResearchToolMessage(message: Pick<ChatMessage, "role" | "metadata">): boolean {
  if (message.role !== "tool") return false;
  const metadata = recordValue(message.metadata);
  const details = recordValue(metadata?.toolResultDetails);
  const toolName = textValue(metadata?.toolName) ?? textValue(details?.toolName);
  const status = textValue(metadata?.status) ?? textValue(details?.status);
  return toolName === LOCAL_DEEP_RESEARCH_RUN_TOOL_NAME && status === "running";
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
