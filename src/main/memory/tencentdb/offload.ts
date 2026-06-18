import type { ChatMessage, ToolLargeOutputPreview, ToolLargeOutputPreviewItem } from "../../../shared/threadTypes";

const DEFAULT_MAX_ENTRIES = 5;
const DEFAULT_MAX_CONTEXT_CHARS = 4_000;
const DISALLOWED_NATIVE_TOOL_NAMES = new Set(["bash", "read"]);

export interface AmbientTencentMemoryOffloadEntry {
  id: string;
  sourceMessageId: string;
  toolName: string;
  label: string;
  chars: number;
  previewChars: number;
  artifactPath: string;
  artifactKind?: ToolLargeOutputPreviewItem["artifactKind"];
  artifactBytes?: number;
  suggestedTools: string[];
}

export interface AmbientTencentMemoryOffloadContext {
  text: string;
  entries: AmbientTencentMemoryOffloadEntry[];
  truncated: boolean;
}

export interface BuildAmbientTencentMemoryOffloadContextInput {
  messages: readonly ChatMessage[];
  maxEntries?: number;
  maxContextChars?: number;
}

export function buildAmbientTencentMemoryOffloadContext(
  input: BuildAmbientTencentMemoryOffloadContextInput,
): AmbientTencentMemoryOffloadContext | undefined {
  const maxEntries = Math.max(1, Math.min(20, Math.floor(input.maxEntries ?? DEFAULT_MAX_ENTRIES)));
  const entries = ambientTencentMemoryOffloadEntriesFromMessages(input.messages, maxEntries);
  if (!entries.length) return undefined;
  const fullText = formatAmbientTencentMemoryMmdContext(entries);
  const maxContextChars = Math.max(800, Math.floor(input.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS));
  const text = fullText.length <= maxContextChars
    ? fullText
    : `${fullText.slice(0, Math.max(0, maxContextChars - "</ambient_memory_short_term_offload>".length - 16))}\n[truncated]\n</ambient_memory_short_term_offload>`;
  return {
    text,
    entries,
    truncated: text.length < fullText.length,
  };
}

export function ambientTencentMemoryOffloadEntriesFromMessages(
  messages: readonly ChatMessage[],
  maxEntries = DEFAULT_MAX_ENTRIES,
): AmbientTencentMemoryOffloadEntry[] {
  const entries: AmbientTencentMemoryOffloadEntry[] = [];
  for (const message of [...messages].reverse()) {
    if (message.role !== "tool") continue;
    const toolName = stringValue(message.metadata?.toolName) ?? "tool";
    if (DISALLOWED_NATIVE_TOOL_NAMES.has(toolName)) continue;
    const preview = largeOutputPreviewValue(recordValue(message.metadata?.toolResultDetails).largeOutputPreview);
    if (!preview) continue;
    for (const item of preview.items) {
      if (entries.length >= maxEntries) return entries;
      if (!item.artifactPath || !shouldOffloadItem(item)) continue;
      entries.push({
        id: `${message.id}:${entries.length + 1}`,
        sourceMessageId: message.id,
        toolName,
        label: item.label,
        chars: item.chars,
        previewChars: item.previewChars,
        artifactPath: item.artifactPath,
        ...(item.artifactKind ? { artifactKind: item.artifactKind } : {}),
        ...(item.artifactBytes !== undefined ? { artifactBytes: item.artifactBytes } : {}),
        suggestedTools: item.suggestedTools?.length ? item.suggestedTools : ["file_read", "long_context_process"],
      });
    }
  }
  return entries;
}

function formatAmbientTencentMemoryMmdContext(entries: AmbientTencentMemoryOffloadEntry[]): string {
  const lines = [
    "<ambient_memory_short_term_offload>",
    "Source: TencentDB Agent Memory short-term offload (experimental)",
    "The entries below are symbolic context for recent large tool outputs. Exact output remains available through the listed local artifacts.",
    "```mermaid",
    "flowchart TD",
    "  CurrentTask[\"Current task\"]",
  ];
  entries.forEach((entry, index) => {
    const nodeId = `Output${index + 1}`;
    lines.push(`  CurrentTask --> ${nodeId}["${mermaidLabel(entry)}"]`);
  });
  lines.push("```");
  lines.push("Recent large-output artifacts:");
  entries.forEach((entry, index) => {
    lines.push(`${index + 1}. ${entry.toolName} ${entry.label}: ${formatNumber(entry.chars)} chars, ${formatNumber(entry.previewChars)} preview chars, artifact ${entry.artifactPath}. Use ${entry.suggestedTools.join(" or ")} for exact text or targeted summarization.`);
  });
  lines.push("</ambient_memory_short_term_offload>");
  return lines.join("\n");
}

function mermaidLabel(entry: AmbientTencentMemoryOffloadEntry): string {
  return escapeMermaidLabel([
    entry.toolName,
    entry.label,
    `${formatNumber(entry.chars)} chars`,
    entry.artifactPath,
  ].join("\\n"));
}

function shouldOffloadItem(item: ToolLargeOutputPreviewItem): boolean {
  return Boolean(item.truncated || item.previewChars < item.chars || item.artifactBytes);
}

function largeOutputPreviewValue(value: unknown): ToolLargeOutputPreview | undefined {
  const record = recordValue(value);
  if (record.kind !== "large-output" || !Array.isArray(record.items)) return undefined;
  const items = record.items.flatMap((item) => {
    const parsed = largeOutputPreviewItemValue(item);
    return parsed ? [parsed] : [];
  });
  return items.length ? { kind: "large-output", summary: stringValue(record.summary) ?? "large output", items } : undefined;
}

function largeOutputPreviewItemValue(value: unknown): ToolLargeOutputPreviewItem | undefined {
  const record = recordValue(value);
  const label = stringValue(record.label);
  const chars = nonNegativeInteger(record.chars);
  const previewChars = nonNegativeInteger(record.previewChars);
  const artifactPath = stringValue(record.artifactPath);
  if (!label || chars === undefined || previewChars === undefined || !artifactPath) return undefined;
  const artifactBytes = nonNegativeInteger(record.artifactBytes);
  return {
    label,
    chars,
    previewChars,
    truncated: record.truncated === true,
    ...(artifactPath ? { artifactPath } : {}),
    ...(artifactKindValue(record.artifactKind) ? { artifactKind: artifactKindValue(record.artifactKind) } : {}),
    ...(artifactBytes !== undefined ? { artifactBytes } : {}),
    suggestedTools: stringArrayValue(record.suggestedTools),
  };
}

function artifactKindValue(value: unknown): ToolLargeOutputPreviewItem["artifactKind"] | undefined {
  return value === "tool-output" || value === "stdout" || value === "stderr" || value === "long-log" || value === "external-model-response"
    ? value
    : undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => stringValue(item) ? [stringValue(item)!] : []).slice(0, 4) : [];
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/["<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}
