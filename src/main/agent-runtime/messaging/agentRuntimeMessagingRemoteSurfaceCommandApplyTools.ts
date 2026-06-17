import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  MessagingBindingDescriptor,
  MessagingBindingListResult,
  MessagingGatewayRemoteSurfaceRuntimeEvent,
  RuntimeSurfaceSnapshot,
} from "../../../shared/messagingGateway";
import type {
  AnswerWorkflowDiscoveryQuestionInput,
  CollaborationMode,
  MediaPlaybackSettings,
  PlannerSettings,
  SearchRoutingSettings,
  SttProviderCandidate,
  SttSettings,
  ThinkingLevel,
  ThreadSummary,
  UpdateMediaPlaybackSettingsInput,
  UpdatePlannerSettingsInput,
  UpdateSttSettingsInput,
  UpdateVoiceSettingsInput,
  VoiceSettings,
  VoiceSettingsAuditSource,
  WorkspaceState,
  WorkflowDiscoveryQuestion,
} from "../../../shared/types";
import type {
  AmbientCliPackageCatalog,
  DiscoverAmbientCliPackagesOptions,
} from "../../ambientCliPackages";
import { messagingGatewayToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import {
  messagingRemoteSurfaceCommandAppliedResult,
  messagingRemoteSurfaceCommandApprovalDetail,
  messagingRemoteSurfaceCommandApprovalResponse,
  messagingRemoteSurfaceCommandBindingUpdate,
  messagingRemoteSurfaceCommandBlockedResult,
  messagingRemoteSurfaceCommandChatCreateTitle,
  messagingRemoteSurfaceCommandDeniedResult,
  messagingRemoteSurfaceCommandGrantRevokeRequest,
  messagingRemoteSurfaceCommandProjectCreateRequest,
  messagingRemoteSurfaceCommandResultProjection,
  messagingRemoteSurfaceCommandResultText,
  messagingRemoteSurfaceCommandSettingUpdateRequest,
  messagingRemoteSurfaceCommandWorkflowActionRequest,
  messagingRemoteSurfaceCommandWorkflowAnswerInput,
  messagingRemoteSurfaceCommandWorkflowCreateRequest,
  type MessagingRemoteSurfaceCommandBindingUpdate,
  type MessagingRemoteSurfaceCommandPreview,
  type MessagingRemoteSurfaceCommandResult,
  type MessagingRemoteSurfaceSettingUpdateRequest,
  type MessagingRemoteSurfaceSettingUpdateResult,
  type MessagingRemoteSurfaceWorkflowActionRequest,
  type MessagingRemoteSurfaceWorkflowActionResult,
} from "../../messagingRemoteSurfaceCommands";
import {
  planSearchPreferenceUpdate,
  searchPreferenceUpdateText,
  type SearchPreferenceUpdateInput,
} from "../../searchSettingsTools";
import {
  planSttPolicyUpdate,
  sttPolicyNoopText,
  sttPolicyText,
  type SttPolicyInput,
} from "../../sttSettingsTools";
import {
  planVoicePolicyUpdate,
  voicePolicyNoopText,
  voicePolicyText,
  type VoicePolicyInput,
} from "../../voiceSettingsTools";

export interface MessagingRemoteSurfaceCommandApplyToolRegistrationOptions {
  applyForParams: (params: unknown) => Promise<any>;
}

export interface MessagingRemoteSurfaceCommandApplyPermissionRequest<TThread, TWorkspace> {
  thread: TThread;
  workspace: TWorkspace;
  toolName: "ambient_messaging_remote_surface_command_apply";
  title: string;
  message: string;
  detail: string;
  risk: "plugin-tool";
  reusableScopes: ["thread"];
  grantTargetLabel: string;
  grantTargetIdentity: string;
  allowedReason: string;
  deniedReason: string;
}

export type MessagingRemoteSurfaceCommandApplyPreflightResult =
  | {
    status: "blocked" | "denied";
    approvalRecorded: false;
    response: ReturnType<typeof messagingRemoteSurfaceCommandApplyToolResponse>;
  }
  | {
    status: "ready";
    approvalRecorded: boolean;
  };

export interface MessagingRemoteSurfaceCommandApplyPreflightOptions<TThread, TWorkspace> {
  preview: MessagingRemoteSurfaceCommandPreview;
  getThread: () => TThread;
  workspace: TWorkspace;
  resolveFirstPartyPluginPermission: (
    request: MessagingRemoteSurfaceCommandApplyPermissionRequest<TThread, TWorkspace>
  ) => Promise<boolean> | boolean;
}

export interface MessagingRemoteSurfaceCommandApplyResultResponseOptions {
  preview: MessagingRemoteSurfaceCommandPreview;
  approvalRecorded: boolean;
  bindings: MessagingBindingListResult;
  surface: RuntimeSurfaceSnapshot;
  updatedBinding?: MessagingBindingDescriptor;
  scheduledProjectSwitch?: RuntimeSurfaceSnapshot["projects"][number];
  completedProjectSwitch?: RuntimeSurfaceSnapshot["projects"][number];
  createdProjectPath?: string;
  createdChatThreadId?: string;
  createdWorkflowThreadId?: string;
  answeredQuestion?: MessagingRemoteSurfaceCommandResult["answeredQuestion"];
  workflowAnswerResult?: unknown;
  workflowActionResult?: MessagingRemoteSurfaceCommandResult["workflowActionResult"];
  approvalResponse?: MessagingRemoteSurfaceCommandResult["respondedApproval"];
  grantRevoke?: MessagingRemoteSurfaceCommandResult["revokedPermissionGrant"];
  updatedSetting?: MessagingRemoteSurfaceCommandResult["updatedSetting"];
}

export interface MessagingRemoteSurfaceCommandApplyResultOptionsInput {
  preview: MessagingRemoteSurfaceCommandPreview;
  approvalRecorded: boolean;
  bindings: MessagingBindingListResult;
  surface: RuntimeSurfaceSnapshot;
  updatedBinding?: MessagingBindingDescriptor;
  completedProjectSwitch?: RuntimeSurfaceSnapshot["projects"][number];
  createdProjectPath?: string;
  createdChatThreadId?: string;
  createdWorkflowThreadId?: string;
  answeredQuestion?: MessagingRemoteSurfaceCommandResult["answeredQuestion"];
  workflowAnswerResult?: unknown;
  workflowActionResult?: MessagingRemoteSurfaceCommandResult["workflowActionResult"];
  approvalResponse?: MessagingRemoteSurfaceCommandResult["respondedApproval"];
  grantRevoke?: MessagingRemoteSurfaceCommandResult["revokedPermissionGrant"];
  updatedSetting?: MessagingRemoteSurfaceCommandResult["updatedSetting"];
}

export interface MessagingRemoteSurfaceCommandCreatedScopeBindingUpdateOptions {
  preview: MessagingRemoteSurfaceCommandPreview;
  createdProjectPath?: string;
  createdChatThreadId?: string;
  createdWorkflowThreadId?: string;
}

export interface MessagingRemoteSurfaceCommandCreatedResourceRefsInput {
  createdProject?: { path: string };
  createdChatThread?: { id: string };
  createdWorkflowThread?: { id: string };
}

export interface MessagingRemoteSurfaceCommandCreatedResourceRefs {
  createdProjectPath?: string;
  createdChatThreadId?: string;
  createdWorkflowThreadId?: string;
}

export interface MessagingRemoteSurfaceCommandApplyBindingPlan {
  initialBindingUpdate?: MessagingRemoteSurfaceCommandBindingUpdate;
  createdScopeBindingUpdates: MessagingRemoteSurfaceCommandBindingUpdate[];
}

export interface MessagingRemoteSurfaceCommandApplyBindingUpdatesOptions {
  bindingPlan: MessagingRemoteSurfaceCommandApplyBindingPlan;
  updateRemoteSurfaceScope: (
    update: MessagingRemoteSurfaceCommandBindingUpdate
  ) => MessagingBindingDescriptor | undefined;
}

export interface MessagingRemoteSurfaceCommandPendingProjectSwitchPlan {
  workspacePath: string;
  reason: string;
  projectName?: string;
}

export interface MessagingRemoteSurfaceCommandPendingProjectSwitch
  extends MessagingRemoteSurfaceCommandPendingProjectSwitchPlan {
  runtimeEventId: string;
}

export interface MessagingRemoteSurfaceCommandPendingProjectSwitchCompletionOptions {
  projectSwitch: MessagingRemoteSurfaceCommandPendingProjectSwitch;
  switchProject?: (input: { workspacePath: string; reason: string }) => Promise<void> | void;
  updateRuntimeEvent: (eventId: string, patch: RemoteSurfaceRuntimeEventPatchInput) => void;
  emitError?: (input: { message: string; threadId: string; workspacePath: string }) => void;
  threadId?: string;
  workspacePath?: string;
  throwOnFailure?: boolean;
  now?: () => string;
}

export interface MessagingRemoteSurfaceCommandPendingProjectSwitchAfterRunOptions {
  projectSwitch?: MessagingRemoteSurfaceCommandPendingProjectSwitch;
  shouldEmitQueueClear: boolean;
  updateRuntimeEvent: (eventId: string, patch: RemoteSurfaceRuntimeEventPatchInput) => void;
  scheduleCompletion: (projectSwitch: MessagingRemoteSurfaceCommandPendingProjectSwitch) => void;
  now?: () => string;
}

export type MessagingRemoteSurfaceCommandPendingProjectSwitchAfterRunResult =
  | "none"
  | "canceled"
  | "scheduled";

export type MessagingRemoteSurfaceCommandProjectSwitchPlan =
  | { status: "none" }
  | {
    status: "unavailable";
    message: string;
    event: RemoteSurfaceRuntimeEventCreateInput;
  }
  | {
    status: "pending";
    deferProjectSwitch: boolean;
    event: RemoteSurfaceRuntimeEventCreateInput;
    targetProject: RuntimeSurfaceSnapshot["projects"][number];
    projectSwitch: MessagingRemoteSurfaceCommandPendingProjectSwitchPlan;
  };

export interface MessagingRemoteSurfaceCommandProjectSwitchPlanOptions {
  preview: MessagingRemoteSurfaceCommandPreview;
  threadId: string;
  switchProjectAvailable: boolean;
  deferProjectSwitch: boolean;
  failedAt: string;
}

export interface MessagingRemoteSurfaceCommandProjectSwitchApplyOptions {
  projectSwitchPlan: MessagingRemoteSurfaceCommandProjectSwitchPlan;
  recordRuntimeEvent: (
    input: RemoteSurfaceRuntimeEventCreateInput
  ) => Pick<MessagingGatewayRemoteSurfaceRuntimeEvent, "id">;
  storePendingProjectSwitch: (
    projectSwitch: MessagingRemoteSurfaceCommandPendingProjectSwitch
  ) => void;
  completeProjectSwitch: (
    projectSwitch: MessagingRemoteSurfaceCommandPendingProjectSwitch
  ) => Promise<unknown> | unknown;
}

export interface MessagingRemoteSurfaceCommandProjectSwitchApplyResult {
  completedProjectSwitch?: RuntimeSurfaceSnapshot["projects"][number];
}

export interface MessagingRemoteSurfaceCommandApplyCreatePlan {
  projectCreateRequest?: NonNullable<ReturnType<typeof messagingRemoteSurfaceCommandProjectCreateRequest>>;
  createChatTitle?: NonNullable<ReturnType<typeof messagingRemoteSurfaceCommandChatCreateTitle>>;
  workflowCreateRequest?: NonNullable<ReturnType<typeof messagingRemoteSurfaceCommandWorkflowCreateRequest>>;
}

export interface MessagingRemoteSurfaceCommandApplyCreatedResourcesOptions {
  createPlan: MessagingRemoteSurfaceCommandApplyCreatePlan;
  defaultProjectPath: string;
  createProject?: (
    input: NonNullable<MessagingRemoteSurfaceCommandApplyCreatePlan["projectCreateRequest"]>
  ) => Promise<{ path: string }> | { path: string };
  createChatThread: (title: string, workspacePath: string) => { id: string };
  createWorkflowAgentThreadSummary: (
    input: MessagingRemoteSurfaceCommandWorkflowThreadCreateSummaryInput
  ) => { id: string };
}

export interface MessagingRemoteSurfaceCommandWorkflowThreadCreateSummaryInput {
  title?: string;
  initialRequest: string;
  projectPath: string;
  traceMode: "production";
  phase: "discovery";
}

export interface MessagingRemoteSurfaceCommandApplySideEffectPlan {
  workflowAnswerInput?: NonNullable<ReturnType<typeof messagingRemoteSurfaceCommandWorkflowAnswerInput>>;
  workflowActionRequest?: NonNullable<ReturnType<typeof messagingRemoteSurfaceCommandWorkflowActionRequest>>;
  approvalResponse?: NonNullable<ReturnType<typeof messagingRemoteSurfaceCommandApprovalResponse>>;
  grantRevoke?: NonNullable<ReturnType<typeof messagingRemoteSurfaceCommandGrantRevokeRequest>>;
  settingUpdateRequest?: NonNullable<ReturnType<typeof messagingRemoteSurfaceCommandSettingUpdateRequest>>;
}

export interface MessagingRemoteSurfaceCommandApplyRuntimeSideEffectsOptions<TPermissionGrant = unknown> {
  sideEffectPlan: MessagingRemoteSurfaceCommandApplySideEffectPlan;
  answerWorkflowDiscoveryQuestion: (input: AnswerWorkflowDiscoveryQuestionInput) => Promise<unknown> | unknown;
  getWorkflowDiscoveryQuestion: (questionId: string) => WorkflowDiscoveryQuestion | undefined;
  applyWorkflowAction: (
    input: MessagingRemoteSurfaceWorkflowActionRequest
  ) => Promise<MessagingRemoteSurfaceWorkflowActionResult> | MessagingRemoteSurfaceWorkflowActionResult;
  applySettingUpdate: (
    input: MessagingRemoteSurfaceSettingUpdateRequest
  ) => Promise<MessagingRemoteSurfaceSettingUpdateResult> | MessagingRemoteSurfaceSettingUpdateResult;
  respondToPermissionPrompt?: (
    requestId: string,
    response: NonNullable<MessagingRemoteSurfaceCommandResult["respondedApproval"]>["response"],
  ) => void;
  revokePermissionGrant: (grantId: string) => TPermissionGrant;
  onPermissionGrantRevoked: (grant: TPermissionGrant) => void;
}

export interface MessagingRemoteSurfaceCommandApplyRuntimeSideEffectsResult {
  answeredQuestion?: WorkflowDiscoveryQuestion;
  workflowAnswerResult?: unknown;
  workflowActionResult?: MessagingRemoteSurfaceCommandResult["workflowActionResult"];
  approvalResponse?: MessagingRemoteSurfaceCommandResult["respondedApproval"];
  grantRevoke?: MessagingRemoteSurfaceCommandResult["revokedPermissionGrant"];
  updatedSetting?: MessagingRemoteSurfaceCommandResult["updatedSetting"];
}

export interface MessagingRemoteSurfaceCommandWorkflowActionThreadSummary {
  id: string;
  title: string;
  phase: string;
}

export interface MessagingRemoteSurfaceCommandWorkflowActionAgents {
  runExploration?: (input: { workflowThreadId: string; reason: string }) => Promise<{
    thread: MessagingRemoteSurfaceCommandWorkflowActionThreadSummary;
    traceId?: string;
    graphSnapshotId?: string;
    text?: string;
  }>;
  compilePreview?: (input: { workflowThreadId: string; reason: string }) => Promise<{
    thread: MessagingRemoteSurfaceCommandWorkflowActionThreadSummary;
    artifactId?: string;
    runId?: string;
    text?: string;
  }>;
  reviewArtifact?: (input: {
    workflowThreadId: string;
    artifactId: string;
    decision: "approved" | "rejected";
    reason: string;
  }) => Promise<{
    thread: MessagingRemoteSurfaceCommandWorkflowActionThreadSummary;
    artifactId: string;
    artifactStatus: string;
    changed: boolean;
    text?: string;
  }>;
  recoverRun?: (input: {
    workflowThreadId: string;
    runId: string;
    eventId: string;
    action: NonNullable<MessagingRemoteSurfaceWorkflowActionRequest["recoveryAction"]>;
    graphNodeId?: string;
    itemKey?: string;
    reason: string;
  }) => Promise<{
    thread: MessagingRemoteSurfaceCommandWorkflowActionThreadSummary;
    runId: string;
    runStatus?: string;
    changed: boolean;
    text?: string;
  }>;
  cancelRun?: (input: { workflowThreadId: string; runId: string; reason: string }) => Promise<{
    thread: MessagingRemoteSurfaceCommandWorkflowActionThreadSummary;
    runId: string;
    runStatus?: string;
    changed: boolean;
    text?: string;
  }>;
}

export interface MessagingRemoteSurfaceCommandWorkflowActionApplyOptions {
  input: MessagingRemoteSurfaceWorkflowActionRequest;
  getWorkflowThreadSummary: (workflowThreadId: string) => MessagingRemoteSurfaceCommandWorkflowActionThreadSummary;
  workflowAgents?: MessagingRemoteSurfaceCommandWorkflowActionAgents;
  onWorkflowUpdated: () => void;
}

export interface MessagingRemoteSurfaceCommandSettingUpdateVoiceAuditContext {
  source: VoiceSettingsAuditSource;
  toolName?: string;
  threadId?: string;
  summary?: string;
}

export interface MessagingRemoteSurfaceCommandSettingUpdateApplyOptions {
  input: MessagingRemoteSurfaceSettingUpdateRequest;
  threadId: string;
  workspacePath: string;
  getThread: (threadId: string) => ThreadSummary;
  updateThreadSettings: (
    threadId: string,
    next: Partial<Pick<ThreadSummary, "collaborationMode" | "thinkingLevel">>,
  ) => ThreadSummary;
  onThreadUpdated: (thread: ThreadSummary) => void;
  voice?: {
    readSettings: () => VoiceSettings;
    updateSettings?: (
      input: UpdateVoiceSettingsInput,
      audit?: MessagingRemoteSurfaceCommandSettingUpdateVoiceAuditContext,
    ) => Promise<VoiceSettings> | VoiceSettings;
    onStateUpdated?: () => void;
  };
  stt?: {
    readSettings: () => SttSettings;
    updateSettings?: (input: UpdateSttSettingsInput) => Promise<SttSettings> | SttSettings;
  };
  listSttProviders: (workspacePath: string) => Promise<SttProviderCandidate[]> | SttProviderCandidate[];
  media?: {
    readSettings: () => MediaPlaybackSettings;
    updateSettings?: (input: UpdateMediaPlaybackSettingsInput) => Promise<MediaPlaybackSettings> | MediaPlaybackSettings;
  };
  planner?: {
    readSettings?: () => PlannerSettings;
    updateSettings?: (input: UpdatePlannerSettingsInput) => Promise<PlannerSettings> | PlannerSettings;
  };
  search?: {
    readSettings: () => SearchRoutingSettings;
    updateSettings?: (input: SearchRoutingSettings) => Promise<SearchRoutingSettings> | SearchRoutingSettings;
  };
  discoverAmbientCliPackages: (
    workspacePath: string,
    options?: DiscoverAmbientCliPackagesOptions,
  ) => Promise<AmbientCliPackageCatalog>;
}

type RemoteSurfaceRuntimeEventCreateInput =
  Omit<MessagingGatewayRemoteSurfaceRuntimeEvent, "id" | "scheduledAt"> & { scheduledAt?: string };
type RemoteSurfaceRuntimeEventPatchInput =
  Partial<Omit<MessagingGatewayRemoteSurfaceRuntimeEvent, "id" | "kind" | "scheduledAt">>;

export interface MessagingRemoteSurfaceCommandApplyBindingsLike {
  list(input: { includeInactive: false }): MessagingBindingListResult;
  updateRemoteSurfaceScope(
    update: MessagingRemoteSurfaceCommandBindingUpdate
  ): MessagingBindingDescriptor | undefined;
}

export interface MessagingRemoteSurfaceCommandApplyResolverOptions<TPermissionGrant = unknown> {
  previewForParams: (params: unknown) => MessagingRemoteSurfaceCommandPreview;
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (
    request: MessagingRemoteSurfaceCommandApplyPermissionRequest<ThreadSummary, WorkspaceState>
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
      applyWorkflowAction: (input) => messagingRemoteSurfaceCommandApplyWorkflowAction({
        input,
        getWorkflowThreadSummary: options.getWorkflowThreadSummary,
        workflowAgents: options.workflowAgents,
        onWorkflowUpdated: options.onWorkflowUpdated,
      }),
      applySettingUpdate: (input) => messagingRemoteSurfaceCommandApplySettingUpdate({
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
    return messagingRemoteSurfaceCommandApplyResultResponse(messagingRemoteSurfaceCommandApplyResultOptions({
      preview,
      bindings: options.bindings.list({ includeInactive: false }),
      surface: refreshedSurface,
      approvalRecorded,
      ...(updatedBinding ? { updatedBinding } : {}),
      ...appliedProjectSwitch,
      ...createdResourceRefs,
      ...appliedRuntimeSideEffects,
    }));
  };
}

export async function messagingRemoteSurfaceCommandApplyPreflight<TThread, TWorkspace>(
  input: MessagingRemoteSurfaceCommandApplyPreflightOptions<TThread, TWorkspace>,
): Promise<MessagingRemoteSurfaceCommandApplyPreflightResult> {
  const { preview } = input;
  if (!preview.canApplyNow) {
    const result = messagingRemoteSurfaceCommandBlockedResult(preview);
    return {
      status: "blocked",
      approvalRecorded: false,
      response: messagingRemoteSurfaceCommandApplyToolResponse(result),
    };
  }
  if (!preview.approvalRequired) {
    return {
      status: "ready",
      approvalRecorded: false,
    };
  }
  const allowed = await input.resolveFirstPartyPluginPermission(messagingRemoteSurfaceCommandApplyPermissionRequest({
    thread: input.getThread(),
    workspace: input.workspace,
    preview,
  }));
  if (!allowed) {
    const result = messagingRemoteSurfaceCommandDeniedResult(preview);
    return {
      status: "denied",
      approvalRecorded: false,
      response: messagingRemoteSurfaceCommandApplyToolResponse(result),
    };
  }
  return {
    status: "ready",
    approvalRecorded: true,
  };
}

export function messagingRemoteSurfaceCommandProjectSwitchPlan(
  input: MessagingRemoteSurfaceCommandProjectSwitchPlanOptions,
): MessagingRemoteSurfaceCommandProjectSwitchPlan {
  const { preview } = input;
  if (preview.commandKind !== "switch_project" || !preview.targetProject) return { status: "none" };
  if (!input.switchProjectAvailable) {
    const message = "Ambient active project switching is not available in this runtime.";
    return {
      status: "unavailable",
      message,
      event: messagingRemoteSurfaceCommandSwitchProjectUnavailableEvent({
        preview,
        threadId: input.threadId,
        message,
        failedAt: input.failedAt,
      }),
    };
  }
  return {
    status: "pending",
    deferProjectSwitch: input.deferProjectSwitch,
    event: messagingRemoteSurfaceCommandSwitchProjectPendingEvent({
      preview,
      threadId: input.threadId,
      deferProjectSwitch: input.deferProjectSwitch,
    }),
    targetProject: preview.targetProject,
    projectSwitch: {
      workspacePath: preview.targetProject.path,
      reason: `remote-surface-command:${preview.commandKind}`,
      projectName: preview.targetProject.name,
    },
  };
}

export async function messagingRemoteSurfaceCommandApplyProjectSwitch(
  input: MessagingRemoteSurfaceCommandProjectSwitchApplyOptions,
): Promise<MessagingRemoteSurfaceCommandProjectSwitchApplyResult> {
  const { projectSwitchPlan } = input;
  if (projectSwitchPlan.status === "none") return {};
  if (projectSwitchPlan.status === "unavailable") {
    input.recordRuntimeEvent(projectSwitchPlan.event);
    throw new Error(projectSwitchPlan.message);
  }

  const runtimeEvent = input.recordRuntimeEvent(projectSwitchPlan.event);
  const projectSwitch: MessagingRemoteSurfaceCommandPendingProjectSwitch = {
    ...projectSwitchPlan.projectSwitch,
    runtimeEventId: runtimeEvent.id,
  };
  if (projectSwitchPlan.deferProjectSwitch) {
    input.storePendingProjectSwitch(projectSwitch);
    return {};
  }

  await input.completeProjectSwitch(projectSwitch);
  return { completedProjectSwitch: projectSwitchPlan.targetProject };
}

export async function completeMessagingRemoteSurfaceCommandPendingProjectSwitch(
  input: MessagingRemoteSurfaceCommandPendingProjectSwitchCompletionOptions,
): Promise<"completed" | "failed"> {
  const { projectSwitch } = input;
  const now = input.now ?? (() => new Date().toISOString());
  if (!input.switchProject) {
    const message = "Ambient active project switching is not available in this runtime.";
    input.updateRuntimeEvent(projectSwitch.runtimeEventId, messagingRemoteSurfaceCommandSwitchProjectUnavailablePatch({
      message,
      failedAt: now(),
    }));
    if (input.throwOnFailure) throw new Error(message);
    return "failed";
  }
  try {
    await input.switchProject({
      workspacePath: projectSwitch.workspacePath,
      reason: projectSwitch.reason,
    });
    input.updateRuntimeEvent(projectSwitch.runtimeEventId, messagingRemoteSurfaceCommandSwitchProjectCompletedPatch({
      projectName: projectSwitch.projectName,
      completedAt: now(),
    }));
    return "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.updateRuntimeEvent(projectSwitch.runtimeEventId, messagingRemoteSurfaceCommandSwitchProjectFailedPatch({
      projectName: projectSwitch.projectName,
      message,
      failedAt: now(),
    }));
    if (input.threadId && input.workspacePath) {
      input.emitError?.({
        message,
        threadId: input.threadId,
        workspacePath: input.workspacePath,
      });
    }
    if (input.throwOnFailure) throw new Error(message);
    return "failed";
  }
}

export function finalizeMessagingRemoteSurfaceCommandPendingProjectSwitchAfterRun(
  input: MessagingRemoteSurfaceCommandPendingProjectSwitchAfterRunOptions,
): MessagingRemoteSurfaceCommandPendingProjectSwitchAfterRunResult {
  const { projectSwitch } = input;
  if (!projectSwitch) return "none";
  if (!input.shouldEmitQueueClear) {
    const now = input.now ?? (() => new Date().toISOString());
    input.updateRuntimeEvent(projectSwitch.runtimeEventId, messagingRemoteSurfaceCommandSwitchProjectCanceledPatch({
      canceledAt: now(),
    }));
    return "canceled";
  }
  input.scheduleCompletion(projectSwitch);
  return "scheduled";
}

export function messagingRemoteSurfaceCommandCreatedResourceRefs(
  input: MessagingRemoteSurfaceCommandCreatedResourceRefsInput,
): MessagingRemoteSurfaceCommandCreatedResourceRefs {
  return {
    ...(input.createdProject ? { createdProjectPath: input.createdProject.path } : {}),
    ...(input.createdChatThread ? { createdChatThreadId: input.createdChatThread.id } : {}),
    ...(input.createdWorkflowThread ? { createdWorkflowThreadId: input.createdWorkflowThread.id } : {}),
  };
}

export function messagingRemoteSurfaceCommandApplyBindingPlan(
  input: MessagingRemoteSurfaceCommandCreatedScopeBindingUpdateOptions,
): MessagingRemoteSurfaceCommandApplyBindingPlan {
  const initialBindingUpdate = messagingRemoteSurfaceCommandBindingUpdate(input.preview);
  return {
    ...(initialBindingUpdate ? { initialBindingUpdate } : {}),
    createdScopeBindingUpdates: messagingRemoteSurfaceCommandCreatedScopeBindingUpdates(input),
  };
}

export function messagingRemoteSurfaceCommandApplyBindingUpdates(
  input: MessagingRemoteSurfaceCommandApplyBindingUpdatesOptions,
): MessagingBindingDescriptor | undefined {
  let updatedBinding = input.bindingPlan.initialBindingUpdate
    ? input.updateRemoteSurfaceScope(input.bindingPlan.initialBindingUpdate)
    : undefined;
  for (const createdScopeUpdate of input.bindingPlan.createdScopeBindingUpdates) {
    updatedBinding = input.updateRemoteSurfaceScope(createdScopeUpdate);
  }
  return updatedBinding;
}

export function messagingRemoteSurfaceCommandApplyCreatePlan(
  preview: MessagingRemoteSurfaceCommandPreview,
): MessagingRemoteSurfaceCommandApplyCreatePlan {
  const projectCreateRequest = messagingRemoteSurfaceCommandProjectCreateRequest(preview);
  const createChatTitle = messagingRemoteSurfaceCommandChatCreateTitle(preview);
  const workflowCreateRequest = messagingRemoteSurfaceCommandWorkflowCreateRequest(preview);
  return {
    ...(projectCreateRequest ? { projectCreateRequest } : {}),
    ...(createChatTitle ? { createChatTitle } : {}),
    ...(workflowCreateRequest ? { workflowCreateRequest } : {}),
  };
}

export async function messagingRemoteSurfaceCommandApplyCreatedResources(
  input: MessagingRemoteSurfaceCommandApplyCreatedResourcesOptions,
): Promise<MessagingRemoteSurfaceCommandCreatedResourceRefs> {
  const { createPlan } = input;
  let createdProject: { path: string } | undefined;
  if (createPlan.projectCreateRequest) {
    if (!input.createProject) throw new Error("Ambient project creation is not available in this runtime.");
    createdProject = await input.createProject(createPlan.projectCreateRequest);
  }
  const createdChatThread = createPlan.createChatTitle
    ? input.createChatThread(createPlan.createChatTitle, input.defaultProjectPath)
    : undefined;
  const createdWorkflowThread = createPlan.workflowCreateRequest
    ? input.createWorkflowAgentThreadSummary(messagingRemoteSurfaceCommandWorkflowThreadCreateSummaryInput({
      workflowCreateRequest: createPlan.workflowCreateRequest,
      defaultProjectPath: input.defaultProjectPath,
    }))
    : undefined;
  return messagingRemoteSurfaceCommandCreatedResourceRefs({
    ...(createdProject ? { createdProject } : {}),
    ...(createdChatThread ? { createdChatThread } : {}),
    ...(createdWorkflowThread ? { createdWorkflowThread } : {}),
  });
}

export function messagingRemoteSurfaceCommandWorkflowThreadCreateSummaryInput(input: {
  workflowCreateRequest: NonNullable<ReturnType<typeof messagingRemoteSurfaceCommandWorkflowCreateRequest>>;
  defaultProjectPath: string;
}): MessagingRemoteSurfaceCommandWorkflowThreadCreateSummaryInput {
  const { workflowCreateRequest } = input;
  return {
    ...(workflowCreateRequest.title ? { title: workflowCreateRequest.title } : {}),
    initialRequest: workflowCreateRequest.initialRequest,
    projectPath: workflowCreateRequest.projectPath ?? input.defaultProjectPath,
    traceMode: "production",
    phase: "discovery",
  };
}

export function messagingRemoteSurfaceCommandApplySideEffectPlan(
  preview: MessagingRemoteSurfaceCommandPreview,
): MessagingRemoteSurfaceCommandApplySideEffectPlan {
  const workflowAnswerInput = messagingRemoteSurfaceCommandWorkflowAnswerInput(preview);
  const workflowActionRequest = messagingRemoteSurfaceCommandWorkflowActionRequest(preview);
  const approvalResponse = messagingRemoteSurfaceCommandApprovalResponse(preview);
  const grantRevoke = messagingRemoteSurfaceCommandGrantRevokeRequest(preview);
  const settingUpdateRequest = messagingRemoteSurfaceCommandSettingUpdateRequest(preview);
  return {
    ...(workflowAnswerInput ? { workflowAnswerInput } : {}),
    ...(workflowActionRequest ? { workflowActionRequest } : {}),
    ...(approvalResponse ? { approvalResponse } : {}),
    ...(grantRevoke ? { grantRevoke } : {}),
    ...(settingUpdateRequest ? { settingUpdateRequest } : {}),
  };
}

export async function messagingRemoteSurfaceCommandApplyRuntimeSideEffects<TPermissionGrant = unknown>(
  options: MessagingRemoteSurfaceCommandApplyRuntimeSideEffectsOptions<TPermissionGrant>,
): Promise<MessagingRemoteSurfaceCommandApplyRuntimeSideEffectsResult> {
  const { sideEffectPlan } = options;
  const workflowAnswerResult = sideEffectPlan.workflowAnswerInput
    ? await options.answerWorkflowDiscoveryQuestion(sideEffectPlan.workflowAnswerInput)
    : undefined;
  const answeredQuestion = sideEffectPlan.workflowAnswerInput
    ? options.getWorkflowDiscoveryQuestion(sideEffectPlan.workflowAnswerInput.questionId)
    : undefined;
  const workflowActionResult = sideEffectPlan.workflowActionRequest
    ? await options.applyWorkflowAction(sideEffectPlan.workflowActionRequest)
    : undefined;

  const approvalResponse = sideEffectPlan.approvalResponse;
  if (approvalResponse) {
    if (!options.respondToPermissionPrompt) {
      throw new Error("Ambient permission prompt responses are not available in this runtime.");
    }
    options.respondToPermissionPrompt(approvalResponse.requestId, approvalResponse.response);
  }

  const grantRevoke = sideEffectPlan.grantRevoke;
  if (grantRevoke) {
    const revokedGrant = options.revokePermissionGrant(grantRevoke.grantId);
    options.onPermissionGrantRevoked(revokedGrant);
  }
  const updatedSetting = sideEffectPlan.settingUpdateRequest
    ? await options.applySettingUpdate(sideEffectPlan.settingUpdateRequest)
    : undefined;

  return {
    ...(answeredQuestion ? { answeredQuestion } : {}),
    ...(workflowAnswerResult ? { workflowAnswerResult } : {}),
    ...(workflowActionResult ? { workflowActionResult } : {}),
    ...(approvalResponse ? { approvalResponse } : {}),
    ...(grantRevoke ? { grantRevoke } : {}),
    ...(updatedSetting ? { updatedSetting } : {}),
  };
}

export async function messagingRemoteSurfaceCommandApplyWorkflowAction(
  options: MessagingRemoteSurfaceCommandWorkflowActionApplyOptions,
): Promise<MessagingRemoteSurfaceWorkflowActionResult> {
  const { input } = options;
  const before = options.getWorkflowThreadSummary(input.workflowThreadId);
  if (input.action === "run_exploration") {
    if (!options.workflowAgents?.runExploration) {
      throw new Error("Ambient Workflow Agent exploration is not available in this runtime.");
    }
    const result = await options.workflowAgents.runExploration({
      workflowThreadId: input.workflowThreadId,
      reason: input.reason,
    });
    options.onWorkflowUpdated();
    return {
      action: "run_exploration",
      workflowThreadId: result.thread.id,
      workflowTitle: result.thread.title,
      changed: true,
      ...(result.traceId ? { traceId: result.traceId } : {}),
      ...(result.graphSnapshotId ? { graphSnapshotId: result.graphSnapshotId } : {}),
      text: result.text ?? [
        "Workflow Agent exploration completed",
        `Workflow: ${result.thread.title} (${result.thread.id})`,
        `Phase: ${before.phase} -> ${result.thread.phase}`,
        result.traceId ? `Trace: ${result.traceId}` : undefined,
        result.graphSnapshotId ? `Graph snapshot: ${result.graphSnapshotId}` : undefined,
        input.reason ? `Reason: ${input.reason}` : undefined,
      ].filter(Boolean).join("\n"),
    };
  }

  if (input.action === "compile_preview") {
    if (!options.workflowAgents?.compilePreview) {
      throw new Error("Ambient Workflow Agent compile preview is not available in this runtime.");
    }
    const result = await options.workflowAgents.compilePreview({
      workflowThreadId: input.workflowThreadId,
      reason: input.reason,
    });
    options.onWorkflowUpdated();
    return {
      action: "compile_preview",
      workflowThreadId: result.thread.id,
      workflowTitle: result.thread.title,
      changed: true,
      ...(result.artifactId ? { artifactId: result.artifactId } : {}),
      ...(result.runId ? { runId: result.runId } : {}),
      text: result.text ?? [
        "Workflow Agent compile preview completed",
        `Workflow: ${result.thread.title} (${result.thread.id})`,
        `Phase: ${before.phase} -> ${result.thread.phase}`,
        result.artifactId ? `Artifact: ${result.artifactId}` : undefined,
        result.runId ? `Run: ${result.runId}` : undefined,
        input.reason ? `Reason: ${input.reason}` : undefined,
      ].filter(Boolean).join("\n"),
    };
  }

  if (input.action === "approve_artifact" || input.action === "reject_artifact") {
    if (!input.artifactId) throw new Error("Workflow preview review requires an artifact id.");
    if (!options.workflowAgents?.reviewArtifact) {
      throw new Error("Ambient Workflow Agent artifact review is not available in this runtime.");
    }
    const decision = input.action === "approve_artifact" ? "approved" : "rejected";
    const result = await options.workflowAgents.reviewArtifact({
      workflowThreadId: input.workflowThreadId,
      artifactId: input.artifactId,
      decision,
      reason: input.reason,
    });
    options.onWorkflowUpdated();
    return {
      action: input.action,
      workflowThreadId: result.thread.id,
      workflowTitle: result.thread.title,
      changed: result.changed,
      artifactId: result.artifactId,
      artifactStatus: result.artifactStatus,
      text: result.text ?? [
        decision === "approved" ? "Workflow preview approved" : "Workflow preview rejected",
        `Workflow: ${result.thread.title} (${result.thread.id})`,
        `Artifact: ${result.artifactId}`,
        `Artifact status: ${result.artifactStatus}`,
        `Changed: ${result.changed ? "yes" : "no"}`,
        input.reason ? `Reason: ${input.reason}` : undefined,
      ].filter(Boolean).join("\n"),
    };
  }

  if (input.action === "retry_failed_step" || input.action === "resume_checkpoint" || input.action === "skip_failed_item") {
    if (!input.runId || !input.eventId || !input.recoveryAction) {
      throw new Error("Workflow recovery requires a run id, event id, and recovery action.");
    }
    if (!options.workflowAgents?.recoverRun) {
      throw new Error("Ambient Workflow Agent run recovery is not available in this runtime.");
    }
    const result = await options.workflowAgents.recoverRun({
      workflowThreadId: input.workflowThreadId,
      runId: input.runId,
      eventId: input.eventId,
      action: input.recoveryAction,
      ...(input.graphNodeId ? { graphNodeId: input.graphNodeId } : {}),
      ...(input.itemKey ? { itemKey: input.itemKey } : {}),
      reason: input.reason,
    });
    options.onWorkflowUpdated();
    return {
      action: input.action,
      workflowThreadId: result.thread.id,
      workflowTitle: result.thread.title,
      changed: result.changed,
      runId: result.runId,
      ...(result.runStatus ? { runStatus: result.runStatus } : {}),
      text: result.text ?? [
        "Workflow recovery requested",
        `Workflow: ${result.thread.title} (${result.thread.id})`,
        `Source run: ${input.runId}`,
        `Source event: ${input.eventId}`,
        `Recovery action: ${input.recoveryAction}`,
        `New run: ${result.runId}`,
        result.runStatus ? `New run status: ${result.runStatus}` : undefined,
        `Changed: ${result.changed ? "yes" : "no"}`,
        input.reason ? `Reason: ${input.reason}` : undefined,
      ].filter(Boolean).join("\n"),
    };
  }

  if (!input.runId) throw new Error("Workflow cancellation requires a run id.");
  if (!options.workflowAgents?.cancelRun) {
    throw new Error("Ambient Workflow Agent run cancellation is not available in this runtime.");
  }
  const result = await options.workflowAgents.cancelRun({
    workflowThreadId: input.workflowThreadId,
    runId: input.runId,
    reason: input.reason,
  });
  options.onWorkflowUpdated();
  return {
    action: "cancel_run",
    workflowThreadId: result.thread.id,
    workflowTitle: result.thread.title,
    changed: result.changed,
    runId: result.runId,
    ...(result.runStatus ? { runStatus: result.runStatus } : {}),
    text: result.text ?? [
      "Workflow cancellation requested",
      `Workflow: ${result.thread.title} (${result.thread.id})`,
      `Run: ${result.runId}`,
      result.runStatus ? `Run status: ${result.runStatus}` : undefined,
      `Changed: ${result.changed ? "yes" : "no"}`,
      input.reason ? `Reason: ${input.reason}` : undefined,
    ].filter(Boolean).join("\n"),
  };
}

export async function messagingRemoteSurfaceCommandApplySettingUpdate(
  options: MessagingRemoteSurfaceCommandSettingUpdateApplyOptions,
): Promise<MessagingRemoteSurfaceSettingUpdateResult> {
  const { input, threadId, workspacePath } = options;
  const thread = options.getThread(threadId);
  if (thread.collaborationMode === "planner") throw new Error("Remote Ambient Surface settings changes are blocked in Planner Mode.");

  if (input.operation === "thread_settings") {
    const targetThreadId = input.threadId?.trim() || threadId;
    const current = options.getThread(targetThreadId);
    const next: Partial<Pick<ThreadSummary, "collaborationMode" | "thinkingLevel">> = {};
    if (input.field === "collaborationMode" && (input.value === "agent" || input.value === "planner")) {
      next.collaborationMode = input.value as CollaborationMode;
    } else if (input.field === "thinkingLevel" && (input.value === "minimal" || input.value === "low" || input.value === "medium" || input.value === "high" || input.value === "xhigh")) {
      next.thinkingLevel = input.value as ThinkingLevel;
    } else {
      throw new Error(`Unsupported thread settings command: ${input.field ?? "unknown field"}.`);
    }

    const changed = (next.collaborationMode !== undefined && next.collaborationMode !== current.collaborationMode)
      || (next.thinkingLevel !== undefined && next.thinkingLevel !== current.thinkingLevel);
    if (!changed) {
      return {
        settingKey: "thread",
        operation: "thread_settings",
        changed: false,
        text: [
          "Ambient chat thread settings already configured",
          `Thread: ${current.title} (${current.id})`,
          `Mode: ${current.collaborationMode}`,
          `Thinking level: ${current.thinkingLevel}`,
          "No settings were changed.",
        ].join("\n"),
        previousSummary: threadSettingsSummary(current),
        nextSummary: threadSettingsSummary(current),
      };
    }

    const updated = options.updateThreadSettings(targetThreadId, next);
    options.onThreadUpdated(updated);
    return {
      settingKey: "thread",
      operation: "thread_settings",
      changed: true,
      text: [
        "Ambient chat thread settings updated",
        `Thread: ${updated.title} (${updated.id})`,
        next.collaborationMode !== undefined ? `Mode: ${current.collaborationMode} -> ${updated.collaborationMode}` : undefined,
        next.thinkingLevel !== undefined ? `Thinking level: ${current.thinkingLevel} -> ${updated.thinkingLevel}` : undefined,
        input.reason ? `Reason: ${input.reason}` : undefined,
      ].filter(Boolean).join("\n"),
      previousSummary: threadSettingsSummary(current),
      nextSummary: threadSettingsSummary(updated),
    };
  }

  if (input.operation === "voice_policy") {
    const current = options.voice?.readSettings();
    if (!current || !options.voice?.updateSettings) throw new Error("Ambient voice settings updates are not available in this runtime.");
    const voiceInput: VoicePolicyInput = { reason: input.reason };
    if (input.field === "enabled" && typeof input.value === "boolean") voiceInput.enabled = input.value;
    else if (input.field === "autoplay" && typeof input.value === "boolean") voiceInput.autoplay = input.value;
    else if (input.field === "mode" && typeof input.value === "string") voiceInput.mode = input.value as VoicePolicyInput["mode"];
    else if (input.field === "longReply" && typeof input.value === "string") voiceInput.longReply = input.value as VoicePolicyInput["longReply"];
    else if (input.field === "maxChars" && typeof input.value === "number") voiceInput.maxChars = input.value;
    else throw new Error(`Unsupported voice settings command: ${input.field ?? "unknown field"}.`);

    const plan = planVoicePolicyUpdate(voiceInput, current);
    if (!plan.hasChanges) {
      return {
        settingKey: "voice",
        operation: "voice_policy",
        changed: false,
        text: voicePolicyNoopText(plan),
        previousSummary: voiceSettingsSummary(plan.previousSettings),
        nextSummary: voiceSettingsSummary(plan.nextSettings),
      };
    }
    const savedSettings = await options.voice.updateSettings(plan.nextSettings, {
      source: "chat-tool",
      toolName: "ambient_messaging_remote_surface_command_apply",
      threadId,
      summary: "Remote Ambient Surface updated voice policy settings.",
    });
    options.voice.onStateUpdated?.();
    return {
      settingKey: "voice",
      operation: "voice_policy",
      changed: true,
      text: voicePolicyText(plan, savedSettings),
      previousSummary: voiceSettingsSummary(plan.previousSettings),
      nextSummary: voiceSettingsSummary(savedSettings),
    };
  }

  if (input.operation === "stt_policy") {
    const current = options.stt?.readSettings();
    if (!current || !options.stt?.updateSettings) throw new Error("Ambient STT settings updates are not available in this runtime.");
    const sttInput: SttPolicyInput = { reason: input.reason };
    if (input.field === "enabled" && typeof input.value === "boolean") sttInput.enabled = input.value;
    else if (input.field === "spokenLanguage" && typeof input.value === "string") sttInput.spokenLanguage = input.value;
    else if (input.field === "autoSendAfterTranscription" && typeof input.value === "boolean") sttInput.autoSendAfterTranscription = input.value;
    else if (input.field === "silenceFinalizeSeconds" && typeof input.value === "number") sttInput.silenceFinalizeSeconds = input.value;
    else if (input.field === "noSpeechGateEnabled" && typeof input.value === "boolean") sttInput.noSpeechGateEnabled = input.value;
    else if (input.field === "noSpeechGateRmsThresholdDbfs" && typeof input.value === "number") sttInput.noSpeechGateRmsThresholdDbfs = input.value;
    else if (input.field === "stopTtsOnSpeech" && typeof input.value === "boolean") sttInput.stopTtsOnSpeech = input.value;
    else if (input.field === "queueWhileAgentRuns" && typeof input.value === "boolean") sttInput.queueWhileAgentRuns = input.value;
    else throw new Error(`Unsupported STT settings command: ${input.field ?? "unknown field"}.`);

    const providers = await Promise.resolve(options.listSttProviders(workspacePath)).catch(() => []);
    const plan = planSttPolicyUpdate(sttInput, current, providers);
    if (!plan.hasChanges) {
      return {
        settingKey: "stt",
        operation: "stt_policy",
        changed: false,
        text: sttPolicyNoopText(plan),
        previousSummary: sttSettingsSummary(plan.previousSettings),
        nextSummary: sttSettingsSummary(plan.nextSettings),
      };
    }
    const savedSettings = await options.stt.updateSettings(plan.nextSettings);
    return {
      settingKey: "stt",
      operation: "stt_policy",
      changed: true,
      text: sttPolicyText(plan, savedSettings),
      previousSummary: sttSettingsSummary(plan.previousSettings),
      nextSummary: sttSettingsSummary(savedSettings),
    };
  }

  if (input.operation === "media_playback") {
    const current = options.media?.readSettings();
    if (!current || !options.media?.updateSettings) throw new Error("Ambient media playback settings updates are not available in this runtime.");
    if (input.field !== "generatedMediaAutoplay" || typeof input.value !== "boolean") {
      throw new Error(`Unsupported media playback settings command: ${input.field ?? "unknown field"}.`);
    }
    const nextSettings: UpdateMediaPlaybackSettingsInput = {
      ...current,
      generatedMediaAutoplay: input.value,
    };
    if (current.generatedMediaAutoplay === nextSettings.generatedMediaAutoplay) {
      return {
        settingKey: "media",
        operation: "media_playback",
        changed: false,
        text: [
          "Ambient generated media playback already configured",
          `Generated media autoplay: ${current.generatedMediaAutoplay}`,
          "No settings were changed and no approval was required.",
        ].join("\n"),
        previousSummary: mediaPlaybackSettingsSummary(current),
        nextSummary: mediaPlaybackSettingsSummary(current),
      };
    }
    const savedSettings = await options.media.updateSettings(nextSettings);
    return {
      settingKey: "media",
      operation: "media_playback",
      changed: true,
      text: [
        "Ambient generated media playback updated",
        `Generated media autoplay: ${current.generatedMediaAutoplay} -> ${savedSettings.generatedMediaAutoplay}`,
        input.reason ? `Reason: ${input.reason}` : undefined,
      ].filter(Boolean).join("\n"),
      previousSummary: mediaPlaybackSettingsSummary(current),
      nextSummary: mediaPlaybackSettingsSummary(savedSettings),
    };
  }

  if (input.operation === "planner_finalization") {
    const current = options.planner?.readSettings?.();
    if (!current || !options.planner?.updateSettings) throw new Error("Ambient Planner settings updates are not available in this runtime.");
    if (input.field !== "autoFinalize" || typeof input.value !== "boolean") {
      throw new Error(`Unsupported Planner settings command: ${input.field ?? "unknown field"}.`);
    }
    const nextSettings: UpdatePlannerSettingsInput = {
      ...current,
      autoFinalize: input.value,
    };
    if (current.autoFinalize === nextSettings.autoFinalize) {
      return {
        settingKey: "planner",
        operation: "planner_finalization",
        changed: false,
        text: [
          "Ambient Planner finalization already configured",
          `Auto-finalize: ${current.autoFinalize}`,
          "No settings were changed.",
        ].join("\n"),
        previousSummary: plannerSettingsSummary(current),
        nextSummary: plannerSettingsSummary(current),
      };
    }
    const savedSettings = await options.planner.updateSettings(nextSettings);
    return {
      settingKey: "planner",
      operation: "planner_finalization",
      changed: true,
      text: [
        "Ambient Planner finalization updated",
        `Auto-finalize: ${current.autoFinalize} -> ${savedSettings.autoFinalize}`,
        input.reason ? `Reason: ${input.reason}` : undefined,
      ].filter(Boolean).join("\n"),
      previousSummary: plannerSettingsSummary(current),
      nextSummary: plannerSettingsSummary(savedSettings),
    };
  }

  const current = options.search?.readSettings() ?? {};
  if (!options.search?.updateSettings) throw new Error("Ambient search preference updates are not available in this runtime.");
  const catalog = await options.discoverAmbientCliPackages(workspacePath, { includeHealth: true }).catch(() => ({ packages: [], errors: [] }));
  const searchInput: SearchPreferenceUpdateInput = input.clear
    ? { clear: true, reason: input.reason }
    : {
      providerAlias: input.providerAlias,
      mode: input.mode,
      fallback: input.fallback,
      reason: input.reason,
    };
  const plan = planSearchPreferenceUpdate(searchInput, current, catalog);
  if (!plan.hasChanges) {
    return {
      settingKey: "search",
      operation: "search_preference",
      changed: false,
      text: searchPreferenceUpdateText(plan, current),
      previousSummary: searchSettingsSummary(plan.previousSettings),
      nextSummary: searchSettingsSummary(plan.nextSettings),
    };
  }
  const savedSettings = await options.search.updateSettings(plan.nextSettings);
  return {
    settingKey: "search",
    operation: "search_preference",
    changed: true,
    text: searchPreferenceUpdateText(plan, savedSettings),
    previousSummary: searchSettingsSummary(plan.previousSettings),
    nextSummary: searchSettingsSummary(savedSettings),
  };
}

export function messagingRemoteSurfaceCommandCreatedScopeBindingUpdates(
  input: MessagingRemoteSurfaceCommandCreatedScopeBindingUpdateOptions,
): MessagingRemoteSurfaceCommandBindingUpdate[] {
  const { preview } = input;
  if (!preview.binding) return [];
  const base = {
    bindingId: preview.binding.id,
    reason: `remote-surface-command:${preview.commandKind}`,
  };
  return [
    ...(input.createdProjectPath ? [{
      ...base,
      ambientSurface: "projects" as const,
      projectId: input.createdProjectPath,
    }] : []),
    ...(input.createdChatThreadId ? [{
      ...base,
      ambientSurface: "chat" as const,
      chatThreadId: input.createdChatThreadId,
    }] : []),
    ...(input.createdWorkflowThreadId ? [{
      ...base,
      ambientSurface: "workflow_agents" as const,
      workflowId: input.createdWorkflowThreadId,
    }] : []),
  ];
}

export function messagingRemoteSurfaceCommandApplyResultOptions(
  input: MessagingRemoteSurfaceCommandApplyResultOptionsInput,
): MessagingRemoteSurfaceCommandApplyResultResponseOptions {
  return {
    preview: input.preview,
    bindings: input.bindings,
    surface: input.surface,
    approvalRecorded: input.approvalRecorded,
    ...(input.updatedBinding ? { updatedBinding: input.updatedBinding } : {}),
    ...(input.preview.commandKind === "switch_project" && input.preview.targetProject && !input.completedProjectSwitch
      ? { scheduledProjectSwitch: input.preview.targetProject }
      : {}),
    ...(input.completedProjectSwitch ? { completedProjectSwitch: input.completedProjectSwitch } : {}),
    ...(input.createdProjectPath ? { createdProjectPath: input.createdProjectPath } : {}),
    ...(input.createdChatThreadId ? { createdChatThreadId: input.createdChatThreadId } : {}),
    ...(input.createdWorkflowThreadId ? { createdWorkflowThreadId: input.createdWorkflowThreadId } : {}),
    ...(input.answeredQuestion ? { answeredQuestion: input.answeredQuestion } : {}),
    ...(input.workflowAnswerResult ? { workflowAnswerResult: input.workflowAnswerResult } : {}),
    ...(input.workflowActionResult ? { workflowActionResult: input.workflowActionResult } : {}),
    ...(input.approvalResponse ? { approvalResponse: input.approvalResponse } : {}),
    ...(input.grantRevoke ? { grantRevoke: input.grantRevoke } : {}),
    ...(input.updatedSetting ? { updatedSetting: input.updatedSetting } : {}),
  };
}

export function messagingRemoteSurfaceCommandApplyResultResponse(
  input: MessagingRemoteSurfaceCommandApplyResultResponseOptions,
): ReturnType<typeof messagingRemoteSurfaceCommandApplyToolResponse> {
  const projection = messagingRemoteSurfaceCommandResultProjection({
    preview: input.preview,
    bindings: input.bindings,
    surface: input.surface,
  });
  const createdChat = input.createdChatThreadId
    ? input.surface.chats.find((chat) => chat.id === input.createdChatThreadId)
    : undefined;
  const createdProject = input.createdProjectPath
    ? input.surface.projects.find((project) => project.path === input.createdProjectPath)
    : undefined;
  const createdWorkflow = input.createdWorkflowThreadId
    ? input.surface.workflowAgents.find((workflow) => workflow.id === input.createdWorkflowThreadId)
    : undefined;
  const result = messagingRemoteSurfaceCommandAppliedResult({
    preview: input.preview,
    approvalRecorded: input.approvalRecorded,
    ...(input.updatedBinding ? { updatedBinding: input.updatedBinding } : {}),
    ...(input.scheduledProjectSwitch ? { scheduledProjectSwitch: input.scheduledProjectSwitch } : {}),
    ...(input.completedProjectSwitch ? { completedProjectSwitch: input.completedProjectSwitch } : {}),
    ...(createdProject ? { createdProject } : {}),
    ...(createdChat ? { createdChat } : {}),
    ...(createdWorkflow ? { createdWorkflow } : {}),
    ...(input.answeredQuestion ? { answeredQuestion: input.answeredQuestion } : {}),
    ...(input.workflowActionResult ? { workflowActionResult: input.workflowActionResult } : {}),
    ...(input.approvalResponse ? { respondedApproval: input.approvalResponse } : {}),
    ...(input.grantRevoke ? { revokedPermissionGrant: input.grantRevoke } : {}),
    ...(input.updatedSetting ? { updatedSetting: input.updatedSetting } : {}),
    ...(projection ? { projection } : {}),
  });
  return messagingRemoteSurfaceCommandApplyToolResponse(result, {
    ...(input.workflowAnswerResult ? { workflowAnswerResult: input.workflowAnswerResult } : {}),
    ...(input.workflowActionResult ? { workflowActionResult: input.workflowActionResult } : {}),
    ...(input.approvalResponse ? { approvalResponseResult: input.approvalResponse } : {}),
    ...(input.grantRevoke ? { permissionGrantRevokeResult: input.grantRevoke } : {}),
    ...(input.updatedSetting ? { settingUpdateResult: input.updatedSetting } : {}),
  });
}

export function messagingRemoteSurfaceCommandApplyPermissionRequest<TThread, TWorkspace>(input: {
  thread: TThread;
  workspace: TWorkspace;
  preview: MessagingRemoteSurfaceCommandPreview;
}): MessagingRemoteSurfaceCommandApplyPermissionRequest<TThread, TWorkspace> {
  const { thread, workspace, preview } = input;
  return {
    thread,
    workspace,
    toolName: "ambient_messaging_remote_surface_command_apply",
    title: "Apply Remote Ambient Surface command?",
    message: `Apply ${preview.commandKind} from queued projection ${preview.queuedProjectionId}.`,
    detail: messagingRemoteSurfaceCommandApprovalDetail(preview),
    risk: "plugin-tool",
    reusableScopes: ["thread"],
    grantTargetLabel: `remote-surface-command:${preview.queuedProjectionId}`,
    grantTargetIdentity: `${preview.queuedProjectionId}:${preview.commandKind}:${preview.textPreview}`,
    allowedReason: "User approved Remote Ambient Surface command apply.",
    deniedReason: "User denied Remote Ambient Surface command apply.",
  };
}

export function messagingRemoteSurfaceCommandSwitchProjectUnavailableEvent(input: {
  preview: MessagingRemoteSurfaceCommandPreview;
  threadId: string;
  message: string;
  failedAt: string;
}): RemoteSurfaceRuntimeEventCreateInput {
  const { preview } = input;
  if (preview.commandKind !== "switch_project" || !preview.targetProject) {
    throw new Error("Switch project preview with a target project is required.");
  }
  return {
    kind: "active_project_switch",
    status: "failed",
    title: `Switch to ${preview.targetProject.name}`,
    summary: input.message,
    threadId: input.threadId,
    queuedProjectionId: preview.queuedProjectionId,
    ...(preview.queuedProjection?.sourceEventId ? { sourceEventId: preview.queuedProjection.sourceEventId } : {}),
    ...(preview.binding?.id ? { bindingId: preview.binding.id } : {}),
    projectName: preview.targetProject.name,
    failedAt: input.failedAt,
    error: input.message,
    relaySuggested: true,
  };
}

export function messagingRemoteSurfaceCommandSwitchProjectPendingEvent(input: {
  preview: MessagingRemoteSurfaceCommandPreview;
  threadId: string;
  deferProjectSwitch: boolean;
}): RemoteSurfaceRuntimeEventCreateInput {
  const { preview } = input;
  if (preview.commandKind !== "switch_project" || !preview.targetProject) {
    throw new Error("Switch project preview with a target project is required.");
  }
  return {
    kind: "active_project_switch",
    status: "pending",
    title: `Switch to ${preview.targetProject.name}`,
    summary: input.deferProjectSwitch
      ? `Active Ambient project switch to ${preview.targetProject.name} is scheduled after the current Pi turn finishes.`
      : `Active Ambient project switch to ${preview.targetProject.name} is being applied now.`,
    threadId: input.threadId,
    queuedProjectionId: preview.queuedProjectionId,
    ...(preview.queuedProjection?.sourceEventId ? { sourceEventId: preview.queuedProjection.sourceEventId } : {}),
    ...(preview.binding?.id ? { bindingId: preview.binding.id } : {}),
    projectName: preview.targetProject.name,
    relaySuggested: false,
  };
}

export function messagingRemoteSurfaceCommandSwitchProjectUnavailablePatch(input: {
  message: string;
  failedAt: string;
}): RemoteSurfaceRuntimeEventPatchInput {
  return {
    status: "failed",
    summary: "Active Ambient project switch failed because this runtime does not expose project switching.",
    failedAt: input.failedAt,
    error: input.message,
    relaySuggested: true,
  };
}

export function messagingRemoteSurfaceCommandSwitchProjectCompletedPatch(input: {
  projectName?: string;
  completedAt: string;
}): RemoteSurfaceRuntimeEventPatchInput {
  return {
    status: "completed",
    summary: input.projectName
      ? `Active Ambient project switched to ${input.projectName}.`
      : "Active Ambient project switch completed.",
    completedAt: input.completedAt,
    relaySuggested: true,
  };
}

export function messagingRemoteSurfaceCommandSwitchProjectFailedPatch(input: {
  projectName?: string;
  message: string;
  failedAt: string;
}): RemoteSurfaceRuntimeEventPatchInput {
  return {
    status: "failed",
    summary: input.projectName
      ? `Active Ambient project switch to ${input.projectName} failed.`
      : "Active Ambient project switch failed.",
    failedAt: input.failedAt,
    error: input.message,
    relaySuggested: true,
  };
}

export function messagingRemoteSurfaceCommandSwitchProjectCanceledPatch(input: {
  canceledAt: string;
}): RemoteSurfaceRuntimeEventPatchInput {
  return {
    status: "canceled",
    summary: "Active Ambient project switch was canceled because the original runtime workspace was no longer active when the Pi turn finished.",
    canceledAt: input.canceledAt,
    relaySuggested: true,
  };
}

export function messagingRemoteSurfaceCommandApplyToolResponse(
  result: MessagingRemoteSurfaceCommandResult,
  extraDetails: Record<string, unknown> = {},
): {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
} {
  const { status: commandStatus, ...resultDetails } = result;
  return {
    content: [{ type: "text", text: messagingRemoteSurfaceCommandResultText(result) }],
    details: {
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_messaging_remote_surface_command_apply",
      status: result.applyStatus,
      commandStatus,
      ...extraDetails,
      ...resultDetails,
    },
  };
}

function voiceSettingsSummary(settings: VoiceSettings): string {
  return [
    `enabled=${settings.enabled}`,
    `mode=${settings.mode}`,
    `autoplay=${settings.autoplay}`,
    `longReply=${settings.longReply}`,
    `maxChars=${settings.maxChars}`,
    settings.providerCapabilityId ? `provider=${settings.providerCapabilityId}` : "provider=none",
    settings.voiceId ? `voice=${settings.voiceId}` : undefined,
  ].filter(Boolean).join("; ");
}

function searchSettingsSummary(settings: SearchRoutingSettings): string {
  const preference = settings.webSearch;
  if (!preference) return "preference=default";
  return `provider=${preference.preferredProvider}; mode=${preference.mode}; fallback=${preference.fallback}`;
}

function sttSettingsSummary(settings: SttSettings): string {
  return [
    `enabled=${settings.enabled}`,
    `mode=${settings.mode}`,
    `spokenLanguage=${settings.spokenLanguage}`,
    `microphone=${settings.microphone?.label ?? settings.microphone?.deviceId ?? "system-default"}`,
    `autoSendAfterTranscription=${settings.autoSendAfterTranscription}`,
    `silenceFinalizeSeconds=${settings.silenceFinalizeSeconds}`,
    `noSpeechGate=${settings.noSpeechGate.enabled}`,
    `rmsThresholdDbfs=${settings.noSpeechGate.rmsThresholdDbfs}`,
    `stopTtsOnSpeech=${settings.bargeIn.stopTtsOnSpeech}`,
    `queueWhileAgentRuns=${settings.bargeIn.queueWhileAgentRuns}`,
    settings.providerCapabilityId ? `provider=${settings.providerCapabilityId}` : "provider=none",
  ].join("; ");
}

function mediaPlaybackSettingsSummary(settings: MediaPlaybackSettings): string {
  return `generatedMediaAutoplay=${settings.generatedMediaAutoplay}`;
}

function plannerSettingsSummary(settings: PlannerSettings): string {
  return `autoFinalize=${settings.autoFinalize}`;
}

function threadSettingsSummary(thread: ThreadSummary): string {
  return `thread=${thread.title}; id=${thread.id}; mode=${thread.collaborationMode}; thinkingLevel=${thread.thinkingLevel}; model=${thread.model}`;
}
