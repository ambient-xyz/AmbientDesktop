import type {
  SttMessageArtifactMetadata,
  SttMessageMetadata,
  SttNoSpeechGateResult,
  SttTranscriptionState,
  SttTranscriptionStatus,
} from "./types";

const STT_TRANSCRIPTION_STATUSES = new Set<SttTranscriptionStatus>([
  "queued",
  "transcribing",
  "ready",
  "no-speech",
  "failed",
]);

export function sttMessageMetadataFromTranscription(state: SttTranscriptionState): SttMessageMetadata {
  return {
    source: "stt",
    utteranceId: state.utteranceId,
    threadId: state.threadId,
    status: state.status,
    ...(state.providerCapabilityId ? { providerCapabilityId: state.providerCapabilityId } : {}),
    ...(state.providerId ? { providerId: state.providerId } : {}),
    ...(state.language ? { language: state.language } : {}),
    ...(typeof state.durationMs === "number" ? { durationMs: state.durationMs } : {}),
    ...(state.noSpeechGate ? { noSpeechGate: state.noSpeechGate } : {}),
    artifacts: sttArtifactMetadataFromTranscription(state),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

export function sttMessageMetadataFromUnknown(value: unknown): SttMessageMetadata | undefined {
  if (!isRecord(value) || value.source !== "stt") return undefined;
  const utteranceId = stringValue(value.utteranceId);
  const threadId = stringValue(value.threadId);
  const status = sttStatusValue(value.status);
  const createdAt = stringValue(value.createdAt);
  const updatedAt = stringValue(value.updatedAt);
  if (!utteranceId || !threadId || !status || !createdAt || !updatedAt) return undefined;

  const artifacts = sttArtifactMetadataFromUnknown(value.artifacts);
  return {
    source: "stt",
    utteranceId,
    threadId,
    status,
    ...(stringValue(value.providerCapabilityId) ? { providerCapabilityId: stringValue(value.providerCapabilityId)! } : {}),
    ...(stringValue(value.providerId) ? { providerId: stringValue(value.providerId)! } : {}),
    ...(stringValue(value.language) ? { language: stringValue(value.language)! } : {}),
    ...(numberValue(value.durationMs) !== undefined ? { durationMs: numberValue(value.durationMs)! } : {}),
    ...(sttNoSpeechGateFromUnknown(value.noSpeechGate) ? { noSpeechGate: sttNoSpeechGateFromUnknown(value.noSpeechGate)! } : {}),
    artifacts,
    createdAt,
    updatedAt,
  };
}

export function sttMessageArtifactEntries(metadata: SttMessageMetadata): Array<{ key: keyof SttMessageArtifactMetadata; label: string; path: string }> {
  const entries: Array<{ key: keyof SttMessageArtifactMetadata; label: string; path: string }> = [
    { key: "audioPath", label: "Raw audio", path: metadata.artifacts.audioPath ?? "" },
    { key: "normalizedAudioPath", label: "Audio", path: metadata.artifacts.normalizedAudioPath ?? "" },
    { key: "transcriptPath", label: "Transcript", path: metadata.artifacts.transcriptPath ?? "" },
    { key: "jsonPath", label: "JSON", path: metadata.artifacts.jsonPath ?? "" },
    { key: "stdoutPath", label: "stdout", path: metadata.artifacts.stdoutPath ?? "" },
    { key: "stderrPath", label: "stderr", path: metadata.artifacts.stderrPath ?? "" },
  ];
  return entries.filter((entry) => entry.path.trim());
}

function sttArtifactMetadataFromTranscription(state: SttTranscriptionState): SttMessageArtifactMetadata {
  return {
    ...(state.audioPath ? { audioPath: state.audioPath } : {}),
    ...(state.normalizedAudioPath ? { normalizedAudioPath: state.normalizedAudioPath } : {}),
    ...(state.transcriptPath ? { transcriptPath: state.transcriptPath } : {}),
    ...(state.jsonPath ? { jsonPath: state.jsonPath } : {}),
    ...(state.stdoutPath ? { stdoutPath: state.stdoutPath } : {}),
    ...(state.stderrPath ? { stderrPath: state.stderrPath } : {}),
  };
}

function sttArtifactMetadataFromUnknown(value: unknown): SttMessageArtifactMetadata {
  if (!isRecord(value)) return {};
  return {
    ...(stringValue(value.audioPath) ? { audioPath: stringValue(value.audioPath)! } : {}),
    ...(stringValue(value.normalizedAudioPath) ? { normalizedAudioPath: stringValue(value.normalizedAudioPath)! } : {}),
    ...(stringValue(value.transcriptPath) ? { transcriptPath: stringValue(value.transcriptPath)! } : {}),
    ...(stringValue(value.jsonPath) ? { jsonPath: stringValue(value.jsonPath)! } : {}),
    ...(stringValue(value.stdoutPath) ? { stdoutPath: stringValue(value.stdoutPath)! } : {}),
    ...(stringValue(value.stderrPath) ? { stderrPath: stringValue(value.stderrPath)! } : {}),
  };
}

function sttNoSpeechGateFromUnknown(value: unknown): SttNoSpeechGateResult | undefined {
  if (!isRecord(value)) return undefined;
  const enabled = booleanValue(value.enabled);
  const skipped = booleanValue(value.skipped);
  if (enabled === undefined || skipped === undefined) return undefined;
  return {
    enabled,
    skipped,
    ...(numberValue(value.rmsDbfs) !== undefined ? { rmsDbfs: numberValue(value.rmsDbfs)! } : {}),
    ...(numberValue(value.peakDbfs) !== undefined ? { peakDbfs: numberValue(value.peakDbfs)! } : {}),
    ...(numberValue(value.thresholdDbfs) !== undefined ? { thresholdDbfs: numberValue(value.thresholdDbfs)! } : {}),
    ...(numberValue(value.sampleCount) !== undefined ? { sampleCount: numberValue(value.sampleCount)! } : {}),
    ...(numberValue(value.durationMs) !== undefined ? { durationMs: numberValue(value.durationMs)! } : {}),
    ...(stringValue(value.reason) ? { reason: stringValue(value.reason)! } : {}),
  };
}

function sttStatusValue(value: unknown): SttTranscriptionStatus | undefined {
  return typeof value === "string" && STT_TRANSCRIPTION_STATUSES.has(value as SttTranscriptionStatus)
    ? value as SttTranscriptionStatus
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
