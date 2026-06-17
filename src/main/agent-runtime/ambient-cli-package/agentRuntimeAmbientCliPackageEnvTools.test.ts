import { describe, expect, it, vi } from "vitest";

import {
  registerAmbientCliPackageEnvBindTool,
  registerAmbientCliPackageSecretRequestTool,
} from "./agentRuntimeAmbientCliPackageEnvTools";

describe("agentRuntimeAmbientCliPackageEnvTools", () => {
  it("binds an installed package env requirement to a workspace-local secret file", async () => {
    const workspace = { path: "/workspace" } as any;
    const thread = { collaborationMode: "agent" } as any;
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const discoverAmbientCliPackages = vi.fn(async () => catalogFixture());
    const setAmbientCliPackageEnvBinding = vi.fn(async (_workspacePath: string, _input: any) => ({
      name: "DEMO_KEY",
      required: true,
      configured: true,
      source: "file" as const,
      filePath: "/workspace/.secrets/demo-key.txt",
    }));
    const resolveFirstPartyPluginPermission = vi.fn(async (_request: any) => true);
    const onUpdate = vi.fn();

    registerAmbientCliPackageEnvBindTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      discoverAmbientCliPackages,
      setAmbientCliPackageEnvBinding,
      resolveFirstPartyPluginPermission,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_cli_env_bind"]);

    const result = await registeredTools[0].execute("env-bind", {
      packageName: "ambient-demo",
      envName: "DEMO_KEY",
      filePath: "/workspace/.secrets/demo-key.txt",
    }, undefined, onUpdate);

    expect(discoverAmbientCliPackages).toHaveBeenCalledWith(workspace.path);
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_cli_env_bind",
      title: "Bind Ambient CLI secret \"ambient-demo:DEMO_KEY\"?",
      message: "Ambient wants to bind a workspace-local secret file to an installed CLI package env requirement.",
      grantTargetLabel: "Bind Ambient CLI secret ambient-demo:DEMO_KEY",
      grantTargetIdentity: "ambient_cli_env_bind\0pkg-123\0DEMO_KEY\0/workspace/.secrets/demo-key.txt",
      allowedReason: "Ambient CLI env binding approved by Ambient permission grant policy.",
      deniedReason: "Ambient CLI env binding prompt denied or timed out.",
    }));
    const permissionRequest = resolveFirstPartyPluginPermission.mock.calls[0][0];
    expect(permissionRequest.detail).toBe([
      "Workspace: /workspace",
      "Package: ambient-demo",
      "Package id: pkg-123",
      "Env name: DEMO_KEY",
      "Secret file: /workspace/.secrets/demo-key.txt",
      "Secret value: not read into the transcript.",
    ].join("\n"));
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Binding Ambient CLI env \"ambient-demo:DEMO_KEY\" to a workspace-local secret file." }],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli_env_bind",
        packageId: "pkg-123",
        packageName: "ambient-demo",
        envName: "DEMO_KEY",
        filePath: "/workspace/.secrets/demo-key.txt",
        status: "binding",
      },
    });
    expect(setAmbientCliPackageEnvBinding).toHaveBeenCalledWith(workspace.path, {
      packageName: "ambient-demo",
      envName: "DEMO_KEY",
      filePath: "/workspace/.secrets/demo-key.txt",
    });
    expect(result).toEqual({
      content: [{
        type: "text",
        text: [
          "Ambient CLI env binding saved",
          "Package: ambient-demo",
          "Env name: DEMO_KEY",
          "Source: file",
          "File: /workspace/.secrets/demo-key.txt",
          "Secret value: not printed",
        ].join("\n"),
      }],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli_env_bind",
        packageId: "pkg-123",
        packageName: "ambient-demo",
        envName: "DEMO_KEY",
        source: "file",
        filePath: "/workspace/.secrets/demo-key.txt",
        configured: true,
      },
    });
  });

  it("requires the package to declare the requested env requirement", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const resolveFirstPartyPluginPermission = vi.fn();
    const setAmbientCliPackageEnvBinding = vi.fn();

    registerAmbientCliPackageEnvBindTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      discoverAmbientCliPackages: vi.fn(async () => catalogFixture()),
      setAmbientCliPackageEnvBinding,
      resolveFirstPartyPluginPermission,
    });

    await expect(registeredTools[0].execute("env-bind", {
      packageName: "ambient-demo",
      envName: "OTHER_KEY",
      filePath: "/workspace/.secrets/other-key.txt",
    })).rejects.toThrow("Ambient CLI package \"ambient-demo\" does not declare env requirement \"OTHER_KEY\".");
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(setAmbientCliPackageEnvBinding).not.toHaveBeenCalled();
  });

  it("stops before binding when approval is denied", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const setAmbientCliPackageEnvBinding = vi.fn();
    const onUpdate = vi.fn();

    registerAmbientCliPackageEnvBindTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      discoverAmbientCliPackages: vi.fn(async () => catalogFixture()),
      setAmbientCliPackageEnvBinding,
      resolveFirstPartyPluginPermission: vi.fn(async () => false),
    });

    await expect(registeredTools[0].execute("env-bind", {
      packageId: "pkg-123",
      envName: "DEMO_KEY",
      filePath: "/workspace/.secrets/demo-key.txt",
    }, undefined, onUpdate)).rejects.toThrow("Ambient CLI env binding blocked by approval prompt.");
    expect(onUpdate).not.toHaveBeenCalled();
    expect(setAmbientCliPackageEnvBinding).not.toHaveBeenCalled();
  });

  it("requests a Desktop secret dialog for a declared env requirement", async () => {
    const workspace = { path: "/workspace" } as any;
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const discoverAmbientCliPackages = vi.fn(async () => catalogFixture());
    const emitAmbientCliSecretRequested = vi.fn();

    registerAmbientCliPackageSecretRequestTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      discoverAmbientCliPackages,
      emitAmbientCliSecretRequested,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_cli_secret_request"]);

    const result = await registeredTools[0].execute("secret-request", {
      packageName: "ambient-demo",
      envName: "DEMO_KEY",
    });

    expect(discoverAmbientCliPackages).toHaveBeenCalledWith(workspace.path);
    expect(emitAmbientCliSecretRequested).toHaveBeenCalledWith({
      packageId: "pkg-123",
      packageName: "ambient-demo",
      envName: "DEMO_KEY",
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: [
            "Ambient CLI secret dialog requested",
            "Package: ambient-demo",
            "Env name: DEMO_KEY",
            "Secret value: never exposed to Pi",
          ].join("\n"),
        },
      ],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli_secret_request",
        packageId: "pkg-123",
        packageName: "ambient-demo",
        envName: "DEMO_KEY",
      },
    });
  });

  it("does not request a secret dialog for undeclared env requirements", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const emitAmbientCliSecretRequested = vi.fn();

    registerAmbientCliPackageSecretRequestTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      discoverAmbientCliPackages: vi.fn(async () => catalogFixture()),
      emitAmbientCliSecretRequested,
    });

    await expect(registeredTools[0].execute("secret-request", {
      packageName: "ambient-demo",
      envName: "OTHER_KEY",
    })).rejects.toThrow("Ambient CLI package \"ambient-demo\" does not declare env requirement \"OTHER_KEY\".");
    expect(emitAmbientCliSecretRequested).not.toHaveBeenCalled();
  });
});

function catalogFixture(): any {
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
        envRequirements: [
          {
            name: "DEMO_KEY",
            required: true,
          },
        ],
        errors: [],
      },
    ],
    errors: [],
  };
}
