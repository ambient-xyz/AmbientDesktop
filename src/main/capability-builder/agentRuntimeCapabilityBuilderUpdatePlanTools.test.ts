import { describe, expect, it, vi } from "vitest";

import { registerCapabilityBuilderUpdatePlanTool } from "./agentRuntimeCapabilityBuilderUpdatePlanTools";

describe("agentRuntimeCapabilityBuilderUpdatePlanTools", () => {
  it("registers ambient_capability_builder_update_plan and returns planned details", async () => {
    const workspace = { path: "/workspace" };
    const input = {
      sourcePath: ".ambient/capability-builder/packages/ambient-demo",
      requestedChanges: "Add a summary command.",
      targetVersion: "1.1.0",
    };
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseUpdatePlanInput = vi.fn(() => input);
    const planCapabilityBuilderUpdate = vi.fn(async () => updatePlanFixture());

    registerCapabilityBuilderUpdatePlanTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      parseUpdatePlanInput,
      planCapabilityBuilderUpdate,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_capability_builder_update_plan"]);

    const result = await registeredTools[0].execute("update-plan", input);

    expect(parseUpdatePlanInput).toHaveBeenCalledWith(input);
    expect(planCapabilityBuilderUpdate).toHaveBeenCalledWith(workspace.path, input);
    expect(result.content[0].text).toContain("Ambient Capability Builder update plan");
    expect(result.content[0].text).toContain("Mode: read-only planning");
    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_update_plan",
      status: "planned",
      packageName: "ambient-demo",
      rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
      relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
      gitSha: "abc123",
      requestedChanges: "Add a summary command.",
      targetVersion: "1.1.0",
      errorCount: 0,
      warningCount: 1,
      commandNames: ["demo"],
      envNames: ["DEMO_API_KEY"],
      artifactOutputTypes: ["json"],
      mutationProhibited: true,
    });
  });

  it("reports blocked status when the update plan has static errors", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];

    registerCapabilityBuilderUpdatePlanTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" },
      parseUpdatePlanInput: () => ({ packageName: "ambient-broken" }),
      planCapabilityBuilderUpdate: async () => updatePlanFixture({
        packageName: "ambient-broken",
        errors: ["Descriptor name is required."],
      }),
    });

    const result = await registeredTools[0].execute("update-plan", { packageName: "ambient-broken" });

    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_update_plan",
      status: "blocked",
      packageName: "ambient-broken",
      errorCount: 1,
      mutationProhibited: true,
    });
  });
});

function updatePlanFixture(overrides: Record<string, unknown> = {}): any {
  const packageName = (overrides.packageName as string | undefined) ?? "ambient-demo";
  const rootPath = `/workspace/.ambient/capability-builder/packages/${packageName}`;
  const relativeRootPath = `.ambient/capability-builder/packages/${packageName}`;
  const errors = (overrides.errors as string[] | undefined) ?? [];
  return {
    packageName,
    rootPath,
    relativeRootPath,
    gitSha: "abc123",
    requestedChanges: "Add a summary command.",
    targetVersion: "1.1.0",
    notes: "Keep the command contract stable.",
    preview: {
      packageName,
      rootPath,
      relativeRootPath,
      gitSha: "abc123",
      valid: errors.length === 0,
      installerShape: "custom-cli",
      errors,
      warnings: [],
      risks: [],
      files: {
        descriptor: true,
        skill: true,
        buildManifest: true,
        packageJson: true,
      },
      descriptor: {
        name: packageName,
        version: "1.0.0",
        description: "Demo capability.",
        commandNames: ["demo"],
        voiceProviderCommandNames: [],
        voiceDiscoveryCommandNames: [],
        voiceCloningCommandNames: [],
        envNames: ["DEMO_API_KEY"],
        envRequirements: [{ name: "DEMO_API_KEY", required: true, description: "Demo API key." }],
        networkHosts: ["api.demo.example"],
        modelAssets: [],
        artifactOutputTypes: ["json"],
        responseFormats: ["JSON"],
      },
      packageJson: {
        dependencies: [],
        devDependencies: [],
        lifecycleScripts: [],
      },
    },
    buildManifest: {
      status: "draft",
      goal: "Demo capability.",
      installerShape: "custom-cli",
      kind: "tool",
      provider: "Demo",
      version: "1.0.0",
      sourcePath: relativeRootPath,
      refs: { scaffold: "abc123" },
    },
    recommendedSteps: ["Inspect current files.", "Plan the edit."],
    approvalCheckpoints: ["User approves the update plan before any file edits."],
    rollbackPlan: ["Use git history to revert builder source edits."],
    warnings: ["Existing package dependencies require an explicit dependency preview before install/update: zod."],
    errors,
    mutationProhibited: true,
  };
}
