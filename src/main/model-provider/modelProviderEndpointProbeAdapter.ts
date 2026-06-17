import type {
  ModelProviderCapabilityProbeExecutionInput,
  ModelProviderCapabilityProbeExecutionResult,
  ModelProviderCapabilityProbeRunnerAdapter,
} from "./modelProviderCapabilityProbeRunner";
import type { ModelProviderEndpointCompatibility } from "../../shared/modelProviderInstallTemplates";

type EndpointProbeCompatibility = Exclude<ModelProviderEndpointCompatibility, "local-text">;
type JsonRecord = Record<string, unknown>;

export const MODEL_PROVIDER_ENDPOINT_PROBE_DEFAULT_MAX_TOKENS = 128;
export const MODEL_PROVIDER_ENDPOINT_PROBE_STRUCTURED_MAX_TOKENS = 512;
export const MODEL_PROVIDER_ENDPOINT_PROBE_SCHEMA_MAX_TOKENS = 2048;

export interface ModelProviderEndpointProbeAdapterConfig {
  adapterId?: string;
  compatibility: EndpointProbeCompatibility;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  anthropicVersion?: string;
  reliabilitySampleCount?: number;
}

export function createModelProviderEndpointProbeAdapter(config: ModelProviderEndpointProbeAdapterConfig): ModelProviderCapabilityProbeRunnerAdapter {
  return {
    adapterId: config.adapterId ?? `endpoint:${config.compatibility}`,
    runCapabilityProbe(input) {
      return runEndpointCapabilityProbe(config, input);
    },
  };
}

async function runEndpointCapabilityProbe(
  config: ModelProviderEndpointProbeAdapterConfig,
  input: ModelProviderCapabilityProbeExecutionInput,
): Promise<ModelProviderCapabilityProbeExecutionResult> {
  const validation = validateEndpointProbeConfig(config, input);
  if (validation) return { status: "failed", error: validation };

  switch (input.probeId) {
    case "health":
      return probeHealth(config);
    case "context_window":
      return probeContextWindow(config);
    case "streaming":
      return probeStreaming(config);
    case "structured_json":
      return probeStructuredJson(config);
    case "schema_output":
      return config.compatibility === "anthropic-compatible"
        ? probeAnthropicSchemaOutput(config)
        : probeOpenAiSchemaOutput(config);
    case "tool_use":
      return probeToolUse(config);
    case "image_input":
      return probeImageInput(config);
    case "latency":
      return probeLatency(config);
    case "error_shape":
      return probeErrorShape(config);
    case "reliability":
      return probeReliability(config);
    case "local_memory":
      return { status: "skipped", evidence: "Endpoint providers do not expose local memory evidence." };
    default:
      return { status: "unknown", evidence: `No endpoint probe implementation for ${input.probeId}.` };
  }
}

function validateEndpointProbeConfig(config: ModelProviderEndpointProbeAdapterConfig, input: ModelProviderCapabilityProbeExecutionInput): string | undefined {
  if (input.plan.compatibility !== config.compatibility) {
    return `Probe plan compatibility ${input.plan.compatibility} does not match endpoint adapter ${config.compatibility}.`;
  }
  if (input.plan.modelId !== config.modelId) {
    return `Probe plan model ${input.plan.modelId} does not match endpoint adapter model ${config.modelId}.`;
  }
  if (!config.baseUrl.trim()) return "Endpoint base URL is required before probing.";
  if (!config.apiKey.trim()) return "Ambient-managed secret is required before probing this endpoint.";
  return undefined;
}

async function probeHealth(config: ModelProviderEndpointProbeAdapterConfig): Promise<ModelProviderCapabilityProbeExecutionResult> {
  const response = await endpointFetch(config, "models", { method: "GET" });
  if (!response.ok) return failedHttp("health", response, await boundedResponseText(response));
  return { status: "passed", evidence: `Model catalog endpoint responded with HTTP ${response.status}.` };
}

async function probeContextWindow(config: ModelProviderEndpointProbeAdapterConfig): Promise<ModelProviderCapabilityProbeExecutionResult> {
  const response = await endpointFetch(config, "models", { method: "GET" });
  if (!response.ok) return failedHttp("context_window", response, await boundedResponseText(response));
  const data = await responseJson(response);
  const model = modelMetadata(data, config.modelId);
  const contextWindowTokens = contextWindowFromMetadata(model);
  if (!contextWindowTokens) {
    return {
      status: "unknown",
      evidence: model
        ? "Endpoint listed the model but did not expose context window metadata."
        : "Endpoint model catalog did not include the requested model.",
    };
  }
  return {
    status: "passed",
    value: { contextWindowTokens },
    evidence: `Endpoint reported ${contextWindowTokens.toLocaleString("en-US")} context tokens.`,
  };
}

async function probeStreaming(config: ModelProviderEndpointProbeAdapterConfig): Promise<ModelProviderCapabilityProbeExecutionResult> {
  const response = await endpointFetch(config, completionPath(config), {
    method: "POST",
    body: JSON.stringify(completionBody(config, { stream: true })),
  });
  if (!response.ok) return failedHttp("streaming", response, await boundedResponseText(response));
  const text = await boundedResponseText(response);
  const contentType = response.headers.get("content-type") ?? "";
  return /(?:^|\n)\s*(?:event|data):/i.test(text) || contentType.includes("text/event-stream")
    ? { status: "passed", evidence: "Endpoint returned an event-stream style streaming response." }
    : { status: "unknown", evidence: "Endpoint accepted stream=true but did not return observable event-stream framing." };
}

async function probeStructuredJson(config: ModelProviderEndpointProbeAdapterConfig): Promise<ModelProviderCapabilityProbeExecutionResult> {
  const response = await endpointFetch(config, completionPath(config), {
    method: "POST",
    body: JSON.stringify(completionBody(config, { jsonMode: true })),
  });
  if (!response.ok) return failedHttp("structured_json", response, await boundedResponseText(response));
  const content = assistantText(await responseJson(response), config.compatibility);
  const parsed = parseJsonObject(content);
  return parsed
    ? { status: "passed", value: parsed, evidence: "Endpoint returned parseable JSON content." }
    : { status: "failed", error: "Endpoint response did not contain parseable JSON content." };
}

async function probeOpenAiSchemaOutput(config: ModelProviderEndpointProbeAdapterConfig): Promise<ModelProviderCapabilityProbeExecutionResult> {
  const response = await endpointFetch(config, "chat/completions", {
    method: "POST",
    body: JSON.stringify(completionBody(config, { jsonSchema: true })),
  });
  if (!response.ok) return failedHttp("schema_output", response, await boundedResponseText(response));
  const parsed = parseJsonObject(assistantText(await responseJson(response), config.compatibility));
  return parsed && parsed.ok === true
    ? { status: "passed", value: parsed, evidence: "Endpoint honored a schema-shaped JSON response request." }
    : { status: "failed", error: "Endpoint did not return schema-valid JSON for the schema_output probe." };
}

async function probeAnthropicSchemaOutput(config: ModelProviderEndpointProbeAdapterConfig): Promise<ModelProviderCapabilityProbeExecutionResult> {
  const response = await endpointFetch(config, "messages", {
    method: "POST",
    body: JSON.stringify(completionBody(config, { toolSchema: true })),
  });
  if (!response.ok) return failedHttp("schema_output", response, await boundedResponseText(response));
  const json = await responseJson(response);
  const toolInput = anthropicToolInput(json);
  return toolInput && toolInput.ok === true
    ? { status: "passed", value: toolInput, evidence: "Endpoint returned schema-valid tool input." }
    : { status: "failed", error: "Endpoint did not return schema-valid tool input for the schema_output probe." };
}

async function probeToolUse(config: ModelProviderEndpointProbeAdapterConfig): Promise<ModelProviderCapabilityProbeExecutionResult> {
  const response = await endpointFetch(config, completionPath(config), {
    method: "POST",
    body: JSON.stringify(completionBody(config, { toolUse: true })),
  });
  if (!response.ok) return failedHttp("tool_use", response, await boundedResponseText(response));
  const json = await responseJson(response);
  return hasToolUse(json, config.compatibility)
    ? { status: "passed", evidence: "Endpoint returned a tool-use call shape." }
    : { status: "failed", error: "Endpoint response did not include a tool-use call shape." };
}

async function probeImageInput(config: ModelProviderEndpointProbeAdapterConfig): Promise<ModelProviderCapabilityProbeExecutionResult> {
  const response = await endpointFetch(config, completionPath(config), {
    method: "POST",
    body: JSON.stringify(completionBody(config, { imageInput: true })),
  });
  if (!response.ok) return failedHttp("image_input", response, await boundedResponseText(response));
  return { status: "passed", evidence: "Endpoint accepted a tiny image input request." };
}

async function probeLatency(config: ModelProviderEndpointProbeAdapterConfig): Promise<ModelProviderCapabilityProbeExecutionResult> {
  const response = await endpointFetch(config, completionPath(config), {
    method: "POST",
    body: JSON.stringify(completionBody(config)),
  });
  if (!response.ok) return failedHttp("latency", response, await boundedResponseText(response));
  return { status: "passed", evidence: `Completion endpoint responded with HTTP ${response.status}.` };
}

async function probeErrorShape(config: ModelProviderEndpointProbeAdapterConfig): Promise<ModelProviderCapabilityProbeExecutionResult> {
  const invalidModelConfig = { ...config, modelId: `${config.modelId}-ambient-probe-missing-model` };
  const response = await endpointFetch(invalidModelConfig, completionPath(config), {
    method: "POST",
    body: JSON.stringify(completionBody(invalidModelConfig)),
  });
  const text = await boundedResponseText(response);
  if (response.ok) return { status: "failed", error: "Endpoint accepted an intentionally invalid model id." };
  const parsed = parseJsonObject(text);
  return parsed && parsed.error
    ? { status: "passed", evidence: `Endpoint returned structured error shape with HTTP ${response.status}.` }
    : { status: "unknown", evidence: text || `Endpoint returned HTTP ${response.status} without a structured error body.` };
}

async function probeReliability(config: ModelProviderEndpointProbeAdapterConfig): Promise<ModelProviderCapabilityProbeExecutionResult> {
  const sampleCount = Math.max(2, Math.min(5, Math.floor(config.reliabilitySampleCount ?? 2)));
  const failures: string[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const result = await probeLatency(config);
    if (result.status !== "passed") failures.push(result.error ?? result.evidence ?? `sample ${index + 1} did not pass`);
  }
  return failures.length === 0
    ? { status: "passed", value: { sampleCount }, evidence: `${sampleCount} consecutive completion probes passed.` }
    : { status: "failed", error: failures.join(" ") };
}

async function endpointFetch(
  config: ModelProviderEndpointProbeAdapterConfig,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const timeoutMs = Math.max(1, Math.floor(config.timeoutMs ?? 15_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Endpoint capability probe timed out after ${timeoutMs.toLocaleString("en-US")}ms.`));
  }, timeoutMs);
  timeout.unref?.();
  try {
    return await (config.fetchImpl ?? fetch)(`${v1BaseUrl(config.baseUrl)}/${path.replace(/^\/+/, "")}`, {
      ...init,
      headers: {
        ...endpointHeaders(config),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function endpointHeaders(config: ModelProviderEndpointProbeAdapterConfig): HeadersInit {
  if (config.compatibility === "anthropic-compatible") {
    return {
      "x-api-key": config.apiKey,
      "anthropic-version": config.anthropicVersion ?? "2023-06-01",
      "content-type": "application/json",
      accept: "application/json",
    };
  }
  return {
    authorization: `Bearer ${config.apiKey}`,
    "content-type": "application/json",
    accept: "application/json",
  };
}

function completionPath(config: ModelProviderEndpointProbeAdapterConfig): string {
  return config.compatibility === "anthropic-compatible" ? "messages" : "chat/completions";
}

function completionBody(
  config: ModelProviderEndpointProbeAdapterConfig,
  mode: {
    stream?: boolean;
    jsonMode?: boolean;
    jsonSchema?: boolean;
    toolSchema?: boolean;
    toolUse?: boolean;
    imageInput?: boolean;
  } = {},
): JsonRecord {
  if (config.compatibility === "anthropic-compatible") {
    const body: JsonRecord = {
      model: config.modelId,
      max_tokens: maxTokensForEndpointProbeMode(mode),
      stream: mode.stream === true,
      messages: [{
        role: "user",
        content: mode.imageInput
          ? [
              { type: "text", text: "Reply with OK if you can inspect this image." },
              { type: "image", source: { type: "base64", media_type: "image/png", data: tinyPngBase64() } },
            ]
          : "Reply with OK.",
      }],
    };
    if (mode.jsonMode) {
      body.messages = [{ role: "user", content: "Return only JSON: {\"ok\": true}." }];
    }
    if (mode.toolUse || mode.toolSchema) {
      body.tools = [{
        name: "ambient_probe",
        description: "Return endpoint capability probe status.",
        input_schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
      }];
      body.tool_choice = { type: "tool", name: "ambient_probe" };
    }
    return body;
  }

  const body: JsonRecord = {
    model: config.modelId,
    max_tokens: maxTokensForEndpointProbeMode(mode),
    stream: mode.stream === true,
    messages: [{
      role: "user",
      content: mode.imageInput
        ? [
            { type: "text", text: "Reply with OK if you can inspect this image." },
            { type: "image_url", image_url: { url: `data:image/png;base64,${tinyPngBase64()}` } },
          ]
        : "Reply with OK.",
    }],
  };
  if (mode.jsonMode) {
    body.response_format = { type: "json_object" };
    body.messages = [{ role: "user", content: "Return only JSON: {\"ok\": true}." }];
  }
  if (mode.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "ambient_probe",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false,
        },
        strict: true,
      },
    };
    body.messages = [{ role: "user", content: "Return {\"ok\": true}." }];
  }
  if (mode.toolUse) {
    body.tools = [{
      type: "function",
      function: {
        name: "ambient_probe",
        description: "Return endpoint capability probe status.",
        parameters: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
      },
    }];
    body.tool_choice = { type: "function", function: { name: "ambient_probe" } };
  }
  return body;
}

function maxTokensForEndpointProbeMode(mode: {
  jsonMode?: boolean;
  jsonSchema?: boolean;
  toolSchema?: boolean;
  toolUse?: boolean;
}): number {
  if (mode.jsonSchema) return MODEL_PROVIDER_ENDPOINT_PROBE_SCHEMA_MAX_TOKENS;
  if (mode.jsonMode || mode.toolSchema || mode.toolUse) return MODEL_PROVIDER_ENDPOINT_PROBE_STRUCTURED_MAX_TOKENS;
  return MODEL_PROVIDER_ENDPOINT_PROBE_DEFAULT_MAX_TOKENS;
}

function assistantText(json: unknown, compatibility: EndpointProbeCompatibility): string | undefined {
  if (!isRecord(json)) return undefined;
  if (compatibility === "anthropic-compatible") {
    const content = Array.isArray(json.content) ? json.content : [];
    const textBlock = content.find((block) => isRecord(block) && block.type === "text" && typeof block.text === "string");
    return isRecord(textBlock) ? textBlock.text as string : undefined;
  }
  const choice = Array.isArray(json.choices) ? json.choices[0] : undefined;
  const message = isRecord(choice) && isRecord(choice.message) ? choice.message : undefined;
  return typeof message?.content === "string" ? message.content : undefined;
}

function anthropicToolInput(json: unknown): JsonRecord | undefined {
  if (!isRecord(json) || !Array.isArray(json.content)) return undefined;
  const toolUse = json.content.find((block) => isRecord(block) && block.type === "tool_use" && isRecord(block.input));
  return isRecord(toolUse) && isRecord(toolUse.input) ? toolUse.input : undefined;
}

function hasToolUse(json: unknown, compatibility: EndpointProbeCompatibility): boolean {
  if (compatibility === "anthropic-compatible") return Boolean(anthropicToolInput(json));
  if (!isRecord(json)) return false;
  const choice = Array.isArray(json.choices) ? json.choices[0] : undefined;
  const message = isRecord(choice) && isRecord(choice.message) ? choice.message : undefined;
  return Array.isArray(message?.tool_calls) && message.tool_calls.length > 0;
}

function modelMetadata(json: unknown, modelId: string): JsonRecord | undefined {
  if (!isRecord(json) || !Array.isArray(json.data)) return undefined;
  return json.data.find((candidate) => isRecord(candidate) && candidate.id === modelId) as JsonRecord | undefined;
}

function contextWindowFromMetadata(model: JsonRecord | undefined): number | undefined {
  if (!model) return undefined;
  for (const key of ["context_window", "context_length", "max_context_length", "input_token_limit", "max_model_len"]) {
    const value = model[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  }
  if (isRecord(model.metadata)) return contextWindowFromMetadata(model.metadata);
  return undefined;
}

async function responseJson(response: Response): Promise<unknown> {
  return parseJsonObject(await boundedResponseText(response));
}

async function boundedResponseText(response: Response): Promise<string> {
  const text = await response.text();
  return text.length > 4000 ? `${text.slice(0, 4000)}... [truncated]` : text;
}

function parseJsonObject(text: string | undefined): JsonRecord | undefined {
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function failedHttp(probeName: string, response: Response, body: string): ModelProviderCapabilityProbeExecutionResult {
  return {
    status: "failed",
    error: body
      ? `${probeName} probe received HTTP ${response.status}: ${body}`
      : `${probeName} probe received HTTP ${response.status}.`,
  };
}

function v1BaseUrl(baseUrl: string): string {
  const root = baseUrl.trim().replace(/\/+$/, "");
  return root.endsWith("/v1") ? root : `${root}/v1`;
}

function tinyPngBase64(): string {
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object";
}
