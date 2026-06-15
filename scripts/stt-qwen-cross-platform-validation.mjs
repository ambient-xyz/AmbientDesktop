#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { arch, cpus, homedir, platform, release, totalmem } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const schemaVersion = "ambient-stt-qwen3-asr-phase10-v1";
const defaultTimeoutMs = 15 * 60 * 1000;
const defaultNoSpeechThresholdDbfs = -55;
const defaultFixturePath = ".ambient/stt-spike/fixtures/en-short-clean.wav";
const defaultProviderScriptPath = "resources/ambient-cli-packages/ambient-qwen3-asr/scripts/run.mjs";

const cwd = process.cwd();
const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(helpText());
  process.exit(0);
}

const runId = options.runId || new Date().toISOString().replace(/[:.]/g, "-");
const outRoot = resolvePath(options.out || ".ambient/stt-validation/qwen3-asr");
const runDir = resolve(outRoot, runId);
const logsDir = join(runDir, "logs");
const samplesDir = join(runDir, "samples");
const transcriptsDir = join(runDir, "transcripts");
await mkdir(logsDir, { recursive: true });
await mkdir(samplesDir, { recursive: true });
await mkdir(transcriptsDir, { recursive: true });

const providerScriptPath = resolvePath(options.providerScript || defaultProviderScriptPath);
if (!existsSync(providerScriptPath)) throw new Error(`Qwen3-ASR provider script was not found: ${providerScriptPath}`);

const speechSampleDefinitions = await loadSpeechSampleDefinitions();

const lanes = normalizeLanes(options.lanes || defaultLanesForHost());
assertLaneHostCompatibility(lanes);
const startedAt = new Date().toISOString();
const host = await collectHostFacts();
const samples = await prepareSamples({ speechSamples: speechSampleDefinitions, samplesDir, includeSilence: options.samples.includes("silence") });
const results = [];

for (const lane of lanes) {
  const laneResults = await runLane({ lane, samples });
  results.push(laneResults);
  await writeFile(join(runDir, `${safeSegment(lane.id)}.json`), `${JSON.stringify(laneResults, null, 2)}\n`, "utf8");
}

const completedAt = new Date().toISOString();
const summary = {
  schemaVersion,
  runId,
  startedAt,
  completedAt,
  host,
  config: {
    providerScriptPath,
    audioPath: options.audio ? resolvePath(options.audio) : undefined,
    audioManifestPath: options.audioManifest ? resolvePath(options.audioManifest) : undefined,
    speechSampleCount: speechSampleDefinitions.length,
    lanes: lanes.map((lane) => lane.id),
    samples: options.samples,
    language: options.language,
    expectedTranscriptContains: options.expectedTranscriptContains,
    timeoutMs: options.timeoutMs,
    threads: options.threads,
    assetDir: options.assetDir,
    fakeTranscript: Boolean(options.fakeTranscript),
    noSpeechThresholdDbfs: options.noSpeechThresholdDbfs,
    requireHostMatch: Boolean(options.requireHostMatch),
  },
  results,
  decision: summarizeDecision(results),
};

const summaryJsonPath = join(runDir, "summary.json");
const summaryMarkdownPath = join(runDir, "summary.md");
await writeFile(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
await writeFile(summaryMarkdownPath, renderMarkdownSummary(summary, { summaryJsonPath, summaryMarkdownPath }), "utf8");

process.stdout.write(`Qwen3-ASR Phase 10 validation complete\n`);
process.stdout.write(`- run: ${runId}\n`);
process.stdout.write(`- decision: ${summary.decision.status}\n`);
process.stdout.write(`- results: ${pathForReport(summaryJsonPath)}\n`);
process.stdout.write(`- summary: ${pathForReport(summaryMarkdownPath)}\n`);

if (summary.decision.status !== "passed") process.exitCode = 1;

async function runLane(input) {
  const laneDir = join(runDir, safeSegment(input.lane.id));
  await mkdir(laneDir, { recursive: true });
  const env = laneEnv(input.lane);
  const health = await runProviderScript({
    lane: input.lane,
    sampleId: "health",
    args: ["--health"],
    env,
    timeoutMs: Math.min(options.timeoutMs, 60_000),
  });
  const healthPayload = parseJson(health.stdout);
  const sampleResults = [];
  for (const sample of input.samples) {
    sampleResults.push(await runSample({ lane: input.lane, sample, env }));
  }
  const status = health.status === "succeeded" && healthPayload?.available === true && sampleResults.every((result) => result.status === "passed") ? "passed" : "failed";
  return {
    lane: {
      id: input.lane.id,
      label: input.lane.label,
      platform: input.lane.platform,
      arch: input.lane.arch,
      accelerator: input.lane.accelerator,
      env: redactEnvForReport(input.lane.env),
    },
    status,
    health: {
      status: health.status,
      exitCode: health.exitCode,
      elapsedMs: health.elapsedMs,
      payload: healthPayload,
      stderrPreview: preview(health.stderr, 900),
      artifacts: health.artifacts,
    },
    samples: sampleResults,
  };
}

async function runSample(input) {
  const noSpeechGate = await classifyNoSpeech(input.sample.path, {
    thresholdDbfs: options.noSpeechThresholdDbfs,
    sampleRate: 16_000,
  });
  if (input.sample.kind === "silence" && noSpeechGate.status === "classified" && noSpeechGate.noSpeech) {
    return {
      id: input.sample.id,
      kind: input.sample.kind,
      status: "passed",
      execution: { status: "skipped", reason: "no-speech-gate" },
      audio: input.sample.audio,
      noSpeechGate,
      transcript: { text: "", preview: "" },
    };
  }

  const outputJsonPath = join(transcriptsDir, `${safeSegment(input.lane.id)}__${safeSegment(input.sample.id)}.json`);
  const llamaLogPath = join(logsDir, `${safeSegment(input.lane.id)}__${safeSegment(input.sample.id)}.llama.log`);
  const execution = await runProviderScript({
    lane: input.lane,
    sampleId: input.sample.id,
    args: ["--audio", input.sample.path, "--language", input.sample.language, "--output-json", outputJsonPath],
    env: { ...input.env, LLAMA_LOG_FILE: llamaLogPath },
    timeoutMs: options.timeoutMs,
  });
  const llamaLog = await readTextIfExists(llamaLogPath);
  const payload = parseJson(execution.stdout) ?? await readJsonIfExists(outputJsonPath);
  const transcript = typeof payload?.text === "string" ? payload.text.trim() : "";
  const expectedTranscriptContains = input.sample.expectedTranscriptContains ?? options.expectedTranscriptContains;
  const expectedMatch = !expectedTranscriptContains || normalizeText(transcript).includes(normalizeText(expectedTranscriptContains));
  const status = execution.status === "succeeded" && Boolean(transcript) && expectedMatch ? "passed" : "failed";
  return {
    id: input.sample.id,
    kind: input.sample.kind,
    status,
    execution: {
      status: execution.status,
      exitCode: execution.exitCode,
      signal: execution.signal,
      timedOut: execution.timedOut,
      elapsedMs: execution.elapsedMs,
      stderrPreview: preview(execution.stderr, 1200),
    },
    audio: input.sample.audio,
    noSpeechGate,
    transcript: {
      text: transcript,
      preview: preview(transcript, 260),
      language: payload?.language,
      expectedContains: expectedTranscriptContains,
      expectedContainsMatched: expectedMatch,
      expectedText: input.sample.expectedText,
      outputJsonPath: pathForReport(outputJsonPath),
      runtimeDurationMs: payload?.durationMs,
    },
    quality: summarizeQuality(input.sample.expectedText, transcript),
    runtime: payload?.runtime,
    acceleratorEvidence: summarizeAcceleratorEvidence(`${execution.stderr}\n${llamaLog ?? ""}`, input.lane),
    artifacts: {
      ...execution.artifacts,
      ...(llamaLog !== undefined ? { llamaLogPath: pathForReport(llamaLogPath) } : {}),
    },
  };
}

async function runProviderScript(input) {
  const logBase = `${safeSegment(input.lane.id)}__${safeSegment(input.sampleId)}`;
  const stdoutPath = join(logsDir, `${logBase}.stdout.txt`);
  const stderrPath = join(logsDir, `${logBase}.stderr.txt`);
  if (options.dryRun) {
    const planned = {
      command: process.execPath,
      args: [providerScriptPath, ...input.args],
      env: redactEnvForReport(input.env),
    };
    await writeFile(stdoutPath, `${JSON.stringify(planned, null, 2)}\n`, "utf8");
    await writeFile(stderrPath, "", "utf8");
    return {
      status: "succeeded",
      exitCode: 0,
      signal: undefined,
      timedOut: false,
      elapsedMs: 0,
      stdout: input.args.includes("--health") ? JSON.stringify({ available: true, runtime: { mode: "dry-run" } }) : JSON.stringify({ text: options.fakeTranscript || "dry run transcript", language: options.language }),
      stderr: "",
      artifacts: { stdoutPath: pathForReport(stdoutPath), stderrPath: pathForReport(stderrPath) },
    };
  }
  const result = await execCapture(process.execPath, [providerScriptPath, ...input.args], {
    cwd: dirname(providerScriptPath),
    env: input.env,
    timeoutMs: input.timeoutMs,
  });
  await writeFile(stdoutPath, result.stdout, "utf8");
  await writeFile(stderrPath, result.stderr, "utf8");
  return {
    ...result,
    artifacts: {
      stdoutPath: pathForReport(stdoutPath),
      stderrPath: pathForReport(stderrPath),
    },
  };
}

function laneEnv(lane) {
  const env = {
    ...lane.env,
  };
  const binary = runtimeBinaryForValidation();
  if (binary) env.AMBIENT_QWEN3_ASR_BINARY = binary;
  if (options.assetDir) env.AMBIENT_QWEN3_ASR_ASSET_DIR = resolvePath(options.assetDir);
  if (options.threads) env.AMBIENT_QWEN3_ASR_THREADS = String(options.threads);
  if (options.fakeTranscript) env.AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT = options.fakeTranscript;
  return env;
}

async function prepareSamples(input) {
  const samples = [];
  if (options.samples.includes("speech")) {
    for (const sample of input.speechSamples) {
      samples.push({
        ...sample,
        kind: "speech",
        audio: await audioFacts(sample.path),
      });
    }
  }
  if (input.includeSilence) {
    const silencePath = join(input.samplesDir, "generated-silence-5s.wav");
    await writeFile(silencePath, pcm16SilenceWav(5_000));
    samples.push({
      id: "silence-5s",
      kind: "silence",
      path: silencePath,
      language: options.language,
      audio: await audioFacts(silencePath),
    });
  }
  return samples;
}

async function loadSpeechSampleDefinitions() {
  if (!options.audioManifest) {
    const speechAudioPath = resolvePath(options.audio || defaultFixturePath);
    if (!existsSync(speechAudioPath)) throw new Error(`Speech validation audio was not found: ${speechAudioPath}`);
    return [{
      id: "speech-short",
      kind: "speech",
      path: speechAudioPath,
      language: options.language,
      expectedTranscriptContains: options.expectedTranscriptContains,
    }];
  }
  const manifestPath = resolvePath(options.audioManifest);
  const manifest = parseJson(await readFile(manifestPath, "utf8"));
  if (!manifest || !Array.isArray(manifest.samples)) throw new Error(`Audio manifest must contain samples[]: ${manifestPath}`);
  const baseDir = dirname(manifestPath);
  const samples = [];
  for (const [index, rawSample] of manifest.samples.entries()) {
    if (!rawSample || typeof rawSample !== "object") throw new Error(`Audio manifest sample ${index} must be an object.`);
    const kind = rawSample.kind ?? "speech";
    if (kind !== "speech") continue;
    const id = nonEmptyString(rawSample.id) || safeSegment(rawSample.path || `speech-${index + 1}`);
    const samplePath = resolve(baseDir, requiredString(rawSample.path, `samples[${index}].path`));
    if (!existsSync(samplePath)) throw new Error(`Audio manifest sample ${id} does not exist: ${samplePath}`);
    samples.push({
      id,
      kind: "speech",
      path: samplePath,
      language: nonEmptyString(rawSample.language) || options.language,
      description: nonEmptyString(rawSample.description),
      expectedTranscriptContains: nonEmptyString(rawSample.expectedTranscriptContains) || options.expectedTranscriptContains,
      expectedText: nonEmptyString(rawSample.expectedText),
    });
  }
  if (!samples.length) throw new Error(`Audio manifest did not contain any speech samples: ${manifestPath}`);
  assertUnique(samples.map((sample) => sample.id), "audio manifest sample id");
  return samples;
}

async function classifyNoSpeech(audioPath, input) {
  const result = await decodePcm16Mono(audioPath, input.sampleRate);
  if (result.status !== "succeeded") {
    return {
      status: "failed",
      method: "rms-dbfs",
      thresholdDbfs: input.thresholdDbfs,
      error: result.error,
      stderrPreview: preview(result.stderr ?? "", 600),
    };
  }
  const samples = result.samples;
  let sumSquares = 0;
  let peak = 0;
  const sampleCount = Math.floor(samples.length / 2);
  for (let index = 0; index < sampleCount; index += 1) {
    const value = samples.readInt16LE(index * 2);
    sumSquares += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  const rms = sampleCount ? Math.sqrt(sumSquares / sampleCount) : 0;
  const rmsDbfs = amplitudeToDbfs(rms);
  const peakDbfs = amplitudeToDbfs(peak);
  return {
    status: "classified",
    method: "rms-dbfs",
    thresholdDbfs: input.thresholdDbfs,
    sampleRate: input.sampleRate,
    sampleCount,
    durationMs: sampleCount ? Math.round((sampleCount / input.sampleRate) * 1000) : undefined,
    rmsDbfs,
    peakDbfs,
    noSpeech: rmsDbfs === undefined || rmsDbfs < input.thresholdDbfs,
  };
}

async function decodePcm16Mono(audioPath, sampleRate) {
  const ffmpeg = await commandExists("ffmpeg");
  if (ffmpeg) {
    const result = await execCapture("ffmpeg", ["-nostdin", "-v", "error", "-i", audioPath, "-ar", String(sampleRate), "-ac", "1", "-f", "s16le", "-"], {
      timeoutMs: 60_000,
      encoding: "buffer",
    });
    if (result.status === "succeeded") return { status: "succeeded", samples: Buffer.from(result.stdoutBuffer) };
    return { status: "failed", error: `ffmpeg exited with ${result.exitCode ?? result.signal ?? "error"}`, stderr: result.stderr };
  }
  try {
    return { status: "succeeded", samples: pcm16SamplesFromWav(await readFile(audioPath)) };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

function pcm16SamplesFromWav(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Audio is not a RIFF/WAVE file and ffmpeg is not available.");
  }
  let offset = 12;
  let format;
  let data;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (id === "fmt ") {
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    }
    if (id === "data") data = buffer.subarray(start, end);
    offset = end + (size % 2);
  }
  if (!format || !data) throw new Error("WAV file is missing fmt or data chunks.");
  if (format.audioFormat !== 1 || format.bitsPerSample !== 16) throw new Error("Only PCM16 WAV can be decoded without ffmpeg.");
  if (format.channels !== 1) throw new Error("Only mono WAV can be decoded without ffmpeg.");
  return data;
}

async function audioFacts(path) {
  const details = await stat(path);
  const ffprobe = await commandExists("ffprobe");
  let probe;
  if (ffprobe) {
    const result = await execCapture("ffprobe", ["-v", "error", "-show_entries", "format=duration,size:stream=codec_name,sample_rate,channels", "-of", "json", path], {
      timeoutMs: 30_000,
    });
    probe = parseJson(result.stdout);
  }
  return {
    path: pathForReport(path),
    filename: basename(path),
    sizeBytes: details.size,
    sha256: await sha256(path),
    durationMs: probe?.format?.duration ? Math.round(Number(probe.format.duration) * 1000) : undefined,
    codec: probe?.streams?.[0]?.codec_name,
    sampleRate: probe?.streams?.[0]?.sample_rate ? Number(probe.streams[0].sample_rate) : undefined,
    channels: probe?.streams?.[0]?.channels,
  };
}

async function collectHostFacts() {
  const gpu = await optionalCommand("nvidia-smi", ["--query-gpu=name,driver_version,memory.total", "--format=csv,noheader"]);
  const devices = await optionalCommand("nvidia-smi", ["--query-compute-apps=pid,process_name,used_memory", "--format=csv,noheader"]);
  const binary = runtimeBinaryForValidation();
  const binaryVersion = binary ? await optionalCommand(binary, ["--version"]) : undefined;
  const listDevices = binary ? await optionalCommand(binary, ["--list-devices"]) : undefined;
  return {
    platform: platform(),
    arch: arch(),
    release: release(),
    cpuModel: cpus()[0]?.model,
    cpuCount: cpus().length,
    memoryBytes: totalmem(),
    node: process.version,
    nvidiaSmi: gpu?.status === "succeeded" ? gpu.stdout.trim().split(/\r?\n/).filter(Boolean) : [],
    nvidiaComputeApps: devices?.status === "succeeded" ? devices.stdout.trim().split(/\r?\n/).filter(Boolean) : [],
    runtimeBinary: binary,
    runtimeVersion: binaryVersion?.status === "succeeded" ? firstUsefulLine(binaryVersion.stdout || binaryVersion.stderr) : undefined,
    runtimeDevices: listDevices?.status === "succeeded" ? listDevices.stdout.trim().split(/\r?\n/).filter(Boolean) : [],
  };
}

function runtimeBinaryForValidation() {
  return options.binary || process.env.AMBIENT_QWEN3_ASR_BINARY || (options.fakeTranscript ? process.execPath : defaultRuntimeBinaryForHost());
}

function defaultRuntimeBinaryForHost() {
  const home = homedir();
  const candidates = platform() === "darwin"
    ? [
        "/opt/homebrew/opt/llama.cpp/bin/llama-mtmd-cli",
        "/usr/local/opt/llama.cpp/bin/llama-mtmd-cli",
        "/opt/homebrew/bin/llama-mtmd-cli",
        "/usr/local/bin/llama-mtmd-cli",
        join(home, ".local/bin/llama-mtmd-cli"),
      ]
    : platform() === "win32"
      ? [
          join(home, "AppData/Local/Programs/llama.cpp/llama-mtmd-cli.exe"),
          "C:/Program Files/llama.cpp/llama-mtmd-cli.exe",
          "C:/Program Files (x86)/llama.cpp/llama-mtmd-cli.exe",
        ]
      : platform() === "linux"
        ? [
            "/usr/local/bin/llama-mtmd-cli",
            "/usr/bin/llama-mtmd-cli",
            join(home, ".local/bin/llama-mtmd-cli"),
          ]
        : [];
  return candidates.find((candidate) => existsSync(candidate));
}

function normalizeLanes(raw) {
  const ids = raw.split(",").map((lane) => lane.trim()).filter(Boolean);
  if (!ids.length) throw new Error("--lanes must name at least one lane.");
  return ids.map((id) => {
    if (id === "cuda") {
      if (platform() === "linux") return linuxCudaLane();
      if (platform() === "win32") return windowsCudaLane();
      throw new Error("Generic lane id cuda is only supported on Linux or Windows hosts. Use macos-metal on macOS.");
    }
    if (id === "cpu") {
      if (platform() === "linux") return linuxCpuLane();
      if (platform() === "win32") return windowsCpuLane();
      throw new Error("Generic lane id cpu is only supported on Linux or Windows hosts. Use an explicit platform lane.");
    }
    if (["linux-cuda", "linux-x64-nvidia-cuda"].includes(id)) {
      return linuxCudaLane();
    }
    if (["linux-cpu", "linux-x64-cpu"].includes(id)) {
      return linuxCpuLane();
    }
    if (["windows-cuda", "windows-x64-nvidia-cuda", "win-cuda"].includes(id)) {
      return windowsCudaLane();
    }
    if (["windows-cpu", "windows-x64-cpu", "win-cpu"].includes(id)) {
      return windowsCpuLane();
    }
    if (["windows-vulkan", "windows-x64-vulkan", "win-vulkan"].includes(id)) {
      return {
        id: "windows-x64-vulkan",
        label: "Windows x64 Vulkan fallback",
        platform: "win32",
        arch: "x64",
        accelerator: "vulkan",
        env: {
          LLAMA_ARG_DEVICE: "Vulkan0",
        },
      };
    }
    if (["macos-metal", "darwin-metal"].includes(id)) {
      return {
        id: "macos-arm64-metal",
        label: "macOS arm64 Metal",
        platform: "darwin",
        arch: "arm64",
        accelerator: "metal",
        env: {},
      };
    }
    throw new Error(`Unknown Qwen3-ASR validation lane: ${id}`);
  });
}

function defaultLanesForHost() {
  if (platform() === "linux") return "cuda,cpu";
  if (platform() === "darwin") return "macos-metal";
  if (platform() === "win32") return "windows-cuda,windows-cpu";
  throw new Error(`No default Qwen3-ASR validation lanes for platform ${platform()}. Use --lanes.`);
}

function linuxCudaLane() {
  return {
    id: "linux-x64-nvidia-cuda",
    label: "Linux x64 NVIDIA CUDA",
    platform: "linux",
    arch: "x64",
    accelerator: "nvidia-cuda",
    env: {
      LLAMA_ARG_DEVICE: "CUDA0",
    },
  };
}

function linuxCpuLane() {
  return {
    id: "linux-x64-cpu",
    label: "Linux x64 CPU fallback",
    platform: "linux",
    arch: "x64",
    accelerator: "cpu",
    env: {
      LLAMA_ARG_DEVICE: "none",
      CUDA_VISIBLE_DEVICES: "",
      GGML_CUDA_NO_PINNED: "1",
    },
  };
}

function windowsCudaLane() {
  return {
    id: "windows-x64-nvidia-cuda",
    label: "Windows x64 NVIDIA CUDA",
    platform: "win32",
    arch: "x64",
    accelerator: "nvidia-cuda",
    env: {
      LLAMA_ARG_DEVICE: "CUDA0",
    },
  };
}

function windowsCpuLane() {
  return {
    id: "windows-x64-cpu",
    label: "Windows x64 CPU fallback",
    platform: "win32",
    arch: "x64",
    accelerator: "cpu",
    env: {
      LLAMA_ARG_DEVICE: "none",
      CUDA_VISIBLE_DEVICES: "",
      GGML_CUDA_NO_PINNED: "1",
    },
  };
}

function assertLaneHostCompatibility(lanes) {
  if (!options.requireHostMatch) return;
  const mismatches = lanes.filter((lane) => lane.platform !== platform() || lane.arch !== arch());
  if (!mismatches.length) return;
  throw new Error(
    `Validation lane host mismatch: current host is ${platform()} ${arch()}, but requested ${mismatches.map((lane) => `${lane.id} (${lane.platform} ${lane.arch})`).join(", ")}.`,
  );
}

function summarizeDecision(results) {
  const failed = results.filter((result) => result.status !== "passed");
  if (failed.length) {
    return {
      status: "failed",
      rationale: `${failed.length} of ${results.length} validation lanes failed.`,
      failedLanes: failed.map((result) => result.lane.id),
    };
  }
  return {
    status: "passed",
    rationale: `All ${results.length} Qwen3-ASR validation lanes passed.`,
    failedLanes: [],
  };
}

function summarizeAcceleratorEvidence(stderr, lane) {
  const lines = stderr.split(/\r?\n/).filter(Boolean);
  const lower = stderr.toLowerCase();
  return {
    expectedAccelerator: lane.accelerator,
    cudaInitialized: /ggml_cuda_init/i.test(stderr),
    cudaDeviceLines: lines.filter((line) => /device\s+\d+|cuda|vulkan/i.test(line)).slice(0, 8),
    gpuLayerLines: lines.filter((line) => /offload|gpu layers|cuda|metal|vulkan/i.test(line)).slice(0, 12),
    forcedDeviceOverride: lane.env.LLAMA_ARG_DEVICE,
    mentionsNoDevice: lower.includes("device none") || lower.includes("devices: none"),
  };
}

function renderMarkdownSummary(input, paths) {
  const lines = [
    `# Qwen3-ASR Phase 10 Validation ${input.runId}`,
    "",
    `Started: ${input.startedAt}`,
    `Completed: ${input.completedAt}`,
    `Decision: ${input.decision.status}`,
    "",
    "## Host",
    "",
    `- OS: ${input.host.platform} ${input.host.release} ${input.host.arch}`,
    `- CPU: ${input.host.cpuModel ?? "unknown"} (${input.host.cpuCount ?? "unknown"} cores)`,
    `- RAM: ${input.host.memoryBytes ? `${Math.round(input.host.memoryBytes / 1024 / 1024 / 1024)} GB` : "unknown"}`,
    `- Node: ${input.host.node}`,
    `- Runtime binary: ${input.host.runtimeBinary ?? "not explicitly bound"}`,
    `- Runtime version: ${input.host.runtimeVersion ?? "unknown"}`,
    `- NVIDIA: ${input.host.nvidiaSmi.length ? input.host.nvidiaSmi.join("; ") : "not detected"}`,
    "",
    "## Results",
    "",
    "| Lane | Sample | Status | Duration | RTF | Quality | Gate | Transcript |",
    "| --- | --- | --- | ---: | ---: | ---: | --- | --- |",
    ...input.results.flatMap((result) => result.samples.map((sample) => {
      const rtf = sample.audio?.durationMs && sample.execution?.elapsedMs ? (sample.execution.elapsedMs / sample.audio.durationMs).toFixed(3) : "";
      const duration = sample.audio?.durationMs ? `${(sample.audio.durationMs / 1000).toFixed(1)}s` : "";
      const quality = sample.quality?.charErrorRate !== undefined ? sample.quality.charErrorRate.toFixed(3) : "";
      const gate = sample.execution?.reason === "no-speech-gate" ? "skipped" : sample.noSpeechGate?.noSpeech === true ? "no-speech" : "speech";
      return [
        result.lane.id,
        sample.id,
        sample.status,
        duration,
        rtf,
        quality,
        gate,
        tableText(sample.transcript?.preview ?? ""),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
    })),
    "",
    "## Artifacts",
    "",
    `- JSON: ${pathForReport(paths.summaryJsonPath)}`,
    `- Markdown: ${pathForReport(paths.summaryMarkdownPath)}`,
  ];
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const parsed = {
    timeoutMs: defaultTimeoutMs,
    samples: ["speech", "silence"],
    language: "English",
    noSpeechThresholdDbfs: defaultNoSpeechThresholdDbfs,
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
    if (arg === "--require-host-match") {
      parsed.requireHostMatch = true;
      continue;
    }
    const value = argv[index + 1];
    if (!arg.startsWith("--")) throw new Error(`Unknown argument: ${arg}`);
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    index += 1;
    const key = camelCase(arg.slice(2));
    if (key === "timeoutMs") parsed.timeoutMs = Number(value);
    else if (key === "noSpeechThresholdDbfs") parsed.noSpeechThresholdDbfs = Number(value);
    else if (key === "samples") parsed.samples = value.split(",").map((item) => item.trim()).filter(Boolean);
    else parsed[key] = value;
  }
  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs <= 0) throw new Error("--timeout-ms must be a positive number.");
  if (!Number.isFinite(parsed.noSpeechThresholdDbfs) || parsed.noSpeechThresholdDbfs >= 0) throw new Error("--no-speech-threshold-dbfs must be below 0.");
  for (const sample of parsed.samples) {
    if (!["speech", "silence"].includes(sample)) throw new Error(`Unknown sample kind: ${sample}`);
  }
  return parsed;
}

function helpText() {
  return `Qwen3-ASR Phase 10 validation harness

Usage:
  node scripts/stt-qwen-cross-platform-validation.mjs [options]

Options:
  --binary <path>                         Explicit llama-mtmd-cli path. Defaults to AMBIENT_QWEN3_ASR_BINARY or PATH.
  --audio <path>                          Speech WAV fixture. Defaults to ${defaultFixturePath}.
  --audio-manifest <path>                 JSON manifest with samples[]. Overrides --audio.
  --language <language>                   Spoken language prompt. Defaults to English.
  --lanes <ids>                           Comma-separated lanes. Defaults to cuda,cpu on Linux,
                                           macos-metal on macOS, and windows-cuda,windows-cpu on Windows.
                                           Known ids: cuda, cpu, macos-metal,
                                           linux-cuda, linux-cpu,
                                           windows-cuda, windows-cpu, windows-vulkan.
  --samples <ids>                         Comma-separated samples: speech,silence. Defaults to speech,silence.
  --asset-dir <path>                      Optional AMBIENT_QWEN3_ASR_ASSET_DIR cache root.
  --threads <n>                           Optional AMBIENT_QWEN3_ASR_THREADS value.
  --expected-transcript-contains <text>   Optional quality assertion for the speech sample.
  --provider-script <path>                Provider wrapper path. Defaults to bundled ambient-qwen3-asr run.mjs.
  --out <dir>                             Output root. Defaults to .ambient/stt-validation/qwen3-asr.
  --run-id <id>                           Stable run id.
  --timeout-ms <ms>                       Per-transcription timeout. Defaults to ${defaultTimeoutMs}.
  --fake-transcript <text>                Fast deterministic wrapper mode for harness validation only.
  --dry-run                               Write planned commands without invoking the provider.
  --require-host-match                    Fail when requested lanes do not match this host platform/arch.
  --help                                  Show this help.
`;
}

function execCapture(command, args, input = {}) {
  const started = process.hrtime.bigint();
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: input.cwd,
      env: { ...process.env, ...(input.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutMs ?? defaultTimeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolvePromise({
        status: "failed",
        exitCode: undefined,
        signal: undefined,
        timedOut,
        elapsedMs: Math.round(Number(process.hrtime.bigint() - started) / 1_000_000),
        stdout: input.encoding === "buffer" ? Buffer.concat(stdout) : Buffer.concat(stdout).toString("utf8"),
        stdoutBuffer: Buffer.concat(stdout),
        stderr: `${Buffer.concat(stderr).toString("utf8")}${error.message}\n`,
      });
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      resolvePromise({
        status: exitCode === 0 && !timedOut ? "succeeded" : "failed",
        exitCode,
        signal,
        timedOut,
        elapsedMs: Math.round(Number(process.hrtime.bigint() - started) / 1_000_000),
        stdout: input.encoding === "buffer" ? Buffer.concat(stdout) : Buffer.concat(stdout).toString("utf8"),
        stdoutBuffer: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function optionalCommand(command, args) {
  if (!await commandExists(command)) return undefined;
  return execCapture(command, args, { timeoutMs: 15_000 });
}

async function commandExists(command) {
  if (command.includes("/") || command.includes("\\")) return existsSync(command);
  if (platform() === "win32") {
    const result = await execCapture("where.exe", [command], { timeoutMs: 5_000 });
    return result.status === "succeeded";
  }
  const result = await execCapture("sh", ["-lc", `command -v ${shellQuote(command)}`], { timeoutMs: 5_000 });
  return result.status === "succeeded";
}

async function sha256(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

function pcm16SilenceWav(durationMs) {
  const sampleRate = 16_000;
  const channels = 1;
  const bitsPerSample = 16;
  const sampleCount = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const dataBytes = sampleCount * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}

function parseJson(value) {
  if (!value || typeof value !== "string") return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

async function readTextIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function amplitudeToDbfs(value) {
  if (!value) return undefined;
  return Number((20 * Math.log10(value / 32768)).toFixed(2));
}

function preview(value, limit = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}...`;
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeQualityText(value) {
  return normalizeText(value).replace(/[^\p{L}\p{N}\s]+/gu, "").replace(/\s+/g, " ").trim();
}

function summarizeQuality(expectedText, actualText) {
  if (!expectedText) return undefined;
  const expected = normalizeQualityText(expectedText);
  const actual = normalizeQualityText(actualText);
  if (!expected) return undefined;
  return {
    expectedCharacters: expected.length,
    actualCharacters: actual.length,
    charErrorRate: Number((levenshteinDistance(expected, actual) / expected.length).toFixed(4)),
  };
}

function levenshteinDistance(left, right) {
  const previous = new Array(right.length + 1);
  const current = new Array(right.length + 1);
  for (let column = 0; column <= right.length; column += 1) previous[column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + cost,
      );
    }
    for (let column = 0; column <= right.length; column += 1) previous[column] = current[column];
  }
  return previous[right.length] ?? 0;
}

function firstUsefulLine(value) {
  const lines = String(value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => /^version:/i.test(line)) ?? lines.find((line) => !/^ggml_/i.test(line)) ?? lines[0];
}

function tableText(value) {
  return preview(value, 90).replace(/\|/g, "\\|");
}

function safeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(value, label) {
  const text = nonEmptyString(value);
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function redactEnvForReport(env) {
  const redacted = {};
  for (const [key, value] of Object.entries(env ?? {})) {
    redacted[key] = /key|token|secret|password/i.test(key) ? "[redacted]" : value;
  }
  return redacted;
}

function resolvePath(path) {
  return resolve(cwd, path);
}

function pathForReport(path) {
  const relative = path.startsWith(cwd) ? path.slice(cwd.length + 1) : path;
  return relative || ".";
}

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
