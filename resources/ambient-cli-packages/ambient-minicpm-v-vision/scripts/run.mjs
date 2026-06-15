#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { arch, homedir, platform } from "node:os";

const providerId = "minicpm-v-4.5-llamacpp";
const defaultModel = "openbmb/MiniCPM-V-4_5-gguf:q4_k_m";
const defaultExperimentalModel = "openbmb/MiniCPM-V-4.6-gguf:q4_k_m";
const defaultHost = "127.0.0.1";
const defaultPort = 39217;
const defaultContextTokens = 8192;
const maxImageBytes = 15 * 1024 * 1024;
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const remoteEndpointReviewChecklist = "allowed hosts, user consent, media privacy, secret handling, request redaction, artifact retention, network egress controls, and UI copy";

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  switch (options.command) {
    case "status":
      writeJson(await statusPayload(options));
      return;
    case "verify-runtime-manifest":
      writeJson(verifyRuntimeManifest(options));
      return;
    case "start":
      writeJson(await startServer(options));
      return;
    case "stop":
      writeJson(await stopServerCommand(options));
      return;
    case "analyze":
      writeJson(await analyzeImage(options));
      return;
    default:
      throw new Error(`Unknown command: ${options.command}`);
  }
}

async function statusPayload(options = {}) {
  const binary = resolveRuntimeBinary();
  const state = readState(options);
  const stateStopped = isStoppedState(state);
  const endpointOverride = localEndpointOverride(options);
  const endpoint = endpointFromOptions(options, state);
  const version = binary.command ? runtimeVersion(binary.command) : undefined;
  const serverRunning = state?.pid && !stateStopped ? processAlive(state.pid) : false;
  const shouldProbeEndpoint = Boolean(endpointOverride || (!stateStopped && state?.endpoint) || serverRunning);
  const health = shouldProbeEndpoint && (endpointOverride || binary.available)
    ? await fetchJson(`${endpoint}/health`, { timeoutMs: 1500 }).catch((error) => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }))
    : { ok: false, error: binary.reason };
  const models = health.ok
    ? await fetchJson(`${endpoint}/v1/models`, { timeoutMs: 2000 }).catch((error) => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }))
    : undefined;
  return {
    providerId,
    available: endpointOverride ? Boolean(health.ok && models?.ok) : Boolean(binary.available && health.ok),
    status: health.ok && (!endpointOverride || models?.ok) ? "ready" : serverRunning ? "starting_or_unhealthy" : "not_running",
    reason: statusReason({ binary, health, models, serverRunning, endpointOverride: Boolean(endpointOverride) }),
    runtime: {
      binary: binary.command,
      binaryAvailable: binary.available,
      version,
      defaultModel: modelRef(options),
      experimentalModel: experimentalModelRef(),
      contextTokens: numericOption(options.context, "context", defaultContextTokens),
      gpuLayers: numericOption(options.gpuLayers, "gpu-layers", 99),
    },
    endpoint,
    endpointMode: endpointOverride ? "existing-local-endpoint" : "managed-local-server",
    server: {
      pid: state?.pid,
      previousPid: state?.previousPid,
      running: serverRunning,
      host: state?.host ?? hostOption(options),
      port: state?.port ?? portOption(options),
      startedAt: state?.startedAt,
      stoppedAt: state?.stoppedAt,
      logPath: state?.logPath,
      stderrPath: state?.stderrPath,
    },
    health,
    models,
    inputPolicy: inputPolicy(),
    installPlan: installPlan(),
    runtimeContract: runtimeContract({ binary, endpoint, endpointOverride: Boolean(endpointOverride), health, models, version }),
    missingHints: missingHints({ binary, health, models, serverRunning, endpointOverride: Boolean(endpointOverride) }),
  };
}

async function startServer(options) {
  const binary = resolveRuntimeBinary();
  if (!binary.available || !binary.command) throw new Error(binary.reason);
  const host = hostOption(options);
  if (!isLocalHost(host)) throw new Error("MiniCPM-V local daemon may only bind to localhost by default.");
  const stateDir = stateDirPath(options);
  mkdirSync(stateDir, { recursive: true });
  const waitMs = numericOption(options.waitMs, "wait-ms", 0);
  return withStateLock(stateDir, Math.max(120_000, waitMs + 60_000), () => startServerLocked({ options, binary, host, stateDir, waitMs }));
}

async function startServerLocked({ options, binary, host, stateDir, waitMs }) {
  const state = readState(options);
  const stateStopped = isStoppedState(state);
  const port = state?.port ?? (hasExplicitPortOption(options) ? portOption(options) : await findAvailablePort(host));
  const endpoint = `http://${host}:${port}`;

  const startedAt = new Date().toISOString();
  const logPath = join(stateDir, "llama-server.log");
  const stdoutPath = join(stateDir, "llama-server.stdout.log");
  const stderrPath = join(stateDir, "llama-server.stderr.log");
  const args = llamaServerArgs({ options, host, port, logPath });
  const desiredCommand = [binary.command, ...args];
  if (state?.pid && !stateStopped && processAlive(state.pid)) {
    if (sameCommand(state.command, desiredCommand)) {
      return { providerId, status: "already_running", endpoint, server: state, current: await statusPayload(options) };
    }
    terminateProcess(state.pid);
    await sleep(1500);
    if (processAlive(state.pid)) {
      try {
        process.kill(state.pid, "SIGKILL");
      } catch {
        // Process may have exited between checks.
      }
    }
    clearState(options);
  }
  const repairs = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const stdoutFd = openAppend(stdoutPath);
    const stderrFd = openAppend(stderrPath);
    const child = spawn(binary.command, args, {
      cwd: stateDir,
      detached: true,
      stdio: ["ignore", stdoutFd, stderrFd],
      env: { ...process.env, LLAMA_LOG_COLORS: "off" },
    });
    child.unref();
    const nextState = {
      pid: child.pid,
      endpoint,
      host,
      port,
      model: modelRef(options),
      startedAt,
      logPath,
      stdoutPath,
      stderrPath,
      command: desiredCommand,
    };
    writeState(options, nextState);
    const health = waitMs > 0 ? await waitForHealthWhileProcessRuns(endpoint, waitMs, child.pid) : undefined;
    if (processAlive(child.pid)) {
      return { providerId, status: health?.ok ? "ready" : "started", endpoint, server: nextState, health, ...(repairs.length ? { repairs } : {}) };
    }
    clearState(options);
    if (attempt === 0) {
      const repair = repairCorruptModelCache(stderrPath);
      if (repair.repaired) {
        repairs.push(repair);
        continue;
      }
    }
    const detail = stderrTail(stderrPath);
    throw new Error(
      `MiniCPM-V llama-server exited before the managed endpoint became usable. Check ${stderrPath} for bind/runtime errors.${
        detail ? ` Recent stderr: ${detail}` : ""
      }`,
    );
  }
  throw new Error("MiniCPM-V llama-server exited before startup completed.");
}

async function stopServerCommand(options) {
  const state = readState(options);
  if (!state?.pid) return { providerId, status: "not_running", reason: "No MiniCPM-V daemon state file exists." };
  if (isStoppedState(state)) {
    const previousPid = state.previousPid ?? state.pid;
    const stoppedAt = state.stoppedAt ?? new Date().toISOString();
    writeState(options, { ...state, status: "stopped", previousPid, stoppedAt });
    return { providerId, status: "not_running", reason: "Saved MiniCPM-V process is already stopped.", previousPid, endpoint: state.endpoint, stoppedAt };
  }
  if (!processAlive(state.pid)) {
    const stoppedAt = new Date().toISOString();
    writeState(options, { ...state, status: "stopped", previousPid: state.pid, stoppedAt });
    return { providerId, status: "not_running", reason: "Saved MiniCPM-V process is no longer running.", previousPid: state.pid, endpoint: state.endpoint, stoppedAt };
  }
  process.kill(state.pid, "SIGTERM");
  await sleep(1500);
  if (processAlive(state.pid)) {
    try {
      process.kill(state.pid, "SIGKILL");
    } catch {
      // Process may have exited between checks.
    }
  }
  const stoppedAt = new Date().toISOString();
  writeState(options, { ...state, status: "stopped", previousPid: state.pid, stoppedAt });
  return { providerId, status: "stopped", previousPid: state.pid, endpoint: state.endpoint, stoppedAt };
}

function isStoppedState(state) {
  return state?.status === "stopped";
}

function sameCommand(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function terminateProcess(pid) {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // The saved process may have exited between processAlive and kill.
  }
}

async function analyzeImage(options) {
  const images = imageInputs(options).map((input) => imageMetadata(input));
  const image = images[0];
  const outputJson = resolve(required(options.outputJson, "--output-json"));
  const fake = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
  if (fake !== undefined) {
    const parsedOutput = fakeVisualOutput(fake, image);
    const payload = analysisPayload({
      image,
      images,
      outputJson,
      endpoint: "fake",
      model: modelRef(options),
      prompt: promptText(options),
      parsedOutput,
      rawResponse: { mode: "fake" },
      validation: validateVisualOutput(parsedOutput),
      latencyMs: 0,
    });
    writeOutputJson(outputJson, payload.full);
    return payload.preview;
  }

  const state = readState(options);
  const endpoint = endpointFromOptions(options, state);
  const requestOptions = { images, prompt: promptText(options), model: modelRef(options), maxTokens: numericOption(options.maxTokens, "max-tokens", 1200) };
  let requestBody = buildChatCompletionBody(requestOptions);
  const startedAt = Date.now();
  let chatResult = await fetchJson(`${endpoint}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer no-key" },
    body: JSON.stringify(requestBody.body),
    timeoutMs: numericOption(options.requestTimeoutMs, "request-timeout-ms", 240000),
  });
  let fallbackReason;
  if (!chatResult.ok && isSamplerInitializationError(chatResult)) {
    fallbackReason = "llama-server rejected strict JSON schema sampler initialization; retried with prompt-only JSON validation.";
    requestBody = buildChatCompletionBody({ ...requestOptions, strictJsonSchema: false });
    chatResult = await fetchJson(`${endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer no-key" },
      body: JSON.stringify(requestBody.body),
      timeoutMs: numericOption(options.requestTimeoutMs, "request-timeout-ms", 240000),
    });
  }
  if (!chatResult.ok) throw new Error(`MiniCPM-V endpoint returned HTTP ${chatResult.statusCode}: ${chatResult.textPreview}`);
  let assistantContent = chatResult.body?.choices?.[0]?.message?.content ?? "";
  let parsedOutput = parseJsonObject(assistantContent);
  let validation = parsedOutput.ok ? validateVisualOutput(parsedOutput.value) : { valid: false, errors: [parsedOutput.error] };
  if (!parsedOutput.ok || !validation.valid) {
    const invalidReason = parsedOutput.ok ? `MiniCPM-V returned invalid visual JSON: ${validation.errors.join(" ")}` : parsedOutput.error;
    fallbackReason = fallbackReason
      ? `${fallbackReason} Also retried after invalid structured visual output: ${invalidReason}`
      : `Retried after invalid structured visual output: ${invalidReason}`;
    requestBody = buildChatCompletionBody({
      ...requestOptions,
      prompt: invalidJsonRetryPrompt(requestOptions.prompt, invalidReason),
      strictJsonSchema: false,
    });
    chatResult = await fetchJson(`${endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer no-key" },
      body: JSON.stringify(requestBody.body),
      timeoutMs: numericOption(options.requestTimeoutMs, "request-timeout-ms", 240000),
    });
    if (chatResult.ok) {
      assistantContent = chatResult.body?.choices?.[0]?.message?.content ?? "";
      parsedOutput = parseJsonObject(assistantContent);
      validation = parsedOutput.ok ? validateVisualOutput(parsedOutput.value) : { valid: false, errors: [parsedOutput.error] };
    }
  }
  if (!chatResult.ok) throw new Error(`MiniCPM-V endpoint returned HTTP ${chatResult.statusCode}: ${chatResult.textPreview}`);
  if (!parsedOutput.ok || !validation.valid) {
    const invalidReason = parsedOutput.ok ? `MiniCPM-V returned invalid visual JSON after retry: ${validation.errors.join(" ")}` : parsedOutput.error;
    fallbackReason = fallbackReason
      ? `${fallbackReason} Fallback uncertainty output used after retry failed: ${invalidReason}`
      : `Fallback uncertainty output used after invalid structured visual output: ${invalidReason}`;
    parsedOutput = { ok: true, value: invalidJsonFallbackVisualOutput(image, invalidReason) };
    validation = validateVisualOutput(parsedOutput.value);
  }
  const latencyMs = Date.now() - startedAt;
  const payload = analysisPayload({
    image,
    images,
    outputJson,
    endpoint,
    model: modelRef(options),
    prompt: promptText(options),
    request: fallbackReason ? { ...requestBody.redacted, strictJsonSchemaFallback: fallbackReason } : requestBody.redacted,
    parsedOutput: parsedOutput.value,
    assistantContent,
    rawResponse: chatResult.body,
    validation,
    latencyMs,
  });
  writeOutputJson(outputJson, payload.full);
  return payload.preview;
}

function invalidJsonRetryPrompt(basePrompt, reason) {
  return [
    basePrompt,
    "",
    "The previous response was not valid structured JSON for this exact schema.",
    `Validation failure: ${reason}`,
    "Retry now. Return ONLY one compact JSON object with keys summary, observations, and limitations.",
    "observations must be an array of 1 to 5 objects. Each object must include kind, description, confidence, and evidence.",
    "Do not include markdown fences, comments, prose before/after the JSON, or trailing commas.",
  ].join("\n");
}

function invalidJsonFallbackVisualOutput(image, reason) {
  return {
    summary: `MiniCPM-V returned malformed structured output for ${image.basename}.`,
    observations: [
      {
        kind: "uncertainty",
        description: "The provider response could not be parsed as valid visual JSON after a bounded retry, so this item needs manual review.",
        confidence: "low",
        evidence: image.basename,
      },
    ],
    limitations: [`Structured-output recovery was used: ${reason}`],
  };
}

function llamaServerArgs({ options, host, port, logPath }) {
  return [
    "-hf",
    modelRef(options),
    "--host",
    host,
    "--port",
    String(port),
    "-c",
    String(numericOption(options.context, "context", defaultContextTokens)),
    "-ngl",
    String(numericOption(options.gpuLayers, "gpu-layers", 99)),
    "--chat-template",
    "chatml",
    "--log-file",
    logPath,
    ...(booleanOption(options.offline) ? ["--offline"] : []),
  ];
}

function buildChatCompletionBody({ images, prompt, model, maxTokens, strictJsonSchema = true }) {
  const body = {
    model,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        ...images.map((image) => ({
          type: "image_url",
          image_url: { url: `data:${image.mimeType};base64,${readFileSync(image.path).toString("base64")}` },
        })),
      ],
    }],
    max_tokens: maxTokens,
    temperature: 0.1,
    top_p: 0.8,
    top_k: 100,
    chat_template_kwargs: { enable_thinking: false },
    reasoning_format: "none",
    ...(strictJsonSchema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: { name: "minicpm_visual_response", strict: true, schema: visualResponseSchema() },
          },
        }
      : {}),
  };
  const redacted = JSON.parse(JSON.stringify(body));
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    redacted.messages[0].content[index + 1].image_url.url = `data:${image.mimeType};base64,<redacted sha256:${image.sha256} bytes:${image.bytes}>`;
  }
  return { body, redacted };
}

function isSamplerInitializationError(result) {
  return result.statusCode === 400 && /Failed to initialize samplers/i.test(result.textPreview ?? "");
}

function analysisPayload(input) {
  const previewJsonPath = previewArtifactPath(input.outputJson);
  const full = {
    providerId,
    status: "passed",
    model: input.model,
    endpoint: input.endpoint,
    latencyMs: input.latencyMs,
    image: input.image,
    images: input.images,
    prompt: input.prompt,
    request: input.request,
    parsedOutput: input.parsedOutput,
    assistantContent: input.assistantContent,
    rawResponse: input.rawResponse,
    schemaValidation: input.validation,
    artifacts: { jsonPath: input.outputJson, previewJsonPath },
  };
  return {
    full,
    preview: {
      providerId,
      status: "passed",
      model: input.model,
      endpoint: input.endpoint,
      latencyMs: input.latencyMs,
      summary: input.parsedOutput.summary,
      observations: input.parsedOutput.observations,
      limitations: input.parsedOutput.limitations,
      image: { basename: input.image.basename, bytes: input.image.bytes, sha256: input.image.sha256 },
      images: input.images.map((image) => ({ basename: image.basename, bytes: image.bytes, sha256: image.sha256 })),
      artifacts: { jsonPath: previewJsonPath },
    },
  };
}

function previewArtifactPath(path) {
  const cwd = canonicalPath(process.cwd());
  const target = canonicalPath(path);
  const rel = relative(cwd, target);
  if (target === cwd) return ".";
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel.split(sep).join("/");
  return basename(target) || "artifact.json";
}

function canonicalPath(path) {
  const target = resolve(path);
  try {
    return realpathSync(target);
  } catch {
    try {
      return join(realpathSync(dirname(target)), basename(target));
    } catch {
      return target;
    }
  }
}

function promptText(options) {
  return options.prompt || [
    "Inspect this UI or game screenshot as evidence for Ambient Desktop visual QA.",
    "Return only valid JSON with keys summary, observations, and limitations.",
    "The summary must name the screen or activity if it is visually inferable.",
    "Each observation must have kind, description, confidence, and evidence.",
    "Use concrete evidence: quote exact visible labels when legible, or cite a specific region such as sidebar, top bar, canvas, modal, or bottom composer.",
    "Include at least one layout/affordance/defect/accessibility observation when the screenshot supports it.",
    "Do not use generic statements like 'UI elements are discernible' unless tied to a visible label or region.",
    "Use at most five concise observations so the JSON finishes before the token limit.",
  ].join(" ");
}

function imageInputs(options) {
  const images = Array.isArray(options.images)
    ? options.images
    : typeof options.image === "string"
      ? [options.image]
      : [];
  if (!images.length) throw new Error("Missing required argument: --image");
  if (images.length > 2) throw new Error("MiniCPM-V visual analysis currently accepts at most two images.");
  return images;
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
            kind: { type: "string", enum: ["layout", "text", "affordance", "defect", "visual_quality", "accessibility", "gameplay", "uncertainty"] },
            description: { type: "string" },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            evidence: { type: "string" },
          },
        },
      },
      limitations: { type: "array", items: { type: "string" } },
    },
  };
}

function validateVisualOutput(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, errors: ["Output is not a JSON object."] };
  if (typeof value.summary !== "string" || !value.summary.trim()) errors.push("summary must be a non-empty string.");
  if (!Array.isArray(value.observations) || value.observations.length === 0) errors.push("observations must be a non-empty array.");
  if (Array.isArray(value.observations)) {
    value.observations.forEach((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`observations[${index}] must be an object.`);
        return;
      }
      if (!["layout", "text", "affordance", "defect", "visual_quality", "accessibility", "gameplay", "uncertainty"].includes(item.kind)) errors.push(`observations[${index}].kind is invalid.`);
      if (typeof item.description !== "string" || !item.description.trim()) errors.push(`observations[${index}].description must be non-empty.`);
      if (!["low", "medium", "high"].includes(item.confidence)) errors.push(`observations[${index}].confidence is invalid.`);
      if (typeof item.evidence !== "string" || !item.evidence.trim()) errors.push(`observations[${index}].evidence must be non-empty.`);
    });
  }
  if (!Array.isArray(value.limitations)) errors.push("limitations must be an array.");
  return { valid: errors.length === 0, errors };
}

function fakeVisualOutput(fake, image) {
  try {
    const parsed = JSON.parse(fake);
    const validation = validateVisualOutput(parsed);
    if (validation.valid) return parsed;
  } catch {
    // Fall through to a deterministic valid payload.
  }
  return {
    summary: fake.trim() || `Local visual analysis fixture for ${image.basename}`,
    observations: [
      {
        kind: "visual_quality",
        description: "Deterministic fake MiniCPM-V analysis path returned a bounded visual observation.",
        confidence: "high",
        evidence: image.basename,
      },
    ],
    limitations: ["Fake analysis mode does not inspect image pixels."],
  };
}

function parseJsonObject(content) {
  if (!content || typeof content !== "string") return { ok: false, error: "Assistant content is empty." };
  try {
    return { ok: true, value: JSON.parse(content) };
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

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { method: options.method ?? "GET", headers: options.headers, body: options.body, signal: controller.signal });
    const text = await response.text();
    return {
      ok: response.ok,
      statusCode: response.status,
      statusText: response.statusText,
      latencyMs: Date.now() - startedAt,
      body: parseJsonLenient(text),
      textPreview: text.length > 4000 ? `${text.slice(0, 4000)}\n...[truncated ${text.length - 4000} chars]` : text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForHealth(endpoint, waitMs) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < waitMs) {
    const health = await fetchJson(`${endpoint}/health`, { timeoutMs: 3000 }).catch((error) => {
      lastError = error;
      return undefined;
    });
    if (health?.ok) return health;
    await sleep(500);
  }
  throw new Error(`MiniCPM-V llama-server did not become healthy within ${waitMs} ms${lastError ? `: ${lastError.message}` : ""}.`);
}

async function withStateLock(stateDir, timeoutMs, action) {
  const lockPath = join(stateDir, "server-start.lock");
  const started = Date.now();
  let fd;
  while (fd === undefined) {
    try {
      fd = openSync(lockPath, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (Date.now() - started > timeoutMs) {
        throw new Error(`MiniCPM-V start lock was not released within ${timeoutMs} ms: ${lockPath}`);
      }
      const stale = lockFileIsStale(lockPath, Math.max(300_000, timeoutMs * 2));
      if (stale) {
        rmSync(lockPath, { force: true });
        continue;
      }
      await sleep(250);
    }
  }
  try {
    return await action();
  } finally {
    try {
      closeSync(fd);
    } catch {
      // Ignore close errors during cleanup.
    }
    rmSync(lockPath, { force: true });
  }
}

function lockFileIsStale(lockPath, staleMs) {
  try {
    const stats = statSync(lockPath);
    return Date.now() - stats.mtimeMs > staleMs;
  } catch {
    return true;
  }
}

async function waitForHealthWhileProcessRuns(endpoint, waitMs, pid) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < waitMs) {
    if (!processAlive(pid)) return { ok: false, error: "MiniCPM-V llama-server exited during startup." };
    const health = await fetchJson(`${endpoint}/health`, { timeoutMs: 3000 }).catch((error) => {
      lastError = error;
      return undefined;
    });
    if (health?.ok) return health;
    await sleep(500);
  }
  throw new Error(`MiniCPM-V llama-server did not become healthy within ${waitMs} ms${lastError ? `: ${lastError.message}` : ""}.`);
}

function repairCorruptModelCache(stderrPath) {
  const text = stderrTail(stderrPath, 40_000);
  if (!/model is corrupted or incomplete/i.test(text)) return { repaired: false, reason: "No corrupt-model diagnostic was found." };
  const cacheRoots = modelCacheRootsForPlatform().map((root) => resolve(root));
  const paths = [...text.matchAll(/loading model '([^']+)'/g)]
    .map((match) => resolve(match[1]))
    .filter((path, index, all) => all.indexOf(path) === index);
  const removed = [];
  const skipped = [];
  for (const path of paths) {
    if (!cacheRoots.some((root) => isPathInside(root, path))) {
      skipped.push(path);
      continue;
    }
    if (!existsSync(path)) {
      skipped.push(path);
      continue;
    }
    rmSync(path, { force: true });
    removed.push(path);
  }
  return removed.length
    ? { repaired: true, removedCount: removed.length, removedBasenames: removed.map((path) => basename(path)), skippedCount: skipped.length }
    : { repaired: false, reason: "Corrupt model paths were not inside known model cache roots.", skippedCount: skipped.length };
}

function stderrTail(stderrPath, maxChars = 3000) {
  try {
    const text = readFileSync(stderrPath, "utf8");
    return text.length > maxChars ? text.slice(-maxChars) : text;
  } catch {
    return "";
  }
}

function imageMetadata(inputPath) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(inputPath)) throw new Error("MiniCPM-V image input must be a local path resolved by Ambient Desktop, not a remote URL.");
  const path = resolve(inputPath);
  if (!existsSync(path)) throw new Error(`Image input does not exist: ${inputPath}`);
  const details = statSync(path);
  if (!details.isFile()) throw new Error(`Image input is not a file: ${inputPath}`);
  if (details.size > maxImageBytes) throw new Error(`Image input exceeds ${maxImageBytes} bytes: ${details.size}`);
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (!imageExtensions.has(extension)) throw new Error(`Unsupported image extension: ${extension}`);
  const bytes = readFileSync(path);
  return {
    path,
    basename: path.split(/[\\/]/).pop(),
    bytes: details.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    mimeType: extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg",
  };
}

function resolveRuntimeBinary() {
  const configured = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER?.trim();
  if (configured) {
    const resolved = configured.includes("/") || configured.includes("\\") ? resolve(configured) : configured;
    if (configured.includes("/") || configured.includes("\\")) {
      return existsSync(resolved)
        ? { available: true, command: resolved }
        : { available: false, command: resolved, reason: `Configured llama-server does not exist: ${resolved}` };
    }
    return commandAvailable(resolved)
      ? { available: true, command: resolved }
      : { available: false, command: resolved, reason: `Configured llama-server was not found on PATH: ${resolved}` };
  }
  const candidates = [
    join(homedir(), "RCLI/deps/llama.cpp/build/bin/llama-server"),
    join(homedir(), "llama.cpp/build/bin/llama-server"),
    "llama-server",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = candidate.includes("/") || candidate.includes("\\") ? resolve(candidate) : candidate;
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (existsSync(resolved)) return { available: true, command: resolved };
    } else if (commandAvailable(resolved)) {
      return { available: true, command: resolved };
    }
  }
  return {
    available: false,
    command: configured,
    reason: configured ? `Configured llama-server does not exist or is unavailable: ${configured}` : "llama-server was not found. Set AMBIENT_MINICPM_V_LLAMA_SERVER to a current llama.cpp llama-server binary.",
  };
}

function runtimeVersion(command) {
  try {
    const result = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 256 });
    const lines = [result.stdout, result.stderr].filter(Boolean).join("\n").trim().split(/\r?\n/).filter((line) => line.trim());
    return lines.find((line) => /\bversion:\s*\d+/i.test(line.trim())) || lines.find((line) => /^built with/i.test(line.trim()));
  } catch {
    return undefined;
  }
}

function commandAvailable(command) {
  const probe = platform() === "win32" ? spawnSync("where", [command], { encoding: "utf8" }) : spawnSync("sh", ["-lc", `command -v ${shellQuote(command)}`], { encoding: "utf8" });
  return probe.status === 0;
}

function statusReason({ binary, health, models, serverRunning, endpointOverride }) {
  if (endpointOverride) {
    if (!health.ok) return `Existing MiniCPM-V local endpoint is not reachable: ${health.error ?? health.textPreview ?? "unknown health response"}`;
    if (!models?.ok) return `Existing MiniCPM-V local endpoint did not return /v1/models: ${models?.error ?? models?.textPreview ?? "unknown models response"}`;
    return "Existing MiniCPM-V local endpoint is healthy and exposes /v1/models.";
  }
  if (!binary.available) return binary.reason;
  if (health.ok) return "MiniCPM-V local endpoint is healthy.";
  if (serverRunning) return `MiniCPM-V process is running but health check is not ready: ${health.error ?? health.textPreview ?? "unknown health response"}`;
  return "MiniCPM-V runtime binary is available, but no workspace-local server is running.";
}

function missingHints({ binary, health, models, serverRunning, endpointOverride }) {
  const hints = [];
  if (endpointOverride) {
    if (!health.ok) hints.push("Start the approved local MiniCPM-compatible endpoint and confirm /health responds before validating again.");
    if (health.ok && !models?.ok) hints.push("Confirm the approved local endpoint exposes an OpenAI-compatible /v1/models route.");
    hints.push("Run a validation image request through ambient_visual_minicpm_setup before claiming the existing endpoint is active.");
    return hints;
  }
  if (!binary.available) hints.push("Build or install llama.cpp with llama-server, then bind AMBIENT_MINICPM_V_LLAMA_SERVER if it is not on PATH.");
  hints.push("Default model is openbmb/MiniCPM-V-4_5-gguf:q4_k_m; first start may download model and projector files through llama.cpp/Hugging Face cache.");
  if (binary.available && !serverRunning && !health.ok) hints.push("Run minicpm_vision_start before minicpm_vision_analyze, or provide --endpoint for an approved local endpoint.");
  return hints;
}

function installPlan() {
  return {
    packageType: "adapter-only",
    bundledRuntimeBinaries: false,
    bundledModelWeights: false,
    runtimeAcquisition: "Desktop can use the default managed macOS arm64/Linux x64 llama.cpp runtime download, a user-approved local archive, a user-managed llama-server binary, or an approved existing local endpoint. Windows default download remains disabled.",
    runtime: "llama.cpp llama-server",
    defaultModel,
    experimentalModel: defaultExperimentalModel,
    modelDownloads: [
      {
        name: "MiniCPM-V 4.5 Q4_K_M GGUF",
        ref: defaultModel,
        host: "huggingface.co",
        expectedSize: "about 4.7 GiB text model plus about 1.0 GiB f16 vision projector in llama.cpp cache",
        license: "Apache-2.0 per OpenBMB model card; verify pinned revision before bundling",
      },
      {
        name: "MiniCPM-V 4.6 Q4_K_M GGUF experimental comparison",
        ref: defaultExperimentalModel,
        host: "huggingface.co",
        expectedSize: "smaller/lighter than 4.5 in current GGUF smoke, but lower-quality on Ambient UI fixtures",
        license: "Apache-2.0 per OpenBMB repo/model metadata; verify pinned revision before bundling",
      },
    ],
    networkHosts: ["huggingface.co", "github.com"],
    runtimeCacheRoot: ".ambient/vision/minicpm-v/runtime",
    modelCacheRoots: modelCacheRootsForPlatform(),
    stateDirectory: stateDirPath({}),
  };
}

function verifyRuntimeManifest(options) {
  const manifest = runtimeReleaseManifest(options);
  const checks = [];
  const selectedArtifact = selectRuntimeManifestArtifact(manifest, options);
  checks.push({
    id: "manifest-schema",
    label: "Runtime release manifest schema",
    status: manifest.schemaVersion === "ambient-minicpm-v-runtime-release-manifest-v1" ? "passed" : "failed",
    detail: manifest.schemaVersion === "ambient-minicpm-v-runtime-release-manifest-v1"
      ? `Manifest ${manifest.manifestId} uses the expected schema.`
      : "Runtime release manifest schema is unsupported.",
  });
  if (!selectedArtifact) {
    checks.push({
      id: "artifact-selection",
      label: "Host runtime artifact",
      status: "blocked",
      detail: `No runtime release artifact is declared for ${options.platform || platform()} ${options.arch || arch()}.`,
    });
    checks.push(runtimeManifestDownloadPolicyCheck(manifest, undefined));
  } else {
    checks.push({
      id: "artifact-selection",
      label: "Host runtime artifact",
      status: "passed",
      detail: `Selected ${selectedArtifact.id} for ${selectedArtifact.platform} ${selectedArtifact.arch}.`,
    });
    checks.push(runtimeManifestArtifactFieldCheck(selectedArtifact, manifest.requiredArtifactFields));
    checks.push(runtimeManifestArtifactPinCheck(selectedArtifact));
    checks.push(runtimeManifestDownloadPolicyCheck(manifest, selectedArtifact));
    checks.push(runtimeManifestArchiveChecksumCheck(selectedArtifact, options.archive));
    checks.push(runtimeManifestBinaryChecksumCheck(selectedArtifact, options.binary));
  }
  const blockers = runtimeManifestBlockersForSelection(manifest, selectedArtifact);
  return {
    schemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1",
    manifestId: manifest.manifestId,
    status: runtimeManifestVerificationStatus(checks, blockers),
    downloadEnabled: manifest.downloadEnabled === true,
    checksumAlgorithm: "sha256",
    ...(selectedArtifact ? { selectedArtifactId: selectedArtifact.id } : {}),
    requiredArtifactFields: manifest.requiredArtifactFields || [],
    artifacts: manifest.artifacts || [],
    checks,
    blockers,
    ...(options.archive ? { verifiedArchivePath: options.archive } : {}),
    ...(options.archive && existsSync(options.archive) ? { verifiedArchiveSha256: sha256File(options.archive) } : {}),
    ...(options.binary ? { verifiedBinaryPath: options.binary } : {}),
    ...(options.binary && existsSync(options.binary) ? { verifiedBinarySha256: sha256File(options.binary) } : {}),
  };
}

function runtimeReleaseManifest(options) {
  const manifestPath = options.manifestJson ? resolve(options.manifestJson) : new URL("../runtime-release-manifest.prototype.json", import.meta.url);
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`MiniCPM-V runtime release manifest could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function selectRuntimeManifestArtifact(manifest, options) {
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  if (options.artifactId) return artifacts.find((artifact) => artifact.id === options.artifactId);
  const targetPlatform = options.platform || platform();
  const targetArch = options.arch || arch();
  return artifacts.find((artifact) => artifact.platform === targetPlatform && artifact.arch === targetArch);
}

function runtimeManifestArtifactFieldCheck(artifact, requiredFields) {
  const missing = (Array.isArray(requiredFields) ? requiredFields : []).filter((field) => {
    const value = artifact[field];
    return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  });
  return {
    id: "artifact-required-fields",
    label: "Artifact required fields",
    status: missing.length ? "failed" : "passed",
    detail: missing.length
      ? `${artifact.id} is missing required fields: ${missing.join(", ")}.`
      : `${artifact.id} declares every required runtime artifact field.`,
  };
}

function runtimeManifestArtifactPinCheck(artifact) {
  const archivePinned = isRealSha256(artifact.archiveSha256);
  const binaryPinned = artifact.binarySha256 ? isRealSha256(artifact.binarySha256) : true;
  const tagPinned = artifact.releaseTag !== "pin-required" && !String(artifact.releaseTag || "").includes("<");
  const urlPinned = !String(artifact.sourceUrl || "").includes("<") && !String(artifact.archiveName || "").includes("<");
  const pinned = artifact.pinStatus === "pinned" && archivePinned && binaryPinned && tagPinned && urlPinned;
  return {
    id: "artifact-checksum-pin",
    label: "Artifact checksum pin",
    status: pinned ? "passed" : "blocked",
    detail: pinned
      ? `${artifact.id} has pinned release URL, archive checksum, and binary checksum metadata.`
      : `${artifact.id} is a manifest prototype only; pin an exact release tag, source URL, archive SHA-256, and binary SHA-256 before enabling downloads.`,
  };
}

function runtimeManifestDownloadPolicyCheck(manifest, artifact) {
  if (manifest.downloadEnabled !== true) {
    return {
      id: "download-policy",
      label: "Managed download policy",
      status: "blocked",
      detail: "Ambient-managed MiniCPM-V runtime download is disabled by the runtime release manifest.",
    };
  }
  if (!artifact) {
    return {
      id: "download-policy",
      label: "Managed download policy",
      status: "blocked",
      detail: "Ambient-managed MiniCPM-V runtime download needs a selected runtime artifact.",
    };
  }
  if (artifact.defaultDownloadEnabled !== true) {
    return {
      id: "download-policy",
      label: "Managed download policy",
      status: "blocked",
      detail: `${artifact.id} is pinned for validation but disabled for default managed download.`,
    };
  }
  if (artifact.supportTier !== "conditional") {
    return {
      id: "download-policy",
      label: "Managed download policy",
      status: "blocked",
      detail: `${artifact.id} is ${artifact.supportTier}; default managed download is limited to conditional support lanes.`,
    };
  }
  return {
    id: "download-policy",
    label: "Managed download policy",
    status: "passed",
    detail: `Default managed runtime download is enabled for ${artifact.id}.`,
  };
}

function runtimeManifestBlockersForSelection(manifest, artifact) {
  const blockers = Array.isArray(manifest.blockers) ? manifest.blockers : [];
  if (!artifact) return blockers;
  return blockers.filter((blocker) => {
    if (/Windows x64/i.test(blocker)) return artifact.platform === "win32";
    if (/macOS/i.test(blocker)) return artifact.platform === "darwin";
    return true;
  });
}

function runtimeManifestArchiveChecksumCheck(artifact, archivePath) {
  if (!archivePath) {
    return {
      id: "local-archive-checksum",
      label: "Local archive checksum",
      status: "not-run",
      detail: "No local runtime archive was supplied; checksum verification was not run.",
    };
  }
  const resolved = resolve(archivePath);
  if (!existsSync(resolved)) {
    return {
      id: "local-archive-checksum",
      label: "Local archive checksum",
      status: "failed",
      detail: `Runtime archive does not exist: ${resolved}.`,
    };
  }
  const details = statSync(resolved);
  if (!details.isFile()) {
    return {
      id: "local-archive-checksum",
      label: "Local archive checksum",
      status: "failed",
      detail: `Runtime archive path is not a file: ${resolved}.`,
    };
  }
  const actual = sha256File(resolved);
  return {
    id: "local-archive-checksum",
    label: "Local archive checksum",
    status: actual === artifact.archiveSha256 ? "passed" : "failed",
    detail: actual === artifact.archiveSha256
      ? `Runtime archive SHA-256 matched ${artifact.id}.`
      : `Runtime archive SHA-256 mismatch for ${artifact.id}: expected ${artifact.archiveSha256}, got ${actual}.`,
  };
}

function runtimeManifestBinaryChecksumCheck(artifact, binaryPath) {
  if (!binaryPath) {
    return {
      id: "local-binary-checksum",
      label: "Local binary checksum",
      status: "not-run",
      detail: "No extracted runtime binary was supplied; binary checksum verification was not run.",
    };
  }
  const resolved = resolve(binaryPath);
  if (!artifact.binarySha256) {
    return {
      id: "local-binary-checksum",
      label: "Local binary checksum",
      status: "failed",
      detail: `${artifact.id} does not declare an extracted-binary SHA-256.`,
    };
  }
  if (!existsSync(resolved)) {
    return {
      id: "local-binary-checksum",
      label: "Local binary checksum",
      status: "failed",
      detail: `Runtime binary does not exist: ${resolved}.`,
    };
  }
  const details = statSync(resolved);
  if (!details.isFile()) {
    return {
      id: "local-binary-checksum",
      label: "Local binary checksum",
      status: "failed",
      detail: `Runtime binary path is not a file: ${resolved}.`,
    };
  }
  const actual = sha256File(resolved);
  return {
    id: "local-binary-checksum",
    label: "Local binary checksum",
    status: actual === artifact.binarySha256 ? "passed" : "failed",
    detail: actual === artifact.binarySha256
      ? `Runtime binary SHA-256 matched ${artifact.id}.`
      : `Runtime binary SHA-256 mismatch for ${artifact.id}: expected ${artifact.binarySha256}, got ${actual}.`,
  };
}

function runtimeManifestVerificationStatus(checks, blockers) {
  if (checks.some((check) => check.status === "failed")) return "failed";
  if (blockers.length || checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "warning" || check.status === "not-run")) return "warning";
  return "passed";
}

function isRealSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || "")) && !/^(.)\1{63}$/.test(String(value || ""));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function runtimeContract({ binary, endpoint, endpointOverride, health, models, version }) {
  return {
    mode: endpointOverride ? "existing-local-endpoint" : "user-managed-runtime",
    status: "active",
    runtime: endpointOverride ? "OpenAI-compatible local MiniCPM endpoint" : "llama.cpp llama-server",
    ...(endpointOverride ? { endpoint } : binary.command ? { binaryPath: binary.command } : {}),
    ...(version && !endpointOverride ? { version } : {}),
    runtimeCacheRoot: ".ambient/vision/minicpm-v/runtime",
    modelCacheRoots: modelCacheRootsForPlatform(),
    modelAssets: [
      defaultModel,
      `${defaultExperimentalModel} experimental comparison`,
    ],
    installPlan: endpointOverride
      ? [
          "Use an approved existing localhost/127.0.0.1/[::1] endpoint.",
          "Validate /health and /v1/models before analysis.",
          "Do not start, stop, download models for, or clean up the user-managed endpoint.",
        ]
      : [
          "Install/Repair can fetch the default managed macOS arm64 or Linux x64 llama.cpp runtime when no endpoint, local binary, or local archive is supplied.",
          "Use a user-managed llama.cpp llama-server binary from AMBIENT_MINICPM_V_LLAMA_SERVER, known local paths, or PATH when explicitly selected.",
          "Keep model/projector downloads in llama.cpp/Hugging Face caches until Ambient-managed model download is implemented.",
          "Bind only validated runtime paths through Ambient-managed ignored env files.",
        ],
    preflight: endpointOverride
      ? [
          { id: "endpoint-locality", label: "Endpoint locality", status: "passed", detail: `Endpoint is local-only: ${endpoint}.` },
          { id: "endpoint-health", label: "Endpoint health", status: health.ok && models?.ok ? "passed" : "warning", detail: health.ok && models?.ok ? "Endpoint passed /health and /v1/models." : "Endpoint has not passed both /health and /v1/models." },
          { id: "endpoint-lifecycle", label: "Endpoint lifecycle", status: "warning", detail: "Existing endpoints are user-managed; Ambient does not manage their process or cache lifecycle." },
        ]
      : [
          { id: "runtime-binary-present", label: "llama-server binary", status: binary.available ? "passed" : "failed", detail: binary.available ? `Found llama-server at ${binary.command}.` : binary.reason },
          { id: "runtime-version", label: "Runtime version", status: version ? "passed" : binary.available ? "warning" : "not-run", detail: version || (binary.available ? "Runtime binary exists, but version was not reported by status preflight." : "Runtime version cannot be checked until llama-server is available.") },
          { id: "model-cache-policy", label: "Model cache policy", status: "warning", detail: "Model/projector downloads currently use llama.cpp/Hugging Face caches; Ambient-managed model cache is not implemented yet." },
        ],
    ambientManagedDownload: {
      status: "planned",
      cacheRoot: ".ambient/vision/minicpm-v/runtime",
      requirements: [
        "Pinned per-platform llama.cpp release manifest with source URLs, expected binary names, and SHA-256 checksums.",
        "macOS app-managed execution policy: checksum-verified, quarantine-free managed copy with a valid code signature; Gatekeeper acceptance is recorded separately.",
        "Linux GPU backend and driver preflight with CPU fallback labeled separately.",
        "Windows path quoting, firewall, lifecycle, GPU backend, and cache smoke evidence.",
      ],
      blockers: [
        "Default managed runtime download is recommended only for the pinned macOS arm64 and Linux x64 artifacts; Windows remains disabled.",
        "No Windows lifecycle smoke evidence exists yet; this does not block the scoped macOS/Linux recommended lane.",
      ],
      manifestVerification: verifyRuntimeManifest({}),
    },
  };
}

function modelCacheRootsForPlatform() {
  if (platform() === "darwin") return [join(homedir(), "Library/Caches/llama.cpp"), join(homedir(), ".cache/huggingface/hub")];
  if (platform() === "win32") return [join(homedir(), "AppData/Local/llama.cpp"), join(homedir(), ".cache/huggingface/hub")];
  return [join(homedir(), ".cache/llama.cpp"), join(homedir(), ".cache/huggingface/hub")];
}

function inputPolicy() {
  return {
    acceptedInputs: ["local image file paths resolved by Ambient Desktop"],
    rejectedInputs: ["arbitrary remote URLs", "unbounded video files", "directories"],
    imageExtensions: [...imageExtensions],
    maxImageBytes,
  };
}

function modelRef(options) {
  return options.model || process.env.AMBIENT_MINICPM_V_MODEL?.trim() || defaultModel;
}

function experimentalModelRef() {
  return process.env.AMBIENT_MINICPM_V_EXPERIMENTAL_MODEL?.trim() || defaultExperimentalModel;
}

function endpointFromOptions(options, state) {
  return localEndpointOverride(options) || state?.endpoint || `http://${hostOption(options)}:${portOption(options)}`;
}

function localEndpointOverride(options) {
  const raw = options.endpoint || process.env.AMBIENT_MINICPM_V_ENDPOINT?.trim();
  return raw ? normalizeLocalEndpoint(raw) : undefined;
}

function normalizeLocalEndpoint(raw) {
  let parsed;
  try {
    parsed = new URL(String(raw).trim());
  } catch {
    throw new Error(`Invalid MiniCPM-V endpoint URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("MiniCPM-V existing endpoint must use http:// or https://.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) {
    throw new Error(`MiniCPM-V existing endpoints must be local-only: use localhost, 127.0.0.1, or [::1]. Remote endpoints require a separate security review covering ${remoteEndpointReviewChecklist}.`);
  }
  if (parsed.pathname && parsed.pathname !== "/") {
    throw new Error("MiniCPM-V existing endpoint URL must be the endpoint origin, not a /v1 or request path.");
  }
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function hostOption(options) {
  return options.host || process.env.AMBIENT_MINICPM_V_HOST?.trim() || defaultHost;
}

function portOption(options) {
  return numericOption(options.port || process.env.AMBIENT_MINICPM_V_PORT, "port", defaultPort);
}

function hasExplicitPortOption(options) {
  return options.port !== undefined || Boolean(process.env.AMBIENT_MINICPM_V_PORT?.trim());
}

function isPathInside(root, candidate) {
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function findAvailablePort(host) {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close((error) => {
        if (error) reject(error);
        else if (typeof port === "number") resolvePort(port);
        else reject(new Error("MiniCPM-V could not allocate a managed local port."));
      });
    });
  });
}

function booleanOption(value) {
  if (typeof value === "boolean") return value;
  return /^(1|true|yes|on)$/i.test(String(value ?? ""));
}

function numericOption(value, name, fallback) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid numeric value for ${name}: ${value}`);
  return parsed;
}

function stateDirPath(options) {
  return resolve(options.stateDir || process.env.AMBIENT_MINICPM_V_STATE_DIR?.trim() || join(process.cwd(), ".ambient", "minicpm-v"));
}

function statePath(options) {
  return join(stateDirPath(options), "server-state.json");
}

function readState(options) {
  try {
    return JSON.parse(readFileSync(statePath(options), "utf8"));
  } catch {
    return undefined;
  }
}

function writeState(options, state) {
  mkdirSync(stateDirPath(options), { recursive: true });
  writeFileSync(statePath(options), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function clearState(options) {
  rmSync(statePath(options), { force: true });
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function openAppend(path) {
  mkdirSync(dirname(path), { recursive: true });
  return openSync(path, "a");
}

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith("--") ? argv.shift() : "status";
  const options = { command };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--offline") options.offline = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      if (key === "image") {
        options.images = [...(options.images ?? []), value];
        options.image = options.images[0];
      } else {
        options[key] = value;
      }
      index += 1;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return options;
}

function writeOutputJson(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function parseJsonLenient(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isLocalHost(host) {
  return ["127.0.0.1", "localhost", "::1"].includes(host);
}

function required(value, name) {
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function helpText() {
  return `Ambient MiniCPM-V vision provider

Usage:
  node scripts/run.mjs status
  node scripts/run.mjs verify-runtime-manifest [--archive <local-runtime-archive>] [--binary <extracted-llama-server>] [--artifact-id <artifact-id>]
  node scripts/run.mjs start [--wait-ms 120000] [--context ${defaultContextTokens}] [--offline]
  node scripts/run.mjs analyze --image <local-image> [--image <reference-image>] --output-json <artifact.json> [--prompt <task>] [--endpoint http://127.0.0.1:39217]
  node scripts/run.mjs stop

Environment:
  AMBIENT_MINICPM_V_LLAMA_SERVER       Optional llama-server path or command.
  AMBIENT_MINICPM_V_MODEL              Optional model ref. Default ${defaultModel}.
  AMBIENT_MINICPM_V_EXPERIMENTAL_MODEL Optional comparison model ref. Default ${defaultExperimentalModel}.
  AMBIENT_MINICPM_V_STATE_DIR          Optional state directory. Default .ambient/minicpm-v in the workspace.
  AMBIENT_MINICPM_V_ENDPOINT           Optional approved local endpoint origin. Remote endpoints are rejected.
  AMBIENT_MINICPM_V_FAKE_ANALYSIS      Test-only deterministic analysis payload.
`;
}
