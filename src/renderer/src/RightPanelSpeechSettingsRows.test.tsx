import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import type { SttProviderCandidate } from "../../shared/localRuntimeTypes";
import { RightPanelSpeechSettingsSection, type RightPanelSpeechSettingsSectionProps } from "./RightPanelSettingsVoiceSpeech";

describe("RightPanelSpeechSettingsRows", () => {
  it("renders speech provider, microphone, diagnostics, and advanced rows through the stable section wrapper", () => {
    const markup = renderToStaticMarkup(<RightPanelSpeechSettingsSection {...baseProps()} />);

    expect(markup).toContain("Speech Input");
    expect(markup).toContain("Refresh providers");
    expect(markup).toContain("Known providers");
    expect(markup).toContain("Qwen3-ASR Local");
    expect(markup).toContain("Speech input microphone");
    expect(markup).toContain("Studio Mic");
    expect(markup).toContain("Record test sample");
    expect(markup).toContain("Push-to-talk shortcut");
    expect(markup).toContain("Speech diagnostics");
    expect(markup).toContain("Advanced recognition");
    expect(markup).toContain("RMS no-speech gate");
  });
});

function baseProps(overrides: Partial<RightPanelSpeechSettingsSectionProps> = {}): RightPanelSpeechSettingsSectionProps {
  const noop = vi.fn();
  const provider = sttProvider();
  return {
    state: desktopState(),
    running: false,
    settingsRowVisible: () => true,
    sttProviderModel: {
      selectedProvider: provider,
      enabledChecked: true,
      enableDisabled: false,
      statusLabel: "Ready",
      setupActions: [{ action: "validate", label: "Validate", title: "Validate Qwen3-ASR", icon: "validate" }],
      selectedLanguage: "en",
      languageOptions: ["en", "es"],
      availabilityMessage: "Qwen3-ASR is ready.",
      validation: {
        statusLabel: "Validation ready",
        statusTone: "success",
        detailLabels: ["Last test passed"],
        missingHints: [],
      },
    },
    sttProviders: [provider],
    sttProvidersLoading: false,
    sttProvidersError: undefined,
    sttProviderCacheStatus: {
      providerCount: 1,
      lastCompletedAt: "2026-06-23T00:00:00.000Z",
      lastTrigger: "startup",
    },
    sttProviderCacheActivity: [
      {
        id: "stt-cache-1",
        at: "2026-06-23T00:00:00.000Z",
        trigger: "startup",
        status: "success",
        providerCount: 1,
        availableCount: 1,
        unavailableCount: 0,
        changes: ["Qwen3-ASR Local became available"],
      },
    ],
    sttProviderSetup: { status: "idle" },
    sttSetupModel: undefined,
    sttCatalogCards: [],
    selectedSttProvider: provider,
    sttMicrophoneDevices: [{ deviceId: "mic-1", label: "Studio Mic" }],
    selectedSttMicrophoneId: "mic-1",
    selectedSttMicrophoneMissing: false,
    sttMicrophoneSettingsValue: "Studio Mic",
    sttMicrophoneDevicesLoading: false,
    sttMicrophoneDevicesError: undefined,
    sttMicTest: { status: "idle" },
    sttMicTestRecording: false,
    sttMicTestBusy: false,
    sttMicTestDisabled: false,
    sttShortcutDisplayLabel: "Cmd+Shift+Space",
    sttShortcutCapture: false,
    setSttShortcutCapture: noop,
    sttDiagnosticRows: [],
    speechDiagnosticsHasIssue: false,
    startProviderCatalogCardOnboarding: noop,
    onLoadSttProviders: noop,
    onSetupSttProvider: noop,
    onSttSettingsChange: noop,
    onLoadSttMicrophoneDevices: noop,
    onStopSttMicTest: noop,
    onCancelSttMicTest: noop,
    onStartSttMicTest: noop,
    ...overrides,
  } as RightPanelSpeechSettingsSectionProps;
}

function desktopState(): DesktopState {
  return {
    providerCatalog: {
      catalogVersion: "test-catalog",
      generatedAt: "2026-06-23T00:00:00.000Z",
    },
    settings: {
      stt: {
        enabled: true,
        providerCapabilityId: "stt:qwen3",
        spokenLanguage: "en",
        microphone: { deviceId: "mic-1", label: "Studio Mic" },
        pushToTalkShortcut: "Cmd+Shift+Space",
        silenceFinalizeSeconds: 0.8,
        autoSendAfterTranscription: false,
        noSpeechGate: { enabled: true, rmsThresholdDbfs: -54 },
        bargeIn: { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
      },
    },
  } as DesktopState;
}

function sttProvider(): SttProviderCandidate {
  return {
    capabilityId: "stt:qwen3",
    providerId: "qwen3-asr",
    packageId: "ambient-stt-qwen3-asr",
    packageName: "ambient-stt-qwen3-asr",
    label: "Qwen3-ASR Local",
    available: true,
    defaultLanguage: "en",
  } as SttProviderCandidate;
}
