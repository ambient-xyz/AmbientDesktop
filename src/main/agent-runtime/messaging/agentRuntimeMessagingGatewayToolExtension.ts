import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
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
  AgentRuntimeMessagingGatewayToolExtensionOptions,
  AgentRuntimeMessagingRuntimeBridgeInput,
  AgentRuntimeMessagingRuntimeBridgeOptions,
} from "./agentRuntimeMessagingGatewayToolExtensionTypes";

export type {
  AgentRuntimeMessagingFirstPartyPermissionRequest,
  AgentRuntimeMessagingGatewayToolExtensionOptions,
  AgentRuntimeMessagingRuntimeBridgeInput,
} from "./agentRuntimeMessagingGatewayToolExtensionTypes";

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
