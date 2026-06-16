import type { IpcMain } from "electron";

import {
  ambientApiKeyIpcChannels,
  ambientOpenKeysIpcChannels,
  registerAmbientApiKeyIpc,
  registerAmbientOpenKeysIpc,
  type RegisterAmbientApiKeyIpcDependencies,
  type RegisterAmbientOpenKeysIpcDependencies,
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
  });
}
