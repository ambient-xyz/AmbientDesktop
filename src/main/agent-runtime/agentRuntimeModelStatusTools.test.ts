import { describe, expect, it } from "vitest";

import {
  AMBIENT_GLM_5_2_FP8_MODEL,
  AMBIENT_KIMI_K2_7_CODE_MODEL,
} from "../../shared/ambientModels";
import type { ProviderStatus } from "../../shared/desktopTypes";
import { createModelRuntimeCatalog } from "../model-provider/modelRuntimeRegistry";
import {
  AMBIENT_MODEL_STATUS_TOOL_NAME,
  buildAmbientModelStatus,
  registerModelStatusTools,
} from "./agentRuntimeModelStatusTools";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("buildAmbientModelStatus", () => {
  it("reports Kimi as fixed-on reasoning with omitted thinking controls", () => {
    const status = buildAmbientModelStatus({
      requestedModelId: AMBIENT_KIMI_K2_7_CODE_MODEL,
      runningModelId: AMBIENT_KIMI_K2_7_CODE_MODEL,
      selectedThinkingLevel: "xhigh",
      providerStatus: providerStatus({ hasApiKey: true, model: AMBIENT_KIMI_K2_7_CODE_MODEL }),
      catalog: createModelRuntimeCatalog({ generatedAt: "2026-06-20T00:00:00.000Z" }),
    });

    expect(status).toMatchObject({
      schemaVersion: "ambient-running-model-status-v1",
      selected: {
        requestedModelId: AMBIENT_KIMI_K2_7_CODE_MODEL,
        effectiveModelId: AMBIENT_KIMI_K2_7_CODE_MODEL,
        label: "Kimi K2.7 Code",
        providerId: "ambient",
      },
      running: {
        modelId: AMBIENT_KIMI_K2_7_CODE_MODEL,
        matchesSelected: true,
      },
      provider: {
        id: "ambient",
        secretStatus: "available",
        supportsTools: true,
      },
      capabilities: {
        contextWindowTokens: 262_144,
        maxOutputTokens: 262_144,
        supportsVision: true,
        toolUse: "ambient-tools",
        structuredOutput: "schema",
      },
      reasoning: {
        control: "fixed_on",
        fixedReasoning: true,
        payloadStrategy: "omit-reasoning-controls",
        current: {
          requestedThinkingLevel: "xhigh",
          effectiveThinkingLevel: "medium",
          label: "Reasoning on",
        },
        requestFields: [],
        selectableThinkingLevels: [],
      },
      warnings: [],
    });
  });

  it("preserves a legacy GLM request while reporting effective GLM-5.2 runtime behavior", () => {
    const status = buildAmbientModelStatus({
      requestedModelId: "glm-5.1",
      runningModelId: AMBIENT_GLM_5_2_FP8_MODEL,
      selectedThinkingLevel: "xhigh",
      providerStatus: providerStatus({ hasApiKey: true, model: AMBIENT_GLM_5_2_FP8_MODEL }),
      catalog: createModelRuntimeCatalog({ generatedAt: "2026-06-20T00:00:00.000Z" }),
    });

    expect(status.selected).toMatchObject({
      requestedModelId: "glm-5.1",
      effectiveModelId: AMBIENT_GLM_5_2_FP8_MODEL,
      label: "GLM-5.2 FP8",
    });
    expect(status.running).toMatchObject({
      modelId: AMBIENT_GLM_5_2_FP8_MODEL,
      label: "GLM-5.2 FP8",
      matchesSelected: true,
    });
    expect(status.capabilities).toMatchObject({
      contextWindowTokens: 202_752,
      supportsVision: false,
      toolUse: "ambient-tools",
    });
    expect(status.reasoning).toMatchObject({
      control: "selectable_effort",
      defaultThinkingLevel: "medium",
      current: {
        requestedThinkingLevel: "xhigh",
        effectiveThinkingLevel: "xhigh",
        label: "Deep",
        providerEffort: "max",
      },
      payloadStrategy: "zai-reasoning-effort",
      requestFields: ["enable_thinking", "reasoning_effort"],
      selectableThinkingLevels: [
        expect.objectContaining({ thinkingLevel: "medium", label: "Standard" }),
        expect.objectContaining({ thinkingLevel: "xhigh", label: "Deep" }),
      ],
      effortByThinkingLevel: expect.objectContaining({ medium: "high", xhigh: "max" }),
    });
    expect(status.warnings).toEqual([]);
  });

  it("reports stored high as the current GLM Deep/max mode instead of the medium default", () => {
    const status = buildAmbientModelStatus({
      requestedModelId: AMBIENT_GLM_5_2_FP8_MODEL,
      runningModelId: AMBIENT_GLM_5_2_FP8_MODEL,
      selectedThinkingLevel: "high",
      providerStatus: providerStatus({ hasApiKey: true, model: AMBIENT_GLM_5_2_FP8_MODEL }),
      catalog: createModelRuntimeCatalog({ generatedAt: "2026-06-20T00:00:00.000Z" }),
    });

    expect(status.reasoning.defaultThinkingLevel).toBe("medium");
    expect(status.reasoning.current).toMatchObject({
      requestedThinkingLevel: "high",
      effectiveThinkingLevel: "xhigh",
      label: "Deep",
      providerEffort: "max",
    });
  });

  it("surfaces selected-vs-running model mismatches without blocking status", () => {
    const status = buildAmbientModelStatus({
      requestedModelId: AMBIENT_KIMI_K2_7_CODE_MODEL,
      runningModelId: AMBIENT_GLM_5_2_FP8_MODEL,
      selectedThinkingLevel: "medium",
      providerStatus: providerStatus({ hasApiKey: true, model: AMBIENT_GLM_5_2_FP8_MODEL }),
      catalog: createModelRuntimeCatalog({ generatedAt: "2026-06-20T00:00:00.000Z" }),
    });

    expect(status.running.matchesSelected).toBe(false);
    expect(status.capabilities).toMatchObject({
      contextWindowTokens: 202_752,
      supportsVision: false,
      toolUse: "ambient-tools",
    });
    expect(status.reasoning).toMatchObject({
      control: "selectable_effort",
      current: {
        requestedThinkingLevel: "medium",
        effectiveThinkingLevel: "medium",
        label: "Standard",
        providerEffort: "high",
      },
      payloadStrategy: "zai-reasoning-effort",
      requestFields: ["enable_thinking", "reasoning_effort"],
    });
    expect(status.warnings).toContain(
      `Selected model ${AMBIENT_KIMI_K2_7_CODE_MODEL} does not match running model ${AMBIENT_GLM_5_2_FP8_MODEL}.`,
    );
  });

  it("keeps unknown models visible with unsupported reasoning and missing secret status", () => {
    const status = buildAmbientModelStatus({
      requestedModelId: "custom/model",
      runningModelId: "custom/model",
      selectedThinkingLevel: "high",
      providerStatus: providerStatus({ hasApiKey: false, model: "custom/model" }),
      catalog: createModelRuntimeCatalog({ generatedAt: "2026-06-20T00:00:00.000Z" }),
    });

    expect(status.selected).toMatchObject({
      requestedModelId: "custom/model",
      effectiveModelId: "custom/model",
      label: "custom/model (unavailable)",
      providerId: "unknown",
    });
    expect(status.provider).toMatchObject({
      id: "ambient",
      secretStatus: "missing",
      storage: "none",
    });
    expect(status.reasoning).toMatchObject({
      control: "unsupported",
      current: {
        requestedThinkingLevel: "high",
        effectiveThinkingLevel: "high",
        label: "High",
      },
      payloadStrategy: "preserve-reasoning-controls",
    });
    expect(status.warnings).toContain("Model is not registered in this Ambient Desktop build.");
  });
});

describe("registerModelStatusTools", () => {
  it("registers the read-only model status tool and does not expose secret values", async () => {
    const registeredTools: RegisteredTool[] = [];
    const updates: any[] = [];
    registerModelStatusTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      requestedModelId: () => "glm-5.1",
      thinkingLevel: () => "xhigh",
      runningModel: () => ({ id: AMBIENT_GLM_5_2_FP8_MODEL, name: "GLM-5.2 FP8" }),
      providerStatus: () => providerStatus({
        hasApiKey: true,
        model: AMBIENT_GLM_5_2_FP8_MODEL,
        source: "env",
        storage: "environment",
      }),
      modelRuntimeCatalog: () => createModelRuntimeCatalog({ generatedAt: "2026-06-20T00:00:00.000Z" }),
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([AMBIENT_MODEL_STATUS_TOOL_NAME]);
    const result = await registeredTools[0]!.execute("model-status", {}, undefined, (update: any) => updates.push(update));

    expect(updates).toEqual([
      {
        content: [{ type: "text", text: "Inspecting Ambient model runtime status." }],
        details: { runtime: "ambient-model-status", toolName: AMBIENT_MODEL_STATUS_TOOL_NAME, status: "running" },
      },
    ]);
    expect(result.content[0].text).toContain("Ambient model status");
    expect(result.content[0].text).toContain("Reasoning: current Deep");
    expect(result.content[0].text).toContain("provider effort max");
    expect(result.content[0].text).toContain(AMBIENT_GLM_5_2_FP8_MODEL);
    expect(result.details.selected.requestedModelId).toBe("glm-5.1");
    expect(result.details.selected.effectiveModelId).toBe(AMBIENT_GLM_5_2_FP8_MODEL);
    expect(result.details.reasoning.current).toMatchObject({
      requestedThinkingLevel: "xhigh",
      effectiveThinkingLevel: "xhigh",
      label: "Deep",
      providerEffort: "max",
    });
    expect(result.details.provider.secretStatus).toBe("available");
    expect(JSON.stringify(result)).not.toContain("ambient_api_key");
    expect(JSON.stringify(result)).not.toContain("api-key");
    expect(JSON.stringify(result)).not.toContain("sk-test");
  });

  it("reads the running model lazily for reused sessions after model switches", async () => {
    const registeredTools: RegisteredTool[] = [];
    let runningModel = { id: AMBIENT_KIMI_K2_7_CODE_MODEL, name: "Kimi K2.7 Code" };
    registerModelStatusTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      requestedModelId: () => AMBIENT_KIMI_K2_7_CODE_MODEL,
      thinkingLevel: () => "xhigh",
      runningModel: () => runningModel,
      providerStatus: () => providerStatus({ hasApiKey: true, model: runningModel.id }),
      modelRuntimeCatalog: () => createModelRuntimeCatalog({ generatedAt: "2026-06-20T00:00:00.000Z" }),
    });

    const first = await registeredTools[0]!.execute("model-status", {}, undefined);
    expect(first.details.running).toMatchObject({
      modelId: AMBIENT_KIMI_K2_7_CODE_MODEL,
      matchesSelected: true,
    });
    expect(first.details.reasoning.current).toMatchObject({
      requestedThinkingLevel: "xhigh",
      effectiveThinkingLevel: "medium",
      label: "Reasoning on",
    });

    runningModel = { id: AMBIENT_GLM_5_2_FP8_MODEL, name: "GLM-5.2 FP8" };
    const second = await registeredTools[0]!.execute("model-status", {}, undefined);
    expect(second.details.running).toMatchObject({
      modelId: AMBIENT_GLM_5_2_FP8_MODEL,
      matchesSelected: false,
    });
    expect(second.details.reasoning).toMatchObject({
      control: "selectable_effort",
      current: {
        requestedThinkingLevel: "xhigh",
        effectiveThinkingLevel: "xhigh",
        label: "Deep",
        providerEffort: "max",
      },
      payloadStrategy: "zai-reasoning-effort",
    });
  });
});

function providerStatus(input: Partial<ProviderStatus> & { hasApiKey: boolean; model: string }): ProviderStatus {
  return {
    providerId: "ambient",
    providerLabel: "Ambient",
    baseUrl: "https://api.ambient.xyz/v1",
    debugOverride: false,
    source: input.hasApiKey ? "env" : "missing",
    storage: input.hasApiKey ? "environment" : "none",
    ...input,
  };
}
