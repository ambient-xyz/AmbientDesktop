#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import https from "node:https";
import { availableParallelism as nodeAvailableParallelism, homedir, platform as nodePlatform } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const providerId = "qwen3-asr-0.6b-llamacpp";
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetManifestPath = resolve(packageRoot, "assets", "qwen3-asr-assets.json");
const assetManifest = loadAssetManifest();
const defaultModelSpec = defaultModelFromManifest(assetManifest);
const defaultModel = defaultModelSpec.huggingFace.legacyRef;

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.health) {
    writeJson(healthPayload());
    return;
  }
  await runTranscription(options);
}

async function runTranscription(options) {
  const audioPath = required(options.audio, "--audio");
  const outputJson = required(options.outputJson, "--output-json");
  const language = options.language || "English";
  const audio = resolve(audioPath);
  if (!existsSync(audio) || !statSync(audio).isFile()) throw new Error(`Audio input does not exist: ${audioPath}`);

  const fakeTranscript = process.env.AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT;
  if (fakeTranscript !== undefined) {
    const payload = transcriptionPayload({
      text: fakeTranscript,
      language,
      durationMs: 0,
      outputJson,
      runtime: { mode: "fake" },
    });
    writeOutputJson(outputJson, payload);
    writeJson(payload);
    return;
  }

  const binary = resolveRuntimeBinary();
  if (!binary.available || !binary.command) throw new Error(binary.reason);
  const modelPlan = await qwenModelPlan({ audio, language });
  const startedAt = Date.now();
  const args = modelPlan.args;
  const result = spawnSync(binary.command, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 32,
  });
  const elapsedMs = Date.now() - startedAt;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || result.stdout?.trim() || "llama.cpp exited unsuccessfully";
    throw new Error(`Qwen3-ASR runtime failed: ${stderr}`);
  }

  const parsed = parseQwen3AsrOutput(result.stdout ?? "");
  const text = parsed.text.trim();
  if (!text) throw new Error("Qwen3-ASR returned an empty transcript.");
  const parsedLanguage = parsed.language && !/^(none|null|unknown)$/i.test(parsed.language) ? parsed.language : undefined;
  const payload = transcriptionPayload({
    text,
    language: parsedLanguage || language,
    durationMs: elapsedMs,
    outputJson,
    runtime: {
      mode: "llama.cpp",
      binary: binary.command,
      model: modelPlan.model,
      modelSource: modelPlan.modelSource,
      ...(modelPlan.assetManifest ? { assetManifest: modelPlan.assetManifest } : {}),
      elapsedMs,
    },
  });
  writeOutputJson(outputJson, payload);
  writeJson(payload);
}

function healthPayload() {
  const binary = resolveRuntimeBinary();
  const configuredModel = process.env.AMBIENT_QWEN3_ASR_MODEL?.trim();
  const model = configuredModel || defaultModel;
  const version = binary.command ? runtimeVersion(binary.command) : undefined;
  const manifestSummary = assetManifestSummary();
  return {
    providerId,
    available: binary.available,
    reason: binary.available
      ? configuredModel
        ? "Qwen3-ASR runtime is available. A custom AMBIENT_QWEN3_ASR_MODEL override is configured; default pinned assets remain available for normal installs."
        : "Qwen3-ASR runtime is available. Default model assets are checksum-pinned and verified before local use."
      : binary.reason,
    runtime: {
      binary: binary.command,
      version,
      model,
      modelSource: configuredModel ? customModelSource(configuredModel) : "manifest",
    },
    assetManifest: manifestSummary,
    missingHints: binary.available
      ? []
      : [
          "Install a llama.cpp build that includes llama-mtmd-cli.",
          "Set AMBIENT_QWEN3_ASR_BINARY to the absolute llama-mtmd-cli path if it is not on PATH.",
          "Default Qwen3-ASR model assets are pinned in the bundled manifest and downloaded to an Ambient cache on first transcription.",
          "Use AMBIENT_QWEN3_ASR_MODEL only for explicit custom llama.cpp -hf experiments.",
        ],
  };
}

function qwenArgs(input) {
  const threads = numericEnv("AMBIENT_QWEN3_ASR_THREADS", Math.max(2, Math.min(8, Math.floor((availableParallelism() || 4) / 2))));
  const modelArgs = input.modelPath && input.mmprojPath
    ? ["-m", input.modelPath, "--mmproj", input.mmprojPath]
    : ["-hf", required(input.model, "model")];
  return [
    ...modelArgs,
    "--audio",
    input.audio,
    "-p",
    `The audio language is ${input.language}. Transcribe the speech in ${input.language}. Do not translate. Return only the transcript text.`,
    "-t",
    String(threads),
    "-n",
    "512",
    "--temp",
    "0",
  ];
}

async function qwenModelPlan(input) {
  const configuredModel = process.env.AMBIENT_QWEN3_ASR_MODEL?.trim();
  if (configuredModel) {
    return {
      model: configuredModel,
      modelSource: customModelSource(configuredModel),
      args: qwenArgs({ ...input, model: configuredModel }),
    };
  }

  const assets = await resolveVerifiedManifestAssets();
  return {
    model: assets.modelRef,
    modelSource: "manifest",
    assetManifest: assets.assetManifest,
    args: qwenArgs({ ...input, modelPath: assets.modelPath, mmprojPath: assets.mmprojPath }),
  };
}

async function resolveVerifiedManifestAssets(modelSpec = defaultModelSpec) {
  if (assetManifest.downloadPolicy?.directModelDownloadsEnabled !== true) {
    throw new Error("Qwen3-ASR default model downloads are disabled by the bundled asset manifest.");
  }
  const modelFile = modelSpec.files.find((file) => file.role === "model");
  const mmprojFile = modelSpec.files.find((file) => file.role === "mmproj");
  if (!modelFile || !mmprojFile) throw new Error(`Qwen3-ASR asset manifest model ${modelSpec.id} must include model and mmproj files.`);

  const root = assetCacheRoot(assetManifest, modelSpec);
  const [modelPath, mmprojPath] = await Promise.all([
    ensureAsset(modelFile, root),
    ensureAsset(mmprojFile, root),
  ]);
  return {
    modelPath,
    mmprojPath,
    modelRef: modelSpec.huggingFace.legacyRef,
    assetManifest: assetManifestSummary(assetManifest, modelSpec),
  };
}

async function ensureAsset(file, root) {
  if (basename(file.filename) !== file.filename) throw new Error(`Qwen3-ASR asset filename must not contain path separators: ${file.filename}`);
  mkdirSync(root, { recursive: true });
  const outputPath = resolve(root, file.filename);
  if (await isVerifiedAsset(outputPath, file)) return outputPath;
  if (existsSync(outputPath)) rmSync(outputPath, { force: true });

  const tempPath = resolve(root, `.${file.filename}.${process.pid}.${Date.now()}.tmp`);
  try {
    await downloadFile(file.url, tempPath);
    await assertVerifiedAsset(tempPath, file);
    renameSync(tempPath, outputPath);
    return outputPath;
  } finally {
    rmSync(tempPath, { force: true });
  }
}

async function isVerifiedAsset(path, file) {
  if (!existsSync(path)) return false;
  try {
    await assertVerifiedAsset(path, file);
    return true;
  } catch {
    return false;
  }
}

async function assertVerifiedAsset(path, file) {
  const details = statSync(path);
  if (!details.isFile()) throw new Error(`Qwen3-ASR asset is not a file: ${path}`);
  if (details.size !== file.sizeBytes) {
    throw new Error(`Qwen3-ASR asset ${file.filename} size mismatch: expected ${file.sizeBytes}, got ${details.size}.`);
  }
  const digest = await sha256File(path);
  if (digest !== file.sha256) {
    throw new Error(`Qwen3-ASR asset ${file.filename} sha256 mismatch: expected ${file.sha256}, got ${digest}.`);
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}

async function downloadFile(url, outputPath, redirects = 5) {
  if (redirects < 0) throw new Error(`Too many redirects while downloading Qwen3-ASR asset: ${url}`);
  await new Promise((resolvePromise, reject) => {
    const request = https.get(url, (response) => {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, url).toString();
        resolvePromise(downloadFile(nextUrl, outputPath, redirects - 1));
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`Failed to download Qwen3-ASR asset ${url}: HTTP ${status}.`));
        return;
      }
      pipeline(response, createWriteStream(outputPath)).then(resolvePromise, reject);
    });
    request.on("error", reject);
  });
}

function loadAssetManifest() {
  if (!existsSync(assetManifestPath)) throw new Error(`Qwen3-ASR asset manifest is missing: ${assetManifestPath}`);
  const parsed = JSON.parse(readFileSync(assetManifestPath, "utf8"));
  validateAssetManifest(parsed);
  return parsed;
}

function validateAssetManifest(manifest) {
  const errors = [];
  if (!isObject(manifest)) throw new Error("Invalid Qwen3-ASR asset manifest: manifest must be an object");
  if (manifest.schemaVersion !== "ambient-stt-qwen3-asr-assets-v1") errors.push("schemaVersion must be ambient-stt-qwen3-asr-assets-v1");
  if (!nonEmptyString(manifest.version)) errors.push("version is required");
  if (!Array.isArray(manifest.models) || manifest.models.length === 0) errors.push("models must be a non-empty array");
  if (manifest.downloadPolicy?.directModelDownloadsEnabled && manifest.downloadPolicy.directModelDownloadsRequireSha256 !== true) {
    errors.push("direct model downloads require sha256 verification");
  }
  if (manifest.downloadPolicy?.directRuntimeDownloadsEnabled && manifest.downloadPolicy.directRuntimeDownloadsRequireSha256 !== true) {
    errors.push("direct runtime downloads require sha256 verification");
  }
  if (Array.isArray(manifest.runtimeLanes)) {
    for (const lane of manifest.runtimeLanes) {
      if (lane?.directDownload?.enabled) errors.push(`runtime lane ${lane.id ?? "unknown"} enables direct downloads; runtime archives are not approved yet`);
    }
  }
  if (Array.isArray(manifest.models)) {
    for (const model of manifest.models) validateModelSpec(model, errors);
  }
  if (errors.length) throw new Error(`Invalid Qwen3-ASR asset manifest: ${errors.join("; ")}`);
}

function validateModelSpec(model, errors) {
  if (!isObject(model)) {
    errors.push("model entry must be an object");
    return;
  }
  if (!nonEmptyString(model.id)) errors.push("model.id is required");
  if (!nonEmptyString(model.huggingFace?.repo)) errors.push(`${model.id ?? "model"}.huggingFace.repo is required`);
  if (!nonEmptyString(model.huggingFace?.revision)) errors.push(`${model.id ?? "model"}.huggingFace.revision is required`);
  if (!nonEmptyString(model.huggingFace?.legacyRef)) errors.push(`${model.id ?? "model"}.huggingFace.legacyRef is required`);
  if (!Array.isArray(model.files) || model.files.length === 0) {
    errors.push(`${model.id ?? "model"}.files must be non-empty`);
    return;
  }
  const roles = new Set();
  for (const file of model.files) {
    if (!isObject(file)) {
      errors.push(`${model.id}.files entry must be an object`);
      continue;
    }
    roles.add(file.role);
    if (!["model", "mmproj"].includes(file.role)) errors.push(`${model.id}.${file.filename ?? "file"} role must be model or mmproj`);
    if (!nonEmptyString(file.filename) || basename(file.filename) !== file.filename) errors.push(`${model.id}.${file.role ?? "file"} filename is invalid`);
    if (!Number.isInteger(file.sizeBytes) || file.sizeBytes <= 0) errors.push(`${model.id}.${file.filename ?? "file"} sizeBytes must be positive`);
    if (!/^[a-f0-9]{64}$/i.test(file.sha256 ?? "")) errors.push(`${model.id}.${file.filename ?? "file"} sha256 must be a 64-character hex digest`);
    if (!isHttpsUrl(file.url)) errors.push(`${model.id}.${file.filename ?? "file"} url must be https`);
  }
  if (!roles.has("model")) errors.push(`${model.id} is missing a model asset`);
  if (!roles.has("mmproj")) errors.push(`${model.id} is missing a mmproj asset`);
}

function defaultModelFromManifest(manifest) {
  const model = manifest.models.find((candidate) => candidate.default === true) ?? manifest.models[0];
  if (!model) throw new Error("Qwen3-ASR asset manifest has no default model.");
  return model;
}

function assetManifestSummary(manifest = assetManifest, modelSpec = defaultModelSpec) {
  const runtimeLanes = Array.isArray(manifest.runtimeLanes) ? manifest.runtimeLanes : [];
  return {
    schemaVersion: manifest.schemaVersion,
    version: manifest.version,
    model: {
      id: modelSpec.id,
      repo: modelSpec.huggingFace.repo,
      revision: modelSpec.huggingFace.revision,
      files: modelSpec.files.map((file) => ({
        role: file.role,
        filename: file.filename,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
      })),
    },
    runtime: {
      directDownloadsEnabled: runtimeLanes.some((lane) => lane?.directDownload?.enabled === true),
      lanes: runtimeLanes.map((lane) => lane?.id).filter((lane) => typeof lane === "string" && lane.trim()),
    },
  };
}

function assetCacheRoot(manifest, modelSpec) {
  const configuredRoot = process.env.AMBIENT_QWEN3_ASR_ASSET_DIR?.trim();
  const base = configuredRoot ? resolve(configuredRoot) : defaultCacheBase();
  return join(base, safePathPart(manifest.provider ?? "qwen3-asr"), safePathPart(modelSpec.id), safePathPart(modelSpec.huggingFace.revision));
}

function defaultCacheBase() {
  const currentPlatform = nodePlatform();
  if (currentPlatform === "win32") {
    return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Ambient", "stt");
  }
  if (currentPlatform === "darwin") {
    return join(homedir(), "Library", "Caches", "Ambient", "stt");
  }
  return join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "Ambient", "stt");
}

function customModelSource(model) {
  return model.includes("/") ? "huggingface" : "custom";
}

function safePathPart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHttpsUrl(value) {
  if (!nonEmptyString(value)) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function resolveRuntimeBinary() {
  const configured = process.env.AMBIENT_QWEN3_ASR_BINARY?.trim();
  if (configured) {
    const resolved = configured.includes("/") || configured.includes("\\") ? resolve(configured) : configured;
    if (configured.includes("/") || configured.includes("\\")) {
      return existsSync(resolved)
        ? { available: true, command: resolved }
        : { available: false, command: resolved, reason: `Configured Qwen3-ASR binary does not exist: ${resolved}` };
    }
    return commandAvailable(resolved)
      ? { available: true, command: resolved }
      : { available: false, command: resolved, reason: `Configured Qwen3-ASR binary was not found on PATH: ${resolved}` };
  }

  return commandAvailable("llama-mtmd-cli")
    ? { available: true, command: "llama-mtmd-cli" }
    : { available: false, reason: "llama-mtmd-cli was not found on PATH." };
}

function commandAvailable(command) {
  const probe = process.platform === "win32"
    ? spawnSync("where", [command], { encoding: "utf8" })
    : spawnSync("sh", ["-lc", `command -v ${shellQuote(command)}`], { encoding: "utf8" });
  return probe.status === 0;
}

function runtimeVersion(command) {
  try {
    const result = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 256 });
    const lines = [result.stdout, result.stderr].filter(Boolean).join("\n").trim().split(/\r?\n/).filter(Boolean);
    return lines.find((line) => /^version:/i.test(line)) ?? lines.find((line) => !/^ggml_/i.test(line));
  } catch {
    return undefined;
  }
}

function parseQwen3AsrOutput(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return { text: "", language: undefined };
  const asrTextMatch = /<\|?asr_text\|?>\s*([\s\S]*)$/i.exec(trimmed) ?? /<asr_text>\s*([\s\S]*)$/i.exec(trimmed);
  const languageMatch =
    /(?:^|\b)language\s+([^<\n\r]+?)\s*<\|?asr_text\|?>/i.exec(trimmed) ??
    /(?:^|\b)language\s+([^<\n\r]+?)\s*<asr_text>/i.exec(trimmed);
  if (!asrTextMatch) return { text: trimmed, language: languageMatch?.[1]?.trim() };
  return {
    text: asrTextMatch[1]?.trim() ?? "",
    language: languageMatch?.[1]?.trim(),
  };
}

function transcriptionPayload(input) {
  return {
    text: input.text,
    language: input.language,
    durationMs: input.durationMs,
    providerId,
    artifacts: {
      jsonPath: input.outputJson,
    },
    runtime: input.runtime,
  };
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--health") {
      options.health = true;
    } else if (arg === "--audio") {
      options.audio = args[++index];
    } else if (arg === "--language") {
      options.language = args[++index];
    } else if (arg === "--output-json") {
      options.outputJson = args[++index];
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function writeOutputJson(path, payload) {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function required(value, name) {
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

function numericEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function availableParallelism() {
  try {
    return nodeAvailableParallelism();
  } catch {
    return undefined;
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function helpText() {
  return `Ambient Qwen3-ASR STT provider

Usage:
  node scripts/run.mjs --audio <wav> --language <language> --output-json <path>
  node scripts/run.mjs --health

Environment:
  AMBIENT_QWEN3_ASR_BINARY          Optional llama-mtmd-cli path or command name.
  AMBIENT_QWEN3_ASR_ASSET_DIR       Optional cache root for verified manifest assets.
  AMBIENT_QWEN3_ASR_MODEL           Optional custom llama.cpp -hf ref. Default uses pinned manifest assets (${defaultModel}).
  AMBIENT_QWEN3_ASR_THREADS         Optional llama.cpp thread count.
  AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT Test-only deterministic transcript.
`;
}
