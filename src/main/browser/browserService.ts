import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
  foregroundManagedChromeWindow,
  managedChromeRevealBoundsForWorkArea as defaultManagedChromeRevealBoundsForWorkArea,
  type ManagedChromeRevealInput,
  type ManagedChromeRevealResult,
  type ManagedChromeWindowBounds,
} from "./browserChromeRevealController";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { chromeProfileSourcePath } from "./browserChromeProfileController";
import { type ChromeVersionInfo } from "./browserChromeTargetController";
import { BrowserChromeLifecycleController } from "./browserChromeLifecycleController";
import { BrowserChromeStartupController, BrowserUnavailableError } from "./browserChromeStartupController";
import {
  type BrowserActivityInput,
  type BrowserContentResult,
  type BrowserNavigateResult,
  type BrowserSearchResults,
} from "./browserChromeRuntimeController";
import { type BrowserServiceInternalStateSnapshot } from "./browserServiceStateSnapshot";
import { browserUserActionDetectionExpression, type BrowserUserActionDetection } from "./browserUserActionController";
import { createBrowserServiceControllers, type BrowserServiceControllerBundle } from "./browserServiceControllers";
import {
  createBrowserChromeLifecycleState,
  createBrowserServiceControllerStateAccessors,
  createBrowserServiceMutableState,
  defineBrowserServiceMutableStateProperties,
  type BrowserServiceMutableState,
} from "./browserServiceMutableState";
import {
  BrowserServiceRequestController,
  DEFAULT_BROWSER_PROFILE_MODE as DEFAULT_PROFILE_MODE,
  type BrowserRequestInput,
} from "./browserServiceRequestController";
import { BrowserServiceLifecycleController } from "./browserServiceLifecycleController";

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

export { chromeProfileSourcePath, shouldCopyChromeProfilePath } from "./browserChromeProfileController";

export type {
  ManagedChromeRevealInput,
  ManagedChromeRevealResult,
  ManagedChromeWindowBounds,
  ManagedChromeWorkArea,
} from "./browserChromeRevealController";

export { chromeAppNameFromExecutable, managedChromeRevealBoundsForWorkArea } from "./browserChromeRevealController";

export { BrowserUnavailableError, managedChromeLaunchArgs, parseChromeDevToolsEndpoint } from "./browserChromeStartupController";

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

export interface BrowserServiceOptions {
  browserLoginBrokerAvailable?: boolean;
  onStateChanged?: () => void | Promise<void>;
  revealManagedChromeWindow?: (input: ManagedChromeRevealInput) => Promise<ManagedChromeRevealResult>;
  managedChromeRevealBounds?: () => ManagedChromeWindowBounds | undefined;
}

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
  private readonly lifecycle: BrowserServiceLifecycleController;
  private readonly requests: BrowserServiceRequestController;

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
        defaultManagedChromeRevealBounds: () => defaultManagedChromeRevealBoundsForWorkArea({ x: 0, y: 0, width: 1440, height: 900 }),
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
    this.lifecycle = new BrowserServiceLifecycleController({
      state: this.state,
      stateSnapshots: this.stateSnapshots,
      chromeTargets: this.chromeTargets,
      chromeReveal: this.chromeReveal,
      userActions: this.userActions,
      internalBrowser: this.internalBrowser,
      actions: {
        refreshChromeRunningState: () => this.refreshChromeRunningState(),
        isChromeRunning: () => this.isChromeRunning(),
        startChrome: (profileMode) => this.startChrome(profileMode),
        stopChrome: (reason) => this.stopChrome(reason),
        ensureInternalStarted: () => this.ensureInternalStarted(),
        runtimeForRequest: (profileMode, runtime) => this.runtimeForRequest(profileMode, runtime),
        hasInternalBrowser: () => this.hasInternalBrowser(),
      },
    });
    this.requests = new BrowserServiceRequestController({
      chromeRuntime: this.chromeRuntime,
      chromeTargets: this.chromeTargets,
      internalBrowser: this.internalBrowser,
      internalRuntime: this.internalRuntime,
      userActions: this.userActions,
      state: this.state,
      ensureInternalStarted: () => this.ensureInternalStarted(),
      getState: () => this.getState(),
      isChromeRunning: () => this.isChromeRunning(),
      runtimeForInput: (input) => this.runtimeForInput(input),
      screenshotChrome: (input) => this.screenshotChrome(input),
    });
  }

  async getState(): Promise<BrowserCapabilityState> {
    return this.lifecycle.getState();
  }

  async start(input: BrowserProfileMode | BrowserStartInput | undefined = DEFAULT_PROFILE_MODE): Promise<BrowserCapabilityState> {
    return this.lifecycle.start(input);
  }

  async stop(): Promise<BrowserCapabilityState> {
    return this.lifecycle.stop();
  }

  async revealActiveBrowser(input: BrowserRevealInput = {}): Promise<BrowserRevealResult> {
    return this.lifecycle.revealActiveBrowser(input);
  }

  async shutdown(): Promise<void> {
    return this.lifecycle.shutdown();
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
    return this.requests.navigate(input);
  }

  async content(input: BrowserContentInput & BrowserActivityInput = {}): Promise<BrowserContentResult> {
    return this.requests.content(input);
  }

  async search(input: BrowserSearchInput & BrowserActivityInput): Promise<BrowserSearchResults> {
    return this.requests.search(input);
  }

  async evaluate(input: BrowserEvaluateInput & BrowserActivityInput): Promise<unknown> {
    return this.requests.evaluate(input);
  }

  async keypress(input: BrowserKeypressInput): Promise<BrowserKeypressResult | BrowserUserActionState> {
    return this.requests.keypress(input);
  }

  async login(input: BrowserLoginRequest): Promise<BrowserLoginResult | BrowserUserActionState> {
    return this.requests.login(input);
  }

  async screenshot(input: BrowserStartInput & BrowserActivityInput = {}): Promise<BrowserScreenshotResult | BrowserUserActionState> {
    return this.requests.screenshot(input);
  }

  async refreshWorkspaceArtifact(input: { workspacePath: string; changedPath: string }): Promise<boolean> {
    return this.workspaceRefresh.refreshWorkspaceArtifact(input);
  }

  async pick(input: BrowserPickInput): Promise<BrowserPickResult | BrowserUserActionState> {
    return this.requests.pick(input);
  }

  async cancelPick(): Promise<BrowserCapabilityState> {
    return this.requests.cancelPick();
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

export function chromeExecutable(platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = homedir()): string | undefined {
  return chromeAvailability(platform, env, home).executable;
}

export function chromeAvailability(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): ChromeAvailability {
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
    const executable = roots.map((root) => join(root, "Google", "Chrome", "Application", "chrome.exe")).find(isExecutableFile);
    return executable ? { available: true, executable } : { available: false, unavailableReason: defaultChromeUnavailableReason() };
  }
  const executable = findExecutableOnPath(["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"], env.PATH);
  return executable ? { available: true, executable } : { available: false, unavailableReason: defaultChromeUnavailableReason() };
}

function defaultChromeUnavailableReason(): string {
  return "Google Chrome or Chromium was not found. Install Chrome/Chromium or set AMBIENT_BROWSER_CHROME_PATH to a Chrome executable.";
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
