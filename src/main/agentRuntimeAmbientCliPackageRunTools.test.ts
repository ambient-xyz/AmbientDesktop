import { describe, expect, it, vi } from "vitest";

import {
  ambientCliPreflightDescribeText,
  ambientCliRunText,
  registerAmbientCliRunTool,
} from "./agentRuntimeAmbientCliPackageRunTools";

describe("agentRuntimeAmbientCliPackageRunTools", () => {
  it("describes an unseen Ambient CLI package without executing it", async () => {
    const workspace = { path: "/workspace" } as any;
    const thread = { collaborationMode: "agent" } as any;
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const catalog = catalogFixture();
    const description = descriptionFixture();
    const discoverAmbientCliPackages = vi.fn(async () => catalog);
    const describeAmbientCliPackage = vi.fn(async () => description);
    const runAmbientCliPackageCommand = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();
    const isAmbientCliPackageDescribed = vi.fn(() => false);
    const markAmbientCliPackageDescribed = vi.fn();
    const modelComplete = vi.fn(async () => "summary");
    const signal = new AbortController().signal;
    const toolLongformInputPreview = { kind: "longform-input", title: "Arguments", runningTitle: "Running Ambient CLI", summary: "summary", items: [] };
    const buildToolLongformInputPreview = vi.fn(() => toolLongformInputPreview as any);

    registerAmbientCliRunTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      discoverAmbientCliPackages,
      describeAmbientCliPackage,
      runAmbientCliPackageCommand,
      isAmbientCliPackageDescribed,
      markAmbientCliPackageDescribed,
      resolveFirstPartyPluginPermission,
      modelComplete,
      buildToolLongformInputPreview,
      env: { AMBIENT_CLI_RLM_SUMMARIES: "1" },
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_cli"]);

    const result = await registeredTools[0].execute("cli", {
      packageId: "pkg-123",
      command: "demo",
      args: ["--payload", "x".repeat(600)],
      cwd: "subdir",
    }, signal);

    expect(discoverAmbientCliPackages).toHaveBeenCalledWith(workspace.path);
    expect(isAmbientCliPackageDescribed).toHaveBeenCalledWith("pkg-123", "ambient-demo");
    expect(buildToolLongformInputPreview).toHaveBeenCalledWith("ambient_cli", {
      packageId: "pkg-123",
      packageName: "ambient-demo",
      command: "demo",
      args: ["--payload", "x".repeat(600)],
      cwd: "subdir",
    });
    expect(describeAmbientCliPackage).toHaveBeenCalledWith(workspace.path, {
      packageId: "pkg-123",
      packageName: "ambient-demo",
      command: "demo",
    }, {
      generateMissingSummaries: true,
      signal,
      modelComplete,
    });
    expect(markAmbientCliPackageDescribed).toHaveBeenCalledWith("pkg-123", "ambient-demo");
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(runAmbientCliPackageCommand).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: [{ type: "text", text: ambientCliPreflightDescribeText(description) }],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli",
        packageId: "pkg-123",
        packageName: "ambient-demo",
        commandName: "demo",
        status: "preflight-description",
        executed: false,
        commandNames: ["demo"],
        skillCount: 1,
        includedSkillText: true,
        generatedSummary: true,
        summaryStatuses: ["available"],
        missingEnv: ["DEMO_KEY"],
        toolLongformInputPreview,
      },
    });
  });

  it("runs a previously described Ambient CLI package after approval", async () => {
    const workspace = { path: "/workspace" } as any;
    const thread = { collaborationMode: "agent" } as any;
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const runResult = runResultFixture();
    const resolveFirstPartyPluginPermission = vi.fn(async () => true);
    const runAmbientCliPackageCommand = vi.fn(async () => runResult);
    const describeAmbientCliPackage = vi.fn();
    const onUpdate = vi.fn();

    registerAmbientCliRunTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      discoverAmbientCliPackages: vi.fn(async () => catalogFixture()),
      describeAmbientCliPackage,
      runAmbientCliPackageCommand,
      isAmbientCliPackageDescribed: vi.fn(() => true),
      markAmbientCliPackageDescribed: vi.fn(),
      resolveFirstPartyPluginPermission,
      env: {},
    });

    const result = await registeredTools[0].execute("cli", {
      packageName: "ambient-demo",
      command: "demo",
      args: ["input"],
      cwd: "subdir",
    }, undefined, onUpdate);

    expect(describeAmbientCliPackage).not.toHaveBeenCalled();
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_cli",
      title: "Run Ambient CLI \"ambient-demo:demo\"?",
      message: "Ambient wants to run a command declared by an installed CLI package.",
      detail: [
        "Workspace: /workspace",
        "Package: ambient-demo",
        "Package id: pkg-123",
        "Package root: /workspace/.ambient/cli-packages/ambient-demo",
        "Command name: demo",
        "Executable: node",
        "Descriptor args: demo.js",
        "Call args: input",
        "Cwd policy: workspace",
        "Requested cwd: subdir",
        "Env requirements: DEMO_KEY",
      ].join("\n"),
      grantTargetLabel: "Run Ambient CLI ambient-demo:demo",
      grantTargetIdentity: "ambient_cli\0pkg-123\0demo\0node\0demo.js\0workspace\0subdir",
      allowedReason: "Ambient CLI execution approved by Ambient permission grant policy.",
      deniedReason: "Ambient CLI execution prompt denied or timed out.",
    }));
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: "Running Ambient CLI \"ambient-demo:demo\"." }],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli",
        packageId: "pkg-123",
        packageName: "ambient-demo",
        command: "demo",
        status: "running",
      },
    });
    expect(runAmbientCliPackageCommand).toHaveBeenCalledWith(workspace.path, {
      packageId: "pkg-123",
      command: "demo",
      args: ["input"],
      cwd: "subdir",
    });
    expect(result).toEqual({
      content: [{ type: "text", text: ambientCliRunText(runResult) }],
      details: {
        runtime: "ambient-cli",
        toolName: "ambient_cli",
        packageId: "pkg-123",
        packageName: "ambient-demo",
        commandName: "demo",
        cwd: "/workspace/subdir",
        durationMs: 42,
      },
    });
  });

  it("stops before execution when approval is denied", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const runAmbientCliPackageCommand = vi.fn();
    const onUpdate = vi.fn();

    registerAmbientCliRunTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      discoverAmbientCliPackages: vi.fn(async () => catalogFixture()),
      runAmbientCliPackageCommand,
      isAmbientCliPackageDescribed: vi.fn(() => true),
      markAmbientCliPackageDescribed: vi.fn(),
      resolveFirstPartyPluginPermission: vi.fn(async () => false),
      env: {},
    });

    await expect(registeredTools[0].execute("cli", { packageName: "ambient-demo", command: "demo" }, undefined, onUpdate)).rejects.toThrow(
      "Ambient CLI execution blocked by approval prompt.",
    );
    expect(onUpdate).not.toHaveBeenCalled();
    expect(runAmbientCliPackageCommand).not.toHaveBeenCalled();
  });

  it("rejects undeclared package commands before preflight or permission", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const describeAmbientCliPackage = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();
    const runAmbientCliPackageCommand = vi.fn();

    registerAmbientCliRunTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as any,
      getThread: () => ({ collaborationMode: "agent" }) as any,
      discoverAmbientCliPackages: vi.fn(async () => catalogFixture()),
      describeAmbientCliPackage,
      runAmbientCliPackageCommand,
      isAmbientCliPackageDescribed: vi.fn(() => false),
      markAmbientCliPackageDescribed: vi.fn(),
      resolveFirstPartyPluginPermission,
      env: {},
    });

    await expect(registeredTools[0].execute("cli", { packageName: "ambient-demo", command: "missing" })).rejects.toThrow(
      "Ambient CLI package \"ambient-demo\" does not declare command \"missing\".",
    );
    expect(describeAmbientCliPackage).not.toHaveBeenCalled();
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(runAmbientCliPackageCommand).not.toHaveBeenCalled();
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
        commands: [
          {
            name: "demo",
            description: "Run demo.",
            command: "node",
            args: ["demo.js"],
            cwd: "workspace",
          },
        ],
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

function descriptionFixture(): any {
  return {
    package: {
      id: "pkg-123",
      name: "ambient-demo",
      version: "0.0.0",
      description: "Generated demo package.",
      source: "local",
      installed: true,
      availability: "available",
      availabilityReason: "ready",
    },
    commands: [
      {
        capabilityId: "pkg-123:command:demo",
        sourceKind: "ambient-cli",
        name: "demo",
        description: "Run demo.",
        command: "node",
        descriptorArgs: ["demo.js"],
        cwd: "workspace",
        health: "passed",
        risk: [],
        invocation: {
          tool: "ambient_cli",
          packageName: "ambient-demo",
          command: "demo",
          args: [],
        },
      },
    ],
    skills: [
      {
        capabilityId: "pkg-123:skill:demo",
        sourceKind: "ambient-cli",
        name: "demo-skill",
        description: "Use demo.",
        path: "/workspace/.ambient/cli-packages/ambient-demo/skills/demo/SKILL.md",
        summaryStatus: "available",
        text: "Skill body",
        truncated: false,
      },
    ],
    env: [
      {
        name: "DEMO_KEY",
        required: true,
        configured: false,
      },
    ],
    guidance: ["Describe before running."],
    diagnostics: ["diagnostic"],
  };
}

function runResultFixture(): any {
  return {
    packageId: "pkg-123",
    packageName: "ambient-demo",
    commandName: "demo",
    command: ["node", "demo.js", "input"],
    cwd: "/workspace/subdir",
    durationMs: 42,
    stdout: "ok",
  };
}
