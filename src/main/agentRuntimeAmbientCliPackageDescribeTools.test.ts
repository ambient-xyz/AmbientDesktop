import { describe, expect, it, vi } from "vitest";

import { ambientCliDescribeText } from "./agentRuntimeAmbientCliPackageDescribeModel";
import { registerAmbientCliPackageDescribeTool } from "./agentRuntimeAmbientCliPackageDescribeTools";

describe("agentRuntimeAmbientCliPackageDescribeTools", () => {
  it("describes an Ambient CLI package and marks it described", async () => {
    const workspace = { path: "/workspace" };
    const description = descriptionFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const describeAmbientCliPackage = vi.fn(async () => description);
    const markAmbientCliPackageDescribed = vi.fn();
    const modelComplete = vi.fn(async () => "summary");

    registerAmbientCliPackageDescribeTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      describeAmbientCliPackage,
      markAmbientCliPackageDescribed,
      modelComplete,
      env: { AMBIENT_CLI_RLM_SUMMARIES: "1" },
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_cli_describe"]);

    const result = await registeredTools[0].execute("describe", {
      packageName: "ambient-demo",
      command: "demo",
      includeSkill: true,
      includeSummary: true,
      maxSkillChars: 500,
    });

    expect(describeAmbientCliPackage).toHaveBeenCalledWith(workspace.path, {
      packageName: "ambient-demo",
      command: "demo",
      includeSkill: true,
      includeSummary: true,
      maxSkillChars: 500,
    }, {
      generateMissingSummaries: true,
      modelComplete,
    });
    expect(markAmbientCliPackageDescribed).toHaveBeenCalledWith("pkg-123", "ambient-demo");
    expect(result).toEqual({
      content: [{ type: "text", text: ambientCliDescribeText(description) }],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli_describe",
        packageId: "pkg-123",
        packageName: "ambient-demo",
        commandNames: ["demo"],
        skillCount: 1,
        includedSkillText: true,
        generatedSummary: true,
        summaryStatuses: ["available"],
        missingEnv: ["DEMO_KEY"],
      },
    });
  });

  it("omits blank and false optional fields like the inline runtime parser", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const describeAmbientCliPackage = vi.fn(async () => descriptionFixture());

    registerAmbientCliPackageDescribeTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" },
      describeAmbientCliPackage,
      markAmbientCliPackageDescribed: vi.fn(),
      env: {},
    });

    await registeredTools[0].execute("describe", {
      packageId: "",
      packageName: "",
      command: "",
      includeSkill: false,
      includeSummary: false,
      maxSkillChars: Number.NaN,
    });

    expect(describeAmbientCliPackage).toHaveBeenCalledWith("/workspace", {}, {
      generateMissingSummaries: false,
    });
  });

  it("does not attach model completion when summaries are disabled", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const describeAmbientCliPackage = vi.fn(async () => descriptionFixture());
    const modelComplete = vi.fn(async () => "summary");

    registerAmbientCliPackageDescribeTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" },
      describeAmbientCliPackage,
      markAmbientCliPackageDescribed: vi.fn(),
      modelComplete,
      env: { AMBIENT_CLI_RLM_SUMMARIES: "0" },
    });

    await registeredTools[0].execute("describe", { packageName: "ambient-demo" });

    expect(describeAmbientCliPackage).toHaveBeenCalledWith("/workspace", { packageName: "ambient-demo" }, {
      generateMissingSummaries: false,
    });
  });
});

function descriptionFixture(): any {
  return {
    package: {
      id: "pkg-123",
      name: "ambient-demo",
      version: "0.0.0",
      description: "Generated demo package.",
      source: "local",
      installed: true,
      availability: "available",
      availabilityReason: "ready",
    },
    commands: [
      {
        capabilityId: "pkg-123:command:demo",
        sourceKind: "ambient-cli",
        name: "demo",
        description: "Run demo.",
        command: "node",
        descriptorArgs: ["demo.js"],
        cwd: "package",
        health: "passed",
        risk: [],
        invocation: {
          packageName: "ambient-demo",
          command: "demo",
        },
      },
    ],
    skills: [
      {
        capabilityId: "pkg-123:skill:demo",
        sourceKind: "ambient-cli",
        name: "demo-skill",
        description: "Use demo.",
        path: "/workspace/.ambient/cli-packages/ambient-demo/skills/demo/SKILL.md",
        summaryStatus: "available",
        summary: {
          schemaVersion: "ambient-cli-skill-summary-v1",
          packageId: "pkg-123",
          packageName: "ambient-demo",
          packageSource: "local",
          skillPath: "/workspace/.ambient/cli-packages/ambient-demo/skills/demo/SKILL.md",
          rawSkillHash: "hash",
          generatedAt: "2026-06-10T00:00:00.000Z",
          capabilityBrief: "Demo capability.",
          whenToUse: ["when demoing"],
          commands: { demo: "Run demo." },
          arguments: [],
          safety: ["safe demo"],
        },
        text: "Skill body",
        truncated: false,
      },
    ],
    env: [
      {
        name: "DEMO_KEY",
        required: true,
        configured: false,
      },
    ],
    guidance: ["Describe before running."],
    diagnostics: ["diagnostic"],
  };
}
