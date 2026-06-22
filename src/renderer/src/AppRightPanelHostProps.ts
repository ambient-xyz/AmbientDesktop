import type {
  ComponentProps,
  Dispatch,
  SetStateAction,
} from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { AppRightPanelHost } from "./AppRightPanelHost";
import { desktopStateWithUpdatedSettings } from "./AppSettingsActions";
import type { useAppProviderRuntimeState } from "./AppProviderRuntimeState";
import type { useAppRightPanelState } from "./AppRightPanelState";
import type { useAppSecurityPromptState } from "./AppSecurityPromptState";
import type { useAppShellUiState } from "./AppShellUiState";
import type { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";
import type { useAppWorkspaceShellState } from "./AppWorkspaceShellState";

type AppRightPanelHostProps = ComponentProps<typeof AppRightPanelHost>;
type MaybePromise<T = unknown> = T | Promise<T>;
type Callback<K extends keyof AppRightPanelHostProps> = Extract<AppRightPanelHostProps[K], (...args: never[]) => unknown>;
type FirstParameter<K extends keyof AppRightPanelHostProps> = Parameters<Callback<K>>[0];
type ThreadSettingsPatch = Partial<Pick<ThreadSummary, "thinkingLevel" | "memoryEnabled">>;

type RightPanelStateInput = Pick<
  ReturnType<typeof useAppRightPanelState>,
  | "rightPanel"
  | "rightPanelWidth"
  | "settingsFocusRequest"
  | "artifactPreviewRequest"
  | "localFilePreviewRequest"
  | "gitPanelTabRequest"
  | "setRightPanel"
  | "openMcpRuntimeSettings"
>;

type WorkspaceShellStateInput = Pick<
  ReturnType<typeof useAppWorkspaceShellState>,
  | "workspaceRevision"
  | "pluginCatalogRevision"
  | "browserRevision"
  | "setWorkspaceRevision"
  | "setActiveGitReview"
>;

type SecurityPromptStateInput = Pick<
  ReturnType<typeof useAppSecurityPromptState>,
  | "permissionAuditRevision"
  | "permissionAudit"
  | "permissionGrants"
  | "permissionAuditError"
  | "permissionGrantError"
  | "permissionGrantRevoking"
>;

type ProviderRuntimeStateInput = Pick<
  ReturnType<typeof useAppProviderRuntimeState>,
  | "voiceProviders"
  | "voiceProvidersLoading"
  | "voiceProvidersError"
  | "voiceProviderCacheStatus"
  | "voiceProviderCacheActivity"
  | "voiceCatalogRefresh"
  | "sttProviders"
  | "sttProvidersLoading"
  | "sttProvidersError"
  | "sttProviderCacheStatus"
  | "sttProviderCacheActivity"
  | "sttProviderSetup"
  | "sttMicrophoneDevices"
  | "sttMicrophoneDevicesLoading"
  | "sttMicrophoneDevicesError"
  | "miniCpmVisionSetup"
  | "miniCpmVisionRuntimePath"
  | "setMiniCpmVisionRuntimePath"
  | "miniCpmVisionEndpointUrl"
  | "setMiniCpmVisionEndpointUrl"
  | "localDeepResearchSetup"
  | "localDeepResearchQ8Override"
  | "setLocalDeepResearchQ8Override"
  | "localDeepResearchRunHistory"
  | "sttMicTest"
  | "mcpContainerRuntimeInstallProgress"
  | "setMcpContainerRuntimeInstallProgress"
  | "mcpDefaultCapabilityInstallProgress"
  | "setMcpDefaultCapabilityInstallProgress"
  | "agentMemoryDiagnostics"
  | "agentMemoryDiagnosticsLoading"
  | "agentMemoryDiagnosticsError"
  | "agentMemoryEmbeddingActionLoading"
  | "agentMemoryEmbeddingActionResult"
  | "agentMemoryEmbeddingActionError"
>;

type WorkflowRuntimeStateInput = Pick<
  ReturnType<typeof useAppWorkflowRuntimeState>,
  | "orchestrationRevision"
  | "orchestrationAutoRevision"
  | "workflowRevision"
  | "contextAttachments"
  | "setContextError"
>;

type ShellUiStateInput = Pick<
  ReturnType<typeof useAppShellUiState>,
  | "searchRoutingHydrating"
  | "searchRoutingHydrationError"
  | "updateBusy"
>;

export type AppRightPanelHostActions = {
  addContextAttachments: AppRightPanelHostProps["onAddContext"];
  cancelSttMicTest: AppRightPanelHostProps["onCancelSttMicTest"];
  clearAgentMemory: AppRightPanelHostProps["onClearAgentMemory"];
  clearContextAttachments: AppRightPanelHostProps["onClearContext"];
  continueAfterBrowserUserActionIfReady: AppRightPanelHostProps["onBrowserUserActionCompleted"];
  exportDiagnostics: AppRightPanelHostProps["onExportDiagnostics"];
  hydrateSearchRoutingSettingsForSettingsPanel: () => MaybePromise;
  importDiagnostics: AppRightPanelHostProps["onImportDiagnostics"];
  installModelProviderEndpoint: AppRightPanelHostProps["onInstallModelProviderEndpoint"];
  loadLocalDeepResearchRunHistory: () => MaybePromise;
  loadPermissionAudit: AppRightPanelHostProps["onLoadPermissionAudit"];
  loadPermissionGrants: AppRightPanelHostProps["onLoadPermissionGrants"];
  loadSttMicrophoneDeviceList: (input: { requestPermission?: boolean }) => MaybePromise;
  loadSttProviders: AppRightPanelHostProps["onLoadSttProviders"];
  loadVoiceProviders: AppRightPanelHostProps["onLoadVoiceProviders"];
  openAmbientCliSecretDialog: AppRightPanelHostProps["onOpenAmbientCliSecretDialog"];
  openApiKeyDialog: () => MaybePromise;
  openLocalDeepResearchFollowupIfSetupNeeded: () => MaybePromise;
  refreshAgentMemoryDiagnostics: AppRightPanelHostProps["onRefreshAgentMemoryDiagnostics"];
  refreshVoiceCatalog: (providerCapabilityId: FirstParameter<"onRefreshVoiceCatalog">) => MaybePromise;
  removeContextAttachment: AppRightPanelHostProps["onRemoveContext"];
  revokePermissionGrant: AppRightPanelHostProps["onRevokePermissionGrant"];
  revokePermissionGrantIds: AppRightPanelHostProps["onRevokePermissionGrantIds"];
  runAgentMemoryEmbeddingLifecycleAction: AppRightPanelHostProps["onRunAgentMemoryEmbeddingLifecycleAction"];
  runLocalModelRuntimeLifecycleAction: AppRightPanelHostProps["onRunLocalModelRuntimeLifecycleAction"];
  runUpdateAction: (action: "check") => MaybePromise;
  saveModelProviderCredential: AppRightPanelHostProps["onSaveModelProviderCredential"];
  selectThread: AppRightPanelHostProps["onSelectThread"];
  setupLocalDeepResearchFromSettings: (action: FirstParameter<"onSetupLocalDeepResearch">) => MaybePromise;
  setupMiniCpmVisionProviderFromSettings: (action: FirstParameter<"onSetupMiniCpmVisionProvider">) => MaybePromise;
  setupSttProvider: (action: FirstParameter<"onSetupSttProvider">) => MaybePromise;
  startCapabilityBuilderPrompt: AppRightPanelHostProps["onStartCapabilityBuilder"];
  startSttMicTest: () => MaybePromise;
  stopSttMicTestAndValidate: () => MaybePromise;
  updateFeatureFlagSettings: (featureFlags: FirstParameter<"onFeatureFlagSettingsChange">) => MaybePromise;
  updateLocalDeepResearchSettings: (localDeepResearch: FirstParameter<"onLocalDeepResearchSettingsChange">) => MaybePromise;
  updateMediaPlaybackSettings: (media: FirstParameter<"onMediaPlaybackSettingsChange">) => MaybePromise;
  updateMemorySettings: (memory: FirstParameter<"onMemorySettingsChange">) => MaybePromise;
  updateModelRuntimeSettings: (modelRuntime: FirstParameter<"onModelRuntimeSettingsChange">) => MaybePromise;
  updatePlannerSettings: (planner: FirstParameter<"onPlannerSettingsChange">) => MaybePromise;
  updateSearchRoutingSettings: (search: FirstParameter<"onSearchRoutingSettingsChange">) => MaybePromise;
  updateSttSettings: (stt: FirstParameter<"onSttSettingsChange">) => MaybePromise;
  updateThemePreference: AppRightPanelHostProps["onThemePreferenceChange"];
  updateThinkingDisplaySettings: (thinkingDisplay: FirstParameter<"onThinkingDisplaySettingsChange">) => MaybePromise;
  updateThreadSettings: (patch: ThreadSettingsPatch) => MaybePromise;
  updateVoiceSettings: (voice: FirstParameter<"onVoiceSettingsChange">) => MaybePromise;
};

export type AppRightPanelHostPropsInput = {
  actions: AppRightPanelHostActions;
  onBeginResize: AppRightPanelHostProps["onBeginResize"];
  providerRuntimeState: ProviderRuntimeStateInput;
  rightPanelState: RightPanelStateInput;
  running: boolean;
  securityPromptState: SecurityPromptStateInput;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  shellUiState: ShellUiStateInput;
  state: DesktopState;
  workflowRuntimeState: WorkflowRuntimeStateInput;
  workspaceShellState: WorkspaceShellStateInput;
};

export type AppRightPanelHostPropsForAppActions = {
  agentMemoryControls: Pick<AppRightPanelHostActions, "refreshAgentMemoryDiagnostics" | "runAgentMemoryEmbeddingLifecycleAction">;
  browserActionControls: Pick<AppRightPanelHostActions, "continueAfterBrowserUserActionIfReady">;
  capabilityPromptActions: Pick<AppRightPanelHostActions, "startCapabilityBuilderPrompt">;
  contextAttachmentActions: Pick<AppRightPanelHostActions, "addContextAttachments" | "clearContextAttachments" | "removeContextAttachment">;
  credentialDialogActions: Pick<AppRightPanelHostActions, "openAmbientCliSecretDialog" | "openApiKeyDialog">;
  navigationActions: Pick<AppRightPanelHostActions, "selectThread">;
  permissionActions: Pick<
    AppRightPanelHostActions,
    "loadPermissionAudit" | "loadPermissionGrants" | "revokePermissionGrant" | "revokePermissionGrantIds"
  >;
  providerRuntimeActions: Pick<
    AppRightPanelHostActions,
    | "cancelSttMicTest"
    | "loadLocalDeepResearchRunHistory"
    | "loadSttMicrophoneDeviceList"
    | "loadSttProviders"
    | "loadVoiceProviders"
    | "openLocalDeepResearchFollowupIfSetupNeeded"
    | "refreshVoiceCatalog"
    | "setupLocalDeepResearchFromSettings"
    | "setupMiniCpmVisionProviderFromSettings"
    | "setupSttProvider"
    | "startSttMicTest"
    | "stopSttMicTestAndValidate"
  >;
  settingsActions: Pick<
    AppRightPanelHostActions,
    | "clearAgentMemory"
    | "hydrateSearchRoutingSettingsForSettingsPanel"
    | "installModelProviderEndpoint"
    | "runLocalModelRuntimeLifecycleAction"
    | "saveModelProviderCredential"
    | "updateFeatureFlagSettings"
    | "updateLocalDeepResearchSettings"
    | "updateMediaPlaybackSettings"
    | "updateMemorySettings"
    | "updateModelRuntimeSettings"
    | "updatePlannerSettings"
    | "updateSearchRoutingSettings"
    | "updateSttSettings"
    | "updateThinkingDisplaySettings"
    | "updateVoiceSettings"
  >;
  shellCommandActions: Pick<AppRightPanelHostActions, "updateThemePreference" | "updateThreadSettings">;
  threadMaintenanceActions: Pick<AppRightPanelHostActions, "exportDiagnostics" | "importDiagnostics">;
  updateActions: Pick<AppRightPanelHostActions, "runUpdateAction">;
};

export type AppRightPanelHostPropsForAppInput = Omit<AppRightPanelHostPropsInput, "actions"> & {
  actions: AppRightPanelHostPropsForAppActions;
};

export function createAppRightPanelHostPropsForApp({ actions, ...input }: AppRightPanelHostPropsForAppInput): AppRightPanelHostProps {
  const {
    agentMemoryControls,
    browserActionControls,
    capabilityPromptActions,
    contextAttachmentActions,
    credentialDialogActions,
    navigationActions,
    permissionActions,
    providerRuntimeActions,
    settingsActions,
    shellCommandActions,
    threadMaintenanceActions,
    updateActions,
  } = actions;

  return createAppRightPanelHostProps({
    ...input,
    actions: {
      addContextAttachments: contextAttachmentActions.addContextAttachments,
      cancelSttMicTest: providerRuntimeActions.cancelSttMicTest,
      clearAgentMemory: settingsActions.clearAgentMemory,
      clearContextAttachments: contextAttachmentActions.clearContextAttachments,
      continueAfterBrowserUserActionIfReady: browserActionControls.continueAfterBrowserUserActionIfReady,
      exportDiagnostics: threadMaintenanceActions.exportDiagnostics,
      hydrateSearchRoutingSettingsForSettingsPanel: settingsActions.hydrateSearchRoutingSettingsForSettingsPanel,
      importDiagnostics: threadMaintenanceActions.importDiagnostics,
      installModelProviderEndpoint: settingsActions.installModelProviderEndpoint,
      loadLocalDeepResearchRunHistory: providerRuntimeActions.loadLocalDeepResearchRunHistory,
      loadPermissionAudit: permissionActions.loadPermissionAudit,
      loadPermissionGrants: permissionActions.loadPermissionGrants,
      loadSttMicrophoneDeviceList: providerRuntimeActions.loadSttMicrophoneDeviceList,
      loadSttProviders: providerRuntimeActions.loadSttProviders,
      loadVoiceProviders: providerRuntimeActions.loadVoiceProviders,
      openAmbientCliSecretDialog: credentialDialogActions.openAmbientCliSecretDialog,
      openApiKeyDialog: credentialDialogActions.openApiKeyDialog,
      openLocalDeepResearchFollowupIfSetupNeeded: providerRuntimeActions.openLocalDeepResearchFollowupIfSetupNeeded,
      refreshAgentMemoryDiagnostics: agentMemoryControls.refreshAgentMemoryDiagnostics,
      refreshVoiceCatalog: providerRuntimeActions.refreshVoiceCatalog,
      removeContextAttachment: contextAttachmentActions.removeContextAttachment,
      revokePermissionGrant: permissionActions.revokePermissionGrant,
      revokePermissionGrantIds: permissionActions.revokePermissionGrantIds,
      runAgentMemoryEmbeddingLifecycleAction: agentMemoryControls.runAgentMemoryEmbeddingLifecycleAction,
      runLocalModelRuntimeLifecycleAction: settingsActions.runLocalModelRuntimeLifecycleAction,
      runUpdateAction: updateActions.runUpdateAction,
      saveModelProviderCredential: settingsActions.saveModelProviderCredential,
      selectThread: navigationActions.selectThread,
      setupLocalDeepResearchFromSettings: providerRuntimeActions.setupLocalDeepResearchFromSettings,
      setupMiniCpmVisionProviderFromSettings: providerRuntimeActions.setupMiniCpmVisionProviderFromSettings,
      setupSttProvider: providerRuntimeActions.setupSttProvider,
      startCapabilityBuilderPrompt: capabilityPromptActions.startCapabilityBuilderPrompt,
      startSttMicTest: providerRuntimeActions.startSttMicTest,
      stopSttMicTestAndValidate: providerRuntimeActions.stopSttMicTestAndValidate,
      updateFeatureFlagSettings: settingsActions.updateFeatureFlagSettings,
      updateLocalDeepResearchSettings: settingsActions.updateLocalDeepResearchSettings,
      updateMediaPlaybackSettings: settingsActions.updateMediaPlaybackSettings,
      updateMemorySettings: settingsActions.updateMemorySettings,
      updateModelRuntimeSettings: settingsActions.updateModelRuntimeSettings,
      updatePlannerSettings: settingsActions.updatePlannerSettings,
      updateSearchRoutingSettings: settingsActions.updateSearchRoutingSettings,
      updateSttSettings: settingsActions.updateSttSettings,
      updateThemePreference: shellCommandActions.updateThemePreference,
      updateThinkingDisplaySettings: settingsActions.updateThinkingDisplaySettings,
      updateThreadSettings: shellCommandActions.updateThreadSettings,
      updateVoiceSettings: settingsActions.updateVoiceSettings,
    },
  });
}

export function createAppRightPanelHostProps({
  actions,
  onBeginResize,
  providerRuntimeState,
  rightPanelState,
  running,
  securityPromptState,
  setState,
  shellUiState,
  state,
  workflowRuntimeState,
  workspaceShellState,
}: AppRightPanelHostPropsInput): AppRightPanelHostProps {
  return {
    panel: rightPanelState.rightPanel,
    onBeginResize,
    panelWidth: rightPanelState.rightPanelWidth,
    state,
    workspaceRevision: workspaceShellState.workspaceRevision,
    pluginCatalogRevision: workspaceShellState.pluginCatalogRevision,
    permissionAuditRevision: securityPromptState.permissionAuditRevision,
    browserRevision: workspaceShellState.browserRevision,
    orchestrationRevision: workflowRuntimeState.orchestrationRevision,
    orchestrationAutoRevision: workflowRuntimeState.orchestrationAutoRevision,
    workflowRevision: workflowRuntimeState.workflowRevision,
    artifactPreviewRequest: rightPanelState.artifactPreviewRequest,
    localFilePreviewRequest: rightPanelState.localFilePreviewRequest,
    gitPanelTabRequest: rightPanelState.gitPanelTabRequest,
    settingsFocusRequest: rightPanelState.settingsFocusRequest,
    contextAttachments: workflowRuntimeState.contextAttachments,
    permissionAudit: securityPromptState.permissionAudit,
    permissionGrants: securityPromptState.permissionGrants,
    permissionAuditError: securityPromptState.permissionAuditError,
    permissionGrantError: securityPromptState.permissionGrantError,
    permissionGrantRevoking: securityPromptState.permissionGrantRevoking,
    voiceProviders: providerRuntimeState.voiceProviders,
    voiceProvidersLoading: providerRuntimeState.voiceProvidersLoading,
    voiceProvidersError: providerRuntimeState.voiceProvidersError,
    voiceProviderCacheStatus: providerRuntimeState.voiceProviderCacheStatus,
    voiceProviderCacheActivity: providerRuntimeState.voiceProviderCacheActivity,
    voiceCatalogRefresh: providerRuntimeState.voiceCatalogRefresh,
    sttProviders: providerRuntimeState.sttProviders,
    sttProvidersLoading: providerRuntimeState.sttProvidersLoading,
    sttProvidersError: providerRuntimeState.sttProvidersError,
    sttProviderCacheStatus: providerRuntimeState.sttProviderCacheStatus,
    sttProviderCacheActivity: providerRuntimeState.sttProviderCacheActivity,
    sttProviderSetup: providerRuntimeState.sttProviderSetup,
    sttMicrophoneDevices: providerRuntimeState.sttMicrophoneDevices,
    sttMicrophoneDevicesLoading: providerRuntimeState.sttMicrophoneDevicesLoading,
    sttMicrophoneDevicesError: providerRuntimeState.sttMicrophoneDevicesError,
    miniCpmVisionSetup: providerRuntimeState.miniCpmVisionSetup,
    miniCpmVisionRuntimePath: providerRuntimeState.miniCpmVisionRuntimePath,
    miniCpmVisionEndpointUrl: providerRuntimeState.miniCpmVisionEndpointUrl,
    localDeepResearchSetup: providerRuntimeState.localDeepResearchSetup,
    localDeepResearchQ8Override: providerRuntimeState.localDeepResearchQ8Override,
    localDeepResearchRunHistory: providerRuntimeState.localDeepResearchRunHistory,
    sttMicTest: providerRuntimeState.sttMicTest,
    mcpContainerRuntimeInstallProgress: providerRuntimeState.mcpContainerRuntimeInstallProgress,
    mcpDefaultCapabilityInstallProgress: providerRuntimeState.mcpDefaultCapabilityInstallProgress,
    searchRoutingHydrating: shellUiState.searchRoutingHydrating,
    searchRoutingHydrationError: shellUiState.searchRoutingHydrationError,
    agentMemoryDiagnostics: providerRuntimeState.agentMemoryDiagnostics,
    agentMemoryDiagnosticsLoading: providerRuntimeState.agentMemoryDiagnosticsLoading,
    agentMemoryDiagnosticsError: providerRuntimeState.agentMemoryDiagnosticsError,
    agentMemoryEmbeddingActionLoading: providerRuntimeState.agentMemoryEmbeddingActionLoading,
    agentMemoryEmbeddingActionResult: providerRuntimeState.agentMemoryEmbeddingActionResult,
    agentMemoryEmbeddingActionError: providerRuntimeState.agentMemoryEmbeddingActionError,
    updateBusy: shellUiState.updateBusy,
    running,
    onLoadPermissionAudit: actions.loadPermissionAudit,
    onLoadPermissionGrants: actions.loadPermissionGrants,
    onRevokePermissionGrant: actions.revokePermissionGrant,
    onRevokePermissionGrantIds: actions.revokePermissionGrantIds,
    onOpenApiKey: () => {
      void actions.openApiKeyDialog();
    },
    onCheckUpdates: () => {
      void actions.runUpdateAction("check");
    },
    onThemePreferenceChange: actions.updateThemePreference,
    onMediaPlaybackSettingsChange: (media) => {
      void actions.updateMediaPlaybackSettings(media);
    },
    onThinkingDisplaySettingsChange: (thinkingDisplay) => {
      void actions.updateThinkingDisplaySettings(thinkingDisplay);
    },
    onThinkingLevelChange: (thinkingLevel) => {
      void actions.updateThreadSettings({ thinkingLevel });
    },
    onModelRuntimeSettingsChange: (modelRuntime) => {
      void actions.updateModelRuntimeSettings(modelRuntime);
    },
    onSaveModelProviderCredential: actions.saveModelProviderCredential,
    onInstallModelProviderEndpoint: actions.installModelProviderEndpoint,
    onRunLocalModelRuntimeLifecycleAction: actions.runLocalModelRuntimeLifecycleAction,
    onFeatureFlagSettingsChange: (featureFlags) => {
      void actions.updateFeatureFlagSettings(featureFlags);
    },
    onMemorySettingsChange: (memory) => {
      void actions.updateMemorySettings(memory);
    },
    onApplyMemorySettingsSnapshot: (memory) =>
      setState((current) => current ? desktopStateWithUpdatedSettings(current, "memory", memory) : current),
    onActiveThreadMemoryEnabledChange: (memoryEnabled) => {
      void actions.updateThreadSettings({ memoryEnabled });
    },
    onRefreshAgentMemoryDiagnostics: actions.refreshAgentMemoryDiagnostics,
    onRunAgentMemoryEmbeddingLifecycleAction: actions.runAgentMemoryEmbeddingLifecycleAction,
    onClearAgentMemory: actions.clearAgentMemory,
    onPlannerSettingsChange: (planner) => {
      void actions.updatePlannerSettings(planner);
    },
    onHydrateSearchRoutingSettings: () => {
      void actions.hydrateSearchRoutingSettingsForSettingsPanel();
    },
    onSearchRoutingSettingsChange: (search) => {
      void actions.updateSearchRoutingSettings(search);
    },
    onLocalDeepResearchSettingsChange: (localDeepResearch) => {
      void actions.updateLocalDeepResearchSettings(localDeepResearch);
    },
    onOpenAmbientCliSecretDialog: actions.openAmbientCliSecretDialog,
    onVoiceSettingsChange: (voice) => {
      void actions.updateVoiceSettings(voice);
    },
    onLoadVoiceProviders: actions.loadVoiceProviders,
    onRefreshVoiceCatalog: (providerCapabilityId) => {
      void actions.refreshVoiceCatalog(providerCapabilityId);
    },
    onSttSettingsChange: (stt) => {
      void actions.updateSttSettings(stt);
    },
    onLoadSttProviders: actions.loadSttProviders,
    onLoadSttMicrophoneDevices: (requestPermission) => {
      void actions.loadSttMicrophoneDeviceList({ requestPermission });
    },
    onSetupSttProvider: (action) => {
      void actions.setupSttProvider(action);
    },
    onSetupMiniCpmVisionProvider: (action) => {
      void actions.setupMiniCpmVisionProviderFromSettings(action);
    },
    onMiniCpmVisionRuntimePathChange: providerRuntimeState.setMiniCpmVisionRuntimePath,
    onMiniCpmVisionEndpointUrlChange: providerRuntimeState.setMiniCpmVisionEndpointUrl,
    onSetupLocalDeepResearch: (action) => {
      void actions.setupLocalDeepResearchFromSettings(action);
    },
    onLocalDeepResearchQ8OverrideChange: providerRuntimeState.setLocalDeepResearchQ8Override,
    onLoadLocalDeepResearchRunHistory: () => {
      void actions.loadLocalDeepResearchRunHistory();
    },
    onStartSttMicTest: () => {
      void actions.startSttMicTest();
    },
    onStopSttMicTest: () => {
      void actions.stopSttMicTestAndValidate();
    },
    onCancelSttMicTest: actions.cancelSttMicTest,
    onClearMcpContainerRuntimeInstallProgress: () => providerRuntimeState.setMcpContainerRuntimeInstallProgress(undefined),
    onClearMcpDefaultCapabilityInstallProgress: () => providerRuntimeState.setMcpDefaultCapabilityInstallProgress(undefined),
    onExportDiagnostics: () => actions.exportDiagnostics(),
    onImportDiagnostics: () => actions.importDiagnostics(),
    onSelectThread: actions.selectThread,
    onAddContext: actions.addContextAttachments,
    onRemoveContext: actions.removeContextAttachment,
    onClearContext: actions.clearContextAttachments,
    onContextError: workflowRuntimeState.setContextError,
    onGitReviewChanged: workspaceShellState.setActiveGitReview,
    onWorkspaceChanged: () => workspaceShellState.setWorkspaceRevision((revision) => revision + 1),
    onStartCapabilityBuilder: actions.startCapabilityBuilderPrompt,
    onOpenPluginCapabilities: () => rightPanelState.setRightPanel("plugins"),
    onOpenMcpRuntimeSettings: rightPanelState.openMcpRuntimeSettings,
    onDefaultCapabilityInstalled: () => {
      void actions.openLocalDeepResearchFollowupIfSetupNeeded();
    },
    onBrowserUserActionCompleted: actions.continueAfterBrowserUserActionIfReady,
    onClose: () => rightPanelState.setRightPanel(undefined),
  };
}
