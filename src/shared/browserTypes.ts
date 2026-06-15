export type BrowserProfileMode = "isolated" | "copied";

export type BrowserRuntimeKind = "internal" | "chrome";

export type BrowserUserActionKind = "captcha" | "mfa" | "login" | "bot-check" | "consent" | "unknown-user-action";

export type BrowserUserActionProvider = "google" | "cloudflare" | "hcaptcha" | "recaptcha" | "turnstile" | "unknown";

export type BrowserUserActionStatus = "waiting" | "resuming" | "canceled" | "timed-out";

export interface BrowserTabSnapshot {
  id?: string;
  title?: string;
  url?: string;
}

export interface BrowserUserActionState {
  id: string;
  active: boolean;
  status: BrowserUserActionStatus;
  kind: BrowserUserActionKind;
  provider?: BrowserUserActionProvider;
  toolName: string;
  runtime: BrowserRuntimeKind;
  profileMode: BrowserProfileMode;
  sourceThreadId?: string;
  targetId?: string;
  url?: string;
  title?: string;
  origin?: string;
  pageExcerpt?: string;
  screenshot?: BrowserScreenshotResult;
  message: string;
  startedAt: string;
  lastCheckedAt: string;
  canAutoResume: boolean;
}

export type BrowserSessionLifecycleAction = "started" | "reattached" | "preserved" | "closed";

export interface BrowserSessionLifecycleEvent {
  action: BrowserSessionLifecycleAction;
  reason: string;
  at: string;
  profileMode: BrowserProfileMode;
  sessionId?: string;
}

export interface BrowserCapabilityState {
  running: boolean;
  profileMode: BrowserProfileMode;
  runtime: BrowserRuntimeKind;
  internalAvailable: boolean;
  copiedProfileAvailable: boolean;
  chromeAvailable: boolean;
  chromeUnavailableReason?: string;
  browserLoginBrokerAvailable: boolean;
  viewVisible?: boolean;
  sourceProfilePath?: string;
  isolatedProfilePath?: string;
  isolatedProfilePersistent?: boolean;
  copiedProfilePath?: string;
  copiedProfileSourcePath?: string;
  copiedProfileCopiedAt?: string;
  pickerActive?: boolean;
  pickerPrompt?: string;
  pickerStartedAt?: string;
  activeTab?: BrowserTabSnapshot;
  userAction?: BrowserUserActionState;
  sessionId?: string;
  processId?: number;
  devToolsPort?: number;
  activeTargetId?: string;
  profilePath?: string;
  attachedToExistingSession?: boolean;
  lastSessionEvent?: BrowserSessionLifecycleEvent;
  lastActivity?: string;
  lastError?: string;
}

export type BrowserRevealTarget = "internal" | "managed-chrome";

export type BrowserRevealStatus = "revealed" | "needs-internal-panel" | "not-running" | "unsupported" | "failed";

export interface BrowserRevealInput {
  userActionId?: string;
  targetId?: string;
}

export interface BrowserRevealResult {
  runtime: BrowserRuntimeKind;
  target: BrowserRevealTarget;
  status: BrowserRevealStatus;
  message: string;
  activeTab?: BrowserTabSnapshot;
  foregroundAttempted?: boolean;
  foregroundSucceeded?: boolean;
  method?: string;
  fallbackReason?: string;
}

export interface BrowserStartInput {
  profileMode?: BrowserProfileMode;
  runtime?: BrowserRuntimeKind;
  /**
   * Internal desktop runtime hint. When present, browser screenshots are stored
   * under this workspace so tool messages can render workspace-relative media.
   */
  artifactWorkspacePath?: string;
}

export interface BrowserNavigateInput {
  url: string;
  newTab?: boolean;
  profileMode?: BrowserProfileMode;
  runtime?: BrowserRuntimeKind;
  waitForUserAction?: boolean;
  userActionId?: string;
  sourceThreadId?: string;
}

export interface BrowserLocalPreviewInput {
  path: string;
}

export interface BrowserLocalPreviewSession {
  id: string;
  url: string;
  port: number;
  status: "started" | "reused";
  rootPath: string;
  requestedPath: string;
  workspaceRelativeRoot: string;
  workspaceRelativeRequestedPath: string;
  expiresAt: string;
}

export interface BrowserLocalPreviewResult {
  preview: BrowserLocalPreviewSession;
  content: BrowserPageContent | BrowserUserActionState;
}

export interface BrowserSearchInput {
  query: string;
  maxResults?: number;
  fetchContent?: boolean;
  profileMode?: BrowserProfileMode;
  runtime?: BrowserRuntimeKind;
  waitForUserAction?: boolean;
  userActionId?: string;
  sourceThreadId?: string;
}

export interface BrowserContentInput {
  url?: string;
  profileMode?: BrowserProfileMode;
  runtime?: BrowserRuntimeKind;
  waitForUserAction?: boolean;
  userActionId?: string;
  sourceThreadId?: string;
}

export interface BrowserEvaluateInput {
  code: string;
  profileMode?: BrowserProfileMode;
  runtime?: BrowserRuntimeKind;
}

export interface BrowserKeypressKeyInput {
  key?: string;
  code?: string;
  text?: string;
  durationMs?: number;
}

export interface BrowserKeypressInput {
  keys: BrowserKeypressKeyInput[];
  /**
   * "page" focuses the document body. Any other value is treated as a CSS selector.
   */
  focus?: string;
  profileMode?: BrowserProfileMode;
  runtime?: BrowserRuntimeKind;
}

export interface BrowserKeypressKeyResult {
  key: string;
  code: string;
  durationMs: number;
  text?: string;
}

export interface BrowserKeypressFocusResult {
  requested: string;
  found: boolean;
  tagName?: string;
  id?: string | null;
  className?: string | null;
  type?: string | null;
  text?: string | null;
}

export interface BrowserKeypressResult {
  dispatchedCount: number;
  keys: BrowserKeypressKeyResult[];
  focus: BrowserKeypressFocusResult;
  title?: string;
  url?: string;
}

export type BrowserCredentialScope = "workspace" | "global";

export interface BrowserCredentialSummary {
  id: string;
  label: string;
  origin: string;
  username: string;
  scope: BrowserCredentialScope;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface SaveBrowserCredentialInput {
  id?: string;
  label: string;
  origin: string;
  username: string;
  password: string;
  scope?: BrowserCredentialScope;
}

export interface DeleteBrowserCredentialInput {
  id: string;
}

export interface BrowserLoginInput {
  credentialId: string;
  expectedOrigin: string;
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  submit?: boolean;
  profileMode?: BrowserProfileMode;
  runtime?: BrowserRuntimeKind;
}

export interface BrowserLoginCredential {
  id: string;
  label: string;
  origin: string;
  username: string;
  password: string;
}

export interface BrowserLoginRequest extends BrowserLoginInput {
  credential: BrowserLoginCredential;
}

export interface BrowserLoginResult {
  status: "filled" | "submitted" | "needs-user-action";
  credentialId: string;
  credentialLabel: string;
  origin: string;
  username: string;
  url?: string;
  title?: string;
  submitted: boolean;
  userActionRequired: boolean;
  message: string;
}

export interface BrowserPickInput {
  prompt: string;
  profileMode?: BrowserProfileMode;
  runtime?: BrowserRuntimeKind;
}

export interface BrowserViewBoundsInput {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

export interface BrowserSearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
}

export interface BrowserPageLink {
  text: string;
  url: string;
}

export interface BrowserPageContent {
  title?: string;
  url?: string;
  text: string;
  links: BrowserPageLink[];
}

export interface BrowserScreenshotResult {
  path: string;
  artifactPath?: string;
  mimeType?: string;
  bytes: number;
  width?: number;
  height?: number;
  title?: string;
  url?: string;
  runtime?: BrowserRuntimeKind;
  targetId?: string;
  statePreserved?: boolean;
  sameTargetAsLastBrowserAction?: boolean;
  freshLoad?: boolean;
  evidenceWarning?: string;
}

export interface BrowserPickSelection {
  selector?: string;
  candidates: string[];
  tagName: string;
  id?: string | null;
  className?: string | null;
  text?: string | null;
  html?: string | null;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface BrowserPickResult {
  canceled: boolean;
  prompt: string;
  title?: string;
  url?: string;
  selections: BrowserPickSelection[];
}
