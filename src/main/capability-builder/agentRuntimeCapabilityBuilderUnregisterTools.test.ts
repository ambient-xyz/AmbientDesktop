import { describe, expect, it, vi } from "vitest";

import type { ThreadSummary, WorkspaceState } from "../../shared/types";
import { registerCapabilityBuilderUnregisterTool } from "./agentRuntimeCapabilityBuilderUnregisterTools";
import type { CapabilityBuilderUnregisterInput } from "./capabilityBuilder";

describe("agentRuntimeCapabilityBuilderUnregisterTools", () => {
  it("requests approval, unregisters the installed package, and marks plugin tools stale", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const thread = { id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary;
    const input = inputFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseUnregisterInput = vi.fn(() => input);
    const planCapabilityBuilderRemoval = vi.fn(async () => removalPlanFixture());
    const unregisterCapabilityBuilderPackage = vi.fn(async () => unregisterResultFixture());
    const capabilityBuilderUnregisterText = vi.fn(() => "Ambient Capability Builder unregister.");
    const resolveFirstPartyPluginPermission = vi.fn(async (_request: any) => true);
    const markPluginToolsStale = vi.fn();
    const onUpdate = vi.fn();

    registerCapabilityBuilderUnregisterTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      parseUnregisterInput,
      planCapabilityBuilderRemoval,
      unregisterCapabilityBuilderPackage,
      capabilityBuilderUnregisterText,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_capability_builder_unregister"]);

    const result = await registeredTools[0].execute("unregister", input, undefined, onUpdate);

    expect(parseUnregisterInput).toHaveBeenCalledWith(input);
    expect(planCapabilityBuilderRemoval).toHaveBeenCalledWith(workspace.path, input);
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_capability_builder_unregister",
      title: 'Unregister generated capability "ambient-demo"?',
      message: "Ambient wants to remove installed generated capability visibility while preserving its builder source and artifacts.",
      grantTargetLabel: "Unregister generated capability ambient-demo",
      grantTargetIdentity: ["ambient_capability_builder_unregister", workspace.path, "pkg-123"].join("\0"),
      allowedReason: "Capability Builder unregister approved by Ambient permission grant policy.",
      deniedReason: "Capability Builder unregister prompt denied or timed out.",
    }));
    const permissionRequest = resolveFirstPartyPluginPermission.mock.calls[0]?.[0] as any;
    expect(permissionRequest.detail).toContain("Installed package id: pkg-123");
    expect(permissionRequest.detail).toContain("Reason: Clean up generated provider.");
    expect(permissionRequest.detail).toContain("Preserved: managed builder source");
    expect(permissionRequest.detail).toContain("- Preserve builder source.");
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: 'Unregistering generated Ambient capability "ambient-demo".' }],
      details: {
        runtime: "ambient-capability-builder",
        toolName: "ambient_capability_builder_unregister",
        status: "unregistering",
        packageName: "ambient-demo",
      },
    });
    expect(unregisterCapabilityBuilderPackage).toHaveBeenCalledWith(workspace.path, input);
    expect(markPluginToolsStale).toHaveBeenCalledTimes(1);
    expect(capabilityBuilderUnregisterText).toHaveBeenCalledWith(unregisterResultFixture());
    expect(result.content).toEqual([{ type: "text", text: "Ambient Capability Builder unregister." }]);
    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_unregister",
      status: "unregistered",
      packageName: "ambient-demo",
      rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
      relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
      gitSha: "abc123",
      unregisteredAt: "2026-06-10T13:30:00.000Z",
      removedPackageId: "pkg-123",
      removedPackageName: "ambient-demo",
      preserved: {
        builderSource: true,
        logs: true,
        artifacts: true,
        envSecrets: true,
      },
      availability: "next-session-refresh",
    });
  });

  it("blocks unregister in Planner Mode before parsing or side effects", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseUnregisterInput = vi.fn();
    const planCapabilityBuilderRemoval = vi.fn();
    const unregisterCapabilityBuilderPackage = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();
    const markPluginToolsStale = vi.fn();

    registerCapabilityBuilderUnregisterTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as WorkspaceState,
      getThread: () => ({ id: "thread-1", collaborationMode: "planner" } as unknown as ThreadSummary),
      parseUnregisterInput,
      planCapabilityBuilderRemoval,
      unregisterCapabilityBuilderPackage,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    await expect(registeredTools[0].execute("unregister", inputFixture())).rejects.toThrow(
      "Capability Builder unregister is blocked in Planner Mode.",
    );
    expect(parseUnregisterInput).not.toHaveBeenCalled();
    expect(planCapabilityBuilderRemoval).not.toHaveBeenCalled();
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(unregisterCapabilityBuilderPackage).not.toHaveBeenCalled();
    expect(markPluginToolsStale).not.toHaveBeenCalled();
  });

  it("stops before approval when the removal plan has errors", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const input = inputFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const unregisterCapabilityBuilderPackage = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();
    const markPluginToolsStale = vi.fn();

    registerCapabilityBuilderUnregisterTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => ({ id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary),
      parseUnregisterInput: vi.fn(() => input),
      planCapabilityBuilderRemoval: vi.fn(async () => ({
        ...removalPlanFixture(),
        errors: ["Installed package target is ambiguous."],
      })),
      unregisterCapabilityBuilderPackage,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    await expect(registeredTools[0].execute("unregister", input)).rejects.toThrow(
      "Capability removal plan has errors: Installed package target is ambiguous.",
    );
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(unregisterCapabilityBuilderPackage).not.toHaveBeenCalled();
    expect(markPluginToolsStale).not.toHaveBeenCalled();
  });

  it("does not unregister when approval is denied", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const input = inputFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const unregisterCapabilityBuilderPackage = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn(async (_request: any) => false);
    const markPluginToolsStale = vi.fn();
    const onUpdate = vi.fn();

    registerCapabilityBuilderUnregisterTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => ({ id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary),
      parseUnregisterInput: vi.fn(() => input),
      planCapabilityBuilderRemoval: vi.fn(async () => removalPlanFixture()),
      unregisterCapabilityBuilderPackage,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    await expect(registeredTools[0].execute("unregister", input, undefined, onUpdate)).rejects.toThrow(
      "Capability Builder unregister blocked by approval prompt.",
    );
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(unregisterCapabilityBuilderPackage).not.toHaveBeenCalled();
    expect(markPluginToolsStale).not.toHaveBeenCalled();
  });
});

function inputFixture(): CapabilityBuilderUnregisterInput {
  return {
    sourcePath: ".ambient/capability-builder/packages/ambient-demo",
    installedPackageId: "pkg-123",
    reason: "Clean up generated provider.",
  };
}

function removalPlanFixture(): any {
  return {
    packageName: "ambient-demo",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    gitSha: "abc123",
    sourceExists: true,
    installedPackageId: "pkg-123",
    installedSource: "capability-builder:ambient-demo",
    reason: "Clean up generated provider.",
    approvalCheckpoints: [
      "Preserve builder source.",
      "Remove only installed package visibility.",
    ],
    warnings: [],
    errors: [],
    sourceInventory: {
      logFiles: [],
      possibleArtifactFiles: [],
    },
    recommendedSteps: [],
    rollbackPlan: [],
    mutationProhibited: true,
  };
}

function unregisterResultFixture(): any {
  return {
    packageName: "ambient-demo",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    gitSha: "abc123",
    unregisteredAt: "2026-06-10T13:30:00.000Z",
    removedPackage: {
      id: "pkg-123",
      name: "ambient-demo",
      source: "capability-builder:ambient-demo",
      version: "0.0.0",
      description: "Generated demo provider.",
      commands: [],
      skills: [],
      env: [],
      enabled: true,
      installedAt: "2026-06-10T12:00:00.000Z",
    },
    catalog: {
      packages: [],
    },
    removalPlan: removalPlanFixture(),
    preserved: {
      builderSource: true,
      logs: true,
      artifacts: true,
      envSecrets: true,
    },
  };
}
