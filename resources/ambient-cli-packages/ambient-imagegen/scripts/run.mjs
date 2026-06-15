#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { arch, platform } from "node:os";
import { deflateSync } from "node:zlib";

const packageName = "ambient-imagegen";
const capabilityId = "imagegen";
const defaultTimeoutMs = 120_000;
const maxErrorChars = 2_000;

const providerDefinitions = [
  {
    id: "openai",
    label: "OpenAI GPT Image",
    api: "openai",
    aliases: ["openai", "open-ai", "gpt-image", "gpt-image-2"],
    envNames: ["OPENAI_API_KEY"],
    defaultModel: "gpt-image-2",
    networkHosts: ["api.openai.com"],
    defaultFormat: "png",
  },
  {
    id: "google",
    label: "Google Nano Banana",
    api: "google",
    aliases: ["google", "gemini", "nano-banana", "nanobanana"],
    envNames: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    defaultModel: "gemini-3.1-flash-image",
    networkHosts: ["generativelanguage.googleapis.com"],
    defaultFormat: "png",
  },
  {
    id: "google-nano-banana-pro",
    label: "Google Nano Banana Pro",
    api: "google",
    aliases: ["google-nano-banana-pro", "nano-banana-pro", "nanobanana-pro", "gemini-3-pro-image"],
    envNames: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    defaultModel: "gemini-3-pro-image",
    networkHosts: ["generativelanguage.googleapis.com"],
    defaultFormat: "png",
  },
  {
    id: "fal",
    label: "fal Model APIs",
    api: "fal",
    aliases: ["fal", "fal-ai", "fal-models"],
    envNames: ["FAL_KEY"],
    defaultModel: "fal-ai/flux/dev",
    networkHosts: ["fal.run", "fal.ai", "queue.fal.run"],
    defaultFormat: "png",
  },
  {
    id: "flux",
    label: "FLUX via fal",
    api: "fal",
    aliases: ["flux", "black-forest-labs", "bfl", "flux-dev", "flux-pro"],
    envNames: ["FAL_KEY"],
    defaultModel: "fal-ai/flux/dev",
    networkHosts: ["fal.run", "fal.ai", "queue.fal.run"],
    defaultFormat: "png",
  },
  {
    id: "replicate",
    label: "Replicate image models",
    api: "replicate",
    aliases: ["replicate", "replicate-flux"],
    envNames: ["REPLICATE_API_TOKEN"],
    defaultModel: "black-forest-labs/flux-schnell",
    networkHosts: ["api.replicate.com", "replicate.delivery"],
    defaultFormat: "png",
  },
  {
    id: "stability",
    label: "Stability AI",
    api: "stability",
    aliases: ["stability", "stability-ai", "stable-image", "stable-diffusion"],
    envNames: ["STABILITY_API_KEY"],
    defaultModel: "stable-image-ultra",
    networkHosts: ["api.stability.ai"],
    defaultFormat: "png",
  },
  {
    id: "ideogram",
    label: "Ideogram",
    api: "ideogram",
    aliases: ["ideogram", "ideogram-v4"],
    envNames: ["IDEOGRAM_API_KEY"],
    defaultModel: "ideogram-v4",
    networkHosts: ["api.ideogram.ai", "ideogram.ai"],
    defaultFormat: "png",
  },
];

const providerAliases = new Map(providerDefinitions.flatMap((provider) => provider.aliases.map((alias) => [alias, provider])));

main();

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    switch (options.command) {
      case "doctor":
        writeJson(doctorPayload());
        return;
      case "generate":
        writeJson(await generateImage(options));
        return;
      case "help":
        process.stdout.write(helpText());
        return;
      default:
        throw new Error(`Unknown command: ${options.command}`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

function doctorPayload() {
  return {
    packageName,
    capabilityId,
    status: "ready",
    ready: true,
    nonMutating: true,
    platform: { os: platform(), arch: arch(), node: process.version },
    providers: providerDefinitions.map((provider) => ({
      id: provider.id,
      label: provider.label,
      aliases: provider.aliases,
      defaultModel: provider.defaultModel,
      api: provider.api,
      networkHosts: provider.networkHosts,
      requiredEnvNames: provider.envNames,
      configured: configuredEnvName(provider) !== undefined,
    })),
    artifactContract: artifactContract(),
    safety: [
      "Doctor does not call hosted provider APIs.",
      "Secret values are never printed; only env names and configured state are reported.",
      "Generation writes image bytes and metadata into the workspace.",
    ],
  };
}

async function generateImage(options) {
  const startedAt = Date.now();
  const provider = resolveProvider(options.provider ?? "openai");
  const prompt = readPrompt(options);
  const model = stringOption(options.model) ?? provider.defaultModel;
  const format = normalizeFormat(stringOption(options.format) ?? provider.defaultFormat);
  const timeoutMs = positiveInteger(options.timeoutMs, "timeout-ms", defaultTimeoutMs);
  const outputPath = resolveOutputPath(options.output, provider, format);
  const plan = {
    packageName,
    capabilityId,
    provider: provider.id,
    providerLabel: provider.label,
    api: provider.api,
    model,
    networkHosts: provider.networkHosts,
    requiredEnvNames: provider.envNames,
    outputPath,
    format,
    size: stringOption(options.size),
    aspectRatio: stringOption(options.aspectRatio),
    promptBytes: Buffer.byteLength(prompt),
    promptPreview: truncateText(prompt, 500),
  };

  if (options.dryRun) {
    return {
      ...plan,
      status: "planned",
      mutationPerformed: false,
      secretValuesIncluded: false,
      next: "Bind the selected provider secret through Ambient-managed secret flow, then run without --dry-run.",
    };
  }

  const fake = process.env.AMBIENT_HOSTED_IMAGE_FAKE_GENERATION === "1" || options.fake === true;
  const generated = fake
    ? fakeImagePayload(provider, model, format, options)
    : await callHostedProvider(provider, { ...options, prompt, model, format, timeoutMs });

  const image = generated.image;
  const mimeType = generated.mimeType ?? mimeTypeForFormat(format);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, image);
  const dimensions = imageDimensions(image, mimeType);
  const metadataPath = metadataPathFor(outputPath);
  const metadata = {
    schemaVersion: "ambient-imagegen-v1",
    packageName,
    capabilityId,
    status: "generated",
    fake,
    provider: provider.id,
    providerLabel: provider.label,
    api: provider.api,
    model,
    networkHosts: provider.networkHosts,
    requiredEnvNames: provider.envNames,
    secretValuesIncluded: false,
    promptBytes: Buffer.byteLength(prompt),
    promptPreview: truncateText(prompt, 500),
    request: {
      size: stringOption(options.size),
      aspectRatio: stringOption(options.aspectRatio),
      format,
      quality: stringOption(options.quality),
      negativePromptBytes: options.negativePrompt ? Buffer.byteLength(String(options.negativePrompt)) : 0,
      seed: stringOption(options.seed),
    },
    image: imageMetadata(image, mimeType, dimensions),
    outputPath,
    metadataPath,
    providerMetadata: generated.metadata,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    artifactContract: artifactContract(),
  };
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  return {
    packageName,
    capabilityId,
    status: "generated",
    fake,
    provider: provider.id,
    model,
    outputPath,
    metadataPath,
    image: metadata.image,
    durationMs: metadata.durationMs,
    secretValuesIncluded: false,
  };
}

async function callHostedProvider(provider, options) {
  const key = requiredApiKey(provider);
  switch (provider.api) {
    case "openai":
      return callOpenAi(provider, key, options);
    case "google":
      return callGoogle(provider, key, options);
    case "fal":
      return callFal(provider, key, options);
    case "replicate":
      return callReplicate(provider, key, options);
    case "stability":
      return callStability(provider, key, options);
    case "ideogram":
      return callIdeogram(provider, key, options);
    default:
      throw new Error(`Unsupported provider API: ${provider.api}`);
  }
}

async function callOpenAi(provider, key, options) {
  const response = await fetchJson("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(compactObject({
      model: options.model,
      prompt: options.prompt,
      n: 1,
      size: options.size,
      quality: options.quality,
      response_format: "b64_json",
    })),
    timeoutMs: options.timeoutMs,
  });
  const payload = extractImagePayload(response.json);
  return materializeExtractedPayload(payload, {
    provider,
    timeoutMs: options.timeoutMs,
    metadata: {
      responseId: response.json.id,
      created: response.json.created,
      outputKind: payload.kind,
    },
  });
}

async function callGoogle(provider, key, options) {
  const response = await fetchJson(`https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(options.model)}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: options.prompt }] }],
    }),
    timeoutMs: options.timeoutMs,
  });
  const payload = extractImagePayload(response.json);
  return materializeExtractedPayload(payload, {
    provider,
    timeoutMs: options.timeoutMs,
    metadata: {
      model: options.model,
      responseTextPreview: truncateText(extractGoogleText(response.json), 500),
      outputKind: payload.kind,
    },
  });
}

async function callFal(provider, key, options) {
  const response = await fetchJson(`https://fal.run/${options.model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(compactObject({
      prompt: options.prompt,
      image_size: falImageSize(options.size, options.aspectRatio),
      num_images: 1,
      output_format: options.format,
      seed: numericString(options.seed),
      negative_prompt: options.negativePrompt,
    })),
    timeoutMs: options.timeoutMs,
  });
  const payload = extractImagePayload(response.json);
  return materializeExtractedPayload(payload, {
    provider,
    timeoutMs: options.timeoutMs,
    metadata: {
      requestId: response.json.request_id ?? response.json.requestId,
      model: options.model,
      outputKind: payload.kind,
    },
  });
}

async function callReplicate(provider, key, options) {
  const parsed = replicateModelEndpoint(options.model);
  const size = parseSize(options.size);
  const input = compactObject({
    prompt: options.prompt,
    width: size?.width,
    height: size?.height,
    aspect_ratio: options.aspectRatio,
    output_format: options.format,
    negative_prompt: options.negativePrompt,
    seed: numericString(options.seed),
  });
  const body = parsed.version ? { version: parsed.version, input } : { input };
  const response = await fetchJson(parsed.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify(body),
    timeoutMs: options.timeoutMs,
  });
  const prediction = await settleReplicatePrediction(response.json, key, options.timeoutMs);
  const payload = extractImagePayload(prediction);
  return materializeExtractedPayload(payload, {
    provider,
    timeoutMs: options.timeoutMs,
    metadata: {
      predictionId: prediction.id,
      status: prediction.status,
      model: prediction.model ?? options.model,
      metrics: prediction.metrics,
      outputKind: payload.kind,
    },
  });
}

async function callStability(provider, key, options) {
  const form = new FormData();
  form.set("prompt", options.prompt);
  form.set("output_format", stabilityFormat(options.format));
  const aspectRatio = options.aspectRatio ?? aspectRatioFromSize(options.size);
  if (aspectRatio) form.set("aspect_ratio", aspectRatio);
  if (options.negativePrompt) form.set("negative_prompt", String(options.negativePrompt));
  if (options.seed) form.set("seed", String(options.seed));
  const endpoint = stabilityEndpoint(options.model);
  if (endpoint.modelParameter) form.set("model", endpoint.modelParameter);
  const response = await fetchWithTimeout(endpoint.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "image/*",
    },
    body: form,
    timeoutMs: options.timeoutMs,
  });
  if (!response.ok) throw new Error(await providerError("Stability AI", response));
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.startsWith("image/")) {
    return {
      image: Buffer.from(await response.arrayBuffer()),
      mimeType: contentType.split(";")[0],
      metadata: { model: options.model, endpoint: endpoint.kind, outputKind: "image-response" },
    };
  }
  const json = await response.json();
  const payload = extractImagePayload(json);
  return materializeExtractedPayload(payload, {
    provider,
    timeoutMs: options.timeoutMs,
    metadata: { model: options.model, endpoint: endpoint.kind, outputKind: payload.kind },
  });
}

async function callIdeogram(provider, key, options) {
  const form = new FormData();
  form.set("text_prompt", options.prompt);
  const resolution = ideogramResolution(options.size);
  if (resolution) form.set("resolution", resolution);
  if (options.quality) form.set("rendering_speed", String(options.quality).toUpperCase());
  const response = await fetchJson("https://api.ideogram.ai/v1/ideogram-v4/generate", {
    method: "POST",
    headers: {
      "Api-Key": key,
    },
    body: form,
    timeoutMs: options.timeoutMs,
  });
  const payload = extractImagePayload(response.json);
  return materializeExtractedPayload(payload, {
    provider,
    timeoutMs: options.timeoutMs,
    metadata: {
      created: response.json.created,
      responseType: response.json.response_type,
      outputKind: payload.kind,
    },
  });
}

async function materializeExtractedPayload(payload, input) {
  if (payload.kind === "base64") {
    return {
      image: Buffer.from(payload.data, "base64"),
      mimeType: payload.mimeType,
      metadata: input.metadata,
    };
  }
  if (payload.kind === "url") {
    const downloaded = await downloadUrl(payload.url, input.timeoutMs);
    return {
      image: downloaded.image,
      mimeType: downloaded.mimeType,
      metadata: {
        ...input.metadata,
        downloadedFromHost: safeUrlHost(payload.url),
      },
    };
  }
  throw new Error(`Provider ${input.provider.label} did not return a supported image payload.`);
}

function extractImagePayload(value) {
  const direct = extractImagePayloadDirect(value);
  if (direct) return direct;
  throw new Error("Provider response did not include image bytes or a downloadable image URL.");
}

function extractImagePayloadDirect(value, seen = new Set()) {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) return { kind: "url", url: value };
    const dataUrl = value.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (dataUrl) return { kind: "base64", mimeType: dataUrl[1], data: dataUrl[2] };
    if (looksLikeBase64Image(value)) return { kind: "base64", mimeType: "image/png", data: value };
    return undefined;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);
  if (typeof value.b64_json === "string") return { kind: "base64", mimeType: value.mime_type ?? value.mimeType ?? "image/png", data: value.b64_json };
  if (typeof value.b64Json === "string") return { kind: "base64", mimeType: value.mime_type ?? value.mimeType ?? "image/png", data: value.b64Json };
  if (typeof value.base64 === "string") return { kind: "base64", mimeType: value.mime_type ?? value.mimeType ?? "image/png", data: value.base64 };
  if (value.inlineData && typeof value.inlineData.data === "string") return { kind: "base64", mimeType: value.inlineData.mimeType ?? "image/png", data: value.inlineData.data };
  if (value.inline_data && typeof value.inline_data.data === "string") return { kind: "base64", mimeType: value.inline_data.mime_type ?? "image/png", data: value.inline_data.data };
  if (typeof value.url === "string" && /^https?:\/\//i.test(value.url)) return { kind: "url", url: value.url };
  for (const key of ["data", "images", "output", "artifacts", "candidates", "parts", "content", "result"]) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = extractImagePayloadDirect(item, seen);
        if (found) return found;
      }
    } else {
      const found = extractImagePayloadDirect(nested, seen);
      if (found) return found;
    }
  }
  return undefined;
}

async function fetchJson(url, init) {
  const response = await fetchWithTimeout(url, init);
  if (!response.ok) throw new Error(await providerError(safeUrlHost(url), response));
  const text = await response.text();
  try {
    return { json: JSON.parse(text) };
  } catch {
    throw new Error(`Provider ${safeUrlHost(url)} returned non-JSON response: ${truncateText(text, maxErrorChars)}`);
  }
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? defaultTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadUrl(url, timeoutMs) {
  if (!/^https?:\/\//i.test(url)) throw new Error("Only http(s) image URLs can be downloaded.");
  const response = await fetchWithTimeout(url, { method: "GET", timeoutMs });
  if (!response.ok) throw new Error(await providerError(safeUrlHost(url), response));
  return {
    image: Buffer.from(await response.arrayBuffer()),
    mimeType: (response.headers.get("content-type") ?? "image/png").split(";")[0],
  };
}

async function providerError(label, response) {
  let text = "";
  try {
    text = await response.text();
  } catch {
    text = "";
  }
  return `${label} request failed with HTTP ${response.status}${text ? `: ${truncateText(text, maxErrorChars)}` : ""}`;
}

async function settleReplicatePrediction(prediction, key, timeoutMs) {
  const deadline = Date.now() + Math.min(timeoutMs, 180_000);
  let current = prediction;
  while (current && ["starting", "processing", "queued"].includes(current.status) && current.urls?.get && Date.now() < deadline) {
    await sleep(2_000);
    const next = await fetchJson(current.urls.get, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      timeoutMs: Math.max(5_000, deadline - Date.now()),
    });
    current = next.json;
  }
  if (current?.error) throw new Error(`Replicate prediction failed: ${truncateText(String(current.error), maxErrorChars)}`);
  return current;
}

function fakeImagePayload(provider, model, format, options) {
  const size = parseSize(options.size) ?? { width: 2, height: 2 };
  const width = Math.max(1, Math.min(size.width, 32));
  const height = Math.max(1, Math.min(size.height, 32));
  const image = createSolidPng(width, height, [38, 119, 171, 255]);
  return {
    image,
    mimeType: "image/png",
    metadata: {
      mode: "fake",
      provider: provider.id,
      requestedFormat: format,
      model,
    },
  };
}

function createSolidPng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgba).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function imageMetadata(buffer, mimeType, dimensions) {
  return {
    mimeType,
    bytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
  };
}

function imageDimensions(buffer, mimeType) {
  if (mimeType === "image/png" && buffer.length >= 24 && buffer.toString("ascii", 12, 16) === "IHDR") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if ((mimeType === "image/jpeg" || mimeType === "image/jpg") && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  if (mimeType === "image/webp" && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X" && buffer.length >= 30) {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
  }
  return undefined;
}

function resolveProvider(value) {
  const key = String(value).trim().toLowerCase();
  const provider = providerAliases.get(key);
  if (!provider) throw new Error(`Unknown hosted image provider "${value}". Run hosted_image_doctor --json for supported providers.`);
  return provider;
}

function configuredEnvName(provider) {
  return provider.envNames.find((name) => typeof process.env[name] === "string" && process.env[name].trim().length > 0);
}

function requiredApiKey(provider) {
  const name = configuredEnvName(provider);
  if (!name) throw new Error(`Provider ${provider.label} requires one configured env: ${provider.envNames.join(" or ")}. Use Ambient-managed secret binding; do not paste the key in chat.`);
  return process.env[name].trim();
}

function parseArgs(argv) {
  const options = { command: argv[0] && !argv[0].startsWith("-") ? argv[0] : "help" };
  const rest = options.command === "help" ? argv : argv.slice(1);
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith("--")) {
      options._ = [...(options._ ?? []), arg];
      continue;
    }
    const withoutPrefix = arg.slice(2);
    const equalIndex = withoutPrefix.indexOf("=");
    const rawKey = equalIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, equalIndex);
    const key = camelCase(rawKey);
    if (equalIndex !== -1) {
      options[key] = withoutPrefix.slice(equalIndex + 1);
      continue;
    }
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }
  if (options.help) options.command = "help";
  return options;
}

function readPrompt(options) {
  if (options.promptFile) {
    const promptPath = ensureInsideWorkspace(resolve(workspaceRoot(), String(options.promptFile)));
    return readFileSync(promptPath, "utf8").trim();
  }
  if (options.prompt) return String(options.prompt).trim();
  const positional = options._?.join(" ").trim();
  if (positional) return positional;
  throw new Error("Image prompt is required. Pass --prompt <text> or --prompt-file <path>.");
}

function resolveOutputPath(output, provider, format) {
  const workspace = workspaceRoot();
  const extension = extensionForFormat(format);
  const relativePath = output
    ? String(output)
    : join(".ambient", "hosted-images", `${provider.id}-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`);
  const resolved = isAbsolute(relativePath) ? resolve(relativePath) : resolve(workspace, relativePath);
  return ensureInsideWorkspace(resolved);
}

function metadataPathFor(outputPath) {
  return `${outputPath}.json`;
}

function ensureInsideWorkspace(path) {
  const workspace = workspaceRoot();
  const relativePath = relative(workspace, path);
  if (relativePath === "" || (!relativePath.startsWith("..") && !relativePath.includes(`..${sep}`) && !isAbsolute(relativePath))) return path;
  throw new Error(`Path must stay inside the workspace: ${path}`);
}

function workspaceRoot() {
  return resolve(process.env.AMBIENT_WORKSPACE_PATH || process.env.AMBIENT_DESKTOP_WORKSPACE || process.cwd());
}

function artifactContract() {
  return {
    generatedImage: "Workspace image file containing the provider output bytes.",
    metadata: "Sibling JSON file with provider/model/request metadata, dimensions, byte size, SHA-256, and secret env names only.",
    transcript: "Bounded JSON summary; large image bytes are never printed to stdout.",
  };
}

function compactObject(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== "" && value !== null));
}

function parseSize(value) {
  if (!value) return undefined;
  const match = String(value).trim().match(/^(\d{1,5})x(\d{1,5})$/i);
  if (!match) return undefined;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function aspectRatioFromSize(value) {
  const size = parseSize(value);
  if (!size) return undefined;
  const divisor = gcd(size.width, size.height);
  return `${size.width / divisor}:${size.height / divisor}`;
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function falImageSize(size, aspectRatio) {
  if (aspectRatio) return falAspectAlias(aspectRatio);
  if (!size) return undefined;
  const ratio = aspectRatioFromSize(size);
  return ratio ? falAspectAlias(ratio) : size;
}

function falAspectAlias(ratio) {
  if (ratio === "1:1") return "square_hd";
  if (ratio === "16:9") return "landscape_16_9";
  if (ratio === "9:16") return "portrait_16_9";
  if (ratio === "4:3") return "landscape_4_3";
  if (ratio === "3:4") return "portrait_4_3";
  return ratio;
}

function stabilityEndpoint(model) {
  const normalized = String(model).toLowerCase();
  if (normalized.includes("core")) {
    return { kind: "core", url: "https://api.stability.ai/v2beta/stable-image/generate/core" };
  }
  if (normalized.includes("ultra")) {
    return { kind: "ultra", url: "https://api.stability.ai/v2beta/stable-image/generate/ultra" };
  }
  return {
    kind: "sd3",
    url: "https://api.stability.ai/v2beta/stable-image/generate/sd3",
    modelParameter: String(model).replace(/^stability\//, ""),
  };
}

function replicateModelEndpoint(model) {
  const value = String(model);
  const [ownerAndName, version] = value.includes(":") ? value.split(":", 2) : [value, undefined];
  if (version) {
    return {
      endpoint: "https://api.replicate.com/v1/predictions",
      version,
    };
  }
  const parts = ownerAndName.split("/");
  if (parts.length !== 2 || parts.some((part) => !part)) throw new Error("Replicate --model must be owner/name or owner/name:version.");
  return {
    endpoint: `https://api.replicate.com/v1/models/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/predictions`,
  };
}

function ideogramResolution(size) {
  const parsed = parseSize(size);
  if (!parsed) return undefined;
  return `${parsed.width}x${parsed.height}`;
}

function stabilityFormat(format) {
  return format === "jpg" ? "jpeg" : format;
}

function normalizeFormat(value) {
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "jpg") return "jpeg";
  if (["png", "jpeg", "webp"].includes(normalized)) return normalized;
  throw new Error(`Unsupported image format "${value}". Use png, jpeg, or webp.`);
}

function mimeTypeForFormat(format) {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`;
}

function extensionForFormat(format) {
  return format === "jpeg" ? "jpg" : format;
}

function numericString(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function positiveInteger(value, name, fallback) {
  if (value === undefined || value === true || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${name} must be a positive integer.`);
  return number;
}

function stringOption(value) {
  if (value === undefined || value === null || value === true) return undefined;
  const trimmed = String(value).trim();
  return trimmed || undefined;
}

function looksLikeBase64Image(value) {
  return value.length > 80 && /^[A-Za-z0-9+/=\r\n]+$/.test(value);
}

function extractGoogleText(json) {
  const parts = json?.candidates?.[0]?.content?.parts ?? json?.parts ?? [];
  return parts.filter((part) => typeof part.text === "string").map((part) => part.text).join("\n");
}

function safeUrlHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "provider";
  }
}

function truncateText(value, maxChars) {
  const text = String(value ?? "");
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 24))}\n...[truncated ${text.length - maxChars} chars]`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function helpText() {
  return `Ambient hosted image generation

Commands:
  hosted_image_doctor --json
  hosted_image_generate --provider <openai|google|google-nano-banana-pro|fal|flux|replicate|stability|ideogram> --prompt <text> --output <path> --json

Examples:
  hosted_image_generate --provider openai --prompt "a tiny product icon" --output .ambient/hosted-images/icon.png --json
  hosted_image_generate --provider google-nano-banana-pro --prompt-file prompt.txt --dry-run --json
`;
}
