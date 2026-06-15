#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { rm, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, basename, resolve } from "node:path";

if (typeof WebSocket !== "function") {
  throw new Error("Run with `node --experimental-websocket scripts/ui-model/collect-ui-model.mjs`.");
}

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const failOnViolations = args.has("--fail-on-violations");
const failOnAnyViolation = args.has("--fail-on-any-violation");
const selfTestDefects = args.has("--self-test-defects");
const keepApp = args.has("--keep-app");
const isolateScenarios = args.has("--isolate-scenarios");
const requestedScenarios = valueArg("--scenario");
const requestedProfiles = valueArg("--profile");
const reproViolationId = firstValueArg("--repro-violation") ?? firstValueArg("--focus-violation");
const basePort = Number(process.env.AMBIENT_UI_MODEL_CDP_PORT ?? 9587);
const port = await availablePort(basePort);
const resultsDir = pathArg("--results-dir", join(root, "test-results", reproViolationId ? "ui-model-repro" : "ui-model"));
const fixtureRoot = pathArg("--fixture-root", join(root, "test-results", reproViolationId ? "ui-model-repro-fixture" : "ui-model-fixture"));
const userData = process.env.AMBIENT_UI_MODEL_USER_DATA ? resolve(root, process.env.AMBIENT_UI_MODEL_USER_DATA) : join(fixtureRoot, "user-data");
const workspace = process.env.AMBIENT_UI_MODEL_WORKSPACE ? resolve(root, process.env.AMBIENT_UI_MODEL_WORKSPACE) : join(fixtureRoot, "workspace");
const uiModelThemePreference = parseUiModelThemePreference();
const output = [];

const activeProfiles = requestedProfiles.length > 0 ? requestedProfiles : ["core"];
const scenarioCatalog = [
  {
    name: "main-shell-desktop",
    surface: "main-shell",
    exposure: "common",
    profiles: ["core"],
    viewportName: "desktop",
    width: 1440,
    height: 900,
    description: "Default app shell, composer, model selector, and primary controls on a desktop viewport.",
    setup: setupMainShell,
  },
  {
    name: "main-shell-medium",
    surface: "main-shell",
    exposure: "common",
    profiles: ["core"],
    viewportName: "medium",
    width: 1280,
    height: 800,
    description: "Default app shell at a medium desktop viewport.",
    setup: setupMainShell,
  },
  {
    name: "main-shell-compact",
    surface: "main-shell",
    exposure: "common",
    profiles: ["core"],
    viewportName: "compact",
    width: 960,
    height: 720,
    description: "Default app shell at a compact viewport where toolbar wrapping is most likely.",
    setup: setupMainShell,
  },
  {
    name: "project-board-desktop",
    surface: "project-board",
    exposure: "common",
    profiles: ["core"],
    viewportName: "desktop",
    width: 1440,
    height: 900,
    description: "Deterministic project board with a small realistic card set on desktop.",
    setup: setupProjectBoard,
  },
  {
    name: "project-board-medium",
    surface: "project-board",
    exposure: "common",
    profiles: ["core"],
    viewportName: "medium",
    width: 1280,
    height: 800,
    description: "Deterministic project board with a small realistic card set on medium viewport.",
    setup: setupProjectBoard,
  },
  {
    name: "project-board-compact",
    surface: "project-board",
    exposure: "common",
    profiles: ["core"],
    viewportName: "compact",
    width: 960,
    height: 720,
    description: "Deterministic project board with a small realistic card set on compact viewport.",
    setup: setupProjectBoard,
  },
  {
    name: "project-board-long-names-desktop",
    surface: "project-board",
    exposure: "plausible-heavy",
    profiles: ["stress"],
    viewportName: "desktop",
    width: 1440,
    height: 900,
    description: "Project board with long but realistic card titles, descriptions, paths, and acceptance criteria.",
    fixture: { longNames: true, boardTab: "Draft Inbox", scrollTo: ".project-board-draft-grid" },
    setup: setupProjectBoard,
  },
  {
    name: "project-board-long-names-compact",
    surface: "project-board",
    exposure: "plausible-heavy",
    profiles: ["stress"],
    viewportName: "compact",
    width: 960,
    height: 720,
    description: "Project board with long but realistic card text at compact width.",
    fixture: { longNames: true, boardTab: "Draft Inbox", scrollTo: ".project-board-draft-grid" },
    setup: setupProjectBoard,
  },
  {
    name: "project-board-many-cards-25-desktop",
    surface: "project-board",
    exposure: "plausible-heavy",
    profiles: ["stress"],
    viewportName: "desktop",
    width: 1440,
    height: 900,
    description: "Project board with 25 realistic manual cards to exercise dense board scanning and column scroll behavior.",
    fixture: { cardCount: 25, titleShape: "normal", boardTab: "Draft Inbox", scrollTo: ".project-board-draft-grid" },
    setup: setupProjectBoard,
  },
  {
    name: "project-board-many-cards-25-compact",
    surface: "project-board",
    exposure: "plausible-heavy",
    profiles: ["stress"],
    viewportName: "compact",
    width: 960,
    height: 720,
    description: "Project board with 25 realistic manual cards at compact width.",
    fixture: { cardCount: 25, titleShape: "normal", boardTab: "Draft Inbox", scrollTo: ".project-board-draft-grid" },
    setup: setupProjectBoard,
  },
  {
    name: "local-tasks-many-items-desktop",
    surface: "local-tasks",
    exposure: "plausible-heavy",
    profiles: ["stress"],
    viewportName: "desktop",
    width: 1440,
    height: 900,
    description: "Local Tasks Kanban with 30 deterministic tasks across normal workflow states.",
    fixture: { taskCount: 30, scrollTo: ".task-kanban-board" },
    setup: setupLocalTasks,
  },
  {
    name: "local-tasks-long-names-compact",
    surface: "local-tasks",
    exposure: "plausible-heavy",
    profiles: ["stress"],
    viewportName: "compact",
    width: 960,
    height: 720,
    description: "Local Tasks Kanban with long realistic titles, descriptions, labels, and blockers at compact width.",
    fixture: { longTaskNames: true, scrollTo: ".task-kanban-board" },
    setup: setupLocalTasks,
  },
  {
    name: "settings-search-active",
    surface: "settings",
    exposure: "common",
    profiles: ["interaction"],
    viewportName: "medium",
    width: 1280,
    height: 800,
    description: "Settings panel with search active so filtered rows, clear controls, and settings navigation are captured.",
    fixture: { query: "provider permission API key" },
    setup: setupSettingsSearch,
  },
  {
    name: "project-board-draft-detail-open",
    surface: "project-board",
    exposure: "plausible-heavy",
    profiles: ["interaction"],
    viewportName: "medium",
    width: 1280,
    height: 800,
    description: "Draft Inbox candidate selected with the detail inspector open beside the board.",
    fixture: { longNames: true, boardTab: "Draft Inbox", interaction: "draft-detail-open", scrollTo: ".project-board-draft-board" },
    setup: setupProjectBoardDraftDetail,
  },
  {
    name: "project-board-pm-review-open",
    surface: "project-board",
    exposure: "plausible-heavy",
    profiles: ["interaction"],
    viewportName: "medium",
    width: 1280,
    height: 800,
    description: "Project Board Charter source/PM-review workspace open with the sticky source inspector visible.",
    fixture: { longNames: true, boardTab: "Charter", interaction: "pm-review-open", scrollTo: ".project-board-charter-workspace" },
    setup: setupProjectBoardPmReview,
  },
  {
    name: "local-tasks-edit-card-open",
    surface: "local-tasks",
    exposure: "plausible-heavy",
    profiles: ["interaction"],
    viewportName: "medium",
    width: 1280,
    height: 800,
    description: "Local Tasks Kanban with a task card edit form open and repeated controls still visible.",
    fixture: { taskCount: 8, interaction: "edit-card-open", scrollTo: ".task-kanban-board" },
    setup: setupLocalTasksEditCard,
  },
  {
    name: "workflow-recordings-home",
    surface: "workflow-recordings",
    exposure: "common",
    profiles: ["interaction"],
    viewportName: "medium",
    width: 1280,
    height: 800,
    description: "Workflow Recordings home with saved playbooks, recording folders, and current recording-mode guidance visible.",
    setup: setupWorkflowRecordingsHome,
  },
  {
    name: "api-key-dialog-open",
    surface: "main-shell",
    exposure: "common",
    profiles: ["interaction"],
    viewportName: "compact",
    width: 960,
    height: 720,
    description: "Provider API-key dialog open with the secret input focused so modal bounds and focus affordances are captured.",
    setup: setupApiKeyDialog,
  },
  {
    name: "model-selector-open",
    surface: "main-shell",
    exposure: "common",
    profiles: ["interaction"],
    viewportName: "compact",
    width: 960,
    height: 720,
    description: "Composer model selector menu open at compact width so option visibility and active item geometry are captured.",
    setup: setupModelSelectorOpen,
  },
  {
    name: "workflow-run-console-open",
    surface: "workflow-agents",
    exposure: "plausible-heavy",
    profiles: ["interaction"],
    viewportName: "medium",
    width: 1280,
    height: 800,
    description: "Workflow Agent thread run console open with deterministic run events, model calls, permissions, and audit evidence visible.",
    setup: setupWorkflowRunConsoleOpen,
  },
  {
    name: "workflow-artifact-preview-open",
    surface: "workflow-agents",
    exposure: "plausible-heavy",
    profiles: ["interaction"],
    viewportName: "medium",
    width: 1280,
    height: 800,
    description: "Workflow Agent run outputs open with the retained report artifact previewed in the Files panel.",
    setup: setupWorkflowArtifactPreviewOpen,
  },
  {
    name: "permission-dialog-open",
    surface: "main-shell",
    exposure: "common",
    profiles: ["interaction"],
    viewportName: "compact",
    width: 960,
    height: 720,
    description: "Reusable permission prompt open with plugin trust, detail text, and persistent grant actions visible.",
    setup: setupPermissionDialogOpen,
  },
  {
    name: "browser-picker-active",
    surface: "browser",
    exposure: "plausible-heavy",
    profiles: ["interaction"],
    viewportName: "medium",
    width: 1280,
    height: 800,
    description: "Browser panel with an active element picker waiting for a user selection.",
    setup: setupBrowserPickerActive,
  },
  {
    name: "plugin-import-candidate-visible",
    surface: "plugins",
    exposure: "plausible-heavy",
    profiles: ["interaction"],
    viewportName: "medium",
    width: 1280,
    height: 800,
    description: "Plugins Marketplace tab with Ambient curated import candidates and provenance metadata visible.",
    setup: setupPluginImportCandidateVisible,
  },
];
const scenarios = scenarioCatalog.filter((scenario) => {
  const scenarioMatch = requestedScenarios.length === 0 || requestedScenarios.includes(scenario.name);
  const profileMatch = requestedScenarios.length > 0 || scenario.profiles.some((profile) => activeProfiles.includes(profile));
  return scenarioMatch && profileMatch;
});

if (scenarios.length === 0) {
  throw new Error(
    `No matching UI model scenarios. Requested scenarios: ${requestedScenarios.join(", ") || "none"}. Profiles: ${activeProfiles.join(", ")}.`,
  );
}

if (reproViolationId && scenarios.length !== 1) {
  throw new Error("Repro mode requires exactly one scenario. Pass --scenario=<scenario> with --repro-violation=<violation-id>.");
}

if (reproViolationId && isolateScenarios) {
  throw new Error("Repro mode cannot be combined with --isolate-scenarios.");
}

let appInstance;
let projectBoardReady = false;
let projectBoardId;
let workflowSampleState;
const projectBoardCreatedCardKeys = new Set();
const localTaskCreatedKeys = new Set();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await shutdownApp(appInstance);
    process.exit(0);
  });
}

async function main() {
  try {
    if (isolateScenarios && scenarios.length > 1) {
      await runIsolatedScenarios();
      return;
    }

    await rm(resultsDir, { recursive: true, force: true });
    await rm(fixtureRoot, { recursive: true, force: true });
    await mkdir(resultsDir, { recursive: true });
    await mkdir(userData, { recursive: true });
    await mkdir(workspace, { recursive: true });

    appInstance = await launchApp();
    const cdp = appInstance.cdp;
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await waitFor(cdp, () => document.body?.innerText.includes("Ambient"), "Ambient shell");
    await installStabilizers(cdp);
    await setUiModelTheme(cdp);

    const models = [];
    for (const scenario of scenarios) {
      console.log(`[ui-model] ${scenario.name}: setup ${scenario.width}x${scenario.height}`);
      await setViewport(cdp, scenario.width, scenario.height);
      await scenario.setup(cdp, scenario);
      if (selfTestDefects) await injectSelfTestDefects(cdp);
      await settle(cdp);
      console.log(`[ui-model] ${scenario.name}: collect`);
      const model = await collectUiModel(cdp, scenario);
      model.tooltipSamples = await collectTooltipSamples(cdp, scenario);
      model.violations.push(...tooltipViolations(model.tooltipSamples, scenario));
      annotateModelViolations(model, scenario);
      await writeFile(join(resultsDir, `${scenario.name}.json`), `${JSON.stringify(model, null, 2)}\n`, "utf8");
      if (reproViolationId) await focusViolation(cdp, model, reproViolationId);
      models.push(model);
      console.log(
        `[ui-model] ${scenario.name}: ${model.violations.length} violations, ${model.violations.filter((violation) => violation.gate === "fail").length} gate failures`,
      );
    }

    await writeReports(models);
    if (selfTestDefects) assertSelfTestDetections(models);
    const violationCount = models.reduce((sum, model) => sum + model.violations.length, 0);
    const gateFailureCount = models.reduce((sum, model) => sum + model.violations.filter((violation) => violation.gate === "fail").length, 0);
    console.log(`UI model report written to ${join(resultsDir, "report.md")} and ${join(resultsDir, "report.html")}`);
    console.log(
      `Scenarios: ${models.length}. Violations: ${violationCount}. Gate failures: ${gateFailureCount}. Mode: ${uiModelModeLabel()}.`,
    );
    if (shouldFailUiModelRun({ violationCount, gateFailureCount })) {
      process.exitCode = 1;
    }
    if (reproViolationId && keepApp && process.exitCode !== 1) {
      console.log("[ui-model] Repro app is open. Stop this process to close it.");
      await new Promise(() => undefined);
    }
  } finally {
    await writeFile(join(resultsDir, "electron-output.log"), output.join(""), "utf8").catch(() => undefined);
    if (!keepApp) await shutdownApp(appInstance);
  }
}

async function runIsolatedScenarios() {
  await rm(resultsDir, { recursive: true, force: true });
  await rm(fixtureRoot, { recursive: true, force: true });
  await mkdir(resultsDir, { recursive: true });

  const isolatedResultsRoot = join(resultsDir, ".isolated-runs");
  const models = [];
  for (const scenario of scenarios) {
    const childResultsDir = join(isolatedResultsRoot, scenario.name);
    const childFixtureRoot = join(fixtureRoot, scenario.name);
    console.log(`[ui-model] ${scenario.name}: isolated scenario run`);
    const childLog = await runCollectorChild([
      "--experimental-websocket",
      "scripts/ui-model/collect-ui-model.mjs",
      `--scenario=${scenario.name}`,
      `--results-dir=${childResultsDir}`,
      `--fixture-root=${childFixtureRoot}`,
      `--theme=${uiModelThemePreference}`,
    ]);
    output.push(`\n[ui-model isolated ${scenario.name}]\n${childLog}`);
    const modelText = await readFile(join(childResultsDir, `${scenario.name}.json`), "utf8");
    await writeFile(join(resultsDir, `${scenario.name}.json`), modelText, "utf8");
    const model = JSON.parse(modelText);
    models.push(model);
    console.log(
      `[ui-model] ${scenario.name}: ${model.violations.length} violations, ${model.violations.filter((violation) => violation.gate === "fail").length} gate failures`,
    );
  }

  await writeReports(models);
  if (selfTestDefects) assertSelfTestDetections(models);
  const violationCount = models.reduce((sum, model) => sum + model.violations.length, 0);
  const gateFailureCount = models.reduce((sum, model) => sum + model.violations.filter((violation) => violation.gate === "fail").length, 0);
  console.log(`UI model report written to ${join(resultsDir, "report.md")} and ${join(resultsDir, "report.html")}`);
  console.log(
    `Scenarios: ${models.length}. Violations: ${violationCount}. Gate failures: ${gateFailureCount}. Mode: ${uiModelModeLabel()}.`,
  );
  if (shouldFailUiModelRun({ violationCount, gateFailureCount })) {
    process.exitCode = 1;
  }
}

function shouldFailUiModelRun({ violationCount, gateFailureCount }) {
  if (selfTestDefects) return false;
  if (failOnAnyViolation && violationCount > 0) return true;
  return failOnViolations && gateFailureCount > 0;
}

function uiModelModeLabel() {
  if (selfTestDefects) return "self-test";
  if (failOnAnyViolation) return "zero-baseline";
  if (failOnViolations) return "strict";
  return "report-only";
}

function runCollectorChild(nodeArgs) {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, nodeArgs, {
      cwd: root,
      env: uiModelProcessEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    const append = (chunk) => chunks.push(chunk.toString("utf8"));
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("exit", (code, signal) => {
      const log = chunks.join("");
      if (code === 0) {
        resolveChild(log);
        return;
      }
      rejectChild(new Error(`Isolated UI model scenario failed with code=${code ?? ""} signal=${signal ?? ""}.\n${log.slice(-8000)}`));
    });
  });
}

function valueArg(name) {
  const values = [];
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(`${name}=`)) values.push(...arg.slice(name.length + 1).split(",").map((item) => item.trim()).filter(Boolean));
  }
  return values;
}

function firstValueArg(name) {
  return valueArg(name)[0];
}

function pathArg(name, fallback) {
  const value = firstValueArg(name);
  if (!value) return fallback;
  return resolve(root, value);
}

function parseUiModelThemePreference() {
  const raw = firstValueArg("--theme") || process.env.AMBIENT_UI_MODEL_THEME || "light";
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  throw new Error(`Unsupported UI model theme: ${raw}. Use light, dark, or system.`);
}

function uiModelProcessEnv(overrides = {}) {
  const env = {};
  for (const key of [
    "PATH",
    "HOME",
    "TMPDIR",
    "TEMP",
    "TMP",
    "USER",
    "LOGNAME",
    "SHELL",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "PNPM_HOME",
    "COREPACK_HOME",
    "XDG_CACHE_HOME",
  ]) {
    if (typeof process.env[key] === "string") env[key] = process.env[key];
  }
  for (const key of [
    "AMBIENT_PROVIDER",
    "AMBIENT_LLM_PROVIDER",
    "AMBIENT_UI_MODEL_THEME",
    "AMBIENT_UI_MODEL_USER_DATA",
    "AMBIENT_UI_MODEL_WORKSPACE",
    "AMBIENT_API_KEY",
    "AMBIENT_AGENT_AMBIENT_API_KEY",
    "AMBIENT_API_KEY_FILE",
    "GMI_CLOUD_API_KEY",
    "GMI_API_KEY",
    "GMI_CLOUD_API_KEY_FILE",
    "GMI_CLOUD_BASE_URL",
    "GMI_CLOUD_MODEL",
  ]) {
    if (typeof process.env[key] === "string") env[key] = process.env[key];
  }
  if (typeof process.env.AMBIENT_DESKTOP_BOOTSTRAP_WATCHDOG_MS === "string") {
    env.AMBIENT_DESKTOP_BOOTSTRAP_WATCHDOG_MS = process.env.AMBIENT_DESKTOP_BOOTSTRAP_WATCHDOG_MS;
  }
  return { ...env, ...overrides };
}

async function launchApp() {
  const child = spawn("pnpm", ["exec", "electron-vite", "dev", "--remoteDebuggingPort", String(port)], {
    cwd: root,
    env: uiModelProcessEnv({
      AMBIENT_E2E: "1",
      AMBIENT_E2E_USER_DATA: userData,
      AMBIENT_DESKTOP_WORKSPACE: workspace,
      AMBIENT_DESKTOP_BOOTSTRAP_WATCHDOG_MS: process.env.AMBIENT_DESKTOP_BOOTSTRAP_WATCHDOG_MS ?? "180000",
      AMBIENT_E2E_SKIP_PROJECT_BOARD_SOURCE_REFRESH: "1",
      AMBIENT_CODEX_CURATED_MARKETPLACE_URL: "0",
      ...pluginImportCandidateFixtureEnv(),
    }),
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.once("exit", (code, signal) => output.push(`\n[ui-model] electron exited code=${code ?? ""} signal=${signal ?? ""}\n`));
  const target = await waitForPageEndpoint(port);
  const cdp = await CdpClient.connect(target.webSocketDebuggerUrl);
  return { child, cdp };
}

function pluginImportCandidateFixtureEnv() {
  if (!scenarios.some((scenario) => scenario.name === "plugin-import-candidate-visible")) return {};
  return {
    AMBIENT_CODEX_PLUGIN_CACHE: "0",
    AMBIENT_CODEX_CURATED_MARKETPLACE_PATH: join(root, "fixtures", "curated-marketplace", "marketplace.json"),
    AMBIENT_CODEX_CURATED_MARKETPLACE_DEFAULT_URL: "0",
    AMBIENT_CODEX_CURATED_MARKETPLACE_TRUST_FIXTURE_KEY: "1",
    AMBIENT_CODEX_REMOTE_MARKETPLACE_PATH: "0",
    AMBIENT_CODEX_REMOTE_MARKETPLACE_URL: "0",
    AMBIENT_CODEX_REMOTE_MARKETPLACES: "0",
  };
}

async function shutdownApp(instance) {
  if (!instance) return;
  try {
    instance.cdp.close();
  } catch {
    // best effort cleanup
  }
  const child = instance.child;
  if (child.exitCode !== null || child.signalCode !== null) return;
  signalProcessTree(child, "SIGTERM");
  if (!(await waitForExit(child, 2_000))) {
    signalProcessTree(child, "SIGKILL");
    await waitForExit(child, 1_000);
  }
}

function signalProcessTree(child, signal) {
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // best effort cleanup
    }
  }
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
    };
    child.once("exit", onExit);
  });
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message}: ${message.error.data ?? ""}`));
      else resolve(message.result ?? {});
    };
    socket.onclose = () => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error("CDP socket closed."));
      }
      this.pending.clear();
    };
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    return new CdpClient(socket);
  }

  send(method, params = {}, timeoutMs = 20_000) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP ${method}.`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  close() {
    this.socket.close();
  }
}

async function availablePort(preferred) {
  for (let portCandidate = preferred; portCandidate < preferred + 50; portCandidate += 1) {
    if (await canListen(portCandidate)) return portCandidate;
  }
  throw new Error(`Could not find an available port near ${preferred}.`);
}

function canListen(portCandidate) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(portCandidate, "127.0.0.1");
  });
}

async function waitForPageEndpoint(cdpPort) {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for Electron CDP page on ${cdpPort}: ${lastError?.message ?? "no response"}`);
}

async function evaluate(cdp, expression, timeoutMs = 60_000) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(description);
  }
  return result.result?.value;
}

async function waitFor(cdp, predicate, label, timeoutMs = 30_000) {
  const source = `(${predicate.toString()})()`;
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await evaluate(cdp, source).catch((error) => ({ error: error.message }));
    if (last === true) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${label}. Last result: ${JSON.stringify(last)}`);
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function settle(cdp) {
  await evaluate(
    cdp,
    `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50))))`,
  );
}

async function installStabilizers(cdp) {
  await evaluate(
    cdp,
    `
    (() => {
      if (window.__ambientUiModelStabilized) return;
      const style = document.createElement("style");
      style.dataset.uiModel = "stabilizer";
      style.textContent = [
        "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; scroll-behavior: auto !important; }",
        ".spin { animation: none !important; }"
      ].join("\\n");
      document.head.appendChild(style);
      window.__ambientUiModelStabilized = true;
    })()
  `,
  );
}

async function setUiModelTheme(cdp) {
  await evaluate(cdp, `window.__ambientUiModelThemePreference = ${JSON.stringify(uiModelThemePreference)}`);
  await evaluate(cdp, `window.ambientDesktop.setThemePreference({ themePreference: ${JSON.stringify(uiModelThemePreference)} })`);
  await waitFor(
    cdp,
    () => document.documentElement.dataset.themePreference === window.__ambientUiModelThemePreference,
    `${uiModelThemePreference} UI model theme`,
  );
  await settle(cdp);
}

async function setupMainShell(cdp) {
  await evaluate(cdp, `window.scrollTo(0, 0); document.querySelector(".project-board-workspace .panel-button, .automation-workspace")?.closest("button")?.click?.(); true`);
  await waitFor(cdp, () => document.body?.innerText.includes("Ambient"), "main shell text");
}

async function setupSettingsSearch(cdp, scenario) {
  await setupMainShell(cdp);
  const opened = await evaluate(
    cdp,
    `
    (() => {
      const button = [...document.querySelectorAll("button")]
        .find((item) => (item.textContent || item.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim() === "Settings");
      if (!button) return Boolean(document.querySelector(".settings-shell"));
      button.click();
      return true;
    })()
  `,
  );
  if (!opened) throw new Error("Unable to open Settings.");
  await waitFor(cdp, () => Boolean(document.querySelector(".settings-shell")), "settings shell");

  const query = scenario.fixture?.query ?? "provider";
  const searched = await evaluate(
    cdp,
    `
    (() => {
      const input = document.querySelector(".settings-search input");
      if (!(input instanceof HTMLInputElement)) return false;
      input.focus();
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()
  `,
  );
  if (!searched) throw new Error("Unable to enter Settings search query.");
  await waitFor(cdp, () => Boolean(document.querySelector(".settings-search input")?.value), "settings search query");
  await settle(cdp);
}

async function setupApiKeyDialog(cdp) {
  await setupMainShell(cdp);
  const opened = await evaluate(
    cdp,
    `
    (() => {
      const existing = document.querySelector(".api-dialog[role='dialog'], [role='dialog'][aria-labelledby='api-dialog-title']");
      if (existing) return true;
      const button = document.querySelector(".provider-pill") || [...document.querySelectorAll("button")]
        .find((item) => {
          const label = [item.textContent, item.getAttribute("title"), item.getAttribute("aria-label")]
            .filter(Boolean)
            .join(" ")
            .replace(/\\s+/g, " ")
            .trim();
          return /API key missing|Set .* API key|API connected|\\bAPI\\b/i.test(label);
        });
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!opened) throw new Error("Unable to open API key dialog.");
  await waitFor(cdp, () => Boolean(document.querySelector(".api-dialog[role='dialog']")), "API key dialog");
  const focused = await evaluate(
    cdp,
    `
    (() => {
      const input = document.querySelector(".api-dialog input");
      if (!(input instanceof HTMLInputElement)) return false;
      input.focus();
      return document.activeElement === input;
    })()
  `,
  );
  if (!focused) throw new Error("Unable to focus API key dialog input.");
  await settle(cdp);
}

async function setupModelSelectorOpen(cdp) {
  await setupMainShell(cdp);
  const opened = await evaluate(
    cdp,
    `
    (() => {
      const button = document.querySelector(".model-picker-button");
      if (!(button instanceof HTMLElement)) return Boolean(document.querySelector(".model-picker-menu"));
      button.scrollIntoView({ block: "center", inline: "nearest" });
      button.click();
      return true;
    })()
  `,
  );
  if (!opened) throw new Error("Unable to open model selector.");
  await waitFor(cdp, () => Boolean(document.querySelector(".model-picker-menu [role='option']")), "model selector options");
  await settle(cdp);
}

async function setupPermissionDialogOpen(cdp) {
  await setupMainShell(cdp);
  const state = await evaluate(cdp, "window.ambientDesktop.bootstrap()");
  const workspacePath = state?.workspace?.path ?? workspace;
  await emitE2eEvent(cdp, {
    type: "permission-request",
    request: {
      id: "ui-model-plugin-trust-permission",
      threadId: state?.activeThreadId ?? "ui-model-thread",
      workspacePath,
      projectPath: workspacePath,
      toolName: "openai-developers.create_api_key",
      title: "Allow plugin tool execution?",
      message:
        "The OpenAI Developers plugin wants to create a workspace-scoped API key through an Ambient-managed secret flow.",
      detail: [
        "Plugin: openai-developers",
        "Tool: create_api_key",
        "Requested action: launch a local plugin MCP tool and store only the secret reference.",
        "Credential value will not be written to chat, logs, artifacts, or tool arguments.",
      ].join("\n"),
      risk: "plugin-tool",
      reusableScopes: ["thread", "project", "workspace"],
      grantActionKind: "plugin_tool_execute",
      grantTargetKind: "plugin",
      grantTargetLabel: "openai-developers:create_api_key",
      grantTargetHash: "ui-model:openai-developers:create-api-key",
      grantConditions: { secretFlow: "ambient-managed", source: "ui-model" },
    },
  });
  await waitFor(
    cdp,
    () =>
      Boolean(document.querySelector(".permission-dialog[role='dialog']")) &&
      document.body?.innerText.includes("Trust and allow once") &&
      document.body?.innerText.includes("Always for this workspace"),
    "permission dialog with reusable actions",
  );
  await settle(cdp);
}

async function setupBrowserPickerActive(cdp) {
  await dismissPermissionDialogIfPresent(cdp);
  await openBrowserPanel(cdp);
  await waitFor(cdp, () => Boolean(document.querySelector(".browser-picker-card")), "browser picker card");
  const started = await evaluate(
    cdp,
    `
    (() => {
      if (window.__ambientUiModelBrowserPickerStarted) return true;
      if (typeof window.ambientDesktop?.pickBrowser !== "function") return false;
      window.__ambientUiModelBrowserPickerStarted = true;
      window.__ambientUiModelBrowserPickerError = "";
      window.ambientDesktop.pickBrowser({
        prompt: "Select the primary account menu for the support knowledge-base login flow",
        profileMode: "isolated",
        runtime: "internal"
      }).catch((error) => {
        window.__ambientUiModelBrowserPickerError = error instanceof Error ? error.message : String(error);
      });
      return true;
    })()
  `,
  );
  if (!started) throw new Error("Unable to start browser picker.");
  await waitForBrowserPickerActive(cdp);
  await settle(cdp);
}

async function waitForBrowserPickerActive(cdp) {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    last = await evaluate(
      cdp,
      `
      (() => {
        const error = window.__ambientUiModelBrowserPickerError || "";
        if (error) return { ready: false, error };
        const active = document.querySelector(".browser-picker-active");
        const text = document.body?.innerText || "";
        return {
          ready: Boolean(active) && text.includes("Select the primary account menu"),
          text: active?.textContent || "",
        };
      })()
    `,
    );
    if (last?.error) throw new Error(`Browser picker failed: ${last.error}`);
    if (last?.ready) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for browser picker active state. Last result: ${JSON.stringify(last)}`);
}

async function openBrowserPanel(cdp) {
  const opened = await evaluate(
    cdp,
    `
    (() => {
      const existing = document.querySelector(".browser-picker-card");
      if (existing) return true;
      const button = [...document.querySelectorAll("button")]
        .find((item) => {
          const text = (item.textContent || item.title || item.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim();
          return text === "Browser" || text.includes("Browser");
        });
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!opened) throw new Error("Unable to open Browser panel.");
  await waitFor(cdp, () => document.body?.innerText.includes("Agent browser"), "browser panel");
}

async function dismissPermissionDialogIfPresent(cdp) {
  const dismissed = await evaluate(
    cdp,
    `
    (() => {
      const dialog = document.querySelector(".permission-dialog[role='dialog']");
      if (!dialog) return false;
      const button = [...dialog.querySelectorAll("button")]
        .find((item) => (item.textContent || "").replace(/\\s+/g, " ").trim() === "Deny");
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (dismissed) await settle(cdp);
}

async function emitE2eEvent(cdp, event) {
  const emitted = await evaluate(
    cdp,
    `
    (async () => {
      if (typeof window.ambientDesktop?.emitE2eEvent !== "function") return false;
      await window.ambientDesktop.emitE2eEvent(${JSON.stringify(event)});
      return true;
    })()
  `,
  );
  if (!emitted) throw new Error("E2E event emission is not available.");
}

async function setupPluginImportCandidateVisible(cdp) {
  await dismissPermissionDialogIfPresent(cdp);
  await openPluginsPanel(cdp);
  await selectPluginTab(cdp, "Marketplace");
  await waitFor(
    cdp,
    () =>
      Boolean(document.querySelector(".plugin-import-row")) &&
      document.body?.innerText.includes("Curated Plugins") &&
      document.body?.innerText.includes("Documents Fixture") &&
      document.body?.innerText.includes("sha256:"),
    "curated plugin import candidates",
    45_000,
  );
  await scrollElementIntoView(cdp, ".plugin-import-section");
  await settle(cdp);
}

async function openPluginsPanel(cdp) {
  const opened = await evaluate(
    cdp,
    `
    (() => {
      const existing = document.querySelector(".plugin-tabs");
      if (existing) return true;
      const button = [...document.querySelectorAll("button")]
        .find((item) => {
          const text = (item.textContent || item.title || item.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim();
          return text === "Plugins" || text.includes("Plugins");
        });
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!opened) throw new Error("Unable to open Plugins panel.");
  await waitFor(cdp, () => Boolean(document.querySelector(".plugin-tabs")), "plugins panel");
}

async function selectPluginTab(cdp, label) {
  const selected = await evaluate(
    cdp,
    `
    (() => {
      const label = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll(".plugin-tabs button")]
        .find((item) => (item.textContent || "").replace(/\\s+/g, " ").trim() === label);
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!selected) throw new Error(`Unable to select plugin tab: ${label}`);
  await settle(cdp);
}

async function setupProjectBoard(cdp, scenario) {
  if (!projectBoardReady) {
    const state = await evaluate(cdp, "window.ambientDesktop.bootstrap()");
    const activeProject = state?.projects?.find((project) => project.path === state.workspace.path);
    if (!activeProject?.id) throw new Error("Unable to read active project id.");
    const boardState = await evaluate(
      cdp,
      `window.ambientDesktop.createProjectBoard(${JSON.stringify({
        projectId: activeProject.id,
        title: "UI Model Project Board",
        summary: "Deterministic project board fixture for structured UI model checks.",
      })})`,
    );
    const boardId = boardState?.projects?.find((project) => project.path === boardState.workspace.path)?.board?.id;
    if (!boardId) throw new Error("Project board creation did not return an active board.");
    projectBoardId = boardId;
    const cards = [
      {
        key: "base-long-text",
        title: "Long text clipping candidate for UI model validation",
        description:
          "This deterministic card uses deliberately verbose text so the UI model can catch real clipping and verify disclosure affordances without reading screenshots.",
      },
      {
        key: "base-tooltip-boundary",
        title: "Tooltip boundary review",
        description: "Exercise action controls, details panels, and dense metadata rows near viewport edges.",
      },
      {
        key: "base-alignment",
        title: "Alignment check work item",
        description: "Keep repeated project-board controls aligned across compact and desktop layouts.",
      },
    ];
    for (const card of cards) {
      await createProjectBoardCardOnce(cdp, boardId, card.key, card);
    }
    projectBoardReady = true;
  }
  if (!projectBoardId) throw new Error("Project board fixture was not initialized.");

  await applyProjectBoardFixture(cdp, projectBoardId, scenario.fixture);

  const opened = await evaluate(
    cdp,
    `
    (() => {
      const button = [...document.querySelectorAll("button")]
        .find((item) => /Open Board|Build Board|Project Kanban/i.test(item.textContent || item.getAttribute("aria-label") || ""));
      if (button) {
        button.click();
        return true;
      }
      return Boolean(document.querySelector(".project-board-workspace"));
    })()
  `,
  );
  if (!opened) throw new Error("Unable to open project board.");
  await waitFor(cdp, () => Boolean(document.querySelector(".project-board-workspace")), "project board workspace");
  if (scenario.fixture?.boardTab) await selectProjectBoardTab(cdp, scenario.fixture.boardTab);
  if (scenario.fixture?.scrollTo) await scrollElementIntoView(cdp, scenario.fixture.scrollTo);
}

async function setupProjectBoardDraftDetail(cdp, scenario) {
  await setupProjectBoard(cdp, scenario);
  const selected = await evaluate(
    cdp,
    `
    (async () => {
      let detailButton = [...document.querySelectorAll(".project-board-draft-board .project-board-card-action, .project-board-card-action")]
        .find((item) => /\\bDetails\\b/i.test(item.textContent || item.getAttribute("title") || item.getAttribute("aria-label") || ""));
      if (detailButton instanceof HTMLElement) {
        detailButton.scrollIntoView({ block: "center", inline: "nearest" });
        detailButton.click();
        return true;
      }
      let card = document.querySelector(".project-board-draft-board .project-board-card[role='button'], .project-board-draft-board .project-board-card");
      if (!(card instanceof HTMLElement)) {
        const newDraftButton = [...document.querySelectorAll(".project-board-draft-board button, .project-board-workspace button")]
          .find((item) => (item.textContent || item.getAttribute("title") || item.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim().includes("New Draft Card"));
        if (newDraftButton instanceof HTMLElement) {
          newDraftButton.scrollIntoView({ block: "center", inline: "nearest" });
          newDraftButton.click();
          await new Promise((resolve) => setTimeout(resolve, 200));
          card = document.querySelector(".project-board-draft-board .project-board-card[role='button'], .project-board-draft-board .project-board-card");
          detailButton = [...document.querySelectorAll(".project-board-draft-board .project-board-card-action, .project-board-card-action")]
            .find((item) => /\\bDetails\\b/i.test(item.textContent || item.getAttribute("title") || item.getAttribute("aria-label") || ""));
          if (detailButton instanceof HTMLElement) {
            detailButton.scrollIntoView({ block: "center", inline: "nearest" });
            detailButton.click();
            return true;
          }
        }
      }
      if (card instanceof HTMLElement) {
        card.scrollIntoView({ block: "center", inline: "nearest" });
        card.click();
        return true;
      }
      return Boolean(document.querySelector(".project-board-candidate-detail:not(.empty)"));
    })()
  `,
  );
  if (!selected) throw new Error("Unable to open Project Board draft candidate detail.");
  await waitFor(cdp, () => Boolean(document.querySelector(".project-board-candidate-detail:not(.empty)")), "project board draft candidate detail");
  await settle(cdp);
}

async function setupProjectBoardPmReview(cdp, scenario) {
  await setupProjectBoard(cdp, scenario);
  await waitFor(cdp, () => Boolean(document.querySelector(".project-board-charter-workspace")), "project board charter workspace");
  await evaluate(
    cdp,
    `
    (() => {
      const sourceItem = document.querySelector(".project-board-source-item");
      if (sourceItem instanceof HTMLElement) {
        sourceItem.scrollIntoView({ block: "center", inline: "nearest" });
        sourceItem.click();
      }
      document.querySelector(".project-board-charter-workspace")?.scrollIntoView({ block: "start", inline: "nearest" });
      return true;
    })()
  `,
  );
  await waitFor(cdp, () => Boolean(document.querySelector(".project-board-source-detail")), "project board source detail");
  await settle(cdp);
}

async function applyProjectBoardFixture(cdp, boardId, fixture = {}) {
  if (fixture.cardCount) {
    const existingCount = await activeProjectBoardCardCount(cdp);
    for (let index = existingCount; index < fixture.cardCount; index += 1) {
      const number = index + 1;
      await createProjectBoardCardOnce(cdp, boardId, `many-card-${number}`, {
        title: `QA fixture card ${String(number).padStart(2, "0")} - validate board scanning, status density, and repeated controls`,
        description:
          "Plausible heavy-use card created by the UI model harness to verify that project board columns remain readable and controls stay reachable as the card count grows.",
      });
    }
  }

  if (fixture.longNames) {
    const longCards = [
      {
        key: "long-realistic-provider-path",
        title: "Implement provider onboarding validation for zai-org/GLM-5.1-FP8 with workspace-scoped secret recovery messaging",
        description:
          "Long realistic title and description covering provider names, model identifiers, workspace secret paths, and validation copy. The UI should truncate or wrap without hiding actions.",
      },
      {
        key: "long-realistic-artifact",
        title: "Review generated artifact preview for test-results/project-board-release-matrix/latest-phase8.json freshness warnings",
        description:
          "Exercise long artifact paths, release-gate labels, JSON evidence names, and compact card metadata that a normal project board can plausibly contain.",
      },
      {
        key: "long-realistic-task",
        title: "Create Local Task for permission dialog copy that explains sandbox fallback, persistent grants, and blocked external commands",
        description:
          "A long but readable task title with multiple domain terms. The card should preserve enough context while keeping details, proof, and action controls usable.",
      },
    ];
    for (const card of longCards) {
      await createProjectBoardCardOnce(cdp, boardId, card.key, card);
    }
  }
}

async function activeProjectBoardCardCount(cdp) {
  const count = await evaluate(
    cdp,
    `
    (async () => {
      const state = await window.ambientDesktop.bootstrap();
      const project = state?.projects?.find((item) => item.path === state.workspace.path);
      return project?.board?.cards?.length ?? 0;
    })()
  `,
  );
  return Number.isFinite(count) ? count : 0;
}

async function createProjectBoardCardOnce(cdp, boardId, key, card) {
  if (projectBoardCreatedCardKeys.has(key)) return;
  const { key: _key, ...input } = card;
  await evaluate(cdp, `window.ambientDesktop.createProjectBoardCard(${JSON.stringify({ boardId, ...input })})`);
  projectBoardCreatedCardKeys.add(key);
}

async function selectProjectBoardTab(cdp, label) {
  await waitFor(cdp, () => Boolean(document.querySelector(".project-board-tabs")), "project board tabs");
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const label = ${JSON.stringify(label)};
      const tabs = document.querySelector(".project-board-tabs");
      const button = [...(tabs?.querySelectorAll("button") ?? [])].find((item) => {
        const text = (item.textContent || "").replace(/\\s+/g, " ").trim();
        return text === label || text.startsWith(label);
      });
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Unable to select project board tab: ${label}`);
  if (label === "Draft Inbox") {
    await waitFor(cdp, () => Boolean(document.querySelector(".project-board-draft-board")), "project board draft inbox");
  } else {
    await settle(cdp);
  }
}

async function scrollElementIntoView(cdp, selector) {
  const scrolled = await evaluate(
    cdp,
    `
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.scrollIntoView({ block: "start", inline: "nearest" });
      return true;
    })()
  `,
  );
  if (!scrolled) throw new Error(`Unable to scroll UI model target into view: ${selector}`);
  await settle(cdp);
}

async function setupLocalTasks(cdp, scenario) {
  await applyLocalTaskFixture(cdp, scenario.fixture);
  await openWorkflowAgentPane(cdp, "Local Tasks");
  await waitFor(cdp, () => Boolean(document.querySelector(".task-kanban-board")) || document.body?.innerText.includes("No local tasks in this scope."), "local tasks board");
  if (scenario.fixture?.scrollTo) await scrollElementIntoView(cdp, scenario.fixture.scrollTo);
}

async function setupLocalTasksEditCard(cdp, scenario) {
  await setupLocalTasks(cdp, scenario);
  const edited = await evaluate(
    cdp,
    `
    (() => {
      const button = [...document.querySelectorAll(".task-kanban-board button, .automation-workspace button")]
        .find((item) => (item.textContent || item.getAttribute("title") || item.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim() === "Edit card");
      if (!button) return Boolean(document.querySelector(".task-kanban-edit-form"));
      button.scrollIntoView({ block: "center", inline: "nearest" });
      button.click();
      return true;
    })()
  `,
  );
  if (!edited) throw new Error("Unable to open Local Tasks edit form.");
  await waitFor(cdp, () => Boolean(document.querySelector(".task-kanban-edit-form")), "local task edit form");
  await settle(cdp);
}

async function applyLocalTaskFixture(cdp, fixture = {}) {
  if (fixture.taskCount) {
    const existingCount = await activeLocalTaskCount(cdp);
    const states = ["todo", "ready", "in_progress", "review", "needs_info", "done"];
    for (let index = existingCount; index < fixture.taskCount; index += 1) {
      const number = index + 1;
      const state = states[index % states.length];
      await createLocalTaskOnce(cdp, `many-task-${number}`, {
        title: `QA local task ${String(number).padStart(2, "0")} - validate Kanban density and repeated task controls`,
        description:
          "Plausible local task fixture used by the UI model harness to verify dense Kanban rows, state controls, labels, blockers, and repeated action affordances.",
        state,
        priority: number % 10,
        labels: ["ui-model", state, number % 2 === 0 ? "batch" : "manual"],
      });
    }
  }

  if (fixture.longTaskNames) {
    const longTasks = [
      {
        key: "long-task-provider-onboarding",
        title: "Validate provider onboarding recovery when GLM-5.1 FP8 secret binding fails inside a workspace-scoped Local Task",
        description:
          "Long local-task description covering provider identifiers, secret recovery, workspace scope, and retry instructions. The Kanban card should stay readable without hiding movement controls.",
        state: "todo",
        priority: 1,
        labels: ["provider-onboarding", "secret-flow", "workspace-scope"],
      },
      {
        key: "long-task-release-evidence",
        title: "Review project-board-release-matrix latest phase artifact freshness and summarize all blocked proof expectations",
        description:
          "Long artifact-heavy task text with release matrix names, proof scope warnings, and report paths that users can realistically create during release review.",
        state: "ready",
        priority: 2,
        labels: ["release-gate", "proof-review", "artifact"],
      },
      {
        key: "long-task-permission-dialog",
        title: "Patch permission dialog copy for sandbox fallback commands with persistent grants and external process warnings",
        description:
          "Long UI task text meant to exercise Local Task Kanban cards at compact width with realistic product vocabulary and several dense labels.",
        state: "needs_review",
        priority: 3,
        labels: ["permissions", "sandbox-fallback", "copy-review"],
        blockedBy: ["TASK-000000000000000000000000000000000000000000000000001"],
      },
    ];
    for (const task of longTasks) {
      await createLocalTaskOnce(cdp, task.key, task);
    }
  }
}

async function activeLocalTaskCount(cdp) {
  const count = await evaluate(
    cdp,
    `
    (async () => {
      const board = await window.ambientDesktop.listOrchestrationBoard();
      return board?.tasks?.length ?? 0;
    })()
  `,
  );
  return Number.isFinite(count) ? count : 0;
}

async function createLocalTaskOnce(cdp, key, task) {
  if (localTaskCreatedKeys.has(key)) return;
  const { key: _key, ...input } = task;
  await evaluate(cdp, `window.ambientDesktop.createOrchestrationTask(${JSON.stringify({ ...input, projectPath: workspace })})`);
  localTaskCreatedKeys.add(key);
}

async function setupWorkflowRunConsoleOpen(cdp) {
  await openWorkflowSampleRunsPane(cdp);
  await clickWorkflowRunAction(cdp, "Open");
  await waitFor(
    cdp,
    () => Boolean(document.querySelector(".workflow-runs-panel[data-workflow-runs-panel='runs-live'], .workflow-audit-preview")) && document.body?.innerText.includes("Run Console"),
    "workflow run console",
  );
  await scrollElementIntoView(cdp, ".workflow-runs-workspace");
  await settle(cdp);
}

async function setupWorkflowArtifactPreviewOpen(cdp) {
  await openWorkflowSampleRunsPane(cdp);
  await clickWorkflowRunAction(cdp, "Outputs");
  await waitFor(cdp, () => Boolean(document.querySelector(".workflow-output-card .workflow-output-artifact-row")), "workflow output artifact row");
  const previewed = await evaluate(
    cdp,
    `
    (() => {
      const button = document.querySelector(".workflow-output-artifact-row .artifact-link");
      if (!(button instanceof HTMLElement)) return Boolean(document.querySelector(".files-panel .file-preview-pane"));
      button.scrollIntoView({ block: "center", inline: "nearest" });
      button.click();
      return true;
    })()
  `,
  );
  if (!previewed) throw new Error("Unable to open workflow output artifact preview.");
  await waitFor(
    cdp,
    () =>
      Boolean(document.querySelector(".files-panel .file-preview-pane")) &&
      (Boolean(document.querySelector(".file-markdown-preview, .file-content, .file-preview-pane .panel-status.error")) || document.body?.innerText.includes("Workflow Agent Preview Audit")),
    "workflow artifact file preview",
  );
  const previewError = await evaluate(cdp, `document.querySelector(".file-preview-pane .panel-status.error")?.textContent || ""`);
  if (previewError) throw new Error(`Workflow artifact preview failed: ${previewError}`);
  await settle(cdp);
}

async function openWorkflowSampleRunsPane(cdp) {
  await openWorkflowSampleThread(cdp);
  await selectWorkflowAgentTab(cdp, "Runs");
  await waitFor(cdp, () => Boolean(document.querySelector(".workflow-runs-workspace")), "workflow runs workspace");
}

async function setupWorkflowRecordingsHome(cdp) {
  await setupMainShell(cdp);
  const opened = await evaluate(
    cdp,
    `
    (() => {
      const button = [...document.querySelectorAll("button")]
        .find((item) => {
          const text = (item.textContent || item.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim();
          return text === "Workflow Recordings" || text.includes("Workflow Recordings") || text === "Workflow Agents" || text.includes("Workflow Agents");
        });
      if (!button) return Boolean(document.querySelector(".automation-workspace"));
      button.click();
      return true;
    })()
  `,
  );
  if (!opened) throw new Error("Unable to open Workflow Recordings.");
  await waitFor(
    cdp,
    () =>
      Boolean(document.querySelector(".automation-workspace")) &&
      (document.body?.innerText.includes("Workflow Recordings") || document.body?.innerText.includes("Workflow Agents")),
    "workflow recordings home",
  );
  await settle(cdp);
}

async function openWorkflowSampleThread(cdp) {
  const sample = await ensureWorkflowSample(cdp);
  await openWorkflowAgents(cdp);
  const selected = await evaluate(
    cdp,
    `
    (() => {
      const title = ${JSON.stringify(sample.title)};
      const threadId = ${JSON.stringify(sample.workflowThreadId)};
      const buttons = [...document.querySelectorAll(".automation-thread-row, button")];
      const row = buttons.find((item) => {
        const text = (item.textContent || item.getAttribute("title") || "").replace(/\\s+/g, " ").trim();
        return (threadId && item.getAttribute("data-thread-id") === threadId) || text.includes(title);
      });
      if (row instanceof HTMLElement) {
        row.scrollIntoView({ block: "center", inline: "nearest" });
        row.click();
        return true;
      }
      return Boolean(document.querySelector(".workflow-build-workspace") && document.body?.innerText.includes(title));
    })()
  `,
  );
  if (!selected) throw new Error("Unable to select workflow sample thread.");
  await waitFor(cdp, () => Boolean(document.querySelector(".workflow-build-workspace")) && document.body?.innerText.includes("Workflow Agent tool bridge preview"), "workflow sample thread");
}

async function ensureWorkflowSample(cdp) {
  const existing = await readWorkflowSample(cdp);
  if (existing) {
    workflowSampleState = existing;
    return existing;
  }

  await openWorkflowAgents(cdp);
  await selectWorkflowAgentTab(cdp, "New Workflow");
  await waitFor(cdp, () => document.body?.innerText.includes("Create sample"), "workflow sample create action");
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const button = [...document.querySelectorAll("button")]
        .find((item) => (item.textContent || item.getAttribute("title") || "").replace(/\\s+/g, " ").trim().includes("Create sample"));
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error("Unable to create workflow sample artifact.");
  await waitFor(cdp, () => document.body?.innerText.includes("Workflow Agent tool bridge preview"), "workflow sample artifact");
  const created = await readWorkflowSample(cdp);
  if (!created) throw new Error("Workflow sample artifact was not created.");
  workflowSampleState = created;
  return created;
}

async function readWorkflowSample(cdp) {
  if (workflowSampleState) {
    const stillExists = await evaluate(
      cdp,
      `
      (async () => {
        const dashboard = await window.ambientDesktop.listWorkflowDashboard();
        return Boolean((dashboard?.artifacts ?? []).some((artifact) => artifact.id === ${JSON.stringify(workflowSampleState.artifactId)}));
      })()
    `,
    );
    if (stillExists) return workflowSampleState;
    workflowSampleState = undefined;
  }
  return evaluate(
    cdp,
    `
    (async () => {
      const title = "Workflow Agent tool bridge preview";
      const dashboard = await window.ambientDesktop.listWorkflowDashboard();
      const artifacts = (dashboard?.artifacts ?? []).filter((artifact) => artifact.title === title);
      const artifact = artifacts[0];
      if (!artifact) return undefined;
      const runs = (dashboard?.runs ?? [])
        .filter((run) => run.artifactId === artifact.id)
        .sort((left, right) => Date.parse(right.updatedAt || right.startedAt || "") - Date.parse(left.updatedAt || left.startedAt || ""));
      const run = runs[0];
      if (!run) return undefined;
      return {
        title,
        artifactId: artifact.id,
        workflowThreadId: artifact.workflowThreadId,
        runId: run.id,
        reportPath: run.reportPath || undefined,
      };
    })()
  `,
  );
}

async function clickWorkflowRunAction(cdp, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const label = ${JSON.stringify(label)};
      const row = document.querySelector(".workflow-thread-run-row");
      const buttons = [...(row?.querySelectorAll("button") ?? document.querySelectorAll(".workflow-runs-workspace button"))];
      const button = buttons.find((item) => (item.textContent || item.getAttribute("title") || "").replace(/\\s+/g, " ").trim() === label);
      if (!(button instanceof HTMLElement)) return false;
      button.scrollIntoView({ block: "center", inline: "nearest" });
      button.click();
      return true;
    })()
  `,
  );
  if (!clicked) throw new Error(`Unable to click workflow run action: ${label}`);
  await settle(cdp);
}

async function openWorkflowAgents(cdp) {
  const opened = await evaluate(
    cdp,
    `
    (() => {
      const labels = ["Workflow Agents", "Workflow Recordings"];
      const button = [...document.querySelectorAll("button")]
        .find((item) => {
          const text = (item.textContent || item.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim();
          return labels.some((label) => text === label || text.includes(label));
        });
      if (!button) return Boolean(document.querySelector(".automation-workspace"));
      button.click();
      return true;
    })()
  `,
  );
  if (!opened) throw new Error("Unable to open Workflow Agents or Workflow Recordings.");
  await waitFor(cdp, () => Boolean(document.querySelector(".workflow-agent-tabs")), "workflow agent tabs");
}

async function selectWorkflowAgentTab(cdp, label) {
  const selected = await evaluate(
    cdp,
    `
    (() => {
      const label = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll(".workflow-agent-tabs button")]
        .find((item) => (item.textContent || "").replace(/\\s+/g, " ").trim() === label);
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  );
  if (!selected) throw new Error(`Workflow Agent pane not found: ${label}`);
  await settle(cdp);
}

async function openWorkflowAgentPane(cdp, label) {
  await openWorkflowAgents(cdp);
  await selectWorkflowAgentTab(cdp, label);
  await waitFor(cdp, () => document.body?.innerText.includes("Add task"), `${label} pane`);
}

async function injectSelfTestDefects(cdp) {
  await evaluate(
    cdp,
    `
    (() => {
      document.querySelector("#ui-model-self-test-defects")?.remove();
      const host = document.createElement("div");
      host.id = "ui-model-self-test-defects";
      host.setAttribute("data-ui-model-self-test", "true");
      host.style.cssText = [
        "position:fixed",
        "left:24px",
        "top:96px",
        "z-index:2147483647",
        "font:14px/20px Inter, system-ui, sans-serif",
        "color:#fff",
        "pointer-events:auto"
      ].join(";");

      const horizontalClip = document.createElement("div");
      horizontalClip.className = "ui-model-self-test-horizontal-clip";
      horizontalClip.textContent = "SELF TEST clipped text should overflow horizontally without a title or aria label";
      horizontalClip.style.cssText = [
        "width:88px",
        "height:22px",
        "overflow:hidden",
        "white-space:nowrap",
        "text-overflow:clip",
        "background:#7f1d1d",
        "border:1px solid #fecaca",
        "margin-bottom:8px"
      ].join(";");

      const verticalClip = document.createElement("div");
      verticalClip.className = "ui-model-self-test-vertical-clip";
      verticalClip.textContent = "SELF TEST vertical clipping line one line two line three";
      verticalClip.style.cssText = [
        "width:180px",
        "height:12px",
        "overflow:hidden",
        "white-space:normal",
        "line-height:20px",
        "background:#713f12",
        "border:1px solid #fde68a",
        "margin-bottom:8px"
      ].join(";");

      const overlapHost = document.createElement("div");
      overlapHost.className = "ui-model-self-test-overlap-host";
      overlapHost.style.cssText = "position:relative;width:160px;height:48px;margin-bottom:8px;";
      const overlapA = document.createElement("button");
      overlapA.textContent = "SELF A";
      overlapA.style.cssText = "position:absolute;left:0;top:0;width:96px;height:32px;";
      const overlapB = document.createElement("button");
      overlapB.textContent = "SELF B";
      overlapB.style.cssText = "position:absolute;left:40px;top:8px;width:96px;height:32px;";
      overlapHost.append(overlapA, overlapB);

      const alignA = document.createElement("span");
      alignA.textContent = "SELF align A";
      alignA.setAttribute("data-ui-align-group", "ui-model-self-test-drift");
      alignA.setAttribute("data-ui-align-axis", "top");
      alignA.style.cssText = "display:block;position:relative;top:0;background:#1e3a8a;margin-bottom:2px;";
      const alignB = document.createElement("span");
      alignB.textContent = "SELF align B";
      alignB.setAttribute("data-ui-align-group", "ui-model-self-test-drift");
      alignB.setAttribute("data-ui-align-axis", "top");
      alignB.style.cssText = "display:block;position:relative;top:16px;background:#1e3a8a;margin-bottom:24px;";

      const offscreenTooltip = document.createElement("div");
      offscreenTooltip.className = "ui-model-self-test-offscreen-tooltip";
      offscreenTooltip.setAttribute("role", "tooltip");
      offscreenTooltip.textContent = "SELF TEST tooltip outside viewport";
      offscreenTooltip.style.cssText = [
        "position:fixed",
        "right:-48px",
        "bottom:-24px",
        "width:260px",
        "height:48px",
        "background:#581c87",
        "border:1px solid #e9d5ff",
        "z-index:2147483647"
      ].join(";");

      const offscreenDialog = document.createElement("section");
      offscreenDialog.className = "ui-model-self-test-offscreen-dialog";
      offscreenDialog.setAttribute("role", "dialog");
      offscreenDialog.setAttribute("aria-modal", "true");
      offscreenDialog.setAttribute("aria-label", "SELF TEST dialog outside viewport");
      offscreenDialog.textContent = "SELF TEST dialog outside viewport";
      offscreenDialog.style.cssText = [
        "position:fixed",
        "left:-80px",
        "top:176px",
        "width:220px",
        "height:72px",
        "background:#312e81",
        "border:1px solid #c7d2fe",
        "z-index:2147483647",
        "padding:8px"
      ].join(";");

      const lonelyCluster = document.createElement("div");
      lonelyCluster.className = "ui-model-self-test-lonely-controls";
      lonelyCluster.style.cssText = [
        "display:flex",
        "flex-wrap:wrap",
        "gap:8px",
        "width:360px",
        "margin-bottom:8px"
      ].join(";");
      for (const label of ["SELF one", "SELF two", "SELF three", "SELF lonely"]) {
        const button = document.createElement("button");
        button.textContent = label;
        button.style.cssText = "width:105px;height:30px;";
        lonelyCluster.append(button);
      }

      const fragmentedCluster = document.createElement("div");
      fragmentedCluster.className = "ui-model-self-test-fragmented-controls";
      fragmentedCluster.style.cssText = [
        "display:flex",
        "flex-wrap:wrap",
        "gap:8px",
        "width:460px",
        "margin-bottom:8px"
      ].join(";");
      for (const label of ["SELF A", "SELF B", "SELF C", "SELF D", "SELF E", "SELF F", "SELF G"]) {
        const button = document.createElement("button");
        button.textContent = label;
        button.style.cssText = "width:150px;height:30px;";
        fragmentedCluster.append(button);
      }

      const compressedSelect = document.createElement("select");
      compressedSelect.className = "ui-model-self-test-compressed-select";
      compressedSelect.style.cssText = "display:block;width:64px;height:30px;margin-bottom:8px;";
      const option = document.createElement("option");
      option.textContent = "SELF TEST extremely long model provider label";
      compressedSelect.append(option);

      const tinyButton = document.createElement("button");
      tinyButton.className = "ui-model-self-test-tiny-button";
      tinyButton.textContent = "!";
      tinyButton.style.cssText = "display:block;width:18px;height:18px;padding:0;margin-bottom:8px;";

      const lowContrastText = document.createElement("p");
      lowContrastText.className = "ui-model-self-test-low-contrast";
      lowContrastText.textContent = "SELF TEST low contrast text";
      lowContrastText.style.cssText = [
        "width:220px",
        "margin:0 0 8px",
        "padding:6px 8px",
        "color:#d1d5db",
        "background:#f3f4f6",
        "border:1px solid #e5e7eb"
      ].join(";");

      const unlabeledIconButton = document.createElement("button");
      unlabeledIconButton.className = "ui-model-self-test-unlabeled-icon";
      unlabeledIconButton.innerHTML = "<svg aria-hidden='true' viewBox='0 0 16 16' width='16' height='16'><circle cx='8' cy='8' r='6'></circle></svg>";
      unlabeledIconButton.style.cssText = "display:block;width:32px;height:32px;padding:0;margin-bottom:8px;";

      const focusClipHost = document.createElement("div");
      focusClipHost.className = "ui-model-self-test-focus-clip-host";
      focusClipHost.style.cssText = [
        "width:44px",
        "height:44px",
        "overflow:hidden",
        "margin-bottom:8px",
        "background:#064e3b"
      ].join(";");
      const focusClippedButton = document.createElement("button");
      focusClippedButton.className = "ui-model-self-test-focus-clipped-button";
      focusClippedButton.textContent = "F";
      focusClippedButton.setAttribute("aria-label", "SELF TEST clipped focus button");
      focusClippedButton.style.cssText = [
        "width:40px",
        "height:40px",
        "margin:2px",
        "outline:4px solid #facc15",
        "outline-offset:2px"
      ].join(";");
      focusClipHost.append(focusClippedButton);

      const hiddenRequiredAction = document.createElement("button");
      hiddenRequiredAction.className = "ui-model-self-test-hidden-required-action";
      hiddenRequiredAction.setAttribute("data-ui-required-action", "self-test-hidden-action");
      hiddenRequiredAction.textContent = "SELF TEST hidden required action";
      hiddenRequiredAction.style.cssText = "display:none;";

      const offscreenActiveMenu = document.createElement("div");
      offscreenActiveMenu.className = "ui-model-self-test-offscreen-active-menu";
      offscreenActiveMenu.setAttribute("role", "listbox");
      offscreenActiveMenu.setAttribute("aria-label", "SELF TEST offscreen active menu");
      offscreenActiveMenu.style.cssText = [
        "width:220px",
        "height:48px",
        "overflow:hidden",
        "margin-bottom:8px",
        "background:#172554",
        "border:1px solid #bfdbfe"
      ].join(";");
      const inactiveMenuItem = document.createElement("button");
      inactiveMenuItem.setAttribute("role", "option");
      inactiveMenuItem.textContent = "SELF TEST visible inactive option";
      inactiveMenuItem.style.cssText = "display:block;width:200px;height:32px;margin:6px;";
      const activeMenuItem = document.createElement("button");
      activeMenuItem.className = "active";
      activeMenuItem.setAttribute("role", "option");
      activeMenuItem.setAttribute("aria-selected", "true");
      activeMenuItem.textContent = "SELF TEST active option clipped below scrollport";
      activeMenuItem.style.cssText = "display:block;width:200px;height:32px;margin:72px 6px 6px;";
      offscreenActiveMenu.append(inactiveMenuItem, activeMenuItem);

      const stickyOverlapHost = document.createElement("div");
      stickyOverlapHost.className = "ui-model-self-test-sticky-overlap-host";
      stickyOverlapHost.style.cssText = [
        "position:fixed",
        "left:540px",
        "top:96px",
        "width:260px",
        "height:64px",
        "z-index:2147483646",
        "pointer-events:auto"
      ].join(";");
      const stickyHeader = document.createElement("header");
      stickyHeader.className = "ui-model-self-test-sticky-header";
      stickyHeader.setAttribute("data-ui-sticky-guard", "true");
      stickyHeader.textContent = "SELF TEST sticky header";
      stickyHeader.style.cssText = [
        "position:fixed",
        "left:540px",
        "top:96px",
        "width:260px",
        "height:42px",
        "z-index:2147483647",
        "display:grid",
        "place-items:center",
        "background:#0f172a",
        "border:1px solid #93c5fd"
      ].join(";");
      const stickyCoveredButton = document.createElement("button");
      stickyCoveredButton.className = "ui-model-self-test-sticky-covered-action";
      stickyCoveredButton.textContent = "SELF TEST covered sticky action";
      stickyCoveredButton.style.cssText = [
        "position:fixed",
        "left:556px",
        "top:108px",
        "width:192px",
        "height:30px",
        "z-index:1"
      ].join(";");
      stickyOverlapHost.append(stickyHeader, stickyCoveredButton);

      const unreachableScroll = document.createElement("div");
      unreachableScroll.className = "ui-model-self-test-unreachable-scroll";
      unreachableScroll.setAttribute("data-ui-scroll-container", "required");
      unreachableScroll.style.cssText = [
        "width:132px",
        "height:44px",
        "overflow:hidden",
        "margin-bottom:8px",
        "background:#164e63",
        "border:1px solid #67e8f9"
      ].join(";");
      const unreachableScrollContent = document.createElement("div");
      unreachableScrollContent.textContent = "SELF TEST unreachable scroll content line one line two line three line four";
      unreachableScrollContent.style.cssText = "height:144px;padding:4px;";
      unreachableScroll.append(unreachableScrollContent);

      host.append(
        horizontalClip,
        verticalClip,
        overlapHost,
        alignA,
        alignB,
        lonelyCluster,
        fragmentedCluster,
        compressedSelect,
        tinyButton,
        lowContrastText,
        unlabeledIconButton,
        focusClipHost,
        hiddenRequiredAction,
        offscreenActiveMenu,
        unreachableScroll,
        stickyOverlapHost,
        offscreenDialog,
        offscreenTooltip,
      );
      document.body.append(host);
      focusClippedButton.focus({ preventScroll: true });
      return true;
    })()
  `,
  );
}

async function collectUiModel(cdp, scenario) {
  const [pageModel, axTree, domSnapshot] = await Promise.all([
    evaluate(cdp, pageModelExpression(scenario)),
    collectAxTree(cdp),
    collectDomSnapshotSummary(cdp),
  ]);
  return {
    version: 1,
    scenario: scenario.name,
    scenarioMeta: scenarioMetadata(scenario),
    capturedAt: new Date().toISOString(),
    workspace,
    viewport: pageModel.viewport,
    page: pageModel.page,
    summary: pageModel.summary,
    nodes: pageModel.nodes,
    alignmentGroups: pageModel.alignmentGroups,
    accessibility: axTree,
    domSnapshot,
    violations: pageModel.violations,
  };
}

function scenarioMetadata(scenario) {
  return {
    id: scenario.name,
    surface: scenario.surface,
    exposure: scenario.exposure,
    profiles: scenario.profiles,
    viewportName: scenario.viewportName,
    width: scenario.width,
    height: scenario.height,
    description: scenario.description,
    themePreference: uiModelThemePreference,
  };
}

const ruleClassifications = {
  "page-horizontal-overflow": { impact: "major", reason: "Page-level horizontal overflow can hide or destabilize controls at the viewport edge." },
  "text-horizontal-clipping": { impact: "minor", reason: "Horizontal text clipping is usually acceptable when the surrounding control remains usable." },
  "text-vertical-clipping": { impact: "major", reason: "Vertical clipping usually prevents reading the visible label or state." },
  "overlay-outside-viewport": { impact: "blocker", reason: "An overlay outside the viewport can hide required content or actions." },
  "dialog-outside-viewport": { impact: "blocker", reason: "A modal or dialog outside the viewport can hide required review or confirmation actions." },
  "required-action-hidden": { impact: "blocker", reason: "Annotated required actions must remain visible and reachable in the active UI state." },
  "interactive-overlap": { impact: "blocker", reason: "Overlapping controls create ambiguous or blocked click targets." },
  "control-cluster-lonely-row": { impact: "minor", reason: "A lonely wrapped row is visually awkward but can remain fully usable." },
  "control-cluster-fragmented": { impact: "major", reason: "A control group split across many rows can make core controls hard to scan and operate." },
  "control-row-alignment-drift": { impact: "minor", reason: "Alignment drift is primarily visual unless it also hides controls." },
  "compressed-select-label": { impact: "major", reason: "A compressed select can prevent users from identifying the selected option." },
  "small-interactive-target": { impact: "accessibility", reason: "Small controls are difficult to use with touch, trackpads, and assistive interaction." },
  "missing-accessible-label": { impact: "accessibility", reason: "Icon-only controls need accessible names so assistive users can identify the action." },
  "focus-ring-clipped": { impact: "accessibility", reason: "Focused controls need a visible focus indicator that is not clipped by containers or the viewport." },
  "low-contrast-text": { impact: "accessibility", reason: "Visible text must maintain sufficient contrast against its rendered surface in the active color scheme." },
  "offscreen-active-menu-item": { impact: "accessibility", reason: "The selected menu or listbox item must be visible so keyboard users can track focus and selection state." },
  "sticky-header-overlap": { impact: "major", reason: "Sticky or fixed header surfaces must not cover visible content or controls." },
  "unreachable-scroll-content": { impact: "major", reason: "Annotated scroll containers must keep overflowing content reachable with usable scrolling." },
  "alignment-group-drift": { impact: "minor", reason: "Annotated alignment drift is usually a polish issue unless paired with clipping or overlap." },
  "tooltip-not-rendered": { impact: "accessibility", reason: "Tooltip-only help must be available when its trigger is exposed." },
  "tooltip-outside-viewport": { impact: "blocker", reason: "Tooltip content outside the viewport is unreadable." },
  "tooltip-occluded": { impact: "major", reason: "Tooltips must paint above the surface they are explaining." },
  "tooltip-anchor-distance": { impact: "major", reason: "A tooltip far from its trigger is hard to associate with the source control." },
};

function annotateModelViolations(model, scenario) {
  model.violations = model.violations.map((violation, index) => {
    const classified = classifyViolation(violation, scenario);
    return {
      id: classified.id ?? violationId(scenario.name, index, classified),
      sequence: index + 1,
      ...classified,
    };
  });
  model.summary.violationCount = model.violations.length;
  model.summary.gateFailureCount = model.violations.filter((violation) => violation.gate === "fail").length;
  model.summary.reportOnlyViolationCount = model.violations.filter((violation) => violation.gate === "report").length;
  model.summary.violationsByImpact = countBy(model.violations, (violation) => violation.impact);
  model.summary.violationsByGate = countBy(model.violations, (violation) => violation.gate);
}

function violationId(scenarioName, index, violation) {
  return `${slugForId(scenarioName)}-${String(index + 1).padStart(3, "0")}-${slugForId(violation.type ?? "violation")}`;
}

function slugForId(value) {
  return String(value ?? "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function classifyViolation(violation, scenario) {
  const classification = ruleClassifications[violation.type] ?? {};
  const overrideImpact = impactOverrideForViolation(violation);
  const overrideReason = impactOverrideReason(violation);
  const impact = violation.impact ?? overrideImpact ?? classification.impact ?? impactFromSeverity(violation.severity);
  const exposure = violation.exposure ?? scenario.exposure ?? "common";
  const gate = violation.gate ?? gateDecision(exposure, impact);
  return {
    ...violation,
    exposure,
    impact,
    gate,
    gateReason: overrideReason ?? classification.reason ?? gateDecisionReason(exposure, impact),
  };
}

function impactOverrideForViolation(violation) {
  if ((violation.type === "text-vertical-clipping" || violation.type === "text-horizontal-clipping") && violation.details?.hasDisclosure) {
    return "minor";
  }
  if (violation.type === "compressed-select-label" && violation.details?.hasDisclosure) {
    return "minor";
  }
  return undefined;
}

function impactOverrideReason(violation) {
  if ((violation.type === "text-vertical-clipping" || violation.type === "text-horizontal-clipping") && violation.details?.hasDisclosure) {
    return "Text is clipped, but a nearby disclosure action provides a recovery path, so this is report-only by default.";
  }
  if (violation.type === "compressed-select-label" && violation.details?.hasDisclosure) {
    return "Select text is compressed, but the control exposes a disclosure path, so this is report-only by default.";
  }
  return undefined;
}

function impactFromSeverity(severity) {
  if (severity === "error") return "major";
  if (severity === "info") return "info";
  return "minor";
}

function gateDecision(exposure, impact) {
  if (impact === "info") return "report";
  if (exposure === "pathological") return "report";
  if (impact === "blocker") return "fail";
  if ((exposure === "common" || exposure === "plausible-heavy") && (impact === "major" || impact === "accessibility")) return "fail";
  return "report";
}

function gateDecisionReason(exposure, impact) {
  if (gateDecision(exposure, impact) === "fail") return `${exposure} ${impact} findings are strict-mode failures.`;
  return `${exposure} ${impact} findings are report-only by default.`;
}

async function collectAxTree(cdp) {
  try {
    await cdp.send("Accessibility.enable");
    const result = await cdp.send("Accessibility.getFullAXTree", {}, 20_000);
    const nodes = (result.nodes ?? [])
      .filter((node) => !node.ignored)
      .slice(0, 2000)
      .map((node) => ({
        id: node.nodeId,
        role: node.role?.value ?? "",
        name: node.name?.value ?? "",
        value: node.value?.value ?? undefined,
        backendDOMNodeId: node.backendDOMNodeId,
        childIds: node.childIds ?? [],
        properties: Object.fromEntries((node.properties ?? []).map((property) => [property.name, property.value?.value])),
      }));
    return { nodeCount: result.nodes?.length ?? 0, exportedNodeCount: nodes.length, nodes };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), nodeCount: 0, exportedNodeCount: 0, nodes: [] };
  }
}

async function collectDomSnapshotSummary(cdp) {
  try {
    const result = await cdp.send(
      "DOMSnapshot.captureSnapshot",
      {
        computedStyles: [
          "display",
          "position",
          "overflow-x",
          "overflow-y",
          "white-space",
          "text-overflow",
          "font-size",
          "line-height",
          "outline-offset",
          "outline-style",
          "outline-width",
          "box-shadow",
          "z-index",
        ],
        includeDOMRects: true,
        includePaintOrder: true,
      },
      30_000,
    );
    return {
      documentCount: result.documents?.length ?? 0,
      stringCount: result.strings?.length ?? 0,
      layoutNodeCount: result.documents?.reduce((sum, document) => sum + (document.layout?.nodeIndex?.length ?? 0), 0) ?? 0,
      textBoxCount: result.documents?.reduce((sum, document) => sum + (document.textBoxes?.layoutIndex?.length ?? 0), 0) ?? 0,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), documentCount: 0, stringCount: 0, layoutNodeCount: 0, textBoxCount: 0 };
  }
}

function pageModelExpression(scenario) {
  return `
    (() => {
      const scenario = ${JSON.stringify(scenario.name)};
      const TEXT_TAGS = new Set(["A", "BUTTON", "CODE", "DD", "DT", "H1", "H2", "H3", "H4", "H5", "H6", "INPUT", "KBD", "LABEL", "LI", "OPTION", "P", "PRE", "SELECT", "SMALL", "SPAN", "STRONG", "TEXTAREA"]);
      const INTERACTIVE_SELECTOR = "button,a[href],input,select,textarea,[role='button'],[role='tab'],[role='menuitem'],[role='checkbox'],[role='radio'],[role='switch'],[tabindex]:not([tabindex='-1'])";
      const DIALOG_SELECTOR = "[role='dialog'],.api-dialog,.permission-dialog,.git-confirm-dialog,.git-branch-dialog,.browser-copy-dialog,.media-modal,.command-palette";
      const OVERLAY_SELECTOR = "[role='tooltip'],[role='menu'],[role='listbox'],.info-tooltip-bubble,[class*='popover' i],[class*='dropdown' i],[class*='menu' i]";
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body?.scrollWidth ?? 0,
        documentScrollHeight: document.documentElement.scrollHeight,
        bodyScrollHeight: document.body?.scrollHeight ?? 0,
      };
      const violations = [];
      const nodeRecords = [];
      const elementToRecord = new Map();
      const visibleElements = [...document.querySelectorAll("body *")]
        .filter((element) => isVisibleElement(element))
        .slice(0, 5000);

      for (const element of visibleElements) {
        const record = describeElement(element);
        elementToRecord.set(element, record);
        nodeRecords.push(record);
      }

      const maxScrollWidth = Math.max(viewport.documentScrollWidth, viewport.bodyScrollWidth);
      if (maxScrollWidth > viewport.width + 1) {
        violations.push({
          type: "page-horizontal-overflow",
          severity: "error",
          selector: "document",
          message: "Document has unintended horizontal overflow.",
          details: { maxScrollWidth, viewportWidth: viewport.width, overflowPx: Math.round(maxScrollWidth - viewport.width) },
        });
      }

      for (const element of visibleElements) {
        const record = elementToRecord.get(element);
        const text = record.text.trim();
        if (text && isTextCandidate(element, record)) {
          const allowed = element.closest("[data-ui-allow-truncation='true'],[data-ui-overflow='clip-intentional']");
          const hasDisclosure = Boolean(record.title || record.ariaLabel || element.getAttribute("aria-describedby") || hasNearbyTextRecovery(element));
          const clippedX = record.overflow.deltaX > 1 && !record.overflow.scrollableX && clips(record.styles.overflowX);
          const clippedY = record.overflow.deltaY > 1 && !record.overflow.scrollableY && clips(record.styles.overflowY);
          if (!allowed && (clippedX || clippedY) && (!hasDisclosure || clippedY)) {
            violations.push({
              type: clippedY ? "text-vertical-clipping" : "text-horizontal-clipping",
              severity: clippedY ? "error" : "warning",
              selector: record.selector,
              message: clippedY ? "Visible text is clipped vertically without an intentional overflow annotation." : "Visible text is clipped horizontally without a disclosure affordance.",
              text: record.text,
              rect: record.rect,
              details: {
                overflow: record.overflow,
                styles: record.styles,
                hasDisclosure,
                allowWith: "Add wrapping/flexible sizing, a disclosure affordance, or data-ui-allow-truncation='true' for intentional truncation.",
              },
            });
          }
        }

        if (element.matches(DIALOG_SELECTOR)) {
          const outside = outsideViewport(record.rect, viewport, 1);
          if (outside) {
            violations.push({
              type: "dialog-outside-viewport",
              severity: "error",
              selector: record.selector,
              message: "Dialog-like element extends outside the viewport.",
              text: record.text,
              rect: record.rect,
              details: outside,
            });
          }
        } else if (element.matches(OVERLAY_SELECTOR)) {
          const outside = outsideViewport(record.rect, viewport, 1);
          if (outside) {
            violations.push({
              type: "overlay-outside-viewport",
              severity: "error",
              selector: record.selector,
              message: "Overlay-like element extends outside the viewport.",
              text: record.text,
              rect: record.rect,
              details: outside,
            });
          }
        }
      }

      for (const violation of findInteractiveOverlaps(visibleElements, elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findControlClusterLayoutIssues(visibleElements, elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findCompressedControls(visibleElements, elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findMissingAccessibleLabels(visibleElements, elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findFocusRingIssues(elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findLowContrastText(visibleElements, elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findRequiredActionIssues(elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findOffscreenActiveMenuItems(visibleElements, elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findStickyHeaderOverlaps(visibleElements, elementToRecord)) {
        violations.push(violation);
      }
      for (const violation of findUnreachableScrollContent(elementToRecord)) {
        violations.push(violation);
      }

      const alignmentGroups = collectAlignmentGroups();
      for (const group of alignmentGroups) {
        if (group.violations.length > 0) violations.push(...group.violations);
      }

      return {
        scenario,
        page: {
          title: document.title,
          url: location.href,
          textPreview: (document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 1000),
        },
        viewport,
        summary: {
          visibleNodeCount: nodeRecords.length,
          interactiveNodeCount: nodeRecords.filter((node) => node.interactive).length,
          textNodeCount: nodeRecords.filter((node) => node.text).length,
          violationCount: violations.length,
        },
        nodes: nodeRecords,
        alignmentGroups,
        violations,
      };

      function describeElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const text = elementText(element);
        const role = element.getAttribute("role") || implicitRole(element);
        const record = {
          id: stableNodeId(element),
          selector: selectorFor(element),
          tag: element.tagName.toLowerCase(),
          className: String(element.className || "").replace(/\\s+/g, " ").trim().slice(0, 180),
          role,
          ariaLabel: element.getAttribute("aria-label") || "",
          title: element.getAttribute("title") || "",
          text: text.slice(0, 300),
          directText: directText(element).slice(0, 200),
          rect: roundedRect(rect),
          client: { width: element.clientWidth, height: element.clientHeight },
          scroll: { width: element.scrollWidth, height: element.scrollHeight },
          overflow: {
            deltaX: Math.round((element.scrollWidth - element.clientWidth) * 100) / 100,
            deltaY: Math.round((element.scrollHeight - element.clientHeight) * 100) / 100,
            scrollableX: element.scrollWidth > element.clientWidth + 1 && ["auto", "scroll"].includes(style.overflowX),
            scrollableY: element.scrollHeight > element.clientHeight + 1 && ["auto", "scroll"].includes(style.overflowY),
          },
          styles: {
            display: style.display,
            position: style.position,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            whiteSpace: style.whiteSpace,
            textOverflow: style.textOverflow,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            color: style.color,
            backgroundColor: style.backgroundColor,
            opacity: style.opacity,
            outlineOffset: style.outlineOffset,
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            boxShadow: style.boxShadow,
            zIndex: style.zIndex,
          },
          data: {
            allowTruncation: element.closest("[data-ui-allow-truncation='true']") !== null,
            ownAllowTruncation: element.getAttribute("data-ui-allow-truncation") === "true",
            ownAllowCompressedControl: element.getAttribute("data-ui-allow-compressed-control") === "true",
            ownAllowLonelyRow: element.getAttribute("data-ui-allow-lonely-row") === "true",
            ownAllowFragmentedControls: element.getAttribute("data-ui-allow-fragmented-controls") === "true",
            ownAllowSmallTarget: element.getAttribute("data-ui-allow-small-target") === "true",
            ownAllowUnlabeledControl: element.getAttribute("data-ui-allow-unlabeled-control") === "true",
            ownAllowStickyOverlap: element.getAttribute("data-ui-allow-sticky-overlap") === "true",
            ownAllowUnreachableScroll: element.getAttribute("data-ui-allow-unreachable-scroll") === "true",
            alignGroup: element.getAttribute("data-ui-align-group") || "",
            alignAxis: element.getAttribute("data-ui-align-axis") || "",
            overflowIntent: element.getAttribute("data-ui-overflow") || "",
            scrollContainer: element.getAttribute("data-ui-scroll-container") || "",
            stickyGuard: element.getAttribute("data-ui-sticky-guard") || "",
          },
          interactive: element.matches(INTERACTIVE_SELECTOR),
        };
        return record;
      }

      function isVisibleElement(element) {
        if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return false;
        if (element.closest("[hidden],[aria-hidden='true']")) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
        return rect.bottom >= -200 && rect.right >= -200 && rect.top <= window.innerHeight + 200 && rect.left <= window.innerWidth + 200;
      }

      function isTextCandidate(element, record) {
        if (record.rect.width < 3 || record.rect.height < 3) return false;
        if (record.text.length > 500) return false;
        if (TEXT_TAGS.has(element.tagName)) return true;
        if (["button", "link", "heading", "tab", "menuitem", "checkbox", "radio", "switch"].includes(record.role)) return true;
        const visibleChildren = [...element.children].filter((child) => isVisibleElement(child));
        return directText(element).trim().length > 0 && visibleChildren.length <= 1;
      }

      function clips(value) {
        return value === "hidden" || value === "clip";
      }

      function hasNearbyTextRecovery(element) {
        const container = element.closest(".project-board-card,.task-row,.workflow-artifact-row,.permission-dialog,.modal,[role='dialog']");
        if (!container) return false;
        return [...container.querySelectorAll("button,a,[role='button']")].some((control) => {
          const label = [
            control.getAttribute("aria-label"),
            control.getAttribute("title"),
            control.textContent,
          ].filter(Boolean).join(" ");
          return /\\b(details?|open|inspect|view|expand|more)\\b/i.test(label);
        });
      }

      function directText(element) {
        return [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.nodeValue || "")
          .join(" ")
          .replace(/\\s+/g, " ")
          .trim();
      }

      function elementText(element) {
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
          return element.value || element.getAttribute("placeholder") || element.getAttribute("aria-label") || "";
        }
        return (element.innerText || element.textContent || "").replace(/\\s+/g, " ").trim();
      }

      function roundedRect(rect) {
        return {
          x: round(rect.x),
          y: round(rect.y),
          width: round(rect.width),
          height: round(rect.height),
          top: round(rect.top),
          right: round(rect.right),
          bottom: round(rect.bottom),
          left: round(rect.left),
        };
      }

      function round(value) {
        return Math.round(value * 100) / 100;
      }

      function stableNodeId(element) {
        const parts = [];
        let current = element;
        while (current && current !== document.body && parts.length < 5) {
          const label = current.id ? "#" + current.id : current.tagName.toLowerCase() + classSuffix(current);
          parts.unshift(label);
          current = current.parentElement;
        }
        return parts.join(">");
      }

      function selectorFor(element) {
        if (element.id) return "#" + cssEscape(element.id);
        const parts = [];
        let current = element;
        while (current && current !== document.body && parts.length < 6) {
          let part = current.tagName.toLowerCase();
          const stableClasses = String(current.className || "")
            .split(/\\s+/)
            .filter((item) => item && !/[0-9a-f]{6,}|css-|^_/i.test(item))
            .slice(0, 2);
          if (stableClasses.length) part += "." + stableClasses.map(cssEscape).join(".");
          const parent = current.parentElement;
          if (parent) {
            const siblings = [...parent.children].filter((child) => child.tagName === current.tagName);
            if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
          }
          parts.unshift(part);
          current = parent;
        }
        return "body > " + parts.join(" > ");
      }

      function classSuffix(element) {
        const value = String(element.className || "")
          .split(/\\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .join(".");
        return value ? "." + value : "";
      }

      function cssEscape(value) {
        return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
      }

      function implicitRole(element) {
        const tag = element.tagName;
        if (/^H[1-6]$/.test(tag)) return "heading";
        if (tag === "A" && element.getAttribute("href")) return "link";
        if (tag === "BUTTON") return "button";
        if (tag === "INPUT" || tag === "TEXTAREA") return "textbox";
        if (tag === "SELECT") return "combobox";
        if (tag === "NAV") return "navigation";
        if (tag === "MAIN") return "main";
        return "";
      }

      function outsideViewport(rect, currentViewport, margin) {
        const outside = {
          left: rect.left < margin,
          top: rect.top < margin,
          right: rect.right > currentViewport.width - margin,
          bottom: rect.bottom > currentViewport.height - margin,
        };
        return outside.left || outside.top || outside.right || outside.bottom ? outside : null;
      }

      function findInteractiveOverlaps(elements, records) {
        const interactive = elements.filter((element) => records.get(element)?.interactive);
        const byParent = new Map();
        for (const element of interactive) {
          const parent = element.parentElement;
          if (!parent) continue;
          if (!byParent.has(parent)) byParent.set(parent, []);
          byParent.get(parent).push(element);
        }
        const overlapViolations = [];
        for (const siblings of byParent.values()) {
          if (siblings.length > 20) continue;
          for (let i = 0; i < siblings.length; i += 1) {
            for (let j = i + 1; j < siblings.length; j += 1) {
              const a = records.get(siblings[i]);
              const b = records.get(siblings[j]);
              if (!a || !b) continue;
              const area = overlapArea(a.rect, b.rect);
              if (area <= 8) continue;
              if (siblings[i].contains(siblings[j]) || siblings[j].contains(siblings[i])) continue;
              overlapViolations.push({
                type: "interactive-overlap",
                severity: "error",
                selector: a.selector,
                relatedSelector: b.selector,
                message: "Interactive controls overlap within the same parent.",
                text: [a.text, b.text].filter(Boolean).join(" / ").slice(0, 240),
                rect: a.rect,
                relatedRect: b.rect,
                details: { overlapArea: area },
              });
            }
          }
        }
        return overlapViolations.slice(0, 50);
      }

      function findControlClusterLayoutIssues(elements, records) {
        const issues = [];
        const parentCandidates = elements.filter((element) => {
          const style = getComputedStyle(element);
          const record = records.get(element);
          if (!record || record.rect.width < 320) return false;
          const className = String(element.className || "");
          const looksLikeCluster = /controls|toolbar|actions|filters|switcher|toggle/i.test(className);
          return (style.display === "flex" || style.display === "inline-flex") && (style.flexWrap !== "nowrap" || looksLikeCluster);
        });
        for (const parent of parentCandidates) {
          const parentRecord = records.get(parent);
          const children = [...parent.children]
            .filter((child) => records.has(child) && isControlClusterItem(child, records.get(child)))
            .filter((child) => !child.closest("[data-ui-ignore-cluster='true']"));
          if (children.length < 4) continue;
          const rows = groupControlRows(children, records);
          if (rows.length <= 1) continue;
          const parentRect = parentRecord.rect;
          const rowSummaries = rows.map((row, index) => {
            const rowLeft = Math.min(...row.map((item) => records.get(item).rect.left));
            const rowRight = Math.max(...row.map((item) => records.get(item).rect.right));
            const rowTop = Math.min(...row.map((item) => records.get(item).rect.top));
            const rowBottom = Math.max(...row.map((item) => records.get(item).rect.bottom));
            return {
              index,
              count: row.length,
              left: round(rowLeft),
              right: round(rowRight),
              top: round(rowTop),
              bottom: round(rowBottom),
              width: round(rowRight - rowLeft),
              fillRatio: round((rowRight - rowLeft) / Math.max(1, parentRect.width)),
              unusedRight: round(parentRect.right - rowRight),
              selectors: row.map((item) => records.get(item).selector),
              texts: row.map((item) => records.get(item).text || records.get(item).ariaLabel || records.get(item).title).filter(Boolean),
            };
          });

          const last = rowSummaries.at(-1);
          if (
            last &&
            last.count === 1 &&
            last.fillRatio < 0.35 &&
            last.unusedRight > Math.min(260, parentRect.width * 0.3) &&
            !parent.closest("[data-ui-allow-lonely-row='true']")
          ) {
            issues.push({
              type: "control-cluster-lonely-row",
              severity: "warning",
              selector: parentRecord.selector,
              relatedSelector: last.selectors[0],
              message: "A wrapped control cluster leaves a single small control alone on the last row.",
              text: last.texts[0] || "",
              rect: parentRect,
              details: {
                rowCount: rows.length,
                lastRow: last,
                parentText: parentRecord.text.slice(0, 240),
                allowWith: "Rebalance controls, move the control to a compact affordance, or annotate the cluster with data-ui-allow-lonely-row='true' if intentional.",
              },
            });
          }

          if (rows.length > 2 && parentRect.width >= 440 && !parent.closest("[data-ui-allow-fragmented-controls='true']")) {
            issues.push({
              type: "control-cluster-fragmented",
              severity: "warning",
              selector: parentRecord.selector,
              message: "A control cluster wraps into more than two visual rows.",
              text: parentRecord.text.slice(0, 240),
              rect: parentRect,
              details: { rowCount: rows.length, rows: rowSummaries },
            });
          }

          for (const row of rowSummaries) {
            if (row.count < 2) continue;
            const heights = rows[row.index].map((item) => records.get(item).rect.height);
            const tops = rows[row.index].map((item) => records.get(item).rect.top);
            const heightDelta = round(Math.max(...heights) - Math.min(...heights));
            const topDelta = round(Math.max(...tops) - Math.min(...tops));
            if (heightDelta > 8 || topDelta > 5) {
              issues.push({
                type: "control-row-alignment-drift",
                severity: "warning",
                selector: parentRecord.selector,
                message: "Controls sharing a row have noticeably different heights or vertical alignment.",
                rect: parentRect,
                details: { row, heightDelta, topDelta },
              });
            }
          }
        }
        return issues.slice(0, 80);
      }

      function isControlClusterItem(element, record) {
        if (!record) return false;
        if (element.matches("button,select,input,textarea,[role='button'],[role='tab'],[role='switch'],[role='checkbox'],[role='radio']")) return true;
        if (/button|select|toggle|control|chip|usage|picker/i.test(record.className)) return true;
        return false;
      }

      function groupControlRows(children, records) {
        const rows = [];
        const sorted = [...children].sort((a, b) => records.get(a).rect.top - records.get(b).rect.top || records.get(a).rect.left - records.get(b).rect.left);
        for (const child of sorted) {
          const rect = records.get(child).rect;
          const center = rect.top + rect.height / 2;
          let row = rows.find((candidate) => Math.abs(candidate.center - center) <= 10);
          if (!row) {
            row = { center, items: [] };
            rows.push(row);
          }
          row.items.push(child);
          row.center = row.items.reduce((sum, item) => {
            const itemRect = records.get(item).rect;
            return sum + itemRect.top + itemRect.height / 2;
          }, 0) / row.items.length;
        }
        return rows.map((row) => row.items.sort((a, b) => records.get(a).rect.left - records.get(b).rect.left));
      }

      function findCompressedControls(elements, records) {
        const issues = [];
        for (const element of elements) {
          const record = records.get(element);
          if (!record) continue;
          if (element.matches("select")) {
            const value = element.options?.[element.selectedIndex]?.textContent?.trim() || element.value || record.text;
            const style = getComputedStyle(element);
            const measured = measureTextWidth(value, style.font);
            const available = Math.max(0, record.rect.width - 28);
            if (value.length >= 12 && measured > available * 1.35 && !element.closest("[data-ui-allow-compressed-control='true']")) {
              issues.push({
                type: "compressed-select-label",
                severity: "warning",
                selector: record.selector,
                message: "A select control is too narrow to show its active value clearly.",
                text: value,
                rect: record.rect,
                details: {
                  measuredTextWidth: round(measured),
                  availableTextWidth: round(available),
                  widthRatio: round(available / Math.max(1, measured)),
                  hasDisclosure: Boolean(record.title || record.ariaLabel),
                  allowWith: "Widen the select, abbreviate the visible label intentionally, or annotate with data-ui-allow-compressed-control='true'.",
                },
              });
            }
          }
          if (record.interactive && !element.closest("[data-ui-allow-small-target='true']")) {
            const isInlineTextLink = element.tagName === "A" && record.rect.height < 24 && record.text.length > 0;
            const minSide = Math.min(record.rect.width, record.rect.height);
            if (!isInlineTextLink && minSide > 0 && minSide < 24) {
              issues.push({
                type: "small-interactive-target",
                severity: "warning",
                selector: record.selector,
                message: "Interactive target is smaller than the minimum practical hit area.",
                text: record.text || record.ariaLabel || record.title,
                rect: record.rect,
                details: { minSide, recommendedMinSide: 24 },
              });
            }
          }
        }
        return issues.slice(0, 80);
      }

      function findMissingAccessibleLabels(elements, records) {
        const issues = [];
        for (const element of elements) {
          const record = records.get(element);
          if (!record?.interactive) continue;
          if (!needsExplicitAccessibleName(element, record)) continue;
          if (accessibleNameFor(element, record)) continue;
          issues.push({
            type: "missing-accessible-label",
            severity: "warning",
            selector: record.selector,
            message: "Icon-only interactive control does not expose an accessible name.",
            rect: record.rect,
            details: {
              role: record.role,
              tag: record.tag,
              className: record.className,
              allowWith: "Add visible text, aria-label, aria-labelledby, a title, or an associated label.",
            },
          });
        }
        return issues.slice(0, 80);
      }

      function findFocusRingIssues(records) {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement || active instanceof SVGElement)) return [];
        if (active === document.body || active === document.documentElement) return [];
        if (!isVisibleElement(active)) return [];

        const record = records.get(active) || describeElement(active);
        const style = getComputedStyle(active);
        const outlineWidth = parseCssPixels(style.outlineWidth);
        const outlineOffset = parseCssPixels(style.outlineOffset);
        const shadowSpread = maxBoxShadowExtent(style.boxShadow);
        const hasIndicator =
          (outlineWidth > 0 && style.outlineStyle !== "none") ||
          shadowSpread > 0 ||
          style.outlineStyle === "auto";
        if (!hasIndicator) return [];

        const focusMargin = Math.max(2, outlineWidth + Math.abs(outlineOffset), shadowSpread);
        const focusRect = expandRect(record.rect, focusMargin);
        const viewportClip = outsideViewport(focusRect, viewport, 0);
        if (viewportClip) {
          return [
            {
              type: "focus-ring-clipped",
              severity: "warning",
              selector: record.selector,
              message: "Focused control's visible focus indicator extends outside the viewport.",
              text: record.text || record.ariaLabel || record.title,
              rect: record.rect,
              details: {
                focusRect,
                focusMargin: round(focusMargin),
                clip: viewportClip,
                styles: {
                  outlineWidth: style.outlineWidth,
                  outlineOffset: style.outlineOffset,
                  outlineStyle: style.outlineStyle,
                  boxShadow: style.boxShadow,
                },
              },
            },
          ];
        }

        for (let ancestor = active.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
          const ancestorStyle = getComputedStyle(ancestor);
          if (!clips(ancestorStyle.overflowX) && !clips(ancestorStyle.overflowY)) continue;
          const ancestorRecord = records.get(ancestor) || describeElement(ancestor);
          const clip = rectClipDelta(focusRect, ancestorRecord.rect, ancestorStyle);
          if (!clip) continue;
          return [
            {
              type: "focus-ring-clipped",
              severity: "warning",
              selector: record.selector,
              relatedSelector: ancestorRecord.selector,
              message: "Focused control's visible focus indicator is clipped by an overflow container.",
              text: record.text || record.ariaLabel || record.title,
              rect: record.rect,
              relatedRect: ancestorRecord.rect,
              details: {
                focusRect,
                focusMargin: round(focusMargin),
                clip,
                overflow: {
                  x: ancestorStyle.overflowX,
                  y: ancestorStyle.overflowY,
                },
                styles: {
                  outlineWidth: style.outlineWidth,
                  outlineOffset: style.outlineOffset,
                  outlineStyle: style.outlineStyle,
                  boxShadow: style.boxShadow,
                },
              },
            },
          ];
        }

        return [];
      }

      function findLowContrastText(elements, records) {
        const issues = [];
        for (const element of elements) {
          const record = records.get(element);
          if (!record) continue;
          if (element.closest("[data-ui-allow-low-contrast='true']")) continue;
          if (!isTextContrastCandidate(element, record)) continue;
          const text = contrastTextFor(element, record);
          if (!text) continue;

          const style = getComputedStyle(element);
          const foreground = parseCssColor(style.color);
          if (!foreground) continue;
          const background = effectiveBackgroundColor(element);
          if (!background) continue;

          const foregroundAlpha = clamp01(foreground.a * effectiveOpacity(element));
          const foregroundOnBackground = blendColors({ ...foreground, a: foregroundAlpha }, background);
          const ratio = contrastRatio(foregroundOnBackground, background);
          const fontSize = parseCssPixels(style.fontSize);
          const fontWeight = parseFontWeight(style.fontWeight);
          const largeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
          const disabled = element.matches(":disabled,[aria-disabled='true']") || Boolean(element.closest("[aria-disabled='true']"));
          const threshold = disabled ? 3 : largeText ? 3 : 4.5;
          if (ratio >= threshold) continue;

          issues.push({
            type: "low-contrast-text",
            severity: ratio < 3 ? "error" : "warning",
            selector: record.selector,
            message: "Visible text has insufficient contrast against its effective background.",
            text,
            rect: record.rect,
            details: {
              contrastRatio: round(ratio),
              requiredRatio: threshold,
              color: style.color,
              effectiveTextColor: colorToString(foregroundOnBackground),
              effectiveBackgroundColor: colorToString(background),
              backgroundColor: style.backgroundColor,
              backgroundImage: style.backgroundImage === "none" ? "" : style.backgroundImage.slice(0, 160),
              opacity: round(effectiveOpacity(element)),
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              largeText,
              disabled,
              allowWith: "Adjust semantic foreground/background tokens or annotate intentionally decorative text with data-ui-allow-low-contrast='true'.",
            },
          });
        }
        return issues.slice(0, 120);
      }

      function isTextContrastCandidate(element, record) {
        if (!isTextCandidate(element, record)) return false;
        if (record.rect.width < 3 || record.rect.height < 3) return false;
        if (record.text.length > 500) return false;
        if (element.matches("svg,canvas,img,video")) return false;
        if (element.closest("svg")) return false;
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
        if (record.directText.trim().length > 0) return true;
        if (element.children.length === 0 && record.text.trim().length > 0) return true;
        if (record.interactive && record.text.trim().length > 0 && [...element.children].filter((child) => isVisibleElement(child)).length <= 1) return true;
        return false;
      }

      function contrastTextFor(element, record) {
        const text = (
          element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
            ? record.text
            : record.directText || (element.children.length === 0 ? record.text : record.interactive ? record.text : "")
        ).replace(/\\s+/g, " ").trim();
        if (!text) return "";
        if (text.length === 1 && !record.interactive) return "";
        return text.slice(0, 240);
      }

      function effectiveBackgroundColor(element) {
        const fallback = document.documentElement.dataset.theme === "dark"
          ? { r: 15, g: 20, b: 24, a: 1 }
          : { r: 255, g: 255, b: 255, a: 1 };
        const ancestors = [];
        for (let current = element; current && current instanceof Element; current = current.parentElement) {
          ancestors.push(current);
        }
        let background = fallback;
        for (const current of ancestors.reverse()) {
          const parsed = parseCssColor(getComputedStyle(current).backgroundColor);
          if (parsed && parsed.a > 0) background = blendColors(parsed, background);
        }
        return { ...background, a: 1 };
      }

      function effectiveOpacity(element) {
        let opacity = 1;
        for (let current = element; current && current instanceof Element; current = current.parentElement) {
          const parsed = Number.parseFloat(getComputedStyle(current).opacity);
          if (Number.isFinite(parsed)) opacity *= clamp01(parsed);
        }
        return opacity;
      }

      function parseCssColor(value) {
        if (!value || value === "transparent") return null;
        const srgbMatch = String(value).match(/^color\\(\\s*srgb\\s+(.+)\\)$/i);
        if (srgbMatch) {
          const numbers = srgbMatch[1].match(/-?\\d*\\.?\\d+(?:e-?\\d+)?/gi)?.map(Number) ?? [];
          if (numbers.length < 3) return null;
          return {
            r: clamp255(numbers[0] * 255),
            g: clamp255(numbers[1] * 255),
            b: clamp255(numbers[2] * 255),
            a: clamp01(numbers.length >= 4 ? numbers[3] : 1),
          };
        }
        const numbers = String(value).match(/-?\\d*\\.?\\d+/g)?.map(Number) ?? [];
        if (numbers.length < 3) return null;
        return {
          r: clamp255(numbers[0]),
          g: clamp255(numbers[1]),
          b: clamp255(numbers[2]),
          a: clamp01(numbers.length >= 4 ? numbers[3] : 1),
        };
      }

      function blendColors(foreground, background) {
        const alpha = clamp01(foreground.a);
        const inverse = 1 - alpha;
        return {
          r: foreground.r * alpha + background.r * inverse,
          g: foreground.g * alpha + background.g * inverse,
          b: foreground.b * alpha + background.b * inverse,
          a: 1,
        };
      }

      function contrastRatio(foreground, background) {
        const fg = relativeLuminance(foreground);
        const bg = relativeLuminance(background);
        const lighter = Math.max(fg, bg);
        const darker = Math.min(fg, bg);
        return (lighter + 0.05) / (darker + 0.05);
      }

      function relativeLuminance(color) {
        const values = [color.r, color.g, color.b].map((channel) => {
          const value = clamp255(channel) / 255;
          return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
        });
        return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
      }

      function parseFontWeight(value) {
        if (value === "bold") return 700;
        if (value === "normal") return 400;
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : 400;
      }

      function colorToString(color) {
        return "rgb(" + Math.round(color.r) + ", " + Math.round(color.g) + ", " + Math.round(color.b) + ")";
      }

      function clamp01(value) {
        if (!Number.isFinite(value)) return 1;
        return Math.min(1, Math.max(0, value));
      }

      function clamp255(value) {
        if (!Number.isFinite(value)) return 0;
        return Math.min(255, Math.max(0, value));
      }

      function findRequiredActionIssues(records) {
        const issues = [];
        for (const element of document.querySelectorAll("[data-ui-required-action]")) {
          if (!(element instanceof HTMLElement || element instanceof SVGElement)) continue;
          const requiredAction = element.getAttribute("data-ui-required-action") || "";
          const hiddenReason = hiddenElementReason(element);
          const record = records.get(element) || describeElement(element);
          if (hiddenReason) {
            issues.push({
              type: "required-action-hidden",
              severity: "error",
              selector: record.selector,
              message: "Required action is present in the active UI state but is hidden or has no usable box.",
              text: record.text || record.ariaLabel || record.title || requiredAction,
              rect: record.rect,
              details: { requiredAction, hiddenReason },
            });
            continue;
          }

          const outside = outsideViewport(record.rect, viewport, 1);
          const clipInfo = firstClippingAncestorClip(element, record.rect, records, true);
          if (!outside && !clipInfo) continue;
          issues.push({
            type: "required-action-hidden",
            severity: "error",
            selector: record.selector,
            relatedSelector: clipInfo?.ancestor.selector,
            message: outside ? "Required action extends outside the viewport." : "Required action is clipped by a scroll or overflow container.",
            text: record.text || record.ariaLabel || record.title || requiredAction,
            rect: record.rect,
            relatedRect: clipInfo?.ancestor.rect,
            details: { requiredAction, outside, clip: clipInfo?.clip, overflow: clipInfo?.overflow },
          });
        }
        return issues.slice(0, 80);
      }

      function findOffscreenActiveMenuItems(elements, records) {
        const issues = [];
        const menuSelector = "[role='menu'],[role='listbox'],[role='tree'],.command-list,.model-picker-menu,.project-board-plan-picker";
        const activeSelector = "[aria-selected='true'],[aria-current='true'],.selected,.active";
        for (const menu of elements.filter((element) => element.matches(menuSelector))) {
          const menuRecord = records.get(menu);
          if (!menuRecord) continue;
          for (const active of menu.querySelectorAll(activeSelector)) {
            if (!(active instanceof HTMLElement || active instanceof SVGElement)) continue;
            if (active === menu || !isActiveMenuCandidate(active)) continue;
            const record = records.get(active) || describeElement(active);
            const outside = outsideViewport(record.rect, viewport, 0);
            const clipInfo = firstClippingAncestorClip(active, record.rect, records, true);
            if (!outside && !clipInfo) continue;
            issues.push({
              type: "offscreen-active-menu-item",
              severity: "warning",
              selector: record.selector,
              relatedSelector: clipInfo?.ancestor.selector || menuRecord.selector,
              message: outside ? "Selected menu or listbox item extends outside the viewport." : "Selected menu or listbox item is clipped by its scroll container.",
              text: record.text || record.ariaLabel || record.title,
              rect: record.rect,
              relatedRect: clipInfo?.ancestor.rect || menuRecord.rect,
              details: {
                outside,
                clip: clipInfo?.clip,
                overflow: clipInfo?.overflow,
                menuSelector: menuRecord.selector,
              },
            });
          }
        }
        return issues.slice(0, 80);
      }

      function isActiveMenuCandidate(element) {
        if (element.matches("[role='option'],[role='menuitem'],[role='treeitem'],button,a[href]")) return true;
        return /command-row|picker-option|menuitem|option/i.test(String(element.className || ""));
      }

      function findStickyHeaderOverlaps(elements, records) {
        const issues = [];
        const stickySources = elements.filter((element) => {
          const record = records.get(element);
          if (!record) return false;
          if (record.rect.width < 32 || record.rect.height < 16) return false;
          if (element.closest("[data-ui-allow-sticky-overlap='true']")) return false;
          if (record.styles.position !== "sticky" && record.styles.position !== "fixed") return false;
          return isStickyOverlapSource(element, record);
        });
        const targets = elements.filter((element) => {
          const record = records.get(element);
          if (!record) return false;
          if (record.rect.width < 4 || record.rect.height < 4) return false;
          if (element.closest("[data-ui-allow-sticky-overlap='true']")) return false;
          return isStickyOverlapTarget(element, record);
        });

        for (const sticky of stickySources) {
          const stickyRecord = records.get(sticky);
          const stickyZ = zIndexValue(stickyRecord);
          for (const target of targets) {
            if (sticky === target || sticky.contains(target) || target.contains(sticky)) continue;
            const targetRecord = records.get(target);
            if (!targetRecord) continue;
            if (stickyRecord.selector === targetRecord.selector) continue;
            if (!stickyDominatesTarget(stickyRecord, stickyZ, targetRecord)) continue;
            const area = overlapArea(stickyRecord.rect, targetRecord.rect);
            if (area <= 24) continue;
            const targetArea = Math.max(1, targetRecord.rect.width * targetRecord.rect.height);
            const coverage = round(area / targetArea);
            const centerCovered = pointInsideRect(
              { x: targetRecord.rect.left + targetRecord.rect.width / 2, y: targetRecord.rect.top + targetRecord.rect.height / 2 },
              stickyRecord.rect,
            );
            if (!centerCovered && coverage < 0.45 && area < 220) continue;
            issues.push({
              type: "sticky-header-overlap",
              severity: "error",
              selector: stickyRecord.selector,
              relatedSelector: targetRecord.selector,
              message: "Sticky or fixed header-like surface overlaps visible content or controls.",
              text: [stickyRecord.text || stickyRecord.ariaLabel || stickyRecord.title, targetRecord.text || targetRecord.ariaLabel || targetRecord.title].filter(Boolean).join(" / ").slice(0, 240),
              rect: stickyRecord.rect,
              relatedRect: targetRecord.rect,
              details: {
                overlapArea: area,
                targetCoverage: coverage,
                centerCovered,
                sourcePosition: stickyRecord.styles.position,
                sourceZIndex: stickyRecord.styles.zIndex,
                targetZIndex: targetRecord.styles.zIndex,
                allowWith: "Reserve layout space, lower the sticky layer, or annotate intentional overlays with data-ui-allow-sticky-overlap='true'.",
              },
            });
          }
        }
        return issues.slice(0, 80);
      }

      function findUnreachableScrollContent(records) {
        const issues = [];
        for (const element of document.querySelectorAll("[data-ui-scroll-container]")) {
          if (!(element instanceof HTMLElement || element instanceof SVGElement)) continue;
          if (!isVisibleElement(element)) continue;
          if (element.closest("[data-ui-allow-unreachable-scroll='true']")) continue;
          const record = records.get(element) || describeElement(element);
          const style = getComputedStyle(element);
          const overflowX = style.overflowX;
          const overflowY = style.overflowY;
          const extraX = element.scrollWidth > element.clientWidth + 1;
          const extraY = element.scrollHeight > element.clientHeight + 1;
          const unreachableX = extraX && clips(overflowX);
          const unreachableY = extraY && clips(overflowY);
          if (!unreachableX && !unreachableY) continue;
          issues.push({
            type: "unreachable-scroll-content",
            severity: "error",
            selector: record.selector,
            message: "Annotated scroll container has clipped overflow that cannot be reached by scrolling.",
            text: record.text,
            rect: record.rect,
            details: {
              scrollContainer: element.getAttribute("data-ui-scroll-container") || "required",
              client: record.client,
              scroll: record.scroll,
              overflow: { x: overflowX, y: overflowY },
              unreachable: { x: unreachableX, y: unreachableY },
              allowWith: "Use overflow auto/scroll for required scroll containers, remove the scroll-container annotation, or explicitly annotate an intentional clip.",
            },
          });
        }
        return issues.slice(0, 80);
      }

      function isStickyOverlapSource(element, record) {
        if (record.data.stickyGuard === "true") return true;
        const label = [element.tagName, record.role, record.className, record.ariaLabel, record.title].join(" ");
        if (element.tagName === "HEADER") return true;
        if (/\\b(header|topbar|toolbar|menubar|composer|sticky|dock|rail)\\b/i.test(label)) return true;
        return record.styles.position === "fixed" && /\\b(action|status|banner|notice)\\b/i.test(label);
      }

      function isStickyOverlapTarget(element, record) {
        if (record.interactive) return true;
        if (TEXT_TAGS.has(element.tagName) && (record.directText || record.text).trim().length > 0) return true;
        if (["button", "link", "heading", "tab", "menuitem", "checkbox", "radio", "switch"].includes(record.role)) return true;
        return false;
      }

      function stickyDominatesTarget(stickyRecord, stickyZ, targetRecord) {
        if (stickyRecord.data.stickyGuard === "true") return true;
        if (stickyRecord.styles.position === "fixed" && stickyZ >= zIndexValue(targetRecord)) return true;
        return stickyZ > zIndexValue(targetRecord);
      }

      function zIndexValue(record) {
        const parsed = Number.parseInt(record?.styles?.zIndex ?? "0", 10);
        return Number.isFinite(parsed) ? parsed : 0;
      }

      function needsExplicitAccessibleName(element, record) {
        if (element.closest("[data-ui-allow-unlabeled-control='true']")) return false;
        if (element instanceof HTMLInputElement) return ["button", "checkbox", "radio", "submit", "reset"].includes(element.type);
        if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) return true;
        if (record.role === "button" || record.role === "tab" || record.role === "menuitem" || record.role === "checkbox" || record.role === "radio" || record.role === "switch") {
          return true;
        }
        return element.matches("button,a[href],[role='button'],[role='tab'],[role='menuitem'],[role='checkbox'],[role='radio'],[role='switch']");
      }

      function accessibleNameFor(element, record) {
        const candidates = [
          record.ariaLabel,
          labelledByText(element),
          associatedLabelText(element),
          record.title,
          record.text,
          element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.placeholder : "",
          element instanceof HTMLImageElement ? element.alt : "",
        ];
        return candidates.map((item) => String(item || "").replace(/\\s+/g, " ").trim()).find(Boolean) || "";
      }

      function labelledByText(element) {
        const ids = (element.getAttribute("aria-labelledby") || "").split(/\\s+/).filter(Boolean);
        return ids.map((id) => document.getElementById(id)?.textContent || "").join(" ");
      }

      function associatedLabelText(element) {
        if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
          const explicit = [...(element.labels || [])].map((label) => label.textContent || "").join(" ");
          if (explicit.trim()) return explicit;
        }
        return element.closest("label")?.textContent || "";
      }

      function measureTextWidth(text, font) {
        const canvas = window.__ambientUiModelMeasureCanvas || (window.__ambientUiModelMeasureCanvas = document.createElement("canvas"));
        const context = canvas.getContext("2d");
        if (!context) return text.length * 8;
        context.font = font;
        return context.measureText(text).width;
      }

      function parseCssPixels(value) {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }

      function hiddenElementReason(element) {
        if (element.closest("[hidden]")) return "hidden-attribute";
        if (element.closest("[aria-hidden='true']")) return "aria-hidden";
        const style = getComputedStyle(element);
        if (style.display === "none") return "display-none";
        if (style.visibility === "hidden") return "visibility-hidden";
        if (Number(style.opacity) === 0) return "opacity-zero";
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return "empty-rect";
        return "";
      }

      function maxBoxShadowExtent(value) {
        if (!value || value === "none") return 0;
        const pixelValues = [...String(value).matchAll(/(-?\\d*\\.?\\d+)px/g)].map((match) => Math.abs(Number.parseFloat(match[1])));
        return pixelValues.length ? Math.max(...pixelValues) : 0;
      }

      function expandRect(rect, amount) {
        return {
          x: round(rect.x - amount),
          y: round(rect.y - amount),
          width: round(rect.width + amount * 2),
          height: round(rect.height + amount * 2),
          top: round(rect.top - amount),
          right: round(rect.right + amount),
          bottom: round(rect.bottom + amount),
          left: round(rect.left - amount),
        };
      }

      function firstClippingAncestorClip(element, rect, records, includeScrollable = false) {
        for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
          const ancestorStyle = getComputedStyle(ancestor);
          const clipsX = includeScrollable ? clipsOrScrolls(ancestorStyle.overflowX) : clips(ancestorStyle.overflowX);
          const clipsY = includeScrollable ? clipsOrScrolls(ancestorStyle.overflowY) : clips(ancestorStyle.overflowY);
          if (!clipsX && !clipsY) continue;
          const ancestorRecord = records.get(ancestor) || describeElement(ancestor);
          const clip = rectClipDelta(rect, ancestorRecord.rect, ancestorStyle, includeScrollable);
          if (!clip) continue;
          return {
            ancestor: ancestorRecord,
            clip,
            overflow: {
              x: ancestorStyle.overflowX,
              y: ancestorStyle.overflowY,
            },
          };
        }
        return null;
      }

      function clipsOrScrolls(value) {
        return clips(value) || value === "auto" || value === "scroll";
      }

      function rectClipDelta(rect, clipRect, clipStyle, includeScrollable = false) {
        const clip = {};
        const clipsX = includeScrollable ? clipsOrScrolls(clipStyle.overflowX) : clips(clipStyle.overflowX);
        const clipsY = includeScrollable ? clipsOrScrolls(clipStyle.overflowY) : clips(clipStyle.overflowY);
        if (clipsX) {
          if (rect.left < clipRect.left - 1) clip.left = round(clipRect.left - rect.left);
          if (rect.right > clipRect.right + 1) clip.right = round(rect.right - clipRect.right);
        }
        if (clipsY) {
          if (rect.top < clipRect.top - 1) clip.top = round(clipRect.top - rect.top);
          if (rect.bottom > clipRect.bottom + 1) clip.bottom = round(rect.bottom - clipRect.bottom);
        }
        return Object.keys(clip).length ? clip : null;
      }

      function overlapArea(a, b) {
        const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        return Math.round(width * height * 100) / 100;
      }

      function pointInsideRect(point, rect) {
        return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
      }

      function collectAlignmentGroups() {
        const groups = new Map();
        for (const element of document.querySelectorAll("[data-ui-align-group]")) {
          if (!isVisibleElement(element)) continue;
          const name = element.getAttribute("data-ui-align-group") || "";
          if (!name) continue;
          if (!groups.has(name)) groups.set(name, []);
          groups.get(name).push(element);
        }
        return [...groups.entries()].map(([name, items]) => {
          const records = items.map((item) => describeElement(item));
          const axis = items[0].getAttribute("data-ui-align-axis") || "top";
          const values = records.map((record) => record.rect[axis]).filter((value) => typeof value === "number");
          const min = Math.min(...values);
          const max = Math.max(...values);
          const delta = Math.round((max - min) * 100) / 100;
          const violations = delta > 2
            ? [{
                type: "alignment-group-drift",
                severity: "warning",
                selector: "[data-ui-align-group='" + name + "']",
                message: "Annotated alignment group exceeds tolerance.",
                details: { group: name, axis, min, max, delta, tolerance: 2 },
              }]
            : [];
          return { name, axis, count: records.length, min, max, delta, nodes: records.map((record) => record.selector), violations };
        });
      }
    })()
  `;
}

async function collectTooltipSamples(cdp, scenario) {
  const triggers = await evaluate(
    cdp,
    `
    (() => {
      const seen = new Set();
      const ordered = [];
      for (const selector of [
        ".info-tooltip-trigger",
        "[data-ui-tooltip-trigger='true']",
        ".project-board-draft-bulk-row button[title]",
        ".project-board-card button[title]",
        ".project-board-workspace header button[title]",
        ".project-board-workspace button[title]"
      ]) {
        for (const element of document.querySelectorAll(selector)) {
          if (seen.has(element)) continue;
          seen.add(element);
          ordered.push(element);
        }
      }
      return ordered
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const label = element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || "";
        const topAtCenter = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const topmost = Boolean(topAtCenter && (topAtCenter === element || element.contains(topAtCenter)));
        return rect.width > 0 && rect.height > 0 && label.trim() && style.visibility !== "hidden" && style.display !== "none" && topmost;
      })
      .slice(0, 36)
      .map((element, index) => {
        const sampleId = "tooltip-sample-" + index;
        element.setAttribute("data-ui-model-tooltip-sample-id", sampleId);
        const rect = element.getBoundingClientRect();
        return {
          index,
          sampleId,
          selector: (() => {
            if (element.id) return "#" + element.id;
            const label = element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || "";
            return element.tagName.toLowerCase() + "[tooltip-trigger:" + label.trim().slice(0, 80) + "]";
          })(),
          label: (element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 200),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        };
      });
    })()
  `,
  );
  const samples = [];
  for (const trigger of triggers.slice(0, 24)) {
    const rect = await evaluate(
      cdp,
      `
      (() => {
        const element = document.querySelector(${JSON.stringify(`[data-ui-model-tooltip-sample-id="${trigger.sampleId}"]`)});
        if (!element) return null;
        element.scrollIntoView({ block: "center", inline: "nearest" });
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      })()
    `,
    );
    if (!rect) continue;
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    await delay(100);
    const overlay = await evaluate(
      cdp,
      `
      (() => {
        const overlays = [...document.querySelectorAll("[role='tooltip'],.info-tooltip-bubble")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) !== 0;
          })
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const points = [
              { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
              { x: rect.left + Math.min(12, rect.width / 2), y: rect.top + Math.min(12, rect.height / 2) },
              { x: rect.right - Math.min(12, rect.width / 2), y: rect.top + Math.min(12, rect.height / 2) },
              { x: rect.left + Math.min(12, rect.width / 2), y: rect.bottom - Math.min(12, rect.height / 2) },
              { x: rect.right - Math.min(12, rect.width / 2), y: rect.bottom - Math.min(12, rect.height / 2) }
            ];
            const occludedBy = [];
            const previousPointerEvents = element.style.pointerEvents;
            element.style.pointerEvents = "auto";
            try {
              for (const point of points) {
                if (point.x < 0 || point.y < 0 || point.x > window.innerWidth || point.y > window.innerHeight) continue;
                const top = document.elementFromPoint(point.x, point.y);
                if (!top || top === element || element.contains(top)) continue;
                const topRect = top.getBoundingClientRect();
                occludedBy.push({
                  x: Math.round(point.x * 100) / 100,
                  y: Math.round(point.y * 100) / 100,
                  selector: top.className ? "." + String(top.className).trim().split(/\\s+/).join(".") : top.tagName.toLowerCase(),
                  text: (top.innerText || top.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 120),
                  rect: { left: Math.round(topRect.left * 100) / 100, top: Math.round(topRect.top * 100) / 100, right: Math.round(topRect.right * 100) / 100, bottom: Math.round(topRect.bottom * 100) / 100 }
                });
              }
            } finally {
              element.style.pointerEvents = previousPointerEvents;
            }
            return {
              selector: element.className ? "." + String(element.className).trim().split(/\\s+/).join(".") : element.tagName.toLowerCase(),
              text: (element.innerText || element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 300),
              rect: { x: Math.round(rect.x * 100) / 100, y: Math.round(rect.y * 100) / 100, width: Math.round(rect.width * 100) / 100, height: Math.round(rect.height * 100) / 100, left: Math.round(rect.left * 100) / 100, right: Math.round(rect.right * 100) / 100, top: Math.round(rect.top * 100) / 100, bottom: Math.round(rect.bottom * 100) / 100 },
              occludedBy,
            };
          });
        return { overlays, viewport: { width: window.innerWidth, height: window.innerHeight } };
      })()
    `,
    );
    samples.push({ scenario: scenario.name, trigger: { ...trigger, rect }, ...overlay });
  }
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 }).catch(() => undefined);
  return samples;
}

function tooltipViolations(samples) {
  const violations = [];
  for (const sample of samples) {
    if (sample.overlays.length === 0) {
      violations.push({
        type: "tooltip-not-rendered",
        severity: "warning",
        selector: sample.trigger.selector,
        message: "Tooltip trigger did not render an inspectable tooltip on hover.",
        text: sample.trigger.label,
        rect: roundPlainRect(sample.trigger.rect),
        details: { triggerIndex: sample.trigger.index, triggerSelector: sample.trigger.selector, triggerLabel: sample.trigger.label },
      });
      continue;
    }
    for (const overlay of sample.overlays) {
      const outside = {
        left: overlay.rect.left < 4,
        top: overlay.rect.top < 4,
        right: overlay.rect.right > sample.viewport.width - 4,
        bottom: overlay.rect.bottom > sample.viewport.height - 4,
      };
      if (outside.left || outside.top || outside.right || outside.bottom) {
        violations.push({
          type: "tooltip-outside-viewport",
          severity: "error",
          selector: sample.trigger.selector,
          relatedSelector: overlay.selector,
          message: "Tooltip extends outside viewport boundaries.",
          text: overlay.text,
          rect: overlay.rect,
          details: {
            viewport: sample.viewport,
            outside,
            triggerIndex: sample.trigger.index,
            triggerSelector: sample.trigger.selector,
            triggerLabel: sample.trigger.label,
          },
        });
      }
      if (overlay.occludedBy?.length) {
        violations.push({
          type: "tooltip-occluded",
          severity: "error",
          selector: sample.trigger.selector,
          relatedSelector: overlay.selector,
          message: "Tooltip is visually covered by another element.",
          text: overlay.text,
          rect: overlay.rect,
          details: {
            triggerIndex: sample.trigger.index,
            triggerSelector: sample.trigger.selector,
            triggerLabel: sample.trigger.label,
            occludedBy: overlay.occludedBy,
          },
        });
      }
      const triggerCenterX = sample.trigger.rect.left + sample.trigger.rect.width / 2;
      const triggerCenterY = sample.trigger.rect.top + sample.trigger.rect.height / 2;
      const overlayCenterX = overlay.rect.left + overlay.rect.width / 2;
      const overlayCenterY = overlay.rect.top + overlay.rect.height / 2;
      const distance = Math.round(Math.hypot(triggerCenterX - overlayCenterX, triggerCenterY - overlayCenterY));
      if (distance > 520) {
        violations.push({
          type: "tooltip-anchor-distance",
          severity: "warning",
          selector: sample.trigger.selector,
          relatedSelector: overlay.selector,
          message: "Tooltip rendered far away from its trigger.",
          text: overlay.text,
          rect: overlay.rect,
          details: {
            distancePx: distance,
            triggerIndex: sample.trigger.index,
            triggerSelector: sample.trigger.selector,
            triggerLabel: sample.trigger.label,
          },
        });
      }
    }
  }
  return violations;
}

function assertSelfTestDetections(models) {
  const expectedTypes = [
    "text-horizontal-clipping",
    "text-vertical-clipping",
    "interactive-overlap",
    "alignment-group-drift",
    "overlay-outside-viewport",
    "dialog-outside-viewport",
    "required-action-hidden",
    "control-cluster-lonely-row",
    "control-cluster-fragmented",
    "compressed-select-label",
    "small-interactive-target",
    "missing-accessible-label",
    "focus-ring-clipped",
    "offscreen-active-menu-item",
    "sticky-header-overlap",
    "unreachable-scroll-content",
    "low-contrast-text",
  ];
  const allViolations = models.flatMap((model) => model.violations.map((violation) => ({ scenario: model.scenario, ...violation })));
  const detected = new Set(allViolations.map((violation) => violation.type));
  const missing = expectedTypes.filter((type) => !detected.has(type));
  if (missing.length > 0) {
    throw new Error(
      `UI model self-test failed to detect expected violation types: ${missing.join(", ")}. Detected: ${[...detected].sort().join(", ") || "none"}`,
    );
  }
  console.log(`Self-test detected expected violation types: ${expectedTypes.join(", ")}.`);
}

async function focusViolation(cdp, model, violationId) {
  const violationIndex = model.violations.findIndex((violation) => violation.id === violationId || String(violation.sequence) === String(violationId));
  if (violationIndex < 0) {
    throw new Error(`Unable to find repro violation ${violationId} in scenario ${model.scenario}.`);
  }
  const violation = model.violations[violationIndex];
  const focusResult = await evaluate(
    cdp,
    `
    (() => {
      const violation = ${JSON.stringify(violation)};
      const styleId = "ui-model-repro-style";
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = [
          "[data-ui-model-repro-target='true'] { outline: 3px solid #ff2d55 !important; outline-offset: 3px !important; box-shadow: 0 0 0 7px rgba(255,45,85,0.18) !important; }",
          "[data-ui-model-repro-related='true'] { outline: 3px dashed #2563eb !important; outline-offset: 3px !important; box-shadow: 0 0 0 7px rgba(37,99,235,0.16) !important; }",
          "#ui-model-repro-callout { position: fixed; z-index: 2147483647; right: 16px; bottom: 16px; width: min(460px, calc(100vw - 32px)); padding: 12px 14px; border: 1px solid rgba(255,45,85,0.45); border-radius: 8px; background: rgba(17,24,39,0.94); color: #fff; font: 12px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; box-shadow: 0 18px 48px rgba(15,23,42,0.35); }",
          "#ui-model-repro-callout strong { display: block; margin-bottom: 4px; font-size: 13px; }",
          "#ui-model-repro-callout code { color: #fecdd3; }"
        ].join("\\n");
        document.head.append(style);
      }
      document.querySelectorAll("[data-ui-model-repro-target='true'],[data-ui-model-repro-related='true']").forEach((element) => {
        element.removeAttribute("data-ui-model-repro-target");
        element.removeAttribute("data-ui-model-repro-related");
      });
      document.getElementById("ui-model-repro-callout")?.remove();

      const isVisible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const safeQuery = (selector) => {
        if (!selector || selector.includes("[tooltip-trigger:")) return null;
        try {
          return document.querySelector(selector);
        } catch {
          return null;
        }
      };
      const tooltipTriggers = () => [...document.querySelectorAll(".info-tooltip-trigger,[data-ui-tooltip-trigger='true']")].filter(isVisible);
      const labelFor = (element) => (element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || "").replace(/\\s+/g, " ").trim();
      const findByTooltipDetails = () => {
        const triggers = tooltipTriggers();
        const triggerIndex = Number(violation.details?.triggerIndex);
        if (Number.isInteger(triggerIndex) && triggers[triggerIndex]) return triggers[triggerIndex];
        const triggerLabel = violation.details?.triggerLabel || violation.text || "";
        if (!triggerLabel) return null;
        return triggers.find((element) => {
          const label = labelFor(element);
          return label === triggerLabel || label.includes(triggerLabel.slice(0, 80)) || triggerLabel.includes(label.slice(0, 80));
        }) ?? null;
      };
      const findByText = () => {
        const needle = String(violation.text || violation.message || "").replace(/\\s+/g, " ").trim().slice(0, 120);
        if (!needle) return null;
        const candidates = [...document.querySelectorAll("button,select,a,input,textarea,[role='button'],[role='tooltip'],p,span,div")]
          .filter(isVisible)
          .slice(0, 2500);
        return candidates.find((element) => (element.innerText || element.textContent || "").replace(/\\s+/g, " ").trim().includes(needle)) ?? null;
      };

      let target = safeQuery(violation.selector);
      if (!target && /^tooltip-/.test(violation.type || "")) target = findByTooltipDetails();
      if (!target) target = findByText();

      const callout = document.createElement("div");
      callout.id = "ui-model-repro-callout";
      callout.innerHTML = [
        "<strong>UI model repro target</strong>",
        "<div><code>" + String(violation.id).replace(/[&<>"']/g, "") + "</code></div>",
        "<div>" + String(violation.type || "violation").replace(/[&<>"']/g, "") + " - " + String(violation.impact || "").replace(/[&<>"']/g, "") + " - " + String(violation.gate || "").replace(/[&<>"']/g, "") + "</div>",
        "<div>" + String(violation.message || violation.text || "").replace(/[&<>"']/g, "").slice(0, 220) + "</div>"
      ].join("");
      document.body.append(callout);

      if (!target) return { focused: false, reason: "target-not-found", violationId: violation.id };
      target.scrollIntoView({ block: "center", inline: "center" });
      target.setAttribute("data-ui-model-repro-target", "true");
      if (typeof target.focus === "function") target.focus({ preventScroll: true });
      const rect = target.getBoundingClientRect();
      const hoverPoint = /^tooltip-/.test(violation.type || "")
        ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
        : null;
      return {
        focused: true,
        violationId: violation.id,
        selector: violation.selector,
        hoverPoint,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      };
    })()
  `,
  );
  if (focusResult?.hoverPoint) {
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: focusResult.hoverPoint.x, y: focusResult.hoverPoint.y });
    await delay(300);
    await evaluate(
      cdp,
      `
      (() => {
        [...document.querySelectorAll("[role='tooltip'],.info-tooltip-bubble")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
          })
          .forEach((element) => element.setAttribute("data-ui-model-repro-related", "true"));
        return true;
      })()
    `,
    );
  }
  console.log(`[ui-model] focused repro violation ${violation.id}: ${focusResult?.focused ? "target highlighted" : focusResult?.reason ?? "not focused"}`);
}

async function writeReports(models) {
  const violationCount = models.reduce((sum, model) => sum + model.violations.length, 0);
  const gateFailureCount = models.reduce((sum, model) => sum + model.violations.filter((violation) => violation.gate === "fail").length, 0);
  const violationGroups = buildViolationGroups(models);
  const annotationGroups = buildAnnotationGroups(models);
  const summary = {
    version: 1,
    generatedAt: new Date().toISOString(),
    workspace,
    reportOnly: !failOnViolations && !failOnAnyViolation,
    zeroBaseline: failOnAnyViolation,
    selfTestDefects,
    activeProfiles,
    themePreference: uiModelThemePreference,
    violationCount,
    gateFailureCount,
    violationsByGate: countBy(models.flatMap((model) => model.violations), (violation) => violation.gate),
    violationsByImpact: countBy(models.flatMap((model) => model.violations), (violation) => violation.impact),
    violationGroups,
    annotationGroups,
    scenarios: await Promise.all(
      models.map(async (model) => {
        const file = join(resultsDir, `${model.scenario}.json`);
        const fileStat = await stat(file);
        return {
          scenario: model.scenario,
          surface: model.scenarioMeta.surface,
          exposure: model.scenarioMeta.exposure,
          profiles: model.scenarioMeta.profiles,
          viewportName: model.scenarioMeta.viewportName,
          description: model.scenarioMeta.description,
          file: basename(file),
          bytes: fileStat.size,
          viewport: model.viewport,
          visibleNodeCount: model.summary.visibleNodeCount,
          accessibilityNodeCount: model.accessibility.exportedNodeCount,
          tooltipSampleCount: model.tooltipSamples.length,
          violationCount: model.violations.length,
          gateFailureCount: model.violations.filter((violation) => violation.gate === "fail").length,
          violationsByType: countBy(model.violations, (violation) => violation.type),
          violationsByGate: countBy(model.violations, (violation) => violation.gate),
          violationsByImpact: countBy(model.violations, (violation) => violation.impact),
        };
      }),
    ),
  };
  await writeFile(join(resultsDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(join(resultsDir, "report.md"), markdownReport(summary, models), "utf8");
  await writeFile(join(resultsDir, "report.html"), htmlReport(summary, models), "utf8");
}

function markdownReport(summary, models) {
  const lines = [];
  lines.push("# UI Model Report");
  lines.push("");
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Workspace: \`${summary.workspace}\``);
  lines.push(`Mode: ${summary.selfTestDefects ? "self-test" : summary.zeroBaseline ? "zero-baseline" : summary.reportOnly ? "report-only" : "strict"}`);
  lines.push(`Theme: \`${summary.themePreference}\``);
  lines.push(`Profiles: ${summary.activeProfiles.map((profile) => `\`${profile}\``).join(", ")}`);
  lines.push(`Violations: ${summary.violationCount}`);
  lines.push(`Gate failures: ${summary.gateFailureCount}`);
  lines.push(`By gate: ${JSON.stringify(summary.violationsByGate)}`);
  lines.push(`By impact: ${JSON.stringify(summary.violationsByImpact)}`);
  lines.push("");
  lines.push("## Scenario Summary");
  lines.push("");
  lines.push("| Scenario | Surface | Exposure | Viewport | Nodes | AX Nodes | Tooltip Samples | Violations | Gate Failures |");
  lines.push("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const scenario of summary.scenarios) {
    lines.push(
      `| ${scenario.scenario} | ${scenario.surface} | ${scenario.exposure} | ${scenario.viewport.width}x${scenario.viewport.height} | ${scenario.visibleNodeCount} | ${scenario.accessibilityNodeCount} | ${scenario.tooltipSampleCount} | ${scenario.violationCount} | ${scenario.gateFailureCount} |`,
    );
  }
  lines.push("");
  if (summary.violationGroups.length > 0) {
    lines.push("## Finding Groups");
    lines.push("");
    lines.push("| Count | Gate Failures | Gate | Impact | Surface | Component | Type | Scenarios | Sample Selector |");
    lines.push("| ---: | ---: | --- | --- | --- | --- | --- | --- | --- |");
    for (const group of summary.violationGroups.slice(0, 30)) {
      lines.push(
        `| ${group.violationCount} | ${group.gateFailureCount} | ${escapeMd(group.gate)} | ${escapeMd(group.impact)} | ${escapeMd(group.surface)} | ${escapeMd(group.component)} | ${escapeMd(group.type)} | ${escapeMd(group.scenarios.join(", "))} | \`${escapeMd(group.sampleSelector)}\` |`,
      );
    }
    if (summary.violationGroups.length > 30) lines.push(`| ${summary.violationGroups.length - 30} more groups | | | | | | | See summary.json | |`);
    lines.push("");
  }
  if (summary.annotationGroups.length > 0) {
    lines.push("## Annotation Inventory");
    lines.push("");
    lines.push("| Nodes | Surface | Component | Annotation | Scenarios | Rationale | Sample Selector |");
    lines.push("| ---: | --- | --- | --- | --- | --- | --- |");
    for (const group of summary.annotationGroups.slice(0, 30)) {
      lines.push(
        `| ${group.nodeCount} | ${escapeMd(group.surface)} | ${escapeMd(group.component)} | ${escapeMd(group.annotation)} | ${escapeMd(group.scenarios.join(", "))} | ${escapeMd(group.rationale)} | \`${escapeMd(group.sampleSelector)}\` |`,
      );
    }
    if (summary.annotationGroups.length > 30) lines.push(`| ${summary.annotationGroups.length - 30} more annotation groups | | | | | See summary.json | |`);
    lines.push("");
  }
  for (const model of models) {
    lines.push(`## ${model.scenario}`);
    lines.push("");
    lines.push(`Surface: \`${model.scenarioMeta.surface}\``);
    lines.push(`Exposure: \`${model.scenarioMeta.exposure}\``);
    lines.push(`Description: ${escapeMd(model.scenarioMeta.description)}`);
    lines.push(`File: \`${model.scenario}.json\``);
    lines.push(`Gate failures: ${model.summary.gateFailureCount ?? 0}`);
    lines.push("");
    if (model.violations.length === 0) {
      lines.push("No violations reported.");
      lines.push("");
      continue;
    }
    lines.push("| Gate | Impact | Severity | Type | Selector | Text | Details |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const violation of model.violations.slice(0, 40)) {
      lines.push(
        `| ${escapeMd(violation.gate)} | ${escapeMd(violation.impact)} | ${escapeMd(violation.severity)} | ${escapeMd(violation.type)} | \`${escapeMd(violation.selector ?? "")}\` | ${escapeMd(violation.text ?? violation.message ?? "")} | ${escapeMd(JSON.stringify(violation.details ?? {}).slice(0, 240))} |`,
      );
    }
    if (model.violations.length > 40) lines.push(`| report | info | info | truncated | | ${model.violations.length - 40} more violations in JSON | |`);
    lines.push("");
  }
  lines.push("## Notes");
  lines.push("");
  lines.push("- Screenshots are intentionally not part of this report; use this model as the fast UI oracle and capture screenshots only on failures that need visual triage.");
  lines.push("- Intentional truncation should be marked with `data-ui-allow-truncation=\"true\"` or paired with a disclosure affordance.");
  lines.push("- Alignment groups can opt in with `data-ui-align-group` and optional `data-ui-align-axis`.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) counts[keyFn(item)] = (counts[keyFn(item)] ?? 0) + 1;
  return counts;
}

function buildViolationGroups(models) {
  const groups = new Map();
  for (const model of models) {
    for (const violation of model.violations) {
      const component = componentForSelector(violation.selector);
      const key = [model.scenarioMeta.surface, component, violation.type, violation.gate, violation.impact].join("|");
      const group =
        groups.get(key) ??
        {
          id: slugForId(key),
          surface: model.scenarioMeta.surface,
          component,
          type: violation.type,
          gate: violation.gate,
          impact: violation.impact,
          violationCount: 0,
          gateFailureCount: 0,
          scenarios: [],
          selectors: [],
          sampleSelector: violation.selector ?? "",
          sampleText: violation.text ?? violation.message ?? "",
          disclosureCount: 0,
        };
      group.violationCount += 1;
      if (violation.gate === "fail") group.gateFailureCount += 1;
      if (!group.scenarios.includes(model.scenario)) group.scenarios.push(model.scenario);
      if (violation.selector && !group.selectors.includes(violation.selector)) group.selectors.push(violation.selector);
      if (violation.details?.hasDisclosure) group.disclosureCount += 1;
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      selectorCount: group.selectors.length,
      selectors: group.selectors.slice(0, 10),
      scenarios: group.scenarios.sort(),
    }))
    .sort((left, right) => right.gateFailureCount - left.gateFailureCount || right.violationCount - left.violationCount || left.component.localeCompare(right.component));
}

function buildAnnotationGroups(models) {
  const groups = new Map();
  for (const model of models) {
    for (const node of model.nodes ?? []) {
      const annotations = annotationKindsForNode(node);
      for (const annotation of annotations) {
        const component = componentForSelector(node.selector);
        const key = [model.scenarioMeta.surface, component, annotation].join("|");
        const group =
          groups.get(key) ??
          {
            id: slugForId(key),
            surface: model.scenarioMeta.surface,
            component,
            annotation,
            rationale: annotationRationale(annotation),
            nodeCount: 0,
            scenarios: [],
            sampleSelector: node.selector ?? "",
            sampleText: node.text ?? node.title ?? node.ariaLabel ?? "",
          };
        group.nodeCount += 1;
        if (!group.scenarios.includes(model.scenario)) group.scenarios.push(model.scenario);
        groups.set(key, group);
      }
    }
  }
  return [...groups.values()]
    .map((group) => ({ ...group, scenarios: group.scenarios.sort() }))
    .sort((left, right) => right.nodeCount - left.nodeCount || left.component.localeCompare(right.component) || left.annotation.localeCompare(right.annotation));
}

function annotationKindsForNode(node) {
  const data = node.data ?? {};
  const annotations = [];
  if (data.ownAllowTruncation) annotations.push("allow-truncation");
  if (data.ownAllowCompressedControl) annotations.push("allow-compressed-control");
  if (data.ownAllowLonelyRow) annotations.push("allow-lonely-row");
  if (data.ownAllowFragmentedControls) annotations.push("allow-fragmented-controls");
  if (data.ownAllowSmallTarget) annotations.push("allow-small-target");
  if (data.ownAllowUnlabeledControl) annotations.push("allow-unlabeled-control");
  if (data.ownAllowStickyOverlap) annotations.push("allow-sticky-overlap");
  if (data.ownAllowUnreachableScroll) annotations.push("allow-unreachable-scroll");
  if (data.overflowIntent) annotations.push(`overflow:${data.overflowIntent}`);
  if (data.scrollContainer) annotations.push(`scroll-container:${data.scrollContainer}`);
  if (data.alignGroup) annotations.push(`align-group:${data.alignGroup}${data.alignAxis ? `:${data.alignAxis}` : ""}`);
  if (data.stickyGuard) annotations.push(`sticky-guard:${data.stickyGuard}`);
  return annotations;
}

function annotationRationale(annotation) {
  if (annotation === "allow-truncation") return "Intentional compact text; the full value should be disclosed through title text, accessible text, or a detail path.";
  if (annotation === "allow-compressed-control") return "Visible control text is intentionally abbreviated; the full value should remain available through title text or adjacent context.";
  if (annotation === "allow-lonely-row") return "A single wrapped control row is a deliberate responsive layout choice.";
  if (annotation === "allow-fragmented-controls") return "A multi-row control group is intentional for this responsive state.";
  if (annotation === "allow-small-target") return "A smaller target is intentional for a non-primary or densely repeated control.";
  if (annotation === "allow-unlabeled-control") return "The control is intentionally unnamed because it is not user-facing.";
  if (annotation === "allow-sticky-overlap") return "Sticky or fixed overlap is intentional for this component contract.";
  if (annotation === "allow-unreachable-scroll") return "The scroll reachability rule is intentionally suppressed for this container.";
  if (annotation.startsWith("overflow:")) return "Overflow or clipping is an explicit component contract.";
  if (annotation.startsWith("scroll-container:")) return "The component is expected to keep overflowing content reachable through native scrolling.";
  if (annotation.startsWith("align-group:")) return "The component participates in an explicit alignment contract.";
  if (annotation.startsWith("sticky-guard:")) return "The component participates in sticky overlap checks.";
  return "Intentional UI-model annotation.";
}

function componentForSelector(selector) {
  const normalized = String(selector ?? "");
  const knownComponents = [
    [/tooltip-trigger|info-tooltip/i, "Info tooltip"],
    [/thread-preview|thread-row|project-list|sidebar/i, "Sidebar threads"],
    [/statusbar|workspace-chip|branch-chip|git-work-mode/i, "Statusbar"],
    [/composer|model-selector/i, "Composer"],
    [/project-board-candidate-detail|draft-detail/i, "Project Board detail"],
    [/project-board-card|project-board-draft|project-board-charter|project-board/i, "Project Board"],
    [/task-kanban|task-card|local-task|automation-field/i, "Local Tasks"],
    [/permission-dialog|permission-prompt/i, "Permission dialog"],
    [/browser-picker|element-picker/i, "Browser picker"],
    [/plugin-import|plugin-card|plugin-marketplace/i, "Plugins"],
    [/workflow-run|workflow-artifact|workflow-build|workflow-runs|workflow-review/i, "Workflow Agent"],
    [/api-key|secret/i, "API key dialog"],
  ];
  for (const [pattern, component] of knownComponents) {
    if (pattern.test(normalized)) return component;
  }
  const classMatch = normalized.match(/\.([a-zA-Z][a-zA-Z0-9_-]*)/);
  if (classMatch) return humanizeSelectorToken(classMatch[1]);
  const tagMatch = normalized.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
  return tagMatch ? humanizeSelectorToken(tagMatch[0]) : "Unclassified";
}

function humanizeSelectorToken(token) {
  return String(token)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeMd(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 500);
}

function htmlReport(summary, models) {
  const rows = summary.scenarios
    .map(
      (scenario) => `
        <tr>
          <td><a href="#${escapeAttr(scenario.scenario)}">${escapeHtml(scenario.scenario)}</a></td>
          <td>${escapeHtml(scenario.surface)}</td>
          <td>${escapeHtml(scenario.exposure)}</td>
          <td>${scenario.viewport.width}x${scenario.viewport.height}</td>
          <td>${scenario.visibleNodeCount}</td>
          <td>${scenario.accessibilityNodeCount}</td>
          <td>${scenario.tooltipSampleCount}</td>
          <td>${scenario.violationCount}</td>
          <td>${scenario.gateFailureCount}</td>
        </tr>`,
    )
    .join("");
  const findingGroupsSection = summary.violationGroups.length
    ? reportGroupsTable(
        "Finding Groups",
        ["Count", "Gate Failures", "Gate", "Impact", "Surface", "Component", "Type", "Scenarios", "Sample Selector"],
        summary.violationGroups.slice(0, 30).map((group) => [
          group.violationCount,
          group.gateFailureCount,
          group.gate,
          group.impact,
          group.surface,
          group.component,
          group.type,
          group.scenarios.join(", "),
          group.sampleSelector,
        ]),
      )
    : "";
  const annotationGroupsSection = summary.annotationGroups.length
    ? reportGroupsTable(
        "Annotation Inventory",
        ["Nodes", "Surface", "Component", "Annotation", "Scenarios", "Rationale", "Sample Selector"],
        summary.annotationGroups.slice(0, 30).map((group) => [
          group.nodeCount,
          group.surface,
          group.component,
          group.annotation,
          group.scenarios.join(", "),
          group.rationale,
          group.sampleSelector,
        ]),
      )
    : "";
  const sections = models
    .map((model) => {
      const violations = model.violations.length
        ? model.violations
            .map((violation) => violationCard(model, violation))
            .join("")
        : `<p class="empty">No violations reported.</p>`;
      return `
        <section class="scenario" id="${escapeAttr(model.scenario)}">
          <div class="scenario-heading">
            <div>
              <h2>${escapeHtml(model.scenario)}</h2>
              <p>${escapeHtml(model.scenarioMeta.description)}</p>
            </div>
            <div class="scenario-actions">
              <a href="./${encodeURIComponent(model.scenario)}.json">JSON</a>
            </div>
          </div>
          <div class="meta">
            <span>Surface: <strong>${escapeHtml(model.scenarioMeta.surface)}</strong></span>
            <span>Exposure: <strong>${escapeHtml(model.scenarioMeta.exposure)}</strong></span>
            <span>Viewport: <strong>${model.viewport.width}x${model.viewport.height}</strong></span>
            <span>Gate failures: <strong>${model.summary.gateFailureCount ?? 0}</strong></span>
          </div>
          <div class="violations">${violations}</div>
        </section>`;
    })
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>UI Model Report</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #172033;
      --muted: #657085;
      --line: #d8dde8;
      --soft: #eef2f7;
      --fail: #b42318;
      --report: #175cd3;
      --minor: #667085;
      --major: #b54708;
      --blocker: #b42318;
      --accessibility: #6941c6;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      padding: 28px 32px 18px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    main { max-width: 1320px; margin: 0 auto; padding: 24px 28px 56px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 24px; line-height: 1.2; }
    h2 { font-size: 19px; line-height: 1.25; }
    h3 { font-size: 14px; line-height: 1.3; }
    a { color: var(--report); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .subtle { color: var(--muted); margin-top: 6px; }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .stat, .notice, .scenario, .violation {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .stat { padding: 14px; }
    .stat span { color: var(--muted); display: block; font-size: 12px; }
    .stat strong { display: block; font-size: 22px; margin-top: 4px; }
    .notice {
      padding: 12px 14px;
      margin: 0 0 18px;
      color: #344054;
      background: #fffdf5;
      border-color: #f2d680;
    }
    .table-wrap {
      overflow: auto;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      margin-bottom: 22px;
    }
    .grouped-table {
      margin: 0 0 22px;
    }
    .grouped-table h2 {
      margin: 0 0 10px;
    }
    .grouped-table td:last-child {
      white-space: normal;
      overflow-wrap: anywhere;
      min-width: 240px;
    }
    table { width: 100%; border-collapse: collapse; min-width: 880px; }
    th, td { padding: 9px 10px; text-align: left; border-bottom: 1px solid var(--line); white-space: nowrap; }
    th { font-size: 12px; color: var(--muted); background: var(--soft); }
    tr:last-child td { border-bottom: 0; }
    .scenario { margin-top: 18px; padding: 16px; }
    .scenario-heading {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 10px;
    }
    .scenario-heading p { color: var(--muted); margin-top: 4px; }
    .scenario-actions a, .repro-link {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 5px 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      font-weight: 600;
      white-space: nowrap;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0 14px;
      color: var(--muted);
    }
    .meta span, .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-height: 24px;
      padding: 2px 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--soft);
      font-size: 12px;
    }
    .violations { display: grid; gap: 10px; }
    .violation { padding: 12px; }
    .violation-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 8px;
    }
    .violation-title { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .pill.fail { color: #fff; background: var(--fail); border-color: var(--fail); }
    .pill.report { color: #fff; background: var(--report); border-color: var(--report); }
    .pill.major { color: #fff; background: var(--major); border-color: var(--major); }
    .pill.blocker { color: #fff; background: var(--blocker); border-color: var(--blocker); }
    .pill.accessibility { color: #fff; background: var(--accessibility); border-color: var(--accessibility); }
    .pill.minor { color: #fff; background: var(--minor); border-color: var(--minor); }
    .selector, pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    .selector {
      margin-top: 8px;
      padding: 8px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #f9fafb;
      color: #344054;
    }
    .message { color: #344054; margin-top: 6px; }
    details { margin-top: 8px; }
    summary { cursor: pointer; color: var(--report); font-weight: 600; }
    pre { max-height: 220px; overflow: auto; padding: 10px; background: #111827; color: #f9fafb; border-radius: 6px; }
    .empty { color: var(--muted); padding: 8px 0; }
  </style>
</head>
<body>
  <header>
    <h1>UI Model Report</h1>
    <p class="subtle">Generated ${escapeHtml(summary.generatedAt)} from workspace <code>${escapeHtml(summary.workspace)}</code></p>
    <div class="cards">
      <div class="stat"><span>Scenarios</span><strong>${summary.scenarios.length}</strong></div>
      <div class="stat"><span>Violations</span><strong>${summary.violationCount}</strong></div>
      <div class="stat"><span>Gate failures</span><strong>${summary.gateFailureCount}</strong></div>
      <div class="stat"><span>Theme</span><strong>${escapeHtml(summary.themePreference)}</strong></div>
      <div class="stat"><span>Profiles</span><strong>${escapeHtml(summary.activeProfiles.join(", "))}</strong></div>
    </div>
  </header>
  <main>
    <p class="notice">Launch links require the local report server. Run <code>pnpm run test:ui-model:serve</code> and open this report through the printed localhost URL.</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Surface</th>
            <th>Exposure</th>
            <th>Viewport</th>
            <th>Nodes</th>
            <th>AX Nodes</th>
            <th>Tooltips</th>
            <th>Violations</th>
            <th>Gate Failures</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${findingGroupsSection}
    ${annotationGroupsSection}
    ${sections}
  </main>
</body>
</html>
`;
}

function reportGroupsTable(title, headers, rows) {
  return `
    <section class="grouped-table">
      <h2>${escapeHtml(title)}</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>`;
}

function violationCard(model, violation) {
  const details = JSON.stringify(violation.details ?? {}, null, 2);
  const launchUrl = `/repro?scenario=${encodeURIComponent(model.scenario)}&violation=${encodeURIComponent(violation.id)}`;
  return `
    <article class="violation" id="${escapeAttr(violation.id)}">
      <div class="violation-head">
        <div>
          <div class="violation-title">
            <span class="pill ${escapeAttr(violation.gate)}">${escapeHtml(violation.gate)}</span>
            <span class="pill ${escapeAttr(violation.impact)}">${escapeHtml(violation.impact)}</span>
            <h3>${escapeHtml(violation.type)}</h3>
            <span class="pill">${escapeHtml(violation.id)}</span>
          </div>
          <p class="message">${escapeHtml(violation.message ?? violation.text ?? "")}</p>
        </div>
        <a class="repro-link" href="${launchUrl}" target="_blank" rel="noreferrer">Launch repro</a>
      </div>
      ${violation.selector ? `<div class="selector">${escapeHtml(violation.selector)}</div>` : ""}
      ${violation.text ? `<p class="message">${escapeHtml(violation.text)}</p>` : ""}
      <details>
        <summary>Details</summary>
        <pre>${escapeHtml(details)}</pre>
      </details>
    </article>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "-"));
}

function roundPlainRect(rect) {
  return Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, Math.round(Number(value) * 100) / 100]));
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

await main();
