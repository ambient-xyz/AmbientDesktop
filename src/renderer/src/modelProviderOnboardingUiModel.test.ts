import { describe, expect, it } from "vitest";
import {
  emptyModelProviderEndpointInstallDraft,
  modelProviderCredentialSaveDraftModel,
  modelProviderCredentialSaveInputFromDraft,
  modelProviderEndpointInstallDraftModel,
  modelProviderOnboardingSettingsModel,
} from "./modelProviderOnboardingUiModel";

describe("modelProviderOnboardingSettingsModel", () => {
  it("summarizes known, generic, and local provider onboarding templates", () => {
    const model = modelProviderOnboardingSettingsModel();

    expect(model.statusLabel).toBe("5 provider templates");
    expect(model.summary).toBe("2 known / 2 generic / 1 local");
    expect(model.knownProviderCards.map((card) => card.id)).toEqual(["ambient-managed", "gmi-cloud"]);
    expect(model.genericEndpointCards.map((card) => card.id)).toEqual([
      "generic-openai-compatible",
      "generic-anthropic-compatible",
    ]);
    expect(model.localRuntimeCards.map((card) => card.id)).toEqual(["local-text-runtime"]);
  });

  it("surfaces safe secret flows and real capability probes for generic endpoints", () => {
    const model = modelProviderOnboardingSettingsModel();
    const openAi = model.cards.find((card) => card.id === "generic-openai-compatible");

    expect(openAi).toMatchObject({
      label: "Generic OpenAI-compatible endpoint",
      endpointInstallable: true,
      kindLabel: "Generic OpenAI-compatible",
      compatibilityLabel: "OpenAI-compatible endpoint",
      secretFlowLabel: "Desktop secret request",
      endpointLabel: "Endpoint URL required",
      actionLabel: "Probe endpoint before eligibility",
      safetyLabels: expect.arrayContaining(["Real capability probes", "No chat secrets"]),
      requiredSubagentProbeLabels: expect.arrayContaining(["Streaming", "Structured JSON", "Schema output", "Tool use", "Reliability"]),
    });
    expect(model.searchText).toContain("generic-openai-compatible");
    expect(model.searchText).toContain("Structured JSON");
  });

  it("marks GMI Cloud as an ignored env-bound secret flow", () => {
    const model = modelProviderOnboardingSettingsModel();
    const gmi = model.cards.find((card) => card.id === "gmi-cloud");

    expect(gmi).toMatchObject({
      secretFlowLabel: "Ignored env-bound secret file",
      endpointInstallable: true,
      safetyLabels: expect.arrayContaining(["No chat secrets"]),
      probeLabels: expect.arrayContaining(["Streaming", "Context window", "Tool use", "Reliability"]),
    });
  });

  it("keeps local runtimes health and memory gated before sub-agent eligibility", () => {
    const model = modelProviderOnboardingSettingsModel();
    const local = model.cards.find((card) => card.id === "local-text-runtime");

    expect(local).toMatchObject({
      kindLabel: "Local runtime",
      endpointInstallable: false,
      compatibilityLabel: "Local text endpoint",
      secretFlowLabel: "No secret",
      actionLabel: "Probe health and memory before eligibility",
      tone: "warning",
      safetyLabels: expect.arrayContaining(["Memory gated", "No secret required"]),
      requiredSubagentProbeLabels: expect.arrayContaining(["Health", "Local memory", "Reliability"]),
    });
  });

  it("does not ask users to paste API keys into chat", () => {
    const serialized = JSON.stringify(modelProviderOnboardingSettingsModel()).toLowerCase();

    expect(serialized).not.toContain("paste");
    expect(serialized).not.toContain("api key");
  });

  it("builds a safe endpoint install request from a managed credential reference", () => {
    const model = modelProviderEndpointInstallDraftModel({
      ...emptyModelProviderEndpointInstallDraft(),
      providerId: "customer-router",
      providerLabel: "Customer Router",
      modelId: "CUSTOM/Router Model v2",
      modelLabel: "Router Model v2",
      baseUrl: "https://provider.example",
      managedSecretRef: `ambient-secret-ref:v1:${"d".repeat(64)}`,
      reliabilitySampleCount: 3,
    });

    expect(model).toMatchObject({
      canInstall: true,
      actionLabel: "Probe endpoint",
      statusLabel: "Ready to probe",
      input: {
        templateId: "generic-openai-compatible",
        providerId: "customer-router",
        providerLabel: "Customer Router",
        modelId: "CUSTOM/Router Model v2",
        modelLabel: "Router Model v2",
        baseUrl: "https://provider.example",
        credentialRef: {
          flow: "ambient_cli_secret_request",
          managedSecretRef: `ambient-secret-ref:v1:${"d".repeat(64)}`,
          label: "Desktop secret request",
        },
        reliabilitySampleCount: 3,
        enabled: true,
      },
    });
    expect(JSON.stringify(model)).not.toContain("sk-");
    expect(JSON.stringify(model.input)).not.toContain("apiKey");
  });

  it("builds a safe credential save request from provider endpoint fields", () => {
    const rawSecret = "sk-provider-secret-value-123456";
    const draft = {
      ...emptyModelProviderEndpointInstallDraft(),
      providerId: "customer-router",
      modelId: "CUSTOM/Router Model v2",
      baseUrl: "https://provider.example",
      credentialLabel: "Customer router key",
    };
    const model = modelProviderCredentialSaveDraftModel(draft, rawSecret);
    const input = modelProviderCredentialSaveInputFromDraft(draft, rawSecret);

    expect(model).toMatchObject({
      canSave: true,
      actionLabel: "Save credential",
      statusLabel: "Ready to save",
    });
    expect(JSON.stringify(model)).not.toContain(rawSecret);
    expect(input).toEqual({
      templateId: "generic-openai-compatible",
      providerId: "customer-router",
      modelId: "CUSTOM/Router Model v2",
      baseUrl: "https://provider.example",
      label: "Customer router key",
      value: rawSecret,
    });
  });

  it("blocks credential saving for local and Ambient-managed templates", () => {
    const local = modelProviderCredentialSaveDraftModel({
      ...emptyModelProviderEndpointInstallDraft("local-text-runtime"),
      modelId: "local/text-4b",
      baseUrl: "http://127.0.0.1:11434",
    }, "local-secret-value-123456");
    const ambient = modelProviderCredentialSaveDraftModel({
      ...emptyModelProviderEndpointInstallDraft("ambient-managed"),
      modelId: "zai-org/GLM-5.1-FP8",
      baseUrl: "https://api.ambient.example",
    }, "ambient-secret-value-123456");

    expect(local.canSave).toBe(false);
    expect(local.validationRows).toContain("Local runtime templates do not need endpoint credentials.");
    expect(ambient.canSave).toBe(false);
    expect(ambient.validationRows).toContain("Ambient-managed templates do not accept user credentials.");
  });

  it("refuses local and managed templates for endpoint install requests", () => {
    const local = modelProviderEndpointInstallDraftModel({
      ...emptyModelProviderEndpointInstallDraft("local-text-runtime"),
      modelId: "local/text-4b",
      baseUrl: "http://127.0.0.1:11434",
      managedSecretRef: `ambient-secret-ref:v1:${"e".repeat(64)}`,
    });
    const ambient = modelProviderEndpointInstallDraftModel({
      ...emptyModelProviderEndpointInstallDraft("ambient-managed"),
      modelId: "zai-org/GLM-5.1-FP8",
      baseUrl: "https://api.ambient.example",
      managedSecretRef: `ambient-secret-ref:v1:${"f".repeat(64)}`,
    });

    expect(local.canInstall).toBe(false);
    expect(local.validationRows).toContain("Local runtime templates use local runtime onboarding.");
    expect(ambient.canInstall).toBe(false);
    expect(ambient.validationRows).toContain("This template does not use a user-managed endpoint credential.");
  });

  it("keeps endpoint install blocked until required safe fields are present", () => {
    const model = modelProviderEndpointInstallDraftModel({
      ...emptyModelProviderEndpointInstallDraft(),
      baseUrl: "provider.example",
      managedSecretRef: "sk-not-a-managed-ref",
    });

    expect(model.canInstall).toBe(false);
    expect(model.validationRows).toEqual([
      "Enter the exact model ID to probe.",
      "Endpoint base URL must start with http:// or https://.",
      "Credential reference must be an Ambient-managed secret ref.",
    ]);
  });
});
