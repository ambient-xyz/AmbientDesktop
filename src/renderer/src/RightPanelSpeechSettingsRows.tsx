import { CheckCircle2, Mic, Package, RefreshCw, Square } from "lucide-react";

import {
  ProviderCatalogSettingsCards,
  SettingsDisclosure,
  SettingsProviderDiagnosticsDisclosure,
  formatBytes,
  formatTimelineTime,
} from "./RightPanelSettingsRuntime";
import { SettingsRow } from "./RightPanelSettingsPrimitives";
import type { RightPanelSpeechSettingsSectionProps } from "./RightPanelSettingsVoiceSpeech";

type SpeechSettingsRowsProps = RightPanelSpeechSettingsSectionProps;

export function RightPanelSpeechSettingsRows(props: SpeechSettingsRowsProps) {
  return (
    <>
      <RightPanelSpeechProviderRows {...props} />
      <RightPanelSpeechMicrophoneRows {...props} />
      <RightPanelSpeechBehaviorRows {...props} />
      <RightPanelSpeechDiagnosticsRows {...props} />
      <RightPanelSpeechAdvancedRows {...props} />
    </>
  );
}

function RightPanelSpeechProviderRows({
  state,
  running,
  settingsRowVisible,
  sttProviderModel,
  sttProviders,
  sttProvidersLoading,
  sttProvidersError,
  sttProviderCacheStatus,
  sttProviderSetup,
  sttSetupModel,
  sttCatalogCards,
  selectedSttProvider,
  startProviderCatalogCardOnboarding,
  onLoadSttProviders,
  onSetupSttProvider,
  onSttSettingsChange,
}: SpeechSettingsRowsProps) {
  return (
    <>
      {settingsRowVisible("speech", "speech.input") && (
        <SettingsRow
          label="Speech input"
          value={sttProviderModel.statusLabel}
          description="Push-to-talk sends a completed transcript as the next visible user message."
        >
          <div className="panel-action-row">
            <button
              type="button"
              className="panel-button mini"
              onClick={() => void onLoadSttProviders("manual refresh")}
              disabled={sttProvidersLoading}
            >
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
                {setupAction.icon === "install" ? (
                  <Package size={12} />
                ) : setupAction.icon === "validate" ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <RefreshCw size={12} />
                )}
                {sttProviderSetup.status === "running" ? "Working" : setupAction.label}
              </button>
            ))}
          </div>
          <small>
            Provider cache: {sttProvidersLoading ? "refreshing" : sttProviderCacheStatus.error ? "last refresh failed" : "ready"}{" "}
            · {sttProviderCacheStatus.providerCount.toLocaleString()}{" "}
            {sttProviderCacheStatus.providerCount === 1 ? "provider" : "providers"}
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
    </>
  );
}

function RightPanelSpeechMicrophoneRows({
  state,
  settingsRowVisible,
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
  onSttSettingsChange,
  onLoadSttMicrophoneDevices,
  onStopSttMicTest,
  onCancelSttMicTest,
  onStartSttMicTest,
}: SpeechSettingsRowsProps) {
  if (!settingsRowVisible("speech", "speech.microphone")) return null;

  return (
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
            <option value={selectedSttMicrophoneId}>{state.settings.stt.microphone?.label ?? selectedSttMicrophoneId} (unavailable)</option>
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
          Sample: {sttMicTest.audio.audioPath} · {(sttMicTest.audio.durationMs / 1000).toFixed(1)}s ·{" "}
          {sttMicTest.audio.sampleRate.toLocaleString()} Hz · {formatBytes(sttMicTest.audio.bytes)}
          {sttMicTest.audio.microphoneDeviceLabel ? ` · ${sttMicTest.audio.microphoneDeviceLabel}` : ""}
        </small>
      )}
    </SettingsRow>
  );
}

function RightPanelSpeechBehaviorRows({
  state,
  settingsRowVisible,
  sttProviderModel,
  sttShortcutDisplayLabel,
  sttShortcutCapture,
  setSttShortcutCapture,
  onSttSettingsChange,
}: SpeechSettingsRowsProps) {
  return (
    <>
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
    </>
  );
}

function RightPanelSpeechDiagnosticsRows({
  settingsRowVisible,
  sttProviderCacheActivity,
  sttDiagnosticRows,
  speechDiagnosticsHasIssue,
}: SpeechSettingsRowsProps) {
  if (!settingsRowVisible("speech", "speech.diagnostics")) return null;

  return (
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
              {formatTimelineTime(activity.at)} · {activity.trigger} ·{" "}
              {activity.status === "error" ? "failed" : `${activity.availableCount}/${activity.providerCount} available`}
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
  );
}

function RightPanelSpeechAdvancedRows({ state, settingsRowVisible, onSttSettingsChange }: SpeechSettingsRowsProps) {
  if (!settingsRowVisible("speech", "speech.advanced")) return null;

  return (
    <SettingsDisclosure
      title="Advanced recognition"
      summary={`Silence ${state.settings.stt.silenceFinalizeSeconds.toFixed(1)}s · RMS ${
        state.settings.stt.noSpeechGate.enabled ? state.settings.stt.noSpeechGate.rmsThresholdDbfs : "off"
      }`}
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
          onChange={(event) =>
            onSttSettingsChange({ ...state.settings.stt, noSpeechGate: { ...state.settings.stt.noSpeechGate, enabled: event.target.checked } })
          }
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
          onChange={(event) =>
            onSttSettingsChange({ ...state.settings.stt, bargeIn: { ...state.settings.stt.bargeIn, stopTtsOnSpeech: event.target.checked } })
          }
        />
        <span>Stop TTS when speech starts</span>
      </label>
      <label className="setting-toggle">
        <input
          type="checkbox"
          checked={state.settings.stt.bargeIn.queueWhileAgentRuns}
          onChange={(event) =>
            onSttSettingsChange({ ...state.settings.stt, bargeIn: { ...state.settings.stt.bargeIn, queueWhileAgentRuns: event.target.checked } })
          }
        />
        <span>Queue while agent runs</span>
      </label>
    </SettingsDisclosure>
  );
}
