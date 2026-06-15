#!/usr/bin/env node
import { cpus } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { main as runChunkedMain } from "./run-chunked.mjs";
import { hostFacts, pathForReport, resolvePath } from "./run.mjs";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MIN_CHUNK_MS = 750;
const DEFAULT_CHUNK_MS_VALUES = "2000,4000,8000";
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
  const outRoot = resolvePath(cwd, parsed.out ?? ".ambient/stt-spike/chunked-matrix");
  const runId = parsed.runId ?? new Date().toISOString().replace(/[:.]/g, "-");
  const matrixDir = join(outRoot, runId);
  const chunkedRunsDir = join(matrixDir, "chunked-runs");
  await mkdir(chunkedRunsDir, { recursive: true });

  const host = await hostFacts();
  const startedAt = new Date().toISOString();
  const runSummaries = [];
  for (const chunkMs of parsed.chunkMsValues) {
    const hopMs = Math.max(1, Math.round(chunkMs * parsed.hopRatio));
    const subRunId = `chunk-${chunkMs}ms-hop-${hopMs}ms`;
    const args = [
      "--corpus",
      corpusPath,
      "--providers",
      providersPath,
      "--out",
      chunkedRunsDir,
      "--run-id",
      subRunId,
      "--chunk-ms",
      String(chunkMs),
      "--hop-ms",
      String(hopMs),
      "--min-chunk-ms",
      String(parsed.minChunkMs),
      "--threads",
      String(parsed.threads),
      "--timeout-ms",
      String(parsed.timeoutMs),
    ];
    if (parsed.onlyProvider) args.push("--only-provider", parsed.onlyProvider);
    if (parsed.onlySample) args.push("--only-sample", parsed.onlySample);
    if (parsed.dryRun) args.push("--dry-run");
    if (!parsed.normalize) args.push("--no-normalize");

    process.stdout.write(`Running chunked simulation for chunk=${chunkMs} ms hop=${hopMs} ms\n`);
    const exitCode = await runChunkedMain(args, { cwd });
    const resultPath = join(chunkedRunsDir, subRunId, "results.json");
    const summaryPath = join(chunkedRunsDir, subRunId, "summary.md");
    const chunkResultPath = join(chunkedRunsDir, subRunId, "chunk-results.jsonl");
    const resultJson = JSON.parse(await readFile(resultPath, "utf8"));
    const runSummary = summarizeChunkRun({
      chunkMs,
      hopMs,
      exitCode,
      results: resultJson.results,
      paths: { resultPath, summaryPath, chunkResultPath },
      cwd,
    });
    runSummaries.push(runSummary);
    if (exitCode !== 0) throw new Error(`Chunked simulation failed for chunk=${chunkMs} ms. See ${pathForReport(cwd, resultPath)}`);
  }

  const completedAt = new Date().toISOString();
  const recommendation = recommend(runSummaries);
  const matrix = {
    schemaVersion: RUN_SCHEMA_VERSION,
    runId,
    startedAt,
    completedAt,
    host,
    config: {
      corpusPath: pathForReport(cwd, corpusPath),
      providersPath: pathForReport(cwd, providersPath),
      chunkMsValues: parsed.chunkMsValues,
      hopRatio: parsed.hopRatio,
      minChunkMs: parsed.minChunkMs,
      dryRun: parsed.dryRun,
      normalize: parsed.normalize,
      onlyProvider: parsed.onlyProvider,
      onlySample: parsed.onlySample,
      threads: parsed.threads,
      timeoutMs: parsed.timeoutMs,
    },
    runs: runSummaries,
    recommendation,
  };

  const matrixResultPath = join(matrixDir, "matrix-results.json");
  const matrixSummaryPath = join(matrixDir, "matrix-summary.md");
  await writeFile(matrixResultPath, `${JSON.stringify(matrix, null, 2)}\n`);
  await writeFile(matrixSummaryPath, renderMatrixSummary({ matrix, paths: { matrixResultPath, matrixSummaryPath }, cwd }));

  process.stdout.write("STT chunked matrix complete\n");
  process.stdout.write(`- run: ${runId}\n`);
  process.stdout.write(`- results: ${pathForReport(cwd, matrixResultPath)}\n`);
  process.stdout.write(`- summary: ${pathForReport(cwd, matrixSummaryPath)}\n`);
  return 0;
}

function summarizeChunkRun(input) {
  const speechResults = input.results.filter((result) => result.quality?.charErrorRate !== undefined);
  const timingResults = speechResults.length ? speechResults : input.results;
  const totalChunks = sum(input.results, (result) => result.chunks.count);
  const skippedChunks = sum(input.results, (result) => result.chunks.skipped);
  const failedChunks = sum(input.results, (result) => result.chunks.failed);
  const nonEmptyChunks = sum(input.results, (result) => result.chunks.nonEmptyTranscript);
  const aggregate = {
    sampleCount: input.results.length,
    speechSampleCount: speechResults.length,
    failedResultCount: input.results.filter((result) => result.status === "failed").length,
    totalChunks,
    skippedChunks,
    failedChunks,
    nonEmptyChunks,
    skippedChunkRatio: totalChunks ? round3(skippedChunks / totalChunks) : undefined,
    avgSpeechCer: average(speechResults, (result) => result.quality.charErrorRate),
    avgProcessingRealtimeFactor: average(timingResults, (result) => result.metrics.processingRealtimeFactor),
    avgSimulatedRealtimeFactor: average(timingResults, (result) => result.metrics.simulatedRealtimeFactor),
    avgFirstFinalAtMs: roundWhole(average(timingResults, (result) => result.metrics.firstFinalAtMs)),
    avgTailFinalLatencyMs: roundWhole(average(timingResults, (result) => result.metrics.tailFinalLatencyMs)),
    maxFirstFinalAtMs: max(timingResults, (result) => result.metrics.firstFinalAtMs),
    maxTailFinalLatencyMs: max(timingResults, (result) => result.metrics.tailFinalLatencyMs),
    avgDuplicateAdjacentOverlapRatio: average(timingResults, (result) => result.duplicate.adjacentOverlapRatio),
  };
  return {
    chunkMs: input.chunkMs,
    hopMs: input.hopMs,
    overlapMs: Math.max(0, input.chunkMs - input.hopMs),
    exitCode: input.exitCode,
    classification: classify(aggregate),
    aggregate,
    paths: {
      resultsJson: pathForReport(input.cwd, input.paths.resultPath),
      summaryMarkdown: pathForReport(input.cwd, input.paths.summaryPath),
      chunkResultsJsonl: pathForReport(input.cwd, input.paths.chunkResultPath),
    },
  };
}

function classify(aggregate) {
  if (aggregate.failedResultCount > 0 || aggregate.failedChunks > 0) return "failed";
  if (aggregate.speechSampleCount === 0) return "no-speech-only";
  if (
    aggregate.avgFirstFinalAtMs !== undefined &&
    aggregate.avgTailFinalLatencyMs !== undefined &&
    aggregate.avgSimulatedRealtimeFactor !== undefined &&
    aggregate.avgFirstFinalAtMs <= 2500 &&
    aggregate.avgTailFinalLatencyMs <= 1000 &&
    aggregate.avgSimulatedRealtimeFactor <= 1.05
  ) {
    return "live-candidate";
  }
  if (
    aggregate.avgFirstFinalAtMs !== undefined &&
    aggregate.avgTailFinalLatencyMs !== undefined &&
    aggregate.avgSimulatedRealtimeFactor !== undefined &&
    aggregate.avgFirstFinalAtMs <= 8000 &&
    aggregate.avgTailFinalLatencyMs <= 4000 &&
    aggregate.avgSimulatedRealtimeFactor <= 1.5
  ) {
    return "buffered-ready";
  }
  return "offline-only";
}

function recommend(runs) {
  const usableRuns = runs.filter((run) => run.classification !== "failed" && run.classification !== "no-speech-only");
  const liveCandidate = usableRuns.find((run) => run.classification === "live-candidate");
  const bufferedRuns = usableRuns.filter((run) => run.classification === "buffered-ready" || run.classification === "live-candidate");
  const preferred = rankRuns(bufferedRuns.length ? bufferedRuns : usableRuns)[0];
  if (!preferred) {
    return {
      mode: "blocked",
      preferredChunkMs: undefined,
      rationale: "No usable speech rows were available in this matrix.",
    };
  }
  if (liveCandidate) {
    return {
      mode: "live-candidate",
      preferredChunkMs: liveCandidate.chunkMs,
      rationale: `The ${liveCandidate.chunkMs} ms row met the matrix latency thresholds for a live candidate.`,
    };
  }
  const mode = preferred.classification === "buffered-ready" ? "buffered-or-push-to-talk" : "offline-only";
  const rationale =
    mode === "buffered-or-push-to-talk"
      ? `The ${preferred.chunkMs} ms row has the best measured tradeoff, but no row met live latency thresholds. Treat GGUF/llama.cpp as buffered STT unless a true streaming runtime improves partial latency.`
      : `The ${preferred.chunkMs} ms row is the best measured tradeoff, but the matrix did not meet buffered latency thresholds.`;
  return {
    mode,
    preferredChunkMs: preferred.chunkMs,
    rationale,
  };
}

function rankRuns(runs) {
  return [...runs].sort((left, right) => scoreRun(left) - scoreRun(right));
}

function scoreRun(run) {
  const aggregate = run.aggregate;
  const cer = aggregate.avgSpeechCer ?? 1;
  const firstFinal = aggregate.avgFirstFinalAtMs ?? 60_000;
  const tail = aggregate.avgTailFinalLatencyMs ?? 60_000;
  const simRtf = aggregate.avgSimulatedRealtimeFactor ?? 10;
  return cer * 100 + firstFinal / 10_000 + tail / 10_000 + simRtf;
}

function renderMatrixSummary(input) {
  const lines = [
    `# STT Chunked Matrix ${input.matrix.runId}`,
    "",
    `Started: ${input.matrix.startedAt}`,
    `Completed: ${input.matrix.completedAt}`,
    "",
    "## Host",
    "",
    `- OS: ${input.matrix.host.platform} ${input.matrix.host.release} ${input.matrix.host.arch}`,
    `- CPU: ${input.matrix.host.cpuModel ?? "unknown"} (${input.matrix.host.cpuCount ?? "unknown"} cores)`,
    `- RAM: ${input.matrix.host.memoryBytes ? `${Math.round(input.matrix.host.memoryBytes / 1024 / 1024 / 1024)} GB` : "unknown"}`,
    `- Node: ${process.version}`,
    "",
    "## Matrix",
    "",
    "| Chunk | Hop | Class | Speech CER | Proc RTF | Sim RTF | First Final | Tail Latency | Chunks | Skipped | Dup Ratio |",
    "| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...input.matrix.runs.map((run) =>
      [
        `${run.chunkMs} ms`,
        `${run.hopMs} ms`,
        run.classification,
        formatNumber(run.aggregate.avgSpeechCer),
        formatNumber(run.aggregate.avgProcessingRealtimeFactor),
        formatNumber(run.aggregate.avgSimulatedRealtimeFactor),
        formatMs(run.aggregate.avgFirstFinalAtMs),
        formatMs(run.aggregate.avgTailFinalLatencyMs),
        run.aggregate.totalChunks,
        run.aggregate.skippedChunks,
        formatNumber(run.aggregate.avgDuplicateAdjacentOverlapRatio),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    ),
    "",
    "## Recommendation",
    "",
    `- Mode: ${input.matrix.recommendation.mode}`,
    `- Preferred chunk: ${input.matrix.recommendation.preferredChunkMs ? `${input.matrix.recommendation.preferredChunkMs} ms` : "none"}`,
    `- Rationale: ${input.matrix.recommendation.rationale}`,
    "",
    "## Subruns",
    "",
    ...input.matrix.runs.flatMap((run) => [
      `### ${run.chunkMs} ms chunks`,
      "",
      `- Results JSON: ${run.paths.resultsJson}`,
      `- Summary: ${run.paths.summaryMarkdown}`,
      `- Chunk results JSONL: ${run.paths.chunkResultsJsonl}`,
      "",
    ]),
    "## Artifacts",
    "",
    `- Matrix results JSON: ${pathForReport(input.cwd, input.paths.matrixResultPath)}`,
    `- Matrix summary: ${pathForReport(input.cwd, input.paths.matrixSummaryPath)}`,
    "",
  ];
  return lines.join("\n");
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    normalize: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    minChunkMs: DEFAULT_MIN_CHUNK_MS,
    chunkMsValues: parseNumberList(DEFAULT_CHUNK_MS_VALUES, "--chunk-ms-values"),
    hopRatio: 1,
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
      if (key === "chunkMsValues") parsed.chunkMsValues = parseNumberList(value, arg);
      else if (["timeoutMs", "minChunkMs", "hopRatio"].includes(key)) parsed[key] = Number(value);
      else parsed[key] = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs <= 0) throw new Error("--timeout-ms must be a positive number");
  if (!Number.isFinite(parsed.minChunkMs) || parsed.minChunkMs <= 0) throw new Error("--min-chunk-ms must be a positive number");
  if (!Number.isFinite(parsed.hopRatio) || parsed.hopRatio <= 0 || parsed.hopRatio > 1) throw new Error("--hop-ratio must be greater than 0 and less than or equal to 1");
  return parsed;
}

function helpText() {
  return `STT chunk-size matrix

Usage:
  node scripts/stt-spike/run-chunked-matrix.mjs --corpus <corpus.json> --providers <providers.json> [options]

Options:
  --out <dir>                  Output directory. Defaults to .ambient/stt-spike/chunked-matrix.
  --run-id <id>                Stable run id. Defaults to an ISO timestamp.
  --only-provider <id>         Run one provider from the provider config.
  --only-sample <id>           Run one sample from the corpus config.
  --chunk-ms-values <list>     Comma-separated chunk sizes. Defaults to 2000,4000,8000.
  --hop-ratio <ratio>          Hop as a ratio of chunk size. Defaults to 1 for no overlap.
  --min-chunk-ms <ms>          Drop a trailing chunk below this length. Defaults to 750.
  --threads <n>                Placeholder value for {threads}. Defaults to min(cpu count, 8).
  --timeout-ms <ms>            Per-provider timeout. Defaults to 600000.
  --dry-run                    Write planned commands without executing providers.
  --no-normalize               Do not normalize the source sample before chunking.
  --help                       Show this help.
`;
}

function parseNumberList(value, label) {
  const numbers = String(value)
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((number) => Number.isFinite(number));
  if (!numbers.length) throw new Error(`${label} must contain at least one number`);
  for (const number of numbers) {
    if (number <= 0) throw new Error(`${label} values must be positive numbers`);
  }
  return [...new Set(numbers)].sort((left, right) => left - right);
}

function requiredOption(parsed, key) {
  const value = parsed[key];
  if (!value) throw new Error(`Missing required option --${kebabCase(key)}`);
  return value;
}

function average(items, fn) {
  const values = items.map(fn).filter((value) => Number.isFinite(value));
  if (!values.length) return undefined;
  return round3(values.reduce((sumValue, value) => sumValue + value, 0) / values.length);
}

function sum(items, fn) {
  return items.reduce((sumValue, item) => sumValue + (Number(fn(item)) || 0), 0);
}

function max(items, fn) {
  const values = items.map(fn).filter((value) => Number.isFinite(value));
  if (!values.length) return undefined;
  return Math.max(...values);
}

function round3(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : undefined;
}

function roundWhole(value) {
  return Number.isFinite(value) ? Math.round(value) : undefined;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "";
}

function formatMs(value) {
  return Number.isFinite(value) ? `${Math.round(value)} ms` : "";
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
