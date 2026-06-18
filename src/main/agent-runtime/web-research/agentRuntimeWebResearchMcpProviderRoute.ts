import type { AgentToolResult } from "@mariozechner/pi-coding-agent";

import type {
  AmbientPermissionGrant,
  PermissionGrantScopeKind,
} from "../../../shared/permissionTypes";
import type { WebResearchProviderConfig } from "../../../shared/webResearchTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import { mcpRuntimePermissionBlockedMessage } from "../../mcp/mcpRuntimePermissionEnforcement";
import {
  evaluateMcpToolCallPermission,
  mcpPermissionPolicyBlockedMessage,
  planMcpPermissionPromptGrant,
} from "../../mcp/mcpPermissionPolicyService";
import type {
  McpToolBridge,
  McpToolBridgeActivity,
  McpToolCallResult,
  McpToolDescriptor,
} from "../../mcp/mcpToolBridge";
import { mcpToolCallApprovalDetail } from "../../mcp/mcpToolBridgePiTools";

export interface WebResearchMcpProviderPermissionRequest {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  toolName: "web_research_search" | "web_research_fetch";
  title: string;
  message: string;
  detail: string;
  reusableScopes?: PermissionGrantScopeKind[];
  grantTargetLabel: string;
  grantTargetIdentity?: string;
  grantConditions?: Record<string, unknown>;
  allowedReason: string;
  deniedReason: string;
}

export interface WebResearchMcpProviderRouteInput {
  threadId: string;
  workspace: WorkspaceState;
  provider: WebResearchProviderConfig;
  role: "search" | "fetch";
  value: string;
  rawInput: Record<string, unknown>;
  signal: AbortSignal | undefined;
  onUpdate?: (update: AgentToolResult<Record<string, unknown>>) => void;
}

export interface WebResearchMcpProviderRouteOptions {
  createMcpRuntime: (
    workspace: WorkspaceState,
  ) => { bridge: Pick<McpToolBridge, "describeTool" | "evaluateRuntimePermission" | "callTool"> } | undefined;
  getThread: (threadId: string) => ThreadSummary;
  listPermissionGrants: () => AmbientPermissionGrant[];
  resolveFirstPartyPluginPermission: (input: WebResearchMcpProviderPermissionRequest) => Promise<boolean> | boolean;
}

export async function tryCallWebResearchMcpProvider(
  input: WebResearchMcpProviderRouteInput,
  options: WebResearchMcpProviderRouteOptions,
): Promise<{ result?: McpToolCallResult; fallbackReason?: string }> {
  const binding = input.provider.mcp;
  if (!binding?.toolName) return { fallbackReason: `Provider ${input.provider.providerId} has no MCP tool binding.` };
  const mcpRuntime = options.createMcpRuntime(input.workspace);
  if (!mcpRuntime) return { fallbackReason: "Ambient MCP runtime is not enabled." };

  let descriptor: McpToolDescriptor;
  try {
    descriptor = await mcpRuntime.bridge.describeTool({
      toolName: binding.toolName,
      serverId: binding.serverId,
      workloadName: binding.workloadName,
      refresh: false,
      signal: input.signal,
      onActivity: (activity) => input.onUpdate?.(webResearchMcpActivityToolUpdate(webResearchToolNameForRole(input.role), input.provider, activity, input.value)),
    });
  } catch (error) {
    return { fallbackReason: `MCP tool descriptor lookup failed: ${unknownErrorMessage(error)}` };
  }
  if (descriptor.reviewStatus !== "trusted") {
    return { fallbackReason: `MCP descriptor review is ${descriptor.reviewStatus}${descriptor.reviewReason ? `: ${descriptor.reviewReason}` : ""}.` };
  }
  if (!descriptor.endpoint) return { fallbackReason: `MCP workload ${descriptor.workloadName} has no ToolHive endpoint.` };
  if (descriptor.workloadStatus && descriptor.workloadStatus !== "running") {
    return { fallbackReason: `MCP workload ${descriptor.workloadName} is ${descriptor.workloadStatus}, not running.` };
  }
  if (descriptor.policy?.callPolicy === "blocked") {
    return { fallbackReason: `MCP tool ${descriptor.toolRef} is blocked by Ambient policy${descriptor.policy.reason ? `: ${descriptor.policy.reason}` : "."}` };
  }

  const toolArguments = webResearchMcpToolArguments(input.role, binding.argumentName, input.value);
  const permission = evaluateMcpToolCallPermission({
    descriptor,
    toolArguments,
    workspacePath: input.workspace.path,
    projectPath: input.workspace.path,
  });
  if (permission.hardDenials.length) return { fallbackReason: mcpPermissionPolicyBlockedMessage(permission) };
  const runtimeEnforcement = await mcpRuntime.bridge.evaluateRuntimePermission({ descriptor, permission });
  if (runtimeEnforcement.blockers.length) return { fallbackReason: mcpRuntimePermissionBlockedMessage(runtimeEnforcement) };

  const thread = options.getThread(input.threadId);
  const promptGrant = planMcpPermissionPromptGrant({
    evaluation: permission,
    existingGrants: options.listPermissionGrants(),
    context: {
      threadId: thread.id,
      projectPath: input.workspace.path,
      workspacePath: input.workspace.path,
    },
    runtime: {
      publicWebEgressGrantEnforced: runtimeEnforcement.publicWebEgressGrantEnforced,
      reusableScopeLimit: runtimeEnforcement.reusableScopeLimit,
    },
  });
  const detail = [
    `Ambient is routing this ${input.role === "search" ? "public search" : "public URL read"} through the configured MCP-backed web research provider ${input.provider.label}.`,
    "",
    mcpToolCallApprovalDetail({ descriptor, arguments: toolArguments, workspace: input.workspace, permission, runtimeEnforcement }),
    promptGrant.detailText,
  ].filter(Boolean).join("\n");
  const allowed = await options.resolveFirstPartyPluginPermission({
    thread,
    workspace: input.workspace,
    toolName: webResearchToolNameForRole(input.role),
    title: `${input.role === "search" ? "Search" : "Read URL"} with ${input.provider.label}?`,
    message:
      `Ambient wants to call the configured MCP-backed ${input.role === "search" ? "search" : "page-read"} provider through the web research broker. Arguments are schema-validated before execution and large outputs are materialized in the current workspace.`,
    detail,
    reusableScopes: promptGrant.reusableScopes,
    grantTargetLabel: promptGrant.grantTargetLabel,
    grantTargetIdentity: promptGrant.grantTargetIdentity,
    grantConditions: promptGrant.grantConditions,
    allowedReason: "MCP-backed web research provider call approved by Ambient permission grant policy.",
    deniedReason: "MCP-backed web research provider call prompt denied or timed out.",
  });
  if (!allowed) throw new Error("MCP-backed web research provider call blocked by Ambient Desktop approval prompt.");

  input.onUpdate?.({
    content: [{ type: "text", text: `Calling MCP-backed web research provider ${input.provider.label}.` }],
    details: {
      runtime: "ambient-mcp",
      toolName: webResearchToolNameForRole(input.role),
      status: "calling",
      providerId: input.provider.providerId,
      serverId: descriptor.serverId,
      workloadName: descriptor.workloadName,
      targetToolName: descriptor.name,
      targetToolRef: descriptor.toolRef,
    },
  });

  try {
    const result = await mcpRuntime.bridge.callTool({
      toolName: descriptor.name,
      serverId: descriptor.serverId,
      workloadName: descriptor.workloadName,
      refresh: false,
      arguments: toolArguments,
      signal: input.signal,
      onActivity: (activity) => input.onUpdate?.(webResearchMcpActivityToolUpdate(webResearchToolNameForRole(input.role), input.provider, activity, input.value)),
    });
    return { result };
  } catch (error) {
    return { fallbackReason: `MCP provider call failed: ${unknownErrorMessage(error)}` };
  }
}

export function webResearchMcpActivityToolUpdate(
  toolName: "web_research_search" | "web_research_fetch",
  provider: WebResearchProviderConfig,
  activity: McpToolBridgeActivity,
  target: string,
): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text: `${provider.label} MCP activity: ${activity.source}.` }],
    details: {
      runtime: "ambient-mcp",
      toolName,
      providerId: provider.providerId,
      providerLabel: provider.label,
      status: "activity",
      operation: activity.operation,
      activitySource: activity.source,
      endpointOrigin: activity.endpointOrigin,
      target,
      ...(activity.bytes !== undefined ? { bytes: activity.bytes } : {}),
      ...(activity.requestId !== undefined ? { requestId: activity.requestId } : {}),
    },
  };
}

export function webResearchMcpToolArguments(role: "search" | "fetch", argumentName: string | undefined, value: string): Record<string, unknown> {
  const key = argumentName?.trim() || (role === "search" ? "query" : "url");
  return { [key]: value };
}

export function webResearchToolNameForRole(role: "search" | "fetch"): "web_research_search" | "web_research_fetch" {
  return role === "search" ? "web_research_search" : "web_research_fetch";
}

function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
