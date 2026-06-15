#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { arch, cpus, freemem, homedir, platform, release, totalmem } from "node:os";
import { deflateSync } from "node:zlib";

const DEFAULT_REPO = "openbmb/MiniCPM-V-4_5-gguf";
const DEFAULT_QUANT = "q4_k_m";
const HOME_DIR = homedir();
const DEFAULT_BIN_CANDIDATES = [
  process.env.LLAMA_MTMD_CLI,
  join(HOME_DIR, "RCLI/deps/llama.cpp/build/bin/llama-mtmd-cli"),
  join(HOME_DIR, "llama.cpp/build/bin/llama-mtmd-cli"),
  "llama-mtmd-cli",
].filter(Boolean);

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write(`Usage: node scripts/minicpm-v-mac-smoke.mjs [options]

Runs a MiniCPM-V visual-understanding smoke on macOS using llama.cpp llama-mtmd-cli.
Artifacts are written under test-results/minicpm-v/mac-smoke/ by default.

Options:
  --bin <path>              llama-mtmd-cli path. Defaults to local known paths then PATH.
                            LLAMA_MTMD_CLI can also provide the binary path.
  --repo <repo>             Hugging Face GGUF repo. Default: ${DEFAULT_REPO}
  --quant <quant>           GGUF quant selector for --hf-repo. Default: ${DEFAULT_QUANT}
  --image <path>            Image to analyze. Default: generated tiny UI-card PNG.
  --prompt <text>           Prompt to send to MiniCPM-V.
  --output-dir <path>       Artifact root. Default: test-results/minicpm-v/mac-smoke
  --offline                 Use llama.cpp offline cache only; no network download.
  --dry-run                 Write request/preflight artifacts without running the model.
  --timeout-ms <number>     Hard runtime timeout. Default: 900000.
  --idle-timeout-ms <num>   Runtime idle timeout after output starts. Default: 180000.
`);
  process.exit(0);
}

const startedAt = new Date();
const outputRoot = resolve(args.outputDir ?? "test-results/minicpm-v/mac-smoke");
const runId = args.runId ?? startedAt.toISOString().replace(/[:.]/g, "-");
const runDir = join(outputRoot, runId);
const latestPath = join(outputRoot, "latest.json");
const requestPath = join(runDir, "request.json");
const responsePath = join(runDir, "response.json");
const runtimeLogPath = join(runDir, "runtime.log");
const stdoutPath = join(runDir, "stdout.txt");
const stderrPath = join(runDir, "stderr.txt");
const fixturePath = join(runDir, "fixture-minicpm-ui-card.png");

await mkdir(runDir, { recursive: true });

const prompt =
  args.prompt ??
  [
    "You are checking whether a local visual-understanding provider can inspect UI/game screenshots for Ambient Desktop.",
    "Look at the image and return concise JSON with keys summary, observations, limitations.",
    "Mention visible text, layout, and at least one concrete UI issue if present.",
  ].join(" ");

const binary = args.bin ? resolve(args.bin) : await findBinary(DEFAULT_BIN_CANDIDATES);
const imagePath = args.image ? resolve(args.image) : fixturePath;
if (!args.image) await writeFixturePng(fixturePath);
const imageMetadata = await fileMetadata(imagePath);
const binaryMetadata = binary ? await fileMetadata(binary).catch(() => undefined) : undefined;
const version = binary ? await runVersion(binary).catch((error) => ({ error: error instanceof Error ? error.message : String(error) })) : undefined;
const hostFacts = {
  platform: platform(),
  release: release(),
  arch: arch(),
  cpuModel: cpus()[0]?.model,
  cpuCount: cpus().length,
  totalMemoryBytes: totalmem(),
  freeMemoryBytesAtStart: freemem(),
};
const hfRepo = `${args.repo ?? DEFAULT_REPO}:${args.quant ?? DEFAULT_QUANT}`;
const command = binary
  ? [
      binary,
      "-hf",
      hfRepo,
      "--image",
      imagePath,
      "-p",
      prompt,
      "-c",
      "4096",
      "-n",
      "512",
      "--temp",
      "0.2",
      "--top-p",
      "0.8",
      "--top-k",
      "100",
      "-ngl",
      "99",
      "--log-file",
      runtimeLogPath,
      ...(args.offline ? ["--offline"] : []),
    ]
  : [];

const request = {
  runId,
  startedAt: startedAt.toISOString(),
  mode: args.dryRun ? "dry-run" : "live",
  provider: "MiniCPM-V",
  runtime: "llama.cpp llama-mtmd-cli",
  hfRepo,
  repo: args.repo ?? DEFAULT_REPO,
  quant: args.quant ?? DEFAULT_QUANT,
  offline: Boolean(args.offline),
  binary,
  binaryMetadata,
  version,
  runtimeCwd: runDir,
  image: imageMetadata,
  prompt,
  commandPreview: redactCommand(command),
  hostFacts,
  artifactPaths: {
    request: requestPath,
    response: responsePath,
    runtimeLog: runtimeLogPath,
    stdout: stdoutPath,
    stderr: stderrPath,
    latest: latestPath,
  },
};
await writeJson(requestPath, request);

if (!binary) {
  await finish({
    status: "preflight-failed",
    errorCategory: "missing-runtime",
    message: "llama-mtmd-cli was not found. Build current llama.cpp with target llama-mtmd-cli or pass --bin.",
  });
}

if (args.dryRun) {
  await finish({
    status: "dry-run",
    message: "Preflight artifacts were written without invoking the runtime.",
  });
}

const runtimeStartedAt = Date.now();
const runResult = await runRuntime({
  command,
  cwd: runDir,
  stdoutPath,
  stderrPath,
  timeoutMs: Number(args.timeoutMs ?? 900_000),
  idleTimeoutMs: Number(args.idleTimeoutMs ?? 180_000),
});
const runtimeFinishedAt = Date.now();
const stdout = await readTextIfExists(stdoutPath);
const stderr = await readTextIfExists(stderrPath);
const runtimeLog = await readTextIfExists(runtimeLogPath);
const failure = classifyFailure(runResult, `${stderr}\n${runtimeLog}`);
const response = {
  runId,
  status: runResult.status,
  exitCode: runResult.exitCode,
  signal: runResult.signal,
  errorCategory: failure.errorCategory,
  error: failure.error,
  startedAt: new Date(runtimeStartedAt).toISOString(),
  finishedAt: new Date(runtimeFinishedAt).toISOString(),
  latencyMs: runtimeFinishedAt - runtimeStartedAt,
  stdoutPreview: preview(stdout, 6000),
  stderrPreview: preview(stderr, 6000),
  runtimeLogPreview: preview(runtimeLog, 6000),
  outputLooksUseful: outputLooksUseful(stdout),
};
await writeJson(responsePath, response);
response.artifactSizes = await artifactSizes([requestPath, responsePath, runtimeLogPath, stdoutPath, stderrPath, imagePath]);
await writeJson(responsePath, response);
await finish({
  status: response.status,
  errorCategory: response.errorCategory,
  message:
    response.status === "passed"
      ? "MiniCPM-V returned a non-empty visual response for the UI fixture."
      : "MiniCPM-V smoke did not complete successfully; inspect response/runtime artifacts.",
  latencyMs: response.latencyMs,
  outputLooksUseful: response.outputLooksUseful,
});

async function finish(summaryPatch) {
  const finishedAt = new Date();
  const summary = {
    runId,
    ...summaryPatch,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    outputRoot,
    runDir,
    requestPath,
    responsePath,
    runtimeLogPath,
    stdoutPath,
    stderrPath,
    imagePath,
    provider: "MiniCPM-V",
    runtime: "llama.cpp llama-mtmd-cli",
    hfRepo,
    hostFacts,
  };
  await writeJson(latestPath, summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(summary.status === "passed" || summary.status === "dry-run" ? 0 : 1);
}

async function runRuntime({ command, cwd, stdoutPath, stderrPath, timeoutMs, idleTimeoutMs }) {
  await mkdir(dirname(stdoutPath), { recursive: true });
  const child = spawn(command[0], command.slice(1), {
    cwd,
    env: { ...process.env, LLAMA_LOG_COLORS: "off" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdoutStream = createWriteStream(stdoutPath);
  const stderrStream = createWriteStream(stderrPath);
  let outputSeen = false;
  let timedOut = false;
  let idleTimedOut = false;
  let lastOutputAt = Date.now();
  const hardTimer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, timeoutMs);
  const idleTimer = setInterval(() => {
    if (!outputSeen) return;
    if (Date.now() - lastOutputAt > idleTimeoutMs) {
      idleTimedOut = true;
      child.kill("SIGTERM");
    }
  }, Math.min(10_000, Math.max(1000, Math.floor(idleTimeoutMs / 6))));
  child.stdout.on("data", (chunk) => {
    outputSeen = true;
    lastOutputAt = Date.now();
    stdoutStream.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    outputSeen = true;
    lastOutputAt = Date.now();
    stderrStream.write(chunk);
  });
  const result = await new Promise((resolveResult) => {
    child.on("error", (error) => {
      resolveResult({ status: "failed", errorCategory: "runtime-spawn-failed", error: error.message });
    });
    child.on("close", (exitCode, signal) => {
      if (timedOut) {
        resolveResult({ status: "failed", exitCode, signal, errorCategory: "runtime-hard-timeout", error: `Runtime exceeded ${timeoutMs} ms.` });
      } else if (idleTimedOut) {
        resolveResult({ status: "failed", exitCode, signal, errorCategory: "runtime-idle-timeout", error: `Runtime produced no output for ${idleTimeoutMs} ms.` });
      } else if (exitCode === 0) {
        resolveResult({ status: "passed", exitCode, signal });
      } else {
        resolveResult({ status: "failed", exitCode, signal, errorCategory: "runtime-exit-nonzero", error: `Runtime exited with code ${exitCode}.` });
      }
    });
  });
  clearTimeout(hardTimer);
  clearInterval(idleTimer);
  stdoutStream.end();
  stderrStream.end();
  await Promise.all([finished(stdoutStream), finished(stderrStream)]);
  return result;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--offline") parsed.offline = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      parsed[key] = value;
      index += 1;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return parsed;
}

async function findBinary(candidates) {
  for (const candidate of candidates) {
    const resolved = candidate.includes("/") ? candidate : await which(candidate);
    if (!resolved) continue;
    try {
      await access(resolved);
      return resolved;
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

async function which(commandName) {
  const paths = (process.env.PATH ?? "").split(":").filter(Boolean);
  for (const dir of paths) {
    const candidate = join(dir, commandName);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next PATH entry.
    }
  }
  return undefined;
}

async function runVersion(binary) {
  const child = spawn(binary, ["--version"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, LLAMA_LOG_COLORS: "off" } });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  await new Promise((resolveChild) => child.on("close", resolveChild));
  return { stdout: preview(stdout, 1200), stderr: preview(stderr, 1200) };
}

async function fileMetadata(path) {
  const info = await stat(path);
  const bytes = await readFile(path);
  return {
    path,
    bytes: info.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function artifactSizes(paths) {
  const result = {};
  for (const path of paths) {
    try {
      result[path] = (await stat(path)).size;
    } catch {
      result[path] = 0;
    }
  }
  return result;
}

function redactCommand(command) {
  return command.map((part) => (part === process.env.HF_TOKEN ? "<redacted HF_TOKEN>" : part));
}

function preview(value, limit) {
  if (!value) return "";
  return value.length > limit ? `${value.slice(0, limit)}\n...[truncated ${value.length - limit} chars]` : value;
}

function outputLooksUseful(stdout) {
  const normalized = stdout.toLowerCase();
  return normalized.length > 80 && ["warning", "button", "layout", "ambient", "visual", "image", "text"].some((word) => normalized.includes(word));
}

function classifyFailure(runResult, combinedOutput) {
  if (runResult.status === "passed") return { errorCategory: undefined, error: undefined };
  if (/unknown projector type/i.test(combinedOutput)) {
    return {
      errorCategory: "unsupported-mmproj-projector",
      error: "The runtime loaded the text model but could not load the multimodal projector type.",
    };
  }
  if (/failed to load vision model|mtmd_init_from_file/i.test(combinedOutput)) {
    return {
      errorCategory: "vision-model-load-failed",
      error: "The runtime could not initialize the MiniCPM-V vision projector.",
    };
  }
  if (/download failed|failed to read connection/i.test(combinedOutput)) {
    return {
      errorCategory: "model-download-failed",
      error: "The runtime could not complete model or projector download.",
    };
  }
  return { errorCategory: runResult.errorCategory, error: runResult.error };
}

async function readTextIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function finished(stream) {
  return new Promise((resolveFinished) => stream.on("finish", resolveFinished));
}

async function writeFixturePng(path) {
  await mkdir(dirname(path), { recursive: true });
  const width = 640;
  const height = 360;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    rows[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * 4;
      const color = pixelColor(x, y);
      rows[offset] = color[0];
      rows[offset + 1] = color[1];
      rows[offset + 2] = color[2];
      rows[offset + 3] = 255;
    }
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", Buffer.concat([uint32(width), uint32(height), Buffer.from([8, 6, 0, 0, 0])])),
    pngChunk("IDAT", deflateSync(rows, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  await writeFile(path, png);
  const svgPath = resolve("fixtures/visual-understanding/minicpm-ui-card.svg");
  try {
    await copyFile(svgPath, join(dirname(path), "fixture-source-minicpm-ui-card.svg"));
  } catch {
    // The PNG is self-contained; source SVG copy is only artifact context.
  }
}

function pixelColor(x, y) {
  if (insideCircle(x, y, 72, 63, 9)) return [255, 107, 107];
  if (insideCircle(x, y, 102, 63, 9)) return [255, 209, 102];
  if (insideCircle(x, y, 132, 63, 9)) return [76, 195, 138];
  if (textStripe(x, y)) return [72, 58, 29];
  if (y >= 34 && y < 92 && x >= 36 && x < 604) return [38, 51, 71];
  if (insideRoundedRect(x, y, 72, 124, 214, 154, 10)) return [220, 232, 255];
  if (insideRoundedRect(x, y, 96, 148, 166, 18, 9)) return [110, 143, 212];
  if (insideRoundedRect(x, y, 96, 186, 118, 14, 7)) return [152, 178, 234];
  if (insideRoundedRect(x, y, 96, 216, 144, 14, 7)) return [152, 178, 234];
  if (insideRoundedRect(x, y, 96, 246, 92, 14, 7)) return [152, 178, 234];
  if (insideRoundedRect(x, y, 330, 124, 238, 154, 10)) return [255, 242, 204];
  if (insideRoundedRect(x, y, 358, 226, 152, 34, 8)) return [47, 111, 237];
  if (insideRoundedRect(x, y, 72, 294, 132, 18, 9)) return [207, 216, 232];
  if (insideRoundedRect(x, y, 222, 294, 94, 18, 9)) return [207, 216, 232];
  if (insideRoundedRect(x, y, 334, 294, 168, 18, 9)) return [207, 216, 232];
  if (insideRoundedRect(x, y, 36, 34, 568, 292, 18)) return [255, 255, 255];
  return [245, 247, 251];
}

function textStripe(x, y) {
  const header = y >= 54 && y <= 70 && x >= 180 && x <= 430 && (x + y) % 9 < 5;
  const warning = y >= 150 && y <= 203 && x >= 358 && x <= 520 && (x * 2 + y) % 13 < 6;
  const button = y >= 238 && y <= 250 && x >= 376 && x <= 492 && (x + y * 3) % 11 < 6;
  return header || warning || button;
}

function insideCircle(x, y, cx, cy, radius) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function insideRoundedRect(x, y, rx, ry, rw, rh, radius) {
  if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) return false;
  const innerX = x >= rx + radius && x < rx + rw - radius;
  const innerY = y >= ry + radius && y < ry + rh - radius;
  if (innerX || innerY) return true;
  const cx = x < rx + radius ? rx + radius : rx + rw - radius - 1;
  const cy = y < ry + radius ? ry + radius : ry + rh - radius - 1;
  return insideCircle(x, y, cx, cy, radius);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuffer, data]);
  return Buffer.concat([uint32(data.length), typeBuffer, data, uint32(crc32(crcInput))]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
