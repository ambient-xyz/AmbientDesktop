import { describe, expect, it, vi } from "vitest";
import type { DesktopUpdateState } from "../../shared/desktopTypes";
import {
  appMenuUpdateDialogDetail,
  appMenuUpdateDialogForError,
  appMenuUpdateDialogForState,
  createAppMenuUpdateService,
  type AppMenuUpdateWindow,
} from "./appMenuUpdateService";

class FakeWindow implements AppMenuUpdateWindow {
  constructor(private readonly destroyed = false) {}

  isDestroyed(): boolean {
    return this.destroyed;
  }
}

function updateState(input: Partial<DesktopUpdateState> & Pick<DesktopUpdateState, "status">): DesktopUpdateState {
  const { status, ...rest } = input;
  return {
    enabled: true,
    status,
    currentVersion: "0.1.0",
    channel: "stable",
    canCheck: true,
    canDownload: false,
    canInstall: false,
    ...rest,
  };
}

describe("appMenuUpdateDialogForState", () => {
  it("formats available updates", () => {
    expect(appMenuUpdateDialogForState(updateState({
      status: "available",
      availableVersion: "0.2.0",
    }))).toMatchObject({
      type: "info",
      message: "An Ambient Desktop update is available.",
      detail: [
        "Available version: 0.2.0",
        "Installed version: 0.1.0",
        "Open Ambient Desktop to download and install the update.",
      ].join("\n"),
    });
  });

  it("formats download progress", () => {
    expect(appMenuUpdateDialogForState(updateState({
      status: "downloading",
      availableVersion: "0.2.0",
      progress: { percent: 41.6, transferred: 42, total: 100, bytesPerSecond: 256 },
    }))).toMatchObject({
      type: "info",
      message: "Ambient Desktop is downloading an update.",
      detail: "Version: 0.2.0\nProgress: 42%",
    });
  });

  it("formats downloaded and installing states", () => {
    expect(appMenuUpdateDialogForState(updateState({
      status: "downloaded",
      availableVersion: "0.2.0",
    }))).toMatchObject({
      type: "info",
      message: "An Ambient Desktop update is ready to install.",
      detail: "Version: 0.2.0\nOpen Ambient Desktop to restart and install the update.",
    });

    expect(appMenuUpdateDialogForState(updateState({
      status: "installing",
      availableVersion: "0.2.0",
    }))).toMatchObject({
      type: "info",
      message: "Ambient Desktop will install the update while restarting.",
      detail: "Version: 0.2.0",
    });
  });

  it("formats not-available, checking, disabled, error, and idle states", () => {
    expect(appMenuUpdateDialogForState(updateState({
      status: "not-available",
      lastCheckedAt: "2026-06-19T12:00:00.000Z",
    }))).toMatchObject({
      type: "info",
      message: "Ambient Desktop is up to date.",
      detail: "Installed version: 0.1.0\nChannel: stable\nLast checked: 2026-06-19T12:00:00.000Z",
    });
    expect(appMenuUpdateDialogForState(updateState({ status: "checking" }))).toMatchObject({
      type: "info",
      message: "Ambient Desktop is already checking for updates.",
      detail: "Installed version: 0.1.0\nChannel: stable",
    });
    expect(appMenuUpdateDialogForState(updateState({
      status: "disabled",
      enabled: false,
      disabledReason: "Updates disabled by policy.",
    }))).toMatchObject({
      type: "info",
      message: "Updates are not active.",
      detail: "Updates disabled by policy.",
    });
    expect(appMenuUpdateDialogForState(updateState({
      status: "error",
      error: "Network unavailable.",
    }))).toMatchObject({
      type: "error",
      message: "Could not check for updates.",
      detail: "Network unavailable.",
    });
    expect(appMenuUpdateDialogForState(updateState({ status: "idle" }))).toMatchObject({
      type: "info",
      message: "Ambient Desktop did not start a new update check.",
      detail: "Installed version: 0.1.0\nChannel: stable",
    });
  });

  it("keeps dialog defaults stable", () => {
    expect(appMenuUpdateDialogForState(updateState({ status: "idle" }))).toMatchObject({
      buttons: ["OK"],
      defaultId: 0,
      cancelId: 0,
      title: "Ambient Desktop Updates",
      noLink: true,
    });
  });
});

describe("app menu update helpers", () => {
  it("filters empty detail lines", () => {
    expect(appMenuUpdateDialogDetail(["Installed version: 0.1.0", undefined, "Channel: stable"]))
      .toBe("Installed version: 0.1.0\nChannel: stable");
  });

  it("formats thrown update check errors", () => {
    expect(appMenuUpdateDialogForError(new Error("Feed unreachable"))).toMatchObject({
      type: "error",
      message: "Could not check for updates.",
      detail: "Feed unreachable",
    });
  });
});

describe("createAppMenuUpdateService", () => {
  it("checks manually and shows the result against the active window", async () => {
    const window = new FakeWindow();
    const checkForUpdates = vi.fn(async () => updateState({
      status: "available",
      availableVersion: "0.2.0",
    }));
    const showMessageBox = vi.fn(async () => undefined);
    const service = createAppMenuUpdateService({
      checkForUpdates,
      getWindow: () => window,
      showMessageBox,
    });

    await service.checkForUpdatesFromAppMenu();

    expect(checkForUpdates).toHaveBeenCalledOnce();
    expect(showMessageBox).toHaveBeenCalledWith(window, expect.objectContaining({
      message: "An Ambient Desktop update is available.",
    }));
  });

  it("uses an app-level dialog when the main window is destroyed", async () => {
    const checkForUpdates = vi.fn(async () => updateState({ status: "not-available" }));
    const showMessageBox = vi.fn(async () => undefined);
    const service = createAppMenuUpdateService({
      checkForUpdates,
      getWindow: () => new FakeWindow(true),
      showMessageBox,
    });

    await service.checkForUpdatesFromAppMenu();

    expect(showMessageBox).toHaveBeenCalledWith(undefined, expect.objectContaining({
      message: "Ambient Desktop is up to date.",
    }));
  });

  it("shows update check errors", async () => {
    const showMessageBox = vi.fn(async () => undefined);
    const service = createAppMenuUpdateService({
      checkForUpdates: vi.fn(async () => {
        throw new Error("Feed unreachable");
      }),
      getWindow: () => undefined,
      showMessageBox,
    });

    await service.checkForUpdatesFromAppMenu();

    expect(showMessageBox).toHaveBeenCalledWith(undefined, expect.objectContaining({
      type: "error",
      message: "Could not check for updates.",
      detail: "Feed unreachable",
    }));
  });
});
