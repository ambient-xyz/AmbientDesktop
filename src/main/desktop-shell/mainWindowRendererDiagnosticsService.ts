import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type RendererDiagnosticRedactor = (value: string) => string;

export interface RendererDiagnosticBreadcrumb {
  at: string;
  type: string;
  detail?: Record<string, unknown>;
}

export interface MainWindowRendererDiagnosticsWorkspace {
  statePath?: string;
  sessionPath?: string;
}

export interface MainWindowRendererDiagnosticsStore {
  getWorkspace(): MainWindowRendererDiagnosticsWorkspace;
}

export interface MainWindowRendererDiagnosticsBrowserService {
  getState(): Promise<unknown>;
}

export interface MainWindowRendererDiagnosticsHost {
  workspacePath: string;
  store: MainWindowRendererDiagnosticsStore;
  browserService: MainWindowRendererDiagnosticsBrowserService;
}

export interface MainWindowRendererDiagnosticsWebContents {
  on(event: string, listener: (...args: unknown[]) => void): void;
  getURL(): string;
  getOSProcessId?(): number;
  isCrashed?(): boolean;
}

export interface MainWindowRendererDiagnosticsWindow {
  webContents: MainWindowRendererDiagnosticsWebContents;
  on(event: string, listener: (...args: unknown[]) => void): void;
  isDestroyed(): boolean;
  loadURL(url: string): Promise<void>;
  loadFile(path: string): Promise<void>;
}

export interface MainWindowRendererDiagnosticsDependencies<
  Host extends MainWindowRendererDiagnosticsHost,
> {
  activeProjectRuntimeHost(): Host | undefined;
  activeThreadIdForHost(host: Host): string;
  userDataPath(): string;
  rendererUrl(): string | undefined;
  rendererIndexPath(): string;
  redactSensitiveText: RendererDiagnosticRedactor;
  now(): Date;
  nowMs(): number;
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface MainWindowRendererDiagnosticsService<Window extends MainWindowRendererDiagnosticsWindow> {
  recordRendererDiagnosticBreadcrumb(type: string, detail?: Record<string, unknown>): void;
  installMainWindowDiagnostics(window: Window): void;
  loadMainWindowRenderer(window: Window): Promise<void>;
}

const RENDERER_DIAGNOSTIC_BREADCRUMB_LIMIT = 50;

export function sanitizeRendererDiagnosticValue(
  value: unknown,
  redactSensitiveText: RendererDiagnosticRedactor = (input) => input,
  depth = 0,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncateRendererDiagnosticText(redactSensitiveText(value));
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (depth >= 4) return truncateRendererDiagnosticText(redactSensitiveText(String(value)));
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeRendererDiagnosticValue(item, redactSensitiveText, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 60)) {
      output[redactSensitiveText(key).slice(0, 160)] = sanitizeRendererDiagnosticValue(nested, redactSensitiveText, depth + 1);
    }
    return output;
  }
  return truncateRendererDiagnosticText(redactSensitiveText(String(value)));
}

function truncateRendererDiagnosticText(value: string, max = 1_000): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}

function sanitizeRendererDiagnosticRecord(input: Record<string, unknown>, redactSensitiveText: RendererDiagnosticRedactor): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input).slice(0, 60)) {
    output[redactSensitiveText(key).slice(0, 160)] = sanitizeRendererDiagnosticValue(value, redactSensitiveText);
  }
  return output;
}

export function createMainWindowRendererDiagnosticsService<
  Host extends MainWindowRendererDiagnosticsHost,
  Window extends MainWindowRendererDiagnosticsWindow,
>({
  activeProjectRuntimeHost,
  activeThreadIdForHost,
  userDataPath,
  rendererUrl,
  rendererIndexPath,
  redactSensitiveText,
  now,
  nowMs,
  setTimeout,
  log,
  warn,
  error,
}: MainWindowRendererDiagnosticsDependencies<Host>): MainWindowRendererDiagnosticsService<Window> {
  const rendererDiagnosticBreadcrumbs: RendererDiagnosticBreadcrumb[] = [];
  let rendererRecoveryWindowStartedAt = 0;
  let rendererRecoveryAttempts = 0;
  let rendererRecoveryTimer: ReturnType<typeof setTimeout> | undefined;

  function recordRendererDiagnosticBreadcrumb(type: string, detail: Record<string, unknown> = {}): void {
    const sanitized = sanitizeRendererDiagnosticRecord(detail, redactSensitiveText);
    rendererDiagnosticBreadcrumbs.push({
      at: now().toISOString(),
      type,
      ...(Object.keys(sanitized).length ? { detail: sanitized } : {}),
    });
    if (rendererDiagnosticBreadcrumbs.length > RENDERER_DIAGNOSTIC_BREADCRUMB_LIMIT) {
      rendererDiagnosticBreadcrumbs.splice(0, rendererDiagnosticBreadcrumbs.length - RENDERER_DIAGNOSTIC_BREADCRUMB_LIMIT);
    }
  }

  function installMainWindowDiagnostics(window: Window): void {
    window.webContents.on("console-message", (...args) => {
      const [, level, message, line, sourceId] = args as [unknown, number, string, number, string];
      recordRendererDiagnosticBreadcrumb("renderer-console", { level, message, line, sourceId });
      log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    window.webContents.on("did-fail-load", (...args) => {
      const [, code, description, url] = args as [unknown, number, string, string];
      recordRendererDiagnosticBreadcrumb("renderer-did-fail-load", { code, description, url });
      error(`[renderer] failed to load ${url}: ${code} ${description}`);
    });
    window.webContents.on("did-finish-load", () => {
      recordRendererDiagnosticBreadcrumb("renderer-did-finish-load", { url: window.webContents.getURL() });
      log(`[renderer] did-finish-load ${window.webContents.getURL()}`);
    });
    window.webContents.on("dom-ready", () => {
      recordRendererDiagnosticBreadcrumb("renderer-dom-ready", { url: window.webContents.getURL() });
      log(`[renderer] dom-ready ${window.webContents.getURL()}`);
    });
    window.webContents.on("render-process-gone", (...args) => {
      const [, details] = args as [unknown, { reason: string; exitCode: number }];
      recordRendererDiagnosticBreadcrumb("renderer-process-gone", {
        reason: details.reason,
        exitCode: details.exitCode,
        url: window.webContents.getURL(),
      });
      error(`[renderer] process gone: reason=${details.reason} exitCode=${details.exitCode}`);
      if (details.reason === "clean-exit" || details.reason === "killed") return;
      void persistRendererProcessGoneDiagnostic(window, details).catch((persistError) => {
        warn(`[renderer] failed to write crash diagnostic: ${persistError instanceof Error ? persistError.message : String(persistError)}`);
      });
      scheduleRendererRecovery(window, details.reason);
    });
    window.on("unresponsive", () => {
      recordRendererDiagnosticBreadcrumb("renderer-unresponsive", { url: window.webContents.getURL() });
      error("[renderer] window became unresponsive");
    });
    window.on("responsive", () => {
      recordRendererDiagnosticBreadcrumb("renderer-responsive", { url: window.webContents.getURL() });
      log("[renderer] window became responsive");
    });
  }

  async function persistRendererProcessGoneDiagnostic(
    window: Window,
    details: { reason: string; exitCode: number },
  ): Promise<void> {
    const recordedAt = now().toISOString();
    const host = activeProjectRuntimeHost();
    const workspace = host?.store.getWorkspace();
    const diagnosticRoot = workspace?.statePath ?? userDataPath();
    const diagnosticDir = join(diagnosticRoot, "diagnostics", "renderer-crashes");
    const safeTimestamp = recordedAt.replace(/[:.]/g, "-");
    const safeReason = details.reason.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "unknown";
    const diagnosticPath = join(diagnosticDir, `${safeTimestamp}-${safeReason}.json`);
    let browserState: unknown;
    let browserStateError: string | undefined;
    if (host) {
      try {
        browserState = await host.browserService.getState();
      } catch (stateError) {
        browserStateError = stateError instanceof Error ? stateError.message : String(stateError);
      }
    }
    const payload = sanitizeRendererDiagnosticValue({
      schemaVersion: "ambient-renderer-process-gone-v1",
      recordedAt,
      reason: details.reason,
      exitCode: details.exitCode,
      renderer: {
        url: window.webContents.getURL(),
        osProcessId: typeof window.webContents.getOSProcessId === "function" ? window.webContents.getOSProcessId() : undefined,
        isCrashed: typeof window.webContents.isCrashed === "function" ? window.webContents.isCrashed() : undefined,
      },
      recovery: {
        attempts: rendererRecoveryAttempts,
        windowStartedAt: rendererRecoveryWindowStartedAt,
      },
      workspace: host
        ? {
            path: host.workspacePath,
            statePath: workspace?.statePath,
            sessionPath: workspace?.sessionPath,
          }
        : undefined,
      activeThreadId: host ? activeThreadIdForHost(host) : undefined,
      browserState,
      browserStateError,
      breadcrumbs: rendererDiagnosticBreadcrumbs,
    }, redactSensitiveText);
    await mkdir(diagnosticDir, { recursive: true });
    await writeFile(diagnosticPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    error(`[renderer] process-gone diagnostic written ${diagnosticPath}`);
  }

  async function loadMainWindowRenderer(window: Window): Promise<void> {
    const url = rendererUrl();
    if (url) {
      await window.loadURL(url);
    } else {
      await window.loadFile(rendererIndexPath());
    }
  }

  function scheduleRendererRecovery(window: Window, reason: string): void {
    const currentTime = nowMs();
    if (currentTime - rendererRecoveryWindowStartedAt > 60_000) {
      rendererRecoveryWindowStartedAt = currentTime;
      rendererRecoveryAttempts = 0;
    }
    if (rendererRecoveryAttempts >= 2) {
      error(`[renderer] recovery suppressed after ${rendererRecoveryAttempts} attempts in 60s; last reason=${reason}`);
      return;
    }
    if (rendererRecoveryTimer) return;
    rendererRecoveryAttempts += 1;
    const attempt = rendererRecoveryAttempts;
    rendererRecoveryTimer = setTimeout(() => {
      rendererRecoveryTimer = undefined;
      if (window.isDestroyed()) return;
      warn(`[renderer] reloading after renderer process exit; reason=${reason}; attempt=${attempt}/2`);
      void loadMainWindowRenderer(window).catch((loadError) => {
        error(`[renderer] recovery reload failed: ${loadError instanceof Error ? loadError.stack ?? loadError.message : String(loadError)}`);
      });
    }, 500);
  }

  return {
    recordRendererDiagnosticBreadcrumb,
    installMainWindowDiagnostics,
    loadMainWindowRenderer,
  };
}
