import { spawn } from "node:child_process";
import { basename } from "node:path";

import type {
  BrowserCapabilityState,
  BrowserProfileMode,
  BrowserRevealInput,
  BrowserRevealResult,
  BrowserRuntimeKind,
  BrowserTabSnapshot,
  BrowserUserActionState,
} from "../../shared/browserTypes";
import { MANAGED_CHROME_WIDTH } from "./browserChromeStartupController";

export interface ManagedChromeWindowBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ManagedChromeWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManagedChromeRevealInput {
  platform: NodeJS.Platform;
  profileMode: BrowserProfileMode;
  targetId?: string;
  processId?: number;
  executable?: string;
  profilePath?: string;
}

export interface ManagedChromeRevealResult {
  cdpActivated: boolean;
  foregroundAttempted: boolean;
  foregroundSucceeded: boolean;
  activeTab?: BrowserTabSnapshot;
  method?: string;
  reason?: string;
  unsupported?: boolean;
}

const MANAGED_CHROME_REVEALED_HEIGHT = 900;
const MANAGED_CHROME_REVEAL_MARGIN = 40;
const MANAGED_CHROME_MIN_WIDTH = 720;
const MANAGED_CHROME_MIN_HEIGHT = 520;

export interface BrowserChromeRevealControllerOptions {
  refreshChromeRunningState: () => Promise<void>;
  getActiveRuntime: () => BrowserRuntimeKind;
  setActiveRuntime: (runtime: BrowserRuntimeKind) => void;
  isInternalBrowserRunning: () => boolean;
  internalStateSnapshot: () => Promise<BrowserCapabilityState>;
  getCurrentUserAction: () => BrowserUserActionState | undefined;
  getProfileMode: () => BrowserProfileMode;
  getChromeProcessId: () => number | undefined;
  getChildProcessId: () => number | undefined;
  getRuntimeProfilePath: () => string | undefined;
  isChromeRunning: () => boolean;
  reattachChrome: (profileMode: BrowserProfileMode) => Promise<boolean>;
  chromeAvailability: () => { executable?: string };
  revealManagedChromeWindow: (input: ManagedChromeRevealInput) => Promise<ManagedChromeRevealResult>;
  setLastActiveTab: (tab: BrowserTabSnapshot) => void;
  setLastActivity: (message: string) => void;
  setLastError: (message: string | undefined) => void;
  notifyStateChanged: () => void;
}

export class BrowserChromeRevealController {
  constructor(private readonly options: BrowserChromeRevealControllerOptions) {}

  async revealActiveBrowser(input: BrowserRevealInput = {}): Promise<BrowserRevealResult> {
    await this.options.refreshChromeRunningState();
    if (this.options.getActiveRuntime() === "internal" || this.options.isInternalBrowserRunning()) {
      const state = await this.options.internalStateSnapshot();
      this.options.setLastActivity(state.running ? "Showing internal browser panel." : "No internal browser session is running.");
      return {
        runtime: "internal",
        target: "internal",
        status: state.running ? "needs-internal-panel" : "not-running",
        message: state.running ? "The browser is in Ambient's inline Browser panel." : "No inline browser session is running.",
        ...(state.activeTab ? { activeTab: state.activeTab } : {}),
      };
    }

    const revealUserAction = this.currentChromeUserAction(input);
    const profileMode = revealUserAction?.profileMode ?? this.options.getProfileMode();
    const targetId = input.targetId ?? revealUserAction?.targetId;
    if (!this.options.isChromeRunning()) await this.options.reattachChrome(profileMode).catch(() => false);
    if (!this.options.isChromeRunning()) {
      this.options.setLastActivity("Managed Chrome is not running.");
      return {
        runtime: "chrome",
        target: "managed-chrome",
        status: "not-running",
        message: "Managed Chrome is not running, so there is no external browser window to show.",
      };
    }

    this.options.setActiveRuntime("chrome");
    const availability = this.options.chromeAvailability();
    const reveal = await this.options
      .revealManagedChromeWindow({
        platform: process.platform,
        profileMode,
        targetId,
        processId: this.options.getChromeProcessId() ?? this.options.getChildProcessId(),
        executable: availability.executable,
        profilePath: this.options.getRuntimeProfilePath(),
      })
      .catch(
        (error): ManagedChromeRevealResult => ({
          cdpActivated: false,
          foregroundAttempted: true,
          foregroundSucceeded: false,
          reason: error instanceof Error ? error.message : String(error),
        }),
      );

    if (reveal.activeTab) this.options.setLastActiveTab(reveal.activeTab);
    const fullyRevealed = reveal.cdpActivated && reveal.foregroundSucceeded;
    const status = fullyRevealed ? "revealed" : reveal.unsupported ? "unsupported" : "failed";
    const fallbackReason = reveal.reason;
    this.options.setLastActivity(
      fullyRevealed
        ? "Managed Chrome was brought forward."
        : `Tried to show managed Chrome. ${fallbackReason ?? "The operating system did not foreground it."}`.trim(),
    );
    this.options.setLastError(fullyRevealed ? undefined : fallbackReason);
    this.options.notifyStateChanged();

    return {
      runtime: "chrome",
      target: "managed-chrome",
      status,
      message: fullyRevealed
        ? "Managed Chrome was brought forward with the active browser tab selected."
        : reveal.cdpActivated
          ? `Ambient activated the managed Chrome tab, but could not bring Chrome to the foreground. ${fallbackReason ?? "The operating system may have blocked the focus request."}`.trim()
          : `Ambient tried to show managed Chrome, but could not confirm the active browser tab was selected. ${fallbackReason ?? "Chrome may still be hidden behind another window."}`.trim(),
      ...(reveal.activeTab ? { activeTab: reveal.activeTab } : {}),
      foregroundAttempted: reveal.foregroundAttempted,
      foregroundSucceeded: reveal.foregroundSucceeded,
      ...(reveal.method ? { method: reveal.method } : {}),
      ...(fallbackReason ? { fallbackReason } : {}),
    };
  }

  private currentChromeUserAction(input: BrowserRevealInput): BrowserUserActionState | undefined {
    const current = this.options.getCurrentUserAction();
    return current?.runtime === "chrome" && (!input.userActionId || current.id === input.userActionId) ? current : undefined;
  }
}

export function managedChromeRevealBoundsForWorkArea(workArea: ManagedChromeWorkArea): ManagedChromeWindowBounds {
  const width = clampManagedChromeDimension(MANAGED_CHROME_WIDTH, workArea.width, MANAGED_CHROME_MIN_WIDTH);
  const height = clampManagedChromeDimension(MANAGED_CHROME_REVEALED_HEIGHT, workArea.height, MANAGED_CHROME_MIN_HEIGHT);
  const left = workArea.x + Math.round((workArea.width - width) / 2);
  const centeredTop = workArea.y + Math.round((workArea.height - height) / 2);
  const preferredTop = workArea.y + MANAGED_CHROME_REVEAL_MARGIN;
  const maxTop = workArea.y + Math.max(0, Math.round(workArea.height) - height);
  const top = Math.min(maxTop, Math.max(workArea.y, Math.max(preferredTop, centeredTop)));
  return { left, top, width, height };
}

function clampManagedChromeDimension(preferred: number, available: number, minimum: number): number {
  if (!Number.isFinite(available) || available <= 0) return preferred;
  const insetAvailable = Math.max(0, Math.round(available) - MANAGED_CHROME_REVEAL_MARGIN * 2);
  if (insetAvailable >= minimum) return Math.min(preferred, insetAvailable);
  return Math.min(preferred, Math.round(available));
}

export interface ManagedChromeForegroundResult {
  attempted: boolean;
  succeeded: boolean;
  method?: string;
  reason?: string;
  unsupported?: boolean;
}

export async function foregroundManagedChromeWindow(input: ManagedChromeRevealInput): Promise<ManagedChromeForegroundResult> {
  if (input.platform === "darwin") return foregroundManagedChromeOnMac(input);
  if (input.platform === "win32") return foregroundManagedChromeOnWindows(input.processId);
  if (input.platform === "linux") return foregroundManagedChromeOnLinux(input.processId);
  return {
    attempted: false,
    succeeded: false,
    unsupported: true,
    reason: `Foregrounding managed Chrome is not implemented on ${input.platform}.`,
  };
}

async function foregroundManagedChromeOnMac(input: ManagedChromeRevealInput): Promise<ManagedChromeForegroundResult> {
  const pid = Number.isInteger(input.processId) && input.processId! > 0 ? String(input.processId) : undefined;
  const names = uniqueStrings([chromeAppNameFromExecutable(input.executable), "Google Chrome", "Chromium"]);
  let lastReason = "";
  for (const name of names) {
    const script = [
      `tell application ${JSON.stringify(name)}`,
      "  activate",
      "  reopen",
      "  if (count windows) > 0 then set index of window 1 to 1",
      "end tell",
      ...(pid
        ? [
            "try",
            'tell application "System Events"',
            `  set matches to every process whose unix id is ${pid}`,
            "  if (count matches) > 0 then set frontmost of item 1 of matches to true",
            "end tell",
            "end try",
          ]
        : []),
    ].join("\n");
    const result = await runExternalCommand("osascript", ["-e", script], 3_000);
    if (result.ok) return { attempted: true, succeeded: true, method: pid ? `osascript:${name}:pid` : `osascript:${name}` };
    lastReason = result.error ?? result.stderr ?? `osascript exited with ${result.code ?? "unknown"}`;
  }
  return {
    attempted: true,
    succeeded: false,
    reason: lastReason || "macOS did not activate Chrome.",
  };
}

async function foregroundManagedChromeOnWindows(processId: number | undefined): Promise<ManagedChromeForegroundResult> {
  const pidValue = Number.isInteger(processId) && processId! > 0 ? String(processId) : "0";
  const script = `
$pidValue = ${pidValue}
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class AmbientWindowFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@
$handles = @()
if ($pidValue -gt 0) {
  $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
  if ($process -and $process.MainWindowHandle -ne 0) { $handles += $process.MainWindowHandle }
}
if ($handles.Count -eq 0) {
  $handles += Get-Process chrome,chromium,msedge -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    ForEach-Object { $_.MainWindowHandle }
}
foreach ($handle in $handles) {
  [AmbientWindowFocus]::ShowWindowAsync($handle, 9) | Out-Null
  Start-Sleep -Milliseconds 50
  if ([AmbientWindowFocus]::SetForegroundWindow($handle)) { exit 0 }
}
exit 1
`.trim();
  const result = await runExternalCommand(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    4_000,
  );
  return result.ok
    ? { attempted: true, succeeded: true, method: "powershell:SetForegroundWindow" }
    : {
        attempted: true,
        succeeded: false,
        reason: result.error ?? result.stderr ?? `PowerShell exited with ${result.code ?? "unknown"}`,
      };
}

async function foregroundManagedChromeOnLinux(processId: number | undefined): Promise<ManagedChromeForegroundResult> {
  const attempts: Array<{ command: string; args: string[]; method: string }> = [];
  if (Number.isInteger(processId) && processId! > 0) {
    attempts.push({
      command: "xdotool",
      args: ["search", "--pid", String(processId), "windowactivate", "%@"],
      method: "xdotool:pid",
    });
  }
  for (const windowClass of ["google-chrome.Google-chrome", "chromium.Chromium", "chromium-browser.Chromium-browser", "Google-chrome"]) {
    attempts.push({ command: "wmctrl", args: ["-x", "-a", windowClass], method: `wmctrl:${windowClass}` });
  }

  let sawMissingTool = false;
  let lastReason = "";
  for (const attempt of attempts) {
    const result = await runExternalCommand(attempt.command, attempt.args, 3_000);
    if (result.ok) return { attempted: true, succeeded: true, method: attempt.method };
    if (result.notFound) sawMissingTool = true;
    lastReason = result.error ?? result.stderr ?? `${attempt.command} exited with ${result.code ?? "unknown"}`;
  }

  const wayland = process.env.XDG_SESSION_TYPE?.toLowerCase() === "wayland";
  return {
    attempted: attempts.length > 0,
    succeeded: false,
    unsupported: wayland || sawMissingTool,
    reason: wayland
      ? "Wayland commonly blocks apps from forcing another app to the foreground."
      : lastReason || "Linux window activation requires xdotool or wmctrl.",
  };
}

export function chromeAppNameFromExecutable(executable: string | undefined): string | undefined {
  if (!executable) return undefined;
  const segments = executable.split(/[\\/]+/);
  const appSegment = [...segments].reverse().find((segment) => segment.endsWith(".app"));
  if (appSegment) return appSegment.slice(0, -".app".length);
  const base = (segments.at(-1) ?? basename(executable)).toLowerCase();
  if (base === "chrome.exe" || base === "google-chrome" || base === "google-chrome-stable") return "Google Chrome";
  if (base === "chromium" || base === "chromium-browser") return "Chromium";
  return undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

interface ExternalCommandResult {
  ok: boolean;
  code?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
  notFound?: boolean;
}

function runExternalCommand(command: string, args: string[], timeoutMs: number): Promise<ExternalCommandResult> {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const finish = (result: ExternalCommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        ...result,
        stdout: stdout.slice(0, 1_000),
        stderr: stderr.slice(0, 1_000),
      });
    };
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      finish({ ok: false, error: error.message, notFound: error.code === "ENOENT" });
    });
    child.once("exit", (code) => {
      finish({ ok: code === 0 && !timedOut, code, error: timedOut ? `${command} timed out.` : undefined });
    });
  });
}
