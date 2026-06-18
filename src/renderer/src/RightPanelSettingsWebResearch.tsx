import { ChevronLeft, ChevronRight, Download, KeyRound, LoaderCircle, Play, Plug, RefreshCw, RotateCcw } from "lucide-react";
import type { RefObject } from "react";
import {
  LOCAL_DEEP_RESEARCH_EFFORT_ORDER,
  localDeepResearchEffortLabel,
  localDeepResearchMaxToolCallsForEffort,
} from "../../shared/localDeepResearchBudget";
import type { DesktopState, ProviderCatalogSettingsCard } from "../../shared/desktopTypes";
import type { LocalDeepResearchBudgetExhaustionBehavior, LocalDeepResearchEffort, LocalDeepResearchRunHistoryEntry } from "../../shared/localRuntimeTypes";
import type { AmbientMcpContainerRuntimeStatus, AmbientMcpDefaultCapabilitySummary, AmbientMcpInstalledServerSummary, ManagedDevServerSummary } from "../../shared/pluginTypes";
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
  SettingsFocusRequest,
} from "./RightPanel";
import { formatTaskState } from "./RightPanelDetailPanels";
import {
  LocalDeepResearchDiagnosticsList,
  LocalDeepResearchRunHistoryList,
  ProviderCatalogSettingsCards,
  formatDurationMs,
  formatMemoryBytes,
  formatRatioPercent,
  formatTimelineTime,
} from "./RightPanelSettingsRuntime";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";
import { SettingsRow, SettingsSection } from "./RightPanelSettingsPrimitives";
import { mcpContainerRuntimeDetailRows, mcpInstalledServerStatusLabel } from "./pluginUiModel";
import {
  moveWebResearchProvider,
  resetWebResearchRole,
  setWebResearchBrowserFallback,
  setWebResearchProviderEnabled,
  webResearchProviderHealthBadge,
  webResearchProviderSetupAction,
  type WebResearchProviderSetupAction,
} from "./searchWebSettingsModel";

type SettingsRowVisible = (sectionId: string, rowId: string) => boolean;
type MaybePromise<T = unknown> = T | Promise<T>;
type LocalModelResourcePolicy = NonNullable<NonNullable<LocalDeepResearchSetupResult["localModelResources"]>["policyDecision"]>;
type StatusMessage = { message: string };
type PluginAction = { visible: boolean; disabled: boolean; title: string; label: string };

export type RightPanelSearchWebSettingsSectionProps = {
  state: DesktopState;
  running: boolean;
  settingsRowVisible: SettingsRowVisible;
  focusedSettingsSection?: SettingsFocusRequest["section"];
  searchWebSettingsRowRef: RefObject<HTMLElement | null>;
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
  searchRoutingStatus: string;
  searchRoutingDetail: string;
  searchCatalogCards: ProviderCatalogSettingsCard[];
  onHydrateSearchRoutingSettings: () => MaybePromise;
  onSearchRoutingSettingsChange: (settings: DesktopState["settings"]["search"]) => MaybePromise;
  runWebResearchProviderSetupAction: (action: WebResearchProviderSetupAction) => void;
  onSetupLocalDeepResearch: (action: LocalDeepResearchSetupAction) => void;
  onLocalDeepResearchQ8OverrideChange: (value: boolean) => void;
  updateLocalModelResourceSettings: (patch: Partial<DesktopState["settings"]["localDeepResearch"]["localModelResources"]>) => void;
  updateLocalDeepResearchRunBudgetSettings: (patch: Partial<DesktopState["settings"]["localDeepResearch"]["runBudget"]>) => void;
  onLoadLocalDeepResearchRunHistory: () => void;
  startProviderCatalogCardOnboarding: (card: ProviderCatalogSettingsCard) => MaybePromise;
};

export function RightPanelSearchWebSettingsSection({
  state,
  running,
  settingsRowVisible,
  focusedSettingsSection,
  searchWebSettingsRowRef,
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
  searchRoutingStatus,
  searchRoutingDetail,
  searchCatalogCards,
  onHydrateSearchRoutingSettings,
  onSearchRoutingSettingsChange,
  runWebResearchProviderSetupAction,
  onSetupLocalDeepResearch,
  onLocalDeepResearchQ8OverrideChange,
  updateLocalModelResourceSettings,
  updateLocalDeepResearchRunBudgetSettings,
  onLoadLocalDeepResearchRunHistory,
  startProviderCatalogCardOnboarding,
}: RightPanelSearchWebSettingsSectionProps) {
  const localDeepResearchRunBudget = state.settings.localDeepResearch.runBudget;
  const localDeepResearchDefaultToolCalls = localDeepResearchMaxToolCallsForEffort(
    localDeepResearchRunBudget.defaultEffort,
    localDeepResearchRunBudget.customMaxToolCalls,
  );

  return (
<SettingsSection
          id="search-web"
          title="Search & Web"
          description="Configure first-class web research provider order and launch provider setup through catalog-backed chat flows."
          badges={<span className="settings-section-badge">{webResearchSearchProviders[0]?.label ?? "Default routing"}</span>}
          focused={focusedSettingsSection === "search-web"}
          sectionRef={searchWebSettingsRowRef}
        >
          {settingsRowVisible("search-web", "search-web.research-stack") && (
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
              <section className="provider-catalog-settings-card recommended">
                <div className="provider-catalog-settings-card-header">
                  <div>
                    <strong>Search order</strong>
                    <span>{webResearchSearchStatus || "No providers configured"}</span>
                  </div>
                  <button
                    type="button"
                    className="panel-button mini icon-panel-button"
                    onClick={() => void onSearchRoutingSettingsChange({
                      ...state.settings.search,
                      webResearch: resetWebResearchRole(webResearchStack, "search"),
                    })}
                    title="Reset search provider order to Ambient defaults."
                  >
                    <RotateCcw size={13} />
                    Reset
                  </button>
                </div>
                <div className="plugin-badges">
                  {webResearchSearchProviders.map((provider, index) => (
                    <span key={provider.providerId}>{index + 1}. {provider.label}</span>
                  ))}
                </div>
                {webResearchSearchProviders.map((provider, index) => {
                  const health = webResearchProviderHealthBadge(provider, { scraplingDefaultCapability: mcpDefaultWebResearchCapability });
                  const setupAction = webResearchProviderSetupAction(provider, {
                    scraplingDefaultCapability: mcpDefaultWebResearchCapability,
                    scraplingRuntimeReady: mcpContainerRuntimeStatus?.status === "ready",
                    scraplingBusy: mcpServerBusy === "default-capability:scrapling",
                  });
                  return (
                  <div className="settings-mini-row web-research-provider-row" key={provider.providerId}>
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
                          webResearch: moveWebResearchProvider(webResearchStack, "search", provider.providerId, -1),
                        })}
                      >
                        <ChevronLeft size={13} /> Up
                      </button>
                      <button
                        type="button"
                        className="panel-button mini icon-panel-button"
                        disabled={index === webResearchSearchProviders.length - 1}
                        onClick={() => void onSearchRoutingSettingsChange({
                          ...state.settings.search,
                          webResearch: moveWebResearchProvider(webResearchStack, "search", provider.providerId, 1),
                        })}
                      >
                        <ChevronRight size={13} /> Down
                      </button>
                    </span>
                  </div>
                  );
                })}
              </section>
              <section className="provider-catalog-settings-card recommended">
                <div className="provider-catalog-settings-card-header">
                  <div>
                    <strong>Page read order</strong>
                    <span>{webResearchFetchStatus || "No providers configured"}</span>
                  </div>
                  <button
                    type="button"
                    className="panel-button mini icon-panel-button"
                    onClick={() => void onSearchRoutingSettingsChange({
                      ...state.settings.search,
                      webResearch: resetWebResearchRole(webResearchStack, "fetch"),
                    })}
                    title="Reset page read provider order to Ambient defaults."
                  >
                    <RotateCcw size={13} />
                    Reset
                  </button>
                </div>
                <div className="plugin-badges">
                  {webResearchFetchProviders.map((provider, index) => (
                    <span key={provider.providerId}>{index + 1}. {provider.label}</span>
                  ))}
                </div>
                {webResearchFetchProviders.map((provider, index) => {
                  const health = webResearchProviderHealthBadge(provider, { scraplingDefaultCapability: mcpDefaultWebResearchCapability });
                  const setupAction = webResearchProviderSetupAction(provider, {
                    scraplingDefaultCapability: mcpDefaultWebResearchCapability,
                    scraplingRuntimeReady: mcpContainerRuntimeStatus?.status === "ready",
                    scraplingBusy: mcpServerBusy === "default-capability:scrapling",
                  });
                  return (
                  <div className="settings-mini-row web-research-provider-row" key={provider.providerId}>
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
                          webResearch: moveWebResearchProvider(webResearchStack, "fetch", provider.providerId, -1),
                        })}
                      >
                        <ChevronLeft size={13} /> Up
                      </button>
                      <button
                        type="button"
                        className="panel-button mini icon-panel-button"
                        disabled={index === webResearchFetchProviders.length - 1}
                        onClick={() => void onSearchRoutingSettingsChange({
                          ...state.settings.search,
                          webResearch: moveWebResearchProvider(webResearchStack, "fetch", provider.providerId, 1),
                        })}
                      >
                        <ChevronRight size={13} /> Down
                      </button>
                    </span>
                  </div>
                  );
                })}
              </section>
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
          )}
          {settingsRowVisible("search-web", "search-web.local-deep-research") && (
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
          )}
          {settingsRowVisible("search-web", "search-web.routing") && (
          <SettingsRow
            label="Search routing"
            value={searchRoutingStatus}
            description="Persistent web-search preference used by Pi when installed search providers are available."
          >
            <small>{searchRoutingDetail}</small>
            <small>Preference changes still go through the Pi search preference tools and Ambient approval flow.</small>
          </SettingsRow>
          )}
          {settingsRowVisible("search-web", "search-web.catalog") && (
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
          )}
        </SettingsSection>
  );
}

export type RightPanelMcpRuntimeSettingsSectionProps = {
  settingsRowVisible: SettingsRowVisible;
  focusedSettingsSection?: SettingsFocusRequest["section"];
  mcpRuntimeSettingsRowRef: RefObject<HTMLElement | null>;
  mcpRuntimeSettingsTone: string;
  mcpRuntimeSettingsStatus: string;
  mcpRuntimeSettingsLabel: string;
  mcpContainerRuntimeBusy: boolean;
  refreshMcpContainerRuntimeStatus: (openWhenNeedsAction?: boolean) => MaybePromise;
  setMcpContainerRuntimeModalOpen: (open: boolean) => void;
  mcpContainerRuntimeStatus?: AmbientMcpContainerRuntimeStatus;
  mcpContainerRuntimeLaunchBusy: boolean;
  launchMcpContainerRuntimeInstaller: (actionId?: string, mode?: "dry-run" | "execute") => MaybePromise;
  mcpContainerRuntimeInstallBusyLabel: (kind?: string) => string;
  mcpContainerRuntimeError?: string;
  mcpContainerRuntimeInstallProgressStatusView?: StatusMessage;
  mcpContainerRuntimeActionStatus?: ApiKeyStatus;
  mcpDefaultWebResearchCapability?: AmbientMcpDefaultCapabilitySummary;
  mcpDefaultWebResearchAction: PluginAction;
  installMcpDefaultCapability: (capabilityId: "scrapling") => MaybePromise;
  mcpDefaultCapabilityInstallProgressStatusView?: StatusMessage;
  mcpInstalledScraplingServer?: AmbientMcpInstalledServerSummary;
  mcpRuntimeSettingsDiagnosticsAction: { title: string };
  diagnosticBusy: boolean;
  exportDiagnostics: () => MaybePromise;
  diagnosticStatus?: ApiKeyStatus;
  mcpRuntimeSettingsSetupResume: string[];
  onOpenMcpPlugins: () => void;
  mcpInstalledServers: AmbientMcpInstalledServerSummary[];
  managedDevServers: ManagedDevServerSummary[];
};

export function RightPanelMcpRuntimeSettingsSection({
  settingsRowVisible,
  focusedSettingsSection,
  mcpRuntimeSettingsRowRef,
  mcpRuntimeSettingsTone,
  mcpRuntimeSettingsStatus,
  mcpRuntimeSettingsLabel,
  mcpContainerRuntimeBusy,
  refreshMcpContainerRuntimeStatus,
  setMcpContainerRuntimeModalOpen,
  mcpContainerRuntimeStatus,
  mcpContainerRuntimeLaunchBusy,
  launchMcpContainerRuntimeInstaller,
  mcpContainerRuntimeInstallBusyLabel,
  mcpContainerRuntimeError,
  mcpContainerRuntimeInstallProgressStatusView,
  mcpContainerRuntimeActionStatus,
  mcpDefaultWebResearchCapability,
  mcpDefaultWebResearchAction,
  installMcpDefaultCapability,
  mcpDefaultCapabilityInstallProgressStatusView,
  mcpInstalledScraplingServer,
  mcpRuntimeSettingsDiagnosticsAction,
  diagnosticBusy,
  exportDiagnostics,
  diagnosticStatus,
  mcpRuntimeSettingsSetupResume,
  onOpenMcpPlugins,
  mcpInstalledServers,
  managedDevServers,
}: RightPanelMcpRuntimeSettingsSectionProps) {
  return (
<SettingsSection
          id="mcp-runtime"
          title="MCP Runtime & Web Research"
          description="Recover, install, or repair the global ToolHive container runtime and Ambient's default Scrapling web research capability."
          badges={<span className={`settings-section-badge tone-${mcpRuntimeSettingsTone}`}>{mcpRuntimeSettingsStatus}</span>}
          focused={focusedSettingsSection === "mcp-runtime"}
          sectionRef={mcpRuntimeSettingsRowRef}
        >
          {settingsRowVisible("mcp-runtime", "mcp-runtime.status") && (
          <SettingsRow
            label="Container runtime"
            value={mcpRuntimeSettingsLabel}
            description="Docker or Podman is required for isolated MCP plugins and browser-backed web research tools."
          >
            <div className="panel-action-row compact">
              <button
                type="button"
                className="panel-button mini icon-panel-button"
                disabled={mcpContainerRuntimeBusy}
                onClick={() => void refreshMcpContainerRuntimeStatus(false)}
                title="Refresh ToolHive, Docker, Podman, and platform runtime status without changing setup decisions."
              >
                <RefreshCw size={13} />
                {mcpContainerRuntimeBusy ? "Checking" : "Run preflight"}
              </button>
              <button type="button" className="panel-button mini" onClick={() => setMcpContainerRuntimeModalOpen(true)}>
                Review setup
              </button>
              {mcpContainerRuntimeStatus?.installPlan?.primaryAction && (
                <>
                  {mcpContainerRuntimeStatus.installPlan.primaryAction.kind === "managed-install" && (
                    <button
                      type="button"
                      className="panel-button mini"
                      disabled={mcpContainerRuntimeLaunchBusy}
                      onClick={() => void launchMcpContainerRuntimeInstaller(undefined, "dry-run")}
                      title="Dry-run this managed install plan without executing package-manager commands."
                    >
                      Review command plan
                    </button>
                  )}
                  <button
                    type="button"
                    className="panel-button mini"
                    disabled={mcpContainerRuntimeLaunchBusy}
                    onClick={() => void launchMcpContainerRuntimeInstaller()}
                    title={mcpContainerRuntimeStatus.installPlan.primaryAction.reason}
                  >
                    {mcpContainerRuntimeLaunchBusy
                      ? mcpContainerRuntimeInstallBusyLabel(mcpContainerRuntimeStatus.installPlan.primaryAction.kind)
                      : mcpContainerRuntimeStatus.installPlan.primaryAction.label}
                  </button>
                </>
              )}
            </div>
            <small>
              {mcpContainerRuntimeError ??
                mcpContainerRuntimeStatus?.message ??
                "Status has not been checked yet. Run preflight to inspect ToolHive and the local container host."}
            </small>
            {mcpContainerRuntimeStatus?.setup.promptSuppressed && (
              <small>First-run setup is deferred: {formatTaskState(mcpContainerRuntimeStatus.setup.reason)}.</small>
            )}
            {mcpContainerRuntimeInstallProgressStatusView && <small>{mcpContainerRuntimeInstallProgressStatusView.message}</small>}
            {mcpContainerRuntimeActionStatus && <small>{mcpContainerRuntimeActionStatus.message}</small>}
          </SettingsRow>
          )}
          {settingsRowVisible("mcp-runtime", "mcp-runtime.scrapling") && (
          <SettingsRow
            label="Scrapling web research"
            value={mcpDefaultWebResearchCapability ? formatTaskState(mcpDefaultWebResearchCapability.status) : "Not checked"}
            description="Ambient's default web research capability runs through ToolHive with the reviewed pinned Scrapling image."
          >
            <div className="panel-action-row compact">
              {mcpDefaultWebResearchAction.visible && (
                <button
                  type="button"
                  className="panel-button mini"
                  disabled={mcpDefaultWebResearchAction.disabled}
                  title={mcpDefaultWebResearchAction.title}
                  onClick={() => mcpDefaultWebResearchCapability && void installMcpDefaultCapability(mcpDefaultWebResearchCapability.capabilityId)}
                >
                  {mcpDefaultWebResearchAction.label}
                </button>
              )}
              <button
                type="button"
                className="panel-button mini"
                disabled={mcpContainerRuntimeBusy}
                onClick={() => void refreshMcpContainerRuntimeStatus(false)}
              >
                Refresh state
              </button>
            </div>
            <small>{mcpDefaultWebResearchCapability?.message ?? "Default capability state appears after the runtime probe completes."}</small>
            {mcpDefaultCapabilityInstallProgressStatusView && (
              <small>{mcpDefaultCapabilityInstallProgressStatusView.message}</small>
            )}
            {mcpDefaultWebResearchCapability?.imageDigest && <small>Image digest: {mcpDefaultWebResearchCapability.imageDigest}</small>}
            {mcpInstalledScraplingServer && (
              <small>
                Workload {mcpInstalledScraplingServer.workloadName}: {mcpInstalledServerStatusLabel(mcpInstalledScraplingServer)}.
              </small>
            )}
          </SettingsRow>
          )}
          {settingsRowVisible("mcp-runtime", "mcp-runtime.diagnostics") && (
          <SettingsRow
            label="Diagnostics"
            value={mcpContainerRuntimeStatus?.checkedAt ? formatTimelineTime(mcpContainerRuntimeStatus.checkedAt) : "No check yet"}
            description="Export the latest runtime probe, setup decision, ToolHive status, and default capability reconciliation state."
          >
            <div className="panel-action-row compact">
              <button
                type="button"
                className="panel-button mini icon-panel-button"
                disabled={diagnosticBusy}
                title={mcpRuntimeSettingsDiagnosticsAction.title}
                onClick={() => void exportDiagnostics()}
              >
                <Download size={13} />
                {diagnosticBusy ? "Exporting" : "Export diagnostics"}
              </button>
            </div>
            {diagnosticStatus && <small>{diagnosticStatus.message}</small>}
            {mcpContainerRuntimeStatus && (
              <>
                <div className="plugin-badges">
                  {mcpContainerRuntimeDetailRows(mcpContainerRuntimeStatus).map((row) => <span key={row}>{row}</span>)}
                </div>
                <div className="plugin-note-list">
                  {mcpContainerRuntimeStatus.hosts.map((host) => (
                    <span key={host.kind}>
                      {formatTaskState(host.kind)}: {formatTaskState(host.status)}{host.version ? ` ${host.version}` : ""}. {host.message}
                    </span>
                  ))}
                  {mcpRuntimeSettingsSetupResume.map((row) => <span key={row}>{row}</span>)}
                </div>
              </>
            )}
          </SettingsRow>
          )}
          {settingsRowVisible("mcp-runtime", "mcp-runtime.plugins") && (
          <SettingsRow
            label="Custom MCP plugins"
            value={mcpContainerRuntimeStatus?.status === "ready" ? "Runtime gate open" : "Runtime gated"}
            description="Plugin cards delegate runtime recovery here, then continue through the MCP Plugins registry and installed-server views."
          >
            <button
              type="button"
              className="panel-button mini icon-panel-button"
              onClick={() => {
                onOpenMcpPlugins();
              }}
            >
              <Plug size={13} />
              Open MCP Plugins
            </button>
            <small>
              {mcpInstalledServers.length.toLocaleString()} installed MCP server{mcpInstalledServers.length === 1 ? "" : "s"} known in this app state.
            </small>
            <small>
              {managedDevServers.length.toLocaleString()} managed dev server{managedDevServers.length === 1 ? "" : "s"} currently running.
            </small>
          </SettingsRow>
          )}
        </SettingsSection>
  );
}
