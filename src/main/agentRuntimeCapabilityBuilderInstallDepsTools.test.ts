import { describe, expect, it, vi } from "vitest";

import type { ThreadSummary, WorkspaceState } from "../shared/types";
import { registerCapabilityBuilderInstallDepsTool } from "./agentRuntimeCapabilityBuilderInstallDepsTools";
import type { CapabilityBuilderInstallDepsInput } from "./capabilityBuilder";

describe("agentRuntimeCapabilityBuilderInstallDepsTools", () => {
  it("requests approval, installs dependencies, and returns command output metadata", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const thread = { id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary;
    const input = inputFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseInstallDepsInput = vi.fn(() => input);
    const previewCapabilityBuilderPackage = vi.fn(async () => previewFixture());
    const installCapabilityBuilderDependencies = vi.fn(async () => installResultFixture());
    const capabilityBuilderInstallDepsText = vi.fn(() => "Ambient Capability Builder dependency installation.");
    const capabilityBuilderInstallDepsOutputPreview = vi.fn(() => ({ stdoutBytes: 128, stderrBytes: 8 }));
    const capabilityBuilderDependencyRuntimeGuidance = vi.fn(() => ["Use a package-local virtualenv."]);
    const resolveFirstPartyPluginPermission = vi.fn(async (_request: any) => true);
    const onUpdate = vi.fn();

    registerCapabilityBuilderInstallDepsTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      parseInstallDepsInput,
      previewCapabilityBuilderPackage,
      installCapabilityBuilderDependencies,
      capabilityBuilderInstallDepsText,
      capabilityBuilderInstallDepsOutputPreview,
      capabilityBuilderDependencyRuntimeGuidance,
      resolveFirstPartyPluginPermission,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_capability_builder_install_deps"]);

    const result = await registeredTools[0].execute("install", input, undefined, onUpdate);

    expect(parseInstallDepsInput).toHaveBeenCalledWith(input);
    expect(previewCapabilityBuilderPackage).toHaveBeenCalledWith(workspace.path, input);
    expect(capabilityBuilderDependencyRuntimeGuidance).toHaveBeenCalledWith(input.commands);
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_capability_builder_install_deps",
      title: 'Run dependency commands for "ambient-demo"?',
      message: "Ambient wants to run approved dependency/setup commands for a managed draft capability package.",
      grantTargetLabel: "Install deps for ambient-demo",
      grantTargetIdentity: ["ambient_capability_builder_install_deps", workspace.path, "ambient-demo", JSON.stringify(input.commands)].join("\0"),
      allowedReason: "Capability Builder dependency installation approved by Ambient permission grant policy.",
      deniedReason: "Capability Builder dependency installation prompt denied or timed out.",
    }));
    const permissionRequest = resolveFirstPartyPluginPermission.mock.calls[0]?.[0] as any;
    expect(permissionRequest.detail).toContain("Runtime guidance:\n- Use a package-local virtualenv.");
    expect(permissionRequest.detail).toContain('1. "python3" "-m" "venv" ".venv"\n   cwd: .\n   rationale: Create isolated Python env.');
    expect(permissionRequest.detail).toContain('2. "pnpm" "install"\n   cwd: tool\n   rationale: Install Node dependencies.');
    expect(permissionRequest.detail).toContain("No registration, activation, validation");
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: 'Running dependency commands for Ambient capability "ambient-demo".' }],
      details: {
        runtime: "ambient-capability-builder",
        toolName: "ambient_capability_builder_install_deps",
        status: "running",
        packageName: "ambient-demo",
        commandCount: 2,
      },
    });
    expect(installCapabilityBuilderDependencies).toHaveBeenCalledWith(workspace.path, input);
    expect(capabilityBuilderInstallDepsText).toHaveBeenCalledWith(installResultFixture());
    expect(capabilityBuilderInstallDepsOutputPreview).toHaveBeenCalledWith(installResultFixture());
    expect(result.content).toEqual([{ type: "text", text: "Ambient Capability Builder dependency installation." }]);
    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_install_deps",
      status: "succeeded",
      packageName: "ambient-demo",
      rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
      relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
      gitSha: "abc123",
      logPath: "/workspace/.ambient/capability-builder/packages/ambient-demo/capability-deps-log.jsonl",
      relativeLogPath: ".ambient/capability-builder/packages/ambient-demo/capability-deps-log.jsonl",
      commandCount: 2,
      durationMs: 350,
      commandDurationsMs: [100, 250],
      startedAt: "2026-06-10T13:45:00.000Z",
      completedAt: "2026-06-10T13:45:00.350Z",
      largeOutputPreview: { stdoutBytes: 128, stderrBytes: 8 },
    });
  });

  it("blocks dependency installation in Planner Mode before parsing or side effects", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseInstallDepsInput = vi.fn();
    const previewCapabilityBuilderPackage = vi.fn();
    const installCapabilityBuilderDependencies = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();

    registerCapabilityBuilderInstallDepsTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as WorkspaceState,
      getThread: () => ({ id: "thread-1", collaborationMode: "planner" } as unknown as ThreadSummary),
      parseInstallDepsInput,
      previewCapabilityBuilderPackage,
      installCapabilityBuilderDependencies,
      resolveFirstPartyPluginPermission,
    });

    await expect(registeredTools[0].execute("install", inputFixture())).rejects.toThrow(
      "Capability Builder dependency installation is blocked in Planner Mode.",
    );
    expect(parseInstallDepsInput).not.toHaveBeenCalled();
    expect(previewCapabilityBuilderPackage).not.toHaveBeenCalled();
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(installCapabilityBuilderDependencies).not.toHaveBeenCalled();
  });

  it("stops before approval when preview is invalid", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const input = inputFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const installCapabilityBuilderDependencies = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();

    registerCapabilityBuilderInstallDepsTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => ({ id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary),
      parseInstallDepsInput: vi.fn(() => input),
      previewCapabilityBuilderPackage: vi.fn(async () => ({
        ...previewFixture(),
        valid: false,
        errors: ["Missing descriptor."],
      })),
      installCapabilityBuilderDependencies,
      resolveFirstPartyPluginPermission,
    });

    await expect(registeredTools[0].execute("install", input)).rejects.toThrow(
      "Capability package preview has errors: Missing descriptor.",
    );
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(installCapabilityBuilderDependencies).not.toHaveBeenCalled();
  });

  it("does not install dependencies when approval is denied", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const input = inputFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const installCapabilityBuilderDependencies = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn(async (_request: any) => false);
    const onUpdate = vi.fn();

    registerCapabilityBuilderInstallDepsTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => ({ id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary),
      parseInstallDepsInput: vi.fn(() => input),
      previewCapabilityBuilderPackage: vi.fn(async () => previewFixture()),
      installCapabilityBuilderDependencies,
      resolveFirstPartyPluginPermission,
    });

    await expect(registeredTools[0].execute("install", input, undefined, onUpdate)).rejects.toThrow(
      "Capability Builder dependency installation blocked by approval prompt.",
    );
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(installCapabilityBuilderDependencies).not.toHaveBeenCalled();
  });
});

function inputFixture(): CapabilityBuilderInstallDepsInput {
  return {
    sourcePath: ".ambient/capability-builder/packages/ambient-demo",
    commands: [
      {
        command: "python3",
        args: ["-m", "venv", ".venv"],
        rationale: "Create isolated Python env.",
      },
      {
        command: "pnpm",
        args: ["install"],
        cwd: "tool",
        rationale: "Install Node dependencies.",
      },
    ],
  };
}

function previewFixture(): any {
  return {
    packageName: "ambient-demo",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    gitSha: "abc123",
    valid: true,
    installerShape: "custom-cli",
    errors: [],
    warnings: [],
    risks: [],
    files: {
      descriptor: true,
      skill: true,
      buildManifest: true,
      packageJson: true,
    },
  };
}

function installResultFixture(): any {
  return {
    packageName: "ambient-demo",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    gitSha: "abc123",
    succeeded: true,
    startedAt: "2026-06-10T13:45:00.000Z",
    completedAt: "2026-06-10T13:45:00.350Z",
    durationMs: 350,
    logPath: "/workspace/.ambient/capability-builder/packages/ambient-demo/capability-deps-log.jsonl",
    relativeLogPath: ".ambient/capability-builder/packages/ambient-demo/capability-deps-log.jsonl",
    commands: [
      {
        command: "python3",
        args: ["-m", "venv", ".venv"],
        cwd: ".",
        rationale: "Create isolated Python env.",
        status: "succeeded",
        durationMs: 100,
        exitCode: 0,
        stdoutPreview: "",
        stderrPreview: "",
        stdoutLength: 0,
        stderrLength: 0,
        stdoutTruncated: false,
        stderrTruncated: false,
      },
      {
        command: "pnpm",
        args: ["install"],
        cwd: "tool",
        rationale: "Install Node dependencies.",
        status: "succeeded",
        durationMs: 250,
        exitCode: 0,
        stdoutPreview: "installed",
        stderrPreview: "",
        stdoutLength: 9,
        stderrLength: 0,
        stdoutTruncated: false,
        stderrTruncated: false,
      },
    ],
  };
}
