import { describe, expect, it, vi } from "vitest";

import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { registerCapabilityBuilderWriteFileTool } from "./agentRuntimeCapabilityBuilderWriteFileTools";

describe("agentRuntimeCapabilityBuilderWriteFileTools", () => {
  it("requests approval, writes one builder file, and marks plugin tools stale", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const thread = { id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary;
    const input = {
      sourcePath: ".ambient/capability-builder/packages/ambient-demo",
      filePath: "SKILL.md",
      content: "# Updated\n",
      reason: "Improve capability guidance.",
    };
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseWriteFileInput = vi.fn(() => input);
    const previewCapabilityBuilderPackage = vi.fn(async () => previewFixture());
    const writeCapabilityBuilderFile = vi.fn(async () => writeResultFixture());
    const resolveFirstPartyPluginPermission = vi.fn(async (_request: any) => true);
    const markPluginToolsStale = vi.fn();
    const onUpdate = vi.fn();

    registerCapabilityBuilderWriteFileTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      parseWriteFileInput,
      previewCapabilityBuilderPackage,
      writeCapabilityBuilderFile,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_capability_builder_write_file"]);

    const result = await registeredTools[0].execute("write", input, undefined, onUpdate);

    expect(parseWriteFileInput).toHaveBeenCalledWith(input);
    expect(previewCapabilityBuilderPackage).toHaveBeenCalledWith(workspace.path, input);
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_capability_builder_write_file",
      title: 'Write SKILL.md in "ambient-demo"?',
      message: "Ambient wants to write one file in a managed generated capability package.",
      grantTargetLabel: "Write SKILL.md for ambient-demo",
      grantTargetIdentity: ["ambient_capability_builder_write_file", workspace.path, "ambient-demo", "SKILL.md"].join("\0"),
      allowedReason: "Capability Builder file write approved by Ambient permission grant policy.",
      deniedReason: "Capability Builder file write prompt denied or timed out.",
    }));
    const permissionRequest = resolveFirstPartyPluginPermission.mock.calls[0]?.[0] as any;
    expect(permissionRequest.detail).toContain("Bytes: 10");
    expect(permissionRequest.detail).toContain("No dependency installation");
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: 'Writing SKILL.md for Ambient capability "ambient-demo".' }],
      details: {
        runtime: "ambient-capability-builder",
        toolName: "ambient_capability_builder_write_file",
        status: "writing",
        packageName: "ambient-demo",
        filePath: "SKILL.md",
      },
    });
    expect(writeCapabilityBuilderFile).toHaveBeenCalledWith(workspace.path, input);
    expect(markPluginToolsStale).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toContain("Ambient Capability Builder file written");
    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_write_file",
      status: "written",
      packageName: "ambient-demo",
      filePath: "SKILL.md",
      sizeBytes: 10,
      created: false,
      gitSha: "def456",
      sourceRef: sourceRefFixture(),
    });
  });

  it("blocks file writes in Planner Mode before parsing or side effects", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseWriteFileInput = vi.fn();
    const previewCapabilityBuilderPackage = vi.fn();
    const writeCapabilityBuilderFile = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();
    const markPluginToolsStale = vi.fn();

    registerCapabilityBuilderWriteFileTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as WorkspaceState,
      getThread: () => ({ id: "thread-1", collaborationMode: "planner" } as unknown as ThreadSummary),
      parseWriteFileInput,
      previewCapabilityBuilderPackage,
      writeCapabilityBuilderFile,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    await expect(registeredTools[0].execute("write", { filePath: "SKILL.md" })).rejects.toThrow(
      "Capability Builder file writes are blocked in Planner Mode.",
    );
    expect(parseWriteFileInput).not.toHaveBeenCalled();
    expect(previewCapabilityBuilderPackage).not.toHaveBeenCalled();
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(writeCapabilityBuilderFile).not.toHaveBeenCalled();
    expect(markPluginToolsStale).not.toHaveBeenCalled();
  });
});

function sourceRefFixture() {
  return {
    kind: "capability-builder-source",
    packageName: "ambient-demo",
    workspacePath: "/workspace",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
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
  };
}

function writeResultFixture(): any {
  return {
    packageName: "ambient-demo",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    sourceRef: sourceRefFixture(),
    filePath: "SKILL.md",
    sizeBytes: 10,
    created: false,
    gitSha: "def456",
    reason: "Improve capability guidance.",
    nextSteps: ["Run preview."],
  };
}
