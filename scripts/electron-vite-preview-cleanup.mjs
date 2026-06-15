#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rawArgs = process.argv.slice(2);
const previewArgs = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const cdpPorts = remoteDebuggingPorts(previewArgs);
const launchMetadata = previewLaunchMetadata(previewArgs);

await preflightCdpPorts(cdpPorts, launchMetadata);

const child = spawn("pnpm", [
  "exec",
  "electron-vite",
  "preview",
  ...(previewArgs.length ? ["--", ...previewArgs] : []),
], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  detached: process.platform !== "win32",
});

await writePreviewLocks(cdpPorts, {
  ...launchMetadata,
  wrapperPid: process.pid,
  childPid: child.pid,
  createdAt: new Date().toISOString(),
});

let childExited = false;
let stopping = false;

child.on("exit", async (code, signal) => {
  childExited = true;
  await cleanupCdpPorts(cdpPorts);
  await removePreviewLocks(cdpPorts);
  if (stopping && signal) process.exit(signalExitCode(signal));
  process.exit(code ?? (signal ? signalExitCode(signal) : 0));
});

child.on("error", async (error) => {
  await cleanupCdpPorts(cdpPorts);
  await removePreviewLocks(cdpPorts);
  console.error(error);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    void stop(signal);
  });
}

async function stop(signal) {
  if (stopping) return;
  stopping = true;
  signalChild(signal);
  await delay(1500);
  if (!childExited) signalChild("SIGKILL");
  await cleanupCdpPorts(cdpPorts);
  await removePreviewLocks(cdpPorts);
  process.exit(signalExitCode(signal));
}

function signalChild(signal) {
  if (!child.pid) return;
  try {
    if (process.platform !== "win32") {
      process.kill(-child.pid, signal);
      return;
    }
  } catch {
    // Fall through to direct child signaling.
  }
  try {
    child.kill(signal);
  } catch {
    // Process already exited.
  }
}

function remoteDebuggingPorts(args) {
  const ports = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const equalsMatch = arg.match(/^--remote(?:-debugging-port|DebuggingPort)=(\d+)$/);
    if (equalsMatch) ports.add(equalsMatch[1]);
    if ((arg === "--remote-debugging-port" || arg === "--remoteDebuggingPort") && /^\d+$/.test(args[index + 1] ?? "")) {
      ports.add(args[index + 1]);
    }
  }
  for (const port of String(process.env.AMBIENT_ELECTRON_PREVIEW_CLEANUP_CDP_PORTS ?? "").split(",")) {
    const trimmed = port.trim();
    if (/^\d+$/.test(trimmed)) ports.add(trimmed);
  }
  return [...ports];
}

async function cleanupCdpPorts(ports) {
  if (!ports.length || process.platform === "win32") return;
  for (const port of ports) {
    const pids = await listenerPidsForPort(port);
    for (const pid of pids) {
      await terminatePid(pid);
    }
  }
}

async function preflightCdpPorts(ports, metadata) {
  if (!ports.length || process.platform === "win32") return;
  for (const port of ports) {
    const pids = await listenerPidsForPort(port);
    if (!pids.length) {
      await rm(previewLockPath(port), { force: true }).catch(() => undefined);
      continue;
    }
    const existing = await readPreviewLock(port);
    const mismatches = previewLockMismatches(existing, metadata);
    const reason = existing
      ? mismatches.length
        ? `stale or mismatched preview lock (${mismatches.join(", ")})`
        : "existing preview lock for this launch surface"
      : "untracked CDP listener";
    console.error(`[ambient-preview] Port ${port} is already in use by PID(s) ${pids.join(", ")}; terminating ${reason} before launch.`);
    for (const pid of pids) {
      await terminatePid(pid);
    }
    await rm(previewLockPath(port), { force: true }).catch(() => undefined);
  }
}

async function listenerPidsForPort(port) {
  try {
    const { stdout } = await execFileAsync("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"], { timeout: 2000 });
    return stdout
      .split(/\s+/)
      .map((value) => Number(value))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  } catch {
    return [];
  }
}

function previewLaunchMetadata(args) {
  return {
    version: 1,
    cwd: process.cwd(),
    provider: process.env.AMBIENT_PROVIDER || "ambient",
    workspace: process.env.AMBIENT_DESKTOP_WORKSPACE || "",
    userData: process.env.AMBIENT_E2E_USER_DATA || "",
    argv: args,
  };
}

function previewLockMismatches(existing, metadata) {
  if (!existing) return ["missing-lock"];
  const mismatches = [];
  for (const key of ["cwd", "provider", "workspace", "userData"]) {
    if ((existing[key] ?? "") !== (metadata[key] ?? "")) mismatches.push(key);
  }
  return mismatches;
}

async function writePreviewLocks(ports, metadata) {
  if (!ports.length) return;
  await mkdir(previewLockDir(), { recursive: true });
  await Promise.all(ports.map((port) => writeFile(previewLockPath(port), JSON.stringify({ ...metadata, cdpPort: port }, null, 2), "utf8")));
}

async function readPreviewLock(port) {
  try {
    return JSON.parse(await readFile(previewLockPath(port), "utf8"));
  } catch {
    return undefined;
  }
}

async function removePreviewLocks(ports) {
  await Promise.all(ports.map((port) => rm(previewLockPath(port), { force: true }).catch(() => undefined)));
}

function previewLockDir() {
  return join(process.cwd(), ".ambient-codex", "preview-locks");
}

function previewLockPath(port) {
  return join(previewLockDir(), `cdp-${port}.json`);
}

async function terminatePid(pid) {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  await delay(500);
  try {
    process.kill(pid, 0);
  } catch {
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Process already exited.
  }
}

function signalExitCode(signal) {
  const numbers = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };
  return 128 + (numbers[signal] ?? 1);
}
