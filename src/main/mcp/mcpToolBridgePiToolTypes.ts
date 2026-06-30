import type { McpManagedFileExchangeStagedFile } from "./mcpManagedFileExchange";
import type { McpPermissionPolicyEvaluation } from "./mcpPermissionPolicyService";
import type { McpRuntimePermissionEnforcement } from "./mcpRuntimePermissionEnforcement";
import type { McpToolBridge } from "./mcpToolBridge";
import type { McpToolDescriptor, McpToolDescriptorReview, McpToolPolicyUpdatePreview } from "./mcpToolBridgeTypes";

export interface McpToolBridgePiToolThread {
  id: string;
  collaborationMode: "agent" | "planner";
  permissionMode: string;
}

export interface McpToolBridgePiToolWorkspace {
  path: string;
  name?: string;
}

export interface McpToolCallApprovalInput {
  thread: McpToolBridgePiToolThread;
  workspace: McpToolBridgePiToolWorkspace;
  descriptor: McpToolDescriptor;
  arguments: Record<string, unknown>;
  originalArguments: Record<string, unknown>;
  permission: McpPermissionPolicyEvaluation;
  runtimeEnforcement: McpRuntimePermissionEnforcement;
  stagedFiles: McpManagedFileExchangeStagedFile[];
  detail: string;
}

export interface McpToolReviewAcceptApprovalInput {
  thread: McpToolBridgePiToolThread;
  workspace: McpToolBridgePiToolWorkspace;
  review: McpToolDescriptorReview;
  expectedDescriptorHash?: string;
  detail: string;
}

export interface McpToolPolicyUpdateApprovalInput {
  thread: McpToolBridgePiToolThread;
  workspace: McpToolBridgePiToolWorkspace;
  preview: McpToolPolicyUpdatePreview;
  detail: string;
}

export interface McpToolBridgePiToolOptions {
  bridge: McpToolBridge;
  getThread: () => McpToolBridgePiToolThread;
  workspace: McpToolBridgePiToolWorkspace;
  authorizeCall?: (input: McpToolCallApprovalInput) => Promise<boolean> | boolean;
  authorizeReviewAccept?: (input: McpToolReviewAcceptApprovalInput) => Promise<boolean> | boolean;
  authorizePolicyUpdate?: (input: McpToolPolicyUpdateApprovalInput) => Promise<boolean> | boolean;
}
