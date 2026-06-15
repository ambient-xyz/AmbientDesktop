import { describe, expect, it, vi } from "vitest";

import { registerPiExtensionSandboxRunTool } from "./agentRuntimePiExtensionSandboxRunTools";
import type { PiExtensionSandboxCatalog, PiExtensionSandboxPackageSummary } from "./piExtensionSandboxPackages";

type RegisteredTool = { name: string; executionMode?: string; execute: (...args: any[]) => Promise<any> };

describe("agentRuntimePiExtensionSandboxRunTools", () => {
  it("runs a sandboxed extension tool after approval", async () => {
    const workspace = { path: "/workspace" } as any;
    const thread = { collaborationMode: "agent" } as any;
    const registeredTools: RegisteredTool[] = [];
    const discoverPiExtensionSandboxPackages = vi.fn(async () => catalogFixture());
    const runPiExtensionSandboxTool = vi.fn(async () => ({
      pkg: packageFixture(),
      result: {
        toolName: "search_arxiv",
        content: [{ type: "text", text: "ok" }],
        details: { count: 1 },
        isError: false,
      },
    }));
    const resolveFirstPartyPluginPermission = vi.fn(async () => true);
    const onUpdate = vi.fn();

    registerPiExtensionSandboxRunTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      discoverPiExtensionSandboxPackages,
      runPiExtensionSandboxTool: runPiExtensionSandboxTool as any,
      resolveFirstPartyPluginPermission,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_pi_extension"]);
    expect(registeredTools[0]!.executionMode).toBe("sequential");

    const result = await registeredTools[0]!.execute("run", {
      packageName: "pi-arxiv",
      toolName: "search_arxiv",
      params: { z: 2, a: 1 },
    }, undefined, onUpdate);

    expect(discoverPiExtensionSandboxPackages).toHaveBeenCalledWith("/workspace");
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_pi_extension",
      title: "Run sandboxed Pi extension \"pi-arxiv:search_arxiv\"?",
      message: "Ambient wants to run a tool from an installed sandboxed Pi extension package.",
      detail: [
        "Workspace: /workspace",
        "Package: pi-arxiv",
        "Package id: pkg-extension",
        "Package root: /workspace/.ambient/pi-extension-sandboxes/imported/pi-arxiv",
        "SHA: sha-extension",
        "Tool: search_arxiv",
        "Allowed network hosts: export.arxiv.org",
        "Params: {\"a\":1,\"z\":2}",
        "Host policy: filesystem, process, env, eval, Function, unsupported imports, and undeclared network hosts are denied.",
      ].join("\n"),
      grantTargetLabel: "Run sandboxed Pi extension pi-arxiv:search_arxiv",
      grantTargetIdentity: "ambient_pi_extension\0pkg-extension\0sha-extension\0search_arxiv\0{\"a\":{\"b\":1},\"z\":true}\0export.arxiv.org",
      allowedReason: "Sandboxed Pi extension execution approved by Ambient permission grant policy.",
      deniedReason: "Sandboxed Pi extension execution prompt denied or timed out.",
    }));
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Running sandboxed Pi extension \"pi-arxiv:search_arxiv\"." }],
      details: {
        runtime: "pi-extension-sandbox",
        toolName: "ambient_pi_extension",
        packageId: "pkg-extension",
        packageName: "pi-arxiv",
        piToolName: "search_arxiv",
        status: "running",
      },
    });
    expect(runPiExtensionSandboxTool).toHaveBeenCalledWith("/workspace", {
      packageId: "pkg-extension",
      toolName: "search_arxiv",
      params: { z: 2, a: 1 },
    });
    expect(result).toEqual({
      content: [{ type: "text", text: "ok" }],
      details: {
        runtime: "pi-extension-sandbox",
        toolName: "ambient_pi_extension",
        packageId: "pkg-extension",
        packageName: "pi-arxiv",
        piToolName: "search_arxiv",
        resultDetails: { count: 1 },
        isError: false,
      },
    });
  });

  it("stops before running when approval is denied", async () => {
    const registeredTools: RegisteredTool[] = [];
    const runPiExtensionSandboxTool = vi.fn();
    const onUpdate = vi.fn();

    registerPiExtensionSandboxRunTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      discoverPiExtensionSandboxPackages: vi.fn(async () => catalogFixture()),
      runPiExtensionSandboxTool: runPiExtensionSandboxTool as any,
      resolveFirstPartyPluginPermission: vi.fn(async () => false),
    });

    await expect(registeredTools[0]!.execute("run", { packageId: "pkg-extension", toolName: "search_arxiv" }, undefined, onUpdate)).rejects.toThrow(
      "Sandboxed Pi extension execution blocked by approval prompt.",
    );
    expect(onUpdate).not.toHaveBeenCalled();
    expect(runPiExtensionSandboxTool).not.toHaveBeenCalled();
  });

  it("fails before approval when the package does not register the requested tool", async () => {
    const registeredTools: RegisteredTool[] = [];
    const resolveFirstPartyPluginPermission = vi.fn();
    const runPiExtensionSandboxTool = vi.fn();

    registerPiExtensionSandboxRunTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      discoverPiExtensionSandboxPackages: vi.fn(async () => catalogFixture()),
      runPiExtensionSandboxTool: runPiExtensionSandboxTool as any,
      resolveFirstPartyPluginPermission,
    });

    await expect(registeredTools[0]!.execute("run", { packageName: "pi-arxiv", toolName: "missing" })).rejects.toThrow(
      "Sandboxed Pi extension package \"pi-arxiv\" does not register tool \"missing\".",
    );
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(runPiExtensionSandboxTool).not.toHaveBeenCalled();
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
    tools: [{ name: "search_arxiv", parameters: { z: true, a: { b: 1 } } }],
    installed: true,
    errors: [],
    ...overrides,
  };
}
