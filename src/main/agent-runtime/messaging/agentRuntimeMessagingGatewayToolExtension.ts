import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import type {
  MessagingGatewayRuntimeStatus,
  RuntimeSurfaceWorkflowRecoveryEvent,
} from "../../../shared/messagingGateway";
import type {
  AmbientPermissionGrant,
  DesktopEvent,
  MediaPlaybackSettings,
  PermissionAuditEntry,
  PermissionGrantScopeKind,
  PermissionRequest,
  PermissionRisk,
  PlannerSettings,
  ProjectSummary,
  SearchRoutingSettings,
  SttSettings,
  ThreadSummary,
  VoiceSettings,
  WorkflowAgentFolderSummary,
  WorkspaceState,
} from "../../../shared/types";
import type { AgentRuntimeFeatures } from "../agentRuntime";
import { discoverAmbientCliPackages } from "../../ambient-cli/ambientCliPackages";
import { registerMessagingOverviewTools } from "./agentRuntimeMessagingOverviewTools";
import { registerTelegramSessionTools } from "../telegram/agentRuntimeTelegramSessionTools";
import { registerSignalSessionTools } from "../signal/agentRuntimeSignalSessionTools";
import { registerMessagingBindingTools } from "./agentRuntimeMessagingBindingTools";
import { registerTelegramOwnerLoopTools } from "../telegram/agentRuntimeTelegramOwnerLoopTools";
import { registerMessagingConversationDirectoryTools } from "./agentRuntimeMessagingConversationDirectoryTools";
import { registerTelegramConversationDirectoryTools } from "../telegram/agentRuntimeTelegramConversationDirectoryTools";
import { registerTelegramOwnerHandoffTools } from "../telegram/agentRuntimeTelegramOwnerHandoffTools";
import { registerSignalConversationDirectoryTools } from "../signal/agentRuntimeSignalConversationDirectoryTools";
import { registerSignalUnreadWindowTools } from "../signal/agentRuntimeSignalUnreadWindowTools";
import { registerSignalRealPollingTools } from "../signal/agentRuntimeSignalRealPollingTools";
import { registerSignalBridgeReplyTools } from "../signal/agentRuntimeSignalBridgeReplyTools";
import {
  createSignalBridgeReplyResolvers,
  signalBridgeReplyApprovalRequest,
} from "../signal/agentRuntimeSignalBridgeReplyPlan";
import { registerSignalBindingReadinessTools } from "../signal/agentRuntimeSignalBindingReadinessTools";
import { registerSignalOwnerHandoffTools } from "../signal/agentRuntimeSignalOwnerHandoffTools";
import {
  createSignalRemoteSurfacePlanResolvers,
  registerSignalRemoteSurfaceTools,
} from "./agentRuntimeSignalRemoteSurfaceTools";
import { registerMessagingRemoteSurfaceBindingTools } from "./agentRuntimeMessagingRemoteSurfaceBindingTools";
import { registerMessagingRemoteSurfaceEventTools } from "./agentRuntimeMessagingRemoteSurfaceEventTools";
import {
  createTelegramRemoteSurfacePlanResolvers,
  registerTelegramRemoteSurfaceTools,
} from "./agentRuntimeTelegramRemoteSurfaceTools";
import { registerRuntimeSurfaceTools } from "../agentRuntimeRuntimeSurfaceTools";
import { registerMessagingSyntheticRouteTools } from "./agentRuntimeMessagingSyntheticRouteTools";
import { registerTelegramBridgeEventTools } from "../telegram/agentRuntimeTelegramBridgeEventTools";
import { registerTelegramBridgePollPreviewTools } from "../telegram/agentRuntimeTelegramBridgePollPreviewTools";
import { registerTelegramBridgePollApplyTools } from "../telegram/agentRuntimeTelegramBridgePollApplyTools";
import {
  createTelegramBridgePollResolvers,
  createTelegramBridgePollingResolvers,
} from "../telegram/agentRuntimeTelegramBridgePollPlan";
import { registerTelegramBridgePollingStatusTools } from "../telegram/agentRuntimeTelegramBridgePollingStatusTools";
import { registerTelegramBridgePollingPreviewTools } from "../telegram/agentRuntimeTelegramBridgePollingPreviewTools";
import { registerTelegramBridgePollingApplyTools } from "../telegram/agentRuntimeTelegramBridgePollingApplyTools";
import { registerTelegramBridgeReplyPreviewTools } from "../telegram/agentRuntimeTelegramBridgeReplyPreviewTools";
import { registerTelegramBridgeReplyApplyTools } from "../telegram/agentRuntimeTelegramBridgeReplyApplyTools";
import {
  createTelegramBridgeReplyResolvers,
  telegramBridgeReplyApprovalRequest,
} from "../telegram/agentRuntimeTelegramBridgeReplyPlan";
import { registerMessagingRemoteSurfaceReplyPreviewTools } from "./agentRuntimeMessagingRemoteSurfaceReplyPreviewTools";
import { registerMessagingRemoteSurfaceReplyApplyTools } from "./agentRuntimeMessagingRemoteSurfaceReplyApplyTools";
import {
  createMessagingRemoteSurfaceReplyTargetResolver,
  messagingRemoteSurfaceReplyInputFromParams,
} from "./agentRuntimeMessagingRemoteSurfaceReplyTarget";
import { registerMessagingRemoteSurfaceCommandPreviewTools } from "./agentRuntimeMessagingRemoteSurfaceCommandPreviewTools";
import {
  createMessagingRemoteSurfaceCommandApplyResolver,
  registerMessagingRemoteSurfaceCommandApplyTools,
  type MessagingRemoteSurfaceCommandPendingProjectSwitch,
  type MessagingRemoteSurfaceCommandApplyResolverOptions,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import { createMessagingRemoteSurfaceCommandPreviewResolver } from "./agentRuntimeMessagingRemoteSurfaceCommandPreviewPlan";
import { registerTelegramRelayDiagnosticsTools } from "../telegram/agentRuntimeTelegramRelayDiagnosticsTools";
import { registerSignalRelayDiagnosticsTools } from "../signal/agentRuntimeSignalRelayDiagnosticsTools";
import { createMessagingRelayDiagnosticsResolvers } from "../agentRuntimeRelayDiagnosticsResolvers";
import * as messagingGatewayStatusTools from "./agentRuntimeMessagingGatewayStatusTools";
import {
  registerMessagingGatewayLifecyclePreviewTools,
} from "./agentRuntimeMessagingGatewayLifecyclePreviewTools";
import { registerMessagingGatewayLifecycleApplyTools } from "./agentRuntimeMessagingGatewayLifecycleApplyTools";
import { createMessagingGatewayLifecycleResolvers } from "./agentRuntimeMessagingGatewayLifecycleResolvers";
import { createDefaultMessagingProviderRegistry } from "../../messaging/messagingGatewayRegistry";
import { MessagingGatewayRunner } from "../../messaging/messagingGatewayRunner";
import { TelegramBridgeSupervisor } from "../../telegram/telegramBridgeSupervisor";
import { readinessProbesFromAdapters } from "../../messaging/messagingProviderReadiness";
import { createSignalMessagingReadinessAdapter } from "../signal/signalMessagingReadiness";
import { createTelegramMessagingReadinessAdapter } from "../../telegram/telegramMessagingReadiness";
import { createMessagingBindingStore } from "../../messaging/messagingBindings";
import { createDefaultMessagingConversationDirectoryAdapterRegistry } from "../../messaging/messagingConversationDirectoryAdapters";
import { SignalRealPollingRunner } from "../signal/signalRealPolling";
import { createAgentRuntimeMessagingSurfaceSnapshot } from "./agentRuntimeMessagingSurfaceSnapshot";
import { TelegramBridgePollingRunner } from "../../telegram/telegramBridgePolling";
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
  secureInputs: AgentRuntimeFeatures["secureInputs"];
  messagingGatewayStatusWithRemoteSurfaceEvents: (status: MessagingGatewayRuntimeStatus) => MessagingGatewayRuntimeStatus;
  markRemoteSurfaceRuntimeEventRelay: (result: AgentRuntimeRemoteSurfaceRuntimeEventRelayMarkInput) => void;
  isRunActive: () => boolean;
  createProject?: NonNullable<AgentRuntimeFeatures["projects"]>["createProject"];
  createChatThread: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["createChatThread"];
  createWorkflowAgentThreadSummary: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["createWorkflowAgentThreadSummary"];
  switchProjectAvailable: () => boolean;
  recordRuntimeEvent: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["recordRuntimeEvent"];
  storePendingProjectSwitch: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["storePendingProjectSwitch"];
  completeProjectSwitch: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["completeProjectSwitch"];
  answerWorkflowDiscoveryQuestion: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["answerWorkflowDiscoveryQuestion"];
  getWorkflowDiscoveryQuestion: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["getWorkflowDiscoveryQuestion"];
  getWorkflowThreadSummary: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["getWorkflowThreadSummary"];
  workflowAgents: AgentRuntimeFeatures["workflowAgents"];
  emit: (event: DesktopEvent) => void;
  updateThreadSettings: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["updateThreadSettings"];
  voice: AgentRuntimeFeatures["voice"];
  stt: AgentRuntimeFeatures["stt"];
  listSttProviders: MessagingRemoteSurfaceCommandApplyResolverOptions<AmbientPermissionGrant>["listSttProviders"];
  media: AgentRuntimeFeatures["media"];
  planner: AgentRuntimeFeatures["planner"];
  search: AgentRuntimeFeatures["search"];
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
    completeProjectSwitch: (projectSwitch) => input.completePendingProjectSwitch(projectSwitch, {
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

    registerMessagingOverviewTools(pi, {
      registry,
      bindings,
      gatewayRunner,
      telegramBridgePollingRunner,
    });

    registerTelegramSessionTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      getThread: options.getThread,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
      gatewayRunner,
      telegramBridgeSupervisor,
      secureInputs: options.secureInputs,
    });

    registerSignalSessionTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      getThread: options.getThread,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
      gatewayRunner,
    });

    registerMessagingBindingTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      getThread: options.getThread,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
      bindings,
    });

    registerTelegramOwnerLoopTools(pi, {
      bindings,
      gatewayRunner,
      telegramBridgePollingRunner,
    });

    registerMessagingConversationDirectoryTools(pi, {
      registry,
      directoryAdapters,
      bindings,
      gatewayRunner,
    });

    registerTelegramConversationDirectoryTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      getThread: options.getThread,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
      gatewayRunner,
    });

    registerTelegramOwnerHandoffTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      getThread: options.getThread,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
      gatewayRunner,
    });

    registerSignalConversationDirectoryTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      getThread: options.getThread,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
      registry,
      gatewayRunner,
    });

    registerSignalUnreadWindowTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      getThread: options.getThread,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
      runtimeSurfaceSnapshot,
      bindings,
      gatewayRunner,
    });

    registerSignalRealPollingTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      getThread: options.getThread,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
      runtimeSurfaceSnapshot,
      bindings,
      gatewayRunner,
      signalRealPollingRunner,
    });

    const signalBridgeReply = createSignalBridgeReplyResolvers({
      bindings,
      refreshProviderReadiness: (providerId) => gatewayRunner.refreshProviderReadiness(providerId),
      gatewayRuntimeStatus: () => options.messagingGatewayStatusWithRemoteSurfaceEvents(gatewayRunner.runtimeStatus()),
      signalDescriptor: () => registry.get("signal-cli")?.descriptor,
      requestApproval: async (preview) => await options.resolveFirstPartyPluginPermission(signalBridgeReplyApprovalRequest({
        preview,
        thread: options.getThread(options.threadId),
        workspace: options.workspace,
      })),
      onResult: (result) => {
        gatewayRunner.recordOutboundDelivery(result.delivery);
        options.markRemoteSurfaceRuntimeEventRelay(result);
      },
    });

    registerSignalBridgeReplyTools(pi, {
      previewForParams: signalBridgeReply.previewForParams,
      applyForParams: signalBridgeReply.applyForParams,
      gatewayRuntimeStatus: () => options.messagingGatewayStatusWithRemoteSurfaceEvents(gatewayRunner.runtimeStatus()),
    });

    registerSignalBindingReadinessTools(pi, {
      bindings,
      gatewayRunner,
      signalDescriptor: () => registry.get("signal-cli")?.descriptor,
    });

    registerSignalOwnerHandoffTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      getThread: options.getThread,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
      bindings,
      gatewayRunner,
      signalDescriptor: () => registry.get("signal-cli")?.descriptor,
    });

    const signalRemoteSurface = createSignalRemoteSurfacePlanResolvers({
      bindings,
      gatewayRunner,
      signalDescriptor: () => registry.get("signal-cli")?.descriptor,
    });

    registerSignalRemoteSurfaceTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      getThread: options.getThread,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
      bindings,
      createPlanForParams: signalRemoteSurface.createPlanForParams,
      revokePlanForParams: signalRemoteSurface.revokePlanForParams,
    });

    const telegramRemoteSurface = createTelegramRemoteSurfacePlanResolvers({
      bindings,
      gatewayRunner,
    });

    registerMessagingRemoteSurfaceBindingTools(pi, {
      registry,
      bindings,
      gatewayRunner,
      telegramPlan: telegramRemoteSurface.planForInput,
    });

    registerMessagingRemoteSurfaceEventTools(pi, {
      registry,
      bindings,
      runtimeSurfaceSnapshot: () => runtimeSurfaceSnapshot(),
    });

    registerTelegramRemoteSurfaceTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      getThread: options.getThread,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
      bindings,
      planForParams: telegramRemoteSurface.planForParams,
    });

    registerRuntimeSurfaceTools(pi, {
      runtimeSurfaceSnapshot,
    });

    registerMessagingSyntheticRouteTools(pi, {
      bindings,
      gatewayRunner,
      runtimeSurfaceSnapshot,
    });

    registerTelegramBridgeEventTools(pi, {
      bindings,
      gatewayRunner,
      runtimeSurfaceSnapshot,
    });

    const telegramBridgePoll = createTelegramBridgePollResolvers({
      bindings,
      gatewayRunner,
      runtimeSurfaceSnapshot: () => runtimeSurfaceSnapshot(),
      stateRoot: options.workspace.statePath,
    });

    const telegramBridgePolling = createTelegramBridgePollingResolvers({
      bindings,
      gatewayRunner,
      stateRoot: options.workspace.statePath,
      telegramBridgePollingRunner,
      applyPollForParams: telegramBridgePoll.applyPollForParams,
    });

    registerTelegramBridgePollPreviewTools(pi, {
      planForParams: telegramBridgePoll.planForParams,
    });

    registerTelegramBridgePollApplyTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      getThread: options.getThread,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
      planForParams: telegramBridgePoll.planForParams,
      applyPollForParams: telegramBridgePoll.applyPollForParams,
    });

    registerTelegramBridgePollingStatusTools(pi, {
      telegramBridgePollingRunner,
    });

    registerTelegramBridgePollingPreviewTools(pi, {
      previewForParams: (params) => telegramBridgePolling.previewForParams(params).preview,
    });

    registerTelegramBridgePollingApplyTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      getThread: options.getThread,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
      previewForParams: telegramBridgePolling.previewForParams,
      applyPolling: telegramBridgePolling.applyPolling,
    });

    const telegramBridgeReply = createTelegramBridgeReplyResolvers({
      bindings,
      gatewayRuntimeStatus: () => options.messagingGatewayStatusWithRemoteSurfaceEvents(gatewayRunner.runtimeStatus()),
      requestApproval: async (preview) => await options.resolveFirstPartyPluginPermission(telegramBridgeReplyApprovalRequest({
        preview,
        thread: options.getThread(options.threadId),
        workspace: options.workspace,
      })),
      onResult: (result) => {
        gatewayRunner.recordOutboundDelivery(result.delivery);
        options.markRemoteSurfaceRuntimeEventRelay(result);
      },
    });

    registerTelegramBridgeReplyPreviewTools(pi, {
      previewForParams: telegramBridgeReply.previewForParams,
    });

    registerTelegramBridgeReplyApplyTools(pi, {
      applyForParams: telegramBridgeReply.applyForParams,
      gatewayRuntimeStatus: () => options.messagingGatewayStatusWithRemoteSurfaceEvents(gatewayRunner.runtimeStatus()),
    });

    const remoteSurfaceReplyTargetForInput = createMessagingRemoteSurfaceReplyTargetResolver({
      gatewayRuntimeStatus: () => options.messagingGatewayStatusWithRemoteSurfaceEvents(gatewayRunner.runtimeStatus()),
      listBindings: () => bindings.list({ includeInactive: true }).bindings,
    });
    registerMessagingRemoteSurfaceReplyPreviewTools(pi, {
      inputForParams: messagingRemoteSurfaceReplyInputFromParams,
      targetForInput: remoteSurfaceReplyTargetForInput,
      telegramPreviewForParams: telegramBridgeReply.previewForParams,
      signalPreviewForParams: signalBridgeReply.previewForParams,
    });

    registerMessagingRemoteSurfaceReplyApplyTools(pi, {
      inputForParams: messagingRemoteSurfaceReplyInputFromParams,
      targetForInput: remoteSurfaceReplyTargetForInput,
      telegramApplyForParams: telegramBridgeReply.applyForParams,
      signalApplyForParams: signalBridgeReply.applyForParams,
      gatewayRuntimeStatus: () => options.messagingGatewayStatusWithRemoteSurfaceEvents(gatewayRunner.runtimeStatus()),
    });

    const remoteSurfaceCommandPreviewForParams = createMessagingRemoteSurfaceCommandPreviewResolver({
      bindings,
      gatewayRuntimeStatus: () => gatewayRunner.runtimeStatus(),
      runtimeSurfaceSnapshot: () => runtimeSurfaceSnapshot(),
    });

    registerMessagingRemoteSurfaceCommandPreviewTools(pi, {
      previewForParams: remoteSurfaceCommandPreviewForParams,
    });

    const remoteSurfaceCommandApplyForParams = createMessagingRemoteSurfaceCommandApplyResolver({
      previewForParams: remoteSurfaceCommandPreviewForParams,
      threadId: options.threadId,
      workspace: options.workspace,
      getThread: options.getThread,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
      bindings,
      runtimeSurfaceSnapshot,
      isRunActive: options.isRunActive,
      ...(options.createProject ? { createProject: options.createProject } : {}),
      createChatThread: options.createChatThread,
      createWorkflowAgentThreadSummary: options.createWorkflowAgentThreadSummary,
      switchProjectAvailable: options.switchProjectAvailable,
      recordRuntimeEvent: options.recordRuntimeEvent,
      storePendingProjectSwitch: options.storePendingProjectSwitch,
      completeProjectSwitch: options.completeProjectSwitch,
      answerWorkflowDiscoveryQuestion: options.answerWorkflowDiscoveryQuestion,
      getWorkflowDiscoveryQuestion: options.getWorkflowDiscoveryQuestion,
      getWorkflowThreadSummary: options.getWorkflowThreadSummary,
      workflowAgents: options.workflowAgents,
      onWorkflowUpdated: () => options.emit({ type: "workflow-updated" }),
      updateThreadSettings: options.updateThreadSettings,
      onThreadUpdated: (thread) => options.emit({ type: "thread-updated", thread }),
      voice: options.voice,
      stt: options.stt,
      listSttProviders: options.listSttProviders,
      media: options.media,
      planner: options.planner,
      search: options.search,
      discoverAmbientCliPackages,
      ...(options.respondToPermissionPrompt ? {
        respondToPermissionPrompt: options.respondToPermissionPrompt,
      } : {}),
      revokePermissionGrant: options.revokePermissionGrant,
      onPermissionGrantRevoked: (grant) => options.emit({ type: "permission-grant-revoked", grant }),
    });
    registerMessagingRemoteSurfaceCommandApplyTools(pi, {
      applyForParams: remoteSurfaceCommandApplyForParams,
    });

    const relayDiagnostics = createMessagingRelayDiagnosticsResolvers({
      bindings,
      gatewayRunner,
      runtimeStatus: () => options.messagingGatewayStatusWithRemoteSurfaceEvents(gatewayRunner.runtimeStatus()),
    });

    registerTelegramRelayDiagnosticsTools(pi, relayDiagnostics.telegram);

    registerSignalRelayDiagnosticsTools(pi, relayDiagnostics.signal);

    messagingGatewayStatusTools.registerMessagingGatewayStatusTools(pi, messagingGatewayStatusTools.createMessagingGatewayStatusResolvers({
      bindings,
      gatewayRunner,
      runtimeStatus: () => options.messagingGatewayStatusWithRemoteSurfaceEvents(gatewayRunner.runtimeStatus()),
      telegramBridgePollingRunner,
      signalRealPollingRunner,
      signalProviderDescriptor: () => registry.get("signal-cli")?.descriptor,
    }));

    const gatewayLifecycle = createMessagingGatewayLifecycleResolvers(gatewayRunner);

    registerMessagingGatewayLifecyclePreviewTools(pi, gatewayLifecycle);

    registerMessagingGatewayLifecycleApplyTools(pi, {
      threadId: options.threadId,
      workspace: options.workspace,
      getThread: options.getThread,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
      ...gatewayLifecycle,
    });
  };
}
