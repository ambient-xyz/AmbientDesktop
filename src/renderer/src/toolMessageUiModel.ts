import type { MediaArtifactResult } from "../../shared/desktopTypes";
import {
  extractMessagingConversationDirectorySetupPreview,
  extractMessagingRemoteSurfaceActivationPreview,
  extractTelegramSessionSetupPreview,
  messagingConversationDirectorySetupCardFromMetadata,
  messagingRemoteSurfaceActivationCardFromMetadata,
  telegramSessionSetupCardFromMetadata,
} from "./toolMessageMessagingUiModel";
import { toolProgressPreview } from "./toolMessageProgressUiModel";
import type { ToolProgressPreviewData } from "./toolMessageProgressUiModel";
export type { ToolProgressPreviewData, ToolProgressPreviewRow } from "./toolMessageProgressUiModel";
import type {
  ToolMessagingConversationDirectorySetupPreviewData,
  ToolMessagingRemoteSurfaceActivationPreviewData,
  ToolTelegramSessionSetupPreviewData,
} from "./toolMessageMessagingUiModel";
export {
  toolMessagingConversationDirectorySetupCardViewModel,
  toolMessagingRemoteSurfaceActivationCardViewModel,
} from "./toolMessageMessagingUiModel";
export type {
  ToolMessagingConversationDirectorySetupCardViewModel,
  ToolMessagingConversationDirectorySetupPreviewData,
  ToolMessagingConversationDirectorySetupTone,
  ToolMessagingRemoteSurfaceActivationCardViewModel,
  ToolMessagingRemoteSurfaceActivationPreviewData,
  ToolMessagingRemoteSurfaceActivationTone,
  ToolTelegramSessionSetupPreviewData,
} from "./toolMessageMessagingUiModel";
import {
  addArtifactHint,
  cleanArtifactPath,
  extractAmbientCliMediaArtifactPath,
  extractShellMediaArtifactPath,
  fileBaseName,
  isAmbientCliTool,
  isArtifactWritingTool,
  isShellTool,
  isSttTool,
  isVoiceTool,
  languageFromPath,
  managedFileArtifactsFromMetadata,
  mediaArtifactPathFromMetadata,
  mediaArtifactResult,
  normalizeArtifactPath,
} from "./toolMessageArtifactUiModel";
import type { ArtifactPathHints, ToolManagedFileArtifactPreviewData } from "./toolMessageArtifactUiModel";
export {
  artifactMediaKindFromPath,
  artifactPreviewRoute,
  isAbsoluteArtifactPath,
  mediaPreviewUnavailableMessage,
  resolveInlineArtifactPath,
} from "./toolMessageArtifactUiModel";
export type {
  ArtifactMediaKind,
  ArtifactPathHints,
  ArtifactPreviewRoute,
  ToolManagedFileArtifactPreviewData,
} from "./toolMessageArtifactUiModel";
import {
  booleanField,
  numberField,
  parseDelimitedNumber,
  pathField,
  previewTextField,
  recordValue,
  stringArrayField,
  textField,
} from "./toolMessageMetadataFields";
import type {
  ChatMessage,
  ToolArgumentProgressSnapshot,
  ToolEditTextPreview,
  ToolLargeOutputPreview,
  ToolLargeOutputPreviewItem,
  ToolLongformInputPreview,
  ToolLongformInputPreviewItem,
} from "../../shared/threadTypes";

export type ToolMessageSection = { title: string; content: string };

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

export type ToolVoicePreviewData = {
  action: "status" | "select" | "policy" | "test" | "clone-status";
  status?: string;
  noOp?: boolean;
  provider?: string;
  previousProvider?: string;
  providerCapabilityId?: string;
  previousProviderCapabilityId?: string;
  voice?: string;
  previousVoice?: string;
  voiceId?: string;
  enabled?: string;
  autoplay?: string;
  mode?: string;
  longReply?: string;
  maxChars?: string;
  audioPath?: string;
  mimeType?: string;
  durationMs?: number;
  testStatus?: string;
  readiness?: string;
  readyForSelection?: boolean;
  shouldRetryStatus?: boolean;
  cacheStatus?: string;
  progressPercent?: number;
  retryAfterSeconds?: number;
  dashboardUrl?: string;
  verificationUrl?: string;
  failureReason?: string;
  localArtifactPaths?: string[];
  missingLocalArtifactPaths?: string[];
};

export type ToolSttPreviewData = {
  action: "status" | "select" | "policy" | "test";
  status?: string;
  noOp?: boolean;
  provider?: string;
  previousProvider?: string;
  providerCapabilityId?: string;
  previousProviderCapabilityId?: string;
  language?: string;
  previousLanguage?: string;
  enabled?: string;
  autoSendAfterTranscription?: string;
  silenceFinalizeSeconds?: string;
  noSpeechGate?: string;
  noSpeechGateRmsThreshold?: string;
  stopTtsOnSpeech?: string;
  queueWhileAgentRuns?: string;
  pushToTalkShortcut?: string;
  providerCount?: number;
  availableProviderCount?: number;
  testStatus?: string;
  transcript?: string;
  durationMs?: number;
  rmsDbfs?: number;
  noSpeechThresholdDbfs?: number;
  audioPath?: string;
  normalizedAudioPath?: string;
  transcriptPath?: string;
  jsonPath?: string;
  stdoutPath?: string;
  stderrPath?: string;
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

export type ParsedToolMessage = {
  summary: string;
  preview: string;
  inputTitle: string;
  input: string;
  result: string;
  resultPreview: string;
  artifactPath?: string;
  managedFileArtifacts: ToolManagedFileArtifactPreviewData[];
  argumentStatus?: string;
  argumentProgress?: ToolArgumentProgressSnapshot;
  progressPreview?: ToolProgressPreviewData;
  longformInputPreview?: ToolLongformInputPreview;
  largeOutputPreview?: ToolLargeOutputPreview;
  writePreview?: ToolWritePreviewData;
  applyRepairPreview?: ToolApplyRepairPreviewData;
  editPreview?: ToolEditPreviewData;
  voicePreview?: ToolVoicePreviewData;
  sttPreview?: ToolSttPreviewData;
  installRoutePreview?: ToolInstallRoutePreviewData;
  telegramSessionSetup?: ToolTelegramSessionSetupPreviewData;
  messagingConversationDirectorySetup?: ToolMessagingConversationDirectorySetupPreviewData;
  messagingRemoteSurfaceActivation?: ToolMessagingRemoteSurfaceActivationPreviewData;
};

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

type ToolResultDetails = {
  stage?: string;
  statusMessage?: string;
  activityMessage?: string;
  targetUrl?: string;
  elapsedMs?: number;
  outputChars?: number;
  thinkingChars?: number;
  idleElapsedMs?: number;
  idleTimeoutMs?: number;
  timeoutMode?: string;
  waitingOn?: string;
  approvalRequestId?: string;
  approvalTitle?: string;
  heartbeatCount?: number;
  diff?: string;
  firstChangedLine?: number;
  mediaArtifact?: MediaArtifactResult;
  runtime?: string;
  toolName?: string;
  status?: string;
  testStatus?: string;
  providerCapabilityId?: string;
  previousProviderCapabilityId?: string;
  selectedProviderCapabilityId?: string;
  voiceId?: string;
  selectedVoiceId?: string;
  audioPath?: string;
  mimeType?: string;
  durationMs?: number;
  readiness?: string;
  readyForSelection?: boolean;
  shouldRetryStatus?: boolean;
  cacheStatus?: string;
  progressPercent?: number;
  retryAfterSeconds?: number;
  dashboardUrl?: string;
  verificationUrl?: string;
  failureReason?: string;
  localArtifactPaths?: string[];
  missingLocalArtifactPaths?: string[];
  language?: string;
  transcript?: string;
  normalizedAudioPath?: string;
  transcriptPath?: string;
  jsonPath?: string;
  stdoutPath?: string;
  stderrPath?: string;
  managedFileArtifacts?: ToolManagedFileArtifactPreviewData[];
  providerCount?: number;
  availableProviderCount?: number;
  noSpeechGate?: {
    rmsDbfs?: number;
    thresholdDbfs?: number;
  };
  largeOutputPreview?: ToolLargeOutputPreview;
  telegramSessionSetup?: ToolTelegramSessionSetupPreviewData;
  messagingConversationDirectorySetup?: ToolMessagingConversationDirectorySetupPreviewData;
  messagingRemoteSurfaceActivation?: ToolMessagingRemoteSurfaceActivationPreviewData;
  localDeepResearchStatus?: Record<string, unknown>;
};

export function parseToolMessage(
  content: string,
  fallbackName: string,
  workspacePath: string,
  metadata?: Record<string, unknown>,
): ParsedToolMessage {
  const [first, ...rest] = content.split(/\n\n/);
  const firstBlock = first?.trim() ?? "";
  const output = rest.join("\n\n").trim();
  const singleBlockResult = !output && firstBlock.includes("\n") ? firstBlock : "";
  const sections = parseToolSections(output || singleBlockResult);
  const inputSection = sections.find((section) => section.title === "Input" || section.title === "Command");
  const resultSection = sections.find((section) => section.title === "Result");
  const inputTitle = inputSection?.title ?? toolInputTitleForName(fallbackName);
  const input = inputSection?.content.trim() ?? "";
  const rawResult = resultSection?.content.trim() ?? "";
  const toolResultDetails = toolResultDetailsFromMetadata(metadata);
  const argumentProgress = toolArgumentProgressFromMetadata(metadata?.toolArgumentProgress);
  const metadataLongformInputPreview = toolLongformInputPreviewFromMetadata(metadata?.toolLongformInputPreview);
  const largeOutputPreview = toolResultDetails?.largeOutputPreview ?? largeOutputPreviewFromResult(rawResult);
  const result = largeOutputPreview ? stripMaterializedTextNotices(rawResult) : rawResult;
  const writePreview = extractWritePreview(fallbackName, input);
  const applyRepairPreview = extractApplyRepairPreview(fallbackName, input);
  const editPreview = extractEditPreview(fallbackName, input, metadata);
  const longformInputPreview =
    metadataLongformInputPreview ??
    writeLongformInputPreview(fallbackName, writePreview) ??
    applyRepairLongformInputPreview(applyRepairPreview);
  const progressPreview = toolProgressPreview({
    toolName: fallbackName,
    input,
    result,
    argumentProgress,
    toolResultDetails,
  });
  const voicePreview = extractVoicePreview(fallbackName, result || firstBlock, metadata);
  const sttPreview = extractSttPreview(fallbackName, result || firstBlock, metadata);
  const installRoutePreview = extractInstallRoutePreview(fallbackName, result || firstBlock, metadata);
  const telegramSessionSetup = extractTelegramSessionSetupPreview(fallbackName, metadata);
  const messagingConversationDirectorySetup = extractMessagingConversationDirectorySetupPreview(fallbackName, metadata);
  const messagingRemoteSurfaceActivation = extractMessagingRemoteSurfaceActivationPreview(fallbackName, metadata);
  const managedFileArtifacts = (toolResultDetails?.managedFileArtifacts ?? []).map((artifact) => ({
    ...artifact,
    ...(artifact.workspacePath
      ? { workspacePath: normalizeArtifactPath(artifact.workspacePath, workspacePath) ?? artifact.workspacePath }
      : {}),
  }));
  const firstManagedWorkspaceArtifact = managedFileArtifacts.find((artifact) => artifact.workspacePath)?.workspacePath;
  const longformArtifactPath = longformInputPreview?.items.find((item) => item.path)?.path;
  const artifactPath = normalizeArtifactPath(
    firstManagedWorkspaceArtifact ??
      extractArtifactPath(
        fallbackName,
        input,
        result,
        metadata,
        longformArtifactPath ?? writePreview?.path ?? editPreview?.path ?? voicePreview?.audioPath ?? sttPreview?.audioPath,
      ),
    workspacePath,
  );
  return {
    summary: summaryLine(firstBlock) || `${fallbackName} completed`,
    preview: toolInputPreview(input, inputTitle, longformInputPreview, fallbackName),
    inputTitle,
    input,
    result,
    resultPreview: rawResult ? toolResultPreview(rawResult, largeOutputPreview) : "",
    managedFileArtifacts,
    ...(artifactPath ? { artifactPath } : {}),
    ...(argumentProgress?.uiStatus ? { argumentStatus: argumentProgress.uiStatus, argumentProgress } : {}),
    ...(progressPreview ? { progressPreview } : {}),
    ...(longformInputPreview ? { longformInputPreview } : {}),
    ...(largeOutputPreview ? { largeOutputPreview } : {}),
    ...(writePreview ? { writePreview } : {}),
    ...(applyRepairPreview ? { applyRepairPreview } : {}),
    ...(editPreview ? { editPreview } : {}),
    ...(voicePreview ? { voicePreview } : {}),
    ...(sttPreview ? { sttPreview } : {}),
    ...(installRoutePreview ? { installRoutePreview } : {}),
    ...(telegramSessionSetup ? { telegramSessionSetup } : {}),
    ...(messagingConversationDirectorySetup ? { messagingConversationDirectorySetup } : {}),
    ...(messagingRemoteSurfaceActivation ? { messagingRemoteSurfaceActivation } : {}),
  };
}

export function collectArtifactPathHints(messages: ChatMessage[], workspacePath: string): ArtifactPathHints {
  const exact = new Map<string, string>();
  const basenames = new Map<string, Set<string>>();

  for (const message of messages) {
    if (message.role !== "tool") continue;
    const toolName = typeof message.metadata?.toolName === "string" ? message.metadata.toolName : "Tool";
    const parsed = parseToolMessage(message.content, toolName, workspacePath, message.metadata);
    const artifactPath = parsed.artifactPath;
    if (artifactPath && artifactPath !== "." && !artifactPath.endsWith("/")) {
      addArtifactHint(exact, artifactPath, artifactPath);
      addArtifactHint(exact, `./${artifactPath}`, artifactPath);
      const base = fileBaseName(artifactPath);
      if (base && base !== artifactPath) {
        const paths = basenames.get(base) ?? new Set<string>();
        paths.add(artifactPath);
        basenames.set(base, paths);
      }
    }
    for (const managedArtifact of parsed.managedFileArtifacts) {
      const managedPath = managedArtifact.workspacePath;
      if (!managedPath || managedPath === "." || managedPath.endsWith("/")) continue;
      addArtifactHint(exact, managedPath, managedPath);
      addArtifactHint(exact, `./${managedPath}`, managedPath);
      const managedBase = fileBaseName(managedPath);
      if (!managedBase || managedBase === managedPath) continue;
      const managedPaths = basenames.get(managedBase) ?? new Set<string>();
      managedPaths.add(managedPath);
      basenames.set(managedBase, managedPaths);
    }
  }

  for (const [base, paths] of basenames) {
    if (paths.size === 1) exact.set(base, [...paths][0]);
  }
  return exact;
}

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

function toolInputPreview(input: string, inputTitle: string, longformInputPreview?: ToolLongformInputPreview, toolName?: string): string {
  if (longformInputPreview) return toolLongformInputPreviewDisplaySummary(longformInputPreview);
  const firstLine = input.split("\n").find((line) => line.trim());
  if (!firstLine) return "";
  const trimmed = firstLine.trim();
  if (inputTitle === "Command") return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
  const compact = compactJsonInputPreview(input, toolName) ?? trimmed;
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
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

function toolResultPreview(output: string, largeOutputPreview?: ToolLargeOutputPreview): string {
  if (largeOutputPreview) return largeOutputPreview.summary;
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(Input|Command|Result)$/.test(line));
  const preview = lines.find((line) => !line.startsWith("{") && !line.startsWith("}")) ?? lines[0] ?? "";
  return preview.length > 140 ? `${preview.slice(0, 137)}...` : preview;
}

function summaryLine(value: string): string {
  const line =
    value
      .split(/\r?\n/)
      .find((item) => item.trim())
      ?.trim() ?? "";
  return line.length > 140 ? `${line.slice(0, 137)}...` : line;
}

function parseToolSections(output: string): ToolMessageSection[] {
  const sections: ToolMessageSection[] = [];
  const pattern = /(?:^|\n\n)(Input|Command|Result)\n([\s\S]*?)(?=\n\n(?:Input|Command|Result)\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(output))) {
    sections.push({ title: match[1], content: match[2] ?? "" });
  }
  if (sections.length === 0 && output.trim()) sections.push({ title: "Result", content: output.trim() });
  return sections;
}

function toolInputTitleForName(name: string): string {
  return name.toLowerCase() === "bash" || name.toLowerCase() === "shell" ? "Command" : "Input";
}

function toolArgumentProgressFromMetadata(value: unknown): ToolArgumentProgressSnapshot | undefined {
  const record = recordValue(value);
  const uiStatus = textField(record, ["uiStatus"]);
  const toolCallId = textField(record, ["toolCallId"]);
  const toolName = textField(record, ["toolName"]);
  const phase = textField(record, ["phase"]);
  if (!record || !uiStatus || !toolCallId || !toolName || !phase) return undefined;
  return record as unknown as ToolArgumentProgressSnapshot;
}

function toolLongformInputPreviewFromMetadata(value: unknown): ToolLongformInputPreview | undefined {
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

function toolLargeOutputPreviewFromMetadata(value: unknown): ToolLargeOutputPreview | undefined {
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

function largeOutputPreviewFromResult(result: string): ToolLargeOutputPreview | undefined {
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

function stripMaterializedTextNotices(result: string): string {
  return result
    .replace(
      /^\[truncated\]\s+.+? preview is [\d,]+ of [\d,]+ chars(?:,\s+[\d,]+ bytes)?\.\nFull output saved at:\s+[^\n]+(?:\nUse file_read for exact text, or long_context_process for summarization\/querying when the output is too large for direct context\.)?/gm,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function extractWritePreview(toolName: string, input: string): ToolWritePreviewData | undefined {
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

function writeLongformInputPreview(toolName: string, preview: ToolWritePreviewData | undefined): ToolLongformInputPreview | undefined {
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

function extractApplyRepairPreview(toolName: string, input: string): ToolApplyRepairPreviewData | undefined {
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

function previewContentCharCount(content: string): number {
  const explicit = content.match(/\((\d[\d,]*) chars total\)\s*$/);
  if (!explicit) return content.length;
  const parsed = Number(explicit[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : content.length;
}

function applyRepairLongformInputPreview(preview: ToolApplyRepairPreviewData | undefined): ToolLongformInputPreview | undefined {
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

function extractEditPreview(toolName: string, input: string, metadata?: Record<string, unknown>): ToolEditPreviewData | undefined {
  if (toolName.toLowerCase() !== "edit") return undefined;
  const metadataPreview = toolEditInputPreviewFromMetadata(metadata?.toolEditInputPreview, metadata);
  if (metadataPreview) return metadataPreview;
  const args = parseToolJsonInput(input);
  const path =
    pathField(args, ["path", "filePath", "file_path", "file", "targetPath", "target_path"]) ?? pathField(metadata, ["artifactPath"]);
  const edits = args ? editBlocksFromArgs(args) : [];
  const details = toolResultDetailsFromMetadata(metadata);
  if (edits.length === 0 && !details?.diff) return undefined;
  return {
    ...(path ? { path } : {}),
    edits,
    ...(details?.diff ? { diff: details.diff } : {}),
    ...(details?.firstChangedLine !== undefined ? { firstChangedLine: details.firstChangedLine } : {}),
    ...(path ? { language: languageFromPath(path) } : {}),
  };
}

function toolEditInputPreviewFromMetadata(value: unknown, metadata?: Record<string, unknown>): ToolEditPreviewData | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "edit-input") return undefined;
  const rawEdits = Array.isArray(record.edits) ? record.edits : [];
  const edits = rawEdits.flatMap((item): ToolEditBlockPreviewData[] => {
    const edit = toolEditPreviewEditFromMetadata(recordValue(item));
    return edit ? [edit] : [];
  });
  const details = toolResultDetailsFromMetadata(metadata);
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

function extractInstallRoutePreview(
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

function installRouteSectionItems(result: string, title: "Next tools" | "Blockers" | "Warnings"): string[] {
  const body = result.match(new RegExp(`^${title}:\\n([\\s\\S]*?)(?=\\n\\n[A-Z][^\\n]+:|$)`, "m"))?.[1] ?? "";
  return body
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^-\s*/, ""))
    .filter((line) => line && line !== "none");
}

function extractVoicePreview(toolName: string, result: string, metadata?: Record<string, unknown>): ToolVoicePreviewData | undefined {
  if (!isVoiceTool(toolName)) return undefined;
  const details = toolResultDetailsFromMetadata(metadata);
  const action = voiceActionFromToolName(toolName);
  if (!action) return undefined;
  const status = details?.status;
  const providerTransition = transitionLine(result, "Provider");
  const voiceTransition = transitionLine(result, "Voice");
  const provider = singleValueLine(result, action === "status" ? "Selected provider" : "Provider");
  const voice = singleValueLine(result, action === "status" ? "Selected voice" : "Voice");
  const audioPath = details?.audioPath ?? singleValueLine(result, "Audio");
  const mimeType = details?.mimeType ?? singleValueLine(result, "MIME type");
  const readiness = details?.readiness ?? singleValueLine(result, "Readiness");
  const cacheStatus = details?.cacheStatus ?? singleValueLine(result, "Dynamic cache");
  const failureReason = details?.failureReason ?? singleValueLine(result, "Failure reason");
  const dashboardUrl = details?.dashboardUrl ?? singleValueLine(result, "Provider dashboard");
  const verificationUrl = details?.verificationUrl ?? singleValueLine(result, "Provider verification");
  const localArtifactPaths = details?.localArtifactPaths ?? listValueLine(result, "Local artifacts");
  const missingLocalArtifactPaths = details?.missingLocalArtifactPaths ?? listValueLine(result, "Missing local artifacts");
  return {
    action,
    ...(status ? { status } : {}),
    ...(status === "no-op" || /^Ambient voice .* already configured$/im.test(result) ? { noOp: true } : {}),
    ...((providerTransition?.next ?? provider) ? { provider: providerTransition?.next ?? provider } : {}),
    ...(providerTransition?.previous ? { previousProvider: providerTransition.previous } : {}),
    ...((details?.selectedProviderCapabilityId ?? details?.providerCapabilityId)
      ? { providerCapabilityId: details.selectedProviderCapabilityId ?? details.providerCapabilityId }
      : {}),
    ...(details?.previousProviderCapabilityId ? { previousProviderCapabilityId: details.previousProviderCapabilityId } : {}),
    ...((voiceTransition?.next ?? voice) ? { voice: voiceTransition?.next ?? voice } : {}),
    ...(voiceTransition?.previous ? { previousVoice: voiceTransition.previous } : {}),
    ...((details?.selectedVoiceId ?? details?.voiceId) ? { voiceId: details.selectedVoiceId ?? details.voiceId } : {}),
    ...(singleValueLine(result, "Enabled") ? { enabled: singleValueLine(result, "Enabled") } : {}),
    ...(singleValueLine(result, "Autoplay") ? { autoplay: singleValueLine(result, "Autoplay") } : {}),
    ...(singleValueLine(result, "Mode") ? { mode: singleValueLine(result, "Mode") } : {}),
    ...(singleValueLine(result, "Long reply") ? { longReply: singleValueLine(result, "Long reply") } : {}),
    ...(singleValueLine(result, "Max chars") ? { maxChars: singleValueLine(result, "Max chars") } : {}),
    ...(audioPath ? { audioPath } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(details?.durationMs !== undefined ? { durationMs: details.durationMs } : {}),
    ...(details?.testStatus ? { testStatus: details.testStatus } : {}),
    ...(readiness ? { readiness } : {}),
    ...(details?.readyForSelection !== undefined ? { readyForSelection: details.readyForSelection } : {}),
    ...(details?.shouldRetryStatus !== undefined ? { shouldRetryStatus: details.shouldRetryStatus } : {}),
    ...(cacheStatus ? { cacheStatus } : {}),
    ...(details?.progressPercent !== undefined ? { progressPercent: details.progressPercent } : {}),
    ...(details?.retryAfterSeconds !== undefined ? { retryAfterSeconds: details.retryAfterSeconds } : {}),
    ...(dashboardUrl ? { dashboardUrl } : {}),
    ...(verificationUrl ? { verificationUrl } : {}),
    ...(failureReason ? { failureReason } : {}),
    ...(localArtifactPaths?.length ? { localArtifactPaths } : {}),
    ...(missingLocalArtifactPaths?.length ? { missingLocalArtifactPaths } : {}),
  };
}

function extractSttPreview(toolName: string, result: string, metadata?: Record<string, unknown>): ToolSttPreviewData | undefined {
  if (!isSttTool(toolName)) return undefined;
  const details = toolResultDetailsFromMetadata(metadata);
  const action = sttActionFromToolName(toolName);
  if (!action) return undefined;
  const status = details?.status;
  const providerTransition = transitionLine(result, "Provider");
  const languageTransition = transitionLine(result, "Spoken language");
  const provider = singleValueLine(result, action === "status" ? "Selected provider" : "Provider");
  const language = details?.language ?? singleValueLine(result, action === "test" ? "Language" : "Spoken language");
  const noSpeechThreshold =
    details?.noSpeechGate?.thresholdDbfs ??
    numberFromLabel(result, "No-speech threshold") ??
    numberFromLabel(result, "RMS no-speech threshold");
  const rmsDbfs = details?.noSpeechGate?.rmsDbfs ?? numberFromLabel(result, "RMS");
  const audioPath = details?.audioPath ?? singleValueLine(result, "Audio artifact");
  const normalizedAudioPath = details?.normalizedAudioPath ?? singleValueLine(result, "Normalized audio artifact");
  const transcriptPath = details?.transcriptPath ?? singleValueLine(result, "Transcript artifact");
  const jsonPath = details?.jsonPath ?? singleValueLine(result, "JSON artifact");
  const stdoutPath = details?.stdoutPath ?? singleValueLine(result, "stdout artifact");
  const stderrPath = details?.stderrPath ?? singleValueLine(result, "stderr artifact");
  const transcript = details?.transcript ?? singleValueLine(result, "Transcript");
  const durationMs = details?.durationMs ?? numberFromLabel(result, "Provider elapsed");
  const testStatus = details?.testStatus ?? (action === "test" ? singleValueLine(result, "Status") : undefined);
  return {
    action,
    ...(status ? { status } : {}),
    ...(status === "no-op" || /^Ambient STT .* already configured$/im.test(result) ? { noOp: true } : {}),
    ...((providerTransition?.next ?? provider) ? { provider: providerTransition?.next ?? provider } : {}),
    ...(providerTransition?.previous ? { previousProvider: providerTransition.previous } : {}),
    ...((details?.selectedProviderCapabilityId ?? details?.providerCapabilityId)
      ? { providerCapabilityId: details.selectedProviderCapabilityId ?? details.providerCapabilityId }
      : {}),
    ...(details?.previousProviderCapabilityId ? { previousProviderCapabilityId: details.previousProviderCapabilityId } : {}),
    ...((languageTransition?.next ?? language) ? { language: languageTransition?.next ?? language } : {}),
    ...(languageTransition?.previous ? { previousLanguage: languageTransition.previous } : {}),
    ...(singleValueLine(result, "Enabled") ? { enabled: singleValueLine(result, "Enabled") } : {}),
    ...(singleValueLine(result, "Auto-send after transcription")
      ? { autoSendAfterTranscription: singleValueLine(result, "Auto-send after transcription") }
      : {}),
    ...(singleValueLine(result, "Silence before transcribe")
      ? { silenceFinalizeSeconds: singleValueLine(result, "Silence before transcribe") }
      : {}),
    ...(singleValueLine(result, "No-speech gate") ? { noSpeechGate: singleValueLine(result, "No-speech gate") } : {}),
    ...(singleValueLine(result, "RMS no-speech threshold")
      ? { noSpeechGateRmsThreshold: singleValueLine(result, "RMS no-speech threshold") }
      : {}),
    ...(singleValueLine(result, "Stop TTS on speech") ? { stopTtsOnSpeech: singleValueLine(result, "Stop TTS on speech") } : {}),
    ...(singleValueLine(result, "Queue while agent runs")
      ? { queueWhileAgentRuns: singleValueLine(result, "Queue while agent runs") }
      : {}),
    ...(singleValueLine(result, "Push-to-talk shortcut") ? { pushToTalkShortcut: singleValueLine(result, "Push-to-talk shortcut") } : {}),
    ...(details?.providerCount !== undefined ? { providerCount: details.providerCount } : {}),
    ...(details?.availableProviderCount !== undefined ? { availableProviderCount: details.availableProviderCount } : {}),
    ...(testStatus ? { testStatus } : {}),
    ...(transcript ? { transcript } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(rmsDbfs !== undefined ? { rmsDbfs } : {}),
    ...(noSpeechThreshold !== undefined ? { noSpeechThresholdDbfs: noSpeechThreshold } : {}),
    ...(audioPath ? { audioPath } : {}),
    ...(normalizedAudioPath ? { normalizedAudioPath } : {}),
    ...(transcriptPath ? { transcriptPath } : {}),
    ...(jsonPath ? { jsonPath } : {}),
    ...(stdoutPath ? { stdoutPath } : {}),
    ...(stderrPath ? { stderrPath } : {}),
  };
}

function voiceActionFromToolName(toolName: string): ToolVoicePreviewData["action"] | undefined {
  const normalized = toolName.toLowerCase();
  if (normalized === "ambient_voice_status") return "status";
  if (normalized === "ambient_voice_select") return "select";
  if (normalized === "ambient_voice_policy_update") return "policy";
  if (normalized === "ambient_voice_test") return "test";
  if (normalized === "ambient_voice_clone_status") return "clone-status";
  return undefined;
}

function sttActionFromToolName(toolName: string): ToolSttPreviewData["action"] | undefined {
  const normalized = toolName.toLowerCase();
  if (normalized === "ambient_stt_status") return "status";
  if (normalized === "ambient_stt_select") return "select";
  if (normalized === "ambient_stt_policy_update") return "policy";
  if (normalized === "ambient_stt_test") return "test";
  return undefined;
}

function transitionLine(result: string, label: string): { previous: string; next: string } | undefined {
  const value = singleValueLine(result, label);
  if (!value || !value.includes("->")) return undefined;
  const [previous, ...nextParts] = value.split("->");
  const next = nextParts.join("->");
  if (!previous.trim() || !next.trim()) return undefined;
  return { previous: previous.trim(), next: next.trim() };
}

function singleValueLine(result: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = result.match(new RegExp(`^${escaped}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

function listValueLine(result: string, label: string): string[] | undefined {
  const value = singleValueLine(result, label);
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

function numberFromLabel(result: string, label: string): number | undefined {
  const value = singleValueLine(result, label);
  const match = value?.match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
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

function extractArtifactPath(
  toolName: string,
  input: string,
  result: string,
  metadata: Record<string, unknown> | undefined,
  inputPath?: string,
): string | undefined {
  const metadataMediaPath = mediaArtifactPathFromMetadata(metadata) ?? pathField(metadata, ["artifactPath"]);
  if (metadataMediaPath) return cleanArtifactPath(metadataMediaPath);
  if (isVoiceTool(toolName)) return cleanArtifactPath(inputPath ?? toolResultDetailsFromMetadata(metadata)?.audioPath);
  if (isShellTool(toolName)) return extractShellMediaArtifactPath(result);
  if (isAmbientCliTool(toolName)) {
    return extractAmbientCliMediaArtifactPath(result);
  }
  if (!isArtifactWritingTool(toolName)) return undefined;
  const resultPath = result.match(/\b(?:to|in|at)\s+([^\n]+)\s*$/i)?.[1];
  const args = parseToolJsonInput(input);
  return cleanArtifactPath(
    inputPath ?? pathField(args, ["path", "filePath", "file_path", "file", "targetPath", "target_path"]) ?? resultPath,
  );
}

function parseToolJsonInput(input: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function toolResultDetailsFromMetadata(metadata: Record<string, unknown> | undefined): ToolResultDetails | undefined {
  const details = recordValue(metadata?.toolResultDetails);
  const diff = textField(details, ["diff"]);
  const firstChangedLine = numberField(details, ["firstChangedLine"]);
  const mediaArtifact = mediaArtifactResult(recordValue(details?.mediaArtifact) ?? recordValue(metadata?.mediaArtifact));
  const runtime = textField(details, ["runtime"]);
  const toolName = textField(details, ["toolName"]);
  const status = textField(details, ["status"]);
  const stage = textField(details, ["stage"]);
  const statusMessage = textField(details, ["statusMessage"]);
  const activityMessage = textField(details, ["activityMessage"]);
  const targetUrl = textField(details, ["targetUrl"]);
  const elapsedMs = numberField(details, ["elapsedMs"]);
  const outputChars = numberField(details, ["outputChars"]);
  const thinkingChars = numberField(details, ["thinkingChars"]);
  const idleElapsedMs = numberField(details, ["idleElapsedMs"]);
  const idleTimeoutMs = numberField(details, ["idleTimeoutMs"]);
  const timeoutMode = textField(details, ["timeoutMode"]);
  const waitingOn = textField(details, ["waitingOn"]);
  const approvalRequestId = textField(details, ["approvalRequestId"]);
  const approvalTitle = textField(details, ["approvalTitle"]);
  const heartbeatCount = numberField(details, ["heartbeatCount"]);
  const testStatus = textField(details, ["testStatus"]);
  const providerCapabilityId = textField(details, ["providerCapabilityId"]);
  const previousProviderCapabilityId = textField(details, ["previousProviderCapabilityId"]);
  const selectedProviderCapabilityId = textField(details, ["selectedProviderCapabilityId"]);
  const voiceId = textField(details, ["voiceId"]);
  const selectedVoiceId = textField(details, ["selectedVoiceId"]);
  const audioPath = textField(details, ["audioPath"]);
  const mimeType = textField(details, ["mimeType"]);
  const durationMs = numberField(details, ["durationMs"]);
  const readiness = textField(details, ["readiness"]);
  const readyForSelection = booleanField(details, ["readyForSelection"]);
  const shouldRetryStatus = booleanField(details, ["shouldRetryStatus"]);
  const cacheStatus = textField(details, ["cacheStatus"]);
  const progressPercent = numberField(details, ["progressPercent"]);
  const retryAfterSeconds = numberField(details, ["retryAfterSeconds"]);
  const dashboardUrl = textField(details, ["dashboardUrl"]);
  const verificationUrl = textField(details, ["verificationUrl"]);
  const failureReason = textField(details, ["failureReason"]);
  const localArtifactPaths = stringArrayField(details, ["localArtifactPaths"]);
  const missingLocalArtifactPaths = stringArrayField(details, ["missingLocalArtifactPaths"]);
  const language = textField(details, ["language"]);
  const transcript = textField(details, ["transcript"]);
  const normalizedAudioPath = textField(details, ["normalizedAudioPath"]);
  const transcriptPath = textField(details, ["transcriptPath"]);
  const jsonPath = textField(details, ["jsonPath"]);
  const stdoutPath = textField(details, ["stdoutPath"]);
  const stderrPath = textField(details, ["stderrPath"]);
  const managedFileArtifacts = managedFileArtifactsFromMetadata(details?.managedFileArtifacts);
  const providerCount = numberField(details, ["providerCount"]);
  const availableProviderCount = numberField(details, ["availableProviderCount"]);
  const rawNoSpeechGate = recordValue(details?.noSpeechGate);
  const noSpeechGateRmsDbfs = numberField(rawNoSpeechGate, ["rmsDbfs"]);
  const noSpeechGateThresholdDbfs = numberField(rawNoSpeechGate, ["thresholdDbfs"]);
  const noSpeechGate =
    noSpeechGateRmsDbfs !== undefined || noSpeechGateThresholdDbfs !== undefined
      ? {
          ...(noSpeechGateRmsDbfs !== undefined ? { rmsDbfs: noSpeechGateRmsDbfs } : {}),
          ...(noSpeechGateThresholdDbfs !== undefined ? { thresholdDbfs: noSpeechGateThresholdDbfs } : {}),
        }
      : undefined;
  const largeOutputPreview = toolLargeOutputPreviewFromMetadata(details?.largeOutputPreview ?? metadata?.largeOutputPreview);
  const telegramSessionSetup = telegramSessionSetupCardFromMetadata(details?.telegramSessionSetup);
  const messagingConversationDirectorySetup = messagingConversationDirectorySetupCardFromMetadata(
    details?.messagingConversationDirectorySetup,
  );
  const messagingRemoteSurfaceActivation = messagingRemoteSurfaceActivationCardFromMetadata(details?.messagingRemoteSurfaceActivation);
  const localDeepResearchStatus = recordValue(details?.localDeepResearchStatus);
  if (
    diff === undefined &&
    firstChangedLine === undefined &&
    mediaArtifact === undefined &&
    runtime === undefined &&
    toolName === undefined &&
    status === undefined &&
    stage === undefined &&
    statusMessage === undefined &&
    activityMessage === undefined &&
    targetUrl === undefined &&
    elapsedMs === undefined &&
    outputChars === undefined &&
    thinkingChars === undefined &&
    idleElapsedMs === undefined &&
    idleTimeoutMs === undefined &&
    timeoutMode === undefined &&
    waitingOn === undefined &&
    approvalRequestId === undefined &&
    approvalTitle === undefined &&
    heartbeatCount === undefined &&
    testStatus === undefined &&
    providerCapabilityId === undefined &&
    previousProviderCapabilityId === undefined &&
    selectedProviderCapabilityId === undefined &&
    voiceId === undefined &&
    selectedVoiceId === undefined &&
    audioPath === undefined &&
    mimeType === undefined &&
    durationMs === undefined &&
    readiness === undefined &&
    readyForSelection === undefined &&
    shouldRetryStatus === undefined &&
    cacheStatus === undefined &&
    progressPercent === undefined &&
    retryAfterSeconds === undefined &&
    dashboardUrl === undefined &&
    verificationUrl === undefined &&
    failureReason === undefined &&
    localArtifactPaths === undefined &&
    missingLocalArtifactPaths === undefined &&
    language === undefined &&
    transcript === undefined &&
    normalizedAudioPath === undefined &&
    transcriptPath === undefined &&
    jsonPath === undefined &&
    stdoutPath === undefined &&
    stderrPath === undefined &&
    managedFileArtifacts === undefined &&
    providerCount === undefined &&
    availableProviderCount === undefined &&
    noSpeechGate === undefined &&
    largeOutputPreview === undefined &&
    telegramSessionSetup === undefined &&
    messagingConversationDirectorySetup === undefined &&
    messagingRemoteSurfaceActivation === undefined &&
    localDeepResearchStatus === undefined
  )
    return undefined;
  return {
    ...(diff !== undefined ? { diff } : {}),
    ...(firstChangedLine !== undefined ? { firstChangedLine } : {}),
    ...(mediaArtifact !== undefined ? { mediaArtifact } : {}),
    ...(runtime !== undefined ? { runtime } : {}),
    ...(toolName !== undefined ? { toolName } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(stage !== undefined ? { stage } : {}),
    ...(statusMessage !== undefined ? { statusMessage } : {}),
    ...(activityMessage !== undefined ? { activityMessage } : {}),
    ...(targetUrl !== undefined ? { targetUrl } : {}),
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...(outputChars !== undefined ? { outputChars } : {}),
    ...(thinkingChars !== undefined ? { thinkingChars } : {}),
    ...(idleElapsedMs !== undefined ? { idleElapsedMs } : {}),
    ...(idleTimeoutMs !== undefined ? { idleTimeoutMs } : {}),
    ...(timeoutMode !== undefined ? { timeoutMode } : {}),
    ...(waitingOn !== undefined ? { waitingOn } : {}),
    ...(approvalRequestId !== undefined ? { approvalRequestId } : {}),
    ...(approvalTitle !== undefined ? { approvalTitle } : {}),
    ...(heartbeatCount !== undefined ? { heartbeatCount } : {}),
    ...(testStatus !== undefined ? { testStatus } : {}),
    ...(providerCapabilityId !== undefined ? { providerCapabilityId } : {}),
    ...(previousProviderCapabilityId !== undefined ? { previousProviderCapabilityId } : {}),
    ...(selectedProviderCapabilityId !== undefined ? { selectedProviderCapabilityId } : {}),
    ...(voiceId !== undefined ? { voiceId } : {}),
    ...(selectedVoiceId !== undefined ? { selectedVoiceId } : {}),
    ...(audioPath !== undefined ? { audioPath } : {}),
    ...(mimeType !== undefined ? { mimeType } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(readiness !== undefined ? { readiness } : {}),
    ...(readyForSelection !== undefined ? { readyForSelection } : {}),
    ...(shouldRetryStatus !== undefined ? { shouldRetryStatus } : {}),
    ...(cacheStatus !== undefined ? { cacheStatus } : {}),
    ...(progressPercent !== undefined ? { progressPercent } : {}),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    ...(dashboardUrl !== undefined ? { dashboardUrl } : {}),
    ...(verificationUrl !== undefined ? { verificationUrl } : {}),
    ...(failureReason !== undefined ? { failureReason } : {}),
    ...(localArtifactPaths !== undefined ? { localArtifactPaths } : {}),
    ...(missingLocalArtifactPaths !== undefined ? { missingLocalArtifactPaths } : {}),
    ...(language !== undefined ? { language } : {}),
    ...(transcript !== undefined ? { transcript } : {}),
    ...(normalizedAudioPath !== undefined ? { normalizedAudioPath } : {}),
    ...(transcriptPath !== undefined ? { transcriptPath } : {}),
    ...(jsonPath !== undefined ? { jsonPath } : {}),
    ...(stdoutPath !== undefined ? { stdoutPath } : {}),
    ...(stderrPath !== undefined ? { stderrPath } : {}),
    ...(managedFileArtifacts !== undefined ? { managedFileArtifacts } : {}),
    ...(providerCount !== undefined ? { providerCount } : {}),
    ...(availableProviderCount !== undefined ? { availableProviderCount } : {}),
    ...(noSpeechGate !== undefined ? { noSpeechGate } : {}),
    ...(largeOutputPreview !== undefined ? { largeOutputPreview } : {}),
    ...(telegramSessionSetup !== undefined ? { telegramSessionSetup } : {}),
    ...(messagingConversationDirectorySetup !== undefined ? { messagingConversationDirectorySetup } : {}),
    ...(messagingRemoteSurfaceActivation !== undefined ? { messagingRemoteSurfaceActivation } : {}),
    ...(localDeepResearchStatus !== undefined ? { localDeepResearchStatus } : {}),
  };
}
