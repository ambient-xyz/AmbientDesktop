#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { filterByIds, hostFacts, normalizeCorpus, pathForReport, readJson, resolvePath, safeSegment, summarizeQuality } from "./run.mjs";

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_MODES = "stream-stdin";
const RUN_SCHEMA_VERSION = 1;
const MONITOR_SYMBOLS = new Set(["▶", "·", "▪", "▸", "⟳"]);

export async function main(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    process.stdout.write(helpText());
    return 0;
  }

  const cwd = resolve(options.cwd ?? process.cwd());
  const corpusPath = resolvePath(cwd, requiredOption(parsed, "corpus"));
  const binaryPath = resolvePath(cwd, requiredOption(parsed, "binary"));
  const modelDir = resolvePath(cwd, requiredOption(parsed, "modelDir"));
  const outRoot = resolvePath(cwd, parsed.out ?? ".ambient/stt-spike/qwen-asr-streaming");
  const runId = parsed.runId ?? new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(outRoot, runId);
  const logsDir = join(runDir, "logs");
  const transcriptsDir = join(runDir, "transcripts");
  await mkdir(logsDir, { recursive: true });
  await mkdir(transcriptsDir, { recursive: true });

  const corpus = normalizeCorpus(await readJson(corpusPath), dirname(corpusPath));
  const selectedSamples = filterByIds(corpus.samples, parsed.onlySample, "sample");
  const host = await hostFacts();
  const startedAt = new Date().toISOString();
  const resultPath = join(runDir, "results.json");
  const summaryPath = join(runDir, "summary.md");
  const hostPath = join(runDir, "host.json");
  const runConfigPath = join(runDir, "run-config.json");

  await writeFile(hostPath, `${JSON.stringify(host, null, 2)}\n`);
  await writeFile(
    runConfigPath,
    `${JSON.stringify(
      {
        schemaVersion: RUN_SCHEMA_VERSION,
        runId,
        startedAt,
        corpusPath: pathForReport(cwd, corpusPath),
        binaryPath: pathForReport(cwd, binaryPath),
        modelDir: pathForReport(cwd, modelDir),
        selectedSamples: selectedSamples.map((sample) => sample.id),
        modes: parsed.modes,
        forceLanguage: parsed.forceLanguage,
        realtimeStdin: parsed.realtimeStdin,
        skipSilence: parsed.skipSilence,
        pastText: parsed.pastText,
        encWindowSec: parsed.encWindowSec,
        streamMaxNewTokens: parsed.streamMaxNewTokens,
        timeoutMs: parsed.timeoutMs,
      },
      null,
      2,
    )}\n`,
  );

  const results = [];
  for (const sample of selectedSamples) {
    for (const mode of parsed.modes) {
      const result = await runProbe({
        sample,
        mode,
        binaryPath,
        modelDir,
        cwd,
        logsDir,
        transcriptsDir,
        ffmpeg: parsed.ffmpeg,
        forceLanguage: parsed.forceLanguage,
        realtimeStdin: parsed.realtimeStdin,
        skipSilence: parsed.skipSilence,
        pastText: parsed.pastText,
        encWindowSec: parsed.encWindowSec,
        streamMaxNewTokens: parsed.streamMaxNewTokens,
        timeoutMs: parsed.timeoutMs,
      });
      results.push(result);
      process.stdout.write(`${result.mode} ${result.sample.id}: ${result.status}, first text ${formatMs(result.metrics.firstTextAtMs)}, elapsed ${formatMs(result.metrics.elapsedMs)}\n`);
    }
  }

  const completedAt = new Date().toISOString();
  await writeFile(resultPath, `${JSON.stringify({ schemaVersion: RUN_SCHEMA_VERSION, runId, startedAt, completedAt, results }, null, 2)}\n`);
  await writeFile(summaryPath, renderSummary({ runId, startedAt, completedAt, host, results, paths: { resultPath, hostPath, runConfigPath }, cwd }));

  process.stdout.write("Qwen-ASR streaming probe complete\n");
  process.stdout.write(`- run: ${runId}\n`);
  process.stdout.write(`- results: ${pathForReport(cwd, resultPath)}\n`);
  process.stdout.write(`- summary: ${pathForReport(cwd, summaryPath)}\n`);
  return results.some((result) => result.status === "failed" || result.status === "timeout") ? 1 : 0;
}

async function runProbe(input) {
  const id = randomUUID();
  const startedAt = new Date().toISOString();
  const safeName = safeSegment(`${input.mode}-${input.sample.id}`);
  const stdoutPath = join(input.logsDir, `${safeName}.stdout.txt`);
  const stderrPath = join(input.logsDir, `${safeName}.stderr.txt`);
  const ffmpegStderrPath = join(input.logsDir, `${safeName}.ffmpeg.stderr.txt`);
  const transcriptPath = join(input.transcriptsDir, `${safeName}.txt`);
  const qwenArgs = buildQwenArgs(input);
  const ffmpegArgs = input.mode === "stream-stdin" ? buildFfmpegArgs(input) : undefined;
  const startedNs = process.hrtime.bigint();
  const events = [];
  let stdout = "";
  let stderr = "";
  let ffmpegStderr = "";
  let firstStdoutAtMs;
  let firstTextAtMs;
  let firstMonitorAtMs;
  let firstMonitorSymbol;
  let timedOut = false;
  let ffmpegExit;

  const qwen = spawn(input.binaryPath, qwenArgs, { cwd: input.cwd, stdio: ["pipe", "pipe", "pipe"] });
  let ffmpeg;
  if (ffmpegArgs) {
    ffmpeg = spawn(input.ffmpeg, ffmpegArgs, { cwd: input.cwd, stdio: ["ignore", "pipe", "pipe"] });
    ffmpeg.stdout.pipe(qwen.stdin);
    ffmpeg.stderr.on("data", (chunk) => {
      ffmpegStderr += chunk.toString("utf8");
    });
    ffmpeg.on("close", (code, signal) => {
      ffmpegExit = { code, signal };
    });
  } else {
    qwen.stdin.end();
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    ffmpeg?.kill("SIGKILL");
    qwen.kill("SIGKILL");
  }, input.timeoutMs);

  qwen.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    const atMs = elapsedMs(startedNs);
    if (firstStdoutAtMs === undefined) firstStdoutAtMs = atMs;
    if (firstTextAtMs === undefined && text.trim()) firstTextAtMs = atMs;
    stdout += text;
    events.push({ stream: "stdout", atMs, bytes: chunk.length, preview: preview(text, 120) });
  });
  qwen.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    const atMs = elapsedMs(startedNs);
    const symbol = firstMonitorSymbolFrom(text);
    if (firstMonitorAtMs === undefined && symbol) {
      firstMonitorAtMs = atMs;
      firstMonitorSymbol = symbol;
    }
    stderr += text;
    events.push({ stream: "stderr", atMs, bytes: chunk.length, preview: preview(text, 120) });
  });

  const qwenExit = await new Promise((resolvePromise) => {
    qwen.on("close", (code, signal) => resolvePromise({ code, signal }));
  });
  clearTimeout(timeout);
  if (ffmpeg && ffmpegExit === undefined) {
    ffmpegExit = await new Promise((resolvePromise) => {
      ffmpeg.on("close", (code, signal) => resolvePromise({ code, signal }));
    });
  }

  const elapsed = elapsedMs(startedNs);
  const transcript = stdout.trim().replace(/\s+/g, " ");
  await writeFile(stdoutPath, stdout);
  await writeFile(stderrPath, stderr);
  if (ffmpegArgs) await writeFile(ffmpegStderrPath, ffmpegStderr);
  await writeFile(transcriptPath, `${transcript}\n`);
  const status = timedOut ? "timeout" : qwenExit.code === 0 && (!ffmpegExit || ffmpegExit.code === 0) ? "succeeded" : "failed";
  const sourceDurationMs = input.sample.durationMs;
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    id,
    startedAt,
    endedAt: new Date().toISOString(),
    status,
    mode: input.mode,
    sample: {
      id: input.sample.id,
      language: input.sample.language,
      durationMs: sourceDurationMs,
      description: input.sample.description,
      sourceUrl: input.sample.sourceUrl,
      license: input.sample.license,
    },
    command: {
      binary: pathForReport(input.cwd, input.binaryPath),
      args: qwenArgs,
      ffmpeg: ffmpegArgs ? { command: input.ffmpeg, args: ffmpegArgs } : undefined,
    },
    exit: {
      qwen: qwenExit,
      ffmpeg: ffmpegExit,
      timedOut,
    },
    metrics: {
      elapsedMs: elapsed,
      sourceDurationMs,
      realtimeFactor: sourceDurationMs ? round3(elapsed / sourceDurationMs) : undefined,
      firstStdoutAtMs,
      firstTextAtMs,
      firstMonitorAtMs,
      firstMonitorSymbol,
      tailLatencyMs: sourceDurationMs ? Math.max(0, Math.round(elapsed - sourceDurationMs)) : undefined,
      eventCount: events.length,
    },
    quality: summarizeQuality(input.sample.expectedText, transcript),
    transcript: {
      text: transcript,
      preview: preview(transcript, 240),
      path: pathForReport(input.cwd, transcriptPath),
    },
    artifacts: {
      stdoutPath: pathForReport(input.cwd, stdoutPath),
      stderrPath: pathForReport(input.cwd, stderrPath),
      ffmpegStderrPath: ffmpegArgs ? pathForReport(input.cwd, ffmpegStderrPath) : undefined,
    },
    events: events.slice(0, 200),
  };
}

function buildQwenArgs(input) {
  const args = ["-d", input.modelDir];
  if (input.mode === "stream-stdin") args.push("--stdin");
  else args.push("-i", input.sample.path);
  if (input.mode !== "offline-file") args.push("--stream", "--monitor");
  if (input.forceLanguage && input.sample.language) args.push("--language", input.sample.language);
  if (input.skipSilence) args.push("--skip-silence");
  if (input.pastText) args.push("--past-text", input.pastText);
  if (input.encWindowSec !== undefined) args.push("--enc-window-sec", String(input.encWindowSec));
  if (input.streamMaxNewTokens !== undefined) args.push("--stream-max-new-tokens", String(input.streamMaxNewTokens));
  return args;
}

function buildFfmpegArgs(input) {
  const args = [];
  if (input.realtimeStdin) args.push("-re");
  args.push("-i", input.sample.path, "-f", "s16le", "-ar", "16000", "-ac", "1", "-");
  return args;
}

function renderSummary(input) {
  const lines = [
    `# Qwen-ASR Streaming Probe ${input.runId}`,
    "",
    `Started: ${input.startedAt}`,
    `Completed: ${input.completedAt}`,
    "",
    "## Host",
    "",
    `- OS: ${input.host.platform} ${input.host.release} ${input.host.arch}`,
    `- CPU: ${input.host.cpuModel ?? "unknown"} (${input.host.cpuCount ?? "unknown"} cores)`,
    `- RAM: ${input.host.memoryBytes ? `${Math.round(input.host.memoryBytes / 1024 / 1024 / 1024)} GB` : "unknown"}`,
    `- Node: ${process.version}`,
    "",
    "## Results",
    "",
    "| Mode | Sample | Status | Duration | First Text | First Monitor | Elapsed | RTF | Tail | CER | Transcript Preview |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...input.results.map((result) =>
      [
        result.mode,
        result.sample.id,
        result.status,
        formatMs(result.sample.durationMs),
        formatMs(result.metrics.firstTextAtMs),
        result.metrics.firstMonitorAtMs === undefined ? "" : `${formatMs(result.metrics.firstMonitorAtMs)} ${result.metrics.firstMonitorSymbol ?? ""}`.trim(),
        formatMs(result.metrics.elapsedMs),
        formatNumber(result.metrics.realtimeFactor),
        formatMs(result.metrics.tailLatencyMs),
        formatNumber(result.quality?.charErrorRate),
        escapeTable(result.transcript.preview),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    ),
    "",
    "## Artifacts",
    "",
    `- Results JSON: ${pathForReport(input.cwd, input.paths.resultPath)}`,
    `- Host facts: ${pathForReport(input.cwd, input.paths.hostPath)}`,
    `- Run config: ${pathForReport(input.cwd, input.paths.runConfigPath)}`,
    "",
  ];
  return lines.join("\n");
}

function parseArgs(argv) {
  const parsed = {
    modes: parseModes(DEFAULT_MODES),
    forceLanguage: true,
    realtimeStdin: true,
    skipSilence: false,
    ffmpeg: "ffmpeg",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    threads: String(Math.max(1, Math.min(cpus().length || 1, 8))),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--auto-language") {
      parsed.forceLanguage = false;
      continue;
    }
    if (arg === "--no-realtime-stdin") {
      parsed.realtimeStdin = false;
      continue;
    }
    if (arg === "--skip-silence") {
      parsed.skipSilence = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = camelCase(arg.slice(2));
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      index += 1;
      if (key === "modes") parsed.modes = parseModes(value);
      else if (["timeoutMs", "encWindowSec", "streamMaxNewTokens"].includes(key)) parsed[key] = Number(value);
      else parsed[key] = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs <= 0) throw new Error("--timeout-ms must be a positive number");
  for (const key of ["encWindowSec", "streamMaxNewTokens"]) {
    if (parsed[key] !== undefined && (!Number.isFinite(parsed[key]) || parsed[key] <= 0)) throw new Error(`--${kebabCase(key)} must be a positive number`);
  }
  return parsed;
}

function parseModes(value) {
  const modes = String(value)
    .split(",")
    .map((mode) => mode.trim())
    .filter(Boolean);
  const allowed = new Set(["offline-file", "stream-file", "stream-stdin"]);
  for (const mode of modes) {
    if (!allowed.has(mode)) throw new Error(`Unsupported mode: ${mode}`);
  }
  if (!modes.length) throw new Error("--modes must include at least one mode");
  return [...new Set(modes)];
}

function helpText() {
  return `Qwen-ASR streaming probe

Usage:
  node scripts/stt-spike/probe-qwen-asr-streaming.mjs --corpus <corpus.json> --binary <qwen_asr> --model-dir <dir> [options]

Options:
  --out <dir>                   Output directory. Defaults to .ambient/stt-spike/qwen-asr-streaming.
  --run-id <id>                 Stable run id. Defaults to an ISO timestamp.
  --only-sample <id>            Run one sample from the corpus config.
  --modes <list>                Comma-separated modes: offline-file,stream-file,stream-stdin. Defaults to stream-stdin.
  --auto-language               Do not pass --language from the corpus sample.
  --no-realtime-stdin           For stream-stdin, omit ffmpeg -re.
  --skip-silence                Pass --skip-silence to qwen_asr.
  --past-text <yes|no|auto>     Pass --past-text to qwen_asr.
  --enc-window-sec <n>          Pass --enc-window-sec to qwen_asr.
  --stream-max-new-tokens <n>   Pass --stream-max-new-tokens to qwen_asr.
  --ffmpeg <path>               ffmpeg command for stream-stdin. Defaults to ffmpeg.
  --timeout-ms <ms>             Per-probe timeout. Defaults to 1200000.
  --help                        Show this help.
`;
}

function elapsedMs(startedNs) {
  return Math.round(Number(process.hrtime.bigint() - startedNs) / 1_000_000);
}

function firstMonitorSymbolFrom(value) {
  for (const char of value) {
    if (MONITOR_SYMBOLS.has(char)) return char;
  }
  return undefined;
}

function requiredOption(parsed, key) {
  const value = parsed[key];
  if (!value) throw new Error(`Missing required option --${kebabCase(key)}`);
  return value;
}

function round3(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : undefined;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "";
}

function formatMs(value) {
  return Number.isFinite(value) ? `${Math.round(value)} ms` : "";
}

function preview(value, maxChars = 220) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

function escapeTable(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function kebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
