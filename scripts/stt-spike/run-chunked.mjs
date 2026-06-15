#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  execFileCapture,
  filterByIds,
  hostFacts,
  normalizeCorpus,
  normalizeProviders,
  pathForReport,
  prepareSample,
  readJson,
  resolvePath,
  runProvider,
  safeSegment,
  summarizeQuality,
} from "./run.mjs";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_CHUNK_MS = 4000;
const DEFAULT_MIN_CHUNK_MS = 750;
const RUN_SCHEMA_VERSION = 1;

export async function main(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    process.stdout.write(helpText());
    return 0;
  }

  const cwd = resolve(options.cwd ?? process.cwd());
  const corpusPath = resolvePath(cwd, requiredOption(parsed, "corpus"));
  const providersPath = resolvePath(cwd, requiredOption(parsed, "providers"));
  const outRoot = resolvePath(cwd, parsed.out ?? ".ambient/stt-spike/chunked-runs");
  const runId = parsed.runId ?? new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(outRoot, runId);
  const chunksDir = join(runDir, "chunks");
  const logsDir = join(runDir, "logs");
  const transcriptsDir = join(runDir, "transcripts");
  const normalizedDir = join(runDir, "normalized-audio");
  await mkdir(chunksDir, { recursive: true });
  await mkdir(logsDir, { recursive: true });
  await mkdir(transcriptsDir, { recursive: true });
  await mkdir(normalizedDir, { recursive: true });

  const corpus = normalizeCorpus(await readJson(corpusPath), dirname(corpusPath));
  const providers = normalizeProviders(await readJson(providersPath), dirname(providersPath));
  const selectedSamples = filterByIds(corpus.samples, parsed.onlySample, "sample");
  const selectedProviders = filterByIds(providers.providers, parsed.onlyProvider, "provider").filter((provider) => parsed.onlyProvider || provider.enabled !== false);
  const host = await hostFacts();
  const startedAt = new Date().toISOString();

  const resultPath = join(runDir, "results.json");
  const chunkResultPath = join(runDir, "chunk-results.jsonl");
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
        providersPath: pathForReport(cwd, providersPath),
        dryRun: parsed.dryRun,
        selectedSamples: selectedSamples.map((sample) => sample.id),
        selectedProviders: selectedProviders.map((provider) => provider.id),
        chunkMs: parsed.chunkMs,
        hopMs: parsed.hopMs,
        minChunkMs: parsed.minChunkMs,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(chunkResultPath, "");

  const results = [];
  for (const sample of selectedSamples) {
    const prepared = await prepareSample({
      sample,
      runDir,
      normalizedDir,
      cwd,
      normalize: parsed.normalize,
      allowMissing: parsed.dryRun,
    });
    const chunks = await makeChunks({
      sample,
      prepared,
      chunksDir,
      chunkMs: parsed.chunkMs,
      hopMs: parsed.hopMs,
      minChunkMs: parsed.minChunkMs,
      dryRun: parsed.dryRun,
      timeoutMs: parsed.timeoutMs,
    });
    for (const provider of selectedProviders) {
      const simulation = await runChunkedProvider({
        provider,
        sample,
        prepared,
        chunks,
        runDir,
        logsDir,
        transcriptsDir,
        cwd,
        host,
        dryRun: parsed.dryRun,
        timeoutMs: parsed.timeoutMs,
        threads: parsed.threads,
        chunkResultPath,
      });
      results.push(simulation);
    }
  }

  await writeFile(resultPath, `${JSON.stringify({ schemaVersion: RUN_SCHEMA_VERSION, runId, startedAt, results }, null, 2)}\n`);
  await writeFile(summaryPath, renderChunkedSummary({ runId, startedAt, host, results, paths: { resultPath, chunkResultPath, hostPath, runConfigPath }, cwd }));
  process.stdout.write(`STT chunked simulation complete\n`);
  process.stdout.write(`- run: ${runId}\n`);
  process.stdout.write(`- results: ${pathForReport(cwd, resultPath)}\n`);
  process.stdout.write(`- summary: ${pathForReport(cwd, summaryPath)}\n`);
  return results.some((result) => result.status === "failed") ? 1 : 0;
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    normalize: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    chunkMs: DEFAULT_CHUNK_MS,
    hopMs: undefined,
    minChunkMs: DEFAULT_MIN_CHUNK_MS,
    threads: String(Math.max(1, Math.min(cpus().length || 1, 8))),
  };
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
    if (arg === "--no-normalize") {
      parsed.normalize = false;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = camelCase(arg.slice(2));
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      index += 1;
      if (["timeoutMs", "chunkMs", "hopMs", "minChunkMs"].includes(key)) parsed[key] = Number(value);
      else parsed[key] = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  parsed.hopMs = parsed.hopMs ?? parsed.chunkMs;
  for (const key of ["timeoutMs", "chunkMs", "hopMs", "minChunkMs"]) {
    if (!Number.isFinite(parsed[key]) || parsed[key] <= 0) throw new Error(`--${kebabCase(key)} must be a positive number`);
  }
  if (parsed.hopMs > parsed.chunkMs) throw new Error("--hop-ms must be less than or equal to --chunk-ms");
  return parsed;
}

function helpText() {
  return `STT chunked/offline simulation

Usage:
  node scripts/stt-spike/run-chunked.mjs --corpus <corpus.json> --providers <providers.json> [options]

Options:
  --out <dir>              Output directory. Defaults to .ambient/stt-spike/chunked-runs.
  --run-id <id>            Stable run id. Defaults to an ISO timestamp.
  --only-provider <id>     Run one provider from the provider config.
  --only-sample <id>       Run one sample from the corpus config.
  --chunk-ms <ms>          Chunk window length. Defaults to 4000.
  --hop-ms <ms>            Time between chunk starts. Defaults to chunk-ms.
  --min-chunk-ms <ms>      Drop a trailing chunk below this length. Defaults to 750.
  --threads <n>            Placeholder value for {threads}. Defaults to min(cpu count, 8).
  --timeout-ms <ms>        Per-provider timeout. Defaults to 600000.
  --dry-run                Write planned commands without executing providers.
  --no-normalize           Do not normalize the source sample before chunking.
  --help                   Show this help.
`;
}

async function makeChunks(input) {
  const durationMs = input.prepared.durationMs;
  if (!durationMs || durationMs <= 0) throw new Error(`Sample ${input.sample.id} needs a known duration for chunked simulation.`);
  const chunks = [];
  for (let startMs = 0, index = 0; startMs < durationMs; startMs += input.hopMs, index += 1) {
    const endMs = Math.min(startMs + input.chunkMs, durationMs);
    const chunkDurationMs = endMs - startMs;
    if (chunkDurationMs < input.minChunkMs) continue;
    const chunkId = `${input.sample.id}__chunk-${String(index).padStart(3, "0")}`;
    const chunkPath = join(input.chunksDir, `${safeSegment(chunkId)}.wav`);
    if (!input.dryRun) {
      await splitAudioChunk({
        inputPath: input.prepared.audioPath,
        outputPath: chunkPath,
        startMs,
        durationMs: chunkDurationMs,
        timeoutMs: input.timeoutMs,
      });
    }
    const chunkStat = input.dryRun ? { size: undefined } : await stat(chunkPath);
    chunks.push({
      id: chunkId,
      index,
      path: chunkPath,
      startMs,
      endMs,
      durationMs: chunkDurationMs,
      sizeBytes: chunkStat.size,
    });
  }
  return chunks;
}

async function splitAudioChunk(input) {
  const result = await execFileCapture(
    "ffmpeg",
    [
      "-y",
      "-ss",
      seconds(input.startMs),
      "-t",
      seconds(input.durationMs),
      "-i",
      input.inputPath,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      input.outputPath,
    ],
    { timeoutMs: input.timeoutMs },
  );
  if (result.status !== "succeeded" || result.exitCode !== 0) {
    throw new Error(`Could not split chunk ${input.outputPath}: ${result.stderr || result.stdout}`);
  }
}

async function runChunkedProvider(input) {
  const startedAt = new Date().toISOString();
  const chunkResults = [];
  for (const chunk of input.chunks) {
    const chunkSample = {
      ...input.sample,
      id: chunk.id,
      path: chunk.path,
      expectedText: undefined,
      durationMs: chunk.durationMs,
      normalize: false,
      description: `${input.sample.description ?? input.sample.id} chunk ${chunk.index}`,
    };
    const chunkPrepared = {
      audioPath: chunk.path,
      missing: input.dryRun,
      normalized: false,
      normalization: { status: "skipped", reason: "chunk already materialized" },
      sourceSizeBytes: chunk.sizeBytes,
      durationMs: chunk.durationMs,
    };
    const result = await runProvider({
      provider: input.provider,
      sample: chunkSample,
      prepared: chunkPrepared,
      runDir: input.runDir,
      logsDir: input.logsDir,
      transcriptsDir: input.transcriptsDir,
      cwd: input.cwd,
      host: input.host,
      dryRun: input.dryRun,
      timeoutMs: input.timeoutMs,
      threads: input.threads,
    });
    const chunkResult = { ...result, chunk: { index: chunk.index, startMs: chunk.startMs, endMs: chunk.endMs, durationMs: chunk.durationMs } };
    chunkResults.push(chunkResult);
    await writeFile(input.chunkResultPath, `${JSON.stringify(chunkResult)}\n`, { flag: "a" });
  }
  const transcriptParts = chunkResults.map((result) => result.transcript.text.trim()).filter(Boolean);
  const stitchedTranscript = transcriptParts.join(" ").replace(/\s+/g, " ").trim();
  const timing = simulateOnlineTiming(input.chunks, chunkResults);
  const duplicate = summarizeDuplicateOverlap(transcriptParts);
  const quality = summarizeQuality(input.sample.expectedText, stitchedTranscript);
  const endedAt = new Date().toISOString();
  const failedChunks = chunkResults.filter((result) => result.status === "failed").length;
  const skippedChunks = chunkResults.filter((result) => result.status === "skipped").length;
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    id: randomUUID(),
    startedAt,
    endedAt,
    status: failedChunks ? "failed" : "succeeded",
    provider: {
      id: input.provider.id,
      label: input.provider.label,
      mode: input.provider.mode,
      model: input.provider.model,
    },
    sample: {
      id: input.sample.id,
      language: input.sample.language,
      description: input.sample.description,
      sourceUrl: input.sample.sourceUrl,
      license: input.sample.license,
    },
    chunks: {
      count: chunkResults.length,
      failed: failedChunks,
      skipped: skippedChunks,
      emptyTranscript: chunkResults.filter((result) => !result.transcript.text.trim()).length,
      nonEmptyTranscript: transcriptParts.length,
    },
    chunking: {
      chunkMs: input.chunks[0]?.durationMs,
      hopMs: input.chunks.length > 1 ? input.chunks[1].startMs - input.chunks[0].startMs : undefined,
      sourceDurationMs: input.prepared.durationMs,
    },
    metrics: {
      processingElapsedMs: chunkResults.reduce((sum, result) => sum + result.metrics.elapsedMs, 0),
      processingRealtimeFactor:
        input.prepared.durationMs && input.prepared.durationMs > 0
          ? Number((chunkResults.reduce((sum, result) => sum + result.metrics.elapsedMs, 0) / input.prepared.durationMs).toFixed(3))
          : undefined,
      simulatedFinalAtMs: timing.finalAtMs,
      simulatedRealtimeFactor:
        input.prepared.durationMs && input.prepared.durationMs > 0 && timing.finalAtMs !== undefined
          ? Number((timing.finalAtMs / input.prepared.durationMs).toFixed(3))
          : undefined,
      firstFinalAtMs: timing.firstFinalAtMs,
      firstFinalLatencyAfterChunkMs: timing.firstFinalLatencyAfterChunkMs,
      tailFinalLatencyMs:
        input.prepared.durationMs && timing.finalAtMs !== undefined ? Math.max(0, Math.round(timing.finalAtMs - input.prepared.durationMs)) : undefined,
    },
    duplicate,
    quality,
    transcript: {
      text: stitchedTranscript,
      preview: preview(stitchedTranscript),
    },
  };
}

function simulateOnlineTiming(chunks, results) {
  let workerAvailableAtMs = 0;
  let firstFinalAtMs;
  let firstFinalLatencyAfterChunkMs;
  let finalAtMs = 0;
  for (let index = 0; index < results.length; index += 1) {
    const chunk = chunks[index];
    const result = results[index];
    const startsAtMs = Math.max(workerAvailableAtMs, chunk.endMs);
    const completesAtMs = startsAtMs + result.metrics.elapsedMs;
    workerAvailableAtMs = completesAtMs;
    finalAtMs = completesAtMs;
    if (firstFinalAtMs === undefined && result.transcript.text.trim()) {
      firstFinalAtMs = Math.round(completesAtMs);
      firstFinalLatencyAfterChunkMs = Math.round(completesAtMs - chunk.endMs);
    }
  }
  return {
    firstFinalAtMs,
    firstFinalLatencyAfterChunkMs,
    finalAtMs: Math.round(finalAtMs),
  };
}

function summarizeDuplicateOverlap(parts) {
  let overlapChars = 0;
  const overlaps = [];
  for (let index = 1; index < parts.length; index += 1) {
    const overlap = suffixPrefixOverlap(normalizeForOverlap(parts[index - 1]), normalizeForOverlap(parts[index]));
    overlapChars += overlap;
    overlaps.push(overlap);
  }
  const totalChars = parts.reduce((sum, part) => sum + normalizeForOverlap(part).length, 0);
  return {
    adjacentOverlapChars: overlapChars,
    adjacentOverlapRatio: totalChars ? Number((overlapChars / totalChars).toFixed(3)) : 0,
    adjacentOverlaps: overlaps,
  };
}

function suffixPrefixOverlap(left, right) {
  const max = Math.min(120, left.length, right.length);
  for (let length = max; length > 0; length -= 1) {
    if (left.slice(-length) === right.slice(0, length)) return length;
  }
  return 0;
}

function renderChunkedSummary(input) {
  const lines = [
    `# STT Chunked Simulation ${input.runId}`,
    "",
    `Started: ${input.startedAt}`,
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
    "| Provider | Sample | Status | Chunks | Skipped | Proc RTF | Sim RTF | First Final | Tail Latency | CER | Dup Ratio | Transcript Preview |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...input.results.map((result) =>
      [
        escapeTable(result.provider.label),
        escapeTable(result.sample.id),
        result.status,
        result.chunks.count,
        result.chunks.skipped,
        result.metrics.processingRealtimeFactor ?? "",
        result.metrics.simulatedRealtimeFactor ?? "",
        result.metrics.firstFinalAtMs === undefined ? "" : `${result.metrics.firstFinalAtMs} ms`,
        result.metrics.tailFinalLatencyMs === undefined ? "" : `${result.metrics.tailFinalLatencyMs} ms`,
        result.quality?.charErrorRate ?? "",
        result.duplicate.adjacentOverlapRatio,
        escapeTable(result.transcript.preview ?? ""),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    ),
    "",
    "## Artifacts",
    "",
    `- Results JSON: ${pathForReport(input.cwd, input.paths.resultPath)}`,
    `- Chunk results JSONL: ${pathForReport(input.cwd, input.paths.chunkResultPath)}`,
    `- Host facts: ${pathForReport(input.cwd, input.paths.hostPath)}`,
    `- Run config: ${pathForReport(input.cwd, input.paths.runConfigPath)}`,
    "",
  ];
  return lines.join("\n");
}

function normalizeForOverlap(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function requiredOption(parsed, key) {
  const value = parsed[key];
  if (!value) throw new Error(`Missing required option --${kebabCase(key)}`);
  return value;
}

function seconds(ms) {
  return (ms / 1000).toFixed(3);
}

function preview(value, maxChars = 220) {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
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
