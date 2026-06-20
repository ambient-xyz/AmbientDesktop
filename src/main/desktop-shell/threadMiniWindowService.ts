import type { BrowserWindowConstructorOptions } from "electron";
import type { ResolvedTheme, ThinkingDisplayMode } from "../../shared/desktopTypes";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";

export interface ThreadMiniWindow {
  setTitle(title: string): void;
  loadURL(url: string): Promise<void>;
  isDestroyed(): boolean;
  isMinimized(): boolean;
  isVisible(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
  once(event: string, listener: () => void): void;
}

export type ThreadMiniWindowHtmlRenderer = (
  thread: ThreadSummary,
  messages: ChatMessage[],
  workingDirectory: string,
  options: {
    theme: ResolvedTheme;
    platform: NodeJS.Platform;
    thinkingDisplayMode: ThinkingDisplayMode;
  },
) => string;

export interface ThreadMiniWindowDependencies<Window extends ThreadMiniWindow> {
  platform: NodeJS.Platform;
  currentTheme(): ResolvedTheme;
  thinkingDisplayMode(): ThinkingDisplayMode;
  renderThreadMiniWindowHtml: ThreadMiniWindowHtmlRenderer;
  resolveAppIconPath(): string | undefined;
  currentBackgroundColor(): string;
  createBrowserWindow(options: BrowserWindowConstructorOptions): Window;
  installExternalNavigationGuards(window: Window): void;
}

export interface ThreadMiniWindowService {
  openThreadMiniWindow(thread: ThreadSummary, messages: ChatMessage[], workingDirectory: string): Promise<void>;
}

export function isThreadMiniWindowRendererUrl(url: string): boolean {
  return url.startsWith("data:text/html;charset=utf-8,");
}

export function threadMiniWindowDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export function buildThreadMiniWindowBrowserWindowOptions(input: {
  backgroundColor: string;
  iconPath?: string;
  isDarwin: boolean;
  title: string;
}): BrowserWindowConstructorOptions {
  const { backgroundColor, iconPath, isDarwin, title } = input;
  return {
    width: 760,
    height: 680,
    minWidth: 420,
    minHeight: 360,
    show: false,
    title,
    ...(iconPath ? { icon: iconPath } : {}),
    backgroundColor,
    titleBarStyle: isDarwin ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

export function createThreadMiniWindowService<Window extends ThreadMiniWindow>({
  platform,
  currentTheme,
  thinkingDisplayMode,
  renderThreadMiniWindowHtml,
  resolveAppIconPath,
  currentBackgroundColor,
  createBrowserWindow,
  installExternalNavigationGuards,
}: ThreadMiniWindowDependencies<Window>): ThreadMiniWindowService {
  const threadMiniWindows = new Map<string, Window>();

  function renderMiniWindowUrl(thread: ThreadSummary, messages: ChatMessage[], workingDirectory: string): string {
    return threadMiniWindowDataUrl(renderThreadMiniWindowHtml(thread, messages, workingDirectory, {
      theme: currentTheme(),
      platform,
      thinkingDisplayMode: thinkingDisplayMode(),
    }));
  }

  async function openThreadMiniWindow(
    thread: ThreadSummary,
    messages: ChatMessage[],
    workingDirectory: string,
  ): Promise<void> {
    const miniWindowUrl = renderMiniWindowUrl(thread, messages, workingDirectory);
    const existing = threadMiniWindows.get(thread.id);
    if (existing && !existing.isDestroyed()) {
      existing.setTitle(thread.title);
      await existing.loadURL(miniWindowUrl);
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      return;
    }

    const miniWindow = createBrowserWindow(buildThreadMiniWindowBrowserWindowOptions({
      backgroundColor: currentBackgroundColor(),
      iconPath: resolveAppIconPath(),
      isDarwin: platform === "darwin",
      title: thread.title,
    }));
    threadMiniWindows.set(thread.id, miniWindow);
    miniWindow.once("closed", () => {
      if (threadMiniWindows.get(thread.id) === miniWindow) threadMiniWindows.delete(thread.id);
    });
    miniWindow.once("ready-to-show", () => {
      if (miniWindow.isDestroyed()) return;
      miniWindow.show();
      miniWindow.focus();
    });
    installExternalNavigationGuards(miniWindow);
    await miniWindow.loadURL(miniWindowUrl);
    if (!miniWindow.isDestroyed() && !miniWindow.isVisible()) miniWindow.show();
    if (!miniWindow.isDestroyed()) miniWindow.focus();
  }

  return {
    openThreadMiniWindow,
  };
}
