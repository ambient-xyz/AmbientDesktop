#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(import.meta.url);
const childFlag = "--verify-child";

if (process.argv.includes(childFlag)) {
  verifyInElectronProcess();
} else {
  runElectronVerification(parseArgs(process.argv.slice(2)));
}

function parseArgs(args) {
  const options = {
    packaged: false,
    outputDir: "release",
    app: undefined,
    executable: undefined,
    resources: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--packaged") {
      options.packaged = true;
    } else if (arg === "--output-dir") {
      options.outputDir = args[++index];
    } else if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length);
    } else if (arg === "--app") {
      options.app = args[++index];
      options.packaged = true;
    } else if (arg.startsWith("--app=")) {
      options.app = arg.slice("--app=".length);
      options.packaged = true;
    } else if (arg === "--executable") {
      options.executable = args[++index];
      options.packaged = true;
    } else if (arg.startsWith("--executable=")) {
      options.executable = arg.slice("--executable=".length);
      options.packaged = true;
    } else if (arg === "--resources") {
      options.resources = args[++index];
      options.packaged = true;
    } else if (arg.startsWith("--resources=")) {
      options.resources = arg.slice("--resources=".length);
      options.packaged = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function runElectronVerification(options) {
  const target = options.packaged ? resolvePackagedTarget(options) : resolveWorkspaceTarget();
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    AMBIENT_NATIVE_VERIFY_RESOURCES: target.resources ?? "",
  };
  const result = spawnSync(target.executable, [scriptPath, childFlag], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

function resolveWorkspaceTarget() {
  return { executable: require("electron") };
}

function resolvePackagedTarget(options) {
  if (options.executable) {
    return {
      executable: resolve(options.executable),
      resources: options.resources ? resolve(options.resources) : inferResourcesPath(resolve(options.executable)),
    };
  }

  const appPath = options.app ? resolve(options.app) : findPackagedApp(resolve(options.outputDir));
  if (process.platform === "darwin" || appPath.endsWith(".app")) {
    const executable = findMacAppExecutable(appPath);
    return {
      executable,
      resources: join(appPath, "Contents", "Resources"),
    };
  }

  return {
    executable: appPath,
    resources: options.resources ? resolve(options.resources) : inferResourcesPath(appPath),
  };
}

function findPackagedApp(outputDir) {
  const candidates =
    process.platform === "darwin"
      ? [
          join(outputDir, "mac-arm64", "Ambient Desktop.app"),
          join(outputDir, "mac", "Ambient Desktop.app"),
          join(outputDir, "mac-universal", "Ambient Desktop.app"),
        ]
      : process.platform === "win32"
        ? [join(outputDir, "win-unpacked", "Ambient Desktop.exe")]
        : [
            join(outputDir, "linux-unpacked", "ambient-desktop"),
            join(outputDir, "linux-unpacked", "ambient-codex-desktop"),
            join(outputDir, "linux-unpacked", "Ambient Desktop"),
          ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Packaged app not found in ${outputDir}. Checked: ${candidates.join(", ")}`);
  return found;
}

function findMacAppExecutable(appPath) {
  const executableDir = join(appPath, "Contents", "MacOS");
  const executableName = basename(appPath, ".app");
  const preferred = join(executableDir, executableName);
  if (existsSync(preferred)) return preferred;

  const found = readdirSync(executableDir)
    .map((entry) => join(executableDir, entry))
    .find((entry) => statSync(entry).isFile());
  if (!found) throw new Error(`No executable found in ${executableDir}`);
  return found;
}

function inferResourcesPath(executable) {
  if (process.platform === "darwin" && executable.includes(".app/Contents/MacOS/")) {
    return join(executable.slice(0, executable.indexOf(".app/Contents/MacOS/") + ".app".length), "Contents", "Resources");
  }
  return join(dirname(executable), "resources");
}

function verifyInElectronProcess() {
  const resources = process.env.AMBIENT_NATIVE_VERIFY_RESOURCES || "";
  const appRequire = resources ? packagedAppRequire(resources) : workspaceAppRequire();
  const checks = nativeChecks(appRequire);
  const failures = [];

  for (const check of checks) {
    try {
      check.load();
      console.log(`native module ok: ${check.name}`);
    } catch (error) {
      failures.push(`${check.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    console.error(`Native module verification failed for Electron ABI ${process.versions.modules}:`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(`Native module verification passed for Electron ABI ${process.versions.modules}.`);
  process.exit(0);
}

function workspaceAppRequire() {
  return createRequire(join(process.cwd(), "package.json"));
}

function packagedAppRequire(resources) {
  const appAsar = join(resources, "app.asar");
  const appDir = join(resources, "app");
  if (existsSync(appAsar)) return createRequire(join(appAsar, "package.json"));
  if (existsSync(appDir)) return createRequire(join(appDir, "package.json"));
  throw new Error(`Packaged app payload not found in ${resources}`);
}

function nativeChecks(appRequire) {
  return [
    {
      name: "better-sqlite3",
      load: () => {
        const Database = appRequire("better-sqlite3");
        const db = new Database(":memory:");
        db.prepare("select 1 as ok").get();
        db.close();
      },
    },
    {
      name: "node-pty",
      load: () => {
        appRequire("node-pty");
      },
    },
  ];
}
