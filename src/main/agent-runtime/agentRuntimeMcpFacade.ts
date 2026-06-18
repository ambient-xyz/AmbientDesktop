import {
  createMcpServerPiToolDefinitions as createMcpServerPiToolDefinitionsFromMcp,
  createMcpToolBridgePiToolDefinitions as createMcpToolBridgePiToolDefinitionsFromMcp,
  createPublicMcpPackageMetadataResolver as createPublicMcpPackageMetadataResolverFromMcp,
  evaluateMcpInstallGate as evaluateMcpInstallGateFromMcp,
  evaluateMcpToolCallPermission as evaluateMcpToolCallPermissionFromMcp,
  McpInstallCatalog as McpInstallCatalogFromMcp,
  McpToolBridge as McpToolBridgeFromMcp,
  mcpDefaultCapabilityStatePathForUserData as mcpDefaultCapabilityStatePathForUserDataFromMcp,
  mcpPermissionPolicyBlockedMessage as mcpPermissionPolicyBlockedMessageFromMcp,
  mcpRuntimePermissionBlockedMessage as mcpRuntimePermissionBlockedMessageFromMcp,
  mcpToolCallApprovalDetail as mcpToolCallApprovalDetailFromMcp,
  planMcpPermissionPromptGrant as planMcpPermissionPromptGrantFromMcp,
} from "../mcp/mcpAgentRuntimeContract";
import type {
  McpInstallCatalog as McpInstallCatalogInstanceFromMcp,
  McpToolBridgeActivity as McpToolBridgeActivityFromMcp,
  McpToolBridgeOptions as McpToolBridgeOptionsFromMcp,
  McpToolCallResult as McpToolCallResultFromMcp,
  McpToolDescriptor as McpToolDescriptorFromMcp,
  McpToolDescriptorDriftEvent as McpToolDescriptorDriftEventFromMcp,
} from "../mcp/mcpAgentRuntimeContract";

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
