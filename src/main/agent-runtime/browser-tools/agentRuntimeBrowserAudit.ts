import type { PermissionAuditEntry, ThreadSummary } from "../../../shared/types";

export type AgentRuntimeBrowserAuditRisk =
  | "browser-network"
  | "browser-control"
  | "browser-profile"
  | "browser-login"
  | "browser-credential";

export interface AgentRuntimeBrowserAuditInput {
  threadId: string;
  toolName: string;
  risk: AgentRuntimeBrowserAuditRisk;
  detail: string | undefined;
}

export interface AgentRuntimeBrowserAuditOptions {
  getThread: (threadId: string) => Pick<ThreadSummary, "permissionMode">;
  activeRunIdForThread: (threadId: string) => string | undefined;
  addPermissionAudit: (input: Omit<PermissionAuditEntry, "id" | "createdAt">) => PermissionAuditEntry;
  emitPermissionAuditCreated: (entry: PermissionAuditEntry) => void;
}

export function recordAgentRuntimeBrowserAudit(
  input: AgentRuntimeBrowserAuditInput,
  options: AgentRuntimeBrowserAuditOptions,
): PermissionAuditEntry | undefined {
  const thread = options.getThread(input.threadId);
  if (thread.permissionMode !== "full-access") return undefined;

  const auditEntry = options.addPermissionAudit({
    runId: options.activeRunIdForThread(input.threadId),
    threadId: input.threadId,
    permissionMode: thread.permissionMode,
    toolName: input.toolName,
    risk: input.risk,
    decision: "allowed",
    detail: input.detail,
    reason: "Allowed Ambient browser tool invocation.",
  });
  options.emitPermissionAuditCreated(auditEntry);
  return auditEntry;
}
