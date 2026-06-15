#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { acquireNativeRebuildLock, nativeRebuildLockDir } from "./native-rebuild-lock-lib.mjs";

const require = createRequire(import.meta.url);
const nativePackages = ["better-sqlite3", "node-pty"];
const runtime = parseRuntime(process.argv.slice(2));
const env = rebuildEnv(process.env);
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const electronVersion = runtime === "electron" ? require("electron/package.json").version : undefined;

console.log(`Rebuilding native modules for ${runtime} runtime.`);
console.log(`- host node: ${process.version} ABI ${process.versions.modules} ${process.platform}/${process.arch}`);
if (electronVersion) console.log(`- electron: v${electronVersion}`);
if (env.PYTHON) console.log(`- python: ${env.PYTHON}`);

const lock = await acquireNativeRebuildLock({
  lockDir: nativeRebuildLockDir(process.cwd(), process.env),
  owner: {
    runtime,
    command: `node scripts/rebuild-native-modules.mjs --runtime=${runtime}`,
  },
  log: (message) => console.log(message),
});

const command =
  runtime === "electron"
    ? [pnpmCommand, ["exec", "electron-rebuild", "-f", "-v", electronVersion, ...nativePackages.flatMap((pkg) => ["-w", pkg])]]
    : [pnpmCommand, ["rebuild", ...nativePackages]];

let result;
try {
  result = spawnSync(command[0], command[1], {
    cwd: process.cwd(),
    env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
} finally {
  await lock.release();
}

if (result.error) throw result.error;
process.exit(result.status ?? 1);

function parseRuntime(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--runtime") return validateRuntime(args[++index]);
    if (arg.startsWith("--runtime=")) return validateRuntime(arg.slice("--runtime=".length));
  }
  throw new Error("Usage: node scripts/rebuild-native-modules.mjs --runtime=node|electron");
}

function validateRuntime(value) {
  if (value === "node" || value === "electron") return value;
  throw new Error(`Unsupported native rebuild runtime: ${value}`);
}

function rebuildEnv(baseEnv) {
  const env = { ...baseEnv };
  const python = env.PYTHON || env.npm_config_python || firstExistingPath(pythonCandidates());
  if (python) {
    env.PYTHON = python;
    env.npm_config_python = python;
  }
  return env;
}

function pythonCandidates() {
  if (process.platform === "darwin") {
    return ["/usr/bin/python3", "/opt/homebrew/bin/python3", "/usr/local/bin/python3"];
  }
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    return [
      process.env.PYTHON,
      localAppData ? `${localAppData}\\Programs\\Python\\Python312\\python.exe` : undefined,
      localAppData ? `${localAppData}\\Programs\\Python\\Python311\\python.exe` : undefined,
      "C:\\Python312\\python.exe",
      "C:\\Python311\\python.exe",
    ].filter(Boolean);
  }
  return ["/usr/bin/python3", "/usr/local/bin/python3"];
}

function firstExistingPath(paths) {
  return paths.find((path) => existsSync(path));
}
