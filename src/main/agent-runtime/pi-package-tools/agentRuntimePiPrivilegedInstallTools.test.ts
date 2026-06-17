import { describe, expect, it, vi } from "vitest";

import { registerPiPrivilegedInstallTool } from "./agentRuntimePiPrivilegedInstallTools";
import type { PiPrivilegedInstallSummary, PiPrivilegedSecurityScan } from "./piPrivilegedPackages";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimePiPrivilegedInstallTools", () => {
  it("installs a privileged package as disabled after approval", async () => {
    const workspace = { path: "/workspace" } as any;
    const thread = { collaborationMode: "agent" } as any;
    const registeredTools: RegisteredTool[] = [];
    const scan = scanFixture({ scanOrigin: "sandbox-fallback" });
    const installed = packageFixture({ scan });
    const previewAmbientCliPackagePiCatalogSource = vi.fn(async () => ({ installable: false }));
    const scanPiPrivilegedPackage = vi.fn(async () => scan);
    const installPiPrivilegedPackage = vi.fn(async () => installed);
    const resolveFirstPartyPluginPermission = vi.fn(async () => true);
    const onUpdate = vi.fn();

    registerPiPrivilegedInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      previewAmbientCliPackagePiCatalogSource: previewAmbientCliPackagePiCatalogSource as any,
      scanPiPrivilegedPackage,
      installPiPrivilegedPackage,
      resolveFirstPartyPluginPermission,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_pi_privileged_install"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("install", {
      source: "npm:pi-ffmpeg",
      scanOrigin: "sandbox-fallback",
    }, undefined, onUpdate);

    expect(previewAmbientCliPackagePiCatalogSource).toHaveBeenCalledWith("/workspace", "npm:pi-ffmpeg");
    expect(scanPiPrivilegedPackage).toHaveBeenCalledWith({
      source: "npm:pi-ffmpeg",
      scanOrigin: "sandbox-fallback",
    });
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_pi_privileged_install",
      title: "Install privileged Pi package \"pi-ffmpeg\" as disabled?",
      message: "Ambient wants to copy a privileged Pi package into managed state. Alpha installs remain disabled and do not activate hooks or mutate Pi settings.",
      detail: [
        "Workspace: /workspace",
        "Package: pi-ffmpeg",
        "Version: 1.0.0",
        "Source: npm:pi-ffmpeg",
        "Scan origin: sandbox-fallback",
        "Fingerprint: fingerprint",
        "Recommendation: privileged-review-required",
        "Findings: 1",
        "- [warning] network: may use network",
        "Effect: copy package into Ambient-managed privileged Pi install state as disabled.",
        "Alpha does not activate hooks, MCP servers, commands, background processes, or Pi settings changes.",
        "fixture caveat",
      ].join("\n"),
      grantTargetLabel: "Install privileged Pi package pi-ffmpeg",
      grantTargetIdentity: "ambient_pi_privileged_install\0pi-ffmpeg\0fingerprint",
      allowedReason: "Privileged Pi install approved by Ambient permission grant policy.",
      deniedReason: "Privileged Pi install prompt denied or timed out.",
    }));
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Installing privileged Pi package \"pi-ffmpeg\" as disabled." }],
      details: {
        runtime: "pi-privileged",
        toolName: "ambient_pi_privileged_install",
        source: "npm:pi-ffmpeg",
        scanOrigin: "sandbox-fallback",
        packageName: "pi-ffmpeg",
        status: "installing",
      },
    });
    expect(installPiPrivilegedPackage).toHaveBeenCalledWith("/workspace", {
      source: "npm:pi-ffmpeg",
      scanOrigin: "sandbox-fallback",
    });
    expect(result).toEqual({
      content: [{
        type: "text",
        text: [
          "Privileged Pi package installed as disabled",
          "Package: pi-ffmpeg",
          "Package id: pkg-privileged",
          "Version: 1.0.0",
          "Status: disabled",
          "Scan origin: sandbox-fallback",
          "Root: /workspace/.ambient/pi-privileged-installs/imported/pi-ffmpeg",
          "No hooks, MCP servers, commands, or Pi settings changes were activated.",
          "Use ambient_pi_privileged_uninstall to remove it, or a future activation flow when privileged activation is implemented.",
        ].join("\n"),
      }],
      details: {
        runtime: "pi-privileged",
        toolName: "ambient_pi_privileged_install",
        packageId: "pkg-privileged",
        packageName: "pi-ffmpeg",
        scanOrigin: "sandbox-fallback",
        status: "disabled",
      },
    });
  });

  it("returns a CLI adapter redirect instead of installing first-party catalog sources", async () => {
    const registeredTools: RegisteredTool[] = [];
    const previewAmbientCliPackagePiCatalogSource = vi.fn(async () => ({
      installable: true,
      candidate: {
        name: "pi-arxiv",
        commands: [{ name: "search_arxiv" }],
      },
      resolution: {
        adapter: "pi-arxiv",
      },
    }));
    const scanPiPrivilegedPackage = vi.fn();
    const installPiPrivilegedPackage = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();
    const onUpdate = vi.fn();

    registerPiPrivilegedInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      previewAmbientCliPackagePiCatalogSource: previewAmbientCliPackagePiCatalogSource as any,
      scanPiPrivilegedPackage,
      installPiPrivilegedPackage,
      resolveFirstPartyPluginPermission,
    });

    const result = await registeredTools[0]!.execute("install", { source: "github:first-party/pi-arxiv" }, undefined, onUpdate);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(scanPiPrivilegedPackage).not.toHaveBeenCalled();
    expect(installPiPrivilegedPackage).not.toHaveBeenCalled();
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Reviewed Ambient CLI adapter available");
    expect(result.details).toEqual(expect.objectContaining({
      runtime: "ambient-cli",
      toolName: "ambient_pi_privileged_install",
      fallbackToolName: "ambient_cli_package_install_pi_catalog",
      source: "github:first-party/pi-arxiv",
      packageName: "pi-arxiv",
      commandNames: ["search_arxiv"],
      status: "first-party-cli-adapter-available",
      resolution: { adapter: "pi-arxiv" },
    }));
  });

  it("blocks privileged install in planner mode before validating input", async () => {
    const registeredTools: RegisteredTool[] = [];
    const previewAmbientCliPackagePiCatalogSource = vi.fn();

    registerPiPrivilegedInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "planner" }) as any,
      previewAmbientCliPackagePiCatalogSource: previewAmbientCliPackagePiCatalogSource as any,
      scanPiPrivilegedPackage: vi.fn(),
      installPiPrivilegedPackage: vi.fn(),
      resolveFirstPartyPluginPermission: vi.fn(),
    });

    await expect(registeredTools[0]!.execute("install", {})).rejects.toThrow(
      "Privileged Pi install is blocked in Planner Mode.",
    );
    expect(previewAmbientCliPackagePiCatalogSource).not.toHaveBeenCalled();
  });

  it("stops before installing when approval is denied", async () => {
    const registeredTools: RegisteredTool[] = [];
    const installPiPrivilegedPackage = vi.fn();
    const onUpdate = vi.fn();

    registerPiPrivilegedInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      previewAmbientCliPackagePiCatalogSource: vi.fn(async () => ({ installable: false })) as any,
      scanPiPrivilegedPackage: vi.fn(async () => scanFixture()),
      installPiPrivilegedPackage,
      resolveFirstPartyPluginPermission: vi.fn(async () => false),
    });

    await expect(registeredTools[0]!.execute("install", { source: "npm:pi-ffmpeg" }, undefined, onUpdate)).rejects.toThrow(
      "Privileged Pi install blocked by approval prompt.",
    );
    expect(onUpdate).not.toHaveBeenCalled();
    expect(installPiPrivilegedPackage).not.toHaveBeenCalled();
  });
});

function packageFixture(overrides: Partial<PiPrivilegedInstallSummary> = {}): PiPrivilegedInstallSummary {
  return {
    id: "pkg-privileged",
    source: "npm:pi-ffmpeg",
    packageName: "pi-ffmpeg",
    version: "1.0.0",
    rootPath: "/workspace/.ambient/pi-privileged-installs/imported/pi-ffmpeg",
    status: "disabled",
    installedAt: "2026-06-10T00:00:00.000Z",
    disabledAt: "2026-06-10T00:00:00.000Z",
    scan: scanFixture(),
    ...overrides,
  };
}

function scanFixture(overrides: Partial<PiPrivilegedSecurityScan> = {}): PiPrivilegedSecurityScan {
  return {
    source: "npm:pi-ffmpeg",
    scanOrigin: "explicit",
    packageName: "pi-ffmpeg",
    version: "1.0.0",
    fingerprint: "fingerprint",
    resources: {
      piExtensions: ["index.ts"],
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
      network: true,
      envOrSecrets: false,
      nativeDependencies: false,
      installScripts: false,
      dynamicCode: false,
    },
    findings: [{
      severity: "warning",
      category: "network",
      message: "may use network",
      files: [],
    }],
    recommendation: "privileged-review-required",
    caveat: "fixture caveat",
    ...overrides,
  };
}
