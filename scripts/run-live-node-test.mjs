#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { verifyHarnessCheckout } from "./verify-harness-checkout.mjs";
import { readNativeRuntimeState } from "./prepare-native-runtime.mjs";
import { classifyHarnessFailure, writeHarnessManifest } from "./write-harness-manifest.mjs";

const repoRoot = process.cwd();
const args = parseArgs(process.argv.slice(2));
const startedAt = new Date().toISOString();
const manifestPath = resolve(args.manifestOut || process.env.AMBIENT_HARNESS_MANIFEST_OUT || "test-results/harness/live-node-latest.manifest.json");
const stdoutPath = manifestPath.replace(/\.manifest\.json$/i, ".stdout.txt").replace(/\.json$/i, ".stdout.txt");
const stderrPath = manifestPath.replace(/\.manifest\.json$/i, ".stderr.txt").replace(/\.json$/i, ".stderr.txt");
const command = normalizeCommand(args.command);
let checkout;
let nativeRuntime;
let exitCode = 1;
let phase = "preflight";
let stdout = "";
let stderr = "";
let failure;

try {
  checkout = await verifyHarnessCheckout({ cwd: repoRoot });
  phase = "native";
  await runCommand("node", ["scripts/prepare-native-runtime.mjs", "--runtime=node"], { inherit: true });
  nativeRuntime = await readNativeRuntimeState(repoRoot);
  if (nativeRuntime.runtime !== "node") throw new Error(`Native runtime state is ${nativeRuntime.runtime}; expected node.`);
  if (nativeRuntime.expectedAbi !== process.versions.modules) {
    throw new Error(`Native runtime ABI is ${nativeRuntime.expectedAbi}; expected Node ABI ${process.versions.modules}.`);
  }
  phase = "test";
  const result = await runCommand(command.executable, command.args, { inherit: true, capture: true });
  stdout = result.stdout;
  stderr = result.stderr;
  exitCode = result.exitCode;
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error));
  stderr += `${failure.stack ?? failure.message}\n`;
} finally {
  await writeText(stdoutPath, stdout);
  await writeText(stderrPath, stderr);
  const completedAt = new Date().toISOString();
  const status = failure
    ? classifyHarnessFailure({ phase, stderr: failure.stack ?? failure.message, exitCode })
    : classifyHarnessFailure({ phase, stdout, stderr, exitCode });
  await writeHarnessManifest(manifestPath, {
    kind: "live_node_test",
    startedAt,
    completedAt,
    cwd: repoRoot,
    command: [command.executable, ...command.args],
    status,
    phase,
    exitCode,
    summary: failure ? failure.message : undefined,
    checkout,
    nativeRuntime,
    provider: providerSnapshot(process.env),
    artifacts: [
      { label: "live node stdout", path: relativePath(stdoutPath), kind: "log" },
      { label: "live node stderr", path: relativePath(stderrPath), kind: "log" },
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
  const separator = argv.indexOf("--");
  const runnerArgs = separator >= 0 ? argv.slice(0, separator) : [];
  const command = separator >= 0 ? argv.slice(separator + 1) : argv;
  const parsed = { manifestOut: undefined, command };
  for (const arg of runnerArgs) {
    if (arg.startsWith("--manifest-out=")) parsed.manifestOut = arg.slice("--manifest-out=".length);
    else throw new Error(`Unknown live Node harness argument: ${arg}`);
  }
  return parsed;
}

function normalizeCommand(commandArgs) {
  if (!commandArgs.length) throw new Error("Usage: node scripts/run-live-node-test.mjs -- vitest run <files...>");
  if (commandArgs[0] === "vitest") return { executable: "pnpm", args: ["exec", ...commandArgs] };
  if (commandArgs[0] === "pnpm" && commandArgs[1] === "exec") return { executable: "pnpm", args: commandArgs.slice(1) };
  return { executable: commandArgs[0], args: commandArgs.slice(1) };
}

async function runCommand(executable, commandArgs, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(executable, commandArgs, {
      cwd: repoRoot,
      env: cleanChildEnv(process.env),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let childStdout = "";
    let childStderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      childStdout += text;
      if (options.inherit) process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      childStderr += text;
      if (options.inherit) process.stderr.write(text);
    });
    child.on("error", rejectRun);
    child.on("close", (code, signal) => {
      const exit = code ?? (signal ? 1 : 0);
      if (!options.capture && exit !== 0) {
        const error = new Error(`${executable} ${commandArgs.join(" ")} failed with ${signal ?? exit}.`);
        error.stdout = childStdout;
        error.stderr = childStderr;
        error.exitCode = exit;
        rejectRun(error);
        return;
      }
      resolveRun({ exitCode: exit, stdout: childStdout, stderr: childStderr });
    });
  });
}

async function writeText(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

function providerSnapshot(env) {
  return {
    providerId: env.AMBIENT_PROVIDER || "ambient",
    modelId: env.AMBIENT_LIVE_MODEL || env.GMI_CLOUD_MODEL || env.AMBIENT_MODEL,
    usingGmiFailover: env.AMBIENT_PROVIDER === "gmi-cloud",
  };
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
