#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { snapshotHarnessWorkspace, writeHarnessTraceArtifacts } from "./harness-trace-artifacts.mjs";

const port = Number(process.env.AMBIENT_RLM_CDP_PORT ?? 9481);
const timeoutMs = Number(process.env.AMBIENT_RLM_TIMEOUT_MS ?? 300_000);
const workspace = await mkdtemp(join(tmpdir(), "ambient-rlm-workspace-"));
const userData = await mkdtemp(join(tmpdir(), "ambient-rlm-user-data-"));
const dossierPath = join(workspace, "dossier.md");
const finalToken = "RLM_E2E_DONE";
const expectedIncident = "HAWTHORN-DELTA-919";
const expectedReviewer = "Mira Patel";
const expectedRemedy = "quarantine the payroll export and rotate the vendor token";
const output = [];
const children = new Set();
let appInstance;
let beforeWorkspace;

try {
  await seedWorkspace(workspace);
  beforeWorkspace = await snapshotHarnessWorkspace(workspace);
  await seedUserDataCredentials(userData);

  appInstance = await launchApp();
  const summary = await runRlmSmoke(appInstance.cdp);
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
  await rm(workspace, { recursive: true, force: true });
  await rm(userData, { recursive: true, force: true });
}

console.log("Live Ambient Lambda-RLM E2E passed.");

async function seedWorkspace(root) {
  await writeFile(
    join(root, "README.md"),
    [
      "# Lambda-RLM live E2E workspace",
      "",
      "This workspace contains a long dossier used to validate automatic long-context tool routing.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(dossierPath, buildDossier(), "utf8");
}

function buildDossier() {
  const sections = [
    "# Operations Dossier",
    "",
    "This dossier intentionally contains many similar review entries. Answering accurately requires reading the complete file.",
    "",
  ];

  for (let i = 1; i <= 180; i += 1) {
    const padded = String(i).padStart(3, "0");
    const score = (i * 37) % 91;
    sections.push(
      `## Routine Review ${padded}`,
      `Project code: ROUTINE-${padded}`,
      `Reviewer: Reviewer ${((i * 11) % 47) + 1}`,
      `Risk score: ${score}`,
      `Remedy: keep monitoring batch ${((i * 7) % 29) + 1}.`,
      "Notes: The record repeats ordinary control language so keyword-only scans have many plausible distractions.",
      "Narrative: payroll, vendor, ledger, exception, quarantine, token, and export appear here as non-decisive background terms.",
      "",
    );
  }

  sections.splice(
    Math.floor(sections.length * 0.72),
    0,
    "## Exception Review: Cascade Ledger",
    `Incident identifier: ${expectedIncident}`,
    `Reviewer: ${expectedReviewer}`,
    `Remedy: ${expectedRemedy}.`,
    "Evidence: This exception is the only record where the remedy is approved by both finance operations and platform security.",
    "Disposition: Treat this exception review as the authoritative answer for incident, reviewer, and remedy.",
    "",
  );

  sections.push(
    "## Closing Notes",
    "Routine appendices continue after the exception so a head-only file read is insufficient.",
    "The exception review above is the only authoritative record for the requested incident details.",
    "",
  );
  return sections.join("\n");
}

async function seedUserDataCredentials(targetUserData) {
  if (process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY) return;
  const source = join(defaultAmbientUserDataPath(), "ambient-api-key.enc");
  if (!existsSync(source)) return;
  await mkdir(targetUserData, { recursive: true });
  await copyFile(source, join(targetUserData, "ambient-api-key.enc"));
}

function defaultAmbientUserDataPath() {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Ambient Desktop");
  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Ambient Desktop");
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "Ambient Desktop");
}

async function launchApp() {
  const child = spawn("pnpm", ["exec", "electron-vite", "dev", "--", `--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AMBIENT_DESKTOP_WORKSPACE: workspace,
      AMBIENT_E2E: "1",
      AMBIENT_E2E_USER_DATA: userData,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
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

async function runRlmSmoke(cdp) {
  const initialState = await desktopState(cdp);
  if (!initialState.provider.hasApiKey) {
    throw new Error(
      [
        "Ambient API key is missing.",
        "Save a key in the app, or launch this script with AMBIENT_API_KEY/AMBIENT_AGENT_AMBIENT_API_KEY.",
        "Keys can be created at https://app.ambient.xyz/keys.",
      ].join(" "),
    );
  }

  const keyCheck = await evaluate(cdp, "window.ambientDesktop.testAmbientApiKey()");
  if (!keyCheck?.ok) throw new Error(`Ambient API key check failed: ${keyCheck?.message ?? "unknown error"}`);

  const nextState = await evaluate(cdp, "window.ambientDesktop.createThread()");
  const threadId = nextState.activeThreadId;
  await installCollector(cdp);

  const prompt = [
    "You must call the long_context_process tool for this task.",
    "Call it with taskType qa, question set to the user question below, and workspacePaths containing dossier.md.",
    "Use the attached dossier as the source of truth and read it end-to-end through that tool.",
    "I need the incident identifier, reviewer, and remedy from the authoritative exception review.",
    `Reply with ${finalToken} followed by the identifier, reviewer, and remedy.`,
    "Do not modify files and do not use the network.",
  ].join("\n");

  await sendPrompt(cdp, {
    threadId,
    content: prompt,
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: process.env.AMBIENT_RLM_MODEL || process.env.AMBIENT_LIVE_MODEL || nextState.settings.model,
    thinkingLevel: "low",
    context: [{ path: "dossier.md" }],
  });

  await waitFor(cdp, () => Boolean(window.__ambientRlm?.sawRunStart), "Lambda-RLM run start", 45_000);
  await waitForCompletion(cdp, timeoutMs);

  const live = await getCollectorState(cdp);
  const finalState = await desktopState(cdp);
  const assistantText = finalState.messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .join("\n");
  const toolTranscript = finalState.messages
    .filter((message) => message.role === "tool")
    .map((message) => `${message.metadata?.toolName ?? ""}\n${message.content}`)
    .join("\n");
  const dossier = await readFile(dossierPath, "utf8");

  if (live.error) throw new Error(`Live Ambient Lambda-RLM run failed: ${live.error}`);
  if (!toolTranscript.includes("long_context_process")) {
    throw new Error(`Pi did not call long_context_process. Tool transcript:\n${toolTranscript.slice(-4000)}`);
  }
  if (!toolTranscript.includes("Lambda-RLM execution summary")) {
    throw new Error(`long_context_process result did not include the execution summary. Tool transcript:\n${toolTranscript.slice(-4000)}`);
  }
  for (const expected of [finalToken, expectedIncident, expectedReviewer, expectedRemedy]) {
    if (!assistantText.toLowerCase().includes(expected.toLowerCase())) {
      throw new Error(`Assistant response missed ${expected}. Assistant text:\n${assistantText.slice(-4000)}`);
    }
  }

  const summary = {
    workspace,
    threadId,
    model: process.env.AMBIENT_RLM_MODEL || process.env.AMBIENT_LIVE_MODEL || nextState.settings.model,
    dossierBytes: Buffer.byteLength(dossier, "utf8"),
    messageDeltaCount: live.messageDeltaCount,
    toolEventCount: live.toolEventCount,
    toolMessageCount: live.toolMessageCount,
    toolNames: [...new Set(live.toolNames)],
    statuses: live.statuses,
  };
  await writeHarnessTraceArtifacts({ workspace, beforeWorkspace, messages: finalState.messages, summary });
  return summary;
}

async function installCollector(cdp) {
  await evaluate(
    cdp,
    `
    (() => {
      window.__ambientRlm?.unsubscribe?.();
      window.__ambientRlm = {
        statuses: [],
        messageDeltaCount: 0,
        toolEventCount: 0,
        toolMessageCount: 0,
        toolNames: [],
        assistantTail: "",
        toolTail: "",
        sawRunStart: false,
        sawRunIdle: false,
        sendResolved: false,
        error: undefined,
      };
      window.__ambientRlm.unsubscribe = window.ambientDesktop.onEvent((event) => {
        if (event.type === "run-status") {
          window.__ambientRlm.statuses.push(event.status);
          if (event.status !== "idle") window.__ambientRlm.sawRunStart = true;
          if (window.__ambientRlm.sawRunStart && event.status === "idle") window.__ambientRlm.sawRunIdle = true;
        }
        if (event.type === "message-delta") {
          window.__ambientRlm.messageDeltaCount += 1;
          window.__ambientRlm.assistantTail = (window.__ambientRlm.assistantTail + String(event.delta ?? "")).slice(-4000);
        }
        if (event.type === "tool-event") window.__ambientRlm.toolEventCount += 1;
        if ((event.type === "message-created" || event.type === "message-updated") && event.message?.role === "tool") {
          if (event.type === "message-created") window.__ambientRlm.toolMessageCount += 1;
          const toolName = String(event.message.metadata?.toolName ?? "");
          if (toolName) window.__ambientRlm.toolNames.push(toolName);
          window.__ambientRlm.toolTail = (window.__ambientRlm.toolTail + "\\n---\\n" + String(event.message.content ?? "")).slice(-4000);
        }
        if (event.type === "error") window.__ambientRlm.error = event.message;
      });
      return true;
    })()
  `,
  );
}

async function sendPrompt(cdp, input) {
  await evaluate(
    cdp,
    `
    (() => {
      const input = ${JSON.stringify(input)};
      window.ambientDesktop.sendMessage(input)
        .then(() => {
          window.__ambientRlm.sendResolved = true;
        })
        .catch((error) => {
          window.__ambientRlm.error = error instanceof Error ? error.message : String(error);
        });
      return true;
    })()
  `,
  );
}

async function waitForCompletion(cdp, maxMs) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const live = await getCollectorState(cdp);
    if (live.error) throw new Error(live.error);
    if (live.sawRunIdle && live.sendResolved) return;
    await delay(1_000);
  }
  const live = await getCollectorState(cdp);
  throw new Error(
    [
      `Timed out after ${maxMs}ms waiting for Lambda-RLM live completion.`,
      `statuses=${JSON.stringify(live?.statuses ?? [])}`,
      `sendResolved=${Boolean(live?.sendResolved)} sawRunIdle=${Boolean(live?.sawRunIdle)}`,
      `assistantTail=${JSON.stringify(live?.assistantTail ?? "")}`,
      `toolTail=${JSON.stringify(live?.toolTail ?? "")}`,
    ].join("\n"),
  );
}

async function getCollectorState(cdp) {
  return evaluate(
    cdp,
    `
    (() => {
      const live = window.__ambientRlm;
      return live ? {
        statuses: live.statuses,
        messageDeltaCount: live.messageDeltaCount,
        toolEventCount: live.toolEventCount,
        toolMessageCount: live.toolMessageCount,
        toolNames: live.toolNames,
        assistantTail: live.assistantTail,
        toolTail: live.toolTail,
        sawRunStart: live.sawRunStart,
        sawRunIdle: live.sawRunIdle,
        sendResolved: live.sendResolved,
        error: live.error,
      } : undefined;
    })()
  `,
  );
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
            }, 15_000);
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
  return `Electron output tail:\n${output.join("").split("\n").slice(-120).join("\n")}\n`;
}
