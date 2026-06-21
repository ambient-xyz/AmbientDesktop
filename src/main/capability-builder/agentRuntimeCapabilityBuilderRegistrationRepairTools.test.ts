import { describe, expect, it, vi } from "vitest";

import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { registerCapabilityBuilderRegistrationRepairTool } from "./agentRuntimeCapabilityBuilderRegistrationRepairTools";
import type { CapabilityBuilderRegistrationRepairInput, CapabilityBuilderRegistrationRepairResult } from "./capabilityBuilder";

describe("agentRuntimeCapabilityBuilderRegistrationRepairTools", () => {
  it("requests approval, repairs stale installed refs, and marks plugin tools stale", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const thread = { id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary;
    const input = inputFixture();
    const repairResult = repairResultFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseRegistrationRepairInput = vi.fn(() => input);
    const repairCapabilityBuilderRegistrationMetadata = vi.fn(async () => repairResult);
    const capabilityBuilderRegistrationRepairText = vi.fn(() => "Ambient Capability Builder registration metadata repair.");
    const resolveFirstPartyPluginPermission = vi.fn(async () => true);
    const markPluginToolsStale = vi.fn();
    const onUpdate = vi.fn();

    registerCapabilityBuilderRegistrationRepairTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      parseRegistrationRepairInput,
      repairCapabilityBuilderRegistrationMetadata,
      capabilityBuilderRegistrationRepairText,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_capability_builder_repair_registration_metadata"]);

    const result = await registeredTools[0].execute("repair", input, undefined, onUpdate);

    expect(parseRegistrationRepairInput).toHaveBeenCalledWith(input);
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_capability_builder_repair_registration_metadata",
      title: 'Repair Capability Builder registration metadata for "ambient-demo"?',
      message: "Ambient wants to clear stale installed refs from Builder metadata while preserving source and artifacts.",
      grantTargetLabel: "Repair registration metadata ambient-demo",
      grantTargetIdentity: ["ambient_capability_builder_repair_registration_metadata", workspace.path, "ambient-demo"].join("\0"),
      allowedReason: "Capability Builder registration metadata repair approved by Ambient permission grant policy.",
      deniedReason: "Capability Builder registration metadata repair prompt denied or timed out.",
    }));
    const permissionRequest = (resolveFirstPartyPluginPermission.mock.calls as any)[0]?.[0];
    expect(permissionRequest.detail).toContain("clears stale installedPackageId");
    expect(permissionRequest.detail).toContain("Preserved: managed builder source");
    expect(permissionRequest.detail).toContain("Use this recovery path only when ambient_capability_builder_unregister cannot remove");
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: 'Repairing Capability Builder registration metadata for "ambient-demo".' }],
      details: {
        runtime: "ambient-capability-builder",
        toolName: "ambient_capability_builder_repair_registration_metadata",
        status: "repairing-registration-metadata",
        packageTarget: "ambient-demo",
      },
    });
    expect(repairCapabilityBuilderRegistrationMetadata).toHaveBeenCalledWith(workspace.path, input);
    expect(markPluginToolsStale).toHaveBeenCalledTimes(1);
    expect(capabilityBuilderRegistrationRepairText).toHaveBeenCalledWith(repairResult);
    expect(result.content).toEqual([{ type: "text", text: "Ambient Capability Builder registration metadata repair." }]);
    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_repair_registration_metadata",
      status: "registration-metadata-repaired",
      packageName: "ambient-demo",
      staleInstalledPackageId: "pkg-123",
      staleInstalledSource: "./.ambient/cli-packages/imported/pkg-123",
      staleInstalledRef: "abc123",
      installedPresent: false,
      changed: true,
      availability: "next-session-refresh",
    });
  });

  it("blocks registration metadata repair in Planner Mode before parsing or side effects", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseRegistrationRepairInput = vi.fn();
    const repairCapabilityBuilderRegistrationMetadata = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();
    const markPluginToolsStale = vi.fn();

    registerCapabilityBuilderRegistrationRepairTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as WorkspaceState,
      getThread: () => ({ id: "thread-1", collaborationMode: "planner" } as unknown as ThreadSummary),
      parseRegistrationRepairInput,
      repairCapabilityBuilderRegistrationMetadata,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    await expect(registeredTools[0].execute("repair", inputFixture())).rejects.toThrow(
      "Capability Builder registration metadata repair is blocked in Planner Mode.",
    );
    expect(parseRegistrationRepairInput).not.toHaveBeenCalled();
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(repairCapabilityBuilderRegistrationMetadata).not.toHaveBeenCalled();
    expect(markPluginToolsStale).not.toHaveBeenCalled();
  });
});

function inputFixture(): CapabilityBuilderRegistrationRepairInput {
  return {
    packageName: "ambient-demo",
    reason: "Clear stale installed refs after failed unregister.",
  };
}

function repairResultFixture(): CapabilityBuilderRegistrationRepairResult {
  return {
    packageName: "ambient-demo",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    gitSha: "def456",
    repairedAt: "2026-06-20T23:00:00.000Z",
    previousStatus: "registered",
    staleInstalledPackageId: "pkg-123",
    staleInstalledSource: "./.ambient/cli-packages/imported/pkg-123",
    staleInstalledRef: "abc123",
    installedPresent: false,
    changed: true,
    refs: { installed: null, lastRegistrationRepair: "def456" },
    reason: "Clear stale installed refs after failed unregister.",
  };
}
