import type { RefObject } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { VoiceArtifactRetentionSummary, VoiceProviderCandidate, VoiceProviderVoiceCandidate } from "../../shared/localRuntimeTypes";
import { RightPanelVoiceSettingsSection, type RightPanelVoiceSettingsSectionProps } from "./RightPanelSettingsVoiceSpeech";

describe("RightPanelVoiceSettingsRows", () => {
  it("renders voice provider, voice selection, playback, setup, and artifact rows through the stable section wrapper", () => {
    const markup = renderToStaticMarkup(<RightPanelVoiceSettingsSection {...baseProps()} />);

    expect(markup).toContain("Voice Output");
    expect(markup).toContain("Refresh providers");
    expect(markup).toContain("Known providers");
    expect(markup).toContain("Piper TTS");
    expect(markup).toContain("Provider details");
    expect(markup).toContain("Studio Voice");
    expect(markup).toContain("Voice audio format");
    expect(markup).toContain("Enable assistant voice");
    expect(markup).toContain("Setup details");
    expect(markup).toContain("Voice setup health");
    expect(markup).toContain("Voice artifacts");
    expect(markup).toContain("Clean orphaned");
  });
});

function baseProps(overrides: Partial<RightPanelVoiceSettingsSectionProps> = {}): RightPanelVoiceSettingsSectionProps {
  const noop = vi.fn();
  const provider = voiceProvider();
  const voice = provider.voices[0];
  return {
    state: desktopState(),
    running: false,
    settingsRowVisible: () => true,
    focusedSettingsSection: "voice",
    voiceSettingsRowRef: { current: null } as RefObject<HTMLElement | null>,
    voiceProviderModel: {
      selectedProvider: provider,
      selectedVoiceId: voice.id,
      selectedFormat: "wav",
      enabledChecked: true,
      enableDisabled: false,
      autoplayChecked: true,
      autoplayDisabled: false,
      statusLabel: "Piper TTS",
      runtimeState: {
        status: "ready",
        label: "Voice ready",
        detail: "Piper runtime is ready.",
        tone: "success",
      },
      availabilityMessage: "Piper TTS is ready.",
    },
    voiceProviders: [provider],
    voiceProvidersLoading: false,
    voiceProvidersError: undefined,
    voiceProviderCacheStatus: {
      providerCount: 1,
      lastCompletedAt: "2026-06-23T00:00:00.000Z",
      lastTrigger: "startup",
      lastCatalogRefresh: {
        providerLabel: provider.label,
        refreshedAt: "2026-06-23T00:00:00.000Z",
        voiceCount: 1,
        durationMs: 34,
      },
    },
    voiceProviderCacheActivity: [
      {
        id: "voice-cache-1",
        at: "2026-06-23T00:00:00.000Z",
        trigger: "startup",
        status: "success",
        providerCount: 1,
        availableCount: 1,
        unavailableCount: 0,
        changes: ["Piper TTS became available"],
      },
    ],
    voiceProviderLabelMode: "local providers",
    selectedVoiceProvider: provider,
    selectedVoiceOptions: [voice],
    filteredSelectedVoiceOptions: [voice],
    displayedSelectedVoiceOptions: [voice],
    selectedVoiceSearch: "",
    voiceSearchQuery: "",
    setVoiceSearchQuery: noop,
    selectedVoice: voice,
    selectedPreferredVoice: voice,
    selectedPreferredVoiceId: voice.id,
    selectedVoiceCatalog: provider.voiceCatalog,
    selectedVoiceCatalogRefresh: undefined,
    voiceCatalogCards: [],
    voiceSetupHealth: [{ label: "Provider", detail: "ready", tone: "success" }],
    voiceSetupHasIssue: false,
    voiceAuditRows: [
      {
        id: "voice-audit-1",
        createdAt: "2026-06-23T00:01:00.000Z",
        sourceLabel: "Settings",
        summary: "Enabled voice output",
        detail: "Piper TTS",
      },
    ],
    voiceArtifactRetention: voiceArtifactRetention(),
    voiceArtifactRetentionLoading: false,
    voiceArtifactRetentionError: undefined,
    voiceArtifactPruning: false,
    onLoadVoiceProviders: noop,
    startVoiceProviderOnboarding: noop,
    startProviderCatalogCardOnboarding: noop,
    onVoiceSettingsChange: noop,
    onRefreshVoiceCatalog: noop,
    loadVoiceArtifactRetention: noop,
    pruneVoiceArtifactRetention: noop,
    ...overrides,
  };
}

function desktopState(): DesktopState {
  return {
    providerCatalog: {
      catalogVersion: "test-catalog",
      generatedAt: "2026-06-23T00:00:00.000Z",
    },
    settings: {
      voice: {
        enabled: true,
        mode: "assistant-final",
        autoplay: true,
        providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
        voiceId: "studio",
        preferredVoicesByProvider: {
          "ambient-cli:piper:tool:piper_tts": "studio",
        },
        maxChars: 1500,
        longReply: "summarize",
        format: "wav",
        artifactCacheMaxMb: 30,
      },
    },
  } as unknown as DesktopState;
}

function voiceProvider(): VoiceProviderCandidate {
  const voice: VoiceProviderVoiceCandidate = {
    id: "studio",
    label: "Studio Voice",
    source: "dynamic-cache",
    locale: "en-US",
    style: ["neutral"],
  };
  return {
    packageId: "ambient-cli:piper",
    packageName: "piper",
    command: "piper_tts",
    capabilityId: "ambient-cli:piper:tool:piper_tts",
    providerId: "ambient-cli:piper:tool:piper_tts",
    label: "Piper TTS",
    format: "wav",
    formats: ["wav", "mp3"],
    voices: [voice],
    voiceCatalog: {
      cacheStatus: "fresh",
      refreshedAt: "2026-06-23T00:00:00.000Z",
      expiresAt: "2026-06-24T00:00:00.000Z",
      source: "cloud-api",
      voiceCount: 1,
      dynamicVoiceCount: 1,
    },
    voiceDiscovery: {
      source: "cloud-api",
      requiresNetwork: true,
      cacheTtlSeconds: 3600,
    },
    local: true,
    installed: true,
    available: true,
    availabilityReason: "ready",
  } as unknown as VoiceProviderCandidate;
}

function voiceArtifactRetention(): VoiceArtifactRetentionSummary {
  return {
    threadId: "thread-1",
    providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
    rootPath: "/tmp/voice-artifacts",
    managedFileCount: 2,
    managedBytes: 2048,
    referencedFileCount: 1,
    referencedBytes: 1024,
    orphanedFileCount: 1,
    orphanedBytes: 1024,
    referencedPreview: ["kept.wav"],
    orphanedPreview: ["orphaned.wav"],
  };
}
