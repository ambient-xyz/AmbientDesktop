#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RECORD_PREFIX = "__AMBIENT_MCP_HOST_PREFLIGHT__";
const DEFAULT_TIMEOUT_MS = 60_000;

export function buildHostPreflightShellScript() {
  return String.raw`
run() {
  name="$1"
  shift
  output="$("$@" 2>&1)"
  code="$?"
  encoded="$(printf '%s' "$output" | base64 | tr -d '\n')"
  printf '__AMBIENT_MCP_HOST_PREFLIGHT__%s__%s__%s\n' "$name" "$code" "$encoded"
}

run uname_s uname -s
run uname_m uname -m
run os_release sh -lc 'cat /etc/os-release 2>/dev/null | sed -n "1,12p"'
run id_un sh -lc 'id -un'
run id_gn sh -lc 'id -Gn'
run docker_path sh -lc 'command -v docker'
run docker_version sh -lc 'docker --version'
run docker_info sh -lc 'docker info --format "{{json .ServerVersion}}"'
run docker_sock sh -lc 'if [ -S /var/run/docker.sock ]; then stat -c "%U:%G %a %F" /var/run/docker.sock 2>/dev/null || ls -l /var/run/docker.sock; else echo missing; fi'
run podman_path sh -lc 'command -v podman'
run podman_version sh -lc 'podman --version'
run podman_info sh -lc 'podman info --format json'
run thv_path sh -lc 'command -v thv'
run thv_version sh -lc 'thv version'
run node_version sh -lc 'node --version'
run pnpm_version sh -lc 'pnpm --version'
run git_version sh -lc 'git --version'
`;
}

export function parseHostPreflightRecords(stdout) {
  const records = {};
  const lines = String(stdout ?? "").split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith(RECORD_PREFIX)) continue;
    const match = /^__AMBIENT_MCP_HOST_PREFLIGHT__(.+?)__(-?\d+)__(.*)$/.exec(line);
    if (!match) continue;
    const [, name, codeText, encoded] = match;
    records[name] = {
      exitCode: Number(codeText),
      output: decodeBase64(encoded).trim(),
    };
  }
  return records;
}

export function buildHostPreflightReport(input) {
  const records = input.records ?? parseHostPreflightRecords(input.stdout ?? "");
  const platform = platformFromUname(records.uname_s?.output);
  const arch = archFromUname(records.uname_m?.output);
  const docker = runtimeProbe(records, "docker");
  const podman = runtimeProbe(records, "podman");
  const status = classifyRuntimeStatus({ docker, podman });
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    target: input.target ?? "local",
    transport: input.target ? "ssh" : "local",
    platform,
    arch,
    status,
    message: hostPreflightMessage(status, { docker, podman }),
    runtimes: {
      docker,
      podman,
      toolhive: commandProbe(records, "thv"),
    },
    host: {
      osRelease: records.os_release?.output,
      user: records.id_un?.output,
      groups: splitWords(records.id_gn?.output),
      dockerSocket: records.docker_sock?.output,
      node: records.node_version?.output,
      pnpm: records.pnpm_version?.output,
      git: records.git_version?.output,
    },
    records,
  };
}

export function compactHostPreflightReport(report) {
  return {
    target: report?.target,
    transport: report?.transport,
    platform: report?.platform,
    arch: report?.arch,
    status: report?.status,
    message: report?.message,
    docker: {
      installed: report?.runtimes?.docker?.installed,
      ready: report?.runtimes?.docker?.ready,
      permissionBlocked: report?.runtimes?.docker?.permissionBlocked,
      version: report?.runtimes?.docker?.version,
    },
    podman: {
      installed: report?.runtimes?.podman?.installed,
      ready: report?.runtimes?.podman?.ready,
      permissionBlocked: report?.runtimes?.podman?.permissionBlocked,
      version: report?.runtimes?.podman?.version,
    },
    toolhive: {
      installed: report?.runtimes?.toolhive?.installed,
      version: report?.runtimes?.toolhive?.version,
    },
  };
}

export async function runHostPreflight(input = {}) {
  const script = buildHostPreflightShellScript();
  const command = input.target
    ? {
        name: "ssh",
        args: [
          "-o",
          `ConnectTimeout=${Math.max(1, Math.ceil((input.connectTimeoutMs ?? 10_000) / 1000))}`,
          input.target,
          `sh -lc ${quoteShellArg(script)}`,
        ],
      }
    : { name: "sh", args: ["-lc", script] };
  const raw = await runCommand(command.name, command.args, {
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  return buildHostPreflightReport({
    target: input.target,
    stdout: raw.stdout,
    stderr: raw.stderr,
    generatedAt: input.generatedAt,
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const targetEnvName = optionValue(argv, "--target-env");
  const target = optionValue(argv, "--target") || envTarget(targetEnvName);
  if (targetEnvName && !target) throw new Error(`Set ${targetEnvName} to the SSH target before running this host preflight.`);
  const expectPlatform = argsHas(argv, "--expect-current-platform") ? process.platform : optionValue(argv, "--expect-platform");
  const outputPath = resolve(optionValue(argv, "--out") || process.env.AMBIENT_MCP_HOST_PREFLIGHT_OUT || join(repoRoot, "test-results", "mcp-runtime-host-preflight", `${safeName(target || "local")}.json`));
  const report = await runHostPreflight({
    target,
    timeoutMs: numberOption(argv, "--timeout-ms") ?? DEFAULT_TIMEOUT_MS,
    connectTimeoutMs: numberOption(argv, "--connect-timeout-ms") ?? 10_000,
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: report.status,
    target: report.target,
    platform: report.platform,
    arch: report.arch,
    message: report.message,
    outputPath,
  }, null, 2));
  if (expectPlatform && report.platform !== expectPlatform) {
    console.error(`Expected platform ${expectPlatform}, got ${report.platform}.`);
    process.exitCode = 1;
  }
}

function runtimeProbe(records, runtime) {
  const path = commandProbe(records, runtime);
  const versionRecord = records[`${runtime}_version`];
  const infoRecord = records[`${runtime}_info`];
  const installed = path.installed || commandSucceeded(versionRecord);
  const infoOutput = infoRecord?.output ?? "";
  const ready = commandSucceeded(infoRecord);
  const permissionBlocked = installed && !ready && /permission denied|operation not permitted|docker\.sock|podman socket|permission/i.test(infoOutput);
  return {
    installed,
    ready,
    permissionBlocked,
    path: path.path,
    version: versionText(versionRecord?.output),
    infoExitCode: typeof infoRecord?.exitCode === "number" ? infoRecord.exitCode : undefined,
    infoPreview: truncate(infoOutput),
  };
}

function commandProbe(records, prefix) {
  const pathRecord = records[`${prefix}_path`];
  const versionRecord = records[`${prefix}_version`];
  return {
    installed: commandSucceeded(pathRecord) || commandSucceeded(versionRecord),
    path: commandSucceeded(pathRecord) ? pathRecord.output : undefined,
    version: versionText(versionRecord?.output),
  };
}

function classifyRuntimeStatus(input) {
  if (input.docker.ready || input.podman.ready) return "ready";
  if (input.docker.permissionBlocked || input.podman.permissionBlocked) return "permission-blocked";
  if (input.docker.installed || input.podman.installed) return "installed-not-running";
  return "missing";
}

function hostPreflightMessage(status, input) {
  if (status === "ready") return "A container runtime is installed and reachable for this user.";
  if (status === "permission-blocked") {
    const runtime = input.docker.permissionBlocked ? "Docker" : "Podman";
    return `${runtime} is installed, but this OS user cannot access the runtime socket. Repair user/session permissions before running ToolHive workloads.`;
  }
  if (status === "installed-not-running") return "A container runtime CLI is installed, but its engine is not reachable.";
  return "No Docker or Podman runtime was detected on this host.";
}

function platformFromUname(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "linux") return "linux";
  if (normalized === "darwin") return "darwin";
  if (normalized.includes("mingw") || normalized.includes("msys") || normalized.includes("windows")) return "win32";
  return normalized || "unknown";
}

function archFromUname(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "x86_64" || normalized === "amd64") return "x64";
  if (normalized === "aarch64" || normalized === "arm64") return "arm64";
  return normalized || "unknown";
}

function commandSucceeded(record) {
  return record && record.exitCode === 0 && String(record.output ?? "").trim().length > 0;
}

function versionText(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function splitWords(value) {
  return String(value ?? "").split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function truncate(value, max = 300) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text || undefined;
}

function decodeBase64(value) {
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function runCommand(command, args, options) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["inherit", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      rejectRun(new Error(`${command} timed out after ${options.timeoutMs}ms.`));
    }, options.timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolveRun({ stdout, stderr });
      else {
        const detail = stderr.trim() || stdout.trim() || signal || `exit ${code}`;
        rejectRun(new Error(`${command} failed: ${detail}`));
      }
    });
  });
}

function optionValue(values, name) {
  const direct = values.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = values.indexOf(name);
  return index >= 0 ? values[index + 1] : undefined;
}

function numberOption(values, name) {
  const raw = optionValue(values, name);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function argsHas(values, name) {
  return values.includes(name);
}

function envTarget(name) {
  if (!name) return undefined;
  return process.env[name]?.trim() || undefined;
}

function quoteShellArg(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9_.-]+/gi, "_").replace(/^_+|_+$/g, "") || "host";
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
