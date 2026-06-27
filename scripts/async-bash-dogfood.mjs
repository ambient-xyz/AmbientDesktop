#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = process.cwd();
const resultsDir = join(repoRoot, "test-results", "async-bash-dogfood");
const latestArtifactPath = join(resultsDir, "latest.json");
const scratchRoot = await mkdtemp(join(tmpdir(), "ambient-async-bash-dogfood-"));
const workspacePath = join(scratchRoot, "workspace");
const userDataPath = join(scratchRoot, "userData");
const authorityStateRoot = join(userDataPath, "authority-state");
const DEFAULT_DOGFOOD_PROVIDER = "ambient";
const DEFAULT_DOGFOOD_MODEL = "example/model-id";
const cdpCommandTimeoutMs = 10_000;
const promptText = [
  "This is a live Ambient async bash dogfood. Use bash_start, not bash, with exactly this cmd:",
  "`printf 'ASYNC_STREAM_1\\n'; sleep 4; printf 'ASYNC_STREAM_DONE\\n'`.",
  "Use yield_ms around 500. Immediately schedule thread_wake_schedule with after_ms around 1500, the returned job_id, and reason `poll async bash dogfood`.",
  "In the first response, only say the async job started and the wake was scheduled.",
  "When the scheduled wake continuation runs, use bash_poll with wait_ms up to 5000 until the job exits.",
  "Then reply with `ASYNC_BASH_DOGFOOD_DONE` and mention both ASYNC_STREAM_1 and ASYNC_STREAM_DONE.",
].join(" ");

let exitCode = 0;
let dogfoodEnv;

try {
  await rm(latestArtifactPath, { force: true });
  await seedWorkspace();
  dogfoodEnv = buildDogfoodEnv();
  await run("pnpm", ["run", "prepare:electron-native"], dogfoodEnv);
  await runAsyncBashDogfood();
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
  if (process.env.AMBIENT_ASYNC_BASH_DOGFOOD_KEEP_SCRATCH !== "1") {
    await rm(scratchRoot, { recursive: true, force: true });
  } else {
    process.stdout.write(`Async bash dogfood scratch retained at ${scratchRoot}\n`);
  }
}

process.exit(exitCode);

async function seedWorkspace() {
  await mkdir(workspacePath, { recursive: true });
  await mkdir(userDataPath, { recursive: true });
  const sourceUserData = dogfoodSourceUserDataPath();
  if (sourceUserData) {
    await cp(sourceUserData, userDataPath, { recursive: true, force: true });
  }
  await writeFile(
    join(workspacePath, "README.md"),
    "# Async Bash Dogfood\n\nThis workspace is intentionally small and disposable.\n",
    "utf8",
  );
}

function dogfoodSourceUserDataPath() {
  const value = process.env.AMBIENT_ASYNC_BASH_DOGFOOD_SOURCE_USER_DATA || process.env.AMBIENT_E2E_USER_DATA;
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!existsSync(trimmed)) throw new Error("Configured async bash dogfood source userData path does not exist.");
  return trimmed;
}

async function runAsyncBashDogfood() {
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
    await waitForText(cdp, "Ambient", 45_000);
    await waitForText(cdp, expectedProviderLabel(), 45_000);

    await setTextAreaValue(cdp, ".composer-input-wrap textarea", promptText);
    await waitForTextareaValue(cdp, ".composer-input-wrap textarea", promptText);
    await clickElement(cdp, "button[data-ui-required-action='composer-send']");

    await waitForDogfoodCheck(
      cdp,
      (checks) => checks.bashStartUsed && checks.asyncTranscriptHasStreamStart,
      "async bash streaming transcript",
      180_000,
    );
    artifacts.streamingScreenshot = await writeScreenshot(cdp, "async-bash-streaming.png");
    await waitForDogfoodCheck(
      cdp,
      (checks) =>
        checks.bashPollUsed &&
        checks.wakeScheduleUsed &&
        checks.wakeDelivered &&
        checks.asyncTranscriptHasStreamDone &&
        checks.assistantHasFinalMarker,
      "async bash final wake/poll evidence",
      300_000,
    );
    artifacts.finalScreenshot = await writeScreenshot(cdp, "async-bash-final.png");

    const checks = await collectChecks(cdp);
    assertChecks(checks);
    await writeReport({
      schemaVersion: "ambient-async-bash-dogfood-v1",
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
      headful: true,
      cdpPort: port,
      scenarios: ["async_bash_streaming_wake"],
      checks,
      artifacts,
    });
  } catch (error) {
    if (cdp) {
      try {
        artifacts.failureScreenshot = await writeScreenshot(cdp, "async-bash-failure.png");
      } catch {
        // Preserve the original failure.
      }
    }
    await writeReport({
      schemaVersion: "ambient-async-bash-dogfood-v1",
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
      headful: true,
      cdpPort: cdpPortFromEnv() ?? -1,
      scenarios: ["async_bash_streaming_wake"],
      checks: await collectChecks(cdp).catch(() => ({})),
      artifacts,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    throw error;
  } finally {
    cdp?.close();
    await terminateApp(app);
  }
}

async function collectChecks(cdp) {
  const bodyText = cdp ? await evaluate(cdp, () => document.body.innerText) : "";
  const messages = readPersistedMessages();
  const assistantText = messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .join("\n");
  const wakeRows = readThreadWakeContinuations();
  const toolMessages = messages
    .map((message) => ({ ...message, metadata: parseJson(message.metadataJson) }))
    .filter((message) => message.role === "tool");
  const toolNames = toolMessages.map((message) => String(message.metadata.toolName ?? ""));
  const asyncTranscript = toolMessages
    .filter((message) => message.metadata.toolName === "bash_async" || message.content.includes("bash_async"))
    .map((message) => message.content)
    .join("\n");
  return {
    bodyHasStreamStart: bodyText.includes("ASYNC_STREAM_1"),
    bodyHasFinalMarker: bodyText.includes("ASYNC_BASH_DOGFOOD_DONE"),
    assistantHasFinalMarker: assistantText.includes("ASYNC_BASH_DOGFOOD_DONE"),
    assistantMentionsStreamStart: assistantText.includes("ASYNC_STREAM_1"),
    assistantMentionsStreamDone: assistantText.includes("ASYNC_STREAM_DONE"),
    toolNames,
    bashStartUsed: toolNames.includes("bash_start"),
    bashPollUsed: toolNames.includes("bash_poll"),
    wakeScheduleUsed: toolNames.includes("thread_wake_schedule"),
    asyncTranscriptHasStreamStart: asyncTranscript.includes("ASYNC_STREAM_1"),
    asyncTranscriptHasStreamDone: asyncTranscript.includes("ASYNC_STREAM_DONE"),
    wakeCount: wakeRows.length,
    wakeDelivered: wakeRows.some((row) => row.status === "delivered"),
    wakeRows: wakeRows.map((row) => ({
      id: row.id,
      status: row.status,
      dueAt: row.due_at,
      jobId: row.job_id,
      reason: row.reason,
    })),
  };
}

function assertChecks(checks) {
  const failures = [];
  if (!checks.assistantHasFinalMarker) failures.push("assistant never reported ASYNC_BASH_DOGFOOD_DONE");
  if (!checks.assistantMentionsStreamStart) failures.push("assistant never mentioned ASYNC_STREAM_1");
  if (!checks.assistantMentionsStreamDone) failures.push("assistant never mentioned ASYNC_STREAM_DONE");
  if (!checks.bashStartUsed) failures.push("bash_start tool was not observed");
  if (!checks.bashPollUsed) failures.push("bash_poll tool was not observed");
  if (!checks.wakeScheduleUsed) failures.push("thread_wake_schedule tool was not observed");
  if (!checks.asyncTranscriptHasStreamStart) failures.push("async bash transcript did not include ASYNC_STREAM_1");
  if (!checks.asyncTranscriptHasStreamDone) failures.push("async bash transcript did not include ASYNC_STREAM_DONE");
  if (checks.wakeCount < 1) failures.push("no thread wake continuation row was persisted");
  if (!checks.wakeDelivered) failures.push("no thread wake continuation was delivered");
  if (failures.length > 0) throw new Error(`Async bash dogfood failed:\n- ${failures.join("\n- ")}`);
}

async function waitForDogfoodCheck(cdp, predicate, label, timeoutMs) {
  const started = Date.now();
  let latestChecks = {};
  while (Date.now() - started < timeoutMs) {
    latestChecks = await collectChecks(cdp);
    if (predicate(latestChecks)) return latestChecks;
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${label}. Latest checks: ${JSON.stringify(latestChecks, null, 2)}`);
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
  ], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    env: {
      ...buildDogfoodEnv(),
      AMBIENT_E2E: "1",
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

async function waitForText(cdp, text, timeoutMs = 20_000) {
  await waitFor(cdp, (expected) => document.body.innerText.includes(expected), [text], timeoutMs);
}

async function waitForTextareaValue(cdp, selector, expectedValue) {
  await waitFor(cdp, (targetSelector, value) => {
    const textarea = document.querySelector(targetSelector);
    return textarea instanceof HTMLTextAreaElement && textarea.value === value;
  }, [selector, expectedValue], 20_000);
}

async function waitFor(cdp, predicate, args = [], timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(cdp, predicate, ...args)) return;
    await delay(250);
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

async function writeReport(report) {
  await mkdir(dirname(latestArtifactPath), { recursive: true });
  await writeFile(latestArtifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function readPersistedMessages() {
  const dbPath = dogfoodStateDbPath();
  if (!existsSync(dbPath)) return [];
  return readSqlJson(dbPath, [
    "SELECT id, thread_id as threadId, role, content, metadata_json as metadataJson",
    "FROM messages",
    "ORDER BY created_at ASC, rowid ASC",
  ].join(" "));
}

function readThreadWakeContinuations() {
  const dbPath = dogfoodStateDbPath();
  if (!existsSync(dbPath)) return [];
  return readSqlJson(dbPath, "SELECT * FROM thread_wake_continuations ORDER BY created_at ASC, rowid ASC");
}

function readSqlJson(dbPath, sql) {
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
  if (!exited) signalAppProcess(app, "SIGKILL");
}

function signalAppProcess(app, signal) {
  try {
    if (process.platform !== "win32" && app.pid) process.kill(-app.pid, signal);
    else app.kill(signal);
  } catch {
    try {
      app.kill(signal);
    } catch {
      // Process already exited.
    }
  }
}

async function waitForAppExit(app, timeoutMs) {
  if (app.exitCode !== null || app.signalCode !== null) return true;
  return Promise.race([
    once(app, "exit").then(() => true),
    delay(timeoutMs).then(() => false),
  ]);
}
