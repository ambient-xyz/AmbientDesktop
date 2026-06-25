import type { IpcMain } from "electron";

import { capabilityBuilderHistoryIpcChannels, registerCapabilityBuilderHistoryIpc } from "./registerCapabilityBuilderIpc";
import {
  googleDisconnectIpcChannels,
  googleInstallCliIpcChannels,
  googleIntegrationStateIpcChannels,
  googleOAuthClientImportIpcChannels,
  googleSetupCancelIpcChannels,
  googleSetupStartIpcChannels,
  googleValidateIpcChannels,
  registerGoogleDisconnectIpc,
  registerGoogleInstallCliIpc,
  registerGoogleIntegrationStateIpc,
  registerGoogleOAuthClientImportIpc,
  registerGoogleSetupCancelIpc,
  registerGoogleSetupStartIpc,
  registerGoogleValidateIpc,
} from "./registerGoogleWorkspaceIpc";
import {
  mcpContainerRuntimeDeferIpcChannels,
  mcpContainerRuntimeLaunchInstallIpcChannels,
  mcpContainerRuntimeLifecyclePreviewIpcChannels,
  mcpContainerRuntimeLifecycleRunIpcChannels,
  mcpContainerRuntimeStatusIpcChannels,
  mcpDefaultCapabilityInstallIpcChannels,
  mcpInstalledListIpcChannels,
  mcpRegistryDescribeIpcChannels,
  mcpRegistryInstallIpcChannels,
  mcpRegistrySearchIpcChannels,
  mcpServerUninstallIpcChannels,
  mcpToolReviewAcceptIpcChannels,
} from "./registerMcpIpc";
import { registerPluginToolingMcpInstallIpc } from "./registerPluginToolingMcpInstallIpc";
import {
  pluginAddCodexMarketplaceIpcChannels,
  pluginAuthIpcChannels,
  pluginCapabilityDiagnosticsIpcChannels,
  pluginDiscoveryIpcChannels,
  pluginHostedMarketplaceIpcChannels,
  pluginImportCodexCacheIpcChannels,
  pluginInstallDependenciesIpcChannels,
  pluginMcpInspectionIpcChannels,
  pluginMcpRuntimeActionIpcChannels,
  pluginMcpRuntimeListIpcChannels,
  pluginReadIpcChannels,
  pluginRegistryIpcChannels,
  pluginRemoveCodexMarketplaceIpcChannels,
  pluginRuntimeCapabilitiesIpcChannels,
  pluginSetEnabledIpcChannels,
  pluginSetTrustedIpcChannels,
  pluginUninstallCodexIpcChannels,
} from "./registerPluginIpc";
import { registerPluginToolingPluginMutationIpc } from "./registerPluginToolingPluginMutationIpc";
import {
  registerPluginToolingPluginCatalogRuntimeIpc,
  registerPluginToolingRuntimeCapabilityIpc,
} from "./registerPluginToolingPluginRuntimeIpc";
import {
  registerToolsManagedDevServerStopIpc,
  registerToolsManagedDevServersIpc,
  toolsManagedDevServerStopIpcChannels,
  toolsManagedDevServersIpcChannels,
} from "./registerToolsIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export const pluginToolingDomainIpcChannels = [
  ...pluginDiscoveryIpcChannels,
  ...pluginReadIpcChannels,
  ...pluginHostedMarketplaceIpcChannels,
  ...pluginMcpInspectionIpcChannels,
  ...pluginMcpRuntimeListIpcChannels,
  ...pluginMcpRuntimeActionIpcChannels,
  ...pluginRegistryIpcChannels,
  ...mcpRegistrySearchIpcChannels,
  ...mcpRegistryDescribeIpcChannels,
  ...mcpInstalledListIpcChannels,
  ...mcpContainerRuntimeStatusIpcChannels,
  ...mcpContainerRuntimeLaunchInstallIpcChannels,
  ...mcpContainerRuntimeDeferIpcChannels,
  ...mcpContainerRuntimeLifecyclePreviewIpcChannels,
  ...mcpContainerRuntimeLifecycleRunIpcChannels,
  ...mcpDefaultCapabilityInstallIpcChannels,
  ...mcpRegistryInstallIpcChannels,
  ...mcpServerUninstallIpcChannels,
  ...mcpToolReviewAcceptIpcChannels,
  ...toolsManagedDevServersIpcChannels,
  ...toolsManagedDevServerStopIpcChannels,
  ...capabilityBuilderHistoryIpcChannels,
  ...pluginRuntimeCapabilitiesIpcChannels,
  ...pluginCapabilityDiagnosticsIpcChannels,
  ...googleIntegrationStateIpcChannels,
  ...googleInstallCliIpcChannels,
  ...googleSetupStartIpcChannels,
  ...googleSetupCancelIpcChannels,
  ...googleOAuthClientImportIpcChannels,
  ...googleValidateIpcChannels,
  ...googleDisconnectIpcChannels,
  ...pluginAuthIpcChannels,
  ...pluginSetEnabledIpcChannels,
  ...pluginSetTrustedIpcChannels,
  ...pluginImportCodexCacheIpcChannels,
  ...pluginAddCodexMarketplaceIpcChannels,
  ...pluginRemoveCodexMarketplaceIpcChannels,
  ...pluginUninstallCodexIpcChannels,
  ...pluginInstallDependenciesIpcChannels,
] as const;

export interface RegisterPluginToolingDomainIpcDependencies {
  handleIpc: HandleIpc;
  acceptMcpToolDescriptorReviewForDesktop: any;
  activeThreadId: any;
  activeThreadIdForHost: any;
  allPluginMcpRuntimeSnapshots: any;
  ambientMcpInstallPreview: any;
  app: any;
  buildContainerRuntimeInstallPlanFromProbe: any;
  codexPluginTrustFingerprint: any;
  createMcpInstallCatalog: any;
  createPrivilegedActionAdapter: any;
  dialog: any;
  discoverCapabilityBuilderHistory: any;
  emitMainWindowDesktopEvent: any;
  executeContainerRuntimeManagedInstallAction: any;
  googleWorkspaceCliInstaller: any;
  googleWorkspaceSetupService: any;
  installMcpDefaultCapabilityForDesktop: any;
  installMcpRegistryServerForDesktop: any;
  launchContainerRuntimeInstallAction: any;
  listManagedDevServers: any;
  mcpContainerRuntimeSetupStatePath: any;
  openAllowedExternalUrl: any;
  openContainerRuntimeApplication: any;
  packageJson: any;
  permissions: any;
  pluginHost: any;
  pluginStateReaderForStore: any;
  privilegedActionAdapterSelectionFromEnv: any;
  privilegedCredentials: any;
  previewContainerRuntimeLifecycleAction: any;
  probeAmbientMcpContainerRuntimeStatus: any;
  probeContainerRuntime: any;
  readAmbientPluginRegistry: any;
  readCodexHostedMarketplaceReport: any;
  readCodexPluginCatalog: any;
  readFirstPartyGoogleIntegration: any;
  recordContainerRuntimeDeferred: any;
  recordContainerRuntimeInstallLaunched: any;
  redactGoogleWorkspaceSetupState: any;
  refreshGoogleWorkspaceConnectorMode: any;
  requireActiveProjectRuntimeHost: any;
  resetProjectRuntimeAndPluginServers: any;
  resetRuntimeAndPluginServers: any;
  runContainerRuntimeLifecycleAction: any;
  restartProjectRuntimeMcpRuntime: any;
  stopManagedDevServer: any;
  stopProjectRuntimeMcpRuntime: any;
  uninstallMcpServerForDesktop: any;
  writeContainerRuntimeLifecycleRedactedLog: any;
  writeContainerRuntimeManagedInstallRedactedLog: any;
  writePrivilegedActionRedactedLog: any;
}

export function registerPluginToolingDomainIpc({
  handleIpc,
  acceptMcpToolDescriptorReviewForDesktop,
  activeThreadId,
  activeThreadIdForHost,
  allPluginMcpRuntimeSnapshots,
  ambientMcpInstallPreview,
  app,
  buildContainerRuntimeInstallPlanFromProbe,
  codexPluginTrustFingerprint,
  createMcpInstallCatalog,
  createPrivilegedActionAdapter,
  dialog,
  discoverCapabilityBuilderHistory,
  emitMainWindowDesktopEvent,
  executeContainerRuntimeManagedInstallAction,
  googleWorkspaceCliInstaller,
  googleWorkspaceSetupService,
  installMcpDefaultCapabilityForDesktop,
  installMcpRegistryServerForDesktop,
  launchContainerRuntimeInstallAction,
  listManagedDevServers,
  mcpContainerRuntimeSetupStatePath,
  openAllowedExternalUrl,
  openContainerRuntimeApplication,
  packageJson,
  permissions,
  pluginHost,
  pluginStateReaderForStore,
  privilegedActionAdapterSelectionFromEnv,
  privilegedCredentials,
  previewContainerRuntimeLifecycleAction,
  probeAmbientMcpContainerRuntimeStatus,
  probeContainerRuntime,
  readAmbientPluginRegistry,
  readCodexHostedMarketplaceReport,
  readCodexPluginCatalog,
  readFirstPartyGoogleIntegration,
  recordContainerRuntimeDeferred,
  recordContainerRuntimeInstallLaunched,
  redactGoogleWorkspaceSetupState,
  refreshGoogleWorkspaceConnectorMode,
  requireActiveProjectRuntimeHost,
  resetProjectRuntimeAndPluginServers,
  resetRuntimeAndPluginServers,
  runContainerRuntimeLifecycleAction,
  restartProjectRuntimeMcpRuntime,
  stopManagedDevServer,
  stopProjectRuntimeMcpRuntime,
  uninstallMcpServerForDesktop,
  writeContainerRuntimeLifecycleRedactedLog,
  writeContainerRuntimeManagedInstallRedactedLog,
  writePrivilegedActionRedactedLog,
}: RegisterPluginToolingDomainIpcDependencies): void {
  registerPluginToolingPluginCatalogRuntimeIpc({
    activeThreadIdForHost,
    allPluginMcpRuntimeSnapshots,
    handleIpc,
    pluginHost,
    pluginStateReaderForStore,
    readAmbientPluginRegistry,
    readCodexHostedMarketplaceReport,
    readCodexPluginCatalog,
    requireActiveProjectRuntimeHost,
    restartProjectRuntimeMcpRuntime,
    stopProjectRuntimeMcpRuntime,
  });

  registerPluginToolingMcpInstallIpc({
    acceptMcpToolDescriptorReviewForDesktop,
    activeThreadId,
    ambientMcpInstallPreview,
    app,
    buildContainerRuntimeInstallPlanFromProbe,
    createMcpInstallCatalog,
    createPrivilegedActionAdapter,
    emitMainWindowDesktopEvent,
    executeContainerRuntimeManagedInstallAction,
    handleIpc,
    installMcpDefaultCapabilityForDesktop,
    installMcpRegistryServerForDesktop,
    launchContainerRuntimeInstallAction,
    mcpContainerRuntimeSetupStatePath,
    openAllowedExternalUrl,
    openContainerRuntimeApplication,
    packageJson,
    privilegedActionAdapterSelectionFromEnv,
    privilegedCredentials,
    previewContainerRuntimeLifecycleAction,
    probeAmbientMcpContainerRuntimeStatus,
    probeContainerRuntime,
    recordContainerRuntimeDeferred,
    recordContainerRuntimeInstallLaunched,
    requireActiveProjectRuntimeHost,
    runContainerRuntimeLifecycleAction,
    uninstallMcpServerForDesktop,
    writeContainerRuntimeLifecycleRedactedLog,
    writeContainerRuntimeManagedInstallRedactedLog,
    writePrivilegedActionRedactedLog,
  });

  registerToolsManagedDevServersIpc({
    handleIpc,
    listManagedDevServers,
  });

  registerToolsManagedDevServerStopIpc({
    handleIpc,
    stopManagedDevServer,
    listManagedDevServers,
  });

  registerCapabilityBuilderHistoryIpc({
    handleIpc,
    getWorkspacePath: () => requireActiveProjectRuntimeHost().workspacePath,
    discoverCapabilityBuilderHistory,
  });

  registerPluginToolingRuntimeCapabilityIpc({
    handleIpc,
    pluginHost,
    pluginStateReaderForStore,
    requireActiveProjectRuntimeHost,
  });

  registerGoogleIntegrationStateIpc({
    handleIpc,
    readFirstPartyGoogleIntegration,
  });

  registerGoogleInstallCliIpc({
    handleIpc,
    installGoogleWorkspaceCli: () => googleWorkspaceCliInstaller.install(),
    refreshGoogleWorkspaceConnectorMode,
    resetRuntimeAndPluginServers,
  });

  registerGoogleSetupStartIpc({
    handleIpc,
    startGoogleWorkspaceSetup: (input) => googleWorkspaceSetupService.start(input),
    redactGoogleWorkspaceSetupState,
  });

  registerGoogleSetupCancelIpc({
    handleIpc,
    cancelGoogleWorkspaceSetup: () => googleWorkspaceSetupService.cancel(),
    redactGoogleWorkspaceSetupState,
  });

  registerGoogleOAuthClientImportIpc({
    handleIpc,
    showOpenDialog: (options) => dialog.showOpenDialog(options),
    readGoogleWorkspaceSetupState: () => googleWorkspaceSetupService.state(),
    importGoogleWorkspaceOAuthClientConfig: (input) => googleWorkspaceSetupService.importOAuthClientConfig(input),
    redactGoogleWorkspaceSetupState,
  });

  registerGoogleValidateIpc({
    handleIpc,
    validateGoogleWorkspace: (input) => googleWorkspaceSetupService.validate(input),
  });

  registerGoogleDisconnectIpc({
    handleIpc,
    forgetGoogleWorkspaceAccount: (input) => googleWorkspaceSetupService.forgetAccount(input),
    readFirstPartyGoogleIntegration,
  });

  registerPluginToolingPluginMutationIpc({
    activeThreadIdForHost,
    codexPluginTrustFingerprint,
    handleIpc,
    openAllowedExternalUrl,
    permissions,
    pluginHost,
    pluginStateReaderForStore,
    readCodexPluginCatalog,
    requireActiveProjectRuntimeHost,
    resetProjectRuntimeAndPluginServers,
  });
}
