import type { IpcMain } from "electron";

import {
  browserContentIpcChannels,
  browserCredentialIpcChannels,
  browserKeypressIpcChannels,
  browserLocalPreviewIpcChannels,
  browserNavigateIpcChannels,
  browserPickIpcChannels,
  browserProfileIpcChannels,
  browserRevealIpcChannels,
  browserSearchIpcChannels,
  browserSessionIpcChannels,
  browserUserActionIpcChannels,
  browserViewBoundsIpcChannels,
  registerBrowserContentIpc,
  registerBrowserCredentialIpc,
  registerBrowserKeypressIpc,
  registerBrowserLocalPreviewIpc,
  registerBrowserNavigateIpc,
  registerBrowserPickIpc,
  registerBrowserProfileIpc,
  registerBrowserRevealIpc,
  registerBrowserSearchIpc,
  registerBrowserSessionIpc,
  registerBrowserUserActionIpc,
  registerBrowserViewBoundsIpc,
} from "./registerBrowserIpc";
import type { BrowserLocalPreviewInput, BrowserLocalPreviewSession } from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;

export const browserDomainIpcChannels = [
  ...browserCredentialIpcChannels,
  ...browserSessionIpcChannels,
  ...browserRevealIpcChannels,
  ...browserProfileIpcChannels,
  ...browserNavigateIpcChannels,
  ...browserLocalPreviewIpcChannels,
  ...browserSearchIpcChannels,
  ...browserContentIpcChannels,
  ...browserKeypressIpcChannels,
  ...browserPickIpcChannels,
  ...browserUserActionIpcChannels,
  ...browserViewBoundsIpcChannels,
] as const;

export interface BrowserDomainRuntimeHost {
  workspacePath: string;
  browserCredentialStore: {
    list(): any;
    save(input: any): any;
    delete(id: string): any;
  };
  browserService: {
    getState(): any;
    start(input: any): any;
    stop(): any;
    screenshot(input: any): any;
    revealActiveBrowser(input: any): any;
    clearIsolatedBrowserProfile(): any;
    copyChromeProfile(): any;
    clearCopiedChromeProfile(): any;
    navigate(input: any): any;
    search(input: any): any;
    content(input: any): any;
    keypress(input: any): any;
    pick(input: any): any;
    cancelPick(): any;
    resumeUserAction(): any;
    cancelUserAction(): any;
    setViewBounds(input: any): void;
  };
}

export interface RegisterBrowserDomainIpcDependencies<Host extends BrowserDomainRuntimeHost = BrowserDomainRuntimeHost> {
  handleIpc: HandleIpc;
  browserLoginBrokerEnabled: boolean;
  emitBrowserStateForHost(host: Host): Promise<void>;
  isLoopbackWebUrl(url: string): boolean;
  openBrowserLocalPreview(host: Host, input: BrowserLocalPreviewInput): Promise<BrowserLocalPreviewSession>;
  recordBrowserControlAudit(host: Host, toolName: string, detail: string, reason: string): void;
  recordBrowserProfileAudit(host: Host, detail: string, reason: string): void;
  requireActiveProjectRuntimeHost(): Host;
  withBrowserState<T>(host: Host, operation: Promise<T>): Promise<T>;
}

export function registerBrowserDomainIpc<Host extends BrowserDomainRuntimeHost>({
  handleIpc,
  browserLoginBrokerEnabled,
  emitBrowserStateForHost,
  isLoopbackWebUrl,
  openBrowserLocalPreview,
  recordBrowserControlAudit,
  recordBrowserProfileAudit,
  requireActiveProjectRuntimeHost,
  withBrowserState,
}: RegisterBrowserDomainIpcDependencies<Host>): void {
  registerBrowserCredentialIpc<Host>({
    handleIpc,
    browserLoginBrokerEnabled,
    requireActiveProjectRuntimeHost,
    listBrowserCredentials: (host) => host.browserCredentialStore.list(),
    saveBrowserCredential: (host, input) => host.browserCredentialStore.save(input),
    deleteBrowserCredential: (host, input) => host.browserCredentialStore.delete(input.id),
  });

  registerBrowserSessionIpc<Host>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    readBrowserState: (host) => host.browserService.getState(),
    startBrowser: (host, input) => host.browserService.start(input),
    stopBrowser: (host) => host.browserService.stop(),
    screenshotBrowser: (host, input) => host.browserService.screenshot(input),
    withBrowserState,
  });

  registerBrowserRevealIpc<Host>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    revealBrowser: (host, input) => host.browserService.revealActiveBrowser(input),
    recordBrowserControlAudit,
    withBrowserState,
  });

  registerBrowserProfileIpc<Host>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    clearIsolatedBrowserProfile: (host) => host.browserService.clearIsolatedBrowserProfile(),
    copyChromeProfile: (host) => host.browserService.copyChromeProfile(),
    clearCopiedChromeProfile: (host) => host.browserService.clearCopiedChromeProfile(),
    recordBrowserProfileAudit,
    withBrowserState,
  });

  registerBrowserNavigateIpc<Host>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    isLoopbackWebUrl,
    navigateBrowser: (host, input) => host.browserService.navigate(input),
    withBrowserState,
  });

  registerBrowserLocalPreviewIpc<Host>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    openBrowserLocalPreview,
    navigateBrowser: (host, input) => host.browserService.navigate(input),
    recordBrowserControlAudit,
    withBrowserState,
  });

  registerBrowserSearchIpc<Host>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    searchBrowser: (host, input) => host.browserService.search(input),
    withBrowserState,
  });

  registerBrowserContentIpc<Host>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    readBrowserContent: (host, input) => host.browserService.content(input),
    withBrowserState,
  });

  registerBrowserKeypressIpc<Host>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    keypressBrowser: (host, input) => host.browserService.keypress(input),
    withBrowserState,
  });

  registerBrowserPickIpc<Host>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    pickBrowser: (host, input) => host.browserService.pick(input),
    readBrowserState: (host) => host.browserService.getState(),
    cancelBrowserPick: (host) => host.browserService.cancelPick(),
    emitBrowserStateForHost,
    browserAuditFallbackTarget: (host) => host.workspacePath,
    recordBrowserControlAudit,
    withBrowserState,
  });

  registerBrowserUserActionIpc<Host>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    resumeBrowserUserAction: (host) => host.browserService.resumeUserAction(),
    cancelBrowserUserAction: (host) => host.browserService.cancelUserAction(),
    browserAuditFallbackTarget: (host) => host.workspacePath,
    recordBrowserControlAudit,
    withBrowserState,
  });

  registerBrowserViewBoundsIpc<Host>({
    handleIpc,
    requireActiveProjectRuntimeHost,
    setBrowserViewBounds: (host, input) => host.browserService.setViewBounds(input),
  });
}
