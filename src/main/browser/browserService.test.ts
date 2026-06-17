import { access, chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertLocalBrowserNavigationReachable,
  assertBrowserScreenshotTargetLoaded,
  assertBrowserNavigationReachedRequestedPage,
  BrowserService,
  browserNavigationReachedExpectedUrl,
  buildBrowserPickExpression,
  browserLoginExpression,
  browserUserActionDetectionExpression,
  browserRuntimeForRequest,
  cancelBrowserPickExpression,
  chromeAvailability,
  chromeAppNameFromExecutable,
  chromeExecutable,
  chromeProfileSourcePath,
  managedChromeLaunchArgs,
  managedChromeRevealBoundsForWorkArea,
  normalizeBrowserUserActionDetection,
  normalizeBrowserLoginOrigin,
  normalizeBrowserUrl,
  normalizePickSelection,
  parseChromeDevToolsEndpoint,
  shouldCopyChromeProfilePath,
  userCodeExpression,
} from "./browserService";
import { shouldReloadBrowserUrlForWorkspaceChange } from "./browserRefresh";

afterEach(() => {
  vi.unstubAllEnvs();
});

const chromeLoginIntegration = process.env.AMBIENT_BROWSER_LOGIN_INTEGRATION === "1" ? it : it.skip;

describe("normalizeBrowserUrl", () => {
  it("adds https to external hosts without a scheme", () => {
    expect(normalizeBrowserUrl("example.com")).toBe("https://example.com");
    expect(normalizeBrowserUrl(" https://example.com/path ")).toBe("https://example.com/path");
  });

  it("uses http for local browser targets without a scheme", () => {
    expect(normalizeBrowserUrl("localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeBrowserUrl("127.0.0.1:5173/app")).toBe("http://127.0.0.1:5173/app");
  });
});

describe("normalizeBrowserLoginOrigin", () => {
  it("normalizes login origins to http(s) origin strings", () => {
    expect(normalizeBrowserLoginOrigin("example.test/login")).toBe("https://example.test");
    expect(normalizeBrowserLoginOrigin("http://localhost:8787/path")).toBe("http://localhost:8787");
  });
});

describe("assertBrowserNavigationReachedRequestedPage", () => {
  it("rejects file navigations that ended at about:blank with local preview guidance", () => {
    expect(() =>
      assertBrowserNavigationReachedRequestedPage("file:///tmp/workspace/index.html", {
        title: "",
        url: "about:blank",
        text: "",
        links: [],
      }),
    ).toThrow(/browser_local_preview/);
  });

  it("rejects localhost navigations that ended at about:blank without local preview guidance", () => {
    expect(() =>
      assertBrowserNavigationReachedRequestedPage("http://localhost:3001", {
        title: "",
        url: "about:blank",
        text: "",
        links: [],
      }),
    ).toThrow(/local server navigation did not commit/);
    expect(() =>
      assertBrowserNavigationReachedRequestedPage("http://localhost:3001", {
        title: "",
        url: "about:blank",
        text: "",
        links: [],
      }),
    ).not.toThrow(/browser_local_preview/);
  });

  it("rejects public navigations that ended at about:blank with browser timing guidance", () => {
    expect(() =>
      assertBrowserNavigationReachedRequestedPage("https://github.com/opencut-app/opencut-classic", {
        title: "",
        url: "about:blank",
        text: "",
        links: [],
      }),
    ).toThrow(/external browser navigation did not commit/);
  });

  it("allows real page URLs and explicit about:blank requests", () => {
    expect(
      assertBrowserNavigationReachedRequestedPage("https://example.com", {
        title: "Example",
        url: "https://example.com/",
        text: "Example",
        links: [],
      }).url,
    ).toBe("https://example.com/");
    expect(
      assertBrowserNavigationReachedRequestedPage("about:blank", {
        title: "",
        url: "about:blank",
        text: "",
        links: [],
      }).url,
    ).toBe("about:blank");
  });
});

describe("assertBrowserScreenshotTargetLoaded", () => {
  it("refuses about:blank screenshots before writing visual evidence", () => {
    expect(() => assertBrowserScreenshotTargetLoaded({ url: "about:blank" })).toThrow(/screenshot refused/);
    expect(() => assertBrowserScreenshotTargetLoaded(undefined)).toThrow(/about:blank/);
    expect(() => assertBrowserScreenshotTargetLoaded({ url: "http://127.0.0.1:4100/index.html" })).not.toThrow();
  });
});

describe("browserNavigationReachedExpectedUrl", () => {
  it("does not treat an already-complete about:blank page as a committed localhost navigation", () => {
    expect(browserNavigationReachedExpectedUrl("http://localhost:3001", "about:blank", "about:blank")).toBe(false);
  });

  it("accepts localhost trailing slash normalization and same-origin local redirects", () => {
    expect(browserNavigationReachedExpectedUrl("http://localhost:3001", "http://localhost:3001/", "about:blank")).toBe(true);
    expect(browserNavigationReachedExpectedUrl("http://localhost:3001", "http://localhost:3001/login", "about:blank")).toBe(true);
  });

  it("waits when the active tab is still on the previous nonblank page", () => {
    expect(
      browserNavigationReachedExpectedUrl(
        "https://example.com/next",
        "https://example.com/previous",
        "https://example.com/previous",
      ),
    ).toBe(false);
  });
});

describe("chromeProfileSourcePath", () => {
  it("resolves the standard macOS Chrome profile root", () => {
    vi.stubEnv("AMBIENT_BROWSER_CHROME_PROFILE", undefined);
    expect(chromeProfileSourcePath("darwin", "/Users/neo")).toBe(
      join("/Users/neo", "Library", "Application Support", "Google", "Chrome"),
    );
  });

  it("honors an explicit Chrome profile override", () => {
    vi.stubEnv("AMBIENT_BROWSER_CHROME_PROFILE", "/tmp/chrome-profile");
    expect(chromeProfileSourcePath("darwin", "/Users/neo")).toBe("/tmp/chrome-profile");
  });
});

describe("chromeAvailability", () => {
  it("reports invalid AMBIENT_BROWSER_CHROME_PATH as unavailable", () => {
    const availability = chromeAvailability("linux", {
      AMBIENT_BROWSER_CHROME_PATH: "/tmp/ambient-missing-chrome",
      PATH: "",
    });
    expect(availability.available).toBe(false);
    expect(availability.executable).toBeUndefined();
    expect(availability.unavailableReason).toContain("Configured Chrome path is not an executable file");
  });

  it("does not assume google-chrome exists on Linux", () => {
    expect(chromeExecutable("linux", { PATH: "" })).toBeUndefined();
    expect(chromeAvailability("linux", { PATH: "" })).toMatchObject({
      available: false,
    });
  });

  it("finds executable Chrome-compatible binaries on PATH", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-chrome-path-"));
    const executable = join(root, "chromium");
    await writeFile(executable, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(executable, 0o755);

    expect(chromeExecutable("linux", { PATH: root })).toBe(executable);
    expect(chromeAvailability("linux", { PATH: root })).toMatchObject({
      available: true,
      executable,
    });
  });
});

describe("chromeAppNameFromExecutable", () => {
  it("derives macOS app names from Chrome app bundle paths", () => {
    expect(chromeAppNameFromExecutable("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")).toBe("Google Chrome");
    expect(chromeAppNameFromExecutable("/Applications/Chromium.app/Contents/MacOS/Chromium")).toBe("Chromium");
  });

  it("falls back to common executable names on Windows and Linux", () => {
    expect(chromeAppNameFromExecutable("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")).toBe("Google Chrome");
    expect(chromeAppNameFromExecutable("/usr/bin/google-chrome-stable")).toBe("Google Chrome");
    expect(chromeAppNameFromExecutable("/usr/bin/chromium")).toBe("Chromium");
  });
});

describe("parseChromeDevToolsEndpoint", () => {
  it("reads Chrome-assigned remote debugging ports from DevToolsActivePort content", () => {
    expect(parseChromeDevToolsEndpoint("51234\n/devtools/browser/abc\n")).toEqual({
      port: 51234,
      webSocketDebuggerUrl: "ws://127.0.0.1:51234/devtools/browser/abc",
    });
  });

  it("rejects incomplete or invalid DevToolsActivePort content", () => {
    expect(parseChromeDevToolsEndpoint("0\n/devtools/browser/abc\n")).toBeUndefined();
    expect(parseChromeDevToolsEndpoint("51234\n")).toBeUndefined();
    expect(parseChromeDevToolsEndpoint("not-a-port\n/devtools/browser/abc\n")).toBeUndefined();
  });
});

describe("shouldCopyChromeProfilePath", () => {
  const root = join("/Users/neo", "Library", "Application Support", "Google", "Chrome");

  it("skips caches and Chrome profile locks", () => {
    expect(shouldCopyChromeProfilePath(root, join(root, "Default", "Cookies"))).toBe(true);
    expect(shouldCopyChromeProfilePath(root, join(root, "Default", "Cache", "data"))).toBe(false);
    expect(shouldCopyChromeProfilePath(root, join(root, "SingletonLock"))).toBe(false);
  });
});

describe("buildBrowserPickExpression", () => {
  it("embeds the picker prompt as JSON inside the injected expression", () => {
    const expression = buildBrowserPickExpression('Pick "submit"');
    expect(expression).toContain('"Pick \\"submit\\""');
    expect(expression).toContain("data-ambient-browser-picker");
  });

  it("exposes a cancellable browser picker hook", () => {
    const expression = cancelBrowserPickExpression();
    expect(expression).toContain("__ambientBrowserPickerCancel");
    expect(expression).toContain("Escape");
  });
});

describe("browser user action detection", () => {
  function detectBrowserUserActionInFakePage(input: {
    url?: string;
    title?: string;
    text?: string;
    resources?: string[];
    visibleSelector?: string;
    hiddenSelector?: string;
  }) {
    const url = input.url ?? "https://example.test/article";
    const visibleElement = {
      getAttribute: () => null,
      getBoundingClientRect: () => ({ width: 320, height: 88 }),
    };
    const hiddenElement = {
      getAttribute: () => null,
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
      hidden: true,
    };
    const document = {
      title: input.title ?? "Article",
      body: { innerText: input.text ?? "Article body with ordinary event details." },
      querySelectorAll: (query: string) => {
        if (query === "script[src], iframe[src]") return (input.resources ?? []).map((src) => ({ src }));
        if (query === input.hiddenSelector) return [hiddenElement];
        return query === input.visibleSelector ? [visibleElement] : [];
      },
    };
    const location = { href: url, origin: new URL(url).origin };
    const window = {
      getComputedStyle: (element: { hidden?: boolean }) =>
        element.hidden
          ? { display: "none", visibility: "hidden", opacity: "0" }
          : { display: "block", visibility: "visible", opacity: "1" },
    };
    return Function("document", "location", "window", `"use strict"; return ${browserUserActionDetectionExpression()};`)(
      document,
      location,
      window,
    );
  }

  it("injects conservative CAPTCHA and challenge checks into the page expression", () => {
    const expression = browserUserActionDetectionExpression();
    expect(expression).toContain("google");
    expect(expression).toContain("recaptcha");
    expect(expression).toContain("unusual traffic");
    expect(expression).toContain("prove your humanity");
    expect(expression).toContain("pageExcerpt");
  });

  it("does not flag script-only CAPTCHA libraries as user-visible browser warnings", () => {
    expect(
      detectBrowserUserActionInFakePage({
        title: "Scottsdale arts article",
        text: "Upcoming theater, music, and date-night event details.",
        resources: ["https://www.google.com/recaptcha/api.js", "https://js.hcaptcha.com/1/api.js"],
      }),
    ).toMatchObject({ detected: false });
  });

  it("does not flag hidden CAPTCHA widgets as user-visible browser warnings", () => {
    expect(
      detectBrowserUserActionInFakePage({
        resources: ["https://www.google.com/recaptcha/api.js"],
        hiddenSelector: ".g-recaptcha, iframe[src*='recaptcha'], [data-sitekey][data-callback]",
      }),
    ).toMatchObject({ detected: false });
  });

  it("still flags visible CAPTCHA widgets as browser warnings", () => {
    expect(
      detectBrowserUserActionInFakePage({
        resources: ["https://www.google.com/recaptcha/api.js"],
        visibleSelector: ".g-recaptcha, iframe[src*='recaptcha'], [data-sitekey][data-callback]",
      }),
    ).toMatchObject({
      detected: true,
      kind: "captcha",
      provider: "recaptcha",
    });
  });

  it("normalizes detected challenge pages into bounded user-action state inputs", () => {
    expect(
      normalizeBrowserUserActionDetection({
        detected: true,
        kind: "captcha",
        provider: "google",
        url: "https://www.google.com/sorry/index?continue=https%3A%2F%2Fwww.google.com%2Fsearch",
        title: "Sorry",
        pageExcerpt: `  ${"verification ".repeat(140)}  `,
        message: "x".repeat(800),
      }),
    ).toMatchObject({
      detected: true,
      kind: "captcha",
      provider: "google",
      origin: "https://www.google.com",
      pageExcerpt: expect.stringMatching(/^verification/),
      message: "x".repeat(400),
    });
    expect(normalizeBrowserUserActionDetection({ detected: false })).toBeUndefined();
  });

  it("dismisses detached browser warnings that no longer have a live waiter", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-detached-warning-"));
    const service = new BrowserService(() => ({
      path: join(root, "workspace"),
      name: "workspace",
      statePath: join(root, "state"),
      sessionPath: join(root, "sessions"),
    }));
    (service as any).beginUserAction({
      toolName: "browser_open",
      runtime: "chrome",
      profileMode: "isolated",
      targetId: "target-captcha",
      detection: {
        detected: true,
        kind: "captcha",
        provider: "recaptcha",
        url: "https://example.test/article",
        title: "Article",
        message: "The page is asking for a reCAPTCHA verification.",
      },
    });
    expect((await service.getState()).userAction).toMatchObject({ active: true, status: "waiting" });

    const dismissed = await service.cancelUserAction();
    expect(dismissed.userAction).toBeUndefined();
    expect(dismissed.lastActivity).toBe("Browser warning dismissed.");
  });
});

describe("browserLoginExpression", () => {
  it("embeds credential values only inside the runtime expression", () => {
    const expression = browserLoginExpression({
      credentialId: "cred-1",
      expectedOrigin: "https://example.test",
      credential: {
        id: "cred-1",
        label: "Fixture",
        origin: "https://example.test",
        username: "neo@example.test",
        password: "secret-password",
      },
      passwordSelector: "input[type=password]",
      submit: false,
    });
    expect(expression).toContain("secret-password");
    expect(expression).toContain("browserLoginFunction");
  });
});

describe("userCodeExpression", () => {
  async function evaluateUserCode(code: string): Promise<unknown> {
    return Function(`return ${userCodeExpression(code)}`)();
  }

  it("preserves expression-style browser eval snippets", async () => {
    await expect(evaluateUserCode("1 + 2")).resolves.toBe(3);
  });

  it("supports statement-style snippets with declarations and return", async () => {
    await expect(evaluateUserCode("const images = ['a.jpg', 'b.jpg']; return images.map((src) => src.toUpperCase());")).resolves.toEqual([
      "A.JPG",
      "B.JPG",
    ]);
  });

  it("supports async function-body snippets", async () => {
    await expect(evaluateUserCode("const value = await Promise.resolve(42); return value;")).resolves.toBe(42);
  });
});

describe("normalizePickSelection", () => {
  it("bounds selector metadata before returning it to Pi", () => {
    const normalized = normalizePickSelection({
      tagName: "button",
      selector: "#submit",
      candidates: ["#submit", "[data-testid=\"submit\"]", "button", "main button", "body button", "ignored"],
      text: "x".repeat(400),
      html: `<button>${"y".repeat(900)}</button>`,
      boundingBox: { x: 1_000_000, y: -1_000_000, width: 120_000, height: 10.7 },
    });
    expect(normalized?.candidates).toHaveLength(5);
    expect(normalized?.text).toHaveLength(220);
    expect(normalized?.html).toHaveLength(500);
    expect(normalized?.boundingBox).toEqual({ x: 100_000, y: -100_000, width: 100_000, height: 10 });
  });

  it("drops invalid picker bounds", () => {
    const normalized = normalizePickSelection({
      tagName: "a",
      candidates: ["a"],
      boundingBox: { x: Number.NaN, y: 0, width: 10, height: 10 },
    });
    expect(normalized?.boundingBox).toBeUndefined();
  });
});

describe("browserRuntimeForRequest", () => {
  it("uses the internal runtime for isolated sessions when available", () => {
    expect(browserRuntimeForRequest("isolated", undefined, true)).toBe("internal");
  });

  it("forces copied-profile sessions through Chrome", () => {
    expect(browserRuntimeForRequest("copied", "internal", true)).toBe("chrome");
  });

  it("honors an explicit Chrome request", () => {
    expect(browserRuntimeForRequest("isolated", "chrome", true)).toBe("chrome");
  });

  it("falls back to Chrome when no internal runtime exists", () => {
    expect(browserRuntimeForRequest("isolated", "internal", false)).toBe("chrome");
  });
});

describe("managed Chrome launch hardening", () => {
  it("starts managed Chrome minimized before an explicit reveal", () => {
    expect(managedChromeLaunchArgs("/tmp/ambient-profile")).toEqual(
      expect.arrayContaining([
        "--window-size=1280,720",
        "--start-minimized",
        "about:blank",
      ]),
    );
    expect(managedChromeLaunchArgs("/tmp/ambient-profile").some((arg) => arg.startsWith("--window-position="))).toBe(false);
  });

  it("centers managed Chrome reveal bounds inside the active display work area", () => {
    expect(managedChromeRevealBoundsForWorkArea({ x: 2560, y: 0, width: 2560, height: 1415 })).toEqual({
      left: 3200,
      top: 258,
      width: 1280,
      height: 900,
    });
  });

  it("clamps managed Chrome reveal bounds for smaller displays", () => {
    expect(managedChromeRevealBoundsForWorkArea({ x: 0, y: 25, width: 900, height: 620 })).toEqual({
      left: 40,
      top: 65,
      width: 820,
      height: 540,
    });
  });
});

describe("assertLocalBrowserNavigationReachable", () => {
  it("accepts loopback HTTP targets that return an HTTP response", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
    });
    const port = await listen(server);
    try {
      await expect(assertLocalBrowserNavigationReachable(`http://127.0.0.1:${port}/missing`)).resolves.toBeUndefined();
    } finally {
      await close(server);
    }
  });

  it("rejects unreachable loopback HTTP targets before Chrome is launched", async () => {
    const server = createServer((_request, response) => {
      response.end("ok");
    });
    const port = await listen(server);
    await close(server);

    await expect(assertLocalBrowserNavigationReachable(`http://127.0.0.1:${port}/`)).rejects.toThrow(/not reachable before browser navigation/);
  });
});

describe("BrowserService about:blank cleanup", () => {
  it("closes the active managed Chrome target when a failed navigation leaves it at about:blank", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-blank-cleanup-"));
    const close = vi.fn();
    const request = vi.fn(async () => undefined);
    const service = new BrowserService(() => ({
      path: join(root, "workspace"),
      name: "workspace",
      statePath: join(root, "state"),
      sessionPath: join(root, "sessions"),
    }));
    Object.assign(service as any, {
      activeTargetId: "target-blank",
      lastActiveTab: { id: "target-blank", title: "", url: "about:blank" },
      targets: vi.fn(async () => [{ id: "target-blank", type: "page", url: "about:blank" }]),
      connectBrowser: vi.fn(async () => ({ request, close })),
      writeChromeSessionManifest: vi.fn(async () => undefined),
    });

    await expect((service as any).closeActiveAboutBlankTarget()).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith("Target.closeTarget", { targetId: "target-blank" }, 2_000);
    expect((service as any).activeTargetId).toBeUndefined();
    expect((service as any).lastActiveTab).toBeUndefined();
    expect(close).toHaveBeenCalled();
  });
});

describe("shouldReloadBrowserUrlForWorkspaceChange", () => {
  it("reloads a workspace HTML page when sibling web assets change", () => {
    const workspace = join(tmpdir(), "ambient-browser-refresh");
    expect(
      shouldReloadBrowserUrlForWorkspaceChange(`file://${join(workspace, "bicycle-screensaver", "index.html")}`, workspace, "bicycle-screensaver/main.js"),
    ).toBe(true);
    expect(
      shouldReloadBrowserUrlForWorkspaceChange(`file://${join(workspace, "bicycle-screensaver", "index.html")}`, workspace, "bicycle-screensaver/style.css"),
    ).toBe(true);
  });

  it("does not reload unrelated workspace pages", () => {
    const workspace = join(tmpdir(), "ambient-browser-refresh");
    expect(
      shouldReloadBrowserUrlForWorkspaceChange(`file://${join(workspace, "other", "index.html")}`, workspace, "bicycle-screensaver/main.js"),
    ).toBe(false);
  });
});

describe("BrowserService copied Chrome profile state", () => {
  it("copies Chrome profile fixtures with metadata and clears the stored copy", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-service-"));
    const source = join(root, "Chrome");
    const statePath = join(root, "state");
    await mkdir(join(source, "Default", "Cache"), { recursive: true });
    await writeFile(join(source, "Default", "Cookies"), "cookie fixture", "utf8");
    await writeFile(join(source, "Default", "Cache", "ignored-cache"), "cache fixture", "utf8");
    await writeFile(join(source, "SingletonLock"), "lock fixture", "utf8");
    vi.stubEnv("AMBIENT_BROWSER_CHROME_PROFILE", source);

    const service = new BrowserService(() => ({
      path: join(root, "workspace"),
      name: "workspace",
      statePath,
      sessionPath: join(root, "sessions"),
    }));

    const copied = await service.copyChromeProfile();
    expect(copied.copiedProfileAvailable).toBe(true);
    expect(copied.copiedProfileSourcePath).toBe(source);
    expect(copied.copiedProfileCopiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await readFile(join(statePath, "browser", "copied-chrome-profile", "Default", "Cookies"), "utf8")).toBe("cookie fixture");
    await expect(access(join(statePath, "browser", "copied-chrome-profile", "Default", "Cache", "ignored-cache"))).rejects.toThrow();
    await expect(access(join(statePath, "browser", "copied-chrome-profile", "SingletonLock"))).rejects.toThrow();

    const cleared = await service.clearCopiedChromeProfile();
    expect(cleared.copiedProfileAvailable).toBe(false);
    expect(cleared.copiedProfileCopiedAt).toBeUndefined();
    await expect(access(join(statePath, "browser", "copied-chrome-profile"))).rejects.toThrow();
    await expect(access(join(statePath, "browser", "copied-chrome-profile.json"))).rejects.toThrow();
  });
});

describe("BrowserService feature state", () => {
  it("surfaces Chrome unavailable reasons in capability state", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-no-chrome-"));
    vi.stubEnv("AMBIENT_BROWSER_CHROME_PATH", "/tmp/ambient-missing-chrome");
    const service = new BrowserService(() => ({
      path: join(root, "workspace"),
      name: "workspace",
      statePath: join(root, "state"),
      sessionPath: join(root, "sessions"),
    }));

    await expect(service.getState()).resolves.toMatchObject({
      chromeAvailable: false,
      chromeUnavailableReason: expect.stringContaining("Configured Chrome path is not an executable file"),
    });
  });

  it("surfaces the browser login broker rollout flag", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-feature-state-"));
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      undefined,
      { browserLoginBrokerAvailable: false },
    );

    await expect(service.getState()).resolves.toMatchObject({ browserLoginBrokerAvailable: false });
  });

  it("does not capture an internal screenshot when the active target is about:blank", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-blank-screenshot-"));
    const backend = {
      isAvailable: () => true,
      isRunning: () => true,
      getState: async () => ({
        running: true,
        viewVisible: true,
        activeTab: { id: "internal", title: "", url: "about:blank" },
      }),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
      setViewBounds: vi.fn(),
      navigate: vi.fn(),
      content: vi.fn(),
      search: vi.fn(),
      evaluate: vi.fn(),
      login: vi.fn(),
      screenshot: vi.fn(),
      pick: vi.fn(),
      cancelPick: vi.fn(),
    };
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      backend as any,
    );

    await expect(service.screenshot({ runtime: "internal" })).rejects.toThrow(/about:blank/);
    expect(backend.screenshot).not.toHaveBeenCalled();
  });

  it("uses managed Chrome for default screenshots even when the internal browser is available", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-default-screenshot-chrome-"));
    const backend = {
      isAvailable: () => true,
      isRunning: () => true,
      getState: async () => ({
        running: true,
        viewVisible: true,
        activeTab: { id: "internal", title: "Calculator", url: "http://127.0.0.1:4100/index.html" },
      }),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
      setViewBounds: vi.fn(),
      navigate: vi.fn(),
      content: vi.fn(),
      search: vi.fn(),
      evaluate: vi.fn(),
      login: vi.fn(),
      screenshot: vi.fn(),
      pick: vi.fn(),
      cancelPick: vi.fn(),
    };
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      backend as any,
    );
    const chromeScreenshot = {
      path: join(root, "state", "browser", "screenshots", "chrome.png"),
      bytes: 67,
      mimeType: "image/png",
      title: "Calculator",
      url: "http://127.0.0.1:4100/index.html",
    };
    const screenshotChrome = vi.spyOn(service as any, "screenshotChrome").mockResolvedValue(chromeScreenshot);

    await expect(service.screenshot({})).resolves.toBe(chromeScreenshot);

    expect(screenshotChrome).toHaveBeenCalledOnce();
    expect(backend.screenshot).not.toHaveBeenCalled();
  });

  it("reopens the last internal local preview before browser actions if focus drifts to about:blank", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-preview-retarget-"));
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "text/html");
      response.end("<!doctype html><title>Calculator</title><button id=\"btn-4\">4</button>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const previewUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/index.html`;
    let activeTab = { id: "internal", title: "Blank", url: "about:blank" };
    const backend = {
      isAvailable: () => true,
      isRunning: () => true,
      getState: async () => ({
        running: true,
        viewVisible: true,
        activeTab,
      }),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
      setViewBounds: vi.fn(),
      navigate: vi.fn(async (input: any) => {
        activeTab = { id: "internal", title: "Calculator", url: input.url };
        return { title: "Calculator", url: input.url, text: "4", links: [] };
      }),
      content: vi.fn(),
      search: vi.fn(),
      evaluate: vi.fn(async () => undefined),
      login: vi.fn(),
      screenshot: vi.fn(),
      pick: vi.fn(),
      cancelPick: vi.fn(),
    };
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      backend as any,
    );

    try {
      await service.navigate({ url: previewUrl, runtime: "internal" });
      activeTab = { id: "internal", title: "Blank", url: "about:blank" };
      await service.evaluate({ code: "document.title", runtime: "internal" });

      expect(backend.navigate).toHaveBeenLastCalledWith(expect.objectContaining({
        url: previewUrl,
        runtime: "internal",
      }));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("refuses to fresh-load a stale internal preview for Chrome screenshot evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-preview-screenshot-chrome-"));
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "text/html");
      response.end("<!doctype html><title>Calculator</title><input id=\"display\" value=\"5\">");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const previewUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/calculator.html`;
    const service = new BrowserService(() => ({
      path: join(root, "workspace"),
      name: "workspace",
      statePath: join(root, "state"),
      sessionPath: join(root, "sessions"),
    }));
    Object.assign(service as any, { lastInternalPreviewUrl: previewUrl });
    vi.spyOn(service as any, "ensureChromeStarted").mockResolvedValue(undefined);
    const getActiveTabSnapshot = vi.spyOn(service as any, "getActiveTabSnapshot")
      .mockResolvedValue({ id: "chrome", title: "", url: "about:blank" });
    const navigateActiveTarget = vi.spyOn(service as any, "navigateActiveTarget").mockResolvedValue(undefined);
    vi.spyOn(service as any, "waitForPageReady").mockResolvedValue(undefined);
    vi.spyOn(service as any, "captureChromeScreenshotData").mockResolvedValue(tinyPngBase64());

    try {
      await expect(service.screenshot({})).rejects.toThrow(/fresh page load and lose prior click\/assert state/);
      expect(navigateActiveTarget).not.toHaveBeenCalled();
      expect(getActiveTabSnapshot).toHaveBeenCalledOnce();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("marks Chrome screenshots as same-target evidence after a browser action", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-screenshot-target-evidence-"));
    const service = new BrowserService(() => ({
      path: join(root, "workspace"),
      name: "workspace",
      statePath: join(root, "state"),
      sessionPath: join(root, "sessions"),
    }));
    Object.assign(service as any, {
      activeTargetId: "target-1",
      lastChromeBrowserActionTarget: { id: "target-1", title: "Calculator", url: "http://127.0.0.1:4100/calculator.html" },
    });
    vi.spyOn(service as any, "ensureChromeStarted").mockResolvedValue(undefined);
    vi.spyOn(service as any, "getActiveTabSnapshot").mockResolvedValue({
      id: "target-1",
      title: "Calculator",
      url: "http://127.0.0.1:4100/calculator.html",
    });
    vi.spyOn(service as any, "captureChromeScreenshotData").mockResolvedValue(tinyPngBase64());

    const result = await service.screenshot({});

    expect(result).toMatchObject({
      runtime: "chrome",
      targetId: "target-1",
      statePreserved: true,
      freshLoad: false,
      sameTargetAsLastBrowserAction: true,
      title: "Calculator",
      url: "http://127.0.0.1:4100/calculator.html",
    });
  });

  it("surfaces and clears persistent isolated Chrome profile state", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-isolated-profile-"));
    const statePath = join(root, "state");
    const service = new BrowserService(() => ({
      path: join(root, "workspace"),
      name: "workspace",
      statePath,
      sessionPath: join(root, "sessions"),
    }));
    const marker = join(statePath, "browser", "profiles", "isolated-chrome", "Default", "marker.txt");
    await mkdir(join(statePath, "browser", "profiles", "isolated-chrome", "Default"), { recursive: true });
    await writeFile(marker, "persistent marker", "utf8");

    await expect(service.getState()).resolves.toMatchObject({
      isolatedProfilePersistent: true,
      isolatedProfilePath: join(statePath, "browser", "profiles", "isolated-chrome"),
    });
    const cleared = await service.clearIsolatedBrowserProfile();
    expect(cleared.isolatedProfilePersistent).toBe(true);
    await expect(access(marker)).rejects.toThrow();
  });

  it("closes a managed Chrome session when switching to the internal browser without active user action", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-preserve-chrome-"));
    const server = createServer((request, response) => {
      if (request.url === "/json/version") {
        response.setHeader("content-type", "application/json");
        const address = server.address() as AddressInfo;
        response.end(JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:${address.port}/devtools/browser/session` }));
        return;
      }
      response.statusCode = 404;
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const backend = {
      isAvailable: () => true,
      isRunning: () => false,
      getState: async () => ({
        running: true,
        viewVisible: true,
        activeTab: { id: "internal", title: "Internal", url: "about:blank" },
      }),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
      setViewBounds: vi.fn(),
      navigate: vi.fn(),
      content: vi.fn(),
      search: vi.fn(),
      evaluate: vi.fn(),
      login: vi.fn(),
      screenshot: vi.fn(),
      pick: vi.fn(),
      cancelPick: vi.fn(),
    };
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      backend as any,
    );
    const child = {
      exitCode: null,
      signalCode: null,
      killed: false,
      kill: vi.fn(),
      unref: vi.fn(),
    };
    Object.assign(service as any, {
      child,
      port,
      browserWsUrl: `ws://127.0.0.1:${port}/devtools/browser/session`,
      profileMode: "copied",
      runtimeProfilePath: join(root, "state", "browser", "sessions", "copied-fixture"),
      runtimeProfileEphemeral: true,
      chromeSessionId: "chrome-session",
      chromeProcessId: 4242,
      activeRuntime: "chrome",
    });

    try {
      await expect(service.start({ profileMode: "isolated", runtime: "internal" })).resolves.toMatchObject({
        runtime: "internal",
        running: true,
        lastSessionEvent: {
          action: "closed",
          profileMode: "copied",
          sessionId: "chrome-session",
        },
      });
      expect(child.kill).toHaveBeenCalled();
      expect(child.unref).not.toHaveBeenCalled();
      expect(backend.start).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("records an explicit close reason when the user stops the browser", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-close-reason-"));
    const service = new BrowserService(() => ({
      path: join(root, "workspace"),
      name: "workspace",
      statePath: join(root, "state"),
      sessionPath: join(root, "sessions"),
    }));
    const child = {
      exitCode: null,
      signalCode: null,
      killed: false,
      kill: vi.fn(),
    };
    Object.assign(service as any, {
      child,
      port: 9222,
      browserWsUrl: "ws://127.0.0.1:9222/devtools/browser/session",
      profileMode: "isolated",
      runtimeProfilePath: join(root, "state", "browser", "profiles", "isolated-chrome"),
      chromeSessionId: "chrome-session",
      activeRuntime: "chrome",
    });

    await expect(service.stop()).resolves.toMatchObject({
      running: false,
      lastSessionEvent: {
        action: "closed",
        reason: "Explicit browser stop requested.",
        profileMode: "isolated",
        sessionId: "chrome-session",
      },
    });
    expect(child.kill).toHaveBeenCalledTimes(1);
  });
});

describe("BrowserService browser reveal", () => {
  it("routes internal browser reveal to the inline browser panel", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-reveal-internal-"));
    const backend = {
      isAvailable: () => true,
      isRunning: () => true,
      getState: async () => ({
        running: true,
        viewVisible: true,
        activeTab: { id: "internal", title: "Challenge", url: "https://example.test/challenge" },
      }),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
      setViewBounds: vi.fn(),
      navigate: vi.fn(),
      content: vi.fn(),
      search: vi.fn(),
      evaluate: vi.fn(),
      login: vi.fn(),
      screenshot: vi.fn(),
      pick: vi.fn(),
      cancelPick: vi.fn(),
    };
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      backend as any,
    );

    await expect(service.revealActiveBrowser()).resolves.toMatchObject({
      runtime: "internal",
      target: "internal",
      status: "needs-internal-panel",
      activeTab: { title: "Challenge", url: "https://example.test/challenge" },
    });
  });

  it("uses the managed Chrome revealer and reports foreground success", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-reveal-chrome-"));
    const revealManagedChromeWindow = vi.fn(async () => ({
      cdpActivated: true,
      foregroundAttempted: true,
      foregroundSucceeded: true,
      method: "test:foreground",
      activeTab: { id: "target-1", title: "Sorry", url: "https://www.google.com/sorry/index" },
    }));
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      undefined,
      { revealManagedChromeWindow },
    );
    Object.assign(service as any, {
      port: 9222,
      profileMode: "isolated",
      runtimeProfilePath: join(root, "state", "browser", "profiles", "isolated-chrome"),
      chromeProcessId: 4242,
      chromeSessionId: "session-1",
      child: { exitCode: null, signalCode: null, pid: 4242 },
    });

    await expect(service.revealActiveBrowser()).resolves.toMatchObject({
      runtime: "chrome",
      target: "managed-chrome",
      status: "revealed",
      foregroundAttempted: true,
      foregroundSucceeded: true,
      method: "test:foreground",
      activeTab: { title: "Sorry", url: "https://www.google.com/sorry/index" },
    });
    expect(revealManagedChromeWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: process.platform,
        profileMode: "isolated",
        processId: 4242,
        profilePath: join(root, "state", "browser", "profiles", "isolated-chrome"),
      }),
    );
  });

  it("passes the browser challenge target to the managed Chrome revealer", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-reveal-challenge-target-"));
    const revealManagedChromeWindow = vi.fn(async () => ({
      cdpActivated: true,
      foregroundAttempted: true,
      foregroundSucceeded: true,
      activeTab: { id: "target-captcha", title: "Sorry", url: "https://www.google.com/sorry/index" },
    }));
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      undefined,
      { revealManagedChromeWindow },
    );
    Object.assign(service as any, {
      port: 9222,
      profileMode: "isolated",
      runtimeProfilePath: join(root, "state", "browser", "profiles", "isolated-chrome"),
      chromeProcessId: 4242,
      chromeSessionId: "session-1",
      child: { exitCode: null, signalCode: null, pid: 4242 },
    });
    const userAction = (service as any).beginUserAction({
      toolName: "browser_search",
      runtime: "chrome",
      profileMode: "isolated",
      targetId: "target-captcha",
      detection: {
        detected: true,
        kind: "captcha",
        provider: "google",
        url: "https://www.google.com/sorry/index",
        title: "Sorry",
      },
    });

    await expect(service.revealActiveBrowser({ userActionId: userAction.id })).resolves.toMatchObject({
      runtime: "chrome",
      target: "managed-chrome",
      status: "revealed",
      activeTab: { id: "target-captcha", title: "Sorry", url: "https://www.google.com/sorry/index" },
    });
    expect(revealManagedChromeWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: "target-captcha",
        profileMode: "isolated",
      }),
    );
  });
});

describe("BrowserService workspace artifact refresh", () => {
  it("reloads the internal browser when its active HTML depends on a changed workspace asset", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-refresh-"));
    const workspace = join(root, "workspace");
    const backend = {
      isAvailable: () => true,
      isRunning: () => true,
      getState: async () => ({
        running: true,
        viewVisible: true,
        activeTab: {
          id: "internal",
          title: "Preview",
          url: `file://${join(workspace, "bicycle-screensaver", "index.html")}`,
        },
      }),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
      setViewBounds: vi.fn(),
      navigate: vi.fn(async () => ({ title: "Preview", url: "", text: "", links: [] })),
      content: vi.fn(),
      search: vi.fn(),
      evaluate: vi.fn(),
      screenshot: vi.fn(),
      pick: vi.fn(),
      cancelPick: vi.fn(),
    };
    const service = new BrowserService(
      () => ({
        path: workspace,
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      backend as any,
    );

    await expect(service.refreshWorkspaceArtifact({ workspacePath: workspace, changedPath: "bicycle-screensaver/main.js" })).resolves.toBe(
      true,
    );
    expect(backend.navigate).toHaveBeenCalledWith({
      url: `file://${join(workspace, "bicycle-screensaver", "index.html")}`,
      profileMode: "isolated",
      runtime: "internal",
    });
  });
});

describe("BrowserService browser user-action handoff", () => {
  it("can return user-action state immediately for agent browser tools", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-user-action-agent-"));
    const backend = {
      isAvailable: () => true,
      isRunning: () => true,
      getState: async () => ({
        running: true,
        viewVisible: true,
        activeTab: { id: "internal", title: "Sorry", url: "https://www.google.com/sorry/index" },
      }),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
      setViewBounds: vi.fn(),
      navigate: vi.fn(async () => ({ title: "Sorry", url: "https://www.google.com/sorry/index", text: "captcha", links: [] })),
      content: vi.fn(),
      search: vi.fn(async () => []),
      evaluate: vi.fn(async () => ({
        detected: true,
        kind: "captcha",
        provider: "google",
        url: "https://www.google.com/sorry/index",
        title: "Sorry",
        origin: "https://www.google.com",
        message: "Google verification required.",
      })),
      login: vi.fn(),
      screenshot: vi.fn(),
      pick: vi.fn(),
      cancelPick: vi.fn(),
    };
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      backend as any,
    );

    await expect(service.navigate({ url: "https://www.google.com/search?q=ambient", runtime: "internal", waitForUserAction: false })).resolves.toMatchObject({
      active: true,
      status: "waiting",
      kind: "captcha",
      provider: "google",
    });
    expect(backend.content).not.toHaveBeenCalled();
  });

  it("blocks later browser tool calls while an agent-visible user-action state is active", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-user-action-clear-"));
    const backend = {
      isAvailable: () => true,
      isRunning: () => true,
      getState: async () => ({
        running: true,
        viewVisible: true,
        activeTab: { id: "internal", title: "Rabbit", url: "https://commons.wikimedia.org/wiki/File:Rabbit.jpg" },
      }),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
      setViewBounds: vi.fn(),
      navigate: vi.fn(async () => ({
        title: "Rabbit",
        url: "https://commons.wikimedia.org/wiki/File:Rabbit.jpg",
        text: "public domain rabbit image",
        links: [],
      })),
      content: vi.fn(async () => ({ title: "Sorry", url: "https://www.google.com/sorry/index", text: "captcha", links: [] })),
      search: vi.fn(async () => []),
      evaluate: vi
        .fn()
        .mockResolvedValueOnce({
          detected: true,
          kind: "captcha",
          provider: "google",
          url: "https://www.google.com/sorry/index",
          title: "Sorry",
          origin: "https://www.google.com",
          message: "Google verification required.",
        })
        .mockResolvedValueOnce({ detected: false, url: "https://commons.wikimedia.org/wiki/File:Rabbit.jpg", title: "Rabbit" }),
      login: vi.fn(),
      screenshot: vi.fn(),
      pick: vi.fn(),
      cancelPick: vi.fn(),
    };
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      backend as any,
    );

    await expect(service.content({ runtime: "internal", waitForUserAction: false })).resolves.toMatchObject({
      active: true,
      status: "waiting",
      kind: "captcha",
      provider: "google",
    });
    await expect(
      service.navigate({ url: "https://commons.wikimedia.org/wiki/File:Rabbit.jpg", runtime: "internal", waitForUserAction: false }),
    ).resolves.toMatchObject({
      active: true,
      status: "waiting",
      kind: "captcha",
      provider: "google",
    });
    expect(backend.navigate).not.toHaveBeenCalled();
    const blockedState = await service.getState();
    expect(blockedState).toHaveProperty("userAction");
    const userActionId = blockedState.userAction?.id;
    if (!userActionId) throw new Error("Expected a browser user-action id.");
    await expect(
      service.navigate({
        url: "https://commons.wikimedia.org/wiki/File:Rabbit.jpg",
        runtime: "internal",
        waitForUserAction: false,
        userActionId,
      }),
    ).resolves.toMatchObject({
      title: "Rabbit",
      text: "public domain rabbit image",
    });
    expect(backend.navigate).toHaveBeenCalledOnce();
    await expect(service.getState()).resolves.not.toHaveProperty("userAction");
  });

  it("clears a detached user-action state when the user marks a completed challenge", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-user-action-resume-detached-"));
    const backend = {
      isAvailable: () => true,
      isRunning: () => true,
      getState: async () => ({
        running: true,
        viewVisible: true,
        activeTab: { id: "internal", title: "Results", url: "https://www.google.com/search?q=ambient" },
      }),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
      setViewBounds: vi.fn(),
      navigate: vi.fn(),
      content: vi.fn(async () => ({ title: "Sorry", url: "https://www.google.com/sorry/index", text: "captcha", links: [] })),
      search: vi.fn(async () => []),
      evaluate: vi
        .fn()
        .mockResolvedValueOnce({
          detected: true,
          kind: "captcha",
          provider: "google",
          url: "https://www.google.com/sorry/index",
          title: "Sorry",
          origin: "https://www.google.com",
          message: "Google verification required.",
        })
        .mockResolvedValueOnce({ detected: false, url: "https://www.google.com/search?q=ambient", title: "Results" }),
      login: vi.fn(),
      screenshot: vi.fn(),
      pick: vi.fn(),
      cancelPick: vi.fn(),
    };
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      backend as any,
    );

    await expect(service.content({ runtime: "internal", waitForUserAction: false })).resolves.toMatchObject({
      active: true,
      status: "waiting",
      kind: "captcha",
      provider: "google",
    });
    await expect(service.resumeUserAction()).resolves.not.toHaveProperty("userAction");
    expect(backend.evaluate).toHaveBeenCalledTimes(2);
  });

  it("waits for user resume when the internal browser reports a challenge", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-user-action-"));
    const backend = {
      isAvailable: () => true,
      isRunning: () => true,
      getState: async () => ({
        running: true,
        viewVisible: true,
        activeTab: { id: "internal", title: "Sorry", url: "https://www.google.com/sorry/index" },
      }),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
      setViewBounds: vi.fn(),
      navigate: vi.fn(async () => ({ title: "Sorry", url: "https://www.google.com/sorry/index", text: "captcha", links: [] })),
      content: vi.fn(async () => ({ title: "Results", url: "https://www.google.com/search?q=ambient", text: "resolved", links: [] })),
      search: vi.fn(),
      evaluate: vi
        .fn()
        .mockResolvedValueOnce({
          detected: true,
          kind: "captcha",
          provider: "google",
          url: "https://www.google.com/sorry/index",
          title: "Sorry",
          origin: "https://www.google.com",
          message: "Google verification required.",
        })
        .mockResolvedValueOnce({ detected: false, url: "https://www.google.com/search?q=ambient", title: "Results" }),
      login: vi.fn(),
      screenshot: vi.fn(),
      pick: vi.fn(),
      cancelPick: vi.fn(),
    };
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      backend as any,
    );

    const activities: string[] = [];
    const pending = service.navigate({
      url: "https://www.google.com/search?q=ambient",
      runtime: "internal",
      onActivity: (message) => activities.push(message),
    });
    const waiting = await waitForBrowserUserAction(service);
    expect(waiting).toMatchObject({
      active: true,
      status: "waiting",
      kind: "captcha",
      provider: "google",
    });
    expect(activities).toContain("Waiting for the user to complete the browser captcha from google and click Confirmed.");
    await service.resumeUserAction();
    await expect(pending).resolves.toMatchObject({ title: "Results", text: "resolved" });
    await expect(service.getState()).resolves.not.toHaveProperty("userAction");
  });

  it("waits and reruns browser search after an internal browser challenge is completed", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-search-user-action-"));
    const backend = {
      isAvailable: () => true,
      isRunning: () => true,
      getState: async () => ({
        running: true,
        viewVisible: true,
        activeTab: { id: "internal", title: "Sorry", url: "https://www.google.com/sorry/index" },
      }),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
      setViewBounds: vi.fn(),
      navigate: vi.fn(),
      content: vi.fn(),
      search: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ title: "Result", url: "https://example.test/result", snippet: "resolved" }]),
      evaluate: vi
        .fn()
        .mockResolvedValueOnce({
          detected: true,
          kind: "captcha",
          provider: "google",
          url: "https://www.google.com/sorry/index",
          title: "Sorry",
          origin: "https://www.google.com",
          message: "Google verification required.",
        })
        .mockResolvedValueOnce({ detected: false, url: "https://www.google.com/search?q=ambient", title: "Results" }),
      login: vi.fn(),
      screenshot: vi.fn(),
      pick: vi.fn(),
      cancelPick: vi.fn(),
    };
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      backend as any,
    );

    const pending = service.search({ query: "ambient", runtime: "internal", sourceThreadId: "thread-search" });
    const waiting = await waitForBrowserUserAction(service);
    expect(waiting).toMatchObject({
      active: true,
      status: "waiting",
      kind: "captcha",
      provider: "google",
      sourceThreadId: "thread-search",
    });
    await service.resumeUserAction();
    await expect(pending).resolves.toEqual([{ title: "Result", url: "https://example.test/result", snippet: "resolved" }]);
    expect(backend.search).toHaveBeenCalledTimes(2);
    await expect(service.getState()).resolves.not.toHaveProperty("userAction");
  });
});

describe("BrowserService brokered login", () => {
  it("routes stored credentials through the internal browser without returning the password", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-login-"));
    const backend = {
      isAvailable: () => true,
      isRunning: () => true,
      getState: async () => ({
        running: true,
        viewVisible: true,
        activeTab: { id: "internal", title: "Login", url: "https://example.test/login" },
      }),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
      setViewBounds: vi.fn(),
      navigate: vi.fn(),
      content: vi.fn(),
      search: vi.fn(),
      evaluate: vi.fn(),
      login: vi.fn(async () => ({
        status: "submitted",
        credentialId: "cred-1",
        credentialLabel: "Fixture",
        origin: "https://example.test",
        username: "neo@example.test",
        url: "https://example.test/dashboard",
        title: "Dashboard",
        submitted: true,
        userActionRequired: false,
        message: "Credential filled and submit was attempted.",
      })),
      screenshot: vi.fn(),
      pick: vi.fn(),
      cancelPick: vi.fn(),
    };
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      backend as any,
    );

    const result = await service.login({
      credentialId: "cred-1",
      expectedOrigin: "https://example.test",
      credential: {
        id: "cred-1",
        label: "Fixture",
        origin: "https://example.test",
        username: "neo@example.test",
        password: "secret-password",
      },
      passwordSelector: "input[type=password]",
    });

    expect(backend.login).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "submitted", origin: "https://example.test", submitted: true });
    expect(JSON.stringify(result)).not.toContain("secret-password");
  });

  it("fails closed when the active page origin differs from the credential origin", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-login-origin-"));
    const backend = {
      isAvailable: () => true,
      isRunning: () => true,
      getState: async () => ({
        running: true,
        viewVisible: true,
        activeTab: { id: "internal", title: "Login", url: "https://evil.test/login" },
      }),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
      setViewBounds: vi.fn(),
      navigate: vi.fn(),
      content: vi.fn(),
      search: vi.fn(),
      evaluate: vi.fn(),
      login: vi.fn(),
      screenshot: vi.fn(),
      pick: vi.fn(),
      cancelPick: vi.fn(),
    };
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      backend as any,
    );

    await expect(
      service.login({
        credentialId: "cred-1",
        expectedOrigin: "https://example.test",
        credential: {
          id: "cred-1",
          label: "Fixture",
          origin: "https://example.test",
          username: "neo@example.test",
          password: "secret-password",
        },
      }),
    ).rejects.toThrow(/origin mismatch/);
    expect(backend.login).not.toHaveBeenCalled();
  });

  chromeLoginIntegration("logs into a local fixture through managed Chrome without exposing the password", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-login-chrome-"));
    const server = createLocalLoginFixture();
    const port = await listen(server);
    const origin = `http://127.0.0.1:${port}`;
    const service = new BrowserService(() => ({
      path: join(root, "workspace"),
      name: "workspace",
      statePath: join(root, "state"),
      sessionPath: join(root, "sessions"),
    }));

    try {
      const initialState = await service.getState();
      if (!initialState.chromeAvailable) return;

      await service.navigate({ url: `${origin}/login`, runtime: "chrome", profileMode: "isolated" });
      const result = await service.login({
        credentialId: "cred-local",
        expectedOrigin: origin,
        credential: {
          id: "cred-local",
          label: "Local fixture",
          origin,
          username: "neo",
          password: "ambient-password",
        },
        usernameSelector: "#username",
        passwordSelector: "#password",
        submitSelector: "#submit",
        runtime: "chrome",
        profileMode: "isolated",
      });
      const content = await service.content({ runtime: "chrome", profileMode: "isolated" });

      expect(result).toMatchObject({ status: "submitted", origin, submitted: true });
      expect(content).toMatchObject({
        url: `${origin}/dashboard`,
        text: expect.stringContaining("Signed in as neo"),
      });
      expect(JSON.stringify(result)).not.toContain("ambient-password");
      expect(JSON.stringify(content)).not.toContain("ambient-password");
    } finally {
      await service.shutdown();
      await close(server);
    }
  });

  chromeLoginIntegration("starts two managed Chrome instances concurrently with isolated debugging ports", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-multi-chrome-"));
    const server = createLocalLoginFixture();
    const port = await listen(server);
    const origin = `http://127.0.0.1:${port}`;
    const serviceA = new BrowserService(() => ({
      path: join(root, "workspace-a"),
      name: "workspace-a",
      statePath: join(root, "state-a"),
      sessionPath: join(root, "sessions-a"),
    }));
    const serviceB = new BrowserService(() => ({
      path: join(root, "workspace-b"),
      name: "workspace-b",
      statePath: join(root, "state-b"),
      sessionPath: join(root, "sessions-b"),
    }));

    try {
      const initialState = await serviceA.getState();
      if (!initialState.chromeAvailable) return;

      const [contentA, contentB] = await Promise.all([
        serviceA.navigate({ url: `${origin}/instance-a`, runtime: "chrome", profileMode: "isolated" }),
        serviceB.navigate({ url: `${origin}/instance-b`, runtime: "chrome", profileMode: "isolated" }),
      ]);
      const [stateA, stateB] = await Promise.all([serviceA.getState(), serviceB.getState()]);

      expect(contentA).toMatchObject({ text: expect.stringContaining("Instance A") });
      expect(contentB).toMatchObject({ text: expect.stringContaining("Instance B") });
      expect(stateA.activeTab?.url).toBe(`${origin}/instance-a`);
      expect(stateB.activeTab?.url).toBe(`${origin}/instance-b`);
      expect(stateA.copiedProfilePath).not.toBe(stateB.copiedProfilePath);
    } finally {
      await Promise.all([serviceA.shutdown(), serviceB.shutdown()]);
      await close(server);
    }
  });

  chromeLoginIntegration("reattaches to an existing Ambient-managed Chrome session manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-reattach-"));
    const server = createLocalLoginFixture();
    const port = await listen(server);
    const origin = `http://127.0.0.1:${port}`;
    const workspace = {
      path: join(root, "workspace"),
      name: "workspace",
      statePath: join(root, "state"),
      sessionPath: join(root, "sessions"),
    };
    const serviceA = new BrowserService(() => workspace);
    const serviceB = new BrowserService(() => workspace);

    try {
      const initialState = await serviceA.getState();
      if (!initialState.chromeAvailable) return;

      await serviceA.navigate({ url: `${origin}/instance-a`, runtime: "chrome", profileMode: "isolated" });
      const stateA = await serviceA.getState();
      expect(stateA.sessionId).toBeTruthy();

      const contentB = await serviceB.navigate({ url: `${origin}/instance-b`, runtime: "chrome", profileMode: "isolated" });
      const stateB = await serviceB.getState();

      expect(contentB).toMatchObject({ text: expect.stringContaining("Instance B") });
      expect(stateB.sessionId).toBe(stateA.sessionId);
      expect(stateB.attachedToExistingSession).toBe(true);
    } finally {
      await serviceB.shutdown();
      await serviceA.shutdown();
      await close(server);
    }
  });
});

describe("BrowserService browser picker state", () => {
  it("surfaces active picker state and cancels through the mediated backend", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-browser-picker-"));
    let resolvePick: (value: any) => void = () => undefined;
    const pickResult = new Promise<any>((resolve) => {
      resolvePick = resolve;
    });
    const backend = {
      isAvailable: () => true,
      isRunning: () => true,
      getState: async () => ({ running: true, viewVisible: true }),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined),
      setViewBounds: vi.fn(),
      navigate: vi.fn(),
      content: vi.fn(),
      search: vi.fn(),
      evaluate: vi.fn(),
      screenshot: vi.fn(),
      pick: vi.fn(() => pickResult),
      cancelPick: vi.fn(async () => {
        resolvePick({ canceled: true, prompt: "Select the submit button", selections: [] });
      }),
    };
    const service = new BrowserService(
      () => ({
        path: join(root, "workspace"),
        name: "workspace",
        statePath: join(root, "state"),
        sessionPath: join(root, "sessions"),
      }),
      backend as any,
    );

    const pick = service.pick({ prompt: "Select the submit button" });
    expect((await service.getState()).pickerPrompt).toBe("Select the submit button");
    await service.cancelPick();
    expect(backend.cancelPick).toHaveBeenCalledTimes(1);
    await expect(pick).resolves.toMatchObject({ canceled: true, prompt: "Select the submit button" });
    expect((await service.getState()).pickerActive).toBeUndefined();
  });
});

async function waitForBrowserUserAction(service: BrowserService) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 2_000) {
    const state = await service.getState();
    if (state.userAction?.active) return state.userAction;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for browser user-action state.");
}

function createLocalLoginFixture(): Server {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/login") {
      sendHtml(
        response,
        [
          "<!doctype html>",
          "<title>Fixture login</title>",
          '<form method="post" action="/login">',
          '<input id="username" name="username" autocomplete="username">',
          '<input id="password" name="password" type="password" autocomplete="current-password">',
          '<button id="submit" type="submit">Sign in</button>',
          "</form>",
        ].join(""),
      );
      return;
    }
    if (request.method === "POST" && request.url === "/login") {
      const body = await requestBody(request);
      const params = new URLSearchParams(body);
      if (params.get("username") === "neo" && params.get("password") === "ambient-password") {
        response.writeHead(303, { Location: "/dashboard" });
        response.end();
        return;
      }
      response.writeHead(401, { "content-type": "text/plain" });
      response.end("Invalid credentials");
      return;
    }
    if (request.method === "GET" && request.url === "/dashboard") {
      sendHtml(response, "<!doctype html><title>Dashboard</title><main>Signed in as neo</main>");
      return;
    }
    if (request.method === "GET" && request.url === "/instance-a") {
      sendHtml(response, "<!doctype html><title>Instance A</title><main>Instance A</main>");
      return;
    }
    if (request.method === "GET" && request.url === "/instance-b") {
      sendHtml(response, "<!doctype html><title>Instance B</title><main>Instance B</main>");
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function requestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("error", reject);
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function tinyPngBase64(): string {
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
}
