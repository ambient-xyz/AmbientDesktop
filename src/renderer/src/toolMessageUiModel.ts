import type { MediaArtifactResult } from "../../shared/desktopTypes";
import {
  largeOutputPreviewFromResult,
  parseToolJsonInput,
  parseToolSections,
  stripMaterializedTextNotices,
  summaryLine,
  toolArgumentProgressFromMetadata,
  toolInputPreview,
  toolInputTitleForName,
  toolLargeOutputPreviewFromMetadata,
  toolLongformInputPreviewFromMetadata,
  toolResultPreview,
} from "./toolMessageContentPreviewUiModel";
export { toolLargeOutputPreviewViewModel, toolLongformInputPreviewDisplaySummary } from "./toolMessageContentPreviewUiModel";
export type { ToolLargeOutputPreviewRow, ToolLargeOutputPreviewViewData, ToolMessageSection } from "./toolMessageContentPreviewUiModel";
import {
  applyRepairLongformInputPreview,
  extractApplyRepairPreview,
  extractEditPreview,
  extractInstallRoutePreview,
  extractWritePreview,
  writeLongformInputPreview,
} from "./toolMessageEditPreviewUiModel";
import type {
  ToolApplyRepairPreviewData,
  ToolEditPreviewData,
  ToolInstallRoutePreviewData,
  ToolWritePreviewData,
} from "./toolMessageEditPreviewUiModel";
export type {
  ToolApplyRepairFilePreviewData,
  ToolApplyRepairPreviewData,
  ToolEditBlockPreviewData,
  ToolEditPreviewData,
  ToolInstallRoutePreviewData,
  ToolWritePreviewData,
} from "./toolMessageEditPreviewUiModel";
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
  isVoiceTool,
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
import { booleanField, numberField, pathField, recordValue, stringArrayField, textField } from "./toolMessageMetadataFields";
import { extractSttPreview, extractVoicePreview } from "./toolMessageSpeechUiModel";
import type { ToolSttPreviewData, ToolVoicePreviewData } from "./toolMessageSpeechUiModel";
export type { ToolSttPreviewData, ToolVoicePreviewData } from "./toolMessageSpeechUiModel";
import type { ChatMessage, ToolArgumentProgressSnapshot, ToolLargeOutputPreview, ToolLongformInputPreview } from "../../shared/threadTypes";

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
