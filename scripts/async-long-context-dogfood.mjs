#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = process.cwd();
const resultsDir = join(repoRoot, "test-results", "async-long-context-dogfood");
const latestArtifactPath = join(resultsDir, "latest.json");
const DEFAULT_DOGFOOD_PROVIDER = "ambient";
const DEFAULT_DOGFOOD_MODEL = "example/model-id";
const cdpCommandTimeoutMs = 10_000;
const gutenbergFiles = [
  {
    title: "Pride and Prejudice",
    path: "gutenberg/pride-and-prejudice.txt",
    url: "https://www.gutenberg.org/cache/epub/1342/pg1342.txt",
  },
  {
    title: "Frankenstein",
    path: "gutenberg/frankenstein.txt",
    url: "https://www.gutenberg.org/cache/epub/84/pg84.txt",
  },
];
const longContextInputFile = {
  title: "Pride and Prejudice / Frankenstein opening sample",
  path: "gutenberg/two-book-openings.txt",
};

const promptText = [
  "This is a live Ambient async long-context dogfood.",
  "First use a shell tool to create ./gutenberg, download these full Project Gutenberg UTF-8 texts into the exact workspace paths shown, and then create a derived long-context input file from both downloads:",
  "`curl -L --retry 3 https://www.gutenberg.org/cache/epub/1342/pg1342.txt -o gutenberg/pride-and-prejudice.txt`,",
  "`curl -L --retry 3 https://www.gutenberg.org/cache/epub/84/pg84.txt -o gutenberg/frankenstein.txt`,",
  "and create `gutenberg/two-book-openings.txt` by taking about the first 90000 characters from each downloaded text with clear title separators.",
  "Then call long_context_start, not long_context_process, with workspacePaths [`gutenberg/two-book-openings.txt`], taskType `summarization`, contextWindowChars 250000, maxModelCalls 4, maxOutputChars 2000, yield_ms around 500, poll_hint_ms around 1500, and an instruction to compare the two books in a concise synthesis that names Pride and Prejudice, Frankenstein, and one shared theme.",
  "Immediately schedule thread_wake_schedule with after_ms around 1500, the returned job_id, reason `poll async long-context Gutenberg dogfood`, and payload {\"job_kind\":\"long_context\"}.",
  "In the first response, only say the async long-context job started and the wake was scheduled.",
  "When the scheduled wake continuation runs, call long_context_poll with wait_ms up to 5000 until the job completes.",
  "Then reply with `ASYNC_LONG_CONTEXT_DOGFOOD_DONE` and mention Pride and Prejudice, Frankenstein, and the shared theme.",
  "Do not call long_context_process.",
].join(" ");

let exitCode = 0;
let dogfoodEnv;
let context;

try {
  await rm(latestArtifactPath, { force: true });
  context = await createScratchContext();
  await seedWorkspace(context);
  dogfoodEnv = buildDogfoodEnv(context);
  await run("pnpm", ["run", "prepare:electron-native"], dogfoodEnv);
  await runAsyncLongContextDogfood(context);
} catch (error) {
  exitCode = 1;
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
} finally {
  try {
    await run("pnpm", ["run", "prepare:node-native"], dogfoodEnv ?? (context ? buildDogfoodEnv(context) : cleanChildEnv(process.env)));
  } catch (error) {
    exitCode = 1;
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  }
  if (context && process.env.AMBIENT_ASYNC_LONG_CONTEXT_DOGFOOD_KEEP_SCRATCH !== "1") {
    await rm(context.scratchRoot, { recursive: true, force: true });
  } else if (context) {
    process.stdout.write(`Async long-context dogfood scratch retained at ${context.scratchRoot}\n`);
  }
}

process.exit(exitCode);

async function createScratchContext() {
  const scratchRoot = await mkdtemp(join(tmpdir(), "ambient-async-long-context-dogfood-"));
  const workspacePath = join(scratchRoot, "workspace");
  const userDataPath = join(scratchRoot, "userData");
  return {
    scratchRoot,
    workspacePath,
    userDataPath,
    authorityStateRoot: join(userDataPath, "authority-state"),
  };
}

async function seedWorkspace(input) {
  await mkdir(input.workspacePath, { recursive: true });
  await mkdir(input.userDataPath, { recursive: true });
  const sourceUserData = dogfoodSourceUserDataPath();
  if (sourceUserData) {
    await cp(sourceUserData, input.userDataPath, { recursive: true, force: true });
  }
  await writeFile(
    join(input.workspacePath, "README.md"),
    "# Async Long Context Dogfood\n\nThis workspace is disposable and downloads public-domain Gutenberg texts.\n",
    "utf8",
  );
}

function dogfoodSourceUserDataPath() {
  const value = process.env.AMBIENT_ASYNC_LONG_CONTEXT_DOGFOOD_SOURCE_USER_DATA || process.env.AMBIENT_E2E_USER_DATA;
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!existsSync(trimmed)) throw new Error("Configured async long-context dogfood source userData path does not exist.");
  return trimmed;
}

async function runAsyncLongContextDogfood(input) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const artifacts = {};
  let app;
  let cdp;
  try {
    const port = dogfoodCdpPort();
    app = launchDesktop(input, port);
    cdp = await connectToElectron(port, app);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await setViewport(cdp, 1440, 900);
    await waitForText(cdp, "Ambient", 45_000);
    await waitForText(cdp, expectedProviderLabel(), 45_000);
    const threadId = await createFullAccessDogfoodThread(cdp);
    await sendPromptToFullAccessThread(cdp, threadId);

    await waitForDogfoodCheck(
      input,
      cdp,
      (checks) =>
        checks.workspaceTextsReady &&
        checks.longContextInputReady &&
        checks.longContextStartUsed &&
        checks.wakeScheduleUsed &&
        checks.wakePayloadLongContext &&
        checks.asyncTranscriptHasProgress,
      "async long-context start/progress evidence",
      240_000,
    );
    artifacts.streamingScreenshot = await writeScreenshot(cdp, "async-long-context-streaming.png");
    await waitForDogfoodCheck(
      input,
      cdp,
      (checks) =>
        checks.longContextPollUsed &&
        checks.wakeDelivered &&
        checks.asyncTranscriptHasCompleted &&
        checks.asyncTranscriptHasResultArtifact &&
        checks.assistantHasFinalMarker,
      "async long-context final wake/poll evidence",
      600_000,
    );
    artifacts.finalScreenshot = await writeScreenshot(cdp, "async-long-context-final.png");

    const checks = await collectChecks(input, cdp);
    assertChecks(checks);
    await writeReport({
      schemaVersion: "ambient-async-long-context-dogfood-v1",
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
      scenarios: ["async_long_context_gutenberg_wake"],
      checks,
      artifacts,
    });
  } catch (error) {
    if (cdp) {
      try {
        artifacts.failureScreenshot = await writeScreenshot(cdp, "async-long-context-failure.png");
      } catch {
        // Preserve the original failure.
      }
    }
    await writeReport({
      schemaVersion: "ambient-async-long-context-dogfood-v1",
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
      scenarios: ["async_long_context_gutenberg_wake"],
      checks: await collectChecks(input, cdp).catch(() => ({})),
      artifacts,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    throw error;
  } finally {
    cdp?.close();
    await terminateApp(app);
  }
}

async function createFullAccessDogfoodThread(cdp) {
  const state = await evaluate(cdp, (model) => {
    return window.ambientDesktop.createThread({
      permissionMode: "full-access",
      collaborationMode: "agent",
      model,
      thinkingLevel: "low",
    });
  }, dogfoodModelId());
  if (!state?.activeThreadId) throw new Error("Async long-context dogfood could not create a full-access scratch thread.");
  await evaluate(cdp, (threadId) => {
    return window.ambientDesktop.requestThreadPermissionModeChange({
      threadId,
      permissionMode: "full-access",
      reason: "Async long-context dogfood needs deterministic full-access shell downloads before testing async long-context.",
    });
  }, state.activeThreadId);
  await evaluate(cdp, (threadId) => window.ambientDesktop.selectThread(threadId), state.activeThreadId);
  await waitFor(cdp, (threadId) => {
    return window.ambientDesktop.bootstrap().then((nextState) => {
      const activeThread = nextState.threads.find((candidate) => candidate.id === threadId);
      return nextState.activeThreadId === threadId &&
        nextState.settings.permissionMode === "full-access" &&
        activeThread?.permissionMode === "full-access";
    });
  }, [state.activeThreadId], 15_000);
  return state.activeThreadId;
}

async function sendPromptToFullAccessThread(cdp, threadId) {
  await evaluate(cdp, (input) => {
    window.__ambientAsyncLongContextDogfood = {
      sendResolved: false,
      error: undefined,
    };
    window.ambientDesktop.sendMessage({
      threadId: input.threadId,
      content: input.content,
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: input.model,
      thinkingLevel: "low",
    })
      .then(() => {
        window.__ambientAsyncLongContextDogfood.sendResolved = true;
      })
      .catch((error) => {
        window.__ambientAsyncLongContextDogfood.error = error instanceof Error ? error.message : String(error);
      });
    return true;
  }, { threadId, content: promptText, model: dogfoodModelId() });
}

async function collectChecks(input, cdp) {
  const bodyText = cdp ? await evaluate(cdp, () => document.body?.innerText ?? "") : "";
  const messages = readPersistedMessages(input);
  const assistantText = messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .join("\n");
  const wakeRows = readThreadWakeContinuations(input);
  const toolMessages = messages
    .map((message) => ({ ...message, metadata: parseJson(message.metadataJson) }))
    .filter((message) => message.role === "tool");
  const toolNames = toolMessages.map((message) => String(message.metadata.toolName ?? ""));
  const asyncTranscript = toolMessages
    .filter((message) => message.metadata.toolName === "long_context_async" || message.content.includes("long_context_async"))
    .map((message) => message.content)
    .join("\n");
  const fileChecks = await collectGutenbergFileChecks(input.workspacePath);
  const longContextInputCheck = await collectLongContextInputFileCheck(input.workspacePath);
  const lowerAssistant = assistantText.toLowerCase();
  return {
    bodyHasFinalMarker: bodyText.includes("ASYNC_LONG_CONTEXT_DOGFOOD_DONE"),
    assistantHasFinalMarker: assistantText.includes("ASYNC_LONG_CONTEXT_DOGFOOD_DONE"),
    assistantMentionsPride: lowerAssistant.includes("pride and prejudice"),
    assistantMentionsFrankenstein: lowerAssistant.includes("frankenstein"),
    toolNames,
    shellDownloadUsed: toolNames.includes("bash") || toolNames.includes("bash_start"),
    longContextStartUsed: toolNames.includes("long_context_start"),
    longContextPollUsed: toolNames.includes("long_context_poll"),
    longContextProcessUsed: toolNames.includes("long_context_process"),
    wakeScheduleUsed: toolNames.includes("thread_wake_schedule"),
    asyncTranscriptHasProgress: asyncTranscript.includes("status: running") || asyncTranscript.includes("progress:"),
    asyncTranscriptHasCompleted: asyncTranscript.includes("status: completed"),
    asyncTranscriptHasResultArtifact: asyncTranscript.includes("result_artifact:"),
    workspaceTextsReady: fileChecks.every((file) => file.exists && file.bytes > 100_000),
    longContextInputReady: longContextInputCheck.exists && longContextInputCheck.bytes > 150_000,
    gutenbergFiles: fileChecks,
    longContextInputFile: longContextInputCheck,
    wakeCount: wakeRows.length,
    wakeDelivered: wakeRows.some((row) => row.status === "delivered"),
    wakePayloadLongContext: wakeRows.some((row) => parseJson(row.payload_json)?.job_kind === "long_context"),
    wakeRows: wakeRows.map((row) => ({
      id: row.id,
      status: row.status,
      dueAt: row.due_at,
      jobId: row.job_id,
      reason: row.reason,
      payload: parseJson(row.payload_json),
    })),
  };
}

async function collectGutenbergFileChecks(workspacePath) {
  const checks = [];
  for (const file of gutenbergFiles) {
    const absolutePath = join(workspacePath, file.path);
    try {
      const info = await stat(absolutePath);
      checks.push({ title: file.title, path: file.path, exists: true, bytes: info.size });
    } catch {
      checks.push({ title: file.title, path: file.path, exists: false, bytes: 0 });
    }
  }
  return checks;
}

async function collectLongContextInputFileCheck(workspacePath) {
  const absolutePath = join(workspacePath, longContextInputFile.path);
  try {
    const info = await stat(absolutePath);
    return { ...longContextInputFile, exists: true, bytes: info.size };
  } catch {
    return { ...longContextInputFile, exists: false, bytes: 0 };
  }
}

function assertChecks(checks) {
  const failures = [];
  if (!checks.workspaceTextsReady) failures.push("Gutenberg text files were not downloaded into the workspace with expected sizes");
  if (!checks.longContextInputReady) failures.push("derived Gutenberg long-context input file was not created with expected size");
  if (!checks.shellDownloadUsed) failures.push("no shell tool was observed for Gutenberg downloads");
  if (!checks.longContextStartUsed) failures.push("long_context_start tool was not observed");
  if (checks.longContextProcessUsed) failures.push("long_context_process was observed; scenario requires async long_context_start");
  if (!checks.longContextPollUsed) failures.push("long_context_poll tool was not observed");
  if (!checks.wakeScheduleUsed) failures.push("thread_wake_schedule tool was not observed");
  if (!checks.wakePayloadLongContext) failures.push("thread wake payload did not include job_kind=long_context");
  if (!checks.asyncTranscriptHasProgress) failures.push("async long-context transcript did not show running/progress evidence");
  if (!checks.asyncTranscriptHasCompleted) failures.push("async long-context transcript did not show completed status");
  if (!checks.asyncTranscriptHasResultArtifact) failures.push("async long-context transcript did not include a result artifact");
  if (checks.wakeCount < 1) failures.push("no thread wake continuation row was persisted");
  if (!checks.wakeDelivered) failures.push("no thread wake continuation was delivered");
  if (!checks.assistantHasFinalMarker) failures.push("assistant never reported ASYNC_LONG_CONTEXT_DOGFOOD_DONE");
  if (!checks.assistantMentionsPride) failures.push("assistant final response did not mention Pride and Prejudice");
  if (!checks.assistantMentionsFrankenstein) failures.push("assistant final response did not mention Frankenstein");
  if (failures.length > 0) throw new Error(`Async long-context dogfood failed:\n- ${failures.join("\n- ")}`);
}

async function waitForDogfoodCheck(input, cdp, predicate, label, timeoutMs) {
  const started = Date.now();
  let latestChecks = {};
  while (Date.now() - started < timeoutMs) {
    latestChecks = await collectChecks(input, cdp);
    if (predicate(latestChecks)) return latestChecks;
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${label}. Latest checks: ${JSON.stringify(latestChecks, null, 2)}`);
}

function buildDogfoodEnv(input) {
  return cleanChildEnv({
    ...process.env,
    ...dogfoodProviderEnv(process.env),
    AMBIENT_DESKTOP_WORKSPACE: input.workspacePath,
    AMBIENT_E2E_USER_DATA: input.userDataPath,
    AMBIENT_AUTHORITY_STATE_ROOT: input.authorityStateRoot,
  });
}

function dogfoodProviderEnv(env) {
  const providerId = env.AMBIENT_PROVIDER || DEFAULT_DOGFOOD_PROVIDER;
  const modelId = env.AMBIENT_LIVE_MODEL || env.GMI_CLOUD_MODEL || env.AMBIENT_MODEL || DEFAULT_DOGFOOD_MODEL;
  return providerId === "gmi-cloud"
    ? { AMBIENT_PROVIDER: providerId, GMI_CLOUD_MODEL: modelId }
    : { AMBIENT_PROVIDER: providerId, AMBIENT_LIVE_MODEL: modelId };
}

function launchDesktop(input, port) {
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
      ...buildDogfoodEnv(input),
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

async function waitForText(cdp, text, timeoutMs = 20_000) {
  await waitFor(cdp, (expected) => document.body?.innerText?.includes(expected) ?? false, [text], timeoutMs);
}

async function waitFor(cdp, predicate, args = [], timeoutMs = 20_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(cdp, predicate, ...args)) return;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  const suffix = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for Electron UI condition.${suffix}`);
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

function readPersistedMessages(input) {
  const dbPath = dogfoodStateDbPath(input);
  if (!existsSync(dbPath)) return [];
  return readSqlJson(dbPath, [
    "SELECT id, thread_id as threadId, role, content, metadata_json as metadataJson",
    "FROM messages",
    "ORDER BY created_at ASC, rowid ASC",
  ].join(" "));
}

function readThreadWakeContinuations(input) {
  const dbPath = dogfoodStateDbPath(input);
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

function dogfoodStateDbPath(input) {
  const legacyDbPath = join(input.workspacePath, ".ambient-codex", "state.sqlite");
  const authorityDbPath = join(input.authorityStateRoot, "workspaces", authorityWorkspaceDirectoryName(input.workspacePath), "state.sqlite");
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

function dogfoodModelId() {
  return process.env.AMBIENT_LIVE_MODEL || process.env.GMI_CLOUD_MODEL || process.env.AMBIENT_MODEL || DEFAULT_DOGFOOD_MODEL;
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
