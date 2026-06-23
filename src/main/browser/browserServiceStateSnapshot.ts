import type {
  BrowserCapabilityState,
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserSessionLifecycleEvent,
  BrowserTabSnapshot,
  BrowserUserActionState,
} from "../../shared/browserTypes";
import type { ChromeAvailability } from "./browserService";
import type { BrowserPaths } from "./browserChromeSessionStore";

export interface BrowserServiceCopiedProfileSnapshot {
  available: boolean;
  sourceProfilePath?: string;
  copiedAt?: string;
}

export interface BrowserServiceActivePickerSnapshot {
  prompt: string;
  profileMode: BrowserProfileMode;
  startedAt: string;
}

export interface BrowserServiceInternalStateSnapshot {
  running: boolean;
  activeTab?: BrowserTabSnapshot;
  lastActivity?: string;
  lastError?: string;
  viewVisible?: boolean;
}

export interface BrowserServiceStateSnapshotInput {
  runtime: BrowserRuntimeKind;
  running: boolean;
  profileMode: BrowserProfileMode;
  internalAvailable: boolean;
  browserLoginBrokerAvailable: boolean;
  chrome: ChromeAvailability;
  sourceProfilePath?: string;
  paths: BrowserPaths;
  copiedProfile: BrowserServiceCopiedProfileSnapshot;
  activePicker?: BrowserServiceActivePickerSnapshot;
  activeTab?: BrowserTabSnapshot;
  userAction?: BrowserUserActionState;
  sessionId?: string;
  processId?: number;
  devToolsPort?: number;
  activeTargetId?: string;
  runtimeProfilePath?: string;
  attachedToExistingSession: boolean;
  lastSessionEvent?: BrowserSessionLifecycleEvent;
  lastActivity?: string;
  lastError?: string;
  viewVisible?: boolean;
}

export interface BrowserServiceStateSnapshotControllerOptions {
  getInternalState: () => Promise<BrowserServiceInternalStateSnapshot>;
  isChromeRunning: () => boolean;
  getProfileMode: () => BrowserProfileMode;
  getLastActiveTab: () => BrowserTabSnapshot | undefined;
  getLastActivity: () => string | undefined;
  getLastError: () => string | undefined;
  getLastSessionEvent: () => BrowserSessionLifecycleEvent | undefined;
  getActivePicker: () => BrowserServiceActivePickerSnapshot | undefined;
  getUserAction: () => BrowserUserActionState | undefined;
  getSessionId: () => string | undefined;
  getProcessId: () => number | undefined;
  getDevToolsPort: () => number | undefined;
  getActiveTargetId: () => string | undefined;
  getRuntimeProfilePath: () => string | undefined;
  getAttachedToExistingSession: () => boolean;
  hasInternalBrowser: () => boolean;
  browserLoginBrokerAvailable: () => boolean;
  chromeAvailability: () => ChromeAvailability;
  chromeProfileSourcePath: () => string | undefined;
  browserPaths: () => BrowserPaths;
  copiedProfile: () => BrowserServiceCopiedProfileSnapshot;
}

export class BrowserServiceStateSnapshotController {
  constructor(private readonly options: BrowserServiceStateSnapshotControllerOptions) {}

  async internalStateSnapshot(): Promise<BrowserCapabilityState> {
    const internal = await this.options.getInternalState();
    return this.base({
      runtime: "internal",
      running: internal.running,
      profileMode: "isolated",
      activeTab: internal.activeTab,
      lastActivity: internal.lastActivity ?? this.options.getLastActivity(),
      lastError: internal.lastError ?? this.options.getLastError(),
      viewVisible: internal.viewVisible,
    });
  }

  chromeStateSnapshot(): BrowserCapabilityState {
    return this.base({
      runtime: "chrome",
      running: this.options.isChromeRunning(),
      profileMode: this.options.getProfileMode(),
      activeTab: this.options.getLastActiveTab(),
      lastActivity: this.options.getLastActivity(),
      lastError: this.options.getLastError(),
    });
  }

  private base(input: {
    runtime: BrowserRuntimeKind;
    running: boolean;
    profileMode: BrowserProfileMode;
    activeTab?: BrowserTabSnapshot;
    lastActivity?: string;
    lastError?: string;
    viewVisible?: boolean;
  }): BrowserCapabilityState {
    return browserServiceStateSnapshot({
      ...input,
      internalAvailable: this.options.hasInternalBrowser(),
      browserLoginBrokerAvailable: this.options.browserLoginBrokerAvailable(),
      chrome: this.options.chromeAvailability(),
      sourceProfilePath: this.options.chromeProfileSourcePath(),
      paths: this.options.browserPaths(),
      copiedProfile: this.options.copiedProfile(),
      activePicker: this.options.getActivePicker(),
      userAction: this.options.getUserAction(),
      sessionId: this.options.getSessionId(),
      processId: this.options.getProcessId(),
      devToolsPort: this.options.getDevToolsPort(),
      activeTargetId: this.options.getActiveTargetId(),
      runtimeProfilePath: this.options.getRuntimeProfilePath(),
      attachedToExistingSession: this.options.getAttachedToExistingSession(),
      lastSessionEvent: this.options.getLastSessionEvent(),
    });
  }
}

export function browserServiceStateSnapshot(input: BrowserServiceStateSnapshotInput): BrowserCapabilityState {
  return {
    running: input.running,
    profileMode: input.profileMode,
    runtime: input.runtime,
    internalAvailable: input.internalAvailable,
    copiedProfileAvailable: input.copiedProfile.available,
    chromeAvailable: input.chrome.available,
    ...(input.chrome.unavailableReason ? { chromeUnavailableReason: input.chrome.unavailableReason } : {}),
    browserLoginBrokerAvailable: input.browserLoginBrokerAvailable,
    ...(input.viewVisible !== undefined ? { viewVisible: input.viewVisible } : {}),
    ...(input.sourceProfilePath ? { sourceProfilePath: input.sourceProfilePath } : {}),
    isolatedProfilePath: input.paths.isolatedProfile,
    isolatedProfilePersistent: true,
    copiedProfilePath: input.paths.copiedProfile,
    ...(input.copiedProfile.sourceProfilePath ? { copiedProfileSourcePath: input.copiedProfile.sourceProfilePath } : {}),
    ...(input.copiedProfile.copiedAt ? { copiedProfileCopiedAt: input.copiedProfile.copiedAt } : {}),
    ...(input.activePicker
      ? {
          pickerActive: true,
          pickerPrompt: input.activePicker.prompt,
          pickerStartedAt: input.activePicker.startedAt,
        }
      : {}),
    ...(input.activeTab ? { activeTab: input.activeTab } : {}),
    ...(input.userAction ? { userAction: input.userAction } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.runtime === "chrome" && input.running && input.processId ? { processId: input.processId } : {}),
    ...(input.runtime === "chrome" && input.running && input.devToolsPort ? { devToolsPort: input.devToolsPort } : {}),
    ...(input.runtime === "chrome" && input.running && input.activeTargetId ? { activeTargetId: input.activeTargetId } : {}),
    ...(input.runtime === "chrome" && input.running && input.runtimeProfilePath ? { profilePath: input.runtimeProfilePath } : {}),
    ...(input.runtime === "chrome" && input.running ? { attachedToExistingSession: input.attachedToExistingSession } : {}),
    ...(input.lastSessionEvent ? { lastSessionEvent: input.lastSessionEvent } : {}),
    ...(input.lastActivity ? { lastActivity: input.lastActivity } : {}),
    ...(input.lastError ? { lastError: input.lastError } : {}),
  };
}
