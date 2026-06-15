#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { arch as osArch, platform as osPlatform } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const childFlag = "--runtime-architecture-child";
const jsonStart = "__AMBIENT_RUNTIME_ARCHITECTURE_JSON_START__";
const jsonEnd = "__AMBIENT_RUNTIME_ARCHITECTURE_JSON_END__";

export function parseRuntimeArchitectureArgs(args) {
  const options = {
    packaged: false,
    outputDir: "release",
    app: undefined,
    executable: undefined,
    resources: undefined,
    expectedPlatform: "current",
    expectedArch: "current",
    json: false,
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
    } else if (arg === "--expected-platform") {
      options.expectedPlatform = args[++index];
    } else if (arg.startsWith("--expected-platform=")) {
      options.expectedPlatform = arg.slice("--expected-platform=".length);
    } else if (arg === "--expected-arch") {
      options.expectedArch = args[++index];
    } else if (arg.startsWith("--expected-arch=")) {
      options.expectedArch = arg.slice("--expected-arch=".length);
    } else if (arg === "--json") {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function normalizePlatform(value) {
  const raw = String(value || "").toLowerCase();
  if (!raw || raw === "current") return osPlatform();
  if (raw === "mac" || raw === "macos" || raw === "darwin") return "darwin";
  if (raw === "windows" || raw === "win" || raw === "win32") return "win32";
  if (raw === "linux") return "linux";
  return raw;
}

export function normalizeArch(value) {
  const raw = String(value || "").toLowerCase();
  if (!raw || raw === "current") return normalizeArch(osArch());
  if (raw === "arm64" || raw === "aarch64" || raw === "arm64e") return "arm64";
  if (raw === "x64" || raw === "x86_64" || raw === "amd64") return "x64";
  if (raw === "ia32" || raw === "x86") return "ia32";
  if (raw === "universal") return "universal";
  if (raw === "0") return "x64";
  if (raw === "3") return "arm64";
  if (raw === "4") return "universal";
  return raw;
}

export function expectedRuntimeFromOptions(options) {
  return {
    platform: normalizePlatform(options.expectedPlatform),
    arch: normalizeArch(options.expectedArch),
    packaged: Boolean(options.packaged),
  };
}

export function currentRuntimeArchitectureProbe(extra = {}) {
  return {
    platform: normalizePlatform(process.platform),
    arch: normalizeArch(process.arch),
    executable: process.execPath,
    resourcesPath: process.resourcesPath || process.env.AMBIENT_RUNTIME_ARCH_VERIFY_RESOURCES || null,
    versions: {
      node: process.versions.node,
      electron: process.versions.electron || null,
      modules: process.versions.modules,
    },
    piRuntime: {
      mode: "in-process-library",
      separateHelperBinary: false,
      note: "Ambient imports Pi as an application dependency; no separate Pi helper binary is packaged in the current app.",
    },
    ...extra,
  };
}

export function evaluateRuntimeArchitecture(probe, expected) {
  const issues = [];
  const actualPlatform = normalizePlatform(probe.platform);
  const actualArch = normalizeArch(probe.arch);
  const expectedPlatform = normalizePlatform(expected.platform);
  const expectedArch = normalizeArch(expected.arch);

  if (actualPlatform !== expectedPlatform) {
    issues.push(`platform mismatch: expected ${expectedPlatform}, got ${actualPlatform}`);
  }

  if (expectedArch === "universal") {
    if (actualArch !== "arm64" && actualArch !== "x64") {
      issues.push(`architecture mismatch: expected universal-compatible arm64/x64, got ${actualArch}`);
    }
  } else if (actualArch !== expectedArch) {
    issues.push(`architecture mismatch: expected ${expectedArch}, got ${actualArch}`);
  }

  if (expected.packaged && !probe.versions?.electron) {
    issues.push("packaged runtime probe did not report Electron; expected packaged Electron runtime");
  }

  return {
    ok: issues.length === 0,
    issues,
    expected: {
      platform: expectedPlatform,
      arch: expectedArch,
      packaged: Boolean(expected.packaged),
    },
    actual: {
      platform: actualPlatform,
      arch: actualArch,
      executable: probe.executable,
      electron: probe.versions?.electron || null,
      node: probe.versions?.node || null,
      modules: probe.versions?.modules || null,
      resourcesPath: probe.resourcesPath || null,
      piRuntime: probe.piRuntime || null,
    },
  };
}

export function formatRuntimeArchitectureReport(report) {
  const lines = [
    `Runtime architecture verification ${report.ok ? "passed" : "failed"}.`,
    `- expected: ${report.expected.platform}/${report.expected.arch}${report.expected.packaged ? " packaged Electron" : ""}`,
    `- actual: ${report.actual.platform}/${report.actual.arch}`,
    `- executable: ${report.actual.executable || "(unknown)"}`,
    `- Electron: ${report.actual.electron || "not detected"}`,
    `- Node: ${report.actual.node || "unknown"} ABI ${report.actual.modules || "unknown"}`,
    `- resources: ${report.actual.resourcesPath || "(not reported)"}`,
  ];

  if (report.actual.piRuntime?.note) {
    lines.push(`- Pi runtime: ${report.actual.piRuntime.note}`);
  }

  if (!report.ok) {
    lines.push("Failures:");
    for (const issue of report.issues) lines.push(`- ${issue}`);
  }

  return `${lines.join("\n")}\n`;
}

export function resolvePackagedRuntimeTarget(options) {
  if (options.executable) {
    const executable = resolve(options.executable);
    return {
      executable,
      resources: options.resources ? resolve(options.resources) : inferResourcesPath(executable),
    };
  }

  const appPath = options.app ? resolve(options.app) : findPackagedApp(resolve(options.outputDir));
  if (process.platform === "darwin" || appPath.endsWith(".app")) {
    return {
      executable: findMacAppExecutable(appPath),
      resources: join(appPath, "Contents", "Resources"),
    };
  }

  return {
    executable: appPath,
    resources: options.resources ? resolve(options.resources) : inferResourcesPath(appPath),
  };
}

export function extractRuntimeArchitectureProbe(stdout) {
  const startIndex = stdout.indexOf(jsonStart);
  const endIndex = stdout.indexOf(jsonEnd);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error("Packaged runtime did not return a parseable architecture probe");
  }

  const jsonText = stdout.slice(startIndex + jsonStart.length, endIndex).trim();
  return JSON.parse(jsonText);
}

function runRuntimeArchitectureVerification(options) {
  const expected = expectedRuntimeFromOptions(options);
  const probe = options.packaged ? probePackagedRuntime(options) : currentRuntimeArchitectureProbe();
  const report = evaluateRuntimeArchitecture(probe, expected);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    process.stdout.write(formatRuntimeArchitectureReport(report));
  }

  if (!report.ok) process.exit(1);
}

function probePackagedRuntime(options) {
  const target = resolvePackagedRuntimeTarget(options);
  const result = spawnSync(target.executable, [scriptPath, childFlag], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      AMBIENT_RUNTIME_ARCH_VERIFY_RESOURCES: target.resources ?? "",
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      [
        `Packaged runtime architecture probe failed with exit code ${result.status}.`,
        result.stdout ? `stdout:\n${result.stdout}` : "",
        result.stderr ? `stderr:\n${result.stderr}` : "",
      ].filter(Boolean).join("\n"),
    );
  }

  return extractRuntimeArchitectureProbe(result.stdout || "");
}

function printChildProbe() {
  const probe = currentRuntimeArchitectureProbe();
  process.stdout.write(`${jsonStart}\n${JSON.stringify(probe, null, 2)}\n${jsonEnd}\n`);
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

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (process.argv.includes(childFlag)) {
  printChildProbe();
} else if (isDirectInvocation()) {
  runRuntimeArchitectureVerification(parseRuntimeArchitectureArgs(process.argv.slice(2)));
}
