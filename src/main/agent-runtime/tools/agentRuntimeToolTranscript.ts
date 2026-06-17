import type {
  ChatMessage,
  PermissionMode,
  ToolArgumentProgressSnapshot,
  ToolEventDetails,
} from "../../../shared/types";
import {
  normalizeWorkspaceArtifactPath,
  parseToolJsonInput,
  stringField,
} from "../agentRuntimeMediaArtifacts";

export function subagentMutationCategoryForChildTool(toolName: string): string | undefined {
  const normalized = toolName.trim().toLowerCase();
  if (["write", "edit", "bash", "shell"].includes(normalized)) return "workspace.write";
  if (normalized === "ambient_mcp_tool_call" || normalized.startsWith("mcp_")) return "mcp.direct";
  if (normalized.startsWith("browser_") && !["browser_content", "browser_screenshot", "browser_search"].includes(normalized)) {
    return "browser.interactive";
  }
  if (normalized.includes("file_write") || normalized.includes("file_edit")) return "workspace.write";
  if (normalized.includes("connector_write")) return "connector.write";
  return undefined;
}

export function subagentToolInputPathFromMessage(
  message: ChatMessage,
  toolName: string,
  workspacePath: string,
): string | undefined {
  const input = toolInputTranscriptSection(message.content, toolName);
  const parsed = input ? parseToolJsonInput(input) : undefined;
  return normalizeWorkspaceArtifactPath(
    stringField(parsed, ["path", "filePath", "targetPath", "outputPath", "artifactPath"]),
    workspacePath,
  );
}

export function toolInputTranscriptSection(content: unknown, toolName: string): string | undefined {
  if (typeof content !== "string") return undefined;
  const marker = `${toolInputSectionTitle(toolName)}\n`;
  const start = content.indexOf(marker);
  if (start < 0) return undefined;
  const section = content.slice(start + marker.length);
  const resultStart = section.search(/\n\nResult\n/);
  return (resultStart >= 0 ? section.slice(0, resultStart) : section).trim();
}

export function chatToolEventDetails(
  details: Record<string, string> | undefined,
  permissionMode: PermissionMode,
  result: NonNullable<ToolEventDetails["result"]>,
  fallbackToolName: string,
  argumentProgress?: ToolArgumentProgressSnapshot,
): ToolEventDetails {
  const normalized: ToolEventDetails = {
    source: details?.source === "plugin-mcp" ? "plugin-mcp" : "pi-builtin",
    runtime: "chat",
    permissionMode,
    pluginId: details?.pluginId,
    pluginName: details?.pluginName,
    serverName: details?.serverName,
    toolName: details?.toolName ?? fallbackToolName,
    registeredName: details?.registeredName,
    result,
    toolPhase: argumentProgress?.phase,
    toolArgumentProgress: argumentProgress,
  };
  const compact = Object.fromEntries(Object.entries(normalized).filter(([, value]) => Boolean(value))) as ToolEventDetails;
  return compact;
}

export function toolEventLabel(fallback: string, details: ToolEventDetails | undefined): string {
  if (details?.pluginName && details.toolName) return `${details.pluginName}: ${details.toolName}`;
  return fallback;
}

export function formatToolTranscript(label: string, statusLabel: string, input: string, result = ""): string {
  const sections = [`${label} ${statusLabel}`];
  const trimmedInput = input.trim();
  const trimmedResult = result.trim();
  if (trimmedInput) sections.push(`${toolInputSectionTitle(label)}\n${trimmedInput}`);
  if (trimmedResult) sections.push(`Result\n${trimmedResult}`);
  return sections.join("\n\n");
}

export function toolInputSectionTitle(label: string): string {
  return label.toLowerCase() === "bash" || label.toLowerCase() === "shell" ? "Command" : "Input";
}
