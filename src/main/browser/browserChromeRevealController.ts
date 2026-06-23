import type {
  BrowserCapabilityState,
  BrowserProfileMode,
  BrowserRevealInput,
  BrowserRevealResult,
  BrowserRuntimeKind,
  BrowserTabSnapshot,
  BrowserUserActionState,
} from "../../shared/browserTypes";

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

export interface BrowserChromeRevealControllerOptions {
  refreshChromeRunningState: () => Promise<void>;
  getActiveRuntime: () => BrowserRuntimeKind;
  setActiveRuntime: (runtime: BrowserRuntimeKind) => void;
  isInternalBrowserRunning: () => boolean;
  internalStateSnapshot: () => Promise<BrowserCapabilityState>;
  getCurrentUserAction: () => BrowserUserActionState | undefined;
  getProfileMode: () => BrowserProfileMode;
  getChromeProcessId: () => number | undefined;
  getChildProcessId: () => number | undefined;
  getRuntimeProfilePath: () => string | undefined;
  isChromeRunning: () => boolean;
  reattachChrome: (profileMode: BrowserProfileMode) => Promise<boolean>;
  chromeAvailability: () => { executable?: string };
  revealManagedChromeWindow: (input: ManagedChromeRevealInput) => Promise<ManagedChromeRevealResult>;
  setLastActiveTab: (tab: BrowserTabSnapshot) => void;
  setLastActivity: (message: string) => void;
  setLastError: (message: string | undefined) => void;
  notifyStateChanged: () => void;
}

export class BrowserChromeRevealController {
  constructor(private readonly options: BrowserChromeRevealControllerOptions) {}

  async revealActiveBrowser(input: BrowserRevealInput = {}): Promise<BrowserRevealResult> {
    await this.options.refreshChromeRunningState();
    if (this.options.getActiveRuntime() === "internal" || this.options.isInternalBrowserRunning()) {
      const state = await this.options.internalStateSnapshot();
      this.options.setLastActivity(state.running ? "Showing internal browser panel." : "No internal browser session is running.");
      return {
        runtime: "internal",
        target: "internal",
        status: state.running ? "needs-internal-panel" : "not-running",
        message: state.running ? "The browser is in Ambient's inline Browser panel." : "No inline browser session is running.",
        ...(state.activeTab ? { activeTab: state.activeTab } : {}),
      };
    }

    const revealUserAction = this.currentChromeUserAction(input);
    const profileMode = revealUserAction?.profileMode ?? this.options.getProfileMode();
    const targetId = input.targetId ?? revealUserAction?.targetId;
    if (!this.options.isChromeRunning()) await this.options.reattachChrome(profileMode).catch(() => false);
    if (!this.options.isChromeRunning()) {
      this.options.setLastActivity("Managed Chrome is not running.");
      return {
        runtime: "chrome",
        target: "managed-chrome",
        status: "not-running",
        message: "Managed Chrome is not running, so there is no external browser window to show.",
      };
    }

    this.options.setActiveRuntime("chrome");
    const availability = this.options.chromeAvailability();
    const reveal = await this.options
      .revealManagedChromeWindow({
        platform: process.platform,
        profileMode,
        targetId,
        processId: this.options.getChromeProcessId() ?? this.options.getChildProcessId(),
        executable: availability.executable,
        profilePath: this.options.getRuntimeProfilePath(),
      })
      .catch(
        (error): ManagedChromeRevealResult => ({
          cdpActivated: false,
          foregroundAttempted: true,
          foregroundSucceeded: false,
          reason: error instanceof Error ? error.message : String(error),
        }),
      );

    if (reveal.activeTab) this.options.setLastActiveTab(reveal.activeTab);
    const fullyRevealed = reveal.cdpActivated && reveal.foregroundSucceeded;
    const status = fullyRevealed ? "revealed" : reveal.unsupported ? "unsupported" : "failed";
    const fallbackReason = reveal.reason;
    this.options.setLastActivity(
      fullyRevealed
        ? "Managed Chrome was brought forward."
        : `Tried to show managed Chrome. ${fallbackReason ?? "The operating system did not foreground it."}`.trim(),
    );
    this.options.setLastError(fullyRevealed ? undefined : fallbackReason);
    this.options.notifyStateChanged();

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

  private currentChromeUserAction(input: BrowserRevealInput): BrowserUserActionState | undefined {
    const current = this.options.getCurrentUserAction();
    return current?.runtime === "chrome" && (!input.userActionId || current.id === input.userActionId) ? current : undefined;
  }
}
