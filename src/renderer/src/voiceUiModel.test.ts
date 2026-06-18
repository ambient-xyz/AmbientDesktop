import { describe, expect, it } from "vitest";
import type { MessageVoiceState, VoiceProviderCandidate, VoiceSettings } from "../../shared/localRuntimeTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import {
  latestReadyVoiceAutoplayTarget,
  messageVoiceStripModel,
  nextVoiceAutoplayDecision,
  voiceThreadStatusModel,
  voiceProviderCacheChanges,
  voiceProviderLabelForCapabilityId,
  voiceProviderForCapabilityId,
  voiceProviderLabelMap,
  voiceRunDiagnosticForState,
  voiceSettingsAuditRows,
  voiceSettingsProviderModel,
  voiceProviderDiagnosticsModel,
  voiceStateMatchesSelectedProvider,
} from "./voiceUiModel";

function voiceState(input: Partial<MessageVoiceState> = {}): MessageVoiceState {
  return {
    messageId: input.messageId ?? "assistant-1",
    threadId: input.threadId ?? "thread-1",
    status: input.status ?? "ready",
    source: input.source ?? "summary",
    sourceMessageId: input.sourceMessageId ?? input.messageId ?? "assistant-1",
    providerCapabilityId: input.providerCapabilityId ?? "ambient-cli:voice:tool:piper",
    providerId: input.providerId,
    voiceId: input.voiceId ?? "default",
    spokenText: input.spokenText ?? "Fresh spoken summary.",
    spokenTextChars: input.spokenTextChars ?? 21,
    sourceTextChars: input.sourceTextChars ?? 240,
    audioPath: "audioPath" in input ? input.audioPath : ".ambient/voice/thread-1/assistant-1.wav",
    lastAudioPath: input.lastAudioPath,
    mediaUrl: "mediaUrl" in input ? input.mediaUrl : "ambient-media://voice/.ambient/voice/thread-1/assistant-1.wav?mime=audio/wav&size=16",
    mimeType: "mimeType" in input ? input.mimeType : "audio/wav",
    durationMs: "durationMs" in input ? input.durationMs : 1200,
    error: input.error,
    createdAt: input.createdAt ?? "2026-05-07T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-05-07T00:00:01.000Z",
  };
}

function message(input: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: input.id ?? "assistant-1",
    threadId: input.threadId ?? "thread-1",
    role: input.role ?? "assistant",
    content: input.content ?? "Ready.",
    createdAt: input.createdAt ?? "2026-05-07T00:00:00.000Z",
    metadata: input.metadata,
  };
}

function provider(input: Partial<VoiceProviderCandidate> = {}): VoiceProviderCandidate {
  return {
    packageId: input.packageId ?? "ambient-cli:piper",
    packageName: input.packageName ?? "piper",
    command: input.command ?? "piper_tts",
    capabilityId: input.capabilityId ?? "ambient-cli:piper:tool:piper_tts",
    providerId: input.providerId ?? input.capabilityId ?? "ambient-cli:piper:tool:piper_tts",
    label: input.label ?? "Piper TTS",
    description: input.description,
    format: input.format ?? "wav",
    formats: input.formats ?? ["wav"],
    voices: input.voices ?? [{ id: "default", label: "Default" }],
    local: input.local,
    installed: input.installed ?? true,
    available: input.available ?? true,
    availabilityReason: input.availabilityReason ?? "Installed Ambient CLI package is available; execution still requires Desktop approval.",
    ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
  };
}

function voiceSettings(input: Partial<VoiceSettings> = {}): VoiceSettings {
  return {
    enabled: input.enabled ?? true,
    mode: input.mode ?? "assistant-final",
    autoplay: input.autoplay ?? true,
    providerCapabilityId: "providerCapabilityId" in input ? input.providerCapabilityId : "ambient-cli:piper:tool:piper_tts",
    voiceId: input.voiceId,
    preferredVoicesByProvider: input.preferredVoicesByProvider,
    maxChars: input.maxChars ?? 1500,
    longReply: input.longReply ?? "summarize",
    format: input.format ?? "wav",
    artifactCacheMaxMb: input.artifactCacheMaxMb ?? 30,
  };
}

describe("voice UI model", () => {
  it("shows ready summary playback and regenerate controls", () => {
    expect(messageVoiceStripModel(voiceState())).toMatchObject({
      statusLabel: "Voice ready",
      sourceLabel: "spoken summary",
      canPlay: true,
      canInspect: true,
      canRevealArtifact: true,
      canClearArtifact: true,
      canRegenerate: true,
      regenerateLabel: "Regenerate voice",
      audioKey: ".ambient/voice/thread-1/assistant-1.wav:2026-05-07T00:00:01.000Z",
      detailParts: [
        "spoken summary",
        "240 source chars",
        "21 spoken chars",
        "provider Piper",
      ],
      inspectRows: expect.arrayContaining([
        { label: "Source", value: "spoken summary" },
        { label: "Provider", value: "Piper" },
        { label: "Provider ID", value: "ambient-cli:voice:tool:piper" },
        { label: "Artifact path", value: ".ambient/voice/thread-1/assistant-1.wav" },
        { label: "MIME type", value: "audio/wav" },
      ]),
      spokenTextPreview: "Fresh spoken summary.",
    });
  });

  it("shows failed summary retry without playback controls", () => {
    expect(
      messageVoiceStripModel(
        voiceState({
          status: "failed",
          audioPath: undefined,
          mediaUrl: undefined,
          mimeType: undefined,
          durationMs: undefined,
          spokenText: undefined,
          spokenTextChars: 0,
          error: "provider unavailable",
        }),
      ),
    ).toMatchObject({
      statusLabel: "Voice failed",
      diagnostic: {
        cause: "provider-unavailable",
        label: "Provider unavailable",
      },
      canPlay: false,
      canInspect: true,
      canRevealArtifact: false,
      canClearArtifact: false,
      canRegenerate: true,
      regenerateLabel: "Retry voice synthesis",
      audioKey: undefined,
      detailParts: [
        "spoken summary",
        "240 source chars",
        "provider Piper",
        "Provider unavailable",
      ],
      inspectRows: expect.arrayContaining([
        { label: "Voice diagnostic", value: "Provider unavailable" },
        { label: "Provider error", value: "provider unavailable" },
      ]),
    });
  });

  it("classifies skipped long replies and missing ready artifacts", () => {
    expect(
      voiceRunDiagnosticForState(
        voiceState({
          status: "skipped",
          audioPath: undefined,
          mediaUrl: undefined,
          spokenTextChars: 0,
          error: "Long-reply policy skipped this message because it exceeds max chars.",
        }),
      ),
    ).toMatchObject({
      cause: "long-reply-policy",
      label: "Skipped by long-reply policy",
    });

    expect(
      messageVoiceStripModel(
        voiceState({
          status: "ready",
          audioPath: undefined,
          mediaUrl: undefined,
        }),
      ),
    ).toMatchObject({
      diagnostic: {
        cause: "missing-artifact",
        label: "Missing playback artifact",
      },
      canPlay: false,
      inspectRows: expect.arrayContaining([
        { label: "Voice diagnostic", value: "Missing playback artifact" },
      ]),
    });
  });

  it("keeps cleared voice artifacts inspectable as retryable voice states without playback", () => {
    expect(
      messageVoiceStripModel(
        voiceState({
          status: "canceled",
          audioPath: undefined,
          lastAudioPath: ".ambient/voice/thread-1/assistant-1.wav",
          mediaUrl: undefined,
          mimeType: undefined,
          durationMs: undefined,
          error: "Voice artifact cleared.",
        }),
      ),
    ).toMatchObject({
      statusLabel: "Voice canceled",
      diagnostic: {
        cause: "artifact-cleared",
        label: "Audio artifact cleared",
      },
      canPlay: false,
      canInspect: true,
      canRevealArtifact: false,
      canClearArtifact: false,
      canRegenerate: true,
      regenerateLabel: "Retry voice synthesis",
      detailParts: [
        "spoken summary",
        "240 source chars",
        "21 spoken chars",
        "provider Piper",
        "Audio artifact cleared",
      ],
      inspectRows: expect.arrayContaining([
        { label: "Voice diagnostic", value: "Audio artifact cleared" },
        { label: "Last artifact path", value: ".ambient/voice/thread-1/assistant-1.wav" },
      ]),
      spokenTextPreview: "Fresh spoken summary.",
    });
  });

  it("labels routine voice cache cleanup as muted cleared audio instead of canceled synthesis", () => {
    expect(
      messageVoiceStripModel(
        voiceState({
          status: "canceled",
          audioPath: undefined,
          lastAudioPath: ".ambient/voice/thread-1/assistant-1.wav",
          mediaUrl: undefined,
          mimeType: undefined,
          durationMs: undefined,
          error: "Voice artifact cache cleared on startup.",
        }),
      ),
    ).toMatchObject({
      statusLabel: "Audio cache cleared",
      diagnostic: {
        cause: "artifact-cleared",
        label: "Cached audio cleared",
        tone: "muted",
      },
      canRegenerate: true,
      detailParts: expect.arrayContaining(["Cached audio cleared"]),
      inspectRows: expect.arrayContaining([
        { label: "Voice diagnostic", value: "Cached audio cleared" },
      ]),
    });
  });

  it("does not autoplay historical ready voice on first observation", () => {
    const target = latestReadyVoiceAutoplayTarget({
      autoplay: true,
      messages: [message({ id: "assistant-1" })],
      messageVoiceStates: { "assistant-1": voiceState({ messageId: "assistant-1" }) },
    });
    expect(target).toEqual({
      messageId: "assistant-1",
      key: "assistant-1:2026-05-07T00:00:01.000Z:ambient-media://voice/.ambient/voice/thread-1/assistant-1.wav?mime=audio/wav&size=16",
    });

    const initial = nextVoiceAutoplayDecision({ initialized: false }, target?.key);
    expect(initial).toEqual({ next: { initialized: true, lastKey: target?.key } });

    const unchanged = nextVoiceAutoplayDecision(initial.next, target?.key);
    expect(unchanged).toEqual({ next: { initialized: true, lastKey: target?.key } });
  });

  it("autoplays only a newly refreshed ready voice key", () => {
    const oldKey = "assistant-1:2026-05-07T00:00:01.000Z:ambient-media://voice/old.wav";
    const refreshed = latestReadyVoiceAutoplayTarget({
      autoplay: true,
      messages: [message({ id: "assistant-1" })],
      messageVoiceStates: {
        "assistant-1": voiceState({
          messageId: "assistant-1",
          mediaUrl: "ambient-media://voice/new.wav",
          updatedAt: "2026-05-07T00:00:02.000Z",
        }),
      },
    });

    expect(nextVoiceAutoplayDecision({ initialized: true, lastKey: oldKey }, refreshed?.key)).toEqual({
      next: { initialized: true, lastKey: "assistant-1:2026-05-07T00:00:02.000Z:ambient-media://voice/new.wav" },
      autoplayKey: "assistant-1:2026-05-07T00:00:02.000Z:ambient-media://voice/new.wav",
    });
  });

  it("ignores stale ready artifacts from a previously selected provider", () => {
    const stale = voiceState({
      messageId: "assistant-1",
      providerCapabilityId: "ambient-cli:old-provider:tool:piper",
      mediaUrl: "ambient-media://voice/old-provider.wav",
    });
    expect(voiceStateMatchesSelectedProvider(stale, "ambient-cli:new-provider:tool:piper")).toBe(false);
    expect(
      latestReadyVoiceAutoplayTarget({
        autoplay: true,
        providerCapabilityId: "ambient-cli:new-provider:tool:piper",
        messages: [message({ id: "assistant-1" })],
        messageVoiceStates: { "assistant-1": stale },
      }),
    ).toBeUndefined();
  });

  it("does not autoplay regenerated ready artifacts after the selected provider changes", () => {
    const messages = [message({ id: "assistant-1" }), message({ id: "assistant-2" })];
    const messageVoiceStates = {
      "assistant-1": voiceState({
        messageId: "assistant-1",
        providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
        mediaUrl: "ambient-media://voice/.ambient/voice/thread-1/assistant-1.wav",
        updatedAt: "2026-05-07T00:00:02.000Z",
      }),
      "assistant-2": voiceState({
        messageId: "assistant-2",
        providerCapabilityId: "ambient-cli:kokoro:tool:kokoro_tts",
        mediaUrl: "ambient-media://voice/.ambient/voice/thread-1/assistant-2.wav",
        updatedAt: "2026-05-07T00:00:03.000Z",
      }),
    };

    expect(
      latestReadyVoiceAutoplayTarget({
        autoplay: true,
        providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
        messages,
        messageVoiceStates,
      }),
    ).toEqual({
      messageId: "assistant-1",
      key: "assistant-1:2026-05-07T00:00:02.000Z:ambient-media://voice/.ambient/voice/thread-1/assistant-1.wav",
    });
  });

  it("surfaces unavailable selected providers and blocks voice enablement", () => {
    const model = voiceSettingsProviderModel({
      providers: [
        provider({
          available: false,
          availabilityReason: "Voice provider health check failed: model file missing",
          diagnostics: {
            healthStatus: "failed",
            healthCommand: ["node", "./health.mjs"],
            healthCwd: "/workspace/.ambient/cli-packages/imported/piper",
            healthError: "model file missing",
            missingHints: ["Verify model files are downloaded and descriptor paths point at the repaired model location."],
          },
        }),
      ],
      settings: voiceSettings({ enabled: true, autoplay: true }),
    });

    expect(model).toMatchObject({
      statusLabel: "Provider unavailable",
      enabledChecked: false,
      enableDisabled: true,
      autoplayChecked: false,
      autoplayDisabled: true,
      runtimeState: {
        status: "unavailable",
        label: "Provider unavailable",
        tone: "warning",
      },
      availabilityMessage: "Voice provider health check failed: model file missing",
      diagnostics: {
        statusLabel: "Health check failed",
        statusTone: "error",
        commandLabel: "node ./health.mjs",
        errorLabel: "model file missing",
        missingHints: ["Verify model files are downloaded and descriptor paths point at the repaired model location."],
      },
    });
  });

  it("shows stopped local voice runtimes as idle provider state", () => {
    const model = voiceSettingsProviderModel({
      providers: [
        provider({
          available: false,
          availabilityReason: "Voice provider validation pending: runtime stopped",
          diagnostics: {
            healthStatus: "passed",
            healthError: "runtime stopped",
            missingHints: ["Start Piper before enabling voice output."],
            runtimeState: {
              schemaVersion: "ambient-voice-provider-runtime-state-v1",
              status: "stopped",
              running: false,
              modelRuntimeId: "piper-runtime",
              modelId: "rhasspy/piper/en_US-lessac-medium",
              endpoint: "http://127.0.0.1:59201",
              estimatedResidentMemoryBytes: 2 * 1024 * 1024 * 1024,
              reason: "daemon stopped",
            },
          },
        }),
      ],
      settings: voiceSettings({ enabled: true, autoplay: true }),
    });

    expect(model).toMatchObject({
      statusLabel: "Voice runtime stopped",
      enabledChecked: false,
      runtimeState: {
        status: "stopped",
        label: "Voice runtime stopped",
        tone: "info",
      },
      diagnostics: {
        statusLabel: "Health check passed",
        errorLabel: "runtime stopped",
        runtimeLabels: [
          "Runtime state: stopped",
          "Runtime: piper-runtime",
          "Model: rhasspy/piper/en_US-lessac-medium",
          "Endpoint: http://127.0.0.1:59201",
          "Estimated RSS: 2.0 GiB",
          "Runtime detail: daemon stopped",
        ],
      },
    });
    expect(model.runtimeState.detail).toContain("stopped local voice runtime");
  });

  it("shows selected available voice providers as off when voice output is disabled", () => {
    const model = voiceSettingsProviderModel({
      providers: [provider({ local: true })],
      settings: voiceSettings({ enabled: false, autoplay: true }),
    });

    expect(model).toMatchObject({
      statusLabel: "Voice off",
      enabledChecked: false,
      enableDisabled: false,
      autoplayChecked: true,
      autoplayDisabled: false,
      runtimeState: {
        status: "off",
        label: "Voice output off",
        tone: "info",
      },
    });
    expect(model.runtimeState.detail).toContain("selected local TTS provider");
    expect(model.runtimeState.detail).toContain("will not synthesize assistant replies");
  });

  it("enables voice settings controls only after an available provider is selected", () => {
    const model = voiceSettingsProviderModel({
      providers: [provider({ formats: ["mp3", "wav"], voices: [{ id: "voice-a" }] })],
      settings: voiceSettings({ enabled: true, autoplay: true, format: "ogg" }),
    });

    expect(model).toMatchObject({
      statusLabel: "Piper TTS",
      selectedVoiceId: "voice-a",
      selectedFormat: "wav",
      enabledChecked: true,
      enableDisabled: false,
      autoplayChecked: true,
      autoplayDisabled: false,
      runtimeState: {
        status: "ready",
        label: "Voice provider ready",
        tone: "success",
      },
    });
  });

  it("falls back to a provider-specific preferred voice when no explicit voice is selected", () => {
    const model = voiceSettingsProviderModel({
      providers: [
        provider({
          voices: [
            { id: "default", label: "Default" },
            { id: "warm-narrator", label: "Warm Narrator" },
          ],
        }),
      ],
      settings: voiceSettings({
        voiceId: undefined,
        preferredVoicesByProvider: {
          "ambient-cli:piper:tool:piper_tts": "warm-narrator",
        },
      }),
    });

    expect(model.selectedVoiceId).toBe("warm-narrator");
  });

  it("formats recent voice settings audit entries for Settings", () => {
    expect(voiceSettingsAuditRows([
      {
        id: "audit-1",
        createdAt: "2026-05-09T12:00:00.000Z",
        source: "chat-tool",
        toolName: "ambient_voice_policy_update",
        threadId: "thread-1",
        summary: "Chat updated voice policy settings.",
        changes: [
          { field: "enabled", previous: "true", next: "false" },
          { field: "longReply", previous: "summarize", next: "skip" },
        ],
      },
    ])).toEqual([
      {
        id: "audit-1",
        createdAt: "2026-05-09T12:00:00.000Z",
        sourceLabel: "Chat tool ambient_voice_policy_update",
        summary: "Chat updated voice policy settings.",
        detail: "enabled: true -> false; longReply: summarize -> skip",
      },
    ]);
  });

  it("formats provider diagnostics for Settings", () => {
    expect(
      voiceProviderDiagnosticsModel(
        provider({
          diagnostics: {
            healthStatus: "passed",
            healthCommand: ["uvx", "piper", "--help"],
            stdoutArtifactPath: ".ambient/tool-outputs/health-stdout.txt",
            stderrArtifactPath: ".ambient/tool-outputs/health-stderr.txt",
            missingHints: [],
          },
        }),
      ),
    ).toEqual({
      statusLabel: "Health check passed",
      statusTone: "success",
      commandLabel: "uvx piper --help",
      artifactLabels: [
        "stdout artifact .ambient/tool-outputs/health-stdout.txt",
        "stderr artifact .ambient/tool-outputs/health-stderr.txt",
      ],
      missingHints: [],
    });
  });

  it("resolves friendly provider labels from discovery with deterministic fallbacks", () => {
    const labels = voiceProviderLabelMap([
      provider({
        capabilityId: "ambient-cli:piper:tool:piper_tts",
        label: "Local Piper",
      }),
    ]);

    expect(voiceProviderLabelForCapabilityId("ambient-cli:piper:tool:piper_tts", labels)).toBe("Local Piper");
    expect(voiceProviderLabelForCapabilityId("ambient-cli:piper:tool:piper_tts", voiceProviderLabelMap([
      provider({
        packageId: "ambient-cli:imported/piper",
        packageName: "piper",
        command: "piper_tts",
        capabilityId: "ambient-cli:imported/piper:tool:piper_tts",
        providerId: "ambient-cli:imported/piper:tool:piper_tts",
        label: "Imported Piper",
      }),
    ]))).toBe("Imported Piper");
    expect(voiceProviderForCapabilityId([
      provider({
        packageId: "ambient-cli:imported/piper",
        packageName: "piper",
        command: "piper_tts",
        capabilityId: "ambient-cli:imported/piper:tool:piper_tts",
        providerId: "ambient-cli:imported/piper:tool:piper_tts",
        label: "Imported Piper",
      }),
    ], "ambient-cli:piper:tool:piper_tts")?.label).toBe("Imported Piper");
    expect(voiceProviderLabelForCapabilityId("ambient-cli:kokoro:tool:kokoro_tts", labels)).toBe("Kokoro TTS");
    expect(voiceProviderLabelForCapabilityId("pkg-voxtral:tool:voxtral_tts", labels)).toBe("Voxtral TTS");
  });

  it("summarizes voice provider cache changes", () => {
    expect(voiceProviderCacheChanges([], [provider({ available: false })])).toEqual(["Piper TTS added unavailable"]);
    expect(voiceProviderCacheChanges([provider({ available: false })], [provider({ available: true })])).toEqual(["Piper TTS became available"]);
    expect(voiceProviderCacheChanges([provider()], [])).toEqual(["Piper TTS removed"]);
    expect(
      voiceProviderCacheChanges([], [
        provider({ capabilityId: "one", label: "One" }),
        provider({ capabilityId: "two", label: "Two" }),
        provider({ capabilityId: "three", label: "Three" }),
        provider({ capabilityId: "four", label: "Four" }),
        provider({ capabilityId: "five", label: "Five" }),
      ]),
    ).toEqual([
      "One added available",
      "Two added available",
      "Three added available",
      "Four added available",
    ]);
  });

  it("summarizes per-thread voice lifecycle state for the chat header", () => {
    const model = voiceThreadStatusModel({
      settings: voiceSettings({ providerCapabilityId: "ambient-cli:piper:tool:piper_tts", enabled: true }),
      providerLabel: "Piper TTS",
      messageVoiceStates: {
        "assistant-1": voiceState({
          messageId: "assistant-1",
          providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
          status: "ready",
        }),
        "assistant-2": voiceState({
          messageId: "assistant-2",
          providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
          status: "failed",
          audioPath: undefined,
          mediaUrl: undefined,
          error: "model missing",
        }),
        "assistant-3": voiceState({
          messageId: "assistant-3",
          providerCapabilityId: "ambient-cli:other:tool:tts",
          status: "ready",
        }),
      },
    });

    expect(model).toMatchObject({
      visible: true,
      tone: "warning",
      label: "Voice needs attention",
      detail: "1 failed voice artifact in this thread. Reason: Provider unavailable.",
      settingsRouteLabel: "Voice diagnostics",
      counts: {
        ready: 1,
        failed: 1,
      },
    });
  });

  it("shows unavailable selected provider status when voice is enabled", () => {
    const model = voiceThreadStatusModel({
      settings: voiceSettings({ providerCapabilityId: "ambient-cli:piper:tool:piper_tts", enabled: true }),
      messageVoiceStates: {},
      selectedProvider: provider({
        capabilityId: "ambient-cli:piper:tool:piper_tts",
        label: "Piper TTS",
        available: false,
        availabilityReason: "Health check failed: model file missing",
      }),
    });

    expect(model).toMatchObject({
      visible: true,
      tone: "warning",
      label: "Voice provider unavailable",
      detail: "Piper TTS cannot synthesize new voice right now. Health check failed: model file missing",
      settingsRouteLabel: "Voice diagnostics",
    });
  });

  it("hides ready-only voice artifact summaries from the chat header", () => {
    const model = voiceThreadStatusModel({
      settings: voiceSettings({ providerCapabilityId: "ambient-cli:piper:tool:piper_tts", enabled: true }),
      providerLabel: "Piper TTS",
      messageVoiceStates: {
        "assistant-1": voiceState({
          messageId: "assistant-1",
          providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
          status: "ready",
        }),
      },
    });

    expect(model).toMatchObject({
      visible: false,
      tone: "ready",
      label: "Voice ready",
      counts: {
        ready: 1,
      },
    });
  });

  it("does not surface routine cache cleanup cancellations in the chat header", () => {
    const model = voiceThreadStatusModel({
      settings: voiceSettings({ providerCapabilityId: "ambient-cli:piper:tool:piper_tts", enabled: true }),
      providerLabel: "Piper TTS",
      messageVoiceStates: {
        "assistant-1": voiceState({
          messageId: "assistant-1",
          providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
          status: "canceled",
          audioPath: undefined,
          mediaUrl: undefined,
          error: "Voice artifact cache cleared on startup.",
        }),
      },
    });

    expect(model).toMatchObject({
      visible: true,
      tone: "idle",
      label: "Voice enabled",
      detail: "New assistant replies will use Piper TTS.",
      counts: {
        ready: 0,
        failed: 0,
        skipped: 0,
        canceled: 0,
        queued: 0,
        synthesizing: 0,
      },
    });
  });

  it("keeps explicit voice-off status ahead of unavailable provider hints", () => {
    const model = voiceThreadStatusModel({
      settings: voiceSettings({ providerCapabilityId: "ambient-cli:piper:tool:piper_tts", enabled: false }),
      messageVoiceStates: {},
      selectedProvider: provider({
        capabilityId: "ambient-cli:piper:tool:piper_tts",
        label: "Piper TTS",
        available: false,
        availabilityReason: "Health check failed: model file missing",
      }),
    });

    expect(model).toMatchObject({
      visible: true,
      tone: "muted",
      label: "Voice off",
      detail: "Piper TTS selected; assistant voice is disabled.",
      settingsRouteLabel: "Voice settings",
    });
  });

  it("prompts setup when no voice provider is selected", () => {
    expect(
      voiceThreadStatusModel({
        settings: voiceSettings({ providerCapabilityId: undefined, enabled: false }),
        messageVoiceStates: {},
      }),
    ).toMatchObject({
      visible: false,
      tone: "muted",
      label: "Voice not set up",
      detail: "Select a TTS provider to enable spoken assistant replies.",
      settingsRouteLabel: "Voice settings",
    });
  });
});
