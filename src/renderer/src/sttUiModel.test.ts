import { describe, expect, it } from "vitest";
import type { ChatMessage, SttProviderCandidate, SttProviderSetupResult, SttSettings, SttTranscriptionState } from "../../shared/types";
import {
  queuedSpeechFollowUpCount,
  sttDiagnosticsModel,
  sttDraftMetadataForSubmit,
  sttInsertTranscriptIntoDraft,
  sttProviderCacheChanges,
  sttProviderForCapabilityId,
  sttQueuedCountLabel,
  sttRuntimeQueuedCount,
  sttSettingsProviderModel,
  sttSetupResultModel,
  sttTranscriptReadyAction,
  sttValidationModel,
} from "./sttUiModel";

function provider(input: Partial<SttProviderCandidate> = {}): SttProviderCandidate {
  return {
    packageId: input.packageId ?? "ambient-cli:ambient-qwen3-asr",
    packageName: input.packageName ?? "ambient-qwen3-asr",
    command: input.command ?? "qwen3_asr_transcribe",
    capabilityId: input.capabilityId ?? "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
    providerId: input.providerId ?? "qwen3-asr-0.6b-llamacpp",
    label: input.label ?? "Qwen3-ASR Local",
    description: input.description,
    languages: input.languages ?? ["English", "Spanish"],
    defaultLanguage: input.defaultLanguage ?? "English",
    local: input.local ?? true,
    installed: input.installed ?? true,
    available: input.available ?? true,
    availabilityReason: input.availabilityReason ?? "Installed Ambient CLI package is available; execution still requires Desktop approval.",
    ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
    ...(input.validation ? { validation: input.validation } : {}),
  };
}

function settings(input: Partial<SttSettings> = {}): SttSettings {
  return {
    enabled: input.enabled ?? true,
    providerCapabilityId: "providerCapabilityId" in input ? input.providerCapabilityId : "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
    spokenLanguage: input.spokenLanguage ?? "English",
    pushToTalkShortcut: input.pushToTalkShortcut,
    mode: "push-to-talk",
    autoSendAfterTranscription: input.autoSendAfterTranscription ?? true,
    silenceFinalizeSeconds: input.silenceFinalizeSeconds ?? 0.8,
    noSpeechGate: input.noSpeechGate ?? { enabled: true, rmsThresholdDbfs: -55 },
    bargeIn: input.bargeIn ?? { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
  };
}

describe("STT UI model", () => {
  it("selects providers using Ambient CLI capability aliases", () => {
    const qwen = provider();
    expect(sttProviderForCapabilityId([qwen], "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe")).toBe(qwen);
    expect(sttProviderForCapabilityId([qwen], "qwen3-asr-0.6b-llamacpp")).toBe(qwen);
  });

  it("surfaces selected provider state and blocks enablement when runtime is missing", () => {
    const model = sttSettingsProviderModel({
      providers: [
        provider({
          available: false,
          availabilityReason: "STT provider validation pending: llama-mtmd-cli was not found on PATH.",
          diagnostics: {
            healthStatus: "passed",
            healthError: "llama-mtmd-cli was not found on PATH.",
            missingHints: ["Install a llama.cpp build that includes llama-mtmd-cli."],
          },
          validation: {
            schemaVersion: "ambient-stt-provider-validation-v1",
            provider: "qwen3-asr",
            packageName: "ambient-qwen3-asr",
            status: "needs-runtime",
            updatedAt: "2026-05-10T00:00:00.000Z",
            platform: "darwin",
            arch: "arm64",
            lane: "macos-arm64-metal",
            error: "llama-mtmd-cli was not found on PATH.",
            missingHints: ["Install a llama.cpp build that includes llama-mtmd-cli."],
          },
        }),
      ],
      settings: settings({ enabled: true }),
    });

    expect(model).toMatchObject({
      statusLabel: "Provider needs setup",
      enabledChecked: false,
      enableDisabled: true,
      setupActions: [
        {
          action: "repair",
          label: "Repair Qwen3-ASR",
        },
        {
          action: "install",
          label: "Reinstall Qwen3-ASR",
        },
        {
          action: "validate",
          label: "Validate Qwen3-ASR",
        },
      ],
      selectedLanguage: "English",
      languageOptions: ["English", "Spanish"],
      diagnostics: {
        statusLabel: "Health check needs runtime",
        statusTone: "info",
        errorLabel: "llama-mtmd-cli was not found on PATH.",
      },
      validation: {
        statusLabel: "Runtime missing",
        statusTone: "warning",
        errorLabel: "llama-mtmd-cli was not found on PATH.",
      },
    });
  });

  it("shows install and reinstall paths for Qwen speech setup", () => {
    expect(sttSettingsProviderModel({ providers: [], settings: settings({ providerCapabilityId: undefined }) })).toMatchObject({
      statusLabel: "Install Qwen3-ASR",
      setupActions: [
        {
          action: "install",
          label: "Install Qwen3-ASR",
        },
      ],
    });

    expect(sttSettingsProviderModel({ providers: [provider()], settings: settings() })).toMatchObject({
      statusLabel: "Qwen3-ASR Local",
      setupActions: [
        {
          action: "validate",
          label: "Validate Qwen3-ASR",
        },
        {
          action: "repair",
          label: "Repair Qwen3-ASR",
        },
        {
          action: "install",
          label: "Reinstall Qwen3-ASR",
        },
      ],
    });
  });

  it("formats passed validation and setup results", () => {
    const validation = {
      schemaVersion: "ambient-stt-provider-validation-v1" as const,
      provider: "qwen3-asr" as const,
      packageName: "ambient-qwen3-asr",
      providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
      status: "passed" as const,
      updatedAt: "2026-05-10T00:00:00.000Z",
      platform: "linux",
      arch: "x64",
      lane: "linux-x64-nvidia-cuda",
      binaryPath: "/tmp/llama-mtmd-cli",
      runtimeVersion: "version: fake",
      model: "ggml-org/Qwen3-ASR-0.6B-GGUF:Q8_0",
      assetManifest: {
        schemaVersion: "ambient-stt-qwen3-asr-assets-v1" as const,
        version: "2026-05-10.1",
        model: {
          id: "qwen3-asr-0.6b-q8_0",
          repo: "ggml-org/Qwen3-ASR-0.6B-GGUF",
          revision: "928ab958557df9aa2ef1c93e0e83c7ad0933fae2",
          files: [
            {
              role: "model" as const,
              filename: "Qwen3-ASR-0.6B-Q8_0.gguf",
              sizeBytes: 804749248,
              sha256: "bca259818b50ca7c4c05e9bdb35a5dc04fa039653a6d6f3f0f331f96f6aa1971",
            },
          ],
        },
        runtime: {
          directDownloadsEnabled: false,
          lanes: ["macos-arm64-metal", "linux-x64-nvidia-cuda", "windows-x64-unvalidated"],
        },
      },
      validationTranscript: "speech validation passed",
      durationMs: 1234,
      missingHints: [],
    };
    expect(sttValidationModel(validation)).toMatchObject({
      statusLabel: "Validation passed",
      statusTone: "success",
      detailLabels: expect.arrayContaining([
        "Runtime: version: fake",
        "Assets: qwen3-asr-0.6b-q8_0 @ 928ab958",
        "Runtime downloads: disabled",
        "Transcript: speech validation passed",
        "Elapsed: 1,234 ms",
      ]),
    });

    const setup: SttProviderSetupResult = {
      provider: "qwen3-asr",
      action: "repair",
      status: "ready",
      packageName: "ambient-qwen3-asr",
      installStatuses: [{ packageName: "ambient-qwen3-asr", source: "bundled:ambient-qwen3-asr", status: "already_installed" }],
      providers: [provider({ validation })],
      selectedProvider: provider({ validation }),
      validation,
      runtimeCandidates: [{ path: "/tmp/llama-mtmd-cli", source: "user", available: true }],
      nextSteps: ["Select Qwen3-ASR as the Speech Input provider."],
    };
    expect(sttSetupResultModel(setup)).toMatchObject({
      statusLabel: "Qwen3-ASR validated",
      statusTone: "success",
      detailLabels: expect.arrayContaining(["Package: already_installed", "Runtime: version: fake", "Transcript: speech validation passed"]),
    });
  });

  it("summarizes provider cache changes", () => {
    expect(sttProviderCacheChanges([], [provider({ available: false })])).toEqual(["Qwen3-ASR Local added unavailable"]);
    expect(sttProviderCacheChanges([provider({ available: false })], [provider({ available: true })])).toEqual(["Qwen3-ASR Local became available"]);
  });

  it("formats privacy-preserving STT diagnostics", () => {
    expect(sttDiagnosticsModel([
      {
        id: "diag-transcription",
        kind: "transcription",
        createdAt: "2026-05-10T00:00:02.000Z",
        utteranceId: "utt-1",
        threadId: "thread-1",
        status: "ready",
        providerId: "qwen3-asr-0.6b-llamacpp",
        language: "English",
        audioDurationMs: 5116,
        transcriptionElapsedMs: 900,
        transcriptChars: 42,
        noSpeechGate: { enabled: true, skipped: false, rmsDbfs: -22, thresholdDbfs: -55 },
        artifacts: { audio: true, normalizedAudio: true, transcript: true, json: true, stdout: false, stderr: false },
        queuePhase: "idle",
      },
      {
        id: "diag-setup",
        kind: "setup",
        createdAt: "2026-05-10T00:00:01.000Z",
        provider: "qwen3-asr",
        action: "repair",
        status: "ready",
        durationMs: 1234,
        packageName: "ambient-qwen3-asr",
        platform: "darwin",
        arch: "arm64",
        lane: "macos-arm64-metal",
        runtimeVersion: "v25.2.1",
        model: "ggml-org/Qwen3-ASR-0.6B-GGUF:Q8_0",
        assetManifestVersion: "2026-05-10.1",
        missingHintCount: 0,
      },
    ])).toEqual([
      {
        id: "diag-transcription",
        statusTone: "success",
        title: "STT transcription ready",
        createdLabel: "2026-05-10T00:00:02.000Z",
        detailLabels: [
          "Elapsed: 900 ms",
          "Audio: 5.1s",
          "Provider: qwen3-asr-0.6b-llamacpp",
          "Language: English",
          "Transcript: 42 chars",
          "No-speech gate: passed · -22 dBFS",
          "Queue: idle",
        ],
      },
      {
        id: "diag-setup",
        statusTone: "success",
        title: "STT setup ready",
        createdLabel: "2026-05-10T00:00:01.000Z",
        detailLabels: [
          "Action: repair",
          "Elapsed: 1,234 ms",
          "Lane: macos-arm64-metal",
          "Runtime: v25.2.1",
          "Model: ggml-org/Qwen3-ASR-0.6B-GGUF:Q8_0",
          "Assets: 2026-05-10.1",
        ],
      },
    ]);
  });

  it("counts active runtime utterances and queued speech follow-ups", () => {
    expect(sttRuntimeQueuedCount(undefined)).toBe(0);
    expect(sttRuntimeQueuedCount({ phase: "transcribing", activeUtteranceId: "utt-active", queuedUtteranceIds: ["utt-next"] })).toBe(2);
    expect(queuedSpeechFollowUpCount([
      message({ id: "speech-queued", metadata: { status: "queued", delivery: "follow-up", stt: sttMetadata("utt-1") } }),
      message({ id: "speech-sent", metadata: { status: "sent", delivery: "follow-up", stt: sttMetadata("utt-2") } }),
      message({ id: "plain-queued", metadata: { status: "queued", delivery: "follow-up" } }),
      message({ id: "steer-speech", metadata: { status: "queued", delivery: "steer", stt: sttMetadata("utt-3") } }),
    ])).toBe(1);
    expect(sttQueuedCountLabel(0)).toBeUndefined();
    expect(sttQueuedCountLabel(1)).toBe("1 speech utterance queued");
    expect(sttQueuedCountLabel(2)).toBe("2 speech utterances queued");
  });

  it("maps ready transcripts to prompt or follow-up sends when auto-send is enabled", () => {
    const idle = sttTranscriptReadyAction({
      autoSendAfterTranscription: true,
      running: false,
      text: "open settings",
      transcription: transcription(),
    });
    expect(idle).toMatchObject({
      kind: "send",
      content: "open settings",
      delivery: "prompt",
      composerMessage: "Speech sent.",
      metadata: {
        source: "stt",
        utteranceId: "utt-1",
        artifacts: { audioPath: ".ambient/stt/thread-1/utt-1.raw.wav" },
      },
    });

    const running = sttTranscriptReadyAction({
      autoSendAfterTranscription: true,
      running: true,
      text: "follow up after tools finish",
      transcription: transcription({ utteranceId: "utt-2" }),
    });
    expect(running).toMatchObject({
      kind: "send",
      content: "follow up after tools finish",
      delivery: "follow-up",
      composerMessage: "Speech queued as follow-up.",
      metadata: { utteranceId: "utt-2" },
    });
  });

  it("maps ready transcripts to composer insertion when auto-send is disabled", () => {
    const action = sttTranscriptReadyAction({
      autoSendAfterTranscription: false,
      running: true,
      text: "review before sending",
      transcription: transcription(),
    });
    expect(action).toEqual({ kind: "insert", composerMessage: "Transcript inserted in composer." });

    const emptyDraft = sttInsertTranscriptIntoDraft({
      currentDraft: "",
      text: "review before sending",
      transcription: transcription(),
    });
    expect(emptyDraft).toMatchObject({
      draft: "review before sending",
      draftMetadata: { content: "review before sending", metadata: { utteranceId: "utt-1" } },
    });

    const existingDraft = sttInsertTranscriptIntoDraft({
      currentDraft: "first line",
      text: "second line",
      transcription: transcription({ utteranceId: "utt-2" }),
    });
    expect(existingDraft).toMatchObject({
      draft: "first line\nsecond line",
      draftMetadata: { content: "first line\nsecond line", metadata: { utteranceId: "utt-2" } },
    });

    const trailingWhitespaceDraft = sttInsertTranscriptIntoDraft({
      currentDraft: "preface ",
      text: "continued",
      transcription: transcription(),
    });
    expect(trailingWhitespaceDraft.draft).toBe("preface continued");
  });

  it("preserves STT draft metadata only when the inserted transcript is submitted exactly", () => {
    const inserted = sttInsertTranscriptIntoDraft({
      currentDraft: "",
      text: "send this exact transcript",
      transcription: transcription(),
    });
    expect(sttDraftMetadataForSubmit({
      draft: "send this exact transcript",
      content: "send this exact transcript",
      draftMetadata: inserted.draftMetadata,
    })).toMatchObject({ utteranceId: "utt-1" });
    expect(sttDraftMetadataForSubmit({
      draft: "send this exact transcript please",
      content: "send this exact transcript please",
      draftMetadata: inserted.draftMetadata,
    })).toBeUndefined();
    expect(sttDraftMetadataForSubmit({
      draft: "/plan send this exact transcript",
      content: "send this exact transcript",
      draftMetadata: { ...inserted.draftMetadata, content: "/plan send this exact transcript" },
    })).toBeUndefined();
  });
});

function message(input: { id: string; metadata?: Record<string, unknown> }): ChatMessage {
  return {
    id: input.id,
    threadId: "thread-1",
    role: "user",
    content: "hello",
    createdAt: "2026-05-10T00:00:00.000Z",
    metadata: input.metadata,
  };
}

function sttMetadata(utteranceId: string) {
  return {
    source: "stt",
    utteranceId,
    threadId: "thread-1",
    status: "ready",
    artifacts: {
      audioPath: `.ambient/stt/thread-1/${utteranceId}.raw.wav`,
    },
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:01.000Z",
  };
}

function transcription(input: Partial<SttTranscriptionState> = {}): SttTranscriptionState {
  return {
    utteranceId: input.utteranceId ?? "utt-1",
    threadId: input.threadId ?? "thread-1",
    status: input.status ?? "ready",
    audioPath: input.audioPath ?? `.ambient/stt/thread-1/${input.utteranceId ?? "utt-1"}.raw.wav`,
    normalizedAudioPath: input.normalizedAudioPath ?? `.ambient/stt/thread-1/${input.utteranceId ?? "utt-1"}.wav`,
    providerCapabilityId: input.providerCapabilityId ?? "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
    providerId: input.providerId ?? "qwen3-asr-0.6b-llamacpp",
    language: input.language ?? "English",
    text: input.text ?? "open settings",
    durationMs: input.durationMs ?? 1100,
    noSpeechGate: input.noSpeechGate ?? { enabled: true, skipped: false, rmsDbfs: -24, thresholdDbfs: -55 },
    transcriptPath: input.transcriptPath ?? `.ambient/stt/thread-1/${input.utteranceId ?? "utt-1"}.txt`,
    jsonPath: input.jsonPath ?? `.ambient/stt/thread-1/${input.utteranceId ?? "utt-1"}.json`,
    createdAt: input.createdAt ?? "2026-05-10T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-05-10T00:00:01.000Z",
  };
}
