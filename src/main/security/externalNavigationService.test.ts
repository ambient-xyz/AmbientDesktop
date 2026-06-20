import { describe, expect, it, vi } from "vitest";
import {
  createExternalNavigationService,
  externalUrlLogLabel,
  isGoogleWorkspaceSetupUrl,
  type ExternalNavigationRuntimeHost,
  type ExternalNavigationWindow,
} from "./externalNavigationService";

interface FakeHost extends ExternalNavigationRuntimeHost {
  id: string;
}

function createWindowHarness() {
  let openHandler: ((details: { url: string }) => { action: "deny" }) | undefined;
  let navigateHandler: ((event: { preventDefault(): void }, url: string) => void) | undefined;
  const window: ExternalNavigationWindow = {
    webContents: {
      setWindowOpenHandler: vi.fn((handler) => {
        openHandler = handler;
      }),
      on: vi.fn((event, handler) => {
        expect(event).toBe("will-navigate");
        navigateHandler = handler;
      }),
    },
  };
  return {
    openWindow: (url: string) => {
      if (!openHandler) throw new Error("Missing window-open handler.");
      return openHandler({ url });
    },
    navigate: (url: string) => {
      const event = { preventDefault: vi.fn() };
      if (!navigateHandler) throw new Error("Missing navigate handler.");
      navigateHandler(event, url);
      return event;
    },
    window,
  };
}

function createHarness(input: {
  platform?: NodeJS.Platform;
  openMacApplication?: (args: string[]) => Promise<boolean>;
  revealActiveBrowser?: (host: FakeHost) => Promise<{ message?: unknown }>;
} = {}) {
  const host: FakeHost = { id: "host-1", workspacePath: "/workspace" };
  const deps = {
    platform: input.platform ?? "linux",
    openExternal: vi.fn(async () => undefined),
    openMacApplication: vi.fn(input.openMacApplication ?? (async () => false)),
    recordRendererDiagnosticBreadcrumb: vi.fn(),
    requireActiveProjectRuntimeHost: vi.fn(() => host),
    activeThreadIdForHost: vi.fn(() => "thread-1"),
    navigateLocalUrlInAmbientBrowser: vi.fn(async () => undefined),
    revealActiveBrowser: vi.fn(input.revealActiveBrowser ?? (async () => ({ message: "shown" }))),
    recordBrowserControlAudit: vi.fn(),
    emitBrowserStateForHost: vi.fn(async () => undefined),
    log: vi.fn(),
    warn: vi.fn(),
  };
  return {
    deps,
    host,
    service: createExternalNavigationService<FakeHost>(deps),
  };
}

describe("external navigation helpers", () => {
  it("identifies Google Workspace setup URLs", () => {
    expect(isGoogleWorkspaceSetupUrl("https://accounts.google.com/o/oauth2/v2/auth")).toBe(true);
    expect(isGoogleWorkspaceSetupUrl("https://console.cloud.google.com/apis/credentials")).toBe(true);
    expect(isGoogleWorkspaceSetupUrl("https://example.com")).toBe(false);
  });

  it("formats external URL log labels without paths or secrets", () => {
    expect(externalUrlLogLabel("https://example.com/path?token=secret")).toBe("https://example.com");
    expect(externalUrlLogLabel("not a url")).toBe("[invalid-url]");
  });
});

describe("createExternalNavigationService", () => {
  it("opens allowed external URLs through the injected shell boundary", async () => {
    const { deps, service } = createHarness();

    await service.openAllowedExternalUrl(" https://example.com/path ", "test");

    expect(deps.openExternal).toHaveBeenCalledWith("https://example.com/path");
    expect(deps.recordRendererDiagnosticBreadcrumb).toHaveBeenCalledWith("external-url-open", {
      source: "test",
      url: "https://example.com",
    });
    expect(deps.log).toHaveBeenCalledWith("[external-url:test] opened https://example.com");
  });

  it("tries Chrome before falling back for Google Workspace URLs on macOS", async () => {
    const { deps, service } = createHarness({
      platform: "darwin",
      openMacApplication: async (args) => args[0] === "-b",
    });

    await service.openGoogleWorkspaceUrl("https://accounts.google.com/o/oauth2/v2/auth");

    expect(deps.openMacApplication).toHaveBeenNthCalledWith(1, [
      "-a",
      "Google Chrome",
      "https://accounts.google.com/o/oauth2/v2/auth",
    ]);
    expect(deps.openMacApplication).toHaveBeenNthCalledWith(2, [
      "-b",
      "com.google.Chrome",
      "https://accounts.google.com/o/oauth2/v2/auth",
    ]);
    expect(deps.openExternal).not.toHaveBeenCalled();
  });

  it("routes loopback renderer links through the Ambient browser", async () => {
    const { deps, host, service } = createHarness();

    await service.openRendererLocalUrlInAmbientBrowser("http://localhost:5173/app");

    expect(deps.requireActiveProjectRuntimeHost).toHaveBeenCalledOnce();
    expect(deps.navigateLocalUrlInAmbientBrowser).toHaveBeenCalledWith(host, "http://localhost:5173/app");
    expect(deps.recordRendererDiagnosticBreadcrumb).toHaveBeenCalledWith("renderer-link-local-browser", {
      url: "http://localhost:5173",
      workspacePath: "/workspace",
      threadId: "thread-1",
    });
    expect(deps.recordBrowserControlAudit).toHaveBeenCalledWith(
      host,
      "browser_renderer_link",
      "http://localhost:5173/app",
      "Renderer link routed to Ambient browser. shown",
    );
    expect(deps.emitBrowserStateForHost).toHaveBeenCalledWith(host);
  });

  it("rejects non-loopback renderer browser routing", async () => {
    const { deps, service } = createHarness();

    await expect(service.openRendererLocalUrlInAmbientBrowser("https://example.com/app")).rejects.toThrow(
      "Only loopback web URLs can be routed to the Ambient browser from renderer links.",
    );

    expect(deps.navigateLocalUrlInAmbientBrowser).not.toHaveBeenCalled();
  });

  it("records reveal failures without failing renderer link routing", async () => {
    const { deps, host, service } = createHarness({
      revealActiveBrowser: async () => {
        throw new Error("reveal failed");
      },
    });

    await service.openRendererLocalUrlInAmbientBrowser("http://127.0.0.1:3000/app");

    expect(deps.recordBrowserControlAudit).toHaveBeenCalledWith(
      host,
      "browser_renderer_link",
      "http://127.0.0.1:3000/app",
      "Renderer link routed to Ambient browser. reveal failed",
    );
  });

  it("installs external navigation guards and preserves allowed renderer navigation", () => {
    const { deps, service } = createHarness();
    const { navigate, openWindow, window } = createWindowHarness();

    service.installExternalNavigationGuards(window, {
      source: "main-window",
      allowNavigation: (url) => url.startsWith("file://"),
    });

    expect(openWindow("https://example.com")).toEqual({ action: "deny" });
    const allowedEvent = navigate("file:///renderer/index.html");
    expect(allowedEvent.preventDefault).not.toHaveBeenCalled();
    const deniedEvent = navigate("https://example.com/docs");
    expect(deniedEvent.preventDefault).toHaveBeenCalledOnce();
    expect(deps.openExternal).toHaveBeenCalledWith("https://example.com/");
    expect(deps.openExternal).toHaveBeenCalledWith("https://example.com/docs");
  });

  it("warns when blocked window navigation cannot be opened", async () => {
    const { deps, service } = createHarness();
    deps.openExternal.mockRejectedValueOnce(new Error("blocked"));

    service.openAllowedExternalUrlFromWindow("file:///tmp/secret.txt", "main-window:navigate");
    await Promise.resolve();

    expect(deps.warn).toHaveBeenCalledWith(
      "[external-url:main-window:navigate] blocked file://: Only https links and loopback http links can be opened externally. Use local file actions for files.",
    );
  });
});
