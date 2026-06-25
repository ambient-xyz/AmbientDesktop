import { describe, expect, it, vi } from "vitest";

import { registerPiPrivilegedScanTool } from "./agentRuntimePiPrivilegedScanTools";
import type { PiPrivilegedSecurityScan } from "./piPrivilegedPackages";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimePiPrivilegedScanTools", () => {
  it("scans a privileged Pi package when no CLI adapter is available", async () => {
    const workspace = { path: "/workspace" } as any;
    const registeredTools: RegisteredTool[] = [];
    const previewAmbientCliPackagePiCatalogSource = vi.fn(async () => ({ installable: false }));
    const scanPiPrivilegedPackage = vi.fn(async () => scanFixture());
    const onUpdate = vi.fn();

    registerPiPrivilegedScanTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      previewAmbientCliPackagePiCatalogSource: previewAmbientCliPackagePiCatalogSource as any,
      scanPiPrivilegedPackage,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_pi_privileged_scan"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("scan", { source: "npm:pi-ffmpeg", scanOrigin: "sandbox-fallback" }, undefined, onUpdate);

    expect(previewAmbientCliPackagePiCatalogSource).toHaveBeenCalledWith("/workspace", "npm:pi-ffmpeg");
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Scanning privileged Pi package from npm:pi-ffmpeg." }],
      details: {
        runtime: "pi-privileged",
        toolName: "ambient_pi_privileged_scan",
        source: "npm:pi-ffmpeg",
        scanOrigin: "sandbox-fallback",
        status: "scanning",
      },
    });
    expect(scanPiPrivilegedPackage).toHaveBeenCalledWith({
      source: "npm:pi-ffmpeg",
      scanOrigin: "sandbox-fallback",
    });
    expect(result.content[0].text).toContain("Privileged Pi package scan");
    expect(result.content[0].text).toContain("Package: pi-ffmpeg");
    expect(result.details).toEqual({
      runtime: "pi-privileged",
      toolName: "ambient_pi_privileged_scan",
      source: "npm:pi-ffmpeg",
      scanOrigin: "explicit",
      packageName: "pi-ffmpeg",
      recommendation: "privileged-review-required",
      riskSummary: scanFixture().riskSummary,
    });
  });

  it("returns a CLI adapter redirect instead of scanning first-party catalog sources", async () => {
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
    const onUpdate = vi.fn();

    registerPiPrivilegedScanTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      previewAmbientCliPackagePiCatalogSource: previewAmbientCliPackagePiCatalogSource as any,
      scanPiPrivilegedPackage,
    });

    const result = await registeredTools[0]!.execute("scan", { source: "github:first-party/pi-arxiv" }, undefined, onUpdate);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(scanPiPrivilegedPackage).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Reviewed Ambient CLI adapter available");
    expect(result.details).toEqual(expect.objectContaining({
      runtime: "ambient-cli",
      toolName: "ambient_pi_privileged_scan",
      fallbackToolName: "ambient_cli_package_install_pi_catalog",
      source: "github:first-party/pi-arxiv",
      packageName: "pi-arxiv",
      commandNames: ["search_arxiv"],
      status: "first-party-cli-adapter-available",
      resolution: { adapter: "pi-arxiv" },
    }));
  });

  it("validates scan input before previewing packages", async () => {
    const registeredTools: RegisteredTool[] = [];
    const previewAmbientCliPackagePiCatalogSource = vi.fn();

    registerPiPrivilegedScanTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      previewAmbientCliPackagePiCatalogSource: previewAmbientCliPackagePiCatalogSource as any,
      scanPiPrivilegedPackage: vi.fn(),
    });

    await expect(registeredTools[0]!.execute("scan", { source: "npm:pi-ffmpeg", scanOrigin: "other" })).rejects.toThrow(
      "scanOrigin must be explicit or sandbox-fallback.",
    );
    expect(previewAmbientCliPackagePiCatalogSource).not.toHaveBeenCalled();
  });
});

function scanFixture(overrides: Partial<PiPrivilegedSecurityScan> = {}): PiPrivilegedSecurityScan {
  return {
    source: "npm:pi-ffmpeg",
    scanOrigin: "explicit",
    packageName: "pi-ffmpeg",
    descriptorHash: "descriptor-hash",
    packageTreeHash: "package-tree-hash",
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
