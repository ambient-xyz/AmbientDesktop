#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.AMBIENT_CHAT_FIX_PERMISSION_CDP_PORT ?? 9487);
const timeoutMs = Number(process.env.AMBIENT_CHAT_FIX_PERMISSION_TIMEOUT_MS ?? 240_000);
const workspace = await mkdtemp(join(tmpdir(), "ambient-chat-fix-permission-workspace-"));
const outsideRoot = await mkdtemp(join(tmpdir(), "ambient-chat-fix-permission-outside-"));
const outsideFile = join(outsideRoot, "outside-permission-sentinel.txt");
const copiedFile = join(workspace, "permission-mode-outside-copy.txt");
const doneFile = join(workspace, "PERMISSION_MODE_LIVE_DONE.txt");
const sentinelBody = "PERMISSION_MODE_SENTINEL_OK";
const finalToken = "PERMISSION_MODE_LIVE_DONE";
const output = [];
const children = new Set();
let appInstance;
let passed = false;

try {
  await writeFile(
    join(workspace, "README.md"),
    [
      "# Chat Fix Permission Mode Live Workspace",
      "",
      "Temporary live Ambient/Pi validation workspace.",
      "The run starts in workspace mode, then the harness flips the thread to full access while the run is active.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(outsideFile, sentinelBody, "utf8");

  await terminateDebugPortProcesses();
  appInstance = await launchApp();
  const summary = await runPermissionModeSmoke(appInstance.cdp);
  console.log(JSON.stringify(summary, null, 2));
  passed = true;
} catch (error) {
  if (appInstance?.cdp) await writeFailureArtifact(appInstance.cdp, error).catch(() => undefined);
  console.error(outputTail());
  throw error;
} finally {
  if (appInstance) {
    appInstance.cdp.close();
    await terminateProcessTree(appInstance.child);
  }
  for (const child of children) await terminateProcessTree(child);
  await terminateDebugPortProcesses();
  if (passed && process.env.AMBIENT_CHAT_FIX_PERMISSION_KEEP_WORKSPACE !== "1") {
    await rm(workspace, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  } else {
    console.error(`Preserved chat-fix permission workspace: ${workspace}`);
    console.error(`Preserved chat-fix permission outside root: ${outsideRoot}`);
  }
}

console.log("Chat fix permission-mode live smoke passed.");

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

async function runPermissionModeSmoke(cdp) {
  const state = await desktopState(cdp);
  if (!state.provider.hasApiKey) {
    throw new Error("Ambient API key is missing. Set AMBIENT_API_KEY, AMBIENT_AGENT_AMBIENT_API_KEY, or AMBIENT_API_KEY_FILE.");
  }

  const keyCheck = await evaluate(cdp, "window.ambientDesktop.testAmbientApiKey()");
  if (!keyCheck?.ok) throw new Error(`Ambient API key check failed: ${keyCheck?.message ?? "unknown error"}`);

  await requestPermissionMode(cdp, state.activeThreadId, "workspace", "Live permission smoke starts in workspace scope.");
  const initialState = await desktopState(cdp);
  const initialThread = findThread(initialState, state.activeThreadId);
  if (initialThread.permissionMode !== "workspace") {
    throw new Error(`Expected workspace mode before live send, got ${initialThread.permissionMode}.`);
  }

  await installLiveEventCollector(cdp);
  const firstCommand = `node -e "setTimeout(()=>console.log('PERMISSION_TOGGLE_READY'),5000)"`;
  const copyCommand = `cat ${JSON.stringify(outsideFile)} > permission-mode-outside-copy.txt`;
  const doneCommand = `printf ${JSON.stringify(finalToken)} > PERMISSION_MODE_LIVE_DONE.txt`;
  const prompt = [
    "This is a live Ambient Desktop permission-mode reliability smoke test.",
    "Follow these steps in order and do not use the network:",
    `1. Call bash once with exactly this command and no extra shell operations: ${firstCommand}`,
    `2. After that command finishes, call bash with exactly this command and no extra shell operations: ${copyCommand}`,
    `3. Then call bash with exactly this command and no extra shell operations: ${doneCommand}`,
    `4. Finish by replying exactly ${finalToken}.`,
    "",
    "The second command intentionally reads a file outside the workspace. The Desktop harness will switch this thread to full access while your run is active, before that second command should execute.",
  ].join("\n");

  await sendLivePrompt(cdp, {
    threadId: state.activeThreadId,
    content: prompt,
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: process.env.AMBIENT_LIVE_MODEL || state.settings.model,
    thinkingLevel: "low",
  });

  await waitFor(cdp, () => Boolean(window.__ambientPermissionLive?.sawRunStart), "permission live run start", 45_000);
  const statusAtToggle = await getLiveState(cdp);
  if (statusAtToggle.currentStatus === "idle") throw new Error("Live run was not active when permission toggle was attempted.");

  await requestPermissionMode(cdp, state.activeThreadId, "full-access", "Live permission smoke toggled to full access during an active run.");
  await waitFor(cdp, () => window.ambientDesktop.bootstrap().then((next) => next.settings.permissionMode === "full-access"), "renderer full-access state", 15_000);

  await waitForFile(copiedFile, sentinelBody, timeoutMs);
  await waitForFile(doneFile, finalToken, timeoutMs);
  await waitForLiveCompletion(cdp, timeoutMs);

  const live = await getLiveState(cdp);
  const finalState = await desktopState(cdp);
  const finalThread = findThread(finalState, state.activeThreadId);
  const audit = await evaluate(cdp, "window.ambientDesktop.listPermissionAudit()");
  const threadAudit = audit.filter((entry) => entry.threadId === state.activeThreadId);
  const assistantText = finalState.messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .join("\n");
  const toolTranscript = finalState.messages
    .filter((message) => message.role === "tool")
    .map((message) => `${message.metadata?.toolName ?? ""}\n${message.content}`)
    .join("\n");

  if (live.error) throw new Error(`Permission live run failed: ${live.error}`);
  if (finalThread.permissionMode !== "full-access") {
    throw new Error(`Expected final thread permission mode full-access, got ${finalThread.permissionMode}.`);
  }
  if (!assistantText.includes(finalToken)) {
    throw new Error(`Permission live run did not finish with ${finalToken}. Assistant text: ${assistantText.slice(-1000)}`);
  }
  if (!toolTranscript.includes("bash")) {
    throw new Error(`Permission live run did not use bash. Tool transcript: ${toolTranscript.slice(-1000)}`);
  }
  const outsideDenials = threadAudit.filter(
    (entry) => entry.risk === "outside-workspace" && entry.decision === "denied",
  );
  if (outsideDenials.length > 0) {
    throw new Error(`Outside-workspace command was denied after full-access toggle: ${JSON.stringify(outsideDenials, null, 2)}`);
  }
  const modeChangeAudit = threadAudit.find(
    (entry) => entry.toolName === "thread-permission-mode" && entry.permissionMode === "full-access" && entry.decision === "allowed",
  );
  if (!modeChangeAudit) {
    throw new Error(`Permission mode change audit entry was not recorded. Thread audit: ${JSON.stringify(threadAudit, null, 2)}`);
  }

  return {
    workspace,
    outsideRoot,
    model: process.env.AMBIENT_LIVE_MODEL || state.settings.model,
    statusAtToggle: statusAtToggle.currentStatus,
    finalPermissionMode: finalThread.permissionMode,
    messageDeltaCount: live.messageDeltaCount,
    toolEventCount: live.toolEventCount,
    toolMessageCount: live.toolMessageCount,
    toolNameCounts: countValues(live.toolNames),
    permissionAuditCount: threadAudit.length,
    copiedFileBytes: (await readFile(copiedFile, "utf8")).length,
    statusCounts: countValues(live.statuses),
    statusTail: live.statuses.slice(-20),
  };
}

function findThread(state, threadId) {
  const thread = state.threads.find((candidate) => candidate.id === threadId);
  if (!thread) throw new Error(`Thread ${threadId} was not found in Desktop state.`);
  return thread;
}

async function requestPermissionMode(cdp, threadId, permissionMode, reason) {
  return evaluate(
    cdp,
    `window.ambientDesktop.requestThreadPermissionModeChange(${JSON.stringify({ threadId, permissionMode, reason })})`,
  );
}

async function installLiveEventCollector(cdp) {
  await evaluate(
    cdp,
    `
    (() => {
      window.__ambientPermissionLive?.unsubscribe?.();
      window.__ambientPermissionLive = {
        statuses: [],
        currentStatus: undefined,
        messageDeltaCount: 0,
        toolEventCount: 0,
        toolMessageCount: 0,
        sawRunStart: false,
        sendResolved: false,
        error: undefined,
        toolNames: [],
      };
      window.__ambientPermissionLive.unsubscribe = window.ambientDesktop.onEvent((event) => {
        if (event.type === "run-status") {
          window.__ambientPermissionLive.statuses.push(event.status);
          window.__ambientPermissionLive.currentStatus = event.status;
          if (event.status !== "idle") window.__ambientPermissionLive.sawRunStart = true;
        }
        if (event.type === "message-delta") window.__ambientPermissionLive.messageDeltaCount += 1;
        if (event.type === "tool-event") window.__ambientPermissionLive.toolEventCount += 1;
        if ((event.type === "message-created" || event.type === "message-updated") && event.message?.role === "tool") {
          if (event.type === "message-created") window.__ambientPermissionLive.toolMessageCount += 1;
          const toolName = String(event.message.metadata?.toolName ?? "");
          if (toolName) window.__ambientPermissionLive.toolNames.push(toolName);
        }
        if (event.type === "error") window.__ambientPermissionLive.error = event.message;
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
          window.__ambientPermissionLive.sendResolved = true;
        })
        .catch((error) => {
          window.__ambientPermissionLive.error = error instanceof Error ? error.message : String(error);
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
  throw new Error(`Timed out after ${maxMs}ms waiting for the permission live run to complete.`);
}

async function hasStableTerminalIdle(cdp, live) {
  if (live?.currentStatus !== "idle" || !live.sendResolved) return false;
  await delay(1_000);
  const nextLive = await getLiveState(cdp);
  return nextLive?.currentStatus === "idle" && nextLive.sendResolved;
}

async function getLiveState(cdp) {
  return evaluate(
    cdp,
    `
    (() => {
      const live = window.__ambientPermissionLive;
      return live ? {
        statuses: live.statuses,
        currentStatus: live.currentStatus,
        messageDeltaCount: live.messageDeltaCount,
        toolEventCount: live.toolEventCount,
        toolMessageCount: live.toolMessageCount,
        toolNames: live.toolNames,
        sawRunStart: live.sawRunStart,
        sendResolved: live.sendResolved,
        error: live.error,
      } : undefined;
    })()
  `,
  );
}

async function waitForFile(path, expectedBody, maxMs) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      const body = (await readFile(path, "utf8")).trim();
      if (body === expectedBody) return;
      throw new Error(`File ${path} had unexpected content: ${JSON.stringify(body)}`);
    }
    await delay(1_000);
  }
  throw new Error(`Timed out after ${maxMs}ms waiting for ${path}.`);
}

async function desktopState(cdp) {
  return evaluate(cdp, "window.ambientDesktop.bootstrap()");
}

async function writeFailureArtifact(cdp, error) {
  const state = await desktopState(cdp).catch(() => undefined);
  const live = await getLiveState(cdp).catch(() => undefined);
  const audit = await evaluate(cdp, "window.ambientDesktop.listPermissionAudit()").catch(() => undefined);
  const artifact = {
    failedAt: new Date().toISOString(),
    workspace,
    outsideRoot,
    copiedFileExists: existsSync(copiedFile),
    doneFileExists: existsSync(doneFile),
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) },
    live: live
      ? {
          currentStatus: live.currentStatus,
          messageDeltaCount: live.messageDeltaCount,
          toolEventCount: live.toolEventCount,
          toolMessageCount: live.toolMessageCount,
          toolNameCounts: countValues(live.toolNames),
          sawRunStart: live.sawRunStart,
          sendResolved: live.sendResolved,
          error: live.error,
          statusCounts: countValues(live.statuses),
          statusTail: live.statuses.slice(-30),
        }
      : undefined,
    audit,
    messages: state?.messages?.map((message) => ({
      id: message.id,
      role: message.role,
      content: String(message.content ?? "").slice(0, 4000),
      status: message.metadata?.status,
      toolName: message.metadata?.toolName,
    })),
  };
  const artifactPath = join(workspace, "chat-fix-permission-live-failure.json");
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
  console.error(`Wrote chat-fix permission failure artifact: ${artifactPath}`);
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

function countValues(values) {
  const counts = {};
  for (const value of values ?? []) {
    const key = String(value || "unknown");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function outputTail() {
  return `Electron output tail:\n${output.join("").split("\n").slice(-120).join("\n")}\n`;
}
