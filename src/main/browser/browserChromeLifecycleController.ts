import type { ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import { relative } from "node:path";

import type {
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserSessionLifecycleEvent,
  BrowserTabSnapshot,
  BrowserUserActionState,
} from "../../shared/browserTypes";
import { browserSessionLifecycleEvent, type BrowserChromeSessionStore } from "./browserChromeSessionStore";
import { BrowserChromeTargetController, fetchJson, JsonRpcWebSocketClient, type ChromeVersionInfo } from "./browserChromeTargetController";

export interface BrowserChromeLifecycleState {
  getChild: () => ChildProcess | undefined;
  setChild: (child: ChildProcess | undefined) => void;
  getPort: () => number | undefined;
  setPort: (port: number | undefined) => void;
  getBrowserWsUrl: () => string | undefined;
  setBrowserWsUrl: (url: string | undefined) => void;
  getActiveTargetId: () => string | undefined;
  setActiveTargetId: (targetId: string | undefined) => void;
  getSessionId: () => string | undefined;
  setSessionId: (sessionId: string | undefined) => void;
  getProcessId: () => number | undefined;
  setProcessId: (processId: number | undefined) => void;
  getAttachedChrome: () => boolean;
  setAttachedChrome: (attached: boolean) => void;
  getProfileMode: () => BrowserProfileMode;
  setProfileMode: (profileMode: BrowserProfileMode) => void;
  getRuntimeProfilePath: () => string | undefined;
  setRuntimeProfilePath: (path: string | undefined) => void;
  getRuntimeProfileEphemeral: () => boolean;
  setRuntimeProfileEphemeral: (ephemeral: boolean) => void;
  setLastActiveTab: (tab: BrowserTabSnapshot | undefined) => void;
  setLastChromeBrowserActionTarget: (tab: BrowserTabSnapshot | undefined) => void;
  setLastActivity: (message: string) => void;
  setLastError: (message: string | undefined) => void;
  setLastSessionEvent: (event: BrowserSessionLifecycleEvent | undefined) => void;
  setActiveRuntime: (runtime: BrowserRuntimeKind) => void;
}

export interface BrowserChromeLifecycleControllerOptions {
  chromeSessions: BrowserChromeSessionStore;
  chromeTargets: BrowserChromeTargetController;
  state: BrowserChromeLifecycleState;
  getUserAction: () => BrowserUserActionState | undefined;
  notifyStateChanged: () => void;
}

export class BrowserChromeLifecycleController {
  constructor(private readonly options: BrowserChromeLifecycleControllerOptions) {}

  async preserveChromeSession(reason: string): Promise<void> {
    if (!this.isChromeRunning()) return;
    this.options.state.setLastSessionEvent(
      browserSessionLifecycleEvent("preserved", reason, this.options.state.getProfileMode(), this.options.state.getSessionId()),
    );
    this.options.state.getChild()?.unref?.();
    this.options.state.setChild(undefined);
    this.options.state.setAttachedChrome(true);
    this.options.state.setLastActivity(reason);
    this.options.notifyStateChanged();
    await this.writeChromeSessionManifest().catch(() => undefined);
  }

  shouldPreserveChromeForRuntimeSwitch(): boolean {
    const userAction = this.options.getUserAction();
    return Boolean(userAction?.active && userAction.runtime === "chrome" && userAction.profileMode === this.options.state.getProfileMode());
  }

  async closeOrPreserveChromeForRuntimeSwitch(reason: string): Promise<void> {
    if (this.shouldPreserveChromeForRuntimeSwitch()) {
      await this.preserveChromeSession(`${reason} Previous managed Chrome session preserved because a browser user action is still active.`);
      return;
    }
    await this.stopChrome(`${reason} Previous managed Chrome session closed.`);
  }

  async stopChrome(reason = "Managed Chrome was closed."): Promise<void> {
    const child = this.options.state.getChild();
    const closeBrowserWsUrl = this.options.state.getBrowserWsUrl();
    const closedProfileMode = this.options.state.getProfileMode();
    const closedSessionId = this.options.state.getSessionId();
    this.options.state.setChild(undefined);
    this.options.state.setPort(undefined);
    this.options.state.setBrowserWsUrl(undefined);
    this.options.state.setActiveTargetId(undefined);
    this.options.state.setSessionId(undefined);
    this.options.state.setProcessId(undefined);
    this.options.state.setAttachedChrome(false);
    this.options.state.setLastActiveTab(undefined);
    this.options.state.setLastChromeBrowserActionTarget(undefined);
    this.options.state.setLastActivity(reason);
    this.options.state.setLastSessionEvent(browserSessionLifecycleEvent("closed", reason, closedProfileMode, closedSessionId));
    if (closeBrowserWsUrl) {
      await JsonRpcWebSocketClient.connect(closeBrowserWsUrl)
        .then(async (client) => {
          try {
            await client.request("Browser.close", {}, 2_000);
          } finally {
            client.close();
          }
        })
        .catch(() => undefined);
    }
    if (child && !childProcessExited(child)) {
      child.kill();
      const exitedAfterTerminate = await waitForChildProcessExit(child, 2_500);
      if (!exitedAfterTerminate && !childProcessExited(child)) {
        child.kill("SIGKILL");
        await waitForChildProcessExit(child, 2_500);
      }
    }
    await this.options.chromeSessions.clear(this.options.state.getProfileMode()).catch(() => undefined);
    const runtimeProfilePath = this.options.state.getRuntimeProfilePath();
    if (runtimeProfilePath) {
      if (this.options.state.getRuntimeProfileEphemeral()) await rm(runtimeProfilePath, { recursive: true, force: true }).catch(() => undefined);
      this.options.state.setRuntimeProfilePath(undefined);
    }
    this.options.state.setRuntimeProfileEphemeral(false);
  }

  async refreshChromeRunningState(): Promise<void> {
    const child = this.options.state.getChild();
    if (child) {
      if (child.exitCode === null && child.signalCode === null) return;
      await this.stopChrome("Managed Chrome exited.");
      return;
    }
    if (!this.options.state.getAttachedChrome() || !this.options.state.getPort()) return;
    await fetchJson<ChromeVersionInfo>(this.options.chromeTargets.browserUrl("/json/version")).catch(async () => {
      this.options.state.setPort(undefined);
      this.options.state.setBrowserWsUrl(undefined);
      this.options.state.setActiveTargetId(undefined);
      this.options.state.setSessionId(undefined);
      this.options.state.setProcessId(undefined);
      this.options.state.setAttachedChrome(false);
      this.options.state.setLastActiveTab(undefined);
      this.options.state.setRuntimeProfilePath(undefined);
      this.options.state.setLastSessionEvent(
        browserSessionLifecycleEvent(
          "closed",
          "Previously preserved managed Chrome session is no longer reachable.",
          this.options.state.getProfileMode(),
          this.options.state.getSessionId(),
        ),
      );
      await this.options.chromeSessions.clear(this.options.state.getProfileMode()).catch(() => undefined);
    });
  }

  isChromeRunning(): boolean {
    const child = this.options.state.getChild();
    return Boolean(
      this.options.state.getPort() &&
        ((child && child.exitCode === null && child.signalCode === null) || this.options.state.getAttachedChrome()),
    );
  }

  async reattachChrome(profileMode: BrowserProfileMode): Promise<boolean> {
    const manifest = await this.options.chromeSessions.read(profileMode);
    if (!manifest) return false;
    if (!isSubpath(this.options.chromeSessions.paths().root, manifest.profilePath)) {
      await this.options.chromeSessions.clear(profileMode).catch(() => undefined);
      return false;
    }
    if (manifest.processId && !isProcessAlive(manifest.processId)) {
      await this.options.chromeSessions.clear(profileMode).catch(() => undefined);
      return false;
    }
    this.options.state.setPort(manifest.devToolsPort);
    this.options.state.setBrowserWsUrl(manifest.browserWsUrl);
    try {
      const version = await fetchJson<ChromeVersionInfo>(this.options.chromeTargets.browserUrl("/json/version"));
      this.options.state.setBrowserWsUrl(version.webSocketDebuggerUrl ?? this.options.state.getBrowserWsUrl());
      this.options.state.setProfileMode(manifest.profileMode);
      this.options.state.setRuntimeProfilePath(manifest.profilePath);
      this.options.state.setRuntimeProfileEphemeral(manifest.profileEphemeral);
      this.options.state.setActiveTargetId(manifest.activeTargetId);
      this.options.state.setSessionId(manifest.id);
      this.options.state.setProcessId(manifest.processId);
      this.options.state.setAttachedChrome(true);
      this.options.state.setActiveRuntime("chrome");
      await this.options.chromeTargets.ensureActiveTarget();
      await this.writeChromeSessionManifest();
      this.options.state.setLastActivity(`Reattached to existing ${profileMode} browser session.`);
      this.options.state.setLastSessionEvent(
        browserSessionLifecycleEvent(
          "reattached",
          "Reattached to preserved managed Chrome session.",
          this.options.state.getProfileMode(),
          this.options.state.getSessionId(),
        ),
      );
      this.options.state.setLastError(undefined);
      return true;
    } catch {
      this.options.state.setPort(undefined);
      this.options.state.setBrowserWsUrl(undefined);
      this.options.state.setRuntimeProfilePath(undefined);
      this.options.state.setSessionId(undefined);
      this.options.state.setProcessId(undefined);
      this.options.state.setAttachedChrome(false);
      await this.options.chromeSessions.clear(profileMode).catch(() => undefined);
      return false;
    }
  }

  async writeChromeSessionManifest(): Promise<void> {
    const port = this.options.state.getPort();
    const browserWsUrl = this.options.state.getBrowserWsUrl();
    const runtimeProfilePath = this.options.state.getRuntimeProfilePath();
    const sessionId = this.options.state.getSessionId();
    if (!port || !browserWsUrl || !runtimeProfilePath || !sessionId) return;
    await this.options.chromeSessions.write({
      sessionId,
      profileMode: this.options.state.getProfileMode(),
      profilePath: runtimeProfilePath,
      profileEphemeral: this.options.state.getRuntimeProfileEphemeral(),
      processId: this.options.state.getChild()?.pid ?? this.options.state.getProcessId(),
      devToolsPort: port,
      browserWsUrl,
      activeTargetId: this.options.state.getActiveTargetId(),
    });
  }
}

function childProcessExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForChildProcessExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (childProcessExited(child)) return Promise.resolve(true);
  if (typeof child.once !== "function") return Promise.resolve(true);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => done(false), timeoutMs);
    const handleExit = () => done(true);
    function done(exited = true) {
      clearTimeout(timeout);
      child.off("exit", handleExit);
      child.off("close", handleExit);
      resolve(exited || childProcessExited(child));
    }
    child.once("exit", handleExit);
    child.once("close", handleExit);
  });
}

function isSubpath(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return Boolean(relativePath && !relativePath.startsWith("..") && !relativePath.startsWith("/") && !relativePath.startsWith("\\"));
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
