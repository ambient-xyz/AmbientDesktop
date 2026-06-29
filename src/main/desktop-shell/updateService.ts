import type { ProgressInfo, UpdateCheckResult, UpdateDownloadedEvent, UpdateInfo } from "electron-updater";
import { normalize, sep } from "node:path";
import type { DesktopUpdateCheckReason, DesktopUpdateState } from "../../shared/desktopTypes";

type UpdaterEvent =
  | "checking-for-update"
  | "update-not-available"
  | "update-available"
  | "download-progress"
  | "update-downloaded"
  | "error";

export interface DesktopUpdaterClient {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  logger: { info(message?: unknown): void; warn(message?: unknown): void; error(message?: unknown): void } | null;
  setFeedURL(options: { provider: "generic"; url: string }): void;
  checkForUpdates(): Promise<UpdateCheckResult | null>;
  downloadUpdate(): Promise<string[]>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: UpdaterEvent, listener: (...args: unknown[]) => void): this;
}

export interface DesktopUpdateConfig {
  enabled: boolean;
  currentVersion: string;
  channel: string;
  feedUrl?: string;
  disabledReason?: string;
  startupDelayMs: number;
  checkIntervalMs: number;
  now: () => Date;
}

export interface DesktopUpdateRuntimeInput {
  currentVersion: string;
  isPackaged: boolean;
  appPath?: string;
  platform?: NodeJS.Platform;
  releaseChannel?: string;
  env?: NodeJS.ProcessEnv;
}

type Timer = ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>;

const defaultUpdateBaseUrl = "https://updates.ambient.xyz/desktop";
const productionUpdateChannels = new Set(["stable", "beta"]);
const releaseToUpdateChannel: Record<string, string> = {
  release: "stable",
  production: "stable",
  stable: "stable",
  beta: "beta",
  development: "dev",
  dev: "dev",
};

export function desktopUpdateConfigFromEnv(input: DesktopUpdateRuntimeInput): DesktopUpdateConfig {
  const env = input.env ?? process.env;
  const channel = normalizeUpdateChannel(input.releaseChannel ?? env.AMBIENT_RELEASE_CHANNEL);
  const explicitlyDisabled = env.AMBIENT_DESKTOP_UPDATES_DISABLED === "1" || env.AMBIENT_UPDATES_DISABLED === "1";
  const installEligibility = desktopUpdateInstallEligibility({
    appPath: input.appPath,
    platform: input.platform ?? process.platform,
  });
  const feedUrl = desktopUpdateFeedUrl({ channel, env, isPackaged: input.isPackaged });
  const enabled = input.isPackaged && !explicitlyDisabled && channel !== "dev" && installEligibility.ok;
  const disabledReason = !input.isPackaged
    ? "Updates are disabled for development builds."
    : explicitlyDisabled
      ? "Updates are disabled by environment configuration."
      : channel === "dev"
        ? "Updates are disabled on the development channel."
        : !installEligibility.ok
          ? installEligibility.reason
        : undefined;

  return {
    enabled,
    currentVersion: input.currentVersion,
    channel,
    feedUrl,
    disabledReason,
    startupDelayMs: numberFromEnv(env.AMBIENT_DESKTOP_UPDATE_STARTUP_DELAY_MS, 10_000),
    checkIntervalMs: numberFromEnv(env.AMBIENT_DESKTOP_UPDATE_CHECK_INTERVAL_MS, 30 * 60 * 1000),
    now: () => new Date(),
  };
}

export function desktopUpdateInstallEligibility(input: {
  appPath?: string;
  platform: NodeJS.Platform;
}): { ok: boolean; reason?: string } {
  if (input.platform !== "darwin") return { ok: true };
  const bundlePath = macAppBundlePath(input.appPath);
  if (!bundlePath) return { ok: true };
  const normalizedBundlePath = normalize(bundlePath);
  if (isPathInside(normalizedBundlePath, "/Applications") || /^\/Users\/[^/]+\/Applications(?:\/|$)/.test(normalizedBundlePath)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: "Move Ambient Desktop to /Applications or ~/Applications to enable automatic updates.",
  };
}

function macAppBundlePath(appPath: string | undefined): string | undefined {
  if (!appPath) return undefined;
  const marker = ".app";
  const index = appPath.indexOf(marker);
  return index >= 0 ? appPath.slice(0, index + marker.length) : undefined;
}

function isPathInside(candidate: string, parent: string): boolean {
  const normalizedParent = normalize(parent);
  return candidate === normalizedParent || candidate.startsWith(`${normalizedParent}${sep}`);
}

function desktopUpdateFeedUrl(input: { channel: string; env: NodeJS.ProcessEnv; isPackaged: boolean }): string {
  if (isProductionUpdateRuntime(input.isPackaged, input.channel)) {
    return `${defaultUpdateBaseUrl}/${input.channel}`;
  }
  const updateBaseUrl = trimTrailingSlash(input.env.AMBIENT_DESKTOP_UPDATE_BASE_URL || defaultUpdateBaseUrl);
  return trimTrailingSlash(input.env.AMBIENT_DESKTOP_UPDATE_URL || `${updateBaseUrl}/${input.channel}`);
}

export class DesktopUpdateService {
  private state: DesktopUpdateState;
  private started = false;
  private startupTimer?: Timer;
  private intervalTimer?: Timer;
  private checkInFlight?: Promise<DesktopUpdateState>;
  private downloadInFlight?: Promise<DesktopUpdateState>;
  private suppressCheckingEvent = false;
  private readonly emit?: (state: DesktopUpdateState) => void;

  constructor(
    private readonly updater: DesktopUpdaterClient,
    private readonly config: DesktopUpdateConfig,
    emit?: (state: DesktopUpdateState) => void,
  ) {
    this.emit = emit;
    this.state = decorateUpdateState({
      enabled: config.enabled,
      status: config.enabled ? "idle" : "disabled",
      currentVersion: config.currentVersion,
      channel: config.channel,
      feedUrl: config.feedUrl,
      disabledReason: config.disabledReason,
      canCheck: false,
      canDownload: false,
      canInstall: false,
    });
  }

  start(): DesktopUpdateState {
    if (this.started) return this.getState();
    this.started = true;
    if (!this.config.enabled || !this.config.feedUrl) {
      return this.setState({
        enabled: false,
        status: "disabled",
        disabledReason: this.config.disabledReason ?? "Updates are not configured.",
      });
    }

    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.allowPrerelease = this.config.channel !== "stable";
    this.updater.logger = console;
    this.updater.setFeedURL({ provider: "generic", url: this.config.feedUrl });
    this.registerUpdaterEvents();
    if (this.config.startupDelayMs > 0) {
      this.startupTimer = setManagedTimeout(() => void this.checkForUpdates("startup"), this.config.startupDelayMs);
    }
    if (this.config.checkIntervalMs > 0) {
      this.intervalTimer = setManagedInterval(() => void this.checkForUpdates("scheduled"), this.config.checkIntervalMs);
    }
    return this.getState();
  }

  dispose(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.startupTimer = undefined;
    this.intervalTimer = undefined;
  }

  getState(): DesktopUpdateState {
    return { ...this.state, progress: this.state.progress ? { ...this.state.progress } : undefined };
  }

  async checkForUpdates(reason: DesktopUpdateCheckReason = "manual"): Promise<DesktopUpdateState> {
    return this.runUpdateCheck(reason, { setCheckingState: true });
  }

  private async runUpdateCheck(
    reason: DesktopUpdateCheckReason,
    options: { setCheckingState: boolean; failureMessage?: string },
  ): Promise<DesktopUpdateState> {
    if (!this.config.enabled) return this.getState();
    if (this.checkInFlight) return this.checkInFlight;
    if (this.state.status === "downloading" || this.state.status === "installing") return this.getState();

    if (options.setCheckingState) {
      this.setState({ status: "checking", error: undefined, progress: undefined });
    } else {
      this.setState({ error: undefined, progress: undefined });
    }
    const previousSuppressCheckingEvent = this.suppressCheckingEvent;
    this.suppressCheckingEvent = previousSuppressCheckingEvent || !options.setCheckingState;
    this.checkInFlight = this.updater
      .checkForUpdates()
      .then((result) => {
        if (result?.isUpdateAvailable) {
          this.setAvailableState(result.updateInfo);
        } else {
          this.setState({
            status: "not-available",
            availableVersion: optionalString(result?.updateInfo?.version),
            releaseName: undefined,
            releaseDate: undefined,
            releaseNotes: undefined,
            progress: undefined,
            error: undefined,
            dismissedVersion: undefined,
            lastCheckedAt: this.config.now().toISOString(),
          });
        }
        return this.getState();
      })
      .catch((error: unknown) => this.setErrorState(error, options.failureMessage ?? `Update check failed (${reason}).`))
      .finally(() => {
        this.checkInFlight = undefined;
        this.suppressCheckingEvent = previousSuppressCheckingEvent;
      });
    return this.checkInFlight;
  }

  async downloadUpdate(): Promise<DesktopUpdateState> {
    if (!this.config.enabled) return this.getState();
    if (this.downloadInFlight) return this.downloadInFlight;
    if (this.state.status === "downloaded") return this.getState();
    if (this.state.status !== "available" && this.state.status !== "error") return this.getState();

    this.downloadInFlight = this.refreshAndDownloadUpdate().finally(() => {
      this.downloadInFlight = undefined;
    });
    return this.downloadInFlight;
  }

  private async refreshAndDownloadUpdate(): Promise<DesktopUpdateState> {
    const refreshed = await this.runUpdateCheck("manual", {
      setCheckingState: false,
      failureMessage: "Update check before download failed.",
    });
    if (refreshed.status !== "available") return refreshed;

    this.setState({
      status: "downloading",
      error: undefined,
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
    });
    return this.updater
      .downloadUpdate()
      .then(() => {
        if (this.state.status === "downloading") this.setState({ status: "downloaded", progress: undefined });
        return this.getState();
      })
      .catch((error: unknown) => this.setErrorState(error, "Update download failed."));
  }

  installUpdateAndRestart(): DesktopUpdateState {
    if (!this.config.enabled || this.state.status !== "downloaded") return this.getState();
    this.setState({ status: "installing", error: undefined });
    this.updater.quitAndInstall(false, true);
    return this.getState();
  }

  dismissUpdateNotification(): DesktopUpdateState {
    if (this.state.status === "error") {
      return this.setState({ status: "idle", error: undefined, progress: undefined });
    }
    return this.setState({ dismissedVersion: this.state.availableVersion });
  }

  private registerUpdaterEvents(): void {
    this.updater.on("checking-for-update", () => {
      if (this.suppressCheckingEvent) {
        this.setState({ error: undefined });
        return;
      }
      this.setState({ status: "checking", error: undefined });
    });
    this.updater.on("update-not-available", (info) => {
      this.setState({
        status: "not-available",
        lastCheckedAt: this.config.now().toISOString(),
        availableVersion: typeof (info as UpdateInfo).version === "string" ? (info as UpdateInfo).version : undefined,
      });
    });
    this.updater.on("update-available", (info) => this.setAvailableState(info as UpdateInfo));
    this.updater.on("download-progress", (info) => this.setDownloadProgress(info as ProgressInfo));
    this.updater.on("update-downloaded", (event) => {
      const update = event as UpdateDownloadedEvent;
      this.setState({
        status: "downloaded",
        availableVersion: update.version,
        releaseName: optionalString(update.releaseName),
        releaseDate: optionalString(update.releaseDate),
        releaseNotes: releaseNotesToString(update.releaseNotes),
        progress: undefined,
        error: undefined,
      });
    });
    this.updater.on("error", (error) => {
      this.setErrorState(error, "Update failed.");
    });
  }

  private setAvailableState(info: UpdateInfo): DesktopUpdateState {
    return this.setState({
      status: "available",
      availableVersion: info.version,
      releaseName: optionalString(info.releaseName),
      releaseDate: optionalString(info.releaseDate),
      releaseNotes: releaseNotesToString(info.releaseNotes),
      progress: undefined,
      error: undefined,
      lastCheckedAt: this.config.now().toISOString(),
      dismissedVersion: this.state.availableVersion === info.version ? this.state.dismissedVersion : undefined,
    });
  }

  private setDownloadProgress(info: ProgressInfo): DesktopUpdateState {
    return this.setState({
      status: "downloading",
      progress: {
        percent: clampPercent(info.percent),
        transferred: Math.max(0, info.transferred ?? 0),
        total: Math.max(0, info.total ?? 0),
        bytesPerSecond: Math.max(0, info.bytesPerSecond ?? 0),
      },
    });
  }

  private setErrorState(error: unknown, fallback: string): DesktopUpdateState {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
    return this.setState({ status: "error", error: message || fallback, progress: undefined });
  }

  private setState(patch: Partial<DesktopUpdateState>): DesktopUpdateState {
    this.state = decorateUpdateState({ ...this.state, ...patch });
    this.emit?.(this.getState());
    return this.getState();
  }
}

function decorateUpdateState(state: DesktopUpdateState): DesktopUpdateState {
  return {
    ...state,
    canCheck: state.enabled && !["checking", "downloading", "installing"].includes(state.status),
    canDownload: state.enabled && state.status === "available",
    canInstall: state.enabled && state.status === "downloaded",
  };
}

function normalizeUpdateChannel(channel?: string): string {
  const normalized = (channel || "release").trim().toLowerCase();
  return releaseToUpdateChannel[normalized] ?? "stable";
}

function isProductionUpdateRuntime(isPackaged: boolean, channel: string): boolean {
  return isPackaged && productionUpdateChannels.has(channel);
}

function releaseNotesToString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      const version = typeof record.version === "string" ? record.version : "";
      const note = typeof record.note === "string" ? record.note : "";
      return [version, note].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .join("\n\n");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function clampPercent(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value ?? 0));
}

function setManagedTimeout(callback: () => void, delayMs: number): Timer {
  const timer = setTimeout(callback, delayMs);
  timer.unref?.();
  return timer;
}

function setManagedInterval(callback: () => void, delayMs: number): Timer {
  const timer = setInterval(callback, delayMs);
  timer.unref?.();
  return timer;
}
