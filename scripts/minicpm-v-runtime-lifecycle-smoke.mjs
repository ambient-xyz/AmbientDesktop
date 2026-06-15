#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { arch, cpus, freemem, platform, release, totalmem } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const DEFAULT_IMAGE = "test/visual-baselines/01-main-shell.png";
const DEFAULT_PACKAGE_SCRIPT = "resources/ambient-cli-packages/ambient-minicpm-v-vision/scripts/run.mjs";
const DEFAULT_OUTPUT_DIR = "test-results/minicpm-v/runtime-lifecycle-smoke";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write(`Usage: node scripts/minicpm-v-runtime-lifecycle-smoke.mjs --binary <llama-server> [options]

Runs the bundled MiniCPM-V wrapper lifecycle against a specific llama.cpp runtime:
verify-runtime-manifest -> status -> start -> status -> analyze -> stop -> status.

Options:
  --binary <path>              Required extracted llama-server binary.
  --archive <path>             Optional pinned runtime archive to checksum.
  --artifact-id <id>           Manifest artifact id. Defaults from platform/arch.
  --platform <name>            Manifest platform override. Default: current host.
  --arch <name>                Manifest arch override. Default: current host.
  --image <path>               Image fixture. Default: ${DEFAULT_IMAGE}
  --output-dir <path>          Artifact root. Default: ${DEFAULT_OUTPUT_DIR}
  --run-id <id>                Stable run id. Default: timestamp.
  --package-script <path>      MiniCPM wrapper script. Default: ${DEFAULT_PACKAGE_SCRIPT}
  --host <host>                Local bind host. Default: 127.0.0.1.
  --port <number>              Local bind port. Default: free ephemeral port.
  --offline                    Pass --offline to llama-server startup.
  --model <ref>                Optional MiniCPM model ref.
  --context <number>           Optional llama.cpp context tokens. Default: wrapper default.
  --gpu-layers <number>        Optional llama.cpp GPU layer count. Default: wrapper default.
  --runtime-version-timeout-ms <ms>
                              Runtime --version timeout. Default: 30000.
  --runtime-devices-timeout-ms <ms>
                              Runtime --list-devices timeout. Default: 30000.
  --startup-timeout-ms <ms>    Start wait timeout. Default: 180000.
  --request-timeout-ms <ms>    Analyze request timeout. Default: 240000.
  --max-tokens <number>        Analyze max tokens. Default: 1200.
`);
  process.exit(0);
}

const startedAt = new Date();
const runId = args.runId ?? startedAt.toISOString().replace(/[:.]/g, "-");
const outputRoot = resolve(args.outputDir ?? DEFAULT_OUTPUT_DIR);
const runDir = join(outputRoot, runId);
const latestPath = join(outputRoot, "latest.json");
const commandDir = join(runDir, "commands");
const stateDir = join(runDir, "state");
const analysisPath = join(runDir, "analysis.json");
const summaryPath = join(runDir, "summary.json");
const packageScript = resolve(args.packageScript ?? DEFAULT_PACKAGE_SCRIPT);
const binary = resolve(required(args.binary, "--binary"));
const archive = args.archive ? resolve(args.archive) : undefined;
const image = resolve(args.image ?? DEFAULT_IMAGE);
const host = args.host ?? "127.0.0.1";
const port = Number(args.port ?? (await findFreePort(host)));
const runtimeCommandArgs = [
  ...(args.model ? ["--model", args.model] : []),
  ...(args.context ? ["--context", args.context] : []),
  ...(args.gpuLayers ? ["--gpu-layers", args.gpuLayers] : []),
];
const baseCommandArgs = ["--state-dir", stateDir, "--host", host, "--port", String(port), ...runtimeCommandArgs];
const env = {
  ...process.env,
  AMBIENT_MINICPM_V_LLAMA_SERVER: binary,
  AMBIENT_MINICPM_V_STATE_DIR: stateDir,
  AMBIENT_MINICPM_V_HOST: host,
  AMBIENT_MINICPM_V_PORT: String(port),
  LLAMA_LOG_COLORS: "off",
};
if (args.model) env.AMBIENT_MINICPM_V_MODEL = args.model;

await mkdir(commandDir, { recursive: true });

let savedServerPid;
let finalStatus;

try {
  await assertExecutable(binary, "llama-server binary");
  await assertFile(image, "image fixture");
  if (archive) await assertFile(archive, "runtime archive");
  await assertFile(packageScript, "MiniCPM wrapper script");

  const preflight = {
    binary: await fileEvidence(binary),
    archive: archive ? await fileEvidence(archive) : undefined,
    image: await fileEvidence(image),
    packageScript: await fileEvidence(packageScript),
    hostFacts: await hostFacts(),
    runtimeVersion: await runCapture(binary, ["--version"], { timeoutMs: Number(args.runtimeVersionTimeoutMs ?? 30000) }),
    runtimeDevices: await runCapture(binary, ["--list-devices"], { timeoutMs: Number(args.runtimeDevicesTimeoutMs ?? 30000) }),
    nvidiaSmi: await runCapture("nvidia-smi", [
      "--query-gpu=name,driver_version,memory.total,memory.used",
      "--format=csv,noheader,nounits",
    ], { timeoutMs: 8000, optional: true }),
  };
  await writeJson(join(runDir, "preflight.json"), preflight);

  const manifestArgs = [
    packageScript,
    "verify-runtime-manifest",
    ...(archive ? ["--archive", archive] : []),
    "--binary",
    binary,
    ...(args.artifactId ? ["--artifact-id", args.artifactId] : []),
    ...(args.platform ? ["--platform", args.platform] : []),
    ...(args.arch ? ["--arch", args.arch] : []),
  ];
  const manifest = await runWrapper("verify-runtime-manifest", manifestArgs);
  requireJsonCommand(manifest, "verify-runtime-manifest");
  requireCheck(manifest.json, "local-binary-checksum");
  if (archive) requireCheck(manifest.json, "local-archive-checksum");

  const initialStatus = await runWrapper("status-before-start", [packageScript, "status", ...baseCommandArgs]);
  requireJsonCommand(initialStatus, "status-before-start");

  const startArgs = [
    packageScript,
    "start",
    ...baseCommandArgs,
    "--wait-ms",
    String(Number(args.startupTimeoutMs ?? 180000)),
    ...(args.offline ? ["--offline"] : []),
  ];
  const start = await runWrapper("start", startArgs, { timeoutMs: Number(args.startupTimeoutMs ?? 180000) + 30000 });
  requireJsonCommand(start, "start");
  if (!["ready", "already_running"].includes(start.json.status)) {
    throw new Error(`MiniCPM start did not reach ready state: ${start.json.status}`);
  }
  savedServerPid = start.json.server?.pid;

  const readyStatus = await runWrapper("status-after-start", [packageScript, "status", ...baseCommandArgs]);
  requireJsonCommand(readyStatus, "status-after-start");
  if (readyStatus.json.status !== "ready") throw new Error(`Status after start was ${readyStatus.json.status}, expected ready.`);

  const analyze = await runWrapper("analyze", [
    packageScript,
    "analyze",
    ...baseCommandArgs,
    "--image",
    image,
    "--output-json",
    analysisPath,
    "--request-timeout-ms",
    String(Number(args.requestTimeoutMs ?? 240000)),
    "--max-tokens",
    String(Number(args.maxTokens ?? 1200)),
  ], { timeoutMs: Number(args.requestTimeoutMs ?? 240000) + 30000 });
  requireJsonCommand(analyze, "analyze");
  if (analyze.json.status !== "passed") throw new Error(`Analyze status was ${analyze.json.status}, expected passed.`);

  const stop = await runWrapper("stop", [packageScript, "stop", ...baseCommandArgs], { timeoutMs: 30000 });
  requireJsonCommand(stop, "stop");
  if (!["stopped", "not_running"].includes(stop.json.status)) throw new Error(`Stop returned ${stop.json.status}.`);

  const finalWrapperStatus = await runWrapper("status-after-stop", [packageScript, "status", ...baseCommandArgs]);
  requireJsonCommand(finalWrapperStatus, "status-after-stop");
  const savedPidAlive = savedServerPid ? processAlive(savedServerPid) : undefined;
  finalStatus = {
    status: savedPidAlive ? "failed" : "passed",
    serverPid: savedServerPid,
    savedPidAlive,
    message: savedPidAlive
      ? "MiniCPM-V lifecycle smoke passed analysis but the saved llama-server process was still alive after stop."
      : "MiniCPM-V lifecycle smoke completed start/status/analyze/stop with a clean saved-process shutdown.",
  };
} catch (error) {
  finalStatus = {
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    serverPid: savedServerPid,
    savedPidAlive: savedServerPid ? processAlive(savedServerPid) : undefined,
  };
  await runWrapper("stop-after-failure", [packageScript, "stop", ...baseCommandArgs], { timeoutMs: 30000, optional: true }).catch(() => undefined);
} finally {
  const finishedAt = new Date();
  const summary = {
    runId,
    ...finalStatus,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    outputRoot,
    runDir,
    commandDir,
    stateDir,
    summaryPath,
    latestPath,
    analysisPath,
    packageScript,
    binary,
    archive,
    image,
    host,
    port,
    artifactPaths: {
      preflight: join(runDir, "preflight.json"),
      manifestVerification: join(commandDir, "verify-runtime-manifest.json"),
      statusBeforeStart: join(commandDir, "status-before-start.json"),
      start: join(commandDir, "start.json"),
      statusAfterStart: join(commandDir, "status-after-start.json"),
      analyze: join(commandDir, "analyze.json"),
      stop: join(commandDir, "stop.json"),
      statusAfterStop: join(commandDir, "status-after-stop.json"),
    },
  };
  await writeJson(summaryPath, summary);
  await writeJson(latestPath, summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(summary.status === "passed" ? 0 : 1);
}

async function runWrapper(label, argv, options = {}) {
  const result = await runCapture(process.execPath, argv, {
    env,
    timeoutMs: options.timeoutMs ?? 60000,
    optional: options.optional,
  });
  const json = parseLastJsonLine(result.stdout);
  const payload = { label, argv: redactArgv(argv), ...result, json };
  await writeJson(join(commandDir, `${label}.json`), payload);
  if (!options.optional && result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status}: ${result.stderrPreview || result.stdoutPreview}`);
  }
  return payload;
}

async function runCapture(command, argv, options = {}) {
  const started = Date.now();
  return await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, argv, {
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
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
        resolveRun({
          status: "not-found",
          signal: undefined,
          durationMs: Date.now() - started,
          stdout: "",
          stderr: error.message,
          stdoutPreview: "",
          stderrPreview: error.message,
        });
      } else {
        rejectRun(error);
      }
    });
    child.on("close", (status, signal) => {
      clearTimeout(timeout);
      resolveRun({
        status,
        signal,
        durationMs: Date.now() - started,
        stdout,
        stderr,
        stdoutPreview: preview(stdout),
        stderrPreview: preview(stderr),
      });
    });
  });
}

function requireJsonCommand(command, label) {
  if (!command.json || typeof command.json !== "object") throw new Error(`${label} did not return parseable JSON.`);
}

function requireCheck(payload, id) {
  const check = payload.checks?.find((item) => item.id === id);
  if (!check) throw new Error(`Manifest verification did not include ${id}.`);
  if (check.status !== "passed") throw new Error(`Manifest check ${id} was ${check.status}: ${check.detail}`);
}

async function hostFacts() {
  return {
    platform: platform(),
    release: release(),
    arch: arch(),
    cpuModel: cpus()[0]?.model,
    cpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    freeMemoryBytesAtStart: freemem(),
  };
}

async function fileEvidence(path) {
  const details = await stat(path);
  const bytes = await readFile(path);
  return {
    path,
    basename: basename(path),
    bytes: details.size,
    executable: Boolean(details.mode & 0o111),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function assertFile(path, label) {
  const details = await stat(path).catch(() => undefined);
  if (!details?.isFile()) throw new Error(`${label} is not a file: ${path}`);
}

async function assertExecutable(path, label) {
  await assertFile(path, label);
  if (platform() === "win32" && /\.exe$/i.test(path)) return;
  await access(path, constants.X_OK).catch(() => {
    throw new Error(`${label} is not executable: ${path}`);
  });
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseLastJsonLine(stdout) {
  const lines = String(stdout || "").trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Continue looking for a JSON line.
    }
  }
  return undefined;
}

function preview(value, limit = 12000) {
  const text = String(value ?? "");
  return text.length > limit ? `${text.slice(0, limit)}\n...[truncated ${text.length - limit} chars]` : text;
}

function redactArgv(argv) {
  return argv.map((arg) => String(arg).replace(/data:[^ ]+/g, "data:<redacted>"));
}

async function writeJson(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--offline") {
      options.offline = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      options[key] = value;
      index += 1;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return options;
}

function required(value, name) {
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

async function findFreePort(host) {
  return await new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (!port) rejectPort(new Error("Could not allocate a free local port."));
        else resolvePort(port);
      });
    });
  });
}
