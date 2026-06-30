import { ChevronLeft, ChevronRight, Download, KeyRound, LoaderCircle, Play, RefreshCw, RotateCcw } from "lucide-react";
import {
  LOCAL_DEEP_RESEARCH_EFFORT_ORDER,
  localDeepResearchEffortLabel,
  localDeepResearchMaxToolCallsForEffort,
} from "../../shared/localDeepResearchBudget";
import type { DesktopState, ProviderCatalogSettingsCard } from "../../shared/desktopTypes";
import type { LocalDeepResearchBudgetExhaustionBehavior, LocalDeepResearchEffort, LocalDeepResearchRunHistoryEntry } from "../../shared/localRuntimeTypes";
import type { AmbientMcpContainerRuntimeStatus, AmbientMcpDefaultCapabilitySummary } from "../../shared/pluginTypes";
import type { WebResearchProviderConfig, WebResearchProviderStackSettings } from "../../shared/webResearchTypes";
import type {
  LocalDeepResearchDiagnosticItem,
  LocalDeepResearchInstallProgressModel,
  LocalDeepResearchQ8OverrideModel,
  LocalDeepResearchSetupAction,
  LocalDeepResearchSetupActionModel,
  LocalDeepResearchSetupResult,
  LocalDeepResearchSetupResultModel,
} from "./localDeepResearchUiModel";
import type {
  LocalDeepResearchRunHistoryUiState,
  LocalDeepResearchSetupUiState,
} from "./RightPanelTypes";
import { formatTaskState } from "./RightPanelDetailPanels";
import { SettingsRow } from "./RightPanelSettingsPrimitives";
import {
  LocalDeepResearchDiagnosticsList,
  LocalDeepResearchRunHistoryList,
  ProviderCatalogSettingsCards,
  formatDurationMs,
  formatTimelineTime,
} from "./RightPanelSettingsRuntime";
import {
  moveWebResearchProvider,
  resetWebResearchRole,
  setWebResearchBrowserFallback,
  setWebResearchProviderEnabled,
  webResearchProviderHealthBadge,
  webResearchProviderSetupAction,
  type WebResearchProviderSetupAction,
} from "./searchWebSettingsModel";

type MaybePromise<T = unknown> = T | Promise<T>;
type LocalModelResourcePolicy = NonNullable<NonNullable<LocalDeepResearchSetupResult["localModelResources"]>["policyDecision"]>;
type SearchSettings = DesktopState["settings"]["search"];

export type RightPanelWebResearchProviderStackRowProps = {
  state: DesktopState;
  searchRoutingHydrating: boolean;
  searchRoutingHydrationError?: string;
  webResearchStack: WebResearchProviderStackSettings;
  webResearchSearchProviders: WebResearchProviderConfig[];
  webResearchFetchProviders: WebResearchProviderConfig[];
  webResearchSearchStatus: string;
  webResearchFetchStatus: string;
  mcpDefaultWebResearchCapability?: AmbientMcpDefaultCapabilitySummary;
  mcpContainerRuntimeStatus?: AmbientMcpContainerRuntimeStatus;
  mcpServerBusy?: string;
  onHydrateSearchRoutingSettings: () => MaybePromise;
  onSearchRoutingSettingsChange: (settings: SearchSettings) => MaybePromise;
  runWebResearchProviderSetupAction: (action: WebResearchProviderSetupAction) => void;
};

export function RightPanelWebResearchProviderStackRow({
  state,
  searchRoutingHydrating,
  searchRoutingHydrationError,
  webResearchStack,
  webResearchSearchProviders,
  webResearchFetchProviders,
  webResearchSearchStatus,
  webResearchFetchStatus,
  mcpDefaultWebResearchCapability,
  mcpContainerRuntimeStatus,
  mcpServerBusy,
  onHydrateSearchRoutingSettings,
  onSearchRoutingSettingsChange,
  runWebResearchProviderSetupAction,
}: RightPanelWebResearchProviderStackRowProps) {
  return (
    <SettingsRow
      label="Web research provider stack"
      value="Global"
      className="web-research-settings-row"
      description="Ambient routes Pi's public search and public URL reads through these ordered providers, with a fallback ledger on every broker call."
    >
      <div className="settings-mini-row">
        <span>
          <strong>Installed provider catalog</strong>
          <small>{searchRoutingHydrating ? "Refreshing installed Ambient CLI and MCP providers." : "Settings refreshes installed web research providers when opened."}</small>
        </span>
        <span className="button-row">
          <button
            type="button"
            className="panel-button mini icon-panel-button"
            disabled={searchRoutingHydrating}
            onClick={onHydrateSearchRoutingSettings}
            title="Refresh installed Ambient CLI and MCP web research providers."
          >
            {searchRoutingHydrating ? <LoaderCircle size={13} className="spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
        </span>
      </div>
      {searchRoutingHydrationError && <p className="panel-status error">Could not refresh installed web research providers: {searchRoutingHydrationError}</p>}
      <div className="provider-catalog-settings-grid">
        <WebResearchProviderRoleCard
          role="search"
          title="Search order"
          status={webResearchSearchStatus}
          providers={webResearchSearchProviders}
          state={state}
          webResearchStack={webResearchStack}
          mcpDefaultWebResearchCapability={mcpDefaultWebResearchCapability}
          mcpContainerRuntimeStatus={mcpContainerRuntimeStatus}
          mcpServerBusy={mcpServerBusy}
          onSearchRoutingSettingsChange={onSearchRoutingSettingsChange}
          runWebResearchProviderSetupAction={runWebResearchProviderSetupAction}
        />
        <WebResearchProviderRoleCard
          role="fetch"
          title="Page read order"
          status={webResearchFetchStatus}
          providers={webResearchFetchProviders}
          state={state}
          webResearchStack={webResearchStack}
          mcpDefaultWebResearchCapability={mcpDefaultWebResearchCapability}
          mcpContainerRuntimeStatus={mcpContainerRuntimeStatus}
          mcpServerBusy={mcpServerBusy}
          onSearchRoutingSettingsChange={onSearchRoutingSettingsChange}
          runWebResearchProviderSetupAction={runWebResearchProviderSetupAction}
        />
      </div>
      <small>Exa is enabled by default for public search without a key. Scrapling remains preferred for public URL reads when ToolHive is installed and running.</small>
      <label className="setting-toggle">
        <input
          type="checkbox"
          checked={webResearchStack.fallbackPolicy.allowBrowserFallback}
          onChange={(event) => void onSearchRoutingSettingsChange({
            ...state.settings.search,
            webResearch: setWebResearchBrowserFallback(webResearchStack, event.target.checked),
          })}
        />
        <span>Allow Ambient Browser fallback when configured research providers cannot complete</span>
      </label>
    </SettingsRow>
  );
}

function WebResearchProviderRoleCard({
  role,
  title,
  status,
  providers,
  state,
  webResearchStack,
  mcpDefaultWebResearchCapability,
  mcpContainerRuntimeStatus,
  mcpServerBusy,
  onSearchRoutingSettingsChange,
  runWebResearchProviderSetupAction,
}: {
  role: "search" | "fetch";
  title: string;
  status: string;
  providers: WebResearchProviderConfig[];
  state: DesktopState;
  webResearchStack: WebResearchProviderStackSettings;
  mcpDefaultWebResearchCapability?: AmbientMcpDefaultCapabilitySummary;
  mcpContainerRuntimeStatus?: AmbientMcpContainerRuntimeStatus;
  mcpServerBusy?: string;
  onSearchRoutingSettingsChange: (settings: SearchSettings) => MaybePromise;
  runWebResearchProviderSetupAction: (action: WebResearchProviderSetupAction) => void;
}) {
  return (
    <section className="provider-catalog-settings-card recommended">
      <div className="provider-catalog-settings-card-header">
        <div>
          <strong>{title}</strong>
          <span>{status || "No providers configured"}</span>
        </div>
        <button
          type="button"
          className="panel-button mini icon-panel-button"
          onClick={() => void onSearchRoutingSettingsChange({
            ...state.settings.search,
            webResearch: resetWebResearchRole(webResearchStack, role),
          })}
          title={`Reset ${role === "search" ? "search" : "page read"} provider order to Ambient defaults.`}
        >
          <RotateCcw size={13} />
          Reset
        </button>
      </div>
      <div className="plugin-badges">
        {providers.map((provider, index) => (
          <span key={provider.providerId}>{index + 1}. {provider.label}</span>
        ))}
      </div>
      {providers.map((provider, index) => (
        <WebResearchProviderRow
          key={provider.providerId}
          role={role}
          provider={provider}
          index={index}
          providerCount={providers.length}
          state={state}
          webResearchStack={webResearchStack}
          mcpDefaultWebResearchCapability={mcpDefaultWebResearchCapability}
          mcpContainerRuntimeStatus={mcpContainerRuntimeStatus}
          mcpServerBusy={mcpServerBusy}
          onSearchRoutingSettingsChange={onSearchRoutingSettingsChange}
          runWebResearchProviderSetupAction={runWebResearchProviderSetupAction}
        />
      ))}
    </section>
  );
}

function WebResearchProviderRow({
  role,
  provider,
  index,
  providerCount,
  state,
  webResearchStack,
  mcpDefaultWebResearchCapability,
  mcpContainerRuntimeStatus,
  mcpServerBusy,
  onSearchRoutingSettingsChange,
  runWebResearchProviderSetupAction,
}: {
  role: "search" | "fetch";
  provider: WebResearchProviderConfig;
  index: number;
  providerCount: number;
  state: DesktopState;
  webResearchStack: WebResearchProviderStackSettings;
  mcpDefaultWebResearchCapability?: AmbientMcpDefaultCapabilitySummary;
  mcpContainerRuntimeStatus?: AmbientMcpContainerRuntimeStatus;
  mcpServerBusy?: string;
  onSearchRoutingSettingsChange: (settings: SearchSettings) => MaybePromise;
  runWebResearchProviderSetupAction: (action: WebResearchProviderSetupAction) => void;
}) {
  const health = webResearchProviderHealthBadge(provider, { scraplingDefaultCapability: mcpDefaultWebResearchCapability });
  const setupAction = webResearchProviderSetupAction(provider, {
    scraplingDefaultCapability: mcpDefaultWebResearchCapability,
    scraplingRuntimeReady: mcpContainerRuntimeStatus?.status === "ready",
    scraplingBusy: mcpServerBusy === "default-capability:scrapling",
  });
  return (
    <div className="settings-mini-row web-research-provider-row">
      <span>
        <span className="web-research-provider-heading">
          <strong>{provider.label}</strong>
          <span className={`web-research-health-badge tone-${health.tone}`} title={health.detail}>{health.label}</span>
        </span>
        <small>{provider.privacyLabel ?? provider.kind}</small>
      </span>
      <span className="button-row">
        {setupAction && (
          <button
            type="button"
            className="panel-button mini"
            disabled={setupAction.disabled}
            title={setupAction.title}
            onClick={() => runWebResearchProviderSetupAction(setupAction)}
          >
            {setupAction.kind === "configure-ambient-cli-secret" && <KeyRound size={13} />}
            {setupAction.label}
          </button>
        )}
        <label className="setting-toggle mini-toggle">
          <input
            type="checkbox"
            checked={provider.status !== "disabled"}
            onChange={(event) => void onSearchRoutingSettingsChange({
              ...state.settings.search,
              webResearch: setWebResearchProviderEnabled(webResearchStack, provider.providerId, event.target.checked),
            })}
          />
          <span>{provider.status === "disabled" ? "Disabled" : "Enabled"}</span>
        </label>
        <button
          type="button"
          className="panel-button mini icon-panel-button"
          disabled={index === 0}
          onClick={() => void onSearchRoutingSettingsChange({
            ...state.settings.search,
            webResearch: moveWebResearchProvider(webResearchStack, role, provider.providerId, -1),
          })}
        >
          <ChevronLeft size={13} /> Up
        </button>
        <button
          type="button"
          className="panel-button mini icon-panel-button"
          disabled={index === providerCount - 1}
          onClick={() => void onSearchRoutingSettingsChange({
            ...state.settings.search,
            webResearch: moveWebResearchProvider(webResearchStack, role, provider.providerId, 1),
          })}
        >
          <ChevronRight size={13} /> Down
        </button>
      </span>
    </div>
  );
}

export type RightPanelLocalDeepResearchSettingsRowProps = {
  localDeepResearchSetup: LocalDeepResearchSetupUiState;
  localDeepResearchSetupModel?: LocalDeepResearchSetupResultModel;
  localDeepResearchActions: LocalDeepResearchSetupActionModel[];
  localDeepResearchQ8Override: boolean;
  localDeepResearchQ8?: LocalDeepResearchQ8OverrideModel;
  localModelMemoryPolicySummary: string;
  localModelResourceStatus: string;
  localModelResourcePolicy?: LocalModelResourcePolicy;
  localModelMemoryLimitGiB: number | "";
  localModelResourceSettings: DesktopState["settings"]["localDeepResearch"]["localModelResources"];
  localDeepResearchProgress?: LocalDeepResearchInstallProgressModel;
  localDeepResearchDiagnostics: LocalDeepResearchDiagnosticItem[];
  localDeepResearchRunHistory: LocalDeepResearchRunHistoryUiState;
  localDeepResearchRuns: LocalDeepResearchRunHistoryEntry[];
  webResearchSearchStatus: string;
  webResearchFetchStatus: string;
  localDeepResearchRunBudget: DesktopState["settings"]["localDeepResearch"]["runBudget"];
  onSetupLocalDeepResearch: (action: LocalDeepResearchSetupAction) => void;
  onLocalDeepResearchQ8OverrideChange: (value: boolean) => void;
  updateLocalModelResourceSettings: (patch: Partial<DesktopState["settings"]["localDeepResearch"]["localModelResources"]>) => void;
  updateLocalDeepResearchRunBudgetSettings: (patch: Partial<DesktopState["settings"]["localDeepResearch"]["runBudget"]>) => void;
  onLoadLocalDeepResearchRunHistory: () => void;
};

export function RightPanelLocalDeepResearchSettingsRow({
  localDeepResearchSetup,
  localDeepResearchSetupModel,
  localDeepResearchActions,
  localDeepResearchQ8Override,
  localDeepResearchQ8,
  localModelMemoryPolicySummary,
  localModelResourceStatus,
  localModelResourcePolicy,
  localModelMemoryLimitGiB,
  localModelResourceSettings,
  localDeepResearchProgress,
  localDeepResearchDiagnostics,
  localDeepResearchRunHistory,
  localDeepResearchRuns,
  webResearchSearchStatus,
  webResearchFetchStatus,
  localDeepResearchRunBudget,
  onSetupLocalDeepResearch,
  onLocalDeepResearchQ8OverrideChange,
  updateLocalModelResourceSettings,
  updateLocalDeepResearchRunBudgetSettings,
  onLoadLocalDeepResearchRunHistory,
}: RightPanelLocalDeepResearchSettingsRowProps) {
  const localDeepResearchDefaultToolCalls = localDeepResearchMaxToolCallsForEffort(
    localDeepResearchRunBudget.defaultEffort,
    localDeepResearchRunBudget.customMaxToolCalls,
  );

  return (
    <SettingsRow
      label="Local Deep Research"
      value={
        localDeepResearchSetup.status === "running"
          ? "Working"
          : localDeepResearchSetupModel?.statusLabel ?? localDeepResearchSetup.message ?? "Not checked"
      }
      className="web-research-settings-row"
      description="Ambient-managed LiteResearcher uses the current web research provider stack for search and page reads, then runs synthesis through the local llama.cpp runtime."
    >
      <div className="settings-mini-row">
        <span>
          <strong>Selected model</strong>
          <small>
            {localDeepResearchSetup.result
              ? `${localDeepResearchSetup.result.modelSelection.profile.displayName} · ${localDeepResearchSetup.result.modelSelection.contextTokens.toLocaleString()} context tokens`
              : "Check status to choose Q4 or Q8 from current machine and memory policy."}
          </small>
        </span>
        <span className="button-row">
          {localDeepResearchActions.map((action) => (
            <button
              type="button"
              className={`panel-button mini icon-panel-button ${action.primary ? "primary" : ""}`}
              key={action.action}
              onClick={() => onSetupLocalDeepResearch(action.action)}
              disabled={localDeepResearchSetup.status === "running"}
              title={action.title}
            >
              {localDeepResearchSetup.status === "running" && localDeepResearchSetup.action === action.action ? <LoaderCircle size={13} className="spin" /> : action.action === "install" ? <Download size={13} /> : action.action === "smoke" ? <Play size={13} /> : <RefreshCw size={13} />}
              {localDeepResearchSetup.status === "running" && localDeepResearchSetup.action === action.action ? "Working" : action.label}
            </button>
          ))}
        </span>
      </div>
      <label className="setting-toggle">
        <input
          type="checkbox"
          checked={localDeepResearchQ8Override}
          onChange={(event) => onLocalDeepResearchQ8OverrideChange(event.target.checked)}
          disabled={localDeepResearchSetup.status === "running"}
        />
        <span>Request Q8 override on the next setup check, install, or validation</span>
      </label>
      {localDeepResearchQ8 && (
        <small title={localDeepResearchQ8.title}>
          {localDeepResearchQ8.label}
        </small>
      )}
      <div className="settings-mini-row local-deep-research-budget-row">
        <span>
          <strong>Default research effort</strong>
          <small>
            {localDeepResearchEffortLabel(localDeepResearchRunBudget.defaultEffort)} · {localDeepResearchDefaultToolCalls.toLocaleString()} tool calls
          </small>
        </span>
        <span className="button-row">
          <select
            className="settings-select compact"
            value={localDeepResearchRunBudget.defaultEffort}
            aria-label="Default Local Deep Research effort"
            onChange={(event) => updateLocalDeepResearchRunBudgetSettings({
              defaultEffort: event.target.value as LocalDeepResearchEffort,
            })}
          >
            {LOCAL_DEEP_RESEARCH_EFFORT_ORDER.map((effort) => (
              <option key={effort} value={effort}>
                {localDeepResearchEffortLabel(effort)}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
          <input
            className="settings-memory-input"
            type="number"
            min={1}
            max={500}
            step={1}
            value={localDeepResearchRunBudget.customMaxToolCalls ?? ""}
            placeholder="Custom calls"
            aria-label="Default custom Local Deep Research max tool calls"
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              updateLocalDeepResearchRunBudgetSettings({
                defaultEffort: "custom",
                customMaxToolCalls: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
              });
            }}
          />
          <select
            className="settings-select compact"
            value={localDeepResearchRunBudget.onExhausted}
            aria-label="Local Deep Research budget exhaustion behavior"
            onChange={(event) => updateLocalDeepResearchRunBudgetSettings({
              onExhausted: event.target.value as LocalDeepResearchBudgetExhaustionBehavior,
            })}
          >
            <option value="ask_to_continue">Ask</option>
            <option value="summarize">Summarize</option>
          </select>
        </span>
      </div>
      <div className="settings-mini-row local-model-resource-row">
        <span>
          <strong>Local model memory policy</strong>
          <small>{localModelMemoryPolicySummary}</small>
          <small>{localModelResourceStatus}</small>
          {localModelResourcePolicy && localModelResourcePolicy.outcome !== "unlimited" && (
            <small>{localModelResourcePolicy.reason}</small>
          )}
        </span>
        <span className="button-row">
          <input
            className="settings-memory-input"
            type="number"
            min={0}
            max={512}
            step={1}
            value={localModelMemoryLimitGiB}
            placeholder="No GiB override"
            aria-label="Advanced local model resident memory ceiling in GiB"
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              updateLocalModelResourceSettings({
                maxResidentMemoryBytes: Number.isFinite(parsed) && parsed > 0 ? parsed * (1024 ** 3) : undefined,
              });
            }}
          />
          <select
            className="settings-select compact"
            value={localModelResourceSettings.memoryLimitBehavior}
            aria-label="Local model memory policy behavior"
            onChange={(event) => updateLocalModelResourceSettings({
              memoryLimitBehavior: event.target.value as DesktopState["settings"]["localDeepResearch"]["localModelResources"]["memoryLimitBehavior"],
            })}
          >
            <option value="warn">Warn</option>
            <option value="refuse">Refuse</option>
            <option value="unload-idle">Unload idle</option>
            <option value="ask-to-exceed">Ask</option>
          </select>
        </span>
      </div>
      {localDeepResearchSetup.message && (
        <div className={`voice-provider-diagnostics ${localDeepResearchSetup.status === "error" ? "error" : localDeepResearchSetupModel?.statusTone ?? "info"}`}>
          <strong>{localDeepResearchSetupModel?.statusLabel ?? localDeepResearchSetup.message}</strong>
          {localDeepResearchSetupModel?.detailLabels.map((label) => (
            <small key={label}>{label}</small>
          ))}
          {localDeepResearchSetup.status === "error" && <small className="error-text">{localDeepResearchSetup.message}</small>}
        </div>
      )}
      {localDeepResearchProgress && (
        <div className={`voice-provider-diagnostics local-deep-research-progress ${localDeepResearchProgress.tone}`} role="status" aria-live="polite">
          <div className="voice-provider-diagnostics-header">
            <strong>Managed install progress</strong>
            {localDeepResearchProgress.percent !== undefined && <span>{Math.round(localDeepResearchProgress.percent)}%</span>}
          </div>
          <small>{localDeepResearchProgress.title}</small>
          {localDeepResearchProgress.percent !== undefined && (
            <div className="local-deep-research-progress-track" aria-hidden="true">
              <span style={{ width: `${Math.max(3, localDeepResearchProgress.percent)}%` }} />
            </div>
          )}
          {localDeepResearchProgress.detail && <small>{localDeepResearchProgress.detail}</small>}
        </div>
      )}
      {!localDeepResearchSetup.result && (
        <div className="plugin-badges">
          <span>Search: {webResearchSearchStatus || "No providers configured"}</span>
          <span>Fetch: {webResearchFetchStatus || "No providers configured"}</span>
        </div>
      )}
      <LocalDeepResearchDiagnosticsList diagnostics={localDeepResearchDiagnostics} />
      {localDeepResearchSetup.result?.validation && (
        <div className="settings-mini-row">
          <span>
            <strong>Validation evidence</strong>
            <small>
              {formatTaskState(localDeepResearchSetup.result.validation.status)} · {formatTimelineTime(localDeepResearchSetup.result.validation.checkedAt)}
            </small>
          </span>
          <span className="button-row">
            <button
              type="button"
              className="panel-button mini"
              onClick={() => void window.ambientDesktop.openWorkspacePath(localDeepResearchSetup.result!.validation!.artifactPath).catch(() => undefined)}
            >
              Open validation
            </button>
            <button
              type="button"
              className="panel-button mini"
              onClick={() => void window.ambientDesktop.revealWorkspacePath(localDeepResearchSetup.result!.validation!.artifactPath).catch(() => undefined)}
            >
              Reveal
            </button>
          </span>
        </div>
      )}
      {localDeepResearchSetup.result?.validation?.memoryTelemetry && (
        <div className="settings-mini-row">
          <span>
            <strong>Memory telemetry evidence</strong>
            <small>
              {formatTaskState(localDeepResearchSetup.result.validation.memoryTelemetry.status)} · {localDeepResearchSetup.result.validation.memoryTelemetry.physicalMemoryClass} · {formatTimelineTime(localDeepResearchSetup.result.validation.memoryTelemetry.capturedAt)}
            </small>
          </span>
          <span className="button-row">
            <button
              type="button"
              className="panel-button mini"
              onClick={() => void window.ambientDesktop.openWorkspacePath(localDeepResearchSetup.result!.validation!.memoryTelemetry!.artifactPath).catch(() => undefined)}
            >
              Open telemetry
            </button>
            <button
              type="button"
              className="panel-button mini"
              onClick={() => void window.ambientDesktop.openWorkspacePath(localDeepResearchSetup.result!.validation!.memoryTelemetry!.markdownPath).catch(() => undefined)}
            >
              Open report
            </button>
            <button
              type="button"
              className="panel-button mini"
              onClick={() => void window.ambientDesktop.revealWorkspacePath(localDeepResearchSetup.result!.validation!.memoryTelemetry!.artifactPath).catch(() => undefined)}
            >
              Reveal
            </button>
          </span>
        </div>
      )}
      {localDeepResearchSetup.result?.validation?.providerPreferenceSmoke && (
        <div className="settings-mini-row">
          <span>
            <strong>Provider preference evidence</strong>
            <small>
              {formatTaskState(localDeepResearchSetup.result.validation.providerPreferenceSmoke.status)} · {localDeepResearchSetup.result.validation.providerPreferenceSmoke.checkCount} checks · {formatTimelineTime(localDeepResearchSetup.result.validation.providerPreferenceSmoke.checkedAt)}
            </small>
          </span>
          <span className="button-row">
            <button
              type="button"
              className="panel-button mini"
              onClick={() => void window.ambientDesktop.openWorkspacePath(localDeepResearchSetup.result!.validation!.providerPreferenceSmoke!.artifactPath).catch(() => undefined)}
            >
              Open smoke
            </button>
            <button
              type="button"
              className="panel-button mini"
              onClick={() => void window.ambientDesktop.openWorkspacePath(localDeepResearchSetup.result!.validation!.providerPreferenceSmoke!.markdownPath).catch(() => undefined)}
            >
              Open report
            </button>
            <button
              type="button"
              className="panel-button mini"
              onClick={() => void window.ambientDesktop.revealWorkspacePath(localDeepResearchSetup.result!.validation!.providerPreferenceSmoke!.artifactPath).catch(() => undefined)}
            >
              Reveal
            </button>
          </span>
        </div>
      )}
      {localDeepResearchSetup.result?.smoke && (
        <div className="settings-mini-row">
          <span>
            <strong>Smoke evidence</strong>
            <small>
              {formatTaskState(localDeepResearchSetup.result.smoke.status)} · {formatTimelineTime(localDeepResearchSetup.result.smoke.checkedAt)}
              {localDeepResearchSetup.result.smoke.chat ? ` · ${formatDurationMs(localDeepResearchSetup.result.smoke.chat.durationMs)}` : ""}
            </small>
          </span>
          <span className="button-row">
            <button
              type="button"
              className="panel-button mini"
              onClick={() => void window.ambientDesktop.openWorkspacePath(localDeepResearchSetup.result!.smoke!.artifactPath).catch(() => undefined)}
            >
              Open smoke
            </button>
            <button
              type="button"
              className="panel-button mini"
              onClick={() => void window.ambientDesktop.revealWorkspacePath(localDeepResearchSetup.result!.smoke!.artifactPath).catch(() => undefined)}
            >
              Reveal
            </button>
          </span>
        </div>
      )}
      <div className="settings-mini-row">
        <span>
          <strong>Run evidence</strong>
          <small>
            {localDeepResearchRunHistory.status === "loading"
              ? "Loading persisted Local Deep Research artifacts..."
              : localDeepResearchRunHistory.message ?? "Recent run artifacts appear after the first completed local research run."}
          </small>
        </span>
        <span className="button-row">
          <button
            type="button"
            className="panel-button mini icon-panel-button"
            disabled={localDeepResearchRunHistory.status === "loading"}
            onClick={onLoadLocalDeepResearchRunHistory}
            title="Refresh recent Local Deep Research JSON and Markdown artifacts."
          >
            {localDeepResearchRunHistory.status === "loading" ? <LoaderCircle size={13} className="spin" /> : <RefreshCw size={13} />}
            Refresh runs
          </button>
          <button
            type="button"
            className="panel-button mini"
            onClick={() => void window.ambientDesktop.revealWorkspacePath(".ambient/local-deep-research/runs").catch(() => undefined)}
            title="Reveal the Local Deep Research run artifact folder in the workspace."
          >
            Reveal folder
          </button>
        </span>
      </div>
      {localDeepResearchRunHistory.status === "error" && <small className="error-text">{localDeepResearchRunHistory.message}</small>}
      <LocalDeepResearchRunHistoryList
        entries={localDeepResearchRuns}
        truncated={Boolean(localDeepResearchRunHistory.result?.truncated)}
        onOpen={(path) => void window.ambientDesktop.openWorkspacePath(path).catch(() => undefined)}
        onReveal={(path) => void window.ambientDesktop.revealWorkspacePath(path).catch(() => undefined)}
      />
    </SettingsRow>
  );
}

export type RightPanelSearchCatalogSettingsRowProps = {
  state: DesktopState;
  running: boolean;
  searchCatalogCards: ProviderCatalogSettingsCard[];
  startProviderCatalogCardOnboarding: (card: ProviderCatalogSettingsCard) => MaybePromise;
};

export function RightPanelSearchCatalogSettingsRow({
  state,
  running,
  searchCatalogCards,
  startProviderCatalogCardOnboarding,
}: RightPanelSearchCatalogSettingsRowProps) {
  return (
    <SettingsRow
      label="Known providers"
      value={`${searchCatalogCards.length} catalog card${searchCatalogCards.length === 1 ? "" : "s"}`}
      className="web-research-settings-row"
      description="Launch approval-gated web-search or Local Deep Research setup from the same catalog source Pi sees."
    >
      <ProviderCatalogSettingsCards
        cards={searchCatalogCards}
        catalogVersion={state.providerCatalog.catalogVersion}
        generatedAt={state.providerCatalog.generatedAt}
        running={running}
        onStart={(card) => void startProviderCatalogCardOnboarding(card)}
      />
    </SettingsRow>
  );
}
