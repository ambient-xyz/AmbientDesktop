import { describe, expect, it, vi } from "vitest";

import { registerPiExtensionSandboxUninstallTool } from "./agentRuntimePiExtensionSandboxUninstallTools";
import type { PiExtensionSandboxCatalog, PiExtensionSandboxPackageSummary } from "./piExtensionSandboxPackages";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimePiExtensionSandboxUninstallTools", () => {
  it("uninstalls a sandboxed extension package after approval", async () => {
    const workspace = { path: "/workspace" } as any;
    const thread = { collaborationMode: "agent" } as any;
    const registeredTools: RegisteredTool[] = [];
    const discoverPiExtensionSandboxPackages = vi.fn(async () => catalogFixture());
    const uninstallPiExtensionSandboxPackage = vi.fn(async () => ({ removed: packageFixture(), catalog: catalogFixture({ packages: [] }) }));
    const resolveFirstPartyPluginPermission = vi.fn(async () => true);
    const revokePluginGrantsForLabels = vi.fn(() => 3);
    const markPluginToolsStale = vi.fn();
    const onUpdate = vi.fn();

    registerPiExtensionSandboxUninstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      discoverPiExtensionSandboxPackages,
      uninstallPiExtensionSandboxPackage,
      resolveFirstPartyPluginPermission,
      revokePluginGrantsForLabels,
      markPluginToolsStale,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_pi_extension_uninstall_sandboxed"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("uninstall", { packageName: "pi-arxiv" }, undefined, onUpdate);

    expect(discoverPiExtensionSandboxPackages).toHaveBeenCalledWith("/workspace");
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_pi_extension_uninstall_sandboxed",
      title: "Uninstall sandboxed Pi extension \"pi-arxiv\"?",
      message: "Ambient wants to remove this sandboxed Pi extension and its copied package files.",
      detail: [
        "Workspace: /workspace",
        "Package: pi-arxiv",
        "Package id: pkg-extension",
        "Package root: /workspace/.ambient/pi-extension-sandboxes/imported/pi-arxiv",
      ].join("\n"),
      grantTargetLabel: "Uninstall sandboxed Pi extension pi-arxiv",
      grantTargetIdentity: "ambient_pi_extension_uninstall_sandboxed\0pkg-extension",
      allowedReason: "Sandboxed Pi extension uninstall approved by Ambient permission grant policy.",
      deniedReason: "Sandboxed Pi extension uninstall prompt denied or timed out.",
    }));
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Uninstalling sandboxed Pi extension \"pi-arxiv\"." }],
      details: {
        runtime: "pi-extension-sandbox",
        toolName: "ambient_pi_extension_uninstall_sandboxed",
        packageId: "pkg-extension",
        packageName: "pi-arxiv",
        status: "uninstalling",
      },
    });
    expect(uninstallPiExtensionSandboxPackage).toHaveBeenCalledWith("/workspace", { packageId: "pkg-extension" });
    expect(revokePluginGrantsForLabels).toHaveBeenCalledWith([
      "Run sandboxed Pi extension pi-arxiv:",
      "Install sandboxed Pi extension pi-arxiv",
      "Uninstall sandboxed Pi extension pi-arxiv",
    ]);
    expect(markPluginToolsStale).toHaveBeenCalledOnce();
    expect(result).toEqual({
      content: [{
        type: "text",
        text: [
          "Sandboxed Pi extension uninstalled",
          "Package: pi-arxiv",
          "Package id: pkg-extension",
          "Revoked grants: 3",
          "Declared tools will be unavailable after the Pi session refreshes or on the next turn.",
          "Audit history is preserved.",
        ].join("\n"),
      }],
      details: {
        runtime: "pi-extension-sandbox",
        toolName: "ambient_pi_extension_uninstall_sandboxed",
        packageId: "pkg-extension",
        packageName: "pi-arxiv",
        revokedGrants: 3,
        availability: "next-session-refresh",
      },
    });
  });

  it("blocks uninstall in planner mode before discovery", async () => {
    const registeredTools: RegisteredTool[] = [];
    const discoverPiExtensionSandboxPackages = vi.fn();

    registerPiExtensionSandboxUninstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "planner" }) as any,
      discoverPiExtensionSandboxPackages,
      uninstallPiExtensionSandboxPackage: vi.fn(),
      resolveFirstPartyPluginPermission: vi.fn(),
      revokePluginGrantsForLabels: vi.fn(),
      markPluginToolsStale: vi.fn(),
    });

    await expect(registeredTools[0]!.execute("uninstall", { packageName: "pi-arxiv" })).rejects.toThrow(
      "Sandboxed Pi extension uninstall is blocked in Planner Mode.",
    );
    expect(discoverPiExtensionSandboxPackages).not.toHaveBeenCalled();
  });

  it("stops before uninstall when approval is denied", async () => {
    const registeredTools: RegisteredTool[] = [];
    const uninstallPiExtensionSandboxPackage = vi.fn();
    const revokePluginGrantsForLabels = vi.fn();
    const markPluginToolsStale = vi.fn();
    const onUpdate = vi.fn();

    registerPiExtensionSandboxUninstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      discoverPiExtensionSandboxPackages: vi.fn(async () => catalogFixture()),
      uninstallPiExtensionSandboxPackage,
      resolveFirstPartyPluginPermission: vi.fn(async () => false),
      revokePluginGrantsForLabels,
      markPluginToolsStale,
    });

    await expect(registeredTools[0]!.execute("uninstall", { packageId: "pkg-extension" }, undefined, onUpdate)).rejects.toThrow(
      "Sandboxed Pi extension uninstall blocked by approval prompt.",
    );
    expect(onUpdate).not.toHaveBeenCalled();
    expect(uninstallPiExtensionSandboxPackage).not.toHaveBeenCalled();
    expect(revokePluginGrantsForLabels).not.toHaveBeenCalled();
    expect(markPluginToolsStale).not.toHaveBeenCalled();
  });
});

function catalogFixture(overrides: Partial<PiExtensionSandboxCatalog> = {}): PiExtensionSandboxCatalog {
  return {
    packages: [packageFixture()],
    history: [],
    errors: [],
    ...overrides,
  };
}

function packageFixture(overrides: Partial<PiExtensionSandboxPackageSummary> = {}): PiExtensionSandboxPackageSummary {
  return {
    id: "pkg-extension",
    name: "pi-arxiv",
    source: "npm:pi-arxiv",
    resolvedSource: "npm:pi-arxiv@1.0.0",
    packagePath: "/tmp/pi-arxiv.tgz",
    sha: "sha-extension",
    rootPath: "/workspace/.ambient/pi-extension-sandboxes/imported/pi-arxiv",
    entrypoint: "index.ts",
    allowedNetworkHosts: ["export.arxiv.org"],
    tools: [{ name: "search_arxiv" }],
    installed: true,
    errors: [],
    ...overrides,
  };
}
