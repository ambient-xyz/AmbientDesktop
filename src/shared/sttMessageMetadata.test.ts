import { describe, expect, it } from "vitest";
import { sttMessageArtifactEntries, sttMessageMetadataFromTranscription, sttMessageMetadataFromUnknown } from "./sttMessageMetadata";
import type { SttTranscriptionState } from "./localRuntimeTypes";

describe("STT message metadata", () => {
  it("keeps transcript provenance without copying transcript text", () => {
    const metadata = sttMessageMetadataFromTranscription(transcription());

    expect(metadata).toEqual({
      source: "stt",
      utteranceId: "utt-1",
      threadId: "thread-1",
      status: "ready",
      providerCapabilityId: "ambient-qwen3-asr:tool:qwen3_asr_transcribe",
      providerId: "qwen3-asr-0.6b",
      language: "English",
      durationMs: 1200,
      noSpeechGate: {
        enabled: true,
        skipped: false,
        rmsDbfs: -24,
        thresholdDbfs: -55,
      },
      artifacts: {
        audioPath: ".ambient/stt/thread-1/utt-1.raw.wav",
        normalizedAudioPath: ".ambient/stt/thread-1/utt-1.wav",
        transcriptPath: ".ambient/stt/thread-1/utt-1.txt",
        jsonPath: ".ambient/stt/thread-1/utt-1.json",
        stderrPath: ".ambient/stt/thread-1/utt-1.stderr.txt",
      },
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:01.000Z",
    });
    expect(JSON.stringify(metadata)).not.toContain("open settings");
  });

  it("round-trips persisted unknown metadata and exposes artifact entries", () => {
    const metadata = sttMessageMetadataFromUnknown({
      ...sttMessageMetadataFromTranscription(transcription()),
      ignored: "field",
    });

    expect(metadata).toBeDefined();
    expect(metadata?.providerId).toBe("qwen3-asr-0.6b");
    expect(sttMessageArtifactEntries(metadata!)).toEqual([
      { key: "audioPath", label: "Raw audio", path: ".ambient/stt/thread-1/utt-1.raw.wav" },
      { key: "normalizedAudioPath", label: "Audio", path: ".ambient/stt/thread-1/utt-1.wav" },
      { key: "transcriptPath", label: "Transcript", path: ".ambient/stt/thread-1/utt-1.txt" },
      { key: "jsonPath", label: "JSON", path: ".ambient/stt/thread-1/utt-1.json" },
      { key: "stderrPath", label: "stderr", path: ".ambient/stt/thread-1/utt-1.stderr.txt" },
    ]);
  });

  it("rejects invalid metadata safely", () => {
    expect(sttMessageMetadataFromUnknown(undefined)).toBeUndefined();
    expect(sttMessageMetadataFromUnknown({ source: "voice" })).toBeUndefined();
    expect(sttMessageMetadataFromUnknown({ source: "stt", utteranceId: "utt-1" })).toBeUndefined();
  });
});

function transcription(): SttTranscriptionState {
  return {
    utteranceId: "utt-1",
    threadId: "thread-1",
    status: "ready",
    audioPath: ".ambient/stt/thread-1/utt-1.raw.wav",
    normalizedAudioPath: ".ambient/stt/thread-1/utt-1.wav",
    providerCapabilityId: "ambient-qwen3-asr:tool:qwen3_asr_transcribe",
    providerId: "qwen3-asr-0.6b",
    language: "English",
    text: "open settings",
    durationMs: 1200,
    noSpeechGate: {
      enabled: true,
      skipped: false,
      rmsDbfs: -24,
      thresholdDbfs: -55,
    },
    transcriptPath: ".ambient/stt/thread-1/utt-1.txt",
    jsonPath: ".ambient/stt/thread-1/utt-1.json",
    stderrPath: ".ambient/stt/thread-1/utt-1.stderr.txt",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:01.000Z",
  };
}
