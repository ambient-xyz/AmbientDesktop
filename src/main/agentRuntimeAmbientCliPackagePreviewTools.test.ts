import { describe, expect, it, vi } from "vitest";

import { registerAmbientCliPackagePreviewTool } from "./agentRuntimeAmbientCliPackagePreviewTools";

describe("agentRuntimeAmbientCliPackagePreviewTools", () => {
  it("previews an Ambient CLI package source and returns installability metadata", async () => {
    const workspace = { path: "/workspace" };
    const input = {
      source: "https://example.com/repo.git",
      path: "packages/demo",
      ref: "main",
      sha: "abc123",
      descriptor: { name: "ambient-demo" },
      installDependencies: true,
    };
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const previewAmbientCliPackageInstallSource = vi.fn(async () => previewFixture());
    const ambientCliPackagePreviewText = vi.fn(() => "Ambient CLI package preview.");
    const onUpdate = vi.fn();

    registerAmbientCliPackagePreviewTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      previewAmbientCliPackageInstallSource,
      ambientCliPackagePreviewText,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_cli_package_preview"]);

    const result = await registeredTools[0].execute("preview", input, undefined, onUpdate);

    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Previewing Ambient CLI package source https://example.com/repo.git." }],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli_package_preview",
        source: "https://example.com/repo.git",
        path: "packages/demo",
        ref: "main",
        sha: "abc123",
        descriptorOverlay: true,
        installDependencies: true,
        status: "previewing",
      },
    });
    expect(previewAmbientCliPackageInstallSource).toHaveBeenCalledWith(workspace.path, input);
    expect(ambientCliPackagePreviewText).toHaveBeenCalledWith(previewFixture());
    expect(result.content).toEqual([{ type: "text", text: "Ambient CLI package preview." }]);
    expect(result.details).toMatchObject({
      runtime: "ambient-cli",
      toolName: "ambient_cli_package_preview",
      source: "https://example.com/repo.git",
      packageName: "ambient-demo",
      installable: true,
      errorCount: 0,
      healthCheckCount: 1,
      dependencyInstall: {
        passed: true,
        skipped: false,
        command: ["pnpm", "install"],
      },
      envStatus: [
        {
          name: "DEMO_KEY",
          configured: false,
        },
      ],
    });
  });

  it("omits blank optional fields and defaults dependency installation to false", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const previewAmbientCliPackageInstallSource = vi.fn(async () => ({
      ...previewFixture(),
      path: undefined,
      ref: undefined,
      sha: undefined,
      dependencyInstall: undefined,
    }));
    const onUpdate = vi.fn();

    registerAmbientCliPackagePreviewTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" },
      previewAmbientCliPackageInstallSource,
    });

    await registeredTools[0].execute("preview", {
      source: "local-package",
      path: "",
      ref: "",
      sha: "",
    }, undefined, onUpdate);

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        source: "local-package",
        path: undefined,
        ref: undefined,
        sha: undefined,
        descriptorOverlay: false,
        installDependencies: false,
      }),
    }));
    expect(previewAmbientCliPackageInstallSource).toHaveBeenCalledWith("/workspace", {
      source: "local-package",
    });
  });

  it("requires a non-empty source before previewing", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const previewAmbientCliPackageInstallSource = vi.fn();

    registerAmbientCliPackagePreviewTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" },
      previewAmbientCliPackageInstallSource,
    });

    await expect(registeredTools[0].execute("preview", { source: " " })).rejects.toThrow("source is required.");
    expect(previewAmbientCliPackageInstallSource).not.toHaveBeenCalled();
  });
});

function previewFixture(): any {
  return {
    source: "https://example.com/repo.git",
    path: "packages/demo",
    ref: "main",
    sha: "abc123",
    candidate: {
      id: "pkg-123",
      name: "ambient-demo",
      version: "0.0.0",
      description: "Generated demo package.",
      rootPath: "/workspace/.ambient/cli-packages/ambient-demo",
      source: "https://example.com/repo.git",
      installed: false,
      skills: [
        {
          name: "demo-skill",
          description: "Use demo.",
        },
      ],
      commands: [
        {
          name: "demo",
          description: "Run demo.",
        },
      ],
      envRequirements: [],
      errors: [],
    },
    dependencyInstall: {
      passed: true,
      skipped: false,
      command: ["pnpm", "install"],
    },
    envStatus: [
      {
        name: "DEMO_KEY",
        configured: false,
      },
    ],
    healthChecks: [
      {
        name: "descriptor",
        status: "passed",
      },
    ],
    installable: true,
    errors: [],
  };
}
