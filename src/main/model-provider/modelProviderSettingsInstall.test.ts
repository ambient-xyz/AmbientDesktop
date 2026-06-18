import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MODEL_RUNTIME_SETTINGS, normalizeModelRuntimeSettings } from "../../shared/modelRuntimeSettings";
import type { ModelRuntimeSettings } from "../../shared/threadTypes";
import { installModelProviderEndpointForSettings } from "./modelProviderSettingsInstall";

describe("installModelProviderEndpointForSettings", () => {
  it("runs endpoint probes through an Ambient-managed secret resolver and saves a secret-free installed provider", async () => {
    const store = modelRuntimeSettingsStore();
    const secret = "sk-install-secret-value-123456";
    const result = await installModelProviderEndpointForSettings({
      request: {
        templateId: "generic-openai-compatible",
        providerId: "customer-router",
        providerLabel: "Customer Router",
        modelId: "CUSTOM/Router Model v2",
        modelLabel: "Router Model v2",
        baseUrl: "https://provider.example",
        generatedAt: "2026-06-06T00:00:00.000Z",
        measuredAt: "2026-06-06T00:00:01.000Z",
        reliabilitySampleCount: 2,
        credentialRef: {
          flow: "ambient_cli_secret_request",
          managedSecretRef: `ambient-secret-ref:v1:${"b".repeat(64)}`,
          label: "Desktop secret request",
        },
      },
      store,
      resolveSecret: (request) => {
        expect(request.credentialRef).toEqual({
          flow: "ambient_cli_secret_request",
          managedSecretRef: `ambient-secret-ref:v1:${"b".repeat(64)}`,
          label: "Desktop secret request",
        });
        return {
          ambientManagedSecret: secret,
          secretRef: {
            schemaVersion: "ambient-model-runtime-installed-provider-secret-ref-v1",
            flow: "ambient_cli_secret_request",
            configured: true,
            label: "Desktop secret request",
            ref: `ambient-secret-ref:v1:${"b".repeat(64)}`,
          },
        };
      },
      fetchImpl: openAiFetch("CUSTOM/Router Model v2", 128_000),
    });

    expect(result).toMatchObject({
      schemaVersion: "ambient-model-provider-settings-install-v1",
      installedProviderKey: "generic-openai-compatible:customer-router:CUSTOM/Router Model v2",
      probeResult: {
        eligibility: {
          eligibleAsMain: true,
          eligibleAsSubagent: true,
        },
      },
      settings: {
        installedProviders: [
          expect.objectContaining({
            templateId: "generic-openai-compatible",
            provider: expect.objectContaining({
              id: "customer-router",
              label: "Customer Router",
            }),
            profile: expect.objectContaining({
              modelId: "CUSTOM/Router Model v2",
              label: "Router Model v2",
              selectableAsMain: true,
              selectableAsSubagent: true,
              contextWindowTokens: 128_000,
            }),
            endpoint: {
              schemaVersion: "ambient-model-runtime-installed-provider-endpoint-v1",
              compatibility: "openai-compatible",
              baseUrl: "https://provider.example",
            },
            secretRef: expect.objectContaining({
              flow: "ambient_cli_secret_request",
              configured: true,
              ref: `ambient-secret-ref:v1:${"b".repeat(64)}`,
            }),
          }),
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(store.settings)).not.toContain(secret);
  });

  it("updates an existing installed provider record instead of duplicating it", async () => {
    const store = modelRuntimeSettingsStore();
    const request = {
      templateId: "generic-openai-compatible",
      providerId: "customer-router",
      providerLabel: "Customer Router",
      modelId: "custom/router-model",
      modelLabel: "Router Model",
      baseUrl: "https://provider.example",
      generatedAt: "2026-06-06T00:00:00.000Z",
      measuredAt: "2026-06-06T00:00:01.000Z",
      reliabilitySampleCount: 2,
    };

    await installModelProviderEndpointForSettings({
      request,
      store,
      resolveSecret: secretResolver(),
      fetchImpl: openAiFetch("custom/router-model", 64_000),
    });
    await installModelProviderEndpointForSettings({
      request: {
        ...request,
        modelLabel: "Router Model Updated",
        generatedAt: "2026-06-06T01:00:00.000Z",
        measuredAt: "2026-06-06T01:00:01.000Z",
      },
      store,
      resolveSecret: secretResolver(),
      fetchImpl: openAiFetch("custom/router-model", 96_000),
    });

    expect(store.settings.installedProviders).toEqual([
      expect.objectContaining({
        updatedAt: "2026-06-06T01:00:00.000Z",
        profile: expect.objectContaining({
          modelId: "custom/router-model",
          label: "Router Model Updated",
          contextWindowTokens: 96_000,
        }),
      }),
    ]);
  });

  it("persists failed sub-agent eligibility as an installed but main-only profile", async () => {
    const store = modelRuntimeSettingsStore();
    const result = await installModelProviderEndpointForSettings({
      request: {
        templateId: "generic-openai-compatible",
        providerId: "customer-router",
        modelId: "custom/main-only",
        baseUrl: "https://provider.example",
        generatedAt: "2026-06-06T02:00:00.000Z",
        measuredAt: "2026-06-06T02:00:01.000Z",
        reliabilitySampleCount: 2,
      },
      store,
      resolveSecret: secretResolver(),
      fetchImpl: openAiFetch("custom/main-only", 64_000, { failToolUse: true }),
    });

    expect(result.probeResult.eligibility).toMatchObject({
      eligibleAsMain: true,
      eligibleAsSubagent: false,
    });
    expect(store.settings.installedProviders).toEqual([
      expect.objectContaining({
        profile: expect.objectContaining({
          modelId: "custom/main-only",
          available: true,
          selectableAsMain: true,
          selectableAsSubagent: false,
        }),
      }),
    ]);
  });

  it("rejects local runtime templates before resolving endpoint secrets", async () => {
    const resolveSecret = vi.fn(secretResolver());

    await expect(installModelProviderEndpointForSettings({
      request: {
        templateId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        baseUrl: "http://localhost:11434",
      },
      store: modelRuntimeSettingsStore(),
      resolveSecret,
      fetchImpl: async () => jsonResponse({}),
    })).rejects.toThrow("Settings endpoint provider install cannot run local-text runtime templates; use local runtime onboarding instead.");
    expect(resolveSecret).not.toHaveBeenCalled();
  });
});

function modelRuntimeSettingsStore() {
  return {
    settings: normalizeModelRuntimeSettings(DEFAULT_MODEL_RUNTIME_SETTINGS),
    getModelRuntimeSettings() {
      return this.settings;
    },
    setModelRuntimeSettings(input: Partial<ModelRuntimeSettings>) {
      this.settings = normalizeModelRuntimeSettings({ ...this.settings, ...input });
      return this.settings;
    },
  };
}

function secretResolver() {
  return () => ({
    ambientManagedSecret: "sk-install-secret-value-123456",
    secretRef: {
      schemaVersion: "ambient-model-runtime-installed-provider-secret-ref-v1" as const,
      flow: "ambient_cli_secret_request" as const,
      configured: true,
      label: "Desktop secret request",
    },
  });
}

function openAiFetch(
  modelId: string,
  contextWindowTokens: number,
  options: { failToolUse?: boolean } = {},
) {
  return async (url: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    if (String(url).endsWith("/v1/models")) {
      return jsonResponse({ data: [{ id: modelId, context_window: contextWindowTokens }] });
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
      return options.failToolUse
        ? jsonResponse({ choices: [{ message: { content: "no tool calls" } }] })
        : jsonResponse({
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
}

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}
