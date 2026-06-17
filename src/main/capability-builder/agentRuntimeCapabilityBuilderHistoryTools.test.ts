import { describe, expect, it, vi } from "vitest";

import { registerCapabilityBuilderHistoryTool } from "./agentRuntimeCapabilityBuilderHistoryTools";

describe("agentRuntimeCapabilityBuilderHistoryTools", () => {
  it("registers ambient_capability_builder_history and returns history counts", async () => {
    const workspace = { path: "/workspace" };
    const input = { packageName: "ambient-demo", includeRegistered: false };
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseHistoryInput = vi.fn(() => input);
    const discoverCapabilityBuilderHistory = vi.fn(async () => historyFixture());

    registerCapabilityBuilderHistoryTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      parseHistoryInput,
      discoverCapabilityBuilderHistory,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_capability_builder_history"]);

    const result = await registeredTools[0].execute("history", input);

    expect(parseHistoryInput).toHaveBeenCalledWith(input);
    expect(discoverCapabilityBuilderHistory).toHaveBeenCalledWith(workspace.path, input);
    expect(result.content[0].text).toContain("Ambient Capability Builder history");
    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_history",
      status: "listed",
      rootPath: "/workspace/.ambient/capability-builder/packages",
      relativeRootPath: ".ambient/capability-builder/packages",
      packageCount: 2,
      unregisteredCount: 1,
      errorCount: 1,
      packageNames: ["ambient-demo", "ambient-old"],
    });
  });
});

function historyFixture(): any {
  return {
    rootPath: "/workspace/.ambient/capability-builder/packages",
    relativeRootPath: ".ambient/capability-builder/packages",
    errors: ["catalog warning"],
    entries: [
      {
        packageName: "ambient-demo",
        rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
        relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
        gitSha: "abc123",
        valid: true,
        status: "draft",
        installedPresent: false,
        validationArtifacts: [],
        refs: {},
        commandNames: ["demo"],
        envNames: ["DEMO_API_KEY"],
        artifactOutputTypes: ["json"],
        logFiles: [],
        possibleArtifactFiles: [],
        errors: [],
        warnings: [],
      },
      {
        packageName: "ambient-old",
        rootPath: "/workspace/.ambient/capability-builder/packages/ambient-old",
        relativeRootPath: ".ambient/capability-builder/packages/ambient-old",
        valid: true,
        status: "unregistered",
        installedPresent: false,
        validationArtifacts: [],
        refs: { installed: "def456" },
        commandNames: ["old"],
        envNames: [],
        artifactOutputTypes: [],
        logFiles: ["logs/validate.log"],
        possibleArtifactFiles: [],
        errors: [],
        warnings: ["stale package"],
      },
    ],
  };
}
