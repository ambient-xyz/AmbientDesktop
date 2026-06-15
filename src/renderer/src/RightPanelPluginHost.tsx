import { AlertCircle, CheckCircle2, FileText, FolderOpen, Info, LoaderCircle, Package, Pencil, Plug, Plus, RefreshCw, Trash2, Zap } from "lucide-react";
import { FormEvent, ReactNode, memo, useEffect, useState, type ComponentType } from "react";
import type {
  AmbientGeneratedCapabilitySummary,
  AmbientMcpContainerRuntimeManagedInstallProgress,
  AmbientMcpDefaultCapabilityInstallProgress,
  AmbientMcpContainerRuntimeStatus,
  AmbientMcpDefaultCapabilityInstallInput,
  AmbientMcpInstallPreview,
  AmbientMcpInstalledServerSummary,
  AmbientMcpServerSearchResult,
  AmbientPluginAuthStartResult,
  AmbientPluginCapabilityDiagnostics,
  AmbientPluginRegistry,
  AmbientPluginRuntime,
  AmbientPluginSourceKind,
  CapabilityBuilderHistoryEntry,
  CapabilityBuilderHistoryResult,
  CodexHostedMarketplaceReport,
  CodexMarketplaceSourceSummary,
  CodexPluginCatalog,
  CodexPluginMcpInspectionCatalog,
  CodexPluginSummary,
  DesktopState,
  FirstPartyGoogleIntegrationState,
  ManagedDevServerSummary,
  PermissionAuditEntry,
  PiExtensionSandboxCatalog,
  PiExtensionSandboxInstallPreview,
  PiPackageCatalog,
  PiPackageInstallScope,
  PiPrivilegedCatalog,
  PiPrivilegedSecurityScan,
  PluginMcpRuntimeSnapshot,
  SttProviderCandidate,
  VoiceProviderCandidate,
} from "../../shared/types";
import {
  capabilityBuilderHistoryPreviewActionState,
  capabilityBuilderHistoryRepairPlanActionState,
  capabilityBuilderHistoryReregisterActionState,
  capabilityBuilderHistorySourceActionState,
  capabilityDiagnosticsActionState,
  codexImportActionState,
  codexMarketplaceAddActionState,
  codexMarketplaceRemoveActionState,
  filterAmbientCapabilities,
  filterAmbientPluginsBySource,
  formatAmbientAvailability,
  formatAmbientCapabilityKind,
  formatAmbientPluginSourceKind,
  formatAmbientRuntimeSupport,
  generatedCapabilityRemovalPlanActionState,
  generatedCapabilitySummaryFromHistoryEntry,
  generatedCapabilitySourceActionState,
  generatedCapabilityUpdatePlanActionState,
  generatedCapabilityValidationActionState,
  googleWorkspaceAccountRows,
  googleWorkspaceActionState,
  googleWorkspaceConnectorLabel,
  googleWorkspaceStatusItems,
  googleWorkspaceValidationButtonView,
  googleWorkspaceValidationFeedbackForAccount,
  groupCodexImportCandidates,
  mcpContainerRuntimeDiagnosticsActionState,
  mcpContainerRuntimeSetupResumeRows,
  mcpContainerRuntimeStatusLabel,
  mcpContainerRuntimeTone,
  piExtensionSandboxUninstallActionState,
  piPackageEnableActionState,
  piPackageInstallActionState,
  piPackageUninstallActionState,
  piPrivilegedDisableActionState,
  piPrivilegedUninstallActionState,
  pluginAuthCompleteActionState,
  pluginDetailsActionState,
  type AmbientPluginRuntimeFilter,
  type AmbientPluginSourceFilter,
  type GoogleWorkspaceValidationFeedback,
} from "./pluginUiModel";
import {
  PiPrivilegedPackageDetailPanel,
  PiSandboxPackageDetailPanel,
  formatCodexMarketplaceSignatureStatus,
  formatCodexMarketplaceSourceKind,
  formatCodexPluginSourceKind,
  formatPiDependencyStatus,
  formatPiResourceCounts,
  formatPluginCompatibility,
  formatTaskState,
  piPackageAuditEntries,
} from "./RightPanelDetailPanels";
import { RightPanelPluginDiagnostics } from "./RightPanelPluginDiagnostics";
import { RightPanelPluginMcpRuntime } from "./RightPanelPluginMcpRuntime";
import { RightPanelPluginMcpServers } from "./RightPanelPluginMcpServers";
import { formatTimelineTime, type ApiKeyStatus } from "./RightPanelSettingsRuntime";

type MaybePromise<T = unknown> = T | Promise<T>;

type InfoTooltipProps = {
  label?: string;
  text: string;
  className?: string;
};

type PanelActionState = {
  visible: boolean;
  disabled: boolean;
  title?: string;
  label: string;
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

const GoogleSetupAccountControl = memo(function GoogleSetupAccountControl({
  accountHint,
  placeholder,
  disabled,
  busy,
  onConfirm,
}: {
  accountHint: string;
  placeholder: string;
  disabled: boolean;
  busy: boolean;
  onConfirm: (accountHint: string) => void;
}) {
  const [draft, setDraft] = useState(accountHint);

  useEffect(() => {
    setDraft(accountHint);
  }, [accountHint]);

  const trimmed = draft.trim();

  function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !trimmed) return;
    onConfirm(trimmed);
  }

  return (
    <form className="google-setup-account-control" onSubmit={submitAccount}>
      <input
        type="text"
        className="panel-input"
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button
        type="submit"
        className="panel-button mini primary"
        disabled={disabled || !trimmed}
        title="Confirm this Google account and continue setup."
      >
        {busy ? "Working" : "OK"}
      </button>
    </form>
  );
});

function GoogleWorkspaceValidationButtonIcon({ icon }: { icon: "none" | "spinner" | "success" | "error" }) {
  if (icon === "spinner") return <LoaderCircle size={13} className="spin" />;
  if (icon === "success") return <CheckCircle2 size={13} />;
  if (icon === "error") return <AlertCircle size={13} />;
  return null;
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
    const generatedCapabilityHistoryEntries = capabilityBuilderHistory?.entries ?? [];
    const generatedCapabilityHistoryMissingInstalled = generatedCapabilityHistoryEntries.filter((entry) => !entry.installedPresent);
    const codexMarketplaceAddAction = codexMarketplaceAddActionState(
      codexMarketplaceSourceInput,
      codexMarketplaceAdding,
      codexMarketplaceAllowExperimental,
    );
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
    const codexPluginsById = new Map((pluginCatalog?.plugins ?? []).map((plugin) => [plugin.id, plugin]));
    const codexMarketplaceSources: CodexMarketplaceSourceSummary[] =
      pluginCatalog?.marketplaceSources ??
      registry?.sources.map((source): CodexMarketplaceSourceSummary => ({ id: source, label: source, source, kind: "workspace", removable: false })) ??
      [];
    const codexCandidateGroups = groupCodexImportCandidates(pluginCatalog?.importCandidates ?? []);
    const curatedMarketplaceSources = codexMarketplaceSources.filter((source) => source.kind === "ambient-curated");
    const googleCoreScopes = [
      "openid",
      "email",
      "profile",
      "gmail.readonly",
      "gmail.compose",
      "calendar.readonly",
      "calendar.events",
      "drive.readonly",
      "drive.file",
    ];
    const googlePrimaryConnector = googleIntegration?.connectors[0];
    const googleAccounts = googleWorkspaceAccountRows(googleIntegration?.connectors ?? [], formatTimelineTime);
    const googleHasMultipleAccounts = googleAccounts.length > 1;
    const googleSelectedAccountHint = googleSetupAccountHint.trim() || googleIntegration?.setup?.accountHint?.trim() || "";
    const googleSelectedAccount = googleSelectedAccountHint
      ? googleAccounts.find(
          (account) =>
            account.accountId === googleSelectedAccountHint ||
            account.email === googleSelectedAccountHint ||
            account.label === googleSelectedAccountHint,
        )
      : googleAccounts.length === 1
        ? googleAccounts[0]
        : undefined;
    const googleSelectedValidationFeedback = googleWorkspaceValidationFeedbackForAccount(
      googleValidationFeedback,
      googleSelectedAccount?.accountId ?? (googleSelectedAccountHint || "default"),
    );
    const googleSelectedValidateButton = googleWorkspaceValidationButtonView("Validate", googleSelectedValidationFeedback);
    const googleUsesGws = googleIntegration?.authMode === "gws";
    const googleInstallRunning = googleIntegration?.install?.status === "running";
    const googleSetupRunning = googleIntegration?.setup?.status === "running" || googleIntegration?.setup?.status === "validating";
    const googleNeedsOAuthClientConfig = googleIntegration?.setup?.requiredAction === "oauth_client_config";
    const googleOAuthClientConfigUrl = googleIntegration?.setup?.oauthClientConfigUrl;
    const googleInstallAction = googleWorkspaceActionState(googleIntegration, "install", googleSetupBusy);
    const googleConnectAction = googleWorkspaceActionState(googleIntegration, "connect", googleSetupBusy);
    const googleRepairAction = googleWorkspaceActionState(googleIntegration, "repair", googleSetupBusy);
    const googleValidateAction = googleWorkspaceActionState(googleIntegration, "validate", googleSetupBusy);
    const googleCancelAction = googleWorkspaceActionState(googleIntegration, "cancel", googleSetupBusy);
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
    const googleAccountAvailable = googleAccounts.some((account) => account.status === "available");
    const googleSelectedAccountAvailable = googleSelectedAccount?.status === "available" || (!googleSelectedAccountHint && googleAccountAvailable);
    const googleOAuthClientImported =
      googleIntegration?.setup?.status === "completed" && googleIntegration.setup.command === "setup" && !googleNeedsOAuthClientConfig;
    const googleOAuthClientConfigured = Boolean(
      googleIntegration?.setup?.oauthClientConfigured ||
        googleOAuthClientImported ||
        googleSelectedAccountAvailable,
    );
    const googleConfiguredNotAuthenticated = googleOAuthClientConfigured && !googleSelectedAccountAvailable;
    const googleSetupAccountControlDisabled = googleSetupRunning || googleInstallRunning || Boolean(googleSetupBusy);
    const googleConnectDisabled = googleConnectAction.disabled || !googleOAuthClientConfigured;
    const googleConnectTitle = !googleOAuthClientConfigured
      ? "Create or import a Google Desktop OAuth client JSON before connecting this account."
      : googleConnectAction.title;
    const googleValidateDisabled = googleValidateAction.disabled || (!googleSelectedAccount && googleAccounts.length === 0);
    const googleValidateTitle = !googleSelectedAccount && googleAccounts.length === 0
      ? "Connect a Google account before validating connectors."
      : googleValidateAction.title;
    const googleSetupGuideVisible = googleUsesGws && (
      googleNeedsOAuthClientConfig ||
      googleOAuthClientImported ||
      googleConfiguredNotAuthenticated ||
      googleAccounts.length === 0 ||
      !googleAccountAvailable ||
      googleSetupRunning
    );
    const renderCodexImportCandidate = (plugin: CodexPluginSummary): ReactNode => {
      const importAction = codexImportActionState(plugin);
      const sourceDetails = [
        plugin.rootPath,
        plugin.sourceUrl ? `url: ${plugin.sourceUrl}` : undefined,
        plugin.sourcePath ? `path: ${plugin.sourcePath}` : undefined,
        plugin.sourceRef ? `ref: ${plugin.sourceRef}` : undefined,
        plugin.sourceSha ? `sha: ${plugin.sourceSha}` : undefined,
        plugin.sourceChecksum ? `checksum: ${plugin.sourceChecksum}` : undefined,
        plugin.sourceBundleChecksum ? `bundle checksum: ${plugin.sourceBundleChecksum}` : undefined,
        plugin.capabilitySummary?.length ? `capabilities: ${plugin.capabilitySummary.join(", ")}` : undefined,
      ].filter((line): line is string => Boolean(line)).join("\n");
      return (
        <section className="plugin-row plugin-import-row" key={plugin.id}>
          <div className="plugin-row-header">
            <strong>{plugin.displayName ?? plugin.name}</strong>
            <div className="plugin-row-actions">
              <button
                type="button"
                className="panel-button mini"
                disabled={importAction.disabled}
                title={importAction.title}
                onClick={() => void importCodexPlugin(plugin.id)}
              >
                {importAction.label}
              </button>
              <span>{plugin.version}</span>
            </div>
          </div>
          {plugin.description && <p>{plugin.description}</p>}
          <div className="plugin-badges">
            <span>{plugin.marketplaceName}</span>
            <span className={`plugin-tier ${plugin.compatibilityTier}`}>{formatPluginCompatibility(plugin.compatibilityTier)}</span>
            <span>{formatCodexPluginSourceKind(plugin)}</span>
            {plugin.updateAvailable && <span>Update available</span>}
            {plugin.authPolicy && <span>Auth {plugin.authPolicy}</span>}
            {plugin.publisher && <span>{plugin.publisher}</span>}
            {plugin.license && <span>{plugin.license}</span>}
            {plugin.ambientCompatibility && <span>{plugin.ambientCompatibility}</span>}
          </div>
          <code className="plugin-cache-path" title={sourceDetails}>
            {sourceDetails}
          </code>
        </section>
      );
    };
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
            <section className="plugin-hero">
              <div>
                <div className="panel-section-heading">
                  <strong>Ambient Plugin Host</strong>
                  <InfoTooltip
                    label="What is this?"
                    text="Plugins add capabilities to Ambient. Ambient installs and governs Codex plugins, Pi packages, and built-in capabilities, then exposes approved tools and skills to chat, workflows, and automations."
                  />
                </div>
                <p>
                  Plugins are managed by Ambient, not by a single runtime. Pi chat, Workflow Agent, and automations consume the same
                  enabled and trusted capabilities.
                </p>
              </div>
              <div className="plugin-home-grid">
                <div><strong>{registry.plugins.length}</strong><span>Plugins known</span></div>
                <div><strong>{availableCapabilities}</strong><span>Available capabilities</span></div>
                <div><strong>{trustRequiredCapabilities}</strong><span>Need trust</span></div>
                <div><strong>{authRequiredCapabilities + errorCapabilities}</strong><span>Need attention</span></div>
              </div>
            </section>

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
              <div className="plugin-dashboard">
                <section className="plugin-row">
                  <div className="panel-section-heading">
                    <strong>Runtime Model</strong>
                    <span>{state.settings.permissionMode === "full-access" ? "Full access" : "Workspace scope"}</span>
                  </div>
                  <p>
                    Ambient keeps install, enablement, trust, auth, and diagnostics in one place. Pi and Workflow Agent receive
                    only the capabilities approved for the current workspace.
                  </p>
                  <div className="plugin-badges">
                    <span>{installedPlugins.length} installed or discovered</span>
                    <span>{importablePlugins.length} importable</span>
                    <span>{registry.capabilities.length} capabilities</span>
                    <span>{registry.sources.length} sources</span>
                  </div>
                </section>
                <section className="plugin-row">
                  <div className="panel-section-heading">
                    <strong>Attention</strong>
                    <span>{trustRequiredCapabilities + authRequiredCapabilities + errorCapabilities} items</span>
                  </div>
                  <div className="plugin-badges">
                    <span>{trustRequiredCapabilities} need trust</span>
                    <span>{authRequiredCapabilities} need auth</span>
                    <span>{errorCapabilities} errors</span>
                  </div>
                  <p>Trust allows local plugin MCP tools to run. Auth is separate and applies to app or connector accounts.</p>
                </section>
              </div>
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
              <div className="plugin-list">
                <section className="plugin-row">
                  <div className="panel-section-heading">
                    <strong>Ambient Curated Marketplace</strong>
                    <span>{codexCandidateGroups.curated.length} plugin{codexCandidateGroups.curated.length === 1 ? "" : "s"}</span>
                  </div>
                  <p>
                    Ambient-curated marketplace entries are Codex-compatible plugin sources with publisher, license, provenance,
                    checksum, capability, and compatibility metadata attached before Ambient exposes them for install.
                  </p>
                  {curatedMarketplaceSources.length > 0 ? (
                    <div className="plugin-sublist">
                      {curatedMarketplaceSources.map((source) => (
                        <span key={source.id}>
                          {source.label}
                          {source.pluginCount !== undefined ? ` - ${source.pluginCount} plugins` : ""}
                          {source.signatureStatus ? ` - ${formatCodexMarketplaceSignatureStatus(source.signatureStatus)}` : ""}
                          {source.signatureKeyId ? ` - key ${source.signatureKeyId}` : ""}
                          {source.contentChecksum ? ` - ${source.contentChecksum}` : ""}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="panel-note">No Ambient curated marketplace source is configured for this workspace.</p>
                  )}
                </section>

                {codexCandidateGroups.curated.length > 0 ? (
                  <section className="plugin-import-section">
                    <div className="panel-section-heading">
                      <strong>Curated Plugins</strong>
                      <span>{codexCandidateGroups.curated.length} available</span>
                    </div>
                    {codexCandidateGroups.curated.map(renderCodexImportCandidate)}
                  </section>
                ) : (
                  <p className="panel-note">No curated plugins are available from the configured sources.</p>
                )}

                {codexCandidateGroups.remote.length > 0 && (
                  <section className="plugin-import-section">
                    <div className="panel-section-heading">
                      <strong>Other Remote Marketplaces</strong>
                      <span>{codexCandidateGroups.remote.length} available</span>
                    </div>
                    {codexCandidateGroups.remote.map(renderCodexImportCandidate)}
                  </section>
                )}

                {codexCandidateGroups.localCache.length > 0 && (
                  <section className="plugin-import-section">
                    <div className="panel-section-heading">
                      <strong>Local Codex Cache</strong>
                      <span>{codexCandidateGroups.localCache.length} available</span>
                    </div>
                    {codexCandidateGroups.localCache.map(renderCodexImportCandidate)}
                  </section>
                )}
              </div>
            )}

            {pluginView === "installed" && (
              <div className="plugin-list">
                {filteredInstalledPlugins.length > 0 ? (
                  filteredInstalledPlugins.map((plugin) => {
                    const codexPlugin = codexPluginsById.get(plugin.sourcePluginId);
                    const pluginCapabilities = registry.capabilities.filter((capability) => capability.pluginId === plugin.sourcePluginId);
                    const detailsAction = pluginDetailsActionState(plugin, selectedPluginDetailId);
                    const generatedSourceAction = generatedCapabilitySourceActionState(plugin.generated, generatedCapabilitySourceOpening);
                    const generatedValidationAction = generatedCapabilityValidationActionState(plugin.generated, {
                      busyPath: generatedCapabilityValidationStarting,
                      running,
                    });
                    const generatedUpdatePlanAction = generatedCapabilityUpdatePlanActionState(plugin.generated, {
                      busyPath: generatedCapabilityUpdatePlanning,
                      running,
                    });
                    const generatedRemovalPlanAction = generatedCapabilityRemovalPlanActionState(plugin.generated, {
                      busyPath: generatedCapabilityRemovalPlanning,
                      running,
                    });
                    const detailsOpen = selectedPluginDetailId === plugin.id;
                    const pluginSourceDetailLines = [
                      plugin.sourcePluginId,
                      plugin.generated?.sourcePath ? `builder source: ${plugin.generated.sourcePath}` : undefined,
                      plugin.generated?.status ? `build status: ${plugin.generated.status}` : undefined,
                      plugin.generated?.registeredAt ? `registered: ${plugin.generated.registeredAt}` : undefined,
                      plugin.generated?.lastValidatedAt ? `validated: ${plugin.generated.lastValidatedAt}` : undefined,
                      plugin.generated?.refs.installed ? `installed ref: ${plugin.generated.refs.installed}` : undefined,
                      plugin.generated?.refs.lastValidated ? `validated ref: ${plugin.generated.refs.lastValidated}` : undefined,
                      plugin.generated?.refs.lastRepair ? `repair ref: ${plugin.generated.refs.lastRepair}` : undefined,
                      plugin.generated?.refs.latest ? `latest ref: ${plugin.generated.refs.latest}` : undefined,
                      codexPlugin?.rootPath ? `root: ${codexPlugin.rootPath}` : undefined,
                      codexPlugin?.sourceType ? `source: ${codexPlugin.sourceType}` : undefined,
                      codexPlugin?.sourceUrl ? `url: ${codexPlugin.sourceUrl}` : undefined,
                      codexPlugin?.sourcePath ? `path: ${codexPlugin.sourcePath}` : undefined,
                      codexPlugin?.sourceRef ? `ref: ${codexPlugin.sourceRef}` : undefined,
                      codexPlugin?.sourceSha ? `sha: ${codexPlugin.sourceSha}` : undefined,
                      codexPlugin?.sourceChecksum ? `checksum: ${codexPlugin.sourceChecksum}` : undefined,
                      codexPlugin?.sourceBundleChecksum ? `bundle checksum: ${codexPlugin.sourceBundleChecksum}` : undefined,
                      codexPlugin?.publisher ? `publisher: ${codexPlugin.publisher}` : undefined,
                      codexPlugin?.license ? `license: ${codexPlugin.license}` : undefined,
                      codexPlugin?.ambientCompatibility ? `ambient compatibility: ${codexPlugin.ambientCompatibility}` : undefined,
                      codexPlugin?.capabilitySummary?.length ? `marketplace capabilities: ${codexPlugin.capabilitySummary.join(", ")}` : undefined,
                      codexPlugin?.authPolicy ? `auth policy: ${codexPlugin.authPolicy}` : undefined,
                    ].filter((line): line is string => Boolean(line));
                    return (
                      <section className="plugin-row" key={plugin.id}>
                        <div className="plugin-row-header">
                          <strong>{plugin.displayName ?? plugin.name}</strong>
                          {codexPlugin ? (
                            <div className="plugin-row-actions">
                              {detailsAction.visible && (
                                <button
                                  type="button"
                                  className="panel-button mini"
                                  title={detailsAction.title}
                                  onClick={() => setSelectedPluginDetailId(detailsOpen ? undefined : plugin.id)}
                                >
                                  {detailsAction.label}
                                </button>
                              )}
                              {generatedSourceAction.visible && (
                                <button
                                  type="button"
                                  className="panel-button mini icon-panel-button"
                                  disabled={generatedSourceAction.disabled}
                                  title={generatedSourceAction.title}
                                  onClick={() => void revealGeneratedCapabilitySource(plugin.generated?.sourcePath)}
                                >
                                  <FolderOpen size={13} />
                                  {generatedSourceAction.label}
                                </button>
                              )}
                              <button
                                type="button"
                                className="panel-button mini"
                                onClick={() => void setPluginTrusted(codexPlugin.id, !codexPlugin.trusted)}
                              >
                                {codexPlugin.trusted ? "Revoke trust" : "Trust"}
                              </button>
                              <label className="plugin-toggle">
                                <input
                                  type="checkbox"
                                  checked={codexPlugin.enabled}
                                  onChange={(event) => void setPluginEnabled(codexPlugin.id, event.target.checked)}
                                />
                                <span>{plugin.version ?? "local"}</span>
                              </label>
                              <button
                                type="button"
                                className="panel-button mini danger"
                                title="Remove this plugin from the workspace marketplace. Ambient-owned imported plugin files are deleted."
                                onClick={() => void uninstallCodexPlugin(codexPlugin.id)}
                              >
                                Uninstall
                              </button>
                            </div>
                          ) : (
                            <div className="plugin-row-actions">
                              {detailsAction.visible && (
                                <button
                                  type="button"
                                  className="panel-button mini"
                                  title={detailsAction.title}
                                  onClick={() => setSelectedPluginDetailId(detailsOpen ? undefined : plugin.id)}
                                >
                                  {detailsAction.label}
                                </button>
                              )}
                              {generatedSourceAction.visible && (
                                <button
                                  type="button"
                                  className="panel-button mini icon-panel-button"
                                  disabled={generatedSourceAction.disabled}
                                  title={generatedSourceAction.title}
                                  onClick={() => void revealGeneratedCapabilitySource(plugin.generated?.sourcePath)}
                                >
                                  <FolderOpen size={13} />
                                  {generatedSourceAction.label}
                                </button>
                              )}
                              <span>{plugin.installState}</span>
                            </div>
                          )}
                        </div>
                        {plugin.description && <p>{plugin.description}</p>}
                        <div className="plugin-badges">
                          <span>{formatAmbientPluginSourceKind(plugin.sourceKind)}</span>
                          <span className={`plugin-tier ${plugin.compatibilityTier}`}>{formatPluginCompatibility(plugin.compatibilityTier)}</span>
                          <span>{plugin.enabled ? "Enabled" : "Disabled"}</span>
                          <span>{plugin.trusted ? "Trusted" : "Trust required for code"}</span>
                          <span>{plugin.capabilityCount} capabilities</span>
                          {plugin.supportLabels.map((label) => (
                            <span className="plugin-support-label" key={label}>{label}</span>
                          ))}
                        </div>
                        {plugin.diagnostics.length > 0 && (
                          <div className="plugin-note-list">
                            {plugin.diagnostics.slice(0, 5).map((note) => (
                              <span key={note}>{note}</span>
                            ))}
                          </div>
                        )}
                        {detailsOpen && (
                          <div className="plugin-detail-panel">
                            <div className="panel-section-heading">
                              <strong>Plugin Details</strong>
                              <span>{plugin.sourceLabel}</span>
                            </div>
                            <div className="plugin-badges">
                              <span>{formatAmbientPluginSourceKind(plugin.sourceKind)}</span>
                              <span>{formatTaskState(plugin.installState)}</span>
                              <span>{plugin.enabled ? "Enabled" : "Disabled"}</span>
                              <span>{plugin.trusted ? "Trusted" : "Trust required"}</span>
                              <span>{pluginCapabilities.length} capability{pluginCapabilities.length === 1 ? "" : "s"}</span>
                            </div>
                            <code className="plugin-cache-path">{pluginSourceDetailLines.join("\n")}</code>
                            {plugin.generated && (
                              <div className="plugin-detail-actions">
                                <div className="plugin-note-list">
                                  <span>Generated capability management starts a chat-first Capability Builder flow.</span>
                                </div>
                                <button
                                  type="button"
                                  className="panel-button mini icon-panel-button"
                                  disabled={generatedValidationAction.disabled}
                                  title={generatedValidationAction.title}
                                  onClick={() => void startGeneratedCapabilityValidation(plugin.displayName ?? plugin.name, plugin.generated)}
                                >
                                  <CheckCircle2 size={13} />
                                  {generatedValidationAction.label}
                                </button>
                                <button
                                  type="button"
                                  className="panel-button mini icon-panel-button"
                                  disabled={generatedUpdatePlanAction.disabled}
                                  title={generatedUpdatePlanAction.title}
                                  onClick={() => void startGeneratedCapabilityUpdatePlan(plugin.displayName ?? plugin.name, plugin.generated)}
                                >
                                  <RefreshCw size={13} />
                                  {generatedUpdatePlanAction.label}
                                </button>
                                <button
                                  type="button"
                                  className="panel-button mini icon-panel-button danger"
                                  disabled={generatedRemovalPlanAction.disabled}
                                  title={generatedRemovalPlanAction.title}
                                  onClick={() => void startGeneratedCapabilityRemovalPlan(plugin.displayName ?? plugin.name, plugin.generated)}
                                >
                                  <Trash2 size={13} />
                                  {generatedRemovalPlanAction.label}
                                </button>
                              </div>
                            )}
                            {codexPlugin?.dependencyStatus?.required && (
                              <div className="plugin-detail-actions">
                                <div className="plugin-note-list">
                                  <span>
                                    Dependencies {codexPlugin.dependencyStatus.installed ? "installed" : "missing"} via {codexPlugin.dependencyStatus.manager}
                                  </span>
                                  {!codexPlugin.dependencyStatus.installed && codexPlugin.dependencyStatus.missingPackages.length > 0 && (
                                    <span>{codexPlugin.dependencyStatus.missingPackages.slice(0, 6).join(", ")}</span>
                                  )}
                                </div>
                                {!codexPlugin.dependencyStatus.installed && (
                                  <button
                                    type="button"
                                    className="panel-button mini"
                                    disabled={pluginDependencyInstalling === codexPlugin.id}
                                    title="Install package dependencies for this plugin MCP server. Ambient will ask for confirmation first and disable lifecycle scripts."
                                    onClick={() => void installCodexPluginDependencies(codexPlugin.id)}
                                  >
                                    {pluginDependencyInstalling === codexPlugin.id ? "Installing" : "Install dependencies"}
                                  </button>
                                )}
                              </div>
                            )}
                            {pluginCapabilities.length > 0 && (
                              <div className="plugin-note-list">
                                {pluginCapabilities.slice(0, 8).map((capability) => (
                                  <span key={capability.id}>
                                    {capability.displayName ?? capability.name} - {formatAmbientCapabilityKind(capability.kind)} - {formatAmbientRuntimeSupport(capability.runtimeSupport)}
                                  </span>
                                ))}
                              </div>
                            )}
                            {plugin.diagnostics.length === 0 && <p>No plugin diagnostics were reported.</p>}
                          </div>
                        )}
                      </section>
                    );
                  })
                ) : (
                  <p className="panel-note">No installed plugins match the selected source filter.</p>
                )}
              </div>
            )}

            {pluginView === "capabilities" && (
              <div className="plugin-list">
                <section className="plugin-row google-integration-card">
                  <div className="plugin-row-header">
                    <strong>Google Workspace</strong>
                    <div className="plugin-row-actions">
                      {!googleUsesGws && (
                        <button
                          type="button"
                          className="panel-button mini"
                          disabled={!googleIntegration?.enabled || Boolean(pluginAuthBusy)}
                          title={googleIntegration?.unavailableReason ?? "Connect a Google account for first-party Gmail, Calendar, and Drive workflow connectors."}
                          onClick={() => void startPluginAppAuth("google.gmail", googleCoreScopes)}
                        >
                          {googleAccounts.length ? "Connect another" : "Connect"}
                        </button>
                      )}
                      {googleUsesGws && googleInstallAction.visible && (
                        <button
                          type="button"
                          className="panel-button mini"
                          disabled={googleInstallAction.disabled}
                          title={googleInstallAction.title}
                          onClick={() => void installGoogleWorkspaceCli()}
                        >
                          {googleInstallAction.label}
                        </button>
                      )}
                      <span>{googleIntegration?.enabled ? formatTaskState(googlePrimaryConnector?.status ?? "not_configured") : "Unavailable"}</span>
                    </div>
                  </div>
                  <p>
                    First-party Gmail, Calendar, and Drive connectors for Workflow Agent{googleUsesGws ? " using Ambient-managed gws." : "."}
                  </p>
                  <div className="google-integration-summary" aria-label="Google Workspace status">
                    {googleWorkspaceStatusItems(googleIntegration, formatTimelineTime).map((item) => (
                      <div key={item}>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  <div className="plugin-badges">
                    {(googleIntegration?.connectors ?? []).map((connector) => (
                      <span key={connector.connectorId}>
                        {googleWorkspaceConnectorLabel(connector.connectorId)} - {formatTaskState(connector.status)}
                      </span>
                    ))}
                    {googleAccounts.length > 0 && <span>{googleAccounts.length} account{googleAccounts.length === 1 ? "" : "s"}</span>}
                  </div>
                    {googleIntegration?.unavailableReason && <p>{googleIntegration.unavailableReason}</p>}
                    {googleSetupGuideVisible && (
                      <section className="google-setup-guide" aria-label="Google Workspace setup guide">
                        <div className="google-setup-guide-header">
                          <div>
                            <strong>Google Workspace setup</strong>
                            <span>Please enter the Google username you wish to add and then hit enter or OK</span>
                          </div>
                          <GoogleSetupAccountControl
                            accountHint={googleSetupAccountHint}
                            placeholder={googleHasMultipleAccounts ? "Account handle from row below" : "Google username or email"}
                            disabled={googleSetupAccountControlDisabled}
                            busy={Boolean(googleSetupBusy) || googleSetupRunning || googleInstallRunning}
                            onConfirm={(accountHint) => void confirmGoogleWorkspaceAccount(accountHint)}
                          />
                        </div>
                        {googleSelectedAccountHint && (
                          <div className={`google-setup-state-banner ${googleSelectedAccountAvailable ? "success" : googleConfiguredNotAuthenticated ? "warning" : "info"}`}>
                            <strong>{googleSelectedAccountHint}</strong>
                            <span>
                              {googleSelectedAccountAvailable
                                ? "Google account authenticated and ready for connector validation."
                                : googleConfiguredNotAuthenticated
                                  ? "Desktop OAuth client configured. Google account not authenticated yet."
                                  : googleNeedsOAuthClientConfig
                                    ? "Desktop OAuth client JSON required before Google sign-in can start."
                                    : "Press OK to install gws and continue Google setup for this account."}
                            </span>
                          </div>
                        )}
                        <ol className="google-setup-steps">
                          <li className={googleIntegration?.sidecar.state === "available" ? "complete" : "current"}>
                            <span className="google-step-number">1</span>
                            <div>
                              <strong>Install gws</strong>
                            <span>Ambient installs the pinned Google Workspace CLI into this stable base.</span>
                          </div>
                          {googleInstallAction.visible && (
                            <button
                              type="button"
                              className="panel-button mini"
                              disabled={googleInstallAction.disabled}
                              title={googleInstallAction.title}
                              onClick={() => void installGoogleWorkspaceCli()}
                            >
                                {googleInstallAction.label}
                              </button>
                            )}
                          </li>
                          <li className={googleOAuthClientConfigured || googleAccountAvailable ? "complete" : googleIntegration?.sidecar.state === "available" ? "current" : "pending"}>
                            <span className="google-step-number">2</span>
                            <div>
                              <strong>Create a Desktop OAuth client</strong>
                              <span>Use Google Cloud Console to create a Desktop app client and download `client_secret_*.json`.</span>
                            </div>
                            <button
                              type="button"
                              className="panel-button mini"
                              disabled={googleIntegration?.sidecar.state === "missing" || googleSetupAccountControlDisabled}
                              title={googleOAuthClientConfigUrl ? "Open the Google Cloud OAuth client page in Chrome." : "Run gws setup to open the Google Cloud OAuth client page in Chrome."}
                              onClick={() => {
                                if (googleOAuthClientConfigUrl) {
                                  void window.ambientDesktop.openExternalUrl(googleOAuthClientConfigUrl).catch((error) => {
                                    setPluginAuthStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
                                  });
                                } else {
                                  void startGoogleWorkspaceSetup("setup", googleSetupAccountHint);
                                }
                              }}
                            >
                              (2) Open Google Console
                            </button>
                          </li>
                          <li className={googleOAuthClientConfigured || googleAccountAvailable ? "complete" : googleNeedsOAuthClientConfig ? "current" : "pending"}>
                            <span className="google-step-number">3</span>
                            <div>
                              <strong>Import OAuth JSON</strong>
                              <span>Select the downloaded `client_secret_*.json`; Ambient copies it into the local gws account.</span>
                            </div>
                            <button
                              type="button"
                              className="panel-button mini"
                              disabled={googleIntegration?.sidecar.state === "missing" || googleSetupAccountControlDisabled}
                              title="Import the downloaded Google OAuth Desktop client JSON into this local gws account."
                              onClick={() => void importGoogleWorkspaceOAuthClient(googleSetupAccountHint)}
                            >
                              {googleSetupBusy === "import-oauth-client" ? "Importing" : "(3) Import OAuth JSON"}
                            </button>
                          </li>
                          <li className={googleSelectedAccountAvailable ? "complete" : googleOAuthClientConfigured ? "current" : "pending"}>
                            <span className="google-step-number">4</span>
                            <div>
                              <strong>Connect Google account</strong>
                              <span>Open Google sign-in in Chrome and let gws save credentials for Gmail, Calendar, and Drive.</span>
                            </div>
                            <button
                              type="button"
                              className="panel-button mini"
                              disabled={googleConnectDisabled}
                              title={googleConnectTitle}
                              onClick={() => void startGoogleWorkspaceSetup("login", googleSetupAccountHint)}
                            >
                              (4) Connect account
                            </button>
                          </li>
                          <li className={googleSelectedAccountAvailable ? "complete" : googleAccounts.length > 0 ? "current" : "pending"}>
                            <span className="google-step-number">5</span>
                            <div>
                              <strong>Validate connectors</strong>
                            <span>Run identity, Gmail, Calendar, and Drive read probes before exposing the account to workflows.</span>
                            </div>
                            <button
                              type="button"
                              className={`panel-button mini google-validate-button ${googleSelectedValidateButton.tone}`}
                              disabled={googleValidateDisabled}
                              title={googleValidateTitle}
                              onClick={() => void validateGoogleWorkspace(googleSetupAccountHint)}
                            >
                              <GoogleWorkspaceValidationButtonIcon icon={googleSelectedValidateButton.icon} />
                              (5) {googleSelectedValidateButton.label}
                            </button>
                          </li>
                      </ol>
                    </section>
                  )}
                    {googleUsesGws && !googleSetupGuideVisible && (
                      <div className="google-action-strip">
                        <GoogleSetupAccountControl
                          accountHint={googleSetupAccountHint}
                          placeholder={googleHasMultipleAccounts ? "Account handle from row below" : "Google username or email"}
                          disabled={googleSetupAccountControlDisabled}
                          busy={Boolean(googleSetupBusy) || googleSetupRunning || googleInstallRunning}
                          onConfirm={(accountHint) => void confirmGoogleWorkspaceAccount(accountHint)}
                        />
                        <button
                          type="button"
                          className="panel-button mini"
                          disabled={googleConnectDisabled}
                          title={googleConnectTitle}
                          onClick={() => void startGoogleWorkspaceSetup("login", googleSetupAccountHint)}
                        >
                          (4) {googleConnectAction.label}
                        </button>
                      <button
                        type="button"
                        className="panel-button mini"
                        disabled={googleRepairAction.disabled}
                        title={googleRepairAction.title}
                        onClick={() => void startGoogleWorkspaceSetup("setup")}
                      >
                        (2) {googleRepairAction.label}
                      </button>
                        <button
                          type="button"
                          className={`panel-button mini google-validate-button ${googleSelectedValidateButton.tone}`}
                          disabled={googleValidateDisabled}
                          title={googleValidateTitle}
                          onClick={() => void validateGoogleWorkspace(googleSetupAccountHint)}
                        >
                        <GoogleWorkspaceValidationButtonIcon icon={googleSelectedValidateButton.icon} />
                        (5) {googleSelectedValidateButton.label === "Validate" ? googleValidateAction.label : googleSelectedValidateButton.label}
                      </button>
                      {googleCancelAction.visible && (
                        <button
                          type="button"
                          className="panel-button mini danger"
                          disabled={googleCancelAction.disabled}
                          title={googleCancelAction.title}
                          onClick={() => void cancelGoogleWorkspaceSetup()}
                        >
                          {googleCancelAction.label}
                        </button>
                      )}
                    </div>
                  )}
                  {googleUsesGws && googleIntegration?.install && googleIntegration.install.status !== "idle" && (
                    <div className="plugin-note-list">
                      <span>CLI install {formatTaskState(googleIntegration.install.status)}</span>
                      <span>gws {googleIntegration.install.version}</span>
                      {googleIntegration.install.binaryPath && <span>{googleIntegration.install.binaryPath}</span>}
                      {googleIntegration.install.error && <span>{googleIntegration.install.error}</span>}
                    </div>
                  )}
                  {googleUsesGws && googleIntegration?.setup && googleIntegration.setup.status !== "idle" && (
                    <div className="plugin-note-list">
                      <span>Setup {formatTaskState(googleIntegration.setup.status)}</span>
                        {googleIntegration.setup.command && <span>Command gws auth {googleIntegration.setup.command}</span>}
                        {googleIntegration.setup.accountHint && <span>Account {googleIntegration.setup.accountHint}</span>}
                        {googleIntegration.setup.oauthClientConfigured === true && <span>Desktop OAuth client configured</span>}
                        {googleIntegration.setup.oauthClientConfigured === false && <span>Desktop OAuth client not configured</span>}
                        {googleIntegration.setup.discoveredEmail && <span>Signed in {googleIntegration.setup.discoveredEmail}</span>}
                      {googleIntegration.setup.openedAuthUrl && <span>Browser sign-in opened</span>}
                      {googleNeedsOAuthClientConfig && <span>Desktop OAuth client JSON required</span>}
                      {googleIntegration.setup.openedOAuthClientConfigUrl && <span>Google Cloud Console opened in Chrome</span>}
                      {googleIntegration.setup.error && <span>{googleIntegration.setup.error}</span>}
                      {googleIntegration.setup.outputTail && (
                        <details className="google-setup-technical-log">
                          <summary>Show technical log</summary>
                          <code className="plugin-cache-path google-setup-output">{googleIntegration.setup.outputTail}</code>
                        </details>
                      )}
                    </div>
                  )}
                  {googleAccounts.length > 0 && (
                    <div className="google-account-list">
                      {googleAccounts.map((account) => {
                        const accountValidationFeedback = googleWorkspaceValidationFeedbackForAccount(googleValidationFeedback, account.accountId);
                        const accountValidateButton = googleWorkspaceValidationButtonView("Validate", accountValidationFeedback);
                        return (
                          <div className={`google-account-row ${accountValidationFeedback?.status ?? ""}`} key={account.id}>
                            <div>
                              <strong>{account.identityLabel}</strong>
                              <span>
                                {formatTaskState(account.status)}
                                {account.connectorLabels.length ? ` - ${account.connectorLabels.join(", ")}` : ""}
                                {account.lastValidatedLabel ? ` - validated ${account.lastValidatedLabel}` : ""}
                              </span>
                              {accountValidationFeedback?.message && (
                                <span className={`google-validation-inline-status ${accountValidationFeedback.status}`} role="status" aria-live="polite">
                                  <GoogleWorkspaceValidationButtonIcon icon={accountValidateButton.icon} />
                                  {accountValidationFeedback.message}
                                </span>
                              )}
                              {googleUsesGws && <code>handle: {account.handleLabel}</code>}
                              {account.validationError && <span className="google-account-error">{account.validationError}</span>}
                            </div>
                            <div className="google-account-actions">
                              {googleUsesGws ? (
                                <>
                                  <button
                                    type="button"
                                    className="panel-button mini"
                                    disabled={googleSetupRunning || googleInstallRunning || Boolean(googleSetupBusy)}
                                    title="Use this local gws account handle in the Google action box."
                                    onClick={() => setGoogleSetupAccountHint(account.accountId)}
                                  >
                                    Use
                                  </button>
                                  <button
                                    type="button"
                                    className={`panel-button mini google-validate-button ${accountValidateButton.tone}`}
                                    disabled={googleValidateAction.disabled}
                                    title={googleValidateAction.title}
                                    onClick={() => void validateGoogleWorkspace(account.accountId)}
                                  >
                                    <GoogleWorkspaceValidationButtonIcon icon={accountValidateButton.icon} />
                                    {accountValidateButton.label}
                                  </button>
                                  <button
                                    type="button"
                                    className="panel-button mini"
                                    disabled={googleConnectAction.disabled}
                                    title="Start Google sign-in again for this local gws account."
                                    onClick={() => void startGoogleWorkspaceSetup("login", account.accountId)}
                                  >
                                    Repair
                                  </button>
                                  <button
                                    type="button"
                                    className="panel-button mini danger"
                                    disabled={Boolean(googleSetupBusy)}
                                    title="Remove this account from Ambient metadata. Local gws credential files are left in place."
                                    onClick={() => void disconnectGoogleWorkspace(account.accountId)}
                                  >
                                    {googleSetupBusy === `disconnect:${account.accountId}` ? "Disconnecting" : "Disconnect"}
                                  </button>
                                </>
                              ) : (
                              <>
                              <button
                                type="button"
                                className="panel-button mini"
                                disabled={Boolean(pluginAuthBusy)}
                                onClick={() => void testPluginAuthAccount(account.id)}
                              >
                                Test
                              </button>
                              <button
                                type="button"
                                className="panel-button mini"
                                disabled={Boolean(pluginAuthBusy)}
                                onClick={() => void disconnectPluginAuthAccount(account.id)}
                              >
                                Disconnect
                              </button>
                              <button
                                type="button"
                                className="panel-button mini danger"
                                disabled={Boolean(pluginAuthBusy)}
                                onClick={() => void revokePluginAuthAccount(account.id)}
                              >
                                Revoke
                              </button>
                              </>
                            )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                  {googleIntegration?.sidecar?.binaryPath && (
                    <code className="plugin-cache-path">
                      {googleIntegration.sidecar.binaryPath}
                      {googleIntegration.sidecar.configDir ? `\nconfig: ${googleIntegration.sidecar.configDir}` : ""}
                    </code>
                  )}
                </section>
                {filteredCapabilities.length > 0 ? (
                  filteredCapabilities.map((capability) => {
                    const diagnosticsAction = capabilityDiagnosticsActionState(capability, pluginCapabilityDiagnosticsBusy);
                    const generatedSourceAction = generatedCapabilitySourceActionState(capability.generated, generatedCapabilitySourceOpening);
                    const generatedValidationAction = generatedCapabilityValidationActionState(capability.generated, {
                      busyPath: generatedCapabilityValidationStarting,
                      running,
                    });
                    const generatedUpdatePlanAction = generatedCapabilityUpdatePlanActionState(capability.generated, {
                      busyPath: generatedCapabilityUpdatePlanning,
                      running,
                    });
                    const generatedRemovalPlanAction = generatedCapabilityRemovalPlanActionState(capability.generated, {
                      busyPath: generatedCapabilityRemovalPlanning,
                      running,
                    });
                    const diagnostics = pluginCapabilityDiagnostics?.capabilityId === capability.id ? pluginCapabilityDiagnostics : undefined;
                    return (
                      <section className="plugin-row" key={capability.id}>
                        <div className="plugin-row-header">
                          <strong>{capability.displayName ?? capability.name}</strong>
                          <div className="plugin-row-actions">
                            {capability.kind === "app" && capability.connectorId && capability.authStatus !== "unavailable" && (
                              <button
                                type="button"
                                className="panel-button mini"
                                disabled={Boolean(pluginAuthBusy)}
                                onClick={() => void startPluginAppAuth(capability.connectorId!)}
                              >
                                {capability.authAccountCount ? "Reconnect" : "Connect"}
                              </button>
                            )}
                            {diagnosticsAction.visible && (
                              <button
                                type="button"
                                className="panel-button mini"
                                disabled={diagnosticsAction.disabled}
                                title={diagnosticsAction.title}
                                onClick={() => void inspectAmbientPluginCapability(capability.id)}
                              >
                                {diagnosticsAction.label}
                              </button>
                            )}
                            {generatedSourceAction.visible && (
                              <button
                                type="button"
                                className="panel-button mini icon-panel-button"
                                disabled={generatedSourceAction.disabled}
                                title={generatedSourceAction.title}
                                onClick={() => void revealGeneratedCapabilitySource(capability.generated?.sourcePath)}
                              >
                                <FolderOpen size={13} />
                                {generatedSourceAction.label}
                              </button>
                            )}
                            <span>{formatAmbientAvailability(capability.availability)}</span>
                          </div>
                        </div>
                        {capability.description && <p>{capability.description}</p>}
                        <div className="plugin-badges">
                          <span>{formatAmbientCapabilityKind(capability.kind)}</span>
                          <span>{capability.pluginDisplayName ?? capability.pluginName}</span>
                          <span>{formatAmbientRuntimeSupport(capability.runtimeSupport)}</span>
                          <span>{formatAmbientPluginSourceKind(capability.sourceKind)}</span>
                          {capability.serverName && <span>MCP {capability.serverName}</span>}
                          {capability.connectorId && <span>Connector {capability.connectorId}</span>}
                          {capability.authStatus && <span>Auth {formatTaskState(capability.authStatus)}</span>}
                          {capability.authProviderId && <span>Provider {capability.authProviderId}</span>}
                          {capability.authAccountCount !== undefined && <span>{capability.authAccountCount} account{capability.authAccountCount === 1 ? "" : "s"}</span>}
                          {capability.supportLabels.map((label) => (
                            <span className="plugin-support-label" key={label}>{label}</span>
                          ))}
                        </div>
                        {capability.authAccounts?.length ? (
                          <div className="plugin-note-list">
                            {capability.authAccounts.map((account) => (
                              <span key={account.id}>
                                {account.label}{account.email ? ` (${account.email})` : ""} - {formatTaskState(account.status)}
                                <button
                                  type="button"
                                  className="panel-button mini"
                                  disabled={Boolean(pluginAuthBusy)}
                                  onClick={() => void testPluginAuthAccount(account.id)}
                                >
                                  Test
                                </button>
                                <button
                                  type="button"
                                  className="panel-button mini"
                                  disabled={Boolean(pluginAuthBusy)}
                                  onClick={() => void disconnectPluginAuthAccount(account.id)}
                                >
                                  Disconnect
                                </button>
                                <button
                                  type="button"
                                  className="panel-button mini danger"
                                  disabled={Boolean(pluginAuthBusy)}
                                  onClick={() => void revokePluginAuthAccount(account.id)}
                                >
                                  Revoke
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {capability.availabilityReason && <p>{capability.availabilityReason}</p>}
                        {capability.path && <code className="plugin-cache-path">{capability.path}</code>}
                        {diagnostics && (
                          <div className="plugin-detail-panel">
                            <div className="panel-section-heading">
                              <strong>Capability Details</strong>
                              <span>{diagnostics.availabilityReason ?? formatAmbientAvailability(capability.availability)}</span>
                            </div>
                            <div className="plugin-badges">
                              {diagnostics.plugin && <span>Plugin {diagnostics.plugin.displayName ?? diagnostics.plugin.name}</span>}
                              {diagnostics.capability?.serverName && <span>MCP {diagnostics.capability.serverName}</span>}
                              {diagnostics.capability?.connectorId && <span>Connector {diagnostics.capability.connectorId}</span>}
                              {diagnostics.capability?.toolName && <span>Tool {diagnostics.capability.toolName}</span>}
                            </div>
                            {capability.generated && (
                              <div className="plugin-detail-actions">
                                <div className="plugin-note-list">
                                  <span>Generated capability management starts a chat-first Capability Builder flow.</span>
                                </div>
                                <button
                                  type="button"
                                  className="panel-button mini icon-panel-button"
                                  disabled={generatedValidationAction.disabled}
                                  title={generatedValidationAction.title}
                                  onClick={() => void startGeneratedCapabilityValidation(capability.displayName ?? capability.name, capability.generated)}
                                >
                                  <CheckCircle2 size={13} />
                                  {generatedValidationAction.label}
                                </button>
                                <button
                                  type="button"
                                  className="panel-button mini icon-panel-button"
                                  disabled={generatedUpdatePlanAction.disabled}
                                  title={generatedUpdatePlanAction.title}
                                  onClick={() => void startGeneratedCapabilityUpdatePlan(capability.displayName ?? capability.name, capability.generated)}
                                >
                                  <RefreshCw size={13} />
                                  {generatedUpdatePlanAction.label}
                                </button>
                                <button
                                  type="button"
                                  className="panel-button mini icon-panel-button danger"
                                  disabled={generatedRemovalPlanAction.disabled}
                                  title={generatedRemovalPlanAction.title}
                                  onClick={() => void startGeneratedCapabilityRemovalPlan(capability.displayName ?? capability.name, capability.generated)}
                                >
                                  <Trash2 size={13} />
                                  {generatedRemovalPlanAction.label}
                                </button>
                              </div>
                            )}
                            {diagnostics.diagnostics.length > 0 ? (
                              <div className="plugin-note-list">
                                {diagnostics.diagnostics.map((note) => (
                                  <span key={note}>{note}</span>
                                ))}
                              </div>
                            ) : (
                              <p>No additional diagnostics were reported.</p>
                            )}
                          </div>
                        )}
                      </section>
                    );
                  })
                ) : (
                  <p className="panel-note">No plugin capabilities match the selected filters.</p>
                )}
              </div>
            )}

            {pluginView === "sources" && (
              <div className="plugin-list">
                <section className="plugin-row">
                  <div className="panel-section-heading">
                    <strong>Add Codex Marketplace</strong>
                    <span>Local path, GitHub, or advanced URL</span>
                  </div>
                  <div className="plugin-marketplace-add-row">
                    <input
                      className="panel-input"
                      value={codexMarketplaceSourceInput}
                      placeholder="./marketplace.json, https://..., or owner/repo"
                      onChange={(event) => setCodexMarketplaceSourceInput(event.target.value)}
                    />
                    <input
                      className="panel-input"
                      value={codexMarketplaceNameInput}
                      placeholder="Optional label"
                      onChange={(event) => setCodexMarketplaceNameInput(event.target.value)}
                    />
                    <label
                      className="plugin-toggle"
                      title="Arbitrary non-GitHub marketplace URLs are experimental and should only be used for sources you trust."
                    >
                      <input
                        type="checkbox"
                        checked={codexMarketplaceAllowExperimental}
                        onChange={(event) => setCodexMarketplaceAllowExperimental(event.target.checked)}
                      />
                      <span>Advanced URL</span>
                    </label>
                    <button
                      type="button"
                      className="panel-button mini"
                      disabled={codexMarketplaceAddAction.disabled}
                      title={codexMarketplaceAddAction.title}
                      onClick={() => void addCodexMarketplace()}
                    >
                      {codexMarketplaceAddAction.label}
                    </button>
                  </div>
                </section>
                <section className="plugin-row">
                  <div className="panel-section-heading">
                    <strong>Generated Capability Sources</strong>
                    <span>
                      {capabilityBuilderHistoryLoading
                        ? "Loading"
                        : `${generatedCapabilityHistoryEntries.length} preserved source${generatedCapabilityHistoryEntries.length === 1 ? "" : "s"}, ${generatedCapabilityHistoryMissingInstalled.length} unregistered`}
                    </span>
                  </div>
                  {capabilityBuilderHistoryError ? (
                    <p className="panel-note">{capabilityBuilderHistoryError}</p>
                  ) : generatedCapabilityHistoryEntries.length > 0 ? (
                    <div className="plugin-sublist">
                      {capabilityBuilderHistory?.errors.length ? (
                        <div className="plugin-note-list">
                          {capabilityBuilderHistory.errors.slice(0, 5).map((note) => (
                            <span key={note}>Discovery error: {note}</span>
                          ))}
                        </div>
                      ) : null}
                      {generatedCapabilityHistoryEntries.map((entry) => {
                        const generated = generatedCapabilitySummaryFromHistoryEntry(entry);
                        const sourceAction = capabilityBuilderHistorySourceActionState(entry, generatedCapabilitySourceOpening);
                        const previewAction = capabilityBuilderHistoryPreviewActionState(entry, {
                          busyPath: capabilityBuilderHistoryPreviewStarting,
                          running,
                        });
                        const reregisterAction = capabilityBuilderHistoryReregisterActionState(entry, {
                          busyPath: capabilityBuilderHistoryReregisterStarting,
                          running,
                        });
                        const repairAction = capabilityBuilderHistoryRepairPlanActionState(entry, {
                          busyPath: capabilityBuilderHistoryRepairPlanning,
                          running,
                        });
                        const updateAction = generatedCapabilityUpdatePlanActionState(generated, {
                          busyPath: generatedCapabilityUpdatePlanning,
                          running,
                        });
                        const removalAction = generatedCapabilityRemovalPlanActionState(generated, {
                          busyPath: generatedCapabilityRemovalPlanning,
                          running,
                        });
                        return (
                          <div className="plugin-source-entry" key={entry.relativeRootPath}>
                            <div className="plugin-row-header">
                              <strong>{entry.packageName}</strong>
                              <div className="plugin-row-actions">
                                <button
                                  type="button"
                                  className="panel-button mini icon-panel-button"
                                  disabled={sourceAction.disabled}
                                  title={sourceAction.title}
                                  onClick={() => void revealGeneratedCapabilitySource(entry.relativeRootPath)}
                                >
                                  <FolderOpen size={13} />
                                  {sourceAction.label}
                                </button>
                                <button
                                  type="button"
                                  className="panel-button mini icon-panel-button"
                                  disabled={previewAction.disabled}
                                  title={previewAction.title}
                                  onClick={() => void startCapabilityBuilderHistoryPreview(entry)}
                                >
                                  <FileText size={13} />
                                  {previewAction.label}
                                </button>
                                <button
                                  type="button"
                                  className="panel-button mini icon-panel-button"
                                  disabled={reregisterAction.disabled}
                                  title={reregisterAction.title}
                                  onClick={() => void startCapabilityBuilderHistoryReregister(entry)}
                                >
                                  <Plug size={13} />
                                  {reregisterAction.label}
                                </button>
                                {repairAction.visible && (
                                  <button
                                    type="button"
                                    className="panel-button mini icon-panel-button"
                                    disabled={repairAction.disabled}
                                    title={repairAction.title}
                                    onClick={() => void startCapabilityBuilderHistoryRepairPlan(entry)}
                                  >
                                    <Pencil size={13} />
                                    {repairAction.label}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="panel-button mini icon-panel-button"
                                  disabled={updateAction.disabled}
                                  title={updateAction.title}
                                  onClick={() => void startGeneratedCapabilityUpdatePlan(entry.packageName, generated)}
                                >
                                  <RefreshCw size={13} />
                                  {updateAction.label}
                                </button>
                                <button
                                  type="button"
                                  className="panel-button mini icon-panel-button danger"
                                  disabled={removalAction.disabled}
                                  title={removalAction.title}
                                  onClick={() => void startGeneratedCapabilityRemovalPlan(entry.packageName, generated)}
                                >
                                  <Trash2 size={13} />
                                  {removalAction.label}
                                </button>
                              </div>
                            </div>
                            {entry.goal && <p>{entry.goal}</p>}
                            <div className="plugin-badges">
                              <span>{formatTaskState(entry.status)}</span>
                              <span>{entry.valid ? "Valid preview" : "Preview has errors"}</span>
                              <span>{entry.installedPresent ? "Installed" : "Not installed"}</span>
                              {entry.kind && <span>{entry.kind}</span>}
                              {entry.provider && <span>{entry.provider}</span>}
                              {entry.commandNames.length > 0 && <span>{entry.commandNames.length} command{entry.commandNames.length === 1 ? "" : "s"}</span>}
                              {entry.artifactOutputTypes.length > 0 && <span>{entry.artifactOutputTypes.join(", ")}</span>}
                            </div>
                            <code className="plugin-cache-path">
                              {[
                                entry.relativeRootPath,
                                entry.gitSha ? `sha: ${entry.gitSha}` : undefined,
                                entry.lastValidatedAt ? `validated: ${entry.lastValidatedAt}` : undefined,
                                entry.registeredAt ? `registered: ${entry.registeredAt}` : undefined,
                                entry.unregisteredAt ? `unregistered: ${entry.unregisteredAt}` : undefined,
                                entry.refs.installed ? `installed ref: ${entry.refs.installed}` : undefined,
                                entry.refs.lastValidated ? `validated ref: ${entry.refs.lastValidated}` : undefined,
                                entry.refs.lastRepair ? `repair ref: ${entry.refs.lastRepair}` : undefined,
                              ].filter(Boolean).join("\n")}
                            </code>
                            {(entry.errors.length > 0 || entry.warnings.length > 0) && (
                              <div className="plugin-note-list">
                                {[...entry.errors, ...entry.warnings].slice(0, 5).map((note) => (
                                  <span key={note}>{note}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p>No generated capability sources have been created in this workspace yet.</p>
                  )}
                  <div className="plugin-row-actions">
                    <button
                      type="button"
                      className="panel-button mini"
                      disabled={capabilityBuilderHistoryLoading}
                      onClick={() => void loadCapabilityBuilderHistory()}
                    >
                      {capabilityBuilderHistoryLoading ? "Refreshing" : "Refresh"}
                    </button>
                  </div>
                </section>
                <section className="plugin-row">
                  <div className="panel-section-heading">
                    <strong>Sources</strong>
                    <span>{codexMarketplaceSources.length} marketplace entries</span>
                  </div>
                  {codexMarketplaceSources.length > 0 ? (
                    <div className="plugin-sublist">
                      {codexMarketplaceSources.map((source) => {
                        const removeAction = codexMarketplaceRemoveActionState(source, codexMarketplaceRemoving);
                        return (
                          <div className="plugin-source-entry" key={source.id}>
                            <code>
                              {[
                                source.label,
                                formatCodexMarketplaceSourceKind(source.kind),
                                source.source,
                                source.pluginCount !== undefined ? `${source.pluginCount} plugins` : undefined,
                                source.signatureStatus ? formatCodexMarketplaceSignatureStatus(source.signatureStatus) : undefined,
                                source.signatureKeyId ? `signature key: ${source.signatureKeyId}` : undefined,
                                source.signatureGeneratedAt ? `signed: ${source.signatureGeneratedAt}` : undefined,
                                source.signatureError ? `signature error: ${source.signatureError}` : undefined,
                                source.contentChecksum,
                              ]
                                .filter(Boolean)
                                .join("\n")}
                            </code>
                            {removeAction.visible && (
                              <button
                                type="button"
                                className="panel-button mini"
                                disabled={removeAction.disabled}
                                title={removeAction.title}
                                onClick={() => void removeCodexMarketplace(source.id, source.source)}
                              >
                                {removeAction.label}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p>No Codex marketplace source is configured for this workspace.</p>
                  )}
                </section>
                {hostedMarketplaceReport && (
                  <section className="plugin-row">
                    <div className="panel-section-heading">
                      <strong>Hosted Codex Marketplace</strong>
                      <span>{formatTaskState(hostedMarketplaceReport.status)}</span>
                    </div>
                    <p>{hostedMarketplaceReport.message}</p>
                    <div className="plugin-badges">
                      <span>{hostedMarketplaceReport.source === "codex-app-server" ? "Codex app-server oracle" : "Ambient local catalog"}</span>
                      <span>{hostedMarketplaceReport.marketplaceCount} marketplace{hostedMarketplaceReport.marketplaceCount === 1 ? "" : "s"}</span>
                      <span>{hostedMarketplaceReport.pluginCount} hosted plugin{hostedMarketplaceReport.pluginCount === 1 ? "" : "s"}</span>
                      <span>{hostedMarketplaceReport.matchedPluginCount} matched in Ambient</span>
                      <span>{hostedMarketplaceReport.readComparisonCount} read probe{hostedMarketplaceReport.readComparisonCount === 1 ? "" : "s"}</span>
                      <span>{hostedMarketplaceReport.ambientCandidateCount} Ambient candidates</span>
                    </div>
                    {hostedMarketplaceReport.command && <code className="plugin-cache-path">{hostedMarketplaceReport.command}</code>}
                    <div className="plugin-note-list">
                      {hostedMarketplaceReport.notes.map((note) => (
                        <span key={note}>{note}</span>
                      ))}
                    </div>
                    <div className="plugin-sublist">
                      <strong>Protocol methods</strong>
                      <code>{hostedMarketplaceReport.protocolMethods.join(", ")}</code>
                    </div>
                    {hostedMarketplaceReport.marketplaceLoadErrors.length > 0 && (
                      <div className="plugin-note-list">
                        {hostedMarketplaceReport.marketplaceLoadErrors.map((note) => (
                          <span key={note}>{note}</span>
                        ))}
                      </div>
                    )}
                    {hostedMarketplaceReport.readComparisons.length > 0 && (
                      <div className="plugin-sublist">
                        <strong>Read comparisons</strong>
                        {hostedMarketplaceReport.readComparisons.map((comparison) => (
                          <span key={`${comparison.marketplaceName}:${comparison.pluginName}`}>
                            {comparison.pluginName}: {formatTaskState(comparison.status)}
                            {comparison.skillCount !== undefined ? `, ${comparison.skillCount} skills` : ""}
                            {comparison.mcpServerCount !== undefined ? `, ${comparison.mcpServerCount} MCP servers` : ""}
                            {comparison.error ? ` - ${comparison.error}` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                    {hostedMarketplaceReport.marketplaces.slice(0, 4).map((marketplace) => (
                      <div className="plugin-sublist" key={`${marketplace.name}:${marketplace.path ?? "hosted"}`}>
                        <strong>{marketplace.displayName ?? marketplace.name}</strong>
                        <span>{formatCodexMarketplaceSourceKind(marketplace.marketplaceKind)}</span>
                        <span>{marketplace.pluginCount} plugin{marketplace.pluginCount === 1 ? "" : "s"}</span>
                        {marketplace.path && <code>{marketplace.path}</code>}
                        {marketplace.plugins.slice(0, 8).map((plugin) => (
                          <span key={plugin.id ?? `${marketplace.name}:${plugin.name}`}>
                            {plugin.displayName ?? plugin.name}
                            {plugin.installed !== undefined ? ` - ${plugin.installed ? "installed" : "not installed"}` : ""}
                          </span>
                        ))}
                      </div>
                    ))}
                    {hostedMarketplaceReport.missingInAmbient.length > 0 && (
                      <div className="plugin-note-list">
                        <span>Hosted-only: {hostedMarketplaceReport.missingInAmbient.slice(0, 8).join(", ")}</span>
                      </div>
                    )}
                    {hostedMarketplaceReport.extraInAmbient.length > 0 && (
                      <div className="plugin-note-list">
                        <span>Ambient-only: {hostedMarketplaceReport.extraInAmbient.slice(0, 8).join(", ")}</span>
                      </div>
                    )}
                  </section>
                )}
                {piPackageCatalog && (
                  <section className="plugin-import-section pi-package-section">
                    <div className="panel-section-heading">
                      <strong>Pi Packages</strong>
                      <span>{piPackageCatalog.packages.length} managed or inspectable candidates</span>
                    </div>
                    <div className="pi-package-install-row">
                      <input
                        className="panel-input"
                        value={piPackageSourceInput}
                        placeholder="npm:pi-subagents, git:https://..., or ./local-package"
                        onChange={(event) => setPiPackageSourceInput(event.target.value)}
                      />
                      <select
                        className="panel-input pi-package-scope-select"
                        value={piPackageInstallScope}
                        onChange={(event) => setPiPackageInstallScope(event.target.value as PiPackageInstallScope)}
                      >
                        <option value="workspace">Workspace</option>
                        <option value="global">Global</option>
                      </select>
                      <button
                        type="button"
                        className="panel-button mini"
                        disabled={piPackageInstalling || !piPackageSourceInput.trim()}
                        onClick={() => void installPiPackage(piPackageSourceInput)}
                      >
                        {piPackageInstalling ? "Installing" : "Install"}
                      </button>
                      <button
                        type="button"
                        className="panel-button mini"
                        disabled={piExtensionSandboxInstalling || !piPackageSourceInput.trim()}
                        title="Install this tool-shaped Pi extension into Ambient's sandboxed compatibility host."
                        onClick={() => void installPiExtensionSandboxPackage(piPackageSourceInput)}
                      >
                        {piExtensionSandboxInstalling ? "Installing" : "Install sandboxed"}
                      </button>
                      <button
                        type="button"
                        className="panel-button mini"
                        disabled={piPrivilegedScanning || !piPackageSourceInput.trim()}
                        title="Scan this source as a privileged Pi package without executing package code."
                        onClick={() => void scanPiPrivilegedPackage(piPackageSourceInput)}
                      >
                        {piPrivilegedScanning ? "Scanning" : "Scan privileged"}
                      </button>
                      <button
                        type="button"
                        className="panel-button mini danger"
                        disabled={
                          piPrivilegedInstalling ||
                          !piPrivilegedScan ||
                          piPrivilegedScanSource !== piPackageSourceInput.trim()
                        }
                        title="Install the scanned privileged Pi package into Ambient-managed disabled state."
                        onClick={() => void installPiPrivilegedPackage(piPackageSourceInput)}
                      >
                        {piPrivilegedInstalling ? "Installing" : "Install disabled"}
                      </button>
                    </div>
                    {piPackageCatalog.sourceNotes.map((note) => (
                      <p className="panel-note" key={note}>{note}</p>
                    ))}
                    {piExtensionSandboxFallback && (
                      <section className="plugin-row pi-package-row">
                        <div className="plugin-row-header">
                          <strong>Sandbox fallback: {piExtensionSandboxFallback.packageName ?? piExtensionSandboxFallback.source}</strong>
                          <div className="plugin-row-actions">
                            {piExtensionSandboxFallback.version && <span>{piExtensionSandboxFallback.version}</span>}
                            <span>{piPrivilegedScanning ? "Scanning privileged" : "Use privileged review"}</span>
                          </div>
                        </div>
                        <p>
                          This package could not be installed in the sandboxed Pi tool host. Ambient is scanning it for the disabled privileged install path instead.
                        </p>
                        <div className="plugin-badges">
                          <span>Sandbox blocked</span>
                          {piExtensionSandboxFallback.entrypoint && <span>{piExtensionSandboxFallback.entrypoint}</span>}
                          <span>{piExtensionSandboxFallback.allowedNetworkHosts.length ? `Network: ${piExtensionSandboxFallback.allowedNetworkHosts.join(", ")}` : "No network"}</span>
                        </div>
                        <div className="plugin-note-list">
                          {piExtensionSandboxFallback.errors.slice(0, 6).map((error) => (
                            <span key={error}>{error}</span>
                          ))}
                        </div>
                      </section>
                    )}
                    {piPrivilegedScan && (
                      <section className="plugin-row pi-package-row">
                        <div className="plugin-row-header">
                          <strong>Privileged Scan: {piPrivilegedScan.packageName}</strong>
                          <div className="plugin-row-actions">
                            <span>{piPrivilegedScan.version ?? "unversioned"}</span>
                            <span>{piPrivilegedScan.findings.length} finding{piPrivilegedScan.findings.length === 1 ? "" : "s"}</span>
                          </div>
                        </div>
                        {piPrivilegedScan.description && <p>{piPrivilegedScan.description}</p>}
                        <div className="plugin-badges">
                          <span>{piPrivilegedScan.recommendation === "privileged-review-required" ? "Privileged review required" : "Sandbox eligible"}</span>
                          <span>{piPrivilegedScan.scanOrigin === "sandbox-fallback" ? "From sandbox fallback" : "Explicit privileged scan"}</span>
                          <span>{piPrivilegedScan.resources.piExtensions.length} Pi extension{piPrivilegedScan.resources.piExtensions.length === 1 ? "" : "s"}</span>
                          <span>{piPrivilegedScan.resources.bins.length} command surface{piPrivilegedScan.resources.bins.length === 1 ? "" : "s"}</span>
                          <span>{piPrivilegedScan.resources.mcpServers.length || piPrivilegedScan.riskSummary.mcpServers ? "MCP config detected" : "No MCP config"}</span>
                          <span>{piPrivilegedScan.fingerprint.slice(0, 12)}</span>
                        </div>
                        {piPrivilegedScan.findings.length > 0 && (
                          <div className="plugin-note-list">
                            {piPrivilegedScan.findings.slice(0, 10).map((finding) => (
                              <span key={`${finding.category}:${finding.message}`}>[{finding.severity}] {finding.category}: {finding.message}</span>
                            ))}
                          </div>
                        )}
                        <div className="plugin-note-list">
                          <span>Install disabled keeps this package inactive; Ambient will not activate hooks, MCP servers, commands, background processes, or Pi settings changes.</span>
                          <span>{piPrivilegedScan.caveat}</span>
                        </div>
                        <code className="plugin-cache-path">{piPrivilegedScan.source}</code>
                      </section>
                    )}
                    {piPackageCatalog.packages.map((pkg) => (
                      (() => {
                        const installAction = piPackageInstallActionState(pkg, piPackageInstalling, piPackageInstallScope);
                        const uninstallAction = piPackageUninstallActionState(pkg, piPackageUninstalling);
                        const enableAction = piPackageEnableActionState(pkg, piPackageEnabling === pkg.id);
                        return (
                          <section className="plugin-row pi-package-row" key={pkg.id}>
                            <div className="plugin-row-header">
                              <strong>{pkg.name}</strong>
                              <div className="plugin-row-actions">
                                {installAction.visible && (
                                  <button
                                    type="button"
                                    className="panel-button mini"
                                    disabled={installAction.disabled}
                                    title={installAction.title}
                                    onClick={() => void installPiPackage(pkg.packageSpec!)}
                                  >
                                    {installAction.label}
                                  </button>
                                )}
                                {uninstallAction.visible && (
                                  <button
                                    type="button"
                                    className="panel-button mini"
                                    disabled={uninstallAction.disabled}
                                    title={uninstallAction.title}
                                    onClick={() => void uninstallPiPackage(pkg.id)}
                                  >
                                    {uninstallAction.label}
                                  </button>
                                )}
                                {enableAction.visible && (
                                  <label
                                    className="plugin-toggle"
                                    title={enableAction.title}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={Boolean(pkg.enabled)}
                                      disabled={enableAction.disabled}
                                      onChange={(event) => void setPiPackageEnabled(pkg.id, event.target.checked)}
                                    />
                                    <span>{enableAction.label}</span>
                                  </label>
                                )}
                                <span>{pkg.version ?? pkg.sourceLabel}</span>
                              </div>
                            </div>
                            {pkg.description && <p>{pkg.description}</p>}
                            <div className="plugin-badges">
                              <span>{pkg.sourceLabel}</span>
                              {pkg.installScope && <span>{formatTaskState(pkg.installScope)} scope</span>}
                              <span>{pkg.installed ? "Ambient installed" : "Inspect only"}</span>
                              <span>{pkg.enabled ? "Enabled" : "Disabled"}</span>
                              <span className={`plugin-tier ${pkg.compatibilityTier}`}>{formatPluginCompatibility(pkg.compatibilityTier)}</span>
                              <span>{formatPiResourceCounts(pkg.resourceCounts)}</span>
                              {pkg.dependencyStatus?.required && <span>{formatPiDependencyStatus(pkg.dependencyStatus)}</span>}
                              {pkg.dependencyStatus?.missingPackages.length ? (
                                <span>Missing {pkg.dependencyStatus.missingPackages.slice(0, 4).join(", ")}</span>
                              ) : null}
                            </div>
                            {pkg.compatibilityNotes.length > 0 && (
                              <div className="plugin-note-list">
                                {pkg.compatibilityNotes.map((note) => (
                                  <span key={note}>{note}</span>
                                ))}
                              </div>
                            )}
                            {pkg.packageSpec && <code className="plugin-cache-path">{pkg.packageSpec}</code>}
                          </section>
                        );
                      })()
                    ))}
                    {piExtensionSandboxCatalog && (
                      <section className="plugin-import-section pi-package-subsection">
                        <div className="panel-section-heading">
                          <strong>Sandboxed Pi Tools</strong>
                          <span>{piExtensionSandboxCatalog.packages.length} installed</span>
                        </div>
                        {piExtensionSandboxCatalog.errors.map((error) => (
                          <p className="panel-note error" key={error}>{error}</p>
                        ))}
                        {piExtensionSandboxCatalog.packages.length === 0 ? (
                          <p className="panel-note">No sandboxed Pi tool packages are installed.</p>
                        ) : (
                          piExtensionSandboxCatalog.packages.map((pkg) => {
                            const uninstallAction = piExtensionSandboxUninstallActionState(pkg, piExtensionSandboxUninstalling);
                            const detailId = `sandbox:${pkg.id}`;
                            const detailsOpen = selectedPiPackageDetailId === detailId;
                            const auditEntries = piPackageAuditEntries(permissionAudit, { packageName: pkg.name, packageId: pkg.id, source: pkg.source });
                            return (
                              <section className="plugin-row pi-package-row" key={pkg.id}>
                                <div className="plugin-row-header">
                                  <strong>{pkg.name}</strong>
                                  <div className="plugin-row-actions">
                                    <button
                                      type="button"
                                      className="panel-button mini"
                                      onClick={() => setSelectedPiPackageDetailId(detailsOpen ? undefined : detailId)}
                                    >
                                      {detailsOpen ? "Hide details" : "Details"}
                                    </button>
                                    <button
                                      type="button"
                                      className="panel-button mini"
                                      disabled={uninstallAction.disabled}
                                      title={uninstallAction.title}
                                      onClick={() => void uninstallPiExtensionSandboxPackage(pkg.id)}
                                    >
                                      {uninstallAction.label}
                                    </button>
                                    <span>{pkg.version ?? "installed"}</span>
                                  </div>
                                </div>
                                {pkg.description && <p>{pkg.description}</p>}
                                <div className="plugin-badges">
                                  <span>Sandboxed</span>
                                  <span>{pkg.tools.length} tools</span>
                                  <span>{pkg.allowedNetworkHosts.length ? `Network: ${pkg.allowedNetworkHosts.join(", ")}` : "No network"}</span>
                                  {pkg.errors.length ? <span className="plugin-tier unsupported">Errors</span> : <span className="plugin-tier supported">Ready</span>}
                                </div>
                                {pkg.tools.length > 0 && (
                                  <div className="plugin-note-list">
                                    {pkg.tools.map((tool) => (
                                      <span key={tool.name}>{tool.name}{tool.description ? `: ${tool.description}` : ""}</span>
                                    ))}
                                  </div>
                                )}
                                {pkg.errors.length > 0 && (
                                  <div className="plugin-note-list">
                                    {pkg.errors.map((error) => (
                                      <span key={error}>{error}</span>
                                    ))}
                                  </div>
                                )}
                                <code className="plugin-cache-path">{pkg.rootPath}</code>
                                {detailsOpen && (
                                  <PiSandboxPackageDetailPanel
                                    pkg={pkg}
                                    auditEntries={auditEntries}
                                  />
                                )}
                              </section>
                            );
                          })
                        )}
                        {piExtensionSandboxCatalog.history.length > 0 && (
                          <div className="plugin-sublist pi-package-history-list">
                            <div className="panel-section-heading">
                              <strong>Removed Sandboxed Pi Tools</strong>
                              <button
                                type="button"
                                className="panel-button mini danger"
                                disabled={piExtensionSandboxClearingHistory}
                                onClick={() => void clearPiExtensionSandboxHistory()}
                              >
                                {piExtensionSandboxClearingHistory ? "Clearing" : "Clear history"}
                              </button>
                            </div>
                            {piExtensionSandboxCatalog.history.slice(0, 8).map((pkg) => {
                              const detailId = `sandbox-history:${pkg.id}:${pkg.removedAt}`;
                              const detailsOpen = selectedPiPackageDetailId === detailId;
                              const auditEntries = piPackageAuditEntries(permissionAudit, { packageName: pkg.name, packageId: pkg.id, source: pkg.source });
                              return (
                                <section className="plugin-row pi-package-row removed" key={`${pkg.id}:${pkg.removedAt}`}>
                                  <div className="plugin-row-header">
                                    <strong>{pkg.name}</strong>
                                    <div className="plugin-row-actions">
                                      <button
                                        type="button"
                                        className="panel-button mini"
                                        onClick={() => setSelectedPiPackageDetailId(detailsOpen ? undefined : detailId)}
                                      >
                                        {detailsOpen ? "Hide details" : "Details"}
                                      </button>
                                      <span>Removed {formatTimelineTime(pkg.removedAt)}</span>
                                    </div>
                                  </div>
                                  {pkg.description && <p>{pkg.description}</p>}
                                  <div className="plugin-badges">
                                    <span>Removed</span>
                                    <span>Sandboxed</span>
                                    <span>{pkg.tools.length} tools</span>
                                    <span>{pkg.removalReason}</span>
                                  </div>
                                  {detailsOpen && (
                                    <PiSandboxPackageDetailPanel
                                      pkg={pkg}
                                      auditEntries={auditEntries}
                                    />
                                  )}
                                </section>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    )}
                    {piPrivilegedCatalog && (
                      <section className="plugin-import-section pi-package-subsection">
                        <div className="panel-section-heading">
                          <strong>Privileged Pi Installs</strong>
                          <span>{piPrivilegedCatalog.packages.length} installed disabled or managed</span>
                        </div>
                        {piPrivilegedCatalog.errors.map((error) => (
                          <p className="panel-note error" key={error}>{error}</p>
                        ))}
                        {piPrivilegedCatalog.packages.length === 0 ? (
                          <p className="panel-note">No privileged Pi installs are registered.</p>
                        ) : (
                          piPrivilegedCatalog.packages.map((pkg) => {
                            const disableAction = piPrivilegedDisableActionState(pkg, piPrivilegedBusy);
                            const uninstallAction = piPrivilegedUninstallActionState(pkg, piPrivilegedBusy);
                            const detailId = `privileged:${pkg.id}`;
                            const detailsOpen = selectedPiPackageDetailId === detailId;
                            const auditEntries = piPackageAuditEntries(permissionAudit, { packageName: pkg.packageName, packageId: pkg.id, source: pkg.source });
                            const risks = Object.entries(pkg.scan.riskSummary)
                              .filter(([, detected]) => detected)
                              .map(([risk]) => risk);
                            return (
                              <section className="plugin-row pi-package-row" key={pkg.id}>
                                <div className="plugin-row-header">
                                  <strong>{pkg.packageName}</strong>
                                  <div className="plugin-row-actions">
                                    <button
                                      type="button"
                                      className="panel-button mini"
                                      onClick={() => setSelectedPiPackageDetailId(detailsOpen ? undefined : detailId)}
                                    >
                                      {detailsOpen ? "Hide details" : "Details"}
                                    </button>
                                    <button
                                      type="button"
                                      className="panel-button mini"
                                      disabled={disableAction.disabled}
                                      title={disableAction.title}
                                      onClick={() => void disablePiPrivilegedPackage(pkg.id)}
                                    >
                                      {disableAction.label}
                                    </button>
                                    <button
                                      type="button"
                                      className="panel-button mini danger"
                                      disabled={uninstallAction.disabled}
                                      title={uninstallAction.title}
                                      onClick={() => void uninstallPiPrivilegedPackage(pkg.id)}
                                    >
                                      {uninstallAction.label}
                                    </button>
                                    <span>{pkg.version ?? "installed"}</span>
                                  </div>
                                </div>
                                <p>{pkg.scan.description ?? "Privileged package installed in Ambient-managed disabled state."}</p>
                                <div className="plugin-badges">
                                  <span>{formatTaskState(pkg.status)}</span>
                                  <span>{pkg.scan.recommendation === "privileged-review-required" ? "Privileged review required" : "Sandbox eligible"}</span>
                                  <span>{pkg.scan.scanOrigin === "sandbox-fallback" ? "From sandbox fallback" : "Explicit privileged scan"}</span>
                                  <span>{pkg.scan.findings.length} findings</span>
                                  <span>{risks.length ? risks.slice(0, 4).map(formatTaskState).join(", ") : "No risk flags"}</span>
                                </div>
                                {pkg.scan.findings.length > 0 && (
                                  <div className="plugin-note-list">
                                    {pkg.scan.findings.slice(0, 8).map((finding) => (
                                      <span key={`${finding.category}:${finding.message}`}>[{finding.severity}] {finding.category}: {finding.message}</span>
                                    ))}
                                  </div>
                                )}
                                <div className="plugin-note-list">
                                  <span>Alpha install is inactive: Ambient does not activate hooks, MCP servers, commands, background processes, or Pi settings changes.</span>
                                  <span>{pkg.scan.caveat}</span>
                                </div>
                                <code className="plugin-cache-path">{pkg.rootPath}</code>
                                {detailsOpen && (
                                  <PiPrivilegedPackageDetailPanel
                                    pkg={pkg}
                                    auditEntries={auditEntries}
                                  />
                                )}
                              </section>
                            );
                          })
                        )}
                        {piPrivilegedCatalog.history.length > 0 && (
                          <div className="plugin-sublist pi-package-history-list">
                            <div className="panel-section-heading">
                              <strong>Removed Privileged Pi Installs</strong>
                              <button
                                type="button"
                                className="panel-button mini danger"
                                disabled={piPrivilegedClearingHistory}
                                onClick={() => void clearPiPrivilegedPackageHistory()}
                              >
                                {piPrivilegedClearingHistory ? "Clearing" : "Clear history"}
                              </button>
                            </div>
                            {piPrivilegedCatalog.history.slice(0, 8).map((pkg) => {
                              const detailId = `privileged-history:${pkg.id}:${pkg.removedAt}`;
                              const detailsOpen = selectedPiPackageDetailId === detailId;
                              const auditEntries = piPackageAuditEntries(permissionAudit, { packageName: pkg.packageName, packageId: pkg.id, source: pkg.source });
                              const risks = Object.entries(pkg.scan.riskSummary)
                                .filter(([, detected]) => detected)
                                .map(([risk]) => risk);
                              return (
                                <section className="plugin-row pi-package-row removed" key={`${pkg.id}:${pkg.removedAt}`}>
                                  <div className="plugin-row-header">
                                    <strong>{pkg.packageName}</strong>
                                    <div className="plugin-row-actions">
                                      <button
                                        type="button"
                                        className="panel-button mini"
                                        onClick={() => setSelectedPiPackageDetailId(detailsOpen ? undefined : detailId)}
                                      >
                                        {detailsOpen ? "Hide details" : "Details"}
                                      </button>
                                      <span>Removed {formatTimelineTime(pkg.removedAt)}</span>
                                    </div>
                                  </div>
                                  <p>{pkg.scan.description ?? "Removed privileged package retained for review."}</p>
                                  <div className="plugin-badges">
                                    <span>Removed</span>
                                    <span>{pkg.scan.scanOrigin === "sandbox-fallback" ? "From sandbox fallback" : "Explicit privileged scan"}</span>
                                    <span>{pkg.scan.findings.length} findings</span>
                                    <span>{risks.length ? risks.slice(0, 4).map(formatTaskState).join(", ") : "No risk flags"}</span>
                                  </div>
                                  {detailsOpen && (
                                    <PiPrivilegedPackageDetailPanel
                                      pkg={pkg}
                                      auditEntries={auditEntries}
                                    />
                                  )}
                                </section>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    )}
                  </section>
                )}
              </div>
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
