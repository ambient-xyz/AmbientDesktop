import type {
  BrowserCapabilityState,
  BrowserProfileMode,
  BrowserRevealInput,
  BrowserRevealResult,
  BrowserRuntimeKind,
  BrowserStartInput,
} from "../../shared/browserTypes";
import type { BrowserChromeTargetController } from "./browserChromeTargetController";
import type { BrowserChromeRevealController } from "./browserChromeRevealController";
import type { BrowserServiceMutableState } from "./browserServiceMutableState";
import type { BrowserServiceStateSnapshotController } from "./browserServiceStateSnapshot";
import type { BrowserServiceUserActionController } from "./browserUserActionController";

export interface BrowserServiceLifecycleInternalBrowser {
  isAvailable(): boolean;
  isRunning(): boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface BrowserServiceLifecycleControllerActions {
  refreshChromeRunningState: () => Promise<void>;
  isChromeRunning: () => boolean;
  startChrome: (profileMode: BrowserProfileMode) => Promise<BrowserCapabilityState>;
  stopChrome: (reason: string) => Promise<void>;
  ensureInternalStarted: () => Promise<void>;
  runtimeForRequest: (profileMode: BrowserProfileMode, runtime?: BrowserRuntimeKind) => BrowserRuntimeKind;
  hasInternalBrowser: () => boolean;
}

export interface BrowserServiceLifecycleControllerOptions {
  state: BrowserServiceMutableState;
  stateSnapshots: BrowserServiceStateSnapshotController;
  chromeTargets: BrowserChromeTargetController;
  chromeReveal: BrowserChromeRevealController;
  userActions: BrowserServiceUserActionController;
  internalBrowser?: BrowserServiceLifecycleInternalBrowser;
  actions: BrowserServiceLifecycleControllerActions;
}

export class BrowserServiceLifecycleController {
  constructor(private readonly options: BrowserServiceLifecycleControllerOptions) {}

  async getState(): Promise<BrowserCapabilityState> {
    const { actions, chromeTargets, internalBrowser, state, stateSnapshots } = this.options;
    await actions.refreshChromeRunningState();
    if (state.activeRuntime === "internal" && internalBrowser?.isAvailable()) {
      return stateSnapshots.internalStateSnapshot();
    }
    if (internalBrowser?.isRunning()) {
      state.activeRuntime = "internal";
      return stateSnapshots.internalStateSnapshot();
    }
    if (actions.isChromeRunning()) {
      try {
        state.lastActiveTab = await chromeTargets.getActiveTabSnapshot();
      } catch (error) {
        state.lastError = browserLifecycleErrorMessage(error);
      }
    }
    return stateSnapshots.chromeStateSnapshot();
  }

  async start(input: BrowserProfileMode | BrowserStartInput | undefined): Promise<BrowserCapabilityState> {
    const normalized = normalizeStartInput(input);
    const profileMode = normalized.profileMode ?? "isolated";
    const runtime = this.options.actions.runtimeForRequest(profileMode, normalized.runtime);
    if (runtime === "internal") {
      await this.options.actions.ensureInternalStarted();
      return this.getState();
    }
    return this.options.actions.startChrome(profileMode);
  }

  async stop(): Promise<BrowserCapabilityState> {
    const { actions, internalBrowser, state, userActions } = this.options;
    if (internalBrowser?.isRunning()) await internalBrowser.stop();
    await actions.stopChrome("Explicit browser stop requested.");
    userActions.clear("Browser stopped.");
    state.lastActivity = "Browser stopped.";
    state.activeRuntime = actions.hasInternalBrowser() ? "internal" : "chrome";
    return this.getState();
  }

  async revealActiveBrowser(input: BrowserRevealInput = {}): Promise<BrowserRevealResult> {
    return this.options.chromeReveal.revealActiveBrowser(input);
  }

  async shutdown(): Promise<void> {
    const { actions, internalBrowser, userActions } = this.options;
    userActions.clear("Browser shutting down.");
    await internalBrowser?.shutdown().catch(() => undefined);
    await actions.stopChrome("Ambient Desktop is shutting down.").catch(() => undefined);
  }
}

function normalizeStartInput(input: BrowserProfileMode | BrowserStartInput | undefined): BrowserStartInput {
  if (!input) return {};
  return typeof input === "string" ? { profileMode: input } : input;
}

function browserLifecycleErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
