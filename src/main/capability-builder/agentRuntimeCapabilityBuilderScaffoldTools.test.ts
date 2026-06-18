import { describe, expect, it, vi } from "vitest";

import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { registerCapabilityBuilderScaffoldTool } from "./agentRuntimeCapabilityBuilderScaffoldTools";
import type { CapabilityBuilderScaffoldInput } from "./capabilityBuilder";

describe("agentRuntimeCapabilityBuilderScaffoldTools", () => {
  it("requests approval, scaffolds a builder package, and marks plugin tools stale", async () => {
    const workspace = { path: "/workspace" } as WorkspaceState;
    const thread = { id: "thread-1", collaborationMode: "default" } as unknown as ThreadSummary;
    const input: CapabilityBuilderScaffoldInput = {
      name: "demo",
      goal: "Build a demo Ambient capability",
      installerShape: "custom-cli",
      kind: "tool",
      provider: "demo-runtime",
      outputArtifactTypes: ["text/plain"],
      locality: "local",
    };
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseScaffoldInput = vi.fn(() => input);
    const suggestedCapabilityPackageName = vi.fn(() => "ambient-demo");
    const scaffoldCapabilityBuilderPackage = vi.fn(async () => scaffoldResultFixture());
    const capabilityBuilderScaffoldText = vi.fn(() => "Ambient Capability Builder package scaffolded.");
    const resolveFirstPartyPluginPermission = vi.fn(async (_request: any) => true);
    const markPluginToolsStale = vi.fn();
    const onUpdate = vi.fn();

    registerCapabilityBuilderScaffoldTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace,
      getThread: () => thread,
      parseScaffoldInput,
      suggestedCapabilityPackageName,
      scaffoldCapabilityBuilderPackage,
      capabilityBuilderScaffoldText,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual(["ambient_capability_builder_scaffold"]);

    const result = await registeredTools[0].execute("scaffold", input, undefined, onUpdate);

    expect(parseScaffoldInput).toHaveBeenCalledWith(input);
    expect(suggestedCapabilityPackageName).toHaveBeenCalledWith("demo", "demo-runtime");
    expect(resolveFirstPartyPluginPermission).toHaveBeenCalledWith(expect.objectContaining({
      thread,
      workspace,
      toolName: "ambient_capability_builder_scaffold",
      title: 'Scaffold Ambient capability "ambient-demo"?',
      message: "Ambient wants to create a managed draft capability package in this workspace.",
      grantTargetLabel: "Scaffold capability ambient-demo",
      grantTargetIdentity: ["ambient_capability_builder_scaffold", workspace.path, "ambient-demo"].join("\0"),
      allowedReason: "Capability Builder scaffold approved by Ambient permission grant policy.",
      deniedReason: "Capability Builder scaffold prompt denied or timed out.",
    }));
    const permissionRequest = resolveFirstPartyPluginPermission.mock.calls[0]?.[0] as any;
    expect(permissionRequest.detail).toContain("Managed root: .ambient/capability-builder/packages/ambient-demo");
    expect(permissionRequest.detail).toContain("Installer shape: custom-cli");
    expect(permissionRequest.detail).toContain("File artifacts: text/plain");
    expect(permissionRequest.detail).toContain("No dependency installation");
    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: "text", text: 'Scaffolding Ambient capability "ambient-demo".' }],
      details: { runtime: "ambient-capability-builder", toolName: "ambient_capability_builder_scaffold", status: "scaffolding", packageName: "ambient-demo" },
    });
    expect(scaffoldCapabilityBuilderPackage).toHaveBeenCalledWith(workspace.path, input);
    expect(markPluginToolsStale).toHaveBeenCalledTimes(1);
    expect(capabilityBuilderScaffoldText).toHaveBeenCalledWith(scaffoldResultFixture());
    expect(result.content).toEqual([{ type: "text", text: "Ambient Capability Builder package scaffolded." }]);
    expect(result.details).toMatchObject({
      runtime: "ambient-capability-builder",
      toolName: "ambient_capability_builder_scaffold",
      status: "scaffolded",
      packageName: "ambient-demo",
      installerShape: "custom-cli",
      rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
      relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
      sourceRef: sourceRefFixture(),
      gitSha: "abc123",
      files: ["package.json", "SKILL.md"],
    });
  });

  it("blocks scaffolding in Planner Mode before parsing or side effects", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    const parseScaffoldInput = vi.fn();
    const suggestedCapabilityPackageName = vi.fn();
    const scaffoldCapabilityBuilderPackage = vi.fn();
    const resolveFirstPartyPluginPermission = vi.fn();
    const markPluginToolsStale = vi.fn();

    registerCapabilityBuilderScaffoldTool({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      workspace: { path: "/workspace" } as WorkspaceState,
      getThread: () => ({ id: "thread-1", collaborationMode: "planner" } as unknown as ThreadSummary),
      parseScaffoldInput,
      suggestedCapabilityPackageName,
      scaffoldCapabilityBuilderPackage,
      resolveFirstPartyPluginPermission,
      markPluginToolsStale,
    });

    await expect(registeredTools[0].execute("scaffold", { goal: "Build a demo" })).rejects.toThrow(
      "Capability Builder scaffolding is blocked in Planner Mode.",
    );
    expect(parseScaffoldInput).not.toHaveBeenCalled();
    expect(suggestedCapabilityPackageName).not.toHaveBeenCalled();
    expect(resolveFirstPartyPluginPermission).not.toHaveBeenCalled();
    expect(scaffoldCapabilityBuilderPackage).not.toHaveBeenCalled();
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

function scaffoldResultFixture(): any {
  return {
    name: "ambient-demo",
    installerShape: "custom-cli",
    rootPath: "/workspace/.ambient/capability-builder/packages/ambient-demo",
    relativeRootPath: ".ambient/capability-builder/packages/ambient-demo",
    sourceRef: sourceRefFixture(),
    gitSha: "abc123",
    files: ["package.json", "SKILL.md"],
  };
}
