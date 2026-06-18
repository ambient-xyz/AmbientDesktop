import type {
  PermissionAuditEntry,
  PermissionGrantScopeKind,
  PermissionMode,
  PermissionRisk,
} from "../../../shared/permissionTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { PluginMcpToolRegistration } from "../pluginHost";

export interface PluginMcpTrustPermissionRequest {
  title: string;
  message: string;
  detail: string;
  grantTargetLabel: string;
  grantTargetIdentity: string;
  allowedReason: string;
  deniedReason: string;
}

export interface PluginMcpTrustedPermissionAuditInput {
  runId?: string;
  threadId: string;
  permissionMode: PermissionMode;
  toolName: string;
  detail: string;
}

export interface EnsurePluginMcpToolTrustedInput {
  threadId: string;
  workspace: WorkspaceState;
  registration: PluginMcpToolRegistration;
}

export interface ResolvePluginMcpTrustPermissionInput {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  toolName: string;
  title: string;
  message: string;
  detail: string;
  risk?: PermissionRisk;
  reusableScopes?: PermissionGrantScopeKind[];
  grantTargetLabel: string;
  grantTargetIdentity?: string;
  grantConditions?: Record<string, unknown>;
  requireFreshPrompt?: boolean;
  allowedReason: string;
  deniedReason: string;
}

export interface EnsurePluginMcpToolTrustedOptions {
  getThread: (threadId: string) => ThreadSummary;
  activeRunIdForThread: (threadId: string) => string | undefined;
  isPluginTrusted: (pluginId: string, pluginFingerprint?: string) => boolean;
  setPluginTrusted: (pluginId: string, trusted: boolean, pluginFingerprint?: string) => void;
  resolveFirstPartyPluginPermission: (input: ResolvePluginMcpTrustPermissionInput) => Promise<boolean>;
  addPermissionAudit: (input: Omit<PermissionAuditEntry, "id" | "createdAt">) => PermissionAuditEntry;
  emitPermissionAuditCreated: (entry: PermissionAuditEntry) => void;
}

export function pluginMcpTrustPermissionRequest(input: {
  workspace: WorkspaceState;
  permissionMode: PermissionMode;
  registration: PluginMcpToolRegistration;
}): PluginMcpTrustPermissionRequest {
  const pluginName = input.registration.tool.pluginName;
  return {
    title: `Trust Codex plugin "${pluginName}"?`,
    message: "Ambient wants to run a local MCP tool from this plugin. Trusting it allows future tool calls from this plugin without another first-use prompt.",
    detail: formatPluginMcpTrustDetail(input),
    grantTargetLabel: `Trust Codex plugin ${pluginName}`,
    grantTargetIdentity: ["codex_plugin_trust", input.registration.tool.pluginId, input.registration.launchPlan.pluginFingerprint].join("\0"),
    allowedReason: "Plugin trusted by Ambient permission grant policy.",
    deniedReason: "Plugin trust prompt denied or timed out.",
  };
}

export function formatPluginMcpTrustDetail(input: {
  workspace: WorkspaceState;
  permissionMode: PermissionMode;
  registration: PluginMcpToolRegistration;
}): string {
  const command = [input.registration.launchPlan.command, ...input.registration.launchPlan.args].filter(Boolean).join(" ");
  return [
    `Plugin: ${input.registration.tool.pluginName}`,
    `Plugin path: ${input.registration.launchPlan.cwd}`,
    `Workspace: ${input.workspace.path}`,
    `Effective mode: ${input.permissionMode === "full-access" ? "Full access" : "Workspace scope"}`,
    `MCP server: ${input.registration.tool.serverName}`,
    `Command: ${command || "not declared"}`,
    `Environment keys: ${input.registration.launchPlan.envKeys.length > 0 ? input.registration.launchPlan.envKeys.join(", ") : "none"}`,
    `Tool: ${input.registration.originalName}`,
  ].join("\n");
}

export function buildPluginMcpTrustedPermissionAudit(
  input: PluginMcpTrustedPermissionAuditInput,
): Omit<PermissionAuditEntry, "id" | "createdAt"> {
  return {
    runId: input.runId,
    threadId: input.threadId,
    permissionMode: input.permissionMode,
    toolName: input.toolName,
    risk: "plugin-tool",
    decision: "allowed",
    detail: input.detail,
    reason: "Allowed previously trusted Codex plugin MCP tool invocation.",
    decisionSource: "persistent_grant",
  };
}

export async function ensurePluginMcpToolTrusted(
  input: EnsurePluginMcpToolTrustedInput,
  options: EnsurePluginMcpToolTrustedOptions,
): Promise<boolean> {
  const thread = options.getThread(input.threadId);
  const trustRequest = pluginMcpTrustPermissionRequest({
    workspace: input.workspace,
    permissionMode: thread.permissionMode,
    registration: input.registration,
  });
  const detail = trustRequest.detail;

  if (!options.isPluginTrusted(input.registration.tool.pluginId, input.registration.launchPlan.pluginFingerprint)) {
    const allowed = await options.resolveFirstPartyPluginPermission({
      thread,
      workspace: input.workspace,
      toolName: input.registration.registeredName,
      ...trustRequest,
    });
    if (allowed) {
      options.setPluginTrusted(input.registration.tool.pluginId, true, input.registration.launchPlan.pluginFingerprint);
    }
    return allowed;
  }

  const auditEntry = options.addPermissionAudit(buildPluginMcpTrustedPermissionAudit({
    runId: options.activeRunIdForThread(input.threadId),
    threadId: input.threadId,
    permissionMode: thread.permissionMode,
    toolName: input.registration.registeredName,
    detail,
  }));
  options.emitPermissionAuditCreated(auditEntry);
  return true;
}
