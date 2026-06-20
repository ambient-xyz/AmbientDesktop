import type { BrowserWindowConstructorOptions } from "electron";
import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  type PersistedWindowState,
} from "./windowState";

export interface MainWindowBootstrapStore {
  getWorkspace(): { path: string };
}

export interface MainWindowBootstrapHost<Store extends MainWindowBootstrapStore = MainWindowBootstrapStore> {
  workspacePath: string;
  store: Store;
  autoDispatch: {
    enabled: boolean;
  };
}

export interface MainWindowBootstrapWindow {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  maximize(): void;
  restore(): void;
  show(): void;
  focus(): void;
}

export interface MainWindowBootstrapDependencies<
  Host extends MainWindowBootstrapHost,
  Window extends MainWindowBootstrapWindow,
> {
  isDarwin: boolean;
  startupWorkspacePath(): string;
  activateProjectRuntimeHost(workspacePath: string): Host;
  clearManagedVoiceArtifactCache(reason: "startup", workspacePath: string, store: Host["store"]): Promise<unknown>;
  clearImportedWorkspaceContextCache(reason: "startup"): Promise<unknown>;
  runWorkflowTraceRetentionSweep(reason: "startup", host: Host): void;
  scheduleWorkflowTraceRetentionSweep(): void;
  scheduleAutoDispatch(delayMs: number, host: Host): void;
  registerProjectWorkspacePath(workspacePath: string): void;
  ensureWelcomeOnboardingProject(): void;
  resolveAppIconPath(): string | undefined;
  readWindowState(): Promise<PersistedWindowState | undefined>;
  setDockIcon(iconPath: string | undefined): void;
  currentBackgroundColor(): string;
  preloadPath(): string;
  createBrowserWindow(options: BrowserWindowConstructorOptions): Window;
  setMainWindow(window: Window): void;
  mainWindow(): Window | undefined;
  ensureWindowVisible(window: Window): void;
  trackWindowState(window: Window): void;
  installExternalNavigationGuards(window: Window): void;
  installMainWindowDiagnostics(window: Window): void;
  loadMainWindowRenderer(window: Window): Promise<void>;
}

export interface MainWindowBootstrapService {
  createWindow(): Promise<void>;
  showOrCreateMainWindow(): void;
}

export function buildMainWindowBrowserWindowOptions(input: {
  backgroundColor: string;
  iconPath?: string;
  isDarwin: boolean;
  preloadPath: string;
  savedWindowState?: PersistedWindowState;
}): BrowserWindowConstructorOptions {
  const { backgroundColor, iconPath, isDarwin, preloadPath, savedWindowState } = input;
  return {
    width: savedWindowState?.width ?? 1320,
    height: savedWindowState?.height ?? 900,
    ...(savedWindowState?.x !== undefined ? { x: savedWindowState.x } : {}),
    ...(savedWindowState?.y !== undefined ? { y: savedWindowState.y } : {}),
    center: savedWindowState?.x === undefined || savedWindowState.y === undefined,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: "Ambient Desktop",
    ...(iconPath ? { icon: iconPath } : {}),
    backgroundColor,
    titleBarStyle: isDarwin ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

export function createMainWindowBootstrapService<
  Host extends MainWindowBootstrapHost,
  Window extends MainWindowBootstrapWindow,
>({
  isDarwin,
  startupWorkspacePath,
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
  currentBackgroundColor,
  preloadPath,
  createBrowserWindow,
  setMainWindow,
  mainWindow,
  ensureWindowVisible,
  trackWindowState,
  installExternalNavigationGuards,
  installMainWindowDiagnostics,
  loadMainWindowRenderer,
}: MainWindowBootstrapDependencies<Host, Window>): MainWindowBootstrapService {
  async function createWindow(): Promise<void> {
    const startupHost = activateProjectRuntimeHost(startupWorkspacePath());
    await clearManagedVoiceArtifactCache("startup", startupHost.workspacePath, startupHost.store);
    await clearImportedWorkspaceContextCache("startup");
    runWorkflowTraceRetentionSweep("startup", startupHost);
    scheduleWorkflowTraceRetentionSweep();
    registerProjectWorkspacePath(startupHost.store.getWorkspace().path);
    ensureWelcomeOnboardingProject();
    const iconPath = resolveAppIconPath();
    const savedWindowState = await readWindowState();
    setDockIcon(iconPath);

    const window = createBrowserWindow(buildMainWindowBrowserWindowOptions({
      backgroundColor: currentBackgroundColor(),
      iconPath,
      isDarwin,
      preloadPath: preloadPath(),
      savedWindowState,
    }));
    setMainWindow(window);

    if (savedWindowState?.maximized) window.maximize();
    ensureWindowVisible(window);
    trackWindowState(window);
    installExternalNavigationGuards(window);
    installMainWindowDiagnostics(window);

    await loadMainWindowRenderer(window);
    if (startupHost.autoDispatch.enabled) scheduleAutoDispatch(1_000, startupHost);
  }

  function showOrCreateMainWindow(): void {
    const window = mainWindow();
    if (!window || window.isDestroyed()) {
      void createWindow();
      return;
    }
    ensureWindowVisible(window);
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  return {
    createWindow,
    showOrCreateMainWindow,
  };
}
