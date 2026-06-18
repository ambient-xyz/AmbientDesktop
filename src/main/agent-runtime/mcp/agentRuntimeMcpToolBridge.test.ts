import { describe, expect, it, vi } from "vitest";

import type { WorkspaceState } from "../../../shared/workspaceTypes";
import {
  createAgentRuntimeMcpToolOrchestration,
  createAgentRuntimeMcpToolBridgeForWorkspace,
} from "./agentRuntimeMcpToolBridge";
import { McpInstallCatalog } from "../agentRuntimeMcpFacade";
import { McpToolBridge, type McpToolBridgeOptions, type McpToolDescriptorDriftEvent } from "../agentRuntimeMcpFacade";
import { ToolHiveRuntimeService } from "../agentRuntimeToolRuntimeFacade";

describe("agentRuntimeMcpToolBridge", () => {
  it("returns undefined when MCP user data is not configured", () => {
    expect(createAgentRuntimeMcpToolBridgeForWorkspace(workspace(), {})).toBeUndefined();
    expect(createAgentRuntimeMcpToolBridgeForWorkspace(workspace(), { userDataPath: "" })).toBeUndefined();
  });

  it("creates the MCP runtime bridge for a workspace", async () => {
    const onDescriptorDrift = vi.fn();
    const env = { PATH: "/bin", AMBIENT_TEST_FLAG: "1" } as NodeJS.ProcessEnv;

    const runtime = createAgentRuntimeMcpToolBridgeForWorkspace(workspace(), {
      userDataPath: "/tmp/ambient-mcp-user-data",
      env,
      onDescriptorDrift,
    });

    expect(runtime?.mcpUserDataPath).toBe("/tmp/ambient-mcp-user-data");
    expect(runtime?.toolHive).toBeInstanceOf(ToolHiveRuntimeService);
    expect(runtime?.catalog).toBeInstanceOf(McpInstallCatalog);
    expect(runtime?.bridge).toBeInstanceOf(McpToolBridge);

    const bridgeOptions = (runtime!.bridge as unknown as { options: McpToolBridgeOptions }).options;
    expect(bridgeOptions.workspacePath).toBe("/tmp/workspace");
    expect(bridgeOptions.toolHive).toBe(runtime!.toolHive);
    expect(bridgeOptions.catalog).toBe(runtime!.catalog);

    const drift: McpToolDescriptorDriftEvent = {
      serverId: "server-1",
      workloadName: "workload-1",
      previousDescriptorHash: "old",
      descriptorHash: "new",
      reason: "test",
    };
    await bridgeOptions.onDescriptorDrift?.(drift);

    expect(onDescriptorDrift).toHaveBeenCalledWith(drift);
  });

  it("creates runtime and alias callbacks for AgentRuntime MCP tool orchestration", async () => {
    let userDataPath: string | undefined;
    const onDescriptorDrift = vi.fn();
    const env = { PATH: "/bin", AMBIENT_TEST_FLAG: "1" } as NodeJS.ProcessEnv;
    const orchestration = createAgentRuntimeMcpToolOrchestration({
      userDataPath: () => userDataPath,
      env: () => env,
      onDescriptorDrift,
    });

    expect(orchestration.createMcpRuntime(workspace())).toBeUndefined();
    await expect(orchestration.installedMcpSearchAliases(workspace())).resolves.toEqual([]);

    userDataPath = "/tmp/ambient-mcp-orchestration-user-data";
    const runtime = orchestration.createMcpRuntime(workspace());

    expect(runtime?.mcpUserDataPath).toBe(userDataPath);
    const toolHiveOptions = (runtime!.toolHive as unknown as { options: { env: NodeJS.ProcessEnv } }).options;
    expect(toolHiveOptions.env).toBe(env);

    const bridgeOptions = (runtime!.bridge as unknown as { options: McpToolBridgeOptions }).options;
    const drift: McpToolDescriptorDriftEvent = {
      serverId: "server-2",
      workloadName: "workload-2",
      previousDescriptorHash: "old",
      descriptorHash: "new",
      reason: "orchestration-test",
    };
    await bridgeOptions.onDescriptorDrift?.(drift);

    expect(onDescriptorDrift).toHaveBeenCalledWith(drift);
  });
});

function workspace(): WorkspaceState {
  return {
    path: "/tmp/workspace",
    name: "workspace",
    statePath: "/tmp/workspace/.ambient",
    sessionPath: "/tmp/workspace/.ambient/session",
  };
}
