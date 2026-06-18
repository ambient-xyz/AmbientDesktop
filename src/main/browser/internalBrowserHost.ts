import { BrowserWindow, WebContentsView, session, type Rectangle } from "electron";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { BrowserContentInput, BrowserEvaluateInput, BrowserKeypressInput, BrowserKeypressResult, BrowserLoginRequest, BrowserLoginResult, BrowserNavigateInput, BrowserPageContent, BrowserPickInput, BrowserPickResult, BrowserPickSelection, BrowserScreenshotResult, BrowserSearchInput, BrowserSearchResult, BrowserStartInput, BrowserTabSnapshot, BrowserViewBoundsInput } from "../../shared/browserTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  BooleanPickSelection,
  MAX_BROWSER_TEXT,
  PAGE_READY_TIMEOUT_MS,
  PICK_TIMEOUT_MS,
  buildBrowserPickExpression,
  browserLoginExpression,
  browserScreenshotArtifactPath,
  browserScreenshotStorageTarget,
  BROWSER_SCREENSHOT_MIME_TYPE,
  browserKeypressFocusExpression,
  clampInteger,
  contentExpression,
  delay,
  errorMessage,
  normalizeBrowserUrl,
  normalizePageContent,
  normalizePickSelection,
  normalizeBrowserKeypressInput,
  normalizeSearchResults,
  searchExpression,
  keypressKeyResult,
  userCodeExpression,
  type InternalBrowserBackend,
} from "./browserService";
import { assertAllowedInternalBrowserUrl, isAllowedInternalBrowserUrl } from "../security/externalUrlPolicy";

const HIDDEN_TOOL_VIEWPORT: Rectangle = { x: -10_000, y: -10_000, width: 1280, height: 720 };
const INTERNAL_BROWSER_EVALUATE_TIMEOUT_MS = 15_000;
export const INTERNAL_BROWSER_LOCAL_PREVIEW_MAX_LIFETIME_MS = 5 * 60_000;

export class InternalBrowserHost implements InternalBrowserBackend {
  private view: WebContentsView | undefined;
  private bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
  private visible = false;
  private lastActiveTab: BrowserTabSnapshot | undefined;
  private lastActivity: string | undefined;
  private lastError: string | undefined;
  private localPreviewStopTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly getWorkspace: () => WorkspaceState,
    private readonly getWindow: () => BrowserWindow | undefined,
  ) {}

  isAvailable(): boolean {
    return typeof WebContentsView === "function";
  }

  isRunning(): boolean {
    return Boolean(this.view && !this.view.webContents.isDestroyed());
  }

  async getState() {
    if (this.isRunning()) this.updateActiveTab();
    return {
      running: this.isRunning(),
      ...(this.lastActiveTab ? { activeTab: this.lastActiveTab } : {}),
      ...(this.lastActivity ? { lastActivity: this.lastActivity } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {}),
      viewVisible: this.visible,
    };
  }

  async start(): Promise<void> {
    const view = this.ensureView();
    if (!view.webContents.getURL()) {
      await view.webContents.loadURL("about:blank");
    }
    this.lastActivity = "Started internal browser view.";
    this.lastError = undefined;
    this.updateActiveTab();
  }

  async stop(): Promise<void> {
    const view = this.view;
    this.clearLocalPreviewStopTimer();
    this.view = undefined;
    this.visible = false;
    this.lastActiveTab = undefined;
    this.lastActivity = "Internal browser view stopped.";
    if (!view) return;
    const window = this.getWindow();
    if (window && !window.isDestroyed()) {
      try {
        window.contentView.removeChildView(view);
      } catch {
        // The view may already have been detached during window teardown.
      }
    }
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }

  async shutdown(): Promise<void> {
    await this.stop().catch(() => undefined);
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

  async navigate(input: BrowserNavigateInput): Promise<BrowserPageContent> {
    await this.start();
    const url = normalizeBrowserUrl(input.url);
    await this.loadUrlForContent(url);
    this.lastActivity = `Navigated internal browser to ${url}.`;
    return this.content({});
  }

  async content(input: BrowserContentInput = {}): Promise<BrowserPageContent> {
    await this.start();
    if (input.url) {
      await this.loadUrlForContent(normalizeBrowserUrl(input.url));
    }
    const content = await this.evaluateInPage<BrowserPageContent>(contentExpression(MAX_BROWSER_TEXT));
    const normalized = normalizePageContent(content);
    this.lastActiveTab = { id: String(this.requireView().webContents.id), title: normalized.title, url: normalized.url };
    this.lastActivity = input.url ? `Read page content from ${normalized.url ?? input.url}.` : "Read active internal browser page.";
    return normalized;
  }

  async search(input: BrowserSearchInput): Promise<BrowserSearchResult[]> {
    await this.start();
    const limit = clampInteger(input.maxResults ?? 5, 1, 10);
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(input.query)}`;
    await this.loadUrlForContent(searchUrl);
    const results = await this.evaluateInPage<BrowserSearchResult[]>(searchExpression(limit));
    const normalized = normalizeSearchResults(results).slice(0, limit);
    if (input.fetchContent) {
      for (const result of normalized.slice(0, Math.min(3, limit))) {
        try {
          await this.loadUrlForContent(result.url);
          result.content = (await this.content({})).text.slice(0, 4_000);
        } catch {
          // Keep the search result even if one target page fails.
        }
      }
    }
    this.lastActivity = `Searched Google for "${input.query}" in the internal browser.`;
    this.updateActiveTab();
    return normalized;
  }

  async evaluate(input: BrowserEvaluateInput): Promise<unknown> {
    await this.start();
    const result = await this.evaluateInPage<unknown>(userCodeExpression(input.code));
    this.lastActivity = "Evaluated JavaScript in the internal browser.";
    return result;
  }

  async keypress(input: BrowserKeypressInput): Promise<BrowserKeypressResult> {
    await this.start();
    await this.waitForPageReady();
    const normalized = normalizeBrowserKeypressInput(input);
    const focus = await this.evaluateInPage<BrowserKeypressResult["focus"]>(browserKeypressFocusExpression(normalized.focus));
    const view = this.requireView();
    view.webContents.focus();
    for (const key of normalized.keys) {
      view.webContents.sendInputEvent({ type: "keyDown", keyCode: key.electronKeyCode });
      if (key.text !== undefined) view.webContents.sendInputEvent({ type: "char", keyCode: key.text });
      if (key.durationMs > 0) await delay(key.durationMs);
      view.webContents.sendInputEvent({ type: "keyUp", keyCode: key.electronKeyCode });
    }
    const tab = this.updateActiveTab();
    this.lastActivity = `Dispatched ${normalized.keys.length} internal browser keypress event(s).`;
    return {
      dispatchedCount: normalized.keys.length,
      keys: normalized.keys.map(keypressKeyResult),
      focus,
      title: tab?.title,
      url: tab?.url,
    };
  }

  async login(input: BrowserLoginRequest): Promise<BrowserLoginResult> {
    await this.start();
    const result = await this.evaluateInPage<BrowserLoginResult>(browserLoginExpression(input));
    this.lastActivity = `Filled stored credential "${input.credential.label}" in the internal browser.`;
    this.updateActiveTab();
    return result;
  }

  async screenshot(input: BrowserStartInput = {}): Promise<BrowserScreenshotResult> {
    await this.start();
    await this.waitForPageReady();
    const image = await this.capturePageImage();
    const bytes = image.toPNG();
    const dimensions = image.getSize();
    const tab = this.updateActiveTab();
    const fileName = `browser-internal-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    const target = browserScreenshotStorageTarget(this.getWorkspace(), input);
    mkdirSync(target.screenshots, { recursive: true });
    const filePath = join(target.screenshots, fileName);
    await writeFile(filePath, bytes);
    this.lastActivity = `Captured internal browser screenshot ${fileName}.`;
    return {
      path: filePath,
      artifactPath: browserScreenshotArtifactPath(target, filePath),
      mimeType: BROWSER_SCREENSHOT_MIME_TYPE,
      bytes: bytes.length,
      width: dimensions.width,
      height: dimensions.height,
      title: tab?.title,
      url: tab?.url,
      runtime: "internal",
      targetId: tab?.id,
      statePreserved: true,
      freshLoad: false,
    };
  }

  async pick(input: BrowserPickInput): Promise<BrowserPickResult> {
    await this.start();
    const raw = await withTimeout(
      this.evaluateInPage<BrowserPickSelection[] | null>(buildBrowserPickExpression(input.prompt)),
      PICK_TIMEOUT_MS,
      "Internal browser picker timed out.",
    );
    const tab = this.updateActiveTab();
    const selections = Array.isArray(raw) ? raw.map(normalizePickSelection).filter(BooleanPickSelection) : [];
    this.lastActivity = raw ? `Picked ${selections.length} internal browser element(s).` : "Internal browser picker canceled.";
    return {
      canceled: !raw,
      prompt: input.prompt,
      title: tab?.title,
      url: tab?.url,
      selections,
    };
  }

  async cancelPick(): Promise<void> {
    if (!this.isRunning()) return;
    const view = this.requireView();
    view.webContents.focus();
    view.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    view.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    this.lastActivity = "Internal browser picker cancellation requested.";
  }

  private ensureView(): WebContentsView {
    if (!this.isAvailable()) throw new Error("The internal browser view is not available in this Electron runtime.");
    if (this.view && !this.view.webContents.isDestroyed()) return this.view;
    const window = this.getWindow();
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
        this.lastError = `Blocked internal browser popup URL: ${url}`;
      } else {
        const safeUrl = assertAllowedInternalBrowserUrl(url);
        void view.webContents.loadURL(safeUrl).then(
          () => this.refreshLocalPreviewStopTimer(safeUrl),
          (error) => {
            this.lastError = errorMessage(error);
          },
        );
      }
      return { action: "deny" };
    });
    view.webContents.on("will-navigate", (event, url) => {
      if (isAllowedInternalBrowserUrl(url)) return;
      event.preventDefault();
      this.lastError = `Blocked internal browser navigation URL: ${url}`;
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
      this.lastError = `${description} (${url})`;
    });
    window.contentView.addChildView(view);
    this.view = view;
    this.applyBounds();
    return view;
  }

  private requireView(): WebContentsView {
    if (!this.view || this.view.webContents.isDestroyed()) throw new Error("Internal browser view is not running.");
    return this.view;
  }

  private browserSession() {
    const key = createHash("sha256").update(this.getWorkspace().statePath).digest("hex").slice(0, 16);
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

  private async loadUrlForContent(url: string): Promise<void> {
    const view = this.requireView();
    const safeUrl = assertAllowedInternalBrowserUrl(url);
    const load = view.webContents.loadURL(safeUrl);
    let navigationAborted = false;
    try {
      await withTimeout(load, PAGE_READY_TIMEOUT_MS, `Timed out loading ${safeUrl}.`);
    } catch (error) {
      load.catch(() => undefined);
      const message = errorMessage(error);
      this.lastError = message;
      navigationAborted = isNavigationAbortErrorMessage(message);
      if (!navigationAborted && view.webContents.isLoading()) view.webContents.stop();
      if (!navigationAborted && !message.startsWith("Timed out loading ")) throw error;
    }
    await this.waitForPageReady();
    if (navigationAborted) this.lastError = undefined;
    this.refreshLocalPreviewStopTimer(safeUrl);
  }

  private refreshLocalPreviewStopTimer(url?: string): void {
    this.clearLocalPreviewStopTimer();
    if (!url || !isLocalInternalBrowserPreviewUrl(url)) return;
    this.localPreviewStopTimer = setTimeout(() => {
      this.localPreviewStopTimer = undefined;
      void this.stop()
        .then(() => {
          this.lastActivity = "Stopped internal browser after the local preview time limit.";
        })
        .catch((error) => {
          this.lastError = errorMessage(error);
        });
    }, INTERNAL_BROWSER_LOCAL_PREVIEW_MAX_LIFETIME_MS);
    this.localPreviewStopTimer.unref?.();
  }

  private clearLocalPreviewStopTimer(): void {
    if (!this.localPreviewStopTimer) return;
    clearTimeout(this.localPreviewStopTimer);
    this.localPreviewStopTimer = undefined;
  }

  private updateActiveTab(): BrowserTabSnapshot | undefined {
    if (!this.view || this.view.webContents.isDestroyed()) return undefined;
    const tab = {
      id: String(this.view.webContents.id),
      title: this.view.webContents.getTitle(),
      url: this.view.webContents.getURL(),
    };
    this.lastActiveTab = tab;
    return tab;
  }

  private async waitForPageReady(): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < PAGE_READY_TIMEOUT_MS) {
      const readyState = await this.evaluateInPage<string>("document.readyState").catch(() => undefined);
      if (readyState === "complete" || readyState === "interactive") return;
      await delay(150);
    }
  }

  private async evaluateInPage<T>(expression: string): Promise<T> {
    try {
      return (await withTimeout(
        this.requireView().webContents.executeJavaScript(expression, true),
        INTERNAL_BROWSER_EVALUATE_TIMEOUT_MS,
        "Internal browser JavaScript evaluation timed out.",
      )) as T;
    } catch (error) {
      this.lastError = errorMessage(error);
      throw error;
    }
  }

  private async capturePageImage() {
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

    const window = this.getWindow();
    if (window && !window.isDestroyed() && this.visible && this.bounds.width > 0 && this.bounds.height > 0) {
      try {
        const image = await window.webContents.capturePage(this.bounds);
        if (!image.isEmpty()) return image;
        lastError = new Error("Internal browser window-region screenshot was empty.");
      } catch (error) {
        lastError = error;
      }
    }

    this.lastError = errorMessage(lastError);
    throw lastError instanceof Error ? lastError : new Error("Internal browser screenshot failed.");
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

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
