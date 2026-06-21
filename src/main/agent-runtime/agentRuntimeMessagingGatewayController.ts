import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PermissionRequest } from "../../shared/permissionTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { answerWorkflowDiscoveryQuestion } from "./agentRuntimeWorkflowDiscoveryFacade";
import {
  createAgentRuntimeMessagingGatewayToolExtension,
  createAgentRuntimeMessagingRuntimeBridge,
  type AgentRuntimeMessagingFirstPartyPermissionRequest,
  type AgentRuntimeMessagingGatewayToolExtensionOptions,
  type AgentRuntimeMessagingRuntimeBridgeInput,
} from "./messaging/agentRuntimeMessagingGatewayToolExtension";

export interface AgentRuntimeMessagingGatewayControllerOptions {
  store: ProjectStore;
  remoteSurfaceRuntimeEvents: AgentRuntimeMessagingRuntimeBridgeInput["remoteSurfaceRuntimeEvents"];
  activeRuns: AgentRuntimeMessagingRuntimeBridgeInput["activeRuns"];
  pendingProjectSwitchByThreadId: AgentRuntimeMessagingRuntimeBridgeInput["pendingProjectSwitchByThreadId"];
  completePendingProjectSwitch: AgentRuntimeMessagingRuntimeBridgeInput["completePendingProjectSwitch"];
  readVoiceSettings?: AgentRuntimeMessagingGatewayToolExtensionOptions["readVoiceSettings"];
  readSttSettings?: AgentRuntimeMessagingGatewayToolExtensionOptions["readSttSettings"];
  readSearchSettings?: AgentRuntimeMessagingGatewayToolExtensionOptions["readSearchSettings"];
  readMediaSettings?: AgentRuntimeMessagingGatewayToolExtensionOptions["readMediaSettings"];
  readPlannerSettings?: AgentRuntimeMessagingGatewayToolExtensionOptions["readPlannerSettings"];
  listPermissionRequests: () => PermissionRequest[];
  workflowRecoveryEvents: AgentRuntimeMessagingGatewayToolExtensionOptions["workflowRecoveryEvents"];
  listProjects?: AgentRuntimeMessagingGatewayToolExtensionOptions["listProjects"];
  resolveFirstPartyPluginPermission: (input: AgentRuntimeMessagingFirstPartyPermissionRequest) => Promise<boolean>;
  secureInputs: AgentRuntimeMessagingGatewayToolExtensionOptions["secureInputs"];
  createProject?: AgentRuntimeMessagingGatewayToolExtensionOptions["createProject"];
  switchProjectAvailable: AgentRuntimeMessagingGatewayToolExtensionOptions["switchProjectAvailable"];
  workflowAgents: AgentRuntimeMessagingGatewayToolExtensionOptions["workflowAgents"];
  emit: (event: DesktopEvent) => void;
  voice: AgentRuntimeMessagingGatewayToolExtensionOptions["voice"];
  stt: AgentRuntimeMessagingGatewayToolExtensionOptions["stt"];
  listSttProviders: AgentRuntimeMessagingGatewayToolExtensionOptions["listSttProviders"];
  media: AgentRuntimeMessagingGatewayToolExtensionOptions["media"];
  planner: AgentRuntimeMessagingGatewayToolExtensionOptions["planner"];
  search: AgentRuntimeMessagingGatewayToolExtensionOptions["search"];
  respondToPermissionPrompt?: AgentRuntimeMessagingGatewayToolExtensionOptions["respondToPermissionPrompt"];
}

export class AgentRuntimeMessagingGatewayController {
  constructor(private readonly options: AgentRuntimeMessagingGatewayControllerOptions) {}

  createMessagingGatewayToolExtension(threadId: string, workspace: WorkspaceState): ExtensionFactory {
    return createAgentRuntimeMessagingGatewayToolExtension({
      threadId,
      workspace,
      getThread: (id) => this.options.store.getThread(id),
      listThreads: () => this.options.store.listThreads(),
      listWorkflowAgentFolders: () => this.options.store.listWorkflowAgentFolders(),
      ...(this.options.readVoiceSettings ? { readVoiceSettings: this.options.readVoiceSettings } : {}),
      ...(this.options.readSttSettings ? { readSttSettings: this.options.readSttSettings } : {}),
      ...(this.options.readSearchSettings ? { readSearchSettings: this.options.readSearchSettings } : {}),
      ...(this.options.readMediaSettings ? { readMediaSettings: this.options.readMediaSettings } : {}),
      ...(this.options.readPlannerSettings ? { readPlannerSettings: this.options.readPlannerSettings } : {}),
      listPermissionRequests: () => this.options.listPermissionRequests(),
      listPermissionGrants: () => this.options.store.listPermissionGrants(),
      listPermissionAudit: (limit) => this.options.store.listPermissionAudit(limit),
      workflowRecoveryEvents: () => this.options.workflowRecoveryEvents(),
      ...(this.options.listProjects ? { listProjects: this.options.listProjects } : {}),
      resolveFirstPartyPluginPermission: (input) => this.options.resolveFirstPartyPluginPermission(input),
      secureInputs: this.options.secureInputs,
      ...createAgentRuntimeMessagingRuntimeBridge({
        threadId,
        workspacePath: workspace.path,
        remoteSurfaceRuntimeEvents: this.options.remoteSurfaceRuntimeEvents,
        activeRuns: this.options.activeRuns,
        pendingProjectSwitchByThreadId: this.options.pendingProjectSwitchByThreadId,
        completePendingProjectSwitch: this.options.completePendingProjectSwitch,
      }),
      ...(this.options.createProject ? { createProject: this.options.createProject } : {}),
      createChatThread: (title, workspacePath) => this.options.store.createThread(title, workspacePath),
      createWorkflowAgentThreadSummary: (input) => this.options.store.createWorkflowAgentThreadSummary(input),
      switchProjectAvailable: () => this.options.switchProjectAvailable(),
      answerWorkflowDiscoveryQuestion: (input) => answerWorkflowDiscoveryQuestion(this.options.store, input),
      getWorkflowDiscoveryQuestion: (questionId) => this.options.store.getWorkflowDiscoveryQuestion(questionId),
      getWorkflowThreadSummary: (workflowThreadId) => this.options.store.getWorkflowAgentThreadSummary(workflowThreadId),
      workflowAgents: this.options.workflowAgents,
      emit: (event) => this.options.emit(event),
      updateThreadSettings: (id, next) => this.options.store.updateThreadSettings(id, next),
      voice: this.options.voice,
      stt: this.options.stt,
      listSttProviders: this.options.listSttProviders,
      media: this.options.media,
      planner: this.options.planner,
      search: this.options.search,
      ...(this.options.respondToPermissionPrompt ? {
        respondToPermissionPrompt: this.options.respondToPermissionPrompt,
      } : {}),
      revokePermissionGrant: (grantId) => this.options.store.revokePermissionGrant(grantId),
    });
  }
}
