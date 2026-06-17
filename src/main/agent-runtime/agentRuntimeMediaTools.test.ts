import { describe, expect, it } from "vitest";

import { createMediaToolExtension } from "./agentRuntimeMediaTools";

describe("AgentRuntime media tools", () => {
  it("registers the media download tool through the extracted extension", () => {
    const registeredTools: Array<{ name: string; executionMode?: string; parameters?: unknown }> = [];
    const fakePi = {
      registerTool: (tool: any) => registeredTools.push(tool),
    } as any;

    createMediaToolExtension({ path: "/tmp/workspace" })(fakePi);

    expect(registeredTools).toHaveLength(1);
    expect(registeredTools[0]).toMatchObject({
      name: "media_download",
      executionMode: "sequential",
    });
    expect(registeredTools[0].parameters).toMatchObject({
      type: "object",
      required: ["url", "outputPath"],
    });
  });
});
