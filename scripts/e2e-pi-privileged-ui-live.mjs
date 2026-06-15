#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.AMBIENT_E2E_PI_PRIVILEGED_CDP_PORT ?? 9487);
const workspace = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-ui-"));
const userData = await mkdtemp(join(tmpdir(), "ambient-pi-privileged-ui-data-"));
const source = process.env.AMBIENT_E2E_PI_PRIVILEGED_SOURCE ?? "https://pi.dev/packages/context-mode";
const packageName = process.env.AMBIENT_E2E_PI_PRIVILEGED_PACKAGE ?? "context-mode";
const installMode = process.env.AMBIENT_E2E_PI_PRIVILEGED_MODE ?? "scan";
const expectedOrigin = installMode === "sandbox-fallback" ? "sandbox-fallback" : "explicit";
const output = [];
let appInstance;

try {
  await seedWorkspace(workspace);
  appInstance = await launchApp();
  await runPrivilegedPiUiSmoke(appInstance.cdp);
  console.log("Privileged Pi UI live smoke passed.");
} catch (error) {
  console.error(outputTail());
  throw error;
} finally {
  appInstance?.cdp.close();
  if (appInstance?.child) await terminateProcessTree(appInstance.child);
  await terminateDebugPortProcesses();
  await rm(workspace, { recursive: true, force: true });
  await rm(userData, { recursive: true, force: true });
}

async function seedWorkspace(root) {
  await writeFile(join(root, "README.md"), "# Privileged Pi UI smoke\n", "utf8");
}

async function launchApp() {
  const child = spawn("pnpm", ["exec", "electron-vite", "dev", "--", `--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AMBIENT_DESKTOP_WORKSPACE: workspace,
      AMBIENT_E2E: "1",
      AMBIENT_E2E_USER_DATA: userData,
      AMBIENT_CODEX_CURATED_MARKETPLACE_URL: "0",
      AMBIENT_PI_USER_SETTINGS_PATH: join(userData, "missing-pi-settings.json"),
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));

  const target = await waitForTarget();
  await delay(750);
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  await waitFor(cdp, () => document.body?.innerText.includes("Ambient"), "main shell", 30_000);
  return { child, cdp };
}

async function runPrivilegedPiUiSmoke(cdp) {
  await clickButton(cdp, "Plugins");
  await waitFor(cdp, () => document.body.innerText.includes("Ambient Plugin Host"), "plugins panel");
  await clickButton(cdp, "Sources");
  await clickButton(cdp, "Inspect Pi packages");
  await waitFor(cdp, () => document.body.innerText.includes("Pi Packages"), "Pi package section");

  await fillInput(cdp, ".pi-package-install-row input", source);
  if (installMode === "sandbox-fallback") {
    await clickButton(cdp, "Install sandboxed");
    await waitFor(cdp, `document.body.innerText.includes(${JSON.stringify(`Sandbox fallback: ${packageName}`)})`, "sandbox fallback result", 90_000);
    await waitFor(cdp, () => document.body.innerText.includes("Sandbox blocked") && document.body.innerText.includes("From sandbox fallback"), "sandbox fallback origin", 90_000);
  } else {
    await clickButton(cdp, "Scan privileged");
  }
  await waitFor(cdp, `document.body.innerText.includes(${JSON.stringify(`Privileged Scan: ${packageName}`)})`, "privileged scan result", 90_000);
  await waitFor(cdp, () => document.body.innerText.includes("Privileged review required"), "privileged risk label");
  await waitFor(cdp, () => document.body.innerText.includes("Install disabled keeps this package inactive"), "inactive caveat");

  await clickButton(cdp, "Install disabled");
  const promptAppeared = await waitForOptional(
    cdp,
    `document.body.innerText.includes(${JSON.stringify(`Install privileged Pi package "${packageName}" as disabled?`)})`,
    8_000,
  );
  if (promptAppeared) await clickButton(cdp, "Trust and allow once");
  await waitFor(cdp, () => document.body.innerText.includes("Privileged Pi Installs"), "privileged installs section", 120_000);
  await waitFor(cdp, `document.body.innerText.includes(${JSON.stringify(packageName)}) && document.body.innerText.includes("Disabled")`, "disabled privileged install", 120_000);
  await waitFor(cdp, `document.body.innerText.includes(${JSON.stringify(expectedOrigin === "sandbox-fallback" ? "From sandbox fallback" : "Explicit privileged scan")})`, "installed scan origin", 30_000);
  await waitFor(
    cdp,
    `window.ambientDesktop.inspectPiPrivilegedPackages().then((catalog) => catalog.packages.some((pkg) => pkg.packageName === ${JSON.stringify(packageName)} && pkg.status === "disabled" && pkg.scan.scanOrigin === ${JSON.stringify(expectedOrigin)}))`,
    "privileged catalog installed state",
    30_000,
  );
  await waitFor(
    cdp,
    `window.ambientDesktop.listPermissionAudit().then((audit) => audit.some((entry) => entry.toolName === "pi_privileged_install" && String(entry.detail || "").includes(${JSON.stringify(`Scan origin: ${expectedOrigin}`)})))`,
    "privileged install audit origin",
    30_000,
  );
  await clickRowButton(cdp, packageName, "Details");
  await waitFor(cdp, () => document.body.innerText.includes("Package Review") && document.body.innerText.includes("Audit Timeline"), "privileged package details", 30_000);
  await waitFor(cdp, () => document.body.innerText.includes("pi_privileged_install"), "privileged package audit detail", 30_000);

  const clickedUninstall = await evaluate(
    cdp,
    `
    (() => {
      const rows = [...document.querySelectorAll(".plugin-row")].filter((row) => row.innerText.includes(${JSON.stringify(packageName)}));
      const row = rows[rows.length - 1];
      const button = [...(row?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.includes("Uninstall"));
      button?.click();
      return Boolean(button);
    })()
  `,
  );
  if (!clickedUninstall) throw new Error(`Unable to click ${packageName} privileged uninstall button.`);
  await waitFor(cdp, () => document.body.innerText.includes("No privileged Pi installs are registered."), "privileged uninstall empty state", 60_000);
  await waitFor(cdp, `document.body.innerText.includes("Removed Privileged Pi Installs") && document.body.innerText.includes(${JSON.stringify(packageName)})`, "privileged uninstall history", 60_000);
  await waitFor(
    cdp,
    `window.ambientDesktop.inspectPiPrivilegedPackages().then((catalog) => catalog.packages.length === 0 && catalog.history.some((pkg) => pkg.packageName === ${JSON.stringify(packageName)}))`,
    "privileged catalog empty state",
    30_000,
  );
  await clickButton(cdp, "Clear history");
  await waitFor(cdp, () => !document.body.innerText.includes("Removed Privileged Pi Installs"), "privileged history cleared", 60_000);
  await waitFor(
    cdp,
    () => window.ambientDesktop.inspectPiPrivilegedPackages().then((catalog) => catalog.history.length === 0),
    "privileged catalog history cleared",
    30_000,
  );
}

async function waitForTarget() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed.");
  return result.result?.value;
}

async function waitFor(cdp, predicate, label, timeoutMs = 10_000) {
  const expression = typeof predicate === "string" ? predicate : `(${predicate.toString()})()`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return;
    await delay(150);
  }
  const bodyTail = await evaluate(cdp, "document.body.innerText.slice(-2000)").catch(() => "");
  throw new Error(`Timed out waiting for ${label}.\n\nBody tail:\n${bodyTail}`);
}

async function waitForOptional(cdp, predicate, timeoutMs) {
  const expression = typeof predicate === "string" ? predicate : `(${predicate.toString()})()`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return true;
    await delay(150);
  }
  return false;
}

async function clickButton(cdp, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const needle = ${JSON.stringify(label)};
      const buttons = [...document.querySelectorAll("button")].filter(isVisibleElement);
      const button =
        buttons.find((item) => item.textContent?.includes(needle)) ??
        buttons.find((item) => item.title?.includes(needle) || item.getAttribute("aria-label")?.includes(needle));
      if (!button) return false;
      button.click();
      return true;
      function isVisibleElement(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      }
    })()
  `,
  );
  if (!clicked) throw new Error(`Button not found: ${label}`);
}

async function clickRowButton(cdp, rowText, label) {
  const clicked = await evaluate(
    cdp,
    `
    (() => {
      const rowNeedle = ${JSON.stringify(rowText)};
      const buttonNeedle = ${JSON.stringify(label)};
      const rows = [...document.querySelectorAll(".plugin-row")].filter((row) => row.innerText.includes(rowNeedle));
      const row = rows[rows.length - 1];
      const button = [...(row?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.includes(buttonNeedle));
      button?.click();
      return Boolean(button);
    })()
  `,
  );
  if (!clicked) throw new Error(`Button not found in ${rowText}: ${label}`);
}

async function fillInput(cdp, selector, value) {
  const filled = await evaluate(
    cdp,
    `
    (() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) return false;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
      setter?.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()
  `,
  );
  if (!filled) throw new Error(`Input not found: ${selector}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function terminateProcessTree(proc) {
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
  return `Electron output tail:\n${output.join("").split("\n").slice(-80).join("\n")}\n`;
}
