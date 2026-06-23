#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const port = Number(process.env.AMBIENT_BROWSER_E2E_CDP_PORT ?? 9478);
const workspace = await mkdtemp(join(tmpdir(), "ambient-browser-e2e-workspace-"));
const userData = await mkdtemp(join(tmpdir(), "ambient-browser-e2e-user-data-"));
const wikiUrl = "https://en.wikipedia.org/wiki/Web_browser";
const litepaperUrl = "https://ambient.xyz/litepaper";
const litepaperPdfUrl = "https://ambient.xyz/Ambient_Litepaper_V1.pdf";
const googleQuery = "site:ambient.xyz litepaper Ambient";
const output = [];
const children = new Set();
const results = [];
const warnings = [];
let appInstance;

try {
  await seedWorkspace(workspace);
  appInstance = await launchApp();
  await runBrowserSuite(appInstance.cdp);
  console.log(JSON.stringify({ workspace, results, warnings }, null, 2));
} catch (error) {
  console.error(outputTail());
  throw error;
} finally {
  if (appInstance) {
    await evaluate(appInstance.cdp, "window.ambientDesktop.stopBrowser().catch(() => undefined)", 20_000).catch(() => undefined);
    appInstance.cdp.close();
    await terminateProcessTree(appInstance.child);
  }
  for (const child of children) await terminateProcessTree(child);
  await terminateDebugPortProcesses();
  await rm(workspace, { recursive: true, force: true });
  await rm(userData, { recursive: true, force: true });
}

console.log("Ambient browser capability E2E passed.");

async function seedWorkspace(root) {
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "README.md"),
    [
      "# Ambient browser capability smoke workspace",
      "",
      "This temporary workspace validates managed Chrome browser tools.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "keypress.html"),
    [
      "<!doctype html>",
      "<meta charset='utf-8'>",
      "<title>Browser keypress fixture</title>",
      "<button id='start'>Waiting for Space</button>",
      "<output id='status'>idle</output>",
      "<script>",
      "window.keyEvents = { down: 0, up: 0, codes: [] };",
      "document.body.tabIndex = -1;",
      "document.body.focus();",
      "document.addEventListener('keydown', (event) => {",
      "  window.keyEvents.down += 1;",
      "  window.keyEvents.codes.push(event.code);",
      "  if (event.code === 'Space' || event.key === ' ') {",
      "    document.body.dataset.started = 'true';",
      "    document.querySelector('#start').textContent = 'Started by Space';",
      "  }",
      "  document.querySelector('#status').textContent = `down:${window.keyEvents.down} up:${window.keyEvents.up} codes:${window.keyEvents.codes.join(',')}`;",
      "});",
      "document.addEventListener('keyup', () => {",
      "  window.keyEvents.up += 1;",
      "  document.querySelector('#status').textContent = `down:${window.keyEvents.down} up:${window.keyEvents.up} codes:${window.keyEvents.codes.join(',')}`;",
      "});",
      "</script>",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "asteroids-like.html"),
    [
      "<!doctype html>",
      "<meta charset='utf-8'>",
      "<title>Asteroids-like keypress fixture</title>",
      "<style>",
      "html, body { margin: 0; height: 100%; background: #05070a; color: white; font-family: system-ui, sans-serif; }",
      "main { position: relative; width: 640px; height: 420px; margin: 24px auto; border: 1px solid #8ab; background: #000; }",
      "canvas { width: 640px; height: 360px; display: block; background: #000; }",
      "#overlay { position: absolute; inset: 0 0 60px 0; display: grid; place-items: center; text-align: center; background: rgba(0,0,0,.72); font-size: 24px; letter-spacing: .08em; }",
      "#overlay[hidden] { display: none; }",
      "#status { display: block; padding: 16px; color: #9fd; }",
      "</style>",
      "<main>",
      "  <canvas id='game' width='640' height='360'></canvas>",
      "  <div id='overlay'>ASTEROIDS FIXTURE<br>PRESS SPACE TO START</div>",
      "  <output id='status'>TITLE SCREEN</output>",
      "</main>",
      "<script>",
      "const canvas = document.querySelector('#game');",
      "const ctx = canvas.getContext('2d');",
      "const overlay = document.querySelector('#overlay');",
      "const status = document.querySelector('#status');",
      "document.body.tabIndex = -1;",
      "document.body.focus();",
      "let active = false;",
      "let frame = 0;",
      "function drawTitle() {",
      "  ctx.clearRect(0, 0, canvas.width, canvas.height);",
      "  ctx.strokeStyle = '#8cf';",
      "  ctx.strokeRect(48, 48, 544, 264);",
      "  ctx.font = '28px monospace';",
      "  ctx.fillStyle = '#fff';",
      "  ctx.fillText('ASTEROIDS FIXTURE', 174, 160);",
      "}",
      "function drawGame() {",
      "  frame += 1;",
      "  ctx.clearRect(0, 0, canvas.width, canvas.height);",
      "  ctx.strokeStyle = '#fff';",
      "  ctx.beginPath();",
      "  ctx.moveTo(320, 142); ctx.lineTo(296, 210); ctx.lineTo(344, 210); ctx.closePath(); ctx.stroke();",
      "  ctx.strokeRect(96 + (frame % 80), 82, 58, 44);",
      "  ctx.strokeRect(468 - (frame % 60), 230, 72, 52);",
      "  ctx.fillStyle = '#9fd';",
      "  ctx.fillText('GAMEPLAY ACTIVE', 226, 332);",
      "}",
      "function startGame() {",
      "  active = true;",
      "  overlay.hidden = true;",
      "  status.textContent = 'GAMEPLAY ACTIVE';",
      "  drawGame();",
      "}",
      "document.addEventListener('keydown', (event) => {",
      "  if (event.code === 'Space' || event.key === ' ') { event.preventDefault(); startGame(); }",
      "});",
      "drawTitle();",
      "</script>",
    ].join("\n"),
    "utf8",
  );
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

async function runBrowserSuite(cdp) {
  await runCase("browser panel buttons and isolated Wikipedia navigation", () => runBrowserPanelSmoke(cdp));
  await runCase("real browser keypress dispatch", () => runBrowserKeypressSmoke(cdp));
  await runCase("browser keypress starts Asteroids-like game fixture", () => runBrowserGameKeypressSmoke(cdp));
  await runCase("copied Chrome profile UI and Google search", () => runCopiedProfileGoogleSmoke(cdp));
  await runCase("Ambient litepaper retrieval", () => runAmbientLitepaperSmoke(cdp));
  await runCase("browser cleanup", () => stopBrowserAndAssert(cdp));
}

async function runBrowserPanelSmoke(cdp) {
  await clickButton(cdp, "Browser");
  await waitFor(cdp, () => document.body.innerText.includes("Agent browser"), "Browser panel");
  await assertNoBrowserPanelErrors(cdp);

  const initialState = await browserState(cdp);
  if (!initialState.chromeAvailable) {
    throw new Error("Chrome is not available. Set AMBIENT_BROWSER_CHROME_PATH to run browser capability tests.");
  }
  if (!initialState.copiedProfileAvailable && initialState.sourceProfilePath) {
    await waitForButtonEnabled(cdp, ".browser-status-card", "Start copied", 30_000);
  } else if (!initialState.copiedProfileAvailable) {
    await assertButtonDisabled(cdp, ".browser-status-card", "Start copied");
  }

  await clickButtonIn(cdp, ".browser-status-card", "Start isolated");
  await waitForBrowserState(cdp, (state) => state.running && state.profileMode === "isolated", "isolated browser start", 90_000);
  await assertNoBrowserPanelErrors(cdp);

  await fillInput(cdp, 'input[placeholder="URL"]', wikiUrl);
  await waitForButtonEnabled(cdp, ".browser-control-card", "Open", 30_000);
  await clickButtonIn(cdp, ".browser-control-card", "Open");
  await waitForBrowserState(cdp, (state) => state.activeTab?.url?.includes("wikipedia.org"), "Wikipedia navigation", 90_000);

  const wikiContent = await api(cdp, `window.ambientDesktop.readBrowserContent({ profileMode: "isolated" })`, 90_000);
  if (!wikiContent.text.toLowerCase().includes("web browser")) {
    throw new Error(`Wikipedia content did not include expected text. Title=${wikiContent.title ?? ""}`);
  }

  await waitForButtonEnabled(cdp, ".browser-status-card", "Screenshot", 30_000);
  await clickButtonIn(cdp, ".browser-status-card", "Screenshot");
  await waitFor(cdp, () => document.body.innerText.includes("Saved screenshot"), "browser screenshot status", 30_000);

  await waitForButtonEnabled(cdp, ".browser-status-card", "Stop", 30_000);
  await clickButtonIn(cdp, ".browser-status-card", "Stop");
  await waitForBrowserState(cdp, (state) => !state.running, "isolated browser stop", 30_000);

  await waitForButtonEnabled(cdp, ".browser-profile-card", "Refresh", 30_000);
  await clickButtonIn(cdp, ".browser-profile-card", "Refresh");
  await waitFor(cdp, () => document.body.innerText.includes("Agent browser"), "browser state refresh");
}

async function runCopiedProfileGoogleSmoke(cdp) {
  await clickButton(cdp, "Browser");
  await waitFor(cdp, () => document.body.innerText.includes("Chrome profile copy"), "Chrome profile controls");
  const state = await browserState(cdp);
  if (!state.sourceProfilePath || !existsSync(state.sourceProfilePath)) {
    warn(`Chrome profile source was not found at ${state.sourceProfilePath ?? "(missing)"}; copied-profile Google test skipped.`);
    return;
  }

  await waitForButtonEnabled(cdp, ".browser-profile-card", "Copy profile", 30_000);
  await clickButtonIn(cdp, ".browser-profile-card", "Copy profile");
  await waitFor(cdp, () => document.body.innerText.includes("Copy Chrome profile?"), "copy profile dialog");
  await clickButtonIn(cdp, ".browser-copy-dialog", "Cancel");
  await waitFor(cdp, () => !document.body.innerText.includes("Copy Chrome profile?"), "copy profile dialog close");

  await waitForButtonEnabled(cdp, ".browser-profile-card", "Copy profile", 30_000);
  await clickButtonIn(cdp, ".browser-profile-card", "Copy profile");
  await waitFor(cdp, () => document.body.innerText.includes("Copy Chrome profile?"), "copy profile dialog reopen");
  await clickButtonIn(cdp, ".browser-copy-dialog", "Copy Chrome profile");
  await waitForBrowserState(cdp, (next) => next.copiedProfileAvailable, "copied Chrome profile", 240_000);

  await waitForButtonEnabled(cdp, ".browser-status-card", "Start copied", 30_000);
  await clickButtonIn(cdp, ".browser-status-card", "Start copied");
  await waitForBrowserState(cdp, (next) => next.running && next.profileMode === "copied", "copied browser start", 90_000);

  await fillInput(cdp, 'input[placeholder="Google search"]', googleQuery);
  await waitForButtonEnabled(cdp, ".browser-control-card", "Search", 30_000);
  await clickButtonIn(cdp, ".browser-control-card", "Search");
  const searchState = await waitForSearchStatusOrHandoff(cdp, 120_000);
  if (searchState.userAction?.active) {
    warn(`Google search entered browser handoff (${searchState.userAction.kind}/${searchState.userAction.provider ?? "unknown"}); live CAPTCHA path skipped.`);
    await api(cdp, "window.ambientDesktop.cancelBrowserUserAction()", 30_000).catch(() => undefined);
    return;
  }
  await assertNoBrowserPanelErrors(cdp);

  try {
    const results = await api(
      cdp,
      `window.ambientDesktop.searchBrowser({ query: ${JSON.stringify(googleQuery)}, maxResults: 5, profileMode: "copied" })`,
      120_000,
    );
    if (!Array.isArray(results) || results.length === 0) {
      warn("Google search with copied profile completed but returned no extractable results.");
      return;
    }
    if (!results.some((result) => String(result.url).includes("ambient.xyz"))) {
      warn(`Google search with copied profile returned results, but none were from ambient.xyz: ${results.map((item) => item.url).join(", ")}`);
    }
  } catch (error) {
    warn(`Google search with copied profile failed after the UI button path was exercised: ${errorMessage(error)}`);
  }
}

async function runBrowserKeypressSmoke(cdp) {
  const fixtureUrl = pathToFileURL(join(workspace, "keypress.html")).href;
  await api(
    cdp,
    `window.ambientDesktop.navigateBrowser({ url: ${JSON.stringify(fixtureUrl)}, profileMode: "isolated", runtime: "chrome" })`,
    90_000,
  );
  const before = await api(cdp, `window.ambientDesktop.readBrowserContent({ profileMode: "isolated", runtime: "chrome" })`, 30_000);
  if (!before.text.includes("Waiting for Space")) {
    throw new Error(`Keypress fixture did not load before input: ${JSON.stringify(before)}`);
  }
  const result = await api(
    cdp,
    `window.ambientDesktop.keypressBrowser({ keys: [{ key: "Space", code: "Space", durationMs: 100 }], focus: "page", profileMode: "isolated", runtime: "chrome" })`,
    30_000,
  );
  if (result.dispatchedCount !== 1 || result.keys?.[0]?.code !== "Space") {
    throw new Error(`Keypress result did not report dispatched Space: ${JSON.stringify(result)}`);
  }
  const after = await waitForBrowserContent(
    cdp,
    "isolated",
    (page) => page.text.includes("Started by Space") && page.text.includes("down:1") && page.text.includes("up:1"),
    "browser keypress fixture state",
    30_000,
    "chrome",
  );
  if (!after.text.includes("codes:Space")) {
    throw new Error(`Keypress fixture did not record Space code: ${JSON.stringify(after)}`);
  }
}

async function runBrowserGameKeypressSmoke(cdp) {
  const fixtureUrl = pathToFileURL(join(workspace, "asteroids-like.html")).href;
  await api(
    cdp,
    `window.ambientDesktop.navigateBrowser({ url: ${JSON.stringify(fixtureUrl)}, profileMode: "isolated", runtime: "chrome" })`,
    90_000,
  );
  const before = await api(cdp, `window.ambientDesktop.readBrowserContent({ profileMode: "isolated", runtime: "chrome" })`, 30_000);
  if (!before.text.includes("PRESS SPACE TO START") || !before.text.includes("TITLE SCREEN")) {
    throw new Error(`Asteroids-like fixture did not start on the title screen: ${JSON.stringify(before)}`);
  }
  const keypress = await api(
    cdp,
    `window.ambientDesktop.keypressBrowser({ keys: [{ key: "Space", code: "Space", durationMs: 120 }], focus: "page", profileMode: "isolated", runtime: "chrome" })`,
    30_000,
  );
  if (keypress.dispatchedCount !== 1 || keypress.keys?.[0]?.code !== "Space") {
    throw new Error(`Asteroids-like fixture keypress did not report dispatched Space: ${JSON.stringify(keypress)}`);
  }
  const after = await waitForBrowserContent(
    cdp,
    "isolated",
    (page) => page.text.includes("GAMEPLAY ACTIVE") && !page.text.includes("PRESS SPACE TO START"),
    "Asteroids-like gameplay transition",
    30_000,
    "chrome",
  );
  if (after.text.includes("TITLE SCREEN")) {
    throw new Error(`Asteroids-like fixture still reported title-screen state after keypress: ${JSON.stringify(after)}`);
  }
  const screenshot = await api(cdp, `window.ambientDesktop.screenshotBrowser({ profileMode: "isolated", runtime: "chrome" })`, 60_000);
  if (
    screenshot.bytes < 1_000 ||
    typeof screenshot.artifactPath !== "string" ||
    !screenshot.artifactPath.startsWith(".ambient-codex/browser/screenshots/") ||
    screenshot.mimeType !== "image/png" ||
    screenshot.width < 1 ||
    screenshot.height < 1
  ) {
    throw new Error(`Asteroids-like gameplay screenshot did not include valid proof metadata: ${JSON.stringify(screenshot)}`);
  }
}

async function waitForSearchStatusOrHandoff(cdp, maxMs) {
  const deadline = Date.now() + maxMs;
  let lastState;
  while (Date.now() < deadline) {
    lastState = await browserState(cdp);
    if (lastState.userAction?.active) return lastState;
    const settled = await evaluate(
      cdp,
      `document.body.innerText.includes("Search returned") || Boolean(document.querySelector(".panel-status.error"))`,
      30_000,
    );
    if (settled) return lastState;
    await delay(500);
  }
  throw new Error(`Timed out waiting for Google search status. Last browser state: ${JSON.stringify(lastState)}`);
}

async function runAmbientLitepaperSmoke(cdp) {
  const mode = (await browserState(cdp)).copiedProfileAvailable ? "copied" : "isolated";
  await api(cdp, `window.ambientDesktop.navigateBrowser({ url: ${JSON.stringify(litepaperUrl)}, profileMode: ${JSON.stringify(mode)} })`, 90_000);
  const content = await waitForBrowserContent(
    cdp,
    mode,
    (page) => `${page.title ?? ""}\n${page.text ?? ""}`.toLowerCase().includes("litepaper"),
    "Ambient litepaper page text",
    20_000,
  ).catch((error) => {
    warn(`Ambient litepaper page text was not readable through browser_content: ${errorMessage(error)}`);
    return { links: [] };
  });

  const pdfLink = content.links?.find((link) => link.url.includes("Ambient_Litepaper"))?.url ?? litepaperPdfUrl;
  const pdfResponse = await fetch(pdfLink);
  if (!pdfResponse.ok) throw new Error(`Litepaper PDF fetch failed: ${pdfResponse.status} ${pdfResponse.statusText}`);
  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
  if (pdfBytes.length < 50_000 || pdfBytes.subarray(0, 4).toString("latin1") !== "%PDF") {
    throw new Error(`Litepaper PDF did not look valid. bytes=${pdfBytes.length}`);
  }

  await api(cdp, `window.ambientDesktop.navigateBrowser({ url: ${JSON.stringify(pdfLink)}, profileMode: ${JSON.stringify(mode)} })`, 90_000);
  const screenshot = await api(cdp, `window.ambientDesktop.screenshotBrowser({ profileMode: ${JSON.stringify(mode)} })`, 60_000);
  const screenshotStat = await stat(screenshot.path);
  if (screenshot.bytes < 1_000 || screenshotStat.size !== screenshot.bytes) {
    throw new Error(`Litepaper screenshot was empty or inconsistent: ${JSON.stringify(screenshot)}`);
  }
  if (
    typeof screenshot.artifactPath !== "string" ||
    !screenshot.artifactPath.startsWith(".ambient-codex/browser/screenshots/") ||
    join(workspace, screenshot.artifactPath) !== screenshot.path
  ) {
    throw new Error(`Litepaper screenshot did not include a workspace-relative artifact path: ${JSON.stringify(screenshot)}`);
  }
  if (screenshot.mimeType !== "image/png" || screenshot.width < 1 || screenshot.height < 1) {
    throw new Error(`Litepaper screenshot did not include PNG preview metadata: ${JSON.stringify(screenshot)}`);
  }
}

async function stopBrowserAndAssert(cdp) {
  await api(cdp, "window.ambientDesktop.stopBrowser()", 30_000);
  await waitForBrowserState(cdp, (state) => !state.running, "browser stop", 30_000);
  const state = await browserState(cdp);
  if (state.copiedProfileAvailable) {
    await clickButton(cdp, "Browser");
    await waitForButtonEnabled(cdp, ".browser-profile-card", "Clear copied profile", 30_000);
    await clickButtonIn(cdp, ".browser-profile-card", "Clear copied profile");
    await waitForBrowserState(cdp, (next) => !next.copiedProfileAvailable, "clear copied profile", 60_000);
  }
}

async function runCase(name, fn) {
  const startedAt = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - startedAt;
    results.push({ name, status: "passed", durationMs });
    console.log(`[pass] ${name} (${durationMs}ms)`);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    results.push({ name, status: "failed", durationMs, error: errorMessage(error) });
    throw new Error(`${name} failed: ${errorMessage(error)}`);
  }
}

function warn(message) {
  warnings.push(message);
  console.warn(`[warn] ${message}`);
}

async function browserState(cdp) {
  return api(cdp, "window.ambientDesktop.getBrowserState()", 30_000);
}

async function waitForBrowserState(cdp, predicate, label, maxMs) {
  const expression = `window.ambientDesktop.getBrowserState().then((${predicate.toString()}))`;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression, 30_000)) return;
    await delay(300);
  }
  throw new Error(`Timed out waiting for ${label}. Last state: ${JSON.stringify(await browserState(cdp))}`);
}

async function waitForBrowserContent(cdp, profileMode, predicate, label, maxMs, runtime) {
  const deadline = Date.now() + maxMs;
  let lastContent;
  while (Date.now() < deadline) {
    lastContent = await api(
      cdp,
      `window.ambientDesktop.readBrowserContent({ profileMode: ${JSON.stringify(profileMode)}${runtime ? `, runtime: ${JSON.stringify(runtime)}` : ""} })`,
      30_000,
    );
    if (predicate(lastContent)) return lastContent;
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${label}. Last content title=${JSON.stringify(lastContent?.title ?? "")}`);
}

async function api(cdp, expression, timeoutMs) {
  return evaluate(cdp, expression, timeoutMs);
}

async function assertNoBrowserPanelErrors(cdp) {
  const errorText = await evaluate(
    cdp,
    `
    (() => [...document.querySelectorAll(".right-panel .panel-status.error")]
      .map((node) => node.textContent?.trim())
      .filter(Boolean)
      .join("\\n"))()
  `,
  );
  if (errorText) throw new Error(`Browser panel error: ${errorText}`);
}

async function assertButtonDisabled(cdp, containerSelector, label) {
  const result = await buttonState(cdp, containerSelector, label);
  if (!result.found) throw new Error(`Expected button ${label} in ${containerSelector}.`);
  if (!result.disabled) throw new Error(`Expected button ${label} to be disabled in ${containerSelector}.`);
}

async function waitForButtonEnabled(cdp, containerSelector, label, maxMs) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const result = await buttonState(cdp, containerSelector, label);
    if (result.found && !result.disabled) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for button ${label} to become enabled in ${containerSelector}.`);
}

async function clickButton(cdp, label) {
  const result = await clickButtonExpression(cdp, "document", label);
  if (!result.clicked) throw new Error(`Button not clicked: ${label} (${result.reason})`);
}

async function clickButtonIn(cdp, containerSelector, label) {
  const result = await clickButtonExpression(cdp, `document.querySelector(${JSON.stringify(containerSelector)})`, label);
  if (!result.clicked) throw new Error(`Button not clicked: ${label} in ${containerSelector} (${result.reason})`);
}

async function clickButtonExpression(cdp, rootExpression, label) {
  return evaluate(
    cdp,
    `
    (() => {
      const root = ${rootExpression};
      if (!root) return { clicked: false, reason: "missing root" };
      const needle = ${JSON.stringify(label)};
      const buttons = [...root.querySelectorAll("button")].filter((button) => {
        const text = button.textContent?.trim() || "";
        const title = button.title || "";
        const aria = button.getAttribute("aria-label") || "";
        const visible = button.offsetParent !== null || getComputedStyle(button).position === "fixed";
        return visible && (text.includes(needle) || title.includes(needle) || aria.includes(needle));
      });
      const button = buttons[0];
      if (!button) return { clicked: false, reason: "missing button" };
      if (button.disabled) return { clicked: false, reason: "disabled" };
      button.click();
      return { clicked: true };
    })()
  `,
  );
}

async function buttonState(cdp, containerSelector, label) {
  return evaluate(
    cdp,
    `
    (() => {
      const root = document.querySelector(${JSON.stringify(containerSelector)});
      if (!root) return { found: false };
      const needle = ${JSON.stringify(label)};
      const button = [...root.querySelectorAll("button")].find((item) => {
        const text = item.textContent?.trim() || "";
        const title = item.title || "";
        const aria = item.getAttribute("aria-label") || "";
        return text.includes(needle) || title.includes(needle) || aria.includes(needle);
      });
      if (!button) return { found: false };
      return { found: true, disabled: button.disabled };
    })()
  `,
  );
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
        send(method, params = {}, timeoutMs = 15_000) {
          const id = nextId++;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((innerResolve, innerReject) => {
            const timeout = setTimeout(() => {
              if (!pending.has(id)) return;
              pending.delete(id);
              innerReject(new Error(`Timed out waiting for CDP ${method}.`));
            }, timeoutMs);
            pending.set(id, { resolve: innerResolve, reject: innerReject, timeout });
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
      clearTimeout(entry.timeout);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message ?? "CDP error"));
      else entry.resolve(message.result);
    });
    socket.addEventListener("error", () => reject(new Error("CDP websocket failed.")));
  });
}

async function evaluate(cdp, expression, timeoutMs = 15_000) {
  const result = await cdp.send(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
    },
    timeoutMs,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Runtime.evaluate failed.");
  }
  return result.result?.value;
}

async function waitFor(cdp, predicate, label, maxMs = 10_000) {
  const expression = `(${predicate.toString()})()`;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression, 30_000)) return;
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function outputTail() {
  return `Electron output tail:\n${output.join("").split("\n").slice(-120).join("\n")}\n`;
}
