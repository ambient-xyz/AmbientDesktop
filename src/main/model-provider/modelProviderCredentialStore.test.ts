import { describe, expect, it, vi } from "vitest";
import {
  MODEL_PROVIDER_CREDENTIAL_SAVE_SCHEMA_VERSION,
  saveModelProviderCredentialForSettings,
} from "./modelProviderCredentialStore";

describe("saveModelProviderCredentialForSettings", () => {
  it("saves model provider credentials as Ambient-managed refs without returning secret values", async () => {
    const rawSecret = "sk-provider-secret-value-123456";
    const saveSecretReferenceImpl = vi.fn(async () => `ambient-secret-ref:v1:${"c".repeat(64)}`);

    const result = await saveModelProviderCredentialForSettings({
      workspacePath: "/tmp/ambient-workspace",
      input: {
        templateId: "generic-openai-compatible",
        providerId: "customer-router",
        modelId: "CUSTOM/Router Model v2",
        baseUrl: "https://provider.example/v1",
        label: "Customer router key",
        value: rawSecret,
      },
      saveSecretReferenceImpl,
    });

    expect(saveSecretReferenceImpl).toHaveBeenCalledWith({
      scope: "model-provider",
      workspacePath: "/tmp/ambient-workspace",
      ownerId: JSON.stringify({
        schemaVersion: "ambient-model-provider-credential-owner-v1",
        templateId: "generic-openai-compatible",
        providerId: "customer-router",
        modelId: "CUSTOM/Router Model v2",
        baseUrl: "https://provider.example/v1",
      }),
      envName: "MODEL_PROVIDER_API_KEY",
      value: rawSecret,
    });
    expect(result).toEqual({
      schemaVersion: MODEL_PROVIDER_CREDENTIAL_SAVE_SCHEMA_VERSION,
      templateId: "generic-openai-compatible",
      providerId: "customer-router",
      modelId: "CUSTOM/Router Model v2",
      baseUrl: "https://provider.example/v1",
      configured: true,
      credentialRef: {
        flow: "ambient_cli_secret_request",
        managedSecretRef: `ambient-secret-ref:v1:${"c".repeat(64)}`,
        label: "Customer router key",
      },
    });
    expect(JSON.stringify(result)).not.toContain(rawSecret);
  });

  it("uses known provider env names and endpoint identity when saving env-bound credentials", async () => {
    const saveSecretReferenceImpl = vi.fn(async () => `ambient-secret-ref:v1:${"d".repeat(64)}`);

    const result = await saveModelProviderCredentialForSettings({
      workspacePath: "/tmp/ambient-workspace",
      input: {
        templateId: "gmi-cloud",
        modelId: "zai-org/GLM-5.1-FP8",
        baseUrl: "https://api.gmi.example",
        value: "gmi-secret-value-123456",
      },
      saveSecretReferenceImpl,
    });

    expect(saveSecretReferenceImpl).toHaveBeenCalledWith(expect.objectContaining({
      scope: "model-provider",
      envName: "GMI_CLOUD_API_KEY",
      ownerId: expect.stringContaining("\"providerId\":\"gmi-cloud\""),
    }));
    expect(result).toMatchObject({
      providerId: "gmi-cloud",
      credentialRef: {
        flow: "ambient_cli_env_bind",
        label: "Ignored env-bound secret file",
      },
    });
  });

  it("rejects local and Ambient-managed templates before saving", async () => {
    const saveSecretReferenceImpl = vi.fn(async () => `ambient-secret-ref:v1:${"e".repeat(64)}`);

    await expect(saveModelProviderCredentialForSettings({
      workspacePath: "/tmp/ambient-workspace",
      input: {
        templateId: "local-text-runtime",
        modelId: "local/text-4b",
        baseUrl: "http://127.0.0.1:11434",
        value: "local-secret-value-123456",
      },
      saveSecretReferenceImpl,
    })).rejects.toThrow("Local model provider templates do not use endpoint credentials.");
    await expect(saveModelProviderCredentialForSettings({
      workspacePath: "/tmp/ambient-workspace",
      input: {
        templateId: "ambient-managed",
        modelId: "zai-org/GLM-5.1-FP8",
        baseUrl: "https://api.ambient.example",
        value: "ambient-secret-value-123456",
      },
      saveSecretReferenceImpl,
    })).rejects.toThrow("Ambient-managed model provider templates do not accept user credentials.");

    expect(saveSecretReferenceImpl).not.toHaveBeenCalled();
  });

  it("requires endpoint and model fields before saving", async () => {
    const saveSecretReferenceImpl = vi.fn(async () => `ambient-secret-ref:v1:${"f".repeat(64)}`);

    await expect(saveModelProviderCredentialForSettings({
      workspacePath: "/tmp/ambient-workspace",
      input: {
        templateId: "generic-openai-compatible",
        modelId: "",
        baseUrl: "provider.example",
        value: "",
      },
      saveSecretReferenceImpl,
    })).rejects.toThrow("Model provider credential storage requires a model id.");

    expect(saveSecretReferenceImpl).not.toHaveBeenCalled();
  });
});
