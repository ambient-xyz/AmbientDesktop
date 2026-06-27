import type { ToolEditTextPreview, ToolLongformInputPreview, ToolLongformInputPreviewItem } from "../../shared/threadTypes";
import { languageFromPath } from "./toolMessageArtifactUiModel";
import { parseToolJsonInput } from "./toolMessageContentPreviewUiModel";
import {
  booleanField,
  numberField,
  pathField,
  previewTextField,
  recordValue,
  stringArrayField,
  textField,
} from "./toolMessageMetadataFields";

export type ToolWritePreviewData = {
  path?: string;
  content: string;
  language?: string;
};

export type ToolApplyRepairFilePreviewData = {
  path: string;
  content: string;
  charCount: number;
  rationale?: string;
  language?: string;
};

export type ToolApplyRepairPreviewData = {
  packageName?: string;
  reason?: string;
  files: ToolApplyRepairFilePreviewData[];
  totalChars: number;
};

export type ToolEditBlockPreviewData = {
  oldText: string;
  newText: string;
  oldTextChars?: number;
  oldTextTruncated?: boolean;
  oldTextOmittedChars?: number;
  newTextChars?: number;
  newTextTruncated?: boolean;
  newTextOmittedChars?: number;
};

export type ToolEditPreviewData = {
  path?: string;
  edits: ToolEditBlockPreviewData[];
  diff?: string;
  firstChangedLine?: number;
  language?: string;
};

export type ToolInstallRoutePreviewData = {
  lane: string;
  confidence: string;
  reason: string;
  approvalBoundary: string;
  nextTools: string[];
  blockers: string[];
  warnings: string[];
  requiresSecret?: boolean;
  secretMechanism?: string;
  validationKind?: string;
  validationDescription?: string;
};

type ToolEditResultDetails = {
  diff?: string;
  firstChangedLine?: number;
};

export function extractWritePreview(toolName: string, input: string): ToolWritePreviewData | undefined {
  const normalized = toolName.toLowerCase();
  if (normalized !== "write" && normalized !== "file_write") return undefined;
  if (!input.trim()) return undefined;
  const args = parseToolJsonInput(input);
  if (!args) return undefined;
  const path = pathField(args, ["path", "filePath", "file_path", "file", "targetPath", "target_path"]);
  const content = previewTextField(args, ["content", "newContent", "new_content", "replacement", "text"]);
  if (content === undefined) return undefined;
  return {
    ...(path ? { path } : {}),
    content,
    ...(path ? { language: languageFromPath(path) } : {}),
  };
}

export function writeLongformInputPreview(
  toolName: string,
  preview: ToolWritePreviewData | undefined,
): ToolLongformInputPreview | undefined {
  if (!preview) return undefined;
  const normalized = toolName.toLowerCase();
  const item: ToolLongformInputPreviewItem = {
    label: "File",
    fieldPath: "content",
    ...(preview.path ? { path: preview.path } : {}),
    ...(preview.language ? { language: preview.language } : {}),
    preview: preview.content,
    chars: previewContentCharCount(preview.content),
    truncated: /\(\d[\d,]* chars total\)\s*$/.test(preview.content),
  };
  return {
    kind: "longform-input",
    title: "Input",
    runningTitle: normalized === "file_write" ? "Writing file" : "Writing",
    summary: preview.path ?? "content",
    items: [item],
  };
}

export function extractApplyRepairPreview(toolName: string, input: string): ToolApplyRepairPreviewData | undefined {
  if (toolName.toLowerCase() !== "ambient_capability_builder_apply_repair" || !input.trim()) return undefined;
  const args = parseToolJsonInput(input);
  if (!args) return undefined;
  const rawFiles = Array.isArray(args.files) ? args.files : [];
  const files = rawFiles.flatMap((item): ToolApplyRepairFilePreviewData[] => {
    const record = recordValue(item);
    const path = pathField(record, ["path", "filePath", "file_path", "file", "targetPath", "target_path"]);
    const content = previewTextField(record, ["content", "newContent", "new_content", "replacement", "text"]);
    if (!path || content === undefined) return [];
    const rationale = textField(record, ["rationale", "reason"]);
    return [
      {
        path,
        content,
        charCount: previewContentCharCount(content),
        ...(rationale ? { rationale } : {}),
        language: languageFromPath(path),
      },
    ];
  });
  if (files.length === 0) return undefined;
  return {
    ...(textField(args, ["packageName", "package_name"]) ? { packageName: textField(args, ["packageName", "package_name"]) } : {}),
    ...(textField(args, ["reason"]) ? { reason: textField(args, ["reason"]) } : {}),
    files,
    totalChars: files.reduce((sum, file) => sum + file.charCount, 0),
  };
}

export function applyRepairLongformInputPreview(preview: ToolApplyRepairPreviewData | undefined): ToolLongformInputPreview | undefined {
  if (!preview) return undefined;
  const items = preview.files.map(
    (file, index): ToolLongformInputPreviewItem => ({
      label: preview.files.length === 1 ? "File" : `File ${index + 1}`,
      fieldPath: `files[${index}].content`,
      path: file.path,
      ...(file.language ? { language: file.language } : {}),
      preview: file.content,
      chars: file.charCount,
      truncated: /\(\d[\d,]* chars total\)\s*$/.test(file.content),
      ...(file.rationale ? { note: file.rationale } : {}),
    }),
  );
  const fileLabel = `${items.length.toLocaleString()} ${items.length === 1 ? "file" : "files"}`;
  return {
    kind: "longform-input",
    title: "Repair files",
    runningTitle: "Applying repair",
    summary: [preview.packageName, fileLabel, `${preview.totalChars.toLocaleString()} chars`].filter(Boolean).join(" · "),
    items,
  };
}

export function extractEditPreview(toolName: string, input: string, metadata?: Record<string, unknown>): ToolEditPreviewData | undefined {
  if (toolName.toLowerCase() !== "edit") return undefined;
  const metadataPreview = toolEditInputPreviewFromMetadata(metadata?.toolEditInputPreview, metadata);
  if (metadataPreview) return metadataPreview;
  const args = parseToolJsonInput(input);
  const path =
    pathField(args, ["path", "filePath", "file_path", "file", "targetPath", "target_path"]) ?? pathField(metadata, ["artifactPath"]);
  const edits = args ? editBlocksFromArgs(args) : [];
  const details = toolEditResultDetailsFromMetadata(metadata);
  if (edits.length === 0 && !details?.diff) return undefined;
  return {
    ...(path ? { path } : {}),
    edits,
    ...(details?.diff ? { diff: details.diff } : {}),
    ...(details?.firstChangedLine !== undefined ? { firstChangedLine: details.firstChangedLine } : {}),
    ...(path ? { language: languageFromPath(path) } : {}),
  };
}

export function extractInstallRoutePreview(
  toolName: string,
  result: string,
  metadata?: Record<string, unknown>,
): ToolInstallRoutePreviewData | undefined {
  if (toolName.toLowerCase() !== "ambient_install_route_plan") return undefined;
  const details = recordValue(metadata?.toolResultDetails);
  const summary = recordValue(details?.installRouteSummary);
  const lane = textField(summary, ["lane"]) ?? textField(details, ["lane"]) ?? result.match(/^Lane:\s+(.+)$/m)?.[1]?.trim();
  const confidence =
    textField(summary, ["confidence"]) ?? textField(details, ["confidence"]) ?? result.match(/^Confidence:\s+(.+)$/m)?.[1]?.trim();
  const reason = textField(summary, ["reason"]) ?? result.match(/^Reason:\s+(.+)$/m)?.[1]?.trim();
  const approvalBoundary =
    textField(summary, ["approvalBoundary"]) ??
    textField(details, ["approvalBoundary"]) ??
    result.match(/^Approval boundary:\s+(.+)$/m)?.[1]?.trim();
  if (!lane || !confidence || !reason || !approvalBoundary) return undefined;
  const secretHandling = recordValue(summary?.secretHandling);
  const validationTarget = recordValue(summary?.validationTarget);
  const nextTools =
    stringArrayField(summary, ["nextTools"]) ??
    stringArrayField(details, ["nextTools"]) ??
    installRouteSectionItems(result, "Next tools")
      .map((line) => line.split(":")[0]?.trim())
      .filter((line): line is string => Boolean(line));
  return {
    lane,
    confidence,
    reason,
    approvalBoundary,
    nextTools,
    blockers: stringArrayField(summary, ["blockers"]) ?? installRouteSectionItems(result, "Blockers"),
    warnings: stringArrayField(summary, ["warnings"]) ?? installRouteSectionItems(result, "Warnings"),
    ...(booleanField(secretHandling, ["requiresSecret"]) !== undefined
      ? { requiresSecret: booleanField(secretHandling, ["requiresSecret"]) }
      : {}),
    ...(textField(secretHandling, ["allowedMechanism"]) ? { secretMechanism: textField(secretHandling, ["allowedMechanism"]) } : {}),
    ...(textField(validationTarget, ["kind"]) ? { validationKind: textField(validationTarget, ["kind"]) } : {}),
    ...(textField(validationTarget, ["description"]) ? { validationDescription: textField(validationTarget, ["description"]) } : {}),
  };
}

function previewContentCharCount(content: string): number {
  const explicit = content.match(/\((\d[\d,]*) chars total\)\s*$/);
  if (!explicit) return content.length;
  const parsed = Number(explicit[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : content.length;
}

function toolEditInputPreviewFromMetadata(value: unknown, metadata?: Record<string, unknown>): ToolEditPreviewData | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "edit-input") return undefined;
  const rawEdits = Array.isArray(record.edits) ? record.edits : [];
  const edits = rawEdits.flatMap((item): ToolEditBlockPreviewData[] => {
    const edit = toolEditPreviewEditFromMetadata(recordValue(item));
    return edit ? [edit] : [];
  });
  const details = toolEditResultDetailsFromMetadata(metadata);
  if (edits.length === 0 && !details?.diff) return undefined;
  const path = pathField(record, ["path"]) ?? pathField(metadata, ["artifactPath"]);
  const language = textField(record, ["language"]) ?? (path ? languageFromPath(path) : undefined);
  return {
    ...(path ? { path } : {}),
    edits,
    ...(details?.diff ? { diff: details.diff } : {}),
    ...(details?.firstChangedLine !== undefined ? { firstChangedLine: details.firstChangedLine } : {}),
    ...(language ? { language } : {}),
  };
}

function toolEditPreviewEditFromMetadata(record: Record<string, unknown> | undefined): ToolEditBlockPreviewData | undefined {
  const oldText = toolEditTextPreviewFromMetadata(record?.oldText);
  const newText = toolEditTextPreviewFromMetadata(record?.newText);
  if (!oldText || !newText) return undefined;
  return editPreviewBlockFromTextPreviews(oldText, newText, true);
}

function toolEditTextPreviewFromMetadata(value: unknown): ToolEditTextPreview | undefined {
  const record = recordValue(value);
  const preview = textField(record, ["preview"]);
  const chars = numberField(record, ["chars"]);
  if (preview === undefined || chars === undefined) return undefined;
  return {
    preview,
    chars,
    truncated: record?.truncated === true,
    ...(numberField(record, ["omittedChars"]) !== undefined ? { omittedChars: numberField(record, ["omittedChars"]) } : {}),
  };
}

function installRouteSectionItems(result: string, title: "Next tools" | "Blockers" | "Warnings"): string[] {
  const body = result.match(new RegExp(`^${title}:\\n([\\s\\S]*?)(?=\\n\\n[A-Z][^\\n]+:|$)`, "m"))?.[1] ?? "";
  return body
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^-\s*/, ""))
    .filter((line) => line && line !== "none");
}

function editBlocksFromArgs(args: Record<string, unknown>): ToolEditBlockPreviewData[] {
  const edits: ToolEditBlockPreviewData[] = [];
  const parsedEdits = parseEditsValue(args.edits);
  for (const edit of parsedEdits) {
    const record = recordValue(edit);
    const oldText = editTextField(record, ["oldText", "old_text"]);
    const newText = editTextField(record, ["newText", "new_text"]);
    if (oldText !== undefined && newText !== undefined) edits.push(editPreviewBlockFromTextPreviews(oldText, newText));
  }

  const oldText = editTextField(args, ["oldText", "old_text"]);
  const newText = editTextField(args, ["newText", "new_text"]);
  if (oldText !== undefined && newText !== undefined) edits.push(editPreviewBlockFromTextPreviews(oldText, newText));
  return edits;
}

function editPreviewBlockFromTextPreviews(
  oldText: ToolEditTextPreview,
  newText: ToolEditTextPreview,
  includeCounts = false,
): ToolEditBlockPreviewData {
  return {
    oldText: oldText.preview,
    newText: newText.preview,
    ...(includeCounts || oldText.chars !== oldText.preview.length || oldText.truncated ? { oldTextChars: oldText.chars } : {}),
    ...(oldText.truncated ? { oldTextTruncated: true } : {}),
    ...(oldText.omittedChars !== undefined ? { oldTextOmittedChars: oldText.omittedChars } : {}),
    ...(includeCounts || newText.chars !== newText.preview.length || newText.truncated ? { newTextChars: newText.chars } : {}),
    ...(newText.truncated ? { newTextTruncated: true } : {}),
    ...(newText.omittedChars !== undefined ? { newTextOmittedChars: newText.omittedChars } : {}),
  };
}

function editTextField(record: Record<string, unknown> | undefined, keys: string[]): ToolEditTextPreview | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return {
        preview: value,
        chars: value.length,
        truncated: false,
      };
    }
    const previewRecord = recordValue(value);
    const preview = textField(previewRecord, ["preview"]);
    if (preview === undefined) continue;
    return {
      preview,
      chars: numberField(previewRecord, ["chars"]) ?? preview.length,
      truncated: previewRecord?.truncated === true,
      ...(numberField(previewRecord, ["omittedChars"]) !== undefined ? { omittedChars: numberField(previewRecord, ["omittedChars"]) } : {}),
    };
  }
  return undefined;
}

function parseEditsValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toolEditResultDetailsFromMetadata(metadata: Record<string, unknown> | undefined): ToolEditResultDetails | undefined {
  const details = recordValue(metadata?.toolResultDetails);
  const diff = textField(details, ["diff"]);
  const firstChangedLine = numberField(details, ["firstChangedLine"]);
  if (diff === undefined && firstChangedLine === undefined) return undefined;
  return {
    ...(diff !== undefined ? { diff } : {}),
    ...(firstChangedLine !== undefined ? { firstChangedLine } : {}),
  };
}
