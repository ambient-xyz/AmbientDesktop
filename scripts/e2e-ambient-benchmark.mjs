#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshotHarnessWorkspace, writeHarnessTraceArtifacts } from "./harness-trace-artifacts.mjs";

const port = Number(process.env.AMBIENT_BENCHMARK_CDP_PORT ?? 9478);
const timeoutMs = Number(process.env.AMBIENT_BENCHMARK_TIMEOUT_MS ?? 420_000);
const workspace = await mkdtemp(join(tmpdir(), "ambient-benchmark-workspace-"));
const finalToken = "BENCHMARK_DONE";
const output = [];
const children = new Set();
let appInstance;
let beforeWorkspace;

try {
  await seedBenchmarkWorkspace(workspace);
  beforeWorkspace = await snapshotHarnessWorkspace(workspace);
  appInstance = await launchApp();
  const summary = await runBenchmark(appInstance.cdp);
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

console.log("Live Ambient coding benchmark passed.");

async function seedBenchmarkWorkspace(root) {
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "test"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        type: "module",
        scripts: {
          test: "node --test",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(root, "src", "math.js"),
    ["export function add(left, right) {", "  return left + right;", "}", ""].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "test", "math.test.js"),
    [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { add } from "../src/math.js";',
      "",
      'test("add sums numbers", () => {',
      "  assert.equal(add(2, 3), 5);",
      "});",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "README.md"),
    ["# Ambient benchmark fixture", "", "This project uses Node's built-in test runner.", ""].join("\n"),
    "utf8",
  );
}

async function launchApp() {
  const child = spawn("pnpm", ["exec", "electron-vite", "dev", "--", `--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AMBIENT_DESKTOP_WORKSPACE: workspace,
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

async function runBenchmark(cdp) {
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
  if (!keyCheck?.ok) throw new Error(`Ambient API key check failed: ${keyCheck?.message ?? "unknown error"}`);

  await installCollector(cdp);
  const prompt = [
    "This is a live product benchmark for Ambient Desktop.",
    "Modify this local Node project in multiple files without using the network.",
    "Create src/textStats.js exporting summarizeText(input).",
    "summarizeText must lowercase words matched by /[a-z0-9]+/g and return exactly { wordCount, uniqueWordCount, longestWord }.",
    "Create test/textStats.test.js using node:test and assert/strict for empty input, repeated words, punctuation, and longest word.",
    "Update README.md with a short textStats section that names summarizeText.",
    "Run npm test locally and fix the project until it passes.",
    `After tests pass, reply with exactly: ${finalToken}`,
  ].join("\n");

  await sendPrompt(cdp, {
    threadId: state.activeThreadId,
    content: prompt,
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: process.env.AMBIENT_BENCHMARK_MODEL || process.env.AMBIENT_LIVE_MODEL || state.settings.model,
    thinkingLevel: "low",
  });

  await waitFor(cdp, () => Boolean(window.__ambientBenchmark?.sawRunStart), "benchmark run start", 45_000);
  await waitForCompletion(cdp, timeoutMs);

  const live = await getCollectorState(cdp);
  const nextState = await desktopState(cdp);
  const assistantText = nextState.messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .join("\n");
  const toolTranscript = nextState.messages
    .filter((message) => message.role === "tool")
    .map((message) => `${message.metadata?.toolName ?? ""}\n${message.content}`)
    .join("\n");

  if (live.error) throw new Error(`Live Ambient benchmark failed: ${live.error}`);
  if (live.toolMessageCount < 2 && live.toolEventCount < 2) throw new Error("Benchmark did not emit enough tool activity.");
  if (!toolTranscript.includes("bash") && !toolTranscript.includes("write") && !toolTranscript.includes("edit")) {
    throw new Error(`Benchmark transcript did not include expected tool cards: ${toolTranscript.slice(-1200)}`);
  }
  if (!assistantText.includes(finalToken)) {
    throw new Error(`Benchmark did not finish with ${finalToken}. Assistant text: ${assistantText.slice(-1000)}`);
  }

  const textStatsPath = join(workspace, "src", "textStats.js");
  const testPath = join(workspace, "test", "textStats.test.js");
  const readmePath = join(workspace, "README.md");
  if (!existsSync(textStatsPath) || !existsSync(testPath)) throw new Error("Benchmark did not create expected source and test files.");

  const [source, tests, readme] = await Promise.all([
    readFile(textStatsPath, "utf8"),
    readFile(testPath, "utf8"),
    readFile(readmePath, "utf8"),
  ]);
  if (!source.includes("summarizeText") || !source.includes("uniqueWordCount")) throw new Error("textStats source is missing expected API.");
  if (!tests.includes("node:test") || !tests.includes("longestWord")) throw new Error("textStats tests are missing expected assertions.");
  if (!readme.includes("summarizeText")) throw new Error("README was not updated with summarizeText documentation.");

  const testResult = await runCommand("npm", ["test"], workspace);
  if (testResult.exitCode !== 0) {
    throw new Error(`Post-run npm test failed.\nSTDOUT:\n${testResult.stdout}\nSTDERR:\n${testResult.stderr}`);
  }

  const summary = {
    workspace,
    model: process.env.AMBIENT_BENCHMARK_MODEL || process.env.AMBIENT_LIVE_MODEL || state.settings.model,
    messageDeltaCount: live.messageDeltaCount,
    toolEventCount: live.toolEventCount,
    toolMessageCount: live.toolMessageCount,
    toolNames: live.toolNames,
    createdFiles: ["src/textStats.js", "test/textStats.test.js"],
    npmTestLines: testResult.stdout.split("\n").filter(Boolean).length,
  };
  await writeHarnessTraceArtifacts({ workspace, beforeWorkspace, messages: nextState.messages, summary });
  return summary;
}

async function installCollector(cdp) {
  await evaluate(
    cdp,
    `
    (() => {
      window.__ambientBenchmark?.unsubscribe?.();
      window.__ambientBenchmark = {
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
      window.__ambientBenchmark.unsubscribe = window.ambientDesktop.onEvent((event) => {
        if (event.type === "run-status") {
          window.__ambientBenchmark.statuses.push(event.status);
          if (event.status !== "idle") window.__ambientBenchmark.sawRunStart = true;
          if (window.__ambientBenchmark.sawRunStart && event.status === "idle") window.__ambientBenchmark.sawRunIdle = true;
        }
        if (event.type === "message-delta") {
          window.__ambientBenchmark.messageDeltaCount += 1;
          window.__ambientBenchmark.assistantTail = (window.__ambientBenchmark.assistantTail + String(event.delta ?? "")).slice(-4000);
        }
        if (event.type === "tool-event") window.__ambientBenchmark.toolEventCount += 1;
        if ((event.type === "message-created" || event.type === "message-updated") && event.message?.role === "tool") {
          if (event.type === "message-created") window.__ambientBenchmark.toolMessageCount += 1;
          const toolName = String(event.message.metadata?.toolName ?? "");
          if (toolName) window.__ambientBenchmark.toolNames.push(toolName);
          window.__ambientBenchmark.toolTail = (window.__ambientBenchmark.toolTail + "\\n---\\n" + String(event.message.content ?? "")).slice(-4000);
        }
        if (event.type === "error") window.__ambientBenchmark.error = event.message;
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
          window.__ambientBenchmark.sendResolved = true;
        })
        .catch((error) => {
          window.__ambientBenchmark.error = error instanceof Error ? error.message : String(error);
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
      `Timed out after ${maxMs}ms waiting for benchmark completion.`,
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
      const live = window.__ambientBenchmark;
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

function runCommand(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => resolve({ exitCode: 1, stdout, stderr: String(error) }));
    child.on("close", (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
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
  return `Electron output tail:\n${output.join("").split("\n").slice(-160).join("\n")}\n`;
}
