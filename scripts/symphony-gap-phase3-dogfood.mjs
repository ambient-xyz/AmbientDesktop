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
const resultsDir = join(repoRoot, "test-results", "symphony-gap-phase3-dogfood");
const scratchRoot = await mkdtemp(join(tmpdir(), "ambient-symphony-gap-phase3-"));
const workspacePath = join(scratchRoot, "workspace");
const userDataPath = join(scratchRoot, "userData");
const authorityStateRoot = join(userDataPath, "authority-state");
const latestArtifactPath = join(resultsDir, "latest.json");
const DEFAULT_DOGFOOD_PROVIDER = "ambient";
const DEFAULT_DOGFOOD_MODEL = "<model>";
const SUBAGENTS_FEATURE_FLAG = "ambient.subagents";
const cdpCommandTimeoutMs = 10_000;
const expectedWorkflowTool = "ambient_workflow_symphony_imitate_and_verify";
const promptText = [
  "Please compare the note in docs/site-note.md with the sheet in data/launch-claims.csv.",
  "Tell me which claims contradict each other and which one I should verify before sharing the summary.",
].join(" ");
const metricText = "Verifier must identify each contradiction and say which child evidence supported it.";
const forbiddenParentTools = [
  "read",
  "bash",
  "edit",
  "write",
  "browser_search",
  "browser_nav",
  "browser_content",
  "browser_eval",
  "browser_screenshot",
  "web_research_search",
  "web_research_fetch",
  "ambient_subagent",
];

let exitCode = 0;
let dogfoodEnv;

try {
  await rm(latestArtifactPath, { force: true });
  await seedWorkspace();
  dogfoodEnv = buildDogfoodEnv();
  await run("pnpm", ["run", "prepare:electron-native"], dogfoodEnv);
  await runPhase3Dogfood();
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
  if (process.env.AMBIENT_SYMPHONY_GAP_PHASE3_KEEP_SCRATCH !== "1") {
    await rm(scratchRoot, { recursive: true, force: true });
  } else {
    process.stdout.write(`Symphony gap Phase 3 dogfood scratch retained at ${scratchRoot}\n`);
  }
}

process.exit(exitCode);

async function seedWorkspace() {
  await mkdir(join(workspacePath, "docs"), { recursive: true });
  await mkdir(join(workspacePath, "data"), { recursive: true });
  await mkdir(userDataPath, { recursive: true });
  await writeFile(
    join(workspacePath, "docs", "site-note.md"),
    [
      "# Launch Site Note",
      "",
      "- The downtown launch starts at 9:00 AM.",
      "- The venue has 80 reserved seats.",
      "- Catering requires a vegetarian count by Thursday.",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(workspacePath, "data", "launch-claims.csv"),
    [
      "claim,value",
      "start_time,10:30 AM",
      "reserved_seats,80",
      "vegetarian_count_due,Wednesday",
    ].join("\n"),
    "utf8",
  );
}

async function runPhase3Dogfood() {
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
    await setTextAreaValue(cdp, ".composer-input-wrap textarea", promptText);
    await waitForTextareaValue(cdp, ".composer-input-wrap textarea", promptText);
    await clickElement(cdp, "button[data-pattern-id='imitate_and_verify']");
    await waitForText(cdp, "Imitate and Verify");
    await setTextAreaValue(cdp, ".symphony-metric-editor textarea", metricText);
    await waitForTextareaValue(cdp, ".symphony-metric-editor textarea", metricText);
    await clickElement(cdp, "button[data-ui-required-action='composer-send']");

    const evidence = await waitForConductorEvidence(cdp);
    artifacts.desktopScreenshot = await writeScreenshot(cdp, "symphony-gap-phase3-desktop.png");
    artifacts.accessibilitySnapshot = await writeAccessibilitySnapshot(cdp, "symphony-gap-phase3-accessibility.json");

    await writeReport({
      schemaVersion: "ambient-symphony-gap-phase3-dogfood-v1",
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
      scenarios: ["symphony_gap_phase3_conductor_lock"],
      checks: evidence,
      artifacts,
    });
  } catch (error) {
    if (cdp) {
      try {
        artifacts.failureScreenshot = await writeScreenshot(cdp, "symphony-gap-phase3-failure.png");
      } catch {
        // Preserve the original failure.
      }
    }
    await writeReport({
      schemaVersion: "ambient-symphony-gap-phase3-dogfood-v1",
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
      scenarios: ["symphony_gap_phase3_conductor_lock"],
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

async function waitForConductorEvidence(cdp) {
  const started = Date.now();
  let lastEvidence = {};
  while (Date.now() - started < 180_000) {
    const evidence = readConductorEvidence();
    lastEvidence = evidence;
    if (evidence.forbiddenParentToolNames.length > 0) {
      throw new Error(`Symphony parent used forbidden worker tools: ${evidence.forbiddenParentToolNames.join(", ")}`);
    }
    if (evidence.workflowLaunchVerified) {
      await waitForText(cdp, "Symphony");
      return {
        ...evidence,
        recoveryCardVisible: await pageHasText(cdp, "Symphony recovery"),
        conductorLockProven: true,
      };
    }
    if (evidence.symphonyRecoveryVisible) {
      await waitForText(cdp, "Symphony recovery");
      return {
        ...evidence,
        recoveryCardVisible: true,
        conductorLockProven: true,
      };
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for Symphony conductor evidence. Last evidence: ${JSON.stringify(lastEvidence, null, 2)}`);
}

function readConductorEvidence() {
  const messages = readPersistedMessages();
  const tasks = readCallableWorkflowTasks();
  const parentThreadId = tasks[0]?.parent_thread_id ??
    messages.find((row) => row.role === "user" && row.content === promptText)?.threadId;
  const parentMessages = parentThreadId
    ? messages.filter((row) => row.threadId === parentThreadId)
    : messages;
  const toolNames = parentMessages
    .map((row) => parseJson(row.metadataJson).toolName)
    .filter((toolName) => typeof toolName === "string");
  const forbiddenParentToolNames = [...new Set(toolNames.filter((toolName) => forbiddenParentTools.includes(toolName)))];
  const recoveryMessages = parentMessages
    .filter((row) => Boolean(parseJson(row.metadataJson).symphonyParentModeRecovery));
  const expectedTasks = tasks.filter((task) =>
    task.tool_name === expectedWorkflowTool &&
    task.source_kind === "symphony_recipe"
  );
  return {
    messageCount: parentMessages.length,
    totalMessageCount: messages.length,
    parentThreadId,
    taskCount: tasks.length,
    toolNames,
    forbiddenParentToolNames,
    expectedWorkflowTool,
    workflowLaunchVerified: expectedTasks.length === 1 && tasks.length === 1,
    expectedTasks: expectedTasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      parentThreadId: task.parent_thread_id,
      parentRunId: task.parent_run_id,
    })),
    symphonyRecoveryVisible: recoveryMessages.length > 0,
    recoveryMessages: recoveryMessages.map((row) => ({
      id: row.id,
      content: row.content,
      recovery: parseJson(row.metadataJson).symphonyParentModeRecovery,
    })),
  };
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

async function pageHasText(cdp, text) {
  return evaluate(cdp, (expected) => document.body.innerText.includes(expected), text);
}

async function waitForTextareaValue(cdp, selector, expectedValue) {
  await waitFor(cdp, (targetSelector, value) => {
    const textarea = document.querySelector(targetSelector);
    return textarea instanceof HTMLTextAreaElement && textarea.value === value;
  }, selector, expectedValue);
}

function readPersistedMessages() {
  const dbPath = dogfoodStateDbPath();
  if (!existsSync(dbPath)) return [];
  const sql = [
    "SELECT id, thread_id as threadId, role, content, metadata_json as metadataJson",
    "FROM messages",
    "ORDER BY created_at ASC, rowid ASC",
  ].join(" ");
  return readSqlJson(dbPath, sql);
}

function readCallableWorkflowTasks() {
  const dbPath = dogfoodStateDbPath();
  if (!existsSync(dbPath)) return [];
  return readSqlJson(dbPath, "SELECT * FROM callable_workflow_tasks ORDER BY created_at ASC, id ASC");
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
  await mkdir(dirname(latestArtifactPath), { recursive: true });
  await writeFile(latestArtifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
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
