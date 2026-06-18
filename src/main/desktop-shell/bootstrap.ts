import { app, BrowserWindow, dialog, protocol, shell } from "electron";
import electronUpdater from "electron-updater";
import { mkdirSync } from "node:fs";
import { WORKSPACE_MEDIA_SCHEME } from "../../shared/workspaceMedia";
import { DesktopUpdateService, desktopUpdateConfigFromEnv, type DesktopUpdateConfig } from "./updateService";
import { fetchBootstrapRecoveryPolicy, type BootstrapRecoveryDecision } from "./updaterBootstrapPolicy";

const { autoUpdater } = electronUpdater;

type AmbientAppModule = {
  startAmbientDesktopApp?: () => Promise<void>;
};

let bootCompleted = false;
let recoveryStarted = false;
let bootstrapFatalHandler: ((error: unknown) => void) | undefined;
let bootstrapRejectionHandler: ((reason: unknown) => void) | undefined;

configureEarlyAppIdentity();
registerPrivilegedSchemes();
installBrokenPipeGuards();
installBootstrapFatalHandlers();
if (installSingleInstanceGuard()) {
  app.whenReady().then(runBootstrap).catch((error: unknown) => void enterRecoveryMode("Electron failed before startup completed.", error));
}

function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: WORKSPACE_MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        stream: true,
        supportFetchAPI: true,
      },
    },
  ]);
}

async function runBootstrap(): Promise<void> {
  const updateConfig = recoveryUpdateConfig();
  const policy = await readRecoveryPolicy(updateConfig);
  if (policy.shouldEnterRecovery) {
    await enterRecoveryMode(policy.reason ?? "This version has been marked for recovery by the update feed.", policy.message, updateConfig);
    return;
  }

  try {
    await startRealAppWithWatchdog();
    bootCompleted = true;
    removeBootstrapFatalHandlers();
  } catch (error) {
    await enterRecoveryMode("Ambient Desktop failed before startup completed.", error, updateConfig);
  }
}

async function startRealAppWithWatchdog(): Promise<void> {
  const startup = import("../index").then(async (module: AmbientAppModule) => {
    if (typeof module.startAmbientDesktopApp !== "function") {
      throw new Error("Real app module did not export startAmbientDesktopApp().");
    }
    await module.startAmbientDesktopApp();
  });
  startup.catch((error: unknown) => {
    if (!recoveryStarted && !bootCompleted) console.error("[bootstrap] Ambient Desktop startup failed.", error);
  });

  const watchdogMs = numberFromEnv(process.env.AMBIENT_DESKTOP_BOOTSTRAP_WATCHDOG_MS, 60_000);
  if (watchdogMs <= 0) {
    await startup;
    return;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Ambient Desktop startup did not complete within ${watchdogMs} ms.`));
    }, watchdogMs);
    timer.unref?.();
  });

  try {
    await Promise.race([startup, watchdog]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function enterRecoveryMode(reason: string, errorOrMessage?: unknown, config = recoveryUpdateConfig()): Promise<void> {
  if (recoveryStarted) return;
  recoveryStarted = true;
  removeBootstrapFatalHandlers();
  console.error("[bootstrap] Entering Ambient Desktop recovery mode.", reason, errorOrMessage);
  for (const window of BrowserWindow.getAllWindows()) window.destroy();

  const service = new DesktopUpdateService(autoUpdater, { ...config, startupDelayMs: 0, checkIntervalMs: 0 }, (state) => {
    console.log(`[bootstrap] recovery updater status=${state.status} version=${state.availableVersion ?? "none"}`);
  });
  service.start();

  try {
    while (true) {
      const action = await promptRecoveryAction(reason, errorOrMessage, service);
      if (action === "quit") {
        service.dispose();
        app.quit();
        return;
      }
      if (action === "open-user-data") {
        await shell.openPath(app.getPath("userData"));
        continue;
      }
      if (action === "check") {
        await service.checkForUpdates("manual");
        continue;
      }
      if (action === "download-install") {
        const downloaded = await service.downloadUpdate();
        if (downloaded.status === "downloaded") {
          service.installUpdateAndRestart();
          return;
        }
        continue;
      }
      if (action === "install") {
        service.installUpdateAndRestart();
        return;
      }
    }
  } finally {
    service.dispose();
  }
}

async function promptRecoveryAction(
  reason: string,
  errorOrMessage: unknown,
  service: DesktopUpdateService,
): Promise<"check" | "download-install" | "install" | "open-user-data" | "quit"> {
  const state = service.getState();
  const actions = recoveryActionsForState(state);
  const result = await dialog.showMessageBox({
    type: state.status === "available" || state.status === "downloaded" ? "info" : "error",
    title: "Ambient Desktop Recovery",
    message: "Ambient Desktop failed to start.",
    detail: recoveryDetail(reason, errorOrMessage, state),
    buttons: actions.map((action) => action.label),
    defaultId: 0,
    cancelId: actions.findIndex((action) => action.kind === "quit"),
    noLink: true,
  });
  return actions[Math.max(0, result.response)]?.kind ?? "quit";
}

function recoveryActionsForState(state: ReturnType<DesktopUpdateService["getState"]>): Array<{
  kind: "check" | "download-install" | "install" | "open-user-data" | "quit";
  label: string;
}> {
  if (!state.enabled) {
    return [
      { kind: "open-user-data", label: "Open User Data" },
      { kind: "quit", label: "Quit" },
    ];
  }
  if (state.status === "downloaded") {
    return [
      { kind: "install", label: "Install and Restart" },
      { kind: "open-user-data", label: "Open User Data" },
      { kind: "quit", label: "Quit" },
    ];
  }
  if (state.status === "available" || state.status === "error") {
    return [
      { kind: "download-install", label: "Download and Install Update" },
      { kind: "check", label: "Check Again" },
      { kind: "open-user-data", label: "Open User Data" },
      { kind: "quit", label: "Quit" },
    ];
  }
  return [
    { kind: "check", label: "Check for Update" },
    { kind: "open-user-data", label: "Open User Data" },
    { kind: "quit", label: "Quit" },
  ];
}

function recoveryDetail(reason: string, errorOrMessage: unknown, state: ReturnType<DesktopUpdateService["getState"]>): string {
  const lines = [reason];
  const detail = errorDetail(errorOrMessage);
  if (detail) lines.push("", detail);
  lines.push("", `Installed version: ${state.currentVersion}`);
  if (state.feedUrl) lines.push(`Update feed: ${state.feedUrl}`);
  if (!state.enabled && state.disabledReason) lines.push(`Updates unavailable: ${state.disabledReason}`);
  if (state.availableVersion) lines.push(`Available version: ${state.availableVersion}`);
  if (state.error) lines.push(`Updater error: ${state.error}`);
  lines.push("", "If an update is available, install it from this recovery dialog. If no update is available, reinstall manually from the stable download page.");
  return lines.join("\n");
}

async function readRecoveryPolicy(config: DesktopUpdateConfig): Promise<BootstrapRecoveryDecision> {
  if (!config.enabled || !config.feedUrl) return { shouldEnterRecovery: false };
  try {
    return await fetchBootstrapRecoveryPolicy({
      feedUrl: config.feedUrl,
      currentVersion: config.currentVersion,
      timeoutMs: numberFromEnv(process.env.AMBIENT_DESKTOP_BOOTSTRAP_POLICY_TIMEOUT_MS, 3_000),
    });
  } catch (error) {
    console.warn("[bootstrap] Unable to read update recovery policy; continuing normal startup.", error);
    return { shouldEnterRecovery: false };
  }
}

function recoveryUpdateConfig(): DesktopUpdateConfig {
  return desktopUpdateConfigFromEnv({
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    releaseChannel: process.env.AMBIENT_RELEASE_CHANNEL,
  });
}

function configureEarlyAppIdentity(): void {
  app.setName("Ambient Desktop");
  if (process.env.AMBIENT_E2E_USER_DATA) {
    mkdirSync(process.env.AMBIENT_E2E_USER_DATA, { recursive: true });
    app.setPath("userData", process.env.AMBIENT_E2E_USER_DATA);
  }
}

function installSingleInstanceGuard(): boolean {
  if (process.env.AMBIENT_DESKTOP_ALLOW_MULTI_INSTANCE === "1") return true;
  const userDataPath = app.getPath("userData");
  const locked = app.requestSingleInstanceLock({ userDataPath });
  if (!locked) {
    console.warn(`[bootstrap] Another Ambient Desktop instance already owns userData: ${userDataPath}`);
    app.quit();
    return false;
  }
  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  return true;
}

function installBootstrapFatalHandlers(): void {
  bootstrapFatalHandler = (error: unknown) => {
    if (!bootCompleted) void enterRecoveryMode("Ambient Desktop hit a startup exception.", error);
  };
  bootstrapRejectionHandler = (reason: unknown) => {
    if (!bootCompleted) void enterRecoveryMode("Ambient Desktop hit a startup promise rejection.", reason);
  };
  process.on("uncaughtException", bootstrapFatalHandler);
  process.on("unhandledRejection", bootstrapRejectionHandler);
}

function installBrokenPipeGuards(): void {
  process.stdout.on("error", handleProcessStreamError);
  process.stderr.on("error", handleProcessStreamError);
  console.log = guardedConsoleWriter(console.log.bind(console));
  console.info = guardedConsoleWriter(console.info.bind(console));
  console.warn = guardedConsoleWriter(console.warn.bind(console));
  console.error = guardedConsoleWriter(console.error.bind(console));
}

function guardedConsoleWriter(write: (...args: unknown[]) => void): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    try {
      write(...args);
    } catch (error) {
      if (!isBrokenPipeError(error)) throw error;
    }
  };
}

function handleProcessStreamError(error: Error): void {
  if (isBrokenPipeError(error)) return;
  try {
    process.stderr.write(`[bootstrap] process stream error: ${error.stack ?? error.message}\n`);
  } catch {
    // There may be no writable stdio left when this runs.
  }
}

function isBrokenPipeError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "EPIPE");
}

function removeBootstrapFatalHandlers(): void {
  if (bootstrapFatalHandler) process.off("uncaughtException", bootstrapFatalHandler);
  if (bootstrapRejectionHandler) process.off("unhandledRejection", bootstrapRejectionHandler);
  bootstrapFatalHandler = undefined;
  bootstrapRejectionHandler = undefined;
}

function errorDetail(errorOrMessage: unknown): string | undefined {
  if (!errorOrMessage) return undefined;
  if (errorOrMessage instanceof Error) return errorOrMessage.stack ?? errorOrMessage.message;
  return String(errorOrMessage);
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
