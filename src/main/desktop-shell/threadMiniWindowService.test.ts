import { describe, expect, it, vi } from "vitest";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import {
  buildThreadMiniWindowBrowserWindowOptions,
  createThreadMiniWindowService,
  isThreadMiniWindowRendererUrl,
  threadMiniWindowDataUrl,
  type ThreadMiniWindow,
  type ThreadMiniWindowHtmlRenderer,
} from "./threadMiniWindowService";

type Listener = () => void;

class FakeThreadMiniWindow implements ThreadMiniWindow {
  private readonly listeners = new Map<string, Listener[]>();
  destroyed = false;
  minimized = false;
  visible = false;
  onLoadURL: (() => void | Promise<void>) | undefined;
  readonly titles: string[] = [];
  readonly loadUrlCalls: string[] = [];
  readonly restore = vi.fn<() => void>(() => {
    this.minimized = false;
  });
  readonly show = vi.fn<() => void>(() => {
    this.visible = true;
  });
  readonly focus = vi.fn<() => void>();

  setTitle(title: string): void {
    this.titles.push(title);
  }

  async loadURL(url: string): Promise<void> {
    this.loadUrlCalls.push(url);
    await this.onLoadURL?.();
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  isMinimized(): boolean {
    return this.minimized;
  }

  isVisible(): boolean {
    return this.visible;
  }

  once(event: string, listener: Listener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  emit(event: string): void {
    const listeners = this.listeners.get(event) ?? [];
    this.listeners.delete(event);
    for (const listener of listeners) listener();
  }
}

const thread: ThreadSummary = {
  id: "thread-1",
  title: "Thread Mini Window",
  workspacePath: "/workspace/project",
  createdAt: "2026-06-19T00:00:00.000Z",
  updatedAt: "2026-06-19T00:00:00.000Z",
  lastMessagePreview: "Preview",
  permissionMode: "full-access",
  collaborationMode: "agent",
  model: "<model>",
  thinkingLevel: "high",
};

const messages: ChatMessage[] = [
  {
    id: "message-1",
    threadId: "thread-1",
    role: "assistant",
    content: "Built the mini window.",
    createdAt: "2026-06-19T00:01:00.000Z",
  },
  {
    id: "message-2",
    threadId: "thread-1",
    role: "assistant",
    content: "Hidden thinking",
    createdAt: "2026-06-19T00:02:00.000Z",
    metadata: { kind: "thinking", status: "done" },
  },
];

function createHarness(input: {
  configureWindow?: (window: FakeThreadMiniWindow) => void;
  platform?: NodeJS.Platform;
} = {}) {
  const createdWindows: FakeThreadMiniWindow[] = [];
  const createBrowserWindow = vi.fn(() => {
    const window = new FakeThreadMiniWindow();
    input.configureWindow?.(window);
    createdWindows.push(window);
    return window;
  });
  const installExternalNavigationGuards = vi.fn();
  const renderThreadMiniWindowHtml = vi.fn<ThreadMiniWindowHtmlRenderer>((thread, messages, workingDirectory, options) => [
    "<html><body>",
    `<h1>${thread.title}</h1>`,
    `<p>${workingDirectory}</p>`,
    `<p>${messages[0]?.content ?? ""}</p>`,
    `<p>${options.theme}:${options.platform}:${options.thinkingDisplayMode}</p>`,
    "</body></html>",
  ].join(""));
  const service = createThreadMiniWindowService({
    platform: input.platform ?? "darwin",
    currentTheme: () => "dark",
    thinkingDisplayMode: () => "off",
    renderThreadMiniWindowHtml,
    resolveAppIconPath: () => "/icon.png",
    currentBackgroundColor: () => "#101416",
    createBrowserWindow,
    installExternalNavigationGuards,
  });

  return {
    createdWindows,
    createBrowserWindow,
    installExternalNavigationGuards,
    renderThreadMiniWindowHtml,
    service,
  };
}

function decodedMiniWindowUrl(url: string): string {
  expect(url.startsWith("data:text/html;charset=utf-8,")).toBe(true);
  return decodeURIComponent(url.slice("data:text/html;charset=utf-8,".length));
}

describe("thread mini window helpers", () => {
  it("recognizes mini-window data URLs only", () => {
    expect(isThreadMiniWindowRendererUrl("data:text/html;charset=utf-8,%3Chtml%3E")).toBe(true);
    expect(isThreadMiniWindowRendererUrl("https://example.com")).toBe(false);
  });

  it("builds encoded data URLs", () => {
    expect(threadMiniWindowDataUrl("<h1>A&B</h1>")).toBe("data:text/html;charset=utf-8,%3Ch1%3EA%26B%3C%2Fh1%3E");
  });

  it("builds BrowserWindow options with platform-specific title bar behavior", () => {
    expect(buildThreadMiniWindowBrowserWindowOptions({
      backgroundColor: "#ffffff",
      iconPath: "/icon.png",
      isDarwin: true,
      title: "Mini",
    })).toMatchObject({
      width: 760,
      height: 680,
      minWidth: 420,
      minHeight: 360,
      show: false,
      title: "Mini",
      icon: "/icon.png",
      backgroundColor: "#ffffff",
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 18, y: 18 },
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    expect(buildThreadMiniWindowBrowserWindowOptions({
      backgroundColor: "#ffffff",
      isDarwin: false,
      title: "Mini",
    })).toMatchObject({
      titleBarStyle: "default",
    });
  });
});

describe("createThreadMiniWindowService", () => {
  it("creates a mini window and installs navigation guards", async () => {
    const { createdWindows, createBrowserWindow, installExternalNavigationGuards, renderThreadMiniWindowHtml, service } = createHarness();

    await service.openThreadMiniWindow(thread, messages, "/workspace/project");

    expect(createBrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
      title: "Thread Mini Window",
      icon: "/icon.png",
      backgroundColor: "#101416",
      titleBarStyle: "hiddenInset",
    }));
    const miniWindow = createdWindows[0];
    expect(installExternalNavigationGuards).toHaveBeenCalledWith(miniWindow);
    expect(renderThreadMiniWindowHtml).toHaveBeenCalledWith(thread, messages, "/workspace/project", {
      theme: "dark",
      platform: "darwin",
      thinkingDisplayMode: "off",
    });
    expect(miniWindow.loadUrlCalls).toHaveLength(1);
    const html = decodedMiniWindowUrl(miniWindow.loadUrlCalls[0]);
    expect(html).toContain("Thread Mini Window");
    expect(html).toContain("/workspace/project");
    expect(html).toContain("Built the mini window.");
    expect(miniWindow.show).toHaveBeenCalledTimes(1);
    expect(miniWindow.focus).toHaveBeenCalledTimes(1);
  });

  it("refreshes and restores an existing mini window for the same thread", async () => {
    const { createdWindows, createBrowserWindow, service } = createHarness();
    await service.openThreadMiniWindow(thread, messages, "/workspace/project");
    const miniWindow = createdWindows[0];
    miniWindow.minimized = true;
    miniWindow.visible = true;

    await service.openThreadMiniWindow({ ...thread, title: "Updated Title" }, [messages[0]], "/workspace/updated");

    expect(createBrowserWindow).toHaveBeenCalledTimes(1);
    expect(miniWindow.titles).toEqual(["Updated Title"]);
    expect(miniWindow.loadUrlCalls).toHaveLength(2);
    expect(decodedMiniWindowUrl(miniWindow.loadUrlCalls[1])).toContain("/workspace/updated");
    expect(miniWindow.restore).toHaveBeenCalledTimes(1);
    expect(miniWindow.show).toHaveBeenCalledTimes(2);
    expect(miniWindow.focus).toHaveBeenCalledTimes(2);
  });

  it("forgets closed windows before creating a new one for the same thread", async () => {
    const { createdWindows, createBrowserWindow, service } = createHarness();
    await service.openThreadMiniWindow(thread, messages, "/workspace/project");

    createdWindows[0].emit("closed");
    await service.openThreadMiniWindow(thread, messages, "/workspace/project");

    expect(createBrowserWindow).toHaveBeenCalledTimes(2);
    expect(createdWindows).toHaveLength(2);
  });

  it("does not show a destroyed window from ready-to-show or post-load fallback", async () => {
    const { createdWindows, service } = createHarness({
      configureWindow: (window) => {
        window.onLoadURL = () => {
          window.destroyed = true;
        };
      },
    });

    await service.openThreadMiniWindow(thread, messages, "/workspace/project");
    const miniWindow = createdWindows[0];

    expect(miniWindow.show).not.toHaveBeenCalled();
    expect(miniWindow.focus).not.toHaveBeenCalled();
    miniWindow.emit("ready-to-show");
    expect(miniWindow.show).not.toHaveBeenCalled();
    expect(miniWindow.focus).not.toHaveBeenCalled();
  });
});
