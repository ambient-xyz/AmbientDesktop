import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Model } from "@mariozechner/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type ExtensionFactory,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";

const tempRoots: string[] = [];

describe("Pi session tool activation", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("can keep extension tools registered without activating all of them", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-pi-tool-activation-"));
    tempRoots.push(root);
    const agentDir = join(root, ".pi");
    const settingsManager = SettingsManager.create(root, agentDir);
    const hiddenExtension: ExtensionFactory = (pi) => {
      pi.registerTool(hiddenTool());
    };
    const routerTool = testTool("router_tool");
    const resourceLoader = new DefaultResourceLoader({
      cwd: root,
      agentDir,
      settingsManager,
      extensionFactories: [hiddenExtension],
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd: root,
      agentDir,
      model: testModel(),
      thinkingLevel: "minimal",
      sessionManager: SessionManager.inMemory(root),
      settingsManager,
      resourceLoader,
      customTools: [routerTool],
      activeTools: ["read", "router_tool"],
      includeAllExtensionTools: false,
    });

    expect(session.getActiveToolNames().sort()).toEqual(["read", "router_tool"].sort());
    expect(session.getAllTools().map((tool) => tool.name)).toEqual(expect.arrayContaining(["read", "router_tool", "hidden_tool"]));
    expect(session.getToolDefinition("hidden_tool")).toBeTruthy();
  });
});

function hiddenTool(): ToolDefinition<any, any, any> {
  return testTool("hidden_tool");
}

function testTool(name: string): ToolDefinition<any, any, any> {
  return {
    name,
    label: name,
    description: `${name} description`,
    parameters: { type: "object", properties: {}, additionalProperties: false } as any,
    execute: async () => ({ content: [{ type: "text" as const, text: `${name} executed` }], details: {} }),
  };
}

function testModel(): Model<"openai-completions"> {
  return {
    id: "test-model",
    name: "test-model",
    api: "openai-completions",
    provider: "ambient",
    baseUrl: "https://api.ambient.xyz/v1",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 131072,
  };
}
