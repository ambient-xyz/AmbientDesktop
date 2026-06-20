#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { access, chmod, cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { liveRunSettledAfterCurrentSend } from "./web-research-live-state.mjs";

const repoRoot = process.cwd();
const resultsDir = join(repoRoot, "test-results", "agent-memory-ux-modes");
const latestReportPath = join(resultsDir, "latest.json");
const modelRootRelativePath = ".ambient/memory/tencentdb/embeddings/models";
const serverStateRelativePath = ".ambient/memory/tencentdb/embeddings/llama-server";
const runtimeRootRelativePath = ".ambient/vision/minicpm-v/runtime";
const modelFilename = "embeddinggemma-300m-qat-Q8_0.gguf";
const defaultDogfoodProvider = "ambient";
const defaultDogfoodModel = "moonshotai/kimi-k2.7-code";
const cdpCommandTimeoutMs = 20_000;
const appWaitTimeoutMs = 90_000;
const chatTurnTimeoutMs = Number(process.env.AMBIENT_AGENT_MEMORY_UX_CHAT_TIMEOUT_MS ?? 240_000);

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
  assertNoExistingLlamaResidents("Agent Memory UX mode dogfood");

  await run("pnpm", ["run", "prepare:electron-native"], buildDogfoodEnv());

  const scratch = await createScratch();
  let app;
  let cdp;
  try {
    const assets = await prepareManagedAssets(sourceManagedRoot, scratch.managedRoot);
    checks.copiedManagedAssets = {
      runtimeBinary: outputPathRelative(assets.runtimeBinaryPath),
      model: outputPathRelative(assets.modelPath),
    };

    app = launchDesktop({ workspacePath: scratch.workspacePath, userDataPath: scratch.userDataPath, managedRoot: scratch.managedRoot });
    cdp = await connectToElectron(dogfoodCdpPort(), app);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await setViewport(cdp, 1500, 950);
    await waitForText(cdp, "Ambient", appWaitTimeoutMs);
    await installLiveCollector(cdp);
    await evaluate(cdp, async () => {
      await window.ambientDesktop.updateFeatureFlagSettings({ tencentDbMemory: true });
      await window.ambientDesktop.updateMemorySettings({ mode: "disabled" });
      return true;
    });
    const preExistingThreadId = await createThread(cdp, { title: "Agent Memory UX pre-existing thread" });
    const preExistingBefore = await getThreadSummary(cdp, preExistingThreadId);
    if (preExistingBefore?.memoryEnabled !== false) {
      throw new Error(`Expected pre-existing thread memory flag to start off in disabled mode; saw ${JSON.stringify(preExistingBefore)}.`);
    }

    await openAgentMemorySettings(cdp);
    await setMemoryModeFromUi(cdp, "enabled_all");
    await ensureStarterReady(cdp);
    await waitForText(cdp, "Enabled globally", appWaitTimeoutMs);
    artifacts.globalSettingsScreenshot = await writeScreenshot(cdp, "global-enabled-settings.png");
    checks.globalUi = await assertSettingsUi(cdp, {
      mode: "enabled_all",
      modeLabel: "Enabled globally",
      topbarToggleVisible: false,
      starterState: "ready",
    });

    const globalPhraseValue = `cyan harbor ${Date.now()}`;
    const globalPhrase = `The Ambient memory UX global phrase is ${globalPhraseValue}.`;
    const globalCapture = await runChatTurn(
      cdp,
      preExistingThreadId,
      [
        "Please store this durable memory exactly:",
        `"${globalPhrase}"`,
        "Use ambient_memory_create with confirmed=true, then reply exactly GLOBAL_MEMORY_STORED.",
      ].join("\n"),
    );
    assertIncludes(globalCapture.assistantText, "GLOBAL_MEMORY_STORED", "global capture reply");
    assertToolUsed(globalCapture, "ambient_memory_create", "global capture");
    await delay(1_500);

    const globalRecallThreadId = await createThread(cdp, { title: "Agent Memory UX global recall" });
    const globalRecall = await runChatTurn(
      cdp,
      globalRecallThreadId,
      [
        "Answer from Agent Memory if available.",
        "What is the Ambient memory UX global phrase?",
        "Reply exactly: GLOBAL_MEMORY_RECALLED: <remembered phrase>",
      ].join("\n"),
    );
    const globalRecallEvidence = assertMemoryRetrieved(globalRecall, globalPhraseValue, "global recall");
    checks.globalMemory = {
      ...summarizeTurnPair(globalCapture, globalRecall, globalPhrase),
      recallEvidence: globalRecallEvidence,
      preExistingThreadBeforeModeChange: {
        threadId: preExistingBefore?.id,
        memoryEnabled: preExistingBefore?.memoryEnabled,
      },
      existingThreadInheritedTools: globalCapture.toolNames.includes("ambient_memory_create"),
    };

    await openAgentMemorySettings(cdp);
    await setMemoryModeFromUi(cdp, "per_thread");
    await waitForSettingsMode(cdp, "per_thread");
    await waitForText(cdp, "Available per thread", appWaitTimeoutMs);
    const perThreadCaptureThreadId = await createThread(cdp, { title: "Agent Memory UX per-thread capture", refreshRenderer: true });
    await expectTopbarMemoryToggle(cdp, false);
    await setThreadMemoryFromTopbar(cdp, true);
    artifacts.perThreadTopbarScreenshot = await writeScreenshot(cdp, "per-thread-topbar-toggle.png");
    await openAgentMemorySettings(cdp);
    checks.perThreadUi = await assertSettingsUi(cdp, {
      mode: "per_thread",
      modeLabel: "Available per thread",
      topbarToggleVisible: true,
      starterState: "ready",
    });

    const perThreadPhraseValue = `mint compass ${Date.now()}`;
    const perThreadPhrase = `The Ambient memory UX per-thread phrase is ${perThreadPhraseValue}.`;
    const perThreadCapture = await runChatTurn(
      cdp,
      perThreadCaptureThreadId,
      [
        "Please store this durable memory exactly:",
        `"${perThreadPhrase}"`,
        "Use ambient_memory_create with confirmed=true, then reply exactly PER_THREAD_MEMORY_STORED.",
      ].join("\n"),
    );
    assertIncludes(perThreadCapture.assistantText, "PER_THREAD_MEMORY_STORED", "per-thread capture reply");
    assertToolUsed(perThreadCapture, "ambient_memory_create", "per-thread capture");
    await delay(1_500);

    const perThreadRecallThreadId = await createThread(cdp, { title: "Agent Memory UX per-thread enabled recall", refreshRenderer: true });
    await setThreadMemoryFromTopbar(cdp, true);
    const perThreadRecall = await runChatTurn(
      cdp,
      perThreadRecallThreadId,
      [
        "Answer from Agent Memory if available.",
        "What is the Ambient memory UX per-thread phrase?",
        "Reply exactly: PER_THREAD_MEMORY_RECALLED: <remembered phrase>",
      ].join("\n"),
    );
    const perThreadRecallEvidence = assertMemoryRetrieved(perThreadRecall, perThreadPhraseValue, "per-thread enabled recall");

    const perThreadDisabledThreadId = await createThread(cdp, { title: "Agent Memory UX per-thread disabled control", refreshRenderer: true });
    await expectTopbarMemoryToggle(cdp, false);
    const perThreadDisabled = await runChatTurn(
      cdp,
      perThreadDisabledThreadId,
      [
        "This thread should not have Agent Memory access.",
        "What is the Ambient memory UX per-thread phrase?",
        "If no explicit Agent Memory value is available, reply exactly PER_THREAD_NO_MEMORY.",
      ].join("\n"),
    );
    assertIncludes(perThreadDisabled.assistantText, "PER_THREAD_NO_MEMORY", "per-thread disabled control reply");
    assertNotIncludes(perThreadDisabled.assistantText, perThreadPhraseValue, "per-thread disabled control reply");
    assertNoMemoryTools(perThreadDisabled, "per-thread disabled control");
    await setThreadMemoryFromTopbar(cdp, true);
    const perThreadEnabledAfterToggle = await runChatTurn(
      cdp,
      perThreadDisabledThreadId,
      [
        "Memory is now enabled for this thread.",
        "Answer from Agent Memory if available.",
        "What is the Ambient memory UX per-thread phrase?",
        "Reply exactly: PER_THREAD_AFTER_TOGGLE_RECALLED: <remembered phrase>",
      ].join("\n"),
    );
    const perThreadAfterToggleRecallEvidence = assertMemoryRetrieved(
      perThreadEnabledAfterToggle,
      perThreadPhraseValue,
      "per-thread after-toggle recall",
    );
    checks.perThreadMemory = {
      phrase: perThreadPhrase,
      capture: summarizeTurn(perThreadCapture),
      enabledRecall: summarizeTurn(perThreadRecall),
      enabledRecallEvidence: perThreadRecallEvidence,
      disabledControl: summarizeTurn(perThreadDisabled),
      enabledAfterToggle: summarizeTurn(perThreadEnabledAfterToggle),
      enabledAfterToggleRecallEvidence: perThreadAfterToggleRecallEvidence,
    };

    const blockedPhraseValue = `gray bridge ${Date.now()}`;
    const blockedPhrase = `The Ambient memory UX blocked-thread phrase is ${blockedPhraseValue}.`;
    const perThreadOffCaptureThreadId = await createThread(cdp, { title: "Agent Memory UX per-thread off capture", refreshRenderer: true });
    await expectTopbarMemoryToggle(cdp, false);
    const perThreadOffCapture = await runChatTurn(
      cdp,
      perThreadOffCaptureThreadId,
      [
        "This thread should not have Agent Memory tools.",
        "Please store this durable memory exactly:",
        `"${blockedPhrase}"`,
        "If ambient_memory_create is unavailable, reply exactly BLOCKED_THREAD_NO_MEMORY_TOOLS.",
      ].join("\n"),
    );
    assertNoMemoryTools(perThreadOffCapture, "per-thread off capture");
    const blockedRecallThreadId = await createThread(cdp, { title: "Agent Memory UX blocked capture recall" });
    await setThreadMemoryFromTopbar(cdp, true);
    const blockedRecall = await runChatTurn(
      cdp,
      blockedRecallThreadId,
      [
        "Use Agent Memory search to answer.",
        "What is the Ambient memory UX blocked-thread phrase?",
        "If no explicit Agent Memory value is available, reply exactly BLOCKED_THREAD_NOT_CAPTURED.",
      ].join("\n"),
    );
    assertIncludes(blockedRecall.assistantText, "BLOCKED_THREAD_NOT_CAPTURED", "blocked-thread recall reply");
    assertNotIncludes(blockedRecall.assistantText, blockedPhraseValue, "blocked-thread recall reply");
    checks.perThreadOffCannotCapture = {
      phrase: blockedPhrase,
      offCapture: summarizeTurn(perThreadOffCapture),
      enabledRecall: summarizeTurn(blockedRecall),
    };

    await openAgentMemorySettings(cdp);
    await setMemoryModeFromUi(cdp, "disabled");
    await waitForSettingsMode(cdp, "disabled");
    await waitForStarterState(cdp, "off", 60_000);
    await waitForText(cdp, "Disabled", appWaitTimeoutMs);
    artifacts.disabledSettingsScreenshot = await writeScreenshot(cdp, "disabled-settings.png");
    checks.disabledUi = await assertSettingsUi(cdp, {
      mode: "disabled",
      modeLabel: "Disabled",
      topbarToggleVisible: false,
      starterState: "off",
    });

    const disabledThreadId = await createThread(cdp, { title: "Agent Memory UX disabled control" });
    const disabledControl = await runChatTurn(
      cdp,
      disabledThreadId,
      [
        "Agent Memory is globally disabled.",
        "What are the Ambient memory UX phrases?",
        "If no explicit Agent Memory value is available, reply exactly MEMORY_DISABLED_NO_ACCESS.",
      ].join("\n"),
    );
    assertIncludes(disabledControl.assistantText, "MEMORY_DISABLED_NO_ACCESS", "global disabled control reply");
    assertNotIncludes(disabledControl.assistantText, globalPhraseValue, "global disabled control reply");
    assertNotIncludes(disabledControl.assistantText, perThreadPhraseValue, "global disabled control reply");
    assertNoMemoryTools(disabledControl, "global disabled control");
    checks.disabledMemory = {
      disabledThreadId,
      control: summarizeTurn(disabledControl),
    };

    const finalDiagnostics = await getMemoryDiagnostics(cdp);
    checks.finalDiagnostics = summarizeDiagnostics(finalDiagnostics);
    checks.scratchEmbeddingRuntimePidsAfterDisable = scratchEmbeddingRuntimePids(scratch.managedRoot);
    if (checks.scratchEmbeddingRuntimePidsAfterDisable.length > 0) {
      throw new Error(`Expected no scratch embedding runtimes after disabling memory, saw PIDs ${checks.scratchEmbeddingRuntimePidsAfterDisable.join(", ")}.`);
    }

    await writeReport({
      schemaVersion: "ambient-agent-memory-ux-modes-dogfood-v1",
      status: "passed",
      classification: "passed",
      generatedAt: new Date().toISOString(),
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      gitCommit: gitValue(["rev-parse", "HEAD"]),
      gitBranch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
      provider: dogfoodProviderId(),
      model: dogfoodModelId(),
      headful: true,
      cdpPort: dogfoodCdpPort(),
      scenarios: [
        "global_enabled_cross_thread_recall",
        "global_enabled_existing_thread_inherits_tools",
        "per_thread_enabled_and_disabled_controls",
        "per_thread_disabled_thread_cannot_capture",
        "global_disabled_no_memory_tools",
      ],
      artifacts,
      checks,
    });
  } finally {
    cdp?.close();
    await terminateApp(app);
    await killScratchEmbeddingRuntimes(scratch.managedRoot);
    await cleanupScratch(scratch.root);
  }
} catch (error) {
  exitCode = 1;
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  checks.error = message;
  await writeReport({
    schemaVersion: "ambient-agent-memory-ux-modes-dogfood-v1",
    status: "failed",
    classification: "failed",
    generatedAt: new Date().toISOString(),
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    gitCommit: gitValue(["rev-parse", "HEAD"]),
    gitBranch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
    provider: dogfoodProviderId(),
    model: dogfoodModelId(),
    headful: true,
    cdpPort: cdpPortFromEnv() ?? -1,
    scenarios: [
      "global_enabled_cross_thread_recall",
      "global_enabled_existing_thread_inherits_tools",
      "per_thread_enabled_and_disabled_controls",
      "per_thread_disabled_thread_cannot_capture",
      "global_disabled_no_memory_tools",
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

async function createScratch() {
  const root = await mkdtemp(join(tmpdir(), "ambient-memory-ux-modes-"));
  const workspacePath = join(root, "workspace");
  const userDataPath = join(root, "userData");
  const managedRoot = join(userDataPath, "managed-installs");
  await mkdir(workspacePath, { recursive: true });
  await mkdir(managedRoot, { recursive: true });
  return { root, workspacePath, userDataPath, managedRoot };
}

async function cleanupScratch(root) {
  if (process.env.AMBIENT_AGENT_MEMORY_UX_DOGFOOD_KEEP_SCRATCH === "1") {
    process.stdout.write(`Agent Memory UX dogfood scratch retained at ${root}\n`);
    return;
  }
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(root, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await delay(250 * (attempt + 1));
    }
  }
  process.stderr.write(`Agent Memory UX dogfood scratch cleanup skipped for ${root}: ${lastError instanceof Error ? lastError.message : String(lastError)}\n`);
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
    process.env.AMBIENT_AGENT_MEMORY_UX_SOURCE_MANAGED_ROOT,
    process.env.AMBIENT_AGENT_MEMORY_UX_SOURCE_USER_DATA
      ? join(process.env.AMBIENT_AGENT_MEMORY_UX_SOURCE_USER_DATA, "managed-installs")
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
  return score;
}

async function findModelPath(managedRoot) {
  const root = join(managedRoot, modelRootRelativePath);
  const paths = (await walkFiles(root)).filter((path) => basename(path) === modelFilename).sort();
  if (!paths[0]) throw new Error(`No ${modelFilename} found under ${root}.`);
  return paths[0];
}

async function walkFiles(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const paths = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...await walkFiles(path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
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
      AMBIENT_AGENT_MEMORY_UX_DOGFOOD: "1",
    }),
  });
}

async function openAgentMemorySettings(cdp) {
  await waitForText(cdp, "Ambient", appWaitTimeoutMs);
  const alreadyOpen = await evaluate(cdp, () => Boolean(document.querySelector(".settings-shell")));
  if (!alreadyOpen) {
    await clickByText(cdp, "button", "Settings");
    await waitFor(cdp, () => Boolean(document.querySelector(".settings-shell")), appWaitTimeoutMs);
  }
  await setSettingsSearch(cdp, "agent memory");
  await waitFor(cdp, () => Boolean(document.querySelector('select[aria-label="Agent Memory mode"]')), appWaitTimeoutMs);
}

async function setMemoryModeFromUi(cdp, mode) {
  await waitFor(cdp, (expected) => {
    const select = [...document.querySelectorAll("select")]
      .find((candidate) => candidate.getAttribute("aria-label") === "Agent Memory mode");
    return select instanceof HTMLSelectElement &&
      !select.disabled &&
      [...select.options].some((option) => option.value === expected);
  }, appWaitTimeoutMs, mode);
  const result = await evaluate(cdp, (expected) => {
    const select = [...document.querySelectorAll("select")]
      .find((candidate) => candidate.getAttribute("aria-label") === "Agent Memory mode");
    if (!(select instanceof HTMLSelectElement)) {
      return { ok: false, reason: "missing" };
    }
    if (select.disabled) {
      return { ok: false, reason: "disabled", value: select.value };
    }
    const options = [...select.options].map((option) => ({ value: option.value, text: option.textContent }));
    const option = [...select.options].find((candidate) => candidate.value === expected);
    if (!option) {
      return { ok: false, reason: "option-missing", value: select.value, options };
    }
    select.selectedIndex = option.index;
    option.selected = true;
    const valueBeforeDispatch = select.value;
    select.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    select.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    return {
      ok: valueBeforeDispatch === expected,
      valueBeforeDispatch,
      valueAfterDispatch: select.value,
      options,
    };
  }, mode);
  if (!result?.ok) {
    throw new Error(`Failed to set Agent Memory mode to ${mode}: ${JSON.stringify(result)}.`);
  }
  await waitForSettingsMode(cdp, mode);
}

async function ensureStarterReady(cdp) {
  await evaluate(cdp, async () => {
    await window.ambientDesktop.updateFeatureFlagSettings({ tencentDbMemory: true });
    await window.ambientDesktop.updateMemorySettings({ mode: "enabled_all" });
    await window.ambientDesktop.enableAgentMemoryStarter({ enableCurrentThread: false, enableNewThreads: true });
    return true;
  });
  await waitForStarterState(cdp, "ready", 240_000);
}

async function waitForSettingsMode(cdp, mode) {
  await waitFor(cdp, async (expected) => {
    const state = await window.ambientDesktop.bootstrap();
    return state.settings?.memory?.mode === expected;
  }, appWaitTimeoutMs, mode);
}

async function waitForStarterState(cdp, state, timeoutMs) {
  await waitFor(cdp, async (expected) => {
    const status = await window.ambientDesktop.getAgentMemoryStarterStatus();
    return status.state === expected;
  }, timeoutMs, state);
}

async function assertSettingsUi(cdp, input) {
  await waitForSettingsMode(cdp, input.mode);
  await waitForStarterState(cdp, input.starterState, appWaitTimeoutMs);
  await waitFor(cdp, (expected) => {
    const select = [...document.querySelectorAll("select")]
      .find((candidate) => candidate.getAttribute("aria-label") === "Agent Memory mode");
    const topbarToggle = document.querySelector('[aria-label="Memory for this thread"]');
    return select instanceof HTMLSelectElement &&
      select.value === expected.mode &&
      Boolean(topbarToggle) === expected.topbarToggleVisible;
  }, appWaitTimeoutMs, { mode: input.mode, topbarToggleVisible: input.topbarToggleVisible });
  const snapshot = await evaluate(cdp, async () => {
    const state = await window.ambientDesktop.bootstrap();
    const starter = await window.ambientDesktop.getAgentMemoryStarterStatus();
    const select = [...document.querySelectorAll("select")]
      .find((candidate) => candidate.getAttribute("aria-label") === "Agent Memory mode");
    const topbarToggle = document.querySelector('[aria-label="Memory for this thread"]');
    return {
      memoryMode: state.settings?.memory?.mode,
      memoryEnabled: state.settings?.memory?.enabled,
      defaultThreadEnabled: state.settings?.memory?.defaultThreadEnabled,
      embeddingsEnabled: state.settings?.memory?.embeddings?.enabled,
      embeddingsAutoStart: state.settings?.memory?.embeddings?.autoStartProvider,
      starterState: starter.state,
      starterHealth: starter.health,
      starterSummary: starter.summary,
      selectValue: select instanceof HTMLSelectElement ? select.value : undefined,
      bodyHasModeLabel: document.body.innerText.includes("Enabled globally") ||
        document.body.innerText.includes("Per thread") ||
        document.body.innerText.includes("Disabled"),
      topbarToggleVisible: Boolean(topbarToggle),
    };
  });
  if (snapshot.memoryMode !== input.mode || snapshot.selectValue !== input.mode) {
    throw new Error(`Expected Agent Memory mode ${input.mode}; saw ${JSON.stringify(snapshot)}.`);
  }
  if (snapshot.starterState !== input.starterState) {
    throw new Error(`Expected Agent Memory starter ${input.starterState}; saw ${JSON.stringify(snapshot)}.`);
  }
  if (snapshot.topbarToggleVisible !== input.topbarToggleVisible) {
    throw new Error(`Expected topbar toggle visible=${input.topbarToggleVisible}; saw ${JSON.stringify(snapshot)}.`);
  }
  await waitForText(cdp, input.modeLabel, appWaitTimeoutMs);
  return snapshot;
}

async function createThread(cdp, input) {
  const threadId = await evaluate(cdp, async (title, model) => {
    const state = await window.ambientDesktop.bootstrap();
    const next = await window.ambientDesktop.createThread({
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: model || state.settings.model,
      thinkingLevel: "minimal",
    });
    const threadId = next.activeThreadId;
    if (title && window.ambientDesktop.updateThread) {
      await window.ambientDesktop.updateThread({ threadId, title });
    }
    await window.ambientDesktop.selectThread(threadId);
    return threadId;
  }, input.title, dogfoodModelId());
  if (!threadId) throw new Error("createThread did not return an active thread id.");
  if (input.refreshRenderer) {
    await reloadRenderer(cdp);
    if (input.title) await waitForText(cdp, input.title, appWaitTimeoutMs);
  }
  return threadId;
}

async function reloadRenderer(cdp) {
  await cdp.send("Page.reload", { ignoreCache: true }, { timeoutMs: 30_000 });
  await waitForText(cdp, "Ambient", appWaitTimeoutMs);
  await installLiveCollector(cdp);
}

async function getThreadSummary(cdp, threadId) {
  return evaluate(cdp, async (id) => {
    const state = await window.ambientDesktop.bootstrap();
    return state.threads.find((thread) => thread.id === id);
  }, threadId);
}

async function expectTopbarMemoryToggle(cdp, checked) {
  await waitFor(cdp, (expected) => {
    const input = document.querySelector('[aria-label="Memory for this thread"]');
    return input instanceof HTMLInputElement && input.checked === expected;
  }, appWaitTimeoutMs, checked);
}

async function setThreadMemoryFromTopbar(cdp, enabled) {
  await waitFor(cdp, (expected) => {
    const input = document.querySelector('[aria-label="Memory for this thread"]');
    if (!(input instanceof HTMLInputElement)) return false;
    if (input.checked !== expected) input.click();
    return true;
  }, appWaitTimeoutMs, enabled);
  await waitFor(cdp, async (expected) => {
    const state = await window.ambientDesktop.bootstrap();
    const thread = state.threads.find((candidate) => candidate.id === state.activeThreadId);
    return Boolean(thread?.memoryEnabled) === expected;
  }, appWaitTimeoutMs, enabled);
}

async function runChatTurn(cdp, threadId, content) {
  await resetLiveCollector(cdp);
  await evaluate(cdp, async (input) => {
    const live = window.__ambientMemoryUxDogfood;
    const state = await window.ambientDesktop.bootstrap();
    await window.ambientDesktop.selectThread(input.threadId);
    window.ambientDesktop.sendMessage({
      threadId: input.threadId,
      content: input.content,
      permissionMode: "full-access",
      collaborationMode: "agent",
      model: input.model || state.settings.model,
      thinkingLevel: "minimal",
    })
      .then(() => {
        live.sendResolved = true;
      })
      .catch((error) => {
        live.error = error instanceof Error ? error.message : String(error);
      });
    return true;
  }, {
    threadId,
    content,
    model: dogfoodModelId(),
  });
  await waitForLiveCompletion(cdp, chatTurnTimeoutMs);
  const state = await evaluate(cdp, async (id) => {
    await window.ambientDesktop.selectThread(id);
    return window.ambientDesktop.bootstrap();
  }, threadId);
  const live = await getLiveState(cdp);
  const messages = (state.messages ?? []).filter((message) => message.threadId === threadId);
  return {
    threadId,
    assistantText: messages.filter((message) => message.role === "assistant").map((message) => message.content).join("\n"),
    toolNames: toolNamesFromMessages(messages, live),
    toolMessages: messages.filter((message) => message.role === "tool").map((message) => ({
      toolName: String(message.metadata?.toolName ?? ""),
      contentPreview: String(message.content ?? "").slice(0, 2000),
    })),
    live,
  };
}

function toolNamesFromMessages(messages, live) {
  const names = new Set(live?.toolNames ?? []);
  for (const message of messages) {
    if (message.role !== "tool") continue;
    const toolName = String(message.metadata?.toolName ?? "");
    if (toolName) names.add(toolName);
  }
  return [...names];
}

async function installLiveCollector(cdp) {
  await evaluate(cdp, () => {
    window.__ambientMemoryUxDogfood?.unsubscribe?.();
    window.__ambientMemoryUxDogfood = {
      statuses: [],
      toolMessageIds: [],
      toolNames: [],
      toolNameCounts: {},
      runtimeActivities: [],
      toolMessages: [],
      assistantTail: "",
      sawRunStart: false,
      sawRunIdle: false,
      lastStatusAtMs: 0,
      sendResolved: true,
      error: undefined,
    };
    window.__ambientMemoryUxDogfood.unsubscribe = window.ambientDesktop.onEvent((event) => {
      const live = window.__ambientMemoryUxDogfood;
      if (event.type === "run-status") {
        live.lastStatusAtMs = Date.now();
        live.statuses.push(event.status);
        if (event.status !== "idle") live.sawRunStart = true;
        if (live.sawRunStart && event.status === "idle") live.sawRunIdle = true;
      }
      if (event.type === "runtime-activity") {
        live.runtimeActivities.push({
          kind: event.activity?.kind,
          status: event.activity?.status,
          toolName: event.activity?.toolName ?? event.activity?.details?.toolName,
          message: event.activity?.message,
          outputChars: event.activity?.outputChars,
          thinkingChars: event.activity?.thinkingChars,
          idleElapsedMs: event.activity?.idleElapsedMs,
          idleTimeoutMs: event.activity?.idleTimeoutMs,
        });
        live.runtimeActivities = live.runtimeActivities.slice(-24);
      }
      if (event.type === "message-delta") {
        live.assistantTail = (live.assistantTail + String(event.delta ?? "")).slice(-6000);
      }
      if ((event.type === "message-created" || event.type === "message-updated") && event.message?.role === "tool") {
        const toolName = String(event.message.metadata?.toolName ?? "");
        if (!toolName) return;
        const messageId = event.message.id === undefined || event.message.id === null ? "" : String(event.message.id);
        const toolMessageKey = messageId || `${toolName}:${live.toolNames.length}`;
        if (live.toolMessageIds.includes(toolMessageKey)) return;
        live.toolMessageIds.push(toolMessageKey);
        live.toolNames.push(toolName);
        live.toolNameCounts[toolName] = (live.toolNameCounts[toolName] ?? 0) + 1;
        live.toolMessages.push({
          toolName,
          metadata: event.message.metadata ?? {},
          content: String(event.message.content ?? "").slice(0, 4000),
        });
        live.toolMessages = live.toolMessages.slice(-20);
      }
      if (event.type === "error") live.error = event.message;
    });
    return true;
  });
}

async function resetLiveCollector(cdp) {
  await evaluate(cdp, () => {
    const live = window.__ambientMemoryUxDogfood;
    if (!live) return false;
    live.statuses = [];
    live.toolMessageIds = [];
    live.toolNames = [];
    live.toolNameCounts = {};
    live.runtimeActivities = [];
    live.toolMessages = [];
    live.assistantTail = "";
    live.sawRunStart = false;
    live.sawRunIdle = false;
    live.lastStatusAtMs = 0;
    live.sendResolved = false;
    live.error = undefined;
    return true;
  });
}

async function waitForLiveCompletion(cdp, maxMs) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const live = await getLiveState(cdp);
    if (live?.error) throw new Error(live.error);
    if (liveRunSettledAfterCurrentSend(live, { idleGraceMs: 2_000 })) return;
    await delay(1_000);
  }
  const live = await getLiveState(cdp);
  throw new Error(`Timed out waiting for Agent Memory UX chat turn. collector=${JSON.stringify(live)}`);
}

async function getLiveState(cdp) {
  return evaluate(cdp, () => {
    const live = window.__ambientMemoryUxDogfood;
    return live ? {
      statuses: live.statuses,
      toolNames: live.toolNames,
      toolNameCounts: live.toolNameCounts,
      toolMessageCount: live.toolNames.length,
      toolMessages: live.toolMessages,
      runtimeActivities: live.runtimeActivities,
      assistantTail: live.assistantTail,
      sawRunStart: live.sawRunStart,
      sawRunIdle: live.sawRunIdle,
      lastStatusAtMs: live.lastStatusAtMs,
      sendResolved: live.sendResolved,
      error: live.error,
    } : undefined;
  });
}

async function getMemoryDiagnostics(cdp) {
  return evaluate(cdp, () => window.ambientDesktop.getAgentMemoryDiagnostics());
}

function summarizeDiagnostics(diagnostics) {
  return {
    adapter: diagnostics?.adapter,
    globalEnabled: diagnostics?.globalEnabled,
    defaultThreadEnabled: diagnostics?.defaultThreadEnabled,
    threadEnabledCount: diagnostics?.threadEnabledCount,
    embeddingStatus: diagnostics?.embedding?.status,
    runtimeSnapshotCount: diagnostics?.runtimeSnapshots?.length ?? 0,
  };
}

function summarizeTurnPair(capture, recall, phrase) {
  return {
    phrase,
    capture: summarizeTurn(capture),
    recall: summarizeTurn(recall),
  };
}

function summarizeTurn(turn) {
  return {
    threadId: turn.threadId,
    assistantText: turn.assistantText.slice(0, 4000),
    toolNames: turn.toolNames,
    toolMessages: turn.toolMessages,
    runtimeActivities: turn.live?.runtimeActivities ?? [],
  };
}

function assertToolUsed(turn, toolName, label) {
  if (!turn.toolNames.includes(toolName)) {
    throw new Error(`Expected ${label} to use ${toolName}; saw ${turn.toolNames.join(", ") || "no tools"}. Assistant: ${turn.assistantText}`);
  }
}

function assertMemoryRetrieved(turn, phraseValue, label) {
  assertIncludes(turn.assistantText, phraseValue, `${label} reply`);
  if (turn.toolNames.includes("tdai_memory_search")) return "tdai_memory_search";
  if (/ambient_memory_context|\[episodic\|explicit_memory\]/i.test(turn.assistantText)) return "injected_memory_context";
  return "recalled_unique_value";
}

function assertNoMemoryTools(turn, label) {
  const memoryTools = turn.toolNames.filter((toolName) => /memory|tdai/i.test(toolName));
  if (memoryTools.length > 0) {
    throw new Error(`Expected ${label} to have no memory tools; saw ${memoryTools.join(", ")}.`);
  }
}

function assertIncludes(value, expected, label) {
  if (!String(value).includes(expected)) {
    throw new Error(`Expected ${label} to include ${JSON.stringify(expected)}; saw ${JSON.stringify(String(value).slice(0, 1000))}.`);
  }
}

function assertNotIncludes(value, expected, label) {
  if (String(value).includes(expected)) {
    throw new Error(`Expected ${label} not to include ${JSON.stringify(expected)}; saw ${JSON.stringify(String(value).slice(0, 1000))}.`);
  }
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
  return outputPathRelative(outputPath);
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
  if (process.env.AMBIENT_AGENT_MEMORY_UX_DOGFOOD_ALLOW_EXISTING_LLAMA === "1") return;
  const residents = existingLlamaResidentProcesses();
  if (residents.length === 0) return;
  const preview = residents
    .slice(0, 5)
    .map((process) => residentProcessSummary(process))
    .join("; ");
  throw new Error(
    `Harness environment preflight failed: unrelated resident llama.cpp processes are running before ${label}. ` +
    `Stop them before running Agent Memory UX mode dogfood, or set AMBIENT_AGENT_MEMORY_UX_DOGFOOD_ALLOW_EXISTING_LLAMA=1 only for deliberate non-isolated debugging. Residents: ${preview}`,
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

async function killScratchEmbeddingRuntimes(managedRoot) {
  for (const pid of scratchEmbeddingRuntimePids(managedRoot)) {
    await killPid(pid);
  }
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

function buildDogfoodEnv(extra = {}) {
  const providerId = dogfoodProviderId();
  const modelId = dogfoodModelId(providerId);
  return cleanChildEnv({
    ...process.env,
    ...extra,
    AMBIENT_PROVIDER: providerId,
    ...(providerId === "gmi-cloud" ? { GMI_CLOUD_MODEL: modelId } : { AMBIENT_LIVE_MODEL: modelId }),
  });
}

function dogfoodProviderId() {
  return process.env.AMBIENT_PROVIDER || defaultDogfoodProvider;
}

function dogfoodModelId(providerId = dogfoodProviderId()) {
  return providerId === "gmi-cloud"
    ? process.env.GMI_CLOUD_MODEL || process.env.AMBIENT_MODEL || defaultDogfoodModel
    : process.env.AMBIENT_LIVE_MODEL || process.env.AMBIENT_MODEL || defaultDogfoodModel;
}

function cleanChildEnv(env) {
  const next = { ...env };
  delete next.NODE_OPTIONS;
  delete next.VITEST;
  return next;
}

function dogfoodCdpPort() {
  return cdpPortFromEnv() ?? 19788;
}

function cdpPortFromEnv() {
  const parsed = Number(process.env.AMBIENT_HARNESS_CDP_PORT || process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

async function writeReport(report) {
  await mkdir(resultsDir, { recursive: true });
  await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const runReportPath = join(resultsDir, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function gitValue(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

async function getAvailablePort() {
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
  return port;
}

function outputPathRelative(path) {
  const absolute = resolve(path);
  return absolute.startsWith(`${repoRoot}/`) ? relative(repoRoot, absolute) : absolute;
}
