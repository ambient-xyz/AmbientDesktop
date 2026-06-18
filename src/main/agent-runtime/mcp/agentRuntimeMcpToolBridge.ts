import type { WorkspaceState } from "../../../shared/workspaceTypes";
import { installedMcpSearchAliasesForWorkspace } from "./agentRuntimeMcpSearchAliases";
import { createPublicMcpPackageMetadataResolver, McpInstallCatalog } from "../../mcp/mcpInstallCatalog";
import { McpToolBridge, type McpToolBridgeOptions } from "../../mcp/mcpToolBridge";
import { ToolHiveRuntimeService } from "../../tool-runtime/toolHiveRuntimeService";

export interface AgentRuntimeMcpToolBridgeRuntime {
  mcpUserDataPath: string;
  toolHive: ToolHiveRuntimeService;
  catalog: McpInstallCatalog;
  bridge: McpToolBridge;
}

export interface AgentRuntimeMcpToolBridgeOptions {
  userDataPath?: string;
  env?: NodeJS.ProcessEnv;
  onDescriptorDrift?: McpToolBridgeOptions["onDescriptorDrift"];
}

export interface AgentRuntimeMcpToolOrchestration {
  createMcpRuntime: (workspace: WorkspaceState) => AgentRuntimeMcpToolBridgeRuntime | undefined;
  installedMcpSearchAliases: (workspace: WorkspaceState) => Promise<string[]>;
}

export interface AgentRuntimeMcpToolOrchestrationOptions {
  userDataPath: () => string | undefined;
  env: () => NodeJS.ProcessEnv | undefined;
  onDescriptorDrift?: McpToolBridgeOptions["onDescriptorDrift"];
}

export function createAgentRuntimeMcpToolOrchestration(
  options: AgentRuntimeMcpToolOrchestrationOptions,
): AgentRuntimeMcpToolOrchestration {
  const createMcpRuntime = (workspace: WorkspaceState) =>
    createAgentRuntimeMcpToolBridgeForWorkspace(workspace, {
      userDataPath: options.userDataPath(),
      env: options.env() ?? process.env,
      onDescriptorDrift: options.onDescriptorDrift,
    });

  return {
    createMcpRuntime,
    installedMcpSearchAliases: (workspace) =>
      installedMcpSearchAliasesForWorkspace(workspace, { createMcpRuntime }),
  };
}

export function createAgentRuntimeMcpToolBridgeForWorkspace(
  workspace: WorkspaceState,
  options: AgentRuntimeMcpToolBridgeOptions,
): AgentRuntimeMcpToolBridgeRuntime | undefined {
  const mcpUserDataPath = options.userDataPath;
  if (!mcpUserDataPath) return undefined;
  const toolHive = new ToolHiveRuntimeService({
    userDataPath: mcpUserDataPath,
    env: options.env ?? process.env,
  });
  const catalog = new McpInstallCatalog(toolHive, { packageMetadataResolver: createPublicMcpPackageMetadataResolver() });
  const bridge = new McpToolBridge({
    catalog,
    toolHive,
    workspacePath: workspace.path,
    onDescriptorDrift: options.onDescriptorDrift,
  });
  return { mcpUserDataPath, toolHive, catalog, bridge };
}
