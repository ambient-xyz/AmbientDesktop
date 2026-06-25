import {
  createMcpGuidedBridgePiToolDefinitions,
  mcpGuidedLocalBridgePreflightApprovalDetail,
  mcpGuidedLocalBridgeRegisterApprovalDetail,
} from "./mcpGuidedBridgePiTools";
import { createMcpRemoteProxyPiToolDefinitions } from "./mcpRemoteProxyPiTools";
import { createMcpServerDiscoveryPiToolDefinitions } from "./mcpServerDiscoveryPiTools";
import { createMcpServerLifecyclePiToolDefinitions, mcpServerUninstallApprovalDetail } from "./mcpServerLifecyclePiTools";
import { mcpServerInstallApprovalDetail, type McpServerPiToolDefinition } from "./mcpServerPiToolSupport";
import type { McpServerPiToolOptions } from "./mcpServerPiToolTypes";
import { createMcpStandardImportPiToolDefinitions } from "./mcpStandardImportPiTools";

export type {
  McpGuidedLocalBridgePreflightApprovalInput,
  McpGuidedLocalBridgeRegisterApprovalInput,
  McpRuntimeRepairApprovalInput,
  McpServerInstallApprovalInput,
  McpServerInstallPreviewForApproval,
  McpServerPiToolOptions,
  McpServerPiToolThread,
  McpServerPiToolWorkspace,
  McpServerUninstallApprovalInput,
} from "./mcpServerPiToolTypes";
export {
  mcpGuidedLocalBridgePreflightApprovalDetail,
  mcpGuidedLocalBridgeRegisterApprovalDetail,
  mcpServerInstallApprovalDetail,
  mcpServerUninstallApprovalDetail,
};

export function createMcpServerPiToolDefinitions(options: McpServerPiToolOptions): McpServerPiToolDefinition[] {
  return [
    ...createMcpServerDiscoveryPiToolDefinitions(options),
    ...createMcpStandardImportPiToolDefinitions(options),
    ...createMcpRemoteProxyPiToolDefinitions(options),
    ...createMcpGuidedBridgePiToolDefinitions(options),
    ...createMcpServerLifecyclePiToolDefinitions(options),
  ];
}
