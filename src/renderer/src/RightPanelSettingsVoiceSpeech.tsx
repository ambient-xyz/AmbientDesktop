import type { RefObject } from "react";
import type { DesktopState, ProviderCatalogSettingsCard } from "../../shared/desktopTypes";
import type { SttProviderCandidate, SttProviderSetupAction, VoiceArtifactRetentionSummary, VoiceProviderCandidate, VoiceProviderVoiceCandidate } from "../../shared/localRuntimeTypes";
import type { SttMicrophoneDevice } from "./sttMicrophoneRecorder";
import type {
  SttMicTestUiState,
  SttProviderCacheActivity,
  SttProviderCacheStatus,
  SttProviderSetupUiState,
  VoiceCatalogRefreshState,
  VoiceProviderCacheActivity,
  VoiceProviderCacheStatus,
} from "./RightPanel";
import { SettingsSection } from "./RightPanelSettingsPrimitives";
import { RightPanelSpeechSettingsRows } from "./RightPanelSpeechSettingsRows";
import { RightPanelVoiceSettingsRows } from "./RightPanelVoiceSettingsRows";
import type { VoiceSettingsProviderModel } from "./voiceUiModel";
import type {
  SttDiagnosticRowModel,
  SttSettingsProviderModel,
  SttSetupResultModel,
} from "./sttUiModel";

type SettingsRowVisible = (sectionId: string, rowId: string) => boolean;

type VoiceSetupHealthItem = {
  label: string;
  detail: string;
  tone: "success" | "warning" | "error" | "info";
};

type VoiceAuditRow = {
  id: string;
  createdAt: string;
  sourceLabel: string;
  summary: string;
  detail: string;
};

type MaybePromise<T = unknown> = T | Promise<T>;

export type RightPanelVoiceSettingsSectionProps = {
  state: DesktopState;
  running: boolean;
  settingsRowVisible: SettingsRowVisible;
  focusedSettingsSection?: "voice" | "mcp-runtime" | "search-web";
  voiceSettingsRowRef: RefObject<HTMLElement | null>;
  voiceProviderModel: VoiceSettingsProviderModel;
  voiceProviders: VoiceProviderCandidate[];
  voiceProvidersLoading: boolean;
  voiceProvidersError?: string;
  voiceProviderCacheStatus: VoiceProviderCacheStatus;
  voiceProviderCacheActivity: VoiceProviderCacheActivity[];
  voiceProviderLabelMode: string;
  selectedVoiceProvider?: VoiceProviderCandidate;
  selectedVoiceOptions: VoiceProviderVoiceCandidate[];
  filteredSelectedVoiceOptions: VoiceProviderVoiceCandidate[];
  displayedSelectedVoiceOptions: VoiceProviderVoiceCandidate[];
  selectedVoiceSearch: string;
  voiceSearchQuery: string;
  setVoiceSearchQuery: (query: string) => void;
  selectedVoice?: VoiceProviderVoiceCandidate;
  selectedPreferredVoice?: VoiceProviderVoiceCandidate;
  selectedPreferredVoiceId?: string;
  selectedVoiceCatalog?: VoiceProviderCandidate["voiceCatalog"];
  selectedVoiceCatalogRefresh?: VoiceCatalogRefreshState;
  voiceCatalogCards: ProviderCatalogSettingsCard[];
  voiceSetupHealth: VoiceSetupHealthItem[];
  voiceSetupHasIssue: boolean;
  voiceAuditRows: VoiceAuditRow[];
  voiceArtifactRetention?: VoiceArtifactRetentionSummary;
  voiceArtifactRetentionLoading: boolean;
  voiceArtifactRetentionError?: string;
  voiceArtifactPruning: boolean;
  onLoadVoiceProviders: (trigger: string) => MaybePromise;
  startVoiceProviderOnboarding: () => MaybePromise;
  startProviderCatalogCardOnboarding: (card: ProviderCatalogSettingsCard) => MaybePromise;
  onVoiceSettingsChange: (settings: DesktopState["settings"]["voice"]) => void;
  onRefreshVoiceCatalog: (providerCapabilityId: string) => void;
  loadVoiceArtifactRetention: () => MaybePromise;
  pruneVoiceArtifactRetention: () => MaybePromise;
};

export function RightPanelVoiceSettingsSection(props: RightPanelVoiceSettingsSectionProps) {
  return (
    <SettingsSection
      id="voice"
      title="Voice Output"
      description="Configure spoken assistant replies, provider health, voice selection, and artifact retention."
      badges={<span className="settings-section-badge">{props.voiceProviderModel.statusLabel}</span>}
      focused={props.focusedSettingsSection === "voice"}
      sectionRef={props.voiceSettingsRowRef}
    >
      <RightPanelVoiceSettingsRows {...props} />
    </SettingsSection>
  );
}

export type RightPanelSpeechSettingsSectionProps = {
  state: DesktopState;
  running: boolean;
  settingsRowVisible: SettingsRowVisible;
  sttProviderModel: SttSettingsProviderModel;
  sttProviders: SttProviderCandidate[];
  sttProvidersLoading: boolean;
  sttProvidersError?: string;
  sttProviderCacheStatus: SttProviderCacheStatus;
  sttProviderCacheActivity: SttProviderCacheActivity[];
  sttProviderSetup: SttProviderSetupUiState;
  sttSetupModel?: SttSetupResultModel;
  sttCatalogCards: ProviderCatalogSettingsCard[];
  selectedSttProvider?: SttProviderCandidate;
  sttMicrophoneDevices: SttMicrophoneDevice[];
  selectedSttMicrophoneId?: string;
  selectedSttMicrophoneMissing: boolean;
  sttMicrophoneSettingsValue: string;
  sttMicrophoneDevicesLoading: boolean;
  sttMicrophoneDevicesError?: string;
  sttMicTest: SttMicTestUiState;
  sttMicTestRecording: boolean;
  sttMicTestBusy: boolean;
  sttMicTestDisabled: boolean;
  sttShortcutDisplayLabel: string;
  sttShortcutCapture: boolean;
  setSttShortcutCapture: (capture: boolean) => void;
  sttDiagnosticRows: SttDiagnosticRowModel[];
  speechDiagnosticsHasIssue: boolean;
  startProviderCatalogCardOnboarding: (card: ProviderCatalogSettingsCard) => MaybePromise;
  onLoadSttProviders: (trigger: string) => MaybePromise;
  onSetupSttProvider: (action: SttProviderSetupAction) => void;
  onSttSettingsChange: (settings: DesktopState["settings"]["stt"]) => void;
  onLoadSttMicrophoneDevices: (requestPermission?: boolean) => MaybePromise;
  onStopSttMicTest: () => void;
  onCancelSttMicTest: () => void;
  onStartSttMicTest: () => void;
};

export function RightPanelSpeechSettingsSection(props: RightPanelSpeechSettingsSectionProps) {
  return (
    <SettingsSection
      id="speech"
      title="Speech Input"
      description="Configure push-to-talk, transcription provider setup, microphone validation, and speech behavior."
      badges={<span className="settings-section-badge">{props.sttProviderModel.statusLabel}</span>}
    >
      <RightPanelSpeechSettingsRows {...props} />
    </SettingsSection>
  );
}
