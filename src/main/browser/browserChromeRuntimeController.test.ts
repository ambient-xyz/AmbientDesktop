import { describe, expect, it, vi } from "vitest";

import type {
  BrowserLoginRequest,
  BrowserPageContent,
  BrowserProfileMode,
  BrowserSearchResult,
  BrowserTabSnapshot,
} from "../../shared/browserTypes";
import {
  BrowserChromeRuntimeController,
  normalizeBrowserLoginRequest,
  type BrowserChromeRuntimeControllerOptions,
} from "./browserChromeRuntimeController";

describe("BrowserChromeRuntimeController", () => {
  it("reads active Chrome content and updates state callbacks", async () => {
    const pageContent: BrowserPageContent = {
      title: "Example",
      url: "https://example.test/",
      text: "Example page text",
      links: [{ text: "Docs", url: "https://example.test/docs" }],
    };
    const harness = createRuntimeHarness({ evaluateResults: [pageContent], targetId: "target-1" });

    const result = await harness.controller.content({ profileMode: "copied", sourceThreadId: "thread-1" });

    expect(harness.ensureChromeStarted).toHaveBeenCalledWith("copied");
    expect(harness.detectChromeUserAction).toHaveBeenCalledTimes(1);
    expect(harness.userActions.clearResolved).toHaveBeenCalledWith({
      runtime: "chrome",
      profileMode: "isolated",
      targetId: "target-1",
      message: "Browser user action no longer detected while reading the page.",
    });
    expect(harness.state.lastActiveTab).toEqual({ id: "target-1", title: "Example", url: "https://example.test/" });
    expect(harness.state.lastActivity).toBe("Read active page content.");
    expect(result).toEqual({
      title: "Example",
      url: "https://example.test/",
      text: "Example page text",
      links: [{ text: "Docs", url: "https://example.test/docs" }],
    });
  });

  it("searches, opens requested result pages, and attaches fetched content", async () => {
    const results: BrowserSearchResult[] = [{ title: "Result", url: "https://result.test/", snippet: "Snippet" }];
    const resultContent: BrowserPageContent = {
      title: "Result",
      url: "https://result.test/",
      text: "Fetched result content",
      links: [],
    };
    const harness = createRuntimeHarness({ evaluateResults: [results, resultContent] });

    const searchResults = await harness.controller.search({ query: "ambient browser", maxResults: 20, fetchContent: true });

    expect(harness.chromeTargets.navigateActiveTarget).toHaveBeenNthCalledWith(
      1,
      "https://www.google.com/search?q=ambient%20browser",
    );
    expect(harness.chromeTargets.navigateActiveTarget).toHaveBeenNthCalledWith(2, "https://result.test/");
    expect(searchResults).toEqual([
      {
        title: "Result",
        url: "https://result.test/",
        snippet: "Snippet",
        content: "Fetched result content",
      },
    ]);
    expect(harness.state.lastActivity).toBe('Searched Google for "ambient browser".');
  });

  it("fills normalized login requests and records the resulting active tab", async () => {
    const request = normalizeBrowserLoginRequest(loginRequest());
    const harness = createRuntimeHarness({
      activeTab: { id: "tab-1", title: "Login", url: "https://example.test/login" },
      evaluateResults: [
        {
          status: "submitted",
          submitted: true,
          url: "https://example.test/dashboard",
          title: "Dashboard",
        },
      ],
      targetId: "tab-1",
    });

    const result = await harness.controller.login(request);

    expect(harness.evaluatePage).toHaveBeenCalledWith(expect.any(String), 15_000);
    expect(harness.chromeTargets.waitForPageReady).toHaveBeenCalledTimes(1);
    expect(harness.state.lastActiveTab).toEqual({
      id: "tab-1",
      title: "Dashboard",
      url: "https://example.test/dashboard",
    });
    expect(result).toMatchObject({
      status: "submitted",
      credentialId: "credential-1",
      credentialLabel: "Example",
      origin: "https://example.test",
      username: "login@example.test",
      submitted: true,
    });
  });
});

function createRuntimeHarness(input: {
  activeTab?: BrowserTabSnapshot;
  evaluateResults?: unknown[];
  profileMode?: BrowserProfileMode;
  targetId?: string;
} = {}) {
  const state = {
    activeTab: input.activeTab,
    lastActiveTab: undefined as BrowserTabSnapshot | undefined,
    lastActivity: undefined as string | undefined,
    profileMode: input.profileMode ?? "isolated" as BrowserProfileMode,
    rememberedTab: undefined as BrowserTabSnapshot | undefined,
    targetId: input.targetId,
  };
  const evaluateResults = [...(input.evaluateResults ?? [])];
  const evaluatePage = vi.fn(async (_expression: string, _timeoutMs?: number): Promise<unknown> => evaluateResults.shift());
  const evaluatePageGeneric: BrowserChromeRuntimeControllerOptions["chromeTargets"]["evaluatePage"] = async <T,>(
    expression: string,
    timeoutMs?: number,
  ): Promise<T> => evaluatePage(expression, timeoutMs) as Promise<T>;
  const chromeTargets: BrowserChromeRuntimeControllerOptions["chromeTargets"] = {
    connectActivePage: vi.fn() as BrowserChromeRuntimeControllerOptions["chromeTargets"]["connectActivePage"],
    createTarget: vi.fn(),
    evaluatePage: evaluatePageGeneric,
    getActiveTabSnapshot: vi.fn(async () => state.activeTab ?? {}),
    navigateActiveTarget: vi.fn(),
    waitForPageReady: vi.fn(async () => undefined),
  };
  const userActions: BrowserChromeRuntimeControllerOptions["userActions"] = {
    attachChromeEvidence: vi.fn(async (action) => action),
    clearResolved: vi.fn(),
    normalizeDetection: vi.fn(() => undefined),
    waitForChromeClear: vi.fn(),
  };
  const ensureChromeStarted = vi.fn();
  const closeActiveAboutBlankTarget = vi.fn(async () => false);
  const detectChromeUserAction = vi.fn(async () => undefined);
  const controller = new BrowserChromeRuntimeController({
    chromeTargets,
    userActions,
    ensureChromeStarted,
    closeActiveAboutBlankTarget,
    detectChromeUserAction,
    getProfileMode: () => state.profileMode,
    getActiveTargetId: () => state.targetId,
    setLastActiveTab: (tab) => {
      state.lastActiveTab = tab;
    },
    setLastActivity: (message) => {
      state.lastActivity = message;
    },
    rememberChromeBrowserActionTarget: (tab) => {
      state.rememberedTab = tab;
    },
  });

  return {
    chromeTargets,
    closeActiveAboutBlankTarget,
    controller,
    detectChromeUserAction,
    evaluatePage,
    ensureChromeStarted,
    state,
    userActions,
  };
}

function loginRequest(): BrowserLoginRequest {
  return {
    credentialId: "credential-1",
    expectedOrigin: "https://example.test/login",
    credential: {
      id: "credential-1",
      label: "Example",
      origin: "https://example.test",
      username: "login@example.test",
      password: "example-password",
    },
  };
}
