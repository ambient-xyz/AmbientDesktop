import { describe, expect, it } from "vitest";
import type { SttProviderCandidate, SttSettings, SttTranscriptionState } from "../shared/types";
import {
  buildSttStatus,
  planSttPolicyUpdate,
  planSttSelection,
  sttPolicyApprovalDetail,
  sttPolicyNoopText,
  sttPolicyText,
  sttProviderTestText,
  sttSelectApprovalDetail,
  sttSelectNoopText,
  sttSelectText,
  sttStatusText,
} from "./sttSettingsTools";

describe("STT settings tools", () => {
  it("builds status with selected provider and validation metadata", () => {
    const status = buildSttStatus(settings(), [
      provider({
        diagnostics: {
          healthStatus: "passed",
          missingHints: [],
          distribution: { packageType: "adapter-only", bundledModelAssets: false },
          installPlan: { resolver: "uv", packages: ["faster-whisper==1.1.1", "requests"] },
        },
      }),
    ]);

    expect(status.selectedProvider?.label).toBe("Qwen3-ASR Local");
    expect(sttStatusText(status)).toContain("Selected provider: Qwen3-ASR Local (ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe)");
    expect(sttStatusText(status)).toContain("packageType=adapter-only");
    expect(sttStatusText(status)).toContain("installer=uv");
    expect(sttStatusText(status)).toContain("modelAssets=not-bundled");
    expect(sttStatusText(status)).toContain("validation=passed");
    expect(sttStatusText(status)).toContain("assets=qwen3-asr-0.6b-q8_0@928ab958");
    expect(sttStatusText(status)).toContain("Use ambient_stt_select with exact providerCapabilityId");
    expect(sttStatusText(status)).toContain("do not pass raw audio");
  });

  it("plans provider and language selection while preserving speech policy", () => {
    const current = settings({
      providerCapabilityId: "ambient-cli:other-stt:tool:other_transcribe",
      spokenLanguage: "French",
      enabled: false,
      silenceFinalizeSeconds: 1.2,
      noSpeechGate: { enabled: true, rmsThresholdDbfs: -52 },
    });
    const plan = planSttSelection(
      {
        providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
        spokenLanguage: "spanish",
        enabled: true,
        reason: "Use the local multilingual provider.",
      },
      current,
      [
        provider({
          capabilityId: "ambient-cli:other-stt:tool:other_transcribe",
          label: "Other STT",
          packageName: "other-stt",
          command: "other_transcribe",
          languages: ["English", "French"],
        }),
        provider(),
      ],
    );

    expect(plan.nextSettings).toMatchObject({
      enabled: true,
      providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
      spokenLanguage: "Spanish",
      silenceFinalizeSeconds: 1.2,
      noSpeechGate: { enabled: true, rmsThresholdDbfs: -52 },
    });
    expect(sttSelectApprovalDetail(plan, "/tmp/workspace")).toContain("Other STT");
    expect(sttSelectApprovalDetail(plan, "/tmp/workspace")).toContain("Qwen3-ASR Local");
    expect(sttSelectText(plan, plan.nextSettings)).toContain("French -> Spanish");
  });

  it("marks STT provider selection as no-op when settings already match", () => {
    const plan = planSttSelection(
      { providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe", spokenLanguage: "English" },
      settings(),
      [provider()],
    );

    expect(plan.hasChanges).toBe(false);
    expect(sttSelectNoopText(plan)).toContain("already configured");
    expect(sttSelectNoopText(plan)).toContain("no approval was required");
  });

  it("uses unique provider aliases and rejects unavailable providers or unsupported languages", () => {
    expect(planSttSelection({ providerAlias: "qwen3-asr local", spokenLanguage: "Japanese" }, settings({ providerCapabilityId: undefined }), [provider()]).nextSettings).toMatchObject({
      providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
      spokenLanguage: "Japanese",
    });
    expect(() => planSttSelection({ providerAlias: "qwen" }, settings(), [
      provider({ capabilityId: "one", label: "Qwen", command: "qwen_transcribe" }),
      provider({ capabilityId: "two", label: "Qwen", command: "qwen_transcribe" }),
    ])).toThrow(/ambiguous/);
    expect(() => planSttSelection({ providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe" }, settings(), [
      provider({ available: false, availabilityReason: "runtime missing" }),
    ])).toThrow(/not available/);
    expect(() => planSttSelection({ spokenLanguage: "Klingon" }, settings(), [provider()])).toThrow(/does not declare support/);
  });

  it("plans STT policy updates for queueing, gates, silence, shortcut, and auto-send", () => {
    const plan = planSttPolicyUpdate(
      {
        enabled: true,
        autoSendAfterTranscription: false,
        silenceFinalizeSeconds: 1.5,
        noSpeechGateEnabled: false,
        noSpeechGateRmsThresholdDbfs: -48,
        stopTtsOnSpeech: false,
        queueWhileAgentRuns: false,
        pushToTalkShortcut: "Ctrl+Space",
        reason: "User wants review before send.",
      },
      settings({ enabled: false }),
    );

    expect(plan.nextSettings).toMatchObject({
      enabled: true,
      autoSendAfterTranscription: false,
      silenceFinalizeSeconds: 1.5,
      pushToTalkShortcut: "Ctrl+Space",
      noSpeechGate: { enabled: false, rmsThresholdDbfs: -48 },
      bargeIn: { stopTtsOnSpeech: false, queueWhileAgentRuns: false },
    });
    expect(sttPolicyApprovalDetail(plan, "/tmp/workspace")).toContain("Queue while agent runs: true -> false");
    expect(sttPolicyText(plan, plan.nextSettings)).toContain("Auto-send after transcription: true -> false");
  });

  it("supports no-op and validation failures for STT policy updates", () => {
    const noop = planSttPolicyUpdate({ silenceFinalizeSeconds: 0.8 }, settings());
    expect(noop.hasChanges).toBe(false);
    expect(sttPolicyNoopText(noop)).toContain("already configured");
    expect(() => planSttPolicyUpdate({}, settings())).toThrow(/No STT policy changes/);
    expect(() => planSttPolicyUpdate({ enabled: true }, settings({ providerCapabilityId: undefined }))).toThrow(/Select an available STT provider/);
    expect(() => planSttPolicyUpdate({ silenceFinalizeSeconds: 5 }, settings())).toThrow(/0.3 to 2.5/);
    expect(() => planSttPolicyUpdate({ noSpeechGateRmsThresholdDbfs: -5 }, settings())).toThrow(/-90 to -20/);
    expect(() => planSttPolicyUpdate({ pushToTalkShortcut: "Ctrl+Space", clearPushToTalkShortcut: true }, settings())).toThrow(/either/);
    expect(() => planSttPolicyUpdate({ spokenLanguage: "Klingon" }, settings(), [provider()])).toThrow(/does not declare support/);
  });

  it("formats STT test results without raw audio payloads", () => {
    const text = sttProviderTestText("Qwen3-ASR Local", transcription({
      status: "ready",
      text: "ambient speech recognition spike",
      durationMs: 1234,
      noSpeechGate: { enabled: true, skipped: false, rmsDbfs: -31.25, thresholdDbfs: -55 },
      transcriptPath: ".ambient/stt/thread/utt.txt",
      jsonPath: ".ambient/stt/thread/utt.json",
      normalizedAudioPath: ".ambient/stt/thread/utt.wav",
    }));

    expect(text).toContain("Ambient STT test succeeded");
    expect(text).toContain("Transcript: ambient speech recognition spike");
    expect(text).toContain("RMS: -31.3 dBFS");
    expect(text).toContain("Raw audio bytes were not returned");
  });
});

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

function provider(input: Partial<SttProviderCandidate> = {}): SttProviderCandidate {
  return {
    packageId: input.packageId ?? "ambient-cli:ambient-qwen3-asr",
    packageName: input.packageName ?? "ambient-qwen3-asr",
    command: input.command ?? "qwen3_asr_transcribe",
    capabilityId: input.capabilityId ?? "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
    providerId: input.providerId ?? "qwen3-asr-0.6b-llamacpp",
    label: input.label ?? "Qwen3-ASR Local",
    description: input.description,
    languages: input.languages ?? ["English", "Spanish", "Japanese"],
    defaultLanguage: input.defaultLanguage ?? "English",
    local: input.local ?? true,
    installed: input.installed ?? true,
    available: input.available ?? true,
    availabilityReason: input.availabilityReason ?? "Installed Ambient CLI package is available.",
    validation: input.validation ?? {
      schemaVersion: "ambient-stt-provider-validation-v1",
      provider: "qwen3-asr",
      packageName: "ambient-qwen3-asr",
      status: "passed",
      updatedAt: "2026-05-10T00:00:00.000Z",
      platform: "darwin",
      arch: "arm64",
      lane: "macos-arm64-metal",
      model: "ggml-org/Qwen3-ASR-0.6B-GGUF:Q8_0",
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
      missingHints: [],
    },
    ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
  };
}

function transcription(input: Partial<SttTranscriptionState> = {}): SttTranscriptionState {
  return {
    utteranceId: input.utteranceId ?? "utt-test",
    threadId: input.threadId ?? "thread-test",
    status: input.status ?? "ready",
    audioPath: input.audioPath ?? ".ambient/stt/thread/utt.raw.wav",
    normalizedAudioPath: input.normalizedAudioPath,
    providerCapabilityId: input.providerCapabilityId ?? "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
    providerId: input.providerId ?? "qwen3-asr-0.6b-llamacpp",
    language: input.language ?? "English",
    text: input.text,
    durationMs: input.durationMs,
    noSpeechGate: input.noSpeechGate,
    transcriptPath: input.transcriptPath,
    jsonPath: input.jsonPath,
    createdAt: input.createdAt ?? "2026-05-10T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-05-10T00:00:01.000Z",
  };
}
