#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pageModelExpression } from "./page-model-expression.mjs";
import { writeUiModelReports } from "./collect-ui-model-reports.mjs";
import { countBy, slugForId } from "./collect-ui-model-shared.mjs";

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

    await writeUiModelReports(models, reportOptions());
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

  await writeUiModelReports(models, reportOptions());
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

function reportOptions() {
  return {
    resultsDir,
    workspace,
    failOnViolations,
    failOnAnyViolation,
    selfTestDefects,
    activeProfiles,
    themePreference: uiModelThemePreference,
  };
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


function roundPlainRect(rect) {
  return Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, Math.round(Number(value) * 100) / 100]));
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

await main();
