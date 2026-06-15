#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.AMBIENT_CHAT_FIX_DOGFOOD_CDP_PORT ?? 9486);
const timeoutMs = Number(process.env.AMBIENT_CHAT_FIX_DOGFOOD_TIMEOUT_MS ?? 420_000);
const workspace = await mkdtemp(join(tmpdir(), "ambient-chat-fix-opencut-"));
const doneToken = "CHAT_FIX_OPENCUT_DOGFOOD_DONE";
const doneFile = join(workspace, "CHAT_FIX_OPENCUT_DOGFOOD_DONE.txt");
const appDir = join(workspace, "opencut-classic");
const requiredAppMarkers = [
  "OpenCut Classic",
  "preview monitor",
  "media bin",
  "timeline",
  "clip inspector",
  "transport controls",
  "export button",
  "Sample Clip 1",
  "Sample Clip 2",
  "Sample Clip 3",
];
const smokeCheckCommand = `node -e "const fs=require('fs');const html=fs.readFileSync('opencut-classic/index.html','utf8').toLowerCase();for (const marker of ${JSON.stringify(requiredAppMarkers.map((marker) => marker.toLowerCase()))}){if(!html.includes(marker))throw new Error('missing '+marker)}console.log('smoke ok')"`;
const output = [];
const children = new Set();
let appInstance;
let passed = false;

try {
  await writeFile(
    join(workspace, "README.md"),
    [
      "# Chat Fix OpenCut Dogfood Workspace",
      "",
      "Temporary live Ambient/Pi validation workspace.",
      "The agent should create an OpenCut-style local prototype, run the provided smoke check, and write the done file.",
      "",
    ].join("\n"),
    "utf8",
  );

  await terminateDebugPortProcesses();
  appInstance = await launchApp();
  const summary = await runDogfood(appInstance.cdp);
  console.log(JSON.stringify(summary, null, 2));
  passed = true;
} catch (error) {
  if (appInstance?.cdp) await writeFailureArtifacts(appInstance.cdp, error).catch(() => undefined);
  console.error(outputTail());
  throw error;
} finally {
  if (appInstance) {
    appInstance.cdp.close();
    await terminateProcessTree(appInstance.child);
  }
  for (const child of children) await terminateProcessTree(child);
  await terminateDebugPortProcesses();
  if (passed && process.env.AMBIENT_CHAT_FIX_DOGFOOD_KEEP_WORKSPACE !== "1") {
    await rm(workspace, { recursive: true, force: true });
  } else {
    console.error(`Preserved chat-fix dogfood workspace: ${workspace}`);
  }
}

console.log("Chat fix OpenCut-style live dogfood passed.");

async function launchApp() {
  const child = spawn(
    "pnpm",
    ["exec", "electron-vite", "dev", "--", `--remote-debugging-port=${port}`],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AMBIENT_PROVIDER: process.env.AMBIENT_PROVIDER ?? "ambient",
        AMBIENT_DESKTOP_WORKSPACE: workspace,
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

async function runDogfood(cdp) {
  const state = await desktopState(cdp);
  if (!state.provider.hasApiKey) {
    throw new Error("Ambient API key is missing. Set AMBIENT_API_KEY, AMBIENT_AGENT_AMBIENT_API_KEY, or AMBIENT_API_KEY_FILE.");
  }

  const keyCheck = await evaluate(cdp, "window.ambientDesktop.testAmbientApiKey()");
  if (!keyCheck?.ok) throw new Error(`Ambient API key check failed: ${keyCheck?.message ?? "unknown error"}`);

  await installLiveEventCollector(cdp);
  const prompt = [
    "This is a live Ambient Desktop chat reliability dogfood run.",
    "Build a self-contained OpenCut Classic style local prototype in a folder named opencut-classic.",
    "",
    "Requirements:",
    "- Do not use the network and do not install dependencies.",
    "- Create exactly this app file: opencut-classic/index.html.",
    `- The app file must contain these exact visible markers: ${requiredAppMarkers.join(", ")}.`,
    "- Do not invent additional smoke-test requirements or require specific data attributes.",
    "- Run this exact shell smoke check from the workspace root before writing the done file:",
    smokeCheckCommand,
    "- If the smoke check fails, fix opencut-classic/index.html and rerun the same command.",
    `- Only after the smoke test passes, write a workspace-root file named CHAT_FIX_OPENCUT_DOGFOOD_DONE.txt containing exactly ${doneToken}.`,
    `- Finish by replying exactly ${doneToken}.`,
    "",
    "This is intentionally a local build/debug task. Use workspace tools normally; do not ask for confirmation.",
  ].join("\n");

  await sendLivePrompt(cdp, {
    threadId: state.activeThreadId,
    content: prompt,
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: process.env.AMBIENT_LIVE_MODEL || state.settings.model,
    thinkingLevel: "medium",
  });

  await waitFor(cdp, () => Boolean(window.__ambientDogfood?.sawRunStart), "dogfood run start", 60_000);
  await waitForDogfoodDone(cdp, timeoutMs);
  await waitForLiveCompletion(cdp, timeoutMs);

  const live = await getLiveState(cdp);
  const nextState = await desktopState(cdp);
  const assistantText = nextState.messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .join("\n");
  const toolTranscript = nextState.messages
    .filter((message) => message.role === "tool")
    .map((message) => `${message.metadata?.toolName ?? ""}\n${message.content}`)
    .join("\n");

  if (live.error) throw new Error(`Dogfood run failed: ${live.error}`);
  if (!assistantText.includes(doneToken)) {
    throw new Error(`Dogfood assistant did not finish with ${doneToken}. Assistant text: ${assistantText.slice(-1000)}`);
  }
  if (!toolTranscript.includes("bash")) {
    throw new Error(`Dogfood did not use bash/shell verification. Tool transcript: ${toolTranscript.slice(-1000)}`);
  }
  const appFile = await findRequiredAppFile();
  const appText = await readFile(appFile, "utf8");
  for (const required of requiredAppMarkers) {
    if (!appText.toLowerCase().includes(required.toLowerCase())) {
      throw new Error(`Dogfood app file ${appFile} is missing required marker ${required}.`);
    }
  }

  return {
    workspace,
    model: process.env.AMBIENT_LIVE_MODEL || state.settings.model,
    messageDeltaCount: live.messageDeltaCount,
    toolEventCount: live.toolEventCount,
    toolMessageCount: live.toolMessageCount,
    toolNameCounts: countValues(live.toolNames),
    appFile,
    appFileBytes: appText.length,
    requiredAppMarkers,
    statusCounts: countValues(live.statuses),
    statusTail: live.statuses.slice(-20),
  };
}

async function findRequiredAppFile() {
  const candidates = [
    join(appDir, "index.html"),
    join(appDir, "src", "App.tsx"),
    join(appDir, "src", "App.jsx"),
    join(appDir, "src", "main.tsx"),
    join(appDir, "src", "main.jsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Dogfood did not create a recognizable app file under ${appDir}.`);
}

async function installLiveEventCollector(cdp) {
  await evaluate(
    cdp,
    `
    (() => {
      window.__ambientDogfood?.unsubscribe?.();
      window.__ambientDogfood = {
        statuses: [],
        currentStatus: undefined,
        messageDeltaCount: 0,
        toolEventCount: 0,
        toolMessageCount: 0,
        sawRunStart: false,
        sawRunIdle: false,
        sendResolved: false,
        error: undefined,
        toolNames: [],
      };
      window.__ambientDogfood.unsubscribe = window.ambientDesktop.onEvent((event) => {
        if (event.type === "run-status") {
          window.__ambientDogfood.statuses.push(event.status);
          window.__ambientDogfood.currentStatus = event.status;
          if (event.status !== "idle") window.__ambientDogfood.sawRunStart = true;
          if (window.__ambientDogfood.sawRunStart && event.status === "idle") window.__ambientDogfood.sawRunIdle = true;
        }
        if (event.type === "message-delta") window.__ambientDogfood.messageDeltaCount += 1;
        if (event.type === "tool-event") window.__ambientDogfood.toolEventCount += 1;
        if ((event.type === "message-created" || event.type === "message-updated") && event.message?.role === "tool") {
          if (event.type === "message-created") window.__ambientDogfood.toolMessageCount += 1;
          const toolName = String(event.message.metadata?.toolName ?? "");
          if (toolName) window.__ambientDogfood.toolNames.push(toolName);
        }
        if (event.type === "error") window.__ambientDogfood.error = event.message;
      });
      return true;
    })()
  `,
  );
}

async function sendLivePrompt(cdp, input) {
  await evaluate(
    cdp,
    `
    (() => {
      const input = ${JSON.stringify(input)};
      window.ambientDesktop.sendMessage(input)
        .then(() => {
          window.__ambientDogfood.sendResolved = true;
        })
        .catch((error) => {
          window.__ambientDogfood.error = error instanceof Error ? error.message : String(error);
        });
      return true;
    })()
  `,
  );
}

async function waitForLiveCompletion(cdp, maxMs) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const live = await getLiveState(cdp);
    if (live.error) throw new Error(live.error);
    if (await hasStableTerminalIdle(cdp, live)) return;
    await delay(1_000);
  }
  throw new Error(`Timed out after ${maxMs}ms waiting for the dogfood run to complete.`);
}

async function getLiveState(cdp) {
  return evaluate(
    cdp,
    `
    (() => {
      const live = window.__ambientDogfood;
      return live ? {
        statuses: live.statuses,
        messageDeltaCount: live.messageDeltaCount,
        toolEventCount: live.toolEventCount,
        toolMessageCount: live.toolMessageCount,
        toolNames: live.toolNames,
        currentStatus: live.currentStatus,
        sawRunStart: live.sawRunStart,
        sawRunIdle: live.sawRunIdle,
        sendResolved: live.sendResolved,
        error: live.error,
      } : undefined;
    })()
  `,
  );
}

async function waitForDogfoodDone(cdp, maxMs) {
  const deadline = Date.now() + maxMs;
  let lastLogAt = 0;
  while (Date.now() < deadline) {
    const live = await getLiveState(cdp);
    const now = Date.now();
    if (now - lastLogAt >= 30_000) {
      lastLogAt = now;
      console.log(
        `[dogfood] waiting: statuses=${live?.statuses?.slice(-6).join(",") ?? "none"} ` +
          `sendResolved=${Boolean(live?.sendResolved)} idle=${Boolean(live?.sawRunIdle)} ` +
          `deltas=${live?.messageDeltaCount ?? 0} tools=${live?.toolEventCount ?? 0}/${live?.toolMessageCount ?? 0} ` +
          `doneFile=${existsSync(doneFile)}`,
      );
    }
    if (live?.error) throw new Error(`Dogfood run failed before sentinel file: ${live.error}`);
    if (existsSync(doneFile)) {
      const body = (await readFile(doneFile, "utf8")).trim();
      if (body === doneToken) return;
      throw new Error(`Dogfood done file had unexpected content: ${JSON.stringify(body)}`);
    }
    if (await hasStableTerminalIdle(cdp, live)) {
      const state = await desktopState(cdp);
      const assistantText = state.messages
        .filter((message) => message.role === "assistant")
        .map((message) => message.content)
        .join("\n");
      throw new Error(
        `Dogfood run finished without ${doneToken}. Assistant tail: ${assistantText.slice(-1500)}`,
      );
    }
    await delay(1_000);
  }
  throw new Error(`Timed out after ${maxMs}ms waiting for ${doneFile}.`);
}

async function hasStableTerminalIdle(cdp, live) {
  if (live?.currentStatus !== "idle" || !live.sendResolved) return false;
  await delay(1_500);
  const nextLive = await getLiveState(cdp);
  return nextLive?.currentStatus === "idle" && nextLive.sendResolved;
}

async function desktopState(cdp) {
  return evaluate(cdp, "window.ambientDesktop.bootstrap()");
}

async function writeFailureArtifacts(cdp, error) {
  const state = await desktopState(cdp).catch(() => undefined);
  const live = await getLiveState(cdp).catch(() => undefined);
  const artifact = {
    failedAt: new Date().toISOString(),
    workspace,
    doneFile,
    doneFileExists: existsSync(doneFile),
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) },
    live: summarizeLiveState(live),
    messages: state?.messages?.map((message) => ({
      id: message.id,
      role: message.role,
      content: String(message.content ?? "").slice(0, 4000),
      status: message.metadata?.status,
      toolName: message.metadata?.toolName,
    })),
  };
  const artifactPath = join(workspace, "chat-fix-dogfood-failure.json");
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
  console.error(`Wrote chat-fix dogfood failure artifact: ${artifactPath}`);
}

function summarizeLiveState(live) {
  if (!live) return undefined;
  return {
    currentStatus: live.currentStatus,
    messageDeltaCount: live.messageDeltaCount,
    toolEventCount: live.toolEventCount,
    toolMessageCount: live.toolMessageCount,
    toolNameCounts: countValues(live.toolNames),
    sawRunStart: live.sawRunStart,
    sawRunIdle: live.sawRunIdle,
    sendResolved: live.sendResolved,
    error: live.error,
    statusCounts: countValues(live.statuses),
    statusTail: live.statuses.slice(-30),
  };
}

function countValues(values) {
  const counts = {};
  for (const value of values ?? []) {
    const key = String(value || "unknown");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function waitForTarget(cdpPort) {
  const deadline = Date.now() + 30_000;
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
