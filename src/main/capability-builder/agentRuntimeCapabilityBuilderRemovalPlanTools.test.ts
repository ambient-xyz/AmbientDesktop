import { describe, expect, it, vi } from "vitest";

import { registerCapabilityBuilderRemovalPlanTool } from "./agentRuntimeCapabilityBuilderRemovalPlanTools";

describe("agentRuntimeCapabilityBuilderRemovalPlanTools", () => {
  it("registers ambient_capability_builder_removal_plan and returns planned details", async () => {
    const workspace = { path: "/workspace" };
    const input = {
      sourcePath: ".ambient/capability-builder/packages/ambient-demo",
      installedPackageId: "ambient-demo",
      reason: "Retire old test capability.",
    };
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseRemovalPlanInput = vi.fn(() => input);
    const planCapabilityBuilderRemoval = vi.fn(async () => removalPlanFixture());

    registerCapabilityBuilderRemovalPlanTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      parseRemovalPlanInput,
      planCapabilityBuilderRemoval,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_capability_builder_removal_plan"]);

    const result = await registeredTools[0].execute("removal-plan", input);

    expect(parseRemovalPlanInput).toHaveBeenCalledWith(input);
    expect(planCapabilityBuilderRemoval).toHaveBeenCalledWith(workspace.path, input);
    expect(result.content[0].text).toContain("Ambient Capability Builder removal plan");
    expect(result.content[0].text).toContain("Mode: read-only planning");
    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_removal_plan",
      status: "planned",
      packageName: "ambient-demo",
      rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
      relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
      gitSha: "abc123",
      sourceExists: true,
      installedPackageId: "ambient-demo",
      installedSource: ".ambient/capability-builder/packages/ambient-demo",
      errorCount: 0,
      warningCount: 1,
      commandNames: ["demo"],
      envNames: ["DEMO_API_KEY"],
      artifactOutputTypes: ["json"],
      logFileCount: 1,
      possibleArtifactFileCount: 2,
      mutationProhibited: true,
    });
  });

  it("reports blocked status when removal planning has errors", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];

    registerCapabilityBuilderRemovalPlanTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" },
      parseRemovalPlanInput: () => ({ packageName: "ambient-broken" }),
      planCapabilityBuilderRemoval: async () => removalPlanFixture({
        packageName: "ambient-broken",
        errors: ["Descriptor name is required."],
      }),
    });

    const result = await registeredTools[0].execute("removal-plan", { packageName: "ambient-broken" });

    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_removal_plan",
      status: "blocked",
      packageName: "ambient-broken",
      errorCount: 1,
      mutationProhibited: true,
    });
  });
});

function removalPlanFixture(overrides: Record<string, unknown> = {}): any {
  const packageName = (overrides.packageName as string | undefined) ?? "ambient-demo";
  const rootPath = `/workspace/.ambient/capability-builder/packages/${packageName}`;
  const relativeRootPath = `.ambient/capability-builder/packages/${packageName}`;
  const errors = (overrides.errors as string[] | undefined) ?? [];
  return {
    packageName,
    rootPath,
    relativeRootPath,
    gitSha: "abc123",
    sourceExists: true,
    installedPackageId: packageName,
    installedSource: relativeRootPath,
    reason: "Retire old test capability.",
    notes: "Keep source available for rollback.",
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
      status: "registered",
      goal: "Demo capability.",
      installerShape: "custom-cli",
      kind: "tool",
      provider: "Demo",
      version: "1.0.0",
      sourcePath: relativeRootPath,
      installedPackageId: packageName,
      installedSource: relativeRootPath,
      refs: { installed: "def456" },
    },
    sourceInventory: {
      packageFiles: ["ambient-cli.json", "SKILL.md", "index.mjs"],
      logFiles: ["logs/validate.log"],
      metadataFiles: ["capability-build.json"],
      possibleArtifactFiles: ["artifacts/sample.json", "artifacts/old.json"],
    },
    recommendedSteps: ["Confirm installed package target."],
    approvalCheckpoints: ["User approves installed package unregister/removal target before Ambient CLI package state changes."],
    rollbackPlan: ["Use current builder source Git SHA abc123 as the rollback source ref."],
    preserveByDefault: ["managed builder source", "validation logs"],
    warnings: ["No installed package id or installed source was provided or found in builder metadata."],
    errors,
    mutationProhibited: true,
  };
}
