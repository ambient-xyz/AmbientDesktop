import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createMainWindowRendererDiagnosticsService,
  sanitizeRendererDiagnosticValue,
  type MainWindowRendererDiagnosticsHost,
  type MainWindowRendererDiagnosticsWebContents,
  type MainWindowRendererDiagnosticsWindow,
} from "./mainWindowRendererDiagnosticsService";

type Listener = (...args: unknown[]) => void;

class FakeWebContents implements MainWindowRendererDiagnosticsWebContents {
  private readonly handlers = new Map<string, Listener[]>();
  url = "file:///out/renderer/index.html";

  on(event: string, listener: Listener): void {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), listener]);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.handlers.get(event) ?? []) listener(...args);
  }

  getURL(): string {
    return this.url;
  }

  getOSProcessId(): number {
    return 4242;
  }

  isCrashed(): boolean {
    return false;
  }
}

class FakeWindow implements MainWindowRendererDiagnosticsWindow {
  private readonly handlers = new Map<string, Listener[]>();
  readonly webContents = new FakeWebContents();
  destroyed = false;
  readonly loadUrlCalls: string[] = [];
  readonly loadFileCalls: string[] = [];

  on(event: string, listener: Listener): void {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), listener]);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.handlers.get(event) ?? []) listener(...args);
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  async loadURL(url: string): Promise<void> {
    this.loadUrlCalls.push(url);
  }

  async loadFile(path: string): Promise<void> {
    this.loadFileCalls.push(path);
  }
}

async function waitForCrashFile(root: string): Promise<string> {
  const crashDir = join(root, "diagnostics", "renderer-crashes");
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const files = await readdir(crashDir).catch(() => []);
    if (files.length) return join(crashDir, files[0]);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for renderer crash diagnostic");
}

function createHost(statePath: string): MainWindowRendererDiagnosticsHost {
  return {
    workspacePath: "/workspace/project",
    store: {
      getWorkspace() {
        return {
          statePath,
          sessionPath: "/workspace/project/.ambient/session",
        };
      },
    },
    browserService: {
      async getState() {
        return {
          currentUrl: "http://127.0.0.1:4173",
          nested: { value: "kept" },
        };
      },
    },
  };
}

function createHarness(input: {
  host?: MainWindowRendererDiagnosticsHost;
  rendererUrl?: string;
  userDataPath?: string;
  nowMs?: number;
} = {}) {
  const window = new FakeWindow();
  const logMessages: string[] = [];
  const warnMessages: string[] = [];
  const errorMessages: string[] = [];
  const timers: { callback: () => void; delayMs: number }[] = [];
  let currentNowMs = input.nowMs ?? 10_000;
  const service = createMainWindowRendererDiagnosticsService({
    activeProjectRuntimeHost: () => input.host,
    activeThreadIdForHost: () => "thread-1",
    userDataPath: () => input.userDataPath ?? "/tmp/ambient-user-data",
    rendererUrl: () => input.rendererUrl,
    rendererIndexPath: () => "/out/renderer/index.html",
    redactSensitiveText: (value) => value,
    now: () => new Date("2026-06-19T12:00:00.000Z"),
    nowMs: () => currentNowMs,
    setTimeout: (callback, delayMs) => {
      timers.push({ callback, delayMs });
      return { id: timers.length } as unknown as ReturnType<typeof setTimeout>;
    },
    log: (message) => logMessages.push(message),
    warn: (message) => warnMessages.push(message),
    error: (message) => errorMessages.push(message),
  });

  return {
    advanceNowMs: (value: number) => {
      currentNowMs = value;
    },
    errorMessages,
    logMessages,
    service,
    timers,
    warnMessages,
    window,
  };
}

describe("sanitizeRendererDiagnosticValue", () => {
  it("bounds nested diagnostic values", () => {
    const sanitized = sanitizeRendererDiagnosticValue({
      items: Array.from({ length: 35 }, (_value, index) => ({ index })),
      text: "x".repeat(12_100),
    }) as { items: unknown[]; text: string };

    expect(sanitized.items).toHaveLength(30);
    expect(sanitized.text).toHaveLength(12_003);
    expect(sanitized.text.endsWith("...")).toBe(true);
  });
});

describe("createMainWindowRendererDiagnosticsService", () => {
  it("loads either the configured renderer URL or the built renderer file", async () => {
    const urlHarness = createHarness({ rendererUrl: "http://127.0.0.1:5173" });
    await urlHarness.service.loadMainWindowRenderer(urlHarness.window);
    expect(urlHarness.window.loadUrlCalls).toEqual(["http://127.0.0.1:5173"]);
    expect(urlHarness.window.loadFileCalls).toEqual([]);

    const fileHarness = createHarness();
    await fileHarness.service.loadMainWindowRenderer(fileHarness.window);
    expect(fileHarness.window.loadUrlCalls).toEqual([]);
    expect(fileHarness.window.loadFileCalls).toEqual(["/out/renderer/index.html"]);
  });

  it("records renderer lifecycle breadcrumbs and logs", () => {
    const { errorMessages, logMessages, service, window } = createHarness();

    service.installMainWindowDiagnostics(window);
    window.webContents.emit("console-message", {}, 2, "hello", 7, "renderer.tsx");
    window.webContents.emit("did-fail-load", {}, -105, "ERR_NAME_NOT_RESOLVED", "https://example.invalid");
    window.webContents.emit("did-finish-load");
    window.webContents.emit("dom-ready");
    window.emit("unresponsive");
    window.emit("responsive");

    expect(logMessages).toEqual([
      "[renderer:2] hello (renderer.tsx:7)",
      "[renderer] did-finish-load file:///out/renderer/index.html",
      "[renderer] dom-ready file:///out/renderer/index.html",
      "[renderer] window became responsive",
    ]);
    expect(errorMessages).toEqual([
      "[renderer] failed to load https://example.invalid: -105 ERR_NAME_NOT_RESOLVED",
      "[renderer] window became unresponsive",
    ]);
  });

  it("persists renderer process-gone diagnostics and schedules a recovery reload", async () => {
    const diagnosticRoot = await mkdtemp(join(tmpdir(), "ambient-renderer-diagnostics-"));
    const host = createHost(diagnosticRoot);
    const { errorMessages, service, timers, warnMessages, window } = createHarness({ host });
    service.recordRendererDiagnosticBreadcrumb("external-url-open", { url: "http://127.0.0.1:4173" });
    service.installMainWindowDiagnostics(window);

    window.webContents.emit("render-process-gone", {}, { reason: "crashed", exitCode: 11 });

    expect(timers).toHaveLength(1);
    expect(timers[0].delayMs).toBe(500);
    const crashPath = await waitForCrashFile(diagnosticRoot);
    const payload = JSON.parse(await readFile(crashPath, "utf8")) as {
      schemaVersion: string;
      reason: string;
      exitCode: number;
      renderer: { url: string; osProcessId: number; isCrashed: boolean };
      workspace: { path: string; statePath: string; sessionPath: string };
      activeThreadId: string;
      browserState: { currentUrl: string; nested: { value: string } };
      breadcrumbs: Array<{ type: string }>;
    };

    expect(payload).toMatchObject({
      schemaVersion: "ambient-renderer-process-gone-v1",
      reason: "crashed",
      exitCode: 11,
      renderer: {
        url: "file:///out/renderer/index.html",
        osProcessId: 4242,
        isCrashed: false,
      },
      workspace: {
        path: "/workspace/project",
        statePath: expect.any(String),
        sessionPath: "/workspace/project/.ambient/session",
      },
      activeThreadId: "thread-1",
      browserState: {
        currentUrl: "http://127.0.0.1:4173",
        nested: { value: "kept" },
      },
    });
    expect(payload.breadcrumbs.map((breadcrumb) => breadcrumb.type)).toEqual([
      "external-url-open",
      "renderer-process-gone",
    ]);

    timers[0].callback();
    await Promise.resolve();
    expect(window.loadFileCalls).toEqual(["/out/renderer/index.html"]);
    expect(warnMessages).toEqual([
      "[renderer] reloading after renderer process exit; reason=crashed; attempt=1/2",
    ]);
    expect(errorMessages.some((message) => message.includes("process-gone diagnostic written"))).toBe(true);
  });

  it("does not recover clean renderer exits", async () => {
    const diagnosticRoot = await mkdtemp(join(tmpdir(), "ambient-renderer-diagnostics-clean-"));
    const { service, timers, window } = createHarness({ host: createHost(diagnosticRoot) });
    service.installMainWindowDiagnostics(window);

    window.webContents.emit("render-process-gone", {}, { reason: "clean-exit", exitCode: 0 });

    expect(timers).toEqual([]);
    const crashDir = join(diagnosticRoot, "diagnostics", "renderer-crashes");
    await expect(readdir(crashDir)).rejects.toThrow();
  });
});
