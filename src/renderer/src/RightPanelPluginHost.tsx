import { Package, Plug, Plus, RefreshCw, Zap } from "lucide-react";
import type { ComponentType } from "react";
import type { DesktopState } from "../../shared/desktopTypes";
import type { SttProviderCandidate, VoiceProviderCandidate } from "../../shared/localRuntimeTypes";
import type { PermissionAuditEntry } from "../../shared/permissionTypes";
import type { AmbientGeneratedCapabilitySummary, AmbientMcpContainerRuntimeManagedInstallProgress, AmbientMcpContainerRuntimeStatus, AmbientMcpDefaultCapabilityInstallInput, AmbientMcpDefaultCapabilityInstallProgress, AmbientMcpInstalledServerSummary, AmbientMcpInstallPreview, AmbientMcpServerSearchResult, AmbientPluginAuthStartResult, AmbientPluginCapabilityDiagnostics, AmbientPluginRegistry, AmbientPluginRuntime, AmbientPluginSourceKind, CapabilityBuilderHistoryEntry, CapabilityBuilderHistoryResult, CodexHostedMarketplaceReport, CodexMarketplaceSourceSummary, CodexPluginCatalog, CodexPluginMcpInspectionCatalog, FirstPartyGoogleIntegrationState, ManagedDevServerSummary, PiExtensionSandboxCatalog, PiExtensionSandboxInstallPreview, PiPackageCatalog, PiPackageInstallScope, PiPrivilegedCatalog, PiPrivilegedSecurityScan, PluginMcpRuntimeSnapshot } from "../../shared/pluginTypes";
import {
  filterAmbientCapabilities,
  filterAmbientPluginsBySource,
  formatAmbientPluginSourceKind,
  mcpContainerRuntimeDiagnosticsActionState,
  mcpContainerRuntimeSetupResumeRows,
  mcpContainerRuntimeStatusLabel,
  mcpContainerRuntimeTone,
  pluginAuthCompleteActionState,
  type AmbientPluginRuntimeFilter,
  type AmbientPluginSourceFilter,
  type GoogleWorkspaceValidationFeedback,
} from "./pluginUiModel";
import {
  formatTaskState,
} from "./RightPanelDetailPanels";
import { RightPanelPluginCapabilitiesPane } from "./RightPanelPluginCapabilitiesPane";
import { RightPanelPluginDiagnostics } from "./RightPanelPluginDiagnostics";
import { RightPanelPluginHomePane, RightPanelPluginOverviewHero } from "./RightPanelPluginHomePane";
import { RightPanelPluginInstalledPane } from "./RightPanelPluginInstalledPane";
import { RightPanelPluginMarketplacePane } from "./RightPanelPluginMarketplacePane";
import { RightPanelPluginMcpRuntime } from "./RightPanelPluginMcpRuntime";
import { RightPanelPluginMcpServers } from "./RightPanelPluginMcpServers";
import { RightPanelPluginSourcesPane } from "./RightPanelPluginSourcesPane";
import { formatTimelineTime, type ApiKeyStatus } from "./RightPanelSettingsRuntime";

type MaybePromise<T = unknown> = T | Promise<T>;

type InfoTooltipProps = {
  label?: string;
  text: string;
  className?: string;
};

export type PluginPanelView = "home" | "marketplace" | "installed" | "capabilities" | "mcp" | "sources" | "diagnostics";

const pluginPanelViews: PluginPanelView[] = ["home", "capabilities", "mcp", "marketplace", "installed", "sources", "diagnostics"];

const pluginRuntimeFilters: AmbientPluginRuntimeFilter[] = ["all", "chat", "workflow", "automation", "ui"];

const pluginSourceFilters: AmbientPluginSourceFilter[] = [
  "all",
  "ambient-built-in",
  "ambient-cli",
  "codex-workspace",
  "codex-cache",
  "codex-ambient-curated",
  "codex-remote-marketplace",
  "pi-ambient-workspace",
  "pi-ambient-global",
  "pi-workspace",
  "pi-project-settings",
  "pi-user-settings",
  "pi-gallery",
];

function pluginPanelViewLabel(view: PluginPanelView): string {
  if (view === "capabilities") return "Install Capabilities";
  if (view === "mcp") return "MCP Servers";
  return formatTaskState(view);
}

export function mcpContainerRuntimeInstallProgressStatus(progress?: AmbientMcpContainerRuntimeManagedInstallProgress): ApiKeyStatus | undefined {
  if (!progress) return undefined;
  const failed = progress.status === "failed" || progress.status === "blocked" || progress.status === "adapter-unavailable";
  const succeeded = progress.phase === "completed" && progress.status === "succeeded";
  return {
    kind: failed ? "error" : succeeded ? "success" : "info",
    message: progress.logPath ? `${progress.message} Log: ${progress.logPath}` : progress.message,
  };
}

export function mcpDefaultCapabilityInstallProgressStatus(progress?: AmbientMcpDefaultCapabilityInstallProgress): ApiKeyStatus | undefined {
  if (!progress) return undefined;
  return {
    kind: progress.status === "failed" ? "error" : progress.status === "succeeded" ? "success" : "info",
    message: progress.message,
  };
}

export type RightPanelPluginHostProps = {
  InfoTooltip: ComponentType<InfoTooltipProps>;
  state: DesktopState;
  running: boolean;
  voiceProviders: VoiceProviderCandidate[];
  sttProviders: SttProviderCandidate[];
  ambientPluginRegistry?: AmbientPluginRegistry;
  pluginCatalog?: CodexPluginCatalog;
  hostedMarketplaceReport?: CodexHostedMarketplaceReport;
  pluginView: PluginPanelView;
  setPluginView: (view: PluginPanelView) => void;
  pluginSourceFilter: AmbientPluginSourceFilter;
  setPluginSourceFilter: (source: AmbientPluginSourceFilter) => void;
  pluginRuntimeFilter: AmbientPluginRuntimeFilter;
  setPluginRuntimeFilter: (runtime: AmbientPluginRuntimeFilter) => void;
  pluginCapabilityDiagnostics?: AmbientPluginCapabilityDiagnostics;
  pluginCapabilityDiagnosticsBusy?: string;
  pluginCapabilityDiagnosticsError?: string;
  capabilityBuilderHistory?: CapabilityBuilderHistoryResult;
  capabilityBuilderHistoryLoading: boolean;
  capabilityBuilderHistoryError?: string;
  capabilityBuilderHistoryPreviewStarting?: string;
  capabilityBuilderHistoryRepairPlanning?: string;
  capabilityBuilderHistoryReregisterStarting?: string;
  generatedCapabilitySourceOpening?: string;
  generatedCapabilityValidationStarting?: string;
  generatedCapabilityUpdatePlanning?: string;
  generatedCapabilityRemovalPlanning?: string;
  selectedPluginDetailId?: string;
  setSelectedPluginDetailId: (id?: string) => void;
  setCapabilityBuilderLauncherOpen: (open: boolean) => void;
  firstRunCapabilityOnboardingDismissed: boolean;
  firstRunCapabilityOnboardingStarting: boolean;
  codexMarketplaceSourceInput: string;
  setCodexMarketplaceSourceInput: (value: string) => void;
  codexMarketplaceNameInput: string;
  setCodexMarketplaceNameInput: (value: string) => void;
  codexMarketplaceAllowExperimental: boolean;
  setCodexMarketplaceAllowExperimental: (value: boolean) => void;
  codexMarketplaceAdding: boolean;
  codexMarketplaceRemoving?: string;
  pluginCatalogError?: string;
  mcpInspection?: CodexPluginMcpInspectionCatalog;
  mcpRuntimeSnapshots: PluginMcpRuntimeSnapshot[];
  mcpInspectionError?: string;
  mcpRuntimeBusy?: string;
  mcpInspecting: boolean;
  mcpServerQuery: string;
  setMcpServerQuery: (query: string) => void;
  mcpRegistryResults: AmbientMcpServerSearchResult[];
  mcpInstalledServers: AmbientMcpInstalledServerSummary[];
  mcpSelectedPreview?: AmbientMcpInstallPreview;
  mcpServerBusy?: string;
  mcpServerStatus?: ApiKeyStatus;
  mcpServerError?: string;
  managedDevServers: ManagedDevServerSummary[];
  managedDevServerBusy?: string;
  managedDevServerError?: string;
  mcpContainerRuntimeStatus?: AmbientMcpContainerRuntimeStatus;
  mcpContainerRuntimeBusy: boolean;
  mcpContainerRuntimeLaunchBusy: boolean;
  mcpContainerRuntimeError?: string;
  mcpContainerRuntimeInstallProgress?: AmbientMcpContainerRuntimeManagedInstallProgress;
  mcpDefaultCapabilityInstallProgress?: AmbientMcpDefaultCapabilityInstallProgress;
  mcpContainerRuntimeInstallBusyLabel: (kind?: string) => string;
  diagnosticBusy: boolean;
  diagnosticStatus?: ApiKeyStatus;
  pluginAuthBusy?: string;
  pluginAuthStatus?: ApiKeyStatus;
  setPluginAuthStatus: (status?: ApiKeyStatus) => void;
  pluginAuthPending?: AmbientPluginAuthStartResult;
  setPluginAuthPending: (pending?: AmbientPluginAuthStartResult) => void;
  pluginAuthCode: string;
  setPluginAuthCode: (code: string) => void;
  googleIntegration?: FirstPartyGoogleIntegrationState;
  googleSetupAccountHint: string;
  setGoogleSetupAccountHint: (hint: string) => void;
  googleSetupBusy?: string;
  googleValidationFeedback?: GoogleWorkspaceValidationFeedback;
  pluginDependencyInstalling?: string;
  pluginDependencyStatus?: ApiKeyStatus;
  piPackageCatalog?: PiPackageCatalog;
  piPackageError?: string;
  piPackageInspecting: boolean;
  selectedPiPackageDetailId?: string;
  setSelectedPiPackageDetailId: (id?: string) => void;
  piPackageInstalling: boolean;
  piPackageUninstalling?: string;
  piPackageEnabling?: string;
  piExtensionSandboxCatalog?: PiExtensionSandboxCatalog;
  piExtensionSandboxInstalling: boolean;
  piExtensionSandboxFallback?: PiExtensionSandboxInstallPreview;
  piExtensionSandboxUninstalling?: string;
  piExtensionSandboxClearingHistory: boolean;
  piPrivilegedCatalog?: PiPrivilegedCatalog;
  piPrivilegedBusy?: string;
  piPrivilegedClearingHistory: boolean;
  piPrivilegedScan?: PiPrivilegedSecurityScan;
  piPrivilegedScanSource?: string;
  piPrivilegedScanning: boolean;
  piPrivilegedInstalling: boolean;
  piPackageSourceInput: string;
  setPiPackageSourceInput: (value: string) => void;
  piPackageInstallScope: PiPackageInstallScope;
  setPiPackageInstallScope: (scope: PiPackageInstallScope) => void;
  permissionAudit: PermissionAuditEntry[];
  loadPluginCatalog: () => MaybePromise;
  resumeFirstRunCapabilityOnboarding: () => void;
  inspectPluginMcp: () => MaybePromise;
  inspectPiPackages: () => MaybePromise;
  startFirstRunCapabilityOnboarding: () => MaybePromise;
  dismissFirstRunCapabilityOnboarding: () => void;
  completePluginAppAuth: () => MaybePromise;
  importCodexPlugin: (pluginId: string) => MaybePromise;
  refreshMcpContainerRuntimeStatus: (openWhenNeedsAction?: boolean, options?: { continueDefaultCapabilitySetup?: boolean }) => MaybePromise;
  setMcpContainerRuntimeModalOpen: (open: boolean) => void;
  onOpenMcpRuntimeSettings: () => void;
  exportDiagnostics: () => MaybePromise;
  launchMcpContainerRuntimeInstaller: (actionId?: string, mode?: "execute" | "dry-run") => MaybePromise;
  installMcpDefaultCapability: (capabilityId: AmbientMcpDefaultCapabilityInstallInput["capabilityId"]) => MaybePromise;
  loadManagedDevServers: () => MaybePromise;
  stopManagedDevServerProcess: (id: string) => MaybePromise;
  searchMcpRegistryServers: (refresh?: boolean) => MaybePromise;
  loadMcpInstalledServers: () => MaybePromise;
  acceptMcpToolDescriptorReview: (server: AmbientMcpInstalledServerSummary) => MaybePromise;
  uninstallMcpServer: (server: AmbientMcpInstalledServerSummary) => MaybePromise;
  describeMcpRegistryServer: (serverId: string, refresh?: boolean) => MaybePromise;
  installMcpRegistryServer: (serverId: string) => MaybePromise;
  revealGeneratedCapabilitySource: (path: string | undefined) => MaybePromise;
  setPluginTrusted: (pluginId: string, trusted: boolean) => MaybePromise;
  setPluginEnabled: (pluginId: string, enabled: boolean) => MaybePromise;
  uninstallCodexPlugin: (pluginId: string) => MaybePromise;
  startGeneratedCapabilityValidation: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  startGeneratedCapabilityUpdatePlan: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  startGeneratedCapabilityRemovalPlan: (packageName: string, generated: AmbientGeneratedCapabilitySummary | undefined) => MaybePromise;
  installCodexPluginDependencies: (pluginId: string) => MaybePromise;
  startPluginAppAuth: (connectorId: string, scopes?: string[]) => MaybePromise;
  installGoogleWorkspaceCli: () => MaybePromise;
  confirmGoogleWorkspaceAccount: (accountHint: string) => MaybePromise;
  startGoogleWorkspaceSetup: (command: "setup" | "login", accountHint?: string) => MaybePromise;
  importGoogleWorkspaceOAuthClient: (accountHint?: string) => MaybePromise;
  validateGoogleWorkspace: (accountHint?: string) => MaybePromise;
  cancelGoogleWorkspaceSetup: () => MaybePromise;
  testPluginAuthAccount: (accountId: string) => MaybePromise;
  disconnectGoogleWorkspace: (accountHint: string) => MaybePromise;
  disconnectPluginAuthAccount: (accountId: string) => MaybePromise;
  revokePluginAuthAccount: (accountId: string) => MaybePromise;
  addCodexMarketplace: () => MaybePromise;
  removeCodexMarketplace: (sourceId: string, source: string) => MaybePromise;
  loadCapabilityBuilderHistory: () => MaybePromise;
  startCapabilityBuilderHistoryPreview: (entry: CapabilityBuilderHistoryEntry) => MaybePromise;
  startCapabilityBuilderHistoryReregister: (entry: CapabilityBuilderHistoryEntry) => MaybePromise;
  startCapabilityBuilderHistoryRepairPlan: (entry: CapabilityBuilderHistoryEntry) => MaybePromise;
  installPiPackage: (source: string, scope?: PiPackageInstallScope) => MaybePromise;
  installPiExtensionSandboxPackage: (source: string) => MaybePromise;
  scanPiPrivilegedPackage: (source: string) => MaybePromise;
  installPiPrivilegedPackage: (source: string) => MaybePromise;
  uninstallPiPackage: (packageId: string) => MaybePromise;
  setPiPackageEnabled: (packageId: string, enabled: boolean) => MaybePromise;
  uninstallPiExtensionSandboxPackage: (packageId: string) => MaybePromise;
  clearPiExtensionSandboxHistory: () => MaybePromise;
  disablePiPrivilegedPackage: (packageId: string) => MaybePromise;
  uninstallPiPrivilegedPackage: (packageId: string) => MaybePromise;
  clearPiPrivilegedPackageHistory: () => MaybePromise;
  inspectAmbientPluginCapability: (capabilityId: string) => MaybePromise;
  restartPluginMcpRuntime: (key: string) => MaybePromise;
  stopPluginMcpRuntime: (key: string) => MaybePromise;
};

export function RightPanelPluginHost({
  InfoTooltip,
  state,
  running,
  voiceProviders,
  sttProviders,
  ambientPluginRegistry,
  pluginCatalog,
  hostedMarketplaceReport,
  pluginView,
  setPluginView,
  pluginSourceFilter,
  setPluginSourceFilter,
  pluginRuntimeFilter,
  setPluginRuntimeFilter,
  pluginCapabilityDiagnostics,
  pluginCapabilityDiagnosticsBusy,
  pluginCapabilityDiagnosticsError,
  capabilityBuilderHistory,
  capabilityBuilderHistoryLoading,
  capabilityBuilderHistoryError,
  capabilityBuilderHistoryPreviewStarting,
  capabilityBuilderHistoryRepairPlanning,
  capabilityBuilderHistoryReregisterStarting,
  generatedCapabilitySourceOpening,
  generatedCapabilityValidationStarting,
  generatedCapabilityUpdatePlanning,
  generatedCapabilityRemovalPlanning,
  selectedPluginDetailId,
  setSelectedPluginDetailId,
  setCapabilityBuilderLauncherOpen,
  firstRunCapabilityOnboardingDismissed,
  firstRunCapabilityOnboardingStarting,
  codexMarketplaceSourceInput,
  setCodexMarketplaceSourceInput,
  codexMarketplaceNameInput,
  setCodexMarketplaceNameInput,
  codexMarketplaceAllowExperimental,
  setCodexMarketplaceAllowExperimental,
  codexMarketplaceAdding,
  codexMarketplaceRemoving,
  pluginCatalogError,
  mcpInspection,
  mcpRuntimeSnapshots,
  mcpInspectionError,
  mcpRuntimeBusy,
  mcpInspecting,
  mcpServerQuery,
  setMcpServerQuery,
  mcpRegistryResults,
  mcpInstalledServers,
  mcpSelectedPreview,
  mcpServerBusy,
  mcpServerStatus,
  mcpServerError,
  managedDevServers,
  managedDevServerBusy,
  managedDevServerError,
  mcpContainerRuntimeStatus,
  mcpContainerRuntimeBusy,
  mcpContainerRuntimeLaunchBusy,
  mcpContainerRuntimeError,
  mcpContainerRuntimeInstallProgress,
  mcpDefaultCapabilityInstallProgress,
  mcpContainerRuntimeInstallBusyLabel,
  diagnosticBusy,
  diagnosticStatus,
  pluginAuthBusy,
  pluginAuthStatus,
  setPluginAuthStatus,
  pluginAuthPending,
  setPluginAuthPending,
  pluginAuthCode,
  setPluginAuthCode,
  googleIntegration,
  googleSetupAccountHint,
  setGoogleSetupAccountHint,
  googleSetupBusy,
  googleValidationFeedback,
  pluginDependencyInstalling,
  pluginDependencyStatus,
  piPackageCatalog,
  piPackageError,
  piPackageInspecting,
  selectedPiPackageDetailId,
  setSelectedPiPackageDetailId,
  piPackageInstalling,
  piPackageUninstalling,
  piPackageEnabling,
  piExtensionSandboxCatalog,
  piExtensionSandboxInstalling,
  piExtensionSandboxFallback,
  piExtensionSandboxUninstalling,
  piExtensionSandboxClearingHistory,
  piPrivilegedCatalog,
  piPrivilegedBusy,
  piPrivilegedClearingHistory,
  piPrivilegedScan,
  piPrivilegedScanSource,
  piPrivilegedScanning,
  piPrivilegedInstalling,
  piPackageSourceInput,
  setPiPackageSourceInput,
  piPackageInstallScope,
  setPiPackageInstallScope,
  permissionAudit,
  loadPluginCatalog,
  resumeFirstRunCapabilityOnboarding,
  inspectPluginMcp,
  inspectPiPackages,
  startFirstRunCapabilityOnboarding,
  dismissFirstRunCapabilityOnboarding,
  completePluginAppAuth,
  importCodexPlugin,
  refreshMcpContainerRuntimeStatus,
  setMcpContainerRuntimeModalOpen,
  onOpenMcpRuntimeSettings,
  exportDiagnostics,
  launchMcpContainerRuntimeInstaller,
  installMcpDefaultCapability,
  loadManagedDevServers,
  stopManagedDevServerProcess,
  searchMcpRegistryServers,
  loadMcpInstalledServers,
  acceptMcpToolDescriptorReview,
  uninstallMcpServer,
  describeMcpRegistryServer,
  installMcpRegistryServer,
  revealGeneratedCapabilitySource,
  setPluginTrusted,
  setPluginEnabled,
  uninstallCodexPlugin,
  startGeneratedCapabilityValidation,
  startGeneratedCapabilityUpdatePlan,
  startGeneratedCapabilityRemovalPlan,
  installCodexPluginDependencies,
  startPluginAppAuth,
  installGoogleWorkspaceCli,
  confirmGoogleWorkspaceAccount,
  startGoogleWorkspaceSetup,
  importGoogleWorkspaceOAuthClient,
  validateGoogleWorkspace,
  cancelGoogleWorkspaceSetup,
  testPluginAuthAccount,
  disconnectGoogleWorkspace,
  disconnectPluginAuthAccount,
  revokePluginAuthAccount,
  addCodexMarketplace,
  removeCodexMarketplace,
  loadCapabilityBuilderHistory,
  startCapabilityBuilderHistoryPreview,
  startCapabilityBuilderHistoryReregister,
  startCapabilityBuilderHistoryRepairPlan,
  installPiPackage,
  installPiExtensionSandboxPackage,
  scanPiPrivilegedPackage,
  installPiPrivilegedPackage,
  uninstallPiPackage,
  setPiPackageEnabled,
  uninstallPiExtensionSandboxPackage,
  clearPiExtensionSandboxHistory,
  disablePiPrivilegedPackage,
  uninstallPiPrivilegedPackage,
  clearPiPrivilegedPackageHistory,
  inspectAmbientPluginCapability,
  restartPluginMcpRuntime,
  stopPluginMcpRuntime,
}: RightPanelPluginHostProps) {
    const registry = ambientPluginRegistry;
    const installedPlugins = registry?.plugins.filter((plugin) => plugin.installState !== "importable") ?? [];
    const importablePlugins = registry?.plugins.filter((plugin) => plugin.installState === "importable") ?? [];
    const sourceOptions = pluginSourceFilters.filter(
      (source) =>
        source === "all" ||
        Boolean(
          registry?.plugins.some((plugin) => plugin.sourceKind === source) ||
            registry?.capabilities.some((capability) => capability.sourceKind === source),
        ),
    );
    const filteredInstalledPlugins = filterAmbientPluginsBySource(installedPlugins, pluginSourceFilter);
    const filteredCapabilities = registry
      ? filterAmbientCapabilities(registry.capabilities, { source: pluginSourceFilter, runtime: pluginRuntimeFilter })
      : [];
    const pluginAuthCompleteAction = pluginAuthCompleteActionState(
      Boolean(pluginAuthPending),
      pluginAuthCode,
      pluginAuthBusy === `complete:${pluginAuthPending?.state ?? ""}`,
    );
    const availableCapabilities = registry?.capabilities.filter((capability) => capability.availability === "available").length ?? 0;
    const authRequiredCapabilities = registry?.capabilities.filter((capability) => capability.availability === "auth-required").length ?? 0;
    const trustRequiredCapabilities = registry?.capabilities.filter((capability) => capability.availability === "untrusted").length ?? 0;
    const errorCapabilities = registry?.capabilities.filter((capability) => capability.availability === "error").length ?? 0;
    const noConfiguredCoreCapabilities = Boolean(registry) && availableCapabilities === 0 && voiceProviders.length === 0 && sttProviders.length === 0 && !state.settings.search.webSearch;
    const showFirstRunCapabilityOnboarding = noConfiguredCoreCapabilities && !firstRunCapabilityOnboardingDismissed;
    const codexMarketplaceSources: CodexMarketplaceSourceSummary[] =
      pluginCatalog?.marketplaceSources ??
      registry?.sources.map((source): CodexMarketplaceSourceSummary => ({ id: source, label: source, source, kind: "workspace", removable: false })) ??
      [];
    const mcpContainerRuntimeReady = mcpContainerRuntimeStatus?.status === "ready";
    const mcpContainerRuntimeToneClass = mcpContainerRuntimeTone(mcpContainerRuntimeStatus?.status);
    const mcpContainerRuntimeLabel = mcpContainerRuntimeStatusLabel(mcpContainerRuntimeStatus?.status);
    const mcpContainerRuntimeDiagnosticsAction = mcpContainerRuntimeDiagnosticsActionState(mcpContainerRuntimeStatus, {
      error: mcpContainerRuntimeError,
      busy: diagnosticBusy,
    });
    const mcpContainerRuntimeInstallProgressStatusView = mcpContainerRuntimeInstallProgressStatus(mcpContainerRuntimeInstallProgress);
    const mcpDefaultCapabilityInstallProgressStatusView = mcpDefaultCapabilityInstallProgressStatus(mcpDefaultCapabilityInstallProgress);
    const mcpContainerRuntimeSetupResume = mcpContainerRuntimeSetupResumeRows(mcpContainerRuntimeStatus);
    return (
      <div className="panel-stack">
        <div className="panel-action-row">
          <button type="button" className="panel-button icon-panel-button" onClick={() => void loadPluginCatalog()}>
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            type="button"
            className="panel-button icon-only-panel-button"
            disabled={running}
            onClick={() => setCapabilityBuilderLauncherOpen(true)}
            title={running ? "Wait for the current run to finish before starting Capability Builder." : "Add capability"}
            aria-label="Add capability"
          >
            <span className="plug-zap-plus-icon" aria-hidden="true">
              <Plug size={14} />
              <Zap size={10} />
              <Plus size={9} />
            </span>
          </button>
          {firstRunCapabilityOnboardingDismissed && (
            <button type="button" className="panel-button mini" onClick={resumeFirstRunCapabilityOnboarding}>
              Resume setup
            </button>
          )}
          <button
            type="button"
            className="panel-button icon-panel-button"
            disabled={!pluginCatalog || mcpInspecting}
            onClick={() => void inspectPluginMcp()}
          >
            <Plug size={14} />
            {mcpInspecting ? "Inspecting" : "Inspect MCP"}
          </button>
          <button
            type="button"
            className="panel-button icon-panel-button"
            disabled={piPackageInspecting}
            onClick={() => void inspectPiPackages()}
            title="Inspect Pi package metadata without installing or running package code."
          >
            <Package size={14} />
            {piPackageInspecting ? "Inspecting" : "Inspect Pi packages"}
          </button>
        </div>
        {mcpInspectionError && <p className="panel-note">{mcpInspectionError}</p>}
        {piPackageError && <p className="panel-note">{piPackageError}</p>}
        {showFirstRunCapabilityOnboarding && (
          <section className="plugin-auth-complete">
            <div>
              <strong>Set up core capabilities</strong>
              <span>Start a skippable chat-first setup for voice, search/web, remote access, browser automation, and document/media conversion.</span>
            </div>
            <button
              type="button"
              className="panel-button mini"
              disabled={running || firstRunCapabilityOnboardingStarting}
              onClick={() => void startFirstRunCapabilityOnboarding()}
            >
              {firstRunCapabilityOnboardingStarting ? "Starting" : "Start setup"}
            </button>
            <button type="button" className="panel-button mini" onClick={dismissFirstRunCapabilityOnboarding}>
              Skip for now
            </button>
          </section>
        )}
        {pluginAuthStatus && <p className={`panel-status ${pluginAuthStatus.kind}`}>{pluginAuthStatus.message}</p>}
        {pluginAuthPending && (
          <section className="plugin-auth-complete">
            <div>
              <strong>{pluginAuthPending.providerId === "google.workspace" ? "Finish Google Auth" : "Finish Plugin App Auth"}</strong>
              <span>{pluginAuthPending.providerId} expires {formatTimelineTime(pluginAuthPending.expiresAt)}</span>
            </div>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="panel-input"
              value={pluginAuthCode}
              placeholder="Authorization code"
              onChange={(event) => setPluginAuthCode(event.target.value)}
            />
            <button
              type="button"
              className="panel-button mini"
              disabled={pluginAuthCompleteAction.disabled}
              title={pluginAuthCompleteAction.title}
              onClick={() => void completePluginAppAuth()}
            >
              {pluginAuthCompleteAction.label}
            </button>
            <button
              type="button"
              className="panel-button mini"
              disabled={Boolean(pluginAuthBusy)}
              onClick={() => {
                setPluginAuthPending(undefined);
                setPluginAuthCode("");
              }}
            >
              Cancel
            </button>
          </section>
        )}
        {pluginDependencyStatus && <p className={`panel-status ${pluginDependencyStatus.kind}`}>{pluginDependencyStatus.message}</p>}
        {mcpServerStatus && <p className={`panel-status ${mcpServerStatus.kind}`}>{mcpServerStatus.message}</p>}
        {mcpServerError && <p className="panel-status error">{mcpServerError}</p>}
        {pluginCapabilityDiagnosticsError && <p className="panel-note">{pluginCapabilityDiagnosticsError}</p>}
        {pluginCatalogError ? (
          <p className="panel-note">{pluginCatalogError}</p>
        ) : registry ? (
          <div className="plugin-list">
            <RightPanelPluginOverviewHero
              InfoTooltip={InfoTooltip}
              pluginCount={registry.plugins.length}
              availableCapabilityCount={availableCapabilities}
              trustRequiredCapabilityCount={trustRequiredCapabilities}
              attentionCapabilityCount={authRequiredCapabilities + errorCapabilities}
            />

            <div className="panel-tabs plugin-tabs" role="tablist" aria-label="Plugin views">
              {pluginPanelViews.map((view) => (
                <button
                  type="button"
                  key={view}
                  className={[pluginView === view ? "selected" : "", view === "capabilities" ? "install-capabilities-tab" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  role="tab"
                  aria-selected={pluginView === view}
                  onClick={() => setPluginView(view)}
                >
                  {pluginPanelViewLabel(view)}
                </button>
              ))}
            </div>

            {(pluginView === "installed" || pluginView === "capabilities") && (
              <div className="plugin-filter-row" aria-label="Plugin filters">
                <label>
                  <span>Source</span>
                  <select
                    value={pluginSourceFilter}
                    onChange={(event) => setPluginSourceFilter(event.target.value as AmbientPluginSourceFilter)}
                  >
                    {sourceOptions.map((source) => (
                      <option key={source} value={source}>
                        {source === "all" ? "All sources" : formatAmbientPluginSourceKind(source as AmbientPluginSourceKind)}
                      </option>
                    ))}
                  </select>
                </label>
                {pluginView === "capabilities" && (
                  <label>
                    <span>Runtime</span>
                    <select
                      value={pluginRuntimeFilter}
                      onChange={(event) => setPluginRuntimeFilter(event.target.value as AmbientPluginRuntimeFilter)}
                    >
                      {pluginRuntimeFilters.map((runtime) => (
                        <option key={runtime} value={runtime}>
                          {runtime === "all" ? "All runtimes" : formatTaskState(runtime as AmbientPluginRuntime)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            {pluginView === "home" && (
              <RightPanelPluginHomePane
                permissionMode={state.settings.permissionMode}
                installedOrDiscoveredPluginCount={installedPlugins.length}
                importablePluginCount={importablePlugins.length}
                capabilityCount={registry.capabilities.length}
                sourceCount={registry.sources.length}
                trustRequiredCapabilityCount={trustRequiredCapabilities}
                authRequiredCapabilityCount={authRequiredCapabilities}
                errorCapabilityCount={errorCapabilities}
              />
            )}

            {pluginView === "mcp" && (
              <div className="plugin-list">
                <RightPanelPluginMcpRuntime
                  runtimeStatus={mcpContainerRuntimeStatus}
                  runtimeToneClass={mcpContainerRuntimeToneClass}
                  runtimeLabel={mcpContainerRuntimeLabel}
                  runtimeBusy={mcpContainerRuntimeBusy}
                  runtimeLaunchBusy={mcpContainerRuntimeLaunchBusy}
                  runtimeError={mcpContainerRuntimeError}
                  diagnosticsAction={mcpContainerRuntimeDiagnosticsAction}
                  diagnosticStatus={diagnosticStatus}
                  installProgressStatus={mcpContainerRuntimeInstallProgressStatusView}
                  defaultCapabilityInstallProgressStatus={mcpDefaultCapabilityInstallProgressStatusView}
                  setupResumeRows={mcpContainerRuntimeSetupResume}
                  mcpServerBusy={mcpServerBusy}
                  managedDevServers={managedDevServers}
                  managedDevServerBusy={managedDevServerBusy}
                  managedDevServerError={managedDevServerError}
                  installBusyLabel={mcpContainerRuntimeInstallBusyLabel}
                  onRefreshRuntime={() => void refreshMcpContainerRuntimeStatus(false, { continueDefaultCapabilitySetup: true })}
                  onOpenRuntimeReview={() => setMcpContainerRuntimeModalOpen(true)}
                  onOpenRuntimeSettings={onOpenMcpRuntimeSettings}
                  onExportDiagnostics={() => void exportDiagnostics()}
                  onLaunchInstaller={() => void launchMcpContainerRuntimeInstaller()}
                  onReviewInstallCommandPlan={() => void launchMcpContainerRuntimeInstaller(undefined, "dry-run")}
                  onInstallDefaultCapability={(capabilityId) => void installMcpDefaultCapability(capabilityId)}
                  onLoadManagedDevServers={() => void loadManagedDevServers()}
                  onStopManagedDevServer={(id) => void stopManagedDevServerProcess(id)}
                />

                <RightPanelPluginMcpServers
                  query={mcpServerQuery}
                  busyKey={mcpServerBusy}
                  installedServers={mcpInstalledServers}
                  registryResults={mcpRegistryResults}
                  selectedPreview={mcpSelectedPreview}
                  runtimeReady={mcpContainerRuntimeReady}
                  runtimeBusy={mcpContainerRuntimeBusy}
                  onQueryChange={setMcpServerQuery}
                  onSearchRegistry={(refresh) => void searchMcpRegistryServers(refresh)}
                  onLoadInstalledServers={() => void loadMcpInstalledServers()}
                  onAcceptToolReview={(server) => void acceptMcpToolDescriptorReview(server)}
                  onUninstallServer={(server) => void uninstallMcpServer(server)}
                  onDescribeServer={(serverId) => void describeMcpRegistryServer(serverId)}
                  onInstallServer={(serverId) => void installMcpRegistryServer(serverId)}
                />
              </div>
            )}

            {pluginView === "marketplace" && (
              <RightPanelPluginMarketplacePane
                marketplaceSources={codexMarketplaceSources}
                importCandidates={pluginCatalog?.importCandidates ?? []}
                importCodexPlugin={importCodexPlugin}
              />
            )}

            {pluginView === "installed" && (
              <RightPanelPluginInstalledPane
                plugins={filteredInstalledPlugins}
                capabilities={registry.capabilities}
                codexPlugins={pluginCatalog?.plugins ?? []}
                selectedPluginDetailId={selectedPluginDetailId}
                setSelectedPluginDetailId={setSelectedPluginDetailId}
                running={running}
                generatedCapabilitySourceOpening={generatedCapabilitySourceOpening}
                generatedCapabilityValidationStarting={generatedCapabilityValidationStarting}
                generatedCapabilityUpdatePlanning={generatedCapabilityUpdatePlanning}
                generatedCapabilityRemovalPlanning={generatedCapabilityRemovalPlanning}
                pluginDependencyInstalling={pluginDependencyInstalling}
                revealGeneratedCapabilitySource={revealGeneratedCapabilitySource}
                setPluginTrusted={setPluginTrusted}
                setPluginEnabled={setPluginEnabled}
                uninstallCodexPlugin={uninstallCodexPlugin}
                startGeneratedCapabilityValidation={startGeneratedCapabilityValidation}
                startGeneratedCapabilityUpdatePlan={startGeneratedCapabilityUpdatePlan}
                startGeneratedCapabilityRemovalPlan={startGeneratedCapabilityRemovalPlan}
                installCodexPluginDependencies={installCodexPluginDependencies}
              />
            )}

            {pluginView === "capabilities" && (
              <RightPanelPluginCapabilitiesPane
                capabilities={filteredCapabilities}
                running={running}
                pluginCapabilityDiagnostics={pluginCapabilityDiagnostics}
                pluginCapabilityDiagnosticsBusy={pluginCapabilityDiagnosticsBusy}
                generatedCapabilitySourceOpening={generatedCapabilitySourceOpening}
                generatedCapabilityValidationStarting={generatedCapabilityValidationStarting}
                generatedCapabilityUpdatePlanning={generatedCapabilityUpdatePlanning}
                generatedCapabilityRemovalPlanning={generatedCapabilityRemovalPlanning}
                pluginAuthBusy={pluginAuthBusy}
                googleIntegration={googleIntegration}
                googleSetupAccountHint={googleSetupAccountHint}
                setGoogleSetupAccountHint={setGoogleSetupAccountHint}
                googleSetupBusy={googleSetupBusy}
                googleValidationFeedback={googleValidationFeedback}
                setPluginAuthStatus={setPluginAuthStatus}
                startPluginAppAuth={startPluginAppAuth}
                installGoogleWorkspaceCli={installGoogleWorkspaceCli}
                confirmGoogleWorkspaceAccount={confirmGoogleWorkspaceAccount}
                startGoogleWorkspaceSetup={startGoogleWorkspaceSetup}
                importGoogleWorkspaceOAuthClient={importGoogleWorkspaceOAuthClient}
                validateGoogleWorkspace={validateGoogleWorkspace}
                cancelGoogleWorkspaceSetup={cancelGoogleWorkspaceSetup}
                testPluginAuthAccount={testPluginAuthAccount}
                disconnectGoogleWorkspace={disconnectGoogleWorkspace}
                disconnectPluginAuthAccount={disconnectPluginAuthAccount}
                revokePluginAuthAccount={revokePluginAuthAccount}
                revealGeneratedCapabilitySource={revealGeneratedCapabilitySource}
                startGeneratedCapabilityValidation={startGeneratedCapabilityValidation}
                startGeneratedCapabilityUpdatePlan={startGeneratedCapabilityUpdatePlan}
                startGeneratedCapabilityRemovalPlan={startGeneratedCapabilityRemovalPlan}
                inspectAmbientPluginCapability={inspectAmbientPluginCapability}
              />
            )}

            {pluginView === "sources" && (
              <RightPanelPluginSourcesPane
                running={running}
                capabilityBuilderHistory={capabilityBuilderHistory}
                capabilityBuilderHistoryLoading={capabilityBuilderHistoryLoading}
                capabilityBuilderHistoryError={capabilityBuilderHistoryError}
                capabilityBuilderHistoryPreviewStarting={capabilityBuilderHistoryPreviewStarting}
                capabilityBuilderHistoryRepairPlanning={capabilityBuilderHistoryRepairPlanning}
                capabilityBuilderHistoryReregisterStarting={capabilityBuilderHistoryReregisterStarting}
                generatedCapabilitySourceOpening={generatedCapabilitySourceOpening}
                generatedCapabilityUpdatePlanning={generatedCapabilityUpdatePlanning}
                generatedCapabilityRemovalPlanning={generatedCapabilityRemovalPlanning}
                codexMarketplaceSources={codexMarketplaceSources}
                codexMarketplaceSourceInput={codexMarketplaceSourceInput}
                setCodexMarketplaceSourceInput={setCodexMarketplaceSourceInput}
                codexMarketplaceNameInput={codexMarketplaceNameInput}
                setCodexMarketplaceNameInput={setCodexMarketplaceNameInput}
                codexMarketplaceAllowExperimental={codexMarketplaceAllowExperimental}
                setCodexMarketplaceAllowExperimental={setCodexMarketplaceAllowExperimental}
                codexMarketplaceAdding={codexMarketplaceAdding}
                codexMarketplaceRemoving={codexMarketplaceRemoving}
                hostedMarketplaceReport={hostedMarketplaceReport}
                piPackageCatalog={piPackageCatalog}
                selectedPiPackageDetailId={selectedPiPackageDetailId}
                setSelectedPiPackageDetailId={setSelectedPiPackageDetailId}
                piPackageInstalling={piPackageInstalling}
                piPackageUninstalling={piPackageUninstalling}
                piPackageEnabling={piPackageEnabling}
                piExtensionSandboxCatalog={piExtensionSandboxCatalog}
                piExtensionSandboxInstalling={piExtensionSandboxInstalling}
                piExtensionSandboxFallback={piExtensionSandboxFallback}
                piExtensionSandboxUninstalling={piExtensionSandboxUninstalling}
                piExtensionSandboxClearingHistory={piExtensionSandboxClearingHistory}
                piPrivilegedCatalog={piPrivilegedCatalog}
                piPrivilegedBusy={piPrivilegedBusy}
                piPrivilegedClearingHistory={piPrivilegedClearingHistory}
                piPrivilegedScan={piPrivilegedScan}
                piPrivilegedScanSource={piPrivilegedScanSource}
                piPrivilegedScanning={piPrivilegedScanning}
                piPrivilegedInstalling={piPrivilegedInstalling}
                piPackageSourceInput={piPackageSourceInput}
                setPiPackageSourceInput={setPiPackageSourceInput}
                piPackageInstallScope={piPackageInstallScope}
                setPiPackageInstallScope={setPiPackageInstallScope}
                permissionAudit={permissionAudit}
                addCodexMarketplace={addCodexMarketplace}
                removeCodexMarketplace={removeCodexMarketplace}
                loadCapabilityBuilderHistory={loadCapabilityBuilderHistory}
                startCapabilityBuilderHistoryPreview={startCapabilityBuilderHistoryPreview}
                startCapabilityBuilderHistoryReregister={startCapabilityBuilderHistoryReregister}
                startCapabilityBuilderHistoryRepairPlan={startCapabilityBuilderHistoryRepairPlan}
                revealGeneratedCapabilitySource={revealGeneratedCapabilitySource}
                startGeneratedCapabilityUpdatePlan={startGeneratedCapabilityUpdatePlan}
                startGeneratedCapabilityRemovalPlan={startGeneratedCapabilityRemovalPlan}
                installPiPackage={installPiPackage}
                installPiExtensionSandboxPackage={installPiExtensionSandboxPackage}
                scanPiPrivilegedPackage={scanPiPrivilegedPackage}
                installPiPrivilegedPackage={installPiPrivilegedPackage}
                uninstallPiPackage={uninstallPiPackage}
                setPiPackageEnabled={setPiPackageEnabled}
                uninstallPiExtensionSandboxPackage={uninstallPiExtensionSandboxPackage}
                clearPiExtensionSandboxHistory={clearPiExtensionSandboxHistory}
                disablePiPrivilegedPackage={disablePiPrivilegedPackage}
                uninstallPiPrivilegedPackage={uninstallPiPrivilegedPackage}
                clearPiPrivilegedPackageHistory={clearPiPrivilegedPackageHistory}
              />
            )}

            {pluginView === "diagnostics" && (
              <RightPanelPluginDiagnostics
                registry={registry}
                mcpRuntimeSnapshots={mcpRuntimeSnapshots}
                mcpRuntimeBusy={mcpRuntimeBusy}
                mcpInspection={mcpInspection}
                onRestartMcpRuntime={(key) => void restartPluginMcpRuntime(key)}
                onStopMcpRuntime={(key) => void stopPluginMcpRuntime(key)}
              />
            )}
          </div>
        ) : (
          <p className="panel-note">Loading plugins...</p>
        )}
      </div>
    );

}
