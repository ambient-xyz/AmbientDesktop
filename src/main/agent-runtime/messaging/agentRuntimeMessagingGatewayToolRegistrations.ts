import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import { discoverAmbientCliPackages } from "../agentRuntimeAmbientCliFacade";
import type {
  createDefaultMessagingConversationDirectoryAdapterRegistry,
  createDefaultMessagingProviderRegistry,
  createMessagingBindingStore,
  MessagingGatewayRunner,
} from "../agentRuntimeMessagingFacade";
import { createMessagingRelayDiagnosticsResolvers } from "../agentRuntimeRelayDiagnosticsResolvers";
import { registerRuntimeSurfaceTools } from "../agentRuntimeRuntimeSurfaceTools";
import { createSignalBridgeReplyResolvers, signalBridgeReplyApprovalRequest } from "../signal/agentRuntimeSignalBridgeReplyPlan";
import { registerSignalBindingReadinessTools } from "../signal/agentRuntimeSignalBindingReadinessTools";
import { registerSignalBridgeReplyTools } from "../signal/agentRuntimeSignalBridgeReplyTools";
import { registerSignalConversationDirectoryTools } from "../signal/agentRuntimeSignalConversationDirectoryTools";
import { registerSignalOwnerHandoffTools } from "../signal/agentRuntimeSignalOwnerHandoffTools";
import { registerSignalRealPollingTools } from "../signal/agentRuntimeSignalRealPollingTools";
import type { SignalRealPollingRunner } from "../signal/signalRealPolling";
import { registerSignalRelayDiagnosticsTools } from "../signal/agentRuntimeSignalRelayDiagnosticsTools";
import { registerSignalSessionTools } from "../signal/agentRuntimeSignalSessionTools";
import { registerSignalUnreadWindowTools } from "../signal/agentRuntimeSignalUnreadWindowTools";
import { registerTelegramBridgeEventTools } from "../telegram/agentRuntimeTelegramBridgeEventTools";
import { registerTelegramBridgePollApplyTools } from "../telegram/agentRuntimeTelegramBridgePollApplyTools";
import { createTelegramBridgePollResolvers, createTelegramBridgePollingResolvers } from "../telegram/agentRuntimeTelegramBridgePollPlan";
import { registerTelegramBridgePollingApplyTools } from "../telegram/agentRuntimeTelegramBridgePollingApplyTools";
import { registerTelegramBridgePollingPreviewTools } from "../telegram/agentRuntimeTelegramBridgePollingPreviewTools";
import { registerTelegramBridgePollingStatusTools } from "../telegram/agentRuntimeTelegramBridgePollingStatusTools";
import { registerTelegramBridgePollPreviewTools } from "../telegram/agentRuntimeTelegramBridgePollPreviewTools";
import { registerTelegramBridgeReplyApplyTools } from "../telegram/agentRuntimeTelegramBridgeReplyApplyTools";
import { createTelegramBridgeReplyResolvers, telegramBridgeReplyApprovalRequest } from "../telegram/agentRuntimeTelegramBridgeReplyPlan";
import { registerTelegramBridgeReplyPreviewTools } from "../telegram/agentRuntimeTelegramBridgeReplyPreviewTools";
import { registerTelegramConversationDirectoryTools } from "../telegram/agentRuntimeTelegramConversationDirectoryTools";
import { registerTelegramOwnerHandoffTools } from "../telegram/agentRuntimeTelegramOwnerHandoffTools";
import { registerTelegramOwnerLoopTools } from "../telegram/agentRuntimeTelegramOwnerLoopTools";
import { registerTelegramRelayDiagnosticsTools } from "../telegram/agentRuntimeTelegramRelayDiagnosticsTools";
import { registerTelegramSessionTools } from "../telegram/agentRuntimeTelegramSessionTools";
import type { TelegramBridgePollingRunner, TelegramBridgeSupervisor } from "../agentRuntimeTelegramFacade";
import { registerMessagingBindingTools } from "./agentRuntimeMessagingBindingTools";
import { registerMessagingConversationDirectoryTools } from "./agentRuntimeMessagingConversationDirectoryTools";
import { registerMessagingGatewayLifecycleApplyTools } from "./agentRuntimeMessagingGatewayLifecycleApplyTools";
import { registerMessagingGatewayLifecyclePreviewTools } from "./agentRuntimeMessagingGatewayLifecyclePreviewTools";
import { createMessagingGatewayLifecycleResolvers } from "./agentRuntimeMessagingGatewayLifecycleResolvers";
import * as messagingGatewayStatusTools from "./agentRuntimeMessagingGatewayStatusTools";
import type { AgentRuntimeMessagingGatewayToolExtensionOptions } from "./agentRuntimeMessagingGatewayToolExtension";
import { registerMessagingOverviewTools } from "./agentRuntimeMessagingOverviewTools";
import { registerMessagingRemoteSurfaceBindingTools } from "./agentRuntimeMessagingRemoteSurfaceBindingTools";
import {
  createMessagingRemoteSurfaceCommandApplyResolver,
  registerMessagingRemoteSurfaceCommandApplyTools,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyTools";
import { createMessagingRemoteSurfaceCommandPreviewResolver } from "./agentRuntimeMessagingRemoteSurfaceCommandPreviewPlan";
import { registerMessagingRemoteSurfaceCommandPreviewTools } from "./agentRuntimeMessagingRemoteSurfaceCommandPreviewTools";
import { registerMessagingRemoteSurfaceEventTools } from "./agentRuntimeMessagingRemoteSurfaceEventTools";
import { registerMessagingRemoteSurfaceReplyApplyTools } from "./agentRuntimeMessagingRemoteSurfaceReplyApplyTools";
import { registerMessagingRemoteSurfaceReplyPreviewTools } from "./agentRuntimeMessagingRemoteSurfaceReplyPreviewTools";
import {
  createMessagingRemoteSurfaceReplyTargetResolver,
  messagingRemoteSurfaceReplyInputFromParams,
} from "./agentRuntimeMessagingRemoteSurfaceReplyTarget";
import { registerMessagingSyntheticRouteTools } from "./agentRuntimeMessagingSyntheticRouteTools";
import type { createAgentRuntimeMessagingSurfaceSnapshot } from "./agentRuntimeMessagingSurfaceSnapshot";
import { createSignalRemoteSurfacePlanResolvers, registerSignalRemoteSurfaceTools } from "./agentRuntimeSignalRemoteSurfaceTools";
import { createTelegramRemoteSurfacePlanResolvers, registerTelegramRemoteSurfaceTools } from "./agentRuntimeTelegramRemoteSurfaceTools";

type AgentRuntimeMessagingPi = Parameters<ExtensionFactory>[0];

export interface AgentRuntimeMessagingGatewayToolRegistrationInput {
  pi: AgentRuntimeMessagingPi;
  options: AgentRuntimeMessagingGatewayToolExtensionOptions;
  registry: ReturnType<typeof createDefaultMessagingProviderRegistry>;
  directoryAdapters: ReturnType<typeof createDefaultMessagingConversationDirectoryAdapterRegistry>;
  bindings: ReturnType<typeof createMessagingBindingStore>;
  gatewayRunner: MessagingGatewayRunner;
  telegramBridgeSupervisor: TelegramBridgeSupervisor;
  telegramBridgePollingRunner: TelegramBridgePollingRunner;
  signalRealPollingRunner: SignalRealPollingRunner;
  runtimeSurfaceSnapshot: ReturnType<typeof createAgentRuntimeMessagingSurfaceSnapshot>;
}

export function registerAgentRuntimeMessagingGatewayTools(input: AgentRuntimeMessagingGatewayToolRegistrationInput) {
  registerMessagingGatewayFoundationTools(input);
  const signalBridgeReply = registerSignalRemoteSurfaceToolsForGateway(input);
  const telegramBridgeReply = registerTelegramRemoteSurfaceToolsForGateway(input);
  registerMessagingGatewayReplyAndCommandTools(input, { signalBridgeReply, telegramBridgeReply });
  registerMessagingGatewayStatusAndLifecycleTools(input);
}

function registerMessagingGatewayFoundationTools({
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
}: AgentRuntimeMessagingGatewayToolRegistrationInput) {
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
}

function registerSignalRemoteSurfaceToolsForGateway({
  pi,
  options,
  registry,
  bindings,
  gatewayRunner,
}: AgentRuntimeMessagingGatewayToolRegistrationInput) {
  const signalBridgeReply = createSignalBridgeReplyResolvers({
    bindings,
    refreshProviderReadiness: (providerId) => gatewayRunner.refreshProviderReadiness(providerId),
    gatewayRuntimeStatus: () => options.messagingGatewayStatusWithRemoteSurfaceEvents(gatewayRunner.runtimeStatus()),
    signalDescriptor: () => registry.get("signal-cli")?.descriptor,
    requestApproval: async (preview) =>
      await options.resolveFirstPartyPluginPermission(
        signalBridgeReplyApprovalRequest({
          preview,
          thread: options.getThread(options.threadId),
          workspace: options.workspace,
        }),
      ),
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

  return signalBridgeReply;
}

function registerTelegramRemoteSurfaceToolsForGateway({
  pi,
  options,
  registry,
  bindings,
  gatewayRunner,
  telegramBridgePollingRunner,
  runtimeSurfaceSnapshot,
}: AgentRuntimeMessagingGatewayToolRegistrationInput) {
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
    requestApproval: async (preview) =>
      await options.resolveFirstPartyPluginPermission(
        telegramBridgeReplyApprovalRequest({
          preview,
          thread: options.getThread(options.threadId),
          workspace: options.workspace,
        }),
      ),
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

  return telegramBridgeReply;
}

function registerMessagingGatewayReplyAndCommandTools(
  { pi, options, bindings, gatewayRunner, runtimeSurfaceSnapshot }: AgentRuntimeMessagingGatewayToolRegistrationInput,
  replies: {
    signalBridgeReply: ReturnType<typeof createSignalBridgeReplyResolvers>;
    telegramBridgeReply: ReturnType<typeof createTelegramBridgeReplyResolvers>;
  },
) {
  const { signalBridgeReply, telegramBridgeReply } = replies;
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
    ...(options.respondToPermissionPrompt
      ? {
          respondToPermissionPrompt: options.respondToPermissionPrompt,
        }
      : {}),
    revokePermissionGrant: options.revokePermissionGrant,
    onPermissionGrantRevoked: (grant) => options.emit({ type: "permission-grant-revoked", grant }),
  });
  registerMessagingRemoteSurfaceCommandApplyTools(pi, {
    applyForParams: remoteSurfaceCommandApplyForParams,
  });
}

function registerMessagingGatewayStatusAndLifecycleTools({
  pi,
  options,
  registry,
  bindings,
  gatewayRunner,
  telegramBridgePollingRunner,
  signalRealPollingRunner,
}: AgentRuntimeMessagingGatewayToolRegistrationInput) {
  const relayDiagnostics = createMessagingRelayDiagnosticsResolvers({
    bindings,
    gatewayRunner,
    runtimeStatus: () => options.messagingGatewayStatusWithRemoteSurfaceEvents(gatewayRunner.runtimeStatus()),
  });

  registerTelegramRelayDiagnosticsTools(pi, relayDiagnostics.telegram);

  registerSignalRelayDiagnosticsTools(pi, relayDiagnostics.signal);

  messagingGatewayStatusTools.registerMessagingGatewayStatusTools(
    pi,
    messagingGatewayStatusTools.createMessagingGatewayStatusResolvers({
      bindings,
      gatewayRunner,
      runtimeStatus: () => options.messagingGatewayStatusWithRemoteSurfaceEvents(gatewayRunner.runtimeStatus()),
      telegramBridgePollingRunner,
      signalRealPollingRunner,
      signalProviderDescriptor: () => registry.get("signal-cli")?.descriptor,
    }),
  );

  const gatewayLifecycle = createMessagingGatewayLifecycleResolvers(gatewayRunner);

  registerMessagingGatewayLifecyclePreviewTools(pi, gatewayLifecycle);

  registerMessagingGatewayLifecycleApplyTools(pi, {
    threadId: options.threadId,
    workspace: options.workspace,
    getThread: options.getThread,
    resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
    ...gatewayLifecycle,
  });
}
