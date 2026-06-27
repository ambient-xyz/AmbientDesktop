#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = process.cwd();
const scratchRoot = await mkdtemp(join(tmpdir(), "ambient-symphony-gap-phase0-"));
const workspacePath = join(scratchRoot, "workspace");
const userDataPath = join(scratchRoot, "userData");
const staleLatestArtifactPath = join(repoRoot, "test-results", "symphony-gap-phase0-dogfood", "latest.json");
const DEFAULT_DOGFOOD_PROVIDER = "ambient";
const DEFAULT_DOGFOOD_MODEL = "example/model-id";

let exitCode = 0;
let dogfoodEnv;

try {
  await rm(staleLatestArtifactPath, { force: true });
  await mkdir(workspacePath, { recursive: true });
  await mkdir(userDataPath, { recursive: true });
  dogfoodEnv = buildDogfoodEnv();
  await run("pnpm", ["run", "prepare:electron-native"], dogfoodEnv);
  await run("pnpm", [
    "exec",
    "vitest",
    "run",
    "src/main/agent-runtime/symphonyModeStateDesktopDogfood.e2e.test.ts",
    ...process.argv.slice(2),
  ], dogfoodEnv);
} catch (error) {
  exitCode = 1;
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
} finally {
  try {
    await run("pnpm", ["run", "prepare:node-native"], dogfoodEnv ?? buildDogfoodEnv());
  } catch (error) {
    exitCode = 1;
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  }
  if (process.env.AMBIENT_SYMPHONY_GAP_PHASE0_KEEP_SCRATCH !== "1") {
    await rm(scratchRoot, { recursive: true, force: true });
  } else {
    process.stdout.write(`Symphony gap Phase 0 dogfood scratch retained at ${scratchRoot}\n`);
  }
}

process.exit(exitCode);

function buildDogfoodEnv() {
  return cleanChildEnv({
    ...process.env,
    ...dogfoodProviderEnv(process.env),
    AMBIENT_SYMPHONY_GAP_PHASE0_DOGFOOD: "1",
    AMBIENT_SYMPHONY_GAP_PHASE0_GIT_COMMIT: gitValue(["rev-parse", "HEAD"]),
    AMBIENT_SYMPHONY_GAP_PHASE0_GIT_BRANCH: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
    AMBIENT_SYMPHONY_GAP_PHASE0_WORKSPACE: workspacePath,
    AMBIENT_SYMPHONY_GAP_PHASE0_USER_DATA: userDataPath,
    AMBIENT_DESKTOP_WORKSPACE: workspacePath,
    AMBIENT_E2E_USER_DATA: userDataPath,
  });
}

function dogfoodProviderEnv(env) {
  const providerId = env.AMBIENT_PROVIDER || DEFAULT_DOGFOOD_PROVIDER;
  const modelId = env.AMBIENT_LIVE_MODEL || env.GMI_CLOUD_MODEL || env.AMBIENT_MODEL || DEFAULT_DOGFOOD_MODEL;
  return providerId === "gmi-cloud"
    ? { AMBIENT_PROVIDER: providerId, GMI_CLOUD_MODEL: modelId }
    : { AMBIENT_PROVIDER: providerId, AMBIENT_LIVE_MODEL: modelId };
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

function cleanChildEnv(env) {
  const next = { ...env };
  delete next.NODE_OPTIONS;
  delete next.VITEST;
  return next;
}
