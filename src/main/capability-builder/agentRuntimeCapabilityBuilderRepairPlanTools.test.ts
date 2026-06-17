import { describe, expect, it, vi } from "vitest";

import { registerCapabilityBuilderRepairPlanTool } from "./agentRuntimeCapabilityBuilderRepairPlanTools";

describe("agentRuntimeCapabilityBuilderRepairPlanTools", () => {
  it("registers ambient_capability_builder_repair_plan and returns planned details", async () => {
    const workspace = { path: "/workspace" };
    const input = {
      sourcePath: ".ambient/capability-builder/packages/ambient-demo",
      requestedRepair: "Fix static descriptor errors.",
    };
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseRepairPlanInput = vi.fn(() => input);
    const planCapabilityBuilderRepair = vi.fn(async () => repairPlanFixture());

    registerCapabilityBuilderRepairPlanTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      parseRepairPlanInput,
      planCapabilityBuilderRepair,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_capability_builder_repair_plan"]);

    const result = await registeredTools[0].execute("repair-plan", input);

    expect(parseRepairPlanInput).toHaveBeenCalledWith(input);
    expect(planCapabilityBuilderRepair).toHaveBeenCalledWith(workspace.path, input);
    expect(result.content[0].text).toContain("Ambient Capability Builder repair plan");
    expect(result.content[0].text).toContain("Mode: read-only planning");
    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_repair_plan",
      status: "planned",
      packageName: "ambient-demo",
      rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
      relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
      gitSha: "abc123",
      requestedRepair: "Fix static descriptor errors.",
      errorCount: 1,
      warningCount: 1,
      commandNames: ["demo"],
      envNames: ["DEMO_API_KEY"],
      artifactOutputTypes: ["json"],
      mutationProhibited: true,
    });
  });
});

function repairPlanFixture(): any {
  return {
    packageName: "ambient-demo",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    gitSha: "abc123",
    requestedRepair: "Fix static descriptor errors.",
    notes: "Keep command behavior stable.",
    preview: {
      packageName: "ambient-demo",
      rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
      relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
      gitSha: "abc123",
      valid: false,
      installerShape: "custom-cli",
      errors: ["Descriptor name is required."],
      warnings: [],
      risks: [],
      files: {
        descriptor: true,
        skill: true,
        buildManifest: true,
        packageJson: true,
      },
      descriptor: {
        name: "ambient-demo",
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
      sourcePath: ".ambient/capability-builder/packages/ambient-demo",
      refs: { scaffold: "abc123" },
    },
    sourceInventory: {
      packageFiles: ["ambient-cli.json", "SKILL.md", "index.mjs"],
      logFiles: ["logs/validate.log"],
      metadataFiles: ["capability-build.json"],
      possibleArtifactFiles: [],
    },
    diagnosticEvidence: {
      recommendedReads: ["ambient-cli.json", "logs/validate.log"],
      recentLogEntries: [
        {
          path: "logs/validate.log",
          lineCount: 1,
          entries: ["Descriptor name is required."],
        },
      ],
    },
    recommendedSteps: ["Repair static preview errors first."],
    installerRecoveryGuidance: ["Keep dependency setup explicit."],
    installerRecoveryTemplates: [
      {
        id: "node-wrapper",
        label: "Node wrapper repair",
        appliesWhen: "The command wrapper is JavaScript-based.",
        steps: ["Inspect package.json.", "Repair wrapper args."],
        privilegedBoundary: "No dependency install until approved.",
      },
    ],
    approvalCheckpoints: ["User approves the repair plan before any file edits."],
    validationPlan: ["Run preview after edits."],
    rollbackPlan: ["Use git history to revert builder source edits."],
    warnings: ["Artifact outputs are declared but tests/smoke.test.mjs is missing."],
    errors: ["Descriptor name is required."],
    mutationProhibited: true,
  };
}
