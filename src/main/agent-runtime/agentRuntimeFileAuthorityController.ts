import { basename } from "node:path";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type {
  PermissionGrantScopeKind,
  PermissionPromptResolution,
  PermissionPromptResponseMode,
  PermissionRequest,
} from "../../shared/permissionTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { AmbientFileAuthorityRequest } from "./agentRuntimePiFacade";
import {
  includeDefaultWorkspaceAuthorityRoots,
  recordTransientFileAuthorityFromPermissionRequest,
  runtimeFileAuthorityRootPathsForThread,
  type MutableTransientFileAuthorityRootStore,
} from "./agentRuntimeFileAuthority";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { resolvePermissionWithGrants } from "./agentRuntimePermissionsFacade";
import type {
  RuntimePermissionWaitFinish,
  RuntimePermissionWaitStart,
} from "./runtimePermissionWaitController";

type AgentRuntimeFileAuthorityStore = Pick<
  ProjectStore,
  | "getThread"
  | "getWorkspace"
  | "getProjectBoardDependencyWorkspacePathsForExecutionThread"
  | "listPermissionGrants"
  | "createPermissionGrant"
  | "addPermissionAudit"
  | "listSubagentToolScopeSnapshots"
>;

export interface AgentRuntimeFileAuthorityControllerOptions {
  store: AgentRuntimeFileAuthorityStore;
  transientRoots: MutableTransientFileAuthorityRootStore;
  requestPermission: (
    request: Omit<PermissionRequest, "id">,
    options?: { onRequest?: (request: PermissionRequest) => void },
  ) => Promise<PermissionPromptResolution>;
  beginPermissionWait: (
    threadId: string,
    wait: RuntimePermissionWaitStart,
  ) => ((finish?: RuntimePermissionWaitFinish) => void) | undefined;
  activeRunId: (threadId: string) => string | undefined;
  emit: (event: DesktopEvent) => void;
}

export class AgentRuntimeFileAuthorityController {
  constructor(private readonly options: AgentRuntimeFileAuthorityControllerOptions) {}

  rootPathsForThread(threadId: string, access: "read" | "write"): string[] {
    return runtimeFileAuthorityRootPathsForThread(threadId, access, {
      store: this.options.store,
      transientRoots: this.options.transientRoots,
    });
  }

  includeWorkspaceRootAuthorityForThread(threadId: string): boolean {
    return includeDefaultWorkspaceAuthorityRoots(this.options.store.getThread(threadId));
  }

  async requestForThread(
    threadId: string,
    workspace: WorkspaceState,
    request: AmbientFileAuthorityRequest,
  ): Promise<boolean> {
    const thread = this.options.store.getThread(threadId);
    const actionKind = request.access === "write" ? "local_file_write" : "file_content_read";
    const targetName = basename(request.absolutePath) || request.absolutePath;
    const permissionRequest: Omit<PermissionRequest, "id"> = {
      threadId,
      toolName: request.toolName,
      title: `Allow ${request.toolName} to ${request.access} ${targetName}?`,
      message: thread.kind === "subagent_child"
        ? "A sub-agent needs file authority outside its current child scope. Review this in the parent thread before the child continues."
        : "Ambient needs file authority outside the current thread scope before this tool can continue.",
      detail: [
        `Target path: ${request.absolutePath}`,
        request.requestedPath !== request.absolutePath ? `Requested path: ${request.requestedPath}` : undefined,
        `Reason: ${request.reason}`,
        thread.kind === "subagent_child" && thread.subagentRunId ? `Child run: ${thread.subagentRunId}` : undefined,
        `Thread: ${threadId}`,
      ].filter(Boolean).join("\n"),
      risk: "outside-workspace",
      reusableScopes: ["thread", "project"] satisfies PermissionGrantScopeKind[],
      grantActionKind: actionKind,
      grantTargetKind: "path",
      grantTargetLabel: request.absolutePath,
      grantConditions: {
        path: request.absolutePath,
        access: request.access,
        source: "file-authority-adapter",
      },
    };

    if (this.childApprovalModeForThread(thread) === "non_interactive") {
      const auditEntry = this.options.store.addPermissionAudit({
        runId: this.options.activeRunId(threadId),
        threadId,
        permissionMode: thread.permissionMode,
        toolName: request.toolName,
        risk: permissionRequest.risk,
        decision: "denied",
        detail: permissionRequest.detail,
        reason: "Denied because this sub-agent launch is non-interactive and cannot ask the parent for more file authority.",
        decisionSource: "denied_by_policy",
      });
      this.options.emit({ type: "permission-audit-created", entry: auditEntry });
      return false;
    }

    const permission = await resolvePermissionWithGrants({
      store: this.options.store as ProjectStore,
      requester: {
        request: async (requestInput) => {
          let finishPermissionWait: ((finish?: {
            allowed?: boolean;
            mode?: PermissionPromptResponseMode;
            error?: string;
          }) => void) | undefined;
          try {
            const response = await this.options.requestPermission(requestInput, {
              onRequest: (createdRequest) => {
                finishPermissionWait = this.options.beginPermissionWait(threadId, {
                  toolName: request.toolName,
                  requestId: createdRequest.id,
                  title: createdRequest.title,
                  detail: createdRequest.detail,
                  risk: createdRequest.risk,
                });
              },
            });
            finishPermissionWait?.({ allowed: response.allowed, mode: response.mode });
            return response;
          } catch (error) {
            finishPermissionWait?.({ error: error instanceof Error ? error.message : String(error) });
            throw error;
          }
        },
      },
      request: permissionRequest,
      context: {
        permissionMode: thread.permissionMode,
        threadId,
        projectPath: this.options.store.getWorkspace().path,
        workspacePath: workspace.path,
      },
    });

    const auditEntry = this.options.store.addPermissionAudit({
      runId: this.options.activeRunId(threadId),
      threadId,
      permissionMode: thread.permissionMode,
      toolName: request.toolName,
      risk: permissionRequest.risk,
      decision: permission.allowed ? "allowed" : "denied",
      detail: permissionRequest.detail,
      reason: permission.allowed ? "Approved by Ambient file authority policy." : "Denied by user or timed out.",
      decisionSource: permission.decisionSource,
      grantId: permission.grant?.id,
    });
    this.options.emit({ type: "permission-audit-created", entry: auditEntry });
    if (permission.grant && permission.decisionSource !== "persistent_grant") {
      this.options.emit({ type: "permission-grant-created", grant: permission.grant });
    }
    if (!permission.allowed) return false;

    recordTransientFileAuthorityFromPermissionRequest({
      threadId,
      thread,
      projectPath: this.options.store.getWorkspace().path,
      request: permissionRequest,
      reason: permission.decisionSource === "persistent_grant"
        ? "Allowed by matching persistent permission grant."
        : "Allowed by Ambient file authority prompt for this tool call.",
    }, {
      roots: this.options.transientRoots,
    });
    return true;
  }

  childApprovalModeForThread(
    thread: Pick<ThreadSummary, "kind" | "subagentRunId">,
  ): "interactive" | "non_interactive" | undefined {
    if (thread.kind !== "subagent_child" || !thread.subagentRunId) return undefined;
    return this.options.store.listSubagentToolScopeSnapshots(thread.subagentRunId).at(-1)?.scope.approvalMode;
  }
}
