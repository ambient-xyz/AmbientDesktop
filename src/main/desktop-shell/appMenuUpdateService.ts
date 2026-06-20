import type { DesktopUpdateState } from "../../shared/desktopTypes";

export interface AppMenuUpdateWindow {
  isDestroyed(): boolean;
}

export interface AppMenuUpdateDialogOptions {
  type: "info" | "error";
  buttons: ["OK"];
  defaultId: 0;
  cancelId: 0;
  title: "Ambient Desktop Updates";
  message: string;
  detail: string;
  noLink: true;
}

export interface AppMenuUpdateServiceDependencies<Window extends AppMenuUpdateWindow> {
  checkForUpdates(): Promise<DesktopUpdateState>;
  getWindow(): Window | undefined;
  showMessageBox(window: Window | undefined, options: AppMenuUpdateDialogOptions): Promise<void>;
}

export interface AppMenuUpdateService {
  checkForUpdatesFromAppMenu(): Promise<void>;
}

export function createAppMenuUpdateService<Window extends AppMenuUpdateWindow>({
  checkForUpdates,
  getWindow,
  showMessageBox,
}: AppMenuUpdateServiceDependencies<Window>): AppMenuUpdateService {
  async function showAppMenuUpdateDialog(options: AppMenuUpdateDialogOptions): Promise<void> {
    const window = getWindow();
    await showMessageBox(window && !window.isDestroyed() ? window : undefined, options);
  }

  async function checkForUpdatesFromAppMenu(): Promise<void> {
    try {
      await showAppMenuUpdateDialog(appMenuUpdateDialogForState(await checkForUpdates()));
    } catch (error) {
      await showAppMenuUpdateDialog(appMenuUpdateDialogForError(error));
    }
  }

  return {
    checkForUpdatesFromAppMenu,
  };
}

export function appMenuUpdateDialogForState(update: DesktopUpdateState): AppMenuUpdateDialogOptions {
  switch (update.status) {
    case "available":
      return appMenuUpdateDialogOptions({
        type: "info",
        message: "An Ambient Desktop update is available.",
        detail: appMenuUpdateDialogDetail([
          update.availableVersion ? `Available version: ${update.availableVersion}` : undefined,
          `Installed version: ${update.currentVersion}`,
          "Open Ambient Desktop to download and install the update.",
        ]),
      });
    case "downloading":
      return appMenuUpdateDialogOptions({
        type: "info",
        message: "Ambient Desktop is downloading an update.",
        detail: appMenuUpdateDialogDetail([
          update.availableVersion ? `Version: ${update.availableVersion}` : undefined,
          update.progress ? `Progress: ${Math.round(update.progress.percent)}%` : undefined,
        ]),
      });
    case "downloaded":
      return appMenuUpdateDialogOptions({
        type: "info",
        message: "An Ambient Desktop update is ready to install.",
        detail: appMenuUpdateDialogDetail([
          update.availableVersion ? `Version: ${update.availableVersion}` : undefined,
          "Open Ambient Desktop to restart and install the update.",
        ]),
      });
    case "installing":
      return appMenuUpdateDialogOptions({
        type: "info",
        message: "Ambient Desktop will install the update while restarting.",
        detail: appMenuUpdateDialogDetail([update.availableVersion ? `Version: ${update.availableVersion}` : undefined]),
      });
    case "not-available":
      return appMenuUpdateDialogOptions({
        type: "info",
        message: "Ambient Desktop is up to date.",
        detail: appMenuUpdateDialogDetail([
          `Installed version: ${update.currentVersion}`,
          `Channel: ${update.channel}`,
          update.lastCheckedAt ? `Last checked: ${update.lastCheckedAt}` : undefined,
        ]),
      });
    case "checking":
      return appMenuUpdateDialogOptions({
        type: "info",
        message: "Ambient Desktop is already checking for updates.",
        detail: appMenuUpdateDialogDetail([`Installed version: ${update.currentVersion}`, `Channel: ${update.channel}`]),
      });
    case "disabled":
      return appMenuUpdateDialogOptions({
        type: "info",
        message: "Updates are not active.",
        detail: update.disabledReason ?? "Ambient Desktop updates are not configured for this build.",
      });
    case "error":
      return appMenuUpdateDialogOptions({
        type: "error",
        message: "Could not check for updates.",
        detail: update.error ?? "Ambient Desktop could not complete the update check.",
      });
    case "idle":
      return appMenuUpdateDialogOptions({
        type: "info",
        message: "Ambient Desktop did not start a new update check.",
        detail: appMenuUpdateDialogDetail([`Installed version: ${update.currentVersion}`, `Channel: ${update.channel}`]),
      });
  }
}

export function appMenuUpdateDialogForError(error: unknown): AppMenuUpdateDialogOptions {
  return appMenuUpdateDialogOptions({
    type: "error",
    message: "Could not check for updates.",
    detail: error instanceof Error ? error.message : String(error),
  });
}

export function appMenuUpdateDialogDetail(lines: Array<string | undefined>): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function appMenuUpdateDialogOptions(input: {
  type: "info" | "error";
  message: string;
  detail: string;
}): AppMenuUpdateDialogOptions {
  return {
    type: input.type,
    buttons: ["OK"],
    defaultId: 0,
    cancelId: 0,
    title: "Ambient Desktop Updates",
    message: input.message,
    detail: input.detail,
    noLink: true,
  };
}
