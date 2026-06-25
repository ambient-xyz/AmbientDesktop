import { describe, expect, it, vi } from "vitest";

import {
  ambientCliPackageInstallText,
  ambientCliSummaryHydrationText,
  registerAmbientCliPackagePiCatalogInstallTool,
} from "./agentRuntimeAmbientCliPackageInstallTools";

describe("agentRuntimeAmbientCliPackagePiCatalogInstallTools", () => {
  it("previews, requests approval, installs, hydrates summaries, and returns catalog metadata", async () => {
    const workspace = { path: "/workspace" } as any;
    const thread = { collaborationMode: "agent" } as any;
    const preview = previewFixture();
    const installedPackage = packageFixture();
    const summaryHydration = summaryHydrationFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const previewAmbientCliPackagePiCatalogSource = vi.fn(async () => preview);
    const installAmbientCliPackagePiCatalogSource = vi.fn(async () => installedPackage);
    const hydrateFirstPartyAmbientCliPackageSummaries = vi.fn(async () => summaryHydration);
    const resolveFirstPartyPluginPermission = vi.fn(async (_request: any) => true);
    const markPluginToolsStale = vi.fn();
    const onUpdate = vi.fn();

    registerAmbientCliPackagePiCatalogInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      previewAmbientCliPackagePiCatalogSource,
      installAmbientCliPackagePiCatalogSource,
      hydrateFirstPartyAmbientCliPackageSummaries,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_cli_package_install_pi_catalog"]);

    const result = await registeredTools[0].execute("install-pi-catalog", { source: "@pi/demo" }, undefined, onUpdate);

    expect(previewAmbientCliPackagePiCatalogSource).toHaveBeenCalledWith(workspace.path, "@pi/demo");
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_cli_package_install_pi_catalog",
      title: "Install Pi catalog CLI package \"ambient-demo\"?",
      message: "Ambient wants to translate a supported Pi catalog package into an Ambient-managed CLI package. Declared commands can be run later through ambient_cli with separate approval.",
      grantTargetLabel: "Install Pi catalog CLI package ambient-demo",
      grantTargetIdentity: "ambient_cli_package_install_pi_catalog\0@pi/demo\0sha-123\0deps=none\0{\"args\":[\"demo.js\"],\"command\":\"node\",\"cwd\":\"package\",\"healthCheck\":[],\"name\":\"demo\"}",
      grantConditions: {
        installRoute: {
          routeKind: "pi-marketplace-wrapped",
          selectedSource: "@pi/demo",
          targetPackage: "ambient-demo",
          approvalBoundary: "ambient-permission-grant",
        },
      },
      allowedReason: "Pi catalog CLI package install approved by Ambient permission grant policy.",
      deniedReason: "Pi catalog CLI package install prompt denied or timed out.",
    }));
    const permissionRequest = resolveFirstPartyPluginPermission.mock.calls[0][0];
    expect(permissionRequest.detail).toContain("npm: @pi/demo@1.2.3");
    expect(permissionRequest.detail).toContain("Security scan:\n- adapter source reviewed\n- no dynamic imports");
    expect(permissionRequest.detail).toContain("Effect: copy reviewed package source plus a first-party Ambient CLI adapter into Ambient-managed CLI package state.");
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Installing Pi catalog package from @pi/demo as an Ambient CLI package." }],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli_package_install_pi_catalog",
        source: "@pi/demo",
        repositoryUrl: "https://example.com/repo.git",
        sha: "sha-123",
        status: "installing",
      },
    });
    expect(installAmbientCliPackagePiCatalogSource).toHaveBeenCalledWith(workspace.path, "@pi/demo", preview);
    expect(hydrateFirstPartyAmbientCliPackageSummaries).toHaveBeenCalledWith("pkg-123");
    expect(markPluginToolsStale).toHaveBeenCalledOnce();
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: [
            ambientCliPackageInstallText(installedPackage),
            ambientCliSummaryHydrationText(summaryHydration),
            "Security scan:\n- adapter source reviewed\n- no dynamic imports",
            "Use ambient_cli_describe with packageName \"ambient-demo\" before first execution, then ambient_cli with one of: demo.",
          ].join("\n\n"),
        },
      ],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli_package_install_pi_catalog",
        packageId: "pkg-123",
        packageName: "ambient-demo",
        commandCount: 1,
        skillCount: 1,
        summaryHydration,
        resolution: preview.resolution,
        availability: "immediate",
      },
    });
  });

  it("omits optional resolution metadata when preview resolution is absent", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const previewAmbientCliPackagePiCatalogSource = vi.fn(async () => ({
      ...previewFixture(),
      resolution: undefined,
    }));
    const onUpdate = vi.fn();

    registerAmbientCliPackagePiCatalogInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      previewAmbientCliPackagePiCatalogSource,
      installAmbientCliPackagePiCatalogSource: vi.fn(async () => packageFixture()),
      hydrateFirstPartyAmbientCliPackageSummaries: vi.fn(async () => undefined),
      resolveFirstPartyPluginPermission: vi.fn(async () => true),
      markPluginToolsStale: vi.fn(),
    });

    const result = await registeredTools[0].execute("install-pi-catalog", { source: "@pi/demo" }, undefined, onUpdate);

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        repositoryUrl: undefined,
        sha: undefined,
      }),
    }));
    expect(result.details.resolution).toBeUndefined();
    expect(result.content[0].text).not.toContain("Security scan:");
  });

  it("stops before permission and install when preview is not installable", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const previewAmbientCliPackagePiCatalogSource = vi.fn(async () => ({
      ...previewFixture(),
      installable: false,
      errors: ["unsupported package", "missing adapter"],
    }));
    const installAmbientCliPackagePiCatalogSource = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();

    registerAmbientCliPackagePiCatalogInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      previewAmbientCliPackagePiCatalogSource,
      installAmbientCliPackagePiCatalogSource,
      hydrateFirstPartyAmbientCliPackageSummaries: vi.fn(),
      resolveFirstPartyPluginPermission,
      markPluginToolsStale: vi.fn(),
    });

    await expect(registeredTools[0].execute("install-pi-catalog", { source: "@pi/broken" })).rejects.toThrow(
      "Pi catalog package is not installable as Ambient CLI: unsupported package; missing adapter",
    );
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(installAmbientCliPackagePiCatalogSource).not.toHaveBeenCalled();
  });

  it("stops before install when approval is denied", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const installAmbientCliPackagePiCatalogSource = vi.fn();
    const markPluginToolsStale = vi.fn();

    registerAmbientCliPackagePiCatalogInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      previewAmbientCliPackagePiCatalogSource: vi.fn(async () => previewFixture()),
      installAmbientCliPackagePiCatalogSource,
      hydrateFirstPartyAmbientCliPackageSummaries: vi.fn(),
      resolveFirstPartyPluginPermission: vi.fn(async () => false),
      markPluginToolsStale,
    });

    await expect(registeredTools[0].execute("install-pi-catalog", { source: "@pi/demo" })).rejects.toThrow(
      "Pi catalog CLI package install blocked by approval prompt.",
    );
    expect(installAmbientCliPackagePiCatalogSource).not.toHaveBeenCalled();
    expect(markPluginToolsStale).not.toHaveBeenCalled();
  });

  it("blocks installation in planner mode before previewing", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const previewAmbientCliPackagePiCatalogSource = vi.fn();

    registerAmbientCliPackagePiCatalogInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "planner" }) as any,
      previewAmbientCliPackagePiCatalogSource,
      installAmbientCliPackagePiCatalogSource: vi.fn(),
      hydrateFirstPartyAmbientCliPackageSummaries: vi.fn(),
      resolveFirstPartyPluginPermission: vi.fn(),
      markPluginToolsStale: vi.fn(),
    });

    await expect(registeredTools[0].execute("install-pi-catalog", { source: "@pi/demo" })).rejects.toThrow(
      "Pi catalog CLI package installation is blocked in Planner Mode.",
    );
    expect(previewAmbientCliPackagePiCatalogSource).not.toHaveBeenCalled();
  });
});

function previewFixture(): any {
  return {
    source: "@pi/demo",
    candidate: packageFixture({ installed: false }),
    dependencyInstall: undefined,
    envStatus: [],
    healthChecks: [
      {
        commandName: "demo",
        command: ["node", "demo.js"],
        cwd: "/workspace/.ambient/cli-packages/ambient-demo",
        passed: true,
      },
    ],
    installable: true,
    errors: [],
    resolution: {
      source: "@pi/demo",
      npmPackageName: "@pi/demo",
      npmVersion: "1.2.3",
      repositoryUrl: "https://example.com/repo.git",
      repositoryDirectory: "packages/demo",
      sha: "sha-123",
      adapter: "ambient-demo",
      securityScan: ["adapter source reviewed", "no dynamic imports"],
    },
  };
}

function packageFixture(overrides: Record<string, unknown> = {}): any {
  return {
    id: "pkg-123",
    name: "ambient-demo",
    version: "0.0.0",
    description: "Generated demo package.",
    rootPath: "/workspace/.ambient/cli-packages/ambient-demo",
    source: "@pi/demo",
    installed: true,
    skills: [
      {
        name: "demo-skill",
        description: "Use demo.",
        path: "/workspace/.ambient/cli-packages/ambient-demo/skills/demo/SKILL.md",
      },
    ],
    commands: [
      {
        name: "demo",
        description: "Run demo.",
        command: "node",
        args: ["demo.js"],
        cwd: "package",
      },
    ],
    envRequirements: [],
    errors: [],
    ...overrides,
  };
}

function summaryHydrationFixture(): any {
  return {
    packageId: "pkg-123",
    packageName: "ambient-demo",
    attempted: true,
    availableCount: 1,
    failedCount: 0,
    summaryStatuses: [
      {
        skillName: "demo-skill",
        skillPath: "/workspace/.ambient/cli-packages/ambient-demo/skills/demo/SKILL.md",
        status: "available",
      },
    ],
  };
}
