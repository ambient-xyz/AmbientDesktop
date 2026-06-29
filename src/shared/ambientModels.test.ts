import { describe, expect, it } from "vitest";
import {
  AMBIENT_DEFAULT_MODEL,
  AMBIENT_GLM_5_1_FP8_MODEL,
  AMBIENT_GLM_5_2_FP8_MODEL,
  AMBIENT_KIMI_K2_7_CODE_MODEL,
  AMBIENT_LOCAL_TEXT_MODEL,
  AMBIENT_MODEL_OPTIONS,
  AMBIENT_PROVIDER_LOCAL,
  ambientModelReasoningEffortForThinkingLevel,
  ambientModelRuntimeCatalogFromProfiles,
  ambientModelOptionsFromRuntimeProfiles,
  ambientModelLabel,
  createAmbientModelRuntimeSnapshot,
  createAmbientModelRuntimeSnapshotFromProfile,
  normalizeAmbientModelId,
  resolveAmbientModelReasoningCapability,
  resolveAmbientModelReasoningThinkingLevel,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "./ambientModels";

describe("ambient model options", () => {
  it("derives selectable model options from available main runtime profiles", () => {
    expect(AMBIENT_MODEL_OPTIONS).toEqual([
      expect.objectContaining({
        id: AMBIENT_DEFAULT_MODEL,
        label: "Kimi K2.7 Code",
        profileId: `ambient:${AMBIENT_DEFAULT_MODEL}`,
        providerId: "ambient",
        locality: "cloud",
        privacyLabel: "Ambient managed cloud model",
      }),
      expect.objectContaining({
        id: AMBIENT_GLM_5_2_FP8_MODEL,
        label: "GLM 5.2",
        profileId: `ambient:${AMBIENT_GLM_5_2_FP8_MODEL}`,
        providerId: "ambient",
        locality: "cloud",
        privacyLabel: "Ambient managed cloud model",
      }),
    ]);
    expect(AMBIENT_MODEL_OPTIONS).not.toContainEqual(expect.objectContaining({ id: "qwen/qwen3.6-27b" }));
    expect(AMBIENT_MODEL_OPTIONS).not.toContainEqual(expect.objectContaining({ id: "qwen/qwen3.6-35b-a3b" }));
  });

  it("can derive future cloud or local main model options from runtime profile eligibility", () => {
    const ambientProfile = resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL);
    const configuredLocalMain: AmbientModelRuntimeProfile = {
      ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
      profileId: `${AMBIENT_PROVIDER_LOCAL}:${AMBIENT_LOCAL_TEXT_MODEL}:main`,
      selectableAsMain: true,
      available: true,
      unavailableReason: undefined,
      providerQuirks: ["Resolved from an active local runtime descriptor."],
    };

    expect(
      ambientModelOptionsFromRuntimeProfiles([
        ambientProfile,
        configuredLocalMain,
        {
          ...ambientProfile,
          profileId: "future-subagent-only",
          modelId: "future/subagent-only",
          selectableAsMain: false,
          selectableAsSubagent: true,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        id: AMBIENT_DEFAULT_MODEL,
        providerId: "ambient",
      }),
      expect.objectContaining({
        id: AMBIENT_LOCAL_TEXT_MODEL,
        profileId: `${AMBIENT_PROVIDER_LOCAL}:${AMBIENT_LOCAL_TEXT_MODEL}:main`,
        providerId: AMBIENT_PROVIDER_LOCAL,
        locality: "local",
        costClass: "local",
      }),
    ]);
  });

  it("builds a serializable runtime catalog for app state", () => {
    const ambientProfile = resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL);
    const configuredLocalSubagent: AmbientModelRuntimeProfile = {
      ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
      profileId: `${AMBIENT_PROVIDER_LOCAL}:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
      selectableAsSubagent: true,
      available: true,
      unavailableReason: undefined,
      providerQuirks: ["Resolved from an active local runtime descriptor."],
    };

    const catalog = ambientModelRuntimeCatalogFromProfiles({
      generatedAt: "2026-06-05T02:00:00.000Z",
      profiles: [ambientProfile, configuredLocalSubagent],
    });

    expect(catalog).toMatchObject({
      schemaVersion: "ambient-model-runtime-catalog-v1",
      generatedAt: "2026-06-05T02:00:00.000Z",
      selectableMainModelOptions: [expect.objectContaining({ id: AMBIENT_DEFAULT_MODEL })],
      selectableSubagentProfiles: [
        expect.objectContaining({ modelId: AMBIENT_DEFAULT_MODEL }),
        expect.objectContaining({
          modelId: AMBIENT_LOCAL_TEXT_MODEL,
          providerId: AMBIENT_PROVIDER_LOCAL,
          locality: "local",
        }),
      ],
      validationIssues: [],
    });
    expect(catalog.selectableMainModelOptions).not.toContainEqual(expect.objectContaining({ id: AMBIENT_LOCAL_TEXT_MODEL }));
  });

  it("registers live-qualified Ambient alternatives as sub-agent schema-capable profiles", () => {
    expect(AMBIENT_DEFAULT_MODEL).toBe(AMBIENT_KIMI_K2_7_CODE_MODEL);
    expect(resolveAmbientModelRuntimeProfile(AMBIENT_KIMI_K2_7_CODE_MODEL)).toMatchObject({
      providerId: "ambient",
      modelId: AMBIENT_KIMI_K2_7_CODE_MODEL,
      label: "Kimi K2.7 Code",
      available: true,
      selectableAsMain: true,
      selectableAsSubagent: true,
      contextWindowTokens: 262_144,
      maxOutputTokens: 262_144,
      toolUse: "ambient-tools",
      structuredOutput: "schema",
      supportsVision: true,
      privacyLabel: "Ambient managed cloud model",
      reasoningCapability: {
        schemaVersion: "ambient-model-reasoning-capability-v1",
        control: "fixed_on",
        fixedReasoning: true,
        hiddenReasoningPreserved: true,
        payloadStrategy: "omit-reasoning-controls",
        requestFields: [],
        selectableThinkingLevels: [],
      },
    });
    expect(resolveAmbientModelRuntimeProfile(AMBIENT_GLM_5_2_FP8_MODEL)).toMatchObject({
      providerId: "ambient",
      modelId: AMBIENT_GLM_5_2_FP8_MODEL,
      label: "GLM 5.2",
      available: true,
      selectableAsMain: true,
      selectableAsSubagent: true,
      contextWindowTokens: 202_752,
      maxOutputTokens: 202_752,
      toolUse: "ambient-tools",
      structuredOutput: "schema",
      supportsVision: false,
      privacyLabel: "Ambient managed cloud model",
      reasoningCapability: {
        schemaVersion: "ambient-model-reasoning-capability-v1",
        control: "selectable_effort",
        payloadStrategy: "zai-reasoning-effort",
        requestFields: ["enable_thinking", "reasoning_effort"],
        selectableThinkingLevels: [
          expect.objectContaining({ thinkingLevel: "medium", label: "Standard" }),
          expect.objectContaining({ thinkingLevel: "xhigh", label: "Deep" }),
        ],
      },
    });
  });

  it("maps GLM 5.2 stored thinking levels onto Standard and Deep reasoning efforts", () => {
    expect(resolveAmbientModelReasoningThinkingLevel(AMBIENT_GLM_5_2_FP8_MODEL, undefined)).toBe("medium");
    expect(resolveAmbientModelReasoningThinkingLevel(AMBIENT_GLM_5_2_FP8_MODEL, "minimal")).toBe("medium");
    expect(resolveAmbientModelReasoningThinkingLevel(AMBIENT_GLM_5_2_FP8_MODEL, "low")).toBe("medium");
    expect(resolveAmbientModelReasoningThinkingLevel(AMBIENT_GLM_5_2_FP8_MODEL, "medium")).toBe("medium");
    expect(resolveAmbientModelReasoningThinkingLevel(AMBIENT_GLM_5_2_FP8_MODEL, "high")).toBe("xhigh");
    expect(resolveAmbientModelReasoningThinkingLevel(AMBIENT_GLM_5_2_FP8_MODEL, "xhigh")).toBe("xhigh");

    expect(ambientModelReasoningEffortForThinkingLevel(AMBIENT_GLM_5_2_FP8_MODEL, "minimal")).toBe("high");
    expect(ambientModelReasoningEffortForThinkingLevel(AMBIENT_GLM_5_2_FP8_MODEL, "low")).toBe("high");
    expect(ambientModelReasoningEffortForThinkingLevel(AMBIENT_GLM_5_2_FP8_MODEL, "medium")).toBe("high");
    expect(ambientModelReasoningEffortForThinkingLevel(AMBIENT_GLM_5_2_FP8_MODEL, "high")).toBe("max");
    expect(ambientModelReasoningEffortForThinkingLevel(AMBIENT_GLM_5_2_FP8_MODEL, "xhigh")).toBe("max");
  });

  it("applies the GLM 5.2 reasoning contract to removed GLM ids", () => {
    expect(resolveAmbientModelReasoningCapability(AMBIENT_GLM_5_1_FP8_MODEL)).toMatchObject({
      control: "selectable_effort",
      payloadStrategy: "zai-reasoning-effort",
    });
    expect(ambientModelReasoningEffortForThinkingLevel("glm-5.1", "xhigh")).toBe("max");
    expect(ambientModelReasoningEffortForThinkingLevel("ambient/large", "medium")).toBe("high");
  });

  it("omits model-controlled reasoning controls for Kimi and unregistered models", () => {
    expect(resolveAmbientModelReasoningThinkingLevel(AMBIENT_KIMI_K2_7_CODE_MODEL, "xhigh")).toBe("medium");
    expect(ambientModelReasoningEffortForThinkingLevel(AMBIENT_KIMI_K2_7_CODE_MODEL, "xhigh")).toBeUndefined();
    expect(resolveAmbientModelReasoningCapability(AMBIENT_KIMI_K2_7_CODE_MODEL)).toMatchObject({
      control: "fixed_on",
      fixedReasoning: true,
      hiddenReasoningPreserved: true,
      payloadStrategy: "omit-reasoning-controls",
      requestFields: [],
    });

    expect(resolveAmbientModelReasoningCapability("custom/model")).toMatchObject({
      control: "unsupported",
      fixedReasoning: false,
      hiddenReasoningPreserved: false,
      payloadStrategy: "preserve-reasoning-controls",
    });
    expect(resolveAmbientModelReasoningThinkingLevel("custom/model", "high")).toBe("high");
    expect(resolveAmbientModelReasoningThinkingLevel("custom/model", "xhigh")).toBe("xhigh");
  });

  it("returns isolated reasoning capability objects from profile and catalog helpers", () => {
    const profileCapability = resolveAmbientModelReasoningCapability(AMBIENT_GLM_5_2_FP8_MODEL);
    profileCapability.selectableThinkingLevels[0].label = "Mutated";
    profileCapability.requestFields.push("mutated");
    profileCapability.effortByThinkingLevel = { medium: "mutated" };

    expect(resolveAmbientModelReasoningCapability(AMBIENT_GLM_5_2_FP8_MODEL)).toMatchObject({
      selectableThinkingLevels: [
        expect.objectContaining({ thinkingLevel: "medium", label: "Standard" }),
        expect.objectContaining({ thinkingLevel: "xhigh", label: "Deep" }),
      ],
      requestFields: ["enable_thinking", "reasoning_effort"],
      effortByThinkingLevel: expect.objectContaining({ medium: "high" }),
    });

    const catalog = ambientModelRuntimeCatalogFromProfiles();
    expect(catalog.profiles[0].reasoningCapability).toBeDefined();
    catalog.profiles[0].reasoningCapability!.notes.push("mutated");
    expect(resolveAmbientModelReasoningCapability(AMBIENT_DEFAULT_MODEL).notes).not.toContain("mutated");
  });

  it("keeps unqualified Qwen chat candidates out of main and sub-agent selection", () => {
    for (const modelId of ["qwen/qwen3.6-27b", "qwen/qwen3.6-35b-a3b"]) {
      expect(resolveAmbientModelRuntimeProfile(modelId)).toMatchObject({
        modelId,
        available: false,
        selectableAsMain: false,
        selectableAsSubagent: false,
      });
    }
  });

  it("normalizes removed model ids while preserving unknown model ids", () => {
    expect(normalizeAmbientModelId()).toBe(AMBIENT_DEFAULT_MODEL);
    expect(normalizeAmbientModelId("glm-5.2")).toBe(AMBIENT_GLM_5_2_FP8_MODEL);
    expect(normalizeAmbientModelId("glm-5.1")).toBe(AMBIENT_GLM_5_2_FP8_MODEL);
    expect(normalizeAmbientModelId("glm-5")).toBe(AMBIENT_GLM_5_2_FP8_MODEL);
    expect(normalizeAmbientModelId("ambient/large")).toBe(AMBIENT_GLM_5_2_FP8_MODEL);
    expect(normalizeAmbientModelId("zai-org/GLM-5-FP8")).toBe(AMBIENT_GLM_5_2_FP8_MODEL);
    expect(normalizeAmbientModelId("zai-org/GLM-5.2-FP8")).toBe(AMBIENT_GLM_5_2_FP8_MODEL);
    expect(normalizeAmbientModelId(AMBIENT_GLM_5_1_FP8_MODEL)).toBe(AMBIENT_GLM_5_2_FP8_MODEL);
    expect(normalizeAmbientModelId("custom/model")).toBe("custom/model");
  });

  it("labels removed GLM ids as GLM 5.2", () => {
    expect(ambientModelLabel("ambient/large")).toBe("GLM 5.2");
  });

  it("preserves unknown models as unavailable runtime profiles", () => {
    const profile = resolveAmbientModelRuntimeProfile("custom/model");
    expect(profile).toMatchObject({
      modelId: "custom/model",
      available: false,
      selectableAsMain: false,
      selectableAsSubagent: false,
      label: "custom/model (unavailable)",
    });
  });

  it("resolves local text profiles as explicit unavailable local runtime placeholders", () => {
    expect(resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL)).toMatchObject({
      profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}`,
      providerId: "local",
      modelId: AMBIENT_LOCAL_TEXT_MODEL,
      label: "Local Text 4B",
      available: false,
      selectableAsMain: false,
      selectableAsSubagent: false,
      locality: "local",
      toolUse: "none",
      privacyLabel: "Local user-managed text runtime",
    });
    expect(AMBIENT_MODEL_OPTIONS).not.toContainEqual(expect.objectContaining({ id: AMBIENT_LOCAL_TEXT_MODEL }));
  });

  it("copies the exact resolved model profile into a run snapshot", () => {
    expect(createAmbientModelRuntimeSnapshot("custom/model", "2026-06-05T00:00:00.000Z")).toMatchObject({
      schemaVersion: "ambient-model-runtime-snapshot-v1",
      resolvedAt: "2026-06-05T00:00:00.000Z",
      requestedModelId: "custom/model",
      profile: {
        modelId: "custom/model",
        available: false,
      },
    });
  });

  it("can snapshot a runtime-resolved profile without making it statically selectable", () => {
    const configuredLocalProfile: AmbientModelRuntimeProfile = {
      ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
      profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
      selectableAsSubagent: true,
      available: true,
      unavailableReason: undefined,
      providerQuirks: ["Resolved from an active local runtime descriptor."],
    };

    expect(
      createAmbientModelRuntimeSnapshotFromProfile(AMBIENT_LOCAL_TEXT_MODEL, configuredLocalProfile, "2026-06-05T01:00:00.000Z"),
    ).toMatchObject({
      schemaVersion: "ambient-model-runtime-snapshot-v1",
      resolvedAt: "2026-06-05T01:00:00.000Z",
      requestedModelId: AMBIENT_LOCAL_TEXT_MODEL,
      profile: {
        profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
        available: true,
        selectableAsSubagent: true,
        locality: "local",
      },
    });
    expect(resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL).available).toBe(false);
    expect(AMBIENT_MODEL_OPTIONS).not.toContainEqual(expect.objectContaining({ id: AMBIENT_LOCAL_TEXT_MODEL }));
  });
});
