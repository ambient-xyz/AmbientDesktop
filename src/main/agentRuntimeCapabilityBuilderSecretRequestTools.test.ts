import { describe, expect, it, vi } from "vitest";

import { registerCapabilityBuilderSecretRequestTool } from "./agentRuntimeCapabilityBuilderSecretRequestTools";

describe("agentRuntimeCapabilityBuilderSecretRequestTools", () => {
  it("emits a Desktop-owned secret request for a declared builder env requirement", async () => {
    const workspace = { path: "/workspace" };
    const input = {
      sourcePath: ".ambient/capability-builder/packages/ambient-demo",
      envName: "DEMO_API_KEY",
    };
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseSecretRequestInput = vi.fn(() => input);
    const previewCapabilityBuilderPackage = vi.fn(async () => previewFixture());
    const emitDesktopEvent = vi.fn();

    registerCapabilityBuilderSecretRequestTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      parseSecretRequestInput,
      previewCapabilityBuilderPackage,
      emitDesktopEvent,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_capability_builder_secret_request"]);

    const result = await registeredTools[0].execute("secret", input);

    expect(parseSecretRequestInput).toHaveBeenCalledWith(input);
    expect(previewCapabilityBuilderPackage).toHaveBeenCalledWith(workspace.path, input);
    expect(emitDesktopEvent).toHaveBeenCalledWith({
      type: "ambient-cli-secret-requested",
      packageName: "ambient-demo",
      envName: "DEMO_API_KEY",
      builderSourcePath: ".ambient/capability-builder/packages/ambient-demo",
    });
    expect(result.content[0].text).toContain("Capability Builder secret dialog requested");
    expect(result.content[0].text).toContain("Secret value: never exposed to Pi");
    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_secret_request",
      packageName: "ambient-demo",
      relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
      envName: "DEMO_API_KEY",
    });
  });

  it("blocks secret requests for env names not declared by the builder package", async () => {
    const input = {
      sourcePath: ".ambient/capability-builder/packages/ambient-demo",
      envName: "UNKNOWN_API_KEY",
    };
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const emitDesktopEvent = vi.fn();

    registerCapabilityBuilderSecretRequestTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" },
      parseSecretRequestInput: () => input,
      previewCapabilityBuilderPackage: async () => previewFixture(),
      emitDesktopEvent,
    });

    await expect(registeredTools[0].execute("secret", input)).rejects.toThrow(
      'Capability Builder package "ambient-demo" does not declare env requirement "UNKNOWN_API_KEY".',
    );
    expect(emitDesktopEvent).not.toHaveBeenCalled();
  });
});

function previewFixture(): any {
  return {
    packageName: "ambient-demo",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    gitSha: "abc123",
    valid: true,
    installerShape: "cloud-api",
    errors: [],
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
  };
}
