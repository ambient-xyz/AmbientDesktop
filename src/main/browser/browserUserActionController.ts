import { randomUUID } from "node:crypto";

import type {
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserScreenshotResult,
  BrowserStartInput,
  BrowserUserActionKind,
  BrowserUserActionProvider,
  BrowserUserActionState,
} from "../../shared/browserTypes";

export interface BrowserUserActionDetection {
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

export interface BrowserServiceUserActionControllerOptions {
  currentChromeTargetId: () => string | undefined;
  captureChromeScreenshot: (
    input: Pick<BrowserStartInput, "profileMode" | "artifactWorkspacePath">,
  ) => Promise<BrowserScreenshotResult>;
  ensureChromeStarted: (profileMode: BrowserProfileMode) => Promise<void>;
  ensureChromeTarget: (targetId?: string) => Promise<unknown>;
  detectChromeUserAction: () => Promise<BrowserUserActionDetection | undefined>;
  ensureInternalStarted: () => Promise<void>;
  detectInternalUserAction: () => Promise<unknown>;
  setLastActivity: (message: string) => void;
  setLastError: (message: string | undefined) => void;
  notifyStateChanged: () => void;
}

const USER_ACTION_TIMEOUT_MS = 15 * 60_000;
const USER_ACTION_ACTIVITY_HEARTBEAT_MS = 30_000;

export class BrowserServiceUserActionController {
  private userAction: BrowserUserActionState | undefined;
  private waiter:
    | {
        resolve: (value: BrowserUserActionResolution) => void;
        timeout: NodeJS.Timeout;
        activityTimer?: NodeJS.Timeout;
      }
    | undefined;

  constructor(private readonly options: BrowserServiceUserActionControllerOptions) {}

  get current(): BrowserUserActionState | undefined {
    return this.userAction;
  }

  activeBlock(input?: { userActionId?: string }): BrowserUserActionState | undefined {
    const current = this.userAction?.active ? this.userAction : undefined;
    if (!current) return undefined;
    if (input?.userActionId && input.userActionId === current.id) return undefined;
    this.options.setLastActivity("Browser warning is waiting for user action; new browser tool calls are paused.");
    this.options.notifyStateChanged();
    return current;
  }

  normalizeDetection(
    raw: unknown,
    input: { toolName: string; runtime: BrowserRuntimeKind; profileMode: BrowserProfileMode; targetId?: string; sourceThreadId?: string },
  ): BrowserUserActionState | undefined {
    const detection = normalizeBrowserUserActionDetection(raw);
    if (!detection) return undefined;
    return this.begin({ ...input, detection });
  }

  clear(message = "Browser user action cleared.", resolution: BrowserUserActionResolution = "cancel"): void {
    this.resolve(resolution);
    if (!this.userAction) return;
    this.userAction = undefined;
    this.options.setLastActivity(message);
    this.options.notifyStateChanged();
  }

  clearResolved(input: {
    runtime: BrowserRuntimeKind;
    profileMode: BrowserProfileMode;
    targetId?: string;
    message?: string;
  }): void {
    const current = this.userAction;
    if (!current) return;
    if (current.runtime !== input.runtime || current.profileMode !== input.profileMode) return;
    if (current.targetId && input.targetId && current.targetId !== input.targetId) return;
    this.clear(input.message ?? "Browser user action completed.", "resume");
  }

  async attachChromeEvidence(state: BrowserUserActionState, input: unknown = {}): Promise<BrowserUserActionState> {
    if (state.runtime !== "chrome" || state.screenshot) return state;
    try {
      const screenshot = await this.options.captureChromeScreenshot({
        profileMode: state.profileMode,
        artifactWorkspacePath: browserArtifactWorkspacePath(input),
      });
      const next: BrowserUserActionState = { ...state, screenshot };
      if (this.userAction?.id === state.id) {
        this.userAction = next;
        this.options.notifyStateChanged();
      }
      return next;
    } catch (error) {
      this.options.setLastError(browserUserActionErrorMessage(error));
      return state;
    }
  }

  async resume(): Promise<void> {
    if (!this.userAction?.active) {
      this.options.setLastActivity("No browser user action is waiting.");
      return;
    }
    if (!this.waiter) {
      await this.checkDetachedCompletion(this.userAction);
      return;
    }
    this.userAction = {
      ...this.userAction,
      status: "resuming",
      lastCheckedAt: new Date().toISOString(),
      message: "Checking whether the browser warning is complete.",
    };
    this.options.setLastActivity("Browser user action completion requested.");
    this.options.notifyStateChanged();
    this.resolve("resume");
  }

  cancel(): void {
    if (!this.userAction?.active) {
      this.options.setLastActivity("No browser user action is waiting.");
      return;
    }
    this.clear("Browser warning dismissed.", "cancel");
  }

  async waitForClear(
    initial: BrowserUserActionState,
    onActivity?: (message: string) => void,
  ): Promise<void> {
    if (initial.runtime === "internal") return this.waitForInternalClear(initial, onActivity);
    return this.waitForChromeClear(initial, onActivity);
  }

  async waitForChromeClear(
    initial: BrowserUserActionState,
    onActivity?: (message: string) => void,
  ): Promise<void> {
    let current = initial;
    while (true) {
      const resolution = await this.wait(current, onActivity);
      if (resolution === "cancel") throw new BrowserUserActionCanceledError(current);
      if (resolution === "timeout") throw new BrowserUserActionTimedOutError(current);
      const next = this.normalizeDetection(await this.options.detectChromeUserAction().catch(() => undefined), {
        toolName: current.toolName,
        runtime: "chrome",
        profileMode: current.profileMode,
        targetId: current.targetId ?? this.options.currentChromeTargetId(),
        sourceThreadId: current.sourceThreadId,
      });
      if (!next) {
        this.clear("Browser user action completed.", "resume");
        return;
      }
      current = next;
    }
  }

  async waitForInternalClear(
    initial: BrowserUserActionState,
    onActivity?: (message: string) => void,
  ): Promise<void> {
    let current = initial;
    while (true) {
      const resolution = await this.wait(current, onActivity);
      if (resolution === "cancel") throw new BrowserUserActionCanceledError(current);
      if (resolution === "timeout") throw new BrowserUserActionTimedOutError(current);
      const next = this.normalizeDetection(await this.options.detectInternalUserAction().catch(() => undefined), {
        toolName: current.toolName,
        runtime: "internal",
        profileMode: current.profileMode,
        sourceThreadId: current.sourceThreadId,
      });
      if (!next) {
        this.clear("Browser user action completed.", "resume");
        return;
      }
      current = next;
    }
  }

  begin(input: {
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
    this.options.setLastActivity(state.message);
    this.options.setLastError(undefined);
    this.options.notifyStateChanged();
    return state;
  }

  private resolve(value: BrowserUserActionResolution): void {
    const waiter = this.waiter;
    if (!waiter) return;
    clearTimeout(waiter.timeout);
    if (waiter.activityTimer) clearInterval(waiter.activityTimer);
    this.waiter = undefined;
    waiter.resolve(value);
  }

  private async wait(
    state: BrowserUserActionState,
    onActivity?: (message: string) => void,
  ): Promise<BrowserUserActionResolution> {
    if (this.waiter) return "resume";
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
        this.waiter = undefined;
        if (this.userAction?.id === state.id) {
          this.userAction = {
            ...this.userAction,
            active: false,
            status: "timed-out",
            lastCheckedAt: new Date().toISOString(),
            message: "Browser user action timed out.",
          };
          this.options.setLastActivity("Browser user action timed out.");
          this.options.notifyStateChanged();
        }
        resolve("timeout");
      }, USER_ACTION_TIMEOUT_MS);
      this.waiter = { resolve, timeout, ...(activityTimer ? { activityTimer } : {}) };
    });
  }

  private async checkDetachedCompletion(state: BrowserUserActionState): Promise<void> {
    const checking: BrowserUserActionState = {
      ...state,
      status: "resuming",
      lastCheckedAt: new Date().toISOString(),
      message: "Checking whether the browser warning is complete.",
    };
    this.userAction = checking;
    this.options.setLastActivity("Browser user action completion requested.");
    this.options.setLastError(undefined);
    this.options.notifyStateChanged();

    let raw: unknown;
    try {
      if (state.runtime === "chrome") {
        await this.options.ensureChromeStarted(state.profileMode);
        await this.options.ensureChromeTarget(state.targetId);
        raw = await this.options.detectChromeUserAction();
      } else {
        await this.options.ensureInternalStarted();
        raw = await this.options.detectInternalUserAction();
      }
    } catch (error) {
      const errorText = browserUserActionErrorMessage(error);
      const message = `Could not confirm whether the browser warning is complete. ${errorText}`.trim();
      this.userAction = {
        ...state,
        status: "waiting",
        lastCheckedAt: new Date().toISOString(),
        message,
      };
      this.options.setLastActivity(message);
      this.options.setLastError(errorText);
      this.options.notifyStateChanged();
      return;
    }

    const next = this.normalizeDetection(raw, {
      toolName: state.toolName,
      runtime: state.runtime,
      profileMode: state.profileMode,
      targetId: state.targetId,
      sourceThreadId: state.sourceThreadId,
    });
    if (next) {
      this.options.setLastActivity("Browser user action still needs attention.");
      return;
    }
    this.clear("Browser user action completed.", "resume");
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

function browserArtifactWorkspacePath(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = (input as { artifactWorkspacePath?: unknown }).artifactWorkspacePath;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function browserUserActionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
