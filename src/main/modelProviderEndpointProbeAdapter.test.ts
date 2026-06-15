import { describe, expect, it } from "vitest";
import { buildModelProviderCapabilityProbePlan, modelProviderInstallTemplateById } from "../shared/modelProviderInstallTemplates";
import { runModelProviderCapabilityProbePlan } from "./modelProviderCapabilityProbeRunner";
import {
  MODEL_PROVIDER_ENDPOINT_PROBE_DEFAULT_MAX_TOKENS,
  MODEL_PROVIDER_ENDPOINT_PROBE_SCHEMA_MAX_TOKENS,
  MODEL_PROVIDER_ENDPOINT_PROBE_STRUCTURED_MAX_TOKENS,
  createModelProviderEndpointProbeAdapter,
} from "./modelProviderEndpointProbeAdapter";

describe("createModelProviderEndpointProbeAdapter", () => {
  it("probes OpenAI-compatible endpoint capabilities through real HTTP request shapes", async () => {
    const calls: Array<{ url: string; init: RequestInit; body: Record<string, unknown> | undefined }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      calls.push({ url: String(url), init: init ?? {}, body });
      if (String(url).endsWith("/v1/models")) {
        return jsonResponse({ data: [{ id: "custom/tool-model", context_window: 128_000 }] });
      }
      if (body?.model === "custom/tool-model-ambient-probe-missing-model") {
        return jsonResponse({ error: { message: "model not found", type: "invalid_request_error" } }, { status: 404 });
      }
      if (body?.stream === true) {
        return new Response("data: {\"choices\":[{\"delta\":{\"content\":\"OK\"}}]}\n\ndata: [DONE]\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }
      if (body?.tools) {
        return jsonResponse({
          choices: [{
            finish_reason: "tool_calls",
            message: { tool_calls: [{ id: "tool-1", type: "function", function: { name: "ambient_probe", arguments: "{\"ok\":true}" } }] },
          }],
        });
      }
      if (body?.response_format) {
        return jsonResponse({ choices: [{ message: { content: "{\"ok\":true}" } }] });
      }
      return jsonResponse({ choices: [{ message: { content: "OK" } }] });
    };

    const template = requiredTemplate("generic-openai-compatible");
    const plan = buildModelProviderCapabilityProbePlan({
      template,
      providerId: "customer-router",
      modelId: "custom/tool-model",
      generatedAt: "2026-06-06T00:00:00.000Z",
    });
    const report = await runModelProviderCapabilityProbePlan({
      plan,
      adapter: createModelProviderEndpointProbeAdapter({
        compatibility: "openai-compatible",
        baseUrl: "https://provider.example",
        modelId: "custom/tool-model",
        apiKey: "sk-test-secret-value",
        fetchImpl,
      }),
      generatedAt: "2026-06-06T01:00:00.000Z",
      measuredAt: "2026-06-06T01:00:01.000Z",
    });

    expect(report.observations.map((observation) => [observation.probeId, observation.status])).toEqual([
      ["streaming", "passed"],
      ["context_window", "passed"],
      ["structured_json", "passed"],
      ["schema_output", "passed"],
      ["tool_use", "passed"],
      ["image_input", "passed"],
      ["latency", "passed"],
      ["error_shape", "passed"],
      ["reliability", "passed"],
    ]);
    expect(report.observations).toContainEqual(expect.objectContaining({
      probeId: "context_window",
      value: { contextWindowTokens: 128_000 },
    }));
    expect(calls[0]).toMatchObject({
      url: "https://provider.example/v1/chat/completions",
      init: { method: "POST" },
    });
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer sk-test-secret-value");
    expect(calls.some((call) => call.url === "https://provider.example/v1/models")).toBe(true);
    const jsonModeCall = calls.find((call) => responseFormatType(call.body) === "json_object");
    const schemaCall = calls.find((call) => responseFormatType(call.body) === "json_schema");
    const toolCall = calls.find((call) => Array.isArray(call.body?.tools));
    const defaultCompletionCall = calls.find((call) =>
      call.body?.stream === false &&
      !call.body?.response_format &&
      !call.body?.tools &&
      firstMessageContent(call.body) === "Reply with OK."
    );
    expect(defaultCompletionCall?.body?.max_tokens).toBe(MODEL_PROVIDER_ENDPOINT_PROBE_DEFAULT_MAX_TOKENS);
    expect(jsonModeCall?.body?.max_tokens).toBe(MODEL_PROVIDER_ENDPOINT_PROBE_STRUCTURED_MAX_TOKENS);
    expect(toolCall?.body?.max_tokens).toBe(MODEL_PROVIDER_ENDPOINT_PROBE_STRUCTURED_MAX_TOKENS);
    expect(schemaCall?.body?.max_tokens).toBe(MODEL_PROVIDER_ENDPOINT_PROBE_SCHEMA_MAX_TOKENS);
    expect(JSON.stringify(report)).not.toContain("sk-test-secret-value");
  });

  it("returns unknown context-window evidence when model metadata does not expose limits", async () => {
    const template = requiredTemplate("generic-openai-compatible");
    const plan = buildModelProviderCapabilityProbePlan({
      template,
      providerId: "customer-router",
      modelId: "custom/no-context",
      generatedAt: "2026-06-06T00:00:00.000Z",
      extraProbeIds: ["context_window"],
    });

    const report = await runModelProviderCapabilityProbePlan({
      plan: { ...plan, probeIds: ["context_window"] },
      adapter: createModelProviderEndpointProbeAdapter({
        compatibility: "openai-compatible",
        baseUrl: "https://provider.example/v1",
        modelId: "custom/no-context",
        apiKey: "sk-test-secret-value",
        fetchImpl: async () => jsonResponse({ data: [{ id: "custom/no-context" }] }),
      }),
      generatedAt: "2026-06-06T01:10:00.000Z",
      measuredAt: "2026-06-06T01:10:01.000Z",
    });

    expect(report.observations).toEqual([
      expect.objectContaining({
        probeId: "context_window",
        status: "unknown",
        evidence: "Endpoint listed the model but did not expose context window metadata.",
      }),
    ]);
  });

  it("probes Anthropic-compatible messages, streaming, tool use, and schema output", async () => {
    const calls: Array<{ url: string; init: RequestInit; body: Record<string, unknown> | undefined }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      calls.push({ url: String(url), init: init ?? {}, body });
      if (String(url).endsWith("/v1/models")) {
        return jsonResponse({ data: [{ id: "claude-router", metadata: { context_window: 200_000 } }] });
      }
      if (body?.model === "claude-router-ambient-probe-missing-model") {
        return jsonResponse({ error: { type: "not_found_error", message: "missing model" } }, { status: 404 });
      }
      if (body?.stream === true) {
        return new Response("event: message_start\ndata: {\"type\":\"message_start\"}\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }
      if (body?.tools) {
        return jsonResponse({ content: [{ type: "tool_use", id: "tool-1", name: "ambient_probe", input: { ok: true } }] });
      }
      if (Array.isArray((body?.messages as Array<Record<string, unknown>> | undefined)?.[0]?.content)) {
        return jsonResponse({ content: [{ type: "text", text: "OK" }] });
      }
      return jsonResponse({ content: [{ type: "text", text: "{\"ok\":true}" }] });
    };

    const template = requiredTemplate("generic-anthropic-compatible");
    const plan = buildModelProviderCapabilityProbePlan({
      template,
      providerId: "customer-anthropic-router",
      modelId: "claude-router",
      generatedAt: "2026-06-06T00:00:00.000Z",
      extraProbeIds: ["schema_output"],
    });
    const report = await runModelProviderCapabilityProbePlan({
      plan,
      adapter: createModelProviderEndpointProbeAdapter({
        compatibility: "anthropic-compatible",
        baseUrl: "https://anthropic-router.example",
        modelId: "claude-router",
        apiKey: "sk-ant-test-secret-value",
        anthropicVersion: "2023-06-01",
        fetchImpl,
      }),
      generatedAt: "2026-06-06T01:20:00.000Z",
      measuredAt: "2026-06-06T01:20:01.000Z",
    });

    expect(report.observations.map((observation) => [observation.probeId, observation.status])).toEqual([
      ["streaming", "passed"],
      ["context_window", "passed"],
      ["structured_json", "passed"],
      ["tool_use", "passed"],
      ["image_input", "passed"],
      ["latency", "passed"],
      ["error_shape", "passed"],
      ["reliability", "passed"],
      ["schema_output", "passed"],
    ]);
    const messageCall = calls.find((call) => call.url === "https://anthropic-router.example/v1/messages");
    expect(messageCall?.init.headers).toMatchObject({
      "x-api-key": "sk-ant-test-secret-value",
      "anthropic-version": "2023-06-01",
    });
    expect(JSON.stringify(report)).not.toContain("sk-ant-test-secret-value");
  });

  it("fails safely when the endpoint adapter does not match the probe plan", async () => {
    const template = requiredTemplate("generic-openai-compatible");
    const plan = buildModelProviderCapabilityProbePlan({
      template,
      providerId: "customer-router",
      modelId: "custom/tool-model",
      generatedAt: "2026-06-06T00:00:00.000Z",
      extraProbeIds: ["health"],
    });
    const report = await runModelProviderCapabilityProbePlan({
      plan: { ...plan, probeIds: ["health"] },
      adapter: createModelProviderEndpointProbeAdapter({
        compatibility: "anthropic-compatible",
        baseUrl: "https://provider.example",
        modelId: "different-model",
        apiKey: "sk-test-secret-value",
        fetchImpl: async () => jsonResponse({}),
      }),
      generatedAt: "2026-06-06T01:30:00.000Z",
      measuredAt: "2026-06-06T01:30:01.000Z",
    });

    expect(report.observations).toEqual([
      expect.objectContaining({
        probeId: "health",
        status: "failed",
        error: "Probe plan compatibility openai-compatible does not match endpoint adapter anthropic-compatible.",
      }),
    ]);
  });

  it("requires Ambient-managed secret material before endpoint probing", async () => {
    const template = requiredTemplate("generic-openai-compatible");
    const plan = buildModelProviderCapabilityProbePlan({
      template,
      providerId: "customer-router",
      modelId: "custom/tool-model",
      generatedAt: "2026-06-06T00:00:00.000Z",
      extraProbeIds: ["health"],
    });
    const report = await runModelProviderCapabilityProbePlan({
      plan: { ...plan, probeIds: ["health"] },
      adapter: createModelProviderEndpointProbeAdapter({
        compatibility: "openai-compatible",
        baseUrl: "https://provider.example",
        modelId: "custom/tool-model",
        apiKey: "",
        fetchImpl: async () => jsonResponse({}),
      }),
      generatedAt: "2026-06-06T01:40:00.000Z",
      measuredAt: "2026-06-06T01:40:01.000Z",
    });

    expect(report.observations).toEqual([
      expect.objectContaining({
        probeId: "health",
        status: "failed",
        error: "Ambient-managed secret is required before probing this endpoint.",
      }),
    ]);
  });
});

function requiredTemplate(templateId: string) {
  const template = modelProviderInstallTemplateById(templateId);
  if (!template) throw new Error(`missing template ${templateId}`);
  return template;
}

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function responseFormatType(body: Record<string, unknown> | undefined): string | undefined {
  const responseFormat = body?.response_format;
  return isRecord(responseFormat) && typeof responseFormat.type === "string"
    ? responseFormat.type
    : undefined;
}

function firstMessageContent(body: Record<string, unknown> | undefined): unknown {
  const messages = body?.messages;
  if (!Array.isArray(messages) || !isRecord(messages[0])) return undefined;
  return messages[0].content;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
