import { describe, expect, it, vi } from "vitest";

import {
  ambientCliPackageInstallText,
  registerAmbientCliPackageInstallTool,
} from "./agentRuntimeAmbientCliPackageInstallTools";

describe("agentRuntimeAmbientCliPackageInstallTools", () => {
  it("previews, requests approval, installs, and returns package metadata", async () => {
    const workspace = { path: "/workspace" } as any;
    const thread = { collaborationMode: "agent" } as any;
    const input = {
      source: "https://example.com/repo.git",
      path: "packages/demo",
      ref: "main",
      sha: "abc123",
      descriptor: { name: "ambient-demo", metadata: { z: 2, a: 1 } },
      installDependencies: true,
    };
    const preview = previewFixture();
    const installedPackage = packageFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const previewAmbientCliPackageInstallSource = vi.fn(async () => preview);
    const installAmbientCliPackageSource = vi.fn(async () => installedPackage);
    const resolveFirstPartyPluginPermission = vi.fn(async (_request: any) => true);
    const markPluginToolsStale = vi.fn();
    const onUpdate = vi.fn();

    registerAmbientCliPackageInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      previewAmbientCliPackageInstallSource,
      installAmbientCliPackageSource,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_cli_package_install"]);

    const result = await registeredTools[0].execute("install", input, undefined, onUpdate);

    expect(previewAmbientCliPackageInstallSource).toHaveBeenCalledWith(workspace.path, input);
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_cli_package_install",
      title: "Install Ambient CLI package \"ambient-demo\"?",
      message: "Ambient wants to install a local descriptor-backed CLI package. Declared commands can be run later through ambient_cli with separate approval.",
      grantTargetLabel: "Install Ambient CLI package ambient-demo",
      allowedReason: "Ambient CLI package install approved by Ambient permission grant policy.",
      deniedReason: "Ambient CLI package install prompt denied or timed out.",
    }));
    const permissionRequest = resolveFirstPartyPluginPermission.mock.calls[0][0];
    expect(permissionRequest.detail).toContain("Workspace: /workspace");
    expect(permissionRequest.detail).toContain("Dependencies: installed via pnpm install");
    expect(permissionRequest.detail).toContain("Env requirements: DEMO_KEY=missing");
    expect(permissionRequest.grantTargetIdentity).toBe([
      "ambient_cli_package_install",
      "https://example.com/repo.git",
      "packages/demo",
      "main",
      "abc123",
      "install-dependencies",
      "ambient-demo",
      "0.0.0",
      "demo:node:demo.js:package",
      "demo-skill",
      "{\"metadata\":{\"a\":1,\"z\":2},\"name\":\"ambient-demo\"}",
    ].join("\0"));
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Installing Ambient CLI package from https://example.com/repo.git." }],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli_package_install",
        source: "https://example.com/repo.git",
        path: "packages/demo",
        ref: "main",
        sha: "abc123",
        descriptorOverlay: true,
        installDependencies: true,
        status: "installing",
      },
    });
    expect(installAmbientCliPackageSource).toHaveBeenCalledWith(workspace.path, input);
    expect(markPluginToolsStale).toHaveBeenCalledOnce();
    expect(result).toEqual({
      content: [{ type: "text", text: ambientCliPackageInstallText(installedPackage) }],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli_package_install",
        packageId: "pkg-123",
        packageName: "ambient-demo",
        commandCount: 1,
        skillCount: 1,
        availability: "next-session-refresh",
      },
    });
  });

  it("omits blank optional fields and defaults dependency installation to false", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const previewAmbientCliPackageInstallSource = vi.fn(async () => ({
      ...previewFixture(),
      path: undefined,
      ref: undefined,
      sha: undefined,
      dependencyInstall: undefined,
    }));
    const installAmbientCliPackageSource = vi.fn(async () => packageFixture());
    const resolveFirstPartyPluginPermission = vi.fn(async () => true);
    const onUpdate = vi.fn();

    registerAmbientCliPackageInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      previewAmbientCliPackageInstallSource,
      installAmbientCliPackageSource,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale: vi.fn(),
    });

    await registeredTools[0].execute("install", {
      source: "local-package",
      path: "",
      ref: "",
      sha: "",
    }, undefined, onUpdate);

    expect(previewAmbientCliPackageInstallSource).toHaveBeenCalledWith("/workspace", {
      source: "local-package",
    });
    expect(installAmbientCliPackageSource).toHaveBeenCalledWith("/workspace", {
      source: "local-package",
    });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        source: "local-package",
        path: undefined,
        ref: undefined,
        sha: undefined,
        descriptorOverlay: false,
        installDependencies: false,
      }),
    }));
  });

  it("stops before permission and install when preview is not installable", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const previewAmbientCliPackageInstallSource = vi.fn(async () => ({
      ...previewFixture(),
      installable: false,
      errors: ["descriptor missing", "health check failed"],
    }));
    const installAmbientCliPackageSource = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();

    registerAmbientCliPackageInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      previewAmbientCliPackageInstallSource,
      installAmbientCliPackageSource,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale: vi.fn(),
    });

    await expect(registeredTools[0].execute("install", { source: "broken-package" })).rejects.toThrow(
      "Ambient CLI package source is not installable: descriptor missing; health check failed",
    );
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(installAmbientCliPackageSource).not.toHaveBeenCalled();
  });

  it("redacts credential-bearing Git sources from install progress metadata", async () => {
    const workspace = { path: "/workspace" } as any;
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const installAmbientCliPackageSource = vi.fn(async () => packageFixture());
    const onUpdate = vi.fn();
    const source = "git+ext::https://user:secret@example.test/repo.git?auth=secret";

    registerAmbientCliPackageInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      previewAmbientCliPackageInstallSource: vi.fn(async () => previewFixture()),
      installAmbientCliPackageSource,
      resolveFirstPartyPluginPermission: vi.fn(async () => true),
      markPluginToolsStale: vi.fn(),
    });

    await registeredTools[0].execute("install", {
      source,
      sha: "0123456789abcdef0123456789abcdef01234567",
    }, undefined, onUpdate);

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      content: [{ type: "text", text: "Installing Ambient CLI package from git+ext::https://example.test/repo.git." }],
      details: expect.objectContaining({
        source: "git+ext::https://example.test/repo.git",
      }),
    }));
    expect(installAmbientCliPackageSource).toHaveBeenCalledWith(workspace.path, {
      source,
      sha: "0123456789abcdef0123456789abcdef01234567",
    });
    expect(JSON.stringify(onUpdate.mock.calls)).not.toContain("secret");
  });

  it("stops before install when approval is denied", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const installAmbientCliPackageSource = vi.fn();
    const markPluginToolsStale = vi.fn();

    registerAmbientCliPackageInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      previewAmbientCliPackageInstallSource: vi.fn(async () => previewFixture()),
      installAmbientCliPackageSource,
      resolveFirstPartyPluginPermission: vi.fn(async () => false),
      markPluginToolsStale,
    });

    await expect(registeredTools[0].execute("install", { source: "local-package" })).rejects.toThrow(
      "Ambient CLI package install blocked by approval prompt.",
    );
    expect(installAmbientCliPackageSource).not.toHaveBeenCalled();
    expect(markPluginToolsStale).not.toHaveBeenCalled();
  });

  it("blocks installation in planner mode before previewing", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const previewAmbientCliPackageInstallSource = vi.fn();

    registerAmbientCliPackageInstallTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "planner" }) as any,
      previewAmbientCliPackageInstallSource,
      installAmbientCliPackageSource: vi.fn(),
      resolveFirstPartyPluginPermission: vi.fn(),
      markPluginToolsStale: vi.fn(),
    });

    await expect(registeredTools[0].execute("install", { source: "local-package" })).rejects.toThrow(
      "CLI package installation is blocked in Planner Mode.",
    );
    expect(previewAmbientCliPackageInstallSource).not.toHaveBeenCalled();
  });
});

function previewFixture(): any {
  return {
    source: "https://example.com/repo.git",
    path: "packages/demo",
    ref: "main",
    sha: "abc123",
    candidate: packageFixture({ installed: false }),
    dependencyInstall: {
      manager: "npm",
      passed: true,
      attempted: true,
      skipped: false,
      command: ["pnpm", "install"],
      cwd: "/workspace/packages/demo",
    },
    envStatus: [
      {
        name: "DEMO_KEY",
        required: true,
        configured: false,
      },
    ],
    healthChecks: [
      {
        commandName: "demo",
        command: ["node", "demo.js"],
        cwd: "/workspace/packages/demo",
        passed: true,
      },
    ],
    installable: true,
    errors: [],
  };
}

function packageFixture(overrides: Record<string, unknown> = {}): any {
  return {
    id: "pkg-123",
    name: "ambient-demo",
    version: "0.0.0",
    description: "Generated demo package.",
    rootPath: "/workspace/.ambient/cli-packages/ambient-demo",
    source: "https://example.com/repo.git",
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
