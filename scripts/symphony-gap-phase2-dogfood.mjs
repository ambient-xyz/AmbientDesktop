#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = process.cwd();
const resultsDir = join(repoRoot, "test-results", "symphony-gap-phase2-dogfood");
const scratchRoot = await mkdtemp(join(tmpdir(), "ambient-symphony-gap-phase2-"));
const workspacePath = join(scratchRoot, "workspace");
const userDataPath = join(scratchRoot, "userData");
const authorityStateRoot = join(userDataPath, "authority-state");
const staleLatestArtifactPath = join(resultsDir, "latest.json");
const DEFAULT_DOGFOOD_PROVIDER = "ambient";
const DEFAULT_DOGFOOD_MODEL = "<model>";
const SUBAGENTS_FEATURE_FLAG = "ambient.subagents";
const cdpCommandTimeoutMs = 10_000;
const ambiguousPrompt = "Help me with this.";
const clearPrompt = "Compare each of these six source packets and synthesize a cited recommendation.";
const reducerMetric = "Every source packet has a cited summary before reduction.";

let exitCode = 0;
let dogfoodEnv;

try {
  await rm(staleLatestArtifactPath, { force: true });
  await mkdir(workspacePath, { recursive: true });
  await mkdir(userDataPath, { recursive: true });
  dogfoodEnv = buildDogfoodEnv();
  await run("pnpm", ["run", "prepare:electron-native"], dogfoodEnv);
  await runPhase2Dogfood();
} catch (error) {
  exitCode = 1;
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
} finally {
  try {
    await run("pnpm", ["run", "prepare:node-native"], dogfoodEnv ?? buildDogfoodEnv());
  } catch (error) {
    exitCode = 1;
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  }
  if (process.env.AMBIENT_SYMPHONY_GAP_PHASE2_KEEP_SCRATCH !== "1") {
    await rm(scratchRoot, { recursive: true, force: true });
  } else {
    process.stdout.write(`Symphony gap Phase 2 dogfood scratch retained at ${scratchRoot}\n`);
  }
}

process.exit(exitCode);

async function runPhase2Dogfood() {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const artifacts = {};
  let app;
  let cdp;
  try {
    const port = dogfoodCdpPort();
    app = launchDesktop(port);
    cdp = await connectToElectron(port, app);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await setViewport(cdp, 1440, 900);
    await waitForText(cdp, "Ambient");
    await waitForText(cdp, expectedProviderLabel());

    await clickElement(cdp, ".symphony-composer-button");
    await waitFor(cdp, () => Boolean(document.querySelector(".symphony-builder-panel")));

    await setTextAreaValue(cdp, ".composer-input-wrap textarea", ambiguousPrompt);
    await waitForTextareaValue(cdp, ".composer-input-wrap textarea", ambiguousPrompt);
    await clickElement(cdp, "button[data-ui-required-action='composer-send']");
    await waitForText(cdp, "Which Symphony pattern should coordinate this request?");
    await waitForText(cdp, "Custom details");
    await waitFor(cdp, () => Boolean(document.querySelector("[data-preflight-refine='custom']")));
    await delay(750);
    assertNoPersistedUserMessage(ambiguousPrompt);
    await expectNoText(cdp, "Prompt sent to Ambient.");
    artifacts.ambiguousScreenshot = await writeScreenshot(cdp, "symphony-gap-phase2-ambiguous.png");

    await setTextAreaValue(cdp, ".composer-input-wrap textarea", clearPrompt);
    await waitForTextareaValue(cdp, ".composer-input-wrap textarea", clearPrompt);
    await setTextAreaValue(cdp, ".symphony-metric-editor textarea", reducerMetric);
    await waitForTextareaValue(cdp, ".symphony-metric-editor textarea", reducerMetric);
    await clickElement(cdp, "button[data-ui-required-action='composer-send']");
    await waitForText(cdp, "Auto-selected by preflight");
    await waitForText(cdp, "confidence");
    await waitForText(cdp, "Role plan: explorer, summarizer");
    await waitForText(cdp, "One explorer child");
    const persistedUserMessage = await waitForPersistedSymphonyUserMessage();
    await expectNoText(cdp, "Prompt sent to Ambient.");

    artifacts.desktopScreenshot = await writeScreenshot(cdp, "symphony-gap-phase2-desktop.png");
    artifacts.accessibilitySnapshot = await writeAccessibilitySnapshot(cdp, "symphony-gap-phase2-accessibility.json");
    await writeReport({
      schemaVersion: "ambient-symphony-gap-phase2-dogfood-v1",
      status: "passed",
      classification: "passed",
      generatedAt: new Date().toISOString(),
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      gitCommit: gitValue(["rev-parse", "HEAD"]),
      gitBranch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
      provider: process.env.AMBIENT_PROVIDER || "ambient",
      model: process.env.AMBIENT_LIVE_MODEL || process.env.GMI_CLOUD_MODEL || process.env.AMBIENT_MODEL,
      featureFlag: SUBAGENTS_FEATURE_FLAG,
      headful: true,
      cdpPort: port,
      scenarios: ["symphony_gap_phase2_pattern_preflight"],
      checks: {
        ambiguousPromptClarified: true,
        ambiguousPromptNotPersisted: true,
        clearPromptAutoSelected: true,
        preflightRationaleVisible: true,
        persistedSymphonyComposerIntent: true,
        ordinaryPromptActivityVisible: false,
        persistedUserMessage,
      },
      artifacts,
    });
  } catch (error) {
    if (cdp) {
      try {
        artifacts.failureScreenshot = await writeScreenshot(cdp, "symphony-gap-phase2-failure.png");
      } catch {
        // Preserve the original failure.
      }
    }
    await writeReport({
      schemaVersion: "ambient-symphony-gap-phase2-dogfood-v1",
      status: "failed",
      classification: "failed",
      generatedAt: new Date().toISOString(),
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      gitCommit: gitValue(["rev-parse", "HEAD"]),
      gitBranch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
      provider: process.env.AMBIENT_PROVIDER || "ambient",
      model: process.env.AMBIENT_LIVE_MODEL || process.env.GMI_CLOUD_MODEL || process.env.AMBIENT_MODEL,
      featureFlag: SUBAGENTS_FEATURE_FLAG,
      headful: true,
      cdpPort: cdpPortFromEnv() ?? -1,
      scenarios: ["symphony_gap_phase2_pattern_preflight"],
      checks: {},
      artifacts,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    throw error;
  } finally {
    cdp?.close();
    await terminateApp(app);
  }
}

function buildDogfoodEnv() {
  return cleanChildEnv({
    ...process.env,
    ...dogfoodProviderEnv(process.env),
    AMBIENT_DESKTOP_WORKSPACE: workspacePath,
    AMBIENT_E2E_USER_DATA: userDataPath,
    AMBIENT_AUTHORITY_STATE_ROOT: authorityStateRoot,
  });
}

function dogfoodProviderEnv(env) {
  const providerId = env.AMBIENT_PROVIDER || DEFAULT_DOGFOOD_PROVIDER;
  const modelId = env.AMBIENT_LIVE_MODEL || env.GMI_CLOUD_MODEL || env.AMBIENT_MODEL || DEFAULT_DOGFOOD_MODEL;
  return providerId === "gmi-cloud"
    ? { AMBIENT_PROVIDER: providerId, GMI_CLOUD_MODEL: modelId }
    : { AMBIENT_PROVIDER: providerId, AMBIENT_LIVE_MODEL: modelId };
}

function launchDesktop(port) {
  return spawn("pnpm", [
    "exec",
    "electron-vite",
    "dev",
    "--",
    `--remote-debugging-port=${port}`,
    `--enable-feature=${SUBAGENTS_FEATURE_FLAG}`,
  ], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      AMBIENT_PROVIDER: process.env.AMBIENT_PROVIDER || "ambient",
      AMBIENT_E2E: "1",
      AMBIENT_DESKTOP_WORKSPACE: workspacePath,
      AMBIENT_E2E_USER_DATA: userDataPath,
      AMBIENT_AUTHORITY_STATE_ROOT: authorityStateRoot,
    },
  });
}

async function connectToElectron(port, app) {
  const started = Date.now();
  let lastOutput = "";
  app.stdout?.on("data", (chunk) => {
    lastOutput = `${lastOutput}${chunk.toString()}`.slice(-4000);
  });
  app.stderr?.on("data", (chunk) => {
    lastOutput = `${lastOutput}${chunk.toString()}`.slice(-4000);
  });
  while (Date.now() - started < 45_000) {
    if (app.exitCode !== null) throw new Error(`Electron exited before CDP was available.\n${lastOutput}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
        if (page?.webSocketDebuggerUrl) return createCdpClient(page.webSocketDebuggerUrl);
      }
    } catch {
      // Keep polling.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for Electron CDP on port ${port}.\n${lastOutput}`);
}

function createCdpClient(url) {
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
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
    send(method, params = {}) {
      const id = nextId++;
      const ready = socket.readyState === WebSocket.OPEN
        ? Promise.resolve()
        : new Promise((resolveReady, rejectReady) => {
          const timeout = setTimeout(() => {
            rejectReady(new Error(`Timed out waiting for CDP socket open after ${cdpCommandTimeoutMs}ms.`));
          }, cdpCommandTimeoutMs);
          socket.addEventListener("open", () => {
            clearTimeout(timeout);
            resolveReady();
          }, { once: true });
          socket.addEventListener("error", () => {
            clearTimeout(timeout);
            rejectReady(new Error("CDP socket failed to open"));
          }, { once: true });
        });
      return ready.then(() => new Promise((resolveCommand, rejectCommand) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          rejectCommand(new Error(`Timed out waiting for CDP ${method} after ${cdpCommandTimeoutMs}ms.`));
        }, cdpCommandTimeoutMs);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timeout);
            resolveCommand(value);
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

async function setTextAreaValue(cdp, selector, value) {
  await evaluate(cdp, (targetSelector, nextValue) => {
    const textarea = document.querySelector(targetSelector);
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error(`Missing textarea ${targetSelector}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, nextValue);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }, selector, value);
}

async function clickElement(cdp, selector) {
  await evaluate(cdp, (targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (!(element instanceof HTMLElement)) throw new Error(`Missing clickable element ${targetSelector}`);
    element.click();
  }, selector);
}

async function waitForText(cdp, text) {
  await waitFor(cdp, (expected) => document.body.innerText.includes(expected), text);
}

async function expectNoText(cdp, text) {
  const present = await evaluate(cdp, (expected) => document.body.innerText.includes(expected), text);
  if (present) throw new Error(`Unexpected Electron UI text present: ${text}`);
}

async function waitForTextareaValue(cdp, selector, expectedValue) {
  await waitFor(cdp, (targetSelector, value) => {
    const textarea = document.querySelector(targetSelector);
    return textarea instanceof HTMLTextAreaElement && textarea.value === value;
  }, selector, expectedValue);
}

async function waitForPersistedSymphonyUserMessage() {
  const started = Date.now();
  let lastRows = [];
  while (Date.now() - started < 30_000) {
    lastRows = readPersistedUserMessages();
    const match = lastRows.find((row) => {
      const metadata = parseJson(row.metadataJson);
      const intent = metadata.composerIntent;
      return row.content === clearPrompt &&
        intent?.kind === "symphony-workflow" &&
        intent.action === "run-once" &&
        intent.patternId === "map_reduce";
    });
    if (match) {
      const metadata = parseJson(match.metadataJson);
      return {
        id: match.id,
        threadId: match.threadId,
        composerIntent: metadata.composerIntent,
      };
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for persisted Symphony user message. Last user rows: ${JSON.stringify(lastRows.slice(0, 5))}`);
}

function assertNoPersistedUserMessage(content) {
  const rows = readPersistedUserMessages();
  const match = rows.find((row) => row.content === content);
  if (match) throw new Error(`Expected no persisted user message for "${content}", found ${JSON.stringify(match)}`);
}

function readPersistedUserMessages() {
  const dbPath = dogfoodStateDbPath();
  if (!existsSync(dbPath)) return [];
  const sql = [
    "SELECT id, thread_id as threadId, role, content, metadata_json as metadataJson",
    "FROM messages",
    "WHERE role = 'user'",
    "ORDER BY created_at DESC, rowid DESC",
    "LIMIT 12",
  ].join(" ");
  const result = spawnSync("sqlite3", ["-json", dbPath, sql], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return [];
  const trimmed = result.stdout.trim();
  return trimmed ? JSON.parse(trimmed) : [];
}

function dogfoodStateDbPath() {
  const legacyDbPath = join(workspacePath, ".ambient-codex", "state.sqlite");
  const authorityDbPath = join(authorityStateRoot, "workspaces", authorityWorkspaceDirectoryName(workspacePath), "state.sqlite");
  return existsSync(authorityDbPath) || !existsSync(legacyDbPath) ? authorityDbPath : legacyDbPath;
}

function authorityWorkspaceDirectoryName(workspace) {
  const name = safePathSegment(basename(workspace)) || "workspace";
  const id = createHash("sha256").update(resolve(workspace)).digest("hex").slice(0, 16);
  return `${name}-${id}`;
}

function safePathSegment(value) {
  return value.trim().replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^\.+|\.+$/g, "");
}

function parseJson(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function waitFor(cdp, predicate, ...args) {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    if (await evaluate(cdp, predicate, ...args)) return;
    await delay(100);
  }
  throw new Error("Timed out waiting for Electron UI condition.");
}

async function evaluate(cdp, fn, ...args) {
  const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(`Runtime.evaluate failed: ${JSON.stringify(result.exceptionDetails)}`);
  return result.result?.value;
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function writeScreenshot(cdp, name) {
  await mkdir(resultsDir, { recursive: true });
  const result = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const outputPath = join(resultsDir, name);
  await writeFile(outputPath, Buffer.from(result.data, "base64"));
  return outputPathRelative(outputPath);
}

async function writeAccessibilitySnapshot(cdp, name) {
  await mkdir(resultsDir, { recursive: true });
  const snapshot = await cdp.send("Accessibility.getFullAXTree");
  const outputPath = join(resultsDir, name);
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return outputPathRelative(outputPath);
}

async function writeReport(report) {
  await mkdir(dirname(staleLatestArtifactPath), { recursive: true });
  await writeFile(staleLatestArtifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function dogfoodCdpPort() {
  return cdpPortFromEnv() ?? failMissingCdpPort();
}

function cdpPortFromEnv() {
  const raw = process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT;
  if (!raw) return undefined;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT must be a TCP port, got ${raw}.`);
  }
  return port;
}

function failMissingCdpPort() {
  throw new Error("AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT is required; run through scripts/run-electron-dogfood.mjs.");
}

function expectedProviderLabel() {
  return process.env.AMBIENT_PROVIDER === "gmi-cloud" ? "GMI Cloud API" : "Ambient API";
}

function gitValue(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

async function run(command, args, env) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env,
  });
  const [code, signal] = await once(child, "exit");
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} failed with ${signal ?? code}.`);
}

function outputPathRelative(path) {
  const absolute = resolve(path);
  return absolute.startsWith(`${repoRoot}/`) ? absolute.slice(repoRoot.length + 1) : absolute;
}

function cleanChildEnv(env) {
  const next = { ...env };
  delete next.NODE_OPTIONS;
  delete next.VITEST;
  return next;
}

async function terminateApp(app) {
  if (!app || app.exitCode !== null || app.signalCode !== null) return;
  signalAppProcess(app, "SIGTERM");
  const exited = await waitForAppExit(app, 5000);
  if (exited) return;
  signalAppProcess(app, "SIGKILL");
  await waitForAppExit(app, 2000);
}

function signalAppProcess(app, signal) {
  try {
    if (process.platform !== "win32" && app.pid) {
      process.kill(-app.pid, signal);
      return;
    }
  } catch {
    // Fall back to direct signaling.
  }
  try {
    app.kill(signal);
  } catch {
    // Best effort cleanup.
  }
}

async function waitForAppExit(app, timeoutMs) {
  if (app.exitCode !== null || app.signalCode !== null) return true;
  const timeout = delay(timeoutMs).then(() => false);
  const exited = new Promise((resolveExit) => app.once("exit", () => resolveExit(true)));
  return Promise.race([timeout, exited]);
}
