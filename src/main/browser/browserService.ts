import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";
import type { BrowserCapabilityState, BrowserContentInput, BrowserEvaluateInput, BrowserKeypressFocusResult, BrowserKeypressInput, BrowserKeypressKeyInput, BrowserKeypressKeyResult, BrowserKeypressResult, BrowserLoginRequest, BrowserLoginResult, BrowserNavigateInput, BrowserPageContent, BrowserPickInput, BrowserPickResult, BrowserPickSelection, BrowserProfileMode, BrowserRevealInput, BrowserRevealResult, BrowserRuntimeKind, BrowserScreenshotResult, BrowserSearchInput, BrowserSearchResult, BrowserSessionLifecycleAction, BrowserSessionLifecycleEvent, BrowserStartInput, BrowserTabSnapshot, BrowserUserActionKind, BrowserUserActionProvider, BrowserUserActionState, BrowserViewBoundsInput } from "../../shared/browserTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { shouldReloadBrowserUrlForWorkspaceChange } from "./browserRefresh";

export const BROWSER_SCREENSHOT_MIME_TYPE = "image/png";

interface ChromeVersionInfo {
  webSocketDebuggerUrl?: string;
}

export interface ChromeDevToolsEndpoint {
  port: number;
  webSocketDebuggerUrl: string;
}

export interface ChromeAvailability {
  available: boolean;
  executable?: string;
  unavailableReason?: string;
}

interface ChromeTargetInfo {
  id: string;
  type: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

interface BrowserPaths {
  root: string;
  copiedProfile: string;
  copiedProfileMetadata: string;
  profilesRoot: string;
  isolatedProfile: string;
  sessionsRoot: string;
  sessionManifests: string;
  screenshots: string;
}

export interface BrowserScreenshotStorageTarget {
  screenshots: string;
  artifactWorkspacePath: string;
}

interface CopiedChromeProfileMetadata {
  sourceProfilePath: string;
  copiedProfilePath: string;
  copiedAt: string;
}

interface InternalBrowserStateSnapshot {
  running: boolean;
  activeTab?: BrowserTabSnapshot;
  lastActivity?: string;
  lastError?: string;
  viewVisible?: boolean;
}

interface ChromeSessionManifest {
  id: string;
  workspacePath: string;
  profileMode: BrowserProfileMode;
  profilePath: string;
  profileEphemeral: boolean;
  processId?: number;
  devToolsPort: number;
  browserWsUrl: string;
  activeTargetId?: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface InternalBrowserBackend {
  isAvailable(): boolean;
  isRunning(): boolean;
  getState(): Promise<InternalBrowserStateSnapshot>;
  start(): Promise<void>;
  stop(): Promise<void>;
  shutdown(): Promise<void>;
  setViewBounds(input: BrowserViewBoundsInput): void;
  navigate(input: BrowserNavigateInput): Promise<BrowserPageContent>;
  content(input?: BrowserContentInput): Promise<BrowserPageContent>;
  search(input: BrowserSearchInput): Promise<BrowserSearchResult[]>;
  evaluate(input: BrowserEvaluateInput): Promise<unknown>;
  keypress(input: BrowserKeypressInput): Promise<BrowserKeypressResult>;
  login(input: BrowserLoginRequest): Promise<BrowserLoginResult>;
  screenshot(input?: BrowserStartInput): Promise<BrowserScreenshotResult>;
  pick(input: BrowserPickInput): Promise<BrowserPickResult>;
  cancelPick(): Promise<void>;
}

export type BrowserNavigateResult = BrowserPageContent | BrowserUserActionState;
export type BrowserContentResult = BrowserPageContent | BrowserUserActionState;
export type BrowserSearchResults = BrowserSearchResult[] | BrowserUserActionState;

type BrowserRequestInput = {
  profileMode?: BrowserProfileMode;
  runtime?: BrowserRuntimeKind;
};
type BrowserActivityInput = {
  onActivity?: (message: string) => void;
};

export interface NormalizedBrowserKeypressKey extends BrowserKeypressKeyResult {
  windowsVirtualKeyCode: number;
  electronKeyCode: string;
}

export interface NormalizedBrowserKeypressInput extends Omit<BrowserKeypressInput, "keys"> {
  keys: NormalizedBrowserKeypressKey[];
  focus: string;
}

export interface BrowserServiceOptions {
  browserLoginBrokerAvailable?: boolean;
  onStateChanged?: () => void | Promise<void>;
  revealManagedChromeWindow?: (input: ManagedChromeRevealInput) => Promise<ManagedChromeRevealResult>;
  managedChromeRevealBounds?: () => ManagedChromeWindowBounds | undefined;
}

const DEFAULT_PROFILE_MODE: BrowserProfileMode = "isolated";
const START_TIMEOUT_MS = 15_000;
export const PAGE_READY_TIMEOUT_MS = 10_000;
export const LOCAL_BROWSER_NAVIGATION_PREFLIGHT_TIMEOUT_MS = 2_500;
export const PICK_TIMEOUT_MS = 300_000;
export const MAX_BROWSER_TEXT = 12_000;
const MAX_PICK_HTML = 500;
const MAX_PICK_TEXT = 220;
const USER_ACTION_TIMEOUT_MS = 15 * 60_000;
const USER_ACTION_ACTIVITY_HEARTBEAT_MS = 30_000;
const MANAGED_CHROME_WIDTH = 1280;
const MANAGED_CHROME_HIDDEN_HEIGHT = 720;
const MANAGED_CHROME_REVEALED_HEIGHT = 900;
const MANAGED_CHROME_REVEAL_MARGIN = 40;
const MANAGED_CHROME_MIN_WIDTH = 720;
const MANAGED_CHROME_MIN_HEIGHT = 520;

export interface ManagedChromeWindowBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ManagedChromeWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BrowserUserActionDetection {
  detected?: boolean;
  kind?: BrowserUserActionKind;
  provider?: BrowserUserActionProvider;
  url?: string;
  title?: string;
  origin?: string;
  pageExcerpt?: string;
  message?: string;
}

type BrowserUserActionResolution = "resume" | "cancel" | "timeout";

export interface ManagedChromeRevealInput {
  platform: NodeJS.Platform;
  profileMode: BrowserProfileMode;
  targetId?: string;
  processId?: number;
  executable?: string;
  profilePath?: string;
}

export interface ManagedChromeRevealResult {
  cdpActivated: boolean;
  foregroundAttempted: boolean;
  foregroundSucceeded: boolean;
  activeTab?: BrowserTabSnapshot;
  method?: string;
  reason?: string;
  unsupported?: boolean;
}

export class BrowserService {
  private child: ChildProcess | undefined;
  private port: number | undefined;
  private browserWsUrl: string | undefined;
  private activeTargetId: string | undefined;
  private chromeSessionId: string | undefined;
  private chromeProcessId: number | undefined;
  private attachedChrome = false;
  private profileMode: BrowserProfileMode = DEFAULT_PROFILE_MODE;
  private runtimeProfilePath: string | undefined;
  private runtimeProfileEphemeral = false;
  private lastActiveTab: BrowserTabSnapshot | undefined;
  private lastChromeBrowserActionTarget: BrowserTabSnapshot | undefined;
  private lastInternalPreviewUrl: string | undefined;
  private lastActivity: string | undefined;
  private lastError: string | undefined;
  private lastSessionEvent: BrowserSessionLifecycleEvent | undefined;
  private activeRuntime: BrowserRuntimeKind;
  private readonly instanceId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  private activePicker: { prompt: string; profileMode: BrowserProfileMode; startedAt: string } | undefined;
  private userAction: BrowserUserActionState | undefined;
  private userActionWaiter:
    | {
        resolve: (value: BrowserUserActionResolution) => void;
        timeout: NodeJS.Timeout;
        activityTimer?: NodeJS.Timeout;
      }
    | undefined;

  constructor(
    private readonly getWorkspace: () => WorkspaceState,
    private readonly internalBrowser?: InternalBrowserBackend,
    private readonly options: BrowserServiceOptions = {},
  ) {
    this.activeRuntime = internalBrowser?.isAvailable() ? "internal" : "chrome";
  }

  async getState(): Promise<BrowserCapabilityState> {
    await this.refreshChromeRunningState();
    if (this.activeRuntime === "internal" && this.internalBrowser?.isAvailable()) {
      return this.internalStateSnapshot();
    }
    if (this.internalBrowser?.isRunning()) {
      this.activeRuntime = "internal";
      return this.internalStateSnapshot();
    }
    if (this.isChromeRunning()) {
      try {
        this.lastActiveTab = await this.getActiveTabSnapshot();
      } catch (error) {
        this.lastError = errorMessage(error);
      }
    }
    return this.chromeStateSnapshot();
  }

  async start(input: BrowserProfileMode | BrowserStartInput | undefined = DEFAULT_PROFILE_MODE): Promise<BrowserCapabilityState> {
    const normalized = normalizeStartInput(input);
    const profileMode = normalized.profileMode ?? DEFAULT_PROFILE_MODE;
    const runtime = this.runtimeForRequest(profileMode, normalized.runtime);
    if (runtime === "internal") {
      await this.ensureInternalStarted();
      return this.getState();
    }
    return this.startChrome(profileMode);
  }

  async stop(): Promise<BrowserCapabilityState> {
    if (this.internalBrowser?.isRunning()) await this.internalBrowser.stop();
    await this.stopChrome("Explicit browser stop requested.");
    this.clearUserAction("Browser stopped.");
    this.lastActivity = "Browser stopped.";
    this.activeRuntime = this.hasInternalBrowser() ? "internal" : "chrome";
    return this.getState();
  }

  async revealActiveBrowser(input: BrowserRevealInput = {}): Promise<BrowserRevealResult> {
    await this.refreshChromeRunningState();
    if (this.activeRuntime === "internal" || this.internalBrowser?.isRunning()) {
      const state = await this.internalStateSnapshot();
      this.lastActivity = state.running ? "Showing internal browser panel." : "No internal browser session is running.";
      return {
        runtime: "internal",
        target: "internal",
        status: state.running ? "needs-internal-panel" : "not-running",
        message: state.running ? "The browser is in Ambient's inline Browser panel." : "No inline browser session is running.",
        ...(state.activeTab ? { activeTab: state.activeTab } : {}),
      };
    }

    const revealUserAction =
      this.userAction?.runtime === "chrome" && (!input.userActionId || this.userAction.id === input.userActionId)
        ? this.userAction
        : undefined;
    const profileMode = revealUserAction?.profileMode ?? this.profileMode;
    const targetId = input.targetId ?? revealUserAction?.targetId;
    if (!this.isChromeRunning()) await this.reattachChrome(profileMode).catch(() => false);
    if (!this.isChromeRunning()) {
      this.lastActivity = "Managed Chrome is not running.";
      return {
        runtime: "chrome",
        target: "managed-chrome",
        status: "not-running",
        message: "Managed Chrome is not running, so there is no external browser window to show.",
      };
    }

    this.activeRuntime = "chrome";
    const availability = chromeAvailability();
    const reveal = await (this.options.revealManagedChromeWindow ?? ((input) => this.revealManagedChromeWindow(input)))({
      platform: process.platform,
      profileMode,
      targetId,
      processId: this.chromeProcessId ?? this.child?.pid,
      executable: availability.executable,
      profilePath: this.runtimeProfilePath,
    }).catch(
      (error): ManagedChromeRevealResult => ({
        cdpActivated: false,
        foregroundAttempted: true,
        foregroundSucceeded: false,
        reason: errorMessage(error),
      }),
    );

    if (reveal.activeTab) this.lastActiveTab = reveal.activeTab;
    const fullyRevealed = reveal.cdpActivated && reveal.foregroundSucceeded;
    const status = fullyRevealed ? "revealed" : reveal.unsupported ? "unsupported" : "failed";
    const fallbackReason = reveal.reason;
    this.lastActivity = fullyRevealed
      ? "Managed Chrome was brought forward."
      : `Tried to show managed Chrome. ${fallbackReason ?? "The operating system did not foreground it."}`.trim();
    this.lastError = fullyRevealed ? undefined : fallbackReason;
    this.notifyStateChanged();

    return {
      runtime: "chrome",
      target: "managed-chrome",
      status,
      message: fullyRevealed
        ? "Managed Chrome was brought forward with the active browser tab selected."
        : reveal.cdpActivated
          ? `Ambient activated the managed Chrome tab, but could not bring Chrome to the foreground. ${fallbackReason ?? "The operating system may have blocked the focus request."}`.trim()
          : `Ambient tried to show managed Chrome, but could not confirm the active browser tab was selected. ${fallbackReason ?? "Chrome may still be hidden behind another window."}`.trim(),
      ...(reveal.activeTab ? { activeTab: reveal.activeTab } : {}),
      foregroundAttempted: reveal.foregroundAttempted,
      foregroundSucceeded: reveal.foregroundSucceeded,
      ...(reveal.method ? { method: reveal.method } : {}),
      ...(fallbackReason ? { fallbackReason } : {}),
    };
  }

  async shutdown(): Promise<void> {
    this.clearUserAction("Browser shutting down.");
    await this.internalBrowser?.shutdown().catch(() => undefined);
    await this.stopChrome("Ambient Desktop is shutting down.").catch(() => undefined);
  }

  async copyChromeProfile(): Promise<BrowserCapabilityState> {
    await this.copyChromeProfileIntoState(this.paths());
    this.lastActivity = "Copied Chrome profile into Ambient-controlled state.";
    this.lastError = undefined;
    return this.getState();
  }

  private async copyChromeProfileIntoState(paths: BrowserPaths): Promise<CopiedChromeProfileMetadata> {
    const source = chromeProfileSourcePath();
    if (!source || !existsSync(source)) {
      throw new Error("Google Chrome profile directory was not found.");
    }
    mkdirSync(paths.root, { recursive: true });
    await rm(paths.copiedProfile, { recursive: true, force: true });
    await cp(source, paths.copiedProfile, {
      recursive: true,
      force: true,
      filter: (candidate) => shouldCopyChromeProfilePath(source, candidate),
    });
    const metadata: CopiedChromeProfileMetadata = {
      sourceProfilePath: source,
      copiedProfilePath: paths.copiedProfile,
      copiedAt: new Date().toISOString(),
    };
    await writeFile(
      paths.copiedProfileMetadata,
      JSON.stringify(metadata, null, 2),
      "utf8",
    );
    return metadata;
  }

  async clearCopiedChromeProfile(): Promise<BrowserCapabilityState> {
    if (this.isChromeRunning() && this.profileMode === "copied") await this.stopChrome("Copied browser profile is being cleared.");
    const paths = this.paths();
    await this.clearChromeSessionManifest("copied").catch(() => undefined);
    await rm(paths.copiedProfile, { recursive: true, force: true });
    await rm(paths.copiedProfileMetadata, { force: true });
    this.lastActivity = "Cleared copied Chrome profile.";
    this.lastError = undefined;
    return this.getState();
  }

  async clearIsolatedBrowserProfile(): Promise<BrowserCapabilityState> {
    if (this.isChromeRunning() && this.profileMode === "isolated") await this.stopChrome("Isolated browser profile is being cleared.");
    const paths = this.paths();
    await this.clearChromeSessionManifest("isolated").catch(() => undefined);
    await rm(paths.isolatedProfile, { recursive: true, force: true });
    this.clearUserAction("Cleared isolated browser profile.");
    this.lastActivity = "Cleared isolated browser profile.";
    this.lastError = undefined;
    return this.getState();
  }

  async navigate(input: BrowserNavigateInput & BrowserActivityInput): Promise<BrowserNavigateResult> {
    const blocked = this.activeUserActionBlock(input);
    if (blocked) {
      if (input.waitForUserAction === false) return blocked;
      await this.waitForBrowserUserActionClear(blocked, input.onActivity);
    }
    if (this.runtimeForInput(input) === "internal") {
      const url = normalizeBrowserUrl(input.url);
      await assertLocalBrowserNavigationReachable(url);
      await this.ensureInternalStarted();
      input.onActivity?.("Internal browser runtime is ready.");
      const content = await this.internalBrowser!.navigate({ ...input, url, profileMode: "isolated", runtime: "internal" });
      this.recordInternalPreviewUrl(url);
      input.onActivity?.("Internal browser navigation completed; checking page state.");
      const userAction = this.normalizeUserActionDetection(
        await this.internalBrowser!.evaluate({ code: browserUserActionDetectionExpression(), profileMode: "isolated", runtime: "internal" }).catch(
          () => undefined,
        ),
        { toolName: "browser_nav", runtime: "internal", profileMode: "isolated", sourceThreadId: input.sourceThreadId },
      );
      if (userAction) {
        if (input.waitForUserAction === false) return userAction;
        await this.waitForInternalUserActionClear(userAction, input.onActivity);
        return assertBrowserNavigationReachedRequestedPage(
          url,
          await this.internalBrowser!.content({ profileMode: "isolated", runtime: "internal" }),
        );
      }
      this.clearResolvedUserAction({
        runtime: "internal",
        profileMode: "isolated",
        message: "Browser user action no longer detected after navigation.",
      });
      input.onActivity?.("Internal browser page content is readable.");
      return assertBrowserNavigationReachedRequestedPage(url, content);
    }
    return this.navigateChrome(input);
  }

  async content(input: BrowserContentInput & BrowserActivityInput = {}): Promise<BrowserContentResult> {
    const blocked = this.activeUserActionBlock(input);
    if (blocked) {
      if (input.waitForUserAction === false) return blocked;
      await this.waitForBrowserUserActionClear(blocked, input.onActivity);
    }
    if (this.runtimeForInput(input) === "internal") {
      await this.ensureInternalStarted();
      await this.recoverInternalPreviewTargetIfBlank(input.onActivity);
      input.onActivity?.("Internal browser runtime is ready.");
      const content = await this.internalBrowser!.content({ ...input, profileMode: "isolated", runtime: "internal" });
      input.onActivity?.("Internal browser content was read; checking page state.");
      const userAction = this.normalizeUserActionDetection(
        await this.internalBrowser!.evaluate({ code: browserUserActionDetectionExpression(), profileMode: "isolated", runtime: "internal" }).catch(
          () => undefined,
        ),
        { toolName: "browser_content", runtime: "internal", profileMode: "isolated", sourceThreadId: input.sourceThreadId },
      );
      if (userAction) {
        if (input.waitForUserAction === false) return userAction;
        await this.waitForInternalUserActionClear(userAction, input.onActivity);
        return this.internalBrowser!.content({ profileMode: "isolated", runtime: "internal" });
      }
      this.clearResolvedUserAction({
        runtime: "internal",
        profileMode: "isolated",
        message: "Browser user action no longer detected while reading the page.",
      });
      input.onActivity?.("Internal browser page content is ready.");
      return content;
    }
    return this.contentChrome(input);
  }

  async search(input: BrowserSearchInput & BrowserActivityInput): Promise<BrowserSearchResults> {
    const blocked = this.activeUserActionBlock(input);
    if (blocked) {
      if (input.waitForUserAction === false) return blocked;
      await this.waitForBrowserUserActionClear(blocked, input.onActivity);
    }
    if (this.runtimeForInput(input) === "internal") {
      await this.ensureInternalStarted();
      input.onActivity?.("Internal browser runtime is ready.");
      const results = await this.internalBrowser!.search({ ...input, profileMode: "isolated", runtime: "internal" });
      input.onActivity?.("Internal browser search results were read; checking page state.");
      const userAction = this.normalizeUserActionDetection(
        await this.internalBrowser!.evaluate({ code: browserUserActionDetectionExpression(), profileMode: "isolated", runtime: "internal" }).catch(
          () => undefined,
        ),
        { toolName: "browser_search", runtime: "internal", profileMode: "isolated", sourceThreadId: input.sourceThreadId },
      );
      if (userAction) {
        if (input.waitForUserAction === false) return userAction;
        await this.waitForInternalUserActionClear(userAction, input.onActivity);
        return this.internalBrowser!.search({ ...input, profileMode: "isolated", runtime: "internal" });
      }
      this.clearResolvedUserAction({
        runtime: "internal",
        profileMode: "isolated",
        message: "Browser user action no longer detected after search.",
      });
      input.onActivity?.("Internal browser search results are ready.");
      return results;
    }
    return this.searchChrome(input);
  }

  async evaluate(input: BrowserEvaluateInput & BrowserActivityInput): Promise<unknown> {
    const blocked = this.activeUserActionBlock();
    if (blocked) return blocked;
    if (this.runtimeForInput(input) === "internal") {
      await this.ensureInternalStarted();
      await this.recoverInternalPreviewTargetIfBlank(input.onActivity);
      input.onActivity?.("Internal browser runtime is ready.");
      const result = await this.internalBrowser!.evaluate({ ...input, profileMode: "isolated", runtime: "internal" });
      input.onActivity?.("Internal browser JavaScript evaluation completed.");
      return result;
    }
    return this.evaluateChrome(input);
  }

  async keypress(input: BrowserKeypressInput): Promise<BrowserKeypressResult | BrowserUserActionState> {
    const blocked = this.activeUserActionBlock();
    if (blocked) return blocked;
    const normalized = normalizeBrowserKeypressInput(input);
    if (this.runtimeForInput(normalized) === "internal") {
      await this.ensureInternalStarted();
      await this.recoverInternalPreviewTargetIfBlank();
      return this.internalBrowser!.keypress({ ...normalized, profileMode: "isolated", runtime: "internal" });
    }
    return this.keypressChrome(normalized);
  }

  async login(input: BrowserLoginRequest): Promise<BrowserLoginResult | BrowserUserActionState> {
    const blocked = this.activeUserActionBlock();
    if (blocked) return blocked;
    const normalized = normalizeBrowserLoginRequest(input);
    if (this.runtimeForInput(normalized) === "internal") {
      await this.ensureInternalStarted();
      const tab = (await this.internalBrowser!.getState()).activeTab;
      assertLoginOrigin(normalized.expectedOrigin, normalized.credential.origin, tab?.url);
      const result = await this.internalBrowser!.login({ ...normalized, profileMode: "isolated", runtime: "internal" });
      this.lastActivity = `Filled stored credential "${normalized.credential.label}" for ${normalized.expectedOrigin}.`;
      return normalizeBrowserLoginResult(result, normalized);
    }
    return this.loginChrome(normalized);
  }

  async screenshot(input: BrowserStartInput & BrowserActivityInput = {}): Promise<BrowserScreenshotResult | BrowserUserActionState> {
    const blocked = this.activeUserActionBlock();
    if (blocked) return blocked;
    if (input.runtime === "internal") {
      await this.ensureInternalStarted();
      await this.recoverInternalPreviewTargetIfBlank(input.onActivity);
      input.onActivity?.("Internal browser runtime is ready.");
      assertBrowserScreenshotTargetLoaded((await this.internalBrowser!.getState()).activeTab);
      const result = await this.internalBrowser!.screenshot({ ...input, profileMode: "isolated", runtime: "internal" });
      input.onActivity?.("Internal browser screenshot was captured.");
      return {
        ...result,
        runtime: "internal",
        statePreserved: true,
        freshLoad: false,
      };
    }
    return this.screenshotChrome(input);
  }

  async refreshWorkspaceArtifact(input: { workspacePath: string; changedPath: string }): Promise<boolean> {
    let refreshed = false;

    if (this.internalBrowser?.isRunning()) {
      const internal = await this.internalBrowser.getState();
      const activeUrl = internal.activeTab?.url;
      if (shouldReloadBrowserUrlForWorkspaceChange(activeUrl, input.workspacePath, input.changedPath)) {
        await this.internalBrowser.navigate({ url: activeUrl!, profileMode: "isolated", runtime: "internal" });
        refreshed = true;
      }
    }

    if (this.isChromeRunning()) {
      const targets = await this.targets().catch(() => []);
      for (const target of targets) {
        if (!target.webSocketDebuggerUrl || !shouldReloadBrowserUrlForWorkspaceChange(target.url, input.workspacePath, input.changedPath)) {
          continue;
        }
        const client = await JsonRpcWebSocketClient.connect(target.webSocketDebuggerUrl);
        try {
          await client.request("Page.reload", { ignoreCache: true }, 8_000);
          refreshed = true;
          if (target.id === this.activeTargetId) {
            this.lastActiveTab = { id: target.id, title: target.title, url: target.url };
          }
        } finally {
          client.close();
        }
      }
    }

    if (refreshed) {
      this.lastActivity = `Reloaded browser preview after ${input.changedPath} changed.`;
      this.lastError = undefined;
    }
    return refreshed;
  }

  async pick(input: BrowserPickInput): Promise<BrowserPickResult | BrowserUserActionState> {
    const blocked = this.activeUserActionBlock();
    if (blocked) return blocked;
    const profileMode = input.profileMode ?? DEFAULT_PROFILE_MODE;
    this.activePicker = { prompt: input.prompt, profileMode, startedAt: new Date().toISOString() };
    this.lastActivity = `Waiting for browser picker selection: ${input.prompt}`;
    this.lastError = undefined;
    try {
      if (this.runtimeForInput(input) === "internal") {
        await this.ensureInternalStarted();
        return await this.internalBrowser!.pick({ ...input, profileMode: "isolated", runtime: "internal" });
      }
      return await this.pickChrome(input);
    } finally {
      this.activePicker = undefined;
    }
  }

  async cancelPick(): Promise<BrowserCapabilityState> {
    if (!this.activePicker) {
      this.lastActivity = "No active browser picker to cancel.";
      return this.getState();
    }
    const runtime = this.activeRuntime;
    this.activePicker = undefined;
    if (runtime === "internal" && this.internalBrowser?.isRunning()) {
      await this.internalBrowser.cancelPick();
    } else if (this.isChromeRunning()) {
      await this.evaluatePage<boolean>(cancelBrowserPickExpression(), 2_500).catch((error) => {
        this.lastError = errorMessage(error);
      });
    }
    this.lastActivity = "Browser picker cancellation requested.";
    return this.getState();
  }

  async resumeUserAction(): Promise<BrowserCapabilityState> {
    if (!this.userAction?.active) {
      this.lastActivity = "No browser user action is waiting.";
      return this.getState();
    }
    if (!this.userActionWaiter) {
      await this.checkDetachedUserActionCompletion(this.userAction);
      return this.getState();
    }
    this.userAction = {
      ...this.userAction,
      status: "resuming",
      lastCheckedAt: new Date().toISOString(),
      message: "Checking whether the browser warning is complete.",
    };
    this.lastActivity = "Browser user action completion requested.";
    this.notifyStateChanged();
    this.resolveUserAction("resume");
    return this.getState();
  }

  async cancelUserAction(): Promise<BrowserCapabilityState> {
    if (!this.userAction?.active) {
      this.lastActivity = "No browser user action is waiting.";
      return this.getState();
    }
    this.clearUserAction("Browser warning dismissed.", "cancel");
    return this.getState();
  }

  setViewBounds(input: BrowserViewBoundsInput): void {
    this.internalBrowser?.setViewBounds(input);
  }

  private async startChrome(profileMode: BrowserProfileMode = DEFAULT_PROFILE_MODE): Promise<BrowserCapabilityState> {
    if (this.isChromeRunning() && this.profileMode === profileMode) return this.getState();
    if (this.internalBrowser?.isRunning()) await this.internalBrowser.stop();
    if (this.isChromeRunning()) {
      await this.closeOrPreserveChromeForRuntimeSwitch("Switched browser profile.");
    }

    const availability = chromeAvailability();
    const executable = availability.executable;
    if (!executable) throw new BrowserUnavailableError(availability.unavailableReason ?? defaultChromeUnavailableReason());

    const paths = this.paths();
    mkdirSync(paths.root, { recursive: true });
    mkdirSync(paths.profilesRoot, { recursive: true });
    mkdirSync(paths.sessionsRoot, { recursive: true });
    mkdirSync(paths.sessionManifests, { recursive: true });
    mkdirSync(paths.screenshots, { recursive: true });
    if (profileMode === "copied" && !existsSync(paths.copiedProfile)) {
      await this.copyChromeProfileIntoState(paths);
    }

    const persistentProfilePath = profileMode === "isolated" ? paths.isolatedProfile : undefined;
    const runtimeProfilePath = persistentProfilePath ?? join(paths.sessionsRoot, `${profileMode}-${this.instanceId}`);
    const runtimeProfileEphemeral = !persistentProfilePath;
    if (runtimeProfileEphemeral) await rm(runtimeProfilePath, { recursive: true, force: true });
    mkdirSync(runtimeProfilePath, { recursive: true });
    if (profileMode === "copied") {
      if (!existsSync(paths.copiedProfile)) {
        throw new Error("No copied Chrome profile is available. Copy a profile from the Browser panel first.");
      }
      await cp(paths.copiedProfile, runtimeProfilePath, {
        recursive: true,
        force: true,
        filter: (source) => shouldCopyChromeProfilePath(paths.copiedProfile, source),
      });
    }

    const args = managedChromeLaunchArgs(runtimeProfilePath);
    const child = spawn(executable, args, {
      detached: false,
      stdio: "ignore",
      windowsHide: true,
    });
    let launchError: Error | undefined;
    child.once("error", (error) => {
      launchError = error;
    });

    this.child = child;
    this.port = undefined;
    this.profileMode = profileMode;
    this.runtimeProfilePath = runtimeProfilePath;
    this.runtimeProfileEphemeral = runtimeProfileEphemeral;
    this.attachedChrome = false;
    this.chromeSessionId = randomUUID();
    this.chromeProcessId = child.pid;
    this.lastChromeBrowserActionTarget = undefined;
    this.activeRuntime = "chrome";
    this.lastActivity = `Started ${profileMode} browser profile${runtimeProfileEphemeral ? "" : " with persistent Ambient state"}.`;
    this.recordChromeSessionEvent("started", "Started managed Chrome for Ambient browser tooling.");
    this.lastError = undefined;

    child.once("exit", () => {
      if (this.child === child) {
        this.child = undefined;
        this.port = undefined;
        this.browserWsUrl = undefined;
        this.activeTargetId = undefined;
        this.chromeProcessId = undefined;
        this.lastChromeBrowserActionTarget = undefined;
      }
    });

    try {
      const version = await this.waitForLaunchedChromeVersion(runtimeProfilePath, child, () => launchError);
      this.browserWsUrl = version.webSocketDebuggerUrl ?? this.browserWsUrl;
      await this.ensureActiveTarget();
      await this.setActiveChromeWindowState("minimized").catch(() => undefined);
      await this.writeChromeSessionManifest();
      return this.getState();
    } catch (error) {
      this.lastError = errorMessage(error);
      await this.stopChrome("Managed Chrome failed to start cleanly.").catch(() => undefined);
      throw error;
    }
  }

  private async preserveChromeSession(reason: string): Promise<void> {
    if (!this.isChromeRunning()) return;
    this.recordChromeSessionEvent("preserved", reason);
    this.child?.unref?.();
    this.child = undefined;
    this.attachedChrome = true;
    this.lastActivity = reason;
    this.notifyStateChanged();
    await this.writeChromeSessionManifest().catch(() => undefined);
  }

  private shouldPreserveChromeForRuntimeSwitch(): boolean {
    return Boolean(this.userAction?.active && this.userAction.runtime === "chrome" && this.userAction.profileMode === this.profileMode);
  }

  private async closeOrPreserveChromeForRuntimeSwitch(reason: string): Promise<void> {
    if (this.shouldPreserveChromeForRuntimeSwitch()) {
      await this.preserveChromeSession(`${reason} Previous managed Chrome session preserved because a browser user action is still active.`);
      return;
    }
    await this.stopChrome(`${reason} Previous managed Chrome session closed.`);
  }

  private async stopChrome(reason = "Managed Chrome was closed."): Promise<void> {
    const child = this.child;
    const closeBrowserWsUrl = this.browserWsUrl;
    const closedProfileMode = this.profileMode;
    const closedSessionId = this.chromeSessionId;
    this.child = undefined;
    this.port = undefined;
    this.browserWsUrl = undefined;
    this.activeTargetId = undefined;
    this.chromeSessionId = undefined;
    this.chromeProcessId = undefined;
    this.attachedChrome = false;
    this.lastActiveTab = undefined;
    this.lastChromeBrowserActionTarget = undefined;
    this.lastActivity = reason;
    this.recordChromeSessionEvent("closed", reason, closedProfileMode, closedSessionId);
    if (closeBrowserWsUrl) {
      await JsonRpcWebSocketClient.connect(closeBrowserWsUrl)
        .then(async (client) => {
          try {
            await client.request("Browser.close", {}, 2_000);
          } finally {
            client.close();
          }
        })
        .catch(() => undefined);
    }
    if (child && !childProcessExited(child)) {
      child.kill();
      const exitedAfterTerminate = await waitForChildProcessExit(child, 2_500);
      if (!exitedAfterTerminate && !childProcessExited(child)) {
        child.kill("SIGKILL");
        await waitForChildProcessExit(child, 2_500);
      }
    }
    await this.clearChromeSessionManifest().catch(() => undefined);
    if (this.runtimeProfilePath) {
      if (this.runtimeProfileEphemeral) await rm(this.runtimeProfilePath, { recursive: true, force: true }).catch(() => undefined);
      this.runtimeProfilePath = undefined;
    }
    this.runtimeProfileEphemeral = false;
  }

  private async navigateChrome(input: BrowserNavigateInput & BrowserActivityInput): Promise<BrowserNavigateResult> {
    const url = normalizeBrowserUrl(input.url);
    await assertLocalBrowserNavigationReachable(url);
    await this.ensureChromeStarted(input.profileMode);
    input.onActivity?.("Chrome browser runtime is ready.");
    try {
      if (input.newTab) await this.createTarget(url);
      else await this.navigateActiveTarget(url);
    } catch (error) {
      await this.closeActiveAboutBlankTarget().catch(() => undefined);
      throw error;
    }
    input.onActivity?.("Chrome navigation completed; checking page state.");
    const userAction = this.normalizeUserActionDetection(await this.detectChromeUserAction().catch(() => undefined), {
      toolName: "browser_nav",
      runtime: "chrome",
      profileMode: this.profileMode,
      targetId: this.activeTargetId,
      sourceThreadId: input.sourceThreadId,
    });
    if (userAction) {
      const evidencedUserAction = await this.attachChromeUserActionEvidence(userAction, input);
      if (input.waitForUserAction === false) return evidencedUserAction;
      await this.waitForChromeUserActionClear(evidencedUserAction, input.onActivity);
    }
    this.lastActivity = `Navigated to ${url}.`;
    const content = await this.contentChrome({});
    input.onActivity?.("Chrome page content is readable.");
    if (!("text" in content)) return content;
    return assertBrowserNavigationReachedRequestedPage(url, content);
  }

  private async contentChrome(input: BrowserContentInput & BrowserActivityInput = {}): Promise<BrowserContentResult> {
    const url = input.url ? normalizeBrowserUrl(input.url) : undefined;
    if (url) await assertLocalBrowserNavigationReachable(url);
    await this.ensureChromeStarted(input.profileMode);
    input.onActivity?.("Chrome browser runtime is ready.");
    if (url) {
      try {
        await this.navigateActiveTarget(url);
      } catch (error) {
        await this.closeActiveAboutBlankTarget().catch(() => undefined);
        throw error;
      }
      input.onActivity?.("Chrome navigation completed for content read.");
    }
    const userAction = this.normalizeUserActionDetection(await this.detectChromeUserAction().catch(() => undefined), {
      toolName: "browser_content",
      runtime: "chrome",
      profileMode: this.profileMode,
      targetId: this.activeTargetId,
      sourceThreadId: input.sourceThreadId,
    });
    if (userAction) {
      const evidencedUserAction = await this.attachChromeUserActionEvidence(userAction, input);
      if (input.waitForUserAction === false) return evidencedUserAction;
      await this.waitForChromeUserActionClear(evidencedUserAction, input.onActivity);
    }
    const content = await this.evaluatePage<BrowserPageContent>(contentExpression(MAX_BROWSER_TEXT));
    input.onActivity?.("Chrome DOM content was extracted.");
    this.clearResolvedUserAction({
      runtime: "chrome",
      profileMode: this.profileMode,
      targetId: this.activeTargetId,
      message: "Browser user action no longer detected while reading the page.",
    });
    this.lastActiveTab = { title: content.title, url: content.url, id: this.activeTargetId };
    this.lastActivity = input.url ? `Read page content from ${content.url ?? input.url}.` : "Read active page content.";
    return normalizePageContent(content);
  }

  private async searchChrome(input: BrowserSearchInput & BrowserActivityInput): Promise<BrowserSearchResults> {
    await this.ensureChromeStarted(input.profileMode);
    input.onActivity?.("Chrome browser runtime is ready.");
    const limit = clampInteger(input.maxResults ?? 5, 1, 10);
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(input.query)}`;
    await this.navigateActiveTarget(searchUrl);
    input.onActivity?.("Chrome search page navigation completed.");
    const userAction = this.normalizeUserActionDetection(await this.detectChromeUserAction().catch(() => undefined), {
      toolName: "browser_search",
      runtime: "chrome",
      profileMode: this.profileMode,
      targetId: this.activeTargetId,
      sourceThreadId: input.sourceThreadId,
    });
    if (userAction) {
      const evidencedUserAction = await this.attachChromeUserActionEvidence(userAction, input);
      if (input.waitForUserAction === false) return evidencedUserAction;
      await this.waitForChromeUserActionClear(evidencedUserAction, input.onActivity);
    }
    const results = await this.evaluatePage<BrowserSearchResult[]>(searchExpression(limit));
    input.onActivity?.("Chrome search results were extracted.");
    this.clearResolvedUserAction({
      runtime: "chrome",
      profileMode: this.profileMode,
      targetId: this.activeTargetId,
      message: "Browser user action no longer detected after search.",
    });
    const normalized = normalizeSearchResults(results).slice(0, limit);
    if (input.fetchContent) {
      for (const result of normalized.slice(0, Math.min(3, limit))) {
        try {
          await this.navigateActiveTarget(result.url);
          input.onActivity?.(`Chrome opened search result ${result.url}.`);
          const content = await this.contentChrome({});
          if ("text" in content) result.content = content.text.slice(0, 4_000);
          input.onActivity?.(`Chrome read search result ${result.url}.`);
        } catch {
          // Keep the search result even if one target page fails.
        }
      }
    }
    this.lastActivity = `Searched Google for "${input.query}".`;
    return normalized;
  }

  private async evaluateChrome(input: BrowserEvaluateInput & BrowserActivityInput): Promise<unknown> {
    await this.ensureChromeStarted(input.profileMode);
    input.onActivity?.("Chrome browser runtime is ready.");
    const result = await this.evaluatePage<unknown>(userCodeExpression(input.code));
    input.onActivity?.("Chrome JavaScript evaluation completed.");
    this.rememberChromeBrowserActionTarget(await this.getActiveTabSnapshot().catch(() => undefined));
    this.lastActivity = "Evaluated JavaScript in the active page.";
    return result;
  }

  private async keypressChrome(input: NormalizedBrowserKeypressInput): Promise<BrowserKeypressResult> {
    await this.ensureChromeStarted(input.profileMode);
    const client = await this.connectActivePage();
    try {
      await client.request("Page.enable", {}, 5_000).catch(() => undefined);
      await client.request("Page.bringToFront", {}, 5_000).catch(() => undefined);
      const focus = await focusBrowserPage(client, input.focus);
      for (const key of input.keys) {
        await client.request("Input.dispatchKeyEvent", chromeKeyEventParams("keyDown", key), 5_000);
        if (key.durationMs > 0) await delay(key.durationMs);
        await client.request("Input.dispatchKeyEvent", chromeKeyEventParams("keyUp", key), 5_000);
      }
      const tab = await this.getActiveTabSnapshot().catch(() => undefined);
      this.rememberChromeBrowserActionTarget(tab);
      this.lastActivity = `Dispatched ${input.keys.length} browser keypress event(s).`;
      return {
        dispatchedCount: input.keys.length,
        keys: input.keys.map(keypressKeyResult),
        focus,
        title: tab?.title,
        url: tab?.url,
      };
    } finally {
      client.close();
    }
  }

  private async loginChrome(input: BrowserLoginRequest): Promise<BrowserLoginResult> {
    await this.ensureChromeStarted(input.profileMode);
    const tab = await this.getActiveTabSnapshot().catch(() => undefined);
    assertLoginOrigin(input.expectedOrigin, input.credential.origin, tab?.url);
    const raw = await this.evaluatePage<Partial<BrowserLoginResult>>(browserLoginExpression(input), 15_000);
    if (input.submit !== false) await this.waitForPageReady().catch(() => undefined);
    const result = normalizeBrowserLoginResult(raw, input);
    this.lastActiveTab = { id: this.activeTargetId, title: result.title, url: result.url };
    this.lastActivity = `Filled stored credential "${input.credential.label}" for ${input.expectedOrigin}.`;
    return result;
  }

  private async screenshotChrome(input: BrowserStartInput & BrowserActivityInput = {}): Promise<BrowserScreenshotResult> {
    await this.ensureChromeStarted(input.profileMode);
    input.onActivity?.("Chrome browser runtime is ready.");
    await this.refuseStateLosingInternalPreviewScreenshotIfBlank(input.onActivity);
    const tabBeforeCapture = await this.getActiveTabSnapshot().catch(() => undefined);
    assertBrowserScreenshotTargetLoaded(tabBeforeCapture);
    const data = await this.captureChromeScreenshotData();
    input.onActivity?.("Chrome screenshot bytes captured.");
    const tab = await this.getActiveTabSnapshot().catch(() => undefined);
    const sameTargetAsLastBrowserAction = this.sameAsLastChromeBrowserActionTarget(tab ?? tabBeforeCapture);
    const fileName = `browser-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    const target = browserScreenshotStorageTarget(this.getWorkspace(), input);
    mkdirSync(target.screenshots, { recursive: true });
    const filePath = join(target.screenshots, fileName);
    const bytes = Buffer.from(data, "base64");
    const dimensions = pngImageDimensions(bytes);
    await writeFile(filePath, bytes);
    input.onActivity?.("Chrome screenshot artifact was written.");
    this.lastActivity = `Captured browser screenshot ${fileName}.`;
    return {
      path: filePath,
      artifactPath: browserScreenshotArtifactPath(target, filePath),
      mimeType: BROWSER_SCREENSHOT_MIME_TYPE,
      bytes: bytes.length,
      ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
      title: tab?.title,
      url: tab?.url,
      runtime: "chrome",
      targetId: tab?.id ?? tabBeforeCapture?.id,
      statePreserved: true,
      freshLoad: false,
      ...(sameTargetAsLastBrowserAction !== undefined ? { sameTargetAsLastBrowserAction } : {}),
    };
  }

  private async pickChrome(input: BrowserPickInput): Promise<BrowserPickResult> {
    await this.ensureChromeStarted(input.profileMode);
    const raw = await this.evaluatePage<BrowserPickSelection[] | null>(
      buildBrowserPickExpression(input.prompt),
      PICK_TIMEOUT_MS,
    );
    const tab = await this.getActiveTabSnapshot().catch(() => undefined);
    const selections = Array.isArray(raw) ? raw.map(normalizePickSelection).filter(BooleanPickSelection) : [];
    this.lastActivity = raw ? `Picked ${selections.length} browser element(s).` : "Browser picker canceled.";
    return {
      canceled: !raw,
      prompt: input.prompt,
      title: tab?.title,
      url: tab?.url,
      selections,
    };
  }

  private rememberChromeBrowserActionTarget(tab?: BrowserTabSnapshot): void {
    const targetId = tab?.id ?? this.activeTargetId;
    if (!targetId) return;
    this.lastChromeBrowserActionTarget = {
      id: targetId,
      title: tab?.title ?? this.lastActiveTab?.title,
      url: tab?.url ?? this.lastActiveTab?.url,
    };
  }

  private sameAsLastChromeBrowserActionTarget(tab?: BrowserTabSnapshot): boolean | undefined {
    if (!this.lastChromeBrowserActionTarget?.id) return undefined;
    return Boolean(tab?.id && tab.id === this.lastChromeBrowserActionTarget.id);
  }

  private async ensureInternalStarted(): Promise<void> {
    if (!this.internalBrowser?.isAvailable()) {
      throw new BrowserUnavailableError("The internal browser view is not available in this Electron runtime.");
    }
    if (this.isChromeRunning()) await this.closeOrPreserveChromeForRuntimeSwitch("Switched to the internal browser.");
    this.profileMode = "isolated";
    this.activeRuntime = "internal";
    if (!this.internalBrowser.isRunning()) await this.internalBrowser.start();
  }

  private recordInternalPreviewUrl(url: string): void {
    if (isLocalBrowserHttpUrl(url)) this.lastInternalPreviewUrl = url;
  }

  private async recoverInternalPreviewTargetIfBlank(onActivity?: (message: string) => void): Promise<void> {
    if (!this.lastInternalPreviewUrl || !this.internalBrowser?.isRunning()) return;
    const activeTab = (await this.internalBrowser.getState().catch(() => undefined))?.activeTab;
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
    await this.internalBrowser.navigate({ url: this.lastInternalPreviewUrl, profileMode: "isolated", runtime: "internal" });
  }

  private async refuseStateLosingInternalPreviewScreenshotIfBlank(onActivity?: (message: string) => void): Promise<void> {
    if (!this.lastInternalPreviewUrl) return;
    const activeTab = await this.getActiveTabSnapshot().catch(() => undefined);
    if (!isAboutBlankUrl(activeTab?.url ?? "")) return;
    const message = [
      "Browser screenshot refused because managed Chrome is on about:blank while the last known preview is an internal browser page.",
      "Opening that preview URL in Chrome would create a fresh page load and lose prior click/assert state.",
      "Call browser_local_preview again so the preview opens in managed Chrome, then repeat browser_click/browser_assert before browser_screenshot.",
    ].join(" ");
    onActivity?.(message);
    this.lastError = message;
    throw new Error(message);
  }

  private async ensureChromeStarted(profileMode: BrowserProfileMode = DEFAULT_PROFILE_MODE): Promise<void> {
    profileMode = this.userAction?.active && this.userAction.runtime === "chrome" ? this.userAction.profileMode : profileMode;
    if (this.internalBrowser?.isRunning()) await this.internalBrowser.stop();
    this.activeRuntime = "chrome";
    if (this.isChromeRunning() && this.profileMode === profileMode) return;
    if (this.isChromeRunning()) await this.closeOrPreserveChromeForRuntimeSwitch("Switched browser profile.");
    if (await this.reattachChrome(profileMode)) return;
    await this.startChrome(profileMode);
  }

  private async refreshChromeRunningState(): Promise<void> {
    if (this.child) {
      if (this.child.exitCode === null && this.child.signalCode === null) return;
      await this.stopChrome("Managed Chrome exited.");
      return;
    }
    if (!this.attachedChrome || !this.port) return;
    await fetchJson<ChromeVersionInfo>(this.browserUrl("/json/version")).catch(async () => {
      this.port = undefined;
      this.browserWsUrl = undefined;
      this.activeTargetId = undefined;
      this.chromeSessionId = undefined;
      this.chromeProcessId = undefined;
      this.attachedChrome = false;
      this.lastActiveTab = undefined;
      this.runtimeProfilePath = undefined;
      this.recordChromeSessionEvent("closed", "Previously preserved managed Chrome session is no longer reachable.");
      await this.clearChromeSessionManifest().catch(() => undefined);
    });
  }

  private isChromeRunning(): boolean {
    return Boolean(this.port && ((this.child && this.child.exitCode === null && this.child.signalCode === null) || this.attachedChrome));
  }

  private async internalStateSnapshot(): Promise<BrowserCapabilityState> {
    const internal = await this.internalBrowser!.getState();
    return this.stateSnapshotBase({
      runtime: "internal",
      running: internal.running,
      profileMode: "isolated",
      activeTab: internal.activeTab,
      lastActivity: internal.lastActivity ?? this.lastActivity,
      lastError: internal.lastError ?? this.lastError,
      viewVisible: internal.viewVisible,
    });
  }

  private chromeStateSnapshot(): BrowserCapabilityState {
    return this.stateSnapshotBase({
      runtime: "chrome",
      running: this.isChromeRunning(),
      profileMode: this.profileMode,
      activeTab: this.lastActiveTab,
      lastActivity: this.lastActivity,
      lastError: this.lastError,
    });
  }

  private stateSnapshotBase(input: {
    runtime: BrowserRuntimeKind;
    running: boolean;
    profileMode: BrowserProfileMode;
    activeTab?: BrowserTabSnapshot;
    lastActivity?: string;
    lastError?: string;
    viewVisible?: boolean;
  }): BrowserCapabilityState {
    const chrome = chromeAvailability();
    const sourceProfilePath = chromeProfileSourcePath();
    const paths = this.paths();
    const copiedProfile = copiedChromeProfileState(paths);
    return {
      running: input.running,
      profileMode: input.profileMode,
      runtime: input.runtime,
      internalAvailable: this.hasInternalBrowser(),
      copiedProfileAvailable: copiedProfile.available,
      chromeAvailable: chrome.available,
      ...(chrome.unavailableReason ? { chromeUnavailableReason: chrome.unavailableReason } : {}),
      browserLoginBrokerAvailable: this.options.browserLoginBrokerAvailable !== false,
      ...(input.viewVisible !== undefined ? { viewVisible: input.viewVisible } : {}),
      ...(sourceProfilePath ? { sourceProfilePath } : {}),
      isolatedProfilePath: paths.isolatedProfile,
      isolatedProfilePersistent: true,
      copiedProfilePath: paths.copiedProfile,
      ...(copiedProfile.sourceProfilePath ? { copiedProfileSourcePath: copiedProfile.sourceProfilePath } : {}),
      ...(copiedProfile.copiedAt ? { copiedProfileCopiedAt: copiedProfile.copiedAt } : {}),
      ...(this.activePicker
        ? {
            pickerActive: true,
            pickerPrompt: this.activePicker.prompt,
            pickerStartedAt: this.activePicker.startedAt,
          }
        : {}),
      ...(input.activeTab ? { activeTab: input.activeTab } : {}),
      ...(this.userAction ? { userAction: this.userAction } : {}),
      ...(this.chromeSessionId ? { sessionId: this.chromeSessionId } : {}),
      ...(input.runtime === "chrome" && input.running && this.chromeProcessId ? { processId: this.chromeProcessId } : {}),
      ...(input.runtime === "chrome" && input.running && this.port ? { devToolsPort: this.port } : {}),
      ...(input.runtime === "chrome" && input.running && this.activeTargetId ? { activeTargetId: this.activeTargetId } : {}),
      ...(input.runtime === "chrome" && input.running && this.runtimeProfilePath ? { profilePath: this.runtimeProfilePath } : {}),
      ...(input.runtime === "chrome" && input.running ? { attachedToExistingSession: this.attachedChrome } : {}),
      ...(this.lastSessionEvent ? { lastSessionEvent: this.lastSessionEvent } : {}),
      ...(input.lastActivity ? { lastActivity: input.lastActivity } : {}),
      ...(input.lastError ? { lastError: input.lastError } : {}),
    };
  }

  private notifyStateChanged(): void {
    void this.options.onStateChanged?.();
  }

  private resolveUserAction(value: BrowserUserActionResolution): void {
    const waiter = this.userActionWaiter;
    if (!waiter) return;
    clearTimeout(waiter.timeout);
    if (waiter.activityTimer) clearInterval(waiter.activityTimer);
    this.userActionWaiter = undefined;
    waiter.resolve(value);
  }

  private beginUserAction(input: {
    toolName: string;
    runtime: BrowserRuntimeKind;
    profileMode: BrowserProfileMode;
    targetId?: string;
    sourceThreadId?: string;
    detection: BrowserUserActionDetection;
  }): BrowserUserActionState {
    const now = new Date().toISOString();
    const existing = this.userAction?.active ? this.userAction : undefined;
    const state: BrowserUserActionState = {
      id: existing?.id ?? randomUUID(),
      active: true,
      status: "waiting",
      kind: input.detection.kind ?? "unknown-user-action",
      provider: input.detection.provider ?? "unknown",
      toolName: input.toolName,
      runtime: input.runtime,
      profileMode: input.profileMode,
      ...(input.sourceThreadId ?? existing?.sourceThreadId ? { sourceThreadId: input.sourceThreadId ?? existing?.sourceThreadId } : {}),
      ...(input.targetId ? { targetId: input.targetId } : {}),
      url: input.detection.url,
      title: input.detection.title,
      origin: input.detection.origin,
      ...(input.detection.pageExcerpt ? { pageExcerpt: input.detection.pageExcerpt } : {}),
      message: input.detection.message ?? "Browser needs user action before Ambient can continue.",
      startedAt: existing?.startedAt ?? now,
      lastCheckedAt: now,
      canAutoResume: true,
    };
    this.userAction = state;
    this.lastActivity = state.message;
    this.lastError = undefined;
    this.notifyStateChanged();
    return state;
  }

  private async attachChromeUserActionEvidence(state: BrowserUserActionState, input: unknown = {}): Promise<BrowserUserActionState> {
    if (state.runtime !== "chrome" || state.screenshot) return state;
    try {
      const screenshot = await this.screenshotChrome({
        profileMode: state.profileMode,
        artifactWorkspacePath: browserArtifactWorkspacePath(input),
      });
      const next: BrowserUserActionState = { ...state, screenshot };
      if (this.userAction?.id === state.id) {
        this.userAction = next;
        this.notifyStateChanged();
      }
      return next;
    } catch (error) {
      this.lastError = errorMessage(error);
      return state;
    }
  }

  private clearUserAction(message = "Browser user action cleared.", resolution: BrowserUserActionResolution = "cancel"): void {
    this.resolveUserAction(resolution);
    if (!this.userAction) return;
    this.userAction = undefined;
    this.lastActivity = message;
    this.notifyStateChanged();
  }

  private clearResolvedUserAction(input: {
    runtime: BrowserRuntimeKind;
    profileMode: BrowserProfileMode;
    targetId?: string;
    message?: string;
  }): void {
    const current = this.userAction;
    if (!current) return;
    if (current.runtime !== input.runtime || current.profileMode !== input.profileMode) return;
    if (current.targetId && input.targetId && current.targetId !== input.targetId) return;
    this.clearUserAction(input.message ?? "Browser user action completed.", "resume");
  }

  private async waitForUserAction(
    state: BrowserUserActionState,
    onActivity?: (message: string) => void,
  ): Promise<BrowserUserActionResolution> {
    if (this.userActionWaiter) return "resume";
    return new Promise<BrowserUserActionResolution>((resolve) => {
      const activityMessage = browserUserActionWaitingActivity(state);
      onActivity?.(activityMessage);
      const activityTimer = onActivity
        ? setInterval(() => {
            onActivity(activityMessage);
          }, USER_ACTION_ACTIVITY_HEARTBEAT_MS)
        : undefined;
      const timeout = setTimeout(() => {
        if (activityTimer) clearInterval(activityTimer);
        this.userActionWaiter = undefined;
        if (this.userAction?.id === state.id) {
          this.userAction = {
            ...this.userAction,
            active: false,
            status: "timed-out",
            lastCheckedAt: new Date().toISOString(),
            message: "Browser user action timed out.",
          };
          this.lastActivity = "Browser user action timed out.";
          this.notifyStateChanged();
        }
        resolve("timeout");
      }, USER_ACTION_TIMEOUT_MS);
      this.userActionWaiter = { resolve, timeout, ...(activityTimer ? { activityTimer } : {}) };
    });
  }

  private async checkDetachedUserActionCompletion(state: BrowserUserActionState): Promise<void> {
    const checking: BrowserUserActionState = {
      ...state,
      status: "resuming",
      lastCheckedAt: new Date().toISOString(),
      message: "Checking whether the browser warning is complete.",
    };
    this.userAction = checking;
    this.lastActivity = "Browser user action completion requested.";
    this.lastError = undefined;
    this.notifyStateChanged();

    let raw: unknown;
    try {
      if (state.runtime === "chrome") {
        await this.ensureChromeStarted(state.profileMode);
        await this.ensureChromeTarget(state.targetId);
        raw = await this.detectChromeUserAction();
      } else {
        await this.ensureInternalStarted();
        raw = await this.internalBrowser!.evaluate({
          code: browserUserActionDetectionExpression(),
          profileMode: "isolated",
          runtime: "internal",
        });
      }
    } catch (error) {
      const message = `Could not confirm whether the browser warning is complete. ${errorMessage(error)}`.trim();
      this.userAction = {
        ...state,
        status: "waiting",
        lastCheckedAt: new Date().toISOString(),
        message,
      };
      this.lastActivity = message;
      this.lastError = errorMessage(error);
      this.notifyStateChanged();
      return;
    }

    const next = this.normalizeUserActionDetection(raw, {
      toolName: state.toolName,
      runtime: state.runtime,
      profileMode: state.profileMode,
      targetId: state.targetId,
      sourceThreadId: state.sourceThreadId,
    });
    if (next) {
      this.lastActivity = "Browser user action still needs attention.";
      return;
    }
    this.clearUserAction("Browser user action completed.", "resume");
  }

  private normalizeUserActionDetection(
    raw: unknown,
    input: { toolName: string; runtime: BrowserRuntimeKind; profileMode: BrowserProfileMode; targetId?: string; sourceThreadId?: string },
  ): BrowserUserActionState | undefined {
    const detection = normalizeBrowserUserActionDetection(raw);
    if (!detection) return undefined;
    return this.beginUserAction({ ...input, detection });
  }

  private activeUserActionBlock(input?: { userActionId?: string }): BrowserUserActionState | undefined {
    const current = this.userAction?.active ? this.userAction : undefined;
    if (!current) return undefined;
    if (input?.userActionId && input.userActionId === current.id) return undefined;
    this.lastActivity = "Browser warning is waiting for user action; new browser tool calls are paused.";
    this.notifyStateChanged();
    return current;
  }

  private async waitForBrowserUserActionClear(
    initial: BrowserUserActionState,
    onActivity?: (message: string) => void,
  ): Promise<void> {
    if (initial.runtime === "internal") return this.waitForInternalUserActionClear(initial, onActivity);
    return this.waitForChromeUserActionClear(initial, onActivity);
  }

  private async waitForChromeUserActionClear(
    initial: BrowserUserActionState,
    onActivity?: (message: string) => void,
  ): Promise<void> {
    let current = initial;
    while (true) {
      const resolution = await this.waitForUserAction(current, onActivity);
      if (resolution === "cancel") throw new BrowserUserActionCanceledError(current);
      if (resolution === "timeout") throw new BrowserUserActionTimedOutError(current);
      const next = this.normalizeUserActionDetection(
        await this.evaluatePage<BrowserUserActionDetection>(browserUserActionDetectionExpression(), 5_000).catch(() => undefined),
        {
          toolName: current.toolName,
          runtime: "chrome",
          profileMode: current.profileMode,
          targetId: current.targetId ?? this.activeTargetId,
          sourceThreadId: current.sourceThreadId,
        },
      );
      if (!next) {
        this.clearUserAction("Browser user action completed.", "resume");
        return;
      }
      current = next;
    }
  }

  private async waitForInternalUserActionClear(
    initial: BrowserUserActionState,
    onActivity?: (message: string) => void,
  ): Promise<void> {
    let current = initial;
    while (true) {
      const resolution = await this.waitForUserAction(current, onActivity);
      if (resolution === "cancel") throw new BrowserUserActionCanceledError(current);
      if (resolution === "timeout") throw new BrowserUserActionTimedOutError(current);
      const next = this.normalizeUserActionDetection(
        await this.internalBrowser
          ?.evaluate({ code: browserUserActionDetectionExpression(), profileMode: "isolated", runtime: "internal" })
          .catch(() => undefined),
        { toolName: current.toolName, runtime: "internal", profileMode: current.profileMode, sourceThreadId: current.sourceThreadId },
      );
      if (!next) {
        this.clearUserAction("Browser user action completed.", "resume");
        return;
      }
      current = next;
    }
  }

  private async reattachChrome(profileMode: BrowserProfileMode): Promise<boolean> {
    const manifest = await this.readChromeSessionManifest(profileMode);
    if (!manifest) return false;
    if (!isSubpath(this.paths().root, manifest.profilePath)) {
      await this.clearChromeSessionManifest(profileMode).catch(() => undefined);
      return false;
    }
    if (manifest.processId && !isProcessAlive(manifest.processId)) {
      await this.clearChromeSessionManifest(profileMode).catch(() => undefined);
      return false;
    }
    this.port = manifest.devToolsPort;
    this.browserWsUrl = manifest.browserWsUrl;
    try {
      const version = await fetchJson<ChromeVersionInfo>(this.browserUrl("/json/version"));
      this.browserWsUrl = version.webSocketDebuggerUrl ?? this.browserWsUrl;
      this.profileMode = manifest.profileMode;
      this.runtimeProfilePath = manifest.profilePath;
      this.runtimeProfileEphemeral = manifest.profileEphemeral;
      this.activeTargetId = manifest.activeTargetId;
      this.chromeSessionId = manifest.id;
      this.chromeProcessId = manifest.processId;
      this.attachedChrome = true;
      this.activeRuntime = "chrome";
      await this.ensureActiveTarget();
      await this.writeChromeSessionManifest();
      this.lastActivity = `Reattached to existing ${profileMode} browser session.`;
      this.recordChromeSessionEvent("reattached", "Reattached to preserved managed Chrome session.");
      this.lastError = undefined;
      return true;
    } catch {
      this.port = undefined;
      this.browserWsUrl = undefined;
      this.runtimeProfilePath = undefined;
      this.chromeSessionId = undefined;
      this.chromeProcessId = undefined;
      this.attachedChrome = false;
      await this.clearChromeSessionManifest(profileMode).catch(() => undefined);
      return false;
    }
  }

  private recordChromeSessionEvent(
    action: BrowserSessionLifecycleAction,
    reason: string,
    profileMode = this.profileMode,
    sessionId = this.chromeSessionId,
  ): void {
    this.lastSessionEvent = {
      action,
      reason,
      at: new Date().toISOString(),
      profileMode,
      ...(sessionId ? { sessionId } : {}),
    };
  }

  private chromeSessionManifestPath(profileMode = this.profileMode): string {
    return join(this.paths().sessionManifests, `${profileMode}.json`);
  }

  private async readChromeSessionManifest(profileMode: BrowserProfileMode): Promise<ChromeSessionManifest | undefined> {
    try {
      const parsed = JSON.parse(await readFile(this.chromeSessionManifestPath(profileMode), "utf8")) as Partial<ChromeSessionManifest>;
      if (
        typeof parsed.id !== "string" ||
        typeof parsed.workspacePath !== "string" ||
        parsed.workspacePath !== this.getWorkspace().path ||
        parsed.profileMode !== profileMode ||
        typeof parsed.profilePath !== "string" ||
        typeof parsed.devToolsPort !== "number" ||
        typeof parsed.browserWsUrl !== "string"
      ) {
        return undefined;
      }
      return {
        id: parsed.id,
        workspacePath: parsed.workspacePath,
        profileMode,
        profilePath: parsed.profilePath,
        profileEphemeral: parsed.profileEphemeral === true,
        processId: typeof parsed.processId === "number" ? parsed.processId : undefined,
        devToolsPort: parsed.devToolsPort,
        browserWsUrl: parsed.browserWsUrl,
        activeTargetId: typeof parsed.activeTargetId === "string" ? parsed.activeTargetId : undefined,
        createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
        lastUsedAt: typeof parsed.lastUsedAt === "string" ? parsed.lastUsedAt : new Date().toISOString(),
      };
    } catch {
      return undefined;
    }
  }

  private async writeChromeSessionManifest(): Promise<void> {
    if (!this.port || !this.browserWsUrl || !this.runtimeProfilePath || !this.chromeSessionId) return;
    const path = this.chromeSessionManifestPath();
    mkdirSync(this.paths().sessionManifests, { recursive: true });
    const existing = await this.readChromeSessionManifest(this.profileMode);
    const now = new Date().toISOString();
    const manifest: ChromeSessionManifest = {
      id: this.chromeSessionId,
      workspacePath: this.getWorkspace().path,
      profileMode: this.profileMode,
      profilePath: this.runtimeProfilePath,
      profileEphemeral: this.runtimeProfileEphemeral,
      processId: this.child?.pid ?? this.chromeProcessId ?? existing?.processId,
      devToolsPort: this.port,
      browserWsUrl: this.browserWsUrl,
      activeTargetId: this.activeTargetId,
      createdAt: existing?.id === this.chromeSessionId ? existing.createdAt : now,
      lastUsedAt: now,
    };
    await writeFile(path, JSON.stringify(manifest, null, 2), "utf8");
  }

  private async clearChromeSessionManifest(profileMode = this.profileMode): Promise<void> {
    await rm(this.chromeSessionManifestPath(profileMode), { force: true });
  }

  private hasInternalBrowser(): boolean {
    return Boolean(this.internalBrowser?.isAvailable());
  }

  private runtimeForInput(input: BrowserRequestInput): BrowserRuntimeKind {
    return this.runtimeForRequest(input.profileMode ?? DEFAULT_PROFILE_MODE, input.runtime);
  }

  private runtimeForRequest(profileMode: BrowserProfileMode, runtime?: BrowserRuntimeKind): BrowserRuntimeKind {
    return browserRuntimeForRequest(profileMode, runtime, this.hasInternalBrowser());
  }

  private paths(): BrowserPaths {
    const root = join(this.getWorkspace().statePath, "browser");
    return {
      root,
      copiedProfile: join(root, "copied-chrome-profile"),
      copiedProfileMetadata: join(root, "copied-chrome-profile.json"),
      profilesRoot: join(root, "profiles"),
      isolatedProfile: join(root, "profiles", "isolated-chrome"),
      sessionsRoot: join(root, "sessions"),
      sessionManifests: join(root, "session-manifests"),
      screenshots: join(root, "screenshots"),
    };
  }

  private async waitForVersion(): Promise<ChromeVersionInfo> {
    const startedAt = Date.now();
    let lastError = "";
    while (Date.now() - startedAt < START_TIMEOUT_MS) {
      try {
        const version = await fetchJson<ChromeVersionInfo>(this.browserUrl("/json/version"));
        if (version.webSocketDebuggerUrl) return version;
      } catch (error) {
        lastError = errorMessage(error);
      }
      await delay(250);
    }
    throw new Error(`Timed out waiting for Chrome remote debugging. ${lastError}`.trim());
  }

  private async waitForLaunchedChromeVersion(
    profilePath: string,
    child: ChildProcess,
    launchError: () => Error | undefined = () => undefined,
  ): Promise<ChromeVersionInfo> {
    const activePortPath = join(profilePath, "DevToolsActivePort");
    const startedAt = Date.now();
    let lastError = "";
    while (Date.now() - startedAt < START_TIMEOUT_MS) {
      const spawnError = launchError();
      if (spawnError) throw new BrowserUnavailableError(chromeLaunchErrorMessage(spawnError));
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new BrowserUnavailableError(`Chrome exited before remote debugging became available. ${lastError}`.trim());
      }
      try {
        const endpoint = readChromeDevToolsEndpoint(activePortPath);
        if (endpoint) {
          this.port = endpoint.port;
          this.browserWsUrl = endpoint.webSocketDebuggerUrl;
          const version = await fetchJson<ChromeVersionInfo>(this.browserUrl("/json/version"));
          return {
            ...version,
            webSocketDebuggerUrl: version.webSocketDebuggerUrl ?? endpoint.webSocketDebuggerUrl,
          };
        }
      } catch (error) {
        lastError = errorMessage(error);
      }
      await delay(100);
    }
    throw new BrowserUnavailableError(`Timed out waiting for Chrome remote debugging endpoint. ${lastError}`.trim());
  }

  private async targets(): Promise<ChromeTargetInfo[]> {
    const targets = await fetchJson<ChromeTargetInfo[]>(this.browserUrl("/json"));
    return targets.filter((target) => target.type === "page");
  }

  private async ensureActiveTarget(): Promise<ChromeTargetInfo> {
    const targets = await this.targets();
    const contentTargets = targets.filter(isChromeContentTarget);
    const current = contentTargets.find((target) => target.id === this.activeTargetId) ?? contentTargets.at(-1);
    if (current) {
      this.activeTargetId = current.id;
      this.lastActiveTab = { id: current.id, title: current.title, url: current.url };
      return current;
    }
    await this.createTarget("about:blank");
    const [created] = await this.targets();
    if (!created) throw new Error("Chrome did not create a browser tab.");
    this.activeTargetId = created.id;
    this.lastActiveTab = { id: created.id, title: created.title, url: created.url };
    return created;
  }

  private async createTarget(url: string): Promise<void> {
    const client = await this.connectBrowser();
    try {
      const result = await client.request<{ targetId?: string }>("Target.createTarget", { url });
      if (result.targetId) this.activeTargetId = result.targetId;
      await this.waitForPageReady(undefined, { expectedUrl: url });
    } finally {
      client.close();
    }
  }

  private async closeActiveAboutBlankTarget(): Promise<boolean> {
    const targetId = this.activeTargetId;
    if (!targetId) return false;
    const target = (await this.targets().catch(() => [])).find((candidate) => candidate.id === targetId);
    if (!target || !isAboutBlankUrl(target.url ?? "")) return false;
    const client = await this.connectBrowser();
    try {
      await client.request("Target.closeTarget", { targetId }, 2_000);
    } finally {
      client.close();
    }
    if (this.activeTargetId === targetId) {
      this.activeTargetId = undefined;
      this.lastActiveTab = undefined;
      await this.writeChromeSessionManifest().catch(() => undefined);
    }
    return true;
  }

  private async navigateActiveTarget(url: string): Promise<void> {
    const target = await this.ensureActiveTarget();
    const previousUrl = target.url;
    const client = await this.connectChromeTargetPage(target);
    try {
      await client.request("Page.enable", {});
      const navigation = await client.request<{ errorText?: string }>("Page.navigate", { url });
      if (navigation.errorText && !isNavigationAbortErrorText(navigation.errorText)) throw new Error(`${navigation.errorText} loading '${url}'`);
      await this.waitForPageReady(client, { expectedUrl: url, previousUrl });
    } finally {
      client.close();
    }
  }

  private async waitForPageReady(
    existingClient?: JsonRpcWebSocketClient,
    expectation: { expectedUrl?: string; previousUrl?: string } = {},
  ): Promise<void> {
    const client = existingClient ?? (await this.connectActivePage());
    const shouldClose = !existingClient;
    try {
      const startedAt = Date.now();
      let lastHref: string | undefined;
      while (Date.now() - startedAt < PAGE_READY_TIMEOUT_MS) {
        const pageState = await client
          .request<{ result?: { value?: { readyState?: string; href?: string } } }>("Runtime.evaluate", {
            expression: "({ readyState: document.readyState, href: location.href })",
            returnByValue: true,
          })
          .then((result) => result.result?.value)
          .catch(() => undefined);
        const readyState = pageState?.readyState;
        lastHref = pageState?.href ?? lastHref;
        if (
          (readyState === "complete" || readyState === "interactive") &&
          browserNavigationReachedExpectedUrl(expectation.expectedUrl, pageState?.href, expectation.previousUrl)
        ) {
          return;
        }
        await delay(200);
      }
      if (expectation.expectedUrl && isAboutBlankUrl(lastHref ?? "")) {
        throw new Error(browserNavigationDidNotCommitMessage(normalizeBrowserUrl(expectation.expectedUrl)));
      }
    } finally {
      if (shouldClose) client.close();
    }
  }

  private async evaluatePage<T>(expression: string, timeoutMs = 15_000): Promise<T> {
    const client = await this.connectActivePage();
    try {
      const result = await client.request<{
        exceptionDetails?: { text?: string; exception?: { description?: string } };
        result?: { value?: unknown; description?: string };
      }>(
        "Runtime.evaluate",
        {
          expression,
          awaitPromise: true,
          returnByValue: true,
        },
        timeoutMs,
      );
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Browser evaluation failed.");
      }
      return (result.result?.value ?? result.result?.description ?? null) as T;
    } finally {
      client.close();
    }
  }

  private async detectChromeUserAction(): Promise<BrowserUserActionDetection | undefined> {
    return this.evaluatePage<BrowserUserActionDetection>(browserUserActionDetectionExpression(), 5_000);
  }

  private async getActiveTabSnapshot(): Promise<BrowserTabSnapshot> {
    const target = await this.ensureActiveTarget();
    return { id: target.id, title: target.title, url: target.url };
  }

  private async connectBrowser(): Promise<JsonRpcWebSocketClient> {
    if (!this.browserWsUrl) this.browserWsUrl = (await this.waitForVersion()).webSocketDebuggerUrl;
    if (!this.browserWsUrl) throw new Error("Chrome did not expose a browser CDP endpoint.");
    return JsonRpcWebSocketClient.connect(this.browserWsUrl);
  }

  private async connectActivePage(): Promise<JsonRpcWebSocketClient> {
    const target = await this.ensureActiveTarget();
    if (!target.webSocketDebuggerUrl) throw new Error("Active Chrome tab does not expose a CDP endpoint.");
    return JsonRpcWebSocketClient.connect(target.webSocketDebuggerUrl);
  }

  private async ensureChromeTarget(targetId?: string): Promise<ChromeTargetInfo> {
    if (!targetId) return this.ensureActiveTarget();
    const targets = await this.targets();
    const target = targets.find((candidate) => candidate.id === targetId);
    if (!target) return this.ensureActiveTarget();
    this.activeTargetId = target.id;
    this.lastActiveTab = { id: target.id, title: target.title, url: target.url };
    return target;
  }

  private async connectChromeTargetPage(target: ChromeTargetInfo): Promise<JsonRpcWebSocketClient> {
    if (!target.webSocketDebuggerUrl) throw new Error("Chrome tab does not expose a CDP endpoint.");
    return JsonRpcWebSocketClient.connect(target.webSocketDebuggerUrl);
  }

  private browserUrl(path: string): string {
    if (!this.port) throw new Error("Browser is not running.");
    return `http://127.0.0.1:${this.port}${path}`;
  }

  private async setActiveChromeWindowState(windowState: "normal" | "minimized", targetId = this.activeTargetId): Promise<void> {
    if (!targetId) return;
    const browser = await this.connectBrowser();
    try {
      const windowInfo = await browser.request<{ windowId?: number }>("Browser.getWindowForTarget", { targetId }, 5_000);
      if (typeof windowInfo.windowId !== "number") return;
      await browser.request("Browser.setWindowBounds", { windowId: windowInfo.windowId, bounds: { windowState } }, 5_000);
    } finally {
      browser.close();
    }
  }

  private async setActiveChromeWindowBounds(bounds: ManagedChromeWindowBounds, targetId = this.activeTargetId): Promise<void> {
    if (!targetId) return;
    const browser = await this.connectBrowser();
    try {
      const windowInfo = await browser.request<{ windowId?: number }>("Browser.getWindowForTarget", { targetId }, 5_000);
      if (typeof windowInfo.windowId !== "number") return;
      await browser.request(
        "Browser.setWindowBounds",
        {
          windowId: windowInfo.windowId,
          bounds: {
            windowState: "normal",
            ...bounds,
          },
        },
        5_000,
      );
    } finally {
      browser.close();
    }
  }

  private async revealManagedChromeWindow(input: ManagedChromeRevealInput): Promise<ManagedChromeRevealResult> {
    const activation = await this.activateChromeTarget(input.targetId);
    const foreground = await foregroundManagedChromeWindow(input);
    return {
      cdpActivated: activation.activated,
      foregroundAttempted: foreground.attempted,
      foregroundSucceeded: foreground.succeeded,
      ...(activation.activeTab ? { activeTab: activation.activeTab } : {}),
      ...(foreground.method ? { method: foreground.method } : {}),
      ...(foreground.reason || activation.reason ? { reason: foreground.reason ?? activation.reason } : {}),
      unsupported: foreground.unsupported,
    };
  }

  private async activateChromeTarget(targetId?: string): Promise<{ activated: boolean; activeTab?: BrowserTabSnapshot; reason?: string }> {
    const target = await this.ensureChromeTarget(targetId);
    const activeTab = { id: target.id, title: target.title, url: target.url };
    let activated = false;
    let reason: string | undefined;

    const browser = await this.connectBrowser().catch((error) => {
      reason = errorMessage(error);
      return undefined;
    });
    if (browser) {
      try {
        const windowInfo = await browser.request<{ windowId?: number }>("Browser.getWindowForTarget", { targetId: target.id }, 5_000);
        if (typeof windowInfo.windowId === "number") {
          const revealBounds = this.options.managedChromeRevealBounds?.() ?? managedChromeRevealBoundsForWorkArea({ x: 0, y: 0, width: 1440, height: 900 });
          await browser
            .request("Browser.setWindowBounds", { windowId: windowInfo.windowId, bounds: { windowState: "normal", ...revealBounds } }, 5_000)
            .catch((error) => {
              reason = errorMessage(error);
            });
        }
      } finally {
        browser.close();
      }
    }

    const page = await this.connectChromeTargetPage(target).catch((error) => {
      reason = errorMessage(error);
      return undefined;
    });
    if (page) {
      try {
        await page.request("Page.bringToFront", {}, 5_000);
        activated = true;
      } catch (error) {
        reason = errorMessage(error);
      } finally {
        page.close();
      }
    }

    this.lastActiveTab = activeTab;
    await this.writeChromeSessionManifest().catch(() => undefined);
    return { activated, activeTab, ...(reason ? { reason } : {}) };
  }

  private async captureChromeScreenshotData(): Promise<string> {
    const attempts: Array<{ prepare?: boolean; params: Record<string, unknown> }> = [
      { params: { format: "png", fromSurface: true } },
      { prepare: true, params: { format: "png", fromSurface: false, captureBeyondViewport: false } },
      {
        prepare: true,
        params: {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: false,
          clip: { x: 0, y: 0, width: 1280, height: 720, scale: 1 },
        },
      },
    ];
    let lastError: unknown;
    for (const attempt of attempts) {
      const client = await this.connectActivePage();
      try {
        await client.request("Page.enable", {}, 5_000).catch(() => undefined);
        await client.request("Page.bringToFront", {}, 5_000).catch(() => undefined);
        if (attempt.prepare) {
          await client.request("Page.stopLoading", {}, 2_000).catch(() => undefined);
          await client
            .request("Runtime.evaluate", { expression: "window.stop(); true", returnByValue: true }, 2_000)
            .catch(() => undefined);
          await delay(350);
        }
        const result = await client.request<{ data?: string }>("Page.captureScreenshot", attempt.params, 12_000);
        if (result.data) return result.data;
        lastError = new Error("Chrome did not return screenshot data.");
      } catch (error) {
        lastError = error;
      } finally {
        client.close();
      }
    }
    this.lastError = errorMessage(lastError);
    throw lastError instanceof Error ? lastError : new Error("Chrome screenshot failed.");
  }
}

export class BrowserUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserUnavailableError";
  }
}

export class BrowserUserActionCanceledError extends Error {
  constructor(readonly state: BrowserUserActionState) {
    super(state.message || "Browser user action was canceled.");
    this.name = "BrowserUserActionCanceledError";
  }
}

export class BrowserUserActionTimedOutError extends Error {
  constructor(readonly state: BrowserUserActionState) {
    super(state.message || "Browser user action timed out.");
    this.name = "BrowserUserActionTimedOutError";
  }
}

function browserUserActionWaitingActivity(state: BrowserUserActionState): string {
  const subject = state.kind === "unknown-user-action" ? "browser user action" : `browser ${state.kind}`;
  const provider = state.provider && state.provider !== "unknown" ? ` from ${state.provider}` : "";
  return `Waiting for the user to complete the ${subject}${provider} and click Confirmed.`;
}

class JsonRpcWebSocketClient {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => this.onMessage(String(event.data)));
    socket.addEventListener("close", () => this.rejectAll(new Error("Chrome CDP connection closed.")));
    socket.addEventListener("error", () => this.rejectAll(new Error("Chrome CDP connection failed.")));
  }

  static connect(url: string): Promise<JsonRpcWebSocketClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error("Timed out connecting to Chrome CDP."));
      }, 8_000);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);
          resolve(new JsonRpcWebSocketClient(socket));
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          reject(new Error("Unable to connect to Chrome CDP."));
        },
        { once: true },
      );
    });
  }

  request<T = any>(method: string, params: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome CDP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(payload);
    });
  }

  close(): void {
    this.socket.close();
    this.rejectAll(new Error("Chrome CDP connection closed."));
  }

  private onMessage(raw: string): void {
    let message: any;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      return;
    }
    pending.resolve(message.result ?? {});
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

function childProcessExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForChildProcessExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (childProcessExited(child)) return Promise.resolve(true);
  if (typeof child.once !== "function") return Promise.resolve(true);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => done(false), timeoutMs);
    const handleExit = () => done(true);
    function done(exited = true) {
      clearTimeout(timeout);
      child.off("exit", handleExit);
      child.off("close", handleExit);
      resolve(exited || childProcessExited(child));
    }
    child.once("exit", handleExit);
    child.once("close", handleExit);
  });
}

export function normalizeBrowserUrl(input: string): string {
  const value = input.trim();
  if (!value) throw new Error("URL is required.");
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(value)) return `http://${value}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value}`;
}

export function managedChromeLaunchArgs(runtimeProfilePath: string): string[] {
  return [
    "--remote-debugging-port=0",
    `--user-data-dir=${runtimeProfilePath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-default-apps",
    "--start-minimized",
    `--window-size=${MANAGED_CHROME_WIDTH},${MANAGED_CHROME_HIDDEN_HEIGHT}`,
    "about:blank",
  ];
}

export function managedChromeRevealBoundsForWorkArea(workArea: ManagedChromeWorkArea): ManagedChromeWindowBounds {
  const width = clampManagedChromeDimension(MANAGED_CHROME_WIDTH, workArea.width, MANAGED_CHROME_MIN_WIDTH);
  const height = clampManagedChromeDimension(MANAGED_CHROME_REVEALED_HEIGHT, workArea.height, MANAGED_CHROME_MIN_HEIGHT);
  const left = workArea.x + Math.round((workArea.width - width) / 2);
  const centeredTop = workArea.y + Math.round((workArea.height - height) / 2);
  const preferredTop = workArea.y + MANAGED_CHROME_REVEAL_MARGIN;
  const maxTop = workArea.y + Math.max(0, Math.round(workArea.height) - height);
  const top = Math.min(maxTop, Math.max(workArea.y, Math.max(preferredTop, centeredTop)));
  return { left, top, width, height };
}

function clampManagedChromeDimension(preferred: number, available: number, minimum: number): number {
  if (!Number.isFinite(available) || available <= 0) return preferred;
  const insetAvailable = Math.max(0, Math.round(available) - MANAGED_CHROME_REVEAL_MARGIN * 2);
  if (insetAvailable >= minimum) return Math.min(preferred, insetAvailable);
  return Math.min(preferred, Math.round(available));
}

export function assertBrowserNavigationReachedRequestedPage(requestedUrl: string, content: BrowserPageContent): BrowserPageContent {
  const requested = normalizeBrowserUrl(requestedUrl);
  const finalUrl = (content.url ?? "").trim();
  if (isAboutBlankUrl(finalUrl) && !isAboutBlankUrl(requested)) {
    throw new Error(browserNavigationDidNotCommitMessage(requested));
  }
  return content;
}

export function assertBrowserScreenshotTargetLoaded(activeTab: Pick<BrowserTabSnapshot, "url"> | undefined): void {
  const url = activeTab?.url?.trim() ?? "";
  if (url && !isAboutBlankUrl(url)) return;
  throw new Error(
    [
      "Browser screenshot refused: the active browser target is about:blank.",
      "Reopen the intended page with browser_local_preview or browser_nav before capturing visual evidence.",
      "Ambient will not write an about:blank screenshot artifact.",
    ].join(" "),
  );
}

function isAboutBlankUrl(value: string): boolean {
  return value.trim().toLowerCase() === "about:blank";
}

export function browserNavigationReachedExpectedUrl(
  requestedUrl: string | undefined,
  currentUrl: string | undefined,
  previousUrl?: string,
): boolean {
  if (!requestedUrl) return true;
  const requested = normalizeBrowserUrl(requestedUrl);
  const current = (currentUrl ?? "").trim();
  if (isAboutBlankUrl(requested)) return isAboutBlankUrl(current);
  if (!current || isAboutBlankUrl(current)) return false;
  if (urlsEquivalentForBrowserNavigation(requested, current)) return true;
  if (previousUrl && urlsEquivalentForBrowserNavigation(previousUrl, current)) return false;
  return hasBrowserNavigationCommittedAwayFromBlank(requested, current);
}

function browserNavigationDidNotCommitMessage(requested: string): string {
  if (isWorkspaceLocalFileUrl(requested)) {
    return `Browser navigation to ${requested} ended at about:blank; the requested page did not load. For local workspace HTML/static app files, use browser_local_preview instead of file:// navigation.`;
  }
  if (isLocalBrowserHttpUrl(requested)) {
    return `Browser navigation to ${requested} ended at about:blank; the local server navigation did not commit. Check that the dev server is reachable and retry browser_nav.`;
  }
  return `Browser navigation to ${requested} ended at about:blank; the external browser navigation did not commit. This usually indicates a browser profile, CDP, or navigation timing issue.`;
}

function hasBrowserNavigationCommittedAwayFromBlank(requested: string, current: string): boolean {
  try {
    const requestedUrl = new URL(requested);
    const currentParsed = new URL(current);
    if (isLocalBrowserHttpUrl(requested)) return currentParsed.origin === requestedUrl.origin;
    return currentParsed.protocol === "http:" || currentParsed.protocol === "https:";
  } catch {
    return current === requested;
  }
}

function urlsEquivalentForBrowserNavigation(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    if (leftUrl.href === rightUrl.href) return true;
    if (leftUrl.origin !== rightUrl.origin) return false;
    return normalizeBrowserPathForComparison(leftUrl) === normalizeBrowserPathForComparison(rightUrl);
  } catch {
    return left.trim() === right.trim();
  }
}

function normalizeBrowserPathForComparison(url: URL): string {
  const path = url.pathname === "" ? "/" : url.pathname;
  return `${path.replace(/\/+$/, "") || "/"}${url.search}${url.hash}`;
}

function isWorkspaceLocalFileUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "file:";
  } catch {
    return false;
  }
}

function isLocalBrowserHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && isLocalBrowserHostname(url.hostname);
  } catch {
    return false;
  }
}

export async function assertLocalBrowserNavigationReachable(value: string, timeoutMs = LOCAL_BROWSER_NAVIGATION_PREFLIGHT_TIMEOUT_MS): Promise<void> {
  if (!isLocalBrowserHttpUrl(value)) return;
  if (new URL(value).protocol === "https:") return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(value, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.body) await response.body.cancel().catch(() => undefined);
  } catch (error) {
    throw new Error(`Local browser target ${value} is not reachable before browser navigation. Start or repair the local server, then retry browser_nav. ${errorMessage(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

function isLocalBrowserHostname(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value === "[::1]";
}

function browserArtifactWorkspacePath(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = (input as { artifactWorkspacePath?: unknown }).artifactWorkspacePath;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeBrowserLoginOrigin(input: string): string {
  const url = new URL(normalizeBrowserUrl(input));
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Browser login origin must use http or https.");
  return url.origin;
}

function normalizeBrowserLoginRequest(input: BrowserLoginRequest): BrowserLoginRequest {
  const expectedOrigin = normalizeBrowserLoginOrigin(input.expectedOrigin);
  const credentialOrigin = normalizeBrowserLoginOrigin(input.credential.origin);
  return {
    ...input,
    expectedOrigin,
    credential: { ...input.credential, origin: credentialOrigin },
    submit: input.submit !== false,
  };
}

function assertLoginOrigin(expectedOrigin: string, credentialOrigin: string, currentUrl: string | undefined): void {
  const expected = normalizeBrowserLoginOrigin(expectedOrigin);
  const credential = normalizeBrowserLoginOrigin(credentialOrigin);
  if (expected !== credential) {
    throw new Error(`Stored credential origin ${credential} does not match requested login origin ${expected}.`);
  }
  if (!currentUrl) throw new Error("Browser login requires an active page.");
  const current = new URL(currentUrl);
  if (current.protocol !== "http:" && current.protocol !== "https:") {
    throw new Error(`Browser login requires an http(s) page. Current page: ${currentUrl}`);
  }
  if (current.origin !== expected) {
    throw new Error(`Browser login origin mismatch. Expected ${expected}, current page is ${current.origin}.`);
  }
}

function normalizeBrowserLoginResult(result: Partial<BrowserLoginResult>, input: BrowserLoginRequest): BrowserLoginResult {
  const status =
    result.status === "needs-user-action" || result.status === "submitted" || result.status === "filled"
      ? result.status
      : input.submit === false
        ? "filled"
        : "submitted";
  return {
    status,
    credentialId: input.credential.id,
    credentialLabel: input.credential.label,
    origin: input.expectedOrigin,
    username: input.credential.username,
    url: typeof result.url === "string" ? result.url : undefined,
    title: typeof result.title === "string" ? result.title : undefined,
    submitted: result.submitted === true,
    userActionRequired: result.userActionRequired === true || status === "needs-user-action",
    message:
      typeof result.message === "string"
        ? result.message
        : status === "needs-user-action"
          ? "Credential filled; user action appears required."
          : status === "submitted"
            ? "Credential filled and submit was attempted."
            : "Credential filled without submitting.",
  };
}

export function browserRuntimeForRequest(
  profileMode: BrowserProfileMode = DEFAULT_PROFILE_MODE,
  requestedRuntime?: BrowserRuntimeKind,
  internalAvailable = false,
): BrowserRuntimeKind {
  if (profileMode === "copied") return "chrome";
  if (requestedRuntime === "chrome") return "chrome";
  if (requestedRuntime === "internal" && internalAvailable) return "internal";
  return internalAvailable ? "internal" : "chrome";
}

function normalizeStartInput(input: BrowserProfileMode | BrowserStartInput | undefined): BrowserStartInput {
  if (!input) return {};
  return typeof input === "string" ? { profileMode: input } : input;
}

export function chromeProfileSourcePath(platform = process.platform, home = homedir()): string | undefined {
  if (process.env.AMBIENT_BROWSER_CHROME_PROFILE) return process.env.AMBIENT_BROWSER_CHROME_PROFILE;
  if (platform === "darwin") return join(home, "Library", "Application Support", "Google", "Chrome");
  if (platform === "linux") return join(home, ".config", "google-chrome");
  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    return localAppData ? join(localAppData, "Google", "Chrome", "User Data") : undefined;
  }
  return undefined;
}

function copiedChromeProfileState(paths: BrowserPaths): {
  available: boolean;
  sourceProfilePath?: string;
  copiedAt?: string;
} {
  if (!existsSync(paths.copiedProfile)) return { available: false };
  const metadata = readCopiedChromeProfileMetadata(paths.copiedProfileMetadata);
  if (metadata) {
    return {
      available: true,
      sourceProfilePath: metadata.sourceProfilePath,
      copiedAt: metadata.copiedAt,
    };
  }
  try {
    return {
      available: true,
      copiedAt: statSync(paths.copiedProfile).mtime.toISOString(),
    };
  } catch {
    return { available: true };
  }
}

function readCopiedChromeProfileMetadata(path: string): CopiedChromeProfileMetadata | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CopiedChromeProfileMetadata>;
    if (typeof parsed.sourceProfilePath !== "string" || typeof parsed.copiedAt !== "string") return undefined;
    return {
      sourceProfilePath: parsed.sourceProfilePath,
      copiedProfilePath: typeof parsed.copiedProfilePath === "string" ? parsed.copiedProfilePath : "",
      copiedAt: parsed.copiedAt,
    };
  } catch {
    return undefined;
  }
}

export function shouldCopyChromeProfilePath(sourceRoot: string, sourcePath: string): boolean {
  const relativePath = relative(sourceRoot, sourcePath);
  if (!relativePath) return true;
  const parts = relativePath.split(/[\\/]/).filter(Boolean);
  if (parts.some((part) => part.startsWith("Singleton") || excludedChromeProfileParts.has(part))) return false;
  return true;
}

export function buildBrowserPickExpression(prompt: string): string {
  return `(${browserPickFunction.toString()})(${JSON.stringify(prompt)}, ${MAX_PICK_TEXT}, ${MAX_PICK_HTML})`;
}

export function cancelBrowserPickExpression(): string {
  return `(() => {
    const pickerWindow = window;
    if (typeof pickerWindow.__ambientBrowserPickerCancel === "function") {
      pickerWindow.__ambientBrowserPickerCancel();
      return true;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return false;
  })()`;
}

export function browserLoginExpression(input: BrowserLoginRequest): string {
  return `(${browserLoginFunction.toString()})(${JSON.stringify({
    username: input.credential.username,
    password: input.credential.password,
    usernameSelector: input.usernameSelector,
    passwordSelector: input.passwordSelector,
    submitSelector: input.submitSelector,
    submit: input.submit !== false,
  })})`;
}

function browserLoginFunction(input: {
  username: string;
  password: string;
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  submit: boolean;
}): Partial<BrowserLoginResult> {
  const visible = (element: Element | null): element is HTMLElement => {
    if (!element || !(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const one = (selector: string, label: string): HTMLElement => {
    const matches = Array.from(document.querySelectorAll(selector)).filter(visible);
    if (matches.length === 0) throw new Error(`No visible ${label} matched selector: ${selector}`);
    if (matches.length > 1) throw new Error(`Multiple visible ${label} elements matched selector: ${selector}`);
    return matches[0];
  };
  const candidates = (selectors: string[]): HTMLElement | undefined => {
    for (const selector of selectors) {
      const match = Array.from(document.querySelectorAll(selector)).find(visible);
      if (match) return match;
    }
    return undefined;
  };
  const disabled = (element: HTMLElement): boolean => {
    if ((element as HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement).disabled) return true;
    return element.getAttribute("aria-disabled") === "true";
  };
  const submitLike = (element: HTMLElement): boolean => {
    if (element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement) return true;
    if (element instanceof HTMLInputElement) {
      const type = (element.getAttribute("type") || "submit").toLowerCase();
      return type === "submit" || type === "button" || type === "image";
    }
    return element.getAttribute("role") === "button";
  };
  const usernameField =
    input.usernameSelector
      ? one(input.usernameSelector, "username field")
      : candidates([
          "input[autocomplete='username']",
          "input[type='email']",
          "input[name*='email' i]",
          "input[id*='email' i]",
          "input[name*='user' i]",
          "input[id*='user' i]",
          "input[type='text']",
          "input:not([type])",
        ]);
  const passwordField =
    input.passwordSelector
      ? one(input.passwordSelector, "password field")
      : candidates(["input[type='password']", "input[autocomplete='current-password']"]);
  if (!passwordField) throw new Error("No visible password field was found on the active page.");
  const passwordInput = passwordField as HTMLInputElement;
  if ((passwordInput.getAttribute("type") || "").toLowerCase() !== "password") {
    throw new Error("Refusing to fill a stored password into a non-password field.");
  }
  const setValue = (element: HTMLElement | undefined, value: string) => {
    if (!element) return false;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      throw new Error("Credential target is not an input field.");
    }
    if (disabled(element)) throw new Error("Refusing to fill a stored credential into a disabled input field.");
    element.focus();
    element.value = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "" }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };
  const usernameFilled = setValue(usernameField, input.username);
  const passwordFilled = setValue(passwordInput, input.password);
  let submitted = false;
  if (input.submit) {
    const submitTarget = input.submitSelector
      ? one(input.submitSelector, "submit control")
      : candidates([
          "button[type='submit']",
          "input[type='submit']",
          "button[name*='login' i]",
          "button[id*='login' i]",
          "button",
        ]);
    if (submitTarget) {
      if (disabled(submitTarget)) throw new Error("Refusing to click a disabled submit control.");
      if (!submitLike(submitTarget)) throw new Error("Submit selector must match a button, submit input, link, or role=button element.");
      submitTarget.click();
      submitted = true;
    } else if (passwordInput.form) {
      passwordInput.form.requestSubmit();
      submitted = true;
    }
  }
  const pageText = String(document.body?.innerText || "").toLowerCase();
  const userActionRequired = /\b(mfa|2fa|two-factor|two factor|captcha|passkey|security key|verification code|one-time code|otp)\b/.test(
    pageText,
  );
  return {
    url: location.href,
    title: document.title || "",
    submitted,
    userActionRequired,
    status: userActionRequired ? "needs-user-action" : submitted ? "submitted" : "filled",
    message: userActionRequired
      ? "Credential filled; user action appears required."
      : submitted
        ? "Credential filled and submit was attempted."
        : "Credential filled without submitting.",
    usernameFilled,
    passwordFilled,
  } as Partial<BrowserLoginResult> & { usernameFilled: boolean; passwordFilled: boolean };
}

function browserPickFunction(message: string, maxText: number, maxHtml: number): Promise<BrowserPickSelection[] | null> {
  const pickerWindow = window as Window & { __ambientBrowserPickerCancel?: () => void };
  const cssEscape = (value: string): string => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const cssPath = (element: Element): string => {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      const tag = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const siblings = [...parent.children].filter((sibling) => sibling.tagName === current!.tagName);
      const index = siblings.indexOf(current) + 1;
      parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
      current = parent;
    }
    return parts.join(" > ");
  };
  const selectorCandidates = (element: Element): string[] => {
    const candidates: string[] = [];
    const htmlElement = element as HTMLElement;
    const testId = htmlElement.getAttribute("data-testid") || htmlElement.getAttribute("data-test");
    if (testId) candidates.push(`[data-testid="${cssEscape(testId)}"]`);
    if (htmlElement.id) candidates.push(`#${cssEscape(htmlElement.id)}`);
    const name = htmlElement.getAttribute("name");
    if (name) candidates.push(`${element.tagName.toLowerCase()}[name="${cssEscape(name)}"]`);
    const aria = htmlElement.getAttribute("aria-label");
    if (aria) candidates.push(`${element.tagName.toLowerCase()}[aria-label="${cssEscape(aria)}"]`);
    candidates.push(cssPath(element));
    return [...new Set(candidates)].filter(Boolean).slice(0, 5);
  };
  const buildElementInfo = (element: Element): BrowserPickSelection => {
    const htmlElement = element as HTMLElement;
    const rect = htmlElement.getBoundingClientRect();
    const candidates = selectorCandidates(element);
    return {
      selector: candidates[0],
      candidates,
      tagName: element.tagName.toLowerCase(),
      id: htmlElement.id || null,
      className: typeof htmlElement.className === "string" ? htmlElement.className || null : null,
      text: htmlElement.textContent?.trim().replace(/\s+/g, " ").slice(0, maxText) || null,
      html: htmlElement.outerHTML.slice(0, maxHtml),
      boundingBox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  };

  return new Promise((resolve) => {
    pickerWindow.__ambientBrowserPickerCancel?.();
    const existing = document.querySelector("[data-ambient-browser-picker]");
    existing?.remove();
    const selectedElements = new Set<Element>();
    const selections: BrowserPickSelection[] = [];
    let finished = false;
    const overlay = document.createElement("div");
    overlay.dataset.ambientBrowserPicker = "true";
    overlay.setAttribute("role", "region");
    overlay.setAttribute("aria-label", "Ambient browser picker");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    const highlight = document.createElement("div");
    highlight.style.cssText =
      "position:absolute;border:2px solid #2e8ca7;background:rgba(46,140,167,0.12);pointer-events:none;transition:all 0.08s";
    const banner = document.createElement("div");
    banner.style.cssText =
      "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;pointer-events:auto;background:#172027;color:white;border-radius:8px;padding:10px 14px;font:13px system-ui,-apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 12px 36px rgba(0,0,0,0.28);max-width:min(680px,calc(100vw - 40px));";
    overlay.append(highlight, banner);
    document.body.append(overlay);

    const updateBanner = () => {
      banner.textContent = `${message} (${selections.length} selected, Cmd/Ctrl+click to add, Enter to finish, Esc to cancel)`;
    };
    const cleanup = () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      if (pickerWindow.__ambientBrowserPickerCancel === cancelPicker) delete pickerWindow.__ambientBrowserPickerCancel;
      selectedElements.forEach((element) => {
        (element as HTMLElement).style.outline = "";
      });
      overlay.remove();
    };
    const finish = (value: BrowserPickSelection[] | null) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(value);
    };
    const cancelPicker = () => finish(null);
    const elementAt = (event: MouseEvent): Element | null => {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      if (!element || overlay.contains(element) || banner.contains(element)) return null;
      return element;
    };
    const onMove = (event: MouseEvent) => {
      const element = elementAt(event);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      highlight.style.left = `${rect.left}px`;
      highlight.style.top = `${rect.top}px`;
      highlight.style.width = `${rect.width}px`;
      highlight.style.height = `${rect.height}px`;
    };
    const onClick = (event: MouseEvent) => {
      const element = elementAt(event);
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      const info = buildElementInfo(element);
      if (event.metaKey || event.ctrlKey) {
        if (!selectedElements.has(element)) {
          selectedElements.add(element);
          (element as HTMLElement).style.outline = "3px solid #2e8ca7";
          selections.push(info);
          updateBanner();
        }
        return;
      }
      finish(selections.length > 0 ? selections : [info]);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
      if (event.key === "Enter" && selections.length > 0) {
        event.preventDefault();
        finish(selections);
      }
    };

    updateBanner();
    pickerWindow.__ambientBrowserPickerCancel = cancelPicker;
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  });
}

export function chromeExecutable(platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = homedir()): string | undefined {
  return chromeAvailability(platform, env, home).executable;
}

export function chromeAvailability(platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = homedir()): ChromeAvailability {
  const configured = env.AMBIENT_BROWSER_CHROME_PATH;
  if (configured) {
    if (isExecutableFile(configured)) return { available: true, executable: configured };
    return {
      available: false,
      unavailableReason: `Configured Chrome path is not an executable file: ${configured}`,
    };
  }
  if (platform === "darwin") {
    const executable = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      join(home, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ].find(isExecutableFile);
    return executable ? { available: true, executable } : { available: false, unavailableReason: defaultChromeUnavailableReason() };
  }
  if (platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter((value): value is string => Boolean(value));
    const executable = roots
      .map((root) => join(root, "Google", "Chrome", "Application", "chrome.exe"))
      .find(isExecutableFile);
    return executable ? { available: true, executable } : { available: false, unavailableReason: defaultChromeUnavailableReason() };
  }
  const executable = findExecutableOnPath(["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"], env.PATH);
  return executable ? { available: true, executable } : { available: false, unavailableReason: defaultChromeUnavailableReason() };
}

function defaultChromeUnavailableReason(): string {
  return "Google Chrome or Chromium was not found. Install Chrome/Chromium or set AMBIENT_BROWSER_CHROME_PATH to a Chrome executable.";
}

function chromeLaunchErrorMessage(error: Error): string {
  return `Chrome failed to launch: ${error.message}`;
}

interface ForegroundResult {
  attempted: boolean;
  succeeded: boolean;
  method?: string;
  reason?: string;
  unsupported?: boolean;
}

async function foregroundManagedChromeWindow(input: ManagedChromeRevealInput): Promise<ForegroundResult> {
  if (input.platform === "darwin") return foregroundManagedChromeOnMac(input);
  if (input.platform === "win32") return foregroundManagedChromeOnWindows(input.processId);
  if (input.platform === "linux") return foregroundManagedChromeOnLinux(input.processId);
  return {
    attempted: false,
    succeeded: false,
    unsupported: true,
    reason: `Foregrounding managed Chrome is not implemented on ${input.platform}.`,
  };
}

async function foregroundManagedChromeOnMac(input: ManagedChromeRevealInput): Promise<ForegroundResult> {
  const pid = Number.isInteger(input.processId) && input.processId! > 0 ? String(input.processId) : undefined;
  const names = uniqueStrings([chromeAppNameFromExecutable(input.executable), "Google Chrome", "Chromium"]);
  let lastReason = "";
  for (const name of names) {
    const script = [
      `tell application ${JSON.stringify(name)}`,
      "  activate",
      "  reopen",
      "  if (count windows) > 0 then set index of window 1 to 1",
      "end tell",
      ...(pid
        ? [
            "try",
            'tell application "System Events"',
            `  set matches to every process whose unix id is ${pid}`,
            "  if (count matches) > 0 then set frontmost of item 1 of matches to true",
            "end tell",
            "end try",
          ]
        : []),
    ].join("\n");
    const result = await runExternalCommand("osascript", ["-e", script], 3_000);
    if (result.ok) return { attempted: true, succeeded: true, method: pid ? `osascript:${name}:pid` : `osascript:${name}` };
    lastReason = result.error ?? result.stderr ?? `osascript exited with ${result.code ?? "unknown"}`;
  }
  return {
    attempted: true,
    succeeded: false,
    reason: lastReason || "macOS did not activate Chrome.",
  };
}

async function foregroundManagedChromeOnWindows(processId: number | undefined): Promise<ForegroundResult> {
  const pidValue = Number.isInteger(processId) && processId! > 0 ? String(processId) : "0";
  const script = `
$pidValue = ${pidValue}
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class AmbientWindowFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@
$handles = @()
if ($pidValue -gt 0) {
  $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
  if ($process -and $process.MainWindowHandle -ne 0) { $handles += $process.MainWindowHandle }
}
if ($handles.Count -eq 0) {
  $handles += Get-Process chrome,chromium,msedge -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    ForEach-Object { $_.MainWindowHandle }
}
foreach ($handle in $handles) {
  [AmbientWindowFocus]::ShowWindowAsync($handle, 9) | Out-Null
  Start-Sleep -Milliseconds 50
  if ([AmbientWindowFocus]::SetForegroundWindow($handle)) { exit 0 }
}
exit 1
`.trim();
  const result = await runExternalCommand("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], 4_000);
  return result.ok
    ? { attempted: true, succeeded: true, method: "powershell:SetForegroundWindow" }
    : {
        attempted: true,
        succeeded: false,
        reason: result.error ?? result.stderr ?? `PowerShell exited with ${result.code ?? "unknown"}`,
      };
}

async function foregroundManagedChromeOnLinux(processId: number | undefined): Promise<ForegroundResult> {
  const attempts: Array<{ command: string; args: string[]; method: string }> = [];
  if (Number.isInteger(processId) && processId! > 0) {
    attempts.push({
      command: "xdotool",
      args: ["search", "--pid", String(processId), "windowactivate", "%@"],
      method: "xdotool:pid",
    });
  }
  for (const windowClass of ["google-chrome.Google-chrome", "chromium.Chromium", "chromium-browser.Chromium-browser", "Google-chrome"]) {
    attempts.push({ command: "wmctrl", args: ["-x", "-a", windowClass], method: `wmctrl:${windowClass}` });
  }

  let sawMissingTool = false;
  let lastReason = "";
  for (const attempt of attempts) {
    const result = await runExternalCommand(attempt.command, attempt.args, 3_000);
    if (result.ok) return { attempted: true, succeeded: true, method: attempt.method };
    if (result.notFound) sawMissingTool = true;
    lastReason = result.error ?? result.stderr ?? `${attempt.command} exited with ${result.code ?? "unknown"}`;
  }

  const wayland = process.env.XDG_SESSION_TYPE?.toLowerCase() === "wayland";
  return {
    attempted: attempts.length > 0,
    succeeded: false,
    unsupported: wayland || sawMissingTool,
    reason: wayland
      ? "Wayland commonly blocks apps from forcing another app to the foreground."
      : lastReason || "Linux window activation requires xdotool or wmctrl.",
  };
}

export function chromeAppNameFromExecutable(executable: string | undefined): string | undefined {
  if (!executable) return undefined;
  const segments = executable.split(/[\\/]+/);
  const appSegment = [...segments].reverse().find((segment) => segment.endsWith(".app"));
  if (appSegment) return appSegment.slice(0, -".app".length);
  const base = (segments.at(-1) ?? basename(executable)).toLowerCase();
  if (base === "chrome.exe" || base === "google-chrome" || base === "google-chrome-stable") return "Google Chrome";
  if (base === "chromium" || base === "chromium-browser") return "Chromium";
  return undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function isChromeContentTarget(target: ChromeTargetInfo): boolean {
  const url = target.url ?? "";
  if (!url) return true;
  return !/^(?:chrome|devtools|chrome-untrusted):\/\//i.test(url);
}

interface ExternalCommandResult {
  ok: boolean;
  code?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
  notFound?: boolean;
}

function runExternalCommand(command: string, args: string[], timeoutMs: number): Promise<ExternalCommandResult> {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const finish = (result: ExternalCommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        ...result,
        stdout: stdout.slice(0, 1_000),
        stderr: stderr.slice(0, 1_000),
      });
    };
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      finish({ ok: false, error: error.message, notFound: error.code === "ENOENT" });
    });
    child.once("exit", (code) => {
      finish({ ok: code === 0 && !timedOut, code, error: timedOut ? `${command} timed out.` : undefined });
    });
  });
}

function findExecutableOnPath(names: string[], pathValue: string | undefined): string | undefined {
  const paths = (pathValue || "")
    .split(process.platform === "win32" ? ";" : ":")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const directory of paths) {
    for (const name of names) {
      const candidate = join(directory, name);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return undefined;
}

function isExecutableFile(path: string): boolean {
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return false;
    if (process.platform === "win32") return true;
    return (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

export function parseChromeDevToolsEndpoint(raw: string): ChromeDevToolsEndpoint | undefined {
  const [portLine, pathLine] = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const port = Number(portLine);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) return undefined;
  const browserPath = pathLine?.startsWith("/") ? pathLine : undefined;
  if (!browserPath) return undefined;
  return {
    port,
    webSocketDebuggerUrl: `ws://127.0.0.1:${port}${browserPath}`,
  };
}

function readChromeDevToolsEndpoint(path: string): ChromeDevToolsEndpoint | undefined {
  if (!existsSync(path)) return undefined;
  return parseChromeDevToolsEndpoint(readFileSync(path, "utf8"));
}

export function browserUserActionDetectionExpression(): string {
  return `(${browserUserActionDetectionFunction.toString()})()`;
}

function browserUserActionDetectionFunction(): BrowserUserActionDetection {
  const clean = (value: unknown): string => String(value || "").replace(/\s+/g, " ").trim();
  const text = clean(document.body?.innerText || "").slice(0, 20_000);
  const pageExcerpt = text.slice(0, 1_200);
  const lowerText = text.toLowerCase();
  const title = document.title || "";
  const lowerTitle = title.toLowerCase();
  const pageText = `${lowerTitle} ${lowerText}`;
  const url = location.href;
  const origin = location.origin;
  const visible = (element: Element): boolean => {
    const rect = (element as HTMLElement).getBoundingClientRect?.();
    const style = window.getComputedStyle?.(element);
    if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) return false;
    if (element.getAttribute?.("aria-hidden") === "true") return false;
    if (rect && (rect.width <= 0 || rect.height <= 0)) return false;
    return true;
  };
  const visibleSelectors = (query: string): boolean => Array.from(document.querySelectorAll(query)).some((element) => visible(element));
  const scriptsAndFrames = Array.from(document.querySelectorAll("script[src], iframe[src]"))
    .map((element) => (element as HTMLScriptElement | HTMLIFrameElement).src || "")
    .join("\n")
    .toLowerCase();
  const explicitCaptchaText =
    /\b(unusual traffic|automated queries|not a robot|verify that you are human|prove your humanity|prove you are human|prove you're human|confirm you are human|confirm you're human|human verification|complete the captcha|solve the captcha)\b/i.test(
      pageText,
    );
  const hasRecaptchaWidget = visibleSelectors(".g-recaptcha, iframe[src*='recaptcha'], [data-sitekey][data-callback]");
  const hasHcaptchaWidget = visibleSelectors(".h-captcha, iframe[src*='hcaptcha']");
  const hasTurnstileWidget = visibleSelectors(".cf-turnstile, iframe[src*='challenges.cloudflare.com']");
  const hasRecaptcha = hasRecaptchaWidget || (/recaptcha|g-recaptcha/.test(scriptsAndFrames) && explicitCaptchaText);
  const hasHcaptcha = hasHcaptchaWidget || (/hcaptcha/.test(scriptsAndFrames) && explicitCaptchaText);
  const hasTurnstile = hasTurnstileWidget || (/turnstile|challenges.cloudflare.com/.test(scriptsAndFrames) && explicitCaptchaText);

  if (/^https:\/\/(?:www\.|ipv4\.)?google\.[^/]+\/sorry(?:\/|$)/i.test(url)) {
    return {
      detected: true,
      kind: "captcha",
      provider: "google",
      url,
      title,
      origin,
      pageExcerpt,
      message: "Google is asking for a CAPTCHA or unusual-traffic verification. Complete it in the browser, then continue.",
    };
  }

  if (hasRecaptcha) {
    return {
      detected: true,
      kind: "captcha",
      provider: "recaptcha",
      url,
      title,
      origin,
      pageExcerpt,
      message: "The page is asking for a reCAPTCHA verification. Complete it in the browser, then continue.",
    };
  }

  if (hasHcaptcha) {
    return {
      detected: true,
      kind: "captcha",
      provider: "hcaptcha",
      url,
      title,
      origin,
      pageExcerpt,
      message: "The page is asking for an hCaptcha verification. Complete it in the browser, then continue.",
    };
  }

  if (
    hasTurnstile ||
    /\b(checking your browser|verify you are human|cf-browser-verification|please wait while we verify|needs to review the security of your connection)\b/i.test(pageText)
  ) {
    return {
      detected: true,
      kind: hasTurnstile ? "captcha" : "bot-check",
      provider: hasTurnstile ? "turnstile" : "cloudflare",
      url,
      title,
      origin,
      pageExcerpt,
      message: "The page is asking for browser or human verification. Complete it in the browser, then continue.",
    };
  }

  if (explicitCaptchaText) {
    return {
      detected: true,
      kind: "captcha",
      provider: "unknown",
      url,
      title,
      origin,
      pageExcerpt,
      message: "The page appears to require a CAPTCHA or human verification. Complete it in the browser, then continue.",
    };
  }

  if (/\b(two-factor|two factor|2fa|mfa|verification code|one-time code|otp|security key|passkey)\b/i.test(pageText)) {
    return {
      detected: true,
      kind: "mfa",
      provider: "unknown",
      url,
      title,
      origin,
      pageExcerpt,
      message: "The page appears to require MFA or another user verification step. Complete it in the browser, then continue.",
    };
  }

  return { detected: false, url, title, origin };
}

export function normalizeBrowserUserActionDetection(raw: unknown): BrowserUserActionDetection | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  if (record.detected !== true) return undefined;
  const kind = browserUserActionKind(record.kind);
  const provider = browserUserActionProvider(record.provider);
  const url = typeof record.url === "string" ? record.url : undefined;
  return {
    detected: true,
    kind,
    provider,
    ...(url ? { url } : {}),
    ...(typeof record.title === "string" ? { title: record.title.slice(0, 220) } : {}),
    ...(typeof record.origin === "string" ? { origin: record.origin } : originFromUrl(url)),
    ...(typeof record.pageExcerpt === "string" && record.pageExcerpt.trim()
      ? { pageExcerpt: record.pageExcerpt.replace(/\s+/g, " ").trim().slice(0, 1_200) }
      : {}),
    message:
      typeof record.message === "string" && record.message.trim()
        ? record.message.slice(0, 400)
        : "Browser needs user action before Ambient can continue.",
  };
}

function browserUserActionKind(value: unknown): BrowserUserActionKind {
  return value === "captcha" ||
    value === "mfa" ||
    value === "login" ||
    value === "bot-check" ||
    value === "consent" ||
    value === "unknown-user-action"
    ? value
    : "unknown-user-action";
}

function browserUserActionProvider(value: unknown): BrowserUserActionProvider {
  return value === "google" ||
    value === "cloudflare" ||
    value === "hcaptcha" ||
    value === "recaptcha" ||
    value === "turnstile" ||
    value === "unknown"
    ? value
    : "unknown";
}

function originFromUrl(url: string | undefined): { origin?: string } {
  if (!url) return {};
  try {
    return { origin: new URL(url).origin };
  } catch {
    return {};
  }
}

function isSubpath(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return Boolean(relativePath && !relativePath.startsWith("..") && !relativePath.startsWith("/") && !relativePath.startsWith("\\"));
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function contentExpression(maxText: number): string {
  void maxText;
  return `(() => {
    const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    return {
      title: document.title || "",
      url: location.href,
      text: document.body?.innerText || "",
      links: Array.from(document.querySelectorAll("a[href]")).map((anchor) => ({
        text: clean(anchor.textContent).slice(0, 160),
        url: anchor.href,
      })).filter((link) => link.url && link.text).slice(0, 30),
    };
  })()`;
}

export function searchExpression(limit: number): string {
  return `(() => {
    const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const seen = new Set();
    const blockedHost = (url) => {
      try {
        const host = new URL(url).hostname;
        return host.includes("google.") || host === "webcache.googleusercontent.com";
      } catch {
        return true;
      }
    };
    return Array.from(document.querySelectorAll("a[href]")).map((anchor) => {
      const title = clean(anchor.textContent);
      const url = anchor.href;
      const container = anchor.closest("div");
      const snippet = clean(container?.textContent || "").slice(title.length, title.length + 280).trim();
      return { title, url, snippet };
    }).filter((item) => {
      if (!item.title || !item.url || blockedHost(item.url) || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    }).slice(0, ${limit});
  })()`;
}

export function userCodeExpression(code: string): string {
  return `(() => {
    const code = ${JSON.stringify(code)};
    const AsyncFunction = (async function () {}).constructor;
    const statementLike = /(^|[\\s;])(?:return|const|let|var|for|while|if|switch|try|throw)\\b|;/.test(code);
    if (statementLike) return new AsyncFunction(code)();
    try {
      return new AsyncFunction(\`return (\${code})\`)();
    } catch (expressionError) {
      if (!(expressionError instanceof SyntaxError)) throw expressionError;
      return new AsyncFunction(code)();
    }
  })()`;
}

export function normalizePageContent(content: BrowserPageContent): BrowserPageContent {
  return {
    title: content.title,
    url: content.url,
    text: String(content.text ?? ""),
    links: Array.isArray(content.links)
      ? content.links
          .filter((link) => link && typeof link.url === "string" && typeof link.text === "string")
          .slice(0, 30)
      : [],
  };
}

export function normalizeSearchResults(results: BrowserSearchResult[]): BrowserSearchResult[] {
  if (!Array.isArray(results)) return [];
  return results
    .filter((item) => item && typeof item.title === "string" && typeof item.url === "string")
    .map((item) => ({
      title: item.title.slice(0, 220),
      url: item.url,
      ...(item.snippet ? { snippet: item.snippet.slice(0, 400) } : {}),
      ...(item.content ? { content: item.content.slice(0, 4_000) } : {}),
    }));
}

export function normalizePickSelection(selection: BrowserPickSelection): BrowserPickSelection | undefined {
  if (!selection || typeof selection !== "object" || typeof selection.tagName !== "string") return undefined;
  const candidates = Array.isArray(selection.candidates)
    ? selection.candidates.filter((candidate) => typeof candidate === "string").slice(0, 5)
    : [];
  const boundingBox = normalizePickBoundingBox(selection.boundingBox);
  return {
    tagName: selection.tagName,
    candidates,
    selector: typeof selection.selector === "string" ? selection.selector : candidates[0],
    id: typeof selection.id === "string" ? selection.id : null,
    className: typeof selection.className === "string" ? selection.className.slice(0, 220) : null,
    text: typeof selection.text === "string" ? selection.text.slice(0, MAX_PICK_TEXT) : null,
    html: typeof selection.html === "string" ? selection.html.slice(0, MAX_PICK_HTML) : null,
    ...(boundingBox ? { boundingBox } : {}),
  };
}

export function BooleanPickSelection(value: BrowserPickSelection | undefined): value is BrowserPickSelection {
  return Boolean(value);
}

function normalizePickBoundingBox(box: BrowserPickSelection["boundingBox"]): BrowserPickSelection["boundingBox"] | undefined {
  if (!box) return undefined;
  const x = Number(box.x);
  const y = Number(box.y);
  const width = Number(box.width);
  const height = Number(box.height);
  if (![x, y, width, height].every(Number.isFinite)) return undefined;
  return {
    x: clampInteger(x, -100_000, 100_000),
    y: clampInteger(y, -100_000, 100_000),
    width: clampInteger(width, 0, 100_000),
    height: clampInteger(height, 0, 100_000),
  };
}

export function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const DEFAULT_KEYPRESS_DURATION_MS = 80;
const MAX_KEYPRESS_DURATION_MS = 5_000;
const MAX_BROWSER_KEYPRESS_KEYS = 100;

export function normalizeBrowserKeypressInput(input: BrowserKeypressInput): NormalizedBrowserKeypressInput {
  const rawKeys = Array.isArray(input.keys) ? input.keys : [];
  if (rawKeys.length === 0) throw new Error("browser_keypress requires at least one key.");
  if (rawKeys.length > MAX_BROWSER_KEYPRESS_KEYS) {
    throw new Error(`browser_keypress accepts at most ${MAX_BROWSER_KEYPRESS_KEYS} keys per call.`);
  }
  return {
    ...input,
    focus: nonEmptyString(input.focus) ?? "page",
    keys: rawKeys.map(normalizeBrowserKeypressKey),
  };
}

function normalizeBrowserKeypressKey(raw: BrowserKeypressKeyInput | string, index: number): NormalizedBrowserKeypressKey {
  const record = typeof raw === "string" ? { key: raw } : raw && typeof raw === "object" ? raw : {};
  const suppliedKey = nonEmptyString(record.key);
  const suppliedCode = nonEmptyString(record.code);
  const token = suppliedKey ?? suppliedCode;
  if (!token) throw new Error(`browser_keypress key ${index + 1} needs key or code.`);
  const durationMs = clampInteger(numberOrDefault(record.durationMs, DEFAULT_KEYPRESS_DURATION_MS), 0, MAX_KEYPRESS_DURATION_MS);
  const explicitText = typeof record.text === "string" ? record.text : undefined;
  const special = specialBrowserKeyDefinition(token, suppliedCode);
  if (special) {
    return {
      ...special,
      durationMs,
      ...(explicitText !== undefined ? { text: explicitText } : special.text !== undefined ? { text: special.text } : {}),
    };
  }
  const codeAsLetter = keyFromCode(token);
  const printable = codeAsLetter ?? (token.length === 1 ? token : undefined);
  if (printable) {
    const code = suppliedCode ?? codeForPrintableKey(printable);
    return {
      key: printable,
      code,
      durationMs,
      text: explicitText ?? printable,
      windowsVirtualKeyCode: virtualKeyCodeForPrintable(printable),
      electronKeyCode: electronKeyCodeForPrintable(printable),
    };
  }
  return {
    key: suppliedKey ?? token,
    code: suppliedCode ?? token,
    durationMs,
    ...(explicitText ? { text: explicitText } : {}),
    windowsVirtualKeyCode: 0,
    electronKeyCode: suppliedCode ?? suppliedKey ?? token,
  };
}

function specialBrowserKeyDefinition(
  token: string,
  suppliedCode: string | undefined,
): Omit<NormalizedBrowserKeypressKey, "durationMs"> | undefined {
  const normalized = token === " " ? "space" : token.toLowerCase();
  const definitions: Record<string, Omit<NormalizedBrowserKeypressKey, "durationMs">> = {
    space: { key: " ", code: suppliedCode ?? "Space", text: " ", windowsVirtualKeyCode: 32, electronKeyCode: "Space" },
    arrowup: { key: "ArrowUp", code: suppliedCode ?? "ArrowUp", windowsVirtualKeyCode: 38, electronKeyCode: "ArrowUp" },
    arrowdown: { key: "ArrowDown", code: suppliedCode ?? "ArrowDown", windowsVirtualKeyCode: 40, electronKeyCode: "ArrowDown" },
    arrowleft: { key: "ArrowLeft", code: suppliedCode ?? "ArrowLeft", windowsVirtualKeyCode: 37, electronKeyCode: "ArrowLeft" },
    arrowright: { key: "ArrowRight", code: suppliedCode ?? "ArrowRight", windowsVirtualKeyCode: 39, electronKeyCode: "ArrowRight" },
    enter: { key: "Enter", code: suppliedCode ?? "Enter", windowsVirtualKeyCode: 13, electronKeyCode: "Enter" },
    escape: { key: "Escape", code: suppliedCode ?? "Escape", windowsVirtualKeyCode: 27, electronKeyCode: "Escape" },
    esc: { key: "Escape", code: suppliedCode ?? "Escape", windowsVirtualKeyCode: 27, electronKeyCode: "Escape" },
    backspace: { key: "Backspace", code: suppliedCode ?? "Backspace", windowsVirtualKeyCode: 8, electronKeyCode: "Backspace" },
    tab: { key: "Tab", code: suppliedCode ?? "Tab", windowsVirtualKeyCode: 9, electronKeyCode: "Tab" },
    shift: { key: "Shift", code: suppliedCode ?? "ShiftLeft", windowsVirtualKeyCode: 16, electronKeyCode: "Shift" },
    control: { key: "Control", code: suppliedCode ?? "ControlLeft", windowsVirtualKeyCode: 17, electronKeyCode: "Control" },
    ctrl: { key: "Control", code: suppliedCode ?? "ControlLeft", windowsVirtualKeyCode: 17, electronKeyCode: "Control" },
    alt: { key: "Alt", code: suppliedCode ?? "AltLeft", windowsVirtualKeyCode: 18, electronKeyCode: "Alt" },
    meta: { key: "Meta", code: suppliedCode ?? "MetaLeft", windowsVirtualKeyCode: 91, electronKeyCode: "Meta" },
  };
  return definitions[normalized];
}

function keyFromCode(code: string): string | undefined {
  const letter = /^Key([A-Z])$/i.exec(code)?.[1];
  if (letter) return letter.toLowerCase();
  const digit = /^Digit([0-9])$/i.exec(code)?.[1];
  return digit;
}

function codeForPrintableKey(key: string): string {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return key === " " ? "Space" : key;
}

function virtualKeyCodeForPrintable(key: string): number {
  if (/^[a-z]$/i.test(key)) return key.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(key)) return key.charCodeAt(0);
  if (key === " ") return 32;
  return key.charCodeAt(0) || 0;
}

function electronKeyCodeForPrintable(key: string): string {
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  return key === " " ? "Space" : key;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function chromeKeyEventParams(type: "keyDown" | "keyUp", key: NormalizedBrowserKeypressKey): Record<string, unknown> {
  return {
    type,
    key: key.key,
    code: key.code,
    windowsVirtualKeyCode: key.windowsVirtualKeyCode,
    nativeVirtualKeyCode: key.windowsVirtualKeyCode,
    ...(type === "keyDown" && key.text !== undefined ? { text: key.text, unmodifiedText: key.text } : {}),
  };
}

async function focusBrowserPage(client: JsonRpcWebSocketClient, focus: string): Promise<BrowserKeypressFocusResult> {
  const result = await client.request<{
    exceptionDetails?: { text?: string; exception?: { description?: string } };
    result?: { value?: unknown };
  }>(
    "Runtime.evaluate",
    {
      expression: browserKeypressFocusExpression(focus),
      awaitPromise: true,
      returnByValue: true,
    },
    5_000,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Browser focus failed.");
  }
  return normalizeBrowserKeypressFocusResult(result.result?.value, focus);
}

export function browserKeypressFocusExpression(focus: string): string {
  return `
    (() => {
      const requested = ${JSON.stringify(focus)};
      const selector = requested && requested !== "page" ? requested : "";
      let target = selector ? document.querySelector(selector) : document.body;
      const found = Boolean(target);
      if (!target) target = document.body;
      if (target instanceof HTMLElement) {
        if (target === document.body && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
      const active = document.activeElement instanceof Element ? document.activeElement : target;
      const value = active && "value" in active && typeof active.value === "string" ? active.value : undefined;
      return {
        requested,
        found,
        tagName: active?.tagName ?? undefined,
        id: active?.id ?? null,
        className: typeof active?.className === "string" ? active.className : null,
        type: active?.getAttribute?.("type") ?? null,
        text: (value ?? active?.textContent ?? "").slice(0, 120),
      };
    })()
  `;
}

function normalizeBrowserKeypressFocusResult(value: unknown, requested: string): BrowserKeypressFocusResult {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    requested,
    found: record.found === true,
    ...(typeof record.tagName === "string" ? { tagName: record.tagName } : {}),
    ...(typeof record.id === "string" || record.id === null ? { id: record.id } : {}),
    ...(typeof record.className === "string" || record.className === null ? { className: record.className } : {}),
    ...(typeof record.type === "string" || record.type === null ? { type: record.type } : {}),
    ...(typeof record.text === "string" || record.text === null ? { text: record.text ?? "" } : {}),
  };
}

export function keypressKeyResult(key: BrowserKeypressKeyResult): BrowserKeypressKeyResult {
  return {
    key: key.key,
    code: key.code,
    durationMs: key.durationMs,
    ...(key.text !== undefined ? { text: key.text } : {}),
  };
}

export function browserScreenshotStorageTarget(workspace: WorkspaceState, input: BrowserStartInput = {}): BrowserScreenshotStorageTarget {
  const artifactWorkspacePath = typeof input.artifactWorkspacePath === "string" ? input.artifactWorkspacePath.trim() : "";
  if (artifactWorkspacePath) {
    return {
      screenshots: join(artifactWorkspacePath, ".ambient-codex", "browser", "screenshots"),
      artifactWorkspacePath,
    };
  }
  return {
    screenshots: join(workspace.statePath, "browser", "screenshots"),
    artifactWorkspacePath: workspace.path,
  };
}

export function browserScreenshotArtifactPath(target: BrowserScreenshotStorageTarget, filePath: string): string | undefined {
  const artifactPath = relative(target.artifactWorkspacePath, filePath);
  if (
    !artifactPath ||
    artifactPath.startsWith("..") ||
    artifactPath.startsWith("/") ||
    /^[a-z]:[\\/]/i.test(artifactPath)
  ) {
    return undefined;
  }
  return artifactPath;
}

export function pngImageDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 24) return undefined;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (!isPng || bytes.toString("ascii", 12, 16) !== "IHDR") return undefined;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width <= 0 || height <= 0) return undefined;
  return { width, height };
}

function isNavigationAbortErrorText(text: string): boolean {
  return /\b(?:net::)?ERR_ABORTED\b/i.test(text);
}

const excludedChromeProfileParts = new Set([
  "Cache",
  "Code Cache",
  "Crashpad",
  "DawnCache",
  "DevToolsActivePort",
  "GPUCache",
  "GrShaderCache",
  "GraphiteDawnCache",
  "Safe Browsing",
  "ShaderCache",
  "SingletonCookie",
  "SingletonLock",
  "SingletonSocket",
  "lockfile",
]);
