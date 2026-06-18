import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

import { createAmbientToolRouterTools } from "./agentRuntimeAmbientFacade";
import {
  AMBIENT_PRODUCT_IDENTITY_SYSTEM_PROMPT,
  createAmbientProductContextExtension,
  runAmbientProductContextTool,
} from "./agentRuntimeProductContextTools";
import {
  firstPartyDesktopToolDescriptors,
  productContextToolDescriptor,
  productContextToolDescriptors,
} from "./agentRuntimeDesktopToolFacade";

describe("Ambient product context tools", () => {
  it("registers a read-only product context tool and appends Desktop identity", async () => {
    const registeredTools: ToolDefinition<any, any, any>[] = [];
    const handlers: Record<string, (event: any) => Promise<any> | any> = {};
    const fakePi = {
      registerTool: (tool: ToolDefinition<any, any, any>) => registeredTools.push(tool),
      on: (event: string, handler: (event: any) => Promise<any> | any) => {
        handlers[event] = handler;
      },
    } as any;

    createAmbientProductContextExtension()(fakePi);

    const tool = registeredTools.find((candidate) => candidate.name === "ambient_product_context");
    expect(tool).toBeDefined();
    expect(tool).toMatchObject({
      description: expect.stringContaining("Ambient product identity"),
      executionMode: "sequential",
    });

    const startContext = await handlers.before_agent_start({ systemPrompt: "Base system prompt" });
    expect(startContext.systemPrompt).toContain("Base system prompt");
    expect(startContext.systemPrompt).toContain(AMBIENT_PRODUCT_IDENTITY_SYSTEM_PROMPT);
    expect(startContext.systemPrompt).toContain("You are Ambient/Pi running inside Ambient Desktop.");
    expect(startContext.systemPrompt).toContain("Do not conflate Ambient with unrelated ambient-code.ai");

    const result = await tool!.execute("product-context", { topic: "identity" }, undefined, undefined, {} as any);
    const text = result.content.map((part: any) => part.text ?? "").join("\n");
    expect(text).toContain("Ambient/Pi is the agent running inside Ambient Desktop.");
    expect(text).toContain("https://desktop.ambient.xyz/");
    expect(text).toContain("https://ambient.xyz/what-is-ambient");
    expect(result.details).toMatchObject({
      runtime: "ambient-product-context",
      toolName: "ambient_product_context",
      status: "complete",
      topic: "identity",
    });
  });

  it("returns candid Ambient Network maturity context from local canonical facts", () => {
    const result = runAmbientProductContextTool({ query: "What is the Ambient Network and can Desktop transact?" });
    const text = result.content.map((part: any) => part.text ?? "").join("\n");

    expect(result.details.topic).toBe("network");
    expect(text).toContain("Ambient Desktop is growing into the workstation/client for Ambient Network operations.");
    expect(text).toContain("live wallet flows and on-network transactions are still being built");
    expect(text).toContain("Ambient Mini Mining is Roadmap");
    expect(text).toContain("https://desktop.ambient.xyz/ambient-network/client/");
  });

  it("keeps product context registered as a first-party read-only descriptor", () => {
    const registryNames = new Set(firstPartyDesktopToolDescriptors().map((tool) => tool.name));
    for (const descriptor of productContextToolDescriptors) {
      expect(registryNames.has(descriptor.name)).toBe(true);
      expect(descriptor).toMatchObject({
        sideEffects: "none",
        permissionScope: "ambient-product-context-read",
        supportsDryRun: true,
        supportsUndo: false,
      });
    }
    expect(productContextToolDescriptor("ambient_product_context").promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("conflicting Ambient-branded products"),
        expect.stringContaining("Desktop-owned canonical product context"),
        expect.stringContaining("Preserve maturity labels"),
      ]),
    );
  });

  it("is discoverable through the Ambient tool router without being default-active", async () => {
    const registeredTools: ToolDefinition<any, any, any>[] = [];
    createAmbientProductContextExtension()({
      registerTool: (tool: ToolDefinition<any, any, any>) => registeredTools.push(tool),
      on: () => undefined,
    } as any);
    const active = ["read", "ambient_tool_search", "ambient_tool_describe", "ambient_tool_call"];
    let session: any;
    const routerTools = createAmbientToolRouterTools({ getSession: () => session });
    const allTools = [...registeredTools, ...routerTools];
    session = {
      getActiveToolNames: () => active,
      getAllTools: () => allTools,
      getToolDefinition: (name: string) => allTools.find((tool) => tool.name === name),
    };
    const [search] = routerTools;

    const result = await search.execute("search-product-context", { query: "Ambient Network official product identity", limit: 5 }, undefined, undefined, {} as any);
    const text = result.content.map((part: any) => part.text ?? "").join("\n");

    expect(text).toContain("ambient_product_context");
    expect((result.details as any).candidates).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "ambient_product_context", active: false })]),
    );
  });
});
