import type {
  BrowserContentInput,
  BrowserEvaluateInput,
  BrowserKeypressResult,
  BrowserNavigateInput,
  BrowserScreenshotResult,
  BrowserSearchInput,
  BrowserStartInput,
  BrowserTabSnapshot,
  BrowserUserActionState,
} from "../../shared/browserTypes";
import {
  assertBrowserNavigationReachedRequestedPage,
  assertLocalBrowserNavigationReachable,
  isAboutBlankUrl,
  isLocalBrowserHttpUrl,
  normalizeBrowserUrl,
} from "./browserNavigation";
import { assertBrowserScreenshotTargetLoaded } from "./browserChromeScreenshotController";
import type {
  BrowserContentResult,
  BrowserNavigateResult,
  BrowserSearchResults,
  NormalizedBrowserKeypressInput,
} from "./browserChromeRuntimeController";
import type { InternalBrowserBackend } from "./browserServiceTypes";
import {
  BrowserServiceUserActionController,
  browserUserActionDetectionExpression,
} from "./browserUserActionController";

type BrowserActivityInput = {
  onActivity?: (message: string) => void;
  sourceThreadId?: string;
  waitForUserAction?: boolean;
};

export interface BrowserServiceInternalRuntimeControllerOptions {
  getInternalBrowser: () => InternalBrowserBackend | undefined;
  getActiveChromeTabSnapshot: () => Promise<BrowserTabSnapshot | undefined>;
  ensureInternalStarted: () => Promise<void>;
  userActions: BrowserServiceUserActionController;
  setLastError: (message: string | undefined) => void;
}

export class BrowserServiceInternalRuntimeController {
  private lastInternalPreviewUrl: string | undefined;

  constructor(private readonly options: BrowserServiceInternalRuntimeControllerOptions) {}

  async navigate(input: BrowserNavigateInput & BrowserActivityInput): Promise<BrowserNavigateResult> {
    const url = normalizeBrowserUrl(input.url);
    await assertLocalBrowserNavigationReachable(url);
    await this.options.ensureInternalStarted();
    const browser = this.internalBrowser();
    input.onActivity?.("Internal browser runtime is ready.");
    const content = await browser.navigate({ ...input, url, profileMode: "isolated", runtime: "internal" });
    this.recordPreviewUrl(url);
    input.onActivity?.("Internal browser navigation completed; checking page state.");
    const userAction = await this.detectUserAction({
      toolName: "browser_nav",
      sourceThreadId: input.sourceThreadId,
    });
    if (userAction) {
      if (input.waitForUserAction === false) return userAction;
      await this.options.userActions.waitForInternalClear(userAction, input.onActivity);
      return assertBrowserNavigationReachedRequestedPage(
        url,
        await browser.content({ profileMode: "isolated", runtime: "internal" }),
      );
    }
    this.clearResolved("Browser user action no longer detected after navigation.");
    input.onActivity?.("Internal browser page content is readable.");
    return assertBrowserNavigationReachedRequestedPage(url, content);
  }

  async content(input: BrowserContentInput & BrowserActivityInput = {}): Promise<BrowserContentResult> {
    await this.options.ensureInternalStarted();
    const browser = this.internalBrowser();
    await this.recoverPreviewTargetIfBlank(input.onActivity);
    input.onActivity?.("Internal browser runtime is ready.");
    const content = await browser.content({ ...input, profileMode: "isolated", runtime: "internal" });
    input.onActivity?.("Internal browser content was read; checking page state.");
    const userAction = await this.detectUserAction({
      toolName: "browser_content",
      sourceThreadId: input.sourceThreadId,
    });
    if (userAction) {
      if (input.waitForUserAction === false) return userAction;
      await this.options.userActions.waitForInternalClear(userAction, input.onActivity);
      return browser.content({ profileMode: "isolated", runtime: "internal" });
    }
    this.clearResolved("Browser user action no longer detected while reading the page.");
    input.onActivity?.("Internal browser page content is ready.");
    return content;
  }

  async search(input: BrowserSearchInput & BrowserActivityInput): Promise<BrowserSearchResults> {
    await this.options.ensureInternalStarted();
    const browser = this.internalBrowser();
    input.onActivity?.("Internal browser runtime is ready.");
    const results = await browser.search({ ...input, profileMode: "isolated", runtime: "internal" });
    input.onActivity?.("Internal browser search results were read; checking page state.");
    const userAction = await this.detectUserAction({
      toolName: "browser_search",
      sourceThreadId: input.sourceThreadId,
    });
    if (userAction) {
      if (input.waitForUserAction === false) return userAction;
      await this.options.userActions.waitForInternalClear(userAction, input.onActivity);
      return browser.search({ ...input, profileMode: "isolated", runtime: "internal" });
    }
    this.clearResolved("Browser user action no longer detected after search.");
    input.onActivity?.("Internal browser search results are ready.");
    return results;
  }

  async evaluate(input: BrowserEvaluateInput & BrowserActivityInput): Promise<unknown> {
    await this.options.ensureInternalStarted();
    const browser = this.internalBrowser();
    await this.recoverPreviewTargetIfBlank(input.onActivity);
    input.onActivity?.("Internal browser runtime is ready.");
    const result = await browser.evaluate({ ...input, profileMode: "isolated", runtime: "internal" });
    input.onActivity?.("Internal browser JavaScript evaluation completed.");
    return result;
  }

  async keypress(input: NormalizedBrowserKeypressInput): Promise<BrowserKeypressResult> {
    await this.options.ensureInternalStarted();
    await this.recoverPreviewTargetIfBlank();
    return this.internalBrowser().keypress({ ...input, profileMode: "isolated", runtime: "internal" });
  }

  async screenshot(input: BrowserStartInput & BrowserActivityInput = {}): Promise<BrowserScreenshotResult> {
    await this.options.ensureInternalStarted();
    const browser = this.internalBrowser();
    await this.recoverPreviewTargetIfBlank(input.onActivity);
    input.onActivity?.("Internal browser runtime is ready.");
    assertBrowserScreenshotTargetLoaded((await browser.getState()).activeTab);
    const result = await browser.screenshot({ ...input, profileMode: "isolated", runtime: "internal" });
    input.onActivity?.("Internal browser screenshot was captured.");
    return {
      ...result,
      runtime: "internal",
      statePreserved: true,
      freshLoad: false,
    };
  }

  async refuseStateLosingPreviewScreenshotIfBlank(onActivity?: (message: string) => void): Promise<void> {
    if (!this.lastInternalPreviewUrl) return;
    const activeTab = await this.options.getActiveChromeTabSnapshot().catch(() => undefined);
    if (!isAboutBlankUrl(activeTab?.url ?? "")) return;
    const message = [
      "Browser screenshot refused because managed Chrome is on about:blank while the last known preview is an internal browser page.",
      "Opening that preview URL in Chrome would create a fresh page load and lose prior click/assert state.",
      "Call browser_local_preview again so the preview opens in managed Chrome, then repeat browser_click/browser_assert before browser_screenshot.",
    ].join(" ");
    onActivity?.(message);
    this.options.setLastError(message);
    throw new Error(message);
  }

  private recordPreviewUrl(url: string): void {
    if (isLocalBrowserHttpUrl(url)) this.lastInternalPreviewUrl = url;
  }

  private async recoverPreviewTargetIfBlank(onActivity?: (message: string) => void): Promise<void> {
    if (!this.lastInternalPreviewUrl) return;
    const browser = this.internalBrowser();
    if (!browser.isRunning()) return;
    const activeTab = (await browser.getState().catch(() => undefined))?.activeTab;
    if (!isAboutBlankUrl(activeTab?.url ?? "")) return;
    onActivity?.(`Internal browser was on about:blank; reopening the last managed preview ${this.lastInternalPreviewUrl}.`);
    await assertLocalBrowserNavigationReachable(this.lastInternalPreviewUrl).catch((error) => {
      throw new Error(
        [
          "Internal browser was on about:blank and the last managed preview could not be reopened.",
          "Call browser_local_preview again for the workspace file before retrying browser controls or screenshots.",
          errorMessage(error),
        ].join(" "),
      );
    });
    await browser.navigate({ url: this.lastInternalPreviewUrl, profileMode: "isolated", runtime: "internal" });
  }

  private async detectUserAction(input: {
    toolName: string;
    sourceThreadId?: string;
  }): Promise<BrowserUserActionState | undefined> {
    return this.options.userActions.normalizeDetection(
      await this.internalBrowser().evaluate({
        code: browserUserActionDetectionExpression(),
        profileMode: "isolated",
        runtime: "internal",
      }).catch(() => undefined),
      {
        toolName: input.toolName,
        runtime: "internal",
        profileMode: "isolated",
        sourceThreadId: input.sourceThreadId,
      },
    );
  }

  private clearResolved(message: string): void {
    this.options.userActions.clearResolved({
      runtime: "internal",
      profileMode: "isolated",
      message,
    });
  }

  private internalBrowser(): InternalBrowserBackend {
    const browser = this.options.getInternalBrowser();
    if (!browser) throw new Error("The internal browser view is not available in this Electron runtime.");
    return browser;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
