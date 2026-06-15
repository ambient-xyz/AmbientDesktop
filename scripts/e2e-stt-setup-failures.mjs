#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const port = Number(process.env.AMBIENT_STT_SETUP_FAILURES_CDP_PORT ?? 9483);
const workspace = await mkdtemp(join(tmpdir(), "ambient-stt-setup-failures-"));
const diagnosticsPath = join(workspace, "stt-setup-failures-summary.json");
const fixturePath = process.env.AMBIENT_STT_SETUP_FAILURES_AUDIO_PATH || join(process.cwd(), ".ambient", "stt-spike", "fixtures", "en-short-clean.wav");
const missingRuntimePath = join(workspace, "missing", "llama-mtmd-cli");
const successRuntimePath = join(workspace, "runtime", "llama-mtmd-cli-success");
const failingRuntimePath = join(workspace, "runtime", "llama-mtmd-cli-missing-model");
const expectedTranscript = "setup repair speech passed";
const output = [];
const children = new Set();
let appInstance;

try {
  if (!existsSync(fixturePath)) throw new Error(`STT setup failure audio fixture was not found: ${fixturePath}`);
  await writeFile(
    join(workspace, "README.md"),
    [
      "# Ambient STT setup failure workspace",
      "",
      "This temporary workspace validates Qwen3-ASR setup, repair, missing runtime, and validation-failure surfaces through Desktop IPC.",
      "",
    ].join("\n"),
    "utf8",
  );

  appInstance = await launchApp();
  const summary = await runSetupFailureSmoke(appInstance.cdp);
  await writeFile(diagnosticsPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(outputTail());
  throw error;
} finally {
  if (appInstance) {
    appInstance.cdp.close();
    await terminateProcessTree(appInstance.child);
  }
  for (const child of children) await terminateProcessTree(child);
  await terminateDebugPortProcesses();
  if (process.env.AMBIENT_STT_SETUP_FAILURES_KEEP_WORKSPACE !== "1") {
    await rm(workspace, { recursive: true, force: true });
  } else {
    console.error(`Keeping STT setup failure workspace: ${workspace}`);
  }
}

console.log("Desktop STT setup failure smoke passed.");

async function launchApp() {
  const child = spawn(
    "pnpm",
    ["exec", "electron-vite", "dev", "--", `--remote-debugging-port=${port}`],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AMBIENT_DESKTOP_WORKSPACE: workspace,
        AMBIENT_E2E: "1",
        AMBIENT_E2E_DIAGNOSTICS_PATH: diagnosticsPath,
        AMBIENT_E2E_STT_DISABLE_RUNTIME_AUTODETECT: "1",
        AMBIENT_E2E_STT_DISABLE_RUNTIME_INSTALL: "1",
        AMBIENT_QWEN3_ASR_BINARY: missingRuntimePath,
        AMBIENT_QWEN3_ASR_MODEL: "ambient-e2e/qwen3-asr-model:Q8_0",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );
  children.add(child);
  child.once("exit", () => children.delete(child));
  child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));

  const target = await waitForTarget(port);
  await delay(750);
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  await waitFor(cdp, () => document.body?.innerText.includes("Ambient"), "main shell", 30_000);
  return { child, cdp };
}

async function runSetupFailureSmoke(cdp) {
  const initialState = await desktopState(cdp);
  await evaluate(
    cdp,
    `window.ambientDesktop.updateSttSettings(${JSON.stringify({
      ...initialState.settings.stt,
      enabled: false,
      spokenLanguage: "English",
      mode: "push-to-talk",
      autoSendAfterTranscription: true,
      silenceFinalizeSeconds: 0.8,
      noSpeechGate: { enabled: true, rmsThresholdDbfs: -55 },
      bargeIn: { stopTtsOnSpeech: true, queueWhileAgentRuns: true },
    })})`,
  );

  const audioBase64 = (await readFile(fixturePath)).toString("base64");
  const audio = await evaluate(
    cdp,
    `window.ambientDesktop.saveSttTestAudio(${JSON.stringify({
      source: "settings-microphone",
      audioBase64,
    })})`,
  );
  if (!audio?.audioPath) throw new Error(`Failed to seed managed STT validation audio: ${JSON.stringify(audio)}`);

  const missingRuntime = await setupProvider(cdp, {
    provider: "qwen3-asr",
    action: "install",
    installRuntime: false,
    validationAudioPath: audio.audioPath,
    spokenLanguage: "English",
    selectProvider: true,
    enable: true,
  });
  assertSetupStatus(missingRuntime, "needs-runtime", "missing runtime install");
  assertValidationStatus(missingRuntime, "needs-runtime", "missing runtime install");
  if (!String(missingRuntime.validation.error ?? "").includes("Configured Qwen3-ASR binary does not exist")) {
    throw new Error(`Missing-runtime setup did not surface the configured binary failure: ${JSON.stringify(missingRuntime.validation, null, 2)}`);
  }
  if (!missingRuntime.nextSteps.join("\n").includes("llama-mtmd-cli")) {
    throw new Error(`Missing-runtime next steps did not mention llama-mtmd-cli: ${JSON.stringify(missingRuntime.nextSteps)}`);
  }
  const missingRuntimeState = await desktopState(cdp);
  if (missingRuntimeState.settings.stt.enabled) throw new Error("Missing-runtime setup unexpectedly enabled STT.");
  await assertProviderValidation(cdp, "needs-runtime", "provider list after missing runtime");

  await writeFakeRuntime(successRuntimePath, {
    version: "version: e2e-qwen3-asr-success",
    transcript: expectedTranscript,
  });
  const repaired = await setupProvider(cdp, {
    provider: "qwen3-asr",
    action: "repair",
    runtimeBinaryPath: successRuntimePath,
    validationAudioPath: audio.audioPath,
    spokenLanguage: "English",
    selectProvider: true,
    enable: true,
  });
  assertSetupStatus(repaired, "ready", "runtime repair");
  assertValidationStatus(repaired, "passed", "runtime repair");
  if (repaired.validation.validationTranscript !== expectedTranscript) {
    throw new Error(`Repair validation transcript mismatch: ${JSON.stringify(repaired.validation, null, 2)}`);
  }
  if (repaired.validation.binaryPath !== successRuntimePath) {
    throw new Error(`Repair did not bind the requested runtime binary: ${JSON.stringify(repaired.validation, null, 2)}`);
  }
  const repairedState = await desktopState(cdp);
  if (!repairedState.settings.stt.enabled) throw new Error("Runtime repair did not enable STT after a ready setup result.");
  await assertProviderValidation(cdp, "passed", "provider list after repair");

  await writeFakeRuntime(failingRuntimePath, {
    version: "version: e2e-qwen3-asr-missing-model",
    error: "model file missing: e2e Qwen3-ASR asset was not found",
  });
  const missingModel = await setupProvider(cdp, {
    provider: "qwen3-asr",
    action: "repair",
    runtimeBinaryPath: failingRuntimePath,
    validationAudioPath: audio.audioPath,
    spokenLanguage: "English",
    selectProvider: true,
    enable: true,
  });
  assertSetupStatus(missingModel, "validation-failed", "missing model validation");
  assertValidationStatus(missingModel, "failed", "missing model validation");
  if (!String(missingModel.validation.error ?? "").includes("model file missing")) {
    throw new Error(`Missing-model setup did not surface the runtime/model error: ${JSON.stringify(missingModel.validation, null, 2)}`);
  }
  const missingModelState = await desktopState(cdp);
  if (missingModelState.settings.stt.enabled) throw new Error("Validation-failed setup unexpectedly left STT enabled.");
  await assertProviderValidation(cdp, "failed", "provider list after missing model");

  const repairedAgain = await setupProvider(cdp, {
    provider: "qwen3-asr",
    action: "repair",
    runtimeBinaryPath: successRuntimePath,
    validationAudioPath: audio.audioPath,
    spokenLanguage: "English",
    selectProvider: true,
    enable: true,
  });
  assertSetupStatus(repairedAgain, "ready", "repair after missing model");
  assertValidationStatus(repairedAgain, "passed", "repair after missing model");
  const finalState = await desktopState(cdp);
  if (!finalState.settings.stt.enabled) throw new Error("Final repair did not re-enable STT.");
  await assertProviderValidation(cdp, "passed", "provider list after final repair");

  return {
    workspace,
    audioPath: audio.audioPath,
    providerCapabilityId: repairedAgain.selectedProvider?.capabilityId,
    missingRuntime: setupSummary(missingRuntime),
    repaired: setupSummary(repaired),
    missingModel: setupSummary(missingModel),
    repairedAgain: setupSummary(repairedAgain),
    finalSettings: finalState.settings.stt,
  };
}

async function setupProvider(cdp, input) {
  return evaluate(cdp, `window.ambientDesktop.setupSttProvider(${JSON.stringify(input)})`);
}

function assertSetupStatus(result, status, label) {
  if (result?.status !== status) {
    throw new Error(`${label} expected setup status ${status}, got ${result?.status}: ${JSON.stringify(result, null, 2)}`);
  }
}

function assertValidationStatus(result, status, label) {
  if (result?.validation?.status !== status) {
    throw new Error(`${label} expected validation status ${status}, got ${result?.validation?.status}: ${JSON.stringify(result?.validation, null, 2)}`);
  }
}

async function assertProviderValidation(cdp, status, label) {
  const providers = await evaluate(cdp, "window.ambientDesktop.listSttProviders()");
  const qwen = providers.find((provider) => provider.packageName === "ambient-qwen3-asr");
  if (!qwen) throw new Error(`${label}: Qwen3-ASR provider was not listed.`);
  if (qwen.validation?.status !== status) {
    throw new Error(`${label}: expected provider validation ${status}, got ${qwen.validation?.status}: ${JSON.stringify(qwen, null, 2)}`);
  }
}

function setupSummary(result) {
  return {
    status: result.status,
    validationStatus: result.validation?.status,
    validationError: result.validation?.error,
    validationTranscript: result.validation?.validationTranscript,
    binaryPath: result.validation?.binaryPath,
    runtimeVersion: result.validation?.runtimeVersion,
    runtimeCandidates: result.runtimeCandidates,
    runtimeInstall: result.runtimeInstall,
    selectedProviderAvailable: result.selectedProvider?.available,
    nextSteps: result.nextSteps,
  };
}

async function writeFakeRuntime(path, options) {
  await mkdir(dirname(path), { recursive: true });
  const body = options.error
    ? `#!/usr/bin/env node
if (process.argv.includes("--version")) {
  process.stdout.write(${JSON.stringify(`${options.version}\n`)});
  process.exit(0);
}
process.stderr.write(${JSON.stringify(`${options.error}\n`)});
process.exit(2);
`
    : `#!/usr/bin/env node
if (process.argv.includes("--version")) {
  process.stdout.write(${JSON.stringify(`${options.version}\n`)});
  process.exit(0);
}
process.stdout.write(${JSON.stringify(`language English <|asr_text|>${options.transcript}\n`)});
`;
  await writeFile(path, body, "utf8");
  await chmod(path, 0o755);
}

async function desktopState(cdp) {
  return evaluate(cdp, "window.ambientDesktop.bootstrap()");
}

async function waitForTarget(cdpPort) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const targets = await response.json();
      const target = targets.find((item) => item.webSocketDebuggerUrl && item.type === "page") ?? targets[0];
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // App not listening yet.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for Electron CDP target.");
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((innerResolve, innerReject) => {
            pending.set(id, { resolve: innerResolve, reject: innerReject });
            setTimeout(() => {
              if (!pending.has(id)) return;
              pending.delete(id);
              innerReject(new Error(`Timed out waiting for CDP ${method}.`));
            }, 20_000);
          });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message ?? "CDP error"));
      else entry.resolve(message.result);
    });
    socket.addEventListener("error", () => reject(new Error("CDP websocket failed.")));
  });
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed.");
  }
  return result.result?.value;
}

async function waitFor(cdp, predicate, label, maxMs = 10_000) {
  const expression = `(${predicate.toString()})()`;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function terminateProcessTree(proc) {
  children.delete(proc);
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = new Promise((resolve) => proc.once("exit", resolve));
  try {
    if (process.platform === "win32") proc.kill("SIGTERM");
    else process.kill(-proc.pid, "SIGTERM");
  } catch {
    proc.kill("SIGTERM");
  }
  await Promise.race([exited, delay(1_500)]);
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  try {
    if (process.platform === "win32") proc.kill("SIGKILL");
    else process.kill(-proc.pid, "SIGKILL");
  } catch {
    proc.kill("SIGKILL");
  }
  await Promise.race([exited, delay(500)]);
}

async function terminateDebugPortProcesses() {
  if (process.platform === "win32") return;
  const cwdPattern = process.cwd().replace(/[.[\]{}()*+?^$|\\]/g, "\\$&");
  await runIgnoringFailure("pkill", ["-f", `${cwdPattern}.*remote-debugging-port=${port}`]);
  await runIgnoringFailure("pkill", ["-f", `electron-vite dev -- --remote-debugging-port=${port}`]);
}

function runIgnoringFailure(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", resolve);
    child.on("close", resolve);
  });
}

function outputTail() {
  return `Electron output tail:\n${output.join("").split("\n").slice(-180).join("\n")}\n`;
}
