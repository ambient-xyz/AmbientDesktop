import { describe, expect, it, vi } from "vitest";

import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { registerCapabilityBuilderApplyRepairTool } from "./agentRuntimeCapabilityBuilderApplyRepairTools";
import type { CapabilityBuilderApplyRepairInput } from "./capabilityBuilder";

describe("agentRuntimeCapabilityBuilderApplyRepairTools", () => {
  it("requests approval, applies repair files, and returns invalidation details", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const thread = { id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary;
    const input = inputFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseApplyRepairInput = vi.fn(() => input);
    const previewCapabilityBuilderPackage = vi.fn(async () => previewFixture());
    const applyCapabilityBuilderRepair = vi.fn(async () => applyResultFixture());
    const capabilityBuilderApplyRepairText = vi.fn(() => "Ambient Capability Builder repair applied.");
    const resolveFirstPartyPluginPermission = vi.fn(async (_request: any) => true);
    const onUpdate = vi.fn();

    registerCapabilityBuilderApplyRepairTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      parseApplyRepairInput,
      previewCapabilityBuilderPackage,
      applyCapabilityBuilderRepair,
      capabilityBuilderApplyRepairText,
      resolveFirstPartyPluginPermission,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_capability_builder_apply_repair"]);

    const result = await registeredTools[0].execute("repair", input, undefined, onUpdate);

    expect(parseApplyRepairInput).toHaveBeenCalledWith(input);
    expect(previewCapabilityBuilderPackage).toHaveBeenCalledWith(workspace.path, input);
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_capability_builder_apply_repair",
      title: 'Apply repair edits to "ambient-demo"?',
      message: "Ambient wants to write approved repair files for a managed generated capability package.",
      grantTargetLabel: "Apply repair for ambient-demo",
      grantTargetIdentity: ["ambient_capability_builder_apply_repair", workspace.path, "ambient-demo", JSON.stringify(["SKILL.md", "src/index.ts"])].join("\0"),
      allowedReason: "Capability Builder repair application approved by Ambient permission grant policy.",
      deniedReason: "Capability Builder repair application prompt denied or timed out.",
    }));
    const permissionRequest = resolveFirstPartyPluginPermission.mock.calls[0]?.[0] as any;
    expect(permissionRequest.detail).toContain("Reason: Fix validation errors.");
    expect(permissionRequest.detail).toContain("1. SKILL.md\n   bytes: 10\n   rationale: Clarify usage.");
    expect(permissionRequest.detail).toContain("2. src/index.ts\n   bytes: 18\n   rationale: Fix command output.");
    expect(permissionRequest.detail).toContain("This clears prior validation metadata");
    expect(permissionRequest.detail).toContain("No dependency installation");
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: 'Applying approved repair edits for Ambient capability "ambient-demo".' }],
      details: {
        runtime: "ambient-capability-builder",
        toolName: "ambient_capability_builder_apply_repair",
        status: "applying",
        packageName: "ambient-demo",
        fileCount: 2,
      },
    });
    expect(applyCapabilityBuilderRepair).toHaveBeenCalledWith(workspace.path, input);
    expect(capabilityBuilderApplyRepairText).toHaveBeenCalledWith(applyResultFixture());
    expect(result.content).toEqual([{ type: "text", text: "Ambient Capability Builder repair applied." }]);
    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_apply_repair",
      status: "applied",
      packageName: "ambient-demo",
      rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
      relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
      gitSha: "abc123",
      repairGitSha: "def456",
      repairedAt: "2026-06-10T13:00:00.000Z",
      fileCount: 2,
      validationInvalidated: true,
    });
  });

  it("blocks repair application in Planner Mode before parsing or side effects", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseApplyRepairInput = vi.fn();
    const previewCapabilityBuilderPackage = vi.fn();
    const applyCapabilityBuilderRepair = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();

    registerCapabilityBuilderApplyRepairTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as WorkspaceState,
      getThread: () => ({ id: "thread-1", collaborationMode: "planner" } as unknown as ThreadSummary),
      parseApplyRepairInput,
      previewCapabilityBuilderPackage,
      applyCapabilityBuilderRepair,
      resolveFirstPartyPluginPermission,
    });

    await expect(registeredTools[0].execute("repair", inputFixture())).rejects.toThrow(
      "Capability Builder repair application is blocked in Planner Mode.",
    );
    expect(parseApplyRepairInput).not.toHaveBeenCalled();
    expect(previewCapabilityBuilderPackage).not.toHaveBeenCalled();
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(applyCapabilityBuilderRepair).not.toHaveBeenCalled();
  });

  it("does not apply repair files when approval is denied", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const input = inputFixture();
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const applyCapabilityBuilderRepair = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn(async (_request: any) => false);
    const onUpdate = vi.fn();

    registerCapabilityBuilderApplyRepairTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => ({ id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary),
      parseApplyRepairInput: vi.fn(() => input),
      previewCapabilityBuilderPackage: vi.fn(async () => previewFixture()),
      applyCapabilityBuilderRepair,
      resolveFirstPartyPluginPermission,
    });

    await expect(registeredTools[0].execute("repair", input, undefined, onUpdate)).rejects.toThrow(
      "Capability Builder repair application blocked by approval prompt.",
    );
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(applyCapabilityBuilderRepair).not.toHaveBeenCalled();
  });
});

function inputFixture(): CapabilityBuilderApplyRepairInput {
  return {
    sourcePath: ".ambient/capability-builder/packages/ambient-demo",
    reason: "Fix validation errors.",
    files: [
      {
        path: "SKILL.md",
        content: "# Updated\n",
        rationale: "Clarify usage.",
      },
      {
        path: "src/index.ts",
        content: "export default 1;\n",
        rationale: "Fix command output.",
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

function applyResultFixture(): any {
  return {
    packageName: "ambient-demo",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    gitSha: "abc123",
    repairGitSha: "def456",
    repairedAt: "2026-06-10T13:00:00.000Z",
    reason: "Fix validation errors.",
    files: [
      {
        path: "SKILL.md",
        sizeBytes: 10,
        created: false,
        rationale: "Clarify usage.",
      },
      {
        path: "src/index.ts",
        sizeBytes: 18,
        created: true,
        rationale: "Fix command output.",
      },
    ],
    nextSteps: ["Preview and validate again."],
  };
}
