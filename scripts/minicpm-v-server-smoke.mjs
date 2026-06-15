#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { createWriteStream } from "node:fs";
import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { arch, cpus, freemem, homedir, platform, release, totalmem } from "node:os";
import { deflateSync } from "node:zlib";

const DEFAULT_REPO = "openbmb/MiniCPM-V-4_5-gguf";
const DEFAULT_QUANT = "q4_k_m";
const HOME_DIR = homedir();
const DEFAULT_SERVER_CANDIDATES = [
  process.env.LLAMA_SERVER,
  join(HOME_DIR, "RCLI/deps/llama.cpp/build/bin/llama-server"),
  join(HOME_DIR, "llama.cpp/build/bin/llama-server"),
  "llama-server",
].filter(Boolean);

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write(`Usage: node scripts/minicpm-v-server-smoke.mjs [options]

Runs a MiniCPM-V visual-understanding smoke on macOS using llama.cpp llama-server.
Artifacts are written under test-results/minicpm-v/mac-server-smoke/ by default.

Options:
  --bin <path>                    llama-server path. Defaults to local known paths then PATH.
                                  LLAMA_SERVER can also provide the binary path.
  --repo <repo>                   Hugging Face GGUF repo. Default: ${DEFAULT_REPO}
  --quant <quant>                 GGUF quant selector for --hf-repo. Default: ${DEFAULT_QUANT}
  --image <path>                  Image to analyze. Default: generated tiny UI-card PNG.
  --prompt <text>                 Prompt to send to MiniCPM-V.
  --output-dir <path>             Artifact root. Default: test-results/minicpm-v/mac-server-smoke
  --host <host>                   Host passed to llama-server. Default: 127.0.0.1.
  --port <number>                 Port passed to llama-server. Default: free ephemeral port.
  --offline                       Use llama.cpp offline cache only; no network download.
  --dry-run                       Write request/preflight artifacts without starting the server.
  --startup-timeout-ms <number>   Timeout waiting for /health. Default: 900000.
  --request-timeout-ms <number>   Timeout for /v1/chat/completions. Default: 240000.
  --max-tokens <number>           Max completion tokens. Default: 1200.
`);
  process.exit(0);
}

const startedAt = new Date();
const outputRoot = resolve(args.outputDir ?? "test-results/minicpm-v/mac-server-smoke");
const runId = args.runId ?? startedAt.toISOString().replace(/[:.]/g, "-");
const runDir = join(outputRoot, runId);
const latestPath = join(outputRoot, "latest.json");
const requestPath = join(runDir, "request.json");
const responsePath = join(runDir, "response.json");
const serverLogPath = join(runDir, "server.log");
const stdoutPath = join(runDir, "server-stdout.txt");
const stderrPath = join(runDir, "server-stderr.txt");
const modelsPath = join(runDir, "models.json");
const fixturePath = join(runDir, "fixture-minicpm-ui-card.png");

await mkdir(runDir, { recursive: true });

const prompt =
  args.prompt ??
  [
    "Inspect this UI or game screenshot as evidence for Ambient Desktop visual QA.",
    "Return only valid JSON with keys summary, observations, and limitations.",
    "The summary must name the screen or activity if it is visually inferable.",
    "Each observation must have kind, description, confidence, and evidence.",
    "Use concrete evidence: quote exact visible labels when legible, or cite a specific region such as sidebar, top bar, canvas, modal, or bottom composer.",
    "Include at least one layout/affordance/defect/accessibility observation when the screenshot supports it.",
    "Do not use generic statements like 'UI elements are discernible' unless tied to a visible label or region.",
    "Use at most five concise observations so the JSON finishes before the token limit.",
  ].join(" ");

const binary = args.bin ? resolve(args.bin) : await findBinary(DEFAULT_SERVER_CANDIDATES);
const host = args.host ?? "127.0.0.1";
const port = Number(args.port ?? (await findFreePort(host)));
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
const baseUrl = `http://${host}:${port}`;
const responseSchema = visualResponseSchema();
const maxTokens = Number(args.maxTokens ?? 1200);
const requestBody = await buildChatCompletionBody({ imagePath, prompt, hfRepo, schema: responseSchema, maxTokens });
const redactedRequestBody = redactRequestBody(requestBody, imageMetadata);
const command = binary
  ? [
      binary,
      "-hf",
      hfRepo,
      "--host",
      host,
      "--port",
      String(port),
      "-c",
      "4096",
      "-ngl",
      "99",
      "--reasoning",
      "off",
      "--chat-template",
      "chatml",
      "--log-file",
      serverLogPath,
      ...(args.offline ? ["--offline"] : []),
    ]
  : [];

const request = {
  runId,
  startedAt: startedAt.toISOString(),
  mode: args.dryRun ? "dry-run" : "live",
  provider: "MiniCPM-V",
  runtime: "llama.cpp llama-server",
  endpoint: "/v1/chat/completions",
  baseUrl,
  healthUrl: `${baseUrl}/health`,
  modelsUrl: `${baseUrl}/v1/models`,
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
  maxTokens,
  responseSchema,
  requestBody: redactedRequestBody,
  commandPreview: redactCommand(command),
  hostFacts,
  artifactPaths: {
    request: requestPath,
    response: responsePath,
    models: modelsPath,
    serverLog: serverLogPath,
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
    message: "llama-server was not found. Build current llama.cpp with target llama-server or pass --bin.",
  });
}

if (args.dryRun) {
  await finish({
    status: "dry-run",
    message: "Preflight artifacts were written without starting llama-server.",
  });
}

let child;
let stdoutStream;
let stderrStream;
let streamsClosed = false;
try {
  const serverStartedAt = Date.now();
  ({ child, stdoutStream, stderrStream } = startServer({ command, cwd: runDir, stdoutPath, stderrPath }));
  const health = await waitForHealth({
    url: `${baseUrl}/health`,
    child,
    timeoutMs: Number(args.startupTimeoutMs ?? 900_000),
  });
  const readyAt = Date.now();
  const modelsResult = await fetchJsonWithTimeout(`${baseUrl}/v1/models`, {
    method: "GET",
    timeoutMs: 30_000,
  });
  await writeJson(modelsPath, modelsResult);

  const multimodal = modelsResult.ok && modelsSupportsCapability(modelsResult.body, "multimodal");
  if (!multimodal) {
    await writeResponseAndFinish({
      runId,
      status: "failed",
      errorCategory: "server-missing-multimodal-capability",
      error: "llama-server became healthy but /v1/models did not report multimodal capability.",
      serverStartupMs: readyAt - serverStartedAt,
      health,
      modelsResult,
    });
  }

  const requestStartedAt = Date.now();
  const chatResult = await fetchJsonWithTimeout(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer no-key" },
    body: JSON.stringify(requestBody),
    timeoutMs: Number(args.requestTimeoutMs ?? 240_000),
  });
  const requestFinishedAt = Date.now();
  const content = extractAssistantContent(chatResult.body);
  const parsedOutput = parseJsonObject(content);
  const validation = parsedOutput.ok ? validateVisualOutput(parsedOutput.value) : { valid: false, errors: [parsedOutput.error] };
  const status = chatResult.ok && validation.valid ? "passed" : "failed";
  const failure = classifyFailure({
    status,
    chatResult,
    content,
    validation,
    logs: `${await readTextIfExists(stderrPath)}\n${await readTextIfExists(serverLogPath)}`,
  });

  await writeResponseAndFinish({
    runId,
    status,
    errorCategory: failure.errorCategory,
    error: failure.error,
    serverStartupMs: readyAt - serverStartedAt,
    requestLatencyMs: requestFinishedAt - requestStartedAt,
    health,
    modelsResult,
    chatResult: redactChatResult(chatResult),
    assistantContent: content,
    parsedOutput: parsedOutput.ok ? parsedOutput.value : undefined,
    schemaValidation: validation,
    outputLooksUseful: outputLooksUseful(content),
  });
} catch (error) {
  await cleanupServer();
  const logs = `${await readTextIfExists(stderrPath)}\n${await readTextIfExists(serverLogPath)}`;
  const failure = classifyStartupFailure(error, logs);
  await writeResponseAndFinish({
    runId,
    status: "failed",
    errorCategory: failure.errorCategory,
    error: failure.error,
    outputLooksUseful: false,
  });
} finally {
  await cleanupServer();
}

async function writeResponseAndFinish(responsePatch) {
  await cleanupServer();
  const stdout = await readTextIfExists(stdoutPath);
  const stderr = await readTextIfExists(stderrPath);
  const serverLog = await readTextIfExists(serverLogPath);
  const response = {
    ...responsePatch,
    stdoutPreview: preview(stdout, 6000),
    stderrPreview: preview(stderr, 6000),
    serverLogPreview: preview(serverLog, 6000),
  };
  await writeJson(responsePath, response);
  response.artifactSizes = await artifactSizes([requestPath, responsePath, modelsPath, serverLogPath, stdoutPath, stderrPath, imagePath]);
  await writeJson(responsePath, response);
  await finish({
    status: response.status,
    errorCategory: response.errorCategory,
    message:
      response.status === "passed"
        ? "MiniCPM-V returned valid structured visual JSON through llama-server /v1/chat/completions."
        : "MiniCPM-V server smoke did not complete successfully; inspect response/runtime artifacts.",
    serverStartupMs: response.serverStartupMs,
    requestLatencyMs: response.requestLatencyMs,
    outputLooksUseful: response.outputLooksUseful,
  });
}

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
    modelsPath,
    serverLogPath,
    stdoutPath,
    stderrPath,
    imagePath,
    provider: "MiniCPM-V",
    runtime: "llama.cpp llama-server",
    endpoint: "/v1/chat/completions",
    baseUrl,
    hfRepo,
    hostFacts,
  };
  await writeJson(latestPath, summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(summary.status === "passed" || summary.status === "dry-run" ? 0 : 1);
}

async function cleanupServer() {
  await stopServer(child);
  child = undefined;
  if (streamsClosed) return;
  stdoutStream?.end();
  stderrStream?.end();
  if (stdoutStream && stderrStream) await Promise.all([finished(stdoutStream), finished(stderrStream)]);
  streamsClosed = true;
}

function startServer({ command, cwd, stdoutPath, stderrPath }) {
  const child = spawn(command[0], command.slice(1), {
    cwd,
    env: { ...process.env, LLAMA_LOG_COLORS: "off" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdoutStream = createWriteStream(stdoutPath);
  const stderrStream = createWriteStream(stderrPath);
  child.stdout.on("data", (chunk) => stdoutStream.write(chunk));
  child.stderr.on("data", (chunk) => stderrStream.write(chunk));
  return { child, stdoutStream, stderrStream };
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveStop) => child.once("close", resolveStop)),
    sleep(5000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

async function waitForHealth({ url, child, timeoutMs }) {
  const started = Date.now();
  let lastHealth;
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`llama-server exited before health became ready with code ${child.exitCode}.`);
    }
    try {
      lastHealth = await fetchJsonWithTimeout(url, { method: "GET", timeoutMs: 5000 });
      if (lastHealth.statusCode === 200 && lastHealth.body?.status === "ok") return lastHealth;
    } catch (error) {
      lastHealth = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    await sleep(1000);
  }
  const details = lastHealth ? ` Last health result: ${JSON.stringify(lastHealth).slice(0, 1000)}` : "";
  throw new Error(`llama-server did not become healthy within ${timeoutMs} ms.${details}`);
}

async function fetchJsonWithTimeout(url, { method, headers, body, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedFetch = Date.now();
  try {
    const response = await fetch(url, { method, headers, body, signal: controller.signal });
    const text = await response.text();
    return {
      ok: response.ok,
      statusCode: response.status,
      statusText: response.statusText,
      latencyMs: Date.now() - startedFetch,
      body: parseJsonLenient(text),
      textPreview: preview(text, 6000),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function buildChatCompletionBody({ imagePath, prompt, hfRepo, schema, maxTokens }) {
  const imageBytes = await readFile(imagePath);
  const imageDataUrl = `data:image/png;base64,${imageBytes.toString("base64")}`;
  return {
    model: hfRepo,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    max_tokens: maxTokens,
    temperature: 0.1,
    top_p: 0.8,
    top_k: 100,
    chat_template_kwargs: { enable_thinking: false },
    reasoning_format: "none",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "minicpm_visual_response",
        strict: true,
        schema,
      },
    },
  };
}

function visualResponseSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "observations", "limitations"],
    properties: {
      summary: { type: "string" },
      observations: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "description", "confidence", "evidence"],
          properties: {
            kind: {
              type: "string",
              enum: ["layout", "text", "affordance", "defect", "visual_quality", "accessibility", "gameplay", "uncertainty"],
            },
            description: { type: "string" },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            evidence: { type: "string" },
          },
        },
      },
      limitations: {
        type: "array",
        items: { type: "string" },
      },
    },
  };
}

function validateVisualOutput(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: ["Output is not a JSON object."] };
  }
  if (typeof value.summary !== "string" || !value.summary.trim()) errors.push("summary must be a non-empty string.");
  if (!Array.isArray(value.observations) || value.observations.length === 0) errors.push("observations must be a non-empty array.");
  if (Array.isArray(value.observations)) {
    value.observations.forEach((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`observations[${index}] must be an object.`);
        return;
      }
      if (!["layout", "text", "affordance", "defect", "visual_quality", "accessibility", "gameplay", "uncertainty"].includes(item.kind)) {
        errors.push(`observations[${index}].kind is invalid.`);
      }
      if (typeof item.description !== "string" || !item.description.trim()) errors.push(`observations[${index}].description must be a non-empty string.`);
      if (!["low", "medium", "high"].includes(item.confidence)) errors.push(`observations[${index}].confidence is invalid.`);
      if (typeof item.evidence !== "string" || !item.evidence.trim()) errors.push(`observations[${index}].evidence must be a non-empty string.`);
    });
  }
  if (!Array.isArray(value.limitations)) errors.push("limitations must be an array.");
  return { valid: errors.length === 0, errors };
}

function parseJsonObject(content) {
  if (!content || typeof content !== "string") return { ok: false, error: "Assistant content is empty." };
  try {
    const parsed = JSON.parse(content);
    return { ok: true, value: parsed };
  } catch (firstError) {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: `Assistant content is not JSON: ${firstError.message}` };
    try {
      return { ok: true, value: JSON.parse(match[0]) };
    } catch (secondError) {
      return { ok: false, error: `Could not parse JSON object from assistant content: ${secondError.message}` };
    }
  }
}

function parseJsonLenient(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractAssistantContent(body) {
  return body?.choices?.[0]?.message?.content ?? "";
}

function classifyFailure({ status, chatResult, content, validation, logs }) {
  if (status === "passed") return { errorCategory: undefined, error: undefined };
  if (/failed to fit params to free device memory|cannot meet free memory target|out of memory|not enough.*memory/i.test(logs)) {
    return {
      errorCategory: "insufficient-device-memory",
      error: "The runtime could not fit the requested model/context into available device memory.",
    };
  }
  if (/unknown projector type/i.test(logs)) {
    return {
      errorCategory: "unsupported-mmproj-projector",
      error: "The runtime loaded the text model but could not load the multimodal projector type.",
    };
  }
  if (/failed to load vision model|mtmd_init_from_file/i.test(logs)) {
    return {
      errorCategory: "vision-model-load-failed",
      error: "The runtime could not initialize the MiniCPM-V vision projector.",
    };
  }
  if (chatResult && !chatResult.ok) {
    return {
      errorCategory: "chat-completion-http-failed",
      error: `Chat completion returned HTTP ${chatResult.statusCode}: ${chatResult.textPreview}`,
    };
  }
  if (!content) {
    return { errorCategory: "empty-assistant-content", error: "Chat completion succeeded but returned empty assistant content." };
  }
  if (validation && !validation.valid) {
    return { errorCategory: "structured-output-invalid", error: validation.errors.join(" ") };
  }
  return { errorCategory: "server-smoke-failed", error: "MiniCPM-V server smoke failed." };
}

function classifyStartupFailure(error, logs) {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fit params to free device memory|cannot meet free memory target|out of memory|not enough.*memory/i.test(logs)) {
    return {
      errorCategory: "insufficient-device-memory",
      error: "The runtime could not fit the requested model/context into available device memory.",
    };
  }
  if (/unknown projector type/i.test(logs)) {
    return {
      errorCategory: "unsupported-mmproj-projector",
      error: "The runtime loaded the text model but could not load the multimodal projector type.",
    };
  }
  if (/failed to load vision model|mtmd_init_from_file/i.test(logs)) {
    return {
      errorCategory: "vision-model-load-failed",
      error: "The runtime could not initialize the MiniCPM-V vision projector.",
    };
  }
  if (/required file is not available in cache|download failed|failed to read connection/i.test(logs)) {
    return {
      errorCategory: "model-download-failed",
      error: "The runtime could not complete model or projector download.",
    };
  }
  if (/did not become healthy/i.test(message)) {
    return { errorCategory: "server-start-timeout", error: message };
  }
  if (/exited before health/i.test(message)) {
    return { errorCategory: "server-exited-before-health", error: message };
  }
  return { errorCategory: "server-startup-failed", error: message };
}

function modelsSupportsCapability(body, capability) {
  const entries = [...(Array.isArray(body?.data) ? body.data : []), ...(Array.isArray(body?.models) ? body.models : [])];
  return entries.some((entry) => Array.isArray(entry.capabilities) && entry.capabilities.includes(capability));
}

function outputLooksUseful(content) {
  const normalized = content.toLowerCase();
  return normalized.length > 80 && ["warning", "button", "layout", "ambient", "visual", "image", "text"].some((word) => normalized.includes(word));
}

function redactRequestBody(body, imageMetadata) {
  const cloned = JSON.parse(JSON.stringify(body));
  const imageUrl = cloned.messages?.[0]?.content?.find((part) => part.type === "image_url")?.image_url;
  if (imageUrl?.url) imageUrl.url = `data:image/png;base64,<redacted sha256:${imageMetadata.sha256} bytes:${imageMetadata.bytes}>`;
  return cloned;
}

function redactChatResult(result) {
  if (!result) return result;
  return {
    ok: result.ok,
    statusCode: result.statusCode,
    statusText: result.statusText,
    latencyMs: result.latencyMs,
    body: result.body,
    textPreview: result.textPreview,
  };
}

function redactCommand(command) {
  return command.map((part) => (part === process.env.HF_TOKEN ? "<redacted HF_TOKEN>" : part));
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

async function findFreePort(host) {
  return await new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (port) resolvePort(port);
        else rejectPort(new Error("Could not allocate a free port."));
      });
    });
  });
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

function preview(value, limit) {
  if (!value) return "";
  return value.length > limit ? `${value.slice(0, limit)}\n...[truncated ${value.length - limit} chars]` : value;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
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
