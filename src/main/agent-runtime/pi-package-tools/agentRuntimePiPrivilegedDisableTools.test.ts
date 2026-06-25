import { describe, expect, it, vi } from "vitest";

import { registerPiPrivilegedDisableTool } from "./agentRuntimePiPrivilegedDisableTools";
import type { PiPrivilegedCatalog, PiPrivilegedInstallSummary, PiPrivilegedSecurityScan } from "./piPrivilegedPackages";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimePiPrivilegedDisableTools", () => {
  it("disables a selected privileged package", async () => {
    const workspace = { path: "/workspace" } as any;
    const registeredTools: RegisteredTool[] = [];
    const discoverPiPrivilegedPackages = vi.fn(async () => catalogFixture());
    const disablePiPrivilegedPackage = vi.fn(async () => packageFixture({ status: "disabled" }));
    const onUpdate = vi.fn();

    registerPiPrivilegedDisableTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      discoverPiPrivilegedPackages,
      disablePiPrivilegedPackage,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_pi_privileged_disable"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("disable", { packageName: "pi-ffmpeg" }, undefined, onUpdate);

    expect(discoverPiPrivilegedPackages).toHaveBeenCalledWith("/workspace");
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Disabling privileged Pi package \"pi-ffmpeg\"." }],
      details: {
        runtime: "pi-privileged",
        toolName: "ambient_pi_privileged_disable",
        packageId: "pkg-privileged",
        packageName: "pi-ffmpeg",
        status: "disabling",
      },
    });
    expect(disablePiPrivilegedPackage).toHaveBeenCalledWith("/workspace", { packageId: "pkg-privileged" });
    expect(result).toEqual({
      content: [{
        type: "text",
        text: "Privileged Pi package \"pi-ffmpeg\" is disabled. No hooks, MCP servers, or host config changes are active through Ambient.",
      }],
      details: {
        runtime: "pi-privileged",
        toolName: "ambient_pi_privileged_disable",
        packageId: "pkg-privileged",
        packageName: "pi-ffmpeg",
        status: "disabled",
      },
    });
  });

  it("preserves selector behavior and skips disable when selection fails", async () => {
    const registeredTools: RegisteredTool[] = [];
    const disablePiPrivilegedPackage = vi.fn();

    registerPiPrivilegedDisableTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      discoverPiPrivilegedPackages: vi.fn(async () => catalogFixture()),
      disablePiPrivilegedPackage,
    });

    await expect(registeredTools[0]!.execute("disable", { packageName: "missing" })).rejects.toThrow(
      "Privileged Pi install \"missing\" was not found.",
    );
    expect(disablePiPrivilegedPackage).not.toHaveBeenCalled();
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
