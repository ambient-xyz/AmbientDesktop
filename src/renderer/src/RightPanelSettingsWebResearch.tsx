import { Download, Plug, RefreshCw } from "lucide-react";
import type { RefObject } from "react";
import type { DesktopState, ProviderCatalogSettingsCard } from "../../shared/desktopTypes";
import type { LocalDeepResearchRunHistoryEntry } from "../../shared/localRuntimeTypes";
import type { AmbientMcpContainerRuntimeLifecycleAction, AmbientMcpContainerRuntimeLifecyclePreview, AmbientMcpContainerRuntimeLifecycleProgress, AmbientMcpContainerRuntimeLifecycleResult, AmbientMcpContainerRuntimeStatus, AmbientMcpDefaultCapabilitySummary, AmbientMcpInstalledServerSummary, ManagedDevServerSummary } from "../../shared/pluginTypes";
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
} from "./RightPanelTypes";
import { formatTaskState } from "./RightPanelDetailPanels";
import { McpContainerRuntimeLifecycleControls } from "./RightPanelMcpRuntimeLifecycleControls";
import { formatTimelineTime } from "./RightPanelSettingsRuntime";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";
import { SettingsRow, SettingsSection } from "./RightPanelSettingsPrimitives";
import {
  RightPanelLocalDeepResearchSettingsRow,
  RightPanelSearchCatalogSettingsRow,
  RightPanelWebResearchProviderStackRow,
} from "./RightPanelSettingsWebResearchRows";
import { mcpContainerRuntimeDetailRows, mcpInstalledServerStatusLabel } from "./pluginUiModel";
import type { WebResearchProviderSetupAction } from "./searchWebSettingsModel";

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
            <RightPanelWebResearchProviderStackRow
              state={state}
              searchRoutingHydrating={searchRoutingHydrating}
              searchRoutingHydrationError={searchRoutingHydrationError}
              webResearchStack={webResearchStack}
              webResearchSearchProviders={webResearchSearchProviders}
              webResearchFetchProviders={webResearchFetchProviders}
              webResearchSearchStatus={webResearchSearchStatus}
              webResearchFetchStatus={webResearchFetchStatus}
              mcpDefaultWebResearchCapability={mcpDefaultWebResearchCapability}
              mcpContainerRuntimeStatus={mcpContainerRuntimeStatus}
              mcpServerBusy={mcpServerBusy}
              onHydrateSearchRoutingSettings={onHydrateSearchRoutingSettings}
              onSearchRoutingSettingsChange={onSearchRoutingSettingsChange}
              runWebResearchProviderSetupAction={runWebResearchProviderSetupAction}
            />
          )}
          {settingsRowVisible("search-web", "search-web.local-deep-research") && (
            <RightPanelLocalDeepResearchSettingsRow
              localDeepResearchSetup={localDeepResearchSetup}
              localDeepResearchSetupModel={localDeepResearchSetupModel}
              localDeepResearchActions={localDeepResearchActions}
              localDeepResearchQ8Override={localDeepResearchQ8Override}
              localDeepResearchQ8={localDeepResearchQ8}
              localModelMemoryPolicySummary={localModelMemoryPolicySummary}
              localModelResourceStatus={localModelResourceStatus}
              localModelResourcePolicy={localModelResourcePolicy}
              localModelMemoryLimitGiB={localModelMemoryLimitGiB}
              localModelResourceSettings={localModelResourceSettings}
              localDeepResearchProgress={localDeepResearchProgress}
              localDeepResearchDiagnostics={localDeepResearchDiagnostics}
              localDeepResearchRunHistory={localDeepResearchRunHistory}
              localDeepResearchRuns={localDeepResearchRuns}
              webResearchSearchStatus={webResearchSearchStatus}
              webResearchFetchStatus={webResearchFetchStatus}
              localDeepResearchRunBudget={state.settings.localDeepResearch.runBudget}
              onSetupLocalDeepResearch={onSetupLocalDeepResearch}
              onLocalDeepResearchQ8OverrideChange={onLocalDeepResearchQ8OverrideChange}
              updateLocalModelResourceSettings={updateLocalModelResourceSettings}
              updateLocalDeepResearchRunBudgetSettings={updateLocalDeepResearchRunBudgetSettings}
              onLoadLocalDeepResearchRunHistory={onLoadLocalDeepResearchRunHistory}
            />
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
            <RightPanelSearchCatalogSettingsRow
              state={state}
              running={running}
              searchCatalogCards={searchCatalogCards}
              startProviderCatalogCardOnboarding={startProviderCatalogCardOnboarding}
            />
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
  mcpServerBusy?: string;
  mcpContainerRuntimeLifecyclePreview?: AmbientMcpContainerRuntimeLifecyclePreview;
  mcpContainerRuntimeLifecycleResult?: AmbientMcpContainerRuntimeLifecycleResult;
  mcpContainerRuntimeLifecycleProgress: AmbientMcpContainerRuntimeLifecycleProgress[];
  mcpContainerRuntimeLifecycleBusyKey?: string;
  mcpContainerRuntimeLifecycleError?: string;
  previewMcpContainerRuntimeLifecycle: (action: AmbientMcpContainerRuntimeLifecycleAction) => MaybePromise;
  runMcpContainerRuntimeLifecycle: (action: AmbientMcpContainerRuntimeLifecycleAction) => MaybePromise;
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
  mcpServerBusy,
  mcpContainerRuntimeLifecyclePreview,
  mcpContainerRuntimeLifecycleResult,
  mcpContainerRuntimeLifecycleProgress,
  mcpContainerRuntimeLifecycleBusyKey,
  mcpContainerRuntimeLifecycleError,
  previewMcpContainerRuntimeLifecycle,
  runMcpContainerRuntimeLifecycle,
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
            <McpContainerRuntimeLifecycleControls
              status={mcpContainerRuntimeStatus}
              preview={mcpContainerRuntimeLifecyclePreview}
              result={mcpContainerRuntimeLifecycleResult}
              progress={mcpContainerRuntimeLifecycleProgress}
              error={mcpContainerRuntimeLifecycleError}
              busyKey={mcpContainerRuntimeLifecycleBusyKey}
              disabled={mcpContainerRuntimeBusy || mcpContainerRuntimeLaunchBusy || diagnosticBusy || Boolean(mcpServerBusy?.startsWith("default-capability:"))}
              onPreview={(action) => void previewMcpContainerRuntimeLifecycle(action)}
              onRun={(action) => void runMcpContainerRuntimeLifecycle(action)}
            />
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
