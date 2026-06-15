import { describe, expect, it } from "vitest";

import { ambientCliDescribeDetails, ambientCliDescribeInput, ambientCliDescribeText } from "./agentRuntimeAmbientCliPackageDescribeModel";

describe("agentRuntimeAmbientCliPackageDescribeModel", () => {
  it("parses Ambient CLI describe params", () => {
    expect(ambientCliDescribeInput({
      packageId: "pkg-123",
      packageName: "ambient-demo",
      command: "demo",
      includeSkill: true,
      includeSummary: true,
      maxSkillChars: 500,
    })).toEqual({
      packageId: "pkg-123",
      packageName: "ambient-demo",
      command: "demo",
      includeSkill: true,
      includeSummary: true,
      maxSkillChars: 500,
    });
  });

  it("omits blank, false, and non-finite optional fields", () => {
    expect(ambientCliDescribeInput({
      packageId: "",
      packageName: " ",
      command: 42,
      includeSkill: false,
      includeSummary: false,
      maxSkillChars: Number.NaN,
    })).toEqual({});
  });

  it("builds Ambient CLI describe result details", () => {
    expect(ambientCliDescribeDetails(descriptionFixture(), true)).toEqual({
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
    });
  });

  it("formats Ambient CLI describe text", () => {
    expect(ambientCliDescribeText(richDescriptionFixture())).toBe([
      "Ambient CLI capability description",
      "Package: ambient-demo",
      "Package id: pkg-123",
      "Description: Generated demo package.",
      "Availability: available - ready",
      "Env: DEMO_KEY=missing",
      "Commands: demo",
      "Command: demo",
      "Capability id: pkg-123:command:demo",
      "Description: Run demo.",
      "Descriptor command: node demo.js",
      "Cwd policy: package",
      "Health: passed",
      "Risk: ",
      "Invocation: ambient_cli packageName=\"ambient-demo\" command=\"demo\" args=[...]",
      "Skill: demo-skill",
      "Capability id: pkg-123:skill:demo",
      "Description: Use demo.",
      "Summary: available",
      "Summary brief: Demo capability.",
      "When to use: when demoing",
      "Summary commands: demo: Run demo.",
      "Safety: safe demo",
      "Skill text:\nSkill body",
      "Guidance:",
      "- Describe before running.",
      "Diagnostics:",
      "- diagnostic",
    ].join("\n"));
  });
});

function descriptionFixture(): any {
  return {
    package: {
      id: "pkg-123",
      name: "ambient-demo",
    },
    commands: [
      {
        name: "demo",
      },
    ],
    skills: [
      {
        summaryStatus: "available",
        text: "Skill body",
      },
    ],
    env: [
      {
        name: "DEMO_KEY",
        required: true,
        configured: false,
      },
      {
        name: "OPTIONAL_ENV",
        required: false,
        configured: false,
      },
    ],
  };
}

function richDescriptionFixture(): any {
  return {
    package: {
      id: "pkg-123",
      name: "ambient-demo",
      description: "Generated demo package.",
      availability: "available",
      availabilityReason: "ready",
    },
    commands: [
      {
        capabilityId: "pkg-123:command:demo",
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
        name: "demo-skill",
        description: "Use demo.",
        summaryStatus: "available",
        summary: {
          capabilityBrief: "Demo capability.",
          whenToUse: ["when demoing"],
          commands: { demo: "Run demo." },
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
