#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_PREVIEW_CHARS = 220;
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
  const outRoot = resolvePath(cwd, parsed.out ?? ".ambient/stt-spike");
  const runId = parsed.runId ?? new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(outRoot, runId);
  const logsDir = join(runDir, "logs");
  const transcriptsDir = join(runDir, "transcripts");
  const normalizedDir = join(runDir, "normalized-audio");
  await mkdir(logsDir, { recursive: true });
  await mkdir(transcriptsDir, { recursive: true });
  await mkdir(normalizedDir, { recursive: true });

  const corpus = normalizeCorpus(await readJson(corpusPath), dirname(corpusPath));
  const providers = normalizeProviders(await readJson(providersPath), dirname(providersPath));
  const selectedSamples = filterByIds(corpus.samples, parsed.onlySample, "sample");
  const selectedProviders = filterByIds(providers.providers, parsed.onlyProvider, "provider").filter((provider) => parsed.onlyProvider || provider.enabled !== false);
  const runStartedAt = new Date().toISOString();
  const host = await hostFacts();

  const resultPath = join(runDir, "results.jsonl");
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
        startedAt: runStartedAt,
        corpusPath: pathForReport(cwd, corpusPath),
        providersPath: pathForReport(cwd, providersPath),
        dryRun: parsed.dryRun,
        selectedSamples: selectedSamples.map((sample) => sample.id),
        selectedProviders: selectedProviders.map((provider) => provider.id),
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(resultPath, "");

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
    for (const provider of selectedProviders) {
      const result = await runProvider({
        provider,
        sample,
        prepared,
        runDir,
        logsDir,
        transcriptsDir,
        cwd,
        host,
        dryRun: parsed.dryRun,
        timeoutMs: parsed.timeoutMs,
        threads: parsed.threads,
      });
      results.push(result);
      await appendJsonl(resultPath, result);
    }
  }

  await writeFile(
    summaryPath,
    renderSummary({
      runId,
      startedAt: runStartedAt,
      host,
      corpus,
      providers: selectedProviders,
      results,
      paths: { resultPath, hostPath, runConfigPath },
      cwd,
    }),
  );

  process.stdout.write(`STT spike run complete\n`);
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
      if (key === "timeoutMs") parsed.timeoutMs = Number(value);
      else parsed[key] = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs <= 0) throw new Error("--timeout-ms must be a positive number");
  return parsed;
}

function helpText() {
  return `STT spike benchmark harness

Usage:
  node scripts/stt-spike/run.mjs --corpus <corpus.json> --providers <providers.json> [options]

Options:
  --out <dir>              Output directory. Defaults to .ambient/stt-spike.
  --run-id <id>            Stable run id. Defaults to an ISO timestamp.
  --only-provider <id>     Run one provider from the provider config.
  --only-sample <id>       Run one sample from the corpus config.
  --threads <n>            Placeholder value for {threads}. Defaults to min(cpu count, 8).
  --timeout-ms <ms>        Per-provider timeout. Defaults to 600000.
  --dry-run                Write planned commands without executing providers.
  --no-normalize           Do not normalize audio with ffmpeg, even for samples requesting it.
  --help                   Show this help.
`;
}

export async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function normalizeCorpus(input, baseDir) {
  if (!input || typeof input !== "object" || !Array.isArray(input.samples)) throw new Error("Corpus JSON must contain samples[].");
  const samples = input.samples.map((sample, index) => {
    const record = objectValue(sample, `samples[${index}]`);
    const id = stringValue(record.id, `samples[${index}].id`);
    const path = resolvePath(baseDir, stringValue(record.path, `samples[${index}].path`));
    return {
      id,
      path,
      language: optionalString(record.language),
      description: optionalString(record.description),
      sourceUrl: optionalString(record.sourceUrl),
      license: optionalString(record.license),
      expectedText: optionalString(record.expectedText),
      durationMs: optionalNumber(record.durationMs),
      normalize: record.normalize !== false,
    };
  });
  assertUnique(samples.map((sample) => sample.id), "sample id");
  return { ...input, samples };
}

export function normalizeProviders(input, baseDir) {
  if (!input || typeof input !== "object" || !Array.isArray(input.providers)) throw new Error("Provider JSON must contain providers[].");
  const providers = input.providers.map((provider, index) => {
    const record = objectValue(provider, `providers[${index}]`);
    const id = stringValue(record.id, `providers[${index}].id`);
    const command = stringValue(record.command, `providers[${index}].command`);
    const args = Array.isArray(record.args) ? record.args.map((arg, argIndex) => stringValue(arg, `providers[${index}].args[${argIndex}]`)) : [];
    const env = record.env === undefined ? {} : objectValue(record.env, `providers[${index}].env`);
    return {
      id,
      label: optionalString(record.label) ?? id,
      enabled: record.enabled !== false,
      command: command.includes("/") ? resolvePath(baseDir, command) : command,
      args,
      cwd: record.cwd ? resolvePath(baseDir, stringValue(record.cwd, `providers[${index}].cwd`)) : baseDir,
      env,
      parseStdout: optionalString(record.parseStdout) ?? "text",
      mode: optionalString(record.mode) ?? "offline",
      model: optionalString(record.model),
      notes: optionalString(record.notes),
      timeoutMs: optionalNumber(record.timeoutMs),
      noSpeechGate: normalizeNoSpeechGate(record.noSpeechGate, `providers[${index}].noSpeechGate`),
    };
  });
  assertUnique(providers.map((provider) => provider.id), "provider id");
  return { ...input, providers };
}

function normalizeNoSpeechGate(value, label) {
  if (value === undefined) return undefined;
  const record = objectValue(value, label);
  if (record.enabled === false) return undefined;
  const type = optionalString(record.type) ?? "rms-dbfs";
  if (type !== "rms-dbfs") throw new Error(`${label}.type must be "rms-dbfs".`);
  const action = optionalString(record.action) ?? "skip";
  if (action !== "skip") throw new Error(`${label}.action must be "skip".`);
  const thresholdDbfs = optionalNumber(record.thresholdDbfs) ?? -55;
  if (thresholdDbfs >= 0) throw new Error(`${label}.thresholdDbfs must be below 0.`);
  const sampleRate = optionalNumber(record.sampleRate) ?? 16000;
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new Error(`${label}.sampleRate must be a positive integer.`);
  return {
    type,
    action,
    thresholdDbfs,
    sampleRate,
    timeoutMs: optionalNumber(record.timeoutMs),
  };
}

export async function prepareSample(input) {
  let sourceStat;
  let missing = false;
  try {
    await assertReadable(input.sample.path, `sample ${input.sample.id}`);
    sourceStat = await stat(input.sample.path);
  } catch (error) {
    if (!input.allowMissing) throw error;
    missing = true;
    sourceStat = { size: undefined };
  }
  let audioPath = input.sample.path;
  let normalized = false;
  let normalization = { status: "skipped", reason: input.normalize ? "sample did not request normalization" : "--no-normalize" };

  if (!missing && input.normalize && input.sample.normalize) {
    const outputPath = join(input.normalizedDir, `${safeSegment(input.sample.id)}.wav`);
    const ffmpeg = await commandAvailable("ffmpeg", ["-version"]);
    if (ffmpeg.available) {
      const result = await execFileCapture("ffmpeg", ["-y", "-i", input.sample.path, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", outputPath], {
        cwd: input.runDir,
        timeoutMs: 120_000,
      });
      if (result.status === "succeeded") {
        audioPath = outputPath;
        normalized = true;
        normalization = { status: "succeeded", command: result.command };
      } else {
        normalization = {
          status: "failed",
          command: result.command,
          exitCode: result.exitCode,
          stderrPreview: preview(result.stderr),
          fallback: "using original audio path",
        };
      }
    } else {
      normalization = { status: "skipped", reason: "ffmpeg not found on PATH" };
    }
  }

  const durationMs = input.sample.durationMs ?? (await probeAudioDurationMs(audioPath));
  return {
    audioPath,
    missing,
    normalized,
    normalization,
    sourceSizeBytes: sourceStat.size,
    durationMs,
  };
}

export async function runProvider(input) {
  const providerRunId = `${safeSegment(input.provider.id)}__${safeSegment(input.sample.id)}`;
  const stdoutPath = join(input.logsDir, `${providerRunId}.stdout.txt`);
  const stderrPath = join(input.logsDir, `${providerRunId}.stderr.txt`);
  const transcriptPath = join(input.transcriptsDir, `${providerRunId}.txt`);
  const outputJsonPath = join(input.transcriptsDir, `${providerRunId}.json`);
  const replacements = {
    audio: input.prepared.audioPath,
    sampleId: input.sample.id,
    sampleLanguage: input.sample.language ?? "auto",
    language: input.sample.language ?? "auto",
    providerId: input.provider.id,
    providerLabel: input.provider.label,
    runDir: input.runDir,
    artifactsDir: input.runDir,
    stdoutPath,
    stderrPath,
    transcriptPath,
    outputJson: outputJsonPath,
    threads: input.threads,
  };
  const command = replacePlaceholders(input.provider.command, replacements);
  const args = input.provider.args.map((arg) => replacePlaceholders(arg, replacements));
  const startedAt = new Date().toISOString();
  const started = process.hrtime.bigint();
  let execution;
  let parsed = { text: "", language: input.sample.language };
  let noSpeechGate;

  if (input.dryRun) {
    execution = {
      status: "succeeded",
      exitCode: 0,
      signal: undefined,
      stdout: "",
      stderr: "",
      timedOut: false,
      command: [command, ...args],
    };
  } else {
    if (input.provider.noSpeechGate) {
      noSpeechGate = await runNoSpeechGate(input.prepared.audioPath, input.provider.noSpeechGate);
    }
    if (noSpeechGate?.status === "classified" && noSpeechGate.noSpeech && input.provider.noSpeechGate?.action === "skip") {
      execution = {
        status: "skipped",
        exitCode: 0,
        signal: undefined,
        stdout: "",
        stderr: "",
        timedOut: false,
        command: [command, ...args],
        skipReason: "no-speech-gate",
      };
      parsed = { text: "", language: undefined };
    } else {
      execution = await execFileCapture(command, args, {
        cwd: input.provider.cwd,
        env: resolveEnv(input.provider.env),
        timeoutMs: input.provider.timeoutMs ?? input.timeoutMs,
      });
      parsed = parseProviderOutput(input.provider, execution.stdout);
    }
  }

  const endedAt = new Date().toISOString();
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  const language = summarizeLanguage(input.sample.language, parsed.language);
  const quality = summarizeQuality(input.sample.expectedText, parsed.text);
  await writeFile(stdoutPath, execution.stdout ?? "");
  await writeFile(stderrPath, execution.stderr ?? "");
  await writeFile(transcriptPath, parsed.text ? `${parsed.text.trim()}\n` : "");
  if (input.provider.parseStdout === "json" && execution.stdout.trim()) {
    await writeFile(outputJsonPath, `${execution.stdout.trim()}\n`);
  }

  const status = execution.status === "skipped" ? "skipped" : execution.status === "succeeded" && execution.exitCode === 0 ? "succeeded" : "failed";
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    id: randomUUID(),
    startedAt,
    endedAt,
    status,
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
    host: {
      platform: input.host.platform,
      arch: input.host.arch,
      cpuModel: input.host.cpuModel,
      cpuCount: input.host.cpuCount,
      memoryBytes: input.host.memoryBytes,
    },
    audio: {
      sourcePath: input.sample.path,
      runAudioPath: input.prepared.audioPath,
      missing: input.prepared.missing,
      normalized: input.prepared.normalized,
      normalization: input.prepared.normalization,
      sourceSizeBytes: input.prepared.sourceSizeBytes,
      durationMs: input.prepared.durationMs,
    },
    command: {
      cwd: input.provider.cwd,
      argv: execution.command,
    },
    metrics: {
      elapsedMs: Math.round(elapsedMs),
      realtimeFactor:
        input.prepared.durationMs && input.prepared.durationMs > 0
          ? Number((elapsedMs / input.prepared.durationMs).toFixed(3))
          : undefined,
      firstOutputLatencyMs: undefined,
      modelLoadMs: undefined,
      peakMemoryBytes: undefined,
    },
    execution: {
      status: execution.status,
      exitCode: execution.exitCode,
      signal: execution.signal,
      timedOut: execution.timedOut,
      skipReason: execution.skipReason,
      stderrPreview: preview(execution.stderr),
    },
    noSpeechGate,
    transcript: {
      text: parsed.text,
      language: parsed.language,
      preview: preview(parsed.text),
      path: transcriptPath,
      jsonPath: input.provider.parseStdout === "json" && execution.stdout.trim() ? outputJsonPath : undefined,
    },
    language,
    quality,
    artifacts: {
      stdoutPath,
      stderrPath,
      transcriptPath,
      jsonPath: input.provider.parseStdout === "json" && execution.stdout.trim() ? outputJsonPath : undefined,
    },
  };
}

async function runNoSpeechGate(audioPath, gate) {
  const result = await execFileBufferCapture(
    "ffmpeg",
    ["-nostdin", "-v", "error", "-i", audioPath, "-ar", String(gate.sampleRate), "-ac", "1", "-f", "s16le", "-"],
    { timeoutMs: gate.timeoutMs ?? 60_000 },
  );
  if (result.status !== "succeeded" || result.exitCode !== 0) {
    return {
      status: "failed",
      method: gate.type,
      action: gate.action,
      command: result.command,
      exitCode: result.exitCode,
      stderrPreview: preview(result.stderr),
      noSpeech: false,
    };
  }
  const metrics = analyzePcmS16le(result.stdout, gate.sampleRate);
  const noSpeech = metrics.rmsDbfs === undefined || metrics.rmsDbfs <= gate.thresholdDbfs;
  return {
    status: "classified",
    method: gate.type,
    action: gate.action,
    command: result.command,
    thresholdDbfs: gate.thresholdDbfs,
    sampleRate: gate.sampleRate,
    noSpeech,
    ...metrics,
  };
}

function analyzePcmS16le(buffer, sampleRate) {
  const sampleCount = Math.floor(buffer.length / 2);
  if (!sampleCount) {
    return {
      sampleCount,
      durationMs: 0,
      rmsDbfs: undefined,
      peakDbfs: undefined,
      rmsDbfsLabel: "-Infinity",
      peakDbfsLabel: "-Infinity",
    };
  }
  let sumSquares = 0;
  let peak = 0;
  for (let offset = 0; offset + 1 < buffer.length; offset += 2) {
    const sample = buffer.readInt16LE(offset);
    const abs = Math.abs(sample);
    peak = Math.max(peak, abs);
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / sampleCount);
  const rmsDbfs = amplitudeToDbfs(rms);
  const peakDbfs = amplitudeToDbfs(peak);
  return {
    sampleCount,
    durationMs: Math.round((sampleCount / sampleRate) * 1000),
    rmsDbfs,
    peakDbfs,
    rmsDbfsLabel: dbfsLabel(rmsDbfs),
    peakDbfsLabel: dbfsLabel(peakDbfs),
  };
}

function amplitudeToDbfs(value) {
  if (!value) return undefined;
  return Number((20 * Math.log10(value / 32768)).toFixed(2));
}

function dbfsLabel(value) {
  return value === undefined ? "-Infinity" : `${value} dBFS`;
}

export async function execFileCapture(command, args, options = {}) {
  const started = process.hrtime.bigint();
  return await new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolvePromise({
        status: "failed",
        exitCode: undefined,
        signal: undefined,
        timedOut,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: `${Buffer.concat(stderr).toString("utf8")}${error.message}\n`,
        command: [command, ...args],
        elapsedMs: Number(process.hrtime.bigint() - started) / 1_000_000,
      });
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      resolvePromise({
        status: exitCode === 0 && !timedOut ? "succeeded" : "failed",
        exitCode,
        signal,
        timedOut,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        command: [command, ...args],
        elapsedMs: Number(process.hrtime.bigint() - started) / 1_000_000,
      });
    });
  });
}

async function execFileBufferCapture(command, args, options = {}) {
  const started = process.hrtime.bigint();
  return await new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolvePromise({
        status: "failed",
        exitCode: undefined,
        signal: undefined,
        timedOut,
        stdout: Buffer.concat(stdout),
        stderr: `${Buffer.concat(stderr).toString("utf8")}${error.message}\n`,
        command: [command, ...args],
        elapsedMs: Number(process.hrtime.bigint() - started) / 1_000_000,
      });
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      resolvePromise({
        status: exitCode === 0 && !timedOut ? "succeeded" : "failed",
        exitCode,
        signal,
        timedOut,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString("utf8"),
        command: [command, ...args],
        elapsedMs: Number(process.hrtime.bigint() - started) / 1_000_000,
      });
    });
  });
}

function parseProviderOutput(provider, stdout) {
  const raw = stdout.trim();
  if (!raw) return { text: "", language: undefined };
  if (provider.parseStdout === "qwen3-asr") {
    return parseQwen3AsrOutput(raw);
  }
  if (provider.parseStdout === "json") {
    try {
      const payload = JSON.parse(raw);
      return {
        text: stringOrUndefined(payload.text) ?? stringOrUndefined(payload.transcript) ?? raw,
        language: optionalString(payload.language),
      };
    } catch {
      return { text: raw, language: undefined };
    }
  }
  return { text: raw, language: undefined };
}

function stringOrUndefined(value) {
  return typeof value === "string" ? value : undefined;
}

function summarizeLanguage(expected, detected) {
  const expectedNormalized = normalizeLanguageLabel(expected);
  const detectedNormalized = normalizeLanguageLabel(detected);
  return {
    expected,
    detected,
    expectedNormalized,
    detectedNormalized,
    matchesExpected: expectedNormalized && detectedNormalized ? expectedNormalized === detectedNormalized : undefined,
  };
}

export function summarizeQuality(expectedText, actualText) {
  if (!expectedText) return undefined;
  const expectedNormalized = normalizeTranscriptText(expectedText);
  const actualNormalized = normalizeTranscriptText(actualText);
  if (!expectedNormalized) return { expectedText, actualText, charErrorRate: undefined, editDistance: undefined };
  const editDistance = levenshteinDistance(expectedNormalized, actualNormalized);
  return {
    expectedText,
    expectedPreview: preview(expectedText),
    charErrorRate: Number((editDistance / expectedNormalized.length).toFixed(3)),
    editDistance,
    expectedLength: expectedNormalized.length,
  };
}

function normalizeTranscriptText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(left, right) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current = new Array(right.length + 1);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    current[0] = leftIndex + 1;
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const cost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      current[rightIndex + 1] = Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + cost,
      );
    }
    [previous, current] = [current, previous];
  }
  return previous[right.length];
}

function normalizeLanguageLabel(value) {
  if (!value || typeof value !== "string") return undefined;
  const cleaned = value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .trim();
  if (!cleaned) return undefined;
  const aliases = new Map([
    ["ar", "arabic"],
    ["ara", "arabic"],
    ["arabic", "arabic"],
    ["cmn", "chinese"],
    ["zh", "chinese"],
    ["zho", "chinese"],
    ["chi", "chinese"],
    ["chinese", "chinese"],
    ["mandarin", "chinese"],
    ["yue", "chinese"],
    ["cantonese", "chinese"],
    ["de", "german"],
    ["deu", "german"],
    ["ger", "german"],
    ["german", "german"],
    ["en", "english"],
    ["eng", "english"],
    ["english", "english"],
    ["es", "spanish"],
    ["spa", "spanish"],
    ["spanish", "spanish"],
    ["fr", "french"],
    ["fra", "french"],
    ["fre", "french"],
    ["french", "french"],
    ["hi", "hindi"],
    ["hin", "hindi"],
    ["hindi", "hindi"],
    ["it", "italian"],
    ["ita", "italian"],
    ["italian", "italian"],
    ["ja", "japanese"],
    ["jpn", "japanese"],
    ["japanese", "japanese"],
    ["ko", "korean"],
    ["kor", "korean"],
    ["korean", "korean"],
    ["pt", "portuguese"],
    ["por", "portuguese"],
    ["portuguese", "portuguese"],
    ["ru", "russian"],
    ["rus", "russian"],
    ["russian", "russian"],
  ]);
  return aliases.get(cleaned) ?? aliases.get(cleaned.split(/\s+/)[0]) ?? cleaned;
}

function parseQwen3AsrOutput(raw) {
  const asrTextMatch = /<\|?asr_text\|?>\s*([\s\S]*)$/i.exec(raw) ?? /<asr_text>\s*([\s\S]*)$/i.exec(raw);
  const languageMatch =
    /(?:^|\b)language\s+([^<\n\r]+?)\s*<\|?asr_text\|?>/i.exec(raw) ??
    /(?:^|\b)language\s+([^<\n\r]+?)\s*<asr_text>/i.exec(raw);
  if (!asrTextMatch) return { text: raw, language: languageMatch?.[1]?.trim() };
  return {
    text: asrTextMatch[1]?.trim() ?? "",
    language: languageMatch?.[1]?.trim(),
  };
}

function renderSummary(input) {
  const lines = [
    `# STT Spike Run ${input.runId}`,
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
    "## Runtime Checks",
    "",
    "| Runtime | Available | Version |",
    "| --- | --- | --- |",
    ...input.host.runtimes.map((runtime) => `| ${escapeTable(runtime.name)} | ${runtime.available ? "yes" : "no"} | ${escapeTable(runtime.version ?? runtime.detail ?? "")} |`),
    "",
    "## Results",
    "",
    "| Provider | Sample | Status | Gate | RTF | Elapsed | Expected Lang | Detected Lang | Lang Match | CER | Transcript Preview |",
    "| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | ---: | --- |",
    ...input.results.map((result) =>
      [
        escapeTable(result.provider.label),
        escapeTable(result.sample.id),
        result.status,
        noSpeechGateLabel(result.noSpeechGate),
        result.metrics.realtimeFactor ?? "",
        `${result.metrics.elapsedMs} ms`,
        escapeTable(result.language?.expected ?? result.sample.language ?? ""),
        escapeTable(result.language?.detected ?? result.transcript.language ?? ""),
        languageMatchLabel(result.language),
        result.quality?.charErrorRate ?? "",
        escapeTable(result.transcript.preview ?? ""),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    ),
    "",
    "## Artifacts",
    "",
    `- Results JSONL: ${pathForReport(input.cwd, input.paths.resultPath)}`,
    `- Host facts: ${pathForReport(input.cwd, input.paths.hostPath)}`,
    `- Run config: ${pathForReport(input.cwd, input.paths.runConfigPath)}`,
    "",
    "Full stdout/stderr and transcripts are written next to each result row in the run directory.",
    "",
  ];
  return lines.join("\n");
}

function noSpeechGateLabel(gate) {
  if (!gate) return "";
  if (gate.status === "failed") return "gate-failed";
  return gate.noSpeech ? "skip-no-speech" : `speech ${gate.rmsDbfsLabel ?? ""}`.trim();
}

function languageMatchLabel(language) {
  if (!language?.expectedNormalized || !language?.detectedNormalized) return "";
  return language.matchesExpected ? "yes" : "no";
}

export async function hostFacts() {
  const cpuList = cpus();
  return {
    platform: platform(),
    release: release(),
    arch: arch(),
    cpuModel: cpuList[0]?.model,
    cpuCount: cpuList.length || undefined,
    memoryBytes: totalmem(),
    runtimes: await Promise.all([
      commandAvailable("ffmpeg", ["-version"]),
      commandAvailable("ffprobe", ["-version"]),
      commandAvailable("llama-mtmd-cli", ["--version"]),
      commandAvailable("llama-server", ["--version"]),
      commandAvailable("uv", ["--version"]),
      commandAvailable("faster-whisper", ["--help"]),
      commandAvailable("python3", ["--version"]),
    ]),
  };
}

async function commandAvailable(command, args) {
  const result = await execFileCapture(command, args, { timeoutMs: 3000 });
  return {
    name: command,
    available: result.status === "succeeded" || result.exitCode === 0,
    version: firstLine(result.stdout || result.stderr),
    detail: result.status === "succeeded" || result.exitCode === 0 ? undefined : firstLine(result.stderr),
  };
}

async function probeAudioDurationMs(path) {
  const ffprobe = await commandAvailable("ffprobe", ["-version"]);
  if (!ffprobe.available) return undefined;
  const result = await execFileCapture("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path], {
    timeoutMs: 30_000,
  });
  if (result.status !== "succeeded") return undefined;
  const seconds = Number(result.stdout.trim());
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined;
}

function resolveEnv(env) {
  const resolved = {};
  for (const [key, value] of Object.entries(env ?? {})) {
    if (typeof value !== "string") continue;
    resolved[key] = replacePlaceholders(value, { env: process.env[key] ?? "" });
  }
  return resolved;
}

function replacePlaceholders(value, replacements) {
  return value.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, key) => {
    if (key.startsWith("env.")) return process.env[key.slice(4)] ?? "";
    return replacements[key] === undefined ? match : String(replacements[key]);
  });
}

async function appendJsonl(path, value) {
  await writeFile(path, `${JSON.stringify(value)}\n`, { flag: "a" });
}

async function assertReadable(path, label) {
  try {
    await access(path, fsConstants.R_OK);
  } catch {
    throw new Error(`Missing or unreadable ${label}: ${path}`);
  }
}

export function filterByIds(items, onlyId, label) {
  if (!onlyId) return items;
  const selected = items.filter((item) => item.id === onlyId);
  if (!selected.length) throw new Error(`Unknown ${label}: ${onlyId}`);
  return selected;
}

function requiredOption(parsed, key) {
  const value = parsed[key];
  if (!value) throw new Error(`Missing required option --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  return value;
}

export function resolvePath(baseDir, value) {
  return isAbsolute(value) ? value : resolve(baseDir, value);
}

export function pathForReport(cwd, path) {
  const rel = relative(cwd, path);
  return rel && !rel.startsWith("..") ? rel : path;
}

function objectValue(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function stringValue(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function safeSegment(value) {
  const hashed = createHash("sha256").update(value).digest("hex").slice(0, 8);
  const safe = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${safe || "item"}-${hashed}`;
}

function preview(value, maxChars = DEFAULT_PREVIEW_CHARS) {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

function escapeTable(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function firstLine(value) {
  const lines = value
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines?.find((line) => /^version:/i.test(line)) ?? lines?.[0])?.slice(0, 160);
}

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
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
