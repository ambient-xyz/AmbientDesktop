import { createHash } from "node:crypto";
import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "../desktop-tools/desktopToolRegistry";
import {
  McpToolBridge,
  isMcpToolRuntimePermissionBlockedError,
  mcpAggregationReadinessText,
  mcpToolCallResultText,
  mcpToolCallOutputLooksLikeHtmlError,
  mcpToolDescriptorReviewAcceptText,
  mcpToolDescriptorReviewText,
  mcpToolDescribeText,
  mcpToolPolicyUpdatePreviewText,
  mcpToolPolicyUpdateResultText,
  mcpToolSearchResultsText,
  type McpToolCallResult,
  type McpToolBridgeActivity,
  type McpToolDescriptorReview,
  type McpToolDescriptor,
  type McpPreparedToolCall,
  type McpToolPolicyUpdatePreview,
} from "./mcpToolBridge";
import {
  evaluateMcpToolCallPermission,
  mcpPermissionPolicyDetailText,
  mcpPermissionPolicyPromptCopyText,
  type McpPermissionPolicyEvaluation,
} from "./mcpPermissionPolicyService";
import {
  mcpRuntimePermissionEnforcementDetailText,
  type McpRuntimePermissionEnforcement,
} from "./mcpRuntimePermissionEnforcement";
import type { McpManagedFileExchangeStagedFile, McpToolCallFileInput } from "./mcpManagedFileExchange";
import { redactSensitiveValue } from "../security/secretRedaction";

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

export function createMcpToolBridgePiToolDefinitions(options: McpToolBridgePiToolOptions): ToolDefinition<any, any, any>[] {
  const search = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_tool_search"));
  const describe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_tool_describe"));
  const call = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_tool_call"));
  const reviewAccept = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_tool_review_accept"));
  const policyUpdate = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_tool_policy_update"));
  const aggregationStatus = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_aggregation_status"));
  const deniedMcpToolCallApprovalKeys = new Set<string>();
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
    {
      ...call,
      parameters: call.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const thread = options.getThread();
        if (thread.collaborationMode === "planner") throw new Error("MCP tool calls are blocked in Planner Mode.");
        const input = objectInput(params);
        const toolName = requiredString(input, "toolName");
        const serverId = optionalString(input.serverId);
        const workloadName = optionalString(input.workloadName);
        const refresh = optionalBoolean(input.refresh);
        const toolArguments = mcpToolCallArguments(input);
        const fileInputs = mcpToolCallFileInputs(input.fileInputs);
        const approvalKey = mcpToolCallApprovalKey({
          toolName,
          serverId,
          workloadName,
          arguments: toolArguments,
          fileInputs,
        });
        if (deniedMcpToolCallApprovalKeys.has(approvalKey)) {
          return mcpToolCallApprovalDeniedResult({
            toolName,
            serverId,
            workloadName,
            duplicate: true,
          });
        }

        let prepared: McpPreparedToolCall;
        try {
          prepared = await options.bridge.prepareToolCall({
            toolName,
            serverId,
            workloadName,
            refresh,
            arguments: toolArguments,
            fileInputs,
            signal,
            onActivity: mcpToolActivityUpdate(onUpdate, "ambient_mcp_tool_call"),
          });
        } catch (error) {
          if (isMcpToolRuntimePermissionBlockedError(error)) {
            return mcpToolRuntimePermissionBlockedResult({
              requestedToolName: toolName,
              descriptor: error.descriptor,
              enforcement: error.enforcement,
            });
          }
          throw error;
        }
        const detail = mcpToolCallApprovalDetail({
          descriptor: prepared.descriptor,
          arguments: prepared.arguments,
          originalArguments: prepared.originalArguments,
          workspace: options.workspace,
          permission: prepared.permission,
          runtimeEnforcement: prepared.runtimeEnforcement,
          stagedFiles: prepared.fileExchange.stagedFiles,
        });
        onUpdate?.({
          content: [{ type: "text", text: `Waiting for approval to call MCP tool ${prepared.descriptor.serverId}/${prepared.descriptor.name}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_tool_call",
            status: "waiting-for-approval",
            approvalRequired: true,
            serverId: prepared.descriptor.serverId,
            workloadName: prepared.descriptor.workloadName,
            targetToolName: prepared.descriptor.name,
            toolRef: prepared.descriptor.toolRef,
            stagedFileCount: prepared.fileExchange.stagedFiles.length,
          },
        });
        const allowed = await (options.authorizeCall?.({
          thread,
          workspace: options.workspace,
          descriptor: prepared.descriptor,
          arguments: prepared.arguments,
          originalArguments: prepared.originalArguments,
          permission: prepared.permission,
          runtimeEnforcement: prepared.runtimeEnforcement,
          stagedFiles: prepared.fileExchange.stagedFiles,
          detail,
        }) ?? true);
        if (!allowed) {
          deniedMcpToolCallApprovalKeys.add(approvalKey);
          return mcpToolCallApprovalDeniedResult({
            toolName,
            serverId: prepared.descriptor.serverId,
            workloadName: prepared.descriptor.workloadName,
            targetToolName: prepared.descriptor.name,
            targetToolRef: prepared.descriptor.toolRef,
            stagedFileCount: prepared.fileExchange.stagedFiles.length,
            duplicate: false,
          });
        }

        onUpdate?.({
          content: [{ type: "text", text: `Calling MCP tool ${prepared.descriptor.serverId}/${prepared.descriptor.name}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_tool_call",
            status: "calling",
            serverId: prepared.descriptor.serverId,
            workloadName: prepared.descriptor.workloadName,
            targetToolName: prepared.descriptor.name,
            timeoutHint: prepared.descriptor.timeoutHint,
            stagedFileCount: prepared.fileExchange.stagedFiles.length,
          },
        });
        const result = await options.bridge.callTool({
          toolName,
          serverId,
          workloadName,
          refresh: false,
          arguments: toolArguments,
          fileInputs,
          signal,
          onActivity: mcpToolActivityUpdate(onUpdate, "ambient_mcp_tool_call"),
        });
        return toolResult(mcpToolCallResultText(result), mcpToolCallDetails(result));
      },
    },
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
        const allowed = await (options.authorizeReviewAccept?.({ thread, workspace: options.workspace, review, expectedDescriptorHash, detail }) ?? true);
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

function mcpToolCallApprovalDeniedResult(input: {
  toolName: string;
  serverId?: string;
  workloadName?: string;
  targetToolName?: string;
  targetToolRef?: string;
  stagedFileCount?: number;
  duplicate: boolean;
}): AgentToolResult<Record<string, unknown>> {
  return toolResult(
    input.duplicate
      ? "MCP tool call was already denied by the user for this exact request. This is terminal; do not retry the same call unless the user changes the request or explicitly asks to retry."
      : "MCP tool call denied by the user in Ambient Desktop. This is terminal; do not retry the same call unless the user changes the request or explicitly asks to retry.",
    {
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_tool_call",
      status: input.duplicate ? "approval-denied-duplicate" : "approval-denied",
      approvalDenied: true,
      approvalDeniedTerminal: true,
      terminal: true,
      retryAllowed: false,
      duplicateDenied: input.duplicate,
      requestedToolName: input.toolName,
      ...(input.serverId ? { serverId: input.serverId } : {}),
      ...(input.workloadName ? { workloadName: input.workloadName } : {}),
      ...(input.targetToolName ? { targetToolName: input.targetToolName } : {}),
      ...(input.targetToolRef ? { targetToolRef: input.targetToolRef } : {}),
      ...(input.stagedFileCount !== undefined ? { stagedFileCount: input.stagedFileCount } : {}),
    },
  );
}

function mcpToolRuntimePermissionBlockedResult(input: {
  requestedToolName: string;
  descriptor: McpToolDescriptor;
  enforcement: McpRuntimePermissionEnforcement;
}): AgentToolResult<Record<string, unknown>> {
  const hint = input.enforcement.repairHint;
  return toolResult(
    [
      "MCP tool call blocked by Ambient runtime permission enforcement.",
      "",
      mcpRuntimePermissionEnforcementDetailText(input.enforcement),
      "",
      hint ? `Next repair tool: ${hint.nextToolName} ${JSON.stringify(hint.nextToolInput)}` : "Next repair tool: run ambient_mcp_server_diagnostics for this server and include the exact failure in a runtime repair request.",
      "Do not use ambient_mcp_tool_policy_update, shell, direct ToolHive commands, or raw permission-profile edits for this runtime repair.",
    ].join("\n"),
    {
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_tool_call",
      status: "runtime-permission-blocked",
      runtimePermissionBlocked: true,
      approvalRequired: false,
      requestedToolName: input.requestedToolName,
      serverId: input.descriptor.serverId,
      workloadName: input.descriptor.workloadName,
      targetToolName: input.descriptor.name,
      targetToolRef: input.descriptor.toolRef,
      blockers: input.enforcement.blockers,
      warnings: input.enforcement.warnings,
      networkMode: input.enforcement.networkMode,
      filesystemMode: input.enforcement.filesystemMode,
      deniedResources: input.enforcement.deniedResources,
      repairHint: hint,
      ...(hint ? { nextToolName: hint.nextToolName, nextToolInput: hint.nextToolInput } : {}),
    },
  );
}

function mcpToolCallApprovalKey(input: {
  toolName: string;
  serverId?: string;
  workloadName?: string;
  arguments: Record<string, unknown>;
  fileInputs?: McpToolCallFileInput[];
}): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, sortJsonValue(entry)]));
}

export function mcpToolCallApprovalDetail(input: {
  descriptor: McpToolDescriptor;
  arguments: Record<string, unknown>;
  originalArguments?: Record<string, unknown>;
  workspace: McpToolBridgePiToolWorkspace;
  permission?: McpPermissionPolicyEvaluation;
  runtimeEnforcement?: McpRuntimePermissionEnforcement;
  stagedFiles?: McpManagedFileExchangeStagedFile[];
}): string {
  const argKeys = Object.keys(input.arguments).sort();
  const redactedArgs = redactSensitiveValue(input.arguments);
  const stagedFiles = input.stagedFiles ?? [];
  return [
    `Call Ambient MCP tool ${input.descriptor.toolRef}?`,
    "",
    "Call context:",
    `- Workspace: ${input.workspace.path}`,
    `- Server id: ${input.descriptor.serverId}`,
    `- Tool name: ${input.descriptor.name}`,
    `- Workload: ${input.descriptor.workloadName}`,
    `- Runtime status: ${input.descriptor.workloadStatus ?? "unknown"}`,
    input.descriptor.endpoint ? `- Endpoint: ${input.descriptor.endpoint}` : undefined,
    `- Descriptor review: ${input.descriptor.reviewStatus}`,
    input.descriptor.reviewReason ? `- Review reason: ${input.descriptor.reviewReason}` : undefined,
    input.descriptor.policy ? `- Tool policy: ${toolPolicyApprovalText(input.descriptor.policy)}` : undefined,
    input.descriptor.policy?.reason ? `- Policy reason: ${input.descriptor.policy.reason}` : undefined,
    `- Argument keys: ${argKeys.length ? argKeys.join(", ") : "(none)"}`,
    `- Redacted argument preview: ${truncate(JSON.stringify(redactedArgs), 1_000)}`,
    stagedFiles.length
      ? `- Staged MCP file inputs: ${stagedFiles.map((file) => `${file.argumentPath} -> ${file.containerPath}`).join("; ")}`
      : undefined,
    input.permission ? mcpPermissionPolicyPromptCopyText(input.permission) : undefined,
    input.permission ? mcpPermissionPolicyDetailText(input.permission) : undefined,
    input.runtimeEnforcement ? mcpRuntimePermissionEnforcementDetailText(input.runtimeEnforcement) : undefined,
    "- Secret values: never displayed unless already redacted by Ambient.",
  ].filter(Boolean).join("\n");
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
  ].filter(Boolean).join("\n");
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
  ].filter(Boolean).join("\n");
}

function mcpToolCallDetails(result: McpToolCallResult): Record<string, unknown> {
  return {
    runtime: "ambient-mcp",
    toolName: "ambient_mcp_tool_call",
    status: "complete",
    serverId: result.descriptor.serverId,
    workloadName: result.descriptor.workloadName,
    targetToolRef: result.descriptor.toolRef,
    targetToolName: result.descriptor.name,
    timeoutHint: result.descriptor.timeoutHint,
    argumentKeys: Object.keys(result.arguments).sort(),
    stagedFileCount: result.stagedFiles.length,
    stagedFiles: result.stagedFiles.map((file) => ({
      source: file.source,
      argumentPath: file.argumentPath,
      containerPath: file.containerPath,
      bytes: file.bytes,
    })),
    managedFileArtifactCount: result.managedFileArtifacts.length,
    managedFileArtifacts: result.managedFileArtifacts.map((artifact) => ({
      source: artifact.source,
      filename: artifact.filename,
      bytes: artifact.bytes,
      containerPath: artifact.containerPath,
      hostPath: artifact.hostPath,
      workspacePath: artifact.workspacePath,
      copySkippedReason: artifact.copySkippedReason,
    })),
    permissionResources: evaluateMcpToolCallPermission({
      descriptor: result.descriptor,
      toolArguments: result.arguments,
    }).resources.map((resource) => ({
      kind: resource.kind,
      action: resource.action,
      label: resource.label,
      risk: resource.risk,
    })),
    ...(mcpToolCallOutputLooksLikeHtmlError(result) ? { outputLooksLikeHtmlError: true } : {}),
    ...(result.output.truncated ? { outputOutput: result.output } : {}),
  };
}

function mcpToolActivityUpdate(
  onUpdate: ((update: AgentToolResult<Record<string, unknown>>) => void) | undefined,
  toolName: string,
): ((activity: McpToolBridgeActivity) => void) | undefined {
  if (!onUpdate) return undefined;
  return (activity) => {
    onUpdate({
      content: [{ type: "text", text: `MCP ${activity.operation} activity: ${activity.source}.` }],
      details: {
        runtime: "ambient-mcp",
        toolName,
        status: "activity",
        operation: activity.operation,
        activitySource: activity.source,
        endpointOrigin: activity.endpointOrigin,
        ...(activity.method ? { method: activity.method } : {}),
        ...(activity.requestId !== undefined ? { requestId: activity.requestId } : {}),
        ...(activity.bytes !== undefined ? { bytes: activity.bytes } : {}),
      },
    });
  };
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
    descriptionTruncated: Boolean(tool.description && descriptionPreview && descriptionPreview.length < tool.description.replace(/\s+/g, " ").trim().length),
    reviewStatus: tool.reviewStatus,
    workloadStatus: tool.workloadStatus,
    timeoutHint: tool.timeoutHint,
    policy: tool.policy,
  };
}

function toolResult(text: string, details: Record<string, unknown>): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mcpToolCallArguments(input: Record<string, unknown>): Record<string, unknown> {
  const canonical = input.arguments;
  if (canonical && typeof canonical === "object" && !Array.isArray(canonical)) return canonical as Record<string, unknown>;
  if (typeof canonical === "string") return parseJsonObjectAlias(canonical, "arguments");
  if (canonical !== undefined) throw new Error("ambient_mcp_tool_call arguments must be a JSON object.");

  const alias = input.toolInput;
  if (alias === undefined) return {};
  if (alias && typeof alias === "object" && !Array.isArray(alias)) return alias as Record<string, unknown>;
  if (typeof alias === "string") return parseJsonObjectAlias(alias, "toolInput compatibility alias");
  throw new Error("ambient_mcp_tool_call toolInput compatibility alias must be a JSON object or a JSON string containing an object.");
}

function mcpToolCallFileInputs(value: unknown): McpToolCallFileInput[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("ambient_mcp_tool_call fileInputs must be an array.");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`ambient_mcp_tool_call fileInputs[${index}] must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    const argumentPath = optionalString(record.argumentPath);
    const content = typeof record.content === "string" ? record.content : undefined;
    const filename = optionalString(record.filename);
    if (!argumentPath) throw new Error(`ambient_mcp_tool_call fileInputs[${index}].argumentPath is required.`);
    if (content === undefined) throw new Error(`ambient_mcp_tool_call fileInputs[${index}].content is required.`);
    return {
      argumentPath,
      content,
      ...(filename ? { filename } : {}),
    };
  });
}

function parseJsonObjectAlias(value: string, fieldLabel: string): Record<string, unknown> {
  const parsed = parseJsonAliasValue(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`ambient_mcp_tool_call ${fieldLabel} must contain a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function parseJsonAliasValue(value: string): unknown {
  const candidates = jsonAliasCandidates(value.trim());
  const errors: string[] = [];
  for (const candidate of candidates) {
    for (const repair of [candidate, removeTrailingJsonCommas(candidate)]) {
      try {
        return JSON.parse(repair);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  throw new Error(`ambient_mcp_tool_call JSON string did not contain valid JSON: ${errors[0] ?? "unknown parse error"}`);
}

function jsonAliasCandidates(value: string): string[] {
  const candidates = [value];
  const fenced = firstJsonFenceBody(value);
  if (fenced) candidates.push(fenced);
  const balanced = firstBalancedJsonObject(value);
  if (balanced) candidates.push(balanced);
  return [...new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean))];
}

function firstJsonFenceBody(value: string): string | undefined {
  const match = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(value);
  return match?.[1]?.trim();
}

function firstBalancedJsonObject(value: string): string | undefined {
  const start = value.indexOf("{");
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return undefined;
}

function removeTrailingJsonCommas(value: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      result += char;
      continue;
    }
    if (char === ",") {
      const next = value.slice(index + 1).match(/^\s*([}\]])/);
      if (next) continue;
    }
    result += char;
  }
  return result;
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalToolVisibility(value: unknown): "visible" | "hidden" | undefined {
  if (value === undefined) return undefined;
  if (value === "visible" || value === "hidden") return value;
  throw new Error("visibility must be visible or hidden.");
}

function optionalToolCallPolicy(value: unknown): "default" | "blocked" | "approval-required" | undefined {
  if (value === undefined) return undefined;
  if (value === "default" || value === "blocked" || value === "approval-required") return value;
  throw new Error("callPolicy must be default, blocked, or approval-required.");
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}

function compactText(value: string | undefined, maxChars: number): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, Math.max(1, maxChars - 1))}…`;
}

function toolPolicyApprovalText(policy: McpToolDescriptor["policy"]): string {
  if (!policy) return "";
  return [
    `visibility=${policy.visibility}`,
    `callPolicy=${policy.callPolicy}`,
    policy.reason ? `reason=${policy.reason}` : undefined,
  ].filter(Boolean).join(", ");
}
