import type { ChatMessage } from "../../shared/threadTypes";
import type { SubagentForkMode } from "../../shared/subagentProtocol";
import type { SubagentInheritedContextItem, SubagentStrippedContextRef } from "./subagentPromptRuntime";

export function subagentParentContextForMessages(
  messages: readonly Pick<ChatMessage, "id" | "role" | "content" | "metadata">[],
  forkMode: SubagentForkMode,
): { inherited: SubagentInheritedContextItem[]; stripped: SubagentStrippedContextRef[] } {
  const inheritedCandidates: SubagentInheritedContextItem[] = [];
  const stripped: SubagentStrippedContextRef[] = [];
  for (const message of messages) {
    const content = message.content.trim();
    if (!content) continue;
    const base = {
      sourceMessageId: message.id,
      role: message.role,
    };
    if (message.role === "tool") {
      stripped.push({ ...base, reason: "tool_message" });
      continue;
    }
    if (isSubagentParentOnlyContextMessage(message)) {
      stripped.push({ ...base, reason: "parent_only_subagent_control" });
      continue;
    }
    if (message.role !== "user" && message.role !== "assistant" && message.role !== "system") {
      stripped.push({ ...base, reason: "unsupported_message_role" });
      continue;
    }
    inheritedCandidates.push({
      ...base,
      contentPreview: previewForSubagentContext(content, 1000),
    });
  }

  if (forkMode === "no_history") {
    return {
      inherited: [],
      stripped: [
        ...stripped,
        ...inheritedCandidates.map((item) => ({
          sourceMessageId: item.sourceMessageId,
          role: item.role,
          reason: "fork_mode_no_history",
        })),
      ],
    };
  }

  const limit = forkMode === "full_history" ? 20 : 6;
  const inherited = inheritedCandidates.slice(-limit);
  const inheritedIds = new Set(inherited.map((item) => item.sourceMessageId));
  return {
    inherited,
    stripped: [
      ...stripped,
      ...inheritedCandidates
        .filter((item) => !inheritedIds.has(item.sourceMessageId))
        .map((item) => ({
          sourceMessageId: item.sourceMessageId,
          role: item.role,
          reason: forkMode === "full_history" ? "bounded_full_history_context" : "outside_recent_context_window",
        })),
    ],
  };
}

export function isSubagentParentOnlyContextMessage(
  message: Pick<ChatMessage, "metadata">,
): boolean {
  const metadata = message.metadata ?? {};
  return metadata.toolName === "ambient_subagent" ||
    metadata.runtime === "ambient-subagents" ||
    typeof metadata.subagentRunId === "string" ||
    typeof metadata.canonicalTaskPath === "string" ||
    (typeof metadata.resultArtifact === "object" && metadata.resultArtifact !== null);
}

function previewForSubagentContext(text: string, limit: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}
