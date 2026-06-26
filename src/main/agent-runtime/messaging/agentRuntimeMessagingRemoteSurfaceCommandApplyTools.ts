import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { MessagingBindingDescriptor, MessagingBindingListResult, RuntimeSurfaceSnapshot } from "../../../shared/messagingGateway";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import { messagingGatewayToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import type { MessagingRemoteSurfaceCommandBindingUpdate, MessagingRemoteSurfaceCommandPreview } from "../agentRuntimeMessagingFacade";
import {
  messagingRemoteSurfaceCommandApplyBindingPlan,
  messagingRemoteSurfaceCommandApplyBindingUpdates,
  messagingRemoteSurfaceCommandApplyCreatedResources,
  messagingRemoteSurfaceCommandApplyCreatePlan,
  type MessagingRemoteSurfaceCommandApplyCreatedResourcesOptions,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyBinding";
import {
  messagingRemoteSurfaceCommandApplyPreflight,
  type MessagingRemoteSurfaceCommandApplyPermissionRequest,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyPreflight";
import {
  messagingRemoteSurfaceCommandApplyProjectSwitch,
  messagingRemoteSurfaceCommandProjectSwitchPlan,
  type MessagingRemoteSurfaceCommandProjectSwitchApplyOptions,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyProjectSwitch";
import {
  messagingRemoteSurfaceCommandApplyResultOptions,
  messagingRemoteSurfaceCommandApplyResultResponse,
  messagingRemoteSurfaceCommandApplyToolResponse,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyResult";
import {
  messagingRemoteSurfaceCommandApplyRuntimeSideEffects,
  messagingRemoteSurfaceCommandApplySideEffectPlan,
  type MessagingRemoteSurfaceCommandApplyRuntimeSideEffectsOptions,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplySideEffects";
import {
  messagingRemoteSurfaceCommandApplySettingUpdate,
  type MessagingRemoteSurfaceCommandSettingUpdateApplyOptions,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplySettings";
import {
  messagingRemoteSurfaceCommandApplyWorkflowAction,
  type MessagingRemoteSurfaceCommandWorkflowActionApplyOptions,
} from "./agentRuntimeMessagingRemoteSurfaceCommandApplyWorkflowActions";

export * from "./agentRuntimeMessagingRemoteSurfaceCommandApplyBinding";
export * from "./agentRuntimeMessagingRemoteSurfaceCommandApplyPreflight";
export * from "./agentRuntimeMessagingRemoteSurfaceCommandApplyProjectSwitch";
export * from "./agentRuntimeMessagingRemoteSurfaceCommandApplyResult";
export * from "./agentRuntimeMessagingRemoteSurfaceCommandApplySideEffects";
export * from "./agentRuntimeMessagingRemoteSurfaceCommandApplySettings";
export * from "./agentRuntimeMessagingRemoteSurfaceCommandApplyWorkflowActions";

export interface MessagingRemoteSurfaceCommandApplyToolRegistrationOptions {
  applyForParams: (params: unknown) => Promise<any>;
}

export interface MessagingRemoteSurfaceCommandApplyBindingsLike {
  list(input: { includeInactive: false }): MessagingBindingListResult;
  updateRemoteSurfaceScope(update: MessagingRemoteSurfaceCommandBindingUpdate): MessagingBindingDescriptor | undefined;
}

export interface MessagingRemoteSurfaceCommandApplyResolverOptions<TPermissionGrant = unknown> {
  previewForParams: (params: unknown) => MessagingRemoteSurfaceCommandPreview;
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (
    request: MessagingRemoteSurfaceCommandApplyPermissionRequest<ThreadSummary, WorkspaceState>,
  ) => Promise<boolean> | boolean;
  bindings: MessagingRemoteSurfaceCommandApplyBindingsLike;
  runtimeSurfaceSnapshot: () => RuntimeSurfaceSnapshot;
  isRunActive: () => boolean;
  createProject?: MessagingRemoteSurfaceCommandApplyCreatedResourcesOptions["createProject"];
  createChatThread: MessagingRemoteSurfaceCommandApplyCreatedResourcesOptions["createChatThread"];
  createWorkflowAgentThreadSummary: MessagingRemoteSurfaceCommandApplyCreatedResourcesOptions["createWorkflowAgentThreadSummary"];
  switchProjectAvailable: () => boolean;
  recordRuntimeEvent: MessagingRemoteSurfaceCommandProjectSwitchApplyOptions["recordRuntimeEvent"];
  storePendingProjectSwitch: MessagingRemoteSurfaceCommandProjectSwitchApplyOptions["storePendingProjectSwitch"];
  completeProjectSwitch: MessagingRemoteSurfaceCommandProjectSwitchApplyOptions["completeProjectSwitch"];
  answerWorkflowDiscoveryQuestion: MessagingRemoteSurfaceCommandApplyRuntimeSideEffectsOptions<TPermissionGrant>["answerWorkflowDiscoveryQuestion"];
  getWorkflowDiscoveryQuestion: MessagingRemoteSurfaceCommandApplyRuntimeSideEffectsOptions<TPermissionGrant>["getWorkflowDiscoveryQuestion"];
  getWorkflowThreadSummary: MessagingRemoteSurfaceCommandWorkflowActionApplyOptions["getWorkflowThreadSummary"];
  workflowAgents: MessagingRemoteSurfaceCommandWorkflowActionApplyOptions["workflowAgents"];
  onWorkflowUpdated: MessagingRemoteSurfaceCommandWorkflowActionApplyOptions["onWorkflowUpdated"];
  updateThreadSettings: MessagingRemoteSurfaceCommandSettingUpdateApplyOptions["updateThreadSettings"];
  onThreadUpdated: MessagingRemoteSurfaceCommandSettingUpdateApplyOptions["onThreadUpdated"];
  voice: MessagingRemoteSurfaceCommandSettingUpdateApplyOptions["voice"];
  stt: MessagingRemoteSurfaceCommandSettingUpdateApplyOptions["stt"];
  listSttProviders: MessagingRemoteSurfaceCommandSettingUpdateApplyOptions["listSttProviders"];
  media: MessagingRemoteSurfaceCommandSettingUpdateApplyOptions["media"];
  planner: MessagingRemoteSurfaceCommandSettingUpdateApplyOptions["planner"];
  search: MessagingRemoteSurfaceCommandSettingUpdateApplyOptions["search"];
  discoverAmbientCliPackages: MessagingRemoteSurfaceCommandSettingUpdateApplyOptions["discoverAmbientCliPackages"];
  respondToPermissionPrompt?: MessagingRemoteSurfaceCommandApplyRuntimeSideEffectsOptions<TPermissionGrant>["respondToPermissionPrompt"];
  revokePermissionGrant: MessagingRemoteSurfaceCommandApplyRuntimeSideEffectsOptions<TPermissionGrant>["revokePermissionGrant"];
  onPermissionGrantRevoked: MessagingRemoteSurfaceCommandApplyRuntimeSideEffectsOptions<TPermissionGrant>["onPermissionGrantRevoked"];
  now?: () => string;
}

export function registerMessagingRemoteSurfaceCommandApplyTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: MessagingRemoteSurfaceCommandApplyToolRegistrationOptions,
): void {
  const { applyForParams } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_remote_surface_command_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params): Promise<any> => applyForParams(params),
  });
}

export function createMessagingRemoteSurfaceCommandApplyResolver<TPermissionGrant = unknown>(
  options: MessagingRemoteSurfaceCommandApplyResolverOptions<TPermissionGrant>,
): (params: unknown) => Promise<ReturnType<typeof messagingRemoteSurfaceCommandApplyToolResponse>> {
  return async (params) => {
    const preview = options.previewForParams(params);
    const preflight = await messagingRemoteSurfaceCommandApplyPreflight({
      preview,
      getThread: () => options.getThread(options.threadId),
      workspace: options.workspace,
      resolveFirstPartyPluginPermission: options.resolveFirstPartyPluginPermission,
    });
    if (preflight.status !== "ready") return preflight.response;
    const { approvalRecorded } = preflight;
    const createPlan = messagingRemoteSurfaceCommandApplyCreatePlan(preview);
    const createdResourceRefs = await messagingRemoteSurfaceCommandApplyCreatedResources({
      createPlan,
      defaultProjectPath: options.workspace.path,
      ...(options.createProject ? { createProject: options.createProject } : {}),
      createChatThread: options.createChatThread,
      createWorkflowAgentThreadSummary: options.createWorkflowAgentThreadSummary,
    });
    const projectSwitchPlan = messagingRemoteSurfaceCommandProjectSwitchPlan({
      preview,
      threadId: options.threadId,
      switchProjectAvailable: options.switchProjectAvailable(),
      deferProjectSwitch: options.isRunActive(),
      failedAt: (options.now ?? (() => new Date().toISOString()))(),
    });
    const bindingPlan = messagingRemoteSurfaceCommandApplyBindingPlan({
      preview,
      ...createdResourceRefs,
    });
    const appliedProjectSwitch = await messagingRemoteSurfaceCommandApplyProjectSwitch({
      projectSwitchPlan,
      recordRuntimeEvent: options.recordRuntimeEvent,
      storePendingProjectSwitch: options.storePendingProjectSwitch,
      completeProjectSwitch: options.completeProjectSwitch,
    });
    const updatedBinding = messagingRemoteSurfaceCommandApplyBindingUpdates({
      bindingPlan,
      updateRemoteSurfaceScope: (update) => options.bindings.updateRemoteSurfaceScope(update),
    });
    const sideEffectPlan = messagingRemoteSurfaceCommandApplySideEffectPlan(preview);
    const appliedRuntimeSideEffects = await messagingRemoteSurfaceCommandApplyRuntimeSideEffects<TPermissionGrant>({
      sideEffectPlan,
      answerWorkflowDiscoveryQuestion: options.answerWorkflowDiscoveryQuestion,
      getWorkflowDiscoveryQuestion: options.getWorkflowDiscoveryQuestion,
      applyWorkflowAction: (input) =>
        messagingRemoteSurfaceCommandApplyWorkflowAction({
          input,
          getWorkflowThreadSummary: options.getWorkflowThreadSummary,
          workflowAgents: options.workflowAgents,
          onWorkflowUpdated: options.onWorkflowUpdated,
        }),
      applySettingUpdate: (input) =>
        messagingRemoteSurfaceCommandApplySettingUpdate({
          input,
          threadId: options.threadId,
          workspacePath: options.workspace.path,
          getThread: options.getThread,
          updateThreadSettings: options.updateThreadSettings,
          onThreadUpdated: options.onThreadUpdated,
          voice: options.voice,
          stt: options.stt,
          listSttProviders: options.listSttProviders,
          media: options.media,
          planner: options.planner,
          search: options.search,
          discoverAmbientCliPackages: options.discoverAmbientCliPackages,
        }),
      ...(options.respondToPermissionPrompt ? { respondToPermissionPrompt: options.respondToPermissionPrompt } : {}),
      revokePermissionGrant: options.revokePermissionGrant,
      onPermissionGrantRevoked: options.onPermissionGrantRevoked,
    });
    const refreshedSurface = options.runtimeSurfaceSnapshot();
    return messagingRemoteSurfaceCommandApplyResultResponse(
      messagingRemoteSurfaceCommandApplyResultOptions({
        preview,
        bindings: options.bindings.list({ includeInactive: false }),
        surface: refreshedSurface,
        approvalRecorded,
        ...(updatedBinding ? { updatedBinding } : {}),
        ...appliedProjectSwitch,
        ...createdResourceRefs,
        ...appliedRuntimeSideEffects,
      }),
    );
  };
}
