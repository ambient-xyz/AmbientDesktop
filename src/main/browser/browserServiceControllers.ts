import type {
  BrowserProfileMode,
  BrowserScreenshotResult,
  BrowserSessionLifecycleEvent,
  BrowserStartInput,
  BrowserTabSnapshot,
  BrowserRuntimeKind,
} from "../../shared/browserTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { BrowserServiceOptions, ChromeAvailability, InternalBrowserBackend } from "./browserServiceTypes";
import {
  BrowserChromeProfileController,
  chromeProfileSourcePath,
} from "./browserChromeProfileController";
import {
  BrowserChromeRevealController,
  type ManagedChromeRevealInput,
  type ManagedChromeRevealResult,
  type ManagedChromeWindowBounds,
} from "./browserChromeRevealController";
import { BrowserChromeRuntimeController } from "./browserChromeRuntimeController";
import { BrowserChromeScreenshotController } from "./browserChromeScreenshotController";
import { BrowserChromeSessionStore } from "./browserChromeSessionStore";
import {
  BrowserChromeTargetController,
  type ChromeVersionInfo,
} from "./browserChromeTargetController";
import { BrowserServiceInternalRuntimeController } from "./browserInternalRuntimeController";
import { BrowserServiceStateSnapshotController } from "./browserServiceStateSnapshot";
import {
  BrowserServiceUserActionController,
  browserUserActionDetectionExpression,
  type BrowserUserActionDetection,
} from "./browserUserActionController";
import { BrowserServiceWorkspaceRefreshController } from "./browserServiceWorkspaceRefreshController";

export interface BrowserServiceControllerBundle {
  chromeSessions: BrowserChromeSessionStore;
  chromeProfiles: BrowserChromeProfileController;
  chromeTargets: BrowserChromeTargetController;
  chromeScreenshots: BrowserChromeScreenshotController;
  chromeRuntime: BrowserChromeRuntimeController;
  userActions: BrowserServiceUserActionController;
  internalRuntime: BrowserServiceInternalRuntimeController;
  stateSnapshots: BrowserServiceStateSnapshotController;
  chromeReveal: BrowserChromeRevealController;
  workspaceRefresh: BrowserServiceWorkspaceRefreshController;
}

export interface BrowserServiceControllerStateAccessors {
  getPort: () => number | undefined;
  getBrowserWsUrl: () => string | undefined;
  setBrowserWsUrl: (url: string | undefined) => void;
  getActiveTargetId: () => string | undefined;
  setActiveTargetId: (targetId: string | undefined) => void;
  getLastActiveTab: () => BrowserTabSnapshot | undefined;
  setLastActiveTab: (tab: BrowserTabSnapshot | undefined) => void;
  getLastActivity: () => string | undefined;
  setLastActivity: (message: string) => void;
  getLastError: () => string | undefined;
  setLastError: (message: string | undefined) => void;
  getLastSessionEvent: () => BrowserSessionLifecycleEvent | undefined;
  getActivePicker: () => { prompt: string; profileMode: BrowserProfileMode; startedAt: string } | undefined;
  getProfileMode: () => BrowserProfileMode;
  getRuntimeProfilePath: () => string | undefined;
  getAttachedToExistingSession: () => boolean;
  getSessionId: () => string | undefined;
  getProcessId: () => number | undefined;
  getActiveRuntime: () => BrowserRuntimeKind;
  setActiveRuntime: (runtime: BrowserRuntimeKind) => void;
}

export interface BrowserServiceControllerActions {
  waitForVersion: () => Promise<ChromeVersionInfo>;
  writeChromeSessionManifest: () => Promise<void>;
  screenshotChrome: (input?: BrowserStartInput & { onActivity?: (message: string) => void }) => Promise<BrowserScreenshotResult>;
  ensureChromeStarted: (profileMode?: BrowserProfileMode) => Promise<void>;
  closeActiveAboutBlankTarget: () => Promise<boolean>;
  detectChromeUserAction: () => Promise<BrowserUserActionDetection | undefined>;
  ensureInternalStarted: () => Promise<void>;
  isChromeRunning: () => boolean;
  stopChrome: (reason: string) => Promise<void>;
  refreshChromeRunningState: () => Promise<void>;
  reattachChrome: (profileMode: BrowserProfileMode) => Promise<boolean>;
  revealManagedChromeWindow: (input: ManagedChromeRevealInput) => Promise<ManagedChromeRevealResult>;
  rememberChromeBrowserActionTarget: (tab?: BrowserTabSnapshot) => void;
  sameAsLastChromeBrowserActionTarget: (tab?: BrowserTabSnapshot) => boolean | undefined;
  getChildProcessId: () => number | undefined;
  hasInternalBrowser: () => boolean;
  notifyStateChanged: () => void;
}

export interface BrowserServiceControllerDependencies {
  chromeAvailability: () => ChromeAvailability;
  chromeProfileSourcePath?: () => string | undefined;
  defaultManagedChromeRevealBounds: () => ManagedChromeWindowBounds | undefined;
}

export interface BrowserServiceControllerFactoryInput {
  getWorkspace: () => WorkspaceState;
  internalBrowser?: InternalBrowserBackend;
  options: BrowserServiceOptions;
  state: BrowserServiceControllerStateAccessors;
  actions: BrowserServiceControllerActions;
  dependencies: BrowserServiceControllerDependencies;
}

export function createBrowserServiceControllers({
  actions,
  dependencies,
  getWorkspace,
  internalBrowser,
  options,
  state,
}: BrowserServiceControllerFactoryInput): BrowserServiceControllerBundle {
  const chromeSessions = new BrowserChromeSessionStore(getWorkspace);
  const chromeTargets = new BrowserChromeTargetController({
    getPort: state.getPort,
    getBrowserWsUrl: state.getBrowserWsUrl,
    setBrowserWsUrl: state.setBrowserWsUrl,
    getActiveTargetId: state.getActiveTargetId,
    setActiveTargetId: state.setActiveTargetId,
    setLastActiveTab: state.setLastActiveTab,
    waitForVersion: actions.waitForVersion,
    writeChromeSessionManifest: actions.writeChromeSessionManifest,
    managedChromeRevealBounds: () => options.managedChromeRevealBounds?.() ?? dependencies.defaultManagedChromeRevealBounds(),
  });
  const userActions = new BrowserServiceUserActionController({
    currentChromeTargetId: state.getActiveTargetId,
    captureChromeScreenshot: actions.screenshotChrome,
    ensureChromeStarted: actions.ensureChromeStarted,
    ensureChromeTarget: (targetId) => chromeTargets.ensureChromeTarget(targetId),
    detectChromeUserAction: actions.detectChromeUserAction,
    ensureInternalStarted: actions.ensureInternalStarted,
    detectInternalUserAction: async () =>
      internalBrowser?.evaluate({
        code: browserUserActionDetectionExpression(),
        profileMode: "isolated",
        runtime: "internal",
      }),
    setLastActivity: state.setLastActivity,
    setLastError: state.setLastError,
    notifyStateChanged: actions.notifyStateChanged,
  });
  const chromeRuntime = new BrowserChromeRuntimeController({
    chromeTargets,
    userActions,
    ensureChromeStarted: actions.ensureChromeStarted,
    closeActiveAboutBlankTarget: actions.closeActiveAboutBlankTarget,
    detectChromeUserAction: actions.detectChromeUserAction,
    getProfileMode: state.getProfileMode,
    getActiveTargetId: state.getActiveTargetId,
    setLastActiveTab: state.setLastActiveTab,
    setLastActivity: state.setLastActivity,
    rememberChromeBrowserActionTarget: actions.rememberChromeBrowserActionTarget,
  });
  const chromeProfiles = new BrowserChromeProfileController({
    chromeSessions,
    clearUserActions: (reason) => userActions.clear(reason),
    getProfileMode: state.getProfileMode,
    isChromeRunning: actions.isChromeRunning,
    setLastActivity: state.setLastActivity,
    setLastError: state.setLastError,
    stopChrome: actions.stopChrome,
    chromeProfileSourcePath: dependencies.chromeProfileSourcePath ?? (() => chromeProfileSourcePath()),
  });
  const stateSnapshots = new BrowserServiceStateSnapshotController({
    getInternalState: async () => internalBrowser!.getState(),
    isChromeRunning: actions.isChromeRunning,
    getProfileMode: state.getProfileMode,
    getLastActiveTab: state.getLastActiveTab,
    getLastActivity: state.getLastActivity,
    getLastError: state.getLastError,
    getLastSessionEvent: state.getLastSessionEvent,
    getActivePicker: state.getActivePicker,
    getUserAction: () => userActions.current,
    getSessionId: state.getSessionId,
    getProcessId: state.getProcessId,
    getDevToolsPort: state.getPort,
    getActiveTargetId: state.getActiveTargetId,
    getRuntimeProfilePath: state.getRuntimeProfilePath,
    getAttachedToExistingSession: state.getAttachedToExistingSession,
    hasInternalBrowser: actions.hasInternalBrowser,
    browserLoginBrokerAvailable: () => options.browserLoginBrokerAvailable !== false,
    chromeAvailability: dependencies.chromeAvailability,
    chromeProfileSourcePath: dependencies.chromeProfileSourcePath ?? (() => chromeProfileSourcePath()),
    browserPaths: () => chromeSessions.paths(),
    copiedProfile: () => chromeProfiles.copiedProfileState(),
  });
  const chromeReveal = new BrowserChromeRevealController({
    refreshChromeRunningState: actions.refreshChromeRunningState,
    getActiveRuntime: state.getActiveRuntime,
    setActiveRuntime: state.setActiveRuntime,
    isInternalBrowserRunning: () => Boolean(internalBrowser?.isRunning()),
    internalStateSnapshot: () => stateSnapshots.internalStateSnapshot(),
    getCurrentUserAction: () => userActions.current,
    getProfileMode: state.getProfileMode,
    getChromeProcessId: state.getProcessId,
    getChildProcessId: actions.getChildProcessId,
    getRuntimeProfilePath: state.getRuntimeProfilePath,
    isChromeRunning: actions.isChromeRunning,
    reattachChrome: actions.reattachChrome,
    chromeAvailability: dependencies.chromeAvailability,
    revealManagedChromeWindow: options.revealManagedChromeWindow ?? actions.revealManagedChromeWindow,
    setLastActiveTab: state.setLastActiveTab,
    setLastActivity: state.setLastActivity,
    setLastError: state.setLastError,
    notifyStateChanged: actions.notifyStateChanged,
  });
  const workspaceRefresh = new BrowserServiceWorkspaceRefreshController({
    internalBrowser,
    chromeTargets,
    isChromeRunning: actions.isChromeRunning,
    getActiveTargetId: state.getActiveTargetId,
    setLastActiveTab: state.setLastActiveTab,
    setLastActivity: state.setLastActivity,
    setLastError: state.setLastError,
  });
  const internalRuntime = new BrowserServiceInternalRuntimeController({
    getInternalBrowser: () => internalBrowser,
    getActiveChromeTabSnapshot: () => chromeTargets.getActiveTabSnapshot().catch(() => undefined),
    ensureInternalStarted: actions.ensureInternalStarted,
    userActions,
    setLastError: state.setLastError,
  });
  const chromeScreenshots: BrowserChromeScreenshotController = new BrowserChromeScreenshotController({
    getWorkspace,
    ensureChromeStarted: actions.ensureChromeStarted,
    getActiveTabSnapshot: () => chromeTargets.getActiveTabSnapshot(),
    connectActivePage: () => chromeTargets.connectActivePage(),
    refuseStateLosingInternalPreviewScreenshotIfBlank: (onActivity) =>
      internalRuntime.refuseStateLosingPreviewScreenshotIfBlank(onActivity),
    sameAsLastChromeBrowserActionTarget: actions.sameAsLastChromeBrowserActionTarget,
    captureChromeScreenshotData: () => chromeScreenshots.captureChromeScreenshotData(),
    setLastActivity: state.setLastActivity,
    setLastError: state.setLastError,
  });

  return {
    chromeSessions,
    chromeProfiles,
    chromeTargets,
    chromeScreenshots,
    chromeRuntime,
    userActions,
    internalRuntime,
    stateSnapshots,
    chromeReveal,
    workspaceRefresh,
  };
}
