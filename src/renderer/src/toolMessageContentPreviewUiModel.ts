import type {
  ToolArgumentProgressSnapshot,
  ToolLargeOutputPreview,
  ToolLargeOutputPreviewItem,
  ToolLongformInputPreview,
  ToolLongformInputPreviewItem,
} from "../../shared/threadTypes";
import { booleanField, numberField, parseDelimitedNumber, pathField, recordValue, textField } from "./toolMessageMetadataFields";

export type ToolMessageSection = { title: string; content: string };

export type ToolLargeOutputPreviewRow = {
  key: string;
  label: string;
  charsLabel: string;
  previewCharsLabel?: string;
  bytesLabel?: string;
  artifactPath?: string;
  suggestedToolsLabel?: string;
};

export type ToolLargeOutputPreviewViewData = {
  title: "Output";
  summary: string;
  rows: ToolLargeOutputPreviewRow[];
};

export function toolLargeOutputPreviewViewModel(preview: ToolLargeOutputPreview): ToolLargeOutputPreviewViewData {
  return {
    title: "Output",
    summary: preview.summary,
    rows: preview.items.map((item, index) => ({
      key: `${item.label}-${item.artifactPath ?? index}`,
      label: item.label,
      charsLabel: `${item.chars.toLocaleString()} chars${item.truncated ? " total" : ""}`,
      ...(item.truncated && item.previewChars < item.chars ? { previewCharsLabel: `${item.previewChars.toLocaleString()} preview` } : {}),
      ...(item.artifactBytes !== undefined ? { bytesLabel: `${item.artifactBytes.toLocaleString()} bytes` } : {}),
      ...(item.artifactPath ? { artifactPath: item.artifactPath } : {}),
      ...(item.artifactPath && item.suggestedTools?.length
        ? { suggestedToolsLabel: `Use ${item.suggestedTools.join(" or ")} for exact text or summarization.` }
        : {}),
    })),
  };
}

export function toolLongformInputPreviewDisplaySummary(preview: ToolLongformInputPreview): string {
  if (isSingleFileWriteLongformPreview(preview)) {
    return preview.items[0]?.path ?? "content";
  }
  return preview.summary;
}

export function toolInputPreview(
  input: string,
  inputTitle: string,
  longformInputPreview?: ToolLongformInputPreview,
  toolName?: string,
): string {
  if (longformInputPreview) return toolLongformInputPreviewDisplaySummary(longformInputPreview);
  const firstLine = input.split("\n").find((line) => line.trim());
  if (!firstLine) return "";
  const trimmed = firstLine.trim();
  if (inputTitle === "Command") return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
  const compact = compactJsonInputPreview(input, toolName) ?? trimmed;
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
}

export function toolResultPreview(output: string, largeOutputPreview?: ToolLargeOutputPreview): string {
  if (largeOutputPreview) return largeOutputPreview.summary;
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(Input|Command|Result)$/.test(line));
  const preview = lines.find((line) => !line.startsWith("{") && !line.startsWith("}")) ?? lines[0] ?? "";
  return preview.length > 140 ? `${preview.slice(0, 137)}...` : preview;
}

export function summaryLine(value: string): string {
  const line =
    value
      .split(/\r?\n/)
      .find((item) => item.trim())
      ?.trim() ?? "";
  return line.length > 140 ? `${line.slice(0, 137)}...` : line;
}

export function parseToolSections(output: string): ToolMessageSection[] {
  const sections: ToolMessageSection[] = [];
  const pattern = /(?:^|\n\n)(Input|Command|Result)\n([\s\S]*?)(?=\n\n(?:Input|Command|Result)\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(output))) {
    sections.push({ title: match[1], content: match[2] ?? "" });
  }
  if (sections.length === 0 && output.trim()) sections.push({ title: "Result", content: output.trim() });
  return sections;
}

export function toolInputTitleForName(name: string): string {
  return name.toLowerCase() === "bash" || name.toLowerCase() === "shell" ? "Command" : "Input";
}

export function toolArgumentProgressFromMetadata(value: unknown): ToolArgumentProgressSnapshot | undefined {
  const record = recordValue(value);
  const uiStatus = textField(record, ["uiStatus"]);
  const toolCallId = textField(record, ["toolCallId"]);
  const toolName = textField(record, ["toolName"]);
  const phase = textField(record, ["phase"]);
  if (!record || !uiStatus || !toolCallId || !toolName || !phase) return undefined;
  return record as unknown as ToolArgumentProgressSnapshot;
}

export function toolLongformInputPreviewFromMetadata(value: unknown): ToolLongformInputPreview | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "longform-input") return undefined;
  const summary = textField(record, ["summary"]);
  const rawItems = Array.isArray(record.items) ? record.items : [];
  const items = rawItems.flatMap((item): ToolLongformInputPreviewItem[] => {
    const itemRecord = recordValue(item);
    const label = textField(itemRecord, ["label"]);
    const fieldPath = textField(itemRecord, ["fieldPath"]);
    const preview = textField(itemRecord, ["preview"]);
    const chars = numberField(itemRecord, ["chars"]);
    if (!label || !fieldPath || preview === undefined || chars === undefined) return [];
    const path = pathField(itemRecord, ["path"]);
    const language = textField(itemRecord, ["language"]);
    const note = textField(itemRecord, ["note"]);
    return [
      {
        label,
        fieldPath,
        ...(path ? { path } : {}),
        ...(language ? { language } : {}),
        preview,
        chars,
        truncated: itemRecord?.truncated === true,
        ...(note ? { note } : {}),
      },
    ];
  });
  if (!summary || items.length === 0) return undefined;
  const title = textField(record, ["title"]);
  const runningTitle = textField(record, ["runningTitle"]);
  return {
    kind: "longform-input",
    ...(title ? { title } : {}),
    ...(runningTitle ? { runningTitle } : {}),
    summary,
    items,
  };
}

export function toolLargeOutputPreviewFromMetadata(value: unknown): ToolLargeOutputPreview | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "large-output") return undefined;
  const summary = textField(record, ["summary"]);
  const rawItems = Array.isArray(record.items) ? record.items : [];
  const items = rawItems.flatMap((item): ToolLargeOutputPreviewItem[] => {
    const itemRecord = recordValue(item);
    const label = textField(itemRecord, ["label"]);
    const chars = numberField(itemRecord, ["chars"]);
    const previewChars = numberField(itemRecord, ["previewChars"]);
    if (!label || chars === undefined || previewChars === undefined) return [];
    const artifactPath = pathField(itemRecord, ["artifactPath"]);
    const artifactBytes = numberField(itemRecord, ["artifactBytes"]);
    const suggestedTools = Array.isArray(itemRecord?.suggestedTools)
      ? itemRecord.suggestedTools.filter((tool): tool is string => typeof tool === "string" && Boolean(tool.trim()))
      : undefined;
    return [
      {
        label,
        chars,
        previewChars,
        truncated: itemRecord?.truncated === true,
        ...(artifactPath ? { artifactPath } : {}),
        ...(artifactBytes !== undefined ? { artifactBytes } : {}),
        ...(suggestedTools?.length ? { suggestedTools } : {}),
      },
    ];
  });
  if (!summary || items.length === 0) return undefined;
  return {
    kind: "large-output",
    summary,
    items,
  };
}

export function largeOutputPreviewFromResult(result: string): ToolLargeOutputPreview | undefined {
  const noticePattern =
    /^\[truncated\]\s+(.+?) preview is ([\d,]+) of ([\d,]+) chars(?:,\s+([\d,]+) bytes)?\.\nFull output saved at:\s+([^\n]+)$/gm;
  const items = [...result.matchAll(noticePattern)].flatMap((match): ToolLargeOutputPreviewItem[] => {
    const label = match[1]?.trim();
    const previewChars = parseDelimitedNumber(match[2]);
    const chars = parseDelimitedNumber(match[3]);
    const artifactBytes = parseDelimitedNumber(match[4]);
    const artifactPath = match[5]?.trim();
    if (!label || chars === undefined || previewChars === undefined || !artifactPath) return [];
    return [
      {
        label,
        chars,
        previewChars,
        truncated: true,
        artifactPath,
        ...(artifactBytes !== undefined ? { artifactBytes } : {}),
        suggestedTools: ["file_read", "long_context_process"],
      },
    ];
  });
  if (!items.length) return undefined;
  return largeOutputPreviewFromItems(items);
}

export function stripMaterializedTextNotices(result: string): string {
  return result
    .replace(
      /^\[truncated\]\s+.+? preview is [\d,]+ of [\d,]+ chars(?:,\s+[\d,]+ bytes)?\.\nFull output saved at:\s+[^\n]+(?:\nUse file_read for exact text, or long_context_process for summarization\/querying when the output is too large for direct context\.)?/gm,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseToolJsonInput(input: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function isSingleFileWriteLongformPreview(preview: ToolLongformInputPreview): boolean {
  if (preview.items.length !== 1) return false;
  const item = preview.items[0];
  if (!item || item.label !== "File" || item.fieldPath !== "content") return false;
  if (preview.title !== "Input") return false;
  return preview.runningTitle === "Writing" || preview.runningTitle === "Writing file";
}

function compactJsonInputPreview(input: string, toolName?: string): string | undefined {
  const args = parseToolJsonInput(input);
  if (!args) return undefined;
  const workflowPreview = compactAmbientWorkflowsInputPreview(toolName, args);
  if (workflowPreview) return workflowPreview;
  const parts = [
    textField(args, ["packageName", "package_name"]),
    pathField(args, ["path", "filePath", "file_path", "file", "targetPath", "target_path"]),
    textField(args, ["query", "url", "command", "cmd", "reason"]),
  ].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  const keys = Object.keys(args).slice(0, 4);
  return keys.length ? `{ ${keys.join(", ")} }` : undefined;
}

function compactAmbientWorkflowsInputPreview(toolName: string | undefined, args: Record<string, unknown>): string | undefined {
  const normalized = toolName?.toLowerCase();
  if (!normalized?.startsWith("ambient_workflows_")) return undefined;
  const id = textField(args, ["id"]);
  const query = textField(args, ["query"]);
  const title = textField(args, ["title"]);
  const baseVersion = numberField(args, ["baseVersion", "base_version"]);
  const version = numberField(args, ["version"]);
  const draft = recordValue(args.draft);
  const intent = textField(draft, ["intent"]);
  const reason = textField(args, ["reason"]);
  const limit = numberField(args, ["limit"]);
  const includeArchived = booleanField(args, ["includeArchived", "include_archived"]);
  const includeMarkdown = booleanField(args, ["includeMarkdown", "include_markdown"]);

  if (normalized === "ambient_workflows_search") {
    return [
      query ? `query: ${query}` : undefined,
      limit !== undefined ? `limit ${limit}` : undefined,
      includeArchived ? "include archived" : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (normalized === "ambient_workflows_update") {
    return [title ?? intent ?? id, baseVersion !== undefined ? `base v${baseVersion}` : undefined, draft ? "draft update" : undefined]
      .filter(Boolean)
      .join(" · ");
  }

  if (normalized === "ambient_workflows_archive") {
    return [id, baseVersion !== undefined ? `base v${baseVersion}` : undefined, reason].filter(Boolean).join(" · ");
  }

  if (normalized === "ambient_workflows_unarchive") {
    return [id, baseVersion !== undefined ? `base v${baseVersion}` : undefined].filter(Boolean).join(" · ");
  }

  if (normalized === "ambient_workflows_restore_version") {
    return [id, version !== undefined ? `restore v${version}` : undefined].filter(Boolean).join(" · ");
  }

  if (normalized === "ambient_workflows_describe" || normalized === "ambient_workflows_inject") {
    return [id, version !== undefined ? `v${version}` : undefined, includeMarkdown ? "include markdown" : undefined]
      .filter(Boolean)
      .join(" · ");
  }

  return undefined;
}

function largeOutputPreviewFromItems(items: ToolLargeOutputPreviewItem[]): ToolLargeOutputPreview | undefined {
  if (!items.length) return undefined;
  const totalChars = items.reduce((sum, item) => sum + item.chars, 0);
  const artifactCount = items.filter((item) => item.artifactPath).length;
  const first = items[0];
  const summary =
    items.length === 1
      ? [
          first.label,
          `${first.chars.toLocaleString()} chars`,
          first.truncated && first.previewChars < first.chars ? `${first.previewChars.toLocaleString()} preview` : undefined,
          first.artifactPath ? `full output: ${first.artifactPath}` : undefined,
        ]
          .filter(Boolean)
          .join(" · ")
      : [
          `${items.length.toLocaleString()} outputs`,
          `${totalChars.toLocaleString()} chars`,
          artifactCount ? `${artifactCount.toLocaleString()} ${artifactCount === 1 ? "artifact" : "artifacts"}` : undefined,
        ]
          .filter(Boolean)
          .join(" · ");
  return { kind: "large-output", summary, items };
}
