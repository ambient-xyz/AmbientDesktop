#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = process.cwd();
const resultsDir = join(repoRoot, "test-results", "symphony-gap-phase6-dogfood");
const scratchRoot = await mkdtemp(join(tmpdir(), "ambient-symphony-gap-phase6-"));
const workspacePath = join(scratchRoot, "workspace");
const userDataPath = join(scratchRoot, "userData");
const authorityStateRoot = join(userDataPath, "authority-state");
const staleLatestArtifactPath = join(resultsDir, "latest.json");
const DEFAULT_DOGFOOD_PROVIDER = "ambient";
const DEFAULT_DOGFOOD_MODEL = "<model>";
const SUBAGENTS_FEATURE_FLAG = "ambient.subagents";
const cdpCommandTimeoutMs = 10_000;
const gateTimeoutMs = Number(process.env.AMBIENT_SYMPHONY_GAP_PHASE6_TIMEOUT_MS || 600_000);
const sharedPrompt = "Compare three weekend trip options and recommend one.";
const reducerMetric = "Reducer must compare all three options and state why the recommendation wins.";
const expectedWorkflowTool = "ambient_workflow_symphony_map_reduce";
const expectedPatternId = "map_reduce";
const expectedPatternRoles = ["mapper", "reducer"];
const allowedParentConductorTools = [
  "ambient_callable_workflow_catalog_search",
  "ambient_callable_workflow_catalog_describe",
  expectedWorkflowTool,
  "recovery_read_interrupted_tool_call",
];

let exitCode = 0;
let dogfoodEnv;

try {
  await rm(staleLatestArtifactPath, { force: true });
  await mkdir(workspacePath, { recursive: true });
  await mkdir(userDataPath, { recursive: true });
  dogfoodEnv = buildDogfoodEnv();
  await run("pnpm", ["run", "prepare:electron-native"], dogfoodEnv);
  await runPhase6Dogfood();
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
  if (process.env.AMBIENT_SYMPHONY_GAP_PHASE6_KEEP_SCRATCH !== "1") {
    await rm(scratchRoot, { recursive: true, force: true });
  } else {
    process.stdout.write(`Symphony gap Phase 6 dogfood scratch retained at ${scratchRoot}\n`);
  }
}

process.exit(exitCode);

async function runPhase6Dogfood() {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const artifacts = {};
  const modeLanes = {};
  let failureStage = "startup";
  let app;
  let cdp;
  const genericPort = dogfoodCdpPort();
  const symphonyPort = await allocateAdditionalCdpPort(genericPort);
  try {
    failureStage = "generic_ui";
    app = launchDesktop(genericPort);
    cdp = await connectToElectron(genericPort, app);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await setViewport(cdp, 1440, 900);
    await waitForText(cdp, "Ambient");
    await waitForText(cdp, expectedProviderLabel());

    await ensureSymphonyToggleOff(cdp);
    await setTextAreaValue(cdp, ".composer-input-wrap textarea", sharedPrompt);
    await waitForTextareaValue(cdp, ".composer-input-wrap textarea", sharedPrompt);
    const genericMode = await inspectModeSeparation(cdp, "generic_subagents");
    modeLanes.generic = genericMode;
    if (!genericMode.modeReportSaysSymphonyNotArmed || genericMode.symphonyToggleOn || genericMode.symphonyBuilderVisible) {
      throw new Error(`Generic lane did not report an unarmed Symphony mode: ${JSON.stringify(genericMode)}`);
    }
    artifacts.genericModeScreenshot = await writeScreenshot(cdp, "symphony-gap-phase6-generic-mode.png");

    failureStage = "generic_send";
    await clickElement(cdp, "button[data-ui-required-action='composer-send']");
    const persistedGenericUserMessage = await waitForPersistedGenericUserMessage(sharedPrompt);
    const genericPostSendEvidence = await waitForGenericModePostSendEvidence(cdp, persistedGenericUserMessage);
    modeLanes.generic = {
      ...genericMode,
      persistedUserMessage: persistedGenericUserMessage,
      postSendEvidence: genericPostSendEvidence,
    };
    artifacts.genericModeSentScreenshot = await writeScreenshot(cdp, "symphony-gap-phase6-generic-mode-sent.png");
    cdp.close();
    cdp = undefined;
    await terminateApp(app);
    app = undefined;
    await resetDogfoodState();

    failureStage = "symphony_ui";
    app = launchDesktop(symphonyPort);
    cdp = await connectToElectron(symphonyPort, app);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await setViewport(cdp, 1440, 900);
    await waitForText(cdp, "Ambient");
    await waitForText(cdp, expectedProviderLabel());
    await setTextAreaValue(cdp, ".composer-input-wrap textarea", sharedPrompt);
    await waitForTextareaValue(cdp, ".composer-input-wrap textarea", sharedPrompt);
    await clickElement(cdp, ".symphony-composer-button");
    await waitFor(cdp, () => Boolean(document.querySelector(".symphony-builder-panel")));
    await waitForTextareaValue(cdp, ".composer-input-wrap textarea", sharedPrompt);
    await waitForText(cdp, "Map-Reduce");
    await waitForText(cdp, "Reducer success metric");
    await clickElement(cdp, `button[data-pattern-id='${expectedPatternId}']`);
    const armedMode = await inspectModeSeparation(cdp, "symphony_mode");
    modeLanes.symphony = armedMode;
    if (!armedMode.symphonyToggleOn || !armedMode.symphonyBuilderVisible || !armedMode.modeReportRequiresPatternPreflight) {
      throw new Error(`Symphony lane did not report a required pattern preflight: ${JSON.stringify(armedMode)}`);
    }
    await setTextAreaValue(cdp, ".symphony-metric-editor textarea", reducerMetric);
    await waitForTextareaValue(cdp, ".symphony-metric-editor textarea", reducerMetric);
    await ensureSymphonyBlockingEnabled(cdp);
    artifacts.symphonyModeScreenshot = await writeScreenshot(cdp, "symphony-gap-phase6-symphony-mode.png");
    failureStage = "symphony_launch";
    await clickElement(cdp, "button[data-ui-required-action='composer-send']");
    const persistedSymphonyUserMessage = await waitForPersistedSymphonyUserMessage(sharedPrompt);
    modeLanes.symphony = {
      ...armedMode,
      persistedUserMessage: persistedSymphonyUserMessage,
    };
    const phase6LaunchEvidence = await waitForPhase6LaunchEvidence(cdp, persistedSymphonyUserMessage);
    artifacts.symphonyModeSentScreenshot = await writeScreenshot(cdp, "symphony-gap-phase6-symphony-mode-sent.png");
    artifacts.accessibilitySnapshot = await writeAccessibilitySnapshot(cdp, "symphony-gap-phase6-accessibility.json");
    cdp.close();
    cdp = undefined;
    await terminateApp(app);
    app = undefined;

    const symphonyMode = buildSymphonyModeLane({ armedMode, persistedSymphonyUserMessage, phase6LaunchEvidence });
    modeLanes.symphony = symphonyMode;
    const reportModeLanes = {
      generic: modeLanes.generic,
      symphony: modeLanes.symphony,
    };
    const terminologyEvidence = releaseGateTerminologyEvidence({
      failureClass: "none",
      modeLanes: reportModeLanes,
    });

    const checks = {
      samePromptComparedAcrossModes: genericMode.promptText === sharedPrompt &&
        persistedGenericUserMessage.content === sharedPrompt &&
        armedMode.promptText === sharedPrompt &&
        persistedSymphonyUserMessage.content === sharedPrompt,
      genericModeDoesNotExpectPatternPreflight: genericMode.expectedOrchestrationPolicy === "no_symphony_pattern_required",
      genericModeFailureClassIsSymphonyNotArmed: genericMode.failureClassIfPatternMissing === "symphony_not_armed",
      genericRunPersistedWithoutSymphonyIntent: persistedGenericUserMessage.composerIntentAbsent === true,
      genericRunDidNotLaunchSymphonyWorkflow: modeLanes.generic.postSendEvidence?.unexpectedSymphonyWorkflowTaskCount === 0 &&
        modeLanes.generic.postSendEvidence?.unexpectedSymphonyToolNames.length === 0,
      symphonyRunPersistedWithSymphonyIntent: Boolean(persistedSymphonyUserMessage.composerIntent),
      symphonyModeRequiresPatternPreflight: symphonyMode.expectedOrchestrationPolicy === "pattern_preflight_workflow_launch_required",
      symphonyModeFailureClassNamesMissingOrchestration: symphonyMode.failureClassIfPatternMissing === "symphony_orchestration_missing",
      symphonyConductorLockProven: symphonyMode.conductorLockProven === true,
      symphonyWorkflowLaunchVerified: symphonyMode.workflowLaunchVerified === true,
      symphonyChildWaitEvidenceVerified: symphonyMode.childWaitEvidenceVerified === true,
      symphonyEvidenceTiedToPhase6Thread: phase6LaunchEvidence.workflowTask?.parentThreadId === persistedSymphonyUserMessage.threadId,
      reportUsesSymphonyNotArmedTerminology: terminologyEvidence.reportIncludesSymphonyNotArmed,
      reportAvoidsAmbiguousOrchestrationNotDetected: terminologyEvidence.reportAvoidsAmbiguousOrchestrationNotDetected,
      reportUsesModeAwareFailureClasses: terminologyEvidence.modeAwareFailureClasses,
    };
    if (!Object.values(checks).every(Boolean)) throw new Error(`Phase 6 checks failed: ${JSON.stringify(checks)}`);

    await writeReport({
      schemaVersion: "ambient-symphony-gap-phase6-dogfood-v1",
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
      cdpPort: symphonyPort,
      cdpPorts: {
        generic: genericPort,
        symphony: symphonyPort,
      },
      scenarios: ["symphony_gap_phase6_suite_separation"],
      modeUnderTest: "generic_and_symphony_suite_separation",
      expectedOrchestrationPolicy: "generic_off_no_pattern_required__symphony_on_pattern_required",
      failureClass: "none",
      modeLanes: {
        generic: modeLanes.generic,
        symphony: modeLanes.symphony,
      },
      terminologyEvidence,
      maturityPolicy: {
        requiredConsecutiveCleanHeadfulSymphonyRunsBeforeBroadening: 3,
        currentRunContributesToCleanHeadfulSymphonyEvidence: true,
        broadenPatternBehaviorOnlyAfterReleaseGateConfirmsHistory: true,
      },
      checks,
      artifacts,
    });
  } catch (error) {
    if (cdp) {
      try {
        artifacts.failureScreenshot = await writeScreenshot(cdp, "symphony-gap-phase6-failure.png");
      } catch {
        // Preserve the original failure.
      }
    }
    const failureClass = classifyPhase6Failure(failureStage, error);
    const terminologyEvidence = releaseGateTerminologyEvidence({
      failureClass,
      failureStage,
      modeLanes,
    });
    await writeReport({
      schemaVersion: "ambient-symphony-gap-phase6-dogfood-v1",
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
      cdpPort: symphonyPort,
      cdpPorts: {
        generic: genericPort,
        symphony: symphonyPort,
      },
      scenarios: ["symphony_gap_phase6_suite_separation"],
      modeUnderTest: "generic_and_symphony_suite_separation",
      expectedOrchestrationPolicy: "generic_off_no_pattern_required__symphony_on_pattern_required",
      failureClass,
      failureStage,
      modeLanes,
      terminologyEvidence,
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

async function ensureSymphonyToggleOff(cdp) {
  const state = await inspectSymphonyToggle(cdp);
  if (state.on) {
    await clickElement(cdp, ".symphony-composer-button");
    await waitFor(cdp, () => {
      const button = document.querySelector(".symphony-composer-button");
      return button instanceof HTMLElement && !button.classList.contains("active");
    });
  }
}

async function inspectModeSeparation(cdp, modeUnderTest) {
  return evaluate(cdp, (expectedModeUnderTest) => {
    const button = document.querySelector(".symphony-composer-button");
    const textarea = document.querySelector(".composer-input-wrap textarea");
    const symphonyToggleOn = button instanceof HTMLElement && button.classList.contains("active");
    const symphonyBuilderVisible = Boolean(document.querySelector(".symphony-builder-panel"));
    const patternCardsVisible = document.querySelectorAll(".symphony-pattern-card").length > 0;
    const blockingInput = document.querySelector(".symphony-blocking-toggle input");
    const blockingEnabled = blockingInput instanceof HTMLInputElement && blockingInput.checked;
    const promptText = textarea instanceof HTMLTextAreaElement ? textarea.value : "";
    const generic = expectedModeUnderTest === "generic_subagents";
    return {
      modeUnderTest: expectedModeUnderTest,
      promptText,
      symphonyToggleVisible: button instanceof HTMLElement,
      symphonyToggleOn,
      symphonyBuilderVisible,
      patternCardsVisible,
      blockingEnabled,
      expectedOrchestrationPolicy: generic
        ? "no_symphony_pattern_required"
        : "pattern_preflight_workflow_launch_required",
      failureClassIfPatternMissing: generic ? "symphony_not_armed" : "symphony_orchestration_missing",
      userFacingMissingPatternLabel: generic ? "Symphony not armed" : "Symphony orchestration missing",
      modeReportSaysSymphonyNotArmed: generic && !symphonyToggleOn && !symphonyBuilderVisible,
      modeReportRequiresPatternPreflight: !generic && symphonyToggleOn && symphonyBuilderVisible && patternCardsVisible,
    };
  }, modeUnderTest);
}

async function inspectSymphonyToggle(cdp) {
  return evaluate(cdp, () => {
    const button = document.querySelector(".symphony-composer-button");
    return {
      visible: button instanceof HTMLElement,
      on: button instanceof HTMLElement && button.classList.contains("active"),
    };
  });
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

async function waitForTextareaValue(cdp, selector, expectedValue) {
  await waitFor(cdp, (targetSelector, value) => {
    const textarea = document.querySelector(targetSelector);
    return textarea instanceof HTMLTextAreaElement && textarea.value === value;
  }, selector, expectedValue);
}

async function ensureSymphonyBlockingEnabled(cdp) {
  const enabled = await evaluate(cdp, () => {
    const input = document.querySelector(".symphony-blocking-toggle input");
    return input instanceof HTMLInputElement && input.checked;
  });
  if (enabled) return;
  await evaluate(cdp, () => {
    const input = document.querySelector(".symphony-blocking-toggle input");
    if (!(input instanceof HTMLInputElement)) throw new Error("Missing Symphony blocking toggle input.");
    input.click();
  });
  await waitFor(cdp, () => {
    const input = document.querySelector(".symphony-blocking-toggle input");
    return input instanceof HTMLInputElement && input.checked;
  });
}

async function waitForPersistedGenericUserMessage(promptText) {
  const started = Date.now();
  let lastRows = [];
  while (Date.now() - started < 30_000) {
    lastRows = readPersistedUserMessages();
    const match = lastRows.find((row) => {
      const metadata = parseJson(row.metadataJson);
      return row.content === promptText && !metadata.composerIntent;
    });
    if (match) {
      const metadata = parseJson(match.metadataJson);
      return {
        id: match.id,
        threadId: match.threadId,
        createdAt: match.createdAt,
        content: match.content,
        composerIntentAbsent: !metadata.composerIntent,
        metadataKeys: Object.keys(metadata).sort(),
      };
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for persisted generic user message. Last user rows: ${JSON.stringify(lastRows.slice(0, 5))}`);
}

async function waitForPersistedSymphonyUserMessage(promptText) {
  const started = Date.now();
  let lastRows = [];
  while (Date.now() - started < 30_000) {
    lastRows = readPersistedUserMessages();
    const match = lastRows.find((row) => {
      const metadata = parseJson(row.metadataJson);
      const intent = metadata.composerIntent;
      return row.content === promptText &&
        intent?.kind === "symphony-workflow" &&
        intent.action === "run-once" &&
        intent.patternId === "map_reduce";
    });
    if (match) {
      const metadata = parseJson(match.metadataJson);
      return {
        id: match.id,
        threadId: match.threadId,
        createdAt: match.createdAt,
        content: match.content,
        composerIntent: metadata.composerIntent,
        metadataKeys: Object.keys(metadata).sort(),
      };
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for persisted Symphony user message. Last user rows: ${JSON.stringify(lastRows.slice(0, 5))}`);
}

function readPersistedUserMessages() {
  const dbPath = dogfoodStateDbPath();
  if (!existsSync(dbPath)) return [];
  const sql = [
    "SELECT id, thread_id as threadId, role, content, created_at as createdAt, metadata_json as metadataJson",
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

async function waitForGenericModePostSendEvidence(cdp, persistedGenericUserMessage) {
  const started = Date.now();
  let lastEvidence = {};
  while (Date.now() - started < 120_000) {
    const evidence = readGenericModePostSendEvidence(persistedGenericUserMessage);
    lastEvidence = evidence;
    if (evidence.unexpectedSymphonyWorkflowTaskCount > 0 || evidence.unexpectedSymphonyToolNames.length > 0) {
      throw new Error(`Generic mode unexpectedly launched Symphony workflow work: ${JSON.stringify(evidence, null, 2)}`);
    }
    if (evidence.latestRunSucceeded) {
      await waitFor(cdp, () => document.body.innerText.length > 0);
      return evidence;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for generic post-send runtime evidence. Last evidence: ${JSON.stringify(lastEvidence, null, 2)}`);
}

function readGenericModePostSendEvidence(persistedGenericUserMessage) {
  const threadMessages = readPersistedMessages().filter((message) => message.threadId === persistedGenericUserMessage.threadId);
  const messagesAfterUser = threadMessages.filter((message) =>
    !persistedGenericUserMessage.createdAt || message.createdAt >= persistedGenericUserMessage.createdAt
  );
  const runs = readRuns().filter((run) =>
    run.thread_id === persistedGenericUserMessage.threadId &&
    (!persistedGenericUserMessage.createdAt || run.started_at >= persistedGenericUserMessage.createdAt)
  );
  const latestRun = runs.at(-1);
  const toolNames = messagesAfterUser
    .map((row) => parseJson(row.metadataJson).toolName)
    .filter((toolName) => typeof toolName === "string");
  const unexpectedSymphonyToolNames = [...new Set(toolNames.filter((toolName) => toolName.startsWith("ambient_workflow_symphony_")))];
  const unexpectedSymphonyWorkflowTasks = readCallableWorkflowTasks().filter((task) =>
    task.parent_thread_id === persistedGenericUserMessage.threadId &&
    task.source_kind === "symphony_recipe"
  );
  const assistantMessages = messagesAfterUser.filter((message) =>
    message.role === "assistant" &&
    message.content.trim().length > 0
  );
  return {
    threadId: persistedGenericUserMessage.threadId,
    messageCountAfterUser: messagesAfterUser.length,
    assistantMessageCount: assistantMessages.length,
    runCount: runs.length,
    latestRun: latestRun ? {
      id: latestRun.id,
      status: latestRun.status,
      assistantMessageId: latestRun.assistant_message_id,
      startedAt: latestRun.started_at,
      completedAt: latestRun.completed_at,
      errorMessage: latestRun.error_message,
    } : undefined,
    latestRunTerminal: Boolean(latestRun?.completed_at),
    latestRunSucceeded: Boolean(
      latestRun?.completed_at &&
      latestRun.status === "done" &&
      !latestRun.error_message &&
      assistantMessages.length > 0,
    ),
    toolNames,
    unexpectedSymphonyToolNames,
    unexpectedSymphonyWorkflowTaskCount: unexpectedSymphonyWorkflowTasks.length,
    unexpectedSymphonyWorkflowTasks: unexpectedSymphonyWorkflowTasks.map((task) => ({
      id: task.id,
      toolName: task.tool_name,
      sourceKind: task.source_kind,
      parentThreadId: task.parent_thread_id,
      parentRunId: task.parent_run_id,
    })),
    assistantPreviews: assistantMessages.slice(0, 3).map((message) => ({
      id: message.id,
      preview: message.content.slice(0, 160),
    })),
  };
}

async function waitForPhase6LaunchEvidence(cdp, persistedSymphonyUserMessage) {
  const started = Date.now();
  let lastEvidence = {};
  while (Date.now() - started < gateTimeoutMs) {
    const evidence = await readPhase6LaunchEvidence(cdp, persistedSymphonyUserMessage);
    lastEvidence = evidence;
    if (evidence.forbiddenParentToolNames.length > 0) {
      throw new Error(`Phase 6 Symphony parent used forbidden worker tools: ${evidence.forbiddenParentToolNames.join(", ")}`);
    }
    if (evidence.workflowTaskCount > 1) {
      throw new Error(`Duplicate Phase 6 Symphony workflow tasks launched: ${evidence.workflowTaskCount}`);
    }
    if (evidence.parentRunFailedBeforeWorkflowTask) {
      throw new Error(
        `Phase 6 Symphony parent run failed before workflow launch: status=${evidence.parentRun?.status ?? "unknown"} error=${evidence.parentRun?.errorMessage ?? "none"}`,
      );
    }
    if (evidence.parentRunCompletedWithoutWorkflowTask) {
      throw new Error(`Phase 6 Symphony parent run completed without launching workflow task: run=${evidence.parentRun?.id ?? "unknown"}`);
    }
    if (evidence.launchBridgeVerified) {
      await waitForChildThreadUi(cdp, evidence.requiredPatternRoles);
      return evidence;
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for Phase 6 Symphony launch evidence. Last evidence: ${JSON.stringify(lastEvidence, null, 2)}`);
}

async function readPhase6LaunchEvidence(cdp, persistedSymphonyUserMessage) {
  const tasks = readCallableWorkflowTasks();
  const allRuns = readRuns();
  const parentRuns = allRuns.filter((run) =>
    run.thread_id === persistedSymphonyUserMessage.threadId &&
    (!persistedSymphonyUserMessage.createdAt || run.started_at >= persistedSymphonyUserMessage.createdAt)
  );
  const latestParentRunForThread = parentRuns.at(-1);
  const expectedTasks = tasks.filter((task) =>
    task.tool_name === expectedWorkflowTool &&
    task.source_kind === "symphony_recipe" &&
    task.parent_thread_id === persistedSymphonyUserMessage.threadId
  );
  const task = expectedTasks[0];
  const subagentRuns = task ? readSubagentRuns().filter((run) => run.parent_run_id === task.parent_run_id) : [];
  const barriers = task ? readSubagentWaitBarriers().filter((barrier) => barrier.parent_run_id === task.parent_run_id) : [];
  const childRunIds = new Set(subagentRuns.map((run) => run.id));
  const patternRoleRows = subagentRuns.map((run) => ({
    id: run.id,
    childThreadId: run.child_thread_id,
    roleId: run.role_id,
    status: run.status,
    effectiveRole: parseJson(run.effective_role_snapshot_json),
  }));
  const patternRoles = patternRoleRows
    .map((row) => row.effectiveRole.patternRole)
    .filter((role) => typeof role === "string");
  const requiredPatternRolesPresent = expectedPatternRoles.every((role) => patternRoles.includes(role));
  const aggregateBarrier = barriers.find((barrier) => {
    const barrierChildIds = parseJsonArray(barrier.child_run_ids_json).filter((id) => typeof id === "string");
    return barrier.dependency_mode === "required_all" &&
      barrier.failure_policy === "ask_user" &&
      expectedPatternRoles.every((role) => {
        const matchingRun = patternRoleRows.find((row) => row.effectiveRole.patternRole === role);
        return matchingRun ? barrierChildIds.includes(matchingRun.id) : false;
      });
  });
  const graph = parseJson(task?.pattern_graph_snapshot_json);
  const parentRun = task ? allRuns.find((run) => run.id === task.parent_run_id) : latestParentRunForThread;
  const terminalParentRunWithoutWorkflowTask = expectedTasks.length === 0 && Boolean(latestParentRunForThread?.completed_at);
  const parentRunFailedBeforeWorkflowTask = terminalParentRunWithoutWorkflowTask &&
    Boolean(latestParentRunForThread?.status !== "done" || latestParentRunForThread?.error_message);
  const parentRunCompletedWithoutWorkflowTask = terminalParentRunWithoutWorkflowTask &&
    latestParentRunForThread?.status === "done" &&
    !latestParentRunForThread.error_message;
  const graphNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const graphBindings = graphNodes
    .filter((node) => node && typeof node === "object" && typeof node.childRunId === "string")
    .map((node) => ({
      id: node.id,
      childRunId: node.childRunId,
      childThreadId: node.childThreadId,
      patternRole: node.patternRole,
      status: node.status,
    }));
  const executionPlan = parseJson(task?.execution_plan_json);
  const launchBridgeContract = executionPlan.handoff?.compiler?.launchBridgeContract;
  const bridgeChildLaunches = Array.isArray(launchBridgeContract?.childLaunches)
    ? launchBridgeContract.childLaunches
    : [];
  const workflowOwnedParentMessageIds = new Set(
    [
      task?.parent_message_id,
      launchBridgeContract?.parentMessageId,
      graph.parentMessageId,
    ].filter((id) => typeof id === "string" && id.length > 0),
  );
  const parentMessageLinkVerified = Boolean(
    task?.parent_message_id &&
    parentRun?.assistant_message_id &&
    task.parent_message_id === parentRun.assistant_message_id &&
    launchBridgeContract?.parentMessageId === parentRun.assistant_message_id &&
    graph.parentMessageId === parentRun.assistant_message_id,
  );
  const bridgeContractLinked = launchBridgeContract?.workflowTaskId === task?.id &&
    launchBridgeContract?.schemaVersion === "ambient-callable-workflow-symphony-launch-bridge-v1" &&
    parentMessageLinkVerified &&
    launchBridgeContract?.wait?.mode === "required_all" &&
    launchBridgeContract?.wait?.failurePolicy === "ask_user" &&
    expectedPatternRoles.every((role) =>
      bridgeChildLaunches.some((child) =>
        child.roleNodeId === role &&
        child.patternGraphBinding?.workflowTaskId === task?.id &&
        child.patternGraphBinding?.roleNodeId === role &&
        typeof child.idempotencyKey === "string" &&
        child.idempotencyKey.includes(task?.id ?? "")
      )
    );
  const graphBindsChildren = childRunIds.size >= expectedPatternRoles.length &&
    [...childRunIds].every((id) => graphBindings.some((binding) => binding.childRunId === id));
  const parentThreadId = task?.parent_thread_id ?? persistedSymphonyUserMessage.threadId;
  const parentMessages = readPersistedMessages().filter((message) => message.threadId === parentThreadId);
  const toolNames = parentMessages
    .map((row) => parseJson(row.metadataJson).toolName)
    .filter((toolName) => typeof toolName === "string");
  const allowedParentConductorToolNames = new Set(allowedParentConductorTools);
  const forbiddenParentToolNames = [...new Set(toolNames.filter((toolName) => !allowedParentConductorToolNames.has(toolName)))];
  const pageText = await bodyText(cdp);
  const normalizedPageText = pageText.toLowerCase();
  const uiNamesChildren = expectedPatternRoles.every((role) => normalizedPageText.includes(role));
  const uiShowsWait = pageText.includes("Parent waiting") ||
    pageText.includes("Waiting on") ||
    pageText.includes("Blocking: child running") ||
    pageText.includes("Child ready for parent");
  const assistantMessagesAfterTask = task
    ? parentMessages.filter((message) =>
      message.role === "assistant" &&
      (
        message.createdAt >= task.created_at ||
        workflowOwnedParentMessageIds.has(message.id) ||
        parentMessageMetadataReferencesWorkflowTask(message, task.id)
      ) &&
      message.content.trim().length > 0
    )
    : [];
  return {
    expectedWorkflowTool,
    expectedPatternId,
    requiredPatternRoles: expectedPatternRoles,
    persistedUserMessage: {
      id: persistedSymphonyUserMessage.id,
      threadId: persistedSymphonyUserMessage.threadId,
    },
    workflowTaskCount: expectedTasks.length,
    allWorkflowTaskCount: tasks.length,
    workflowTask: task ? {
      id: task.id,
      parentThreadId: task.parent_thread_id,
      parentRunId: task.parent_run_id,
      parentMessageId: task.parent_message_id,
      parentRunAssistantMessageId: parentRun?.assistant_message_id,
      status: task.status,
      statusLabel: task.status_label,
      sourceKind: task.source_kind,
    } : undefined,
    parentRun: parentRun ? {
      id: parentRun.id,
      threadId: parentRun.thread_id,
      assistantMessageId: parentRun.assistant_message_id,
      status: parentRun.status,
      startedAt: parentRun.started_at,
      completedAt: parentRun.completed_at,
      errorMessage: parentRun.error_message,
    } : undefined,
    parentRunFailedBeforeWorkflowTask,
    parentRunCompletedWithoutWorkflowTask,
    childRunCount: subagentRuns.length,
    patternRoles,
    childRuns: patternRoleRows.map((row) => ({
      id: row.id,
      childThreadId: row.childThreadId,
      roleId: row.roleId,
      status: row.status,
      patternRole: row.effectiveRole.patternRole,
      baseRole: row.effectiveRole.baseRole,
    })),
    toolNames,
    forbiddenParentToolNames,
    launchBridgeContract: launchBridgeContract ? {
      schemaVersion: launchBridgeContract.schemaVersion,
      workflowTaskId: launchBridgeContract.workflowTaskId,
      childLaunchRoleNodeIds: bridgeChildLaunches.map((child) => child.roleNodeId),
      parentMessageId: launchBridgeContract.parentMessageId,
      waitMode: launchBridgeContract.wait?.mode,
      waitFailurePolicy: launchBridgeContract.wait?.failurePolicy,
      waitTimeoutMs: launchBridgeContract.wait?.timeoutMs,
    } : undefined,
    waitBarrierCount: barriers.length,
    aggregateBarrier: aggregateBarrier ? {
      id: aggregateBarrier.id,
      status: aggregateBarrier.status,
      dependencyMode: aggregateBarrier.dependency_mode,
      failurePolicy: aggregateBarrier.failure_policy,
      childRunIds: parseJsonArray(aggregateBarrier.child_run_ids_json),
      timeoutMs: aggregateBarrier.timeout_ms,
    } : undefined,
    graphPatternId: graph.patternId,
    graphParentMessageId: graph.parentMessageId,
    parentMessageLinkVerified,
    workflowOwnedParentMessageIds: [...workflowOwnedParentMessageIds],
    graphBindings,
    uiNamesChildren,
    uiShowsWait,
    parentAssistantMessagesAfterTask: assistantMessagesAfterTask.map((message) => ({
      id: message.id,
      preview: message.content.slice(0, 160),
    })),
    launchBridgeVerified: expectedTasks.length === 1 &&
      tasks.length === 1 &&
      subagentRuns.length >= expectedPatternRoles.length &&
      requiredPatternRolesPresent &&
      forbiddenParentToolNames.length === 0 &&
      Boolean(aggregateBarrier) &&
      graph.patternId === expectedPatternId &&
      graphBindsChildren &&
      bridgeContractLinked &&
      uiNamesChildren &&
      uiShowsWait &&
      assistantMessagesAfterTask.length === 0,
  };
}

function parentMessageMetadataReferencesWorkflowTask(message, workflowTaskId) {
  const metadata = parseJson(message.metadataJson);
  const blocked = metadata.callableWorkflowFinalizationBlocked;
  if (!blocked || typeof blocked !== "object") return false;
  const taskIds = Array.isArray(blocked.taskIds) ? blocked.taskIds : [];
  if (taskIds.includes(workflowTaskId)) return true;
  const tasks = Array.isArray(blocked.tasks) ? blocked.tasks : [];
  return tasks.some((task) => task && typeof task === "object" && task.id === workflowTaskId);
}

function readPersistedMessages() {
  const dbPath = dogfoodStateDbPath();
  if (!existsSync(dbPath)) return [];
  const sql = [
    "SELECT id, thread_id as threadId, role, content, created_at as createdAt, metadata_json as metadataJson",
    "FROM messages",
    "ORDER BY created_at ASC, rowid ASC",
  ].join(" ");
  return readSqlJson(dbPath, sql);
}

function readRuns() {
  const dbPath = dogfoodStateDbPath();
  if (!existsSync(dbPath)) return [];
  return readSqlJson(dbPath, "SELECT * FROM runs ORDER BY started_at ASC, id ASC");
}

function readCallableWorkflowTasks() {
  const dbPath = dogfoodStateDbPath();
  if (!existsSync(dbPath)) return [];
  return readSqlJson(dbPath, "SELECT * FROM callable_workflow_tasks ORDER BY created_at ASC, id ASC");
}

function readSubagentRuns() {
  const dbPath = dogfoodStateDbPath();
  if (!existsSync(dbPath)) return [];
  return readSqlJson(dbPath, "SELECT * FROM subagent_runs ORDER BY created_at ASC, id ASC");
}

function readSubagentWaitBarriers() {
  const dbPath = dogfoodStateDbPath();
  if (!existsSync(dbPath)) return [];
  return readSqlJson(dbPath, "SELECT * FROM subagent_wait_barriers ORDER BY created_at ASC, id ASC");
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

async function resetDogfoodState() {
  await rm(workspacePath, { recursive: true, force: true });
  await rm(userDataPath, { recursive: true, force: true });
  await mkdir(workspacePath, { recursive: true });
  await mkdir(userDataPath, { recursive: true });
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

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildSymphonyModeLane(input) {
  const launch = input.phase6LaunchEvidence ?? {};
  const conductorLockProven = input.armedMode?.symphonyToggleOn === true &&
    input.armedMode?.symphonyBuilderVisible === true &&
    input.armedMode?.modeReportRequiresPatternPreflight === true &&
    Array.isArray(launch.forbiddenParentToolNames) &&
    launch.forbiddenParentToolNames.length === 0;
  const workflowLaunchVerified = launch.launchBridgeVerified === true &&
    launch.workflowTaskCount === 1 &&
    launch.allWorkflowTaskCount === 1 &&
    launch.workflowTask?.parentThreadId === input.persistedSymphonyUserMessage?.threadId;
  const childWaitEvidenceVerified = workflowLaunchVerified &&
    launch.childRunCount >= expectedPatternRoles.length &&
    launch.waitBarrierCount >= 1 &&
    Boolean(launch.aggregateBarrier) &&
    launch.uiShowsWait === true;
  if (!conductorLockProven || !workflowLaunchVerified || !childWaitEvidenceVerified) {
    throw new Error(`Phase 6 Symphony lane evidence failed: ${JSON.stringify({
      conductorLockProven,
      workflowLaunchVerified,
      childWaitEvidenceVerified,
      launch,
    }, null, 2)}`);
  }
  return {
    ...input.armedMode,
    modeUnderTest: "symphony_mode",
    promptText: input.armedMode?.promptText ?? sharedPrompt,
    symphonyToggleOn: true,
    symphonyBuilderVisible: true,
    patternCardsVisible: true,
    expectedOrchestrationPolicy: "pattern_preflight_workflow_launch_required",
    failureClassIfPatternMissing: "symphony_orchestration_missing",
    userFacingMissingPatternLabel: "Symphony orchestration missing",
    conductorLockProven,
    workflowLaunchVerified,
    childWaitEvidenceVerified,
    persistedUserMessage: input.persistedSymphonyUserMessage,
    phase6LaunchEvidence: launch,
  };
}

function classifyPhase6Failure(stage, error) {
  const message = error instanceof Error ? error.message : String(error);
  if (stage.startsWith("generic")) return "generic_suite_separation_failed";
  if (message.includes("parent run failed before workflow launch")) {
    return "symphony_parent_run_failed_before_workflow_launch";
  }
  if (
    stage.startsWith("symphony") &&
    (
      message.includes("Symphony lane did not report") ||
      message.includes("Phase 6 Symphony lane evidence failed") ||
      message.includes("Timed out waiting for Phase 6 Symphony launch evidence") ||
      message.includes("parent run completed without launching workflow task") ||
      message.includes("workflow tasks launched") ||
      message.includes("parent used forbidden worker tools")
    )
  ) {
    return "symphony_orchestration_missing";
  }
  if (stage.startsWith("symphony")) return "symphony_suite_separation_failed";
  return "phase6_suite_separation_failed";
}

function releaseGateTerminologyEvidence(reportShape) {
  const text = JSON.stringify(reportShape);
  const genericLane = reportShape.modeLanes?.generic;
  const symphonyLane = reportShape.modeLanes?.symphony;
  const genericModeAware = genericLane?.failureClassIfPatternMissing === "symphony_not_armed" &&
    genericLane?.userFacingMissingPatternLabel === "Symphony not armed";
  const symphonyModeAware = !symphonyLane ||
    (
      symphonyLane.failureClassIfPatternMissing === "symphony_orchestration_missing" &&
      symphonyLane.userFacingMissingPatternLabel === "Symphony orchestration missing"
    );
  return {
    reportIncludesSymphonyNotArmed: text.includes("Symphony not armed"),
    reportAvoidsAmbiguousOrchestrationNotDetected: !text.includes("orchestration not detected"),
    modeAwareFailureClasses: Boolean(genericModeAware && symphonyModeAware),
    failureClass: reportShape.failureClass,
    failureStage: reportShape.failureStage,
  };
}

async function waitForChildThreadUi(cdp, roles) {
  await waitFor(cdp, (expectedRoles) => {
    const sidebarText = Array.from(document.querySelectorAll(".thread-row.subagent-child"))
      .map((element) => element.textContent ?? "")
      .join("\n")
      .toLowerCase();
    const inlineText = Array.from(document.querySelectorAll(
      ".subagent-parent-cluster-child-thread, .subagent-thread-inspector, .subagent-child-starting-state",
    ))
      .map((element) => element.textContent ?? "")
      .join("\n");
    const inlineNormalized = inlineText.toLowerCase();
    const sidebarRowsNameChildren = expectedRoles.every((role) => sidebarText.includes(`${role} sub-agent`));
    const inlineCardsNameChildren = inlineText.includes("SUB-AGENT") &&
      expectedRoles.every((role) => inlineNormalized.includes(role));
    return sidebarRowsNameChildren || inlineCardsNameChildren;
  }, roles);
}

async function bodyText(cdp) {
  return evaluate(cdp, () => document.body.innerText);
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
  await mkdir(resultsDir, { recursive: true });
  await writeFile(join(resultsDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function outputPathRelative(path) {
  return path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path;
}

function expectedProviderLabel() {
  return (process.env.AMBIENT_PROVIDER || "ambient") === "gmi-cloud" ? "GMI Cloud API" : "Ambient API";
}

function dogfoodCdpPort() {
  return cdpPortFromEnv() ?? failMissingCdpPort();
}

async function allocateAdditionalCdpPort(excludedPort) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const port = await allocateLocalPort();
    if (port !== excludedPort) return port;
  }
  throw new Error(`Could not allocate a second CDP port distinct from ${excludedPort}.`);
}

async function allocateLocalPort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a local CDP port.");
  const port = address.port;
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
  return port;
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

async function terminateApp(app) {
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
  await Promise.race([
    once(app, "exit"),
    delay(5_000).then(() => {
      if (app.exitCode === null) app.kill("SIGKILL");
    }),
  ]);
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
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${signal ?? code}.`);
  }
}

function cleanChildEnv(env) {
  const next = { ...env };
  delete next.NODE_OPTIONS;
  delete next.VITEST;
  return next;
}
