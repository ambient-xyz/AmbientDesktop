import type {
  BrowserCapabilityState,
  BrowserContentInput,
  BrowserEvaluateInput,
  BrowserKeypressInput,
  BrowserKeypressResult,
  BrowserLoginRequest,
  BrowserLoginResult,
  BrowserNavigateInput,
  BrowserPickInput,
  BrowserPickResult,
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserScreenshotResult,
  BrowserSearchInput,
  BrowserStartInput,
  BrowserUserActionState,
} from "../../shared/browserTypes";
import {
  assertLoginOrigin,
  cancelBrowserPickExpression,
  normalizeBrowserKeypressInput,
  normalizeBrowserLoginRequest,
  normalizeBrowserLoginResult,
  type BrowserActivityInput,
  type BrowserContentResult,
  type BrowserNavigateResult,
  type BrowserSearchResults,
} from "./browserChromeRuntimeController";
import type { BrowserServiceControllerBundle } from "./browserServiceControllers";
import type { BrowserServiceMutableState } from "./browserServiceMutableState";
import type { InternalBrowserBackend } from "./browserServiceTypes";

export type BrowserRequestInput = {
  profileMode?: BrowserProfileMode;
  runtime?: BrowserRuntimeKind;
};

export const DEFAULT_BROWSER_PROFILE_MODE: BrowserProfileMode = "isolated";

export interface BrowserServiceRequestControllerOptions {
  chromeRuntime: BrowserServiceControllerBundle["chromeRuntime"];
  chromeTargets: BrowserServiceControllerBundle["chromeTargets"];
  internalBrowser?: InternalBrowserBackend;
  internalRuntime: BrowserServiceControllerBundle["internalRuntime"];
  userActions: BrowserServiceControllerBundle["userActions"];
  state: Pick<BrowserServiceMutableState, "activePicker" | "activeRuntime" | "lastActivity" | "lastError">;
  ensureInternalStarted: () => Promise<void>;
  getState: () => Promise<BrowserCapabilityState>;
  isChromeRunning: () => boolean;
  runtimeForInput: (input: BrowserRequestInput) => BrowserRuntimeKind;
  screenshotChrome: (input?: BrowserStartInput & BrowserActivityInput) => Promise<BrowserScreenshotResult>;
}

export class BrowserServiceRequestController {
  constructor(private readonly options: BrowserServiceRequestControllerOptions) {}

  async navigate(input: BrowserNavigateInput & BrowserActivityInput): Promise<BrowserNavigateResult> {
    const blocked = this.options.userActions.activeBlock(input);
    if (blocked) {
      if (input.waitForUserAction === false) return blocked;
      await this.options.userActions.waitForClear(blocked, input.onActivity);
    }
    if (this.options.runtimeForInput(input) === "internal") {
      return this.options.internalRuntime.navigate(input);
    }
    return this.options.chromeRuntime.navigate(input);
  }

  async content(input: BrowserContentInput & BrowserActivityInput = {}): Promise<BrowserContentResult> {
    const blocked = this.options.userActions.activeBlock(input);
    if (blocked) {
      if (input.waitForUserAction === false) return blocked;
      await this.options.userActions.waitForClear(blocked, input.onActivity);
    }
    if (this.options.runtimeForInput(input) === "internal") {
      return this.options.internalRuntime.content(input);
    }
    return this.options.chromeRuntime.content(input);
  }

  async search(input: BrowserSearchInput & BrowserActivityInput): Promise<BrowserSearchResults> {
    const blocked = this.options.userActions.activeBlock(input);
    if (blocked) {
      if (input.waitForUserAction === false) return blocked;
      await this.options.userActions.waitForClear(blocked, input.onActivity);
    }
    if (this.options.runtimeForInput(input) === "internal") {
      return this.options.internalRuntime.search(input);
    }
    return this.options.chromeRuntime.search(input);
  }

  async evaluate(input: BrowserEvaluateInput & BrowserActivityInput): Promise<unknown> {
    const blocked = this.options.userActions.activeBlock();
    if (blocked) return blocked;
    if (this.options.runtimeForInput(input) === "internal") {
      return this.options.internalRuntime.evaluate(input);
    }
    return this.options.chromeRuntime.evaluate(input);
  }

  async keypress(input: BrowserKeypressInput): Promise<BrowserKeypressResult | BrowserUserActionState> {
    const blocked = this.options.userActions.activeBlock();
    if (blocked) return blocked;
    const normalized = normalizeBrowserKeypressInput(input);
    if (this.options.runtimeForInput(normalized) === "internal") {
      return this.options.internalRuntime.keypress(normalized);
    }
    return this.options.chromeRuntime.keypress(normalized);
  }

  async login(input: BrowserLoginRequest): Promise<BrowserLoginResult | BrowserUserActionState> {
    const blocked = this.options.userActions.activeBlock();
    if (blocked) return blocked;
    const normalized = normalizeBrowserLoginRequest(input);
    if (this.options.runtimeForInput(normalized) === "internal") {
      await this.options.ensureInternalStarted();
      const browser = this.options.internalBrowser!;
      const tab = (await browser.getState()).activeTab;
      assertLoginOrigin(normalized.expectedOrigin, normalized.credential.origin, tab?.url);
      const result = await browser.login({ ...normalized, profileMode: "isolated", runtime: "internal" });
      this.options.state.lastActivity = `Filled stored credential "${normalized.credential.label}" for ${normalized.expectedOrigin}.`;
      return normalizeBrowserLoginResult(result, normalized);
    }
    return this.options.chromeRuntime.login(normalized);
  }

  async screenshot(input: BrowserStartInput & BrowserActivityInput = {}): Promise<BrowserScreenshotResult | BrowserUserActionState> {
    const blocked = this.options.userActions.activeBlock();
    if (blocked) return blocked;
    if (input.runtime === "internal") {
      return this.options.internalRuntime.screenshot(input);
    }
    return this.options.screenshotChrome(input);
  }

  async pick(input: BrowserPickInput): Promise<BrowserPickResult | BrowserUserActionState> {
    const blocked = this.options.userActions.activeBlock();
    if (blocked) return blocked;
    const profileMode = input.profileMode ?? DEFAULT_BROWSER_PROFILE_MODE;
    this.options.state.activePicker = { prompt: input.prompt, profileMode, startedAt: new Date().toISOString() };
    this.options.state.lastActivity = `Waiting for browser picker selection: ${input.prompt}`;
    this.options.state.lastError = undefined;
    try {
      if (this.options.runtimeForInput(input) === "internal") {
        await this.options.ensureInternalStarted();
        return await this.options.internalBrowser!.pick({ ...input, profileMode: "isolated", runtime: "internal" });
      }
      return await this.options.chromeRuntime.pick(input);
    } finally {
      this.options.state.activePicker = undefined;
    }
  }

  async cancelPick(): Promise<BrowserCapabilityState> {
    if (!this.options.state.activePicker) {
      this.options.state.lastActivity = "No active browser picker to cancel.";
      return this.options.getState();
    }
    const runtime = this.options.state.activeRuntime;
    this.options.state.activePicker = undefined;
    if (runtime === "internal" && this.options.internalBrowser?.isRunning()) {
      await this.options.internalBrowser.cancelPick();
    } else if (this.options.isChromeRunning()) {
      await this.options.chromeTargets.evaluatePage<boolean>(cancelBrowserPickExpression(), 2_500).catch((error) => {
        this.options.state.lastError = requestErrorMessage(error);
      });
    }
    this.options.state.lastActivity = "Browser picker cancellation requested.";
    return this.options.getState();
  }
}

function requestErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
