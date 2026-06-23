import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import type {
  BrowserCapabilityState,
  BrowserProfileMode,
  BrowserUserActionState,
} from "../../shared/browserTypes";
import { browserSessionLifecycleEvent, type BrowserChromeSessionStore } from "./browserChromeSessionStore";
import { type BrowserChromeProfileController } from "./browserChromeProfileController";
import { BrowserChromeLifecycleController, type BrowserChromeLifecycleState } from "./browserChromeLifecycleController";
import { BrowserChromeTargetController, fetchJson, type ChromeVersionInfo } from "./browserChromeTargetController";
import { isAboutBlankUrl } from "./browserNavigation";

export interface BrowserChromeStartupAvailability {
  available: boolean;
  executable?: string;
  unavailableReason?: string;
}

export interface BrowserChromeStartupInternalBrowser {
  isRunning(): boolean;
  stop(): Promise<void>;
}

export interface BrowserChromeStartupControllerOptions {
  chromeAvailability: () => BrowserChromeStartupAvailability;
  chromeLifecycle: BrowserChromeLifecycleController;
  chromeProfiles: BrowserChromeProfileController;
  chromeSessions: BrowserChromeSessionStore;
  chromeTargets: BrowserChromeTargetController;
  getInternalBrowser: () => BrowserChromeStartupInternalBrowser | undefined;
  getState: () => Promise<BrowserCapabilityState>;
  getUserAction: () => BrowserUserActionState | undefined;
  instanceId: string;
  state: BrowserChromeLifecycleState;
}

const DEFAULT_PROFILE_MODE: BrowserProfileMode = "isolated";
const START_TIMEOUT_MS = 15_000;
export const MANAGED_CHROME_WIDTH = 1280;
const MANAGED_CHROME_HIDDEN_HEIGHT = 720;

export class BrowserChromeStartupController {
  constructor(private readonly options: BrowserChromeStartupControllerOptions) {}

  async startChrome(profileMode: BrowserProfileMode = DEFAULT_PROFILE_MODE): Promise<BrowserCapabilityState> {
    if (this.options.chromeLifecycle.isChromeRunning() && this.options.state.getProfileMode() === profileMode) {
      return this.options.getState();
    }
    const internalBrowser = this.options.getInternalBrowser();
    if (internalBrowser?.isRunning()) await internalBrowser.stop();
    if (this.options.chromeLifecycle.isChromeRunning()) {
      await this.options.chromeLifecycle.closeOrPreserveChromeForRuntimeSwitch("Switched browser profile.");
    }

    const availability = this.options.chromeAvailability();
    const executable = availability.executable;
    if (!executable) throw new BrowserUnavailableError(availability.unavailableReason ?? defaultChromeUnavailableReason());

    const paths = this.options.chromeSessions.paths();
    mkdirSync(paths.root, { recursive: true });
    mkdirSync(paths.profilesRoot, { recursive: true });
    mkdirSync(paths.sessionsRoot, { recursive: true });
    mkdirSync(paths.sessionManifests, { recursive: true });
    mkdirSync(paths.screenshots, { recursive: true });
    if (profileMode === "copied") await this.options.chromeProfiles.ensureCopiedProfileAvailable();

    const persistentProfilePath = profileMode === "isolated" ? paths.isolatedProfile : undefined;
    const runtimeProfilePath = persistentProfilePath ?? join(paths.sessionsRoot, `${profileMode}-${this.options.instanceId}`);
    const runtimeProfileEphemeral = !persistentProfilePath;
    if (runtimeProfileEphemeral) await rm(runtimeProfilePath, { recursive: true, force: true });
    mkdirSync(runtimeProfilePath, { recursive: true });
    if (profileMode === "copied") await this.options.chromeProfiles.copyCopiedProfileToRuntime(runtimeProfilePath);

    const child = spawn(executable, managedChromeLaunchArgs(runtimeProfilePath), {
      detached: false,
      stdio: "ignore",
      windowsHide: true,
    });
    let launchError: Error | undefined;
    child.once("error", (error) => {
      launchError = error;
    });

    this.options.state.setChild(child);
    this.options.state.setPort(undefined);
    this.options.state.setProfileMode(profileMode);
    this.options.state.setRuntimeProfilePath(runtimeProfilePath);
    this.options.state.setRuntimeProfileEphemeral(runtimeProfileEphemeral);
    this.options.state.setAttachedChrome(false);
    this.options.state.setSessionId(randomUUID());
    this.options.state.setProcessId(child.pid);
    this.options.state.setLastChromeBrowserActionTarget(undefined);
    this.options.state.setActiveRuntime("chrome");
    this.options.state.setLastActivity(`Started ${profileMode} browser profile${runtimeProfileEphemeral ? "" : " with persistent Ambient state"}.`);
    this.options.state.setLastSessionEvent(
      browserSessionLifecycleEvent(
        "started",
        "Started managed Chrome for Ambient browser tooling.",
        this.options.state.getProfileMode(),
        this.options.state.getSessionId(),
      ),
    );
    this.options.state.setLastError(undefined);

    child.once("exit", () => {
      if (this.options.state.getChild() === child) {
        this.options.state.setChild(undefined);
        this.options.state.setPort(undefined);
        this.options.state.setBrowserWsUrl(undefined);
        this.options.state.setActiveTargetId(undefined);
        this.options.state.setProcessId(undefined);
        this.options.state.setLastChromeBrowserActionTarget(undefined);
      }
    });

    try {
      const version = await this.waitForLaunchedChromeVersion(runtimeProfilePath, child, () => launchError);
      this.options.state.setBrowserWsUrl(version.webSocketDebuggerUrl ?? this.options.state.getBrowserWsUrl());
      await this.options.chromeTargets.ensureActiveTarget();
      await this.options.chromeTargets.setActiveWindowState("minimized").catch(() => undefined);
      await this.options.chromeLifecycle.writeChromeSessionManifest();
      return this.options.getState();
    } catch (error) {
      this.options.state.setLastError(errorMessage(error));
      await this.options.chromeLifecycle.stopChrome("Managed Chrome failed to start cleanly.").catch(() => undefined);
      throw error;
    }
  }

  async ensureChromeStarted(profileMode: BrowserProfileMode = DEFAULT_PROFILE_MODE): Promise<void> {
    const userAction = this.options.getUserAction();
    profileMode = userAction?.active && userAction.runtime === "chrome" ? userAction.profileMode : profileMode;
    const internalBrowser = this.options.getInternalBrowser();
    if (internalBrowser?.isRunning()) await internalBrowser.stop();
    this.options.state.setActiveRuntime("chrome");
    if (this.options.chromeLifecycle.isChromeRunning() && this.options.state.getProfileMode() === profileMode) return;
    if (this.options.chromeLifecycle.isChromeRunning()) {
      await this.options.chromeLifecycle.closeOrPreserveChromeForRuntimeSwitch("Switched browser profile.");
    }
    if (await this.options.chromeLifecycle.reattachChrome(profileMode)) return;
    await this.startChrome(profileMode);
  }

  async waitForVersion(): Promise<ChromeVersionInfo> {
    const startedAt = Date.now();
    let lastError = "";
    while (Date.now() - startedAt < START_TIMEOUT_MS) {
      try {
        const version = await fetchJson<ChromeVersionInfo>(this.options.chromeTargets.browserUrl("/json/version"));
        if (version.webSocketDebuggerUrl) return version;
      } catch (error) {
        lastError = errorMessage(error);
      }
      await delay(250);
    }
    throw new Error(`Timed out waiting for Chrome remote debugging. ${lastError}`.trim());
  }

  async waitForLaunchedChromeVersion(
    profilePath: string,
    child: ChildProcess,
    launchError: () => Error | undefined = () => undefined,
  ): Promise<ChromeVersionInfo> {
    const activePortPath = join(profilePath, "DevToolsActivePort");
    const startedAt = Date.now();
    let lastError = "";
    while (Date.now() - startedAt < START_TIMEOUT_MS) {
      const spawnError = launchError();
      if (spawnError) throw new BrowserUnavailableError(chromeLaunchErrorMessage(spawnError));
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new BrowserUnavailableError(`Chrome exited before remote debugging became available. ${lastError}`.trim());
      }
      try {
        const endpoint = readChromeDevToolsEndpoint(activePortPath);
        if (endpoint) {
          this.options.state.setPort(endpoint.port);
          this.options.state.setBrowserWsUrl(endpoint.webSocketDebuggerUrl);
          const version = await fetchJson<ChromeVersionInfo>(this.options.chromeTargets.browserUrl("/json/version"));
          return {
            ...version,
            webSocketDebuggerUrl: version.webSocketDebuggerUrl ?? endpoint.webSocketDebuggerUrl,
          };
        }
      } catch (error) {
        lastError = errorMessage(error);
      }
      await delay(100);
    }
    throw new BrowserUnavailableError(`Timed out waiting for Chrome remote debugging endpoint. ${lastError}`.trim());
  }

  async closeActiveAboutBlankTarget(): Promise<boolean> {
    const targetId = this.options.state.getActiveTargetId();
    if (!targetId) return false;
    const target = (await this.options.chromeTargets.targets().catch(() => [])).find((candidate) => candidate.id === targetId);
    if (!target || !isAboutBlankUrl(target.url ?? "")) return false;
    const client = await this.options.chromeTargets.connectBrowser();
    try {
      await client.request("Target.closeTarget", { targetId }, 2_000);
    } finally {
      client.close();
    }
    if (this.options.state.getActiveTargetId() === targetId) {
      this.options.state.setActiveTargetId(undefined);
      this.options.state.setLastActiveTab(undefined);
      await this.options.chromeLifecycle.writeChromeSessionManifest().catch(() => undefined);
    }
    return true;
  }
}

export class BrowserUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserUnavailableError";
  }
}

export function managedChromeLaunchArgs(runtimeProfilePath: string): string[] {
  return [
    "--remote-debugging-port=0",
    `--user-data-dir=${runtimeProfilePath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-default-apps",
    "--start-minimized",
    `--window-size=${MANAGED_CHROME_WIDTH},${MANAGED_CHROME_HIDDEN_HEIGHT}`,
    "about:blank",
  ];
}

export function parseChromeDevToolsEndpoint(raw: string): { port: number; webSocketDebuggerUrl: string } | undefined {
  const [portLine, pathLine] = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const port = Number(portLine);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) return undefined;
  const browserPath = pathLine?.startsWith("/") ? pathLine : undefined;
  if (!browserPath) return undefined;
  return {
    port,
    webSocketDebuggerUrl: `ws://127.0.0.1:${port}${browserPath}`,
  };
}

function readChromeDevToolsEndpoint(path: string): { port: number; webSocketDebuggerUrl: string } | undefined {
  if (!existsSync(path)) return undefined;
  return parseChromeDevToolsEndpoint(readFileSync(path, "utf8"));
}

function defaultChromeUnavailableReason(): string {
  return "Google Chrome or Chromium was not found. Install Chrome/Chromium or set AMBIENT_BROWSER_CHROME_PATH to a Chrome executable.";
}

function chromeLaunchErrorMessage(error: Error): string {
  return `Chrome failed to launch: ${error.message}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
