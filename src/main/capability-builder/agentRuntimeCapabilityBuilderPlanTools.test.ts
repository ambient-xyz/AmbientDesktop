import { describe, expect, it, vi } from "vitest";

import {
  registerCapabilityBuilderPlanTool,
  type CapabilityBuilderPlanToolInput,
} from "./agentRuntimeCapabilityBuilderPlanTools";

describe("agentRuntimeCapabilityBuilderPlanTools", () => {
  it("registers ambient_capability_builder_plan and returns planned details", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const input: CapabilityBuilderPlanToolInput = {
      goal: "Set up a tiny provider",
      capabilityName: "tiny-provider",
      installerShape: "cloud-api",
      kind: "provider",
      provider: "Tiny API",
      outputFileArtifacts: ["json"],
      responseFormats: ["application/json"],
      locality: "network",
      envNames: ["TINY_API_KEY"],
      networkHosts: ["api.tiny.example"],
      modelAssets: [],
      providerCatalogCards: [{ id: "provider.tiny" }],
      researchPlanningRisks: ["risk note"],
    };
    const parsePlanInput = vi.fn(() => input);
    const planText = vi.fn(() => "Capability Builder plan text.");
    const routePreflight = vi.fn(() => undefined);

    registerCapabilityBuilderPlanTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      parsePlanInput,
      planText,
      routePreflight,
      latestInstallRouteLane: () => undefined,
      mcpAutowirePlanned: () => false,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_capability_builder_plan"]);

    const result = await registeredTools[0].execute("plan", { goal: input.goal });

    expect(parsePlanInput).toHaveBeenCalledWith({ goal: input.goal });
    expect(routePreflight).toHaveBeenCalledWith(input, {
      latestInstallRouteLane: undefined,
      mcpAutowirePlanned: false,
    });
    expect(planText).toHaveBeenCalledWith(input);
    expect(result.content[0].text).toBe("Capability Builder plan text.");
    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_plan",
      status: "planned",
      goal: input.goal,
      capabilityName: "tiny-provider",
      installerShape: "cloud-api",
      provider: "Tiny API",
      envNames: ["TINY_API_KEY"],
      networkHosts: ["api.tiny.example"],
      providerCatalogCards: [{ id: "provider.tiny" }],
      researchPlanningRisks: ["risk note"],
    });
  });

  it("returns MCP route preflight result before creating a capability plan", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const input: CapabilityBuilderPlanToolInput = {
      goal: "Install github.com/example/mcp-server",
      kind: "mcp",
    };
    const planText = vi.fn(() => "Should not be used.");
    const routePreflight = vi.fn(() => ({
      text: "No Capability Builder plan created.",
      details: {
        runtime: "ambient-capability-builder",
        toolName: "ambient_capability_builder_plan",
        status: "mcp-route-required",
        executionSkipped: true,
        latestInstallRouteLane: "mcp-autowire",
      },
    }));

    registerCapabilityBuilderPlanTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      parsePlanInput: () => input,
      planText,
      routePreflight,
      latestInstallRouteLane: () => "mcp-autowire",
      mcpAutowirePlanned: () => false,
    });

    const result = await registeredTools[0].execute("plan", { goal: input.goal });

    expect(routePreflight).toHaveBeenCalledWith(input, {
      latestInstallRouteLane: "mcp-autowire",
      mcpAutowirePlanned: false,
    });
    expect(planText).not.toHaveBeenCalled();
    expect(result.content[0].text).toBe("No Capability Builder plan created.");
    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_plan",
      status: "mcp-route-required",
      executionSkipped: true,
      latestInstallRouteLane: "mcp-autowire",
    });
  });
});
