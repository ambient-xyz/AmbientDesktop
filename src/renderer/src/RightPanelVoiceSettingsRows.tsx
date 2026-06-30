import { Plug, Plus, RefreshCw, Zap } from "lucide-react";
import type { DesktopState } from "../../shared/desktopTypes";

import {
  ProviderCatalogSettingsCards,
  SettingsDisclosure,
  SettingsProviderDiagnosticsDisclosure,
  formatBytes,
  formatTimelineTime,
} from "./RightPanelSettingsRuntime";
import { SettingsRow } from "./RightPanelSettingsPrimitives";
import { preferredVoiceForProvider, voiceOptionLabel } from "./RightPanelDetailPanels";
import type { RightPanelVoiceSettingsSectionProps } from "./RightPanelSettingsVoiceSpeechTypes";

type VoiceSettingsRowsProps = RightPanelVoiceSettingsSectionProps;

export function RightPanelVoiceSettingsRows(props: VoiceSettingsRowsProps) {
  return (
    <>
      <RightPanelVoiceProviderRows {...props} />
      <RightPanelVoiceSelectionRows {...props} />
      <RightPanelVoicePlaybackRows {...props} />
      <RightPanelVoiceSetupRows {...props} />
      <RightPanelVoiceArtifactRows {...props} />
    </>
  );
}

function RightPanelVoiceProviderRows(props: VoiceSettingsRowsProps) {
  const {
    state,
    running,
    settingsRowVisible,
    voiceProviderModel,
    voiceProviders,
    voiceProvidersLoading,
    voiceProvidersError,
    voiceProviderCacheStatus,
    voiceProviderLabelMode,
    selectedVoiceProvider,
    voiceCatalogCards,
    startProviderCatalogCardOnboarding,
    onLoadVoiceProviders,
    startVoiceProviderOnboarding,
    onVoiceSettingsChange,
  } = props;

  return (
    <>
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
              Voice catalog: {voiceProviderCacheStatus.lastCatalogRefresh.providerLabel} ·{" "}
              {voiceProviderCacheStatus.lastCatalogRefresh.voiceCount.toLocaleString()} voices ·{" "}
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
          <RightPanelVoiceProviderDetailsDisclosure {...props} />
        </SettingsRow>
      )}
    </>
  );
}

function RightPanelVoiceProviderDetailsDisclosure({
  selectedVoiceProvider,
  selectedVoiceCatalog,
  selectedVoiceCatalogRefresh,
  onRefreshVoiceCatalog,
}: VoiceSettingsRowsProps) {
  if (!selectedVoiceProvider || (!selectedVoiceProvider.voiceDiscovery && !selectedVoiceCatalog && !selectedVoiceCatalogRefresh?.message && !selectedVoiceProvider.voiceCloning)) {
    return null;
  }

  return (
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
  );
}

function RightPanelVoiceSelectionRows({
  state,
  settingsRowVisible,
  voiceProviderModel,
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
  onVoiceSettingsChange,
}: VoiceSettingsRowsProps) {
  if (!selectedVoiceProvider) return null;

  return (
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
  );
}

function RightPanelVoicePlaybackRows({
  state,
  settingsRowVisible,
  voiceProviderModel,
  onVoiceSettingsChange,
}: VoiceSettingsRowsProps) {
  if (!settingsRowVisible("voice", "voice.playback")) return null;

  return (
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
  );
}

function RightPanelVoiceSetupRows({
  settingsRowVisible,
  voiceSetupHealth,
  voiceSetupHasIssue,
  voiceProviderCacheActivity,
  voiceAuditRows,
}: VoiceSettingsRowsProps) {
  if (!settingsRowVisible("voice", "voice.setup")) return null;

  return (
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
  );
}

function RightPanelVoiceArtifactRows({
  state,
  settingsRowVisible,
  voiceArtifactRetention,
  voiceArtifactRetentionLoading,
  voiceArtifactRetentionError,
  voiceArtifactPruning,
  loadVoiceArtifactRetention,
  pruneVoiceArtifactRetention,
  onVoiceSettingsChange,
}: VoiceSettingsRowsProps) {
  if (!settingsRowVisible("voice", "voice.artifacts")) return null;

  return (
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
  );
}
