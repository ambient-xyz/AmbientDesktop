import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
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
import {
  type MessagingRemoteSurfaceCommandPendingProjectSwitch,
  type MessagingRemoteSurfaceCommandApplyResolverOptions,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import { createDefaultMessagingProviderRegistry } from "../agentRuntimeMessagingFacade";
import { MessagingGatewayRunner } from "../agentRuntimeMessagingFacade";
import { TelegramBridgeSupervisor } from "../agentRuntimeTelegramFacade";
import { readinessProbesFromAdapters } from "../agentRuntimeMessagingFacade";
import { createSignalMessagingReadinessAdapter } from "../signal/signalMessagingReadiness";
import { createTelegramMessagingReadinessAdapter } from "../agentRuntimeTelegramFacade";
import { createMessagingBindingStore } from "../agentRuntimeMessagingFacade";
import { createDefaultMessagingConversationDirectoryAdapterRegistry } from "../agentRuntimeMessagingFacade";
import { SignalRealPollingRunner } from "../signal/signalRealPolling";
import { createAgentRuntimeMessagingSurfaceSnapshot } from "./agentRuntimeMessagingSurfaceSnapshot";
import { TelegramBridgePollingRunner } from "../agentRuntimeTelegramFacade";
import { registerAgentRuntimeMessagingGatewayTools } from "./agentRuntimeMessagingGatewayToolRegistrations";
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

type AgentRuntimeMessagingRuntimeBridgeOptions = Pick<
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

export function createAgentRuntimeMessagingRuntimeBridge(
  input: AgentRuntimeMessagingRuntimeBridgeInput,
): AgentRuntimeMessagingRuntimeBridgeOptions {
  return {
    messagingGatewayStatusWithRemoteSurfaceEvents: (status) => input.remoteSurfaceRuntimeEvents.status(status),
    markRemoteSurfaceRuntimeEventRelay: (result) => {
      input.remoteSurfaceRuntimeEvents.markRelay(result);
    },
    isRunActive: () => input.activeRuns.has(input.threadId),
    recordRuntimeEvent: (event) => input.remoteSurfaceRuntimeEvents.record(event),
    storePendingProjectSwitch: (projectSwitch) => {
      input.pendingProjectSwitchByThreadId.set(input.threadId, projectSwitch);
    },
    completeProjectSwitch: (projectSwitch) =>
      input.completePendingProjectSwitch(projectSwitch, {
        threadId: input.threadId,
        workspacePath: input.workspacePath,
        throwOnFailure: true,
      }),
  };
}

export function createAgentRuntimeMessagingGatewayToolExtension(
  options: AgentRuntimeMessagingGatewayToolExtensionOptions,
): ExtensionFactory {
  return (pi) => {
    const registry = createDefaultMessagingProviderRegistry();
    const directoryAdapters = createDefaultMessagingConversationDirectoryAdapterRegistry();
    const bindings = createMessagingBindingStore({ stateRoot: options.workspace.statePath, providers: registry });
    const telegramBridgeSupervisor = new TelegramBridgeSupervisor({ workspacePath: options.workspace.path });
    const readinessAdapters = [
      createTelegramMessagingReadinessAdapter({ workspacePath: options.workspace.path }),
      createSignalMessagingReadinessAdapter({ workspacePath: options.workspace.path }),
    ];
    const gatewayRunner = new MessagingGatewayRunner({
      providers: registry,
      readinessProbes: readinessProbesFromAdapters(readinessAdapters),
      bridgeSupervisors: {
        "telegram-tdlib": telegramBridgeSupervisor,
      },
    });
    const telegramBridgePollingRunner = new TelegramBridgePollingRunner();
    const signalRealPollingRunner = new SignalRealPollingRunner();
    const runtimeSurfaceSnapshot = createAgentRuntimeMessagingSurfaceSnapshot({
      workspace: options.workspace,
      activeThreadId: options.threadId,
      gatewayStatus: () => options.messagingGatewayStatusWithRemoteSurfaceEvents(gatewayRunner.runtimeStatus()),
      listThreads: options.listThreads,
      listWorkflowAgentFolders: options.listWorkflowAgentFolders,
      readVoiceSettings: options.readVoiceSettings,
      readSttSettings: options.readSttSettings,
      readSearchSettings: options.readSearchSettings,
      readMediaSettings: options.readMediaSettings,
      readPlannerSettings: options.readPlannerSettings,
      listPermissionRequests: options.listPermissionRequests,
      listPermissionGrants: options.listPermissionGrants,
      listPermissionAudit: options.listPermissionAudit,
      workflowRecoveryEvents: options.workflowRecoveryEvents,
      ...(options.listProjects ? { listProjects: options.listProjects } : {}),
    });

    registerAgentRuntimeMessagingGatewayTools({
      pi,
      options,
      registry,
      directoryAdapters,
      bindings,
      gatewayRunner,
      telegramBridgeSupervisor,
      telegramBridgePollingRunner,
      signalRealPollingRunner,
      runtimeSurfaceSnapshot,
    });
  };
}
