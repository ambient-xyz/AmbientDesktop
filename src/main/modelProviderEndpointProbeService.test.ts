import { describe, expect, it } from "vitest";
import {
  modelRuntimeInstalledProviderFromEndpointProbeResult,
  runModelProviderEndpointProbeService,
} from "./modelProviderEndpointProbeService";

describe("runModelProviderEndpointProbeService", () => {
  it("orchestrates OpenAI-compatible endpoint probes into an eligibility-narrowed runtime profile", async () => {
    const calls: Array<{ url: string; init: RequestInit; body: Record<string, unknown> | undefined }> = [];
    const modelId = "CUSTOM/Router Model v2";
    const secret = "sk-service-secret-value-123456";
    const result = await runModelProviderEndpointProbeService({
      templateId: "generic-openai-compatible",
      providerId: "customer-router",
      providerLabel: "Customer Router",
      modelId,
      modelLabel: "Router Model v2",
      baseUrl: "https://provider.example",
      ambientManagedSecret: secret,
      generatedAt: "2026-06-06T00:00:00.000Z",
      measuredAt: "2026-06-06T00:00:01.000Z",
      reliabilitySampleCount: 2,
      fetchImpl: async (url, init) => {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
        calls.push({ url: String(url), init: init ?? {}, body });
        if (String(url).endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: modelId, context_window: 128_000 }] });
        }
        if (body?.model === `${modelId}-ambient-probe-missing-model`) {
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
      },
    });

    expect(result).toMatchObject({
      schemaVersion: "ambient-model-provider-endpoint-probe-service-v1",
      templateId: "generic-openai-compatible",
      provider: {
        id: "customer-router",
        label: "Customer Router",
        secretRequirement: "user-secret",
      },
      endpoint: {
        schemaVersion: "ambient-model-runtime-installed-provider-endpoint-v1",
        compatibility: "openai-compatible",
        baseUrl: "https://provider.example",
      },
      eligibility: {
        eligibleAsMain: true,
        eligibleAsSubagent: true,
        mainBlockers: [],
        subagentBlockers: [],
      },
    });
    expect(result.probePlan).toMatchObject({
      providerId: "customer-router",
      modelId,
      compatibility: "openai-compatible",
    });
    expect(result.candidateProfile).toMatchObject({
      profileId: `customer-router:${modelId}`,
      providerId: "customer-router",
      modelId,
      label: "Router Model v2",
      contextWindowTokens: 128_000,
      supportsStreaming: true,
      toolUse: "ambient-tools",
      structuredOutput: "schema",
      supportsVision: true,
      memoryClass: "remote",
    });
    expect(result.profile).toMatchObject({
      available: true,
      selectableAsMain: true,
      selectableAsSubagent: true,
    });
    expect(calls.some((call) => call.url === "https://provider.example/v1/models")).toBe(true);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(modelRuntimeInstalledProviderFromEndpointProbeResult({
      result,
      secretRef: {
        schemaVersion: "ambient-model-runtime-installed-provider-secret-ref-v1",
        flow: "ambient_cli_secret_request",
        configured: true,
        label: "Desktop secret request",
      },
    })).toMatchObject({
      schemaVersion: "ambient-model-runtime-installed-provider-v1",
      source: "settings-provider-onboarding",
      templateId: "generic-openai-compatible",
      enabled: true,
      provider: expect.objectContaining({ id: "customer-router" }),
      profile: expect.objectContaining({ modelId }),
      endpoint: expect.objectContaining({
        compatibility: "openai-compatible",
        baseUrl: "https://provider.example",
      }),
      secretRef: expect.objectContaining({
        flow: "ambient_cli_secret_request",
        configured: true,
      }),
      eligibility: expect.objectContaining({
        eligibleAsMain: true,
        eligibleAsSubagent: true,
      }),
    });
    expect(JSON.stringify(modelRuntimeInstalledProviderFromEndpointProbeResult({ result }))).not.toContain(secret);
  });

  it("keeps endpoint models ineligible when required context-window evidence is unknown", async () => {
    const result = await runModelProviderEndpointProbeService({
      templateId: "generic-openai-compatible",
      providerId: "customer-router",
      modelId: "custom/no-context",
      baseUrl: "https://provider.example/v1",
      ambientManagedSecret: "sk-service-secret-value-123456",
      generatedAt: "2026-06-06T00:10:00.000Z",
      measuredAt: "2026-06-06T00:10:01.000Z",
      reliabilitySampleCount: 2,
      fetchImpl: async (url, init) => {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
        if (String(url).endsWith("/v1/models")) return jsonResponse({ data: [{ id: "custom/no-context" }] });
        if (body?.model === "custom/no-context-ambient-probe-missing-model") {
          return jsonResponse({ error: { message: "model not found" } }, { status: 404 });
        }
        if (body?.stream === true) {
          return new Response("data: {}\n\n", {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          });
        }
        if (body?.tools) {
          return jsonResponse({
            choices: [{
              message: { tool_calls: [{ id: "tool-1", type: "function", function: { name: "ambient_probe", arguments: "{\"ok\":true}" } }] },
            }],
          });
        }
        if (body?.response_format) return jsonResponse({ choices: [{ message: { content: "{\"ok\":true}" } }] });
        return jsonResponse({ choices: [{ message: { content: "OK" } }] });
      },
    });

    expect(result.candidateProfile.contextWindowTokens).toBeUndefined();
    expect(result.eligibility.eligibleAsMain).toBe(false);
    expect(result.eligibility.eligibleAsSubagent).toBe(false);
    expect(result.eligibility.mainBlockers).toContain("Capability probe context_window is unknown.");
    expect(result.profile).toMatchObject({
      available: false,
      selectableAsMain: false,
      selectableAsSubagent: false,
      unavailableReason: "Capability probe context_window is unknown.",
    });
  });

  it("orchestrates Anthropic-compatible schema probes when the install flow requests them", async () => {
    const modelId = "claude-router";
    const result = await runModelProviderEndpointProbeService({
      templateId: "generic-anthropic-compatible",
      providerId: "customer-anthropic-router",
      modelId,
      baseUrl: "https://anthropic-router.example",
      ambientManagedSecret: "sk-ant-service-secret-value-123456",
      generatedAt: "2026-06-06T00:20:00.000Z",
      measuredAt: "2026-06-06T00:20:01.000Z",
      extraProbeIds: ["schema_output"],
      reliabilitySampleCount: 2,
      fetchImpl: async (url, init) => {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
        if (String(url).endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: modelId, metadata: { context_window: 200_000 } }] });
        }
        if (body?.model === `${modelId}-ambient-probe-missing-model`) {
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
      },
    });

    expect(result.probePlan.probeIds).toContain("schema_output");
    expect(result.candidateProfile).toMatchObject({
      providerId: "customer-anthropic-router",
      modelId,
      contextWindowTokens: 200_000,
      supportsStreaming: true,
      toolUse: "ambient-tools",
      structuredOutput: "schema",
      supportsVision: true,
    });
    expect(result.eligibility).toMatchObject({
      eligibleAsMain: true,
      eligibleAsSubagent: true,
    });
    expect(result.endpoint).toEqual({
      schemaVersion: "ambient-model-runtime-installed-provider-endpoint-v1",
      compatibility: "anthropic-compatible",
      baseUrl: "https://anthropic-router.example",
      anthropicVersion: "2023-06-01",
    });
  });

  it("narrows sub-agent eligibility when endpoint tool-use probes fail but main probes pass", async () => {
    const result = await runModelProviderEndpointProbeService({
      templateId: "generic-openai-compatible",
      providerId: "customer-router",
      modelId: "custom/main-only-model",
      baseUrl: "https://provider.example",
      ambientManagedSecret: "sk-service-secret-value-123456",
      generatedAt: "2026-06-06T00:30:00.000Z",
      measuredAt: "2026-06-06T00:30:01.000Z",
      reliabilitySampleCount: 2,
      fetchImpl: async (url, init) => {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
        if (String(url).endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "custom/main-only-model", context_window: 64_000 }] });
        }
        if (body?.model === "custom/main-only-model-ambient-probe-missing-model") {
          return jsonResponse({ error: { message: "model not found" } }, { status: 404 });
        }
        if (body?.stream === true) {
          return new Response("data: {}\n\n", {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          });
        }
        if (body?.tools) return jsonResponse({ choices: [{ message: { content: "no tools" } }] });
        if (body?.response_format) return jsonResponse({ choices: [{ message: { content: "{\"ok\":true}" } }] });
        return jsonResponse({ choices: [{ message: { content: "OK" } }] });
      },
    });

    expect(result.eligibility).toMatchObject({
      eligibleAsMain: true,
      eligibleAsSubagent: false,
    });
    expect(result.eligibility.subagentBlockers).toContain("Capability probe tool_use failed: Endpoint response did not include a tool-use call shape.");
    expect(result.profile).toMatchObject({
      available: true,
      selectableAsMain: true,
      selectableAsSubagent: false,
      toolUse: "none",
    });
  });

  it("blocks endpoint eligibility when reliability probes fail after one-off probes pass", async () => {
    let ordinaryCompletionCount = 0;
    const result = await runModelProviderEndpointProbeService({
      templateId: "generic-openai-compatible",
      providerId: "customer-router",
      modelId: "custom/flaky-model",
      baseUrl: "https://provider.example",
      ambientManagedSecret: "sk-service-secret-value-123456",
      generatedAt: "2026-06-06T00:40:00.000Z",
      measuredAt: "2026-06-06T00:40:01.000Z",
      reliabilitySampleCount: 2,
      fetchImpl: async (url, init) => {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
        if (String(url).endsWith("/v1/models")) {
          return jsonResponse({ data: [{ id: "custom/flaky-model", context_window: 64_000 }] });
        }
        if (body?.model === "custom/flaky-model-ambient-probe-missing-model") {
          return jsonResponse({ error: { message: "model not found" } }, { status: 404 });
        }
        if (body?.stream === true) {
          return new Response("data: {}\n\n", {
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
        if (body?.response_format) return jsonResponse({ choices: [{ message: { content: "{\"ok\":true}" } }] });
        if (Array.isArray((body?.messages as Array<Record<string, unknown>> | undefined)?.[0]?.content)) {
          return jsonResponse({ choices: [{ message: { content: "OK" } }] });
        }
        ordinaryCompletionCount += 1;
        return ordinaryCompletionCount === 2
          ? jsonResponse({ error: { message: "temporary upstream failure" } }, { status: 503 })
          : jsonResponse({ choices: [{ message: { content: "OK" } }] });
      },
    });

    expect(result.probeReport.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ probeId: "latency", status: "passed" }),
      expect.objectContaining({ probeId: "reliability", status: "failed" }),
    ]));
    expect(result.eligibility).toMatchObject({
      eligibleAsMain: false,
      eligibleAsSubagent: false,
      mainBlockers: [
        "Capability probe reliability failed: latency probe received HTTP 503: {\"error\":{\"message\":\"temporary upstream failure\"}}",
      ],
      subagentBlockers: [
        "Capability probe reliability failed: latency probe received HTTP 503: {\"error\":{\"message\":\"temporary upstream failure\"}}",
      ],
    });
    expect(result.profile).toMatchObject({
      available: false,
      selectableAsMain: false,
      selectableAsSubagent: false,
      unavailableReason: "Capability probe reliability failed: latency probe received HTTP 503: {\"error\":{\"message\":\"temporary upstream failure\"}}",
    });
  });

  it("rejects local runtime templates and missing managed secret material before endpoint probing", async () => {
    await expect(runModelProviderEndpointProbeService({
      templateId: "local-text-runtime",
      providerId: "local",
      modelId: "local/text-4b",
      baseUrl: "http://localhost:11434",
      ambientManagedSecret: "",
    })).rejects.toThrow("Endpoint probe service cannot run local-text runtime templates; use local runtime probes instead.");

    await expect(runModelProviderEndpointProbeService({
      templateId: "generic-openai-compatible",
      providerId: "customer-router",
      modelId: "custom/tool-model",
      baseUrl: "https://provider.example",
      ambientManagedSecret: "",
    })).rejects.toThrow("Ambient-managed secret material is required before endpoint capability probing.");
  });
});

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}
