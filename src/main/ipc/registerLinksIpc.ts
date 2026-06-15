import type { IpcMain } from "electron";
import { z } from "zod";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const linksOpenExternalIpcChannels = ["links:open-external"] as const;

export interface RegisterLinksOpenExternalIpcDependencies {
  handleIpc: HandleIpc;
  parseExternalOpenUrl(raw: string): string;
  isGoogleWorkspaceSetupUrl(url: string): boolean;
  openGoogleWorkspaceUrl(url: string): MaybePromise<void>;
  isLoopbackWebUrl(url: string): boolean;
  openRendererLocalUrlInAmbientBrowser(url: string): MaybePromise<void>;
  openAllowedExternalUrl(raw: string, source: string): MaybePromise<void>;
}

export function registerLinksOpenExternalIpc({
  handleIpc,
  parseExternalOpenUrl,
  isGoogleWorkspaceSetupUrl,
  openGoogleWorkspaceUrl,
  isLoopbackWebUrl,
  openRendererLocalUrlInAmbientBrowser,
  openAllowedExternalUrl,
}: RegisterLinksOpenExternalIpcDependencies): void {
  handleIpc("links:open-external", async (_event, raw: string) => {
    const url = parseExternalOpenUrl(z.string().parse(raw));
    if (isGoogleWorkspaceSetupUrl(url)) {
      await openGoogleWorkspaceUrl(url);
      return;
    }
    if (isLoopbackWebUrl(url)) {
      await openRendererLocalUrlInAmbientBrowser(url);
      return;
    }
    await openAllowedExternalUrl(url, "renderer-link");
  });
}
