import { Activity, Brain, ChevronDown, Monitor, Moon, Play, Plug, Plus, RefreshCw, RotateCw, Square, Sun, Wrench, Zap } from "lucide-react";
import type { ReactNode } from "react";
import type { AgentMemoryEmbeddingLifecycleActionKind, AgentMemoryEmbeddingLifecycleActionResult, AgentMemoryOperationStatus, AgentMemoryStorageDiagnostics } from "../../shared/agentMemoryDiagnostics";
import type { AgentMemoryStarterNextAction, AgentMemoryStarterOperationKind, AgentMemoryStarterOperationResult, AgentMemoryStarterStatus } from "../../shared/agentMemoryStarter";
import type { DesktopState, DesktopUpdateState, ThemePreference, ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { ContextUsageSnapshot } from "../../shared/threadTypes";
import { ambientModelLabel } from "../../shared/ambientModels";
import type {
  ModelRuntimeCatalogRuntimeAction,
  ModelRuntimeCatalogRuntimeRow,
  ModelRuntimeCatalogSettingsModel,
} from "./modelRuntimeCatalogUiModel";
import type {
  ModelProviderCredentialSaveDraftModel,
  ModelProviderEndpointInstallDraft,
} from "./modelProviderOnboardingUiModel";
import { AGENT_MEMORY_PRIVACY_DISCLOSURE_LINES } from "../../shared/agentMemoryPrivacy";
import { thinkingDisplayModeLabel } from "./thinkingDisplayUiModel";
import {
  LocalModelsRuntimeInventory,
  MODEL_RUNTIME_PROVIDER_TIMEOUT_OPTIONS_MS,
  ModelRuntimeCatalogDiagnostics,
  ModelRuntimeCatalogProfileGroup,
  SubagentMaturityDiagnostics,
  formatMemoryBytes,
  formatDurationMs,
  formatTimelineTime,
} from "./RightPanelSettingsRuntime";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";
import { SettingsRow, SettingsSection } from "./RightPanelSettingsPrimitives";

type SettingsRowVisible = (sectionId: string, rowId: string) => boolean;
type MaybePromise<T = unknown> = T | Promise<T>;
const AGENT_MEMORY_SETUP_ACTIONS: AgentMemoryStarterNextAction[] = ["enable", "repair", "install", "start", "retry_preflight"];

export const thinkingDisplayOptions: ThinkingDisplayMode[] = ["off", "transient", "full"];

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

function SegmentedThinkingDisplay({
  value,
  onChange,
}: {
  value: ThinkingDisplayMode;
  onChange: (value: ThinkingDisplayMode) => void;
}) {
  return (
    <div className="permission-toggle thinking-display-toggle">
      {thinkingDisplayOptions.map((option) => (
        <button type="button" key={option} className={value === option ? "selected" : ""} onClick={() => onChange(option)}>
          <Brain size={14} />
          {thinkingDisplayModeLabel(option)}
        </button>
      ))}
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

export type RightPanelModelModeSettingsSectionProps = {
  state: DesktopState;
  settingsRowVisible: SettingsRowVisible;
  modelCatalogSettings: ModelRuntimeCatalogSettingsModel;
  modelProviderInstallDraft: ModelProviderEndpointInstallDraft;
  modelProviderCredentialValue: string;
  modelProviderCredentialSave: ModelProviderCredentialSaveDraftModel;
  modelProviderCredentialBusy: boolean;
  modelProviderCredentialStatus?: ApiKeyStatus;
  modelProviderInstallBusy: boolean;
  modelProviderInstallStatus?: ApiKeyStatus;
  subagentsFlagValue: string;
  subagentsFlagDescription: string;
  persistentSubagentsEnabled: boolean;
  slashCommandsFlagValue: string;
  slashCommandsFlagDescription: string;
  persistentSlashCommandsEnabled: boolean;
  memoryFlagValue: string;
  memoryFlagDescription: string;
  persistentMemoryFeatureEnabled: boolean;
  activeThreadMemoryEnabled: boolean;
  activeThreadMemoryToggleDisabled: boolean;
  agentMemoryDiagnostics?: AgentMemoryStorageDiagnostics;
  agentMemoryDiagnosticsLoading: boolean;
  agentMemoryDiagnosticsError?: string;
  agentMemoryEmbeddingActionLoading?: AgentMemoryEmbeddingLifecycleActionKind;
  agentMemoryEmbeddingActionResult?: AgentMemoryEmbeddingLifecycleActionResult;
  agentMemoryEmbeddingActionError?: string;
  agentMemoryStarterStatus?: AgentMemoryStarterStatus;
  agentMemoryStarterLoading: boolean;
  agentMemoryStarterError?: string;
  agentMemoryStarterOperationLoading?: AgentMemoryStarterOperationKind;
  agentMemoryStarterOperationResult?: AgentMemoryStarterOperationResult;
  subagentMaturity: DesktopState["subagentMaturity"];
  subagentMaturityEvidence: DesktopState["subagentMaturityEvidence"];
  setModelProviderInstallDraft: (draft: ModelProviderEndpointInstallDraft) => void;
  setModelProviderCredentialValue: (value: string) => void;
  saveModelProviderCredentialFromSettings: () => MaybePromise;
  installModelProviderEndpointFromSettings: () => MaybePromise;
  loadAgentMemoryStarterStatus: () => MaybePromise;
  enableAgentMemoryStarterFromSettings: () => MaybePromise;
  repairAgentMemoryStarterFromSettings: () => MaybePromise;
  disableAgentMemoryStarterFromSettings: () => MaybePromise;
  onThinkingDisplaySettingsChange: (thinkingDisplay: DesktopState["settings"]["thinkingDisplay"]) => void;
  onFeatureFlagSettingsChange: (featureFlags: DesktopState["settings"]["featureFlags"]) => void;
  onMemorySettingsChange: (memory: DesktopState["settings"]["memory"]) => void;
  onActiveThreadMemoryEnabledChange: (enabled: boolean) => void;
  onRefreshAgentMemoryDiagnostics: () => void;
  onRunAgentMemoryEmbeddingLifecycleAction: (action: AgentMemoryEmbeddingLifecycleActionKind) => void;
  onClearAgentMemory: () => void;
  onModelRuntimeSettingsChange: (modelRuntime: DesktopState["settings"]["modelRuntime"]) => void;
  onPlannerSettingsChange: (planner: DesktopState["settings"]["planner"]) => void;
};

function AgentMemoryDiagnosticsSummary({ diagnostics }: { diagnostics: AgentMemoryStorageDiagnostics }) {
  const latestRecall = latestAgentMemoryOperation(diagnostics, "lastRecall");
  const latestCapture = latestAgentMemoryOperation(diagnostics, "lastCapture");
  const latestSearch = latestAgentMemoryOperation(diagnostics, "lastSearch");
  const native = diagnostics.nativePreflight;
  const tone = diagnostics.status === "healthy"
    ? "success"
    : diagnostics.status === "error"
      ? "error"
      : diagnostics.status === "needs_attention"
        ? "warning"
        : "info";
  return (
    <div className={`voice-provider-diagnostics ${tone}`}>
      <div className="voice-provider-diagnostics-header">
        <strong>{agentMemoryStatusLabel(diagnostics.status)}</strong>
        <span>{formatTimelineTime(diagnostics.checkedAt)}</span>
      </div>
      <small>{diagnostics.message}</small>
      <ul>
        <li>Storage: {diagnostics.dataDirExists ? `${diagnostics.fileCount.toLocaleString()} files, ${formatMemoryBytes(diagnostics.totalBytes)}` : "not created"} · {diagnostics.dataDir}</li>
        <li>Storage schema: {diagnostics.storageSchemaStatus}{diagnostics.storageSchemaVersion ? ` · ${diagnostics.storageSchemaVersion}` : ""}</li>
        <li>Threads: {diagnostics.activeThreadCount.toLocaleString()} active, {diagnostics.threadEnabledCount.toLocaleString()} enabled by thread toggle</li>
        <li>Settings: feature {diagnostics.featureEnabled ? "on" : "off"}, global {diagnostics.settingsEnabled ? "on" : "off"}, new-thread default {diagnostics.defaultThreadEnabled ? "on" : "off"}</li>
        <li>Embeddings: {diagnostics.embedding.status}{diagnostics.embedding.modelId ? ` · ${diagnostics.embedding.modelId}` : ""}{diagnostics.embedding.modelProfileId ? ` · ${diagnostics.embedding.modelProfileId}` : ""}{diagnostics.embedding.dimensions ? ` · ${diagnostics.embedding.dimensions} dims` : ""}</li>
        <li>Runtime snapshots: {diagnostics.runtimeSnapshots.length.toLocaleString()} · recall {operationStatusLabel(latestRecall)} · capture {operationStatusLabel(latestCapture)} · search {operationStatusLabel(latestSearch)}</li>
        <li>Native preflight: {native ? `${native.status} · ${native.message}` : "not checked"}</li>
        <li>Raw memory content: {diagnostics.rawContentIncluded ? "included" : "not included"}</li>
      </ul>
    </div>
  );
}

function AgentMemoryStarterCard({
  status,
  loading,
  error,
  operationLoading,
  operationResult,
  fallbackEnabled,
  disabled,
  onRefresh,
  onEnable,
  onRepair,
  onDisable,
}: {
  status?: AgentMemoryStarterStatus;
  loading: boolean;
  error?: string;
  operationLoading?: AgentMemoryStarterOperationKind;
  operationResult?: AgentMemoryStarterOperationResult;
  fallbackEnabled: boolean;
  disabled: boolean;
  onRefresh: () => MaybePromise;
  onEnable: () => MaybePromise;
  onRepair: () => MaybePromise;
  onDisable: () => MaybePromise;
}) {
  const busy = loading || Boolean(operationLoading);
  const checked = status ? status.state !== "off" : fallbackEnabled;
  const tone = error
    ? "error"
    : status?.state === "ready"
      ? "success"
      : status?.state === "needs_repair" || status?.state === "setup_required"
        ? "warning"
        : "info";
  const primaryLabel = checked ? "Enabled" : "Off";
  const setupAction = agentMemoryStarterSetupAction(status);
  const setupOperation: AgentMemoryStarterOperationKind = setupAction === "enable" ? "enable" : "repair";
  const setupButtonLabel = operationLoading === setupOperation ? "Working" : agentMemoryStarterSetupActionLabel(setupAction);
  return (
    <div className={`voice-provider-diagnostics ${tone}`}>
      <div className="voice-provider-diagnostics-header">
        <strong>Agent Memory</strong>
        <span>{loading ? "Checking" : agentMemoryStarterStateLabel(status?.state)}</span>
      </div>
      <label className="setting-toggle">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled || busy}
          onChange={(event) => {
            if (event.target.checked) void onEnable();
            else void onDisable();
          }}
        />
        <span>{operationLoading === "enable" ? "Enabling" : operationLoading === "disable" ? "Disabling" : primaryLabel}</span>
      </label>
      <small>{agentMemoryStarterMessage(status, error)}</small>
      {status && (
        <ul>
          <li>Model: {agentMemoryStarterAssetLabel(status.assets.model)}</li>
          <li>Runtime: {agentMemoryStarterAssetLabel(status.assets.runtime)} · {status.runtime.state}{status.runtime.endpoint ? ` · ${status.runtime.endpoint}` : ""}</li>
          <li>Scope: global {status.settings.memory.enabled ? "on" : "off"}, thread {status.threadScope.activeThreadMemoryEnabled ? "on" : "off"}, new threads {status.threadScope.defaultThreadEnabled ? "on" : "off"}</li>
          {status.blockers[0] && <li>Blocker: {status.blockers[0].message}</li>}
          {status.nextActions[0] && <li>Next: {agentMemoryStarterActionLabel(status.nextActions[0])}</li>}
        </ul>
      )}
      <div className="panel-action-row compact">
        <button type="button" className="panel-button mini" disabled={busy} aria-label="Refresh Agent Memory starter status" onClick={() => void onRefresh()}>
          <RefreshCw size={14} />
          {loading ? "Refreshing" : "Refresh"}
        </button>
        <button
          type="button"
          className="panel-button mini"
          disabled={disabled || busy || !setupAction}
          aria-label={setupAction ? `${agentMemoryStarterActionLabel(setupAction)} Agent Memory setup` : "Continue Agent Memory setup"}
          onClick={() => void (setupAction === "enable" ? onEnable() : onRepair())}
        >
          {operationLoading === "repair" ? <RefreshCw size={14} /> : <Wrench size={14} />}
          {setupButtonLabel}
        </button>
      </div>
      {operationResult && (
        <small>
          Last {agentMemoryStarterOperationLabel(operationResult.operation).toLowerCase()}: {agentMemoryStarterStateLabel(operationResult.status.state)} · {formatTimelineTime(operationResult.completedAt)}
        </small>
      )}
    </div>
  );
}

function agentMemoryStarterSetupAction(status?: AgentMemoryStarterStatus): AgentMemoryStarterNextAction | undefined {
  return status?.nextActions.find((action) => AGENT_MEMORY_SETUP_ACTIONS.includes(action));
}

function agentMemoryStarterSetupActionLabel(action?: AgentMemoryStarterNextAction): string {
  if (action === "enable") return "Enable";
  if (action === "install") return "Install";
  if (action === "start") return "Start";
  if (action === "retry_preflight") return "Retry";
  return "Repair";
}

function AgentMemoryEmbeddingHealthCard({
  diagnostics,
  embeddingsEnabled,
  actionLoading,
  actionResult,
  actionError,
  onAction,
}: {
  diagnostics?: AgentMemoryStorageDiagnostics;
  embeddingsEnabled: boolean;
  actionLoading?: AgentMemoryEmbeddingLifecycleActionKind;
  actionResult?: AgentMemoryEmbeddingLifecycleActionResult;
  actionError?: string;
  onAction: (action: AgentMemoryEmbeddingLifecycleActionKind) => void;
}) {
  const embedding = diagnostics?.embedding;
  const running = embedding?.running === true;
  const tone = embedding?.status === "ready"
    ? "success"
    : embedding?.status === "error"
      ? "error"
      : embedding?.status === "unavailable" || embedding?.status === "keyword_fallback"
        ? "warning"
        : "info";
  const busy = Boolean(actionLoading);
  return (
    <div className={`voice-provider-diagnostics ${tone}`}>
      <div className="voice-provider-diagnostics-header">
        <strong>Embeddings endpoint</strong>
        <span>{agentMemoryEmbeddingStatusLabel(embedding?.status)}</span>
      </div>
      <small>{embedding?.message ?? "No embedding endpoint diagnostics have been loaded yet."}</small>
      <ul>
        <li>Endpoint: {embedding?.endpoint ?? "not running"}</li>
        <li>Provider: {embedding?.packageName ?? embedding?.providerId ?? "Ambient managed"}{embedding?.providerCapabilityId ? ` · ${embedding.providerCapabilityId}` : ""}</li>
        <li>Model: {embedding?.modelId ?? "unknown"}{embedding?.modelProfileId ? ` · ${embedding.modelProfileId}` : ""}{embedding?.dimensions ? ` · ${embedding.dimensions} dims` : ""}</li>
        <li>Runtime: {embedding?.runtimeStatus ?? "unknown"}{embedding?.runtimeId ? ` · ${embedding.runtimeId}` : ""} · {running ? "running" : "stopped"}</li>
        <li>Preflight: {embedding?.preflightEnabled ? "on" : "off"} · timeout {embedding?.timeoutMs ? formatDurationMs(embedding.timeoutMs) : "unknown"} · reindex {embedding?.reindexStatus ?? "unknown"}</li>
        {embedding?.lastError && <li>Error: {embedding.lastError}</li>}
        {embedding?.missingHints?.length ? <li>Missing: {embedding.missingHints[0]}</li> : null}
      </ul>
      <div className="panel-action-row compact">
        <EmbeddingLifecycleButton action="check" icon={<Activity size={14} />} label="Check" disabled={!embeddingsEnabled || busy} loading={actionLoading} onAction={onAction} />
        <EmbeddingLifecycleButton action="start" icon={<Play size={14} />} label="Start" disabled={!embeddingsEnabled || busy || running} loading={actionLoading} onAction={onAction} />
        <EmbeddingLifecycleButton action="restart" icon={<RotateCw size={14} />} label="Restart" disabled={!embeddingsEnabled || busy} loading={actionLoading} onAction={onAction} />
        <EmbeddingLifecycleButton action="stop" icon={<Square size={14} />} label="Stop" disabled={busy || !running} loading={actionLoading} onAction={onAction} />
      </div>
      {actionResult && (
        <small>
          Last {embeddingLifecycleActionLabel(actionResult.action).toLowerCase()}: {actionResult.status} · {actionResult.message} · {formatTimelineTime(actionResult.checkedAt)}
        </small>
      )}
      {actionError && <p className="panel-status error">{actionError}</p>}
      {!embeddingsEnabled && <small>Managed embeddings are disabled.</small>}
    </div>
  );
}

function EmbeddingLifecycleButton({
  action,
  icon,
  label,
  disabled,
  loading,
  onAction,
}: {
  action: AgentMemoryEmbeddingLifecycleActionKind;
  icon: ReactNode;
  label: string;
  disabled: boolean;
  loading?: AgentMemoryEmbeddingLifecycleActionKind;
  onAction: (action: AgentMemoryEmbeddingLifecycleActionKind) => void;
}) {
  const active = loading === action;
  return (
    <button type="button" className="panel-button mini" disabled={disabled} aria-label={`${label} managed memory embeddings`} onClick={() => onAction(action)}>
      {active ? <RefreshCw size={14} /> : icon}
      {active ? "Working" : label}
    </button>
  );
}

function agentMemoryStarterStateLabel(state: AgentMemoryStarterStatus["state"] | undefined): string {
  if (state === "off") return "Off";
  if (state === "setup_required") return "Setup required";
  if (state === "installing") return "Setting up";
  if (state === "starting") return "Starting";
  if (state === "ready") return "Ready";
  if (state === "needs_repair") return "Needs repair";
  if (state === "disabling") return "Disabling";
  return "Unknown";
}

function agentMemoryStarterMessage(status: AgentMemoryStarterStatus | undefined, error: string | undefined): string {
  if (error) return error;
  if (!status) return "Starter status has not been loaded yet.";
  if (status.blockers[0]) return status.blockers[0].message;
  if (status.state === "ready") return "Memory and managed embeddings are ready.";
  if (status.state === "off") return "Agent Memory is off.";
  return status.nextActions[0] ? `Next action: ${agentMemoryStarterActionLabel(status.nextActions[0])}.` : "Agent Memory setup is in progress.";
}

function agentMemoryStarterAssetLabel(asset: AgentMemoryStarterStatus["assets"]["model"]): string {
  return asset.state === "present"
    ? "present"
    : asset.message
      ? `${asset.state} · ${asset.message}`
      : asset.state;
}

function agentMemoryStarterActionLabel(action: AgentMemoryStarterStatus["nextActions"][number]): string {
  if (action === "enable") return "Enable";
  if (action === "install") return "Install assets";
  if (action === "repair") return "Repair";
  if (action === "start") return "Start endpoint";
  if (action === "retry_preflight") return "Retry preflight";
  if (action === "open_logs") return "Open logs";
  if (action === "disable") return "Disable";
  return "Clear memory";
}

function agentMemoryStarterOperationLabel(operation: AgentMemoryStarterOperationKind): string {
  if (operation === "enable") return "Enable";
  if (operation === "repair") return "Repair";
  if (operation === "disable") return "Disable";
  return "Status";
}

function latestAgentMemoryOperation(
  diagnostics: AgentMemoryStorageDiagnostics,
  key: "lastRecall" | "lastCapture" | "lastSearch",
): AgentMemoryOperationStatus | undefined {
  return diagnostics.runtimeSnapshots
    .map((snapshot) => snapshot[key])
    .filter((status): status is AgentMemoryOperationStatus => Boolean(status))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))[0];
}

function operationStatusLabel(status: AgentMemoryOperationStatus | undefined): string {
  if (!status) return "none";
  const total = typeof status.total === "number" ? ` (${status.total.toLocaleString()})` : "";
  const strategy = status.strategy ? ` · ${status.strategy}` : "";
  return `${status.status}${total}${strategy}`;
}

function agentMemoryStatusLabel(status: AgentMemoryStorageDiagnostics["status"]): string {
  if (status === "needs_attention") return "Needs attention";
  return status.replace(/_/g, " ");
}

function agentMemoryEmbeddingStatusLabel(status: AgentMemoryStorageDiagnostics["embedding"]["status"] | undefined): string {
  if (!status) return "Not checked";
  if (status === "keyword_fallback") return "Keyword fallback";
  return status.replace(/_/g, " ");
}

function embeddingLifecycleActionLabel(action: AgentMemoryEmbeddingLifecycleActionKind): string {
  if (action === "check") return "Check";
  if (action === "start") return "Start";
  if (action === "stop") return "Stop";
  return "Restart";
}

export function RightPanelModelModeSettingsSection({
  state,
  settingsRowVisible,
  modelCatalogSettings,
  modelProviderInstallDraft,
  modelProviderCredentialValue,
  modelProviderCredentialSave,
  modelProviderCredentialBusy,
  modelProviderCredentialStatus,
  modelProviderInstallBusy,
  modelProviderInstallStatus,
  subagentsFlagValue,
  subagentsFlagDescription,
  persistentSubagentsEnabled,
  slashCommandsFlagValue,
  slashCommandsFlagDescription,
  persistentSlashCommandsEnabled,
  memoryFlagValue,
  memoryFlagDescription,
  persistentMemoryFeatureEnabled,
  activeThreadMemoryEnabled,
  activeThreadMemoryToggleDisabled,
  agentMemoryDiagnostics,
  agentMemoryDiagnosticsLoading,
  agentMemoryDiagnosticsError,
  agentMemoryEmbeddingActionLoading,
  agentMemoryEmbeddingActionResult,
  agentMemoryEmbeddingActionError,
  agentMemoryStarterStatus,
  agentMemoryStarterLoading,
  agentMemoryStarterError,
  agentMemoryStarterOperationLoading,
  agentMemoryStarterOperationResult,
  subagentMaturity,
  subagentMaturityEvidence,
  setModelProviderInstallDraft,
  setModelProviderCredentialValue,
  saveModelProviderCredentialFromSettings,
  installModelProviderEndpointFromSettings,
  loadAgentMemoryStarterStatus,
  enableAgentMemoryStarterFromSettings,
  repairAgentMemoryStarterFromSettings,
  disableAgentMemoryStarterFromSettings,
  onThinkingDisplaySettingsChange,
  onFeatureFlagSettingsChange,
  onMemorySettingsChange,
  onActiveThreadMemoryEnabledChange,
  onRefreshAgentMemoryDiagnostics,
  onRunAgentMemoryEmbeddingLifecycleAction,
  onClearAgentMemory,
  onModelRuntimeSettingsChange,
  onPlannerSettingsChange,
}: RightPanelModelModeSettingsSectionProps) {
  const contextUsage = contextUsagePresentation(state.contextUsage, state.settings.compaction);
  return (
    <SettingsSection
      id="model-mode"
      title="Model & Mode"
      description="Current model, collaboration mode, context usage, and compaction behavior."
      badges={<span className="settings-section-badge">{state.settings.collaborationMode === "planner" ? "Planner" : "Agent"}</span>}
    >
      {settingsRowVisible("model-mode", "model-mode.model") && (
        <SettingsRow
          label="Model"
          value={state.provider.debugOverride ? `${state.provider.providerLabel} · ${ambientModelLabel(state.settings.model)}` : ambientModelLabel(state.settings.model)}
          description={state.provider.debugOverride ? `Startup provider override is routing Ambient-compatible calls to ${state.provider.baseUrl}.` : undefined}
        />
      )}
      {settingsRowVisible("model-mode", "model-mode.model-catalog") && (
        <SettingsRow
          label="Runtime catalog"
          value={modelCatalogSettings.statusLabel}
          description={modelCatalogSettings.summary}
        >
          <ModelRuntimeCatalogDiagnostics
            model={modelCatalogSettings}
            installDraft={modelProviderInstallDraft}
            credentialValue={modelProviderCredentialValue}
            credentialModel={modelProviderCredentialSave}
            credentialBusy={modelProviderCredentialBusy}
            credentialStatus={modelProviderCredentialStatus}
            installBusy={modelProviderInstallBusy}
            installStatus={modelProviderInstallStatus}
            onInstallDraftChange={setModelProviderInstallDraft}
            onCredentialValueChange={setModelProviderCredentialValue}
            onSaveCredential={() => void saveModelProviderCredentialFromSettings()}
            onInstallEndpoint={() => void installModelProviderEndpointFromSettings()}
          />
        </SettingsRow>
      )}
      {settingsRowVisible("model-mode", "model-mode.mode") && (
        <SettingsRow
          label="Mode"
          value={state.settings.collaborationMode === "planner" ? "Planner" : "Agent"}
          description={state.settings.collaborationMode === "planner" ? "Read-only planning tools" : "Normal implementation tools"}
        />
      )}
      {settingsRowVisible("model-mode", "model-mode.thinking-display") && (
        <SettingsRow
          label="Thinking display"
          value={thinkingDisplayModeLabel(state.settings.thinkingDisplay.mode)}
          description="Controls how saved Ambient/Pi thinking appears in chats. Thinking remains preserved for session recreation."
        >
          <SegmentedThinkingDisplay
            value={state.settings.thinkingDisplay.mode}
            onChange={(mode) => onThinkingDisplaySettingsChange({ ...state.settings.thinkingDisplay, mode })}
          />
        </SettingsRow>
      )}
      {settingsRowVisible("model-mode", "model-mode.run-status-card") && (
        <SettingsRow
          label="Run status details"
          value={state.settings.thinkingDisplay.showRunStatusCard ? "Shown" : "Hidden"}
          description="Shows the live Ambient status card with streaming, heartbeat, and tool execution details while a request is running."
        >
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={state.settings.thinkingDisplay.showRunStatusCard}
              onChange={(event) =>
                onThinkingDisplaySettingsChange({
                  ...state.settings.thinkingDisplay,
                  showRunStatusCard: event.target.checked,
                })
              }
            />
            <span>Show status card during runs</span>
          </label>
        </SettingsRow>
      )}
      {settingsRowVisible("model-mode", "model-mode.subagents") && (
        <SettingsRow
          label="Experimental sub-agents"
          value={subagentsFlagValue}
          description={subagentsFlagDescription}
        >
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={persistentSubagentsEnabled}
              onChange={(event) => onFeatureFlagSettingsChange({ ...state.settings.featureFlags, subagents: event.target.checked })}
            />
            <span>{persistentSubagentsEnabled ? "Enabled" : "Off"}</span>
          </label>
          <SubagentMaturityDiagnostics maturity={subagentMaturity} evidence={subagentMaturityEvidence} />
        </SettingsRow>
      )}
      {settingsRowVisible("model-mode", "model-mode.slash-commands") && (
        <SettingsRow
          label="Slash command skills"
          value={slashCommandsFlagValue}
          description={slashCommandsFlagDescription}
        >
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={persistentSlashCommandsEnabled}
              onChange={(event) =>
                onFeatureFlagSettingsChange({
                  ...state.settings.featureFlags,
                  slashCommands: event.target.checked,
                })
              }
            />
            <span>{persistentSlashCommandsEnabled ? "Enabled" : "Off"}</span>
          </label>
        </SettingsRow>
      )}
      {settingsRowVisible("model-mode", "model-mode.agent-memory") && (
        <SettingsRow
          label="Agent Memory"
          value={agentMemoryStarterStateLabel(agentMemoryStarterStatus?.state)}
          description="Sets up local TencentDB Agent Memory, managed embeddings, and active thread scope."
        >
          <AgentMemoryStarterCard
            status={agentMemoryStarterStatus}
            loading={agentMemoryStarterLoading}
            error={agentMemoryStarterError}
            operationLoading={agentMemoryStarterOperationLoading}
            operationResult={agentMemoryStarterOperationResult}
            fallbackEnabled={persistentMemoryFeatureEnabled && state.settings.memory.enabled}
            disabled={memoryFlagValue === "Forced off"}
            onRefresh={loadAgentMemoryStarterStatus}
            onEnable={enableAgentMemoryStarterFromSettings}
            onRepair={repairAgentMemoryStarterFromSettings}
            onDisable={disableAgentMemoryStarterFromSettings}
          />
          <div className="voice-provider-diagnostics info">
            <div className="voice-provider-diagnostics-header">
              <strong>Memory privacy</strong>
            </div>
            <ul>
              {AGENT_MEMORY_PRIVACY_DISCLOSURE_LINES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <details className="settings-disclosure">
            <summary>
              <span className="settings-disclosure-title">
                <ChevronDown size={14} />
                <strong>Advanced controls</strong>
              </span>
              <small>{memoryFlagValue}</small>
            </summary>
            <div className="settings-disclosure-body">
              <small>{memoryFlagDescription}</small>
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={persistentMemoryFeatureEnabled}
                  onChange={(event) =>
                    onFeatureFlagSettingsChange({
                      ...state.settings.featureFlags,
                      tencentDbMemory: event.target.checked,
                    })
                  }
                />
                <span>Feature flag</span>
              </label>
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={state.settings.memory.enabled}
                  onChange={(event) =>
                    onMemorySettingsChange({
                      ...state.settings.memory,
                      enabled: event.target.checked,
                    })
                  }
                />
                <span>Global memory</span>
              </label>
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={state.settings.memory.defaultThreadEnabled}
                  onChange={(event) =>
                    onMemorySettingsChange({
                      ...state.settings.memory,
                      defaultThreadEnabled: event.target.checked,
                    })
                  }
                />
                <span>New threads</span>
              </label>
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={state.settings.memory.shortTermOffloadEnabled}
                  onChange={(event) =>
                    onMemorySettingsChange({
                      ...state.settings.memory,
                      shortTermOffloadEnabled: event.target.checked,
                    })
                  }
                />
                <span>Short-term offload</span>
              </label>
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={state.settings.memory.embeddings.enabled}
                  onChange={(event) =>
                    onMemorySettingsChange({
                      ...state.settings.memory,
                      embeddings: {
                        ...state.settings.memory.embeddings,
                        enabled: event.target.checked,
                      },
                    })
                  }
                />
                <span>Managed embeddings</span>
              </label>
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={activeThreadMemoryEnabled}
                  disabled={activeThreadMemoryToggleDisabled}
                  onChange={(event) => onActiveThreadMemoryEnabledChange(event.target.checked)}
                />
                <span>This thread</span>
              </label>
              <AgentMemoryEmbeddingHealthCard
                diagnostics={agentMemoryDiagnostics}
                embeddingsEnabled={state.settings.memory.embeddings.enabled}
                actionLoading={agentMemoryEmbeddingActionLoading}
                actionResult={agentMemoryEmbeddingActionResult}
                actionError={agentMemoryEmbeddingActionError}
                onAction={onRunAgentMemoryEmbeddingLifecycleAction}
              />
            </div>
          </details>
          <div className="panel-action-row">
            <button type="button" className="panel-button mini" disabled={agentMemoryDiagnosticsLoading} onClick={onRefreshAgentMemoryDiagnostics}>
              {agentMemoryDiagnosticsLoading ? "Refreshing" : "Refresh diagnostics"}
            </button>
            <button type="button" className="panel-button mini danger" onClick={onClearAgentMemory}>
              Clear memory
            </button>
          </div>
          {agentMemoryDiagnosticsError && <p className="panel-status error">{agentMemoryDiagnosticsError}</p>}
          {agentMemoryDiagnostics
            ? <AgentMemoryDiagnosticsSummary diagnostics={agentMemoryDiagnostics} />
            : (
                <small>
                  Diagnostics are loaded on demand and include only status, counters, storage metadata, native preflight, and runtime snapshots.
                </small>
              )}
        </SettingsRow>
      )}
      {settingsRowVisible("model-mode", "model-mode.aggressive-retries") && (
        <SettingsRow
          label="Aggressive retries"
          value={state.settings.modelRuntime.aggressiveRetries ? "Up to 10 retries" : "Off"}
          description="Retries transient Ambient/Pi provider failures with short backoff. Active Pi sessions are recreated when this changes."
        >
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={state.settings.modelRuntime.aggressiveRetries}
              onChange={(event) => onModelRuntimeSettingsChange({ ...state.settings.modelRuntime, aggressiveRetries: event.target.checked })}
            />
            <span>{state.settings.modelRuntime.aggressiveRetries ? "Up to 10 retries" : "Off"}</span>
          </label>
        </SettingsRow>
      )}
      {settingsRowVisible("model-mode", "model-mode.provider-idle-timeout") && (
        <SettingsRow
          label="Provider stream idle retry"
          value={formatDurationMs(state.settings.modelRuntime.providerStreamIdleTimeoutMs)}
          description="Retries when Ambient/Pi emits no stream events, assistant text, or tool argument growth for the selected window."
        >
          <select
            className="automation-select"
            aria-label="Provider stream idle retry timeout"
            value={state.settings.modelRuntime.providerStreamIdleTimeoutMs}
            onChange={(event) =>
              onModelRuntimeSettingsChange({
                ...state.settings.modelRuntime,
                providerStreamIdleTimeoutMs: Number(event.target.value),
              })
            }
          >
            {MODEL_RUNTIME_PROVIDER_TIMEOUT_OPTIONS_MS.map((timeoutMs) => (
              <option key={timeoutMs} value={timeoutMs}>
                {formatDurationMs(timeoutMs)}
              </option>
            ))}
          </select>
        </SettingsRow>
      )}
      {settingsRowVisible("model-mode", "model-mode.provider-pre-stream-timeout") && (
        <SettingsRow
          label="Pre-stream response timeout"
          value={formatDurationMs(state.settings.modelRuntime.providerPreStreamTimeoutMs)}
          description="Applies before response headers or the first valid Ambient/Pi stream event arrives."
        >
          <select
            className="automation-select"
            aria-label="Pre-stream response timeout"
            value={state.settings.modelRuntime.providerPreStreamTimeoutMs}
            onChange={(event) =>
              onModelRuntimeSettingsChange({
                ...state.settings.modelRuntime,
                providerPreStreamTimeoutMs: Number(event.target.value),
              })
            }
          >
            {MODEL_RUNTIME_PROVIDER_TIMEOUT_OPTIONS_MS.map((timeoutMs) => (
              <option key={timeoutMs} value={timeoutMs}>
                {formatDurationMs(timeoutMs)}
              </option>
            ))}
          </select>
        </SettingsRow>
      )}
      {settingsRowVisible("model-mode", "model-mode.planner") && (
        <SettingsRow
          label="Planner finalization"
          value={state.settings.planner.autoFinalize ? "Automatic" : "Manual"}
          description="When enabled, answering the last required planner question starts final plan generation."
        >
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={state.settings.planner.autoFinalize}
              onChange={(event) => onPlannerSettingsChange({ ...state.settings.planner, autoFinalize: event.target.checked })}
            />
            <span>Auto-finalize after required questions</span>
          </label>
        </SettingsRow>
      )}
      {settingsRowVisible("model-mode", "model-mode.context") && (
        <SettingsRow
          label="Context"
          value={contextUsage.label}
          description={contextUsage.title}
        />
      )}
      {settingsRowVisible("model-mode", "model-mode.compaction") && (
        <SettingsRow label="Compaction" value={state.settings.compaction.autoCompactionEnabled ? "Automatic" : "Manual only"}>
          <small>
            Reserve {state.settings.compaction.reserveTokens.toLocaleString()} · keep recent{" "}
            {state.settings.compaction.keepRecentTokens.toLocaleString()} · warning {state.settings.compaction.softWarningPercent}% · hard{" "}
            {state.settings.compaction.hardPreflightPercent}%
          </small>
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
