#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const providerId = "faster-whisper-tiny-en-cpu";
const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pythonRunner = resolve(packageRoot, "scripts", "faster_whisper_transcribe.py");
const fasterWhisperVersion = process.env.AMBIENT_FASTER_WHISPER_VERSION?.trim() || "1.1.1";
const pythonVersion = process.env.AMBIENT_FASTER_WHISPER_PYTHON?.trim() || "3.12";
const defaultModel = process.env.AMBIENT_FASTER_WHISPER_MODEL?.trim() || "tiny.en";
const defaultDevice = process.env.AMBIENT_FASTER_WHISPER_DEVICE?.trim() || "cpu";
const defaultComputeType = process.env.AMBIENT_FASTER_WHISPER_COMPUTE_TYPE?.trim() || "int8";

main();

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.health) {
      writeJson(healthPayload());
      return;
    }
    runTranscription(options);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

function runTranscription(options) {
  const audioPath = required(options.audio, "--audio");
  const outputJson = required(options.outputJson, "--output-json");
  const language = options.language || "English";
  const audio = resolve(audioPath);
  if (!existsSync(audio) || !statSync(audio).isFile()) throw new Error(`Audio input does not exist: ${audioPath}`);

  const fakeTranscript = process.env.AMBIENT_FASTER_WHISPER_FAKE_TRANSCRIPT;
  if (fakeTranscript !== undefined) {
    const payload = transcriptionPayload({
      text: fakeTranscript,
      language,
      durationMs: 0,
      outputJson,
      runtime: { mode: "fake", distribution: adapterDistributionContract() },
    });
    writeOutputJson(outputJson, payload);
    writeJson(payload);
    return;
  }

  const uv = uvCommand();
  const model = defaultModel;
  const device = defaultDevice;
  const computeType = defaultComputeType;
  const beamSize = process.env.AMBIENT_FASTER_WHISPER_BEAM_SIZE?.trim() || "1";
  const startedAt = Date.now();
  const result = spawnSync(
    uv,
    [
      "run",
      "--python",
      pythonVersion,
      "--with",
      `faster-whisper==${fasterWhisperVersion}`,
      "--with",
      "requests",
      "python",
      pythonRunner,
      "--audio",
      audio,
      "--language",
      language,
      "--model",
      model,
      "--device",
      device,
      "--compute-type",
      computeType,
      "--beam-size",
      beamSize,
    ],
    {
      cwd: packageRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 32,
    },
  );
  const elapsedMs = Date.now() - startedAt;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || result.stdout?.trim() || "faster-whisper exited unsuccessfully";
    throw new Error(`faster-whisper runtime failed: ${stderr}`);
  }

  const parsed = parseProviderStdout(result.stdout);
  const text = parsed.text?.trim();
  if (!text) throw new Error("faster-whisper returned an empty transcript.");
  const payload = transcriptionPayload({
    text,
    language: parsed.language?.trim() || language,
    durationMs: parsed.elapsedMs ?? elapsedMs,
    outputJson,
    runtime: {
      mode: "faster-whisper",
      uv,
      pythonVersion,
      fasterWhisperVersion,
      model,
      device,
      computeType,
      beamSize: Number(beamSize),
      elapsedMs,
      languageProbability: parsed.languageProbability,
      audioDurationMs: parsed.audioDurationMs,
      distribution: adapterDistributionContract(),
    },
  });
  writeOutputJson(outputJson, payload);
  writeJson(payload);
}

function healthPayload() {
  if (process.env.AMBIENT_FASTER_WHISPER_FAKE_TRANSCRIPT !== undefined) {
    return {
      providerId,
      available: true,
      reason: "Using deterministic fake transcript hook for tests.",
      runtime: { mode: "fake" },
      distribution: adapterDistributionContract(),
      installPlan: installPlanContract(),
      missingHints: [],
    };
  }
  const uv = uvCommand();
  const version = commandVersion(uv, ["--version"]);
  const available = Boolean(version);
  return {
    providerId,
    available,
    reason: available
      ? "uv is available. The faster-whisper model and Python environment are resolved on first transcription."
      : `uv was not found or did not run: ${uv}`,
    runtime: {
      uv,
      version,
      pythonVersion,
      fasterWhisperVersion,
      model: defaultModel,
      device: defaultDevice,
      computeType: defaultComputeType,
    },
    distribution: adapterDistributionContract(),
    installPlan: installPlanContract(),
    missingHints: available
      ? []
      : [
          "Install uv or set AMBIENT_FASTER_WHISPER_UV to an absolute uv path.",
          "First transcription may download Python wheels and the selected faster-whisper model into local caches.",
        ],
  };
}

function adapterDistributionContract() {
  return {
    packageType: "adapter-only",
    bundledRuntimeBinaries: false,
    bundledPythonWheels: false,
    bundledModelWeights: false,
    bundledModelAssets: false,
  };
}

function installPlanContract() {
  return {
    resolver: "uv",
    pythonVersion,
    packages: [`faster-whisper==${fasterWhisperVersion}`, "requests"],
    defaultModel,
    defaultDevice,
    defaultComputeType,
    firstRunBehavior:
      "uv resolves Python wheels/dependencies and faster-whisper resolves selected model assets into local caches on first real transcription.",
  };
}

function parseProviderStdout(stdout) {
  try {
    const parsed = JSON.parse(stdout.trim());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("stdout JSON must be an object");
    return parsed;
  } catch (error) {
    throw new Error(`faster-whisper returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
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

function writeOutputJson(path, payload) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function commandVersion(command, args) {
  try {
    const result = spawnSync(command, args, { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 256 });
    if (result.status !== 0) return undefined;
    return [result.stdout, result.stderr].filter(Boolean).join("\n").trim().split(/\r?\n/).find(Boolean);
  } catch {
    return undefined;
  }
}

function uvCommand() {
  return process.env.AMBIENT_FASTER_WHISPER_UV?.trim() || "uv";
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
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function required(value, name) {
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}
