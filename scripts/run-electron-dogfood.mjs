#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { verifyHarnessCheckout } from "./verify-harness-checkout.mjs";
import { classifyHarnessFailure, writeHarnessManifest } from "./write-harness-manifest.mjs";

const repoRoot = process.cwd();
const args = parseArgs(process.argv.slice(2));
const manifestPath = resolve(args.manifestOut || process.env.AMBIENT_HARNESS_MANIFEST_OUT || "test-results/harness/electron-dogfood-latest.manifest.json");
const stdoutPath = manifestPath.replace(/\.manifest\.json$/i, ".stdout.txt").replace(/\.json$/i, ".stdout.txt");
const stderrPath = manifestPath.replace(/\.manifest\.json$/i, ".stderr.txt").replace(/\.json$/i, ".stderr.txt");
const DEFAULT_DOGFOOD_PROVIDER = "ambient";
const DEFAULT_DOGFOOD_MODEL = "moonshotai/kimi-k2.7-code";
const startedAt = new Date().toISOString();
let checkout;
let exitCode = 1;
let stdout = "";
let stderr = "";
let phase = "preflight";
let cdpPort;
let staleProcessPids = [];
let failure;
let launchEnv;

try {
  checkout = await verifyHarnessCheckout({ cwd: repoRoot });
  phase = "process_cleanup";
  staleProcessPids = staleElectronProcessPids(repoRoot);
  if (process.env.AMBIENT_HARNESS_SKIP_STALE_PROCESS_CLEANUP !== "1") {
    for (const pid of staleProcessPids) killProcess(pid);
  }
  phase = "launch";
  cdpPort = await getAvailablePort();
  const command = scenarioCommand(args.scenario, args.scenarioArgs);
  launchEnv = dogfoodLaunchEnv({
    ...process.env,
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT: String(cdpPort),
    AMBIENT_HARNESS_CDP_PORT: String(cdpPort),
    AMBIENT_HARNESS_HEADFUL: "1",
  });
  const result = await runCommand(command.executable, command.args, launchEnv);
  stdout = result.stdout;
  stderr = result.stderr;
  exitCode = result.exitCode;
  phase = "dogfood";
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error));
  stderr += `${failure.stack ?? failure.message}\n`;
} finally {
  await writeText(stdoutPath, stdout);
  await writeText(stderrPath, stderr);
  const completedAt = new Date().toISOString();
  const status = failure
    ? classifyHarnessFailure({ phase, stderr: failure.stack ?? failure.message, exitCode })
    : classifyHarnessFailure({ phase: "dogfood", stdout, stderr, exitCode });
  await writeHarnessManifest(manifestPath, {
    kind: "electron_dogfood",
    startedAt,
    completedAt,
    cwd: repoRoot,
    command: scenarioCommand(args.scenario, args.scenarioArgs).display,
    status,
    phase: failure ? phase : "dogfood",
    exitCode,
    summary: failure ? failure.message : undefined,
    checkout,
    provider: providerSnapshot(launchEnv ?? dogfoodLaunchEnv(process.env)),
    desktop: {
      headful: true,
      cdpPort,
      staleProcessCleanup: process.env.AMBIENT_HARNESS_SKIP_STALE_PROCESS_CLEANUP === "1" ? "skipped" : "attempted",
      staleProcessPids,
    },
    artifacts: [
      { label: "electron dogfood stdout", path: relativePath(stdoutPath), kind: "log" },
      { label: "electron dogfood stderr", path: relativePath(stderrPath), kind: "log" },
      { label: "desktop dogfood latest", path: scenarioLatestArtifactPath(args.scenario), kind: "json" },
    ],
    failures: failure ? [{ phase, message: failure.message }] : [],
  });
}

if (failure) {
  process.stderr.write(`${failure.stack ?? failure.message}\n`);
  process.exit(1);
}
process.exit(exitCode);

function parseArgs(argv) {
  const parsed = { scenario: "subagent-desktop-dogfood", manifestOut: undefined, scenarioArgs: [] };
  const separator = argv.indexOf("--");
  const runnerArgs = separator >= 0 ? argv.slice(0, separator) : argv;
  parsed.scenarioArgs = separator >= 0 ? argv.slice(separator + 1) : [];
  for (let index = 0; index < runnerArgs.length; index += 1) {
    const arg = runnerArgs[index];
    if (arg === "--scenario") parsed.scenario = runnerArgs[++index];
    else if (arg.startsWith("--scenario=")) parsed.scenario = arg.slice("--scenario=".length);
    else if (arg.startsWith("--manifest-out=")) parsed.manifestOut = arg.slice("--manifest-out=".length);
    else throw new Error(`Unknown Electron dogfood harness argument: ${arg}`);
  }
  return parsed;
}

function scenarioCommand(scenario, scenarioArgs = []) {
  if (scenario === "agent-memory-ux-modes") {
    return {
      executable: "node",
      args: ["scripts/agent-memory-ux-modes-dogfood.mjs", ...scenarioArgs],
      display: ["node", "scripts/agent-memory-ux-modes-dogfood.mjs", ...scenarioArgs],
    };
  }
  if (scenario === "agent-memory-repair-resident-conflict") {
    return {
      executable: "node",
      args: ["scripts/agent-memory-repair-resident-conflict-dogfood.mjs", ...scenarioArgs],
      display: ["node", "scripts/agent-memory-repair-resident-conflict-dogfood.mjs", ...scenarioArgs],
    };
  }
  if (scenario === "symphony-gap-phase0") {
    return {
      executable: "node",
      args: ["scripts/symphony-gap-phase0-dogfood.mjs", ...scenarioArgs],
      display: ["node", "scripts/symphony-gap-phase0-dogfood.mjs", ...scenarioArgs],
    };
  }
  if (scenario === "symphony-gap-phase1") {
    return {
      executable: "node",
      args: ["scripts/symphony-gap-phase1-dogfood.mjs", ...scenarioArgs],
      display: ["node", "scripts/symphony-gap-phase1-dogfood.mjs", ...scenarioArgs],
    };
  }
  if (scenario === "symphony-gap-phase2") {
    return {
      executable: "node",
      args: ["scripts/symphony-gap-phase2-dogfood.mjs", ...scenarioArgs],
      display: ["node", "scripts/symphony-gap-phase2-dogfood.mjs", ...scenarioArgs],
    };
  }
  if (scenario === "symphony-gap-phase3") {
    return {
      executable: "node",
      args: ["scripts/symphony-gap-phase3-dogfood.mjs", ...scenarioArgs],
      display: ["node", "scripts/symphony-gap-phase3-dogfood.mjs", ...scenarioArgs],
    };
  }
  if (scenario === "symphony-gap-phase4") {
    return {
      executable: "node",
      args: ["scripts/symphony-gap-phase4-dogfood.mjs", ...scenarioArgs],
      display: ["node", "scripts/symphony-gap-phase4-dogfood.mjs", ...scenarioArgs],
    };
  }
  if (scenario === "large-context-blowup") {
    return {
      executable: "node",
      args: ["scripts/large-context-blowup-dogfood.mjs", ...scenarioArgs],
      display: ["node", "scripts/large-context-blowup-dogfood.mjs", ...scenarioArgs],
    };
  }
  if (scenario !== "subagent-desktop-dogfood") throw new Error(`Unsupported Electron dogfood scenario: ${scenario}`);
  return {
    executable: "node",
    args: ["scripts/subagent-desktop-dogfood.mjs", ...scenarioArgs],
    display: ["node", "scripts/subagent-desktop-dogfood.mjs", ...scenarioArgs],
  };
}

function scenarioLatestArtifactPath(scenario) {
  if (scenario === "agent-memory-ux-modes") {
    return "test-results/agent-memory-ux-modes/latest.json";
  }
  if (scenario === "agent-memory-repair-resident-conflict") {
    return "test-results/agent-memory-repair-resident-conflict/latest.json";
  }
  if (scenario === "symphony-gap-phase0") {
    return "test-results/symphony-gap-phase0-dogfood/latest.json";
  }
  if (scenario === "symphony-gap-phase1") return "test-results/symphony-gap-phase1-dogfood/latest.json";
  if (scenario === "symphony-gap-phase2") return "test-results/symphony-gap-phase2-dogfood/latest.json";
  if (scenario === "symphony-gap-phase3") return "test-results/symphony-gap-phase3-dogfood/latest.json";
  if (scenario === "symphony-gap-phase4") return "test-results/symphony-gap-phase4-dogfood/latest.json";
  if (scenario === "large-context-blowup") return "test-results/large-context-blowup/latest.json";
  return "test-results/subagent-desktop-dogfood/latest.json";
}

async function runCommand(executable, commandArgs, env) {
  const child = spawn(executable, commandArgs, {
    cwd: repoRoot,
    env: cleanChildEnv(env),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let childStdout = "";
  let childStderr = "";
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    childStdout += text;
    process.stdout.write(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    childStderr += text;
    process.stderr.write(text);
  });
  const [code, signal] = await once(child, "exit");
  return { exitCode: code ?? (signal ? 1 : 0), stdout: childStdout, stderr: childStderr };
}

async function getAvailablePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a local CDP port.");
  const port = address.port;
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
  return port;
}

function staleElectronProcessPids(root) {
  if (process.platform === "win32") return [];
  const result = spawnSync("ps", ["-axo", "pid=,command="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      return match ? { pid: Number(match[1]), command: match[2] } : undefined;
    })
    .filter(Boolean)
    .filter((row) => row.pid !== process.pid && row.command.includes(root) && /electron-vite|Electron|Ambient Desktop/i.test(row.command))
    .map((row) => row.pid);
}

function killProcess(pid) {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Best effort stale-process cleanup.
  }
}

async function writeText(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

function providerSnapshot(env) {
  const providerId = env.AMBIENT_PROVIDER || DEFAULT_DOGFOOD_PROVIDER;
  return {
    providerId,
    modelId: dogfoodModelIdForProvider(env, providerId),
    usingGmiFailover: env.AMBIENT_PROVIDER === "gmi-cloud",
  };
}

function dogfoodLaunchEnv(env) {
  const providerId = env.AMBIENT_PROVIDER || DEFAULT_DOGFOOD_PROVIDER;
  const modelId = dogfoodModelIdForProvider(env, providerId) || DEFAULT_DOGFOOD_MODEL;
  const next = { ...env, AMBIENT_PROVIDER: providerId };
  if (providerId === "gmi-cloud") {
    next.GMI_CLOUD_MODEL = modelId;
  } else {
    next.AMBIENT_LIVE_MODEL = modelId;
  }
  return next;
}

function dogfoodModelIdForProvider(env, providerId) {
  return providerId === "gmi-cloud"
    ? env.GMI_CLOUD_MODEL || env.AMBIENT_MODEL
    : env.AMBIENT_LIVE_MODEL || env.AMBIENT_MODEL;
}

function cleanChildEnv(env) {
  const next = { ...env };
  delete next.NODE_OPTIONS;
  delete next.VITEST;
  return next;
}

function relativePath(path) {
  const absolute = resolve(path);
  return absolute.startsWith(`${repoRoot}/`) ? absolute.slice(repoRoot.length + 1) : absolute;
}
