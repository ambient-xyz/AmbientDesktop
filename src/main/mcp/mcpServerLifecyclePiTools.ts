import type { McpServerPiToolDefinition } from "./mcpServerPiToolSupport";
import type { McpServerPiToolOptions } from "./mcpServerPiToolTypes";
import { createMcpServerInstallPiToolDefinition } from "./mcpServerInstallPiTool";
import { createMcpServerRuntimeRepairPiToolDefinitions } from "./mcpServerRuntimeRepairPiTools";
import { createMcpServerSecretRequestPiToolDefinition } from "./mcpServerSecretRequestPiTool";
import { createMcpServerUninstallPiToolDefinition, mcpServerUninstallApprovalDetail } from "./mcpServerUninstallPiTool";

export { mcpServerUninstallApprovalDetail };

export function createMcpServerLifecyclePiToolDefinitions(options: McpServerPiToolOptions): McpServerPiToolDefinition[] {
  return [
    createMcpServerInstallPiToolDefinition(options),
    ...createMcpServerRuntimeRepairPiToolDefinitions(options),
    createMcpServerSecretRequestPiToolDefinition(options),
    createMcpServerUninstallPiToolDefinition(options),
  ];
}
