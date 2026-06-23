import type { IpcMain } from "electron";

import {
  capabilityBuilderHistoryIpcChannels,
  registerCapabilityBuilderHistoryIpc,
} from "./registerCapabilityBuilderIpc";
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
  registerMcpContainerRuntimeDeferIpc,
  registerMcpContainerRuntimeLaunchInstallIpc,
  registerMcpContainerRuntimeLifecyclePreviewIpc,
  registerMcpContainerRuntimeLifecycleRunIpc,
  registerMcpContainerRuntimeStatusIpc,
  registerMcpDefaultCapabilityInstallIpc,
  registerMcpInstalledListIpc,
  registerMcpRegistryDescribeIpc,
  registerMcpRegistryInstallIpc,
  registerMcpRegistrySearchIpc,
  registerMcpServerUninstallIpc,
  registerMcpToolReviewAcceptIpc,
} from "./registerMcpIpc";
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
  registerPluginAddCodexMarketplaceIpc,
  registerPluginAuthIpc,
  registerPluginCapabilityDiagnosticsIpc,
  registerPluginDiscoveryIpc,
  registerPluginHostedMarketplaceIpc,
  registerPluginImportCodexCacheIpc,
  registerPluginInstallDependenciesIpc,
  registerPluginMcpInspectionIpc,
  registerPluginMcpRuntimeActionIpc,
  registerPluginMcpRuntimeListIpc,
  registerPluginReadIpc,
  registerPluginRegistryIpc,
  registerPluginRemoveCodexMarketplaceIpc,
  registerPluginRuntimeCapabilitiesIpc,
  registerPluginSetEnabledIpc,
  registerPluginSetTrustedIpc,
  registerPluginUninstallCodexIpc,
} from "./registerPluginIpc";
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
  registerPluginDiscoveryIpc({
    handleIpc,
    readCodexPluginCatalog: () => readCodexPluginCatalog(requireActiveProjectRuntimeHost().store),
  });

  registerPluginReadIpc({
    handleIpc,
    readCodexPlugin: (input) => {
      const host = requireActiveProjectRuntimeHost();
      return pluginHost.readCodexPlugin(host.workspacePath, input, pluginStateReaderForStore(host.store));
    },
  });

  registerPluginHostedMarketplaceIpc({
    handleIpc,
    readCodexHostedMarketplaceReport: () => readCodexHostedMarketplaceReport(requireActiveProjectRuntimeHost().store),
  });

  registerPluginMcpInspectionIpc({
    handleIpc,
    inspectCodexPluginMcp: async () => {
      const host = requireActiveProjectRuntimeHost();
      const targetStore = host.store;
      const thread = targetStore.getThread(activeThreadIdForHost(host));
      return pluginHost.inspectCodexPluginMcp(host.workspacePath, pluginStateReaderForStore(targetStore), {
        permissionMode: thread.permissionMode,
        workspacePath: host.workspacePath,
      });
    },
  });

  registerPluginMcpRuntimeListIpc({
    handleIpc,
    listPluginMcpRuntimeSnapshots: allPluginMcpRuntimeSnapshots,
  });

  registerPluginMcpRuntimeActionIpc({
    handleIpc,
    restartPluginMcpRuntime: async (key) => {
      const hostSnapshots = await pluginHost.restartPluginMcpRuntime(key);
      if (hostSnapshots) return allPluginMcpRuntimeSnapshots();
      return restartProjectRuntimeMcpRuntime(key);
    },
    stopPluginMcpRuntime: async (key) => {
      const hostSnapshots = await pluginHost.stopPluginMcpRuntime(key);
      if (hostSnapshots) return allPluginMcpRuntimeSnapshots();
      return stopProjectRuntimeMcpRuntime(key);
    },
  });

  registerPluginRegistryIpc({
    handleIpc,
    readAmbientPluginRegistry: () => readAmbientPluginRegistry(requireActiveProjectRuntimeHost().store),
  });

  registerMcpRegistrySearchIpc({
    handleIpc,
    searchRegistryServers: (input) => {
      const { catalog } = createMcpInstallCatalog();
      return catalog.searchRegistryServers(input);
    },
  });

  registerMcpRegistryDescribeIpc({
    handleIpc,
    describeRegistryServer: async (input) => {
      const { catalog } = createMcpInstallCatalog();
      return ambientMcpInstallPreview(await catalog.previewRegistryInstall(input));
    },
  });

  registerMcpInstalledListIpc({
    handleIpc,
    listInstalledServers: () => {
      const { catalog } = createMcpInstallCatalog();
      return catalog.listInstalledServers();
    },
  });

  registerMcpContainerRuntimeStatusIpc({
    handleIpc,
    probeContainerRuntimeStatus: probeAmbientMcpContainerRuntimeStatus,
  });

  registerMcpContainerRuntimeLaunchInstallIpc({
    handleIpc,
    launchContainerRuntimeInstall: async (input) => {
      const { toolHive } = createMcpInstallCatalog();
      const runtimeProbe = await probeContainerRuntime({ toolHive });
      const plan = buildContainerRuntimeInstallPlanFromProbe(runtimeProbe);
      if (!plan) {
        if (runtimeProbe.status === "ready") throw new Error("The isolated MCP container runtime is already ready.");
        throw new Error(runtimeProbe.message);
      }
      return launchContainerRuntimeInstallAction(plan, {
        actionId: input.actionId,
        openExternal: (url: string) => openAllowedExternalUrl(url, "mcp-container-runtime-install"),
        openApplication: openContainerRuntimeApplication,
        executeManagedInstall: (action: any) => executeContainerRuntimeManagedInstallAction(action, {
          mode: input.mode ?? "execute",
          workspacePath: app.getPath("userData"),
          ...(activeThreadId ? { threadId: activeThreadId } : {}),
          privilegedAdapter: createPrivilegedActionAdapter({
            adapter: privilegedActionAdapterSelectionFromEnv(process.env),
            credentialRehearsalAvailable: true,
          }),
          requestCredential: (request: any) => privilegedCredentials.request(request),
          writeRedactedLog: (result: any) => writePrivilegedActionRedactedLog(app.getPath("userData"), result),
          writeManagedInstallLog: (result: any) => writeContainerRuntimeManagedInstallRedactedLog(app.getPath("userData"), result),
          onProgress: (progress: any) => emitMainWindowDesktopEvent({
            type: "mcp-container-runtime-install-progress",
            progress,
          }),
        }),
      }).then(async (result: any) => {
        if (!result.managedResult || result.managedResult.status === "succeeded") {
          await recordContainerRuntimeInstallLaunched(mcpContainerRuntimeSetupStatePath(), result.action, {
            appVersion: packageJson.version,
          });
        }
        return result;
      });
    },
  });

  registerMcpContainerRuntimeDeferIpc({
    handleIpc,
    deferContainerRuntimeSetup: async () => {
      await recordContainerRuntimeDeferred(mcpContainerRuntimeSetupStatePath(), {
        appVersion: packageJson.version,
      });
      return probeAmbientMcpContainerRuntimeStatus();
    },
  });

  registerMcpContainerRuntimeLifecyclePreviewIpc({
    handleIpc,
    previewContainerRuntimeLifecycle: async (input) => {
      const status = await probeAmbientMcpContainerRuntimeStatus();
      return previewContainerRuntimeLifecycleAction({
        action: input.action,
        runtime: input.runtime,
        status,
      });
    },
  });

  registerMcpContainerRuntimeLifecycleRunIpc({
    handleIpc,
    runContainerRuntimeLifecycle: async (input) => {
      const result = await runContainerRuntimeLifecycleAction(input, {
        getStatus: probeAmbientMcpContainerRuntimeStatus,
        onProgress: (progress: any) => emitMainWindowDesktopEvent({
          type: "mcp-container-runtime-lifecycle-progress",
          progress,
        }),
      });
      const logPath = await writeContainerRuntimeLifecycleRedactedLog(app.getPath("userData"), result);
      return {
        ...result,
        logPath,
      };
    },
  });

  registerMcpDefaultCapabilityInstallIpc({
    handleIpc,
    installDefaultCapability: (input) => installMcpDefaultCapabilityForDesktop(requireActiveProjectRuntimeHost(), input),
  });

  registerMcpRegistryInstallIpc({
    handleIpc,
    installRegistryServer: (input) => installMcpRegistryServerForDesktop(requireActiveProjectRuntimeHost(), input),
  });

  registerMcpServerUninstallIpc({
    handleIpc,
    uninstallServer: (input) => uninstallMcpServerForDesktop(requireActiveProjectRuntimeHost(), input),
  });

  registerMcpToolReviewAcceptIpc({
    handleIpc,
    acceptToolReview: (input) => acceptMcpToolDescriptorReviewForDesktop(requireActiveProjectRuntimeHost(), input),
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

  registerPluginRuntimeCapabilitiesIpc({
    handleIpc,
    listRuntimeCapabilities: (input) => {
      const host = requireActiveProjectRuntimeHost();
      return pluginHost.listRuntimeCapabilities(host.workspacePath, input.runtime, pluginStateReaderForStore(host.store));
    },
  });

  registerPluginCapabilityDiagnosticsIpc({
    handleIpc,
    getCapabilityDiagnostics: (input) => {
      const host = requireActiveProjectRuntimeHost();
      return pluginHost.getCapabilityDiagnostics(host.workspacePath, input.capabilityId, pluginStateReaderForStore(host.store));
    },
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

  registerPluginAuthIpc({
    handleIpc,
    startPluginAppAuth: (input) => pluginHost.startPluginAppAuth(input),
    completePluginAppAuth: (input) => pluginHost.completePluginAppAuth(input),
    revokePluginAuthAccount: (input) => pluginHost.revokePluginAuthAccount(input),
    disconnectPluginAuthAccount: (input) => pluginHost.disconnectPluginAuthAccount(input),
    testPluginAuthAccount: (input) => pluginHost.testPluginAuthAccount(input),
    openPluginAuthUrl: (url) => openAllowedExternalUrl(url, "plugin-auth"),
    reportPluginAuthOpenUrlError: (error) => {
      console.warn(`Failed to open plugin auth URL: ${error instanceof Error ? error.message : String(error)}`);
    },
  });

  registerPluginSetEnabledIpc({
    handleIpc,
    setCodexPluginEnabled: (input) => {
      const host = requireActiveProjectRuntimeHost();
      host.store.setPluginEnabled(input.pluginId, input.enabled);
      resetProjectRuntimeAndPluginServers(host);
      return readCodexPluginCatalog(host.store);
    },
  });

  registerPluginSetTrustedIpc({
    handleIpc,
    setCodexPluginTrusted: async (input) => {
      const host = requireActiveProjectRuntimeHost();
      const targetStore = host.store;
      if (input.trusted) {
        const plugin = await pluginHost.readCodexPlugin(host.workspacePath, { pluginId: input.pluginId }, pluginStateReaderForStore(targetStore));
        targetStore.setPluginTrusted(input.pluginId, true, codexPluginTrustFingerprint(plugin));
      } else {
        targetStore.setPluginTrusted(input.pluginId, false);
      }
      resetProjectRuntimeAndPluginServers(host);
      return readCodexPluginCatalog(targetStore);
    },
  });

  registerPluginImportCodexCacheIpc({
    handleIpc,
    importCodexPlugin: async (input) => {
      const host = requireActiveProjectRuntimeHost();
      await pluginHost.importCodexPlugin(host.workspacePath, input);
      resetProjectRuntimeAndPluginServers(host);
      return readCodexPluginCatalog(host.store);
    },
  });

  registerPluginAddCodexMarketplaceIpc({
    handleIpc,
    addCodexMarketplace: async (input) => {
      const host = requireActiveProjectRuntimeHost();
      await pluginHost.addCodexMarketplace(host.workspacePath, input);
      return readCodexPluginCatalog(host.store);
    },
  });

  registerPluginRemoveCodexMarketplaceIpc({
    handleIpc,
    removeCodexMarketplace: async (input) => {
      const host = requireActiveProjectRuntimeHost();
      await pluginHost.removeCodexMarketplace(host.workspacePath, input);
      resetProjectRuntimeAndPluginServers(host);
      return readCodexPluginCatalog(host.store);
    },
  });

  registerPluginUninstallCodexIpc({
    handleIpc,
    uninstallCodexPlugin: async (input) => {
      const host = requireActiveProjectRuntimeHost();
      const targetStore = host.store;
      await pluginHost.uninstallCodexPlugin(host.workspacePath, input);
      targetStore.setPluginEnabled(input.pluginId, false);
      targetStore.setPluginTrusted(input.pluginId, false);
      resetProjectRuntimeAndPluginServers(host);
      return readCodexPluginCatalog(targetStore);
    },
  });

  registerPluginInstallDependenciesIpc({
    handleIpc,
    installCodexPluginDependencies: async (input) => {
      const host = requireActiveProjectRuntimeHost();
      const targetStore = host.store;
      const targetThreadId = activeThreadIdForHost(host);
      const plugin = await pluginHost.readCodexPlugin(host.workspacePath, input, pluginStateReaderForStore(targetStore));
      if (!plugin.dependencyStatus?.required) throw new Error("Codex plugin does not have MCP dependencies to install.");
      if (plugin.dependencyStatus.installed) throw new Error("Codex plugin dependencies are already installed.");
      const response = await permissions.request({
        threadId: targetThreadId,
        toolName: "plugin_dependencies_install",
        title: `Install dependencies for "${plugin.displayName ?? plugin.name}"?`,
        message: "Ambient will run this plugin's package manager install in the workspace. Lifecycle scripts are disabled.",
        detail: [
          `Workspace: ${host.workspacePath}`,
          `Plugin: ${plugin.displayName ?? plugin.name}`,
          `Directory: ${plugin.rootPath}`,
          `Command: ${plugin.dependencyStatus.installCommand.join(" ")}`,
          `Missing packages: ${plugin.dependencyStatus.missingPackages.slice(0, 20).join(", ")}`,
        ].join("\n"),
        risk: "plugin-tool",
      });
      const allowed = response.allowed;
      if (!allowed) throw new Error("Codex plugin dependency install was not approved.");
      const result = await pluginHost.installCodexPluginDependencies(host.workspacePath, input);
      resetProjectRuntimeAndPluginServers(host);
      return result;
    },
  });
}
