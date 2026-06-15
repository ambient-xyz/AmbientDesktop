import type { AgentToolResult } from "@mariozechner/pi-coding-agent";

import type {
  AmbientPermissionGrant,
  PermissionGrantScopeKind,
  ThreadSummary,
  WorkspaceState,
} from "../shared/types";
import { browserToolResult } from "./agentRuntimeBrowserToolFormatting";
import { mcpRuntimePermissionBlockedMessage } from "./mcpRuntimePermissionEnforcement";
import {
  evaluateMcpToolCallPermission,
  mcpPermissionPolicyBlockedMessage,
  planMcpPermissionPromptGrant,
} from "./mcpPermissionPolicyService";
import { mcpToolCallApprovalDetail } from "./mcpToolBridgePiTools";
import type {
  McpToolBridge,
  McpToolBridgeActivity,
} from "./mcpToolBridge";
import {
  scraplingBrowserContentToolArguments,
  shouldRouteBrowserContentUrlToScrapling,
} from "./scraplingBrowserRouting";
import { resolveScraplingBrowserContentDescriptor } from "./scraplingMcpDescriptor";

export interface ScraplingBrowserRoutePermissionRequest {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  toolName: string;
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

export interface ScraplingBrowserRouteInput {
  threadId: string;
  workspace: WorkspaceState;
  url: string | undefined;
  rawInput: Record<string, unknown>;
  signal: AbortSignal | undefined;
  onUpdate?: (update: AgentToolResult<Record<string, unknown>>) => void;
}

export interface ScraplingBrowserRouteOptions {
  createMcpRuntime: (
    workspace: WorkspaceState,
  ) => { bridge: Pick<McpToolBridge, "describeTool" | "evaluateRuntimePermission" | "callTool"> } | undefined;
  getThread: (threadId: string) => ThreadSummary;
  listPermissionGrants: () => AmbientPermissionGrant[];
  resolveFirstPartyPluginPermission: (input: ScraplingBrowserRoutePermissionRequest) => Promise<boolean> | boolean;
}

export async function tryRouteBrowserContentThroughScrapling(
  input: ScraplingBrowserRouteInput,
  options: ScraplingBrowserRouteOptions,
): Promise<{ result?: AgentToolResult<Record<string, unknown>>; fallbackReason?: string }> {
  if (!shouldRouteBrowserContentUrlToScrapling({ ...input.rawInput, url: input.url })) return {};
  const mcpRuntime = options.createMcpRuntime(input.workspace);
  if (!mcpRuntime) return { fallbackReason: "Ambient MCP runtime is not enabled." };

  const { descriptor, unavailableReason } = await resolveScraplingBrowserContentDescriptor(mcpRuntime.bridge, input.signal);
  if (!descriptor) {
    return { fallbackReason: unavailableReason };
  }
  if (descriptor.policy?.callPolicy === "blocked") {
    return {
      fallbackReason: `Scrapling MCP tool ${descriptor.toolRef} is blocked by Ambient policy${descriptor.policy.reason ? `: ${descriptor.policy.reason}` : "."}`,
    };
  }

  const toolArguments = scraplingBrowserContentToolArguments(input.url!);
  const permission = evaluateMcpToolCallPermission({
    descriptor,
    toolArguments,
    workspacePath: input.workspace.path,
    projectPath: input.workspace.path,
  });
  if (permission.hardDenials.length) {
    return { fallbackReason: mcpPermissionPolicyBlockedMessage(permission) };
  }
  const runtimeEnforcement = await mcpRuntime.bridge.evaluateRuntimePermission({ descriptor, permission });
  if (runtimeEnforcement.blockers.length) {
    return { fallbackReason: mcpRuntimePermissionBlockedMessage(runtimeEnforcement) };
  }

  const thread = options.getThread(input.threadId);
  const detail = [
    "Ambient is routing this browser_content public HTTPS URL read through the installed Scrapling MCP default capability.",
    "",
    mcpToolCallApprovalDetail({
      descriptor,
      arguments: toolArguments,
      workspace: input.workspace,
      permission,
      runtimeEnforcement,
    }),
  ].join("\n");
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
  const allowed = await options.resolveFirstPartyPluginPermission({
    thread,
    workspace: input.workspace,
    toolName: "ambient_mcp_tool_call",
    title: `Read ${input.url} with Scrapling?`,
    message:
      "Ambient wants to route this public URL read through the installed, ToolHive-managed Scrapling capability instead of the shared browser profile.",
    detail: promptGrant.detailText ? `${detail}\n${promptGrant.detailText}` : detail,
    reusableScopes: promptGrant.reusableScopes,
    grantTargetLabel: promptGrant.grantTargetLabel,
    grantTargetIdentity: promptGrant.grantTargetIdentity,
    grantConditions: promptGrant.grantConditions,
    allowedReason: "Scrapling MCP-routed browser content read approved by Ambient permission grant policy.",
    deniedReason: "Scrapling MCP-routed browser content read prompt denied or timed out.",
  });
  if (!allowed) throw new Error("Scrapling MCP-routed browser content read blocked by Ambient Desktop approval prompt.");

  input.onUpdate?.({
    content: [{ type: "text", text: `Routing public URL read through installed Scrapling MCP tool ${descriptor.name}.` }],
    details: {
      runtime: "ambient-mcp",
      toolName: "browser_content",
      sourceToolName: "browser_content",
      targetToolName: descriptor.name,
      targetToolRef: descriptor.toolRef,
      routedTo: "ambient-mcp-scrapling",
      status: "calling",
      url: input.url,
    },
  });

  try {
    const result = await mcpRuntime.bridge.callTool({
      toolName: descriptor.name,
      serverId: descriptor.serverId,
      workloadName: descriptor.workloadName,
      arguments: toolArguments,
      signal: input.signal,
      onActivity: (activity) => input.onUpdate?.(scraplingMcpActivityToolUpdate(activity, input.url!)),
    });
    return {
      result: browserToolResult([
        "Scrapling retrieved this public URL through Ambient MCP.",
        `URL: ${input.url}`,
        `MCP tool: ${result.descriptor.toolRef}`,
        "",
        result.text,
      ].join("\n"), {
        runtime: "ambient-mcp",
        toolName: "browser_content",
        sourceToolName: "browser_content",
        targetToolName: result.descriptor.name,
        targetToolRef: result.descriptor.toolRef,
        serverId: result.descriptor.serverId,
        workloadName: result.descriptor.workloadName,
        routedTo: "ambient-mcp-scrapling",
        status: "complete",
        url: input.url,
        textOutput: result.output,
      }),
    };
  } catch (error) {
    return { fallbackReason: `Scrapling MCP call failed; falling back to Ambient browser content. ${unknownErrorMessage(error)}` };
  }
}

export function scraplingMcpActivityToolUpdate(activity: McpToolBridgeActivity, url: string): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text: `Scrapling MCP activity: ${activity.source}.` }],
    details: {
      runtime: "ambient-mcp",
      toolName: "browser_content",
      sourceToolName: "browser_content",
      routedTo: "ambient-mcp-scrapling",
      status: "activity",
      operation: activity.operation,
      activitySource: activity.source,
      endpointOrigin: activity.endpointOrigin,
      url,
      ...(activity.bytes !== undefined ? { bytes: activity.bytes } : {}),
      ...(activity.requestId !== undefined ? { requestId: activity.requestId } : {}),
    },
  };
}

function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
