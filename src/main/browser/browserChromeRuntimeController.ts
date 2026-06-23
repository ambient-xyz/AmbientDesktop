import type {
  BrowserContentInput,
  BrowserEvaluateInput,
  BrowserKeypressFocusResult,
  BrowserKeypressInput,
  BrowserKeypressKeyInput,
  BrowserKeypressKeyResult,
  BrowserKeypressResult,
  BrowserLoginRequest,
  BrowserLoginResult,
  BrowserNavigateInput,
  BrowserPageContent,
  BrowserPickInput,
  BrowserPickResult,
  BrowserPickSelection,
  BrowserProfileMode,
  BrowserSearchInput,
  BrowserSearchResult,
  BrowserTabSnapshot,
  BrowserUserActionState,
} from "../../shared/browserTypes";
import {
  assertBrowserNavigationReachedRequestedPage,
  assertLocalBrowserNavigationReachable,
  normalizeBrowserUrl,
} from "./browserNavigation";
import type { BrowserChromeTargetController } from "./browserChromeTargetController";
import type {
  BrowserServiceUserActionController,
  BrowserUserActionDetection,
} from "./browserUserActionController";

export type BrowserNavigateResult = BrowserPageContent | BrowserUserActionState;
export type BrowserContentResult = BrowserPageContent | BrowserUserActionState;
export type BrowserSearchResults = BrowserSearchResult[] | BrowserUserActionState;

export type BrowserActivityInput = {
  onActivity?: (message: string) => void;
};

export interface NormalizedBrowserKeypressKey extends BrowserKeypressKeyResult {
  windowsVirtualKeyCode: number;
  electronKeyCode: string;
}

export interface NormalizedBrowserKeypressInput extends Omit<BrowserKeypressInput, "keys"> {
  keys: NormalizedBrowserKeypressKey[];
  focus: string;
}

type BrowserRuntimeChromeTargets = Pick<
  BrowserChromeTargetController,
  | "connectActivePage"
  | "createTarget"
  | "evaluatePage"
  | "getActiveTabSnapshot"
  | "navigateActiveTarget"
  | "waitForPageReady"
>;

type BrowserRuntimeUserActions = Pick<
  BrowserServiceUserActionController,
  "attachChromeEvidence" | "clearResolved" | "normalizeDetection" | "waitForChromeClear"
>;

type BrowserPageClient = {
  close(): void;
  request<T>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
};

export interface BrowserChromeRuntimeControllerOptions {
  chromeTargets: BrowserRuntimeChromeTargets;
  userActions: BrowserRuntimeUserActions;
  ensureChromeStarted: (profileMode?: BrowserProfileMode) => Promise<void>;
  closeActiveAboutBlankTarget: () => Promise<boolean>;
  detectChromeUserAction: () => Promise<BrowserUserActionDetection | undefined>;
  getProfileMode: () => BrowserProfileMode;
  getActiveTargetId: () => string | undefined;
  setLastActiveTab: (tab: BrowserTabSnapshot | undefined) => void;
  setLastActivity: (message: string) => void;
  rememberChromeBrowserActionTarget: (tab?: BrowserTabSnapshot) => void;
}

export class BrowserChromeRuntimeController {
  constructor(private readonly options: BrowserChromeRuntimeControllerOptions) {}

  async navigate(input: BrowserNavigateInput & BrowserActivityInput): Promise<BrowserNavigateResult> {
    const url = normalizeBrowserUrl(input.url);
    await assertLocalBrowserNavigationReachable(url);
    await this.options.ensureChromeStarted(input.profileMode);
    input.onActivity?.("Chrome browser runtime is ready.");
    try {
      if (input.newTab) await this.options.chromeTargets.createTarget(url);
      else await this.options.chromeTargets.navigateActiveTarget(url);
    } catch (error) {
      await this.options.closeActiveAboutBlankTarget().catch(() => undefined);
      throw error;
    }
    input.onActivity?.("Chrome navigation completed; checking page state.");
    const userAction = this.options.userActions.normalizeDetection(await this.options.detectChromeUserAction().catch(() => undefined), {
      toolName: "browser_nav",
      runtime: "chrome",
      profileMode: this.options.getProfileMode(),
      targetId: this.options.getActiveTargetId(),
      sourceThreadId: input.sourceThreadId,
    });
    if (userAction) {
      const evidencedUserAction = await this.options.userActions.attachChromeEvidence(userAction, input);
      if (input.waitForUserAction === false) return evidencedUserAction;
      await this.options.userActions.waitForChromeClear(evidencedUserAction, input.onActivity);
    }
    this.options.setLastActivity(`Navigated to ${url}.`);
    const content = await this.content({});
    input.onActivity?.("Chrome page content is readable.");
    if (!("text" in content)) return content;
    return assertBrowserNavigationReachedRequestedPage(url, content);
  }

  async content(input: BrowserContentInput & BrowserActivityInput = {}): Promise<BrowserContentResult> {
    const url = input.url ? normalizeBrowserUrl(input.url) : undefined;
    if (url) await assertLocalBrowserNavigationReachable(url);
    await this.options.ensureChromeStarted(input.profileMode);
    input.onActivity?.("Chrome browser runtime is ready.");
    if (url) {
      try {
        await this.options.chromeTargets.navigateActiveTarget(url);
      } catch (error) {
        await this.options.closeActiveAboutBlankTarget().catch(() => undefined);
        throw error;
      }
      input.onActivity?.("Chrome navigation completed for content read.");
    }
    const userAction = this.options.userActions.normalizeDetection(await this.options.detectChromeUserAction().catch(() => undefined), {
      toolName: "browser_content",
      runtime: "chrome",
      profileMode: this.options.getProfileMode(),
      targetId: this.options.getActiveTargetId(),
      sourceThreadId: input.sourceThreadId,
    });
    if (userAction) {
      const evidencedUserAction = await this.options.userActions.attachChromeEvidence(userAction, input);
      if (input.waitForUserAction === false) return evidencedUserAction;
      await this.options.userActions.waitForChromeClear(evidencedUserAction, input.onActivity);
    }
    const content = await this.options.chromeTargets.evaluatePage<BrowserPageContent>(contentExpression(MAX_BROWSER_TEXT));
    input.onActivity?.("Chrome DOM content was extracted.");
    this.options.userActions.clearResolved({
      runtime: "chrome",
      profileMode: this.options.getProfileMode(),
      targetId: this.options.getActiveTargetId(),
      message: "Browser user action no longer detected while reading the page.",
    });
    this.options.setLastActiveTab({ title: content.title, url: content.url, id: this.options.getActiveTargetId() });
    this.options.setLastActivity(input.url ? `Read page content from ${content.url ?? input.url}.` : "Read active page content.");
    return normalizePageContent(content);
  }

  async search(input: BrowserSearchInput & BrowserActivityInput): Promise<BrowserSearchResults> {
    await this.options.ensureChromeStarted(input.profileMode);
    input.onActivity?.("Chrome browser runtime is ready.");
    const limit = clampInteger(input.maxResults ?? 5, 1, 10);
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(input.query)}`;
    await this.options.chromeTargets.navigateActiveTarget(searchUrl);
    input.onActivity?.("Chrome search page navigation completed.");
    const userAction = this.options.userActions.normalizeDetection(await this.options.detectChromeUserAction().catch(() => undefined), {
      toolName: "browser_search",
      runtime: "chrome",
      profileMode: this.options.getProfileMode(),
      targetId: this.options.getActiveTargetId(),
      sourceThreadId: input.sourceThreadId,
    });
    if (userAction) {
      const evidencedUserAction = await this.options.userActions.attachChromeEvidence(userAction, input);
      if (input.waitForUserAction === false) return evidencedUserAction;
      await this.options.userActions.waitForChromeClear(evidencedUserAction, input.onActivity);
    }
    const results = await this.options.chromeTargets.evaluatePage<BrowserSearchResult[]>(searchExpression(limit));
    input.onActivity?.("Chrome search results were extracted.");
    this.options.userActions.clearResolved({
      runtime: "chrome",
      profileMode: this.options.getProfileMode(),
      targetId: this.options.getActiveTargetId(),
      message: "Browser user action no longer detected after search.",
    });
    const normalized = normalizeSearchResults(results).slice(0, limit);
    if (input.fetchContent) {
      for (const result of normalized.slice(0, Math.min(3, limit))) {
        try {
          await this.options.chromeTargets.navigateActiveTarget(result.url);
          input.onActivity?.(`Chrome opened search result ${result.url}.`);
          const content = await this.content({});
          if ("text" in content) result.content = content.text.slice(0, 4_000);
          input.onActivity?.(`Chrome read search result ${result.url}.`);
        } catch {
          // Keep the search result even if one target page fails.
        }
      }
    }
    this.options.setLastActivity(`Searched Google for "${input.query}".`);
    return normalized;
  }

  async evaluate(input: BrowserEvaluateInput & BrowserActivityInput): Promise<unknown> {
    await this.options.ensureChromeStarted(input.profileMode);
    input.onActivity?.("Chrome browser runtime is ready.");
    const result = await this.options.chromeTargets.evaluatePage<unknown>(userCodeExpression(input.code));
    input.onActivity?.("Chrome JavaScript evaluation completed.");
    this.options.rememberChromeBrowserActionTarget(await this.options.chromeTargets.getActiveTabSnapshot().catch(() => undefined));
    this.options.setLastActivity("Evaluated JavaScript in the active page.");
    return result;
  }

  async keypress(input: NormalizedBrowserKeypressInput): Promise<BrowserKeypressResult> {
    await this.options.ensureChromeStarted(input.profileMode);
    const client = await this.options.chromeTargets.connectActivePage();
    try {
      await client.request("Page.enable", {}, 5_000).catch(() => undefined);
      await client.request("Page.bringToFront", {}, 5_000).catch(() => undefined);
      const focus = await focusBrowserPage(client, input.focus);
      for (const key of input.keys) {
        await client.request("Input.dispatchKeyEvent", chromeKeyEventParams("keyDown", key), 5_000);
        if (key.durationMs > 0) await delay(key.durationMs);
        await client.request("Input.dispatchKeyEvent", chromeKeyEventParams("keyUp", key), 5_000);
      }
      const tab = await this.options.chromeTargets.getActiveTabSnapshot().catch(() => undefined);
      this.options.rememberChromeBrowserActionTarget(tab);
      this.options.setLastActivity(`Dispatched ${input.keys.length} browser keypress event(s).`);
      return {
        dispatchedCount: input.keys.length,
        keys: input.keys.map(keypressKeyResult),
        focus,
        title: tab?.title,
        url: tab?.url,
      };
    } finally {
      client.close();
    }
  }

  async login(input: BrowserLoginRequest): Promise<BrowserLoginResult> {
    await this.options.ensureChromeStarted(input.profileMode);
    const tab = await this.options.chromeTargets.getActiveTabSnapshot().catch(() => undefined);
    assertLoginOrigin(input.expectedOrigin, input.credential.origin, tab?.url);
    const raw = await this.options.chromeTargets.evaluatePage<Partial<BrowserLoginResult>>(browserLoginExpression(input), 15_000);
    if (input.submit !== false) await this.options.chromeTargets.waitForPageReady().catch(() => undefined);
    const result = normalizeBrowserLoginResult(raw, input);
    this.options.setLastActiveTab({ id: this.options.getActiveTargetId(), title: result.title, url: result.url });
    this.options.setLastActivity(`Filled stored credential "${input.credential.label}" for ${input.expectedOrigin}.`);
    return result;
  }

  async pick(input: BrowserPickInput): Promise<BrowserPickResult> {
    await this.options.ensureChromeStarted(input.profileMode);
    const raw = await this.options.chromeTargets.evaluatePage<BrowserPickSelection[] | null>(
      buildBrowserPickExpression(input.prompt),
      PICK_TIMEOUT_MS,
    );
    const tab = await this.options.chromeTargets.getActiveTabSnapshot().catch(() => undefined);
    const selections = Array.isArray(raw) ? raw.map(normalizePickSelection).filter(BooleanPickSelection) : [];
    this.options.setLastActivity(raw ? `Picked ${selections.length} browser element(s).` : "Browser picker canceled.");
    return {
      canceled: !raw,
      prompt: input.prompt,
      title: tab?.title,
      url: tab?.url,
      selections,
    };
  }
}

export const PICK_TIMEOUT_MS = 300_000;
export const MAX_BROWSER_TEXT = 12_000;
const MAX_PICK_HTML = 500;
const MAX_PICK_TEXT = 220;

export function normalizeBrowserLoginOrigin(input: string): string {
  const url = new URL(normalizeBrowserUrl(input));
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Browser login origin must use http or https.");
  return url.origin;
}

export function normalizeBrowserLoginRequest(input: BrowserLoginRequest): BrowserLoginRequest {
  const expectedOrigin = normalizeBrowserLoginOrigin(input.expectedOrigin);
  const credentialOrigin = normalizeBrowserLoginOrigin(input.credential.origin);
  return {
    ...input,
    expectedOrigin,
    credential: { ...input.credential, origin: credentialOrigin },
    submit: input.submit !== false,
  };
}

export function assertLoginOrigin(expectedOrigin: string, credentialOrigin: string, currentUrl: string | undefined): void {
  const expected = normalizeBrowserLoginOrigin(expectedOrigin);
  const credential = normalizeBrowserLoginOrigin(credentialOrigin);
  if (expected !== credential) {
    throw new Error(`Stored credential origin ${credential} does not match requested login origin ${expected}.`);
  }
  if (!currentUrl) throw new Error("Browser login requires an active page.");
  const current = new URL(currentUrl);
  if (current.protocol !== "http:" && current.protocol !== "https:") {
    throw new Error(`Browser login requires an http(s) page. Current page: ${currentUrl}`);
  }
  if (current.origin !== expected) {
    throw new Error(`Browser login origin mismatch. Expected ${expected}, current page is ${current.origin}.`);
  }
}

export function normalizeBrowserLoginResult(result: Partial<BrowserLoginResult>, input: BrowserLoginRequest): BrowserLoginResult {
  const status =
    result.status === "needs-user-action" || result.status === "submitted" || result.status === "filled"
      ? result.status
      : input.submit === false
        ? "filled"
        : "submitted";
  return {
    status,
    credentialId: input.credential.id,
    credentialLabel: input.credential.label,
    origin: input.expectedOrigin,
    username: input.credential.username,
    url: typeof result.url === "string" ? result.url : undefined,
    title: typeof result.title === "string" ? result.title : undefined,
    submitted: result.submitted === true,
    userActionRequired: result.userActionRequired === true || status === "needs-user-action",
    message:
      typeof result.message === "string"
        ? result.message
        : status === "needs-user-action"
          ? "Credential filled; user action appears required."
          : status === "submitted"
            ? "Credential filled and submit was attempted."
            : "Credential filled without submitting.",
  };
}

export function buildBrowserPickExpression(prompt: string): string {
  return `(${browserPickFunction.toString()})(${JSON.stringify(prompt)}, ${MAX_PICK_TEXT}, ${MAX_PICK_HTML})`;
}

export function cancelBrowserPickExpression(): string {
  return `(() => {
    const pickerWindow = window;
    if (typeof pickerWindow.__ambientBrowserPickerCancel === "function") {
      pickerWindow.__ambientBrowserPickerCancel();
      return true;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return false;
  })()`;
}

export function browserLoginExpression(input: BrowserLoginRequest): string {
  return `(${browserLoginFunction.toString()})(${JSON.stringify({
    username: input.credential.username,
    password: input.credential.password,
    usernameSelector: input.usernameSelector,
    passwordSelector: input.passwordSelector,
    submitSelector: input.submitSelector,
    submit: input.submit !== false,
  })})`;
}

function browserLoginFunction(input: {
  username: string;
  password: string;
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  submit: boolean;
}): Partial<BrowserLoginResult> {
  const visible = (element: Element | null): element is HTMLElement => {
    if (!element || !(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const one = (selector: string, label: string): HTMLElement => {
    const matches = Array.from(document.querySelectorAll(selector)).filter(visible);
    if (matches.length === 0) throw new Error(`No visible ${label} matched selector: ${selector}`);
    if (matches.length > 1) throw new Error(`Multiple visible ${label} elements matched selector: ${selector}`);
    return matches[0];
  };
  const candidates = (selectors: string[]): HTMLElement | undefined => {
    for (const selector of selectors) {
      const match = Array.from(document.querySelectorAll(selector)).find(visible);
      if (match) return match;
    }
    return undefined;
  };
  const disabled = (element: HTMLElement): boolean => {
    if ((element as HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement).disabled) return true;
    return element.getAttribute("aria-disabled") === "true";
  };
  const submitLike = (element: HTMLElement): boolean => {
    if (element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement) return true;
    if (element instanceof HTMLInputElement) {
      const type = (element.getAttribute("type") || "submit").toLowerCase();
      return type === "submit" || type === "button" || type === "image";
    }
    return element.getAttribute("role") === "button";
  };
  const usernameField =
    input.usernameSelector
      ? one(input.usernameSelector, "username field")
      : candidates([
          "input[autocomplete='username']",
          "input[type='email']",
          "input[name*='email' i]",
          "input[id*='email' i]",
          "input[name*='user' i]",
          "input[id*='user' i]",
          "input[type='text']",
          "input:not([type])",
        ]);
  const passwordField =
    input.passwordSelector
      ? one(input.passwordSelector, "password field")
      : candidates(["input[type='password']", "input[autocomplete='current-password']"]);
  if (!passwordField) throw new Error("No visible password field was found on the active page.");
  const passwordInput = passwordField as HTMLInputElement;
  if ((passwordInput.getAttribute("type") || "").toLowerCase() !== "password") {
    throw new Error("Refusing to fill a stored password into a non-password field.");
  }
  const setValue = (element: HTMLElement | undefined, value: string) => {
    if (!element) return false;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      throw new Error("Credential target is not an input field.");
    }
    if (disabled(element)) throw new Error("Refusing to fill a stored credential into a disabled input field.");
    element.focus();
    element.value = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "" }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };
  const usernameFilled = setValue(usernameField, input.username);
  const passwordFilled = setValue(passwordInput, input.password);
  let submitted = false;
  if (input.submit) {
    const submitTarget = input.submitSelector
      ? one(input.submitSelector, "submit control")
      : candidates([
          "button[type='submit']",
          "input[type='submit']",
          "button[name*='login' i]",
          "button[id*='login' i]",
          "button",
        ]);
    if (submitTarget) {
      if (disabled(submitTarget)) throw new Error("Refusing to click a disabled submit control.");
      if (!submitLike(submitTarget)) throw new Error("Submit selector must match a button, submit input, link, or role=button element.");
      submitTarget.click();
      submitted = true;
    } else if (passwordInput.form) {
      passwordInput.form.requestSubmit();
      submitted = true;
    }
  }
  const pageText = String(document.body?.innerText || "").toLowerCase();
  const userActionRequired = /\b(mfa|2fa|two-factor|two factor|captcha|passkey|security key|verification code|one-time code|otp)\b/.test(
    pageText,
  );
  return {
    url: location.href,
    title: document.title || "",
    submitted,
    userActionRequired,
    status: userActionRequired ? "needs-user-action" : submitted ? "submitted" : "filled",
    message: userActionRequired
      ? "Credential filled; user action appears required."
      : submitted
        ? "Credential filled and submit was attempted."
        : "Credential filled without submitting.",
    usernameFilled,
    passwordFilled,
  } as Partial<BrowserLoginResult> & { usernameFilled: boolean; passwordFilled: boolean };
}

function browserPickFunction(message: string, maxText: number, maxHtml: number): Promise<BrowserPickSelection[] | null> {
  const pickerWindow = window as Window & { __ambientBrowserPickerCancel?: () => void };
  const cssEscape = (value: string): string => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const cssPath = (element: Element): string => {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      const tag = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const siblings = [...parent.children].filter((sibling) => sibling.tagName === current!.tagName);
      const index = siblings.indexOf(current) + 1;
      parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
      current = parent;
    }
    return parts.join(" > ");
  };
  const selectorCandidates = (element: Element): string[] => {
    const candidates: string[] = [];
    const htmlElement = element as HTMLElement;
    const testId = htmlElement.getAttribute("data-testid") || htmlElement.getAttribute("data-test");
    if (testId) candidates.push(`[data-testid="${cssEscape(testId)}"]`);
    if (htmlElement.id) candidates.push(`#${cssEscape(htmlElement.id)}`);
    const name = htmlElement.getAttribute("name");
    if (name) candidates.push(`${element.tagName.toLowerCase()}[name="${cssEscape(name)}"]`);
    const aria = htmlElement.getAttribute("aria-label");
    if (aria) candidates.push(`${element.tagName.toLowerCase()}[aria-label="${cssEscape(aria)}"]`);
    candidates.push(cssPath(element));
    return [...new Set(candidates)].filter(Boolean).slice(0, 5);
  };
  const buildElementInfo = (element: Element): BrowserPickSelection => {
    const htmlElement = element as HTMLElement;
    const rect = htmlElement.getBoundingClientRect();
    const candidates = selectorCandidates(element);
    return {
      selector: candidates[0],
      candidates,
      tagName: element.tagName.toLowerCase(),
      id: htmlElement.id || null,
      className: typeof htmlElement.className === "string" ? htmlElement.className || null : null,
      text: htmlElement.textContent?.trim().replace(/\s+/g, " ").slice(0, maxText) || null,
      html: htmlElement.outerHTML.slice(0, maxHtml),
      boundingBox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  };

  return new Promise((resolve) => {
    pickerWindow.__ambientBrowserPickerCancel?.();
    const existing = document.querySelector("[data-ambient-browser-picker]");
    existing?.remove();
    const selectedElements = new Set<Element>();
    const selections: BrowserPickSelection[] = [];
    let finished = false;
    const overlay = document.createElement("div");
    overlay.dataset.ambientBrowserPicker = "true";
    overlay.setAttribute("role", "region");
    overlay.setAttribute("aria-label", "Ambient browser picker");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    const highlight = document.createElement("div");
    highlight.style.cssText =
      "position:absolute;border:2px solid #2e8ca7;background:rgba(46,140,167,0.12);pointer-events:none;transition:all 0.08s";
    const banner = document.createElement("div");
    banner.style.cssText =
      "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;pointer-events:auto;background:#172027;color:white;border-radius:8px;padding:10px 14px;font:13px system-ui,-apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 12px 36px rgba(0,0,0,0.28);max-width:min(680px,calc(100vw - 40px));";
    overlay.append(highlight, banner);
    document.body.append(overlay);

    const updateBanner = () => {
      banner.textContent = `${message} (${selections.length} selected, Cmd/Ctrl+click to add, Enter to finish, Esc to cancel)`;
    };
    const cleanup = () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      if (pickerWindow.__ambientBrowserPickerCancel === cancelPicker) delete pickerWindow.__ambientBrowserPickerCancel;
      selectedElements.forEach((element) => {
        (element as HTMLElement).style.outline = "";
      });
      overlay.remove();
    };
    const finish = (value: BrowserPickSelection[] | null) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(value);
    };
    const cancelPicker = () => finish(null);
    const elementAt = (event: MouseEvent): Element | null => {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      if (!element || overlay.contains(element) || banner.contains(element)) return null;
      return element;
    };
    const onMove = (event: MouseEvent) => {
      const element = elementAt(event);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      highlight.style.left = `${rect.left}px`;
      highlight.style.top = `${rect.top}px`;
      highlight.style.width = `${rect.width}px`;
      highlight.style.height = `${rect.height}px`;
    };
    const onClick = (event: MouseEvent) => {
      const element = elementAt(event);
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      const info = buildElementInfo(element);
      if (event.metaKey || event.ctrlKey) {
        if (!selectedElements.has(element)) {
          selectedElements.add(element);
          (element as HTMLElement).style.outline = "3px solid #2e8ca7";
          selections.push(info);
          updateBanner();
        }
        return;
      }
      finish(selections.length > 0 ? selections : [info]);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
      if (event.key === "Enter" && selections.length > 0) {
        event.preventDefault();
        finish(selections);
      }
    };

    updateBanner();
    pickerWindow.__ambientBrowserPickerCancel = cancelPicker;
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  });
}

export function contentExpression(maxText: number): string {
  void maxText;
  return `(() => {
    const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    return {
      title: document.title || "",
      url: location.href,
      text: document.body?.innerText || "",
      links: Array.from(document.querySelectorAll("a[href]")).map((anchor) => ({
        text: clean(anchor.textContent).slice(0, 160),
        url: anchor.href,
      })).filter((link) => link.url && link.text).slice(0, 30),
    };
  })()`;
}

export function searchExpression(limit: number): string {
  return `(() => {
    const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const seen = new Set();
    const blockedHost = (url) => {
      try {
        const host = new URL(url).hostname;
        return host.includes("google.") || host === "webcache.googleusercontent.com";
      } catch {
        return true;
      }
    };
    return Array.from(document.querySelectorAll("a[href]")).map((anchor) => {
      const title = clean(anchor.textContent);
      const url = anchor.href;
      const container = anchor.closest("div");
      const snippet = clean(container?.textContent || "").slice(title.length, title.length + 280).trim();
      return { title, url, snippet };
    }).filter((item) => {
      if (!item.title || !item.url || blockedHost(item.url) || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    }).slice(0, ${limit});
  })()`;
}

export function userCodeExpression(code: string): string {
  return `(() => {
    const code = ${JSON.stringify(code)};
    const AsyncFunction = (async function () {}).constructor;
    const statementLike = /(^|[\\s;])(?:return|const|let|var|for|while|if|switch|try|throw)\\b|;/.test(code);
    if (statementLike) return new AsyncFunction(code)();
    try {
      return new AsyncFunction(\`return (\${code})\`)();
    } catch (expressionError) {
      if (!(expressionError instanceof SyntaxError)) throw expressionError;
      return new AsyncFunction(code)();
    }
  })()`;
}

export function normalizePageContent(content: BrowserPageContent): BrowserPageContent {
  return {
    title: content.title,
    url: content.url,
    text: String(content.text ?? ""),
    links: Array.isArray(content.links)
      ? content.links
          .filter((link) => link && typeof link.url === "string" && typeof link.text === "string")
          .slice(0, 30)
      : [],
  };
}

export function normalizeSearchResults(results: BrowserSearchResult[]): BrowserSearchResult[] {
  if (!Array.isArray(results)) return [];
  return results
    .filter((item) => item && typeof item.title === "string" && typeof item.url === "string")
    .map((item) => ({
      title: item.title.slice(0, 220),
      url: item.url,
      ...(item.snippet ? { snippet: item.snippet.slice(0, 400) } : {}),
      ...(item.content ? { content: item.content.slice(0, 4_000) } : {}),
    }));
}

export function normalizePickSelection(selection: BrowserPickSelection): BrowserPickSelection | undefined {
  if (!selection || typeof selection !== "object" || typeof selection.tagName !== "string") return undefined;
  const candidates = Array.isArray(selection.candidates)
    ? selection.candidates.filter((candidate) => typeof candidate === "string").slice(0, 5)
    : [];
  const boundingBox = normalizePickBoundingBox(selection.boundingBox);
  return {
    tagName: selection.tagName,
    candidates,
    selector: typeof selection.selector === "string" ? selection.selector : candidates[0],
    id: typeof selection.id === "string" ? selection.id : null,
    className: typeof selection.className === "string" ? selection.className.slice(0, 220) : null,
    text: typeof selection.text === "string" ? selection.text.slice(0, MAX_PICK_TEXT) : null,
    html: typeof selection.html === "string" ? selection.html.slice(0, MAX_PICK_HTML) : null,
    ...(boundingBox ? { boundingBox } : {}),
  };
}

export function BooleanPickSelection(value: BrowserPickSelection | undefined): value is BrowserPickSelection {
  return Boolean(value);
}

function normalizePickBoundingBox(box: BrowserPickSelection["boundingBox"]): BrowserPickSelection["boundingBox"] | undefined {
  if (!box) return undefined;
  const x = Number(box.x);
  const y = Number(box.y);
  const width = Number(box.width);
  const height = Number(box.height);
  if (![x, y, width, height].every(Number.isFinite)) return undefined;
  return {
    x: clampInteger(x, -100_000, 100_000),
    y: clampInteger(y, -100_000, 100_000),
    width: clampInteger(width, 0, 100_000),
    height: clampInteger(height, 0, 100_000),
  };
}

export function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_KEYPRESS_DURATION_MS = 80;
const MAX_KEYPRESS_DURATION_MS = 5_000;
const MAX_BROWSER_KEYPRESS_KEYS = 100;

export function normalizeBrowserKeypressInput(input: BrowserKeypressInput): NormalizedBrowserKeypressInput {
  const rawKeys = Array.isArray(input.keys) ? input.keys : [];
  if (rawKeys.length === 0) throw new Error("browser_keypress requires at least one key.");
  if (rawKeys.length > MAX_BROWSER_KEYPRESS_KEYS) {
    throw new Error(`browser_keypress accepts at most ${MAX_BROWSER_KEYPRESS_KEYS} keys per call.`);
  }
  return {
    ...input,
    focus: nonEmptyString(input.focus) ?? "page",
    keys: rawKeys.map(normalizeBrowserKeypressKey),
  };
}

function normalizeBrowserKeypressKey(raw: BrowserKeypressKeyInput | string, index: number): NormalizedBrowserKeypressKey {
  const record = typeof raw === "string" ? { key: raw } : raw && typeof raw === "object" ? raw : {};
  const suppliedKey = nonEmptyString(record.key);
  const suppliedCode = nonEmptyString(record.code);
  const token = suppliedKey ?? suppliedCode;
  if (!token) throw new Error(`browser_keypress key ${index + 1} needs key or code.`);
  const durationMs = clampInteger(numberOrDefault(record.durationMs, DEFAULT_KEYPRESS_DURATION_MS), 0, MAX_KEYPRESS_DURATION_MS);
  const explicitText = typeof record.text === "string" ? record.text : undefined;
  const special = specialBrowserKeyDefinition(token, suppliedCode);
  if (special) {
    return {
      ...special,
      durationMs,
      ...(explicitText !== undefined ? { text: explicitText } : special.text !== undefined ? { text: special.text } : {}),
    };
  }
  const codeAsLetter = keyFromCode(token);
  const printable = codeAsLetter ?? (token.length === 1 ? token : undefined);
  if (printable) {
    const code = suppliedCode ?? codeForPrintableKey(printable);
    return {
      key: printable,
      code,
      durationMs,
      text: explicitText ?? printable,
      windowsVirtualKeyCode: virtualKeyCodeForPrintable(printable),
      electronKeyCode: electronKeyCodeForPrintable(printable),
    };
  }
  return {
    key: suppliedKey ?? token,
    code: suppliedCode ?? token,
    durationMs,
    ...(explicitText ? { text: explicitText } : {}),
    windowsVirtualKeyCode: 0,
    electronKeyCode: suppliedCode ?? suppliedKey ?? token,
  };
}

function specialBrowserKeyDefinition(
  token: string,
  suppliedCode: string | undefined,
): Omit<NormalizedBrowserKeypressKey, "durationMs"> | undefined {
  const normalized = token === " " ? "space" : token.toLowerCase();
  const definitions: Record<string, Omit<NormalizedBrowserKeypressKey, "durationMs">> = {
    space: { key: " ", code: suppliedCode ?? "Space", text: " ", windowsVirtualKeyCode: 32, electronKeyCode: "Space" },
    arrowup: { key: "ArrowUp", code: suppliedCode ?? "ArrowUp", windowsVirtualKeyCode: 38, electronKeyCode: "ArrowUp" },
    arrowdown: { key: "ArrowDown", code: suppliedCode ?? "ArrowDown", windowsVirtualKeyCode: 40, electronKeyCode: "ArrowDown" },
    arrowleft: { key: "ArrowLeft", code: suppliedCode ?? "ArrowLeft", windowsVirtualKeyCode: 37, electronKeyCode: "ArrowLeft" },
    arrowright: { key: "ArrowRight", code: suppliedCode ?? "ArrowRight", windowsVirtualKeyCode: 39, electronKeyCode: "ArrowRight" },
    enter: { key: "Enter", code: suppliedCode ?? "Enter", windowsVirtualKeyCode: 13, electronKeyCode: "Enter" },
    escape: { key: "Escape", code: suppliedCode ?? "Escape", windowsVirtualKeyCode: 27, electronKeyCode: "Escape" },
    esc: { key: "Escape", code: suppliedCode ?? "Escape", windowsVirtualKeyCode: 27, electronKeyCode: "Escape" },
    backspace: { key: "Backspace", code: suppliedCode ?? "Backspace", windowsVirtualKeyCode: 8, electronKeyCode: "Backspace" },
    tab: { key: "Tab", code: suppliedCode ?? "Tab", windowsVirtualKeyCode: 9, electronKeyCode: "Tab" },
    shift: { key: "Shift", code: suppliedCode ?? "ShiftLeft", windowsVirtualKeyCode: 16, electronKeyCode: "Shift" },
    control: { key: "Control", code: suppliedCode ?? "ControlLeft", windowsVirtualKeyCode: 17, electronKeyCode: "Control" },
    ctrl: { key: "Control", code: suppliedCode ?? "ControlLeft", windowsVirtualKeyCode: 17, electronKeyCode: "Control" },
    alt: { key: "Alt", code: suppliedCode ?? "AltLeft", windowsVirtualKeyCode: 18, electronKeyCode: "Alt" },
    meta: { key: "Meta", code: suppliedCode ?? "MetaLeft", windowsVirtualKeyCode: 91, electronKeyCode: "Meta" },
  };
  return definitions[normalized];
}

function keyFromCode(code: string): string | undefined {
  const letter = /^Key([A-Z])$/i.exec(code)?.[1];
  if (letter) return letter.toLowerCase();
  const digit = /^Digit([0-9])$/i.exec(code)?.[1];
  return digit;
}

function codeForPrintableKey(key: string): string {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return key === " " ? "Space" : key;
}

function virtualKeyCodeForPrintable(key: string): number {
  if (/^[a-z]$/i.test(key)) return key.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(key)) return key.charCodeAt(0);
  if (key === " ") return 32;
  return key.charCodeAt(0) || 0;
}

function electronKeyCodeForPrintable(key: string): string {
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  return key === " " ? "Space" : key;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function chromeKeyEventParams(type: "keyDown" | "keyUp", key: NormalizedBrowserKeypressKey): Record<string, unknown> {
  return {
    type,
    key: key.key,
    code: key.code,
    windowsVirtualKeyCode: key.windowsVirtualKeyCode,
    nativeVirtualKeyCode: key.windowsVirtualKeyCode,
    ...(type === "keyDown" && key.text !== undefined ? { text: key.text, unmodifiedText: key.text } : {}),
  };
}

async function focusBrowserPage(client: BrowserPageClient, focus: string): Promise<BrowserKeypressFocusResult> {
  const result = await client.request<{
    exceptionDetails?: { text?: string; exception?: { description?: string } };
    result?: { value?: unknown };
  }>(
    "Runtime.evaluate",
    {
      expression: browserKeypressFocusExpression(focus),
      awaitPromise: true,
      returnByValue: true,
    },
    5_000,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Browser focus failed.");
  }
  return normalizeBrowserKeypressFocusResult(result.result?.value, focus);
}

export function browserKeypressFocusExpression(focus: string): string {
  return `
    (() => {
      const requested = ${JSON.stringify(focus)};
      const selector = requested && requested !== "page" ? requested : "";
      let target = selector ? document.querySelector(selector) : document.body;
      const found = Boolean(target);
      if (!target) target = document.body;
      if (target instanceof HTMLElement) {
        if (target === document.body && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
      const active = document.activeElement instanceof Element ? document.activeElement : target;
      const value = active && "value" in active && typeof active.value === "string" ? active.value : undefined;
      return {
        requested,
        found,
        tagName: active?.tagName ?? undefined,
        id: active?.id ?? null,
        className: typeof active?.className === "string" ? active.className : null,
        type: active?.getAttribute?.("type") ?? null,
        text: (value ?? active?.textContent ?? "").slice(0, 120),
      };
    })()
  `;
}

function normalizeBrowserKeypressFocusResult(value: unknown, requested: string): BrowserKeypressFocusResult {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    requested,
    found: record.found === true,
    ...(typeof record.tagName === "string" ? { tagName: record.tagName } : {}),
    ...(typeof record.id === "string" || record.id === null ? { id: record.id } : {}),
    ...(typeof record.className === "string" || record.className === null ? { className: record.className } : {}),
    ...(typeof record.type === "string" || record.type === null ? { type: record.type } : {}),
    ...(typeof record.text === "string" || record.text === null ? { text: record.text ?? "" } : {}),
  };
}

export function keypressKeyResult(key: BrowserKeypressKeyResult): BrowserKeypressKeyResult {
  return {
    key: key.key,
    code: key.code,
    durationMs: key.durationMs,
    ...(key.text !== undefined ? { text: key.text } : {}),
  };
}
