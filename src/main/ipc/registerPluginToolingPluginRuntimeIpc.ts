import {
  registerPluginCapabilityDiagnosticsIpc,
  registerPluginDiscoveryIpc,
  registerPluginHostedMarketplaceIpc,
  registerPluginMcpInspectionIpc,
  registerPluginMcpRuntimeActionIpc,
  registerPluginMcpRuntimeListIpc,
  registerPluginReadIpc,
  registerPluginRegistryIpc,
  registerPluginRuntimeCapabilitiesIpc,
} from "./registerPluginIpc";
import type { RegisterPluginToolingDomainIpcDependencies } from "./registerPluginToolingDomainIpc";

type RegisterPluginCatalogRuntimeDependencies = Pick<
  RegisterPluginToolingDomainIpcDependencies,
  | "activeThreadIdForHost"
  | "allPluginMcpRuntimeSnapshots"
  | "handleIpc"
  | "pluginHost"
  | "pluginStateReaderForStore"
  | "readAmbientPluginRegistry"
  | "readCodexHostedMarketplaceReport"
  | "readCodexPluginCatalog"
  | "requireActiveProjectRuntimeHost"
  | "restartProjectRuntimeMcpRuntime"
  | "stopProjectRuntimeMcpRuntime"
>;

type RegisterPluginRuntimeCapabilityDependencies = Pick<
  RegisterPluginToolingDomainIpcDependencies,
  "handleIpc" | "pluginHost" | "pluginStateReaderForStore" | "requireActiveProjectRuntimeHost"
>;

export function registerPluginToolingPluginCatalogRuntimeIpc({
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
}: RegisterPluginCatalogRuntimeDependencies): void {
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
}

export function registerPluginToolingRuntimeCapabilityIpc({
  handleIpc,
  pluginHost,
  pluginStateReaderForStore,
  requireActiveProjectRuntimeHost,
}: RegisterPluginRuntimeCapabilityDependencies): void {
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
}
