import { isSttTool, isVoiceTool } from "./toolMessageArtifactUiModel";
import { booleanField, numberField, recordValue, stringArrayField, textField } from "./toolMessageMetadataFields";

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

type SpeechToolResultDetails = {
  status?: string;
  testStatus?: string;
  providerCapabilityId?: string;
  previousProviderCapabilityId?: string;
  selectedProviderCapabilityId?: string;
  voiceId?: string;
  selectedVoiceId?: string;
  audioPath?: string;
  normalizedAudioPath?: string;
  transcriptPath?: string;
  jsonPath?: string;
  stdoutPath?: string;
  stderrPath?: string;
  transcript?: string;
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
  providerCount?: number;
  availableProviderCount?: number;
  noSpeechGate?: {
    thresholdDbfs?: number;
    rmsDbfs?: number;
  };
};

export function extractVoicePreview(
  toolName: string,
  result: string,
  metadata?: Record<string, unknown>,
): ToolVoicePreviewData | undefined {
  if (!isVoiceTool(toolName)) return undefined;
  const details = speechToolResultDetailsFromMetadata(metadata);
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

export function extractSttPreview(toolName: string, result: string, metadata?: Record<string, unknown>): ToolSttPreviewData | undefined {
  if (!isSttTool(toolName)) return undefined;
  const details = speechToolResultDetailsFromMetadata(metadata);
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

function speechToolResultDetailsFromMetadata(metadata: Record<string, unknown> | undefined): SpeechToolResultDetails | undefined {
  const details = recordValue(metadata?.toolResultDetails);
  const noSpeechGate = recordValue(details?.noSpeechGate);
  return {
    ...(textField(details, ["status"]) ? { status: textField(details, ["status"]) } : {}),
    ...(textField(details, ["testStatus"]) ? { testStatus: textField(details, ["testStatus"]) } : {}),
    ...(textField(details, ["providerCapabilityId"]) ? { providerCapabilityId: textField(details, ["providerCapabilityId"]) } : {}),
    ...(textField(details, ["previousProviderCapabilityId"])
      ? { previousProviderCapabilityId: textField(details, ["previousProviderCapabilityId"]) }
      : {}),
    ...(textField(details, ["selectedProviderCapabilityId"])
      ? { selectedProviderCapabilityId: textField(details, ["selectedProviderCapabilityId"]) }
      : {}),
    ...(textField(details, ["voiceId"]) ? { voiceId: textField(details, ["voiceId"]) } : {}),
    ...(textField(details, ["selectedVoiceId"]) ? { selectedVoiceId: textField(details, ["selectedVoiceId"]) } : {}),
    ...(textField(details, ["audioPath"]) ? { audioPath: textField(details, ["audioPath"]) } : {}),
    ...(textField(details, ["normalizedAudioPath"]) ? { normalizedAudioPath: textField(details, ["normalizedAudioPath"]) } : {}),
    ...(textField(details, ["transcriptPath"]) ? { transcriptPath: textField(details, ["transcriptPath"]) } : {}),
    ...(textField(details, ["jsonPath"]) ? { jsonPath: textField(details, ["jsonPath"]) } : {}),
    ...(textField(details, ["stdoutPath"]) ? { stdoutPath: textField(details, ["stdoutPath"]) } : {}),
    ...(textField(details, ["stderrPath"]) ? { stderrPath: textField(details, ["stderrPath"]) } : {}),
    ...(textField(details, ["transcript"]) ? { transcript: textField(details, ["transcript"]) } : {}),
    ...(textField(details, ["mimeType"]) ? { mimeType: textField(details, ["mimeType"]) } : {}),
    ...(numberField(details, ["durationMs"]) !== undefined ? { durationMs: numberField(details, ["durationMs"]) } : {}),
    ...(textField(details, ["readiness"]) ? { readiness: textField(details, ["readiness"]) } : {}),
    ...(booleanField(details, ["readyForSelection"]) !== undefined
      ? { readyForSelection: booleanField(details, ["readyForSelection"]) }
      : {}),
    ...(booleanField(details, ["shouldRetryStatus"]) !== undefined
      ? { shouldRetryStatus: booleanField(details, ["shouldRetryStatus"]) }
      : {}),
    ...(textField(details, ["cacheStatus"]) ? { cacheStatus: textField(details, ["cacheStatus"]) } : {}),
    ...(numberField(details, ["progressPercent"]) !== undefined ? { progressPercent: numberField(details, ["progressPercent"]) } : {}),
    ...(numberField(details, ["retryAfterSeconds"]) !== undefined
      ? { retryAfterSeconds: numberField(details, ["retryAfterSeconds"]) }
      : {}),
    ...(textField(details, ["dashboardUrl"]) ? { dashboardUrl: textField(details, ["dashboardUrl"]) } : {}),
    ...(textField(details, ["verificationUrl"]) ? { verificationUrl: textField(details, ["verificationUrl"]) } : {}),
    ...(textField(details, ["failureReason"]) ? { failureReason: textField(details, ["failureReason"]) } : {}),
    ...(stringArrayField(details, ["localArtifactPaths"]) ? { localArtifactPaths: stringArrayField(details, ["localArtifactPaths"]) } : {}),
    ...(stringArrayField(details, ["missingLocalArtifactPaths"])
      ? { missingLocalArtifactPaths: stringArrayField(details, ["missingLocalArtifactPaths"]) }
      : {}),
    ...(textField(details, ["language"]) ? { language: textField(details, ["language"]) } : {}),
    ...(numberField(details, ["providerCount"]) !== undefined ? { providerCount: numberField(details, ["providerCount"]) } : {}),
    ...(numberField(details, ["availableProviderCount"]) !== undefined
      ? { availableProviderCount: numberField(details, ["availableProviderCount"]) }
      : {}),
    ...(noSpeechGate
      ? {
          noSpeechGate: {
            ...(numberField(noSpeechGate, ["thresholdDbfs"]) !== undefined
              ? { thresholdDbfs: numberField(noSpeechGate, ["thresholdDbfs"]) }
              : {}),
            ...(numberField(noSpeechGate, ["rmsDbfs"]) !== undefined ? { rmsDbfs: numberField(noSpeechGate, ["rmsDbfs"]) } : {}),
          },
        }
      : {}),
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
