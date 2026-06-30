import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "./mcpDesktopToolsFacade";
import {
  mcpAggregationReadinessText,
  mcpToolDescriptorReviewAcceptText,
  mcpToolDescriptorReviewText,
  mcpToolDescribeText,
  mcpToolPolicyUpdatePreviewText,
  mcpToolPolicyUpdateResultText,
  mcpToolSearchResultsText,
} from "./mcpToolBridge";
import { createMcpToolBridgeCallPiToolDefinition } from "./mcpToolBridgeCallPiTool";
export { mcpToolCallApprovalDetail } from "./mcpToolBridgeCallPiTool";
import type { McpToolBridgePiToolOptions, McpToolBridgePiToolWorkspace } from "./mcpToolBridgePiToolTypes";
import type { McpToolDescriptor, McpToolDescriptorReview, McpToolPolicyUpdatePreview } from "./mcpToolBridgeTypes";
import {
  compactText,
  mcpToolActivityUpdate,
  objectInput,
  optionalBoolean,
  optionalNumber,
  optionalString,
  optionalToolCallPolicy,
  optionalToolVisibility,
  requiredString,
  toolPolicyApprovalText,
  toolResult,
} from "./mcpToolBridgePiToolSupport";

export type {
  McpToolBridgePiToolOptions,
  McpToolBridgePiToolThread,
  McpToolBridgePiToolWorkspace,
  McpToolCallApprovalInput,
  McpToolPolicyUpdateApprovalInput,
  McpToolReviewAcceptApprovalInput,
} from "./mcpToolBridgePiToolTypes";

export function createMcpToolBridgePiToolDefinitions(options: McpToolBridgePiToolOptions): ToolDefinition<any, any, any>[] {
  const search = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_tool_search"));
  const describe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_tool_describe"));
  const reviewAccept = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_tool_review_accept"));
  const policyUpdate = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_tool_policy_update"));
  const aggregationStatus = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_aggregation_status"));
  return [
    {
      ...search,
      parameters: search.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const input = objectInput(params);
        const query = optionalString(input.query);
        const serverId = optionalString(input.serverId);
        const workloadName = optionalString(input.workloadName);
        const limit = optionalNumber(input.limit);
        const refresh = optionalBoolean(input.refresh);
        onUpdate?.({
          content: [{ type: "text", text: "Searching installed Ambient MCP tool descriptors." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_tool_search",
            status: "searching",
            query,
            serverId,
            workloadName,
          },
        });
        const tools = await options.bridge.searchTools({
          query,
          serverId,
          workloadName,
          limit,
          refresh,
          signal,
          onActivity: mcpToolActivityUpdate(onUpdate, "ambient_mcp_tool_search"),
        });
        return toolResult(mcpToolSearchResultsText(tools), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_tool_search",
          status: "complete",
          query,
          serverId,
          workloadName,
          resultCount: tools.length,
          tools: tools.map(compactToolDescriptor),
        });
      },
    },
    {
      ...describe,
      parameters: describe.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const input = objectInput(params);
        const toolName = requiredString(input, "toolName");
        const serverId = optionalString(input.serverId);
        const workloadName = optionalString(input.workloadName);
        const refresh = optionalBoolean(input.refresh);
        onUpdate?.({
          content: [{ type: "text", text: `Describing Ambient MCP tool ${toolName}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_tool_describe",
            status: "describing",
            targetToolName: toolName,
            serverId,
            workloadName,
          },
        });
        const descriptor = await options.bridge.describeTool({
          toolName,
          serverId,
          workloadName,
          refresh,
          signal,
          onActivity: mcpToolActivityUpdate(onUpdate, "ambient_mcp_tool_describe"),
        });
        return toolResult(mcpToolDescribeText(descriptor), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_tool_describe",
          status: "complete",
          descriptor,
        });
      },
    },
    createMcpToolBridgeCallPiToolDefinition(options),
    {
      ...reviewAccept,
      parameters: reviewAccept.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const thread = options.getThread();
        if (thread.collaborationMode === "planner") throw new Error("MCP tool descriptor review acceptance is blocked in Planner Mode.");
        const input = objectInput(params);
        const serverId = optionalString(input.serverId);
        const workloadName = optionalString(input.workloadName);
        const expectedDescriptorHash = optionalString(input.expectedDescriptorHash);
        if (!serverId && !workloadName) throw new Error("serverId or workloadName is required.");

        const review = await options.bridge.reviewToolDescriptors({ serverId, workloadName, signal });
        const detail = mcpToolReviewAcceptApprovalDetail({ review, expectedDescriptorHash, workspace: options.workspace });
        const allowed = await (options.authorizeReviewAccept?.({
          thread,
          workspace: options.workspace,
          review,
          expectedDescriptorHash,
          detail,
        }) ?? true);
        if (!allowed) throw new Error("MCP tool descriptor review acceptance blocked by Ambient Desktop approval prompt.");

        onUpdate?.({
          content: [{ type: "text", text: `Accepting MCP descriptor snapshot for ${review.server.serverId}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_tool_review_accept",
            status: "accepting",
            serverId: review.server.serverId,
            workloadName: review.server.workloadName,
          },
        });
        const result = await options.bridge.acceptToolDescriptorReview({
          serverId,
          workloadName,
          expectedDescriptorHash,
          signal,
        });
        return toolResult(mcpToolDescriptorReviewAcceptText(result), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_tool_review_accept",
          status: result.status,
          serverId: result.review.server.serverId,
          workloadName: result.review.server.workloadName,
          descriptorHash: result.review.descriptorHash,
          toolCount: result.review.tools.length,
        });
      },
    },
    {
      ...policyUpdate,
      parameters: policyUpdate.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const thread = options.getThread();
        if (thread.collaborationMode === "planner") throw new Error("MCP tool policy updates are blocked in Planner Mode.");
        const input = objectInput(params);
        const toolName = requiredString(input, "toolName");
        const serverId = optionalString(input.serverId);
        const workloadName = optionalString(input.workloadName);
        const refresh = optionalBoolean(input.refresh);
        const visibility = optionalToolVisibility(input.visibility);
        const callPolicy = optionalToolCallPolicy(input.callPolicy);
        const reason = optionalString(input.reason);
        const clear = optionalBoolean(input.clear);

        const preview = await options.bridge.previewToolPolicyUpdate({
          toolName,
          serverId,
          workloadName,
          refresh,
          visibility,
          callPolicy,
          reason,
          clear,
          signal,
        });
        const detail = mcpToolPolicyUpdateApprovalDetail({ preview, workspace: options.workspace });
        const allowed = await (options.authorizePolicyUpdate?.({ thread, workspace: options.workspace, preview, detail }) ?? true);
        if (!allowed) throw new Error("MCP tool policy update blocked by Ambient Desktop approval prompt.");

        onUpdate?.({
          content: [{ type: "text", text: `Updating MCP tool policy for ${preview.descriptor.toolRef}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_tool_policy_update",
            status: "updating",
            serverId: preview.descriptor.serverId,
            workloadName: preview.descriptor.workloadName,
            targetToolName: preview.descriptor.name,
          },
        });
        const result = await options.bridge.updateToolPolicy({
          toolName,
          serverId,
          workloadName,
          refresh: false,
          visibility,
          callPolicy,
          reason,
          clear,
          signal,
        });
        return toolResult(mcpToolPolicyUpdateResultText(result), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_tool_policy_update",
          status: result.status,
          serverId: result.descriptor.serverId,
          workloadName: result.descriptor.workloadName,
          targetToolRef: result.descriptor.toolRef,
          targetToolName: result.descriptor.name,
          previousPolicy: result.previousPolicy,
          policy: result.policy,
        });
      },
    },
    {
      ...aggregationStatus,
      parameters: aggregationStatus.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const input = objectInput(params);
        const refresh = optionalBoolean(input.refresh);
        const minServerCount = optionalNumber(input.minServerCount);
        onUpdate?.({
          content: [{ type: "text", text: "Evaluating MCP aggregation readiness." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_aggregation_status",
            status: "evaluating",
            refresh,
            minServerCount,
          },
        });
        const report = await options.bridge.evaluateAggregationReadiness({
          refresh,
          minServerCount,
          signal,
          onActivity: mcpToolActivityUpdate(onUpdate, "ambient_mcp_aggregation_status"),
        });
        return toolResult(mcpAggregationReadinessText(report), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_aggregation_status",
          status: report.status,
          serverCount: report.serverCount,
          callableToolCount: report.callableToolCount,
          blockerCount: report.blockers.length,
          warningCount: report.warnings.length,
          duplicateToolNames: report.duplicateToolNames,
          namespaceStrategy: report.namespaceStrategy,
          recommendedAction: report.recommendedAction,
          checks: report.checks,
        });
      },
    },
  ];
}

export function mcpToolReviewAcceptApprovalDetail(input: {
  review: McpToolDescriptorReview;
  expectedDescriptorHash?: string;
  workspace: McpToolBridgePiToolWorkspace;
}): string {
  return [
    `Trust current MCP tool descriptors for ${input.review.server.serverId}?`,
    "",
    "Review context:",
    `- Workspace: ${input.workspace.path}`,
    `- Workload: ${input.review.server.workloadName}`,
    `- Descriptor review: ${input.review.reviewStatus}`,
    input.review.reviewReason ? `- Review reason: ${input.review.reviewReason}` : undefined,
    input.review.descriptorHash ? `- Current descriptor hash: ${input.review.descriptorHash}` : undefined,
    input.expectedDescriptorHash ? `- Expected descriptor hash: ${input.expectedDescriptorHash}` : undefined,
    `- Tool count: ${input.review.tools.length}`,
    "",
    mcpToolDescriptorReviewText(input.review),
  ]
    .filter(Boolean)
    .join("\n");
}

export function mcpToolPolicyUpdateApprovalDetail(input: {
  preview: McpToolPolicyUpdatePreview;
  workspace: McpToolBridgePiToolWorkspace;
}): string {
  return [
    `Update Ambient MCP tool policy for ${input.preview.descriptor.toolRef}?`,
    "",
    "Policy context:",
    `- Workspace: ${input.workspace.path}`,
    `- Server id: ${input.preview.descriptor.serverId}`,
    `- Tool name: ${input.preview.descriptor.name}`,
    `- Workload: ${input.preview.descriptor.workloadName}`,
    input.preview.descriptor.descriptorHash ? `- Descriptor hash: ${input.preview.descriptor.descriptorHash}` : undefined,
    `- Previous policy: ${toolPolicyApprovalText(input.preview.previousPolicy) || "default"}`,
    `- Next policy: ${toolPolicyApprovalText(input.preview.nextPolicy) || "default"}`,
    "",
    mcpToolPolicyUpdatePreviewText(input.preview),
  ]
    .filter(Boolean)
    .join("\n");
}

function compactToolDescriptor(tool: McpToolDescriptor): Record<string, unknown> {
  const descriptionPreview = compactText(tool.description, 240);
  return {
    serverId: tool.serverId,
    workloadName: tool.workloadName,
    toolRef: tool.toolRef,
    name: tool.name,
    descriptionPreview,
    descriptionChars: tool.description?.length ?? 0,
    descriptionTruncated: Boolean(
      tool.description && descriptionPreview && descriptionPreview.length < tool.description.replace(/\s+/g, " ").trim().length,
    ),
    reviewStatus: tool.reviewStatus,
    workloadStatus: tool.workloadStatus,
    timeoutHint: tool.timeoutHint,
    policy: tool.policy,
  };
}
