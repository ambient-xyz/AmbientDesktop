import { describe, expect, it, vi } from "vitest";

import type { ThreadSummary, WorkspaceState } from "../../shared/types";
import { registerCapabilityBuilderRegisterTool } from "./agentRuntimeCapabilityBuilderRegisterTools";
import type { CapabilityBuilderRegisterInput } from "./capabilityBuilder";

describe("agentRuntimeCapabilityBuilderRegisterTools", () => {
  it("requests approval, registers the package, completes voice setup, and marks tools stale", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const thread = { id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary;
    const input = inputFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseRegisterInput = vi.fn(() => input);
    const previewCapabilityBuilderPackage = vi.fn(async () => previewFixture());
    const registerCapabilityBuilderPackage = vi.fn(async () => registerResultFixture({ voice: true }));
    const capabilityBuilderRegisterText = vi.fn(() => "Ambient Capability Builder registered.");
    const completeRegisteredVoiceProviderSetup = vi.fn(async () => ({
      text: "Voice provider setup completion.",
      details: { selected: true, dogfood: { status: "succeeded" } },
    }));
    const resolveFirstPartyPluginPermission = vi.fn(async (_request: any) => true);
    const markPluginToolsStale = vi.fn();
    const onUpdate = vi.fn();

    registerCapabilityBuilderRegisterTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      parseRegisterInput,
      previewCapabilityBuilderPackage,
      registerCapabilityBuilderPackage,
      capabilityBuilderRegisterText,
      completeRegisteredVoiceProviderSetup,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_capability_builder_register"]);

    const result = await registeredTools[0].execute("register", input, undefined, onUpdate);

    expect(parseRegisterInput).toHaveBeenCalledWith(input);
    expect(previewCapabilityBuilderPackage).toHaveBeenCalledWith(workspace.path, input);
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_capability_builder_register",
      title: 'Register Ambient capability "ambient-demo"?',
      message: "Ambient wants to install a validated managed capability package into Ambient CLI package state.",
      grantTargetLabel: "Register capability ambient-demo",
      grantTargetIdentity: ["ambient_capability_builder_register", workspace.path, "ambient-demo", "abc123"].join("\0"),
      allowedReason: "Capability Builder registration approved by Ambient permission grant policy.",
      deniedReason: "Capability Builder registration prompt denied or timed out.",
    }));
    const permissionRequest = resolveFirstPartyPluginPermission.mock.calls[0]?.[0] as any;
    expect(permissionRequest.detail).toContain("Commands: demo, render");
    expect(permissionRequest.detail).toContain("Artifacts: text/plain");
    expect(permissionRequest.detail).toContain("No generated capability command is invoked");
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: 'Registering Ambient capability "ambient-demo".' }],
      details: {
        runtime: "ambient-capability-builder",
        toolName: "ambient_capability_builder_register",
        status: "registering",
        packageName: "ambient-demo",
      },
    });
    expect(registerCapabilityBuilderPackage).toHaveBeenCalledWith(workspace.path, input);
    expect(completeRegisteredVoiceProviderSetup).toHaveBeenCalledWith(
      thread,
      workspace,
      registerResultFixture({ voice: true }).voiceProvider,
    );
    expect(markPluginToolsStale).toHaveBeenCalledTimes(1);
    expect(capabilityBuilderRegisterText).toHaveBeenCalledWith(registerResultFixture({ voice: true }));
    expect(result.content).toEqual([{
      type: "text",
      text: "Ambient Capability Builder registered.\n\nVoice provider setup completion.",
    }]);
    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_register",
      status: "registered",
      packageName: "ambient-demo",
      rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
      relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
      gitSha: "def456",
      registeredAt: "2026-06-10T14:20:00.000Z",
      installedPackageId: "pkg-123",
      installedPackageName: "ambient-demo",
      installedSource: "capability-builder:ambient-demo",
      commandCount: 2,
      skillCount: 1,
      availability: "next-session-refresh",
      voiceCompletion: { selected: true, dogfood: { status: "succeeded" } },
    });
  });

  it("registers non-voice packages without running voice completion", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const input = inputFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const completeRegisteredVoiceProviderSetup = vi.fn();

    registerCapabilityBuilderRegisterTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => ({ id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary),
      parseRegisterInput: vi.fn(() => input),
      previewCapabilityBuilderPackage: vi.fn(async () => previewFixture()),
      registerCapabilityBuilderPackage: vi.fn(async () => registerResultFixture({ voice: false })),
      capabilityBuilderRegisterText: vi.fn(() => "Registered."),
      completeRegisteredVoiceProviderSetup,
      resolveFirstPartyPluginPermission: vi.fn(async () => true),
      markPluginToolsStale: vi.fn(),
    });

    const result = await registeredTools[0].execute("register", input);

    expect(completeRegisteredVoiceProviderSetup).not.toHaveBeenCalled();
    expect(result.content).toEqual([{ type: "text", text: "Registered." }]);
    expect(result.details).not.toHaveProperty("voiceCompletion");
  });

  it("blocks registration in Planner Mode before parsing or side effects", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseRegisterInput = vi.fn();
    const previewCapabilityBuilderPackage = vi.fn();
    const registerCapabilityBuilderPackage = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();
    const markPluginToolsStale = vi.fn();

    registerCapabilityBuilderRegisterTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as WorkspaceState,
      getThread: () => ({ id: "thread-1", collaborationMode: "planner" } as unknown as ThreadSummary),
      parseRegisterInput,
      previewCapabilityBuilderPackage,
      registerCapabilityBuilderPackage,
      completeRegisteredVoiceProviderSetup: vi.fn(),
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    await expect(registeredTools[0].execute("register", inputFixture())).rejects.toThrow(
      "Capability Builder registration is blocked in Planner Mode.",
    );
    expect(parseRegisterInput).not.toHaveBeenCalled();
    expect(previewCapabilityBuilderPackage).not.toHaveBeenCalled();
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(registerCapabilityBuilderPackage).not.toHaveBeenCalled();
    expect(markPluginToolsStale).not.toHaveBeenCalled();
  });

  it("stops before approval when preview is invalid", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const input = inputFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const registerCapabilityBuilderPackage = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();
    const markPluginToolsStale = vi.fn();

    registerCapabilityBuilderRegisterTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => ({ id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary),
      parseRegisterInput: vi.fn(() => input),
      previewCapabilityBuilderPackage: vi.fn(async () => ({
        ...previewFixture(),
        valid: false,
        errors: ["Validation metadata is stale."],
      })),
      registerCapabilityBuilderPackage,
      completeRegisteredVoiceProviderSetup: vi.fn(),
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    await expect(registeredTools[0].execute("register", input)).rejects.toThrow(
      "Capability package preview has errors: Validation metadata is stale.",
    );
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(registerCapabilityBuilderPackage).not.toHaveBeenCalled();
    expect(markPluginToolsStale).not.toHaveBeenCalled();
  });

  it("does not register when approval is denied", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const input = inputFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const registerCapabilityBuilderPackage = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn(async (_request: any) => false);
    const markPluginToolsStale = vi.fn();
    const onUpdate = vi.fn();

    registerCapabilityBuilderRegisterTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => ({ id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary),
      parseRegisterInput: vi.fn(() => input),
      previewCapabilityBuilderPackage: vi.fn(async () => previewFixture()),
      registerCapabilityBuilderPackage,
      completeRegisteredVoiceProviderSetup: vi.fn(),
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    await expect(registeredTools[0].execute("register", input, undefined, onUpdate)).rejects.toThrow(
      "Capability Builder registration blocked by approval prompt.",
    );
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(registerCapabilityBuilderPackage).not.toHaveBeenCalled();
    expect(markPluginToolsStale).not.toHaveBeenCalled();
  });
});

function inputFixture(): CapabilityBuilderRegisterInput {
  return {
    sourcePath: ".ambient/capability-builder/packages/ambient-demo",
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
    descriptor: {
      commandNames: ["demo", "render"],
      envNames: [],
      artifactOutputTypes: ["text/plain"],
    },
  };
}

function registerResultFixture(options: { voice: boolean }): any {
  return {
    packageName: "ambient-demo",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    gitSha: "def456",
    registeredAt: "2026-06-10T14:20:00.000Z",
    installedPackage: {
      id: "pkg-123",
      name: "ambient-demo",
      source: "capability-builder:ambient-demo",
      version: "0.0.0",
      description: "Generated demo provider.",
      commands: [
        { name: "demo", description: "Run demo." },
        { name: "render", description: "Render output." },
      ],
      skills: [
        { name: "demo-skill", description: "Use demo." },
      ],
      env: [],
      enabled: true,
      installedAt: "2026-06-10T14:20:00.000Z",
    },
    ...(options.voice ? { voiceProvider: voiceProviderFixture() } : {}),
  };
}

function voiceProviderFixture(): any {
  return {
    capabilityId: "voice:ambient-demo",
    label: "Ambient Demo Voice",
    command: "demo",
    format: "wav",
    formats: ["wav"],
    voices: [{ id: "demo-voice", label: "Demo" }],
    available: true,
    availabilityReason: "ready",
    healthStatus: "healthy",
  };
}
