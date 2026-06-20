import type { BrowserTabSnapshot } from "../../shared/browserTypes";
import {
  browserNavigationDidNotCommitMessage,
  browserNavigationReachedExpectedUrl,
  isAboutBlankUrl,
  normalizeBrowserUrl,
  PAGE_READY_TIMEOUT_MS,
} from "./browserNavigation";

export interface ChromeVersionInfo {
  webSocketDebuggerUrl?: string;
}

export interface ChromeTargetInfo {
  id: string;
  type: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

export interface BrowserChromeWindowBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BrowserChromeTargetControllerOptions {
  getPort: () => number | undefined;
  getBrowserWsUrl: () => string | undefined;
  setBrowserWsUrl: (url: string | undefined) => void;
  getActiveTargetId: () => string | undefined;
  setActiveTargetId: (targetId: string | undefined) => void;
  setLastActiveTab: (tab: BrowserTabSnapshot | undefined) => void;
  waitForVersion: () => Promise<ChromeVersionInfo>;
  writeChromeSessionManifest: () => Promise<void>;
  managedChromeRevealBounds?: () => BrowserChromeWindowBounds | undefined;
}

export class BrowserChromeTargetController {
  constructor(private readonly options: BrowserChromeTargetControllerOptions) {}

  browserUrl(path: string): string {
    const port = this.options.getPort();
    if (!port) throw new Error("Browser is not running.");
    return `http://127.0.0.1:${port}${path}`;
  }

  async targets(): Promise<ChromeTargetInfo[]> {
    const targets = await fetchJson<ChromeTargetInfo[]>(this.browserUrl("/json"));
    return targets.filter((target) => target.type === "page");
  }

  async ensureActiveTarget(): Promise<ChromeTargetInfo> {
    const targets = await this.targets();
    const contentTargets = targets.filter(isChromeContentTarget);
    const current = contentTargets.find((target) => target.id === this.options.getActiveTargetId()) ?? contentTargets.at(-1);
    if (current) {
      this.setActiveTarget(current);
      return current;
    }
    await this.createTarget("about:blank");
    const [created] = await this.targets();
    if (!created) throw new Error("Chrome did not create a browser tab.");
    this.setActiveTarget(created);
    return created;
  }

  async createTarget(url: string): Promise<void> {
    const client = await this.connectBrowser();
    try {
      const result = await client.request<{ targetId?: string }>("Target.createTarget", { url });
      if (result.targetId) this.options.setActiveTargetId(result.targetId);
      await this.waitForPageReady(undefined, { expectedUrl: url });
    } finally {
      client.close();
    }
  }

  async navigateActiveTarget(url: string): Promise<void> {
    const target = await this.ensureActiveTarget();
    const previousUrl = target.url;
    const client = await this.connectChromeTargetPage(target);
    try {
      await client.request("Page.enable", {});
      const navigation = await client.request<{ errorText?: string }>("Page.navigate", { url });
      if (navigation.errorText && !isNavigationAbortErrorText(navigation.errorText)) throw new Error(`${navigation.errorText} loading '${url}'`);
      await this.waitForPageReady(client, { expectedUrl: url, previousUrl });
    } finally {
      client.close();
    }
  }

  async waitForPageReady(
    existingClient?: JsonRpcWebSocketClient,
    expectation: { expectedUrl?: string; previousUrl?: string } = {},
  ): Promise<void> {
    const client = existingClient ?? (await this.connectActivePage());
    const shouldClose = !existingClient;
    try {
      const startedAt = Date.now();
      let lastHref: string | undefined;
      while (Date.now() - startedAt < PAGE_READY_TIMEOUT_MS) {
        const pageState = await client
          .request<{ result?: { value?: { readyState?: string; href?: string } } }>("Runtime.evaluate", {
            expression: "({ readyState: document.readyState, href: location.href })",
            returnByValue: true,
          })
          .then((result) => result.result?.value)
          .catch(() => undefined);
        const readyState = pageState?.readyState;
        lastHref = pageState?.href ?? lastHref;
        if (
          (readyState === "complete" || readyState === "interactive") &&
          browserNavigationReachedExpectedUrl(expectation.expectedUrl, pageState?.href, expectation.previousUrl)
        ) {
          return;
        }
        await delay(200);
      }
      if (expectation.expectedUrl && isAboutBlankUrl(lastHref ?? "")) {
        throw new Error(browserNavigationDidNotCommitMessage(normalizeBrowserUrl(expectation.expectedUrl)));
      }
    } finally {
      if (shouldClose) client.close();
    }
  }

  async evaluatePage<T>(expression: string, timeoutMs = 15_000): Promise<T> {
    const client = await this.connectActivePage();
    try {
      const result = await client.request<{
        exceptionDetails?: { text?: string; exception?: { description?: string } };
        result?: { value?: unknown; description?: string };
      }>(
        "Runtime.evaluate",
        {
          expression,
          awaitPromise: true,
          returnByValue: true,
        },
        timeoutMs,
      );
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Browser evaluation failed.");
      }
      return (result.result?.value ?? result.result?.description ?? null) as T;
    } finally {
      client.close();
    }
  }

  async getActiveTabSnapshot(): Promise<BrowserTabSnapshot> {
    const target = await this.ensureActiveTarget();
    return { id: target.id, title: target.title, url: target.url };
  }

  async connectBrowser(): Promise<JsonRpcWebSocketClient> {
    if (!this.options.getBrowserWsUrl()) this.options.setBrowserWsUrl((await this.options.waitForVersion()).webSocketDebuggerUrl);
    const browserWsUrl = this.options.getBrowserWsUrl();
    if (!browserWsUrl) throw new Error("Chrome did not expose a browser CDP endpoint.");
    return JsonRpcWebSocketClient.connect(browserWsUrl);
  }

  async connectActivePage(): Promise<JsonRpcWebSocketClient> {
    const target = await this.ensureActiveTarget();
    return this.connectChromeTargetPage(target);
  }

  async ensureChromeTarget(targetId?: string): Promise<ChromeTargetInfo> {
    if (!targetId) return this.ensureActiveTarget();
    const targets = await this.targets();
    const target = targets.find((candidate) => candidate.id === targetId);
    if (!target) return this.ensureActiveTarget();
    this.setActiveTarget(target);
    return target;
  }

  async connectChromeTargetPage(target: ChromeTargetInfo): Promise<JsonRpcWebSocketClient> {
    if (!target.webSocketDebuggerUrl) throw new Error("Chrome tab does not expose a CDP endpoint.");
    return JsonRpcWebSocketClient.connect(target.webSocketDebuggerUrl);
  }

  async setActiveWindowState(windowState: "normal" | "minimized", targetId = this.options.getActiveTargetId()): Promise<void> {
    if (!targetId) return;
    const browser = await this.connectBrowser();
    try {
      const windowInfo = await browser.request<{ windowId?: number }>("Browser.getWindowForTarget", { targetId }, 5_000);
      if (typeof windowInfo.windowId !== "number") return;
      await browser.request("Browser.setWindowBounds", { windowId: windowInfo.windowId, bounds: { windowState } }, 5_000);
    } finally {
      browser.close();
    }
  }

  async setActiveWindowBounds(bounds: BrowserChromeWindowBounds, targetId = this.options.getActiveTargetId()): Promise<void> {
    if (!targetId) return;
    const browser = await this.connectBrowser();
    try {
      const windowInfo = await browser.request<{ windowId?: number }>("Browser.getWindowForTarget", { targetId }, 5_000);
      if (typeof windowInfo.windowId !== "number") return;
      await browser.request(
        "Browser.setWindowBounds",
        {
          windowId: windowInfo.windowId,
          bounds: {
            windowState: "normal",
            ...bounds,
          },
        },
        5_000,
      );
    } finally {
      browser.close();
    }
  }

  async activateTarget(targetId?: string): Promise<{ activated: boolean; activeTab?: BrowserTabSnapshot; reason?: string }> {
    const target = await this.ensureChromeTarget(targetId);
    const activeTab = { id: target.id, title: target.title, url: target.url };
    let activated = false;
    let reason: string | undefined;

    const browser = await this.connectBrowser().catch((error) => {
      reason = errorMessage(error);
      return undefined;
    });
    if (browser) {
      try {
        const windowInfo = await browser.request<{ windowId?: number }>("Browser.getWindowForTarget", { targetId: target.id }, 5_000);
        if (typeof windowInfo.windowId === "number") {
          const revealBounds = this.options.managedChromeRevealBounds?.() ?? { left: 0, top: 40, width: 1280, height: 860 };
          await browser
            .request("Browser.setWindowBounds", { windowId: windowInfo.windowId, bounds: { windowState: "normal", ...revealBounds } }, 5_000)
            .catch((error) => {
              reason = errorMessage(error);
            });
        }
      } finally {
        browser.close();
      }
    }

    const page = await this.connectChromeTargetPage(target).catch((error) => {
      reason = errorMessage(error);
      return undefined;
    });
    if (page) {
      try {
        await page.request("Page.bringToFront", {}, 5_000);
        activated = true;
      } catch (error) {
        reason = errorMessage(error);
      } finally {
        page.close();
      }
    }

    this.options.setLastActiveTab(activeTab);
    await this.options.writeChromeSessionManifest().catch(() => undefined);
    return { activated, activeTab, ...(reason ? { reason } : {}) };
  }

  private setActiveTarget(target: ChromeTargetInfo): void {
    this.options.setActiveTargetId(target.id);
    this.options.setLastActiveTab({ id: target.id, title: target.title, url: target.url });
  }
}

export class JsonRpcWebSocketClient {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => this.onMessage(String(event.data)));
    socket.addEventListener("close", () => this.rejectAll(new Error("Chrome CDP connection closed.")));
    socket.addEventListener("error", () => this.rejectAll(new Error("Chrome CDP connection failed.")));
  }

  static connect(url: string): Promise<JsonRpcWebSocketClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error("Timed out connecting to Chrome CDP."));
      }, 8_000);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);
          resolve(new JsonRpcWebSocketClient(socket));
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          reject(new Error("Unable to connect to Chrome CDP."));
        },
        { once: true },
      );
    });
  }

  request<T = unknown>(method: string, params: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome CDP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timeout });
      this.socket.send(payload);
    });
  }

  close(): void {
    this.socket.close();
    this.rejectAll(new Error("Chrome CDP connection closed."));
  }

  private onMessage(raw: string): void {
    let message: { id?: unknown; error?: { message?: unknown }; result?: unknown };
    try {
      message = JSON.parse(raw) as { id?: unknown; error?: { message?: unknown }; result?: unknown };
    } catch {
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(typeof message.error.message === "string" ? message.error.message : JSON.stringify(message.error)));
      return;
    }
    pending.resolve(message.result ?? {});
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

function isChromeContentTarget(target: ChromeTargetInfo): boolean {
  const url = target.url ?? "";
  if (!url) return true;
  return !/^(?:chrome|devtools|chrome-untrusted):\/\//i.test(url);
}

function isNavigationAbortErrorText(text: string): boolean {
  return /\b(?:net::)?ERR_ABORTED\b/i.test(text);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
