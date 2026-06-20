import { isLoopbackWebUrl, parseExternalOpenUrl } from "./externalUrlPolicy";

export interface ExternalNavigationRuntimeHost {
  workspacePath: string;
}

export interface ExternalNavigationWebContents {
  setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" }): void;
  on(event: "will-navigate", listener: (event: { preventDefault(): void }, url: string) => void): void;
}

export interface ExternalNavigationWindow {
  webContents: ExternalNavigationWebContents;
}

export interface ExternalNavigationServiceDependencies<Host extends ExternalNavigationRuntimeHost> {
  platform: NodeJS.Platform;
  openExternal(url: string): Promise<void>;
  openMacApplication(args: string[]): Promise<boolean>;
  recordRendererDiagnosticBreadcrumb(type: string, detail?: Record<string, unknown>): void;
  requireActiveProjectRuntimeHost(): Host;
  activeThreadIdForHost(host: Host): string;
  navigateLocalUrlInAmbientBrowser(host: Host, url: string): Promise<unknown>;
  revealActiveBrowser(host: Host): Promise<{ message?: unknown }>;
  recordBrowserControlAudit(host: Host, action: string, url: string, detail: string): void;
  emitBrowserStateForHost(host: Host): Promise<void>;
  log(message: string): void;
  warn(message: string): void;
}

export interface ExternalNavigationService {
  parseExternalOpenUrl(raw: string): string;
  isLoopbackWebUrl(raw: string): boolean;
  isGoogleWorkspaceSetupUrl(url: string): boolean;
  openAllowedExternalUrl(raw: string, source: string): Promise<void>;
  openAllowedExternalUrlFromWindow(raw: string, source: string): void;
  openGoogleWorkspaceUrl(url: string): Promise<void>;
  openRendererLocalUrlInAmbientBrowser(raw: string): Promise<void>;
  installExternalNavigationGuards(window: ExternalNavigationWindow, input: {
    source: string;
    allowNavigation?: (url: string) => boolean;
  }): void;
}

export function createExternalNavigationService<Host extends ExternalNavigationRuntimeHost>({
  platform,
  openExternal,
  openMacApplication,
  recordRendererDiagnosticBreadcrumb,
  requireActiveProjectRuntimeHost,
  activeThreadIdForHost,
  navigateLocalUrlInAmbientBrowser,
  revealActiveBrowser,
  recordBrowserControlAudit,
  emitBrowserStateForHost,
  log,
  warn,
}: ExternalNavigationServiceDependencies<Host>): ExternalNavigationService {
  async function openGoogleWorkspaceUrl(url: string): Promise<void> {
    const safeUrl = parseExternalOpenUrl(url);
    if (platform === "darwin") {
      if (await openMacApplication(["-a", "Google Chrome", safeUrl])) return;
      if (await openMacApplication(["-b", "com.google.Chrome", safeUrl])) return;
    }
    await openAllowedExternalUrl(safeUrl, "google-workspace");
  }

  async function openAllowedExternalUrl(raw: string, source: string): Promise<void> {
    const url = parseExternalOpenUrl(raw);
    recordRendererDiagnosticBreadcrumb("external-url-open", { source, url: externalUrlLogLabel(url) });
    await openExternal(url);
    log(`[external-url:${source}] opened ${externalUrlLogLabel(url)}`);
  }

  async function openRendererLocalUrlInAmbientBrowser(raw: string): Promise<void> {
    const url = parseExternalOpenUrl(raw);
    if (!isLoopbackWebUrl(url)) throw new Error("Only loopback web URLs can be routed to the Ambient browser from renderer links.");
    const host = requireActiveProjectRuntimeHost();
    recordRendererDiagnosticBreadcrumb("renderer-link-local-browser", {
      url: externalUrlLogLabel(url),
      workspacePath: host.workspacePath,
      threadId: activeThreadIdForHost(host),
    });
    await navigateLocalUrlInAmbientBrowser(host, url);
    const reveal = await revealActiveBrowser(host).catch((error: unknown) => ({
      message: error instanceof Error ? error.message : String(error),
    }));
    recordBrowserControlAudit(
      host,
      "browser_renderer_link",
      url,
      `Renderer link routed to Ambient browser. ${typeof reveal.message === "string" ? reveal.message : ""}`.trim(),
    );
    await emitBrowserStateForHost(host).catch(() => undefined);
    log(`[external-url:renderer-link] routed local URL to Ambient browser ${externalUrlLogLabel(url)}`);
  }

  function openAllowedExternalUrlFromWindow(raw: string, source: string): void {
    void openAllowedExternalUrl(raw, source).catch((error: unknown) => {
      warn(`[external-url:${source}] blocked ${externalUrlLogLabel(raw)}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  function installExternalNavigationGuards(
    window: ExternalNavigationWindow,
    input: { source: string; allowNavigation?: (url: string) => boolean },
  ): void {
    window.webContents.setWindowOpenHandler(({ url }) => {
      openAllowedExternalUrlFromWindow(url, `${input.source}:window-open`);
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
      if (input.allowNavigation?.(url)) return;
      event.preventDefault();
      openAllowedExternalUrlFromWindow(url, `${input.source}:navigate`);
    });
  }

  return {
    parseExternalOpenUrl,
    isLoopbackWebUrl,
    isGoogleWorkspaceSetupUrl,
    openAllowedExternalUrl,
    openAllowedExternalUrlFromWindow,
    openGoogleWorkspaceUrl,
    openRendererLocalUrlInAmbientBrowser,
    installExternalNavigationGuards,
  };
}

export function isGoogleWorkspaceSetupUrl(url: string): boolean {
  return /^https:\/\/(?:accounts\.google\.com|console\.cloud\.google\.com)\//.test(url);
}

export function externalUrlLogLabel(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "[invalid-url]";
  }
}
