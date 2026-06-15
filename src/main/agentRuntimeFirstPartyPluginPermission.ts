import type {
  AmbientPermissionGrant,
  PermissionAuditDecisionSource,
  PermissionAuditEntry,
  PermissionGrantScopeKind,
  PermissionMode,
  PermissionRequest,
  PermissionPromptResolution,
  PermissionPromptResponseMode,
  PermissionRisk,
  ThreadSummary,
  WorkspaceState,
} from "../shared/types";
import { permissionGrantTargetHash, resolvePermissionWithGrants } from "./permissionGrants";
import type { ProjectStore } from "./projectStore";

export interface FirstPartyPluginPermissionRequestInput {
  thread: Pick<ThreadSummary, "id">;
  toolName: string;
  title: string;
  message: string;
  detail: string;
  risk?: PermissionRisk;
  reusableScopes?: PermissionGrantScopeKind[];
  grantTargetLabel: string;
  grantTargetIdentity?: string;
  grantConditions?: Record<string, unknown>;
}

export interface FirstPartyPluginPermissionAuditInput {
  runId?: string;
  threadId: string;
  permissionMode: PermissionMode;
  toolName: string;
  allowed: boolean;
  detail: string;
  risk?: PermissionRisk;
  reason: string;
  decisionSource?: PermissionAuditDecisionSource;
  grantId?: string;
}

export type ResolveFirstPartyPluginPermissionInput = Omit<FirstPartyPluginPermissionRequestInput, "thread"> & {
  thread: Pick<ThreadSummary, "id" | "permissionMode">;
  workspace: Pick<WorkspaceState, "path">;
  requireFreshPrompt?: boolean;
  allowedReason: string;
  deniedReason: string;
};

export interface FirstPartyPluginPermissionWaitStart {
  toolName: string;
  requestId?: string;
  title: string;
  detail?: string;
  risk?: PermissionRisk;
}

export interface FirstPartyPluginPermissionWaitFinish {
  allowed?: boolean;
  mode?: PermissionPromptResponseMode;
  error?: string;
}

export interface ResolveFirstPartyPluginPermissionOptions {
  store: ProjectStore;
  requestPermission: (
    request: Omit<PermissionRequest, "id">,
    options?: { onRequest?: (createdRequest: PermissionRequest) => void },
  ) => Promise<PermissionPromptResolution>;
  beginPermissionWait?: (
    threadId: string,
    input: FirstPartyPluginPermissionWaitStart,
  ) => ((finish?: FirstPartyPluginPermissionWaitFinish) => void) | undefined;
  emitPermissionAudit: (input: Omit<FirstPartyPluginPermissionAuditInput, "runId">) => void;
  emitPermissionGrantCreated?: (grant: AmbientPermissionGrant) => void;
}

export interface EmitFirstPartyPluginPermissionAuditOptions {
  activeRunIdForThread: (threadId: string) => string | undefined;
  addPermissionAudit: (input: Omit<PermissionAuditEntry, "id" | "createdAt">) => PermissionAuditEntry;
  emitPermissionAuditCreated: (entry: PermissionAuditEntry) => void;
}

export function buildFirstPartyPluginPermissionRequest(
  input: FirstPartyPluginPermissionRequestInput,
): Omit<PermissionRequest, "id"> {
  return {
    threadId: input.thread.id,
    toolName: input.toolName,
    title: input.title,
    message: input.message,
    detail: input.detail,
    risk: input.risk ?? "plugin-tool",
    reusableScopes: input.reusableScopes,
    grantActionKind: "plugin_tool_execute",
    grantTargetKind: "tool",
    grantTargetLabel: input.grantTargetLabel,
    grantTargetHash: firstPartyPluginPermissionGrantHash(input.grantTargetIdentity ?? input.grantTargetLabel),
    grantConditions: input.grantConditions,
  };
}

export function buildFirstPartyPluginPermissionAudit(
  input: FirstPartyPluginPermissionAuditInput,
): Omit<PermissionAuditEntry, "id" | "createdAt"> {
  return {
    runId: input.runId,
    threadId: input.threadId,
    permissionMode: input.permissionMode,
    toolName: input.toolName,
    risk: input.risk ?? "plugin-tool",
    decision: input.allowed ? "allowed" : "denied",
    detail: input.detail,
    reason: input.reason,
    decisionSource: input.decisionSource,
    grantId: input.grantId,
  };
}

export function emitFirstPartyPluginPermissionAudit(
  input: Omit<FirstPartyPluginPermissionAuditInput, "runId">,
  options: EmitFirstPartyPluginPermissionAuditOptions,
): PermissionAuditEntry {
  const auditEntry = options.addPermissionAudit(buildFirstPartyPluginPermissionAudit({
    runId: options.activeRunIdForThread(input.threadId),
    ...input,
  }));
  options.emitPermissionAuditCreated(auditEntry);
  return auditEntry;
}

export function firstPartyPluginPermissionGrantHash(identity: string): string {
  return permissionGrantTargetHash("plugin_tool_execute", "tool", identity);
}

export async function resolveFirstPartyPluginPermission(
  input: ResolveFirstPartyPluginPermissionInput,
  options: ResolveFirstPartyPluginPermissionOptions,
): Promise<boolean> {
  if (input.thread.permissionMode === "full-access" && !input.requireFreshPrompt) {
    options.emitPermissionAudit({
      threadId: input.thread.id,
      permissionMode: input.thread.permissionMode,
      toolName: input.toolName,
      allowed: true,
      detail: input.detail,
      risk: input.risk ?? "plugin-tool",
      reason: "Allowed automatically by Full Access mode.",
      decisionSource: "allowed_by_full_access",
    });
    return true;
  }

  const request = buildFirstPartyPluginPermissionRequest(input);
  const permission = await resolvePermissionWithGrants({
    store: options.store,
    requester: {
      request: async (requestInput: Omit<PermissionRequest, "id">) => {
        let finishPermissionWait: ((finish?: FirstPartyPluginPermissionWaitFinish) => void) | undefined;
        const beginWait = (createdRequest?: PermissionRequest) => {
          if (finishPermissionWait) return;
          finishPermissionWait = options.beginPermissionWait?.(input.thread.id, {
            toolName: input.toolName,
            requestId: createdRequest?.id,
            title: createdRequest?.title ?? requestInput.title,
            detail: createdRequest?.detail ?? requestInput.detail,
            risk: createdRequest?.risk ?? requestInput.risk,
          });
        };
        try {
          const responsePromise = options.requestPermission(requestInput, {
            onRequest: (createdRequest) => {
              beginWait(createdRequest);
            },
          });
          beginWait();
          const response = await responsePromise;
          finishPermissionWait?.({ allowed: response.allowed, mode: response.mode });
          return response;
        } catch (error) {
          finishPermissionWait?.({ error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      },
    },
    request,
    context: {
      permissionMode: input.thread.permissionMode,
      threadId: input.thread.id,
      projectPath: options.store.getWorkspace().path,
      workspacePath: input.workspace.path,
    },
    requireFreshPrompt: input.requireFreshPrompt,
  });
  options.emitPermissionAudit({
    threadId: input.thread.id,
    permissionMode: input.thread.permissionMode,
    toolName: input.toolName,
    allowed: permission.allowed,
    detail: input.detail,
    risk: input.risk ?? "plugin-tool",
    reason: permission.allowed ? input.allowedReason : input.deniedReason,
    decisionSource: permission.decisionSource,
    grantId: permission.grant?.id,
  });
  if (permission.grant && permission.decisionSource !== "persistent_grant") {
    options.emitPermissionGrantCreated?.(permission.grant);
  }
  return permission.allowed;
}
