import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => {
  const setBounds = vi.fn();
  const setVisible = vi.fn();
  const setAudioMuted = vi.fn();
  const loadURL = vi.fn(async (_url?: string) => undefined);
  const stop = vi.fn();
  const executeJavaScript = vi.fn(async (expression: string) => {
    if (expression === "document.readyState") return "complete";
    return [{ title: "Search result", url: "https://example.com/movie", snippet: "Scottsdale movie showtimes" }];
  });
  const addChildView = vi.fn();
  const webContents = {
    id: 7,
    close: vi.fn(),
    executeJavaScript,
    getTitle: vi.fn(() => "Internal Browser"),
    getURL: vi.fn(() => ""),
    isDestroyed: vi.fn(() => false),
    isLoading: vi.fn(() => false),
    loadURL,
    on: vi.fn(),
    setAudioMuted,
    setWindowOpenHandler: vi.fn(),
    stop,
  };
  class WebContentsView {
    webContents = webContents;
    setBounds = setBounds;
    setVisible = setVisible;
  }
  return {
    addChildView,
    executeJavaScript,
    loadURL,
    setBounds,
    setAudioMuted,
    setVisible,
    stop,
    webContents,
    WebContentsView,
    session: { fromPartition: vi.fn(() => ({})) },
  };
});

vi.mock("electron", () => ({
  BrowserWindow: class BrowserWindow {},
  WebContentsView: electronMock.WebContentsView,
  session: electronMock.session,
}));

import { INTERNAL_BROWSER_LOCAL_PREVIEW_MAX_LIFETIME_MS, InternalBrowserHost } from "./internalBrowserHost";

describe("InternalBrowserHost", () => {
  beforeEach(() => {
    electronMock.addChildView.mockClear();
    electronMock.executeJavaScript.mockClear();
    electronMock.loadURL.mockClear();
    electronMock.setBounds.mockClear();
    electronMock.setAudioMuted.mockClear();
    electronMock.setVisible.mockClear();
    electronMock.stop.mockClear();
    electronMock.webContents.close.mockClear();
    electronMock.webContents.getURL.mockReturnValue("");
    electronMock.webContents.isLoading.mockReturnValue(false);
    electronMock.webContents.on.mockClear();
    electronMock.webContents.setWindowOpenHandler.mockClear();
    electronMock.loadURL.mockImplementation(async () => undefined);
    electronMock.executeJavaScript.mockImplementation(async (expression: string) => {
      if (expression === "document.readyState") return "complete";
      return [{ title: "Search result", url: "https://example.com/movie", snippet: "Scottsdale movie showtimes" }];
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a non-zero hidden viewport off-window for browser-tool rendering", async () => {
    const host = new InternalBrowserHost(
      () => ({ path: "/tmp/project", statePath: "/tmp/project/.ambient-codex" }) as never,
      () =>
        ({
          isDestroyed: () => false,
          contentView: { addChildView: electronMock.addChildView },
        }) as never,
    );

    await host.start();

    expect(electronMock.addChildView).toHaveBeenCalledTimes(1);
    expect(electronMock.setBounds).toHaveBeenCalledWith({ x: -10_000, y: -10_000, width: 1280, height: 720 });
    expect(electronMock.setVisible).toHaveBeenCalledWith(false);
    expect(electronMock.setAudioMuted).toHaveBeenCalledWith(true);
    expect(electronMock.loadURL).toHaveBeenCalledWith("about:blank");
  });

  it("mutes hidden browser pages and unmutes the visible browser panel", async () => {
    const host = new InternalBrowserHost(
      () => ({ path: "/tmp/project", statePath: "/tmp/project/.ambient-codex" }) as never,
      () =>
        ({
          isDestroyed: () => false,
          contentView: { addChildView: electronMock.addChildView },
        }) as never,
    );

    await host.start();
    expect(electronMock.setAudioMuted).toHaveBeenLastCalledWith(true);

    host.setViewBounds({ x: 0, y: 0, width: 800, height: 600, visible: true });
    expect(electronMock.setAudioMuted).toHaveBeenLastCalledWith(false);

    host.setViewBounds({ x: 0, y: 0, width: 800, height: 600, visible: false });
    expect(electronMock.setAudioMuted).toHaveBeenLastCalledWith(true);
  });

  it("stops localhost preview pages after a finite lifetime", async () => {
    vi.useFakeTimers();
    const host = new InternalBrowserHost(
      () => ({ path: "/tmp/project", statePath: "/tmp/project/.ambient-codex" }) as never,
      () =>
        ({
          isDestroyed: () => false,
          contentView: { addChildView: electronMock.addChildView },
        }) as never,
    );

    await host.start();
    const didNavigate = electronMock.webContents.on.mock.calls.find(([event]) => event === "did-navigate")?.[1] as
      | ((event: unknown, url: string) => void)
      | undefined;
    expect(didNavigate).toBeTruthy();

    didNavigate!({}, "http://127.0.0.1:5173/");
    await vi.advanceTimersByTimeAsync(INTERNAL_BROWSER_LOCAL_PREVIEW_MAX_LIFETIME_MS - 1);
    expect(electronMock.webContents.close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(electronMock.webContents.close).toHaveBeenCalledTimes(1);
  });

  it("blocks non-web internal browser navigation and popups", async () => {
    const host = new InternalBrowserHost(
      () => ({ path: "/tmp/project", statePath: "/tmp/project/.ambient-codex" }) as never,
      () =>
        ({
          isDestroyed: () => false,
          contentView: { addChildView: electronMock.addChildView },
        }) as never,
    );

    await host.start();
    electronMock.webContents.getURL.mockReturnValue("about:blank");
    electronMock.loadURL.mockClear();

    await expect(host.navigate({ url: "file:///tmp/secret.html" })).rejects.toThrow(/internal browser is limited/i);
    expect(electronMock.loadURL).not.toHaveBeenCalled();

    const popupHandler = electronMock.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as
      | ((input: { url: string }) => { action: string })
      | undefined;
    expect(popupHandler).toBeTruthy();
    expect(popupHandler!({ url: "javascript:alert(1)" })).toEqual({ action: "deny" });
    expect(electronMock.loadURL).not.toHaveBeenCalled();

    expect(popupHandler!({ url: "https://example.com/" })).toEqual({ action: "deny" });
    expect(electronMock.loadURL).toHaveBeenCalledWith("https://example.com/");
  });

  it("continues after benign navigation aborts when the internal search page becomes readable", async () => {
    const host = new InternalBrowserHost(
      () => ({ path: "/tmp/project", statePath: "/tmp/project/.ambient-codex" }) as never,
      () =>
        ({
          isDestroyed: () => false,
          contentView: { addChildView: electronMock.addChildView },
        }) as never,
    );
    electronMock.loadURL.mockImplementation(async (url?: string) => {
      if (url?.startsWith("https://www.google.com/search")) throw new Error(`ERR_ABORTED (-3) loading '${url}'`);
    });

    await expect(host.search({ query: "Scottsdale movie showtimes", maxResults: 1 })).resolves.toEqual([
      expect.objectContaining({
        title: "Search result",
        url: "https://example.com/movie",
      }),
    ]);

    expect(electronMock.loadURL).toHaveBeenCalledWith(expect.stringContaining("https://www.google.com/search"));
    expect(electronMock.stop).not.toHaveBeenCalled();
    await expect(host.getState()).resolves.not.toHaveProperty("lastError");
  });

  it("bounds hung internal browser JavaScript evaluation", async () => {
    vi.useFakeTimers();
    const host = new InternalBrowserHost(
      () => ({ path: "/tmp/project", statePath: "/tmp/project/.ambient-codex" }) as never,
      () =>
        ({
          isDestroyed: () => false,
          contentView: { addChildView: electronMock.addChildView },
        }) as never,
    );
    electronMock.executeJavaScript.mockImplementation(() => new Promise<never>(() => undefined));

    const content = host.content({});
    const assertion = expect(content).rejects.toThrow(/Internal browser JavaScript evaluation timed out/);
    await vi.advanceTimersByTimeAsync(15_001);

    await assertion;
    await expect(host.getState()).resolves.toMatchObject({
      lastError: expect.stringMatching(/Internal browser JavaScript evaluation timed out/),
    });
  });
});
