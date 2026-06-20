import type { IpcMain, IpcMainInvokeEvent } from "electron";

export interface DesktopIpcTrustWindow {
  webContents: {
    id: number;
  };
}

export interface DesktopIpcTrustServiceDependencies {
  ipcMain: Pick<IpcMain, "handle">;
  mainWindow(): DesktopIpcTrustWindow | undefined;
  rendererUrl(): string | undefined;
  builtRendererUrl(): URL;
}

export function createDesktopIpcTrustService({
  ipcMain,
  mainWindow,
  rendererUrl,
  builtRendererUrl,
}: DesktopIpcTrustServiceDependencies) {
  function assertTrustedMainWindowIpc(event: IpcMainInvokeEvent, channel = "Main-process IPC"): void {
    const targetWindow = mainWindow();
    if (!targetWindow || event.sender.id !== targetWindow.webContents.id) {
      throw new Error(`${channel} is limited to the main application window.`);
    }
    const frameUrl = event.senderFrame?.url || event.sender.getURL();
    if (!isTrustedRendererUrl(frameUrl)) {
      throw new Error(`${channel} rejected from an untrusted renderer frame.`);
    }
  }

  function handleIpc(channel: string, listener: Parameters<IpcMain["handle"]>[1]): void {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedMainWindowIpc(event, `IPC channel "${channel}"`);
      return listener(event, ...args);
    });
  }

  function isTrustedRendererUrl(raw: string): boolean {
    try {
      const url = new URL(raw);
      const trustedUrl = trustedMainRendererUrl();
      if (!trustedUrl) return false;
      if (trustedUrl.protocol === "file:") return url.protocol === "file:" && url.href === trustedUrl.href;
      return (url.protocol === "http:" || url.protocol === "https:") && url.origin === trustedUrl.origin && isLoopbackHost(url.hostname);
    } catch {
      return false;
    }
  }

  function trustedMainRendererUrl(): URL | undefined {
    const devRendererUrl = rendererUrl()?.trim();
    if (devRendererUrl) {
      try {
        const url = new URL(devRendererUrl);
        if ((url.protocol === "http:" || url.protocol === "https:") && isLoopbackHost(url.hostname)) return url;
      } catch {
        return undefined;
      }
      return undefined;
    }
    return builtRendererUrl();
  }

  return {
    assertTrustedMainWindowIpc,
    handleIpc,
    isLoopbackHost,
    isTrustedRendererUrl,
  };
}

export function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}
