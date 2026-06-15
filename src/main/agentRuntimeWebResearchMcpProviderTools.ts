import type { WorkspaceState } from "../shared/types";
import type { McpToolBridge, McpToolDescriptor } from "./mcpToolBridge";

export interface WebResearchMcpProviderToolDiscoveryOptions {
  createMcpRuntime: (
    workspace: WorkspaceState,
  ) => { bridge: Pick<McpToolBridge, "searchTools"> } | undefined;
}

export async function discoverWebResearchMcpProviderTools(
  workspace: WorkspaceState,
  signal: AbortSignal | undefined,
  options: WebResearchMcpProviderToolDiscoveryOptions,
): Promise<McpToolDescriptor[]> {
  const mcpRuntime = options.createMcpRuntime(workspace);
  if (!mcpRuntime) return [];
  return mcpRuntime.bridge.searchTools({ limit: 50, refresh: false, signal }).catch(() => []);
}
