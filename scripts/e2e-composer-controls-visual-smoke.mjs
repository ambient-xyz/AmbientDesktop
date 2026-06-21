#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = await availablePort(Number(process.env.AMBIENT_COMPOSER_VISUAL_CDP_PORT ?? 9491));
const resultsDir = join(process.cwd(), "test-results", "composer-controls-visual-smoke");
const workspace = await mkdtemp(join(tmpdir(), "ambient-composer-controls-workspace-"));
const userData = await mkdtemp(join(tmpdir(), "ambient-composer-controls-user-data-"));
const output = [];
const children = new Set();
let appInstance;

const scenarios = [
  { name: "desktop", width: 1320, height: 900 },
  { name: "compact", width: 980, height: 760 },
];

try {
  await rm(resultsDir, { recursive: true, force: true });
  await mkdir(resultsDir, { recursive: true });
  await writeFile(join(workspace, "README.md"), "# Composer controls visual smoke\n", "utf8");

  appInstance = await launchApp();
  const cdp = appInstance.cdp;
  const reports = [];
  for (const scenario of scenarios) {
    await setViewport(cdp, scenario.width, scenario.height);
    await waitFor(cdp, () => Boolean(document.querySelector(".composer-settings-controls")), `${scenario.name} composer settings`);
    await delay(250);
    const report = await inspectComposerControls(cdp, scenario);
    reports.push(report);
    await writeScreenshot(cdp, join(resultsDir, `${scenario.name}.png`));
  }
  await writeFile(join(resultsDir, "latest.json"), `${JSON.stringify({ createdAt: new Date().toISOString(), reports }, null, 2)}\n`, "utf8");
  console.log(`Composer controls visual smoke passed. Artifacts: ${resultsDir}`);
} catch (error) {
  await writeFile(
    join(resultsDir, "failure-output.txt"),
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n\n${outputTail()}`,
    "utf8",
  ).catch(() => undefined);
  console.error(outputTail());
  throw error;
} finally {
  if (appInstance) await shutdownAppInstance(appInstance);
  for (const child of [...children]) await terminateProcessTree(child);
  await terminateDebugPortProcesses();
  await rm(workspace, { recursive: true, force: true });
  await rm(userData, { recursive: true, force: true });
}

async function launchApp() {
  const child = spawn(
    "pnpm",
    ["exec", "electron-vite", "dev", "--", `--remote-debugging-port=${port}`],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AMBIENT_PROVIDER: process.env.AMBIENT_PROVIDER || "gmi-cloud",
        AMBIENT_E2E: "1",
        AMBIENT_DESKTOP_WORKSPACE: workspace,
        AMBIENT_E2E_USER_DATA: userData,
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    },
  );
  children.add(child);
  child.once("exit", () => children.delete(child));
  child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));

  const target = await waitForTarget();
  await delay(750);
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  await waitFor(cdp, () => document.body?.innerText.includes("Ambient"), "main shell", 30_000);
  return { child, cdp };
}

async function inspectComposerControls(cdp, scenario) {
  const report = await evaluate(
    cdp,
    `
    (() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const bounds = element.getBoundingClientRect();
        const styles = getComputedStyle(element);
        return {
          selector,
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
          right: Math.round(bounds.right),
          bottom: Math.round(bounds.bottom),
          display: styles.display,
          visibility: styles.visibility,
          opacity: Number(styles.opacity),
          text: element.textContent?.replace(/\\s+/g, " ").trim().slice(0, 160) ?? "",
        };
      };
      const visible = (selector) => {
        const item = rect(selector);
        return Boolean(item && item.width > 0 && item.height > 0 && item.display !== "none" && item.visibility !== "hidden" && item.opacity > 0);
      };
      const controls = rect(".composer-controls");
      const tools = rect(".composer-tool-actions");
      const settings = rect(".composer-settings-controls");
      const right = rect(".right-controls");
      const goal = rect(".composer-settings-controls .goal-mode-toggle");
      const mode = rect(".composer-settings-controls .collaboration-toggle");
      const permission = rect('.composer-settings-controls [aria-label="Permission scope"]');
      const thinking = rect(".composer-settings-controls .thinking-display-control");
      const reasoning = rect('.composer-settings-controls [aria-label^="Reasoning mode"]');
      const model = rect(".composer-settings-controls .model-picker-button");
      const labels = [...document.querySelectorAll(".composer-settings-controls button, .composer-settings-controls [aria-label]")]
        .map((element) => element.getAttribute("aria-label") || element.textContent?.replace(/\\s+/g, " ").trim())
        .filter(Boolean);
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        documentWidth: document.documentElement.scrollWidth,
        controls,
        tools,
        settings,
        right,
        goal,
        mode,
        permission,
        thinking,
        reasoning,
        model,
        visible: {
          controls: visible(".composer-controls"),
          tools: visible(".composer-tool-actions"),
          settings: visible(".composer-settings-controls"),
          right: visible(".right-controls"),
          goal: visible(".composer-settings-controls .goal-mode-toggle"),
          mode: visible(".composer-settings-controls .collaboration-toggle"),
          permission: visible('.composer-settings-controls [aria-label="Permission scope"]'),
          thinking: visible(".composer-settings-controls .thinking-display-control"),
          reasoning: visible('.composer-settings-controls [aria-label^="Reasoning mode"]'),
          model: visible(".composer-settings-controls .model-picker-button"),
        },
        labels,
      };
    })()
  `,
  );
  const failures = composerControlFailures(report);
  if (failures.length > 0) {
    await writeFile(join(resultsDir, `${scenario.name}-failure.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeScreenshot(cdp, join(resultsDir, `${scenario.name}-failure.png`));
    throw new Error(`Composer controls visual smoke failed for ${scenario.name}: ${failures.join("; ")}`);
  }
  await writeFile(join(resultsDir, `${scenario.name}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { scenario, report };
}

function composerControlFailures(report) {
  const failures = [];
  for (const key of ["controls", "tools", "settings", "right", "goal", "mode", "permission", "thinking", "reasoning", "model"]) {
    if (!report.visible?.[key]) failures.push(`${key} is not visible`);
  }
  if (report.documentWidth > report.viewport.width + 1) {
    failures.push(`horizontal overflow ${report.documentWidth}px > ${report.viewport.width}px`);
  }
  const composer = report.controls;
  for (const key of ["tools", "settings", "right"]) {
    const item = report[key];
    if (!composer || !item) continue;
    if (item.x < composer.x - 1 || item.right > composer.right + 1) {
      failures.push(`${key} extends outside composer controls`);
    }
  }
  for (const key of ["goal", "mode", "permission", "thinking", "reasoning", "model"]) {
    const item = report[key];
    const settings = report.settings;
    if (!settings || !item) continue;
    if (item.x < settings.x - 1 || item.right > settings.right + 1) {
      failures.push(`${key} extends outside settings controls`);
    }
  }
  for (const expected of ["Pursue goal", "Collaboration mode", "Permission scope", "Thinking display", "Reasoning mode", "Model:"]) {
    if (!report.labels?.some((label) => String(label).includes(expected))) failures.push(`missing label ${expected}`);
  }
  return failures;
}

async function waitForTarget(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const target = targets.find((item) => item.webSocketDebuggerUrl && item.type === "page") ?? targets.find((item) => item.webSocketDebuggerUrl);
      if (target) return target;
    } catch {
      // Keep polling until Electron exposes the debug target.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for Electron CDP target on port ${port}.`);
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    const api = {
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
    };
    socket.addEventListener("open", () => resolve(api));
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed.");
  return result.result?.value;
}

async function waitFor(cdp, predicate, label, timeoutMs = 10_000) {
  const expression = `(${predicate.toString()})()`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression).catch(() => false)) return;
    await delay(150);
  }
  const bodyTail = await evaluate(cdp, "document.body.innerText.slice(-2000)").catch(() => "");
  throw new Error(`Timed out waiting for ${label}.\n\nBody tail:\n${bodyTail}`);
}

async function writeScreenshot(cdp, path) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (!result.data || result.data.length < 1000) throw new Error(`Screenshot capture failed for ${path}.`);
  await writeFile(path, Buffer.from(result.data, "base64"));
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function shutdownAppInstance(instance) {
  try {
    instance.cdp.close();
  } catch {
    // Ignore teardown races.
  }
  await terminateProcessTree(instance.child);
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
  await runIgnoringFailure("pkill", ["-f", `remote-debugging-port=${port}`]);
}

function runIgnoringFailure(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", resolve);
    child.on("close", resolve);
  });
}

function availablePort(preferredPort) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => {
      resolve(availablePort(0));
    });
    server.listen(preferredPort, "127.0.0.1", () => {
      const address = server.address();
      const selectedPort = typeof address === "object" && address ? address.port : preferredPort;
      server.close(() => resolve(selectedPort));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function outputTail() {
  return `Electron output tail:\n${output.join("").split("\n").slice(-80).join("\n")}\n`;
}
