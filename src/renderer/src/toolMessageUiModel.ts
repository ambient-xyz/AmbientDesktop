import type {
  ChatMessage,
  MediaArtifactResult,
  ToolArgumentProgressSnapshot,
  ToolEditTextPreview,
  ToolLargeOutputPreview,
  ToolLargeOutputPreviewItem,
  ToolLongformInputPreview,
  ToolLongformInputPreviewItem,
} from "../../shared/types";
import type {
  MessagingConversationDirectorySetupCard,
  MessagingConversationDirectorySetupCardConversation,
  MessagingRemoteSurfaceActivationCard,
  MessagingRemoteSurfaceActivationCardPhase,
  TelegramSessionSetupCard,
} from "../../shared/messagingGateway";

export type ArtifactPathHints = Map<string, string>;

export type ArtifactMediaKind = "image" | "audio" | "video";

export type ArtifactPreviewRoute =
  | { kind: "local-file" }
  | { kind: "workspace-file" }
  | { kind: "workspace-media"; mediaKind: Extract<ArtifactMediaKind, "image" | "video"> };

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

export type ToolManagedFileArtifactPreviewData = {
  filename: string;
  bytes?: number;
  source?: string;
  containerPath?: string;
  hostPath?: string;
  workspacePath?: string;
  copySkippedReason?: string;
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

export type ToolTelegramSessionSetupPreviewData = TelegramSessionSetupCard;
export type ToolMessagingConversationDirectorySetupPreviewData = MessagingConversationDirectorySetupCard;
export type ToolMessagingRemoteSurfaceActivationPreviewData = MessagingRemoteSurfaceActivationCard;

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

export type ToolMessagingConversationDirectorySetupTone = "success" | "warning" | "danger" | "info";

export type ToolMessagingConversationDirectorySetupCardViewModel = {
  tone: ToolMessagingConversationDirectorySetupTone;
  title: string;
  summary: string;
  detail: string;
  icon: "success" | "attention" | "directory";
  rows: Array<{ label: string; value: string }>;
  notes: string[];
  noteKind: "blocker" | "warning" | "next-step" | "none";
  conversationChips: Array<{ label: string; title: string }>;
  safetyChips: string[];
};

export type ToolMessagingRemoteSurfaceActivationTone = "success" | "warning" | "danger" | "info";

export type ToolMessagingRemoteSurfaceActivationCardViewModel = {
  tone: ToolMessagingRemoteSurfaceActivationTone;
  title: string;
  summary: string;
  detail: string;
  icon: "success" | "attention" | "route";
  actions: Array<{
    id: "continue" | "repair" | "provider-onboarding";
    label: string;
    title: string;
    prompt: string;
    tone: "primary" | "secondary";
  }>;
  rows: Array<{ label: string; value: string }>;
  notes: string[];
  phaseChips: Array<{ label: string; title: string; tone: ToolMessagingRemoteSurfaceActivationTone }>;
  safetyChips: string[];
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

export type ToolProgressPreviewRow = {
  key: string;
  label: string;
  value: string;
};

export type ToolProgressPreviewData = {
  title: "Progress";
  summary: string;
  rows: ToolProgressPreviewRow[];
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
    ...(artifact.workspacePath ? { workspacePath: normalizeArtifactPath(artifact.workspacePath, workspacePath) ?? artifact.workspacePath } : {}),
  }));
  const firstManagedWorkspaceArtifact = managedFileArtifacts.find((artifact) => artifact.workspacePath)?.workspacePath;
  const longformArtifactPath = longformInputPreview?.items.find((item) => item.path)?.path;
  const artifactPath = normalizeArtifactPath(
    firstManagedWorkspaceArtifact ??
      extractArtifactPath(fallbackName, input, result, metadata, longformArtifactPath ?? writePreview?.path ?? editPreview?.path ?? voicePreview?.audioPath ?? sttPreview?.audioPath),
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

export function toolMessagingConversationDirectorySetupCardViewModel(
  card: ToolMessagingConversationDirectorySetupPreviewData,
): ToolMessagingConversationDirectorySetupCardViewModel {
  const providerTitle = card.providerLabel ?? card.providerId;
  const tone = messagingConversationDirectorySetupTone(card);
  const notes = card.blockers.length ? card.blockers : card.warnings.length ? card.warnings : card.nextSteps;
  const noteKind = card.blockers.length ? "blocker" : card.warnings.length ? "warning" : card.nextSteps.length ? "next-step" : "none";
  const conversationChips = card.conversations.slice(0, 8).map((conversation) => ({
    label: `${conversation.title}${typeof conversation.unreadCount === "number" && conversation.unreadCount > 0 ? ` (${conversation.unreadCount})` : ""}`,
    title: conversation.conversationId,
  }));
  const hiddenConversationCount = Math.max(0, card.conversations.length - conversationChips.length);
  if (hiddenConversationCount > 0) {
    conversationChips.push({
      label: `${hiddenConversationCount.toLocaleString()} more`,
      title: `${hiddenConversationCount.toLocaleString()} additional conversation metadata row(s) omitted from this compact card`,
    });
  }
  return {
    tone,
    title: `${providerTitle} conversation directory`,
    summary: messagingConversationDirectorySetupSummary(card),
    detail: card.failureHint ?? (card.canApplyNow
      ? "Ready for an approved metadata-only directory read."
      : "Blocked until provider readiness or adapter support is available."),
    icon: card.status === "applied"
      ? "success"
      : card.status === "blocked" || card.status === "failed"
        ? "attention"
        : "directory",
    rows: [
      { label: "Provider", value: card.providerLabel ? `${card.providerLabel} (${card.providerId})` : card.providerId },
      { label: "State", value: messagingConversationDirectorySetupStatusLabel(card.status) },
      card.directoryStatus ? { label: "Directory", value: formatCompactTaskState(card.directoryStatus) } : undefined,
      { label: "Adapter", value: `${card.adapterStatus} / ${card.adapterKind}` },
      { label: "Preview tool", value: card.previewToolName },
      card.applyToolName ? { label: "Apply tool", value: card.applyToolName } : undefined,
      { label: "Approval", value: card.requiresApprovalForApply ? (card.approvalRecorded ? "recorded" : "required") : "not required" },
      { label: "Counts", value: `${card.returnedConversationCount.toLocaleString()}/${card.fetchedConversationCount.toLocaleString()} returned` },
      card.failureMode ? { label: "Failure", value: card.failureMode } : undefined,
    ].filter((row): row is { label: string; value: string } => Boolean(row?.value)),
    notes: notes.slice(0, 3),
    noteKind,
    conversationChips,
    safetyChips: [
      "No message reads",
      "No history",
      "No sends",
      "No provider CLI",
      "No desktop scrape",
      "No bindings",
    ],
  };
}

export function toolMessagingRemoteSurfaceActivationCardViewModel(
  card: ToolMessagingRemoteSurfaceActivationPreviewData,
): ToolMessagingRemoteSurfaceActivationCardViewModel {
  const tone = messagingRemoteSurfaceActivationTone(card);
  const phase = card.currentPhase;
  const phaseChips = card.phaseChips.slice(0, 8).map((item) => ({
    label: `${shortActivationPhaseLabel(item)}: ${formatCompactTaskState(item.status)}`,
    title: item.nextTool ? `${item.title} · ${item.nextTool}` : item.title,
    tone: messagingRemoteSurfaceActivationPhaseTone(item),
  }));
  const hiddenPhaseCount = Math.max(0, card.phaseChips.length - phaseChips.length);
  if (hiddenPhaseCount > 0) {
    phaseChips.push({
      label: `${hiddenPhaseCount.toLocaleString()} more`,
      title: `${hiddenPhaseCount.toLocaleString()} activation phase(s) omitted from this compact card`,
      tone: "info",
    });
  }
  return {
    tone,
    title: card.title,
    summary: card.summary,
    detail: card.detail,
    icon: tone === "success" ? "success" : tone === "danger" || tone === "warning" ? "attention" : "route",
    actions: messagingRemoteSurfaceActivationActions(card),
    rows: [
      { label: "Surface", value: card.ambientSurface },
      card.providerLabel || card.providerId ? { label: "Provider", value: card.providerLabel ? `${card.providerLabel}${card.providerId ? ` (${card.providerId})` : ""}` : card.providerId! } : undefined,
      { label: "State", value: messagingRemoteSurfaceActivationStatusLabel(card.status) },
      phase ? { label: "Current phase", value: phase.title } : undefined,
      phase?.nextTool ? { label: "Phase tool", value: phase.nextTool } : undefined,
      card.recommendedNextTool ? { label: "Next tool", value: card.recommendedNextTool } : undefined,
      card.delegatedRecommendedNextTool ? { label: "After plan", value: card.delegatedRecommendedNextTool } : undefined,
      card.activationPlanFirstTool ? { label: "Plan first", value: card.activationPlanFirstTool } : undefined,
      card.blockedUntilActivationPlan.length ? { label: "Blocked tools", value: `${card.blockedUntilActivationPlan.length.toLocaleString()} until activation plan` } : undefined,
      { label: "Provider send", value: card.previewSendSafety.providerSendRequiresSeparateApproval ? "separate approval required" : "not approved" },
    ].filter((row): row is { label: string; value: string } => Boolean(row?.value)),
    notes: (card.repairPrompts.length ? card.repairPrompts : card.repairPrompt ? [card.repairPrompt] : []).slice(0, 3),
    phaseChips,
    safetyChips: [
      "No bridge start",
      "No message reads",
      "No history",
      "No sends",
      "No polling start",
      "Preview before send",
    ],
  };
}

export function resolveInlineArtifactPath(value: string, hints: ArtifactPathHints | undefined, workspacePath?: string): string | undefined {
  const cleaned = cleanArtifactPath(value)?.replace(/^\.\//, "");
  if (!cleaned || cleaned.endsWith("/") || !/\.[a-z0-9]{1,8}$/i.test(cleaned)) return undefined;
  const hinted = hints?.get(cleaned) ?? hints?.get(`./${cleaned}`);
  if (hinted) return hinted;
  const workspacePathRelative = workspacePath ? workspaceRelativeArtifactPath(cleaned, workspacePath) : undefined;
  if (workspacePathRelative) return workspacePathRelative;
  return workspacePath && isSafeWorkspaceRelativeArtifactPath(cleaned) ? cleaned : undefined;
}

function workspaceRelativeArtifactPath(path: string, workspacePath: string): string | undefined {
  const localPath = fileUrlToLocalPath(path) ?? path;
  const workspace = workspacePath.replace(/\/+$/, "");
  if (!workspace || !localPath.startsWith("/")) return undefined;
  if (localPath === workspace) return ".";
  const prefix = `${workspace}/`;
  return localPath.startsWith(prefix) ? localPath.slice(prefix.length) : undefined;
}

function isSafeWorkspaceRelativeArtifactPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.startsWith("~")) return false;
  if (path.startsWith("../") || path.includes("/../") || path.includes("\\..\\")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || /^[a-z]:[\\/]/i.test(path)) return false;
  return !/[\0\r\n]/.test(path);
}

function fileUrlToLocalPath(value: string): string | undefined {
  if (!/^file:\/\//i.test(value)) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "file:" ? decodeURIComponent(parsed.pathname) : undefined;
  } catch {
    return undefined;
  }
}

export function artifactMediaKindFromPath(path: string): ArtifactMediaKind | undefined {
  const extension = path.toLowerCase().match(/\.([a-z0-9]+)(?:[#?].*)?$/)?.[1];
  if (!extension) return undefined;
  if (["apng", "avif", "gif", "jpg", "jpeg", "png", "svg", "webp"].includes(extension)) return "image";
  if (["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "weba"].includes(extension)) return "audio";
  if (["m4v", "mov", "mp4", "ogv", "webm"].includes(extension)) return "video";
  return undefined;
}

export function isAbsoluteArtifactPath(path: string): boolean {
  return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

export function artifactPreviewRoute(path: string): ArtifactPreviewRoute {
  if (isAbsoluteArtifactPath(path)) return { kind: "local-file" };
  const mediaKind = artifactMediaKindFromPath(path);
  if (mediaKind === "image" || mediaKind === "video") return { kind: "workspace-media", mediaKind };
  return { kind: "workspace-file" };
}

export function mediaPreviewUnavailableMessage(kind: ArtifactMediaKind): string {
  if (kind === "image") return "File is not a valid image.";
  if (kind === "audio") return "Audio playback is not supported by this Electron build or codec.";
  return "Video playback is not supported by this Electron build or codec.";
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

function toolProgressPreview(input: {
  toolName: string;
  input: string;
  result: string;
  argumentProgress?: ToolArgumentProgressSnapshot;
  toolResultDetails?: ToolResultDetails;
}): ToolProgressPreviewData | undefined {
  const details = input.toolResultDetails;
  const argumentProgress = input.argumentProgress;
  const localDeepResearchPreview = localDeepResearchProgressPreview(details, argumentProgress, input.toolName);
  if (localDeepResearchPreview) return localDeepResearchPreview;
  const hasLiveProgress =
    (argumentProgress?.phase !== undefined && argumentProgress.phase !== "completed") ||
    details?.stage !== undefined ||
    details?.elapsedMs !== undefined ||
    details?.heartbeatCount !== undefined ||
    details?.progressPercent !== undefined;
  if (!hasLiveProgress) return undefined;

  const rows: ToolProgressPreviewRow[] = [];
  const inputChars = argumentProgress?.observedArgumentChars ?? (input.input ? input.input.length : undefined);
  const outputChars = details?.outputChars;
  const thinkingChars = details?.thinkingChars;
  const elapsedMs = details?.elapsedMs ?? argumentProgress?.executionElapsedMs ?? argumentProgress?.argumentElapsedMs;
  const state = details?.status
    ? formatCompactTaskState(details.status)
    : argumentProgress?.phase
      ? formatCompactTaskState(argumentProgress.phase)
      : undefined;
  const updates = details?.heartbeatCount !== undefined
    ? details.heartbeatCount.toLocaleString()
    : argumentProgress?.argumentEventCount !== undefined
      ? argumentProgress.argumentEventCount.toLocaleString()
      : undefined;

  addProgressRow(rows, "state", "State", state);
  addProgressRow(rows, "stage", "Stage", details?.stage ? formatCompactTaskState(details.stage) : undefined);
  addProgressRow(rows, "input", "Input", progressCharsLabel(inputChars));
  addProgressRow(rows, "output", "Output", progressCharsLabel(outputChars));
  addProgressRow(rows, "thinking", "Thinking", progressCharsLabel(thinkingChars));
  addProgressRow(rows, "elapsed", "Elapsed", formatProgressDuration(elapsedMs));
  addProgressRow(rows, "idle", "Idle", formatProgressDuration(details?.idleElapsedMs));
  addProgressRow(rows, "idle-timeout", "Idle timeout", formatProgressDuration(details?.idleTimeoutMs));
  addProgressRow(rows, "timeout-mode", "Timeout", details?.timeoutMode ? formatCompactTaskState(details.timeoutMode) : undefined);
  addProgressRow(rows, "updates", "Updates", updates);
  addProgressRow(rows, "progress", "Progress", details?.progressPercent !== undefined ? `${details.progressPercent}%` : undefined);
  addProgressRow(rows, "waiting-on", "Waiting on", details?.waitingOn ? formatCompactTaskState(details.waitingOn) : undefined);
  addProgressRow(rows, "approval", "Approval", details?.approvalTitle ?? details?.approvalRequestId);
  addProgressRow(rows, "target", "Target", details?.targetUrl);
  if (!rows.length) return undefined;

  return {
    title: "Progress",
    summary: [
      state,
      details?.stage ? formatCompactTaskState(details.stage) : undefined,
      formatProgressDuration(details?.elapsedMs ?? argumentProgress?.executionElapsedMs),
      progressCharsLabel(inputChars),
      outputChars !== undefined ? `${outputChars.toLocaleString()} output chars` : undefined,
      thinkingChars !== undefined && thinkingChars > 0 ? `${thinkingChars.toLocaleString()} thinking chars` : undefined,
    ].filter(Boolean).join(" · ") || `${input.toolName} progress`,
    rows,
  };
}

function localDeepResearchProgressPreview(
  details: ToolResultDetails | undefined,
  argumentProgress: ToolArgumentProgressSnapshot | undefined,
  toolName: string,
): ToolProgressPreviewData | undefined {
  const status = recordValue(details?.localDeepResearchStatus);
  if (!status && details?.runtime !== "ambient-local-deep-research") return undefined;
  const stage = textField(status, ["stage"]) ?? details?.stage;
  const state = textField(status, ["state"]) ?? details?.status;
  const message = textField(status, ["activityMessage", "message"]) ?? details?.activityMessage ?? details?.statusMessage;
  const elapsedMs = maxFiniteNumber(
    numberField(status, ["elapsedMs"]),
    details?.elapsedMs,
    argumentProgress?.executionElapsedMs,
    argumentProgress?.argumentElapsedMs,
  );
  const heartbeatCount = numberField(status, ["heartbeatCount"]) ?? details?.heartbeatCount;
  const argumentUpdateCount = argumentProgress?.argumentEventCount;
  const turn = recordValue(status?.turn);
  const retrieval = recordValue(status?.retrieval);
  const memory = recordValue(status?.memory);
  const llamaServer = recordValue(status?.llamaServer);
  const artifacts = recordValue(status?.artifacts);
  const error = textField(status, ["error"]);
  const rows: ToolProgressPreviewRow[] = [];

  const turnValue = localDeepResearchTurnValue(turn);
  const retrievalValue = localDeepResearchRetrievalValue(retrieval);
  const memoryPolicy = localDeepResearchMemoryPolicyValue(memory);
  const serverValue = localDeepResearchServerValue(llamaServer);

  addProgressRow(rows, "state", "State", state ? formatCompactTaskState(state) : undefined);
  addProgressRow(rows, "stage", "Stage", stage ? formatCompactTaskState(stage) : undefined);
  addProgressRow(rows, "message", "Status", message);
  addProgressRow(rows, "turn", "Turn", turnValue);
  addProgressRow(rows, "retrieval", "Retrieval", retrievalValue);
  addProgressRow(rows, "provider", "Provider", textField(retrieval, ["providerLabel"]) ?? textField(retrieval, ["providerId"]));
  addProgressRow(rows, "query", "Query", textField(retrieval, ["query"]));
  addProgressRow(rows, "target", "Target", textField(retrieval, ["url"]) ?? details?.targetUrl);
  addProgressRow(rows, "result", "Result", localDeepResearchRetrievalResultValue(retrieval));
  addProgressRow(rows, "server", "llama.cpp", serverValue);
  addProgressRow(rows, "rss", "Server RSS", formatBytes(numberField(llamaServer, ["rssBytes"])));
  addProgressRow(rows, "memory-policy", "Memory policy", memoryPolicy);
  addProgressRow(rows, "local-models", "Resident models", localDeepResearchResidentModelsValue(memory));
  addProgressRow(rows, "projected-use", "Projected use", localDeepResearchProjectedUseValue(memory));
  addProgressRow(rows, "host-free", "Host free", formatBytes(numberField(memory, ["hostFreeMemoryBytes"])));
  addProgressRow(rows, "swap", "Swap used", formatBytes(numberField(memory, ["swapUsedBytes"])));
  addProgressRow(rows, "compressed", "Compressed", formatBytes(numberField(memory, ["compressedMemoryBytes"])));
  addProgressRow(rows, "elapsed", "Elapsed", formatProgressDuration(elapsedMs));
  addProgressRow(rows, "updates", "Updates", heartbeatCount !== undefined ? heartbeatCount.toLocaleString() : undefined);
  addProgressRow(rows, "argument-updates", "Argument updates", heartbeatCount === undefined && argumentUpdateCount !== undefined ? argumentUpdateCount.toLocaleString() : undefined);
  addProgressRow(rows, "artifacts", "Artifacts", localDeepResearchArtifactValue(artifacts));
  addProgressRow(rows, "error", "Error", error);
  if (!rows.length) return undefined;

  return {
    title: "Progress",
    summary: [
      message,
      turnValue,
      retrievalValue,
      memoryPolicy && !/\bwithin\b|\bunlimited\b/i.test(memoryPolicy) ? memoryPolicy : undefined,
      formatProgressDuration(elapsedMs),
    ].filter(Boolean).join(" · ") || `${toolName} progress`,
    rows,
  };
}

function localDeepResearchTurnValue(turn: Record<string, unknown> | undefined): string | undefined {
  const current = numberField(turn, ["turn"]);
  const maxTurns = numberField(turn, ["maxTurns"]);
  const toolCalls = numberField(turn, ["toolCalls"]);
  const maxToolCalls = numberField(turn, ["maxToolCalls"]);
  const turnPart = current !== undefined && maxTurns !== undefined ? `${current}/${maxTurns}` : undefined;
  const toolPart = toolCalls !== undefined && maxToolCalls !== undefined ? `${toolCalls}/${maxToolCalls} tools` : undefined;
  return [turnPart, toolPart].filter(Boolean).join(" · ") || undefined;
}

function localDeepResearchRetrievalValue(retrieval: Record<string, unknown> | undefined): string | undefined {
  const role = textField(retrieval, ["role"]);
  const status = textField(retrieval, ["status"]);
  const repeated = numberField(retrieval, ["repeatedVisitCount"]);
  const parts = [
    role ? formatCompactTaskState(role) : undefined,
    status ? formatCompactTaskState(status) : undefined,
    repeated !== undefined && repeated > 1 ? `repeat ${repeated}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

function localDeepResearchRetrievalResultValue(retrieval: Record<string, unknown> | undefined): string | undefined {
  const resultCount = numberField(retrieval, ["resultCount"]);
  const outputChars = numberField(retrieval, ["outputChars"]);
  const durationMs = numberField(retrieval, ["durationMs"]);
  const failureReason = textField(retrieval, ["failureReason"]);
  if (failureReason) return failureReason;
  const parts = [
    resultCount !== undefined ? `${resultCount.toLocaleString()} results` : undefined,
    outputChars !== undefined ? `${outputChars.toLocaleString()} chars` : undefined,
    formatProgressDuration(durationMs),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

function localDeepResearchServerValue(server: Record<string, unknown> | undefined): string | undefined {
  const pid = numberField(server, ["pid"]);
  const endpoint = textField(server, ["endpointUrl"]);
  const healthy = booleanField(server, ["healthy"]);
  const latency = formatProgressDuration(numberField(server, ["healthLatencyMs"]));
  const health = healthy === undefined ? undefined : healthy ? "healthy" : "unhealthy";
  const pidPart = pid !== undefined ? `pid ${pid}` : undefined;
  return [health, latency, pidPart, endpoint].filter(Boolean).join(" · ") || undefined;
}

function localDeepResearchMemoryPolicyValue(memory: Record<string, unknown> | undefined): string | undefined {
  const outcome = textField(memory, ["policyOutcome"]);
  const reason = textField(memory, ["policyReason"]);
  if (!outcome && !reason) return undefined;
  return [outcome ? formatCompactTaskState(outcome) : undefined, reason].filter(Boolean).join(" · ");
}

function localDeepResearchResidentModelsValue(memory: Record<string, unknown> | undefined): string | undefined {
  const count = numberField(memory, ["activeLocalModelCount"]);
  const estimated = formatBytes(numberField(memory, ["activeEstimatedResidentMemoryBytes"]));
  const actual = formatBytes(numberField(memory, ["activeActualResidentMemoryBytes"]));
  if (count === undefined && !estimated && !actual) return undefined;
  return [
    count !== undefined ? count.toLocaleString() : undefined,
    estimated ? `${estimated} estimated` : undefined,
    actual ? `${actual} actual` : undefined,
  ].filter(Boolean).join(" · ");
}

function localDeepResearchProjectedUseValue(memory: Record<string, unknown> | undefined): string | undefined {
  const projectedPercent = formatPercent(numberField(memory, ["projectedSystemMemoryUtilization"]));
  const maxPercent = formatPercent(numberField(memory, ["maxProjectedMemoryUtilization"]));
  const projectedFree = formatBytes(numberField(memory, ["projectedFreeMemoryBytes"]));
  const projectedResident = formatBytes(numberField(memory, ["projectedResidentMemoryBytes", "projectedEstimatedResidentMemoryBytes"]));
  const parts = [
    projectedPercent ? `${projectedPercent} projected` : undefined,
    maxPercent ? `${maxPercent} ceiling` : undefined,
    projectedFree ? `${projectedFree} free` : undefined,
    projectedResident ? `${projectedResident} resident` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

function localDeepResearchArtifactValue(artifacts: Record<string, unknown> | undefined): string | undefined {
  const markdownPath = textField(artifacts, ["markdownPath"]);
  const jsonPath = textField(artifacts, ["jsonPath"]);
  return markdownPath ?? jsonPath;
}

function addProgressRow(rows: ToolProgressPreviewRow[], key: string, label: string, value: string | undefined): void {
  if (!value) return;
  rows.push({ key, label, value });
}

function maxFiniteNumber(...values: Array<number | undefined>): number | undefined {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finite.length ? Math.max(...finite) : undefined;
}

function progressCharsLabel(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  return `${Math.max(0, Math.round(value)).toLocaleString()} chars`;
}

function formatProgressDuration(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const ms = Math.max(0, Math.round(value));
  if (ms < 1000) return `${ms} ms`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return seconds ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatBytes(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const bytes = Math.max(0, value);
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function formatPercent(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const percent = value <= 1 ? value * 100 : value;
  return `${Math.round(percent)}%`;
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
    return [
      title ?? intent ?? id,
      baseVersion !== undefined ? `base v${baseVersion}` : undefined,
      draft ? "draft update" : undefined,
    ]
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
    return [
      id,
      version !== undefined ? `v${version}` : undefined,
      includeMarkdown ? "include markdown" : undefined,
    ]
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
  const line = value.split(/\r?\n/).find((item) => item.trim())?.trim() ?? "";
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
  const items = preview.files.map((file, index): ToolLongformInputPreviewItem => ({
    label: preview.files.length === 1 ? "File" : `File ${index + 1}`,
    fieldPath: `files[${index}].content`,
    path: file.path,
    ...(file.language ? { language: file.language } : {}),
    preview: file.content,
    chars: file.charCount,
    truncated: /\(\d[\d,]* chars total\)\s*$/.test(file.content),
    ...(file.rationale ? { note: file.rationale } : {}),
  }));
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
    pathField(args, ["path", "filePath", "file_path", "file", "targetPath", "target_path"]) ??
    pathField(metadata, ["artifactPath"]);
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

function extractTelegramSessionSetupPreview(toolName: string, metadata?: Record<string, unknown>): ToolTelegramSessionSetupPreviewData | undefined {
  const normalized = toolName.toLowerCase();
  if (normalized !== "ambient_messaging_telegram_session_preview" && normalized !== "ambient_messaging_telegram_session_apply") return undefined;
  return toolResultDetailsFromMetadata(metadata)?.telegramSessionSetup;
}

function extractMessagingConversationDirectorySetupPreview(
  toolName: string,
  metadata?: Record<string, unknown>,
): ToolMessagingConversationDirectorySetupPreviewData | undefined {
  const normalized = toolName.toLowerCase();
  if (!normalized.startsWith("ambient_messaging_") || !normalized.includes("_conversation_directory_")) return undefined;
  return toolResultDetailsFromMetadata(metadata)?.messagingConversationDirectorySetup;
}

function extractMessagingRemoteSurfaceActivationPreview(
  toolName: string,
  metadata?: Record<string, unknown>,
): ToolMessagingRemoteSurfaceActivationPreviewData | undefined {
  const normalized = toolName.toLowerCase();
  if (normalized !== "ambient_messaging_remote_surface_activation_plan" && normalized !== "ambient_messaging_telegram_owner_loop_activation_plan") return undefined;
  return toolResultDetailsFromMetadata(metadata)?.messagingRemoteSurfaceActivation;
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
  const confidence = textField(summary, ["confidence"]) ?? textField(details, ["confidence"]) ?? result.match(/^Confidence:\s+(.+)$/m)?.[1]?.trim();
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
    ...(booleanField(secretHandling, ["requiresSecret"]) !== undefined ? { requiresSecret: booleanField(secretHandling, ["requiresSecret"]) } : {}),
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

function telegramSessionSetupCardFromMetadata(value: unknown): ToolTelegramSessionSetupPreviewData | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "telegram-session-setup") return undefined;
  const providerId = nonEmptyTextField(record, ["providerId"]);
  const profileId = nonEmptyTextField(record, ["profileId"]);
  const action = nonEmptyTextField(record, ["action"]);
  const status = telegramSessionSetupStatusField(record.status);
  const title = nonEmptyTextField(record, ["title"]);
  const summary = nonEmptyTextField(record, ["summary"]);
  const detail = nonEmptyTextField(record, ["detail"]);
  if (!providerId || !profileId || !action || !status || !title || !summary || !detail) return undefined;
  const authState = telegramSessionSetupAuthStateFromMetadata(record.authState);
  const primaryAction = telegramSessionSetupActionFromMetadata(record.primaryAction);
  const checkedAt = nonEmptyTextField(record, ["checkedAt"]);
  const applied = booleanField(record, ["applied"]);
  const secondaryActions = Array.isArray(record.secondaryActions)
    ? record.secondaryActions.flatMap((item): TelegramSessionSetupCard["secondaryActions"] => {
        const parsed = telegramSessionSetupActionFromMetadata(item);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    kind: "telegram-session-setup",
    providerId,
    profileId,
    action,
    status,
    title,
    summary,
    detail,
    ...(checkedAt ? { checkedAt } : {}),
    ...(applied !== undefined ? { applied } : {}),
    ...(authState ? { authState } : {}),
    missingInputs: stringArrayField(record, ["missingInputs"]) ?? [],
    ...(primaryAction ? { primaryAction } : {}),
    secondaryActions,
    safety: {
      readsProviderMessages: false,
      sendsProviderMessages: false,
      createsBinding: false,
      enablesInboundIngestion: false,
    },
  };
}

function messagingConversationDirectorySetupCardFromMetadata(
  value: unknown,
): ToolMessagingConversationDirectorySetupPreviewData | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "messaging-conversation-directory-setup") return undefined;
  const providerId = nonEmptyTextField(record, ["providerId"]);
  const status = messagingConversationDirectorySetupStatusField(record.status);
  const adapterStatus = record.adapterStatus === "available" || record.adapterStatus === "blocked" ? record.adapterStatus : undefined;
  const adapterKind = record.adapterKind === "live-metadata-only-adapter" || record.adapterKind === "blocked-contract-skeleton" ? record.adapterKind : undefined;
  const previewToolName = nonEmptyTextField(record, ["previewToolName"]);
  if (!providerId || !status || !adapterStatus || !adapterKind || !previewToolName) return undefined;
  if (record.metadataOnlyContractKind !== "metadata-only-routing") return undefined;
  const requiresApprovalForApply = booleanField(record, ["requiresApprovalForApply"]);
  const approvalRecorded = booleanField(record, ["approvalRecorded"]);
  const canApplyWithReadiness = booleanField(record, ["canApplyWithReadiness"]);
  const canApplyNow = booleanField(record, ["canApplyNow"]);
  const fetchedConversationCount = numberField(record, ["fetchedConversationCount"]);
  const returnedConversationCount = numberField(record, ["returnedConversationCount"]);
  if (
    requiresApprovalForApply === undefined ||
    approvalRecorded === undefined ||
    canApplyWithReadiness === undefined ||
    canApplyNow === undefined ||
    fetchedConversationCount === undefined ||
    returnedConversationCount === undefined
  ) return undefined;
  return {
    kind: "messaging-conversation-directory-setup",
    providerId,
    ...(nonEmptyTextField(record, ["providerLabel"]) ? { providerLabel: nonEmptyTextField(record, ["providerLabel"]) } : {}),
    status,
    ...(nonEmptyTextField(record, ["directoryStatus"]) ? { directoryStatus: nonEmptyTextField(record, ["directoryStatus"]) } : {}),
    adapterStatus,
    adapterKind,
    previewToolName,
    ...(nonEmptyTextField(record, ["applyToolName"]) ? { applyToolName: nonEmptyTextField(record, ["applyToolName"]) } : {}),
    requiresApprovalForApply,
    approvalRecorded,
    canApplyWithReadiness,
    canApplyNow,
    metadataOnlyContractKind: "metadata-only-routing",
    fetchedConversationCount: Math.max(0, Math.floor(fetchedConversationCount)),
    returnedConversationCount: Math.max(0, Math.floor(returnedConversationCount)),
    ...(nonEmptyTextField(record, ["failureMode"]) ? { failureMode: nonEmptyTextField(record, ["failureMode"]) } : {}),
    ...(nonEmptyTextField(record, ["failureHint"]) ? { failureHint: nonEmptyTextField(record, ["failureHint"]) } : {}),
    blockers: stringArrayField(record, ["blockers"]) ?? [],
    warnings: stringArrayField(record, ["warnings"]) ?? [],
    nextSteps: stringArrayField(record, ["nextSteps"]) ?? [],
    safety: {
      startsBridge: false,
      runsProviderCli: false,
      inspectsProviderDesktop: false,
      readsProviderMessages: false,
      readsProviderHistory: false,
      sendsProviderMessages: false,
      mutatesBindings: false,
    },
    conversations: messagingConversationDirectorySetupConversationsFromMetadata(record.conversations),
  };
}

function messagingRemoteSurfaceActivationCardFromMetadata(
  value: unknown,
): ToolMessagingRemoteSurfaceActivationPreviewData | undefined {
  const record = recordValue(value);
  if (!record || record.kind !== "messaging-remote-surface-activation") return undefined;
  if (record.intent !== "remote_ambient_surface") return undefined;
  const status = messagingRemoteSurfaceActivationStatusField(record.status);
  const title = nonEmptyTextField(record, ["title"]);
  const summary = nonEmptyTextField(record, ["summary"]);
  const detail = nonEmptyTextField(record, ["detail"]);
  const ambientSurface = messagingAmbientSurfaceField(record.ambientSurface);
  if (!status || !title || !summary || !detail || !ambientSurface) return undefined;
  const currentPhase = messagingRemoteSurfaceActivationPhaseFromMetadata(record.currentPhase);
  return {
    kind: "messaging-remote-surface-activation",
    intent: "remote_ambient_surface",
    ...(nonEmptyTextField(record, ["providerId"]) ? { providerId: nonEmptyTextField(record, ["providerId"]) } : {}),
    ...(nonEmptyTextField(record, ["providerLabel"]) ? { providerLabel: nonEmptyTextField(record, ["providerLabel"]) } : {}),
    ...(nonEmptyTextField(record, ["requestedProvider"]) ? { requestedProvider: nonEmptyTextField(record, ["requestedProvider"]) } : {}),
    status,
    title,
    summary,
    detail,
    ambientSurface,
    ...(currentPhase ? { currentPhase } : {}),
    phaseChips: messagingRemoteSurfaceActivationPhasesFromMetadata(record.phaseChips),
    ...(nonEmptyTextField(record, ["recommendedNextTool"]) ? { recommendedNextTool: nonEmptyTextField(record, ["recommendedNextTool"]) } : {}),
    ...(nonEmptyTextField(record, ["delegatedRecommendedNextTool"]) ? { delegatedRecommendedNextTool: nonEmptyTextField(record, ["delegatedRecommendedNextTool"]) } : {}),
    ...(nonEmptyTextField(record, ["activationPlanFirstTool"]) ? { activationPlanFirstTool: nonEmptyTextField(record, ["activationPlanFirstTool"]) } : {}),
    ...(nonEmptyTextField(record, ["repairPrompt"]) ? { repairPrompt: nonEmptyTextField(record, ["repairPrompt"]) } : {}),
    repairPrompts: stringArrayField(record, ["repairPrompts"]) ?? [],
    blockedUntilActivationPlan: stringArrayField(record, ["blockedUntilActivationPlan"]) ?? [],
    previewSendSafety: {
      commandPreviewTool: nonEmptyTextField(recordValue(record.previewSendSafety), ["commandPreviewTool"]) ?? "ambient_messaging_remote_surface_command_preview",
      replyPreviewTool: nonEmptyTextField(recordValue(record.previewSendSafety), ["replyPreviewTool"]) ?? "ambient_messaging_remote_surface_reply_preview",
      providerSendApplyTool: nonEmptyTextField(recordValue(record.previewSendSafety), ["providerSendApplyTool"]) ?? "ambient_messaging_remote_surface_reply_apply",
      previewRequiredBeforeProviderSend: true,
      providerSendRequiresSeparateApproval: true,
      providerSendReady: false,
    },
    safety: {
      startsBridge: false,
      listsProviderChats: false,
      readsProviderMessages: false,
      readsProviderHistory: false,
      mutatesBindings: false,
      startsPolling: false,
      sendsProviderMessages: false,
    },
  };
}

function messagingConversationDirectorySetupStatusField(
  value: unknown,
): MessagingConversationDirectorySetupCard["status"] | undefined {
  return value === "preview" ||
    value === "applied" ||
    value === "blocked" ||
    value === "denied" ||
    value === "failed"
    ? value
    : undefined;
}

function messagingRemoteSurfaceActivationStatusField(
  value: unknown,
): MessagingRemoteSurfaceActivationCard["status"] | undefined {
  return value === "route_ready" ||
    value === "needs_provider_choice" ||
    value === "unsupported_provider" ||
    value === "blocked" ||
    value === "active" ||
    value === "ready_to_start_polling" ||
    value === "needs_setup"
    ? value
    : undefined;
}

function messagingRemoteSurfaceActivationPhaseStatusField(
  value: unknown,
): MessagingRemoteSurfaceActivationCardPhase["status"] | undefined {
  return value === "complete" ||
    value === "ready" ||
    value === "waiting" ||
    value === "blocked" ||
    value === "optional"
    ? value
    : undefined;
}

function messagingRemoteSurfaceActivationPhaseFromMetadata(value: unknown): MessagingRemoteSurfaceActivationCardPhase | undefined {
  const record = recordValue(value);
  const id = nonEmptyTextField(record, ["id"]);
  const title = nonEmptyTextField(record, ["title"]);
  const status = messagingRemoteSurfaceActivationPhaseStatusField(record?.status);
  if (!id || !title || !status) return undefined;
  const blockerCount = numberField(record, ["blockerCount"]);
  return {
    id,
    title,
    status,
    approvalRequired: record?.approvalRequired === true,
    ...(nonEmptyTextField(record, ["nextTool"]) ? { nextTool: nonEmptyTextField(record, ["nextTool"]) } : {}),
    blockerCount: blockerCount === undefined ? 0 : Math.max(0, Math.floor(blockerCount)),
  };
}

function messagingRemoteSurfaceActivationPhasesFromMetadata(value: unknown): MessagingRemoteSurfaceActivationCardPhase[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): MessagingRemoteSurfaceActivationCardPhase[] => {
    const parsed = messagingRemoteSurfaceActivationPhaseFromMetadata(item);
    return parsed ? [parsed] : [];
  });
}

function messagingAmbientSurfaceField(value: unknown): MessagingRemoteSurfaceActivationCard["ambientSurface"] | undefined {
  return value === "chat" ||
    value === "projects" ||
    value === "workflow_agents" ||
    value === "settings" ||
    value === "notifications"
    ? value
    : undefined;
}

function messagingConversationDirectorySetupTone(
  card: ToolMessagingConversationDirectorySetupPreviewData,
): ToolMessagingConversationDirectorySetupTone {
  if (card.status === "applied") return "success";
  if (card.status === "blocked" || card.status === "failed") return "danger";
  if (card.status === "denied") return "warning";
  return card.canApplyNow ? "success" : "info";
}

function messagingConversationDirectorySetupSummary(card: ToolMessagingConversationDirectorySetupPreviewData): string {
  if (card.status === "applied") return `${card.returnedConversationCount.toLocaleString()} metadata row(s) available.`;
  if (card.status === "blocked") return "Directory apply is blocked by the adapter contract.";
  if (card.status === "denied") return "Directory read was not approved.";
  if (card.status === "failed") return "Directory read failed.";
  return card.canApplyNow ? "Preview is ready for approval." : "Preview found setup blockers.";
}

function messagingRemoteSurfaceActivationTone(
  card: ToolMessagingRemoteSurfaceActivationPreviewData,
): ToolMessagingRemoteSurfaceActivationTone {
  if (card.status === "active" || card.status === "ready_to_start_polling" || card.status === "route_ready") return "success";
  if (card.status === "needs_provider_choice" || card.status === "needs_setup") return "info";
  if (card.status === "unsupported_provider" || card.status === "blocked") return "danger";
  return "info";
}

function messagingRemoteSurfaceActivationPhaseTone(
  phase: MessagingRemoteSurfaceActivationCardPhase,
): ToolMessagingRemoteSurfaceActivationTone {
  if (phase.status === "complete") return "success";
  if (phase.status === "ready") return "info";
  if (phase.status === "waiting" || phase.status === "optional") return "warning";
  return "danger";
}

function messagingRemoteSurfaceActivationStatusLabel(
  status: ToolMessagingRemoteSurfaceActivationPreviewData["status"],
): string {
  if (status === "route_ready") return "Route ready";
  if (status === "needs_provider_choice") return "Needs provider choice";
  if (status === "unsupported_provider") return "Unsupported provider";
  if (status === "ready_to_start_polling") return "Ready to start polling";
  return formatCompactTaskState(status);
}

function messagingRemoteSurfaceActivationActions(
  card: ToolMessagingRemoteSurfaceActivationPreviewData,
): ToolMessagingRemoteSurfaceActivationCardViewModel["actions"] {
  const actions: ToolMessagingRemoteSurfaceActivationCardViewModel["actions"] = [];
  const nextTool = card.recommendedNextTool ?? card.currentPhase?.nextTool;
  if (nextTool) {
    actions.push({
      id: "continue",
      label: "Continue",
      title: `Ask Ambient to continue Remote Ambient Surface activation with ${nextTool}.`,
      prompt: remoteSurfaceActivationContinuePrompt(card, nextTool),
      tone: "primary",
    });
  }
  const repairPrompt = card.repairPrompt ?? card.repairPrompts[0];
  if (repairPrompt) {
    actions.push({
      id: "repair",
      label: nextTool ? "Repair" : "Use repair",
      title: "Ask Ambient to apply the first repair prompt from this activation card.",
      prompt: remoteSurfaceActivationRepairPrompt(card, repairPrompt),
      tone: "secondary",
    });
  }
  if (card.status === "unsupported_provider") {
    actions.push({
      id: "provider-onboarding",
      label: "Plan provider support",
      title: "Ask Ambient to plan future reviewed provider support without activating this provider now.",
      prompt: remoteSurfaceActivationProviderOnboardingPrompt(card),
      tone: "secondary",
    });
  }
  return actions;
}

function remoteSurfaceActivationContinuePrompt(
  card: ToolMessagingRemoteSurfaceActivationPreviewData,
  nextTool: string,
): string {
  return [
    `Continue Remote Ambient Surface activation by calling ${nextTool}.`,
    `Use the latest activation card/tool result in this thread for provider, surface (${card.ambientSurface}), profile, binding, and approval context.`,
    remoteSurfaceActivationPromptBoundary(),
  ].join(" ");
}

function remoteSurfaceActivationRepairPrompt(
  card: ToolMessagingRemoteSurfaceActivationPreviewData,
  repairPrompt: string,
): string {
  return [
    `Repair Remote Ambient Surface activation: ${repairPrompt}`,
    `Use the latest activation card/tool result in this thread for provider, surface (${card.ambientSurface}), and current phase context.`,
    remoteSurfaceActivationPromptBoundary(),
  ].join(" ");
}

function remoteSurfaceActivationProviderOnboardingPrompt(
  card: ToolMessagingRemoteSurfaceActivationPreviewData,
): string {
  const provider = card.requestedProvider ?? card.providerLabel ?? card.providerId ?? "this provider";
  return [
    `Plan future reviewed Remote Ambient Surface provider support for ${provider} by calling ambient_messaging_remote_surface_provider_support_plan first.`,
    `Pass provider exactly as ${provider} and ambientSurface exactly as ${card.ambientSurface}; use the latest activation card/tool result only as blocker context.`,
    "This is provider onboarding/planning, not active Remote Ambient Surface activation. After the planning tool returns, produce a concise plan and ask for approval before implementing, installing dependencies, scaffolding provider support, linking accounts/devices, or running validation.",
    "Do not call provider-specific low-level tools, provider desktop UI, shell, browser automation, provider CLIs, generic Messaging Connector setup, arbitrary history reads, provider message reads, provider sends, lifecycle/binding/polling/apply tools, or future-provider scaffolding unless the user explicitly approves implementation.",
    remoteSurfaceActivationPromptBoundary(),
  ].join(" ");
}

function remoteSurfaceActivationPromptBoundary(): string {
  return "Preserve the Remote Ambient Surface safety boundary: use preview tools before apply tools, do not read provider message bodies or history, do not use provider desktop UI, shell, browser automation, or provider CLIs as fallback, and do not send provider messages without an explicit approved preview.";
}

function shortActivationPhaseLabel(phase: MessagingRemoteSurfaceActivationCardPhase): string {
  if (phase.id === "product-provider-route") return "Route";
  if (phase.id === "provider-readiness") return "Provider";
  if (phase.id === "metadata-directory") return "Directory";
  if (phase.id === "owner-handoff") return "Handoff";
  if (phase.id === "owner-binding") return "Binding";
  if (phase.id === "periodic-polling") return "Polling";
  if (phase.id === "command-and-relay-preview") return "Command";
  if (phase.id === "cleanup") return "Cleanup";
  return phase.title;
}

function messagingConversationDirectorySetupStatusLabel(
  status: ToolMessagingConversationDirectorySetupPreviewData["status"],
): string {
  return status === "preview" ? "Preview" : formatCompactTaskState(status);
}

function messagingConversationDirectorySetupConversationsFromMetadata(
  value: unknown,
): MessagingConversationDirectorySetupCardConversation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): MessagingConversationDirectorySetupCardConversation[] => {
    const record = recordValue(item);
    const conversationId = nonEmptyTextField(record, ["conversationId"]);
    const title = nonEmptyTextField(record, ["title"]);
    if (!conversationId || !title) return [];
    const folderIds = Array.isArray(record?.folderIds)
      ? record.folderIds
        .map((folderId) => typeof folderId === "number" && Number.isFinite(folderId) ? Math.floor(folderId) : undefined)
        .filter((folderId): folderId is number => folderId !== undefined)
      : [];
    const unreadCount = numberField(record, ["unreadCount"]);
    return [{
      conversationId,
      title,
      ...(nonEmptyTextField(record, ["type"]) ? { type: nonEmptyTextField(record, ["type"]) } : {}),
      ...(unreadCount !== undefined ? { unreadCount: Math.max(0, Math.floor(unreadCount)) } : {}),
      folderIds,
      ...(nonEmptyTextField(record, ["updatedAt"]) ? { updatedAt: nonEmptyTextField(record, ["updatedAt"]) } : {}),
    }];
  });
}

function formatCompactTaskState(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function telegramSessionSetupStatusField(value: unknown): TelegramSessionSetupCard["status"] | undefined {
  return value === "preview" ||
    value === "pending" ||
    value === "needs_code" ||
    value === "needs_password" ||
    value === "ready" ||
    value === "blocked" ||
    value === "unknown"
    ? value
    : undefined;
}

function telegramSessionSetupActionFromMetadata(value: unknown): TelegramSessionSetupCard["primaryAction"] | undefined {
  const record = recordValue(value);
  const id = nonEmptyTextField(record, ["id"]);
  const label = nonEmptyTextField(record, ["label"]);
  const title = nonEmptyTextField(record, ["title"]);
  const prompt = nonEmptyTextField(record, ["prompt"]);
  const tone = record?.tone === "primary" || record?.tone === "secondary" ? record.tone : undefined;
  if (!id || !label || !title || !prompt || !tone) return undefined;
  return { id, label, title, prompt, tone };
}

function telegramSessionSetupAuthStateFromMetadata(value: unknown): TelegramSessionSetupCard["authState"] | undefined {
  const record = recordValue(value);
  const state = nonEmptyTextField(record, ["state"]);
  if (!state) return undefined;
  const message = nonEmptyTextField(record, ["message"]);
  return {
    state,
    ready: booleanField(record, ["ready"]) === true,
    needsCode: booleanField(record, ["needsCode"]) === true,
    needsPassword: booleanField(record, ["needsPassword"]) === true,
    phoneNumberPresent: booleanField(record, ["phoneNumberPresent"]) === true,
    ...(message ? { message } : {}),
  };
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
    ...(providerTransition?.next ?? provider ? { provider: providerTransition?.next ?? provider } : {}),
    ...(providerTransition?.previous ? { previousProvider: providerTransition.previous } : {}),
    ...(details?.selectedProviderCapabilityId ?? details?.providerCapabilityId ? { providerCapabilityId: details.selectedProviderCapabilityId ?? details.providerCapabilityId } : {}),
    ...(details?.previousProviderCapabilityId ? { previousProviderCapabilityId: details.previousProviderCapabilityId } : {}),
    ...(voiceTransition?.next ?? voice ? { voice: voiceTransition?.next ?? voice } : {}),
    ...(voiceTransition?.previous ? { previousVoice: voiceTransition.previous } : {}),
    ...(details?.selectedVoiceId ?? details?.voiceId ? { voiceId: details.selectedVoiceId ?? details.voiceId } : {}),
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
    ...(providerTransition?.next ?? provider ? { provider: providerTransition?.next ?? provider } : {}),
    ...(providerTransition?.previous ? { previousProvider: providerTransition.previous } : {}),
    ...(details?.selectedProviderCapabilityId ?? details?.providerCapabilityId ? { providerCapabilityId: details.selectedProviderCapabilityId ?? details.providerCapabilityId } : {}),
    ...(details?.previousProviderCapabilityId ? { previousProviderCapabilityId: details.previousProviderCapabilityId } : {}),
    ...(languageTransition?.next ?? language ? { language: languageTransition?.next ?? language } : {}),
    ...(languageTransition?.previous ? { previousLanguage: languageTransition.previous } : {}),
    ...(singleValueLine(result, "Enabled") ? { enabled: singleValueLine(result, "Enabled") } : {}),
    ...(singleValueLine(result, "Auto-send after transcription") ? { autoSendAfterTranscription: singleValueLine(result, "Auto-send after transcription") } : {}),
    ...(singleValueLine(result, "Silence before transcribe") ? { silenceFinalizeSeconds: singleValueLine(result, "Silence before transcribe") } : {}),
    ...(singleValueLine(result, "No-speech gate") ? { noSpeechGate: singleValueLine(result, "No-speech gate") } : {}),
    ...(singleValueLine(result, "RMS no-speech threshold") ? { noSpeechGateRmsThreshold: singleValueLine(result, "RMS no-speech threshold") } : {}),
    ...(singleValueLine(result, "Stop TTS on speech") ? { stopTtsOnSpeech: singleValueLine(result, "Stop TTS on speech") } : {}),
    ...(singleValueLine(result, "Queue while agent runs") ? { queueWhileAgentRuns: singleValueLine(result, "Queue while agent runs") } : {}),
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
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
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

function editPreviewBlockFromTextPreviews(oldText: ToolEditTextPreview, newText: ToolEditTextPreview, includeCounts = false): ToolEditBlockPreviewData {
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
    inputPath ??
      pathField(args, ["path", "filePath", "file_path", "file", "targetPath", "target_path"]) ??
      resultPath,
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
  const noSpeechGate = noSpeechGateRmsDbfs !== undefined || noSpeechGateThresholdDbfs !== undefined
    ? {
        ...(noSpeechGateRmsDbfs !== undefined ? { rmsDbfs: noSpeechGateRmsDbfs } : {}),
        ...(noSpeechGateThresholdDbfs !== undefined ? { thresholdDbfs: noSpeechGateThresholdDbfs } : {}),
      }
    : undefined;
  const largeOutputPreview = toolLargeOutputPreviewFromMetadata(details?.largeOutputPreview ?? metadata?.largeOutputPreview);
  const telegramSessionSetup = telegramSessionSetupCardFromMetadata(details?.telegramSessionSetup);
  const messagingConversationDirectorySetup = messagingConversationDirectorySetupCardFromMetadata(details?.messagingConversationDirectorySetup);
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
  ) return undefined;
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

function mediaArtifactPathFromMetadata(metadata: Record<string, unknown> | undefined): string | undefined {
  const details = recordValue(metadata?.toolResultDetails);
  return mediaArtifactResult(recordValue(metadata?.mediaArtifact))?.artifactPath ?? mediaArtifactResult(recordValue(details?.mediaArtifact))?.artifactPath ?? textField(details, ["audioPath"]);
}

function managedFileArtifactsFromMetadata(value: unknown): ToolManagedFileArtifactPreviewData[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const artifacts = value.flatMap((item): ToolManagedFileArtifactPreviewData[] => {
    const record = recordValue(item);
    if (!record) return [];
    const workspacePath = pathField(record, ["workspacePath"]);
    const hostPath = pathField(record, ["hostPath"]);
    const containerPath = pathField(record, ["containerPath"]);
    const filename = textField(record, ["filename"]) ?? fileBaseName(workspacePath ?? hostPath ?? containerPath ?? "");
    const bytes = numberField(record, ["bytes"]);
    const source = textField(record, ["source"]);
    const copySkippedReason = textField(record, ["copySkippedReason"]);
    if (!filename || (!workspacePath && !hostPath && !containerPath)) return [];
    return [{
      filename,
      ...(bytes !== undefined ? { bytes } : {}),
      ...(source ? { source } : {}),
      ...(containerPath ? { containerPath } : {}),
      ...(hostPath ? { hostPath } : {}),
      ...(workspacePath ? { workspacePath } : {}),
      ...(copySkippedReason ? { copySkippedReason } : {}),
    }];
  });
  return artifacts.length ? artifacts : undefined;
}

function mediaArtifactResult(record: Record<string, unknown> | undefined): MediaArtifactResult | undefined {
  if (!record) return undefined;
  const previewEligible = record.inlinePreviewEligible === true || record.renderedInline === true;
  if (!previewEligible) return undefined;
  const artifactPath = textField(record, ["artifactPath"]);
  const mediaKind = textField(record, ["mediaKind"]);
  const bytes = numberField(record, ["bytes"]);
  const displayInstruction = textField(record, ["displayInstruction"]);
  if (!artifactPath || !isMediaArtifactKind(mediaKind) || bytes === undefined || !displayInstruction) return undefined;
  const mimeType = textField(record, ["mimeType"]);
  const width = numberField(record, ["width"]);
  const height = numberField(record, ["height"]);
  const sourceUrl = textField(record, ["sourceUrl"]);
  const licenseNote = textField(record, ["licenseNote"]);
  return {
    artifactPath,
    mediaKind,
    bytes,
    ...(record.inlinePreviewEligible === true ? { inlinePreviewEligible: true } : {}),
    ...(record.renderedInline === true ? { renderedInline: true } : {}),
    displayInstruction,
    ...(mimeType ? { mimeType } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(licenseNote ? { licenseNote } : {}),
  };
}

function isMediaArtifactKind(value: string | undefined): value is MediaArtifactResult["mediaKind"] {
  return value === "image" || value === "audio" || value === "video";
}

function pathField(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function textField(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function nonEmptyTextField(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  const value = textField(record, keys)?.trim();
  return value ? value : undefined;
}

function previewTextField(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
    const previewRecord = recordValue(value);
    const preview = textField(previewRecord, ["preview"]);
    if (preview !== undefined) return preview;
  }
  return undefined;
}

function numberField(record: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function booleanField(record: Record<string, unknown> | undefined, keys: string[]): boolean | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function stringArrayField(record: Record<string, unknown> | undefined, keys: string[]): string[] | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
    if (items.length) return items;
  }
  return undefined;
}

function parseDelimitedNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function isArtifactWritingTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return normalized === "write" || normalized === "file_write" || normalized === "edit";
}

function isShellTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return normalized === "bash" || normalized === "shell";
}

function isAmbientCliTool(toolName: string): boolean {
  return toolName.toLowerCase() === "ambient_cli";
}

function isVoiceTool(toolName: string): boolean {
  return toolName.toLowerCase().startsWith("ambient_voice_");
}

function isSttTool(toolName: string): boolean {
  return toolName.toLowerCase().startsWith("ambient_stt_");
}

const MEDIA_ARTIFACT_EXTENSIONS = "apng|avif|gif|jpe?g|png|svg|webp|aac|flac|m4a|mp3|oga|ogg|opus|wav|weba|m4v|mov|mp4|ogv|webm";

function extractShellMediaArtifactPath(result: string): string | undefined {
  const artifactLine = new RegExp(
    `\\b(?:artifact|generated|created|saved|wrote|written|output)\\b[^\\n]*?(?:to|at|:)\\s+(${MEDIA_ARTIFACT_PATH_PATTERN})\\b`,
    "i",
  );
  for (const line of result.split(/\r?\n/).reverse()) {
    const match = artifactLine.exec(line);
    if (match?.[1]) return cleanArtifactPath(match[1]);
  }
  return undefined;
}

const MEDIA_ARTIFACT_PATH_PATTERN = `[^\\s"'\\\`<>|]+\\.(?:${MEDIA_ARTIFACT_EXTENSIONS})(?:[?#][^\\s"'\\\`<>|]+)?`;

function extractAmbientCliMediaArtifactPath(result: string): string | undefined {
  const jsonPath = extractAmbientCliJsonMediaArtifactPath(result);
  if (jsonPath) return resolveAmbientCliResultPath(jsonPath, result);

  const explicitLine = new RegExp(
    `\\b(?:artifact|generated|created|saved|wrote|written|output(?:\\s+file)?|(?:image|audio|video|wav|mp3|webm|mp4)\\s+file)\\b[^\\n]*?(?:\\s(?:to|at|as|in)|:|\\t|->)\\s*["']?(${MEDIA_ARTIFACT_PATH_PATTERN})["']?\\b`,
    "i",
  );
  for (const line of result.split(/\r?\n/).reverse()) {
    const match = explicitLine.exec(line);
    if (match?.[1]) return resolveAmbientCliResultPath(match[1], result);
  }

  const mediaPath = new RegExp(`(${MEDIA_ARTIFACT_PATH_PATTERN})`, "gi");
  const matches = [...result.matchAll(mediaPath)]
    .map((match) => cleanArtifactPath(match[1]))
    .filter((path): path is string => Boolean(path));
  const unique = [...new Set(matches)];
  return unique.length === 1 ? resolveAmbientCliResultPath(unique[0], result) : undefined;
}

function extractAmbientCliJsonMediaArtifactPath(result: string): string | undefined {
  for (const parsed of jsonObjectsFromText(result).reverse()) {
    const path = mediaPathField(parsed);
    if (path) return path;
  }
  return undefined;
}

function mediaPathField(record: Record<string, unknown>): string | undefined {
  const pathKeys = [
    "artifactPath",
    "artifact_path",
    "outputPath",
    "output_path",
    "audioPath",
    "audio_path",
    "imagePath",
    "image_path",
    "videoPath",
    "video_path",
    "output",
    "outputFile",
    "output_file",
    "path",
  ];
  for (const key of pathKeys) {
    const value = record[key];
    if (typeof value === "string" && artifactMediaKindFromPath(value)) return value;
  }
  return undefined;
}

function jsonObjectsFromText(text: string): Array<Record<string, unknown>> {
  const objects: Array<Record<string, unknown>> = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }
      if (char === "\"") {
        inString = true;
        continue;
      }
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(text.slice(start, index + 1)) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              objects.push(parsed as Record<string, unknown>);
            }
          } catch {
            // Tool output can contain prose and logs around JSON payloads.
          }
          start = index;
          break;
        }
      }
    }
  }
  return objects;
}

function resolveAmbientCliResultPath(path: string, result: string): string | undefined {
  const cleaned = cleanArtifactPath(path);
  if (!cleaned) return undefined;
  if (/^(?:[a-z]+:)?[\\/]/i.test(cleaned) || cleaned.startsWith(".")) return cleaned;
  const cwd = result.match(/^Cwd:\s+([^\n]+)$/im)?.[1];
  return cwd ? `${cwd.replace(/\/+$/, "")}/${cleaned}` : cleaned;
}

function cleanArtifactPath(path: string | undefined): string | undefined {
  return path
    ?.trim()
    .replace(/^["'`]+/, "")
    .replace(/["'`.,;:]+$/, "");
}

function normalizeArtifactPath(path: string | undefined, workspacePath: string): string | undefined {
  const cleaned = cleanArtifactPath(path);
  if (!cleaned) return undefined;
  const workspace = workspacePath.replace(/\/+$/, "");
  if (cleaned === workspace) return ".";
  const prefix = `${workspace}/`;
  if (cleaned.startsWith(prefix)) return cleaned.slice(prefix.length);
  const slashlessWorkspace = workspace.replace(/^\/+/, "");
  const slashlessPrefix = `${slashlessWorkspace}/`;
  if (cleaned === slashlessWorkspace) return ".";
  if (cleaned.startsWith(slashlessPrefix)) return cleaned.slice(slashlessPrefix.length);
  const embeddedWorkspaceIndex = cleaned.indexOf(prefix);
  if (embeddedWorkspaceIndex >= 0) return cleaned.slice(embeddedWorkspaceIndex + prefix.length);
  const embeddedSlashlessWorkspaceIndex = cleaned.indexOf(slashlessPrefix);
  if (embeddedSlashlessWorkspaceIndex >= 0) return cleaned.slice(embeddedSlashlessWorkspaceIndex + slashlessPrefix.length);
  return cleaned;
}

function addArtifactHint(hints: ArtifactPathHints, key: string, path: string): void {
  const cleaned = cleanArtifactPath(key)?.replace(/^\.\//, "");
  if (!cleaned || /\s/.test(cleaned)) return;
  hints.set(cleaned, path);
  hints.set(`./${cleaned}`, path);
}

function fileBaseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function languageFromPath(path: string): string | undefined {
  const extension = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!extension) return undefined;
  const languages: Record<string, string> = {
    css: "css",
    html: "html",
    htm: "html",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    mjs: "javascript",
    py: "python",
    sh: "shell",
    ts: "typescript",
    tsx: "tsx",
    txt: "text",
    yml: "yaml",
    yaml: "yaml",
  };
  return languages[extension];
}
