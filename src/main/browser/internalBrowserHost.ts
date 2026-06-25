import { BrowserWindow } from "electron";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  BrowserContentInput,
  BrowserEvaluateInput,
  BrowserKeypressInput,
  BrowserKeypressResult,
  BrowserLoginRequest,
  BrowserLoginResult,
  BrowserNavigateInput,
  BrowserPageContent,
  BrowserPickInput,
  BrowserPickResult,
  BrowserPickSelection,
  BrowserScreenshotResult,
  BrowserSearchInput,
  BrowserSearchResult,
  BrowserStartInput,
  BrowserViewBoundsInput,
} from "../../shared/browserTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  BooleanPickSelection,
  MAX_BROWSER_TEXT,
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
import { InternalBrowserViewController, withTimeout } from "./internalBrowserViewController";

export { INTERNAL_BROWSER_LOCAL_PREVIEW_MAX_LIFETIME_MS } from "./internalBrowserViewController";

export class InternalBrowserHost implements InternalBrowserBackend {
  private readonly viewController: InternalBrowserViewController;
  private lastActivity: string | undefined;
  private lastError: string | undefined;

  constructor(
    private readonly getWorkspace: () => WorkspaceState,
    private readonly getWindow: () => BrowserWindow | undefined,
  ) {
    this.viewController = new InternalBrowserViewController({
      getWorkspace: this.getWorkspace,
      getWindow: this.getWindow,
      setLastActivity: (message) => {
        this.lastActivity = message;
      },
      setLastError: (message) => {
        this.lastError = message;
      },
    });
  }

  isAvailable(): boolean {
    return this.viewController.isAvailable();
  }

  isRunning(): boolean {
    return this.viewController.isRunning();
  }

  async getState() {
    if (this.isRunning()) this.viewController.updateActiveTab();
    const lastActiveTab = this.viewController.getLastActiveTab();
    return {
      running: this.isRunning(),
      ...(lastActiveTab ? { activeTab: lastActiveTab } : {}),
      ...(this.lastActivity ? { lastActivity: this.lastActivity } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {}),
      viewVisible: this.viewController.isVisible(),
    };
  }

  async start(): Promise<void> {
    await this.viewController.start();
    this.lastActivity = "Started internal browser view.";
    this.lastError = undefined;
    this.viewController.updateActiveTab();
  }

  async stop(): Promise<void> {
    await this.viewController.stop();
    this.lastActivity = "Internal browser view stopped.";
  }

  async shutdown(): Promise<void> {
    await this.stop().catch(() => undefined);
  }

  setViewBounds(input: BrowserViewBoundsInput): void {
    this.viewController.setViewBounds(input);
  }

  async navigate(input: BrowserNavigateInput): Promise<BrowserPageContent> {
    await this.start();
    const url = normalizeBrowserUrl(input.url);
    await this.viewController.loadUrlForContent(url);
    this.lastActivity = `Navigated internal browser to ${url}.`;
    return this.content({});
  }

  async content(input: BrowserContentInput = {}): Promise<BrowserPageContent> {
    await this.start();
    if (input.url) {
      await this.viewController.loadUrlForContent(normalizeBrowserUrl(input.url));
    }
    const content = await this.viewController.evaluateInPage<BrowserPageContent>(contentExpression(MAX_BROWSER_TEXT));
    const normalized = normalizePageContent(content);
    this.viewController.setActiveTab({
      id: String(this.viewController.requireView().webContents.id),
      title: normalized.title,
      url: normalized.url,
    });
    this.lastActivity = input.url ? `Read page content from ${normalized.url ?? input.url}.` : "Read active internal browser page.";
    return normalized;
  }

  async search(input: BrowserSearchInput): Promise<BrowserSearchResult[]> {
    await this.start();
    const limit = clampInteger(input.maxResults ?? 5, 1, 10);
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(input.query)}`;
    await this.viewController.loadUrlForContent(searchUrl);
    const results = await this.viewController.evaluateInPage<BrowserSearchResult[]>(searchExpression(limit));
    const normalized = normalizeSearchResults(results).slice(0, limit);
    if (input.fetchContent) {
      for (const result of normalized.slice(0, Math.min(3, limit))) {
        try {
          await this.viewController.loadUrlForContent(result.url);
          result.content = (await this.content({})).text.slice(0, 4_000);
        } catch {
          // Keep the search result even if one target page fails.
        }
      }
    }
    this.lastActivity = `Searched Google for "${input.query}" in the internal browser.`;
    this.viewController.updateActiveTab();
    return normalized;
  }

  async evaluate(input: BrowserEvaluateInput): Promise<unknown> {
    await this.start();
    const result = await this.viewController.evaluateInPage<unknown>(userCodeExpression(input.code));
    this.lastActivity = "Evaluated JavaScript in the internal browser.";
    return result;
  }

  async keypress(input: BrowserKeypressInput): Promise<BrowserKeypressResult> {
    await this.start();
    await this.viewController.waitForPageReady();
    const normalized = normalizeBrowserKeypressInput(input);
    const focus = await this.viewController.evaluateInPage<BrowserKeypressResult["focus"]>(
      browserKeypressFocusExpression(normalized.focus),
    );
    const view = this.viewController.requireView();
    view.webContents.focus();
    for (const key of normalized.keys) {
      view.webContents.sendInputEvent({ type: "keyDown", keyCode: key.electronKeyCode });
      if (key.text !== undefined) view.webContents.sendInputEvent({ type: "char", keyCode: key.text });
      if (key.durationMs > 0) await delay(key.durationMs);
      view.webContents.sendInputEvent({ type: "keyUp", keyCode: key.electronKeyCode });
    }
    const tab = this.viewController.updateActiveTab();
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
    const result = await this.viewController.evaluateInPage<BrowserLoginResult>(browserLoginExpression(input));
    this.lastActivity = `Filled stored credential "${input.credential.label}" in the internal browser.`;
    this.viewController.updateActiveTab();
    return result;
  }

  async screenshot(input: BrowserStartInput = {}): Promise<BrowserScreenshotResult> {
    await this.start();
    await this.viewController.waitForPageReady();
    const image = await this.viewController.capturePageImage();
    const bytes = image.toPNG();
    const dimensions = image.getSize();
    const tab = this.viewController.updateActiveTab();
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
      this.viewController.evaluateInPage<BrowserPickSelection[] | null>(buildBrowserPickExpression(input.prompt)),
      PICK_TIMEOUT_MS,
      "Internal browser picker timed out.",
    );
    const tab = this.viewController.updateActiveTab();
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
    const view = this.viewController.requireView();
    view.webContents.focus();
    view.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    view.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    this.lastActivity = "Internal browser picker cancellation requested.";
  }
}
