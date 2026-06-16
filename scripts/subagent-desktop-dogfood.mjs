#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
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
let braveSearchSeeded = false;

try {
  await rm(staleLatestArtifactPath, { force: true });
  await mkdir(workspacePath, { recursive: true });
  await mkdir(userDataPath, { recursive: true });
  braveSearchSeeded = await seedBraveSearchWorkspaceSecret();
  await seedBraveSearchPreference({ enabled: braveSearchSeeded });
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
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_BRAVE_SEARCH: braveSearchSeeded ? "1" : "0",
    AMBIENT_DESKTOP_WORKSPACE: workspacePath,
    AMBIENT_E2E_USER_DATA: userDataPath,
  });
}

async function seedBraveSearchWorkspaceSecret() {
  const sourcePath = await firstExistingFile(braveSearchKeyCandidates());
  if (!sourcePath) return false;
  const workspaceKeyPath = join(workspacePath, "brave_api_key.txt");
  await copyFile(sourcePath, workspaceKeyPath);
  await chmod(workspaceKeyPath, 0o600);
  const bindingsPath = join(workspacePath, ".ambient", "cli-packages", "env-bindings.json");
  await mkdir(join(workspacePath, ".ambient", "cli-packages"), { recursive: true });
  const existing = await readJsonIfExists(bindingsPath);
  const bindings = Array.isArray(existing?.bindings) ? existing.bindings : [];
  const nextBindings = [
    ...bindings.filter((binding) => binding?.envName !== "BRAVE_API_KEY" || !["brave-search", "ambient-brave-search"].includes(binding?.packageName)),
    { packageName: "brave-search", envName: "BRAVE_API_KEY", filePath: "./brave_api_key.txt" },
    { packageName: "ambient-brave-search", envName: "BRAVE_API_KEY", filePath: "./brave_api_key.txt" },
  ];
  await writeFile(bindingsPath, `${JSON.stringify({ bindings: nextBindings }, null, 2)}\n`, "utf8");
  return true;
}

async function seedBraveSearchPreference({ enabled }) {
  const preferencesPath = join(userDataPath, "preferences.json");
  const existing = await readJsonIfExists(preferencesPath);
  const searchProviders = [
    {
      providerId: "brave-search",
      label: "Brave Search",
      kind: "ambient-cli",
      roles: ["search"],
      status: enabled ? "enabled" : "disabled",
      optionalSecretRefs: ["BRAVE_API_KEY"],
      privacyLabel: "Queries may be sent to Brave Search.",
      ambientCli: {
        packageId: "ambient-cli:brave-search",
        packageName: "brave-search",
        commandName: "search",
        capabilityId: "ambient-cli:brave-search:tool:search",
      },
    },
    {
      providerId: "exa-mcp-default",
      label: "Exa Search",
      kind: "remote-mcp",
      roles: ["search", "fetch"],
      status: "enabled",
      optionalSecretRefs: ["EXA_API_KEY"],
      privacyLabel: "Queries and fetched public URLs may be sent to Exa.",
    },
    {
      providerId: "scrapling-mcp-default",
      label: "Scrapling",
      kind: "toolhive-mcp",
      roles: ["fetch"],
      status: "enabled",
      privacyLabel: "Public pages are fetched through the local ToolHive-isolated Scrapling workload.",
    },
    {
      providerId: "ambient-browser",
      label: "Ambient Browser",
      kind: "built-in-browser",
      roles: ["search", "fetch", "interactive_browser"],
      status: "enabled",
      privacyLabel: "Browser fallback uses Ambient's managed browser session and may need user-visible interaction.",
    },
  ];
  const preferences = {
    search: ["brave-search", "exa-mcp-default", "ambient-browser"],
    fetch: ["scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
    interactive_browser: ["ambient-browser"],
  };
  await writeFile(preferencesPath, `${JSON.stringify({
    ...(existing ?? {}),
    search: {
      webResearch: {
        schemaVersion: "ambient-web-research-provider-stack-v1",
        providers: searchProviders,
        preferences,
        fallbackPolicy: { allowBrowserFallback: true },
        updatedAt: new Date().toISOString(),
      },
    },
  }, null, 2)}\n`, "utf8");
}

function braveSearchKeyCandidates() {
  return [
    process.env.BRAVE_API_KEY_FILE,
    join(repoRoot, "brave_api_key.txt"),
    join(homedir(), "brave_api_key.txt"),
    join(homedir(), "Documents", "brave_api_key.txt"),
    join(homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs", "brave_api_key.txt"),
  ].filter((value) => typeof value === "string" && value.trim());
}

async function firstExistingFile(paths) {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next known secret file location.
    }
  }
  return undefined;
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
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
