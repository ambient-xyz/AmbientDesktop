import type { BrowserLoginRequest, BrowserLoginResult, BrowserPickSelection } from "../../shared/browserTypes";
import { normalizeBrowserUrl } from "./browserNavigation";

export const PICK_TIMEOUT_MS = 300_000;
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
  const usernameField = input.usernameSelector
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
  const passwordField = input.passwordSelector
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
      : candidates(["button[type='submit']", "input[type='submit']", "button[name*='login' i]", "button[id*='login' i]", "button"]);
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
