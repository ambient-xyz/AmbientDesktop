#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { access, chmod, cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = process.cwd();
const resultsDir = join(repoRoot, "test-results", "agent-memory-repair-resident-conflict");
const latestReportPath = join(resultsDir, "latest.json");
const modelRootRelativePath = ".ambient/memory/tencentdb/embeddings/models";
const serverStateRelativePath = ".ambient/memory/tencentdb/embeddings/llama-server";
const runtimeRootRelativePath = ".ambient/vision/minicpm-v/runtime";
const modelRepoPath = "ggml-org--embeddinggemma-300m-qat-q8_0-GGUF";
const modelRevision = "66f974f8cd48cc3b9c41c516b95508e75b4bee64";
const modelFilename = "embeddinggemma-300m-qat-Q8_0.gguf";
const modelAlias = "embeddinggemma-300m-q8_0";
const defaultDogfoodProvider = "ambient";
const defaultDogfoodModel = "moonshotai/kimi-k2.7-code";
const cdpCommandTimeoutMs = 15_000;
const appWaitTimeoutMs = 60_000;
const repairWaitTimeoutMs = 180_000;

const startedAt = new Date().toISOString();
const startedMs = Date.now();
const artifacts = {};
const checks = {};
let exitCode = 0;

try {
  await rm(latestReportPath, { force: true });
  await mkdir(resultsDir, { recursive: true });
  const sourceManagedRoot = await resolveSourceManagedRoot();
  checks.sourceManagedRoot = sourceManagedRoot;

  await run("pnpm", ["run", "prepare:electron-native"], buildDogfoodEnv());

  const safeOrphan = await runSafeOrphanCase(sourceManagedRoot);
  checks.safeOrphan = safeOrphan.checks;
  Object.assign(artifacts, safeOrphan.artifacts);

  const externalRuntime = await runExternalRuntimeCase(sourceManagedRoot);
  checks.externalRuntime = externalRuntime.checks;
  Object.assign(artifacts, externalRuntime.artifacts);

  await writeReport({
    schemaVersion: "ambient-agent-memory-repair-resident-conflict-dogfood-v1",
    status: "passed",
    classification: "passed",
    generatedAt: new Date().toISOString(),
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    gitCommit: gitValue(["rev-parse", "HEAD"]),
    gitBranch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
    provider: process.env.AMBIENT_PROVIDER || defaultDogfoodProvider,
    model: process.env.AMBIENT_LIVE_MODEL || process.env.GMI_CLOUD_MODEL || process.env.AMBIENT_MODEL || defaultDogfoodModel,
    headful: true,
    cdpPort: dogfoodCdpPort(),
    scenarios: [
      "agent_memory_safe_orphan_repair",
      "agent_memory_external_runtime_repair_blocked",
    ],
    artifacts,
    checks,
  });
} catch (error) {
  exitCode = 1;
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  checks.error = message;
  await writeReport({
    schemaVersion: "ambient-agent-memory-repair-resident-conflict-dogfood-v1",
    status: "failed",
    classification: "failed",
    generatedAt: new Date().toISOString(),
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    gitCommit: gitValue(["rev-parse", "HEAD"]),
    gitBranch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
    provider: process.env.AMBIENT_PROVIDER || defaultDogfoodProvider,
    model: process.env.AMBIENT_LIVE_MODEL || process.env.GMI_CLOUD_MODEL || process.env.AMBIENT_MODEL || defaultDogfoodModel,
    headful: true,
    cdpPort: cdpPortFromEnv() ?? -1,
    scenarios: [
      "agent_memory_safe_orphan_repair",
      "agent_memory_external_runtime_repair_blocked",
    ],
    artifacts,
    checks,
    error: message,
  });
  process.stderr.write(`${message}\n`);
} finally {
  try {
    await run("pnpm", ["run", "prepare:node-native"], buildDogfoodEnv());
  } catch (error) {
    exitCode = 1;
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  }
}

process.exit(exitCode);

async function runSafeOrphanCase(sourceManagedRoot) {
  const scratch = await createScratch("safe-orphan");
  const caseArtifacts = {};
  const caseChecks = {};
  let app;
  let cdp;
  let seeded;
  try {
    const assets = await prepareManagedAssets(sourceManagedRoot, scratch.managedRoot);
    assertNoExistingLlamaResidents("safe orphan repair");
    seeded = await spawnDetachedOrphanLlama({
      runtimeBinaryPath: assets.runtimeBinaryPath,
      modelPath: assets.modelPath,
      port: await getAvailablePort(),
    });
    caseChecks.seededPid = seeded.pid;
    caseChecks.seededPpid = await processPpid(seeded.pid);
    caseChecks.seededEndpoint = `http://127.0.0.1:${seeded.port}`;
    if (caseChecks.seededPpid !== 1 && process.platform !== "win32") {
      throw new Error(`Safe orphan seed PID ${seeded.pid} was not reparented to PID 1; got PPID ${caseChecks.seededPpid}.`);
    }

    app = launchDesktop({ workspacePath: scratch.workspacePath, userDataPath: scratch.userDataPath, managedRoot: scratch.managedRoot });
    cdp = await connectToElectron(dogfoodCdpPort(), app);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await setViewport(cdp, 1440, 900);
    await openAgentMemorySettings(cdp);
    await clickByAriaLabel(cdp, "Repair Agent Memory health");
    await waitForText(cdp, "Ready", repairWaitTimeoutMs);
    await waitForText(cdp, "Embeddings: ready", repairWaitTimeoutMs);
    await waitForText(cdp, "resident-cleanup", repairWaitTimeoutMs);
    if (await processAlive(seeded.pid)) {
      throw new Error(`Safe orphan PID ${seeded.pid} was still alive after Agent Memory repair.`);
    }
    caseArtifacts.safeOrphanReadyScreenshot = await writeScreenshot(cdp, "safe-orphan-ready.png");
    const readyText = await bodyText(cdp);
    caseChecks.readyTextIncludesCleanup = readyText.includes("resident-cleanup");
    caseChecks.readyTextIncludesStopped = readyText.includes("Stopped 1 orphaned Ambient memory embedding runtime");
    if (!caseChecks.readyTextIncludesCleanup || !caseChecks.readyTextIncludesStopped) {
      throw new Error("Safe orphan repair did not expose resident-cleanup and stopped-runtime evidence in the Agent Memory operation log.");
    }
    caseChecks.seededPidAliveAfterRepair = await processAlive(seeded.pid);

    await setMemoryModeFromUi(cdp, "disabled");
    await waitForText(cdp, "Agent Memory is off.", appWaitTimeoutMs);
    await waitForNoScratchEmbeddingRuntime(scratch.managedRoot);
    caseChecks.disableStoppedScratchRuntime = true;
    caseArtifacts.safeOrphanDisabledScreenshot = await writeScreenshot(cdp, "safe-orphan-disabled.png");
    return { artifacts: caseArtifacts, checks: caseChecks };
  } catch (error) {
    if (cdp) {
      caseArtifacts.safeOrphanFailureScreenshot = await writeScreenshot(cdp, "safe-orphan-failure.png").catch(() => undefined);
      artifacts.safeOrphanFailureScreenshot = caseArtifacts.safeOrphanFailureScreenshot;
    }
    throw error;
  } finally {
    cdp?.close();
    await terminateApp(app);
    if (seeded?.pid) await killPid(seeded.pid);
    await killScratchEmbeddingRuntimes(scratch.managedRoot);
    await cleanupScratch(scratch.root);
  }
}

async function runExternalRuntimeCase(sourceManagedRoot) {
  const scratch = await createScratch("external-runtime");
  const caseArtifacts = {};
  const caseChecks = {};
  let app;
  let cdp;
  let seeded;
  try {
    const assets = await prepareManagedAssets(sourceManagedRoot, scratch.managedRoot);
    assertNoExistingLlamaResidents("external runtime repair");
    const externalModelPath = join(scratch.root, "external", modelFilename);
    await mkdir(dirname(externalModelPath), { recursive: true });
    await cp(assets.modelPath, externalModelPath, { force: true });
    seeded = await spawnDirectLlama({
      runtimeBinaryPath: assets.runtimeBinaryPath,
      modelPath: externalModelPath,
      port: await getAvailablePort(),
    });
    caseChecks.seededPid = seeded.pid;
    caseChecks.seededPpid = await processPpid(seeded.pid);
    caseChecks.seededEndpoint = `http://127.0.0.1:${seeded.port}`;
    caseChecks.seededModelPath = externalModelPath;

    app = launchDesktop({ workspacePath: scratch.workspacePath, userDataPath: scratch.userDataPath, managedRoot: scratch.managedRoot });
    cdp = await connectToElectron(dogfoodCdpPort(), app);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await setViewport(cdp, 1440, 900);
    await openAgentMemorySettings(cdp);
    await clickByAriaLabel(cdp, "Repair Agent Memory health");
    await waitForText(cdp, "Needs repair", appWaitTimeoutMs);
    await waitForText(cdp, "Ambient will not stop external or active llama.cpp runtimes automatically", appWaitTimeoutMs);
    caseArtifacts.externalNeedsRepairScreenshot = await writeScreenshot(cdp, "external-runtime-needs-repair.png");

    await clickByAriaLabel(cdp, "Repair Agent Memory health");
    await waitForText(cdp, "Needs repair", appWaitTimeoutMs);
    await waitForText(cdp, "Ambient will not stop it automatically", appWaitTimeoutMs);
    await waitForText(cdp, "resident-cleanup", appWaitTimeoutMs);
    if (!await processAlive(seeded.pid)) {
      throw new Error(`External runtime PID ${seeded.pid} was stopped by Agent Memory repair.`);
    }
    caseArtifacts.externalBlockedScreenshot = await writeScreenshot(cdp, "external-runtime-blocked.png");
    const blockedText = await bodyText(cdp);
    caseChecks.blockedTextIncludesCleanup = blockedText.includes("resident-cleanup");
    caseChecks.blockedTextIncludesCleanupBlocker = blockedText.includes("Ambient will not stop it automatically");
    if (!caseChecks.blockedTextIncludesCleanup || !caseChecks.blockedTextIncludesCleanupBlocker) {
      throw new Error("External runtime repair did not expose resident-cleanup and external-runtime guidance in the Agent Memory operation log.");
    }
    caseChecks.seededPidAliveAfterRepair = await processAlive(seeded.pid);
    await killPid(seeded.pid);
    caseChecks.seededPidAliveAfterManualCleanup = await processAlive(seeded.pid);
    return { artifacts: caseArtifacts, checks: caseChecks };
  } catch (error) {
    if (cdp) {
      caseArtifacts.externalFailureScreenshot = await writeScreenshot(cdp, "external-runtime-failure.png").catch(() => undefined);
      artifacts.externalFailureScreenshot = caseArtifacts.externalFailureScreenshot;
    }
    throw error;
  } finally {
    cdp?.close();
    await terminateApp(app);
    if (seeded?.pid) await killPid(seeded.pid);
    await killScratchEmbeddingRuntimes(scratch.managedRoot);
    await cleanupScratch(scratch.root);
  }
}

async function createScratch(label) {
  const root = await mkdtemp(join(tmpdir(), `ambient-memory-repair-${label}-`));
  const workspacePath = join(root, "workspace");
  const userDataPath = join(root, "userData");
  const managedRoot = join(userDataPath, "managed-installs");
  await mkdir(workspacePath, { recursive: true });
  await mkdir(managedRoot, { recursive: true });
  return { root, workspacePath, userDataPath, managedRoot };
}

async function cleanupScratch(root) {
  if (process.env.AMBIENT_AGENT_MEMORY_REPAIR_DOGFOOD_KEEP_SCRATCH === "1") {
    process.stdout.write(`Agent Memory repair dogfood scratch retained at ${root}\n`);
    return;
  }
  await rm(root, { recursive: true, force: true });
}

async function resolveSourceManagedRoot() {
  const candidates = await sourceManagedRootCandidates();
  const checked = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = resolve(candidate);
    if (checked.includes(resolved)) continue;
    checked.push(resolved);
    if (await hasRequiredManagedAssets(resolved)) return resolved;
  }
  throw new Error(`Harness environment preflight failed: could not find installed Agent Memory managed assets. Checked: ${checked.join(", ")}`);
}

async function sourceManagedRootCandidates() {
  return [
    process.env.AMBIENT_AGENT_MEMORY_REPAIR_SOURCE_MANAGED_ROOT,
    process.env.AMBIENT_AGENT_MEMORY_REPAIR_SOURCE_USER_DATA
      ? join(process.env.AMBIENT_AGENT_MEMORY_REPAIR_SOURCE_USER_DATA, "managed-installs")
      : undefined,
    process.env.AMBIENT_E2E_USER_DATA
      ? join(process.env.AMBIENT_E2E_USER_DATA, "managed-installs")
      : undefined,
    join(homedir(), "Library", "Application Support", "Ambient Desktop", "managed-installs"),
  ].filter((value) => typeof value === "string" && value.trim());
}

async function hasRequiredManagedAssets(managedRoot) {
  try {
    await findRuntimeBinary(managedRoot);
    await findModelPath(managedRoot);
    return true;
  } catch {
    return false;
  }
}

async function prepareManagedAssets(sourceManagedRoot, scratchManagedRoot) {
  await copyManagedSubtree(sourceManagedRoot, scratchManagedRoot, runtimeRootRelativePath);
  await copyManagedSubtree(sourceManagedRoot, scratchManagedRoot, modelRootRelativePath);
  await rm(join(scratchManagedRoot, serverStateRelativePath), { recursive: true, force: true });
  const runtimeBinaryPath = await findRuntimeBinary(scratchManagedRoot);
  const modelPath = await findModelPath(scratchManagedRoot);
  await chmod(runtimeBinaryPath, 0o755).catch(() => undefined);
  return { runtimeBinaryPath, modelPath };
}

async function copyManagedSubtree(sourceManagedRoot, scratchManagedRoot, relativePath) {
  const source = join(sourceManagedRoot, relativePath);
  const destination = join(scratchManagedRoot, relativePath);
  await access(source);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true, errorOnExist: false });
}

async function findRuntimeBinary(managedRoot) {
  const root = join(managedRoot, runtimeRootRelativePath);
  const paths = (await walkFiles(root))
    .filter((path) => basename(path) === "llama-server" || basename(path) === "llama-server.exe")
    .sort((left, right) => runtimePreference(right) - runtimePreference(left) || left.localeCompare(right));
  if (!paths[0]) throw new Error(`No llama-server runtime binary found under ${root}.`);
  return paths[0];
}

function runtimePreference(path) {
  let score = 0;
  if (path.includes("macos-arm64-metal")) score += 4;
  if (path.includes("/llama-")) score += 2;
  if (path.endsWith("/llama-server")) score += 1;
  return score;
}

async function findModelPath(managedRoot) {
  const exact = join(managedRoot, modelRootRelativePath, modelRepoPath, modelRevision, modelFilename);
  if (existsSync(exact)) return exact;
  const root = join(managedRoot, modelRootRelativePath);
  const paths = (await walkFiles(root))
    .filter((path) => /embeddinggemma-300m.*\.gguf$/i.test(path))
    .sort();
  if (!paths[0]) throw new Error(`No EmbeddingGemma GGUF found under ${root}.`);
  const details = await stat(paths[0]);
  if (!details.isFile() || details.size < 100_000_000) {
    throw new Error(`EmbeddingGemma candidate is not a valid model file: ${paths[0]}.`);
  }
  return paths[0];
}

async function walkFiles(root) {
  const files = [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function spawnDetachedOrphanLlama(input) {
  const args = llamaServerArgs(input);
  const launcherSource = [
    "const { spawn } = require('node:child_process');",
    `const child = spawn(${JSON.stringify(input.runtimeBinaryPath)}, ${JSON.stringify(args)}, { detached: true, stdio: 'ignore' });`,
    "child.unref();",
    "console.log(child.pid);",
  ].join("\n");
  const result = await runCapture(process.execPath, ["-e", launcherSource]);
  const pid = Number(result.stdout.trim().split(/\s+/).pop());
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Could not read detached llama-server PID from launcher output: ${result.stdout}`);
  }
  await waitForProcessAlive(pid);
  await waitForTcp(input.port, 120_000);
  await waitForPpid(pid, 1, 10_000);
  return { pid, port: input.port };
}

async function spawnDirectLlama(input) {
  const child = spawn(input.runtimeBinaryPath, llamaServerArgs(input), {
    cwd: repoRoot,
    detached: process.platform !== "win32",
    stdio: "ignore",
  });
  if (!child.pid) throw new Error("Could not spawn external llama-server process.");
  await waitForProcessAlive(child.pid);
  await waitForTcp(input.port, 120_000);
  return { pid: child.pid, child, port: input.port };
}

function llamaServerArgs(input) {
  return [
    "--model",
    input.modelPath,
    "--host",
    "127.0.0.1",
    "--port",
    String(input.port),
    "-c",
    "2048",
    "-ngl",
    "99",
    "--embedding",
    "--alias",
    modelAlias,
  ];
}

function launchDesktop(input) {
  return spawn("pnpm", [
    "exec",
    "electron-vite",
    "dev",
    "--",
    `--remote-debugging-port=${dogfoodCdpPort()}`,
  ], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    env: buildDogfoodEnv({
      AMBIENT_E2E: "1",
      AMBIENT_DESKTOP_WORKSPACE: input.workspacePath,
      AMBIENT_E2E_USER_DATA: input.userDataPath,
      AMBIENT_MANAGED_INSTALL_ROOT: input.managedRoot,
    }),
  });
}

async function openAgentMemorySettings(cdp) {
  await waitForText(cdp, "Ambient", appWaitTimeoutMs);
  await clickByText(cdp, "button", "Settings");
  await waitFor(cdp, () => Boolean(document.querySelector(".settings-shell")), appWaitTimeoutMs);
  await setSettingsSearch(cdp, "memo");
  await waitForText(cdp, "Agent Memory", appWaitTimeoutMs);
}

async function clickByText(cdp, selector, text) {
  await waitFor(cdp, (query, expected) => {
    const elements = [...document.querySelectorAll(query)];
    const element = elements.find((candidate) => candidate instanceof HTMLElement && candidate.innerText.trim() === expected);
    if (!element || !(element instanceof HTMLElement)) return false;
    element.click();
    return true;
  }, appWaitTimeoutMs, selector, text);
}

async function clickByAriaLabel(cdp, label) {
  await waitFor(cdp, (expected) => {
    const elements = [...document.querySelectorAll("[aria-label]")];
    const element = elements.find((candidate) => candidate.getAttribute("aria-label") === expected);
    if (!element || !(element instanceof HTMLElement)) return false;
    if ("disabled" in element && element.disabled) return false;
    element.click();
    return true;
  }, appWaitTimeoutMs, label);
}

async function setSettingsSearch(cdp, query) {
  await waitFor(cdp, () => Boolean(document.querySelector(".settings-search input")), appWaitTimeoutMs);
  await evaluate(cdp, (value) => {
    const input = document.querySelector(".settings-search input");
    if (!(input instanceof HTMLInputElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
    return input.value === value;
  }, query);
}

async function setMemoryModeFromUi(cdp, mode) {
  await waitFor(cdp, (expected) => {
    const select = [...document.querySelectorAll("select")]
      .find((candidate) => candidate.getAttribute("aria-label") === "Agent Memory mode");
    if (!(select instanceof HTMLSelectElement)) return false;
    select.value = expected;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return select.value === expected;
  }, appWaitTimeoutMs, mode);
  await waitFor(cdp, async (expected) => {
    const state = await window.ambientDesktop.bootstrap();
    return state.settings?.memory?.mode === expected;
  }, appWaitTimeoutMs, mode);
}

async function connectToElectron(port, app) {
  const started = Date.now();
  let lastOutput = "";
  app.stdout?.on("data", (chunk) => {
    lastOutput = `${lastOutput}${chunk.toString()}`.slice(-8000);
  });
  app.stderr?.on("data", (chunk) => {
    lastOutput = `${lastOutput}${chunk.toString()}`.slice(-8000);
  });

  while (Date.now() - started < 60_000) {
    if (app.exitCode !== null) {
      throw new Error(`Electron exited before CDP was available.\n${lastOutput}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
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
    send(method, params = {}, options = {}) {
      const id = nextId++;
      const timeoutMs = options.timeoutMs ?? cdpCommandTimeoutMs;
      const ready = socket.readyState === WebSocket.OPEN
        ? Promise.resolve()
        : new Promise((resolveReady, rejectReady) => {
          const timeout = setTimeout(() => {
            rejectReady(new Error(`Timed out waiting for CDP socket open after ${timeoutMs}ms.`));
          }, timeoutMs);
          socket.addEventListener("open", () => {
            clearTimeout(timeout);
            resolveReady();
          }, { once: true });
          socket.addEventListener("error", () => {
            clearTimeout(timeout);
            rejectReady(new Error("CDP socket failed to open."));
          }, { once: true });
        });
      return ready.then(() => new Promise((resolveCommand, rejectCommand) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          rejectCommand(new Error(`Timed out waiting for CDP ${method} after ${timeoutMs}ms.`));
        }, timeoutMs);
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

async function waitForText(cdp, text, timeoutMs) {
  await waitFor(cdp, (expected) => document.body.innerText.includes(expected), timeoutMs, text);
}

async function waitFor(cdp, predicate, timeoutMs, ...args) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(cdp, predicate, ...args)) return;
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for Electron UI condition.${lastError ? ` Last error: ${lastError.message}` : ""}`);
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

async function bodyText(cdp) {
  return evaluate(cdp, () => document.body.innerText);
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
  const result = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true }, { timeoutMs: 30_000 });
  const outputPath = join(resultsDir, name);
  await writeFile(outputPath, Buffer.from(result.data, "base64"));
  return outputPathRelative(outputPath);
}

async function waitForNoScratchEmbeddingRuntime(managedRoot) {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const pids = scratchEmbeddingRuntimePids(managedRoot);
    if (pids.length === 0) return;
    await delay(500);
  }
  throw new Error(`Timed out waiting for scratch Agent Memory embedding runtimes to stop under ${managedRoot}.`);
}

async function killScratchEmbeddingRuntimes(managedRoot) {
  for (const pid of scratchEmbeddingRuntimePids(managedRoot)) {
    await killPid(pid);
  }
}

function scratchEmbeddingRuntimePids(managedRoot) {
  const result = spawnSync("ps", ["-axo", "pid=,command="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      return match ? { pid: Number(match[1]), command: match[2] } : undefined;
    })
    .filter(Boolean)
    .filter((process) =>
      process.command.includes(managedRoot) &&
      process.command.includes("embeddinggemma-300m") &&
      /llama-server/i.test(process.command)
    )
    .map((process) => process.pid);
}

function assertNoExistingLlamaResidents(label) {
  if (process.env.AMBIENT_AGENT_MEMORY_REPAIR_DOGFOOD_ALLOW_EXISTING_LLAMA === "1") return;
  const residents = existingLlamaResidentProcesses();
  if (residents.length === 0) return;
  const preview = residents
    .slice(0, 5)
    .map((process) => residentProcessSummary(process))
    .join("; ");
  throw new Error(
    `Harness environment preflight failed: unrelated resident llama.cpp processes are running before ${label}. ` +
    `Stop them before running Agent Memory repair dogfood, or set AMBIENT_AGENT_MEMORY_REPAIR_DOGFOOD_ALLOW_EXISTING_LLAMA=1 only for deliberate non-isolated debugging. Residents: ${preview}`,
    );
}

function residentProcessSummary(process) {
  const executable = basename((process.command.trim().split(/\s+/)[0] ?? "llama-server").replace(/^['"]|['"]$/g, ""));
  const modelMatch = process.command.match(/(?:--model|-m)\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  const model = modelMatch ? basename((modelMatch[1] ?? modelMatch[2] ?? modelMatch[3] ?? "").replace(/^['"]|['"]$/g, "")) : undefined;
  return `${process.pid}:${executable}${model ? ` model=${model}` : ""}`;
}

function existingLlamaResidentProcesses() {
  const result = spawnSync("ps", ["-axo", "pid=,command="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      return match ? { pid: Number(match[1]), command: match[2] } : undefined;
    })
    .filter(Boolean)
    .filter((resident) =>
      resident.pid !== process.pid &&
      /\bllama-server\b/i.test(resident.command) &&
      (resident.command.includes("--model") || resident.command.includes(" -m ") || resident.command.includes(".gguf"))
    );
}

async function getAvailablePort() {
  const excludedPort = cdpPortFromEnv();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = createServer();
    await new Promise((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", () => resolveListen());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not allocate a local TCP port.");
    const port = address.port;
    await new Promise((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
    if (port !== excludedPort) return port;
  }
  throw new Error(`Could not allocate a local TCP port distinct from the harness CDP port ${excludedPort}.`);
}

async function waitForTcp(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await canConnect(port)) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for llama-server TCP port ${port}.`);
}

function canConnect(port) {
  return new Promise((resolveConnect) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolveConnect(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolveConnect(false);
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolveConnect(false);
    });
  });
}

async function waitForProcessAlive(pid) {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    if (await processAlive(pid)) return;
    await delay(100);
  }
  throw new Error(`Process ${pid} did not become visible.`);
}

async function waitForPpid(pid, expectedPpid, timeoutMs) {
  if (process.platform === "win32") return;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await processPpid(pid) === expectedPpid) return;
    await delay(100);
  }
  throw new Error(`Process ${pid} was not reparented to PID ${expectedPpid}.`);
}

async function processPpid(pid) {
  const result = spawnSync("ps", ["-o", "ppid=", "-p", String(pid)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return undefined;
  const parsed = Number(result.stdout.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

async function processAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function killPid(pid) {
  if (!await processAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // The process may have exited.
  }
  await delay(1000);
  if (!await processAlive(pid)) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Best effort cleanup.
  }
  await delay(250);
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
    // Fall back to direct child signaling.
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

async function run(command, args, env) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env,
  });
  const [code, signal] = await once(child, "exit");
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} failed with ${signal ?? code}.`);
}

async function runCapture(command, args) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: cleanChildEnv(process.env),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  const [code, signal] = await once(child, "exit");
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} failed with ${signal ?? code}.\n${stderr}`);
  return { stdout, stderr };
}

function buildDogfoodEnv(extra = {}) {
  const providerId = process.env.AMBIENT_PROVIDER || defaultDogfoodProvider;
  const modelId = providerId === "gmi-cloud"
    ? process.env.GMI_CLOUD_MODEL || process.env.AMBIENT_MODEL || defaultDogfoodModel
    : process.env.AMBIENT_LIVE_MODEL || process.env.AMBIENT_MODEL || defaultDogfoodModel;
  return cleanChildEnv({
    ...process.env,
    ...extra,
    AMBIENT_PROVIDER: providerId,
    ...(providerId === "gmi-cloud" ? { GMI_CLOUD_MODEL: modelId } : { AMBIENT_LIVE_MODEL: modelId }),
  });
}

function cleanChildEnv(env) {
  const next = { ...env };
  delete next.NODE_OPTIONS;
  delete next.VITEST;
  return next;
}

function dogfoodCdpPort() {
  return cdpPortFromEnv() ?? failMissingCdpPort();
}

function cdpPortFromEnv() {
  const raw = process.env.AMBIENT_HARNESS_CDP_PORT || process.env.AMBIENT_AGENT_MEMORY_REPAIR_CDP_PORT;
  if (!raw) return undefined;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`AMBIENT_HARNESS_CDP_PORT must be a TCP port, got ${raw}.`);
  }
  return port;
}

function failMissingCdpPort() {
  throw new Error("AMBIENT_HARNESS_CDP_PORT is required; run through scripts/run-electron-dogfood.mjs.");
}

function gitValue(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

async function writeReport(report) {
  await mkdir(resultsDir, { recursive: true });
  await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function outputPathRelative(path) {
  const absolute = resolve(path);
  return absolute.startsWith(`${repoRoot}/`) ? absolute.slice(repoRoot.length + 1) : relative(repoRoot, absolute);
}
