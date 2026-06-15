#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const lifecycleScript = join(scriptDir, "minicpm-v-runtime-lifecycle-smoke.mjs");
const manifestPath = "resources/ambient-cli-packages/ambient-minicpm-v-vision/runtime-release-manifest.prototype.json";
const defaultArtifactId = "llama-cpp-windows-x64-cpu";
const defaultOutputRoot = "test-results/minicpm-v/windows-runtime-smoke";
const defaultImage = "test/visual-baselines/01-main-shell.png";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`Usage: node scripts/minicpm-v-windows-runtime-smoke.mjs [options]

Runs the pinned MiniCPM-V Windows x64 CPU runtime smoke on a real Windows host:
download pinned zip -> verify archive -> Expand-Archive -> verify binary -> lifecycle analyze -> cleanup evidence.

Options:
  --artifact-id <id>           Runtime manifest artifact id. Default: ${defaultArtifactId}
  --output-dir <path>          Artifact root. Default: ${defaultOutputRoot}
  --run-id <id>                Stable run id. Default: timestamp.
  --image <path>               Image fixture. Default: ${defaultImage}
  --model <ref>                Optional MiniCPM model ref.
  --startup-timeout-ms <ms>    Lifecycle startup wait. Default: 900000.
  --request-timeout-ms <ms>    Lifecycle analysis wait. Default: 900000.
  --max-tokens <number>        Lifecycle analysis max tokens. Default: 700.
  --dry-run                    Materialize planned command/evidence shape from a non-Windows host.
`);
  process.exit(0);
}

const dryRun = Boolean(args.dryRun);
if ((platform() !== "win32" || arch() !== "x64") && !dryRun) {
  throw new Error(`MiniCPM-V Windows runtime smoke must run on a real Windows x64 host. Current host is ${platform()} ${arch()}. Use --dry-run only for command-shape checks.`);
}

const startedAt = new Date();
const runId = args.runId ?? `windows-x64-b9122-${startedAt.toISOString().replace(/[:.]/g, "-")}`;
const outputRoot = resolve(args.outputDir ?? defaultOutputRoot);
const runDir = join(outputRoot, runId);
const runtimeRoot = join(runDir, "runtime path with spaces");
const downloadDir = join(runtimeRoot, "downloaded archive");
const extractDir = join(runtimeRoot, "extracted runtime");
const commandDir = join(runDir, "commands");
const summaryPath = join(runDir, "summary.json");
const latestPath = join(outputRoot, "latest.json");
const artifactId = args.artifactId ?? defaultArtifactId;
const image = resolve(args.image ?? defaultImage);
const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
const artifact = manifest.artifacts.find((candidate) => candidate.id === artifactId);
if (!artifact) throw new Error(`No MiniCPM-V runtime artifact found in ${manifestPath}: ${artifactId}`);

await mkdir(commandDir, { recursive: true });
await mkdir(downloadDir, { recursive: true });
await mkdir(extractDir, { recursive: true });

const archivePath = join(downloadDir, artifact.archiveName);
const binaryPath = join(extractDir, artifact.binaryRelativePath);
const lifecycleOutputDir = join(runDir, "lifecycle");
const plannedLifecycleArgs = lifecycleArgs();

let finalStatus = { status: "failed" };
try {
  const hostEvidence = {
    platform: platform(),
    arch: arch(),
    release: release(),
    dryRun,
    runId,
    artifactId,
    archivePath,
    binaryPath,
    image,
    runtimeRoot,
    plannedLifecycleArgs: redactArgv(plannedLifecycleArgs),
  };
  await writeJson(join(runDir, "host-preflight.json"), hostEvidence);

  if (dryRun) {
    finalStatus = {
      status: "dry-run",
      message: "Windows MiniCPM-V runtime smoke command shape was materialized without downloading or executing the runtime.",
    };
  } else {
    await downloadArchive(artifact.sourceUrl, archivePath);
    const archiveSha256 = await sha256File(archivePath);
    if (archiveSha256 !== artifact.archiveSha256) {
      throw new Error(`Archive checksum mismatch for ${artifact.archiveName}: ${archiveSha256}`);
    }
    await writeJson(join(runDir, "archive.json"), {
      path: archivePath,
      expectedSha256: artifact.archiveSha256,
      actualSha256: archiveSha256,
      bytes: (await stat(archivePath)).size,
      url: artifact.sourceUrl,
    });

    const firewall = await windowsFirewallEvidence();
    await writeJson(join(runDir, "windows-firewall.json"), firewall);

    const expand = await runCapture("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath $env:AMBIENT_MINICPM_ARCHIVE -DestinationPath $env:AMBIENT_MINICPM_EXTRACT -Force",
    ], {
      timeoutMs: 120000,
      env: {
        ...process.env,
        AMBIENT_MINICPM_ARCHIVE: archivePath,
        AMBIENT_MINICPM_EXTRACT: extractDir,
      },
    });
    await writeJson(join(commandDir, "expand-archive.json"), expand);
    if (expand.status !== 0) throw new Error(`Expand-Archive failed: ${expand.stderrPreview || expand.stdoutPreview}`);

    const binarySha256 = await sha256File(binaryPath);
    if (binarySha256 !== artifact.binarySha256) {
      throw new Error(`Extracted binary checksum mismatch for ${basename(binaryPath)}: ${binarySha256}`);
    }
    await writeJson(join(runDir, "binary.json"), {
      path: binaryPath,
      expectedSha256: artifact.binarySha256,
      actualSha256: binarySha256,
      bytes: (await stat(binaryPath)).size,
    });

    const lifecycle = await runCapture(process.execPath, plannedLifecycleArgs, {
      timeoutMs: Number(args.lifecycleTimeoutMs ?? 1800000),
      env: {
        ...process.env,
        LLAMA_LOG_COLORS: "off",
      },
    });
    await writeJson(join(commandDir, "lifecycle.json"), lifecycle);
    if (lifecycle.status !== 0) throw new Error(`Lifecycle smoke failed: ${lifecycle.stderrPreview || lifecycle.stdoutPreview}`);
    const lifecycleSummary = parseLastJsonLine(lifecycle.stdout);
    if (lifecycleSummary?.status !== "passed") throw new Error(`Lifecycle summary did not pass: ${JSON.stringify(lifecycleSummary)}`);

    finalStatus = {
      status: "passed",
      message: "Windows x64 CPU runtime smoke downloaded, extracted, verified, analyzed a screenshot, and stopped cleanly.",
      archiveSha256,
      binarySha256,
      lifecycleSummaryPath: lifecycleSummary.summaryPath,
      lifecycleRunDir: lifecycleSummary.runDir,
      firewallPromptObserved: "not-observed-on-noninteractive-runner",
    };
  }
} catch (error) {
  finalStatus = {
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
  };
} finally {
  const finishedAt = new Date();
  const summary = {
    schemaVersion: "ambient-minicpm-v-windows-runtime-smoke-v1",
    runId,
    ...finalStatus,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    artifactId,
    artifact,
    host: {
      platform: platform(),
      arch: arch(),
      release: release(),
    },
    paths: {
      outputRoot,
      runDir,
      commandDir,
      runtimeRoot,
      downloadDir,
      extractDir,
      archivePath,
      binaryPath,
      lifecycleOutputDir,
      summaryPath,
      latestPath,
    },
    dryRun,
    plannedLifecycleArgs: redactArgv(plannedLifecycleArgs),
  };
  await writeJson(summaryPath, summary);
  await writeJson(latestPath, summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(summary.status === "passed" || summary.status === "dry-run" ? 0 : 1);
}

function lifecycleArgs() {
  return [
    lifecycleScript,
    "--binary",
    binaryPath,
    "--archive",
    archivePath,
    "--artifact-id",
    artifactId,
    "--platform",
    "win32",
    "--arch",
    "x64",
    "--image",
    image,
    "--output-dir",
    lifecycleOutputDir,
    "--run-id",
    `${runId}-lifecycle`,
    "--gpu-layers",
    "0",
    "--startup-timeout-ms",
    String(args.startupTimeoutMs ?? 900000),
    "--request-timeout-ms",
    String(args.requestTimeoutMs ?? 900000),
    "--max-tokens",
    String(args.maxTokens ?? 700),
    ...(args.model ? ["--model", args.model] : []),
  ];
}

async function downloadArchive(url, path) {
  if (existsSync(path)) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path, bytes);
}

async function windowsFirewallEvidence() {
  const profile = await runCapture("netsh.exe", ["advfirewall", "show", "currentprofile"], { timeoutMs: 30000, optional: true });
  const inbound = await runCapture("netsh.exe", ["advfirewall", "firewall", "show", "rule", "name=llama-server.exe"], { timeoutMs: 30000, optional: true });
  return {
    profile,
    llamaServerRule: inbound,
    note: "GitHub-hosted Windows runners are noninteractive, so local firewall prompts may not appear even when the process binds localhost.",
  };
}

async function sha256File(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function runCapture(command, argv, options = {}) {
  const started = Date.now();
  return await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, argv, {
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      rejectRun(new Error(`${command} timed out after ${options.timeoutMs} ms.`));
    }, options.timeoutMs ?? 60000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (options.optional && error.code === "ENOENT") {
        resolveRun(resultPayload({ status: "not-found", signal: undefined, started, stdout: "", stderr: error.message }));
      } else {
        rejectRun(error);
      }
    });
    child.on("close", (status, signal) => {
      clearTimeout(timeout);
      resolveRun(resultPayload({ status, signal, started, stdout, stderr }));
    });
  });
}

function resultPayload(input) {
  return {
    status: input.status,
    signal: input.signal,
    durationMs: Date.now() - input.started,
    stdout: input.stdout,
    stderr: input.stderr,
    stdoutPreview: preview(input.stdout),
    stderrPreview: preview(input.stderr),
  };
}

function parseLastJsonLine(stdout) {
  const lines = String(stdout || "").trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Keep scanning.
    }
  }
  return undefined;
}

function preview(value, limit = 12000) {
  const text = String(value ?? "");
  return text.length > limit ? `${text.slice(0, limit)}\n...[truncated ${text.length - limit} chars]` : text;
}

async function writeJson(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function redactArgv(argv) {
  return argv.map((arg) => String(arg).replace(/data:[^ ]+/g, "data:<redacted>"));
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      parsed[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }
  return parsed;
}
