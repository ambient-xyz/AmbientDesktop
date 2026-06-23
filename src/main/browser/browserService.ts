import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type {
  BrowserCapabilityState,
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
  BrowserProfileMode,
  BrowserRevealInput,
  BrowserRevealResult,
  BrowserRuntimeKind,
  BrowserScreenshotResult,
  BrowserSearchInput,
  BrowserSearchResult,
  BrowserStartInput,
  BrowserTabSnapshot,
  BrowserUserActionState,
  BrowserViewBoundsInput,
} from "../../shared/browserTypes";
import {
  type ManagedChromeRevealInput,
  type ManagedChromeRevealResult,
  type ManagedChromeWindowBounds,
  type ManagedChromeWorkArea,
} from "./browserChromeRevealController";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  chromeProfileSourcePath,
} from "./browserChromeProfileController";
import {
  type ChromeVersionInfo,
} from "./browserChromeTargetController";
import { BrowserChromeLifecycleController } from "./browserChromeLifecycleController";
import {
  BrowserChromeStartupController,
  BrowserUnavailableError,
  MANAGED_CHROME_WIDTH,
} from "./browserChromeStartupController";
import { assertBrowserScreenshotTargetLoaded } from "./browserChromeScreenshotController";
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
import { type BrowserServiceInternalStateSnapshot } from "./browserServiceStateSnapshot";
import {
  browserUserActionDetectionExpression,
  type BrowserUserActionDetection,
} from "./browserUserActionController";
import {
  createBrowserServiceControllers,
  type BrowserServiceControllerBundle,
} from "./browserServiceControllers";
import {
  createBrowserChromeLifecycleState,
  createBrowserServiceControllerStateAccessors,
  createBrowserServiceMutableState,
  defineBrowserServiceMutableStateProperties,
  type BrowserServiceMutableState,
} from "./browserServiceMutableState";

export {
  BooleanPickSelection,
  MAX_BROWSER_TEXT,
  PICK_TIMEOUT_MS,
  browserKeypressFocusExpression,
  browserLoginExpression,
  buildBrowserPickExpression,
  cancelBrowserPickExpression,
  clampInteger,
  contentExpression,
  keypressKeyResult,
  normalizeBrowserKeypressInput,
  normalizeBrowserLoginOrigin,
  normalizePageContent,
  normalizePickSelection,
  normalizeSearchResults,
  searchExpression,
  userCodeExpression,
} from "./browserChromeRuntimeController";

export type {
  BrowserContentResult,
  BrowserNavigateResult,
  BrowserSearchResults,
  NormalizedBrowserKeypressInput,
  NormalizedBrowserKeypressKey,
} from "./browserChromeRuntimeController";

export {
  assertBrowserScreenshotTargetLoaded,
  browserScreenshotArtifactPath,
  browserScreenshotStorageTarget,
  BROWSER_SCREENSHOT_MIME_TYPE,
  pngImageDimensions,
  type BrowserScreenshotStorageTarget,
} from "./browserChromeScreenshotController";

export {
  chromeProfileSourcePath,
  shouldCopyChromeProfilePath,
} from "./browserChromeProfileController";

export type {
  ManagedChromeRevealInput,
  ManagedChromeRevealResult,
  ManagedChromeWindowBounds,
  ManagedChromeWorkArea,
} from "./browserChromeRevealController";

export {
  BrowserUnavailableError,
  managedChromeLaunchArgs,
  parseChromeDevToolsEndpoint,
} from "./browserChromeStartupController";

export {
  assertBrowserNavigationReachedRequestedPage,
  assertLocalBrowserNavigationReachable,
  browserNavigationReachedExpectedUrl,
  LOCAL_BROWSER_NAVIGATION_PREFLIGHT_TIMEOUT_MS,
  normalizeBrowserUrl,
  PAGE_READY_TIMEOUT_MS,
} from "./browserNavigation";

export {
  BrowserUserActionCanceledError,
  BrowserUserActionTimedOutError,
  browserUserActionDetectionExpression,
  normalizeBrowserUserActionDetection,
} from "./browserUserActionController";

export interface ChromeDevToolsEndpoint {
  port: number;
  webSocketDebuggerUrl: string;
}

export interface ChromeAvailability {
  available: boolean;
  executable?: string;
  unavailableReason?: string;
}

export interface InternalBrowserBackend {
  isAvailable(): boolean;
  isRunning(): boolean;
  getState(): Promise<BrowserServiceInternalStateSnapshot>;
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

type BrowserRequestInput = {
  profileMode?: BrowserProfileMode;
  runtime?: BrowserRuntimeKind;
};

export interface BrowserServiceOptions {
  browserLoginBrokerAvailable?: boolean;
  onStateChanged?: () => void | Promise<void>;
  revealManagedChromeWindow?: (input: ManagedChromeRevealInput) => Promise<ManagedChromeRevealResult>;
  managedChromeRevealBounds?: () => ManagedChromeWindowBounds | undefined;
}

const DEFAULT_PROFILE_MODE: BrowserProfileMode = "isolated";
const MANAGED_CHROME_REVEALED_HEIGHT = 900;
const MANAGED_CHROME_REVEAL_MARGIN = 40;
const MANAGED_CHROME_MIN_WIDTH = 720;
const MANAGED_CHROME_MIN_HEIGHT = 520;

export class BrowserService {
  private readonly state: BrowserServiceMutableState;
  private readonly instanceId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  private readonly chromeSessions: BrowserServiceControllerBundle["chromeSessions"];
  private readonly chromeProfiles: BrowserServiceControllerBundle["chromeProfiles"];
  private readonly chromeTargets: BrowserServiceControllerBundle["chromeTargets"];
  private readonly chromeScreenshots: BrowserServiceControllerBundle["chromeScreenshots"];
  private readonly chromeRuntime: BrowserServiceControllerBundle["chromeRuntime"];
  private readonly chromeLifecycle: BrowserChromeLifecycleController;
  private readonly chromeStartup: BrowserChromeStartupController;
  private readonly userActions: BrowserServiceControllerBundle["userActions"];
  private readonly internalRuntime: BrowserServiceControllerBundle["internalRuntime"];
  private readonly stateSnapshots: BrowserServiceControllerBundle["stateSnapshots"];
  private readonly chromeReveal: BrowserServiceControllerBundle["chromeReveal"];
  private readonly workspaceRefresh: BrowserServiceControllerBundle["workspaceRefresh"];

  constructor(
    private readonly getWorkspace: () => WorkspaceState,
    private readonly internalBrowser?: InternalBrowserBackend,
    private readonly options: BrowserServiceOptions = {},
  ) {
    this.state = createBrowserServiceMutableState({
      profileMode: DEFAULT_PROFILE_MODE,
      activeRuntime: internalBrowser?.isAvailable() ? "internal" : "chrome",
    });
    defineBrowserServiceMutableStateProperties(this, this.state);
    const controllers = createBrowserServiceControllers({
      getWorkspace,
      internalBrowser,
      options: this.options,
      state: createBrowserServiceControllerStateAccessors(this.state),
      actions: {
        waitForVersion: () => this.waitForVersion(),
        writeChromeSessionManifest: () => this.writeChromeSessionManifest(),
        screenshotChrome: (input) => this.screenshotChrome(input),
        ensureChromeStarted: (profileMode) => this.ensureChromeStarted(profileMode),
        closeActiveAboutBlankTarget: () => this.closeActiveAboutBlankTarget(),
        detectChromeUserAction: () => this.detectChromeUserAction(),
        ensureInternalStarted: () => this.ensureInternalStarted(),
        isChromeRunning: () => this.isChromeRunning(),
        stopChrome: (reason) => this.stopChrome(reason),
        refreshChromeRunningState: () => this.refreshChromeRunningState(),
        reattachChrome: (profileMode) => this.reattachChrome(profileMode),
        revealManagedChromeWindow: (input) => this.revealManagedChromeWindow(input),
        rememberChromeBrowserActionTarget: (tab) => this.rememberChromeBrowserActionTarget(tab),
        sameAsLastChromeBrowserActionTarget: (tab) => this.sameAsLastChromeBrowserActionTarget(tab),
        getChildProcessId: () => this.state.child?.pid,
        hasInternalBrowser: () => this.hasInternalBrowser(),
        notifyStateChanged: () => this.notifyStateChanged(),
      },
      dependencies: {
        chromeAvailability: () => chromeAvailability(),
        chromeProfileSourcePath: () => chromeProfileSourcePath(),
        defaultManagedChromeRevealBounds: () => managedChromeRevealBoundsForWorkArea({ x: 0, y: 0, width: 1440, height: 900 }),
      },
    });
    this.chromeSessions = controllers.chromeSessions;
    this.chromeProfiles = controllers.chromeProfiles;
    this.chromeTargets = controllers.chromeTargets;
    this.chromeScreenshots = controllers.chromeScreenshots;
    this.chromeRuntime = controllers.chromeRuntime;
    this.userActions = controllers.userActions;
    this.internalRuntime = controllers.internalRuntime;
    this.stateSnapshots = controllers.stateSnapshots;
    this.chromeReveal = controllers.chromeReveal;
    this.workspaceRefresh = controllers.workspaceRefresh;
    this.chromeLifecycle = new BrowserChromeLifecycleController({
      chromeSessions: this.chromeSessions,
      chromeTargets: this.chromeTargets,
      getUserAction: () => this.userActions.current,
      notifyStateChanged: () => this.notifyStateChanged(),
      state: createBrowserChromeLifecycleState(this.state),
    });
    this.chromeStartup = new BrowserChromeStartupController({
      chromeAvailability: () => chromeAvailability(),
      chromeLifecycle: this.chromeLifecycle,
      chromeProfiles: this.chromeProfiles,
      chromeSessions: this.chromeSessions,
      chromeTargets: this.chromeTargets,
      getInternalBrowser: () => this.internalBrowser,
      getState: () => this.getState(),
      getUserAction: () => this.userActions.current,
      instanceId: this.instanceId,
      state: createBrowserChromeLifecycleState(this.state),
    });
  }

  async getState(): Promise<BrowserCapabilityState> {
    await this.refreshChromeRunningState();
    if (this.state.activeRuntime === "internal" && this.internalBrowser?.isAvailable()) {
      return this.stateSnapshots.internalStateSnapshot();
    }
    if (this.internalBrowser?.isRunning()) {
      this.state.activeRuntime = "internal";
      return this.stateSnapshots.internalStateSnapshot();
    }
    if (this.isChromeRunning()) {
      try {
        this.state.lastActiveTab = await this.chromeTargets.getActiveTabSnapshot();
      } catch (error) {
        this.state.lastError = errorMessage(error);
      }
    }
    return this.stateSnapshots.chromeStateSnapshot();
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
    this.userActions.clear("Browser stopped.");
    this.state.lastActivity = "Browser stopped.";
    this.state.activeRuntime = this.hasInternalBrowser() ? "internal" : "chrome";
    return this.getState();
  }

  async revealActiveBrowser(input: BrowserRevealInput = {}): Promise<BrowserRevealResult> {
    return this.chromeReveal.revealActiveBrowser(input);
  }

  async shutdown(): Promise<void> {
    this.userActions.clear("Browser shutting down.");
    await this.internalBrowser?.shutdown().catch(() => undefined);
    await this.stopChrome("Ambient Desktop is shutting down.").catch(() => undefined);
  }

  async copyChromeProfile(): Promise<BrowserCapabilityState> {
    await this.chromeProfiles.copyProfile();
    return this.getState();
  }

  async clearCopiedChromeProfile(): Promise<BrowserCapabilityState> {
    await this.chromeProfiles.clearCopiedProfile();
    return this.getState();
  }

  async clearIsolatedBrowserProfile(): Promise<BrowserCapabilityState> {
    await this.chromeProfiles.clearIsolatedProfile();
    return this.getState();
  }

  async navigate(input: BrowserNavigateInput & BrowserActivityInput): Promise<BrowserNavigateResult> {
    const blocked = this.userActions.activeBlock(input);
    if (blocked) {
      if (input.waitForUserAction === false) return blocked;
      await this.userActions.waitForClear(blocked, input.onActivity);
    }
    if (this.runtimeForInput(input) === "internal") {
      return this.internalRuntime.navigate(input);
    }
    return this.chromeRuntime.navigate(input);
  }

  async content(input: BrowserContentInput & BrowserActivityInput = {}): Promise<BrowserContentResult> {
    const blocked = this.userActions.activeBlock(input);
    if (blocked) {
      if (input.waitForUserAction === false) return blocked;
      await this.userActions.waitForClear(blocked, input.onActivity);
    }
    if (this.runtimeForInput(input) === "internal") {
      return this.internalRuntime.content(input);
    }
    return this.chromeRuntime.content(input);
  }

  async search(input: BrowserSearchInput & BrowserActivityInput): Promise<BrowserSearchResults> {
    const blocked = this.userActions.activeBlock(input);
    if (blocked) {
      if (input.waitForUserAction === false) return blocked;
      await this.userActions.waitForClear(blocked, input.onActivity);
    }
    if (this.runtimeForInput(input) === "internal") {
      return this.internalRuntime.search(input);
    }
    return this.chromeRuntime.search(input);
  }

  async evaluate(input: BrowserEvaluateInput & BrowserActivityInput): Promise<unknown> {
    const blocked = this.userActions.activeBlock();
    if (blocked) return blocked;
    if (this.runtimeForInput(input) === "internal") {
      return this.internalRuntime.evaluate(input);
    }
    return this.chromeRuntime.evaluate(input);
  }

  async keypress(input: BrowserKeypressInput): Promise<BrowserKeypressResult | BrowserUserActionState> {
    const blocked = this.userActions.activeBlock();
    if (blocked) return blocked;
    const normalized = normalizeBrowserKeypressInput(input);
    if (this.runtimeForInput(normalized) === "internal") {
      return this.internalRuntime.keypress(normalized);
    }
    return this.chromeRuntime.keypress(normalized);
  }

  async login(input: BrowserLoginRequest): Promise<BrowserLoginResult | BrowserUserActionState> {
    const blocked = this.userActions.activeBlock();
    if (blocked) return blocked;
    const normalized = normalizeBrowserLoginRequest(input);
    if (this.runtimeForInput(normalized) === "internal") {
      await this.ensureInternalStarted();
      const tab = (await this.internalBrowser!.getState()).activeTab;
      assertLoginOrigin(normalized.expectedOrigin, normalized.credential.origin, tab?.url);
      const result = await this.internalBrowser!.login({ ...normalized, profileMode: "isolated", runtime: "internal" });
      this.state.lastActivity = `Filled stored credential "${normalized.credential.label}" for ${normalized.expectedOrigin}.`;
      return normalizeBrowserLoginResult(result, normalized);
    }
    return this.chromeRuntime.login(normalized);
  }

  async screenshot(input: BrowserStartInput & BrowserActivityInput = {}): Promise<BrowserScreenshotResult | BrowserUserActionState> {
    const blocked = this.userActions.activeBlock();
    if (blocked) return blocked;
    if (input.runtime === "internal") {
      return this.internalRuntime.screenshot(input);
    }
    return this.screenshotChrome(input);
  }

  async refreshWorkspaceArtifact(input: { workspacePath: string; changedPath: string }): Promise<boolean> {
    return this.workspaceRefresh.refreshWorkspaceArtifact(input);
  }

  async pick(input: BrowserPickInput): Promise<BrowserPickResult | BrowserUserActionState> {
    const blocked = this.userActions.activeBlock();
    if (blocked) return blocked;
    const profileMode = input.profileMode ?? DEFAULT_PROFILE_MODE;
    this.state.activePicker = { prompt: input.prompt, profileMode, startedAt: new Date().toISOString() };
    this.state.lastActivity = `Waiting for browser picker selection: ${input.prompt}`;
    this.state.lastError = undefined;
    try {
      if (this.runtimeForInput(input) === "internal") {
        await this.ensureInternalStarted();
        return await this.internalBrowser!.pick({ ...input, profileMode: "isolated", runtime: "internal" });
      }
      return await this.chromeRuntime.pick(input);
    } finally {
      this.state.activePicker = undefined;
    }
  }

  async cancelPick(): Promise<BrowserCapabilityState> {
    if (!this.state.activePicker) {
      this.state.lastActivity = "No active browser picker to cancel.";
      return this.getState();
    }
    const runtime = this.state.activeRuntime;
    this.state.activePicker = undefined;
    if (runtime === "internal" && this.internalBrowser?.isRunning()) {
      await this.internalBrowser.cancelPick();
    } else if (this.isChromeRunning()) {
      await this.chromeTargets.evaluatePage<boolean>(cancelBrowserPickExpression(), 2_500).catch((error) => {
        this.state.lastError = errorMessage(error);
      });
    }
    this.state.lastActivity = "Browser picker cancellation requested.";
    return this.getState();
  }

  async resumeUserAction(): Promise<BrowserCapabilityState> {
    await this.userActions.resume();
    return this.getState();
  }

  async cancelUserAction(): Promise<BrowserCapabilityState> {
    this.userActions.cancel();
    return this.getState();
  }

  setViewBounds(input: BrowserViewBoundsInput): void {
    this.internalBrowser?.setViewBounds(input);
  }

  private async startChrome(profileMode: BrowserProfileMode = DEFAULT_PROFILE_MODE): Promise<BrowserCapabilityState> {
    return this.chromeStartup.startChrome(profileMode);
  }

  private async preserveChromeSession(reason: string): Promise<void> {
    return this.chromeLifecycle.preserveChromeSession(reason);
  }

  private shouldPreserveChromeForRuntimeSwitch(): boolean {
    return this.chromeLifecycle.shouldPreserveChromeForRuntimeSwitch();
  }

  private async closeOrPreserveChromeForRuntimeSwitch(reason: string): Promise<void> {
    return this.chromeLifecycle.closeOrPreserveChromeForRuntimeSwitch(reason);
  }

  private async stopChrome(reason = "Managed Chrome was closed."): Promise<void> {
    return this.chromeLifecycle.stopChrome(reason);
  }

  private async screenshotChrome(input: BrowserStartInput & BrowserActivityInput = {}): Promise<BrowserScreenshotResult> {
    return this.chromeScreenshots.screenshot(input);
  }

  private rememberChromeBrowserActionTarget(tab?: BrowserTabSnapshot): void {
    const targetId = tab?.id ?? this.state.activeTargetId;
    if (!targetId) return;
    this.state.lastChromeBrowserActionTarget = {
      id: targetId,
      title: tab?.title ?? this.state.lastActiveTab?.title,
      url: tab?.url ?? this.state.lastActiveTab?.url,
    };
  }

  private sameAsLastChromeBrowserActionTarget(tab?: BrowserTabSnapshot): boolean | undefined {
    if (!this.state.lastChromeBrowserActionTarget?.id) return undefined;
    return Boolean(tab?.id && tab.id === this.state.lastChromeBrowserActionTarget.id);
  }

  private async ensureInternalStarted(): Promise<void> {
    if (!this.internalBrowser?.isAvailable()) {
      throw new BrowserUnavailableError("The internal browser view is not available in this Electron runtime.");
    }
    if (this.isChromeRunning()) await this.closeOrPreserveChromeForRuntimeSwitch("Switched to the internal browser.");
    this.state.profileMode = "isolated";
    this.state.activeRuntime = "internal";
    if (!this.internalBrowser.isRunning()) await this.internalBrowser.start();
  }

  private async ensureChromeStarted(profileMode: BrowserProfileMode = DEFAULT_PROFILE_MODE): Promise<void> {
    return this.chromeStartup.ensureChromeStarted(profileMode);
  }

  private async refreshChromeRunningState(): Promise<void> {
    return this.chromeLifecycle.refreshChromeRunningState();
  }

  private isChromeRunning(): boolean {
    return this.chromeLifecycle.isChromeRunning();
  }

  private notifyStateChanged(): void {
    void this.options.onStateChanged?.();
  }

  private beginUserAction(input: {
    toolName: string;
    runtime: BrowserRuntimeKind;
    profileMode: BrowserProfileMode;
    targetId?: string;
    sourceThreadId?: string;
    detection: BrowserUserActionDetection;
  }): BrowserUserActionState {
    return this.userActions.begin(input);
  }

  private async reattachChrome(profileMode: BrowserProfileMode): Promise<boolean> {
    return this.chromeLifecycle.reattachChrome(profileMode);
  }

  private async writeChromeSessionManifest(): Promise<void> {
    return this.chromeLifecycle.writeChromeSessionManifest();
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

  private async waitForVersion(): Promise<ChromeVersionInfo> {
    return this.chromeStartup.waitForVersion();
  }

  private async closeActiveAboutBlankTarget(): Promise<boolean> {
    return this.chromeStartup.closeActiveAboutBlankTarget();
  }

  private async detectChromeUserAction(): Promise<BrowserUserActionDetection | undefined> {
    return this.chromeTargets.evaluatePage<BrowserUserActionDetection>(browserUserActionDetectionExpression(), 5_000);
  }

  private async revealManagedChromeWindow(input: ManagedChromeRevealInput): Promise<ManagedChromeRevealResult> {
    const activation = await this.chromeTargets.activateTarget(input.targetId);
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

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
