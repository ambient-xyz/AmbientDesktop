import { describe, expect, it } from "vitest";
import {
  AMBIENT_GLM_5_2_FP8_MODEL,
  AMBIENT_KIMI_K2_7_CODE_MODEL,
  resolveAmbientModelReasoningCapability,
} from "./ambientModels";
import { shapeModelReasoningPayload } from "./modelReasoningPayload";

describe("shapeModelReasoningPayload", () => {
  it("maps GLM Standard mode to ZAI high effort request fields", () => {
    const result = shapeModelReasoningPayload({
      payload: {
        model: AMBIENT_GLM_5_2_FP8_MODEL,
        messages: [{ role: "user", content: "do not leak this prompt" }],
      },
      thinkingLevel: "medium",
    });

    expect(result.changed).toBe(true);
    expect(result.payload).toMatchObject({
      model: AMBIENT_GLM_5_2_FP8_MODEL,
      enable_thinking: true,
      reasoning_effort: "high",
    });
    expect(result.evidence).toEqual({
      schemaVersion: "ambient-model-reasoning-payload-v1",
      modelId: AMBIENT_GLM_5_2_FP8_MODEL,
      requestedThinkingLevel: "medium",
      resolvedThinkingLevel: "medium",
      strategy: "zai-reasoning-effort",
      requestFields: ["enable_thinking", "reasoning_effort"],
      fieldPresence: {
        enable_thinking: true,
        reasoning_effort: true,
        thinking: false,
        reasoning: false,
      },
      reasoningEffort: "high",
      changed: true,
    });
    expect(JSON.stringify(result.evidence)).not.toContain("do not leak");
  });

  it("maps GLM Deep mode to ZAI max effort request fields", () => {
    const result = shapeModelReasoningPayload({
      payload: {
        model: AMBIENT_GLM_5_2_FP8_MODEL,
      },
      thinkingLevel: "xhigh",
    });

    expect(result.payload).toMatchObject({
      enable_thinking: true,
      reasoning_effort: "max",
    });
    expect(result.evidence).toMatchObject({
      resolvedThinkingLevel: "xhigh",
      reasoningEffort: "max",
    });
  });

  it("drops unsupported reasoning request controls for Kimi while preserving other payload fields", () => {
    const result = shapeModelReasoningPayload({
      payload: {
        model: AMBIENT_KIMI_K2_7_CODE_MODEL,
        enable_thinking: false,
        reasoning_effort: "none",
        thinking: { type: "disabled" },
        reasoning: { effort: "none" },
        tool_choice: "auto",
      },
      thinkingLevel: "xhigh",
    });

    expect(result.changed).toBe(true);
    expect(result.payload).toEqual({
      model: AMBIENT_KIMI_K2_7_CODE_MODEL,
      tool_choice: "auto",
    });
    expect(result.evidence).toMatchObject({
      modelId: AMBIENT_KIMI_K2_7_CODE_MODEL,
      requestedThinkingLevel: "xhigh",
      resolvedThinkingLevel: "medium",
      strategy: "omit-reasoning-controls",
      requestFields: [],
      fieldPresence: {
        enable_thinking: false,
        reasoning_effort: false,
        thinking: false,
        reasoning: false,
      },
      changed: true,
    });
  });

  it("preserves controls for unregistered models and reports the normalized model id", () => {
    const result = shapeModelReasoningPayload({
      payload: {
        model: "custom/model",
        enable_thinking: true,
        reasoning_effort: "high",
      },
      thinkingLevel: "high",
    });

    expect(result.changed).toBe(false);
    expect(result.payload).toEqual({
      model: "custom/model",
      enable_thinking: true,
      reasoning_effort: "high",
    });
    expect(result.evidence).toMatchObject({
      modelId: "custom/model",
      requestedThinkingLevel: "high",
      resolvedThinkingLevel: "high",
      strategy: "preserve-reasoning-controls",
      fieldPresence: {
        enable_thinking: true,
        reasoning_effort: true,
        thinking: false,
        reasoning: false,
      },
    });
  });

  it("uses runtime-discovered reasoning capabilities for non-static model ids", () => {
    const result = shapeModelReasoningPayload({
      payload: {
        model: "moonshotai/kimi-k2.6",
        enable_thinking: false,
        reasoning_effort: "none",
        tool_choice: "auto",
      },
      thinkingLevel: "xhigh",
      resolveReasoningCapability: (modelId) =>
        modelId === "moonshotai/kimi-k2.6"
          ? resolveAmbientModelReasoningCapability(AMBIENT_KIMI_K2_7_CODE_MODEL)
          : undefined,
    });

    expect(result.payload).toEqual({
      model: "moonshotai/kimi-k2.6",
      tool_choice: "auto",
    });
    expect(result.evidence).toMatchObject({
      modelId: "moonshotai/kimi-k2.6",
      resolvedThinkingLevel: "medium",
      strategy: "omit-reasoning-controls",
      changed: true,
    });
  });
});
