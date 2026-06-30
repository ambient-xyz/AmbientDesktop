import type { MessagingGatewayRuntimeStatus, RuntimeSurfaceWorkflowRecoveryEvent } from "../../../shared/messagingGateway";
import type {
  AmbientPermissionGrant,
  PermissionAuditEntry,
  PermissionGrantScopeKind,
  PermissionRequest,
  PermissionRisk,
} from "../../../shared/permissionTypes";
import type { DesktopEvent } from "../../../shared/desktopTypes";
import type { MediaPlaybackSettings, SttSettings, VoiceSettings } from "../../../shared/localRuntimeTypes";
import type { PlannerSettings } from "../../../shared/plannerTypes";
import type { ProjectSummary } from "../../../shared/projectBoardTypes";
import type { SearchRoutingSettings } from "../../../shared/webResearchTypes";
import type { WorkflowAgentFolderSummary } from "../../../shared/workflowTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import type { TelegramSessionToolRegistrationOptions } from "../telegram/agentRuntimeTelegramSessionTools";
import type {
  MessagingRemoteSurfaceCommandPendingProjectSwitch,
  MessagingRemoteSurfaceCommandApplyResolverOptions,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import type {
  AgentRuntimeRemoteSurfaceRuntimeEventStore,
  AgentRuntimeRemoteSurfaceRuntimeEventRelayMarkInput,
} from "./agentRuntimeRemoteSurfaceRuntimeEvents";

export interface AgentRuntimeMessagingFirstPartyPermissionRequest {
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

export interface AgentRuntimeMessagingGatewayToolExtensionOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
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
  resolveFirstPartyPluginPermission: (input: AgentRuntimeMessagingFirstPartyPermissionRequest) => Promise<boolean>;
  secureInputs: TelegramSessionToolRegistrationOptions["secureInputs"];
  messagingGatewayStatusWithRemoteSurfaceEvents: (status: MessagingGatewayRuntimeStatus) => MessagingGatewayRuntimeStatus;
  markRemoteSurfaceRuntimeEventRelay: (result: AgentRuntimeRemoteSurfaceRuntimeEventRelayMarkInput) => void;
  isRunActive: () => boolean;
  createProject?: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["createProject"];
  createChatThread: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["createChatThread"];
  createWorkflowAgentThreadSummary: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["createWorkflowAgentThreadSummary"];
  switchProjectAvailable: () => boolean;
  recordRuntimeEvent: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["recordRuntimeEvent"];
  storePendingProjectSwitch: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["storePendingProjectSwitch"];
  completeProjectSwitch: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["completeProjectSwitch"];
  answerWorkflowDiscoveryQuestion: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["answerWorkflowDiscoveryQuestion"];
  getWorkflowDiscoveryQuestion: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["getWorkflowDiscoveryQuestion"];
  getWorkflowThreadSummary: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["getWorkflowThreadSummary"];
  workflowAgents: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["workflowAgents"];
  emit: (event: DesktopEvent) => void;
  updateThreadSettings: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["updateThreadSettings"];
  voice: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["voice"];
  stt: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["stt"];
  listSttProviders: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["listSttProviders"];
  media: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["media"];
  planner: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["planner"];
  search: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["search"];
  respondToPermissionPrompt?: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["respondToPermissionPrompt"];
  revokePermissionGrant: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["revokePermissionGrant"];
}

export type AgentRuntimeMessagingRuntimeBridgeOptions = Pick<
  AgentRuntimeMessagingGatewayToolExtensionOptions,
  | "messagingGatewayStatusWithRemoteSurfaceEvents"
  | "markRemoteSurfaceRuntimeEventRelay"
  | "isRunActive"
  | "recordRuntimeEvent"
  | "storePendingProjectSwitch"
  | "completeProjectSwitch"
>;

export interface AgentRuntimeMessagingRuntimeBridgeInput {
  threadId: string;
  workspacePath: string;
  remoteSurfaceRuntimeEvents: Pick<AgentRuntimeRemoteSurfaceRuntimeEventStore, "status" | "markRelay" | "record">;
  activeRuns: Pick<ReadonlyMap<string, unknown>, "has">;
  pendingProjectSwitchByThreadId: Pick<Map<string, MessagingRemoteSurfaceCommandPendingProjectSwitch>, "set">;
  completePendingProjectSwitch: (
    projectSwitch: MessagingRemoteSurfaceCommandPendingProjectSwitch,
    input: { threadId?: string; workspacePath?: string; throwOnFailure?: boolean },
  ) => Promise<unknown> | unknown;
}
