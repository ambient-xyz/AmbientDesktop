import { ChevronDown, Monitor, Moon, Plug, Plus, RefreshCw, Sun, Zap } from "lucide-react";
import { useState } from "react";
import type { DesktopState, DesktopUpdateState, ThemePreference, ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { ContextUsageSnapshot } from "../../shared/threadTypes";
import type {
  ModelRuntimeCatalogRuntimeAction,
  ModelRuntimeCatalogRuntimeRow,
  ModelRuntimeCatalogSettingsModel,
} from "./modelRuntimeCatalogUiModel";
import {
  LocalModelsRuntimeInventory,
  ModelRuntimeCatalogProfileGroup,
  formatTimelineTime,
} from "./RightPanelSettingsRuntime";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";
import { SettingsRow, SettingsSection } from "./RightPanelSettingsPrimitives";

type SettingsRowVisible = (sectionId: string, rowId: string) => boolean;

export {
  RightPanelModelModeSettingsSection,
  agentMemoryModeLabel,
  agentMemoryStarterOperationForAction,
  agentMemoryStarterOperationLogPreview,
  agentMemoryStarterSetupAction,
  agentMemoryStarterSetupActionLabel,
} from "./RightPanelModelModeSettingsSection";
export type { RightPanelModelModeSettingsSectionProps } from "./RightPanelModelModeSettingsSection";
type MaybePromise<T = unknown> = T | Promise<T>;

export const thinkingDisplayOptions: ThinkingDisplayMode[] = ["off", "transient", "full"];

function secureStorageStatusForState(state: DesktopState): DesktopState["secureStorage"] {
  return state.secureStorage ?? {
    status: "blocked",
    platform: "other",
    reason: "unavailable",
    message: "Secure credential storage status has not loaded yet.",
  };
}

function secureStorageRepairForState(state: DesktopState): DesktopState["secureStorageRepair"] {
  return state.secureStorageRepair ?? {
    platform: secureStorageStatusForState(state).platform,
    summary: "Secure credential storage status has not loaded yet.",
    commands: [],
    retryLabel: "Retry secure storage check",
  };
}


export function desktopUpdateStatusText(update: DesktopUpdateState): string {
  if (update.status === "available") return "Ready to download";
  if (update.status === "downloading") return "Downloading";
  if (update.status === "downloaded") return "Ready to restart";
  if (update.status === "installing") return "Installing after restart";
  if (update.status === "error") return "Could not update";
  if (update.status === "checking") return "Checking";
  if (update.status === "not-available") return "Up to date";
  return update.disabledReason ?? "Updates are not active";
}

export function contextUsagePresentation(snapshot: ContextUsageSnapshot | undefined, settings: DesktopState["settings"]["compaction"]) {
  if (!snapshot) {
    return {
      tone: "unknown",
      label: "Context ?",
      percent: undefined,
      title: "Context usage has not been reported for this thread yet.",
    };
  }
  if (snapshot.source === "unknown-after-compaction") {
    return {
      tone: "unknown",
      label: "Context ?",
      percent: undefined,
      title: "Compaction completed. Ambient will know the refreshed context size after the next response.",
    };
  }
  if (snapshot.source === "unavailable" || snapshot.percent === undefined) {
    return {
      tone: "unknown",
      label: "Context ?",
      percent: undefined,
      title: snapshot.diagnostics?.message ?? "Context usage is not available for this thread.",
    };
  }
  const rounded = Math.max(0, Math.round(snapshot.percent));
  const tone = rounded >= settings.hardPreflightPercent ? "danger" : rounded >= settings.softWarningPercent ? "warning" : "ok";
  const tokens = snapshot.tokens !== undefined ? `${snapshot.tokens.toLocaleString()} tokens` : "token count unavailable";
  const contextWindow = snapshot.contextWindow !== undefined ? `${snapshot.contextWindow.toLocaleString()} window` : "window unavailable";
  return {
    tone,
    label: `Context ${rounded}%`,
    percent: snapshot.percent,
    title: `${tokens} of ${contextWindow}. Source: ${snapshot.source}. Compactions: ${snapshot.compactionCount}.`,
  };
}

function SegmentedTheme({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}) {
  return (
    <div className="permission-toggle theme-toggle">
      <button type="button" className={value === "system" ? "selected" : ""} onClick={() => onChange("system")}>
        <Monitor size={14} />
        System
      </button>
      <button type="button" className={value === "light" ? "selected" : ""} onClick={() => onChange("light")}>
        <Sun size={14} />
        Light
      </button>
      <button type="button" className={value === "dark" ? "selected" : ""} onClick={() => onChange("dark")}>
        <Moon size={14} />
        Dark
      </button>
    </div>
  );
}

function SecureStorageStatusCard({ state }: { state: DesktopState }) {
  const [refreshed, setRefreshed] = useState<{ status: DesktopState["secureStorage"]; guidance: DesktopState["secureStorageRepair"] } | undefined>();
  const [busy, setBusy] = useState(false);
  const current = refreshed?.status ?? secureStorageStatusForState(state);
  const repair = refreshed?.guidance ?? secureStorageRepairForState(state);
  const ready = current.status === "ready";
  async function refresh() {
    setBusy(true);
    try {
      const next = await window.ambientDesktop.refreshSecureStorageStatus();
      setRefreshed(next);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`voice-provider-diagnostics ${ready ? "success" : "warning"}`}>
      <div className="voice-provider-diagnostics-header">
        <strong>{ready ? "Secure storage ready" : "Secure storage blocked"}</strong>
        <span>{current.platform}</span>
      </div>
      <small>{current.message}</small>
      <ul>
        <li>Backend: {current.status === "ready" ? current.backend : current.backend ?? current.reason}</li>
        <li>Security: {current.status === "ready" ? current.security : "blocked"}</li>
      </ul>
      {!ready && repair.commands.length > 0 && (
        <details className="settings-disclosure warning">
          <summary>
            <span className="settings-disclosure-title">
              <ChevronDown size={14} />
              <strong>Linux repair options</strong>
            </span>
            <small>{repair.commands.length.toLocaleString()}</small>
          </summary>
          <div className="settings-disclosure-body">
            {repair.commands.map((command) => (
              <label className="setting-field" key={command.id}>
                <span>{command.label}</span>
                <code>{command.command}</code>
                <small>{command.description}</small>
              </label>
            ))}
          </div>
        </details>
      )}
      <button type="button" className="panel-button mini" disabled={busy} onClick={() => void refresh()}>
        <RefreshCw size={14} />
        {busy ? "Checking" : repair.retryLabel}
      </button>
    </div>
  );
}

export type RightPanelOverviewSettingsSectionProps = {
  state: DesktopState;
  running: boolean;
  settingsRowVisible: SettingsRowVisible;
  updateBusy: boolean;
  firstRunCapabilityOnboardingDismissed: boolean;
  firstRunCapabilityOnboardingStarting: boolean;
  onCheckUpdates: () => void;
  onThemePreferenceChange: (themePreference: ThemePreference) => MaybePromise;
  startFirstRunCapabilityOnboarding: () => MaybePromise;
  dismissFirstRunCapabilityOnboarding: () => void;
  startRemoteSurfaceActivation: (provider: "telegram" | "signal") => MaybePromise;
};

export function RightPanelOverviewSettingsSection({
  state,
  running,
  settingsRowVisible,
  updateBusy,
  firstRunCapabilityOnboardingDismissed,
  firstRunCapabilityOnboardingStarting,
  onCheckUpdates,
  onThemePreferenceChange,
  startFirstRunCapabilityOnboarding,
  dismissFirstRunCapabilityOnboarding,
  startRemoteSurfaceActivation,
}: RightPanelOverviewSettingsSectionProps) {
  const secureStorage = secureStorageStatusForState(state);
  const secureStorageRepair = secureStorageRepairForState(state);
  return (
    <SettingsSection
      id="overview"
      title="Overview"
      description="Workspace identity, app version, updates, and appearance."
    >
      {settingsRowVisible("overview", "overview.workspace") && <SettingsRow label="Workspace" value={state.workspace.name} />}
      {settingsRowVisible("overview", "overview.app") && (
        <SettingsRow label="App" value={state.app.name}>
          <small>
            {state.app.version} · {state.app.isPackaged ? "Packaged" : "Development"} · {state.app.platform}/{state.app.arch}
          </small>
          <small>
            Pi {state.app.piVersions.piCodingAgent} · pi-ai {state.app.piVersions.piAi}
            {state.app.build?.commit ? ` · ${state.app.build.commit}` : ""}
          </small>
        </SettingsRow>
      )}
      {settingsRowVisible("overview", "overview.secure-storage") && (
        <SettingsRow
          label="Secure storage"
          value={secureStorage.status === "ready" ? "Ready" : "Blocked"}
          description={secureStorage.status === "ready" ? secureStorage.message : secureStorageRepair.summary}
        >
          <SecureStorageStatusCard state={state} />
        </SettingsRow>
      )}
      {settingsRowVisible("overview", "overview.updates") && (
        <SettingsRow label="Updates" value={desktopUpdateStatusText(state.app.update)}>
          <small>
            {state.app.update.enabled
              ? `${state.app.update.channel} · ${state.app.update.feedUrl ?? "no feed"}`
              : state.app.update.disabledReason ?? "Disabled"}
          </small>
          <button type="button" className="panel-button mini" onClick={onCheckUpdates} disabled={!state.app.update.canCheck || updateBusy}>
            Check for updates
          </button>
        </SettingsRow>
      )}
      {settingsRowVisible("overview", "overview.appearance") && (
        <SettingsRow label="Appearance">
          <SegmentedTheme value={state.appearance.themePreference} onChange={(themePreference) => void onThemePreferenceChange(themePreference)} />
        </SettingsRow>
      )}
      {settingsRowVisible("overview", "overview.core-setup") && (
        <SettingsRow
          label="Core setup"
          value={firstRunCapabilityOnboardingDismissed ? "Skipped" : "Available"}
          description="Start a skippable chat-first setup for voice, speech input, search/web, and remote access using typed product entrypoints."
        >
          <div className="panel-action-row">
            <button
              type="button"
              className="panel-button mini icon-panel-button"
              disabled={running || firstRunCapabilityOnboardingStarting}
              onClick={() => void startFirstRunCapabilityOnboarding()}
              title={running ? "Wait for the current run to finish before starting setup." : "Start catalog-backed setup in chat"}
            >
              <span className="plug-zap-plus-icon" aria-hidden="true">
                <Plug size={12} />
                <Zap size={8} />
                <Plus size={7} />
              </span>
              {firstRunCapabilityOnboardingStarting ? "Starting" : firstRunCapabilityOnboardingDismissed ? "Resume setup" : "Start setup"}
            </button>
            {!firstRunCapabilityOnboardingDismissed && (
              <button type="button" className="panel-button mini" onClick={dismissFirstRunCapabilityOnboarding}>
                Skip for now
              </button>
            )}
          </div>
          <small>
            Catalog {state.providerCatalog.catalogVersion} · {state.providerCatalog.cards.length.toLocaleString()} known provider cards · generated{" "}
            {formatTimelineTime(state.providerCatalog.generatedAt)}.
          </small>
        </SettingsRow>
      )}
      {settingsRowVisible("overview", "overview.remote-control") && (
        <SettingsRow
          label="Remote control"
          value="Telegram reviewed"
          description="Use a messaging service as an owner-authenticated control surface for Ambient Desktop. This stays separate from Messaging Connector chat-with-others."
        >
          <div className="panel-action-row">
            <button
              type="button"
              className="panel-button mini icon-panel-button"
              disabled={running}
              onClick={() => void startRemoteSurfaceActivation("telegram")}
              title={running ? "Wait for the current run to finish before starting remote-control setup." : "Start reviewed Telegram Remote Ambient Surface setup in chat"}
            >
              <Plug size={12} />
              Set up Telegram
            </button>
            <button
              type="button"
              className="panel-button mini"
              disabled={running}
              onClick={() => void startRemoteSurfaceActivation("signal")}
              title={running ? "Wait for the current run to finish before checking Signal support." : "Check Signal through the Remote Ambient Surface product shortcut"}
            >
              Check Signal
            </button>
          </div>
          <div className="voice-provider-diagnostics warning">
            <strong>Signal is not a reviewed Remote Ambient Surface activation route yet</strong>
            <small>
              The Signal entrypoint asks Ambient for the unsupported-provider repair card. It must not use Signal Desktop, signal-cli, shell, browser automation, provider CLIs, provider message reads, provider sends, or generic Messaging Connector setup.
            </small>
          </div>
        </SettingsRow>
      )}
    </SettingsSection>
  );
}

export type RightPanelLocalModelsSettingsSectionProps = {
  settingsRowVisible: SettingsRowVisible;
  modelCatalogSettings: ModelRuntimeCatalogSettingsModel;
  subagentsEffectiveEnabled: boolean;
  localRuntimeLifecycleBusyId?: string;
  localRuntimeLifecycleStatus?: ApiKeyStatus;
  runLocalRuntimeLifecycleActionFromSettings: (
    row: ModelRuntimeCatalogRuntimeRow,
    action: ModelRuntimeCatalogRuntimeAction,
  ) => MaybePromise;
};

export function RightPanelLocalModelsSettingsSection({
  settingsRowVisible,
  modelCatalogSettings,
  subagentsEffectiveEnabled,
  localRuntimeLifecycleBusyId,
  localRuntimeLifecycleStatus,
  runLocalRuntimeLifecycleActionFromSettings,
}: RightPanelLocalModelsSettingsSectionProps) {
  return (
    <SettingsSection
      id="local-models"
      title="Local Models"
      description="Local model registry state, live runtime inventory, ownership, and memory evidence."
      badges={<span className="settings-section-badge">{modelCatalogSettings.localModelsSummary}</span>}
    >
      {settingsRowVisible("local-models", "local-models.registry") && (
        <SettingsRow
          label="Registry profiles"
          value={modelCatalogSettings.localModelsStatusLabel}
          description="Installed, configured, and enabled local profiles from the runtime catalog."
        >
          <ModelRuntimeCatalogProfileGroup
            title="Local profiles"
            rows={modelCatalogSettings.localProfileRows}
            emptyLabel="No local model profiles are registered."
          />
        </SettingsRow>
      )}
      {settingsRowVisible("local-models", "local-models.runtime-inventory") && (
        <SettingsRow
          label="Runtime inventory"
          value={modelCatalogSettings.localRuntimeSummary}
          description="Running state, active owners, memory evidence, and stop blockers from the shared local runtime inventory."
        >
          <LocalModelsRuntimeInventory
            model={modelCatalogSettings}
            subagentsEnabled={subagentsEffectiveEnabled}
            busyActionId={localRuntimeLifecycleBusyId}
            onRunLifecycleAction={(row, action) => void runLocalRuntimeLifecycleActionFromSettings(row, action)}
          />
          {localRuntimeLifecycleStatus && (
            <div className={`voice-provider-diagnostics ${localRuntimeLifecycleStatus.kind}`}>
              <strong>{localRuntimeLifecycleStatus.message}</strong>
            </div>
          )}
        </SettingsRow>
      )}
    </SettingsSection>
  );
}
