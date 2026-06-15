#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const DEFAULT_IMAGE = "resources/welcome-onboarding/screenshots/01-main-shell.png";
const DEFAULT_MANIFEST = "resources/ambient-cli-packages/ambient-minicpm-v-vision/runtime-release-manifest.prototype.json";
const DEFAULT_LIFECYCLE_SCRIPT = "scripts/minicpm-v-runtime-lifecycle-smoke.mjs";
const DEFAULT_OUTPUT_DIR = "test-results/minicpm-v/managed-download-lifecycle-smoke";
const RUNTIME_CACHE_ROOT = ".ambient/vision/minicpm-v/runtime";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write(`Usage: node scripts/minicpm-v-managed-download-lifecycle-smoke.mjs [options]

Downloads the manifest-pinned default MiniCPM-V runtime into an empty managed cache,
verifies archive and extracted-binary SHA-256s, then runs the runtime lifecycle smoke.

Options:
  --artifact-id <id>           Manifest artifact id. Defaults from current platform/arch.
  --platform <name>            Manifest platform override. Default: current host.
  --arch <name>                Manifest arch override. Default: current host.
  --manifest <path>            Runtime manifest JSON. Default: ${DEFAULT_MANIFEST}
  --image <path>               Image fixture. Default: ${DEFAULT_IMAGE}
  --output-dir <path>          Artifact root. Default: ${DEFAULT_OUTPUT_DIR}
  --run-id <id>                Stable run id. Default: timestamp.
  --workspace-dir <path>       Empty managed-cache workspace. Default: <run-dir>/workspace.
  --lifecycle-script <path>    Lifecycle script. Default: ${DEFAULT_LIFECYCLE_SCRIPT}
  --pre-response-timeout-ms    Download response timeout. Default: 60000.
  --idle-timeout-ms <ms>       Download body idle timeout. Default: 60000.
  --model <ref>                Optional lifecycle model ref.
  --context <number>           Optional lifecycle context tokens.
  --gpu-layers <number>        Optional lifecycle GPU layer count.
  --runtime-version-timeout-ms <ms>
                              Lifecycle runtime --version timeout.
  --runtime-devices-timeout-ms <ms>
                              Lifecycle runtime --list-devices timeout.
  --startup-timeout-ms <ms>    Lifecycle start wait timeout.
  --request-timeout-ms <ms>    Lifecycle analyze request timeout.
  --max-tokens <number>        Lifecycle analyze max tokens.
  --offline                    Pass --offline to lifecycle startup.
`);
  process.exit(0);
}

const startedAt = new Date();
const runId = args.runId ?? startedAt.toISOString().replace(/[:.]/g, "-");
const outputRoot = resolve(args.outputDir ?? DEFAULT_OUTPUT_DIR);
const runDir = join(outputRoot, runId);
const latestPath = join(outputRoot, "latest.json");
const setupPath = join(runDir, "managed-download-setup.json");
const lifecycleOutputDir = join(runDir, "runtime-lifecycle");
const manifestPath = resolve(args.manifest ?? DEFAULT_MANIFEST);
const imagePath = resolve(args.image ?? DEFAULT_IMAGE);
const lifecycleScript = resolve(args.lifecycleScript ?? DEFAULT_LIFECYCLE_SCRIPT);
const workspaceDir = resolve(args.workspaceDir ?? join(runDir, "workspace"));
const hostPlatform = args.platform ?? platform();
const hostArch = args.arch ?? arch();
const preResponseTimeoutMs = Number(args.preResponseTimeoutMs ?? 60_000);
const idleTimeoutMs = Number(args.idleTimeoutMs ?? 60_000);

let summaryStatus = "failed";
let setup;
let lifecycle;

try {
  await assertFile(manifestPath, "runtime manifest");
  await assertFile(imagePath, "image fixture");
  await assertFile(lifecycleScript, "lifecycle smoke script");
  await rm(workspaceDir, { recursive: true, force: true });

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const artifact = selectArtifact(manifest, {
    artifactId: args.artifactId,
    platform: hostPlatform,
    arch: hostArch,
  });
  assertDefaultDownloadEligible(manifest, artifact, hostPlatform, hostArch);

  const archiveDir = join(workspaceDir, RUNTIME_CACHE_ROOT, ".downloads", artifact.cacheSubdir);
  const installRoot = join(workspaceDir, RUNTIME_CACHE_ROOT, artifact.cacheSubdir);
  const archivePath = join(archiveDir, artifact.archiveName);
  const binaryPath = join(installRoot, artifact.binaryRelativePath);
  await mkdir(archiveDir, { recursive: true });
  await mkdir(installRoot, { recursive: true });
  await writeFile(join(workspaceDir, RUNTIME_CACHE_ROOT, ".gitignore"), "*\n", "utf8");

  const download = await downloadFile(artifact.sourceUrl, archivePath, {
    preResponseTimeoutMs,
    idleTimeoutMs,
    expectedBytes: artifact.archiveSizeBytes,
  });
  const archiveSha256 = await sha256File(archivePath);
  if (archiveSha256 !== artifact.archiveSha256) {
    throw new Error(`Archive SHA-256 mismatch for ${artifact.id}: expected ${artifact.archiveSha256}, got ${archiveSha256}.`);
  }
  await extractTarGzSafely(archivePath, installRoot);
  await chmod(binaryPath, 0o755).catch(() => undefined);
  const binarySha256 = await sha256File(binaryPath);
  if (artifact.binarySha256 && binarySha256 !== artifact.binarySha256) {
    throw new Error(`Runtime binary SHA-256 mismatch for ${artifact.id}: expected ${artifact.binarySha256}, got ${binarySha256}.`);
  }

  const macosSecurity = hostPlatform === "darwin" ? await assessMacosSecurity(binaryPath) : undefined;
  setup = {
    schemaVersion: "ambient-minicpm-v-managed-download-lifecycle-smoke-v1",
    status: "passed",
    startedAt: startedAt.toISOString(),
    artifactId: artifact.id,
    platform: artifact.platform,
    arch: artifact.arch,
    lane: artifact.lane,
    sourceUrl: artifact.sourceUrl,
    workspaceDir,
    runtimeCacheRoot: join(workspaceDir, RUNTIME_CACHE_ROOT),
    archivePath,
    archiveSha256,
    archiveBytes: download.bytes,
    download,
    installRoot,
    binaryPath,
    binarySha256,
    macosSecurity,
  };
  await writeJson(setupPath, setup);

  const lifecycleArgs = [
    lifecycleScript,
    "--binary",
    binaryPath,
    "--archive",
    archivePath,
    "--artifact-id",
    artifact.id,
    "--platform",
    artifact.platform,
    "--arch",
    artifact.arch,
    "--image",
    imagePath,
    "--output-dir",
    lifecycleOutputDir,
    "--run-id",
    `${runId}-lifecycle`,
    ...(args.model ? ["--model", args.model] : []),
    ...(args.context ? ["--context", args.context] : []),
    ...(args.gpuLayers ? ["--gpu-layers", args.gpuLayers] : []),
    ...(args.runtimeVersionTimeoutMs ? ["--runtime-version-timeout-ms", args.runtimeVersionTimeoutMs] : []),
    ...(args.runtimeDevicesTimeoutMs ? ["--runtime-devices-timeout-ms", args.runtimeDevicesTimeoutMs] : []),
    ...(args.startupTimeoutMs ? ["--startup-timeout-ms", args.startupTimeoutMs] : []),
    ...(args.requestTimeoutMs ? ["--request-timeout-ms", args.requestTimeoutMs] : []),
    ...(args.maxTokens ? ["--max-tokens", args.maxTokens] : []),
    ...(args.offline ? ["--offline"] : []),
  ];
  const lifecycleRun = await runCapture(process.execPath, lifecycleArgs, {
    timeoutMs: Number(args.lifecycleTimeoutMs ?? 10 * 60 * 1000),
  });
  lifecycle = {
    argv: redactArgv(lifecycleArgs),
    ...lifecycleRun,
    json: parseJsonOutput(lifecycleRun.stdout),
  };
  if (lifecycleRun.status !== 0) {
    throw new Error(`Lifecycle smoke failed with exit ${lifecycleRun.status}: ${lifecycleRun.stderrPreview || lifecycleRun.stdoutPreview}`);
  }
  if (lifecycle.json?.status !== "passed") {
    throw new Error(`Lifecycle smoke summary status was ${lifecycle.json?.status ?? "missing"}.`);
  }
  summaryStatus = "passed";
} catch (error) {
  setup = setup ?? {
    schemaVersion: "ambient-minicpm-v-managed-download-lifecycle-smoke-v1",
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
  };
  if (setup.status !== "passed") await writeJson(setupPath, setup).catch(() => undefined);
} finally {
  const finishedAt = new Date();
  const summary = {
    schemaVersion: "ambient-minicpm-v-managed-download-lifecycle-smoke-summary-v1",
    status: summaryStatus,
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    outputRoot,
    runDir,
    latestPath,
    setupPath,
    lifecycleOutputDir,
    lifecycleSummaryPath: lifecycle?.json?.summaryPath,
    manifestPath,
    imagePath,
    workspaceDir,
    setup,
    lifecycle,
  };
  await writeJson(join(runDir, "summary.json"), summary);
  await writeJson(latestPath, summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(summary.status === "passed" ? 0 : 1);
}

function selectArtifact(manifest, input) {
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  const artifact = input.artifactId
    ? artifacts.find((item) => item.id === input.artifactId)
    : artifacts.find((item) => item.platform === input.platform && item.arch === input.arch && item.defaultDownloadEnabled === true);
  if (!artifact) throw new Error(`No default MiniCPM-V runtime artifact found for ${input.platform} ${input.arch}.`);
  return artifact;
}

function assertDefaultDownloadEligible(manifest, artifact, hostPlatform, hostArch) {
  if (manifest.downloadEnabled !== true) throw new Error("Runtime manifest has downloadEnabled=false.");
  if (artifact.platform !== hostPlatform || artifact.arch !== hostArch) {
    throw new Error(`Artifact ${artifact.id} targets ${artifact.platform} ${artifact.arch}, not this host ${hostPlatform} ${hostArch}.`);
  }
  if (artifact.defaultDownloadEnabled !== true) throw new Error(`Artifact ${artifact.id} has defaultDownloadEnabled=false.`);
  if (artifact.supportTier !== "conditional") throw new Error(`Artifact ${artifact.id} is ${artifact.supportTier}; default download is scoped to conditional lanes.`);
  if (artifact.platform === "win32") throw new Error("Windows default managed download remains disabled until real Windows lifecycle evidence lands.");
  if (artifact.archiveFormat !== "tar.gz" && artifact.archiveFormat !== "tgz") {
    throw new Error(`Managed-download lifecycle smoke currently supports tar.gz/tgz artifacts, not ${artifact.archiveFormat}.`);
  }
}

async function downloadFile(url, destination, options) {
  const started = Date.now();
  let idleTimer;
  const controller = new AbortController();
  const preResponseTimer = setTimeout(() => controller.abort(new Error(`No response within ${options.preResponseTimeoutMs} ms.`)), options.preResponseTimeoutMs);
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(new Error(`No body activity within ${options.idleTimeoutMs} ms.`)), options.idleTimeoutMs);
  };
  const response = await fetch(url, { signal: controller.signal }).catch((error) => {
    throw new Error(`Download failed before response: ${error.message}`);
  });
  clearTimeout(preResponseTimer);
  if (!response.ok) throw new Error(`Download failed with HTTP ${response.status} ${response.statusText}.`);
  resetIdleTimer();
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Download response did not include a readable body.");
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdleTimer();
      chunks.push(Buffer.from(value));
      bytes += value.byteLength;
    }
  } finally {
    clearTimeout(idleTimer);
  }
  if (options.expectedBytes && bytes !== options.expectedBytes) {
    throw new Error(`Downloaded byte count mismatch: expected ${options.expectedBytes}, got ${bytes}.`);
  }
  await writeFile(destination, Buffer.concat(chunks));
  return {
    url,
    finalUrl: response.url,
    status: "downloaded",
    httpStatus: response.status,
    bytes,
    durationMs: Date.now() - started,
    preResponseTimeoutMs: options.preResponseTimeoutMs,
    idleTimeoutMs: options.idleTimeoutMs,
  };
}

async function extractTarGzSafely(archivePath, destination) {
  const listing = await runCapture("tar", ["-tzf", archivePath], { timeoutMs: 60_000 });
  if (listing.status !== 0) throw new Error(`Could not inspect archive entries: ${listing.stderrPreview || listing.stdoutPreview}`);
  for (const entry of listing.stdout.split(/\r?\n/).filter(Boolean)) {
    const normalized = entry.replace(/\\/g, "/").replace(/\/+$/g, "");
    if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || normalized.split("/").includes("..")) {
      throw new Error(`MiniCPM-V runtime archive contains an unsafe entry path: ${entry}`);
    }
  }
  const extract = await runCapture("tar", ["-xzf", archivePath, "-C", destination], { timeoutMs: 120_000 });
  if (extract.status !== 0) throw new Error(`Runtime archive extraction failed: ${extract.stderrPreview || extract.stdoutPreview}`);
}

async function assessMacosSecurity(binaryPath) {
  const quarantineBefore = await macosQuarantineStatus(binaryPath);
  let quarantineAction = "not-needed";
  if (quarantineBefore === "present") {
    const remove = await runCapture("xattr", ["-d", "com.apple.quarantine", binaryPath], { timeoutMs: 5000 });
    quarantineAction = remove.status === 0 ? "removed-after-checksum" : "failed";
  }
  const quarantineAfter = await macosQuarantineStatus(binaryPath);
  const codeSignature = await runCapture("codesign", ["--verify", "--verbose=2", binaryPath], { timeoutMs: 10_000, optional: true });
  const gatekeeper = await runCapture("spctl", ["-a", "-vv", "--type", "exec", binaryPath], { timeoutMs: 10_000, optional: true });
  const codeSignatureStatus = codeSignature.status === 0 ? "valid" : /not signed|code object is not signed/i.test(`${codeSignature.stderr}\n${codeSignature.stdout}`) ? "unsigned" : "invalid";
  const gatekeeperStatus = gatekeeper.status === 0 ? "accepted" : "rejected";
  const gatekeeperEligible = quarantineAfter !== "present" && codeSignatureStatus === "valid" && gatekeeperStatus === "accepted";
  const ambientManagedEligible = quarantineAfter !== "present" && codeSignatureStatus === "valid";
  return {
    platform: "darwin",
    quarantineBefore,
    quarantineAction,
    quarantineAfter,
    codeSignature: codeSignatureStatus,
    codeSignatureDetail: preview(`${codeSignature.stderr}\n${codeSignature.stdout}`.trim(), 1000),
    gatekeeperAssessment: gatekeeperStatus,
    gatekeeperDetail: preview(`${gatekeeper.stderr}\n${gatekeeper.stdout}`.trim(), 1000),
    defaultDownloadPromotion: gatekeeperEligible || ambientManagedEligible ? "eligible" : "blocked",
    promotionPolicy: gatekeeperEligible ? "gatekeeper-accepted" : ambientManagedEligible ? "ambient-managed-valid-signature" : undefined,
  };
}

async function macosQuarantineStatus(binaryPath) {
  const result = await runCapture("xattr", ["-p", "com.apple.quarantine", binaryPath], { timeoutMs: 5000, optional: true });
  return result.status === 0 && result.stdout.trim() ? "present" : "not-present";
}

async function assertFile(path, label) {
  const details = await stat(path).catch(() => undefined);
  if (!details?.isFile()) throw new Error(`${label} is not a file: ${path}`);
}

async function sha256File(path) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

async function runCapture(command, argv, options = {}) {
  const started = Date.now();
  return await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, argv, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      rejectRun(new Error(`${command} timed out after ${options.timeoutMs} ms.`));
    }, options.timeoutMs ?? 60_000);
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

function parseJsonOutput(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return parseLastJsonLine(text);
  }
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
