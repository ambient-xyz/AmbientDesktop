import type {
  BrowserLocalPreviewInput,
  BrowserLocalPreviewSession,
} from "../../shared/browserTypes";
import {
  registerBrowserDomainIpc,
  type BrowserDomainRuntimeHost,
  type RegisterBrowserDomainIpcDependencies,
} from "./registerBrowserDomainIpc";
import {
  registerShellIntegrationDomainIpc,
  type RegisterShellIntegrationDomainIpcDependencies,
} from "./registerShellIntegrationDomainIpc";

type ProviderUpdate = {
  type: "provider-updated";
  provider: Parameters<
    RegisterShellIntegrationDomainIpcDependencies["emitProviderUpdated"]
  >[0];
};

type MainShellBrowserIpcDependencies<
  Host extends BrowserDomainRuntimeHost = BrowserDomainRuntimeHost,
> = Omit<
  RegisterShellIntegrationDomainIpcDependencies,
  | "ambientKeysUrl"
  | "emitProviderUpdated"
  | "readClipboardText"
  | "readCurrentSettingsModel"
  | "writeClipboardText"
> &
  Omit<RegisterBrowserDomainIpcDependencies<Host>, "openBrowserLocalPreview"> & {
    AMBIENT_KEYS_URL: RegisterShellIntegrationDomainIpcDependencies["ambientKeysUrl"];
    clipboard: {
      readText(): string;
      writeText(text: string): void;
    };
    mainWindow?: {
      webContents: {
        send(channel: "desktop:event", event: ProviderUpdate): void;
      };
    } | null;
    readState(): {
      settings: {
        model: string;
      };
    };
    rendererLocalPreviewServers: {
      open(input: {
        workspacePath: string;
        path: BrowserLocalPreviewInput["path"];
      }): Promise<BrowserLocalPreviewSession>;
    };
  };

export function registerMainShellBrowserIpc(
  deps: Record<string, unknown>,
): void {
  const {
    AMBIENT_KEYS_URL,
    browserLoginBrokerEnabled,
    clearSavedAmbientApiKey,
    clipboard,
    emitBrowserStateForHost,
    getAmbientProviderStatus,
    handleIpc,
    isGoogleWorkspaceSetupUrl,
    isLoopbackWebUrl,
    mainWindow,
    openAllowedExternalUrl,
    openGoogleWorkspaceUrl,
    openRendererLocalUrlInAmbientBrowser,
    parseExternalOpenUrl,
    readState,
    recordBrowserControlAudit,
    recordBrowserProfileAudit,
    refreshAmbientModelDiscovery,
    rendererLocalPreviewServers,
    requireActiveProjectRuntimeHost,
    resetRuntimeAndPluginServers,
    saveAmbientApiKey,
    saveNamedSecret,
    testAmbientApiKey,
    updateNamedSecret,
    deleteNamedSecret,
    brokerNamedSecretToLocalFixture,
    exportNamedSecretMetadata,
    refreshSecureStorageStatus,
    withBrowserState,
  } = deps as unknown as MainShellBrowserIpcDependencies;

  registerShellIntegrationDomainIpc({
    handleIpc,
    ambientKeysUrl: AMBIENT_KEYS_URL,
    openAllowedExternalUrl,
    parseExternalOpenUrl,
    isGoogleWorkspaceSetupUrl,
    openGoogleWorkspaceUrl,
    isLoopbackWebUrl,
    openRendererLocalUrlInAmbientBrowser,
    readClipboardText: () => clipboard.readText(),
    writeClipboardText: (text) => clipboard.writeText(text),
    saveAmbientApiKey,
    clearSavedAmbientApiKey,
    testAmbientApiKey,
    resetRuntimeAndPluginServers,
    readCurrentSettingsModel: () => readState().settings.model,
    getAmbientProviderStatus,
    emitProviderUpdated: (provider) =>
      mainWindow?.webContents.send("desktop:event", {
        type: "provider-updated",
        provider,
      }),
    refreshAmbientModelDiscovery,
    refreshSecureStorageStatus,
    saveNamedSecret,
    updateNamedSecret,
    deleteNamedSecret,
    brokerNamedSecretToLocalFixture,
    exportNamedSecretMetadata,
  });

  registerBrowserDomainIpc({
    handleIpc,
    browserLoginBrokerEnabled,
    emitBrowserStateForHost,
    isLoopbackWebUrl,
    openBrowserLocalPreview: (host, input) =>
      rendererLocalPreviewServers.open({
        workspacePath: host.workspacePath,
        path: input.path,
      }),
    recordBrowserControlAudit,
    recordBrowserProfileAudit,
    requireActiveProjectRuntimeHost,
    withBrowserState,
  });
}
