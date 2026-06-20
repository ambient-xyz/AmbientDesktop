import { describe, expect, it } from "vitest";
import {
  AMBIENT_DEFAULT_MODEL,
  AMBIENT_GLM_5_1_FP8_MODEL,
  AMBIENT_GLM_5_2_FP8_MODEL,
  AMBIENT_KIMI_K2_7_CODE_MODEL,
  AMBIENT_LOCAL_TEXT_MODEL,
  AMBIENT_MODEL_OPTIONS,
  AMBIENT_PROVIDER_LOCAL,
  ambientModelRuntimeCatalogFromProfiles,
  ambientModelOptionsFromRuntimeProfiles,
  ambientModelLabel,
  createAmbientModelRuntimeSnapshot,
  createAmbientModelRuntimeSnapshotFromProfile,
  normalizeAmbientModelId,
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
        label: "GLM-5.2 FP8",
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

    expect(ambientModelOptionsFromRuntimeProfiles([
      ambientProfile,
      configuredLocalMain,
      {
        ...ambientProfile,
        profileId: "future-subagent-only",
        modelId: "future/subagent-only",
        selectableAsMain: false,
        selectableAsSubagent: true,
      },
    ])).toEqual([
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
      selectableMainModelOptions: [
        expect.objectContaining({ id: AMBIENT_DEFAULT_MODEL }),
      ],
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
    });
    expect(resolveAmbientModelRuntimeProfile(AMBIENT_GLM_5_2_FP8_MODEL)).toMatchObject({
      providerId: "ambient",
      modelId: AMBIENT_GLM_5_2_FP8_MODEL,
      label: "GLM-5.2 FP8",
      available: true,
      selectableAsMain: true,
      selectableAsSubagent: true,
      contextWindowTokens: 202_752,
      maxOutputTokens: 202_752,
      toolUse: "ambient-tools",
      structuredOutput: "schema",
      supportsVision: false,
      privacyLabel: "Ambient managed cloud model",
    });
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
    expect(normalizeAmbientModelId(AMBIENT_GLM_5_1_FP8_MODEL)).toBe(AMBIENT_GLM_5_2_FP8_MODEL);
    expect(normalizeAmbientModelId("custom/model")).toBe("custom/model");
  });

  it("labels removed GLM ids as GLM-5.2 FP8", () => {
    expect(ambientModelLabel("ambient/large")).toBe("GLM-5.2 FP8");
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

    expect(createAmbientModelRuntimeSnapshotFromProfile(
      AMBIENT_LOCAL_TEXT_MODEL,
      configuredLocalProfile,
      "2026-06-05T01:00:00.000Z",
    )).toMatchObject({
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
