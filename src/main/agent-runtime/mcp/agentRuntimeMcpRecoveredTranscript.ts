import type { ChatMessage } from "../../../shared/types";
import { AMBIENT_DIRECT_MCP_TOOL_BRIDGE_NAMES } from "../../ambient/ambientToolRouter";

const MCP_RECOVERY_TRANSCRIPT_PATTERN =
  /\b(?:ambient_mcp_tool_(?:search|describe|call|review_accept|policy_update)|ambient_mcp_(?:standard_import|remote_proxy|guided_bridge)_(?:describe|install|register)|MCP tool [^\n]+ completed|ToolHive workload|MCP server [^\n]+ is ready|custom-image candidate ref)\b/i;

export function ambientMcpBridgeActiveToolNamesForRecoveredTranscript(
  messages: readonly Pick<ChatMessage, "role" | "content">[],
): string[] {
  const transcriptText = messages
    .map((message) => `${message.role}\n${message.content}`)
    .join("\n")
    .slice(-80_000);
  if (!transcriptText) return [];
  if (!MCP_RECOVERY_TRANSCRIPT_PATTERN.test(transcriptText)) return [];
  return [...AMBIENT_DIRECT_MCP_TOOL_BRIDGE_NAMES];
}
