#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { arch, platform, release, totalmem } from "node:os";
import { pathToFileURL } from "node:url";

const defaultManifestPath = "scripts/stt-spike/corpus.public-smoke.manifest.json";
const defaultOutRoot = ".ambient/stt-validation/faster-whisper-clean-cache";
const defaultTimeoutMs = 10 * 60 * 1000;

export async function main(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    process.stdout.write(helpText());
    return 0;
  }

  const cwd = resolve(options.cwd ?? process.cwd());
  const runId = parsed.runId ?? new Date().toISOString().replace(/[:.]/g, "-");
  const outRoot = resolvePath(cwd, parsed.out ?? defaultOutRoot);
  const runDir = join(outRoot, runId);
  const corpusDir = join(runDir, "corpus");
  const logsDir = join(runDir, "logs");
  const cacheRoot = join(runDir, "runtime-cache");
  await mkdir(logsDir, { recursive: true });
  await mkdir(cacheRoot, { recursive: true });

  const cacheEnv = cleanCacheEnv(cacheRoot);
  const env = {
    ...process.env,
    ...cacheEnv,
    AMBIENT_FASTER_WHISPER_MODEL: parsed.model ?? "tiny.en",
    AMBIENT_FASTER_WHISPER_DEVICE: parsed.device ?? "cpu",
    AMBIENT_FASTER_WHISPER_COMPUTE_TYPE: parsed.computeType ?? "int8",
    AMBIENT_FASTER_WHISPER_BEAM_SIZE: parsed.beamSize ?? "1",
  };

  const prepare = await runCommand({
    cwd,
    env,
    timeoutMs: parsed.timeoutMs,
    command: process.execPath,
    args: [
      "scripts/stt-spike/prepare-corpus.mjs",
      "--manifest",
      parsed.manifest ?? defaultManifestPath,
      "--out",
      corpusDir,
      "--timeout-ms",
      String(parsed.timeoutMs),
    ],
    stdoutPath: join(logsDir, "prepare-corpus.stdout.txt"),
    stderrPath: join(logsDir, "prepare-corpus.stderr.txt"),
  });
  if (prepare.status !== 0) throw new Error(`Corpus preparation failed. See ${pathForReport(cwd, prepare.stderrPath)}.`);

  const corpus = JSON.parse(await readFile(join(corpusDir, "corpus.json"), "utf8"));
  const sample = corpus.samples.find((candidate) => candidate.id === "hf-asr-dummy-1-en") ?? corpus.samples[0];
  if (!sample?.path) throw new Error("Clean-cache validation needs at least one prepared corpus sample.");
  const audioPath = resolve(corpusDir, sample.path);

  const runnerPath = "resources/ambient-cli-packages/ambient-faster-whisper-stt/scripts/run.mjs";
  const health = await runCommand({
    cwd,
    env,
    timeoutMs: parsed.timeoutMs,
    command: process.execPath,
    args: [runnerPath, "--health"],
    stdoutPath: join(logsDir, "faster-whisper-health.stdout.json"),
    stderrPath: join(logsDir, "faster-whisper-health.stderr.txt"),
  });
  if (health.status !== 0) throw new Error(`faster-whisper health failed. See ${pathForReport(cwd, health.stderrPath)}.`);
  const healthPayload = parseJsonText(health.stdout, "health stdout");
  assertAdapterContract({ health: healthPayload });

  const transcriptJsonPath = join(runDir, "transcript.json");
  const transcription = await runCommand({
    cwd,
    env,
    timeoutMs: parsed.timeoutMs,
    command: process.execPath,
    args: [
      runnerPath,
      "--audio",
      audioPath,
      "--language",
      sample.language ?? "English",
      "--output-json",
      transcriptJsonPath,
    ],
    stdoutPath: join(logsDir, "faster-whisper-transcribe.stdout.json"),
    stderrPath: join(logsDir, "faster-whisper-transcribe.stderr.txt"),
  });
  if (transcription.status !== 0) throw new Error(`faster-whisper transcription failed. See ${pathForReport(cwd, transcription.stderrPath)}.`);
  const transcriptPayload = parseJsonText(transcription.stdout, "transcription stdout");
  assertAdapterContract({ health: healthPayload, transcript: transcriptPayload });

  const cacheSummary = await summarizeCacheRoot(cacheRoot);
  const summary = {
    schemaVersion: "ambient-faster-whisper-clean-cache-validation-v1",
    generatedAt: new Date().toISOString(),
    runId,
    host: {
      platform: platform(),
      arch: arch(),
      release: release(),
      totalMemoryBytes: totalmem(),
    },
    sample: {
      id: sample.id,
      language: sample.language,
      durationMs: sample.durationMs,
      audioPath: pathForReport(cwd, audioPath),
      sha256: await fileSha256(audioPath),
    },
    adapterContract: healthPayload.distribution,
    installPlan: healthPayload.installPlan,
    cacheEnv: Object.fromEntries(Object.entries(cacheEnv).map(([key, value]) => [key, pathForReport(cwd, value)])),
    cacheSummary,
    transcript: {
      text: transcriptPayload.text,
      language: transcriptPayload.language,
      durationMs: transcriptPayload.durationMs,
      runtime: transcriptPayload.runtime,
    },
    artifacts: {
      runDir: pathForReport(cwd, runDir),
      summaryJson: pathForReport(cwd, join(runDir, "summary.json")),
      summaryMd: pathForReport(cwd, join(runDir, "summary.md")),
      transcriptJson: pathForReport(cwd, transcriptJsonPath),
      healthStdout: pathForReport(cwd, health.stdoutPath),
      healthStderr: pathForReport(cwd, health.stderrPath),
      transcriptionStdout: pathForReport(cwd, transcription.stdoutPath),
      transcriptionStderr: pathForReport(cwd, transcription.stderrPath),
    },
  };
  const summaryJsonPath = join(runDir, "summary.json");
  const summaryMdPath = join(runDir, "summary.md");
  await writeFile(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(summaryMdPath, renderMarkdownSummary(summary), "utf8");

  process.stdout.write("faster-whisper clean-cache validation complete\n");
  process.stdout.write(`- run: ${runId}\n`);
  process.stdout.write(`- summary: ${pathForReport(cwd, summaryJsonPath)}\n`);
  process.stdout.write(`- transcript: ${pathForReport(cwd, transcriptJsonPath)}\n`);
  process.stdout.write(`- cache bytes: ${cacheSummary.totalBytes}\n`);
  return 0;
}

export function cleanCacheEnv(cacheRoot) {
  return {
    UV_CACHE_DIR: join(cacheRoot, "uv-cache"),
    UV_PYTHON_INSTALL_DIR: join(cacheRoot, "uv-python"),
    HF_HOME: join(cacheRoot, "hf-home"),
    HF_HUB_CACHE: join(cacheRoot, "hf-hub-cache"),
    XDG_CACHE_HOME: join(cacheRoot, "xdg-cache"),
  };
}

export function assertAdapterContract({ health, transcript }) {
  const distribution = health?.distribution;
  if (distribution?.packageType !== "adapter-only") throw new Error("Expected faster-whisper health to report packageType=adapter-only.");
  for (const key of ["bundledRuntimeBinaries", "bundledPythonWheels", "bundledModelWeights", "bundledModelAssets"]) {
    if (distribution[key] !== false) throw new Error(`Expected faster-whisper health distribution.${key}=false.`);
  }
  if (health?.installPlan?.resolver !== "uv") throw new Error("Expected faster-whisper health installPlan.resolver=uv.");
  if (!Array.isArray(health?.installPlan?.packages) || !health.installPlan.packages.includes("faster-whisper==1.1.1")) {
    throw new Error("Expected faster-whisper health installPlan packages to include faster-whisper==1.1.1.");
  }
  if (transcript && !String(transcript.text ?? "").toLowerCase().includes("he hoped there would be stew")) {
    throw new Error("Expected faster-whisper transcript to contain the public smoke phrase.");
  }
  if (transcript?.runtime?.distribution?.packageType && transcript.runtime.distribution.packageType !== "adapter-only") {
    throw new Error("Expected faster-whisper transcript runtime distribution to remain adapter-only.");
  }
}

export async function summarizeCacheRoot(cacheRoot) {
  const summary = {
    root: cacheRoot,
    totalBytes: 0,
    fileCount: 0,
    directoryCount: 0,
    topLevel: [],
  };
  await mkdir(cacheRoot, { recursive: true });
  const entries = await readdir(cacheRoot, { withFileTypes: true });
  for (const entry of entries) {
    const childPath = join(cacheRoot, entry.name);
    const child = await summarizePath(childPath);
    summary.totalBytes += child.totalBytes;
    summary.fileCount += child.fileCount;
    summary.directoryCount += child.directoryCount + (entry.isDirectory() ? 1 : 0);
    summary.topLevel.push({ name: entry.name, ...child });
  }
  summary.topLevel.sort((left, right) => left.name.localeCompare(right.name));
  return summary;
}

export function renderMarkdownSummary(summary) {
  return [
    "# faster-whisper Clean-Cache Validation",
    "",
    `- Run: ${summary.runId}`,
    `- Generated: ${summary.generatedAt}`,
    `- Host: ${summary.host.platform}-${summary.host.arch} ${summary.host.release}`,
    `- Adapter package type: ${summary.adapterContract.packageType}`,
    `- Bundled model assets: ${summary.adapterContract.bundledModelAssets}`,
    `- Installer: ${summary.installPlan.resolver}`,
    `- Packages: ${summary.installPlan.packages.join(", ")}`,
    `- Cache bytes: ${summary.cacheSummary.totalBytes}`,
    `- Transcript language: ${summary.transcript.language}`,
    `- Transcript: ${summary.transcript.text}`,
    "",
    "## Artifacts",
    "",
    ...Object.entries(summary.artifacts).map(([key, value]) => `- ${key}: ${value}`),
    "",
  ].join("\n");
}

export function parseArgs(argv) {
  const parsed = { timeoutMs: defaultTimeoutMs };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = camelCase(arg.slice(2));
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      index += 1;
      parsed[key] = key === "timeoutMs" ? Number(value) : value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs <= 0) throw new Error("--timeout-ms must be a positive number");
  return parsed;
}

function helpText() {
  return `faster-whisper clean-cache validation

Usage:
  node scripts/stt-faster-whisper-clean-cache-validation.mjs [options]

Options:
  --out <dir>              Output root. Defaults to .ambient/stt-validation/faster-whisper-clean-cache.
  --run-id <id>            Stable run id. Defaults to a timestamp.
  --manifest <path>        Corpus manifest. Defaults to scripts/stt-spike/corpus.public-smoke.manifest.json.
  --model <id>             faster-whisper model. Defaults to tiny.en.
  --device <name>          faster-whisper device. Defaults to cpu.
  --compute-type <type>    faster-whisper compute type. Defaults to int8.
  --beam-size <n>          Beam size. Defaults to 1.
  --timeout-ms <ms>        Per-command timeout. Defaults to 600000.
  --help                   Show this help.
`;
}

async function runCommand(input) {
  const startedAt = Date.now();
  const child = spawn(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks = { stdout: [], stderr: [] };
  child.stdout.on("data", (chunk) => chunks.stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => chunks.stderr.push(Buffer.from(chunk)));
  const result = await new Promise((resolvePromise) => {
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolvePromise({ status: 1, error });
    });
    child.on("close", (status, signal) => {
      clearTimeout(timeout);
      resolvePromise({ status: timedOut ? 124 : (status ?? 1), signal: timedOut ? "SIGTERM" : signal });
    });
  });
  const stdout = Buffer.concat(chunks.stdout).toString("utf8");
  const stderr = Buffer.concat(chunks.stderr).toString("utf8");
  await writeFile(input.stdoutPath, stdout, "utf8");
  await writeFile(input.stderrPath, stderr, "utf8");
  return {
    ...result,
    stdout,
    stderr,
    stdoutPath: input.stdoutPath,
    stderrPath: input.stderrPath,
    durationMs: Date.now() - startedAt,
  };
}

async function summarizePath(path) {
  const metadata = await stat(path);
  if (!metadata.isDirectory()) {
    return { totalBytes: metadata.size, fileCount: 1, directoryCount: 0 };
  }
  const entries = await readdir(path, { withFileTypes: true });
  const summary = { totalBytes: 0, fileCount: 0, directoryCount: 0 };
  for (const entry of entries) {
    const child = await summarizePath(join(path, entry.name));
    summary.totalBytes += child.totalBytes;
    summary.fileCount += child.fileCount;
    summary.directoryCount += child.directoryCount + (entry.isDirectory() ? 1 : 0);
  }
  return summary;
}

async function fileSha256(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

function parseJsonText(text, label) {
  try {
    return JSON.parse(text.trim());
  } catch (error) {
    throw new Error(`Could not parse ${label} as JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function resolvePath(cwd, path) {
  return resolve(cwd, path);
}

function pathForReport(cwd, path) {
  const relativePath = relative(cwd, path);
  return relativePath && !relativePath.startsWith("..") ? relativePath : path;
}

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exit(1);
  });
}
