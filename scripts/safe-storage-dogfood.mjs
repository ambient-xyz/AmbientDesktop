#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = process.cwd();
const resultsDir = join(repoRoot, "test-results", "safe-storage-dogfood");
const latestReportPath = join(resultsDir, "latest.json");
const cdpCommandTimeoutMs = 20_000;
const appWaitTimeoutMs = 90_000;
const defaultDogfoodProvider = "ambient";
const defaultDogfoodModel = "example/model-id";

const args = parseArgs(process.argv.slice(2));
const startedAt = new Date().toISOString();
const startedMs = Date.now();
const checks = {};
const artifacts = {};
let exitCode = 0;
let failure;

try {
  await rm(latestReportPath, { force: true });
  await mkdir(resultsDir, { recursive: true });
  await run("pnpm", ["run", "prepare:electron-native"], buildDogfoodEnv());

  const scenarios = args.scenario === "safe-storage-release-gate"
    ? [
        "safe-storage-linux-basic-text-blocked",
        "safe-storage-linux-keyring-ready",
        "named-secret-rtx-login-save",
        "named-secret-brokered-local-fixture",
      ]
    : [args.scenario];

  for (const scenario of scenarios) {
    checks[scenario] = await runScenario(scenario);
  }
} catch (error) {
  exitCode = 1;
  failure = error instanceof Error ? error : new Error(String(error));
} finally {
  const report = {
    schemaVersion: "ambient-safe-storage-dogfood-v1",
    scenario: args.scenario,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    status: failure ? "failed" : "passed",
    checks,
    artifacts,
    ...(failure ? { failure: { message: failure.message, stack: failure.stack } } : {}),
  };
  await writeReport(report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (failure) {
  process.stderr.write(`${failure.stack ?? failure.message}\n`);
}
process.exit(exitCode);

async function runScenario(scenario) {
  const definition = scenarioDefinition(scenario);
  const scratch = await createScratch(scenario);
  let app;
  let cdp;
  try {
    app = launchDesktop({
      workspacePath: scratch.workspacePath,
      userDataPath: scratch.userDataPath,
      platform: "linux",
      backend: definition.backend,
    });
    cdp = await connectToElectron(dogfoodCdpPort(), app);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await setViewport(cdp, 1500, 950);
    await waitForText(cdp, "Ambient", appWaitTimeoutMs);

    const initial = await secureStorageSnapshot(cdp);
    if (definition.expectedStatus === "blocked") {
      assertEqual(initial.secureStorage.status, "blocked", `${scenario} secure storage status`);
      assertEqual(initial.secureStorage.reason, definition.expectedReason, `${scenario} blocked reason`);
      const blocked = await attemptNamedSecretSave(cdp, {
        label: "Blocked Linux keyring",
        value: redactedSecretValue(scenario),
        kind: "api-key",
        scope: "workspace",
      });
      if (blocked.ok) throw new Error(`${scenario} saved a named secret while secure storage was blocked.`);
      assertIncludes(blocked.message, "basic_text", `${scenario} blocked save error`);
      await openSettings(cdp, "secure storage");
      await waitForText(cdp, "Secure storage blocked", appWaitTimeoutMs);
      assertNotVisible(await bodyText(cdp), redactedSecretValue(scenario), `${scenario} renderer text`);
      const screenshot = await writeScreenshot(cdp, `${scenario}.png`);
      return { secureStorage: initial.secureStorage, repairCommandCount: initial.repairCommandCount, blockedSave: true, screenshot };
    }

    assertEqual(initial.secureStorage.status, "ready", `${scenario} secure storage status`);
    assertEqual(initial.secureStorage.backend, definition.backend, `${scenario} keyring backend`);

    if (scenario === "safe-storage-linux-keyring-ready") {
      await openSettings(cdp, "secure storage");
      await waitForText(cdp, "Secure storage ready", appWaitTimeoutMs);
      const screenshot = await writeScreenshot(cdp, `${scenario}.png`);
      return { secureStorage: initial.secureStorage, screenshot };
    }

    if (scenario === "named-secret-rtx-login-save") {
      const secret = redactedSecretValue(scenario);
      const saved = await saveNamedSecret(cdp, {
        label: "RTX login",
        value: secret,
        kind: "login",
        scope: "workspace",
        notes: "Dogfood rehydration metadata only",
      });
      assertNamedSecretSummary(saved, { label: "RTX login", kind: "login" });
      const exported = await evaluate(cdp, () => window.ambientDesktop.exportNamedSecretMetadata());
      assertNotVisible(JSON.stringify(saved), secret, `${scenario} summary`);
      assertNotVisible(JSON.stringify(exported), secret, `${scenario} metadata export`);
      await openSettings(cdp, "named secrets");
      await waitForText(cdp, "RTX login", appWaitTimeoutMs);
      assertNotVisible(await bodyText(cdp), secret, `${scenario} renderer text`);
      const screenshot = await writeScreenshot(cdp, `${scenario}.png`);
      return {
        secureStorage: initial.secureStorage,
        namedSecretCount: saved.length,
        exportTaskCount: exported.secrets.length,
        screenshot,
      };
    }

    if (scenario === "named-secret-brokered-local-fixture") {
      const secret = redactedSecretValue(scenario);
      const saved = await saveNamedSecret(cdp, {
        label: "Local fixture token",
        value: secret,
        kind: "token",
        scope: "workspace",
      });
      const target = saved.find((candidate) => candidate.label === "Local fixture token");
      if (!target) throw new Error(`${scenario} did not return the saved named secret summary.`);
      const result = await evaluate(cdp, (id) => window.ambientDesktop.brokerNamedSecretToLocalFixture({
        id,
        target: "local-fixture",
        purpose: "safe storage dogfood broker verification",
      }), target.id);
      if (!result?.delivered) throw new Error(`${scenario} did not report broker delivery.`);
      assertNotVisible(JSON.stringify(result), secret, `${scenario} broker result`);
      await openSettings(cdp, "named secrets");
      await waitForText(cdp, "Local fixture token", appWaitTimeoutMs);
      assertNotVisible(await bodyText(cdp), secret, `${scenario} renderer text`);
      const screenshot = await writeScreenshot(cdp, `${scenario}.png`);
      return {
        secureStorage: initial.secureStorage,
        brokerTarget: result.target,
        brokerDelivered: result.delivered,
        screenshot,
      };
    }

    throw new Error(`Unhandled safe storage dogfood scenario: ${scenario}`);
  } finally {
    cdp?.close?.();
    await stopApp(app);
    await rm(scratch.root, { recursive: true, force: true });
  }
}

function scenarioDefinition(scenario) {
  if (scenario === "safe-storage-linux-basic-text-blocked") {
    return { backend: "basic_text", expectedStatus: "blocked", expectedReason: "basic_text" };
  }
  if (
    scenario === "safe-storage-linux-keyring-ready" ||
    scenario === "named-secret-rtx-login-save" ||
    scenario === "named-secret-brokered-local-fixture"
  ) {
    return { backend: "gnome_libsecret", expectedStatus: "ready" };
  }
  throw new Error(`Unsupported safe storage dogfood scenario: ${scenario}`);
}

async function secureStorageSnapshot(cdp) {
  return evaluate(cdp, async () => {
    const state = await window.ambientDesktop.bootstrap();
    return {
      secureStorage: state.secureStorage,
      repairCommandCount: state.secureStorageRepair.commands.length,
      namedSecretCount: state.namedSecrets.length,
    };
  });
}

async function attemptNamedSecretSave(cdp, input) {
  return evaluate(cdp, async (draft) => {
    try {
      await window.ambientDesktop.saveNamedSecret(draft);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }, input);
}

async function saveNamedSecret(cdp, input) {
  const saved = await evaluate(cdp, (draft) => window.ambientDesktop.saveNamedSecret(draft), input);
  if (!Array.isArray(saved) || saved.length === 0) throw new Error("Named secret save returned no summaries.");
  return saved;
}

function assertNamedSecretSummary(summaries, expected) {
  const found = summaries.find((summary) => summary.label === expected.label);
  if (!found) throw new Error(`Expected named secret summary for ${expected.label}.`);
  assertEqual(found.kind, expected.kind, `${expected.label} kind`);
  if ("secretRef" in found || "value" in found) throw new Error(`Named secret summary exposed private fields for ${expected.label}.`);
}

async function openSettings(cdp, query) {
  const alreadyOpen = await evaluate(cdp, () => Boolean(document.querySelector(".settings-shell")));
  if (!alreadyOpen) {
    await clickByText(cdp, "button", "Settings");
    await waitFor(cdp, () => Boolean(document.querySelector(".settings-shell")), appWaitTimeoutMs);
  }
  await setSettingsSearch(cdp, query);
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
      AMBIENT_E2E_SECURE_STORAGE_PLATFORM: input.platform,
      AMBIENT_E2E_SECURE_STORAGE_BACKEND: input.backend,
      AMBIENT_SAFE_STORAGE_DOGFOOD: "1",
    }),
  });
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
  const body = await bodyText(cdp).catch(() => "");
  throw new Error(`Timed out waiting for Electron UI condition.${lastError ? ` Last error: ${lastError.message}` : ""}\n\nBody tail:\n${body.slice(-2000)}`);
}

async function evaluate(cdp, fnOrExpression, ...args) {
  const expression = typeof fnOrExpression === "function"
    ? `(${fnOrExpression.toString()})(...${JSON.stringify(args)})`
    : String(fnOrExpression);
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
  const relativePath = relative(repoRoot, outputPath);
  artifacts[name] = relativePath;
  return relativePath;
}

async function createScratch(scenario) {
  const root = await mkdtemp(join(tmpdir(), `${scenario}-`));
  const workspacePath = join(root, "workspace");
  const userDataPath = join(root, "userData");
  await mkdir(workspacePath, { recursive: true });
  await mkdir(userDataPath, { recursive: true });
  await writeFile(join(workspacePath, "README.md"), `# ${scenario}\n`, "utf8");
  return { root, workspacePath, userDataPath };
}

async function stopApp(app) {
  if (!app || app.exitCode !== null) return;
  if (process.platform !== "win32" && app.pid) {
    try {
      process.kill(-app.pid, "SIGTERM");
    } catch {
      app.kill("SIGTERM");
    }
  } else {
    app.kill("SIGTERM");
  }
  const started = Date.now();
  while (app.exitCode === null && Date.now() - started < 5_000) {
    await delay(100);
  }
  if (app.exitCode === null) {
    try {
      if (process.platform !== "win32" && app.pid) process.kill(-app.pid, "SIGKILL");
      else app.kill("SIGKILL");
    } catch {
      // Best effort cleanup.
    }
  }
}

async function run(executable, commandArgs, env) {
  const child = spawn(executable, commandArgs, {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
    process.stderr.write(chunk);
  });
  const code = await new Promise((resolve) => {
    child.on("exit", (status) => resolve(status ?? 1));
  });
  if (code !== 0) {
    throw new Error(`${executable} ${commandArgs.join(" ")} failed with ${code}.\n${stdout.slice(-2000)}\n${stderr.slice(-2000)}`);
  }
}

async function writeReport(report) {
  await mkdir(resultsDir, { recursive: true });
  await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const runReportPath = join(resultsDir, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function buildDogfoodEnv(extra = {}) {
  const providerId = process.env.AMBIENT_PROVIDER || defaultDogfoodProvider;
  const modelId = providerId === "gmi-cloud"
    ? process.env.GMI_CLOUD_MODEL || process.env.AMBIENT_MODEL || defaultDogfoodModel
    : process.env.AMBIENT_LIVE_MODEL || process.env.AMBIENT_MODEL || defaultDogfoodModel;
  const env = {
    ...process.env,
    ...extra,
    AMBIENT_PROVIDER: providerId,
  };
  if (providerId === "gmi-cloud") env.GMI_CLOUD_MODEL = modelId;
  else env.AMBIENT_LIVE_MODEL = modelId;
  delete env.NODE_OPTIONS;
  delete env.VITEST;
  return env;
}

function dogfoodCdpPort() {
  const parsed = Number(process.env.AMBIENT_HARNESS_CDP_PORT || process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  throw new Error("AMBIENT_HARNESS_CDP_PORT is required; run through scripts/run-electron-dogfood.mjs.");
}

function parseArgs(argv) {
  const parsed = { scenario: "safe-storage-release-gate" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--scenario") parsed.scenario = argv[++index];
    else if (arg.startsWith("--scenario=")) parsed.scenario = arg.slice("--scenario=".length);
    else throw new Error(`Unknown safe storage dogfood argument: ${arg}`);
  }
  return parsed;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`Expected ${label} to be ${JSON.stringify(expected)}, saw ${JSON.stringify(actual)}.`);
}

function assertIncludes(actual, expected, label) {
  if (!String(actual).includes(expected)) {
    throw new Error(`Expected ${label} to include ${JSON.stringify(expected)}.`);
  }
}

function assertNotVisible(actual, sensitiveValue, label) {
  if (String(actual).includes(sensitiveValue)) {
    throw new Error(`${label} exposed the dogfood secret marker.`);
  }
}

function redactedSecretValue(scenario) {
  return `safe-storage-dogfood-secret-${scenario}-${startedMs}`;
}
