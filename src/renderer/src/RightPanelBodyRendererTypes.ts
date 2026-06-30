import type { AgentMemoryEmbeddingLifecycleActionKind } from "../../shared/agentMemoryDiagnostics";
import type { useRightPanelCapabilityBuilderController } from "./RightPanelCapabilityBuilderController";
import type { useRightPanelBrowserController } from "./RightPanelBrowserController";
import type { RightPanelDiagnosticsController } from "./RightPanelDiagnosticsController";
import type { useRightPanelGitController } from "./RightPanelGitController";
import type { RightPanelGoogleIntegrationBridge } from "./RightPanelGoogleIntegrationBridge";
import type { RightPanelMcpController } from "./RightPanelMcpController";
import type { useRightPanelPiPackageController } from "./RightPanelPiPackageController";
import type { useRightPanelPluginAuthController } from "./RightPanelPluginAuthController";
import type { useRightPanelPluginCatalogController } from "./RightPanelPluginCatalogController";
import type { RightPanelSettingsController } from "./RightPanelSettingsController";
import type {
  useRightPanelFilesController,
  useRightPanelSearchController,
  useRightPanelTerminalController,
} from "./RightPanelUtilityPaneControllers";
import type { RightPanelProps } from "./RightPanelTypes";

type RightPanelPiPackageController = ReturnType<typeof useRightPanelPiPackageController>;
type RightPanelPluginAuthController = ReturnType<typeof useRightPanelPluginAuthController>;
type RightPanelPluginCatalogController = ReturnType<typeof useRightPanelPluginCatalogController>;
type RightPanelBrowserController = ReturnType<typeof useRightPanelBrowserController>;
type RightPanelCapabilityBuilderController = ReturnType<typeof useRightPanelCapabilityBuilderController>;
type RightPanelGitController = ReturnType<typeof useRightPanelGitController>;
type RightPanelFilesController = ReturnType<typeof useRightPanelFilesController>;
type RightPanelSearchController = ReturnType<typeof useRightPanelSearchController>;
type RightPanelTerminalController = ReturnType<typeof useRightPanelTerminalController>;

export type RightPanelBodyRendererInput = Pick<
  RightPanelProps,
  | "panel"
  | "state"
  | "running"
  | "updateBusy"
  | "contextAttachments"
  | "permissionAudit"
  | "permissionGrants"
  | "permissionAuditError"
  | "permissionGrantError"
  | "permissionGrantRevoking"
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
  | "miniCpmVisionEndpointUrl"
  | "localDeepResearchSetup"
  | "localDeepResearchQ8Override"
  | "localDeepResearchRunHistory"
  | "sttMicTest"
  | "mcpContainerRuntimeInstallProgress"
  | "mcpDefaultCapabilityInstallProgress"
  | "searchRoutingHydrating"
  | "searchRoutingHydrationError"
  | "agentMemoryDiagnostics"
  | "agentMemoryDiagnosticsLoading"
  | "agentMemoryDiagnosticsError"
  | "agentMemoryEmbeddingActionLoading"
  | "agentMemoryEmbeddingActionResult"
  | "agentMemoryEmbeddingActionError"
  | "onLoadPermissionAudit"
  | "onLoadPermissionGrants"
  | "onRevokePermissionGrant"
  | "onRevokePermissionGrantIds"
  | "onOpenApiKey"
  | "onCheckUpdates"
  | "onThemePreferenceChange"
  | "onMediaPlaybackSettingsChange"
  | "onThinkingDisplaySettingsChange"
  | "onThinkingLevelChange"
  | "onModelRuntimeSettingsChange"
  | "onFeatureFlagSettingsChange"
  | "onMemorySettingsChange"
  | "onActiveThreadMemoryEnabledChange"
  | "onRefreshAgentMemoryDiagnostics"
  | "onPlannerSettingsChange"
  | "onHydrateSearchRoutingSettings"
  | "onSearchRoutingSettingsChange"
  | "onLocalDeepResearchSettingsChange"
  | "onOpenAmbientCliSecretDialog"
  | "onVoiceSettingsChange"
  | "onLoadVoiceProviders"
  | "onRefreshVoiceCatalog"
  | "onSttSettingsChange"
  | "onLoadSttProviders"
  | "onLoadSttMicrophoneDevices"
  | "onSetupSttProvider"
  | "onSetupMiniCpmVisionProvider"
  | "onMiniCpmVisionRuntimePathChange"
  | "onMiniCpmVisionEndpointUrlChange"
  | "onSetupLocalDeepResearch"
  | "onLocalDeepResearchQ8OverrideChange"
  | "onLoadLocalDeepResearchRunHistory"
  | "onStartSttMicTest"
  | "onStopSttMicTest"
  | "onCancelSttMicTest"
  | "onOpenPluginCapabilities"
  | "onOpenMcpRuntimeSettings"
  | "onSelectThread"
  | "onAddContext"
  | "onRemoveContext"
  | "onClearContext"
  | "onContextError"
> & {
  controllers: {
    terminalPane: RightPanelTerminalController;
    searchPane: RightPanelSearchController;
    filesPane: RightPanelFilesController;
    gitPane: RightPanelGitController;
    browserPane: RightPanelBrowserController;
    settingsPane: RightPanelSettingsController;
    mcpPane: RightPanelMcpController;
    diagnosticsPane: RightPanelDiagnosticsController;
    pluginCatalogPane: RightPanelPluginCatalogController;
    pluginAuthPane: RightPanelPluginAuthController;
    googleIntegrationBridge: RightPanelGoogleIntegrationBridge;
    capabilityBuilderLauncher: RightPanelCapabilityBuilderController;
    piPackagePane: RightPanelPiPackageController;
  };
  onRunAgentMemoryEmbeddingLifecycleActionFromSettings: (action: AgentMemoryEmbeddingLifecycleActionKind) => void | Promise<void>;
};
