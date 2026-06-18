import type {
  MessagingGatewayRuntimeStatus,
  RuntimeSurfaceWorkflowRecoveryEvent,
} from "../../../shared/messagingGateway";
import type {
  AmbientPermissionGrant,
  PermissionAuditEntry,
  PermissionRequest,
} from "../../../shared/permissionTypes";
import type {
  MediaPlaybackSettings,
  SttSettings,
  VoiceSettings,
} from "../../../shared/localRuntimeTypes";
import type { PlannerSettings } from "../../../shared/plannerTypes";
import type { ProjectSummary } from "../../../shared/projectBoardTypes";
import type { SearchRoutingSettings } from "../../../shared/webResearchTypes";
import type { WorkflowAgentFolderSummary } from "../../../shared/workflowTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import {
  buildRuntimeSurfaceSnapshot,
  type RuntimeSurfaceSnapshot,
} from "../../../shared/runtimeSurfaceSnapshot";

export interface AgentRuntimeMessagingSurfaceSnapshotOptions {
  workspace: WorkspaceState;
  activeThreadId: string;
  gatewayStatus: () => Pick<MessagingGatewayRuntimeStatus, "remoteSurfaceRelaySummaries">;
  listThreads: () => ThreadSummary[];
  listWorkflowAgentFolders: () => WorkflowAgentFolderSummary[];
  readVoiceSettings?: () => VoiceSettings | undefined;
  readSttSettings?: () => SttSettings | undefined;
  readSearchSettings?: () => SearchRoutingSettings | undefined;
  readMediaSettings?: () => MediaPlaybackSettings | undefined;
  readPlannerSettings?: () => PlannerSettings | undefined;
  listPermissionRequests: () => PermissionRequest[];
  listPermissionGrants: () => AmbientPermissionGrant[];
  listPermissionAudit: (limit: number) => PermissionAuditEntry[];
  workflowRecoveryEvents: () => RuntimeSurfaceWorkflowRecoveryEvent[];
  listProjects?: () => ProjectSummary[];
}

export type AgentRuntimeMessagingSurfaceSnapshot = (limit?: number) => RuntimeSurfaceSnapshot;

export function createAgentRuntimeMessagingSurfaceSnapshot(
  options: AgentRuntimeMessagingSurfaceSnapshotOptions,
): AgentRuntimeMessagingSurfaceSnapshot {
  return (limit?: number) => {
    const gatewayStatus = options.gatewayStatus();
    return buildRuntimeSurfaceSnapshot({
      workspace: options.workspace,
      activeThreadId: options.activeThreadId,
      threads: options.listThreads(),
      workflowFolders: options.listWorkflowAgentFolders(),
      settings: {
        voice: options.readVoiceSettings?.(),
        stt: options.readSttSettings?.(),
        search: options.readSearchSettings?.(),
        media: options.readMediaSettings?.(),
        planner: options.readPlannerSettings?.(),
      },
      permissionRequests: options.listPermissionRequests(),
      permissionGrants: options.listPermissionGrants(),
      permissionAudit: options.listPermissionAudit(10),
      workflowRecoveryEvents: options.workflowRecoveryEvents(),
      relaySummaries: gatewayStatus.remoteSurfaceRelaySummaries ?? [],
      ...(options.listProjects ? { projects: options.listProjects() } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
  };
}
