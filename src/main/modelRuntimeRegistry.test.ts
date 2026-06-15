import { describe, expect, it } from "vitest";
import {
  AMBIENT_DEFAULT_MODEL,
  AMBIENT_KIMI_K2_7_CODE_MODEL,
  AMBIENT_LOCAL_TEXT_MODEL,
  AMBIENT_PROVIDER_AMBIENT,
  AMBIENT_PROVIDER_LOCAL,
  AMBIENT_PROVIDER_DESCRIPTORS,
  resolveAmbientModelRuntimeProfile,
} from "../shared/ambientModels";
import {
  createDefaultModelRuntimeRegistry,
  createModelRuntimeCatalog,
  createModelRuntimeRegistry,
  modelRuntimeProvidersWithRuntimeOverrides,
  modelRuntimeProfilesWithRuntimeOverrides,
  validateModelRuntimeRegistry,
} from "./modelRuntimeRegistry";

describe("modelRuntimeRegistry", () => {
  it("lists and resolves default model runtime profiles", () => {
    const registry = createDefaultModelRuntimeRegistry();

    expect(registry.schemaVersion).toBe("ambient-model-runtime-registry-v1");
    expect(registry.getProviderDescriptor(AMBIENT_PROVIDER_AMBIENT)).toMatchObject({
      id: AMBIENT_PROVIDER_AMBIENT,
      locality: "cloud",
      supportsStreaming: true,
    });
    expect(registry.resolveProfile("glm-5.1")).toMatchObject({
      modelId: AMBIENT_DEFAULT_MODEL,
      selectableAsSubagent: true,
      available: true,
    });
    expect(registry.listSelectableMainProfiles().map((profile) => profile.modelId)).toEqual([
      AMBIENT_DEFAULT_MODEL,
      AMBIENT_KIMI_K2_7_CODE_MODEL,
    ]);
    expect(registry.listSelectableSubagentProfiles().map((profile) => profile.modelId)).toEqual([
      AMBIENT_DEFAULT_MODEL,
      AMBIENT_KIMI_K2_7_CODE_MODEL,
    ]);
    expect(registry.validate()).toEqual([]);
    expect(registry.toCatalog("2026-06-05T02:30:00.000Z")).toMatchObject({
      schemaVersion: "ambient-model-runtime-catalog-v1",
      generatedAt: "2026-06-05T02:30:00.000Z",
      selectableMainModelOptions: [
        expect.objectContaining({ id: AMBIENT_DEFAULT_MODEL }),
        expect.objectContaining({ id: AMBIENT_KIMI_K2_7_CODE_MODEL }),
      ],
      selectableSubagentProfiles: [
        expect.objectContaining({ modelId: AMBIENT_DEFAULT_MODEL }),
        expect.objectContaining({ modelId: AMBIENT_KIMI_K2_7_CODE_MODEL }),
      ],
      validationIssues: [],
    });
  });

  it("preserves unknown model ids as unavailable profile records", () => {
    const registry = createDefaultModelRuntimeRegistry();

    expect(registry.resolveProfile("custom/model")).toMatchObject({
      profileId: "unknown:custom/model",
      providerId: "unknown",
      modelId: "custom/model",
      available: false,
      selectableAsSubagent: false,
      unavailableReason: "Model is not registered in this Ambient Desktop build.",
    });
  });

  it("validates provider/profile consistency", () => {
    const ambientProfile = resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL);
    const issues = validateModelRuntimeRegistry({
      providers: AMBIENT_PROVIDER_DESCRIPTORS,
      profiles: [
        ambientProfile,
        {
          ...ambientProfile,
          profileId: "duplicate-profile",
        },
        {
          ...ambientProfile,
          profileId: "locality-mismatch",
          modelId: "locality/mismatch",
          providerId: AMBIENT_PROVIDER_LOCAL,
        },
        {
          ...ambientProfile,
          profileId: "no-streaming-subagent",
          modelId: "no-streaming/subagent",
          supportsStreaming: false,
        },
      ],
    });

    expect(issues.map((issue) => issue.field)).toEqual(expect.arrayContaining([
      "modelId",
      "locality",
      "supportsStreaming",
    ]));
    expect(() => createModelRuntimeRegistry({
      providers: AMBIENT_PROVIDER_DESCRIPTORS,
      profiles: [
        ambientProfile,
        {
          ...ambientProfile,
          profileId: "duplicate-profile",
        },
      ],
    })).toThrow(/Invalid model runtime registry/);
  });

  it("builds an app-state catalog with runtime profile overrides", () => {
    const configuredLocalText = {
      ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
      profileId: `${AMBIENT_PROVIDER_LOCAL}:${AMBIENT_LOCAL_TEXT_MODEL}:startup`,
      selectableAsSubagent: true,
      available: true,
      unavailableReason: undefined,
      providerQuirks: ["Resolved from an active local runtime descriptor."],
    };

    const catalog = createModelRuntimeCatalog({
      generatedAt: "2026-06-05T03:00:00.000Z",
      runtimeProfiles: [configuredLocalText],
    });

    expect(catalog.profiles.filter((profile) => profile.modelId === AMBIENT_LOCAL_TEXT_MODEL)).toEqual([
      expect.objectContaining({
        profileId: `${AMBIENT_PROVIDER_LOCAL}:${AMBIENT_LOCAL_TEXT_MODEL}:startup`,
        available: true,
        selectableAsMain: false,
        selectableAsSubagent: true,
      }),
    ]);
    expect(catalog.selectableMainModelOptions.map((option) => option.id)).toEqual([
      AMBIENT_DEFAULT_MODEL,
      AMBIENT_KIMI_K2_7_CODE_MODEL,
    ]);
    expect(catalog.selectableSubagentProfiles.map((profile) => profile.modelId)).toEqual([
      AMBIENT_DEFAULT_MODEL,
      AMBIENT_KIMI_K2_7_CODE_MODEL,
      AMBIENT_LOCAL_TEXT_MODEL,
    ]);
  });

  it("replaces static profiles with runtime-resolved profiles by model id", () => {
    const unavailableLocalText = resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL);
    const configuredLocalText = {
      ...unavailableLocalText,
      profileId: `${AMBIENT_PROVIDER_LOCAL}:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
      available: true,
      selectableAsSubagent: true,
      unavailableReason: undefined,
    };

    expect(modelRuntimeProfilesWithRuntimeOverrides(
      [resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL), unavailableLocalText],
      [configuredLocalText],
    )).toEqual([
      expect.objectContaining({ modelId: AMBIENT_DEFAULT_MODEL }),
      expect.objectContaining({
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
        profileId: `${AMBIENT_PROVIDER_LOCAL}:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
        available: true,
      }),
    ]);
  });

  it("adds Settings-installed provider descriptors to runtime catalogs", () => {
    const catalog = createModelRuntimeCatalog({
      generatedAt: "2026-06-06T02:00:00.000Z",
      providers: [{
        id: "customer-router",
        label: "Customer Router",
        locality: "cloud",
        secretRequirement: "user-secret",
        supportsStreaming: true,
        supportsTools: true,
        endpoint: {
          schemaVersion: "ambient-model-runtime-installed-provider-endpoint-v1",
          compatibility: "openai-compatible",
          baseUrl: "https://provider.example/v1",
        },
        notes: ["Installed from Settings provider onboarding."],
      }],
      runtimeProfiles: [{
        ...resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL),
        profileId: "customer-router:CUSTOM/Router Model v2",
        providerId: "customer-router",
        modelId: "CUSTOM/Router Model v2",
        label: "Router Model v2",
        costClass: "metered",
        trustClass: "user-configured",
        privacyLabel: "User configured cloud provider",
        providerQuirks: ["Capability-probed before Settings install."],
      }],
    });

    expect(catalog.providers.map((provider) => provider.id)).toEqual(expect.arrayContaining([
      AMBIENT_PROVIDER_AMBIENT,
      "customer-router",
    ]));
    expect(catalog.providers.find((provider) => provider.id === "customer-router")?.endpoint).toEqual({
      schemaVersion: "ambient-model-runtime-installed-provider-endpoint-v1",
      compatibility: "openai-compatible",
      baseUrl: "https://provider.example/v1",
    });
    expect(catalog.validationIssues).toEqual([]);
    expect(catalog.selectableMainModelOptions.map((option) => option.id)).toEqual(expect.arrayContaining([
      AMBIENT_DEFAULT_MODEL,
      "CUSTOM/Router Model v2",
    ]));
  });

  it("lets runtime provider descriptors override static provider descriptors by id", () => {
    expect(modelRuntimeProvidersWithRuntimeOverrides(
      AMBIENT_PROVIDER_DESCRIPTORS,
      [{
        id: AMBIENT_PROVIDER_LOCAL,
        label: "Configured local runtime",
        locality: "local",
        secretRequirement: "none",
        supportsStreaming: true,
        supportsTools: true,
        notes: ["Resolved from Settings runtime launch descriptor."],
      }],
    ).find((provider) => provider.id === AMBIENT_PROVIDER_LOCAL)).toMatchObject({
      label: "Configured local runtime",
      supportsTools: true,
    });
  });
});
