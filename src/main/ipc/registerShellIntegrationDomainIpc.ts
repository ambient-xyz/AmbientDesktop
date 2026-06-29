import type { IpcMain } from "electron";

import {
  ambientApiKeyIpcChannels,
  ambientSecureStorageIpcChannels,
  ambientOpenKeysIpcChannels,
  registerAmbientApiKeyIpc,
  registerAmbientOpenKeysIpc,
  registerAmbientSecureStorageIpc,
  type RegisterAmbientApiKeyIpcDependencies,
  type RegisterAmbientOpenKeysIpcDependencies,
  type RegisterAmbientSecureStorageIpcDependencies,
} from "./registerAmbientIpc";
import {
  clipboardIpcChannels,
  registerClipboardIpc,
  type RegisterClipboardIpcDependencies,
} from "./registerClipboardIpc";
import {
  linksOpenExternalIpcChannels,
  registerLinksOpenExternalIpc,
  type RegisterLinksOpenExternalIpcDependencies,
} from "./registerLinksIpc";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export const shellIntegrationDomainIpcChannels = [
  ...ambientOpenKeysIpcChannels,
  ...linksOpenExternalIpcChannels,
  ...clipboardIpcChannels,
  ...ambientApiKeyIpcChannels,
  ...ambientSecureStorageIpcChannels,
] as const;

export interface RegisterShellIntegrationDomainIpcDependencies {
  handleIpc: HandleIpc;
  ambientKeysUrl: RegisterAmbientOpenKeysIpcDependencies["ambientKeysUrl"];
  openAllowedExternalUrl: RegisterAmbientOpenKeysIpcDependencies["openAllowedExternalUrl"];
  parseExternalOpenUrl: RegisterLinksOpenExternalIpcDependencies["parseExternalOpenUrl"];
  isGoogleWorkspaceSetupUrl: RegisterLinksOpenExternalIpcDependencies["isGoogleWorkspaceSetupUrl"];
  openGoogleWorkspaceUrl: RegisterLinksOpenExternalIpcDependencies["openGoogleWorkspaceUrl"];
  isLoopbackWebUrl: RegisterLinksOpenExternalIpcDependencies["isLoopbackWebUrl"];
  openRendererLocalUrlInAmbientBrowser: RegisterLinksOpenExternalIpcDependencies["openRendererLocalUrlInAmbientBrowser"];
  readClipboardText: RegisterClipboardIpcDependencies["readText"];
  writeClipboardText: RegisterClipboardIpcDependencies["writeText"];
  saveAmbientApiKey: RegisterAmbientApiKeyIpcDependencies["saveAmbientApiKey"];
  clearSavedAmbientApiKey: RegisterAmbientApiKeyIpcDependencies["clearSavedAmbientApiKey"];
  testAmbientApiKey: RegisterAmbientApiKeyIpcDependencies["testAmbientApiKey"];
  resetRuntimeAndPluginServers: RegisterAmbientApiKeyIpcDependencies["resetRuntimeAndPluginServers"];
  readCurrentSettingsModel: RegisterAmbientApiKeyIpcDependencies["readCurrentSettingsModel"];
  getAmbientProviderStatus: RegisterAmbientApiKeyIpcDependencies["getAmbientProviderStatus"];
  emitProviderUpdated: RegisterAmbientApiKeyIpcDependencies["emitProviderUpdated"];
  refreshAmbientModelDiscovery?: RegisterAmbientApiKeyIpcDependencies["refreshAmbientModelDiscovery"];
  refreshSecureStorageStatus: RegisterAmbientSecureStorageIpcDependencies["refreshSecureStorageStatus"];
  saveNamedSecret: RegisterAmbientSecureStorageIpcDependencies["saveNamedSecret"];
  updateNamedSecret: RegisterAmbientSecureStorageIpcDependencies["updateNamedSecret"];
  deleteNamedSecret: RegisterAmbientSecureStorageIpcDependencies["deleteNamedSecret"];
  brokerNamedSecretToLocalFixture: RegisterAmbientSecureStorageIpcDependencies["brokerNamedSecretToLocalFixture"];
  exportNamedSecretMetadata: RegisterAmbientSecureStorageIpcDependencies["exportNamedSecretMetadata"];
}

export function registerShellIntegrationDomainIpc({
  handleIpc,
  ambientKeysUrl,
  openAllowedExternalUrl,
  parseExternalOpenUrl,
  isGoogleWorkspaceSetupUrl,
  openGoogleWorkspaceUrl,
  isLoopbackWebUrl,
  openRendererLocalUrlInAmbientBrowser,
  readClipboardText,
  writeClipboardText,
  saveAmbientApiKey,
  clearSavedAmbientApiKey,
  testAmbientApiKey,
  resetRuntimeAndPluginServers,
  readCurrentSettingsModel,
  getAmbientProviderStatus,
  emitProviderUpdated,
  refreshAmbientModelDiscovery,
  refreshSecureStorageStatus,
  saveNamedSecret,
  updateNamedSecret,
  deleteNamedSecret,
  brokerNamedSecretToLocalFixture,
  exportNamedSecretMetadata,
}: RegisterShellIntegrationDomainIpcDependencies): void {
  registerAmbientOpenKeysIpc({
    handleIpc,
    ambientKeysUrl,
    openAllowedExternalUrl,
  });

  registerLinksOpenExternalIpc({
    handleIpc,
    parseExternalOpenUrl,
    isGoogleWorkspaceSetupUrl,
    openGoogleWorkspaceUrl,
    isLoopbackWebUrl,
    openRendererLocalUrlInAmbientBrowser,
    openAllowedExternalUrl,
  });

  registerClipboardIpc({
    handleIpc,
    readText: readClipboardText,
    writeText: writeClipboardText,
  });

  registerAmbientApiKeyIpc({
    handleIpc,
    saveAmbientApiKey,
    clearSavedAmbientApiKey,
    testAmbientApiKey,
    resetRuntimeAndPluginServers,
    readCurrentSettingsModel,
    getAmbientProviderStatus,
    emitProviderUpdated,
    refreshAmbientModelDiscovery,
  });

  registerAmbientSecureStorageIpc({
    handleIpc,
    refreshSecureStorageStatus,
    saveNamedSecret,
    updateNamedSecret,
    deleteNamedSecret,
    brokerNamedSecretToLocalFixture,
    exportNamedSecretMetadata,
  });
}
