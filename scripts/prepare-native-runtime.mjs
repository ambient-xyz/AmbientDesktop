#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
export const NATIVE_RUNTIME_STATE_PATH = ".ambient/native-runtime-state.json";
export const NATIVE_RUNTIME_STATE_SCHEMA_VERSION = "ambient-native-runtime-state-v1";
const NATIVE_PACKAGES = ["better-sqlite3", "node-pty"];

export async function prepareNativeRuntime(options = {}) {
  const runtime = validateRuntime(options.runtime);
  const cwd = resolve(options.cwd ?? process.cwd());
  const startedAt = new Date().toISOString();
  const rebuild = runAndMirror(["node", ["scripts/rebuild-native-modules.mjs", `--runtime=${runtime}`]], cwd);
  if (rebuild.status !== 0) throw commandFailure("native rebuild", runtime, rebuild);
  const verifyScript = runtime === "electron" ? "scripts/verify-electron-native-modules.mjs" : "scripts/verify-node-native-modules.mjs";
  const verify = runAndMirror(["node", [verifyScript]], cwd);
  if (verify.status !== 0) throw commandFailure("native verification", runtime, verify);
  const completedAt = new Date().toISOString();
  const state = {
    schemaVersion: NATIVE_RUNTIME_STATE_SCHEMA_VERSION,
    runtime,
    status: "prepared",
    cwd,
    startedAt,
    completedAt,
    node: {
      version: process.version,
      abi: process.versions.modules,
      platform: process.platform,
      arch: process.arch,
      execPath: process.execPath,
    },
    electron: runtime === "electron"
      ? {
          version: require("electron/package.json").version,
          abi: abiFromOutput(verify.stdout, "Electron"),
        }
      : undefined,
    expectedAbi: runtime === "electron" ? abiFromOutput(verify.stdout, "Electron") : process.versions.modules,
    resolvedModules: resolveNativeModules(),
    verification: {
      stdout: verify.stdout.slice(-4000),
      stderr: verify.stderr.slice(-4000),
    },
  };
  await writeNativeRuntimeState(cwd, state);
  process.stdout.write(`Native runtime state wrote ${resolve(cwd, NATIVE_RUNTIME_STATE_PATH)}.\n`);
  return state;
}

export async function readNativeRuntimeState(cwd = process.cwd()) {
  return JSON.parse(await readFile(resolve(cwd, NATIVE_RUNTIME_STATE_PATH), "utf8"));
}

export async function writeNativeRuntimeState(cwd, state) {
  const statePath = resolve(cwd, NATIVE_RUNTIME_STATE_PATH);
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function runAndMirror([command, args], cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  return result;
}

function commandFailure(label, runtime, result) {
  const error = new Error(`${label} failed for ${runtime} runtime with exit code ${result.status}.`);
  error.stdout = result.stdout;
  error.stderr = result.stderr;
  error.exitCode = result.status;
  return error;
}

function resolveNativeModules() {
  return Object.fromEntries(NATIVE_PACKAGES.map((pkg) => {
    try {
      return [pkg, require.resolve(pkg)];
    } catch (error) {
      return [pkg, { error: error instanceof Error ? error.message : String(error) }];
    }
  }));
}

function abiFromOutput(output, runtimeLabel) {
  const match = output.match(new RegExp(`${runtimeLabel} ABI (\\d+)`, "i"));
  return match?.[1];
}

function validateRuntime(value) {
  if (value === "node" || value === "electron") return value;
  throw new Error("Usage: node scripts/prepare-native-runtime.mjs --runtime=node|electron");
}

function parseArgs(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--runtime") return { runtime: argv[++index] };
    if (arg.startsWith("--runtime=")) return { runtime: arg.slice("--runtime=".length) };
  }
  return { runtime: undefined };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await prepareNativeRuntime(parseArgs(process.argv.slice(2)));
}
