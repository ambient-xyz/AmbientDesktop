#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshotHarnessWorkspace, writeHarnessTraceArtifacts } from "./harness-trace-artifacts.mjs";

const port = Number(process.env.AMBIENT_LIVE_CDP_PORT ?? 9476);
const timeoutMs = Number(process.env.AMBIENT_LIVE_TIMEOUT_MS ?? 300_000);
const workspace = await mkdtemp(join(tmpdir(), "ambient-live-workspace-"));
const expectedFilePath = join(workspace, "ambient-live-smoke.txt");
const expectedFileBody = "AMBIENT_LIVE_SMOKE_OK";
const finalToken = "LIVE_SMOKE_DONE";
const pluginFinalToken = "PLUGIN_SMOKE_DONE";
const compactionFinalToken = "COMPACTION_SMOKE_DONE";
const postToolContinuationFinalToken = "POST_TOOL_CONTINUATION_LIVE_DONE";
const postToolContinuationFilePath = join(workspace, "post-tool-continuation.txt");
const postToolContinuationFileBody = "POST_TOOL_CONTINUATION_FILE_OK";
const output = [];
const children = new Set();
let appInstance;
let beforeWorkspace;

try {
  await writeFile(
    join(workspace, "README.md"),
    [
      "# Ambient live smoke workspace",
      "",
      "This temporary workspace is used to validate the real Ambient/Pi app loop.",
      "",
    ].join("\n"),
    "utf8",
  );
  await seedPluginFixture(workspace);
  beforeWorkspace = await snapshotHarnessWorkspace(workspace);

  appInstance = await launchApp();
  const summary = await runLiveSmoke(appInstance.cdp);
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
}

console.log("Live Ambient E2E smoke passed.");

async function launchApp() {
  const child = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "electron-vite", "dev", "--", `--remote-debugging-port=${port}`],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AMBIENT_E2E: process.env.AMBIENT_E2E ?? "1",
        ...(usesPostToolContinuationSmoke()
          ? {
              AMBIENT_POST_TOOL_CONTINUATION_IDLE_MS: process.env.AMBIENT_POST_TOOL_CONTINUATION_IDLE_MS ?? "250",
              AMBIENT_POST_TOOL_FINALIZATION_TICK_MS: process.env.AMBIENT_POST_TOOL_FINALIZATION_TICK_MS ?? "50",
            }
          : {}),
        AMBIENT_DESKTOP_WORKSPACE: workspace,
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
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

function usesPostToolContinuationSmoke() {
  return process.env.AMBIENT_LIVE_POST_TOOL_CONTINUATION === "1" || process.env.AMBIENT_LIVE_ONLY_POST_TOOL_CONTINUATION === "1";
}

async function runLiveSmoke(cdp) {
  const state = await desktopState(cdp);
  if (!state.provider.hasApiKey) {
    throw new Error(
      [
        "Ambient API key is missing.",
        "Save a key in the app, or launch this script with AMBIENT_API_KEY/AMBIENT_AGENT_AMBIENT_API_KEY.",
        "Keys can be created at https://app.ambient.xyz/keys.",
      ].join(" "),
    );
  }

  const keyCheck = await evaluate(cdp, "window.ambientDesktop.testAmbientApiKey()");
  if (!keyCheck?.ok) {
    throw new Error(`Ambient API key check failed: ${keyCheck?.message ?? "unknown error"}`);
  }
  await evaluate(
    cdp,
    `window.ambientDesktop.setCodexPluginTrusted({ pluginId: ".agents/plugins/marketplace.json:ambient-fixture", trusted: true })`,
  );

  if (process.env.AMBIENT_LIVE_ONLY_POST_TOOL_CONTINUATION === "1") {
    const postToolContinuationSummary = await runPostToolContinuationSmoke(cdp, state);
    const finalState = await desktopState(cdp);
    const summary = {
      workspace,
      model: process.env.AMBIENT_LIVE_MODEL || state.settings.model,
      postToolContinuation: postToolContinuationSummary,
      statuses: postToolContinuationSummary.statusTail,
    };
    await writeHarnessTraceArtifacts({ workspace, beforeWorkspace, messages: finalState.messages, summary });
    return summary;
  }

  await installLiveEventCollector(cdp);
  const prompt = [
    "This is a live product smoke test for Ambient Desktop.",
    `Use the available workspace tools to create a file named ambient-live-smoke.txt in the current workspace.`,
    `The file must contain exactly this text, with no extra prose: ${expectedFileBody}`,
    `After the tool succeeds, reply with exactly: ${finalToken}`,
    "Do not use the network. Do not ask for confirmation.",
  ].join("\n");

  await sendLivePrompt(cdp, {
    threadId: state.activeThreadId,
    content: prompt,
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: process.env.AMBIENT_LIVE_MODEL || state.settings.model,
    thinkingLevel: "low",
  });

  await waitFor(cdp, () => Boolean(window.__ambientLive?.sawRunStart), "live run start", 45_000);
  await waitForFile(expectedFilePath, expectedFileBody, timeoutMs);
  await waitForLiveCompletion(cdp, timeoutMs);
  const generatedThreadTitle = await waitForGeneratedThreadTitle(cdp, state.activeThreadId, 45_000);

  const live = await getLiveState(cdp);
  const nextState = await desktopState(cdp);
  const assistantText = nextState.messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .join("\n");

  if (live.error) throw new Error(`Live Ambient run failed: ${live.error}`);
  if (live.messageDeltaCount < 1) throw new Error("Live Ambient run did not emit streamed message deltas.");
  if (live.toolEventCount < 1 && live.toolMessageCount < 1) {
    throw new Error("Live Ambient run did not emit any tool events or tool transcript messages.");
  }
  if (!assistantText.includes(finalToken)) {
    throw new Error(`Live Ambient run did not finish with ${finalToken}. Assistant text: ${assistantText.slice(-1000)}`);
  }

  const postToolContinuationSummary = process.env.AMBIENT_LIVE_POST_TOOL_CONTINUATION === "1"
    ? await runPostToolContinuationSmoke(cdp, state)
    : undefined;
  const pluginSummary = await runPluginToolSmoke(cdp, state);
  const compactionSummary = process.env.AMBIENT_LIVE_COMPACTION === "1" ? await runCompactionSmoke(cdp, state) : undefined;

  const summary = {
    workspace,
    model: process.env.AMBIENT_LIVE_MODEL || state.settings.model,
    messageDeltaCount: live.messageDeltaCount,
    toolEventCount: live.toolEventCount,
    toolMessageCount: live.toolMessageCount,
    generatedThreadTitle,
    pluginToolEventCount: pluginSummary.toolEventCount,
    pluginToolMessageCount: pluginSummary.toolMessageCount,
    pluginToolNames: pluginSummary.toolNames,
    postToolContinuation: postToolContinuationSummary,
    compaction: compactionSummary,
    statuses: live.statuses,
    expectedFileBytes: (await readFile(expectedFilePath, "utf8")).length,
  };
  const finalState = await desktopState(cdp);
  await writeHarnessTraceArtifacts({ workspace, beforeWorkspace, messages: finalState.messages, summary });
  return summary;
}

async function runPostToolContinuationSmoke(cdp, state) {
  await installLiveEventCollector(cdp);
  const prompt = [
    "This is a live Ambient Desktop post-tool continuation smoke test.",
    "Follow these instructions exactly:",
    `1. Call bash exactly once with this command and no extra shell operations: printf ${JSON.stringify(postToolContinuationFileBody)} > post-tool-continuation.txt`,
    "2. After the bash tool result returns, intentionally do not write assistant-visible text yet.",
    "3. Wait for Ambient to send an internal continuation instruction about the latest completed tool result.",
    `4. After that continuation instruction arrives, reply exactly: ${postToolContinuationFinalToken}`,
    "Do not call another tool after the bash call. Do not use the network. Do not ask for confirmation.",
  ].join("\n");

  await sendLivePrompt(cdp, {
    threadId: state.activeThreadId,
    content: prompt,
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: process.env.AMBIENT_LIVE_MODEL || state.settings.model,
    thinkingLevel: "low",
  });

  await waitFor(cdp, () => Boolean(window.__ambientLive?.sawRunStart), "post-tool continuation live run start", 45_000);
  await waitForFile(postToolContinuationFilePath, postToolContinuationFileBody, timeoutMs);
  await waitFor(
    cdp,
    () => Boolean(window.__ambientLive?.runtimeActivities?.some((activity) =>
      String(activity?.message ?? "").includes("Ambient is asking Pi to continue from the completed tool result")
    )),
    "post-tool continuation runtime activity",
    Number(process.env.AMBIENT_LIVE_POST_TOOL_CONTINUATION_TIMEOUT_MS ?? 120_000),
  );
  await waitForLiveCompletion(cdp, timeoutMs);

  const live = await getLiveState(cdp);
  const nextState = await desktopState(cdp);
  const assistantText = nextState.messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .join("\n");
  const transcript = nextState.messages.map((message) => message.content).join("\n");
  const toolTranscript = nextState.messages
    .filter((message) => message.role === "tool")
    .map((message) => `${message.metadata?.toolName ?? ""}\n${message.content}`)
    .join("\n");
  const continuationActivities = live.runtimeActivities.filter((activity) =>
    String(activity?.message ?? "").includes("Ambient is asking Pi to continue from the completed tool result")
  );

  if (live.error) throw new Error(`Live Ambient post-tool continuation run failed: ${live.error}`);
  if (!toolTranscript.includes("bash")) {
    throw new Error(`Post-tool continuation run did not use bash. Tool transcript: ${toolTranscript.slice(-1000)}`);
  }
  if (!assistantText.includes(postToolContinuationFinalToken)) {
    throw new Error(`Post-tool continuation run did not finish with ${postToolContinuationFinalToken}. Assistant text: ${assistantText.slice(-1000)}`);
  }
  if (transcript.includes("Most recent tool: bash")) {
    throw new Error("Post-tool continuation transcript included stale wording: Most recent tool: bash");
  }
  if (continuationActivities.length < 1) {
    throw new Error(`Post-tool continuation runtime activity was not observed. Runtime activities: ${JSON.stringify(live.runtimeActivities.slice(-20), null, 2)}`);
  }

  return {
    messageDeltaCount: live.messageDeltaCount,
    toolEventCount: live.toolEventCount,
    toolMessageCount: live.toolMessageCount,
    toolNames: live.toolNames,
    continuationActivityCount: continuationActivities.length,
    statusTail: live.statuses.slice(-20),
    fileBytes: (await readFile(postToolContinuationFilePath, "utf8")).length,
  };
}

async function runPluginToolSmoke(cdp, state) {
  await installLiveEventCollector(cdp);
  const prompt = [
    "This is the plugin live smoke test for Ambient Desktop.",
    "Call the exact Codex plugin tool named ambient_fixture_workspace_summary with includeFiles set to true.",
    `After the plugin tool returns, reply with exactly: ${pluginFinalToken}`,
    "Do not use bash for this plugin check. Do not ask for confirmation.",
  ].join("\n");

  await sendLivePrompt(cdp, {
    threadId: state.activeThreadId,
    content: prompt,
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: process.env.AMBIENT_LIVE_MODEL || state.settings.model,
    thinkingLevel: "low",
  });

  await waitFor(cdp, () => Boolean(window.__ambientLive?.sawRunStart), "plugin live run start", 45_000);
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

  if (live.error) throw new Error(`Live Ambient plugin run failed: ${live.error}`);
  if (!toolTranscript.includes("ambient_fixture_workspace_summary")) {
    throw new Error(`Plugin run did not call ambient_fixture_workspace_summary. Tool transcript: ${toolTranscript.slice(-1000)}`);
  }
  if (!toolTranscript.includes("Ambient fixture MCP summary")) {
    throw new Error(`Plugin run did not show fixture MCP result text. Tool transcript: ${toolTranscript.slice(-1000)}`);
  }
  if (!assistantText.includes(pluginFinalToken)) {
    throw new Error(`Live Ambient plugin run did not finish with ${pluginFinalToken}. Assistant text: ${assistantText.slice(-1000)}`);
  }

  return {
    toolEventCount: live.toolEventCount,
    toolMessageCount: live.toolMessageCount,
    toolNames: live.toolNames,
  };
}

async function runCompactionSmoke(cdp, state) {
  await installLiveEventCollector(cdp);
  const before = await evaluate(cdp, `window.ambientDesktop.getContextUsage(${JSON.stringify(state.activeThreadId)})`);
  const compacted = await evaluate(
    cdp,
    `
    window.ambientDesktop.compactThread(${JSON.stringify({
      threadId: state.activeThreadId,
      customInstructions: "Preserve the ambient-live-smoke.txt file state, plugin smoke result, and next verification step.",
    })})
  `,
  );
  const compactionEvents = await getLiveState(cdp);

  await installLiveEventCollector(cdp);
  const prompt = [
    "This is the post-compaction continuation smoke test.",
    "Use workspace tools to inspect ambient-live-smoke.txt and confirm it still contains the expected live smoke text.",
    `When verified, reply with exactly: ${compactionFinalToken}`,
    "Do not use the network. Do not ask for confirmation.",
  ].join("\n");

  await sendLivePrompt(cdp, {
    threadId: state.activeThreadId,
    content: prompt,
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: process.env.AMBIENT_LIVE_MODEL || state.settings.model,
    thinkingLevel: "low",
  });

  await waitFor(cdp, () => Boolean(window.__ambientLive?.sawRunStart), "post-compaction live run start", 45_000);
  await waitForLiveCompletion(cdp, timeoutMs);

  const live = await getLiveState(cdp);
  const nextState = await desktopState(cdp);
  const assistantText = nextState.messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .join("\n");

  if (live.error) throw new Error(`Live Ambient post-compaction run failed: ${live.error}`);
  if (!assistantText.includes(compactionFinalToken)) {
    throw new Error(`Post-compaction run did not finish with ${compactionFinalToken}. Assistant text: ${assistantText.slice(-1000)}`);
  }

  return {
    beforeSource: before?.source,
    beforeTokens: before?.tokens,
    compactedSource: compacted?.source,
    compactedCompactionCount: compacted?.compactionCount,
    compactionActivityCount: compactionEvents.compactionActivities.length,
    contextSnapshotCount: compactionEvents.contextSnapshots.length + live.contextSnapshots.length,
    continuationToolEventCount: live.toolEventCount,
    continuationToolMessageCount: live.toolMessageCount,
    statuses: live.statuses,
  };
}

async function installLiveEventCollector(cdp) {
  await evaluate(
    cdp,
    `
    (() => {
      window.__ambientLive?.unsubscribe?.();
      window.__ambientLive = {
        statuses: [],
        messageDeltaCount: 0,
        toolEventCount: 0,
        toolMessageCount: 0,
        sawRunStart: false,
        sawRunIdle: false,
        sendResolved: false,
        error: undefined,
        toolNames: [],
        toolMessages: [],
        contextSnapshots: [],
        compactionActivities: [],
        runtimeActivities: [],
      };
      window.__ambientLive.unsubscribe = window.ambientDesktop.onEvent((event) => {
        if (event.type === "run-status") {
          window.__ambientLive.statuses.push(event.status);
          if (event.status !== "idle") window.__ambientLive.sawRunStart = true;
          if (window.__ambientLive.sawRunStart && event.status === "idle") window.__ambientLive.sawRunIdle = true;
        }
        if (event.type === "message-delta") window.__ambientLive.messageDeltaCount += 1;
        if (event.type === "tool-event") window.__ambientLive.toolEventCount += 1;
        if (event.type === "context-usage-updated") window.__ambientLive.contextSnapshots.push(event.snapshot);
        if (event.type === "runtime-activity" && event.activity?.kind === "compaction") {
          window.__ambientLive.compactionActivities.push(event.activity);
        }
        if (event.type === "runtime-activity") window.__ambientLive.runtimeActivities.push(event.activity);
        if ((event.type === "message-created" || event.type === "message-updated") && event.message?.role === "tool") {
          if (event.type === "message-created") window.__ambientLive.toolMessageCount += 1;
          const toolName = String(event.message.metadata?.toolName ?? "");
          if (toolName) window.__ambientLive.toolNames.push(toolName);
          window.__ambientLive.toolMessages.push(String(event.message.content ?? ""));
        }
        if (event.type === "error") window.__ambientLive.error = event.message;
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
          window.__ambientLive.sendResolved = true;
        })
        .catch((error) => {
          window.__ambientLive.error = error instanceof Error ? error.message : String(error);
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
    if (live.sawRunIdle && live.sendResolved) return;
    await delay(1_000);
  }
  throw new Error(`Timed out after ${maxMs}ms waiting for the live Ambient run to complete.`);
}

async function getLiveState(cdp) {
  return evaluate(
    cdp,
    `
    (() => {
      const live = window.__ambientLive;
      return live ? {
        statuses: live.statuses,
        messageDeltaCount: live.messageDeltaCount,
        toolEventCount: live.toolEventCount,
        toolMessageCount: live.toolMessageCount,
        toolNames: live.toolNames,
        toolMessages: live.toolMessages,
        contextSnapshots: live.contextSnapshots,
        compactionActivities: live.compactionActivities,
        runtimeActivities: live.runtimeActivities,
        sawRunStart: live.sawRunStart,
        sawRunIdle: live.sawRunIdle,
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
      throw new Error(`Live smoke file had unexpected content: ${JSON.stringify(body)}`);
    }
    await delay(1_000);
  }
  throw new Error(`Timed out after ${maxMs}ms waiting for ${path}.`);
}

async function desktopState(cdp) {
  return evaluate(cdp, "window.ambientDesktop.bootstrap()");
}

async function waitForGeneratedThreadTitle(cdp, threadId, maxMs) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const state = await desktopState(cdp);
    const thread = state.threads.find((item) => item.id === threadId);
    if (thread?.title && thread.title !== "New chat") return thread.title;
    await delay(500);
  }
  throw new Error("Timed out waiting for Ambient-generated thread title.");
}

async function seedPluginFixture(root) {
  await mkdir(join(root, ".agents", "plugins"), { recursive: true });
  await mkdir(join(root, "plugins"), { recursive: true });
  await cp(join(process.cwd(), "plugins", "ambient-fixture"), join(root, "plugins", "ambient-fixture"), {
    recursive: true,
  });
  await writeFile(
    join(root, ".agents", "plugins", "marketplace.json"),
    JSON.stringify(
      {
        name: "ambient-live-fixtures",
        interface: { displayName: "Ambient Live Fixtures" },
        plugins: [
          {
            name: "ambient-fixture",
            source: { source: "local", path: "./plugins/ambient-fixture" },
            category: "Productivity",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
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
