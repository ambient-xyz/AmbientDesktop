#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const DEFAULT_OUT_DIR = ".ambient/stt-spike/corpus/public-smoke";
const DEFAULT_CORPUS_NAME = "corpus.json";
const DEFAULT_TIMEOUT_MS = 120_000;

export async function main(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    process.stdout.write(helpText());
    return 0;
  }

  const cwd = resolve(options.cwd ?? process.cwd());
  const manifestPath = resolvePath(cwd, requiredOption(parsed, "manifest"));
  const manifest = normalizeManifest(await readJson(manifestPath), dirname(manifestPath));
  const outDir = resolvePath(cwd, parsed.out ?? DEFAULT_OUT_DIR);
  const rawDir = join(outDir, "raw");
  const normalizedDir = join(outDir, "normalized");
  await mkdir(rawDir, { recursive: true });
  await mkdir(normalizedDir, { recursive: true });

  const samples = [];
  const downloads = [];
  for (const sample of manifest.samples) {
    const rawPath = join(rawDir, `${safeSegment(sample.id)}${sample.extension}`);
    const normalizedPath = join(normalizedDir, `${safeSegment(sample.id)}.wav`);
    const source = await materializeSource({ sample, rawPath, force: parsed.force, timeoutMs: parsed.timeoutMs });
    const sourceStat = await stat(source.path);
    const sha256 = await fileSha256(source.path);
    if (sample.sha256 && sha256 !== sample.sha256) {
      throw new Error(`SHA-256 mismatch for ${sample.id}: expected ${sample.sha256}, got ${sha256}`);
    }
    if (sample.expectedSizeBytes && sourceStat.size !== sample.expectedSizeBytes) {
      throw new Error(`Size mismatch for ${sample.id}: expected ${sample.expectedSizeBytes}, got ${sourceStat.size}`);
    }

    let corpusPath = source.path;
    let normalized = false;
    if (sample.normalize !== false && !parsed.noNormalize) {
      await normalizeAudio(source.path, normalizedPath, parsed.timeoutMs);
      corpusPath = normalizedPath;
      normalized = true;
    }

    const durationMs = await probeDurationMs(corpusPath, parsed.timeoutMs);
    samples.push({
      id: sample.id,
      path: pathForJson(outDir, corpusPath),
      language: sample.language,
      description: sample.description,
      durationMs,
      normalize: false,
      sourceUrl: sample.url ?? sample.sourcePath ?? sample.generatedSource,
      license: sample.license,
      expectedText: sample.expectedText,
    });
    downloads.push({
      id: sample.id,
      source: sample.url ?? sample.sourcePath,
      rawPath: pathForJson(outDir, source.path),
      corpusPath: pathForJson(outDir, corpusPath),
      sizeBytes: sourceStat.size,
      sha256,
      normalized,
      durationMs,
    });
  }

  const corpus = {
    generatedAt: new Date().toISOString(),
    sourceManifest: pathForJson(outDir, manifestPath),
    samples,
  };
  const corpusPath = join(outDir, parsed.corpusName ?? DEFAULT_CORPUS_NAME);
  const downloadReportPath = join(outDir, "downloads.json");
  await writeFile(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`);
  await writeFile(downloadReportPath, `${JSON.stringify({ generatedAt: corpus.generatedAt, downloads }, null, 2)}\n`);
  process.stdout.write(`STT corpus prepared\n`);
  process.stdout.write(`- corpus: ${pathForReport(cwd, corpusPath)}\n`);
  process.stdout.write(`- downloads: ${pathForReport(cwd, downloadReportPath)}\n`);
  return 0;
}

function parseArgs(argv) {
  const parsed = { force: false, noNormalize: false, timeoutMs: DEFAULT_TIMEOUT_MS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--force") {
      parsed.force = true;
      continue;
    }
    if (arg === "--no-normalize") {
      parsed.noNormalize = true;
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
  return `STT corpus preparation

Usage:
  node scripts/stt-spike/prepare-corpus.mjs --manifest <manifest.json> [options]

Options:
  --out <dir>              Output directory. Defaults to .ambient/stt-spike/corpus/public-smoke.
  --corpus-name <name>     Corpus JSON filename. Defaults to corpus.json.
  --timeout-ms <ms>        Download/ffmpeg timeout. Defaults to 120000.
  --force                  Redownload/copy raw files even when present.
  --no-normalize           Skip ffmpeg normalization.
  --help                   Show this help.
`;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function normalizeManifest(input, baseDir) {
  if (!input || typeof input !== "object" || !Array.isArray(input.samples)) throw new Error("Manifest JSON must contain samples[].");
  const samples = input.samples.map((value, index) => {
    const record = objectValue(value, `samples[${index}]`);
    const id = stringValue(record.id, `samples[${index}].id`);
    const url = optionalString(record.url);
    const sourcePath = optionalString(record.sourcePath);
    const generate = record.generate === undefined ? undefined : objectValue(record.generate, `samples[${index}].generate`);
    const sourceCount = [url, sourcePath, generate].filter(Boolean).length;
    if (sourceCount !== 1) throw new Error(`samples[${index}] must provide exactly one of url, sourcePath, or generate.`);
    const generated = generate ? normalizeGenerate(generate, `samples[${index}].generate`) : undefined;
    const derivedExtension = extname(url ? new URL(url).pathname : sourcePath ?? "");
    const extension = optionalString(record.extension) ?? (derivedExtension || ".audio");
    return {
      id,
      url,
      sourcePath: sourcePath ? resolvePath(baseDir, sourcePath) : undefined,
      generate: generated,
      generatedSource: generated ? `generated:${generated.type}:${generated.durationMs}ms` : undefined,
      extension,
      language: optionalString(record.language),
      description: optionalString(record.description),
      license: optionalString(record.license),
      expectedText: optionalString(record.expectedText),
      sha256: optionalString(record.sha256),
      expectedSizeBytes: optionalNumber(record.expectedSizeBytes),
      normalize: record.normalize !== false,
    };
  });
  assertUnique(samples.map((sample) => sample.id), "sample id");
  return { ...input, samples };
}

async function materializeSource(input) {
  if (!input.force && (await isReadable(input.rawPath))) return { path: input.rawPath, status: "cached" };
  await mkdir(dirname(input.rawPath), { recursive: true });
  if (input.sample.generate) {
    await generateSource(input.sample.generate, input.rawPath);
    return { path: input.rawPath, status: "generated" };
  }
  if (input.sample.sourcePath) {
    await copyFile(input.sample.sourcePath, input.rawPath);
    return { path: input.rawPath, status: "copied" };
  }
  await downloadFile(input.sample.url, input.rawPath, input.timeoutMs);
  return { path: input.rawPath, status: "downloaded" };
}

function normalizeGenerate(input, label) {
  const type = stringValue(input.type, `${label}.type`);
  if (type !== "silence") throw new Error(`${label}.type must be "silence".`);
  const durationMs = optionalNumber(input.durationMs);
  if (!durationMs || durationMs <= 0) throw new Error(`${label}.durationMs must be a positive number.`);
  const sampleRate = optionalNumber(input.sampleRate) ?? 16000;
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new Error(`${label}.sampleRate must be a positive integer.`);
  return { type, durationMs, sampleRate };
}

async function generateSource(input, outputPath) {
  if (input.type !== "silence") throw new Error(`Unsupported generated source type: ${input.type}`);
  await writeFile(outputPath, silenceWav({ durationMs: input.durationMs, sampleRate: input.sampleRate }));
}

function silenceWav(input) {
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.round((input.durationMs / 1000) * input.sampleRate);
  const dataSize = sampleCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(input.sampleRate, 24);
  buffer.writeUInt32LE(input.sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

async function downloadFile(url, destination, timeoutMs, redirects = 0) {
  if (redirects > 8) throw new Error(`Too many redirects downloading ${url}`);
  const tempPath = `${destination}.tmp`;
  await rm(tempPath, { force: true });
  const result = await new Promise((resolvePromise, reject) => {
    const parsed = new URL(url);
    const getter = parsed.protocol === "http:" ? httpGet : httpsGet;
    const request = getter(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        response.resume();
        const location = response.headers.location;
        if (!location) {
          reject(new Error(`Redirect without location for ${url}`));
          return;
        }
        const redirected = new URL(location, url).toString();
        downloadFile(redirected, destination, timeoutMs, redirects + 1).then(() => resolvePromise("redirected"), reject);
        return;
      }
      if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
        response.resume();
        reject(new Error(`Download failed for ${url}: HTTP ${response.statusCode}`));
        return;
      }
      const output = createWriteStream(tempPath);
      response.pipe(output);
      output.on("finish", () => output.close(() => resolvePromise("downloaded")));
      output.on("error", reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`Download timed out for ${url}`)));
    request.on("error", reject);
  });
  if (result !== "redirected") await rename(tempPath, destination);
}

async function normalizeAudio(inputPath, outputPath, timeoutMs) {
  await mkdir(dirname(outputPath), { recursive: true });
  const result = await execFileCapture("ffmpeg", ["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", outputPath], { timeoutMs });
  if (result.exitCode !== 0) throw new Error(`ffmpeg normalization failed for ${inputPath}: ${result.stderr || result.stdout}`);
}

async function probeDurationMs(path, timeoutMs) {
  const result = await execFileCapture("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path], {
    timeoutMs,
  });
  if (result.exitCode !== 0) return undefined;
  const seconds = Number(result.stdout.trim());
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined;
}

async function execFileCapture(command, args, options) {
  return await new Promise((resolvePromise) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    const timeout = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolvePromise({ exitCode: undefined, stdout: Buffer.concat(stdout).toString("utf8"), stderr: `${Buffer.concat(stderr).toString("utf8")}${error.message}` });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolvePromise({ exitCode, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
}

async function fileSha256(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

async function isReadable(path) {
  try {
    await access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function requiredOption(parsed, key) {
  const value = parsed[key];
  if (!value) throw new Error(`Missing required option --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  return value;
}

function resolvePath(baseDir, value) {
  return isAbsolute(value) ? value : resolve(baseDir, value);
}

function pathForJson(baseDir, path) {
  const rel = relative(baseDir, path);
  return rel && !rel.startsWith("..") ? rel : path;
}

function pathForReport(cwd, path) {
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

function safeSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "sample";
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
