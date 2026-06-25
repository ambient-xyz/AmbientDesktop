import { BrowserWindow, WebContentsView, session, type Rectangle } from "electron";
import { createHash } from "node:crypto";
import type { BrowserTabSnapshot, BrowserViewBoundsInput } from "../../shared/browserTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { PAGE_READY_TIMEOUT_MS, delay, errorMessage } from "./browserService";
import { assertAllowedInternalBrowserUrl, isAllowedInternalBrowserUrl } from "./browserSecurityFacade";

const HIDDEN_TOOL_VIEWPORT: Rectangle = { x: -10_000, y: -10_000, width: 1280, height: 720 };
const INTERNAL_BROWSER_EVALUATE_TIMEOUT_MS = 15_000;
export const INTERNAL_BROWSER_LOCAL_PREVIEW_MAX_LIFETIME_MS = 5 * 60_000;

type InternalBrowserViewControllerOptions = {
  getWorkspace: () => WorkspaceState;
  getWindow: () => BrowserWindow | undefined;
  setLastActivity: (message: string) => void;
  setLastError: (message: string | undefined) => void;
};

export class InternalBrowserViewController {
  private view: WebContentsView | undefined;
  private bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
  private visible = false;
  private lastActiveTab: BrowserTabSnapshot | undefined;
  private localPreviewStopTimer: NodeJS.Timeout | undefined;

  constructor(private readonly options: InternalBrowserViewControllerOptions) {}

  isAvailable(): boolean {
    return typeof WebContentsView === "function";
  }

  isRunning(): boolean {
    return Boolean(this.view && !this.view.webContents.isDestroyed());
  }

  isVisible(): boolean {
    return this.visible;
  }

  getLastActiveTab(): BrowserTabSnapshot | undefined {
    return this.lastActiveTab;
  }

  async start(): Promise<void> {
    const view = this.ensureView();
    if (!view.webContents.getURL()) {
      await view.webContents.loadURL("about:blank");
    }
    this.updateActiveTab();
  }

  async stop(): Promise<void> {
    const view = this.view;
    this.clearLocalPreviewStopTimer();
    this.view = undefined;
    this.visible = false;
    this.lastActiveTab = undefined;
    if (!view) return;
    const window = this.options.getWindow();
    if (window && !window.isDestroyed()) {
      try {
        window.contentView.removeChildView(view);
      } catch {
        // The view may already have been detached during window teardown.
      }
    }
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }

  setViewBounds(input: BrowserViewBoundsInput): void {
    this.bounds = {
      x: Math.max(0, Math.round(input.x)),
      y: Math.max(0, Math.round(input.y)),
      width: Math.max(0, Math.round(input.width)),
      height: Math.max(0, Math.round(input.height)),
    };
    this.visible = input.visible && this.bounds.width > 24 && this.bounds.height > 24;
    this.applyBounds();
  }

  requireView(): WebContentsView {
    if (!this.view || this.view.webContents.isDestroyed()) throw new Error("Internal browser view is not running.");
    return this.view;
  }

  setActiveTab(tab: BrowserTabSnapshot): BrowserTabSnapshot {
    this.lastActiveTab = tab;
    return tab;
  }

  updateActiveTab(): BrowserTabSnapshot | undefined {
    if (!this.view || this.view.webContents.isDestroyed()) return undefined;
    const tab = {
      id: String(this.view.webContents.id),
      title: this.view.webContents.getTitle(),
      url: this.view.webContents.getURL(),
    };
    this.lastActiveTab = tab;
    return tab;
  }

  async loadUrlForContent(url: string): Promise<void> {
    const view = this.requireView();
    const safeUrl = assertAllowedInternalBrowserUrl(url);
    const load = view.webContents.loadURL(safeUrl);
    let navigationAborted = false;
    try {
      await withTimeout(load, PAGE_READY_TIMEOUT_MS, `Timed out loading ${safeUrl}.`);
    } catch (error) {
      load.catch(() => undefined);
      const message = errorMessage(error);
      this.options.setLastError(message);
      navigationAborted = isNavigationAbortErrorMessage(message);
      if (!navigationAborted && view.webContents.isLoading()) view.webContents.stop();
      if (!navigationAborted && !message.startsWith("Timed out loading ")) throw error;
    }
    await this.waitForPageReady();
    if (navigationAborted) this.options.setLastError(undefined);
    this.refreshLocalPreviewStopTimer(safeUrl);
  }

  async waitForPageReady(): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < PAGE_READY_TIMEOUT_MS) {
      const readyState = await this.evaluateInPage<string>("document.readyState").catch(() => undefined);
      if (readyState === "complete" || readyState === "interactive") return;
      await delay(150);
    }
  }

  async evaluateInPage<T>(expression: string): Promise<T> {
    try {
      return (await withTimeout(
        this.requireView().webContents.executeJavaScript(expression, true),
        INTERNAL_BROWSER_EVALUATE_TIMEOUT_MS,
        "Internal browser JavaScript evaluation timed out.",
      )) as T;
    } catch (error) {
      this.options.setLastError(errorMessage(error));
      throw error;
    }
  }

  async capturePageImage() {
    let lastError: unknown;
    const view = this.requireView();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (attempt > 0) await delay(250);
        const image = await view.webContents.capturePage();
        if (!image.isEmpty()) return image;
        lastError = new Error("Internal browser screenshot was empty.");
      } catch (error) {
        lastError = error;
      }
    }

    const window = this.options.getWindow();
    if (window && !window.isDestroyed() && this.visible && this.bounds.width > 0 && this.bounds.height > 0) {
      try {
        const image = await window.webContents.capturePage(this.bounds);
        if (!image.isEmpty()) return image;
        lastError = new Error("Internal browser window-region screenshot was empty.");
      } catch (error) {
        lastError = error;
      }
    }

    this.options.setLastError(errorMessage(lastError));
    throw lastError instanceof Error ? lastError : new Error("Internal browser screenshot failed.");
  }

  private ensureView(): WebContentsView {
    if (!this.isAvailable()) throw new Error("The internal browser view is not available in this Electron runtime.");
    if (this.view && !this.view.webContents.isDestroyed()) return this.view;
    const window = this.options.getWindow();
    if (!window || window.isDestroyed()) throw new Error("Ambient Desktop window is not ready.");
    const view = new WebContentsView({
      webPreferences: {
        session: this.browserSession(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (!isAllowedInternalBrowserUrl(url)) {
        this.options.setLastError(`Blocked internal browser popup URL: ${url}`);
      } else {
        const safeUrl = assertAllowedInternalBrowserUrl(url);
        void view.webContents.loadURL(safeUrl).then(
          () => this.refreshLocalPreviewStopTimer(safeUrl),
          (error) => {
            this.options.setLastError(errorMessage(error));
          },
        );
      }
      return { action: "deny" };
    });
    view.webContents.on("will-navigate", (event, url) => {
      if (isAllowedInternalBrowserUrl(url)) return;
      event.preventDefault();
      this.options.setLastError(`Blocked internal browser navigation URL: ${url}`);
    });
    view.webContents.on("page-title-updated", () => this.updateActiveTab());
    view.webContents.on("did-navigate", (_event, url) => {
      this.updateActiveTab();
      this.refreshLocalPreviewStopTimer(url);
    });
    view.webContents.on("did-navigate-in-page", (_event, url) => {
      this.updateActiveTab();
      this.refreshLocalPreviewStopTimer(url);
    });
    view.webContents.on("did-fail-load", (_event, code, description, url) => {
      if (code === -3) return;
      this.options.setLastError(`${description} (${url})`);
    });
    window.contentView.addChildView(view);
    this.view = view;
    this.applyBounds();
    return view;
  }

  private browserSession() {
    const key = createHash("sha256").update(this.options.getWorkspace().statePath).digest("hex").slice(0, 16);
    return session.fromPartition(`persist:ambient-browser-${key}`);
  }

  private applyBounds(): void {
    if (!this.view || this.view.webContents.isDestroyed()) return;
    this.view.setBounds(this.renderBounds());
    const viewWithVisibility = this.view as WebContentsView & { setVisible?: (visible: boolean) => void };
    viewWithVisibility.setVisible?.(this.visible);
    const webContentsWithAudio = this.view.webContents as typeof this.view.webContents & { setAudioMuted?: (muted: boolean) => void };
    webContentsWithAudio.setAudioMuted?.(!this.visible);
  }

  private renderBounds(): Rectangle {
    return this.visible ? this.bounds : HIDDEN_TOOL_VIEWPORT;
  }

  private refreshLocalPreviewStopTimer(url?: string): void {
    this.clearLocalPreviewStopTimer();
    if (!url || !isLocalInternalBrowserPreviewUrl(url)) return;
    this.localPreviewStopTimer = setTimeout(() => {
      this.localPreviewStopTimer = undefined;
      void this.stop()
        .then(() => {
          this.options.setLastActivity("Stopped internal browser after the local preview time limit.");
        })
        .catch((error) => {
          this.options.setLastError(errorMessage(error));
        });
    }, INTERNAL_BROWSER_LOCAL_PREVIEW_MAX_LIFETIME_MS);
    this.localPreviewStopTimer.unref?.();
  }

  private clearLocalPreviewStopTimer(): void {
    if (!this.localPreviewStopTimer) return;
    clearTimeout(this.localPreviewStopTimer);
    this.localPreviewStopTimer = undefined;
  }
}

function isNavigationAbortErrorMessage(message: string): boolean {
  return /\b(?:net::)?ERR_ABORTED\b/i.test(message);
}

function isLocalInternalBrowserPreviewUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
