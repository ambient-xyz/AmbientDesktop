#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const port = Number(process.env.AMBIENT_PACKAGED_CDP_PORT ?? 9477);
const workspace = await mkdtemp(join(tmpdir(), "ambient-packaged-workspace-"));
const userDataPath = join(workspace, "user-data");
const defaultUserDataPath = join(workspace, "default-user-data");
const output = [];
const children = new Set();
let appInstance;

try {
  await writeFile(join(workspace, "README.md"), "# Packaged smoke workspace\n", "utf8");
  await seedMediaFixtures(workspace);
  await seedMediaFixtures(join(defaultUserDataPath, "workspace"));
  await mkdir(userDataPath, { recursive: true });
  await mkdir(defaultUserDataPath, { recursive: true });

  appInstance = await launchPackagedApp({
    diagnosticsPath: join(workspace, "packaged-diagnostics.json"),
    expectedWorkspace: workspace,
    userDataPath,
    workspaceEnv: workspace,
  });
  await runPackagedSmoke(appInstance.cdp, appInstance.expectedWorkspace, appInstance.diagnosticsPath);
  appInstance.cdp.close();
  await terminateProcessTree(appInstance.child);
  await terminateDebugPortProcesses();
  await waitForCdpPortClosed();
  appInstance = undefined;

  appInstance = await launchPackagedApp({
    diagnosticsPath: join(workspace, "restart-diagnostics.json"),
    expectedWorkspace: workspace,
    userDataPath,
    workspaceEnv: workspace,
  });
  await runRestartSmoke(appInstance.cdp);
  appInstance.cdp.close();
  await terminateProcessTree(appInstance.child);
  await terminateDebugPortProcesses();
  await waitForCdpPortClosed();
  appInstance = undefined;

  appInstance = await launchPackagedApp({
    cwd: process.platform === "win32" ? process.cwd() : "/",
    diagnosticsPath: join(workspace, "root-cwd-diagnostics.json"),
    expectedWorkspace: join(defaultUserDataPath, "workspace"),
    userDataPath: defaultUserDataPath,
    workspaceEnv: undefined,
  });
  await runPackagedSmoke(appInstance.cdp, appInstance.expectedWorkspace, appInstance.diagnosticsPath);
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

console.log("Packaged Electron smoke passed.");

async function launchPackagedApp(options = {}) {
  const launchCwd = options.cwd ?? process.cwd();
  const launchDiagnosticsPath = options.diagnosticsPath ?? join(workspace, "packaged-diagnostics.json");
  const launchUserDataPath = options.userDataPath ?? userDataPath;
  const expectedWorkspace = options.expectedWorkspace ?? workspace;
  const env = {
    ...process.env,
    AMBIENT_E2E: "1",
    AMBIENT_E2E_USER_DATA: launchUserDataPath,
    AMBIENT_E2E_DIAGNOSTICS_PATH: launchDiagnosticsPath,
    AMBIENT_DESKTOP_UPDATES_DISABLED: "1",
    AMBIENT_API_KEY: process.env.AMBIENT_API_KEY || "ambient-packaged-env-key",
  };
  if (options.workspaceEnv !== undefined) {
    env.AMBIENT_DESKTOP_WORKSPACE = options.workspaceEnv;
  }

  const executable = packagedExecutablePath();
  const child = spawn(executable, [`--remote-debugging-port=${port}`], {
    cwd: launchCwd,
    env,
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
  await waitFor(cdp, () => document.body?.innerText.includes("Ambient"), "packaged main shell", 30_000);
  return { child, cdp, diagnosticsPath: launchDiagnosticsPath, expectedWorkspace };
}

async function runPackagedSmoke(cdp, expectedWorkspace, smokeDiagnosticsPath) {
  console.log("packaged smoke: bootstrap");
  const state = await desktopState(cdp);
  if (!state.app.isPackaged) throw new Error(`Expected packaged app state, got ${JSON.stringify(state.app)}`);
  if (state.workspace.path !== expectedWorkspace) throw new Error(`Expected workspace ${expectedWorkspace}, got ${state.workspace.path}`);
  console.log("packaged smoke: credential bridge");
  if (!state.provider.hasApiKey || state.provider.storage !== "environment") {
    throw new Error(`Expected packaged credential bridge to read env key, got ${JSON.stringify(state.provider)}`);
  }
  console.log("packaged smoke: preload API");
  const apiCheck = await windowApiCheck(cdp);
  if (!apiCheck.hasBootstrap || !apiCheck.hasTerminal || !apiCheck.hasDiagnostics) {
    throw new Error(`preload API check failed: ${JSON.stringify(apiCheck)}`);
  }

  console.log("packaged smoke: menu command");
  const threadCount = state.threads.length;
  await emitMenuCommand(cdp, "new-chat");
  await waitForThreadCount(cdp, threadCount);

  console.log("packaged smoke: terminal");
  const terminalState = await desktopState(cdp);
  const terminalIntent = await evaluate(
    cdp,
    `window.ambientDesktop.requestTerminalStart({ threadId: ${JSON.stringify(terminalState.activeThreadId)} })`,
  );
  const terminal = await evaluate(
    cdp,
    `window.ambientDesktop.startTerminal({ threadId: ${JSON.stringify(terminalState.activeThreadId)}, startToken: ${JSON.stringify(terminalIntent.token)} })`,
  );
  if (!terminal?.id || !terminal?.sessionToken) throw new Error(`Packaged node-pty terminal did not start: ${JSON.stringify(terminal)}`);
  await evaluate(
    cdp,
    `window.ambientDesktop.stopTerminal({ threadId: ${JSON.stringify(terminalState.activeThreadId)}, terminalId: ${JSON.stringify(terminal.id)}, sessionToken: ${JSON.stringify(terminal.sessionToken)} })`,
  );

  console.log("packaged smoke: media protocol");
  await runPackagedMediaSmoke(cdp);

  console.log("packaged smoke: diagnostics");
  await rm(smokeDiagnosticsPath, { force: true });
  await evaluate(cdp, "window.ambientDesktop.exportDiagnosticBundle()");
  await waitForFile(smokeDiagnosticsPath, 20_000);
  const diagnostics = JSON.parse(await readFile(smokeDiagnosticsPath, "utf8"));
  if (!diagnostics.app || !diagnostics.workspace || !diagnostics.sqlite?.threads) {
    throw new Error("Packaged diagnostics did not include packaged app and SQLite sections.");
  }
}

async function runPackagedMediaSmoke(cdp) {
  const previews = await evaluate(
    cdp,
    `
    Promise.all([
      window.ambientDesktop.readWorkspaceFile("pixel.png"),
      window.ambientDesktop.readWorkspaceFile("sound.wav"),
      window.ambientDesktop.readWorkspaceFile("clip.webm")
    ]).then(([image, audio, video]) => ({
      image: { kind: image.kind, hasDataUrl: Boolean(image.dataUrl) },
      audio: { kind: audio.kind, mediaUrl: audio.mediaUrl, mimeType: audio.mimeType },
      video: { kind: video.kind, mediaUrl: video.mediaUrl, mimeType: video.mimeType }
    }))
  `,
  );
  if (previews.image.kind !== "image" || !previews.image.hasDataUrl) {
    throw new Error(`Packaged image preview failed: ${JSON.stringify(previews.image)}`);
  }
  if (previews.audio.kind !== "audio" || !previews.audio.mediaUrl?.startsWith("ambient-media://")) {
    throw new Error(`Packaged audio preview did not use ambient-media protocol: ${JSON.stringify(previews.audio)}`);
  }
  if (previews.video.kind !== "video" || !previews.video.mediaUrl?.startsWith("ambient-media://")) {
    throw new Error(`Packaged video preview did not use ambient-media protocol: ${JSON.stringify(previews.video)}`);
  }

  const mediaLoad = await evaluate(
    cdp,
    `
    (() => {
      const audioUrl = ${JSON.stringify(previews.audio.mediaUrl)};
      const videoUrl = ${JSON.stringify(previews.video.mediaUrl)};
      const waitForMedia = (tagName, src) => new Promise((resolve) => {
        const element = document.createElement(tagName);
        element.preload = "metadata";
        element.muted = true;
        element.src = src;
        element.addEventListener("loadedmetadata", () => resolve({ tagName, ok: true, readyState: element.readyState }), { once: true });
        element.addEventListener("error", () => resolve({ tagName, ok: false, code: element.error?.code, message: element.error?.message ?? "" }), { once: true });
        document.body.appendChild(element);
        setTimeout(() => resolve({ tagName, ok: false, timeout: true, readyState: element.readyState }), 10000);
      });
      return Promise.all([waitForMedia("audio", audioUrl), waitForMedia("video", videoUrl)]);
    })()
  `,
  );
  const failed = mediaLoad.find((result) => !result.ok);
  if (failed) throw new Error(`Packaged media element failed to load ambient-media URL: ${JSON.stringify(mediaLoad)}`);
}

async function seedMediaFixtures(root) {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "pixel.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ax8pWQAAAAASUVORK5CYII=", "base64"));
  await writeFile(join(root, "sound.wav"), wavFixtureBuffer());
  await writeFile(
    join(root, "clip.webm"),
    Buffer.from(
      "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAIUEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggH+7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjIuMy4xMDBXQYxMYXZmNjIuMy4xMDBEiYhAXgAAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WIk0hgEAEFKDKcgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QCYloA4JCwgRC6gRCagQJVsIRVuYEBElTDZ/tzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYyLjMuMTAwc3PWY8CLY8WIk0hgEAEFKDJnyKFFo4dFTkNPREVSRIeUTGF2YzYyLjExLjEwMCBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjEyMDAwMDAwMAAfQ7Z11ueBAKOjgQAAgBACAJ0BKhAAEAAARwiFhYiFhIgCAgAMDWAA/v+rUICjlYEAKACxAQAHEOwAGAAYWC/0AAgAAKOVgQBQALEBAAcQ7AAYABhYL/QACAAAHFO7a5G7j7OBALeK94EB8YIBo/CBAw==",
      "base64",
    ),
  );
}

function wavFixtureBuffer() {
  const sampleRate = 8000;
  const dataSize = sampleRate / 10;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  buffer.fill(128, 44);
  return buffer;
}

async function runRestartSmoke(cdp) {
  console.log("packaged smoke: restart bootstrap");
  const state = await desktopState(cdp);
  if (!state.app.isPackaged) throw new Error("Restarted app is not marked packaged.");
  if (state.threads.length < 1) throw new Error("Packaged restart did not preserve SQLite thread state.");
}

function packagedExecutablePath() {
  const candidates =
    process.platform === "darwin"
      ? [
          join(process.cwd(), "release", "mac-arm64", "Ambient Desktop.app", "Contents", "MacOS", "Ambient Desktop"),
          join(process.cwd(), "release", "mac", "Ambient Desktop.app", "Contents", "MacOS", "Ambient Desktop"),
          join(process.cwd(), "release", "mac-universal", "Ambient Desktop.app", "Contents", "MacOS", "Ambient Desktop"),
        ]
      : process.platform === "win32"
        ? [join(process.cwd(), "release", "win-unpacked", "Ambient Desktop.exe")]
        : [
            join(process.cwd(), "release", "linux-unpacked", "ambient-desktop"),
            join(process.cwd(), "release", "linux-unpacked", "ambient-codex-desktop"),
            join(process.cwd(), "release", "linux-unpacked", "Ambient Desktop"),
          ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`Packaged app not found. Run pnpm run pack first. Checked: ${candidates.map((item) => basename(item)).join(", ")}`);
  }
  return found;
}

async function emitMenuCommand(cdp, command) {
  await evaluate(
    cdp,
    `
    window.ambientDesktop.emitE2eEvent({
      type: "menu-command",
      command: ${JSON.stringify(command)}
    })
  `,
  );
}

function windowApiCheck(cdp) {
  return evaluate(
    cdp,
    `
    ({
      hasBootstrap: typeof window.ambientDesktop?.bootstrap === "function",
      hasTerminal: typeof window.ambientDesktop?.startTerminal === "function",
      hasDiagnostics: typeof window.ambientDesktop?.exportDiagnosticBundle === "function"
    })
  `,
  );
}

async function desktopState(cdp) {
  return evaluate(cdp, "window.ambientDesktop.bootstrap()");
}

async function waitForFile(path, maxMs) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${path}.`);
}

async function waitForThreadCount(cdp, previousCount) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const state = await desktopState(cdp);
    if (state.threads.length >= previousCount && state.activeThreadId) return;
    await delay(150);
  }
  throw new Error("Timed out waiting for packaged menu command to settle.");
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
  throw new Error("Timed out waiting for packaged Electron CDP target.");
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
  await runIgnoringFailure("pkill", ["-f", `remote-debugging-port=${port}`]);
}

async function waitForCdpPortClosed() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/json/list`);
      await delay(200);
    } catch {
      return;
    }
  }
}

function runIgnoringFailure(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", resolve);
    child.on("close", resolve);
  });
}

function outputTail() {
  return `Packaged Electron output tail:\n${output.join("").split("\n").slice(-160).join("\n")}\n`;
}
