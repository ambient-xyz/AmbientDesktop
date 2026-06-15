import type {
  MessagingGatewayRuntimeStatus,
  RuntimeSurfaceWorkflowRecoveryEvent,
} from "../shared/messagingGateway";
import type {
  AmbientPermissionGrant,
  MediaPlaybackSettings,
  PermissionAuditEntry,
  PermissionRequest,
  PlannerSettings,
  ProjectSummary,
  SearchRoutingSettings,
  SttSettings,
  ThreadSummary,
  VoiceSettings,
  WorkflowAgentFolderSummary,
  WorkspaceState,
} from "../shared/types";
import {
  buildRuntimeSurfaceSnapshot,
  type RuntimeSurfaceSnapshot,
} from "./runtimeSurfaceSnapshot";

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
