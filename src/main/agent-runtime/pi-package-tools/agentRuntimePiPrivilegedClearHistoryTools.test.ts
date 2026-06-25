import { describe, expect, it, vi } from "vitest";

import { registerPiPrivilegedClearHistoryTool } from "./agentRuntimePiPrivilegedClearHistoryTools";
import type { PiPrivilegedCatalog, PiPrivilegedSecurityScan } from "./piPrivilegedPackages";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimePiPrivilegedClearHistoryTools", () => {
  it("clears retained privileged package history after approval", async () => {
    const workspace = { path: "/workspace" } as any;
    const thread = { collaborationMode: "agent" } as any;
    const registeredTools: RegisteredTool[] = [];
    const discoverPiPrivilegedPackages = vi.fn(async () => catalogFixture());
    const clearPiPrivilegedPackageHistory = vi.fn(async () => catalogFixture({ history: [], errors: ["clear warning"] }));
    const resolveFirstPartyPluginPermission = vi.fn(async () => true);
    const emit = vi.fn();
    const onUpdate = vi.fn();

    registerPiPrivilegedClearHistoryTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      discoverPiPrivilegedPackages,
      clearPiPrivilegedPackageHistory,
      resolveFirstPartyPluginPermission,
      emit,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_pi_privileged_clear_history"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("clear-history", {}, undefined, onUpdate);

    expect(discoverPiPrivilegedPackages).toHaveBeenCalledWith("/workspace");
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_pi_privileged_clear_history",
      title: "Clear privileged Pi package history?",
      message: "Ambient wants to clear retained removed-package history for privileged Pi packages. Active installs, grants, and audit rows are unchanged.",
      detail: [
        "Workspace: /workspace",
        "Retained removed packages: 1",
        "- pi-ffmpeg-old (pkg-privileged-old); removedAt: 2026-06-10T00:00:00.000Z; manualCleanup: 1",
        "Active installs preserved: 1",
        "Effect: remove retained removed-package history for privileged Pi packages.",
        "Audit history, active installs, permission grants, and unmanaged host side effects are unchanged.",
      ].join("\n"),
      grantTargetLabel: "Clear privileged Pi package history",
      grantTargetIdentity: "ambient_pi_privileged_clear_history\0/workspace\0pkg-privileged-old",
      allowedReason: "Privileged Pi package history clear approved by Ambient permission grant policy.",
      deniedReason: "Privileged Pi package history clear prompt denied or timed out.",
    }));
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Clearing retained privileged Pi package history." }],
      details: {
        runtime: "pi-privileged",
        toolName: "ambient_pi_privileged_clear_history",
        status: "clearing",
        historyCount: 1,
      },
    });
    expect(clearPiPrivilegedPackageHistory).toHaveBeenCalledWith("/workspace");
    expect(emit).toHaveBeenCalledWith({ type: "plugin-catalog-updated" });
    expect(result).toEqual({
      content: [{
        type: "text",
        text: [
          "Privileged Pi package history cleared",
          "Cleared records: 1",
          "Remaining removed-package history: 0",
          "Active installs preserved: 1",
          "Audit history is preserved.",
        ].join("\n"),
      }],
      details: {
        runtime: "pi-privileged",
        toolName: "ambient_pi_privileged_clear_history",
        clearedCount: 1,
        installedCount: 1,
        historyCount: 0,
        errors: ["clear warning"],
      },
    });
  });

  it("blocks history clearing in planner mode before discovery", async () => {
    const registeredTools: RegisteredTool[] = [];
    const discoverPiPrivilegedPackages = vi.fn();

    registerPiPrivilegedClearHistoryTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "planner" }) as any,
      discoverPiPrivilegedPackages,
      clearPiPrivilegedPackageHistory: vi.fn(),
      resolveFirstPartyPluginPermission: vi.fn(),
      emit: vi.fn(),
    });

    await expect(registeredTools[0]!.execute("clear-history", {})).rejects.toThrow(
      "Privileged Pi package history clearing is blocked in Planner Mode.",
    );
    expect(discoverPiPrivilegedPackages).not.toHaveBeenCalled();
  });

  it("stops before clearing when approval is denied", async () => {
    const registeredTools: RegisteredTool[] = [];
    const clearPiPrivilegedPackageHistory = vi.fn();
    const emit = vi.fn();
    const onUpdate = vi.fn();

    registerPiPrivilegedClearHistoryTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      discoverPiPrivilegedPackages: vi.fn(async () => catalogFixture()),
      clearPiPrivilegedPackageHistory,
      resolveFirstPartyPluginPermission: vi.fn(async () => false),
      emit,
    });

    await expect(registeredTools[0]!.execute("clear-history", {}, undefined, onUpdate)).rejects.toThrow(
      "Privileged Pi package history clear blocked by approval prompt.",
    );
    expect(onUpdate).not.toHaveBeenCalled();
    expect(clearPiPrivilegedPackageHistory).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

function catalogFixture(overrides: Partial<PiPrivilegedCatalog> = {}): PiPrivilegedCatalog {
  return {
    packages: [
      {
        id: "pkg-privileged",
        source: "npm:pi-ffmpeg",
        packageName: "pi-ffmpeg",
        rootPath: "/workspace/.ambient/pi-privileged-installs/imported/pi-ffmpeg",
        status: "active",
        installedAt: "2026-06-10T00:00:00.000Z",
        scan: scanFixture(),
      },
    ],
    history: [
      {
        id: "pkg-privileged-old",
        source: "npm:pi-ffmpeg-old",
        packageName: "pi-ffmpeg-old",
        rootPath: "/workspace/.ambient/pi-privileged-installs/imported/pi-ffmpeg-old",
        status: "disabled",
        installedAt: "2026-06-09T00:00:00.000Z",
        scan: scanFixture({ packageName: "pi-ffmpeg-old" }),
        removedAt: "2026-06-10T00:00:00.000Z",
        manualCleanup: ["/workspace/manual"],
      },
    ],
    errors: [],
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
