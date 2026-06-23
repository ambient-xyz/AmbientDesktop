import type { ChildProcess } from "node:child_process";
import type {
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserSessionLifecycleEvent,
  BrowserTabSnapshot,
} from "../../shared/browserTypes";
import type { BrowserChromeLifecycleState } from "./browserChromeLifecycleController";
import type { BrowserServiceControllerStateAccessors } from "./browserServiceControllers";

export interface BrowserServiceActivePickerState {
  prompt: string;
  profileMode: BrowserProfileMode;
  startedAt: string;
}

export interface BrowserServiceMutableState {
  child: ChildProcess | undefined;
  port: number | undefined;
  browserWsUrl: string | undefined;
  activeTargetId: string | undefined;
  chromeSessionId: string | undefined;
  chromeProcessId: number | undefined;
  attachedChrome: boolean;
  profileMode: BrowserProfileMode;
  runtimeProfilePath: string | undefined;
  runtimeProfileEphemeral: boolean;
  lastActiveTab: BrowserTabSnapshot | undefined;
  lastChromeBrowserActionTarget: BrowserTabSnapshot | undefined;
  lastActivity: string | undefined;
  lastError: string | undefined;
  lastSessionEvent: BrowserSessionLifecycleEvent | undefined;
  activeRuntime: BrowserRuntimeKind;
  activePicker: BrowserServiceActivePickerState | undefined;
}

const BROWSER_SERVICE_MUTABLE_STATE_KEYS = [
  "child",
  "port",
  "browserWsUrl",
  "activeTargetId",
  "chromeSessionId",
  "chromeProcessId",
  "attachedChrome",
  "profileMode",
  "runtimeProfilePath",
  "runtimeProfileEphemeral",
  "lastActiveTab",
  "lastChromeBrowserActionTarget",
  "lastActivity",
  "lastError",
  "lastSessionEvent",
  "activeRuntime",
  "activePicker",
] as const satisfies readonly (keyof BrowserServiceMutableState)[];

export function createBrowserServiceMutableState(input: {
  profileMode: BrowserProfileMode;
  activeRuntime: BrowserRuntimeKind;
}): BrowserServiceMutableState {
  return {
    child: undefined,
    port: undefined,
    browserWsUrl: undefined,
    activeTargetId: undefined,
    chromeSessionId: undefined,
    chromeProcessId: undefined,
    attachedChrome: false,
    profileMode: input.profileMode,
    runtimeProfilePath: undefined,
    runtimeProfileEphemeral: false,
    lastActiveTab: undefined,
    lastChromeBrowserActionTarget: undefined,
    lastActivity: undefined,
    lastError: undefined,
    lastSessionEvent: undefined,
    activeRuntime: input.activeRuntime,
    activePicker: undefined,
  };
}

export function defineBrowserServiceMutableStateProperties(
  host: object,
  state: BrowserServiceMutableState,
): void {
  for (const key of BROWSER_SERVICE_MUTABLE_STATE_KEYS) {
    Object.defineProperty(host, key, {
      configurable: true,
      enumerable: false,
      get: () => state[key],
      set: (value: BrowserServiceMutableState[typeof key]) => {
        setBrowserServiceStateValue(state, key, value);
      },
    });
  }
}

export function createBrowserServiceControllerStateAccessors(
  state: BrowserServiceMutableState,
): BrowserServiceControllerStateAccessors {
  return {
    getPort: () => state.port,
    getBrowserWsUrl: () => state.browserWsUrl,
    setBrowserWsUrl: (url) => {
      state.browserWsUrl = url;
    },
    getActiveTargetId: () => state.activeTargetId,
    setActiveTargetId: (targetId) => {
      state.activeTargetId = targetId;
    },
    getLastActiveTab: () => state.lastActiveTab,
    setLastActiveTab: (tab) => {
      state.lastActiveTab = tab;
    },
    getLastActivity: () => state.lastActivity,
    setLastActivity: (message) => {
      state.lastActivity = message;
    },
    getLastError: () => state.lastError,
    setLastError: (message) => {
      state.lastError = message;
    },
    getLastSessionEvent: () => state.lastSessionEvent,
    getActivePicker: () => state.activePicker,
    getProfileMode: () => state.profileMode,
    getRuntimeProfilePath: () => state.runtimeProfilePath,
    getAttachedToExistingSession: () => state.attachedChrome,
    getSessionId: () => state.chromeSessionId,
    getProcessId: () => state.chromeProcessId,
    getActiveRuntime: () => state.activeRuntime,
    setActiveRuntime: (runtime) => {
      state.activeRuntime = runtime;
    },
  };
}

function setBrowserServiceStateValue<Key extends keyof BrowserServiceMutableState>(
  state: BrowserServiceMutableState,
  key: Key,
  value: BrowserServiceMutableState[Key],
): void {
  state[key] = value;
}

export function createBrowserChromeLifecycleState(
  state: BrowserServiceMutableState,
): BrowserChromeLifecycleState {
  return {
    getChild: () => state.child,
    setChild: (child) => {
      state.child = child;
    },
    getPort: () => state.port,
    setPort: (port) => {
      state.port = port;
    },
    getBrowserWsUrl: () => state.browserWsUrl,
    setBrowserWsUrl: (url) => {
      state.browserWsUrl = url;
    },
    getActiveTargetId: () => state.activeTargetId,
    setActiveTargetId: (targetId) => {
      state.activeTargetId = targetId;
    },
    getSessionId: () => state.chromeSessionId,
    setSessionId: (sessionId) => {
      state.chromeSessionId = sessionId;
    },
    getProcessId: () => state.chromeProcessId,
    setProcessId: (processId) => {
      state.chromeProcessId = processId;
    },
    getAttachedChrome: () => state.attachedChrome,
    setAttachedChrome: (attached) => {
      state.attachedChrome = attached;
    },
    getProfileMode: () => state.profileMode,
    setProfileMode: (profileMode) => {
      state.profileMode = profileMode;
    },
    getRuntimeProfilePath: () => state.runtimeProfilePath,
    setRuntimeProfilePath: (path) => {
      state.runtimeProfilePath = path;
    },
    getRuntimeProfileEphemeral: () => state.runtimeProfileEphemeral,
    setRuntimeProfileEphemeral: (ephemeral) => {
      state.runtimeProfileEphemeral = ephemeral;
    },
    setLastActiveTab: (tab) => {
      state.lastActiveTab = tab;
    },
    setLastChromeBrowserActionTarget: (tab) => {
      state.lastChromeBrowserActionTarget = tab;
    },
    setLastActivity: (message) => {
      state.lastActivity = message;
    },
    setLastError: (message) => {
      state.lastError = message;
    },
    setLastSessionEvent: (event) => {
      state.lastSessionEvent = event;
    },
    setActiveRuntime: (runtime) => {
      state.activeRuntime = runtime;
    },
  };
}
