import { createHash } from "node:crypto";
import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "./mcpDesktopToolsFacade";
import type { McpManagedFileExchangeStagedFile, McpToolCallFileInput } from "./mcpManagedFileExchange";
import {
  evaluateMcpToolCallPermission,
  mcpPermissionPolicyDetailText,
  mcpPermissionPolicyPromptCopyText,
  type McpPermissionPolicyEvaluation,
} from "./mcpPermissionPolicyService";
import {
  isMcpToolRuntimePermissionBlockedError,
  mcpToolCallOutputLooksLikeHtmlError,
  mcpToolCallResultText,
  type McpPreparedToolCall,
  type McpToolCallResult,
  type McpToolDescriptor,
} from "./mcpToolBridge";
import {
  mcpToolActivityUpdate,
  objectInput,
  optionalBoolean,
  optionalString,
  requiredString,
  toolPolicyApprovalText,
  toolResult,
  truncate,
} from "./mcpToolBridgePiToolSupport";
import type { McpToolBridgePiToolOptions, McpToolBridgePiToolWorkspace } from "./mcpToolBridgePiToolTypes";
import { mcpRuntimePermissionEnforcementDetailText, type McpRuntimePermissionEnforcement } from "./mcpRuntimePermissionEnforcement";
import { redactSensitiveValue } from "./mcpSecurityFacade";

export function createMcpToolBridgeCallPiToolDefinition(options: McpToolBridgePiToolOptions): ToolDefinition<any, any, any> {
  const call = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_tool_call"));
  const deniedMcpToolCallApprovalKeys = new Set<string>();
  return {
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
        content: [
          { type: "text", text: `Waiting for approval to call MCP tool ${prepared.descriptor.serverId}/${prepared.descriptor.name}.` },
        ],
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
  };
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
      hint
        ? `Next repair tool: ${hint.nextToolName} ${JSON.stringify(hint.nextToolInput)}`
        : "Next repair tool: run ambient_mcp_server_diagnostics for this server and include the exact failure in a runtime repair request.",
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
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJsonValue(entry)]),
  );
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
  ]
    .filter(Boolean)
    .join("\n");
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
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
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
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
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
