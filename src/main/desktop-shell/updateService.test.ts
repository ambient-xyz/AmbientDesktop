import { EventEmitter } from "node:events";
import type { UpdateCheckResult } from "electron-updater";
import { describe, expect, it, vi } from "vitest";
import { DesktopUpdateService, desktopUpdateConfigFromEnv, type DesktopUpdaterClient } from "./updateService";

class FakeUpdater extends EventEmitter implements DesktopUpdaterClient {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowPrerelease = false;
  logger = null;
  feedUrl?: string;
  quitAndInstallMock = vi.fn();
  checkResult: Awaited<ReturnType<DesktopUpdaterClient["checkForUpdates"]>> = null;
  checkResults: Awaited<ReturnType<DesktopUpdaterClient["checkForUpdates"]>>[] = [];
  checkCalls = 0;
  downloadCalls = 0;
  downloadedVersions: string[] = [];
  downloadResult: string[] = [];
  private latestUpdateInfo?: UpdateCheckResult["updateInfo"];

  setFeedURL(options: { provider: "generic"; url: string }): void {
    this.feedUrl = options.url;
  }

  async checkForUpdates() {
    this.checkCalls += 1;
    const result = this.checkResults.length > 0 ? this.checkResults.shift()! : this.checkResult;
    this.emit("checking-for-update");
    if (result?.isUpdateAvailable) {
      this.latestUpdateInfo = result.updateInfo;
      this.emit("update-available", result.updateInfo);
    } else {
      this.latestUpdateInfo = undefined;
      this.emit("update-not-available", result?.updateInfo ?? { version: "0.1.0" });
    }
    return result;
  }

  async downloadUpdate(): Promise<string[]> {
    this.downloadCalls += 1;
    const version = this.latestUpdateInfo?.version ?? "0.2.0";
    this.downloadedVersions.push(version);
    this.emit("download-progress", { percent: 42, transferred: 42, total: 100, bytesPerSecond: 256 });
    this.emit("update-downloaded", { version, downloadedFile: "/tmp/Ambient.dmg" });
    return this.downloadResult;
  }

  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void {
    this.quitAndInstallMock(isSilent, isForceRunAfter);
  }
}

function updateResult(version: string): UpdateCheckResult {
  return {
    isUpdateAvailable: true,
    updateInfo: {
      version,
      files: [],
      path: `Ambient Desktop-${version}-mac-arm64.zip`,
      sha512: "test",
      releaseName: `Ambient ${version}`,
      releaseDate: "2026-04-30T00:00:00.000Z",
      releaseNotes: "Updater smoke",
    },
    versionInfo: {
      version,
      files: [],
      path: `Ambient Desktop-${version}-mac-arm64.zip`,
      sha512: "test",
      releaseDate: "2026-04-30T00:00:00.000Z",
    },
  };
}

describe("desktopUpdateConfigFromEnv", () => {
  it("disables updates for development builds", () => {
    const config = desktopUpdateConfigFromEnv({
      currentVersion: "0.1.0",
      isPackaged: false,
      releaseChannel: "release",
      env: {},
    });

    expect(config.enabled).toBe(false);
    expect(config.channel).toBe("stable");
    expect(config.feedUrl).toBe("https://updates.ambient.xyz/desktop/stable");
    expect(config.disabledReason).toContain("development");
  });

  it("maps packaged beta releases to the production beta feed", () => {
    const config = desktopUpdateConfigFromEnv({
      currentVersion: "0.1.0",
      isPackaged: true,
      releaseChannel: "beta",
      env: { AMBIENT_DESKTOP_UPDATE_BASE_URL: "https://updates.example.test/desktop/" },
    });

    expect(config.enabled).toBe(true);
    expect(config.channel).toBe("beta");
    expect(config.feedUrl).toBe("https://updates.ambient.xyz/desktop/beta");
  });

  it("checks for updates every half hour by default", () => {
    const config = desktopUpdateConfigFromEnv({
      currentVersion: "0.1.0",
      isPackaged: true,
      releaseChannel: "release",
      env: {},
    });

    expect(config.startupDelayMs).toBe(10_000);
    expect(config.checkIntervalMs).toBe(30 * 60 * 1000);
  });

  it("ignores arbitrary update feed overrides in packaged production builds", () => {
    const config = desktopUpdateConfigFromEnv({
      currentVersion: "0.1.0",
      isPackaged: true,
      appPath: "/Applications/Ambient Desktop.app/Contents/MacOS/Ambient Desktop",
      platform: "darwin",
      releaseChannel: "release",
      env: {
        AMBIENT_DESKTOP_UPDATE_BASE_URL: "https://updates.example.test/desktop/",
        AMBIENT_DESKTOP_UPDATE_URL: "https://attacker.example.test/ambient/stable",
      },
    });

    expect(config.enabled).toBe(true);
    expect(config.channel).toBe("stable");
    expect(config.feedUrl).toBe("https://updates.ambient.xyz/desktop/stable");
  });

  it("enables packaged macOS updates from Applications install paths", () => {
    const globalInstall = desktopUpdateConfigFromEnv({
      currentVersion: "0.1.0",
      isPackaged: true,
      appPath: "/Applications/Ambient Desktop.app/Contents/MacOS/Ambient Desktop",
      platform: "darwin",
      releaseChannel: "release",
      env: {},
    });
    const userInstall = desktopUpdateConfigFromEnv({
      currentVersion: "0.1.0",
      isPackaged: true,
      appPath: "/Users/neo/Applications/Ambient Desktop.app/Contents/MacOS/Ambient Desktop",
      platform: "darwin",
      releaseChannel: "release",
      env: {},
    });

    expect(globalInstall.enabled).toBe(true);
    expect(userInstall.enabled).toBe(true);
  });

  it("disables packaged macOS updates from disposable release artifact paths", () => {
    const config = desktopUpdateConfigFromEnv({
      currentVersion: "0.1.0",
      isPackaged: true,
      appPath: "/Users/example/Documents/ambientCoder-release-0.1.79-latest/release/mac-arm64/Ambient Desktop.app/Contents/MacOS/Ambient Desktop",
      platform: "darwin",
      releaseChannel: "release",
      env: {},
    });

    expect(config.enabled).toBe(false);
    expect(config.disabledReason).toContain("/Applications");
  });

  it("does not apply the macOS install-location guard to other platforms", () => {
    const config = desktopUpdateConfigFromEnv({
      currentVersion: "0.1.0",
      isPackaged: true,
      appPath: "C:\\Users\\Neo\\Downloads\\Ambient Desktop\\Ambient Desktop.exe",
      platform: "win32",
      releaseChannel: "release",
      env: {},
    });

    expect(config.enabled).toBe(true);
  });

  it("allows update feed overrides only when updates are already disabled for development", () => {
    const config = desktopUpdateConfigFromEnv({
      currentVersion: "0.1.0",
      isPackaged: false,
      releaseChannel: "dev",
      env: { AMBIENT_DESKTOP_UPDATE_URL: "https://updates.example.test/desktop/dev" },
    });

    expect(config.enabled).toBe(false);
    expect(config.channel).toBe("dev");
    expect(config.feedUrl).toBe("https://updates.example.test/desktop/dev");
  });

  it("falls back unknown release channels to stable", () => {
    const config = desktopUpdateConfigFromEnv({
      currentVersion: "0.1.0",
      isPackaged: true,
      releaseChannel: "nightly",
      env: {},
    });

    expect(config.channel).toBe("stable");
    expect(config.feedUrl).toBe("https://updates.ambient.xyz/desktop/stable");
  });
});

describe("DesktopUpdateService", () => {
  it("checks, downloads, and installs through the updater client", async () => {
    const updater = new FakeUpdater();
    updater.checkResult = updateResult("0.2.0");
    const emitted: string[] = [];
    const service = new DesktopUpdateService(
      updater,
      {
        enabled: true,
        currentVersion: "0.1.0",
        channel: "stable",
        feedUrl: "https://updates.example.test/desktop/stable",
        startupDelayMs: 0,
        checkIntervalMs: 60_000,
        now: () => new Date("2026-04-30T00:00:00.000Z"),
      },
      (state) => emitted.push(state.status),
    );

    service.start();
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.feedUrl).toBe("https://updates.example.test/desktop/stable");

    const available = await service.checkForUpdates("manual");
    expect(available.status).toBe("available");
    expect(available.availableVersion).toBe("0.2.0");
    expect(available.canDownload).toBe(true);

    const downloaded = await service.downloadUpdate();
    expect(downloaded.status).toBe("downloaded");
    expect(downloaded.canInstall).toBe(true);

    const installing = service.installUpdateAndRestart();
    expect(installing.status).toBe("installing");
    expect(updater.quitAndInstallMock).toHaveBeenCalledWith(false, true);
    expect(emitted).toContain("available");
    service.dispose();
  });

  it("refreshes the update candidate immediately before downloading", async () => {
    const updater = new FakeUpdater();
    updater.checkResults = [updateResult("0.2.0"), updateResult("0.3.0")];
    const service = new DesktopUpdateService(updater, {
      enabled: true,
      currentVersion: "0.1.0",
      channel: "stable",
      feedUrl: "https://updates.example.test/desktop/stable",
      startupDelayMs: 0,
      checkIntervalMs: 60_000,
      now: () => new Date("2026-04-30T00:00:00.000Z"),
    });

    service.start();
    const available = await service.checkForUpdates("manual");
    expect(available.status).toBe("available");
    expect(available.availableVersion).toBe("0.2.0");

    const downloaded = await service.downloadUpdate();
    expect(updater.checkCalls).toBe(2);
    expect(updater.downloadCalls).toBe(1);
    expect(updater.downloadedVersions).toEqual(["0.3.0"]);
    expect(downloaded.status).toBe("downloaded");
    expect(downloaded.availableVersion).toBe("0.3.0");
    service.dispose();
  });
});
