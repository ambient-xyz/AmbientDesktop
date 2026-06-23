import type { BrowserTabSnapshot } from "../../shared/browserTypes";
import {
  JsonRpcWebSocketClient,
  type BrowserChromeTargetController,
} from "./browserChromeTargetController";
import { shouldReloadBrowserUrlForWorkspaceChange } from "./browserRefresh";

export interface BrowserWorkspaceRefreshInternalBackend {
  isRunning(): boolean;
  getState(): Promise<{ activeTab?: { url?: string } }>;
  navigate(input: { url: string; profileMode: "isolated"; runtime: "internal" }): Promise<unknown>;
}

export interface BrowserServiceWorkspaceRefreshControllerOptions {
  internalBrowser?: BrowserWorkspaceRefreshInternalBackend;
  chromeTargets: BrowserChromeTargetController;
  isChromeRunning: () => boolean;
  getActiveTargetId: () => string | undefined;
  setLastActiveTab: (tab: BrowserTabSnapshot | undefined) => void;
  setLastActivity: (message: string) => void;
  setLastError: (message: string | undefined) => void;
}

export class BrowserServiceWorkspaceRefreshController {
  constructor(private readonly options: BrowserServiceWorkspaceRefreshControllerOptions) {}

  async refreshWorkspaceArtifact(input: { workspacePath: string; changedPath: string }): Promise<boolean> {
    let refreshed = false;

    if (this.options.internalBrowser?.isRunning()) {
      const internal = await this.options.internalBrowser.getState();
      const activeUrl = internal.activeTab?.url;
      if (shouldReloadBrowserUrlForWorkspaceChange(activeUrl, input.workspacePath, input.changedPath)) {
        await this.options.internalBrowser.navigate({ url: activeUrl!, profileMode: "isolated", runtime: "internal" });
        refreshed = true;
      }
    }

    if (this.options.isChromeRunning()) {
      const targets = await this.options.chromeTargets.targets().catch(() => []);
      for (const target of targets) {
        if (!target.webSocketDebuggerUrl || !shouldReloadBrowserUrlForWorkspaceChange(target.url, input.workspacePath, input.changedPath)) {
          continue;
        }
        const client = await JsonRpcWebSocketClient.connect(target.webSocketDebuggerUrl);
        try {
          await client.request("Page.reload", { ignoreCache: true }, 8_000);
          refreshed = true;
          if (target.id === this.options.getActiveTargetId()) {
            this.options.setLastActiveTab({ id: target.id, title: target.title, url: target.url });
          }
        } finally {
          client.close();
        }
      }
    }

    if (refreshed) {
      this.options.setLastActivity(`Reloaded browser preview after ${input.changedPath} changed.`);
      this.options.setLastError(undefined);
    }
    return refreshed;
  }
}
