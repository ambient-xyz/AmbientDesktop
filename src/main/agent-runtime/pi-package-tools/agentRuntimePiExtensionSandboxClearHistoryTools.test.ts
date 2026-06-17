import { describe, expect, it, vi } from "vitest";

import { registerPiExtensionSandboxClearHistoryTool } from "./agentRuntimePiExtensionSandboxClearHistoryTools";
import type { PiExtensionSandboxCatalog } from "./piExtensionSandboxPackages";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimePiExtensionSandboxClearHistoryTools", () => {
  it("clears retained sandboxed extension history after approval", async () => {
    const workspace = { path: "/workspace" } as any;
    const thread = { collaborationMode: "agent" } as any;
    const registeredTools: RegisteredTool[] = [];
    const discoverPiExtensionSandboxPackages = vi.fn(async () => catalogFixture());
    const clearPiExtensionSandboxHistory = vi.fn(async () => catalogFixture({ history: [], errors: ["clear warning"] }));
    const resolveFirstPartyPluginPermission = vi.fn(async () => true);
    const emit = vi.fn();
    const onUpdate = vi.fn();

    registerPiExtensionSandboxClearHistoryTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      discoverPiExtensionSandboxPackages,
      clearPiExtensionSandboxHistory,
      resolveFirstPartyPluginPermission,
      emit,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_pi_extension_clear_history"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("clear-history", {}, undefined, onUpdate);

    expect(discoverPiExtensionSandboxPackages).toHaveBeenCalledWith("/workspace");
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_pi_extension_clear_history",
      title: "Clear sandboxed Pi extension history?",
      message: "Ambient wants to clear retained removed-package history for sandboxed Pi extensions. Active installs and audit rows are unchanged.",
      detail: [
        "Workspace: /workspace",
        "Retained removed packages: 1",
        "- pi-arxiv-old (pkg-extension-old); removedAt: 2026-06-10T00:00:00.000Z",
        "Active installs preserved: 1",
        "Effect: remove retained removed-package history for sandboxed Pi extensions.",
        "Audit history, active installs, and permission grants are unchanged.",
      ].join("\n"),
      grantTargetLabel: "Clear sandboxed Pi extension history",
      grantTargetIdentity: "ambient_pi_extension_clear_history\0/workspace\0pkg-extension-old",
      allowedReason: "Sandboxed Pi extension history clear approved by Ambient permission grant policy.",
      deniedReason: "Sandboxed Pi extension history clear prompt denied or timed out.",
    }));
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Clearing retained sandboxed Pi extension history." }],
      details: {
        runtime: "pi-extension-sandbox",
        toolName: "ambient_pi_extension_clear_history",
        status: "clearing",
        historyCount: 1,
      },
    });
    expect(clearPiExtensionSandboxHistory).toHaveBeenCalledWith("/workspace");
    expect(emit).toHaveBeenCalledWith({ type: "plugin-catalog-updated" });
    expect(result).toEqual({
      content: [{
        type: "text",
        text: [
          "Sandboxed Pi extension history cleared",
          "Cleared records: 1",
          "Remaining removed-package history: 0",
          "Active installs preserved: 1",
          "Audit history is preserved.",
        ].join("\n"),
      }],
      details: {
        runtime: "pi-extension-sandbox",
        toolName: "ambient_pi_extension_clear_history",
        clearedCount: 1,
        installedCount: 1,
        historyCount: 0,
        errors: ["clear warning"],
      },
    });
  });

  it("blocks history clearing in planner mode before discovery", async () => {
    const registeredTools: RegisteredTool[] = [];
    const discoverPiExtensionSandboxPackages = vi.fn();

    registerPiExtensionSandboxClearHistoryTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "planner" }) as any,
      discoverPiExtensionSandboxPackages,
      clearPiExtensionSandboxHistory: vi.fn(),
      resolveFirstPartyPluginPermission: vi.fn(),
      emit: vi.fn(),
    });

    await expect(registeredTools[0]!.execute("clear-history", {})).rejects.toThrow(
      "Sandboxed Pi extension history clearing is blocked in Planner Mode.",
    );
    expect(discoverPiExtensionSandboxPackages).not.toHaveBeenCalled();
  });

  it("stops before clearing when approval is denied", async () => {
    const registeredTools: RegisteredTool[] = [];
    const clearPiExtensionSandboxHistory = vi.fn();
    const emit = vi.fn();
    const onUpdate = vi.fn();

    registerPiExtensionSandboxClearHistoryTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      discoverPiExtensionSandboxPackages: vi.fn(async () => catalogFixture()),
      clearPiExtensionSandboxHistory,
      resolveFirstPartyPluginPermission: vi.fn(async () => false),
      emit,
    });

    await expect(registeredTools[0]!.execute("clear-history", {}, undefined, onUpdate)).rejects.toThrow(
      "Sandboxed Pi extension history clear blocked by approval prompt.",
    );
    expect(onUpdate).not.toHaveBeenCalled();
    expect(clearPiExtensionSandboxHistory).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

function catalogFixture(overrides: Partial<PiExtensionSandboxCatalog> = {}): PiExtensionSandboxCatalog {
  return {
    packages: [
      {
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
      },
    ],
    history: [
      {
        id: "pkg-extension-old",
        name: "pi-arxiv-old",
        source: "npm:pi-arxiv-old",
        resolvedSource: "npm:pi-arxiv-old@0.1.0",
        packagePath: "/tmp/pi-arxiv-old.tgz",
        sha: "sha-extension-old",
        rootPath: "/workspace/.ambient/pi-extension-sandboxes/imported/pi-arxiv-old",
        entrypoint: "index.ts",
        allowedNetworkHosts: [],
        tools: [],
        installed: false,
        errors: [],
        removedAt: "2026-06-10T00:00:00.000Z",
        removalReason: "user",
      },
    ],
    errors: [],
    ...overrides,
  };
}
