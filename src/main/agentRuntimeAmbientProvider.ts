import type { Model } from "@mariozechner/pi-ai";
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { ambientModelLabel, normalizeAmbientModelId, resolveAmbientModelRuntimeProfile } from "../shared/ambientModels";

export function ambientModel(modelId: string, baseUrl: string): Model<"openai-completions"> {
  const normalizedModelId = normalizeAmbientModelId(modelId);
  const profile = resolveAmbientModelRuntimeProfile(normalizedModelId);
  return {
    id: normalizedModelId,
    name: ambientModelLabel(normalizedModelId),
    api: "openai-completions",
    provider: "ambient",
    baseUrl,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "zai",
      zaiToolStream: true,
    },
    reasoning: true,
    input: profile.supportsVision ? ["text", "image"] : ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 200000,
    maxTokens: 131072,
  };
}

export function createAmbientProviderExtension(model: Model<"openai-completions">): ExtensionFactory {
  return (pi) => {
    pi.registerProvider("ambient", {
      baseUrl: model.baseUrl,
      apiKey: "AMBIENT_API_KEY",
      api: "openai-completions",
      models: [model],
    });
  };
}
