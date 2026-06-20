import { ReactNode, useEffect } from "react";
import type { AgentMemoryClearResult, AgentMemoryEmbeddingLifecycleActionKind, AgentMemoryEmbeddingLifecycleActionResult, AgentMemoryStorageDiagnostics } from "../../shared/agentMemoryDiagnostics";
import type { BrowserCapabilityState, BrowserUserActionState } from "../../shared/browserTypes";
import type { DesktopState, ThemePreference } from "../../shared/desktopTypes";
import type { DiagnosticExportResult } from "../../shared/diagnosticTypes";
import type { LocalDeepResearchInstallProgress, LocalDeepResearchRunHistoryResult, LocalModelRuntimeLifecycleActionInput, LocalModelRuntimeLifecycleActionResult, MiniCpmVisionDiagnosticItem, MiniCpmVisionSetupAction, MiniCpmVisionSetupResult, SttProviderCandidate, SttProviderSetupResult, SttTestAudioResult, VoiceProviderCandidate } from "../../shared/localRuntimeTypes";
import type { AmbientPermissionGrant, PermissionAuditEntry } from "../../shared/permissionTypes";
import type { AmbientMcpContainerRuntimeManagedInstallProgress, AmbientMcpDefaultCapabilityInstallProgress, ModelProviderCredentialSaveResult } from "../../shared/pluginTypes";
import type { InstallModelProviderEndpointInput, InstallModelProviderEndpointResult, SaveModelProviderCredentialInput } from "../../shared/threadTypes";
import type { GitReviewSummary, WorkspaceContextReference } from "../../shared/workspaceTypes";
import {
  type LocalDeepResearchDiagnosticItem,
  type LocalDeepResearchSetupAction,
  type LocalDeepResearchSetupResult,
} from "./localDeepResearchUiModel";
import type { CapabilityBuilderPromptResult } from "./AppCapabilityPromptActions";
import { useRightPanelCapabilityBuilderController } from "./RightPanelCapabilityBuilderController";
import { useRightPanelBrowserController } from "./RightPanelBrowserController";
import { RightPanelBrowserPane } from "./RightPanelBrowserPane";
import {
  BrowserProfileCopyDialog,
  fileIconForEntry,
  fileTreeEntryTitle,
  GitConfirmationDialog,
} from "./RightPanelDetailPanels";
import { useRightPanelDiagnosticsController } from "./RightPanelDiagnosticsController";
import {
  CapabilityBuilderLauncherDialog,
  McpContainerRuntimeDialog,
} from "./RightPanelDialogs";
import { RightPanelContextPane } from "./RightPanelContextPane";
import { FilePreview, formatPanelFileSize } from "./RightPanelFilePreview";
import { useRightPanelGitController } from "./RightPanelGitController";
import { RightPanelGitPane } from "./RightPanelGitPane";
import { useRightPanelGoogleIntegrationBridge } from "./RightPanelGoogleIntegrationBridge";
import { useRightPanelMcpController } from "./RightPanelMcpController";
import { useRightPanelPiPackageController } from "./RightPanelPiPackageController";
import { useRightPanelPluginAuthController } from "./RightPanelPluginAuthController";
import { useRightPanelPluginCatalogController } from "./RightPanelPluginCatalogController";
import { RightPanelPluginsPane } from "./RightPanelPluginsPane";
import { RichText } from "./RightPanelRichText";
import { useRightPanelSettingsController } from "./RightPanelSettingsController";
import { RightPanelSettingsPane } from "./RightPanelSettingsPane";
import { formatTimelineTime } from "./RightPanelSettingsRuntime";
import { RightPanelShell } from "./RightPanelShell";
import { InfoTooltip, PermissionFullAccessReceiptList } from "./RightPanelStatusWidgets";
import {
  fileContextReference,
  useRightPanelFilesController,
  useRightPanelSearchController,
  useRightPanelTerminalController,
} from "./RightPanelUtilityPaneControllers";
import {
  RightPanelFilesPane,
  RightPanelSearchPane,
  RightPanelTerminalPane,
} from "./RightPanelUtilityPanes";
import type { SttMicrophoneDevice, SttMicrophoneLevel } from "./sttMicrophoneRecorder";
import "./styles.css";
export {
  contextAttachmentKey,
  formatTaskState,
  GitConfirmationDialog,
  truncateUiText,
} from "./RightPanelDetailPanels";
export type { GitConfirmation } from "./RightPanelDetailPanels";
export {
  formatHtmlPreviewAutoPauseLabel,
  formatPanelFileSize,
  HTML_PREVIEW_AUTO_PAUSE_MS,
  LazyHtmlPreview,
  OpenTargetIcon,
} from "./RightPanelFilePreview";
export { DiffOutput } from "./RightPanelGitPane";
export {
  ambientBrowserRuntimeForUrl,
  clampNumber,
  externalLinkMenuLabel,
  InlineArtifactMedia,
  isAbsoluteFilePath,
  isHtmlArtifactPath,
  preferredWorkspaceOpenTarget,
  RichText,
  stripLinkLineSuffix,
  workspaceAbsoluteArtifactPath,
} from "./RightPanelRichText";
export type { LinkContextMenuState } from "./RightPanelRichText";
export {
  contextUsagePresentation,
  desktopUpdateStatusText,
  thinkingDisplayOptions,
} from "./RightPanelSettingsCore";
export {
  DiagnosticExportHistory,
  formatBytes,
  formatDurationMs,
  formatTimelineTime,
  LocalDeepResearchDiagnosticsList,
  LocalModelsRuntimeInventory,
  LocalRuntimeEvidenceDiagnostics,
  ModelRuntimeCatalogDiagnostics,
  ProviderCatalogSettingsCards,
  SubagentRepairDiagnostics,
  SubagentReplayEvidenceDiagnostics,
} from "./RightPanelSettingsRuntime";
export type { ApiKeyStatus } from "./RightPanelSettingsRuntime";
export { InfoTooltip, PermissionFullAccessReceiptList } from "./RightPanelStatusWidgets";

export type UtilityPanel =
  | "terminal"
  | "files"
  | "diff"
  | "search"
  | "browser"
  | "plugins"
  | "settings"
  | "attachments"
  | "performance";


export type SettingsFocusRequest = {
  section: "voice" | "mcp-runtime" | "search-web";
  nonce: number;
};


export type ArtifactPreviewRequest = { path: string; nonce: number };


export type GitPanelTabRequest = { tab: "summary" | "review"; nonce: number };


export type VoiceProviderCacheStatus = {
  lastRequestedAt?: string;
  lastCompletedAt?: string;
  lastTrigger?: string;
  providerCount: number;
  lastCatalogRefresh?: {
    providerLabel: string;
    voiceCount: number;
    refreshedAt: string;
    durationMs: number;
  };
  error?: string;
};


export type VoiceProviderCacheActivity = {
  id: string;
  at: string;
  trigger: string;
  status: "success" | "error";
  providerCount: number;
  availableCount: number;
  unavailableCount: number;
  changes: string[];
  error?: string;
};


export type VoiceCatalogRefreshState = {
  providerCapabilityId: string;
  status: "running" | "success" | "error";
  message?: string;
};


export type SttProviderCacheStatus = {
  lastRequestedAt?: string;
  lastCompletedAt?: string;
  lastTrigger?: string;
  providerCount: number;
  error?: string;
};


export type SttProviderCacheActivity = {
  id: string;
  at: string;
  trigger: string;
  status: "success" | "error";
  providerCount: number;
  availableCount: number;
  unavailableCount: number;
  changes: string[];
  error?: string;
};


export type SttProviderSetupUiState = {
  status: "idle" | "running" | "success" | "error";
  action?: "install" | "repair" | "validate";
  message?: string;
  result?: SttProviderSetupResult;
};


export type MiniCpmVisionSetupUiState = {
  status: "idle" | "running" | "success" | "error";
  action?: MiniCpmVisionSetupAction;
  message?: string;
  result?: MiniCpmVisionSetupResult;
  diagnostics?: MiniCpmVisionDiagnosticItem[];
};


export type LocalDeepResearchSetupUiState = {
  status: "idle" | "running" | "success" | "error";
  action?: LocalDeepResearchSetupAction;
  message?: string;
  result?: LocalDeepResearchSetupResult;
  diagnostics?: LocalDeepResearchDiagnosticItem[];
  progress?: LocalDeepResearchInstallProgress;
};


export type LocalDeepResearchRunHistoryUiState = {
  status: "idle" | "loading" | "success" | "error";
  message?: string;
  result?: LocalDeepResearchRunHistoryResult;
};


export type SttMicTestUiState = {
  status: "idle" | "recording" | "saving" | "validating" | "success" | "error";
  message?: string;
  audio?: SttTestAudioResult;
  level?: SttMicrophoneLevel;
};


export function RightPanel({
  panel,
  panelWidth,
  state,
  workspaceRevision,
  pluginCatalogRevision,
  permissionAuditRevision,
  browserRevision,
  orchestrationRevision,
  orchestrationAutoRevision,
  workflowRevision,
  artifactPreviewRequest,
  localFilePreviewRequest,
  gitPanelTabRequest,
  settingsFocusRequest,
  contextAttachments,
  permissionAudit,
  permissionGrants,
  permissionAuditError,
  permissionGrantError,
  permissionGrantRevoking,
  voiceProviders,
  voiceProvidersLoading,
  voiceProvidersError,
  voiceProviderCacheStatus,
  voiceProviderCacheActivity,
  voiceCatalogRefresh,
  sttProviders,
  sttProvidersLoading,
  sttProvidersError,
  sttProviderCacheStatus,
  sttProviderCacheActivity,
  sttProviderSetup,
  sttMicrophoneDevices,
  sttMicrophoneDevicesLoading,
  sttMicrophoneDevicesError,
  miniCpmVisionSetup,
  miniCpmVisionRuntimePath,
  miniCpmVisionEndpointUrl,
  localDeepResearchSetup,
  localDeepResearchQ8Override,
  localDeepResearchRunHistory,
  sttMicTest,
  mcpContainerRuntimeInstallProgress,
  mcpDefaultCapabilityInstallProgress,
  searchRoutingHydrating,
  searchRoutingHydrationError,
  agentMemoryDiagnostics,
  agentMemoryDiagnosticsLoading,
  agentMemoryDiagnosticsError,
  agentMemoryEmbeddingActionLoading,
  agentMemoryEmbeddingActionResult,
  agentMemoryEmbeddingActionError,
  updateBusy,
  running,
  onLoadPermissionAudit,
  onLoadPermissionGrants,
  onRevokePermissionGrant,
  onRevokePermissionGrantIds,
  onOpenApiKey,
  onCheckUpdates,
  onThemePreferenceChange,
  onMediaPlaybackSettingsChange,
  onThinkingDisplaySettingsChange,
  onModelRuntimeSettingsChange,
  onSaveModelProviderCredential,
  onInstallModelProviderEndpoint,
  onRunLocalModelRuntimeLifecycleAction,
  onFeatureFlagSettingsChange,
  onMemorySettingsChange,
  onApplyMemorySettingsSnapshot,
  onActiveThreadMemoryEnabledChange,
  onRefreshAgentMemoryDiagnostics,
  onRunAgentMemoryEmbeddingLifecycleAction,
  onClearAgentMemory,
  onPlannerSettingsChange,
  onHydrateSearchRoutingSettings,
  onSearchRoutingSettingsChange,
  onLocalDeepResearchSettingsChange,
  onOpenAmbientCliSecretDialog,
  onVoiceSettingsChange,
  onLoadVoiceProviders,
  onRefreshVoiceCatalog,
  onSttSettingsChange,
  onLoadSttProviders,
  onLoadSttMicrophoneDevices,
  onSetupSttProvider,
  onSetupMiniCpmVisionProvider,
  onMiniCpmVisionRuntimePathChange,
  onMiniCpmVisionEndpointUrlChange,
  onSetupLocalDeepResearch,
  onLocalDeepResearchQ8OverrideChange,
  onLoadLocalDeepResearchRunHistory,
  onStartSttMicTest,
  onStopSttMicTest,
  onCancelSttMicTest,
  onClearMcpContainerRuntimeInstallProgress,
  onClearMcpDefaultCapabilityInstallProgress,
  onExportDiagnostics,
  onImportDiagnostics,
  onSelectThread,
  onAddContext,
  onRemoveContext,
  onClearContext,
  onContextError,
  onGitReviewChanged,
  onWorkspaceChanged,
  onStartCapabilityBuilder,
  onOpenPluginCapabilities,
  onOpenMcpRuntimeSettings,
  onDefaultCapabilityInstalled,
  onBrowserUserActionCompleted,
  onClose,
}: {
  panel: UtilityPanel;
  panelWidth: number;
  state: DesktopState;
  workspaceRevision: number;
  pluginCatalogRevision: number;
  permissionAuditRevision: number;
  browserRevision: number;
  orchestrationRevision: number;
  orchestrationAutoRevision: number;
  workflowRevision: number;
  artifactPreviewRequest?: ArtifactPreviewRequest;
  localFilePreviewRequest?: ArtifactPreviewRequest;
  gitPanelTabRequest: GitPanelTabRequest;
  settingsFocusRequest?: SettingsFocusRequest;
  contextAttachments: WorkspaceContextReference[];
  permissionAudit: PermissionAuditEntry[];
  permissionGrants: AmbientPermissionGrant[];
  permissionAuditError?: string;
  permissionGrantError?: string;
  permissionGrantRevoking?: string;
  voiceProviders: VoiceProviderCandidate[];
  voiceProvidersLoading: boolean;
  voiceProvidersError?: string;
  voiceProviderCacheStatus: VoiceProviderCacheStatus;
  voiceProviderCacheActivity: VoiceProviderCacheActivity[];
  voiceCatalogRefresh?: VoiceCatalogRefreshState;
  sttProviders: SttProviderCandidate[];
  sttProvidersLoading: boolean;
  sttProvidersError?: string;
  sttProviderCacheStatus: SttProviderCacheStatus;
  sttProviderCacheActivity: SttProviderCacheActivity[];
  sttProviderSetup: SttProviderSetupUiState;
  sttMicrophoneDevices: SttMicrophoneDevice[];
  sttMicrophoneDevicesLoading: boolean;
  sttMicrophoneDevicesError?: string;
  miniCpmVisionSetup: MiniCpmVisionSetupUiState;
  miniCpmVisionRuntimePath: string;
  miniCpmVisionEndpointUrl: string;
  localDeepResearchSetup: LocalDeepResearchSetupUiState;
  localDeepResearchQ8Override: boolean;
  localDeepResearchRunHistory: LocalDeepResearchRunHistoryUiState;
  sttMicTest: SttMicTestUiState;
  mcpContainerRuntimeInstallProgress?: AmbientMcpContainerRuntimeManagedInstallProgress;
  mcpDefaultCapabilityInstallProgress?: AmbientMcpDefaultCapabilityInstallProgress;
  searchRoutingHydrating: boolean;
  searchRoutingHydrationError?: string;
  agentMemoryDiagnostics?: AgentMemoryStorageDiagnostics;
  agentMemoryDiagnosticsLoading: boolean;
  agentMemoryDiagnosticsError?: string;
  agentMemoryEmbeddingActionLoading?: AgentMemoryEmbeddingLifecycleActionKind;
  agentMemoryEmbeddingActionResult?: AgentMemoryEmbeddingLifecycleActionResult;
  agentMemoryEmbeddingActionError?: string;
  updateBusy: boolean;
  running: boolean;
  onLoadPermissionAudit: () => Promise<void>;
  onLoadPermissionGrants: () => Promise<void>;
  onRevokePermissionGrant: (id: string) => Promise<void>;
  onRevokePermissionGrantIds: (ids: string[], busyId: string) => Promise<void>;
  onOpenApiKey: () => void;
  onCheckUpdates: () => void;
  onThemePreferenceChange: (themePreference: ThemePreference) => Promise<void>;
  onMediaPlaybackSettingsChange: (media: DesktopState["settings"]["media"]) => void;
  onThinkingDisplaySettingsChange: (thinkingDisplay: DesktopState["settings"]["thinkingDisplay"]) => void;
  onModelRuntimeSettingsChange: (modelRuntime: DesktopState["settings"]["modelRuntime"]) => void;
  onSaveModelProviderCredential: (input: SaveModelProviderCredentialInput) => Promise<ModelProviderCredentialSaveResult>;
  onInstallModelProviderEndpoint: (input: InstallModelProviderEndpointInput) => Promise<InstallModelProviderEndpointResult>;
  onRunLocalModelRuntimeLifecycleAction: (input: LocalModelRuntimeLifecycleActionInput) => Promise<LocalModelRuntimeLifecycleActionResult>;
  onFeatureFlagSettingsChange: (featureFlags: DesktopState["settings"]["featureFlags"]) => void;
  onMemorySettingsChange: (memory: DesktopState["settings"]["memory"]) => void;
  onApplyMemorySettingsSnapshot: (memory: DesktopState["settings"]["memory"]) => void;
  onActiveThreadMemoryEnabledChange: (enabled: boolean) => void;
  onRefreshAgentMemoryDiagnostics: () => Promise<void>;
  onRunAgentMemoryEmbeddingLifecycleAction: (action: AgentMemoryEmbeddingLifecycleActionKind) => Promise<AgentMemoryEmbeddingLifecycleActionResult | undefined>;
  onClearAgentMemory: () => Promise<AgentMemoryClearResult>;
  onPlannerSettingsChange: (planner: DesktopState["settings"]["planner"]) => void;
  onHydrateSearchRoutingSettings: () => void;
  onSearchRoutingSettingsChange: (search: DesktopState["settings"]["search"]) => void;
  onLocalDeepResearchSettingsChange: (localDeepResearch: DesktopState["settings"]["localDeepResearch"]) => void;
  onOpenAmbientCliSecretDialog: (input?: { packageId?: string; packageName?: string; envName?: string }) => void;
  onVoiceSettingsChange: (voice: DesktopState["settings"]["voice"]) => void;
  onLoadVoiceProviders: (trigger?: string) => Promise<void>;
  onRefreshVoiceCatalog: (providerCapabilityId: string) => void;
  onSttSettingsChange: (stt: DesktopState["settings"]["stt"]) => void;
  onLoadSttProviders: (trigger?: string) => Promise<void>;
  onLoadSttMicrophoneDevices: (requestPermission?: boolean) => void;
  onSetupSttProvider: (action: "install" | "repair" | "validate") => void;
  onSetupMiniCpmVisionProvider: (action: MiniCpmVisionSetupAction) => void;
  onMiniCpmVisionRuntimePathChange: (value: string) => void;
  onMiniCpmVisionEndpointUrlChange: (value: string) => void;
  onSetupLocalDeepResearch: (action: LocalDeepResearchSetupAction) => void;
  onLocalDeepResearchQ8OverrideChange: (value: boolean) => void;
  onLoadLocalDeepResearchRunHistory: () => void;
  onStartSttMicTest: () => void;
  onStopSttMicTest: () => void;
  onCancelSttMicTest: () => void;
  onClearMcpContainerRuntimeInstallProgress: () => void;
  onClearMcpDefaultCapabilityInstallProgress: () => void;
  onExportDiagnostics: () => Promise<DiagnosticExportResult | undefined>;
  onImportDiagnostics: () => Promise<DiagnosticExportResult | undefined>;
  onSelectThread: (threadId: string, workspacePath?: string) => Promise<void>;
  onAddContext: (items: WorkspaceContextReference[]) => void;
  onRemoveContext: (item: WorkspaceContextReference) => void;
  onClearContext: () => void;
  onContextError: (message: string | undefined) => void;
  onGitReviewChanged: (review: GitReviewSummary | undefined) => void;
  onWorkspaceChanged: () => void;
  onStartCapabilityBuilder: (prompt: string, newChat: boolean, activityLine?: string) => Promise<CapabilityBuilderPromptResult>;
  onOpenPluginCapabilities: () => void;
  onOpenMcpRuntimeSettings: () => void;
  onDefaultCapabilityInstalled: () => void;
  onBrowserUserActionCompleted: (action: BrowserUserActionState, browserState: BrowserCapabilityState) => Promise<void>;
  onClose: () => void;
}) {
  const searchPane = useRightPanelSearchController({
    panel,
    workspacePath: state.workspace.path,
    activeThreadId: state.activeThreadId,
  });
  const filesPane = useRightPanelFilesController({
    panel,
    activeWorkspacePath: state.activeWorkspace.path,
    workspaceRevision,
    panelWidth,
    artifactPreviewRequest,
    localFilePreviewRequest,
  });
  const gitPane = useRightPanelGitController({
    panel,
    activeWorkspacePath: state.activeWorkspace.path,
    workspacePath: state.workspace.path,
    workspaceRevision,
    gitPanelTabRequest,
    onGitReviewChanged,
    onWorkspaceChanged,
  });
  const terminalPane = useRightPanelTerminalController({
    panel,
    activeWorkspacePath: state.activeWorkspace.path,
    eventWorkspacePath: state.workspace.path,
    activeThreadId: state.activeThreadId,
    permissionMode: state.settings.permissionMode,
  });
  const diagnosticsPane = useRightPanelDiagnosticsController({
    onExportDiagnostics,
    onImportDiagnostics,
  });
  const {
    browserState,
    browserUrl,
    setBrowserUrl,
    browserSearch,
    setBrowserSearch,
    browserPickPrompt,
    setBrowserPickPrompt,
    browserBusy,
    browserUserActionBusy,
    browserError,
    browserStatus,
    latestBrowserScreenshot,
    visualAnalysisBusy,
    visualAnalysisStatus,
    visualAnalysisDiagnostics,
    browserCopyDialogOpen,
    setBrowserCopyDialogOpen,
    browserFocused,
    setBrowserFocused,
    browserInspectResult,
    browserCredentials,
    browserCredentialForm,
    setBrowserCredentialForm,
    browserCredentialBusy,
    browserCredentialStatus,
    browserHostRef,
    loadBrowserState,
    loadBrowserCredentials,
    resetBrowserCredentialForm,
    editBrowserCredential,
    saveBrowserCredential,
    deleteBrowserCredential,
    startBrowser,
    stopBrowser,
    clearIsolatedBrowserProfile,
    copyChromeProfile,
    clearCopiedChromeProfile,
    navigateBrowser,
    refreshBrowserPage,
    searchBrowser,
    screenshotBrowser,
    analyzeLatestBrowserScreenshot,
    analyzeContextAttachmentWithMiniCpm,
    analyzeWorkspaceFileWithMiniCpm,
    revealBrowser,
    copyBrowserInspectReference,
    pickBrowserElement,
    cancelBrowserPicker,
    resumeBrowserUserAction,
    cancelBrowserUserAction,
  } = useRightPanelBrowserController({
    panel,
    workspacePath: state.activeWorkspace.path,
    browserRevision,
    onBrowserUserActionCompleted,
  });
  const mcpPane = useRightPanelMcpController({
    activeWorkspacePath: state.activeWorkspace.path,
    workspacePath: state.workspace.path,
    onClearMcpContainerRuntimeInstallProgress,
    onClearMcpDefaultCapabilityInstallProgress,
    onDefaultCapabilityInstalled,
  });
  const settingsPane = useRightPanelSettingsController({
    panel,
    running,
    activeThreadId: state.activeThreadId,
    activeThreadMemoryEnabled: Boolean(state.threads.find((thread) => thread.id === state.activeThreadId)?.memoryEnabled),
    workspacePath: state.workspace.path,
    activeWorkspacePath: state.activeWorkspace.path,
    permissionAuditRevision,
    settings: state.settings,
    providerCatalogCards: state.providerCatalog.cards,
    subagentsEffectiveEnabled: Boolean(state.featureFlagSnapshot?.flags["ambient.subagents"]?.enabled),
    settingsFocusRequest,
    mcp: {
      refreshContainerRuntimeStatus: mcpPane.refreshContainerRuntimeStatus,
      loadInstalledServers: mcpPane.loadInstalledServers,
      loadManagedDevServers: mcpPane.loadManagedDevServers,
    },
    onLoadPermissionAudit,
    onLoadPermissionGrants,
    onLoadVoiceProviders,
    onRefreshAgentMemoryDiagnostics,
    onClearAgentMemory,
    onStartCapabilityBuilder,
    onHydrateSearchRoutingSettings,
    onApplyMemorySettingsSnapshot,
    onSttSettingsChange,
    onSaveModelProviderCredential,
    onInstallModelProviderEndpoint,
    onRunLocalModelRuntimeLifecycleAction,
  });
  async function runAgentMemoryEmbeddingLifecycleActionFromSettings(action: AgentMemoryEmbeddingLifecycleActionKind) {
    const result = await onRunAgentMemoryEmbeddingLifecycleAction(action);
    if (result?.starterStatus) {
      settingsPane.applyAgentMemoryStarterStatus(result.starterStatus);
      return;
    }
    await settingsPane.loadAgentMemoryStarterStatus();
  }
  const googleIntegrationBridge = useRightPanelGoogleIntegrationBridge();
  const pluginCatalogPane = useRightPanelPluginCatalogController({
    workspacePath: state.activeWorkspace.path,
    onStartCapabilityBuilder,
    onGoogleIntegrationChanged: googleIntegrationBridge.onGoogleIntegrationChanged,
    mcp: {
      prepareCatalogLoad: mcpPane.prepareCatalogLoad,
      clearInspection: mcpPane.clearInspection,
      clearRuntimeSnapshots: mcpPane.clearRuntimeSnapshots,
      setRuntimeSnapshots: mcpPane.setRuntimeSnapshots,
      setManagedDevServers: mcpPane.setManagedDevServers,
    },
  });
  const pluginAuthPane = useRightPanelPluginAuthController({
    panel,
    workspacePath: state.activeWorkspace.path,
    googleIntegration: googleIntegrationBridge.googleIntegration,
    onGoogleIntegrationChanged: googleIntegrationBridge.onGoogleIntegrationChanged,
    loadAmbientPluginRegistry: pluginCatalogPane.loadAmbientPluginRegistry,
    setPluginCatalogError: pluginCatalogPane.setPluginCatalogError,
  });
  const capabilityBuilderLauncher = useRightPanelCapabilityBuilderController({
    running,
    onStartCapabilityBuilder,
  });
  const piPackagePane = useRightPanelPiPackageController({
    panel,
    resetWorkspacePath: state.activeWorkspace.path,
    eventWorkspacePath: state.workspace.path,
    onLoadPermissionAudit,
    loadAmbientPluginRegistry: pluginCatalogPane.loadAmbientPluginRegistry,
    loadPluginCatalog: pluginCatalogPane.loadPluginCatalog,
  });

  const title =
    panel === "terminal"
      ? "Terminal"
      : panel === "files"
        ? "Files"
        : panel === "diff"
          ? "Diff"
          : panel === "search"
            ? "Search"
            : panel === "browser"
              ? "Browser"
                : panel === "plugins"
                  ? "Plugins"
                  : panel === "attachments"
                    ? "Context"
                    : panel === "performance"
                      ? "Performance"
                      : "Settings";

  useEffect(() => {
    if (panel === "plugins") {
      pluginCatalogPane.setPluginView("capabilities");
      void pluginCatalogPane.loadPluginCatalog();
      void pluginCatalogPane.loadCapabilityBuilderHistory();
      void mcpPane.loadInstalledServers();
      void mcpPane.loadManagedDevServers();
      void mcpPane.refreshContainerRuntimeStatus(true, { continueDefaultCapabilitySetup: true });
      void mcpPane.searchRegistryServers(false);
    }
  }, [panel, state.workspace.path]);

  useEffect(() => {
    if (panel === "plugins" && pluginCatalogRevision > 0) {
      void pluginCatalogPane.loadPluginCatalog();
      void pluginCatalogPane.loadCapabilityBuilderHistory();
      void piPackagePane.inspectPiPackages();
      void mcpPane.loadInstalledServers();
      void mcpPane.loadManagedDevServers();
    }
  }, [pluginCatalogRevision]);

  let body: ReactNode;
  if (panel === "terminal") {
    body = (
      <RightPanelTerminalPane
        terminal={terminalPane.terminal}
        terminalOutput={terminalPane.terminalOutput}
        terminalInput={terminalPane.terminalInput}
        terminalError={terminalPane.terminalError}
        permissionMode={state.settings.permissionMode}
        terminalOutputRef={terminalPane.terminalOutputRef}
        terminalCommandInputRef={terminalPane.terminalCommandInputRef}
        onTerminalInputChange={terminalPane.updateTerminalInput}
        onTerminalKey={terminalPane.handleTerminalKey}
        onTerminalPaste={terminalPane.handleTerminalPaste}
        onSendTerminalInput={() => terminalPane.sendTerminalInput()}
      />
    );
  } else if (panel === "search") {
    body = (
      <RightPanelSearchPane
        query={searchPane.query}
        searchScope={searchPane.searchScope}
        searchScopeOptions={searchPane.searchScopeOptions}
        searchResults={searchPane.searchResults}
        searchBusy={searchPane.searchBusy}
        searchError={searchPane.searchError}
        searchScopePlaceholder={searchPane.searchScopePlaceholder}
        searchScopeLabel={searchPane.searchScopeLabel}
        onQueryChange={searchPane.setQuery}
        onSearchScopeChange={searchPane.setSearchScope}
        onSelectThread={onSelectThread}
      />
    );
  } else if (panel === "browser") {
    body = (
      <RightPanelBrowserPane
        browserFocused={browserFocused}
        browserState={browserState}
        browserHostRef={browserHostRef}
        browserUrl={browserUrl}
        browserSearch={browserSearch}
        browserPickPrompt={browserPickPrompt}
        browserBusy={browserBusy}
        browserUserActionBusy={browserUserActionBusy}
        browserError={browserError}
        browserStatus={browserStatus}
        latestBrowserScreenshot={latestBrowserScreenshot}
        visualAnalysisBusy={visualAnalysisBusy}
        visualAnalysisStatus={visualAnalysisStatus}
        visualAnalysisDiagnostics={visualAnalysisDiagnostics}
        browserInspectResult={browserInspectResult}
        browserCredentialStatus={browserCredentialStatus}
        browserCredentialBusy={browserCredentialBusy}
        browserCredentialForm={browserCredentialForm}
        browserCredentials={browserCredentials}
        formatTimelineTime={formatTimelineTime}
        onBrowserFocusedChange={setBrowserFocused}
        onBrowserUrlChange={setBrowserUrl}
        onBrowserSearchChange={setBrowserSearch}
        onBrowserPickPromptChange={setBrowserPickPrompt}
        onStartBrowser={(profileMode) => startBrowser(profileMode)}
        onStopBrowser={() => stopBrowser()}
        onClearIsolatedBrowserProfile={() => clearIsolatedBrowserProfile()}
        onClearCopiedChromeProfile={() => clearCopiedChromeProfile()}
        onRefreshBrowserPage={() => refreshBrowserPage()}
        onScreenshotBrowser={() => screenshotBrowser()}
        onAnalyzeLatestBrowserScreenshot={() => analyzeLatestBrowserScreenshot()}
        onRevealBrowser={(input) => revealBrowser(input)}
        onNavigateBrowser={() => navigateBrowser()}
        onSearchBrowser={() => searchBrowser()}
        onPickBrowserElement={() => pickBrowserElement()}
        onCancelBrowserPicker={() => cancelBrowserPicker()}
        onResumeBrowserUserAction={() => resumeBrowserUserAction()}
        onCancelBrowserUserAction={() => cancelBrowserUserAction()}
        onOpenBrowserCopyDialog={() => setBrowserCopyDialogOpen(true)}
        onLoadBrowserState={() => loadBrowserState()}
        onLoadBrowserCredentials={() => loadBrowserCredentials()}
        onSaveBrowserCredential={() => saveBrowserCredential()}
        onBrowserCredentialFormChange={setBrowserCredentialForm}
        onResetBrowserCredentialForm={resetBrowserCredentialForm}
        onEditBrowserCredential={editBrowserCredential}
        onDeleteBrowserCredential={(id) => deleteBrowserCredential(id)}
        onCopyBrowserInspectReference={(result) => copyBrowserInspectReference(result)}
      />
    );
  } else if (panel === "files") {
    body = (
      <RightPanelFilesPane
        fileTree={filesPane.fileTree}
        fileTreeError={filesPane.fileTreeError}
        visibleEntries={filesPane.visibleEntries}
        selectedFile={filesPane.selectedFile}
        selectedFileError={filesPane.selectedFileError}
        openTargets={filesPane.openTargets}
        openTargetsError={filesPane.openTargetsError}
        visualAnalysisBusy={visualAnalysisBusy}
        visualAnalysisStatus={visualAnalysisStatus}
        visualAnalysisDiagnostics={visualAnalysisDiagnostics}
        filePaneWidth={filesPane.filePaneWidth}
        collapsedDirs={filesPane.collapsedDirs}
        officePreviewRefreshingPath={filesPane.officePreviewRefreshingPath}
        renderFileIcon={fileIconForEntry}
        renderFilePreview={({ file, openTargets, visualAnalysisBusy, officePreviewRefreshing }) => (
          <FilePreview
            file={file}
            openTargets={openTargets}
            onOpen={(targetId) => void filesPane.openPreviewFilePath(file, targetId)}
            onAddContext={(file) => onAddContext([fileContextReference(file)])}
            onAnalyzeVisual={(file) => void analyzeWorkspaceFileWithMiniCpm(file)}
            visualAnalysisBusy={visualAnalysisBusy}
            onRefreshOfficePreview={(file) => void filesPane.refreshOfficePreview(file)}
            officePreviewRefreshing={officePreviewRefreshing}
            renderRichText={(content) => <RichText content={content} />}
          />
        )}
        fileTreeEntryTitle={fileTreeEntryTitle}
        formatPanelFileSize={formatPanelFileSize}
        previewFileActionPath={filesPane.previewFileActionPath}
        onLoadFileTree={filesPane.loadFileTree}
        onToggleDirectory={filesPane.toggleDirectory}
        onOpenFile={filesPane.openFile}
        onBeginFilePaneResize={filesPane.beginFilePaneResize}
      />
    );
  } else if (panel === "diff") {
    body = (
      <RightPanelGitPane
        review={gitPane.review}
        reviewError={gitPane.reviewError}
        actionNotice={gitPane.actionNotice}
        busy={gitPane.busy}
        activeTab={gitPane.activeTab}
        commitMessage={gitPane.commitMessage}
        branchName={gitPane.branchName}
        unversionedAcknowledged={gitPane.unversionedAcknowledged}
        sharedWorkspaceAcknowledged={gitPane.sharedWorkspaceAcknowledged}
        formatTimelineTime={formatTimelineTime}
        onActiveTabChange={gitPane.setActiveTab}
        onRefresh={gitPane.loadReview}
        onCommitMessageChange={gitPane.setCommitMessage}
        onBranchNameChange={gitPane.setBranchName}
        onCommit={gitPane.commitReview}
        onCreateBranch={gitPane.createBranchFromReview}
        onAction={gitPane.runSimpleAction}
        onCreatePullRequest={gitPane.openPullRequestUrl}
        onInitializeRepository={gitPane.initializeRepository}
        onContinueWithoutGit={gitPane.continueWithoutGit}
        onCreateThreadWorktree={gitPane.createThreadWorktree}
        onAttachExistingWorktree={gitPane.attachExistingWorktree}
        onKeepSharedWorkspace={gitPane.keepSharedWorkspace}
        onStageAll={gitPane.stageAll}
        onUnstageAll={gitPane.unstageAll}
        onStage={gitPane.stage}
        onUnstage={gitPane.unstage}
        onDiscard={gitPane.discardFile}
      />
    );
  } else if (panel === "settings") {
    body = (
      <RightPanelSettingsPane
        state={state}
        running={running}
        updateBusy={updateBusy}
        permissionAudit={permissionAudit}
        permissionGrants={permissionGrants}
        permissionAuditError={permissionAuditError}
        permissionGrantError={permissionGrantError}
        permissionGrantRevoking={permissionGrantRevoking}
        voiceProviders={voiceProviders}
        voiceProvidersLoading={voiceProvidersLoading}
        voiceProvidersError={voiceProvidersError}
        voiceProviderCacheStatus={voiceProviderCacheStatus}
        voiceProviderCacheActivity={voiceProviderCacheActivity}
        voiceCatalogRefresh={voiceCatalogRefresh}
        sttProviders={sttProviders}
        sttProvidersLoading={sttProvidersLoading}
        sttProvidersError={sttProvidersError}
        sttProviderCacheStatus={sttProviderCacheStatus}
        sttProviderCacheActivity={sttProviderCacheActivity}
        sttProviderSetup={sttProviderSetup}
        sttMicrophoneDevices={sttMicrophoneDevices}
        sttMicrophoneDevicesLoading={sttMicrophoneDevicesLoading}
        sttMicrophoneDevicesError={sttMicrophoneDevicesError}
        miniCpmVisionSetup={miniCpmVisionSetup}
        miniCpmVisionRuntimePath={miniCpmVisionRuntimePath}
        miniCpmVisionEndpointUrl={miniCpmVisionEndpointUrl}
        localDeepResearchSetup={localDeepResearchSetup}
        localDeepResearchQ8Override={localDeepResearchQ8Override}
        localDeepResearchRunHistory={localDeepResearchRunHistory}
        sttMicTest={sttMicTest}
        mcpContainerRuntimeInstallProgress={mcpContainerRuntimeInstallProgress}
        mcpDefaultCapabilityInstallProgress={mcpDefaultCapabilityInstallProgress}
        searchRoutingHydrating={searchRoutingHydrating}
        searchRoutingHydrationError={searchRoutingHydrationError}
        agentMemoryDiagnostics={agentMemoryDiagnostics}
        agentMemoryDiagnosticsLoading={agentMemoryDiagnosticsLoading}
        agentMemoryDiagnosticsError={agentMemoryDiagnosticsError}
        agentMemoryEmbeddingActionLoading={agentMemoryEmbeddingActionLoading}
        agentMemoryEmbeddingActionResult={agentMemoryEmbeddingActionResult}
        agentMemoryEmbeddingActionError={agentMemoryEmbeddingActionError}
        onLoadPermissionAudit={onLoadPermissionAudit}
        onLoadPermissionGrants={onLoadPermissionGrants}
        onRevokePermissionGrant={onRevokePermissionGrant}
        onRevokePermissionGrantIds={onRevokePermissionGrantIds}
        onOpenApiKey={onOpenApiKey}
        onCheckUpdates={onCheckUpdates}
        onThemePreferenceChange={onThemePreferenceChange}
        onMediaPlaybackSettingsChange={onMediaPlaybackSettingsChange}
        onThinkingDisplaySettingsChange={onThinkingDisplaySettingsChange}
        onModelRuntimeSettingsChange={onModelRuntimeSettingsChange}
        onFeatureFlagSettingsChange={onFeatureFlagSettingsChange}
        onMemorySettingsChange={onMemorySettingsChange}
        onActiveThreadMemoryEnabledChange={onActiveThreadMemoryEnabledChange}
        onRefreshAgentMemoryDiagnostics={onRefreshAgentMemoryDiagnostics}
        onRunAgentMemoryEmbeddingLifecycleAction={(action) => void runAgentMemoryEmbeddingLifecycleActionFromSettings(action)}
        onPlannerSettingsChange={onPlannerSettingsChange}
        onHydrateSearchRoutingSettings={onHydrateSearchRoutingSettings}
        onSearchRoutingSettingsChange={onSearchRoutingSettingsChange}
        onLocalDeepResearchSettingsChange={onLocalDeepResearchSettingsChange}
        onOpenAmbientCliSecretDialog={onOpenAmbientCliSecretDialog}
        onVoiceSettingsChange={onVoiceSettingsChange}
        onLoadVoiceProviders={onLoadVoiceProviders}
        onRefreshVoiceCatalog={onRefreshVoiceCatalog}
        onSttSettingsChange={onSttSettingsChange}
        onLoadSttProviders={onLoadSttProviders}
        onLoadSttMicrophoneDevices={onLoadSttMicrophoneDevices}
        onSetupSttProvider={onSetupSttProvider}
        onSetupMiniCpmVisionProvider={onSetupMiniCpmVisionProvider}
        onMiniCpmVisionRuntimePathChange={onMiniCpmVisionRuntimePathChange}
        onMiniCpmVisionEndpointUrlChange={onMiniCpmVisionEndpointUrlChange}
        onSetupLocalDeepResearch={onSetupLocalDeepResearch}
        onLocalDeepResearchQ8OverrideChange={onLocalDeepResearchQ8OverrideChange}
        onLoadLocalDeepResearchRunHistory={onLoadLocalDeepResearchRunHistory}
        onStartSttMicTest={onStartSttMicTest}
        onStopSttMicTest={onStopSttMicTest}
        onCancelSttMicTest={onCancelSttMicTest}
        onOpenPluginCapabilities={onOpenPluginCapabilities}
        onOpenMcpRuntimeSettings={onOpenMcpRuntimeSettings}
        settingsPane={settingsPane}
        mcpPane={mcpPane}
        diagnosticsPane={diagnosticsPane}
        PermissionFullAccessReceiptList={PermissionFullAccessReceiptList}
        onOpenMcpPlugins={() => {
          pluginCatalogPane.setPluginView("mcp");
          onOpenPluginCapabilities();
        }}
      />
    );
  } else if (panel === "plugins") {
    body = (
      <RightPanelPluginsPane
        InfoTooltip={InfoTooltip}
        state={state}
        running={running}
        voiceProviders={voiceProviders}
        sttProviders={sttProviders}
        permissionAudit={permissionAudit}
        mcpContainerRuntimeInstallProgress={mcpContainerRuntimeInstallProgress}
        mcpDefaultCapabilityInstallProgress={mcpDefaultCapabilityInstallProgress}
        pluginCatalogPane={pluginCatalogPane}
        mcpPane={mcpPane}
        settingsPane={settingsPane}
        diagnosticsPane={diagnosticsPane}
        pluginAuthPane={pluginAuthPane}
        googleIntegrationBridge={googleIntegrationBridge}
        capabilityBuilderLauncher={capabilityBuilderLauncher}
        piPackagePane={piPackagePane}
        onOpenMcpRuntimeSettings={onOpenMcpRuntimeSettings}
      />
    );
  } else if (panel === "attachments") {
    body = (
      <RightPanelContextPane
        attachments={contextAttachments}
        allowExternal={state.settings.permissionMode === "full-access"}
        visualAnalysisBusy={visualAnalysisBusy}
        visualAnalysisStatus={visualAnalysisStatus}
        visualAnalysisDiagnostics={visualAnalysisDiagnostics}
        onAddContext={onAddContext}
        onRemoveContext={onRemoveContext}
        onClearContext={onClearContext}
        onContextError={onContextError}
        onAnalyzeVisual={analyzeContextAttachmentWithMiniCpm}
      />
    );
  } else {
    const copy = "Performance tracing is not wired yet.";
    body = (
      <div className="panel-empty">
        <span>{copy}</span>
      </div>
    );
  }

  return (
    <>
      <RightPanelShell
        panel={panel}
        title={title}
        panelWidth={panelWidth}
        browserFocused={browserFocused}
        onClose={onClose}
      >
        {body}
      </RightPanelShell>
      {gitPane.confirmation && (
        <GitConfirmationDialog
          confirmation={gitPane.confirmation}
          onCancel={gitPane.cancelConfirmation}
          onConfirm={gitPane.confirmConfirmation}
        />
      )}
      {browserCopyDialogOpen && (
        <BrowserProfileCopyDialog
          state={browserState}
          busy={browserBusy === "copy-profile"}
          onCancel={() => setBrowserCopyDialogOpen(false)}
          onConfirm={() => void copyChromeProfile()}
        />
      )}
      {mcpPane.containerRuntimeModalOpen && (
        <McpContainerRuntimeDialog
          status={mcpPane.containerRuntimeStatus}
          busy={mcpPane.containerRuntimeBusy}
          launchBusy={mcpPane.containerRuntimeLaunchBusy}
          diagnosticBusy={diagnosticsPane.diagnosticBusy}
          diagnosticStatus={diagnosticsPane.diagnosticStatus}
          actionStatus={mcpPane.containerRuntimeActionStatus}
          installProgress={mcpContainerRuntimeInstallProgress}
          defaultCapabilityInstallProgress={mcpDefaultCapabilityInstallProgress}
          defaultCapabilityBusyKey={mcpPane.serverBusy}
          error={mcpPane.containerRuntimeError}
          onRefresh={() => void mcpPane.refreshContainerRuntimeStatus(false, { continueDefaultCapabilitySetup: true })}
          onLaunchInstall={(actionId, mode) => void mcpPane.launchContainerRuntimeInstaller(actionId, mode)}
          onExportDiagnostics={() => void diagnosticsPane.exportDiagnostics()}
          onInstallDefaultCapability={(capabilityId) => void mcpPane.installDefaultCapability(capabilityId)}
          onOpenPlugins={() => {
            mcpPane.setContainerRuntimeModalOpen(false);
            onOpenMcpRuntimeSettings();
          }}
          onClose={() => void mcpPane.dismissContainerRuntimeSetup()}
        />
      )}
      {capabilityBuilderLauncher.open && (
        <CapabilityBuilderLauncherDialog
          draft={capabilityBuilderLauncher.draft}
          newChat={capabilityBuilderLauncher.newChat}
          busy={capabilityBuilderLauncher.busy}
          running={running}
          onChange={capabilityBuilderLauncher.updateDraft}
          onChangeNewChat={capabilityBuilderLauncher.setNewChat}
          onClose={capabilityBuilderLauncher.close}
          onSubmit={() => void capabilityBuilderLauncher.submit()}
        />
      )}
    </>
  );
}
export type RightPanelProps = Parameters<typeof RightPanel>[0];
