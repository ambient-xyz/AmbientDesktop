import type {
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
  BrowserScreenshotResult,
  BrowserSearchInput,
  BrowserSearchResult,
  BrowserStartInput,
  BrowserTabSnapshot,
  BrowserViewBoundsInput,
} from "../../shared/browserTypes";
import type {
  ManagedChromeRevealInput,
  ManagedChromeRevealResult,
  ManagedChromeWindowBounds,
} from "./browserChromeRevealController";

export interface ChromeDevToolsEndpoint {
  port: number;
  webSocketDebuggerUrl: string;
}

export interface ChromeAvailability {
  available: boolean;
  executable?: string;
  unavailableReason?: string;
}

export interface BrowserServiceInternalStateSnapshot {
  running: boolean;
  activeTab?: BrowserTabSnapshot;
  lastActivity?: string;
  lastError?: string;
  viewVisible?: boolean;
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
