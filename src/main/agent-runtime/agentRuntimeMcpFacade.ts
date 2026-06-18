import {
  evaluateMcpInstallGate as evaluateMcpInstallGateFromMcp,
  mcpDefaultCapabilityStatePathForUserData as mcpDefaultCapabilityStatePathForUserDataFromMcp,
} from "../mcp/mcpInstallGate";
import {
  createPublicMcpPackageMetadataResolver as createPublicMcpPackageMetadataResolverFromMcp,
  McpInstallCatalog as McpInstallCatalogFromMcp,
} from "../mcp/mcpInstallCatalog";
import type { McpInstallCatalog as McpInstallCatalogInstanceFromMcp } from "../mcp/mcpInstallCatalog";
import {
  createMcpServerPiToolDefinitions as createMcpServerPiToolDefinitionsFromMcp,
} from "../mcp/mcpServerPiTools";
import {
  evaluateMcpToolCallPermission as evaluateMcpToolCallPermissionFromMcp,
  mcpPermissionPolicyBlockedMessage as mcpPermissionPolicyBlockedMessageFromMcp,
  planMcpPermissionPromptGrant as planMcpPermissionPromptGrantFromMcp,
} from "../mcp/mcpPermissionPolicyService";
import {
  mcpRuntimePermissionBlockedMessage as mcpRuntimePermissionBlockedMessageFromMcp,
} from "../mcp/mcpRuntimePermissionEnforcement";
import {
  McpToolBridge as McpToolBridgeFromMcp,
} from "../mcp/mcpToolBridge";
import type {
  McpToolBridgeActivity as McpToolBridgeActivityFromMcp,
  McpToolBridgeOptions as McpToolBridgeOptionsFromMcp,
  McpToolCallResult as McpToolCallResultFromMcp,
  McpToolDescriptor as McpToolDescriptorFromMcp,
  McpToolDescriptorDriftEvent as McpToolDescriptorDriftEventFromMcp,
} from "../mcp/mcpToolBridge";
import {
  createMcpToolBridgePiToolDefinitions as createMcpToolBridgePiToolDefinitionsFromMcp,
  mcpToolCallApprovalDetail as mcpToolCallApprovalDetailFromMcp,
} from "../mcp/mcpToolBridgePiTools";

export const createMcpServerPiToolDefinitions =
  createMcpServerPiToolDefinitionsFromMcp;
export const createMcpToolBridgePiToolDefinitions =
  createMcpToolBridgePiToolDefinitionsFromMcp;
export const createPublicMcpPackageMetadataResolver =
  createPublicMcpPackageMetadataResolverFromMcp;
export const evaluateMcpInstallGate = evaluateMcpInstallGateFromMcp;
export const evaluateMcpToolCallPermission = evaluateMcpToolCallPermissionFromMcp;
export const McpInstallCatalog = McpInstallCatalogFromMcp;
export const McpToolBridge = McpToolBridgeFromMcp;
export const mcpDefaultCapabilityStatePathForUserData =
  mcpDefaultCapabilityStatePathForUserDataFromMcp;
export const mcpPermissionPolicyBlockedMessage =
  mcpPermissionPolicyBlockedMessageFromMcp;
export const mcpRuntimePermissionBlockedMessage =
  mcpRuntimePermissionBlockedMessageFromMcp;
export const mcpToolCallApprovalDetail = mcpToolCallApprovalDetailFromMcp;
export const planMcpPermissionPromptGrant = planMcpPermissionPromptGrantFromMcp;

export type McpInstallCatalog = McpInstallCatalogInstanceFromMcp;
export type McpToolBridge = InstanceType<typeof McpToolBridgeFromMcp>;
export type McpToolBridgeActivity = McpToolBridgeActivityFromMcp;
export type McpToolBridgeOptions = McpToolBridgeOptionsFromMcp;
export type McpToolCallResult = McpToolCallResultFromMcp;
export type McpToolDescriptor = McpToolDescriptorFromMcp;
export type McpToolDescriptorDriftEvent = McpToolDescriptorDriftEventFromMcp;
