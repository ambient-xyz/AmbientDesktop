import {
  registerPluginAddCodexMarketplaceIpc,
  registerPluginAuthIpc,
  registerPluginImportCodexCacheIpc,
  registerPluginInstallDependenciesIpc,
  registerPluginRemoveCodexMarketplaceIpc,
  registerPluginSetEnabledIpc,
  registerPluginSetTrustedIpc,
  registerPluginUninstallCodexIpc,
} from "./registerPluginIpc";
import type { RegisterPluginToolingDomainIpcDependencies } from "./registerPluginToolingDomainIpcTypes";

type RegisterPluginMutationDependencies = Pick<
  RegisterPluginToolingDomainIpcDependencies,
  | "activeThreadIdForHost"
  | "codexPluginTrustFingerprint"
  | "handleIpc"
  | "openAllowedExternalUrl"
  | "permissions"
  | "pluginHost"
  | "pluginStateReaderForStore"
  | "readCodexPluginCatalog"
  | "requireActiveProjectRuntimeHost"
  | "resetProjectRuntimeAndPluginServers"
>;

export function registerPluginToolingPluginMutationIpc({
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
}: RegisterPluginMutationDependencies): void {
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
        const plugin = await pluginHost.readCodexPlugin(
          host.workspacePath,
          { pluginId: input.pluginId },
          pluginStateReaderForStore(targetStore),
        );
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
