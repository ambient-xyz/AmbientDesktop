import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SttProviderSetupResult, SttTranscriptionState } from "../../shared/localRuntimeTypes";
import {
  SttDiagnosticRecorder,
  sttDiagnosticsLogRelativePath,
  sttSetupDiagnosticSummary,
  sttTranscriptionDiagnosticSummary,
} from "./sttDiagnostics";

describe("STT diagnostics", () => {
  it("summarizes setup without exposing validation transcripts", () => {
    const diagnostic = sttSetupDiagnosticSummary({
      result: setupResult({
        status: "ready",
        validationTranscript: "secret spoken validation text",
      }),
      durationMs: 1234,
      now: new Date("2026-05-10T00:00:00.000Z"),
    });

    expect(diagnostic).toMatchObject({
      kind: "setup",
      status: "ready",
      durationMs: 1234,
      lane: "macos-arm64-metal",
      runtimeVersion: "v25.2.1",
      model: "ggml-org/Qwen3-ASR-0.6B-GGUF:Q8_0",
      assetManifestVersion: "2026-05-10.1",
      missingHintCount: 0,
    });
    expect(JSON.stringify(diagnostic)).not.toContain("secret spoken validation text");
  });

  it("summarizes transcription without raw transcript or artifact paths", () => {
    const diagnostic = sttTranscriptionDiagnosticSummary({
      state: transcription({
        text: "private dictated request",
        audioPath: ".ambient/stt/thread-1/utt-1.raw.wav",
        transcriptPath: ".ambient/stt/thread-1/utt-1.txt",
      }),
      elapsedMs: 456,
      queue: { phase: "idle", queuedUtteranceIds: [] },
      now: new Date("2026-05-10T00:00:01.000Z"),
    });

    expect(diagnostic).toMatchObject({
      kind: "transcription",
      status: "ready",
      transcriptionElapsedMs: 456,
      transcriptChars: 24,
      audioDurationMs: 5116,
      artifacts: {
        audio: true,
        normalizedAudio: true,
        transcript: true,
        json: true,
      },
      noSpeechGate: {
        enabled: true,
        skipped: false,
        rmsDbfs: -19.5,
        thresholdDbfs: -55,
      },
    });
    const json = JSON.stringify(diagnostic);
    expect(json).not.toContain("private dictated request");
    expect(json).not.toContain(".ambient/stt/thread-1/utt-1");
  });

  it("records bounded workspace-local jsonl diagnostics", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-diagnostics-"));
    try {
      const recorder = new SttDiagnosticRecorder();
      for (let index = 0; index < 32; index += 1) {
        await recorder.record(
          workspace,
          sttTranscriptionDiagnosticSummary({
            state: transcription({ utteranceId: `utt-${index}` }),
            elapsedMs: index,
            now: new Date(`2026-05-10T00:00:${String(index).padStart(2, "0")}.000Z`),
          }),
        );
      }

      expect(recorder.list(workspace)).toHaveLength(30);
      expect(recorder.list(workspace)[0]).toMatchObject({ kind: "transcription", utteranceId: "utt-31" });
      const jsonl = await readFile(join(workspace, sttDiagnosticsLogRelativePath()), "utf8");
      expect(jsonl.trim().split("\n")).toHaveLength(32);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

function setupResult(input: { status?: SttProviderSetupResult["status"]; validationTranscript?: string } = {}): SttProviderSetupResult {
  const validation: SttProviderSetupResult["validation"] = {
    schemaVersion: "ambient-stt-provider-validation-v1",
    provider: "qwen3-asr",
    packageName: "ambient-qwen3-asr",
    providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
    status: input.status === "needs-runtime" ? "needs-runtime" : input.status === "validation-failed" ? "failed" : "passed",
    updatedAt: "2026-05-10T00:00:00.000Z",
    platform: "darwin",
    arch: "arm64",
    lane: "macos-arm64-metal",
    binaryPath: "/opt/homebrew/bin/llama-mtmd-cli",
    runtimeVersion: "v25.2.1",
    model: "ggml-org/Qwen3-ASR-0.6B-GGUF:Q8_0",
    modelSource: "manifest",
    assetManifest: {
      schemaVersion: "ambient-stt-qwen3-asr-assets-v1",
      version: "2026-05-10.1",
      model: {
        id: "qwen3-asr-0.6b-q8_0",
        repo: "ggml-org/Qwen3-ASR-0.6B-GGUF",
        revision: "928ab958557df9aa2ef1c93e0e83c7ad0933fae2",
        files: [],
      },
      runtime: {
        directDownloadsEnabled: false,
        lanes: ["macos-arm64-metal"],
      },
    },
    validationTranscript: input.validationTranscript,
    durationMs: 0,
    missingHints: [],
  };
  return {
    provider: "qwen3-asr",
    action: "repair",
    status: input.status ?? "ready",
    packageName: "ambient-qwen3-asr",
    installStatuses: [{ packageName: "ambient-qwen3-asr", source: "bundled:ambient-qwen3-asr", status: "installed" }],
    selectedProvider: {
      packageId: "ambient-cli:ambient-qwen3-asr",
      packageName: "ambient-qwen3-asr",
      command: "qwen3_asr_transcribe",
      capabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
      providerId: "qwen3-asr-0.6b-llamacpp",
      label: "Qwen3-ASR Local",
      languages: ["English"],
      defaultLanguage: "English",
      local: true,
      installed: true,
      available: true,
      availabilityReason: "Available.",
    },
    providers: [],
    validation,
    runtimeCandidates: [],
    nextSteps: [],
  };
}

function transcription(input: Partial<SttTranscriptionState> = {}): SttTranscriptionState {
  const utteranceId = input.utteranceId ?? "utt-1";
  return {
    utteranceId,
    threadId: input.threadId ?? "thread-1",
    status: input.status ?? "ready",
    audioPath: input.audioPath ?? `.ambient/stt/thread-1/${utteranceId}.raw.wav`,
    normalizedAudioPath: input.normalizedAudioPath ?? `.ambient/stt/thread-1/${utteranceId}.wav`,
    providerCapabilityId: input.providerCapabilityId ?? "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
    providerId: input.providerId ?? "qwen3-asr-0.6b-llamacpp",
    language: input.language ?? "English",
    text: input.text ?? "hello",
    durationMs: input.durationMs,
    noSpeechGate: input.noSpeechGate ?? {
      enabled: true,
      skipped: false,
      rmsDbfs: -19.5,
      peakDbfs: -1.7,
      thresholdDbfs: -55,
      durationMs: 5116,
    },
    transcriptPath: input.transcriptPath ?? `.ambient/stt/thread-1/${utteranceId}.txt`,
    jsonPath: input.jsonPath ?? `.ambient/stt/thread-1/${utteranceId}.json`,
    stdoutPath: input.stdoutPath,
    stderrPath: input.stderrPath,
    error: input.error,
    createdAt: input.createdAt ?? "2026-05-10T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-05-10T00:00:01.000Z",
  };
}
