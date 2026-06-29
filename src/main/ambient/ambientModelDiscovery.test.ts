import { describe, expect, it, vi } from "vitest";

import {
  AMBIENT_GLM_5_1_FP8_MODEL,
  AMBIENT_GLM_5_2_FP8_MODEL,
} from "../../shared/ambientModels";
import {
  ambientModelDiscoveryResultFromPayload,
  discoverAmbientModelRuntimeProfiles,
} from "./ambientModelDiscovery";

describe("ambient model discovery", () => {
  it("builds runtime profiles from ready Ambient /v1/models rows", () => {
    const result = ambientModelDiscoveryResultFromPayload("https://api.ambient.xyz/v1/models", {
      data: [
        {
          id: AMBIENT_GLM_5_2_FP8_MODEL,
          name: "GLM 5.2",
          input_modalities: ["text"],
          context_length: 202752,
          max_output_length: 202752,
          supported_features: ["tools", "json_mode", "structured_outputs", "reasoning", "logprobs"],
          hugging_face_id: "zai-org/GLM-5.2-FP8",
          is_ready: true,
        },
        {
          id: "moonshotai/kimi-k2.6",
          name: "Kimi K2.6",
          input_modalities: ["text", "image"],
          context_length: 262144,
          max_output_length: 262144,
          supported_features: ["tools", "json_mode", "structured_outputs", "reasoning"],
          is_ready: true,
        },
        {
          id: AMBIENT_GLM_5_1_FP8_MODEL,
          name: "Example Model",
          input_modalities: ["text"],
          supported_features: ["tools", "json_mode", "structured_outputs", "reasoning"],
          is_ready: false,
        },
      ],
    });

    expect(result.receivedModelCount).toBe(3);
    expect(result.readyModelCount).toBe(2);
    expect(result.profiles.map((profile) => profile.modelId)).toEqual([
      AMBIENT_GLM_5_2_FP8_MODEL,
      "moonshotai/kimi-k2.6",
    ]);
    expect(result.profiles[0]).toMatchObject({
      label: "GLM 5.2",
      selectableAsMain: true,
      selectableAsSubagent: true,
      contextWindowTokens: 202752,
      maxOutputTokens: 202752,
      toolUse: "ambient-tools",
      structuredOutput: "schema",
      supportsVision: false,
      reasoningCapability: {
        control: "selectable_effort",
        payloadStrategy: "zai-reasoning-effort",
      },
    });
    expect(result.profiles[1]).toMatchObject({
      label: "Kimi K2.6",
      supportsVision: true,
      reasoningCapability: {
        control: "fixed_on",
        payloadStrategy: "omit-reasoning-controls",
      },
    });
    expect(result.profiles).not.toContainEqual(expect.objectContaining({ modelId: AMBIENT_GLM_5_1_FP8_MODEL }));
  });

  it("normalizes legacy ready GLM endpoint ids to the canonical Ambient id", () => {
    const result = ambientModelDiscoveryResultFromPayload("https://api.ambient.xyz/v1/models", {
      data: [
        {
          id: "zai-org/GLM-5.2-FP8",
          name: "GLM 5.2",
          input_modalities: ["text"],
          supported_features: ["tools", "structured_outputs", "reasoning"],
          ready: true,
        },
      ],
    });

    expect(result.profiles).toEqual([
      expect.objectContaining({
        modelId: AMBIENT_GLM_5_2_FP8_MODEL,
        profileId: `ambient:${AMBIENT_GLM_5_2_FP8_MODEL}`,
      }),
    ]);
  });

  it("fetches the normalized Ambient models endpoint with bearer auth", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as unknown as typeof fetch;

    await discoverAmbientModelRuntimeProfiles({
      apiKey: "test-key",
      baseUrl: "https://ambient.example",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://ambient.example/v1/models", expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({
        Authorization: "Bearer test-key",
        Accept: "application/json",
      }),
    }));
  });
});
