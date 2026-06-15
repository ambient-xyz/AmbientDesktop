import { CheckCircle2, Mic, Package, Plug, Plus, RefreshCw, Square, Zap } from "lucide-react";
import type { RefObject } from "react";
import type {
  DesktopState,
  ProviderCatalogSettingsCard,
  SttProviderCandidate,
  SttProviderSetupAction,
  VoiceArtifactRetentionSummary,
  VoiceProviderCandidate,
  VoiceProviderVoiceCandidate,
} from "../../shared/types";
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
import {
  ProviderCatalogSettingsCards,
  SettingsDisclosure,
  SettingsProviderDiagnosticsDisclosure,
  formatBytes,
  formatTimelineTime,
} from "./RightPanelSettingsRuntime";
import { SettingsRow, SettingsSection } from "./RightPanelSettingsPrimitives";
import { preferredVoiceForProvider, voiceOptionLabel } from "./RightPanelDetailPanels";
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

export function RightPanelVoiceSettingsSection({
  state,
  running,
  settingsRowVisible,
  focusedSettingsSection,
  voiceSettingsRowRef,
  voiceProviderModel,
  voiceProviders,
  voiceProvidersLoading,
  voiceProvidersError,
  voiceProviderCacheStatus,
  voiceProviderCacheActivity,
  voiceProviderLabelMode,
  selectedVoiceProvider,
  selectedVoiceOptions,
  filteredSelectedVoiceOptions,
  displayedSelectedVoiceOptions,
  selectedVoiceSearch,
  voiceSearchQuery,
  setVoiceSearchQuery,
  selectedVoice,
  selectedPreferredVoice,
  selectedPreferredVoiceId,
  selectedVoiceCatalog,
  selectedVoiceCatalogRefresh,
  voiceCatalogCards,
  voiceSetupHealth,
  voiceSetupHasIssue,
  voiceAuditRows,
  voiceArtifactRetention,
  voiceArtifactRetentionLoading,
  voiceArtifactRetentionError,
  voiceArtifactPruning,
  onLoadVoiceProviders,
  startVoiceProviderOnboarding,
  startProviderCatalogCardOnboarding,
  onVoiceSettingsChange,
  onRefreshVoiceCatalog,
  loadVoiceArtifactRetention,
  pruneVoiceArtifactRetention,
}: RightPanelVoiceSettingsSectionProps) {
  return (
        <SettingsSection
          id="voice"
          title="Voice Output"
          description="Configure spoken assistant replies, provider health, voice selection, and artifact retention."
          badges={<span className="settings-section-badge">{voiceProviderModel.statusLabel}</span>}
          focused={focusedSettingsSection === "voice"}
          sectionRef={voiceSettingsRowRef}
        >
          {settingsRowVisible("voice", "voice.output") && (
          <SettingsRow
            label="Voice output"
            value={voiceProviderModel.statusLabel}
            description={`Voice uses final assistant messages only. Long replies ${
              state.settings.voice.longReply === "summarize" ? "will use a spoken summary" : state.settings.voice.longReply
            }.`}
          >
            <div className="panel-action-row">
              <button type="button" className="panel-button mini" onClick={() => void onLoadVoiceProviders("manual refresh")} disabled={voiceProvidersLoading}>
                {voiceProvidersLoading ? "Refreshing" : "Refresh providers"}
              </button>
              <button
                type="button"
                className="panel-button mini icon-panel-button"
                disabled={running}
                onClick={() => void startVoiceProviderOnboarding()}
                title={running ? "Wait for the current run to finish before starting Capability Builder." : "Create a voice provider with Capability Builder"}
              >
                <span className="plug-zap-plus-icon" aria-hidden="true">
                  <Plug size={13} />
                  <Zap size={9} />
                  <Plus size={8} />
                </span>
                Add provider
              </button>
            </div>
            <small>
              {voiceProviderModel.runtimeState.label}: {voiceProviderModel.runtimeState.detail}
            </small>
            <small>
              Provider cache: {voiceProvidersLoading ? "refreshing" : voiceProviderCacheStatus.error ? "last refresh failed" : "ready"} ·{" "}
              {voiceProviderCacheStatus.providerCount.toLocaleString()} {voiceProviderCacheStatus.providerCount === 1 ? "provider" : "providers"}
              {voiceProviderCacheStatus.lastCompletedAt ? ` · refreshed ${formatTimelineTime(voiceProviderCacheStatus.lastCompletedAt)}` : ""}
              {voiceProviderCacheStatus.lastTrigger ? ` · ${voiceProviderCacheStatus.lastTrigger}` : ""} · {voiceProviderLabelMode}.
            </small>
            {voiceProviderCacheStatus.lastCatalogRefresh && (
              <small>
                Voice catalog: {voiceProviderCacheStatus.lastCatalogRefresh.providerLabel} · {voiceProviderCacheStatus.lastCatalogRefresh.voiceCount.toLocaleString()} voices ·{" "}
                {formatTimelineTime(voiceProviderCacheStatus.lastCatalogRefresh.refreshedAt)} · {voiceProviderCacheStatus.lastCatalogRefresh.durationMs} ms.
              </small>
            )}
            {voiceProviderCacheStatus.error && <small className="error-text">Provider cache error: {voiceProviderCacheStatus.error}</small>}
          </SettingsRow>
          )}
          {settingsRowVisible("voice", "voice.catalog") && (
          <SettingsRow
            label="Known providers"
            value={`${voiceCatalogCards.length} catalog card${voiceCatalogCards.length === 1 ? "" : "s"}`}
            description="Launch an approval-gated provider setup chat from the same catalog source Pi sees."
          >
            <ProviderCatalogSettingsCards
              cards={voiceCatalogCards}
              catalogVersion={state.providerCatalog.catalogVersion}
              generatedAt={state.providerCatalog.generatedAt}
              running={running}
              onStart={(card) => void startProviderCatalogCardOnboarding(card)}
            />
          </SettingsRow>
          )}
          {settingsRowVisible("voice", "voice.provider") && (
          <SettingsRow
            label="Provider"
            value={selectedVoiceProvider?.label ?? (voiceProvidersLoading ? "Loading providers" : "None selected")}
            description="Choose the Ambient CLI TTS provider used for assistant voice."
          >
            <select
              className="automation-select"
              aria-label="Voice provider"
              value={state.settings.voice.providerCapabilityId ?? ""}
              disabled={voiceProvidersLoading}
              onChange={(event) => {
                const provider = voiceProviders.find((candidate) => candidate.capabilityId === event.target.value);
                const firstProviderSetup = Boolean(provider) && !state.settings.voice.providerCapabilityId;
                const preferredVoiceId = provider ? state.settings.voice.preferredVoicesByProvider?.[provider.capabilityId] : undefined;
                const nextVoiceId = provider ? preferredVoiceForProvider(provider, preferredVoiceId)?.id : undefined;
                onVoiceSettingsChange({
                  ...state.settings.voice,
                  enabled: Boolean(provider) && (state.settings.voice.enabled || firstProviderSetup),
                  autoplay: state.settings.voice.autoplay || firstProviderSetup,
                  providerCapabilityId: provider?.capabilityId,
                  voiceId: nextVoiceId,
                  format: provider?.format ?? state.settings.voice.format,
                });
              }}
            >
              <option value="">{voiceProvidersLoading ? "Loading providers..." : "No voice provider selected"}</option>
              {voiceProviders.map((provider) => (
                <option key={provider.providerId} value={provider.capabilityId} disabled={!provider.available}>
                  {provider.label}
                  {provider.available ? "" : " (unavailable)"}
                </option>
              ))}
            </select>
            {voiceProvidersError && <small className="error-text">{voiceProvidersError}</small>}
            {!voiceProvidersLoading && !voiceProviders.length && <small>No installed Ambient CLI TTS providers found. Add a provider to start the Capability Builder flow.</small>}
            {selectedVoiceProvider && voiceProviderModel.availabilityMessage && <small>{voiceProviderModel.availabilityMessage}</small>}
            {selectedVoiceProvider && voiceProviderModel.diagnostics && (
              <SettingsProviderDiagnosticsDisclosure
                title="Provider diagnostics"
                diagnostics={voiceProviderModel.diagnostics}
                onRetry={() => void onLoadVoiceProviders("retry health")}
                retryDisabled={voiceProvidersLoading}
              />
            )}
            {selectedVoiceProvider && (selectedVoiceProvider.voiceDiscovery || selectedVoiceCatalog || selectedVoiceCatalogRefresh?.message || selectedVoiceProvider.voiceCloning) && (
              <SettingsDisclosure
                title="Provider details"
                summary={
                  selectedVoiceCatalog
                    ? `${selectedVoiceCatalog.cacheStatus} · ${selectedVoiceCatalog.voiceCount.toLocaleString()} voices`
                    : selectedVoiceProvider.voiceDiscovery
                      ? "Dynamic catalog available"
                      : "Provider metadata"
                }
                defaultOpen={selectedVoiceCatalogRefresh?.status === "error"}
                tone={selectedVoiceCatalogRefresh?.status === "error" ? "error" : "neutral"}
              >
                {selectedVoiceProvider.voiceDiscovery && (
                  <div className="panel-action-row">
                    <button
                      type="button"
                      className="panel-button mini icon-panel-button"
                      onClick={() => onRefreshVoiceCatalog(selectedVoiceProvider.capabilityId)}
                      disabled={selectedVoiceCatalogRefresh?.status === "running"}
                      title={selectedVoiceProvider.voiceDiscovery.requiresNetwork ? "Refresh dynamic voices from the provider API" : "Refresh dynamic voices from this provider"}
                    >
                      <RefreshCw size={12} />
                      {selectedVoiceCatalogRefresh?.status === "running" ? "Refreshing voices" : "Refresh voices"}
                    </button>
                    <small>
                      Dynamic catalog: {selectedVoiceProvider.voiceDiscovery.source ?? "custom"}
                      {selectedVoiceProvider.voiceDiscovery.requiresNetwork ? " · network" : ""}
                      {selectedVoiceProvider.voiceDiscovery.cacheTtlSeconds ? ` · TTL ${selectedVoiceProvider.voiceDiscovery.cacheTtlSeconds}s` : ""}.
                    </small>
                  </div>
                )}
                {selectedVoiceCatalog && (
                  <small>
                    Voice catalog cache: {selectedVoiceCatalog.cacheStatus}
                    {selectedVoiceCatalog.refreshedAt ? ` · refreshed ${formatTimelineTime(selectedVoiceCatalog.refreshedAt)}` : ""}
                    {selectedVoiceCatalog.expiresAt ? ` · expires ${formatTimelineTime(selectedVoiceCatalog.expiresAt)}` : ""}
                    {selectedVoiceCatalog.source ? ` · ${selectedVoiceCatalog.source}` : ""}
                    {` · ${selectedVoiceCatalog.dynamicVoiceCount.toLocaleString()} cached / ${selectedVoiceCatalog.voiceCount.toLocaleString()} shown`}.
                  </small>
                )}
                {selectedVoiceCatalogRefresh?.message && (
                  <small className={selectedVoiceCatalogRefresh.status === "error" ? "error-text" : undefined}>{selectedVoiceCatalogRefresh.message}</small>
                )}
                {selectedVoiceProvider.voiceCloning && (
                  <small>
                    Voice cloning: {selectedVoiceProvider.voiceCloning.supported ? `${selectedVoiceProvider.voiceCloning.mode ?? "supported"} provider` : "not supported"}
                    {selectedVoiceProvider.voiceCloning.inputs?.audioFormats.length ? ` · audio ${selectedVoiceProvider.voiceCloning.inputs.audioFormats.join(", ")}` : ""}
                    {selectedVoiceProvider.voiceCloning.requiresConsent !== false ? " · consent required" : ""}
                    {selectedVoiceProvider.voiceCloning.requiresSecret?.length ? ` · secrets ${selectedVoiceProvider.voiceCloning.requiresSecret.join(", ")}` : ""}
                    {selectedVoiceProvider.voiceCloning.output?.creates.length ? ` · creates ${selectedVoiceProvider.voiceCloning.output.creates.join(", ")}` : ""}.
                  </small>
                )}
              </SettingsDisclosure>
            )}
          </SettingsRow>
          )}
          {selectedVoiceProvider && (
            <>
              {settingsRowVisible("voice", "voice.voice") && (
              <SettingsRow
                label="Voice"
                value={selectedVoice ? voiceOptionLabel(selectedVoice) : voiceProviderModel.selectedVoiceId || "Default voice"}
                description="Pick the provider voice used for spoken assistant replies."
              >
                {selectedVoiceOptions.length > 8 && (
                  <input
                    className="panel-input"
                    type="search"
                    aria-label="Search voices"
                    value={voiceSearchQuery}
                    onChange={(event) => setVoiceSearchQuery(event.target.value)}
                    placeholder={`Search ${selectedVoiceOptions.length.toLocaleString()} voices`}
                  />
                )}
                <select
                  className="automation-select"
                  aria-label="Voice"
                  value={voiceProviderModel.selectedVoiceId}
                  onChange={(event) => {
                    const voiceId = event.target.value;
                    onVoiceSettingsChange({
                      ...state.settings.voice,
                      voiceId,
                      preferredVoicesByProvider: selectedVoiceProvider
                        ? {
                            ...(state.settings.voice.preferredVoicesByProvider ?? {}),
                            [selectedVoiceProvider.capabilityId]: voiceId,
                          }
                        : state.settings.voice.preferredVoicesByProvider,
                    });
                  }}
                >
                  {displayedSelectedVoiceOptions.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voiceOptionLabel(voice)}
                    </option>
                  ))}
                </select>
                {selectedVoice && (
                  <small>
                    Selected voice source: {selectedVoice.source === "dynamic-cache" ? "cached dynamic catalog" : "declared fallback"}
                    {selectedVoice.locale ? ` · ${selectedVoice.locale}` : ""}
                    {selectedVoice.style?.length ? ` · ${selectedVoice.style.join(", ")}` : ""}.
                  </small>
                )}
                <small>
                  Provider default voice:{" "}
                  {selectedPreferredVoice
                    ? voiceOptionLabel(selectedPreferredVoice)
                    : selectedPreferredVoiceId
                      ? selectedPreferredVoiceId
                      : selectedVoice
                        ? voiceOptionLabel(selectedVoice)
                        : "not recorded yet"}
                  {selectedVoice && selectedPreferredVoiceId === selectedVoice.id ? " · current" : ""}.
                </small>
                {selectedVoiceSearch && filteredSelectedVoiceOptions.length === 0 && <small>No voices match "{voiceSearchQuery}".</small>}
              </SettingsRow>
              )}
              {settingsRowVisible("voice", "voice.format") && (
              <SettingsRow label="Format" value={voiceProviderModel.selectedFormat.toUpperCase()} description="Audio format requested from the selected provider.">
                <select
                  className="automation-select"
                  aria-label="Voice audio format"
                  value={voiceProviderModel.selectedFormat}
                  onChange={(event) => onVoiceSettingsChange({ ...state.settings.voice, format: event.target.value as DesktopState["settings"]["voice"]["format"] })}
                >
                  {selectedVoiceProvider.formats.map((format) => (
                    <option key={format} value={format}>
                      {format.toUpperCase()}
                    </option>
                  ))}
                </select>
              </SettingsRow>
              )}
            </>
          )}
          {settingsRowVisible("voice", "voice.playback") && (
          <SettingsRow
            label="Playback"
            value={`${voiceProviderModel.enabledChecked ? "Enabled" : "Disabled"} · ${voiceProviderModel.autoplayChecked ? "Autoplay" : "Manual play"}`}
            description="Control whether Ambient speaks final assistant messages and starts playback automatically."
          >
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={voiceProviderModel.enabledChecked}
                disabled={voiceProviderModel.enableDisabled}
                onChange={(event) => onVoiceSettingsChange({ ...state.settings.voice, enabled: event.target.checked })}
              />
              <span>Enable assistant voice</span>
            </label>
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={voiceProviderModel.autoplayChecked}
                disabled={voiceProviderModel.autoplayDisabled}
                onChange={(event) => onVoiceSettingsChange({ ...state.settings.voice, autoplay: event.target.checked })}
              />
              <span>Autoplay after provider setup</span>
            </label>
          </SettingsRow>
          )}
          {settingsRowVisible("voice", "voice.setup") && (
          <SettingsDisclosure
            title="Setup details"
            summary={`${voiceSetupHealth.length} health checks · ${voiceProviderCacheActivity.length} refresh events`}
            defaultOpen={voiceSetupHasIssue}
            tone={voiceSetupHasIssue ? "warning" : "neutral"}
          >
            <div className="voice-setup-health">
              <strong>Voice setup health</strong>
              {voiceSetupHealth.map((item) => (
                <small key={item.label} className={`voice-setup-health-item ${item.tone}`}>
                  {item.label}: {item.detail}
                </small>
              ))}
            </div>
            {voiceProviderCacheActivity.length > 0 && (
              <div className="voice-provider-cache-activity">
                <strong>Provider refresh activity</strong>
                {voiceProviderCacheActivity.map((activity) => (
                  <small key={activity.id}>
                    {formatTimelineTime(activity.at)} · {activity.trigger} · {activity.status === "error" ? "failed" : `${activity.availableCount}/${activity.providerCount} available`}
                    {activity.unavailableCount > 0 ? ` · ${activity.unavailableCount} unavailable` : ""}
                    {activity.error ? ` · ${activity.error}` : ""}
                    {activity.changes.length > 0 ? ` · ${activity.changes.join("; ")}` : ""}
                  </small>
                ))}
              </div>
            )}
            {voiceAuditRows.length > 0 && (
              <div className="voice-provider-cache-activity">
                <strong>Recent voice setting changes</strong>
                {voiceAuditRows.map((entry) => (
                  <small key={entry.id}>
                    {formatTimelineTime(entry.createdAt)} · {entry.sourceLabel} · {entry.summary} · {entry.detail}
                  </small>
                ))}
              </div>
            )}
          </SettingsDisclosure>
          )}
          {settingsRowVisible("voice", "voice.artifacts") && (
          <SettingsDisclosure
            title="Voice artifacts"
            summary={
              voiceArtifactRetention
                ? `${voiceArtifactRetention.managedFileCount.toLocaleString()} managed · ${voiceArtifactRetention.orphanedFileCount.toLocaleString()} orphaned`
                : `Cache limit ${state.settings.voice.artifactCacheMaxMb} MB`
            }
            defaultOpen={Boolean(voiceArtifactRetentionError)}
            tone={voiceArtifactRetentionError ? "error" : "neutral"}
          >
            <div className="voice-artifact-retention">
              <div className="voice-artifact-retention-header">
                <strong>Voice artifacts</strong>
                <div className="panel-action-row">
                  <button
                    type="button"
                    className="panel-button mini"
                    onClick={() => void loadVoiceArtifactRetention()}
                    disabled={voiceArtifactRetentionLoading || voiceArtifactPruning}
                  >
                    {voiceArtifactRetentionLoading ? "Refreshing" : "Refresh artifacts"}
                  </button>
                  <button
                    type="button"
                    className="panel-button mini danger"
                    onClick={() => void pruneVoiceArtifactRetention()}
                    disabled={
                      voiceArtifactRetentionLoading ||
                      voiceArtifactPruning ||
                      !voiceArtifactRetention ||
                      voiceArtifactRetention.orphanedFileCount === 0
                    }
                  >
                    {voiceArtifactPruning ? "Cleaning" : "Clean orphaned"}
                  </button>
                </div>
              </div>
              <label className="setting-field voice-artifact-cache-limit">
                <span>Cache limit</span>
                <input
                  className="panel-input"
                  type="number"
                  min={0}
                  max={1024}
                  step={1}
                  value={state.settings.voice.artifactCacheMaxMb}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    const artifactCacheMaxMb = Number.isFinite(parsed) ? Math.max(0, Math.min(Math.floor(parsed), 1024)) : 0;
                    onVoiceSettingsChange({ ...state.settings.voice, artifactCacheMaxMb });
                  }}
                />
                <small>Generated voice audio is cleared on startup and exit, and pruned when it exceeds this size.</small>
              </label>
              {voiceArtifactRetention ? (
                <>
                  <small>
                    Active thread: {voiceArtifactRetention.managedFileCount.toLocaleString()} managed files ·{" "}
                    {formatBytes(voiceArtifactRetention.managedBytes)} total.
                  </small>
                  <small>
                    Referenced by current provider: {voiceArtifactRetention.referencedFileCount.toLocaleString()} files ·{" "}
                    {formatBytes(voiceArtifactRetention.referencedBytes)}.
                  </small>
                  <small>
                    Orphaned: {voiceArtifactRetention.orphanedFileCount.toLocaleString()} files ·{" "}
                    {formatBytes(voiceArtifactRetention.orphanedBytes)}.
                  </small>
                  {voiceArtifactRetention.orphanedPreview.length > 0 && (
                    <ul>
                      {voiceArtifactRetention.orphanedPreview.slice(0, 5).map((path) => (
                        <li key={path}>{path}</li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <small>{voiceArtifactRetentionLoading ? "Scanning managed voice artifacts..." : "No voice artifact scan yet."}</small>
              )}
              {voiceArtifactRetentionError && <small className="error-text">{voiceArtifactRetentionError}</small>}
            </div>
          </SettingsDisclosure>
          )}
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

export function RightPanelSpeechSettingsSection({
  state,
  running,
  settingsRowVisible,
  sttProviderModel,
  sttProviders,
  sttProvidersLoading,
  sttProvidersError,
  sttProviderCacheStatus,
  sttProviderCacheActivity,
  sttProviderSetup,
  sttSetupModel,
  sttCatalogCards,
  selectedSttProvider,
  sttMicrophoneDevices,
  selectedSttMicrophoneId,
  selectedSttMicrophoneMissing,
  sttMicrophoneSettingsValue,
  sttMicrophoneDevicesLoading,
  sttMicrophoneDevicesError,
  sttMicTest,
  sttMicTestRecording,
  sttMicTestBusy,
  sttMicTestDisabled,
  sttShortcutDisplayLabel,
  sttShortcutCapture,
  setSttShortcutCapture,
  sttDiagnosticRows,
  speechDiagnosticsHasIssue,
  startProviderCatalogCardOnboarding,
  onLoadSttProviders,
  onSetupSttProvider,
  onSttSettingsChange,
  onLoadSttMicrophoneDevices,
  onStopSttMicTest,
  onCancelSttMicTest,
  onStartSttMicTest,
}: RightPanelSpeechSettingsSectionProps) {
  return (
        <SettingsSection
          id="speech"
          title="Speech Input"
          description="Configure push-to-talk, transcription provider setup, microphone validation, and speech behavior."
          badges={<span className="settings-section-badge">{sttProviderModel.statusLabel}</span>}
        >
          {settingsRowVisible("speech", "speech.input") && (
          <SettingsRow
            label="Speech input"
            value={sttProviderModel.statusLabel}
            description="Push-to-talk sends a completed transcript as the next visible user message."
          >
            <div className="panel-action-row">
              <button type="button" className="panel-button mini" onClick={() => void onLoadSttProviders("manual refresh")} disabled={sttProvidersLoading}>
                {sttProvidersLoading ? "Refreshing" : "Refresh providers"}
              </button>
              {sttProviderModel.setupActions.map((setupAction) => (
                <button
                  key={`${setupAction.action}:${setupAction.label}`}
                  type="button"
                  className="panel-button mini icon-panel-button"
                  onClick={() => onSetupSttProvider(setupAction.action)}
                  disabled={sttProviderSetup.status === "running"}
                  title={setupAction.title}
                >
                  {setupAction.icon === "install" ? <Package size={12} /> : setupAction.icon === "validate" ? <CheckCircle2 size={12} /> : <RefreshCw size={12} />}
                  {sttProviderSetup.status === "running" ? "Working" : setupAction.label}
                </button>
              ))}
            </div>
            <small>
              Provider cache: {sttProvidersLoading ? "refreshing" : sttProviderCacheStatus.error ? "last refresh failed" : "ready"} ·{" "}
              {sttProviderCacheStatus.providerCount.toLocaleString()} {sttProviderCacheStatus.providerCount === 1 ? "provider" : "providers"}
              {sttProviderCacheStatus.lastCompletedAt ? ` · refreshed ${formatTimelineTime(sttProviderCacheStatus.lastCompletedAt)}` : ""}
              {sttProviderCacheStatus.lastTrigger ? ` · ${sttProviderCacheStatus.lastTrigger}` : ""}.
            </small>
            {sttProvidersError && <small className="error-text">Provider cache error: {sttProvidersError}</small>}
            {sttProviderSetup.message && (
              <div className={`voice-provider-diagnostics ${sttProviderSetup.status === "error" ? "error" : sttSetupModel?.statusTone ?? "info"}`}>
                <strong>{sttSetupModel?.statusLabel ?? sttProviderSetup.message}</strong>
                {sttSetupModel?.detailLabels.map((label) => (
                  <small key={label}>{label}</small>
                ))}
                {sttProviderSetup.status === "error" && <small className="error-text">{sttProviderSetup.message}</small>}
              </div>
            )}
          </SettingsRow>
          )}
          {settingsRowVisible("speech", "speech.catalog") && (
          <SettingsRow
            label="Known providers"
            value={`${sttCatalogCards.length} catalog card${sttCatalogCards.length === 1 ? "" : "s"}`}
            description="Launch an approval-gated speech recognition setup chat from the same catalog source Pi sees."
          >
            <ProviderCatalogSettingsCards
              cards={sttCatalogCards}
              catalogVersion={state.providerCatalog.catalogVersion}
              generatedAt={state.providerCatalog.generatedAt}
              running={running}
              onStart={(card) => void startProviderCatalogCardOnboarding(card)}
            />
          </SettingsRow>
          )}
          {settingsRowVisible("speech", "speech.provider") && (
          <SettingsRow
            label="Provider"
            value={selectedSttProvider?.label ?? (sttProvidersLoading ? "Loading providers" : "None selected")}
            description="Choose the local STT provider used for push-to-talk transcription."
          >
            <select
              className="automation-select"
              aria-label="Speech provider"
              value={state.settings.stt.providerCapabilityId ?? ""}
              disabled={sttProvidersLoading}
              onChange={(event) => {
                const provider = sttProviders.find((candidate) => candidate.capabilityId === event.target.value);
                const firstProviderSetup = Boolean(provider?.available) && !state.settings.stt.providerCapabilityId;
                onSttSettingsChange({
                  ...state.settings.stt,
                  enabled: Boolean(provider?.available) && (state.settings.stt.enabled || firstProviderSetup),
                  providerCapabilityId: provider?.capabilityId,
                  spokenLanguage: provider?.defaultLanguage ?? state.settings.stt.spokenLanguage,
                });
              }}
            >
              <option value="">{sttProvidersLoading ? "Loading providers..." : "No speech provider selected"}</option>
              {sttProviders.map((provider) => (
                <option key={provider.providerId} value={provider.capabilityId} disabled={!provider.available}>
                  {provider.label}
                  {provider.available ? "" : " (setup needed)"}
                </option>
              ))}
            </select>
            {!sttProvidersLoading && !sttProviders.length && <small>No installed STT providers found. Install Qwen3-ASR to start setup.</small>}
            {selectedSttProvider && sttProviderModel.availabilityMessage && <small>{sttProviderModel.availabilityMessage}</small>}
            {selectedSttProvider && sttProviderModel.diagnostics && (
              <SettingsProviderDiagnosticsDisclosure
                title="Provider diagnostics"
                diagnostics={sttProviderModel.diagnostics}
                onRetry={() => void onLoadSttProviders("retry health")}
                retryDisabled={sttProvidersLoading}
              />
            )}
            {selectedSttProvider && sttProviderModel.validation && (
              <div className={`voice-provider-diagnostics ${sttProviderModel.validation.statusTone}`}>
                <strong>{sttProviderModel.validation.statusLabel}</strong>
                {sttProviderModel.validation.detailLabels.map((label) => (
                  <small key={label}>{label}</small>
                ))}
                {sttProviderModel.validation.errorLabel && <small className="error-text">Error: {sttProviderModel.validation.errorLabel}</small>}
                {sttProviderModel.validation.missingHints.length > 0 && (
                  <ul>
                    {sttProviderModel.validation.missingHints.map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </SettingsRow>
          )}
          {settingsRowVisible("speech", "speech.microphone") && (
          <SettingsRow
            label="Microphone"
            value={sttMicTestRecording ? "Recording" : sttMicTestBusy ? "Validating" : sttMicrophoneSettingsValue}
            description="Choose the input device used for push-to-talk and provider validation."
          >
            <label className="setting-field">
              <span>Input device</span>
              <select
                className="automation-select"
                aria-label="Speech input microphone"
                value={selectedSttMicrophoneId ?? ""}
                disabled={sttMicTestRecording || sttMicTestBusy}
                onChange={(event) => {
                  const deviceId = event.target.value;
                  const device = sttMicrophoneDevices.find((candidate) => candidate.deviceId === deviceId);
                  onSttSettingsChange({
                    ...state.settings.stt,
                    microphone: device ? { deviceId: device.deviceId, label: device.label } : {},
                  });
                }}
              >
                <option value="">System default</option>
                {selectedSttMicrophoneMissing && selectedSttMicrophoneId && (
                  <option value={selectedSttMicrophoneId}>
                    {state.settings.stt.microphone?.label ?? selectedSttMicrophoneId} (unavailable)
                  </option>
                )}
                {sttMicrophoneDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
              <small>Use a specific microphone when macOS default routing does not match the device you are speaking into.</small>
            </label>
            <div className="panel-action-row">
              <button
                type="button"
                className="panel-button mini icon-panel-button"
                onClick={() => onLoadSttMicrophoneDevices(true)}
                disabled={sttMicrophoneDevicesLoading || sttMicTestRecording || sttMicTestBusy}
              >
                <RefreshCw size={12} />
                {sttMicrophoneDevicesLoading ? "Refreshing" : "Grant/refresh microphones"}
              </button>
            </div>
            {sttMicrophoneDevicesError && <small className="error-text">Microphone list error: {sttMicrophoneDevicesError}</small>}
            {selectedSttMicrophoneMissing && (
              <small className="error-text">Selected microphone is not currently available; recording will fall back to the system default.</small>
            )}
            <div className="panel-action-row">
              {sttMicTestRecording ? (
                <>
                  <button type="button" className="panel-button mini icon-panel-button primary" onClick={onStopSttMicTest}>
                    <Square size={12} />
                    Stop and validate
                  </button>
                  <button type="button" className="panel-button mini" onClick={onCancelSttMicTest}>
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="panel-button mini icon-panel-button"
                  onClick={onStartSttMicTest}
                  disabled={sttMicTestDisabled}
                  title={
                    selectedSttProvider?.available
                      ? "Record a short microphone sample and validate it with Qwen3-ASR"
                      : "Install and select an available STT provider before testing the microphone"
                  }
                >
                  <Mic size={12} />
                  {sttMicTestBusy ? "Working" : "Record test sample"}
                </button>
              )}
            </div>
            <small>
              {sttMicTest.message ??
                (selectedSttProvider?.available
                  ? "Record a short phrase, then validate it through the selected speech provider."
                  : "Install and select Qwen3-ASR before recording a microphone validation sample.")}
            </small>
            {sttMicTest.level && sttMicTestRecording && (
              <small className="stt-strip-audio">
                <span className="stt-level-meter" aria-hidden="true">
                  <span style={{ width: `${Math.round(sttMicTest.level.level * 100)}%` }} />
                </span>
                {Math.round(sttMicTest.level.rmsDbfs)} dBFS
              </small>
            )}
            {sttMicTest.audio && (
              <small>
                Sample: {sttMicTest.audio.audioPath} · {(sttMicTest.audio.durationMs / 1000).toFixed(1)}s · {sttMicTest.audio.sampleRate.toLocaleString()} Hz ·{" "}
                {formatBytes(sttMicTest.audio.bytes)}
                {sttMicTest.audio.microphoneDeviceLabel ? ` · ${sttMicTest.audio.microphoneDeviceLabel}` : ""}
              </small>
            )}
          </SettingsRow>
          )}
          {settingsRowVisible("speech", "speech.language") && (
          <SettingsRow label="Spoken language" value={sttProviderModel.selectedLanguage} description="Language hint passed to the selected speech provider.">
            <select
              className="automation-select"
              aria-label="Spoken language"
              value={sttProviderModel.selectedLanguage}
              onChange={(event) => onSttSettingsChange({ ...state.settings.stt, spokenLanguage: event.target.value })}
            >
              {sttProviderModel.languageOptions.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </SettingsRow>
          )}
          {settingsRowVisible("speech", "speech.shortcut") && (
          <SettingsRow
            label="Push-to-talk shortcut"
            value={sttShortcutDisplayLabel}
            description={
              sttShortcutCapture
                ? "Press Space, a function key, or a modified shortcut such as Cmd/Ctrl + Shift + Space."
                : state.settings.stt.pushToTalkShortcut
                  ? "Hold this shortcut to start recording; release any shortcut key to transcribe."
                  : "Optional. Mouse push-to-talk works without a shortcut."
            }
          >
            <div className="panel-action-row" data-stt-shortcut-capture={sttShortcutCapture ? "true" : undefined}>
              <button type="button" className={`panel-button mini ${sttShortcutCapture ? "primary" : ""}`} onClick={() => setSttShortcutCapture(true)}>
                {sttShortcutCapture ? "Press keys..." : state.settings.stt.pushToTalkShortcut ? sttShortcutDisplayLabel : "Record shortcut"}
              </button>
              {state.settings.stt.pushToTalkShortcut && (
                <button
                  type="button"
                  className="panel-button mini"
                  onClick={() => {
                    const nextStt = { ...state.settings.stt };
                    delete nextStt.pushToTalkShortcut;
                    onSttSettingsChange(nextStt);
                  }}
                >
                  Clear
                </button>
              )}
              {sttShortcutCapture && (
                <button type="button" className="panel-button mini" onClick={() => setSttShortcutCapture(false)}>
                  Cancel
                </button>
              )}
            </div>
          </SettingsRow>
          )}
          {settingsRowVisible("speech", "speech.behavior") && (
          <SettingsRow
            label="Speech behavior"
            value={sttProviderModel.enabledChecked ? "Enabled" : "Disabled"}
            description="Controls whether push-to-talk can send transcripts through the selected provider."
          >
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={sttProviderModel.enabledChecked}
                disabled={sttProviderModel.enableDisabled}
                onChange={(event) => onSttSettingsChange({ ...state.settings.stt, enabled: event.target.checked })}
              />
              <span>Enable speech input</span>
            </label>
          </SettingsRow>
          )}
          {settingsRowVisible("speech", "speech.diagnostics") && (
          <SettingsDisclosure
            title="Speech diagnostics"
            summary={`${sttProviderCacheActivity.length} refresh events · ${sttDiagnosticRows.length} diagnostic rows`}
            defaultOpen={speechDiagnosticsHasIssue}
            tone={speechDiagnosticsHasIssue ? "warning" : "neutral"}
          >
            {sttProviderCacheActivity.length > 0 && (
              <div className="voice-provider-cache-activity">
                <strong>Speech provider refresh activity</strong>
                {sttProviderCacheActivity.map((activity) => (
                  <small key={activity.id}>
                    {formatTimelineTime(activity.at)} · {activity.trigger} · {activity.status === "error" ? "failed" : `${activity.availableCount}/${activity.providerCount} available`}
                    {activity.unavailableCount > 0 ? ` · ${activity.unavailableCount} unavailable` : ""}
                    {activity.error ? ` · ${activity.error}` : ""}
                    {activity.changes.length > 0 ? ` · ${activity.changes.join("; ")}` : ""}
                  </small>
                ))}
              </div>
            )}
            <div className="voice-provider-cache-activity">
              <strong>Speech diagnostics</strong>
              {sttDiagnosticRows.length > 0 ? (
                sttDiagnosticRows.map((diagnostic) => (
                  <div key={diagnostic.id} className={`voice-provider-diagnostics ${diagnostic.statusTone}`}>
                    <div className="voice-provider-diagnostics-header">
                      <strong>{diagnostic.title}</strong>
                      <small>{formatTimelineTime(diagnostic.createdLabel)}</small>
                    </div>
                    {diagnostic.detailLabels.map((label) => (
                      <small key={label}>{label}</small>
                    ))}
                  </div>
                ))
              ) : (
                <small>No local speech diagnostics yet.</small>
              )}
              <small>Diagnostics include timings, provider/runtime facts, no-speech gate results, and error categories only.</small>
            </div>
          </SettingsDisclosure>
          )}
          {settingsRowVisible("speech", "speech.advanced") && (
          <SettingsDisclosure
            title="Advanced recognition"
            summary={`Silence ${state.settings.stt.silenceFinalizeSeconds.toFixed(1)}s · RMS ${state.settings.stt.noSpeechGate.enabled ? state.settings.stt.noSpeechGate.rmsThresholdDbfs : "off"}`}
          >
            <label className="setting-field">
              <span>Silence before transcribe</span>
              <input
                className="panel-input"
                type="number"
                min="0.3"
                max="2.5"
                step="0.1"
                value={state.settings.stt.silenceFinalizeSeconds}
                onChange={(event) => {
                  const value = Number.parseFloat(event.target.value);
                  if (!Number.isFinite(value)) return;
                  onSttSettingsChange({ ...state.settings.stt, silenceFinalizeSeconds: Math.min(2.5, Math.max(0.3, value)) });
                }}
              />
              <small>{state.settings.stt.silenceFinalizeSeconds.toFixed(1)} seconds</small>
            </label>
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={state.settings.stt.autoSendAfterTranscription}
              onChange={(event) => onSttSettingsChange({ ...state.settings.stt, autoSendAfterTranscription: event.target.checked })}
            />
            <span>Auto-send transcript</span>
          </label>
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={state.settings.stt.noSpeechGate.enabled}
              onChange={(event) => onSttSettingsChange({ ...state.settings.stt, noSpeechGate: { ...state.settings.stt.noSpeechGate, enabled: event.target.checked } })}
            />
            <span>RMS no-speech gate</span>
          </label>
          <label className="setting-field">
            <span>RMS threshold</span>
            <input
              className="panel-input"
              type="number"
              min="-90"
              max="-20"
              step="1"
              value={state.settings.stt.noSpeechGate.rmsThresholdDbfs}
              onChange={(event) => {
                const value = Number.parseFloat(event.target.value);
                if (!Number.isFinite(value)) return;
                onSttSettingsChange({
                  ...state.settings.stt,
                  noSpeechGate: {
                    ...state.settings.stt.noSpeechGate,
                    rmsThresholdDbfs: Math.min(-20, Math.max(-90, value)),
                  },
                });
              }}
            />
            <small>{state.settings.stt.noSpeechGate.rmsThresholdDbfs} dBFS</small>
          </label>
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={state.settings.stt.bargeIn.stopTtsOnSpeech}
              onChange={(event) => onSttSettingsChange({ ...state.settings.stt, bargeIn: { ...state.settings.stt.bargeIn, stopTtsOnSpeech: event.target.checked } })}
            />
            <span>Stop TTS when speech starts</span>
          </label>
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={state.settings.stt.bargeIn.queueWhileAgentRuns}
              onChange={(event) => onSttSettingsChange({ ...state.settings.stt, bargeIn: { ...state.settings.stt.bargeIn, queueWhileAgentRuns: event.target.checked } })}
            />
            <span>Queue while agent runs</span>
          </label>
          </SettingsDisclosure>
          )}
        </SettingsSection>
  );
}
