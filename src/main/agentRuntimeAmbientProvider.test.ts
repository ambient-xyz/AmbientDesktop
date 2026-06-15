import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL, AMBIENT_KIMI_K2_7_CODE_MODEL } from "../shared/ambientModels";
import { ambientModel, createAmbientProviderExtension } from "./agentRuntimeAmbientProvider";

describe("agentRuntimeAmbientProvider", () => {
  it("builds the Ambient Pi model descriptor", () => {
    expect(ambientModel("glm-5.1", "https://ambient.example/v1")).toEqual({
      id: AMBIENT_DEFAULT_MODEL,
      name: "GLM-5.1 FP8",
      api: "openai-completions",
      provider: "ambient",
      baseUrl: "https://ambient.example/v1",
      compat: {
        supportsDeveloperRole: false,
        thinkingFormat: "zai",
        zaiToolStream: true,
      },
      reasoning: true,
      input: ["text"],
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      contextWindow: 200000,
      maxTokens: 131072,
    });
  });

  it("advertises image input only for vision-capable Ambient models", () => {
    expect(ambientModel(AMBIENT_DEFAULT_MODEL, "https://ambient.example/v1").input).toEqual(["text"]);
    expect(ambientModel(AMBIENT_KIMI_K2_7_CODE_MODEL, "https://ambient.example/v1").input).toEqual(["text", "image"]);
  });

  it("registers the Ambient provider with Pi", () => {
    const model = ambientModel(AMBIENT_DEFAULT_MODEL, "https://ambient.example/v1");
    const registrations: Array<{ providerId: string; provider: unknown }> = [];
    const pi = {
      registerProvider(providerId: string, provider: unknown) {
        registrations.push({ providerId, provider });
      },
    };

    createAmbientProviderExtension(model)(pi as never);

    expect(registrations).toEqual([
      {
        providerId: "ambient",
        provider: {
          baseUrl: "https://ambient.example/v1",
          apiKey: "AMBIENT_API_KEY",
          api: "openai-completions",
          models: [model],
        },
      },
    ]);
  });
});
