import type { ComponentType } from "react";
import type { DesktopState } from "../../shared/desktopTypes";
import type { SttProviderCandidate, VoiceProviderCandidate } from "../../shared/localRuntimeTypes";
import type { PermissionAuditEntry } from "../../shared/permissionTypes";
import type {
  AmbientGeneratedCapabilitySummary,
  AmbientMcpContainerRuntimeManagedInstallProgress,
  AmbientMcpContainerRuntimeStatus,
  AmbientMcpDefaultCapabilityInstallInput,
  AmbientMcpDefaultCapabilityInstallProgress,
  AmbientMcpInstalledServerSummary,
  AmbientMcpInstallPreview,
  AmbientMcpServerSearchResult,
  AmbientPluginAuthStartResult,
  AmbientPluginCapabilityDiagnostics,
  AmbientPluginRegistry,
  CapabilityBuilderHistoryEntry,
  CapabilityBuilderHistoryResult,
  CodexHostedMarketplaceReport,
  CodexPluginCatalog,
  CodexPluginMcpInspectionCatalog,
  FirstPartyGoogleIntegrationState,
  ManagedDevServerSummary,
  PiExtensionSandboxCatalog,
  PiExtensionSandboxInstallPreview,
  PiPackageCatalog,
  PiPackageInstallScope,
  PiPrivilegedCatalog,
  PiPrivilegedSecurityScan,
  PluginMcpRuntimeSnapshot,
} from "../../shared/pluginTypes";
import type { AmbientPluginRuntimeFilter, AmbientPluginSourceFilter, GoogleWorkspaceValidationFeedback } from "./pluginUiModel";
import type { ApiKeyStatus } from "./RightPanelSettingsRuntime";

export type MaybePromise<T = unknown> = T | Promise<T>;

export type InfoTooltipProps = {
  label?: string;
  text: string;
  className?: string;
};

export type PluginPanelView = "home" | "marketplace" | "installed" | "capabilities" | "mcp" | "sources" | "diagnostics";

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
