import { describe, expect, it, vi } from "vitest";
import {
  buildMainWindowBrowserWindowOptions,
  createMainWindowBootstrapService,
  type MainWindowBootstrapHost,
  type MainWindowBootstrapStore,
  type MainWindowBootstrapWindow,
} from "./mainWindowBootstrapService";
import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  type PersistedWindowState,
} from "./windowState";

interface FakeStore extends MainWindowBootstrapStore {
  workspacePath: string;
}

interface FakeHost extends MainWindowBootstrapHost<FakeStore> {
  id: string;
}

interface FakeWindow extends MainWindowBootstrapWindow {
  destroyed: boolean;
  minimized: boolean;
}

function createHost(input: { autoDispatchEnabled?: boolean } = {}): FakeHost {
  return {
    id: "host-1",
    workspacePath: "/workspace/project",
    store: {
      workspacePath: "/workspace/project",
      getWorkspace() {
        return { path: this.workspacePath };
      },
    },
    autoDispatch: {
      enabled: input.autoDispatchEnabled ?? true,
    },
  };
}

function createWindow(input: { destroyed?: boolean; minimized?: boolean } = {}): FakeWindow {
  return {
    destroyed: input.destroyed ?? false,
    minimized: input.minimized ?? false,
    isDestroyed() {
      return this.destroyed;
    },
    isMinimized() {
      return this.minimized;
    },
    maximize: vi.fn<() => void>(),
    restore: vi.fn<() => void>(),
    show: vi.fn<() => void>(),
    focus: vi.fn<() => void>(),
  };
}

function createHarness(input: {
  existingWindow?: FakeWindow;
  host?: FakeHost;
  savedWindowState?: PersistedWindowState;
} = {}) {
  const calls: string[] = [];
  const host = input.host ?? createHost();
  let currentWindow = input.existingWindow;
  const createdWindow = createWindow();
  const activateProjectRuntimeHost = vi.fn((workspacePath: string) => {
    calls.push(`activate:${workspacePath}`);
    return host;
  });
  const clearManagedVoiceArtifactCache = vi.fn(async () => {
    calls.push("clear-voice");
  });
  const clearImportedWorkspaceContextCache = vi.fn(async () => {
    calls.push("clear-imported-context");
  });
  const runWorkflowTraceRetentionSweep = vi.fn(() => {
    calls.push("trace-sweep");
  });
  const scheduleWorkflowTraceRetentionSweep = vi.fn(() => {
    calls.push("trace-schedule");
  });
  const scheduleAutoDispatch = vi.fn(() => {
    calls.push("auto-dispatch");
  });
  const registerProjectWorkspacePath = vi.fn(() => {
    calls.push("register-project");
  });
  const ensureWelcomeOnboardingProject = vi.fn(() => {
    calls.push("welcome");
  });
  const resolveAppIconPath = vi.fn(() => "/icon.png");
  const readWindowState = vi.fn(async () => input.savedWindowState);
  const setDockIcon = vi.fn(() => {
    calls.push("dock-icon");
  });
  const createBrowserWindow = vi.fn(() => {
    calls.push("create-browser-window");
    return createdWindow;
  });
  const setMainWindow = vi.fn((window: FakeWindow) => {
    calls.push("set-main-window");
    currentWindow = window;
  });
  const ensureWindowVisible = vi.fn(() => {
    calls.push("ensure-visible");
  });
  const trackWindowState = vi.fn(() => {
    calls.push("track-window-state");
  });
  const installExternalNavigationGuards = vi.fn(() => {
    calls.push("navigation-guards");
  });
  const installMainWindowDiagnostics = vi.fn(() => {
    calls.push("diagnostics");
  });
  const loadMainWindowRenderer = vi.fn(async () => {
    calls.push("load-renderer");
  });
  const service = createMainWindowBootstrapService<FakeHost, FakeWindow>({
    isDarwin: true,
    startupWorkspacePath: () => "/workspace/project",
    activateProjectRuntimeHost,
    clearManagedVoiceArtifactCache,
    clearImportedWorkspaceContextCache,
    runWorkflowTraceRetentionSweep,
    scheduleWorkflowTraceRetentionSweep,
    scheduleAutoDispatch,
    registerProjectWorkspacePath,
    ensureWelcomeOnboardingProject,
    resolveAppIconPath,
    readWindowState,
    setDockIcon,
    currentBackgroundColor: () => "#ffffff",
    preloadPath: () => "/out/preload/index.cjs",
    createBrowserWindow,
    setMainWindow,
    mainWindow: () => currentWindow,
    ensureWindowVisible,
    trackWindowState,
    installExternalNavigationGuards,
    installMainWindowDiagnostics,
    loadMainWindowRenderer,
  });

  return {
    activateProjectRuntimeHost,
    calls,
    clearManagedVoiceArtifactCache,
    createdWindow,
    createBrowserWindow,
    ensureWindowVisible,
    host,
    installExternalNavigationGuards,
    installMainWindowDiagnostics,
    loadMainWindowRenderer,
    scheduleAutoDispatch,
    service,
    setMainWindow,
  };
}

describe("buildMainWindowBrowserWindowOptions", () => {
  it("builds the default main window options", () => {
    expect(buildMainWindowBrowserWindowOptions({
      backgroundColor: "#111111",
      isDarwin: false,
      preloadPath: "/preload.cjs",
    })).toMatchObject({
      width: 1320,
      height: 900,
      center: true,
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      title: "Ambient Desktop",
      backgroundColor: "#111111",
      titleBarStyle: "default",
      trafficLightPosition: { x: 18, y: 18 },
      webPreferences: {
        preload: "/preload.cjs",
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
  });

  it("preserves saved bounds, maximized state, and macOS title bar options", () => {
    expect(buildMainWindowBrowserWindowOptions({
      backgroundColor: "#222222",
      iconPath: "/icon.png",
      isDarwin: true,
      preloadPath: "/preload.cjs",
      savedWindowState: {
        x: 10,
        y: 20,
        width: 1440,
        height: 960,
        maximized: true,
      },
    })).toMatchObject({
      x: 10,
      y: 20,
      width: 1440,
      height: 960,
      center: false,
      icon: "/icon.png",
      titleBarStyle: "hiddenInset",
    });
  });
});

describe("createMainWindowBootstrapService", () => {
  it("creates the startup window and preserves startup side-effect ordering", async () => {
    const {
      activateProjectRuntimeHost,
      calls,
      clearManagedVoiceArtifactCache,
      createdWindow,
      createBrowserWindow,
      ensureWindowVisible,
      host,
      installExternalNavigationGuards,
      installMainWindowDiagnostics,
      loadMainWindowRenderer,
      scheduleAutoDispatch,
      service,
      setMainWindow,
    } = createHarness({ savedWindowState: { width: 1400, height: 900, maximized: true } });

    await service.createWindow();

    expect(activateProjectRuntimeHost).toHaveBeenCalledWith("/workspace/project");
    expect(clearManagedVoiceArtifactCache).toHaveBeenCalledWith("startup", "/workspace/project", host.store);
    expect(createBrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
      width: 1400,
      height: 900,
      backgroundColor: "#ffffff",
      icon: "/icon.png",
    }));
    expect(setMainWindow).toHaveBeenCalledWith(createdWindow);
    expect(createdWindow.maximize).toHaveBeenCalledTimes(1);
    expect(ensureWindowVisible).toHaveBeenCalledWith(createdWindow);
    expect(installExternalNavigationGuards).toHaveBeenCalledWith(createdWindow);
    expect(installMainWindowDiagnostics).toHaveBeenCalledWith(createdWindow);
    expect(loadMainWindowRenderer).toHaveBeenCalledWith(createdWindow);
    expect(scheduleAutoDispatch).toHaveBeenCalledWith(1_000, host);
    expect(calls).toEqual([
      "activate:/workspace/project",
      "clear-voice",
      "clear-imported-context",
      "trace-sweep",
      "trace-schedule",
      "register-project",
      "welcome",
      "dock-icon",
      "create-browser-window",
      "set-main-window",
      "ensure-visible",
      "track-window-state",
      "navigation-guards",
      "diagnostics",
      "load-renderer",
      "auto-dispatch",
    ]);
  });

  it("does not schedule auto-dispatch when startup host dispatch is disabled", async () => {
    const { scheduleAutoDispatch, service } = createHarness({
      host: createHost({ autoDispatchEnabled: false }),
    });

    await service.createWindow();

    expect(scheduleAutoDispatch).not.toHaveBeenCalled();
  });

  it("shows an existing main window", () => {
    const existingWindow = createWindow({ minimized: true });
    const { ensureWindowVisible, service } = createHarness({ existingWindow });

    service.showOrCreateMainWindow();

    expect(ensureWindowVisible).toHaveBeenCalledWith(existingWindow);
    expect(existingWindow.restore).toHaveBeenCalledTimes(1);
    expect(existingWindow.show).toHaveBeenCalledTimes(1);
    expect(existingWindow.focus).toHaveBeenCalledTimes(1);
  });

  it("creates a new main window when there is no usable existing window", () => {
    const { activateProjectRuntimeHost, service } = createHarness();

    service.showOrCreateMainWindow();

    expect(activateProjectRuntimeHost).toHaveBeenCalledWith("/workspace/project");
  });
});
