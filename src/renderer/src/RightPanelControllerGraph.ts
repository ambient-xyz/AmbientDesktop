import { useEffect, type ReactNode } from "react";

import type { AgentMemoryEmbeddingLifecycleActionKind } from "../../shared/agentMemoryDiagnostics";
import type { RightPanelProps } from "./RightPanelTypes";
import { useRightPanelCapabilityBuilderController } from "./RightPanelCapabilityBuilderController";
import { useRightPanelBrowserController } from "./RightPanelBrowserController";
import { renderRightPanelBody, rightPanelTitle } from "./RightPanelBodyRenderer";
import { useRightPanelDiagnosticsController } from "./RightPanelDiagnosticsController";
import { useRightPanelGitController } from "./RightPanelGitController";
import { useRightPanelGoogleIntegrationBridge } from "./RightPanelGoogleIntegrationBridge";
import { useRightPanelMcpController } from "./RightPanelMcpController";
import { useRightPanelPiPackageController } from "./RightPanelPiPackageController";
import { useRightPanelPluginAuthController } from "./RightPanelPluginAuthController";
import { useRightPanelPluginCatalogController } from "./RightPanelPluginCatalogController";
import { useRightPanelSettingsController } from "./RightPanelSettingsController";
import {
  useRightPanelFilesController,
  useRightPanelSearchController,
  useRightPanelTerminalController,
} from "./RightPanelUtilityPaneControllers";

export type RightPanelControllerGraph = ReturnType<typeof useRightPanelControllerGraph>;

export function useRightPanelControllerGraph(input: RightPanelProps): {
  title: string;
  body: ReactNode;
  controllers: {
    terminalPane: ReturnType<typeof useRightPanelTerminalController>;
    searchPane: ReturnType<typeof useRightPanelSearchController>;
    filesPane: ReturnType<typeof useRightPanelFilesController>;
    gitPane: ReturnType<typeof useRightPanelGitController>;
    browserPane: ReturnType<typeof useRightPanelBrowserController>;
    settingsPane: ReturnType<typeof useRightPanelSettingsController>;
    mcpPane: ReturnType<typeof useRightPanelMcpController>;
    diagnosticsPane: ReturnType<typeof useRightPanelDiagnosticsController>;
    pluginCatalogPane: ReturnType<typeof useRightPanelPluginCatalogController>;
    pluginAuthPane: ReturnType<typeof useRightPanelPluginAuthController>;
    googleIntegrationBridge: ReturnType<typeof useRightPanelGoogleIntegrationBridge>;
    capabilityBuilderLauncher: ReturnType<typeof useRightPanelCapabilityBuilderController>;
    piPackagePane: ReturnType<typeof useRightPanelPiPackageController>;
  };
} {
  const {
    panel,
    panelWidth,
    state,
    workspaceRevision,
    pluginCatalogRevision,
    permissionAuditRevision,
    browserRevision,
    artifactPreviewRequest,
    localFilePreviewRequest,
    gitPanelTabRequest,
    settingsFocusRequest,
    running,
    onLoadPermissionAudit,
    onLoadPermissionGrants,
    onSaveModelProviderCredential,
    onInstallModelProviderEndpoint,
    onRunLocalModelRuntimeLifecycleAction,
    onRefreshAgentMemoryDiagnostics,
    onRunAgentMemoryEmbeddingLifecycleAction,
    onClearAgentMemory,
    onHydrateSearchRoutingSettings,
    onApplyMemorySettingsSnapshot,
    onSttSettingsChange,
    onExportDiagnostics,
    onImportDiagnostics,
    onGitReviewChanged,
    onWorkspaceChanged,
    onStartCapabilityBuilder,
    onDefaultCapabilityInstalled,
    onBrowserUserActionCompleted,
  } = input;

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
  const browserPane = useRightPanelBrowserController({
    panel,
    workspacePath: state.activeWorkspace.path,
    browserRevision,
    onBrowserUserActionCompleted,
  });
  const mcpPane = useRightPanelMcpController({
    activeWorkspacePath: state.activeWorkspace.path,
    workspacePath: state.workspace.path,
    onClearMcpContainerRuntimeInstallProgress: input.onClearMcpContainerRuntimeInstallProgress,
    onClearMcpDefaultCapabilityInstallProgress: input.onClearMcpDefaultCapabilityInstallProgress,
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
    onLoadVoiceProviders: input.onLoadVoiceProviders,
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

  const title = rightPanelTitle(panel);

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

  const controllers = {
    terminalPane,
    searchPane,
    filesPane,
    gitPane,
    browserPane,
    settingsPane,
    mcpPane,
    diagnosticsPane,
    pluginCatalogPane,
    pluginAuthPane,
    googleIntegrationBridge,
    capabilityBuilderLauncher,
    piPackagePane,
  };

  const body = renderRightPanelBody({
    ...input,
    controllers,
    onRunAgentMemoryEmbeddingLifecycleActionFromSettings: runAgentMemoryEmbeddingLifecycleActionFromSettings,
  });

  return {
    title,
    body,
    controllers,
  };
}
