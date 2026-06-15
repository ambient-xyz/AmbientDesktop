#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();
const scratchRoot = await mkdtemp(join(tmpdir(), "ambient-subagent-desktop-dogfood-"));
const workspacePath = join(scratchRoot, "workspace");
const userDataPath = join(scratchRoot, "userData");
const seedPath = join(scratchRoot, "seed.json");
const staleLatestArtifactPath = join(repoRoot, "test-results", "subagent-desktop-dogfood", "latest.json");
const untrackedRuntimeModelPath = join(scratchRoot, "manual-untracked-model.gguf");
const untrackedRuntimePort = 44222;

let exitCode = 0;
let untrackedRuntimeProcess;
let dogfoodEnv;

try {
  await rm(staleLatestArtifactPath, { force: true });
  await mkdir(workspacePath, { recursive: true });
  await mkdir(userDataPath, { recursive: true });
  untrackedRuntimeProcess = spawn(process.execPath, [
    "scripts/llama-server-placeholder.mjs",
    "--model",
    untrackedRuntimeModelPath,
    "--port",
    String(untrackedRuntimePort),
    "--ctx-size",
    "4096",
  ], {
    cwd: repoRoot,
    stdio: "ignore",
    env: cleanChildEnv({
      ...process.env,
      AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_PLACEHOLDER: "1",
    }),
  });
  dogfoodEnv = buildDogfoodEnv();
  await run("bash", ["scripts/test-node-native.sh", "src/main/subagentDesktopDogfoodSeed.test.ts"], dogfoodEnv);
  await run("pnpm", ["run", "prepare:electron-native"], dogfoodEnv);
  await run("pnpm", [
    "exec",
    "vitest",
    "run",
    "src/main/subagentDesktopDogfood.e2e.test.ts",
    ...process.argv.slice(2),
  ], dogfoodEnv);
  await run("node", [
    "scripts/subagent-desktop-dogfood-history-report.mjs",
    "--append-latest=test-results/subagent-desktop-dogfood/latest.json",
  ], dogfoodEnv);
} catch (error) {
  exitCode = 1;
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  try {
    await run("node", [
      "scripts/subagent-desktop-dogfood-history-report.mjs",
      "--append-latest-if-exists=test-results/subagent-desktop-dogfood/latest.json",
    ], dogfoodEnv);
  } catch (historyError) {
    process.stderr.write(`${historyError instanceof Error ? historyError.stack ?? historyError.message : String(historyError)}\n`);
  }
} finally {
  try {
    await run("pnpm", ["run", "prepare:node-native"], dogfoodEnv ?? buildDogfoodEnv());
  } catch (error) {
    exitCode = 1;
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  }
  await terminateChild(untrackedRuntimeProcess);
  if (process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_KEEP_SCRATCH !== "1") {
    await rm(scratchRoot, { recursive: true, force: true });
  } else {
    process.stdout.write(`Sub-agent Desktop dogfood scratch retained at ${scratchRoot}\n`);
  }
}

process.exit(exitCode);

function buildDogfoodEnv() {
  return cleanChildEnv({
    ...process.env,
    AMBIENT_PROVIDER: process.env.AMBIENT_PROVIDER || "gmi-cloud",
    AMBIENT_LEGACY_WORKFLOW_COMPILER: process.env.AMBIENT_LEGACY_WORKFLOW_COMPILER || "1",
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD: "1",
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_GIT_COMMIT: gitValue(["rev-parse", "HEAD"]),
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_GIT_BRANCH: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_WORKSPACE: workspacePath,
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_USER_DATA: userDataPath,
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_SEED: seedPath,
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_RUNTIME_PID: String(process.pid),
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_PID: untrackedRuntimeProcess?.pid ? String(untrackedRuntimeProcess.pid) : "",
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_ID: untrackedRuntimeProcess?.pid ? `untracked-llama:${untrackedRuntimeProcess.pid}` : "",
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_ENDPOINT: `http://127.0.0.1:${untrackedRuntimePort}`,
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_UNTRACKED_RUNTIME_MODEL: untrackedRuntimeModelPath,
    AMBIENT_DESKTOP_WORKSPACE: workspacePath,
    AMBIENT_E2E_USER_DATA: userDataPath,
  });
}

function gitValue(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

async function run(command, args, env) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env,
  });
  const [code, signal] = await once(child, "exit");
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${signal ?? code}.`);
  }
}

async function terminateChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  const timeout = new Promise((resolve) => setTimeout(resolve, 1_000));
  await Promise.race([once(child, "exit").catch(() => undefined), timeout]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

function cleanChildEnv(env) {
  const next = { ...env };
  delete next.NODE_OPTIONS;
  delete next.VITEST;
  return next;
}
