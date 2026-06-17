import { describe, expect, it, vi } from "vitest";

import { registerAmbientCliPackageUninstallTool } from "./agentRuntimeAmbientCliPackageUninstallTools";

describe("agentRuntimeAmbientCliPackageUninstallTools", () => {
  it("uninstalls an Ambient-installed CLI package after approval", async () => {
    const workspace = { path: "/workspace" } as any;
    const thread = { collaborationMode: "agent" } as any;
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const discoverAmbientCliPackages = vi.fn(async () => catalogFixture());
    const uninstallAmbientCliPackageSource = vi.fn(async () => ({ packages: [], errors: [] }));
    const resolveFirstPartyPluginPermission = vi.fn(async (_request: any) => true);
    const markPluginToolsStale = vi.fn();
    const onUpdate = vi.fn();

    registerAmbientCliPackageUninstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      discoverAmbientCliPackages,
      uninstallAmbientCliPackageSource,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_cli_package_uninstall"]);

    const result = await registeredTools[0].execute("uninstall", { packageName: "ambient-demo" }, undefined, onUpdate);

    expect(discoverAmbientCliPackages).toHaveBeenCalledWith(workspace.path);
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_cli_package_uninstall",
      title: "Uninstall Ambient CLI package \"ambient-demo\"?",
      message: "Ambient wants to remove this installed CLI package and its copied package files.",
      detail: [
        "Workspace: /workspace",
        "Package: ambient-demo",
        "Package id: pkg-123",
        "Package root: /workspace/.ambient/cli-packages/ambient-demo",
      ].join("\n"),
      grantTargetLabel: "Uninstall Ambient CLI package ambient-demo",
      grantTargetIdentity: "ambient_cli_package_uninstall\0pkg-123",
      allowedReason: "Ambient CLI package uninstall approved by Ambient permission grant policy.",
      deniedReason: "Ambient CLI package uninstall prompt denied or timed out.",
    }));
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Uninstalling Ambient CLI package \"ambient-demo\"." }],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli_package_uninstall",
        packageId: "pkg-123",
        packageName: "ambient-demo",
        status: "uninstalling",
      },
    });
    expect(uninstallAmbientCliPackageSource).toHaveBeenCalledWith(workspace.path, { packageId: "pkg-123" });
    expect(markPluginToolsStale).toHaveBeenCalledOnce();
    expect(result).toEqual({
      content: [{
        type: "text",
        text: [
          "Ambient CLI package uninstalled",
          "Package: ambient-demo",
          "Package id: pkg-123",
          "Declared commands and searchable package instructions are no longer available.",
        ].join("\n"),
      }],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli_package_uninstall",
        packageId: "pkg-123",
        packageName: "ambient-demo",
        availability: "next-session-refresh",
      },
    });
  });

  it("blocks uninstall in planner mode before discovery", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const discoverAmbientCliPackages = vi.fn();

    registerAmbientCliPackageUninstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "planner" }) as any,
      discoverAmbientCliPackages,
      uninstallAmbientCliPackageSource: vi.fn(),
      resolveFirstPartyPluginPermission: vi.fn(),
      markPluginToolsStale: vi.fn(),
    });

    await expect(registeredTools[0].execute("uninstall", { packageName: "ambient-demo" })).rejects.toThrow(
      "CLI package uninstall is blocked in Planner Mode.",
    );
    expect(discoverAmbientCliPackages).not.toHaveBeenCalled();
  });

  it("requires the package to be Ambient-installed", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const resolveFirstPartyPluginPermission = vi.fn();
    const uninstallAmbientCliPackageSource = vi.fn();

    registerAmbientCliPackageUninstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      discoverAmbientCliPackages: vi.fn(async () => catalogFixture({ installed: false })),
      uninstallAmbientCliPackageSource,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale: vi.fn(),
    });

    await expect(registeredTools[0].execute("uninstall", { packageName: "ambient-demo" })).rejects.toThrow(
      "Only Ambient-installed CLI packages can be uninstalled.",
    );
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(uninstallAmbientCliPackageSource).not.toHaveBeenCalled();
  });

  it("stops before uninstall when approval is denied", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const uninstallAmbientCliPackageSource = vi.fn();
    const markPluginToolsStale = vi.fn();
    const onUpdate = vi.fn();

    registerAmbientCliPackageUninstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      discoverAmbientCliPackages: vi.fn(async () => catalogFixture()),
      uninstallAmbientCliPackageSource,
      resolveFirstPartyPluginPermission: vi.fn(async () => false),
      markPluginToolsStale,
    });

    await expect(registeredTools[0].execute("uninstall", { packageId: "pkg-123" }, undefined, onUpdate)).rejects.toThrow(
      "Ambient CLI package uninstall blocked by approval prompt.",
    );
    expect(onUpdate).not.toHaveBeenCalled();
    expect(uninstallAmbientCliPackageSource).not.toHaveBeenCalled();
    expect(markPluginToolsStale).not.toHaveBeenCalled();
  });
});

function catalogFixture(packageOverrides: Record<string, unknown> = {}): any {
  return {
    packages: [
      {
        id: "pkg-123",
        name: "ambient-demo",
        rootPath: "/workspace/.ambient/cli-packages/ambient-demo",
        source: "local",
        installed: true,
        skills: [],
        commands: [],
        envRequirements: [],
        errors: [],
        ...packageOverrides,
      },
    ],
    errors: [],
  };
}
