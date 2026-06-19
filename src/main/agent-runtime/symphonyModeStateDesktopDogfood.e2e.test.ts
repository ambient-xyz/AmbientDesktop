import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import {
  AMBIENT_SUBAGENTS_FEATURE_FLAG,
  resolveAmbientFeatureFlags,
} from "../../shared/featureFlags";
import type { SendMessageComposerIntent } from "../../shared/desktopTypes";
import type { SymphonyModeStateSnapshot } from "../../shared/symphonyModeState";
import {
  buildSymphonyModeStateSnapshot,
  resolveSymphonyParentModePolicy,
} from "./agentRuntimeSymphonyParentMode";

const DOGFOOD_ENABLED = process.env.AMBIENT_SYMPHONY_GAP_PHASE0_DOGFOOD === "1";
const REPO_ROOT = resolve(__dirname, "../../..");
const RESULTS_DIR = join(REPO_ROOT, "test-results/symphony-gap-phase0-dogfood");
const CDP_COMMAND_TIMEOUT_MS = 10_000;

interface CdpMessage {
  id?: number;
  result?: unknown;
  error?: { message?: string };
}

interface CdpClient {
  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  close(): void;
}

const dogfoodIt = DOGFOOD_ENABLED ? it : it.skip;

describe("Symphony gap Phase 0 Desktop dogfood", () => {
  dogfoodIt("launches the headful app and records explicit Symphony mode-state evidence", async () => {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const artifacts: Record<string, string> = {};
    let app: ChildProcess | undefined;
    let cdp: CdpClient | undefined;

    await mkdir(RESULTS_DIR, { recursive: true });

    try {
      const port = dogfoodCdpPort();
      app = launchDesktop({
        port,
        workspacePath: requireDogfoodEnv("AMBIENT_SYMPHONY_GAP_PHASE0_WORKSPACE"),
        userDataPath: requireDogfoodEnv("AMBIENT_SYMPHONY_GAP_PHASE0_USER_DATA"),
      });
      cdp = await connectToElectron(port, app);
      await cdp.send("Runtime.enable");
      await cdp.send("Page.enable");
      await setViewport(cdp, 1440, 900);
      await waitForText(cdp, "Ambient");
      const providerLabel = expectedProviderLabel();
      await waitForText(cdp, providerLabel);

      const visibleApp = await inspectVisibleApp(cdp, providerLabel);
      expect(visibleApp).toMatchObject({
        ambientShellVisible: true,
        providerVisible: true,
        headfulHarnessVisible: true,
      });
      artifacts.desktopScreenshot = await writeScreenshot(cdp, "symphony-gap-phase0-desktop.png");
      artifacts.accessibilitySnapshot = await writeAccessibilitySnapshot(cdp, "symphony-gap-phase0-accessibility.json");

      const modeSnapshots = buildModeSnapshots();
      expect(modeSnapshots.generic.kind).toBe("generic_subagents");
      expect(modeSnapshots.generic.reason).toBe("no_symphony_intent");
      expect(modeSnapshots.armed.kind).toBe("symphony_armed");
      expect(modeSnapshots.armed.patternPreflight).toMatchObject({
        state: "pending_detection",
        source: "symphony_toggle",
      });
      expect(modeSnapshots.parent.kind).toBe("symphony_parent");
      expect(modeSnapshots.parent.launch).toMatchObject({
        state: "required_pending",
        expectedWorkflowToolName: "ambient_workflow_symphony_map_reduce",
      });
      expect(modeSnapshots.unavailable.kind).toBe("unavailable");
      expect(modeSnapshots.unavailable.reason).toBe("ambient_subagents_disabled");

      await writeReport({
        schemaVersion: "ambient-symphony-gap-phase0-dogfood-v1",
        status: "passed",
        classification: "passed",
        generatedAt: new Date().toISOString(),
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        gitCommit: dogfoodGitCommit(),
        gitBranch: dogfoodGitBranch(),
        provider: process.env.AMBIENT_PROVIDER || "ambient",
        model: process.env.AMBIENT_LIVE_MODEL || process.env.GMI_CLOUD_MODEL || process.env.AMBIENT_MODEL,
        featureFlag: AMBIENT_SUBAGENTS_FEATURE_FLAG,
        headful: true,
        cdpPort: port,
        scenarios: ["symphony_gap_phase0_mode_state_contract"],
        modeUnderTest: "symphony_contract",
        expectedOrchestrationPolicy: "mode_state_only",
        artifacts,
        checks: {
          visibleApp,
          modeSnapshotKinds: Object.fromEntries(
            Object.entries(modeSnapshots).map(([name, snapshot]) => [name, snapshot.kind]),
          ),
          modeSnapshotReasons: Object.fromEntries(
            Object.entries(modeSnapshots).map(([name, snapshot]) => [name, snapshot.reason]),
          ),
        },
        modeSnapshots,
      });
    } catch (error) {
      if (cdp) {
        try {
          artifacts.failureScreenshot = await writeScreenshot(cdp, "symphony-gap-phase0-failure.png");
        } catch {
          // Keep the original failure.
        }
      }
      await writeReport({
        schemaVersion: "ambient-symphony-gap-phase0-dogfood-v1",
        status: "failed",
        classification: "failed",
        generatedAt: new Date().toISOString(),
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        gitCommit: dogfoodGitCommit(),
        gitBranch: dogfoodGitBranch(),
        provider: process.env.AMBIENT_PROVIDER || "ambient",
        model: process.env.AMBIENT_LIVE_MODEL || process.env.GMI_CLOUD_MODEL || process.env.AMBIENT_MODEL,
        featureFlag: AMBIENT_SUBAGENTS_FEATURE_FLAG,
        headful: true,
        cdpPort: cdpPortFromEnv() ?? -1,
        scenarios: ["symphony_gap_phase0_mode_state_contract"],
        modeUnderTest: "symphony_contract",
        expectedOrchestrationPolicy: "mode_state_only",
        artifacts,
        checks: {},
        modeSnapshots: {},
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      });
      throw error;
    } finally {
      cdp?.close();
      await terminateApp(app);
    }
  }, 120_000);
});

function buildModeSnapshots(): Record<string, SymphonyModeStateSnapshot> {
  const enabledFlags = resolveAmbientFeatureFlags({
    startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
    generatedAt: "2026-06-18T00:00:00.000Z",
  });
  const disabledFlags = resolveAmbientFeatureFlags({
    generatedAt: "2026-06-18T00:00:00.000Z",
  });
  const runOnceIntent = symphonyRunOnceIntent();
  const policy = resolveSymphonyParentModePolicy({
    thread: { kind: "chat" },
    composerIntent: runOnceIntent,
    featureFlagSnapshot: enabledFlags,
  });
  return {
    generic: buildSymphonyModeStateSnapshot({
      thread: { kind: "chat" },
      featureFlagSnapshot: enabledFlags,
    }),
    armed: buildSymphonyModeStateSnapshot({
      thread: { kind: "chat" },
      featureFlagSnapshot: enabledFlags,
      toggleState: "on",
    }),
    parent: buildSymphonyModeStateSnapshot({
      thread: { kind: "chat" },
      composerIntent: runOnceIntent,
      featureFlagSnapshot: enabledFlags,
      policy,
    }),
    unavailable: buildSymphonyModeStateSnapshot({
      thread: { kind: "chat" },
      composerIntent: runOnceIntent,
      featureFlagSnapshot: disabledFlags,
      toggleState: "on",
    }),
  };
}

function symphonyRunOnceIntent(): SendMessageComposerIntent {
  return {
    kind: "symphony-workflow",
    action: "run-once",
    patternId: "map_reduce",
    metricCustomizations: {
      "map_reduce-metric": "Reducer must cite every child result.",
    },
  };
}

function launchDesktop(input: { port: number; workspacePath: string; userDataPath: string }): ChildProcess {
  return spawn("pnpm", [
    "exec",
    "electron-vite",
    "dev",
    "--",
    `--remote-debugging-port=${input.port}`,
    `--enable-feature=${AMBIENT_SUBAGENTS_FEATURE_FLAG}`,
  ], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      AMBIENT_PROVIDER: process.env.AMBIENT_PROVIDER || "ambient",
      AMBIENT_E2E: "1",
      AMBIENT_DESKTOP_WORKSPACE: input.workspacePath,
      AMBIENT_E2E_USER_DATA: input.userDataPath,
    },
  });
}

async function connectToElectron(port: number, app: ChildProcess): Promise<CdpClient> {
  const started = Date.now();
  let lastOutput = "";
  app.stdout?.on("data", (chunk) => {
    lastOutput = `${lastOutput}${chunk.toString()}`.slice(-4000);
  });
  app.stderr?.on("data", (chunk) => {
    lastOutput = `${lastOutput}${chunk.toString()}`.slice(-4000);
  });

  while (Date.now() - started < 45_000) {
    if (app.exitCode !== null) {
      throw new Error(`Electron exited before CDP was available.\n${lastOutput}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json() as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
        const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
        if (page?.webSocketDebuggerUrl) return createCdpClient(page.webSocketDebuggerUrl);
      }
    } catch {
      // Keep polling until Electron exposes the debugger endpoint.
    }
    await delay(250);
  }

  throw new Error(`Timed out waiting for Electron CDP on port ${port}.\n${lastOutput}`);
}

function createCdpClient(url: string): CdpClient {
  const WebSocketCtor = globalThis.WebSocket as unknown as {
    new(url: string): WebSocket;
  };
  const socket = new WebSocketCtor(url);
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as CdpMessage;
    if (typeof message.id !== "number") return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message || "CDP command failed"));
    else waiter.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    for (const waiter of pending.values()) waiter.reject(new Error("CDP socket closed"));
    pending.clear();
  });

  return {
    send<T = unknown>(method: string, params: Record<string, unknown> = {}) {
      const id = nextId++;
      const ready = socket.readyState === WebSocket.OPEN
        ? Promise.resolve()
        : new Promise<void>((resolveReady, rejectReady) => {
          const timeout = setTimeout(() => {
            rejectReady(new Error(`Timed out waiting for CDP socket open after ${CDP_COMMAND_TIMEOUT_MS}ms.`));
          }, CDP_COMMAND_TIMEOUT_MS);
          socket.addEventListener("open", () => {
            clearTimeout(timeout);
            resolveReady();
          }, { once: true });
          socket.addEventListener("error", () => {
            clearTimeout(timeout);
            rejectReady(new Error("CDP socket failed to open"));
          }, { once: true });
        });
      return ready.then(() => new Promise<T>((resolveCommand, rejectCommand) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          rejectCommand(new Error(`Timed out waiting for CDP ${method} after ${CDP_COMMAND_TIMEOUT_MS}ms.`));
        }, CDP_COMMAND_TIMEOUT_MS);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timeout);
            resolveCommand(value as T);
          },
          reject: (error) => {
            clearTimeout(timeout);
            rejectCommand(error);
          },
        });
        socket.send(JSON.stringify({ id, method, params }));
      }));
    },
    close() {
      socket.close();
    },
  };
}

async function waitForText(cdp: CdpClient, text: string) {
  await waitFor(cdp, (expected) => document.body.innerText.includes(expected), text);
}

async function waitFor<T extends unknown[]>(
  cdp: CdpClient,
  predicate: (...args: T) => boolean,
  ...args: T
) {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    const matched = await evaluate<boolean, T>(cdp, predicate, ...args);
    if (matched) return;
    await delay(100);
  }
  throw new Error("Timed out waiting for Electron UI condition.");
}

async function evaluate<T, TArgs extends unknown[]>(
  cdp: CdpClient,
  fn: (...args: TArgs) => T | Promise<T>,
  ...args: TArgs
): Promise<T> {
  const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
  const result = await cdp.send<{ result?: { value?: T }; exceptionDetails?: unknown }>("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(`Runtime.evaluate failed: ${JSON.stringify(result.exceptionDetails)}`);
  return result.result?.value as T;
}

async function setViewport(cdp: CdpClient, width: number, height: number) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function inspectVisibleApp(cdp: CdpClient, providerLabel: string) {
  return evaluate(cdp, (expectedLabel) => {
    const bodyText = document.body.innerText;
    const rect = document.body.getBoundingClientRect();
    return {
      ambientShellVisible: bodyText.includes("Ambient") && bodyText.includes("New chat"),
      providerVisible: bodyText.includes(expectedLabel),
      providerLabel: expectedLabel,
      headfulHarnessVisible: window.innerWidth >= 1000 && window.innerHeight >= 700 && rect.width > 0 && rect.height > 0,
      bodyTextPreview: bodyText.slice(0, 800),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  }, providerLabel);
}

async function writeScreenshot(cdp: CdpClient, name: string): Promise<string> {
  await mkdir(RESULTS_DIR, { recursive: true });
  const result = await cdp.send<{ data: string }>("Page.captureScreenshot", { format: "png", fromSurface: true });
  const outputPath = join(RESULTS_DIR, name);
  await writeFile(outputPath, Buffer.from(result.data, "base64"));
  return outputPathRelative(outputPath);
}

async function writeAccessibilitySnapshot(cdp: CdpClient, name: string): Promise<string> {
  await mkdir(RESULTS_DIR, { recursive: true });
  const snapshot = await cdp.send("Accessibility.getFullAXTree");
  const outputPath = join(RESULTS_DIR, name);
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return outputPathRelative(outputPath);
}

async function writeReport(report: Record<string, unknown>) {
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(join(RESULTS_DIR, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function requireDogfoodEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for Symphony gap Phase 0 dogfood.`);
  return value;
}

function dogfoodCdpPort(): number {
  return cdpPortFromEnv() ?? failMissingCdpPort();
}

function cdpPortFromEnv(): number | undefined {
  const raw = process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT;
  if (!raw) return undefined;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT must be a TCP port, got ${raw}.`);
  }
  return port;
}

function failMissingCdpPort(): never {
  throw new Error("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT is required; run through scripts/run-electron-dogfood.mjs.");
}

function dogfoodGitCommit(): string {
  return process.env.AMBIENT_SYMPHONY_GAP_PHASE0_GIT_COMMIT || gitOutput(["rev-parse", "HEAD"]) || "unknown";
}

function dogfoodGitBranch(): string {
  return process.env.AMBIENT_SYMPHONY_GAP_PHASE0_GIT_BRANCH || gitOutput(["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown";
}

function expectedProviderLabel(): string {
  return process.env.AMBIENT_PROVIDER === "gmi-cloud" ? "GMI Cloud API" : "Ambient API";
}

function gitOutput(args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function outputPathRelative(path: string): string {
  const absolute = resolve(path);
  return absolute.startsWith(`${REPO_ROOT}/`) ? absolute.slice(REPO_ROOT.length + 1) : absolute;
}

async function terminateApp(app: ChildProcess | undefined) {
  if (!app || app.exitCode !== null || app.signalCode !== null) return;
  signalAppProcess(app, "SIGTERM");
  const exited = await waitForAppExit(app, 5000);
  if (exited) return;
  signalAppProcess(app, "SIGKILL");
  await waitForAppExit(app, 2000);
}

function signalAppProcess(app: ChildProcess, signal: NodeJS.Signals) {
  try {
    if (process.platform !== "win32" && app.pid) {
      process.kill(-app.pid, signal);
      return;
    }
  } catch {
    // Fall back to direct child signaling.
  }
  try {
    app.kill(signal);
  } catch {
    // Best effort cleanup.
  }
}

async function waitForAppExit(app: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (app.exitCode !== null || app.signalCode !== null) return true;
  const timeout = delay(timeoutMs).then(() => false);
  const exited = new Promise<boolean>((resolveExit) => app.once("exit", () => resolveExit(true)));
  return Promise.race([timeout, exited]);
}
