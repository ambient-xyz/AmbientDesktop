import { describe, expect, it, vi } from "vitest";

import { registerPiPrivilegedUninstallTool } from "./agentRuntimePiPrivilegedUninstallTools";
import type { PiPrivilegedCatalog, PiPrivilegedInstallSummary, PiPrivilegedSecurityScan } from "./piPrivilegedPackages";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimePiPrivilegedUninstallTools", () => {
  it("uninstalls a privileged package after approval", async () => {
    const workspace = { path: "/workspace" } as any;
    const thread = { collaborationMode: "agent" } as any;
    const registeredTools: RegisteredTool[] = [];
    const discoverPiPrivilegedPackages = vi.fn(async () => catalogFixture());
    const uninstallPiPrivilegedPackage = vi.fn(async () => ({
      removed: packageFixture(),
      catalog: catalogFixture({ packages: [] }),
      manualCleanup: ["Extension data was kept. No privileged runtime activation has created Ambient-owned data yet."],
    }));
    const resolveFirstPartyPluginPermission = vi.fn(async () => true);
    const revokePluginGrantsForLabels = vi.fn(() => 2);
    const markPluginToolsStale = vi.fn();
    const onUpdate = vi.fn();

    registerPiPrivilegedUninstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      discoverPiPrivilegedPackages,
      uninstallPiPrivilegedPackage,
      resolveFirstPartyPluginPermission,
      revokePluginGrantsForLabels,
      markPluginToolsStale,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_pi_privileged_uninstall"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("uninstall", { packageName: "pi-ffmpeg" }, undefined, onUpdate);

    expect(discoverPiPrivilegedPackages).toHaveBeenCalledWith("/workspace");
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_pi_privileged_uninstall",
      title: "Uninstall privileged Pi package \"pi-ffmpeg\"?",
      message: "Ambient wants to remove this privileged Pi package using its manifest. Unmanaged direct Pi or host-app changes may require manual cleanup.",
      detail: [
        "Workspace: /workspace",
        "Package: pi-ffmpeg",
        "Package id: pkg-privileged",
        "Package root: /workspace/.ambient/pi-privileged-installs/imported/pi-ffmpeg",
        "Delete data: no",
      ].join("\n"),
      grantTargetLabel: "Uninstall privileged Pi package pi-ffmpeg",
      grantTargetIdentity: "ambient_pi_privileged_uninstall\0pkg-privileged\0keep-data",
      allowedReason: "Privileged Pi uninstall approved by Ambient permission grant policy.",
      deniedReason: "Privileged Pi uninstall prompt denied or timed out.",
    }));
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Uninstalling privileged Pi package \"pi-ffmpeg\"." }],
      details: {
        runtime: "pi-privileged",
        toolName: "ambient_pi_privileged_uninstall",
        packageId: "pkg-privileged",
        packageName: "pi-ffmpeg",
        status: "uninstalling",
      },
    });
    expect(uninstallPiPrivilegedPackage).toHaveBeenCalledWith("/workspace", {
      packageId: "pkg-privileged",
      deleteData: false,
    });
    expect(revokePluginGrantsForLabels).toHaveBeenCalledWith([
      "Install privileged Pi package pi-ffmpeg",
      "Uninstall privileged Pi package pi-ffmpeg",
    ]);
    expect(markPluginToolsStale).toHaveBeenCalledOnce();
    expect(result).toEqual({
      content: [{
        type: "text",
        text: [
          "Privileged Pi package uninstalled",
          "Package: pi-ffmpeg",
          "Package id: pkg-privileged",
          "Revoked grants: 2",
          "Manifest-owned copied package state was removed.",
          "Manual cleanup notes:",
          "- Extension data was kept. No privileged runtime activation has created Ambient-owned data yet.",
        ].join("\n"),
      }],
      details: {
        runtime: "pi-privileged",
        toolName: "ambient_pi_privileged_uninstall",
        packageId: "pkg-privileged",
        packageName: "pi-ffmpeg",
        revokedGrants: 2,
        manualCleanup: ["Extension data was kept. No privileged runtime activation has created Ambient-owned data yet."],
      },
    });
  });

  it("includes delete-data in approval identity and uninstall input", async () => {
    const registeredTools: RegisteredTool[] = [];
    const resolveFirstPartyPluginPermission = vi.fn(async () => true);
    const uninstallPiPrivilegedPackage = vi.fn(async () => ({
      removed: packageFixture(),
      catalog: catalogFixture({ packages: [] }),
      manualCleanup: [],
    }));

    registerPiPrivilegedUninstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      discoverPiPrivilegedPackages: vi.fn(async () => catalogFixture()),
      uninstallPiPrivilegedPackage,
      resolveFirstPartyPluginPermission,
      revokePluginGrantsForLabels: vi.fn(() => 0),
      markPluginToolsStale: vi.fn(),
    });

    await registeredTools[0]!.execute("uninstall", { packageId: "pkg-privileged", deleteData: true });

    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.stringContaining("Delete data: yes"),
      grantTargetIdentity: "ambient_pi_privileged_uninstall\0pkg-privileged\0delete-data",
    }));
    expect(uninstallPiPrivilegedPackage).toHaveBeenCalledWith("/workspace", {
      packageId: "pkg-privileged",
      deleteData: true,
    });
  });

  it("blocks privileged uninstall in planner mode before discovery", async () => {
    const registeredTools: RegisteredTool[] = [];
    const discoverPiPrivilegedPackages = vi.fn();

    registerPiPrivilegedUninstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "planner" }) as any,
      discoverPiPrivilegedPackages,
      uninstallPiPrivilegedPackage: vi.fn(),
      resolveFirstPartyPluginPermission: vi.fn(),
      revokePluginGrantsForLabels: vi.fn(),
      markPluginToolsStale: vi.fn(),
    });

    await expect(registeredTools[0]!.execute("uninstall", { packageName: "pi-ffmpeg" })).rejects.toThrow(
      "Privileged Pi uninstall is blocked in Planner Mode.",
    );
    expect(discoverPiPrivilegedPackages).not.toHaveBeenCalled();
  });

  it("stops before uninstall when approval is denied", async () => {
    const registeredTools: RegisteredTool[] = [];
    const uninstallPiPrivilegedPackage = vi.fn();
    const revokePluginGrantsForLabels = vi.fn();
    const markPluginToolsStale = vi.fn();
    const onUpdate = vi.fn();

    registerPiPrivilegedUninstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      discoverPiPrivilegedPackages: vi.fn(async () => catalogFixture()),
      uninstallPiPrivilegedPackage,
      resolveFirstPartyPluginPermission: vi.fn(async () => false),
      revokePluginGrantsForLabels,
      markPluginToolsStale,
    });

    await expect(registeredTools[0]!.execute("uninstall", { packageId: "pkg-privileged" }, undefined, onUpdate)).rejects.toThrow(
      "Privileged Pi uninstall blocked by approval prompt.",
    );
    expect(onUpdate).not.toHaveBeenCalled();
    expect(uninstallPiPrivilegedPackage).not.toHaveBeenCalled();
    expect(revokePluginGrantsForLabels).not.toHaveBeenCalled();
    expect(markPluginToolsStale).not.toHaveBeenCalled();
  });
});

function catalogFixture(overrides: Partial<PiPrivilegedCatalog> = {}): PiPrivilegedCatalog {
  return {
    packages: [packageFixture()],
    history: [],
    errors: [],
    ...overrides,
  };
}

function packageFixture(overrides: Partial<PiPrivilegedInstallSummary> = {}): PiPrivilegedInstallSummary {
  return {
    id: "pkg-privileged",
    source: "npm:pi-ffmpeg",
    packageName: "pi-ffmpeg",
    rootPath: "/workspace/.ambient/pi-privileged-installs/imported/pi-ffmpeg",
    status: "active",
    installedAt: "2026-06-10T00:00:00.000Z",
    scan: scanFixture(),
    ...overrides,
  };
}

function scanFixture(overrides: Partial<PiPrivilegedSecurityScan> = {}): PiPrivilegedSecurityScan {
  return {
    source: "npm:pi-ffmpeg",
    scanOrigin: "explicit",
    packageName: "pi-ffmpeg",
    descriptorHash: "descriptor-hash",
    packageTreeHash: "package-tree-hash",
    fingerprint: "fingerprint",
    resources: {
      piExtensions: [],
      piSkills: [],
      piPrompts: [],
      piThemes: [],
      bins: [],
      mcpServers: [],
      hookConfigs: [],
    },
    riskSummary: {
      lifecycleHooks: false,
      commands: false,
      mcpServers: false,
      hostConfigMutation: false,
      filesystemWrites: false,
      homeDirectoryAccess: false,
      processExecution: false,
      network: false,
      envOrSecrets: false,
      nativeDependencies: false,
      installScripts: false,
      dynamicCode: false,
    },
    findings: [],
    recommendation: "privileged-review-required",
    caveat: "fixture",
    ...overrides,
  };
}
